//! From quantised values to a channel's spectrum: inverse quantisation and
//! scaling, pulses, noise substitution, and the two joint stereo tools.

use super::parse::{ChannelData, ChannelElement};
use crate::container::aac::{IcsInfo, INTENSITY_HCB, INTENSITY_HCB2, NOISE_HCB};
use std::sync::LazyLock;

/// The largest magnitude a spectral value can have: an escape codes up to
/// 2^13 - 1, and a pulse adds up to 15 more.
const MAX_QUANTISED: usize = (1 << 13) - 1 + 15;

/// |q|^(4/3) for every magnitude q a value can have.
static POWER_4_3: LazyLock<Vec<f32>> = LazyLock::new(|| {
    (0..=MAX_QUANTISED)
        .map(|q| (q as f64).powf(4.0 / 3.0) as f32)
        .collect()
});

/// 2^((i - 100) / 4) for i in 0..=255: the gain of a band whose scalefactor is
/// i. Noise energies and intensity positions are gains of the same kind, and
/// are clipped to the range this covers.
static GAINS: LazyLock<[f32; 256]> = LazyLock::new(|| {
    let mut gains = [0.0; 256];
    for (i, gain) in gains.iter_mut().enumerate() {
        *gain = 2f64.powf((i as f64 - 100.0) / 4.0) as f32;
    }
    gains
});

/// The gain 2^(e / 4), with e clipped to what a band scalefactor can express
/// (-100..=155). The noise energy and intensity position of a band are coded
/// as differences with no limit of their own, so a damaged or careless stream
/// can run them anywhere; this keeps every gain finite.
#[inline]
fn gain(exponent: i32) -> f32 {
    GAINS[(exponent.clamp(-100, 155) + 100) as usize]
}

/// The lines of band `band` in window `window`.
#[inline]
fn lines(info: &IcsInfo, window: usize, band: usize) -> std::ops::Range<usize> {
    let base = window * 128;
    base + info.offsets[band] as usize..base + info.offsets[band + 1] as usize
}

/// The source of the noise substituted for noise bands: a linear congruential
/// generator, so that a stream decodes the same every time.
pub(crate) struct Noise {
    state: u32,
}

impl Noise {
    pub const SEED: u32 = 0x1f2e_3d4c;

    pub fn new() -> Self {
        Self { state: Self::SEED }
    }

    #[inline]
    fn next(&mut self) -> f32 {
        self.state = self
            .state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        self.state as i32 as f32
    }

    /// Fill `band` with noise of energy `energy_gain` squared: random values
    /// scaled so their energy is one, then by the gain (ISO/IEC 14496-3
    /// 4.6.13.3).
    fn fill(&mut self, band: &mut [f32], energy_gain: f32) {
        let mut energy = 0.0f32;
        for value in band.iter_mut() {
            *value = self.next();
            energy += *value * *value;
        }
        let scale = energy_gain / energy.sqrt();
        for value in band {
            *value *= scale;
        }
    }
}

/// The spectrum of one channel before the joint stereo tools and TNS:
/// spectral bands inverse quantised and scaled, pulses added, noise
/// substituted, and zeros everywhere else -- the zero book, intensity bands,
/// which the pair fills in from the other channel, and the lines above
/// `max_sfb`.
///
/// `correlated` is, for the second channel of a pair, the pair and its first
/// channel's spectrum: a band both channels code as noise and whose `ms_used`
/// is set takes the first channel's noise, at its own energy, rather than new
/// noise (ISO/IEC 14496-3 4.6.13.3).
pub(crate) fn reconstruct(
    channel: &ChannelData,
    noise: &mut Noise,
    correlated: Option<(&ChannelElement, &ChannelData, &[f32; 1024])>,
    out: &mut [f32; 1024],
) {
    let info = &channel.info;
    let power = &**POWER_4_3;
    let gains = &*GAINS;
    let top = info.offsets[info.max_sfb] as usize;
    let mut window = 0;
    for g in 0..info.groups {
        for w in window..window + info.group_len[g] as usize {
            for band in 0..info.max_sfb {
                let index = g * info.max_sfb + band;
                let range = lines(info, w, band);
                match channel.band_types[index] {
                    1..=11 => {
                        let gain = gains[channel.band_values[index] as usize];
                        for (value, &q) in
                            out[range.clone()].iter_mut().zip(&channel.spectrum[range])
                        {
                            let magnitude = power[q.unsigned_abs() as usize] * gain;
                            *value = if q < 0 { -magnitude } else { magnitude };
                        }
                    }
                    NOISE_HCB => {
                        let energy = gain(channel.band_values[index]);
                        match correlated {
                            Some((pair, first, first_spectrum))
                                if pair.ms_used(index) && first.band_types[index] == NOISE_HCB =>
                            {
                                // The first channel's band holds the same
                                // unit-energy noise times its own gain.
                                let ratio = energy / gain(first.band_values[index]);
                                for (value, &source) in
                                    out[range.clone()].iter_mut().zip(&first_spectrum[range])
                                {
                                    *value = source * ratio;
                                }
                            }
                            _ => noise.fill(&mut out[range], energy),
                        }
                    }
                    _ => out[range].fill(0.0),
                }
            }
            out[w * 128 + top..if info.short() { w * 128 + 128 } else { 1024 }].fill(0.0);
        }
        window += info.group_len[g] as usize;
    }
    if channel.pulse_count != 0 {
        add_pulses(channel, out);
    }
}

/// `pulse_data`: each pulse moves a quantised value of a long window away from
/// zero by its amplitude -- up where it is above zero, down otherwise -- before
/// the value is inverse quantised (ISO/IEC 14496-3 4.6.4.3). Only a band coded
/// with a spectral book has a value and a scalefactor to move; a pulse
/// anywhere else changes nothing.
fn add_pulses(channel: &ChannelData, out: &mut [f32; 1024]) {
    let info = &channel.info;
    // Two pulses can land on one line, and the second then moves the value
    // the first left: (line, band, value) of every line moved.
    let mut moved = [(0usize, 0usize, 0i32); 4];
    let mut count = 0;
    for pulse in 0..channel.pulse_count {
        let line = channel.pulse_positions[pulse] as usize;
        let band = info
            .offsets
            .partition_point(|&offset| offset as usize <= line)
            - 1;
        if band >= info.max_sfb || !matches!(channel.band_types[band], 1..=11) {
            continue;
        }
        let slot = match moved[..count].iter().position(|&(at, ..)| at == line) {
            Some(slot) => slot,
            None => {
                moved[count] = (line, band, channel.spectrum[line]);
                count += 1;
                count - 1
            }
        };
        let amplitude = channel.pulse_amplitudes[pulse] as i32;
        let value = &mut moved[slot].2;
        *value += if *value > 0 { amplitude } else { -amplitude };
    }
    for &(line, band, value) in &moved[..count] {
        let magnitude =
            POWER_4_3[value.unsigned_abs() as usize] * GAINS[channel.band_values[band] as usize];
        out[line] = if value < 0 { -magnitude } else { magnitude };
    }
}

/// M/S stereo and intensity stereo between the two channels of a pair
/// (ISO/IEC 14496-3 4.6.8.1 and 4.6.8.2).
///
/// Mid/side is undone, l = m + s and r = m - s, in the bands `ms_used` marks
/// where both channels carry spectral values or the zero book; a noise or
/// intensity band in either channel is left as it is. An intensity band of the
/// second channel is the first channel's band scaled by 0.5^(position / 4),
/// negated for codebook 14, and negated once more where `ms_mask_present` is 1
/// and the band's `ms_used` is set. Under `ms_mask_present` 2 every band counts
/// as mid/side coded, but the inversion is the specification's
/// `invert_intensity()`, which looks at `ms_used` only under 1; ffmpeg's
/// decoder and encoder invert under 2 as well, so the intensity bands of a
/// stream its encoder made with mask 2 come out of phase with its own decoding.
pub(crate) fn joint_stereo(
    pair: &ChannelElement,
    first: &ChannelData,
    second: &ChannelData,
    left: &mut [f32; 1024],
    right: &mut [f32; 1024],
) {
    let info = &second.info;
    let mut window = 0;
    for g in 0..info.groups {
        let windows = window..window + info.group_len[g] as usize;
        for band in 0..info.max_sfb {
            let index = g * info.max_sfb + band;
            let second_type = second.band_types[index];
            if second_type == INTENSITY_HCB || second_type == INTENSITY_HCB2 {
                let mut scale = gain(-second.band_values[index]);
                if second_type == INTENSITY_HCB2 {
                    scale = -scale;
                }
                if pair.ms_mask_present == 1 && pair.ms_used[index] {
                    scale = -scale;
                }
                for w in windows.clone() {
                    let range = lines(info, w, band);
                    for (r, &l) in right[range.clone()].iter_mut().zip(&left[range]) {
                        *r = l * scale;
                    }
                }
            } else if pair.ms_used(index)
                && second_type < NOISE_HCB
                && first.band_types[index] < NOISE_HCB
            {
                for w in windows.clone() {
                    let range = lines(info, w, band);
                    for (l, r) in left[range.clone()].iter_mut().zip(&mut right[range]) {
                        let (mid, side) = (*l, *r);
                        *l = mid + side;
                        *r = mid - side;
                    }
                }
            }
        }
        window = windows.end;
    }
}
