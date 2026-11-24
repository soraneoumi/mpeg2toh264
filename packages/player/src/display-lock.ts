/**
 * Decode mode's hold of the sound to the pictures on the screen.
 *
 * The deinterlacer shows decoded pictures against a count of refreshes, as
 * mpv's display sync does: where the screen runs close to a whole number of
 * picture steps a refresh (59.94 fields a second on a 59.95 Hz screen, or
 * twice that at double speed) or of refreshes a step (half speed), every
 * refresh moves the pictures by exactly whole steps, so none is shown twice
 * or passed over; elsewhere it moves them by the refresh. Either way the
 * pictures keep the screen's time, not the sound's, and this class makes the
 * sound follow: it plays the sound a fraction of a percent faster or slower
 * (`adjust`, which the AudioWorklet applies by resampling).
 *
 * The speed has two parts. The rate match is what the pictures' count
 * demands -- whole steps per measured refresh, or the speed asked for --
 * against the sound's own rate, which the device clock's drift from
 * `performance.now()` is part of. The drift correction takes back what is
 * left, the deinterlacer's `avDifference` (the sound's lead over the picture
 * shown, averaged over a second), over `AV_RECOVERY_SECONDS`: rounding, a
 * start that did not fall on a refresh, the clock's settling. Only a
 * difference past a refresh and 20 ms -- a stall -- is taken back on the
 * pictures' side, by the deinterlacer moving its count. The pitch moves by
 * as little as the speed, which no one hears.
 */

/** How far the screen may be from whole picture steps a refresh for the pictures to be counted in them. */
const MAX_DEVIATION = 0.005;
/** Time in which the sound's lead over the pictures is taken back, in seconds. */
const AV_RECOVERY_SECONDS = 10;
/** The furthest the drift correction moves the speed. */
const MAX_CORRECTION = 0.002;
/** The furthest the speed is ever moved from the sound's own: the match, the correction and the device's drift. */
const MAX_ADJUST = MAX_DEVIATION + MAX_CORRECTION + 0.001;
/** Refreshes the refresh period is averaged over. */
const PERIOD_WINDOW = 240;
/** How often a new speed goes to the worklet, at most, in ms. */
const SEND_INTERVAL_MS = 250;
/** The smallest change of speed worth sending. */
const SEND_STEP = 2e-6;

export interface DisplayLockInput {
  /** The time of this animation frame's refresh, on `performance.now()`'s clock. */
  now: number;
  /** Media seconds per wall second at the speed last sent; 0 while the sound is not playing. */
  speed: number;
  /** The step the pictures change on in seconds, or null while there is none. */
  step: number | null;
  /** The playback speed asked for. */
  rate: number;
  /** Whether the sound plays now. */
  active: boolean;
  /** The deinterlacer's `avDifference` in seconds, or NaN while not known. */
  avDifference: number;
}

export class DisplayLock {
  readonly #send: (adjust: number) => void;
  /** Recent refresh times, to average the period over. */
  readonly #frames: number[] = [];
  #adjust = 1;
  #sentAt = Number.NEGATIVE_INFINITY;

  constructor(send: (adjust: number) => void) {
    this.#send = send;
  }

  /** The speed factor last sent. */
  get adjust(): number {
    return this.#adjust;
  }

  /** The refresh period, in ms, or NaN until enough refreshes were seen. */
  get period(): number {
    const frames = this.#frames;
    if (frames.length < 30) return Number.NaN;
    // Refreshes the page missed leave gaps of whole periods: count them as
    // the periods they were.
    const span = frames.at(-1)! - frames[0]!;
    const deltas = frames.slice(1).map((time, index) => time - frames[index]!);
    const median = [...deltas].sort((a, b) => a - b)[deltas.length >> 1]!;
    let periods = 0;
    for (const delta of deltas)
      periods += Math.max(1, Math.round(delta / median));
    return span / periods;
  }

  /**
   * The first refresh at or after `wall` on the grid of those seen, as an
   * animation frame's time; NaN while the period is not known.
   */
  refreshAfter(wall: number): number {
    const period = this.period;
    const last = this.#frames.at(-1);
    if (Number.isNaN(period) || last === undefined) return Number.NaN;
    return last + Math.max(0, Math.ceil((wall - last) / period)) * period;
  }

  /** Take one animation frame. */
  frame(input: DisplayLockInput): void {
    const { now, rate, step } = input;
    this.#frames.push(now);
    if (this.#frames.length > PERIOD_WINDOW) this.#frames.shift();
    const period = this.period;
    if (step === null || Number.isNaN(period)) {
      this.#offer(now, 1);
      return;
    }
    // Paused or waiting: the rates are the same when it plays again, so the
    // speed that matched them stays.
    if (!input.active) return;
    // The sound's own speed, media seconds per wall second at adjust 1.
    const base = input.speed / this.#adjust;
    if (!(base > 0)) return;
    // What the pictures' count moves by: whole steps a refresh, or whole
    // refreshes a step, where the screen is close enough to that.
    const steps = (rate * period) / (step * 1000);
    const whole = steps >= 1 ? Math.round(steps) : 1 / Math.round(1 / steps);
    const pictures =
      Math.abs(steps / whole - 1) <= MAX_DEVIATION
        ? (whole * step * 1000) / period
        : rate;
    const lead = input.avDifference;
    const correction = Number.isFinite(lead)
      ? Math.min(
          MAX_CORRECTION,
          Math.max(-MAX_CORRECTION, lead / AV_RECOVERY_SECONDS),
        )
      : 0;
    const adjust = Math.min(
      1 + MAX_ADJUST,
      Math.max(1 - MAX_ADJUST, (pictures * (1 - correction)) / base),
    );
    this.#offer(now, adjust);
  }

  #offer(now: number, adjust: number): void {
    if (Math.abs(adjust - this.#adjust) < SEND_STEP) return;
    // Back to the sound's own rate at once; changes while playing at most so often.
    if (adjust !== 1 && now - this.#sentAt < SEND_INTERVAL_MS) return;
    this.#adjust = adjust;
    this.#sentAt = now;
    this.#send(adjust);
  }
}
