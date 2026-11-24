//! Pictures that no sound covers: a read that opens after the sound has ended,
//! and a stream whose sound stops before its last pictures. They go out all
//! the same, where they would have with the sound there.

mod support;

use std::collections::HashMap;

use mpeg2toh264::mpeg2::headers::parse_elementary_stream;
use mpeg2toh264::{mpeg2_video_timeline, Fragment, Session, SessionOptions, VideoPicture};
use support::{
    adts_stream, decode, mux_transport_stream, passthrough, read_fixture, track_samples, PesUnit,
    TrackSample, AUDIO_PID, STREAM_TYPE_AAC_ADTS, STREAM_TYPE_MPEG2_VIDEO, VIDEO_PID,
};

const START: u64 = 900_000;
const COPIES: u64 = 3;
const AAC_TICKS: u64 = 1024 * 90_000 / 48_000;

/// Copies of a group, each stamped where it plays, and how many pictures one
/// holds.
fn groups() -> (Vec<u8>, u64, usize) {
    let one = read_fixture("ibbp.m2v");
    let timeline = mpeg2_video_timeline(&one, false).expect("a timeline");
    let pictures = parse_elementary_stream(&one).expect("parses").len();
    let span = pictures as u64 * u64::from(timeline.sample_duration);
    (one, span, pictures)
}

/// A programme that names its sound, each group followed by the sound that
/// covers it while `sounded` says it has any.
fn stream(sounded: impl Fn(u64) -> bool) -> Vec<u8> {
    let (one, span, _) = groups();
    let block = adts_stream(1, 3, 2).repeat(span.div_ceil(AAC_TICKS) as usize);
    let mut units = Vec::new();
    for copy in 0..COPIES {
        let pts = START + copy * span;
        units.push(PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload: &one,
            pts: Some(pts),
        });
        if sounded(copy) {
            units.push(PesUnit {
                pid: AUDIO_PID,
                stream_id: 0xc0,
                payload: &block,
                pts: Some(pts),
            });
        }
    }
    mux_transport_stream(
        &[
            (VIDEO_PID, STREAM_TYPE_MPEG2_VIDEO),
            (AUDIO_PID, STREAM_TYPE_AAC_ADTS),
        ],
        &units,
        &mut HashMap::new(),
    )
}

fn run(stream: &[u8], options: SessionOptions, origin: Option<u64>) -> (Vec<Fragment>, u64) {
    let mut session = Session::anchored(options, origin);
    let mut fragments = session.push(stream).expect("push");
    fragments.extend(session.finish().expect("finish"));
    (fragments, session.origin_ticks().expect("an origin"))
}

fn video_track(fragments: &[Fragment]) -> Vec<TrackSample> {
    track_samples(fragments).video
}

fn pictures(fragments: &[Fragment]) -> Vec<VideoPicture> {
    fragments
        .iter()
        .filter_map(|fragment| match fragment {
            Fragment::Video { pictures, .. } => Some(pictures.clone()),
            _ => None,
        })
        .flatten()
        .collect()
}

fn audio_frames(fragments: &[Fragment]) -> usize {
    fragments
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { audio_samples, .. } => *audio_samples,
            _ => 0,
        })
        .sum()
}

/// What a session makes of `stream` against the same pictures with all their
/// sound: the same pictures at the same times, and `frames` of sound.
fn assert_pictures_as_with_sound(label: &str, stream: &[u8], frames: usize) {
    let (_, _, per_group) = groups();
    let whole = self::stream(|_| true);
    let total = per_group * COPIES as usize;
    // Unanchored, the origin is chosen by the same rule either way, as the
    // sound starts where the pictures do; anchored, it is the one named.
    for origin in [None, Some(START - 9_000)] {
        let (muxed, muxed_origin) = run(stream, passthrough(), origin);
        let (reference, reference_origin) = run(&whole, passthrough(), origin);
        assert_eq!(muxed_origin, reference_origin, "{label} {origin:?}: origin");
        let video = video_track(&muxed);
        assert_eq!(
            video.len(),
            total,
            "{label} {origin:?}: passthrough samples"
        );
        assert_eq!(
            video,
            video_track(&reference),
            "{label} {origin:?}: passthrough"
        );
        assert_eq!(
            track_samples(&muxed).audio.len(),
            frames,
            "{label} {origin:?}: muxed sound"
        );

        let (decoded, decoded_origin) = run(stream, decode(), origin);
        let (reference, _) = run(&whole, decode(), origin);
        assert_eq!(
            decoded_origin, reference_origin,
            "{label} {origin:?}: decode origin"
        );
        let shown = pictures(&decoded);
        assert_eq!(shown.len(), total, "{label} {origin:?}: decoded pictures");
        assert_eq!(shown, pictures(&reference), "{label} {origin:?}: decode");
        assert_eq!(audio_frames(&decoded), frames, "{label} {origin:?}: sound");
    }
}

#[test]
fn a_read_with_no_sound_left_gives_its_pictures() {
    assert_pictures_as_with_sound("no sound", &stream(|_| false), 0);
}

#[test]
fn pictures_after_the_sound_has_stopped_go_out() {
    let (_, span, _) = groups();
    let per_group = span.div_ceil(AAC_TICKS) as usize;
    assert_pictures_as_with_sound(
        "sound stops",
        &stream(|copy| copy + 1 < COPIES),
        per_group * (COPIES as usize - 1),
    );
}
