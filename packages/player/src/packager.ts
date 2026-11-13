/**
 * The WebAssembly `Session`, plus the arithmetic for reporting how fast it is.
 *
 * There is no pipeline here: demux, GOP splitting, muxing and the timeline all
 * live inside the `Session`. This is the bookkeeping around it.
 */
import init, {
  firstTimestamp as wasmFirstTimestamp,
  lastTimestamp as wasmLastTimestamp,
  PictureDecoder,
  Session,
  type AudioStream,
  type DecodedPictureInfo,
  type Fragment,
} from "../wasm/mpeg2toh264_wasm.js";
import type { Stats, VideoMode } from "./protocol.js";

export { PictureDecoder };
export type { AudioStream, DecodedPictureInfo, Fragment };

/** A unit of MPEG-2 handed out in decode mode. */
export type VideoFragment = Extract<Fragment, { kind: "video" }>;

/** Where the `.wasm` sits relative to this module, when no caller says. */
const DEFAULT_WASM_URL = new URL(
  "../wasm/mpeg2toh264_wasm_bg.wasm",
  import.meta.url,
);

let loaded: { url: string; ready: Promise<void> } | null = null;

/** Instantiate the module once per worker, however many loads run through it. */
export function loadWasm(wasmUrl: string | null): Promise<void> {
  const url = wasmUrl ?? DEFAULT_WASM_URL.href;
  if (loaded?.url !== url) loaded = { url, ready: compileAndInit(url) };
  return loaded.ready;
}

async function compileAndInit(url: string): Promise<void> {
  await init({ module_or_path: await compile(url) });
}

async function compile(url: string): Promise<WebAssembly.Module> {
  try {
    return await WebAssembly.compileStreaming(fetch(url));
  } catch {
    // Streaming compilation insists on an `application/wasm` content type, and
    // not every way of serving this sets one. Reading the bytes first works
    // whatever the server says they are.
    const response = await fetch(url);
    return WebAssembly.compile(await response.arrayBuffer());
  }
}

/**
 * The last presentation timestamp in a slice of transport stream, in 90 kHz
 * ticks, or null when it holds none. Read from the end of a file, this is
 * where the file ends. Needs `loadWasm` first, like everything else here.
 */
export function lastTimestamp(data: Uint8Array): number | null {
  return wasmLastTimestamp(data) ?? null;
}

/**
 * The first presentation timestamp in a slice, in 90 kHz ticks, or null when
 * it holds none. This is what time it is at the byte the slice was read from.
 */
export function firstTimestamp(data: Uint8Array): number | null {
  return wasmFirstTimestamp(data) ?? null;
}

export class Packager {
  #session: Session;
  /** Whether the pictures are decoded elsewhere; see `countDecoded`. */
  readonly #decode: boolean;
  /** The session's own time in decode mode, which the rates leave out. */
  #intervalSessionMs = 0;
  #decodeFailures = 0;
  #totalMs = 0;
  #totalFrames = 0;
  #intervalMs = 0;
  #intervalFrames = 0;
  #videoFrames = 0;
  #audioFrames = 0;

  /**
   * `originTicks` measures the timeline from a timestamp the caller names,
   * rather than from wherever this input opens, which is what lets a stream
   * that starts mid-file be appended where it belongs.
   *
   * `serviceId` takes one named service out of a transport stream carrying
   * several; null takes the first that turns up with a picture in it.
   *
   * `video` is what becomes of the pictures; see `VideoMode`.
   *
   * `splitFieldSamples` and `splitGroups` shape the passthrough fragments and
   * change nothing in decode mode. `splitGroups` makes a fragment of each anchor picture and the B pictures
   * coded after it, instead of one of each whole group of pictures, so that
   * media reaches the buffer as soon as it has arrived.
   */
  constructor(
    recoveryInterval: number | undefined,
    originTicks: number | null,
    serviceId: number | null,
    splitFieldSamples: boolean | undefined,
    video: VideoMode,
    openGopRecovery: "recovery-point" | "discard" | undefined = undefined,
    splitGroups = false,
  ) {
    this.#decode = video === "decode";
    this.#session = new Session(
      originTicks,
      serviceId,
      recoveryInterval,
      splitFieldSamples,
      video,
      openGopRecovery,
      splitGroups,
    );
  }

  /** The timestamp presentation time zero stands for, once a fragment fixed it. */
  get originTicks(): number | null {
    return this.#session.originTicks ?? null;
  }

  /** The service being packaged, once a program map has named it. */
  get serviceId(): number | null {
    return this.#session.serviceId ?? null;
  }

  /** Every service this transport stream announced, in the order it did. */
  get serviceIds(): number[] {
    return Array.from(this.#session.serviceIds);
  }

  /** Every sound stream the chosen service offers, as its map describes them. */
  get audioStreams(): AudioStream[] {
    return Array.from(this.#session.audioStreams);
  }

  /** Which of them the fragments are being made from. */
  get audioPid(): number | null {
    return this.#session.audioPid ?? null;
  }

  /**
   * Whether the sound being read carries two services in one stream rather
   * than a stereo pair, as the frames read so far had it.
   */
  get audioIsDualMono(): boolean {
    return this.#session.audioIsDualMono;
  }

  /**
   * Take the sound from another of the service's streams, from the next
   * fragment on. What is already converted keeps the sound it was made with.
   */
  selectAudio(pid: number): void {
    this.#session.selectAudio(pid);
  }

  /** The same within a dual-mono stream, where the choice is the other channel. */
  selectDualMono(sub: boolean): void {
    this.#session.selectDualMono(sub);
  }

  /**
   * Raise the sound in steps of 2^(1/4), about 1.5 dB each: 4 doubles it.
   * `surround` is the step for more than two channels.
   */
  setAudioGain(stereo: number, surround: number): void {
    this.#session.setAudioGain(stereo, surround);
  }

  async push(chunk: Uint8Array): Promise<Fragment[]> {
    return this.#timed(() => this.#session.push(chunk));
  }

  async finish(): Promise<Fragment[]> {
    return this.#timed(() => this.#session.finish());
  }

  /**
   * Count pictures decoded in decode mode, the time it took and the units
   * that failed: these are what the rates and the errors describe there.
   */
  countDecoded(pictures: number, ms: number, failures: number): void {
    this.#decodeFailures += failures;
    this.#totalMs += ms;
    this.#intervalMs += ms;
    this.#videoFrames += pictures;
    this.#totalFrames += pictures;
    this.#intervalFrames += pictures;
  }

  /** Rust memory, so dropping the reference would not be enough. */
  free(): void {
    this.#session.free();
  }

  /**
   * The rate since the last call, and overall. Null until a frame has been
   * converted, because before that there is nothing to divide by.
   *
   * `loop` is the caller's own account of the time it spent around the calls
   * to this object, which goes out with the rate so that one report says where
   * all of the wall time went.
   */
  takeStats(loop: { readingMs: number; waitingMs: number }): Stats | null {
    if (this.#intervalFrames === 0 || this.#totalMs === 0) return null;
    const stats: Stats = {
      instantFps: (this.#intervalFrames * 1000) / this.#intervalMs,
      totalFps: (this.#totalFrames * 1000) / this.#totalMs,
      videoFrames: this.#videoFrames,
      audioFrames: this.#audioFrames,
      convertingMs: this.#intervalMs + this.#intervalSessionMs,
      readingMs: loop.readingMs,
      waitingMs: loop.waitingMs,
      dropped: this.#session.dropped,
      scrambled: this.#session.scrambled,
      errors: this.#session.errors + this.#decodeFailures,
    };
    this.#intervalMs = 0;
    this.#intervalSessionMs = 0;
    this.#intervalFrames = 0;
    return stats;
  }

  #timed(run: () => Fragment[]): Fragment[] {
    const started = performance.now();
    const fragments = run();
    const elapsed = performance.now() - started;
    if (this.#decode) this.#intervalSessionMs += elapsed;
    else {
      this.#totalMs += elapsed;
      this.#intervalMs += elapsed;
    }
    this.#account(fragments);
    return fragments;
  }

  /** Count what a batch of fragments carried. */
  #account(fragments: Fragment[]): void {
    let videoFrames = 0;
    for (const fragment of fragments) {
      if (fragment.kind !== "media") continue;
      videoFrames += fragment.videoSamples;
      this.#audioFrames += fragment.audioSamples;
    }
    this.#videoFrames += videoFrames;
    this.#totalFrames += videoFrames;
    this.#intervalFrames += videoFrames;
  }
}

/**
 * The fragment's bytes are a copy wasm-bindgen made for us, so no one else
 * holds the buffer: it can be transferred rather than copied a second time.
 */
export function detach(fragment: Fragment): ArrayBuffer {
  return fragment.data.buffer as ArrayBuffer;
}
