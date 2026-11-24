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
export declare class DisplayLock {
    #private;
    constructor(send: (adjust: number) => void);
    /** The speed factor last sent. */
    get adjust(): number;
    /** The refresh period, in ms, or NaN until enough refreshes were seen. */
    get period(): number;
    /**
     * The first refresh at or after `wall` on the grid of those seen, as an
     * animation frame's time; NaN while the period is not known.
     */
    refreshAfter(wall: number): number;
    /** Take one animation frame. */
    frame(input: DisplayLockInput): void;
}
//# sourceMappingURL=display-lock.d.ts.map