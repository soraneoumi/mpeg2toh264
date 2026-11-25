/// <reference types="vite/client" />
/**
 * The sound output stage, for the page.
 *
 * ```ts
 * // At the device's rate: the processor resamples the sound to it.
 * const context = new AudioContext();
 * await context.audioWorklet.addModule(soundProcessorURL);
 * const node = new AudioWorkletNode(context, SOUND_PROCESSOR, {
 *   numberOfInputs: 0,
 *   outputChannelCount: [2],
 * });
 * node.connect(context.destination);
 * const { port1, port2 } = new MessageChannel();
 * node.port.postMessage({ type: "pcm-port", port: port1 }, [port1]);
 * // port2 goes to the decode Worker, which sends `pcm` and `end` on it.
 * const clock = new SoundClock(context);
 * node.port.onmessage = (event) => clock.report(event.data);
 * ```
 */
import bundledProcessorURL from "./processor.ts?worker&url";

/** The processor module, emitted as one self-contained file beside this package. */
export const soundProcessorURL: string = bundledProcessorURL;

export { SoundClock } from "./clock.js";
export { SOUND_PROCESSOR } from "./messages.js";
export type {
  SoundConsumed,
  SoundControl,
  SoundEnd,
  SoundPcm,
  SoundPcmMessage,
  SoundPosition,
  SoundState,
} from "./messages.js";
