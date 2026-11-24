//! `decode-audio`: an ADTS stream decoded to raw PCM.

use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;

use mpeg2toh264::audio::{downmix, parse_block, AacDecoder, ChannelLayout, ParsedBlock, PcmFrame};
use mpeg2toh264::container::adts::crc_matches;

use crate::{absolute, fail};

pub const USAGE: &str = "\
Usage: mpeg2toh264 decode-audio [options] <input.adts> <output.f32>
       mpeg2toh264 decode-audio --bench <input.adts>

Decode an AAC-LC ADTS stream to interleaved 32-bit float little-endian PCM
(f32le), full scale 1.0, in the decoder's own channels and their order. An
access unit lost to damage -- broken framing, a CRC mismatch, a block no
decoder accepts -- is concealed: its channels fade out from the frame before.

Options:
      --downmix             Write the stereo mix a receiver plays instead
      --bench               Decode without writing output
      --frames              Print one line per access unit: its index, the
                            byte offset of its frame, what became of it, and
                            the tools a decoded one used (S short windows,
                            M mid/side, I intensity, N noise substitution,
                            T TNS, P pulses)
  -q, --quiet               Do not print the summary
  -h, --help                Show this help

The summary gives the frames decoded and concealed, the layouts, how many
frames used each coding tool, and the decoding time and rate.
";

pub struct Options {
    input: PathBuf,
    output: Option<PathBuf>,
    downmix: bool,
    frames: bool,
    quiet: bool,
}

pub fn parse_args(args: &[String]) -> Option<Options> {
    let mut positional: Vec<&str> = Vec::new();
    let mut bench = false;
    let mut downmix = false;
    let mut frames = false;
    let mut quiet = false;
    for arg in args {
        match arg.as_str() {
            "-h" | "--help" => return None,
            "--bench" => bench = true,
            "--downmix" => downmix = true,
            "--frames" => frames = true,
            "-q" | "--quiet" => quiet = true,
            other if other.starts_with('-') => fail(&format!("unknown option '{other}'")),
            other => positional.push(other),
        }
    }
    let wanted = if bench { 1 } else { 2 };
    if positional.len() != wanted {
        fail(&format!(
            "decode-audio expects {wanted} path(s), got {} positional argument(s)",
            positional.len()
        ));
    }
    let input = absolute(Path::new(positional[0]));
    let output = positional.get(1).map(|path| absolute(Path::new(path)));
    if output.as_ref() == Some(&input) {
        fail("input and output must be different files");
    }
    Some(Options {
        input,
        output,
        downmix,
        frames,
        quiet,
    })
}

/// What became of one access unit.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum Outcome {
    Decoded,
    /// Bytes where a frame was due that are not one: the unit they held is
    /// lost.
    Framing,
    /// A frame whose header is not of a stream this decodes.
    Header,
    Crc,
    /// A block no decoder accepts.
    Syntax,
    /// A block whose channels have no layout.
    Layout,
}

/// The frame length of the ADTS header at `at`, where there is one whose
/// frame fits `data` and is followed by another header or by the end.
fn frame_at(data: &[u8], at: usize) -> Option<usize> {
    let syncword =
        |at: usize| at + 2 <= data.len() && data[at] == 0xff && data[at + 1] & 0xf6 == 0xf0;
    if at + 7 > data.len() || !syncword(at) {
        return None;
    }
    let header_length = if data[at + 1] & 1 != 0 { 7 } else { 9 };
    let length = ((data[at + 3] as usize & 3) << 11)
        | (data[at + 4] as usize) << 3
        | (data[at + 5] >> 5) as usize;
    let end = at + length;
    (length > header_length && end <= data.len() && (end == data.len() || syncword(end)))
        .then_some(length)
}

#[derive(Default)]
struct ToolCounts {
    short_windows: u64,
    mid_side: u64,
    intensity: u64,
    noise: u64,
    tns: u64,
    pulse: u64,
}

pub fn run(options: &Options) -> Result<(), Box<dyn std::error::Error>> {
    let data = std::fs::read(&options.input)?;
    let mut output = match &options.output {
        Some(path) => Some(BufWriter::new(File::create(path)?)),
        None => None,
    };

    let started = Instant::now();
    let mut block = ParsedBlock::new();
    let mut decoder = AacDecoder::new();
    let mut pcm = PcmFrame::new();
    let mut outcomes: BTreeMap<Outcome, u64> = BTreeMap::new();
    let mut layouts: Vec<(ChannelLayout, u64)> = Vec::new();
    let mut tools = ToolCounts::default();
    let mut first_layout_error: Option<String> = None;
    let mut written_channels: Option<usize> = None;
    let mut channel_count_changed = false;
    let mut bytes = Vec::new();
    let mut stereo = (vec![0.0f32; 1024], vec![0.0f32; 1024]);
    let mut units = 0u64;
    let mut at = 0;
    let mut synced = false;

    while at + 7 <= data.len() {
        let unit_start = at;
        let outcome = match frame_at(&data, at) {
            None => {
                // Search for the next frame. Bytes skipped after a frame are
                // one unit lost; before the first, they are only bytes.
                let next = (at + 1..data.len())
                    .find(|&from| frame_at(&data, from).is_some())
                    .unwrap_or(data.len());
                at = next;
                if !synced {
                    continue;
                }
                decoder.conceal(&mut pcm);
                Outcome::Framing
            }
            Some(length) => {
                synced = true;
                let frame = &data[at..at + length];
                at += length;
                let header_length = if frame[1] & 1 != 0 { 7 } else { 9 };
                let object_type = (frame[2] >> 6) + 1;
                let frequency_index = (frame[2] >> 2) & 15;
                let channel_configuration = (frame[2] & 1) << 2 | frame[3] >> 6;
                let raw_blocks = frame[6] & 3;
                if object_type != 2 || raw_blocks != 0 {
                    decoder.conceal(&mut pcm);
                    Outcome::Header
                } else if !parse_block(&frame[header_length..], frequency_index, &mut block) {
                    decoder.conceal(&mut pcm);
                    Outcome::Syntax
                } else if header_length == 9 && !crc_matches(frame, block.elements()) {
                    decoder.conceal(&mut pcm);
                    Outcome::Crc
                } else {
                    match decoder.decode(&block, channel_configuration, frequency_index, &mut pcm) {
                        Ok(()) => {
                            let used = block.tools();
                            tools.short_windows += used.short_windows as u64;
                            tools.mid_side += used.mid_side as u64;
                            tools.intensity += used.intensity as u64;
                            tools.noise += used.noise as u64;
                            tools.tns += used.tns as u64;
                            tools.pulse += used.pulse as u64;
                            Outcome::Decoded
                        }
                        Err(error) => {
                            first_layout_error.get_or_insert_with(|| error.to_string());
                            decoder.conceal(&mut pcm);
                            Outcome::Layout
                        }
                    }
                }
            }
        };
        *outcomes.entry(outcome).or_default() += 1;
        if options.frames {
            let mut flags = String::new();
            if outcome == Outcome::Decoded {
                let used = block.tools();
                for (on, flag) in [
                    (used.short_windows, 'S'),
                    (used.mid_side, 'M'),
                    (used.intensity, 'I'),
                    (used.noise, 'N'),
                    (used.tns, 'T'),
                    (used.pulse, 'P'),
                ] {
                    if on {
                        flags.push(flag);
                    }
                }
            }
            println!("{units} {unit_start} {outcome:?} {flags}");
        }
        units += 1;
        if pcm.channels() == 0 {
            continue;
        }
        match layouts
            .iter_mut()
            .find(|(layout, _)| layout == pcm.layout())
        {
            Some((_, count)) => *count += 1,
            None => layouts.push((pcm.layout().clone(), 1)),
        }
        let Some(output) = output.as_mut() else {
            if options.downmix {
                downmix::to_stereo(&pcm, false, 1.0, &mut stereo.0, &mut stereo.1);
            }
            continue;
        };
        bytes.clear();
        if options.downmix {
            downmix::to_stereo(&pcm, false, 1.0, &mut stereo.0, &mut stereo.1);
            for (l, r) in stereo.0.iter().zip(&stereo.1) {
                bytes.extend_from_slice(&l.to_le_bytes());
                bytes.extend_from_slice(&r.to_le_bytes());
            }
        } else {
            let channels = pcm.channels();
            if written_channels.is_some_and(|written| written != channels) {
                channel_count_changed = true;
            }
            written_channels = Some(channels);
            for i in 0..1024 {
                for channel in 0..channels {
                    bytes.extend_from_slice(&pcm.channel(channel)[i].to_le_bytes());
                }
            }
        }
        output.write_all(&bytes)?;
    }
    if let Some(output) = output.as_mut() {
        output.flush()?;
    }
    let seconds = started.elapsed().as_secs_f64();

    if !options.quiet {
        let count = |outcome| outcomes.get(&outcome).copied().unwrap_or(0);
        let decoded = count(Outcome::Decoded);
        println!(
            "{} -> {}",
            options.input.display(),
            options
                .output
                .as_ref()
                .map_or("(no output)".to_string(), |path| path.display().to_string()),
        );
        println!(
            "{units} access units: {decoded} decoded, {} concealed ({} framing, {} header, \
             {} CRC, {} syntax, {} layout)",
            units - decoded,
            count(Outcome::Framing),
            count(Outcome::Header),
            count(Outcome::Crc),
            count(Outcome::Syntax),
            count(Outcome::Layout),
        );
        if let Some(error) = &first_layout_error {
            println!("first layout failure: {error}");
        }
        for (layout, count) in &layouts {
            println!("  {count} frames {}", layout_name(layout));
        }
        println!(
            "tools in decoded frames: {} short windows, {} M/S, {} intensity, {} PNS, \
             {} TNS, {} pulse",
            tools.short_windows,
            tools.mid_side,
            tools.intensity,
            tools.noise,
            tools.tns,
            tools.pulse,
        );
        if channel_count_changed {
            println!(
                "the channel count changed within the stream, so the output's \
                 interleaving changes with it"
            );
        }
        let rate = if seconds > 0.0 {
            units as f64 / seconds
        } else {
            f64::INFINITY
        };
        println!("{units} frames, {seconds:.3} s, {rate:.1} frames/s");
    }
    Ok(())
}

fn layout_name(layout: &ChannelLayout) -> String {
    match layout {
        ChannelLayout::Mono => "mono".into(),
        ChannelLayout::DualMono => "dual mono".into(),
        ChannelLayout::Speakers {
            speakers,
            matrix_mixdown,
        } => format!("{speakers:?} {matrix_mixdown:?}"),
    }
}
