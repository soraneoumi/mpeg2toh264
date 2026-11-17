//! Streaming a transport stream to fragmented MP4, in one object.
//!
//! This is the surface a browser needs: hand it file chunks, take fragments
//! back, append them to a `SourceBuffer`. Everything between -- demuxing, GOP
//! splitting, muxing, and putting the two tracks on a common timeline --
//! happens here rather than in the caller, because the timeline arithmetic is
//! the part most easily got wrong and it belongs next to the code it
//! constrains.

use std::sync::Arc;

use crate::container::adts::{
    aac_frame_count_through_video_time, silent_frame, AacConfig, AacFrame, AacUnit, AdtsOutput,
    AdtsStream, AudioGain, DualMono, AAC_FRAME_SAMPLES,
};
use crate::container::fmp4::{
    mpeg2_decode_unit_to_fmp4, mpeg2_fragment_duration, mpeg2_gop_to_fmp4, timed_mpeg2_unit,
    Fmp4AudioSamples, Fmp4Fragment, Mpeg2VideoTimeline, PicturePresentation, TimedUnit, UnitLeadIn,
};
use crate::container::mpegts::{AudioStream, ElementaryKind, ElementaryPacket, MpegTsAvDemuxer};
use crate::container::rff::RffState;
use crate::error::{Error, Result};
use crate::mpeg2::gop_stream::{DamagedPictures, EsChunk, Mpeg2Gop, Mpeg2GopStream, UnitTimestamp};
use crate::mpeg2::headers::{stream_sequence_description, Interlacing, SequenceDescription};
use crate::round_half_up;

const TIMESCALE: u64 = 90_000;
/// Put a restart point before one MSE eviction span grows beyond this size.
const MAX_RECOVERY_BYTES: usize = 32 * 1024 * 1024;

/// A hole this short is packet loss at its smallest, and repeating the
/// following access unit across it is less audible than the silence that would
/// otherwise go there. Longer ones are filled with silence instead.
const MAX_CONCEALED_AUDIO_FRAMES: u64 = 8;

/// Beyond this, a jump in the timestamps is not a hole in the recording but a
/// join between two of them. Holding a picture and playing silence across it
/// would make a viewer sit through the whole jump, so it is left as a gap in
/// the presentation instead -- see [`Session::open_a_gap`].
const MAX_HELD_TICKS: i64 = 30 * TIMESCALE as i64;

/// Groups in a row whose units' headers cannot be read, with no unit that can
/// between them, past which the stream is taken to be one this cannot read
/// rather than a damaged one: some seconds of it, however the groups are cut.
const MAX_UNREADABLE_GROUPS: usize = 16;

/// Sound read with no timestamp to place it, past which the stream is taken to
/// have stopped placing its sound and the count is trusted instead. A stream
/// stamps its sound at least every 0.7 seconds (ISO/IEC 13818-1 2.7.4), which
/// at the highest broadcast rate is 33 access units; this is twice that.
const MAX_UNPLACED_AUDIO_FRAMES: usize = 66;

/// The PES timestamp field is 33 bits and wraps every 26.5 hours (clause
/// 2.4.3.7), so the distance between two of them is modular.
const PTS_MODULUS: i64 = 1 << 33;

/// How far apart two timestamps, or two readings of one, have to be before a
/// unit is placed again from its own: what the retime check tolerates.
const RETIME_TOLERANCE: i64 = 2;

/// The timestamp `frames` access units before `pts`.
fn frames_before(pts: u64, frames: usize, sample_rate: u32) -> u64 {
    let ticks = round_half_up(
        (frames as u64 * AAC_FRAME_SAMPLES * TIMESCALE) as f64 / f64::from(sample_rate),
    ) as i64;
    (pts as i64 - ticks).rem_euclid(PTS_MODULUS) as u64
}

/// Cover a run of units lost to damage with copies of `neighbour`, or with
/// silence where the run is too long for a repeat or the neighbour was coded
/// in another configuration. Where neither can be had -- a layout no silence
/// can be made for, and no neighbour coded the same -- the unit is left out,
/// and false says so: the frames no longer stand one for one for the units.
fn cover_lost_run(
    run: &mut Vec<AacConfig>,
    neighbour: Option<&AacFrame>,
    frames: &mut Vec<AacFrame>,
) -> bool {
    let alike = neighbour.filter(|frame| run.iter().all(|config| *config == frame.config));
    let short = run.len() as u64 <= MAX_CONCEALED_AUDIO_FRAMES;
    let mut every_one = true;
    for config in run.drain(..) {
        let stand_in = alike
            .filter(|_| short)
            .cloned()
            .or_else(|| silent_frame(&config))
            .or_else(|| alike.cloned());
        match stand_in {
            Some(frame) => frames.push(frame),
            None => every_one = false,
        }
    }
    every_one
}

/// How a stretch of sound read with unbroken framing relates to what came
/// before it.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Framing {
    /// It carries on from the frames before it.
    Continues,
    /// Framing was taken up anew after bytes were lost, or after bytes that
    /// held no frame where one should have begun.
    Recovers,
    /// Framing was taken up anew with nothing lost: the first frame of the
    /// sound, of a stream the sound moved to, or after a new time base.
    Begins,
}

/// A difference of timestamps taken across the wrap, so that one a little
/// before another comes out negative rather than as most of 26.5 hours.
fn signed_ticks(difference: i64) -> i64 {
    (difference + PTS_MODULUS / 2).rem_euclid(PTS_MODULUS) - PTS_MODULUS / 2
}

/// Ticks from `origin` to `pts`, across however many wraps lie between them.
fn ticks_since(origin: i64, pts: i64) -> u64 {
    (pts - origin).rem_euclid(PTS_MODULUS) as u64
}

/// What to do with the source video. There is no default: a caller names one.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VideoMode {
    /// Carry the MPEG-2 through into the MP4 as it stands, for a player whose
    /// decoder handles it. The picture is the broadcast's own and the
    /// packaging costs almost nothing -- but a decoder that does not take
    /// MPEG-2 plays none of it.
    Passthrough,
    /// Hand the MPEG-2 out for the caller to decode, and put only the sound
    /// into the MP4: the media element plays the sound and keeps the clock
    /// the pictures are shown by. Groups are always cut into anchor units.
    /// Needs AAC sound.
    Decode,
}

/// What a periodic recovery boundary does with the leading pictures of an open
/// group, which are predicted from the group before it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OpenGopRecovery {
    /// Keep every leading picture. Passthrough marks the fragment that opens
    /// at the boundary as a random access point when it opens with an intra
    /// picture; decode mode has no video track to mark, so nothing changes
    /// there.
    RecoveryPoint,
    /// Drop the leading pictures and begin again at the intra picture, as at
    /// the start of the stream. Passthrough marks the fragment a random access
    /// point, and decode mode hands the unit out with `restart` set so that
    /// nothing from before it is used as a reference.
    Discard,
}

/// Whether a pair of fields is split into two samples unless the options say
/// otherwise.
pub(crate) const DEFAULT_SPLIT_FIELD_SAMPLES: bool = true;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct SessionOptions {
    /// Put a recovery boundary at every this many groups. What the boundary
    /// does is selected by [`Self::open_gop_recovery`]. A boundary also falls
    /// once 32 MiB of media has gone out since the last random access point,
    /// and zero leaves only that.
    pub recovery_interval: usize,
    /// What a recovery boundary does with an open group's leading pictures.
    pub open_gop_recovery: OpenGopRecovery,
    /// Put the two coded fields of a complementary pair in separate MP4
    /// samples. Only [`VideoMode::Passthrough`] reads it: decode mode has no
    /// video track, and a pair is one picture to whoever decodes it. The bytes
    /// of the elementary stream are the same either way; what moves is where
    /// one sample ends and the next begins.
    pub split_field_samples: bool,
    /// What becomes of the pictures.
    pub video: VideoMode,
    /// Cut each group of pictures into units of one anchor picture and the B
    /// pictures coded after it, each of which becomes a fragment of its own.
    /// The pictures and their timing are the same either way; only the
    /// fragment boundaries move, so that media can be handed on as soon as it
    /// has arrived rather than once its group has. [`VideoMode::Decode`]
    /// always cuts them.
    pub split_groups: bool,
}

impl SessionOptions {
    /// The options for `video`, with a recovery boundary every 24 groups that
    /// keeps the leading pictures, split field samples, and whole groups.
    pub fn new(video: VideoMode) -> Self {
        Self {
            recovery_interval: 24,
            open_gop_recovery: OpenGopRecovery::RecoveryPoint,
            split_field_samples: DEFAULT_SPLIT_FIELD_SAMPLES,
            video,
            split_groups: false,
        }
    }
}

/// Field metadata taking effect at one media time.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct VideoScan {
    pub start: f64,
    pub scan: Interlacing,
}

/// One thing to hand to Media Source Extensions.
#[derive(Clone, Debug)]
pub enum Fragment {
    /// An initialization segment, emitted before the media it describes.
    ///
    /// Normally there is one, at the start. A stream that changes its frame
    /// size, its field coding or its aspect ratio cannot be described by it
    /// any longer, so another goes out in front of the first fragment coded
    /// under the new description -- which is a fragment a decoder can start
    /// on, since nothing else can activate it.
    Init {
        data: Vec<u8>,
        /// The MIME type to open the `SourceBuffer` with.
        mime_codec: String,
        /// Coded pixels, before the sample aspect ratio stretches them.
        width: u32,
        height: u32,
    },
    /// One unit of media: a whole GOP, or, when the session cuts groups, one
    /// anchor picture of it with the B pictures coded after it.
    Media {
        data: Vec<u8>,
        /// Where this fragment starts on the presentation timeline, in seconds.
        start: f64,
        /// Whether a decoder can begin here. A player needs this, with `start`,
        /// to evict buffered media without cutting into what is about to play.
        random_access: bool,
        /// Recent PAT/PMT start from which a new session for the same service
        /// can demux this GOP, relative to this session's first input byte.
        /// None for a fragment that continues a group: a session opening
        /// there would skip to the next group, which starts later than this.
        restart_offset: Option<u64>,
        video_samples: usize,
        audio_samples: usize,
        /// Picture-accurate field changes in presentation order.
        scans: Vec<VideoScan>,
    },
    /// One unit of MPEG-2 for the caller to decode, in decode mode only. It
    /// follows the `Media` fragment carrying the same unit's sound, where
    /// the unit has any.
    Video {
        /// The unit's elementary stream, which `parse_elementary_stream`
        /// splits into the pictures named below.
        data: Vec<u8>,
        /// Where the unit starts on the presentation timeline, in seconds:
        /// the `start` of its `Media` fragment.
        start: f64,
        /// References decoded before this unit must not be used.
        restart: bool,
        /// Whether the unit opens with an intra picture, where decoding can
        /// begin after a jump.
        intra: bool,
        /// The pictures to decode, in decode order.
        pictures: Vec<VideoPicture>,
    },
    /// A private PES payload selected from the same service as the media.
    /// It is kept out of fMP4 and exposed to browser consumers as an event.
    PrivateStream {
        stream_id: u8,
        pid: u16,
        data: Vec<u8>,
        /// Absolute 90 kHz timestamp, supplemented from accompanying media for
        /// an untimed character-superimpose PES.
        pts: Option<u64>,
    },
}

/// One coded frame of a [`Fragment::Video`] unit.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct VideoPicture {
    /// Index of the frame picture, or of the first field, in the pictures
    /// `parse_elementary_stream` returns for the unit.
    pub picture: usize,
    /// Index of the second field, for a frame coded as two fields.
    pub second_field: Option<usize>,
    /// Presentation time in seconds, where the sample would sit in the MP4
    /// the other modes make.
    pub time: f64,
    /// How long it is shown, in seconds.
    pub duration: f64,
}

/// A unit that is complete and waiting for the sound that goes out beside it.
///
/// Whether it can go is asked again at every packet that arrives, so what
/// that question costs is kept down to what changed since it was last asked:
/// the unit is shared rather than copied for the asking, and its headers are
/// walked once.
struct WaitingUnit {
    gop: Arc<Mpeg2Gop>,
    timing: Option<KeptTiming>,
    /// Where the unit's timestamps were taken to put it, once that is decided;
    /// see [`Session::believed_start`]. It is the start of the unit's first
    /// display slot, which no change of plan moves, and it is decided once so
    /// that waiting for the sound cannot change it between one look and the
    /// next.
    belief: Option<Option<i64>>,
    /// What the unit counts to as a later one in the queue; see
    /// [`Session::next_unit_confirms`].
    probe: Option<Probe>,
}

/// What a unit counts to, asked of it as one of the units after the one being
/// judged.
struct Probe {
    /// The display slots of its group it was counted after, which is what the
    /// units before it decide.
    consumed: u32,
    /// `None` for a unit that cannot be read.
    counted: Option<Counted>,
}

struct Counted {
    starts: Vec<i64>,
    slots_after: u32,
    span_ticks: u64,
}

/// What the queue says of a claim about a unit's start.
enum Evidence {
    Confirms,
    Contradicts,
    /// Nothing that can say so has arrived.
    Pending,
    /// Nothing that can say so can be counted against it: the stream breaks
    /// before it does, and a claim with no witness is not believed.
    Unavailable,
}

impl WaitingUnit {
    fn new(gop: Mpeg2Gop) -> Self {
        Self {
            gop: Arc::new(gop),
            timing: None,
            belief: None,
            probe: None,
        }
    }
}

/// The walk of a unit's headers, and what it was drawn for. The same unit
/// asked the same thing gives the same walk.
struct KeptTiming {
    has_references: bool,
    before: RffState,
    consumed: u32,
    timed: TimedUnit,
}

/// What the video of one unit turns into, and what the muxer needs to know
/// about it.
///
/// Both paths cut the same source pictures out of a unit, so the timeline
/// underneath is the same. Where a fragment opens the presentation, the display
/// slots of an open GOP's leading pictures are covered by showing the first
/// picture for longer.
enum UnitPlan {
    Passthrough(TimedUnit),
    Decode(TimedUnit),
}

impl UnitPlan {
    fn timed(&self) -> &TimedUnit {
        match self {
            Self::Passthrough(unit) | Self::Decode(unit) => unit,
        }
    }

    fn timeline(&self) -> &Mpeg2VideoTimeline {
        &self.timed().unit.timeline
    }

    fn timeline_mut(&mut self) -> &mut Mpeg2VideoTimeline {
        match self {
            Self::Passthrough(unit) | Self::Decode(unit) => &mut unit.unit.timeline,
        }
    }

    fn lead_in(&self, restarts: bool) -> UnitLeadIn {
        if restarts {
            UnitLeadIn::FirstPicture
        } else {
            UnitLeadIn::None
        }
    }
}

/// What planning the unit at the head of the queue came to.
enum Planned {
    /// Its headers cannot be read; the caller drops it.
    Dropped,
    /// Its timestamps cannot be judged until a later unit has arrived.
    Waiting,
    /// The plan, and where the unit's first display slot starts as its
    /// timestamps are believed, in the source's own 90 kHz clock, or `None` when
    /// the unit has none that can be believed.
    Unit(Box<(UnitPlan, Option<i64>)>),
}

/// A unit that is going out, waiting only to be packaged.
struct Ready {
    gop: Mpeg2Gop,
    audio: Vec<AacFrame>,
    plan: UnitPlan,
    /// See [`Planned::Unit`].
    start: Option<i64>,
    restarts: bool,
}

/// A packet of sound whose timestamp is not where the count of access units
/// puts it -- frames missing in front of it, or time gone backwards -- held
/// back until something else says so too.
struct ClaimedAudio {
    pts: u64,
    /// Whether the first timestamp of the sound is in question as well: this
    /// packet disagrees with it, and either may be the damaged one.
    first_in_question: bool,
    /// How many access units the timestamp puts the clock ahead of its count,
    /// negative for behind.
    deficit: i64,
    /// The packet's first frame, which is what a short hole is covered with.
    first: AacFrame,
    frames: Vec<AacFrame>,
}

/// What packaging one unit made.
struct Packaged {
    fragment: Fmp4Fragment,
    /// Whether the fragment carries a recovery point.
    recovery_point: bool,
    lag: UnitLag,
    /// Where the pictures handed out for decoding are presented. Empty on
    /// the paths that mux the video.
    pictures: Vec<PicturePresentation>,
}

/// How a unit sits against the display clock of its group, worked out from the
/// timeline that is finally packaged.
struct UnitLag {
    /// Ticks to add to every composition offset of the unit.
    ticks: u32,
    /// The lead the unit takes up; see [`Mpeg2VideoTimeline::catch_up_ticks`].
    catch_up: u32,
    /// How far the display clock runs ahead of the decode clock once the unit
    /// has gone out.
    lead: u64,
    /// Whether anything of the unit's group has been laid down once it has
    /// gone out.
    group_laid_down: bool,
}

/// How the video reaches the MP4.
enum VideoPipeline {
    /// Carried through as MPEG-2, where an intra picture is already everything
    /// a recovery point has to be: nothing is flushed, nothing is coded, and
    /// the pictures around it are the source's own.
    Passthrough {
        /// No picture can be carried until one arrives that a decoder can
        /// start on.
        awaiting_intra: bool,
        /// A periodic restart point is due, and goes to the next unit that
        /// opens with an intra picture.
        recovery_pending: bool,
        split_field_samples: bool,
    },
    /// Handed out for the caller to decode, with only the sound muxed.
    Decode {
        /// As for passthrough: nothing is kept until an intra picture.
        awaiting_intra: bool,
    },
}

impl VideoPipeline {
    /// Whether the next unit has to be one a decoder can begin at. The MP4
    /// timeline has to reach the same verdict on the same pictures, so it asks.
    fn awaiting_random_access(&self) -> bool {
        match self {
            Self::Passthrough { awaiting_intra, .. } | Self::Decode { awaiting_intra } => {
                *awaiting_intra
            }
        }
    }

    fn request_recovery_point(&mut self) {
        match self {
            Self::Passthrough {
                recovery_pending, ..
            } => *recovery_pending = true,
            // No video track, so no sample to mark.
            Self::Decode { .. } => {}
        }
    }

    /// Begin again at the next picture a decoder can start on.
    ///
    /// Asked for when what follows is coded under a description the one in
    /// force cannot serve, and when a hole has to be held over: the sample that
    /// does the holding is the one covering a random access point's leading
    /// display slots, and a unit that continues the one before it has none.
    ///
    /// Nothing before the restart is thrown away: the fragments already out
    /// keep playing, and the ones after them open a new description on the same
    /// timeline. What cannot be carried across it is prediction, so the video
    /// waits for an intra picture, which needs none.
    fn request_random_access(&mut self) {
        match self {
            Self::Passthrough { awaiting_intra, .. } | Self::Decode { awaiting_intra } => {
                *awaiting_intra = true
            }
        }
    }

    fn split_field_samples(&self) -> bool {
        match self {
            Self::Passthrough {
                split_field_samples,
                ..
            } => *split_field_samples,
            // A pair is one picture to whoever decodes it.
            Self::Decode { .. } => false,
        }
    }
}

/// Streaming conversion of one transport stream to fragmented MP4.
pub struct Session {
    demuxer: MpegTsAvDemuxer,
    gops: Mpeg2GopStream,
    adts: AdtsStream,
    video: VideoPipeline,
    recovery_point_gop_interval: usize,
    open_gop_recovery: OpenGopRecovery,

    sequence_number: u32,
    /// Where the next fragment starts, in 90 kHz ticks. This is the decode
    /// clock: it advances by what the pictures laid down last, and the sound is
    /// paired against it.
    video_presentation_start: u64,
    audio_frames_emitted: u64,
    /// Groups that went out, which is what the recovery interval counts: the
    /// units of a cut group count once.
    gops_emitted: usize,
    /// How many display slots of the group the last unit belonged to have been
    /// used up, so that the next unit, if it continues that group, counts its
    /// own from there. It moves when a unit is finished and not while one is
    /// only being planned, which happens again for as long as the unit waits
    /// for its sound.
    slots_consumed: u32,
    /// How far the display clock runs ahead of the decode clock. Pictures the
    /// source lost leave their display slots empty without moving the decode
    /// clock, and the units after them have to keep their places all the
    /// same. The next unit that opens a group takes it up.
    lead: u64,
    /// Whether a unit of the group the last unit belonged to has been laid
    /// down, which is what the units continuing it are placed after.
    group_laid_down: bool,
    media_bytes_since_random_access: usize,
    initialized: bool,
    /// What the video that went out is coded under, and so what a unit has to
    /// be coded under to follow it: the initialization segment's description
    /// when the video is muxed, the last unit handed out when it is decoded by
    /// the caller.
    described: Option<SequenceDescription>,
    /// The same for the sound, which that segment describes as well.
    described_audio: Option<AacConfig>,
    /// Whether the next fragment has to carry an initialization segment: the
    /// first one does, and so does the first one after a stream changes what
    /// its sequence header says -- or, where the pictures are handed out and
    /// the segment holds only the sound, what the sound is described by.
    describe_pending: bool,

    pending_gops: Vec<WaitingUnit>,
    pending_audio: Vec<AacFrame>,
    /// Units dropped because their headers could not be read, which count
    /// among the errors.
    unreadable_units: u64,
    /// The first error of the unreadable units since the last one that could
    /// be read, and how many groups they have opened.
    unreadable_run: Option<(Error, usize)>,
    audio_config: Option<AacConfig>,

    /// Where the first access unit of the sound is, in 90 kHz units, once the
    /// first timestamp has been confirmed -- or, where it was the damaged
    /// one, projected back from the timestamp that outvoted it.
    audio_start_pts: Option<u64>,
    /// Which elementary stream the sound is being read from, so that a
    /// programme moving it to another one is noticed.
    audio_pid: Option<u16>,
    /// PTS and frame count used to notice missing AAC access units.
    audio_clock_start_pts: Option<u64>,
    audio_clock_frames: u64,
    audio_clock_sample_rate: Option<u32>,
    /// Whether the sound is being joined from another elementary stream, and so
    /// may be carrying moments that have already been laid down.
    audio_realigning: bool,
    /// The packet of sound whose timestamp claims a jump, until the next one
    /// agrees or the input ends. Its frames are in no queue, so nothing reads
    /// them before the claim is settled; see [`Session::conceal_audio_gap`].
    audio_claim: Option<ClaimedAudio>,
    /// The first timestamp the sound carried, until the next one agrees with
    /// it, when it becomes `audio_start_pts`.
    audio_first: Option<u64>,
    /// Ticks of sound laid down at other sample rates before the count it is
    /// measured by started, which the track start is that much before where
    /// that count's start puts it. Nonzero only while `audio_first` waits.
    audio_first_prior: i64,
    /// Where the audio track begins on the shared timeline, once it is fixed.
    audio_origin_ticks: u64,
    /// The last access unit read from the sound being followed, which a short
    /// run of units lost to damage is covered with.
    last_audio_frame: Option<AacFrame>,
    /// Whether the sound being read has no place yet, framing having been
    /// taken up anew with no timestamp since; see [`Session::lay_audio`].
    audio_awaiting_place: bool,
    /// What has been read since, in order.
    audio_unplaced: Vec<AacFrame>,
    /// A timestamp that arrived for it before the frame it names was read:
    /// that frame's position in `audio_unplaced`, and the timestamp.
    audio_unplaced_anchor: Option<(usize, u64)>,
    /// The PES timestamp presentation time zero stands for. Supplied by a
    /// caller resuming mid-file, and worked out from the stream otherwise.
    timeline_origin: Option<i64>,
    timelines_aligned: bool,

    /// Where the next unit's first display slot is expected, in the source's
    /// own timestamps: where the display clock has reached. A unit that opens
    /// later than this, by a timestamp that is believed, has a hole in front
    /// of it -- pictures the recording lost, or ones that would not decode.
    ///
    /// It moves with the display clock. Slots left empty inside a group are
    /// shown empty and are no hole; a unit that opens a group and shows
    /// nothing leaves its own span to be counted as part of the next one's.
    /// A unit that opens a group with a timestamp that is believed reads it
    /// from there instead of accumulating; see [`Session::believed_start`].
    expected_pts: Option<i64>,
    /// Whether `expected_pts` is known not to be where the source has reached:
    /// nothing has been read from the stream yet, it broke since, or a unit was
    /// lost or laid down no picture. A timestamp is then the only thing to go
    /// by, and the first one is taken as it is. Cleared when a unit that opens
    /// a group reads `expected_pts` from its timestamp.
    count_broken: bool,
    /// Source field clock and the end time already committed across GOPs.
    rff: RffState,
}

impl Session {
    pub fn new(options: SessionOptions) -> Self {
        Self::anchored(options, None)
    }

    /// Take one named service out of a transport stream that carries several.
    ///
    /// A recording of a broadcast is not always of one programme: a
    /// broadcaster's sub-channel rides in the same transport stream with its
    /// own video and its own audio. Without being told which to take, the
    /// session takes whichever program map turns up first, which is stable for
    /// a given recording but is not a choice anyone made.
    pub fn for_service(
        options: SessionOptions,
        origin_ticks: Option<u64>,
        service_id: Option<u16>,
    ) -> Self {
        Self {
            demuxer: MpegTsAvDemuxer::for_service(service_id),
            ..Self::anchored(options, origin_ticks)
        }
    }

    /// The service the fragments are being made from, once a program map has
    /// named it, and every service the stream has announced.
    pub fn service_id(&self) -> Option<u16> {
        self.demuxer.service_id()
    }

    pub fn service_ids(&self) -> &[u16] {
        self.demuxer.service_ids()
    }

    /// Every sound stream the chosen service offers, and which of them the
    /// fragments are being made from.
    pub fn audio_streams(&self) -> &[AudioStream] {
        self.demuxer.audio_streams()
    }

    pub fn audio_pid(&self) -> Option<u16> {
        self.demuxer.audio_pid()
    }

    /// Take the sound from another of the service's streams from here on.
    ///
    /// Only from here on: the fragments already made carry the sound that was
    /// chosen when they were made, and they have been appended. What changes is
    /// what the next fragment is built from -- and where the two streams are
    /// described differently, which a bilingual broadcast's second sound often
    /// is, that fragment carries an initialization segment saying so, exactly as
    /// a programme boundary that changes the sound does.
    pub fn select_audio(&mut self, pid: u16) {
        self.demuxer.select_audio(pid);
    }

    /// Whether the sound being read carries two services in one stream rather
    /// than a stereo pair, as the frames read so far had it.
    ///
    /// The program map says so too, in the audio component descriptor, and says
    /// it before a frame has been read -- see [`AudioStream::dual_mono`]. This
    /// is the stream itself, which is what a broadcast that turns dual mono on
    /// within a programme leaves the map disagreeing with.
    pub fn audio_is_dual_mono(&self) -> bool {
        self.adts.is_dual_mono()
    }

    /// Take the sound of a dual-mono stream from this service from here on.
    ///
    /// Both services are rebuilt into the same two-channel configuration, so
    /// unlike moving to another elementary stream this describes nothing anew:
    /// the frames on either side of the change sit in the same fragment as
    /// readily as in two.
    pub fn select_dual_mono(&mut self, service: DualMono) {
        self.adts.select_dual_mono(service);
    }

    /// Raise the sound of every audio frame read from here on. See
    /// [`AudioGain`]. Nothing about the sound's description changes, so this
    /// can be set at any point without a new initialization segment.
    pub fn set_audio_gain(&mut self, gain: AudioGain) {
        self.adts.set_audio_gain(gain);
    }

    pub fn dropped(&self) -> u64 {
        self.demuxer.dropped()
    }
    pub fn scrambled(&self) -> u64 {
        self.demuxer.scrambled()
    }
    pub fn errors(&self) -> u64 {
        self.demuxer.errors() + self.unreadable_units
    }

    /// Start a session whose timeline is measured from a PES timestamp of the
    /// caller's choosing, rather than from wherever this input happens to open.
    ///
    /// This is what makes a stream that begins mid-file playable: fed the
    /// origin an earlier session reported, the fragments it produces carry the
    /// presentation times they hold in the whole file, and a player can append
    /// them where the viewer asked to be.
    pub fn anchored(options: SessionOptions, origin_ticks: Option<u64>) -> Self {
        Self {
            demuxer: MpegTsAvDemuxer::new(),
            // A player decoding the pictures itself takes each as soon as it
            // has arrived.
            gops: Mpeg2GopStream::with_split_groups(
                options.split_groups || options.video == VideoMode::Decode,
            )
            // A picture with slices missing is ours to conceal when we decode
            // it. Passed through, it goes to a platform decoder nobody has
            // seen take one, and an error there ends playback, so only whole
            // pictures go that way.
            .with_damaged_pictures(match options.video {
                VideoMode::Passthrough => DamagedPictures::Drop,
                VideoMode::Decode => DamagedPictures::Conceal,
            }),
            adts: AdtsStream::new(),
            video: match options.video {
                VideoMode::Passthrough => VideoPipeline::Passthrough {
                    awaiting_intra: true,
                    recovery_pending: false,
                    split_field_samples: options.split_field_samples,
                },
                VideoMode::Decode => VideoPipeline::Decode {
                    awaiting_intra: true,
                },
            },
            recovery_point_gop_interval: options.recovery_interval,
            open_gop_recovery: options.open_gop_recovery,
            sequence_number: 1,
            video_presentation_start: 0,
            audio_frames_emitted: 0,
            gops_emitted: 0,
            slots_consumed: 0,
            lead: 0,
            group_laid_down: false,
            media_bytes_since_random_access: 0,
            initialized: false,
            described: None,
            described_audio: None,
            describe_pending: true,
            pending_gops: Vec::new(),
            pending_audio: Vec::new(),
            unreadable_units: 0,
            unreadable_run: None,
            audio_config: None,
            audio_start_pts: None,
            audio_pid: None,
            audio_clock_start_pts: None,
            audio_clock_frames: 0,
            audio_clock_sample_rate: None,
            audio_realigning: false,
            audio_claim: None,
            audio_first: None,
            audio_first_prior: 0,
            audio_origin_ticks: 0,
            last_audio_frame: None,
            audio_awaiting_place: false,
            audio_unplaced: Vec::new(),
            audio_unplaced_anchor: None,
            timeline_origin: origin_ticks.map(|ticks| ticks as i64),
            timelines_aligned: false,
            expected_pts: None,
            count_broken: true,
            rff: RffState::default(),
        }
    }

    /// The PES timestamp presentation time zero stands for, once the opening
    /// fragment has fixed it. Hand it to [`Session::anchored`] to continue this
    /// timeline from somewhere else in the same file.
    pub fn origin_ticks(&self) -> Option<u64> {
        self.timeline_origin
            .map(|origin| origin.rem_euclid(PTS_MODULUS) as u64)
    }

    /// Feed the next slice of the transport stream, taking back whatever
    /// fragments it completed. A chunk that completes nothing returns nothing;
    /// that is normal and not an error.
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<Fragment>> {
        let packets = self.demuxer.push(chunk)?;
        let mut out = Vec::new();
        self.consume_elementary(packets, &mut out)?;
        Ok(out)
    }

    /// Flush everything held back, at end of input.
    pub fn finish(&mut self) -> Result<Vec<Fragment>> {
        let packets = self.demuxer.finish()?;
        let mut out = Vec::new();
        self.consume_elementary(packets, &mut out)?;

        self.pending_gops
            .extend(self.gops.finish().into_iter().map(WaitingUnit::new));
        self.accept_audio_claim();
        // A stream with one packet of sound, or none after the first that
        // carries a timestamp, has nothing to disagree with it.
        if let Some(first) = self.audio_first.take() {
            self.audio_start_pts = Some(first);
        }
        let read = self.adts.finish()?;
        let final_audio = self.last_of_audio_stream(read);
        if self.audio_config.is_none() {
            self.audio_config = final_audio.first().map(|frame| frame.config.clone());
        }
        self.pending_audio.extend(final_audio);
        self.flush_pending(true, &mut out)?;
        Ok(out)
    }

    fn consume_elementary(
        &mut self,
        packets: Vec<ElementaryPacket>,
        out: &mut Vec<Fragment>,
    ) -> Result<()> {
        for packet in packets {
            self.ingest_packet(packet, out)?;
            self.flush_pending(false, out)?;
        }
        Ok(())
    }

    fn ingest_packet(&mut self, packet: ElementaryPacket, out: &mut Vec<Fragment>) -> Result<()> {
        {
            match packet.kind {
                ElementaryKind::Video => {
                    // A discontinuity marker leaves the bytes on both sides of it
                    // whole and the stream broken, which the units after it have
                    // to know. A loss the splitter is told of with the bytes.
                    if packet.time_base_break {
                        self.gops.note_break();
                    }
                    let units = self.gops.push(EsChunk {
                        data: &packet.data,
                        pes_start: packet.pes_start,
                        pts: packet.pts,
                        dts: packet.dts,
                        restart_offset: packet.restart_offset,
                        gap_before: packet.gap_before,
                    });
                    self.pending_gops
                        .extend(units.into_iter().map(WaitingUnit::new));
                }
                ElementaryKind::Audio => {
                    let switching = self.audio_pid.is_some_and(|pid| pid != packet.pid);
                    // Framing taken up at the start of what was read lost
                    // nothing where the sound itself begins anew.
                    let begins = !packet.gap_before
                        && (switching || self.audio_pid.is_none() || packet.time_base_break);
                    // Whatever the claim in hand turns out to be, its frames
                    // come before this packet's. A packet from another stream
                    // cannot confirm what the stream before it claimed, so
                    // the claim is not believed.
                    if switching {
                        self.lay_audio_claim_by_count();
                    }
                    let break_reported = packet.gap_before || packet.time_base_break;
                    if packet.time_base_break {
                        self.adts.discard_pending();
                    }
                    // A programme that moves its sound to another elementary
                    // stream leaves the reader holding the start of a frame the
                    // old one was cut in the middle of. Joining that to the new
                    // stream's bytes makes one access unit belonging to neither:
                    // its header still walks, so nothing downstream drops it,
                    // and a browser's audio decoder refuses it outright rather
                    // than concealing it -- which ends playback. So the old
                    // stream is finished off before the new one begins.
                    if switching {
                        let read = self.adts.finish()?;
                        let tail = self.last_of_audio_stream(read);
                        // The new stream's units are not the old one's to stand in for.
                        self.last_audio_frame = None;
                        self.audio_clock_frames += tail.len() as u64;
                        self.pending_audio.extend(tail);
                        // The stream being joined carries the same moments as
                        // the one being left, and whichever of them are already
                        // on the track are not put there twice.
                        self.audio_realigning = true;
                    }
                    self.audio_pid = Some(packet.pid);
                    let output = self.adts.push(&packet.data, packet.gap_before)?;
                    // A PES timestamp names the first access unit that begins
                    // in the PES (ISO/IEC 13818-1 2.4.3.7), which comes after
                    // any finished here that began in the PES before: those
                    // are that many frames earlier. Taking it for the first
                    // unit read would lay every such packet a frame late.
                    let named = packet.pts.and(output.commencing);
                    // The stretches of unbroken framing in what was read,
                    // last first, each with whether it opens with a restart.
                    let mut units = output.units;
                    let mut stretches = Vec::new();
                    for &restart in output.restarts.iter().rev() {
                        let framing = if restart == 0 && begins {
                            Framing::Begins
                        } else {
                            Framing::Recovers
                        };
                        stretches.push((restart, framing, units.split_off(restart)));
                    }
                    if !units.is_empty() || stretches.is_empty() {
                        stretches.push((0, Framing::Continues, units));
                    }
                    stretches.reverse();
                    let last = stretches.len() - 1;
                    let mut laid = Vec::with_capacity(stretches.len());
                    for (index, (start, framing, units)) in stretches.into_iter().enumerate() {
                        let count = units.len();
                        let (frames, one_for_one) = self.stand_in_for_lost(units);
                        // The unit named may be one this stretch has not
                        // finished yet, but only in the last stretch.
                        let anchor = named
                            .filter(|&n| n >= start && (n < start + count || index == last))
                            .filter(|_| one_for_one)
                            .zip(packet.pts)
                            .map(|(n, pts)| (n - start, pts));
                        laid.push((framing, frames, anchor));
                    }
                    // The claim in hand is decided by this packet only where
                    // its first frame carries on from the claim's and has its
                    // place from this packet's timestamp.
                    if !switching {
                        let next = laid.first().and_then(|(framing, frames, anchor)| {
                            let (position, pts) = (*anchor)?;
                            let rate = frames.get(position).or(frames.last())?.config.sample_rate;
                            (*framing == Framing::Continues && !self.audio_awaiting_place)
                                .then(|| frames_before(pts, position, rate))
                        });
                        self.settle_audio_claim(next);
                    }
                    for (framing, frames, anchor) in laid {
                        self.lay_audio(framing, frames, anchor, break_reported);
                    }
                }
                ElementaryKind::PrivateStream1 | ElementaryKind::PrivateStream2 => {
                    out.push(Fragment::PrivateStream {
                        stream_id: if packet.kind == ElementaryKind::PrivateStream1 {
                            0xbd
                        } else {
                            0xbf
                        },
                        pid: packet.pid,
                        data: packet.data,
                        pts: packet.pts,
                    });
                }
            }
        }
        Ok(())
    }

    /// Fill a hole in the sound, so that what follows it stays where the source
    /// put it.
    ///
    /// The audio track is laid down access unit by access unit, so a frame the
    /// recording lost is not a hole in the track: everything after it moves up
    /// into the space, and the sound runs ahead of the picture by that much for
    /// the rest of the stream. A few frames are covered by repeating the one
    /// that follows them, which is less audible than a stutter of silence;
    /// anything longer is filled with silence outright.
    ///
    /// The picture is held over the same hole, so the two stay together --
    /// see [`Session::hold_over_hole`].
    ///
    /// A timestamp that is not where the count of access units puts it, ahead
    /// or behind, is not taken at its word, though: one damaged byte that the
    /// transport did not report makes one just as well, and filling the jump
    /// would put seconds of silence into the track, or move the clock back and
    /// make the next intact packet look like a jump. It is believed when the
    /// stream reported a break at this packet, or when the packet after it
    /// carries on from where it lands. Until then the packet waits in
    /// `audio_claim`, out of every queue, and what is not believed is laid down
    /// by count, as if it had no timestamp.
    ///
    /// The same goes for the first timestamp the sound carries, which places
    /// the whole track: see `audio_first`. It is confirmed by the next packet
    /// that carries frames, or outvoted by it when a third agrees with that
    /// one. What that costs is one audio PES of waiting at the start of a
    /// stream, and again at the start of every seek leg, which is a new
    /// session; two when the first two disagree. A genuine hole between the
    /// first and second PES is closed up rather than filled, because from the
    /// sound alone it cannot be told from a damaged first timestamp, and this
    /// confines the error to that first packet.
    fn conceal_audio_gap(
        &mut self,
        pts: Option<u64>,
        break_reported: bool,
        frames: &mut Vec<AacFrame>,
    ) {
        let Some(first) = frames.first().cloned() else {
            return;
        };
        let rate = first.config.sample_rate;
        let Some(pts) = pts else {
            self.audio_clock_frames += frames.len() as u64;
            return;
        };
        let fresh =
            self.audio_clock_sample_rate != Some(rate) || self.audio_clock_start_pts.is_none();
        // Where the track would start if this packet carried on from the
        // frames before it, which is what a first timestamp that is waiting to
        // be confirmed becomes when the count starts again for another rate.
        let earlier_ticks = self
            .audio_clock_sample_rate
            .filter(|_| fresh && self.audio_first.is_some())
            .map(|old| self.audio_clock_ticks(old));
        let projected_start = earlier_ticks.map(|ticks| {
            (pts as i64 - self.audio_first_prior - ticks).rem_euclid(PTS_MODULUS) as u64
        });
        if fresh {
            self.audio_clock_start_pts = Some(pts);
            self.audio_clock_frames = 0;
            self.audio_clock_sample_rate = Some(rate);
        } else {
            self.rebase_audio_clock(rate);
        }
        let mut deficit = self.audio_deficit(pts, rate);
        // The packet after the first timestamp either carries on from it, which
        // confirms it, or does not, and then one of the two is damaged and a
        // third has to say which.
        let mut first_in_question = false;
        if let (Some(projected), Some(ticks)) = (projected_start, earlier_ticks) {
            self.audio_first_prior += ticks;
            // The count has started again, for sound of another rate. What
            // is waiting to be confirmed is now this packet's timestamp, which
            // nothing has said yet is right, as the start it implies for the
            // track.
            self.audio_first = Some(projected);
        } else if let Some(candidate) = self.audio_first {
            if deficit.abs() <= 1 || break_reported {
                self.audio_start_pts = Some(candidate);
                self.audio_first = None;
            } else {
                first_in_question = true;
            }
        }
        // Sound joined from another elementary stream opens wherever that
        // stream's own access units begin, which is before where the one being
        // left had reached: a switch takes effect at a PES boundary, and the
        // moments between it and there are on the track already. Laying them
        // down again would put the sound that much behind the picture and leave
        // it there, so what has been covered is dropped and the join lands on
        // the first access unit that has not.
        if self.audio_realigning {
            let over = (-deficit).max(0) as usize;
            frames.drain(..over.min(frames.len()));
            // A packet with nothing left in it was covered in full, so the one
            // after it is measured the same way. Anything left is the join.
            self.audio_realigning = frames.is_empty();
            if frames.is_empty() {
                return;
            }
            deficit += over as i64;
        }
        if !(-1..=0).contains(&deficit) && !break_reported {
            self.audio_claim = Some(ClaimedAudio {
                pts,
                first_in_question,
                deficit,
                first,
                frames: std::mem::take(frames),
            });
            return;
        }
        self.fill_audio_gap(pts, first, frames, deficit);
    }

    /// Ticks the access units counted since the clock started add up to.
    fn audio_clock_ticks(&self, rate: u32) -> i64 {
        (self.audio_clock_frames * AAC_FRAME_SAMPLES * TIMESCALE / u64::from(rate)) as i64
    }

    /// Start counting afresh from the count itself once it has run so long that
    /// a timestamp could as well be behind it as ahead.
    ///
    /// The timestamp field wraps every 26.5 hours, so a distance measured from
    /// a fixed point stops meaning anything at half of that. Moving the start
    /// on to where the count has reached, which costs the fraction of an access
    /// unit the count had accumulated, keeps a stream that plays for days
    /// measurable without taking a timestamp's word for where that is.
    fn rebase_audio_clock(&mut self, rate: u32) {
        let counted = self.audio_clock_ticks(rate);
        if counted > PTS_MODULUS / 4 {
            let start = self.audio_clock_start_pts.expect("the clock is anchored") as i64;
            self.audio_clock_start_pts = Some((start + counted).rem_euclid(PTS_MODULUS) as u64);
            self.audio_clock_frames = 0;
        }
    }

    /// How many access units the clock stands ahead of its count at `pts`, or
    /// behind it, if negative.
    fn audio_deficit(&self, pts: u64, rate: u32) -> i64 {
        let start = self.audio_clock_start_pts.expect("the clock is anchored") as i64;
        aac_frame_count_through_video_time(signed_ticks(pts as i64 - start), rate)
            - self.audio_clock_frames as i64
    }

    /// Lay a packet whose timestamp is believed down in the clock, with what it
    /// is ahead of the count covered, or the clock started again where it says
    /// when it is behind.
    fn fill_audio_gap(
        &mut self,
        pts: u64,
        first: AacFrame,
        frames: &mut Vec<AacFrame>,
        deficit: i64,
    ) {
        let rate = first.config.sample_rate;
        let missing = deficit.max(0) as u64;
        let held = (missing * AAC_FRAME_SAMPLES * TIMESCALE / rate as u64) as i64;
        if deficit < -1 {
            // Time went back, which nothing fills. Counting goes on from here.
            self.audio_clock_start_pts = Some(pts);
            self.audio_clock_frames = 0;
        } else if missing <= MAX_CONCEALED_AUDIO_FRAMES {
            frames.splice(0..0, std::iter::repeat_n(first, missing as usize));
        } else if held <= MAX_HELD_TICKS {
            // Silence rather than a repeat: a stutter that long is worse than
            // nothing, and the picture is held still over the same stretch.
            // A configuration whose channel layout cannot be named leaves the
            // hole unfilled, since a decoder has room only for the elements it
            // was told to expect.
            if let Some(silence) = silent_frame(&first.config) {
                frames.splice(0..0, std::iter::repeat_n(silence, missing as usize));
            }
        } else {
            // A jump the video side leaves as a gap. Nothing fills it, so the
            // count is started again from here rather than staying short of
            // the clock for the rest of the stream, which would leave every
            // later hole looking like this one.
            self.audio_clock_start_pts = Some(pts);
            self.audio_clock_frames = 0;
        }
        self.audio_clock_frames += frames.len() as u64;
    }

    /// The frames of what the ADTS reader gave, with one stood in for each
    /// access unit lost to damage, in its place.
    ///
    /// A unit lost here still took its frame's time, and leaving it out would
    /// move the rest of the packet up into it until the next timestamp put it
    /// back. It is covered the way a hole the timestamps reveal is: a short run
    /// with the unit after it -- or the one before, where the run ends what
    /// was read -- and a longer one with silence.
    ///
    /// Also says whether the frames stand one for one for the units, which
    /// they do unless a unit could not be covered at all.
    fn stand_in_for_lost(&mut self, units: Vec<AacUnit>) -> (Vec<AacFrame>, bool) {
        let mut frames = Vec::with_capacity(units.len());
        let mut run = Vec::new();
        let mut one_for_one = true;
        for unit in units {
            match unit {
                AacUnit::Lost(config) => run.push(config),
                AacUnit::Frame(frame) => {
                    one_for_one &= cover_lost_run(&mut run, Some(&frame), &mut frames);
                    frames.push(frame);
                }
            }
        }
        if !run.is_empty() {
            let before = frames
                .last()
                .cloned()
                .or_else(|| self.last_audio_frame.clone());
            one_for_one &= cover_lost_run(&mut run, before.as_ref(), &mut frames);
        }
        if let Some(last) = frames.last() {
            self.last_audio_frame = Some(last.clone());
        }
        (frames, one_for_one)
    }

    /// Lay down sound read in one stretch of unbroken framing, as `framing`
    /// says it follows on, with `anchor` where a timestamp names one of its frames
    /// (by position in `frames`, possibly past the end, and the timestamp).
    ///
    /// Where a frame goes is known from a timestamp, or from framing unbroken
    /// back to a frame whose place is known. Framing taken up anew -- after a
    /// loss, a new time base, or bytes that held no frame where one should
    /// have begun -- continues nothing before it: what was lost is not known,
    /// a joined-on run of later frames least of all. Laid down by count, those
    /// frames would play early by however much was lost, and the hole would be
    /// filled after them. So they wait for the next timestamp, which places
    /// them as the frames just before the one it names, and the hole in front
    /// of them is filled then. Framing broken again before that leaves them
    /// with no place at all, and they are given up for the fill to cover.
    /// Framing that begins with nothing lost starts afresh in place.
    fn lay_audio(
        &mut self,
        framing: Framing,
        frames: Vec<AacFrame>,
        anchor: Option<(usize, u64)>,
        break_reported: bool,
    ) {
        if framing != Framing::Continues {
            self.audio_unplaced.clear();
            self.audio_unplaced_anchor = None;
            self.audio_awaiting_place = framing == Framing::Recovers;
        }
        if !self.audio_awaiting_place {
            let pts = anchor.and_then(|(position, pts)| {
                let rate = frames.get(position).or(frames.last())?.config.sample_rate;
                Some(frames_before(pts, position, rate))
            });
            self.place_audio(pts, break_reported, frames);
            return;
        }
        let held = self.audio_unplaced.len();
        if let Some((position, pts)) = anchor {
            self.audio_unplaced_anchor
                .get_or_insert((held + position, pts));
        }
        self.audio_unplaced.extend(frames);
        let anchored = self.audio_unplaced_anchor.and_then(|(position, pts)| {
            let rate = self
                .audio_unplaced
                .get(position)
                .or(self.audio_unplaced.last())?
                .config
                .sample_rate;
            Some(frames_before(pts, position, rate))
        });
        if anchored.is_some() || self.audio_unplaced.len() > MAX_UNPLACED_AUDIO_FRAMES {
            // A stream that goes on this long with no timestamp for its sound
            // has stopped placing it, and counting is all that is left.
            let frames = std::mem::take(&mut self.audio_unplaced);
            self.audio_unplaced_anchor = None;
            self.audio_awaiting_place = false;
            self.place_audio(anchored, true, frames);
        }
    }

    /// Lay frames whose first is at `pts`, or by count where that is not
    /// known, into the track.
    fn place_audio(&mut self, pts: Option<u64>, break_reported: bool, mut frames: Vec<AacFrame>) {
        // The newest, not the first ever: it is what a fragment with no frames
        // of its own is described by, and what the frame count of the next one
        // is measured in.
        if let Some(config) = frames.last().map(|frame| frame.config.clone()) {
            self.audio_config = Some(config);
        }
        let carried_frames = !frames.is_empty();
        self.conceal_audio_gap(pts, break_reported, &mut frames);
        self.pending_audio.extend(frames);
        // The first timestamp of the sound places the whole track, and nothing
        // yet says it is right: the next packet that carries one is measured
        // against it. A packet with no frame in it starts nothing the count can
        // be measured from, so it is not the first.
        if carried_frames && self.audio_start_pts.is_none() && self.audio_first.is_none() {
            self.audio_first = pts;
            self.audio_first_prior = 0;
        }
    }

    /// The frames of the last read of a stream that ends, to be laid down by
    /// count: those that carry on from sound already placed. What waits for a
    /// timestamp gets none now and is given up -- unless nothing of the sound
    /// has a place at all, when counting from the start is as good as any.
    fn last_of_audio_stream(&mut self, read: AdtsOutput) -> Vec<AacFrame> {
        let never_placed = self.audio_clock_start_pts.is_none();
        let mut units = read.units;
        if let Some(&restart) = read.restarts.first().filter(|_| !never_placed) {
            units.truncate(restart);
        }
        let (frames, _) = self.stand_in_for_lost(units);
        let unplaced = std::mem::take(&mut self.audio_unplaced);
        self.audio_unplaced_anchor = None;
        let awaiting = std::mem::replace(&mut self.audio_awaiting_place, false);
        match (never_placed, awaiting) {
            (true, _) => unplaced.into_iter().chain(frames).collect(),
            (false, false) => frames,
            (false, true) => Vec::new(),
        }
    }

    /// Decide the claim in hand against the next packet of sound, which was
    /// stamped `next`: the jump is real when that packet carries on from where
    /// it lands, within an access unit. One that has no timestamp cannot carry
    /// on from anywhere, and the claim is not believed.
    ///
    /// Where the claim is also what the first timestamp of the sound is in
    /// question against, believing it is believing that the first one was
    /// the damaged one: the track starts where the count that has run since
    /// puts the first frame, to land on this packet's timestamp. Not believing
    /// it keeps the first timestamp.
    fn settle_audio_claim(&mut self, next: Option<u64>) {
        let Some(claim) = self.audio_claim.take() else {
            return;
        };
        let rate = claim.first.config.sample_rate;
        let clock = (self.audio_clock_start_pts, self.audio_clock_frames);
        let mut believed = claim.frames.clone();
        let start =
            (claim.pts as i64 - self.audio_clock_ticks(rate)).rem_euclid(PTS_MODULUS) as u64;
        if claim.first_in_question {
            self.audio_clock_start_pts = Some(start);
            self.fill_audio_gap(claim.pts, claim.first, &mut believed, 0);
        } else {
            self.fill_audio_gap(claim.pts, claim.first, &mut believed, claim.deficit);
        }
        let agrees = next.is_some_and(|next| self.audio_deficit(next, rate).abs() <= 1);
        if agrees {
            if claim.first_in_question {
                self.audio_start_pts = Some(self.track_start(start));
                self.audio_first = None;
            }
            self.pending_audio.extend(believed);
        } else {
            (self.audio_clock_start_pts, self.audio_clock_frames) = clock;
            self.lay_claim_by_count(claim.frames);
        }
    }

    /// Where the track starts, given where the count in force starts: before
    /// it by the sound laid down at other sample rates ahead of it.
    fn track_start(&self, clock_start: u64) -> u64 {
        (clock_start as i64 - self.audio_first_prior).rem_euclid(PTS_MODULUS) as u64
    }

    /// Lay the claim in hand down by count, as one that is not believed.
    fn lay_audio_claim_by_count(&mut self) {
        if let Some(claim) = self.audio_claim.take() {
            self.lay_claim_by_count(claim.frames);
        }
    }

    fn lay_claim_by_count(&mut self, frames: Vec<AacFrame>) {
        self.audio_clock_frames += frames.len() as u64;
        self.pending_audio.extend(frames);
        // What the first timestamp was in question against is not believed.
        if let Some(first) = self.audio_first.take() {
            self.audio_start_pts = Some(first);
        }
    }

    /// Take the claim in hand at its word, where nothing is left to decide it.
    fn accept_audio_claim(&mut self) {
        let Some(mut claim) = self.audio_claim.take() else {
            return;
        };
        if claim.first_in_question {
            let rate = claim.first.config.sample_rate;
            let start =
                (claim.pts as i64 - self.audio_clock_ticks(rate)).rem_euclid(PTS_MODULUS) as u64;
            self.audio_clock_start_pts = Some(start);
            self.audio_start_pts = Some(self.track_start(start));
            self.audio_first = None;
            claim.deficit = 0;
        }
        self.fill_audio_gap(claim.pts, claim.first, &mut claim.frames, claim.deficit);
        self.pending_audio.extend(claim.frames);
    }

    /// Whether the fragment about to be emitted is a restart: it opens where a
    /// decoder begins afresh, with no reference from before it. This includes
    /// periodic recovery in discard mode, so that the timeline and the unit
    /// handed out omit the same leading pictures.
    fn restarts(&self, gop: &Mpeg2Gop) -> bool {
        self.video.awaiting_random_access()
            || (self.open_gop_recovery == OpenGopRecovery::Discard && self.recovery_due(gop))
    }

    /// Whether a periodic restart point falls on this unit. Only a unit that
    /// opens a group can carry one: the interval counts groups, and a restart
    /// in the middle of one would cut across the pictures its leading units
    /// predict from.
    fn recovery_due(&self, gop: &Mpeg2Gop) -> bool {
        !gop.continues_group && self.is_random_access_point()
    }

    /// The display slots of the unit's group that went out before it.
    fn consumed_before(&self, gop: &Mpeg2Gop) -> u32 {
        Self::slots_after(gop, self.slots_consumed)
    }

    /// The display slots of the unit's group that went out before it, when
    /// `used` of them are what the unit before it left used up.
    fn slots_after(gop: &Mpeg2Gop, used: u32) -> u32 {
        if gop.continues_group {
            used
        } else {
            0
        }
    }

    /// Whether the unit follows the one before it on the decode clock and in
    /// the source's timestamps, with nothing to settle against either: it
    /// continues a group that is being laid down, and starts nothing new.
    fn follows_on(gop: &Mpeg2Gop, restarts: bool) -> bool {
        gop.continues_group && !restarts
    }

    /// Work out what one unit turns into, on whichever path this session is on.
    ///
    /// Nothing is decoded to get here, so every picture with a slice in it
    /// counts as one: a damaged slice is the decoder's business rather than
    /// this crate's.
    ///
    /// `kept` is the walk of the unit's headers from the last time it was
    /// planned, which is used again where it was asked the same thing, and
    /// `belief` is where its timestamps were taken to put it, once decided.
    fn plan_unit(
        &mut self,
        gop: &Mpeg2Gop,
        restarts: bool,
        kept: &mut Option<KeptTiming>,
        belief: &mut Option<Option<i64>>,
        final_flush: bool,
    ) -> Result<Planned> {
        let has_references = !restarts;
        let consumed = self.consumed_before(gop);
        let mut timed = match kept {
            Some(kept)
                if kept.has_references == has_references
                    && kept.before == self.rff
                    && kept.consumed == consumed =>
            {
                kept.timed.clone()
            }
            _ => {
                let timed = timed_mpeg2_unit(&gop.data, has_references, self.rff, consumed)?;
                *kept = Some(KeptTiming {
                    has_references,
                    before: self.rff,
                    consumed,
                    timed: timed.clone(),
                });
                timed
            }
        };
        // A unit in the middle of a group is timed against the ones before it
        // in the group, whose own timestamps it does not carry.
        let mut start = None;
        if !Self::follows_on(gop, restarts) {
            start = match *belief {
                Some(decided) => decided,
                None => {
                    let Some(decided) = self.believed_start(gop, &timed, final_flush) else {
                        return Ok(Planned::Waiting);
                    };
                    *belief = Some(decided);
                    decided
                }
            };
        }
        // A seek, missing GOP, or timestamp jump resets the timing phase.
        // The ordinary hole handling accounts for any outstanding half field.
        if let (Some(opens), Some(expected)) = (start, self.expected_pts) {
            if signed_ticks(opens - expected).abs() > RETIME_TOLERANCE {
                let shift = timed.start_shift;
                timed.retime(RffState::default());
                // The slots keep their places in the source's clock; what moves
                // is the phase they are counted from.
                start = Some(opens + timed.start_shift - shift);
            }
        }
        Ok(Planned::Unit(Box::new((
            self.plan_from_timed(timed),
            start,
        ))))
    }

    /// Where the first display slot of a unit that opens a group starts in the
    /// source's 90 kHz clock, as far as its timestamps are to be believed, in
    /// the phase the unit is planned in. `None` is a unit with no timestamp
    /// worth going by, which is placed as one that has none; the outer `None`
    /// is a unit that cannot be judged yet.
    ///
    /// A timestamp moves the timeline only when something else agrees with it,
    /// because a byte of one that is damaged without the transport noticing
    /// puts every picture after it seconds from where it belongs. Each
    /// timestamp of the unit says where the unit starts, by the picture it
    /// belongs to -- kept or not, since a picture the unit drops is no less
    /// stamped -- and the first of these that holds is believed:
    ///
    /// 1. Two of them agree with each other. A broadcast carries a PES to a
    ///    picture, so one that dissents is the odd one out, even the first.
    /// 2. One is within a picture of where the display clock has reached.
    /// 3. The count is known to be broken, or there is none yet, so there is
    ///    nothing to measure against: the first one is taken as it is.
    /// 4. The next unit that opens a group and carries a timestamp lands where
    ///    this one, with the display slots between them, says it should. Until
    ///    one has arrived the unit waits. The end of the input settles it in
    ///    favour of the timestamp, since nothing comes after it to be put out
    ///    of place. A break in the stream before that unit leaves the claim
    ///    with no witness -- a count of slots across a break means nothing --
    ///    and an unwitnessed claim is not believed, nor is one that is
    ///    disagreed with: the unit is left with none. That errs towards a real
    ///    hole being closed up for one group, which the unit after the break
    ///    sets right by itself, because a damaged timestamp that was believed
    ///    would hold the decode clock ahead for good.
    ///
    /// Asked of every unit that is placed by its own timestamp, which is a
    /// unit that opens a group and one that restarts the decoder in the middle
    /// of one.
    fn believed_start(
        &mut self,
        gop: &Mpeg2Gop,
        timed: &TimedUnit,
        final_flush: bool,
    ) -> Option<Option<i64>> {
        let starts = Self::unit_starts(&gop.timestamps, timed);
        let Some(&first) = starts.first() else {
            return Some(None);
        };
        for (at, &start) in starts.iter().enumerate() {
            if starts[at + 1..]
                .iter()
                .any(|&other| signed_ticks(start - other).abs() <= RETIME_TOLERANCE)
            {
                return Some(Some(start));
            }
        }
        let picture = i64::from(timed.unit.timeline.sample_duration);
        if let Some(expected) = self.expected_pts {
            if let Some(&near) = starts
                .iter()
                .find(|&&start| signed_ticks(start - expected).abs() <= picture)
            {
                return Some(Some(near));
            }
        }
        if self.count_broken || self.expected_pts.is_none() {
            return Some(Some(first));
        }
        match self.next_unit_confirms(timed, first) {
            Evidence::Confirms => Some(Some(first)),
            Evidence::Contradicts | Evidence::Unavailable => Some(None),
            Evidence::Pending if final_flush => Some(Some(first)),
            Evidence::Pending => None,
        }
    }

    /// Where each timestamp of a unit puts the unit's first display slot, in the
    /// source's clock. A timestamp whose picture takes no slot says nothing.
    fn unit_starts(timestamps: &[UnitTimestamp], timed: &TimedUnit) -> Vec<i64> {
        timestamps
            .iter()
            .filter_map(|stamp| timed.start_from_timestamp(stamp.offset, stamp.pts))
            .collect()
    }

    /// What the units after this one, in the queue, say of `claim`, the start of
    /// this unit's first display slot: whether the next that opens a group and
    /// carries a timestamp opens where the claim puts it, after the display
    /// slots of this unit and of the ones between.
    ///
    /// Only a unit that opens a group is asked, because that is the kind a
    /// timestamp places: the others are placed by the count, so a stream cut
    /// into anchor units and the same stream cut into whole groups judge a
    /// claim by the same evidence.
    ///
    /// The slots are counted from the units' own headers, in the phase a
    /// stream begins in, which is a field off at most -- well inside the
    /// picture the comparison allows. A unit that cannot be read cannot be
    /// counted, and contradicts. What each unit counts to is kept with it, so
    /// that asking again at the next packet costs nothing.
    fn next_unit_confirms(&mut self, timed: &TimedUnit, claim: i64) -> Evidence {
        let mut used = timed.slots_after;
        let mut distance = timed.span_ticks as i64;
        let picture = i64::from(timed.unit.timeline.sample_duration);
        for waiting in self.pending_gops.iter_mut().skip(1) {
            if waiting.gop.after_break {
                return Evidence::Unavailable;
            }
            let consumed = Self::slots_after(&waiting.gop, used);
            if waiting
                .probe
                .as_ref()
                .is_none_or(|probe| probe.consumed != consumed)
            {
                let counted =
                    timed_mpeg2_unit(&waiting.gop.data, true, RffState::default(), consumed)
                        .ok()
                        .map(|next| Counted {
                            starts: Self::unit_starts(&waiting.gop.timestamps, &next),
                            slots_after: next.slots_after,
                            span_ticks: next.span_ticks,
                        });
                waiting.probe = Some(Probe { consumed, counted });
            }
            let Some(counted) = waiting
                .probe
                .as_ref()
                .and_then(|probe| probe.counted.as_ref())
            else {
                return Evidence::Contradicts;
            };
            if !waiting.gop.continues_group && !counted.starts.is_empty() {
                let agrees = counted
                    .starts
                    .iter()
                    .any(|&start| signed_ticks(start - claim - distance).abs() <= picture);
                return if agrees {
                    Evidence::Confirms
                } else {
                    Evidence::Contradicts
                };
            }
            used = counted.slots_after;
            distance += counted.span_ticks as i64;
        }
        Evidence::Pending
    }

    /// Tell a unit's timeline where it sits in its group: how far its display
    /// slots sit from the decode clock.
    ///
    /// This is set when the unit is planned, since what the fragment spans
    /// decides how much sound goes in it.
    fn place_in_group(&self, gop: &Mpeg2Gop, restarts: bool, plan: &mut UnitPlan) {
        let lag = self.unit_lag(gop, restarts, plan.timed());
        let timeline = plan.timeline_mut();
        timeline.lag_ticks = lag.ticks;
        timeline.catch_up_ticks = lag.catch_up;
    }

    /// Where a unit's display slots sit against the decode clock, given what
    /// has been laid down so far.
    ///
    /// A unit that opens a group, or restarts the decoder, starts its group's
    /// display clock afresh, after taking up the lead the decode clock was
    /// left behind by. One that continues a group nothing has been laid down
    /// for starts afresh where the display clock stands. The rest are timed
    /// against the clock the group's earlier units have kept: the slots between
    /// the end of what they laid down and the unit's first picture were empty,
    /// and are kept empty here. A unit with no picture has nothing to take the
    /// lead up with, and leaves it to the next.
    ///
    /// This is read off the timeline that is packaged, which is not always the
    /// one that was planned: a picture that proves undecodable draws it again.
    fn unit_lag(&self, gop: &Mpeg2Gop, restarts: bool, timed: &TimedUnit) -> UnitLag {
        let timeline = &timed.unit.timeline;
        let first = timeline.first_presentation_time();
        let laid_down: u64 = timeline
            .sample_durations
            .iter()
            .map(|&duration| u64::from(duration))
            .sum();
        let follows_on = Self::follows_on(gop, restarts);
        if follows_on && self.group_laid_down {
            return UnitLag {
                ticks: (self.lead + first) as u32,
                catch_up: 0,
                lead: (self.lead + timed.span_ticks).saturating_sub(laid_down),
                group_laid_down: true,
            };
        }
        if timeline.presentation_indices.is_empty() {
            return UnitLag {
                ticks: 0,
                catch_up: 0,
                lead: self.lead,
                group_laid_down: false,
            };
        }
        let after = timed.span_ticks.saturating_sub(first + laid_down);
        if follows_on {
            UnitLag {
                ticks: self.lead as u32,
                catch_up: 0,
                lead: self.lead + after,
                group_laid_down: true,
            }
        } else {
            UnitLag {
                ticks: 0,
                catch_up: self.lead as u32,
                lead: after,
                group_laid_down: true,
            }
        }
    }

    fn plan_from_timed(&self, mut timed: TimedUnit) -> UnitPlan {
        timed.unit.timeline.split_field_samples = self.video.split_field_samples();
        match self.video {
            VideoPipeline::Passthrough { .. } => UnitPlan::Passthrough(timed),
            VideoPipeline::Decode { .. } => UnitPlan::Decode(timed),
        }
    }

    /// Notice a unit coded under something other than what the fragments so far
    /// describe, and arrange for it to be described afresh.
    ///
    /// A broadcast changes its frame size, its field coding or its aspect ratio
    /// between programmes, and Media Source Extensions takes a further
    /// initialization segment for exactly this: the fragments before it keep
    /// playing, and the ones after it are read against the new description. So
    /// the change costs a restart point and nothing else -- but the restart is
    /// not optional, because pictures coded under the new description cannot
    /// be predicted from ones coded under the old, and the sample entry is only
    /// reread at a segment boundary.
    ///
    /// This runs on the unit's bytes rather than on its plan because the plan
    /// is drawn for a unit that either does or does not open a random access
    /// point, and that is the question being answered here.
    fn note_description(&mut self, gop: &Mpeg2Gop) {
        let Some(description) = stream_sequence_description(&gop.data) else {
            // Nothing in the unit says what it is coded under, so nothing here
            // can say it differs. The parse behind the plan decides instead.
            return;
        };
        if self.described == Some(description) {
            return;
        }
        // The first unit of all has no description to differ from: it is
        // waiting for a random access point already, and asking for one again
        // would only mean the same thing.
        if self.described.is_some() {
            self.video.request_random_access();
        }
        // The decoder is given the pictures' own headers. The initialization
        // segment holds the sound alone, whatever the picture is coded under.
        if !matches!(self.video, VideoPipeline::Decode { .. }) {
            self.describe_pending = true;
        }
    }

    /// Notice sound coded under something other than what the initialization
    /// segment describes, and arrange for it to be described afresh.
    ///
    /// A broadcast switches between 5.1 and stereo at a programme boundary, and
    /// the segment carries the audio configuration in its `esds` just as it
    /// carries the picture's. The video's own description has not changed, so
    /// the segment has to be asked for rather than following from a change in
    /// it -- and the fragment it opens is made a restart point, since that is
    /// where a decoder can be handed a new description with nothing of the old
    /// one still in flight.
    fn note_audio_description(&mut self) {
        let Some(config) = self.pending_audio.first().map(|frame| frame.config.clone()) else {
            return;
        };
        if self.described_audio.as_ref() == Some(&config) {
            return;
        }
        // Nothing has been described yet: the first fragment does that anyway.
        if self.described_audio.is_some() {
            self.video.request_random_access();
        }
        self.describe_pending = true;
    }

    /// Hold this unit's opening sample over whatever the source lost in front
    /// of it, so that nothing after the hole moves earlier than it belongs.
    ///
    /// Units are otherwise timed against each other and appended end to end, so
    /// a stretch the recording lost closes up: picture and sound keep playing,
    /// a fraction of a second early, and every fragment after it is early by
    /// the same amount. The captions do not move with them -- they carry the
    /// source's own timestamps -- so they drift by the length of the hole and
    /// stay drifted. Holding the opening sample over it puts everything back
    /// where the source had it.
    ///
    /// The unit's timestamp is the one it is believed to have, which is what
    /// keeps a damaged one from being held over; see [`Session::believed_start`].
    ///
    /// Only a unit that opens a random access point has a sample to hold with:
    /// its first picture. So a hole asks for one, and a unit that cannot
    /// provide it -- one with no intra picture in it -- leaves the hole to the
    /// next, which measures it from the same place and finds it that much
    /// wider.
    ///
    /// A jump too long to sit through is left as a gap instead; see
    /// [`Session::open_a_gap`].
    fn hold_over_hole(
        &mut self,
        gop: &Mpeg2Gop,
        plan: &mut UnitPlan,
        start: Option<i64>,
    ) -> Result<()> {
        // A unit in the middle of a group has no sample to hold with, and its
        // place against the ones before it is kept by the group's lag instead.
        if Self::follows_on(gop, self.restarts(gop)) {
            return Ok(());
        }
        let (Some(expected), Some(start)) = (self.expected_pts, start) else {
            return Ok(());
        };
        // Signed, across the wrap: a unit that opens a little before the one
        // ahead of it ended is the ordinary case -- the sample held over a
        // random access point's leading slots is rounded up to a tick where
        // there are none -- and the difference has to come out negative rather
        // than as most of the 26.5 hours the field wraps in.
        let mut ahead = (start - expected).rem_euclid(PTS_MODULUS);
        if ahead > PTS_MODULUS / 2 {
            ahead -= PTS_MODULUS;
        }
        // Less than a picture is that rounding, or a source whose frame rate
        // does not divide evenly. Neither is a hole.
        if ahead < plan.timeline().sample_duration as i64 {
            return Ok(());
        }
        if ahead > MAX_HELD_TICKS {
            self.open_a_gap(ahead as u64, start);
            return Ok(());
        }
        if !self.restarts(gop) {
            self.video.request_random_access();
            // The plan was drawn for a unit that continues the one before it,
            // and this one no longer does.
            let timed = timed_mpeg2_unit(&gop.data, false, plan.timed().before, 0)?;
            *plan = self.plan_from_timed(timed);
        }
        plan.timeline_mut().hold_ticks = ahead as u32;
        Ok(())
    }

    /// Move both tracks past a jump without filling it, leaving the gap in the
    /// presentation where the source has it.
    ///
    /// A jump this long is a join between two recordings rather than a hole in
    /// one, and holding a picture across it would make a viewer sit through the
    /// whole of it. Closing it up is not the answer either: that moves
    /// everything after it, and the captions -- which are placed by the source's
    /// own timestamps -- would never line up again. So the media keeps its
    /// positions and the gap stays visible in the buffered ranges, which is
    /// where whoever is driving playback can see it and move the playhead
    /// across. That decision needs to know where the viewer is, and this does
    /// not.
    fn open_a_gap(&mut self, gap: u64, start: i64) {
        self.video_presentation_start += gap;
        if let Some(rate) = self.audio_config.as_ref().map(|config| config.sample_rate) {
            // The sound is laid down access unit by access unit, so its gap is
            // a count of the units that would have filled it.
            let frames = aac_frame_count_through_video_time(gap as i64, rate).max(0) as u64;
            self.audio_frames_emitted += frames;
        }
        // Taken account of, so a second look at the same unit -- which happens
        // whenever this one is waiting for its sound -- does not take it again.
        self.expected_pts = Some(start);
    }

    /// How many of the frames waiting were coded under the configuration the
    /// first of them was, which is as far as one fragment can reach.
    fn frames_under_one_configuration(&self, take: usize) -> usize {
        let Some(first) = self.pending_audio.first() else {
            return take;
        };
        self.pending_audio
            .iter()
            .take(take)
            .position(|frame| frame.config != first.config)
            .unwrap_or(take)
    }

    fn is_random_access_point(&self) -> bool {
        self.gops_emitted > 0
            && ((self.recovery_point_gop_interval != 0
                && self.gops_emitted % self.recovery_point_gop_interval == 0)
                || self.media_bytes_since_random_access >= MAX_RECOVERY_BYTES)
    }

    fn flush_pending(&mut self, final_flush: bool, out: &mut Vec<Fragment>) -> Result<()> {
        while let Some(ready) = self.take_ready(final_flush)? {
            self.finish_gop(ready, out);
        }
        Ok(())
    }

    /// Take the next unit that can go out, with the audio that belongs beside
    /// it, or nothing when it is still waiting on either.
    ///
    /// Everything that decides whether a unit goes happens here, and nothing
    /// that decides it happens after: what comes back is committed to, and the
    /// only thing left is to package it.
    fn take_ready(&mut self, final_flush: bool) -> Result<Option<Ready>> {
        loop {
            let has_audio = self.demuxer.has_aac_audio();
            if !has_audio {
                if self.pending_gops.is_empty() {
                    return Ok(None);
                }
                // The sound is the clock decoded pictures are shown by.
                if matches!(self.video, VideoPipeline::Decode { .. }) {
                    return Err(Error::no_aac_audio());
                }
            } else {
                // A unit goes out as soon as the sound that belongs beside it has
                // arrived, which the frame count below checks. Holding it until
                // the unit after it is complete as well would add a whole unit of
                // delay to a live stream and change nothing in the fragment.
                if self.pending_gops.is_empty() {
                    return Ok(None);
                }
                if self.audio_config.is_none() {
                    return Ok(None);
                }
                // Where the sound starts is not known until a second timestamp
                // has agreed with the first, and the origin is not to be moved.
                if self.audio_first.is_some() && !final_flush {
                    return Ok(None);
                }
                if !final_flush && self.pending_audio.is_empty() {
                    return Ok(None);
                }
            }
            let gop = Arc::clone(&self.pending_gops[0].gop);
            let mut timing = self.pending_gops[0].timing.take();
            let mut belief = self.pending_gops[0].belief;
            // A stream that broke in front of the unit has left the count
            // wherever it was.
            if gop.after_break {
                self.count_broken = true;
            }
            // Before the plan, because a unit the fragments so far do not describe
            // has to open at a random access point and the plan is drawn knowing
            // whether it does. The sound is asked the same question: an
            // initialization segment describes both tracks, so either of them
            // changing calls for a new one.
            self.note_description(&gop);
            if has_audio {
                self.note_audio_description();
            }
            let planned = self.plan_readable(&gop, &mut timing, &mut belief, final_flush)?;
            self.pending_gops[0].belief = belief;
            let (mut plan, start) = match planned {
                Planned::Dropped => {
                    self.pending_gops.remove(0);
                    continue;
                }
                Planned::Waiting => {
                    self.pending_gops[0].timing = timing;
                    return Ok(None);
                }
                Planned::Unit(unit) => *unit,
            };
            // Before the audio is measured against the video, since a hole held
            // over is part of what the fragment spans and so of what it carries.
            self.hold_over_hole(&gop, &mut plan, start)?;
            let restarts = self.restarts(&gop);
            self.place_in_group(&gop, restarts, &mut plan);
            if !has_audio {
                self.pending_gops.remove(0);
                let gop = Arc::unwrap_or_clone(gop);
                return Ok(Some(self.commit(gop, Vec::new(), plan, start)));
            }
            self.align_timelines(&plan, start);
            let config = self
                .audio_config
                .clone()
                .expect("the sound's configuration was checked before the unit was planned");
            let video_duration = mpeg2_fragment_duration(plan.timeline(), plan.lead_in(restarts));
            // Audio is measured from where the audio track itself starts, not
            // from where the video does.
            let through = (self.video_presentation_start + video_duration) as i64
                - self.audio_origin_ticks as i64;
            let desired = aac_frame_count_through_video_time(through, config.sample_rate);
            let wanted = (desired - self.audio_frames_emitted as i64).max(0) as usize;
            if !final_flush && self.pending_audio.len() < wanted {
                self.pending_gops[0].timing = timing;
                return Ok(None);
            }
            // The queue's hold on the unit goes with its place in it, which
            // leaves the one here the only one.
            self.pending_gops.remove(0);
            let gop = Arc::unwrap_or_clone(gop);
            // The last fragment takes whatever audio is left, since nothing
            // follows it to carry the remainder.
            let take = if final_flush && self.pending_gops.is_empty() {
                self.pending_audio.len()
            } else {
                wanted.min(self.pending_audio.len())
            };
            // A fragment's sound is described by the initialization segment in
            // front of it, so it holds one configuration. The frames past a change
            // wait for the fragment that describes them, and the count they are
            // short by is asked for again as soon as the next one is measured.
            let take = self.frames_under_one_configuration(take);
            let frames: Vec<AacFrame> = self.pending_audio.drain(..take).collect();
            return Ok(Some(self.commit(gop, frames, plan, start)));
        }
    }

    /// Plan a unit, or give it up when its headers cannot be read, for the
    /// caller to drop. That is damage the transport did not report, and no
    /// decoder can begin anything from it either: what depends on it waits for
    /// the next random access point, as after a gap, and its span becomes part
    /// of the hole in front of the unit that opens there. Damage passes; a run
    /// of such units with no readable one between them says the stream itself
    /// cannot be read, and the first of their errors is returned.
    fn plan_readable(
        &mut self,
        gop: &Mpeg2Gop,
        kept: &mut Option<KeptTiming>,
        belief: &mut Option<Option<i64>>,
        final_flush: bool,
    ) -> Result<Planned> {
        match self.plan_unit(gop, self.restarts(gop), kept, belief, final_flush) {
            Ok(planned) => {
                self.unreadable_run = None;
                Ok(planned)
            }
            Err(error) => {
                self.unreadable_units += 1;
                let run = self.unreadable_run.get_or_insert((error, 0));
                if !gop.continues_group {
                    run.1 += 1;
                }
                if run.1 > MAX_UNREADABLE_GROUPS {
                    let (first, _) = self.unreadable_run.take().expect("a run under way");
                    return Err(first);
                }
                self.video.request_random_access();
                // What the unit would have spanned is lost with it.
                self.count_broken = true;
                Ok(Planned::Dropped)
            }
        }
    }

    /// Settle what a unit that is going out will be: whether it carries a
    /// restart point, and so what its plan is.
    fn commit(
        &mut self,
        gop: Mpeg2Gop,
        audio: Vec<AacFrame>,
        plan: UnitPlan,
        start: Option<i64>,
    ) -> Ready {
        if self.recovery_due(&gop) {
            match self.open_gop_recovery {
                OpenGopRecovery::RecoveryPoint => self.video.request_recovery_point(),
                OpenGopRecovery::Discard => self.video.request_random_access(),
            }
        }
        let restarts = self.video.awaiting_random_access();
        Ready {
            gop,
            audio,
            plan,
            start,
            restarts,
        }
    }

    /// Put the two tracks on one timeline, using the timestamps the transport
    /// stream gives them, the video's being the one believed for its unit.
    ///
    /// Video and audio in a broadcast stream do not start at the same PTS -- a
    /// few hundred milliseconds apart is normal -- so starting both tracks at
    /// zero shifts the audio by exactly that difference. Both are instead
    /// placed at their real distance from the origin, which for a session that
    /// picks its own is whichever track starts first, and for an anchored one
    /// is the timestamp the caller named.
    fn align_timelines(&mut self, plan: &UnitPlan, start: Option<i64>) {
        let timeline = plan.timeline();
        if self.timelines_aligned {
            return;
        }
        // Once a fragment has gone out the origin is fixed, whether or not the
        // timestamps to choose it ever arrived; moving it later would tear the
        // timeline in two.
        if self.initialized {
            self.timelines_aligned = true;
            return;
        }
        // Where the unit's first display slot starts, which is before its first
        // coded picture where the group is open: that one is shown after the
        // B pictures that lead it. This only ever runs on the opening
        // fragment, where those pictures are missing and the first picture
        // covers their display slots, so the presentation still starts where
        // they would.
        let Some(video_start) = start else {
            return;
        };
        let origin = match self.timeline_origin {
            Some(origin) => origin,
            None => {
                let chosen = match self.audio_start_pts {
                    // Leave room for the sequence's decode lead, including
                    // the three-field pictures soft telecine can carry.
                    Some(audio_pts) => (video_start
                        - timeline.decode_lead.max(timeline.sample_duration) as i64)
                        .min(audio_pts as i64),
                    // A stream with no audio track leaves the same room
                    // before its video: starting on the
                    // video leaves the decode lead nowhere to go, and the
                    // opening fragment's decode timeline is clamped to zero and
                    // runs a frame into the one after it. One that has yet to
                    // name its audio waits, because the origin cannot be moved
                    // afterwards.
                    None if self.demuxer.has_aac_audio() => return,
                    None => video_start - timeline.decode_lead.max(timeline.sample_duration) as i64,
                };
                self.timeline_origin = Some(chosen);
                chosen
            }
        };
        self.timelines_aligned = true;
        self.video_presentation_start = ticks_since(origin, video_start);
        if let Some(audio_pts) = self.audio_start_pts {
            self.audio_origin_ticks = ticks_since(origin, audio_pts as i64);
        }
    }

    /// Decode time of the next audio sample, in the audio track's own timescale.
    fn audio_base_decode_time(&self, rate: u32) -> u64 {
        let origin =
            round_half_up((self.audio_origin_ticks * rate as u64) as f64 / TIMESCALE as f64);
        origin as u64 + self.audio_frames_emitted * AAC_FRAME_SAMPLES
    }

    /// Package a committed unit and hand its fragment out.
    fn finish_gop(&mut self, ready: Ready, out: &mut Vec<Fragment>) {
        let Ready {
            gop: unit,
            audio: audio_frames,
            plan,
            start,
            restarts,
        } = ready;
        let gop = &unit;
        self.align_timelines(&plan, start);

        let config = audio_frames
            .first()
            .map(|frame| frame.config.clone())
            .or_else(|| self.audio_config.clone());
        let audio_track = config.as_ref().map(|config| Fmp4AudioSamples {
            config: config.clone(),
            samples: audio_frames
                .iter()
                .map(|frame| frame.data.clone())
                .collect(),
            base_decode_time: self.audio_base_decode_time(config.sample_rate),
        });
        let Packaged {
            fragment,
            recovery_point,
            lag,
            pictures,
        } = self.package(gop, &plan, restarts, config.as_ref(), audio_track.as_ref());
        // What the group has used up and laid down counts for the units after
        // it whether or not this one made a fragment. So does the field clock,
        // for a unit in the middle of a group: the next one has nothing else to
        // be timed from.
        self.slots_consumed = plan.timed().slots_after;
        // Where the unit after this one is expected to open is where the
        // display clock has reached, in the source's timestamps. A unit that
        // opens a group with a picture reads it from its own timestamp rather
        // than accumulated, so that the presentation and the source cannot
        // creep apart; the hold at its front covered the hole in front of it
        // and is not part of what it spans. Any other unit has no timestamp of
        // its own to read it from -- or none that is believed -- and moves it
        // on by what the display clock moved, slots the source lost included,
        // which are no hole.
        let moved = (fragment.duration + lag.lead) as i64 - self.lead as i64;
        let opens =
            !Self::follows_on(gop, restarts) && !plan.timeline().presentation_indices.is_empty();
        match (opens, start) {
            (true, Some(start)) => {
                let hold = i64::from(plan.timeline().hold_ticks);
                self.expected_pts = Some(start + moved - hold);
                self.count_broken = false;
            }
            _ => {
                if let Some(expected) = self.expected_pts.as_mut() {
                    *expected += moved;
                }
            }
        }
        // Pictures the unit was meant to carry are not there to be counted.
        if plan.timeline().presentation_indices.is_empty() {
            self.count_broken = true;
        }
        self.lead = lag.lead;
        self.group_laid_down = lag.group_laid_down;
        if gop.continues_group {
            self.rff = plan.timed().after;
        }
        // A unit that yielded no picture, with no audio to carry alongside it,
        // makes a moof describing no samples of anything. A recording cut mid
        // group ends with one, and there is nothing in it for a SourceBuffer to
        // play. What the unit was worth is already taken account of above.
        if fragment.sample_count == 0 && audio_frames.is_empty() && pictures.is_empty() {
            return;
        }
        // Aligning can still move the origin, so read the start after it.
        let start = (self.video_presentation_start + u64::from(lag.ticks) + u64::from(lag.catch_up))
            as f64
            / TIMESCALE as f64;
        let first_time = plan.timeline().first_presentation_time();
        let mut scans: Vec<VideoScan> = (0..plan.timeline().presentation_indices.len())
            .map(|index| {
                let scan = plan.timeline().sample_scans[index];
                VideoScan {
                    start: start
                        + (plan.timeline().presentation_times[index] - first_time) as f64
                            / TIMESCALE as f64,
                    scan,
                }
            })
            .collect();
        scans.sort_by(|a, b| a.start.total_cmp(&b.start));
        scans.dedup_by(|next, previous| next.scan == previous.scan);

        self.sequence_number += 1;
        self.video_presentation_start += fragment.duration;
        self.rff = plan.timed().after;
        self.audio_frames_emitted += audio_frames.len() as u64;
        if !gop.continues_group {
            self.gops_emitted += 1;
        }

        // A fragment that muxes the video describes it exactly when the
        // pictures in it are the first coded under their description, which is
        // the fragment a `SourceBuffer` has to be given one for. One that
        // carries only the sound is described when the sound changes.
        let description = stream_sequence_description(&gop.data);
        let decode = matches!(plan, UnitPlan::Decode(_));
        if !fragment.init_segment.is_empty() {
            self.initialized = true;
            self.describe_pending = false;
            if !decode {
                self.described = description;
            }
            self.described_audio = config;
            out.push(Fragment::Init {
                data: fragment.init_segment,
                mime_codec: fragment.mime_codec,
                width: description.map_or(0, |description| description.width),
                height: description.map_or(0, |description| description.height),
            });
        }
        // Sound alone: every fragment is somewhere a decoder can begin.
        let random_access = restarts || recovery_point || decode;
        if random_access {
            self.media_bytes_since_random_access = fragment.media_segment.len();
        } else {
            self.media_bytes_since_random_access = self
                .media_bytes_since_random_access
                .saturating_add(fragment.media_segment.len());
        }
        let restart_offset = gop.restart_offset.filter(|_| !gop.continues_group);
        // In decode mode the pictures go out on their own, and a unit with no
        // sound has nothing for the media element.
        if !decode || !audio_frames.is_empty() {
            out.push(Fragment::Media {
                data: fragment.media_segment,
                start,
                random_access,
                restart_offset,
                video_samples: fragment.sample_count,
                audio_samples: audio_frames.len(),
                scans: if decode { Vec::new() } else { scans },
            });
        }
        if !pictures.is_empty() {
            let intra = plan
                .timed()
                .unit
                .samples
                .first()
                .is_some_and(|sample| sample.sync);
            // A unit with no sound can go out before the initialization
            // segment does, and its pictures fix the origin all the same.
            self.initialized = true;
            // What the pictures handed out are coded under is what the next
            // unit is measured against, whether or not any segment went out
            // with them.
            if description.is_some() {
                self.described = description;
            }
            out.push(Fragment::Video {
                data: unit.data,
                start,
                restart: restarts,
                intra,
                pictures: pictures
                    .iter()
                    .map(|picture| VideoPicture {
                        picture: picture.picture,
                        second_field: picture.field_pair.then_some(picture.picture + 1),
                        time: picture.time as f64 / TIMESCALE as f64,
                        duration: f64::from(picture.duration) / TIMESCALE as f64,
                    })
                    .collect(),
            });
        }
    }

    /// Turn one unit into a fragment, by whichever path this session is on,
    /// say whether a decoder can be started on it, and where it sits against
    /// the group's display clock.
    fn package(
        &mut self,
        gop: &Mpeg2Gop,
        plan: &UnitPlan,
        restarts: bool,
        audio: Option<&AacConfig>,
        audio_track: Option<&Fmp4AudioSamples>,
    ) -> Packaged {
        let lag = self.unit_lag(gop, restarts, plan.timed());
        match (&mut self.video, plan) {
            (
                VideoPipeline::Passthrough {
                    awaiting_intra,
                    recovery_pending,
                    ..
                },
                UnitPlan::Passthrough(timed),
            ) => {
                let unit = &timed.unit;
                // A unit yields samples only once a picture a decoder can
                // begin at has arrived, which is what this was waiting for.
                *awaiting_intra &= unit.samples.is_empty();
                // An MPEG-2 intra picture needs nothing coded around it to be
                // a recovery point, so a restart is due exactly when one was
                // asked for and the unit opens with one.
                let opens_at_intra = unit.samples.first().is_some_and(|sample| sample.sync);
                let recovery_point = *recovery_pending && opens_at_intra;
                *recovery_pending &= !recovery_point;
                let fragment = mpeg2_gop_to_fmp4(
                    &gop.data,
                    unit,
                    self.sequence_number,
                    self.video_presentation_start,
                    plan.lead_in(restarts),
                    restarts || recovery_point,
                    // Every unit opens with a sequence header, so nothing in the
                    // unit itself says whether it is the one the initialization
                    // segment should be built from.
                    self.describe_pending,
                    audio,
                    audio_track,
                );
                Packaged {
                    fragment,
                    recovery_point,
                    lag,
                    pictures: Vec::new(),
                }
            }
            (VideoPipeline::Decode { awaiting_intra }, UnitPlan::Decode(timed)) => {
                let unit = &timed.unit;
                *awaiting_intra &= unit.samples.is_empty();
                let (fragment, pictures) = mpeg2_decode_unit_to_fmp4(
                    unit,
                    self.sequence_number,
                    self.video_presentation_start,
                    plan.lead_in(restarts),
                    self.describe_pending,
                    audio_track,
                );
                Packaged {
                    fragment,
                    recovery_point: false,
                    lag,
                    pictures,
                }
            }
            // The pipeline is chosen once, at construction, and the plan is
            // made by it.
            _ => unreachable!("the unit plan matches the pipeline that made it"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_is_due_at_the_gop_or_media_byte_limit() {
        let mut session = Session::new(SessionOptions::new(VideoMode::Passthrough));
        session.gops_emitted = 1;
        session.media_bytes_since_random_access = MAX_RECOVERY_BYTES - 1;
        assert!(!session.is_random_access_point());

        session.media_bytes_since_random_access = MAX_RECOVERY_BYTES;
        assert!(session.is_random_access_point());

        session.media_bytes_since_random_access = 0;
        session.gops_emitted = session.recovery_point_gop_interval;
        assert!(session.is_random_access_point());
    }
}
