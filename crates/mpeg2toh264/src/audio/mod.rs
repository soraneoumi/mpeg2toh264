//! AAC-LC decoding to PCM (ISO/IEC 13818-7, ISO/IEC 14496-3), and the stereo
//! mix a receiver plays it as.
//!
//! [`parse_block`] reads a raw_data_block through the same syntax reading the
//! ADTS reader walks it with, so a block is decodable exactly where the stream
//! reader hands it on. [`AacDecoder`] turns what it read into 1024 samples per
//! channel, and [`downmix::to_stereo`] mixes those to two channels.

mod decoder;
pub mod downmix;
mod imdct;
mod layout;
mod parse;
mod spectrum;
mod tns;
mod window;

#[cfg(test)]
mod tests;

pub use decoder::{AacDecoder, PcmFrame};
pub use layout::{ChannelLayout, MatrixMixdown, Speaker};
pub use parse::{parse_block, ParsedBlock, Tools};

/// Samples per channel in one access unit.
pub const FRAME_SAMPLES: usize = 1024;
