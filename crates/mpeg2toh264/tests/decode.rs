//! The MPEG-2 decoder on the checked-in fixtures: golden output, and damaged
//! input that must decode without panicking.

mod support;

use std::collections::HashSet;

use mpeg2toh264::mpeg2::constants::{PictureStructure, PictureType};
use mpeg2toh264::mpeg2::decode::{
    packed_planes, DecodedFrame, Decoder, DisplayOrder, StreamDecoder, UnitDecoder,
};
use mpeg2toh264::mpeg2::headers::parse_elementary_stream;
use mpeg2toh264::{
    mpeg2_video_timeline, picture_display_size, picture_matrix, Fragment, Session,
    TranscodeOptions, YcbcrMatrix,
};
use support::{decoding, fnv1a, mux_with_sound, read_fixture, FIXTURES};

/// Frames output and FNV-1a of their visible Y, Cb and Cr samples, in
/// display order. The values were taken from a decode that matched ffmpeg
/// to at least 63 dB on every frame (tools/compare-decode.py); they pin the
/// output so that any change to it has to be explained.
const GOLDEN: [(&str, usize, u64); 7] = [
    ("altscan.m2v", 8, 0x4a7a_d267_899b_700a),
    ("escape.m2v", 6, 0x707d_f006_a63f_afd6),
    ("hd1080i.m2v", 15, 0xc8a1_21eb_f049_3534),
    ("i_only.m2v", 3, 0x886f_90c2_0a6c_41b0),
    ("ibbp.m2v", 15, 0x75eb_af27_4b04_d2da),
    ("ip.m2v", 10, 0xb34e_aec8_1c31_5f8c),
    ("open_gop_leading_bb.m2v", 46, 0x72d9_13ed_b55d_9364),
];

/// Visible samples of a frame, plane after plane.
fn samples(frame: &DecodedFrame) -> Vec<u8> {
    let mut out = Vec::new();
    for component in 0..3 {
        let plane = frame.plane(component);
        for y in 0..plane.height {
            out.extend_from_slice(plane.row(y));
        }
    }
    out
}

/// Decode `data` in chunks of `chunk` bytes, checking every frame's shape.
fn decode_stream(data: &[u8], chunk: usize) -> (usize, Vec<u8>) {
    let mut decoder = StreamDecoder::new();
    let mut count = 0;
    let mut all = Vec::new();
    let mut take = |frame: &DecodedFrame| {
        let (width, height) = frame.size();
        let (coded_width, coded_height) = frame.coded_size();
        assert!(width <= coded_width && height <= coded_height);
        assert_eq!(coded_width % 16, 0);
        assert_eq!(coded_height % 16, 0);
        let luma = frame.plane(0);
        assert_eq!((luma.width, luma.height), (width, height));
        let chroma = frame.plane(1);
        assert_eq!(
            (chroma.width, chroma.height),
            (width.div_ceil(2), height.div_ceil(2))
        );
        assert!(frame.info().concealed_macroblocks <= frame.info().macroblocks);
        all.extend_from_slice(&samples(frame));
        count += 1;
    };
    for piece in data.chunks(chunk) {
        decoder.push(piece, &mut take);
    }
    decoder.finish(&mut take);
    assert_eq!(decoder.stats().output, count);
    (count, all)
}

#[test]
fn decodes_every_fixture_to_the_expected_frames() {
    let mut mismatches = Vec::new();
    for &(name, frames, hash) in &GOLDEN {
        let (count, all) = decode_stream(&read_fixture(name), 1 << 20);
        let actual = (name, count, fnv1a(&all));
        if actual != (name, frames, hash) {
            mismatches.push(format!("(\"{name}\", {count}, 0x{:016x})", actual.2));
        }
    }
    assert!(
        mismatches.is_empty(),
        "golden mismatch:\n{}",
        mismatches.join("\n")
    );
}

#[test]
fn chunk_size_does_not_change_the_output() {
    let data = read_fixture("ibbp.m2v");
    let whole = decode_stream(&data, data.len());
    for chunk in [1, 7, 188, 4096] {
        assert_eq!(decode_stream(&data, chunk), whole, "chunks of {chunk}");
    }
}

/// A small deterministic generator, so that failures reproduce.
struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, bound: usize) -> usize {
        (self.next() % bound as u64) as usize
    }
}

#[test]
fn truncated_streams_decode_without_panicking() {
    for name in FIXTURES {
        let data = read_fixture(name);
        for step in 1..24 {
            let cut = data.len() * step / 24 + step;
            decode_stream(&data[..cut.min(data.len())], 1 << 16);
        }
    }
}

#[test]
fn corrupted_streams_decode_without_panicking() {
    let mut random = Random(0x9e37_79b9_7f4a_7c15);
    for name in FIXTURES {
        let data = read_fixture(name);
        for round in 0..12 {
            let mut damaged = data.clone();
            // From a few bytes to one in a hundred.
            let count = 4 + round * damaged.len() / 1200;
            for _ in 0..count {
                let at = random.below(damaged.len());
                damaged[at] = random.next() as u8;
            }
            // Cut a few holes as well, as lost transport packets leave.
            for _ in 0..round {
                let at = random.below(damaged.len());
                let end = (at + random.below(400)).min(damaged.len());
                damaged.drain(at..end);
            }
            decode_stream(&damaged, 1 << 16);
        }
    }
}

#[test]
fn pictures_without_their_references_are_concealed() {
    let data = read_fixture("ibbp.m2v");
    let pictures = parse_elementary_stream(&data).expect("parses");
    let p = pictures
        .iter()
        .find(|picture| picture.header.picture_coding_type == PictureType::P)
        .expect("has a P picture");
    let b = pictures
        .iter()
        .find(|picture| picture.header.picture_coding_type == PictureType::B)
        .expect("has a B picture");

    let mut decoder = Decoder::new();
    let frame = decoder.decode_frame(&data, b, None).expect("decodes");
    assert!(frame.info().missing_reference);
    assert!(frame.info().concealed_macroblocks > 0);
    // A B frame never becomes a reference.
    assert_eq!(decoder.references(), 0);

    let frame = decoder.decode_frame(&data, p, None).expect("decodes");
    assert!(frame.info().missing_reference);
    assert!(frame.info().concealed_macroblocks > 0);
    assert_eq!(decoder.references(), 1);

    decoder.reset();
    assert_eq!(decoder.references(), 0);
}

#[test]
fn a_field_without_its_second_field_conceals_the_other_one() {
    let data = read_fixture("i_only.m2v");
    let pictures = parse_elementary_stream(&data).expect("parses");
    // A frame picture's slices read as a top field: valid syntax, the wrong
    // picture, which is all this needs.
    let mut field = pictures[0].clone();
    field.coding.picture_structure = PictureStructure::TopField;
    field.sequence_ext.progressive_sequence = false;
    let mut decoder = Decoder::new();
    let frame = decoder.decode_frame(&data, &field, None).expect("decodes");
    let info = frame.info();
    assert!(info.missing_field);
    assert!(info.concealed_macroblocks >= info.macroblocks / 2);

    // A second field of the same parity cannot complete the frame.
    assert!(decoder.decode_frame(&data, &field, Some(&field)).is_err());
    // Nor can anything complete a frame picture.
    assert!(decoder
        .decode_frame(&data, &pictures[0], Some(&field))
        .is_err());
}

#[test]
fn frames_are_reused_once_released() {
    let data = read_fixture("ibbp.m2v");
    let pictures = parse_elementary_stream(&data).expect("parses");
    let mut decoder = Decoder::new();
    let mut order = DisplayOrder::new();
    let mut buffers = HashSet::new();
    for _ in 0..4 {
        for picture in &pictures {
            let frame = decoder.decode_frame(&data, picture, None).expect("decodes");
            buffers.insert(frame.plane(0).data.as_ptr() as usize);
            // Showing the frame and letting it go, as a renderer does.
            drop(order.push(frame));
        }
    }
    drop(order.flush());
    // Two references, the frame being decoded and the anchor held for
    // display, and nothing more however long the stream runs.
    assert!(buffers.len() <= 4, "{} frame buffers", buffers.len());
}

/// The `video` fragments a decode-mode session makes of copies of a fixture.
fn decode_mode_units(name: &str, copies: u64) -> (Vec<u8>, Vec<Fragment>) {
    let one = read_fixture(name);
    let timeline = mpeg2_video_timeline(&one, false, &[]).expect("a timeline");
    let group = parse_elementary_stream(&one).expect("parses").len() as u64
        * u64::from(timeline.sample_duration);
    let groups: Vec<(&[u8], u64, u64)> = (0..copies)
        .map(|copy| (one.as_slice(), 900_000 + copy * group, group))
        .collect();
    let stream = mux_with_sound(&groups);
    let mut session = Session::new(decoding(TranscodeOptions::default()));
    let mut fragments = session.push(&stream).expect("push");
    fragments.extend(session.finish().expect("finish"));
    let units = fragments
        .into_iter()
        .filter(|fragment| matches!(fragment, Fragment::Video { .. }))
        .collect();
    (one.repeat(copies as usize), units)
}

/// Decode units from `first` on, after a reset, keeping what is shown at or
/// after `from`, as `(time, samples)`.
fn decode_units(decoder: &mut UnitDecoder, units: &[Fragment], from: f64) -> Vec<(f64, Vec<u8>)> {
    let mut shown = Vec::new();
    for unit in units {
        let Fragment::Video {
            data,
            restart,
            pictures,
            ..
        } = unit
        else {
            unreachable!()
        };
        let count = decoder
            .begin(
                data,
                *restart,
                pictures
                    .iter()
                    .map(|picture| (picture.picture, picture.second_field)),
            )
            .expect("the unit parses");
        assert_eq!(count, pictures.len());
        for picture in pictures {
            let show = picture.time + picture.duration > from;
            if let Some(frame) = decoder.next(show).expect("decodes") {
                assert!(show);
                assert_eq!(frame.matrix, YcbcrMatrix::Bt709);
                let (width, height) = frame.frame.size();
                assert_eq!(frame.display_height as usize, height);
                assert!(frame.display_width as usize >= width);
                let planes = packed_planes(&frame.frame);
                let mut packed = vec![0; planes[2].offset + planes[2].len];
                for (component, plane) in planes.iter().enumerate() {
                    packed[plane.offset..plane.offset + plane.len]
                        .copy_from_slice(&frame.frame.plane(component).data[..plane.len]);
                }
                // The packed planes hold every visible row at its stride.
                let mut visible = Vec::new();
                for (component, plane) in planes.iter().enumerate() {
                    let rows = frame.frame.plane(component);
                    for y in 0..rows.height {
                        let at = plane.offset + y * plane.stride;
                        visible.extend_from_slice(&packed[at..at + rows.width]);
                    }
                }
                assert_eq!(visible, samples(&frame.frame));
                shown.push((picture.time, visible));
            }
        }
    }
    shown.sort_by(|a, b| a.0.total_cmp(&b.0));
    shown
}

#[test]
fn units_decode_to_the_frames_the_stream_decoder_shows() {
    for name in [
        "ibbp.m2v",
        "open_gop_leading_bb.m2v",
        "hd1080i.m2v",
        "ip.m2v",
    ] {
        let (es, units) = decode_mode_units(name, 3);
        let mut expected = Vec::new();
        let mut decoder = StreamDecoder::new();
        let mut take = |frame: &DecodedFrame| expected.push(samples(frame));
        decoder.push(&es, &mut take);
        decoder.finish(&mut take);

        let shown = decode_units(&mut UnitDecoder::new(), &units, f64::NEG_INFINITY);
        let shown: Vec<Vec<u8>> = shown.into_iter().map(|(_, samples)| samples).collect();
        assert_eq!(shown.len(), expected.len(), "{name}: pictures");
        assert!(shown == expected, "{name}: samples");
    }
}

#[test]
fn decoding_from_an_intra_unit_after_a_reset_shows_what_continuous_decoding_does() {
    let (_, units) = decode_mode_units("open_gop_leading_bb.m2v", 2);
    let continuous = decode_units(&mut UnitDecoder::new(), &units, f64::NEG_INFINITY);
    let mut decoder = UnitDecoder::new();
    // Decode a little, then jump to each later intra unit.
    decode_units(&mut decoder, &units[..3], f64::NEG_INFINITY);
    let mut jumps = 0;
    for (at, unit) in units.iter().enumerate().skip(1) {
        let Fragment::Video {
            intra: true,
            pictures,
            ..
        } = unit
        else {
            continue;
        };
        let from = pictures[0].time;
        decoder.reset();
        let shown = decode_units(&mut decoder, &units[at..], from);
        let wanted: Vec<_> = continuous
            .iter()
            .filter(|(time, _)| *time >= from)
            .cloned()
            .collect();
        assert!(shown == wanted, "jump to unit {at}");
        jumps += 1;
    }
    assert!(jumps >= 2);
}

#[test]
fn a_unit_that_fails_leaves_the_decoder_waiting_for_an_intra_unit() {
    let (_, units) = decode_mode_units("ibbp.m2v", 3);
    let mut decoder = UnitDecoder::new();
    decode_units(&mut decoder, &units[..2], f64::NEG_INFINITY);
    let Fragment::Video { data, .. } = &units[2] else {
        unreachable!()
    };
    // A frame the unit does not have, then a second field that is not one.
    assert!(decoder.begin(data, false, [(999, None)]).is_err());
    assert!(decoder.begin(data, false, [(0, Some(2))]).is_err());
    // What follows the failure, up to the next intra unit, shows nothing.
    let next_intra = units
        .iter()
        .skip(3)
        .position(|unit| matches!(unit, Fragment::Video { intra: true, .. }))
        .expect("another intra unit")
        + 3;
    assert!(decode_units(&mut decoder, &units[3..next_intra], f64::NEG_INFINITY).is_empty());
    assert!(!decode_units(&mut decoder, &units[next_intra..], f64::NEG_INFINITY).is_empty());
}

/// `data` with a sequence display extension carrying `matrix` after each
/// sequence extension.
fn with_display_extension(data: &[u8], matrix: u8) -> Vec<u8> {
    // video_format 5, colour_description 1, primaries and transfer 1, the
    // matrix, then a 1920x1080 display size around its marker bit.
    let extension = [
        0x00, 0x00, 0x01, 0xb5, 0x2b, 0x01, 0x01, matrix, 0x1e, 0x02, 0x21, 0xc0,
    ];
    let mut out = Vec::with_capacity(data.len() + 64);
    let mut at = 0;
    while at < data.len() {
        out.push(data[at]);
        if data[at..].starts_with(&[0, 0, 1, 0xb5]) && data.get(at + 4).is_some_and(|b| b >> 4 == 1)
        {
            out.extend_from_slice(&data[at + 1..at + 10]);
            at += 10;
            out.extend_from_slice(&extension);
            continue;
        }
        at += 1;
    }
    out
}

#[test]
fn the_colour_description_names_the_matrix() {
    let data = read_fixture("ibbp.m2v");
    let picture = |data: &[u8]| parse_elementary_stream(data).expect("parses")[0].clone();
    assert_eq!(picture_matrix(&picture(&data)), YcbcrMatrix::Bt709);
    for (code, matrix) in [
        (1, YcbcrMatrix::Bt709),
        (4, YcbcrMatrix::Bt709),
        (5, YcbcrMatrix::Bt601),
        (6, YcbcrMatrix::Bt601),
        (7, YcbcrMatrix::Bt709),
    ] {
        let described = with_display_extension(&data, code);
        assert_ne!(described, data);
        let first = picture(&described);
        assert_eq!(first.matrix_coefficients, Some(code));
        assert_eq!(picture_matrix(&first), matrix, "matrix_coefficients {code}");
        // The samples are the same whatever it names.
        let (count, all) = decode_stream(&described, 1 << 20);
        assert_eq!((count, all), decode_stream(&data, 1 << 20));
    }
}

#[test]
fn display_size_applies_the_sample_aspect_ratio() {
    let picture = parse_elementary_stream(&read_fixture("hd1080i.m2v")).expect("parses")[0].clone();
    let (width, height) = (
        picture.sequence.horizontal_size,
        picture.sequence.vertical_size,
    );
    let mut anamorphic = picture.clone();
    anamorphic.sequence.horizontal_size = 1440;
    anamorphic.sequence.vertical_size = 1080;
    anamorphic.sequence.aspect_ratio_information = 3;
    assert_eq!(picture_display_size(&anamorphic), (1920, 1080));
    let mut square = picture.clone();
    square.sequence.aspect_ratio_information = 1;
    assert_eq!(picture_display_size(&square), (width, height));
    let mut unknown = picture;
    unknown.sequence.aspect_ratio_information = 0;
    assert_eq!(picture_display_size(&unknown), (width, height));
}
