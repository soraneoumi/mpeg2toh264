//! Which speaker each decoded channel is for.

use super::parse::ParsedBlock;
use crate::container::aac::{PceElement, PceInfo, ID_CPE, ID_LFE, ID_SCE};
use crate::error::{bail, Result};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Speaker {
    FrontCentre,
    FrontLeft,
    FrontRight,
    SurroundLeft,
    SurroundRight,
    /// A single rear or side channel, as the 3/1 and 2/1 modes have.
    Surround,
    Lfe,
}

#[derive(Clone, PartialEq, Debug)]
pub enum ChannelLayout {
    /// One single channel element, with no `program_config_element`.
    Mono,
    /// Two single channel elements with no `program_config_element`: ARIB dual
    /// mono. Channel 0 is the main service, channel 1 the second.
    DualMono,
    /// Every other layout: one speaker per output channel, in output order,
    /// which is the order of the elements.
    Speakers {
        speakers: Vec<Speaker>,
        matrix_mixdown: Option<MatrixMixdown>,
    },
}

/// The `matrix_mixdown_idx` and `pseudo_surround_enable` of a
/// `program_config_element`.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct MatrixMixdown {
    pub index: u8,
    pub pseudo_surround: bool,
}

/// The most channels a layout has: 5.1.
const MAX_CHANNELS: usize = 6;

/// A layout as the decoder works it out each frame, without allocating.
#[derive(Clone, Copy, PartialEq, Debug)]
pub(crate) enum LayoutKey {
    Mono,
    DualMono,
    Speakers {
        speakers: [Speaker; MAX_CHANNELS],
        len: usize,
        matrix_mixdown: Option<MatrixMixdown>,
    },
}

impl LayoutKey {
    pub fn channels(&self) -> usize {
        match self {
            Self::Mono => 1,
            Self::DualMono => 2,
            Self::Speakers { len, .. } => *len,
        }
    }

    pub fn layout(&self) -> ChannelLayout {
        match *self {
            Self::Mono => ChannelLayout::Mono,
            Self::DualMono => ChannelLayout::DualMono,
            Self::Speakers {
                speakers,
                len,
                matrix_mixdown,
            } => ChannelLayout::Speakers {
                speakers: speakers[..len].to_vec(),
                matrix_mixdown,
            },
        }
    }

    fn speakers(list: &[Speaker], matrix_mixdown: Option<MatrixMixdown>) -> Self {
        let mut speakers = [Speaker::Lfe; MAX_CHANNELS];
        speakers[..list.len()].copy_from_slice(list);
        Self::Speakers {
            speakers,
            len: list.len(),
            matrix_mixdown,
        }
    }
}

use Speaker::*;

/// The speakers of `block`'s channels.
///
/// `channel_configuration` is the ADTS header's. Under 3 to 6 the elements are
/// the ones ISO/IEC 14496-3 Table 1.19 lists, in its order.
///
/// Under 0, 1 and 2 a single channel element is mono and two are ARIB dual
/// mono, whatever a `program_config_element` says: ARIB switches a programme
/// between mono, dual mono and stereo within one stream under a header of one,
/// two or no channels -- which is why the ADTS reader takes all of them -- and
/// a broadcast's dual mono comes with a `program_config_element` that names
/// its two services as two front channels. A channel pair is stereo under 2
/// and, without a `program_config_element`, under 0.
///
/// Otherwise under 0 a `program_config_element` describes the elements: the
/// block's own, or else `kept`, the last one the stream carried. A kept one
/// that names other elements than the block has does not describe it -- the
/// stream has changed to a layout that goes without one -- and the block is
/// read as if there were none.
pub(crate) fn layout_of(
    block: &ParsedBlock,
    channel_configuration: u8,
    kept: Option<&PceInfo>,
) -> Result<LayoutKey> {
    let elements = block.channel_elements();
    let mut ids = [0u8; MAX_CHANNELS];
    if elements.len() > MAX_CHANNELS {
        bail!(
            "AAC block has {} channel elements, more than 5.1 has",
            elements.len()
        );
    }
    for (id, element) in ids.iter_mut().zip(elements) {
        *id = element.id;
    }
    let ids = &ids[..elements.len()];
    let implicit = |speakers: &[Speaker], layout: &[u8]| {
        if ids == layout {
            Ok(LayoutKey::speakers(speakers, None))
        } else {
            bail!(
                "AAC channel elements {ids:?} are not the ones channel_configuration \
                 {channel_configuration} has"
            )
        }
    };
    const S: u8 = ID_SCE;
    const C: u8 = ID_CPE;
    const L: u8 = ID_LFE;
    match channel_configuration {
        0 => {
            if let [ID_SCE] | [ID_SCE, ID_SCE] = ids {
                return single_channel_service(ids, channel_configuration);
            }
            if let Some(pce) = block.pce() {
                return pce_layout(block, pce).ok_or_else(|| {
                    crate::Error::new(format!(
                        "AAC program_config_element does not describe channel elements \
                         {ids:?}, or describes more than 5.1"
                    ))
                });
            }
            if let Some(key) = kept.and_then(|pce| pce_layout(block, pce)) {
                return Ok(key);
            }
            single_channel_service(ids, channel_configuration)
        }
        1 | 2 => single_channel_service(ids, channel_configuration),
        3 => implicit(&[FrontCentre, FrontLeft, FrontRight], &[S, C]),
        4 => implicit(&[FrontCentre, FrontLeft, FrontRight, Surround], &[S, C, S]),
        5 => implicit(
            &[
                FrontCentre,
                FrontLeft,
                FrontRight,
                SurroundLeft,
                SurroundRight,
            ],
            &[S, C, C],
        ),
        6 => implicit(
            &[
                FrontCentre,
                FrontLeft,
                FrontRight,
                SurroundLeft,
                SurroundRight,
                Lfe,
            ],
            &[S, C, C, L],
        ),
        _ => bail!("AAC channel_configuration {channel_configuration} is not supported"),
    }
}

fn single_channel_service(ids: &[u8], channel_configuration: u8) -> Result<LayoutKey> {
    Ok(match ids {
        [ID_SCE] => LayoutKey::Mono,
        [ID_SCE, ID_SCE] => LayoutKey::DualMono,
        [ID_CPE] if channel_configuration != 1 => {
            LayoutKey::speakers(&[FrontLeft, FrontRight], None)
        }
        _ => bail!(
            "AAC channel elements {ids:?} are not a layout channel_configuration \
             {channel_configuration} can have"
        ),
    })
}

/// The speakers `pce` gives the block's channel elements, or `None` where it
/// does not name exactly those elements or names more than 5.1.
///
/// The front elements carry the centre when their channels are odd in number,
/// as the first, and at most one left and right pair; the side and back
/// elements together at most two channels, a lone one being a single
/// surround; and there is at most one LFE.
fn pce_layout(block: &ParsedBlock, pce: &PceInfo) -> Option<LayoutKey> {
    // Every element the PCE names with the speakers of its channels.
    let mut named: [(u8, u8, [Speaker; 2]); MAX_CHANNELS] = [(0, 0, [Lfe; 2]); MAX_CHANNELS];
    let mut count = 0;
    let mut name = |element: &PceElement, id: u8, speakers: [Speaker; 2]| {
        if count == MAX_CHANNELS {
            return false;
        }
        named[count] = (id, element.tag, speakers);
        count += 1;
        true
    };
    let id = |element: &PceElement| if element.is_cpe { ID_CPE } else { ID_SCE };

    let front = pce.front.as_slice();
    let mut rest = front;
    if pce.front.channels() % 2 == 1 {
        let (centre, after) = front.split_first()?;
        if centre.is_cpe || !name(centre, ID_SCE, [FrontCentre; 2]) {
            return None;
        }
        rest = after;
    }
    match rest {
        [] => {}
        [pair] if pair.is_cpe => {
            if !name(pair, ID_CPE, [FrontLeft, FrontRight]) {
                return None;
            }
        }
        [left, right] if !left.is_cpe && !right.is_cpe => {
            if !name(left, ID_SCE, [FrontLeft; 2]) || !name(right, ID_SCE, [FrontRight; 2]) {
                return None;
            }
        }
        _ => return None,
    }

    let mut surround = [PceElement::default(); 2];
    let mut surrounds = 0;
    for element in pce.side.as_slice().iter().chain(pce.back.as_slice()) {
        if surrounds == 2 {
            return None;
        }
        surround[surrounds] = *element;
        surrounds += 1;
    }
    match &surround[..surrounds] {
        [] => {}
        [single] if !single.is_cpe => {
            if !name(single, ID_SCE, [Surround; 2]) {
                return None;
            }
        }
        [pair] => {
            if !name(pair, ID_CPE, [SurroundLeft, SurroundRight]) {
                return None;
            }
        }
        [left, right] if !left.is_cpe && !right.is_cpe => {
            if !name(left, id(left), [SurroundLeft; 2])
                || !name(right, id(right), [SurroundRight; 2])
            {
                return None;
            }
        }
        _ => return None,
    }

    match pce.lfe.as_slice() {
        [] => {}
        [lfe] => {
            if !name(lfe, ID_LFE, [Lfe; 2]) {
                return None;
            }
        }
        _ => return None,
    }

    // The block's elements in their order, each one the PCE names, each named
    // element once.
    let elements = block.channel_elements();
    if elements.len() != count {
        return None;
    }
    let mut used = [false; MAX_CHANNELS];
    let mut speakers = [Lfe; MAX_CHANNELS];
    let mut len = 0;
    for element in elements {
        let at = (0..count)
            .find(|&at| !used[at] && named[at].0 == element.id && named[at].1 == element.tag)?;
        used[at] = true;
        let channels = if element.id == ID_CPE { 2 } else { 1 };
        if len + channels > MAX_CHANNELS {
            return None;
        }
        speakers[len..len + channels].copy_from_slice(&named[at].2[..channels]);
        len += channels;
    }
    let matrix_mixdown = pce.matrix_mixdown_idx_present.then_some(MatrixMixdown {
        index: pce.matrix_mixdown_idx,
        pseudo_surround: pce.pseudo_surround_enable,
    });
    Some(LayoutKey::speakers(&speakers[..len], matrix_mixdown))
}
