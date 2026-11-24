/**
 * The page side of the two video modes, without a browser: when the player
 * decodes the pictures itself or passes the video through, when a load fails
 * instead, how it asks for pictures and runs their epochs, and what becomes of
 * a stream without AAC sound.
 */
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const output = join(tmpdir(), `mpeg2toh264-player-test-${process.pid}.mjs`);

class FakeWorker {
  static last = null;
  static created = 0;
  posted = [];
  onmessage = null;
  onerror = null;

  constructor() {
    FakeWorker.last = this;
    FakeWorker.created++;
  }

  postMessage(message, transfer = []) {
    this.posted.push({ message, transfer });
  }

  terminate() {}

  /** Deliver a notification from the worker. */
  send(notification) {
    this.onmessage({ data: notification });
  }

  take(type) {
    const taken = this.posted
      .filter(({ message }) => message.type === type)
      .map(({ message, transfer }) => ({ ...message, transfer }));
    this.posted = this.posted.filter(({ message }) => message.type !== type);
    return taken;
  }
}

class FakeMediaSource extends EventTarget {
  static canConstructInDedicatedWorker = true;
  static isTypeSupported() {
    return true;
  }
}

class FakeVideo extends EventTarget {
  currentTime = 0;
  playbackRate = 1;
  paused = true;
  seeking = false;
  videoWidth = 0;
  videoHeight = 0;
  srcObject = null;
  disableRemotePlayback = false;
  buffered = { length: 0, start: () => 0, end: () => 0 };
  removeAttribute() {}
  load() {}
}

/** A deinterlacer with a `decodedVideo` input that records what it gets. */
function fakeDeinterlacer(withDecodedVideo) {
  const calls = [];
  const deinterlacer = {
    calls,
    running: false,
    scan: null,
    enabled: false,
    videoTimeline: [],
    decodedVideo: withDecodedVideo
      ? {
          onrelease: null,
          push: (picture) => calls.push(["push", picture.timestamp]),
          reset: () => calls.push("reset"),
          finish: () => calls.push("finish"),
        }
      : null,
    destroy: () => calls.push("destroy"),
  };
  return deinterlacer;
}

function picture(timestamp, data = new ArrayBuffer(16)) {
  return {
    timestamp,
    duration: 0.04,
    width: 4,
    height: 2,
    displayWidth: 6,
    displayHeight: 2,
    data,
    planes: [
      { offset: 0, stride: 4 },
      { offset: 8, stride: 2 },
      { offset: 10, stride: 2 },
    ],
    interlaced: true,
    topFieldFirst: true,
    repeatFirstField: false,
    matrix: "bt709",
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A port that records what it is sent. */
class FakePort {
  posted = [];
  onmessage = null;
  postMessage(message) {
    this.posted.push(message);
  }
  close() {}
  /** The commands of `type` sent since the last look, taken. */
  take(type) {
    const taken = this.posted.filter((message) => message.type === type);
    this.posted = this.posted.filter((message) => message.type !== type);
    return taken;
  }
}

class FakeAudioContext {
  static last = null;
  state = "running";
  currentTime = 0;
  outputLatency = 0;
  destination = {};
  audioWorklet = { addModule: async () => {} };
  /** Whether `resume` lets the context run, as a page with a gesture would. */
  static allowed = true;
  constructor(options) {
    this.sampleRate = options?.sampleRate ?? 44100;
    FakeAudioContext.last = this;
  }
  async resume() {
    if (FakeAudioContext.allowed) this.state = "running";
  }
  async close() {
    this.state = "closed";
  }
}

class FakeAudioWorkletNode {
  static last = null;
  port = new FakePort();
  constructor(context, name, options) {
    this.name = name;
    this.options = options;
    FakeAudioWorkletNode.last = this;
  }
  connect() {}
  disconnect() {}
  /** Deliver a report of the processor. */
  report(position) {
    this.port.onmessage({
      data: {
        type: "position",
        frame: 0,
        speed: 0,
        queuedUntil: 0,
        ...position,
      },
    });
  }
}

globalThis.Worker = FakeWorker;
globalThis.MediaSource = FakeMediaSource;
globalThis.AudioContext = FakeAudioContext;
globalThis.AudioWorkletNode = FakeAudioWorkletNode;
globalThis.requestAnimationFrame = (callback) =>
  setTimeout(() => callback(performance.now()), 16);
globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);

try {
  await build({
    entryPoints: ["packages/player/src/player.ts"],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "neutral",
    plugins: [
      {
        name: "worker-url",
        setup(build) {
          build.onResolve({ filter: /\?worker&url$/ }, () => ({
            path: "worker-url",
            namespace: "stub",
          }));
          build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: 'export default "worker.js";',
          }));
        },
      },
    ],
  });
  const { Mpeg2TsPlayer } = await import(pathToFileURL(output));

  // Which load decodes, which passes the video through and which fails: a
  // deinterlacer with a `decodedVideo` decodes unless the option says
  // otherwise, passthrough is only what is left when it cannot, and with that
  // off as well the load fails before the worker is asked for anything.
  const DEINTERLACER_MISSING = /no deinterlacer with a decodedVideo input/;
  for (const [withDecodedVideo, softwareDecode, passthrough, expected] of [
    [true, undefined, false, "decode"],
    [true, true, true, "decode"],
    [true, false, false, /softwareDecode is false, and passthrough is off/],
    [true, false, true, "passthrough"],
    [false, undefined, false, DEINTERLACER_MISSING],
    [false, true, true, "passthrough"],
    [false, undefined, undefined, DEINTERLACER_MISSING],
  ]) {
    const video = new FakeVideo();
    const player = new Mpeg2TsPlayer(video, {
      mediaSource: "worker",
      softwareDecode,
      passthrough,
      deinterlacer: () => fakeDeinterlacer(withDecodedVideo),
    });
    const errors = [];
    player.addEventListener("error", (event) =>
      errors.push(event.detail.error),
    );
    const name = `${withDecodedVideo} ${softwareDecode} ${passthrough}`;
    const created = FakeWorker.created;
    const loading = player.load("https://example.invalid/a.ts");
    loading.catch(() => {});
    const worker = FakeWorker.last;
    if (typeof expected === "string") {
      const [load] = worker.take("load");
      assert.equal(load.video, expected, name);
      assert.equal(player.softwareDecoding, expected === "decode", name);
      assert.equal(errors.length, 0, name);
    } else {
      // Raised after `load` has returned, as a failure in the worker is.
      assert.equal(errors.length, 0, name);
      await assert.rejects(loading, { message: expected }, name);
      assert.equal(errors.length, 1, name);
      assert.match(errors[0].message, expected, name);
      assert.equal(player.state, "error", name);
      assert.equal(player.softwareDecoding, false, name);
      assert.equal(FakeWorker.created, created, `${name}: no worker started`);
      // The player takes the next load, which fails on its own account.
      await assert.rejects(player.load("https://example.invalid/b.ts"));
      assert.equal(errors.length, 2, name);
      assert.equal(player.state, "error", name);
    }
    player.destroy();
  }
  // No deinterlacer at all.
  for (const [passthrough, expected] of [
    [true, "passthrough"],
    [false, null],
  ]) {
    const player = new Mpeg2TsPlayer(new FakeVideo(), {
      mediaSource: "worker",
      passthrough,
    });
    const loading = player.load("https://example.invalid/a.ts");
    loading.catch(() => {});
    if (expected === null) {
      await assert.rejects(loading, /passthrough is off/);
    } else {
      assert.equal(FakeWorker.last.take("load")[0].video, expected);
    }
    player.destroy();
  }

  // The options go to the worker as they are, whatever the mode.
  {
    const player = new Mpeg2TsPlayer(new FakeVideo(), {
      mediaSource: "worker",
      passthrough: true,
      recoveryInterval: 12,
      openGopRecovery: "discard",
      splitFieldSamples: false,
      audioGainSteps: 3,
      serviceId: 0x400,
    });
    void player.load("https://example.invalid/a.ts").catch(() => {});
    const [load] = FakeWorker.last.take("load");
    assert.equal(load.recoveryInterval, 12);
    assert.equal(load.openGopRecovery, "discard");
    assert.equal(load.splitFieldSamples, false);
    assert.equal(load.audioGainSteps, 3);
    assert.equal(load.surroundAudioGainSteps, 3, "follows audioGainSteps");
    assert.equal(load.serviceId, 0x400);
    player.destroy();
  }

  // Decode mode on the page: the element's media interface is the player's,
  // the sound goes through the AudioWorklet, and playback starts only once
  // both the sound and the first picture of the epoch are in.
  {
    const video = new FakeVideo();
    let deinterlacer = null;
    const player = new Mpeg2TsPlayer(video, {
      mediaSource: "worker",
      deinterlacer: () => (deinterlacer = fakeDeinterlacer(true)),
    });
    const events = [];
    for (const type of [
      "play",
      "pause",
      "playing",
      "waiting",
      "seeking",
      "seeked",
      "ended",
      "canplay",
      "loadeddata",
      "volumechange",
      "ratechange",
      "durationchange",
    ])
      video.addEventListener(type, () => events.push(type));
    const takeEvents = async () => {
      await wait(0);
      return events.splice(0);
    };
    const loaded = player.load("https://example.invalid/b.ts");
    const worker = FakeWorker.last;
    const [load] = worker.take("load");
    const id = load.id;
    assert.equal(load.video, "decode");
    const decodedVideo = deinterlacer.decodedVideo;
    assert.equal(typeof decodedVideo.onrelease, "function");
    const context = FakeAudioContext.last;
    assert.equal(context.sampleRate, 48000);

    // The worker gets the worklet's port and the epoch to feed it.
    const [soundPort] = worker.take("sound-port");
    assert.equal(soundPort.at, 0);
    assert.deepEqual(soundPort.transfer, [soundPort.port]);
    let needs = worker.take("need");
    assert.equal(needs.length, 1);
    const epoch = needs[0].epoch;
    assert.equal(soundPort.epoch, epoch);
    assert.deepEqual([needs[0].from, needs[0].until], [0, 0.3]);

    // The processor gets its port and the commands given before it existed.
    await wait(0);
    const node = FakeAudioWorkletNode.last;
    assert.equal(node.name, "mpeg2toh264-sound");
    assert.deepEqual(node.options.outputChannelCount, [2]);
    assert.deepEqual(
      node.port.posted.map((message) => message.type),
      ["pcm-port", "rate", "volume", "pause", "epoch"],
    );
    assert.deepEqual(node.port.take("epoch")[0], {
      type: "epoch",
      epoch,
      at: 0,
    });
    node.port.posted = [];

    // The deinterlacer shows decoded pictures whether it filters them or
    // not, so its `running` alone does not say they are being deinterlaced.
    {
      const { running, enabled, scan } = deinterlacer;
      deinterlacer.running = true;
      deinterlacer.enabled = true;
      deinterlacer.scan = { interlaced: false, topFieldFirst: true };
      assert.equal(player.deinterlace, false);
      deinterlacer.scan = { interlaced: true, topFieldFirst: true };
      assert.equal(player.deinterlace, true);
      deinterlacer.enabled = false;
      assert.equal(player.deinterlace, false);
      Object.assign(deinterlacer, { running, enabled, scan });
    }

    // The element is the player's now.
    assert.equal(video.paused, true);
    assert.equal(video.readyState, 0);
    assert.equal(video.currentTime, 0);
    assert.ok(Number.isNaN(video.duration));
    assert.equal(video.buffered.length, 0);

    // A picture of the epoch: shown, and the element has data -- once it
    // knows its duration, as an element does by the time it has metadata.
    assert.equal(player.videoSize, null);
    worker.send({ type: "picture", id, epoch, picture: picture(0) });
    assert.deepEqual(deinterlacer.calls.at(-1), ["push", 0]);
    assert.deepEqual(player.videoSize, { width: 6, height: 2 });
    assert.equal(video.readyState, 0, "no duration yet");
    worker.send({ type: "seekable", id, duration: 600 });
    assert.equal(video.readyState, 2);
    assert.deepEqual(await takeEvents(), ["durationchange", "loadeddata"]);

    // The sound buffered as well: ready to play, but nobody asked.
    node.report({ epoch, state: "ready", media: 0 });
    assert.equal(video.readyState, 4);
    assert.deepEqual(await takeEvents(), ["canplay"]);
    assert.equal(node.port.take("play").length, 0, "paused");

    // play(): the context runs and the worklet is told; `playing` comes with
    // the worklet saying it plays.
    await video.play();
    assert.equal(video.paused, false);
    assert.equal(node.port.take("play").length, 1);
    assert.deepEqual(await takeEvents(), ["play"]);
    node.report({ epoch, state: "playing", media: 0, speed: 1 });
    assert.deepEqual(await takeEvents(), ["playing"]);

    // Requests follow the element's speed.
    video.playbackRate = 2;
    assert.deepEqual(node.port.take("rate"), [{ type: "rate", rate: 2 }]);
    needs = worker.take("need");
    assert.ok(needs.length >= 1);
    assert.ok(needs.at(-1).until - needs.at(-1).from > 0.59);
    assert.deepEqual(await takeEvents(), ["ratechange"]);
    assert.throws(() => (video.playbackRate = 8), {
      name: "NotSupportedError",
    });
    assert.equal(video.playbackRate, 2);

    // Volume and mute are the worklet's gain.
    video.volume = 0.5;
    video.muted = true;
    assert.deepEqual(
      node.port.take("volume").map((message) => message.gain),
      [0.5, 0],
    );
    assert.throws(() => (video.volume = 2), { name: "IndexSizeError" });
    assert.deepEqual(await takeEvents(), ["volumechange", "volumechange"]);
    video.muted = false;
    assert.deepEqual(node.port.take("volume"), [{ type: "volume", gain: 0.5 }]);
    await takeEvents();

    // Running out: `waiting`, and the position stands where the sound stopped.
    node.report({ epoch, state: "starved", media: 1.25 });
    assert.equal(video.currentTime, 1.25);
    assert.equal(video.readyState, 2);
    assert.deepEqual(await takeEvents(), ["waiting"]);
    node.report({ epoch, state: "playing", media: 1.25, speed: 2 });
    assert.deepEqual(await takeEvents(), ["canplay", "playing"]);

    // Pausing tells the worklet; its report places the position exactly.
    video.pause();
    assert.equal(node.port.take("pause").length, 1);
    node.report({ epoch, state: "paused", media: 1.5 });
    assert.equal(video.currentTime, 1.5);
    assert.deepEqual(await takeEvents(), ["pause"]);

    // What the worker holds and how long the input is.
    worker.send({ type: "buffered", id, range: { start: 0, end: 9 } });
    assert.deepEqual([video.buffered.start(0), video.buffered.end(0)], [0, 9]);
    assert.equal(video.duration, 600);
    assert.deepEqual(
      [video.seekable.start(0), video.seekable.end(0)],
      [0, 600],
    );

    // A seek: a new epoch for the pictures and the sound, held again, and
    // the worker told where and under which epoch.
    const before = deinterlacer.calls.length;
    worker.take("need");
    video.currentTime = 10;
    assert.equal(video.seeking, true);
    assert.equal(video.currentTime, 10);
    assert.equal(deinterlacer.calls[before], "reset");
    needs = worker.take("need");
    assert.equal(needs[0].epoch, epoch + 1);
    assert.equal(needs[0].from, 10);
    assert.deepEqual(worker.take("seek"), [
      { type: "seek", id, time: 10, epoch: epoch + 1, transfer: [] },
    ]);
    assert.deepEqual(
      node.port.posted.splice(0).map((message) => message.type),
      ["pause", "epoch"],
    );
    assert.deepEqual(await takeEvents(), ["seeking"]);
    assert.equal(video.readyState, 1);

    // A picture of the old epoch goes back without being shown.
    const stale = new ArrayBuffer(16);
    worker.send({ type: "picture", id, epoch, picture: picture(2.04, stale) });
    assert.equal(deinterlacer.calls.at(-1), "reset", "not pushed");
    let recycled = worker.take("recycle");
    assert.deepEqual(
      recycled.map((message) => message.data),
      [stale],
    );
    // So does a report of the old epoch.
    node.report({ epoch, state: "ready", media: 2 });

    // The seek completes once both are in: a picture ending past the target,
    // and the sound.
    worker.send({
      type: "picture",
      id,
      epoch: epoch + 1,
      picture: picture(9.98),
    });
    assert.equal(video.seeking, true, "the sound is not in yet");
    node.report({ epoch: epoch + 1, state: "ready", media: 10 });
    assert.equal(video.seeking, false);
    assert.deepEqual(await takeEvents(), ["seeked", "canplay"]);
    assert.equal(node.port.take("play").length, 0, "still paused");

    // Released buffers go back; detached ones are not sent.
    const released = new ArrayBuffer(16);
    decodedVideo.onrelease(released);
    const detached = new ArrayBuffer(16);
    structuredClone(detached, { transfer: [detached] });
    decodedVideo.onrelease(detached);
    recycled = worker.take("recycle");
    assert.deepEqual(
      recycled.map((message) => message.data),
      [released],
    );

    // The end of the pictures, for the epoch it was said for.
    worker.send({ type: "pictures-end", id, epoch });
    assert.notEqual(deinterlacer.calls.at(-1), "finish", "an old epoch");
    worker.send({ type: "pictures-end", id, epoch: epoch + 1 });
    assert.equal(deinterlacer.calls.at(-1), "finish");

    // The worker saying the media begins later moves the position, and is
    // no seek.
    worker.send({ type: "seek", id, time: 10.5 });
    assert.equal(video.currentTime, 10.5);
    assert.equal(
      worker.take("need").filter((n) => n.epoch !== epoch + 1).length,
      0,
    );
    worker.send({ type: "seek", id, time: 10.2 });
    assert.equal(video.currentTime, 10.5, "never backwards");

    // The end of the media: paused, `pause` then `ended`; play() starts over.
    await video.play();
    node.report({ epoch: epoch + 1, state: "playing", media: 10.5, speed: 1 });
    await takeEvents();
    node.report({ epoch: epoch + 1, state: "ended", media: 600 });
    assert.equal(video.ended, true);
    assert.equal(video.paused, true);
    assert.deepEqual(await takeEvents(), ["pause", "ended"]);
    worker.take("seek");
    await video.play();
    assert.deepEqual(worker.take("seek")[0].time, 0);
    assert.equal(video.ended, false);
    assert.deepEqual(await takeEvents(), ["seeking", "play", "waiting"]);

    // A browser that will not let sound start refuses play().
    video.pause();
    FakeAudioContext.allowed = false;
    context.state = "suspended";
    await assert.rejects(video.play(), { name: "NotAllowedError" });
    assert.equal(video.paused, true);
    FakeAudioContext.allowed = true;

    // A live input has no end.
    worker.send({ type: "progress", id, bytesRead: 1, totalBytes: null });
    assert.equal(video.duration, Number.POSITIVE_INFINITY);

    worker.send({ type: "opened", id });
    await loaded;

    // Stopping resets the pictures, the requests stop, and the element is
    // its own again with the volume and speed it was left at.
    const stopping = deinterlacer.calls.length;
    player.stop();
    assert.ok(deinterlacer.calls.slice(stopping).includes("reset"));
    assert.equal(context.state, "closed");
    assert.equal(Object.getOwnPropertyDescriptor(video, "paused"), undefined);
    assert.equal(video.playbackRate, 2);
    assert.equal(video.volume, 0.5);
    worker.take("need");
    await wait(100);
    assert.equal(worker.take("need").length, 0, "no requests once stopped");
    player.destroy();
  }

  // A stream without AAC sound is loaded again with the video passed through,
  // once, and the load's promise follows the new one.
  {
    const video = new FakeVideo();
    let deinterlacer = null;
    const player = new Mpeg2TsPlayer(video, {
      mediaSource: "worker",
      passthrough: true,
      deinterlacer: () => (deinterlacer = fakeDeinterlacer(true)),
    });
    const states = [];
    player.addEventListener("statechange", (event) =>
      states.push(event.detail.state),
    );
    const errors = [];
    player.addEventListener("error", (event) =>
      errors.push(event.detail.error),
    );
    let settled = false;
    const loaded = player.load("https://example.invalid/c.ts").then(() => {
      settled = true;
    });
    const worker = FakeWorker.last;
    const [first] = worker.take("load");
    assert.equal(first.video, "decode");
    worker.send({ type: "no-aac-audio", id: first.id });
    const stops = worker.take("stop");
    assert.deepEqual(
      stops.map((stop) => stop.id),
      [first.id],
    );
    const [second] = worker.take("load");
    assert.equal(second.video, "passthrough");
    assert.equal(second.url, first.url);
    assert.ok(second.id > first.id);
    assert.equal(player.softwareDecoding, false);
    worker.take("need");
    await wait(60);
    assert.equal(worker.take("need").length, 0, "no requests when passing");
    assert.equal(settled, false);
    worker.send({ type: "opened", id: second.id });
    await loaded;
    assert.equal(settled, true);
    assert.equal(errors.length, 0);
    assert.equal(states.at(-1), "converting");
    // A passing load is not told about decoding.
    worker.send({ type: "no-aac-audio", id: second.id });
    assert.equal(errors.length, 1);
    assert.equal(player.state, "error");
    player.destroy();
  }

  // Without passthrough the same stream fails the load, and the player is
  // left able to load another one that decodes.
  {
    const player = new Mpeg2TsPlayer(new FakeVideo(), {
      mediaSource: "worker",
      deinterlacer: () => fakeDeinterlacer(true),
    });
    const errors = [];
    player.addEventListener("error", (event) =>
      errors.push(event.detail.error),
    );
    const loaded = player.load("https://example.invalid/c.ts");
    const rejection = assert.rejects(
      loaded,
      /no AAC sound.*passthrough is off/,
    );
    const worker = FakeWorker.last;
    const [first] = worker.take("load");
    worker.send({ type: "no-aac-audio", id: first.id });
    await rejection;
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /no AAC sound.*passthrough is off/);
    assert.equal(player.state, "error");
    assert.equal(player.softwareDecoding, false);
    assert.equal(worker.take("load").length, 0, "no second load");
    worker.take("need");
    await wait(60);
    assert.equal(worker.take("need").length, 0, "no requests once failed");

    const again = player.load("https://example.invalid/d.ts");
    const [second] = worker.take("load");
    assert.equal(second.video, "decode");
    assert.equal(player.softwareDecoding, true);
    assert.equal(worker.take("need").length, 1);
    worker.send({ type: "opened", id: second.id });
    await again;
    assert.equal(player.state, "converting");
    assert.equal(errors.length, 1);
    player.destroy();
  }

  // A deinterlacer that has been handed pictures shows nothing else, so a
  // later load that passes the video through gets a new one; one that
  // decodes keeps it.
  {
    const made = [];
    const player = new Mpeg2TsPlayer(new FakeVideo(), {
      mediaSource: "worker",
      passthrough: true,
      deinterlacer: () => {
        made.push(fakeDeinterlacer(true));
        return made.at(-1);
      },
    });
    void player.load("https://example.invalid/d.ts").catch(() => {});
    const worker = FakeWorker.last;
    const [first] = worker.take("load");
    const [need] = worker.take("need");
    worker.send({
      type: "picture",
      id: first.id,
      epoch: need.epoch,
      picture: picture(0),
    });
    void player.load("https://example.invalid/e.ts").catch(() => {});
    const [second] = worker.take("load");
    assert.equal(second.video, "decode");
    assert.equal(made.length, 1, "a decoding load keeps the deinterlacer");
    worker.send({ type: "no-aac-audio", id: second.id });
    const [third] = worker.take("load");
    assert.equal(third.video, "passthrough");
    assert.equal(made.length, 2, "a passing load gets a new one");
    assert.ok(made[0].calls.includes("destroy"));
    assert.ok(!made[1].calls.includes("destroy"));
    // Nothing was handed to the new one, so it stays for the load after.
    void player.load("https://example.invalid/f.ts").catch(() => {});
    assert.equal(made.length, 2);
    player.destroy();
  }

  console.log("player decode-mode tests passed");
} finally {
  await unlink(output).catch(() => {});
}
