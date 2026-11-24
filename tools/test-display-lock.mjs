/**
 * The display lock against a simulated screen and sound clock, with the rates
 * measured in Firefox 160: a 59.949 Hz screen, 59.94 fields a second, a
 * device clock 0.031 % slow against `performance.now()`, and the clock read
 * with 0.3 ms of jitter. Unlocked, the refresh drifts through the field grid
 * and the field shown at a refresh now and then repeats or skips. Locked,
 * after it has settled, every refresh shows the next field, with the refresh
 * held near the middle of its field.
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
  const refreshMs = 1000 / 59.949;
  const step = 1001 / 60000;
  const deviceRate = 1 - 0.00031;

  function run(locked, seconds = 60, seed = 1, rate = 1) {
    let random = seed;
    const jitter = () => {
      random = (random * 1103515245 + 12345) % 2 ** 31;
      return (random / 2 ** 31 - 0.5) * 0.6e-3;
    };
    let adjust = 1;
    const lock = new DisplayLock((ratio) => (adjust = ratio));
    // The media heard at wall time w: integrated as the speed changes.
    let media = 10.003;
    let wall = 0;
    const errors = [];
    let repeats = 0;
    let skips = 0;
    let last = null;
    const frames = Math.round((seconds * 1000) / refreshMs);
    for (let frame = 0; frame < frames; frame++) {
      const now = frame * refreshMs;
      media += ((now - wall) / 1000) * deviceRate * adjust * rate;
      wall = now;
      const speed = deviceRate * adjust * rate;
      const at = (w) => media + ((w - now) / 1000) * speed + jitter();
      if (locked)
        lock.frame({ now, at, speed, step, origin: 0, rate, active: true });
      // The field the screen shows at the next refresh, without jitter.
      const shown = media + (refreshMs / 1000) * speed;
      const field = Math.floor(shown / step);
      // Fields a refresh should move by at this speed: 2 at double speed,
      // and at half speed one every other refresh.
      const per = rate >= 1 ? Math.round(rate) : 0;
      if (frame * refreshMs > 20000 && last !== null) {
        if (per > 0 && field - last < per) repeats++;
        if (per > 0 && field - last > per) skips++;
        if (per === 0 && field - last > 1) skips++;
        errors.push((shown / step) % 1);
      }
      last = field;
    }
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    return { repeats, skips, adjust, phase: mean };
  }

  const free = run(false, 600);
  console.log(`unlocked, 10 min: ${free.repeats} repeats, ${free.skips} skips`);
  assert.ok(free.repeats + free.skips > 0, "unlocked, the grid slips");
  for (const seed of [1, 2, 3]) {
    const held = run(true, 600, seed);
    console.log(
      `locked, 10 min, seed ${seed}: ${held.repeats} repeats, ${held.skips} skips, ` +
        `adjust ${held.adjust.toFixed(6)}, mean phase ${held.phase.toFixed(3)}`,
    );
    assert.equal(held.repeats + held.skips, 0, "locked, no slip after 20 s");
    assert.ok(Math.abs(held.phase - 0.5) < 0.1, "the refresh near mid-field");
  }

  for (const rate of [2, 0.5]) {
    const held = run(true, 300, 4, rate);
    console.log(
      `locked at ${rate}x, 5 min: ${held.repeats} repeats, ${held.skips} skips, mean phase ${held.phase.toFixed(3)}`,
    );
    assert.equal(held.repeats + held.skips, 0, `${rate}x: no slip`);
  }

  // Not locked where the rates are far apart, nor when not active.
  {
    let sent = null;
    const lock = new DisplayLock((ratio) => (sent = ratio));
    for (let frame = 0; frame < 300; frame++)
      lock.frame({
        now: frame * (1000 / 75),
        at: (w) => w / 1000,
        speed: 1,
        step,
        origin: 0,
        rate: 1,
        active: true,
      });
    assert.equal(sent, null, "75 Hz against 59.94: left alone");
  }
  console.log("display lock tests passed");
} finally {
  await unlink(output).catch(() => {});
}
