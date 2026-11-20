/**
 * A steady estimate of the media element's playback position.
 *
 * `currentTime` is the position when the element last updated it, and some
 * browsers update it in steps of tens of milliseconds, so while the element
 * plays a reading is at or a little behind the true position and never ahead
 * of it (as it starts it can be, see below). The clock runs on
 * the caller's wall clock at the playback rate and is pulled, slowly, towards
 * the highest reading of the last second relative to itself: the reading
 * taken nearest a step is the closest to the truth.
 *
 * After a hold the clock stays on the readings until they show the element
 * playing, and a start is shown only by the change after it. An element that
 * has been told to play may move its time a little and then stand still
 * before the sound starts: Chromium, for one, extrapolates the position from
 * wall time from its first audio callback, before the device has played any
 * of it, and then holds the position until the sound catches up. A clock
 * started on that move runs ahead of the sound.
 *
 * Where the reading changes at every reading, the next reading settles the
 * question, so the clock waits for it: it runs once two changes in a row
 * have come at playing pace. Where the element updates its reading in steps,
 * waiting costs a whole step: the readings between two updates stand still
 * whether the element plays or not, so they cannot tell, and the pictures
 * due in that step pass meanwhile. So a clock that has seen the reading stand
 * between updates in all of its last second of running runs from the first
 * change after a hold, and stops again if the next change is overdue or out
 * of pace. A start taken back that way is not tried again until a start on
 * two changes has confirmed that the element plays.
 *
 * A running clock stops when the reading stands longer than it has been
 * seen to stand while the element played, and one reading more: the element
 * has stopped, though it has not said so, and pictures shown on would run
 * ahead of the sound.
 *
 * While it waits, the position is the reading, except where the reading has
 * been seen to run ahead of the sound when the element starts: at each start
 * after the element was stopped, the clock runs from a reading on the sound's
 * line, and so learns how far ahead of the sound the reading's first change
 * was. In Chromium that is the device's output delay, about 50 ms at each
 * start; in Firefox the reading leads by less than a reading, if at all.
 * Where it has led by more than a reading at the last starts, the sound
 * while the clock waits is where the reading's first change was, less that
 * lead, and playing on from there.
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
 * stalled without saying so, while the clock has not yet run long enough to
 * know how long the reading stands between updates. Well above update steps
 * of tens of milliseconds.
 */
const STALL_MS = 250;

/**
 * The least a change of the reading must cover, as a fraction of the wall
 * time since the change before it, for the two to count as the element
 * playing. A stepped reading seen a refresh late still covers more than half
 * of the time between sightings; the small moves of an element that has not
 * started yet cover far less.
 */
const START_FRACTION = 0.5;

/** Wall time allowed for the rounding of the times readings are taken at. */
const START_MARGIN_MS = 2;

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
  /** Whether the clock waits for the readings to show playing before it runs. */
  #waiting = true;
  /** The last reading, and the wall time at which it was first seen. */
  #reading = Number.NaN;
  #readingAt = 0;
  /** While waiting: whether the last reading was a change, not where the clock was held. */
  #stepped = false;
  /** Wall time between the last reading that changed and the reading before it. */
  #steppedWithin = 0;
  /** Wall time of the last reading taken, changed or not. */
  #observedAt = 0;
  #origin = Number.NaN;
  /** Wall time of the last correction. */
  #correctedAt = 0;
  /** The highest error of a reading, in media seconds, per bucket; the last is the newest. */
  readonly #errors = new Float64Array(BUCKETS);
  #bucketAt = 0;
  /** Whether the next reading holds the clock, as hold() asks. */
  #holdRequested = true;
  /**
   * The longest the reading was seen unchanged before a change that moved it
   * as playing does, in media seconds, per BUCKET_MS of running; the last is
   * the newest. NaN for a bucket the clock has not run through.
   */
  readonly #stands = new Float64Array(BUCKETS).fill(Number.NaN);
  /** Running time, in wall milliseconds, counted into the newest bucket of #stands. */
  #standsFor = 0;
  /**
   * While running on a start that is still to be confirmed, which is any
   * start where the reading steps: the wall time by which the reading has to
   * change again for the start to hold. 0 otherwise.
   */
  #confirmBy = 0;
  /**
   * Whether a start still to be confirmed was taken back, so that the clock
   * does not run on a first change again before a start has held.
   */
  #withdrawn = false;
  /** While waiting: whether the last change came at playing pace. */
  #paced = false;
  /** While waiting after a stop on a standstill, until the reading changes. */
  #stoodStill = false;
  /**
   * How far ahead of the sound the reading's first change was, in wall
   * milliseconds, at the last starts whose reading moved at the first
   * reading after the element was stopped, oldest overwritten first. NaN
   * until there have been that many.
   */
  readonly #leads = new Float64Array(3).fill(Number.NaN);
  #leadsSeen = 0;
  /**
   * While waiting after the element was stopped: where it was held. NaN
   * otherwise, and after a change between two rates it plays at.
   */
  #held = Number.NaN;
  /** The reading's first change after that hold, and when it was seen. */
  #first = Number.NaN;
  #firstAt = Number.NaN;
  /**
   * While waiting: the lead the sound is worked out with, or NaN where the
   * position is the reading.
   */
  #lead = Number.NaN;
  /** Whether the reading has stood since its first change, while the lead is in use. */
  #leadStood = false;
  /** A reading that stood and then moved on at playing pace, while the lead is in use. */
  #soundFloor = Number.NEGATIVE_INFINITY;

  /** The position at `wall`, in media seconds, or NaN while not known. */
  at(wall: number): number {
    if (
      this.#waiting &&
      !Number.isNaN(this.#lead) &&
      !Number.isNaN(this.#media)
    )
      return this.#soundWhileWaiting(wall);
    return this.#media + (this.#rate * (wall - this.#wall)) / 1000;
  }

  /**
   * Where the sound is at `wall` while the clock waits on a reading known to
   * lead it: where the reading's first change was, less the lead, playing on
   * from there. Not before where the element was held, from where the sound
   * starts. Not past the reading and the time since it was read, which is the
   * furthest the element can be. Not behind a reading that stood and moved
   * on at playing pace, which is where the sound was when it moved.
   */
  #soundWhileWaiting(wall: number): number {
    const rate = this.#playbackRate;
    const sound =
      this.#first + (rate * (wall - this.#firstAt - this.#lead)) / 1000;
    const furthest = this.#reading + (rate * (wall - this.#observedAt)) / 1000;
    return Math.max(
      this.#soundFloor,
      Math.min(furthest, Math.max(this.#held, sound)),
    );
  }

  /** The rate the clock advances at: the playback rate, or 0 while held. */
  get rate(): number {
    return this.#rate;
  }

  /**
   * Where the clock was last put by a reading instead of running there: at a
   * hold, or on a reading too far from it. Playback has been continuous from
   * here, so nothing that ended at or before it has been due since. NaN
   * before the first reading.
   */
  get origin(): number {
    return this.#origin;
  }

  /**
   * Stop at the next reading and wait for the readings to show playing: a
   * seek, a pause or a stall the element has reported. Readings taken across
   * the event say nothing about the position after it.
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
    const sinceObserved = wall - this.#observedAt;
    this.#observedAt = wall;
    // At a rate of 0 the element stays where it is, though it is not paused.
    if (
      !playing ||
      playbackRate === 0 ||
      this.#holdRequested ||
      playbackRate !== this.#playbackRate
    ) {
      // About to play after being stopped: it was not playing, or held at a
      // rate of 0, or the hold came at the rate it plays at (a seek, a
      // stall). A change between two rates it plays at does not stop it.
      const stopped =
        playbackRate !== 0 &&
        (!playing ||
          this.#playbackRate === 0 ||
          playbackRate === this.#playbackRate);
      this.#holdRequested = false;
      this.#playbackRate = playbackRate;
      this.#holdAt(wall, currentTime);
      if (stopped) this.#held = currentTime;
      return false;
    }
    const confirming = this.#confirmBy !== 0;
    if (!this.#waiting && !confirming) this.#countRunning(sinceObserved);
    if (currentTime === this.#reading) {
      if (this.#waiting) {
        if (!Number.isNaN(this.#lead)) this.#leadStood = true;
        return false;
      }
      if (confirming) {
        // Overdue: a standstill like any other, so that an update that was
        // only late still starts the clock again on its own.
        if (wall > this.#confirmBy) {
          this.#withdrawn = true;
          this.#stopOnStandstill(wall, currentTime, true);
        }
        return false;
      }
      // The next change is due within the longest the reading has been seen
      // to stand while the element played, and one reading more.
      const stand = this.#stand(playbackRate);
      const limit = Number.isNaN(stand)
        ? STALL_MS
        : stand + sinceObserved + START_MARGIN_MS;
      if (wall - this.#readingAt > limit)
        this.#stopOnStandstill(wall, currentTime, !Number.isNaN(stand));
      return false;
    }
    const moved = ((currentTime - this.#reading) * 1000) / playbackRate;
    const elapsed = wall - this.#readingAt;
    // How long the reading before this one was seen unchanged.
    const stood = elapsed - sinceObserved;
    const previousWithin = this.#steppedWithin;
    this.#reading = currentTime;
    this.#readingAt = wall;
    this.#steppedWithin = sinceObserved;
    // Each change was seen up to one reading after it happened, so two
    // changes are apart by the time between their sightings, give or take
    // those.
    const inStep = moved <= elapsed + previousWithin + START_MARGIN_MS;
    const playingPace = moved >= elapsed * START_FRACTION && inStep;
    if (this.#waiting) {
      const first = !this.#stepped;
      this.#stepped = true;
      if (first && !Number.isNaN(this.#held) && stood <= START_MARGIN_MS) {
        // The first change, at the first reading after the element was
        // stopped. One that stood at the held position first was not an
        // element that had just been told to play, and is left out.
        this.#first = currentTime;
        this.#firstAt = wall;
        const lead = this.#usualLead();
        this.#lead = lead > sinceObserved + START_MARGIN_MS ? lead : Number.NaN;
      } else if (
        this.#leadStood &&
        moved >= sinceObserved * START_FRACTION &&
        moved <= sinceObserved + previousWithin + START_MARGIN_MS
      ) {
        this.#soundFloor = currentTime;
      }
      // The change that ends a stop on a standstill, at playing pace over
      // all the time the reading stood: the reading stood between two
      // updates, longer than any stand seen so far, as after the rate falls
      // and every step takes longer. Noted, the next stand that long does
      // not stop the clock again.
      if (this.#stoodStill && !first && playingPace)
        this.#noteStand(stood, playbackRate);
      this.#stoodStill = false;
      const steps = this.#updatesInSteps(playbackRate, sinceObserved);
      if (!first && playingPace) {
        // A reading that steps runs on this change, as the next stands
        // either way; one that follows the element runs on the next change
        // at playing pace, which shows this one was not a move ahead of
        // the sound. A reading that has just changed is a step that has
        // just been taken, which is where the clock starts.
        if (steps || this.#paced) {
          this.#withdrawn = false;
          this.#runToBeConfirmed(
            wall,
            currentTime,
            playbackRate,
            sinceObserved,
            steps,
          );
          return true;
        }
        this.#paced = true;
      } else {
        this.#paced = false;
        // Where the reading steps, the readings after this change will
        // stand whether the element plays or not, so the clock runs from
        // here, to be confirmed by the next change.
        if (first && !this.#withdrawn && steps && moved > 0 && inStep) {
          this.#runToBeConfirmed(
            wall,
            currentTime,
            playbackRate,
            sinceObserved,
            true,
          );
          return true;
        }
      }
      // Not shown to be playing yet: the position is the reading.
      this.#wall = wall;
      this.#media = currentTime;
      return false;
    }
    if (confirming) {
      // The second change after the hold, which a start on two changes
      // would have waited for.
      if (!playingPace) {
        this.#withdrawn = true;
        this.#holdAt(wall, currentTime);
        return false;
      }
      this.#confirmBy = 0;
      this.#withdrawn = false;
    } else if (playingPace) {
      // A reading that stood and then moved as far as playing takes stood
      // between two updates, not because the element stopped.
      this.#noteStand(stood, playbackRate);
    }
    const error = currentTime - this.at(wall);
    if (Math.abs(error) > (RESTART_MS / 1000) * playbackRate) {
      this.#origin = currentTime;
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

  /**
   * Count running time towards the window of #stands. The window advances
   * only while the clock runs, so holds and seeks in quick succession keep
   * what the playing before them showed.
   */
  #countRunning(elapsed: number): void {
    this.#standsFor += elapsed;
    if (this.#standsFor < BUCKET_MS) return;
    this.#stands.copyWithin(0, 1);
    this.#stands[BUCKETS - 1] = 0;
    this.#standsFor = 0;
  }

  /**
   * Run from a reading that has just changed. Where the reading steps, the
   * start holds only if the next change comes within the longest stand seen
   * and one reading more.
   */
  #runToBeConfirmed(
    wall: number,
    currentTime: number,
    playbackRate: number,
    sinceObserved: number,
    confirm: boolean,
  ): void {
    // A start after the element was stopped is on the sound's line: how far
    // ahead of it the reading's first change was.
    if (!Number.isNaN(this.#firstAt))
      this.#leads[this.#leadsSeen++ % this.#leads.length] =
        ((this.#first - currentTime) * 1000) / playbackRate +
        (wall - this.#firstAt);
    this.#run(wall, currentTime);
    if (confirm)
      this.#confirmBy =
        wall + this.#stand(playbackRate) + sinceObserved + START_MARGIN_MS;
  }

  /**
   * Stop a running clock on a reading that has stood too long, keeping when
   * the reading was first seen where its updates are known: the change that
   * ends the standstill is then judged over the whole time the reading
   * stood. An update that was merely late moves as far as that time; where
   * the reading steps it starts the clock again at once, and where it follows
   * the element the next change at playing pace does. A standstill of the
   * element moves less, and the clock waits.
   */
  #stopOnStandstill(wall: number, currentTime: number, known: boolean): void {
    const readingAt = this.#readingAt;
    this.#holdAt(wall, currentTime);
    if (!known) return;
    this.#readingAt = readingAt;
    this.#stepped = true;
    this.#stoodStill = true;
  }

  /** Note that the reading stood `stood` wall milliseconds between two updates. */
  #noteStand(stood: number, playbackRate: number): void {
    const newest = this.#stands[BUCKETS - 1]!;
    const media = (stood * playbackRate) / 1000;
    this.#stands[BUCKETS - 1] = Number.isNaN(newest)
      ? media
      : Math.max(newest, media);
  }

  /**
   * Whether the element updates its reading in steps: in each whole bucket
   * of the last second of running the reading stood, between two updates,
   * for longer than readings taken close together and at least as long as
   * the time between readings. One reading that happened to repeat does not
   * make it so.
   */
  #updatesInSteps(playbackRate: number, sinceObserved: number): boolean {
    let usual = Number.POSITIVE_INFINITY;
    for (let index = 0; index < BUCKETS - 1; index++) {
      const value = this.#stands[index]!;
      if (Number.isNaN(value)) return false;
      usual = Math.min(usual, value);
    }
    const stand = (usual * 1000) / playbackRate;
    return stand > START_MARGIN_MS && stand + START_MARGIN_MS >= sinceObserved;
  }

  /**
   * The longest the reading was seen to stand between updates over the last
   * second of running, in wall milliseconds at `playbackRate`. NaN until the
   * clock has run through a whole bucket: the newest one is still filling.
   */
  #stand(playbackRate: number): number {
    let stand = Number.NaN;
    for (let index = 0; index < BUCKETS - 1; index++) {
      const value = this.#stands[index]!;
      if (!Number.isNaN(value))
        stand = Number.isNaN(stand) ? value : Math.max(stand, value);
    }
    if (Number.isNaN(stand)) return stand;
    const newest = this.#stands[BUCKETS - 1]!;
    if (!Number.isNaN(newest)) stand = Math.max(stand, newest);
    return (stand * 1000) / playbackRate;
  }

  /**
   * The lead of the last starts, the middle of them, so that one start the
   * element made differently does not move it. NaN until there have been
   * enough.
   */
  #usualLead(): number {
    const [a, b, c] = this.#leads as unknown as [number, number, number];
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c))
      return Number.NaN;
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  }

  #holdAt(wall: number, currentTime: number): void {
    this.#held = Number.NaN;
    this.#first = Number.NaN;
    this.#firstAt = Number.NaN;
    this.#lead = Number.NaN;
    this.#leadStood = false;
    this.#soundFloor = Number.NEGATIVE_INFINITY;
    this.#stoodStill = false;
    this.#paced = false;
    this.#confirmBy = 0;
    this.#wall = wall;
    this.#media = currentTime;
    this.#rate = 0;
    this.#waiting = true;
    this.#stepped = false;
    this.#reading = currentTime;
    this.#readingAt = wall;
    this.#origin = currentTime;
  }

  #run(wall: number, currentTime: number): void {
    this.#firstAt = Number.NaN;
    this.#lead = Number.NaN;
    this.#confirmBy = 0;
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
