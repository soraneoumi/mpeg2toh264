/**
 * Decode mode's sound in the worker: the PCM the session hands out, held for
 * a while and fed to the AudioWorklet that plays it.
 *
 * The worklet keeps only what it is about to play, so the worker is where the
 * sound around the playhead lives: what was played in the last
 * `keepBehindSeconds`, so that a seek back a little plays at once, and what
 * was converted ahead, up to `maxAheadSeconds` past what the worklet has
 * taken, which is how far ahead reading the input is let run. The worklet is
 * sent about `FEED_AHEAD_SECONDS` beyond what it has taken, from the start of
 * the epoch it was last told to play.
 *
 * The worklet's `consumed` messages are the playhead here. They stop while it
 * is paused or starved, and so does the feed and, once enough is held, the
 * reading.
 */
import { ReadyGate } from "./mse.js";
import type { SoundConsumed, SoundEnd, SoundPcm } from "./sound/messages.js";

/** How far past what the worklet has taken it is sent sound, in seconds. */
const FEED_AHEAD_SECONDS = 1;

interface Chunk {
  start: number;
  end: number;
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

export interface SoundFeedOptions {
  maxAheadSeconds: number;
  keepBehindSeconds: number;
  /** What is held changed: the media from `start` to `end`, or nothing. */
  onRange: (range: { start: number; end: number } | null) => void;
}

export class SoundFeed {
  readonly #options: SoundFeedOptions;
  #port: MessagePort | null = null;
  /** In media order; contiguous except where the timeline itself jumps. */
  #chunks: Chunk[] = [];
  /** The input of the current read ended after the last chunk. */
  #ended = false;
  /** The epoch being fed, and the media time it starts at; null before the first. */
  #epoch: number | null = null;
  /** Index of the next chunk to send in this epoch. */
  #next = 0;
  #endSent = false;
  /** Where the worklet has taken the sound up to, or where the epoch starts. */
  #playhead = 0;
  readonly #room = new ReadyGate();

  constructor(options: SoundFeedOptions) {
    this.#options = options;
  }

  /** The port to the worklet's queue. */
  attach(port: MessagePort): void {
    this.#port?.close();
    this.#port = port;
    port.onmessage = (event: MessageEvent<SoundConsumed>) =>
      this.#consumed(event.data);
    this.#pump();
  }

  /** Resolves while there is room to convert more. */
  ready(): Promise<void> {
    return this.#room.wait();
  }

  /** Whether `time` is in the sound held, so that a seek there needs no reading. */
  covers(time: number): boolean {
    const first = this.#chunks[0];
    const last = this.#chunks.at(-1);
    return (
      first !== undefined &&
      last !== undefined &&
      time >= first.start &&
      (time < last.end || (this.#ended && time <= last.end))
    );
  }

  /** Drop everything held: the input is being read again from elsewhere. */
  reset(): void {
    this.#chunks = [];
    this.#ended = false;
    this.#next = 0;
    this.#endSent = false;
    this.#update();
  }

  /**
   * Play from media time `at` under `epoch` from now on: the worklet has been
   * told the same, and drops whatever it is sent from before `at`.
   */
  begin(epoch: number, at: number): void {
    this.#epoch = epoch;
    this.#playhead = at;
    this.#endSent = false;
    this.#next = this.#chunks.findIndex((chunk) => chunk.end > at);
    if (this.#next < 0) this.#next = this.#chunks.length;
    this.#evict();
    this.#pump();
    this.#update();
  }

  /** Hold a stretch of decoded sound; `left` and `right` become this feed's. */
  push(
    start: number,
    sampleRate: number,
    left: Float32Array,
    right: Float32Array,
  ): void {
    this.#chunks.push({
      start,
      end: start + left.length / sampleRate,
      sampleRate,
      left,
      right,
    });
    this.#pump();
    this.#update();
  }

  /** No more sound is coming from this read of the input. */
  end(): void {
    this.#ended = true;
    this.#pump();
  }

  close(): void {
    this.#port?.close();
    this.#port = null;
    this.#chunks = [];
    this.#room.abandon();
  }

  #consumed(message: SoundConsumed): void {
    if (message.epoch !== this.#epoch) return;
    this.#playhead = message.until;
    this.#evict();
    this.#pump();
    this.#update();
  }

  /** Send the worklet what is due: up to `FEED_AHEAD_SECONDS` past its playhead. */
  #pump(): void {
    const port = this.#port;
    const epoch = this.#epoch;
    if (port === null || epoch === null) return;
    const until = this.#playhead + FEED_AHEAD_SECONDS;
    while (this.#next < this.#chunks.length) {
      const chunk = this.#chunks[this.#next]!;
      if (chunk.start >= until) return;
      // Copies: what is sent is the worklet's to play from in place, and
      // what is held here may be played again after a seek back.
      const left = chunk.left.slice();
      const right = chunk.right.slice();
      port.postMessage(
        {
          type: "pcm",
          epoch,
          start: chunk.start,
          sampleRate: chunk.sampleRate,
          channels: [left, right],
        } satisfies SoundPcm,
        [left.buffer, right.buffer],
      );
      this.#next++;
    }
    if (this.#ended && !this.#endSent) {
      this.#endSent = true;
      port.postMessage({ type: "end", epoch } satisfies SoundEnd);
    }
  }

  /** Drop what is further behind the playhead than a seek back is kept for. */
  #evict(): void {
    const keepFrom = this.#playhead - this.#options.keepBehindSeconds;
    let drop = 0;
    while (
      drop < this.#chunks.length &&
      drop < this.#next &&
      this.#chunks[drop]!.end <= keepFrom
    )
      drop++;
    if (drop === 0) return;
    this.#chunks.splice(0, drop);
    this.#next -= drop;
  }

  /** Open or close reading, and say what is held. */
  #update(): void {
    const last = this.#chunks.at(-1);
    this.#room.set(
      last === undefined ||
        last.end - this.#playhead < this.#options.maxAheadSeconds,
    );
    const first = this.#chunks[0];
    this.#options.onRange(
      first && last ? { start: first.start, end: last.end } : null,
    );
  }
}
