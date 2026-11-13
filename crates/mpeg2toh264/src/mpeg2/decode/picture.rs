//! Reconstruction of one coded picture into a frame buffer: prediction
//! (H.262 7.6), inverse quantisation (7.4), inverse DCT (7.5) and
//! concealment of what could not be decoded.

use crate::bitreader::BitReader;
use crate::error::Result;
use crate::mpeg2::constants::PictureStructure;
use crate::mpeg2::constants::{mb_flag, PictureType};
use crate::mpeg2::decode::frame::FrameBuffer;
use crate::mpeg2::decode::idct::{idct_add, idct_put, Block};
use crate::mpeg2::decode::motion;
use crate::mpeg2::decode::quant::Dequantiser;
use crate::mpeg2::headers::{Picture, Slice};
use crate::mpeg2::macroblock::{
    address_increment, decode_block, macroblock_header, motion_type, skipped_macroblock,
    Macroblock, SliceState, Syntax,
};

/// What a picture is decoded as, derived and checked by the caller.
pub(crate) struct Params<'a> {
    pub picture_type: PictureType,
    /// `None` for a frame picture, else the field's parity (0 = top).
    pub parity: Option<usize>,
    /// Whether this field is the second of its frame.
    pub second_field: bool,
    pub mb_width: usize,
    /// Macroblock rows of this picture: of the frame, or of one field.
    pub mb_rows: usize,
    pub top_field_first: bool,
    pub intra_dc_mult: i32,
    pub quantiser_scale: &'static [i32; 32],
    /// 4:2:0 uses the same matrix for luma and chroma (Table 7-5).
    pub intra_matrix: &'a [i32; 64],
    pub non_intra_matrix: &'a [i32; 64],
}

/// The two reference frames: `future` is the most recently decoded one, the
/// forward reference of P pictures and the backward one of B pictures;
/// `past` is the one before it, the forward reference of B pictures.
#[derive(Clone, Copy)]
pub(crate) struct References<'a> {
    pub past: Option<&'a FrameBuffer>,
    pub future: Option<&'a FrameBuffer>,
}

/// A macroblock's samples outside the frame, for the one case where its
/// prediction reads the frame it is decoded into: the second field of a P
/// frame (7.6.2.1). Luma is 16 x 16 and chroma 8 x 8, line by line.
struct Samples {
    luma: [u8; 256],
    chroma: [[u8; 64]; 2],
}

/// Where a macroblock's samples go: per plane (Y, Cb, Cr) the buffer, where
/// the macroblock's first line starts in it and how far apart its lines are.
struct Destination<'a> {
    planes: [&'a mut [u8]; 3],
    origin: [usize; 3],
    stride: [usize; 3],
}

impl<'a> Destination<'a> {
    /// The macroblock's place in `frame`.
    fn frame(frame: &'a mut FrameBuffer, parity: Option<usize>, mbx: usize, mby: usize) -> Self {
        let mut origin = [0; 3];
        let mut stride = [0; 3];
        for component in 0..3 {
            let (offset, step) = lines(frame, component, parity);
            let size = if component == 0 { 16 } else { 8 };
            origin[component] = offset + mby * size * step + mbx * size;
            stride[component] = step;
        }
        let [luma, cb, cr] = &mut frame.planes;
        Self {
            planes: [luma, cb, cr],
            origin,
            stride,
        }
    }

    fn samples(samples: &'a mut Samples) -> Self {
        let [cb, cr] = &mut samples.chroma;
        Self {
            planes: [&mut samples.luma, cb, cr],
            origin: [0; 3],
            stride: [16, 8, 8],
        }
    }
}

/// What prediction needs of a macroblock (6.3.17, 7.6).
#[derive(Clone, Copy)]
struct Motion {
    skipped: bool,
    /// Bit set of [`mb_flag`].
    flags: i32,
    motion_type: i32,
    /// Half-sample vectors at `[r * 4 + s * 2 + t]`, as [`Macroblock::mv`].
    mv: [i32; 8],
    dmvector: [i32; 2],
    /// `motion_vertical_field_select` at `[r * 2 + s]`.
    field_select: [u8; 4],
}

impl Motion {
    fn of(mb: &Macroblock) -> Self {
        Self {
            skipped: mb.skipped,
            flags: mb.flags,
            motion_type: mb.motion_type,
            mv: mb.mv,
            dmvector: mb.dmvector,
            field_select: mb.field_select,
        }
    }
}

/// A macroblock parsed where it cannot be reconstructed at once: below the
/// row of its slice, which only a damaged stream codes. It waits, whole, for a
/// slice of its own row to reach it or for the sweep at the end of the picture;
/// a macroblock coded at the same address again replaces it.
struct Deferred {
    mb: Macroblock,
    /// Bit `i` set when `blocks[i]` holds the coefficients of block `i`.
    coded: u8,
    blocks: [Block; 6],
    /// Whether the macroblock was read to its end.
    complete: bool,
}

const STORED: &str = "stored coefficients cannot fail to be read";

/// Where a macroblock goes once parsed.
enum Placement {
    /// Already reconstructed, or outside the picture: read and dropped.
    Discard,
    /// Reconstructed as it is read.
    Now,
    /// Kept for later.
    Later,
}

/// Reusable state for decoding pictures, sized for the largest picture seen.
pub(crate) struct Work {
    /// Whether the macroblock at the same address has been reconstructed.
    done: Vec<bool>,
    deferred: Vec<Deferred>,
    samples: Samples,
    block: Block,
}

impl Work {
    pub fn new() -> Self {
        Self {
            done: Vec::new(),
            deferred: Vec::new(),
            samples: Samples {
                luma: [0; 256],
                chroma: [[0; 64]; 2],
            },
            block: Block::new(),
        }
    }

    /// Decode every slice of `picture` into `target` and conceal every
    /// macroblock that did not come out of a slice whole or whose
    /// prediction needs a reference that is absent. Returns how many were
    /// concealed.
    ///
    /// A macroblock is reconstructed as it is read: its prediction first,
    /// then each block as its coefficients are decoded. A slice that runs
    /// past its row (only a damaged one can) leaves macroblocks elsewhere,
    /// which are kept until a slice of their own row ends or, failing that,
    /// until the sweep at the end. A macroblock a slice fails in is not
    /// reconstructed, and is concealed unless another slice codes it.
    pub fn decode(
        &mut self,
        data: &[u8],
        picture: &Picture,
        params: &Params<'_>,
        references: References<'_>,
        target: &mut FrameBuffer,
    ) -> usize {
        let cells = params.mb_width * params.mb_rows;
        self.done.clear();
        self.done.resize(cells, false);
        self.deferred.clear();
        let mut reader = BitReader::new(data);
        let syntax = Syntax::new(picture);
        let mut concealed = 0;
        for slice in &picture.slices {
            // A slice that fails part way keeps the macroblocks before the
            // failure; the rest of its row is concealed.
            let _ = self.slice(
                &mut reader,
                picture,
                &syntax,
                slice,
                params,
                references,
                target,
                &mut concealed,
            );
            let row = slice.vertical_position as usize - 1;
            if row < params.mb_rows {
                let first = row * params.mb_width;
                for index in 0..self.deferred.len() {
                    let address = self.deferred[index].mb.address;
                    if (first..first + params.mb_width).contains(&address) {
                        self.reconstruct_deferred(
                            index,
                            params,
                            references,
                            target,
                            &mut concealed,
                        );
                    }
                }
            }
        }
        for address in 0..cells {
            if self.done[address] {
                continue;
            }
            match self
                .deferred
                .iter()
                .position(|cell| cell.mb.address == address)
            {
                Some(index) if self.deferred[index].complete => {
                    self.reconstruct_deferred(index, params, references, target, &mut concealed);
                }
                _ => {
                    conceal(params, address, references, target);
                    concealed += 1;
                }
            }
        }
        concealed
    }

    /// Read one slice, reconstructing or keeping each macroblock.
    #[allow(clippy::too_many_arguments)]
    fn slice(
        &mut self,
        r: &mut BitReader<'_>,
        picture: &Picture,
        syntax: &Syntax,
        slice: &Slice,
        params: &Params<'_>,
        references: References<'_>,
        target: &mut FrameBuffer,
        concealed: &mut usize,
    ) -> Result<()> {
        r.set_bit_pos(slice.data_start_bit);
        let mut state = SliceState::new(picture, slice);
        let picture_type = picture.header.picture_coding_type;
        let frame = picture.coding.picture_structure == PictureStructure::Frame;
        // slice_vertical_position is 1-based and names the macroblock row.
        let row = slice.vertical_position as usize - 1;
        let mut address = row as isize * params.mb_width as isize - 1;
        while let Some(increment) = address_increment(r, syntax)? {
            // Everything between the previous macroblock and this one is skipped.
            for _ in 1..increment {
                address += 1;
                let mb = skipped_macroblock(&mut state, address as usize, picture_type, frame);
                self.place(
                    r, syntax, &mut state, params, references, target, row, &mb, concealed,
                )?;
            }
            address += 1;
            let mb = macroblock_header(r, picture, syntax, &mut state, address as usize, frame)?;
            self.place(
                r, syntax, &mut state, params, references, target, row, &mb, concealed,
            )?;
            state.finish(&mb);
        }
        Ok(())
    }

    /// Read the blocks of `mb`, whose header has just been read, and see to
    /// the macroblock as its address says: `row` is the slice's row.
    #[allow(clippy::too_many_arguments)]
    fn place(
        &mut self,
        r: &mut BitReader<'_>,
        syntax: &Syntax,
        state: &mut SliceState,
        params: &Params<'_>,
        references: References<'_>,
        target: &mut FrameBuffer,
        row: usize,
        mb: &Macroblock,
        concealed: &mut usize,
    ) -> Result<()> {
        let address = mb.address;
        let placement = if address >= self.done.len() || self.done[address] {
            Placement::Discard
        } else if address < (row + 1) * params.mb_width
            && !self.deferred.iter().any(|cell| cell.mb.address == address)
        {
            Placement::Now
        } else {
            Placement::Later
        };
        let dequantiser = Dequantiser {
            matrix: if mb.is_intra() {
                params.intra_matrix
            } else {
                params.non_intra_matrix
            },
            scale: params.quantiser_scale[mb.quantiser_scale_code as usize & 31],
            dc_mult: params.intra_dc_mult,
        };
        match placement {
            Placement::Discard => {
                for index in 0..6 {
                    if mb.is_coded(index) {
                        let result = decode_block(
                            r,
                            syntax,
                            state,
                            index,
                            mb.is_intra(),
                            &dequantiser,
                            &mut self.block,
                        );
                        self.block.clear();
                        result?;
                    }
                }
            }
            Placement::Now => {
                // A slice's addresses only go up from the start of its row, so
                // one short of the row's end is in the row.
                let mby = row;
                let mbx = address - row * params.mb_width;
                let mut reading = Reading {
                    r,
                    syntax,
                    state,
                    dequantiser,
                    block: &mut self.block,
                };
                let predicted = if params.second_field
                    && params.picture_type == PictureType::P
                    && !mb.is_intra()
                {
                    // The prediction may read the first field of `target`, so
                    // it is formed apart and stored afterwards.
                    let mut destination = Destination::samples(&mut self.samples);
                    let predicted = reconstruct(
                        params,
                        mb,
                        mbx,
                        mby,
                        references,
                        Some(target),
                        &mut destination,
                        &mut reading,
                    )?;
                    if predicted {
                        store(&self.samples, params.parity, mbx, mby, target);
                    }
                    predicted
                } else {
                    let mut destination = Destination::frame(target, params.parity, mbx, mby);
                    reconstruct(
                        params,
                        mb,
                        mbx,
                        mby,
                        references,
                        None,
                        &mut destination,
                        &mut reading,
                    )?
                };
                self.done[address] = true;
                if !predicted {
                    conceal(params, address, references, target);
                    *concealed += 1;
                }
            }
            Placement::Later => {
                let index = match self
                    .deferred
                    .iter()
                    .position(|cell| cell.mb.address == address)
                {
                    Some(index) => index,
                    None => {
                        self.deferred.push(Deferred {
                            mb: mb.clone(),
                            coded: 0,
                            blocks: std::array::from_fn(|_| Block::new()),
                            complete: false,
                        });
                        self.deferred.len() - 1
                    }
                };
                let cell = &mut self.deferred[index];
                for (index, block) in cell.blocks.iter_mut().enumerate() {
                    if cell.coded & (1 << index) != 0 {
                        block.clear();
                    }
                }
                cell.coded = 0;
                cell.mb = mb.clone();
                for index in 0..6 {
                    if mb.is_coded(index) {
                        let block = &mut cell.blocks[index];
                        let result = decode_block(
                            r,
                            syntax,
                            state,
                            index,
                            mb.is_intra(),
                            &dequantiser,
                            block,
                        );
                        if result.is_err() {
                            block.clear();
                        }
                        result?;
                        cell.coded |= 1 << index;
                    }
                }
                cell.complete = true;
            }
        }
        Ok(())
    }

    /// Reconstruct the deferred macroblock at `index` of the list, unless its
    /// address has been done, and conceal it if it cannot be predicted.
    fn reconstruct_deferred(
        &mut self,
        index: usize,
        params: &Params<'_>,
        references: References<'_>,
        target: &mut FrameBuffer,
        concealed: &mut usize,
    ) {
        let cell = &self.deferred[index];
        let address = cell.mb.address;
        if !cell.complete || self.done[address] {
            return;
        }
        self.done[address] = true;
        let mbx = address % params.mb_width;
        let mby = address / params.mb_width;
        let mb = &cell.mb;
        let mut stored = Stored(&cell.blocks);
        let predicted =
            if params.second_field && params.picture_type == PictureType::P && !mb.is_intra() {
                let mut destination = Destination::samples(&mut self.samples);
                let predicted = reconstruct(
                    params,
                    mb,
                    mbx,
                    mby,
                    references,
                    Some(target),
                    &mut destination,
                    &mut stored,
                )
                .expect(STORED);
                if predicted {
                    store(&self.samples, params.parity, mbx, mby, target);
                }
                predicted
            } else {
                let mut destination = Destination::frame(target, params.parity, mbx, mby);
                reconstruct(
                    params,
                    mb,
                    mbx,
                    mby,
                    references,
                    None,
                    &mut destination,
                    &mut stored,
                )
                .expect(STORED)
            };
        if !predicted {
            conceal(params, address, references, target);
            *concealed += 1;
        }
    }
}

/// Fill macroblock `address` of the picture `params` describes from the
/// co-located samples of the most recent reference frame, or with mid-grey
/// when there is none.
pub(crate) fn conceal(
    params: &Params<'_>,
    address: usize,
    references: References<'_>,
    target: &mut FrameBuffer,
) {
    let mbx = address % params.mb_width;
    let mby = address / params.mb_width;
    for component in 0..3 {
        let size = if component == 0 { 16 } else { 8 };
        let (offset, stride) = lines(target, component, params.parity);
        let start = offset + mby * size * stride + mbx * size;
        for line in 0..size {
            let at = start + line * stride;
            match references.future {
                Some(source) => target.planes[component][at..at + size]
                    .copy_from_slice(&source.planes[component][at..at + size]),
                None => target.planes[component][at..at + size].fill(128),
            }
        }
    }
}

/// Where line 0 of a picture starts in plane `component` and how far apart
/// its lines are: the whole plane for a frame picture, every other line for
/// a field picture.
#[inline]
fn lines(frame: &FrameBuffer, component: usize, parity: Option<usize>) -> (usize, usize) {
    let stride = frame.stride(component);
    match parity {
        None => (0, stride),
        Some(parity) => (parity * stride, 2 * stride),
    }
}

/// `x // 2` (4.1): halves are rounded away from zero.
#[inline]
fn half_rounded(x: i32) -> i32 {
    if x >= 0 {
        (x + 1) >> 1
    } else {
        -((1 - x) >> 1)
    }
}

/// Where the dequantised coefficients of a macroblock's blocks come from.
trait Coefficients {
    /// Block `index` of `mb`, which is coded. It is valid until [`Self::release`].
    fn block(&mut self, mb: &Macroblock, index: usize) -> Result<&Block>;
    /// Done with the block last handed out.
    fn release(&mut self);
}

/// The bit stream, a block read at a time into one scratch [`Block`].
struct Reading<'a, 'b> {
    r: &'a mut BitReader<'b>,
    syntax: &'a Syntax,
    state: &'a mut SliceState,
    dequantiser: Dequantiser<'a>,
    block: &'a mut Block,
}

impl Coefficients for Reading<'_, '_> {
    fn block(&mut self, mb: &Macroblock, index: usize) -> Result<&Block> {
        let result = decode_block(
            self.r,
            self.syntax,
            self.state,
            index,
            mb.is_intra(),
            &self.dequantiser,
            self.block,
        );
        if result.is_err() {
            self.block.clear();
        }
        result.map(|()| &*self.block)
    }

    fn release(&mut self) {
        self.block.clear();
    }
}

/// The blocks of a [`Deferred`] macroblock.
struct Stored<'a>(&'a [Block; 6]);

impl Coefficients for Stored<'_> {
    fn block(&mut self, _: &Macroblock, index: usize) -> Result<&Block> {
        Ok(&self.0[index])
    }

    fn release(&mut self) {}
}

/// Predict a non-intra macroblock, then add or store its coefficient blocks as
/// `coefficients` supplies them. Returns false when it cannot be predicted:
/// a reference it needs is absent or its prediction mode is invalid for the
/// picture. What it stored then is to be concealed, but its blocks are read
/// all the same, so that the slice stays in step.
#[allow(clippy::too_many_arguments)]
fn reconstruct(
    params: &Params<'_>,
    mb: &Macroblock,
    mbx: usize,
    mby: usize,
    references: References<'_>,
    current: Option<&FrameBuffer>,
    dst: &mut Destination<'_>,
    coefficients: &mut impl Coefficients,
) -> Result<bool> {
    let intra = mb.is_intra();
    let predicted = intra || predict(params, &Motion::of(mb), mbx, mby, references, current, dst);
    // Field DCT (6.3.17.1) puts the lines of each field in their own luma
    // blocks: blocks 0 and 1 hold the top field, 2 and 3 the bottom.
    let field_dct = mb.dct_type == 1 && params.parity.is_none();
    for index in 0..6 {
        if !mb.is_coded(index) {
            continue;
        }
        let block = coefficients.block(mb, index)?;
        if predicted {
            let (component, offset, stride) = if index < 4 {
                let x = (index & 1) * 8;
                let stride = dst.stride[0];
                if field_dct {
                    (0, (index >> 1) * stride + x, stride * 2)
                } else {
                    (0, (index >> 1) * 8 * stride + x, stride)
                }
            } else {
                (index - 3, 0, dst.stride[index - 3])
            };
            let at = dst.origin[component] + offset;
            if intra {
                idct_put(block, dst.planes[component], at, stride);
            } else {
                idct_add(block, dst.planes[component], at, stride);
            }
        }
        coefficients.release();
    }
    Ok(predicted)
}

/// Copy a macroblock formed in `samples` to its place in `target`.
fn store(
    samples: &Samples,
    parity: Option<usize>,
    mbx: usize,
    mby: usize,
    target: &mut FrameBuffer,
) {
    let destination = Destination::frame(target, parity, mbx, mby);
    let sources: [&[u8]; 3] = [&samples.luma, &samples.chroma[0], &samples.chroma[1]];
    for (component, plane) in destination.planes.into_iter().enumerate() {
        let size = if component == 0 { 16 } else { 8 };
        for line in 0..size {
            plane[destination.origin[component] + line * destination.stride[component]..][..size]
                .copy_from_slice(&sources[component][line * size..][..size]);
        }
    }
}

/// Form the prediction of a non-intra macroblock (7.6.5 to 7.6.7).
fn predict(
    params: &Params<'_>,
    mb: &Motion,
    mbx: usize,
    mby: usize,
    references: References<'_>,
    current: Option<&FrameBuffer>,
    dst: &mut Destination<'_>,
) -> bool {
    let forward = mb.flags & mb_flag::MOTION_FORWARD != 0;
    let backward = mb.flags & mb_flag::MOTION_BACKWARD != 0;
    let x = (mbx * 16) as i32;
    match params.picture_type {
        PictureType::P => {
            if backward {
                return false;
            }
            if !forward {
                // Skipped (7.6.6.1, 7.6.6.2) or coded without a vector
                // (7.6.3.5): a zero vector, from the field of the same parity
                // in a field picture.
                let (source, parity) = match params.parity {
                    None => (references.future, None),
                    Some(parity) => (
                        field_source(params, 0, parity, references, current),
                        Some(parity),
                    ),
                };
                let Some(source) = source else {
                    return false;
                };
                part(
                    source,
                    parity,
                    x,
                    (mby * 16) as i32,
                    0,
                    0,
                    Lines::WHOLE,
                    dst,
                    false,
                );
                return true;
            }
        }
        PictureType::B => {
            if !forward && !backward {
                return false;
            }
        }
        _ => return false,
    }

    // The second direction is averaged into the first.
    let mut form = |direction: usize, average: bool| match params.parity {
        None => frame_picture(params, mb, direction, mbx, mby, references, dst, average),
        Some(parity) => field_picture(
            params, mb, direction, parity, mbx, mby, references, current, dst, average,
        ),
    };
    (!forward || form(0, false)) && (!backward || form(1, forward))
}

/// The reference frame a frame prediction in `direction` reads.
fn frame_source<'r>(
    params: &Params<'_>,
    direction: usize,
    references: References<'r>,
) -> Option<&'r FrameBuffer> {
    if direction == 0 && params.picture_type == PictureType::B {
        references.past
    } else {
        references.future
    }
}

/// The frame holding the reference field of `parity` that a field prediction
/// in `direction` reads (7.6.2.1). The second field of a P frame finds the
/// field of the opposite parity in its own frame, `current`.
fn field_source<'r>(
    params: &Params<'_>,
    direction: usize,
    parity: usize,
    references: References<'r>,
    current: Option<&'r FrameBuffer>,
) -> Option<&'r FrameBuffer> {
    if direction == 0 && params.picture_type == PictureType::B {
        references.past
    } else if params.second_field
        && params.picture_type == PictureType::P
        && params.parity.is_some_and(|own| own != parity)
    {
        current
    } else {
        references.future
    }
}

#[allow(clippy::too_many_arguments)]
fn frame_picture(
    params: &Params<'_>,
    mb: &Motion,
    direction: usize,
    mbx: usize,
    mby: usize,
    references: References<'_>,
    dst: &mut Destination<'_>,
    average: bool,
) -> bool {
    let Some(source) = frame_source(params, direction, references) else {
        return false;
    };
    let x = (mbx * 16) as i32;
    let s = direction * 2;
    match mb.motion_type {
        // Skipped B macroblocks are frame-based too (7.6.6.4).
        motion_type::FRAME_OR_16X8 => {
            let y = (mby * 16) as i32;
            part(
                source,
                None,
                x,
                y,
                mb.mv[s],
                mb.mv[s + 1],
                Lines::WHOLE,
                dst,
                average,
            );
        }
        motion_type::FIELD => {
            // One prediction per field of the macroblock, each from the
            // reference field motion_vertical_field_select names.
            for r in 0..2 {
                let parity = mb.field_select[r * 2 + direction] as usize;
                let v = r * 4 + s;
                let y = (mby * 8) as i32;
                part(
                    source,
                    Some(parity),
                    x,
                    y,
                    mb.mv[v],
                    mb.mv[v + 1],
                    Lines::field(r),
                    dst,
                    average,
                );
            }
        }
        motion_type::DUAL_PRIME if params.picture_type == PictureType::P => {
            // 7.6.3.6: each field of the macroblock averages the reference
            // field of the same parity, with the decoded vector, and the one
            // of the opposite parity, with that vector scaled by the field
            // distance m and moved by e (Tables 7-11 and 7-12).
            for r in 0..2 {
                let (m, e) = match (r, params.top_field_first) {
                    (0, true) => (1, -1),
                    (0, false) => (3, -1),
                    (_, true) => (3, 1),
                    (_, false) => (1, 1),
                };
                let (vx, vy) = (mb.mv[0], mb.mv[1]);
                let dx = half_rounded(vx * m) + mb.dmvector[0];
                let dy = half_rounded(vy * m) + e + mb.dmvector[1];
                let y = (mby * 8) as i32;
                part(source, Some(r), x, y, vx, vy, Lines::field(r), dst, false);
                part(
                    source,
                    Some(1 - r),
                    x,
                    y,
                    dx,
                    dy,
                    Lines::field(r),
                    dst,
                    true,
                );
            }
        }
        _ => return false,
    }
    true
}

#[allow(clippy::too_many_arguments)]
fn field_picture(
    params: &Params<'_>,
    mb: &Motion,
    direction: usize,
    parity: usize,
    mbx: usize,
    mby: usize,
    references: References<'_>,
    current: Option<&FrameBuffer>,
    dst: &mut Destination<'_>,
    average: bool,
) -> bool {
    let x = (mbx * 16) as i32;
    let y = (mby * 16) as i32;
    let s = direction * 2;
    match mb.motion_type {
        motion_type::FIELD => {
            // A skipped B macroblock predicts from the field of its own
            // parity (7.6.6.3).
            let selected = if mb.skipped {
                parity
            } else {
                mb.field_select[direction] as usize
            };
            let Some(source) = field_source(params, direction, selected, references, current)
            else {
                return false;
            };
            part(
                source,
                Some(selected),
                x,
                y,
                mb.mv[s],
                mb.mv[s + 1],
                Lines::WHOLE,
                dst,
                average,
            );
        }
        motion_type::FRAME_OR_16X8 => {
            // 16x8: the upper and lower halves each have a vector and a
            // reference field of their own (7.6.7.3).
            for r in 0..2 {
                let selected = mb.field_select[r * 2 + direction] as usize;
                let Some(source) = field_source(params, direction, selected, references, current)
                else {
                    return false;
                };
                let v = r * 4 + s;
                let top = y + 8 * r as i32;
                part(
                    source,
                    Some(selected),
                    x,
                    top,
                    mb.mv[v],
                    mb.mv[v + 1],
                    Lines::half(r),
                    dst,
                    average,
                );
            }
        }
        motion_type::DUAL_PRIME if params.picture_type == PictureType::P => {
            // 7.6.3.6 for a field picture: m is 1, and e moves the vector
            // half a field line towards the other field.
            let opposite = 1 - parity;
            let e = if parity == 0 { -1 } else { 1 };
            let (vx, vy) = (mb.mv[0], mb.mv[1]);
            let dx = half_rounded(vx) + mb.dmvector[0];
            let dy = half_rounded(vy) + e + mb.dmvector[1];
            let (Some(same), Some(other)) = (
                field_source(params, 0, parity, references, current),
                field_source(params, 0, opposite, references, current),
            ) else {
                return false;
            };
            part(same, Some(parity), x, y, vx, vy, Lines::WHOLE, dst, false);
            part(other, Some(opposite), x, y, dx, dy, Lines::WHOLE, dst, true);
        }
        _ => return false,
    }
    true
}

/// Which lines of the macroblock a prediction fills: from `first` (luma) and
/// `chroma_first`, every `step`-th line, `count` luma lines in all.
#[derive(Clone, Copy)]
struct Lines {
    first: usize,
    chroma_first: usize,
    step: usize,
    count: usize,
}

impl Lines {
    /// All 16 lines.
    const WHOLE: Self = Self {
        first: 0,
        chroma_first: 0,
        step: 1,
        count: 16,
    };

    /// The lines of field `parity` in a frame macroblock.
    fn field(parity: usize) -> Self {
        Self {
            first: parity,
            chroma_first: parity,
            step: 2,
            count: 8,
        }
    }

    /// The upper (0) or lower (1) half of a field macroblock.
    fn half(half: usize) -> Self {
        Self {
            first: 8 * half,
            chroma_first: 4 * half,
            step: 1,
            count: 8,
        }
    }
}

/// Predict luma at (`x`, `y`) of the frame or field with vector (`vx`,
/// `vy`) into `lines` of the macroblock, and both chroma components with the
/// vector halved towards zero (7.6.3.7) at half the position.
#[allow(clippy::too_many_arguments)]
fn part(
    source: &FrameBuffer,
    parity: Option<usize>,
    x: i32,
    y: i32,
    vx: i32,
    vy: i32,
    lines: Lines,
    dst: &mut Destination<'_>,
    average: bool,
) {
    let luma = source.view(0, parity);
    let offset = dst.origin[0] + lines.first * dst.stride[0];
    let stride = dst.stride[0] * lines.step;
    let [luma_dst, cb_dst, cr_dst] = &mut dst.planes;
    // Cb and Cr share their layout.
    let chroma_offset = dst.origin[1] + lines.chroma_first * dst.stride[1];
    let chroma_stride = dst.stride[1] * lines.step;
    let (cx, cy, cvx, cvy) = (x / 2, y / 2, vx / 2, vy / 2);
    let h = lines.count;
    let chroma = [
        (source.view(1, parity), cb_dst),
        (source.view(2, parity), cr_dst),
    ];
    if average {
        motion::predict::<16, true>(luma, x, y, vx, vy, h, luma_dst, offset, stride);
        for (view, plane) in chroma {
            motion::predict::<8, true>(
                view,
                cx,
                cy,
                cvx,
                cvy,
                h / 2,
                plane,
                chroma_offset,
                chroma_stride,
            );
        }
    } else {
        motion::predict::<16, false>(luma, x, y, vx, vy, h, luma_dst, offset, stride);
        for (view, plane) in chroma {
            motion::predict::<8, false>(
                view,
                cx,
                cy,
                cvx,
                cvy,
                h / 2,
                plane,
                chroma_offset,
                chroma_stride,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mpeg2::constants::{
        PictureStructure, DEFAULT_INTRA_QUANT, DEFAULT_NON_INTRA_QUANT, QUANTISER_SCALE,
    };
    use crate::mpeg2::decode::frame::FrameInfo;

    const WIDTH: usize = 64;
    const HEIGHT: usize = 64;

    struct Random(u32);

    impl Random {
        fn next(&mut self) -> u32 {
            self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            self.0 >> 8
        }

        fn range(&mut self, low: i32, high: i32) -> i32 {
            low + (self.next() % (high - low + 1) as u32) as i32
        }
    }

    fn info() -> FrameInfo {
        FrameInfo {
            width: WIDTH,
            height: HEIGHT,
            picture_type: PictureType::I,
            picture_structure: PictureStructure::Frame,
            temporal_reference: 0,
            progressive_sequence: false,
            progressive_frame: false,
            top_field_first: true,
            repeat_first_field: false,
            concealed_macroblocks: 0,
            macroblocks: 0,
            missing_reference: false,
            missing_field: false,
        }
    }

    fn noise_frame(random: &mut Random) -> FrameBuffer {
        let mut frame = FrameBuffer::new(WIDTH, HEIGHT, info());
        for plane in frame.planes.iter_mut() {
            for sample in plane.iter_mut() {
                *sample = random.next() as u8;
            }
        }
        frame
    }

    fn params(
        picture_type: PictureType,
        parity: Option<usize>,
        second_field: bool,
        tff: bool,
    ) -> Params<'static> {
        Params {
            picture_type,
            parity,
            second_field,
            mb_width: WIDTH / 16,
            mb_rows: if parity.is_some() {
                HEIGHT / 32
            } else {
                HEIGHT / 16
            },
            top_field_first: tff,
            intra_dc_mult: 8,
            quantiser_scale: &QUANTISER_SCALE[0],
            intra_matrix: &DEFAULT_INTRA_QUANT,
            non_intra_matrix: &DEFAULT_NON_INTRA_QUANT,
        }
    }

    /// 7.6.4 for one sample of component `c` at (`x`, `y`) of a frame
    /// (`parity` None) or of one of its fields, coordinates clamped to it.
    fn sample(
        frame: &FrameBuffer,
        c: usize,
        parity: Option<usize>,
        x: i32,
        y: i32,
        v: (i32, i32),
    ) -> u32 {
        let width = if c == 0 { WIDTH } else { WIDTH / 2 } as i32;
        let frame_height = if c == 0 { HEIGHT } else { HEIGHT / 2 } as i32;
        let height = if parity.is_some() {
            frame_height / 2
        } else {
            frame_height
        };
        let at = |i: i32, j: i32| -> u32 {
            let i = i.clamp(0, width - 1);
            let j = j.clamp(0, height - 1);
            let line = match parity {
                None => j,
                Some(p) => 2 * j + p as i32,
            };
            frame.planes[c][(line * width + i) as usize] as u32
        };
        let (ix, iy) = (v.0.div_euclid(2), v.1.div_euclid(2));
        let (hx, hy) = (v.0 - 2 * ix != 0, v.1 - 2 * iy != 0);
        let (px, py) = (x + ix, y + iy);
        match (hx, hy) {
            (false, false) => at(px, py),
            (true, false) => (at(px, py) + at(px + 1, py)).div_ceil(2),
            (false, true) => (at(px, py) + at(px, py + 1)).div_ceil(2),
            (true, true) => {
                (at(px, py) + at(px + 1, py) + at(px, py + 1) + at(px + 1, py + 1) + 2) / 4
            }
        }
    }

    /// `x // 2` with halves away from zero, by floating point.
    fn halve_rounded(x: i32) -> i32 {
        (x as f64 / 2.0).round() as i32
    }

    struct Case<'a> {
        params: Params<'static>,
        motion: Motion,
        mbx: usize,
        mby: usize,
        past: &'a FrameBuffer,
        future: &'a FrameBuffer,
        current: &'a FrameBuffer,
    }

    /// The prediction of Tables 7-13 and 7-14 sample by sample.
    fn expected(case: &Case<'_>) -> [Vec<u8>; 3] {
        let m = &case.motion;
        let p = &case.params;
        let directions: Vec<usize> = match p.picture_type {
            PictureType::P => vec![0],
            _ => (0..2)
                .filter(|&s| m.flags & [mb_flag::MOTION_FORWARD, mb_flag::MOTION_BACKWARD][s] != 0)
                .collect(),
        };
        let no_vector = p.picture_type == PictureType::P && m.flags & mb_flag::MOTION_FORWARD == 0;
        // The frame holding the reference field of `parity` for direction `s`.
        let field_frame = |s: usize, parity: usize| -> &FrameBuffer {
            if p.picture_type == PictureType::B {
                if s == 0 {
                    case.past
                } else {
                    case.future
                }
            } else if p.second_field && p.parity != Some(parity) {
                case.current
            } else {
                case.future
            }
        };
        let frame_frame = |s: usize| -> &FrameBuffer {
            if p.picture_type == PictureType::B && s == 0 {
                case.past
            } else {
                case.future
            }
        };
        let mut out = [vec![0u8; 256], vec![0u8; 64], vec![0u8; 64]];
        for c in 0..3 {
            let size = if c == 0 { 16 } else { 8 };
            let scale = |v: (i32, i32)| if c == 0 { v } else { (v.0 / 2, v.1 / 2) };
            let vector = |r: usize, s: usize| scale((m.mv[r * 4 + s * 2], m.mv[r * 4 + s * 2 + 1]));
            for yy in 0..size {
                for xx in 0..size {
                    let x = (case.mbx * size + xx) as i32;
                    let one = |s: usize| -> u32 {
                        match p.parity {
                            None => {
                                let y = (case.mby * size + yy) as i32;
                                let field_line = (case.mby * size / 2 + yy / 2) as i32;
                                let own = yy & 1;
                                if no_vector {
                                    return sample(case.future, c, None, x, y, (0, 0));
                                }
                                match m.motion_type {
                                    motion_type::FRAME_OR_16X8 => {
                                        sample(frame_frame(s), c, None, x, y, vector(0, s))
                                    }
                                    motion_type::FIELD => {
                                        let selected = m.field_select[own * 2 + s] as usize;
                                        sample(
                                            frame_frame(s),
                                            c,
                                            Some(selected),
                                            x,
                                            field_line,
                                            vector(own, s),
                                        )
                                    }
                                    _ => {
                                        let mv = (m.mv[0], m.mv[1]);
                                        let distance = match (own, p.top_field_first) {
                                            (0, true) | (1, false) => 1,
                                            _ => 3,
                                        };
                                        let shift = if own == 0 { -1 } else { 1 };
                                        let derived = (
                                            halve_rounded(mv.0 * distance) + m.dmvector[0],
                                            halve_rounded(mv.1 * distance) + shift + m.dmvector[1],
                                        );
                                        let same = sample(
                                            case.future,
                                            c,
                                            Some(own),
                                            x,
                                            field_line,
                                            scale(mv),
                                        );
                                        let other = sample(
                                            case.future,
                                            c,
                                            Some(1 - own),
                                            x,
                                            field_line,
                                            scale(derived),
                                        );
                                        (same + other).div_ceil(2)
                                    }
                                }
                            }
                            Some(own) => {
                                let y = (case.mby * size + yy) as i32;
                                if no_vector {
                                    return sample(field_frame(0, own), c, Some(own), x, y, (0, 0));
                                }
                                match m.motion_type {
                                    motion_type::FIELD => {
                                        let selected = if m.skipped {
                                            own
                                        } else {
                                            m.field_select[s] as usize
                                        };
                                        sample(
                                            field_frame(s, selected),
                                            c,
                                            Some(selected),
                                            x,
                                            y,
                                            vector(0, s),
                                        )
                                    }
                                    motion_type::FRAME_OR_16X8 => {
                                        let r = yy / (size / 2);
                                        let selected = m.field_select[r * 2 + s] as usize;
                                        sample(
                                            field_frame(s, selected),
                                            c,
                                            Some(selected),
                                            x,
                                            y,
                                            vector(r, s),
                                        )
                                    }
                                    _ => {
                                        let mv = (m.mv[0], m.mv[1]);
                                        let shift = if own == 0 { -1 } else { 1 };
                                        let derived = (
                                            halve_rounded(mv.0) + m.dmvector[0],
                                            halve_rounded(mv.1) + shift + m.dmvector[1],
                                        );
                                        let same = sample(
                                            field_frame(0, own),
                                            c,
                                            Some(own),
                                            x,
                                            y,
                                            scale(mv),
                                        );
                                        let other = sample(
                                            field_frame(0, 1 - own),
                                            c,
                                            Some(1 - own),
                                            x,
                                            y,
                                            scale(derived),
                                        );
                                        (same + other).div_ceil(2)
                                    }
                                }
                            }
                        }
                    };
                    let value = if directions.len() == 2 {
                        (one(0) + one(1)).div_ceil(2)
                    } else {
                        one(directions[0])
                    };
                    out[c][yy * size + xx] = value as u8;
                }
            }
        }
        out
    }

    fn run(case: &Case<'_>) -> Option<[Vec<u8>; 3]> {
        let mut samples = Samples {
            luma: [0; 256],
            chroma: [[0; 64]; 2],
        };
        let references = References {
            past: Some(case.past),
            future: Some(case.future),
        };
        let mut destination = Destination::samples(&mut samples);
        if !predict(
            &case.params,
            &case.motion,
            case.mbx,
            case.mby,
            references,
            Some(case.current),
            &mut destination,
        ) {
            return None;
        }
        Some([
            samples.luma.to_vec(),
            samples.chroma[0].to_vec(),
            samples.chroma[1].to_vec(),
        ])
    }

    fn random_motion(random: &mut Random, flags: i32, motion_type: i32, skipped: bool) -> Motion {
        let mut vector = || {
            // Mostly within the picture, sometimes far outside it.
            if random.next() % 8 == 0 {
                random.range(-400, 400)
            } else {
                random.range(-24, 24)
            }
        };
        let mv = std::array::from_fn(|_| vector());
        Motion {
            skipped,
            flags,
            motion_type,
            mv,
            dmvector: [random.range(-1, 1), random.range(-1, 1)],
            field_select: std::array::from_fn(|_| (random.next() & 1) as u8),
        }
    }

    /// Every prediction mode of frame and field pictures, every direction,
    /// against the per-sample definition: frame, field and dual-prime
    /// prediction in frame pictures; field, 16x8 and dual-prime prediction in
    /// field pictures, including the second field of a P frame predicting
    /// from the first; P macroblocks without a vector; skipped macroblocks;
    /// and vectors that leave the picture.
    #[test]
    fn every_prediction_mode_matches_the_definition() {
        let mut random = Random(99);
        let past = noise_frame(&mut random);
        let future = noise_frame(&mut random);
        let current = noise_frame(&mut random);
        let directions = [
            mb_flag::MOTION_FORWARD,
            mb_flag::MOTION_BACKWARD,
            mb_flag::MOTION_FORWARD | mb_flag::MOTION_BACKWARD,
        ];
        let mut checked = 0;
        for trial in 0..400 {
            for tff in [true, false] {
                let structures = [
                    (None, false),
                    (Some(0), false),
                    (Some(1), false),
                    (Some(0), true),
                    (Some(1), true),
                ];
                for (parity, second_field) in structures {
                    let mb_rows = if parity.is_some() {
                        HEIGHT / 32
                    } else {
                        HEIGHT / 16
                    };
                    let mbx = trial % (WIDTH / 16);
                    let mby = (trial / 4) % mb_rows;
                    let mut cases = Vec::new();
                    for motion_type in [motion_type::FIELD, motion_type::FRAME_OR_16X8] {
                        for &flags in &directions {
                            cases.push((
                                PictureType::B,
                                random_motion(&mut random, flags, motion_type, false),
                            ));
                        }
                        cases.push((
                            PictureType::P,
                            random_motion(&mut random, mb_flag::MOTION_FORWARD, motion_type, false),
                        ));
                    }
                    cases.push((
                        PictureType::P,
                        random_motion(
                            &mut random,
                            mb_flag::MOTION_FORWARD,
                            motion_type::DUAL_PRIME,
                            false,
                        ),
                    ));
                    // Coded without a vector, and skipped, in P pictures.
                    cases.push((
                        PictureType::P,
                        random_motion(&mut random, mb_flag::PATTERN, motion_type::NONE, false),
                    ));
                    cases.push((
                        PictureType::P,
                        random_motion(&mut random, 0, motion_type::NONE, true),
                    ));
                    // Skipped in B pictures: frame-based in frame pictures,
                    // same-parity field-based in field pictures.
                    let skipped_type = if parity.is_none() {
                        motion_type::FRAME_OR_16X8
                    } else {
                        motion_type::FIELD
                    };
                    for &flags in &directions {
                        cases.push((
                            PictureType::B,
                            random_motion(&mut random, flags, skipped_type, true),
                        ));
                    }
                    for (picture_type, motion) in cases {
                        if picture_type == PictureType::B && second_field {
                            continue;
                        }
                        let case = Case {
                            params: params(picture_type, parity, second_field, tff),
                            motion,
                            mbx,
                            mby,
                            past: &past,
                            future: &future,
                            current: &current,
                        };
                        let got = run(&case).expect("a valid mode predicts");
                        let want = expected(&case);
                        for c in 0..3 {
                            assert_eq!(
                                got[c], want[c],
                                "component {c}, {picture_type:?}, parity {parity:?} second {second_field}, \
                                 tff {tff}, motion type {} flags {}",
                                motion.motion_type, motion.flags
                            );
                        }
                        checked += 1;
                    }
                }
            }
        }
        assert!(checked > 10_000);
    }

    #[test]
    fn invalid_modes_and_missing_references_are_refused() {
        let mut random = Random(5);
        let frame = noise_frame(&mut random);
        let mut samples = Samples {
            luma: [0; 256],
            chroma: [[0; 64]; 2],
        };
        let both = References {
            past: Some(&frame),
            future: Some(&frame),
        };
        let only_future = References {
            past: None,
            future: Some(&frame),
        };
        let none = References {
            past: None,
            future: None,
        };
        let forward = mb_flag::MOTION_FORWARD;
        let backward = mb_flag::MOTION_BACKWARD;
        let refused = [
            // Dual prime is P only.
            (PictureType::B, forward, motion_type::DUAL_PRIME, both),
            // A B macroblock with no direction.
            (PictureType::B, 0, motion_type::FRAME_OR_16X8, both),
            // A reserved motion type.
            (PictureType::B, forward, motion_type::NONE, both),
            // Backward prediction in a P picture.
            (
                PictureType::P,
                forward | backward,
                motion_type::FRAME_OR_16X8,
                both,
            ),
            // Forward prediction of a B picture with no past reference.
            (
                PictureType::B,
                forward,
                motion_type::FRAME_OR_16X8,
                only_future,
            ),
            // A P picture with no reference at all.
            (PictureType::P, 0, motion_type::NONE, none),
        ];
        for (picture_type, flags, kind, references) in refused {
            let motion = random_motion(&mut random, flags, kind, false);
            let mut destination = Destination::samples(&mut samples);
            let params = params(picture_type, None, false, true);
            assert!(
                !predict(&params, &motion, 0, 0, references, None, &mut destination),
                "{picture_type:?} flags {flags} motion type {kind}"
            );
        }
    }

    #[test]
    fn concealment_copies_the_newest_reference_or_fills_grey() {
        let mut random = Random(11);
        let source = noise_frame(&mut random);
        let mut target = noise_frame(&mut random);
        for parity in [None, Some(1)] {
            let params = params(PictureType::B, parity, false, true);
            conceal(
                &params,
                5,
                References {
                    past: None,
                    future: Some(&source),
                },
                &mut target,
            );
            conceal(
                &params,
                6,
                References {
                    past: None,
                    future: None,
                },
                &mut target,
            );
            for c in 0..3 {
                let size = if c == 0 { 16 } else { 8 };
                let (offset, stride) = lines(&target, c, parity);
                for (address, from) in [(5, Some(&source)), (6, None)] {
                    let start = offset + (address / 4) * size * stride + (address % 4) * size;
                    for line in 0..size {
                        let at = start + line * stride;
                        let expected: Vec<u8> = match from {
                            Some(frame) => frame.planes[c][at..at + size].to_vec(),
                            None => vec![128; size],
                        };
                        assert_eq!(&target.planes[c][at..at + size], &expected[..]);
                    }
                }
            }
        }
    }
}
