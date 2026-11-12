//! Forming one prediction block from a reference field or frame (H.262 7.6.4).

/// One plane of a reference frame, or one field of it.
#[derive(Clone, Copy)]
pub(crate) struct View<'a> {
    pub data: &'a [u8],
    /// Where line 0 starts.
    pub offset: usize,
    /// Distance between lines: the plane stride for a frame, twice it for a
    /// field.
    pub stride: usize,
    pub width: i32,
    pub height: i32,
}

/// Largest block predicted at once (16 x 16 luma), plus the extra column
/// and line half-sample interpolation reads.
const EDGE_STRIDE: usize = 17;

/// Predict a `W` x `h` block whose top-left sample is at (`x`, `y`) in `src`
/// with the vector (`vx`, `vy`) in half samples, into `dst` at `offset`.
/// With `AVERAGE` the result is averaged into what `dst` already holds,
/// rounding up (`//2` of 7.6.7.1 and 7.6.7.4); otherwise it is stored.
///
/// A block that reaches outside `src` reads the nearest edge sample instead.
/// Conforming streams never do that (7.6.3.8), but damaged ones do, and the
/// vector can be anything the motion vector syntax can express.
#[inline(never)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn predict<const W: usize, const AVERAGE: bool>(
    src: View<'_>,
    x: i32,
    y: i32,
    vx: i32,
    vy: i32,
    h: usize,
    dst: &mut [u8],
    offset: usize,
    dst_stride: usize,
) {
    // int_vec is vector DIV 2 and half_flag the remainder (7.6.4).
    let left = x + (vx >> 1);
    let top = y + (vy >> 1);
    let half_x = (vx & 1) as usize;
    let half_y = (vy & 1) as usize;
    let inside = left >= 0
        && top >= 0
        && left + (W + half_x) as i32 <= src.width
        && top + (h + half_y) as i32 <= src.height;
    if inside {
        let start = src.offset + top as usize * src.stride + left as usize;
        interpolate::<W, AVERAGE>(
            src.data, start, src.stride, half_x, half_y, h, dst, offset, dst_stride,
        );
    } else {
        predict_from_edge::<W, AVERAGE>(src, left, top, half_x, half_y, h, dst, offset, dst_stride);
    }
}

/// [`predict`] for the two 8-wide chroma blocks of one macroblock, which
/// share their position, vector and layout: `src` and `dst` are the Cb and
/// Cr planes, and one offset and stride serve both.
#[inline(never)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn predict_chroma<const AVERAGE: bool>(
    src: [View<'_>; 2],
    x: i32,
    y: i32,
    vx: i32,
    vy: i32,
    h: usize,
    dst: [&mut [u8]; 2],
    offset: usize,
    dst_stride: usize,
) {
    let left = x + (vx >> 1);
    let top = y + (vy >> 1);
    let half_x = (vx & 1) as usize;
    let half_y = (vy & 1) as usize;
    let view = src[0];
    let inside = left >= 0
        && top >= 0
        && left + (8 + half_x) as i32 <= view.width
        && top + (h + half_y) as i32 <= view.height;
    if inside {
        let start = view.offset + top as usize * view.stride + left as usize;
        interpolate_pair::<AVERAGE>(
            [src[0].data, src[1].data],
            start,
            view.stride,
            half_x,
            half_y,
            h,
            dst,
            offset,
            dst_stride,
        );
    } else {
        for (src, dst) in src.into_iter().zip(dst) {
            predict_from_edge::<8, AVERAGE>(
                src, left, top, half_x, half_y, h, dst, offset, dst_stride,
            );
        }
    }
}

/// [`interpolate`] for two planes laid out alike, eight samples of each per
/// line, worked on as one line of sixteen.
#[inline(always)]
#[allow(clippy::too_many_arguments)]
fn interpolate_pair<const AVERAGE: bool>(
    src: [&[u8]; 2],
    start: usize,
    stride: usize,
    half_x: usize,
    half_y: usize,
    h: usize,
    dst: [&mut [u8]; 2],
    offset: usize,
    dst_stride: usize,
) {
    let line = |at: usize| -> [u8; 16] {
        let mut both = [0u8; 16];
        both[..8].copy_from_slice(&src[0][at..at + 8]);
        both[8..].copy_from_slice(&src[1][at..at + 8]);
        both
    };
    let [first, second] = dst;
    for j in 0..h {
        let at = start + j * stride;
        let value: [u16; 16] = match (half_x, half_y) {
            (0, 0) => line(at).map(u16::from),
            (1, 0) => {
                let (a, b) = (line(at), line(at + 1));
                std::array::from_fn(|i| (a[i] as u16 + b[i] as u16 + 1) >> 1)
            }
            (0, _) => {
                let (a, b) = (line(at), line(at + stride));
                std::array::from_fn(|i| (a[i] as u16 + b[i] as u16 + 1) >> 1)
            }
            _ => {
                let (a, b) = (line(at), line(at + 1));
                let (c, d) = (line(at + stride), line(at + stride + 1));
                std::array::from_fn(|i| {
                    (a[i] as u16 + b[i] as u16 + c[i] as u16 + d[i] as u16 + 2) >> 2
                })
            }
        };
        let out_first = &mut first[offset + j * dst_stride..][..8];
        let out_second = &mut second[offset + j * dst_stride..][..8];
        for i in 0..8 {
            store::<AVERAGE>(&mut out_first[i], value[i]);
            store::<AVERAGE>(&mut out_second[i], value[i + 8]);
        }
    }
}

/// [`predict`] for a block that reaches outside the picture: the samples it
/// reads are first gathered with their coordinates clamped to the picture.
#[cold]
#[inline(never)]
#[allow(clippy::too_many_arguments)]
fn predict_from_edge<const W: usize, const AVERAGE: bool>(
    src: View<'_>,
    left: i32,
    top: i32,
    half_x: usize,
    half_y: usize,
    h: usize,
    dst: &mut [u8],
    offset: usize,
    dst_stride: usize,
) {
    let mut edge = [0u8; EDGE_STRIDE * EDGE_STRIDE];
    for j in 0..h + half_y {
        let line = (top + j as i32).clamp(0, src.height - 1) as usize;
        let row = &src.data[src.offset + line * src.stride..][..src.width as usize];
        for i in 0..W + half_x {
            let column = (left + i as i32).clamp(0, src.width - 1) as usize;
            edge[j * EDGE_STRIDE + i] = row[column];
        }
    }
    interpolate::<W, AVERAGE>(
        &edge,
        0,
        EDGE_STRIDE,
        half_x,
        half_y,
        h,
        dst,
        offset,
        dst_stride,
    );
}

/// Store `value`, or average it into what is there with rounding up.
#[inline(always)]
fn store<const AVERAGE: bool>(slot: &mut u8, value: u16) {
    *slot = if AVERAGE {
        ((*slot as u16 + value + 1) >> 1) as u8
    } else {
        value as u8
    };
}

/// The four cases of 7.6.4, with the source known to cover the block and
/// the half-sample neighbours. Sums are formed in u16 so that they map onto
/// byte-wise vector instructions.
#[inline(always)]
#[allow(clippy::too_many_arguments)]
fn interpolate<const W: usize, const AVERAGE: bool>(
    src: &[u8],
    start: usize,
    stride: usize,
    half_x: usize,
    half_y: usize,
    h: usize,
    dst: &mut [u8],
    offset: usize,
    dst_stride: usize,
) {
    // Each source line is taken as a whole array, so that the half-sample
    // neighbour is a second unaligned load rather than a shuffle of the
    // first.
    let line = |at: usize| -> &[u8; W] { src[at..at + W].try_into().expect("W samples") };
    match (half_x, half_y) {
        (0, 0) => {
            for j in 0..h {
                let a = line(start + j * stride);
                let out = &mut dst[offset + j * dst_stride..][..W];
                for i in 0..W {
                    store::<AVERAGE>(&mut out[i], a[i] as u16);
                }
            }
        }
        (1, 0) => {
            for j in 0..h {
                let a = line(start + j * stride);
                let b = line(start + j * stride + 1);
                let out = &mut dst[offset + j * dst_stride..][..W];
                for i in 0..W {
                    store::<AVERAGE>(&mut out[i], (a[i] as u16 + b[i] as u16 + 1) >> 1);
                }
            }
        }
        (0, _) => {
            for j in 0..h {
                let a = line(start + j * stride);
                let b = line(start + (j + 1) * stride);
                let out = &mut dst[offset + j * dst_stride..][..W];
                for i in 0..W {
                    store::<AVERAGE>(&mut out[i], (a[i] as u16 + b[i] as u16 + 1) >> 1);
                }
            }
        }
        _ => {
            for j in 0..h {
                let a = line(start + j * stride);
                let b = line(start + j * stride + 1);
                let c = line(start + (j + 1) * stride);
                let d = line(start + (j + 1) * stride + 1);
                let out = &mut dst[offset + j * dst_stride..][..W];
                for i in 0..W {
                    let sum = a[i] as u16 + b[i] as u16 + c[i] as u16 + d[i] as u16;
                    store::<AVERAGE>(&mut out[i], (sum + 2) >> 2);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 7.6.4 per sample, with coordinates clamped to the picture.
    fn reference(src: &View<'_>, x: i32, y: i32, vx: i32, vy: i32, w: usize, h: usize) -> Vec<u8> {
        let int_x = vx.div_euclid(2);
        let int_y = vy.div_euclid(2);
        let half_x = vx - 2 * int_x != 0;
        let half_y = vy - 2 * int_y != 0;
        let at = |i: i32, j: i32| -> u32 {
            let i = i.clamp(0, src.width - 1) as usize;
            let j = j.clamp(0, src.height - 1) as usize;
            src.data[src.offset + j * src.stride + i] as u32
        };
        let mut out = Vec::new();
        for j in 0..h as i32 {
            for i in 0..w as i32 {
                let px = x + i + int_x;
                let py = y + j + int_y;
                let value = match (half_x, half_y) {
                    (false, false) => at(px, py),
                    (false, true) => (at(px, py) + at(px, py + 1)).div_ceil(2),
                    (true, false) => (at(px, py) + at(px + 1, py)).div_ceil(2),
                    (true, true) => {
                        (at(px, py) + at(px + 1, py) + at(px, py + 1) + at(px + 1, py + 1) + 2) / 4
                    }
                };
                out.push(value as u8);
            }
        }
        out
    }

    fn noise(len: usize, seed: u32) -> Vec<u8> {
        let mut state = seed;
        (0..len)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                (state >> 24) as u8
            })
            .collect()
    }

    fn check<const W: usize>(src: View<'_>, x: i32, y: i32, vx: i32, vy: i32, h: usize) {
        let mut dst = noise(W * h, 7);
        let before = dst.clone();
        predict::<W, false>(src, x, y, vx, vy, h, &mut dst, 0, W);
        let expected = reference(&src, x, y, vx, vy, W, h);
        assert_eq!(
            dst, expected,
            "put {W}x{h} at ({x}, {y}) vector ({vx}, {vy})"
        );
        let mut averaged = before.clone();
        predict::<W, true>(src, x, y, vx, vy, h, &mut averaged, 0, W);
        let expected: Vec<u8> = before
            .iter()
            .zip(&expected)
            .map(|(&a, &b)| (a as u32 + b as u32).div_ceil(2) as u8)
            .collect();
        assert_eq!(
            averaged, expected,
            "average {W}x{h} at ({x}, {y}) vector ({vx}, {vy})"
        );
    }

    #[test]
    fn every_half_sample_case_matches_the_formula() {
        let plane = noise(64 * 48, 1);
        let frame = View {
            data: &plane,
            offset: 0,
            stride: 64,
            width: 64,
            height: 48,
        };
        for parity in 0..2 {
            let field = View {
                data: &plane,
                offset: parity * 64,
                stride: 128,
                width: 64,
                height: 24,
            };
            for vy in -5..=5 {
                for vx in -5..=5 {
                    check::<16>(frame, 16, 16, vx, vy, 16);
                    check::<16>(field, 16, 8, vx, vy, 8);
                    check::<8>(frame, 8, 8, vx, vy, 8);
                    check::<8>(field, 8, 4, vx, vy, 4);
                }
            }
        }
    }

    #[test]
    fn vectors_outside_the_picture_read_the_nearest_edge() {
        let plane = noise(32 * 32, 3);
        let view = View {
            data: &plane,
            offset: 0,
            stride: 32,
            width: 32,
            height: 32,
        };
        for &(vx, vy) in &[
            (-1, -1),
            (31, 0),
            (0, 33),
            (-100_001, 77),
            (1 << 19, -(1 << 19)),
            (33, 33),
        ] {
            check::<16>(view, 16, 16, vx, vy, 16);
            check::<8>(view, 0, 0, vx, vy, 8);
        }
    }
}
