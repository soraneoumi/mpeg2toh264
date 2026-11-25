// Public contracts exercised against the actual class; only DOM/WebGL/clock
// boundaries are fake. This does not assert GPU pixels or browser smoothness.
import assert from "node:assert/strict";
import { build } from "esbuild";

let now = 5000;
let graphicsCost = 0;
let chargeDraws = false;
let nextHandle = 0;
const raf = new Map();
// Whether the GPU is still running what it was given; see clientWaitSync.
let gpuBusy = false;
class FakeGL {
  FRAMEBUFFER_COMPLETE = 1;
  ALREADY_SIGNALED = 0x911a;
  TIMEOUT_EXPIRED = 0x911b;
  clientWaitSync() {
    return gpuBusy ? this.TIMEOUT_EXPIRED : this.ALREADY_SIGNALED;
  }
  createTexture() {
    return {};
  }
  createFramebuffer() {
    return {};
  }
  checkFramebufferStatus() {
    return this.FRAMEBUFFER_COMPLETE;
  }
  createProgram() {
    return {};
  }
  createShader() {
    return {};
  }
  getShaderParameter() {
    return true;
  }
  getProgramParameter() {
    return true;
  }
  getExtension() {
    return null;
  }
  getUniformLocation() {
    return {};
  }
  getParameter() {
    return null;
  }
  drawArrays() {
    if (chargeDraws) {
      now += 0.1;
      graphicsCost += 0.1;
    }
  }
}
const gl = new Proxy(new FakeGL(), {
  get(target, key) {
    return key in target ? Reflect.get(target, key) : () => {};
  },
});
class FakeCanvas extends EventTarget {
  style = {};
  width = 0;
  height = 0;
  className = "";
  getContext() {
    return gl;
  }
  getAttribute() {
    return null;
  }
  setAttribute() {}
  removeAttribute() {}
  transferControlToOffscreen() {
    return {};
  }
  remove() {}
}
class FakeVideo extends EventTarget {
  paused = true;
  ended = false;
  seeking = false;
  readyState = 0;
  currentTime = 0;
  playbackRate = 1;
  videoWidth = 0;
  videoHeight = 0;
  buffered = { length: 0 };
  getVideoPlaybackQuality() {
    return { droppedVideoFrames: 0, totalVideoFrames: 0 };
  }
  requestVideoFrameCallback() {
    return 1;
  }
  cancelVideoFrameCallback() {}
}
globalThis.WebGL2RenderingContext = FakeGL;
globalThis.document = { createElement: () => new FakeCanvas() };
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextHandle;
  raf.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => raf.delete(id);
globalThis.CustomEvent ??= class extends Event {
  constructor(type, options) {
    super(type);
    this.detail = options?.detail;
  }
};
Object.defineProperty(globalThis, "performance", {
  configurable: true,
  value: { now: () => now },
});
const bundle = await build({
  entryPoints: ["packages/yadif/src/deinterlace.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const { createWorkerDeinterlacer, Deinterlacer } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

// A rendering report must account for all filtering and presentation work per
// input picture, regardless of whether one or two outputs are scheduled.
for (const doubleRate of [false, true]) {
  const video = new FakeVideo();
  const renderer = createWorkerDeinterlacer(
    video,
    new FakeCanvas(),
    { doubleRate },
    assert.fail,
    () => {},
    requestAnimationFrame,
    cancelAnimationFrame,
  );
  let previousInput = 0;
  let previousCost = 0;
  let input = 0;
  let checked = 0;
  renderer.addEventListener("stats", (event) => {
    const expected = (graphicsCost - previousCost) / (input - previousInput);
    assert.ok(
      Math.abs(event.detail.frameMs - expected) < 1e-8,
      `${doubleRate}: ${event.detail.frameMs} != ${expected}`,
    );
    previousInput = input;
    previousCost = graphicsCost;
    checked++;
  });
  chargeDraws = true;
  graphicsCost = 0;
  renderer.start();
  const start = now;
  for (let tick = 0; tick < 180; tick++) {
    now = start + tick * (1000 / 60);
    for (const [id, callback] of [...raf]) {
      raf.delete(id);
      callback(now);
    }
    if (tick % 2 === 0) {
      input++;
      renderer.ingestExternalFrame(
        now,
        {
          mediaTime: input / 30,
          presentedFrames: input,
          expectedDisplayTime: now,
          width: 64,
          height: 64,
        },
        {},
      );
    }
  }
  assert.ok(checked >= 2);
  chargeDraws = false;
  renderer.destroy();
  assert.equal(raf.size, 0);
}
console.log("yadif per-input CPU accounting: pass");

/** Wait out the renderer's look at whether the GPU has run its setup. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/** Record every status a renderer's `onrendererstatus` is called with. */
function watchStatus(renderer) {
  const statuses = [];
  const failures = [];
  renderer.decodedVideo.onrendererstatus = () =>
    statuses.push(renderer.decodedVideo.rendererStatus());
  renderer.addEventListener("failure", (event) => failures.push(event.detail));
  return { statuses, failures };
}

// Rendering on the page: preparing until the GPU has run the setup, then
// prepared; a lost context fails it for good, and nothing starts it again.
{
  gpuBusy = true;
  const renderer = new Deinterlacer(new FakeVideo(), { rendering: "main" });
  const { statuses, failures } = watchStatus(renderer);
  await settle();
  assert.deepEqual(renderer.decodedVideo.rendererStatus(), {
    state: "preparing",
  });
  assert.deepEqual(statuses, [], "nothing to say while the GPU is busy");
  gpuBusy = false;
  await settle();
  assert.deepEqual(statuses, [{ state: "prepared" }]);
  renderer.start();
  assert.equal(renderer.running, true);
  renderer.canvas.dispatchEvent(new Event("webglcontextlost"));
  const lost = {
    state: "failed",
    reason: "the deinterlacer WebGL context was lost",
  };
  assert.deepEqual(statuses.at(-1), lost);
  assert.deepEqual(renderer.decodedVideo.rendererStatus(), lost);
  assert.deepEqual(failures, [lost.reason]);
  assert.equal(renderer.running, false);
  renderer.start();
  assert.equal(renderer.running, false, "a failed renderer stays stopped");
  renderer.destroy();
}
console.log("yadif renderer status, lost context: pass");

// Rendering in a Worker where there is none: a failure, not a silent stop.
{
  const renderer = new Deinterlacer(new FakeVideo(), {
    rendering: "worker",
    workerUrl: "mock://worker",
  });
  const { statuses, failures } = watchStatus(renderer);
  renderer.start();
  assert.equal(renderer.running, false);
  assert.equal(statuses.at(-1).state, "failed");
  assert.match(statuses.at(-1).reason, /Worker/);
  assert.deepEqual(failures, [statuses.at(-1).reason]);
  renderer.destroy();
}
console.log("yadif renderer status, no Worker: pass");

// A Worker renderer is prepared once it says it is ready, preparing again
// while a dead one is replaced, and failed once the replacement dies too.
{
  class FakeWorker {
    static made = [];
    onmessage = null;
    onerror = null;
    constructor() {
      FakeWorker.made.push(this);
    }
    postMessage() {}
    terminate() {}
  }
  const error = (message) => ({ message, preventDefault() {} });
  globalThis.Worker = FakeWorker;
  globalThis.VideoFrame = class {};
  globalThis.OffscreenCanvas = class {};
  globalThis.HTMLCanvasElement = FakeCanvas;
  try {
    const renderer = new Deinterlacer(new FakeVideo(), {
      rendering: "worker",
      workerUrl: "mock://worker",
    });
    const { statuses, failures } = watchStatus(renderer);
    renderer.start();
    assert.equal(FakeWorker.made.length, 1);
    assert.deepEqual(renderer.decodedVideo.rendererStatus(), {
      state: "preparing",
    });
    FakeWorker.made[0].onmessage({ data: { type: "ready" } });
    assert.deepEqual(statuses.at(-1), { state: "prepared" });
    FakeWorker.made[0].onerror(error("first"));
    assert.equal(FakeWorker.made.length, 2, "one new Worker");
    assert.deepEqual(statuses.at(-1), { state: "preparing" });
    assert.deepEqual(failures, [], "a restart is not a failure");
    FakeWorker.made[1].onerror(error("second"));
    const stopped = {
      state: "failed",
      reason: "deinterlacer worker stopped: second",
    };
    assert.deepEqual(statuses.at(-1), stopped);
    assert.deepEqual(failures, [stopped.reason]);
    assert.equal(renderer.running, false);
    renderer.start();
    assert.equal(FakeWorker.made.length, 2, "no Worker after the failure");
    assert.equal(renderer.running, false);
    renderer.destroy();
  } finally {
    delete globalThis.Worker;
    delete globalThis.VideoFrame;
    delete globalThis.OffscreenCanvas;
    delete globalThis.HTMLCanvasElement;
  }
}
console.log("yadif renderer status, Worker failures: pass");

// In a Worker a failure goes to the page, which decides; the renderer stays
// stopped whatever it is told meanwhile.
{
  const reported = [];
  const canvas = new FakeCanvas();
  const renderer = createWorkerDeinterlacer(
    new FakeVideo(),
    canvas,
    {},
    (message) => reported.push(message),
    () => {},
    requestAnimationFrame,
    cancelAnimationFrame,
  );
  renderer.start();
  assert.equal(renderer.running, true);
  canvas.dispatchEvent(new Event("webglcontextlost"));
  assert.deepEqual(reported, ["the deinterlacer WebGL context was lost"]);
  assert.equal(renderer.running, false);
  renderer.start();
  assert.equal(renderer.running, false, "a failed renderer stays stopped");
  renderer.destroy();
}
console.log("yadif renderer status, failure in a Worker: pass");
