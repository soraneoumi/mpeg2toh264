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
    mozTiming?: {
        periodMs: number;
        discontinuity: boolean;
    };
    /**
     * The take that holds this frame's picture, when it was found by watching
     * the element's pictures. It is adoptable only until the callback returns.
     */
    picture?: number;
}
/**
 * Takes of the element's current picture, one a refresh, each with a verdict
 * on whether it differs from the take before it. See PictureWatch.
 */
export interface Pictures {
    /** Take the current picture. Null when there is nowhere left to keep one. */
    take(): number | null;
    /** The oldest take not yet reported, once its verdict is known. */
    settle(): {
        id: number;
        changed: boolean;
    } | null;
    /** Let go of a reported take. Harmless when it has been adopted. */
    release(id: number): void;
    /** Forget every take. */
    reset(): void;
}
type FrameCallback = (now: number, metadata: FrameMetadata) => void;
export declare function supportsVideoFrames(): boolean;
/**
 * One outstanding, cancellable frame request. Prefer Firefox's counters even
 * when native rVFC exists: its notifications/mediaTime can advance in 40 ms
 * steps. Parsed/decoded frames include read-ahead, and presented frames are
 * accounted by the media sink separately from painting, so of the counters
 * only painted is followed; OR-ing them would ingest one picture repeatedly.
 *
 * The painted count says that there are new pictures and how often, but not
 * which picture the element holds when it is read: the two are out of step
 * by up to a refresh. Where the renderer can watch the pictures themselves
 * (`pictures`), that decides what is a new frame and the count only measures
 * the cadence. Without it, the count is all there is.
 *
 * https://searchfox.org/firefox-main/source/dom/media/mediaelement/HTMLVideoElement.cpp
 */
export declare class VideoFrames {
    #private;
    constructor(video: HTMLVideoElement, takeFrame?: () => VideoFrame | null | undefined, 
    /**
     * The watch to find Firefox's new pictures with, asked on every poll
     * because the renderer that owns it can change; null while there is none.
     */
    pictures?: () => Pictures | null);
    /** Whether acquisition uses the captured pictures' own timestamps. */
    get captureDriven(): boolean;
    request(callback: FrameCallback): void;
    cancel(): void;
    destroy(): void;
    /** Deliver pending input on the rendering window's refresh, before drawing. */
    flush(now: number): void;
}
export {};
//# sourceMappingURL=video-frame.d.ts.map