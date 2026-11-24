/**
 * The sound processor driven through `process()` in a stand-in
 * AudioWorkletGlobalScope: the media mapping its reports promise (exact at
 * rate 1, through `adjust` changes; within the stated bound at other rates),
 * epochs, gaps, overlaps and jumps, starving, pause, end, volume, fades, and
 * the `consumed` messages.
 *
 * The PCM is a sawtooth whose value is the fractional second of its own media
 * time (the right channel is its negative), so every output frame says which
 * media time it carries. Frames near a wrap of the sawtooth are not judged:
 * interpolation and overlap-add smear the wrap itself.
 */
import assert from "node:assert/strict";

import { deliver, load, loadProcessor, makePort } from "./sound-harness.mjs";

const { SEARCH } = await load("stretch");
const C = 48000;
const QUANTUM = 128;
const CHUNK = 1024;
const HOP = 0.02 * C;
const { ctor } = await loadProcessor({ sampleRate: C });

const frac = (t) => t - Math.floor(t);

function chunk(epoch, start, frames = CHUNK, rate = C) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = frac(start + i / rate);
    right[i] = -left[i];
  }
  return {
    type: "pcm",
    epoch,
    start,
    sampleRate: rate,
    channels: [left, right],
  };
}

/** A processor and what it said and played. */
class Rig {
  constructor() {
    globalThis.currentFrame = 0;
    this.processor = new ctor();
    this.pcm = makePort();
    this.control({ type: "pcm-port", port: this.pcm });
    this.left = [];
    this.right = [];
  }
  control(message) {
    deliver(this.processor.port, message);
  }
  send(message) {
    deliver(this.pcm, message);
  }
  /** Contiguous chunks from `start` for `seconds`. */
  feed(epoch, start, seconds) {
    const count = Math.round((seconds * C) / CHUNK);
    for (let k = 0; k < count; k++)
      this.send(chunk(epoch, start + (k * CHUNK) / C));
    return start + (count * CHUNK) / C;
  }
  get reports() {
    return this.processor.port.sent;
  }
  get consumed() {
    return this.pcm.sent;
  }
  get frame() {
    return globalThis.currentFrame;
  }
  run(quanta, each) {
    for (let q = 0; q < quanta; q++) {
      each?.(this);
      const left = new Float32Array(QUANTUM);
      const right = new Float32Array(QUANTUM);
      this.processor.process([], [[left, right]]);
      for (let j = 0; j < QUANTUM; j++) {
        this.left.push(left[j]);
        this.right.push(right[j]);
      }
      globalThis.currentFrame += QUANTUM;
    }
  }
  runSeconds(seconds, each) {
    this.run(Math.round((seconds * C) / QUANTUM), each);
  }
  /** The report covering frame `f`. */
  reportAt(f) {
    let found;
    for (const r of this.reports) if (r.frame <= f) found = r;
    return found;
  }
  /** Media time the reports give for frame `f`, or NaN when not playing. */
  predicted(f) {
    const r = this.reportAt(f);
    if (r?.state !== "playing") return Number.NaN;
    return r.media + ((f - r.frame) * r.speed) / C;
  }
  /** Frames whose quantum was a fade (the first and last playing ones). */
  faded(f) {
    const q = Math.floor(f / QUANTUM) * QUANTUM;
    const epoch = this.reportAt(q)?.epoch;
    const playing = (frame) => {
      const r = this.reportAt(frame);
      return r?.state === "playing" && r.epoch === epoch;
    };
    return !playing(q - 1) || !playing(q + QUANTUM);
  }
}

/** Media time the output at frame `f` carries, near `around`. */
function decode(value, around) {
  let t = Math.floor(around) + value;
  if (t - around > 0.5) t -= 1;
  if (around - t > 0.5) t += 1;
  return t;
}

/**
 * The worst distance, in frames, between what frames [from, to) carry and
 * what the reports say, skipping frames within `margin` seconds of a wrap
 * and fade quanta.
 */
function mappingError(rig, from, to, margin = 60 / C, skip = () => false) {
  let worst = 0;
  let judged = 0;
  for (let f = from; f < to; f++) {
    const p = rig.predicted(f);
    if (Number.isNaN(p) || rig.faded(f)) continue;
    if (frac(p) < margin || frac(p) > 1 - margin || skip(p)) continue;
    const t = decode(rig.left[f], p);
    worst = Math.max(worst, Math.abs(t - p) * C);
    assert.ok(
      Math.abs(rig.right[f] + rig.left[f]) < 1e-6,
      `channels swapped or mixed at ${f}`,
    );
    judged++;
  }
  return { worst, judged };
}

const results = [];
const report = (name, value, bar, ok) => {
  results.push({ name, value, bar, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${value} (bar ${bar})`);
};
const check = (name, ok, detail = "") =>
  report(name, ok ? "yes" : `no ${detail}`, "yes", ok);

// Rate 1: exact mapping, through adjust changes and back to the bypass.
{
  const rig = new Rig();
  rig.control({ type: "epoch", epoch: 1, at: 10 });
  let end = rig.feed(1, 10, 1);
  rig.control({ type: "play" });
  const keepFed = (r) => {
    if (r.reports.length > 0 && end - r.reports.at(-1).media < 1)
      end = r.feed(1, end, 0.5);
  };
  rig.runSeconds(1.5, keepFed);
  const steps = [
    [1.004, 1],
    [0.997, 1],
    [1.0099, 1],
    [1, 1.5],
  ];
  for (const [ratio, seconds] of steps) {
    rig.control({ type: "adjust", ratio });
    rig.runSeconds(seconds, keepFed);
  }
  const { worst, judged } = mappingError(rig, 0, rig.left.length);
  report(
    "rate 1 with adjust 1.004 → 0.997 → 1.0099 → 1: mapping",
    `${worst.toFixed(4)} frames worst over ${judged} frames`,
    "≤ 1 frame",
    worst <= 1,
  );
  // Back at exactly 1: the output is the input again.
  let same = true;
  for (let f = rig.left.length - C; f < rig.left.length; f++) {
    const p = rig.predicted(f);
    if (Math.abs(rig.left[f] - Math.fround(frac(p))) > 2e-7) same = false;
  }
  check(
    "adjust back to 1: the last second is the input sample for sample",
    same,
  );
  const speeds = new Set(
    rig.reports
      .filter((r) => r.state === "playing")
      .map((r) => r.speed.toFixed(4)),
  );
  check(
    "reported speeds include each adjust",
    ["1.0040", "0.9970", "1.0099", "1.0000"].every((s) => speeds.has(s)),
    [...speeds].join(","),
  );
  const first = rig.reports.findIndex((r) => r.state === "playing");
  const gaps = [];
  for (let i = first + 1; i < rig.reports.length; i++)
    gaps.push(rig.reports[i].frame - rig.reports[i - 1].frame);
  const longest = Math.max(...gaps);
  check(
    `reports every 50 ms, at the first quantum boundary after (longest ${((longest / C) * 1000).toFixed(1)} ms)`,
    longest < 0.05 * C + QUANTUM,
  );
  // Fade-in: the first playing quantum rises from silence.
  const start = rig.reports.find((r) => r.state === "playing").frame;
  const gain = (f) => rig.left[f] / Math.fround(frac(rig.predicted(f)));
  const early = gain(start + 8);
  const middle = gain(start + 64);
  const full = gain(start + QUANTUM);
  check(
    `fade-in over the first quantum: gain ${early.toFixed(4)} at frame 8, ${middle.toFixed(3)} at 64, ${full.toFixed(6)} at 128`,
    early < 0.02 && Math.abs(middle - 0.5) < 0.02 && Math.abs(full - 1) < 1e-6,
  );
  // Consumed: one at the epoch start, then about every 100 ms.
  const consumed = rig.consumed;
  check(
    "consumed at the epoch start says `at`",
    consumed[0]?.epoch === 1 && consumed[0]?.until === 10,
    JSON.stringify(consumed[0]),
  );
  let increasing = true;
  for (let i = 1; i < consumed.length; i++)
    if (!(consumed[i].until > consumed[i - 1].until)) increasing = false;
  const playedSeconds = (rig.left.length - start) / C;
  check(
    `consumed about every 100 ms (${consumed.length} over ${playedSeconds.toFixed(2)} s) and increasing`,
    increasing && Math.abs(consumed.length - 1 - playedSeconds / 0.1) <= 2,
  );
  // Each `consumed` is sent after a quantum; it is ahead of that quantum's
  // end by what the stages hold (the resampler's half kernel at rate 1).
  const after = consumed.at(-1);
  const reportedEnd = rig.predicted(rig.left.length - 1);
  check(
    `consumed is within the stages' lookahead of the output (last: ${after.until.toFixed(4)}, output now ${reportedEnd.toFixed(4)})`,
    reportedEnd - after.until < 0.1 + 1 / C && after.until - reportedEnd < 0.01,
  );
}

// Other rates: within SEARCH + |1 - rate| HOP/2 of the nominal time; switching rates.
{
  const rig = new Rig();
  rig.control({ type: "epoch", epoch: 1, at: 0 });
  let end = rig.feed(1, 0, 1.5);
  rig.control({ type: "play" });
  const keepFed = (r) => {
    if (r.reports.length > 0 && end - r.reports.at(-1).media < 1.5)
      end = r.feed(1, end, 0.5);
  };
  const plan = [
    [2, 2],
    [0.5, 2],
    [1.25, 2],
    [1, 1],
    [0.75, 2],
    [1.5, 1],
  ];
  rig.runSeconds(0.5, keepFed);
  for (const [rate, seconds] of plan) {
    const from = rig.left.length;
    rig.control({ type: "rate", rate });
    rig.runSeconds(seconds, keepFed);
    // Judge after the switch has settled (a frame and the resampler's delay).
    const settle = Math.round(0.1 * C);
    const margin = 0.1;
    const { worst, judged } = mappingError(
      rig,
      from + settle,
      rig.left.length,
      margin,
    );
    const bound = (SEARCH + (Math.abs(1 - rate) * HOP) / 2 / C) * C;
    const speedOk = rig.reportAt(rig.left.length - 1).speed === rate;
    report(
      `rate ${rate}: sound vs reported nominal time`,
      `${((worst / C) * 1000).toFixed(2)} ms worst over ${judged} frames; speed ${rig.reportAt(rig.left.length - 1).speed}`,
      `≤ ${((bound / C) * 1000).toFixed(1)} ms${rate === 1 ? " (exact: ≤ 1 frame)" : ""}`,
      (rate === 1 ? worst <= 1 : worst <= bound + 1) && speedOk,
    );
  }
}

// Epochs: PCM of the next epoch before its announcement is kept, a stale epoch's is dropped.
{
  const rig = new Rig();
  rig.control({ type: "epoch", epoch: 1, at: 0 });
  rig.feed(1, 0, 1);
  rig.control({ type: "play" });
  rig.runSeconds(0.5);
  rig.send(chunk(2, 100)); // the Worker is ahead of the page
  rig.control({ type: "epoch", epoch: 2, at: 100 });
  rig.send(chunk(1, 1)); // stale
  rig.feed(2, 100 + CHUNK / C, 0.5);
  const switchFrame = rig.frame;
  rig.runSeconds(0.6);
  const first = rig.reports.find((r) => r.epoch === 2);
  check(
    "epoch 2 reported buffering at media 100 from the next quantum",
    first?.state === "buffering" &&
      first.media === 100 &&
      first.frame === switchFrame + QUANTUM,
    JSON.stringify(first),
  );
  const playing = rig.reports.find(
    (r) => r.epoch === 2 && r.state === "playing",
  );
  check(
    "epoch 2 plays from media 100 once 200 ms are queued (play persists)",
    playing?.media === 100,
    JSON.stringify(playing),
  );
  const expected = 100 + (CHUNK + Math.round((0.5 * C) / CHUNK) * CHUNK) / C;
  check(
    "the stale chunk was dropped",
    Math.abs(rig.reports.at(-1).queuedUntil - expected) < 1e-9,
    `${rig.reports.at(-1).queuedUntil} vs ${expected}`,
  );
  const { worst } = mappingError(rig, playing.frame, rig.left.length);
  check(`epoch 2 mapping exact (${worst.toFixed(4)} frames)`, worst <= 1);
  check(
    "consumed told the Worker epoch 2 starts at 100",
    rig.consumed.some((c) => c.epoch === 2 && c.until === 100),
  );
  // The quantum that switched faded the old epoch out.
  const tail = rig.left.slice(switchFrame, switchFrame + QUANTUM).map(Math.abs);
  check(
    "the old epoch fades out over the switching quantum",
    tail[0] > 0.01 && tail[QUANTUM - 1] < 1e-3,
    `${tail[0]} ${tail[QUANTUM - 1]}`,
  );
}

// Gaps, overlaps, jumps.
{
  const rig = new Rig();
  rig.control({ type: "epoch", epoch: 1, at: 0 });
  const a = rig.feed(1, 0, 0.5); // 0 .. a
  const gapEnd = a + 0.3; // a 300 ms gap: silence
  const b = rig.feed(1, gapEnd, 0.3);
  const overlapStart = b - 0.01; // 10 ms overlap: dropped
  const c = rig.feed(1, overlapStart, 0.3);
  const jumpTo = 10; // more than 1 s ahead: the timeline jumps
  rig.feed(1, jumpTo, 0.5);
  rig.send({ type: "end", epoch: 1 });
  rig.control({ type: "play" });
  rig.runSeconds(2.2);
  // The gap carries no sawtooth; the frames next to it are smeared by nothing
  // at rate 1, so only the gap itself is left out.
  const inGap = (p) => p > a - 1 / C && p < gapEnd;
  const { worst, judged } = mappingError(
    rig,
    0,
    rig.left.length,
    60 / C,
    inGap,
  );
  check(
    `mapping exact through gap, overlap and jump (${worst.toFixed(4)} frames worst over ${judged})`,
    worst <= 1,
  );
  // The gap is silence where the reports say a..gapEnd.
  let silent = true;
  let gapFrames = 0;
  for (let f = 0; f < rig.left.length; f++) {
    const p = rig.predicted(f);
    if (p > a + 0.001 && p < gapEnd - 0.001) {
      gapFrames++;
      if (rig.left[f] !== 0) silent = false;
    }
  }
  check(
    `the 300 ms gap played as silence (${gapFrames} frames)`,
    silent && Math.abs(gapFrames - 0.298 * C) < 10,
  );
  // Overlap: the timeline is c - 0.01 longer, not c.
  const jump = rig.reports.find((r) => r.media >= jumpTo);
  check(
    `a report at the jump's exact frame (media ${jump?.media}, frame ${jump?.frame} in quantum at ${jump && jump.frame % QUANTUM})`,
    jump?.media === jumpTo,
  );
  const before = rig.reportAt(jump.frame - 1);
  const atJump =
    before.media + ((jump.frame - before.frame) * before.speed) / C;
  check(
    `the timeline before the jump ran to ${c.toFixed(6)} (overlap dropped): ${atJump.toFixed(6)}`,
    Math.abs(atJump - c) < 1 / C,
  );
  const ended = rig.reports.find((r) => r.state === "ended");
  check(
    `ended at the end of the PCM (${ended?.media})`,
    ended !== undefined &&
      Math.abs(
        ended.media - (jumpTo + (Math.round((0.5 * C) / CHUNK) * CHUNK) / C),
      ) < 1e-9,
  );
  let quiet = true;
  for (let f = ended.frame; f < rig.left.length; f++)
    if (rig.left[f] !== 0) quiet = false;
  check("silence after ended", quiet);
}

// Starving and resuming; pausing and resuming.
for (const how of ["starve", "pause"]) {
  const rig = new Rig();
  rig.control({ type: "epoch", epoch: 1, at: 0 });
  let end = rig.feed(1, 0, 0.6);
  rig.control({ type: "play" });
  if (how === "starve") rig.runSeconds(0.8);
  else {
    rig.runSeconds(0.3);
    rig.control({ type: "pause" });
    rig.runSeconds(0.3);
  }
  const stop = rig.reports.find(
    (r) => r.state === (how === "starve" ? "starved" : "paused"),
  );
  assert.ok(
    stop,
    `${how}: no ${how === "starve" ? "starved" : "paused"} report`,
  );
  const lastPlaying = rig.reportAt(stop.frame - 1);
  const ranTo =
    lastPlaying.media +
    ((stop.frame - lastPlaying.frame) * lastPlaying.speed) / C;
  check(
    `${how}: stops at a quantum boundary with media frozen where the sound stopped (${stop.media.toFixed(6)} = ${ranTo.toFixed(6)}), speed 0`,
    stop.frame % QUANTUM === 0 &&
      Math.abs(stop.media - ranTo) < 1e-9 &&
      stop.speed === 0,
  );
  const gainAt = (f) =>
    rig.left[f] /
    Math.fround(
      frac(
        lastPlaying.media + ((f - lastPlaying.frame) * lastPlaying.speed) / C,
      ),
    );
  check(
    `${how}: the last quantum fades out (gain ${gainAt(stop.frame - QUANTUM).toFixed(4)} → ${gainAt(stop.frame - 64).toFixed(3)} → ${gainAt(stop.frame - 1).toExponential(1)})`,
    Math.abs(gainAt(stop.frame - QUANTUM) - 1) < 1e-3 &&
      Math.abs(gainAt(stop.frame - 64) - 0.5) < 0.02 &&
      gainAt(stop.frame - 1) < 1e-3,
  );
  let quiet = true;
  for (let f = stop.frame; f < rig.left.length; f++)
    if (rig.left[f] !== 0) quiet = false;
  check(`${how}: silence while ${stop.state}`, quiet);
  if (how === "starve") {
    rig.send(chunk(1, end, 2400)); // 50 ms: not enough to resume
    end += 2400 / C;
    rig.runSeconds(0.05);
    check(
      "starve: 50 ms queued does not resume",
      rig.reports.at(-1).state === "starved",
    );
    end = rig.feed(1, end, 0.3);
  } else rig.control({ type: "play" });
  rig.runSeconds(0.2);
  const resumed = rig.reports.find(
    (r) => r.state === "playing" && r.frame > stop.frame,
  );
  check(
    `${how}: resumes from the same media time (${resumed?.media.toFixed(6)})`,
    resumed !== undefined &&
      resumed.frame > stop.frame &&
      Math.abs(resumed.media - stop.media) < 1e-9,
  );
  const { worst } = mappingError(rig, 0, rig.left.length);
  check(
    `${how}: mapping exact around stop and resume (${worst.toFixed(4)} frames)`,
    worst <= 1,
  );
}

// Source rates: 44100 Hz into the 48000 Hz context, then a change to 48000 within the epoch.
{
  const rig = new Rig();
  rig.control({ type: "epoch", epoch: 1, at: 0 });
  const count = 60; // 1024-frame chunks at 44100 Hz: 1.393 s
  for (let k = 0; k < count; k++)
    rig.send(chunk(1, (k * CHUNK) / 44100, CHUNK, 44100));
  const change = (count * CHUNK) / 44100;
  rig.feed(1, change, 1);
  rig.send({ type: "end", epoch: 1 });
  rig.control({ type: "play" });
  rig.runSeconds(2.6);
  const playing = rig.reports.filter((r) => r.state === "playing");
  check(
    `44100 Hz source: speed 1 in media seconds per context second (${playing[0]?.speed})`,
    Math.abs(playing[0]?.speed - 1) < 1e-12,
  );
  // Interpolated at 44100 → 48000, so judge away from the change by the kernel.
  const nearChange = (p) => Math.abs(p - change) < 0.003;
  const { worst, judged } = mappingError(
    rig,
    0,
    rig.left.length,
    0.003,
    nearChange,
  );
  check(
    `44100 Hz then 48000 Hz: mapping within a frame (${worst.toFixed(4)} frames worst over ${judged})`,
    worst <= 1,
  );
  const states = [...new Set(rig.reports.map((r) => r.state))].join(" → ");
  check(
    `the rate change plays through without starving (${states})`,
    !states.includes("starved"),
  );
  const after = rig.reports.find(
    (r) => r.state === "playing" && r.media > change,
  );
  check(
    `after the change the media timeline continues (${after?.media.toFixed(6)} reported at the change's frame)`,
    after !== undefined && Math.abs(after.media - change) < 2 / 44100,
  );
}

// Volume: ramped, no step.
{
  const rig = new Rig();
  rig.control({ type: "epoch", epoch: 1, at: 0 });
  rig.feed(1, 0.05, 2); // ramp away from 0 so ratios are well defined
  rig.control({ type: "play" });
  rig.runSeconds(0.3);
  const from = rig.left.length;
  rig.control({ type: "volume", gain: 0.25 });
  rig.runSeconds(0.3);
  let previous = 1;
  let steepest = 0;
  let final = 0;
  for (let f = from; f < rig.left.length; f++) {
    const p = rig.predicted(f);
    const v = frac(p);
    if (v < 0.01 || v > 0.99) continue;
    const g = rig.left[f] / v;
    steepest = Math.max(steepest, Math.abs(g - previous));
    previous = g;
    final = g;
  }
  check(
    `volume 1 → 0.25 ramps (largest step per frame ${steepest.toExponential(2)}, 1/480 = ${(1 / 480).toExponential(2)}) to ${final.toFixed(6)}`,
    steepest <= 1 / 480 + 1e-5 && Math.abs(final - 0.25) < 1e-6,
  );
}

// Dual mono: the chosen service on both sides, and a change of choice taken
// at once, at the PCM read next.
{
  const rig = new Rig();
  rig.control({ type: "epoch", epoch: 1, at: 0 });
  const count = Math.round((2 * C) / CHUNK);
  for (let k = 0; k < count; k++)
    rig.send({ ...chunk(1, (k * CHUNK) / C), dualMono: true });
  rig.control({ type: "play" });
  rig.runSeconds(0.5);
  const main = rig.left.length;
  rig.control({ type: "dual-mono", sub: true });
  rig.runSeconds(0.5);
  const sides = (from, to) => {
    let same = true;
    let sign = 0;
    for (let f = from; f < to; f++) {
      if (rig.left[f] !== rig.right[f]) same = false;
      sign += Math.sign(rig.left[f]);
    }
    return { same, sign };
  };
  // Past the fades and the stages' look-ahead on either side of the change.
  const before = sides(main - 9600, main - 4800);
  const after = sides(main + 4800, main + 9600);
  check(
    `dual mono: one service on both sides, the main one (${before.sign}) then the second (${after.sign})`,
    before.same && after.same && before.sign > 0 && after.sign < 0,
  );
}

const failed = results.filter((r) => !r.ok);
assert.equal(failed.length, 0, `${failed.length} processor checks failed`);
