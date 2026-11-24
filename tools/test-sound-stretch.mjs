/**
 * The time stretch: pitch and length at each rate, no click when the rate
 * changes (including into and out of the rate-1 bypass), the distance of the
 * sound from the nominal timeline, and the cost of stretch + resample.
 */
import assert from "node:assert/strict";

import { load, peakFrequency } from "./sound-harness.mjs";

const { Stretcher, SEARCH } = await load("stretch");
const { Resampler } = await load("resample");

const RATE = 48000;
const QUANTUM = 128;

/** Source frames `f(i)` (and `g(i)` on the right), zero past `length`. */
class Generator {
  index = 0;
  constructor(f, g = f, length = Infinity) {
    this.f = f;
    this.g = g;
    this.length = length;
  }
  pull(left, right, at, count) {
    for (let k = 0; k < count; k++, this.index++) {
      const inside = this.index >= 0 && this.index < this.length;
      left[at + k] = inside ? this.f(this.index) : 0;
      right[at + k] = inside ? this.g(this.index) : 0;
    }
  }
}

/** Pull `frames` stretched frames, the rate per quantum from `rateOf(q)`. */
function stretch(source, frames, rateOf) {
  const s = new Stretcher(source);
  s.configure(RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let q = 0; q * QUANTUM < frames; q++) {
    s.rate = rateOf(q);
    const n = Math.min(QUANTUM, frames - q * QUANTUM);
    s.pull(left, right, q * QUANTUM, n);
  }
  return { left, right, stretcher: s };
}

const results = [];
const report = (name, value, bar, ok) => {
  results.push({ name, value, bar, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${value} (bar ${bar})`);
};

const RATES = [0.25, 0.5, 0.75, 1.1, 1.25, 1.5, 2];
const sine = (i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE);

for (const rate of RATES) {
  const { left } = stretch(new Generator(sine), 1 << 18, () => rate);
  const f = peakFrequency(left.subarray(4096), RATE);
  report(
    `440 Hz at rate ${rate}`,
    `${f.toFixed(3)} Hz`,
    "440 ± 1 Hz",
    Math.abs(f - 440) <= 1,
  );
}

// Length: 60 s of sine, then silence; where the sound ends against 60 s / rate.
for (const rate of RATES) {
  const input = 60 * RATE;
  const expected = input / rate;
  const frames = Math.ceil(expected + RATE);
  const { left } = stretch(
    new Generator(sine, sine, input),
    frames,
    () => rate,
  );
  // Where the sound ends: the last frame above half the amplitude (-6 dB).
  // The last frames fade out over the overlap, so a lower threshold also
  // counts their faint tails (printed for reference).
  const end = (threshold) => {
    let last = 0;
    for (let i = 0; i < frames; i++)
      if (Math.abs(left[i]) > threshold) last = i;
    return (last + 1 - expected) / RATE;
  };
  const error = end(0.25);
  report(
    `length of 60 s at rate ${rate}`,
    `${(error * 1000).toFixed(2)} ms off ${(expected / RATE).toFixed(3)} s (−60 dB tail ${(end(5e-4) * 1000).toFixed(2)} ms)`,
    "within one window (40 ms)",
    Math.abs(error) <= 0.04,
  );
}

/**
 * Click measure: the largest second difference of the output against that of
 * the steady sine. A 440 Hz sine of amplitude a has a second difference of
 * a (2π 440/48000)² ≈ 0.0033 a; a step of size d shows as d.
 */
function clickRatio(left, from) {
  let worst = 0;
  for (let i = from + 1; i < left.length - 1; i++)
    worst = Math.max(worst, Math.abs(left[i - 1] - 2 * left[i] + left[i + 1]));
  return worst / (0.5 * ((2 * Math.PI * 440) / RATE) ** 2);
}
{
  // Every half second: 1 → 2 → 1 → 0.5 → 1.25 → 1 → 0.75 → 2 → 1 → 0.25 → 1.
  const sequence = [1, 2, 1, 0.5, 1.25, 1, 0.75, 2, 1, 0.25, 1];
  const per = Math.round((0.5 * RATE) / QUANTUM);
  const frames = sequence.length * per * QUANTUM;
  const { left } = stretch(
    new Generator(sine),
    frames,
    (q) => sequence[Math.floor(q / per)],
  );
  const ratio = clickRatio(left, 0);
  report(
    "rate switches 1↔2↔0.5↔1.25↔0.75↔0.25 (bypass in and out)",
    `largest 2nd difference ${ratio.toFixed(2)}× the sine's`,
    "≤ 1.5× (a cut would be ≫ 10×)",
    ratio <= 1.5,
  );
  // The same switch done as a cut, to show the measure sees one.
  const cut = new Float32Array(frames);
  for (let i = 0; i < frames; i++) cut[i] = sine(i < frames / 2 ? i : i + 37);
  console.log(
    `  (a 37-frame cut in the same sine measures ${clickRatio(cut, 0).toFixed(1)}×)`,
  );
}

// Distance from the nominal timeline, with a ramp: the overlap-add of ramp
// segments is the window-weighted mean of their source positions.
for (const rate of [0.25, 0.5, 0.75, 1.25, 1.5, 2]) {
  const period = RATE; // the ramp wraps every second; skip near wraps
  const ramp = (i) => (i % period) / period;
  const frames = 20 * RATE;
  const { left, stretcher } = stretch(new Generator(ramp), frames, () => rate);
  const hop = stretcher.hopFrames;
  let worst = 0;
  let worstCentre = 0;
  for (let m = 2 * hop; m < frames - 2 * hop; m++) {
    const nominal = m * rate;
    const phase = nominal % period;
    const margin = 2 * hop * Math.max(1, rate) + SEARCH * RATE;
    if (phase < margin || phase > period - margin) continue;
    const truth = Math.floor(nominal / period) * period + left[m] * period;
    const d = Math.abs(truth - nominal) / RATE;
    worst = Math.max(worst, d);
    if (m % hop === 0) worstCentre = Math.max(worstCentre, d);
  }
  const bound = SEARCH + (Math.abs(1 - rate) * hop) / 2 / RATE;
  report(
    `rate ${rate}: sound vs nominal time`,
    `${(worstCentre * 1000).toFixed(2)} ms at frame centres, ${(worst * 1000).toFixed(2)} ms anywhere`,
    `centres ≤ ${SEARCH * 1000} ms, anywhere ≤ ${(bound * 1000).toFixed(1)} ms`,
    worstCentre <= SEARCH + 1 / RATE && worst <= bound + 1 / RATE,
  );
}

// Cost of stretch + resample (ratio 1.001), per second of output.
for (const rate of [2, 0.5]) {
  let seed = 5;
  const noise = new Float32Array(1 << 16).map(
    () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 31 - 1,
  );
  // Music-like: noise plus a few tones, so the search has structure to find.
  const f = (i) =>
    0.2 * noise[i & 0xffff] +
    0.3 * Math.sin(i * 0.0577) +
    0.2 * Math.sin(i * 0.0131);
  const g = (i) =>
    0.2 * noise[(i + 777) & 0xffff] + 0.3 * Math.sin(i * 0.0577 + 1);
  const values = { l: new Float32Array(1 << 20), r: new Float32Array(1 << 20) };
  for (let i = 0; i < 1 << 20; i++) {
    values.l[i] = f(i);
    values.r[i] = g(i);
  }
  const source = {
    index: 0,
    pull(left, right, at, count) {
      for (let k = 0; k < count; k++, this.index++) {
        left[at + k] = values.l[this.index & 0xfffff];
        right[at + k] = values.r[this.index & 0xfffff];
      }
    },
  };
  const s = new Stretcher(source);
  s.configure(RATE);
  s.rate = rate;
  const r = new Resampler();
  r.configure(RATE, RATE);
  const left = new Float32Array(QUANTUM);
  const right = new Float32Array(QUANTUM);
  const seconds = 60;
  const quanta = (seconds * RATE) / QUANTUM;
  for (let q = 0; q < 2000; q++) {
    r.fill(s, r.need(QUANTUM, 1.001));
    r.run(left, right, 0, QUANTUM, 1.001);
  }
  const start = performance.now();
  for (let q = 0; q < quanta; q++) {
    r.fill(s, r.need(QUANTUM, 1.001));
    r.run(left, right, 0, QUANTUM, 1.001);
  }
  const spent = performance.now() - start;
  const share = (spent / (seconds * 1000)) * 100;
  report(
    `stretch + resample at rate ${rate}`,
    `${share.toFixed(2)} % of real time`,
    "≤ 5 %",
    share <= 5,
  );
}

const failed = results.filter((r) => !r.ok);
assert.equal(failed.length, 0, `${failed.length} stretch bars missed`);
