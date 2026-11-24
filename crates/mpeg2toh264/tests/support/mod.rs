//! Shared helpers for the integration tests.
//!
//! Each test binary compiles the whole module, so not every helper is used by
//! every one of them.
#![allow(dead_code)]

use std::collections::HashMap;
use std::path::PathBuf;

use mpeg2toh264::audio::{downmix, parse_block, AacDecoder, ParsedBlock, PcmFrame};
use mpeg2toh264::mpeg2::constants::{PictureStructure, PictureType};
use mpeg2toh264::mpeg2::headers::parse_elementary_stream;
use mpeg2toh264::{Fragment, SessionOptions, VideoMode};

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

/// The stream with the five timestamp bytes of the `nth` PES that begins on
/// `pid` moved by `delta` ticks, and nothing else touched: the packet carries no
/// error indicator and the continuity counters run on, which is what damage the
/// transport does not notice looks like.
pub fn with_pts_shifted(stream: &[u8], pid: u16, nth: usize, delta: i64) -> Vec<u8> {
    let mut out = stream.to_vec();
    let mut seen = 0;
    for packet in out.chunks_mut(PACKET_SIZE) {
        let this = u16::from(packet[1] & 0x1f) << 8 | u16::from(packet[2]);
        if this != pid || packet[1] & 0x40 == 0 {
            continue;
        }
        if seen == nth {
            let payload = if packet[3] & 0x20 != 0 {
                5 + packet[4] as usize
            } else {
                4
            };
            assert_eq!(packet[payload..payload + 3], [0, 0, 1], "a PES header");
            let field = payload + 9;
            let bytes = &packet[field..field + 5];
            let pts = u64::from(bytes[0] >> 1 & 0x07) << 30
                | u64::from(bytes[1]) << 22
                | u64::from(bytes[2] >> 1) << 15
                | u64::from(bytes[3]) << 7
                | u64::from(bytes[4] >> 1);
            let shifted = (pts as i64 + delta).rem_euclid(1 << 33) as u64;
            packet[field..field + 5].copy_from_slice(&pts_field(shifted));
            return out;
        }
        seen += 1;
    }
    panic!("no PES number {nth} on PID {pid:#x}");
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

/// Synthesise one AAC-LC ADTS frame whose raw_data_block is `payload_len`
/// bytes long.
///
/// The block is one a decoder reads, as the stream reader hands on nothing
/// else: the channel elements `channel_count` names (ISO/IEC 14496-3 Table
/// 1.19; zero gets one single channel element), each an empty channel stream,
/// then fill elements whose bytes count up from zero to make up the length,
/// then `ID_END`. Frames of different lengths therefore differ in content too.
pub fn adts_frame(sampling_frequency_index: u8, channel_count: u8, payload_len: usize) -> Vec<u8> {
    adts_frame_filled(
        sampling_frequency_index,
        channel_count,
        payload_len,
        false,
        |at| (at % 251) as u8,
    )
}

/// [`adts_frame`] with the `adts_error_check` CRC a broadcast frame carries.
pub fn adts_frame_protected(
    sampling_frequency_index: u8,
    channel_count: u8,
    payload_len: usize,
) -> Vec<u8> {
    adts_frame_filled(
        sampling_frequency_index,
        channel_count,
        payload_len,
        true,
        |at| (at % 251) as u8,
    )
}

/// [`adts_frame`] with `fill` giving each byte of the fill elements, by its
/// position among them, and with a CRC when `protected`.
pub fn adts_frame_filled(
    sampling_frequency_index: u8,
    channel_count: u8,
    payload_len: usize,
    protected: bool,
    fill: impl Fn(usize) -> u8,
) -> Vec<u8> {
    let block = SilentBlock::new(channel_count, payload_len, fill);
    let mut frame = adts_header(
        sampling_frequency_index,
        channel_count,
        payload_len,
        protected,
    );
    frame.extend_from_slice(&block.bytes);
    if protected {
        let crc = block.crc(&frame);
        frame[7..9].copy_from_slice(&crc.to_be_bytes());
    }
    frame
}

/// An ADTS header for a frame of `payload_len` bytes of raw_data_block, with
/// room for a CRC of zero when `protected`.
pub fn adts_header(
    sampling_frequency_index: u8,
    channel_count: u8,
    payload_len: usize,
    protected: bool,
) -> Vec<u8> {
    let header_length = if protected { 9 } else { 7 };
    let frame_length = header_length + payload_len;
    let mut header = vec![
        0xff,
        if protected { 0xf0 } else { 0xf1 }, // MPEG-4, layer 0, protection_absent
        (1 << 6) | (sampling_frequency_index << 2) | ((channel_count >> 2) & 1),
        ((channel_count & 3) << 6) | ((frame_length >> 11) & 3) as u8,
        ((frame_length >> 3) & 0xff) as u8,
        (((frame_length & 7) << 5) | 0x1f) as u8,
        0xfc,
    ];
    header.resize(header_length, 0);
    header
}

/// The raw_data_block [`adts_frame`] carries, and the spans of it the ADTS CRC
/// protects: `(from, limit, count)` -- `count` bits from `from`, those at or
/// past `limit` counted as zeros.
struct SilentBlock {
    bytes: Vec<u8>,
    protected: Vec<(usize, usize, usize)>,
}

impl SilentBlock {
    fn new(channel_count: u8, payload_len: usize, fill: impl Fn(usize) -> u8) -> Self {
        const SCE: u8 = 0;
        const CPE: u8 = 1;
        const LFE: u8 = 3;
        let layout: &[(u8, u8)] = match channel_count {
            0 | 1 => &[(SCE, 0)],
            2 => &[(CPE, 0)],
            3 => &[(SCE, 0), (CPE, 0)],
            4 => &[(SCE, 0), (CPE, 0), (SCE, 1)],
            5 => &[(SCE, 0), (CPE, 0), (CPE, 1)],
            6 => &[(SCE, 0), (CPE, 0), (CPE, 1), (LFE, 0)],
            _ => &[(SCE, 0), (CPE, 0), (CPE, 1), (CPE, 2), (LFE, 0)],
        };
        // global_gain, an ics_info of a long window with max_sfb 0, and the
        // three absent-tool flags: no spectral data at all.
        const EMPTY_ICS: usize = 22;
        let mut bits = BitWriter::default();
        let mut protected = Vec::new();
        for &(id, tag) in layout {
            let start = bits.len;
            bits.put(3, id as u32);
            bits.put(4, tag as u32);
            if id == CPE {
                bits.put(1, 0); // common_window
                bits.put(EMPTY_ICS, 0);
                let second = bits.len;
                bits.put(EMPTY_ICS, 0);
                protected.push((start + 3, bits.len, 192));
                protected.push((second, bits.len, 128));
            } else {
                bits.put(EMPTY_ICS, 0);
                protected.push((start + 3, bits.len, 192));
            }
        }
        // Fill elements up to the length asked for, leaving ID_END and fewer
        // than eight bits of alignment. One element carries at most 269 bytes.
        // Where there is room, empty ones first put the bytes of the next on
        // byte boundaries, so that they can be found in the frame as bytes: a
        // fill element's header is seven bits, or fifteen with an escape.
        let lead = (bits.len + 7) % 8;
        if payload_len * 8 >= bits.len + 7 * lead + 7 + 8 + 3 {
            for _ in 0..lead {
                bits.put(3, 6); // ID_FIL
                bits.put(4, 0);
            }
        }
        let mut filled = 0;
        loop {
            let room = (payload_len * 8)
                .checked_sub(bits.len + 3)
                .unwrap_or_else(|| {
                    panic!(
                        "{payload_len} bytes cannot hold the channel elements of {channel_count}"
                    )
                });
            if room < 7 {
                break;
            }
            let count = if room < 7 + 8 * 15 {
                (room - 7) / 8
            } else {
                ((room - 15) / 8).min(269)
            };
            bits.put(3, 6); // ID_FIL
            if count < 15 {
                bits.put(4, count as u32);
            } else {
                bits.put(4, 15);
                bits.put(8, (count - 14) as u32);
            }
            for _ in 0..count {
                bits.put(8, fill(filled) as u32);
                filled += 1;
            }
        }
        bits.put(3, 7); // ID_END
        assert_eq!(
            bits.len.div_ceil(8),
            payload_len,
            "{payload_len} bytes cannot be filled exactly"
        );
        Self {
            bytes: bits.bytes,
            protected,
        }
    }

    /// The CRC of a frame carrying this block, written independently of the
    /// reader's: CRC-16 0x8005 from all ones over the header's first 56 bits
    /// and then the protected spans.
    fn crc(&self, frame: &[u8]) -> u16 {
        let bit = |data: &[u8], at: usize| (data[at / 8] >> (7 - at % 8)) & 1;
        let mut crc = 0xffffu16;
        let mut feed = |input: u8| {
            let top = (crc >> 15) as u8 ^ input;
            crc <<= 1;
            if top != 0 {
                crc ^= 0x8005;
            }
        };
        for at in 0..56 {
            feed(bit(frame, at));
        }
        for &(from, limit, count) in &self.protected {
            for at in from..from + count {
                feed(if at < limit { bit(&self.bytes, at) } else { 0 });
            }
        }
        crc
    }
}

#[derive(Default)]
struct BitWriter {
    bytes: Vec<u8>,
    len: usize,
}

impl BitWriter {
    fn put(&mut self, count: usize, value: u32) {
        for shift in (0..count).rev() {
            if self.len % 8 == 0 {
                self.bytes.push(0);
            }
            if (value >> shift) & 1 != 0 {
                *self.bytes.last_mut().expect("a byte was pushed") |= 0x80 >> (self.len % 8);
            }
            self.len += 1;
        }
    }
}

pub fn adts_frame_with_payload(
    sampling_frequency_index: u8,
    channel_count: u8,
    payload: &[u8],
) -> Vec<u8> {
    let mut frame = adts_header(
        sampling_frequency_index,
        channel_count,
        payload.len(),
        false,
    );
    frame.extend_from_slice(payload);
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

/// The options of a session that carries the MPEG-2 into the MP4 as it stands.
pub fn passthrough() -> SessionOptions {
    SessionOptions::new(VideoMode::Passthrough)
}

/// The options of a session that hands the MPEG-2 out for the caller to decode.
pub fn decode() -> SessionOptions {
    SessionOptions::new(VideoMode::Decode)
}

/// The passthrough options whose MP4 decode mode has to agree with: groups
/// cut into anchor units, and a field pair in one sample, as it is one
/// picture to decode.
pub fn passthrough_like_decode(options: SessionOptions) -> SessionOptions {
    SessionOptions {
        video: VideoMode::Passthrough,
        split_groups: true,
        split_field_samples: false,
        ..options
    }
}

pub fn decoding(options: SessionOptions) -> SessionOptions {
    SessionOptions {
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

/// The `AudioSpecificConfig` and timescale of the sound track an
/// initialization segment describes, read out of its `mdhd` and `esds`.
fn sound_description(init: &[u8]) -> (Vec<u8>, u32) {
    let trak = init_tracks(init)
        .into_iter()
        .find(|trak| &track_handler(trak) == b"soun")
        .expect("the segment describes the sound");
    let child = |body: &[u8], kind: &[u8; 4], skip: usize| -> Vec<u8> {
        child_boxes(&body[skip..])
            .into_iter()
            .find(|(found, _)| found == kind)
            .unwrap_or_else(|| panic!("no {}", String::from_utf8_lossy(kind)))
            .1
            .to_vec()
    };
    let mdia = child(trak, b"mdia", 0);
    let mdhd = child(&mdia, b"mdhd", 0);
    assert_eq!(mdhd[0], 0, "a version 0 mdhd");
    let timescale = be32(&mdhd, 12);
    let stbl = child(&child(&mdia, b"minf", 0), b"stbl", 0);
    // stsd: version, flags and entry_count; mp4a: the 28 bytes of an audio
    // sample entry; esds: version and flags.
    let esds = child(&child(&child(&stbl, b"stsd", 0), b"mp4a", 8), b"esds", 28);
    // ES_Descriptor, DecoderConfigDescriptor, DecoderSpecificInfo, each a tag
    // and an expandable size (ISO/IEC 14496-1 8.3.3).
    let mut at = 4;
    let descriptor = |at: &mut usize, tag: u8| -> usize {
        assert_eq!(esds[*at], tag, "descriptor {tag:#x}");
        *at += 1;
        let mut size = 0;
        loop {
            let byte = esds[*at];
            *at += 1;
            size = (size << 7) | usize::from(byte & 0x7f);
            if byte & 0x80 == 0 {
                break size;
            }
        }
    };
    descriptor(&mut at, 0x03);
    let flags = esds[at + 2];
    assert_eq!(flags, 0, "no stream dependence, URL or OCR stream");
    at += 3;
    descriptor(&mut at, 0x04);
    at += 13;
    let size = descriptor(&mut at, 0x05);
    (esds[at..at + size].to_vec(), timescale)
}

/// The sound of one fragment of a passthrough session's output, decoded.
pub struct MuxedSound {
    /// The decode time of the fragment's first access unit, in `timescale`.
    pub decode_time: u64,
    pub timescale: u32,
    pub frames: usize,
    pub left: Vec<f32>,
    pub right: Vec<f32>,
}

/// The sound a passthrough session muxed, fragment by fragment, decoded from
/// the MP4 alone: each access unit with one [`AacDecoder`] across the whole
/// stream, told the AudioSpecificConfig of the initialization segment in
/// front of it, concealed where it does not decode, and mixed to stereo.
pub fn decode_muxed_sound(muxed: &[Fragment]) -> Vec<MuxedSound> {
    let mut decoder = AacDecoder::new();
    let mut block = ParsedBlock::new();
    let mut pcm = PcmFrame::new();
    let mut description = None;
    let mut configured = Vec::new();
    let mut out = Vec::new();
    for fragment in muxed {
        match fragment {
            Fragment::Init { data, .. } => description = Some(sound_description(data)),
            Fragment::Media { data, .. } => {
                let Some((_, samples)) = fragment_samples(data)
                    .into_iter()
                    .find(|(track, _)| *track == 2)
                else {
                    continue;
                };
                let (asc, timescale) = description.clone().expect("described before");
                if asc != configured {
                    decoder
                        .configure(&asc)
                        .expect("a configuration the decoder takes");
                    configured = asc.clone();
                }
                let frequency_index = ((asc[0] & 7) << 1) | (asc[1] >> 7);
                let channel_configuration = (asc[1] >> 3) & 0x0f;
                let mut left = vec![0.0; samples.len() * 1024];
                let mut right = vec![0.0; samples.len() * 1024];
                for (index, sample) in samples.iter().enumerate() {
                    let decoded = parse_block(&sample.data, frequency_index, &mut block)
                        && decoder
                            .decode(&block, channel_configuration, frequency_index, &mut pcm)
                            .is_ok();
                    if !decoded {
                        decoder.conceal(&mut pcm);
                    }
                    let span = index * 1024..(index + 1) * 1024;
                    downmix::to_stereo(&pcm, false, 1.0, &mut left[span.clone()], &mut right[span]);
                }
                out.push(MuxedSound {
                    decode_time: samples[0].decode_time,
                    timescale,
                    frames: samples.len(),
                    left,
                    right,
                });
            }
            _ => {}
        }
    }
    out
}

/// One access unit of a session's sound: where the audio track puts it, in
/// samples at `rate`, and its stereo PCM.
#[derive(Clone, Debug, PartialEq)]
pub struct SoundFrame {
    pub time: u64,
    pub rate: u32,
    pub left: Vec<f32>,
    pub right: Vec<f32>,
}

/// Every access unit of a session's sound, in order: decode mode's out of its
/// `Sound` fragments, passthrough's decoded out of its MP4 by
/// [`decode_muxed_sound`].
pub fn sound_frames(fragments: &[Fragment]) -> Vec<SoundFrame> {
    let mut out = Vec::new();
    let mut decoded = false;
    for fragment in fragments {
        if let Fragment::Sound {
            start,
            sample_rate,
            left,
            right,
            dual_mono,
        } = fragment
        {
            decoded = true;
            // The main service, as it is heard when chosen: on both sides,
            // which is what passthrough's rebuilt frames carry.
            let right = if *dual_mono { left } else { right };
            let first = (start * f64::from(*sample_rate)).round() as u64;
            for (index, (left, right)) in left.chunks(1024).zip(right.chunks(1024)).enumerate() {
                out.push(SoundFrame {
                    time: first + index as u64 * 1024,
                    rate: *sample_rate,
                    left: left.to_vec(),
                    right: right.to_vec(),
                });
            }
        }
    }
    if decoded {
        return out;
    }
    for sound in decode_muxed_sound(fragments) {
        for (index, (left, right)) in sound
            .left
            .chunks(1024)
            .zip(sound.right.chunks(1024))
            .enumerate()
        {
            out.push(SoundFrame {
                time: sound.decode_time + index as u64 * 1024,
                rate: sound.timescale,
                left: left.to_vec(),
                right: right.to_vec(),
            });
        }
    }
    out
}

/// One `Sound` fragment.
pub struct SoundRun<'a> {
    pub start: f64,
    pub sample_rate: u32,
    pub left: &'a [f32],
    pub right: &'a [f32],
}

/// The `Sound` fragments of a decode-mode session's output, grouped by the
/// `Media` fragment that follows them, which has to be the next fragment that
/// is not sound; and that fragment's `audio_samples`.
pub fn sound_by_unit(decoded: &[Fragment]) -> Vec<(Vec<SoundRun<'_>>, usize)> {
    let mut out = Vec::new();
    let mut runs = Vec::new();
    for fragment in decoded {
        match fragment {
            Fragment::Sound {
                start,
                sample_rate,
                left,
                right,
                dual_mono,
            } => {
                assert_eq!(left.len(), right.len(), "as many samples on each side");
                // The main service heard on both sides, as passthrough muxes it.
                let right = if *dual_mono { left } else { right };
                assert!(!left.is_empty(), "a run of sound holds some");
                assert_eq!(left.len() % 1024, 0, "whole access units");
                runs.push(SoundRun {
                    start: *start,
                    sample_rate: *sample_rate,
                    left,
                    right,
                });
            }
            Fragment::Media { audio_samples, .. } => {
                out.push((std::mem::take(&mut runs), *audio_samples));
            }
            _ => assert!(runs.is_empty(), "sound goes out in front of its media"),
        }
    }
    assert!(runs.is_empty(), "sound goes out in front of its media");
    out
}

/// Decode mode's sound is what passthrough muxed, decoded: per unit the same
/// access units, at the decode time the audio track gives the first of them,
/// following on from the unit before wherever the track does, and the PCM a
/// decoder makes of them.
pub fn assert_sound_is_muxed_sound_decoded(label: &str, decoded: &[Fragment], muxed: &[Fragment]) {
    let units = sound_by_unit(decoded);
    let expected = decode_muxed_sound(muxed);
    assert!(!expected.is_empty(), "{label}: the stream has sound");
    assert_eq!(units.len(), expected.len(), "{label}: units with sound");
    let mut previous: Option<(&SoundRun<'_>, &MuxedSound)> = None;
    for ((runs, audio_samples), want) in units.iter().zip(&expected) {
        assert!(
            !runs.is_empty(),
            "{label}: a unit with sound has a run of it"
        );
        let frames: usize = runs.iter().map(|run| run.left.len() / 1024).sum();
        assert_eq!(frames, *audio_samples, "{label}: audio_samples counts it");
        assert_eq!(frames, want.frames, "{label}: the muxed access units");
        let mut offset = 0;
        for run in runs {
            assert_eq!(run.sample_rate, want.timescale, "{label}: sample rate");
            let rate = f64::from(run.sample_rate);
            let first = want.decode_time + offset as u64;
            assert!(
                (run.start * rate - first as f64).abs() < 1e-6,
                "{label}: sound at {} s, where the track has it at {first}/{rate}",
                run.start
            );
            let span = offset..offset + run.left.len();
            assert!(
                run.left == &want.left[span.clone()] && run.right == &want.right[span],
                "{label}: the PCM at {} s is not the muxed sound decoded",
                run.start
            );
            offset += run.left.len();
        }
        if let Some((before, muxed_before)) = previous {
            let follows = muxed_before.timescale == want.timescale
                && muxed_before.decode_time + muxed_before.frames as u64 * 1024 == want.decode_time;
            if follows {
                let rate = f64::from(before.sample_rate);
                let end = before.start + before.left.len() as f64 / rate;
                assert!(
                    (runs[0].start - end).abs() <= 0.5 / rate,
                    "{label}: sound at {} s does not follow on from {end} s",
                    runs[0].start
                );
            }
        }
        previous = Some((runs.last().expect("checked above"), want));
    }
}

/// Decode mode is the passthrough timeline without anything muxed: the same
/// sound decoded to PCM, a picture for every video sample at its time and for
/// its duration, and units that name pictures their bytes hold.
pub fn assert_decode_matches_passthrough(label: &str, decoded: &[Fragment], muxed: &[Fragment]) {
    for fragment in decoded {
        if let Fragment::Init {
            data, mime_codec, ..
        } = fragment
        {
            assert!(data.is_empty(), "{label}: no segment");
            assert!(mime_codec.is_empty(), "{label}: nothing to open");
        }
    }
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
                assert!(*random_access, "{label}: every fragment is a start");
                assert!(scans.is_empty(), "{label}: no scans without video");
                assert!(data.is_empty(), "{label}: nothing muxed");
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

    assert_sound_is_muxed_sound_decoded(label, decoded, muxed);
    let muxed_samples = track_samples(muxed);
    let pictures: Vec<(f64, f64)> = units
        .iter()
        .flat_map(|unit| {
            unit.2
                .iter()
                .map(|picture| (picture.time, picture.duration))
        })
        .collect();
    // A sample is shown for its duration, except the first of a fragment that
    // opens a group after pictures were lost: it takes up the lead the decode
    // clock was left behind by, and is decoded for longer than it is shown,
    // until the next sample in presentation order.
    let opening: Vec<bool> = muxed
        .iter()
        .filter_map(|fragment| match fragment {
            Fragment::Media { data, .. } => Some(fragment_samples(data)),
            _ => None,
        })
        .flatten()
        .filter(|(track, _)| *track == 1)
        .flat_map(|(_, samples)| (0..samples.len()).map(|index| index == 0))
        .collect();
    assert_eq!(opening.len(), muxed_samples.video.len());
    let mut shown: Vec<i64> = muxed_samples
        .video
        .iter()
        .map(|sample| sample.composition_time)
        .collect();
    shown.sort_unstable();
    let samples: Vec<(f64, f64)> = muxed_samples
        .video
        .iter()
        .zip(&opening)
        .map(|(sample, &opening)| {
            let end = sample.composition_time + i64::from(sample.duration);
            let next = shown.partition_point(|&time| time <= sample.composition_time);
            let until = match shown.get(next) {
                Some(&next) if opening => next.min(end),
                _ => end,
            };
            (
                sample.composition_time as f64 / 90_000.0,
                (until - sample.composition_time) as f64 / 90_000.0,
            )
        })
        .collect();
    assert!(!pictures.is_empty(), "{label}: the stream made pictures");
    // A player shows the pictures one after another, so none may start before
    // the one ahead of it has ended.
    let mut shown_order = pictures.clone();
    shown_order.sort_by(|a, b| a.0.total_cmp(&b.0));
    for pair in shown_order.windows(2) {
        assert!(
            pair[1].0 >= pair[0].0 + pair[0].1 - 1e-9,
            "{label}: a picture at {} s starts before the one at {} s has ended",
            pair[1].0,
            pair[0].0
        );
    }
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
            Fragment::Sound {
                start,
                sample_rate,
                left,
                right,
                dual_mono,
            } => {
                let bytes: Vec<u8> = left
                    .iter()
                    .chain(right)
                    .flat_map(|sample| sample.to_le_bytes())
                    .collect();
                format!(
                    "sound {start} {sample_rate} {dual_mono} {} {:x}",
                    left.len(),
                    fnv1a(&bytes)
                )
            }
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
