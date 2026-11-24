//! Two channels from any layout, as a Japanese receiver mixes them.
//!
//! ARIB STD-B21 table 6-DM1 (as quoted in JPPA 会報 2009-02) mixes 5.1 to
//! stereo as
//!
//!   Lt = a (L + C / sqrt 2 + k Ls),  Rt = a (R + C / sqrt 2 + k Rs),
//!
//! leaving the LFE out, with k by the `matrix_mixdown_idx` of the
//! `program_config_element` -- 1/sqrt 2, 1/2, 1/(2 sqrt 2) and 0 for 0 to 3 --
//! and 1/sqrt 2 without one. A later revision of STD-B21 dropped the overall
//! a = 1/sqrt 2 (as ARIB TR-B30 summarises it), so a is 1. Nothing is
//! normalised or clipped here: the output stage clamps.

use super::decoder::PcmFrame;
use super::layout::{ChannelLayout, Speaker};
use std::f32::consts::FRAC_1_SQRT_2;

/// k by `matrix_mixdown_idx`.
const SURROUND_GAINS: [f32; 4] = [FRAC_1_SQRT_2, 0.5, FRAC_1_SQRT_2 / 2.0, 0.0];

/// Mix `frame` to stereo into `left` and `right` (1024 samples each), times
/// `gain`. `sub` selects the second service of a dual mono frame and is
/// ignored otherwise.
///
/// Mono, and the chosen service of dual mono, go to both sides at unity. A
/// layout's speakers it lacks count as silence. A single surround channel S --
/// the 3/1 and 2/1 modes -- counts as Ls = Rs = S / sqrt 2, which keeps its
/// power when it is heard from both sides: the table itself was not to hand
/// for those modes, so that is a choice rather than the text.
/// `pseudo_surround_enable` changes nothing. A frame without channels, as one
/// concealed before anything was decoded, is silence.
pub fn to_stereo(frame: &PcmFrame, sub: bool, gain: f32, left: &mut [f32], right: &mut [f32]) {
    let (left, right) = (&mut left[..1024], &mut right[..1024]);
    if frame.channels() == 0 {
        left.fill(0.0);
        right.fill(0.0);
        return;
    }
    match frame.layout() {
        ChannelLayout::Mono => both(frame.channel(0), gain, left, right),
        ChannelLayout::DualMono => both(frame.channel(if sub { 1 } else { 0 }), gain, left, right),
        ChannelLayout::Speakers {
            speakers,
            matrix_mixdown,
        } => {
            let k = matrix_mixdown.map_or(FRAC_1_SQRT_2, |mixdown| {
                SURROUND_GAINS[mixdown.index as usize]
            });
            left.fill(0.0);
            right.fill(0.0);
            for (index, speaker) in speakers.iter().enumerate() {
                let (to_left, to_right) = match speaker {
                    Speaker::FrontLeft => (1.0, 0.0),
                    Speaker::FrontRight => (0.0, 1.0),
                    Speaker::FrontCentre => (FRAC_1_SQRT_2, FRAC_1_SQRT_2),
                    Speaker::SurroundLeft => (k, 0.0),
                    Speaker::SurroundRight => (0.0, k),
                    Speaker::Surround => (k * FRAC_1_SQRT_2, k * FRAC_1_SQRT_2),
                    Speaker::Lfe => continue,
                };
                let samples = frame.channel(index);
                for ((l, r), &x) in left.iter_mut().zip(right.iter_mut()).zip(samples) {
                    *l += x * (to_left * gain);
                    *r += x * (to_right * gain);
                }
            }
        }
    }
}

fn both(samples: &[f32], gain: f32, left: &mut [f32], right: &mut [f32]) {
    for ((l, r), &x) in left.iter_mut().zip(right.iter_mut()).zip(samples) {
        *l = x * gain;
        *r = x * gain;
    }
}
