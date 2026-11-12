//! Inverse quantisation of one block (H.262 7.4).

use crate::mpeg2::decode::idct::Block;

/// Fill `block` from the quantised levels the parser left in raster order.
/// Only the positions `mask` names are read; `block` must be clear on entry
/// (see [`Block::clear`]).
///
/// `intra_dc_mult` is used for position 0 of intra blocks only (7.4.1).
/// `matrix` is the weighting matrix in raster order and `quantiser_scale`
/// the value from Table 7-6. Every result is saturated to [-2048, 2047]
/// (7.4.3), then mismatch control (7.4.4) toggles the least significant bit
/// of F[7][7] when the sum of all coefficients is even.
#[inline(never)]
pub(crate) fn dequantise(
    levels: &[i16; 64],
    mask: u64,
    intra: bool,
    intra_dc_mult: i32,
    matrix: &[i32; 64],
    quantiser_scale: i32,
    block: &mut Block,
) {
    let mut parity = 0i32;
    let mut rows = 0u8;
    let mut columns = 0u8;
    let mut last = 0i32;
    let mut remaining = mask;
    while remaining != 0 {
        let p = remaining.trailing_zeros() as usize;
        remaining &= remaining - 1;
        let level = levels[p] as i32;
        // The widest product is (2 * 32767 + 1) * 255 * 112, inside i32.
        let value = if intra {
            if p == 0 {
                intra_dc_mult * level
            } else {
                level * 2 * matrix[p] * quantiser_scale / 32
            }
        } else {
            (level * 2 + level.signum()) * matrix[p] * quantiser_scale / 32
        }
        .clamp(-2048, 2047);
        parity ^= value;
        if p == 63 {
            last = value;
        } else {
            block.values[p] = value;
            rows |= 1 << (p >> 3);
            columns |= 1 << (p & 7);
        }
    }
    if parity & 1 == 0 {
        last ^= 1;
    }
    block.rows = rows;
    block.columns = columns;
    block.last = last;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mpeg2::constants::{DEFAULT_INTRA_QUANT, QUANTISER_SCALE};

    fn levels_at(entries: &[(usize, i16)]) -> ([i16; 64], u64) {
        let mut levels = [0i16; 64];
        let mut mask = 0u64;
        for &(p, level) in entries {
            levels[p] = level;
            mask |= 1 << p;
        }
        (levels, mask)
    }

    fn run(
        entries: &[(usize, i16)],
        intra: bool,
        dc_mult: i32,
        matrix: &[i32; 64],
        qs: i32,
    ) -> ([i32; 64], u8, u8) {
        let (levels, mask) = levels_at(entries);
        let mut block = Block::new();
        dequantise(&levels, mask, intra, dc_mult, matrix, qs, &mut block);
        let mut out = block.values;
        out[63] = block.last;
        (out, block.rows, block.columns)
    }

    /// 7.4.5 written out directly, over all 64 positions.
    fn reference(
        entries: &[(usize, i16)],
        intra: bool,
        dc_mult: i32,
        matrix: &[i32; 64],
        qs: i32,
    ) -> [i32; 64] {
        let (levels, _) = levels_at(entries);
        let mut f = [0i32; 64];
        let mut sum = 0i32;
        for p in 0..64 {
            let qf = levels[p] as i32;
            let value = if intra && p == 0 {
                dc_mult * qf
            } else if intra {
                (qf * matrix[p] * qs * 2) / 32
            } else {
                ((qf * 2 + qf.signum()) * matrix[p] * qs) / 32
            };
            f[p] = value.clamp(-2048, 2047);
            sum += f[p];
        }
        if sum & 1 == 0 {
            f[63] = if f[63] & 1 != 0 { f[63] - 1 } else { f[63] + 1 };
        }
        f
    }

    #[test]
    fn intra_dc_uses_the_precision_multiplier() {
        for (precision, mult) in [(0, 8), (1, 4), (2, 2), (3, 1)] {
            let (out, rows, columns) = run(&[(0, 100)], true, mult, &DEFAULT_INTRA_QUANT, 2);
            assert_eq!(out[0], 100 * mult, "precision {precision}");
            assert_eq!((rows, columns), (1, 1));
        }
    }

    #[test]
    fn saturates_both_ends() {
        let flat = [16i32; 64];
        let (out, _, _) = run(&[(1, 2047), (2, -2047), (0, 1000)], false, 8, &flat, 112);
        assert_eq!(out[1], 2047);
        assert_eq!(out[2], -2048);
        assert_eq!(out[0], 2047);
        let (out, _, _) = run(&[(0, 2047)], true, 8, &DEFAULT_INTRA_QUANT, 2);
        assert_eq!(out[0], 2047);
    }

    #[test]
    fn mismatch_control_toggles_the_last_coefficient() {
        let flat = [16i32; 64];
        // Odd sum: untouched.
        let (out, _, _) = run(&[(0, 1)], true, 1, &flat, 2);
        assert_eq!(out[63], 0);
        // Even sum, F'[7][7] = 0 becomes 1.
        let (out, _, _) = run(&[(0, 2)], true, 1, &flat, 2);
        assert_eq!(out[63], 1);
        // Even sum, odd F'[7][7]: one less. Non-intra level 1 at q 2 gives
        // (2 + 1) * 16 * 2 / 32 = 3, so 3 + 3 is even and 3 becomes 2.
        let (out, _, _) = run(&[(63, 1), (0, 1)], false, 8, &flat, 2);
        assert_eq!(out[0], 3);
        assert_eq!(out[63], 2);
        // Negative odd: -3 + 3 is even, and -3 becomes -4.
        let (out, _, _) = run(&[(63, -1), (0, 1)], false, 8, &flat, 2);
        assert_eq!(out[63], -4);
        // Even F'[7][7]: one more. (-3) * 22 / 32 truncates to -2, and
        // (5 * 16) / 32 to 2, so the sum is 0 and -2 becomes -1.
        let mut matrix = flat;
        matrix[63] = 22;
        let (out, _, _) = run(&[(63, -1), (0, 2)], false, 8, &matrix, 1);
        assert_eq!((out[0], out[63]), (2, -1));
        assert_eq!(out, reference(&[(63, -1), (0, 2)], false, 8, &matrix, 1));
    }

    #[test]
    fn non_linear_scale_and_truncation_match_the_formula() {
        let mut random = 12345u32;
        let mut next = move || {
            random = random.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            random >> 8
        };
        let mut matrix = [0i32; 64];
        for m in matrix.iter_mut() {
            *m = 1 + (next() % 255) as i32;
        }
        for q_scale_type in 0..2 {
            for code in 1..32 {
                let qs = QUANTISER_SCALE[q_scale_type][code];
                for intra in [false, true] {
                    let mut entries = Vec::new();
                    for p in 0..64 {
                        if next() % 3 == 0 {
                            let level = (next() % 4095) as i32 - 2047;
                            entries.push((p, level as i16));
                        }
                    }
                    let (out, rows, columns) = run(&entries, intra, 4, &matrix, qs);
                    assert_eq!(out, reference(&entries, intra, 4, &matrix, qs));
                    for &(p, _) in &entries {
                        if p != 63 {
                            assert!(rows & (1 << (p / 8)) != 0 && columns & (1 << (p % 8)) != 0);
                        }
                    }
                }
            }
        }
    }
}
