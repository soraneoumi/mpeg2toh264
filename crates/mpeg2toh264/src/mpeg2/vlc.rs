//! Flat lookup decoding for the Annex B variable length codes.
//!
//! Each table is expanded into a direct-indexed array covering the longest code
//! in it: peek `max_len` bits, read the value and the true code length out of
//! the table, then consume that many bits. Costs one memory read per symbol.

use crate::bitreader::BitReader;
use crate::error::{Error, Result};

pub struct VlcTable {
    name: &'static str,
    max_len: u32,
    secondary_bits: u32,
    /// Value in the high 27 bits and code length in the low five. A zero
    /// length with a non-zero value points into `secondary`; an all-zero entry
    /// is invalid. Packing both fields keeps the common short-code path to one
    /// lookup.
    entries: Vec<u32>,
    secondary: Vec<u32>,
}

impl VlcTable {
    /// Expand a bit-string table into the lookup. Collisions and malformed
    /// codes are a defect in the generated tables, not in any input, so they
    /// panic rather than surfacing as a stream error.
    pub fn new(name: &'static str, entries: &[(&str, i32)]) -> Self {
        Self::with_primary_bits(name, entries, 8)
    }

    /// [`Self::new`] with the first lookup covering `primary_bits` bits, or
    /// the longest code if that is shorter. Eight suits most of the tables;
    /// a table whose everyday codes run longer is worth a bigger first table
    /// so that they, too, are one lookup.
    pub fn with_primary_bits(
        name: &'static str,
        entries: &[(&str, i32)],
        primary_bits: u32,
    ) -> Self {
        let max_len = entries
            .iter()
            .map(|(code, _)| code.len() as u32)
            .max()
            .unwrap_or(0);
        let primary_bits = max_len.min(primary_bits);
        let secondary_bits = max_len - primary_bits;
        let mut expanded = vec![0u32; 1usize << primary_bits];
        let mut secondary = Vec::new();

        for (code, value) in entries {
            let len = code.len() as u32;
            assert!(
                (-1 << 26..1 << 26).contains(value),
                "{name}: value {value} does not fit the packed VLC entry"
            );
            let entry = ((*value as u32) << 5) | len;
            let bits = u32::from_str_radix(code, 2)
                .unwrap_or_else(|_| panic!("{name}: code '{code}' is not binary"));
            if len <= primary_bits {
                let prefix = (bits << (primary_bits - len)) as usize;
                let fill = 1usize << (primary_bits - len);
                for i in 0..fill {
                    let index = prefix | i;
                    assert_eq!(expanded[index], 0, "{name}: code '{code}' collides");
                    expanded[index] = entry;
                }
                continue;
            }

            let primary = (bits >> (len - primary_bits)) as usize;
            let offset = if expanded[primary] == 0 {
                let offset = secondary.len();
                secondary.resize(offset + (1usize << secondary_bits), 0);
                expanded[primary] = (offset as u32 + 1) << 5;
                offset
            } else {
                assert_eq!(expanded[primary] & 31, 0, "{name}: code '{code}' collides");
                ((expanded[primary] >> 5) - 1) as usize
            };
            let suffix_mask = (1u32 << secondary_bits) - 1;
            let prefix = ((bits << (max_len - len)) & suffix_mask) as usize;
            let fill = 1usize << (max_len - len);
            for i in 0..fill {
                let index = offset + (prefix | i);
                assert_eq!(
                    secondary[index], 0,
                    "{name}: code '{code}' collides at index {index}"
                );
                secondary[index] = entry;
            }
        }

        Self {
            name,
            max_len,
            secondary_bits,
            entries: expanded,
            secondary,
        }
    }

    /// What a lookup reads of the table, copied out for a loop to keep in
    /// registers.
    pub(crate) fn decoder(&self) -> Decoder<'_> {
        Decoder {
            table: self,
            max_len: self.max_len,
            secondary_bits: self.secondary_bits,
            entries: &self.entries,
            secondary: &self.secondary,
        }
    }

    /// The lookup of a table built with [`WIDE_BITS`] primary bits.
    pub(crate) fn wide(&self) -> WideDecoder<'_> {
        WideDecoder {
            primary: self
                .entries
                .as_slice()
                .try_into()
                .expect("a table built with the wide first lookup"),
            table: self,
        }
    }

    /// Decode one symbol, advancing the reader.
    #[inline]
    pub fn decode(&self, r: &mut BitReader<'_>) -> Result<i32> {
        self.decoder().decode(r)
    }

    /// Decode a symbol, treating MPEG-2 slice-ending zero stuffing as `None`.
    ///
    /// A slice checks for 23 zero bits at every macroblock boundary. Valid VLC
    /// codes never begin with `max_len` zeroes, so normal symbols need only the
    /// table lookup; the wider end check is deferred to that invalid prefix.
    #[inline]
    pub fn decode_or_zero_stuffing(&self, r: &mut BitReader<'_>) -> Result<Option<i32>> {
        self.decoder().decode_or_zero_stuffing(r)
    }

    /// Peek at the symbol without consuming it; `None` if the code is invalid.
    pub fn peek_symbol(&self, r: &mut BitReader<'_>) -> Option<i32> {
        let entry = self.decoder().lookup(r);
        if entry & 31 == 0 {
            None
        } else {
            Some((entry as i32) >> 5)
        }
    }
}

/// How many bits the first lookup of a [`WideDecoder`] covers.
pub(crate) const WIDE_BITS: u32 = 10;

/// The lookup of a table built with [`WIDE_BITS`] primary bits, for syntax
/// that keeps the reader's bits in hand: the first table has a fixed size, so
/// indexing it with that many bits needs no check.
#[derive(Clone, Copy)]
pub(crate) struct WideDecoder<'a> {
    primary: &'a [u32; 1 << WIDE_BITS],
    table: &'a VlcTable,
}

impl WideDecoder<'_> {
    /// The entry for the code at the head of `window`, which holds the
    /// table's longest code: the value in the high 27 bits and the code
    /// length in the low five, or a zero length for no code at all.
    #[inline(always)]
    pub(crate) fn entry(&self, window: u64) -> u32 {
        let entry = self.primary[(window >> (64 - WIDE_BITS)) as usize];
        if entry & 31 == 0 && entry != 0 {
            let offset = ((entry >> 5) - 1) as usize;
            let rest = (window >> (64 - self.table.max_len)) as usize;
            return self.table.secondary[offset + (rest & ((1 << self.table.secondary_bits) - 1))];
        }
        entry
    }

    /// The error for a `window` that [`Self::entry`] found no code in.
    #[cold]
    #[inline(never)]
    pub(crate) fn invalid(&self, window: u64, bit_pos: usize) -> Error {
        self.table
            .decoder()
            .invalid((window >> (64 - self.table.max_len)) as usize, bit_pos)
    }
}

/// A [`VlcTable`]'s lookup state, by value.
#[derive(Clone, Copy)]
pub(crate) struct Decoder<'a> {
    table: &'a VlcTable,
    max_len: u32,
    secondary_bits: u32,
    entries: &'a [u32],
    secondary: &'a [u32],
}

impl Decoder<'_> {
    /// The entry for the code at the head of the reader, which holds at
    /// least `max_len` bits afterwards.
    #[inline(always)]
    fn lookup(&self, r: &mut BitReader<'_>) -> u32 {
        let primary = r.peek(self.max_len) as usize;
        let entry = self.entries[primary >> self.secondary_bits];
        if entry != 0 && entry & 31 == 0 {
            let offset = ((entry >> 5) - 1) as usize;
            let suffix = primary & ((1usize << self.secondary_bits) - 1);
            return self.secondary[offset + suffix];
        }
        entry
    }

    /// Decode one symbol, advancing the reader.
    #[inline(always)]
    pub fn decode(&self, r: &mut BitReader<'_>) -> Result<i32> {
        let entry = self.lookup(r);
        let len = entry & 31;
        if len == 0 {
            return Err(self.invalid(r.peek(self.max_len) as usize, r.bit_pos()));
        }
        r.consume(len);
        Ok((entry as i32) >> 5)
    }

    /// [`VlcTable::decode_or_zero_stuffing`].
    #[inline(always)]
    pub fn decode_or_zero_stuffing(&self, r: &mut BitReader<'_>) -> Result<Option<i32>> {
        let entry = self.lookup(r);
        let len = entry & 31;
        if len == 0 {
            if r.peek(self.max_len) == 0 && r.peek(23) == 0 {
                return Ok(None);
            }
            return Err(self.invalid(r.peek(self.max_len) as usize, r.bit_pos()));
        }
        r.consume(len);
        Ok(Some((entry as i32) >> 5))
    }

    #[cold]
    #[inline(never)]
    fn invalid(&self, index: usize, bit_pos: usize) -> Error {
        Error::new(format!(
            "{}: invalid code 0b{:0width$b} at bit {}",
            self.table.name,
            index,
            bit_pos,
            width = self.max_len as usize
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn long_codes_share_a_compact_secondary_table() {
        let table = VlcTable::new("test", &[("1", 7), ("000000001", 8), ("000000000", 9)]);
        assert_eq!(table.entries.len(), 256);
        assert_eq!(table.secondary.len(), 2);

        let mut one = BitReader::new(&[0x00, 0x80]);
        assert_eq!(table.decode(&mut one).unwrap(), 8);
        assert_eq!(one.bit_pos(), 9);

        let mut zero = BitReader::new(&[0x00, 0x00]);
        assert_eq!(table.decode(&mut zero).unwrap(), 9);
        assert_eq!(zero.bit_pos(), 9);
    }

    #[test]
    fn slice_end_decode_distinguishes_symbols_stuffing_and_invalid_codes() {
        let table = VlcTable::new("test", &[("1", 7), ("01", 8)]);

        let mut symbol = BitReader::new(&[0x80, 0, 0, 0]);
        assert_eq!(table.decode_or_zero_stuffing(&mut symbol).unwrap(), Some(7));
        assert_eq!(symbol.bit_pos(), 1);

        let mut stuffing = BitReader::new(&[0; 4]);
        assert_eq!(table.decode_or_zero_stuffing(&mut stuffing).unwrap(), None);
        assert_eq!(stuffing.bit_pos(), 0, "the end marker is only observed");

        let mut invalid = BitReader::new(&[0x20, 0, 0, 0]);
        assert!(table.decode_or_zero_stuffing(&mut invalid).is_err());
    }
}
