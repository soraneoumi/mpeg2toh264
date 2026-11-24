//! AAC-LC syntax: where every element of a raw_data_block begins and ends,
//! whether a decoder would accept it, and every value it carries.
//!
//! There is one reading of the syntax, and it hands each value it reads to a
//! [`Sink`]. [`walk_block`] gives it a sink that keeps nothing; the audio
//! decoder's parse gives it one that records what decoding needs. What a
//! decoder accepts is decided by the reading alone, so the two cannot disagree
//! about a block.

use crate::bitreader::BitReader;
use crate::container::aac_huffman::*;
use crate::error::{bail, Result};
use std::sync::LazyLock;

/// What a walk found out about the level of the channels it stepped over.
///
/// Every scalefactor of a channel is coded as a difference from its
/// `global_gain`, and a band's spectral values are scaled by
/// 2^((scalefactor - 100) / 4). So adding to each `global_gain` scales the whole
/// decoded sound -- four doubles it -- without touching a spectral value, and
/// with the field staying eight bits nothing after it moves. A decoder refuses a
/// scalefactor outside 0..=255, which is what `max_scalefactor` is kept for.
#[derive(Default, Debug)]
struct GlobalGains {
    /// The bit position of every channel's `global_gain`, in stream order:
    /// the first `count` of them.
    positions: [usize; 2],
    count: usize,
    /// The largest scalefactor any band reached, or `None` where no band
    /// carried one.
    max_scalefactor: Option<i32>,
}

/// `window_sequence` values other than ONLY_LONG_SEQUENCE's zero (ISO/IEC
/// 14496-3 Table 4.88).
pub(crate) const LONG_START_SEQUENCE: u8 = 1;
pub(crate) const EIGHT_SHORT_SEQUENCE: u8 = 2;
pub(crate) const LONG_STOP_SEQUENCE: u8 = 3;

/// Codebooks with a meaning of their own rather than spectral values
/// (ISO/IEC 14496-3 Table 4.150).
pub(crate) const ZERO_HCB: u8 = 0;
pub(crate) const NOISE_HCB: u8 = 13;
pub(crate) const INTENSITY_HCB2: u8 = 14;
pub(crate) const INTENSITY_HCB: u8 = 15;

/// An `ics_info`, with the window groups its `scale_factor_grouping` makes.
#[derive(Clone, Copy, Debug)]
pub(crate) struct IcsInfo {
    pub window_sequence: u8,
    pub window_shape: u8,
    pub max_sfb: usize,
    /// How many window groups there are, and how many windows each spans:
    /// one group of one window for a long window sequence.
    pub groups: usize,
    pub group_len: [u8; 8],
    /// The scalefactor band offsets of the window this `ics_info` selected.
    pub offsets: &'static [u16],
}

impl IcsInfo {
    pub fn short(&self) -> bool {
        self.window_sequence == EIGHT_SHORT_SEQUENCE
    }
}

/// One TNS filter as `tns_data` codes it.
#[derive(Clone, Copy, Default, Debug)]
pub(crate) struct TnsFilter {
    /// How many bands the filter spans, counted down from where the filter
    /// above it began.
    pub length: u8,
    pub order: u8,
    /// Whether the filter runs from the top of its span downwards.
    pub direction: bool,
    /// Whether each coefficient is coded with one bit less than
    /// `coef_res` says.
    pub compress: bool,
    /// The coded coefficients, sign-extended, the first `order` of them.
    pub coef: [i8; 12],
}

/// Where the reading of a raw_data_block hands what it reads. Every method
/// does nothing unless a sink overrides it, which is all a walk needs.
///
/// Bands are numbered `group * max_sfb + band`, in the order the syntax codes
/// them, and spectral values are placed by `window * 128 + line` for a short
/// window and by `line` for a long one.
pub(crate) trait Sink {
    /// A channel element begins: a single channel, channel pair or LFE
    /// element.
    fn channel_element(&mut self, _id: u8, _tag: u8) {}
    /// The channel pair element that began shares one `ics_info` between its
    /// channels, with this `ms_mask_present`.
    fn common_window(&mut self, _ms_mask_present: u8) {}
    /// One `ms_used` bit, under `ms_mask_present` 1.
    fn ms_used(&mut self, _band: usize, _used: bool) {}
    /// An `individual_channel_stream` begins.
    fn channel(&mut self, _global_gain: u8, _info: &IcsInfo) {}
    /// A band's codebook and what its scale factor data comes to: the
    /// scalefactor of a spectral band, the noise energy of a noise band, the
    /// intensity position of an intensity band, each run on from the band
    /// before as the syntax codes it; zero for a band of the zero codebook.
    fn band(&mut self, _band: usize, _codebook: u8, _value: i32) {}
    /// The first `count` pulses, at the spectral lines they land on.
    fn pulses(&mut self, _count: usize, _positions: [u16; 4], _amplitudes: [u8; 4]) {}
    /// `tns_data` for one window: how many filters it has, and its
    /// `coef_res`.
    fn tns_window(&mut self, _window: usize, _filters: usize, _coef_res: u8) {}
    fn tns_filter(&mut self, _window: usize, _index: usize, _filter: &TnsFilter) {}
    /// Quantised spectral values from line `at` on.
    fn spectral<const N: usize>(&mut self, _at: usize, _values: [i32; N]) {}
}

/// The sink of a walk, which keeps nothing.
struct Walk;

impl Sink for Walk {}

#[derive(Clone, Copy, Default)]
struct Section {
    cb: u8,
    start: u8,
    end: u8,
}

/// The sections of every window group of a channel stream. A section spans one
/// band at least, so a group has no more sections than `max_sfb`: 51 for a long
/// window, eight times 15 for the short ones.
struct Sections {
    list: [Section; 128],
    /// One past the last section of each group.
    group_end: [u8; 8],
}

/// Scalefactor band offsets of the long and the short window at one sampling
/// rate (ISO/IEC 14496-3 Tables 4.129 to 4.147). Each ends at the window's
/// length, so a table holds one more entry than it has bands. Rates share
/// tables in the pairs `band_tables` lists.
const SWB_LONG_96: &[u16] = &[
    0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 64, 72, 80, 88, 96, 108, 120, 132,
    144, 156, 172, 188, 212, 240, 276, 320, 384, 448, 512, 576, 640, 704, 768, 832, 896, 960, 1024,
];
const SWB_LONG_64: &[u16] = &[
    0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 64, 72, 80, 88, 100, 112, 124, 140,
    156, 172, 192, 216, 240, 268, 304, 344, 384, 424, 464, 504, 544, 584, 624, 664, 704, 744, 784,
    824, 864, 904, 944, 984, 1024,
];
const SWB_LONG_48: &[u16] = &[
    0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96, 108, 120, 132, 144, 160,
    176, 196, 216, 240, 264, 292, 320, 352, 384, 416, 448, 480, 512, 544, 576, 608, 640, 672, 704,
    736, 768, 800, 832, 864, 896, 928, 1024,
];
const SWB_LONG_32: &[u16] = &[
    0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96, 108, 120, 132, 144, 160,
    176, 196, 216, 240, 264, 292, 320, 352, 384, 416, 448, 480, 512, 544, 576, 608, 640, 672, 704,
    736, 768, 800, 832, 864, 896, 928, 960, 992, 1024,
];
const SWB_LONG_24: &[u16] = &[
    0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 52, 60, 68, 76, 84, 92, 100, 108, 116, 124, 136,
    148, 160, 172, 188, 204, 220, 240, 260, 284, 308, 336, 364, 396, 432, 468, 508, 552, 600, 652,
    704, 768, 832, 896, 960, 1024,
];
const SWB_LONG_16: &[u16] = &[
    0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 100, 112, 124, 136, 148, 160, 172, 184, 196, 212,
    228, 244, 260, 280, 300, 320, 344, 368, 396, 424, 456, 492, 532, 572, 616, 664, 716, 772, 832,
    896, 960, 1024,
];
const SWB_LONG_8: &[u16] = &[
    0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 172, 188, 204, 220, 236, 252, 268,
    288, 308, 328, 348, 372, 396, 420, 448, 476, 508, 544, 580, 620, 664, 712, 764, 820, 880, 944,
    1024,
];
const SWB_SHORT_96: &[u16] = &[0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 92, 128];
const SWB_SHORT_48: &[u16] = &[0, 4, 8, 12, 16, 20, 28, 36, 44, 56, 68, 80, 96, 112, 128];
const SWB_SHORT_24: &[u16] = &[
    0, 4, 8, 12, 16, 20, 24, 28, 36, 44, 52, 64, 76, 92, 108, 128,
];
const SWB_SHORT_16: &[u16] = &[
    0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 60, 72, 88, 108, 128,
];
const SWB_SHORT_8: &[u16] = &[
    0, 4, 8, 12, 16, 20, 24, 28, 36, 44, 52, 60, 72, 88, 108, 128,
];

/// The long and the short window's band offsets for a
/// `sampling_frequency_index`, or `None` for the reserved and escape values.
pub(crate) fn band_tables(frequency_index: u8) -> Option<(&'static [u16], &'static [u16])> {
    Some(match frequency_index {
        0 | 1 => (SWB_LONG_96, SWB_SHORT_96),
        2 => (SWB_LONG_64, SWB_SHORT_96),
        3 | 4 => (SWB_LONG_48, SWB_SHORT_48),
        5 => (SWB_LONG_32, SWB_SHORT_48),
        6 | 7 => (SWB_LONG_24, SWB_SHORT_24),
        8..=10 => (SWB_LONG_16, SWB_SHORT_16),
        11 | 12 => (SWB_LONG_8, SWB_SHORT_8),
        _ => return None,
    })
}

/// How many bits of the stream the first lookup of a codebook goes by. Most
/// of the codewords a frame is made of are no longer.
const LOOKUP_BITS: u32 = 10;
/// The longest codeword of any book.
const LONGEST_CODE: u32 = 19;

/// What a spectral codeword stands for: its values in order -- magnitudes for
/// an unsigned book, whose signs follow the codeword -- and how many of them
/// are not zero.
#[derive(Clone, Copy, Default)]
struct Tuple {
    values: [i8; 4],
    nonzero: u8,
}

/// A codebook, with its shorter codewords laid out to be found in one read.
struct Codebook {
    /// By the next `LOOKUP_BITS` bits of the stream: the length of the
    /// codeword they begin with in the low five bits and its index above
    /// them, or zero where that codeword is longer or there is none.
    short: [u16; 1 << LOOKUP_BITS],
    /// Every codeword, in order of length and then of value.
    codes: &'static [AacVlc],
    /// By codeword index, the values of a spectral book; empty for the
    /// scalefactor book.
    tuples: Vec<Tuple>,
}

impl Codebook {
    fn new(codes: &'static [AacVlc], tuples: Vec<Tuple>) -> Self {
        let mut short = [0; 1 << LOOKUP_BITS];
        for code in codes {
            let len = code.len as u32;
            if len <= LOOKUP_BITS {
                let first = (code.bits << (LOOKUP_BITS - len)) as usize;
                short[first..first + (1 << (LOOKUP_BITS - len))]
                    .fill(code.index << 5 | code.len as u16);
            }
        }
        Self {
            short,
            codes,
            tuples,
        }
    }
}

/// The values of every codeword of spectral book `cb` (ISO/IEC 14496-3
/// 4.6.3.3): the index is the values as digits, the first most significant,
/// in base `lav + 1` for an unsigned book and `2 * lav + 1` offset by `lav` for
/// a signed one.
fn tuples(cb: usize) -> Vec<Tuple> {
    let (unsigned, dimension, lav) = book_shape(cb as u8);
    let radix = if unsigned { lav + 1 } else { 2 * lav + 1 };
    let count = radix.pow(dimension as u32);
    (0..count)
        .map(|mut index| {
            let mut tuple = Tuple::default();
            for value in tuple.values[..dimension].iter_mut().rev() {
                let digit = (index % radix) as i8;
                index /= radix;
                *value = if unsigned { digit } else { digit - lav as i8 };
            }
            tuple.nonzero = tuple.values.iter().filter(|&&v| v != 0).count() as u8;
            tuple
        })
        .collect()
}

/// Whether spectral book `cb` codes magnitudes with separate signs, how many
/// values a codeword carries, and the largest absolute value it codes.
fn book_shape(cb: u8) -> (bool, usize, usize) {
    match cb {
        1 | 2 => (false, 4, 1),
        3 | 4 => (true, 4, 2),
        5 | 6 => (false, 2, 4),
        7 | 8 => (true, 2, 7),
        9 | 10 => (true, 2, 12),
        11 => (true, 2, 16),
        _ => unreachable!("spectral books are 1 to 11"),
    }
}

/// The scalefactor book, then spectral books 1 to 11 under their numbers.
static CODEBOOKS: LazyLock<[Codebook; 12]> = LazyLock::new(|| {
    let books: [&'static [AacVlc]; 12] = [
        &SCALEFACTORS,
        &SPECTRAL_1,
        &SPECTRAL_2,
        &SPECTRAL_3,
        &SPECTRAL_4,
        &SPECTRAL_5,
        &SPECTRAL_6,
        &SPECTRAL_7,
        &SPECTRAL_8,
        &SPECTRAL_9,
        &SPECTRAL_10,
        &SPECTRAL_11,
    ];
    let mut cb = 0;
    books.map(|codes| {
        let tuples = if cb == 0 { Vec::new() } else { tuples(cb) };
        cb += 1;
        Codebook::new(codes, tuples)
    })
});

fn scalefactor_book() -> &'static Codebook {
    &CODEBOOKS[0]
}

/// Read one codeword and return its index.
#[inline]
fn vlc(r: &mut BitReader<'_>, book: &Codebook) -> Result<usize> {
    let entry = book.short[r.peek(LOOKUP_BITS) as usize];
    if entry != 0 {
        r.skip((entry & 31) as u32);
        return Ok((entry >> 5) as usize);
    }
    long_vlc(r, book.codes)
}

/// [`vlc`] for a codeword longer than the lookup covers.
fn long_vlc(r: &mut BitReader<'_>, codes: &[AacVlc]) -> Result<usize> {
    for len in LOOKUP_BITS + 1..=LONGEST_CODE {
        let bits = r.peek(len);
        if let Ok(at) = codes.binary_search_by_key(&(len as u8, bits), |code| (code.len, code.bits))
        {
            r.skip(len);
            return Ok(codes[at].index as usize);
        }
    }
    bail!("invalid AAC Huffman code at bit {}", r.bit_pos())
}

fn ics_info(r: &mut BitReader<'_>, tables: BandTables) -> Result<IcsInfo> {
    // ics_reserved_bit, which is zero in every stream; a decoder checking the
    // syntax strictly refuses a one, and damage sets it as often as not.
    if r.flag() {
        bail!("AAC ics_reserved_bit is set");
    }
    let window_sequence = r.u(2) as u8;
    let window_shape = r.u(1) as u8;
    let info = if window_sequence == EIGHT_SHORT_SEQUENCE {
        let max_sfb = r.u(4) as usize;
        let grouping = r.u(7);
        let mut group_len = [0u8; 8];
        let mut groups = 1;
        group_len[0] = 1;
        for bit in (0..7).rev() {
            if grouping & (1 << bit) != 0 {
                group_len[groups - 1] += 1;
            } else {
                group_len[groups] = 1;
                groups += 1;
            }
        }
        IcsInfo {
            window_sequence,
            window_shape,
            max_sfb,
            groups,
            group_len,
            offsets: tables.1,
        }
    } else {
        let max_sfb = r.u(6) as usize;
        if r.flag() {
            bail!("AAC-LC predictor_data_present is unsupported");
        }
        IcsInfo {
            window_sequence,
            window_shape,
            max_sfb,
            groups: 1,
            group_len: [1, 0, 0, 0, 0, 0, 0, 0],
            offsets: tables.0,
        }
    };
    if info.max_sfb > band_count(info.offsets) {
        bail!(
            "AAC max_sfb {} exceeds the {} bands of the window",
            info.max_sfb,
            band_count(info.offsets)
        );
    }
    Ok(info)
}

/// The long and the short window's band offsets at one sampling rate.
type BandTables = (&'static [u16], &'static [u16]);

pub(crate) fn band_count(offsets: &[u16]) -> usize {
    offsets.len() - 1
}

fn sections(r: &mut BitReader<'_>, info: &IcsInfo, out: &mut Sections) -> Result<()> {
    let len_bits = if info.short() { 3 } else { 5 };
    let escape = (1usize << len_bits) - 1;
    let mut count = 0;
    for g in 0..info.groups {
        let mut at = 0;
        while at < info.max_sfb {
            let cb = r.u(4) as u8;
            let mut length = 0;
            loop {
                let increment = r.u(len_bits) as usize;
                length += increment;
                if increment != escape {
                    break;
                }
            }
            if length == 0 || at + length > info.max_sfb || cb == 12 {
                bail!("invalid AAC section at bit {}", r.bit_pos());
            }
            out.list[count] = Section {
                cb,
                start: at as u8,
                end: (at + length) as u8,
            };
            count += 1;
            at += length;
        }
        out.group_end[g] = count as u8;
    }
    Ok(())
}

/// `scale_factor_data`, run on from `global_gain` as ISO/IEC 14496-3 4.6.2.3.3
/// has it: the band scalefactors from `global_gain`, the noise energies from
/// `global_gain - 90` with the first of them a nine-bit difference offset by
/// 256, and the intensity positions from zero.
fn scale_factors<S: Sink>(
    r: &mut BitReader<'_>,
    info: &IcsInfo,
    sections: &Sections,
    global_gain: u32,
    gains: &mut GlobalGains,
    sink: &mut S,
) -> Result<()> {
    let mut first_noise = true;
    // Only the spectral bands' scalefactors run on from `global_gain` and are
    // held to 0..=255. Noise energies and intensity positions are differences
    // of their own, which a decoder clips rather than refuses.
    let mut scalefactor = global_gain as i32;
    let mut noise_energy = global_gain as i32 - 90;
    let mut intensity_position = 0;
    let mut band = 0;
    for section in &sections.list[..sections.group_end[info.groups - 1] as usize] {
        for _ in section.start..section.end {
            let value = match section.cb {
                ZERO_HCB => 0,
                NOISE_HCB => {
                    noise_energy += if first_noise {
                        first_noise = false;
                        r.u(9) as i32 - 256
                    } else {
                        vlc(r, scalefactor_book())? as i32 - 60
                    };
                    noise_energy
                }
                1..=11 => {
                    scalefactor += vlc(r, scalefactor_book())? as i32 - 60;
                    if !(0..=255).contains(&scalefactor) {
                        bail!("AAC scalefactor {scalefactor} is outside 0..=255");
                    }
                    gains.max_scalefactor = Some(
                        gains
                            .max_scalefactor
                            .map_or(scalefactor, |m| m.max(scalefactor)),
                    );
                    scalefactor
                }
                INTENSITY_HCB2 | INTENSITY_HCB => {
                    intensity_position += vlc(r, scalefactor_book())? as i32 - 60;
                    intensity_position
                }
                _ => bail!("unsupported AAC scalefactor codebook {}", section.cb),
            };
            sink.band(band, section.cb, value);
            band += 1;
        }
    }
    Ok(())
}

/// `pulse_data`, which only a long window may carry, and whose pulses have to
/// land inside the spectrum.
fn pulses<S: Sink>(r: &mut BitReader<'_>, info: &IcsInfo, sink: &mut S) -> Result<()> {
    if info.short() {
        bail!("AAC pulse data in a short window");
    }
    let count = r.u(2) as usize + 1;
    let start_band = r.u(6) as usize;
    let bands = band_count(info.offsets);
    if start_band >= bands {
        bail!("AAC pulse_start_sfb {start_band} is past the {bands} bands of the window");
    }
    let limit = info.offsets[bands] as u32;
    let mut position = info.offsets[start_band] as u32;
    let mut positions = [0; 4];
    let mut amplitudes = [0; 4];
    for (at, amplitude) in positions.iter_mut().zip(&mut amplitudes).take(count) {
        position += r.u(5); // pulse_offset
        *amplitude = r.u(4) as u8;
        if position >= limit {
            bail!("AAC pulse at line {position} is past the end of the spectrum");
        }
        *at = position as u16;
    }
    sink.pulses(count, positions, amplitudes);
    Ok(())
}

/// `tns_data`. AAC-LC allows filters of order 12 in a long window and 7 in a
/// short one, and the order field is wide enough to say more.
fn tns<S: Sink>(r: &mut BitReader<'_>, info: &IcsInfo, sink: &mut S) -> Result<()> {
    let short = info.short();
    let (windows, max_order) = if short { (8, 7) } else { (1, 12) };
    for window in 0..windows {
        let filters = r.u(if short { 1 } else { 2 }) as usize;
        let resolution = if filters != 0 { r.u(1) } else { 0 };
        sink.tns_window(window, filters, resolution as u8);
        for index in 0..filters {
            let length = r.u(if short { 4 } else { 6 }) as u8;
            let order = r.u(if short { 3 } else { 5 });
            if order > max_order {
                bail!("AAC TNS filter order {order} exceeds {max_order}");
            }
            let mut filter = TnsFilter {
                length,
                order: order as u8,
                ..TnsFilter::default()
            };
            if order != 0 {
                filter.direction = r.flag();
                filter.compress = r.flag();
                let bits = resolution + 3 - filter.compress as u32;
                for coef in &mut filter.coef[..order as usize] {
                    // Two's complement in `bits` bits.
                    *coef = ((r.u(bits) << (32 - bits)) as i32 >> (32 - bits)) as i8;
                }
            }
            sink.tns_filter(window, index, &filter);
        }
    }
    Ok(())
}

fn spectral<S: Sink>(
    r: &mut BitReader<'_>,
    info: &IcsInfo,
    sections: &Sections,
    sink: &mut S,
) -> Result<()> {
    let mut first = 0;
    let mut window = 0;
    for g in 0..info.groups {
        let windows = window..window + info.group_len[g] as usize;
        let end = sections.group_end[g] as usize;
        for section in &sections.list[first..end] {
            let at = (info.offsets, section, windows.clone());
            match section.cb {
                1 | 2 => section_values::<4, false, false, S>(r, at, sink)?,
                3 | 4 => section_values::<4, true, false, S>(r, at, sink)?,
                5 | 6 => section_values::<2, false, false, S>(r, at, sink)?,
                7..=10 => section_values::<2, true, false, S>(r, at, sink)?,
                11 => section_values::<2, true, true, S>(r, at, sink)?,
                _ => {}
            }
        }
        first = end;
        window = windows.end;
    }
    Ok(())
}

/// The spectral values of one section, coded with a book of `N` values a
/// codeword, `UNSIGNED` if it codes magnitudes whose signs follow, `ESCAPE` for
/// book 11. Within a window group the values run band by band, and within a
/// band window by window (ISO/IEC 14496-3 4.6.3.3).
#[inline(always)]
fn section_values<const N: usize, const UNSIGNED: bool, const ESCAPE: bool, S: Sink>(
    r: &mut BitReader<'_>,
    (offsets, section, windows): (&[u16], &Section, std::ops::Range<usize>),
    sink: &mut S,
) -> Result<()> {
    let book = &CODEBOOKS[section.cb as usize];
    for band in section.start as usize..section.end as usize {
        let (low, high) = (offsets[band] as usize, offsets[band + 1] as usize);
        for window in windows.clone() {
            for line in (window * 128 + low..window * 128 + high).step_by(N) {
                let tuple = book.tuples[vlc(r, book)?];
                let mut values = [0i32; N];
                for (value, &coded) in values.iter_mut().zip(&tuple.values) {
                    *value = coded as i32;
                }
                if UNSIGNED {
                    let signs = r.u(tuple.nonzero as u32);
                    let mut left = tuple.nonzero as u32;
                    for value in &mut values {
                        if *value != 0 {
                            left -= 1;
                            if signs >> left & 1 != 0 {
                                *value = -*value;
                            }
                        }
                    }
                }
                if ESCAPE {
                    for (value, &coded) in values.iter_mut().zip(&tuple.values) {
                        if coded == 16 {
                            *value = value.signum() * escape(r)?;
                        }
                    }
                }
                sink.spectral(line, values);
            }
        }
    }
    Ok(())
}

/// The magnitude an escape sequence codes: a prefix of ones, a zero, and as
/// many bits as four more than the ones.
#[inline]
fn escape(r: &mut BitReader<'_>) -> Result<i32> {
    // An escape codes a magnitude below 2^13 in a prefix of at most eight
    // ones; a longer prefix is not a value.
    let mut ones = 0;
    while r.flag() {
        ones += 1;
        if ones > 8 {
            bail!("AAC escape sequence longer than eight ones");
        }
    }
    Ok((1 << (ones + 4)) + r.u(ones + 4) as i32)
}

/// One `individual_channel_stream`. A channel pair whose `common_window` is set
/// shares one `ics_info` between its two channels, and passes it in here rather
/// than letting each read its own.
fn channel_stream<S: Sink>(
    r: &mut BitReader<'_>,
    shared: Option<&IcsInfo>,
    tables: BandTables,
    gains: &mut GlobalGains,
    sink: &mut S,
) -> Result<()> {
    gains.positions[gains.count] = r.bit_pos();
    gains.count += 1;
    let global_gain = r.u(8);
    let info = match shared {
        Some(info) => *info,
        None => ics_info(r, tables)?,
    };
    sink.channel(global_gain as u8, &info);
    let mut sections_of = Sections {
        list: [Section::default(); 128],
        group_end: [0; 8],
    };
    sections(r, &info, &mut sections_of)?;
    scale_factors(r, &info, &sections_of, global_gain, gains, sink)?;
    if r.flag() {
        pulses(r, &info, sink)?;
    }
    if r.flag() {
        tns(r, &info, sink)?;
    }
    if r.flag() {
        bail!("AAC-LC gain_control_data is unsupported");
    }
    spectral(r, &info, &sections_of, sink)
}

/// Bit position just past a one-channel element -- `single_channel_element` or
/// the `lfe_channel_element` that shares its syntax -- starting at `start`.
fn single_channel_end<S: Sink>(
    data: &[u8],
    start: usize,
    tables: BandTables,
    gains: &mut GlobalGains,
    sink: &mut S,
) -> Result<usize> {
    let mut r = BitReader::at_bit(data, start + 7); // id_syn_ele, element_instance_tag
    channel_stream(&mut r, None, tables, gains, sink)?;
    Ok(r.bit_pos())
}

/// Bit position just past the `channel_pair_element` starting at `start`.
fn cpe_end<S: Sink>(
    data: &[u8],
    start: usize,
    tables: BandTables,
    gains: &mut GlobalGains,
    sink: &mut S,
) -> Result<usize> {
    let mut r = BitReader::at_bit(data, start + 7); // id_syn_ele, element_instance_tag
    let shared = if r.flag() {
        // common_window: one ics_info for both channels, and the mid/side mask
        // that only a shared window can carry.
        let info = ics_info(&mut r, tables)?;
        let ms_mask_present = r.u(2) as u8;
        if ms_mask_present == 3 {
            bail!("reserved AAC ms_mask_present at bit {}", r.bit_pos());
        }
        sink.common_window(ms_mask_present);
        if ms_mask_present == 1 {
            for band in 0..info.groups * info.max_sfb {
                sink.ms_used(band, r.flag());
            }
        }
        Some(info)
    } else {
        None
    };
    channel_stream(&mut r, shared.as_ref(), tables, gains, sink)?;
    channel_stream(&mut r, shared.as_ref(), tables, gains, sink)?;
    Ok(r.bit_pos())
}

/// `id_syn_ele` values (ISO/IEC 14496-3 Table 4.85).
pub const ID_SCE: u8 = 0;
pub const ID_CPE: u8 = 1;
pub const ID_CCE: u8 = 2;
pub const ID_LFE: u8 = 3;
pub const ID_DSE: u8 = 4;
pub const ID_PCE: u8 = 5;
pub const ID_FIL: u8 = 6;
pub const ID_END: u8 = 7;

/// One element of a raw_data_block, by the bits it spans.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Element {
    pub id: u8,
    /// `element_instance_tag`; zero for a fill element, which has none.
    pub tag: u8,
    /// The first bit of `id_syn_ele`.
    pub start: usize,
    /// One past the element's last bit.
    pub end: usize,
    /// Where each of the element's channels has its `global_gain`: one for a
    /// single channel or LFE element, two for a channel pair, none otherwise.
    pub global_gains: [Option<usize>; 2],
    /// The largest scalefactor any band of the element reached, or `None`
    /// where no band carried one. A decoder refuses one above 255.
    pub max_scalefactor: Option<i32>,
}

impl Element {
    pub fn is_channel(&self) -> bool {
        matches!(self.id, ID_SCE | ID_CPE | ID_LFE)
    }
}

/// One channel element a `program_config_element` names.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PceElement {
    /// A channel pair rather than a single channel; always false for an LFE.
    pub is_cpe: bool,
    pub tag: u8,
}

/// The channel elements of one position -- front, side, back or LFE -- in the
/// order the `program_config_element` lists them. A count is four bits at
/// most, two for the LFEs.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PceElements {
    len: u8,
    elements: [PceElement; 15],
}

impl PceElements {
    pub fn as_slice(&self) -> &[PceElement] {
        &self.elements[..self.len as usize]
    }

    /// The channels they carry.
    pub fn channels(&self) -> usize {
        self.as_slice()
            .iter()
            .map(|element| 1 + element.is_cpe as usize)
            .sum()
    }

    fn read(r: &mut BitReader<'_>, count: u32, may_pair: bool) -> Self {
        let mut out = Self {
            len: count as u8,
            ..Self::default()
        };
        for element in &mut out.elements[..count as usize] {
            element.is_cpe = may_pair && r.flag();
            element.tag = r.u(4) as u8;
        }
        out
    }
}

/// What a `program_config_element` says.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PceInfo {
    /// The bit `element_instance_tag` starts at, after the `id_syn_ele` a
    /// raw_data_block puts in front of it: where the part of the element an
    /// AudioSpecificConfig carries begins (ISO/IEC 14496-3 table 4.2).
    pub body_start: usize,
    /// One past the channel description, before the byte alignment and the
    /// comment field.
    pub body_end: usize,
    pub channels: u8,
    pub matrix_mixdown_idx_present: bool,
    pub matrix_mixdown_idx: u8,
    pub pseudo_surround_enable: bool,
    pub front: PceElements,
    pub side: PceElements,
    pub back: PceElements,
    pub lfe: PceElements,
}

/// A raw_data_block that has been walked from its first element to `ID_END`.
#[derive(Debug)]
pub struct Block {
    /// Every element before `ID_END`, in stream order.
    pub elements: Vec<Element>,
    /// The last `program_config_element` in front of the first channel element,
    /// which is the one that describes the channels.
    pub pce: Option<PceInfo>,
}

impl Block {
    pub fn channel_elements(&self) -> impl Iterator<Item = &Element> {
        self.elements.iter().filter(|element| element.is_channel())
    }
}

/// Walk the raw_data_block that `data` holds, the whole of it: the one block of
/// an ADTS frame, which ends at `ID_END` and the alignment after it.
///
/// `None` where a decoder would refuse the block -- an element that cannot be
/// read, a value outside what the syntax allows, an element AAC-LC does not
/// have -- or where the block does not fill `data` to the byte. A frame is
/// only as long as its block, so ending early leaves bytes no element owns,
/// and that is how a frame whose end was replaced by another frame's bytes
/// shows itself even when what it ends with happens to walk. Decoders that
/// measure the bytes they consumed against the frame refuse it for the same
/// reason. Every frame of eight broadcast recordings, over nine thousand of
/// them, ends at the last byte of its block.
pub fn walk_block(data: &[u8], frequency_index: u8) -> Option<Block> {
    let mut elements = Vec::new();
    let pce = read_block(data, frequency_index, &mut elements, &mut Walk)?;
    Some(Block { elements, pce })
}

/// Read the raw_data_block in `data` as [`walk_block`] describes, handing every
/// value to `sink` and every element to `elements`, which is cleared first.
/// `None` where a decoder would refuse the block; otherwise the
/// `program_config_element` that describes its channels, if it has one.
pub(crate) fn read_block<S: Sink>(
    data: &[u8],
    frequency_index: u8,
    elements: &mut Vec<Element>,
    sink: &mut S,
) -> Option<Option<PceInfo>> {
    elements.clear();
    let tables = band_tables(frequency_index)?;
    let total = data.len() * 8;
    let mut pce = None;
    let mut at = 0;
    loop {
        if at + 3 > total {
            return None;
        }
        let mut r = BitReader::at_bit(data, at);
        let id = r.u(3) as u8;
        if id == ID_END {
            return ((at + 3).div_ceil(8) == data.len()).then_some(pce);
        }
        let tag = if id == ID_FIL { 0 } else { r.u(4) as u8 };
        let mut gains = GlobalGains::default();
        let end = match id {
            ID_SCE | ID_LFE => {
                sink.channel_element(id, tag);
                single_channel_end(data, at, tables, &mut gains, sink).ok()?
            }
            ID_CPE => {
                sink.channel_element(id, tag);
                cpe_end(data, at, tables, &mut gains, sink).ok()?
            }
            ID_PCE => {
                let (info, end) = program_config_element(data, at + 3);
                if !elements.iter().any(Element::is_channel) {
                    pce = Some(info);
                }
                end
            }
            ID_DSE => data_stream_element_end(data, at),
            ID_FIL => fill_element_end(data, at),
            // A coupling channel element, which no broadcast carries and the
            // repackaging cannot place.
            ID_CCE => return None,
            _ => unreachable!("id_syn_ele is three bits"),
        };
        if end > total {
            return None;
        }
        let mut global_gains = [None; 2];
        for (slot, &position) in global_gains.iter_mut().zip(&gains.positions[..gains.count]) {
            *slot = Some(position);
        }
        elements.push(Element {
            id,
            tag,
            start: at,
            end,
            global_gains,
            max_scalefactor: gains.max_scalefactor,
        });
        at = end;
    }
}

/// The `program_config_element` whose `element_instance_tag` is at `start`,
/// and one past its end. A raw_data_block has the element's `id_syn_ele` in
/// front of that, and an AudioSpecificConfig does not. Whether it fits what it
/// is in is the caller's question.
pub(crate) fn program_config_element(data: &[u8], start: usize) -> (PceInfo, usize) {
    let mut r = BitReader::at_bit(data, start + 4); // element_instance_tag
    r.skip(2 + 4); // object_type, sampling_frequency_index
    let front = r.u(4);
    let side = r.u(4);
    let back = r.u(4);
    let lfe = r.u(2);
    let assoc = r.u(3);
    let cc = r.u(4);
    if r.flag() {
        r.skip(4); // mono_mixdown_element_number
    }
    if r.flag() {
        r.skip(4); // stereo_mixdown_element_number
    }
    let matrix_mixdown_idx_present = r.flag();
    let (matrix_mixdown_idx, pseudo_surround_enable) = if matrix_mixdown_idx_present {
        (r.u(2) as u8, r.flag())
    } else {
        (0, false)
    };
    let front = PceElements::read(&mut r, front, true);
    let side = PceElements::read(&mut r, side, true);
    let back = PceElements::read(&mut r, back, true);
    let lfe = PceElements::read(&mut r, lfe, false);
    let channels = (front.channels() + side.channels() + back.channels() + lfe.channels()) as u8;
    r.skip(assoc * 4 + cc * 5);
    let body_end = r.bit_pos();
    r.align_to_byte();
    let comments = r.u(8);
    r.skip(comments * 8);
    (
        PceInfo {
            body_start: start,
            body_end,
            channels,
            matrix_mixdown_idx_present,
            matrix_mixdown_idx,
            pseudo_surround_enable,
            front,
            side,
            back,
            lfe,
        },
        r.bit_pos(),
    )
}

/// One past a `data_stream_element`, which is byte-counted like a fill element
/// and may align its bytes first.
fn data_stream_element_end(data: &[u8], start: usize) -> usize {
    let mut r = BitReader::at_bit(data, start + 7); // id_syn_ele, element_instance_tag
    let aligned = r.flag();
    let mut count = r.u(8);
    if count == 255 {
        count += r.u(8);
    }
    if aligned {
        r.align_to_byte();
    }
    r.bit_pos() + count as usize * 8
}

/// One past a `fill_element`.
fn fill_element_end(data: &[u8], start: usize) -> usize {
    let mut r = BitReader::at_bit(data, start + 3);
    let mut count = r.u(4) as usize;
    if count == 15 {
        // `cnt = count + esc_count - 1`, and `count` is 15 to have got here, so
        // the escape spans fourteen bytes upwards. Fourteen is the one length
        // both forms can write, and an encoder that writes it the long way was
        // costing a byte here, which walked the element past the end of the
        // block it was in.
        count = 14 + r.u(8) as usize;
    }
    r.bit_pos() + count * 8
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Every codeword of every book reads back as its own index and length,
    /// whatever follows it in the stream.
    #[test]
    fn every_codeword_is_found_by_the_lookup() {
        for book in CODEBOOKS.iter() {
            for code in book.codes {
                for filler in [0u32, u32::MAX] {
                    let len = code.len as u32;
                    let word = code.bits << (32 - len) | filler >> len;
                    let data = word.to_be_bytes();
                    let mut r = BitReader::at_bit(&data, 0);
                    assert_eq!(vlc(&mut r, book).unwrap(), code.index as usize);
                    assert_eq!(r.bit_pos(), len as usize);
                }
            }
        }
    }

    /// A bit string under construction, with codewords taken from the books.
    #[derive(Default)]
    pub(crate) struct Bits {
        pub bytes: Vec<u8>,
        pub len: usize,
    }

    impl Bits {
        pub fn put(&mut self, count: usize, value: u32) -> &mut Self {
            for shift in (0..count).rev() {
                if self.len % 8 == 0 {
                    self.bytes.push(0);
                }
                // Bits above the value's 32 are zeros.
                if shift < 32 && (value >> shift) & 1 != 0 {
                    *self.bytes.last_mut().unwrap() |= 0x80 >> (self.len % 8);
                }
                self.len += 1;
            }
            self
        }

        pub fn code(&mut self, book: &[AacVlc], index: usize) -> &mut Self {
            let code = book
                .iter()
                .find(|code| code.index as usize == index)
                .unwrap();
            self.put(code.len as usize, code.bits)
        }

        /// `ID_END` and the alignment after it.
        pub fn end(&mut self) -> Vec<u8> {
            self.put(3, ID_END as u32);
            std::mem::take(&mut self.bytes)
        }
    }

    /// A single channel element whose long-window stream codes band 0 with
    /// `book`, its scalefactor `delta` from `global_gain`, `tools` writing the
    /// pulse and TNS flags and data, and `spectrum` the band's coefficients.
    fn sce(
        global_gain: u32,
        book: u32,
        delta: i32,
        tools: impl FnOnce(&mut Bits),
        spectrum: impl FnOnce(&mut Bits),
    ) -> Vec<u8> {
        let mut bits = Bits::default();
        bits.put(3, ID_SCE as u32).put(4, 0).put(8, global_gain);
        // ics_reserved_bit, ONLY_LONG_SEQUENCE, window_shape, max_sfb 1, no
        // predictor; then one section of band 0.
        bits.put(1, 0).put(2, 0).put(1, 0).put(6, 1).put(1, 0);
        bits.put(4, book).put(5, 1);
        bits.code(&SCALEFACTORS, (60 + delta) as usize);
        tools(&mut bits);
        bits.put(1, 0); // gain_control_data_present
        spectrum(&mut bits);
        bits.end()
    }

    /// Band 0 at 48 kHz is four lines: one all-zero quad of book 1.
    fn zero_quad(bits: &mut Bits) {
        bits.code(&SPECTRAL_1, 40);
    }

    fn no_tools(bits: &mut Bits) {
        bits.put(1, 0).put(1, 0); // pulse_data_present, tns_data_present
    }

    #[test]
    fn walks_a_block_a_decoder_reads() {
        let block = walk_block(&sce(100, 1, 0, no_tools, zero_quad), 3).expect("walks");
        assert_eq!(block.elements.len(), 1);
        assert_eq!(block.elements[0].global_gains, [Some(7), None]);
        assert_eq!(block.elements[0].max_scalefactor, Some(100));
    }

    #[test]
    fn refuses_a_set_ics_reserved_bit() {
        let mut bits = Bits::default();
        bits.put(3, ID_SCE as u32).put(4, 0).put(8, 100);
        bits.put(1, 1).put(2, 0).put(1, 0).put(6, 0).put(1, 0);
        bits.put(1, 0).put(1, 0).put(1, 0);
        assert!(walk_block(&bits.end(), 3).is_none());
    }

    /// A decoder refuses a band scalefactor outside 0..=255.
    #[test]
    fn refuses_a_scalefactor_a_decoder_refuses() {
        assert!(walk_block(&sce(250, 1, 5, no_tools, zero_quad), 3).is_some());
        assert!(walk_block(&sce(250, 1, 6, no_tools, zero_quad), 3).is_none());
        assert!(walk_block(&sce(3, 1, -4, no_tools, zero_quad), 3).is_none());
    }

    /// AAC-LC filters are of order 12 at most in a long window.
    #[test]
    fn refuses_a_tns_filter_of_too_high_an_order() {
        let tns = |order: u32| {
            move |bits: &mut Bits| {
                bits.put(1, 0).put(1, 1); // no pulse data, TNS data
                bits.put(2, 1).put(1, 0); // one filter, coef_res 0
                bits.put(6, 1).put(5, order); // length, order
                bits.put(1, 0).put(1, 0); // direction, coef_compress
                bits.put(order as usize * 3, 0);
            }
        };
        assert!(walk_block(&sce(100, 1, 0, tns(12), zero_quad), 3).is_some());
        assert!(walk_block(&sce(100, 1, 0, tns(13), zero_quad), 3).is_none());
    }

    /// Pulses have to start at a band the window has and land inside the
    /// spectrum.
    #[test]
    fn refuses_pulses_outside_the_spectrum() {
        let pulses = |count: u32, start: u32, offset: u32| {
            move |bits: &mut Bits| {
                bits.put(1, 1).put(2, count - 1).put(6, start);
                for _ in 0..count {
                    bits.put(5, offset).put(4, 1);
                }
                bits.put(1, 0); // tns_data_present
            }
        };
        assert!(walk_block(&sce(100, 1, 0, pulses(1, 0, 3), zero_quad), 3).is_some());
        // 48 kHz has 49 long bands.
        assert!(walk_block(&sce(100, 1, 0, pulses(1, 49, 0), zero_quad), 3).is_none());
        // Band 48 starts at line 928, and four offsets of 31 reach 1052.
        assert!(walk_block(&sce(100, 1, 0, pulses(4, 48, 31), zero_quad), 3).is_none());
    }

    #[test]
    fn refuses_pulses_in_a_short_window() {
        let mut bits = Bits::default();
        bits.put(3, ID_SCE as u32).put(4, 0).put(8, 100);
        // EIGHT_SHORT_SEQUENCE, max_sfb 0, no grouping; then pulse data.
        bits.put(1, 0).put(2, 2).put(1, 0).put(4, 0).put(7, 0);
        bits.put(1, 1).put(2, 0).put(6, 0).put(5, 0).put(4, 1);
        bits.put(1, 0).put(1, 0);
        assert!(walk_block(&bits.end(), 3).is_none());
    }

    /// An escape is a prefix of at most eight ones.
    #[test]
    fn refuses_an_escape_longer_than_eight_ones() {
        let escape = |ones: usize| {
            move |bits: &mut Bits| {
                bits.code(&SPECTRAL_11, 16 * 17); // the pair (16, 0)
                bits.put(1, 0); // its one sign bit
                bits.put(ones, u32::MAX).put(1, 0).put(ones + 4, 0);
                bits.code(&SPECTRAL_11, 0); // the pair (0, 0)
            }
        };
        assert!(walk_block(&sce(100, 11, 0, no_tools, escape(8)), 3).is_some());
        assert!(walk_block(&sce(100, 11, 0, no_tools, escape(9)), 3).is_none());
    }

    /// `max_sfb` is held to the bands of the rate's own table: 51 at 32 kHz,
    /// 49 at 48 kHz.
    #[test]
    fn holds_max_sfb_to_the_bands_of_the_rate() {
        let mut bits = Bits::default();
        bits.put(3, ID_SCE as u32).put(4, 0).put(8, 100);
        bits.put(1, 0).put(2, 0).put(1, 0).put(6, 51).put(1, 0);
        // One section of the zero book over all 51 bands: 31 and then 20.
        bits.put(4, 0).put(5, 31).put(5, 20);
        bits.put(1, 0).put(1, 0).put(1, 0);
        let block = bits.end();
        assert!(walk_block(&block, 5).is_some());
        assert!(walk_block(&block, 3).is_none());
    }

    /// The tables have the band counts of ISO/IEC 14496-3, and each runs from
    /// the first line to the window's length.
    #[test]
    fn has_the_bands_of_every_sampling_rate() {
        const LONG: [usize; 13] = [41, 41, 47, 49, 49, 51, 47, 47, 43, 43, 43, 40, 40];
        const SHORT: [usize; 13] = [12, 12, 12, 14, 14, 14, 15, 15, 15, 15, 15, 15, 15];
        for index in 0..13u8 {
            let (long, short) = band_tables(index).expect("a rate");
            for (table, bands, length) in [(long, LONG, 1024), (short, SHORT, 128)] {
                assert_eq!(band_count(table), bands[index as usize], "index {index}");
                assert_eq!((table[0], *table.last().unwrap()), (0, length));
                assert!(table.windows(2).all(|pair| pair[0] < pair[1]));
            }
        }
        assert!(band_tables(13).is_none());
    }

    #[test]
    fn steps_over_a_data_stream_element() {
        for aligned in [0, 1] {
            let mut bits = Bits::default();
            bits.put(3, ID_SCE as u32).put(4, 0).put(22, 0);
            bits.put(3, ID_DSE as u32)
                .put(4, 0)
                .put(1, aligned)
                .put(8, 2);
            if aligned == 1 {
                let pad = (8 - bits.len % 8) % 8;
                bits.put(pad, 0);
            }
            bits.put(16, 0xabcd);
            let block = walk_block(&bits.end(), 3).expect("the DSE is stepped over");
            let ids: Vec<u8> = block.elements.iter().map(|element| element.id).collect();
            assert_eq!(ids, [ID_SCE, ID_DSE]);
        }
    }

    #[test]
    fn refuses_a_coupling_channel_element() {
        let mut bits = Bits::default();
        bits.put(3, ID_CCE as u32).put(4, 0).put(22, 0);
        assert!(walk_block(&bits.end(), 3).is_none());
    }

    /// A block that ends at `ID_END` with whole bytes still after it is not the
    /// block of the frame it is in.
    #[test]
    fn refuses_a_block_with_bytes_after_it() {
        let mut block = sce(100, 1, 0, no_tools, zero_quad);
        assert!(walk_block(&block, 3).is_some());
        block.push(0);
        assert!(walk_block(&block, 3).is_none());
    }

    /// A fill element whose escape count the block ends inside is refused,
    /// not read past the end of the data.
    #[test]
    fn refuses_a_fill_element_cut_inside_its_count() {
        assert!(walk_block(&[0xde], 3).is_none());
    }
}
