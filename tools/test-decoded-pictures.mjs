// Decoded pictures pushed into the deinterlacer: when each field reaches the
// screen against the element's clock, what happens to late and early
// pictures, that one out of order is refused, and that every buffer comes
// back exactly once.
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
/** The renderer's lead for the reading it sends a Worker; see deinterlace.ts. */
const CLOCK_LEAD_MS = 4;
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
  return sourceModule("decoded-video.ts");
}

/** One module of the deinterlacer's sources, built on its own. */
async function sourceModule(file) {
  const directory = await mkdtemp(join(tmpdir(), "yadif-decoded-"));
  const outfile = join(directory, "module.mjs");
  try {
    await build({
      entryPoints: [join(process.cwd(), "packages/yadif/src", file)],
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
 * Pushes pictures and checks that their buffers come back once each. A
 * buffer carries its picture's timestamp and an id in its last 16 bytes,
 * because one that went to a Worker comes back as a different object. One
 * that a Worker took away with it comes back as the detached original.
 */
class Producer {
  constructor(pictures, { window = 0.3, width = WIDTH, height = HEIGHT } = {}) {
    this.pictures = pictures;
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

  /** Push every picture up to `window` ahead of `currentTime`, in presentation order. */
  supply(currentTime, rate) {
    const until = currentTime + this.window * Math.max(1, rate);
    while (
      this.cursor < this.pictures.length &&
      this.pictures[this.cursor].timestamp <= until
    )
      this.push(this.pictures[this.cursor++]);
  }

  /** Start again from the anchor at or before `time`, as a seek does. */
  seek(time) {
    const index = this.pictures.findLastIndex(
      (picture) => picture.timestamp <= time,
    );
    this.cursor = Math.max(0, index - (index % 3));
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
  stalled = null,
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
    pageStalled: stalled && ((vsync) => stalled(BASE_MS + vsync * refreshMs)),
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

// ---------------------------------------------------------------------------
// The media clock on its own, with readings given at chosen times.

{
  const { MediaClock } = await sourceModule("media-clock.ts");
  const READING_MS = 1000 / 60;

  /** Feed `count` readings `READING_MS` apart from `wall`; returns the next wall time and the starts seen. */
  function feed(clock, wall, count, reading, rate = 1) {
    let starts = 0;
    for (let index = 0; index < count; index++, wall += READING_MS)
      if (clock.observe(wall, reading(wall), rate, true)) starts++;
    return { wall, starts };
  }

  // A reading read as the element plays, with two readings taken 1.5 ms
  // apart just as the element moves a little after a hold and then stands
  // still: the reading has never stood between updates, so the clock does
  // not take it for one that steps, and waits for changes at playing pace.
  {
    const clock = new MediaClock();
    let { wall } = feed(clock, 1000, 70, (w) => 10 + (w - 1000) / 1000);
    clock.hold();
    const held = 10 + (wall - 1000) / 1000;
    ({ wall } = feed(clock, wall, 2, () => held));
    const started = clock.observe(
      wall - READING_MS + 1.5,
      held + 0.004,
      1,
      true,
    );
    assert.equal(started, false, "a continuous reading started on one move");
    ({ wall } = feed(clock, wall, 7, () => held + 0.004));
    assert.equal(clock.rate, 0, "the clock ran through the standstill");
    const from = wall;
    const { starts } = feed(
      clock,
      wall,
      4,
      (w) => held + 0.004 + (w - from) / 1000,
    );
    assert.equal(starts, 1, "the clock did not start when the element played");
    console.log(
      "ok clock, continuous reading: two readings close together start nothing",
    );
  }

  // A reading in steps of 40 ms of media, then half the rate, then a seek.
  // The steps are kept in media time, so at the new rate a step is seen to
  // take twice the wall time and the clock, which starts on the first change
  // after the seek, waits that long for the next before taking the start
  // back. A stand kept in wall time would be half as long, and the start
  // would be taken back before the next step came.
  {
    const clock = new MediaClock();
    const stepped = (origin, start, rate) => (w) =>
      start + 0.04 * Math.floor(((w - origin) * rate) / 40);
    let { wall } = feed(clock, 1000, 70, stepped(1000, 10, 1));
    clock.hold();
    const changed = wall;
    // Seek as soon as the clock runs at the new rate, before it has seen a
    // step at that rate: what it knows of the steps is from before.
    for (
      let index = 0;
      index < 40 && clock.rate !== 0.5;
      index++, wall += READING_MS
    )
      clock.observe(wall, stepped(changed, 11, 0.5)(wall), 0.5, true);
    assert.equal(clock.rate, 0.5, "the clock did not run at the new rate");
    clock.hold();
    ({ wall } = feed(clock, wall, 2, () => 20, 0.5));
    const seeked = wall;
    let firstChangeStarted = null;
    let starts = 0;
    let stopped = false;
    for (let index = 0; index < 30; index++, wall += READING_MS) {
      const reading =
        20 + 0.01 + 0.04 * Math.floor(((wall - seeked) * 0.5) / 40);
      const started = clock.observe(wall, reading, 0.5, true);
      if (started) starts++;
      if (firstChangeStarted === null && reading !== 20)
        firstChangeStarted = started;
      if (starts > 0 && clock.rate === 0) stopped = true;
    }
    assert.equal(
      firstChangeStarted,
      true,
      "the clock waited for a second change",
    );
    assert.equal(starts, 1, `the clock started ${starts} times`);
    assert.equal(stopped, false, "the start was taken back");
    console.log(
      "ok clock, stepped reading after a rate change: starts on the first change",
    );
  }

  // Chromium at a start: the reading runs ahead with wall time for one audio
  // callback, about 20 ms, while the device is still playing the silence it
  // began with; then it is clamped where it got to until the sound, which
  // starts from where the element was held, catches up. The clock does not
  // run on the early move: it starts on the line the sound is on.
  {
    const clock = new MediaClock();
    let { wall } = feed(clock, 1000, 70, (w) => 10 + (w - 1000) / 1000);
    clock.hold();
    const held = 20;
    ({ wall } = feed(clock, wall, 2, () => held));
    const resumed = wall;
    const sound = resumed + 50;
    const truth = (w) => held + Math.max(0, w - sound) / 1000;
    const reading = (w) =>
      w < resumed + READING_MS
        ? held + 0.002
        : Math.max(held + 0.019, truth(w));
    let startedAt = null;
    for (let index = 0; index < 20; index++, wall += READING_MS)
      if (clock.observe(wall, reading(wall), 1, true) && startedAt === null)
        startedAt = wall;
    assert.ok(startedAt !== null, "the clock never started");
    assert.ok(
      startedAt > sound + 19,
      "the clock started before the reading followed the sound",
    );
    const off = (clock.at(wall) - truth(wall)) * 1000;
    assert.ok(Math.abs(off) <= 2, `${off.toFixed(2)} ms off the sound`);
    console.log(
      "ok clock, continuous reading that runs ahead and stands: starts with the sound",
    );
  }

  // The element stops in mid-playback without saying so. A running clock
  // stops once the reading has stood longer than it does between updates and
  // one reading more, and runs again when the reading moves on: with a
  // reading read as it plays, and with one in steps of 40 ms.
  for (const [label, stepMs, standMs] of [
    ["continuous", 0, 60],
    ["stepped", 40, 120],
  ]) {
    const clock = new MediaClock();
    const at = (origin, start) => (w) =>
      start +
      (stepMs === 0
        ? (w - origin) / 1000
        : 0.04 * Math.floor((w - origin) / stepMs));
    let { wall } = feed(clock, 1000, 70, at(1000, 10));
    assert.ok(clock.rate === 1, `${label}: the clock is not running`);
    const stopAt = wall;
    const stopped = at(1000, 10)(wall);
    let ranAhead = 0;
    let stops = 0;
    for (; wall < stopAt + standMs; wall += READING_MS) {
      clock.observe(wall, stopped, 1, true);
      if (clock.rate === 0) stops++;
      else ranAhead = Math.max(ranAhead, (clock.at(wall) - stopped) * 1000);
    }
    assert.ok(
      stops > 0,
      `${label}: the clock ran through a ${standMs} ms standstill`,
    );
    const bound = (stepMs === 0 ? 0 : 40) + 2 * READING_MS + 2;
    assert.ok(
      ranAhead <= bound,
      `${label}: ${ranAhead.toFixed(1)} ms ahead before it stopped`,
    );
    const { starts } = feed(clock, wall, 12, at(wall, stopped));
    assert.equal(
      starts,
      1,
      `${label}: started ${starts} times after the standstill`,
    );
    console.log(
      `ok clock, ${label} reading stands mid-playback: stopped within ${ranAhead.toFixed(1)} ms, started again once`,
    );
  }

  // A stepped reading whose update comes late: the clock stops when it is
  // overdue, and the late update, which moves as far as the time the reading
  // stood, starts it again at once.
  {
    const clock = new MediaClock();
    const stepped = (origin, start) => (w) =>
      start + 0.04 * Math.floor((w - origin) / 40);
    let { wall } = feed(clock, 1000, 70, stepped(1000, 10));
    const last = stepped(1000, 10)(wall);
    // The update due next is held back for 100 ms; then the reading is where
    // playing would have taken it.
    const resumeAt = wall + 100;
    let stopped = false;
    for (; wall < resumeAt; wall += READING_MS) {
      clock.observe(wall, last, 1, true);
      if (clock.rate === 0) stopped = true;
    }
    assert.ok(stopped, "the clock ran on past the overdue update");
    // The reading is where playing took it while the update was held back.
    const started = clock.observe(wall, stepped(1000, 10)(wall), 1, true);
    assert.equal(
      started,
      true,
      "the late update did not start the clock again",
    );
    console.log(
      "ok clock, stepped reading with a late update: starts again at once",
    );
  }

  // A reading read as the element plays that once happened to repeat is not
  // taken for one that steps: after a hold the clock still waits for changes
  // at playing pace and does not run on the first.
  {
    const clock = new MediaClock();
    let wall = 1000;
    for (let index = 0; index < 70; index++, wall += READING_MS) {
      const w = index === 40 ? wall - READING_MS : wall;
      clock.observe(wall, 10 + (w - 1000) / 1000, 1, true);
    }
    clock.hold();
    const held = 20;
    ({ wall } = feed(clock, wall, 2, () => held));
    const from = wall;
    const started = clock.observe(wall, held + READING_MS / 1000, 1, true);
    assert.equal(
      started,
      false,
      "one repeated reading made the reading stepped",
    );
    const { starts } = feed(
      clock,
      wall + READING_MS,
      4,
      (w) => held + (w - from) / 1000 + READING_MS / 1000,
    );
    assert.equal(
      starts,
      1,
      "the clock did not start on changes at playing pace",
    );
    console.log(
      "ok clock, one repeated reading: still waits for changes at playing pace",
    );
  }

  // A stepped reading after the rate falls: the steps are as long in media
  // time as before and so take longer, and each was seen a whole number of
  // readings, up to a reading short of the step. The first longer stand stops
  // the clock; the update that ends it moves at playing pace over the whole
  // stand, which is then known, and the clock plays on without stopping
  // again, wherever the updates fall between the readings.
  for (const [from, to] of [
    [1.25, 0.5],
    [1.5, 0.25],
  ]) {
    let mostStoppedMs = 0;
    for (let phase = 0; phase < 10; phase++) {
      const clock = new MediaClock();
      const offset = (phase * READING_MS) / 10;
      const stepped = (origin, start, rate) => (w) =>
        start + 0.04 * Math.floor(((w - origin - offset) * rate) / 40);
      let { wall } = feed(clock, 1000, 70, stepped(1000, 10, from), from);
      const changed = wall;
      const start = stepped(1000, 10, from)(wall);
      // Once the clock has run at the new rate, every reading it spends
      // stopped counts.
      let running = false;
      let stoppedMs = 0;
      for (let index = 0; index < 240; index++, wall += READING_MS) {
        clock.observe(wall, stepped(changed, start, to)(wall), to, true);
        if (clock.rate > 0) running = true;
        else if (running) stoppedMs += READING_MS;
      }
      mostStoppedMs = Math.max(mostStoppedMs, stoppedMs);
    }
    assert.ok(
      mostStoppedMs <= 4 * READING_MS,
      `rate ${from} to ${to}: stopped for ${mostStoppedMs.toFixed(0)} ms of 4 s`,
    );
    console.log(
      `ok clock, stepped reading from rate ${from} to ${to}: stopped ${mostStoppedMs.toFixed(0)} ms at most, then played on`,
    );
  }

  // A start still to be confirmed, where the reading steps, followed by a
  // change too small for playing: the element only moved a little, and the
  // start is taken back.
  {
    const clock = new MediaClock();
    const stepped = (origin, start) => (w) =>
      start + 0.04 * Math.floor((w - origin) / 40);
    let { wall } = feed(clock, 1000, 70, stepped(1000, 10));
    clock.hold();
    const held = 20;
    ({ wall } = feed(clock, wall, 2, () => held));
    const started = clock.observe(wall, held + 0.01, 1, true);
    assert.equal(
      started,
      true,
      "a stepped reading did not start on its first change",
    );
    ({ wall } = feed(clock, wall + READING_MS, 1, () => held + 0.01));
    clock.observe(wall, held + 0.012, 1, true);
    assert.equal(
      clock.rate,
      0,
      "a start followed by a change too small for playing held",
    );
    console.log("ok clock, start followed by too small a change: taken back");
  }

  // A reading read as the element plays stands in mid-playback and then
  // jumps to where playing would have taken it: an update that came late.
  // The clock, stopped on the standstill, waits for the change after, which
  // shows the element playing, and is then where the element is.
  {
    const clock = new MediaClock();
    const playing = (w) => 10 + (w - 1000) / 1000;
    let { wall } = feed(clock, 1000, 70, playing);
    const stuck = playing(wall);
    const stuckAt = wall;
    for (; wall < stuckAt + 60; wall += READING_MS)
      clock.observe(wall, stuck, 1, true);
    assert.equal(clock.rate, 0, "the clock ran through the standstill");
    const late = clock.observe(wall, playing(wall), 1, true);
    assert.equal(
      late,
      false,
      "a continuous reading started on one late update",
    );
    wall += READING_MS;
    const next = clock.observe(wall, playing(wall), 1, true);
    assert.equal(
      next,
      true,
      "the change after the late update did not start the clock",
    );
    const off = (clock.at(wall + 50) - playing(wall + 50)) * 1000;
    assert.ok(Math.abs(off) <= 2, `${off.toFixed(2)} ms off the element`);
    console.log(
      "ok clock, continuous reading with a late update: starts on the change after",
    );
  }

  // Chromium's early move spread over three readings at playing pace: the
  // clock does run on it, and stops again two readings into the standstill
  // that follows; when the sound comes it starts on the sound.
  {
    const clock = new MediaClock();
    let { wall } = feed(clock, 1000, 70, (w) => 10 + (w - 1000) / 1000);
    clock.hold();
    const held = 20;
    ({ wall } = feed(clock, wall, 2, () => held));
    const resumed = wall;
    const sound = resumed + 90;
    const truth = (w) => held + Math.max(0, w - sound) / 1000;
    const moves = [0.002, 0.019, 0.036];
    const reading = (w) => {
      const index = Math.round((w - resumed) / READING_MS);
      return index < moves.length
        ? held + moves[index]
        : Math.max(held + moves.at(-1), truth(w));
    };
    let ahead = 0;
    let stopped = false;
    let ran = false;
    for (let index = 0; index < 24; index++, wall += READING_MS) {
      clock.observe(wall, reading(wall), 1, true);
      if (clock.rate > 0) {
        ran = true;
        ahead = Math.max(ahead, (clock.at(wall) - truth(wall)) * 1000);
      } else if (ran) stopped = true;
    }
    assert.ok(stopped, "the clock ran on through the standstill");
    const bound = 36 + 2 * READING_MS + 2;
    assert.ok(ahead <= bound, `${ahead.toFixed(1)} ms ahead of the sound`);
    const off = (clock.at(wall) - truth(wall)) * 1000;
    assert.ok(
      Math.abs(off) <= 2,
      `${off.toFixed(2)} ms off the sound at the end`,
    );
    console.log(
      `ok clock, early move over three readings: ${ahead.toFixed(1)} ms ahead at most, then with the sound`,
    );
  }

  /**
   * An element started as Chromium starts one, on `clock` from `wall`, after a
   * second of playing to have the reading's behaviour seen. The sound starts
   * from `held` at `soundAt` ms after the reading first moves (negative: it
   * was already playing) and plays on at `rate`. The reading leads the sound
   * by `lead` ms at that first move, the device's output delay it leaves out;
   * as in Edge's recordings it goes on at playing pace for `climbMs` more and
   * then stands until the sound catches up, or with `creep` moves on by 4 ms
   * a reading, slower than playing, from two readings after it stood.
   * `stoodFirst` keeps the reading at `held` for one reading more, as after
   * a late `seeked`. `hold` is how the element is stopped first: "pause"
   * (readings of an element not playing; its first playing reading has
   * moved), "seek" (a hold, readings of an element not playing, a hold at
   * seeked, then a playing reading at `held`), "zero" (a
   * rate of 0, then a reading at `held` at the rate it plays at) or "rate"
   * (the same from another rate it played at). Returns the wall time after
   * it and, for each reading while the clock waited, the clock's position
   * and the sound at the next refresh, and the reading and whether the sound
   * had caught it up.
   */
  function chromiumStart(
    clock,
    wall,
    {
      held = 100,
      soundAt,
      lead = 52,
      climbMs = 20,
      creep = false,
      rate = 1,
      stoodFirst = false,
      hold = "seek",
      from = rate,
    },
  ) {
    const before = hold === "rate" ? from : rate;
    let position = held - 1;
    for (let index = 0; index < 60; index++, wall += READING_MS) {
      clock.observe(wall, position, before, true);
      position += (before * READING_MS) / 1000;
    }
    if (hold === "pause") {
      for (let index = 0; index < 2; index++, wall += READING_MS)
        clock.observe(wall, held, rate, false);
    } else if (hold === "seek") {
      // Held at seeking and again at seeked, as the renderer holds it.
      clock.hold();
      for (let index = 0; index < 2; index++, wall += READING_MS)
        clock.observe(wall, held, rate, false);
      clock.hold();
      clock.observe(wall, held, rate, true);
      wall += READING_MS;
    } else {
      for (let index = 0; index < 2; index++, wall += READING_MS)
        clock.observe(wall, held, hold === "zero" ? 0 : from, true);
      clock.observe(wall, held, rate, true);
      wall += READING_MS;
    }
    if (stoodFirst) {
      clock.observe(wall, held, rate, true);
      wall += READING_MS;
    }
    const moves = wall;
    const line = (w) => held + (rate * (w - moves - soundAt)) / 1000;
    const sound = (w) => Math.max(held, line(w));
    const early = line(moves) + (rate * lead) / 1000;
    const creepFrom = climbMs + 2 * READING_MS;
    const ahead = (w) => {
      const since = w - moves;
      const crept =
        creep && since > creepFrom
          ? 4 * Math.floor((since - creepFrom) / READING_MS + 1e-9)
          : 0;
      return early + (rate * (Math.min(climbMs, since) + crept)) / 1000;
    };
    // The position is asked for the coming refresh, a reading after the last
    // was taken, as the renderer asks for it.
    const waits = [];
    for (let index = 0; index < 40; index++, wall += READING_MS) {
      const r = Math.max(ahead(wall), line(wall));
      clock.observe(wall, r, rate, true);
      const next = wall + READING_MS;
      if (clock.rate === 0)
        waits.push({
          wall,
          at: clock.at(next),
          sound: sound(next),
          reading: r,
          caught: line(wall) >= ahead(wall),
        });
    }
    return { wall, waits };
  }

  /** The furthest a waiting position was from the sound, in ms; and from the reading. */
  const offSound = (waits) =>
    Math.max(0, ...waits.map((w) => Math.abs(w.at - w.sound) * 1000));
  const offReading = (waits) =>
    Math.max(0, ...waits.map((w) => Math.abs(w.at - w.reading) * 1000));

  // Seeks and resumes in Chromium: until three starts have been seen the
  // position while waiting is the reading; once they have, the clock knows
  // how far the reading leads the sound and the position is the sound's. A
  // seek's sound starts after the reading first moves, a resume's before;
  // the lead is the same. (The playing before the first seek is itself a
  // start, so the third is seen during the second or third seek.)
  for (const [label, soundAt, hold] of [
    ["seek", 40, "seek"],
    ["resume", -10, "pause"],
  ]) {
    const clock = new MediaClock();
    let wall = 1000;
    for (let start = 0; start < 6; start++) {
      const result = chromiumStart(clock, wall, { soundAt, hold });
      wall = result.wall;
      assert.ok(
        result.waits.length > 0,
        `${label} ${start}: the clock did not wait`,
      );
      if (start === 0)
        assert.ok(
          offReading(result.waits) <= 1e-6,
          `${label} ${start}: the position left the reading before anything was learnt`,
        );
      else if (start >= 3)
        assert.ok(
          offSound(result.waits) <= 1,
          `${label} ${start}: ${offSound(result.waits).toFixed(2)} ms off the sound while waiting`,
        );
    }
    console.log(
      `ok clock, Chromium ${label}: on the sound from the fourth start`,
    );
  }

  // Held at a rate of 0 and played again: a start like a seek, learnt and
  // used. A change between two rates it plays at stops nothing: neither
  // used nor learnt. (The reading is made to look like a start there, with
  // twice the lead, so that a lead learnt from it would show at the seek
  // after.)
  {
    const clock = new MediaClock();
    let wall = 1000;
    for (let start = 0; start < 4; start++)
      ({ wall } = chromiumStart(clock, wall, { soundAt: 40, hold: "zero" }));
    const held = chromiumStart(clock, wall, { soundAt: 40, hold: "zero" });
    assert.ok(
      offSound(held.waits) <= 1,
      "a start from a rate of 0 is not on the sound",
    );
    wall = held.wall;
    for (let change = 0; change < 3; change++) {
      const changed = chromiumStart(clock, wall, {
        soundAt: 92,
        lead: 104,
        hold: "rate",
        from: 1.5,
      });
      wall = changed.wall;
      assert.ok(
        offReading(changed.waits) <= 1e-6,
        "a change between two rates used the lead",
      );
    }
    const seek = chromiumStart(clock, wall, { soundAt: 40 });
    assert.ok(
      offSound(seek.waits) <= 1,
      "a lead was learnt from a change between two rates",
    );
    console.log(
      "ok clock, Chromium start from a rate of 0: learnt and used; a rate change: neither",
    );
  }

  // A reading that creeps on after it stood, slower than playing: not where
  // the sound is, and the position stays the sound's. (With a lead of 80 ms,
  // as where Edge's recordings show a creep, it stands long enough to.)
  {
    const clock = new MediaClock();
    let wall = 1000;
    const shape = { soundAt: 68, lead: 80 };
    for (let start = 0; start < 4; start++)
      ({ wall } = chromiumStart(clock, wall, shape));
    const crept = chromiumStart(clock, wall, { ...shape, creep: true });
    assert.ok(
      offSound(crept.waits) <= 1,
      `${offSound(crept.waits).toFixed(2)} ms off the sound with a creeping reading`,
    );
    console.log(
      "ok clock, Chromium reading that creeps after it stood: the sound",
    );
  }

  // A reading that leads the sound by less than a reading, as Firefox's
  // does now and then: no lead worth going by, the position is the reading.
  {
    const clock = new MediaClock();
    let wall = 1000;
    for (let start = 0; start < 6; start++) {
      const result = chromiumStart(clock, wall, {
        soundAt: 5,
        lead: 10,
        climbMs: 0,
      });
      wall = result.wall;
      assert.ok(
        offReading(result.waits) <= 1e-6,
        `start ${start}: a lead shorter than a reading was used`,
      );
    }
    console.log("ok clock, lead shorter than a reading: the reading");
  }

  // A reading that stands at the held position for a reading before it
  // moves, as after a late seeked: the position is the reading.
  {
    const clock = new MediaClock();
    let wall = 1000;
    for (let start = 0; start < 4; start++)
      ({ wall } = chromiumStart(clock, wall, { soundAt: 40 }));
    const late = chromiumStart(clock, wall, { soundAt: 40, stoodFirst: true });
    assert.ok(
      offReading(late.waits) <= 1e-6,
      "a reading that stood first used the lead",
    );
    console.log(
      "ok clock, Chromium start whose reading stood first: the reading",
    );
  }

  // The output delay grows: the lead learnt is too short, and the sound
  // worked out runs ahead of the real one; never past the reading and the
  // time since it was read. The middle of three starts takes the new lead
  // at the second start of it, and the position is the sound's again.
  // The delay shrinks: the lead is too long, and the sound worked out falls
  // behind; never behind a reading that has moved on at playing pace.
  {
    const clock = new MediaClock();
    let wall = 1000;
    for (let start = 0; start < 4; start++)
      ({ wall } = chromiumStart(clock, wall, { soundAt: 40 }));
    let worst = 0;
    for (let start = 0; start < 3; start++) {
      const result = chromiumStart(clock, wall, { soundAt: 70, lead: 82 });
      wall = result.wall;
      for (const w of result.waits)
        worst = Math.max(worst, (w.at - w.reading) * 1000 - READING_MS);
      if (start === 2)
        assert.ok(
          offSound(result.waits) <= 1,
          "the longer lead was not learnt",
        );
    }
    assert.ok(
      worst <= 1e-6,
      `${worst.toFixed(2)} ms past the reading and its age`,
    );
    let behind = 0;
    for (let start = 0; start < 3; start++) {
      // With so short a delay there is no room for the reading to go on
      // before it stands: it stands at its first move.
      const result = chromiumStart(clock, wall, {
        soundAt: 10,
        lead: 22,
        climbMs: 0,
      });
      wall = result.wall;
      for (const w of result.waits)
        if (w.caught) behind = Math.max(behind, (w.reading - w.at) * 1000);
    }
    assert.ok(
      behind <= 1e-6,
      `${behind.toFixed(2)} ms behind a reading that moved on`,
    );
    console.log(
      "ok clock, Chromium lead too short or too long: bounded, then learnt",
    );
  }

  // One start the element makes differently, here with twice the lead,
  // does not move what the clock goes by: the next start is on the sound.
  {
    const clock = new MediaClock();
    let wall = 1000;
    for (let start = 0; start < 5; start++)
      ({ wall } = chromiumStart(clock, wall, { soundAt: 40 }));
    ({ wall } = chromiumStart(clock, wall, { soundAt: 92, lead: 104 }));
    const next = chromiumStart(clock, wall, { soundAt: 40 });
    assert.ok(
      offSound(next.waits) <= 1,
      `${offSound(next.waits).toFixed(2)} ms off the sound after one odd start`,
    );
    console.log("ok clock, one odd Chromium start: the lead stays");
  }

  // At twice the rate the lead is the same wall time, and the position is
  // the sound's at that rate.
  {
    const clock = new MediaClock();
    let wall = 1000;
    let last = null;
    for (let start = 0; start < 5; start++)
      ({ wall, waits: last } = chromiumStart(clock, wall, {
        soundAt: 40,
        rate: 2,
      }));
    assert.ok(
      offSound(last) <= 1,
      `${offSound(last).toFixed(2)} ms off the sound at rate 2`,
    );
    console.log("ok clock, Chromium seek at rate 2: on the sound");
  }

  // A reading in steps, as Firefox's: it trails the sound, so whatever the
  // clock learns is no lead, and one start with a 100 ms early move does not
  // make one. The position while waiting is the reading throughout.
  {
    const clock = new MediaClock();
    let wall = 1000;
    const stepped = (origin, start) => (w) =>
      start + 0.04 * Math.floor((w - origin) / 40);
    let worst = 0;
    for (let start = 0; start < 7; start++) {
      const begin = wall;
      ({ wall } = feed(clock, wall, 60, stepped(begin, 100 + start)));
      clock.hold();
      ({ wall } = feed(clock, wall, 2, () => 200 + start));
      const moves = wall;
      const odd = start === 3 ? 0.1 : 0;
      for (let index = 0; index < 20; index++, wall += READING_MS) {
        const r =
          200 + start + odd + 0.01 + 0.04 * Math.floor((wall - moves) / 40);
        clock.observe(wall, r, 1, true);
        if (clock.rate === 0)
          worst = Math.max(worst, Math.abs(clock.at(wall) - r) * 1000);
      }
    }
    assert.ok(
      worst <= 1e-6,
      `${worst.toFixed(2)} ms off the reading while waiting`,
    );
    console.log(
      "ok clock, stepped reading: no lead learnt, the reading while waiting",
    );
  }

  // A reading that changes while the rate is 0 starts nothing, and the
  // position stays a number; a hold while the lead is in use leaves the
  // position unknown until the next reading.
  {
    const clock = new MediaClock();
    let wall = 1000;
    for (let start = 0; start < 4; start++)
      ({ wall } = chromiumStart(clock, wall, { soundAt: 40 }));
    for (let index = 0; index < 6; index++, wall += READING_MS) {
      const started = clock.observe(wall, 300 + index * 0.003, 0, true);
      assert.equal(started, false, "a start at a rate of 0");
      assert.ok(Number.isFinite(clock.at(wall)), "the position is no number");
    }
    const held = 400;
    clock.observe(wall, held, 1, true);
    wall += READING_MS;
    clock.observe(wall, held + 0.052, 1, true);
    clock.hold();
    assert.ok(Number.isNaN(clock.at(wall + 5)), "known across a hold");
    console.log(
      "ok clock, rate 0 and a hold while waiting: nothing started, nothing assumed",
    );
  }
}

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

// A picture that does not come after the one pushed before it is refused,
// its buffer comes back, and the pictures around it play on.
{
  const pictures = stream({ count: 300 });
  const media = playing();
  const producer = new Producer(pictures);
  const push = producer.push.bind(producer);
  const errors = [];
  producer.push = (picture) => {
    // One picture comes after its successor, as decode order would have it.
    if (picture === pictures[151]) return;
    try {
      push(picture);
    } catch (error) {
      errors.push(error);
    }
    if (picture === pictures[152]) {
      try {
        push(pictures[151]);
      } catch (error) {
        errors.push(error);
      }
    }
  };
  const { result, refreshMs, stats } = await play({
    seconds: 8,
    media,
    pictures,
    producer,
  });
  assert.equal(errors.length, 1, "the picture out of order was not refused");
  // The page's realm made it, so it is not this realm's RangeError.
  assert.equal(errors[0].name, "RangeError", String(errors[0]));
  const list = outputs(pictures);
  const shown = appearances(result, list, refreshMs);
  checkTiming("out of order", shown, media, refreshMs, {
    from: BASE_MS + 1000,
    toleranceMs: 1.5,
  });
  assert.equal(stats.missed, 0, "a refused picture is not a dropped one");
  assert.ok(
    !shown.some((output) =>
      output.key.startsWith(pictures[151].timestamp.toFixed(6)),
    ),
    "the refused picture went up",
  );
  console.log(
    "ok out of order: a picture after its successor is refused and its buffer comes back",
  );
}

// After a seek the producer has nothing ahead of the playhead: the pictures
// from the one the seek lands in arrive together, in presentation order,
// just after playback has started again. None of them is dropped, and the
// one the seek landed in goes up first.
{
  const pictures = stream({ count: 400 });
  const media = playing();
  const seekTo = pictures[220].timestamp + FRAME * 0.4;
  const marks = {};
  let supplying = true;
  const steps = timeline(
    [
      4,
      (control, context) => {
        control.video.seeking = true;
        event(control, "seeking");
        event(control, "waiting");
        context.deinterlacer.decodedVideo.reset();
        media.set(control.now(), seekTo, 0);
        context.producer.seek(seekTo);
        supplying = false;
      },
    ],
    [
      4.5,
      (control) => {
        control.video.seeking = false;
        event(control, "seeked");
        media.set(control.now(), seekTo, 1);
        event(control, "playing");
        marks.played = control.now();
      },
    ],
    [
      4.505,
      () => {
        supplying = true;
      },
    ],
  );
  const { result, refreshMs, stats } = await play({
    seconds: 7,
    media,
    pictures,
    supply: false,
    script: (vsync, control, context) => {
      steps(control, context);
      if (supplying && !control.video.seeking)
        context.producer.supply(control.video.currentTime, 1);
    },
  });
  assert.equal(stats.missed, 0, `${stats.missed} pictures dropped`);
  const first = canvasDraws(result, marks.played)[0];
  assert.equal(
    first.picture.mediaTime,
    pictures[220].timestamp,
    "the picture the seek landed in did not go up first",
  );
  const list = outputs(pictures);
  checkTiming(
    "after a seek",
    appearances(result, list, refreshMs),
    media,
    refreshMs,
    { from: marks.played + 100, toleranceMs: 1.5 },
  );
  console.log(
    "ok seek: pictures arriving at the playhead in order are all shown",
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
  // The 0.3 s supplied ahead covers the first half of the 0.6 s stall; the
  // pictures of the second half have passed when it ends, but for the newest.
  const passed = Math.floor(0.3 / FRAME) - 1;
  assert.ok(
    stats.missed >= passed,
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

// Pictures a jump leaves behind were never due, so none of them counts as
// missed or late: neither those queued ahead of the old position, which the
// element has already left one refresh before it says it is seeking (a click
// is handled at the start of a frame, its events after the frame), nor the
// pictures a seek's target is given as the filter's neighbours.
for (const paused of [false, true]) {
  const pictures = stream({ count: 900 });
  const media = playing();
  // Late in a picture that has two pictures between its anchor and itself.
  const target = pictures[599];
  const seekTo = target.timestamp + FRAME * 0.6;
  const marks = {};
  let supplying = true;
  const announce = (control, context) => {
    event(control, "seeking");
    context.deinterlacer.decodedVideo.reset();
    context.producer.seek(seekTo);
    supplying = true;
    marks.reset = control.now();
  };
  const steps = timeline(
    [
      2,
      (control) => {
        if (!paused) return;
        media.set(control.now(), media.truth(control.now()), 0);
        control.video.paused = true;
        event(control, "pause");
      },
    ],
    [
      3,
      (control, context) => {
        media.set(control.now(), seekTo, 0);
        control.video.seeking = true;
        supplying = false;
        marks.jumped = control.now();
      },
    ],
    [
      3.2,
      (control) => {
        media.set(control.now(), seekTo, 1);
        control.video.seeking = false;
        control.video.paused = false;
        event(control, "seeked");
        if (paused) event(control, "play");
        event(control, "playing");
        marks.played = control.now();
      },
    ],
  );
  const { result, refreshMs, stats } = await play({
    seconds: 8,
    media,
    pictures,
    supply: false,
    script: (vsync, control, context) => {
      const jumped = marks.jumped;
      steps(control, context);
      // The refresh after the jump.
      if (jumped !== undefined && marks.reset === undefined)
        announce(control, context);
      if (supplying) context.producer.supply(control.video.currentTime, 1);
    },
  });
  const label = paused ? "paused" : "playing";
  assert.equal(stats.missed, 0, `${label}: ${stats.missed} pictures missed`);
  // One field is passed over where the clock starts to run: held, the
  // canvas shows the position as it is, and running, the position at the
  // coming refresh.
  const before = result.stats.findLast((entry) => entry.t <= marks.jumped);
  assert.ok(
    stats.late - before.late <= 1,
    `${label}: ${stats.late - before.late} outputs late over the jump`,
  );
  // Until a picture of the new position is there, the canvas keeps what it
  // showed.
  assert.equal(
    canvasDraws(result, marks.jumped, marks.reset).length,
    0,
    `${label}: put up a picture the jump left behind`,
  );
  // The picture before the target is its neighbour in the filter, for both
  // fields, and is not itself shown.
  const fields = result.draws.filter(
    (draw) =>
      draw.filter &&
      !draw.comb &&
      Math.abs(draw.picture.mediaTime - target.timestamp) < 1e-6,
  );
  assert.deepEqual(
    fields.map((draw) => [draw.picture.second, draw.prev]),
    [
      [0, pictures[598].timestamp],
      [1, pictures[598].timestamp],
    ],
    label,
  );
  // Seeking, the field whose time it is; paused, the picture's first.
  const still = canvasDraws(result, marks.reset, marks.played);
  assert.ok(still.length > 0, label);
  for (const draw of still) {
    assert.equal(draw.picture.mediaTime, target.timestamp, label);
    assert.equal(draw.picture.second, paused ? 0 : 1, label);
  }
  const shown = appearances(
    { draws: canvasDraws(result, marks.played) },
    outputs(pictures),
    refreshMs,
  );
  checkTiming(label, shown, media, refreshMs, {
    from: marks.played + 100,
    toleranceMs: 2,
  });
  console.log(
    `ok jump, ${label}: nothing counted, nothing of the old position shown, neighbour used`,
  );
}

// An element that has been told to play may move its time by a few
// milliseconds and then stand still before it really starts. The clock does
// not run on that first move, so nothing goes up ahead of its time, whether
// the page or a Worker renders.
for (const rendering of ["main", "worker"])
  for (const [moveAtMs, startAtMs] of [
    [30, 170],
    [105, 160],
  ]) {
    const pictures = stream({ count: 900 });
    const media = playing();
    const seekTo = pictures[599].timestamp + FRAME * 0.6;
    const moved = seekTo + 0.004;
    const marks = {};
    let supplying = true;
    const steps = timeline(
      [
        3,
        (control, context) => {
          media.set(control.now(), seekTo, 0);
          control.video.seeking = true;
          event(control, "seeking");
          context.deinterlacer.decodedVideo.reset();
          context.producer.seek(seekTo);
        },
      ],
      [
        3.2,
        (control) => {
          control.video.seeking = false;
          event(control, "seeked");
          event(control, "playing");
          marks.played = control.now();
        },
      ],
    );
    const { result, refreshMs, stats } = await play({
      seconds: 8,
      media,
      pictures,
      rendering,
      supply: false,
      script: (vsync, control, context) => {
        steps(control, context);
        const now = control.now();
        if (marks.played !== undefined) {
          if (marks.moved === undefined && now >= marks.played + moveAtMs) {
            media.set(now, moved, 0);
            marks.moved = now;
          }
          if (marks.started === undefined && now >= marks.played + startAtMs) {
            media.set(now, moved, 1);
            marks.started = now;
          }
        }
        if (supplying) context.producer.supply(control.video.currentTime, 1);
      },
    });
    const shown = appearances(
      { draws: canvasDraws(result, marks.played) },
      outputs(pictures),
      refreshMs,
    );
    let early = 0;
    for (const output of shown) {
      const wall = BASE_MS + output.refresh * refreshMs;
      const truth =
        wall >= marks.started
          ? moved + (wall - marks.started) / 1000
          : wall >= marks.moved
            ? moved
            : seekTo;
      early = Math.max(early, (output.time - truth) * 1000);
    }
    const label = `${rendering}, moved at ${moveAtMs} ms, started at ${startAtMs} ms`;
    assert.ok(
      early <= 2,
      `${label}: an output went up ${early.toFixed(2)} ms before its time`,
    );
    checkTiming(label, shown, media, refreshMs, {
      from: marks.started + 100,
      toleranceMs: 2,
    });
    assert.equal(stats.missed, 0, label);
    console.log(`ok start, ${label}: nothing ahead of its time`);
  }

// An element that publishes its position in steps, as Firefox does every
// 40 ms of media: after `set`, the reading stays where it was set until
// `phaseMs` of playing have passed, and from then on moves a step at a time.
// With `stepMs` 0 it is read as it plays, as Chromium's is.
class SteppedMedia {
  constructor(stepMs) {
    this.stepMs = stepMs;
    /** A reading below this is reported as this, as Chromium never reports time going back. */
    this.floor = Number.NEGATIVE_INFINITY;
    /** The wall time from which the floor holds. */
    this.floorAt = Number.NEGATIVE_INFINITY;
    /** How far the floor goes on rising after that, at playing pace at a rate of 1, in ms. */
    this.floorRiseMs = 0;
    this.set(BASE_MS, 0, 0);
  }

  set(wall, media, rate, phaseMs = 0) {
    Object.assign(this, { wall, media, rate, phaseMs });
  }

  truth(wall) {
    return this.media + (this.rate * Math.max(0, wall - this.wall)) / 1000;
  }

  reading(wall) {
    const reading = this.#reading(wall);
    // A reading taken at `floorAt` may be stamped a little before it.
    if (wall < this.floorAt - 1) return reading;
    const rise = Math.min(this.floorRiseMs, Math.max(0, wall - this.floorAt));
    return Math.max(this.floor + rise / 1000, reading);
  }

  /** From the reading at `wall` on, never below `floor`, which rises for `riseMs`. */
  setFloor(wall, floor, riseMs = 0) {
    Object.assign(this, { floor, floorAt: wall, floorRiseMs: riseMs });
  }

  #reading(wall) {
    if (this.rate === 0) return this.media;
    const since = wall - this.wall - this.phaseMs;
    if (since < 0) return this.media;
    if (this.stepMs === 0) return this.truth(wall);
    const step = (this.stepMs * Math.floor(since / this.stepMs)) / 1000;
    return this.media + this.rate * (this.phaseMs / 1000 + step);
  }
}

/**
 * Seek back by about `backSeconds`, inside the buffer, at `seekAt` seconds
 * while the reading moves in steps (or, with `continuous`, as it plays). The
 * sound starts `soundMs` after `seeked`, and the reading's first update comes
 * `phaseMs` of playing after that; `standUntilMs`, if given, makes the
 * reading move by 2 ms at its first update and then stand until that long
 * after `seeked`, as an element that has not really started does. With
 * `earlyMs` as well, the reading moves 2 ms and at the next reading the rest
 * of `earlyMs`, and the sound then starts from the target, the reading held
 * where the move took it until the sound catches up: Chromium extrapolating
 * its first audio callback from wall time.
 */
async function steppedSeek({
  rendering,
  rate = 1,
  continuous = false,
  seekAt = 4,
  backSeconds = 2,
  fraction,
  phaseMs,
  soundMs = 30,
  standUntilMs = null,
  earlyMs = null,
}) {
  const pictures = stream({ count: Math.ceil((8 * rate + 2) / FRAME) });
  const media = new SteppedMedia(continuous ? 0 : 40 / rate);
  const moveSeconds = earlyMs === null ? 0.002 : earlyMs / 1000;
  media.set(BASE_MS + 10, 0, rate);
  const seekTo =
    pictures[Math.floor(((seekAt - backSeconds) * rate) / FRAME)].timestamp +
    FRAME * fraction;
  // Where playback really is: at the target until the sound starts, which
  // starts from where the reading moved to unless Chromium's early move is
  // modelled.
  const start =
    standUntilMs === null || earlyMs !== null ? seekTo : seekTo + moveSeconds;
  const marks = {};
  let supplying = true;
  const steps = timeline(
    [
      seekAt,
      (control, context) => {
        marks.seeking = control.now();
        control.video.seeking = true;
        event(control, "seeking");
        event(control, "waiting");
        context.deinterlacer.decodedVideo.reset();
        media.set(control.now(), seekTo, 0);
        context.producer.seek(seekTo);
        supplying = false;
      },
    ],
    [
      seekAt + 0.002,
      (control) => {
        control.video.seeking = false;
        event(control, "seeked");
        event(control, "playing");
        marks.played = control.now();
        supplying = true;
      },
    ],
  );
  const { result, refreshMs, stats } = await play({
    seconds: seekAt + 3,
    media,
    pictures,
    rendering,
    supply: false,
    script: (vsync, control, context) => {
      if (vsync === 0) control.video.playbackRate = rate;
      steps(control, context);
      const now = control.now();
      if (marks.played !== undefined && marks.sound === undefined) {
        if (standUntilMs === null) {
          if (now >= marks.played + soundMs) {
            media.set(marks.played + soundMs, seekTo, rate, phaseMs);
            marks.sound = marks.played + soundMs;
          }
        } else if (marks.moved === undefined) {
          if (now >= marks.played + soundMs + phaseMs) {
            // Chromium's move takes two readings: a little, then the rest
            // at the pace of playing.
            media.set(
              now,
              seekTo + (earlyMs === null ? moveSeconds : 0.002),
              0,
            );
            marks.moved = now;
          }
        } else if (
          earlyMs !== null &&
          marks.movedOn === undefined &&
          now >= marks.moved + 15
        ) {
          media.set(now, seekTo + moveSeconds, 0);
          marks.movedOn = now;
        } else if (now >= marks.played + standUntilMs) {
          if (earlyMs !== null) media.floor = seekTo + moveSeconds;
          media.set(marks.played + standUntilMs, start, rate, phaseMs);
          marks.sound = marks.played + standUntilMs;
        }
      }
      if (supplying && !control.video.seeking)
        context.producer.supply(control.video.currentTime, rate);
    },
  });
  const truth = (wall) =>
    wall < marks.sound ? start : start + (rate * (wall - marks.sound)) / 1000;
  const shown = appearances(
    { draws: canvasDraws(result, marks.played) },
    outputs(pictures),
    refreshMs,
  );
  let early = 0;
  for (const output of shown) {
    const wall = BASE_MS + output.refresh * refreshMs;
    early = Math.max(early, ((output.time - truth(wall)) * 1000) / rate);
  }
  const drawn = new Set(
    canvasDraws(result, marks.played).map((draw) => draw.picture.mediaTime),
  );
  const unshown = pictures.filter(
    (picture) =>
      picture.timestamp + picture.duration > seekTo + 0.001 &&
      picture.timestamp < seekTo + rate &&
      !drawn.has(picture.timestamp),
  );
  // Statistics are reported once a second; before the first report nothing
  // has been counted.
  const before = result.stats.findLast(
    (snapshot) => snapshot.t < marks.seeking,
  ) ?? { missed: 0, late: 0, resynced: 0 };
  return {
    stats,
    before,
    early,
    unshown,
    starts: stats.resynced - before.resynced,
    shown,
    truth,
    refreshMs,
    marks,
  };
}

// A seek inside the buffer with a stepped reading. The reading after the
// first update stands until the next one whether the element plays or not,
// so a clock waiting for a second update starts a step late and the
// pictures of that step never go up. Wherever the target falls in its
// picture and whenever the first update comes, every picture from the
// target on is shown and none ahead of its time.
for (const rendering of ["main", "worker"]) {
  let runs = 0;
  for (const fraction of [0.1, 0.35, 0.6, 0.85])
    for (const phaseMs of [6, 10, 14]) {
      const label = `${rendering}, target ${fraction} into its picture, first update ${phaseMs} ms in`;
      const { stats, before, early, unshown, starts } = await steppedSeek({
        rendering,
        fraction,
        phaseMs,
      });
      const missed = stats.missed - before.missed;
      assert.equal(missed, 0, `${label}: ${missed} pictures dropped`);
      assert.deepEqual(
        unshown.map((picture) => picture.timestamp),
        [],
        `${label}: pictures never shown`,
      );
      assert.ok(
        early <= 2,
        `${label}: an output went up ${early.toFixed(2)} ms before its time`,
      );
      assert.equal(starts, 1, `${label}: the clock started ${starts} times`);
      runs++;
    }
  console.log(
    `ok stepped reading, ${rendering}: ${runs} seeks, every picture from the target shown, none early`,
  );
}

// The same, with a stepped reading that moves at its first update and then
// stands as an element that has not really started does. The clock runs
// from that update, stops once the reading stands longer than a step, and
// starts again on two updates: ahead of the sound by at most a step, a
// reading and a refresh, once, and on time after.
for (const rendering of ["main", "worker"]) {
  const { stats, early, starts, shown, truth, refreshMs, marks } =
    await steppedSeek({
      rendering,
      fraction: 0.6,
      phaseMs: 10,
      standUntilMs: 150,
    });
  const label = `${rendering}, moved then stood until 150 ms`;
  const bound = 40 + 2 * refreshMs;
  assert.ok(
    early <= bound,
    `${label}: ${early.toFixed(2)} ms ahead, more than ${bound.toFixed(1)}`,
  );
  assert.equal(starts, 2, `${label}: the clock started ${starts} times`);
  // From a little after the real start, nothing goes up early; the clock
  // started on a reading that was seen up to one reading after its update,
  // so an output may go up that much behind its refresh until the slew has
  // taken it up.
  let ahead = 0;
  let behind = 0;
  for (const output of shown) {
    const wall = BASE_MS + output.refresh * refreshMs;
    if (wall < marks.sound + 100) continue;
    const error = (output.time - truth(wall)) * 1000;
    ahead = Math.max(ahead, error);
    behind = Math.max(behind, -error - refreshMs);
  }
  assert.ok(
    ahead <= 2,
    `${label}: ${ahead.toFixed(2)} ms ahead after the start`,
  );
  assert.ok(
    behind <= refreshMs + 2,
    `${label}: ${behind.toFixed(2)} ms behind its refresh after the start`,
  );
  assert.equal(stats.queueResetted, 0, label);
  console.log(
    `ok stepped reading that stands, ${rendering}: ${early.toFixed(1)} ms ahead at most, one start taken back; after the start ${ahead.toFixed(1)} ms ahead, ${behind.toFixed(1)} ms behind at most`,
  );
}

// Chromium at a seek, with a reading read as it plays: the reading runs 19 ms
// ahead with wall time and stands while the device plays its first silence;
// the sound starts from the target and the reading follows once it catches
// up. While the clock waits the pictures follow the reading, so they can be
// that far ahead for a moment; it starts with the sound, not on the early
// move, and from then on nothing goes up ahead of its time.
for (const rendering of ["main", "worker"]) {
  const { early, shown, truth, refreshMs, marks } = await steppedSeek({
    rendering,
    continuous: true,
    fraction: 0.6,
    phaseMs: 0,
    soundMs: 15,
    standUntilMs: 65,
    earlyMs: 19,
  });
  const label = `${rendering}, Chromium-shaped start`;
  assert.ok(
    early <= 19 + 2,
    `${label}: ${early.toFixed(2)} ms ahead of the sound`,
  );
  let ahead = 0;
  let behind = 0;
  for (const output of shown) {
    const wall = BASE_MS + output.refresh * refreshMs;
    if (wall < marks.sound + 100) continue;
    const error = (output.time - truth(wall)) * 1000;
    ahead = Math.max(ahead, error);
    behind = Math.max(behind, -error - refreshMs);
  }
  assert.ok(
    ahead <= 2,
    `${label}: ${ahead.toFixed(2)} ms ahead after the start`,
  );
  assert.ok(
    behind <= refreshMs + 2,
    `${label}: ${behind.toFixed(2)} ms behind its refresh after the start`,
  );
  console.log(
    `ok ${label}: ${early.toFixed(1)} ms ahead while waiting, on time after`,
  );
}

// Held at a playback rate of 0 without being paused, as a player does while
// the pictures of a seek are decoded: the element does not move, and neither
// does the picture; when the rate comes back playback goes on from there,
// nothing early, nothing dropped, on time. A Worker hears of the stop, as of
// any, after its frame for that refresh, and may show one field more.
for (const rendering of ["main", "worker"]) {
  const pictures = stream({ count: 400 });
  const media = playing();
  const marks = {};
  const steps = timeline(
    [
      3,
      (control) => {
        marks.held = media.truth(control.now());
        marks.heldAt = control.now();
        media.set(control.now(), marks.held, 0);
        control.video.playbackRate = 0;
        event(control, "ratechange");
      },
    ],
    [
      3.5,
      (control) => {
        media.set(control.now(), marks.held, 1);
        control.video.playbackRate = 1;
        event(control, "ratechange");
        marks.released = control.now();
      },
    ],
  );
  const { result, refreshMs, stats } = await play({
    seconds: 6,
    media,
    pictures,
    rendering,
    script: (vsync, control) => steps(control),
  });
  const label = `${rendering}, held at rate 0`;
  assert.equal(stats.missed, 0, `${label}: ${stats.missed} pictures dropped`);
  const shown = appearances(
    { draws: canvasDraws(result, BASE_MS + 3000) },
    outputs(pictures),
    refreshMs,
  );
  let early = 0;
  for (const output of shown) {
    const wall = BASE_MS + output.refresh * refreshMs;
    if (rendering === "worker" && wall <= marks.heldAt + refreshMs) continue;
    const truth =
      wall < marks.released
        ? marks.held
        : marks.held + (wall - marks.released) / 1000;
    early = Math.max(early, (output.time - truth) * 1000);
  }
  assert.ok(
    early <= 2,
    `${label}: an output went up ${early.toFixed(2)} ms early`,
  );
  checkTiming(
    label,
    appearances(
      { draws: canvasDraws(result, marks.released + 300) },
      outputs(pictures),
      refreshMs,
    ),
    media,
    refreshMs,
    {
      from: marks.released + 300,
      toleranceMs: 2,
    },
  );
  console.log(`ok ${label}: the picture waits with the element, on time after`);
}

// Paused while the page shows, then played while it is hidden: a hidden page
// sends no readings, so when it shows again the clock is still where the
// element was paused, and the pictures that passed meanwhile were never due
// to be seen. None of them counts as dropped, and those after are on time.
for (const rendering of ["main", "worker"]) {
  const pictures = stream({ count: 400 });
  const media = playing();
  const marks = {};
  const steps = timeline(
    [
      3,
      (control) => {
        marks.paused = media.truth(control.now());
        media.set(control.now(), marks.paused, 0);
        control.video.paused = true;
        event(control, "pause");
      },
    ],
    [3.5, (control) => control.suspend("page")],
    [
      4,
      (control) => {
        media.set(control.now(), marks.paused, 1);
        control.video.paused = false;
        event(control, "play");
        event(control, "playing");
      },
    ],
    [
      5,
      (control) => {
        control.resume("page");
        marks.shown = control.now();
      },
    ],
  );
  const { result, refreshMs, stats } = await play({
    seconds: 7,
    media,
    pictures,
    rendering,
    script: (vsync, control) => steps(control),
  });
  const label = `${rendering}, played while hidden`;
  assert.equal(stats.missed, 0, `${label}: ${stats.missed} pictures dropped`);
  checkTiming(
    label,
    appearances(
      { draws: canvasDraws(result, marks.shown) },
      outputs(pictures),
      refreshMs,
    ),
    media,
    refreshMs,
    {
      from: marks.shown + 300,
      toleranceMs: 2,
    },
  );
  console.log(
    `ok ${label}: nothing counted for the time hidden, on time after`,
  );
}

// Chromium's reading after a start, with the real renderer, as Edge's
// recordings show it: after a seek the reading is at the target at the first
// reading after seeked and moves at the next, and the sound starts 40 ms
// after that move; after a resume the first reading of the playing element
// has already moved, and the sound starts at about that reading. Either way
// the reading's first move is 52 ms ahead of the sound, the device's output
// delay; it goes on at playing pace for 20 ms more and stands there until
// the sound catches up. Once the clock has seen this at a few starts, the
// picture at the next one stays with the sound: every picture from where the
// element was held is shown, and none ahead of the sound.
async function chromiumStarts({ rendering, kind }) {
  const pictures = stream({ count: 600 });
  const media = new SteppedMedia(0);
  media.set(BASE_MS + 10, 0, 1);
  const lead = 52;
  const seek = kind !== "resume";
  const soundMs = seek ? 40 : 0;
  const events = [];
  let next = BASE_MS + 2000;
  let pending = null;
  const { result, refreshMs } = await play({
    seconds: 12,
    media,
    pictures,
    rendering,
    supply: false,
    script: (vsync, control, context) => {
      const now = control.now();
      if (pending === null && now >= next && events.length < 6) {
        // A seek lands 5 ms before a field ends, so that following the
        // reading's early move would show the next field ahead of the sound.
        const held = seek
          ? Math.floor((media.truth(now) - 1) / FRAME) * FRAME +
            FRAME / 2 -
            0.005
          : media.truth(now);
        media.floor = Number.NEGATIVE_INFINITY;
        if (seek) {
          control.video.seeking = true;
          event(control, "seeking");
          event(control, "waiting");
          context.deinterlacer.decodedVideo.reset();
          context.producer.seek(held);
        } else {
          control.video.paused = true;
          event(control, "pause");
        }
        media.set(now, held, 0);
        pending = { held, at: now + (seek ? 2 : 300) };
      } else if (pending !== null && now >= pending.at) {
        const { held } = pending;
        if (seek) {
          control.video.seeking = false;
          event(control, "seeked");
          event(control, "playing");
        } else {
          control.video.paused = false;
          event(control, "play");
          event(control, "playing");
        }
        // The harness reads once a refresh, at 60 Hz.
        const moves = seek ? now + 1000 / 60 : now;
        const soundAt = moves + soundMs;
        media.set(soundAt, held, 1);
        // The reading goes on 20 ms at playing pace before it stands.
        media.setFloor(moves, held + (lead - soundMs) / 1000, 20);
        events.push({ held, played: now, soundAt });
        pending = null;
        next = now + 1300;
      }
      if (pending === null && !control.video.seeking)
        context.producer.supply(control.video.currentTime, 1);
    },
  });
  const last = events.at(-1);
  const truth = (wall) =>
    Math.max(last.held, last.held + (wall - last.soundAt) / 1000);
  const draws = canvasDraws(result, last.played).filter(
    (draw) => draw.t < last.played + 400,
  );
  const shown = appearances({ draws }, outputs(pictures), refreshMs);
  let ahead = 0;
  for (const output of shown) {
    const wall = BASE_MS + output.refresh * refreshMs;
    ahead = Math.max(ahead, (output.time - truth(wall)) * 1000);
  }
  // The picture paused on was on screen before the play, and the rest of it
  // can have passed by the first picture after it: the main renderer's goes
  // up a refresh after the play, a Worker's, which hears of it from the
  // reading sent before the next refresh, a refresh later still. Pictures
  // after it are shown.
  const from = kind === "resume" ? last.held : last.held + 0.001 - FRAME;
  const drawn = new Set(draws.map((draw) => draw.picture.mediaTime));
  const unshown = pictures.filter(
    (picture) =>
      picture.timestamp >= from &&
      picture.timestamp < last.held + 0.25 &&
      !drawn.has(picture.timestamp),
  );
  return { ahead, unshown: unshown.length };
}

for (const kind of ["seek", "resume"])
  for (const rendering of ["main", "worker"]) {
    const { ahead, unshown } = await chromiumStarts({ rendering, kind });
    const label = `${rendering}, Chromium ${kind}s`;
    assert.ok(
      ahead <= 2,
      `${label}: a picture went up ${ahead.toFixed(1)} ms ahead of the sound`,
    );
    assert.equal(unshown, 0, `${label}: ${unshown} pictures never shown`);
    console.log(`ok ${label}: with the sound once learnt, every picture shown`);
  }

// Other rates: the reading's steps come at the same media distance and a
// shorter or longer wall time, and the start follows the reading. At twice
// the rate there are as many pictures as refreshes, so some are passed over
// in any case; the seek adds none.
for (const rate of [0.5, 2]) {
  const { stats, before, unshown, starts, early } = await steppedSeek({
    rendering: "worker",
    rate,
    fraction: 0.35,
    phaseMs: 10,
  });
  const label = `rate ${rate}`;
  assert.equal(stats.missed - before.missed, 0, label);
  assert.ok(starts <= 2, `${label}: the clock started ${starts} times`);
  assert.ok(
    early <= 2,
    `${label}: an output went up ${early.toFixed(2)} ms early`,
  );
  console.log(
    `ok stepped reading at ${label}: none dropped by the seek, started ${starts} times`,
  );
}

// A seek before the clock has run long enough to have seen the reading step:
// it waits for two updates as it always has. An element that moves a little
// and then stands is not taken for one that plays, so nothing goes up ahead
// of its time, where a clock that had seen the steps would run ahead until
// it took the start back.
{
  const { early } = await steppedSeek({
    rendering: "worker",
    seekAt: 0.2,
    backSeconds: 0.1,
    fraction: 0.6,
    phaseMs: 10,
    standUntilMs: 150,
  });
  assert.ok(
    early <= 2,
    `no history: an output went up ${early.toFixed(2)} ms early`,
  );
  console.log("ok stepped reading with no history: nothing early");
}

// A reading read as the element plays, with a Worker rendering. The Worker
// uses a reading in the frame it was taken for; one taken in the page's own
// frame would be a refresh old, and a picture due in that refresh would go
// unshown after a seek. Swept over where in a refresh the sound starts, a
// seek drops nothing; a picture goes unshown only when the sound starts in
// the lead before the Worker's frame, too late for that frame's reading, so
// in about that share of the seeks. (At twice the rate one picture after a
// seek goes unshown with either renderer: the clock waits for a second
// reading, one refresh, before it runs, and at that rate a refresh is a
// whole picture.)
{
  let runs = 0;
  let unshownTotal = 0;
  let refresh = 0;
  for (const fraction of [0.1, 0.35, 0.6, 0.85])
    for (let soundMs = 20; soundMs < 37; soundMs += 2) {
      const { stats, before, early, unshown, refreshMs } = await steppedSeek({
        rendering: "worker",
        continuous: true,
        fraction,
        phaseMs: 0,
        soundMs,
      });
      const label = `continuous reading, target ${fraction} into its picture, sound at ${soundMs} ms`;
      const missed = stats.missed - before.missed;
      assert.equal(missed, 0, `${label}: ${missed} pictures dropped`);
      assert.ok(
        unshown.length <= 1,
        `${label}: ${unshown.length} pictures never shown`,
      );
      assert.ok(
        early <= 2,
        `${label}: an output went up ${early.toFixed(2)} ms early`,
      );
      unshownTotal += unshown.length;
      runs++;
      refresh = refreshMs;
    }
  const share = (CLOCK_LEAD_MS + 1) / refresh;
  assert.ok(
    unshownTotal <= runs * share,
    `${unshownTotal} pictures unshown in ${runs} seeks`,
  );
  console.log(
    `ok continuous reading, worker: ${runs} seeks, none dropped, ${unshownTotal} pictures unshown`,
  );
}

// The page sends a Worker renderer at most one reading per refresh, however
// late its timers and its animation frames run: two readings close together
// would look like a jump to the clock. While the page is busy, a task holds
// it from before the reading is due until 9 ms into each refresh, so the
// reading's timer and the refresh's animation frame both run when it ends.
// Each frame still sets the next reading, so there is one a refresh.
{
  const pictures = stream({ count: 400 });
  const media = playing();
  const busy = { from: BASE_MS + 2000, to: BASE_MS + 4000 };
  const { result, refreshMs } = await play({
    seconds: 6,
    media,
    pictures,
    rendering: "worker",
    script: (vsync, control, context) => {
      if (vsync !== 0) return;
      // The window that composites the canvas is the one whose frames and
      // timers the renderer uses.
      const view = context.deinterlacer.canvas.ownerDocument.defaultView;
      const setTimeout = view.setTimeout.bind(view);
      const requestAnimationFrame = view.requestAnimationFrame.bind(view);
      const isBusy = () =>
        control.now() >= busy.from && control.now() < busy.to;
      view.setTimeout = (callback, delay) =>
        setTimeout(callback, delay + (isBusy() ? CLOCK_LEAD_MS + 9 : 0));
      view.requestAnimationFrame = (callback) =>
        requestAnimationFrame((timestamp) =>
          isBusy()
            ? setTimeout(() => callback(timestamp), 9)
            : callback(timestamp),
        );
    },
  });
  const clocks = result.commands
    .filter((command) => command.type === "clock")
    .map((command) => command.t);
  let closest = Infinity;
  for (let index = 1; index < clocks.length; index++)
    if (clocks[index] >= BASE_MS + 1000)
      closest = Math.min(closest, clocks[index] - clocks[index - 1]);
  const during = clocks.filter((t) => t >= busy.from && t < busy.to).length;
  const refreshes = (busy.to - busy.from) / refreshMs;
  assert.ok(
    closest >= refreshMs - CLOCK_LEAD_MS - 1,
    `two readings ${closest.toFixed(2)} ms apart`,
  );
  assert.ok(
    during >= refreshes - 2,
    `${during} readings in ${refreshes.toFixed(0)} refreshes while busy`,
  );
  console.log(
    `ok busy page: readings at least ${closest.toFixed(1)} ms apart, ${during} in ${refreshes.toFixed(0)} busy refreshes`,
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
  const counts = {};
  const { result, refreshMs } = await play({
    seconds: 1.5,
    media,
    pictures,
    producer,
    script: (vsync, control) => {
      if (vsync !== 80) return;
      counts.quality = control.video.getVideoPlaybackQuality();
      counts.pushed = producer.pushed;
      counts.held = producer.outstanding.size;
    },
  });
  assert.ok(producer.mostHeld <= 24, `${producer.mostHeld} held`);
  // The element counts every picture pushed, and as dropped the ones that
  // came back without having been shown.
  assert.equal(counts.quality.totalVideoFrames, counts.pushed);
  assert.ok(counts.quality.droppedVideoFrames > 100);
  assert.ok(
    counts.quality.droppedVideoFrames <= counts.pushed - counts.held,
    JSON.stringify(counts),
  );
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
  // The canvas is still what shows the picture, which is what running says.
  assert.equal(marks.running, true);
  console.log("ok filtering off: woven pictures on time, canvas kept");
}

// A new size between pictures: textures, canvas and its box follow, the
// planes are uploaded as laid out, and capture() is of the display size. The
// element reports the size the pictures are shown at and says when it changes.
{
  const pictures = stream({ count: 300 });
  const media = playing();
  const producer = new Producer(pictures);
  const uploads = [];
  const marks = { resized: [] };
  const {
    result,
    refreshMs,
    control: page,
  } = await play({
    seconds: 4,
    media,
    pictures,
    producer,
    script: (vsync, control, context) => {
      context.uploads = uploads;
      if (vsync === 0)
        control.video.addEventListener("resize", () =>
          marks.resized.push([
            control.video.videoWidth,
            control.video.videoHeight,
          ]),
        );
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
        marks.element = [control.video.videoWidth, control.video.videoHeight];
        marks.quality = control.video.getVideoPlaybackQuality();
        marks.pushed = producer.pushed;
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
  // Nor a size or frame counts, so it reports the decoded pictures'.
  assert.deepEqual(marks.element, [34, 9]);
  assert.deepEqual(marks.resized, [
    [26, 11],
    [34, 9],
  ]);
  assert.equal(marks.quality.totalVideoFrames, marks.pushed);
  assert.equal(marks.quality.droppedVideoFrames, 0);
  // Destroying the deinterlacer gives the element's own answers back.
  for (const name of ["videoWidth", "videoHeight", "getVideoPlaybackQuality"])
    assert.equal(
      Object.getOwnPropertyDescriptor(page.video, name),
      undefined,
      `${name} is still overridden`,
    );
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

// The page stalls for 100 ms, running nothing of its own. Drawn there, the
// pictures due meanwhile are dropped; a Worker renderer draws them on time
// from what it was sent before.
for (const rendering of ["main", "worker"]) {
  const pictures = stream({ count: 300 });
  const media = playing();
  const from = BASE_MS + 4000;
  const to = from + 100;
  const { result, refreshMs, stats } = await play({
    seconds: 7,
    media,
    pictures,
    rendering,
    stalled: (wall) => wall >= from && wall < to,
  });
  const list = outputs(pictures);
  const shown = appearances(result, list, refreshMs);
  if (rendering === "main") {
    assert.ok(stats.missed > 0, "nothing was dropped on a stalled page");
  } else {
    assert.equal(stats.missed, 0, `${stats.missed} pictures dropped`);
    checkTiming("worker through a stall", shown, media, refreshMs, {
      from: BASE_MS + 1500,
      toleranceMs: 2,
    });
  }
  console.log(`ok page stall, ${rendering}: ${stats.missed} pictures dropped`);
}
