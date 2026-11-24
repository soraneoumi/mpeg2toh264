/**
 * A streaming, pitch-preserving time stretch (WSOLA).
 *
 * The output is built from Hann-windowed frames of `FRAME` seconds, one every
 * `HOP` = FRAME/2 of output, so two frames overlap everywhere and their windows
 * sum to one. Frame k nominally starts at source position τ_k, which advances
 * by HOP × rate per frame. The frame actually taken starts within ±`SEARCH` of
 * τ_k, where its first half best matches the natural continuation of the
 * previous frame (the source right after the previous frame's first half), so
 * the overlap-add joins waveforms that agree. Both channels use the same frame
 * position and the match is scored on both, so the stereo image stays intact.
 *
 * The search is coarse-to-fine: normalised cross-correlation of the overlap
 * on a 4:1 box-decimated copy over the whole range, then at full rate around
 * the three best coarse peaks.
 *
 * Rate 1 is a bypass that copies the source. Entering the stretch from it
 * starts with a frame that is exactly the source at the current position, so
 * the first overlap is a HOP-long crossfade from the bypassed signal; leaving
 * it continues the last frame's source exactly, which is the sound the next
 * frame would have joined. Neither switch can click.
 *
 * Output position → source position. Frame centres are pinned to the nominal
 * line: the output between the centres of frames k-1 and k maps linearly from
 * τ_{k-1} + HOP to τ_k + HOP, which is the timeline a linear speed change would
 * give. The sound at a frame centre is from τ_k + δ_k with |δ_k| ≤ SEARCH; in
 * between, the frame with the larger window weight is at most
 * SEARCH + |1 − rate| × HOP/2 from the nominal line (the frame plays its
 * content at the original speed while the line moves at `rate`). On entering
 * the bypass the line jumps by the last δ (≤ SEARCH) onto the true position,
 * where it then stays exact.
 */
import { copyFrames, type FrameSource } from "./resample.js";

/** Frame length in seconds. */
const FRAME = 0.04;
/** Largest offset from the nominal position a frame may take, in seconds. */
export const SEARCH = 0.01;
const DECIMATE = 4;
const PEAKS = 3;
/** Source frames held; enough for rate 4 at 96 kHz. */
const CAPACITY = 1 << 16;
const MAX_RATE = 96000;
const MAX_HOP = Math.round((FRAME / 2) * MAX_RATE);
const MAX_SEARCH = Math.round(SEARCH * MAX_RATE);
const SEGMENTS = 64;

export class Stretcher implements FrameSource {
  readonly #source: FrameSource;
  #hop = 0;
  #frame = 0;
  #search = 0;
  #window = new Float32Array(2 * MAX_HOP);

  #rate = 1;

  // Source frames [#srcStart, #srcEnd), by source index.
  #srcL = new Float32Array(CAPACITY);
  #srcR = new Float32Array(CAPACITY);
  #srcStart = 0;
  #srcEnd = 0;

  #bypass = true;
  /** Bypass: source index of the next output frame. */
  #cursor = 0;
  /** Stretch: source index where the last frame starts, and its nominal start. */
  #lastX = 0;
  #tau = 0;
  /** The last frame's second half, windowed, waiting for the next frame. */
  #pendL = new Float32Array(MAX_HOP);
  #pendR = new Float32Array(MAX_HOP);
  /** Finished output not yet pulled: [#readyPos, #readyEnd). */
  #readyL = new Float32Array(MAX_HOP);
  #readyR = new Float32Array(MAX_HOP);
  #readyPos = 0;
  #readyEnd = 0;
  /** Output index one past the last finished frame. */
  #produced = 0;

  // Output index → nominal source position, as a list of linear segments.
  #segStart = new Float64Array(SEGMENTS);
  #segSource = new Float64Array(SEGMENTS);
  #segSlope = new Float64Array(SEGMENTS);
  #segFirst = 0;
  #segCount = 0;

  // Scratch for the search.
  #refL = new Float32Array(MAX_HOP);
  #refR = new Float32Array(MAX_HOP);
  #coarseRefL = new Float32Array(MAX_HOP / DECIMATE + 1);
  #coarseRefR = new Float32Array(MAX_HOP / DECIMATE + 1);
  #coarseL = new Float32Array((2 * MAX_SEARCH + MAX_HOP) / DECIMATE + 2);
  #coarseR = new Float32Array((2 * MAX_SEARCH + MAX_HOP) / DECIMATE + 2);
  #coarseScore = new Float64Array((2 * MAX_SEARCH) / DECIMATE + 2);
  #peaks = new Int32Array(PEAKS);

  constructor(source: FrameSource) {
    this.#source = source;
    this.configure(48000);
  }

  /** Size the frames for `sampleRate` and start over at source index 0. */
  configure(sampleRate: number): void {
    this.#hop = Math.round((FRAME / 2) * sampleRate);
    this.#frame = 2 * this.#hop;
    this.#search = Math.round(SEARCH * sampleRate);
    for (let n = 0; n < this.#frame; n++)
      this.#window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / this.#frame);
    this.reset(0);
  }

  /** Start over: the next output frame is source index `start`, with silence before it. */
  reset(start: number): void {
    const history = this.#frame + this.#search;
    this.#srcL.fill(0, 0, history);
    this.#srcR.fill(0, 0, history);
    this.#srcStart = start - history;
    this.#srcEnd = start;
    this.#bypass = true;
    this.#cursor = start;
    this.#readyPos = 0;
    this.#readyEnd = 0;
    this.#produced = 0;
    this.#segFirst = 0;
    this.#segCount = 0;
    this.#addSegment(0, start, 1);
  }

  /** Playback speed. It takes effect at the next frame; 1 is the bypass. */
  set rate(rate: number) {
    this.#rate = rate;
  }

  get rate(): number {
    return this.#rate;
  }

  /** Frames of the current search range on either side, at the configured rate. */
  get searchFrames(): number {
    return this.#search;
  }

  /** Output frames between frame starts (HOP), at the configured rate. */
  get hopFrames(): number {
    return this.#hop;
  }

  /** Source frames to make available before `pull`ing `count` more output frames. */
  need(count: number): number {
    const rest = count - (this.#readyEnd - this.#readyPos);
    if (rest <= 0) return 0;
    const hop = this.#hop;
    if (this.#rate === 1) {
      const cursor = this.#bypass ? this.#cursor : this.#lastX + hop;
      return Math.max(0, cursor + rest - this.#srcEnd);
    }
    const tau = this.#bypass ? this.#cursor - hop : this.#tau;
    const frames = Math.ceil(rest / hop);
    // One more than exact: τ is accumulated per frame in `#produce`.
    const last = Math.round(tau + frames * hop * this.#rate) + 1;
    return Math.max(0, last + this.#search + this.#frame - this.#srcEnd);
  }

  pull(
    left: Float32Array,
    right: Float32Array,
    at: number,
    count: number,
  ): void {
    let done = 0;
    while (done < count) {
      if (this.#readyPos === this.#readyEnd) {
        if (this.#rate === 1 && !this.#bypass) this.#enterBypass();
        if (this.#bypass && this.#rate === 1) {
          const n = count - done;
          this.#ensure(this.#cursor + n);
          const from = this.#cursor - this.#srcStart;
          copyFrames(left, at + done, this.#srcL, from, n);
          copyFrames(right, at + done, this.#srcR, from, n);
          this.#cursor += n;
          this.#produced += n;
          return;
        }
        if (this.#bypass) this.#leaveBypass();
        this.#produce();
      }
      const n = Math.min(count - done, this.#readyEnd - this.#readyPos);
      const p = this.#readyPos;
      copyFrames(left, at + done, this.#readyL, p, n);
      copyFrames(right, at + done, this.#readyR, p, n);
      this.#readyPos += n;
      done += n;
    }
  }

  /** Nominal source position of output index `index`. */
  sourceOf(index: number): number {
    const s = this.#segmentOf(index);
    return (
      this.#segSource[s]! + (index - this.#segStart[s]!) * this.#segSlope[s]!
    );
  }

  /** Source frames per output frame at output index `index`. */
  slopeOf(index: number): number {
    return this.#segSlope[this.#segmentOf(index)]!;
  }

  /** Forget the mapping of output indices before `index`. */
  forgetBefore(index: number): void {
    while (
      this.#segCount > 1 &&
      this.#segStart[(this.#segFirst + 1) % SEGMENTS]! <= index
    ) {
      this.#segFirst = (this.#segFirst + 1) % SEGMENTS;
      this.#segCount--;
    }
  }

  /**
   * The lowest source index still needed: the bypass cursor, or the next
   * frame's natural continuation and the bottom of its search range.
   */
  #low(): number {
    const hop = this.#hop;
    if (this.#bypass) return this.#cursor - hop - this.#search;
    return Math.min(this.#lastX + hop, Math.floor(this.#tau) - this.#search);
  }

  /** Read source up to index `end` (exclusive). */
  #ensure(end: number): void {
    const count = end - this.#srcEnd;
    if (count <= 0) return;
    if (this.#srcEnd + count - this.#srcStart > CAPACITY) {
      const keep = this.#low() - 1;
      const from = keep - this.#srcStart;
      const held = this.#srcEnd - this.#srcStart;
      this.#srcL.copyWithin(0, from, held);
      this.#srcR.copyWithin(0, from, held);
      this.#srcStart = keep;
    }
    this.#source.pull(
      this.#srcL,
      this.#srcR,
      this.#srcEnd - this.#srcStart,
      count,
    );
    this.#srcEnd = end;
  }

  /** Start stretching with a frame that is exactly the source at the cursor. */
  #leaveBypass(): void {
    const hop = this.#hop;
    const p0 = this.#cursor;
    this.#ensure(p0 + hop);
    const from = p0 - this.#srcStart;
    const w = this.#window;
    for (let n = 0; n < hop; n++) {
      this.#pendL[n] = w[hop + n]! * this.#srcL[from + n]!;
      this.#pendR[n] = w[hop + n]! * this.#srcR[from + n]!;
    }
    this.#lastX = p0 - hop;
    this.#tau = p0 - hop;
    this.#bypass = false;
  }

  /**
   * Back to the bypass after the last frame's first half was output: its
   * second half plus a frame that continues it exactly is the source itself.
   */
  #enterBypass(): void {
    this.#cursor = this.#lastX + this.#hop;
    this.#bypass = true;
    this.#addSegment(this.#produced, this.#cursor, 1);
  }

  /** Place the next frame and output the overlap it completes. */
  #produce(): void {
    const hop = this.#hop;
    const frame = this.#frame;
    const tau = this.#tau + hop * this.#rate;
    const nominal = Math.round(tau);
    this.#ensure(nominal + this.#search + frame);
    const x = this.#match(this.#lastX + hop, nominal);
    const from = x - this.#srcStart;
    const w = this.#window;
    const sl = this.#srcL;
    const sr = this.#srcR;
    for (let n = 0; n < hop; n++) {
      this.#readyL[n] = this.#pendL[n]! + w[n]! * sl[from + n]!;
      this.#readyR[n] = this.#pendR[n]! + w[n]! * sr[from + n]!;
      this.#pendL[n] = w[hop + n]! * sl[from + hop + n]!;
      this.#pendR[n] = w[hop + n]! * sr[from + hop + n]!;
    }
    this.#addSegment(this.#produced, this.#tau + hop, this.#rate);
    this.#tau = tau;
    this.#lastX = x;
    this.#readyPos = 0;
    this.#readyEnd = hop;
    this.#produced += hop;
  }

  /**
   * The start in [nominal - search, nominal + search] whose first HOP frames
   * best match the source at `continuation`.
   */
  #match(continuation: number, nominal: number): number {
    const hop = this.#hop;
    const search = this.#search;
    const sl = this.#srcL;
    const sr = this.#srcR;
    const base = this.#srcStart;
    const refL = this.#refL;
    const refR = this.#refR;
    const c = continuation - base;
    for (let n = 0; n < hop; n++) {
      refL[n] = sl[c + n]!;
      refR[n] = sr[c + n]!;
    }

    // Coarse: every DECIMATE-th lag on a box-decimated copy.
    const lo = nominal - search - base;
    const refLength = Math.floor(hop / DECIMATE);
    const spanLength = Math.floor((2 * search + hop) / DECIMATE);
    const crL = this.#coarseRefL;
    const crR = this.#coarseRefR;
    const cL = this.#coarseL;
    const cR = this.#coarseR;
    for (let n = 0; n < refLength; n++) {
      let a = 0;
      let b = 0;
      for (let i = 0; i < DECIMATE; i++) {
        a += refL[n * DECIMATE + i]!;
        b += refR[n * DECIMATE + i]!;
      }
      crL[n] = a;
      crR[n] = b;
    }
    for (let n = 0; n < spanLength; n++) {
      let a = 0;
      let b = 0;
      const o = lo + n * DECIMATE;
      for (let i = 0; i < DECIMATE; i++) {
        a += sl[o + i]!;
        b += sr[o + i]!;
      }
      cL[n] = a;
      cR[n] = b;
    }
    const lags = Math.floor((2 * search) / DECIMATE) + 1;
    const score = this.#coarseScore;
    let energy = 0;
    for (let n = 0; n < refLength; n++)
      energy += cL[n]! * cL[n]! + cR[n]! * cR[n]!;
    const floor = 1e-12 * refLength;
    for (let j = 0; j < lags; j++) {
      let s = 0;
      for (let n = 0; n < refLength; n++)
        s += crL[n]! * cL[j + n]! + crR[n]! * cR[j + n]!;
      score[j] = s / Math.sqrt(energy + floor);
      const out = j;
      const into = j + refLength;
      energy += cL[into]! * cL[into]! + cR[into]! * cR[into]!;
      energy -= cL[out]! * cL[out]! + cR[out]! * cR[out]!;
    }
    const peaks = this.#peaks;
    peaks.fill(-1);
    for (let j = 0; j < lags; j++) {
      const v = score[j]!;
      if (j > 0 && score[j - 1]! > v) continue;
      if (j < lags - 1 && score[j + 1]! >= v) continue;
      for (let k = 0; k < PEAKS; k++) {
        const p = peaks[k]!;
        if (p < 0 || score[p]! < v) {
          for (let m = PEAKS - 1; m > k; m--) peaks[m] = peaks[m - 1]!;
          peaks[k] = j;
          break;
        }
      }
    }

    // Fine: every lag around the coarse peaks, against the nominal start.
    let best = nominal;
    let bestScore = this.#score(nominal);
    for (let k = 0; k < PEAKS; k++) {
      const p = peaks[k]!;
      if (p < 0) break;
      const centre = nominal - search + p * DECIMATE;
      const from = Math.max(nominal - search, centre - DECIMATE + 1);
      const to = Math.min(nominal + search, centre + DECIMATE - 1);
      for (let x = from; x <= to; x++) {
        const s = this.#score(x);
        if (s > bestScore) {
          bestScore = s;
          best = x;
        }
      }
    }
    return best;
  }

  /** Normalised correlation of the HOP frames at source index `x` with the reference. */
  #score(x: number): number {
    const hop = this.#hop;
    const o = x - this.#srcStart;
    const sl = this.#srcL;
    const sr = this.#srcR;
    const refL = this.#refL;
    const refR = this.#refR;
    let s = 0;
    let e = 1e-12 * hop;
    for (let n = 0; n < hop; n++) {
      const l = sl[o + n]!;
      const r = sr[o + n]!;
      s += refL[n]! * l + refR[n]! * r;
      e += l * l + r * r;
    }
    return s / Math.sqrt(e);
  }

  #segmentOf(index: number): number {
    let found = this.#segFirst;
    for (let i = 1; i < this.#segCount; i++) {
      const s = (this.#segFirst + i) % SEGMENTS;
      if (this.#segStart[s]! > index) break;
      found = s;
    }
    return found;
  }

  #addSegment(start: number, source: number, slope: number): void {
    if (this.#segCount > 0) {
      const last = (this.#segFirst + this.#segCount - 1) % SEGMENTS;
      const predicted =
        this.#segSource[last]! +
        (start - this.#segStart[last]!) * this.#segSlope[last]!;
      if (this.#segSlope[last] === slope && Math.abs(predicted - source) < 1e-6)
        return;
      if (this.#segStart[last] === start) {
        this.#segSource[last] = source;
        this.#segSlope[last] = slope;
        return;
      }
    }
    if (this.#segCount === SEGMENTS) {
      // The processor forgets segments behind its output, so this is a run of
      // more speed changes than the ring holds within one pipeline delay;
      // the oldest mapping is the one least likely to be asked for.
      this.#segFirst = (this.#segFirst + 1) % SEGMENTS;
      this.#segCount--;
    }
    const s = (this.#segFirst + this.#segCount++) % SEGMENTS;
    this.#segStart[s] = start;
    this.#segSource[s] = source;
    this.#segSlope[s] = slope;
  }
}
