/// <reference lib="webworker" />

import {
  createWorkerDeinterlacer,
  type DeinterlaceStats,
  type Deinterlacer,
} from "./deinterlace.js";
import type {
  WorkerCommand,
  WorkerNotification,
  WorkerRenderingOptions,
  WorkerVideoState,
} from "./worker-protocol.js";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

/** The media element state read by the shared rendering engine. */
class WorkerVideo extends EventTarget {
  currentTime = 0;
  playbackRate = 1;
  seeking = false;
  paused = true;
  ended = false;
  readyState = 0;
  videoWidth = 0;
  videoHeight = 0;
  parentElement: HTMLElement | null = null;
  offsetWidth = 0;
  offsetHeight = 0;
  offsetLeft = 0;
  offsetTop = 0;
  #buffered: Array<{ start: number; end: number }> = [];

  /** Apply the page's state before processing a frame or media event. */
  update(state: WorkerVideoState): void {
    this.currentTime = state.currentTime;
    this.playbackRate = state.playbackRate;
    this.seeking = state.seeking;
    this.paused = state.paused;
    this.ended = state.ended;
    this.readyState = state.readyState;
    this.videoWidth = state.videoWidth;
    this.videoHeight = state.videoHeight;
    this.#buffered = state.buffered;
  }

  get buffered(): TimeRanges {
    return {
      length: this.#buffered.length,
      start: (index: number) => {
        const range = this.#buffered[index];
        if (!range)
          throw new DOMException("Invalid range index", "IndexSizeError");
        return range.start;
      },
      end: (index: number) => {
        const range = this.#buffered[index];
        if (!range)
          throw new DOMException("Invalid range index", "IndexSizeError");
        return range.end;
      },
    };
  }

  getVideoPlaybackQuality(): VideoPlaybackQuality {
    return {
      creationTime: performance.now(),
      droppedVideoFrames: 0,
      totalVideoFrames: 0,
      corruptedVideoFrames: 0,
    };
  }

  requestVideoFrameCallback(): number {
    return 0;
  }

  cancelVideoFrameCallback(): void {}
}

let video: WorkerVideo | null = null;
let deinterlacer: Deinterlacer | null = null;
let destroying = false;
const pictureIDs = new Map<ArrayBuffer, number>();

/** Run the shared engine's presentation loop on the Worker's animation frames. */
function requestWorkerAnimationFrame(callback: FrameRequestCallback): number {
  return workerScope.requestAnimationFrame(callback);
}

/** Cancel an animation frame requested from the Worker. */
function cancelWorkerAnimationFrame(handle: number): void {
  workerScope.cancelAnimationFrame(handle);
}

/** Send a notification through this module's Worker boundary. */
function post(
  notification: WorkerNotification,
  transfer: Transferable[] = [],
): void {
  workerScope.postMessage(notification, transfer);
}

/** Apply mutable settings through the public setters after initialization. */
function applySettings(
  renderer: Deinterlacer,
  options: WorkerRenderingOptions,
  retryFilm?: "film",
): void {
  renderer.doubleRate = options.doubleRate;
  renderer.spatialCheck = options.spatialCheck;
  // Only an explicit retry may re-arm an unchanged, degraded detector.
  if (renderer.film !== options.film || retryFilm === "film")
    renderer.film = options.film;
  renderer.debug = options.debug;
}

workerScope.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;
  try {
    if (command.type === "initialize") {
      if (typeof workerScope.requestAnimationFrame !== "function")
        throw new Error("requestAnimationFrame is unavailable in this Worker");
      video = new WorkerVideo();
      video.update(command.video);
      deinterlacer = createWorkerDeinterlacer(
        video as unknown as HTMLVideoElement,
        command.canvas,
        command.options,
        (message) => {
          if (!destroying) post({ type: "failed", message });
        },
        (visible) => post({ type: "visibility", visible }),
        requestWorkerAnimationFrame,
        cancelWorkerAnimationFrame,
      );
      // Buffers of decoded pictures go back with the id they came with.
      const engine = deinterlacer;
      engine.decodedVideo.onrelease = (data) => {
        const id = pictureIDs.get(data);
        pictureIDs.delete(data);
        if (id !== undefined && !destroying)
          post({ type: "release", id, data }, [data]);
      };
      let filmFailure = 0;
      deinterlacer.addEventListener("failure", () => filmFailure++);
      deinterlacer.addEventListener("stats", (statsEvent) => {
        const { dropped: _dropped, ...stats } = statsEvent.detail;
        post({ type: "stats", stats, filmFailure });
      });
      deinterlacer.scan = command.scan;
      deinterlacer.videoTimeline = command.videoTimeline;
      deinterlacer.enabled = command.enabled;
      post({ type: "ready" });
      return;
    }
    if (!video || !deinterlacer) return;
    switch (command.type) {
      case "frame":
        video.update(command.video);
        try {
          // `now` is the ingestion time on the Worker's clock, used as the
          // queue's current time. The display time stays on the acquisition
          // clock and is translated by the renderer using timeOrigin.
          // Keeping it intact keeps transfer latency out of the schedule.
          deinterlacer.ingestExternalFrame(
            performance.now(),
            command.metadata,
            command.frame,
          );
        } finally {
          command.frame.close();
          post({ type: "consumed", id: command.id });
        }
        break;
      case "settings":
        applySettings(deinterlacer, command.options, command.retryFilm);
        break;
      case "scan":
        deinterlacer.scan = command.scan;
        break;
      case "timeline":
        deinterlacer.videoTimeline = command.videoTimeline;
        break;
      case "enabled":
        deinterlacer.enabled = command.enabled;
        break;
      case "running":
        if (command.running) deinterlacer.start();
        else deinterlacer.stop();
        break;
      case "picture":
        pictureIDs.set(command.picture.data, command.id);
        deinterlacer.decodedVideo.push(command.picture);
        break;
      case "pictures":
        if (command.action === "reset") deinterlacer.decodedVideo.reset();
        else deinterlacer.decodedVideo.finish();
        break;
      case "clock":
        video.update(command.video);
        deinterlacer.observeMediaClock(command.at, command.timeOrigin);
        break;
      case "pageVisibility":
        deinterlacer.observePageVisibility(command.hidden);
        break;
      case "event":
        video.update(command.video);
        video.dispatchEvent(new Event(command.name));
        break;
      case "capture":
        video.videoWidth = command.width;
        video.videoHeight = command.height;
        // Just after a seek there may be no picture to redraw. Return null
        // so the page captures the actual video element instead.
        void deinterlacer
          .capture()
          .then((image) =>
            post({ type: "capture", id: command.id, image }, [image]),
          )
          .catch(() => post({ type: "capture", id: command.id, image: null }));
        break;
      case "destroy":
        destroying = true;
        deinterlacer.destroy();
        deinterlacer = null;
        video = null;
        workerScope.close();
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({ type: "failed", message });
  }
};
