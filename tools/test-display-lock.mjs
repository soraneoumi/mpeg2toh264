/**
 * The display lock against a simulated screen, sound and picture count, with
 * the rates measured in Firefox 160: a 59.949 Hz screen, 59.94 fields a
 * second, a device clock 0.031 % slow against `performance.now()`, and the
 * clock read with 0.3 ms of jitter. The pictures are counted as the
 * deinterlacer counts them (whole fields a refresh where the screen is close
 * enough, else the refresh), with its 1 s average of the sound's lead and its
 * correction past 20 ms and a refresh. The lock has to keep the sound with
 * the count so that the count never needs that correction.
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
  const deviceRate = 1 - 0.00031;

  /**
   * Play `seconds`, the count starting `offset` seconds off the sound (a
   * start that missed its refresh). Returns the count's corrections after
   * `settle` seconds and the largest lead the average showed after then.
   */
  function run({
    seconds = 60,
    seed = 1,
    rate = 1,
    hz = 59.949,
    offset = 0,
    settle = 20,
  }) {
    const refreshMs = 1000 / hz;
    let random = seed;
    const jitter = () => {
      random = (random * 1103515245 + 12345) % 2 ** 31;
      return (random / 2 ** 31 - 0.5) * 0.6e-3;
    };
    let adjust = 1;
    const lock = new DisplayLock((ratio) => (adjust = ratio));
    let media = 10.003;
    let cursor = Number.NaN;
    let lead = Number.NaN;
    let reported = Number.NaN;
    let corrections = 0;
    let worst = 0;
    // The count's step: as the deinterlacer's #countStep.
    const refresh = (refreshMs * rate) / 1000;
    const steps = refresh / field;
    const whole = steps >= 1 ? Math.round(steps) : 1 / Math.round(1 / steps);
    const step = Math.abs(steps / whole - 1) <= 0.005 ? whole * field : refresh;
    const frames = Math.round((seconds * 1000) / refreshMs);
    for (let frame = 0; frame < frames; frame++) {
      const now = frame * refreshMs;
      const speed = deviceRate * adjust * rate;
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
      // The deinterlacer reports once a second.
      if (Math.floor(now / 1000) !== Math.floor((now - refreshMs) / 1000))
        reported = lead;
      lock.frame({
        now,
        speed,
        step: field,
        rate,
        active: true,
        avDifference: reported,
      });
    }
    return { corrections, worst, adjust };
  }

  for (const seed of [1, 2, 3]) {
    const held = run({ seconds: 600, seed });
    console.log(
      `59.949 Hz, 10 min, seed ${seed}: ${held.corrections} corrections, lead within ${(held.worst * 1000).toFixed(2)} ms, adjust ${held.adjust.toFixed(6)}`,
    );
    assert.equal(held.corrections, 0, "no correction once settled");
    assert.ok(held.worst < 0.003, "the sound within 3 ms of the pictures");
  }

  // A start 15 ms off is taken back by the sound's speed alone; one 30 ms
  // off is first corrected by the count, by whole refreshes.
  for (const offset of [0.015, -0.015, 0.03]) {
    const held = run({ seconds: 120, offset, settle: 60 });
    console.log(
      `start ${offset * 1000} ms off: lead within ${(held.worst * 1000).toFixed(2)} ms after a minute`,
    );
    assert.equal(
      held.corrections,
      0,
      `${offset}: no correction after a minute`,
    );
    assert.ok(held.worst < 0.003, `${offset}: taken back`);
  }

  for (const rate of [2, 0.5]) {
    const held = run({ seconds: 300, seed: 4, rate });
    console.log(
      `${rate}x, 5 min: ${held.corrections} corrections, lead within ${(held.worst * 1000).toFixed(2)} ms`,
    );
    assert.equal(held.corrections, 0, `${rate}x: no correction`);
    assert.ok(held.worst < 0.003, `${rate}x: with the pictures`);
  }

  // 75 Hz against 59.94: counted by the refresh, the sound at its own rate
  // but for the drift, which the correction takes back.
  {
    const held = run({ seconds: 300, hz: 75 });
    console.log(
      `75 Hz, 5 min: ${held.corrections} corrections, lead within ${(held.worst * 1000).toFixed(2)} ms, adjust ${held.adjust.toFixed(6)}`,
    );
    assert.equal(held.corrections, 0, "75 Hz: no correction");
    assert.ok(held.worst < 0.005, "75 Hz: with the pictures");
    assert.ok(Math.abs(held.adjust - 1) < 0.002, "75 Hz: no rate match");
  }
  console.log("display lock tests passed");
} finally {
  await unlink(output).catch(() => {});
}
