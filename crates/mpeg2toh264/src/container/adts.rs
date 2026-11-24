//! ADTS framing for AAC-LC.
//!
//! Spectral Huffman data is never re-encoded. Stereo CPE payloads pass through;
//! mono and dual-mono SCE payloads are repackaged as a CPE containing two copies
//! of the primary channel, then the ADTS header is removed for fragmented MP4.
//! The sound can be raised on the way through, which is a change to each
//! channel's `global_gain` and to nothing else.
//!
//! A frame goes out only when a decoder would take it: its block walks to
//! `ID_END` in the last byte of the frame, its CRC matches where it carries
//! one, and its channel elements are the ones its configuration names.
//! Anything else is an access unit lost to damage, not an error -- a broadcast
//! received at the edge of reception loses whole transport packets, and the
//! bytes after a loss land in the middle of whatever frame was being read.

use super::aac::{
    walk_block, Block, Element, PceInfo, ID_CPE, ID_DSE, ID_END, ID_LFE, ID_PCE, ID_SCE,
};
use crate::error::{bail, Result};

/// `sampling_frequency_index` to sample rate (ISO/IEC 14496-3 Table 1.16).
pub(crate) static SAMPLE_RATES: [u32; 13] = [
    96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000,
    7_350,
];

/// Samples in one AAC-LC access unit.
pub const AAC_FRAME_SAMPLES: u64 = 1024;

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct AacConfig {
    pub audio_object_type: u8,
    pub sample_rate: u32,
    pub sampling_frequency_index: u8,
    pub channel_count: u8,
    /// The AudioSpecificConfig an `esds` box carries. Explicit PCE layouts are
    /// longer than the usual two-byte implicit configuration.
    pub audio_specific_config: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct AacFrame {
    pub data: Vec<u8>,
    pub config: AacConfig,
}

/// One access unit of the stream, in the order they came.
#[derive(Clone, Debug)]
pub enum AacUnit {
    Frame(AacFrame),
    /// An access unit lost to damage. It took up one frame's time all the
    /// same, in the configuration the stream was in, which is what whatever
    /// fills its place has to be coded in.
    Lost(AacConfig),
}

/// What reading a piece of an ADTS stream gave.
#[derive(Clone, Debug, Default)]
pub struct AdtsOutput {
    pub units: Vec<AacUnit>,
    /// Where, counting on from `units[0]`, the first unit whose ADTS header
    /// lies in the piece just read is. A PES timestamp refers to the first
    /// access unit that begins in the packet (ISO/IEC 13818-1 2.4.3.7), and
    /// the units before this one began in an earlier packet. It can be
    /// `units.len()` or more: the frame began in this piece but ends in a
    /// later one, and is the first unit of a later output.
    ///
    /// The first header is the one reached in step with the frames before,
    /// or, where the reader was already searching for framing when the piece
    /// began -- at the start of a stream, after a reported gap or a new time
    /// base -- the first one the search finds. It is `None` where no header
    /// begins in the piece; where the one that does is of a frame lost before
    /// the stream said what it is, which no unit stands for; where the reader
    /// is still searching, so that a syncword in the piece is not known to be
    /// a header yet; and where the header due in step inside the piece was
    /// not there, since the frame the piece's timestamp names is then lost and
    /// the one a search finds after it is a later frame.
    pub commencing: Option<usize>,
    /// Ascending indices into `units` at which the reader took up framing
    /// anew, so that the unit there continues nothing before it: where its
    /// place is depends on a timestamp, not on the frames before it.
    ///
    /// Framing is taken up anew at the first frame of a stream, after a
    /// reported gap or a new time base, and where the frame before ended
    /// somewhere no header was and a header had to be searched for. The
    /// access unit a reported gap cut came before the gap, so it is not one;
    /// nor is a damaged frame whose header was where the one before ended,
    /// which keeps its place. A restart found while no unit follows it in the
    /// piece is reported at the first unit of a later one.
    pub restarts: Vec<usize>,
}

/// AAC access units needed through an absolute 90 kHz video decode time. The
/// result can be negative, when the audio track starts later than the video
/// time being asked about.
pub fn aac_frame_count_through_video_time(video_time: i64, sample_rate: u32) -> i64 {
    let frames = (video_time as f64 * sample_rate as f64) / (90_000.0 * AAC_FRAME_SAMPLES as f64);
    crate::round_half_up(frames) as i64
}

/// Incrementally remove ADTS headers without touching AAC payload bits.
#[derive(Default)]
pub struct AdtsStream {
    pending: Vec<u8>,
    current_config: Option<AacConfig>,
    /// `sampling_frequency_index` and `channel_configuration` as the last
    /// frame handed out had them in its header.
    announced: Option<(u8, u8)>,
    /// That frame's channel elements, by id and instance tag. A decoder takes
    /// the tags of the first frame it is given as the layout's, and refuses a
    /// later one naming another, so under an unchanged header the elements
    /// have to stay the same. A mono or dual-mono service is rebuilt from its
    /// first element, which alone is listed.
    chain: Option<Vec<(u8, u8)>>,
    /// Access units given up as damaged.
    lost: u64,
    /// The `adts_fixed_header` fields of the last frame handed out, as
    /// [`fixed_fields`] takes them.
    fixed_header: Option<[u8; 3]>,
    /// Whether the next unit handed out carries on the framing of the last
    /// one. Not at the start of a stream, nor after framing was taken up
    /// anew; see [`AdtsOutput::restarts`].
    continues: bool,
    /// Whether the next byte to read is known to start a frame, which it is
    /// once a header has said where its frame ends and a header was there.
    /// Until then every syncword is a candidate rather than a frame.
    synced: bool,
    /// Which service of a dual-mono stream to rebuild the sound from.
    dual_mono: DualMono,
    /// Whether the last frame that could be walked carried two of them. A
    /// broadcast turns dual mono on and off within one programme -- the ADTS
    /// header does not change, only the elements in the block -- so this is what
    /// the stream is now rather than what it was announced as.
    is_dual_mono: bool,
    /// How far to raise the sound of every frame handed out.
    audio_gain: AudioGain,
}

/// Where an ADTS header says its frame ends -- the part of it that frames the
/// stream, as opposed to the part that describes the sound.
struct Framing {
    header_length: usize,
    frame_length: usize,
}

/// The framing of the header at `at`, or `None` where there is no header there.
/// `at + 7` must be within `data`.
fn framing(data: &[u8], at: usize) -> Option<Framing> {
    if !syncword(data, at) {
        return None;
    }
    let protection_absent = data[at + 1] & 1;
    let header_length = if protection_absent != 0 { 7 } else { 9 };
    let frame_length = (((data[at + 3] & 3) as usize) << 11)
        | ((data[at + 4] as usize) << 3)
        | (data[at + 5] >> 5) as usize;
    (frame_length >= header_length).then_some(Framing {
        header_length,
        frame_length,
    })
}

/// The fields of the `adts_fixed_header` at `at` that say what the stream is:
/// ID, layer, protection_absent, profile, sampling_frequency_index and
/// channel_configuration. They are the same in every frame of a stream
/// (ISO/IEC 13818-7) until the service changes what it is. `at + 4` must be
/// within `data`.
fn fixed_fields(data: &[u8], at: usize) -> [u8; 3] {
    [
        data[at + 1] & 0x0f,
        data[at + 2] & 0xfd,
        data[at + 3] & 0xc0,
    ]
}

/// The syncword is twelve set bits; the layer bits below it must be zero, which
/// is what the 0xf6 mask checks.
fn syncword(data: &[u8], at: usize) -> bool {
    at + 2 <= data.len() && data[at] == 0xff && data[at + 1] & 0xf6 == 0xf0
}

/// What a search for the start of a frame found.
enum FrameStart {
    /// A frame begins this far into the data.
    At(usize),
    /// The data does not say yet. Everything before this offset is spent; what
    /// is left is a candidate the next read decides.
    Spent(usize),
}

/// Where the first frame of `data` begins, for a reader that does not already
/// know: a stream opened part way through, as a seek resumes one, starts inside
/// a frame, and a stream whose framing has just failed is in the same position.
///
/// Spectral data carries a run of twelve set bits about every eight thousand
/// bytes, which is one seek in forty opening on one. What tells such a run from
/// a header is the frame after it: a header says where the next one begins, and
/// there is a header there. So a candidate is taken only once the one it points
/// at has been seen.
///
/// A candidate whose frame reaches past what has been read cannot be judged
/// yet. The search carries on past it rather than stopping there, since the
/// frames further on are wanted now and a made-up frame length is as likely to
/// be long as short -- but a candidate the buffer ends with is taken
/// unconfirmed, since nothing following it is what the last frame of a stream
/// looks like as much as what a false one does.
fn frame_start(data: &[u8]) -> FrameStart {
    let mut ends_the_buffer = None;
    let mut unjudged = None;
    let mut at = 0;
    while at + 7 <= data.len() {
        if let Some(Framing { frame_length, .. }) = framing(data, at) {
            if at + frame_length + 2 <= data.len() {
                if syncword(data, at + frame_length) {
                    return FrameStart::At(at);
                }
                // Judged and refused. There is nothing here to come back to.
            } else {
                unjudged.get_or_insert(at);
                if at + frame_length <= data.len() {
                    ends_the_buffer.get_or_insert(at);
                }
            }
        }
        at += 1;
    }
    // A syncword the read was cut in the middle of is a candidate the next one
    // completes rather than one that failed.
    if unjudged.is_none() {
        while at < data.len() {
            if data[at] == 0xff && (at + 2 > data.len() || data[at + 1] & 0xf6 == 0xf0) {
                unjudged = Some(at);
                break;
            }
            at += 1;
        }
    }
    match ends_the_buffer {
        Some(at) => FrameStart::At(at),
        None => FrameStart::Spent(unjudged.unwrap_or(data.len())),
    }
}

fn bit(data: &[u8], at: usize) -> u8 {
    (data[at >> 3] >> (7 - (at & 7))) & 1
}

struct Bits {
    data: Vec<u8>,
    len: usize,
}

impl Bits {
    fn push(&mut self, value: u8) {
        if self.len & 7 == 0 {
            self.data.push(0);
        }
        if value != 0 {
            self.data[self.len >> 3] |= 1 << (7 - (self.len & 7));
        }
        self.len += 1;
    }
    fn value(&mut self, n: usize, value: u32) {
        for shift in (0..n).rev() {
            self.push(((value >> shift) & 1) as u8);
        }
    }
    fn copy(&mut self, source: &[u8], start: usize, end: usize) {
        for at in start..end {
            self.push(bit(source, at));
        }
    }
}

/// The channel elements an implicit channel configuration is made of
/// (ISO/IEC 14496-3 Table 1.19), as element ids with their instance tags.
///
/// `None` for a configuration this cannot name, which is the zero the explicit
/// `program_config_element` layouts use.
fn implicit_channel_elements(channels: u8) -> Option<&'static [(u8, u8)]> {
    const SCE: u8 = 0;
    const CPE: u8 = 1;
    const LFE: u8 = 3;
    Some(match channels {
        1 => &[(SCE, 0)],
        2 => &[(CPE, 0)],
        3 => &[(SCE, 0), (CPE, 0)],
        4 => &[(SCE, 0), (CPE, 0), (SCE, 1)],
        5 => &[(SCE, 0), (CPE, 0), (CPE, 1)],
        6 => &[(SCE, 0), (CPE, 0), (CPE, 1), (LFE, 0)],
        7 | 8 => &[(SCE, 0), (CPE, 0), (CPE, 1), (CPE, 2), (LFE, 0)],
        _ => return None,
    })
}

/// One access unit of digital silence in `config`'s channel layout.
///
/// Every channel carries an `individual_channel_stream` with a long window and
/// `max_sfb` of zero: no scalefactor band is coded, so there is no spectral
/// data and every sample decodes to zero. It is the shortest thing a decoder
/// will accept for the configuration it has been given, which is what a hole in
/// the sound has to be filled with -- a decoder handed nothing at all stops.
///
/// `None` where the configuration is not one of the implicit layouts, since the
/// elements have to be the ones the decoder was told to expect.
pub fn silent_frame(config: &AacConfig) -> Option<AacFrame> {
    let elements = implicit_channel_elements(config.channel_count)?;
    // global_gain, an ics_info of a long window with no scalefactor bands, and
    // the three absent-tool flags. Twenty-two bits, all zero.
    const EMPTY_CHANNEL: usize = 22;
    let mut out = Bits {
        data: Vec::new(),
        len: 0,
    };
    for &(id, tag) in elements {
        out.value(3, id as u32);
        out.value(4, tag as u32);
        if id == 1 {
            out.push(0); // common_window: each channel carries its own ics_info
            out.value(EMPTY_CHANNEL, 0);
        }
        out.value(EMPTY_CHANNEL, 0);
    }
    out.value(3, 7); // ID_END
    while out.len & 7 != 0 {
        out.push(0);
    }
    Some(AacFrame {
        data: out.data,
        config: config.clone(),
    })
}

fn pce_audio_specific_config(
    data: &[u8],
    pce: &PceInfo,
    audio_object_type: u8,
    frequency_index: u8,
) -> Vec<u8> {
    let mut out = Bits {
        data: Vec::new(),
        len: 0,
    };
    out.value(5, audio_object_type as u32);
    out.value(4, frequency_index as u32);
    out.value(4, 0); // channelConfiguration: use the following PCE
    out.value(3, 0); // frameLengthFlag, dependsOnCoreCoder, extensionFlag
    out.copy(data, pce.body_start, pce.body_end);
    while out.len & 7 != 0 {
        out.push(0);
    }
    out.value(8, 0); // comment_field_bytes
    out.data
}

/// How far to raise the sound, in steps of 2^(1/4) -- about 1.5 dB -- of each
/// channel's `global_gain`. Four steps double it.
///
/// A broadcast is mixed with more headroom than playback wants, and a player
/// that re-encodes it can turn it up on the way; this is the same without the
/// re-encode. Nothing but the eight-bit `global_gain` fields changes, so every
/// spectral value -- and the size of every frame -- stays as it was.
///
/// Surround is counted apart from stereo because a two-channel listener hears
/// it downmixed: the centre and surrounds are added into the front pair, which
/// already takes it further towards clipping than the same step takes stereo.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct AudioGain {
    /// Steps for frames of up to two channels, mono and dual mono included,
    /// since they are handed out as a stereo pair.
    pub stereo: u8,
    /// Steps for frames of more than two channels.
    pub surround: u8,
}

/// Add `steps` to the `global_gain` at each of `positions`, the channels of a
/// raw_data_block whose largest band scalefactor is `max_scalefactor`.
///
/// A frame that the steps would take past what a decoder accepts -- a
/// `global_gain` or band scalefactor above 255 -- is left as it was. Broadcast
/// scalefactors stay far below that, so leaving one frame at its own level is
/// the lesser harm next to a frame no decoder will read.
fn raise_global_gain(
    data: &mut [u8],
    positions: &[usize],
    max_scalefactor: Option<i32>,
    steps: u8,
) {
    let steps = steps as u32;
    let field =
        |data: &[u8], at: usize| (0..8).fold(0u32, |v, n| (v << 1) | bit(data, at + n) as u32);
    if max_scalefactor.is_some_and(|max| max + steps as i32 > 255)
        || positions.iter().any(|&at| field(data, at) + steps > 255)
    {
        return;
    }
    for &at in positions {
        let raised = field(data, at) + steps;
        for n in 0..8 {
            let mask = 0x80u8 >> ((at + n) & 7);
            if raised & (0x80 >> n) != 0 {
                data[(at + n) >> 3] |= mask;
            } else {
                data[(at + n) >> 3] &= !mask;
            }
        }
    }
}

/// Which service of a dual-mono stream the sound is taken from.
///
/// ARIB carries a bilingual programme as two single channel elements in one
/// stream -- the languages beside each other rather than a stereo pair -- and a
/// receiver plays one of them on both speakers. Which one is the viewer's
/// choice, and it is a choice inside the stream rather than between streams, so
/// nothing about the sound's description changes with it.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum DualMono {
    /// The first element, which is the main service.
    #[default]
    Main,
    /// The second, where there is one. A stream carrying a single service is
    /// unaffected: there is nothing else in it to play.
    Sub,
}

/// A mono or dual-mono block rebuilt as a channel pair.
struct Rebuilt {
    data: Vec<u8>,
    /// Whether there was a second service to choose from.
    dual_mono: bool,
    /// The two channels' `global_gain`, in `data`.
    global_gains: [usize; 2],
    /// The largest band scalefactor of the service copied.
    max_scalefactor: Option<i32>,
}

/// Turn SCE or SCE+SCE (dual mono) into a CPE with two identical independent
/// channel streams, built from the service asked for. No spectral value is
/// decoded or re-encoded either way: what changes is which of the two elements
/// is the one copied.
///
/// The rebuilt element keeps the first service's `element_instance_tag`
/// whichever is chosen, because that is what the two-channel configuration
/// describing the frame names (ISO/IEC 14496-3 Table 1.19) -- the tag says which
/// element of that configuration this is, not which of the source's it came
/// from. A `program_config_element` is left out, since the configuration the
/// frame goes out under is the implicit two-channel one, and so is the service
/// not taken.
///
/// The block is written up to `ID_END` and aligned once. What follows `ID_END`
/// in the source is the alignment its encoder wrote, and carrying it across
/// pads a frame that is padded already: about half the time the two come to
/// more than a byte, which leaves a whole byte hanging off the end of the
/// block. Decoders that stop reading at `ID_END` never notice; ones that check
/// the frame against the bytes they consumed reject it, and half the frames of
/// a mono service went missing that way.
///
/// `block` is a walk of `data` whose channel elements are one or two single
/// channel elements.
fn sce_to_cpe(data: &[u8], block: &Block, service: DualMono) -> Rebuilt {
    let mut channels = block.channel_elements();
    let primary = channels.next().expect("a mono block has a channel element");
    let secondary = channels.next();
    let chosen = match (service, secondary) {
        (DualMono::Sub, Some(secondary)) => secondary,
        _ => primary,
    };
    let mut out = Bits {
        data: Vec::with_capacity(data.len() + (chosen.end - chosen.start) / 8 + 1),
        len: 0,
    };
    let mut global_gains = [0; 2];
    for element in &block.elements {
        if element.id == ID_PCE || Some(element) == secondary {
            continue;
        }
        if element != primary {
            out.copy(data, element.start, element.end);
            continue;
        }
        out.value(3, ID_CPE as u32);
        out.value(4, primary.tag as u32);
        out.push(0); // common_window: each copy carries its own ics_info
                     // The individual_channel_stream opens with its global_gain.
        for gain in &mut global_gains {
            *gain = out.len;
            out.copy(data, chosen.start + 7, chosen.end);
        }
    }
    out.value(3, ID_END as u32);
    Rebuilt {
        data: out.data,
        dual_mono: secondary.is_some(),
        global_gains,
        max_scalefactor: chosen.max_scalefactor,
    }
}

/// Whether a block's channel elements are a mono service or ARIB dual mono:
/// one single channel element, or two.
fn is_single_channel_service(block: &Block) -> bool {
    let mut ids = block.channel_elements().map(|element| element.id);
    matches!(
        (ids.next(), ids.next(), ids.next()),
        (Some(ID_SCE), None | Some(ID_SCE), None)
    )
}

/// The `adts_error_check` CRC of a frame whose block has `elements`
/// (ISO/IEC 13818-7, as ARIB STD-B32 requires it of every broadcast frame).
///
/// It covers the header without the CRC itself, then from each element the
/// bits after its `id_syn_ele`: the first 192 of a single channel or LFE
/// element, the first 192 of a channel pair and the first 128 of its second
/// channel stream, all of a `program_config_element` or `data_stream_element`,
/// and nothing of a fill element. A span shorter than its count is padded with
/// zeros; the 192 bits of a channel pair run on into its second channel stream
/// when the first is shorter. That is the layout every frame of eight broadcast
/// recordings matched.
fn adts_crc(frame: &[u8], elements: &[Element]) -> u16 {
    let raw = &frame[9..];
    let mut crc = Crc16::default();
    crc.bits(frame, 0, 56, 56);
    for element in elements {
        let after_id = element.start + 3;
        match element.id {
            ID_SCE | ID_LFE => crc.bits(raw, after_id, element.end, 192),
            ID_CPE => {
                crc.bits(raw, after_id, element.end, 192);
                let second = element.global_gains[1].expect("a channel pair has two channels");
                crc.bits(raw, second, element.end, 128);
            }
            ID_PCE | ID_DSE => crc.bits(raw, after_id, element.end, element.end - after_id),
            _ => {}
        }
    }
    crc.value
}

/// Whether the `adts_error_check` of a frame that carries one matches the
/// frame, whose raw_data_block has `elements` (see [`adts_crc`]).
pub fn crc_matches(frame: &[u8], elements: &[Element]) -> bool {
    adts_crc(frame, elements) == u16::from_be_bytes([frame[7], frame[8]])
}

/// CRC-16 with the polynomial x^16 + x^15 + x^2 + 1, from all ones, most
/// significant bit first.
struct Crc16 {
    value: u16,
}

impl Default for Crc16 {
    fn default() -> Self {
        Self { value: 0xffff }
    }
}

impl Crc16 {
    /// Feed `count` bits from `from`, the ones at or past `limit` as zeros.
    fn bits(&mut self, data: &[u8], from: usize, limit: usize, count: usize) {
        for at in from..from + count {
            let input = if at < limit { bit(data, at) } else { 0 };
            let top = (self.value >> 15) as u8 ^ input;
            self.value <<= 1;
            if top != 0 {
                self.value ^= 0x8005;
            }
        }
    }
}

impl AdtsStream {
    pub fn new() -> Self {
        Self::default()
    }

    /// Take the sound of a dual-mono stream from this service from here on.
    ///
    /// Nothing already read is revisited, and nothing about the sound's
    /// description changes: both services are rebuilt into the same two-channel
    /// configuration, so the frames on either side of the change are described
    /// by the same initialization segment and play one after the other.
    pub fn select_dual_mono(&mut self, service: DualMono) {
        self.dual_mono = service;
    }

    /// Raise the sound of every frame read from here on. See [`AudioGain`].
    pub fn set_audio_gain(&mut self, gain: AudioGain) {
        self.audio_gain = gain;
    }

    /// Whether the sound being read is two services in one stream rather than a
    /// stereo pair, as the last frame to walk had it.
    pub fn is_dual_mono(&self) -> bool {
        self.is_dual_mono
    }

    /// Forget a partial frame and search for framing anew, as where the
    /// stream begins again on a new time base: what was held belongs to the
    /// stream before, and none of it is an access unit of this one. The last
    /// complete frame's configuration and element chain still describe the
    /// service, so they remain.
    pub fn discard_pending(&mut self) {
        self.pending.clear();
        self.synced = false;
        self.continues = false;
    }

    /// Access units given up as damaged so far.
    pub fn lost_units(&self) -> u64 {
        self.lost
    }

    /// Read the next piece of the stream. `gap_before` says bytes were lost
    /// in front of it: a frame whose header was reached in step with the ones
    /// before it and which was cut there is one access unit lost, and framing
    /// is searched for anew.
    pub fn push(&mut self, chunk: &[u8], gap_before: bool) -> Result<AdtsOutput> {
        let mut output = AdtsOutput::default();
        if gap_before {
            if self.synced && !self.pending.is_empty() {
                self.lose(&mut output);
            }
            self.discard_pending();
        }
        // Out of `self` while it is read, since reading a frame updates what
        // the stream is known to be.
        let mut pending = std::mem::take(&mut self.pending);
        let fresh = pending.len();
        pending.extend_from_slice(chunk);
        let read = self.read_frames(&pending, fresh, &mut output);
        if let Ok(consumed) = read {
            pending.drain(..consumed);
        }
        self.pending = pending;
        read.map(|_| output)
    }

    /// Count an access unit lost, and stand a unit in its place where the
    /// stream has said what it is.
    fn lose(&mut self, output: &mut AdtsOutput) {
        self.lost += 1;
        if let Some(config) = self.current_config.clone() {
            self.hand_out(output, AacUnit::Lost(config));
        }
    }

    /// Add `unit` to `output`, noting a restart where it continues nothing.
    fn hand_out(&mut self, output: &mut AdtsOutput, unit: AacUnit) {
        if !self.continues {
            output.restarts.push(output.units.len());
            self.continues = true;
        }
        output.units.push(unit);
    }

    /// Read every whole frame of `pending` into `output`, and say how many of
    /// its bytes are spent. The bytes from `fresh` on are the piece just
    /// pushed.
    fn read_frames(
        &mut self,
        pending: &[u8],
        fresh: usize,
        output: &mut AdtsOutput,
    ) -> Result<usize> {
        let mut commencing_seen = false;
        let mut at = 0;
        while at + 7 <= pending.len() {
            // Whether this header was found by a search, which confirmed it by
            // the header at its end, rather than where the last frame ended.
            let searched = !self.synced;
            if searched {
                match frame_start(&pending[at..]) {
                    FrameStart::At(start) => at += start,
                    FrameStart::Spent(keep) => {
                        at += keep;
                        break;
                    }
                }
                self.synced = true;
            }
            // A header where the last frame ended that says the stream is
            // something else is what a loss inside a header leaves: the first
            // bytes of the header that was due, and after them bytes from
            // further on. Its frame length is not to be waited for -- it would
            // swallow the frames that follow -- so it is searched past, and a
            // service that really changed is confirmed by the search instead.
            let in_step = searched
                || self
                    .fixed_header
                    .is_none_or(|fixed| fixed == fixed_fields(pending, at));
            let Some(Framing {
                header_length,
                frame_length,
            }) = framing(pending, at).filter(|_| in_step)
            else {
                // Whatever was being followed, this is not the rest of it, so
                // where the frames are has to be worked out again.
                self.synced = false;
                self.continues = false;
                // The header due here was the first to begin in the piece,
                // which is the one the piece's timestamp names, and it is
                // gone. The one a search finds after it is a later frame.
                if at >= fresh {
                    commencing_seen = true;
                }
                continue;
            };
            if at + frame_length > pending.len() {
                break;
            }
            let frame = &pending[at..at + frame_length];
            let units = output.units.len();
            match self.read_frame(frame, header_length)? {
                Some(frame) => {
                    self.fixed_header = Some(fixed_fields(pending, at));
                    self.hand_out(output, AacUnit::Frame(frame));
                }
                None => self.lose(output),
            }
            if at >= fresh && !commencing_seen {
                commencing_seen = true;
                output.commencing = (output.units.len() > units).then_some(units);
            }
            at += frame_length;
        }
        // In step with the frames before it, what is left begins a frame,
        // whether or not all of its header has arrived.
        if self.synced && !commencing_seen && at >= fresh && at < pending.len() {
            output.commencing = Some(output.units.len());
        }
        Ok(at)
    }

    /// The access unit an ADTS frame carries, or `None` where the frame is
    /// damaged.
    fn read_frame(&mut self, frame: &[u8], header_length: usize) -> Result<Option<AacFrame>> {
        let audio_object_type = ((frame[2] >> 6) & 3) + 1;
        let sampling_frequency_index = (frame[2] >> 2) & 15;
        let channel_count = ((frame[2] & 1) << 2) | (frame[3] >> 6);
        let raw_blocks = frame[6] & 3;
        let protected = header_length == 9;

        // A stream of a kind this cannot carry is an error, but only before
        // any frame has been read: a frame's own fields are all that say what
        // kind it is, and once a stream has been read a header saying something
        // else is far more likely damaged than true. Its CRC cannot settle it,
        // since what the CRC covers depends on the very fields in question.
        let established = self.current_config.is_some();
        if audio_object_type != 2 {
            if established {
                return Ok(None);
            }
            bail!("unsupported ADTS audio object type {audio_object_type}; AAC-LC is required");
        }
        let Some(&sample_rate) = SAMPLE_RATES.get(sampling_frequency_index as usize) else {
            if established {
                return Ok(None);
            }
            bail!("unsupported ADTS sampling_frequency_index {sampling_frequency_index}");
        };
        if raw_blocks != 0 {
            if established {
                return Ok(None);
            }
            bail!("ADTS frames with multiple raw data blocks are unsupported");
        }

        let raw_data = &frame[header_length..];
        let Some(block) = walk_block(raw_data, sampling_frequency_index) else {
            return Ok(None);
        };
        if protected && !crc_matches(frame, &block.elements) {
            return Ok(None);
        }
        if !self.elements_fit((sampling_frequency_index, channel_count), &block) {
            return Ok(None);
        }

        // A mono service and ARIB dual-mono both use SCEs. Repackage the
        // primary SCE as both independent streams of a CPE, so every mode
        // has the same channel_configuration=2 ASC. Genuine stereo CPEs
        // pass through unchanged.
        let single_channel = is_single_channel_service(&block);
        let input_channels = if channel_count != 0 {
            channel_count
        } else if let Some(pce) = &block.pce {
            pce.channels
        } else if let Some(current) = &self.current_config {
            current.channel_count
        } else {
            // A broadcast mono or dual-mono service leaves the header's
            // channel configuration at zero and sends no
            // program_config_element to carry one either: what the service
            // is lives in the PMT, which is not where anything reading a
            // raw ADTS stream would look. The element itself says enough
            // for the repackaging below -- a single channel element is one
            // channel, a channel pair is two -- and a stream that opens
            // mid-way, as one resumed at a seek does, has nothing else to
            // go on.
            if single_channel {
                1
            } else {
                2
            }
        };
        let sce_service = single_channel && input_channels <= 2;
        let output_channels = if sce_service { 2 } else { input_channels };
        let audio_specific_config = if sce_service {
            vec![
                (audio_object_type << 3) | (sampling_frequency_index >> 1),
                ((sampling_frequency_index & 1) << 7) | (2 << 3),
            ]
        } else if channel_count == 0 {
            if let Some(pce) = &block.pce {
                pce_audio_specific_config(
                    raw_data,
                    pce,
                    audio_object_type,
                    sampling_frequency_index,
                )
            } else if let Some(current) = &self.current_config {
                current.audio_specific_config.clone()
            } else {
                vec![
                    (audio_object_type << 3) | (sampling_frequency_index >> 1),
                    ((sampling_frequency_index & 1) << 7) | (input_channels << 3),
                ]
            }
        } else {
            vec![
                (audio_object_type << 3) | (sampling_frequency_index >> 1),
                ((sampling_frequency_index & 1) << 7) | (channel_count << 3),
            ]
        };
        let config = AacConfig {
            audio_object_type,
            sample_rate,
            sampling_frequency_index,
            channel_count: output_channels,
            audio_specific_config,
        };
        // A service that changes what it is -- 5.1 for the programme and
        // stereo for the announcement after it -- describes itself
        // differently from there on, and every frame carries the
        // configuration it was coded under. Whoever is packaging them puts
        // the change in an initialization segment of its own; refusing to
        // read past it is what used to end the conversion there.
        self.current_config = Some(config.clone());
        // After the rebuild, so that what is raised is the frame as it is
        // handed out: a mono or dual-mono service is a stereo pair by now,
        // and it is the channel count the listener gets that decides the
        // step.
        let steps = if output_channels <= 2 {
            self.audio_gain.stereo
        } else {
            self.audio_gain.surround
        };
        let data = if sce_service {
            let mut rebuilt = sce_to_cpe(raw_data, &block, self.dual_mono);
            self.is_dual_mono = rebuilt.dual_mono;
            if steps != 0 {
                raise_global_gain(
                    &mut rebuilt.data,
                    &rebuilt.global_gains,
                    rebuilt.max_scalefactor,
                    steps,
                );
            }
            rebuilt.data
        } else {
            self.is_dual_mono = false;
            let mut data = raw_data.to_vec();
            if steps != 0 {
                let channels: Vec<&Element> = block.channel_elements().collect();
                let positions: Vec<usize> = channels
                    .iter()
                    .flat_map(|element| element.global_gains.into_iter().flatten())
                    .collect();
                let max_scalefactor = channels
                    .iter()
                    .filter_map(|element| element.max_scalefactor)
                    .max();
                raise_global_gain(&mut data, &positions, max_scalefactor, steps);
            }
            data
        };
        Ok(Some(AacFrame { data, config }))
    }

    /// Whether a block's channel elements are the ones its header says the
    /// stream carries, which is all a decoder has room for; and if they are,
    /// take them as what the stream is from here on.
    ///
    /// The header's channel configuration names the kinds of element and
    /// their order. A mono or dual-mono service is rebuilt from its first
    /// element alone, and ARIB switches between the two within a programme,
    /// under a header of one, two or no channels, so either fits all of those.
    /// A `program_config_element` names the layout itself, and the block has
    /// to carry the channels it counts.
    ///
    /// Under an unchanged header the elements, tags included, are the last
    /// frame's: the header is what changes when the service does -- 5.1 for a
    /// programme, stereo for what follows -- and a block that walks, fits the
    /// new header and passes its CRC is that change rather than damage.
    fn elements_fit(&mut self, header: (u8, u8), block: &Block) -> bool {
        let channel_count = header.1;
        let single_channel = is_single_channel_service(block);
        let mut channels = block.channel_elements();
        let fits_header = if channel_count != 0 {
            (channel_count <= 2 && single_channel)
                || implicit_channel_elements(channel_count).is_some_and(|layout| {
                    layout
                        .iter()
                        .map(|&(id, _)| id)
                        .eq(channels.map(|element| element.id))
                })
        } else if let Some(pce) = &block.pce {
            channels
                .map(|element| if element.id == ID_CPE { 2 } else { 1 })
                .sum::<u8>()
                == pce.channels
        } else {
            channels.next().is_some()
        };
        if !fits_header {
            return false;
        }
        let elements = block
            .channel_elements()
            .map(|element| (element.id, element.tag));
        let chain: Vec<(u8, u8)> = if single_channel {
            elements.take(1).collect()
        } else {
            elements.collect()
        };
        let same_service = self.announced == Some(header) && block.pce.is_none();
        if same_service && self.chain.as_ref().is_some_and(|last| *last != chain) {
            return false;
        }
        self.announced = Some(header);
        self.chain = Some(chain);
        true
    }

    /// Read what is left at the end of the input. Nothing begins in it, so
    /// `commencing` is `None`.
    pub fn finish(&mut self) -> Result<AdtsOutput> {
        let output = self.push(&[], false)?;
        // Whatever is left is the part of a frame the input was cut in the
        // middle of, which a recording that stopped mid-frame ends with. A
        // fraction of an access unit is not something a decoder can be given,
        // and refusing the whole stream over the last few milliseconds of it
        // would be worse, so it goes. Whatever comes next is the start of
        // another stream, which is not where this one left off -- and not
        // held to what this one was either: another elementary stream has
        // a configuration and element tags of its own.
        self.pending.clear();
        self.synced = false;
        self.current_config = None;
        self.announced = None;
        self.chain = None;
        self.is_dual_mono = false;
        self.fixed_header = None;
        self.continues = false;
        Ok(output)
    }
}
