import type { Pictures } from "./video-frame.js";
/**
 * Tells the pictures of a video element apart by looking at them.
 *
 * Firefox gives no dependable notice of a new picture. The element's current
 * picture is replaced by the media sink on the audio clock, at a moment that
 * has nothing to do with the display's refresh. `mozPaintedFrames` counts
 * what the compositor has painted and trails that moment by up to a refresh,
 * so the picture read when the count goes up may already be the next one,
 * which the next count then delivers again while the picture between is
 * never read. requestVideoFrameCallback() names frames exactly but is not
 * called for every one of them. What can be relied on is the picture itself:
 * texImage2D() reads whichever one is current. Taking it on every refresh and
 * comparing it with the take before finds each picture exactly once, for as
 * long as a picture lasts at least a refresh.
 *
 * The comparison runs on the GPU and its result comes back through a pixel
 * buffer behind a fence. Reading it back at once would hold the calling
 * thread until the GPU process had caught up, on every refresh; measured in
 * Firefox that was about 3 ms against 0.3 ms this way. A verdict is therefore
 * known a refresh or more after its take, and the take keeps its texture
 * until then. A new picture hands that texture to the filter: reading the
 * element again by then could return a later picture.
 *
 * Two pictures with the same pixels cannot be told apart, and the second is
 * reported as no change.
 */
export declare class PictureWatch implements Pictures {
    #private;
    constructor(gl: WebGL2RenderingContext, video: HTMLVideoElement);
    take(): number | null;
    settle(): {
        id: number;
        changed: boolean;
    } | null;
    /**
     * Hand the texture of a take to the caller in exchange for one it no longer
     * needs, which becomes free for a later take.
     */
    adopt(id: number, replacement: WebGLTexture): WebGLTexture;
    release(id: number): void;
    reset(): void;
    destroy(): void;
}
//# sourceMappingURL=picture-watch.d.ts.map