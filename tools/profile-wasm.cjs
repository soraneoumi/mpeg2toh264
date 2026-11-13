#!/usr/bin/env node

// Run a transport stream through the wasm-bindgen Node target. This is kept
// deliberately small so Node's --cpu-prof samples the session, not a test
// framework or browser UI.
const fs = require("node:fs");
const { performance } = require("node:perf_hooks");

const [
  bindingsPath,
  inputPath,
  video,
  iterationsArg = "1",
  chunkSizeArg = "1048576",
] = process.argv.slice(2);
if (
  !bindingsPath ||
  !inputPath ||
  (video !== "passthrough" && video !== "decode")
) {
  console.error(
    "usage: node tools/profile-wasm.cjs BINDINGS INPUT passthrough|decode [ITERATIONS] [CHUNK_SIZE]",
  );
  process.exit(2);
}

const { Session } = require(bindingsPath);
const input = fs.readFileSync(inputPath);
const iterations = Number(iterationsArg);
const chunkSize = Number(chunkSizeArg);

/** The pictures a fragment carries: MP4 samples, or the units decode mode hands out. */
function pictures(fragment) {
  if (fragment.kind === "media") return fragment.videoSamples;
  return fragment.kind === "video" ? fragment.pictures.length : 0;
}

let outputBytes = 0;
let mediaFragments = 0;
let videoSamples = 0;
const samples = [];
for (let iteration = 0; iteration < iterations; iteration += 1) {
  const session = new Session(
    undefined,
    undefined,
    undefined,
    undefined,
    video,
  );
  const started = performance.now();
  for (let offset = 0; offset < input.length; offset += chunkSize) {
    const fragments = session.push(input.subarray(offset, offset + chunkSize));
    for (const fragment of fragments) {
      outputBytes += fragment.data.byteLength;
      mediaFragments += fragment.kind === "media" ? 1 : 0;
      videoSamples += pictures(fragment);
    }
  }
  for (const fragment of session.finish()) {
    outputBytes += fragment.data.byteLength;
    mediaFragments += fragment.kind === "media" ? 1 : 0;
    videoSamples += pictures(fragment);
  }
  session.free();
  samples.push(performance.now() - started);
}

const measured = samples.length > 1 ? samples.slice(1) : samples;
const meanMs = measured.reduce((sum, ms) => sum + ms, 0) / measured.length;
console.log(
  JSON.stringify({
    input: inputPath,
    video,
    inputBytes: input.byteLength,
    iterations,
    chunkSize,
    samplesMs: samples.map((ms) => Number(ms.toFixed(2))),
    warmMeanMs: Number(meanMs.toFixed(2)),
    videoSamplesPerIteration: videoSamples / iterations,
    warmFramesPerSecond: Number(
      (videoSamples / iterations / (meanMs / 1000)).toFixed(2),
    ),
    warmMiBPerSecond: Number(
      (input.byteLength / 1048576 / (meanMs / 1000)).toFixed(2),
    ),
    outputBytes,
    mediaFragments,
  }),
);
