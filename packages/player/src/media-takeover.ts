/**
 * Decode mode's media element.
 *
 * In decode mode the `<video>` the player was given plays nothing itself: the
 * pictures are drawn by the deinterlacer and the sound comes out of an
 * AudioWorklet. Everything around it -- the player UI, the captions, the app
 * -- still talks to the element, so its media interface is answered from here
 * for the length of the load: own properties on the element instance shadow
 * the prototype's, as the deinterlacer already does for `videoWidth` and
 * `getVideoPlaybackQuality`, and the media events are dispatched on the
 * element by this class. The element stays the same DOM node, so its place in
 * the document, its style and its parent are untouched. Removing the own
 * properties gives the element back as it was, for a load that passes the
 * video through.
 *
 * Only what the player UI and the app use is here (the list was taken from
 * DPlayer, KonomiTV and aribb24.js); the rest of the element is its own. The
 * behaviour follows the HTML media element where it is the same thing:
 * events after the calling code has run, `play()` refusing with
 * `NotAllowedError` where sound may not start yet, `paused` set and `pause`
 * fired before `ended`, and a `play()` at the end starting over.
 */

/** HTMLMediaElement's readyState values. */
export const enum Ready {
  Nothing = 0,
  Metadata = 1,
  CurrentData = 2,
  FutureData = 3,
  EnoughData = 4,
}

/** How often `timeupdate` fires during playback, as browsers do at most. */
const TIMEUPDATE_INTERVAL_MS = 250;

/** The speeds the sound processor can play at, pitch kept. */
const MIN_RATE = 0.25;
const MAX_RATE = 4;

export interface TakeoverHandlers {
  /** The viewer wants playback to run; the sound may start once it can. */
  play: () => void;
  pause: () => void;
  /** The viewer moved the playhead to `time`. */
  seek: (time: number) => void;
  rate: (rate: number) => void;
  /** The linear gain the sound should have: zero while muted. */
  volume: (gain: number) => void;
  /** The media time being heard now, or NaN while that is not known. */
  heard: () => number;
  /** Let sound play; resolves to whether the browser allows it now. */
  resume: () => Promise<boolean>;
}

/** One range, or none, as `TimeRanges`. */
class Ranges implements TimeRanges {
  readonly #range: { start: number; end: number } | null;

  constructor(range: { start: number; end: number } | null) {
    this.#range = range;
  }

  get length(): number {
    return this.#range === null ? 0 : 1;
  }

  start(index: number): number {
    return this.#at(index).start;
  }

  end(index: number): number {
    return this.#at(index).end;
  }

  #at(index: number): { start: number; end: number } {
    if (index !== 0 || this.#range === null)
      throw new DOMException(
        `index ${index} of ${this.length} ranges`,
        "IndexSizeError",
      );
    return this.#range;
  }
}

/** The element members taken over, which `uninstall` gives back. */
const TAKEN = [
  "currentTime",
  "paused",
  "play",
  "pause",
  "playbackRate",
  "volume",
  "muted",
  "duration",
  "buffered",
  "seekable",
  "played",
  "readyState",
  "seeking",
  "ended",
  "error",
] as const;

export class MediaTakeover {
  readonly #video: HTMLVideoElement;
  readonly #handlers: TakeoverHandlers;
  #installed = false;

  #paused = true;
  #seeking = false;
  #ended = false;
  #readyState = Ready.Nothing;
  #loadedMetadata = false;
  #loadedData = false;
  /** A readyState asked for before the duration was known; see `setReadyState`. */
  #pendingReady: Ready | null = null;
  /** The position while the sound is not running. */
  #position = 0;
  /** Whether the sound is playing, so that the position is the one heard. */
  #running = false;
  #duration = Number.NaN;
  #buffered: { start: number; end: number } | null = null;
  #playedFrom: number | null = null;
  #rate: number;
  #volume: number;
  #muted: boolean;
  #timeupdate: ReturnType<typeof setInterval> | null = null;

  constructor(video: HTMLVideoElement, handlers: TakeoverHandlers) {
    this.#video = video;
    this.#handlers = handlers;
    // Whatever the page set on the element before the load carries on.
    this.#rate = video.playbackRate;
    this.#volume = video.volume;
    this.#muted = video.muted;
  }

  /** The gain the sound should have now. */
  get gain(): number {
    return this.#muted ? 0 : this.#volume;
  }

  get rate(): number {
    return this.#rate;
  }

  get paused(): boolean {
    return this.#paused;
  }

  /** Whether the sound is playing and playback is wanted. */
  get playing(): boolean {
    return this.#running && !this.#paused;
  }

  get readyState(): Ready {
    return this.#readyState;
  }

  /** The position the element reports. */
  get currentTime(): number {
    if (this.#running) {
      const heard = this.#handlers.heard();
      if (!Number.isNaN(heard)) return heard;
    }
    return this.#position;
  }

  install(): void {
    if (this.#installed) return;
    this.#installed = true;
    const video = this.#video;
    const define = (
      name: (typeof TAKEN)[number],
      descriptor: PropertyDescriptor,
    ) =>
      Object.defineProperty(video, name, { configurable: true, ...descriptor });
    define("currentTime", {
      get: () => this.currentTime,
      set: (time: number) => this.#seekTo(time),
    });
    define("paused", { get: () => this.#paused });
    define("play", { value: () => this.#play(), writable: true });
    define("pause", { value: () => this.#pause(), writable: true });
    define("playbackRate", {
      get: () => this.#rate,
      set: (rate: number) => this.#setRate(rate),
    });
    define("volume", {
      get: () => this.#volume,
      set: (volume: number) => this.#setVolume(volume, this.#muted),
    });
    define("muted", {
      get: () => this.#muted,
      set: (muted: boolean) => this.#setVolume(this.#volume, Boolean(muted)),
    });
    define("duration", { get: () => this.#duration });
    define("buffered", { get: () => new Ranges(this.#buffered) });
    define("seekable", { get: () => new Ranges(this.#seekableRange()) });
    define("played", {
      get: () =>
        new Ranges(
          this.#playedFrom === null
            ? null
            : { start: this.#playedFrom, end: this.currentTime },
        ),
    });
    define("readyState", { get: () => this.#readyState });
    define("seeking", { get: () => this.#seeking });
    define("ended", { get: () => this.#ended });
    define("error", { get: () => null });
  }

  /** Give the element its own media interface back, with the volume and speed it has now. */
  uninstall(): void {
    if (!this.#installed) return;
    this.#installed = false;
    this.#stopTimeupdate();
    const video = this.#video as unknown as Record<string, unknown>;
    for (const name of TAKEN) delete video[name];
    this.#video.playbackRate = this.#rate;
    this.#video.volume = this.#volume;
    this.#video.muted = this.#muted;
  }

  /** How long the media is; Infinity for a live input, NaN before it is known. */
  setDuration(duration: number): void {
    if (Object.is(duration, this.#duration)) return;
    this.#duration = duration;
    this.#fire("durationchange");
    const pending = this.#pendingReady;
    this.#pendingReady = null;
    if (pending !== null) this.setReadyState(pending);
  }

  setBuffered(range: { start: number; end: number } | null): void {
    this.#buffered = range;
    this.#fire("progress");
  }

  /**
   * Move readyState, with the events a media element fires on the way up,
   * and `waiting` on the way down while playback is wanted. `loadedmetadata`
   * and `loadeddata` come once a load, as the element's do; the others again
   * after every fall, as after a seek.
   */
  setReadyState(state: Ready): void {
    // An element has its duration by the time it has metadata, and what
    // listens for `loadedmetadata` reads it: the state waits for it.
    if (state >= Ready.Metadata && Number.isNaN(this.#duration)) {
      this.#pendingReady = state;
      return;
    }
    this.#pendingReady = null;
    const was = this.#readyState;
    if (state === was) return;
    this.#readyState = state;
    if (state < was) {
      if (state < Ready.FutureData && was >= Ready.FutureData && !this.#paused)
        this.#fire("waiting");
      return;
    }
    if (!this.#loadedMetadata && state >= Ready.Metadata) {
      this.#loadedMetadata = true;
      this.#fire("loadedmetadata");
    }
    if (!this.#loadedData && state >= Ready.CurrentData) {
      this.#loadedData = true;
      this.#fire("loadeddata");
    }
    if (was < Ready.FutureData && state >= Ready.FutureData)
      this.#fire("canplay");
    if (was < Ready.EnoughData && state >= Ready.EnoughData)
      this.#fire("canplaythrough");
  }

  /** A seek's media is in place: `seeked`. */
  seeked(): void {
    if (!this.#seeking) return;
    this.#seeking = false;
    this.#fire("timeupdate");
    this.#fire("seeked");
  }

  /** The sound started playing at media time `media`. */
  soundStarted(media: number): void {
    // Reports keep coming while it plays, made when the sound is rendered,
    // which is ahead of what is heard; the position is only the fallback for
    // before the first of them is heard, and that is where it started.
    if (this.#running) return;
    this.#position = media;
    this.#running = true;
    this.#playedFrom ??= media;
    if (this.#paused) return;
    this.#fire("playing");
    this.#startTimeupdate();
  }

  /**
   * The sound stopped at media time `media`: run out (`waiting` follows from
   * the readyState the caller sets), paused, or at the end of the media.
   */
  soundStopped(media: number, ended: boolean): void {
    this.#position = media;
    this.#running = false;
    this.#stopTimeupdate();
    if (!ended) return;
    this.#ended = true;
    this.#fire("timeupdate");
    if (!this.#paused) {
      this.#paused = true;
      this.#fire("pause");
    }
    this.#fire("ended");
  }

  /** Where the media begins, for a load whose first media is later than zero. */
  place(time: number): void {
    if (this.#running || time <= this.#position) return;
    this.#position = time;
    this.#fire("timeupdate");
  }

  #seekTo(time: number): void {
    if (!Number.isFinite(time))
      throw new TypeError(`currentTime cannot be ${time}`);
    let target = Math.max(0, time);
    if (Number.isFinite(this.#duration))
      target = Math.min(target, this.#duration);
    this.#running = false;
    this.#stopTimeupdate();
    this.#ended = false;
    this.#seeking = true;
    this.#position = target;
    this.#fire("seeking");
    this.#fire("timeupdate");
    this.#handlers.seek(target);
  }

  async #play(): Promise<void> {
    if (this.#ended) this.#seekTo(0);
    if (this.#paused) {
      this.#paused = false;
      this.#fire("play");
      if (this.#readyState < Ready.FutureData) this.#fire("waiting");
    }
    if (!(await this.#handlers.resume())) {
      if (!this.#paused) {
        this.#paused = true;
        this.#fire("pause");
      }
      throw new DOMException(
        "the browser does not let sound start without the viewer's gesture",
        "NotAllowedError",
      );
    }
    // Paused again while the context was coming up.
    if (this.#paused) return;
    this.#handlers.play();
    if (this.#running) {
      this.#fire("playing");
      this.#startTimeupdate();
    }
  }

  #pause(): void {
    if (this.#paused) return;
    this.#position = this.currentTime;
    this.#running = false;
    this.#paused = true;
    this.#stopTimeupdate();
    this.#handlers.pause();
    this.#fire("timeupdate");
    this.#fire("pause");
  }

  #setRate(rate: number): void {
    if (!(rate >= MIN_RATE && rate <= MAX_RATE))
      throw new DOMException(
        `playbackRate ${rate} is outside ${MIN_RATE} to ${MAX_RATE}`,
        "NotSupportedError",
      );
    if (rate === this.#rate) return;
    this.#rate = rate;
    this.#handlers.rate(rate);
    this.#fire("ratechange");
  }

  #setVolume(volume: number, muted: boolean): void {
    if (!(volume >= 0 && volume <= 1))
      throw new DOMException(
        `volume ${volume} is outside 0 to 1`,
        "IndexSizeError",
      );
    if (volume === this.#volume && muted === this.#muted) return;
    this.#volume = volume;
    this.#muted = muted;
    this.#handlers.volume(this.gain);
    this.#fire("volumechange");
  }

  #seekableRange(): { start: number; end: number } | null {
    if (Number.isFinite(this.#duration))
      return { start: 0, end: this.#duration };
    return this.#buffered;
  }

  #startTimeupdate(): void {
    if (this.#timeupdate !== null) return;
    this.#timeupdate = setInterval(
      () => this.#fire("timeupdate"),
      TIMEUPDATE_INTERVAL_MS,
    );
  }

  #stopTimeupdate(): void {
    if (this.#timeupdate === null) return;
    clearInterval(this.#timeupdate);
    this.#timeupdate = null;
  }

  /** Fire `type` on the element once the code that caused it has run, as a media element does. */
  #fire(type: string): void {
    queueMicrotask(() => {
      if (this.#installed) this.#video.dispatchEvent(new Event(type));
    });
  }
}
