/**
 * Page-side types needed to check the shared rendering engine in a Worker.
 *
 * At runtime the Worker uses ExternalRenderingHost and WorkerVideo, so it
 * never enters the branches that manipulate the DOM. Declare only what the
 * shared source refers to, keeping the standard page and Worker libraries
 * in separate TypeScript programs.
 */

interface TimeRanges {
  readonly length: number;
  start(index: number): number;
  end(index: number): number;
}

interface VideoPlaybackQuality {
  readonly creationTime: number;
  readonly droppedVideoFrames: number;
  readonly totalVideoFrames: number;
  readonly corruptedVideoFrames: number;
}

interface WorkerElementStyle {
  cssText: string;
  visibility: string;
  left: string;
  top: string;
  width: string;
  height: string;
  aspectRatio: string;
}

/**
 * The window of the document an element is in: its clock, and the animation
 * frames it serves. Both change under the deinterlacer when a document
 * picture-in-picture window adopts the element.
 */
interface WindowLike {
  readonly performance: { readonly timeOrigin: number };
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  setTimeout(callback: () => void, milliseconds: number): number;
  clearTimeout(handle: number): void;
}

interface HTMLElement extends EventTarget {
  readonly ownerDocument: Document | null;
  readonly parentElement: HTMLElement | null;
  readonly offsetWidth: number;
  readonly offsetHeight: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly style: WorkerElementStyle;
  appendChild<T extends HTMLElement>(node: T): T;
  insertBefore<T extends HTMLElement>(node: T, child: HTMLElement | null): T;
  remove(): void;
}

interface HTMLCanvasElement extends HTMLElement, OffscreenCanvas {
  className: string;
  transferControlToOffscreen(): OffscreenCanvas;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
  replaceWith(...nodes: HTMLElement[]): void;
}

declare var HTMLCanvasElement: {
  readonly prototype: HTMLCanvasElement;
};

interface HTMLVideoElement extends HTMLElement, VideoFrame {
  currentTime: number;
  playbackRate: number;
  readonly seeking: boolean;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly readyState: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly buffered: TimeRanges;
  getVideoPlaybackQuality?(): VideoPlaybackQuality;
  requestVideoFrameCallback(
    callback: (
      now: DOMHighResTimeStamp,
      metadata: import("./video-frame.js").FrameMetadata,
    ) => void,
  ): number;
  cancelVideoFrameCallback(handle: number): void;
}

declare var HTMLVideoElement: {
  readonly prototype: HTMLVideoElement;
};

interface ResizeObserver {
  observe(target: HTMLElement): void;
  disconnect(): void;
}

declare var ResizeObserver: {
  new (callback: () => void): ResizeObserver;
};

interface MutationObserver {
  observe(
    target: Document,
    options: { childList: boolean; subtree: boolean },
  ): void;
  disconnect(): void;
}

declare var MutationObserver: {
  new (callback: () => void): MutationObserver;
};

interface Document {
  readonly defaultView: WindowLike | null;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
  createElement(tagName: "canvas"): HTMLCanvasElement;
  createElement(tagName: "div"): HTMLElement;
}

declare var document: Document;
