//! Reordering decoded frames from decode order to display order.

use crate::mpeg2::constants::PictureType;
use crate::mpeg2::decode::frame::DecodedFrame;

/// A decoded frame, or a frame with what its caller keeps beside it.
pub trait Reorderable {
    fn picture_type(&self) -> PictureType;
}

impl Reorderable for DecodedFrame {
    fn picture_type(&self) -> PictureType {
        self.info().picture_type
    }
}

/// The standard reordering of H.262 6.1.1.11: a B frame is shown as soon as
/// it is decoded, an I or P frame when the next I or P frame arrives, and
/// the last one when the stream ends.
pub struct DisplayOrder<F = DecodedFrame> {
    held: Option<F>,
}

impl<F> Default for DisplayOrder<F> {
    fn default() -> Self {
        Self { held: None }
    }
}

impl<F: Reorderable> DisplayOrder<F> {
    pub fn new() -> Self {
        Self::default()
    }

    /// Take the next frame in decode order and return the frame to display
    /// next, if one is due.
    pub fn push(&mut self, frame: F) -> Option<F> {
        if frame.picture_type() == PictureType::B {
            Some(frame)
        } else {
            self.held.replace(frame)
        }
    }

    /// The anchor frame still held, at the end of the stream.
    pub fn flush(&mut self) -> Option<F> {
        self.held.take()
    }

    /// The anchor frame waiting for the next one.
    pub fn held(&self) -> Option<&F> {
        self.held.as_ref()
    }
}
