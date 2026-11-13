/**
 * A steady estimate of the media element's playback position.
 *
 * `currentTime` is the position when the element last updated it, and some
 * browsers update it in steps of tens of milliseconds, so a reading is at or
 * a little behind the true position and never ahead of it. The clock runs on
 * the caller's wall clock at the playback rate and is pulled, slowly, towards
 * the highest reading of the last second relative to itself: the reading
 * taken nearest a step is the closest to the truth.
 *
 * After a hold the clock stays on the readings until two changes of the
 * reading in a row are as far apart as playing takes. One change is not
 * enough: an element that has been told to play may move its time by a few
 * milliseconds and then stand still for a tenth of a second before the sound
 * starts, and a clock started on that first change would run ahead of it.
 */
export declare class MediaClock {
    #private;
    /** The position at `wall`, in media seconds, or NaN while not known. */
    at(wall: number): number;
    /** The rate the clock advances at: the playback rate, or 0 while held. */
    get rate(): number;
    /**
     * Where the clock was last put by a reading instead of running there: at a
     * hold, or on a reading too far from it. Playback has been continuous from
     * here, so nothing that ended at or before it has been due since. NaN
     * before the first reading.
     */
    get origin(): number;
    /**
     * Stop at the next reading and wait for the readings to show playing: a
     * seek, a pause or a stall the element has reported. Readings taken across
     * the event say nothing about the position after it.
     */
    hold(): void;
    /**
     * Take a reading of `currentTime` made at `wall`. `playing` is whether the
     * element is playing at all: not paused, seeking or ended. Returns whether
     * the clock started running again from this reading.
     */
    observe(wall: number, currentTime: number, playbackRate: number, playing: boolean): boolean;
}
//# sourceMappingURL=media-clock.d.ts.map