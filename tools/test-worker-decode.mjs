/**
 * The worker in decode mode, end to end in Node with the real WebAssembly
 * build: a load, requests for pictures as a playhead moves through the
 * input, the sound fed to a stand-in for the AudioWorklet that takes it as
 * the playhead reaches it, seeks, and the end of the input.
 *
 *   node tools/test-worker-decode.mjs <input.ts>
 *
 * The input is served from memory with byte ranges, as a file server does.
 * Every picture of the input reaches the page once, in its epoch and in
 * presentation order, with the luma `mpeg2toh264 decode --checksums` gives
 * it (build the CLI first). Each epoch's sound starts no later than where
 * the epoch starts, each stretch where the one before ends, and the
 * worklet is told when it ends, a seek into the last picture or past it
 * included; buffers handed back are used again, and after a seek the
 * pictures start where it landed.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const CLI = "target/release/mpeg2toh264";
const INPUT_URL = "https://example.invalid/input.ts";
const WASM_URL = "https://example.invalid/mpeg2toh264_wasm_bg.wasm";

const input = process.argv[2];
if (!input) {
  console.error("usage: node tools/test-worker-decode.mjs <input.ts>");
  process.exit(2);
}
const data = await readFile(input);
const wasm = await readFile("packages/player/wasm/mpeg2toh264_wasm_bg.wasm");

/** A file server that honours `Range`. */
globalThis.fetch = async (url, init = {}) => {
  if (String(url) === WASM_URL)
    return new Response(wasm, {
      headers: { "content-type": "application/wasm" },
    });
  assert.equal(String(url), INPUT_URL);
  const range = new Headers(init.headers).get("range");
  const total = data.byteLength;
  let start = 0;
  let end = total - 1;
  const suffix = range?.match(/^bytes=-(\d+)$/);
  const span = range?.match(/^bytes=(\d+)-(\d*)$/);
  if (suffix) start = Math.max(0, total - Number(suffix[1]));
  else if (span) {
    start = Number(span[1]);
    if (span[2]) end = Math.min(end, Number(span[2]));
  }
  if (start >= total) return new Response(null, { status: 416 });
  const body = data.subarray(start, end + 1);
  return new Response(body, {
    status: 206,
    headers: {
      "content-range": `bytes ${start}-${end}/${total}`,
      "content-length": String(body.byteLength),
    },
  });
};

/** What the worker posts, as the page would receive it. */
const inbox = [];
let notify = () => {};
globalThis.self = globalThis;
globalThis.postMessage = (message) => {
  inbox.push(message);
  notify();
};

function luma(picture) {
  const bytes = new Uint8Array(picture.data);
  const view = new DataView(picture.data);
  const { offset, stride } = picture.planes[0];
  let hash = 0x811c9dc5;
  const words = picture.width & ~3;
  for (let y = 0; y < picture.height; y++) {
    const row = offset + y * stride;
    let sum = 0;
    for (let x = 0; x < words; x += 4)
      sum = (sum + view.getUint32(row + x, true)) >>> 0;
    for (let x = words; x < picture.width; x++)
      sum = (sum + bytes[row + x]) >>> 0;
    hash = Math.imul((hash ^ sum ^ y) >>> 0, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const output = join(tmpdir(), `mpeg2toh264-worker-test-${process.pid}.mjs`);
await build({
  entryPoints: ["packages/player/src/worker.ts"],
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
try {
  await import(pathToFileURL(output));
  const send = (command) => globalThis.onmessage({ data: command });
  const id = 1;

  /** Handle what has arrived; resolves once `until` says so. */
  async function pump(until) {
    for (;;) {
      while (inbox.length > 0) {
        const message = inbox.shift();
        if (message.id !== id) continue;
        handle(message);
      }
      if (until()) return;
      await new Promise((resolve) => (notify = resolve));
    }
  }

  let epoch = 0;
  let playhead = 0;
  /** Where the pictures of the epoch reach. */
  let newest = Number.NEGATIVE_INFINITY;
  /** When the last picture of the epoch starts. */
  let last = Number.NEGATIVE_INFINITY;
  /** Where the last seek asked to be, and whether a picture covering it has come. */
  let wanted = 0;
  let covered = false;
  const pictures = new Map();
  const buffers = new Set();
  let duplicates = 0;
  let stale = 0;
  let ends = [];
  let completed = false;
  let duration = null;
  let errors = [];

  /**
   * The AudioWorklet's end of the PCM channel: what was sent under each
   * epoch, and which epochs were told the sound ends. It takes what it is
   * sent as the playhead reaches it, as the worklet does.
   */
  const sound = new MessageChannel();
  const soundSent = new Map();
  const soundEnded = new Set();
  sound.port2.onmessage = ({ data }) => {
    if (data.type === "pcm") {
      assert.equal(data.channels[0].length, data.channels[1].length);
      const sent = soundSent.get(data.epoch) ?? [];
      sent.push({
        start: data.start,
        end: data.start + data.channels[0].length / data.sampleRate,
        rate: data.sampleRate,
      });
      soundSent.set(data.epoch, sent);
    } else if (data.type === "end") soundEnded.add(data.epoch);
    notify();
  };
  const consume = () =>
    sound.port2.postMessage({ type: "consumed", epoch, until: playhead });

  /**
   * What epoch `at` was sent: from no later than `at` where there is sound
   * there, each stretch where the one before ends.
   */
  function checkSound(at, label) {
    const sent = soundSent.get(epoch) ?? [];
    if (sent.length === 0) {
      assert.ok(soundEnded.has(epoch), `${label}: no sound, and its end`);
      return;
    }
    assert.ok(
      sent[0].start <= at + 1e-6,
      `${label}: the sound starts at ${sent[0].start} for ${at}`,
    );
    for (let index = 1; index < sent.length; index++)
      assert.ok(
        Math.abs(sent[index].start - sent[index - 1].end) <
          0.5 / sent[index].rate,
        `${label}: sound at ${sent[index].start} after one ending at ${sent[index - 1].end}`,
      );
  }
  /** Held like a renderer's queue, then handed back. */
  const held = [];

  function handle(message) {
    switch (message.type) {
      case "picture": {
        if (message.epoch !== epoch) {
          stale++;
          send({ type: "recycle", id, data: message.picture.data });
          break;
        }
        const { picture } = message;
        assert.equal(
          picture.data.byteLength,
          picture.planes[2].offset +
            picture.planes[2].stride * (Math.ceil(picture.height / 2) - 1) +
            Math.ceil(picture.width / 2),
        );
        assert.ok(
          picture.timestamp > last,
          `the picture at ${picture.timestamp} s came after the one at ${last} s`,
        );
        last = picture.timestamp;
        if (picture.timestamp + picture.duration > wanted) covered = true;
        newest = Math.max(newest, picture.timestamp + picture.duration);
        const key = picture.timestamp.toFixed(6);
        if (pictures.has(key) && epoch === 0) duplicates++;
        pictures.set(key, { ...picture, luma: luma(picture), epoch });
        buffers.add(picture.data);
        held.push(picture.data);
        if (held.length > 6) send({ type: "recycle", id, data: held.shift() });
        break;
      }
      case "pictures-end":
        ends.push(message.epoch);
        break;
      case "reset":
      case "fragment":
      case "open":
        throw new Error(`decode mode has no sink, and sent ${message.type}`);
      case "seekable":
        duration = message.duration;
        break;
      case "completed":
        completed = true;
        break;
      case "error":
        errors.push(message.message);
        break;
    }
  }

  send({
    type: "load",
    id,
    url: INPUT_URL,
    wasmUrl: WASM_URL,
    recoveryInterval: undefined,
    openGopRecovery: undefined,
    splitFieldSamples: undefined,
    audioGainSteps: 0,
    surroundAudioGainSteps: 0,
    video: "decode",
    serviceId: null,
    sink: "main",
    preferManagedMediaSource: false,
    queueHighWaterMark: 1 << 30,
    maxAheadSeconds: 1e9,
    // Short, so that the units the playhead passes are dropped.
    keepBehindSeconds: 1,
  });
  send({ type: "sound-port", id, port: sound.port1, epoch, at: 0 });
  const started = performance.now();
  // A playhead moving through the input as fast as the pictures ahead of it
  // arrive, asking for them as the page does.
  const step = async () => {
    send({ type: "need", id, epoch, from: playhead, until: playhead + 0.3 });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await pump(() => true);
    if (newest >= playhead + 0.3) {
      playhead += 0.05;
      consume();
    }
  };
  while (!(completed && ends.includes(epoch)) && errors.length === 0) {
    await step();
    if (performance.now() - started > 600_000) throw new Error("timed out");
  }
  assert.deepEqual(errors, []);
  checkSound(0, "the load");
  const elapsed = performance.now() - started;

  const expected = execFileSync(
    CLI,
    ["decode", "--bench", "--checksums", "-q", input],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  )
    .trim()
    .split("\n")
    .map((line) => line.split(" "))
    .filter((fields) => fields[2] !== "lone-field")
    .map((fields) => fields[0]);
  const shown = [...pictures.values()].sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  assert.equal(duplicates, 0, "no picture twice in one epoch");
  assert.equal(shown.length, expected.length, "every picture");
  assert.deepEqual(
    shown.map((picture) => picture.luma),
    expected,
    "the stream decoder's pictures",
  );
  assert.ok(
    buffers.size < 32,
    `${buffers.size} buffers for ${shown.length} pictures`,
  );
  console.log(
    `${input}: ${shown.length} pictures through the worker in ${elapsed.toFixed(0)} ms, ` +
      `${buffers.size} buffers, pictures-end for epochs ${ends.join(",")}`,
  );

  // A seek: the page starts a new epoch and tells the worker, which feeds the
  // sound from what it holds where that reaches and reads the input again
  // where it does not; older requests stop counting, and the pictures begin
  // where it landed.
  const byEnd = new Map(
    shown.map((picture) => [
      (picture.timestamp + picture.duration).toFixed(6),
      picture.luma,
    ]),
  );
  function startEpoch(target) {
    pictures.clear();
    ends = [];
    completed = false;
    epoch++;
    playhead = target;
    wanted = target;
    covered = false;
    newest = Number.NEGATIVE_INFINITY;
    last = Number.NEGATIVE_INFINITY;
    for (const buffer of held.splice(0))
      send({ type: "recycle", id, data: buffer });
    send({ type: "need", id, epoch, from: target, until: target + 0.3 });
    send({ type: "seek", id, time: target, epoch });
  }
  async function seekTo(target, label) {
    startEpoch(target);
    const seekEpoch = epoch;
    while (!(newest >= playhead + 0.3) && errors.length === 0) {
      send({ type: "need", id, epoch, from: playhead, until: playhead + 0.3 });
      await new Promise((resolve) => setTimeout(resolve, 2));
      await pump(() => true);
    }
    assert.deepEqual(errors, []);
    checkSound(target, label);
    const after = [...pictures.values()]
      .filter((picture) => picture.epoch === seekEpoch)
      .sort((a, b) => a.timestamp - b.timestamp);
    assert.ok(after.length > 0, "pictures after the seek");
    // Reading again starts at a restart, and the leading pictures of an
    // open group there are not kept: the pictures can begin up to a group
    // after the target, where the sound already plays.
    const landed = after[0].timestamp;
    assert.ok(
      landed <= target + 1.1 &&
        after.at(-1).timestamp + after.at(-1).duration >= playhead + 0.3,
      `pictures ${landed}-${after.at(-1).timestamp} for ${target}`,
    );
    // The input reopens at a restart, whose leading pictures are not kept:
    // its intra picture covers their time, so it is the picture that ends
    // where it does.
    for (const picture of after)
      assert.equal(
        picture.luma,
        byEnd.get((picture.timestamp + picture.duration).toFixed(6)),
        `the picture at ${picture.timestamp} after the seek`,
      );
    console.log(
      `${label} to ${target.toFixed(2)} s: ${after.length} pictures from ` +
        `${landed.toFixed(3)} s, the same as without it; ` +
        `sound from ${soundSent.get(seekEpoch)[0].start.toFixed(3)} s`,
    );
  }
  assert.ok(duration > 2, "the input is seekable");
  await seekTo(shown[0].timestamp + 0.1, "seek back among dropped units");
  await seekTo(duration / 2, "seek");
  // Back a little, into what is still held: no reading again.
  await seekTo(duration / 2 + 0.1, "seek into the held sound");

  // A seek into the last picture: it comes out of the decoder only once the
  // input has ended, and the worklet is told the sound ends.
  // Ahead of the request past the last picture below: that one reads the
  // end of the input again, and the worker learns the last unit's restart
  // there, from which no session can place the picture -- no sound follows
  // it to place it by. A seek after that into the last picture reads from
  // there and gets nothing; that is a fault of its own.
  const final = shown.at(-1);
  const target = final.timestamp + final.duration / 2;
  startEpoch(target);
  while (
    !(completed && ends.includes(epoch) && soundEnded.has(epoch)) &&
    errors.length === 0
  ) {
    send({ type: "need", id, epoch, from: playhead, until: playhead + 0.3 });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await pump(() => true);
  }
  assert.deepEqual(errors, []);
  assert.ok(covered, "the last picture after a seek into it");
  checkSound(target, "a seek into the last picture");
  console.log(
    `seek to ${target.toFixed(3)} s, into the last picture: the picture, and the sound's end`,
  );

  // A request of a new epoch past the last picture, with the input read to
  // its end and the decoder holding a picture back from the seek before: it
  // ends at once, and nothing of the epoch left behind comes out in it.
  const lastPicture = shown.at(-1);
  const beyond = lastPicture.timestamp + lastPicture.duration + 0.05;
  startEpoch(beyond);
  const beyondEpoch = epoch;
  while (!ends.includes(beyondEpoch) && errors.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 2));
    await pump(() => true);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(
    [...pictures.values()]
      .filter((picture) => picture.epoch === beyondEpoch)
      .map((picture) => picture.timestamp),
    [],
    "no picture in an epoch past the last one",
  );
  console.log(
    `request at ${beyond.toFixed(3)} s in the buffer, past the last picture: no picture, and its end`,
  );

  // A request past the last picture, where a recording's sound outlasts its
  // pictures: no picture is coming to wait for, and the stream still ends.
  const past = final.timestamp + final.duration + 0.05;
  startEpoch(past);
  while (
    !(completed && ends.includes(epoch) && soundEnded.has(epoch)) &&
    errors.length === 0
  ) {
    send({ type: "need", id, epoch, from: playhead, until: playhead + 0.3 });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await pump(() => true);
  }
  assert.deepEqual(errors, []);
  console.log(
    `request at ${past.toFixed(3)} s, past the last picture: the stream ends`,
  );
  console.log(`${stale} pictures of older epochs handed back`);
  send({ type: "stop", id });
  console.log("worker decode-mode tests passed");
} finally {
  await unlink(output).catch(() => {});
}
process.exit(0);
