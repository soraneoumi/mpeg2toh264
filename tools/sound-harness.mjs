/**
 * Shared pieces of the sound tests: bundling the TypeScript sources, signal
 * measurements, and an AudioWorklet stand-in for the processor.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const SOUND = "packages/player/src/sound";

/** Bundle `packages/player/src/sound/<name>.ts` and import it. */
export async function load(name) {
  const dir = await mkdtemp(join(tmpdir(), "sound-test-"));
  const output = join(dir, `${name}.mjs`);
  try {
    await build({
      entryPoints: [`${SOUND}/${name}.ts`],
      outfile: output,
      bundle: true,
      format: "esm",
      platform: "neutral",
      logLevel: "error",
    });
    return await import(pathToFileURL(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Load processor.ts into a fake AudioWorkletGlobalScope and return a driver.
 * `currentFrame` advances by 128 per `quantum()`; messages from the processor
 * are collected, and messages to it are delivered synchronously.
 */
export async function loadProcessor({ sampleRate = 48000 } = {}) {
  const scope = globalThis;
  let registered = null;
  scope.sampleRate = sampleRate;
  scope.currentFrame = 0;
  scope.currentTime = 0;
  scope.AudioWorkletProcessor = class {
    constructor() {
      this.port = makePort();
    }
  };
  scope.registerProcessor = (name, ctor) => {
    registered = { name, ctor };
  };
  await load("processor");
  return registered;
}

/** A synchronous port: `postMessage` on one end calls `onmessage` on the other. */
export function makePort() {
  const port = {
    onmessage: null,
    sent: [],
    postMessage(data) {
      port.sent.push(structuredClone(data));
    },
  };
  return port;
}

/** Deliver `data` to a port's message handler as a MessageEvent would. */
export function deliver(port, data) {
  port.onmessage?.({ data });
}

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/**
 * Magnitude spectrum of `x` (power-of-two length) under a 7-term
 * Blackman-Harris window, scaled so a full-scale sine reads 1 at its bin.
 */
export function spectrum(x) {
  const n = x.length;
  const a = [
    0.27105140069342, -0.43329793923448, 0.21812299954311, -0.06592544638803,
    0.01081174209837, -0.00077658482522, 0.00001388721735,
  ];
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let w = 0;
    for (let k = 0; k < a.length; k++)
      w += a[k] * Math.cos((2 * Math.PI * k * i) / n);
    re[i] = x[i] * w;
  }
  fft(re, im);
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++)
    mag[i] = (2 * Math.hypot(re[i], im[i])) / (n * a[0]);
  return mag;
}

/** Frequency of the spectral peak, interpolated between bins (Hz). */
export function peakFrequency(x, rate) {
  let n = 1;
  while (n * 2 <= x.length) n *= 2;
  const mag = spectrum(x.subarray(0, n));
  let best = 1;
  for (let i = 2; i < mag.length - 1; i++) if (mag[i] > mag[best]) best = i;
  // Gaussian interpolation on the log magnitude.
  const l = Math.log(mag[best - 1]);
  const c = Math.log(mag[best]);
  const r = Math.log(mag[best + 1]);
  const d = (0.5 * (l - r)) / (l - 2 * c + r);
  return ((best + d) * rate) / n;
}

export const dB = (x) => 20 * Math.log10(x);

/**
 * Least-squares fit of `a cos(phase) + b sin(phase) + c` with the given
 * phases; returns the amplitude and the residual.
 */
export function fitSine(y, phase) {
  // Normal equations for [cos, sin, 1].
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const v = [0, 0, 0];
  for (let i = 0; i < y.length; i++) {
    const f = [Math.cos(phase[i]), Math.sin(phase[i]), 1];
    for (let r = 0; r < 3; r++) {
      v[r] += f[r] * y[i];
      for (let c = 0; c < 3; c++) m[r][c] += f[r] * f[c];
    }
  }
  const coef = solve3(m, v);
  const residual = new Float64Array(y.length);
  for (let i = 0; i < y.length; i++)
    residual[i] =
      y[i] -
      coef[0] * Math.cos(phase[i]) -
      coef[1] * Math.sin(phase[i]) -
      coef[2];
  return { amplitude: Math.hypot(coef[0], coef[1]), residual };
}

function solve3(m, v) {
  const a = m.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++)
      if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

export function rms(x) {
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
}
