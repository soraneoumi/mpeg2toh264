//! The decoder: a parsed block in, 1024 samples per channel out.

use super::imdct::Filterbank;
use super::layout::{layout_of, ChannelLayout, LayoutKey};
use super::parse::{ChannelData, ChannelElement, ParsedBlock};
use super::spectrum::{joint_stereo, reconstruct, Noise};
use super::{tns, FRAME_SAMPLES};
use crate::container::aac::{program_config_element, PceInfo, ID_CPE};
use crate::container::adts::SAMPLE_RATES;
use crate::error::{bail, Result};

/// One decoded access unit: 1024 samples per channel, planar, full scale 1.0.
pub struct PcmFrame {
    layout: ChannelLayout,
    sample_rate: u32,
    channels: usize,
    samples: Vec<f32>,
}

impl Default for PcmFrame {
    fn default() -> Self {
        Self::new()
    }
}

impl PcmFrame {
    pub fn new() -> Self {
        Self {
            layout: no_layout(),
            sample_rate: 0,
            channels: 0,
            samples: Vec::new(),
        }
    }

    pub fn layout(&self) -> &ChannelLayout {
        &self.layout
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> usize {
        self.channels
    }

    /// The 1024 samples of channel `index`.
    pub fn channel(&self, index: usize) -> &[f32] {
        assert!(
            index < self.channels,
            "channel {index} of {}",
            self.channels
        );
        &self.samples[index * FRAME_SAMPLES..(index + 1) * FRAME_SAMPLES]
    }

    /// Take on `layout` and `sample_rate`, with room for its channels. The
    /// layout is only cloned when it changes.
    fn shape(&mut self, layout: &ChannelLayout, channels: usize, sample_rate: u32) {
        if self.layout != *layout {
            self.layout = layout.clone();
        }
        self.sample_rate = sample_rate;
        self.channels = channels;
        if self.samples.len() < channels * FRAME_SAMPLES {
            self.samples.resize(channels * FRAME_SAMPLES, 0.0);
        }
    }

    /// A frame of `layout` holding `channels`, for testing what takes frames.
    #[cfg(test)]
    pub(crate) fn from_channels(layout: ChannelLayout, channels: &[Vec<f32>]) -> Self {
        let mut frame = Self::new();
        frame.shape(&layout, channels.len(), 48_000);
        for (index, samples) in channels.iter().enumerate() {
            frame.channel_mut(index).copy_from_slice(samples);
        }
        frame
    }

    fn channel_mut(&mut self, index: usize) -> &mut [f32] {
        &mut self.samples[index * FRAME_SAMPLES..(index + 1) * FRAME_SAMPLES]
    }
}

/// The spectra of one channel element's channels, every tool before the
/// filterbank applied, into `spectra`; and how many channels it has.
pub(super) fn element_spectra(
    element: &ChannelElement,
    channels: &[ChannelData],
    frequency_index: u8,
    noise: &mut Noise,
    spectra: &mut [[f32; 1024]; 2],
) -> usize {
    let at = element.first_channel;
    let [left, right] = spectra;
    reconstruct(&channels[at], noise, None, left);
    let count = if element.id == ID_CPE {
        reconstruct(
            &channels[at + 1],
            noise,
            Some((element, &channels[at], left)),
            right,
        );
        joint_stereo(element, &channels[at], &channels[at + 1], left, right);
        2
    } else {
        1
    };
    for (offset, spectrum) in spectra[..count].iter_mut().enumerate() {
        tns::apply(&channels[at + offset], frequency_index, spectrum);
    }
    count
}

/// What a frame that has decoded nothing yet describes.
fn no_layout() -> ChannelLayout {
    ChannelLayout::Speakers {
        speakers: Vec::new(),
        matrix_mixdown: None,
    }
}

/// What one channel carries from a frame to the next.
struct ChannelState {
    /// The second half of the last frame's windowed IMDCT.
    overlap: [f32; 1024],
    /// The last frame's `window_shape`, which the left half of the next
    /// frame's window takes.
    window_shape: u8,
}

impl ChannelState {
    fn new() -> Self {
        Self {
            overlap: [0.0; 1024],
            window_shape: 0,
        }
    }
}

/// The layout the decoder is in, and the rate.
struct Current {
    key: LayoutKey,
    layout: ChannelLayout,
    sample_rate: u32,
}

/// An AAC-LC decoder for one stream.
pub struct AacDecoder {
    current: Option<Current>,
    /// The last `program_config_element` the stream carried, which describes
    /// the blocks after it that carry none.
    pce: Option<PceInfo>,
    /// The one the stream's AudioSpecificConfig carries, which describes the
    /// blocks that carry none when the stream has not carried one itself; see
    /// [`AacDecoder::configure`].
    configured_pce: Option<PceInfo>,
    /// By output channel.
    channels: Vec<ChannelState>,
    /// The spectra of the element being decoded, one per channel.
    spectra: Box<[[f32; 1024]; 2]>,
    filterbank: Box<Filterbank>,
    noise: Noise,
}

impl Default for AacDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl AacDecoder {
    pub fn new() -> Self {
        Self {
            current: None,
            pce: None,
            configured_pce: None,
            channels: Vec::new(),
            spectra: Box::new([[0.0; 1024]; 2]),
            filterbank: Box::new(Filterbank::new()),
            noise: Noise::new(),
        }
    }

    /// Take the stream's AudioSpecificConfig (ISO/IEC 14496-3 1.6.2.1), as a
    /// container hands it over. All that is used of it is the
    /// `program_config_element` a channelConfiguration of zero carries: the
    /// blocks of such a stream need not carry one, and nothing else says what
    /// their channels are. It describes those blocks from here on, in place of
    /// any the stream carried under an earlier configuration; one that a block
    /// carries later takes over from it. Any other configuration leaves the
    /// blocks to describe themselves, or their ADTS headers to.
    ///
    /// Fails on a configuration that is not AAC-LC as `decode` takes it, and
    /// on a `program_config_element` that does not fit in it, leaving the
    /// decoder with no configured element.
    pub fn configure(&mut self, audio_specific_config: &[u8]) -> Result<()> {
        self.configured_pce = None;
        self.pce = None;
        let Some(&[first, second]) = audio_specific_config.first_chunk::<2>() else {
            bail!("an AudioSpecificConfig is at least two bytes");
        };
        let object_type = first >> 3;
        let frequency_index = ((first & 7) << 1) | (second >> 7);
        let channel_configuration = (second >> 3) & 0x0f;
        // GASpecificConfig: frameLengthFlag, dependsOnCoreCoder, extensionFlag.
        let flags = second & 7;
        if object_type != 2 {
            bail!("AudioSpecificConfig is audio object type {object_type}, not AAC-LC");
        }
        if usize::from(frequency_index) >= SAMPLE_RATES.len() {
            bail!("unsupported AudioSpecificConfig sampling_frequency_index {frequency_index}");
        }
        if flags != 0 {
            bail!("AudioSpecificConfig asks for 960-sample frames, a core coder or an extension");
        }
        if channel_configuration == 0 {
            let (pce, end) = program_config_element(audio_specific_config, 16);
            if end > audio_specific_config.len() * 8 {
                bail!("the AudioSpecificConfig's program_config_element runs past its end");
            }
            self.configured_pce = Some(pce);
        }
        Ok(())
    }

    /// Decode one parsed block. `channel_configuration` and `frequency_index`
    /// are the ADTS header's. A layout or rate different from the previous
    /// frame's resets the per-channel state first.
    ///
    /// Fails only where the block's channels cannot be given speakers; see
    /// `layout_of`. The decoder's state is then as it was.
    pub fn decode(
        &mut self,
        block: &ParsedBlock,
        channel_configuration: u8,
        frequency_index: u8,
        out: &mut PcmFrame,
    ) -> Result<()> {
        if block.frequency_index() != frequency_index {
            bail!(
                "AAC block was parsed at sampling_frequency_index {}, not {frequency_index}",
                block.frequency_index()
            );
        }
        let Some(&sample_rate) = SAMPLE_RATES.get(frequency_index as usize) else {
            bail!("unsupported AAC sampling_frequency_index {frequency_index}");
        };
        let kept = self.pce.as_ref().or(self.configured_pce.as_ref());
        let key = layout_of(block, channel_configuration, kept)?;
        if channel_configuration == 0 {
            if let Some(pce) = block.pce() {
                self.pce = Some(pce.clone());
            }
        }
        let same = self
            .current
            .as_ref()
            .is_some_and(|current| current.key == key && current.sample_rate == sample_rate);
        if !same {
            self.channels.clear();
            self.channels.resize_with(key.channels(), ChannelState::new);
            self.current = Some(Current {
                key,
                layout: key.layout(),
                sample_rate,
            });
        }
        let current = self.current.as_ref().expect("set above");
        out.shape(&current.layout, key.channels(), sample_rate);

        let channels = block.channels();
        for element in block.channel_elements() {
            let at = element.first_channel;
            let count = element_spectra(
                element,
                channels,
                frequency_index,
                &mut self.noise,
                &mut self.spectra,
            );
            for (offset, spectrum) in self.spectra[..count].iter().enumerate() {
                let channel = &channels[at + offset];
                let state = &mut self.channels[at + offset];
                self.filterbank.synthesise(
                    spectrum,
                    channel.info.window_sequence,
                    channel.info.window_shape,
                    state.window_shape,
                    &mut state.overlap,
                    out.channel_mut(at + offset),
                );
                state.window_shape = channel.info.window_shape;
            }
        }
        Ok(())
    }

    /// An access unit lost to damage: produce what a frame of the last layout
    /// with every spectral value zero would give, so that each channel's
    /// overlap fades out rather than stopping, and carry on from it. Each
    /// channel keeps its window shape, which is all a zero spectrum leaves of
    /// the frame. Before any frame was decoded there is no layout, and the
    /// frame has no channels.
    pub fn conceal(&mut self, out: &mut PcmFrame) {
        let Some(current) = &self.current else {
            out.shape(&no_layout(), 0, 0);
            return;
        };
        out.shape(&current.layout, current.key.channels(), current.sample_rate);
        for (index, state) in self.channels.iter_mut().enumerate() {
            // Zero windowed is zero: the output is the overlap alone, and
            // nothing overlaps the next frame.
            out.channel_mut(index).copy_from_slice(&state.overlap);
            state.overlap.fill(0.0);
        }
    }

    /// Forget all state, as at a seek or a discontinuity. What
    /// [`AacDecoder::configure`] was given still holds: it describes the
    /// stream, not a place in it.
    pub fn reset(&mut self) {
        self.current = None;
        self.pce = None;
        self.channels.clear();
        self.noise = Noise::new();
    }
}
