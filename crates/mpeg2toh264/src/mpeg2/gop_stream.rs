//! Splitting an MPEG-2 elementary stream into bounded, independently
//! transcodable units.

use std::collections::VecDeque;
use std::ops::ControlFlow;

use crate::mpeg2::constants::{extension, start_code};
use crate::mpeg2::headers::stream_sequence_description;

/// Walk every `00 00 01 <code>` start code in `data` in order, handing each
/// offset and its code byte to `visit`, and stop as soon as `visit` breaks.
///
/// One walk answers every question the splitter asks. Looking each kind of
/// start code up on its own walked the buffer five times to cut one group,
/// and at broadcast bitrates that is megabytes a group.
///
/// The common case -- coded data with no zero byte anywhere near -- is skipped
/// eight bytes at a time rather than one.
fn scan_start_codes(data: &[u8], mut visit: impl FnMut(usize, u8) -> ControlFlow<()>) {
    if data.len() < 4 {
        return;
    }
    let last = data.len() - 4;
    let mut i = 0;
    while i <= last {
        if i + 8 <= data.len() {
            let word = u64::from_le_bytes(data[i..i + 8].try_into().expect("eight bytes"));
            // The usual zero-byte test: a byte borrows into its high bit only
            // if it was zero. A start code opens with two of them, so a run
            // without any cannot hold the beginning of one.
            if word.wrapping_sub(0x0101_0101_0101_0101) & !word & 0x8080_8080_8080_8080 == 0 {
                i += 8;
                continue;
            }
        }
        if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            if visit(i, data[i + 3]).is_break() {
                return;
            }
            // The next start code cannot begin before the code byte, which is
            // the first position after this one that is allowed to be zero.
            i += 3;
        } else {
            i += 1;
        }
    }
}

/// One GOP unit, and when its first coded picture is meant to be shown.
#[derive(Clone, Debug)]
pub struct Mpeg2Gop {
    pub data: Vec<u8>,
    /// The PES presentation timestamp covering the unit's first byte, in 90 kHz
    /// units, or `None` when the caller supplied none.
    ///
    /// A unit begins at a sequence or GOP header, which a transport stream
    /// places at the start of the PES that also carries the I picture, so this
    /// is that picture's timestamp. Whatever the splitter discarded before it
    /// -- and it discards everything before the first sequence header, which
    /// can be several pictures -- is already excluded.
    ///
    /// A unit that continues a group begins at a picture, and a timestamp that
    /// covers it from further back belongs to another picture, so it has one
    /// only when a PES begins exactly at its first byte.
    pub pts: Option<u64>,
    /// Recent PAT/PMT start from which that PES can be demuxed again.
    pub restart_offset: Option<u64>,
    /// Whether the unit carries on a group that earlier units opened. Only the
    /// splitter that cuts groups into anchor units produces these.
    pub continues_group: bool,
    /// Whether another unit of the same group follows this one.
    pub group_goes_on: bool,
}

/// Where a PES packet's payload landed in the stream, and one value it
/// supplied there.
#[derive(Clone, Copy)]
struct Mark {
    offset: usize,
    value: u64,
}

/// Split an MPEG-2 ES into bounded GOP units while carrying sequence headers
/// forward, so each unit can be transcoded on its own.
#[derive(Default)]
pub struct Mpeg2GopStream {
    /// Cut each group into units of one anchor picture and the B pictures
    /// coded after it, as well as at the group boundaries.
    split_groups: bool,
    buffer: Vec<u8>,
    sequence_prefix: Vec<u8>,
    /// The distinct quantiser matrix extensions seen in the group so far, in
    /// the order they last appeared. A matrix stays loaded until the next
    /// sequence header, so a unit that continues the group has to be given the
    /// ones its earlier pictures loaded, or it is decoded against the
    /// sequence's own.
    group_matrices: Vec<Vec<u8>>,
    /// Whether the buffer begins part way through a group, after the units
    /// that went out ahead of it.
    continuing: bool,
    /// How many of the pictures at the front of `pictures` have been looked at
    /// as the start of an anchor unit.
    examined: usize,
    /// Absolute stream offset of the first byte of `buffer` that came from the
    /// stream, which is `buffer[prefix_length]`: a re-injected sequence header
    /// is not part of the stream and has no offset of its own.
    base: usize,
    prefix_length: usize,
    pts_marks: Vec<Mark>,
    restart_marks: Vec<Mark>,
    /// Start-code offsets in `buffer`, discovered once as bytes arrive.
    sequences: VecDeque<usize>,
    gops: VecDeque<usize>,
    pictures: VecDeque<usize>,
    /// First byte that has not been tested as the start of a four-byte code.
    /// The final three bytes remain pending until the next chunk completes it.
    scan_pos: usize,
}

impl Mpeg2GopStream {
    pub fn new() -> Self {
        Self::default()
    }

    /// A splitter that also cuts groups into anchor units when `split_groups`
    /// is set: each holds one I or P picture and the B pictures coded after
    /// it, so that the units are contiguous runs of display slots.
    pub fn with_split_groups(split_groups: bool) -> Self {
        Self {
            split_groups,
            ..Self::default()
        }
    }

    pub fn push(&mut self, chunk: &[u8], pts: Option<u64>) -> Vec<Mpeg2Gop> {
        self.push_marked(chunk, pts, None)
    }

    pub fn push_with_restart(
        &mut self,
        chunk: &[u8],
        pts: Option<u64>,
        restart_offset: Option<u64>,
    ) -> Vec<Mpeg2Gop> {
        self.push_marked(chunk, pts, restart_offset)
    }

    fn push_marked(
        &mut self,
        chunk: &[u8],
        pts: Option<u64>,
        restart_offset: Option<u64>,
    ) -> Vec<Mpeg2Gop> {
        let offset = self.base + self.buffer.len() - self.prefix_length;
        if let Some(value) = pts {
            self.pts_marks.push(Mark { offset, value });
        }
        if let Some(value) = restart_offset {
            self.restart_marks.push(Mark { offset, value });
        }
        self.buffer.extend_from_slice(chunk);
        self.scan_new_bytes();
        self.extract(false)
    }

    pub fn finish(&mut self) -> Vec<Mpeg2Gop> {
        self.extract(true)
    }

    /// Return complete pictures before a known byte gap, then forget the damaged tail.
    ///
    /// The caller must invoke this before pushing any bytes received after the
    /// gap. The last picture start in the buffer then has no following start
    /// code to prove that picture ended before the gap. Every earlier picture
    /// does, so the prefix ending at that last start is byte-complete input for
    /// the transcoder. Reference resolution, leading B pictures, and field-pair
    /// validity remain the transcoder's responsibility, as for ordinary units.
    ///
    /// What follows the gap is dropped until the next group header, so no
    /// anchor unit can start in the middle of the damaged group.
    pub(crate) fn take_complete_prefix_before_gap(&mut self) -> Vec<Mpeg2Gop> {
        // A buffer that continues a group has no header of the group's own in
        // it: the next group's header would already have cut it.
        let first_gop = if self.continuing {
            Some(0)
        } else {
            self.gops.front().copied()
        };
        let unit = first_gop.and_then(|first_gop| {
            let boundary = self.pictures.back().copied()?;
            if !self
                .pictures
                .iter()
                .any(|&picture| picture >= first_gop && picture < boundary)
            {
                return None;
            }
            let boundary = self.description_boundary(first_gop, boundary);
            Some(self.unit_before(boundary, false))
        });
        self.discard_pending();
        unit.into_iter().collect()
    }

    /// Drop the unfinished GOP at a transport discontinuity while retaining
    /// the last sequence header needed to describe the next complete GOP.
    pub fn discard_pending(&mut self) {
        self.base += self.buffer.len().saturating_sub(self.prefix_length);
        self.buffer.clear();
        self.prefix_length = 0;
        self.pts_marks.clear();
        self.restart_marks.clear();
        self.sequences.clear();
        self.gops.clear();
        self.pictures.clear();
        self.scan_pos = 0;
        self.continuing = false;
        self.examined = 0;
        self.group_matrices.clear();
    }

    /// The unit running from the start of the buffer to `boundary`, with the
    /// marks that cover its first byte.
    fn unit_before(&mut self, boundary: usize, group_goes_on: bool) -> Mpeg2Gop {
        let pts = if self.continuing {
            Self::mark_exactly_at(&mut self.pts_marks, self.base)
        } else {
            Self::mark_at(&mut self.pts_marks, self.base)
        };
        let restart_offset = Self::mark_at(&mut self.restart_marks, self.base);
        Mpeg2Gop {
            data: self.buffer[..boundary].to_vec(),
            pts,
            restart_offset,
            continues_group: self.continuing,
            group_goes_on,
        }
    }

    /// Drop bytes from the front, keeping the offset mapping in step.
    fn consume(&mut self, count: usize) {
        let from_prefix = count.min(self.prefix_length);
        self.prefix_length -= from_prefix;
        self.base += count - from_prefix;
        self.buffer.drain(..count);
        Self::consume_offsets(&mut self.sequences, count);
        Self::consume_offsets(&mut self.gops, count);
        let pictures = self.pictures.len();
        Self::consume_offsets(&mut self.pictures, count);
        self.examined = self.examined.saturating_sub(pictures - self.pictures.len());
        self.scan_pos = self.scan_pos.saturating_sub(count);
    }

    fn consume_offsets(offsets: &mut VecDeque<usize>, count: usize) {
        while offsets.front().is_some_and(|&offset| offset < count) {
            offsets.pop_front();
        }
        for offset in offsets {
            *offset -= count;
        }
    }

    /// Scan only bytes that no earlier push had enough lookahead to inspect.
    fn scan_new_bytes(&mut self) {
        let from = self.scan_pos.min(self.buffer.len());
        let Self {
            buffer,
            sequences,
            gops,
            pictures,
            ..
        } = self;
        scan_start_codes(&buffer[from..], |at, code| {
            let at = from + at;
            match code {
                start_code::SEQUENCE_HEADER => sequences.push_back(at),
                start_code::GROUP => gops.push_back(at),
                start_code::PICTURE => pictures.push_back(at),
                _ => {}
            }
            ControlFlow::Continue(())
        });
        self.scan_pos = self.buffer.len().saturating_sub(3);
    }

    /// The last supplied value covering an absolute stream offset.
    fn mark_at(marks: &mut Vec<Mark>, offset: usize) -> Option<u64> {
        let mut value = None;
        let mut covering: isize = -1;
        for (i, mark) in marks.iter().enumerate() {
            if mark.offset > offset {
                break;
            }
            value = Some(mark.value);
            covering = i as isize;
        }
        if covering > 0 {
            marks.drain(..covering as usize);
        }
        value
    }

    /// The last supplied value, if it was supplied at exactly this offset.
    fn mark_exactly_at(marks: &mut Vec<Mark>, offset: usize) -> Option<u64> {
        let value = Self::mark_at(marks, offset)?;
        marks
            .iter()
            .any(|mark| mark.offset == offset)
            .then_some(value)
    }

    /// Where a unit running from the start of the buffer to `boundary` has to
    /// be cut short because a sequence header inside it describes something
    /// else.
    ///
    /// A unit carries one description: the H.264 parameter sets and the MP4
    /// sample entry are built from the header it opens with, and every picture
    /// in it is coded under that. A stream that changes format restarts its
    /// groups as well, so the cut above normally lands on the change anyway --
    /// this is for the stream that puts the new header somewhere else, and it
    /// costs a look only when a unit holds a second header at all.
    fn description_boundary(&self, first_gop: usize, boundary: usize) -> usize {
        let inner = self
            .sequences
            .iter()
            .copied()
            .filter(|&at| at > first_gop && at < boundary);
        let mut opening = None;
        for at in inner {
            let opening = opening
                .get_or_insert_with(|| stream_sequence_description(&self.buffer[..boundary]));
            if stream_sequence_description(&self.buffer[at..boundary]) != *opening {
                return at;
            }
        }
        boundary
    }

    /// The offset to cut at so that the picture at `pictures[index]` opens a
    /// new unit, if it is an anchor (I or P) picture coded right after a B
    /// picture of the same group.
    ///
    /// The unit is cut ahead of the headers that belong to that picture, which
    /// is where its sample begins, so none of its bytes change hands. Headers
    /// that start a sequence or a group are left to the group boundary.
    fn anchor_cut(&self, index: usize, floor: Option<usize>) -> Option<usize> {
        let picture = self.pictures[index];
        let previous = self.pictures[index - 1];
        if floor.is_some_and(|floor| previous <= floor) {
            return None;
        }
        if !matches!(Self::coding_type(&self.buffer, picture), Some(1 | 2))
            || Self::coding_type(&self.buffer, previous) != Some(3)
        {
            return None;
        }
        let mut after_slice = false;
        let mut block = None;
        let mut starts_something = false;
        scan_start_codes(&self.buffer[previous..picture], |at, code| {
            if (start_code::SLICE_MIN..=start_code::SLICE_MAX).contains(&code) {
                after_slice = true;
                block = None;
                starts_something = false;
            } else if after_slice {
                block.get_or_insert(previous + at);
                starts_something |=
                    code == start_code::SEQUENCE_HEADER || code == start_code::GROUP;
            }
            ControlFlow::Continue(())
        });
        if !after_slice || starts_something {
            return None;
        }
        Some(block.unwrap_or(picture))
    }

    /// `picture_coding_type` of the picture whose start code is at `picture`,
    /// once the byte holding it has arrived.
    fn coding_type(buffer: &[u8], picture: usize) -> Option<u8> {
        buffer.get(picture + 5).map(|&byte| (byte >> 3) & 7)
    }

    /// The first place before `end` where the pictures at the front of the
    /// buffer can be cut into a unit of their own, if the bytes that say so
    /// have arrived. `floor` is the group header the buffer's group opened
    /// with, when it did.
    fn next_anchor_cut(&mut self, floor: Option<usize>, end: usize) -> Option<usize> {
        loop {
            let index = self.examined.max(1);
            let picture = *self.pictures.get(index)?;
            if picture >= end {
                return None;
            }
            // The picture's coding type has not arrived yet.
            self.buffer.get(picture + 5)?;
            if let Some(cut) = self.anchor_cut(index, floor) {
                // The pictures ahead of this one leave with the unit.
                self.examined = index;
                return Some(cut);
            }
            self.examined = index + 1;
        }
    }

    /// Remember the quantiser matrices the bytes from `from` up to `to` load,
    /// ahead of those bytes leaving the buffer as a unit.
    fn remember_matrices(&mut self, from: usize, to: usize) {
        // `None` marks a sequence header, which puts the default matrices back.
        let mut found: Vec<Option<(usize, usize)>> = Vec::new();
        let mut open = None;
        let buffer = &self.buffer;
        scan_start_codes(&buffer[from..to], |at, code| {
            let at = from + at;
            if let Some(start) = open.take() {
                found.push(Some((start, at)));
            }
            if code == start_code::SEQUENCE_HEADER {
                found.push(None);
            }
            let loads_matrices = at + 4 < to
                && code == start_code::EXTENSION
                && u32::from(buffer[at + 4] >> 4) == extension::QUANT_MATRIX;
            if loads_matrices {
                open = Some(at);
            }
            ControlFlow::Continue(())
        });
        if let Some(start) = open {
            found.push(Some((start, to)));
        }
        for entry in found {
            let Some((start, end)) = entry else {
                self.group_matrices.clear();
                continue;
            };
            let chunk = self.buffer[start..end].to_vec();
            // The extensions are replayed in order, so a repeat of an earlier
            // one only needs its last place. Which matrices an extension loads
            // cannot be read from a fixed byte, so only identical ones merge.
            self.group_matrices.retain(|kept| *kept != chunk);
            self.group_matrices.push(chunk);
        }
    }

    /// Put what the next unit needs in front of it to be decoded on its own:
    /// the sequence header, and the matrices its group has loaded so far.
    fn reinject_headers(&mut self) {
        let mut merged = self.sequence_prefix.clone();
        for chunk in &self.group_matrices {
            merged.extend_from_slice(chunk);
        }
        let injected = merged.len();
        merged.append(&mut self.buffer);
        self.buffer = merged;
        self.prefix_length += injected;
        for offset in &mut self.sequences {
            *offset += injected;
        }
        for offset in &mut self.gops {
            *offset += injected;
        }
        for offset in &mut self.pictures {
            *offset += injected;
        }
        self.sequences.push_front(0);
        self.scan_pos += injected;
    }

    fn extract(&mut self, final_flush: bool) -> Vec<Mpeg2Gop> {
        let mut output = Vec::new();
        loop {
            let continuing = self.continuing;
            // The group header the unit at the front of the buffer opens with.
            // One that continues a group has none: the headers it holds are
            // the next group's.
            let first_gop = if continuing {
                None
            } else {
                let Some(&first_gop) = self.gops.front() else {
                    // Nothing to cut on yet. Anything before the first sequence
                    // header cannot be transcoded, so it is dropped rather than
                    // held.
                    if let Some(&first_sequence) = self.sequences.front() {
                        if first_sequence > 0 {
                            self.consume(first_sequence);
                        }
                    }
                    break;
                };
                // Everything the offsets above name moves down by this much
                // once the bytes ahead of the sequence header are dropped.
                let mut dropped = 0;
                if first_gop > 0 {
                    // Remember the sequence header this group was coded under,
                    // so the units after it can be given a copy.
                    if let Some(&sequence) = self.sequences.iter().rev().find(|&&at| at < first_gop)
                    {
                        self.sequence_prefix = self.buffer[sequence..first_gop].to_vec();
                        if sequence > 0 {
                            self.consume(sequence);
                            dropped = sequence;
                        }
                    }
                }
                // Every offset from here on is read back out of the deques,
                // which the drop above has already moved; the one captured
                // before it has to be moved to match.
                Some(first_gop - dropped)
            };
            let next_gop = if continuing {
                self.gops.front()
            } else {
                self.gops.get(1)
            }
            .copied();
            let lower = first_gop.unwrap_or(self.prefix_length);
            // Where the group ends, once the header of the one after it is in.
            // A sequence header of its own makes a better boundary than the
            // group header behind it, since the next unit then needs no
            // re-injected copy.
            let group_end = next_gop.map(|next_gop| {
                let next_sequence = self
                    .sequences
                    .iter()
                    .rev()
                    .find(|&&at| at > lower && at < next_gop)
                    .copied();
                let boundary = self.description_boundary(lower, next_sequence.unwrap_or(next_gop));
                (boundary, next_sequence.is_some())
            });
            let anchor = if self.split_groups {
                let end = group_end.map_or(self.buffer.len(), |(boundary, _)| boundary);
                self.next_anchor_cut(first_gop, end)
            } else {
                None
            };
            let (boundary, has_sequence) = match (anchor, group_end) {
                (Some(cut), _) => (cut, false),
                (None, Some(group_end)) => group_end,
                (None, None) => break,
            };
            if anchor.is_some() {
                self.remember_matrices(lower, boundary);
            } else {
                self.group_matrices.clear();
            }
            let unit = self.unit_before(boundary, anchor.is_some());
            output.push(unit);
            self.consume(boundary);
            self.continuing = anchor.is_some();
            if (anchor.is_some() || !has_sequence) && !self.sequence_prefix.is_empty() {
                // The next unit begins mid-sequence, so it needs its own copy
                // of the header to be decodable on its own.
                self.reinject_headers();
            }
        }
        if final_flush && !self.pictures.is_empty() {
            let unit = self.unit_before(self.buffer.len(), false);
            output.push(unit);
            self.buffer.clear();
            self.prefix_length = 0;
        }
        output
    }
}
