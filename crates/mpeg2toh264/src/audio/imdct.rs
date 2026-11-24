//! The filterbank: inverse MDCT, windowing and overlap-add (ISO/IEC 14496-3
//! 4.6.11).
//!
//! The IMDCT of N samples, x(n) = 2/N sum_k X(k) cos(2 pi / N (n + n0)(k + 1/2))
//! with n0 = (N/2 + 1)/2, is a DCT-IV of N/2 coefficients read out with a
//! shift and two sign changes, and the DCT-IV is a complex FFT of N/4 points
//! between two twiddles. See [`Dct4`].

use super::window::WINDOWS;
use crate::container::aac::{EIGHT_SHORT_SEQUENCE, LONG_START_SEQUENCE, LONG_STOP_SEQUENCE};
use std::f64::consts::PI;
use std::sync::LazyLock;

/// Complex values as their real and their imaginary parts apart, which is
/// what lets the loops over them run four values at a time.
#[derive(Clone, Default)]
struct Split {
    re: Vec<f32>,
    im: Vec<f32>,
}

impl Split {
    fn from(values: impl Iterator<Item = (f64, f64)>) -> Self {
        let mut split = Self::default();
        for (re, im) in values {
            split.re.push(re as f32);
            split.im.push(im as f32);
        }
        split
    }
}

/// A DCT-IV of `m` coefficients, u(n) = scale sum_k X(k) cos(pi / m (n + 1/2)(k
/// + 1/2)).
///
/// Pairing the even inputs with the odd ones read backwards as one complex
/// sequence, t(k) = (X(2k) + i X(m - 1 - 2k)) e^{-i pi (k + 1/8) / m}, its
/// DFT of m/2 points T(p), twiddled once more as y(p) = T(p) e^{-i pi (p +
/// 1/8) / m}, gives u(2p) = Re y(p) and u(m - 1 - 2p) = -Im y(p): the phase
/// pi / m (2p + 1/2)(2k + 1/2) is 4 pi p k / m, the DFT's, plus the two
/// twiddles' (k + 1/8) and (p + 1/8) parts, and the odd inputs and outputs
/// pick up the cosine's reflections.
struct Dct4 {
    /// e^{-i pi (k + 1/8) / m} times the scale, for the inputs.
    pre: Split,
    /// e^{-i pi (p + 1/8) / m}, for the outputs.
    post: Split,
    /// The twiddles of each radix-4 pass of the FFT that has any, one after
    /// the other: for a pass combining four transforms of L points, w^j,
    /// w^{2j} and w^{3j} for j below L, with w = e^{-2 pi i / 4L}.
    twiddle: [Split; 3],
    /// Where each input of the FFT goes so that its output comes in order: the
    /// index with its bits reversed.
    bit_reversed: Vec<u16>,
}

/// The FFT's working space: the real parts, then the imaginary parts.
type Work = [[f32; 512]; 2];

impl Dct4 {
    fn new(m: usize, scale: f64) -> Self {
        let points = m / 2;
        let turn = |phase: f64, scale: f64| (scale * phase.cos(), -scale * phase.sin());
        let bits = points.trailing_zeros();
        let mut twiddle: [Split; 3] = Default::default();
        let mut quarter = if bits % 2 == 1 { 2 } else { 4 };
        while quarter < points {
            for (power, split) in (1..=3).zip(&mut twiddle) {
                let pass = Split::from(
                    (0..quarter)
                        .map(|j| turn(2.0 * PI * (power * j) as f64 / (4 * quarter) as f64, 1.0)),
                );
                split.re.extend(pass.re);
                split.im.extend(pass.im);
            }
            quarter *= 4;
        }
        Self {
            pre: Split::from((0..points).map(|k| turn(PI * (k as f64 + 0.125) / m as f64, scale))),
            post: Split::from((0..points).map(|p| turn(PI * (p as f64 + 0.125) / m as f64, 1.0))),
            twiddle,
            bit_reversed: (0..points)
                .map(|k| ((k as u32).reverse_bits() >> (32 - bits)) as u16)
                .collect(),
        }
    }

    /// `output` = the DCT-IV of `input`, both `m` long.
    fn run(&self, input: &[f32], output: &mut [f32], work: &mut Work) {
        let m = input.len();
        let points = m / 2;
        let [re, im] = work;
        let (re, im) = (&mut re[..points], &mut im[..points]);
        let (pre_re, pre_im) = (&self.pre.re[..points], &self.pre.im[..points]);
        for (k, &to) in self.bit_reversed.iter().enumerate() {
            let (a, b) = (input[2 * k], input[m - 1 - 2 * k]);
            re[to as usize] = a * pre_re[k] - b * pre_im[k];
            im[to as usize] = a * pre_im[k] + b * pre_re[k];
        }
        self.fft(re, im);
        let (post_re, post_im) = (&self.post.re[..points], &self.post.im[..points]);
        // The twiddled outputs first, in place, which runs four at a time,
        // then spread out to where they go.
        for p in 0..points {
            let (x, y) = (re[p], im[p]);
            re[p] = x * post_re[p] - y * post_im[p];
            im[p] = -(x * post_im[p] + y * post_re[p]);
        }
        for p in 0..points {
            output[2 * p] = re[p];
            output[m - 1 - 2 * p] = im[p];
        }
    }

    /// An in-place forward FFT of input already in bit-reversed order: one
    /// radix-2 pass where the size is an odd power of two, else a radix-4 one
    /// whose twiddles are all one, then radix-4 passes, each two radix-2
    /// passes in one with three multiplications per four points instead of
    /// four.
    fn fft(&self, re: &mut [f32], im: &mut [f32]) {
        let n = re.len();
        let mut quarter = if n.trailing_zeros() % 2 == 1 {
            for (r, i) in re.chunks_exact_mut(2).zip(im.chunks_exact_mut(2)) {
                (r[0], r[1]) = (r[0] + r[1], r[0] - r[1]);
                (i[0], i[1]) = (i[0] + i[1], i[0] - i[1]);
            }
            2
        } else {
            for (r, i) in re.chunks_exact_mut(4).zip(im.chunks_exact_mut(4)) {
                let (b0r, b0i) = (r[0] + r[1], i[0] + i[1]);
                let (b1r, b1i) = (r[0] - r[1], i[0] - i[1]);
                let (sr, si) = (r[2] + r[3], i[2] + i[3]);
                // (r2 - r3) times -i.
                let (dr, di) = (i[2] - i[3], r[3] - r[2]);
                (r[0], i[0]) = (b0r + sr, b0i + si);
                (r[2], i[2]) = (b0r - sr, b0i - si);
                (r[1], i[1]) = (b1r + dr, b1i + di);
                (r[3], i[3]) = (b1r - dr, b1i - di);
            }
            4
        };
        let mut used = 0;
        while quarter < n {
            let [w1, w2, w3] = &self.twiddle;
            let range = used..used + quarter;
            used += quarter;
            let (w1r, w1i) = (&w1.re[range.clone()], &w1.im[range.clone()]);
            let (w2r, w2i) = (&w2.re[range.clone()], &w2.im[range.clone()]);
            let (w3r, w3i) = (&w3.re[range.clone()], &w3.im[range]);
            for (r, i) in re
                .chunks_exact_mut(4 * quarter)
                .zip(im.chunks_exact_mut(4 * quarter))
            {
                radix4(quarters(r), quarters(i), [w1r, w1i, w2r, w2i, w3r, w3i]);
            }
            quarter *= 4;
        }
    }
}

/// Four transforms of L points at j, j + L, j + 2L and j + 3L into one of 4L:
/// the first two and the last two combined as a radix-2 pass would, with
/// w^{2j}, and the results with w^j.
///
/// Kept out of line, and given the quarters as separate slices, because only a
/// function's own slice arguments tell the compiler they do not overlap, which
/// it needs to know to run the loop four values at a time.
///
/// A pass of few points per quarter is the opposite case: the loop is too
/// short to gain from that, and the call would cost more than it does, so
/// those passes take the same loop inline.
#[inline(always)]
fn radix4(r: [&mut [f32]; 4], i: [&mut [f32]; 4], w: [&[f32]; 6]) {
    if r[0].len() < 8 {
        butterflies(r, i, w);
    } else {
        butterflies_apart(r, i, w);
    }
}

#[inline(never)]
fn butterflies_apart(r: [&mut [f32]; 4], i: [&mut [f32]; 4], w: [&[f32]; 6]) {
    butterflies(r, i, w);
}

#[inline(always)]
fn butterflies(r: [&mut [f32]; 4], i: [&mut [f32]; 4], w: [&[f32]; 6]) {
    let [r0, r1, r2, r3] = r;
    let [i0, i1, i2, i3] = i;
    let quarter = r0.len();
    let [w1r, w1i, w2r, w2i, w3r, w3i] = w.map(|w| &w[..quarter]);
    let (r1, r2, r3) = (&mut r1[..quarter], &mut r2[..quarter], &mut r3[..quarter]);
    let (i0, i1, i2, i3) = (
        &mut i0[..quarter],
        &mut i1[..quarter],
        &mut i2[..quarter],
        &mut i3[..quarter],
    );
    for j in 0..quarter {
        let (c1r, c1i) = (
            r1[j] * w2r[j] - i1[j] * w2i[j],
            r1[j] * w2i[j] + i1[j] * w2r[j],
        );
        let (c2r, c2i) = (
            r2[j] * w1r[j] - i2[j] * w1i[j],
            r2[j] * w1i[j] + i2[j] * w1r[j],
        );
        let (c3r, c3i) = (
            r3[j] * w3r[j] - i3[j] * w3i[j],
            r3[j] * w3i[j] + i3[j] * w3r[j],
        );
        let (b0r, b0i) = (r0[j] + c1r, i0[j] + c1i);
        let (b1r, b1i) = (r0[j] - c1r, i0[j] - c1i);
        let (sr, si) = (c2r + c3r, c2i + c3i);
        // (c2 - c3) times -i.
        let (dr, di) = (c2i - c3i, c3r - c2r);
        r0[j] = b0r + sr;
        i0[j] = b0i + si;
        r2[j] = b0r - sr;
        i2[j] = b0i - si;
        r1[j] = b1r + dr;
        i1[j] = b1i + di;
        r3[j] = b1r - dr;
        i3[j] = b1i - di;
    }
}

/// `block` cut into its four quarters.
fn quarters(block: &mut [f32]) -> [&mut [f32]; 4] {
    let quarter = block.len() / 4;
    let (a, rest) = block.split_at_mut(quarter);
    let (b, rest) = rest.split_at_mut(quarter);
    let (c, d) = rest.split_at_mut(quarter);
    [a, b, c, d]
}

/// Output is in units of full scale, where the specification's is of 16-bit
/// samples: hence the 1/32768 besides the IMDCT's 2/N.
static LONG: LazyLock<Dct4> = LazyLock::new(|| Dct4::new(1024, 2.0 / 2048.0 / 32768.0));
static SHORT: LazyLock<Dct4> = LazyLock::new(|| Dct4::new(128, 2.0 / 256.0 / 32768.0));

/// Scratch the filterbank works in, kept by the decoder so that nothing is
/// allocated per frame.
pub(crate) struct Filterbank {
    /// The DCT-IV of a long window, or of the eight short ones.
    dct: [f32; 1024],
    /// The IMDCT of a long window, or the windowed and overlapped output of
    /// eight short ones.
    short_frame: [f32; 2048],
    work: Work,
}

impl Filterbank {
    pub fn new() -> Self {
        Self {
            dct: [0.0; 1024],
            short_frame: [0.0; 2048],
            work: [[0.0; 512]; 2],
        }
    }

    /// Turn one channel's spectrum into its 1024 output samples: the first half
    /// of this frame's windowed IMDCT added to `overlap`, which then holds the
    /// second half for the next frame. `previous_shape` is the window shape of
    /// the frame before, which the left half of this one's window takes.
    #[allow(clippy::too_many_arguments)]
    pub fn synthesise(
        &mut self,
        spectrum: &[f32; 1024],
        window_sequence: u8,
        window_shape: u8,
        previous_shape: u8,
        overlap: &mut [f32; 1024],
        output: &mut [f32],
    ) {
        let windows = &*WINDOWS;
        let long_rise = &windows.long[previous_shape as usize][..];
        let long_fall = &windows.long[window_shape as usize][..];
        let short_rise = &windows.short[previous_shape as usize][..];
        let short_fall = &windows.short[window_shape as usize][..];
        let output = &mut output[..1024];
        if window_sequence == EIGHT_SHORT_SEQUENCE {
            self.eight_short(spectrum, short_rise, short_fall, overlap, output);
            return;
        }
        LONG.run(spectrum, &mut self.dct, &mut self.work);
        let u = &self.dct;
        // The IMDCT y(n) of 2048 samples from u: y(n) = u(n + 512) below 512,
        // -u(1535 - n) up to 1536, and -u(n - 1536) above. Laid out once, so
        // that the windowing below is plain loops.
        let y = &mut self.short_frame;
        y[..512].copy_from_slice(&u[512..]);
        for (y, &u) in y[512..1536].iter_mut().zip(u.iter().rev()) {
            *y = -u;
        }
        for (y, &u) in y[1536..].iter_mut().zip(&u[..512]) {
            *y = -u;
        }
        let (first, second) = y.split_at(1024);
        // The left half: the long window's rising half, or for a LONG_STOP
        // window nothing for 448 samples, a short rising half, then ones.
        if window_sequence == LONG_STOP_SEQUENCE {
            output[..448].copy_from_slice(&overlap[..448]);
            for n in 448..576 {
                output[n] = overlap[n] + first[n] * short_rise[n - 448];
            }
            for n in 576..1024 {
                output[n] = overlap[n] + first[n];
            }
        } else {
            for (((out, &o), &y), &w) in output
                .iter_mut()
                .zip(overlap.iter())
                .zip(first)
                .zip(long_rise)
            {
                *out = o + y * w;
            }
        }
        // The right half, kept: the long window's falling half, or for a
        // LONG_START window ones for 448 samples, a short falling half, then
        // nothing.
        if window_sequence == LONG_START_SEQUENCE {
            overlap[..448].copy_from_slice(&second[..448]);
            for n in 448..576 {
                overlap[n] = second[n] * short_fall[575 - n];
            }
            overlap[576..].fill(0.0);
        } else {
            for ((o, &y), &w) in overlap.iter_mut().zip(second).zip(long_fall.iter().rev()) {
                *o = y * w;
            }
        }
    }

    /// Eight short windows, each 256 samples, laid 128 apart from sample 448
    /// on. Only the first one's rising half takes the previous frame's shape.
    fn eight_short(
        &mut self,
        spectrum: &[f32; 1024],
        first_rise: &[f32],
        fall: &[f32],
        overlap: &mut [f32; 1024],
        output: &mut [f32],
    ) {
        let frame = &mut self.short_frame;
        frame[448..1600].fill(0.0);
        for w in 0..8 {
            let u = &mut self.dct[w * 128..w * 128 + 128];
            SHORT.run(&spectrum[w * 128..w * 128 + 128], u, &mut self.work);
            let rise = if w == 0 { first_rise } else { fall };
            // As for the long window: y(n) = u(n + 64) below 64, -u(191 - n)
            // up to 192, and -u(n - 192) above.
            let at = 448 + 128 * w;
            for n in 0..64 {
                frame[at + n] += u[n + 64] * rise[n];
            }
            for n in 64..128 {
                frame[at + n] -= u[191 - n] * rise[n];
            }
            for n in 128..192 {
                frame[at + n] -= u[191 - n] * fall[255 - n];
            }
            for n in 192..256 {
                frame[at + n] -= u[n - 192] * fall[255 - n];
            }
        }
        output[..448].copy_from_slice(&overlap[..448]);
        for n in 448..1024 {
            output[n] = overlap[n] + frame[n];
        }
        overlap[..576].copy_from_slice(&frame[1024..1600]);
        overlap[576..].fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The IMDCT straight from its definition.
    fn imdct_direct(spectrum: &[f32]) -> Vec<f64> {
        let m = spectrum.len();
        let n = 2 * m;
        let n0 = (n as f64 / 2.0 + 1.0) / 2.0;
        (0..n)
            .map(|i| {
                2.0 / n as f64
                    * spectrum
                        .iter()
                        .enumerate()
                        .map(|(k, &x)| {
                            x as f64
                                * (2.0 * PI / n as f64 * (i as f64 + n0) * (k as f64 + 0.5)).cos()
                        })
                        .sum::<f64>()
            })
            .collect()
    }

    fn test_spectrum(m: usize) -> Vec<f32> {
        let mut state = 12345u32;
        (0..m)
            .map(|_| {
                state = state.wrapping_mul(1_103_515_245).wrapping_add(12345);
                ((state >> 8) as f32 / (1 << 24) as f32 - 0.5) * 2000.0
            })
            .collect()
    }

    /// The fast DCT-IV read out as the IMDCT matches the definition, for both
    /// sizes.
    #[test]
    fn fast_transform_matches_the_definition() {
        for (dct, m) in [(&*LONG, 1024), (&*SHORT, 128)] {
            let spectrum = test_spectrum(m);
            let mut u = vec![0.0; m];
            let mut work = [[0.0; 512]; 2];
            dct.run(&spectrum, &mut u, &mut work);
            let expected = imdct_direct(&spectrum);
            let half = m / 2;
            for (i, &want) in expected.iter().enumerate() {
                let got = if i < half {
                    u[i + half]
                } else if i < 3 * half {
                    -u[3 * half - 1 - i]
                } else {
                    -u[i - 3 * half]
                } as f64
                    * 32768.0;
                assert!(
                    (got - want).abs() < 1e-3,
                    "m {m} sample {i}: {got} against {want}"
                );
            }
        }
    }

    /// A constant signal windowed, transformed and overlapped back is the
    /// signal again from the second frame on, through every window sequence
    /// and shape change: time-domain aliasing cancels.
    #[test]
    fn overlap_add_reconstructs_through_window_changes() {
        // Forward MDCT straight from the definition, of 2048 windowed samples
        // or of eight short windows.
        fn mdct(frame: &[f64]) -> Vec<f32> {
            let n = frame.len();
            let n0 = (n as f64 / 2.0 + 1.0) / 2.0;
            (0..n / 2)
                .map(|k| {
                    (2.0 * frame
                        .iter()
                        .enumerate()
                        .map(|(i, &x)| {
                            x * (2.0 * PI / n as f64 * (i as f64 + n0) * (k as f64 + 0.5)).cos()
                        })
                        .sum::<f64>()) as f32
                })
                .collect()
        }
        let signal = |i: usize| 1000.0 * (i as f64 * 0.01).sin() + 300.0;
        let sequences = [
            (0u8, 0u8),
            (0, 1),
            (1, 1),
            (2, 0),
            (2, 1),
            (3, 0),
            (0, 0),
            (1, 0),
            (3, 1),
        ];
        let mut bank = Filterbank::new();
        let mut overlap = [0.0f32; 1024];
        let mut previous = 0u8;
        for (frame, &(sequence, shape)) in sequences.iter().enumerate() {
            // The window this frame's encoder would have used.
            let windows = &*WINDOWS;
            let mut spectrum = [0.0f32; 1024];
            let start = frame * 1024;
            if sequence == EIGHT_SHORT_SEQUENCE {
                for w in 0..8 {
                    let rise = &windows.short[if w == 0 { previous } else { shape } as usize];
                    let fall = &windows.short[shape as usize];
                    let block: Vec<f64> = (0..256)
                        .map(|i| {
                            let weight = if i < 128 { rise[i] } else { fall[255 - i] };
                            signal(start + 448 + 128 * w + i) * weight as f64
                        })
                        .collect();
                    spectrum[w * 128..w * 128 + 128].copy_from_slice(&mdct(&block));
                }
            } else {
                let long_rise = &windows.long[previous as usize];
                let long_fall = &windows.long[shape as usize];
                let short_rise = &windows.short[previous as usize];
                let short_fall = &windows.short[shape as usize];
                let block: Vec<f64> = (0..2048)
                    .map(|i| {
                        let weight = if i < 1024 {
                            if sequence == LONG_STOP_SEQUENCE {
                                match i {
                                    0..448 => 0.0,
                                    448..576 => short_rise[i - 448],
                                    _ => 1.0,
                                }
                            } else {
                                long_rise[i]
                            }
                        } else if sequence == LONG_START_SEQUENCE {
                            match i - 1024 {
                                0..448 => 1.0,
                                j @ 448..576 => short_fall[575 - j],
                                _ => 0.0,
                            }
                        } else {
                            long_fall[2047 - i]
                        };
                        signal(start + i) * weight as f64
                    })
                    .collect();
                spectrum.copy_from_slice(&mdct(&block));
            }
            let mut output = [0.0f32; 1024];
            bank.synthesise(
                &spectrum,
                sequence,
                shape,
                previous,
                &mut overlap,
                &mut output,
            );
            if frame > 0 {
                for (i, &got) in output.iter().enumerate() {
                    let want = signal(start + i) / 32768.0;
                    assert!(
                        (got as f64 - want).abs() < 1e-5,
                        "frame {frame} sample {i}: {got} against {want}"
                    );
                }
            }
            previous = shape;
        }
    }
}
