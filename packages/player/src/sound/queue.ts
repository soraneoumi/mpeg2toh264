/**
 * The PCM waiting to be played, with the media time of every frame.
 *
 * Frames are numbered from the start of the epoch: the source index. Chunks
 * are kept as the arrays the Worker transferred and read from in place. The
 * mapping from source index to media time is a list of segments, each linear
 * at its own sample rate; a new segment starts where the media timeline jumps
 * forward by more than `MAX_GAP` or the sample rate changes.
 *
 * Everything that grows (the chunk ring and the segment list) grows only in
 * `push`, which runs in the message handler, so reading in `process()` never
 * allocates.
 */

import { copyFrames, type FrameSource } from "./resample.js";

/** A forward gap up to this long is filled with silence; a longer one is a jump. */
const MAX_GAP = 1;

export class PcmQueue implements FrameSource {
  // The chunk ring. A silence entry has `null` channels.
  #left: (Float32Array | null)[] = new Array(256).fill(null);
  #right: (Float32Array | null)[] = new Array(256).fill(null);
  #offset = new Int32Array(256);
  #length = new Int32Array(256);
  #head = 0;
  #count = 0;

  // The segments: source index where each starts, its media time there, its rate.
  #segIndex = new Float64Array(16);
  #segMedia = new Float64Array(16);
  #segRate = new Float64Array(16);
  #segFirst = 0;
  #segCount = 0;

  #readIndex = 0;
  #writeIndex = 0;
  #endMedia = 0;
  #ended = false;
  /** The sample rate the reader is set up for; 0 before `use`. */
  #using = 0;

  /** Source index of the next frame `pull` returns. */
  get readIndex(): number {
    return this.#readIndex;
  }

  /** Source index one past the last queued frame. */
  get writeIndex(): number {
    return this.#writeIndex;
  }

  /** Media time at which the queued PCM ends. */
  get queuedUntil(): number {
    return this.#endMedia;
  }

  /** `end` came: nothing more will be pushed until the next `reset`. */
  get ended(): boolean {
    return this.#ended;
  }

  /** The sample rate at the read position; 0 before the first chunk. */
  get rate(): number {
    return this.#segCount === 0 ? 0 : this.#rateOf(this.#readIndex);
  }

  /**
   * The reader works at `rate` from the read position on (see `boundary`).
   * Called when the stages behind the queue are set up for a sample rate.
   */
  use(rate: number): void {
    this.#using = rate;
  }

  /**
   * Source index of the first frame from the read position on that is queued
   * at a sample rate other than the one in `use`, or Infinity. Reading stops
   * there; the reader has to be set up for the new rate first.
   */
  get boundary(): number {
    for (let i = 0; i < this.#segCount; i++) {
      const s = this.#slot(i);
      const end =
        i + 1 < this.#segCount ? this.#segIndex[this.#slot(i + 1)]! : Infinity;
      if (end > this.#readIndex && this.#segRate[s] !== this.#using)
        return Math.max(this.#segIndex[s]!, this.#readIndex);
    }
    return Infinity;
  }

  /**
   * Frames that can be read as PCM now. Beyond them `pull` gives silence;
   * whether that silence is the end of the sound or a wait for more PCM is
   * `drains`.
   */
  get available(): number {
    return Math.min(this.#writeIndex, this.boundary) - this.#readIndex;
  }

  /**
   * Whether the frames after `available` are final silence for the current
   * sample rate: the input ended, or a rate change follows.
   */
  get drains(): boolean {
    return this.#ended || this.boundary !== Infinity;
  }

  /** Drop everything and start an epoch whose first frame is due at media time `at`. */
  reset(at: number): void {
    for (let i = 0; i < this.#count; i++) {
      const s = (this.#head + i) % this.#left.length;
      this.#left[s] = null;
      this.#right[s] = null;
    }
    this.#head = 0;
    this.#count = 0;
    this.#segFirst = 0;
    this.#segCount = 0;
    this.#readIndex = 0;
    this.#writeIndex = 0;
    this.#endMedia = at;
    this.#ended = false;
    this.#using = 0;
  }

  /** No more chunks this epoch. */
  end(): void {
    this.#ended = true;
  }

  /**
   * Queue a chunk whose first frame has media time `start`.
   *
   * A chunk that starts within one frame of where the queue ends continues
   * it: timestamps derived from 90 kHz PTS are off by up to half a tick (about
   * half a frame at 48 kHz) each, and taking that as a gap or an overlap would
   * insert or drop a frame at every chunk. Beyond that, a gap up to `MAX_GAP`
   * is filled with silence, a longer one starts a new segment (the timeline
   * jumps), and frames before the queue's end are dropped.
   */
  push(
    start: number,
    rate: number,
    left: Float32Array,
    right: Float32Array,
  ): void {
    if (this.#ended) return;
    let offset = 0;
    const length = left.length;
    const delta = (start - this.#endMedia) * rate;
    const newRate = this.#segCount === 0 || this.#lastRate() !== rate;
    if (delta <= -1) {
      offset = Math.round(-delta);
      if (offset >= length) return;
    }
    if (delta >= 1 && start - this.#endMedia > MAX_GAP) {
      this.#addSegment(this.#writeIndex, start, rate);
    } else {
      if (newRate) this.#addSegment(this.#writeIndex, this.#endMedia, rate);
      if (delta >= 1) this.#append(null, null, 0, Math.round(delta));
    }
    this.#append(left, right, offset, length - offset);
  }

  /**
   * Copy `count` frames into `left`/`right` from `at`, and advance. Frames past
   * `available` are silence and do not advance the read position, so PCM
   * queued later (or at the next rate) is still read from the right place.
   */
  pull(
    left: Float32Array,
    right: Float32Array,
    at: number,
    count: number,
  ): void {
    const real = Math.min(count, Math.max(0, this.available));
    let done = 0;
    while (done < real) {
      const s = this.#head;
      const n = Math.min(real - done, this.#length[s]!);
      const l = this.#left[s]!;
      const r = this.#right[s]!;
      const o = this.#offset[s]!;
      if (l === null || r === null) {
        left.fill(0, at + done, at + done + n);
        right.fill(0, at + done, at + done + n);
      } else {
        copyFrames(left, at + done, l, o, n);
        copyFrames(right, at + done, r, o, n);
      }
      this.#consume(n);
      done += n;
    }
    left.fill(0, at + done, at + count);
    right.fill(0, at + done, at + count);
  }

  /** Advance past `count` frames without reading them, as far as `available`. */
  skip(count: number): void {
    let left = Math.min(count, Math.max(0, this.available));
    while (left > 0) {
      const n = Math.min(left, this.#length[this.#head]!);
      this.#consume(n);
      left -= n;
    }
  }

  /** Media time of source index `index`, which may be fractional. */
  media(index: number): number {
    const s = this.#segmentOf(index);
    if (s < 0) return this.#endMedia;
    return (
      this.#segMedia[s]! + (index - this.#segIndex[s]!) / this.#segRate[s]!
    );
  }

  /** Media seconds per source frame at `index`. */
  slope(index: number): number {
    const s = this.#segmentOf(index);
    return s < 0 ? 0 : 1 / this.#segRate[s]!;
  }

  /** Forget the media mapping of source indices before `index`. */
  forgetBefore(index: number): void {
    while (this.#segCount > 1 && this.#segIndex[this.#slot(1)]! <= index) {
      this.#segFirst = (this.#segFirst + 1) % this.#segIndex.length;
      this.#segCount--;
    }
  }

  #slot(i: number): number {
    return (this.#segFirst + i) % this.#segIndex.length;
  }

  #segmentOf(index: number): number {
    let found = -1;
    for (let i = 0; i < this.#segCount; i++) {
      const s = this.#slot(i);
      if (this.#segIndex[s]! > index) break;
      found = s;
    }
    // Before the first segment (the resampler's history): extend it backwards.
    return found < 0 && this.#segCount > 0 ? this.#slot(0) : found;
  }

  #rateOf(index: number): number {
    return this.#segRate[this.#segmentOf(index)]!;
  }

  #lastRate(): number {
    return this.#segRate[this.#slot(this.#segCount - 1)]!;
  }

  #addSegment(index: number, media: number, rate: number): void {
    if (this.#segCount > 0) {
      const last = this.#slot(this.#segCount - 1);
      if (this.#segIndex[last] === index) {
        // Nothing was queued in the previous segment: replace it.
        this.#segMedia[last] = media;
        this.#segRate[last] = rate;
        this.#endMedia = media;
        return;
      }
    }
    if (this.#segCount === this.#segIndex.length) {
      const grow = (a: Float64Array): Float64Array<ArrayBuffer> => {
        const b = new Float64Array(a.length * 2);
        for (let i = 0; i < this.#segCount; i++)
          b[i] = a[(this.#segFirst + i) % a.length]!;
        return b;
      };
      this.#segIndex = grow(this.#segIndex);
      this.#segMedia = grow(this.#segMedia);
      this.#segRate = grow(this.#segRate);
      this.#segFirst = 0;
    }
    const s = this.#slot(this.#segCount++);
    this.#segIndex[s] = index;
    this.#segMedia[s] = media;
    this.#segRate[s] = rate;
    this.#endMedia = media;
  }

  #append(
    left: Float32Array | null,
    right: Float32Array | null,
    offset: number,
    length: number,
  ): void {
    if (length <= 0) return;
    if (this.#count === this.#left.length) {
      const size = this.#left.length * 2;
      const order = (i: number) => (this.#head + i) % this.#left.length;
      const l: (Float32Array | null)[] = new Array(size).fill(null);
      const r: (Float32Array | null)[] = new Array(size).fill(null);
      const o = new Int32Array(size);
      const n = new Int32Array(size);
      for (let i = 0; i < this.#count; i++) {
        l[i] = this.#left[order(i)]!;
        r[i] = this.#right[order(i)]!;
        o[i] = this.#offset[order(i)]!;
        n[i] = this.#length[order(i)]!;
      }
      this.#left = l;
      this.#right = r;
      this.#offset = o;
      this.#length = n;
      this.#head = 0;
    }
    const s = (this.#head + this.#count++) % this.#left.length;
    this.#left[s] = left;
    this.#right[s] = right;
    this.#offset[s] = offset;
    this.#length[s] = length;
    this.#writeIndex += length;
    this.#endMedia += length / this.#segRate[this.#slot(this.#segCount - 1)]!;
  }

  #consume(n: number): void {
    const s = this.#head;
    this.#offset[s]! += n;
    this.#length[s]! -= n;
    this.#readIndex += n;
    if (this.#length[s] === 0) {
      this.#left[s] = null;
      this.#right[s] = null;
      this.#head = (s + 1) % this.#left.length;
      this.#count--;
    }
  }
}
