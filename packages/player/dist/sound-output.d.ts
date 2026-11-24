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
import { SoundClock, type SoundControl, type SoundPosition } from "./sound/index.js";
export interface SoundOutputHandlers {
    /** Every report of the processor, after the clock has taken it. */
    report: (position: SoundPosition) => void;
    /** The processor could not be loaded or failed. */
    error: (error: Error) => void;
    /** Each animation frame, with its refresh time, after the clock has been read. */
    frame: (now: number) => void;
}
export declare class SoundOutput {
    #private;
    readonly context: AudioContext;
    readonly clock: SoundClock;
    /** The end of the PCM channel that belongs to the decode worker. */
    readonly workerPort: MessagePort;
    constructor(handlers: SoundOutputHandlers);
    /** Give the processor a command, now or as soon as it exists. */
    control(message: SoundControl): void;
    /**
     * Let the context run. A browser that wants a gesture before sound plays
     * keeps it suspended outside one; the answer is whether it runs now.
     */
    resume(): Promise<boolean>;
    close(): void;
}
//# sourceMappingURL=sound-output.d.ts.map