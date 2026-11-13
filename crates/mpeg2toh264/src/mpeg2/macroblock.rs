//! MPEG-2 macroblock layer decoding.
//!
//! Coefficients come out as quantised levels, not pixels: nothing here
//! dequantises, inverse transforms, or motion compensates. Motion vectors are
//! reconstructed, because prediction needs their actual values.

use std::sync::LazyLock;

use crate::bitreader::BitReader;
use crate::error::{bail, Result};
use crate::mpeg2::constants::{
    mb_flag, PictureStructure, PictureType, ALTERNATE_SCAN, ZIGZAG_SCAN,
};
use crate::mpeg2::decode::idct::Block;
use crate::mpeg2::decode::quant::Dequantiser;
use crate::mpeg2::headers::{Picture, Slice};
use crate::mpeg2::vlc::{Decoder, VlcTable, WideDecoder, WIDE_BITS};
use crate::mpeg2::vlc_tables::{
    CODED_BLOCK_PATTERN, DCT_COEFF_TABLE0, DCT_COEFF_TABLE1, DCT_DC_SIZE_CHROMA, DCT_DC_SIZE_LUMA,
    DMVECTOR, EOB, ESCAPE, MB_ADDR_ESCAPE, MB_ADDR_INCREMENT, MB_TYPE_B, MB_TYPE_I, MB_TYPE_P,
    MOTION_CODE,
};

static V_MB_ADDR: LazyLock<VlcTable> =
    LazyLock::new(|| VlcTable::new("macroblock_address_increment", MB_ADDR_INCREMENT));
static V_MB_TYPE_I: LazyLock<VlcTable> =
    LazyLock::new(|| VlcTable::new("macroblock_type(I)", MB_TYPE_I));
static V_MB_TYPE_P: LazyLock<VlcTable> =
    LazyLock::new(|| VlcTable::new("macroblock_type(P)", MB_TYPE_P));
static V_MB_TYPE_B: LazyLock<VlcTable> =
    LazyLock::new(|| VlcTable::new("macroblock_type(B)", MB_TYPE_B));
static V_CBP: LazyLock<VlcTable> =
    LazyLock::new(|| VlcTable::new("coded_block_pattern", CODED_BLOCK_PATTERN));
static V_MOTION: LazyLock<VlcTable> = LazyLock::new(|| VlcTable::new("motion_code", MOTION_CODE));
static V_DMV: LazyLock<VlcTable> = LazyLock::new(|| VlcTable::new("dmvector", DMVECTOR));
static V_DC_LUMA: LazyLock<VlcTable> =
    LazyLock::new(|| VlcTable::new("dct_dc_size_luminance", DCT_DC_SIZE_LUMA));
static V_DC_CHROMA: LazyLock<VlcTable> =
    LazyLock::new(|| VlcTable::new("dct_dc_size_chrominance", DCT_DC_SIZE_CHROMA));
static V_COEFF0: LazyLock<VlcTable> =
    LazyLock::new(|| coefficient_table("dct_coefficients_0", DCT_COEFF_TABLE0, true));
static V_COEFF0_INTRA: LazyLock<VlcTable> =
    LazyLock::new(|| coefficient_table("dct_coefficients_0(intra)", DCT_COEFF_TABLE0, false));
static V_COEFF1_INTRA: LazyLock<VlcTable> =
    LazyLock::new(|| coefficient_table("dct_coefficients_1", DCT_COEFF_TABLE1, false));

/// How a coefficient comes out of [`coefficient_table`]: the run in the high
/// bits and the factor its level contributes to 7.4.2.3, offset so that it is
/// never negative, in the low eight. The largest level of the tables is 40.
const COEFFICIENT_RUN_SHIFT: u32 = 8;
const COEFFICIENT_FACTOR_BIAS: i32 = 128;

/// Table B.14 or B.15 with the sign bit that follows every run/level code
/// folded into the code itself, so a coefficient is one lookup rather than a
/// lookup and a bit, and with the level already turned into what inverse
/// quantisation multiplies by: `2 * level` for an intra block and
/// `2 * level + sign(level)` for the others (`odd`). End of block and escape
/// carry no sign and stay as they are. The first lookup covers ten bits: the
/// codes a broadcast spends most of its time in are six to nine bits before
/// their sign.
fn coefficient_table(name: &'static str, entries: &[(&str, i32)], odd: bool) -> VlcTable {
    let mut signed: Vec<(String, i32)> = Vec::with_capacity(entries.len() * 2);
    for &(code, value) in entries {
        if value == EOB || value == ESCAPE {
            signed.push((code.to_string(), value));
            continue;
        }
        let run = value >> 8;
        let level = value & 0xff;
        for (sign, level) in [("0", level), ("1", -level)] {
            let factor = 2 * level + if odd { level.signum() } else { 0 };
            signed.push((
                format!("{code}{sign}"),
                (run << COEFFICIENT_RUN_SHIFT) | (factor + COEFFICIENT_FACTOR_BIAS),
            ));
        }
    }
    let entries: Vec<(&str, i32)> = signed
        .iter()
        .map(|(code, value)| (code.as_str(), *value))
        .collect();
    VlcTable::with_primary_bits(name, &entries, WIDE_BITS)
}

/// What reading a macroblock needs that is the same for every macroblock of
/// a picture, looked up once rather than each time it is used.
pub(crate) struct Syntax {
    address: Decoder<'static>,
    macroblock_type: Decoder<'static>,
    pattern: Decoder<'static>,
    motion: Decoder<'static>,
    dmvector: Decoder<'static>,
    scan: &'static [usize; 64],
    /// Table B.14 for the blocks that are not intra.
    coefficients: WideDecoder<'static>,
    /// Table B.14 or, with `intra_vlc_format`, B.15, for intra blocks.
    intra_coefficients: WideDecoder<'static>,
    dc_luma: Decoder<'static>,
    dc_chroma: Decoder<'static>,
}

impl Syntax {
    pub(crate) fn new(pic: &Picture) -> Self {
        Self {
            address: V_MB_ADDR.decoder(),
            macroblock_type: match pic.header.picture_coding_type {
                PictureType::I => V_MB_TYPE_I.decoder(),
                PictureType::P => V_MB_TYPE_P.decoder(),
                _ => V_MB_TYPE_B.decoder(),
            },
            pattern: V_CBP.decoder(),
            motion: V_MOTION.decoder(),
            dmvector: V_DMV.decoder(),
            scan: if pic.coding.alternate_scan {
                &ALTERNATE_SCAN
            } else {
                &ZIGZAG_SCAN
            },
            coefficients: V_COEFF0.wide(),
            intra_coefficients: if pic.coding.intra_vlc_format == 1 {
                V_COEFF1_INTRA.wide()
            } else {
                V_COEFF0_INTRA.wide()
            },
            dc_luma: V_DC_LUMA.decoder(),
            dc_chroma: V_DC_CHROMA.decoder(),
        }
    }
}

/// `frame_motion_type` / `field_motion_type` values (Tables 6-17, 6-18).
pub mod motion_type {
    pub const NONE: i32 = 0;
    pub const FIELD: i32 = 1;
    /// Frame-based in frame pictures; 16x8 MC in field pictures.
    pub const FRAME_OR_16X8: i32 = 2;
    pub const DUAL_PRIME: i32 = 3;
}

/// The header of one macroblock: everything that decides how it is
/// predicted. Its coefficients are read block by block after it.
#[derive(Clone)]
pub struct Macroblock {
    /// Macroblock address within the picture, in raster order.
    pub address: usize,
    /// True for macroblocks covered by `macroblock_address_increment` but not coded.
    pub skipped: bool,
    /// Bit set of [`mb_flag`].
    pub flags: i32,
    pub quantiser_scale_code: u32,
    /// `frame_motion_type` or `field_motion_type`; 0 when the macroblock has no motion.
    pub motion_type: i32,
    /// 0 = frame DCT, 1 = field DCT.
    pub dct_type: u32,
    /// `coded_block_pattern`; for intra macroblocks all blocks are coded.
    pub cbp: i32,
    /// Reconstructed motion vectors in half-pel units, indexed
    /// `[r * 4 + s * 2 + t]` with r the vector index, s = 0 forward / 1
    /// backward, t = 0 horizontal / 1 vertical.
    pub mv: [i32; 8],
    /// Dual-prime differential vector, whose two components are each -1, 0,
    /// or +1 (H.262 7.6.3.6).
    pub dmvector: [i32; 2],
    /// `motion_vertical_field_select`, indexed `[r * 2 + s]`.
    pub field_select: [u8; 4],
    /// How many of the two vector slots are in use.
    pub mv_count: usize,
}

impl Macroblock {
    /// Whether block `index` (0 to 3 luma, 4 Cb, 5 Cr) is coded.
    #[inline]
    pub fn is_coded(&self, index: usize) -> bool {
        self.cbp & (1 << (5 - index)) != 0
    }

    #[inline]
    pub fn is_intra(&self) -> bool {
        self.flags & mb_flag::INTRA != 0
    }

    /// A macroblock with no motion and no coded blocks.
    pub fn empty(address: usize, quantiser_scale_code: u32) -> Self {
        Self {
            address,
            skipped: false,
            flags: 0,
            quantiser_scale_code,
            motion_type: motion_type::NONE,
            dct_type: 0,
            cbp: 0,
            mv: [0; 8],
            dmvector: [0; 2],
            field_select: [0; 4],
            mv_count: 1,
        }
    }
}

/// Per-slice decoder state that persists across macroblocks.
pub(crate) struct SliceState {
    quantiser_scale_code: u32,
    /// DC predictors for Y, Cb, Cr.
    dc_pred: [i32; 3],
    /// Value the DC predictors reset to, from `intra_dc_precision`.
    dc_pred_reset: i32,
    /// Motion vector predictors, same indexing as [`Macroblock::mv`].
    pmv: [i32; 8],
    /// Previous macroblock's direction flags, which skipped B macroblocks reuse.
    prev_flags: Option<i32>,
}

impl SliceState {
    pub(crate) fn new(pic: &Picture, slice: &Slice) -> Self {
        // DC predictors reset to the midpoint for the picture's DC precision.
        let dc_pred_reset = 1 << (7 + pic.coding.intra_dc_precision);
        Self {
            quantiser_scale_code: slice.quantiser_scale_code,
            dc_pred: [dc_pred_reset; 3],
            dc_pred_reset,
            pmv: [0; 8],
            prev_flags: None,
        }
    }

    /// Note a coded macroblock whose blocks have all been read.
    pub(crate) fn finish(&mut self, mb: &Macroblock) {
        if !mb.is_intra() {
            // Non-intra macroblocks reset the DC predictors (clause 7.2.1).
            self.dc_pred = [self.dc_pred_reset; 3];
        }
        self.prev_flags = Some(mb.flags);
    }
}

fn signed_dc_differential(r: &mut BitReader<'_>, size: u32) -> i32 {
    if size == 0 {
        return 0;
    }
    let v = r.u(size) as i32;
    // A leading zero means the value is negative; sign-extend from `size` bits.
    if v & (1 << (size - 1)) != 0 {
        v
    } else {
        v - (1 << size) + 1
    }
}

/// Derived from the motion type: how many vectors, in which format, and whether
/// a dmvector follows (Tables 6-17 and 6-18).
struct MotionSpec {
    count: usize,
    field_format: bool,
    dmv: bool,
}

fn motion_spec(picture_structure: PictureStructure, motion: i32) -> MotionSpec {
    let frame = picture_structure == PictureStructure::Frame;
    if motion == motion_type::DUAL_PRIME {
        return MotionSpec {
            count: 1,
            field_format: true,
            dmv: true,
        };
    }
    if frame {
        // Frame picture: 1 = two field vectors, 2 = one frame vector.
        return if motion == motion_type::FIELD {
            MotionSpec {
                count: 2,
                field_format: true,
                dmv: false,
            }
        } else {
            MotionSpec {
                count: 1,
                field_format: false,
                dmv: false,
            }
        };
    }
    // Field picture: 1 = one field vector, 2 = 16x8 (two vectors).
    if motion == motion_type::FIELD {
        MotionSpec {
            count: 1,
            field_format: true,
            dmv: false,
        }
    } else {
        MotionSpec {
            count: 2,
            field_format: true,
            dmv: false,
        }
    }
}

/// Decode one motion vector component and update its predictor (clause 7.6.3.1).
/// `f_code` selects the residual width and the wrap-around range.
///
/// `field_vertical_in_frame` is true for the vertical component of a field
/// motion vector in a frame picture. Such a vector counts in field lines while
/// the predictor is kept in frame lines, so the predictor is halved on the way
/// in and doubled on the way out.
fn decode_motion_component(
    r: &mut BitReader<'_>,
    motion: &Decoder<'_>,
    f_code: u32,
    pmv: &mut [i32; 8],
    pmv_index: usize,
    field_vertical_in_frame: bool,
) -> Result<i32> {
    let code = motion.decode(r)?;
    let r_size = f_code.saturating_sub(1);
    let f = 1i32 << r_size;
    let delta = if f == 1 || code == 0 {
        code
    } else {
        let residual = r.u(r_size) as i32;
        let magnitude = (code.abs() - 1) * f + residual + 1;
        if code < 0 {
            -magnitude
        } else {
            magnitude
        }
    };
    let high = 16 * f - 1;
    let low = -16 * f;
    let range = 32 * f;
    // DIV is division rounding toward minus infinity, which an arithmetic shift
    // gives directly.
    let prediction = if field_vertical_in_frame {
        pmv[pmv_index] >> 1
    } else {
        pmv[pmv_index]
    };
    let mut vector = prediction + delta;
    if vector < low {
        vector += range;
    } else if vector > high {
        vector -= range;
    }
    pmv[pmv_index] = if field_vertical_in_frame {
        vector * 2
    } else {
        vector
    };
    Ok(vector)
}

fn mirror_single_vector_predictors(pmv: &mut [i32; 8], forward: bool, backward: bool) {
    if forward {
        pmv[4] = pmv[0];
        pmv[5] = pmv[1];
    }
    if backward {
        pmv[6] = pmv[2];
        pmv[7] = pmv[3];
    }
}

/// Decode the block layer: run/level pairs, dequantised with `dq` as they
/// come, into `block`. On failure the coefficients read so far are in `block`
/// all the same, for the caller to clear.
///
/// The reader is worked on as a copy and handed back whole: with it in
/// registers, a coefficient costs no loads and stores beyond the value it
/// writes.
pub(crate) fn decode_block(
    r: &mut BitReader<'_>,
    syntax: &Syntax,
    state: &mut SliceState,
    block_index: usize,
    intra: bool,
    dq: &Dequantiser<'_>,
    block: &mut Block,
) -> Result<()> {
    let mut bits = r.snapshot();
    let mut stored = Stored::default();
    let values = &mut block.values;
    let result = if intra {
        block_levels::<true>(
            &mut bits,
            syntax,
            state,
            block_index,
            dq,
            values,
            &mut stored,
        )
    } else {
        block_levels::<false>(
            &mut bits,
            syntax,
            state,
            block_index,
            dq,
            values,
            &mut stored,
        )
    };
    *r = bits;
    block.seal(stored.positions, stored.parity);
    result
}

/// Which raster positions of a block have been stored and what their values
/// XOR to, which is all [`Block::seal`] needs of them.
#[derive(Default)]
struct Stored {
    positions: u64,
    parity: i32,
}

impl Stored {
    /// Store the dequantised `value` of raster position `p`, which no earlier
    /// call named.
    #[inline(always)]
    fn put(&mut self, values: &mut [i32; 64], p: usize, value: i32) {
        values[p] = value;
        self.positions |= 1 << p;
        self.parity ^= value;
    }
}

#[inline(always)]
fn block_levels<const INTRA: bool>(
    r: &mut BitReader<'_>,
    syntax: &Syntax,
    state: &mut SliceState,
    block_index: usize,
    dq: &Dequantiser<'_>,
    values: &mut [i32; 64],
    stored: &mut Stored,
) -> Result<()> {
    let scan = syntax.scan;
    let table = if INTRA {
        syntax.intra_coefficients
    } else {
        syntax.coefficients
    };
    let mut n: usize;

    if INTRA {
        let is_luma = block_index < 4;
        let size = if is_luma {
            syntax.dc_luma.decode(r)?
        } else {
            syntax.dc_chroma.decode(r)?
        } as u32;
        let component = if is_luma { 0 } else { block_index - 3 }; // 0 = Y, 1 = Cb, 2 = Cr
        state.dc_pred[component] += signed_dc_differential(r, size);
        // A predictor that has drifted out of sixteen bits, which only a
        // damaged stream can make it do, wraps.
        let level = state.dc_pred[component] as i16 as i32;
        stored.put(values, 0, dq.intra_dc(level));
        n = 1;
    } else {
        // The first coefficient of a non-intra block uses the one-bit code '1'
        // for (run 0, level 1); Table B.14's '11' form applies only from the
        // second coefficient onwards.
        if r.peek(1) == 1 {
            r.skip(1);
            let factor = if r.flag() { -3 } else { 3 };
            stored.put(values, scan[0] & 63, dq.weigh(scan[0] & 63, factor));
            n = 1;
        } else {
            n = 0;
        }
    }

    loop {
        // The longest code is 17 bits with its sign, and an escape is
        // followed by 18 more: one top-up covers a whole coefficient.
        r.ensure(35);
        let entry = table.entry(r.window());
        let len = entry & 31;
        if len == 0 {
            return Err(table.invalid(r.window(), r.bit_pos()));
        }
        r.consume(len);
        let sym = (entry as i32) >> 5;
        let (run, factor) = if sym >= 0 {
            (
                (sym >> COEFFICIENT_RUN_SHIFT) as usize,
                (sym & ((1 << COEFFICIENT_RUN_SHIFT) - 1)) - COEFFICIENT_FACTOR_BIAS,
            )
        } else if sym == EOB {
            return Ok(());
        } else {
            let escape = r.window();
            r.consume(18);
            let run = (escape >> 58) as usize;
            let raw = ((escape >> 46) & 0xfff) as i32;
            let level = if raw >= 2048 { raw - 4096 } else { raw };
            (run, level * 2 + if INTRA { 0 } else { level.signum() })
        };
        n += run;
        if n > 63 {
            bail!("coefficient index {n} out of range at bit {}", r.bit_pos());
        }
        // Every entry of a scan table is a position of the block; the mask
        // says so where the two stores below would otherwise check it.
        let p = scan[n] & 63;
        stored.put(values, p, dq.weigh(p, factor));
        n += 1;
    }
}

/// The `macroblock_address_increment` that opens the next macroblock of a
/// slice, or `None` where the slice ends.
///
/// Clause 6.2.4: macroblocks continue until 23 zero bits appear at the
/// current position. decode_or_zero_stuffing folds that check into the first
/// address VLC lookup, avoiding two reads from every normal boundary.
pub(crate) fn address_increment(r: &mut BitReader<'_>, syntax: &Syntax) -> Result<Option<i32>> {
    let Some(mut sym) = syntax.address.decode_or_zero_stuffing(r)? else {
        return Ok(None);
    };
    let mut increment = 0i32;
    loop {
        if sym == MB_ADDR_ESCAPE {
            increment += 33;
            sym = syntax.address.decode(r)?;
            continue;
        }
        increment += sym;
        break;
    }
    Ok(Some(increment))
}

/// A skipped macroblock. In P pictures it is a zero-vector copy and resets the
/// predictors; in B pictures it repeats the previous macroblock's prediction, so
/// the predictors carry over untouched (clause 7.6.6).
pub(crate) fn skipped_macroblock(
    state: &mut SliceState,
    address: usize,
    picture_type: PictureType,
    frame_picture: bool,
) -> Macroblock {
    let mut skipped = Macroblock::empty(address, state.quantiser_scale_code);
    skipped.skipped = true;

    if picture_type == PictureType::P {
        state.pmv.fill(0);
    } else if let Some(prev_flags) = state.prev_flags {
        skipped.flags = prev_flags & (mb_flag::MOTION_FORWARD | mb_flag::MOTION_BACKWARD);
        if frame_picture {
            // H.262 7.6.6.4: a skipped B macroblock in a frame picture is always
            // frame-based. Its direction comes from the previous macroblock,
            // while its vectors come directly from the corresponding PMV[0]
            // predictors.
            skipped.motion_type = motion_type::FRAME_OR_16X8;
            for direction in 0..2 {
                let direction_flag = if direction == 0 {
                    mb_flag::MOTION_FORWARD
                } else {
                    mb_flag::MOTION_BACKWARD
                };
                if skipped.flags & direction_flag == 0 {
                    continue;
                }
                let base = direction * 2;
                skipped.mv[base] = state.pmv[base];
                skipped.mv[base + 1] = state.pmv[base + 1];
            }
        } else {
            // Field pictures use same-parity field prediction (7.6.6.3). Keep
            // the decoded predictor values here.
            skipped.motion_type = motion_type::FIELD;
            skipped.mv[..4].copy_from_slice(&state.pmv[..4]);
        }
    }
    // A skipped macroblock has no coded blocks, so the DC predictors reset.
    state.dc_pred = [state.dc_pred_reset; 3];
    skipped
}

/// The macroblock layer up to its blocks.
pub(crate) fn macroblock_header(
    r: &mut BitReader<'_>,
    pic: &Picture,
    syntax: &Syntax,
    state: &mut SliceState,
    address: usize,
    frame: bool,
) -> Result<Macroblock> {
    let picture_type = pic.header.picture_coding_type;
    let flags = syntax.macroblock_type.decode(r)?;
    let intra = flags & mb_flag::INTRA != 0;
    let has_motion = flags & (mb_flag::MOTION_FORWARD | mb_flag::MOTION_BACKWARD) != 0;
    let conceal = pic.coding.concealment_motion_vectors;

    let mut motion = motion_type::NONE;
    if has_motion || (intra && conceal) {
        motion = if frame {
            // Not transmitted when frame_pred_frame_dct is set: inferred as
            // frame-based.
            if pic.coding.frame_pred_frame_dct {
                motion_type::FRAME_OR_16X8
            } else {
                r.u(2) as i32
            }
        } else {
            r.u(2) as i32
        };
    }

    let mut dct_type = 0;
    if frame && !pic.coding.frame_pred_frame_dct && (intra || flags & mb_flag::PATTERN != 0) {
        dct_type = r.u(1);
    }

    if flags & mb_flag::QUANT != 0 {
        state.quantiser_scale_code = r.u(5);
    }

    let mut mv = [0i32; 8];
    let mut dmvector = [0i32; 2];
    let mut field_select = [0u8; 4];
    let mut mv_count = 1usize;

    // Intra macroblocks reset the predictors unless they carry concealment vectors.
    if intra && !conceal {
        state.pmv.fill(0);
    }
    // A P macroblock with no forward vector predicts from zero (clause 7.6.3.4).
    if picture_type == PictureType::P && flags & mb_flag::MOTION_FORWARD == 0 && !intra {
        state.pmv.fill(0);
    }

    let read_forward = flags & mb_flag::MOTION_FORWARD != 0 || (intra && conceal);
    let read_backward = flags & mb_flag::MOTION_BACKWARD != 0;
    for s in 0..2 {
        if (s == 0 && !read_forward) || (s == 1 && !read_backward) {
            continue;
        }
        let spec = motion_spec(pic.coding.picture_structure, motion);
        mv_count = spec.count;
        let f_code_h = pic.coding.f_code[s][0];
        let f_code_v = pic.coding.f_code[s][1];
        for vec in 0..spec.count {
            // motion_vertical_field_select is sent for both vectors when there
            // are two, and for a lone field-format vector unless it is dual-prime.
            if spec.count == 2 || (spec.field_format && !spec.dmv) {
                field_select[vec * 2 + s] = r.u(1) as u8;
            }
            let base = vec * 4 + s * 2;
            let field_vertical_in_frame = spec.field_format && frame;
            mv[base] =
                decode_motion_component(r, &syntax.motion, f_code_h, &mut state.pmv, base, false)?;
            if spec.dmv {
                dmvector[0] = syntax.dmvector.decode(r)?;
            }
            mv[base + 1] = decode_motion_component(
                r,
                &syntax.motion,
                f_code_v,
                &mut state.pmv,
                base + 1,
                field_vertical_in_frame,
            )?;
            if spec.dmv {
                dmvector[1] = syntax.dmvector.decode(r)?;
            }
        }
    }
    if intra && conceal {
        r.skip(1); // marker_bit
    }

    if motion_spec(pic.coding.picture_structure, motion).count == 1 {
        // H.262 Table 7-23: every one-vector mode updates both r predictors.
        // This includes frame motion in a frame picture and field motion in a
        // field picture. Without the latter copy, a following 16x8 macroblock
        // reconstructs its second vector from stale PMV[1] state.
        mirror_single_vector_predictors(&mut state.pmv, read_forward, read_backward);
    }

    let mut cbp = 0;
    if flags & mb_flag::PATTERN != 0 {
        cbp = syntax.pattern.decode(r)?;
    }

    let mut mb = Macroblock::empty(address, state.quantiser_scale_code);
    mb.flags = flags;
    mb.motion_type = motion;
    mb.dct_type = dct_type;
    mb.cbp = if intra { 0x3f } else { cbp };
    mb.mv = mv;
    mb.dmvector = dmvector;
    mb.field_select = field_select;
    mb.mv_count = mv_count;
    Ok(mb)
}

#[cfg(test)]
mod tests {
    use super::mirror_single_vector_predictors;

    #[test]
    fn one_vector_motion_updates_both_r_predictors() {
        let mut pmv = [11, -12, 21, -22, 99, 99, 99, 99];
        mirror_single_vector_predictors(&mut pmv, true, true);
        assert_eq!(pmv, [11, -12, 21, -22, 11, -12, 21, -22]);
    }
}
