// Field matching is asked of the filter only for a while after a pulldown
// cadence was held, on both engines. The detector's readback is scripted; what
// is checked is when the filter is told to match and which comb counts it is
// given, not the pictures.
import assert from "node:assert/strict";
import {
  BASE_MS,
  FRAME_PERIOD_MS,
  buildBundles,
  run,
} from "./yadif-clock-harness.mjs";

const bundles = await buildBundles(process.cwd());
const PHASE = 6 * 4;
const HOLD_FRAMES = 90;
// No cadence, then one held for two seconds, then lost for good.
const LOCK_AT = BASE_MS + 2000;
const LOSS_AT = BASE_MS + 4000;

function scripted() {
  let cycle = 0;
  return ({ t, into }) => {
    const held = t >= LOCK_AT && t < LOSS_AT;
    into[PHASE] = held ? (cycle++ % 5) + 1 : 0;
    into[PHASE + 1] = held ? 20 : 0;
  };
}

/** Frames (by media time) with a filter draw told to match, within a span. */
function matchedFrames(draws, from, to) {
  const frames = new Set();
  for (const draw of draws)
    if (
      draw.filter &&
      draw.t >= from &&
      draw.t < to &&
      draw.picture.match === 1
    )
      frames.add(draw.picture.mediaTime);
  return frames;
}

for (const rendering of ["main", "worker"]) {
  const result = await run(bundles, {
    rendering,
    vsyncs: 800,
    deinterlacerOptions: { doubleRate: true, film: true },
    filmMetrics: scripted(),
  });
  assert.equal(result.failures.length, 0, `${rendering}: ${result.failures}`);
  const draws = result.draws;
  assert.equal(
    matchedFrames(draws, 0, LOCK_AT).size,
    0,
    `${rendering}: matched before any cadence was held`,
  );
  // The page learns of the loss a few frames late; the hold counts from then.
  const after = matchedFrames(draws, LOSS_AT, Infinity).size;
  assert.ok(
    after >= HOLD_FRAMES - 2 && after <= HOLD_FRAMES + 8,
    `${rendering}: matched ${after} frames after the cadence was lost`,
  );
  const end = LOSS_AT + (HOLD_FRAMES + 12) * FRAME_PERIOD_MS;
  assert.equal(
    matchedFrames(draws, end, Infinity).size,
    0,
    `${rendering}: still matching long after the cadence was lost`,
  );
  const stats = result.stats.at(-1);
  assert.ok(
    stats.matched >= HOLD_FRAMES - 2 && stats.matched <= HOLD_FRAMES + 8,
    `${rendering}: reported ${stats.matched} matched frames`,
  );

  // A matched second field reads the counts of the frame after its own: a
  // comb pass over (its frame, the next), kept apart from the frame's own.
  const combs = draws.filter((draw) => draw.comb);
  let checked = 0;
  for (const draw of draws) {
    if (!draw.filter || draw.picture.match !== 1) continue;
    if (draw.picture.second !== 1) continue;
    const frame = draw.picture.mediaTime;
    const own = combs.findLast(
      (comb) => comb.t <= draw.t && comb.picture.mediaTime === frame,
    );
    const ahead = combs.findLast(
      (comb) => comb.t <= draw.t && comb.prev === frame,
    );
    assert.ok(own && ahead, `${rendering}: comb passes missing for ${frame}`);
    assert.ok(ahead.picture.mediaTime > frame);
    assert.notEqual(ahead.target, own.target);
    assert.equal(draw.ahead, ahead.target);
    checked++;
  }
  assert.ok(checked >= HOLD_FRAMES - 10, `${rendering}: ${checked} checked`);

  // While the cadence is held the ahead counts are not asked for: no second
  // field is drawn to read them.
  const heldFrom = LOCK_AT + 500;
  const heldCombs = combs.filter(
    (comb) => comb.t >= heldFrom && comb.t < LOSS_AT,
  );
  assert.equal(
    new Set(heldCombs.map((comb) => comb.target)).size,
    1,
    `${rendering}: ahead counts measured while the cadence was held`,
  );
  console.log(`ok ${rendering}: ${after} frames matched after the loss`);
}

// One picture a frame: its first field is matched, and nothing looks ahead.
{
  const result = await run(bundles, {
    rendering: "main",
    vsyncs: 800,
    deinterlacerOptions: { doubleRate: false, film: true },
    filmMetrics: scripted(),
  });
  const draws = result.draws;
  const after = matchedFrames(draws, LOSS_AT, Infinity).size;
  assert.ok(
    after >= HOLD_FRAMES - 2 && after <= HOLD_FRAMES + 8,
    `single rate: matched ${after} frames`,
  );
  assert.ok(
    draws.every((draw) => !draw.filter || draw.picture.second !== 1),
    "single rate: a second field was drawn",
  );
  assert.equal(
    new Set(draws.filter((draw) => draw.comb).map((comb) => comb.target)).size,
    1,
    "single rate: ahead counts measured with no second field to use them",
  );
  console.log(`ok single rate: ${after} frames matched after the loss`);
}

// Progressive stretches come and go within film (soft telecine), so a short
// one leaves the rest of the hold; a long one runs it down, and what follows
// is not matched on the strength of film seen before it.
for (const [frames, expected] of [
  [30, "some"],
  [HOLD_FRAMES + 30, "none"],
]) {
  const progressiveMs = frames * FRAME_PERIOD_MS;
  // The player's timeline says where the stream is progressive, in media
  // time, which starts at zero here.
  const from = (LOSS_AT - BASE_MS) / 1000;
  const to = from + progressiveMs / 1000;
  const timeline = [
    { start: 0, scan: { interlaced: true, topFieldFirst: true } },
    { start: from, scan: { interlaced: false, topFieldFirst: true } },
    { start: to, scan: { interlaced: true, topFieldFirst: true } },
  ];
  const result = await run(bundles, {
    rendering: "main",
    vsyncs: 800,
    deinterlacerOptions: { doubleRate: true, film: true },
    filmMetrics: scripted(),
    beforeVsync(vsync, control) {
      if (vsync === 0)
        control.deinterlacer(
          `__deinterlacer.videoTimeline = ${JSON.stringify(timeline)}`,
        );
    },
  });
  assert.equal(result.failures.length, 0, `progressive: ${result.failures}`);
  const after = matchedFrames(
    result.draws,
    LOSS_AT + progressiveMs,
    Infinity,
  ).size;
  if (expected === "none") {
    assert.equal(
      after,
      0,
      `matched ${after} frames after ${frames} progressive`,
    );
  } else {
    // What the stretch left of the hold, less the frames that refill the
    // history after it.
    assert.ok(
      after >= HOLD_FRAMES - frames - 10 && after <= HOLD_FRAMES - frames,
      `matched ${after} frames after ${frames} progressive`,
    );
  }
  console.log(`ok ${frames} progressive frames: ${after} matched after them`);
}
