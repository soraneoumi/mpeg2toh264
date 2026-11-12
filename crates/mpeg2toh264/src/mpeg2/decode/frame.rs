//! Decoded frames: planar 4:2:0 sample buffers and what is known about them.

use std::sync::Arc;

use crate::mpeg2::constants::{PictureStructure, PictureType};
use crate::mpeg2::decode::motion::View;

/// Display and decoding facts about one decoded frame.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FrameInfo {
    /// Visible size, `horizontal_size` x `vertical_size`.
    pub width: usize,
    pub height: usize,
    /// Type of the first coded picture. An I field followed by a P field is
    /// an I frame.
    pub picture_type: PictureType,
    /// `Frame` for a frame picture; for a field pair, the parity of the field
    /// coded first.
    pub picture_structure: PictureStructure,
    pub temporal_reference: u32,
    pub progressive_sequence: bool,
    pub progressive_frame: bool,
    /// Which field comes first in time. For a field pair this is whether the
    /// top field was coded first, since `top_field_first` is always zero in
    /// field pictures (6.3.10).
    pub top_field_first: bool,
    pub repeat_first_field: bool,
    /// Macroblocks of the frame that were not decoded from the stream but
    /// copied from a reference or filled with grey. See [`super`] for when.
    pub concealed_macroblocks: usize,
    /// All macroblocks of the frame, both fields together.
    pub macroblocks: usize,
    /// Whether a reference the frame's type needs was absent: no forward
    /// reference for P, fewer than two for B.
    pub missing_reference: bool,
    /// Whether the frame was coded as a field picture whose second field was
    /// not supplied.
    pub missing_field: bool,
}

/// Sample storage of one frame at the coded size, which is the visible size
/// rounded up to whole macroblocks (to 32 lines for interlaced sequences,
/// 6.3.3), so that every macroblock has samples to land in.
pub(crate) struct FrameBuffer {
    pub planes: [Vec<u8>; 3],
    pub width: usize,
    pub height: usize,
    pub info: FrameInfo,
}

impl FrameBuffer {
    pub fn new(width: usize, height: usize, info: FrameInfo) -> Self {
        let chroma = (width / 2) * (height / 2);
        Self {
            planes: [vec![0; width * height], vec![0; chroma], vec![0; chroma]],
            width,
            height,
            info,
        }
    }

    /// Line length of plane `component` (0 = Y, 1 = Cb, 2 = Cr).
    #[inline]
    pub fn stride(&self, component: usize) -> usize {
        if component == 0 {
            self.width
        } else {
            self.width / 2
        }
    }

    /// Plane `component` as a frame, or as the field of `parity` (0 = top).
    #[inline]
    pub fn view(&self, component: usize, parity: Option<usize>) -> View<'_> {
        let stride = self.stride(component);
        let height = if component == 0 {
            self.height
        } else {
            self.height / 2
        };
        match parity {
            None => View {
                data: &self.planes[component],
                offset: 0,
                stride,
                width: stride as i32,
                height: height as i32,
            },
            Some(parity) => View {
                data: &self.planes[component],
                offset: parity * stride,
                stride: stride * 2,
                width: stride as i32,
                height: (height / 2) as i32,
            },
        }
    }
}

/// One plane of a decoded frame at its visible size.
#[derive(Clone, Copy)]
pub struct Plane<'a> {
    /// `height` lines of `stride` bytes, the first `width` of each visible.
    pub data: &'a [u8],
    pub stride: usize,
    pub width: usize,
    pub height: usize,
}

impl<'a> Plane<'a> {
    /// The visible samples of line `y`.
    #[inline]
    pub fn row(&self, y: usize) -> &'a [u8] {
        &self.data[y * self.stride..][..self.width]
    }
}

/// A decoded frame, shared with the decoder that made it.
///
/// Cheap to clone. The decoder reuses a frame's storage once every handle to
/// it has been dropped and it is no longer a reference, so a caller that
/// keeps handles makes the decoder allocate new frames instead.
#[derive(Clone)]
pub struct DecodedFrame {
    pub(crate) buffer: Arc<FrameBuffer>,
}

impl DecodedFrame {
    #[inline]
    pub fn info(&self) -> &FrameInfo {
        &self.buffer.info
    }

    /// Visible width and height of the luma plane.
    #[inline]
    pub fn size(&self) -> (usize, usize) {
        (self.buffer.info.width, self.buffer.info.height)
    }

    /// Coded width and height of the luma plane: the visible size rounded up
    /// to whole macroblocks. Samples beyond the visible size are decoded but
    /// not meant to be shown.
    #[inline]
    pub fn coded_size(&self) -> (usize, usize) {
        (self.buffer.width, self.buffer.height)
    }

    /// Plane `component` (0 = Y, 1 = Cb, 2 = Cr) at the visible size. The
    /// chroma planes are 4:2:0: half the width and height, rounded up.
    pub fn plane(&self, component: usize) -> Plane<'_> {
        let info = &self.buffer.info;
        let (width, height) = if component == 0 {
            (info.width, info.height)
        } else {
            (info.width.div_ceil(2), info.height.div_ceil(2))
        };
        let stride = self.buffer.stride(component);
        let data = &self.buffer.planes[component];
        Plane {
            data: &data[..height * stride],
            stride,
            width,
            height,
        }
    }
}
