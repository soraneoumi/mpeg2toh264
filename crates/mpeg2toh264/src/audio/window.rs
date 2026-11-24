//! The window shapes of the filterbank (ISO/IEC 14496-3 4.6.11.3.2).

use std::f64::consts::PI;
use std::sync::LazyLock;

/// The rising halves of the windows, by `window_shape`: sine, then
/// Kaiser-Bessel derived. A falling half is a rising one read backwards.
pub(crate) struct Windows {
    pub long: [Vec<f32>; 2],
    pub short: [Vec<f32>; 2],
}

pub(crate) static WINDOWS: LazyLock<Windows> = LazyLock::new(|| Windows {
    long: [sine(2048), kaiser_bessel_derived(2048, 4.0)],
    short: [sine(256), kaiser_bessel_derived(256, 6.0)],
});

/// w(n) = sin(pi / N (n + 1/2)), for the first half of a window of `n` samples.
fn sine(n: usize) -> Vec<f32> {
    (0..n / 2)
        .map(|i| (PI / n as f64 * (i as f64 + 0.5)).sin() as f32)
        .collect()
}

/// The first half of the Kaiser-Bessel derived window of `n` samples with
/// alpha `alpha`: the square root of the running sum of the Kaiser-Bessel
/// kernel W(p) = I0(pi alpha sqrt(1 - ((p - N/4) / (N/4))^2)) / I0(pi alpha),
/// 0 <= p <= N/2, over its whole sum.
fn kaiser_bessel_derived(n: usize, alpha: f64) -> Vec<f32> {
    let quarter = n as f64 / 4.0;
    let kernel: Vec<f64> = (0..=n / 2)
        .map(|p| {
            let x = (p as f64 - quarter) / quarter;
            bessel_i0(PI * alpha * (1.0 - x * x).sqrt())
        })
        .collect();
    let total: f64 = kernel.iter().sum();
    let mut sum = 0.0;
    kernel[..n / 2]
        .iter()
        .map(|w| {
            sum += w;
            (sum / total).sqrt() as f32
        })
        .collect()
}

/// The modified Bessel function of the first kind of order zero, by its power
/// series sum ((x/2)^k / k!)^2, which converges fast for the arguments here.
fn bessel_i0(x: f64) -> f64 {
    let mut sum = 1.0;
    let mut term = 1.0;
    let half = x / 2.0;
    for k in 1..100 {
        term *= half / k as f64;
        let square = term * term;
        sum += square;
        if square < sum * 1e-17 {
            break;
        }
    }
    sum
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Both shapes meet the Princen-Bradley condition w(n)^2 + w(n + N/2)^2
    /// = 1, which is what lets overlapping halves add back to the signal, and
    /// rise from near zero to near one.
    #[test]
    fn windows_reconstruct_perfectly() {
        for half in WINDOWS.long.iter().chain(&WINDOWS.short) {
            let n = half.len();
            for i in 0..n {
                // The falling half at n + i is the rising one at n - 1 - i.
                let (a, b) = (half[i] as f64, half[n - 1 - i] as f64);
                assert!((a * a + b * b - 1.0).abs() < 1e-6);
            }
            assert!(half[0] < 0.01 && half[n - 1] > 0.99);
        }
    }

    #[test]
    fn bessel_matches_known_values() {
        assert_eq!(bessel_i0(0.0), 1.0);
        // I0(1) and I0(10) to the digits tabulated.
        assert!((bessel_i0(1.0) - 1.266_065_877_752_008_4).abs() < 1e-15);
        assert!((bessel_i0(10.0) / 2_815.716_628_466_254 - 1.0).abs() < 1e-14);
    }
}
