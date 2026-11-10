// Run with: node tools/test-picture-watch.cjs
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const transpile = (file) =>
  ts.transpileModule(
    readFileSync(resolve(__dirname, "../packages/yadif/src", file), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
// A data: module cannot resolve "./utils.js", so its code goes in ahead.
const source =
  transpile("utils.ts").replace(/^export /gm, "") +
  transpile("picture-watch.ts").replace(/^import .*$/gm, "");
const modulePromise = import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

/**
 * Enough of WebGL2 to follow what PictureWatch does with its objects. A
 * texture holds the picture uploaded to it, and a comparison is evaluated
 * when it is drawn, so reusing a texture too early shows up as a wrong
 * verdict. Fences signal only after `nextTask()`, as in a browser.
 */
function fakeGL(video) {
  const constants = Object.fromEntries(
    [
      "TEXTURE_2D",
      "TEXTURE0",
      "TEXTURE1",
      "RGBA",
      "RGBA8",
      "UNSIGNED_BYTE",
      "FRAMEBUFFER",
      "COLOR_ATTACHMENT0",
      "PIXEL_PACK_BUFFER",
      "STREAM_COPY",
      "SYNC_GPU_COMMANDS_COMPLETE",
      "ALREADY_SIGNALED",
      "CONDITION_SATISFIED",
      "TIMEOUT_EXPIRED",
      "TRIANGLES",
      "NEAREST",
      "CLAMP_TO_EDGE",
      "TEXTURE_MIN_FILTER",
      "TEXTURE_MAG_FILTER",
      "TEXTURE_WRAP_S",
      "TEXTURE_WRAP_T",
      "VERTEX_SHADER",
      "FRAGMENT_SHADER",
      "COMPILE_STATUS",
      "LINK_STATUS",
    ].map((name, index) => [name, 0x9000 + index]),
  );
  const state = {
    textures: new Set(),
    buffers: new Set(),
    fences: new Set(),
    framebuffers: new Set(),
    /** Textures that have held a picture, as opposed to a comparison. */
    pictures: new Set(),
    unit: 0,
    bound: [null, null],
    pack: null,
    lastDraw: null,
    errors: [],
    late: false,
  };
  const live = (set, object, what) => {
    if (object !== null && !set.has(object))
      state.errors.push(`${what} used after deletion`);
  };
  const gl = {
    ...constants,
    createTexture() {
      const texture = { picture: undefined, size: null };
      state.textures.add(texture);
      return texture;
    },
    deleteTexture(texture) {
      if (!state.textures.delete(texture))
        state.errors.push("texture deleted twice");
    },
    activeTexture(unit) {
      state.unit = unit - constants.TEXTURE0;
    },
    bindTexture(_, texture) {
      live(state.textures, texture, "texture");
      state.bound[state.unit] = texture;
    },
    texParameteri() {},
    texImage2D(...args) {
      const texture = state.bound[state.unit];
      if (args.length === 6) {
        state.pictures.add(texture);
        texture.picture = video.picture;
        texture.size = `${video.videoWidth}x${video.videoHeight}`;
      }
    },
    createFramebuffer() {
      const framebuffer = {};
      state.framebuffers.add(framebuffer);
      return framebuffer;
    },
    deleteFramebuffer(framebuffer) {
      state.framebuffers.delete(framebuffer);
    },
    bindFramebuffer() {},
    framebufferTexture2D() {},
    viewport() {},
    createShader: () => ({}),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => true,
    deleteShader() {},
    createProgram: () => ({}),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    deleteProgram() {},
    useProgram() {},
    getUniformLocation: (_, name) => name,
    uniform1i() {},
    drawArrays() {
      const [take, reference] = state.bound;
      live(state.textures, take, "take texture");
      live(state.textures, reference, "reference texture");
      state.lastDraw =
        take.size !== reference.size || take.picture !== reference.picture;
    },
    createBuffer() {
      const buffer = { changed: null, bytes: 0 };
      state.buffers.add(buffer);
      return buffer;
    },
    deleteBuffer(buffer) {
      if (!state.buffers.delete(buffer))
        state.errors.push("buffer deleted twice");
    },
    bindBuffer(_, buffer) {
      live(state.buffers, buffer, "buffer");
      state.pack = buffer;
    },
    bufferData(_, bytes) {
      state.pack.bytes = bytes;
    },
    readPixels(x, y, width, height) {
      if (state.pack.bytes !== width * height * 4)
        state.errors.push("readback into a buffer of the wrong size");
      state.pack.changed = state.lastDraw;
    },
    getBufferSubData(_, offset, into) {
      if (into.byteLength !== state.pack.bytes)
        state.errors.push("readback into an array of the wrong size");
      into.fill(0);
      if (state.pack.changed) into[into.length - 2] = 1;
    },
    fenceSync() {
      const fence = { signaled: false };
      state.fences.add(fence);
      return fence;
    },
    deleteSync(fence) {
      if (!state.fences.delete(fence)) state.errors.push("fence deleted twice");
    },
    clientWaitSync(fence) {
      live(state.fences, fence, "fence");
      return fence.signaled
        ? constants.ALREADY_SIGNALED
        : constants.TIMEOUT_EXPIRED;
    },
    flush() {},
  };
  const nextTask = () => {
    if (!state.late) for (const fence of state.fences) fence.signaled = true;
  };
  return { gl, state, nextTask };
}

async function fixture() {
  const { PictureWatch } = await modulePromise;
  const video = { picture: 0, videoWidth: 1440, videoHeight: 1080 };
  const { gl, state, nextTask } = fakeGL(video);
  const watch = new PictureWatch(gl, video);
  /** One refresh: show `picture`, take it, and collect what has settled. */
  const refresh = (picture) => {
    video.picture = picture;
    nextTask();
    const id = watch.take();
    const settled = [];
    for (let verdict = watch.settle(); verdict; verdict = watch.settle())
      settled.push(verdict);
    return { id, settled };
  };
  return { watch, video, gl, state, refresh };
}

test("each picture is reported changed once, a refresh after its take", async () => {
  const f = await fixture();
  const changed = [];
  const ids = new Map();
  // Two refreshes a picture, the last one held for five.
  for (const picture of [1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 4]) {
    const { id, settled } = f.refresh(picture);
    ids.set(id, picture);
    for (const verdict of settled) {
      if (verdict.changed) changed.push(ids.get(verdict.id));
      f.watch.release(verdict.id);
    }
  }
  assert.deepEqual(changed, [1, 2, 3, 4]);
  // The newest take and the one before it; released ones are reused.
  assert.equal(f.state.pictures.size, 2);
  assert.deepEqual(f.state.errors, []);
});

test("an adopted texture holds its take's picture and the exchange keeps the pool whole", async () => {
  const f = await fixture();
  const ring = [f.gl.createTexture(), f.gl.createTexture()];
  let head = 0;
  for (let picture = 1; picture <= 40; picture++) {
    const { settled } = f.refresh(picture);
    for (const verdict of settled) {
      assert.equal(verdict.changed, true);
      head = 1 - head;
      ring[head] = f.watch.adopt(verdict.id, ring[head]);
      // The element shows the next picture by now; the texture does not.
      assert.equal(ring[head].picture, picture - 1);
      f.watch.release(verdict.id);
    }
  }
  // Two made by the watch and the ring's own two, in circulation.
  assert.equal(f.state.pictures.size, 4);
  assert.throws(() => f.watch.adopt(9999, ring[0]), /not available/);
  // The ring's owner may delete what it holds at any time.
  for (const texture of ring) f.gl.deleteTexture(texture);
  f.refresh(41);
  f.refresh(42);
  f.watch.destroy();
  assert.deepEqual(f.state.errors, []);
  assert.equal(f.state.textures.size, 0);
  assert.equal(f.state.buffers.size, 0);
  assert.equal(f.state.fences.size, 0);
  assert.equal(f.state.framebuffers.size, 0);
});

test("verdicts wait for their fence and takes stop when the pool is full", async () => {
  const f = await fixture();
  f.state.late = true;
  const ids = [];
  for (let picture = 1; picture <= 8; picture++) {
    const { id, settled } = f.refresh(picture);
    ids.push(id);
    // Only the first take needs no comparison.
    assert.deepEqual(
      settled.map((verdict) => verdict.id),
      picture === 2 ? [ids[0]] : [],
    );
  }
  assert.deepEqual(ids.slice(6), [null, null]);
  assert.equal(f.state.pictures.size, 6);
  f.state.late = false;
  const { id, settled } = f.refresh(9);
  // Still full on this refresh: the verdicts are collected after the take.
  assert.equal(id, null);
  assert.deepEqual(
    settled.map((verdict) => verdict.id),
    ids.slice(1, 5),
  );
  assert.ok(settled.every((verdict) => verdict.changed));
  for (const verdict of settled) f.watch.release(verdict.id);
  f.watch.release(ids[0]);
  assert.notEqual(f.refresh(10).id, null);
  assert.equal(f.state.pictures.size, 6);
  assert.deepEqual(f.state.errors, []);
});

test("a change of size is a new picture and replaces the comparison buffers", async () => {
  const f = await fixture();
  const release = (settled) => {
    for (const verdict of settled) f.watch.release(verdict.id);
    return settled.map((verdict) => verdict.changed);
  };
  release(f.refresh(1).settled);
  assert.deepEqual(release(f.refresh(1).settled), [true]);
  assert.deepEqual(release(f.refresh(1).settled), [false]);
  f.video.videoWidth = 1920;
  // The same picture value at another size.
  assert.deepEqual(release(f.refresh(1).settled), [false]);
  assert.deepEqual(release(f.refresh(1).settled), [true]);
  assert.deepEqual(release(f.refresh(1).settled), [false]);
  assert.deepEqual(f.state.errors, []);
  // One buffer in flight, and none left over from the first size.
  assert.ok(f.state.buffers.size <= 2);
  assert.ok(
    [...f.state.buffers].every((buffer) => buffer.bytes === 120 * 68 * 4),
  );
});

test("reset forgets pending takes and the next take is new", async () => {
  const f = await fixture();
  f.state.late = true;
  f.refresh(1);
  f.refresh(1);
  f.refresh(1);
  f.watch.reset();
  assert.equal(f.state.fences.size, 0);
  f.state.late = false;
  assert.deepEqual(f.refresh(1).settled, []);
  const { settled } = f.refresh(1);
  assert.equal(settled.length, 1);
  assert.equal(settled[0].changed, true);
  assert.equal(f.state.pictures.size, 3);
  assert.deepEqual(f.state.errors, []);
});
