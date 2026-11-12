//! The MPEG-2 decoder on the checked-in fixtures: golden output, and damaged
//! input that must decode without panicking.

mod support;

use std::collections::HashSet;

use mpeg2toh264::mpeg2::constants::{PictureStructure, PictureType};
use mpeg2toh264::mpeg2::decode::{DecodedFrame, Decoder, DisplayOrder, StreamDecoder};
use mpeg2toh264::mpeg2::headers::parse_elementary_stream;
use support::{fnv1a, read_fixture, FIXTURES};

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
