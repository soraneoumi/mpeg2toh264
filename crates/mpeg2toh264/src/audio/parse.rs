//! A raw_data_block read into what the decoder needs of it.

use crate::container::aac::{
    read_block, Element, IcsInfo, PceInfo, Sink, TnsFilter, ID_CPE, INTENSITY_HCB, INTENSITY_HCB2,
    NOISE_HCB,
};

/// One `individual_channel_stream`.
pub(crate) struct ChannelData {
    pub global_gain: u8,
    pub info: IcsInfo,
    /// By band, numbered `group * max_sfb + band`: the codebook, and the
    /// scalefactor, noise energy or intensity position the scale factor data
    /// comes to (see [`Sink::band`]).
    pub band_types: [u8; 128],
    pub band_values: [i32; 128],
    /// How many pulses there are; zero without `pulse_data`.
    pub pulse_count: usize,
    pub pulse_positions: [u16; 4],
    pub pulse_amplitudes: [u8; 4],
    pub tns_present: bool,
    /// By window: one for a long window sequence, eight for short windows.
    pub tns: [TnsWindow; 8],
    /// The quantised values, by `window * 128 + line` for short windows.
    /// Only the lines of bands coded with a spectral book are this block's;
    /// the rest hold whatever an earlier block left.
    pub spectrum: [i32; 1024],
}

#[derive(Clone, Copy, Default)]
pub(crate) struct TnsWindow {
    pub filters: usize,
    pub coef_res: u8,
    pub filter: [TnsFilter; 3],
}

impl ChannelData {
    fn new(info: IcsInfo) -> Self {
        Self {
            global_gain: 0,
            info,
            band_types: [0; 128],
            band_values: [0; 128],
            pulse_count: 0,
            pulse_positions: [0; 4],
            pulse_amplitudes: [0; 4],
            tns_present: false,
            tns: [TnsWindow::default(); 8],
            spectrum: [0; 1024],
        }
    }

    /// The codebook of every band this channel codes, by band number.
    fn band_types(&self) -> &[u8] {
        &self.band_types[..self.info.groups * self.info.max_sfb]
    }
}

/// A channel element and where its channels are in [`ParsedBlock`].
pub(crate) struct ChannelElement {
    pub id: u8,
    pub tag: u8,
    pub first_channel: usize,
    pub common_window: bool,
    pub ms_mask_present: u8,
    /// By band of the shared window, under `ms_mask_present` 1.
    pub ms_used: [bool; 128],
}

impl ChannelElement {
    /// Whether mid/side coding is on for a band, which every band is under
    /// `ms_mask_present` 2.
    pub fn ms_used(&self, band: usize) -> bool {
        match self.ms_mask_present {
            1 => self.ms_used[band],
            2 => true,
            _ => false,
        }
    }
}

/// Everything one raw_data_block says, as the decoder needs it. Reused frame to
/// frame: its storage grows to the most channels a block had and stays.
pub struct ParsedBlock {
    elements: Vec<Element>,
    pce: Option<PceInfo>,
    frequency_index: u8,
    channel_elements: Vec<ChannelElement>,
    /// Grows only; the first `channel_count` are this block's.
    channels: Vec<ChannelData>,
    channel_count: usize,
}

/// Which coding tools a block uses, for telling what a stream exercises.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Tools {
    pub short_windows: bool,
    pub mid_side: bool,
    pub intensity: bool,
    pub noise: bool,
    pub tns: bool,
    pub pulse: bool,
}

impl Default for ParsedBlock {
    fn default() -> Self {
        Self::new()
    }
}

impl ParsedBlock {
    pub fn new() -> Self {
        Self {
            elements: Vec::new(),
            pce: None,
            frequency_index: 0,
            channel_elements: Vec::new(),
            channels: Vec::new(),
            channel_count: 0,
        }
    }

    /// Every element before `ID_END`, as [`walk_block`] reports them.
    ///
    /// [`walk_block`]: crate::container::aac::walk_block
    pub fn elements(&self) -> &[Element] {
        &self.elements
    }

    /// The `program_config_element` that describes the channels, as
    /// [`walk_block`] reports it.
    ///
    /// [`walk_block`]: crate::container::aac::walk_block
    pub fn pce(&self) -> Option<&PceInfo> {
        self.pce.as_ref()
    }

    pub fn tools(&self) -> Tools {
        let mut tools = Tools::default();
        for channel in self.channels() {
            tools.short_windows |= channel.info.short();
            tools.pulse |= channel.pulse_count != 0;
            tools.tns |= channel.tns_present
                && channel.tns[..if channel.info.short() { 8 } else { 1 }]
                    .iter()
                    .any(|window| {
                        window.filter[..window.filters]
                            .iter()
                            .any(|filter| filter.order != 0)
                    });
            for &cb in channel.band_types() {
                tools.noise |= cb == NOISE_HCB;
                tools.intensity |= cb == INTENSITY_HCB || cb == INTENSITY_HCB2;
            }
        }
        for element in &self.channel_elements {
            if element.id == ID_CPE && element.common_window {
                let channel = &self.channels[element.first_channel];
                let bands = channel.info.groups * channel.info.max_sfb;
                tools.mid_side |= (0..bands).any(|band| element.ms_used(band));
            }
        }
        tools
    }

    pub(crate) fn frequency_index(&self) -> u8 {
        self.frequency_index
    }

    pub(crate) fn channel_elements(&self) -> &[ChannelElement] {
        &self.channel_elements
    }

    pub(crate) fn channels(&self) -> &[ChannelData] {
        &self.channels[..self.channel_count]
    }

    fn current(&mut self) -> &mut ChannelData {
        &mut self.channels[self.channel_count - 1]
    }
}

impl Sink for ParsedBlock {
    fn channel_element(&mut self, id: u8, tag: u8) {
        self.channel_elements.push(ChannelElement {
            id,
            tag,
            first_channel: self.channel_count,
            common_window: false,
            ms_mask_present: 0,
            ms_used: [false; 128],
        });
    }

    fn common_window(&mut self, ms_mask_present: u8) {
        let element = self.channel_elements.last_mut().expect("inside an element");
        element.common_window = true;
        element.ms_mask_present = ms_mask_present;
    }

    fn ms_used(&mut self, band: usize, used: bool) {
        self.channel_elements
            .last_mut()
            .expect("inside an element")
            .ms_used[band] = used;
    }

    fn channel(&mut self, global_gain: u8, info: &IcsInfo) {
        if self.channel_count == self.channels.len() {
            self.channels.push(ChannelData::new(*info));
        }
        self.channel_count += 1;
        let channel = self.current();
        channel.global_gain = global_gain;
        channel.info = *info;
        channel.pulse_count = 0;
        channel.tns_present = false;
    }

    #[inline]
    fn band(&mut self, band: usize, codebook: u8, value: i32) {
        let channel = self.current();
        channel.band_types[band] = codebook;
        channel.band_values[band] = value;
    }

    fn pulses(&mut self, count: usize, positions: [u16; 4], amplitudes: [u8; 4]) {
        let channel = self.current();
        channel.pulse_count = count;
        channel.pulse_positions = positions;
        channel.pulse_amplitudes = amplitudes;
    }

    fn tns_window(&mut self, window: usize, filters: usize, coef_res: u8) {
        let channel = self.current();
        channel.tns_present = true;
        channel.tns[window].filters = filters;
        channel.tns[window].coef_res = coef_res;
    }

    fn tns_filter(&mut self, window: usize, index: usize, filter: &TnsFilter) {
        self.current().tns[window].filter[index] = *filter;
    }

    #[inline(always)]
    fn spectral<const N: usize>(&mut self, at: usize, values: [i32; N]) {
        self.current().spectrum[at..at + N].copy_from_slice(&values);
    }
}

/// Parse the whole raw_data_block in `data` into `out`. False exactly where
/// [`walk_block`] gives `None`, and `out` then holds nothing to decode.
///
/// [`walk_block`]: crate::container::aac::walk_block
pub fn parse_block(data: &[u8], frequency_index: u8, out: &mut ParsedBlock) -> bool {
    out.channel_elements.clear();
    out.channel_count = 0;
    out.frequency_index = frequency_index;
    let mut elements = std::mem::take(&mut out.elements);
    let read = read_block(data, frequency_index, &mut elements, out);
    out.elements = elements;
    match read {
        Some(pce) => {
            out.pce = pce;
            true
        }
        None => {
            out.pce = None;
            out.channel_elements.clear();
            out.channel_count = 0;
            false
        }
    }
}
