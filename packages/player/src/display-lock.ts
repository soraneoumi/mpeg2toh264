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
 * The speed has three parts. The rate match is what the pictures' count
 * demands: whole steps per measured refresh, or the speed asked for. The
 * correction takes back the deinterlacer's `avDifference` (the sound's lead
 * over the picture shown, averaged over a second) over `AV_RECOVERY_SECONDS`:
 * rounding, a start that did not fall on a refresh. The drift is what the
 * lead keeps asking for after that -- the output device's clock running
 * faster or slower than `performance.now()`, a few hundredths of a percent --
 * learnt from the lead as it stays, so that none is left standing. With the
 * correction it takes back a change of the drift critically damped.
 *
 * The device's rate is learnt from the lead rather than taken from the sound
 * clock's fit of the context's time: in a context's first second or two its
 * time can run ahead (Edge: by up to 0.7 %), which a fit takes for a faster
 * device for tens of seconds, and a start falls in that time. The lead is
 * what is heard against what is shown.
 *
 * Only a difference past a refresh and 20 ms -- a stall -- is taken back on
 * the pictures' side, by the deinterlacer moving its count. The pitch moves
 * by as little as the speed, which no one hears.
 */

/** How far the screen may be from whole picture steps a refresh for the pictures to be counted in them. */
const MAX_DEVIATION = 0.005;
/** Time in which the sound's lead over the pictures is taken back, in seconds. */
const AV_RECOVERY_SECONDS = 5;
/**
 * How fast the drift follows the lead, per second squared: a quarter of the
 * square of the correction's rate, which damps the two critically.
 */
const DRIFT_GAIN = 1 / (4 * AV_RECOVERY_SECONDS * AV_RECOVERY_SECONDS);
/** The furthest the output device's clock is taken to be from `performance.now()`'s. */
const MAX_DRIFT = 0.001;
/** The furthest the correction moves the speed. */
const MAX_CORRECTION = 0.002;
/** The furthest the speed is ever moved from the one asked for: the match, the correction and the drift. */
const MAX_ADJUST = MAX_DEVIATION + MAX_CORRECTION + MAX_DRIFT;
/** Refreshes the refresh period is averaged over. */
const PERIOD_WINDOW = 240;
/** How often a new speed goes to the worklet, at most, in ms. */
const SEND_INTERVAL_MS = 250;
/** The smallest change of speed worth sending. */
const SEND_STEP = 2e-6;

export interface DisplayLockInput {
  /** The time of this animation frame's refresh, on `performance.now()`'s clock. */
  now: number;
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
  /** How much faster than asked the sound plays at adjust 1, as learnt from the lead. */
  #drift: number;

  /** `drift` is what an earlier lock on the same output device learnt. */
  constructor(send: (adjust: number) => void, drift = 0) {
    this.#send = send;
    this.#drift = drift;
  }

  /** How much faster than asked the output device plays, as learnt so far. */
  get drift(): number {
    return this.#drift;
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
    // What the pictures' count moves by, against the speed asked for: whole
    // steps a refresh, or whole refreshes a step, where the screen is close
    // enough to that.
    const steps = (rate * period) / (step * 1000);
    const whole = steps >= 1 ? Math.round(steps) : 1 / Math.round(1 / steps);
    const match =
      Math.abs(steps / whole - 1) <= MAX_DEVIATION
        ? (whole * step * 1000) / (period * rate)
        : 1;
    const lead = input.avDifference;
    let correction = 0;
    if (Number.isFinite(lead)) {
      correction = Math.min(
        MAX_CORRECTION,
        Math.max(-MAX_CORRECTION, lead / AV_RECOVERY_SECONDS),
      );
      // A refresh's worth, so that refreshes the page missed add nothing.
      this.#drift = Math.min(
        MAX_DRIFT,
        Math.max(-MAX_DRIFT, this.#drift + (DRIFT_GAIN * lead * period) / 1000),
      );
    }
    const adjust = Math.min(
      1 + MAX_ADJUST,
      Math.max(1 - MAX_ADJUST, match * (1 - correction - this.#drift)),
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
