//! Decoding the units a decode-mode session hands out, one picture at a time.

use crate::error::{bail, Result};
use crate::mpeg2::constants::PictureType;
use crate::mpeg2::decode::{DecodedFrame, Decoder};
use crate::mpeg2::headers::{
    parse_elementary_stream, picture_display_size, picture_matrix, Picture, YcbcrMatrix,
};

/// A decoded picture to show, with what the stream says about showing it.
pub struct ShownFrame {
    pub frame: DecodedFrame,
    pub matrix: YcbcrMatrix,
    pub display_width: u32,
    pub display_height: u32,
}

/// Where one plane sits when the three are packed one after another.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct PackedPlane {
    pub offset: usize,
    /// The coded line length.
    pub stride: usize,
    /// `stride * (rows - 1) + width`: the last line stops at its visible end.
    pub len: usize,
}

/// Y, Cb and Cr of `frame` packed with their coded strides.
pub fn packed_planes(frame: &DecodedFrame) -> [PackedPlane; 3] {
    let mut offset = 0;
    [0, 1, 2].map(|component| {
        let plane = frame.plane(component);
        let len = plane.stride * (plane.height - 1) + plane.width;
        let packed = PackedPlane {
            offset,
            stride: plane.stride,
            len,
        };
        offset += len;
        packed
    })
}

/// Decodes units in decode order, keeping references from one to the next.
///
/// Nothing is decoded after [`Self::reset`], or after a unit or picture that
/// failed, until an I picture arrives; a B picture is decoded only with two
/// references. A failure is reported for its own unit and leaves the decoder
/// usable.
pub struct UnitDecoder {
    decoder: Decoder,
    awaiting_intra: bool,
    data: Vec<u8>,
    pictures: Vec<Picture>,
    /// The unit's coded frames to decode: a picture and its second field.
    order: Vec<(usize, Option<usize>)>,
    next: usize,
}

impl Default for UnitDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl UnitDecoder {
    pub fn new() -> Self {
        Self {
            decoder: Decoder::new(),
            awaiting_intra: true,
            data: Vec::new(),
            pictures: Vec::new(),
            order: Vec::new(),
            next: 0,
        }
    }

    /// Forget the references and the unit in hand, as for a jump.
    pub fn reset(&mut self) {
        self.decoder.reset();
        self.awaiting_intra = true;
        self.order.clear();
        self.next = 0;
    }

    /// Take a unit: its bytes, whether references from before it must be
    /// dropped, and its coded frames as indices into the pictures
    /// `parse_elementary_stream` finds in it, in decode order.
    pub fn begin(
        &mut self,
        data: &[u8],
        restart: bool,
        frames: impl IntoIterator<Item = (usize, Option<usize>)>,
    ) -> Result<usize> {
        self.order.clear();
        self.next = 0;
        if restart {
            self.decoder.reset();
            self.awaiting_intra = true;
        }
        self.data.clear();
        self.data.extend_from_slice(data);
        self.order.extend(frames);
        let checked = parse_elementary_stream(&self.data).and_then(|pictures| {
            let count = pictures.len();
            if let Some(&(first, second)) = self.order.iter().find(|&&(first, second)| {
                first >= count
                    || second.is_some_and(|second| second != first + 1 || second >= count)
            }) {
                bail!("the unit has {count} pictures and no frame at {first}, {second:?}");
            }
            Ok(pictures)
        });
        match checked {
            Ok(pictures) => {
                self.pictures = pictures;
                Ok(self.order.len())
            }
            Err(error) => {
                self.order.clear();
                self.lose_references();
                Err(error)
            }
        }
    }

    /// Decode the next frame of the unit. `show` is false for a picture
    /// needed only as a reference, which skips a B picture altogether.
    ///
    /// `None` when nothing is shown: not asked for, or skipped for want of
    /// references. A picture the decoder refuses fails; after an I or P
    /// picture, decoding waits for the next I picture.
    pub fn next(&mut self, show: bool) -> Result<Option<ShownFrame>> {
        let Some(&(first, second)) = self.order.get(self.next) else {
            bail!("the unit has no frames left to decode");
        };
        self.next += 1;
        let picture = &self.pictures[first];
        let kind = picture.header.picture_coding_type;
        if self.awaiting_intra && kind != PictureType::I {
            return Ok(None);
        }
        if kind == PictureType::B && (!show || self.decoder.references() < 2) {
            return Ok(None);
        }
        let second = second.map(|index| &self.pictures[index]);
        match self.decoder.decode_frame(&self.data, picture, second) {
            Ok(frame) => {
                self.awaiting_intra = false;
                if !show {
                    return Ok(None);
                }
                let (display_width, display_height) = picture_display_size(picture);
                Ok(Some(ShownFrame {
                    frame,
                    matrix: picture_matrix(picture),
                    display_width,
                    display_height,
                }))
            }
            Err(error) => {
                // A lost reference would leave everything up to the next I
                // picture predicted from the wrong one.
                if kind != PictureType::B {
                    self.lose_references();
                }
                Err(error)
            }
        }
    }

    fn lose_references(&mut self) {
        self.decoder.reset();
        self.awaiting_intra = true;
    }
}
