//! The AAC decoder against ffmpeg's float decoder on the fixtures in
//! testdata/aac, which tools/make-fixtures.sh made along with their reference
//! output.

mod support;

use mpeg2toh264::audio::{parse_block, AacDecoder, ChannelLayout, ParsedBlock, PcmFrame, Speaker};
use mpeg2toh264::container::aac::walk_block;
use support::read_fixture;

/// The largest difference from the reference allowed: one step of 16-bit
/// output.
const BAR: f32 = 1.0 / 32768.0;

/// The ADTS frames of `stream`: header fields and the raw_data_block.
fn frames(stream: &[u8]) -> Vec<(u8, u8, &[u8])> {
    let mut out = Vec::new();
    let mut at = 0;
    while at < stream.len() {
        assert_eq!(stream[at], 0xff, "a frame at {at}");
        let header_length = if stream[at + 1] & 1 != 0 { 7 } else { 9 };
        let length = ((stream[at + 3] as usize & 3) << 11)
            | (stream[at + 4] as usize) << 3
            | (stream[at + 5] >> 5) as usize;
        let frequency_index = (stream[at + 2] >> 2) & 15;
        let channel_configuration = (stream[at + 2] & 1) << 2 | stream[at + 3] >> 6;
        out.push((
            frequency_index,
            channel_configuration,
            &stream[at + header_length..at + length],
        ));
        at += length;
    }
    out
}

/// Which of our channels each of ffmpeg's is, in its order.
fn ffmpeg_order(layout: &ChannelLayout) -> Vec<usize> {
    let ChannelLayout::Speakers { speakers, .. } = layout else {
        return match layout {
            ChannelLayout::Mono => vec![0],
            _ => vec![0, 1],
        };
    };
    let order: &[Speaker] = match speakers.len() {
        2 => &[Speaker::FrontLeft, Speaker::FrontRight],
        6 => &[
            Speaker::FrontLeft,
            Speaker::FrontRight,
            Speaker::FrontCentre,
            Speaker::Lfe,
            Speaker::SurroundLeft,
            Speaker::SurroundRight,
        ],
        _ => panic!("no fixture has {speakers:?}"),
    };
    order
        .iter()
        .map(|want| speakers.iter().position(|s| s == want).unwrap())
        .collect()
}

fn check(name: &str, sample_rate: u32, channels: usize) {
    let stream = read_fixture(&format!("aac/{name}.adts"));
    let reference: Vec<f32> = read_fixture(&format!("aac/{name}.f32"))
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();
    let frames = frames(&stream);
    assert_eq!(reference.len(), frames.len() * 1024 * channels, "{name}");

    let mut block = ParsedBlock::new();
    let mut decoder = AacDecoder::new();
    let mut pcm = PcmFrame::new();
    for (index, &(frequency_index, channel_configuration, data)) in frames.iter().enumerate() {
        let walked = walk_block(data, frequency_index).expect("a fixture frame walks");
        assert!(parse_block(data, frequency_index, &mut block));
        assert_eq!(block.elements(), walked.elements.as_slice());
        assert_eq!(block.pce(), walked.pce.as_ref());

        decoder
            .decode(&block, channel_configuration, frequency_index, &mut pcm)
            .unwrap();
        assert_eq!(pcm.channels(), channels);
        assert_eq!(pcm.sample_rate(), sample_rate);
        let order = ffmpeg_order(pcm.layout());
        let expected = &reference[index * 1024 * channels..(index + 1) * 1024 * channels];
        for (theirs, &ours) in order.iter().enumerate() {
            for (i, &got) in pcm.channel(ours).iter().enumerate() {
                let want = expected[i * channels + theirs];
                assert!(
                    (got - want).abs() <= BAR,
                    "{name} frame {index} channel {theirs} sample {i}: {got} against {want}"
                );
            }
        }
    }
}

#[test]
fn stereo_48k_with_mid_side() {
    check("stereo48", 48_000, 2);
}

#[test]
fn intensity_stereo_44k() {
    check("intensity44", 44_100, 2);
}

#[test]
fn mono_32k() {
    check("mono32", 32_000, 1);
}

#[test]
fn stereo_24k_with_tns() {
    check("stereo24", 24_000, 2);
}

#[test]
fn stereo_16k_with_tns() {
    check("stereo16", 16_000, 2);
}

#[test]
fn surround_5_1() {
    check("surround48", 48_000, 6);
}
