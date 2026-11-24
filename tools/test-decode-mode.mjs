/**
 * Decode mode end to end, through the real WebAssembly build.
 *
 *   node tools/test-decode-mode.mjs <input.ts>...
 *
 * Each input goes through a `Session` in decode mode in 1 MiB chunks, as the
 * worker feeds it, and every `video` unit through a `PictureDecoder`. Checked:
 *
 * - the luma checksum of every picture, in the order the decoder hands them
 *   out, equals what `mpeg2toh264 decode --checksums` prints in display
 *   order, bar the lone
 *   fields it conceals and the session does not keep (build the CLI first:
 *   cargo build --release -p mpeg2toh264-cli);
 * - presentation times increase strictly and each picture ends where the
 *   next begins;
 * - the sound comes out decoded, as `sound` fragments that follow on from
 *   one another, as many samples as the units' AAC frames, starting where
 *   the sound of the MP4 `mpeg2toh264 --split-groups` makes starts, and
 *   within 2^-15 of ffmpeg's decoding of that MP4's sound where it is
 *   stereo. How far the sound and the pictures each reach is printed
 *   beside what the input says of its own streams, which need not cover
 *   the same span.
 *
 * It prints the wall time, the pictures per second and the time spent copying
 * pictures out of the decoder.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  let aacFrames = 0;
  const pictures = [];
  let buffer = new Uint8Array(0);
  let inits = 0;
  let units = 0;

  const record = (info) => {
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
  };

  const take = (fragments) => {
    for (const fragment of fragments) {
      if (fragment.kind === "init") {
        // Decode mode's sound goes out decoded; the init is the picture size.
        assert.equal(fragment.mimeCodec, "");
        assert.equal(fragment.data.byteLength, 0);
        inits++;
      } else if (fragment.kind === "media") {
        assert.equal(fragment.videoSamples, 0);
        assert.equal(fragment.data.byteLength, 0);
        aacFrames += fragment.audioSamples;
      } else if (fragment.kind === "sound") {
        assert.equal(fragment.left.length, fragment.right.length);
        sound.push(fragment);
      } else if (fragment.kind === "video") {
        units++;
        const decodeStarted = performance.now();
        decoder.begin(fragment);
        for (let index = 0; index < fragment.pictures.length; index++) {
          const info = decoder.next(true);
          if (info) record(info);
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
  // The last anchor has no other to let it out.
  const held = decoder.flush();
  if (held) record(held);
  session.free();
  decoder.free();
  const wallMs = performance.now() - started;

  assert.ok(inits >= 1, "an initialization segment");
  assert.ok(pictures.length > 0, "pictures");

  // (a) The same pictures as the decoder of the whole elementary stream, in
  // the same order.
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

  // (c) The sound, decoded: stretch after stretch, as long as the AAC frames
  // the units carried, from where the passthrough MP4's sound starts, and as
  // ffmpeg decodes that sound.
  assert.ok(sound.length > 0, `${input}: sound`);
  let samples = 0;
  for (const [index, stretch] of sound.entries()) {
    samples += stretch.left.length;
    if (index === 0) continue;
    const previous = sound[index - 1];
    const end = previous.start + previous.left.length / previous.sampleRate;
    assert.ok(
      Math.abs(stretch.start - end) < 0.5 / stretch.sampleRate,
      `${input}: sound at ${stretch.start} s after sound ending at ${end} s`,
    );
  }
  assert.equal(samples, aacFrames * 1024, `${input}: samples per AAC frame`);
  const passthroughFile = join(workDir, "passthrough.mp4");
  execFileSync(CLI, ["-q", "--split-groups", input, passthroughFile]);
  const muxed = soundPackets(passthroughFile);
  const audioStart = sound[0].start;
  const lastSound = sound.at(-1);
  const audioEnd =
    lastSound.start + lastSound.left.length / lastSound.sampleRate;
  assert.ok(
    Math.abs(audioStart - muxed[0][0]) < 1e-5,
    `${input}: the sound starts at ${audioStart} s, the passthrough MP4's at ${muxed[0][0]} s`,
  );
  assert.equal(muxed.length, aacFrames, `${input}: AAC frames as passthrough`);
  const channels = Number(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=channels",
        "-of",
        "csv=p=0",
        passthroughFile,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  let worst = null;
  if (channels === 2) {
    const reference = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        passthroughFile,
        "-map",
        "0:a:0",
        "-f",
        "f32le",
        "-",
      ],
      { maxBuffer: 1 << 30 },
    );
    const interleaved = new Float32Array(
      reference.buffer,
      reference.byteOffset,
      reference.byteLength / 4,
    );
    assert.equal(interleaved.length, samples * 2, `${input}: ffmpeg's samples`);
    worst = 0;
    let at = 0;
    for (const stretch of sound)
      for (let n = 0; n < stretch.left.length; n++, at++) {
        worst = Math.max(
          worst,
          Math.abs(stretch.left[n] - interleaved[2 * at]),
          Math.abs(stretch.right[n] - interleaved[2 * at + 1]),
        );
      }
    assert.ok(worst <= 2 ** -15, `${input}: ${worst} from ffmpeg's sound`);
  }
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
      `sound ${audioStart.toFixed(3)}-${audioEnd.toFixed(3)} s (${aacFrames} AAC frames, as passthrough; ` +
      `${worst === null ? `${channels} channels, not compared` : `${worst.toExponential(2)} from ffmpeg`}); ` +
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
