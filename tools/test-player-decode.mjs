/**
 * The page side of decode mode, without a browser: when the player decodes
 * the pictures itself, how it asks for them and runs their epochs, and how a
 * stream without AAC sound is loaded again converted.
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
  posted = [];
  onmessage = null;
  onerror = null;

  constructor() {
    FakeWorker.last = this;
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
    encodedVideo: {
      append: () => calls.push("append"),
      reset: () => calls.push("encoded-reset"),
      finish: () => calls.push("encoded-finish"),
    },
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

globalThis.Worker = FakeWorker;
globalThis.MediaSource = FakeMediaSource;

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

  // Which load decodes: a deinterlacer with a `decodedVideo`, unless the
  // option says otherwise.
  for (const [withDecodedVideo, softwareDecode, passthrough, expected] of [
    [true, undefined, false, "decode"],
    [true, true, true, "decode"],
    [true, false, false, "transcode"],
    [true, false, true, "passthrough"],
    [false, undefined, false, "transcode"],
    [false, true, true, "passthrough"],
  ]) {
    const video = new FakeVideo();
    const player = new Mpeg2TsPlayer(video, {
      mediaSource: "worker",
      softwareDecode,
      passthrough,
      deinterlacer: () => fakeDeinterlacer(withDecodedVideo),
    });
    void player.load("https://example.invalid/a.ts").catch(() => {});
    const [load] = FakeWorker.last.take("load");
    assert.equal(load.video, expected, `${withDecodedVideo} ${softwareDecode}`);
    assert.equal(load.encodedVideo, expected !== "decode");
    assert.equal(player.softwareDecoding, expected === "decode");
    player.destroy();
  }
  // No deinterlacer at all.
  {
    const player = new Mpeg2TsPlayer(new FakeVideo(), {
      mediaSource: "worker",
    });
    void player.load("https://example.invalid/a.ts").catch(() => {});
    assert.equal(FakeWorker.last.take("load")[0].video, "transcode");
    player.destroy();
  }

  // Decode mode on the page.
  {
    const video = new FakeVideo();
    let deinterlacer = null;
    const player = new Mpeg2TsPlayer(video, {
      mediaSource: "worker",
      deinterlacer: () => (deinterlacer = fakeDeinterlacer(true)),
    });
    const loaded = player.load("https://example.invalid/b.ts");
    const worker = FakeWorker.last;
    const [load] = worker.take("load");
    const id = load.id;
    const decodedVideo = deinterlacer.decodedVideo;
    assert.equal(typeof decodedVideo.onrelease, "function");

    // A request at once, then every 40 ms, from the playhead.
    let needs = worker.take("need");
    assert.equal(needs.length, 1);
    const epoch = needs[0].epoch;
    assert.deepEqual(
      [needs[0].from, needs[0].until],
      [0, 0.3],
      "0.3 s ahead at normal speed",
    );
    video.currentTime = 2;
    video.playbackRate = 2;
    await wait(130);
    needs = worker.take("need");
    assert.ok(needs.length >= 2, `${needs.length} requests in 130 ms`);
    assert.ok(needs.every((need) => need.epoch === epoch && need.id === id));
    assert.deepEqual([needs.at(-1).from, needs.at(-1).until], [2, 2.6]);
    for (const type of ["play", "seeked", "ratechange"]) {
      video.dispatchEvent(new Event(type));
      assert.equal(worker.take("need").length, 1, type);
    }

    // Pictures of the epoch are shown; the size is the picture's.
    assert.equal(player.videoSize, null);
    worker.send({ type: "picture", id, epoch, picture: picture(2) });
    assert.deepEqual(deinterlacer.calls.at(-1), ["push", 2]);
    assert.deepEqual(player.videoSize, { width: 6, height: 2 });

    // A seek starts a new epoch before anything else goes to the worker.
    const before = deinterlacer.calls.length;
    video.dispatchEvent(new Event("seeking"));
    assert.equal(deinterlacer.calls[before], "reset");
    needs = worker.take("need");
    assert.equal(needs.length, 1);
    assert.equal(needs[0].epoch, epoch + 1);

    // A picture of the old epoch goes back without being shown.
    const stale = new ArrayBuffer(16);
    worker.send({ type: "picture", id, epoch, picture: picture(2.04, stale) });
    assert.deepEqual(deinterlacer.calls.at(-1), "reset", "not pushed");
    let recycled = worker.take("recycle");
    assert.equal(recycled.length, 1);
    assert.equal(recycled[0].data, stale);
    assert.deepEqual(recycled[0].transfer, [stale]);

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

    // The worker throwing its pictures away starts another epoch.
    worker.send({ type: "reset", id });
    assert.equal(deinterlacer.calls.at(-1), "reset");
    needs = worker.take("need");
    assert.equal(needs[0].epoch, epoch + 2);

    // The end of the pictures, for the epoch it was said for.
    worker.send({ type: "pictures-end", id, epoch: epoch + 1 });
    assert.notEqual(deinterlacer.calls.at(-1), "finish", "an old epoch");
    worker.send({ type: "pictures-end", id, epoch: epoch + 2 });
    assert.equal(deinterlacer.calls.at(-1), "finish");

    // Nothing goes to the compressed-video input in this mode.
    worker.send({
      type: "video-data",
      id,
      data: null,
    });
    assert.ok(!deinterlacer.calls.includes("append"));

    worker.send({ type: "opened", id });
    await loaded;

    // Stopping resets the pictures and the requests stop.
    const stopping = deinterlacer.calls.length;
    player.stop();
    assert.ok(deinterlacer.calls.slice(stopping).includes("reset"));
    worker.take("need");
    await wait(100);
    assert.equal(worker.take("need").length, 0, "no requests once stopped");
    player.destroy();
  }

  // A stream without AAC sound is loaded again converted, once, and the
  // load's promise follows the new one.
  {
    const video = new FakeVideo();
    let deinterlacer = null;
    const player = new Mpeg2TsPlayer(video, {
      mediaSource: "worker",
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
    assert.equal(second.video, "transcode");
    assert.equal(second.url, first.url);
    assert.equal(second.encodedVideo, true, "the deinterlacer's own input");
    assert.ok(second.id > first.id);
    assert.equal(player.softwareDecoding, false);
    worker.take("need");
    await wait(60);
    assert.equal(worker.take("need").length, 0, "no requests when converting");
    assert.equal(settled, false);
    worker.send({ type: "opened", id: second.id });
    await loaded;
    assert.equal(settled, true);
    assert.equal(errors.length, 0);
    assert.equal(states.at(-1), "converting");
    // A converting load is not told about decoding.
    worker.send({ type: "no-aac-audio", id: second.id });
    assert.equal(errors.length, 1);
    assert.equal(player.state, "error");
    player.destroy();
  }

  // A deinterlacer that has been handed pictures shows nothing else, so a
  // later load that converts the video gets a new one; one that decodes
  // keeps it.
  {
    const made = [];
    const player = new Mpeg2TsPlayer(new FakeVideo(), {
      mediaSource: "worker",
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
    assert.equal(third.video, "transcode");
    assert.equal(made.length, 2, "a converting load gets a new one");
    assert.ok(made[0].calls.includes("destroy"));
    assert.ok(!made[1].calls.includes("destroy"));
    assert.equal(third.encodedVideo, true);
    // Nothing was handed to the new one, so it stays for the load after.
    void player.load("https://example.invalid/f.ts").catch(() => {});
    assert.equal(made.length, 2);
    player.destroy();
  }

  console.log("player decode-mode tests passed");
} finally {
  await unlink(output).catch(() => {});
}
