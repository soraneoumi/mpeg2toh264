// Run with: node tools/test-video-frames.cjs
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const source = readFileSync(
  resolve(__dirname, "../packages/yadif/src/video-frame.ts"),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const modulePromise = import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

async function fixture(t, moz = true, playbackRate = 1, pictures = undefined) {
  const { VideoFrames, supportsVideoFrames } = await modulePromise;
  let next = 1;
  const raf = new Map();
  const native = new Map();
  class Video extends EventTarget {
    readyState = 4;
    videoWidth = 720;
    videoHeight = 480;
    currentTime = 0;
    paused = false;
    ended = false;
    seeking = false;
    playbackRate = 1;
    requestVideoFrameCallback(callback) {
      const id = next++;
      native.set(id, callback);
      return id;
    }
    cancelVideoFrameCallback(id) {
      native.delete(id);
    }
  }
  if (moz) {
    Object.assign(Video.prototype, {
      mozParsedFrames: 10,
      mozDecodedFrames: 5,
      mozPresentedFrames: 0,
      mozPaintedFrames: 0,
    });
  }
  t.mock.method(globalThis, "requestAnimationFrame", (callback) => {
    const id = next++;
    raf.set(id, callback);
    return id;
  });
  t.mock.method(globalThis, "cancelAnimationFrame", (id) => raf.delete(id));
  const previous = globalThis.HTMLVideoElement;
  globalThis.HTMLVideoElement = Video;
  const video = new Video();
  video.playbackRate = playbackRate;
  const frames = new VideoFrames(video, undefined, pictures?.(video));
  t.after(() => {
    frames.destroy();
    globalThis.HTMLVideoElement = previous;
  });
  const seen = [];
  const receive = (now, metadata) => {
    seen.push({ now, ...metadata });
    frames.request(receive);
  };
  frames.request(receive);
  const tick = (now) => {
    const callbacks = [...raf.values()];
    raf.clear();
    for (const callback of callbacks) callback(now);
  };
  const paint = (count, now) => {
    video.mozPaintedFrames = count;
    tick(now);
  };
  return { video, frames, seen, tick, paint, raf, native, supportsVideoFrames };
}

// Node has no animation frame globals for mock.method to replace.
globalThis.requestAnimationFrame = () => {};
globalThis.cancelAnimationFrame = () => {};

test("Firefox uses painted frames despite repeated 40 ms media-clock values", async (t) => {
  const f = await fixture(t);
  assert.equal(f.supportsVideoFrames(), true);
  assert.equal(
    f.native.size,
    0,
    "native rVFC must never be requested on Firefox",
  );
  for (let frame = 1; frame <= 61; frame++) {
    const at = ((frame - 1) * 1000) / 30;
    f.video.currentTime = Math.floor(at / 40) * 0.04;
    f.paint(frame, at);
    f.tick(at + 1000 / 60);
  }
  assert.equal(f.seen.length, 61);
  assert.ok(
    f.seen.some((frame, i) => i && frame.mediaTime === f.seen[i - 1].mediaTime),
  );
  assert.ok(Math.abs(f.seen.at(-1).mozTiming.periodMs - 1000 / 30) < 0.01);
  assert.equal(f.raf.size, 1);
});

test("read-ahead and delayed presentation accounting do not duplicate a painted frame", async (t) => {
  const f = await fixture(t);
  f.paint(1, 0);
  f.video.mozParsedFrames += 100;
  f.tick(16);
  f.video.mozDecodedFrames += 20;
  f.tick(33);
  f.video.mozPresentedFrames += 1;
  f.tick(50);
  assert.equal(f.seen.length, 1);
  f.paint(2, 66);
  assert.equal(f.seen.length, 2);
});

for (const initialRate of [1, 1.25]) {
  test(`Firefox preserves distinct pictures at accelerated rates starting at ${initialRate}x`, async (t) => {
    const previous = globalThis.VideoFrame;
    globalThis.VideoFrame = class {
      constructor(video) {
        this.timestamp = Math.floor(video.currentTime);
      }
      close() {}
    };
    t.after(() => {
      globalThis.VideoFrame = previous;
    });
    const f = await fixture(t, true, initialRate);
    let painted = 0;
    let now = 0;
    for (const rate of [initialRate, 1.25, 1.5, 1]) {
      f.video.playbackRate = rate;
      f.video.dispatchEvent(new Event("ratechange"));
      for (let frame = 0; frame < 12; frame++) {
        now += 1000 / (30 * rate);
        f.video.currentTime += 1 / 30;
        f.paint(++painted, now);
      }
      assert.equal(f.seen.length, painted);
      assert.equal(f.seen.at(-1).presentedFrames, painted);
      assert.equal(f.seen.at(-1).mediaTime, f.video.currentTime);
    }
  });
}

test("Firefox works without native rVFC and can initialize a paused unpainted image", async (t) => {
  const f = await fixture(t);
  delete Object.getPrototypeOf(f.video).requestVideoFrameCallback;
  delete Object.getPrototypeOf(f.video).cancelVideoFrameCallback;
  assert.equal(f.supportsVideoFrames(), true);
  f.tick(0);
  assert.equal(
    f.seen.length,
    0,
    "decode read-ahead must not start playback callbacks",
  );
  f.video.paused = true;
  f.tick(16);
  f.tick(33);
  assert.equal(f.seen.length, 1);
  assert.equal(f.seen[0].mozTiming.periodMs, 0);
  f.frames.destroy();
  assert.equal(f.raf.size, 0);
});

test("cadence averages refresh jitter and preserves gaps in painted counts", async (t) => {
  const f = await fixture(t);
  // 25 fps sampled at 60 Hz alternates two and three refreshes per picture.
  for (let frame = 1; frame <= 80; frame++) {
    if (frame === 20 || frame === 21) continue;
    const at = Math.ceil(((frame - 1) * 40) / (1000 / 60)) * (1000 / 60);
    f.paint(frame, at);
  }
  assert.equal(f.seen.length, 78);
  assert.equal(f.seen[19].presentedFrames - f.seen[18].presentedFrames, 3);
  assert.ok(Math.abs(f.seen.at(-1).mozTiming.periodMs - 40) < 1);
});

test("a paused seek inside one media-clock tick delivers the new still once", async (t) => {
  const f = await fixture(t);
  f.video.paused = true;
  f.paint(1, 0);
  f.video.seeking = true;
  f.video.dispatchEvent(new Event("seeking"));
  f.tick(16);
  assert.equal(f.seen.length, 1);
  f.video.seeking = false;
  f.video.dispatchEvent(new Event("seeked"));
  f.tick(33);
  f.tick(50);
  assert.equal(f.seen.length, 2);
  assert.equal(f.seen[1].mediaTime, f.seen[0].mediaTime);
  assert.equal(f.seen[1].mozTiming.discontinuity, true);
  assert.equal(f.seen[1].mozTiming.periodMs, 0);
});

test("pause/resume and playback-rate changes exclude idle time from cadence", async (t) => {
  const f = await fixture(t);
  for (let i = 1; i <= 12; i++) f.paint(i, (i * 1000) / 30);
  f.video.paused = true;
  f.video.dispatchEvent(new Event("pause"));
  f.tick(3000);
  assert.equal(f.seen.length, 12);
  f.video.paused = false;
  f.video.playbackRate = 2;
  f.video.dispatchEvent(new Event("ratechange"));
  f.video.dispatchEvent(new Event("playing"));
  for (let i = 13; i <= 50; i++) f.paint(i, 3000 + ((i - 13) * 1000) / 60);
  assert.ok(Math.abs(f.seen.at(-1).mozTiming.periodMs - 1000 / 60) < 0.01);
});

test("counter resets, stalls and source replacement break frame history", async (t) => {
  const f = await fixture(t);
  f.paint(10, 0);
  f.paint(11, 33);
  assert.equal(f.seen.at(-1).mozTiming.discontinuity, false);
  f.paint(1, 66);
  assert.equal(f.seen.at(-1).mozTiming.discontinuity, true);
  f.paint(2, 1000);
  assert.equal(f.seen.at(-1).mozTiming.discontinuity, true);
  f.video.dispatchEvent(new Event("emptied"));
  f.video.readyState = 0;
  f.paint(0, 1033);
  assert.equal(f.seen.length, 4);
  f.video.readyState = 4;
  f.paint(1, 1066);
  assert.equal(f.seen.at(-1).mozTiming.discontinuity, true);
});

test("cancelling a pending poll stops it, and restart accepts the current picture", async (t) => {
  const f = await fixture(t);
  f.tick(0);
  f.tick(16);
  f.frames.cancel();
  assert.equal(f.raf.size, 0);
  f.paint(1, 33);
  assert.equal(f.seen.length, 0);
  f.frames.request((now, metadata) => f.seen.push({ now, ...metadata }));
  f.tick(50);
  assert.equal(f.seen.length, 1);
  assert.equal(f.raf.size, 0, "a frame request fires only once");
});

test("other browsers retain native frame metadata and cancellation", async (t) => {
  const f = await fixture(t, false);
  assert.equal(f.supportsVideoFrames(), true);
  assert.equal(f.raf.size, 0);
  const [id, callback] = [...f.native][0];
  f.native.delete(id);
  callback(20, {
    width: 720,
    height: 480,
    mediaTime: 1 / 30,
    presentedFrames: 1,
    expectedDisplayTime: 25,
  });
  assert.equal(f.seen[0].mediaTime, 1 / 30);
  assert.equal(f.seen[0].expectedDisplayTime, 25);
  assert.equal(f.seen[0].mozTiming, undefined);
  f.frames.cancel();
  assert.equal(f.native.size, 0);
});

/**
 * Stands in for PictureWatch: `video.picture` is what the element shows, and
 * a take differs from the one before when that value does. As with the real
 * one, the newest take is not reported until another has followed it, and
 * `delay` holds every verdict back that many further takes.
 */
function watching(delay = 0) {
  const watch = {
    values: new Map(),
    held: [],
    reference: null,
    takes: 0,
    resets: 0,
    serving: true,
    full: false,
    delay,
  };
  const pictures = (video) => {
    Object.assign(watch, {
      take() {
        if (watch.full) return null;
        for (const take of watch.held) take.age++;
        const take = {
          id: ++watch.takes,
          changed:
            watch.reference === null ||
            watch.reference.picture !== video.picture,
          picture: video.picture,
          age: 0,
          reported: false,
        };
        watch.values.set(take.id, take.picture);
        watch.reference = take;
        watch.held.push(take);
        return take.id;
      },
      settle() {
        const take = watch.held.find((candidate) => !candidate.reported);
        if (!take || take === watch.reference || take.age <= watch.delay)
          return null;
        take.reported = true;
        return { id: take.id, changed: take.changed };
      },
      release(id) {
        watch.held = watch.held.filter((take) => take.id !== id);
      },
      reset() {
        watch.held = [];
        watch.reference = null;
        watch.resets++;
      },
    });
    return () => (watch.serving ? watch : null);
  };
  return { watch, pictures };
}

const REFRESH = 1000 / 60;

/**
 * Play `count` pictures of two refreshes each from refresh `from`, with the
 * painted count going up on the refreshes `paints` selects. Returns the next
 * refresh.
 */
function play(f, from, count, { paints, picture = (n) => n }) {
  for (let refresh = from; refresh < from + count * 2; refresh++) {
    f.video.picture = picture(Math.floor(refresh / 2));
    if (paints(refresh)) f.video.mozPaintedFrames++;
    f.tick(refresh * REFRESH);
  }
  return from + count * 2;
}

/** The compositor painting each picture one refresh after it appears. */
const steady = (refresh) => refresh % 2 === 1;

test("watched pictures arrive once each while the painted count runs out of step", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  // Paints three, one and two refreshes apart: the same number as there are
  // pictures, but on the wrong refreshes for two in every three.
  play(f, 0, 90, { paints: (refresh) => [1, 4, 5].includes(refresh % 6) });
  const shown = f.seen.map((frame) => watch.values.get(frame.picture));
  assert.deepEqual(
    shown,
    shown.map((_, index) => shown[0] + index),
    "every picture once, in order",
  );
  assert.ok(shown.length >= 88);
  for (const [index, frame] of f.seen.entries()) {
    assert.equal(frame.expectedDisplayTime, frame.now);
    if (index)
      assert.equal(
        frame.presentedFrames,
        f.seen[index - 1].presentedFrames + 1,
      );
  }
  assert.ok(Math.abs(f.seen.at(-1).mozTiming.periodMs - 1000 / 30) < 0.5);
  assert.equal(f.native.size, 0);
});

test("a watched picture is adoptable during its callback and released after it", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  const during = [];
  f.frames.cancel();
  const receive = (now, metadata) => {
    during.push(watch.held.some((take) => take.id === metadata.picture));
    f.frames.request(receive);
  };
  f.frames.request(receive);
  play(f, 0, 20, { paints: steady });
  assert.ok(during.length >= 18);
  assert.ok(during.every(Boolean));
  // Only the newest take, and the one before it awaiting its turn, remain.
  assert.ok(watch.held.length <= 2);
});

test("verdicts that come late still deliver every watched picture in order", async (t) => {
  const { watch, pictures } = watching(2);
  const f = await fixture(t, true, 1, pictures);
  play(f, 0, 60, { paints: steady });
  const shown = f.seen.map((frame) => watch.values.get(frame.picture));
  assert.deepEqual(
    shown,
    shown.map((_, index) => shown[0] + index),
  );
  assert.ok(shown.length >= 56);
});

test("a frame with the pixels of the one before it is counted, not delivered", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  // Picture 40 repeats 39.
  play(f, 0, 60, {
    paints: steady,
    picture: (n) => (n === 40 ? 39 : n),
  });
  const shown = f.seen.map((frame) => watch.values.get(frame.picture));
  assert.ok(!shown.includes(40));
  const after = shown.indexOf(41);
  assert.equal(shown[after - 1], 39);
  assert.equal(
    f.seen[after].presentedFrames - f.seen[after - 1].presentedFrames,
    2,
  );
  assert.equal(f.seen[after].mozTiming.discontinuity, false);
});

test("a still scene keeps frames coming during playback and a paused one stops the takes", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  let refresh = play(f, 0, 30, { paints: steady });
  const moving = f.seen.length;
  // Two seconds of one picture, still being painted.
  refresh = play(f, refresh, 60, { paints: steady, picture: () => 29 });
  const still = f.seen.slice(moving);
  assert.ok(still.length >= 8 && still.length <= 11, `${still.length} frames`);
  assert.ok(still.every((frame) => !frame.mozTiming.discontinuity));
  assert.ok(
    Math.abs(
      still.at(-1).presentedFrames - f.seen[moving - 1].presentedFrames - 60,
    ) <= 6,
  );
  f.video.paused = true;
  f.video.dispatchEvent(new Event("pause"));
  for (let i = 0; i < 10; i++) f.tick(refresh++ * REFRESH);
  const settled = watch.takes;
  const delivered = f.seen.length;
  for (let i = 0; i < 30; i++) f.tick(refresh++ * REFRESH);
  assert.equal(watch.takes, settled);
  assert.equal(f.seen.length, delivered);
  // Playback resumes against the picture it paused on.
  f.video.paused = false;
  f.video.dispatchEvent(new Event("playing"));
  play(f, refresh + (refresh % 2), 10, {
    paints: steady,
    picture: (n) => n + 1000,
  });
  assert.ok(f.seen.length >= delivered + 8);
  assert.equal(f.seen[delivered].mozTiming.discontinuity, false);
});

test("a paused seek delivers the watched still once, as a discontinuity", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  f.video.paused = true;
  f.video.picture = 1;
  f.paint(1, 0);
  for (let i = 1; i < 8; i++) f.tick(i * REFRESH);
  assert.equal(f.seen.length, 1);
  f.video.seeking = true;
  f.video.dispatchEvent(new Event("seeking"));
  f.tick(8 * REFRESH);
  f.video.picture = 2;
  f.video.seeking = false;
  f.video.dispatchEvent(new Event("seeked"));
  for (let i = 9; i < 20; i++) f.tick(i * REFRESH);
  assert.equal(f.seen.length, 2);
  assert.equal(watch.values.get(f.seen[1].picture), 2);
  assert.equal(f.seen[1].mozTiming.discontinuity, true);
  assert.ok(watch.resets >= 2);
});

test("watched takes do not survive a gap in polling", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  const refresh = play(f, 0, 20, { paints: steady });
  const resets = watch.resets;
  // A background tab: no refreshes for two seconds.
  const base = refresh + 120;
  play(f, base, 10, { paints: steady, picture: (n) => n + 500 });
  assert.equal(watch.resets, resets + 1);
  const first = f.seen.find((frame) => watch.values.get(frame.picture) >= 500);
  assert.equal(first.mozTiming.discontinuity, true);
});

test("a renderer that stops watching falls back to the painted count", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  let refresh = play(f, 0, 20, { paints: steady });
  const watched = f.seen.length;
  const resets = watch.resets;
  watch.serving = false;
  refresh = play(f, refresh, 10, { paints: steady });
  const counted = f.seen.slice(watched);
  assert.equal(watch.resets, resets + 1);
  // The picture in hand at the change, then one for each paint.
  assert.equal(counted.length, 11);
  assert.ok(counted.every((frame) => frame.picture === undefined));
  assert.equal(counted[0].mozTiming.discontinuity, true);
  assert.equal(counted.at(-1).presentedFrames, f.video.mozPaintedFrames);
  watch.serving = true;
  play(f, refresh, 10, { paints: steady });
  assert.ok(f.seen.length >= watched + 10 + 8);
  assert.notEqual(f.seen.at(-1).picture, undefined);
});

test("an ended video stops the watched takes", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  let refresh = play(f, 0, 20, { paints: steady });
  f.video.ended = true;
  for (let i = 0; i < 10; i++) f.tick(refresh++ * REFRESH);
  const takes = watch.takes;
  for (let i = 0; i < 30; i++) f.tick(refresh++ * REFRESH);
  assert.equal(watch.takes, takes);
});

test("unchanged verdicts from playback do not settle a pause early", async (t) => {
  const { watch, pictures } = watching(4);
  const f = await fixture(t, true, 1, pictures);
  // Verdicts run four takes late, so several unchanged ones are in hand when
  // the element pauses on a picture that has not been delivered yet.
  let refresh = play(f, 0, 20, {
    paints: steady,
    picture: (n) => (n < 17 ? n : 17),
  });
  f.video.picture = 18;
  f.tick(refresh++ * REFRESH);
  f.video.paused = true;
  f.video.dispatchEvent(new Event("pause"));
  for (let i = 0; i < 20; i++) f.tick(refresh++ * REFRESH);
  assert.equal(watch.values.get(f.seen.at(-1).picture), 18);
});

test("resuming into a still scene keeps frames coming", async (t) => {
  const { pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  let refresh = play(f, 0, 30, { paints: steady });
  f.video.paused = true;
  f.video.dispatchEvent(new Event("pause"));
  for (let i = 0; i < 12; i++) f.tick(refresh++ * REFRESH);
  f.video.paused = false;
  f.video.dispatchEvent(new Event("playing"));
  const before = f.seen.length;
  // A second of the paused picture, painted as playback goes on.
  play(f, refresh + (refresh % 2), 30, { paints: steady, picture: () => 29 });
  const frames = f.seen.length - before;
  // One for each 0.2 s of the second, counted from the resume.
  assert.ok(frames >= 3 && frames <= 5, `${frames} frames`);
});

test("the still refresh follows the playback rate", async (t) => {
  const { pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  const refresh = play(f, 0, 30, { paints: steady });
  f.video.playbackRate = 3;
  f.video.dispatchEvent(new Event("ratechange"));
  const before = f.seen.length;
  play(f, refresh, 30, { paints: steady, picture: () => 29 });
  // A second of wall time is three of media time: at least one frame for
  // each 0.2 s of it, less the refreshes spent waiting for verdicts.
  assert.ok(f.seen.length - before >= 10, `${f.seen.length - before} frames`);
});

test("verdicts arriving together deliver the newest picture and catch up", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  // A new picture on every refresh, as at double speed.
  let refresh = 0;
  const run = (count) => {
    for (let i = 0; i < count; i++, refresh++) {
      f.video.picture = refresh;
      f.video.mozPaintedFrames++;
      f.tick(refresh * REFRESH);
    }
  };
  run(20);
  // The GPU falls three refreshes behind for a while, then recovers.
  watch.delay = 3;
  run(10);
  watch.delay = 0;
  run(20);
  const shown = f.seen.map((frame) => watch.values.get(frame.picture));
  assert.ok(
    shown.every((picture, index) => !index || picture > shown[index - 1]),
  );
  // Back to the one refresh a verdict takes, not three behind for good.
  assert.equal(shown.at(-1), refresh - 2);
  assert.ok(watch.held.length <= 2);
});

test("a watched frame carries the size and media time of its take", async (t) => {
  const { pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  f.video.picture = 1;
  f.video.currentTime = 10;
  f.paint(1, 0);
  // By the refresh that delivers it the element has moved on.
  f.video.picture = 2;
  f.video.currentTime = 11;
  f.video.videoWidth = 1440;
  f.tick(REFRESH);
  assert.equal(f.seen.length, 1);
  assert.equal(f.seen[0].mediaTime, 10);
  assert.equal(f.seen[0].width, 720);
  assert.equal(f.seen[0].now, REFRESH);
});

test("cancelling inside a watched callback leaves nothing held", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  f.frames.cancel();
  let calls = 0;
  f.frames.request(() => {
    calls++;
    f.frames.cancel();
  });
  play(f, 0, 10, { paints: steady });
  assert.equal(calls, 1);
  assert.equal(watch.held.length, 0);
  assert.equal(f.raf.size, 0);
});

test("a watch with no room skips the refresh and a counter reset starts over", async (t) => {
  const { watch, pictures } = watching();
  const f = await fixture(t, true, 1, pictures);
  let refresh = play(f, 0, 10, { paints: steady });
  watch.full = true;
  const before = f.seen.length;
  refresh = play(f, refresh, 4, { paints: steady });
  // The take already in hand still comes through; nothing new is taken.
  assert.ok(f.seen.length - before <= 1);
  watch.full = false;
  refresh = play(f, refresh, 10, { paints: steady });
  assert.ok(f.seen.length - before >= 9);
  // A new source starts its counts again.
  const resets = watch.resets;
  f.video.mozPaintedFrames = 0;
  f.video.mozParsedFrames = 0;
  f.video.mozDecodedFrames = 0;
  f.video.mozPresentedFrames = 0;
  const count = f.seen.length;
  play(f, refresh, 10, { paints: steady, picture: (n) => n + 900 });
  assert.ok(watch.resets > resets);
  assert.equal(f.seen[count].mozTiming.discontinuity, true);
});
