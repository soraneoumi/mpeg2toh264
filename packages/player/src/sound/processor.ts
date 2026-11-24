/**
 * The AudioWorklet processor that plays decoded PCM: queue → time stretch
 * (playback speed, pitch kept) → resampler (source rate to context rate times
 * the fine `adjust` factor) → fades and volume → output.
 *
 * States. `buffering` after an epoch until 200 ms from its start are queued
 * (or the input ended), then `ready`, or straight on to `playing` if `play`
 * already came; `play` and `pause` set what is wanted and persist across
 * epochs, like a media element's. While playing, running out of PCM fades
 * out and gives `starved` with the media time standing where the sound
 * stopped, until 100 ms are queued again. `pause` fades out to `paused`. When
 * the input ended and everything queued was played, `ended`.
 *
 * Fades are one quantum (128 frames, 2.7 ms at 48 kHz) long and sit inside
 * the quantum they belong to: the quantum that fades in is the first one
 * reported as playing, and the one that fades out is the last. Running out is
 * seen a quantum ahead, from what the stages say they need, so that last
 * quantum is still whole sound.
 *
 * Media time. Each output frame is at a fractional position of the
 * stretcher's output, which maps to a source index, which the queue maps to a
 * media time. Reports anchor that chain: a report at frame F says frame
 * F + n is at media + n × speed / sampleRate. A new report is posted whenever
 * the last one would be off by more than a hundredth of a frame at the start
 * of a quantum, and at the frame inside a quantum where the timeline jumps or
 * the speed changes, so the anchor always holds to well within a frame at
 * rate 1. At other rates the time stretch makes the reported time the
 * nominal one; see stretch.ts for how far the sound may be from it.
 *
 * Nothing in `process()` allocates: the stages work in preallocated buffers,
 * the queue plays from the transferred arrays, and the report and `consumed`
 * messages are one object each, reused (`postMessage` copies them).
 */
import {
  SOUND_PROCESSOR,
  type SoundConsumed,
  type SoundControl,
  type SoundPcmMessage,
  type SoundPosition,
  type SoundState,
} from "./messages.js";
import { PcmQueue } from "./queue.js";
import { kernelFor, MAX_ADJUST, Resampler } from "./resample.js";
import { Stretcher } from "./stretch.js";

const BUFFER_SECONDS = 0.2;
const RESUME_SECONDS = 0.1;
const REPORT_SECONDS = 0.05;
const CONSUMED_SECONDS = 0.1;
/** Seconds for the volume to move by 1. */
const VOLUME_RAMP = 0.01;
const MIN_RATE = 0.25;
const MAX_RATE = 4;
/** How far a report may drift from the true mapping, in frames. */
const TOLERANCE = 0.01;

/** A raised-cosine rise over `count` frames. */
function fadeCurve(count: number): Float32Array {
  const fade = new Float32Array(count);
  for (let j = 0; j < count; j++)
    fade[j] = 0.5 - 0.5 * Math.cos((Math.PI * (j + 0.5)) / count);
  return fade;
}

const enum Envelope {
  Flat,
  FadeIn,
  FadeOut,
}

class SoundProcessor extends AudioWorkletProcessor {
  readonly #queue = new PcmQueue();
  readonly #stretcher = new Stretcher(this.#queue);
  readonly #resampler = new Resampler();
  /** The source rate the stages are configured for; 0 until PCM came. */
  #sourceRate = 0;

  #pcm: MessagePort | null = null;
  #epoch = -1;
  #pendingEpoch: { epoch: number; at: number } | null = null;
  /** PCM port messages for an epoch the page has not announced yet. */
  #held: SoundPcmMessage[] = [];

  #state: SoundState = "buffering";
  #wantPlay = false;
  /** The context frame a start waits for, from `play`; 0 for none. */
  #startAt = 0;
  #rate = 1;
  #adjust = 1;
  #gain = 1;
  #gainTarget = 1;

  /** The fade over one quantum; render quanta are 128 frames. */
  #fade = fadeCurve(128);
  #report: SoundPosition = {
    type: "position",
    epoch: 0,
    frame: 0,
    media: 0,
    speed: 0,
    state: "buffering",
    queuedUntil: 0,
  };
  #reported = false;
  #forceReport = false;
  #consumed: SoundConsumed = { type: "consumed", epoch: 0, until: 0 };
  #consumedFrame = 0;
  #consumedIndex = -1;

  constructor() {
    super();
    this.port.onmessage = (event) => this.#control(event.data as SoundControl);
  }

  #control(message: SoundControl): void {
    switch (message.type) {
      case "pcm-port":
        this.#pcm = message.port;
        this.#pcm.onmessage = (event) =>
          this.#pcmMessage(event.data as SoundPcmMessage);
        break;
      case "epoch": {
        const latest = this.#pendingEpoch?.epoch ?? this.#epoch;
        if (!(message.epoch > latest) || !Number.isFinite(message.at))
          throw new RangeError(
            `epoch ${message.epoch} at ${message.at} after epoch ${latest}`,
          );
        this.#pendingEpoch = { epoch: message.epoch, at: message.at };
        break;
      }
      case "play":
        if (message.at !== undefined && !Number.isFinite(message.at))
          throw new RangeError(`play at frame ${message.at}`);
        this.#wantPlay = true;
        this.#startAt = message.at ?? 0;
        this.#forceReport = true;
        break;
      case "pause":
        this.#wantPlay = false;
        break;
      case "rate":
        if (!(message.rate >= MIN_RATE && message.rate <= MAX_RATE))
          throw new RangeError(
            `rate ${message.rate} outside ${MIN_RATE}..${MAX_RATE}`,
          );
        this.#rate = message.rate;
        break;
      case "adjust":
        if (Number.isNaN(message.ratio)) throw new RangeError("adjust NaN");
        this.#adjust = Math.min(
          MAX_ADJUST,
          Math.max(2 - MAX_ADJUST, message.ratio),
        );
        break;
      case "dual-mono":
        this.#queue.selectService(message.sub);
        break;
      case "volume":
        if (!(message.gain >= 0 && Number.isFinite(message.gain)))
          throw new RangeError(`volume ${message.gain}`);
        this.#gainTarget = message.gain;
        break;
    }
  }

  #pcmMessage(message: SoundPcmMessage): void {
    if (message.epoch < this.#epoch) return;
    if (message.epoch > this.#epoch) {
      this.#held.push(message);
      if (message.type === "pcm") kernelFor(message.sampleRate, sampleRate);
      return;
    }
    this.#accept(message);
  }

  #accept(message: SoundPcmMessage): void {
    if (message.type === "end") {
      this.#queue.end();
      return;
    }
    // Build the kernel here rather than in `process()`.
    kernelFor(message.sampleRate, sampleRate);
    const [left, right] = message.channels;
    this.#queue.push(
      message.start,
      message.sampleRate,
      left,
      right,
      message.dualMono,
    );
  }

  #applyEpoch(epoch: number, at: number): void {
    this.#epoch = epoch;
    this.#queue.reset(at);
    this.#sourceRate = 0;
    this.#state = "buffering";
    const held = this.#held;
    this.#held = [];
    for (const message of held) {
      if (message.epoch === epoch) this.#accept(message);
      else if (message.epoch > epoch) this.#held.push(message);
    }
    this.#consumedIndex = -1;
    this.#postConsumed(currentFrame);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]!;
    const left = out[0]!;
    // The node is made with `outputChannelCount: [2]`.
    const right = out[1]!;
    const count = left.length;
    const frame = currentFrame;
    if (count !== this.#fade.length) this.#fade = fadeCurve(count);

    const pending = this.#pendingEpoch;
    if (pending !== null) {
      // Fade out what was playing, then start the epoch from the next quantum.
      if (this.#state === "playing" && this.#sourceRate !== 0) {
        const step = this.#step(count);
        if (this.#producible(count, step))
          this.#render(left, right, count, step, Envelope.FadeOut);
        else this.#silence(left, right);
      } else this.#silence(left, right);
      this.#pendingEpoch = null;
      this.#applyEpoch(pending.epoch, pending.at);
      this.#configureIfNeeded();
      this.#post(frame + count, this.#media(), 0);
      this.#forceReport = false;
      return true;
    }
    if (this.#epoch < 0) {
      this.#silence(left, right);
      return true;
    }

    this.#configureIfNeeded();
    if (this.#sourceRate === 0) {
      this.#silence(left, right);
      this.#maybeReport(frame, this.#queue.queuedUntil, 0);
      return true;
    }
    this.#crossRateBoundary();

    this.#stretcher.rate = this.#rate;
    const step = this.#step(count);
    const queued = this.#queue.available / this.#sourceRate;
    const drains = this.#queue.drains;
    let envelope: Envelope | null = null;
    // A start asked for at a later frame waits for it, whatever the state.
    const due = frame >= this.#startAt;
    switch (this.#state) {
      case "buffering":
        if (
          (queued >= BUFFER_SECONDS || drains) &&
          this.#producible(2 * count, step)
        ) {
          if (this.#wantPlay && due) envelope = Envelope.FadeIn;
          else this.#state = "ready";
        }
        break;
      case "ready":
        if (this.#wantPlay && due && this.#producible(2 * count, step))
          envelope = Envelope.FadeIn;
        break;
      case "playing":
        // What is pulled must be queued: past `available` the queue gives
        // silence without advancing, which only the end may do.
        if (this.#finished()) this.#state = "ended";
        else if (this.#producible(2 * count, step))
          envelope = this.#wantPlay ? Envelope.Flat : Envelope.FadeOut;
        else if (this.#producible(count, step)) envelope = Envelope.FadeOut;
        else this.#state = this.#wantPlay ? "starved" : "paused";
        break;
      case "starved":
      case "paused":
        if (!this.#wantPlay) this.#state = "paused";
        else if (!due) break;
        else if (
          (queued >= RESUME_SECONDS || drains) &&
          this.#producible(2 * count, step)
        )
          envelope = Envelope.FadeIn;
        else this.#state = "starved";
        break;
      case "ended":
        break;
    }

    if (envelope === null) {
      this.#silence(left, right);
      this.#gain = this.#gainTarget;
      const media =
        this.#state === "ended" ? this.#queue.queuedUntil : this.#media();
      this.#maybeReport(frame, media, 0);
      return true;
    }

    if (envelope === Envelope.FadeIn) this.#state = "playing";
    const p0 = this.#resampler.position;
    const media = this.#media();
    const speed = this.#speedAt(p0, step);
    this.#maybeReport(frame, media, speed);
    // After the stages made this quantum's output, so its mapping exists.
    this.#render(left, right, count, step, envelope);
    this.#reportBreak(frame, count, p0, step, media, speed);
    if (envelope === Envelope.FadeOut)
      this.#state = this.#wantPlay ? "starved" : "paused";
    this.#forget();
    if (frame + count - this.#consumedFrame >= CONSUMED_SECONDS * sampleRate)
      this.#postConsumed(frame + count);
    return true;
  }

  /** The resampler step for this quantum. */
  #step(count: number): number {
    return this.#resampler.settle(
      (this.#adjust * this.#sourceRate) / sampleRate,
      count,
    );
  }

  /** Whether `count` output frames can be made from what is queued. */
  #producible(count: number, step: number): boolean {
    if (this.#queue.drains) return true;
    const stretched = this.#resampler.need(count, step);
    return this.#stretcher.need(stretched) <= this.#queue.available;
  }

  /** The input ended and the output has reached its end. */
  #finished(): boolean {
    return (
      this.#queue.ended &&
      this.#stretcher.sourceOf(this.#resampler.position) >=
        this.#queue.writeIndex
    );
  }

  #render(
    left: Float32Array,
    right: Float32Array,
    count: number,
    step: number,
    envelope: Envelope,
  ): void {
    const resampler = this.#resampler;
    resampler.fill(this.#stretcher, resampler.need(count, step));
    resampler.run(left, right, 0, count, step);
    const fade = this.#fade;
    const limit = 1 / (VOLUME_RAMP * sampleRate);
    let gain = this.#gain;
    const target = this.#gainTarget;
    for (let j = 0; j < count; j++) {
      if (gain !== target)
        gain =
          gain < target
            ? Math.min(target, gain + limit)
            : Math.max(target, gain - limit);
      let g = gain;
      if (envelope === Envelope.FadeIn) g *= fade[j]!;
      else if (envelope === Envelope.FadeOut) g *= fade[count - 1 - j]!;
      left[j]! *= g;
      right[j]! *= g;
    }
    this.#gain = gain;
  }

  #silence(left: Float32Array, right: Float32Array): void {
    left.fill(0);
    right.fill(0);
  }

  /** Set up the stages once the epoch's sample rate is known. */
  #configureIfNeeded(): void {
    const rate = this.#queue.rate;
    if (this.#sourceRate !== 0 || rate === 0) return;
    this.#configure(rate, this.#queue.readIndex);
  }

  #configure(rate: number, start: number): void {
    this.#sourceRate = rate;
    this.#queue.use(rate);
    this.#stretcher.configure(rate);
    this.#stretcher.reset(start);
    this.#resampler.configure(rate, sampleRate);
  }

  /**
   * At a change of source rate, once the output has played up to it, start
   * the stages over at the new rate from there. What the stages held past it
   * was silence (the queue stops at the boundary).
   */
  #crossRateBoundary(): void {
    const boundary = this.#queue.boundary;
    if (boundary === Infinity) return;
    if (this.#stretcher.sourceOf(this.#resampler.position) < boundary) return;
    this.#configure(this.#queue.rate, this.#queue.readIndex);
  }

  /** Media time of the next output frame. */
  #media(): number {
    if (this.#sourceRate === 0) return this.#queue.queuedUntil;
    return this.#mediaAt(this.#resampler.position);
  }

  #mediaAt(position: number): number {
    return this.#queue.media(this.#stretcher.sourceOf(position));
  }

  #speedAt(position: number, step: number): number {
    const source = this.#stretcher.sourceOf(position);
    return (
      step *
      this.#stretcher.slopeOf(position) *
      this.#queue.slope(source) *
      sampleRate
    );
  }

  /** Report at `frame` if the state changed, the last report no longer holds, or it is time. */
  #maybeReport(frame: number, media: number, speed: number): void {
    const last = this.#report;
    if (
      this.#reported &&
      !this.#forceReport &&
      last.epoch === this.#epoch &&
      last.state === this.#state &&
      last.speed === speed &&
      frame - last.frame < REPORT_SECONDS * sampleRate &&
      Math.abs(
        last.media + ((frame - last.frame) * last.speed) / sampleRate - media,
      ) <=
        (TOLERANCE * Math.max(speed, 1)) / sampleRate
    )
      return;
    this.#post(frame, media, speed);
    this.#forceReport = false;
  }

  /**
   * Report again inside this quantum if the media timeline does not run
   * linearly through it: a jump, a speed change in the stretcher, a source
   * rate segment. Finds the first frame off the line by bisection.
   */
  #reportBreak(
    frame: number,
    count: number,
    p0: number,
    step: number,
    media: number,
    speed: number,
  ): void {
    if (!this.#offLine(count - 1, p0, step, media, speed)) return;
    let lo = 0;
    let hi = count - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.#offLine(mid, p0, step, media, speed)) hi = mid;
      else lo = mid;
    }
    const p = p0 + hi * step;
    this.#post(frame + hi, this.#mediaAt(p), this.#speedAt(p, step));
  }

  /** Whether output frame `j` of the quantum is off the line its start gives. */
  #offLine(
    j: number,
    p0: number,
    step: number,
    media: number,
    speed: number,
  ): boolean {
    const tolerance = (TOLERANCE * Math.max(speed, 1)) / sampleRate;
    const linear = media + (j * speed) / sampleRate;
    return Math.abs(this.#mediaAt(p0 + j * step) - linear) > tolerance;
  }

  #post(frame: number, media: number, speed: number): void {
    const r = this.#report;
    r.epoch = this.#epoch;
    r.frame = frame;
    r.media = media;
    r.speed = speed;
    r.state = this.#state;
    r.queuedUntil = this.#queue.queuedUntil;
    this.#reported = true;
    this.port.postMessage(r);
  }

  #postConsumed(frame: number): void {
    this.#consumedFrame = frame;
    const index = this.#queue.readIndex;
    if (index === this.#consumedIndex || this.#pcm === null) return;
    this.#consumedIndex = index;
    this.#consumed.epoch = this.#epoch;
    this.#consumed.until = this.#queue.media(index);
    this.#pcm.postMessage(this.#consumed);
  }

  /** Drop the media mapping behind the output. */
  #forget(): void {
    const position = Math.floor(this.#resampler.position);
    this.#stretcher.forgetBefore(position);
    this.#queue.forgetBefore(
      this.#stretcher.sourceOf(position) - this.#stretcher.searchFrames - 1,
    );
  }
}

registerProcessor(SOUND_PROCESSOR, SoundProcessor);
