/**
 * Decode mode's schedule: which units the worker decodes for the pictures
 * the page asks for, and the buffers it copies them into.
 */
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const output = join(tmpdir(), `mpeg2toh264-pictures-test-${process.pid}.mjs`);

/** 25 Hz pictures, as the fixtures are. */
const FRAME = 0.04;

/**
 * Units as a session cuts an open group of `I B B P B B P B B ...`: the
 * group's intra unit holds the I and the two B pictures shown before it,
 * every other unit an anchor and the B pictures shown before it. `restart`
 * marks the first unit of all.
 */
function units(groups, groupFrames = 12) {
  const out = [];
  let slot = 0;
  for (let group = 0; group < groups; group++) {
    for (let anchor = 0; anchor < groupFrames; anchor += 3) {
      const first = group === 0 && anchor === 0;
      const at = slot + anchor;
      // Decode order: the anchor, then the B pictures before it.
      const pictures = [
        { time: (at + 2) * FRAME, duration: FRAME },
        ...(first
          ? []
          : [
              { time: at * FRAME, duration: FRAME },
              { time: (at + 1) * FRAME, duration: FRAME },
            ]),
      ];
      if (first) pictures[0] = { time: 0, duration: 3 * FRAME };
      out.push({
        name: `${group}.${anchor / 3}`,
        start: at * FRAME,
        restart: first,
        intra: anchor === 0,
        pictures,
      });
    }
    slot += groupFrames;
  }
  return out;
}

/** Everything `next` hands out now, by name. */
function drain(schedule) {
  const steps = [];
  for (let step = schedule.next(); step !== null; step = schedule.next())
    steps.push(step);
  return steps;
}

function names(steps) {
  return steps.map((step) => step.unit.name);
}

try {
  await build({
    entryPoints: ["packages/player/src/pictures.ts"],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  const { PictureBuffers, PictureSchedule, shows } = await import(
    pathToFileURL(output)
  );
  const all = units(4);

  // Continuous play: from the start, as far as each request reaches and no
  // further, and on from there without starting again.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    assert.equal(schedule.next(), null, "nothing is decoded before a request");
    assert.equal(schedule.need(0, 0, 0.3), true);
    let steps = drain(schedule);
    assert.deepEqual(names(steps), ["0.0", "0.1", "0.2"]);
    assert.deepEqual(
      steps.map((step) => step.reset),
      [true, false, false],
    );
    assert.ok(steps.every((step) => step.epoch === 0 && step.from === 0));
    schedule.need(0, 0.04, 0.34);
    assert.deepEqual(names(drain(schedule)), [], "0.3 is all 0.0-0.2 reach");
    schedule.need(0, 0.2, 0.5);
    steps = drain(schedule);
    assert.deepEqual(names(steps), ["0.3", "1.0"]);
    assert.ok(
      steps.every((step) => !step.reset),
      "continuing",
    );

    // Paused: the same request again decodes nothing more.
    for (let index = 0; index < 3; index++) {
      schedule.need(0, 0.2, 0.5);
      assert.equal(schedule.next(), null);
    }
  }

  // A forward jump inside what is held starts again at the latest intra unit
  // at or before the request, and marks what ends before it decode-only.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 0, 0.3);
    drain(schedule);
    const from = 1.1;
    schedule.need(0, from, from + 0.3);
    const steps = drain(schedule);
    assert.equal(steps[0].unit.name, "2.0", "group 2 opens at 0.96 s");
    assert.equal(steps[0].reset, true);
    assert.ok(steps.slice(1).every((step) => !step.reset));
    assert.ok(steps.every((step) => step.from === from));
    assert.ok(
      steps.at(-1).unit.pictures.some((picture) => picture.time <= from + 0.3),
    );
    const shown = steps
      .flatMap((step) => step.unit.pictures)
      .filter((picture) => shows(picture, from))
      .map((picture) => Math.round(picture.time / FRAME));
    // 1.1 s falls in picture 27; 26 ends within a picture of it.
    assert.ok(shown.includes(27) && shown.includes(26), "shown");
    assert.ok(!shown.includes(25), "earlier ones are references only");
    // Catching up after a jump is not another jump.
    schedule.need(0, from + 0.04, from + 0.34);
    assert.ok(drain(schedule).every((step) => !step.reset));
  }

  // Backward in the same epoch, and a new epoch, both start again.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 1.2, 1.5);
    assert.equal(drain(schedule)[0].unit.name, "2.0");
    schedule.need(0, 0.5, 0.8);
    let steps = drain(schedule);
    // Group 1's intra picture is at 0.56 s, after the request: its leading
    // pictures need group 0.
    assert.equal(steps[0].unit.name, "0.0", "back to group 0");
    assert.equal(steps[0].reset, true);
    schedule.need(1, 0.6, 0.9);
    steps = drain(schedule);
    assert.equal(steps[0].unit.name, "1.0", "a new epoch starts again");
    assert.equal(steps[0].reset, true);
    assert.equal(steps[0].epoch, 1);
  }

  // Outside what is held: nothing until a unit to start at arrives.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all.slice(0, 4)) schedule.add(unit);
    schedule.need(0, 1.1, 1.4);
    assert.equal(schedule.next(), null, "group 2 has not arrived");
    // Group 2's intra unit ends at 1.08 s, before the request.
    for (const unit of all.slice(4, 9)) schedule.add(unit);
    assert.equal(schedule.next(), null, "1.1 s has not arrived");
    for (const unit of all.slice(9)) schedule.add(unit);
    const steps = drain(schedule);
    assert.deepEqual(names(steps), ["2.0", "2.1", "2.2", "2.3"]);
    assert.equal(steps[0].reset, true);
  }

  // Before the first unit: decoding begins where the units do.
  {
    const schedule = new PictureSchedule(10);
    const late = units(1).map((unit) => ({
      ...unit,
      start: unit.start + 0.5,
      pictures: unit.pictures.map((picture) => ({
        ...picture,
        time: picture.time + 0.5,
      })),
    }));
    for (const unit of late) schedule.add(unit);
    schedule.need(0, 0, 0.3);
    const steps = drain(schedule);
    assert.deepEqual(names(steps), ["0.0", "0.1", "0.2"]);
    assert.equal(steps[0].from, 0.5);
  }

  // A seek that reopens the input: everything goes, and requests of the
  // epochs before it are refused.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(3, 0, 0.3);
    drain(schedule);
    schedule.clear();
    assert.equal(schedule.size, 0);
    assert.equal(schedule.need(3, 0, 0.3), false, "an old epoch");
    for (const unit of all) schedule.add(unit);
    assert.equal(schedule.next(), null, "no request since");
    assert.equal(schedule.need(4, 0, 0.3), true);
    assert.equal(drain(schedule)[0].reset, true);
  }

  // A unit that fails: decoding begins again at the next intra unit.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 0, 2);
    const first = schedule.next();
    assert.equal(first.unit.name, "0.0");
    schedule.next();
    schedule.failed();
    const steps = drain(schedule);
    assert.equal(steps[0].unit.name, "1.0", "0.2 and 0.3 cannot be decoded");
    assert.equal(steps[0].reset, true);
  }

  // The end of the input, once per epoch and only once everything after the
  // start of decoding is out.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.end();
    schedule.need(0, 0, 0.3);
    drain(schedule);
    assert.equal(schedule.takeEnd(), null, "units are left");
    schedule.need(0, 0.3, 3);
    drain(schedule);
    assert.equal(schedule.takeEnd(), 0);
    assert.equal(schedule.takeEnd(), null, "said once");
    schedule.need(1, 1.5, 3);
    assert.equal(schedule.takeEnd(), null, "the new epoch has not decoded");
    drain(schedule);
    assert.equal(schedule.takeEnd(), 1);
    schedule.clear();
    for (const unit of all) schedule.add(unit);
    schedule.need(2, 0, 3);
    drain(schedule);
    assert.equal(schedule.takeEnd(), null, "a reopened input has not ended");
  }

  // What is far behind the playhead goes, but not the unit decoding would
  // start again at.
  {
    const schedule = new PictureSchedule(0.5);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 0, 3);
    drain(schedule);
    schedule.playhead(1.5);
    assert.ok(schedule.size < all.length, "units were dropped");
    schedule.need(0, 1.5, 1.8);
    schedule.need(1, 1.5, 1.8);
    assert.equal(drain(schedule)[0].unit.name, "2.0", "group 2 is kept");
    // Back among what was dropped: only reading the input again helps, and
    // nothing later is put in its place.
    assert.equal(schedule.dropped(0.2), true);
    assert.equal(schedule.dropped(1.5), false);
    schedule.need(2, 0.2, 0.5);
    assert.equal(schedule.next(), null);
    schedule.clear();
    assert.equal(schedule.dropped(0.2), false, "a reopened input");
  }

  // Units are kept in time order.
  {
    const schedule = new PictureSchedule(10);
    schedule.add(all[1]);
    schedule.add(all[0]);
    schedule.need(0, 0, 0.2);
    assert.deepEqual(names(drain(schedule)), ["0.0", "0.1"]);
    assert.throws(() => schedule.add({ ...all[2], pictures: [] }));
  }

  // Buffers: used again when they come back the size pictures are, and not
  // when detached or of another size.
  {
    const buffers = new PictureBuffers();
    const first = buffers.take(100);
    assert.equal(first.byteLength, 100);
    assert.equal(buffers.recycle(first), true);
    assert.equal(buffers.take(100), first, "the same buffer again");
    assert.equal(buffers.recycle(new ArrayBuffer(99)), false, "another size");
    const detached = new ArrayBuffer(100);
    structuredClone(detached, { transfer: [detached] });
    assert.equal(detached.byteLength, 0);
    assert.equal(buffers.recycle(detached), false, "detached");
    assert.equal(buffers.recycle(new Uint8Array(100)), false, "not a buffer");
    const another = new ArrayBuffer(100);
    assert.equal(buffers.recycle(another), true, "any buffer of the size");
    assert.equal(buffers.take(100), another);
    // A new size forgets the old ones.
    buffers.recycle(first);
    assert.equal(buffers.take(200).byteLength, 200);
    assert.equal(buffers.recycle(first), false);
    assert.equal(buffers.allocated, 2);
  }

  console.log("picture schedule tests passed");
} finally {
  await unlink(output).catch(() => {});
}
