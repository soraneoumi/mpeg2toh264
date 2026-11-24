/**
 * The AudioWorkletGlobalScope names the sound processor uses, for the
 * processor program only.
 *
 * TypeScript ships no `lib` for this scope: `lib.dom.d.ts` has the page's
 * `AudioWorkletNode` but not the processor side, and `lib.webworker.d.ts`
 * would declare `self`, `postMessage` and the rest of a Worker, none of which
 * exist in a worklet. Only what processor.ts touches is here; this is not a
 * transcription of the IDL.
 */

interface MessageEvent<T = unknown> {
  readonly data: T;
}

interface MessagePort {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

/** Frame index of the first frame of the quantum being processed. */
declare var currentFrame: number;
/** Context time of `currentFrame`, in seconds. */
declare var currentTime: number;
/** The context's sample rate. */
declare var sampleRate: number;

declare class AudioWorkletProcessor {
  /** Connected to the node's `port` on the page. */
  readonly port: MessagePort;
  constructor();
}

declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor & {
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean;
  },
): void;
