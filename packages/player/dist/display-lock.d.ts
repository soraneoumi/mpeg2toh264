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
 * While playing, at any speed where each refresh moves by a whole number of
 * steps (2 at double speed on such a screen) or each step lasts a whole
 * number of refreshes (2 at half speed), within `MAX_DEVIATION`. Anything
 * else -- 1.5 times as fast, say, where refreshes take one step and two in
 * turn whatever the clock does -- plays at the sound's own rate.
 */
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
    /** The playback speed asked for. */
    rate: number;
    /** Whether locking applies now: playing. */
    active: boolean;
}
export declare class DisplayLock {
    #private;
    constructor(send: (adjust: number) => void);
    /** The speed factor last sent. */
    get adjust(): number;
    /** The smoothed phase error in grid steps; 0 is a refresh in the middle of its step. */
    get error(): number;
    /** The refresh period, in ms, or NaN until enough refreshes were seen. */
    get period(): number;
    /** Take one animation frame. */
    frame(input: DisplayLockInput): void;
    /** Forget the phase: a seek, a pause, a change of speed. */
    reset(): void;
}
//# sourceMappingURL=display-lock.d.ts.map