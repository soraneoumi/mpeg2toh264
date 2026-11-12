/**
 * A steady estimate of the media element's playback position.
 *
 * `currentTime` is the position when the element last updated it, and some
 * browsers update it in steps of tens of milliseconds, so a reading is at or
 * a little behind the true position and never ahead of it. The clock runs on
 * the caller's wall clock at the playback rate and is pulled, slowly, towards
 * the highest reading of the last second relative to itself: the reading
 * taken nearest a step is the closest to the truth.
 */

/** Window over which the highest reading is kept, as buckets of this many milliseconds. */
const BUCKET_MS = 250;
const BUCKETS = 4;

/**
 * The largest correction per second of wall time, as a fraction of the
 * playback rate. One percent moves a picture by a sixth of a millisecond per
 * refresh, which no one sees, and still closes a refresh-sized error within
 * two seconds.
 */
const SLEW = 0.01;

/**
 * Wall time by which one reading may disagree with the clock before the clock
 * restarts from it. A healthy reading lags by at most one update step plus the
 * time between readings, under 60 ms with steps of 40 ms. A larger error is a
 * real jump of the element's clock, and slewing it away would take seconds of
 * visible error.
 */
const RESTART_MS = 100;

/**
 * Wall time without a new reading after which the element is taken to have
 * stalled without saying so. Well above update steps of tens of
 * milliseconds.
 */
const STALL_MS = 250;

export class MediaClock {
  /**
   * The position is #media + #rate * (wall - #wall) / 1000 seconds. It is
   * NaN between a hold and the reading after it, when it is not known.
   */
  #wall = 0;
  #media = Number.NaN;
  /** The playback rate while running, 0 while held. */
  #rate = 0;
  #playbackRate = 1;
  /** Whether the clock waits for the reading to change before it runs. */
  #waiting = true;
  /** The last reading, and the wall time at which it was first seen. */
  #reading = Number.NaN;
  #readingAt = 0;
  /** Wall time of the last correction. */
  #correctedAt = 0;
  /** The highest error of a reading, in media seconds, per bucket; the last is the newest. */
  readonly #errors = new Float64Array(BUCKETS);
  #bucketAt = 0;
  /** Whether the next reading holds the clock, as hold() asks. */
  #holdRequested = true;

  /** The position at `wall`, in media seconds, or NaN while not known. */
  at(wall: number): number {
    return this.#media + (this.#rate * (wall - this.#wall)) / 1000;
  }

  /** The rate the clock advances at: the playback rate, or 0 while held. */
  get rate(): number {
    return this.#rate;
  }

  /**
   * Stop at the next reading and wait for it to move: a seek, a pause or a
   * stall the element has reported. Readings taken across the event say
   * nothing about the position after it.
   */
  hold(): void {
    this.#holdRequested = true;
    this.#media = Number.NaN;
    this.#rate = 0;
  }

  /**
   * Take a reading of `currentTime` made at `wall`. `playing` is whether the
   * element is playing at all: not paused, seeking or ended. Returns whether
   * the clock started running again from this reading.
   */
  observe(
    wall: number,
    currentTime: number,
    playbackRate: number,
    playing: boolean,
  ): boolean {
    if (
      !playing ||
      this.#holdRequested ||
      playbackRate !== this.#playbackRate
    ) {
      this.#holdRequested = false;
      this.#playbackRate = playbackRate;
      this.#holdAt(wall, currentTime);
      return false;
    }
    if (currentTime === this.#reading) {
      if (!this.#waiting && wall - this.#readingAt > STALL_MS)
        this.#holdAt(wall, currentTime);
      return false;
    }
    this.#reading = currentTime;
    this.#readingAt = wall;
    // A reading that moved after a hold is a step that has just been taken,
    // which is where the clock starts.
    const error = currentTime - this.at(wall);
    if (this.#waiting || Math.abs(error) > (RESTART_MS / 1000) * playbackRate) {
      this.#run(wall, currentTime);
      return true;
    }
    const errors = this.#errors;
    if (wall - this.#bucketAt >= BUCKET_MS) {
      errors.copyWithin(0, 1);
      errors[BUCKETS - 1] = error;
      this.#bucketAt = wall;
    } else {
      errors[BUCKETS - 1] = Math.max(errors[BUCKETS - 1]!, error);
    }
    let target = errors[0]!;
    for (let index = 1; index < BUCKETS; index++)
      target = Math.max(target, errors[index]!);
    const reach = (SLEW * playbackRate * (wall - this.#correctedAt)) / 1000;
    const correction = Math.max(-reach, Math.min(reach, target));
    this.#correctedAt = wall;
    this.#media += correction;
    for (let index = 0; index < BUCKETS; index++)
      errors[index] = errors[index]! - correction;
    return false;
  }

  #holdAt(wall: number, currentTime: number): void {
    this.#wall = wall;
    this.#media = currentTime;
    this.#rate = 0;
    this.#waiting = true;
    this.#reading = currentTime;
    this.#readingAt = wall;
  }

  #run(wall: number, currentTime: number): void {
    this.#wall = wall;
    this.#media = currentTime;
    this.#rate = this.#playbackRate;
    this.#waiting = false;
    this.#correctedAt = wall;
    this.#bucketAt = wall;
    // Buckets with no reading yet must not win the maximum.
    this.#errors.fill(Number.NEGATIVE_INFINITY);
    this.#errors[BUCKETS - 1] = 0;
  }
}
