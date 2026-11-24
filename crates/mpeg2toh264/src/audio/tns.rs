//! Temporal noise shaping (ISO/IEC 14496-3 4.6.9).

use super::parse::ChannelData;
use crate::container::aac::band_count;
use std::f64::consts::FRAC_PI_2;
use std::sync::LazyLock;

/// TNS_MAX_BANDS for AAC-LC by `sampling_frequency_index` (ISO/IEC 14496-3
/// Table 4.155): no filter reaches above this band.
const MAX_BANDS_LONG: [usize; 13] = [31, 31, 34, 40, 42, 51, 46, 46, 42, 42, 42, 39, 39];
const MAX_BANDS_SHORT: [usize; 13] = [9, 9, 10, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14];

/// The reflection coefficient each coded coefficient stands for, by
/// `coef_res` and then by the coefficient plus eight:
/// sin(c / ((2^(bits - 1) - 1/2) / (pi / 2))) for c >= 0 and with + 1/2 for c
/// < 0, where `bits` is the full resolution of three or four bits, whether or
/// not the coefficient was sent compressed.
static REFLECTION: LazyLock<[[f32; 16]; 2]> = LazyLock::new(|| {
    let mut table = [[0.0; 16]; 2];
    for (resolution, row) in table.iter_mut().enumerate() {
        let steps = (1 << (resolution + 2)) as f64;
        let positive = (steps - 0.5) / FRAC_PI_2;
        let negative = (steps + 0.5) / FRAC_PI_2;
        for (at, value) in row.iter_mut().enumerate() {
            let c = at as f64 - 8.0;
            *value = (c / if c >= 0.0 { positive } else { negative }).sin() as f32;
        }
    }
    table
});

/// Apply the channel's TNS filters to its spectrum: each an all-pole filter
/// over the lines of the bands it spans, upwards or downwards.
pub(crate) fn apply(channel: &ChannelData, frequency_index: u8, spectrum: &mut [f32; 1024]) {
    if !channel.tns_present {
        return;
    }
    let info = &channel.info;
    let (windows, max_bands) = if info.short() {
        (8, MAX_BANDS_SHORT[frequency_index as usize])
    } else {
        (1, MAX_BANDS_LONG[frequency_index as usize])
    };
    let limit = max_bands.min(info.max_sfb);
    for (w, window) in channel.tns[..windows].iter().enumerate() {
        // The first filter covers the top `length` bands, and each next one
        // the bands below the one before.
        let mut bottom = band_count(info.offsets);
        for filter in &window.filter[..window.filters] {
            let top = bottom;
            bottom = top.saturating_sub(filter.length as usize);
            let order = filter.order as usize;
            if order == 0 {
                continue;
            }
            let start = w * 128 + info.offsets[bottom.min(limit)] as usize;
            let end = w * 128 + info.offsets[top.min(limit)] as usize;
            if end <= start {
                continue;
            }
            let lpc = predictor(&filter.coef[..order], window.coef_res);
            filter_lines(&mut spectrum[start..end], &lpc[..=order], filter.direction);
        }
    }
}

/// The direct-form coefficients a(0..=order), a(0) = 1, of the filter whose
/// reflection coefficients are coded as `coef`, by the step-up recursion.
fn predictor(coef: &[i8], coef_res: u8) -> [f32; 13] {
    let table = &REFLECTION[coef_res as usize];
    let mut a = [0.0f32; 13];
    let mut b = [0.0f32; 13];
    a[0] = 1.0;
    for (m, &c) in (1..).zip(coef) {
        let k = table[(c as i32 + 8) as usize];
        for i in 1..m {
            b[i] = a[i] + k * a[m - i];
        }
        a[1..m].copy_from_slice(&b[1..m]);
        a[m] = k;
    }
    a
}

/// y(n) = x(n) - sum_{j=1}^{order} a(j) y(n - j), with n running upwards, or
/// downwards where `downwards`, from the first line on with nothing before it.
fn filter_lines(lines: &mut [f32], a: &[f32], downwards: bool) {
    let order = a.len() - 1;
    if downwards {
        let end = lines.len();
        for n in (0..end).rev() {
            let mut y = lines[n];
            for j in 1..=order.min(end - 1 - n) {
                y -= a[j] * lines[n + j];
            }
            lines[n] = y;
        }
    } else {
        for n in 0..lines.len() {
            let mut y = lines[n];
            for j in 1..=order.min(n) {
                y -= a[j] * lines[n - j];
            }
            lines[n] = y;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Values worked out by hand from the formula: with three bits, c = 1 is
    /// sin(1 / (3.5 / (pi / 2))) and c = -4 is sin(-4 / (4.5 / (pi / 2))).
    #[test]
    fn reflection_coefficients_follow_the_quantiser() {
        let three = &REFLECTION[0];
        assert!((three[9] as f64 - (FRAC_PI_2 / 3.5).sin()).abs() < 1e-7);
        assert!((three[4] as f64 - (-4.0 * FRAC_PI_2 / 4.5).sin()).abs() < 1e-7);
        let four = &REFLECTION[1];
        assert!((four[15] as f64 - (7.0 * FRAC_PI_2 / 7.5).sin()).abs() < 1e-7);
        assert!((four[0] as f64 - (-8.0 * FRAC_PI_2 / 8.5).sin()).abs() < 1e-7);
    }

    /// The step-up recursion for two reflection coefficients k1, k2 gives
    /// a = (1, k1 + k2 k1, k2).
    #[test]
    fn step_up_recursion() {
        let k1 = REFLECTION[1][8 + 3];
        let k2 = REFLECTION[1][8 - 5];
        let a = predictor(&[3, -5], 1);
        assert_eq!(a[0], 1.0);
        assert!((a[1] - (k1 + k2 * k1)).abs() < 1e-7);
        assert_eq!(a[2], k2);
        assert!(a[3..].iter().all(|&v| v == 0.0));
    }

    #[test]
    fn filters_in_either_direction() {
        let a = [1.0, -0.5];
        let mut up = [1.0, 0.0, 0.0, 0.0];
        filter_lines(&mut up, &a, false);
        assert_eq!(up, [1.0, 0.5, 0.25, 0.125]);
        let mut down = [0.0, 0.0, 0.0, 1.0];
        filter_lines(&mut down, &a, true);
        assert_eq!(down, [0.125, 0.25, 0.5, 1.0]);
    }
}
