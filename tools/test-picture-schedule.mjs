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

/**
 * The time of the picture the decoder holds back after the steps taken from
 * each schedule: the anchor of the last unit, which comes first in decode
 * order here, unless it is only a reference. A reset drops it, and so does a
 * failure, after which the worker sends it on.
 */
const heldBack = new WeakMap();

/** Take the next step, as the worker does, with what the decoder holds. */
function next(schedule, shows) {
  const step = schedule.next(heldBack.get(schedule) ?? null);
  if (step !== null) {
    const anchor = step.unit.pictures[0];
    heldBack.set(schedule, shows(anchor, step.from) ? anchor.time : null);
  }
  return step;
}

/** Everything `next` hands out now. */
function drain(schedule, shows) {
  const steps = [];
  for (let step = next(schedule, shows); step !== null;)
    (steps.push(step), (step = next(schedule, shows)));
  return steps;
}

function fail(schedule) {
  schedule.failed();
  heldBack.set(schedule, null);
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
    assert.equal(
      next(schedule, shows),
      null,
      "nothing is decoded before a request",
    );
    assert.equal(schedule.need(0, 0, 0.3), true);
    let steps = drain(schedule, shows);
    assert.deepEqual(names(steps), ["0.0", "0.1", "0.2"]);
    assert.deepEqual(
      steps.map((step) => step.reset),
      [true, false, false],
    );
    assert.ok(steps.every((step) => step.epoch === 0 && step.from === 0));
    // The anchor at 0.32 s comes out only once 0.3's is decoded.
    schedule.need(0, 0.04, 0.34);
    assert.deepEqual(names(drain(schedule, shows)), ["0.3"]);
    schedule.need(0, 0.2, 0.5);
    steps = drain(schedule, shows);
    assert.deepEqual(names(steps), ["1.0"]);
    assert.ok(
      steps.every((step) => !step.reset),
      "continuing",
    );

    // Paused: the same request again decodes nothing more.
    for (let index = 0; index < 3; index++) {
      schedule.need(0, 0.2, 0.5);
      assert.equal(next(schedule, shows), null);
    }
  }

  // A forward jump inside what is held starts again at the latest intra unit
  // at or before the request, and marks what ends before it decode-only.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 0, 0.3);
    drain(schedule, shows);
    const from = 1.1;
    schedule.need(0, from, from + 0.32);
    const steps = drain(schedule, shows);
    assert.equal(steps[0].unit.name, "2.0", "group 2 opens at 0.96 s");
    assert.equal(steps[0].reset, true);
    assert.ok(steps.slice(1).every((step) => !step.reset));
    assert.ok(steps.every((step) => step.from === from));
    // 3.0 starts after the request but lets out the anchor at 1.40 s.
    assert.deepEqual(names(steps), ["2.0", "2.1", "2.2", "2.3", "3.0"]);
    const shown = steps
      .flatMap((step) => step.unit.pictures)
      .filter((picture) => shows(picture, from))
      .map((picture) => Math.round(picture.time / FRAME));
    // 1.1 s falls in picture 27; 26 ends within a picture of it.
    assert.ok(shown.includes(27) && shown.includes(26), "shown");
    assert.ok(!shown.includes(25), "earlier ones are references only");
    // Catching up after a jump is not another jump.
    schedule.need(0, from + 0.04, from + 0.34);
    assert.ok(drain(schedule, shows).every((step) => !step.reset));
  }

  // Backward in the same epoch, and a new epoch, both start again.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 1.2, 1.5);
    assert.equal(drain(schedule, shows)[0].unit.name, "2.0");
    schedule.need(0, 0.5, 0.8);
    let steps = drain(schedule, shows);
    // Group 1's intra picture is at 0.56 s, after the request: its leading
    // pictures need group 0.
    assert.equal(steps[0].unit.name, "0.0", "back to group 0");
    assert.equal(steps[0].reset, true);
    schedule.need(1, 0.6, 0.9);
    steps = drain(schedule, shows);
    assert.equal(steps[0].unit.name, "1.0", "a new epoch starts again");
    assert.equal(steps[0].reset, true);
    assert.equal(steps[0].epoch, 1);
  }

  // Outside what is held: nothing until a unit to start at arrives.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all.slice(0, 4)) schedule.add(unit);
    schedule.need(0, 1.1, 1.38);
    assert.equal(next(schedule, shows), null, "group 2 has not arrived");
    // Group 2's intra unit ends at 1.08 s, before the request.
    for (const unit of all.slice(4, 9)) schedule.add(unit);
    assert.equal(next(schedule, shows), null, "1.1 s has not arrived");
    for (const unit of all.slice(9)) schedule.add(unit);
    const steps = drain(schedule, shows);
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
    const steps = drain(schedule, shows);
    assert.deepEqual(names(steps), ["0.0", "0.1", "0.2"]);
    assert.equal(steps[0].from, 0.5);
  }

  // The input read again from somewhere in it, as after a seek: a request
  // from before the earliest unit waits for what comes before that unit
  // rather than beginning with it, and is served once the input is read from
  // its start. The same once units are dropped.
  {
    const late = units(2).map((unit) => ({
      ...unit,
      start: unit.start + 2,
      pictures: unit.pictures.map((picture) => ({
        ...picture,
        time: picture.time + 2,
      })),
    }));
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 0, 0.3);
    drain(schedule, shows);
    schedule.clear(1);
    schedule.readFrom(false);
    for (const unit of late) schedule.add(unit);
    schedule.need(1, 0.5, 0.8);
    assert.equal(next(schedule, shows), null, "began with a unit after it");
    assert.equal(schedule.exhausted, true);
    schedule.clear(2);
    schedule.readFrom(true);
    for (const unit of late) schedule.add(unit);
    schedule.need(2, 0.5, 0.8);
    assert.equal(drain(schedule, shows)[0].from, 2, "the input's start");

    const dropping = new PictureSchedule(0.5);
    for (const unit of late) dropping.add(unit);
    dropping.need(0, 2, 2.3);
    drain(dropping, shows);
    dropping.playhead(3.5);
    dropping.need(1, 0.5, 0.8);
    assert.equal(next(dropping, shows), null, "began after dropping");
  }

  // A seek that reopens the input: everything goes, and requests of the
  // epochs before it are refused.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(3, 0, 0.3);
    drain(schedule, shows);
    schedule.clear();
    assert.equal(schedule.size, 0);
    assert.equal(schedule.need(3, 0, 0.3), false, "an old epoch");
    for (const unit of all) schedule.add(unit);
    assert.equal(next(schedule, shows), null, "no request since");
    assert.equal(schedule.need(4, 0, 0.3), true);
    assert.equal(drain(schedule, shows)[0].reset, true);
  }

  // A unit that fails: decoding begins again at the next intra unit.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 0, 2);
    const first = next(schedule, shows);
    assert.equal(first.unit.name, "0.0");
    next(schedule, shows);
    fail(schedule);
    const steps = drain(schedule, shows);
    assert.equal(steps[0].unit.name, "1.0", "0.2 and 0.3 cannot be decoded");
    assert.equal(steps[0].reset, true);
  }

  // A picture held back does not call for a unit that begins decoding
  // again: the reset drops it.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 0, 0.3);
    assert.deepEqual(names(drain(schedule, shows)), ["0.0", "0.1", "0.2"]);
    schedule.failed();
    assert.equal(schedule.next(0.32), null, "1.0 starts after the request");
  }

  // The end of the input, once per epoch and only once everything after the
  // start of decoding is out.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.end();
    schedule.need(0, 0, 0.3);
    drain(schedule, shows);
    assert.equal(schedule.takeEnd(), null, "units are left");
    schedule.need(0, 0.3, 3);
    drain(schedule, shows);
    assert.equal(schedule.takeEnd(), 0);
    assert.equal(schedule.takeEnd(), null, "said once");
    schedule.need(1, 1.5, 3);
    assert.equal(schedule.takeEnd(), null, "the new epoch has not decoded");
    drain(schedule, shows);
    assert.equal(schedule.takeEnd(), 1);
    schedule.clear();
    for (const unit of all) schedule.add(unit);
    schedule.need(2, 0, 3);
    drain(schedule, shows);
    assert.equal(schedule.takeEnd(), null, "a reopened input has not ended");
  }

  // What is far behind the playhead goes, but not the unit decoding would
  // start again at.
  {
    const schedule = new PictureSchedule(0.5);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 0, 3);
    drain(schedule, shows);
    schedule.playhead(1.5);
    assert.ok(schedule.size < all.length, "units were dropped");
    schedule.need(0, 1.5, 1.8);
    schedule.need(1, 1.5, 1.8);
    assert.equal(drain(schedule, shows)[0].unit.name, "2.0", "group 2 is kept");
    // Back among what was dropped: only reading the input again helps, and
    // nothing later is put in its place.
    assert.equal(schedule.dropped(0.2), true);
    assert.equal(schedule.dropped(1.5), false);
    schedule.need(2, 0.2, 0.5);
    assert.equal(next(schedule, shows), null);
    schedule.clear();
    assert.equal(schedule.dropped(0.2), false, "a reopened input");
  }

  // Whether anything more is to come for a request: what holds the sound
  // back for the pictures waits for it, and only for it.
  {
    const schedule = new PictureSchedule(10);
    for (const unit of all.slice(0, 3)) schedule.add(unit);
    schedule.need(0, 0, 0.3);
    assert.deepEqual(names(drain(schedule, shows)), ["0.0", "0.1", "0.2"]);
    assert.equal(schedule.exhausted, false, "the unit at 0.3 s has not come");
    for (const unit of all.slice(3)) schedule.add(unit);
    assert.deepEqual(names(drain(schedule, shows)), []);
    assert.equal(
      schedule.exhausted,
      true,
      "0.3 starts after the request, and so does the anchor held back",
    );
    schedule.need(0, 0.04, 0.34);
    assert.deepEqual(names(drain(schedule, shows)), ["0.3"]);
    assert.equal(schedule.exhausted, true, "1.0 starts after the request");
    schedule.need(0, 0.04, 0.6);
    assert.deepEqual(names(drain(schedule, shows)), ["1.0", "1.1"]);
    assert.equal(schedule.exhausted, true);
  }
  {
    // The units at the start of a request fail, and the next one a decoder
    // can begin at starts after it.
    const schedule = new PictureSchedule(10);
    for (const unit of all) schedule.add(unit);
    schedule.need(0, 0.1, 0.3);
    assert.equal(next(schedule, shows).unit.name, "0.0");
    fail(schedule);
    assert.equal(next(schedule, shows), null);
    assert.equal(schedule.exhausted, true, "nothing more before 1.0");
  }
  {
    // A request beyond the last picture, before and after the input ends.
    const schedule = new PictureSchedule(10);
    for (const unit of units(1)) schedule.add(unit);
    schedule.need(0, 0.6, 0.9);
    assert.equal(next(schedule, shows), null);
    assert.equal(schedule.exhausted, false, "the input goes on");
    assert.equal(schedule.takeEnd(), null);
    schedule.end();
    assert.equal(next(schedule, shows), null);
    assert.equal(schedule.exhausted, true);
    assert.equal(schedule.takeEnd(), 0, "nothing reaches the request");
    assert.equal(schedule.takeEnd(), null, "once");
  }

  // Units are kept in time order.
  {
    const schedule = new PictureSchedule(10);
    schedule.add(all[1]);
    schedule.add(all[0]);
    schedule.need(0, 0, 0.2);
    assert.deepEqual(names(drain(schedule, shows)), ["0.0", "0.1"]);
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
