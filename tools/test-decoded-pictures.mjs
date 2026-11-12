// Decoded pictures pushed into the deinterlacer: when each field reaches the
// screen against the element's clock, what happens to late, early and
// out-of-order pictures, and that every buffer comes back exactly once.
//
// The wall clock, the refresh and currentTime are virtual, and GL draws are
// recorded rather than run. A draw made in the animation frame of refresh k
// is taken to reach the screen at refresh k + 1, which is what the renderer
// assumes. The colour conversion is checked by evaluating the conversion
// shader's own sampling functions in JavaScript against a reference
// computed here from the geometry of H.262 Figures 6-1 to 6-3.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

import { BASE_MS, buildBundles, run } from "./yadif-clock-harness.mjs";

const FRAME = 1001 / 30000;
const WIDTH = 13;
const HEIGHT = 11;

/** A small deterministic generator, so a failure can be run again. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plane layout with strides and offsets that are not multiples of four. */
function layout(width, height) {
  const cw = Math.ceil(width / 2);
  const ch = Math.ceil(height / 2);
  const y = { offset: 5, stride: width + 3 };
  const cb = { offset: y.offset + y.stride * height + 2, stride: cw + 1 };
  const cr = { offset: cb.offset + cb.stride * ch + 3, stride: cw + 5 };
  return { planes: [y, cb, cr], bytes: cr.offset + cr.stride * ch + 1 };
}

// ---------------------------------------------------------------------------
// Colour and chroma siting.

async function conversionModule() {
  const directory = await mkdtemp(join(tmpdir(), "yadif-decoded-"));
  const outfile = join(directory, "decoded.mjs");
  try {
    await build({
      entryPoints: [join(process.cwd(), "packages/yadif/src/decoded-video.ts")],
      outfile,
      bundle: true,
      format: "esm",
      platform: "neutral",
      logLevel: "silent",
    });
    return await import(
      `data:text/javascript,${encodeURIComponent(await readFile(outfile, "utf8"))}`
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * The named functions of the conversion shader as JavaScript. They are
 * written in a subset that only needs type names removed and casts renamed.
 */
function shaderFunctions(source, names) {
  let js = "";
  for (const name of names) {
    const start = source.search(new RegExp(`\\n\\w+ ${name}\\(`)) + 1;
    assert.ok(start > 0, `the shader has no ${name}()`);
    let depth = 0;
    let end = source.indexOf("{", start);
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++;
      else if (source[end] === "}" && --depth === 0) break;
    }
    js +=
      source
        .slice(start, end + 1)
        .replace(
          /^\w+\s+(\w+)\(([^)]*)\)/,
          (_, fn, params) =>
            `function ${fn}(${params
              .split(",")
              .map((param) => param.trim().split(/\s+/).pop())
              .join(", ")})`,
        )
        .replace(
          /\b(?:float|int|bool|vec2|vec3|ivec2)\s+(?=\w+\s*[;=])/g,
          "let ",
        )
        .replace(/\bfloat\(/g, "Number(")
        .replace(/\bint\(/g, "Math.trunc(") + "\n";
  }
  return js;
}

function evaluateShader(module, planes, interlaced, matrix) {
  const componentwise =
    (f) =>
    (a, ...rest) =>
      typeof a === "number"
        ? f(a, ...rest)
        : Array.isArray(a)
          ? a.map((v) => f(v, ...rest))
          : { x: f(a.x, ...rest), y: f(a.y, ...rest) };
  const mix = (a, b, t) =>
    typeof a === "number"
      ? a * (1 - t) + b * t
      : { x: a.x * (1 - t) + b.x * t, y: a.y * (1 - t) + b.y * t };
  const plane = ({ samples, width }) => ({
    get: (x, y) => samples[y * width + x],
  });
  const [m0, m1, m2, m3] = module.MATRIX_COEFFICIENTS[matrix];
  const env = {
    vec2: (x, y) => ({ x, y }),
    vec3: (...values) => values,
    ivec2: (x, y) => [x, y],
    clamp: componentwise((v, lo, hi) => Math.min(Math.max(v, lo), hi)),
    mix,
    min: Math.min,
    texelFetch: (texture, [x, y]) => ({ r: texture.get(x, y) / 255 }),
    uCb: plane(planes[1]),
    uCr: plane(planes[2]),
    uInterlaced: interlaced,
    uMatrix: { x: m0, y: m1, z: m2, w: m3 },
  };
  const js = shaderFunctions(module.PICTURE_FRAGMENT_SHADER, [
    "chromaColumn",
    "chromaRow",
    "chromaFieldRow",
    "tap",
    "chroma",
    "rgb",
  ]);
  const { chroma, rgb } = new Function(
    ...Object.keys(env),
    `${js}return { chroma, rgb };`,
  )(...Object.values(env));
  // main(), which only fetches the luma sample and calls the two.
  const luma = plane(planes[0]);
  return (x, y) =>
    rgb(luma.get(x, y) / 255, chroma(x, y, planes[1].width, planes[1].height));
}

/**
 * Linear interpolation between the two samples whose positions bracket `at`,
 * the nearest one beyond either end.
 */
function between(positions, values, at) {
  if (at <= positions[0]) return values[0];
  for (let index = 1; index < positions.length; index++)
    if (at <= positions[index]) {
      const w =
        (at - positions[index - 1]) / (positions[index] - positions[index - 1]);
      return values[index - 1] * (1 - w) + values[index] * w;
    }
  return values.at(-1);
}

/**
 * The reference: chroma sample (i, c) sits at luma column 2i and, in frame
 * coordinates, at luma row 2c + 1/2, for progressive and interlaced pictures
 * alike (Figures 6-1 to 6-3). An interlaced luma row uses the chroma rows of
 * its own field only, which are the rows of its parity.
 */
function reference(planes, interlaced, matrix) {
  const [kr, kb] = matrix === "bt709" ? [0.2126, 0.0722] : [0.299, 0.114];
  const kg = 1 - kr - kb;
  // RGB to normalised Y, Cb, Cr, inverted by Cramer's rule.
  const forward = [
    [kr, kg, kb],
    [-kr / (2 * (1 - kb)), -kg / (2 * (1 - kb)), 0.5],
    [0.5, -kg / (2 * (1 - kr)), -kb / (2 * (1 - kr))],
  ];
  const det = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const solve = (v) =>
    [0, 1, 2].map(
      (column) =>
        det(
          forward.map((row, r) =>
            row.map((value, c) => (c === column ? v[r] : value)),
          ),
        ) / det(forward),
    );
  const [luma, cb, cr] = planes;
  const sample = (plane, x, y) => plane.samples[y * plane.width + x];
  return (x, y) => {
    const value = (plane) => {
      const rows = [];
      for (let c = 0; c < plane.height; c++)
        if (!interlaced || (c & 1) === (y & 1)) rows.push(c);
      const columns = Array.from({ length: plane.width }, (_, i) => i);
      const across = (row) =>
        between(
          columns.map((i) => 2 * i),
          columns.map((i) => sample(plane, i, row)),
          x,
        );
      return between(
        rows.map((c) => 2 * c + 0.5),
        rows.map(across),
        y,
      );
    };
    const yn = (sample(luma, x, y) - 16) / 219;
    const cbn = (value(cb) - 128) / 224;
    const crn = (value(cr) - 128) / 224;
    return solve([yn, cbn, crn]).map((v) => Math.min(Math.max(v, 0), 1));
  };
}

async function testConversion() {
  const module = await conversionModule();
  const next = random(7);
  for (const interlaced of [false, true])
    for (const matrix of ["bt709", "bt601"]) {
      const planes = [
        [WIDTH, HEIGHT],
        [Math.ceil(WIDTH / 2), Math.ceil(HEIGHT / 2)],
        [Math.ceil(WIDTH / 2), Math.ceil(HEIGHT / 2)],
      ].map(([width, height]) => ({
        width,
        height,
        samples: Array.from({ length: width * height }, () =>
          // Some beyond the limited range, so that clamping is exercised.
          Math.floor(next() * 256),
        ),
      }));
      const shader = evaluateShader(module, planes, interlaced, matrix);
      const expected = reference(planes, interlaced, matrix);
      let worst = 0;
      for (let y = 0; y < HEIGHT; y++)
        for (let x = 0; x < WIDTH; x++) {
          const got = shader(x, y);
          const want = expected(x, y);
          for (let c = 0; c < 3; c++)
            worst = Math.max(worst, Math.abs(got[c] - want[c]));
        }
      // The coefficients are single precision, as uniforms are.
      assert.ok(worst < 2e-6, `${matrix} ${interlaced}: off by ${worst}`);
      console.log(
        `ok colour ${interlaced ? "interlaced" : "progressive"} ${matrix} ${WIDTH}x${HEIGHT}: worst ${worst.toExponential(1)}`,
      );
    }
  // Chroma of the top field only reaches top-field luma rows, and the bottom
  // field's only bottom-field rows.
  const cw = Math.ceil(WIDTH / 2);
  const ch = Math.ceil(HEIGHT / 2);
  const split = (top, bottom) => ({
    width: cw,
    height: ch,
    samples: Array.from({ length: cw * ch }, (_, i) =>
      Math.floor(i / cw) % 2 === 0 ? top : bottom,
    ),
  });
  const planes = [
    {
      width: WIDTH,
      height: HEIGHT,
      samples: new Array(WIDTH * HEIGHT).fill(126),
    },
    split(16, 240),
    split(128, 128),
  ];
  const fields = evaluateShader(module, planes, true, "bt709");
  const frame = evaluateShader(module, planes, false, "bt709");
  const top = fields(4, 2);
  const bottom = fields(4, 3);
  const mixed = frame(4, 2);
  assert.ok(top[2] === 0 && bottom[2] === 1, "fields took chroma across");
  assert.ok(mixed[2] > 0 && mixed[2] < 1, "progressive did not interpolate");
  console.log("ok colour: interlaced chroma stays within its field");
}

// ---------------------------------------------------------------------------
// Timing.

/**
 * The element's clock. `truth` is where playback is; `reading` is what
 * currentTime says, which with `stepMs` is the position at the last update,
 * updates being `stepMs` apart with up to `jitterMs` of lateness each.
 */
class Media {
  constructor({ stepMs = 0, jitterMs = 0, seed = 1, driftPpm = 0 } = {}) {
    this.stepMs = stepMs;
    this.jitterMs = jitterMs;
    this.seed = seed;
    this.drift = driftPpm * 1e-6;
    this.set(BASE_MS, 0, 0);
  }

  /** From `wall` on, playback is at `media` moving at `rate`. */
  set(wall, media, rate) {
    this.wall = wall;
    this.media = media;
    this.rate = rate;
  }

  truth(wall) {
    return (
      this.media +
      (this.rate * Math.max(0, wall - this.wall) * (1 + this.drift)) / 1000
    );
  }

  reading(wall) {
    if (this.stepMs === 0 || this.rate === 0) return this.truth(wall);
    let step = Math.floor((wall - this.wall) / this.stepMs);
    const update = (j) =>
      this.wall +
      j * this.stepMs +
      random(this.seed * 7919 + j)() * this.jitterMs;
    if (step >= 0 && update(step) > wall) step--;
    return step < 0 ? this.media : this.truth(update(step));
  }
}

/** Pictures of a 29.97 stream from `start`, as their producer would push them. */
function stream({ count, start = 0, at = () => ({}) }) {
  const pictures = [];
  let timestamp = start;
  for (let index = 0; index < count; index++) {
    const spec = {
      interlaced: true,
      topFieldFirst: true,
      repeatFirstField: false,
      ...at(index),
    };
    const duration = spec.repeatFirstField ? 1.5 * FRAME : FRAME;
    pictures.push({ timestamp, duration, ...spec });
    timestamp += duration;
  }
  return pictures;
}

/**
 * Decode order of an IBBP stream: every third picture is an anchor, decoded
 * before the two B pictures shown ahead of it.
 */
function decodeOrder(count) {
  const order = [0];
  let anchor = 3;
  for (; anchor < count; anchor += 3)
    order.push(anchor, anchor - 2, anchor - 1);
  for (let index = anchor - 2; index < count; index++) order.push(index);
  return order;
}

/**
 * Pushes pictures and checks that their buffers come back once each. A
 * buffer carries its picture's timestamp and an id in its last 16 bytes,
 * because one that went to a Worker comes back as a different object. One
 * that a Worker took away with it comes back as the detached original.
 */
class Producer {
  constructor(pictures, { window = 0.3, width = WIDTH, height = HEIGHT } = {}) {
    this.pictures = pictures;
    this.order = decodeOrder(pictures.length);
    this.cursor = 0;
    this.window = window;
    this.width = width;
    this.height = height;
    this.ids = new Map();
    this.outstanding = new Set();
    this.pushed = 0;
    this.released = 0;
    this.detached = 0;
    this.input = null;
  }

  attach(input) {
    this.input = input;
    input.onrelease = (data) => {
      let id = this.ids.get(data);
      if (id === undefined) id = this.stamp(data)[1];
      else if (data.byteLength === 0) this.detached++;
      assert.ok(
        this.outstanding.has(id),
        "a buffer came back twice or was never pushed",
      );
      this.outstanding.delete(id);
      this.released++;
    };
  }

  /** The timestamp and id a buffer carries. */
  stamp(buffer) {
    const view = new DataView(buffer, buffer.byteLength - 16);
    return [view.getFloat64(0), view.getFloat64(8)];
  }

  /** Count a buffer as pushed. */
  track(data, timestamp = 0) {
    const id = ++this.pushed;
    this.ids.set(data, id);
    this.outstanding.add(id);
    if (data.byteLength >= 16) {
      const view = new DataView(data, data.byteLength - 16);
      view.setFloat64(0, timestamp);
      view.setFloat64(8, id);
    }
  }

  push(picture) {
    const { planes, bytes } = layout(this.width, this.height);
    const data = new ArrayBuffer(bytes + 16);
    this.track(data, picture.timestamp);
    this.input.push({
      ...picture,
      width: this.width,
      height: this.height,
      displayWidth: this.width * 2,
      displayHeight: this.height,
      data,
      planes,
      matrix: "bt709",
    });
    this.mostHeld = Math.max(this.mostHeld ?? 0, this.outstanding.size);
  }

  /** Push every picture up to `window` ahead of `currentTime`, in decode order. */
  supply(currentTime, rate) {
    const until = currentTime + this.window * Math.max(1, rate);
    while (
      this.cursor < this.order.length &&
      this.pictures[this.order[this.cursor]].timestamp <= until
    )
      this.push(this.pictures[this.order[this.cursor++]]);
  }

  /** Start again from the anchor at or before `time`, as a seek does. */
  seek(time) {
    let index = this.pictures.findLastIndex(
      (picture) => picture.timestamp <= time,
    );
    index = Math.max(0, index - (index % 3));
    this.cursor = this.order.indexOf(index);
  }
}

/** What is due when: every output of every picture, in time order. */
function outputs(pictures, { doubleRate = true } = {}) {
  const list = [];
  for (const picture of pictures) {
    const { timestamp, duration } = picture;
    if (!picture.interlaced || !doubleRate) {
      list.push({
        time: timestamp,
        key: key(timestamp, picture.interlaced && 0),
        second: false,
        topFieldFirst: picture.topFieldFirst,
      });
      continue;
    }
    const fields = picture.repeatFirstField ? 3 : 2;
    for (let field = 0; field < fields; field++)
      list.push({
        time: timestamp + (field * duration) / fields,
        key: key(timestamp, field === 1 ? 1 : 0),
        second: field === 1,
        topFieldFirst: picture.topFieldFirst,
      });
  }
  return list;
}

function key(timestamp, field) {
  return `${timestamp.toFixed(6)}:${field === false ? "w" : field}`;
}

/**
 * The outputs that reached the canvas: the refresh each first appeared at,
 * and its media time. A repeated first field draws the same as the first,
 * and is told apart by order.
 */
function appearances(result, list, refreshMs) {
  const times = new Map();
  for (const output of list) {
    if (!times.has(output.key)) times.set(output.key, []);
    times.get(output.key).push(output);
  }
  const shown = [];
  let last = -Infinity;
  let previous = null;
  for (const draw of result.draws) {
    if (!draw.toCanvas || !draw.blit) continue;
    // capture() draws the picture on the canvas again.
    if (draw.texture === previous?.texture && draw.picture === previous.picture)
      continue;
    previous = draw;
    const picture = draw.picture;
    const name = key(
      picture.mediaTime,
      picture.converted ? false : picture.second,
    );
    const candidates = times.get(name);
    assert.ok(candidates, `drew ${name}, which is no output`);
    const output =
      candidates.find((candidate) => candidate.time >= last - 1e-9) ??
      candidates.at(-1);
    last = output.time;
    shown.push({
      refresh: Math.floor((draw.t - BASE_MS) / refreshMs + 1e-9) + 1,
      ...output,
      parity: picture.parity,
    });
  }
  return shown;
}

/**
 * Check that each output went up at the first refresh at or after its time,
 * within `toleranceMs` of wall time, and that none went up out of order.
 */
function checkTiming(
  label,
  shown,
  media,
  refreshMs,
  { from = -Infinity, to = Infinity, toleranceMs },
) {
  let early = 0;
  let late = 0;
  for (let index = 0; index < shown.length; index++) {
    const output = shown[index];
    if (index > 0)
      assert.ok(
        output.time > shown[index - 1].time,
        `${label}: ${output.key} went up after ${shown[index - 1].key}`,
      );
    const wall = BASE_MS + output.refresh * refreshMs;
    if (wall < from || wall > to) continue;
    const truth = media.truth(wall);
    const rate = media.rate || 1;
    early = Math.max(early, ((output.time - truth) * 1000) / rate);
    late = Math.max(late, ((truth - output.time) * 1000) / rate - refreshMs);
  }
  assert.ok(
    early <= toleranceMs,
    `${label}: an output went up ${early.toFixed(2)} ms before its time`,
  );
  assert.ok(
    late <= toleranceMs,
    `${label}: an output went up ${late.toFixed(2)} ms after its refresh`,
  );
  return { early, late };
}

/**
 * Repeated and skipped outputs per refresh between `from` and `to`, of what
 * went up and of the ideal: at each refresh, the newest output due by then.
 */
function cadence(shown, list, media, refreshMs, from, to) {
  const index = new Map(list.map((output, i) => [output.time.toFixed(9), i]));
  const first = Math.ceil((from - BASE_MS) / refreshMs);
  const last = Math.floor((to - BASE_MS) / refreshMs);
  const actual = [];
  let cursor = 0;
  let content = -1;
  let ideal = -1;
  const idealList = [];
  for (let refresh = 0; refresh <= last; refresh++) {
    while (cursor < shown.length && shown[cursor].refresh <= refresh)
      content = index.get(shown[cursor++].time.toFixed(9));
    const truth = media.truth(BASE_MS + refresh * refreshMs);
    while (ideal + 1 < list.length && list[ideal + 1].time <= truth) ideal++;
    if (refresh >= first) {
      actual.push(content);
      idealList.push(ideal);
    }
  }
  const count = (sequence) => {
    let repeated = 0;
    let skipped = 0;
    let reordered = 0;
    for (let i = 1; i < sequence.length; i++) {
      const step = sequence[i] - sequence[i - 1];
      if (step === 0) repeated++;
      else if (step > 1) skipped += step - 1;
      else if (step < 0) reordered++;
    }
    return { repeated, skipped, reordered };
  };
  return { actual: count(actual), ideal: count(idealList) };
}

/**
 * One playback. `script(vsync, control, context)` runs before each refresh,
 * after currentTime has been installed and before the producer supplies.
 */
async function play({
  seconds,
  refreshHz = 60,
  media = new Media(),
  pictures,
  producer = new Producer(pictures),
  options = {},
  callbackDelayMs = 0,
  supply = true,
  script = null,
  filmMetrics = null,
  rendering = "main",
}) {
  const refreshMs = 1000 / refreshHz;
  const delays = random(99);
  const context = { media, producer, released: [] };
  const result = await run(bundles, {
    rendering,
    vsyncs: Math.round((seconds * 1000) / refreshMs),
    refreshMs,
    arrival: () => false,
    serveDelay: () => delays() * callbackDelayMs,
    pictureTime: (buffer) => producer.stamp(buffer)[0],
    upload: (record) => context.uploads?.push(record),
    filmMetrics,
    deinterlacerOptions: { doubleRate: true, ...options },
    beforeVsync(vsync, control) {
      const deinterlacer = control.pageContext.__deinterlacer;
      if (vsync === 0) {
        const video = control.video;
        Object.defineProperty(video, "currentTime", {
          configurable: true,
          get: () => media.reading(control.now()),
          set: () => {},
        });
        video.paused = media.rate === 0;
        producer.attach(deinterlacer.decodedVideo);
        context.control = control;
        context.deinterlacer = deinterlacer;
      }
      script?.(vsync, control, context);
      if (supply && !control.video.seeking)
        producer.supply(control.video.currentTime, control.video.playbackRate);
    },
  });
  assert.equal(result.failures.length, 0, JSON.stringify(result.failures));
  context.result = result;
  context.refreshMs = refreshMs;
  context.stats = result.stats.at(-1);
  // Everything still held comes back when the deinterlacer goes.
  context.deinterlacer.destroy();
  assert.equal(
    producer.outstanding.size,
    0,
    `${producer.outstanding.size} buffers never came back`,
  );
  assert.equal(producer.released, producer.pushed);
  return context;
}

/** Start playing at `media` time 0 one refresh into the run. */
function playing(options) {
  const media = new Media(options);
  media.set(BASE_MS + 10, 0, 1);
  return media;
}

const bundles = await buildBundles(process.cwd());

await testConversion();

// Each field at the first refresh at or after its time, in all the shapes a
// picture comes in.
{
  const cases = [
    ["fields, top first", {}, () => ({})],
    ["fields, bottom first", {}, () => ({ topFieldFirst: false })],
    ["one picture a frame", { doubleRate: false }, () => ({})],
    [
      "fields with repeated first fields",
      {},
      (index) => ({
        repeatFirstField: index % 2 === 0,
        topFieldFirst: index % 4 < 2,
      }),
    ],
    ["progressive pictures", {}, (index) => ({ interlaced: index % 5 === 4 })],
  ];
  for (const refreshHz of [60, 60000 / 1001]) {
    for (const [name, options, at] of cases) {
      const pictures = stream({ count: 400, at });
      const media = playing();
      const { result, refreshMs, stats } = await play({
        seconds: 10,
        refreshHz,
        media,
        pictures,
        options,
      });
      const list = outputs(pictures, options);
      const shown = appearances(result, list, refreshMs);
      const timing = checkTiming(name, shown, media, refreshMs, {
        from: BASE_MS + 1000,
        toleranceMs: 1.5,
      });
      // Every output is shown: the field rate does not exceed the refresh.
      const window = shown.filter(
        (output) => output.time > 1.5 && output.time < 9,
      );
      const expected = list.filter(
        (output) => output.time > 1.5 && output.time < 9,
      );
      assert.equal(
        window.length,
        expected.length,
        `${name}: ${expected.length - window.length} outputs never went up`,
      );
      for (const output of shown)
        if (output.parity !== undefined) {
          const first = output.topFieldFirst ? 0 : 1;
          assert.equal(
            output.parity,
            output.second ? 1 - first : first,
            `${name}: wrong parity`,
          );
        }
      assert.equal(stats.missed, 0, `${name}: pictures dropped`);
      console.log(
        `ok ${name} at ${refreshHz.toFixed(2)} Hz: early ${timing.early.toFixed(2)} ms, late ${timing.late.toFixed(2)} ms past the refresh`,
      );
    }
  }
}

// Minutes of steady playback against a currentTime that moves in steps, with
// updates and animation frames that come late by varying amounts, and an
// element clock that drifts from the wall clock. Only the slips a field rate
// the refresh does not divide into must make are allowed.
{
  const seconds = Number(process.env.DECODED_STEADY_SECONDS ?? 180);
  for (const refreshHz of [59.95, 60]) {
    for (const stepMs of [10, 23, 40]) {
      const pictures = stream({ count: Math.ceil((seconds + 2) / FRAME) });
      const media = playing({
        stepMs,
        jitterMs: 3,
        seed: stepMs,
        driftPpm: 30,
      });
      const { result, refreshMs, stats } = await play({
        seconds,
        refreshHz,
        media,
        pictures,
        callbackDelayMs: 4,
      });
      const list = outputs(pictures);
      const shown = appearances(result, list, refreshMs);
      const from = BASE_MS + 5000;
      const to = BASE_MS + (seconds - 1) * 1000;
      const timing = checkTiming(
        `${stepMs} ms steps`,
        shown,
        media,
        refreshMs,
        {
          from,
          to,
          toleranceMs: 2,
        },
      );
      const { actual, ideal } = cadence(
        shown,
        list,
        media,
        refreshMs,
        from,
        to,
      );
      const label = `${seconds} s at ${refreshHz} Hz, ${stepMs} ms steps: ${JSON.stringify(actual)}, ideal ${JSON.stringify(ideal)}`;
      assert.equal(actual.reordered, 0, label);
      // Where the ideal slips, the hysteresis may move the slip by a refresh
      // but not add one; the window's ends may cut one off.
      assert.ok(Math.abs(actual.repeated - ideal.repeated) <= 1, label);
      assert.ok(actual.skipped <= ideal.skipped + 1, label);
      assert.equal(stats.missed, 0, label);
      console.log(
        `ok ${label}; early ${timing.early.toFixed(2)} ms, late ${timing.late.toFixed(2)} ms past the refresh, ${stats.resynced} restarts`,
      );
    }
  }
}

/**
 * Run each `[seconds, fn]` once, at the first refresh at or after `seconds`
 * into the run, in order.
 */
function timeline(...steps) {
  let next = 0;
  return (control, context) => {
    while (
      next < steps.length &&
      control.now() >= BASE_MS + steps[next][0] * 1000
    )
      steps[next++][1](control, context);
  };
}

function event(control, type) {
  control.video.dispatchEvent(new control.pageContext.Event(type));
}

function canvasDraws(result, from = -Infinity, to = Infinity) {
  return result.draws.filter(
    (draw) => draw.toCanvas && draw.blit && draw.t >= from && draw.t < to,
  );
}

// Anchors come before the B pictures shown ahead of them. A B picture that
// arrives after a later picture has been taken in cannot join the history and
// is dropped; one that arrives in time is shown in its place.
{
  const pictures = stream({ count: 300 });
  const media = playing();
  const late = new Set([pictures[151].timestamp]);
  const producer = new Producer(pictures);
  const push = producer.push.bind(producer);
  const held = [];
  producer.push = (picture) => {
    // Hold one B picture back until after its anchor has been filtered.
    if (late.has(picture.timestamp)) held.push(picture);
    else push(picture);
  };
  const { result, refreshMs, stats } = await play({
    seconds: 8,
    media,
    pictures,
    producer,
    script: (vsync, control) => {
      if (
        held.length > 0 &&
        control.now() > BASE_MS + 10 + pictures[153].timestamp * 1000
      )
        push(held.shift());
    },
  });
  const list = outputs(pictures);
  const shown = appearances(result, list, refreshMs);
  checkTiming("out of order", shown, media, refreshMs, {
    from: BASE_MS + 1000,
    toleranceMs: 1.5,
  });
  assert.equal(stats.missed, 1, "the late B picture was not dropped");
  assert.ok(
    !shown.some((output) =>
      output.key.startsWith(pictures[151].timestamp.toFixed(6)),
    ),
    "the late B picture went up",
  );
  console.log(
    "ok out of order: B pictures in time are shown, one arriving after its successor is dropped",
  );
}

// The producer stalls and then catches up with pictures whose time has
// passed: those are dropped, and the newest due is shown.
{
  const pictures = stream({ count: 300 });
  const media = playing({ stepMs: 23, jitterMs: 3 });
  let stalled = false;
  const { result, refreshMs, stats, producer } = await play({
    seconds: 9,
    media,
    pictures,
    supply: true,
    script: (vsync, control) => {
      stalled =
        control.now() > BASE_MS + 4000 && control.now() < BASE_MS + 4600;
    },
    producer: (() => {
      const producer = new Producer(pictures);
      const supply = producer.supply.bind(producer);
      producer.supply = (currentTime, rate) => {
        if (!stalled) supply(currentTime, rate);
      };
      return producer;
    })(),
  });
  const list = outputs(pictures);
  const shown = appearances(result, list, refreshMs);
  checkTiming("after a stall", shown, media, refreshMs, {
    from: BASE_MS + 5200,
    toleranceMs: 2,
  });
  assert.ok(
    stats.missed >= 10,
    `only ${stats.missed} late pictures were dropped`,
  );
  console.log(
    `ok late pictures: ${stats.missed} dropped after a stall of the producer, ${producer.pushed} pushed`,
  );
}

// A late picture is shown when nothing newer is there to show.
{
  const pictures = stream({ count: 300 });
  const media = playing();
  let supplying = true;
  const lone = pictures[75];
  const steps = timeline([
    3,
    (control, context) => context.producer.push(lone),
  ]);
  const { result } = await play({
    seconds: 4,
    media,
    pictures,
    supply: false,
    script: (vsync, control, context) => {
      if (control.now() > BASE_MS + 2000) supplying = false;
      if (supplying) context.producer.supply(control.video.currentTime, 1);
      steps(control, context);
    },
  });
  const after = canvasDraws(result, BASE_MS + 3000);
  assert.ok(
    after.some((draw) => draw.picture.mediaTime === lone.timestamp),
    "the lone late picture never went up",
  );
  console.log("ok late pictures: one with nothing newer is still shown");
}

// Paused: the first field of the picture currentTime falls in, also after a
// seek while paused once its picture is there; until then the last picture
// stays up.
// currentTime may stop behind the picture the canvas has gone on to.
for (const behindMs of [0, 12]) {
  const pictures = stream({ count: 400 });
  const media = playing();
  const pauseAt = pictures[91].timestamp + 0.001;
  const pausedIn = behindMs === 0 ? pictures[91] : pictures[90];
  const seekTo = pictures[220].timestamp + FRAME * 0.6;
  const marks = {};
  let supplying = true;
  const steps = timeline(
    [
      4,
      (control, context) => {
        control.video.seeking = true;
        event(control, "seeking");
        context.deinterlacer.decodedVideo.reset();
        media.set(control.now(), seekTo, 0);
        context.producer.seek(seekTo);
        supplying = false;
        marks.reset = control.now();
      },
    ],
    [
      4.3,
      (control) => {
        supplying = true;
        marks.supplied = control.now();
      },
    ],
    [
      4.35,
      (control) => {
        control.video.seeking = false;
        event(control, "seeked");
      },
    ],
    [
      6,
      (control) => {
        media.set(control.now(), seekTo, 1);
        control.video.paused = false;
        event(control, "play");
        event(control, "playing");
        marks.played = control.now();
      },
    ],
  );
  const { result, refreshMs } = await play({
    seconds: 9,
    media,
    pictures,
    supply: false,
    script: (vsync, control, context) => {
      const now = control.now();
      if (marks.paused === undefined && media.truth(now) >= pauseAt) {
        media.set(now, media.truth(now) - behindMs / 1000, 0);
        control.video.paused = true;
        event(control, "pause");
        marks.paused = now;
      }
      steps(control, context);
      if (supplying && !control.video.seeking)
        context.producer.supply(control.video.currentTime, 1);
      if (marks.paused !== undefined && marks.reset === undefined)
        marks.visibleBeforeSeek = context.deinterlacer.canvas.style.visibility;
      marks.scan = context.deinterlacer.scan;
    },
  });
  // What is on the canvas while paused, drawn before or after the pause.
  const paused = canvasDraws(result, -Infinity, marks.reset);
  assert.equal(paused.at(-1).picture.mediaTime, pausedIn.timestamp);
  assert.equal(paused.at(-1).picture.second, 0, "paused on the second field");
  assert.equal(
    canvasDraws(result, marks.paused + 200, marks.reset).length,
    0,
    "drew while paused",
  );
  assert.equal(
    canvasDraws(result, marks.reset, marks.supplied).length,
    0,
    "drew before a picture for the new position arrived",
  );
  const sought = canvasDraws(result, marks.supplied, marks.played);
  assert.equal(sought.at(-1).picture.mediaTime, pictures[220].timestamp);
  assert.equal(sought.at(-1).picture.second, 0);
  assert.equal(marks.visibleBeforeSeek, "visible");
  const list = outputs(pictures);
  const shown = appearances(
    { draws: canvasDraws(result, marks.played) },
    list,
    refreshMs,
  );
  checkTiming("after the paused seek", shown, media, refreshMs, {
    from: marks.played + 1500,
    toleranceMs: 2,
  });
  assert.equal(marks.scan.interlaced, true);
  console.log(
    `ok paused ${behindMs} ms behind the canvas: the first field of the current picture, before and after a seek`,
  );
}

// A seek while playing: the last picture stays up until the new position's
// arrives, and the new position's fields are on time.
{
  const pictures = stream({ count: 900 });
  const media = playing({ stepMs: 40, jitterMs: 3 });
  const marks = {};
  let supplying = true;
  const steps = timeline(
    [
      3,
      (control, context) => {
        control.video.seeking = true;
        event(control, "seeking");
        context.deinterlacer.decodedVideo.reset();
        media.set(control.now(), 20, 0);
        context.producer.seek(20);
        supplying = false;
        marks.reset = control.now();
      },
    ],
    [
      3.1,
      (control) => {
        supplying = true;
        marks.supplied = control.now();
      },
    ],
    [
      3.2,
      (control) => {
        media.set(control.now(), 20, 1);
        control.video.seeking = false;
        event(control, "seeked");
        event(control, "playing");
        marks.seeked = control.now();
      },
    ],
  );
  const { result, refreshMs, stats } = await play({
    seconds: 10,
    media,
    pictures,
    supply: false,
    script: (vsync, control, context) => {
      steps(control, context);
      if (supplying) context.producer.supply(control.video.currentTime, 1);
    },
  });
  assert.equal(canvasDraws(result, marks.reset, marks.supplied).length, 0);
  const after = canvasDraws(result, marks.supplied);
  assert.ok(after[0].picture.mediaTime >= 19.9);
  const list = outputs(pictures);
  const shown = appearances({ draws: after }, list, refreshMs);
  checkTiming("after a seek", shown, media, refreshMs, {
    from: marks.seeked + 2500,
    toleranceMs: 2,
  });
  console.log(
    `ok seek: last picture held, then on time (${stats.resynced} restarts)`,
  );
}

// Faster playback: fields are chosen by time, and those the display has no
// refresh for are skipped.
for (const rate of [1.5, 2])
  for (const stepMs of [0, 40]) {
    const pictures = stream({ count: Math.ceil((20 * rate + 2) / FRAME) });
    const media = new Media({ stepMs, jitterMs: stepMs ? 3 : 0 });
    media.set(BASE_MS + 10, 0, rate);
    const { result, refreshMs, stats } = await play({
      seconds: 20,
      media,
      pictures,
      callbackDelayMs: 3,
      script: (vsync, control) => {
        if (vsync === 0) control.video.playbackRate = rate;
      },
    });
    const list = outputs(pictures);
    const shown = appearances(result, list, refreshMs);
    const from = BASE_MS + 5000;
    const to = BASE_MS + 19000;
    const timing = checkTiming(`rate ${rate}`, shown, media, refreshMs, {
      from,
      toleranceMs: 2,
    });
    const { actual, ideal } = cadence(shown, list, media, refreshMs, from, to);
    const label = `rate ${rate}, ${stepMs} ms steps: ${JSON.stringify(actual)}, ideal ${JSON.stringify(ideal)}`;
    assert.equal(actual.reordered, 0, label);
    assert.ok(Math.abs(actual.repeated - ideal.repeated) <= 2, label);
    assert.ok(Math.abs(actual.skipped - ideal.skipped) <= 2, label);
    assert.ok(stats.late > 0);
    console.log(
      `ok ${label}; early ${timing.early.toFixed(2)} ms, late ${timing.late.toFixed(2)} ms`,
    );
  }

// A producer that sends far too much: the furthest ahead are dropped and
// their buffers come back at once, and what is kept plays on time.
{
  const pictures = stream({ count: 400 });
  const media = playing();
  const producer = new Producer(pictures, { window: 10 });
  const { result, refreshMs } = await play({
    seconds: 1.5,
    media,
    pictures,
    producer,
  });
  assert.ok(producer.mostHeld <= 24, `${producer.mostHeld} held`);
  const kept = producer.pushed - producer.outstanding.size;
  const list = outputs(pictures);
  const shown = appearances(result, list, refreshMs);
  checkTiming("oversupplied", shown, media, refreshMs, {
    from: BASE_MS + 200,
    to: BASE_MS + 600,
    toleranceMs: 1.5,
  });
  assert.ok(shown.length > 30);
  console.log(
    `ok queue bound: ${producer.pushed} pushed at once, all ${kept} back`,
  );
}

// Filtering off: the picture as it is, one a frame, and the canvas stays.
{
  const pictures = stream({ count: 300 });
  const media = playing();
  const marks = {};
  const { result, refreshMs } = await play({
    seconds: 4,
    media,
    pictures,
    script: (vsync, control, context) => {
      if (vsync === 0) context.deinterlacer.enabled = false;
      if (vsync === 120) {
        marks.visibility = context.deinterlacer.canvas.style.visibility;
        marks.running = context.deinterlacer.running;
      }
    },
  });
  assert.ok(
    !result.draws.some((draw) => draw.filter),
    "filtered with filtering off",
  );
  const list = outputs(
    pictures.map((picture) => ({ ...picture, interlaced: false })),
  );
  const shown = appearances(result, list, refreshMs);
  checkTiming("unfiltered", shown, media, refreshMs, {
    from: BASE_MS + 500,
    toleranceMs: 1.5,
  });
  assert.equal(marks.visibility, "visible");
  assert.equal(marks.running, false);
  console.log("ok filtering off: woven pictures on time, canvas kept");
}

// A new size between pictures: textures, canvas and its box follow, the
// planes are uploaded as laid out, and capture() is of the display size.
{
  const pictures = stream({ count: 300 });
  const media = playing();
  const producer = new Producer(pictures);
  const uploads = [];
  const marks = {};
  const { result, refreshMs } = await play({
    seconds: 4,
    media,
    pictures,
    producer,
    script: (vsync, control, context) => {
      context.uploads = uploads;
      // Pictures go 0.3 s ahead, so this is the size from about 2 s.
      if (control.now() >= BASE_MS + 1700) {
        producer.width = 17;
        producer.height = 9;
      }
      if (vsync === 220) {
        const canvas = context.deinterlacer.canvas;
        marks.size = [
          canvas.width,
          canvas.height,
          canvas.style.width,
          canvas.style.height,
        ];
        marks.aspect = control.video.style.aspectRatio;
        const images = [];
        control.pageContext.createImageBitmap = (...args) => {
          images.push(args);
          return Promise.resolve({ close() {} });
        };
        void context.deinterlacer.capture();
        marks.images = images;
      }
    },
  });
  assert.deepEqual(marks.size.slice(0, 2), [17, 9]);
  // The element's box is 1920x1080 and the picture is shown at 34x9.
  assert.equal(marks.size[2], "1920px");
  assert.equal(marks.size[3], `${(9 * 1920) / 34}px`);
  // The element has no picture of its own to take its proportions from.
  assert.equal(marks.aspect, "34 / 9");
  assert.equal(marks.images.length, 1);
  assert.equal(marks.images[0][1].resizeWidth, 34);
  assert.equal(marks.images[0][1].resizeHeight, 9);
  for (const upload of uploads) {
    // Luma 13x11 has chroma 7x6, and luma 17x9 has chroma 9x5.
    const large = upload.width === 17 || upload.width === 9;
    const { planes } = layout(large ? 17 : 13, large ? 9 : 11);
    const index = planes.findIndex((plane) => plane.offset === upload.offset);
    assert.ok(index >= 0, `uploaded from ${upload.offset}`);
    assert.equal(upload.alignment, 1);
    assert.equal(upload.rowLength, planes[index].stride);
    assert.deepEqual(
      [upload.width, upload.height],
      index === 0 ? (large ? [17, 9] : [13, 11]) : large ? [9, 5] : [7, 6],
    );
  }
  const list = outputs(pictures);
  const shown = appearances(result, list, refreshMs);
  checkTiming("resized", shown, media, refreshMs, {
    from: BASE_MS + 500,
    toleranceMs: 1.5,
  });
  console.log(
    `ok new size: canvas ${marks.size.join(" ")}, ${uploads.length} plane uploads as laid out`,
  );
}

// stop() hands everything back, pictures pushed while stopped come back at
// once, and start() carries on. finish() puts up the last picture.
{
  const pictures = stream({ count: 200 });
  const media = playing();
  const marks = {};
  const steps = timeline(
    [
      2,
      (control, context) => {
        context.deinterlacer.stop();
        marks.heldAfterStop = context.producer.outstanding.size;
      },
    ],
    [
      2.5,
      (control, context) => {
        marks.heldWhileStopped = context.producer.outstanding.size;
        context.deinterlacer.start();
        marks.started = control.now();
      },
    ],
    [
      // After the last picture has been pushed.
      6.5,
      (control, context) => {
        assert.equal(context.producer.cursor, pictures.length);
        context.deinterlacer.decodedVideo.finish();
      },
    ],
  );
  const producer = new Producer(pictures);
  const { result, refreshMs } = await play({
    seconds: 8,
    media,
    pictures,
    producer,
    script: (vsync, control, context) => steps(control, context),
  });
  assert.equal(marks.heldAfterStop, 0);
  assert.equal(marks.heldWhileStopped, 0);
  const list = outputs(pictures);
  const shown = appearances(
    { draws: canvasDraws(result, marks.started) },
    list,
    refreshMs,
  );
  checkTiming("after start", shown, media, refreshMs, {
    from: marks.started + 1000,
    to: BASE_MS + 6500,
    toleranceMs: 2,
  });
  const last = pictures.at(-1);
  assert.ok(
    shown.some((output) => output.time === last.timestamp + last.duration / 2),
    "the last field never went up",
  );
  console.log("ok stop, start and finish: buffers back, last picture shown");
}

// Nothing is acquired from the element once pictures are pushed, and a
// picture that does not fit its buffer is refused with its buffer returned.
{
  const pictures = stream({ count: 120 });
  const media = playing();
  const counts = { frameRequests: 0, elementUploads: 0 };
  const producer = new Producer(pictures);
  let refused = null;
  await play({
    seconds: 2,
    media,
    pictures,
    producer,
    script: (vsync, control, context) => {
      if (vsync !== 0) return;
      const video = control.video;
      const request = video.requestVideoFrameCallback.bind(video);
      video.requestVideoFrameCallback = (callback) => {
        if (producer.pushed > 0) counts.frameRequests++;
        return request(callback);
      };
      const gl = context.deinterlacer.canvas.getContext("webgl2");
      const texImage2D = gl.texImage2D.bind(gl);
      gl.texImage2D = (...args) => {
        if (args.includes(video)) counts.elementUploads++;
        return texImage2D(...args);
      };
      const data = new ArrayBuffer(16);
      producer.track(data);
      try {
        context.deinterlacer.decodedVideo.push({
          ...pictures[0],
          width: WIDTH,
          height: HEIGHT,
          displayWidth: WIDTH,
          displayHeight: HEIGHT,
          data,
          planes: layout(WIDTH, HEIGHT).planes,
          matrix: "bt709",
        });
      } catch (error) {
        refused = error;
      }
    },
  });
  assert.equal(
    refused?.name,
    "TypeError",
    "a picture outside its buffer was taken",
  );
  assert.deepEqual(counts, { frameRequests: 0, elementUploads: 0 });
  console.log(`ok element left alone; refused: ${refused.message}`);
}

// Film: with the pulldown cadence held, the decoded pictures are rebuilt into
// film frames shown evenly, four in every five pictures.
{
  const PHASE = 6 * 4;
  let cycle = 0;
  const pictures = stream({ count: 300 });
  const media = playing();
  const { result, refreshMs, stats } = await play({
    seconds: 8,
    media,
    pictures,
    options: { film: true },
    filmMetrics: ({ into }) => {
      into[PHASE] = (cycle++ % 5) + 1;
      into[PHASE + 1] = 20;
    },
  });
  const draws = canvasDraws(result, BASE_MS + 3000, BASE_MS + 7000);
  const refreshes = draws.map((draw) =>
    Math.floor((draw.t - BASE_MS) / refreshMs + 1e-9),
  );
  const gaps = new Set(
    refreshes.slice(1).map((refresh, i) => refresh - refreshes[i]),
  );
  const per5 = (draws.length / (4000 / 1000 / FRAME)) * 5;
  assert.ok(stats.film, "the cadence was not held");
  assert.deepEqual(
    [...gaps].sort(),
    [2, 3],
    `film frames ${[...gaps]} refreshes apart`,
  );
  assert.ok(Math.abs(per5 - 4) < 0.05, `${per5} film frames per five pictures`);
  assert.ok(draws.every((draw) => draw.picture.second === 0));
  console.log(
    `ok film: ${per5.toFixed(2)} film frames per five pictures, ${[...gaps].join(" or ")} refreshes apart`,
  );
}

// Worker rendering: pictures cross by transfer, their buffers come back the
// same way, and the Worker shows them by the page's readings of the clock.
// Buffers still in the Worker when it goes come back detached.
for (const stepMs of [0, 40]) {
  const pictures = stream({ count: 400 });
  const media = playing({ stepMs, jitterMs: stepMs ? 3 : 0 });
  const marks = {};
  const steps = timeline(
    [
      4,
      (control, context) => {
        context.deinterlacer.stop();
        marks.stopped = control.now();
      },
    ],
    [
      4.5,
      (control, context) => {
        marks.heldWhileStopped = context.producer.outstanding.size;
        context.deinterlacer.start();
        marks.started = control.now();
      },
    ],
  );
  const { result, refreshMs, producer } = await play({
    seconds: 8,
    media,
    pictures,
    rendering: "worker",
    callbackDelayMs: 3,
    script: (vsync, control, context) => steps(control, context),
  });
  const list = outputs(pictures);
  const before = appearances(
    { draws: result.draws.filter((draw) => draw.t < marks.stopped) },
    list,
    refreshMs,
  );
  checkTiming("worker", before, media, refreshMs, {
    from: BASE_MS + 1500,
    toleranceMs: 2,
  });
  const after = appearances(
    { draws: result.draws.filter((draw) => draw.t >= marks.started) },
    list,
    refreshMs,
  );
  checkTiming("worker after start", after, media, refreshMs, {
    from: marks.started + 1500,
    toleranceMs: 2,
  });
  assert.equal(marks.heldWhileStopped, 0, "buffers held while stopped");
  assert.ok(producer.detached > 0, "nothing was in the Worker when it went");
  console.log(
    `ok worker, ${stepMs} ms steps: on time; ${producer.released} back, ${producer.detached} detached at destroy`,
  );
}
