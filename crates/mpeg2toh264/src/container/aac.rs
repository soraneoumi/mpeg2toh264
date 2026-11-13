//! AAC-LC syntax walking used to locate channel-element bit ranges.

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
pub struct GlobalGains {
    /// The bit position of every channel's `global_gain`, in stream order.
    pub positions: Vec<usize>,
    /// The largest scalefactor any band reached, or `None` where no band
    /// carried one.
    pub max_scalefactor: Option<i32>,
}

#[derive(Clone)]
struct IcsInfo {
    short: bool,
    max_sfb: usize,
    group_len: Vec<usize>,
}

#[derive(Clone, Copy)]
struct Section {
    cb: u8,
    start: usize,
    end: usize,
}

const SWB_LONG_48: &[usize] = &[
    0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96, 108, 120, 132, 144, 160,
    176, 196, 216, 240, 264, 292, 320, 352, 384, 416, 448, 480, 512, 544, 576, 608, 640, 672, 704,
    736, 768, 800, 832, 864, 896, 928, 1024,
];
const SWB_SHORT_48: &[usize] = &[0, 4, 8, 12, 16, 20, 28, 36, 44, 56, 68, 80, 96, 112, 128];

/// How many bits of the stream the first lookup of a codebook goes by. Most
/// of the codewords a frame is made of are no longer.
const LOOKUP_BITS: u32 = 10;
/// The longest codeword of any book.
const LONGEST_CODE: u32 = 19;

/// A codebook, with its shorter codewords laid out to be found in one read.
struct Codebook {
    /// By the next `LOOKUP_BITS` bits of the stream: the length of the
    /// codeword they begin with in the low five bits and its index above
    /// them, or zero where that codeword is longer or there is none.
    short: [u16; 1 << LOOKUP_BITS],
    /// Every codeword, in order of length and then of value.
    codes: &'static [AacVlc],
}

impl Codebook {
    fn new(codes: &'static [AacVlc]) -> Self {
        let mut short = [0; 1 << LOOKUP_BITS];
        for code in codes {
            let len = code.len as u32;
            if len <= LOOKUP_BITS {
                let first = (code.bits << (LOOKUP_BITS - len)) as usize;
                short[first..first + (1 << (LOOKUP_BITS - len))]
                    .fill(code.index << 5 | code.len as u16);
            }
        }
        Self { short, codes }
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
    books.map(Codebook::new)
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

fn ics_info(r: &mut BitReader<'_>) -> Result<IcsInfo> {
    r.skip(1); // ics_reserved_bit
    let sequence = r.u(2);
    r.skip(1); // window_shape
    if sequence == 2 {
        let max_sfb = r.u(4) as usize;
        let grouping = r.u(7);
        let mut groups = vec![1usize];
        for bit in (0..7).rev() {
            if grouping & (1 << bit) != 0 {
                *groups.last_mut().unwrap() += 1;
            } else {
                groups.push(1);
            }
        }
        if max_sfb >= SWB_SHORT_48.len() {
            bail!("AAC short-window max_sfb {max_sfb} exceeds the 48 kHz table");
        }
        Ok(IcsInfo {
            short: true,
            max_sfb,
            group_len: groups,
        })
    } else {
        let max_sfb = r.u(6) as usize;
        if r.flag() {
            bail!("AAC-LC predictor_data_present is unsupported");
        }
        if max_sfb >= SWB_LONG_48.len() {
            bail!("AAC long-window max_sfb {max_sfb} exceeds the 48 kHz table");
        }
        Ok(IcsInfo {
            short: false,
            max_sfb,
            group_len: vec![1],
        })
    }
}

fn sections(r: &mut BitReader<'_>, info: &IcsInfo) -> Result<Vec<Vec<Section>>> {
    let len_bits = if info.short { 3 } else { 5 };
    let escape = (1usize << len_bits) - 1;
    let mut groups = Vec::new();
    for _ in &info.group_len {
        let mut at = 0;
        let mut group = Vec::new();
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
            group.push(Section {
                cb,
                start: at,
                end: at + length,
            });
            at += length;
        }
        groups.push(group);
    }
    Ok(groups)
}

fn scale_factors(
    r: &mut BitReader<'_>,
    info: &IcsInfo,
    sections: &[Vec<Section>],
    global_gain: u32,
    gains: &mut GlobalGains,
) -> Result<()> {
    let mut first_noise = true;
    // Only the spectral bands' scalefactors run on from `global_gain` and are
    // held to 0..=255. Noise energies and intensity positions are differences
    // of their own.
    let mut scalefactor = global_gain as i32;
    for group in sections.iter().take(info.group_len.len()) {
        for section in group {
            for _ in section.start..section.end {
                match section.cb {
                    0 => {}
                    13 if first_noise => {
                        r.skip(9);
                        first_noise = false;
                    }
                    1..=11 => {
                        scalefactor += vlc(r, scalefactor_book())? as i32 - 60;
                        gains.max_scalefactor = Some(
                            gains
                                .max_scalefactor
                                .map_or(scalefactor, |m| m.max(scalefactor)),
                        );
                    }
                    13..=15 => {
                        vlc(r, scalefactor_book())?;
                    }
                    _ => bail!("unsupported AAC scalefactor codebook {}", section.cb),
                }
            }
        }
    }
    Ok(())
}

fn tns(r: &mut BitReader<'_>, info: &IcsInfo) {
    let windows = if info.short { 8 } else { 1 };
    for _ in 0..windows {
        let filters = r.u(if info.short { 1 } else { 2 });
        let resolution = if filters != 0 { r.u(1) } else { 0 };
        for _ in 0..filters {
            r.skip(if info.short { 4 } else { 6 });
            let order = r.u(if info.short { 3 } else { 5 });
            if order != 0 {
                r.skip(1);
                let compress = r.u(1);
                r.skip(order * (resolution + 3 - compress));
            }
        }
    }
}

fn spectral(r: &mut BitReader<'_>, info: &IcsInfo, groups: &[Vec<Section>]) -> Result<()> {
    let offsets = if info.short {
        SWB_SHORT_48
    } else {
        SWB_LONG_48
    };
    for (g, sections) in groups.iter().enumerate() {
        for section in sections {
            if !matches!(section.cb, 1..=11) {
                continue;
            }
            let (unsigned, dimension, lav) = match section.cb {
                1 | 2 => (false, 4, 1),
                3 | 4 => (true, 4, 2),
                5 | 6 => (false, 2, 4),
                7 | 8 => (true, 2, 7),
                9 | 10 => (true, 2, 12),
                11 => (true, 2, 16),
                _ => unreachable!(),
            };
            let book = &CODEBOOKS[section.cb as usize];
            let coefficients = (offsets[section.end] - offsets[section.start]) * info.group_len[g];
            for _ in 0..coefficients / dimension {
                let mut index = vlc(r, book)?;
                let radix = if unsigned { lav + 1 } else { 2 * lav + 1 };
                let mut values = [0usize; 4];
                for value in values[..dimension].iter_mut().rev() {
                    *value = index % radix;
                    index /= radix;
                }
                if unsigned {
                    r.skip(values[..dimension].iter().filter(|&&v| v != 0).count() as u32);
                }
                if section.cb == 11 {
                    for _ in values[..dimension].iter().filter(|&&v| v == 16) {
                        let mut ones = 0;
                        while r.flag() {
                            ones += 1;
                        }
                        r.skip(ones + 4);
                    }
                }
            }
        }
    }
    Ok(())
}

/// One `individual_channel_stream`. A channel pair whose `common_window` is set
/// shares one `ics_info` between its two channels, and passes it in here rather
/// than letting each read its own.
fn skip_ics_sharing(
    r: &mut BitReader<'_>,
    shared: Option<&IcsInfo>,
    gains: &mut GlobalGains,
) -> Result<()> {
    gains.positions.push(r.bit_pos());
    let global_gain = r.u(8);
    let owned;
    let info = match shared {
        Some(info) => info,
        None => {
            owned = ics_info(r)?;
            &owned
        }
    };
    let sections = sections(r, info)?;
    scale_factors(r, info, &sections, global_gain, gains)?;
    if r.flag() {
        let pulses = r.u(2) + 1;
        r.skip(6 + pulses * 9);
    }
    if r.flag() {
        tns(r, info);
    }
    if r.flag() {
        bail!("AAC-LC gain_control_data is unsupported");
    }
    spectral(r, info, &sections)
}

fn skip_ics(r: &mut BitReader<'_>, gains: &mut GlobalGains) -> Result<()> {
    skip_ics_sharing(r, None, gains)
}

/// Bit position just past a one-channel element -- `single_channel_element` or
/// the `lfe_channel_element` that shares its syntax -- starting at `start`.
/// What the walk learns about the channel's level goes into `gains`.
pub fn single_channel_end(
    data: &[u8],
    start: usize,
    frequency_index: u8,
    id: u32,
    gains: &mut GlobalGains,
) -> Result<usize> {
    if frequency_index != 3 && frequency_index != 4 {
        bail!("AAC channel element walking currently requires 44.1 or 48 kHz");
    }
    let mut r = BitReader::at_bit(data, start);
    if r.u(3) != id {
        bail!("expected AAC element {id} at bit {start}");
    }
    r.skip(4); // element_instance_tag
    skip_ics(&mut r, gains)?;
    if r.bits_left() < 0 {
        bail!("AAC element {id} overruns its raw_data_block");
    }
    Ok(r.bit_pos())
}

pub fn sce_end(
    data: &[u8],
    start: usize,
    frequency_index: u8,
    gains: &mut GlobalGains,
) -> Result<usize> {
    single_channel_end(data, start, frequency_index, 0, gains)
}

/// Bit position just past the `channel_pair_element` starting at `start`.
pub fn cpe_end(
    data: &[u8],
    start: usize,
    frequency_index: u8,
    gains: &mut GlobalGains,
) -> Result<usize> {
    if frequency_index != 3 && frequency_index != 4 {
        bail!("AAC CPE walking currently requires 44.1 or 48 kHz");
    }
    let mut r = BitReader::at_bit(data, start);
    if r.u(3) != 1 {
        bail!("expected AAC CPE at bit {start}");
    }
    r.skip(4); // element_instance_tag
    let shared = if r.flag() {
        // common_window: one ics_info for both channels, and the mid/side mask
        // that only a shared window can carry.
        let info = ics_info(&mut r)?;
        match r.u(2) {
            0 | 2 => {}
            1 => {
                r.skip((info.group_len.len() * info.max_sfb) as u32);
            }
            _ => bail!("reserved AAC ms_mask_present at bit {}", r.bit_pos()),
        }
        Some(info)
    } else {
        None
    };
    skip_ics_sharing(&mut r, shared.as_ref(), gains)?;
    skip_ics_sharing(&mut r, shared.as_ref(), gains)?;
    if r.bits_left() < 0 {
        bail!("AAC CPE overruns its raw_data_block");
    }
    Ok(r.bit_pos())
}

#[cfg(test)]
mod tests {
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
}
