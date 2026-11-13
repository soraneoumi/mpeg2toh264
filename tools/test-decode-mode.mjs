/**
 * Decode mode end to end, through the real WebAssembly build.
 *
 *   node tools/test-decode-mode.mjs <input.ts>...
 *
 * Each input goes through a `Session` in decode mode in 1 MiB chunks, as the
 * worker feeds it, and every `video` unit through a `PictureDecoder`. Checked:
 *
 * - the luma checksum of every picture, ordered by time, equals what
 *   `mpeg2toh264 decode --checksums` prints in display order, bar the lone
 *   fields it conceals and the session does not keep (build the CLI first:
 *   cargo build --release -p mpeg2toh264-cli);
 * - presentation times increase strictly and each picture ends where the
 *   next begins;
 * - the audio initialization and media fragments concatenated make a file
 *   ffmpeg decodes without a message, holding packet for packet the sound
 *   of the MP4 `mpeg2toh264 --split-groups` makes. How far the sound and
 *   the pictures each reach is printed beside what the input says of its
 *   own streams, which need not cover the same span.
 *
 * It prints the wall time, the pictures per second and the time spent copying
 * pictures out of the decoder.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import init, {
  PictureDecoder,
  Session,
} from "../packages/player/wasm/mpeg2toh264_wasm.js";

const CHUNK_BYTES = 1 << 20;
const CLI = "target/release/mpeg2toh264";

/** The CLI's `checksum_luma` from its basis: per row, the sum of its little-endian words, folded FNV-1a style with the row index. */
function lumaChecksum(bytes, offset, stride, width, height) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let hash = 0x811c9dc5;
  const words = width & ~3;
  for (let y = 0; y < height; y++) {
    const row = offset + y * stride;
    let sum = 0;
    for (let x = 0; x < words; x += 4)
      sum = (sum + view.getUint32(row + x, true)) >>> 0;
    for (let x = words; x < width; x++) sum = (sum + bytes[row + x]) >>> 0;
    hash = Math.imul((hash ^ sum ^ y) >>> 0, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** `[pts, duration]` of every packet of the first audio stream, in seconds. */
function soundPackets(file) {
  return execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "packet=pts_time,duration_time",
      "-of",
      "csv=p=0",
      file,
    ],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  )
    .trim()
    .split("\n")
    .map((line) => line.split(",").map(Number));
}

/** How long the input's first video and audio streams say they are. */
function sourceSpans(file) {
  const spans = {};
  for (const kind of ["video", "audio"]) {
    spans[kind] = parseFloat(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "quiet",
          "-select_streams",
          `${kind[0]}:0`,
          "-show_entries",
          "stream=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          file,
        ],
        { encoding: "utf8" },
      ),
    ).toFixed(3);
  }
  return spans;
}

async function check(input, workDir) {
  const data = await readFile(input);
  const started = performance.now();
  let sessionMs = 0;
  let decodeMs = 0;
  let copyMs = 0;

  const session = new Session(
    undefined,
    undefined,
    undefined,
    undefined,
    "decode",
  );
  const decoder = new PictureDecoder();
  const sound = [];
  const pictures = [];
  let buffer = new Uint8Array(0);
  let inits = 0;
  let units = 0;

  const take = (fragments) => {
    for (const fragment of fragments) {
      if (fragment.kind === "init") {
        assert.equal(fragment.mimeCodec, 'audio/mp4; codecs="mp4a.40.2"');
        inits++;
        sound.push(fragment.data);
      } else if (fragment.kind === "media") {
        assert.equal(fragment.videoSamples, 0);
        sound.push(fragment.data);
      } else if (fragment.kind === "video") {
        units++;
        const decodeStarted = performance.now();
        decoder.begin(fragment);
        for (const picture of fragment.pictures) {
          const info = decoder.next(true);
          if (!info) continue;
          assert.equal(info.time, picture.time);
          assert.equal(info.duration, picture.duration);
          if (buffer.byteLength !== info.byteLength)
            buffer = new Uint8Array(info.byteLength);
          const copyStarted = performance.now();
          decoder.copy(buffer);
          copyMs += performance.now() - copyStarted;
          const luma = info.planes[0];
          pictures.push({
            time: info.time,
            duration: info.duration,
            checksum: lumaChecksum(
              buffer,
              luma.offset,
              luma.stride,
              info.width,
              info.height,
            ),
            concealed: info.concealedMacroblocks,
            size: `${info.width}x${info.height}/${info.displayWidth}x${info.displayHeight}`,
            matrix: info.matrix,
            interlaced: info.interlaced,
          });
        }
        decodeMs += performance.now() - decodeStarted;
      }
    }
  };

  for (let at = 0; at < data.byteLength; at += CHUNK_BYTES) {
    const pushStarted = performance.now();
    const fragments = session.push(
      data.subarray(at, Math.min(at + CHUNK_BYTES, data.byteLength)),
    );
    sessionMs += performance.now() - pushStarted;
    take(fragments);
  }
  const finishStarted = performance.now();
  const final = session.finish();
  sessionMs += performance.now() - finishStarted;
  take(final);
  session.free();
  decoder.free();
  const wallMs = performance.now() - started;

  assert.ok(inits >= 1, "an initialization segment");
  assert.ok(pictures.length > 0, "pictures");

  // (a) The same pictures as the decoder of the whole elementary stream.
  pictures.sort((a, b) => a.time - b.time);
  const expected = execFileSync(
    CLI,
    ["decode", "--bench", "--checksums", "-q", input],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  )
    .trim()
    .split("\n")
    .map((line) => line.split(" "))
    // A field whose second field never came is no frame to the session, as
    // in the other modes; the stream decoder conceals the missing half.
    .filter((fields) => fields[2] !== "lone-field")
    .map((fields) => fields[0]);
  const actual = pictures.map((picture) => picture.checksum);
  const differing = actual.findIndex((sum, index) => sum !== expected[index]);
  assert.ok(
    differing === -1 && actual.length === expected.length,
    `${input}: ${actual.length} pictures against ${expected.length}, ` +
      `first differing at ${differing} (${pictures[differing]?.time} s)`,
  );

  // (b) Strictly increasing, end to end.
  const durations = new Map();
  for (let index = 1; index < pictures.length; index++) {
    const previous = pictures[index - 1];
    const picture = pictures[index];
    assert.ok(picture.time > previous.time, `${input}: picture ${index} time`);
    assert.ok(
      Math.abs(previous.time + previous.duration - picture.time) < 1e-6,
      `${input}: picture ${index - 1} ends at ${previous.time + previous.duration}, the next begins at ${picture.time}`,
    );
  }
  for (const picture of pictures) {
    const ticks = Math.round(picture.duration * 90_000);
    durations.set(ticks, (durations.get(ticks) ?? 0) + 1);
  }
  const first = pictures[0];
  const last = pictures.at(-1);
  const videoStart = first.time;
  const videoEnd = last.time + last.duration;

  // (c) The sound alone is a file ffmpeg plays through.
  const soundFile = join(workDir, "sound.mp4");
  await writeFile(soundFile, Buffer.concat(sound));
  const messages = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", soundFile, "-f", "null", "-"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.equal(messages, "", `${input}: ffmpeg reported ${messages}`);
  // Packet for packet the sound of the MP4 passthrough makes of the input.
  const passthroughFile = join(workDir, "passthrough.mp4");
  execFileSync(CLI, ["-q", "--split-groups", input, passthroughFile]);
  const packets = soundPackets(soundFile);
  const muxed = soundPackets(passthroughFile);
  // ffmpeg gives the first packet of a fragmented file with no video track
  // no duration (its own such files too), so that one is read off the next.
  if (Number.isNaN(packets[0][1]) && packets.length > 1)
    packets[0][1] = Number((packets[1][0] - packets[0][0]).toFixed(6));
  assert.deepEqual(
    packets,
    muxed,
    `${input}: the sound differs from the passthrough MP4's`,
  );
  const audioStart = packets[0][0];
  const audioEnd = packets.at(-1)[0] + packets.at(-1)[1];
  const source = sourceSpans(input);

  const concealed = pictures.reduce(
    (sum, picture) => sum + picture.concealed,
    0,
  );
  console.log(
    `${input}: ${pictures.length} pictures in ${units} units, ${inits} init, ` +
      `checksums match; ${[...new Set(pictures.map((p) => `${p.size} ${p.matrix}${p.interlaced ? " interlaced" : ""}`))].join(", ")}; ` +
      `${concealed} concealed macroblocks\n` +
      `  pictures ${videoStart.toFixed(3)}-${videoEnd.toFixed(3)} s, ` +
      `sound ${audioStart.toFixed(3)}-${audioEnd.toFixed(3)} s (${packets.length} AAC frames, as passthrough); ` +
      `the input's own video ${source.video} s and audio ${source.audio} s\n  ` +
      `durations in ticks ${[...durations].map(([ticks, count]) => `${ticks}x${count}`).join(" ")}\n` +
      `  wall ${wallMs.toFixed(0)} ms, ${((pictures.length * 1000) / wallMs).toFixed(1)} pictures/s; ` +
      `session ${sessionMs.toFixed(0)} ms, decoding ${decodeMs.toFixed(0)} ms ` +
      `(${((pictures.length * 1000) / decodeMs).toFixed(1)} pictures/s), ` +
      `of which copying ${copyMs.toFixed(0)} ms (${((copyMs * 1000) / pictures.length).toFixed(0)} us a picture)`,
  );
}

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("usage: node tools/test-decode-mode.mjs <input.ts>...");
  process.exit(2);
}
await init({
  module_or_path: await readFile(
    new URL(
      "../packages/player/wasm/mpeg2toh264_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
});
const workDir = await mkdtemp(join(tmpdir(), "mpeg2toh264-decode-mode-"));
try {
  for (const input of inputs) await check(input, workDir);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
