//! Decoding a whole elementary stream as it arrives, in display order.

use crate::container::fmp4::complementary_field;
use crate::error::Error;
use crate::mpeg2::constants::{PictureStructure, PictureType};
use crate::mpeg2::decode::{DecodedFrame, Decoder, DisplayOrder};
use crate::mpeg2::gop_stream::Mpeg2GopStream;
use crate::mpeg2::headers::parse_elementary_stream;

/// Counts kept by a [`StreamDecoder`].
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct StreamStats {
    /// Frames decoded, whether or not they have been output yet.
    pub decoded: usize,
    /// Frames handed to the output.
    pub output: usize,
    /// Macroblocks concealed over all decoded frames.
    pub concealed_macroblocks: usize,
    /// Coded frames passed over: before the first I frame, B frames without
    /// two references, and frames the decoder refused.
    pub skipped: usize,
    /// Groups of pictures whose headers would not parse, dropped whole.
    pub failed_groups: usize,
}

/// An elementary stream decoder that takes bytes in any chunks and hands out
/// frames in display order.
///
/// The stream is cut into groups of pictures with [`Mpeg2GopStream`], each
/// group is parsed, and its frames are decoded in coding order:
///
/// - nothing is decoded until an I frame, at the start and after a group
///   that failed to parse or an I or P frame the decoder refused;
/// - a B frame is decoded only with two references, so the leading B
///   frames of an open group are skipped where the group before is absent;
/// - a field picture is decoded with the field after it when the two form
///   a frame, and alone otherwise, the missing field concealed.
pub struct StreamDecoder {
    splitter: Mpeg2GopStream,
    decoder: Decoder,
    order: DisplayOrder,
    awaiting_intra: bool,
    stats: StreamStats,
    first_error: Option<Error>,
}

impl Default for StreamDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl StreamDecoder {
    pub fn new() -> Self {
        Self {
            splitter: Mpeg2GopStream::new(),
            decoder: Decoder::new(),
            order: DisplayOrder::new(),
            awaiting_intra: true,
            stats: StreamStats::default(),
            first_error: None,
        }
    }

    pub fn stats(&self) -> &StreamStats {
        &self.stats
    }

    /// Why the first group or frame that could not be decoded was refused.
    /// A stream the decoder does not support refuses every frame for the
    /// same reason.
    pub fn first_error(&self) -> Option<&Error> {
        self.first_error.as_ref()
    }

    /// Feed stream bytes; `output` receives every frame that becomes due.
    pub fn push(&mut self, data: &[u8], mut output: impl FnMut(&DecodedFrame)) {
        for group in self.splitter.push(data, None) {
            self.decode_group(&group.data, &mut output);
        }
    }

    /// End of stream: decode what is still buffered and output the last frame.
    pub fn finish(&mut self, mut output: impl FnMut(&DecodedFrame)) {
        for group in self.splitter.finish() {
            self.decode_group(&group.data, &mut output);
        }
        if let Some(frame) = self.order.flush() {
            self.emit(&frame, &mut output);
        }
    }

    fn emit(&mut self, frame: &DecodedFrame, output: &mut impl FnMut(&DecodedFrame)) {
        self.stats.output += 1;
        output(frame);
    }

    /// Start again from the next I frame, showing what is already decoded.
    fn restart(&mut self, output: &mut impl FnMut(&DecodedFrame)) {
        if let Some(frame) = self.order.flush() {
            self.emit(&frame, output);
        }
        self.decoder.reset();
        self.awaiting_intra = true;
    }

    fn decode_group(&mut self, data: &[u8], output: &mut impl FnMut(&DecodedFrame)) {
        let pictures = match parse_elementary_stream(data) {
            Ok(pictures) => pictures,
            Err(error) => {
                self.first_error.get_or_insert(error);
                self.stats.failed_groups += 1;
                self.restart(output);
                return;
            }
        };
        let mut index = 0;
        while index < pictures.len() {
            let picture = &pictures[index];
            let second = if picture.coding.picture_structure == PictureStructure::Frame {
                None
            } else {
                complementary_field(pictures.get(index + 1), picture)
            };
            index += 1 + second.is_some() as usize;

            let picture_type = picture.header.picture_coding_type;
            if self.awaiting_intra && picture_type != PictureType::I {
                self.stats.skipped += 1;
                continue;
            }
            if picture_type == PictureType::B && self.decoder.references() < 2 {
                self.stats.skipped += 1;
                continue;
            }
            match self.decoder.decode_frame(data, picture, second) {
                Ok(frame) => {
                    self.awaiting_intra = false;
                    self.stats.decoded += 1;
                    self.stats.concealed_macroblocks += frame.info().concealed_macroblocks;
                    if let Some(due) = self.order.push(frame) {
                        self.emit(&due, output);
                    }
                }
                Err(error) => {
                    self.first_error.get_or_insert(error);
                    self.stats.skipped += 1;
                    // A lost reference would leave everything up to the next
                    // I frame predicted from the wrong one.
                    if picture_type != PictureType::B {
                        self.restart(output);
                    }
                }
            }
        }
    }
}
