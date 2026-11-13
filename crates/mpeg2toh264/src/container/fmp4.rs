//! Packaging MPEG-2 video and AAC sound as fragmented MP4.

use crate::container::adts::{AacConfig, AAC_FRAME_SAMPLES};
use crate::container::rff::{display_timing, frame_rate, is_film_repeat, supports_film, RffState};
use crate::error::{bail, Result};
use crate::mpeg2::constants::{start_code, PictureStructure, PictureType, FRAME_RATE};
use crate::mpeg2::headers::{
    parse_elementary_stream, picture_sequence_description, sequence_sample_aspect_ratio,
    Interlacing, Picture, SampleAspectRatio,
};
use crate::round_half_up;
use crate::session::DEFAULT_SPLIT_FIELD_SAMPLES;

const TIMESCALE: u32 = 90_000;

/// A growable big-endian byte buffer, which is all the box writer needs.
#[derive(Default)]
struct Buf(Vec<u8>);

impl Buf {
    fn new() -> Self {
        Self(Vec::new())
    }

    fn u8(&mut self, value: u8) -> &mut Self {
        self.0.push(value);
        self
    }

    fn u16(&mut self, value: u16) -> &mut Self {
        self.0.extend_from_slice(&value.to_be_bytes());
        self
    }

    fn u24(&mut self, value: u32) -> &mut Self {
        self.0.extend_from_slice(&value.to_be_bytes()[1..]);
        self
    }

    fn u32(&mut self, value: u32) -> &mut Self {
        self.0.extend_from_slice(&value.to_be_bytes());
        self
    }

    fn u64(&mut self, value: u64) -> &mut Self {
        self.0.extend_from_slice(&value.to_be_bytes());
        self
    }

    fn bytes(&mut self, value: &[u8]) -> &mut Self {
        self.0.extend_from_slice(value);
        self
    }

    fn ascii(&mut self, value: &str) -> &mut Self {
        self.0.extend_from_slice(value.as_bytes());
        self
    }

    fn zeros(&mut self, count: usize) -> &mut Self {
        self.0.resize(self.0.len() + count, 0);
        self
    }

    fn into_vec(self) -> Vec<u8> {
        self.0
    }
}

/// Wrap a payload in a box header: a 32-bit size then the four-character type.
fn boxed(kind: &str, payload: &[u8]) -> Vec<u8> {
    let mut out = Buf::new();
    out.u32((8 + payload.len()) as u32)
        .ascii(kind)
        .bytes(payload);
    out.into_vec()
}

/// A box whose payload begins with a version byte and 24 flag bits.
fn full_box(kind: &str, version: u8, flags: u32, payload: &[u8]) -> Vec<u8> {
    let mut body = Buf::new();
    body.u8(version).u24(flags).bytes(payload);
    boxed(kind, &body.into_vec())
}

fn concat(parts: &[&[u8]]) -> Vec<u8> {
    let mut out = Vec::with_capacity(parts.iter().map(|p| p.len()).sum());
    for part in parts {
        out.extend_from_slice(part);
    }
    out
}

type VideoSample<'a> = Vec<&'a [u8]>;

/// The video samples of one fragment: MPEG-2 carried through untouched, whose
/// samples are elementary stream bytes with their own start codes. Everything
/// downstream needs is a size and a way to write, so that is what this is.
struct VideoPayload<'a> {
    samples: Vec<VideoSample<'a>>,
}

impl<'a> VideoPayload<'a> {
    fn mpeg2(samples: Vec<VideoSample<'a>>) -> Self {
        Self { samples }
    }

    fn len(&self) -> usize {
        self.samples.len()
    }

    fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    fn sample_bytes(&self, index: usize) -> usize {
        self.samples[index].iter().map(|part| part.len()).sum()
    }

    fn total_bytes(&self) -> usize {
        (0..self.samples.len()).map(|i| self.sample_bytes(i)).sum()
    }

    fn write_sample(&self, index: usize, out: &mut Vec<u8>) {
        for part in &self.samples[index] {
            out.extend_from_slice(part);
        }
    }
}

#[derive(Clone, Debug)]
pub struct Mpeg2VideoTimeline {
    pub width: u32,
    pub height: u32,
    pub sample_duration: u32,
    /// Stable decode lead across ordinary video and soft telecine in the same
    /// sequence. Zero uses `sample_duration` for caller-built timelines.
    pub decode_lead: u32,
    /// Presentation time of each coded picture, relative to the first display
    /// slot in the unit. Parallel with `presentation_indices`.
    pub presentation_times: Vec<u64>,
    /// Display duration of each coded picture. RFF timing redistributes half
    /// a field from each repeated picture to the next without waiting for it.
    /// Parallel with `presentation_indices`.
    pub sample_durations: Vec<u32>,
    /// Field metadata of each coded picture, parallel with
    /// `presentation_indices` and still in decode order.
    pub sample_scans: Vec<Interlacing>,
    /// Presentation index for each coded picture.
    pub presentation_indices: Vec<u32>,
    /// Whether each coded picture is a complementary field pair rather than a
    /// frame. Parallel with `presentation_indices`.
    pub field_pairs: Vec<bool>,
    /// Whether each field of a pair has an MP4 sample of its own, which makes
    /// such a picture occupy two samples instead of one. Set by the caller from
    /// [`SessionOptions::split_field_samples`]; parsing the source cannot tell.
    /// [`mpeg2_video_timeline`] fills it in to match that option's default, so
    /// a caller that never touches this still counts the samples the default
    /// packaging makes.
    ///
    /// [`SessionOptions::split_field_samples`]: crate::SessionOptions::split_field_samples
    pub split_field_samples: bool,
    pub sample_aspect_ratio: Option<SampleAspectRatio>,
    /// Extra ticks the unit's opening sample is held for, covering a hole
    /// between the unit before it and this one.
    ///
    /// A unit's pictures are timed against each other, and the units are
    /// appended end to end, so a stretch the source lost would simply close up
    /// -- the picture and the sound would keep playing, a little earlier than
    /// they belong, and the captions alongside them, which carry their own
    /// timestamps, would no longer line up. Holding the opening sample over the
    /// hole instead leaves everything where the source put it. Set by the
    /// caller, which is the only one that knows where the unit before this
    /// ended; zero for a unit that follows without a break.
    ///
    /// It goes to the sample that covers the unit's leading display slots -- the
    /// first picture -- so a caller that sets it asks for a random access point
    /// as well.
    pub hold_ticks: u32,
    /// Extra ticks added to every composition offset of the unit, for a unit
    /// that continues a group whose earlier units left display slots empty.
    ///
    /// Units are laid end to end on the decode clock, which advances by the
    /// pictures the units actually hold. A picture the source lost leaves its
    /// slot empty in the display order, and in a group sent whole the pictures
    /// after it simply keep their later slots. A unit sent separately has to
    /// be told how far behind the display clock the decode clock has fallen,
    /// and this is that. Set by the caller, like `hold_ticks`; zero otherwise.
    pub lag_ticks: u32,
}

impl Mpeg2VideoTimeline {
    /// Whether the picture at this decode position is a complementary field
    /// pair. A caller that filled in the indices but not `field_pairs` gets
    /// what it would have got before the field ever existed: frames.
    fn is_field_pair(&self, decode_index: usize) -> bool {
        self.field_pairs.get(decode_index).copied().unwrap_or(false)
    }

    fn duration_at(&self, decode_index: usize) -> u32 {
        self.sample_durations
            .get(decode_index)
            .copied()
            .unwrap_or(self.sample_duration)
    }

    fn presentation_time_at(&self, decode_index: usize) -> u64 {
        self.presentation_times
            .get(decode_index)
            .copied()
            .unwrap_or_else(|| {
                u64::from(
                    self.presentation_indices
                        .get(decode_index)
                        .copied()
                        .unwrap_or(1)
                        .saturating_sub(1),
                ) * u64::from(self.sample_duration)
            })
    }

    pub(crate) fn first_presentation_time(&self) -> u64 {
        (0..self.presentation_indices.len())
            .map(|index| self.presentation_time_at(index))
            .min()
            .unwrap_or(0)
    }
}

/// The field that pairs with `picture` to make a frame, if `candidate` is it.
///
/// A unit that begins between the two fields of a pair has only the second, and
/// one that ends between them has only the first; a broadcast that loses a
/// field leaves the same thing in the middle. None of the three can be made
/// into a frame, so the odd field is dropped -- by the timeline and by the
/// decoder alike, which is why this decision lives in one place.
pub fn complementary_field<'a>(
    candidate: Option<&'a Picture>,
    picture: &Picture,
) -> Option<&'a Picture> {
    candidate.filter(|mate| {
        mate.coding.picture_structure != PictureStructure::Frame
            && mate.coding.picture_structure != picture.coding.picture_structure
            && mate.header.temporal_reference == picture.header.temporal_reference
            // The two fields of a frame need not be coded the same way. The
            // second field of an intra frame is routinely predicted from the
            // first, which puts a P field beside an I one, and refusing the
            // pair over that leaves the frame with neither of its halves --
            // and every picture that predicts from it wrong until the next
            // intra picture puts them right.
            && matches!(
                (
                    picture.header.picture_coding_type,
                    mate.header.picture_coding_type
                ),
                (PictureType::I, PictureType::I)
                    | (PictureType::I, PictureType::P)
                    | (PictureType::P, PictureType::P)
                    | (PictureType::B, PictureType::B)
            )
    })
}

/// One source picture the timeline kept, and the bytes it was coded in.
///
/// The range runs from the end of the picture before it, so the sequence and
/// group headers between two pictures belong to the one that follows them --
/// which is what makes a sample that opens a fragment decodable on its own.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Mpeg2Sample {
    /// Index of the picture in what `parse_elementary_stream` returns for the
    /// unit. The second field of a pair is the picture after it.
    pub picture: usize,
    pub start: usize,
    /// Where the first field of a complementary pair ends, when this picture is
    /// one. A caller splitting field samples cuts here; one that is not ignores
    /// it and carries the pair whole, as the two coded pictures it already is.
    pub field_end: Option<usize>,
    pub end: usize,
    /// Whether a decoder can begin at this sample, i.e. an intra picture.
    pub sync: bool,
}

/// One unit of MPEG-2 video, cut into the samples an MP4 carries it as.
#[derive(Clone, Debug)]
pub struct Mpeg2Unit {
    pub timeline: Mpeg2VideoTimeline,
    /// In decode order, one per entry of `timeline.presentation_indices`.
    pub samples: Vec<Mpeg2Sample>,
    /// How many bytes of sequence header the unit opens with, which is what a
    /// passthrough MP4 declares as the decoder configuration. Zero for a unit
    /// that does not begin with one.
    pub sequence_header_len: usize,
}

/// Work out which pictures of a unit are kept, and when each is presented, in
/// MP4 timescale units.
///
/// `has_references` is set when the unit continues an already-populated decoded
/// picture buffer, so its leading B pictures can be decoded.
pub fn mpeg2_video_timeline(data: &[u8], has_references: bool) -> Result<Mpeg2VideoTimeline> {
    Ok(
        timed_mpeg2_unit(data, has_references, RffState::default(), 0)?
            .unit
            .timeline,
    )
}

/// Cut a unit into the samples a passthrough MP4 carries, alongside the
/// timeline [`mpeg2_video_timeline`] builds for it.
///
/// Nothing is decoded here, so every picture that has a slice is kept: a
/// damaged slice is the decoder's business rather than this one's.
pub fn mpeg2_passthrough_unit(data: &[u8], has_references: bool) -> Result<Mpeg2Unit> {
    Ok(timed_mpeg2_unit(data, has_references, RffState::default(), 0)?.unit)
}

/// Source-clock information kept alongside the public, retimed MP4 unit.
pub(crate) struct TimedUnit {
    pub unit: Mpeg2Unit,
    /// Original first coded PTS relative to the retimed unit boundary. This
    /// must not be inferred from the evenly spaced presentation times.
    pub source_offset: i64,
    pub before: RffState,
    pub after: RffState,
    /// How many display slots of the group the unit ends in the group has now
    /// used up, whether or not the pictures in them were kept. A unit that
    /// continues that group is told this as the slots it starts after.
    pub slots_after: u32,
    /// From the start of the unit's first display slot to the end of its last,
    /// as the slots are laid out, so empty ones count.
    pub span_ticks: u64,
    display_fields: Vec<u8>,
    repeats: Vec<bool>,
    rate: (u32, u32),
}

impl TimedUnit {
    /// Reuse the header walk when a discontinuity clears the previous unit's
    /// committed timing phase.
    pub(crate) fn retime(&mut self, before: RffState) {
        let timing = display_timing(&self.display_fields, &self.repeats, self.rate, before);
        let timeline = &mut self.unit.timeline;
        self.source_offset = timeline.presentation_indices.first().map_or(0, |&index| {
            timing.source_starts[index as usize] as i64 - timing.start_shift
        });
        timeline.presentation_times = timeline
            .presentation_indices
            .iter()
            .map(|&index| timing.starts[index as usize])
            .collect();
        timeline.sample_durations = timeline
            .presentation_indices
            .iter()
            .map(|&index| timing.durations[index as usize])
            .collect();
        self.span_ticks = match self.display_fields.len() {
            0 | 1 => 0,
            len => timing.starts[len - 1] + u64::from(timing.durations[len - 1]),
        };
        self.before = before;
        self.after = timing.after;
    }
}

/// Walk a unit's pictures, keeping those a decoder can produce a frame from.
/// Parsing reserves their display slots even when a missing picture leaves one
/// empty; retiming must not close up that hole.
///
/// `consumed` is how many display slots of its group earlier units have already
/// covered, for a unit that continues one, and zero for one that opens its
/// group. The unit's slots are counted from there, and a picture that belongs
/// to a slot already covered is dropped.
pub(crate) fn timed_mpeg2_unit(
    data: &[u8],
    has_references: bool,
    before: RffState,
    consumed: u32,
) -> Result<TimedUnit> {
    let pictures = parse_elementary_stream(data)?;
    let Some(first) = pictures.first() else {
        bail!("no MPEG-2 pictures for MP4 timeline");
    };
    let code = first.sequence.frame_rate_code as usize;
    let base_rate = FRAME_RATE.get(code).copied().unwrap_or((0, 0));
    if base_rate.0 == 0 {
        bail!(
            "unsupported MPEG-2 frame_rate_code {}",
            first.sequence.frame_rate_code
        );
    }
    let numerator = base_rate.0 as f64 * (first.sequence_ext.frame_rate_extension_n + 1) as f64;
    let denominator = base_rate.1 as f64 * (first.sequence_ext.frame_rate_extension_d + 1) as f64;
    let sample_duration = round_half_up(TIMESCALE as f64 * denominator / numerator) as u32;
    // The decode clock cannot change its lead at a film/video transition:
    // doing so overlaps consecutive fragments' DTS ranges in MSE.
    let decode_lead = if supports_film(first) {
        (sample_duration * 3).div_ceil(2)
    } else {
        sample_duration
    };
    // What this unit is described by, which is what its pictures have to be
    // coded under to belong to it.
    let description = picture_sequence_description(first);

    let mut references = if has_references { 2 } else { 0 };
    // A unit that opens the decoded picture buffer can hold nothing until the
    // picture that opens it arrives, and only an I picture can. One that starts
    // part way through a group of pictures -- which is what a seek lands on --
    // may have none, and then it holds nothing at all.
    let mut awaiting_intra = !has_references;
    let mut gop_base: u32 = 0;
    // The slots of the group in hand that are behind the unit, and how many the
    // group has used up so far, which is the highest temporal reference seen
    // plus one.
    let mut group_consumed = consumed;
    let mut slots_in_group = consumed;
    let mut presentation_indices = Vec::new();
    let mut sample_scans = Vec::new();
    // Indexed by the one-based presentation index. Missing entries retain two
    // ordinary fields: temporal_reference can have holes where damaged source
    // pictures were absent altogether.
    let mut display_fields = vec![2u8];
    let mut repeats = vec![false];
    let mut field_pairs = Vec::new();
    let mut samples = Vec::new();
    let mut picture_index = 0;
    // Where the picture in hand starts, which is where the one before it ended.
    // A picture that is dropped leaves its bytes to the sample that follows,
    // since a sequence header among them describes that picture too.
    //
    // A unit that continues a group opens with the sequence header the splitter
    // put in front of it, which is not part of its first picture: the group
    // sent whole carries nothing there.
    let mut sample_start = if consumed > 0 {
        sequence_header_len(data)
    } else {
        0
    };
    while picture_index < pictures.len() {
        let picture = &pictures[picture_index];
        // Where this picture sits among the unit's own, which is how a sample
        // names the picture it carries.
        let source_index = picture_index;
        let mut mate = None;
        let mut unpaired = false;
        if picture.coding.picture_structure != PictureStructure::Frame {
            match complementary_field(pictures.get(picture_index + 1), picture) {
                // Complementary fields make one frame, so they occupy one
                // picture of the timeline and advance reference state only once
                // as well.
                Some(field_mate) => {
                    mate = Some(field_mate);
                    picture_index += 2;
                }
                None => {
                    unpaired = true;
                    picture_index += 1;
                }
            }
        } else {
            picture_index += 1;
        }
        // Where this picture's bytes end, and so where the next one's begin,
        // whether or not this one is kept. A field pair is cut at its middle
        // as well, for a caller that wants each field carried on its own.
        let start = sample_start;
        let field_end = mate.map(|_| picture_end(picture, start));
        sample_start = picture_end(mate.unwrap_or(picture), start);
        let picture_type = picture.header.picture_coding_type;
        if !picture_type.is_ipb() {
            continue;
        }
        let tr = picture.header.temporal_reference;
        if picture.starts_gop {
            gop_base += slots_in_group - group_consumed;
            group_consumed = 0;
            slots_in_group = 0;
        }
        slots_in_group = slots_in_group.max(tr + 1);
        // A slot an earlier unit covered is not given again.
        if tr < group_consumed {
            continue;
        }
        let presentation_index = (gop_base + tr + 1 - group_consumed) as usize;
        if display_fields.len() <= presentation_index {
            display_fields.resize(presentation_index + 1, 2);
            repeats.resize(presentation_index + 1, false);
        }
        display_fields[presentation_index] = if picture.coding.picture_structure
            == PictureStructure::Frame
            && picture.coding.repeat_first_field
        {
            3
        } else {
            2
        };
        repeats[presentation_index] = is_film_repeat(picture);
        // A lone field is no frame, so it is dropped.
        if unpaired {
            continue;
        }
        // Nor is a picture coded under a description other than the one this
        // unit opens with: the initialization segment in front of it describes
        // that one.
        if picture_sequence_description(picture) != description {
            continue;
        }
        let decodable =
            !picture.slices.is_empty() && mate.is_none_or(|field| !field.slices.is_empty());
        if !decodable {
            continue;
        }
        if awaiting_intra {
            if picture_type != PictureType::I {
                continue;
            }
            awaiting_intra = false;
        }
        if picture_type == PictureType::B && references < 2 {
            continue;
        }
        presentation_indices.push(gop_base + tr + 1 - group_consumed);
        let interlacing = match picture.coding.picture_structure {
            PictureStructure::TopField => Interlacing {
                interlaced: true,
                top_field_first: true,
            },
            PictureStructure::BottomField => Interlacing {
                interlaced: true,
                top_field_first: false,
            },
            PictureStructure::Frame => Interlacing {
                interlaced: !picture.coding.progressive_frame,
                top_field_first: picture.coding.top_field_first,
            },
            PictureStructure::Reserved => Interlacing::default(),
        };
        sample_scans.push(interlacing);
        field_pairs.push(mate.is_some());
        samples.push(Mpeg2Sample {
            picture: source_index,
            start,
            field_end,
            end: sample_start,
            sync: picture_type == PictureType::I,
        });
        if picture_type != PictureType::B {
            references = (references + 1).min(2);
        }
    }
    let unit = Mpeg2Unit {
        timeline: Mpeg2VideoTimeline {
            width: first.sequence.horizontal_size,
            height: first.sequence.vertical_size,
            sample_duration,
            decode_lead,
            presentation_times: Vec::new(),
            sample_durations: Vec::new(),
            sample_scans,
            presentation_indices,
            field_pairs,
            split_field_samples: DEFAULT_SPLIT_FIELD_SAMPLES,
            sample_aspect_ratio: sequence_sample_aspect_ratio(&first.sequence),
            hold_ticks: 0,
            lag_ticks: 0,
        },
        samples,
        sequence_header_len: sequence_header_len(data),
    };
    let mut timed = TimedUnit {
        unit,
        source_offset: 0,
        before,
        after: RffState::default(),
        slots_after: slots_in_group,
        span_ticks: 0,
        display_fields,
        repeats,
        rate: frame_rate(first),
    };
    timed.retime(before);
    Ok(timed)
}

/// Where a picture's coded data ends, which is the start code that terminated
/// its last slice. A picture with no slices at all ends where it began.
pub(crate) fn picture_end(picture: &Picture, start: usize) -> usize {
    picture
        .slices
        .last()
        .and_then(|slice| slice.data_end_bit)
        .map_or(start, |bit| bit / 8)
}

/// How much of a unit is the sequence header block that opens it: everything
/// ahead of its first group or picture header.
///
/// This is the decoder configuration a passthrough MP4 declares, and the only
/// part of the unit that a sample which does not begin at byte zero still
/// needs. The scan stops at the first header of a picture, so it walks the few
/// hundred bytes the block occupies rather than the unit.
fn sequence_header_len(data: &[u8]) -> usize {
    if data.len() < 4 || data[..3] != [0, 0, 1] || data[3] != start_code::SEQUENCE_HEADER {
        return 0;
    }
    let mut at = 4;
    while at + 4 <= data.len() {
        if data[at] != 0 || data[at + 1] != 0 || data[at + 2] != 1 {
            at += 1;
            continue;
        }
        let code = data[at + 3];
        if code == start_code::PICTURE
            || code == start_code::GROUP
            || (start_code::SLICE_MIN..=start_code::SLICE_MAX).contains(&code)
        {
            return at;
        }
        at += 4;
    }
    0
}

/// Sample durations and composition offsets for one unit of coded pictures.
#[derive(Clone, Debug)]
pub struct SampleTiming {
    /// Durations in decode order.
    pub durations: Vec<u32>,
    /// Offsets carrying each sample from its decode slot to its display slot.
    pub compositions: Vec<u32>,
    /// How far decoding runs ahead of display.
    pub reorder_delay: i64,
}

/// What the sample that opens a unit has to stand in for.
///
/// A unit that opens the presentation is short of pictures at the front: an
/// open GOP's leading B pictures reference an anchor that is not there, so
/// they cannot be carried and the first retained picture sits that many display
/// slots in. Those empty slots are given to the opening sample, which leaves no
/// gap to stall on and -- the reason this matters -- makes every unit span
/// exactly as many frames as the source did, so units appended end to end
/// cannot creep away from the audio.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum UnitLeadIn {
    /// Nothing: the unit continues a decode chain and every display slot in it
    /// has a picture of its own.
    None,
    /// The empty slots, held by the unit's own first picture: it adds no
    /// samples of its own, so the picture that opens the unit is simply shown
    /// for longer.
    FirstPicture,
}

/// Work out the sample timing for one unit of coded pictures.
pub fn mpeg2_sample_timing(timeline: &Mpeg2VideoTimeline, lead_in: UnitLeadIn) -> SampleTiming {
    let indices = &timeline.presentation_indices;
    // The slot the unit starts on, which is not the first picture in decode
    // order: an I picture is coded ahead of the B pictures that display before
    // it, and at a random access point those B pictures are missing entirely.
    let first_presentation_time = timeline.first_presentation_time() as i64;
    let duration = timeline.decode_lead.max(timeline.sample_duration) as i64;
    let mut offsets: Vec<i64> = Vec::with_capacity(indices.len());
    let mut durations: Vec<u32> = Vec::with_capacity(indices.len());
    let mut decode_time = 0i64;
    for decode_index in 0..indices.len() {
        let presentation_time =
            timeline.presentation_time_at(decode_index) as i64 - first_presentation_time;
        let sample_duration = timeline.duration_at(decode_index);
        if timeline.split_field_samples && timeline.is_field_pair(decode_index) {
            // Each field takes half the frame's slot, in the order it displays
            // in. Splitting the duration rather than leaving the second sample
            // at zero keeps every sample on an instant of its own, which is
            // what the decoders this works around want to see.
            let first_duration = sample_duration / 2;
            let second_duration = sample_duration - first_duration;
            offsets.push(presentation_time - decode_time);
            durations.push(first_duration);
            decode_time += i64::from(first_duration);
            offsets.push(presentation_time + i64::from(first_duration) - decode_time);
            durations.push(second_duration);
            decode_time += i64::from(second_duration);
        } else {
            offsets.push(presentation_time - decode_time);
            durations.push(sample_duration);
            decode_time += i64::from(sample_duration);
        }
    }
    // An anchor picture is coded before the B pictures that display ahead of it,
    // so it reaches its display slot before its decode slot -- a negative
    // composition offset, which asks a decoder to show a picture it has not
    // decoded yet. Holding the whole decode timeline back by that lead keeps
    // every offset at or above zero without moving a single picture relative to
    // the audio.
    //
    // Reserve the same lead whether this unit needs it or not: one ordinary
    // frame, or three fields for a sequence that can carry soft telecine.
    // The delay sets where the unit's decode timeline
    // begins and the units are appended to one timeline. A unit that measured
    // its own would start a frame later than its neighbours whenever it had no
    // picture displaying ahead of its decode slot -- a group coded without B
    // pictures, or one whose leading B pictures were dropped -- which
    // leaves a hole in the decode timeline in front of it and lands its last
    // sample on the decode time of the next unit's first. Media Source
    // Extensions reads that overlap as an append over buffered frames and
    // clears them back to a random access point, and these streams carry one
    // every few hundred pictures, so the picture freezes until the next one.
    // B pictures are not references, so only one anchor is ever held, but an
    // unpaired RFF picture can occupy three fields at the end of a film run.
    let measured = -offsets.iter().copied().min().unwrap_or(0).min(0);
    let reorder_delay = measured.max(duration);
    let compositions: Vec<u32> = offsets
        .iter()
        .map(|offset| (offset + reorder_delay) as u32 + timeline.lag_ticks)
        .collect();
    match lead_in {
        UnitLeadIn::None => {}
        // The opening sample is displayed from the first empty slot through its
        // own, and over the hole in front of the unit. A unit that has no such
        // sample cannot hold anything, and the caller keeps the hole for the
        // next one that can. Holding the sample longer moves the decode slot of
        // everything after it by the same amount, so the composition offsets
        // already computed still land where they should.
        UnitLeadIn::FirstPicture => {
            if let Some(first) = durations.first_mut() {
                *first += first_presentation_time as u32 + timeline.hold_ticks;
            }
        }
    }
    SampleTiming {
        durations,
        compositions,
        reorder_delay,
    }
}

/// `objectTypeIndication` for ISO/IEC 13818-2 Main Profile video, which is what
/// a broadcast MPEG-2 stream is (ISO/IEC 14496-1 table 5).
const OTI_MPEG2_VIDEO_MAIN: u8 = 0x61;
/// `objectTypeIndication` for MPEG-4 audio, which is what AAC-LC is.
const OTI_MPEG4_AUDIO: u8 = 0x40;
/// `streamType` 4 (visual), upstream off, in the byte that carries them.
const STREAM_TYPE_VISUAL: u8 = 0x11;
/// `streamType` 5 (audio), upstream off.
const STREAM_TYPE_AUDIO: u8 = 0x15;

/// An MPEG-4 descriptor: a tag, a length in the four-byte expanded form every
/// muxer emits, then the payload.
fn descriptor(tag: u8, payload: &[u8]) -> Vec<u8> {
    let length = payload.len() as u32;
    let mut out = Buf::new();
    out.u8(tag)
        .u8(0x80 | ((length >> 21) & 0x7f) as u8)
        .u8(0x80 | ((length >> 14) & 0x7f) as u8)
        .u8(0x80 | ((length >> 7) & 0x7f) as u8)
        .u8((length & 0x7f) as u8)
        .bytes(payload);
    out.into_vec()
}

/// The `esds` box, which is where an MP4 keeps the configuration a transport
/// stream repeats in band: the AudioSpecificConfig that ADTS carries in every
/// frame header, or the sequence header that opens an MPEG-2 video sequence.
fn make_esds(
    es_id: u16,
    object_type: u8,
    stream_type: u8,
    decoder_specific_info: &[u8],
) -> Vec<u8> {
    let decoder_specific = descriptor(0x05, decoder_specific_info);
    let decoder_config = {
        let mut body = Buf::new();
        // objectTypeIndication and streamType, then buffer size, max and
        // average bitrate as zero.
        body.bytes(&[object_type, stream_type, 0, 0, 0])
            .u32(0)
            .u32(0)
            .bytes(&decoder_specific);
        descriptor(0x04, &body.into_vec())
    };
    let sl_config = descriptor(0x06, &[0x02]);
    let es_descriptor = {
        let mut body = Buf::new();
        body.u16(es_id)
            .u8(0) // no stream priority, no dependency, no URL
            .bytes(&decoder_config)
            .bytes(&sl_config);
        descriptor(0x03, &body.into_vec())
    };
    full_box("esds", 0, 0, &es_descriptor)
}

/// 16.16 fixed point, wrapping exactly as the reference implementation's 32-bit
/// shift did. A 96 kHz rate is the only value that reaches the wrap.
fn fixed16_16(value: u32) -> u32 {
    ((value as u64) << 16) as u32
}

/// How wide the track is to be seen, in 16.16 fixed point: the coded width with
/// the sample aspect ratio applied.
///
/// `tkhd` carries a display size, not a coded one, and the two differ for every
/// anamorphic broadcast -- 1440x1080 at 16:9 is 1920 wide on the screen. A
/// reader that takes the sample entry's `pasp` reaches the same number without
/// this, which is why ffmpeg and the browsers that parse the file themselves
/// were content; AVFoundation takes the track's, so on Safari the picture was
/// declared 4:3 while being painted 16:9 inside it. Rounded as ffmpeg rounds it,
/// keeping the fraction of a ratio that does not divide the width evenly.
fn track_width(width: u32, sample_aspect_ratio: Option<SampleAspectRatio>) -> u32 {
    let Some(sar) = sample_aspect_ratio.filter(|sar| sar.width > 0 && sar.height > 0) else {
        return fixed16_16(width);
    };
    let scaled = u64::from(width) * u64::from(sar.width) * 65536;
    let denominator = u64::from(sar.height);
    ((scaled + denominator / 2) / denominator) as u32
}

/// The unity 3x3 display matrix every track here uses, in 16.16 fixed point.
fn identity_matrix(buf: &mut Buf) {
    buf.u32(0x0001_0000).u32(0).u32(0);
    buf.u32(0).u32(0x0001_0000).u32(0);
    buf.u32(0).u32(0).u32(0x4000_0000);
}

/// The initialization segment for a presentation, and the MIME type to open a
/// `SourceBuffer` with.
///
/// The video track is MPEG-2 carried through as it stood, described by
/// `sequence_header`. The samples keep their start codes and their own copy of
/// that header, so this is a declaration rather than the only copy.
fn make_init_segment(
    sequence_header: &[u8],
    width: u32,
    height: u32,
    sample_aspect_ratio: Option<SampleAspectRatio>,
    audio: Option<&AacConfig>,
) -> (Vec<u8>, String) {
    let decoder_config = make_esds(1, OTI_MPEG2_VIDEO_MAIN, STREAM_TYPE_VISUAL, sequence_header);
    let ftyp = {
        let mut body = Buf::new();
        body.ascii("isom").u32(0x200).ascii("isomiso6mp41avc1");
        boxed("ftyp", &body.into_vec())
    };
    // next_track_ID, past every track this movie declares.
    let mvhd = make_mvhd(if audio.is_some() { 3 } else { 2 });
    let tkhd = {
        let mut body = Buf::new();
        body.u32(0).u32(0).u32(1).u32(0).u32(0).zeros(8);
        body.u16(0).u16(0).u16(0).u16(0);
        identity_matrix(&mut body);
        body.u32(track_width(width, sample_aspect_ratio))
            .u32(fixed16_16(height));
        full_box("tkhd", 0, 7, &body.into_vec())
    };
    let mdhd = {
        let mut body = Buf::new();
        body.u32(0).u32(0).u32(TIMESCALE).u32(0).u16(0x55c4).u16(0);
        full_box("mdhd", 0, 0, &body.into_vec())
    };
    let hdlr = {
        let mut body = Buf::new();
        body.u32(0).ascii("vide").zeros(12).ascii("VideoHandler\0");
        full_box("hdlr", 0, 0, &body.into_vec())
    };
    let vmhd = {
        let mut body = Buf::new();
        body.u16(0).u16(0).u16(0).u16(0);
        full_box("vmhd", 0, 1, &body.into_vec())
    };
    let dinf = make_dinf();
    let sample_entry = {
        let mut body = Buf::new();
        body.zeros(6).u16(1).zeros(16);
        body.u16(width as u16).u16(height as u16);
        body.u32(fixed16_16(72))
            .u32(fixed16_16(72))
            .u32(0)
            .u16(1)
            .zeros(32);
        body.u16(0x18).u16(0xffff).bytes(&decoder_config);
        if let Some(sar) = sample_aspect_ratio {
            let mut pasp = Buf::new();
            pasp.u32(sar.width).u32(sar.height);
            body.bytes(&boxed("pasp", &pasp.into_vec()));
        }
        boxed("mp4v", &body.into_vec())
    };
    let stsd = {
        let mut body = Buf::new();
        body.u32(1).bytes(&sample_entry);
        full_box("stsd", 0, 0, &body.into_vec())
    };
    let mut empty_count = Buf::new();
    empty_count.u32(0);
    let mut empty_pair = Buf::new();
    empty_pair.u32(0).u32(0);
    let stbl = boxed(
        "stbl",
        &concat(&[
            &stsd,
            &full_box("stts", 0, 0, &empty_count.0),
            &full_box("stsc", 0, 0, &empty_count.0),
            &full_box("stsz", 0, 0, &empty_pair.0),
            &full_box("stco", 0, 0, &empty_count.0),
        ]),
    );
    let minf = boxed("minf", &concat(&[&vmhd, &dinf, &stbl]));
    let mdia = boxed("mdia", &concat(&[&mdhd, &hdlr, &minf]));
    let trak = boxed("trak", &concat(&[&tkhd, &mdia]));
    let trex = {
        let mut body = Buf::new();
        body.u32(1).u32(1).u32(0).u32(0).u32(0);
        full_box("trex", 0, 0, &body.into_vec())
    };

    let (audio_trak, audio_trex) = match audio {
        None => (Vec::new(), Vec::new()),
        Some(audio) => make_audio_track(audio, &dinf),
    };

    let mvex = boxed("mvex", &concat(&[&trex, &audio_trex]));
    let moov = boxed("moov", &concat(&[&mvhd, &trak, &audio_trak, &mvex]));
    let audio_codec = if audio.is_some() {
        format!(",{AAC_CODECS_PARAMETER}")
    } else {
        String::new()
    };
    (
        concat(&[&ftyp, &moov]),
        // The codecs parameter names the video track as RFC 6381 does.
        format!("video/mp4; codecs=\"mp4v.{OTI_MPEG2_VIDEO_MAIN:02x}{audio_codec}\""),
    )
}

/// What the codecs parameter of a MIME type calls AAC-LC (RFC 6381).
const AAC_CODECS_PARAMETER: &str = "mp4a.40.2";

fn make_mvhd(next_track_id: u32) -> Vec<u8> {
    let mut body = Buf::new();
    body.u32(0).u32(0).u32(TIMESCALE).u32(0);
    body.u32(0x0001_0000).u16(0x0100).u16(0).zeros(8);
    identity_matrix(&mut body);
    body.zeros(24).u32(next_track_id);
    full_box("mvhd", 0, 0, &body.into_vec())
}

fn make_dinf() -> Vec<u8> {
    let url = full_box("url ", 0, 1, &[]);
    let mut body = Buf::new();
    body.u32(1).bytes(&url);
    boxed("dinf", &full_box("dref", 0, 0, &body.into_vec()))
}

/// The sound's `trak` and `trex`. It is track 2 whether or not a video track
/// sits beside it.
fn make_audio_track(audio: &AacConfig, dinf: &[u8]) -> (Vec<u8>, Vec<u8>) {
    let mut empty_count = Buf::new();
    empty_count.u32(0);
    let mut empty_pair = Buf::new();
    empty_pair.u32(0).u32(0);
    let audio_tkhd = {
        let mut body = Buf::new();
        body.u32(0).u32(0).u32(2).u32(0).u32(0).zeros(8);
        // Full volume, and no width or height: this track has no picture.
        body.u16(0).u16(0).u16(0x0100).u16(0);
        identity_matrix(&mut body);
        body.u32(0).u32(0);
        full_box("tkhd", 0, 7, &body.into_vec())
    };
    let audio_mdhd = {
        let mut body = Buf::new();
        body.u32(0)
            .u32(0)
            .u32(audio.sample_rate)
            .u32(0)
            .u16(0x55c4)
            .u16(0);
        full_box("mdhd", 0, 0, &body.into_vec())
    };
    let audio_hdlr = {
        let mut body = Buf::new();
        body.u32(0).ascii("soun").zeros(12).ascii("SoundHandler\0");
        full_box("hdlr", 0, 0, &body.into_vec())
    };
    let smhd = {
        let mut body = Buf::new();
        body.u16(0).u16(0);
        full_box("smhd", 0, 0, &body.into_vec())
    };
    let mp4a = {
        let mut body = Buf::new();
        body.zeros(6).u16(1).zeros(8);
        body.u16(audio.channel_count as u16).u16(16);
        body.u16(0)
            .u16(0)
            .u32(fixed16_16(audio.sample_rate))
            .bytes(&make_esds(
                2,
                OTI_MPEG4_AUDIO,
                STREAM_TYPE_AUDIO,
                &audio.audio_specific_config,
            ));
        boxed("mp4a", &body.into_vec())
    };
    let audio_stsd = {
        let mut body = Buf::new();
        body.u32(1).bytes(&mp4a);
        full_box("stsd", 0, 0, &body.into_vec())
    };
    let audio_stbl = boxed(
        "stbl",
        &concat(&[
            &audio_stsd,
            &full_box("stts", 0, 0, &empty_count.0),
            &full_box("stsc", 0, 0, &empty_count.0),
            &full_box("stsz", 0, 0, &empty_pair.0),
            &full_box("stco", 0, 0, &empty_count.0),
        ]),
    );
    let audio_minf = boxed("minf", &concat(&[&smhd, dinf, &audio_stbl]));
    let audio_mdia = boxed("mdia", &concat(&[&audio_mdhd, &audio_hdlr, &audio_minf]));
    let mut trex_body = Buf::new();
    trex_body.u32(2).u32(1).u32(0).u32(0).u32(0);
    (
        boxed("trak", &concat(&[&audio_tkhd, &audio_mdia])),
        full_box("trex", 0, 0, &trex_body.into_vec()),
    )
}

/// An initialization segment declaring the sound alone, and its MIME type.
fn make_audio_init_segment(audio: &AacConfig) -> (Vec<u8>, String) {
    let ftyp = {
        let mut body = Buf::new();
        body.ascii("isom").u32(0x200).ascii("isomiso6mp41");
        boxed("ftyp", &body.into_vec())
    };
    let (trak, trex) = make_audio_track(audio, &make_dinf());
    let moov = boxed(
        "moov",
        &concat(&[&make_mvhd(3), &trak, &boxed("mvex", &trex)]),
    );
    (
        concat(&[&ftyp, &moov]),
        format!("audio/mp4; codecs=\"{AAC_CODECS_PARAMETER}\""),
    )
}

fn make_media_segment(
    video: &VideoPayload<'_>,
    durations: &[u32],
    compositions: &[u32],
    sync_samples: &[bool],
    sequence_number: u32,
    base_decode_time: u64,
) -> Vec<u8> {
    let mut entries = Buf::new();
    for i in 0..video.len() {
        entries.u32(durations[i]);
        entries.u32(video.sample_bytes(i) as u32);
        // sample_flags: non-reference and non-sync unless this is a restart
        // point. Safari needs the container flag to retain an MSE eviction
        // boundary.
        entries.u32(if sync_samples[i] {
            0x0200_0000
        } else {
            0x0101_0000
        });
        entries.u32(compositions[i]);
    }
    let entries = entries.into_vec();

    let make_moof = |data_offset: u32| {
        let mfhd = {
            let mut body = Buf::new();
            body.u32(sequence_number);
            full_box("mfhd", 0, 0, &body.into_vec())
        };
        let tfhd = {
            let mut body = Buf::new();
            body.u32(1);
            full_box("tfhd", 0, 0x020000, &body.into_vec())
        };
        let tfdt = {
            let mut body = Buf::new();
            // Version 1: a session resumed mid-file starts where it sits in the
            // whole presentation, and 32 bits of 90 kHz ticks runs out after
            // thirteen hours.
            body.u64(base_decode_time);
            full_box("tfdt", 1, 0, &body.into_vec())
        };
        let trun = {
            let mut body = Buf::new();
            body.u32(video.len() as u32)
                .u32(data_offset)
                .bytes(&entries);
            full_box("trun", 1, 0x000f01, &body.into_vec())
        };
        let traf = boxed("traf", &concat(&[&tfhd, &tfdt, &trun]));
        boxed("moof", &concat(&[&mfhd, &traf]))
    };
    // The data offset is relative to the moof, whose size depends on the offset
    // only through its fixed-width field, so one rebuild settles it.
    let moof = make_moof(0);
    let moof = make_moof(moof.len() as u32 + 8);
    let mut mdat_payload = Vec::with_capacity(video.total_bytes());
    for index in 0..video.len() {
        video.write_sample(index, &mut mdat_payload);
    }
    concat(&[&moof, &boxed("mdat", &mdat_payload)])
}

/// One fragment carrying both tracks, so an MSE implementation sees a `traf`
/// for each in the same `moof` rather than two interleaved fragment streams.
#[allow(clippy::too_many_arguments)]
fn make_av_media_segment(
    video: &VideoPayload<'_>,
    durations: &[u32],
    compositions: &[u32],
    sync_samples: &[bool],
    audio_samples: &[Vec<u8>],
    sequence_number: u32,
    video_base_decode_time: u64,
    audio_base_decode_time: u64,
) -> Vec<u8> {
    let video_bytes = video.total_bytes();
    let mut video_entries = Buf::new();
    for i in 0..video.len() {
        video_entries.u32(durations[i]);
        video_entries.u32(video.sample_bytes(i) as u32);
        video_entries.u32(if sync_samples[i] {
            0x0200_0000
        } else {
            0x0101_0000
        });
        video_entries.u32(compositions[i]);
    }
    let video_entries = video_entries.into_vec();
    let mut audio_entries = Buf::new();
    for sample in audio_samples {
        audio_entries.u32(AAC_FRAME_SAMPLES as u32);
        audio_entries.u32(sample.len() as u32);
    }
    let audio_entries = audio_entries.into_vec();
    let make_moof = |video_offset: u32, audio_offset: u32| {
        let mfhd = {
            let mut body = Buf::new();
            body.u32(sequence_number);
            full_box("mfhd", 0, 0, &body.into_vec())
        };
        let traf = |track: u32,
                    base_decode_time: u64,
                    offset: u32,
                    entries: &[u8],
                    count: usize,
                    version: u8,
                    flags: u32| {
            let mut tfhd_body = Buf::new();
            tfhd_body.u32(track);
            let mut tfdt_body = Buf::new();
            tfdt_body.u64(base_decode_time);
            let mut trun_body = Buf::new();
            trun_body.u32(count as u32).u32(offset).bytes(entries);
            boxed(
                "traf",
                &concat(&[
                    &full_box("tfhd", 0, 0x020000, &tfhd_body.into_vec()),
                    // Version 1: see the video-only segment above.
                    &full_box("tfdt", 1, 0, &tfdt_body.into_vec()),
                    &full_box("trun", version, flags, &trun_body.into_vec()),
                ]),
            )
        };
        // A track with nothing in this fragment takes no traf: the audio of a
        // recording runs out before its video does, and a trun describing no
        // samples is not something to hand a parser.
        let mut parts = vec![mfhd];
        if !video.is_empty() {
            parts.push(traf(
                1,
                video_base_decode_time,
                video_offset,
                &video_entries,
                video.len(),
                1,
                0x000f01,
            ));
        }
        if !audio_samples.is_empty() {
            parts.push(traf(
                2,
                audio_base_decode_time,
                audio_offset,
                &audio_entries,
                audio_samples.len(),
                0,
                0x000301,
            ));
        }
        let parts: Vec<&[u8]> = parts.iter().map(Vec::as_slice).collect();
        boxed("moof", &concat(&parts))
    };
    let moof = make_moof(0, 0);
    let payload_start = moof.len() as u32 + 8;
    let moof = make_moof(payload_start, payload_start + video_bytes as u32);

    let audio_bytes: usize = audio_samples.iter().map(Vec::len).sum();
    let mut out = Vec::with_capacity(moof.len() + 8 + video_bytes + audio_bytes);
    out.extend_from_slice(&moof);
    out.extend_from_slice(&((8 + video_bytes + audio_bytes) as u32).to_be_bytes());
    out.extend_from_slice(b"mdat");
    for index in 0..video.len() {
        video.write_sample(index, &mut out);
    }
    for sample in audio_samples {
        out.extend_from_slice(sample);
    }
    out
}

#[derive(Clone, Debug)]
pub struct Fmp4Output {
    pub init_segment: Vec<u8>,
    pub media_segment: Vec<u8>,
    pub mime_codec: String,
    pub sample_count: usize,
}

/// Package an MPEG-2 unit as one video-only presentation, carrying its video
/// through untouched.
pub fn mpeg2_to_fmp4(es: &[u8], unit: &Mpeg2Unit) -> Fmp4Output {
    let timing = mpeg2_sample_timing(&unit.timeline, UnitLeadIn::FirstPicture);
    // A whole presentation opens where a decoder has to be able to start.
    let sync_samples = mpeg2_sync_samples(unit, true);
    let video = mpeg2_payload(es, unit);
    let (init_segment, mime_codec) = make_init_segment(
        &es[..unit.sequence_header_len],
        unit.timeline.width,
        unit.timeline.height,
        unit.timeline.sample_aspect_ratio,
        None,
    );
    Fmp4Output {
        media_segment: make_media_segment(
            &video,
            &timing.durations,
            &timing.compositions,
            &sync_samples,
            1,
            0,
        ),
        sample_count: video.len(),
        init_segment,
        mime_codec,
    }
}

/// The samples of a passthrough unit as the `mdat` will carry them.
///
/// A sample that does not open the unit but is the first one kept is given the
/// sequence header the unit opens with: the pictures that stood between them
/// were dropped, and their bytes with them.
fn mpeg2_payload<'a>(es: &'a [u8], unit: &Mpeg2Unit) -> VideoPayload<'a> {
    let split_fields = unit.timeline.split_field_samples;
    let mut samples: Vec<VideoSample<'a>> = Vec::with_capacity(unit.samples.len());
    for sample in &unit.samples {
        // The two fields of a pair are already two coded pictures here, so
        // giving each its own sample is a matter of not joining them.
        match sample.field_end.filter(|_| split_fields) {
            Some(field_end) => {
                samples.push(vec![&es[sample.start..field_end]]);
                samples.push(vec![&es[field_end..sample.end]]);
            }
            None => samples.push(vec![&es[sample.start..sample.end]]),
        }
    }
    if let Some(first) = samples.first_mut() {
        if unit.samples[0].start > unit.sequence_header_len {
            first.insert(0, &es[..unit.sequence_header_len]);
        }
    }
    VideoPayload::mpeg2(samples)
}

/// Which of a passthrough unit's samples a decoder can be started on, in step
/// with what [`mpeg2_payload`] emits.
///
/// Only the sample that opens a restart point is marked. The intra pictures
/// between restart points are not startable: an open group's leading B pictures
/// follow one in decode order and reference the group before it.
fn mpeg2_sync_samples(unit: &Mpeg2Unit, random_access: bool) -> Vec<bool> {
    let split_fields = unit.timeline.split_field_samples;
    let mut sync = Vec::with_capacity(unit.samples.len());
    for sample in &unit.samples {
        sync.push(sync.is_empty() && random_access && sample.sync);
        // The second field of a pair is half a picture, and no decoder starts
        // on one.
        if split_fields && sample.field_end.is_some() {
            sync.push(false);
        }
    }
    sync
}

/// How much of the presentation one fragment covers. The caller needs this
/// before it can decide how much audio belongs in the same fragment, which is
/// why it is separate from the muxing.
pub fn mpeg2_fragment_duration(timeline: &Mpeg2VideoTimeline, lead_in: UnitLeadIn) -> u64 {
    mpeg2_sample_timing(timeline, lead_in)
        .durations
        .iter()
        .map(|&d| d as u64)
        .sum()
}

/// The AAC access units that share a fragment with the video, and where the
/// audio track's own timeline has reached.
#[derive(Clone, Debug)]
pub struct Fmp4AudioSamples {
    pub config: AacConfig,
    pub samples: Vec<Vec<u8>>,
    pub base_decode_time: u64,
}

#[derive(Clone, Debug)]
pub struct Fmp4Fragment {
    /// Empty unless the fragment was asked to describe itself: MSE needs the
    /// initialization segment once, and again when the description changes.
    pub init_segment: Vec<u8>,
    pub media_segment: Vec<u8>,
    /// Empty when this fragment carries no initialization segment.
    pub mime_codec: String,
    pub sample_count: usize,
    /// Presentation time this fragment covers; see [`mpeg2_sample_timing`].
    pub duration: u64,
}

/// Package one unit of MPEG-2 video for incremental appending, carrying the
/// video through untouched.
///
/// `describe` asks for the initialization segment, which the caller wants from
/// the first fragment only: every unit opens with a sequence header, so there is
/// nothing in the unit itself to say which is which.
#[allow(clippy::too_many_arguments)]
pub fn mpeg2_gop_to_fmp4(
    es: &[u8],
    unit: &Mpeg2Unit,
    sequence_number: u32,
    presentation_start: u64,
    lead_in: UnitLeadIn,
    random_access: bool,
    describe: bool,
    audio: Option<&AacConfig>,
    audio_track: Option<&Fmp4AudioSamples>,
) -> Fmp4Fragment {
    let timing = mpeg2_sample_timing(&unit.timeline, lead_in);
    let sync_samples = mpeg2_sync_samples(unit, random_access);
    let video = mpeg2_payload(es, unit);
    let describe = describe.then(|| &es[..unit.sequence_header_len]);
    make_fragment(
        video,
        &unit.timeline,
        &timing,
        &sync_samples,
        describe,
        sequence_number,
        presentation_start,
        audio,
        audio_track,
    )
}

/// Where one picture a unit keeps is presented, for a player that decodes the
/// pictures itself.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct PicturePresentation {
    /// The picture's index in the unit; see [`Mpeg2Sample::picture`].
    pub picture: usize,
    /// Whether the picture after it is its second field.
    pub field_pair: bool,
    /// Presentation time on the 90 kHz movie timeline.
    pub time: u64,
    pub duration: u32,
}

/// Package one unit for a player that decodes its pictures itself: its sound
/// as a fragment with no video track, and where each picture it keeps is
/// presented, which is where [`mpeg2_gop_to_fmp4`] puts that picture's sample.
///
/// `describe` asks for an audio-only initialization segment. Neither segment
/// is made without sound to put in it.
pub fn mpeg2_decode_unit_to_fmp4(
    unit: &Mpeg2Unit,
    sequence_number: u32,
    presentation_start: u64,
    lead_in: UnitLeadIn,
    describe: bool,
    audio_track: Option<&Fmp4AudioSamples>,
) -> (Fmp4Fragment, Vec<PicturePresentation>) {
    let timing = mpeg2_sample_timing(&unit.timeline, lead_in);
    let mut decode_time = base_decode_time(presentation_start, &timing);
    let split_fields = unit.timeline.split_field_samples;
    let mut at = 0;
    let mut pictures = Vec::with_capacity(unit.samples.len());
    for sample in &unit.samples {
        let samples = if split_fields && sample.field_end.is_some() {
            2
        } else {
            1
        };
        let duration: u32 = timing.durations[at..at + samples].iter().sum();
        pictures.push(PicturePresentation {
            picture: sample.picture,
            field_pair: sample.field_end.is_some(),
            time: decode_time + u64::from(timing.compositions[at]),
            duration,
        });
        decode_time += u64::from(duration);
        at += samples;
    }
    let sound = audio_track.filter(|track| !track.samples.is_empty());
    let media_segment = sound.map_or_else(Vec::new, |track| {
        make_av_media_segment(
            &VideoPayload::mpeg2(Vec::new()),
            &[],
            &[],
            &[],
            &track.samples,
            sequence_number,
            0,
            track.base_decode_time,
        )
    });
    let (init_segment, mime_codec) = match sound.filter(|_| describe) {
        Some(track) => make_audio_init_segment(&track.config),
        None => (Vec::new(), String::new()),
    };
    (
        Fmp4Fragment {
            init_segment,
            media_segment,
            mime_codec,
            sample_count: 0,
            duration: timing.durations.iter().map(|&d| d as u64).sum(),
        },
        pictures,
    )
}

/// Decoding runs ahead of display by the reorder delay; a fragment at the
/// very start of the timeline has nowhere to put it and simply displays that
/// much later.
fn base_decode_time(presentation_start: u64, timing: &SampleTiming) -> u64 {
    presentation_start.saturating_sub(timing.reorder_delay as u64)
}

/// Put one fragment together. `describe` is the sequence header to build an
/// initialization segment from, when one is wanted.
#[allow(clippy::too_many_arguments)]
fn make_fragment(
    video: VideoPayload<'_>,
    timeline: &Mpeg2VideoTimeline,
    timing: &SampleTiming,
    sync_samples: &[bool],
    describe: Option<&[u8]>,
    sequence_number: u32,
    presentation_start: u64,
    audio: Option<&AacConfig>,
    audio_track: Option<&Fmp4AudioSamples>,
) -> Fmp4Fragment {
    let base_decode_time = base_decode_time(presentation_start, timing);
    let media_segment = match audio_track {
        Some(track) => make_av_media_segment(
            &video,
            &timing.durations,
            &timing.compositions,
            sync_samples,
            &track.samples,
            sequence_number,
            base_decode_time,
            track.base_decode_time,
        ),
        None => make_media_segment(
            &video,
            &timing.durations,
            &timing.compositions,
            sync_samples,
            sequence_number,
            base_decode_time,
        ),
    };
    let (init_segment, mime_codec) = match describe {
        Some(sequence_header) => make_init_segment(
            sequence_header,
            timeline.width,
            timeline.height,
            timeline.sample_aspect_ratio,
            audio,
        ),
        None => (Vec::new(), String::new()),
    };
    Fmp4Fragment {
        init_segment,
        media_segment,
        mime_codec,
        sample_count: video.len(),
        duration: timing.durations.iter().map(|&d| d as u64).sum(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 29.97 fps, and deliberately odd so a halved field duration cannot be
    /// exact: the two halves still have to add up to the frame.
    const FRAME: u32 = 3003;

    fn timeline(indices: &[u32], field_pairs: &[bool], split: bool) -> Mpeg2VideoTimeline {
        Mpeg2VideoTimeline {
            width: 720,
            height: 480,
            sample_duration: FRAME,
            decode_lead: FRAME,
            presentation_times: Vec::new(),
            sample_durations: Vec::new(),
            sample_scans: Vec::new(),
            presentation_indices: indices.to_vec(),
            field_pairs: field_pairs.to_vec(),
            split_field_samples: split,
            sample_aspect_ratio: None,
            hold_ticks: 0,
            lag_ticks: 0,
        }
    }

    /// Decode order I P B B, as an open group of pictures is coded.
    const IPBB: [u32; 4] = [1, 4, 2, 3];

    #[test]
    fn repeated_first_fields_extend_their_own_samples() {
        let mut timeline = timeline(&IPBB, &[false; 4], false);
        timeline.presentation_times = vec![0, 10_511, 3_003, 7_508];
        timeline.sample_durations = vec![3_003, 4_505, 4_505, 3_003];

        let timing = mpeg2_sample_timing(&timeline, UnitLeadIn::None);

        assert_eq!(timing.durations, [3_003, 4_505, 4_505, 3_003]);
        assert_eq!(timing.compositions, [4_505, 12_013, 0, 0]);
        assert_eq!(timing.reorder_delay, 4_505);
    }

    /// Decode order I P P P, a group coded without B pictures, which displays
    /// in the order it was coded in.
    const IPPP: [u32; 4] = [1, 2, 3, 4];

    /// The delay is what the decode timeline of a unit is set back by, and the
    /// units share one timeline, so a unit with nothing to reorder has to be
    /// set back as far as its neighbours. Measuring it from this unit alone
    /// left the group without B pictures a frame later than the group before
    /// it, which put its last sample on the decode time of the next group's
    /// first -- an overlap MSE resolves by dropping buffered frames back to a
    /// random access point.
    #[test]
    fn a_unit_with_nothing_to_reorder_is_still_held_back_a_frame() {
        let reordered = mpeg2_sample_timing(&timeline(&IPBB, &[false; 4], false), UnitLeadIn::None);
        let in_order = mpeg2_sample_timing(&timeline(&IPPP, &[false; 4], false), UnitLeadIn::None);
        assert_eq!(in_order.reorder_delay, reordered.reorder_delay);
        assert_eq!(in_order.reorder_delay, FRAME as i64);
        // Every picture displays a frame after it decodes, so none of them
        // moved: the offsets carry the delay rather than cancelling it.
        assert_eq!(in_order.compositions, vec![FRAME; 4]);
    }

    #[test]
    fn field_pairs_kept_together_take_one_sample_each() {
        let timing = mpeg2_sample_timing(&timeline(&IPBB, &[true; 4], false), UnitLeadIn::None);
        assert_eq!(timing.durations, vec![FRAME; 4]);
        assert_eq!(timing.reorder_delay, FRAME as i64);
        // The anchors lead their display slots; the B pictures catch up.
        assert_eq!(timing.compositions, vec![FRAME, FRAME * 3, 0, 0]);
    }

    #[test]
    fn split_field_pairs_take_two_samples_half_a_frame_apart() {
        let timing = mpeg2_sample_timing(&timeline(&IPBB, &[true; 4], true), UnitLeadIn::None);
        assert_eq!(
            timing.durations,
            vec![1501, 1502, 1501, 1502, 1501, 1502, 1501, 1502]
        );
        // Every field lands where its frame would have, then half a frame on.
        let mut decode_time = 0i64;
        let presentations: Vec<i64> = timing
            .durations
            .iter()
            .zip(&timing.compositions)
            .map(|(&duration, &composition)| {
                let at = decode_time + composition as i64;
                decode_time += duration as i64;
                at
            })
            .collect();
        let delay = timing.reorder_delay;
        assert_eq!(
            presentations,
            vec![
                delay,
                delay + 1501,
                delay + FRAME as i64 * 3,
                delay + FRAME as i64 * 3 + 1501,
                delay + FRAME as i64,
                delay + FRAME as i64 + 1501,
                delay + FRAME as i64 * 2,
                delay + FRAME as i64 * 2 + 1501,
            ]
        );
    }

    #[test]
    fn splitting_leaves_frame_pictures_and_the_total_alone() {
        let mixed = [true, false, true, false];
        let split = mpeg2_sample_timing(&timeline(&IPBB, &mixed, true), UnitLeadIn::None);
        let whole = mpeg2_sample_timing(&timeline(&IPBB, &mixed, false), UnitLeadIn::None);
        assert_eq!(split.durations, vec![1501, 1502, FRAME, 1501, 1502, FRAME]);
        let total = |timing: &SampleTiming| timing.durations.iter().map(|&d| d as u64).sum::<u64>();
        assert_eq!(total(&split), total(&whole));
        assert_eq!(split.reorder_delay, whole.reorder_delay);
    }

    /// A passthrough unit of four pictures, alternating field pairs with
    /// frames, laid over an elementary stream of one byte per coded picture --
    /// a field pair taking two of them.
    fn passthrough_unit(split: bool) -> Mpeg2Unit {
        let mixed = [true, false, true, false];
        let mut samples = Vec::new();
        let mut at = 0;
        for (index, &pair) in mixed.iter().enumerate() {
            let field_end = pair.then(|| at + 1);
            let end = at + if pair { 2 } else { 1 };
            samples.push(Mpeg2Sample {
                picture: index,
                start: at,
                field_end,
                end,
                sync: index == 0,
            });
            at = end;
        }
        Mpeg2Unit {
            timeline: timeline(&IPBB, &mixed, split),
            samples,
            sequence_header_len: 0,
        }
    }

    #[test]
    fn splitting_a_carried_field_pair_moves_a_boundary_and_nothing_else() {
        // Both fields are separate coded pictures already, so this is a matter
        // of not joining them: the same bytes reach the mdat either way, in the
        // same order, and only how many samples claim them changes.
        let es: Vec<u8> = (0..6).collect();
        let split = mpeg2_payload(&es, &passthrough_unit(true));
        let whole = mpeg2_payload(&es, &passthrough_unit(false));

        assert_eq!(split.len(), 6, "two field pairs take two samples each");
        assert_eq!(whole.len(), 4);
        assert_eq!(split.total_bytes(), whole.total_bytes());
        // The sample count has to match what the timing was worked out for, or
        // the fragment describes samples the mdat does not hold.
        assert_eq!(
            split.len(),
            mpeg2_sample_timing(
                &timeline(&IPBB, &[true, false, true, false], true),
                UnitLeadIn::None
            )
            .durations
            .len()
        );
        let bytes = |payload: &VideoPayload<'_>| {
            let mut out = Vec::new();
            for index in 0..payload.len() {
                payload.write_sample(index, &mut out);
            }
            out
        };
        assert_eq!(bytes(&split), bytes(&whole));
        assert_eq!(bytes(&split), es);
    }

    #[test]
    fn only_the_sample_a_restart_opens_on_is_a_sync_sample() {
        // A decoder starts on a whole picture, never on the second field of
        // one, and only where a restart point was asked for.
        assert_eq!(
            mpeg2_sync_samples(&passthrough_unit(true), true),
            vec![true, false, false, false, false, false]
        );
        assert_eq!(
            mpeg2_sync_samples(&passthrough_unit(true), false),
            vec![false; 6]
        );
    }

    #[test]
    fn the_track_is_as_wide_as_the_picture_is_to_be_seen() {
        let sar = |width, height| Some(SampleAspectRatio { width, height });
        // The two anamorphic shapes a broadcast comes in, and the square
        // sample that needs no stretch at all.
        assert_eq!(track_width(1440, sar(4, 3)), fixed16_16(1920));
        assert_eq!(track_width(720, sar(8, 9)), fixed16_16(640));
        assert_eq!(track_width(1920, sar(1, 1)), fixed16_16(1920));
        assert_eq!(track_width(1920, None), fixed16_16(1920));
        // A ratio that does not divide the width evenly keeps its fraction
        // rather than landing on a pixel: 704 * 40 / 33 is 853 and a third.
        assert_eq!(track_width(704, sar(40, 33)), 853 * 65536 + 21845);
    }
}
