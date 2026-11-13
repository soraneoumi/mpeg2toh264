//! 8x8 inverse DCT (H.262 Annex A) in integer arithmetic.
//!
//! Separable: a horizontal pass over the rows that hold coefficients, then a
//! vertical pass over all eight columns at once. Each 1-D transform uses the
//! even/odd split of the inverse DCT matrix: the even inputs go through a
//! 4-point transform (two butterflies and one rotation), the odd inputs
//! through the 4x4 matrix of odd cosines, and the outputs are their sum and
//! difference. That is 22 multiplications per 1-D transform, with the
//! constants rounded to 14 fractional bits in the horizontal pass and 13 in
//! the vertical one, and 4 fractional bits kept in between.
//!
//! F[7][7] does not go through the separable passes. Mismatch control
//! (7.4.4) sets it to +-1 in most blocks, which would otherwise force the
//! full transform on every row and column; its basis function is instead
//! added once from a table before the final rounding.
//!
//! Accuracy: meets IEEE Std 1180-1990 (see the test at the end of the file).

use std::ops::{Add, Mul, Sub};

/// Fractional bits of the cosine constants of the horizontal pass.
const ROW_BITS: u32 = 14;
/// Fractional bits of the cosine constants of the vertical pass.
const COLUMN_BITS: u32 = 13;
/// Fractional bits kept between the two passes.
const PASS_BITS: u32 = 4;
const ROW_SHIFT: u32 = ROW_BITS - PASS_BITS;
const COLUMN_SHIFT: u32 = COLUMN_BITS + PASS_BITS;
const ROW_ROUND: i32 = 1 << (ROW_SHIFT - 1);
const COLUMN_ROUND: i32 = 1 << (COLUMN_SHIFT - 1);

/// `round(2^14 * cos(k * pi / 16) / 2)` at `[k]`; `[0]` is unused.
const ROW_K: [i32; 8] = [0, 8035, 7568, 6811, 5793, 4551, 3135, 1598];
/// The same at 2^13.
const COLUMN_K: [i32; 8] = [0, 4017, 3784, 3406, 2896, 2276, 1567, 799];

/// `round(2^17 * cos(7 (2x + 1) pi / 16) * cos(7 (2y + 1) pi / 16) / 4)`
/// at `[y * 8 + x]`: the output of a unit F[7][7], at the scale of the
/// vertical pass.
#[rustfmt::skip]
const LAST_BASIS: [i32; 64] = [
    1247, -3552, 5315, -6270, 6270, -5315, 3552, -1247,
    -3552, 10114, -15137, 17855, -17855, 15137, -10114, 3552,
    5315, -15137, 22654, -26722, 26722, -22654, 15137, -5315,
    -6270, 17855, -26722, 31521, -31521, 26722, -17855, 6270,
    6270, -17855, 26722, -31521, 31521, -26722, 17855, -6270,
    -5315, 15137, -22654, 26722, -26722, 22654, -15137, 5315,
    3552, -10114, 15137, -17855, 17855, -15137, 10114, -3552,
    -1247, 3552, -5315, 6270, -6270, 5315, -3552, 1247,
];

/// Dequantised coefficients of one block, ready for [`idct_put`] or
/// [`idct_add`].
///
/// Every value must lie in [-2048, 2048], which saturation (7.4.3) and
/// mismatch control guarantee. With that bound no intermediate of either pass
/// can leave i32: the 1-D gain is at most 2.65, so the horizontal pass stays
/// under 2^27 and the vertical pass, F[7][7] included, under 1.95 * 2^30.
pub(crate) struct Block {
    /// Raster order. Index 63 is zero once the block is sealed: F[7][7] is
    /// `last`.
    pub values: [i32; 64],
    /// Bit `v` set when row `v` of `values` may be non-zero.
    pub rows: u8,
    /// Bit `u` set when column `u` of `values` may be non-zero in any row.
    pub columns: u8,
    /// F[7][7].
    pub last: i32,
    /// Bit `p` set for every raster position of `values` that holds a
    /// coefficient and has to be cleared again.
    pub written: u64,
}

impl Block {
    pub fn new() -> Self {
        Self {
            values: [0; 64],
            rows: 0,
            columns: 0,
            last: 0,
            written: 0,
        }
    }

    /// Complete a block whose coefficients were stored into `values` at the
    /// raster positions `written` names, position 63 included, and whose
    /// values XOR to `parity`: take F[7][7] out of `values`, apply mismatch
    /// control (7.4.4), which toggles its least significant bit when the sum
    /// of all coefficients is even, and note which rows and columns are in
    /// use.
    ///
    /// The row and column sets come from the position mask in a few
    /// operations here rather than two more per coefficient where it is
    /// stored.
    #[inline(always)]
    pub fn seal(&mut self, written: u64, parity: i32) {
        const LOW_SEVEN: u64 = 0x7f7f_7f7f_7f7f_7f7f;
        let mut last = 0;
        if written >> 63 != 0 {
            last = self.values[63];
            self.values[63] = 0;
        }
        if parity & 1 == 0 {
            last ^= 1;
        }
        let body = written & !(1 << 63);
        // Bit 7 of each byte, set where the byte (a row) is not zero ...
        let used = ((body & LOW_SEVEN) + LOW_SEVEN) | body;
        // ... gathered into one byte: bit 8v + 7 times 2^(49 - 7v) is bit
        // 56 + v, and no two of the 64 partial products share a bit.
        self.rows =
            (((used >> 7) & 0x0101_0101_0101_0101).wrapping_mul(0x0102_0408_1020_4080) >> 56) as u8;
        let folded = body | (body >> 32);
        let folded = folded | (folded >> 16);
        self.columns = (folded | (folded >> 8)) as u8;
        self.last = last;
        self.written = body;
    }

    /// Zero the positions that were written, so that the next block starts
    /// from nothing without a pass over all sixty-four.
    #[inline]
    pub fn clear(&mut self) {
        let mut mask = self.written;
        while mask != 0 {
            self.values[mask.trailing_zeros() as usize] = 0;
            mask &= mask - 1;
        }
        self.rows = 0;
        self.columns = 0;
        self.last = 0;
        self.written = 0;
    }
}

/// The arithmetic a 1-D transform needs, for one value or eight in parallel.
trait Lane: Copy + Add<Output = Self> + Sub<Output = Self> + Mul<i32, Output = Self> {}

impl Lane for i32 {}

/// Eight columns side by side, so the vertical pass is written once and
/// works on all of them together.
///
/// There are two of these with the same arithmetic. The first is an array,
/// which the compiler turns into vector instructions where the target has
/// them. On WebAssembly it leaves most of the vertical pass in single
/// values, which made the transform the slowest part of decoding there, so
/// the second states the two four-lane vectors outright. The decode tests
/// that run the WebAssembly build compare its pictures with this crate's
/// native ones sample for sample.
#[cfg(not(target_arch = "wasm32"))]
#[derive(Clone, Copy)]
struct Lanes([i32; 8]);

#[cfg(not(target_arch = "wasm32"))]
impl Lanes {
    const ZERO: Self = Self([0; 8]);

    #[inline(always)]
    fn new(values: [i32; 8]) -> Self {
        Self(values)
    }

    #[inline(always)]
    fn splat(value: i32) -> Self {
        Self([value; 8])
    }

    /// The value of column 0.
    #[inline(always)]
    fn first(self) -> i32 {
        self.0[0]
    }

    /// Line `y` of the vertical pass to line `y` of the residual: F[7][7],
    /// which is `last`, added where the block has one, then rounded.
    #[inline(always)]
    fn rounded(self, last: i32, y: usize) -> Self {
        if last == 0 {
            Self(self.0.map(|value| (value + COLUMN_ROUND) >> COLUMN_SHIFT))
        } else {
            let basis = &LAST_BASIS[y * 8..y * 8 + 8];
            Self(std::array::from_fn(|x| {
                (self.0[x] + last * basis[x] + COLUMN_ROUND) >> COLUMN_SHIFT
            }))
        }
    }

    /// Store a line of residual as samples, saturated to [0, 255].
    #[inline(always)]
    fn put(self, line: &mut [u8; 8]) {
        for x in 0..8 {
            line[x] = self.0[x].clamp(0, 255) as u8;
        }
    }

    /// Add a line of residual to the samples in `line` and saturate.
    #[inline(always)]
    fn add_to(self, line: &mut [u8; 8]) {
        for x in 0..8 {
            line[x] = (line[x] as i32 + self.0[x]).clamp(0, 255) as u8;
        }
    }

    #[cfg(test)]
    fn values(self) -> [i32; 8] {
        self.0
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl Add for Lanes {
    type Output = Self;
    #[inline(always)]
    fn add(self, other: Self) -> Self {
        Self(std::array::from_fn(|i| self.0[i] + other.0[i]))
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl Sub for Lanes {
    type Output = Self;
    #[inline(always)]
    fn sub(self, other: Self) -> Self {
        Self(std::array::from_fn(|i| self.0[i] - other.0[i]))
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl Mul<i32> for Lanes {
    type Output = Self;
    #[inline(always)]
    fn mul(self, k: i32) -> Self {
        Self(std::array::from_fn(|i| self.0[i] * k))
    }
}

#[cfg(target_arch = "wasm32")]
use std::arch::wasm32::{
    i16x8_add, i16x8_narrow_i32x4, i32x4, i32x4_add, i32x4_extract_lane, i32x4_mul, i32x4_shr,
    i32x4_splat, i32x4_sub, i64x2, i64x2_extract_lane, u16x8_extend_low_u8x16, u8x16_narrow_i16x8,
    v128,
};

/// Columns 0 to 3 and 4 to 7. No sum or product of the transform leaves i32
/// (see [`Block`]), so the wrapping vector arithmetic gives what the array's
/// does.
#[cfg(target_arch = "wasm32")]
#[derive(Clone, Copy)]
struct Lanes(v128, v128);

#[cfg(target_arch = "wasm32")]
impl Lanes {
    const ZERO: Self = Self(i32x4(0, 0, 0, 0), i32x4(0, 0, 0, 0));

    #[inline(always)]
    fn new(values: [i32; 8]) -> Self {
        Self(
            i32x4(values[0], values[1], values[2], values[3]),
            i32x4(values[4], values[5], values[6], values[7]),
        )
    }

    #[inline(always)]
    fn splat(value: i32) -> Self {
        Self(i32x4_splat(value), i32x4_splat(value))
    }

    /// The value of column 0.
    #[inline(always)]
    fn first(self) -> i32 {
        i32x4_extract_lane::<0>(self.0)
    }

    /// Line `y` of the vertical pass to line `y` of the residual: F[7][7],
    /// which is `last`, added where the block has one, then rounded.
    #[inline(always)]
    fn rounded(self, last: i32, y: usize) -> Self {
        let mut line = self;
        if last != 0 {
            let basis: &[i32; 8] = LAST_BASIS[y * 8..y * 8 + 8].try_into().expect("eight");
            line = line + Self::new(*basis) * last;
        }
        let line = line + Self::splat(COLUMN_ROUND);
        Self(
            i32x4_shr(line.0, COLUMN_SHIFT),
            i32x4_shr(line.1, COLUMN_SHIFT),
        )
    }

    /// The eight values as sixteen-bit lanes, which a line of residual
    /// fits: it is under 2^14 in magnitude (see [`Block`]), so the narrowing
    /// saturates nothing.
    #[inline(always)]
    fn narrow(self) -> v128 {
        i16x8_narrow_i32x4(self.0, self.1)
    }

    /// Store a line of residual as samples, saturated to [0, 255].
    #[inline(always)]
    fn put(self, line: &mut [u8; 8]) {
        let residual = self.narrow();
        let samples = u8x16_narrow_i16x8(residual, residual);
        *line = i64x2_extract_lane::<0>(samples).to_le_bytes();
    }

    /// Add a line of residual to the samples in `line` and saturate. A
    /// sample and a residual add up to less than 2^15 in magnitude, and the
    /// narrowing to samples saturates to [0, 255].
    #[inline(always)]
    fn add_to(self, line: &mut [u8; 8]) {
        let prediction = u16x8_extend_low_u8x16(i64x2(i64::from_le_bytes(*line), 0));
        let sum = i16x8_add(prediction, self.narrow());
        let samples = u8x16_narrow_i16x8(sum, sum);
        *line = i64x2_extract_lane::<0>(samples).to_le_bytes();
    }
}

#[cfg(target_arch = "wasm32")]
impl Add for Lanes {
    type Output = Self;
    #[inline(always)]
    fn add(self, other: Self) -> Self {
        Self(i32x4_add(self.0, other.0), i32x4_add(self.1, other.1))
    }
}

#[cfg(target_arch = "wasm32")]
impl Sub for Lanes {
    type Output = Self;
    #[inline(always)]
    fn sub(self, other: Self) -> Self {
        Self(i32x4_sub(self.0, other.0), i32x4_sub(self.1, other.1))
    }
}

#[cfg(target_arch = "wasm32")]
impl Mul<i32> for Lanes {
    type Output = Self;
    #[inline(always)]
    fn mul(self, k: i32) -> Self {
        let k = i32x4_splat(k);
        Self(i32x4_mul(self.0, k), i32x4_mul(self.1, k))
    }
}

impl Lane for Lanes {}

/// `y[n] = sum_k c(k) x[k] cos((2n + 1) k pi / 16) / 2` with c(0) = 1/sqrt(2)
/// and c(k) = 1 otherwise, with the constants `k` (scaled cosines). With
/// `HALF`, x[4..8] are taken as zero and not read.
#[inline(always)]
fn idct_1d<T: Lane, const HALF: bool>(x: [T; 8], k: &[i32; 8]) -> [T; 8] {
    let (e0, e1, e2, e3, o0, o1, o2, o3);
    if HALF {
        let t0 = x[0] * k[4];
        let t2 = x[2] * k[2];
        let t3 = x[2] * k[6];
        e0 = t0 + t2;
        e3 = t0 - t2;
        e1 = t0 + t3;
        e2 = t0 - t3;
        o0 = x[1] * k[1] + x[3] * k[3];
        o1 = x[1] * k[3] - x[3] * k[7];
        o2 = x[1] * k[5] - x[3] * k[1];
        o3 = x[1] * k[7] - x[3] * k[5];
    } else {
        let t0 = (x[0] + x[4]) * k[4];
        let t1 = (x[0] - x[4]) * k[4];
        let t2 = x[2] * k[2] + x[6] * k[6];
        let t3 = x[2] * k[6] - x[6] * k[2];
        e0 = t0 + t2;
        e3 = t0 - t2;
        e1 = t1 + t3;
        e2 = t1 - t3;
        o0 = x[1] * k[1] + x[3] * k[3] + x[5] * k[5] + x[7] * k[7];
        o1 = x[1] * k[3] - x[3] * k[7] - x[5] * k[1] - x[7] * k[5];
        o2 = x[1] * k[5] - x[3] * k[1] + x[5] * k[7] + x[7] * k[3];
        o3 = x[1] * k[7] - x[3] * k[5] + x[5] * k[3] - x[7] * k[1];
    }
    [
        e0 + o0,
        e1 + o1,
        e2 + o2,
        e3 + o3,
        e3 - o3,
        e2 - o2,
        e1 - o1,
        e0 - o0,
    ]
}

/// The whole transform, handing each output row to `emit`.
///
/// The rows are not saturated to [-256, 255] (7.5): both users saturate the
/// sum with a prediction in [0, 255] to [0, 255] (7.6.8), which gives the
/// same samples whether or not the residual was saturated first.
#[inline(always)]
fn transform(block: &Block, mut emit: impl FnMut(usize, Lanes)) {
    // DC alone, which is half of all blocks: flat but for F[7][7], which
    // mismatch control sets in most of them. The arithmetic is that of the
    // general path, where a lone DC makes every row and column constant.
    if block.rows <= 1 && block.columns <= 1 {
        let dc = ((block.values[0] * ROW_K[4] + ROW_ROUND) >> ROW_SHIFT) * COLUMN_K[4];
        let last = block.last;
        if last == 0 {
            let line = Lanes::splat((dc + COLUMN_ROUND) >> COLUMN_SHIFT);
            for y in 0..8 {
                emit(y, line);
            }
        } else {
            let flat = Lanes::splat(dc);
            for y in 0..8 {
                emit(y, flat.rounded(last, y));
            }
        }
        return;
    }

    // Horizontal pass, only over rows that hold coefficients; the others stay
    // zero. A row with nothing past its DC is constant.
    let mut rows = [Lanes::ZERO; 8];
    let columns = block.columns;
    for v in 0..8 {
        if block.rows & (1 << v) == 0 {
            continue;
        }
        let x: [i32; 8] = block.values[v * 8..v * 8 + 8].try_into().expect("eight");
        let y = if columns == 1 {
            [x[0] * ROW_K[4]; 8]
        } else if columns & 0xf0 == 0 {
            idct_1d::<i32, true>(x, &ROW_K)
        } else {
            idct_1d::<i32, false>(x, &ROW_K)
        };
        rows[v] = Lanes::new(y.map(|value| (value + ROW_ROUND) >> ROW_SHIFT));
    }

    // Vertical pass on all eight columns together. Where only column 0 had
    // coefficients every row is constant, and one column is enough.
    let columns_out = if block.rows <= 1 {
        [rows[0] * COLUMN_K[4]; 8]
    } else if columns == 1 {
        let column: [i32; 8] = std::array::from_fn(|v| rows[v].first());
        let out = if block.rows & 0xf0 == 0 {
            idct_1d::<i32, true>(column, &COLUMN_K)
        } else {
            idct_1d::<i32, false>(column, &COLUMN_K)
        };
        out.map(Lanes::splat)
    } else if block.rows & 0xf0 == 0 {
        idct_1d::<Lanes, true>(rows, &COLUMN_K)
    } else {
        idct_1d::<Lanes, false>(rows, &COLUMN_K)
    };

    let last = block.last;
    for (y, column) in columns_out.iter().enumerate() {
        emit(y, column.rounded(last, y));
    }
}

/// Intra blocks: store the transform, saturated to [0, 255] (7.6.8 with a
/// zero prediction), as eight rows of eight starting at `offset`.
#[inline(never)]
pub(crate) fn idct_put(block: &Block, dst: &mut [u8], offset: usize, stride: usize) {
    transform(block, |y, row| {
        row.put(
            dst[offset + y * stride..]
                .first_chunk_mut()
                .expect("a line of the block"),
        );
    });
}

/// Non-intra blocks: add the transform to the prediction already in `dst`
/// and saturate (7.6.8).
#[inline(never)]
pub(crate) fn idct_add(block: &Block, dst: &mut [u8], offset: usize, stride: usize) {
    transform(block, |y, row| {
        row.add_to(
            dst[offset + y * stride..]
                .first_chunk_mut()
                .expect("a line of the block"),
        );
    });
}

/// The transform saturated to [-256, 255] as 7.5 defines it.
#[cfg(test)]
pub(crate) fn idct_values(block: &Block) -> [i32; 64] {
    let mut out = [0i32; 64];
    transform(block, |y, row| {
        let row = row.values();
        for x in 0..8 {
            out[y * 8 + x] = row[x].clamp(-256, 255);
        }
    });
    out
}

/// A block from 64 raster-order coefficients, with the masks filled in.
#[cfg(test)]
pub(crate) fn block_from(coefficients: &[i32; 64]) -> Block {
    let mut block = Block::new();
    for (p, &value) in coefficients.iter().enumerate() {
        if p == 63 {
            block.last = value;
        } else if value != 0 {
            block.values[p] = value;
            block.rows |= 1 << (p / 8);
            block.columns |= 1 << (p % 8);
        }
    }
    block
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn constants_are_the_rounded_cosines() {
        for k in 1..8 {
            let half_cosine = (k as f64 * PI / 16.0).cos() / 2.0;
            assert_eq!(ROW_K[k], (16384.0 * half_cosine).round() as i32, "row {k}");
            assert_eq!(
                COLUMN_K[k],
                (8192.0 * half_cosine).round() as i32,
                "column {k}"
            );
        }
        for y in 0..8 {
            for x in 0..8 {
                let exact = 131072.0
                    * (7.0 * (2 * x + 1) as f64 * PI / 16.0).cos()
                    * (7.0 * (2 * y + 1) as f64 * PI / 16.0).cos()
                    / 4.0;
                assert_eq!(LAST_BASIS[y * 8 + x], exact.round() as i32, "({x}, {y})");
            }
        }
    }

    /// The IDCT of Annex A in double precision.
    fn reference_idct(input: &[i32; 64]) -> [f64; 64] {
        let c = |k: usize| if k == 0 { 1.0 / 2f64.sqrt() } else { 1.0 };
        let mut out = [0.0; 64];
        for y in 0..8 {
            for x in 0..8 {
                let mut sum = 0.0;
                for v in 0..8 {
                    for u in 0..8 {
                        sum += c(u)
                            * c(v)
                            * input[v * 8 + u] as f64
                            * (((2 * x + 1) * u) as f64 * PI / 16.0).cos()
                            * (((2 * y + 1) * v) as f64 * PI / 16.0).cos();
                    }
                }
                out[y * 8 + x] = sum / 4.0;
            }
        }
        out
    }

    fn forward_dct(input: &[i32; 64]) -> [f64; 64] {
        let c = |k: usize| if k == 0 { 1.0 / 2f64.sqrt() } else { 1.0 };
        let mut out = [0.0; 64];
        for v in 0..8 {
            for u in 0..8 {
                let mut sum = 0.0;
                for y in 0..8 {
                    for x in 0..8 {
                        sum += input[y * 8 + x] as f64
                            * (((2 * x + 1) * u) as f64 * PI / 16.0).cos()
                            * (((2 * y + 1) * v) as f64 * PI / 16.0).cos();
                    }
                }
                out[v * 8 + u] = c(u) * c(v) * sum / 4.0;
            }
        }
        out
    }

    /// The random number generator IEEE 1180-1990 specifies: a 32-bit linear
    /// congruential generator scaled onto [-low, high].
    struct Ieee1180Random {
        state: i32,
    }

    impl Ieee1180Random {
        fn new() -> Self {
            Self { state: 1 }
        }

        fn next(&mut self, low: i32, high: i32) -> i32 {
            self.state = self.state.wrapping_mul(1_103_515_245).wrapping_add(12345);
            let i = self.state & 0x7fff_fffe;
            let x = i as f64 / 0x7fff_ffff as f64 * (low + high + 1) as f64;
            x as i32 - low
        }
    }

    struct Statistics {
        peak: i32,
        pixel_mse: f64,
        overall_mse: f64,
        pixel_mean: f64,
        overall_mean: f64,
    }

    /// One run of the IEEE 1180 procedure: 10000 random blocks of samples in
    /// [-low, high] times `sign`, forward transformed and rounded to
    /// integers in [-2048, 2047], then inverse transformed by the reference
    /// and by the implementation, both rounded and saturated to [-256, 255].
    fn run(low: i32, high: i32, sign: i32) -> Statistics {
        const BLOCKS: usize = 10000;
        let mut random = Ieee1180Random::new();
        let mut peak = 0;
        let mut error_sum = [0i64; 64];
        let mut square_sum = [0i64; 64];
        for _ in 0..BLOCKS {
            let mut samples = [0i32; 64];
            for sample in samples.iter_mut() {
                *sample = random.next(low, high) * sign;
            }
            let coefficients =
                forward_dct(&samples).map(|value| (value.round() as i32).clamp(-2048, 2047));
            let reference =
                reference_idct(&coefficients).map(|value| (value.round() as i32).clamp(-256, 255));
            let tested = idct_values(&block_from(&coefficients));
            for p in 0..64 {
                let error = tested[p] - reference[p];
                peak = peak.max(error.abs());
                error_sum[p] += error as i64;
                square_sum[p] += (error * error) as i64;
            }
        }
        let n = BLOCKS as f64;
        Statistics {
            peak,
            pixel_mse: square_sum.iter().map(|&s| s as f64 / n).fold(0.0, f64::max),
            overall_mse: square_sum.iter().sum::<i64>() as f64 / (64.0 * n),
            pixel_mean: error_sum
                .iter()
                .map(|&s| (s as f64 / n).abs())
                .fold(0.0, f64::max),
            overall_mean: (error_sum.iter().sum::<i64>() as f64 / (64.0 * n)).abs(),
        }
    }

    /// IEEE Std 1180-1990: for each input range [-256, 255], [-5, 5] and
    /// [-300, 300], with the samples taken as generated and negated, the
    /// peak error must not exceed 1, the mean square error 0.06 at any
    /// position and 0.02 over all positions, and the mean error 0.015 at any
    /// position and 0.0015 over all positions in magnitude.
    #[test]
    fn meets_ieee_1180() {
        for (low, high) in [(256, 255), (5, 5), (300, 300)] {
            for sign in [1, -1] {
                let s = run(low, high, sign);
                eprintln!(
                    "IEEE 1180 [-{low}, {high}] sign {sign:+}: peak {} pmse {:.4} omse {:.4} pme {:.4} ome {:.5}",
                    s.peak, s.pixel_mse, s.overall_mse, s.pixel_mean, s.overall_mean
                );
                assert!(s.peak <= 1, "peak error {}", s.peak);
                assert!(s.pixel_mse <= 0.06, "per-position mse {}", s.pixel_mse);
                assert!(s.overall_mse <= 0.02, "overall mse {}", s.overall_mse);
                assert!(s.pixel_mean <= 0.015, "per-position mean {}", s.pixel_mean);
                assert!(s.overall_mean <= 0.0015, "overall mean {}", s.overall_mean);
            }
        }
    }

    /// IEEE 1180 also requires zero output for zero input.
    #[test]
    fn zero_in_zero_out() {
        assert_eq!(idct_values(&block_from(&[0; 64])), [0; 64]);
    }

    /// The reduced paths (DC only, low half, F[7][7] alone or added to
    /// others) stay within the IEEE 1180 peak error of the reference, with
    /// every coefficient up to the full range [-2048, 2048] for the sparse
    /// shapes and up to [-300, 300] where all 64 are set.
    #[test]
    fn sparse_blocks_match_the_reference() {
        let mut random = Ieee1180Random::new();
        let shapes: [(u64, i32); 7] = [
            (1, 2048),
            (1 << 63, 2048),
            (1 | 1 << 63, 2048),
            (0x0f0f_0f0f, 2048),
            (0x0f0f_0f0f | 1 << 63, 2048),
            (0xff, 2048),
            (u64::MAX, 300),
        ];
        for &(shape, range) in &shapes {
            for _ in 0..2000 {
                let mut coefficients = [0i32; 64];
                for p in 0..64 {
                    if shape & (1 << p) != 0 {
                        coefficients[p] = random.next(range, range);
                    }
                }
                let reference = reference_idct(&coefficients);
                let tested = idct_values(&block_from(&coefficients));
                for p in 0..64 {
                    let expected = (reference[p].round() as i32).clamp(-256, 255);
                    assert!(
                        (tested[p] - expected).abs() <= 1,
                        "shape {shape:x} position {p}: {} vs {}",
                        tested[p],
                        reference[p]
                    );
                }
            }
        }
    }
}
