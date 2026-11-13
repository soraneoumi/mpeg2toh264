//! MPEG-2 video from MPEG transport streams, packaged for playback.
//!
//! A [`Session`] takes a transport stream in slices and hands back fragmented
//! MP4. The video is either carried into the MP4 as it stands
//! ([`VideoMode::Passthrough`]) or handed out as MPEG-2 units for the caller to
//! decode with [`mpeg2::decode`] ([`VideoMode::Decode`]), in which case only the
//! sound is muxed. The sound is the stream's own AAC, changed only in its gain.

// The inverse transform, dequantiser and macroblock paths index several arrays
// in step with a position or block number taken straight from the
// specification's own formulas. Rewriting those as iterator chains hides the
// correspondence that makes them checkable against the text.
#![allow(clippy::needless_range_loop)]

mod error;

pub mod bitreader;
pub mod container;
pub mod mpeg2;
pub mod session;

pub use error::{Error, Result};

pub use container::adts::{AudioGain, DualMono};
pub use container::fmp4::{
    mpeg2_decode_unit_to_fmp4, mpeg2_gop_to_fmp4, mpeg2_passthrough_unit, mpeg2_to_fmp4,
    mpeg2_video_timeline, Fmp4Fragment, Fmp4Output, Mpeg2Sample, Mpeg2Unit, Mpeg2VideoTimeline,
    PicturePresentation, UnitLeadIn,
};
pub use container::mpegts::{
    extract_mpeg2_video_es, first_pts, is_mpeg_transport_stream, last_pts, AudioStream,
    ElementaryKind, MpegTsAvDemuxer,
};
pub use mpeg2::headers::{
    picture_display_size, picture_matrix, pictures_interlacing, stream_sequence_description,
    Interlacing, SequenceDescription, YcbcrMatrix,
};
pub use session::VideoScan;
pub use session::{Fragment, OpenGopRecovery, Session, SessionOptions, VideoMode, VideoPicture};

/// JavaScript's `Math.round`, which the reference implementation used
/// throughout: exact halves go towards positive infinity, where Rust's
/// [`f64::round`] sends them away from zero. Keeping the tie-break identical is
/// what keeps timestamps and sample durations the same as that implementation's.
#[inline]
pub(crate) fn round_half_up(value: f64) -> f64 {
    (value + 0.5).floor()
}
