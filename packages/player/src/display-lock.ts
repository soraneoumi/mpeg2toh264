/**
 * Decode mode's lock of the media clock to the display.
 *
 * Pictures change on a grid of fixed steps -- a field of interlaced video, a
 * frame of progressive -- and the screen on another, its refresh. When the
 * two run at nearly the same rate (59.94 fields a second on a 59.95 Hz
 * screen) or one at a whole multiple of the other, the picture due at each
 * refresh moves through the grid slowly, and while a refresh falls near a
 * step the smallest wobble of the clock decides between two pictures: one is
 * shown twice and its neighbour not at all. Over minutes that happens again
 * and again, however good the clock is, because the two rates are not the
 * same.
 *
 * So the media clock is made to follow the screen: the sound is played a
 * fraction of a percent faster or slower (`adjust`, which the AudioWorklet
 * applies by resampling) so that every refresh moves the media by exactly a
 * whole number of steps, and a slow correction holds each refresh in the
 * middle of its step, where no wobble reaches a neighbour. This is what a
 * player that syncs to the display does; the pitch moves by as little as the
 * speed, which no one hears.
 *
 * Only at the normal speed, while playing, and only where the grid is within
 * `MAX_DEVIATION` of a whole number of refreshes. Anything else plays at the
 * sound's own rate.
 */

/** How far the grid may be from a whole number of refreshes and still be locked to it. */
const MAX_DEVIATION = 0.005;
/** The furthest the speed is ever moved from the sound's own. */
const MAX_ADJUST = 0.005;
/** Refreshes the refresh period is averaged over. */
const PERIOD_WINDOW = 240;
/** Time constant of the phase error's smoothing, in seconds. */
const PHASE_SMOOTHING = 1;
/** Time in which a phase error is corrected, in seconds. */
const PHASE_CORRECTION = 4;
/** How often a new speed goes to the worklet, at most, in ms. */
const SEND_INTERVAL_MS = 250;
/** The smallest change of speed worth sending. */
const SEND_STEP = 2e-6;

export interface DisplayLockInput {
  /** The time of this animation frame's refresh, on `performance.now()`'s clock. */
  now: number;
  /** The media time heard at wall time `wall`, or NaN while not known. */
  at: (wall: number) => number;
  /** Media seconds per wall second at the speed last sent. */
  speed: number;
  /** The picture grid's step in seconds, or null while there is none to lock to. */
  step: number | null;
  /** A media time on the grid: where some picture began. */
  origin: number;
  /** Whether locking applies now: playing, at the normal speed. */
  active: boolean;
}

export class DisplayLock {
  readonly #send: (adjust: number) => void;
  /** Recent refresh times, to average the period over. */
  readonly #frames: number[] = [];
  #adjust = 1;
  #sentAt = Number.NEGATIVE_INFINITY;
  /** The smoothed phase error, in grid steps, or NaN before a measurement. */
  #error = Number.NaN;
  #lastNow = Number.NaN;

  constructor(send: (adjust: number) => void) {
    this.#send = send;
  }

  /** The speed factor last sent. */
  get adjust(): number {
    return this.#adjust;
  }

  /** The smoothed phase error in grid steps; 0 is a refresh in the middle of its step. */
  get error(): number {
    return this.#error;
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

  /** Take one animation frame. */
  frame(input: DisplayLockInput): void {
    const { now } = input;
    const elapsed = now - this.#lastNow;
    this.#lastNow = now;
    this.#frames.push(now);
    if (this.#frames.length > PERIOD_WINDOW) this.#frames.shift();
    const period = this.period;
    const step = input.step;
    if (!input.active || step === null || Number.isNaN(period)) {
      this.#release(now);
      return;
    }
    // Whole refreshes per step, and how far from that the two rates are.
    const per = Math.round((step * 1000) / period);
    if (
      per < 1 ||
      Math.abs((step * 1000) / (per * period) - 1) > MAX_DEVIATION
    ) {
      this.#release(now);
      return;
    }
    // What the screen shows next: the media heard at the next refresh.
    const media = input.at(now + period);
    if (Number.isNaN(media)) return;
    const position = (media - input.origin) / step;
    // Where in its step the refresh falls, against the middle: -0.5 to 0.5.
    const error = position - Math.floor(position) - 0.5;
    if (Number.isNaN(this.#error) || !(elapsed > 0) || elapsed > 200)
      this.#error = error;
    else {
      // The error wraps at the step's ends; follow it the short way round.
      let delta = error - this.#error;
      delta -= Math.round(delta);
      this.#error += delta * Math.min(1, elapsed / 1000 / PHASE_SMOOTHING);
      this.#error -= Math.round(this.#error);
    }
    // Exactly `per` refreshes a step, less what moves the refresh back to the
    // middle of its step within PHASE_CORRECTION.
    const target =
      (step * 1000) / (per * period) - (this.#error * step) / PHASE_CORRECTION;
    const base = input.speed / this.#adjust;
    if (!(base > 0)) return;
    const adjust = Math.min(
      1 + MAX_ADJUST,
      Math.max(1 - MAX_ADJUST, target / base),
    );
    this.#offer(now, adjust);
  }

  /** Forget the phase: a seek, a pause, a change of speed. */
  reset(): void {
    this.#error = Number.NaN;
  }

  #release(now: number): void {
    this.#error = Number.NaN;
    this.#offer(now, 1);
  }

  #offer(now: number, adjust: number): void {
    if (Math.abs(adjust - this.#adjust) < SEND_STEP) return;
    // Back to the sound's own rate at once; changes while locked at most so often.
    if (adjust !== 1 && now - this.#sentAt < SEND_INTERVAL_MS) return;
    this.#adjust = adjust;
    this.#sentAt = now;
    this.#send(adjust);
  }
}
