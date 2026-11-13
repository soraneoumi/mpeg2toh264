//! Inverse quantisation of coefficients as they are decoded (H.262 7.4).

/// The parameters of 7.4 for one macroblock.
///
/// `matrix` is the weighting matrix in raster order and `scale` the
/// `quantiser_scale` from Table 7-6. Every result is saturated to
/// [-2048, 2047] (7.4.3). The widest product is (2 * 32767 + 1) * 255 * 112,
/// inside i32.
#[derive(Clone, Copy)]
pub(crate) struct Dequantiser<'a> {
    pub matrix: &'a [i32; 64],
    pub scale: i32,
    /// Multiplier of the DC level of intra blocks (7.4.1).
    pub dc_mult: i32,
}

impl Dequantiser<'_> {
    /// F[0][0] of an intra block.
    #[inline(always)]
    pub fn intra_dc(&self, level: i32) -> i32 {
        (self.dc_mult * level).clamp(-2048, 2047)
    }

    /// A coefficient other than the DC of an intra block, at raster position
    /// `p`: `factor` is `2 * level` in an intra block and
    /// `2 * level + sign(level)` in the others (7.4.2.3).
    #[inline(always)]
    pub fn weigh(&self, p: usize, factor: i32) -> i32 {
        (factor * self.matrix[p] * self.scale / 32).clamp(-2048, 2047)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mpeg2::constants::{DEFAULT_INTRA_QUANT, QUANTISER_SCALE};
    use crate::mpeg2::decode::idct::Block;

    fn levels_at(entries: &[(usize, i16)]) -> [i16; 64] {
        let mut levels = [0i16; 64];
        for &(p, level) in entries {
            levels[p] = level;
        }
        levels
    }

    fn run(
        entries: &[(usize, i16)],
        intra: bool,
        dc_mult: i32,
        matrix: &[i32; 64],
        qs: i32,
    ) -> ([i32; 64], u8, u8) {
        let dequantiser = Dequantiser {
            matrix,
            scale: qs,
            dc_mult,
        };
        let mut block = Block::new();
        let (mut written, mut parity) = (0u64, 0i32);
        for &(p, level) in entries {
            let level = level as i32;
            let value = if !intra {
                dequantiser.weigh(p, 2 * level + level.signum())
            } else if p == 0 {
                dequantiser.intra_dc(level)
            } else {
                dequantiser.weigh(p, 2 * level)
            };
            block.values[p] = value;
            written |= 1 << p;
            parity ^= value;
        }
        block.seal(written, parity);
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
        let levels = levels_at(entries);
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
