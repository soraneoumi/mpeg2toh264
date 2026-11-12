//! MPEG-2 video decoding to planar 4:2:0 frames (ITU-T H.262 Main Profile:
//! 4:2:0, 8 bits, up to High level sizes).
//!
//! A [`Decoder`] is driven one coded frame at a time with pictures that
//! [`parse_elementary_stream`](crate::mpeg2::headers::parse_elementary_stream)
//! returned: a frame picture, or the two field pictures of a frame. The
//! caller chooses which pictures to decode. Frames come back in decode
//! order; [`DisplayOrder`] puts them in display order. [`StreamDecoder`]
//! does all of that for a whole elementary stream.
//!
//! Damaged input never stops decoding. A macroblock is concealed when its
//! slice failed to parse before reaching it, when no slice covered it, when
//! its prediction needs a reference frame that is absent, or when its
//! prediction mode is invalid for the picture. A concealed macroblock takes
//! the co-located samples of the most recently decoded reference frame, or
//! mid-grey when there is none. A field picture decoded without its second
//! field conceals the whole of the missing field the same way. Each frame
//! reports how many of its macroblocks were concealed.
//!
//! Prediction, inverse quantisation and the inverse DCT are kept out of line
//! (`#[inline(never)]`). Inlined into the macroblock loop they make one
//! function large enough that WebAssembly engines compile it markedly worse.

mod frame;
mod idct;
mod motion;
mod order;
mod picture;
mod quant;
mod stream;

use std::sync::Arc;

use crate::error::{bail, Result};
use crate::mpeg2::constants::{chroma_format, PictureStructure, PictureType, QUANTISER_SCALE};
use crate::mpeg2::headers::Picture;

pub use frame::{DecodedFrame, FrameInfo, Plane};
pub use order::DisplayOrder;
pub use stream::{StreamDecoder, StreamStats};

use frame::FrameBuffer;
use picture::{conceal, Params, References, Work};

/// Largest picture accepted: High level (Table 8-11).
const MAX_WIDTH: u32 = 1920;
const MAX_HEIGHT: u32 = 1152;

/// Decoder state: the two reference frames and reusable storage.
pub struct Decoder {
    /// The reference before `future`, the forward reference of B frames.
    past: Option<Arc<FrameBuffer>>,
    /// The most recently decoded I or P frame.
    future: Option<Arc<FrameBuffer>>,
    /// Every frame buffer the decoder owns. One is free for reuse when the
    /// pool holds its only handle.
    pool: Vec<Arc<FrameBuffer>>,
    work: Work,
}

impl Default for Decoder {
    fn default() -> Self {
        Self::new()
    }
}

impl Decoder {
    pub fn new() -> Self {
        Self {
            past: None,
            future: None,
            pool: Vec::new(),
            work: Work::new(),
        }
    }

    /// Forget the reference frames, as for a seek. Storage is kept.
    pub fn reset(&mut self) {
        self.past = None;
        self.future = None;
    }

    /// How many reference frames are held: 0, 1 or 2. A P frame needs one and
    /// a B frame two to decode without concealment.
    pub fn references(&self) -> usize {
        self.past.is_some() as usize + self.future.is_some() as usize
    }

    /// Decode one coded frame: a frame picture, or a field picture and the
    /// second field of the same frame. `data` is the buffer the pictures
    /// were parsed from. An I or P frame becomes the newest reference.
    ///
    /// Fails, changing nothing, when the pictures are not something this
    /// decoder handles: MPEG-1, chroma other than 4:2:0, a size beyond High
    /// level, D pictures, a field picture in a progressive sequence, or a
    /// second field that cannot complete the first.
    pub fn decode_frame(
        &mut self,
        data: &[u8],
        picture: &Picture,
        second_field: Option<&Picture>,
    ) -> Result<DecodedFrame> {
        check_picture(picture)?;
        let field_picture = picture.coding.picture_structure != PictureStructure::Frame;
        if let Some(second) = second_field {
            check_second_field(picture, second)?;
        }

        let sequence = &picture.sequence;
        let progressive_sequence = picture.sequence_ext.progressive_sequence;
        let width = sequence.horizontal_size as usize;
        let height = sequence.vertical_size as usize;
        // 6.3.3: interlaced sequences round the height to whole field
        // macroblock rows.
        let coded_width = width.div_ceil(16) * 16;
        let coded_height = if progressive_sequence {
            height.div_ceil(16) * 16
        } else {
            height.div_ceil(32) * 32
        };
        let mb_width = coded_width / 16;

        // References of another size cannot be predicted from.
        for reference in [&mut self.past, &mut self.future] {
            if reference
                .as_ref()
                .is_some_and(|frame| (frame.width, frame.height) != (coded_width, coded_height))
            {
                *reference = None;
            }
        }

        let picture_type = picture.header.picture_coding_type;
        let missing_reference = match picture_type {
            PictureType::P => self.future.is_none(),
            PictureType::B => self.past.is_none() || self.future.is_none(),
            _ => false,
        };
        let info = FrameInfo {
            width,
            height,
            picture_type,
            picture_structure: picture.coding.picture_structure,
            temporal_reference: picture.header.temporal_reference,
            progressive_sequence,
            progressive_frame: picture.coding.progressive_frame,
            top_field_first: if field_picture {
                picture.coding.picture_structure == PictureStructure::TopField
            } else {
                picture.coding.top_field_first
            },
            repeat_first_field: picture.coding.repeat_first_field,
            concealed_macroblocks: 0,
            macroblocks: mb_width * coded_height / 16,
            missing_reference,
            missing_field: field_picture && second_field.is_none(),
        };

        let index = self.acquire(coded_width, coded_height, info);
        let references = References {
            past: self.past.as_deref(),
            future: self.future.as_deref(),
        };
        let target = Arc::get_mut(&mut self.pool[index]).expect("acquired frames are unshared");
        target.info = info;

        let mb_rows = if field_picture {
            coded_height / 32
        } else {
            coded_height / 16
        };
        let first_parity = match picture.coding.picture_structure {
            PictureStructure::TopField => Some(0),
            PictureStructure::BottomField => Some(1),
            _ => None,
        };
        let params = picture_params(picture, first_parity, false, mb_width, mb_rows);
        let mut concealed = self.work.decode(data, picture, &params, references, target);
        if let Some(parity) = first_parity {
            let params = Params {
                parity: Some(1 - parity),
                second_field: true,
                ..params
            };
            match second_field {
                Some(second) => {
                    let params = picture_params(second, Some(1 - parity), true, mb_width, mb_rows);
                    concealed += self.work.decode(data, second, &params, references, target);
                }
                None => {
                    for address in 0..mb_width * mb_rows {
                        conceal(&params, address, references, target);
                    }
                    concealed += mb_width * mb_rows;
                }
            }
        }
        target.info.concealed_macroblocks = concealed;

        let frame = Arc::clone(&self.pool[index]);
        if matches!(picture_type, PictureType::I | PictureType::P) {
            self.past = self.future.replace(Arc::clone(&frame));
        }
        Ok(DecodedFrame { buffer: frame })
    }

    /// A pool frame of the given coded size that nothing else holds, or a
    /// new one. Free frames of other sizes are dropped.
    fn acquire(&mut self, width: usize, height: usize, info: FrameInfo) -> usize {
        self.pool.retain(|frame| {
            Arc::strong_count(frame) > 1 || (frame.width, frame.height) == (width, height)
        });
        let free = self.pool.iter_mut().position(|frame| {
            (frame.width, frame.height) == (width, height) && Arc::get_mut(frame).is_some()
        });
        match free {
            Some(index) => index,
            None => {
                self.pool
                    .push(Arc::new(FrameBuffer::new(width, height, info)));
                self.pool.len() - 1
            }
        }
    }
}

fn picture_params(
    picture: &Picture,
    parity: Option<usize>,
    second_field: bool,
    mb_width: usize,
    mb_rows: usize,
) -> Params<'_> {
    Params {
        picture_type: picture.header.picture_coding_type,
        parity,
        second_field,
        mb_width,
        mb_rows,
        top_field_first: picture.coding.top_field_first,
        // Table 7-4.
        intra_dc_mult: 8 >> picture.coding.intra_dc_precision,
        quantiser_scale: &QUANTISER_SCALE[picture.coding.q_scale_type],
        intra_matrix: &picture.quant.intra,
        non_intra_matrix: &picture.quant.non_intra,
    }
}

/// What every picture handed to the decoder must be.
fn check_picture(picture: &Picture) -> Result<()> {
    if !picture.has_coding_extension {
        bail!("MPEG-1 video is not supported");
    }
    if picture.sequence_ext.chroma_format != chroma_format::C420 {
        bail!(
            "chroma_format {} is not supported, only 4:2:0",
            picture.sequence_ext.chroma_format
        );
    }
    let (width, height) = (
        picture.sequence.horizontal_size,
        picture.sequence.vertical_size,
    );
    if width == 0 || height == 0 || width > MAX_WIDTH || height > MAX_HEIGHT {
        bail!("picture size {width}x{height} is outside Main and High level");
    }
    if !matches!(
        picture.header.picture_coding_type,
        PictureType::I | PictureType::P | PictureType::B
    ) {
        bail!(
            "picture_coding_type {:?} is not decodable",
            picture.header.picture_coding_type
        );
    }
    match picture.coding.picture_structure {
        PictureStructure::Reserved => bail!("reserved picture_structure"),
        PictureStructure::TopField | PictureStructure::BottomField
            if picture.sequence_ext.progressive_sequence =>
        {
            bail!("field picture in a progressive sequence")
        }
        _ => Ok(()),
    }
}

/// Whether `second` can be the second field of the frame `first` opens.
fn check_second_field(first: &Picture, second: &Picture) -> Result<()> {
    check_picture(second)?;
    let opposite = matches!(
        (
            first.coding.picture_structure,
            second.coding.picture_structure
        ),
        (PictureStructure::TopField, PictureStructure::BottomField)
            | (PictureStructure::BottomField, PictureStructure::TopField)
    );
    if !opposite {
        bail!("a second field must be a field picture of the other parity than the first");
    }
    // 6.1.1.4.1: an I frame is two I fields or an I field then a P field; a
    // P or B frame is two fields of its own type.
    let types = matches!(
        (
            first.header.picture_coding_type,
            second.header.picture_coding_type
        ),
        (PictureType::I, PictureType::I)
            | (PictureType::I, PictureType::P)
            | (PictureType::P, PictureType::P)
            | (PictureType::B, PictureType::B)
    );
    if !types {
        bail!(
            "fields of types {:?} and {:?} cannot form a frame",
            first.header.picture_coding_type,
            second.header.picture_coding_type
        );
    }
    if (first.sequence.horizontal_size, first.sequence.vertical_size)
        != (
            second.sequence.horizontal_size,
            second.sequence.vertical_size,
        )
    {
        bail!("the two fields of a frame differ in size");
    }
    Ok(())
}
