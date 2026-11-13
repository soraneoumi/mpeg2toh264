export interface FrameMetadata {
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
  expectedDisplayTime: number;
  /**
   * `performance.timeOrigin` of the realm `now` and `expectedDisplayTime` were
   * measured against.
   *
   * There is more than one candidate. requestVideoFrameCallback() reports on
   * the clock of the window that owns the video node, which a document
   * picture-in-picture move replaces; the counter path below times its own
   * polling, on this module's realm. A consumer on a third clock -- the
   * rendering Worker -- cannot tell them apart, so each acquisition says which
   * it used and the timestamps stay convertible.
   */
  timeOrigin: number;
  /** The frame for this notification, valid only until the callback returns. */
  frame?: VideoFrame;
  /** Firefox counters supply identity and wall-clock cadence, not a frame PTS. */
  mozTiming?: { periodMs: number; discontinuity: boolean };
  /**
   * The take that holds this frame's picture. Set when the frame was found by
   * comparing the element's pictures. It can be adopted only until the
   * callback returns.
   */
  picture?: number;
}

/**
 * Takes of the element's current picture, one per refresh. Each take has a
 * result saying whether it differs from the previous take. See PictureWatch.
 */
export interface Pictures {
  /** Take the current picture. Null when no texture is available. */
  take(): number | null;
  /** Report the oldest unreported take, once its result is known. */
  settle(): { id: number; changed: boolean } | null;
  /** Release a reported take. Has no effect if it was already adopted. */
  release(id: number): void;
  /** Discard every take. */
  reset(): void;
}

/** What requestVideoFrameCallback() itself reports; it supplies more. */
type NativeFrameMetadata = Omit<FrameMetadata, "timeOrigin" | "mozTiming">;

type FrameCallback = (now: number, metadata: FrameMetadata) => void;

interface MozVideo extends HTMLVideoElement {
  readonly mozParsedFrames: number;
  readonly mozDecodedFrames: number;
  readonly mozPresentedFrames: number;
  readonly mozPaintedFrames: number;
}

const COUNTERS = [
  "mozParsedFrames",
  "mozDecodedFrames",
  "mozPresentedFrames",
  "mozPaintedFrames",
] as const;

function hasMozFrames(video: HTMLVideoElement): video is MozVideo {
  return COUNTERS.every((name) => name in video);
}

/**
 * The clock requestVideoFrameCallback() reports on: the one belonging to the
 * window that owns the video node, which is not this module's realm once a
 * document picture-in-picture window has adopted the element.
 */
function acquisitionTimeOrigin(video: HTMLVideoElement): number {
  return (
    video.ownerDocument?.defaultView?.performance.timeOrigin ??
    performance.timeOrigin
  );
}

export function supportsVideoFrames(): boolean {
  return (
    typeof HTMLVideoElement !== "undefined" &&
    (hasMozFrames(HTMLVideoElement.prototype) ||
      typeof HTMLVideoElement.prototype.requestVideoFrameCallback ===
        "function")
  );
}

/** Average across several refreshes instead of mistaking 60 Hz jitter for 60p. */
const MEASURE_MS = 250;
const STALL_MS = 500;

/**
 * Minimum gap between two new pictures, in frame periods, that counts as more
 * than one frame. Sampling once per refresh shifts an interval by up to one
 * refresh in either direction. For a picture lasting two refreshes that is
 * half a period, while a skipped frame adds a whole period.
 */
const SKIPPED_FRAME_PERIODS = 1.75;

/** Consecutive unchanged takes after which taking stops while the element is at rest. */
const SETTLED_STILLS = 3;

/**
 * Media time, in milliseconds, after which an unchanged picture is delivered
 * anyway during playback. Well below the half second after which the renderer
 * treats a frame as a jump in the stream.
 */
const STILL_REFRESH_MS = 200;

/**
 * One outstanding, cancellable frame request. Prefer Firefox's counters even
 * when native rVFC exists: its notifications/mediaTime can advance in 40 ms
 * steps. Parsed/decoded frames include read-ahead, and presented frames are
 * accounted by the media sink separately from painting. Only the painted
 * count is followed, because OR-ing the counters would ingest one picture
 * repeatedly.
 *
 * The painted count shows that there are new pictures and how often, but not
 * which picture the element holds when it is read. The two can be out of step
 * by up to one refresh. When a PictureWatch is available (`pictures`), it
 * decides which frames are new and the painted count only measures the
 * cadence. Without one, the painted count alone decides.
 *
 * https://searchfox.org/firefox-main/source/dom/media/mediaelement/HTMLVideoElement.cpp
 */
export class VideoFrames {
  readonly #video: HTMLVideoElement;
  readonly #moz: MozVideo | null;
  readonly #pictures: (() => Pictures | null) | undefined;
  /** The watch that owns the takes in #taken. */
  #watch: Pictures | null = null;
  /** Takes whose results are pending, oldest first. */
  #taken: {
    id: number;
    at: number;
    mediaTime: number;
    width: number;
    height: number;
    /** Whether the element was paused or ended when the take was made. */
    resting: boolean;
  }[] = [];
  /** Frame count on the picture-watching path, reported as `presentedFrames`. */
  #frames = 0;
  #polledAt: number | null = null;
  /** Consecutive unchanged results for takes made at rest. */
  #stills = 0;
  /** When the last delivered take was made, and the painted count when it was delivered. */
  #deliveredAt: number | null = null;
  #paintedAtFrame: number | null = null;
  #handle: number | null = null;
  #callback: FrameCallback | null = null;
  #counters: number[] | null = null;
  #painted: number | null = null;
  #discontinuity = true;
  #lastAt: number | null = null;
  #sample: { at: number; frames: number } | null = null;
  #periodMs = 0;
  readonly #canCapture: boolean;
  #capture: boolean;
  #captureTimer: (() => void) | null = null;
  #captureDocument: Document | null = null;
  #nativeHandle: number | null = null;
  #capturedTimestamp: number | null = null;
  #captureCount = 0;
  #captureDeltas: number[] = [];
  #pending: {
    frame: VideoFrame;
    at: number;
    count: number;
  }[] = [];

  constructor(
    video: HTMLVideoElement,
    /**
     * Returns the PictureWatch used to find Firefox's new pictures, or null
     * when there is none. Called on every poll because the renderer that owns
     * the watch can change.
     */
    pictures?: () => Pictures | null,
  ) {
    this.#video = video;
    this.#pictures = pictures;
    this.#moz = hasMozFrames(video) ? video : null;
    // Firefox 156 reports VideoFrame(video).timestamp in integer seconds, so
    // captures cannot identify distinct pictures at any playback rate.
    this.#canCapture = this.#moz === null && typeof VideoFrame !== "undefined";
    this.#capture = this.#canCapture && video.playbackRate > 1;
    if (this.#moz) {
      for (const event of ["emptied", "seeking", "seeked"])
        video.addEventListener(event, this.#reset);
      for (const event of ["pause", "playing", "waiting", "ratechange"])
        video.addEventListener(event, this.#resetTiming);
    }
    if (this.#canCapture) {
      // Suspend acquisition while paused and request fresh frames after seeking or resuming.
      for (const event of [
        "loadeddata",
        "playing",
        "pause",
        "ended",
        "seeking",
        "seeked",
        "emptied",
        "ratechange",
      ])
        video.addEventListener(event, this.#captureChanged);
    }
  }

  /** Whether acquisition uses the captured pictures' own timestamps. */
  get captureDriven(): boolean {
    return this.#capture;
  }

  request(callback: FrameCallback): void {
    if (this.#callback !== null) return;
    this.#callback = callback;
    if (this.#capture) {
      this.#armCapture();
      return;
    }
    this.#handle = this.#moz
      ? requestAnimationFrame(this.#poll)
      : this.#video.requestVideoFrameCallback(this.#present);
  }

  cancel(): void {
    if (this.#handle !== null) {
      if (this.#moz) cancelAnimationFrame(this.#handle);
      else this.#video.cancelVideoFrameCallback(this.#handle);
    }
    this.#handle = null;
    this.#callback = null;
    this.#captureTimer?.();
    this.#captureTimer = null;
    if (this.#nativeHandle !== null)
      this.#video.cancelVideoFrameCallback(this.#nativeHandle);
    this.#nativeHandle = null;
    this.#clearCaptured();
    this.#capturedTimestamp = null;
    this.#captureDeltas = [];
    this.#capture = this.#canCapture && this.#video.playbackRate > 1;
    this.#reset();
  }

  destroy(): void {
    this.cancel();
    for (const event of ["emptied", "seeking", "seeked"])
      this.#video.removeEventListener(event, this.#reset);
    for (const event of ["pause", "playing", "waiting", "ratechange"])
      this.#video.removeEventListener(event, this.#resetTiming);
    for (const event of [
      "loadeddata",
      "playing",
      "pause",
      "ended",
      "seeking",
      "seeked",
      "emptied",
      "ratechange",
    ])
      this.#video.removeEventListener(event, this.#captureChanged);
  }

  /** Deliver pending input on the rendering window's refresh, before drawing. */
  flush(now: number): void {
    if (!this.#capture) return;
    if (this.#video.ownerDocument !== this.#captureDocument) {
      this.#captureTimer?.();
      this.#captureTimer = null;
      this.#armCapture();
    }
    while (this.#pending.length > 0 && this.#callback !== null) {
      const captured = this.#pending.shift()!;
      const frame = captured.frame;
      try {
        this.#deliver(now, {
          width: frame.visibleRect?.width ?? frame.codedWidth,
          height: frame.visibleRect?.height ?? frame.codedHeight,
          mediaTime: frame.timestamp / 1e6,
          presentedFrames: captured.count,
          // A picture held until this refresh is scheduled no earlier than now.
          expectedDisplayTime: Math.max(captured.at, now),
          timeOrigin: performance.timeOrigin,
          frame,
        });
      } finally {
        // The receiver has cloned any frame sent to a Worker, so the original can now be closed.
        frame.close();
      }
    }
  }

  #clearCaptured(): void {
    for (const captured of this.#pending) captured.frame.close();
    this.#pending = [];
  }

  #captureChanged = (event: Event): void => {
    const capture = this.#canCapture && this.#video.playbackRate > 1;
    if (capture !== this.#capture) {
      const callback = this.#callback;
      this.cancel();
      this.#capture = capture;
      if (callback !== null) this.request(callback);
      return;
    }
    if (["seeking", "seeked", "emptied", "ratechange"].includes(event.type)) {
      this.#capturedTimestamp = null;
      this.#captureDeltas = [];
    }
    if (!this.#capture) return;
    if (event.type === "pause" || event.type === "ended")
      this.flush(performance.now());
    this.#clearCaptured();
    this.#captureTimer?.();
    this.#captureTimer = null;
    if (this.#callback !== null) this.#armCapture();
  };

  #armCapture(): void {
    if (
      !this.#capture ||
      this.#captureTimer !== null ||
      this.#callback === null
    )
      return;
    if (
      (this.#video.paused || this.#video.ended) &&
      this.#capturedTimestamp !== null
    )
      return;
    if (
      this.#nativeHandle === null &&
      typeof this.#video.requestVideoFrameCallback === "function"
    )
      this.#nativeHandle = this.#video.requestVideoFrameCallback(
        this.#capturePresented,
      );
    // At up to 1.25x, capture the video element frequently enough to retain briefly available frames.
    const interval = Math.max(4, 8 / Math.max(1, this.#video.playbackRate));
    // After a picture-in-picture move, use the new window's timer to continue acquisition.
    // Cancel through the same window to avoid inheriting throttling from the hidden original window.
    const owner = this.#video.ownerDocument?.defaultView;
    this.#captureDocument = this.#video.ownerDocument;
    if (owner) {
      const handle = owner.setTimeout(this.#captureFrame, interval);
      this.#captureTimer = () => owner.clearTimeout(handle);
    } else {
      const handle = setTimeout(this.#captureFrame, interval);
      this.#captureTimer = () => clearTimeout(handle);
    }
  }

  #capturePresented = (): void => {
    this.#nativeHandle = null;
    this.#captureTimer?.();
    this.#captureTimer = null;
    this.#captureFrame();
  };

  #captureFrame = (): void => {
    this.#captureTimer = null;
    const video = this.#video;
    if (this.#callback === null) return;
    if (video.readyState < 2 || video.seeking) {
      this.#armCapture();
      return;
    }
    let frame: VideoFrame;
    try {
      frame = new VideoFrame(video);
    } catch (error) {
      // Immediately after loading, a frame may become available later than readyState indicates.
      if (
        !(error instanceof DOMException) ||
        error.name !== "InvalidStateError"
      )
        throw error;
      this.#armCapture();
      return;
    }
    if (frame.timestamp === this.#capturedTimestamp) {
      frame.close();
    } else {
      let steps = 1;
      if (this.#capturedTimestamp !== null) {
        const delta = frame.timestamp - this.#capturedTimestamp;
        if (delta > 1000 && delta < 250000) {
          // Count missing input from the median timestamp delta, independently of playback speed.
          this.#captureDeltas.push(delta);
          if (this.#captureDeltas.length > 7) this.#captureDeltas.shift();
        }
        if (delta > 0 && this.#captureDeltas.length > 0) {
          // Use the previously measured input period to count missing frames
          // across a long gap between captures.
          const ordered = [...this.#captureDeltas].sort((a, b) => a - b);
          const period = ordered[Math.floor(ordered.length / 2)]!;
          steps = Math.max(1, Math.round(delta / period));
        }
      }
      this.#capturedTimestamp = frame.timestamp;
      this.#captureCount += steps;
      this.#pending.push({
        frame,
        at: performance.now(),
        count: this.#captureCount,
      });
      // After a long rendering stall, retain the newest frames and signal losses through the counter gap.
      while (this.#pending.length > 4) this.#pending.shift()!.frame.close();
    }
    this.#armCapture();
  };

  #resetTiming = (): void => {
    this.#lastAt = null;
    this.#sample = null;
    this.#periodMs = 0;
  };

  #reset = (): void => {
    this.#counters = null;
    this.#painted = null;
    this.#discontinuity = true;
    this.#forgetTakes();
    this.#resetTiming();
  };

  /** Discard all takes. The next take has no reference to compare with. */
  #forgetTakes(): void {
    this.#watch?.reset();
    this.#taken = [];
    this.#stills = 0;
  }

  /** Native acquisition: pass the report on, with the clock it was made on. */
  #present = (now: number, metadata: NativeFrameMetadata): void => {
    this.#deliver(now, {
      width: metadata.width,
      height: metadata.height,
      mediaTime: metadata.mediaTime,
      presentedFrames: metadata.presentedFrames,
      expectedDisplayTime: metadata.expectedDisplayTime,
      timeOrigin: acquisitionTimeOrigin(this.#video),
    });
  };

  #deliver = (now: number, metadata: FrameMetadata): void => {
    const callback = this.#callback;
    this.#handle = null;
    this.#callback = null;
    callback?.(now, metadata);
  };

  #poll = (now: number): void => {
    const video = this.#moz!;
    const counters = COUNTERS.map((name) => video[name]);
    if (this.#counters?.some((value, i) => counters[i]! < value)) this.#reset();
    this.#counters = counters;
    const watch = this.#pictures?.() ?? null;
    if (watch !== this.#watch) {
      // Takes are textures owned by the renderer that made them, and the
      // counter path tracks the last picture differently.
      this.#reset();
      this.#watch = watch;
    }
    const painted = video.mozPaintedFrames;
    const ready =
      !video.seeking &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0;
    // A paused first/seeked frame may be drawable before it has been painted.
    // Accept it once; decode read-ahead alone never drives ongoing playback.
    const first =
      this.#painted === null &&
      (painted > 0 ||
        (video.paused &&
          (video.mozPresentedFrames > 0 || video.mozDecodedFrames > 0)));
    if (watch !== null) {
      this.#pollPictures(now, video, watch, ready, first);
      return;
    }
    if (
      ready &&
      (first || (this.#painted !== null && painted !== this.#painted))
    ) {
      if (this.#lastAt !== null && now - this.#lastAt > STALL_MS) {
        this.#resetTiming();
        this.#discontinuity = true;
      }
      this.#measurePeriod(now, video);
      this.#lastAt = now;
      this.#painted = painted;
      const discontinuity = this.#discontinuity;
      this.#discontinuity = false;
      this.#deliver(now, {
        width: video.videoWidth,
        height: video.videoHeight,
        // Used only to select source scan/size metadata on the media timeline.
        // It is deliberately NOT used as the frame identity or field clock.
        mediaTime: video.currentTime,
        presentedFrames: painted,
        // The counters report no display time. The poll that found the frame
        // is the best stand-in, and it was taken on this module's clock --
        // not the video node's window, which may be a different one.
        expectedDisplayTime: now,
        timeOrigin: performance.timeOrigin,
        mozTiming: { periodMs: this.#periodMs, discontinuity },
      });
    } else {
      this.#handle = requestAnimationFrame(this.#poll);
    }
  };

  /** Update the cadence estimate from the painted count. Called on a poll where the count advanced. */
  #measurePeriod(now: number, video: MozVideo): void {
    if (video.paused || video.ended) return;
    const painted = video.mozPaintedFrames;
    const sample = this.#sample;
    if (sample && now - sample.at >= MEASURE_MS) {
      const frames = painted - sample.frames;
      if (frames > 0) {
        const period = (now - sample.at) / frames;
        if (period >= 4 && period <= 200) {
          this.#periodMs = this.#periodMs
            ? this.#periodMs + (period - this.#periodMs) * 0.25
            : period;
        }
      }
      this.#sample = null;
    }
    this.#sample ??= { at: now, frames: painted };
  }

  /**
   * Poll that finds new frames by comparing pictures. Every refresh takes the
   * element's picture. A take is delivered once its result is known, one or
   * more refreshes after it was made.
   */
  #pollPictures(
    now: number,
    video: MozVideo,
    watch: Pictures,
    ready: boolean,
    first: boolean,
  ): void {
    const painted = video.mozPaintedFrames;
    const paintedMoved = this.#painted !== null && painted !== this.#painted;
    // Polling stopped for a while, for example in a background tab. The
    // pending takes belong to an earlier playback position, so discard them.
    if (this.#polledAt !== null && now - this.#polledAt > STALL_MS) {
      this.#forgetTakes();
      this.#resetTiming();
      this.#discontinuity = true;
    }
    this.#polledAt = now;
    if (paintedMoved) this.#measurePeriod(now, video);
    const resting = video.paused || video.ended;
    if (!resting || paintedMoved) this.#stills = 0;
    // Time at rest is not playback time of a still scene.
    if (resting && this.#deliveredAt !== null) this.#deliveredAt = now;
    // An element at rest keeps its picture until a seek or a paint changes it,
    // so once enough takes are unchanged there is nothing more to upload.
    const settled = resting && this.#stills >= SETTLED_STILLS;
    // Start taking under the same condition as the counter path's first frame,
    // and keep taking while the element can be read.
    if (ready && (first || this.#painted !== null)) {
      this.#painted = painted;
      const id = settled ? null : watch.take();
      if (id !== null)
        this.#taken.push({
          id,
          at: now,
          mediaTime: video.currentTime,
          width: video.videoWidth,
          height: video.videoHeight,
          resting,
        });
    }
    // Normally one result is ready, for the previous take. When several arrive
    // together, the newest changed picture among them is the frame. The older
    // ones are already late, and delivering them would keep every later frame
    // equally late.
    let found = null;
    for (
      let verdict = watch.settle();
      verdict !== null;
      verdict = watch.settle()
    ) {
      const taken = this.#taken.shift();
      if (taken?.id !== verdict.id)
        throw new Error("picture verdicts arrived out of order");
      let frame = verdict.changed;
      if (frame) {
        this.#stills = 0;
      } else {
        this.#stills = taken.resting ? this.#stills + 1 : 0;
        // A frame with the same pixels as the previous one is reported as
        // unchanged and looks like no frame. While the compositor is still
        // painting, deliver one periodically anyway. Otherwise the renderer
        // treats the first frame after a long still as a jump in the stream
        // and discards its history.
        frame =
          found === null &&
          !taken.resting &&
          this.#deliveredAt !== null &&
          (taken.at - this.#deliveredAt) * (video.playbackRate || 1) >=
            STILL_REFRESH_MS &&
          painted !== this.#paintedAtFrame;
      }
      if (!frame) {
        watch.release(taken.id);
        continue;
      }
      if (found !== null) watch.release(found.id);
      found = taken;
    }
    if (found === null) {
      this.#handle = requestAnimationFrame(this.#poll);
      return;
    }
    let frames = 1;
    if (this.#lastAt !== null) {
      const elapsed = found.at - this.#lastAt;
      if (elapsed > STALL_MS) {
        this.#resetTiming();
        this.#discontinuity = true;
      } else if (
        this.#periodMs > 0 &&
        elapsed > this.#periodMs * SKIPPED_FRAME_PERIODS
      ) {
        // The frames in between were not seen. They were shown and replaced
        // between two refreshes, or had the same pixels as the previous frame.
        frames = Math.round(elapsed / this.#periodMs);
      }
    }
    this.#frames += frames;
    this.#lastAt = found.at;
    this.#deliveredAt = found.at;
    this.#paintedAtFrame = painted;
    const discontinuity = this.#discontinuity;
    this.#discontinuity = false;
    try {
      this.#deliver(now, {
        width: found.width,
        height: found.height,
        // As on the counter path, this only places the frame on the media
        // timeline. It is the clock value when the picture was taken.
        mediaTime: found.mediaTime,
        presentedFrames: this.#frames,
        // The picture is delivered now, not when it was taken, and the
        // schedule is anchored to the delivery time.
        expectedDisplayTime: now,
        timeOrigin: performance.timeOrigin,
        mozTiming: { periodMs: this.#periodMs, discontinuity },
        picture: found.id,
      });
    } finally {
      watch.release(found.id);
    }
  }
}
