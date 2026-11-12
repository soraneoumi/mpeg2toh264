//! Shared helpers for the integration tests.
//!
//! Each test binary compiles the whole module, so not every helper is used by
//! every one of them.
#![allow(dead_code)]

use std::collections::HashMap;
use std::path::PathBuf;

use mpeg2toh264::mpeg2::constants::{PictureStructure, PictureType};
use mpeg2toh264::mpeg2::headers::parse_elementary_stream;
use mpeg2toh264::{Fragment, TranscodeOptions, VideoMode};

const PACKET_SIZE: usize = 188;

pub fn testdata(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata")
        .join(name)
}

pub fn read_fixture(name: &str) -> Vec<u8> {
    std::fs::read(testdata(name)).expect("fixture is readable")
}

/// Every fixture, so a test can assert something across all of them.
pub const FIXTURES: [&str; 6] = [
    "altscan.m2v",
    "escape.m2v",
    "hd1080i.m2v",
    "i_only.m2v",
    "ibbp.m2v",
    "ip.m2v",
];

/// FNV-1a, so a golden test can pin a multi-megabyte bitstream without either a
/// dependency or a checked-in blob.
pub fn fnv1a(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn psi_packet(pid: u16, section: &[u8], continuity: &mut HashMap<u16, u8>) -> Vec<u8> {
    let mut packet = vec![0xff; PACKET_SIZE];
    let counter = continuity.entry(pid).or_insert(0);
    packet[..5].copy_from_slice(&[
        0x47,
        0x40 | (pid >> 8) as u8,
        (pid & 0xff) as u8,
        0x10 | *counter,
        0x00,
    ]);
    *counter = (*counter + 1) & 15;
    packet[5..5 + section.len()].copy_from_slice(section);
    packet
}

/// The five-byte PTS field of a PES header, clause 2.4.3.7.
fn pts_field(pts: u64) -> [u8; 5] {
    [
        0x21 | (((pts >> 30) & 0x07) as u8) << 1,
        ((pts >> 22) & 0xff) as u8,
        0x01 | (((pts >> 15) & 0x7f) as u8) << 1,
        ((pts >> 7) & 0xff) as u8,
        0x01 | ((pts & 0x7f) as u8) << 1,
    ]
}

/// Wrap an MPEG-2 elementary stream in a single-program transport stream, so the
/// demuxer can be exercised without a multi-megabyte broadcast capture.
pub fn wrap_mpeg2_es_in_ts(
    es: &[u8],
    pts: Option<u64>,
    continuity: &mut HashMap<u16, u8>,
) -> Vec<u8> {
    let pat = psi_packet(
        0,
        &[
            0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xe1, 0x00, 0, 0, 0, 0,
        ],
        continuity,
    );
    let pmt = psi_packet(
        0x100,
        &[
            0x02, 0xb0, 0x12, 0x00, 0x01, 0xc1, 0x00, 0x00, 0xe1, 0x01, 0xf0, 0x00, 0x02, 0xe1,
            0x01, 0xf0, 0x00, 0, 0, 0, 0,
        ],
        continuity,
    );

    let mut pes: Vec<u8> = match pts {
        None => vec![0, 0, 1, 0xe0, 0, 0, 0x80, 0, 0],
        Some(pts) => {
            let mut header = vec![0, 0, 1, 0xe0, 0, 0, 0x80, 0x80, 5];
            header.extend_from_slice(&pts_field(pts));
            header
        }
    };
    pes.extend_from_slice(es);

    let mut out = pat;
    out.extend_from_slice(&pmt);
    let mut at = 0;
    let continuity = continuity.entry(0x101).or_insert(0);
    while at < pes.len() {
        let size = 184.min(pes.len() - at);
        let mut packet = vec![0xff; PACKET_SIZE];
        let start = if at == 0 { 0x40 } else { 0x00 };
        if size == 184 {
            packet[..4].copy_from_slice(&[0x47, start | 0x01, 0x01, 0x10 | *continuity]);
            packet[4..4 + size].copy_from_slice(&pes[at..at + size]);
        } else {
            let adaptation_length = 183 - size;
            packet[..5].copy_from_slice(&[
                0x47,
                start | 0x01,
                0x01,
                0x30 | *continuity,
                adaptation_length as u8,
            ]);
            if adaptation_length > 0 {
                packet[5] = 0;
            }
            let payload = 5 + adaptation_length;
            packet[payload..payload + size].copy_from_slice(&pes[at..at + size]);
        }
        out.extend_from_slice(&packet);
        *continuity = (*continuity + 1) & 15;
        at += size;
    }
    out
}

/// Split an Annex B stream into `(nal_unit_type, payload)` pairs.
pub fn split_annex_b(data: &[u8]) -> Vec<(u8, &[u8])> {
    let mut starts = Vec::new();
    let mut i = 0;
    while i + 3 < data.len() {
        if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 0 && data[i + 3] == 1 {
            starts.push(i + 4);
            i += 4;
        } else {
            i += 1;
        }
    }
    let mut out = Vec::new();
    for (index, &start) in starts.iter().enumerate() {
        let end = starts.get(index + 1).map_or(data.len(), |next| next - 4);
        out.push((data[start] & 0x1f, &data[start..end]));
    }
    out
}

/// One PES packet to place in a synthetic transport stream.
pub struct PesUnit<'a> {
    pub pid: u16,
    pub stream_id: u8,
    pub payload: &'a [u8],
    pub pts: Option<u64>,
}

/// Build a single-program transport stream from PES packets already in the
/// order they should appear. The caller decides how the tracks interleave,
/// which is what makes the audio arrive alongside the video rather than all at
/// the end.
///
/// `streams` names the elementary streams the PMT advertises, as
/// `(pid, stream_type)`.
pub fn mux_transport_stream(
    streams: &[(u16, u8)],
    units: &[PesUnit<'_>],
    continuity: &mut HashMap<u16, u8>,
) -> Vec<u8> {
    mux_programs(&[(1, 0x100, streams)], units, continuity)
}

/// Build a single-program stream whose elementary streams carry explicit PMT
/// descriptors. This is used for relationships such as ARIB component tags.
pub fn mux_transport_stream_with_descriptors(
    streams: &[(u16, u8, &[u8])],
    units: &[PesUnit<'_>],
    continuity: &mut HashMap<u16, u8>,
) -> Vec<u8> {
    let pat = [
        0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xe1, 0x00, 0, 0, 0, 0,
    ];
    let pcr_pid = streams.first().map_or(0x100, |&(pid, _, _)| pid);
    let entries_length: usize = streams
        .iter()
        .map(|(_, _, descriptors)| 5 + descriptors.len())
        .sum();
    let mut pmt = vec![
        0x02,
        0xb0,
        (13 + entries_length) as u8,
        0x00,
        0x01,
        0xc1,
        0x00,
        0x00,
        0xe0 | (pcr_pid >> 8) as u8,
        (pcr_pid & 0xff) as u8,
        0xf0,
        0x00,
    ];
    for &(pid, stream_type, descriptors) in streams {
        pmt.extend_from_slice(&[
            stream_type,
            0xe0 | (pid >> 8) as u8,
            (pid & 0xff) as u8,
            0xf0 | ((descriptors.len() >> 8) & 0x0f) as u8,
            descriptors.len() as u8,
        ]);
        pmt.extend_from_slice(descriptors);
    }
    pmt.extend_from_slice(&[0, 0, 0, 0]);
    let mut out = psi_packet(0, &pat, continuity);
    out.extend_from_slice(&psi_packet(0x100, &pmt, continuity));
    mux_payloads(out, units, continuity)
}

/// One service of a transport stream: its program number, the PID its program
/// map rides on, and the elementary streams it advertises.
pub type Program<'a> = (u16, u16, &'a [(u16, u8)]);

/// As [`mux_transport_stream`], but for a transport stream carrying more than
/// one service.
///
/// The program association table announces them in the order given, and the
/// program maps go out in the opposite order. Which map a multiplexer sends
/// first says nothing about which service anyone is watching, and putting the
/// two orders at odds here is what keeps that from being assumed.
pub fn mux_programs(
    programs: &[Program<'_>],
    units: &[PesUnit<'_>],
    continuity: &mut HashMap<u16, u8>,
) -> Vec<u8> {
    let mut pat_section = vec![0x00, 0xb0, 0x00, 0x00, 0x01, 0xc1, 0x00, 0x00];
    for &(program, pmt_pid, _) in programs {
        pat_section.extend_from_slice(&[
            (program >> 8) as u8,
            (program & 0xff) as u8,
            0xe0 | (pmt_pid >> 8) as u8,
            (pmt_pid & 0xff) as u8,
        ]);
    }
    pat_section.extend_from_slice(&[0, 0, 0, 0]);
    pat_section[2] = (pat_section.len() - 3) as u8;
    let mut out = psi_packet(0, &pat_section, continuity);

    for &(program, pmt_pid, streams) in programs.iter().rev() {
        let pcr_pid = streams.first().map_or(0x100, |&(pid, _)| pid);
        let mut pmt_section = vec![
            0x02,
            0xb0,
            (13 + 5 * streams.len()) as u8,
            (program >> 8) as u8,
            (program & 0xff) as u8,
            0xc1,
            0x00,
            0x00,
            0xe0 | (pcr_pid >> 8) as u8,
            (pcr_pid & 0xff) as u8,
            0xf0,
            0x00,
        ];
        for &(pid, stream_type) in streams {
            pmt_section.extend_from_slice(&[
                stream_type,
                0xe0 | (pid >> 8) as u8,
                (pid & 0xff) as u8,
                0xf0,
                0x00,
            ]);
        }
        pmt_section.extend_from_slice(&[0, 0, 0, 0]);
        out.extend_from_slice(&psi_packet(pmt_pid, &pmt_section, continuity));
    }
    mux_payloads(out, units, continuity)
}

fn mux_payloads(
    mut out: Vec<u8>,
    units: &[PesUnit<'_>],
    continuity: &mut HashMap<u16, u8>,
) -> Vec<u8> {
    for unit in units {
        let mut pes: Vec<u8> = if unit.stream_id == 0xbf {
            vec![0, 0, 1, unit.stream_id, 0, 0]
        } else {
            match unit.pts {
                None => vec![0, 0, 1, unit.stream_id, 0, 0, 0x80, 0, 0],
                Some(pts) => {
                    let mut header = vec![0, 0, 1, unit.stream_id, 0, 0, 0x80, 0x80, 5];
                    header.extend_from_slice(&pts_field(pts));
                    header
                }
            }
        };
        pes.extend_from_slice(unit.payload);
        if pes.len() - 6 <= 65535 {
            pes[4] = ((pes.len() - 6) >> 8) as u8;
            pes[5] = ((pes.len() - 6) & 0xff) as u8;
        }

        let mut at = 0;
        while at < pes.len() {
            let size = 184.min(pes.len() - at);
            let mut packet = vec![0xff; PACKET_SIZE];
            let start = if at == 0 { 0x40 } else { 0x00 };
            let counter = continuity.entry(unit.pid).or_insert(0);
            if size == 184 {
                packet[..4].copy_from_slice(&[
                    0x47,
                    start | (unit.pid >> 8) as u8,
                    (unit.pid & 0xff) as u8,
                    0x10 | *counter,
                ]);
                packet[4..4 + size].copy_from_slice(&pes[at..at + size]);
            } else {
                let adaptation_length = 183 - size;
                packet[..5].copy_from_slice(&[
                    0x47,
                    start | (unit.pid >> 8) as u8,
                    (unit.pid & 0xff) as u8,
                    0x30 | *counter,
                    adaptation_length as u8,
                ]);
                if adaptation_length > 0 {
                    packet[5] = 0;
                }
                let payload = 5 + adaptation_length;
                packet[payload..payload + size].copy_from_slice(&pes[at..at + size]);
            }
            *counter = (*counter + 1) & 15;
            out.extend_from_slice(&packet);
            at += size;
        }
    }
    out
}

/// Synthesise one AAC-LC ADTS frame with a payload of `payload_len` bytes.
///
/// The payload is not valid AAC, which does not matter: nothing here decodes
/// it, and the point of the transcoder's audio path is that it never looks
/// inside.
pub fn adts_frame(sampling_frequency_index: u8, channel_count: u8, payload_len: usize) -> Vec<u8> {
    let frame_length = 7 + payload_len;
    let mut frame = vec![
        0xff,
        0xf1, // MPEG-4, layer 0, protection absent
        (1 << 6) | (sampling_frequency_index << 2) | ((channel_count >> 2) & 1),
        ((channel_count & 3) << 6) | ((frame_length >> 11) & 3) as u8,
        ((frame_length >> 3) & 0xff) as u8,
        (((frame_length & 7) << 5) | 0x1f) as u8,
        0xfc,
    ];
    frame.extend((0..payload_len).map(|i| (i % 251) as u8));
    if channel_count == 2 && payload_len != 0 {
        frame[7] |= 0x20; // Treat synthetic payloads as an opaque CPE.
    }
    frame
}

pub fn adts_frame_with_payload(
    sampling_frequency_index: u8,
    channel_count: u8,
    payload: &[u8],
) -> Vec<u8> {
    let mut frame = adts_frame(sampling_frequency_index, channel_count, payload.len());
    frame[7..].copy_from_slice(payload);
    frame
}

/// A run of identical ADTS frames, as one contiguous elementary stream.
pub fn adts_stream(frames: usize, sampling_frequency_index: u8, channel_count: u8) -> Vec<u8> {
    let mut out = Vec::new();
    for i in 0..frames {
        out.extend_from_slice(&adts_frame(
            sampling_frequency_index,
            channel_count,
            32 + i % 17,
        ));
    }
    out
}

pub const STREAM_TYPE_MPEG2_VIDEO: u8 = 0x02;
pub const STREAM_TYPE_PRIVATE_DATA: u8 = 0x06;
pub const STREAM_TYPE_AAC_ADTS: u8 = 0x0f;
pub const VIDEO_PID: u16 = 0x101;
pub const AUDIO_PID: u16 = 0x102;

/// One sample of a track as the fragments carrying it lay it out.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrackSample {
    pub decode_time: u64,
    pub composition_time: i64,
    pub duration: u32,
    pub sync: bool,
    pub data: Vec<u8>,
}

/// Every sample of both tracks, in the order the fragments carry them.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TrackSamples {
    pub video: Vec<TrackSample>,
    pub audio: Vec<TrackSample>,
}

fn child_boxes(data: &[u8]) -> Vec<([u8; 4], &[u8])> {
    let mut boxes = Vec::new();
    let mut at = 0;
    while at + 8 <= data.len() {
        let size = u32::from_be_bytes(data[at..at + 4].try_into().unwrap()) as usize;
        assert!(
            size >= 8 && at + size <= data.len(),
            "a box fits its parent"
        );
        boxes.push((
            data[at + 4..at + 8].try_into().unwrap(),
            &data[at + 8..at + size],
        ));
        at += size;
    }
    boxes
}

fn be32(data: &[u8], at: usize) -> u32 {
    u32::from_be_bytes(data[at..at + 4].try_into().unwrap())
}

/// The samples of every `traf` in one media fragment, as `(track id, samples)`,
/// read back out of the `moof` and `mdat` the muxer wrote.
pub fn fragment_samples(media: &[u8]) -> Vec<(u32, Vec<TrackSample>)> {
    let top = child_boxes(media);
    let moof = top
        .iter()
        .find(|(kind, _)| kind == b"moof")
        .expect("a fragment opens with a moof")
        .1;
    let mut tracks = Vec::new();
    for (kind, traf) in child_boxes(moof) {
        if &kind != b"traf" {
            continue;
        }
        let mut track = 0;
        let mut decode_time = 0;
        let mut samples = Vec::new();
        for (kind, body) in child_boxes(traf) {
            match &kind {
                b"tfhd" => track = be32(body, 4),
                b"tfdt" => {
                    assert_eq!(body[0], 1, "a version 1 tfdt");
                    decode_time = u64::from_be_bytes(body[4..12].try_into().unwrap());
                }
                b"trun" => {
                    let version = body[0];
                    let flags = be32(body, 0) & 0x00ff_ffff;
                    let count = be32(body, 4) as usize;
                    assert_ne!(flags & 0x1, 0, "a data offset");
                    // Relative to the start of the moof, which is the start of
                    // the fragment.
                    let mut data_at = be32(body, 8) as usize;
                    let mut at = 12;
                    for _ in 0..count {
                        let mut field = |bit: u32| {
                            (flags & bit != 0).then(|| {
                                let value = be32(body, at);
                                at += 4;
                                value
                            })
                        };
                        let duration = field(0x100).expect("a duration per sample");
                        let size = field(0x200).expect("a size per sample") as usize;
                        let sample_flags = field(0x400);
                        let offset = field(0x800).unwrap_or(0);
                        let composition = if version == 1 {
                            i64::from(offset as i32)
                        } else {
                            i64::from(offset)
                        };
                        samples.push(TrackSample {
                            decode_time,
                            composition_time: decode_time as i64 + composition,
                            duration,
                            // Bit 16 is sample_is_non_sync_sample.
                            sync: sample_flags.is_none_or(|flags| flags & 0x0001_0000 == 0),
                            data: media[data_at..data_at + size].to_vec(),
                        });
                        decode_time += u64::from(duration);
                        data_at += size;
                    }
                }
                _ => {}
            }
        }
        tracks.push((track, samples));
    }
    tracks
}

/// Every sample the media fragments carry, per track: video is track 1 and
/// audio track 2, as the initialization segment numbers them.
pub fn track_samples(fragments: &[Fragment]) -> TrackSamples {
    let mut out = TrackSamples::default();
    for fragment in fragments {
        let Fragment::Media { data, .. } = fragment else {
            continue;
        };
        for (track, samples) in fragment_samples(data) {
            match track {
                1 => out.video.extend(samples),
                2 => out.audio.extend(samples),
                other => panic!("unexpected track {other}"),
            }
        }
    }
    out
}

/// The initialization segments, in the order they went out.
pub fn init_segments(fragments: &[Fragment]) -> Vec<&[u8]> {
    fragments
        .iter()
        .filter_map(|fragment| match fragment {
            Fragment::Init { data, .. } => Some(data.as_slice()),
            _ => None,
        })
        .collect()
}

/// Where each picture's start code is in an elementary stream.
pub fn picture_starts(es: &[u8]) -> Vec<usize> {
    (0..es.len().saturating_sub(3))
        .filter(|&at| es[at..at + 4] == [0, 0, 1, 0x00])
        .collect()
}

/// A `quant_matrix_extension` loading `weights` as the non-intra matrix, which
/// is legal anywhere between a picture's coding extension and its first slice.
///
/// Clause 6.2.3.2: the four-bit identifier, then a flag per matrix with the
/// sixty-four weights of each one that is loaded.
pub fn non_intra_matrix_extension(weights: &[u8; 64]) -> Vec<u8> {
    // 0011, then load_intra_quantiser_matrix and load_non_intra_quantiser_matrix.
    let mut bits: Vec<u8> = vec![0, 0, 1, 1, 0, 1];
    for weight in weights {
        bits.extend((0..8).map(|shift| (weight >> (7 - shift)) & 1));
    }
    bits.extend([0, 0]);
    let mut out = vec![0x00, 0x00, 0x01, 0xb5];
    out.extend(bits.chunks(8).map(|byte| {
        byte.iter()
            .enumerate()
            .fold(0u8, |packed, (at, bit)| packed | (bit << (7 - at)))
    }));
    out
}

/// `source` with `extension` put in front of the first slice of each of the
/// listed pictures, counting from zero.
pub fn with_extension_in_pictures(source: &[u8], pictures: &[usize], extension: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(source.len() + pictures.len() * extension.len());
    let mut current = None;
    let mut waiting = false;
    let mut at = 0;
    while at < source.len() {
        if at + 4 <= source.len() && source[at..at + 3] == [0, 0, 1] {
            let code = source[at + 3];
            if code == 0x00 {
                current = Some(current.map_or(0, |index| index + 1));
                waiting = current.is_some_and(|index| pictures.contains(&index));
            } else if waiting && (0x01..=0xaf).contains(&code) {
                out.extend_from_slice(extension);
                waiting = false;
            }
            out.extend_from_slice(&source[at..at + 4]);
            at += 4;
            continue;
        }
        out.push(source[at]);
        at += 1;
    }
    out
}

/// Video PES, one per `(payload, pts, duration)`, each followed by the 48 kHz
/// AAC access units covering its span: the form with sound of a video-only
/// scenario, with its holes and joins in both tracks.
pub fn mux_with_sound(groups: &[(&[u8], u64, u64)]) -> Vec<u8> {
    const AAC_TICKS: u64 = 1024 * 90_000 / 48_000;
    let frame = adts_stream(1, 3, 2);
    let blocks: Vec<Vec<u8>> = groups
        .iter()
        .map(|&(_, _, duration)| frame.repeat(duration.div_ceil(AAC_TICKS) as usize))
        .collect();
    let mut units = Vec::new();
    for (&(payload, pts, _), block) in groups.iter().zip(&blocks) {
        units.push(PesUnit {
            pid: VIDEO_PID,
            stream_id: 0xe0,
            payload,
            pts: Some(pts),
        });
        units.push(PesUnit {
            pid: AUDIO_PID,
            stream_id: 0xc0,
            payload: block,
            pts: Some(pts),
        });
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

/// The passthrough options whose MP4 decode mode has to agree with: groups
/// cut into anchor units, and a field pair in one sample, as it is one
/// picture to decode.
pub fn passthrough_like_decode(options: TranscodeOptions) -> TranscodeOptions {
    TranscodeOptions {
        video: VideoMode::Passthrough,
        split_groups: true,
        split_field_samples: false,
        ..options
    }
}

pub fn decoding(options: TranscodeOptions) -> TranscodeOptions {
    TranscodeOptions {
        video: VideoMode::Decode,
        ..options
    }
}

/// The handler type of a `trak`.
fn track_handler(trak: &[u8]) -> [u8; 4] {
    let mdia = child_boxes(trak)
        .into_iter()
        .find(|(kind, _)| kind == b"mdia")
        .expect("a trak has an mdia")
        .1;
    let hdlr = child_boxes(mdia)
        .into_iter()
        .find(|(kind, _)| kind == b"hdlr")
        .expect("an mdia has an hdlr")
        .1;
    hdlr[8..12].try_into().unwrap()
}

/// The `trak` boxes of an initialization segment.
fn init_tracks(init: &[u8]) -> Vec<&[u8]> {
    let top = child_boxes(init);
    assert_eq!(
        top[0].0, *b"ftyp",
        "an initialization segment opens with ftyp"
    );
    let moov = top
        .iter()
        .find(|(kind, _)| kind == b"moov")
        .expect("an initialization segment has a moov")
        .1;
    child_boxes(moov)
        .into_iter()
        .filter(|(kind, _)| kind == b"trak")
        .map(|(_, body)| body)
        .collect()
}

/// Decode mode is the passthrough timeline without the video muxed: the same
/// sound sample for sample, a picture for every video sample at its time and
/// for its duration, and units that name pictures their bytes hold.
pub fn assert_decode_matches_passthrough(label: &str, decoded: &[Fragment], muxed: &[Fragment]) {
    let sound_tracks = |fragments: &[Fragment]| -> Vec<Vec<u8>> {
        init_segments(fragments)
            .into_iter()
            .map(|init| {
                init_tracks(init)
                    .into_iter()
                    .find(|trak| &track_handler(trak) == b"soun")
                    .expect("the segment describes the sound")
                    .to_vec()
            })
            .collect()
    };
    for fragment in decoded {
        if let Fragment::Init {
            data, mime_codec, ..
        } = fragment
        {
            assert_eq!(mime_codec, "audio/mp4; codecs=\"mp4a.40.2\"", "{label}");
            let tracks = init_tracks(data);
            assert_eq!(tracks.len(), 1, "{label}: one track");
            assert_eq!(&track_handler(tracks[0]), b"soun", "{label}: sound only");
        }
    }
    assert_eq!(
        sound_tracks(decoded),
        sound_tracks(muxed),
        "{label}: the sound is described as the passthrough MP4 describes it"
    );
    let sizes = |fragments: &[Fragment]| -> Vec<(u32, u32)> {
        fragments
            .iter()
            .filter_map(|fragment| match fragment {
                Fragment::Init { width, height, .. } => Some((*width, *height)),
                _ => None,
            })
            .collect()
    };
    assert_eq!(sizes(decoded), sizes(muxed), "{label}: coded sizes");

    let mut media = Vec::new();
    let mut units = Vec::new();
    for fragment in decoded {
        match fragment {
            Fragment::Media {
                data,
                start,
                random_access,
                restart_offset,
                video_samples,
                audio_samples,
                scans,
            } => {
                assert_eq!(*video_samples, 0, "{label}: no video in the MP4");
                assert!(*random_access, "{label}: every sound fragment is a start");
                assert!(scans.is_empty(), "{label}: no scans without video");
                let tracks = fragment_samples(data);
                assert_eq!(tracks.len(), 1, "{label}: one traf");
                assert_eq!(tracks[0].0, 2, "{label}: the sound's track");
                assert_eq!(tracks[0].1.len(), *audio_samples, "{label}: sample count");
                assert!(*audio_samples > 0, "{label}: no fragment without sound");
                media.push((*start, *restart_offset));
            }
            Fragment::Video {
                data,
                start,
                restart,
                intra,
                pictures,
            } => {
                let parsed = parse_elementary_stream(data).expect("a unit parses");
                assert!(!pictures.is_empty(), "{label}: a unit has pictures");
                assert_eq!(
                    *intra,
                    parsed[pictures[0].picture].header.picture_coding_type == PictureType::I,
                    "{label}: intra"
                );
                if *restart {
                    assert!(*intra, "{label}: a restart opens with an intra picture");
                }
                for picture in pictures {
                    let first = &parsed[picture.picture];
                    match picture.second_field {
                        Some(second) => {
                            assert_eq!(second, picture.picture + 1, "{label}");
                            assert_ne!(
                                first.coding.picture_structure,
                                PictureStructure::Frame,
                                "{label}: a pair is two fields"
                            );
                            assert_ne!(
                                parsed[second].coding.picture_structure,
                                first.coding.picture_structure,
                                "{label}: of opposite parity"
                            );
                        }
                        None => assert_eq!(
                            first.coding.picture_structure,
                            PictureStructure::Frame,
                            "{label}: a lone picture is a frame"
                        ),
                    }
                }
                units.push((*start, *restart, pictures.clone()));
            }
            _ => {}
        }
    }
    let muxed_media: Vec<(f64, Option<u64>)> = muxed
        .iter()
        .filter_map(|fragment| match fragment {
            Fragment::Media {
                start,
                restart_offset,
                audio_samples,
                ..
            } if *audio_samples > 0 => Some((*start, *restart_offset)),
            _ => None,
        })
        .collect();
    assert_eq!(media, muxed_media, "{label}: sound fragment starts");
    let muxed_units: Vec<f64> = muxed
        .iter()
        .filter_map(|fragment| match fragment {
            Fragment::Media {
                start,
                video_samples,
                ..
            } if *video_samples > 0 => Some(*start),
            _ => None,
        })
        .collect();
    let unit_starts: Vec<f64> = units.iter().map(|unit| unit.0).collect();
    assert_eq!(unit_starts, muxed_units, "{label}: unit starts");
    assert!(
        units.first().is_some_and(|unit| unit.1),
        "{label}: the first unit restarts"
    );

    let (decoded_samples, muxed_samples) = (track_samples(decoded), track_samples(muxed));
    assert!(
        decoded_samples.video.is_empty(),
        "{label}: no video samples"
    );
    assert!(
        !muxed_samples.audio.is_empty(),
        "{label}: the stream has sound"
    );
    assert!(
        decoded_samples.audio == muxed_samples.audio,
        "{label}: the sound samples differ"
    );
    let pictures: Vec<(f64, f64)> = units
        .iter()
        .flat_map(|unit| {
            unit.2
                .iter()
                .map(|picture| (picture.time, picture.duration))
        })
        .collect();
    let samples: Vec<(f64, f64)> = muxed_samples
        .video
        .iter()
        .map(|sample| {
            (
                sample.composition_time as f64 / 90_000.0,
                f64::from(sample.duration) / 90_000.0,
            )
        })
        .collect();
    assert!(!pictures.is_empty(), "{label}: the stream made pictures");
    assert_eq!(pictures, samples, "{label}: picture times and durations");
}

/// Everything a session handed out, flattened so two runs can be compared.
pub fn fragments_digest(fragments: &[Fragment]) -> Vec<String> {
    fragments
        .iter()
        .map(|fragment| match fragment {
            Fragment::Init {
                data,
                mime_codec,
                width,
                height,
            } => format!("init {mime_codec} {width}x{height} {:x}", fnv1a(data)),
            Fragment::Media {
                data,
                start,
                random_access,
                restart_offset,
                video_samples,
                audio_samples,
                scans,
            } => format!(
                "media {start} {random_access} {restart_offset:?} {video_samples} \
                 {audio_samples} {scans:?} {:x}",
                fnv1a(data)
            ),
            Fragment::Video {
                data,
                start,
                restart,
                intra,
                pictures,
            } => format!(
                "video {start} {restart} {intra} {pictures:?} {:x}",
                fnv1a(data)
            ),
            Fragment::PrivateStream {
                stream_id,
                pid,
                data,
                pts,
            } => format!("private {stream_id} {pid} {pts:?} {:x}", fnv1a(data)),
        })
        .collect()
}
