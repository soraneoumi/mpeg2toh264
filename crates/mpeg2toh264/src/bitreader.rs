//! Bit reader for MPEG-2 elementary streams.
//!
//! MPEG-2 has no emulation prevention bytes, so the byte stream maps directly to
//! the bit stream. Start codes are byte-aligned `00 00 01 xx` sequences and are
//! guaranteed not to occur inside coded data, which is what lets us scan for them.

use crate::error::{bail, Result};

pub struct BitReader<'a> {
    pub data: &'a [u8],
    /// Index of the first byte of `data` that `reservoir` has not been
    /// filled from.
    next: usize,
    /// Upcoming bits, most significant first. Sequential syntax reads consume
    /// this reservoir and touch the input only when fewer bits remain than
    /// the read needs. Below the `reservoir_bits` valid bits it holds either
    /// zeros or the start of the next byte, which the next refill ORs in
    /// again at the same place.
    reservoir: u64,
    reservoir_bits: u32,
}

impl<'a> BitReader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self::at_bit(data, 0)
    }

    pub fn at_bit(data: &'a [u8], start_bit: usize) -> Self {
        let mut reader = Self {
            data,
            next: 0,
            reservoir: 0,
            reservoir_bits: 0,
        };
        reader.set_bit_pos(start_bit);
        reader
    }

    pub fn bit_pos(&self) -> usize {
        self.next * 8 - self.reservoir_bits as usize
    }

    pub fn set_bit_pos(&mut self, pos: usize) {
        self.next = pos >> 3;
        self.reservoir = 0;
        self.reservoir_bits = 0;
        self.refill();
        self.consume((pos & 7) as u32);
    }

    pub fn byte_pos(&self) -> usize {
        self.bit_pos() >> 3
    }

    pub fn bits_left(&self) -> isize {
        self.data.len() as isize * 8 - self.bit_pos() as isize
    }

    pub fn at_end(&self) -> bool {
        self.bit_pos() >= self.data.len() * 8
    }

    /// Top up the reservoir to at least 56 valid bits. Reading past the end
    /// yields zero bits rather than failing: a slice runs until the next
    /// start code, and the last one in a buffer simply stops. MPEG-2 fields
    /// are at most 32 bits, so one refill always satisfies the next read.
    #[inline]
    fn refill(&mut self) {
        let word = match self.data.get(self.next..) {
            Some(rest) if rest.len() >= 8 => {
                u64::from_be_bytes(rest[..8].try_into().expect("eight bytes"))
            }
            _ => tail_word(self.data, self.next),
        };
        self.reservoir |= word >> self.reservoir_bits;
        // Whole bytes only: the byte `word` cuts short is read again.
        let bytes = (63 - self.reservoir_bits) >> 3;
        self.next += bytes as usize;
        self.reservoir_bits += bytes * 8;
    }

    /// A copy of the reader at its present position. Syntax that reads in a
    /// loop works on a copy, which stays in registers, and hands it back.
    #[inline(always)]
    pub(crate) fn snapshot(&self) -> Self {
        Self {
            data: self.data,
            next: self.next,
            reservoir: self.reservoir,
            reservoir_bits: self.reservoir_bits,
        }
    }

    /// Have at least `n` bits (n <= 56) in the reservoir, for syntax that
    /// then reads them through [`Self::window`] without asking again.
    #[inline(always)]
    pub(crate) fn ensure(&mut self, n: u32) {
        if self.reservoir_bits < n {
            self.refill();
        }
    }

    /// The upcoming bits, the next one in bit 63. Only as many as
    /// [`Self::ensure`] was asked for are certain to be there.
    #[inline(always)]
    pub(crate) fn window(&self) -> u64 {
        self.reservoir
    }

    /// Drop `n` bits the reservoir holds.
    #[inline(always)]
    pub(crate) fn consume(&mut self, n: u32) {
        debug_assert!(n <= self.reservoir_bits);
        self.reservoir <<= n;
        self.reservoir_bits -= n;
    }

    /// Read `n` bits (n <= 32) MSB-first as an unsigned integer.
    #[inline]
    pub fn u(&mut self, n: u32) -> u32 {
        let value = self.peek(n);
        self.consume(n);
        value
    }

    /// Peek `n` bits without consuming them.
    #[inline]
    pub fn peek(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        debug_assert!(n <= 32);
        if self.reservoir_bits < n {
            self.refill();
        }
        (self.reservoir >> (64 - n)) as u32
    }

    /// Read a single bit as a boolean.
    #[inline]
    pub fn flag(&mut self) -> bool {
        self.u(1) == 1
    }

    #[inline]
    pub fn skip(&mut self, n: u32) {
        if n <= self.reservoir_bits {
            self.consume(n);
        } else {
            self.set_bit_pos(self.bit_pos() + n as usize);
        }
    }

    /// MPEG-2 `marker_bit`: a bit that shall be 1, present purely to prevent
    /// accidental start code emulation. A zero here means we have lost sync.
    pub fn marker(&mut self) -> Result<()> {
        if self.u(1) != 1 {
            bail!("marker_bit was 0 at bit {} (lost sync)", self.bit_pos() - 1);
        }
        Ok(())
    }

    pub fn is_byte_aligned(&self) -> bool {
        self.bit_pos() & 7 == 0
    }

    pub fn align_to_byte(&mut self) {
        self.set_bit_pos((self.bit_pos() + 7) & !7);
    }
}

/// The eight bytes of `data` from `next`, zero beyond its end.
#[cold]
#[inline(never)]
fn tail_word(data: &[u8], next: usize) -> u64 {
    let rest = data.get(next..).unwrap_or(&[]);
    let mut word = [0u8; 8];
    let n = rest.len().min(8);
    word[..n].copy_from_slice(&rest[..n]);
    u64::from_be_bytes(word)
}

/// A `00 00 01 xx` start code located in the stream.
#[derive(Clone, Copy, Debug)]
pub struct StartCode {
    /// The `xx` byte following the `00 00 01` prefix.
    pub code: u8,
    /// Byte offset of the `00` that begins the prefix.
    pub offset: usize,
    /// Byte offset of the first payload byte (just past the code byte).
    pub payload_offset: usize,
}

/// Scan the whole buffer for start codes. MPEG-2 streams are small enough in
/// practice that one up-front pass is simpler than incremental scanning, and it
/// lets the header/slice parsers work on known-bounded ranges.
pub fn find_start_codes(data: &[u8]) -> Vec<StartCode> {
    let mut out = Vec::new();
    if data.len() < 4 {
        return out;
    }
    // The third byte decides: above zero it rules out a prefix starting at
    // this byte and at the next two, and only a zero can start one at the
    // next byte, so most of the stream is passed three bytes at a time.
    let mut i = 0;
    while i < data.len() - 3 {
        match data[i + 2] {
            0 => i += 1,
            1 => {
                if data[i] == 0 && data[i + 1] == 0 {
                    out.push(StartCode {
                        code: data[i + 3],
                        offset: i,
                        payload_offset: i + 4,
                    });
                }
                i += 3;
            }
            _ => i += 3,
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reference(data: &[u8], pos: usize, width: u32) -> u32 {
        let mut value = 0;
        for bit in pos..pos + width as usize {
            let byte = data.get(bit >> 3).copied().unwrap_or(0);
            value = (value << 1) | u32::from((byte >> (7 - (bit & 7))) & 1);
        }
        value
    }

    #[test]
    fn reservoir_matches_individual_bits_across_refills_and_seeks() {
        let data: Vec<u8> = (0..20).map(|i| (i * 37 + 11) as u8).collect();
        let mut reader = BitReader::at_bit(&data, 3);
        let mut pos = 3;
        for width in [3, 17, 5, 32, 7, 21, 1, 28] {
            assert_eq!(reader.peek(width), reference(&data, pos, width));
            assert_eq!(reader.bit_pos(), pos, "peek does not consume bits");
            assert_eq!(reader.u(width), reference(&data, pos, width));
            pos += width as usize;
        }

        reader.set_bit_pos(9);
        assert_eq!(reader.u(32), reference(&data, 9, 32));
        reader.skip(70);
        assert_eq!(reader.u(13), reference(&data, 111, 13));
    }

    #[test]
    fn reading_past_the_input_still_supplies_zero_bits() {
        let mut reader = BitReader::at_bit(&[0b1010_0000], 4);
        assert_eq!(reader.u(12), 0);
        assert_eq!(reader.u(32), 0);
    }

    #[test]
    fn start_codes_are_found_wherever_the_prefix_falls() {
        let mut state = 7u32;
        let data: Vec<u8> = (0..5000)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                [0, 0, 0, 1, 1, 2, 255][(state >> 24) as usize % 7]
            })
            .collect();
        let expected: Vec<usize> = (0..data.len() - 3)
            .filter(|&i| data[i..i + 3] == [0, 0, 1])
            .collect();
        let found: Vec<usize> = find_start_codes(&data).iter().map(|s| s.offset).collect();
        assert!(expected.len() > 100);
        assert_eq!(found, expected);
        assert!(find_start_codes(&data[..3]).is_empty());
    }
}
