/**
 * The resampler's quality and cost: bit-identical bypass at ratio 1, passband
 * flatness, THD+N, images and aliases at ratio 1.001 and at 48000 → 44100,
 * a ratio that changes every quantum, and the time it takes.
 */
import assert from "node:assert/strict";

import { dB, fitSine, load, rms, spectrum } from "./sound-harness.mjs";

const { Resampler } = await load("resample");

const QUANTUM = 128;

/** A source that generates `f(i)` for input index i on both channels. */
class Generator {
  index = 0;
  constructor(f, g = f) {
    this.f = f;
    this.g = g;
  }
  pull(left, right, at, count) {
    for (let k = 0; k < count; k++) {
      left[at + k] = this.f(this.index);
      right[at + k] = this.g(this.index);
      this.index++;
    }
  }
}

/**
 * Run `frames` output frames, the step per quantum from `stepOf(q)`. Returns
 * the output and the input position of every output frame.
 */
function render(input, output, source, frames, stepOf) {
  const r = new Resampler();
  r.configure(input, output);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const position = new Float64Array(frames);
  for (let q = 0; q * QUANTUM < frames; q++) {
    const count = Math.min(QUANTUM, frames - q * QUANTUM);
    const step = r.settle(stepOf(q), count);
    r.fill(source, r.need(count, step));
    const p = r.position;
    for (let j = 0; j < count; j++) position[q * QUANTUM + j] = p + j * step;
    r.run(left, right, q * QUANTUM, count, step);
  }
  return { left, right, position, taps: r.taps };
}

const AMPLITUDE = 10 ** (-1 / 20);

/** Fit the expected sine to the steady part of a run; gain, THD+N and the largest spurious peak. */
function measure(input, output, frequency, stepOf, { band = Infinity } = {}) {
  const frames = 1 << 16;
  const sine = (i) =>
    AMPLITUDE * Math.sin((2 * Math.PI * frequency * i) / input);
  const run = render(input, output, new Generator(sine), frames + 4096, stepOf);
  const skip = 4096;
  const y = run.left.subarray(skip, skip + frames);
  const phase = Array.from(
    run.position.subarray(skip, skip + frames),
    (p) => (2 * Math.PI * frequency * p) / input,
  );
  const { amplitude, residual } = fitSine(y, phase);
  const mag = spectrum(residual);
  let spur = 0;
  const limit = Math.min(mag.length, Math.floor((band / output) * frames));
  for (let i = 1; i < limit; i++) spur = Math.max(spur, mag[i]);
  return {
    gain: dB(amplitude / AMPLITUDE),
    thdn: dB(rms(residual) / (amplitude / Math.SQRT2)),
    spur: dB(spur / AMPLITUDE),
    taps: run.taps,
  };
}

const results = [];
const report = (name, value, bar, ok) => {
  results.push({ name, value, bar, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${value} (bar ${bar})`);
};

// Bypass: ratio exactly 1 at equal rates reproduces the input bit for bit.
{
  let seed = 1;
  const noise = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 31 - 1;
  const values = Float32Array.from({ length: 48000 }, noise);
  const run = render(
    48000,
    48000,
    new Generator((i) => values[i] ?? 0),
    47000,
    () => 1,
  );
  let same = true;
  for (let i = 0; i < 47000; i++) if (run.left[i] !== values[i]) same = false;
  report("bypass at ratio 1 bit-identical", same, "true", same);
}

// After an adjust, coming back to exactly 1 settles onto the grid and bypasses again.
{
  let seed = 7;
  const noise = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 31 - 1;
  const values = Float32Array.from({ length: 96000 }, noise);
  const run = render(
    48000,
    48000,
    new Generator((i) => values[i] ?? 0),
    90000,
    (q) => (q < 10 ? 1.0037 : 1),
  );
  const adjusted = 10 * QUANTUM;
  let settledAt = -1;
  for (let i = adjusted; i < 90000; i++)
    if (Number.isInteger(run.position[i])) {
      settledAt = i;
      break;
    }
  let same = settledAt >= 0;
  for (let i = settledAt + QUANTUM; same && i < 90000; i++)
    if (run.left[i] !== values[run.position[i]]) same = false;
  report(
    "back on the grid after adjust, then bit-identical",
    `${((settledAt - adjusted) / 48).toFixed(1)} ms`,
    "≤ 100 ms, identical after",
    same && (settledAt - adjusted) / 48 <= 100,
  );
}

for (const [label, input, output, step] of [
  ["ratio 1.001", 48000, 48000, 1.001],
  ["48000→44100", 48000, 44100, 48000 / 44100],
]) {
  const constant = () => step;
  const one = measure(input, output, 1000, constant);
  console.log(`  ${label}: ${one.taps} taps`);
  report(
    `${label} THD+N 1 kHz −1 dBFS`,
    `${one.thdn.toFixed(1)} dB`,
    "≤ −96 dB",
    one.thdn <= -96,
  );
  let worstGain = 0;
  let worstSpur = -Infinity;
  for (const f of [
    20, 50, 100, 200, 500, 1000, 2000, 5000, 8000, 10000, 12000, 15000, 17000,
    18000, 19000, 19500, 20000,
  ]) {
    const m = measure(input, output, f, constant);
    if (Math.abs(m.gain) > Math.abs(worstGain)) worstGain = m.gain;
    worstSpur = Math.max(worstSpur, m.spur);
  }
  report(
    `${label} passband 20 Hz–20 kHz`,
    `${worstGain.toFixed(4)} dB worst`,
    "±0.1 dB",
    Math.abs(worstGain) <= 0.1,
  );
  report(
    `${label} images/aliases, tones to 20 kHz`,
    `${worstSpur.toFixed(1)} dB`,
    "≤ −90 dB",
    worstSpur <= -90,
  );
  if (output < input) {
    // Tones above the output passband: what folds back below 20 kHz.
    let fold = -Infinity;
    for (const f of [20500, 21000, 22000, 22500, 23000, 23500, 23900]) {
      const m = measure(input, output, f, constant, { band: 20000 });
      fold = Math.max(fold, m.spur);
    }
    report(
      `${label} aliases into 0–20 kHz from 20.5–23.9 kHz tones`,
      `${fold.toFixed(1)} dB`,
      "≤ −90 dB",
      fold <= -90,
    );
  }
  // The ratio changes every quantum: a triangle over 0.99..1.01, one second each way.
  const sweep = (q) => {
    const t = ((q * QUANTUM) / output) % 2;
    const a = 0.99 + 0.02 * (t < 1 ? t : 2 - t);
    return step * a;
  };
  let sweepWorst = -Infinity;
  for (const f of [1000, 10000, 19000]) {
    const m = measure(input, output, f, sweep);
    sweepWorst = Math.max(sweepWorst, f === 1000 ? m.thdn : m.spur);
    if (f === 1000)
      report(
        `${label} sweep 0.99↔1.01 per quantum THD+N 1 kHz`,
        `${m.thdn.toFixed(1)} dB`,
        "≤ −96 dB",
        m.thdn <= -96,
      );
    else
      report(
        `${label} sweep 0.99↔1.01 per quantum spurs ${f} Hz`,
        `${m.spur.toFixed(1)} dB`,
        "≤ −90 dB",
        m.spur <= -90,
      );
  }
}

// Cost: 60 s of stereo noise at ratio 1.001.
{
  let seed = 3;
  const noise = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 31 - 1;
  const values = Float32Array.from({ length: 1 << 16 }, noise);
  const source = new Generator(
    (i) => values[i & 0xffff],
    (i) => values[(i + 999) & 0xffff],
  );
  const r = new Resampler();
  r.configure(48000, 48000);
  const left = new Float32Array(QUANTUM);
  const right = new Float32Array(QUANTUM);
  const seconds = 60;
  const quanta = (seconds * 48000) / QUANTUM;
  // Warm up, then time; the generator's own cost is timed apart and removed.
  for (const pass of ["warm", "time"]) {
    const start = performance.now();
    for (let q = 0; q < (pass === "warm" ? 2000 : quanta); q++) {
      r.fill(source, r.need(QUANTUM, 1.001));
      r.run(left, right, 0, QUANTUM, 1.001);
    }
    const spent = performance.now() - start;
    if (pass === "time") {
      const g = new Generator(
        (i) => values[i & 0xffff],
        (i) => values[(i + 999) & 0xffff],
      );
      const scratchL = new Float32Array(QUANTUM * 2);
      const scratchR = new Float32Array(QUANTUM * 2);
      const gs = performance.now();
      for (let q = 0; q < quanta; q++) g.pull(scratchL, scratchR, 0, 129);
      const gen = performance.now() - gs;
      const share = ((spent - gen) / (seconds * 1000)) * 100;
      report(
        "resampler cost at 1.001",
        `${share.toFixed(2)} % of real time`,
        "≤ 1 %",
        share <= 1,
      );
    }
  }
}

const failed = results.filter((r) => !r.ok);
assert.equal(failed.length, 0, `${failed.length} resampler bars missed`);
