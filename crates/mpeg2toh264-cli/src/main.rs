//! Command line front end: MPEG-TS or MPEG-2 elementary stream in, fragmented
//! MP4 with the MPEG-2 video carried through out.

use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;

use mpeg2toh264::mpeg2::decode::{DecodedFrame, StreamDecoder};
use mpeg2toh264::{
    extract_mpeg2_video_es, is_mpeg_transport_stream, mpeg2_passthrough_unit, mpeg2_to_fmp4,
    AudioGain, Fragment, OpenGopRecovery, Session, SessionOptions, VideoMode,
};

const USAGE: &str = "\
Usage: mpeg2toh264 [options] <input.ts|input.m2v> <output.mp4>

Carry the MPEG-2 video of an MPEG transport stream or elementary stream into a
fragmented MP4 unconverted, for a player that decodes it. MP4 output from a
transport stream includes its AAC audio track. The first MPEG-2 video program
in a TS is selected.

Arguments:
  input.ts|input.m2v        MPEG-TS or MPEG-2 video elementary stream
  output.mp4                Timestamped fragmented MP4

Options:
  -r, --recovery-interval <n>
                            GOPs between recovery points (default: 24).
                            Transport stream input only
      --open-gop <recovery-point|discard>
                            At a recovery point, preserve the leading pictures
                            of an open GOP and mark the fragment as a random
                            access point (default), or discard them and begin
                            at the intra picture. Transport stream input only
  -s, --split-field-samples Give each field of a complementary pair its own MP4
                            sample (default)
      --no-split-field-samples
                            Keep a complementary field pair in one MP4 sample
      --audio-gain <n>      Raise the AAC audio by n steps of about 1.5 dB,
                            4 doubling it, by rewriting each channel's
                            global_gain (default: 0). Transport stream input
                            only
      --surround-audio-gain <n>
                            The same for audio of more than two channels
                            (default: the --audio-gain value)
      --split-groups        Cut each group of pictures into units of one anchor
                            picture and the B pictures coded after it, each its
                            own fragment, so that the media can be played as
                            soon as it has arrived. The samples are the same as
                            without it. Transport stream input only
  -q, --quiet               Do not print conversion progress or summary
  -h, --help                Show this help

Use 'mpeg2toh264 decode --help' to decode MPEG-2 video to raw frames.
";

const DECODE_USAGE: &str = "\
Usage: mpeg2toh264 decode [options] <input.ts|input.m2v> <output.yuv>
       mpeg2toh264 decode --bench <input.ts|input.m2v>

Decode the MPEG-2 video of an MPEG transport stream (its first MPEG-2 video
program) or of an elementary stream to planar 4:2:0 frames at the visible
size, in display order (yuv420p rawvideo). Leading B pictures that lack a
reference are not output.

Options:
      --bench               Decode without writing output
      --checksums           Print the luma checksum and type of each output
                            picture, one per line, marking a field decoded
                            without its second field
  -q, --quiet               Do not print the summary
  -h, --help                Show this help

The summary gives the pictures output, the macroblocks concealed, the decoding
time and rate, and a checksum of the visible luma of every output picture.
";

struct DecodeOptions {
    input: PathBuf,
    output: Option<PathBuf>,
    quiet: bool,
    checksums: bool,
}

fn parse_decode_args(args: &[String]) -> Option<DecodeOptions> {
    let mut positional: Vec<&str> = Vec::new();
    let mut bench = false;
    let mut quiet = false;
    let mut checksums = false;
    for arg in args {
        match arg.as_str() {
            "-h" | "--help" => return None,
            "--bench" => bench = true,
            "--checksums" => checksums = true,
            "-q" | "--quiet" => quiet = true,
            other if other.starts_with('-') => fail(&format!("unknown option '{other}'")),
            other => positional.push(other),
        }
    }
    let wanted = if bench { 1 } else { 2 };
    if positional.len() != wanted {
        fail(&format!(
            "decode expects {wanted} path(s), got {} positional argument(s)",
            positional.len()
        ));
    }
    let input = absolute(Path::new(positional[0]));
    let output = positional.get(1).map(|path| absolute(Path::new(path)));
    if output.as_ref() == Some(&input) {
        fail("input and output must be different files");
    }
    Some(DecodeOptions {
        input,
        output,
        quiet,
        checksums,
    })
}

/// FNV-1a offset basis, where every checksum starts.
const CHECKSUM_BASIS: u32 = 0x811c_9dc5;

/// The checksum the decoder benchmarks compare: per luma row, the sum of
/// its bytes read as little-endian 32-bit words (a short tail added byte by
/// byte), folded into an FNV-1a style hash together with the row index.
/// `--checksums` prints it per picture, starting from the basis each time.
fn checksum_luma(hash: &mut u32, frame: &DecodedFrame) {
    let luma = frame.plane(0);
    for y in 0..luma.height {
        let row = luma.row(y);
        let mut words = row.chunks_exact(4);
        let mut sum = 0u32;
        for word in &mut words {
            sum = sum.wrapping_add(u32::from_le_bytes([word[0], word[1], word[2], word[3]]));
        }
        for &byte in words.remainder() {
            sum = sum.wrapping_add(byte as u32);
        }
        *hash = (*hash ^ sum ^ y as u32).wrapping_mul(0x0100_0193);
    }
}

fn write_frame(output: &mut impl Write, frame: &DecodedFrame) -> std::io::Result<()> {
    for component in 0..3 {
        let plane = frame.plane(component);
        for y in 0..plane.height {
            output.write_all(plane.row(y))?;
        }
    }
    Ok(())
}

fn run_decode(options: &DecodeOptions) -> Result<(), Box<dyn std::error::Error>> {
    let mut input = BufReader::new(File::open(&options.input)?);
    let transport_stream = is_mpeg_transport_stream(input.fill_buf()?);
    let mut container = Vec::new();
    input.read_to_end(&mut container)?;
    let source = if transport_stream {
        extract_mpeg2_video_es(&container)?
    } else {
        container
    };
    let mut output = match &options.output {
        Some(path) => Some(BufWriter::new(File::create(path)?)),
        None => None,
    };

    let started = Instant::now();
    let mut decoder = StreamDecoder::new();
    let mut hash = CHECKSUM_BASIS;
    let mut failure: Option<std::io::Error> = None;
    let mut deliver = |frame: &DecodedFrame| {
        checksum_luma(&mut hash, frame);
        if options.checksums {
            let mut own = CHECKSUM_BASIS;
            checksum_luma(&mut own, frame);
            let info = frame.info();
            println!(
                "{own:08x} {:?}{}",
                info.picture_type,
                if info.missing_field {
                    " lone-field"
                } else {
                    ""
                }
            );
        }
        if let (Some(output), None) = (output.as_mut(), failure.as_ref()) {
            if let Err(error) = write_frame(output, frame) {
                failure = Some(error);
            }
        }
    };
    for chunk in source.chunks(1 << 20) {
        decoder.push(chunk, &mut deliver);
    }
    decoder.finish(&mut deliver);
    if let Some(error) = failure {
        return Err(error.into());
    }
    if let Some(output) = output.as_mut() {
        output.flush()?;
    }
    let seconds = started.elapsed().as_secs_f64();
    if decoder.stats().output == 0 {
        return Err(match decoder.first_error() {
            Some(error) => error.clone().into(),
            None => "no decodable MPEG-2 pictures in the input".into(),
        });
    }

    if !options.quiet {
        let stats = decoder.stats();
        let rate = if seconds > 0.0 {
            stats.output as f64 / seconds
        } else {
            f64::INFINITY
        };
        println!(
            "{} ({}) -> {}",
            options.input.display(),
            if transport_stream {
                "MPEG-TS"
            } else {
                "MPEG-2 ES"
            },
            options
                .output
                .as_ref()
                .map_or("(no output)".to_string(), |path| path.display().to_string()),
        );
        println!(
            "{} pictures, {} concealed macroblocks, {} skipped, {} groups failed, \
             {seconds:.3} s, {rate:.1} pictures/s, checksum {hash:08x}",
            stats.output, stats.concealed_macroblocks, stats.skipped, stats.failed_groups,
        );
    }
    Ok(())
}

struct CliOptions {
    input: PathBuf,
    output: PathBuf,
    quiet: bool,
    session: SessionOptions,
    audio_gain: AudioGain,
}

/// What `parse_args` decided to do, since `--help` is a successful exit rather
/// than a set of options.
enum Invocation {
    Run(Box<CliOptions>),
    Help,
}

fn fail(message: &str) -> ! {
    eprintln!("mpeg2toh264: {message}");
    eprintln!("Try 'mpeg2toh264 --help' for usage.");
    std::process::exit(2);
}

fn parse_args(args: &[String]) -> Invocation {
    let mut positional: Vec<&str> = Vec::new();
    let defaults = SessionOptions::new(VideoMode::Passthrough);
    let mut recovery_interval = defaults.recovery_interval;
    let mut open_gop_recovery = defaults.open_gop_recovery;
    let mut split_field_samples = defaults.split_field_samples;
    let mut split_groups = defaults.split_groups;
    let mut quiet = false;
    let mut audio_gain: Option<u8> = Some(0);
    let mut surround_audio_gain: Option<Option<u8>> = None;

    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        match arg {
            "-h" | "--help" => return Invocation::Help,
            "-q" | "--quiet" => quiet = true,
            "-s" | "--split-field-samples" => split_field_samples = true,
            "--no-split-field-samples" => split_field_samples = false,
            "--split-groups" => split_groups = true,
            "-r" | "--recovery-interval" => {
                i += 1;
                let Some(value) = args.get(i) else {
                    fail(&format!("{arg} requires a value"));
                };
                recovery_interval = value.parse().unwrap_or(0);
            }
            _ if arg.starts_with("--recovery-interval=") => {
                recovery_interval = arg["--recovery-interval=".len()..].parse().unwrap_or(0);
            }
            "--open-gop" => {
                i += 1;
                let Some(value) = args.get(i) else {
                    fail(&format!("{arg} requires a value"));
                };
                open_gop_recovery = parse_open_gop(value);
            }
            _ if arg.starts_with("--open-gop=") => {
                open_gop_recovery = parse_open_gop(&arg["--open-gop=".len()..]);
            }
            "--audio-gain" | "--surround-audio-gain" => {
                i += 1;
                let Some(value) = args.get(i) else {
                    fail(&format!("{arg} requires a value"));
                };
                if arg == "--audio-gain" {
                    audio_gain = value.parse().ok();
                } else {
                    surround_audio_gain = Some(value.parse().ok());
                }
            }
            _ if arg.starts_with("--audio-gain=") => {
                audio_gain = arg["--audio-gain=".len()..].parse().ok();
            }
            _ if arg.starts_with("--surround-audio-gain=") => {
                surround_audio_gain = Some(arg["--surround-audio-gain=".len()..].parse().ok());
            }
            _ if arg.starts_with('-') => fail(&format!("unknown option '{arg}'")),
            _ => positional.push(arg),
        }
        i += 1;
    }

    if recovery_interval == 0 {
        fail("recovery interval must be a positive integer");
    }
    let (Some(stereo), Some(surround)) = (audio_gain, surround_audio_gain.unwrap_or(audio_gain))
    else {
        fail("audio gain must be an integer from 0 to 255");
    };
    if positional.len() != 2 {
        fail(&format!(
            "expected input and output paths, got {} positional argument(s)",
            positional.len()
        ));
    }
    let input = absolute(Path::new(positional[0]));
    let output = absolute(Path::new(positional[1]));
    if input == output {
        fail("input and output must be different files");
    }
    Invocation::Run(Box::new(CliOptions {
        input,
        output,
        quiet,
        session: SessionOptions {
            recovery_interval,
            open_gop_recovery,
            split_field_samples,
            video: VideoMode::Passthrough,
            split_groups,
        },
        audio_gain: AudioGain { stereo, surround },
    }))
}

fn parse_open_gop(value: &str) -> OpenGopRecovery {
    match value {
        "recovery-point" => OpenGopRecovery::RecoveryPoint,
        "discard" => OpenGopRecovery::Discard,
        _ => fail("open GOP mode must be 'recovery-point' or 'discard'"),
    }
}

fn absolute(path: &Path) -> PathBuf {
    std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}

fn run(options: &CliOptions) -> Result<(), Box<dyn std::error::Error>> {
    let mut input = BufReader::new(File::open(&options.input)?);
    let transport_stream = is_mpeg_transport_stream(input.fill_buf()?);

    if transport_stream {
        return run_session_mp4(options, input);
    }

    let mut source = Vec::new();
    input.read_to_end(&mut source)?;

    let started = Instant::now();
    let mut unit = mpeg2_passthrough_unit(&source, false)?;
    unit.timeline.split_field_samples = options.session.split_field_samples;
    let carried = unit.samples.len();
    let mp4 = mpeg2_to_fmp4(&source, &unit);
    let mut output_data = mp4.init_segment;
    output_data.extend_from_slice(&mp4.media_segment);
    let elapsed = started.elapsed();
    std::fs::write(&options.output, &output_data)?;

    if !options.quiet {
        let seconds = elapsed.as_secs_f64();
        let fps = if seconds > 0.0 {
            carried as f64 / seconds
        } else {
            f64::INFINITY
        };
        println!(
            "{} (MPEG-2 ES) -> {} (fragmented MP4)",
            options.input.display(),
            options.output.display(),
        );
        println!(
            "{carried} pictures carried, {} bytes, {:.1} ms ({fps:.2} fps)",
            output_data.len(),
            seconds * 1000.0,
        );
    }
    Ok(())
}

#[derive(Default)]
struct SessionTotals {
    fragments: usize,
    video_samples: usize,
    audio_samples: usize,
    bytes: usize,
    /// Initialization segments written. More than one means the stream changed
    /// what its sequence header says; see [`write_fragment`].
    inits: usize,
}

fn run_session_mp4(
    options: &CliOptions,
    mut input: BufReader<File>,
) -> Result<(), Box<dyn std::error::Error>> {
    let started = Instant::now();
    let mut output = BufWriter::new(File::create(&options.output)?);
    let mut session = Session::new(options.session);
    session.set_audio_gain(options.audio_gain);
    let mut totals = SessionTotals::default();
    let mut chunk = vec![0; 1 << 20];

    loop {
        let read = input.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        for fragment in session.push(&chunk[..read])? {
            write_fragment(&mut output, fragment, &mut totals, options.quiet, started)?;
        }
    }
    for fragment in session.finish()? {
        write_fragment(&mut output, fragment, &mut totals, options.quiet, started)?;
    }
    output.flush()?;
    report_session(options, &totals, started);
    Ok(())
}

fn report_session(options: &CliOptions, totals: &SessionTotals, started: Instant) {
    if !options.quiet {
        let seconds = started.elapsed().as_secs_f64();
        let fps = if seconds > 0.0 {
            totals.video_samples as f64 / seconds
        } else {
            f64::INFINITY
        };
        println!(
            "{} (MPEG-TS) -> {} (fragmented MP4)",
            options.input.display(),
            options.output.display(),
        );
        println!(
            "{} media fragments, {} video samples, {} audio samples, {} bytes, {:.1} ms ({fps:.2} fps)",
            totals.fragments,
            totals.video_samples,
            totals.audio_samples,
            totals.bytes,
            seconds * 1000.0,
        );
    }
}

fn write_fragment(
    output: &mut impl Write,
    fragment: Fragment,
    totals: &mut SessionTotals,
    quiet: bool,
    started: Instant,
) -> Result<(), std::io::Error> {
    let data = match fragment {
        Fragment::Init {
            data, mime_codec, ..
        } => {
            totals.inits += 1;
            if !quiet {
                println!("init: {mime_codec} ({} bytes)", data.len());
                // Media Source Extensions reads each of these as it reaches it,
                // which is what makes a stream that changes its frame size
                // playable. A file is not read that way: a player that takes
                // the first `moov` as the whole description decodes everything
                // after this one against the wrong picture size.
                if totals.inits > 1 {
                    println!(
                        "  the stream changed what its sequence header says. \
                         Players that read only the first description in a file \
                         will decode the fragments after this one wrongly."
                    );
                }
            }
            data
        }
        Fragment::Media {
            data,
            start,
            random_access,
            video_samples,
            audio_samples,
            scans,
            ..
        } => {
            totals.fragments += 1;
            totals.video_samples += video_samples;
            totals.audio_samples += audio_samples;
            if !quiet && random_access {
                let first = scans.first().expect("media fragment has a video scan");
                let scan = match (first.scan.interlaced, first.scan.top_field_first) {
                    (false, _) => "progressive",
                    (true, true) => "interlaced tff",
                    (true, false) => "interlaced bff",
                };
                let seconds = started.elapsed().as_secs_f64();
                let fps = if seconds > 0.0 {
                    totals.video_samples as f64 / seconds
                } else {
                    f64::INFINITY
                };
                println!(
                    "fragment {} at {start:.3}s: restart point, {video_samples} video, \
                     {audio_samples} audio, {scan}, {fps:.2} fps",
                    totals.fragments
                );
            }
            data
        }
        // Only decode mode hands pictures out, and this writes MP4.
        Fragment::PrivateStream { .. } | Fragment::Video { .. } => return Ok(()),
    };
    output.write_all(&data)?;
    totals.bytes += data.len();
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|arg| arg == "decode") {
        let Some(options) = parse_decode_args(&args[1..]) else {
            print!("{DECODE_USAGE}");
            return ExitCode::SUCCESS;
        };
        return match run_decode(&options) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("mpeg2toh264: {error}");
                ExitCode::FAILURE
            }
        };
    }
    let options = match parse_args(&args) {
        Invocation::Help => {
            print!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Invocation::Run(options) => options,
    };
    match run(&options) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("mpeg2toh264: {error}");
            ExitCode::FAILURE
        }
    }
}
