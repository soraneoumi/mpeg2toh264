/**
 * SoundClock's frame → wall mapping on synthetic device traces where the
 * truth is known, and on a real Firefox 160 trace; plus `at()` from reports.
 *
 * The synthetic device consumes frames continuously at 48000 × (1 + drift)
 * per second of `performance.now()`. Its callbacks come every 10 ± 2 ms --
 * either each 10 ± 2 ms after the previous one ("walk": the jitter
 * accumulates) or at 10 ms steps of the device clock ± 2 ms ("grid") -- and
 * render whole quanta until what is rendered is `TARGET` ahead of what was
 * consumed (3-8 quanta per callback). `currentTime` is what is rendered; the
 * speaker plays a frame `DEVICE` ms after it is consumed, and the context
 * reports `outputLatency` = DEVICE + TARGET. Readings come every 16.7 ± 3 ms,
 * with `performance.now()` rounded to whole milliseconds as Firefox does.
 * The error is wallOfFrame(frame) minus the wall time the frame is heard; its
 * mean is the constant offset the page cannot observe (at most a callback),
 * and the bars are on its variation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { load } from "./sound-harness.mjs";

const { SoundClock } = await load("clock");

const C = 48000;
const QUANTUM = 128;
const TARGET = 20; // ms
const DEVICE = 12; // ms

function random(seed) {
  return () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
}

/**
 * Simulate `seconds` of a device. `stallAt`: no readings for 150 ms from
 * there. `standAt`: no callbacks for 100 ms from there (then one catches up).
 */
function simulate({
  drift,
  seed,
  timing,
  seconds = 12,
  stallAt = 5000,
  standAt = 8000,
}) {
  const rand = random(seed);
  const rate = (C * (1 + drift)) / 1000; // frames per wall ms
  const T0 = 1000;
  const consumed = (t) => Math.max(0, (t - T0) * rate);
  const heardAt = (frame) => T0 + frame / rate + DEVICE;
  // Callback times and what they leave rendered.
  const callbacks = [];
  let rendered = 0;
  const jitter = () => rand() * 4 - 2;
  for (let k = 0, t = T0; t < T0 + seconds * 1000; k++) {
    if (!(t >= standAt && t < standAt + 100)) {
      const want = consumed(t) + (TARGET * C) / 1000;
      while (rendered < want) rendered += QUANTUM;
      callbacks.push([t, rendered]);
    }
    t =
      timing === "walk"
        ? t + 10 + jitter()
        : T0 + ((k + 1) * 10) / (1 + drift) + jitter();
  }
  const renderedAt = (t) => {
    let lo = 0;
    let hi = callbacks.length - 1;
    if (t < callbacks[0][0]) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (callbacks[mid][0] <= t) lo = mid;
      else hi = mid - 1;
    }
    return callbacks[lo][1];
  };
  const readings = [];
  for (let t = T0 + 5; t < T0 + seconds * 1000; t += 16.7 + (rand() * 6 - 3)) {
    if (t >= stallAt && t < stallAt + 150) continue;
    readings.push({ now: t, wall: Math.round(t), time: renderedAt(t) / C });
  }
  return {
    readings,
    heardAt,
    consumed,
    disturbances: [stallAt + 150, standAt + 100],
  };
}

function fakeContext(sampleRate) {
  return { sampleRate, state: "running", currentTime: 0, outputLatency: 0 };
}

const stats = (values) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
  );
  const max = Math.max(...values.map((v) => Math.abs(v - mean)));
  return { mean, sd, max };
};

const results = [];
const report = (name, value, bar, ok) => {
  results.push({ name, value, bar, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${value} (bar ${bar})`);
};

for (const timing of ["walk", "grid"])
  for (const drift of [0.0005, -0.0005, 0]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = simulate({ drift, seed, timing });
      const context = fakeContext(C);
      const clock = new SoundClock(context);
      const errors = [];
      const late = [];
      const near = [];
      for (const r of sim.readings) {
        context.currentTime = r.time;
        context.outputLatency = (DEVICE + TARGET) / 1000;
        clock.sample(r.wall);
        if (r.now < 2000) continue;
        // The frame heard at this instant, and where the clock puts it.
        const frame = Math.floor(sim.consumed(r.now - DEVICE));
        const error = clock.wallOfFrame(frame) - sim.heardAt(frame);
        const disturbed = sim.disturbances.some(
          (d) => r.now >= d - 200 && r.now < d + 200,
        );
        (disturbed ? near : errors).push(error);
        if (!disturbed && r.now >= 4000) late.push(error);
      }
      const s = stats(errors);
      const l = stats(late);
      const around = Math.max(...near.map((e) => Math.abs(e - s.mean)));
      const lateMax = Math.max(...late.map((e) => Math.abs(e - s.mean)));
      report(
        `${timing} drift ${(drift * 100).toFixed(2)} % seed ${seed}`,
        `from 1 s: sd ${s.sd.toFixed(2)} max ${s.max.toFixed(2)}; from 3 s: sd ${l.sd.toFixed(2)} max ${lateMax.toFixed(2)}; within 200 ms of a disturbance max ${around.toFixed(2)}; offset ${s.mean.toFixed(1)} ms`,
        "from 1 s: sd ≤ 0.5, max ≤ 2 (ms)",
        s.sd <= 0.5 && s.max <= 2,
      );
    }
  }

// The real Firefox trace: the mapping against one straight line through it.
{
  const trace = JSON.parse(
    readFileSync(
      new URL(
        "../testdata/sound/firefox160-context-trace-44100.json",
        import.meta.url,
      ),
    ),
  );
  const context = fakeContext(trace.sampleRate);
  const clock = new SoundClock(context);
  const points = [];
  for (const [now, , , currentTime, outputLatency] of trace.rows) {
    context.currentTime = currentTime;
    context.outputLatency = outputLatency;
    clock.sample(now);
    if (now - trace.rows[0][0] < 1000) continue;
    // The context time the mapping says is heard at this instant.
    points.push([now, clock.wallOfFrame(0)]);
  }
  // wallOfFrame(0) is where the line puts context time 0: against a global
  // straight line through it, the residual is the wobble of the mapping.
  // With drift it moves linearly, so fit a line in `now`.
  const n = points.length;
  const mx = points.reduce((a, p) => a + p[0], 0) / n;
  const my = points.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const b = sxy / sxx;
  const residual = points.map(([x, y]) => y - (my + b * (x - mx)));
  const s = stats(residual);
  report(
    "Firefox 160 trace, mapping vs a global line",
    `sd ${s.sd.toFixed(3)} ms, max ${s.max.toFixed(3)} ms over ${n} readings`,
    "sd ≤ 1 ms",
    s.sd <= 1,
  );
  // And the raw readings against their own global line, for comparison.
  const raw = trace.rows.map(([now, , , ct]) => [now, ct * 1000 - now]);
  const rm = raw.reduce((a, p) => a + p[1], 0) / raw.length;
  console.log(
    `  (raw currentTime - now spread: sd ${stats(raw.map((p) => p[1] - rm)).sd.toFixed(2)} ms before removing drift)`,
  );
}

// at(): media time from reports through the mapping.
{
  const context = fakeContext(C);
  const clock = new SoundClock(context);
  assert.ok(Number.isNaN(clock.at(0)), "nothing known yet");
  assert.equal(clock.state, "idle");
  for (let i = 0; i <= 120; i++) {
    context.currentTime = (i * 16) / 1000;
    clock.sample(1000 + i * 16);
  }
  // Context time t is heard at wall ≈ 1000 + 1000 t (no latency).
  clock.report({
    type: "position",
    epoch: 1,
    frame: 0,
    media: 10,
    speed: 0,
    state: "ready",
    queuedUntil: 11,
  });
  clock.report({
    type: "position",
    epoch: 1,
    frame: 48000,
    media: 10,
    speed: 1,
    state: "playing",
    queuedUntil: 11,
  });
  clock.report({
    type: "position",
    epoch: 1,
    frame: 96000,
    media: 11,
    speed: 0,
    state: "starved",
    queuedUntil: 11,
  });
  const wall = clock.wallOfFrame(72000);
  assert.ok(
    Math.abs(clock.at(wall) - 10.5) < 1e-9,
    "playing: extrapolated from the report",
  );
  assert.ok(
    Number.isNaN(clock.at(clock.wallOfFrame(24000))),
    "ready: not playing",
  );
  assert.equal(clock.at(clock.wallOfFrame(100000)), 11, "starved: stands");
  assert.equal(clock.state, "starved");
  clock.report({
    type: "position",
    epoch: 2,
    frame: 100000,
    media: 50,
    speed: 0,
    state: "buffering",
    queuedUntil: 50,
  });
  assert.ok(
    Number.isNaN(clock.at(wall)),
    "a new epoch forgets the old one's reports",
  );
  console.log("ok   at(): playing, ready, starved, new epoch");
}

const failed = results.filter((r) => !r.ok);
assert.equal(failed.length, 0, `${failed.length} clock bars missed`);
