/**
 * The display lock against a simulated screen, sound and picture count, with
 * the rates measured in Firefox 160: a 59.949 Hz screen, 59.94 fields a
 * second, a device clock 0.031 % slow against `performance.now()`, and the
 * clock read with 0.3 ms of jitter. The pictures are counted as the
 * deinterlacer counts them (whole fields a refresh where the screen is close
 * enough, else the refresh), with its 1 s average of the sound's lead,
 * reported once a second, and its correction past 20 ms and a refresh. The
 * lock is told nothing of the device's rate: it has to learn it from the
 * lead, keep the sound with the count while it does so that the count never
 * needs that correction, and leave no lead standing once it has.
 */
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const output = join(
  tmpdir(),
  `mpeg2toh264-display-lock-test-${process.pid}.mjs`,
);
await build({
  entryPoints: ["packages/player/src/display-lock.ts"],
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "neutral",
});

try {
  const { DisplayLock } = await import(pathToFileURL(output));
  const field = 1001 / 60000;
  const deviceDrift = -0.00031;

  /**
   * Play `seconds`, the count starting `offset` seconds off the sound (a
   * start that missed its refresh), the lock starting from `drift` (what an
   * earlier load learnt). Returns the count's corrections after `settle`
   * seconds, the largest lead the average showed after then and over the
   * whole run, and the drift the lock learnt.
   */
  function run({
    seconds = 60,
    seed = 1,
    rate = 1,
    hz = 59.949,
    offset = 0,
    settle = 20,
    drift = 0,
  }) {
    const refreshMs = 1000 / hz;
    let random = seed;
    const jitter = () => {
      random = (random * 1103515245 + 12345) % 2 ** 31;
      return (random / 2 ** 31 - 0.5) * 0.6e-3;
    };
    let adjust = 1;
    const lock = new DisplayLock((ratio) => (adjust = ratio), drift);
    let media = 10.003;
    let cursor = Number.NaN;
    let lead = Number.NaN;
    let reported = Number.NaN;
    let corrections = 0;
    let worst = 0;
    let peak = 0;
    // The count's step: as the deinterlacer's #countStep.
    const refresh = (refreshMs * rate) / 1000;
    const steps = refresh / field;
    const whole = steps >= 1 ? Math.round(steps) : 1 / Math.round(1 / steps);
    const step = Math.abs(steps / whole - 1) <= 0.005 ? whole * field : refresh;
    const frames = Math.round((seconds * 1000) / refreshMs);
    for (let frame = 0; frame < frames; frame++) {
      const now = frame * refreshMs;
      const speed = (1 + deviceDrift) * adjust * rate;
      if (frame > 0) media += (refreshMs / 1000) * speed;
      // The clock at the refresh being filled.
      const time = media + (refreshMs / 1000) * speed + jitter();
      if (Number.isNaN(cursor)) cursor = time - offset;
      else {
        cursor += step;
        const difference = time - cursor;
        if (Math.abs(difference) >= Math.max(0.02 * rate, step)) {
          cursor += Math.trunc(difference / step) * step;
          if (now > settle * 1000) corrections++;
        }
      }
      const difference = time - cursor;
      lead = Number.isNaN(lead)
        ? difference
        : lead + ((difference - lead) * refreshMs) / 1000;
      if (now > settle * 1000) worst = Math.max(worst, Math.abs(lead));
      peak = Math.max(peak, Math.abs(lead));
      // The deinterlacer reports once a second.
      if (Math.floor(now / 1000) !== Math.floor((now - refreshMs) / 1000))
        reported = lead;
      lock.frame({
        now,
        step: field,
        rate,
        active: true,
        avDifference: reported,
      });
    }
    return { corrections, worst, peak, adjust, drift: lock.drift };
  }

  const ms = (seconds) => (seconds * 1000).toFixed(2);
  const percent = (fraction) => `${(fraction * 100).toFixed(4)} %`;

  // A first load: the drift is learnt while the sound stays with the count,
  // and then no lead is left.
  for (const seed of [1, 2, 3]) {
    const held = run({ seconds: 600, seed, settle: 60 });
    console.log(
      `59.949 Hz, 10 min, seed ${seed}: ${held.corrections} corrections, lead at most ${ms(held.peak)} ms, within ${ms(held.worst)} ms after a minute, drift ${percent(held.drift)}`,
    );
    assert.equal(held.corrections, 0, "no correction once settled");
    assert.ok(held.peak < 0.003, "the sound within 3 ms of the pictures");
    assert.ok(held.worst < 0.0005, "no lead left after a minute");
    assert.ok(
      Math.abs(held.drift + 0.00031) < 0.00002,
      "the device's drift learnt",
    );
  }

  // A later load starts from what the first learnt: nothing to learn.
  {
    const held = run({ seconds: 120, drift: -0.00031, settle: 0 });
    console.log(
      `starting from the learnt drift: lead within ${ms(held.peak)} ms`,
    );
    assert.ok(held.peak < 0.0003, "no lead while nothing is to be learnt");
  }

  // A start 15 ms off is taken back by the sound's speed alone; one 30 ms
  // off is first corrected by the count, by whole refreshes.
  for (const offset of [0.015, -0.015, 0.03]) {
    const held = run({ seconds: 180, offset, settle: 120 });
    console.log(
      `start ${offset * 1000} ms off: lead within ${ms(held.worst)} ms after two minutes`,
    );
    assert.equal(
      held.corrections,
      0,
      `${offset}: no correction after two minutes`,
    );
    assert.ok(held.worst < 0.0005, `${offset}: taken back`);
  }

  for (const rate of [2, 0.5]) {
    const held = run({ seconds: 300, seed: 4, rate, settle: 60 });
    console.log(
      `${rate}x, 5 min: ${held.corrections} corrections, lead at most ${ms(held.peak)} ms, within ${ms(held.worst)} ms after a minute`,
    );
    assert.equal(held.corrections, 0, `${rate}x: no correction`);
    assert.ok(held.peak < 0.003, `${rate}x: with the pictures`);
    assert.ok(held.worst < 0.0005, `${rate}x: no lead left`);
  }

  // 75 Hz against 59.94: counted by the refresh, the sound at the speed
  // asked for but for the drift, which is learnt all the same.
  {
    const held = run({ seconds: 300, hz: 75, settle: 60 });
    console.log(
      `75 Hz, 5 min: ${held.corrections} corrections, lead at most ${ms(held.peak)} ms, within ${ms(held.worst)} ms after a minute, adjust ${held.adjust.toFixed(6)}`,
    );
    assert.equal(held.corrections, 0, "75 Hz: no correction");
    assert.ok(held.peak < 0.003, "75 Hz: with the pictures");
    assert.ok(held.worst < 0.0005, "75 Hz: no lead left");
    assert.ok(Math.abs(held.adjust - 1) < 0.002, "75 Hz: no rate match");
  }
  // The refresh period: refreshes the page missed count as the periods they
  // were, and a display that changes its rate is followed once the window
  // holds refreshes of the new rate, in under two seconds at 144 Hz.
  {
    const lock = new DisplayLock(() => {});
    let now = 1000;
    const frame = () =>
      lock.frame({
        now,
        step: null,
        rate: 1,
        active: false,
        avDifference: Number.NaN,
      });
    for (let index = 0; index < 600; index++) {
      // Every seventh refresh missed, one in fifty missed twice over.
      now += (1000 / 59.94) * (index % 50 === 0 ? 3 : index % 7 === 0 ? 2 : 1);
      frame();
    }
    assert.ok(
      Math.abs(lock.period - 1000 / 59.94) < 0.01,
      `missed refreshes: ${lock.period}`,
    );
    const next = lock.refreshAfter(now + 20);
    assert.ok(
      Math.abs(next - (now + (2 * 1000) / 59.94)) < 0.05,
      `the refresh after: ${next - now}`,
    );
    for (let index = 0; index < 288; index++) {
      now += 1000 / 144;
      frame();
    }
    assert.ok(
      Math.abs(lock.period - 1000 / 144) < 0.01,
      `a display at 144 Hz after two seconds: ${lock.period}`,
    );
    console.log(`refresh period: ${lock.period.toFixed(4)} ms at 144 Hz`);
  }
  console.log("display lock tests passed");
} finally {
  await unlink(output).catch(() => {});
}
