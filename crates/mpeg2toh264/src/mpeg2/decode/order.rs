//! Reordering decoded frames from decode order to display order.

use crate::mpeg2::constants::PictureType;
use crate::mpeg2::decode::frame::DecodedFrame;

/// The standard reordering of H.262 6.1.1.11: a B frame is shown as soon as
/// it is decoded, an I or P frame when the next I or P frame arrives, and
/// the last one when the stream ends.
#[derive(Default)]
pub struct DisplayOrder {
    held: Option<DecodedFrame>,
}

impl DisplayOrder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Take the next frame in decode order and return the frame to display
    /// next, if one is due.
    pub fn push(&mut self, frame: DecodedFrame) -> Option<DecodedFrame> {
        if frame.info().picture_type == PictureType::B {
            Some(frame)
        } else {
            self.held.replace(frame)
        }
    }

    /// The anchor frame still held, at the end of the stream.
    pub fn flush(&mut self) -> Option<DecodedFrame> {
        self.held.take()
    }
}
