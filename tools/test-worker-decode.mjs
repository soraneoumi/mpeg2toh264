/**
 * The worker in decode mode, end to end in Node with the real WebAssembly
 * build: a load with the MediaSource on the page, requests for pictures as a
 * playhead moves through the input, a seek, and the end of the input.
 *
 *   node tools/test-worker-decode.mjs <input.ts>
 *
 * The input is served from memory with byte ranges, as a file server does.
 * Every picture of the input reaches the page once and in its epoch, with
 * the luma `mpeg2toh264 decode --checksums` gives it (build the CLI first),
 * buffers handed back are used again, and after a seek the pictures start
 * where it landed.
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
  const pictures = new Map();
  const buffers = new Set();
  let duplicates = 0;
  let stale = 0;
  let ends = [];
  let resets = 0;
  let completed = false;
  let duration = null;
  /** Where the media a seek reopened the input at begins. */
  let landed = null;
  let errors = [];
  /** Held like a renderer's queue, then handed back. */
  const held = [];

  function handle(message) {
    switch (message.type) {
      case "open":
        send({ type: "flow", id, ready: true });
        break;
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
        resets++;
        epoch++;
        for (const buffer of held.splice(0))
          send({ type: "recycle", id, data: buffer });
        send({
          type: "need",
          id,
          epoch,
          from: playhead,
          until: playhead + 0.3,
        });
        break;
      case "fragment":
        if (resets > 0) landed ??= message.start;
        break;
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
  const started = performance.now();
  // A playhead moving through the input as fast as the pictures ahead of it
  // arrive, asking for them as the page does.
  const step = async () => {
    send({ type: "need", id, epoch, from: playhead, until: playhead + 0.3 });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await pump(() => true);
    if (newest >= playhead + 0.3) playhead += 0.05;
  };
  while (!(completed && ends.includes(epoch)) && errors.length === 0) {
    await step();
    if (performance.now() - started > 600_000) throw new Error("timed out");
  }
  assert.deepEqual(errors, []);
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

  // A seek: the worker reopens the input and says so, older requests stop
  // counting, and the pictures begin where it landed -- which can be after
  // the time asked for, where the media element is then moved to. `command`
  // is a seek the page sends; without it the page only asks for pictures the
  // worker has dropped, and the worker reads the input again by itself.
  const byEnd = new Map(
    shown.map((picture) => [
      (picture.timestamp + picture.duration).toFixed(6),
      picture.luma,
    ]),
  );
  async function seekTo(target, command) {
    pictures.clear();
    ends = [];
    landed = null;
    const reset = resets + 1;
    epoch++;
    playhead = target;
    newest = Number.NEGATIVE_INFINITY;
    send({ type: "need", id, epoch, from: target, until: target + 0.3 });
    if (command) send({ type: "seek", id, time: target });
    await pump(() => resets === reset);
    const seekEpoch = epoch;
    while (!(newest >= playhead + 0.3) && errors.length === 0) {
      if (landed !== null) playhead = Math.max(target, landed);
      send({ type: "need", id, epoch, from: playhead, until: playhead + 0.3 });
      await new Promise((resolve) => setTimeout(resolve, 2));
      await pump(() => true);
    }
    assert.deepEqual(errors, []);
    const after = [...pictures.values()]
      .filter((picture) => picture.epoch === seekEpoch)
      .sort((a, b) => a.timestamp - b.timestamp);
    assert.ok(after.length > 0, "pictures after the seek");
    assert.ok(
      after[0].timestamp <= Math.max(target, landed) + 0.001 &&
        after.at(-1).timestamp + after.at(-1).duration >= playhead + 0.3,
      `pictures ${after[0].timestamp}-${after.at(-1).timestamp} for ${target}, landed at ${landed}`,
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
      `${command ? "seek" : "request back among dropped units"} to ${target.toFixed(2)} s, ` +
        `landed at ${landed.toFixed(2)} s: ${after.length} pictures from ` +
        `${after[0].timestamp.toFixed(3)} s, the same as without it`,
    );
  }
  assert.ok(duration > 2, "the input is seekable");
  await seekTo(shown[0].timestamp + 0.1, false);
  await seekTo(duration / 2, true);
  console.log(`${stale} pictures of older epochs handed back`);
  send({ type: "stop", id });
  console.log("worker decode-mode tests passed");
} finally {
  await unlink(output).catch(() => {});
}
process.exit(0);
