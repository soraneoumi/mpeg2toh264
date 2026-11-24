//! The decoder's tools on hand-built blocks, with the values ISO/IEC 14496-3
//! says each should give worked out from its formulas.

use super::decoder::element_spectra;
use super::downmix::to_stereo;
use super::spectrum::Noise;
use super::*;
use crate::container::aac::tests::Bits;
use crate::container::aac::walk_block;
use crate::container::aac_huffman::*;
use std::f64::consts::PI;

/// 48 kHz: long bands 0 and 1 are lines 0..4 and 4..8, short band 0 lines
/// 0..4.
const RATE_48K: u8 = 3;

/// sign(q) |q|^(4/3) 2^((sf - 100) / 4), the specification's inverse
/// quantisation and scaling.
fn dequantised(q: i32, scalefactor: i32) -> f64 {
    q.signum() as f64
        * (q.abs() as f64).powf(4.0 / 3.0)
        * 2f64.powf((scalefactor - 100) as f64 / 4.0)
}

/// The book 1 codeword index of a signed quad of values in -1..=1.
fn quad(values: [i32; 4]) -> usize {
    values
        .iter()
        .fold(0, |index, &v| index * 3 + (v + 1) as usize)
}

/// The book 5 codeword index of a signed pair of values in -4..=4.
fn pair(y: i32, z: i32) -> usize {
    ((y + 4) * 9 + z + 4) as usize
}

fn ics_info_long(bits: &mut Bits, max_sfb: u32) {
    // ics_reserved_bit, ONLY_LONG_SEQUENCE, sine window, max_sfb, no
    // predictor.
    bits.put(1, 0).put(2, 0).put(1, 0).put(6, max_sfb).put(1, 0);
}

/// The flags of an individual_channel_stream with none of the optional tools.
fn no_tools(bits: &mut Bits) {
    bits.put(1, 0).put(1, 0).put(1, 0);
}

/// One long-window channel stream of global gain 100 coding band 0 with book
/// 1 at scalefactor 100 and the quad `values`; `tools` writes the three tool
/// flags and whatever data they announce.
fn long_channel(bits: &mut Bits, values: [i32; 4], tools: impl FnOnce(&mut Bits)) {
    bits.put(8, 100);
    ics_info_long(bits, 1);
    bits.put(4, 1).put(5, 1);
    bits.code(&SCALEFACTORS, 60);
    tools(bits);
    bits.code(&SPECTRAL_1, quad(values));
}

fn parsed(data: &[u8]) -> ParsedBlock {
    let mut block = ParsedBlock::new();
    assert!(parse_block(data, RATE_48K, &mut block), "the block parses");
    assert!(walk_block(data, RATE_48K).is_some(), "and walks");
    block
}

/// The spectra of every channel of `block`, every tool before the filterbank
/// applied.
fn spectra(block: &ParsedBlock) -> Vec<[f32; 1024]> {
    let mut noise = Noise::new();
    let mut out = Vec::new();
    for element in block.channel_elements() {
        let mut pair = [[0.0; 1024]; 2];
        let count = element_spectra(element, block.channels(), RATE_48K, &mut noise, &mut pair);
        out.extend_from_slice(&pair[..count]);
    }
    out
}

fn assert_close(got: &[f32], want: &[f64]) {
    assert_eq!(got.len(), want.len());
    for (i, (&g, &w)) in got.iter().zip(want).enumerate() {
        assert!(
            (g as f64 - w).abs() <= 1e-6 * w.abs().max(1.0),
            "line {i}: {g} against {w}: {got:?}"
        );
    }
}

#[test]
fn inverse_quantisation_and_scalefactors() {
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0).put(8, 100);
    ics_info_long(&mut bits, 2);
    // Band 0 with book 1, band 1 with book 5; scalefactors 100 and 104.
    bits.put(4, 1).put(5, 1).put(4, 5).put(5, 1);
    bits.code(&SCALEFACTORS, 60).code(&SCALEFACTORS, 64);
    no_tools(&mut bits);
    bits.code(&SPECTRAL_1, quad([1, 0, -1, 0]));
    bits.code(&SPECTRAL_5, pair(4, -3))
        .code(&SPECTRAL_5, pair(0, 2));
    let spectrum = spectra(&parsed(&bits.end()))[0];
    let want = [
        dequantised(1, 100),
        0.0,
        dequantised(-1, 100),
        0.0,
        dequantised(4, 104),
        dequantised(-3, 104),
        0.0,
        dequantised(2, 104),
    ];
    assert_close(&spectrum[..8], &want);
    assert!(spectrum[8..].iter().all(|&v| v == 0.0));
}

/// Book 11's escape: a magnitude of 16 is followed by N ones, a zero and N + 4
/// bits w, for 2^(N + 4) + w; the sign bits come before it.
#[test]
fn escape_values() {
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0).put(8, 100);
    ics_info_long(&mut bits, 1);
    bits.put(4, 11).put(5, 1);
    bits.code(&SCALEFACTORS, 60);
    no_tools(&mut bits);
    // (16, 3) negative and positive, the 16 escaped as 2^5 + 9 = 41.
    bits.code(&SPECTRAL_11, 16 * 17 + 3).put(1, 1).put(1, 0);
    bits.put(1, 1).put(1, 0).put(5, 9);
    // (0, 16) positive, escaped as 2^4 + 0 = 16.
    bits.code(&SPECTRAL_11, 16).put(1, 0).put(1, 0).put(4, 0);
    let spectrum = spectra(&parsed(&bits.end()))[0];
    let want = [-41, 3, 0, 16].map(|q| dequantised(q, 100));
    assert_close(&spectrum[..4], &want);
}

fn pulses(count: u32, start: u32, pulses: &[(u32, u32)]) -> impl FnOnce(&mut Bits) + '_ {
    move |bits: &mut Bits| {
        bits.put(1, 1).put(2, count - 1).put(6, start);
        for &(offset, amplitude) in pulses {
            bits.put(5, offset).put(4, amplitude);
        }
        bits.put(1, 0).put(1, 0);
    }
}

/// A pulse moves a quantised value away from zero -- up above zero, down
/// otherwise, zero included -- before inverse quantisation, and a second pulse
/// on the same line moves what the first left.
#[test]
fn pulses_move_quantised_values() {
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0);
    long_channel(
        &mut bits,
        [1, 0, -1, 0],
        pulses(4, 0, &[(0, 2), (1, 3), (1, 1), (0, 1)]),
    );
    let spectrum = spectra(&parsed(&bits.end()))[0];
    // Pulse offsets run on from each other, so the pulses land on lines 0, 1,
    // 2 and 2. Line 0: 1 + 2. Line 1: 0 - 3. Line 2: -1 - 1, then -2 - 1.
    let want = [3, -3, -3, 0].map(|q| dequantised(q, 100));
    assert_close(&spectrum[..4], &want);
}

/// A pulse in a band with no spectral values has no scalefactor to scale by
/// and leaves the line at zero.
#[test]
fn pulses_outside_coded_bands_change_nothing() {
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0);
    // Band 1 is above max_sfb.
    long_channel(&mut bits, [0, 0, 0, 0], pulses(1, 1, &[(2, 5)]));
    let spectrum = spectra(&parsed(&bits.end()))[0];
    assert!(spectrum.iter().all(|&v| v == 0.0));
}

/// Short windows: a group's values run band by band and within a band window
/// by window, and land in each window's own 128 lines.
#[test]
fn short_windows_are_deinterleaved() {
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0).put(8, 100);
    // EIGHT_SHORT_SEQUENCE, max_sfb 1, windows 0 and 1 grouped, the rest
    // alone: seven groups.
    bits.put(1, 0)
        .put(2, 2)
        .put(1, 0)
        .put(4, 1)
        .put(7, 0b100_0000);
    bits.put(4, 1).put(3, 1);
    for _ in 1..7 {
        bits.put(4, 0).put(3, 1);
    }
    bits.code(&SCALEFACTORS, 60);
    no_tools(&mut bits);
    bits.code(&SPECTRAL_1, quad([1, 0, 0, 0]));
    bits.code(&SPECTRAL_1, quad([0, 0, 0, -1]));
    let block = parsed(&bits.end());
    assert!(block.tools().short_windows);
    let spectrum = spectra(&block)[0];
    for (line, &value) in spectrum.iter().enumerate() {
        let want = match line {
            0 => 1.0,
            131 => -1.0,
            _ => 0.0,
        };
        assert_eq!(value, want, "line {line}");
    }
}

/// A channel pair sharing a long window with max_sfb 1, `ms_mask_present`
/// and its one `ms_used` bit; `first` and `second` write each channel stream
/// from its global gain on.
fn common_pair(
    ms_mask_present: u32,
    ms_used: u32,
    first: impl FnOnce(&mut Bits),
    second: impl FnOnce(&mut Bits),
) -> Vec<u8> {
    let mut bits = Bits::default();
    bits.put(3, 1).put(4, 0).put(1, 1);
    ics_info_long(&mut bits, 1);
    bits.put(2, ms_mask_present);
    if ms_mask_present == 1 {
        bits.put(1, ms_used);
    }
    first(&mut bits);
    second(&mut bits);
    bits.end()
}

/// A channel stream under a shared window, coding band 0 with book 1.
fn shared_coded(values: [i32; 4]) -> impl FnOnce(&mut Bits) {
    move |bits: &mut Bits| {
        bits.put(8, 100).put(4, 1).put(5, 1);
        bits.code(&SCALEFACTORS, 60);
        no_tools(bits);
        bits.code(&SPECTRAL_1, quad(values));
    }
}

#[test]
fn mid_side_is_undone_where_used() {
    let m = [1, 0, 0, -1];
    let s = [1, 0, -1, 0];
    let sum = |a: i32, b: i32| dequantised(a, 100) + dequantised(b, 100);
    let difference = |a: i32, b: i32| dequantised(a, 100) - dequantised(b, 100);
    let joint_left: Vec<f64> = (0..4).map(|i| sum(m[i], s[i])).collect();
    let joint_right: Vec<f64> = (0..4).map(|i| difference(m[i], s[i])).collect();
    let plain_left = m.map(|q| dequantised(q, 100));
    let plain_right = s.map(|q| dequantised(q, 100));
    for (mask, used, joint) in [(1, 1, true), (2, 0, true), (1, 0, false), (0, 0, false)] {
        let block = parsed(&common_pair(mask, used, shared_coded(m), shared_coded(s)));
        assert_eq!(block.tools().mid_side, joint);
        let spectra = spectra(&block);
        if joint {
            assert_close(&spectra[0][..4], &joint_left);
            assert_close(&spectra[1][..4], &joint_right);
        } else {
            assert_close(&spectra[0][..4], &plain_left);
            assert_close(&spectra[1][..4], &plain_right);
        }
    }
}

/// A second channel whose band 0 is intensity coded with `codebook` at
/// position 4.
fn intensity(codebook: u32) -> impl FnOnce(&mut Bits) {
    move |bits: &mut Bits| {
        bits.put(8, 100).put(4, codebook).put(5, 1);
        bits.code(&SCALEFACTORS, 64);
        no_tools(bits);
    }
}

/// An intensity band is the first channel's scaled by 0.5^(position / 4),
/// negated for book 14 and again where `ms_mask_present` is 1 and `ms_used`
/// set -- but not under `ms_mask_present` 2 (`invert_intensity()`).
#[test]
fn intensity_stereo_copies_the_first_channel() {
    let left = [1, 0, -1, 1];
    let level = left.map(|q| dequantised(q, 100));
    for (codebook, mask, used, sign) in [
        (15, 0, 0, 1.0),
        (14, 0, 0, -1.0),
        (15, 1, 1, -1.0),
        (14, 1, 1, 1.0),
        (15, 1, 0, 1.0),
        (15, 2, 0, 1.0),
        (14, 2, 0, -1.0),
    ] {
        let block = parsed(&common_pair(
            mask,
            used,
            shared_coded(left),
            intensity(codebook),
        ));
        assert!(block.tools().intensity);
        let spectra = spectra(&block);
        assert_close(&spectra[0][..4], &level);
        let want = level.map(|v| v * 0.5 * sign);
        assert_close(&spectra[1][..4], &want);
    }
}

/// A noise band of energy `9-bit value - 256 + global_gain - 90`.
fn noise_band(global_gain: u32, value: u32) -> impl FnOnce(&mut Bits) {
    move |bits: &mut Bits| {
        bits.put(8, global_gain).put(4, 13).put(5, 1).put(9, value);
        no_tools(bits);
    }
}

fn energy(lines: &[f32]) -> f64 {
    lines.iter().map(|&v| v as f64 * v as f64).sum()
}

/// Noise substitution fills a band with noise whose energy is 2^(energy / 2),
/// the same every time it is decoded.
#[test]
fn noise_substitution_has_the_coded_energy() {
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0).put(8, 100);
    ics_info_long(&mut bits, 1);
    // Energy 100 - 90 + 262 - 256 = 16.
    bits.put(4, 13).put(5, 1).put(9, 262);
    no_tools(&mut bits);
    let block = parsed(&bits.end());
    assert!(block.tools().noise);
    let spectrum = spectra(&block)[0];
    assert!((energy(&spectrum[..4]) / 256.0 - 1.0).abs() < 1e-5);
    assert!(spectrum[4..].iter().all(|&v| v == 0.0));
    assert!(spectrum[..4].iter().all(|&v| v != 0.0));
    assert_eq!(spectra(&block)[0], spectrum);
}

/// Where both channels of a pair code a band as noise and its `ms_used` is
/// set, the second takes the first's noise at its own energy.
#[test]
fn noise_is_correlated_where_mid_side_is_used() {
    // Energies 16 and 20.
    for (mask, used, correlated) in [(1, 1, true), (2, 0, true), (1, 0, false), (0, 0, false)] {
        let block = parsed(&common_pair(
            mask,
            used,
            noise_band(100, 262),
            noise_band(100, 266),
        ));
        let spectra = spectra(&block);
        assert!((energy(&spectra[0][..4]) / 256.0 - 1.0).abs() < 1e-5);
        assert!((energy(&spectra[1][..4]) / 1024.0 - 1.0).abs() < 1e-5);
        let scaled: Vec<f64> = spectra[0][..4].iter().map(|&v| v as f64 * 2.0).collect();
        let same = spectra[1][..4]
            .iter()
            .zip(&scaled)
            .all(|(&r, &l)| (r as f64 - l).abs() < 1e-5 * l.abs().max(1.0));
        assert_eq!(same, correlated, "mask {mask} used {used}");
    }
}

/// TNS: one filter of order one with a four-bit coefficient c = 3, so k =
/// sin(3 / (7.5 / (pi / 2))) and y(n) = x(n) - k y(n - 1), over bands 0 and 1
/// upwards, or downwards.
#[test]
fn tns_filters_the_bands_it_covers() {
    let k = (3.0 * PI / 2.0 / 7.5).sin();
    for direction in [0, 1] {
        let mut bits = Bits::default();
        bits.put(3, 0).put(4, 0).put(8, 100);
        ics_info_long(&mut bits, 2);
        bits.put(4, 1).put(5, 2);
        bits.code(&SCALEFACTORS, 60).code(&SCALEFACTORS, 60);
        // No pulses; TNS: one filter, coef_res 1, length 49 (every band, from
        // the top), order 1, the direction, no compression, coefficient 3.
        bits.put(1, 0).put(1, 1);
        bits.put(2, 1)
            .put(1, 1)
            .put(6, 49)
            .put(5, 1)
            .put(1, direction)
            .put(1, 0)
            .put(4, 3);
        bits.put(1, 0);
        let (first, second) = if direction == 0 {
            ([1, 0, 0, 0], [0, 0, 0, 0])
        } else {
            ([0, 0, 0, 0], [0, 0, 0, 1])
        };
        bits.code(&SPECTRAL_1, quad(first))
            .code(&SPECTRAL_1, quad(second));
        let block = parsed(&bits.end());
        assert!(block.tools().tns);
        let spectrum = spectra(&block)[0];
        let want: Vec<f64> = (0..8)
            .map(|n| {
                let steps = if direction == 0 { n } else { 7 - n };
                (-k).powi(steps)
            })
            .collect();
        assert_close(&spectrum[..8], &want);
        assert!(spectrum[8..].iter().all(|&v| v == 0.0));
    }
}

/// The whole decode of one long window: the IMDCT x(n) = 2/N sum X(k) cos(2
/// pi / N (n + n0)(k + 1/2)) of the spectrum, through the rising half of the
/// sine window, in units of full scale where the specification's are of 16
/// bits.
#[test]
fn decodes_to_the_imdct_of_the_spectrum() {
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0);
    long_channel(&mut bits, [1, 0, -1, 0], no_tools);
    let block = parsed(&bits.end());
    let mut decoder = AacDecoder::new();
    let mut frame = PcmFrame::new();
    decoder.decode(&block, 1, RATE_48K, &mut frame).unwrap();
    assert_eq!(frame.layout(), &ChannelLayout::Mono);
    assert_eq!(frame.sample_rate(), 48_000);
    let x = |n: usize| {
        let n0 = (1024.0 + 1.0) / 2.0;
        let line = |k: usize, value: f64| {
            value * (2.0 * PI / 2048.0 * (n as f64 + n0) * (k as f64 + 0.5)).cos()
        };
        2.0 / 2048.0 * (line(0, 1.0) + line(2, -1.0)) / 32768.0
    };
    let want: Vec<f64> = (0..1024)
        .map(|n| x(n) * (PI / 2048.0 * (n as f64 + 0.5)).sin())
        .collect();
    let got = frame.channel(0);
    for n in 0..1024 {
        assert!((got[n] as f64 - want[n]).abs() < 1e-11, "sample {n}");
    }
    // The second half overlaps the next frame: a lost one is that half
    // through the falling half of the window, and the one after is silence.
    decoder.conceal(&mut frame);
    for n in 0..1024 {
        let want = x(1024 + n) * (PI / 2048.0 * (1024.0 + n as f64 + 0.5)).sin();
        assert!(
            (frame.channel(0)[n] as f64 - want).abs() < 1e-11,
            "sample {n}"
        );
    }
    decoder.conceal(&mut frame);
    assert_eq!(frame.channels(), 1);
    assert!(frame.channel(0).iter().all(|&v| v == 0.0));
}

#[test]
fn conceals_nothing_before_the_first_frame() {
    let mut decoder = AacDecoder::new();
    let mut frame = PcmFrame::new();
    decoder.conceal(&mut frame);
    assert_eq!(frame.channels(), 0);
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0);
    long_channel(&mut bits, [1, 0, 0, 0], no_tools);
    decoder
        .decode(&parsed(&bits.end()), 1, RATE_48K, &mut frame)
        .unwrap();
    decoder.reset();
    decoder.conceal(&mut frame);
    assert_eq!(frame.channels(), 0);
}

/// Blocks the walk refuses are the blocks the parse refuses, and a refusal
/// leaves the parsed block reusable.
#[test]
fn parse_refuses_what_the_walk_refuses() {
    let mut refused = Vec::new();
    // ics_reserved_bit set.
    let mut bits = Bits::default();
    bits.put(3, 0)
        .put(4, 0)
        .put(8, 100)
        .put(1, 1)
        .put(2, 0)
        .put(1, 0)
        .put(6, 0)
        .put(1, 0);
    no_tools(&mut bits);
    refused.push(bits.end());
    // A scalefactor of 256.
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0).put(8, 250);
    ics_info_long(&mut bits, 1);
    bits.put(4, 1).put(5, 1).code(&SCALEFACTORS, 66);
    no_tools(&mut bits);
    bits.code(&SPECTRAL_1, quad([0; 4]));
    refused.push(bits.end());
    // A TNS filter of order 13.
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0).put(8, 100);
    ics_info_long(&mut bits, 0);
    bits.put(1, 0)
        .put(1, 1)
        .put(2, 1)
        .put(1, 0)
        .put(6, 1)
        .put(5, 13);
    bits.put(1, 0).put(1, 0).put(20, 0).put(19, 0).put(1, 0);
    refused.push(bits.end());
    // An escape of nine ones.
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0).put(8, 100);
    ics_info_long(&mut bits, 1);
    bits.put(4, 11).put(5, 1).code(&SCALEFACTORS, 60);
    no_tools(&mut bits);
    bits.code(&SPECTRAL_11, 16 * 17)
        .put(1, 0)
        .put(9, 0x1ff)
        .put(1, 0)
        .put(13, 0);
    bits.code(&SPECTRAL_11, 0);
    refused.push(bits.end());
    // A coupling channel element.
    let mut bits = Bits::default();
    bits.put(3, 2).put(4, 0).put(22, 0);
    refused.push(bits.end());
    // A reserved ms_mask_present.
    refused.push(common_pair(
        3,
        0,
        shared_coded([0; 4]),
        shared_coded([0; 4]),
    ));

    let mut good = Bits::default();
    good.put(3, 0).put(4, 0);
    long_channel(&mut good, [1, 0, 0, 0], no_tools);
    let good = good.end();
    let mut block = ParsedBlock::new();
    for data in &refused {
        assert!(walk_block(data, RATE_48K).is_none());
        assert!(!parse_block(data, RATE_48K, &mut block));
        assert!(parse_block(&good, RATE_48K, &mut block));
        assert_eq!(
            block.elements(),
            walk_block(&good, RATE_48K).unwrap().elements
        );
    }
    // And bytes after the block, and a rate without band tables.
    let mut longer = good.clone();
    longer.push(0);
    assert!(walk_block(&longer, RATE_48K).is_none());
    assert!(!parse_block(&longer, RATE_48K, &mut block));
    assert!(!parse_block(&good, 13, &mut block));
}

// Layouts.

const SCE: u32 = 0;
const CPE: u32 = 1;
const LFE: u32 = 3;

/// Empty channel elements, after an optional PCE.
fn elements(pce: Option<&dyn Fn(&mut Bits)>, list: &[(u32, u32)]) -> Vec<u8> {
    let mut bits = Bits::default();
    if let Some(pce) = pce {
        pce(&mut bits);
    }
    for &(id, tag) in list {
        bits.put(3, id).put(4, tag);
        if id == CPE {
            bits.put(1, 0).put(22, 0);
        }
        bits.put(22, 0);
    }
    bits.end()
}

/// A program_config_element: front, side and back as (is_cpe, tag), LFE tags,
/// and `matrix_mixdown_idx` with `pseudo_surround_enable` if present.
fn pce<'a>(
    front: &'a [(u32, u32)],
    side: &'a [(u32, u32)],
    back: &'a [(u32, u32)],
    lfe: &'a [u32],
    matrix: Option<(u32, u32)>,
) -> impl Fn(&mut Bits) + 'a {
    move |bits: &mut Bits| {
        bits.put(3, 5).put(4, 0).put(2, 1).put(4, RATE_48K as u32);
        bits.put(4, front.len() as u32)
            .put(4, side.len() as u32)
            .put(4, back.len() as u32);
        bits.put(2, lfe.len() as u32)
            .put(3, 0)
            .put(4, 0)
            .put(1, 0)
            .put(1, 0);
        match matrix {
            Some((index, pseudo)) => bits.put(1, 1).put(2, index).put(1, pseudo),
            None => bits.put(1, 0),
        };
        for &(is_cpe, tag) in front.iter().chain(side).chain(back) {
            bits.put(1, is_cpe).put(4, tag);
        }
        for &tag in lfe {
            bits.put(4, tag);
        }
        let pad = (8 - bits.len % 8) % 8;
        bits.put(pad, 0).put(8, 0);
    }
}

fn layout(
    data: &[u8],
    configuration: u8,
    decoder: &mut AacDecoder,
) -> crate::Result<ChannelLayout> {
    let block = parsed(data);
    let mut frame = PcmFrame::new();
    decoder.decode(&block, configuration, RATE_48K, &mut frame)?;
    Ok(frame.layout().clone())
}

fn speakers(list: &[Speaker], matrix_mixdown: Option<MatrixMixdown>) -> ChannelLayout {
    ChannelLayout::Speakers {
        speakers: list.to_vec(),
        matrix_mixdown,
    }
}

use Speaker::*;

#[test]
fn implicit_layouts() {
    let mut decoder = AacDecoder::new();
    let five = [(SCE, 0), (CPE, 0), (CPE, 1)];
    type Case<'a> = (&'a [(u32, u32)], u8, ChannelLayout);
    let cases: [Case; 8] = [
        (&[(SCE, 0)], 1, ChannelLayout::Mono),
        (&[(SCE, 0)], 2, ChannelLayout::Mono),
        (&[(SCE, 0), (SCE, 1)], 0, ChannelLayout::DualMono),
        (&[(SCE, 0), (SCE, 1)], 2, ChannelLayout::DualMono),
        (&[(CPE, 0)], 2, speakers(&[FrontLeft, FrontRight], None)),
        (
            &[(SCE, 0), (CPE, 0), (SCE, 1)],
            4,
            speakers(&[FrontCentre, FrontLeft, FrontRight, Surround], None),
        ),
        (
            &five,
            5,
            speakers(
                &[
                    FrontCentre,
                    FrontLeft,
                    FrontRight,
                    SurroundLeft,
                    SurroundRight,
                ],
                None,
            ),
        ),
        (
            &[(SCE, 0), (CPE, 0), (CPE, 1), (LFE, 0)],
            6,
            speakers(
                &[
                    FrontCentre,
                    FrontLeft,
                    FrontRight,
                    SurroundLeft,
                    SurroundRight,
                    Lfe,
                ],
                None,
            ),
        ),
    ];
    for (list, configuration, want) in cases {
        assert_eq!(
            layout(&elements(None, list), configuration, &mut decoder).unwrap(),
            want
        );
    }
    // Elements that are not the configuration's, and configurations with no
    // layout here.
    assert!(layout(&elements(None, &[(CPE, 0)]), 1, &mut decoder).is_err());
    assert!(layout(&elements(None, &[(CPE, 0), (SCE, 0)]), 3, &mut decoder).is_err());
    assert!(layout(&elements(None, &[(SCE, 0), (CPE, 0)]), 7, &mut decoder).is_err());
    assert!(layout(&elements(None, &five), 0, &mut decoder).is_err());
}

#[test]
fn program_config_element_layouts() {
    let mut decoder = AacDecoder::new();
    // 5.1 with matrix mixdown, elements in another order than the PCE's.
    let five_one = pce(&[(0, 1), (1, 2)], &[], &[(1, 3)], &[4], Some((2, 1)));
    let data = elements(Some(&five_one), &[(CPE, 2), (SCE, 1), (LFE, 4), (CPE, 3)]);
    let want = speakers(
        &[
            FrontLeft,
            FrontRight,
            FrontCentre,
            Lfe,
            SurroundLeft,
            SurroundRight,
        ],
        Some(MatrixMixdown {
            index: 2,
            pseudo_surround: true,
        }),
    );
    assert_eq!(layout(&data, 0, &mut decoder).unwrap(), want);
    let block = parsed(&data);
    let pce_info = block.pce().unwrap();
    assert!(pce_info.matrix_mixdown_idx_present && pce_info.pseudo_surround_enable);
    assert_eq!(pce_info.channels, 6);
    // A later block without a PCE is described by the one kept...
    let bare = elements(None, &[(CPE, 2), (SCE, 1), (LFE, 4), (CPE, 3)]);
    assert_eq!(layout(&bare, 0, &mut decoder).unwrap(), want);
    // ...unless it names other elements, and then it is read without one.
    assert_eq!(
        layout(&elements(None, &[(CPE, 0)]), 0, &mut decoder).unwrap(),
        speakers(&[FrontLeft, FrontRight], None)
    );
    assert!(layout(
        &elements(None, &[(SCE, 0), (CPE, 0), (CPE, 1)]),
        0,
        &mut decoder
    )
    .is_err());
    // reset() forgets it.
    decoder.reset();
    assert!(layout(&bare, 0, &mut decoder).is_err());

    // 3/1 with a lone back channel, and 2/2 from side and back single
    // channels.
    let three_one = pce(&[(0, 0), (1, 0)], &[], &[(0, 1)], &[], None);
    assert_eq!(
        layout(
            &elements(Some(&three_one), &[(SCE, 0), (CPE, 0), (SCE, 1)]),
            0,
            &mut decoder
        )
        .unwrap(),
        speakers(&[FrontCentre, FrontLeft, FrontRight, Surround], None)
    );
    let two_two = pce(&[(1, 0)], &[(0, 1)], &[(0, 2)], &[], None);
    assert_eq!(
        layout(
            &elements(Some(&two_two), &[(CPE, 0), (SCE, 1), (SCE, 2)]),
            0,
            &mut decoder
        )
        .unwrap(),
        speakers(&[FrontLeft, FrontRight, SurroundLeft, SurroundRight], None)
    );
    // Two SCEs are dual mono even where a PCE names them as front channels,
    // as a broadcast's dual mono comes.
    let dual = pce(&[(0, 0), (0, 1)], &[], &[], &[], None);
    assert_eq!(
        layout(
            &elements(Some(&dual), &[(SCE, 0), (SCE, 1)]),
            0,
            &mut decoder
        )
        .unwrap(),
        ChannelLayout::DualMono
    );
    // Refused: tags the PCE does not name, more than two surround channels,
    // and a centre that is a pair.
    assert!(layout(
        &elements(Some(&three_one), &[(SCE, 0), (CPE, 1), (SCE, 1)]),
        0,
        &mut decoder
    )
    .is_err());
    let wide = pce(&[(1, 0)], &[(1, 1)], &[(0, 2)], &[], None);
    assert!(layout(
        &elements(Some(&wide), &[(CPE, 0), (CPE, 1), (SCE, 2)]),
        0,
        &mut decoder
    )
    .is_err());
    let odd = pce(&[(1, 0), (0, 1)], &[], &[], &[], None);
    assert!(layout(
        &elements(Some(&odd), &[(CPE, 0), (SCE, 1)]),
        0,
        &mut decoder
    )
    .is_err());
}

/// A layout or rate change starts each channel afresh.
#[test]
fn a_new_layout_resets_the_overlap() {
    let mut decoder = AacDecoder::new();
    let mut frame = PcmFrame::new();
    let mut bits = Bits::default();
    bits.put(3, 0).put(4, 0);
    long_channel(&mut bits, [1, 0, 0, 0], no_tools);
    let loud = parsed(&bits.end());
    let silent = parsed(&elements(None, &[(SCE, 0)]));
    decoder.decode(&loud, 1, RATE_48K, &mut frame).unwrap();
    // Silence after it still carries the overlap...
    decoder.decode(&silent, 1, RATE_48K, &mut frame).unwrap();
    assert!(frame.channel(0).iter().any(|&v| v != 0.0));
    decoder.decode(&loud, 1, RATE_48K, &mut frame).unwrap();
    // ...but not across a change to dual mono.
    let dual = parsed(&elements(None, &[(SCE, 0), (SCE, 1)]));
    decoder.decode(&dual, 0, RATE_48K, &mut frame).unwrap();
    assert_eq!(frame.layout(), &ChannelLayout::DualMono);
    assert!(frame.channel(0).iter().all(|&v| v == 0.0));
    // A failed decode leaves the decoder as it was.
    assert!(decoder.decode(&dual, 7, RATE_48K, &mut frame).is_err());
    decoder.conceal(&mut frame);
    assert_eq!(frame.layout(), &ChannelLayout::DualMono);
}

// Downmix.

fn constant(values: &[f32]) -> Vec<Vec<f32>> {
    values.iter().map(|&v| vec![v; 1024]).collect()
}

fn mix(frame: &PcmFrame, sub: bool, gain: f32) -> (f32, f32) {
    let (mut left, mut right) = (vec![9.0; 1024], vec![9.0; 1024]);
    to_stereo(frame, sub, gain, &mut left, &mut right);
    assert!(left.iter().all(|&v| v == left[0]) && right.iter().all(|&v| v == right[0]));
    (left[0], right[0])
}

fn near(got: (f32, f32), want: (f64, f64)) {
    assert!(
        (got.0 as f64 - want.0).abs() < 1e-6 && (got.1 as f64 - want.1).abs() < 1e-6,
        "{got:?} against {want:?}"
    );
}

#[test]
fn downmix_of_every_layout() {
    let r = std::f64::consts::FRAC_1_SQRT_2;
    let mono = PcmFrame::from_channels(ChannelLayout::Mono, &constant(&[0.5]));
    near(mix(&mono, false, 1.0), (0.5, 0.5));
    near(mix(&mono, true, 2.0), (1.0, 1.0));

    let dual = PcmFrame::from_channels(ChannelLayout::DualMono, &constant(&[0.25, -0.5]));
    near(mix(&dual, false, 1.0), (0.25, 0.25));
    near(mix(&dual, true, 1.0), (-0.5, -0.5));

    let stereo = PcmFrame::from_channels(
        speakers(&[FrontLeft, FrontRight], None),
        &constant(&[0.1, 0.2]),
    );
    near(mix(&stereo, true, 1.0), (0.1, 0.2));
    near(mix(&stereo, false, 0.5), (0.05, 0.1));

    // C, L, R: the centre at 1/sqrt 2 to each side.
    let three = PcmFrame::from_channels(
        speakers(&[FrontCentre, FrontLeft, FrontRight], None),
        &constant(&[0.4, 0.1, 0.2]),
    );
    near(mix(&three, false, 1.0), (0.1 + 0.4 * r, 0.2 + 0.4 * r));

    // 3/1: the single surround as Ls = Rs = S / sqrt 2, k = 1/sqrt 2.
    let three_one = PcmFrame::from_channels(
        speakers(&[FrontCentre, FrontLeft, FrontRight, Surround], None),
        &constant(&[0.4, 0.1, 0.2, 0.3]),
    );
    near(
        mix(&three_one, false, 1.0),
        (0.1 + 0.4 * r + r * 0.3 * r, 0.2 + 0.4 * r + r * 0.3 * r),
    );

    // 5.1, the LFE left out, k by matrix_mixdown_idx.
    let order = [
        FrontCentre,
        FrontLeft,
        FrontRight,
        SurroundLeft,
        SurroundRight,
        Lfe,
    ];
    let values = constant(&[0.4, 0.1, 0.2, 0.3, -0.3, 0.9]);
    for (matrix, k) in [
        (None, r),
        (Some(0), r),
        (Some(1), 0.5),
        (Some(2), r / 2.0),
        (Some(3), 0.0),
    ] {
        let mixdown = matrix.map(|index| MatrixMixdown {
            index,
            pseudo_surround: true,
        });
        let frame = PcmFrame::from_channels(speakers(&order, mixdown), &values);
        let want = (0.1 + 0.4 * r + k * 0.3, 0.2 + 0.4 * r - k * 0.3);
        near(mix(&frame, false, 1.0), want);
        near(mix(&frame, false, 0.5), (want.0 * 0.5, want.1 * 0.5));
    }

    // Nothing decoded yet: silence.
    near(mix(&PcmFrame::new(), false, 1.0), (0.0, 0.0));
}

// Pulses against ffmpeg.

/// Six ADTS frames of one single channel element each, mono at 48 kHz, which
/// no encoder makes: three pulses a frame, on lines of books 1, 5 and 11, with
/// scalefactors that change from band to band, escapes, and the window shape
/// alternating.
fn pulse_stream() -> Vec<u8> {
    let mut stream = Vec::new();
    for f in 0..6u32 {
        let mut bits = Bits::default();
        bits.put(3, 0).put(4, 0).put(8, 150 + f);
        bits.put(1, 0).put(2, 0).put(1, f % 2).put(6, 4).put(1, 0);
        bits.put(4, 1)
            .put(5, 2)
            .put(4, 5)
            .put(5, 1)
            .put(4, 11)
            .put(5, 1);
        for delta in [0, 2, -3, 1] {
            bits.code(&SCALEFACTORS, (60 + delta) as usize);
        }
        // Pulses from band 0: lines f % 4, two on and 3 + f % 3 further.
        bits.put(1, 1).put(2, 2).put(6, 0);
        bits.put(5, f % 4)
            .put(4, 5)
            .put(5, 2)
            .put(4, 7)
            .put(5, 3 + f % 3)
            .put(4, 15);
        bits.put(1, 0).put(1, 0);
        let mut first = [1, 0, -1, 0];
        first.rotate_left(f as usize % 4);
        bits.code(&SPECTRAL_1, quad(first))
            .code(&SPECTRAL_1, quad([0, 1, 1, -1]));
        bits.code(&SPECTRAL_5, pair(f as i32 % 5 - 2, 3))
            .code(&SPECTRAL_5, pair(-4, 1));
        // (16, 2) with the 16 escaped as 2^4 + f, its sign set in even
        // frames; then (0, 15).
        bits.code(&SPECTRAL_11, 16 * 17 + 2)
            .put(1, (f + 1) % 2)
            .put(1, 0);
        bits.put(1, 0).put(4, f);
        bits.code(&SPECTRAL_11, 15).put(1, 1);
        let block = bits.end();
        let length = 7 + block.len();
        stream.extend_from_slice(&[
            0xff,
            0xf1,
            0x40 | RATE_48K << 2,
            0x40 | (length >> 11) as u8,
            (length >> 3) as u8,
            ((length & 7) << 5) as u8 | 0x1f,
            0xfc,
        ]);
        stream.extend_from_slice(&block);
    }
    stream
}

/// ffmpeg 7.1's float decoder (`ffmpeg -i pulse.adts -f f32le`) on
/// [`pulse_stream`] written to a file, at samples 0, 97, 301, 512, 777 and
/// 1023 of each frame.
const PULSE_REFERENCE: [[f32; 6]; 6] = [
    [
        -1.0592804e-05,
        0.00021517673,
        -0.004244732,
        7.7068806e-05,
        -0.010822374,
        0.013810866,
    ],
    [
        0.013610287,
        -0.0130229145,
        -0.0028250688,
        0.002846339,
        0.007354351,
        0.0042874943,
    ],
    [
        0.003564894,
        0.002711023,
        -0.002325466,
        0.0061661038,
        0.0017666782,
        0.026888682,
    ],
    [
        0.026710242,
        -0.008268395,
        -0.017541502,
        0.008921737,
        -0.0026738327,
        -0.0015291697,
    ],
    [
        -0.002676759,
        0.018439295,
        -0.02013856,
        -0.0127528,
        0.008976323,
        0.029694661,
    ],
    [
        0.029905595,
        -0.0061003165,
        0.002532768,
        0.008309416,
        0.015693907,
        -0.0015105226,
    ],
];

#[test]
fn pulses_decode_as_ffmpeg_decodes_them() {
    let stream = pulse_stream();
    let mut block = ParsedBlock::new();
    let mut decoder = AacDecoder::new();
    let mut frame = PcmFrame::new();
    let mut at = 0;
    for reference in PULSE_REFERENCE {
        let length = ((stream[at + 3] as usize & 3) << 11)
            | (stream[at + 4] as usize) << 3
            | (stream[at + 5] >> 5) as usize;
        assert!(parse_block(
            &stream[at + 7..at + length],
            RATE_48K,
            &mut block
        ));
        assert!(block.tools().pulse);
        decoder.decode(&block, 1, RATE_48K, &mut frame).unwrap();
        for (&sample, want) in [0, 97, 301, 512, 777, 1023].iter().zip(reference) {
            let got = frame.channel(0)[sample];
            assert!(
                (got - want).abs() <= 1.0 / 32768.0 / 64.0,
                "sample {sample}: {got} against {want}"
            );
        }
        at += length;
    }
    assert_eq!(at, stream.len());
}
