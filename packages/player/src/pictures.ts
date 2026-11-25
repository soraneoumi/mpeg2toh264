/**
 * Decode mode's bookkeeping in the worker: which units to decode for the
 * pictures the page asks for, and the buffers the pictures are copied into.
 *
 * Nothing here touches the DOM or the WebAssembly module, so it runs as it
 * is in Node for the tests.
 */

/** What the schedule needs of a unit. A `video` fragment has it all. */
export interface ScheduledUnit {
  readonly start: number;
  readonly restart: boolean;
  readonly intra: boolean;
  /** In decode order. */
  readonly pictures: readonly {
    readonly time: number;
    readonly duration: number;
  }[];
}

/** One unit to decode now. */
export interface DecodeStep<U> {
  readonly unit: U;
  /** Forget the references first: decoding begins again at this unit. */
  readonly reset: boolean;
  /** What `shows` is asked with for each of the unit's pictures. */
  readonly from: number;
  readonly epoch: number;
}

/**
 * Whether a picture decoded for a request starting at `from` is handed out:
 * all but those ending more than one picture before it, which are decoded
 * only as references. The one before `from` is the renderer's neighbour.
 */
export function shows(
  picture: { readonly time: number; readonly duration: number },
  from: number,
): boolean {
  return picture.time + 2 * picture.duration >= from;
}

/**
 * A request that starts this far before the last one is a jump back, not
 * the clock wavering.
 */
const BACKWARD_TOLERANCE_SECONDS = 0.05;

interface Entry<U> {
  readonly unit: U;
  /** Where its earliest picture starts and its latest ends. */
  readonly first: number;
  readonly end: number;
  /** The time of its first picture in decode order: the intra picture of a unit that opens with one. */
  readonly anchor: number;
}

/**
 * The units of a load in time order, and where decoding stands in them.
 *
 * A request (`need`) names an epoch and a span of media time. Decoding goes
 * on from where it stopped while requests follow on from each other; a new
 * epoch, a jump back, or a jump forward past the unit after the next one
 * starts again at the latest unit a decoder can begin at, at or before the
 * request. Until the store holds one, nothing is decoded. No unit is begun
 * whose pictures all start after the request, unless the decoder is holding
 * back a picture the request reaches: it lets an anchor out only once it
 * decodes the next one.
 */
export class PictureSchedule<U extends ScheduledUnit> {
  readonly #keepBehindSeconds: number;
  #entries: Entry<U>[] = [];
  /** The epoch being served, or null before the first request. */
  #epoch: number | null = null;
  /** Requests of older epochs belong to media that is gone. */
  #minEpoch = 0;
  #highestEpoch = -1;
  #window: { from: number; until: number } | null = null;
  #lastFrom = Number.NEGATIVE_INFINITY;
  /** The next unit to decode, or null when decoding has to begin again. */
  #cursor: number | null = null;
  #resetPending = false;
  /** A unit failed: skip to the next one a decoder can begin at. */
  #broken = false;
  #ended = false;
  #endAnnounced = false;
  /** Whether the last `next` found nothing left to come for the request. */
  #exhausted = false;
  /** Where the units dropped behind the playhead reached. */
  #droppedUntil = Number.NEGATIVE_INFINITY;
  /**
   * Whether the earliest unit held is the input's first, so that nothing
   * comes before it: a request from before it begins where it does. Not so
   * once the input is read again from somewhere in it, nor once a unit is
   * dropped.
   */
  #fromStart = true;

  constructor(keepBehindSeconds: number) {
    this.#keepBehindSeconds = keepBehindSeconds;
  }

  /** How many units are held. */
  get size(): number {
    return this.#entries.length;
  }

  /**
   * Whether the last `next` came back empty with nothing left to come for the
   * request: every unit it reaches is decoded, and any other starts after it
   * or will never arrive. Only the playhead moving on asks for more.
   */
  get exhausted(): boolean {
    return this.#exhausted;
  }

  /** Take a unit the session made. A unit without pictures is not one. */
  add(unit: U): void {
    if (unit.pictures.length === 0)
      throw new Error("a video unit has no pictures");
    let first = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    for (const picture of unit.pictures) {
      first = Math.min(first, picture.time);
      end = Math.max(end, picture.time + picture.duration);
    }
    const entry = { unit, first, end, anchor: unit.pictures[0]!.time };
    let at = this.#entries.length;
    while (at > 0 && this.#entries[at - 1]!.first > first) at--;
    this.#entries.splice(at, 0, entry);
    if (this.#cursor !== null && at < this.#cursor) this.#cursor++;
  }

  /**
   * Forget every unit and every request, as for a seek that reopens the
   * input. Requests of epochs before `from` are refused from here on: by
   * default every epoch seen so far, and for a seek the page already started
   * an epoch for -- its request can come before the seek -- that epoch's.
   */
  clear(from = this.#highestEpoch + 1): void {
    this.#entries = [];
    // Where the input is read from next is not known yet; see `readFrom`.
    this.#fromStart = false;
    this.#minEpoch = from;
    this.#epoch = null;
    this.#window = null;
    this.#lastFrom = Number.NEGATIVE_INFINITY;
    this.#cursor = null;
    this.#resetPending = false;
    this.#broken = false;
    this.#ended = false;
    this.#endAnnounced = false;
    this.#droppedUntil = Number.NEGATIVE_INFINITY;
  }

  /**
   * The units to come are read from the input's start (`start`), or from
   * somewhere in it.
   */
  readFrom(start: boolean): void {
    this.#fromStart = start;
  }

  /**
   * Whether `time` lies among units that were dropped, so that only reading
   * the input again can give its pictures.
   */
  dropped(time: number): boolean {
    return time < this.#droppedUntil;
  }

  /** The input has ended: no unit is coming after the last one held. */
  end(): void {
    this.#ended = true;
  }

  /**
   * Drop the units ending more than the keep-behind span before the
   * playhead, but never the last one decoding can begin at before it.
   */
  playhead(time: number): void {
    const limit = time - this.#keepBehindSeconds;
    let keep = this.#entries.length;
    for (let index = this.#entries.length - 1; index >= 0; index--) {
      const entry = this.#entries[index]!;
      if (startable(entry.unit) && entry.anchor <= time) {
        keep = index;
        break;
      }
    }
    let drop = 0;
    while (drop < keep && this.#entries[drop]!.end < limit) drop++;
    if (drop === 0) return;
    this.#fromStart = false;
    for (const entry of this.#entries.splice(0, drop))
      this.#droppedUntil = Math.max(this.#droppedUntil, entry.end);
    if (this.#cursor !== null)
      this.#cursor = this.#cursor < drop ? null : this.#cursor - drop;
  }

  /**
   * Take a request for the pictures from `from` to `until`. Returns false
   * for one of an epoch a `clear` left behind.
   */
  need(epoch: number, from: number, until: number): boolean {
    if (epoch < this.#minEpoch) return false;
    this.#highestEpoch = Math.max(this.#highestEpoch, epoch);
    if (epoch !== this.#epoch) {
      this.#epoch = epoch;
      this.#cursor = null;
      this.#broken = false;
      this.#endAnnounced = false;
    } else if (from < this.#lastFrom - BACKWARD_TOLERANCE_SECONDS) {
      this.#cursor = null;
    } else if (this.#cursor !== null) {
      // Measured against the last request as well as the cursor: decoding
      // that is catching up after starting again is not a jump.
      const at = this.#containing(from);
      if (at > Math.max(this.#cursor, this.#containing(this.#lastFrom)) + 1)
        this.#cursor = null;
    }
    this.#lastFrom = from;
    this.#window = { from, until };
    this.playhead(from);
    return true;
  }

  /** The first unit ending after `time`, or -1 when none does. */
  #containing(time: number): number {
    return this.#entries.findIndex((entry) => entry.end > time);
  }

  /**
   * The unit to decode next for the last request, or null for none now.
   * `heldBack` is the time of the picture the decoder is holding back, or
   * null when it holds none.
   */
  next(heldBack: number | null): DecodeStep<U> | null {
    this.#exhausted = false;
    const window = this.#window;
    const epoch = this.#epoch;
    const entries = this.#entries;
    if (window === null || epoch === null) return null;
    if (entries.length === 0) return this.#idle(this.#ended);
    let { from, until } = window;
    // The input begins with the earliest unit, so the pictures begin where
    // it does. (Read from somewhere in it, the input has what comes before
    // that unit: a request from there waits for the seek that reads it, and
    // decoding the earliest unit for it instead would hand out the pictures
    // of where the input was read from under the request's epoch.)
    const earliest = entries[0]!;
    if (this.#fromStart && from < earliest.first && startable(earliest.unit)) {
      until += earliest.first - from;
      from = earliest.first;
    }
    if (this.#cursor === null) {
      // Nothing held reaches the request: it is not buffered yet.
      if (this.#containing(from) < 0) return this.#idle(this.#ended);
      let target = -1;
      for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index]!;
        if (startable(entry.unit) && entry.anchor <= from) {
          target = index;
          break;
        }
      }
      // Units arrive in time order, so none a decoder can begin at is still
      // to come before the request.
      if (target < 0) return this.#idle(true);
      this.#cursor = target;
      this.#resetPending = true;
      this.#broken = false;
    }
    if (this.#broken) {
      while (
        this.#cursor < entries.length &&
        !startable(entries[this.#cursor]!.unit)
      )
        this.#cursor++;
      if (this.#cursor >= entries.length) return this.#idle(this.#ended);
      this.#broken = false;
      this.#resetPending = true;
    }
    const entry = entries[this.#cursor];
    if (entry === undefined) return this.#idle(this.#ended);
    // Decoding that begins again drops what the decoder held back.
    const releases =
      !this.#resetPending && heldBack !== null && heldBack <= until;
    if (entry.first > until && !releases) return this.#idle(true);
    this.#cursor++;
    const reset = this.#resetPending;
    this.#resetPending = false;
    return { unit: entry.unit, reset, from, epoch };
  }

  /** Nothing to decode now; `exhausted` says whether anything is to come. */
  #idle(exhausted: boolean): null {
    this.#exhausted = exhausted;
    return null;
  }

  /** The unit last returned by `next` failed to decode. */
  failed(): void {
    this.#broken = true;
  }

  /**
   * The epoch whose pictures have all been handed out, once per epoch: the
   * input has ended and every unit after the start of decoding is done, or
   * none reaches the request at all.
   */
  takeEnd(): number | null {
    if (!this.#ended || this.#endAnnounced || this.#epoch === null) return null;
    const done =
      this.#cursor === null
        ? this.#window !== null && this.#containing(this.#window.from) < 0
        : this.#cursor >= this.#entries.length;
    if (!done) return null;
    this.#endAnnounced = true;
    return this.#epoch;
  }
}

function startable(unit: ScheduledUnit): boolean {
  return unit.intra || unit.restart;
}

/**
 * Picture buffers of one size, used again once the page hands them back.
 *
 * A buffer that comes back detached, or of another size than the pictures
 * now being made, is left for the collector.
 */
export class PictureBuffers {
  #size = 0;
  #free: ArrayBuffer[] = [];
  #allocated = 0;

  /** How many buffers have been made, for whoever is measuring. */
  get allocated(): number {
    return this.#allocated;
  }

  take(byteLength: number): ArrayBuffer {
    if (byteLength !== this.#size) {
      this.#size = byteLength;
      this.#free = [];
    }
    const free = this.#free.pop();
    if (free !== undefined) return free;
    this.#allocated++;
    return new ArrayBuffer(byteLength);
  }

  /** Returns whether the buffer will be used again. */
  recycle(data: unknown): boolean {
    if (
      !(data instanceof ArrayBuffer) ||
      data.byteLength === 0 ||
      data.byteLength !== this.#size
    )
      return false;
    this.#free.push(data);
    return true;
  }
}
