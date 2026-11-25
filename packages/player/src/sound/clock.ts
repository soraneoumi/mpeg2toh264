/**
 * The page's view of the sound output: which media time is being heard at a
 * given `performance.now()`, from the processor's `position` reports and
 * readings of the context clock.
 *
 * Context frame → wall time. `AudioContext.currentTime` counts what has been
 * rendered, and rendering runs in bursts of several quanta per device
 * callback: plotted against `performance.now()` it is a staircase above the
 * line the speaker follows. The readings taken just before a burst are the
 * least ahead of the speaker, so the mapping follows the lower envelope of
 * the readings. Each `BLOCK` of readings contributes its lowest one, and a
 * Kalman filter tracks the line through these block minima: its state is
 * the context time on the line now and the line's slope, which is the
 * device clock's rate against `performance.now()` (they differ by a few
 * hundredths of a percent). The slope's uncertainty starts at `DRIFT_PRIOR`
 * and shrinks as minima come in, so the start settles in about a second
 * while the slope is in the end averaged over tens of seconds; the small
 * process noise (`OFFSET_WANDER`, `DRIFT_WANDER`) lets both follow slow
 * changes. A block minimum far from the prediction is left out (the
 * innovation gate).
 *
 * A minimum per block rather than the lower convex hull of all readings: the
 * hull rests on single extreme readings, so one reading slightly under the
 * line (the start of a device stand-still, a late timestamp) holds a whole
 * window down, and which readings are extreme changes in steps. Filtering
 * many block minima averages that out at the cost of sitting a fraction of
 * a callback higher, which is part of the constant below.
 *
 * `outputLatency` is added on top. How far the envelope itself is ahead of
 * the speaker is not observable from the page: it is somewhere between
 * nothing and one callback (about 10 ms), and constant while the device runs
 * the same way. That constant is the remaining ambiguity of the absolute
 * offset; what this class keeps small is the variation, which is what a
 * picture schedule notices.
 *
 * Disturbances. A main-thread stall only leaves a gap in the readings; the
 * line carries on across it. When `currentTime` has not moved for `STAND`,
 * longer than any gap between callbacks, the device is standing still and
 * the readings are left out until it moves again: they say nothing about
 * the line, and when it catches up it is back on it. (Leaving out readings
 * merely under the line instead would drop exactly the lowest readings
 * whenever the slope is still off, and the fit would never correct it.) A
 * reading more than `BELOW` under or `ABOVE` over the line is left out too,
 * and if the readings stay that far off for `RELOCK`, the device's timeline
 * really moved, and the fit starts again from the new readings.
 */
import type { SoundPosition } from "./messages.js";

/** Each block of readings this long (ms), about two animation frames, gives one measurement: its lowest. */
const BLOCK = 33;
/** Spread of block minima around the envelope, in ms. */
const MEASUREMENT = 4;
/** How far the offset may wander by itself, in ms per √s. */
const OFFSET_WANDER = 0.05;
/** How far the slope may wander, per √s. */
const DRIFT_WANDER = 2e-6;
/** Spread of the device clock's rate before any measurement. */
const DRIFT_PRIOR = 5e-4;
/** A block minimum this many standard deviations off the prediction is left out. */
const GATE = 4;
/** `currentTime` unchanged this long (ms) means the device stands still. */
const STAND = 20;
/** A reading this far under the line (ms) is off it. */
const BELOW = 30;
/** A reading this far over the line (ms) is more than any burst. */
const ABOVE = 60;
/** Off the line this long (ms) means the line moved. */
const RELOCK = 200;
const REPORTS = 32;

export class SoundClock {
  readonly #context: AudioContext;
  readonly #rate: number;

  // The block being collected: when it started and its lowest reading.
  #blockStart = 0;
  #lowResidual = Infinity;
  #lowWall = 0;
  #lowTime = 0;

  // The mapping: context seconds at wall ms w is #offset + #slope × (w − #at) / 1000.
  #locked = false;
  #at = 0;
  #offset = 0;
  #slope = 1;
  // Covariance of (offset in ms, slope).
  #poo = 0;
  #pos = 0;
  #pss = 0;
  #latency = 0;
  /** Since when the readings have been off the line, or NaN. */
  #offSince = Number.NaN;
  /** The last `currentTime` read, and the wall time it was first read. */
  #lastTime = Number.NaN;
  #movedAt = 0;

  #reports: SoundPosition[] = [];

  constructor(context: AudioContext) {
    this.#context = context;
    this.#rate = context.sampleRate;
  }

  /**
   * Feed every `position` report.
   *
   * Reports are made when the processor renders, which is ahead of the
   * speaker by the output latency and the device buffer, so a report stays
   * needed until the frame being heard has passed its successor's frame. That
   * is pruned by frame, not by count: at a speed change a report can come every
   * quantum, and with an output latency of a Bluetooth device (a few hundred
   * ms) a fixed count would drop the report for the frame still being heard.
   * While the mapping is not known, only the last `REPORTS` are kept.
   */
  report(position: SoundPosition): void {
    const reports = this.#reports;
    const last = reports.at(-1);
    if (last !== undefined && last.epoch !== position.epoch) reports.length = 0;
    reports.push(position);
    const heard = this.frameAt(performance.now());
    if (Number.isNaN(heard)) {
      if (reports.length > REPORTS) reports.shift();
      return;
    }
    let drop = 0;
    while (drop + 1 < reports.length && reports[drop + 1]!.frame <= heard)
      drop++;
    if (drop > 0) reports.splice(0, drop);
  }

  /**
   * Feed a reading of the context clock. `now` is the `performance.now()` at
   * which it is taken, which is what it defaults to; pass it only if it was
   * read immediately before.
   */
  sample(now: number = performance.now()): void {
    const context = this.#context;
    if (context.state !== "running") {
      // A suspended context's clock stands; when it runs again the mapping
      // is a new one.
      this.#unlock();
      return;
    }
    const time = context.currentTime;
    // Safari has no `outputLatency`.
    this.#latency = context.outputLatency ?? 0;
    if (time !== this.#lastTime) {
      this.#lastTime = time;
      this.#movedAt = now;
    } else if (now - this.#movedAt > STAND) return;
    if (!this.#locked) {
      this.#locked = true;
      this.#at = now;
      this.#offset = time;
      this.#slope = 1;
      // Until the first minimum, the line is anywhere within a burst.
      this.#poo = 20 * 20;
      this.#pos = 0;
      this.#pss = DRIFT_PRIOR * DRIFT_PRIOR;
      this.#blockStart = now;
      this.#lowResidual = Infinity;
    }
    const residual = (time - this.#line(now)) * 1000;
    if (residual < -BELOW || residual > ABOVE) {
      if (Number.isNaN(this.#offSince)) this.#offSince = now;
      if (now - this.#offSince >= RELOCK) {
        this.#unlock();
        this.sample(now);
      }
      return;
    }
    this.#offSince = Number.NaN;
    if (now - this.#blockStart >= BLOCK && this.#lowResidual !== Infinity) {
      this.#measure(this.#lowWall, this.#lowTime);
      this.#blockStart = now;
      this.#lowResidual = Infinity;
    }
    if (residual < this.#lowResidual) {
      this.#lowResidual = residual;
      this.#lowWall = now;
      this.#lowTime = time;
    }
  }

  /** Media time being heard at wall time `wall`, or NaN when not playing or not yet known. */
  at(wall: number): number {
    const frame = this.frameAt(wall);
    const report = this.#reportAt(frame);
    if (report === undefined) return Number.NaN;
    if (report.state === "playing")
      return (
        report.media + ((frame - report.frame) * report.speed) / this.#rate
      );
    // Starved: the sound stopped at `media` and the timeline stands there.
    if (report.state === "starved") return report.media;
    return Number.NaN;
  }

  /** The processor's state as last reported; "idle" before the first report. */
  get state(): SoundPosition["state"] | "idle" {
    return this.#reports.at(-1)?.state ?? "idle";
  }

  /** Wall time at which the device plays context frame `frame` (outputLatency included); NaN until known. */
  wallOfFrame(frame: number): number {
    if (!this.#locked) return Number.NaN;
    const time = frame / this.#rate;
    return (
      this.#at +
      ((time - this.#offset) * 1000) / this.#slope +
      this.#latency * 1000
    );
  }

  /** The context frame being heard at wall time `wall`; NaN until known. */
  frameAt(wall: number): number {
    if (!this.#locked) return Number.NaN;
    return this.#line(wall - this.#latency * 1000) * this.#rate;
  }

  /** The latest report that covers `frame`. */
  #reportAt(frame: number): SoundPosition | undefined {
    if (Number.isNaN(frame)) return undefined;
    for (let i = this.#reports.length - 1; i >= 0; i--)
      if (this.#reports[i]!.frame <= frame) return this.#reports[i];
    return undefined;
  }

  /** Context seconds on the mapping's line at wall ms `wall` (no latency). */
  #line(wall: number): number {
    return this.#offset + (this.#slope * (wall - this.#at)) / 1000;
  }

  #unlock(): void {
    this.#locked = false;
    this.#offSince = Number.NaN;
  }

  /** A Kalman step with the block minimum (`wall` ms, `time` s). */
  #measure(wall: number, time: number): void {
    // Predict to `wall`: the offset moves with the slope.
    const dt = wall - this.#at;
    const seconds = Math.abs(dt) / 1000;
    this.#offset += (this.#slope * dt) / 1000;
    this.#at = wall;
    const poo = this.#poo + 2 * dt * this.#pos + dt * dt * this.#pss;
    const pos = this.#pos + dt * this.#pss;
    this.#poo = poo + OFFSET_WANDER * OFFSET_WANDER * seconds;
    this.#pos = pos;
    this.#pss += DRIFT_WANDER * DRIFT_WANDER * seconds;
    // Update with the minimum, in ms.
    const innovation = (time - this.#offset) * 1000;
    const spread = this.#poo + MEASUREMENT * MEASUREMENT;
    if (Math.abs(innovation) > GATE * Math.sqrt(spread)) return;
    const ko = this.#poo / spread;
    const ks = this.#pos / spread;
    this.#offset += (ko * innovation) / 1000;
    this.#slope += ks * innovation;
    this.#pss -= ks * this.#pos;
    this.#pos -= ko * this.#pos;
    this.#poo -= ko * this.#poo;
  }
}
