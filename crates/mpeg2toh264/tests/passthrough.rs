//! Carrying the MPEG-2 video through to the MP4 as it stands.
//!
//! The point of this path is that nothing happens to the picture, so that is
//! what these check: the bytes that come out are the bytes that went in, cut
//! into one sample per picture and sitting at the times the timeline gives
//! them.

mod support;

use std::collections::HashMap;

use mpeg2toh264::mpeg2::headers::{
    parse_elementary_stream, picture_sequence_description, pictures_interlacing,
    stream_sequence_description,
};
use mpeg2toh264::{
    mpeg2_passthrough_unit, mpeg2_to_fmp4, mpeg2_video_timeline, Fragment, Session, SessionOptions,
};
use support::{
    fnv1a, non_intra_matrix_extension, passthrough, read_fixture, with_extension_in_pictures,
    wrap_mpeg2_es_in_ts, FIXTURES,
};

fn run_session(stream: &[u8], options: SessionOptions) -> Vec<Fragment> {
    let mut session = Session::new(options);
    let mut fragments = Vec::new();
    for chunk in stream.chunks(64 * 1024) {
        fragments.extend(session.push(chunk).expect("push succeeds"));
    }
    fragments.extend(session.finish().expect("finish succeeds"));
    fragments
}

/// The payload of the one `mdat` in a media segment. A session with no audio
/// puts nothing else in it, so this is every video sample end to end.
fn mdat_payload(segment: &[u8]) -> &[u8] {
    let mut at = 0;
    while at + 8 <= segment.len() {
        let size = u32::from_be_bytes(segment[at..at + 4].try_into().expect("four bytes")) as usize;
        assert!(
            size >= 8 && at + size <= segment.len(),
            "box at {at} overruns"
        );
        if &segment[at + 4..at + 8] == b"mdat" {
            return &segment[at + 8..at + size];
        }
        at += size;
    }
    panic!("media segment has no mdat");
}

/// Every video sample of a video-only session, end to end.
fn media_bytes(fragments: &[Fragment]) -> Vec<u8> {
    let mut out = Vec::new();
    for fragment in fragments {
        if let Fragment::Media { data, .. } = fragment {
            out.extend_from_slice(mdat_payload(data));
        }
    }
    out
}

// ------------------------------------------------------------ the whole unit

#[test]
fn cuts_every_fixture_into_one_sample_per_picture() {
    for name in FIXTURES {
        let source = read_fixture(name);
        let unit = mpeg2_passthrough_unit(&source, false).expect("passthrough unit");
        assert_eq!(
            unit.samples.len(),
            unit.timeline.presentation_indices.len(),
            "{name} has a sample for each picture the timeline places"
        );
        assert!(unit.samples[0].sync, "{name} opens at an intra picture");
        assert!(
            unit.sequence_header_len > 0,
            "{name} opens with a sequence header"
        );
        // Samples run end to end, in order, inside the unit.
        let mut previous = 0;
        for (index, sample) in unit.samples.iter().enumerate() {
            assert!(
                sample.start >= previous && sample.end > sample.start,
                "{name} sample {index} is {}..{} after {previous}",
                sample.start,
                sample.end
            );
            previous = sample.end;
        }
        assert!(previous <= source.len(), "{name} runs past the source");
    }
}

#[test]
fn carries_the_source_bytes_unchanged() {
    // Nothing is decoded and nothing is coded, so every byte of every picture
    // the unit keeps has to reach the MP4 as it stood. A fixture is one group
    // of pictures with nothing dropped, so that is all of them.
    for name in FIXTURES {
        let source = read_fixture(name);
        let unit = mpeg2_passthrough_unit(&source, false).expect("passthrough unit");
        let carried: Vec<u8> = unit
            .samples
            .iter()
            .flat_map(|sample| source[sample.start..sample.end].iter().copied())
            .collect();
        let end = unit.samples.last().expect("a sample").end;
        assert_eq!(
            fnv1a(&carried),
            fnv1a(&source[..end]),
            "{name} was altered on the way through"
        );
        // What is left out is the tail after the last slice, which holds no
        // picture: a sequence end code, or padding.
        let pictures = parse_elementary_stream(&source[end..]).expect("tail parses");
        assert!(pictures.is_empty(), "{name} left a picture behind");
    }
}

#[test]
fn describes_the_video_as_mpeg_2_with_its_sequence_header() {
    let source = read_fixture("ibbp.m2v");
    let unit = mpeg2_passthrough_unit(&source, false).expect("passthrough unit");
    let mp4 = mpeg2_to_fmp4(&source, &unit);

    assert_eq!(
        mp4.mime_codec, "video/mp4; codecs=\"mp4v.61\"",
        "MPEG-2 Main Profile carried by MPEG-4 systems (RFC 6381)"
    );
    assert_eq!(&mp4.init_segment[4..8], b"ftyp");
    assert!(
        mp4.init_segment.windows(4).any(|w| w == b"mp4v"),
        "the sample entry is an MPEG-4 visual one"
    );
    assert!(
        mp4.init_segment.windows(4).any(|w| w == b"esds"),
        "which carries its decoder configuration in an esds"
    );
    // The decoder specific info is the sequence header the unit opens with.
    let sequence_header = &source[..unit.sequence_header_len];
    assert!(
        mp4.init_segment
            .windows(sequence_header.len())
            .any(|w| w == sequence_header),
        "the esds does not hold the sequence header"
    );
    assert_eq!(mp4.sample_count, unit.samples.len());
}

#[test]
fn packages_each_fixture_as_a_fragmented_mp4() {
    for name in FIXTURES {
        let source = read_fixture(name);
        let unit = mpeg2_passthrough_unit(&source, false).expect("passthrough unit");
        let mp4 = mpeg2_to_fmp4(&source, &unit);

        assert_eq!(
            &mp4.init_segment[4..8],
            b"ftyp",
            "{name} init is not an MP4"
        );
        assert!(
            mp4.init_segment.windows(4).any(|w| w == b"moov"),
            "{name} init has no moov"
        );
        assert_eq!(
            &mp4.media_segment[4..8],
            b"moof",
            "{name} media segment is not a fragment"
        );
        assert!(mp4.mime_codec.starts_with("video/mp4; codecs=\"mp4v.61"));
        assert_eq!(
            mp4.sample_count,
            unit.timeline.presentation_indices.len(),
            "{name} sample count"
        );
    }
}

#[test]
fn reading_the_description_from_the_headers_agrees_with_the_parse() {
    // A unit is packaged before it is planned, so what the muxer is told about
    // a unit comes from the headers walk and which of its pictures are kept
    // comes from the parse. The two answering differently is what would leave
    // a fragment describing a unit its pictures do not belong to.
    for name in FIXTURES {
        let source = read_fixture(name);
        let pictures = parse_elementary_stream(&source).expect("fixture parses");
        assert_eq!(
            stream_sequence_description(&source),
            Some(picture_sequence_description(&pictures[0])),
            "{name}"
        );
    }
}

#[test]
fn a_unit_carrying_two_descriptions_keeps_only_the_pictures_of_the_one_it_opens_with() {
    // A unit is described by the sequence header it opens with, and the group
    // splitter cuts where that changes. Handed the two in one piece anyway --
    // an elementary stream carried in one call, or the tail of a recording that
    // had no group header left to cut on -- the pictures coded under the other
    // description are dropped rather than carried under a description that
    // does not fit them.
    let first = read_fixture("ibbp.m2v");
    let second = read_fixture("hd1080i.m2v");
    let combined = [first.as_slice(), second.as_slice()].concat();

    let alone = mpeg2_passthrough_unit(&first, false).expect("one description");
    let both = mpeg2_passthrough_unit(&combined, false).expect("two descriptions");
    assert_eq!(
        both.timeline.presentation_indices, alone.timeline.presentation_indices,
        "the second description contributes no picture"
    );
    assert_eq!(both.samples, alone.samples);
}

#[test]
fn a_matrix_that_changes_within_a_unit_drops_no_picture() {
    // Some broadcast encoders adapt the quantiser matrices picture by picture,
    // several times within one group. The matrices are not part of what
    // describes a unit, so the pictures behind the change are kept rather than
    // dropped for disagreeing with it -- which would leave a recording playing
    // at the two frames a second its groups opened with.
    let source = read_fixture("ibbp.m2v");
    let plain = mpeg2_passthrough_unit(&source, false).expect("passthrough unit");
    let pictures: Vec<usize> = (1..15).collect();
    let adapted =
        with_extension_in_pictures(&source, &pictures, &non_intra_matrix_extension(&[24u8; 64]));
    let unit = mpeg2_passthrough_unit(&adapted, false).expect("passthrough unit");

    assert_eq!(
        unit.timeline.presentation_indices, plain.timeline.presentation_indices,
        "a picture coded under another matrix is still kept"
    );
    assert_eq!(unit.samples.len(), plain.samples.len());
}

/// fixture, interlaced, top field first. Checked against what ffprobe reports
/// for the same files: `tt` for hd1080i, `bb` for altscan, progressive for the
/// rest. A player has no other way to learn this -- a frame of two moments
/// looks like one of one -- so getting it wrong deinterlaces a progressive
/// picture, or moves an interlaced one half a field the wrong way.
const SCAN: [(&str, bool, bool); 6] = [
    ("altscan.m2v", true, false),
    ("escape.m2v", false, true),
    ("hd1080i.m2v", true, true),
    ("i_only.m2v", false, true),
    ("ibbp.m2v", false, true),
    ("ip.m2v", false, true),
];

#[test]
fn reads_the_field_order_of_every_fixture() {
    for &(name, interlaced, top_field_first) in &SCAN {
        let source = read_fixture(name);
        let pictures = parse_elementary_stream(&source).expect("parse");
        let interlacing = pictures_interlacing(&pictures);
        assert_eq!(interlacing.interlaced, interlaced, "{name} interlaced");
        if interlaced {
            assert_eq!(
                interlacing.top_field_first, top_field_first,
                "{name} top field first"
            );
        }
        // The first retained picture is what a player applies when playback
        // enters the fixture; later pictures carry their own scan separately.
        let timeline = mpeg2_video_timeline(&source, false).expect("timeline");
        let first = timeline.sample_scans.first().expect("picture scan");
        assert_eq!(first.interlaced, interlaced, "{name} timeline interlaced");
        if interlaced {
            assert_eq!(
                first.top_field_first, top_field_first,
                "{name} timeline top field first"
            );
        }
    }
}

#[test]
fn rejects_a_stream_with_no_pictures() {
    let error = mpeg2_passthrough_unit(&[0u8; 16], false).expect_err("must fail");
    assert!(error.to_string().contains("no MPEG-2 pictures"));
}

// ---------------------------------------------------------------- a session

/// The fixture, repeated, as a transport stream: one group of pictures each.
fn video_only_stream(copies: usize, continuity: &mut HashMap<u16, u8>) -> Vec<u8> {
    wrap_mpeg2_es_in_ts(
        &read_fixture("ibbp.m2v").repeat(copies),
        Some(90_000),
        continuity,
    )
}

#[test]
fn a_passthrough_session_says_it_carries_mpeg_2() {
    let fragments = run_session(&video_only_stream(3, &mut HashMap::new()), passthrough());
    let Some(Fragment::Init {
        data, mime_codec, ..
    }) = fragments.first()
    else {
        panic!("the init segment comes first");
    };
    assert_eq!(mime_codec, "video/mp4; codecs=\"mp4v.61\"");
    assert!(data.windows(4).any(|w| w == b"mp4v"));
    assert_eq!(
        fragments
            .iter()
            .filter(|f| matches!(f, Fragment::Init { .. }))
            .count(),
        1,
        "MSE needs the init segment exactly once, and every unit could give one"
    );
}

#[test]
fn a_session_carries_the_source_pictures_end_to_end() {
    let stream = video_only_stream(3, &mut HashMap::new());
    let fragments = run_session(&stream, passthrough());
    let carried = media_bytes(&fragments);

    let pictures = parse_elementary_stream(&carried).expect("the samples parse as MPEG-2");
    let samples: usize = fragments
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { video_samples, .. } => *video_samples,
            _ => 0,
        })
        .sum();
    assert_eq!(
        pictures.len(),
        samples,
        "one coded picture per sample the fragments claim"
    );
    // Three copies of a group of pictures, carried whole.
    let one = read_fixture("ibbp.m2v");
    let expected = parse_elementary_stream(&one).expect("fixture parses").len();
    assert_eq!(pictures.len(), expected * 3);
}

#[test]
fn a_restart_point_opens_with_a_sequence_header() {
    // A player evicting what it has shown cuts back to a restart point, so the
    // sample there has to be one a decoder can be handed cold.
    let fragments = run_session(&video_only_stream(26, &mut HashMap::new()), passthrough());
    let mut restarts = 0;
    for fragment in &fragments {
        let Fragment::Media {
            data,
            random_access,
            ..
        } = fragment
        else {
            continue;
        };
        if !random_access {
            continue;
        }
        restarts += 1;
        assert_eq!(
            &mdat_payload(data)[..4],
            &[0, 0, 1, 0xb3],
            "a restart fragment opens with a sequence header"
        );
    }
    assert_eq!(restarts, 2, "the opening fragment, then every 24th");
}

#[test]
fn a_passthrough_session_muxes_the_aac_track_beside_it() {
    // The video and the sound are put into one fragment, so the two trafs
    // have to arrive together.
    let stream = support::mux_transport_stream(
        &[
            (support::VIDEO_PID, support::STREAM_TYPE_MPEG2_VIDEO),
            (support::AUDIO_PID, support::STREAM_TYPE_AAC_ADTS),
        ],
        &[
            support::PesUnit {
                pid: support::VIDEO_PID,
                stream_id: 0xe0,
                pts: Some(90_000),
                payload: &read_fixture("ibbp.m2v").repeat(3),
            },
            support::PesUnit {
                pid: support::AUDIO_PID,
                stream_id: 0xc0,
                pts: Some(90_000),
                payload: &support::adts_stream(64, 4, 2),
            },
        ],
        &mut HashMap::new(),
    );
    let fragments = run_session(&stream, passthrough());
    let Some(Fragment::Init { mime_codec, .. }) = fragments.first() else {
        panic!("the init segment comes first");
    };
    assert_eq!(mime_codec, "video/mp4; codecs=\"mp4v.61,mp4a.40.2\"");
    let audio: usize = fragments
        .iter()
        .map(|fragment| match fragment {
            Fragment::Media { audio_samples, .. } => *audio_samples,
            _ => 0,
        })
        .sum();
    assert!(audio > 0, "the audio track reached the fragments");
}
