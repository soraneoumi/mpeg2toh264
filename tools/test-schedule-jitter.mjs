// Frames that arrive a refresh early or late must not cost more pictures than
// they have to. A late frame leaves one refresh with nothing new to show, and
// that is all: nothing is skipped afterwards to make the time back, and the
// next late frame costs nothing at all.
import assert from "node:assert/strict";
import { buildBundles, presentations, run } from "./yadif-clock-harness.mjs";

const bundles = await buildBundles(process.cwd());
const repeat = (steps, times) =>
  Array.from({ length: times }, () => steps).flat();

/** Frames arrive on these refreshes: each one `step` refreshes after the last. */
function arrivals(steps) {
  const at = new Set();
  let vsync = 0;
  for (const step of steps) {
    at.add(vsync);
    vsync += step;
  }
  return { on: (refresh) => at.has(refresh), total: vsync };
}

/**
 * What a run cost. Pictures are numbered in the order they exist: two fields
 * a frame when every field is shown, one picture a frame otherwise. `held` is
 * refreshes with nothing new once playback has settled; `skipped` and
 * `repeated` are counted from the first picture on, so that whatever the
 * start of a chain does shows up as well.
 */
async function cost(rendering, options, steps) {
  const { on, total } = arrivals(steps);
  const result = await run(bundles, {
    rendering,
    vsyncs: total,
    arrival: on,
    deinterlacerOptions: options,
  });
  assert.equal(result.failures.length, 0);
  const each = options.doubleRate ? 2 : 1;
  const number = (shown) =>
    Math.round((shown.picture.mediaTime * 30000) / 1001) * each +
    (shown.picture.second ? 1 : 0);
  const shown = new Map();
  for (const picture of presentations(result.draws))
    shown.set(picture.refresh, number(picture));
  const first = Math.min(...shown.keys());
  const last = Math.max(...shown.keys()) - 4;
  let held = 0;
  let skipped = 0;
  let repeated = 0;
  let previous = null;
  for (let refresh = first; refresh <= last; refresh++) {
    if (!shown.has(refresh)) {
      // One picture a frame leaves every other refresh without a new one.
      if (each === 2 && refresh > first + 40) held++;
      continue;
    }
    const now = shown.get(refresh);
    if (previous !== null) {
      if (now > previous + 1) skipped += now - previous - 1;
      if (now <= previous) repeated++;
    }
    previous = now;
  }
  return { held, skipped, repeated, resynced: result.stats.at(-1).resynced };
}

// [name, refreshes between frames, held refreshes allowed, skipped pictures allowed]
const cases = [
  ["frames on every other refresh", repeat(2, 300), 0, 0],
  [
    "one frame a refresh early",
    [...repeat(2, 100), 1, 3, ...repeat(2, 150)],
    0,
    0,
  ],
  [
    "one frame a refresh late",
    [...repeat(2, 100), 3, 1, ...repeat(2, 150)],
    1,
    0,
  ],
  [
    "two late frames some seconds apart",
    [...repeat(2, 100), 3, 1, ...repeat(2, 100), 3, 1, ...repeat(2, 100)],
    1,
    0,
  ],
  [
    "every third frame late, for 40 cycles",
    [...repeat(2, 60), ...repeat([3, 1, 2], 40), ...repeat(2, 100)],
    1,
    0,
  ],
  [
    "the cycle of late frames changing step",
    [
      ...repeat(2, 60),
      ...repeat([3, 1, 2], 20),
      ...repeat([1, 3, 2], 20),
      ...repeat([2, 3, 1], 20),
      ...repeat(2, 80),
    ],
    1,
    0,
  ],
  [
    "every frame a refresh later from some point on",
    [...repeat(2, 100), 3, ...repeat(2, 200)],
    1,
    0,
  ],
  // The chain runs a refresh later than any frame needs; after two seconds
  // it moves up, which costs the one picture.
  [
    "every frame a refresh earlier from some point on",
    [...repeat(2, 100), 1, ...repeat(2, 200)],
    0,
    1,
  ],
  // Two refreshes late is a frame that was not there to show: its refreshes
  // go empty and the chain starts again, with nothing skipped.
  [
    "one frame two refreshes late",
    [...repeat(2, 100), 4, ...repeat(2, 150)],
    2,
    0,
  ],
];

const modes = [
  ["fields", { doubleRate: true }],
  ["fields, film on", { doubleRate: true, film: true }],
  ["one picture a frame", { doubleRate: false, film: true }],
];

for (const rendering of ["main", "worker"]) {
  for (const [mode, options] of modes) {
    for (const [name, steps, held, skipped] of cases) {
      const got = await cost(rendering, options, steps);
      const label = `${rendering}, ${mode}: ${name}: ${JSON.stringify(got)}`;
      assert.ok(got.held <= held, label);
      assert.ok(got.skipped <= skipped, label);
      assert.equal(got.repeated, 0, label);
      // The start of a chain, and one restart for each thing that happened.
      assert.ok(got.resynced <= 3, label);
      console.log(`ok ${label}`);
    }
  }
}
