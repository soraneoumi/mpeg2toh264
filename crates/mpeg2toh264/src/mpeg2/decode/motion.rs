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

/// The first `W` samples of a line.
#[inline(always)]
fn head<const W: usize>(line: &[u8]) -> &[u8; W] {
    line.first_chunk().expect("a line of the block")
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

/// One line of a block as it is in the source.
#[inline(always)]
fn copy<const W: usize, const AVERAGE: bool>(a: &[u8; W], out: &mut [u8]) {
    let out: &mut [u8; W] = out.first_chunk_mut().expect("a line of the block");
    for i in 0..W {
        store::<AVERAGE>(&mut out[i], a[i] as u16);
    }
}

/// One line of a block half way between two lines of samples.
#[inline(always)]
fn mean<const W: usize, const AVERAGE: bool>(a: &[u8; W], b: &[u8; W], out: &mut [u8]) {
    let out: &mut [u8; W] = out.first_chunk_mut().expect("a line of the block");
    for i in 0..W {
        store::<AVERAGE>(&mut out[i], (a[i] as u16 + b[i] as u16 + 1) >> 1);
    }
}

/// One line of a block from the sums of [`pairs`] of the lines above and
/// below it.
#[inline(always)]
fn quarter<const W: usize, const AVERAGE: bool>(
    upper: &[u16; W],
    lower: &[u16; W],
    out: &mut [u8],
) {
    let out: &mut [u8; W] = out.first_chunk_mut().expect("a line of the block");
    for i in 0..W {
        store::<AVERAGE>(&mut out[i], (upper[i] + lower[i] + 2) >> 2);
    }
}

/// The sums of each sample of a line with the one beside it. A line and its
/// neighbour are two unaligned loads of the same samples, rather than a
/// shuffle of the first.
#[inline(always)]
fn pairs<const W: usize>(line: &[u8]) -> [u16; W] {
    let (a, b) = (head::<W>(line), head::<W>(&line[1..]));
    std::array::from_fn(|i| a[i] as u16 + b[i] as u16)
}

/// The four cases of 7.6.4, with the source known to cover the block and
/// the half-sample neighbours. Sums are formed in u16 so that they map onto
/// byte-wise vector instructions, and none can overflow it: the largest is
/// four samples and a rounding term, 4 * 255 + 2.
///
/// The source and destination are cut once into the lines the block touches:
/// all but the last are whole strides and come from an iterator that has
/// nothing to check, and the last, which may end where the buffer does, is
/// handled after the loop. A line of the picture is far longer than a block
/// is wide, so the length test on each line never fails and costs nothing
/// that depends on the samples. Each line is one loop over its samples that
/// stores as it goes, which is the shape that becomes vector instructions on
/// every target, WebAssembly included.
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
    if W == 8 {
        return interpolate_words::<AVERAGE>(
            src, start, stride, half_x, half_y, h, dst, offset, dst_stride,
        );
    }
    let lines = h + half_y;
    let src = &src[start..start + (lines - 1) * stride + W + half_x];
    let dst = &mut dst[offset..offset + (h - 1) * dst_stride + W];
    let (src, src_last) = src.split_at((lines - 1) * stride);
    let (dst, dst_last) = dst.split_at_mut((h - 1) * dst_stride);
    let mut src = src.chunks_exact(stride);
    let dst = dst.chunks_exact_mut(dst_stride);
    match (half_x, half_y) {
        (0, 0) => {
            for (line, out) in src.zip(dst) {
                copy::<W, AVERAGE>(head(line), out);
            }
            copy::<W, AVERAGE>(head(src_last), dst_last);
        }
        (1, 0) => {
            for (line, out) in src.zip(dst) {
                mean::<W, AVERAGE>(head(line), head(&line[1..]), out);
            }
            mean::<W, AVERAGE>(head(src_last), head(&src_last[1..]), dst_last);
        }
        (0, _) => {
            // Each line is read once, as the lower line of one output and
            // the upper line of the next.
            let mut upper: &[u8; W] = head(src.next().expect("a block has lines"));
            for (line, out) in src.zip(dst) {
                let lower = head(line);
                mean::<W, AVERAGE>(upper, lower, out);
                upper = lower;
            }
            mean::<W, AVERAGE>(upper, head(src_last), dst_last);
        }
        _ => {
            // As above, with the sums across each line kept rather than the
            // lines.
            let mut upper = pairs::<W>(src.next().expect("a block has lines"));
            for (line, out) in src.zip(dst) {
                let lower = pairs::<W>(line);
                quarter::<W, AVERAGE>(&upper, &lower, out);
                upper = lower;
            }
            quarter::<W, AVERAGE>(&upper, &pairs::<W>(src_last), dst_last);
        }
    }
}

/// Eight samples of a line, in one integer.
#[inline(always)]
fn word(line: &[u8]) -> u64 {
    u64::from_le_bytes(*head::<8>(line))
}

/// Byte-wise `(a + b + 1) >> 1`: the bits where the samples differ are
/// halved, and the common ones kept (a + b = 2 (a | b) - (a ^ b)).
#[inline(always)]
fn average(a: u64, b: u64) -> u64 {
    (a | b) - (((a ^ b) >> 1) & 0x7f7f_7f7f_7f7f_7f7f)
}

/// [`interpolate`] for eight samples a line, which WebAssembly has no
/// vector narrowing for: the compiler leaves it in single bytes there, where
/// eight at a time in an integer is a handful of instructions on every
/// target.
#[inline(always)]
#[allow(clippy::too_many_arguments)]
fn interpolate_words<const AVERAGE: bool>(
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
    const EVEN: u64 = 0x00ff_00ff_00ff_00ff;
    let lines = h + half_y;
    let src = &src[start..start + (lines - 1) * stride + 8 + half_x];
    let dst = &mut dst[offset..offset + (h - 1) * dst_stride + 8];
    let (src, src_last) = src.split_at((lines - 1) * stride);
    let (dst, dst_last) = dst.split_at_mut((h - 1) * dst_stride);
    let mut src = src.chunks_exact(stride);
    let dst = dst.chunks_exact_mut(dst_stride);
    let put = |out: &mut [u8], value: u64| {
        let out: &mut [u8; 8] = out.first_chunk_mut().expect("a line of the block");
        let value = if AVERAGE {
            average(u64::from_le_bytes(*out), value)
        } else {
            value
        };
        *out = value.to_le_bytes();
    };
    // The sums of a line with the one beside it, the even and the odd
    // samples apart in sixteen-bit lanes: at most 2 * 255 in each.
    let sums = |line: &[u8]| -> (u64, u64) {
        let (a, b) = (word(line), word(&line[1..]));
        (
            (a & EVEN) + (b & EVEN),
            ((a >> 8) & EVEN) + ((b >> 8) & EVEN),
        )
    };
    // Four samples and a rounding term, 4 * 255 + 2, fit a lane. The shift
    // moves the two low bits of each lane into the lane below, and the mask
    // drops them.
    let quarter = |upper: (u64, u64), lower: (u64, u64)| -> u64 {
        let even = ((upper.0 + lower.0 + 0x0002_0002_0002_0002) >> 2) & EVEN;
        let odd = ((upper.1 + lower.1 + 0x0002_0002_0002_0002) >> 2) & EVEN;
        even | (odd << 8)
    };
    match (half_x, half_y) {
        (0, 0) => {
            for (line, out) in src.zip(dst) {
                put(out, word(line));
            }
            put(dst_last, word(src_last));
        }
        (1, 0) => {
            for (line, out) in src.zip(dst) {
                put(out, average(word(line), word(&line[1..])));
            }
            put(dst_last, average(word(src_last), word(&src_last[1..])));
        }
        (0, _) => {
            let mut upper = word(src.next().expect("a block has lines"));
            for (line, out) in src.zip(dst) {
                let lower = word(line);
                put(out, average(upper, lower));
                upper = lower;
            }
            put(dst_last, average(upper, word(src_last)));
        }
        _ => {
            let mut upper = sums(src.next().expect("a block has lines"));
            for (line, out) in src.zip(dst) {
                let lower = sums(line);
                put(out, quarter(upper, lower));
                upper = lower;
            }
            put(dst_last, quarter(upper, sums(src_last)));
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
