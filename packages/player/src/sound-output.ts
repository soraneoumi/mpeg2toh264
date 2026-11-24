/**
 * Decode mode's way to the speaker, on the page: an `AudioContext`, the
 * AudioWorklet that plays the decode worker's PCM, and the clock of what is
 * being heard.
 *
 * The worklet's module loads asynchronously, while the worker may start
 * sending PCM at once: the port the worker is given buffers what it is sent
 * until the processor takes it, and the commands for the processor wait here
 * until it exists.
 */
import {
  SOUND_PROCESSOR,
  SoundClock,
  soundProcessorURL,
  type SoundControl,
  type SoundPosition,
} from "./sound/index.js";

/**
 * How often the context clock is read besides each animation frame, which a
 * hidden page is given none of.
 */
const SAMPLE_INTERVAL_MS = 50;

/** Broadcast sound is 48 kHz; asking for it spares the browser a resampler. */
const CONTEXT_SAMPLE_RATE = 48000;

export interface SoundOutputHandlers {
  /** Every report of the processor, after the clock has taken it. */
  report: (position: SoundPosition) => void;
  /** The processor could not be loaded or failed. */
  error: (error: Error) => void;
}

export class SoundOutput {
  readonly context: AudioContext;
  readonly clock: SoundClock;
  /** The end of the PCM channel that belongs to the decode worker. */
  readonly workerPort: MessagePort;
  readonly #handlers: SoundOutputHandlers;
  #node: AudioWorkletNode | null = null;
  /** Commands given before the processor existed, in order. */
  #queued: SoundControl[] = [];
  #closed = false;
  readonly #timer: ReturnType<typeof setInterval>;
  #frame = 0;

  constructor(handlers: SoundOutputHandlers) {
    this.#handlers = handlers;
    this.context = new AudioContext({ sampleRate: CONTEXT_SAMPLE_RATE });
    this.clock = new SoundClock(this.context);
    const { port1, port2 } = new MessageChannel();
    this.workerPort = port2;
    this.#timer = setInterval(this.#sample, SAMPLE_INTERVAL_MS);
    this.#frame = requestAnimationFrame(this.#onFrame);
    this.context.audioWorklet.addModule(soundProcessorURL).then(
      () => this.#open(port1),
      (error: unknown) => this.#fail(error),
    );
  }

  /** Give the processor a command, now or as soon as it exists. */
  control(message: SoundControl): void {
    if (this.#closed) return;
    if (this.#node) this.#node.port.postMessage(message);
    else this.#queued.push(message);
  }

  /**
   * Let the context run. A browser that wants a gesture before sound plays
   * keeps it suspended outside one; the answer is whether it runs now.
   */
  async resume(): Promise<boolean> {
    if (this.context.state !== "running") {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }
    return this.context.state === "running";
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    clearInterval(this.#timer);
    cancelAnimationFrame(this.#frame);
    this.#node?.port.close();
    this.#node?.disconnect();
    this.#node = null;
    this.#queued = [];
    this.workerPort.close();
    void this.context.close();
  }

  #open(port: MessagePort): void {
    if (this.#closed) {
      port.close();
      return;
    }
    let node: AudioWorkletNode;
    try {
      node = new AudioWorkletNode(this.context, SOUND_PROCESSOR, {
        numberOfInputs: 0,
        outputChannelCount: [2],
      });
    } catch (error) {
      this.#fail(error);
      return;
    }
    node.onprocessorerror = () =>
      this.#fail(new Error("the sound processor failed"));
    node.port.onmessage = (event: MessageEvent<SoundPosition>) => {
      this.clock.report(event.data);
      this.#handlers.report(event.data);
    };
    node.connect(this.context.destination);
    node.port.postMessage({ type: "pcm-port", port } satisfies SoundControl, [
      port,
    ]);
    for (const message of this.#queued) node.port.postMessage(message);
    this.#queued = [];
    this.#node = node;
  }

  #fail(error: unknown): void {
    if (this.#closed) return;
    this.#handlers.error(
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  #sample = (): void => {
    this.clock.sample();
  };

  #onFrame = (): void => {
    this.clock.sample();
    this.#frame = requestAnimationFrame(this.#onFrame);
  };
}
