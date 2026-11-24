/**
 * A streaming band-limited resampler whose ratio may change every block.
 *
 * Each output frame is a Kaiser-windowed sinc interpolation of the input at a
 * fractional input position. The kernel is tabulated at `PHASES` fractional
 * offsets and interpolated linearly between neighbouring rows, which keeps the
 * position error second order: at 512 phases it sits far below the stopband.
 *
 * The kernel is designed per pair of rates for a passband flat to 20 kHz
 * (or 0.458 of the lower rate when that is below 44 kHz) and a stopband
 * where an image or alias would fold back into that passband at the most
 * extreme `adjust`. When the two rates are equal the cutoff is put exactly at
 * the input Nyquist frequency instead: a sinc cut there is zero at every
 * other integer, so the phase-0 row is an exact unit impulse and an integer
 * position reproduces the input bit for bit. That case has a stopband edge of
 * 28 kHz at 48 kHz, which is where the image of a 20 kHz tone lands.
 */

export interface FrameSource {
  /** Write `count` frames into `left`/`right` from `at`. */
  pull(
    left: Float32Array,
    right: Float32Array,
    at: number,
    count: number,
  ): void;
}

/**
 * Copy `count` frames of `source` from `from` into `target` at `at`.
 *
 * A loop rather than `target.set(source.subarray(…))`: `subarray` makes a new
 * view object on every call, and this runs on the audio thread every quantum,
 * where a collection pause is a dropout.
 */
export function copyFrames(
  target: Float32Array,
  at: number,
  source: Float32Array,
  from: number,
  count: number,
): void {
  for (let n = 0; n < count; n++) target[at + n] = source[from + n]!;
}

/** The widest fine-speed factor the kernel is designed for. */
export const MAX_ADJUST = 1.01;
/** Stopband attenuation the kernel is designed for, in dB. */
const ATTENUATION = 110;
const PHASES = 512;
/** Most the position may be nudged per frame to get back onto the input grid. */
const SETTLE = 2e-4;
const CAPACITY = 8192;

interface Kernel {
  taps: number;
  /** Row `phase` holds the taps for fractional offset `phase / PHASES`. */
  base: Float32Array;
  /** `base[phase + 1] - base[phase]`, for the linear interpolation. */
  diff: Float32Array;
}

const kernels = new Map<string, Kernel>();

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 200; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

/** The kernel for resampling `input` Hz to `output` Hz, built once per pair. */
export function kernelFor(input: number, output: number): Kernel {
  const key = `${input}:${output}`;
  const cached = kernels.get(key);
  if (cached) return cached;
  let cutoff: number;
  let transition: number;
  if (input === output) {
    const pass = Math.min(20000, input * 0.4167);
    cutoff = input / 2;
    transition = 2 * (cutoff - pass);
  } else {
    const low = Math.min(input, output / MAX_ADJUST);
    const pass = Math.min(20000, low * 0.4583);
    cutoff = low / 2;
    transition = low - 2 * pass;
  }
  // Kaiser's estimate of the length for this attenuation and transition.
  const beta = 0.1102 * (ATTENUATION - 8.7);
  const estimate =
    (ATTENUATION - 7.95) / (2.285 * 2 * Math.PI * (transition / input)) + 1;
  const taps = Math.ceil(estimate / 2) * 2;
  const half = taps / 2;
  const scale = (2 * cutoff) / input;
  const nyquist = input === output;
  const i0beta = besselI0(beta);
  const rows = PHASES + 1;
  const base = new Float32Array(rows * taps);
  for (let phase = 0; phase < rows; phase++) {
    const frac = phase / PHASES;
    for (let k = 0; k < taps; k++) {
      // Tap k multiplies input frame floor(p) - half + 1 + k.
      const t = k - half + 1 - frac;
      let sinc: number;
      if (t === 0) sinc = 1;
      else if (nyquist && Number.isInteger(t)) sinc = 0;
      else sinc = Math.sin(Math.PI * scale * t) / (Math.PI * scale * t);
      const r = t / half;
      const window =
        r * r >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - r * r)) / i0beta;
      base[phase * taps + k] = scale * sinc * window;
    }
  }
  const diff = new Float32Array(PHASES * taps);
  for (let i = 0; i < diff.length; i++) diff[i] = base[i + taps]! - base[i]!;
  const kernel = { taps, base, diff };
  kernels.set(key, kernel);
  return kernel;
}

export class Resampler {
  #kernel: Kernel = kernelFor(48000, 48000);
  #bypassable = true;
  #left = new Float32Array(CAPACITY);
  #right = new Float32Array(CAPACITY);
  /** Input index of `#left[0]`. */
  #bufStart = 0;
  /** Input index one past the last frame held. */
  #bufEnd = 0;
  /** Input index (fractional) of the next output frame. */
  #position = 0;

  /** Use the kernel for `input` Hz to `output` Hz and start over at input index 0. */
  configure(input: number, output: number): void {
    this.#kernel = kernelFor(input, output);
    this.#bypassable = input === output;
    this.reset();
  }

  /** Start over at input index 0, with silence before it. */
  reset(): void {
    const history = this.#kernel.taps / 2 - 1;
    this.#left.fill(0, 0, history);
    this.#right.fill(0, 0, history);
    this.#bufStart = -history;
    this.#bufEnd = 0;
    this.#position = 0;
  }

  /** Input index of the next output frame. */
  get position(): number {
    return this.#position;
  }

  /** Kernel length in input frames. */
  get taps(): number {
    return this.#kernel.taps;
  }

  /**
   * The step to use for a block of `count` frames when the wanted step is
   * `step`. A step of exactly 1 between equal rates is the bypass, which
   * needs the position on the input grid; after an `adjust` left it between
   * two frames, the step is nudged by at most `SETTLE` until it is back.
   */
  settle(step: number, count: number): number {
    if (step !== 1 || !this.#bypassable) return step;
    const off = Math.round(this.#position) - this.#position;
    if (off === 0) return 1;
    const per = off / count;
    return 1 + Math.max(-SETTLE, Math.min(SETTLE, per));
  }

  /** Input frames to `fill` before `run(…, count, step)`. */
  need(count: number, step: number): number {
    const last = Math.floor(this.#position + (count - 1) * step);
    return Math.max(0, last + this.#kernel.taps / 2 + 1 - this.#bufEnd);
  }

  /** Append `count` input frames from `source`. */
  fill(source: FrameSource, count: number): void {
    if (count <= 0) return;
    if (this.#bufEnd - this.#bufStart + count > CAPACITY) {
      const keep = Math.floor(this.#position) - this.#kernel.taps / 2 + 1;
      const from = keep - this.#bufStart;
      this.#left.copyWithin(0, from, this.#bufEnd - this.#bufStart);
      this.#right.copyWithin(0, from, this.#bufEnd - this.#bufStart);
      this.#bufStart = keep;
    }
    source.pull(this.#left, this.#right, this.#bufEnd - this.#bufStart, count);
    this.#bufEnd += count;
  }

  /**
   * Write `count` frames to `left`/`right` from `at`, the input position
   * advancing by `step` per frame. The input must be there (`need`).
   */
  run(
    left: Float32Array,
    right: Float32Array,
    at: number,
    count: number,
    step: number,
  ): void {
    const start = this.#position;
    const inL = this.#left;
    const inR = this.#right;
    if (step === 1 && this.#bypassable && Number.isInteger(start)) {
      const from = start - this.#bufStart;
      copyFrames(left, at, inL, from, count);
      copyFrames(right, at, inR, from, count);
      this.#position = start + count;
      return;
    }
    const { taps, base, diff } = this.#kernel;
    const offset = 1 - taps / 2 - this.#bufStart;
    for (let j = 0; j < count; j++) {
      const p = start + j * step;
      const i = Math.floor(p);
      const u = (p - i) * PHASES;
      const phase = Math.floor(u);
      const a = u - phase;
      const row = phase * taps;
      const x = i + offset;
      let sl = 0;
      let sr = 0;
      for (let k = 0; k < taps; k++) {
        const c = base[row + k]! + a * diff[row + k]!;
        sl += c * inL[x + k]!;
        sr += c * inR[x + k]!;
      }
      left[at + j] = sl;
      right[at + j] = sr;
    }
    const end = start + count * step;
    // A settling block aims at an integer; land on it exactly.
    const nearest = Math.round(end);
    this.#position =
      this.#bypassable && Math.abs(end - nearest) < 1e-9 ? nearest : end;
  }
}
