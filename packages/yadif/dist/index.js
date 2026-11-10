const ae = "" + new URL("assets/worker-CyLZgZN-.js", import.meta.url).href, _ = `#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;
function R(n, e, t) {
  const i = n.createProgram(), s = H(n, n.VERTEX_SHADER, t), r = H(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(i, s), n.attachShader(i, r), n.linkProgram(i), n.deleteShader(s), n.deleteShader(r), !n.getProgramParameter(i, n.LINK_STATUS)) {
    const o = n.getProgramInfoLog(i);
    throw n.deleteProgram(i), new Error(
      `the deinterlacer failed to link: ${o ?? "no reason given"}`
    );
  }
  return i;
}
function H(n, e, t) {
  const i = n.createShader(e);
  if (!i) throw new Error("the deinterlacer could not create a shader");
  if (n.shaderSource(i, t), n.compileShader(i), !n.getShaderParameter(i, n.COMPILE_STATUS)) {
    const s = n.getShaderInfoLog(i);
    throw n.deleteShader(i), new Error(
      `the deinterlacer failed to compile: ${s ?? "no reason given"}`
    );
  }
  return i;
}
const le = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
in vec2 vTextureCoord;
uniform vec3 uTextColor;
uniform vec3 uBackColor;
out vec4 fragColor;

void main() {
  float a = texture(uTexture, vTextureCoord)[3];
  fragColor = vec4(uTextColor * a + uBackColor * (1.0 - a), 1.0);
}
`, ue = `#version 300 es
precision highp float;
in vec4 aVertexPosition;
in vec2 aTextureCoord;
uniform mat4 uMatrix;
uniform mat3 uUvMatrix;
out vec2 vTextureCoord;
out vec3 vTextColor;

void main() {
  gl_Position = uMatrix * aVertexPosition;
  vTextureCoord = vec2(uUvMatrix * vec3(aTextureCoord, 1.0));
}
`;
function ce(n, e) {
  const t = R(n, le, ue), i = n.getAttribLocation(t, "aVertexPosition"), s = n.getAttribLocation(t, "aTextureCoord"), r = n.getUniformLocation(t, "uTexture"), o = n.getUniformLocation(t, "uMatrix"), h = n.getUniformLocation(t, "uUvMatrix"), a = n.getUniformLocation(t, "uTextColor"), c = n.getUniformLocation(t, "uBackColor");
  if (r == null || o == null || h == null || a == null || c == null)
    throw new Error(
      "failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER"
    );
  const A = n.createBuffer(), f = n.createBuffer();
  return {
    gl: n,
    ...fe(n, e),
    program: t,
    programUniforms: {
      vertex: i,
      textureCoord: s,
      texture: r,
      matrix: o,
      uvMatrix: h,
      textColor: a,
      backColor: c
    },
    positionBuffer: A,
    textureBuffer: f
  };
}
function fe(n, e) {
  const t = new OffscreenCanvas(0, 0), i = t.getContext("2d"), s = /* @__PURE__ */ new Map();
  let r = 0;
  const o = 0;
  let h = 1;
  i.font = e, i.fillStyle = "white";
  for (let c = 32; c < 128; c++) {
    const A = String.fromCharCode(c), f = i.measureText(A), m = Math.ceil(
      f.actualBoundingBoxDescent + f.actualBoundingBoxAscent + 1
    ), u = Math.ceil(
      f.actualBoundingBoxLeft + f.actualBoundingBoxRight + 1
    );
    s.set(A, {
      x: r,
      y: o,
      width: u,
      height: m,
      metrics: f
    }), h = Math.max(h, m), r += u;
  }
  t.width = r, t.height = h, i.font = e, i.fillStyle = "white";
  for (const [c, A] of s)
    i.fillText(
      c,
      Math.floor(A.x + A.metrics.actualBoundingBoxLeft + 1),
      Math.floor(A.metrics.actualBoundingBoxAscent + 1)
    );
  const a = n.createTexture();
  return n.bindTexture(n.TEXTURE_2D, a), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MIN_FILTER, n.LINEAR), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MAG_FILTER, n.LINEAR), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_WRAP_S, n.CLAMP_TO_EDGE), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_WRAP_T, n.CLAMP_TO_EDGE), n.texImage2D(n.TEXTURE_2D, 0, n.RGBA, n.RGBA, n.UNSIGNED_BYTE, t), { fontTexture: a, chars: s, textureSize: { width: r, height: h } };
}
function de(n) {
  const e = n.gl;
  e.deleteBuffer(n.positionBuffer), e.deleteBuffer(n.textureBuffer), e.deleteTexture(n.fontTexture), e.deleteProgram(n.program);
}
function me(n, e, t, i, s, r, o) {
  const h = [], a = [], c = t;
  for (const m of e) {
    if (m === `
`) {
      t = c, i += o;
      continue;
    }
    const u = n.chars.get(m);
    if (u == null)
      continue;
    if (u.width === 1) {
      t += u.metrics.width;
      continue;
    }
    const l = Math.floor(t - u.metrics.actualBoundingBoxLeft), d = Math.floor(i - u.metrics.actualBoundingBoxAscent), E = l + u.width, v = d + u.height;
    h.push(l, d), a.push(u.x, u.y), h.push(l, v), a.push(u.x, u.y + u.height), h.push(l + u.width, v), a.push(u.x + u.width, u.y + u.height), h.push(E, v), a.push(u.x + u.width, u.y + u.height), h.push(l, d), a.push(u.x, u.y), h.push(E, d), a.push(u.x + u.width, u.y), t += u.metrics.width;
  }
  const A = n.gl;
  A.useProgram(n.program), A.bindBuffer(A.ARRAY_BUFFER, n.positionBuffer), A.bufferData(A.ARRAY_BUFFER, new Float32Array(h), A.STATIC_DRAW), A.vertexAttribPointer(
    n.programUniforms.vertex,
    2,
    A.FLOAT,
    !1,
    0,
    0
  ), A.enableVertexAttribArray(n.programUniforms.vertex), A.bindBuffer(A.ARRAY_BUFFER, n.textureBuffer), A.bufferData(
    A.ARRAY_BUFFER,
    new Float32Array(a),
    A.STATIC_DRAW
  ), A.vertexAttribPointer(
    n.programUniforms.textureCoord,
    2,
    A.FLOAT,
    !1,
    0,
    0
  ), A.enableVertexAttribArray(n.programUniforms.textureCoord), A.activeTexture(A.TEXTURE0), A.bindTexture(A.TEXTURE_2D, n.fontTexture), A.uniform1i(n.programUniforms.texture, 0), A.uniform3fv(n.programUniforms.textColor, [1, 1, 1]), A.uniform3fv(n.programUniforms.backColor, [0, 0, 0]);
  function f(m, u, l) {
    const d = [];
    for (let E = 0; E < u; E++)
      for (let v = 0; v < m; v++)
        d.push(l[v * m + E]);
    return d;
  }
  A.uniformMatrix4fv(n.programUniforms.matrix, !1, f(4, 4, [
    1 / (s / 2),
    0,
    0,
    -1,
    0,
    -2 / r,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1
  ])), A.uniformMatrix3fv(n.programUniforms.uvMatrix, !1, f(3, 3, [
    1 / n.textureSize.width,
    0,
    0,
    0,
    1 / n.textureSize.height,
    0,
    0,
    0,
    1
  ])), A.viewport(0, 0, s, r), A.enable(A.BLEND), A.blendFunc(A.SRC_ALPHA, A.ONE_MINUS_SRC_ALPHA), A.drawArrays(A.TRIANGLES, 0, h.length / 2), A.disable(A.BLEND);
}
const p = {
  /** This frame's first field is the previous frame's first field. */
  firstRepeatsPrevious: 0,
  /** This frame's second field is the next frame's second field. */
  secondRepeatsNext: 1,
  /** This frame's second field is the previous frame's second field. */
  secondRepeatsPrevious: 2,
  /** The previous frame's second field was the one before's. */
  previousSecondRepeated: 3,
  /** This frame's first field is the next frame's first field. */
  firstRepeatsNext: 4,
  /** The previous frame's first field was the one before's. */
  previousFirstRepeated: 5,
  phase: 6
}, g = 7, ie = 2, O = 1, pe = 2, W = 10, Ee = {
  a: "uA",
  b: "uB",
  fieldMetrics: "uFieldMetrics",
  first: "uFirst",
  size: "uSize"
}, se = 16, re = 8, ve = `#version 300 es

precision highp float;

uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uFieldMetrics;

/** The parity of the field captured first. */
uniform int uFirst;
uniform ivec2 uSize;

layout(location = 0) out vec4 outSecond;
layout(location = 1) out vec4 outFirst;

float luma(vec3 c)
{
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 measure(float diff, float total, float threshold)
{
  diff /= total;
  return vec4(diff, diff > threshold ? 1.0 : 0.0, diff, 1.0);
}

void main()
{
  const int BLOCK_W = ${se};
  const int BLOCK_H = ${re};

  ivec2 block = ivec2(gl_FragCoord.xy);
  ivec2 base = ivec2(block.x * BLOCK_W, block.y * BLOCK_H * 2);

  // Even and odd frame lines, summed apart.
  float diffEven = 0.0;
  float diffOdd = 0.0;
  int totalEven = 0;
  int totalOdd = 0;

  for (int y = 0; y < BLOCK_H; ++y) {
    for (int x = 0; x < BLOCK_W; ++x) {
      ivec2 p = base + ivec2(x, y * 2);

      if (p.x < uSize.x && p.y < uSize.y) {
        float a = luma(texelFetch(uA, p, 0).rgb);
        float b = luma(texelFetch(uB, p, 0).rgb);

        // Ignore small compression artifacts when accumulating differences at moving edges.
        diffEven += max(abs(a - b) - 8.0 / 255.0, 0.0);
        totalEven += 1;
      }
      p.y += 1;
      if (p.x < uSize.x && p.y < uSize.y) {
        float a = luma(texelFetch(uA, p, 0).rgb);
        float b = luma(texelFetch(uB, p, 0).rgb);

        diffOdd += max(abs(a - b) - 8.0 / 255.0, 0.0);
        totalOdd += 1;
      }
    }
  }

  float run = texelFetch(uFieldMetrics, ivec2(${p.phase}, 0), 0)[1];
  float threshold = run == 0.0 ? 0.025 : (run <= 10.0 ? 0.11 : 0.15);

  vec4 even = measure(diffEven, float(totalEven), threshold);
  vec4 odd = measure(diffOdd, float(totalOdd), threshold);
  outFirst = uFirst == 0 ? even : odd;
  outSecond = uFirst == 0 ? odd : even;
}
`, be = {
  second: "uSecond",
  first: "uFirst",
  size: "uSize"
}, S = 8, ge = `#version 300 es
precision highp float;

uniform sampler2D uSecond;
uniform sampler2D uFirst;

uniform ivec2 uSize;

layout(location = 0) out vec4 outSecond;
layout(location = 1) out vec4 outFirst;

void main()
{
  ivec2 dst = ivec2(gl_FragCoord.xy);
  ivec2 base = dst * ${S};

  vec4 second = vec4(0.0);
  vec4 first = vec4(0.0);

  for (int y = 0; y < ${S}; ++y) {
    for (int x = 0; x < ${S}; ++x) {
      ivec2 p = base + ivec2(x, y);

      if (p.x < uSize.x && p.y < uSize.y) {
        vec4 value = texelFetch(uSecond, p, 0);
        second[0] = max(second[0], value[0]);
        second.yzw += value.yzw;
        value = texelFetch(uFirst, p, 0);
        first[0] = max(first[0], value[0]);
        first.yzw += value.yzw;
      }
    }
  }

  outSecond = second;
  outFirst = first;
}
`, xe = {
  previous: "uPrevious",
  second: "uSecond",
  first: "uFirst",
  size: "uSize"
}, we = `#version 300 es
precision highp float;

uniform sampler2D uPrevious;
uniform sampler2D uSecond;
uniform sampler2D uFirst;

/** The size of the reduced comparisons. */
uniform ivec2 uSize;

out vec4 outValue;

vec4 previous(int metric) {
  return texelFetch(uPrevious, ivec2(metric, 0), 0);
}

/** Fold what REDUCTION left into one texel. */
vec4 fold(sampler2D reduced) {
  vec4 sum = vec4(0.0);
  for (int y = 0; y < uSize.y; ++y) {
    for (int x = 0; x < uSize.x; ++x) {
      vec4 value = texelFetch(reduced, ivec2(x, y), 0);
      sum[0] = max(sum[0], value[0]);
      sum.yzw += value.yzw;
    }
  }
  return vec4(sum[0], sum[1], sum[2] / max(sum[3], 1.0), sum[3]);
}

bool same(float differing) {
  return differing <= ${ie}.0;
}

// A repeated field changes less than the opposite field.
// Distinguish motion shared by both fields from a still image with small absolute differences.
bool repeats(vec4 field, vec4 other) {
  return same(field[1]) &&
    (max(field[0], other[0]) < 0.025 || field[2] < other[2] * 0.75);
}

/** The phase texel, (phase, run), from the six comparisons' differing counts. */
vec4 decide(vec4 last, vec4 dFirstRepeatsPrevious, vec4 dSecondRepeatsNext,
            vec4 dSecondRepeatsPrevious, vec4 dPreviousSecondRepeated,
            vec4 dFirstRepeatsNext, vec4 dPreviousFirstRepeated)
{
  bool firstRepeatsPrevious = repeats(dFirstRepeatsPrevious, dSecondRepeatsPrevious);
  bool secondRepeatsNext = repeats(dSecondRepeatsNext, dFirstRepeatsNext);
  bool secondRepeatsPrevious = repeats(dSecondRepeatsPrevious, dFirstRepeatsPrevious);
  bool previousSecondRepeated = repeats(dPreviousSecondRepeated, dPreviousFirstRepeated);
  bool firstRepeatsNext = repeats(dFirstRepeatsNext, dSecondRepeatsNext);
  bool previousFirstRepeated = repeats(dPreviousFirstRepeated, dPreviousSecondRepeated);
  bool still = (firstRepeatsPrevious && secondRepeatsPrevious) || (secondRepeatsNext && firstRepeatsNext);

  int previous = int(last[0]);
  float run = last[1];
  // What each phase looks like: one field repeats, the other plainly does not.
  bool looks1 = firstRepeatsPrevious && !secondRepeatsPrevious;
  bool looks2 = secondRepeatsNext && !firstRepeatsNext;
  bool looks3 = secondRepeatsPrevious && !firstRepeatsPrevious;
  bool looks4 = previousSecondRepeated && !previousFirstRepeated;
  bool looks5 = firstRepeatsNext && !secondRepeatsNext;

  int expected = previous == 0 ? 0 : (previous == 5 ? 1 : previous + 1);
  bool expectedRepeat =
    expected == 1 ? firstRepeatsPrevious :
    expected == 2 ? secondRepeatsNext :
    expected == 3 ? secondRepeatsPrevious :
    expected == 4 ? previousSecondRepeated :
    expected == 5 ? firstRepeatsNext : false;
  bool expectedLooks =
    expected == 1 ? looks1 :
    expected == 2 ? looks2 :
    expected == 3 ? looks3 :
    expected == 4 ? looks4 :
    expected == 5 ? looks5 : false;
  bool believed = run >= ${W}.0;
  bool carried = believed ? expectedRepeat : expectedLooks;

  int phase = 0;
  if (expected != 0 && carried) {
    phase = expected;
    run += 1.0;
  } else if (expected != 0 && (still || expectedRepeat)) {
    // Uninformative: keeps the cycle's place, counts only once believed.
    phase = expected;
    if (believed) run += 1.0;
  } else if (looks1) {
    phase = 1;
  } else if (looks2) {
    phase = 2;
  } else if (looks3) {
    phase = 3;
  } else if (looks4) {
    phase = 4;
  } else if (looks5) {
    phase = 5;
  }
  if (phase != expected) run = phase != 0 ? 1.0 : 0.0;
  return vec4(float(phase), run, 0.0, 0.0);
}

void main()
{
  int metric = int(gl_FragCoord.x);
  // The comparisons against the next frame become, a frame later, the ones
  // against the previous frame, and those the ones before.
  if (metric == ${p.firstRepeatsPrevious}) {
    outValue = previous(${p.firstRepeatsNext});
  } else if (metric == ${p.secondRepeatsNext}) {
    outValue = fold(uSecond);
  } else if (metric == ${p.secondRepeatsPrevious}) {
    outValue = previous(${p.secondRepeatsNext});
  } else if (metric == ${p.previousSecondRepeated}) {
    outValue = previous(${p.secondRepeatsPrevious});
  } else if (metric == ${p.firstRepeatsNext}) {
    outValue = fold(uFirst);
  } else if (metric == ${p.previousFirstRepeated}) {
    outValue = previous(${p.firstRepeatsPrevious});
  } else {
    outValue = decide(
      previous(${p.phase}),
      previous(${p.firstRepeatsNext}),
      fold(uSecond),
      previous(${p.secondRepeatsNext}),
      previous(${p.secondRepeatsPrevious}),
      fold(uFirst),
      previous(${p.firstRepeatsPrevious})
    );
  }
}
`, y = 16, Te = 8, ye = {
  prev: "uPrev",
  cur: "uCur",
  first: "uFirst",
  size: "uSize"
}, Fe = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uPrev;
uniform sampler2D uCur;
/** The parity of the lines of the field captured first. */
uniform int uFirst;
uniform ivec2 uSize;

out vec4 outValue;

const float COMB = 8.0 / 255.0;

float luma(sampler2D image, int x, int y) {
  int line = y < 0 ? -y : (y >= uSize.y ? 2 * (uSize.y - 1) - y : y);
  vec3 c = texelFetch(image, ivec2(x, clamp(line, 0, uSize.y - 1)), 0).rgb;
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

bool combed(float above2, float above, float pixel, float below, float below2) {
  float d1 = pixel - above;
  float d2 = pixel - below;
  return ((d1 > COMB && d2 > COMB) || (d1 < -COMB && d2 < -COMB)) &&
    abs(above2 + 4.0 * pixel + below2 - 3.0 * (above + below)) > 6.0 * COMB;
}

void main() {
  // Block rows count from the top of the frame, as the filter reads them.
  ivec2 block = ivec2(gl_FragCoord.xy);
  ivec2 base = block * ${y};
  float standing = 0.0;
  float woven = 0.0;
  for (int dy = 0; dy < ${y}; ++dy) {
    int y = base.y + dy;
    if (y >= uSize.y || (y & 1) == uFirst) continue;
    for (int dx = 0; dx < ${y}; ++dx) {
      int x = base.x + dx;
      if (x >= uSize.x) break;
      float current = luma(uCur, x, y);
      float previous = luma(uPrev, x, y);
      if (abs(current - previous) <= COMB) continue;
      // The first field's lines either side are the same whichever second
      // field is woven between them.
      float above = luma(uCur, x, y - 1);
      float below = luma(uCur, x, y + 1);
      if (combed(luma(uCur, x, y - 2), above, current, below, luma(uCur, x, y + 2)))
        standing += 1.0;
      if (combed(luma(uPrev, x, y - 2), above, previous, below, luma(uPrev, x, y + 2)))
        woven += 1.0;
    }
  }
  outValue = vec4(standing, woven, 0.0, 0.0);
}
`, Re = {
  prev: "uPrev",
  cur: "uCur",
  next: "uNext",
  size: "uSize",
  parity: "uParity",
  tff: "uTff",
  spatialCheck: "uSpatialCheck",
  debug: "uDebug",
  film: "uFilm",
  second: "uSecond",
  phase: "uPhase",
  fieldMetrics: "uFieldMetrics",
  comb: "uComb"
}, De = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform sampler2D uNext;
uniform sampler2D uFieldMetrics;
uniform sampler2D uComb;
/** The size of a frame in texels. */
uniform ivec2 uSize;
/** The parity of the lines that are kept; the others are interpolated. */
uniform int uParity;
/** Whether the first field of a frame is its top field. */
uniform int uTff;
/** Whether the temporal bound is widened by the local vertical range. */
uniform bool uSpatialCheck;
uniform bool uDebug;
uniform bool uFilm;
uniform bool uSecond;
uniform int uPhase;

out vec4 fragColor;

/**
 * A texel, with the edges of the frame mirrored.
 *
 * The reference reflects its line offsets on the first and last line rather
 * than reading outside the frame, and this is the same thing said once.
 */
vec3 fetch(sampler2D image, int x, int y) {
  int line = y < 0 ? -y : (y >= uSize.y ? 2 * (uSize.y - 1) - y : y);
  return texelFetch(image, ivec2(clamp(x, 0, uSize.x - 1), clamp(line, 0, uSize.y - 1)), 0).rgb;
}

/**
 * Interpolate the missing line along whichever direction the picture runs in.
 *
 * a..g are the seven texels of the line above and h..n those of the line
 * below, both centred on the pixel being built. The straight vertical average
 * is the starting point, and each candidate direction is taken only if the
 * three differences across it are smaller than the best so far; the steeper
 * pair of directions is only considered when the shallower one was an
 * improvement, which is what keeps a busy picture from finding an edge that is
 * not there.
 */
vec3 spatialPredictor(vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, vec3 f, vec3 g,
                      vec3 h, vec3 i, vec3 j, vec3 k, vec3 l, vec3 m, vec3 n) {
  vec3 pred = (d + k) * 0.5;
  vec3 best = abs(c - j) + abs(d - k) + abs(e - l);

  vec3 score = abs(b - k) + abs(c - l) + abs(d - m);
  vec3 taken = vec3(lessThan(score, best));
  pred = mix(pred, (c + l) * 0.5, taken);
  best = mix(best, score, taken);

  score = abs(a - l) + abs(b - m) + abs(c - n);
  taken *= vec3(lessThan(score, best));
  pred = mix(pred, (b + m) * 0.5, taken);
  best = mix(best, score, taken);

  score = abs(d - i) + abs(e - j) + abs(f - k);
  taken = vec3(lessThan(score, best));
  pred = mix(pred, (e + j) * 0.5, taken);
  best = mix(best, score, taken);

  score = abs(e - h) + abs(f - i) + abs(g - j);
  taken *= vec3(lessThan(score, best));
  pred = mix(pred, (f + i) * 0.5, taken);

  return pred;
}

/**
 * Hold the spatial guess to what the moving picture allows.
 *
 * p2 is where the line would be if nothing moved -- the average of the same
 * line in the two frames that bracket this moment -- and the three temporal
 * differences say how much did move. The spatial guess is then clamped to that
 * distance from p2: still picture, and the answer is the line that is really
 * there; motion, and the interpolation is free to take over.
 */
vec3 temporalPredictor(vec3 A, vec3 B, vec3 C, vec3 D, vec3 E, vec3 F,
                       vec3 G, vec3 H, vec3 I, vec3 J, vec3 K, vec3 L,
                       vec3 spatialPred, bool skipCheck) {
  vec3 p0 = (C + H) * 0.5;
  vec3 p1 = F;
  vec3 p2 = (D + I) * 0.5;
  vec3 p3 = G;
  vec3 p4 = (E + J) * 0.5;

  vec3 tdiff0 = abs(D - I) * 0.5;
  vec3 tdiff1 = (abs(A - F) + abs(B - G)) * 0.5;
  vec3 tdiff2 = (abs(K - F) + abs(G - L)) * 0.5;

  vec3 diff = max(tdiff0, max(tdiff1, tdiff2));

  if (!skipCheck) {
    vec3 hi = max(p2 - p3, max(p2 - p1, min(p0 - p1, p4 - p3)));
    vec3 lo = min(p2 - p3, min(p2 - p1, max(p0 - p1, p4 - p3)));
    diff = max(diff, max(lo, -hi));
  }

  return clamp(spatialPred, p2 - diff, p2 + diff);
}

/**
 * Build one interpolated pixel.
 *
 * prev2 and next2 are the frames the missing line is bracketed by, which is
 * not the same pair as prev and next: the field being rebuilt is half a frame
 * from one of its neighbours and one and a half from the other, and it is the
 * near pair that says what the picture looked like around this moment. prev
 * and next themselves are still read, for the two motion measurements.
 */
vec3 filterPixel(sampler2D prev2, sampler2D next2, int x, int y) {
  vec3 a = fetch(uCur, x - 3, y - 1);
  vec3 b = fetch(uCur, x - 2, y - 1);
  vec3 c = fetch(uCur, x - 1, y - 1);
  vec3 d = fetch(uCur, x, y - 1);
  vec3 e = fetch(uCur, x + 1, y - 1);
  vec3 f = fetch(uCur, x + 2, y - 1);
  vec3 g = fetch(uCur, x + 3, y - 1);

  vec3 h = fetch(uCur, x - 3, y + 1);
  vec3 i = fetch(uCur, x - 2, y + 1);
  vec3 j = fetch(uCur, x - 1, y + 1);
  vec3 k = fetch(uCur, x, y + 1);
  vec3 l = fetch(uCur, x + 1, y + 1);
  vec3 m = fetch(uCur, x + 2, y + 1);
  vec3 n = fetch(uCur, x + 3, y + 1);

  // Within three texels of either side there is no room to look along an edge,
  // so the reference takes the vertical average there and so does this.
  bool interior = x >= 3 && x + 3 < uSize.x;
  vec3 spatialPred = interior ? spatialPredictor(a, b, c, d, e, f, g, h, i, j, k, l, m, n)
                              : (d + k) * 0.5;

  vec3 A = fetch(uPrev, x, y - 1);
  vec3 B = fetch(uPrev, x, y + 1);
  vec3 C = fetch(prev2, x, y - 2);
  vec3 D = fetch(prev2, x, y);
  vec3 E = fetch(prev2, x, y + 2);
  vec3 F = d;
  vec3 G = k;
  vec3 H = fetch(next2, x, y - 2);
  vec3 I = fetch(next2, x, y);
  vec3 J = fetch(next2, x, y + 2);
  vec3 K = fetch(uNext, x, y - 1);
  vec3 L = fetch(uNext, x, y + 1);

  // The first and last line the filter builds have only one line of picture
  // outside them, so the range the spatial check would be measured over is not
  // there. The reference drops the check on those two lines.
  bool skipCheck = !uSpatialCheck || y < 2 || y + 2 >= uSize.y;
  return temporalPredictor(A, B, C, D, E, F, G, H, I, J, K, L, spatialPred, skipCheck);
}

int firstParity() {
  return uTff != 0 ? 0 : 1;
}

bool same(int metric) {
  return texelFetch(uFieldMetrics, ivec2(metric, 0), 0)[1] <= ${ie}.0;
}

/** The pulldown phase the detection gave this frame, or 0. See film-shader.ts. */
int detectedPhase() {
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${p.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${W}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${O} || phase == ${pe};
}

/** Detect new combing in phase 4, whose cadence is inferred from previous repeats. */
bool movingComb(vec3 pixel, int x, int y) {
  vec3 above = fetch(uCur, x, y - 1);
  vec3 below = fetch(uCur, x, y + 1);
  vec3 comb = max(min(above, below) - pixel, pixel - max(above, below));
  // Phase 3 is a complete film frame, so use its vertical detail as the reference.
  // Preserve existing horizontal lines and interpolate only pixels with new combing.
  vec3 previous = fetch(uPrev, x, y);
  vec3 previousAbove = fetch(uPrev, x, y - 1);
  vec3 previousBelow = fetch(uPrev, x, y + 1);
  vec3 previousComb = max(min(previousAbove, previousBelow) - previous,
                          previous - max(previousAbove, previousBelow));
  return any(greaterThan(comb, max(previousComb, vec3(0.0)) + vec3(8.0 / 255.0)));
}

const int DEBUG_BAR_CELL = 32;
const int DEBUG_BAR_WIDTH = DEBUG_BAR_CELL * 7;
const int DEBUG_BAR_HEIGHT = 16;

vec3 debugBar(int x) {
  int cell = x / DEBUG_BAR_CELL;
  bool lit = x % DEBUG_BAR_CELL >= DEBUG_BAR_CELL - 4;
  if (cell == 6) return lit || uSecond ? vec3(1.0, 0.0, 0.0) : vec3(0.0);
  return lit || same(cell) ? vec3(1.0) : vec3(0.0);
}

const int DIGIT_WIDTH = 24;
const int DIGIT_HEIGHT = 60;

bool digitLit(int digit, int x, int y) {
  bool a = y < 20;
  bool b = x >= 20 && y < 40;
  bool c = x >= 20 && y >= 40;
  bool d = y >= 56;
  bool e = x < 4 && y >= 40;
  bool f = x < 4 && y < 40;
  bool g = y >= 36 && y < 40;
  switch (digit) {
    case 1: return b || c;
    case 2: return a || b || d || e || g;
    case 3: return a || b || c || d || g;
    case 4: return b || c || f || g;
    case 5: return a || c || d || f || g;
    default: return false;
  }
}

void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  int x = at.x;
  // The framebuffer counts its rows from the bottom and a frame from the top.
  int y = uSize.y - 1 - at.y;

  vec3 rgb;
  if (uFilm && uDebug && y < DEBUG_BAR_HEIGHT && x < DEBUG_BAR_WIDTH) {
    rgb = debugBar(x);
  } else if (uFilm && uDebug && x < DIGIT_WIDTH && y < DIGIT_HEIGHT && uPhase > 0) {
    rgb = digitLit(uPhase, x, y) ? vec3(1.0, 0.0, 0.0) : vec3(0.0);
  } else if (uFilm && !uSecond && detectedPhase() != 0) {
    bool mixed = isMixedPhase(detectedPhase());
    rgb = mixed && (y & 1) != firstParity()
      ? texelFetch(uPrev, ivec2(x, y), 0).rgb
      : texelFetch(uCur, ivec2(x, y), 0).rgb;
    // A block the weave would leave combed -- a cut, a fade or a telop that
    // does not follow the cadence -- is filtered like video instead.
    vec4 comb = texelFetch(uComb, ivec2(x / ${y}, y / ${y}), 0);
    bool combedBlock = (mixed ? comb[1] : comb[0]) > ${Te}.0;
    if ((y & 1) != uParity &&
        (combedBlock || (detectedPhase() == 4 && movingComb(rgb, x, y))))
      rgb = filterPixel(uPrev, uCur, x, y);
  } else if ((y & 1) == uParity) {
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
  } else if ((uParity ^ uTff) != 0) {
    // The first field of the frame: the moment it holds sits between the
    // previous frame and the second field of this one.
    rgb = filterPixel(uPrev, uCur, x, y);
  } else {
    rgb = filterPixel(uCur, uNext, x, y);
  }
  fragColor = vec4(rgb, 1.0);
}
`, x = { phase: 0, run: 0 };
function C(n, e, t) {
  return Object.fromEntries(
    Object.entries(t).map(([i, s]) => [
      i,
      n.getUniformLocation(e, s)
    ])
  );
}
class V {
  #t;
  #i;
  #e;
  #n;
  #u;
  #o;
  #s;
  #A;
  #c;
  /** The block comparisons of both fields, and the same folded most of the way. */
  #r = null;
  #T = null;
  /** Combed pixels per block of the frame being filtered, both ways of weaving it. */
  #v = null;
  /** The field metrics (see FIELD_METRICS) of this frame and the one before. */
  #p = null;
  /** Which of the two holds the newest metrics. */
  #E = 0;
  /** The metrics being read back asynchronously. */
  #a = null;
  #l = null;
  #h = 0;
  #f = 0;
  /** The last metrics read back, laid out as FIELD_METRICS says. */
  metrics = new Float32Array(g * 4);
  #d = 0;
  #F = 0;
  constructor(e) {
    this.#t = e, this.#i = R(
      e,
      ve,
      _
    ), this.#e = C(
      e,
      this.#i,
      Ee
    ), this.#n = R(
      e,
      ge,
      _
    ), this.#u = C(
      e,
      this.#n,
      be
    ), this.#o = R(
      e,
      we,
      _
    ), this.#s = C(e, this.#o, xe), this.#A = R(e, Fe, _), this.#c = C(e, this.#A, ye);
  }
  /** The newest measurements, or null before any frame has been measured. */
  get texture() {
    return this.#p?.[this.#E]?.textures[0] ?? null;
  }
  /**
   * Combed pixels per block of the frame last measured by `measureComb`, or
   * null before one has been. See COMB_FRAGMENT_SHADER.
   */
  get combTexture() {
    return this.#v?.textures[0] ?? null;
  }
  /** The size of the frames to be measured, which sizes the block grid. */
  resize(e, t) {
    e === this.#d && t === this.#F || (this.#d = e, this.#F = t, this.#x());
  }
  /** Forget every measurement: the next frame starts a cycle from nothing. */
  reset() {
    const e = this.#t;
    e.deleteSync(this.#l), this.#l = null, this.#h = 0;
    const t = this.#p?.[this.#E];
    if (!t) return;
    const i = new Float32Array(g * 4);
    for (let s = 0; s < p.phase; s++)
      i[s * 4 + 1] = 1;
    e.bindTexture(e.TEXTURE_2D, t.textures[0] ?? null), e.texSubImage2D(
      e.TEXTURE_2D,
      0,
      0,
      0,
      g,
      1,
      e.RGBA,
      e.FLOAT,
      i
    );
  }
  /**
   * Detect the pulldown phase of `cur`, the frame being filtered, against
   * `next`, and start reading it back. Only the two comparisons against the
   * next frame are measured; the rest are earlier ones moved along a frame.
   * `first` is the parity of the field that was captured first.
   */
  detect(e, t, i) {
    const s = this.#t;
    if (this.#d === 0 || this.#F === 0) return;
    this.#V();
    const r = this.#r, o = this.#T, h = this.#p;
    if (r === null || o === null || h === null) return;
    const a = h[this.#E], c = h[1 - this.#E];
    if (s.bindFramebuffer(s.FRAMEBUFFER, r.framebuffer), s.useProgram(this.#i), this.#m(0, e, this.#e.a), this.#m(1, t, this.#e.b), this.#m(2, a.textures[0], this.#e.fieldMetrics), s.uniform1i(this.#e.first, i), s.uniform2i(this.#e.size, this.#d, this.#F), s.viewport(0, 0, r.width, r.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, o.framebuffer), s.useProgram(this.#n), this.#m(0, r.textures[0], this.#u.second), this.#m(1, r.textures[1], this.#u.first), s.uniform2i(this.#u.size, r.width, r.height), s.viewport(0, 0, o.width, o.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, c.framebuffer), s.useProgram(this.#o), this.#m(0, a.textures[0], this.#s.previous), this.#m(1, o.textures[0], this.#s.second), this.#m(2, o.textures[1], this.#s.first), s.uniform2i(this.#s.size, o.width, o.height), s.viewport(0, 0, g, 1), s.drawArrays(s.TRIANGLES, 0, 3), this.#E = 1 - this.#E, this.#h++, this.#l !== null) {
      s.bindFramebuffer(s.FRAMEBUFFER, null);
      return;
    }
    this.#f = this.#h, s.bindBuffer(s.PIXEL_PACK_BUFFER, this.#a), s.readPixels(0, 0, g, 1, s.RGBA, s.FLOAT, 0), s.bindBuffer(s.PIXEL_PACK_BUFFER, null), s.bindFramebuffer(s.FRAMEBUFFER, null), this.#l = s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE, 0), s.flush();
  }
  /**
   * Count the combing each way of weaving `cur`, the frame being filtered,
   * would leave: as it stands, and with `prev`'s second field. `first` is the
   * parity of the field that was captured first.
   */
  measureComb(e, t, i) {
    const s = this.#t;
    if (this.#d === 0 || this.#F === 0) return;
    this.#V();
    const r = this.#v;
    r !== null && (s.bindFramebuffer(s.FRAMEBUFFER, r.framebuffer), s.useProgram(this.#A), this.#m(0, e, this.#c.prev), this.#m(1, t, this.#c.cur), s.uniform1i(this.#c.first, i), s.uniform2i(this.#c.size, this.#d, this.#F), s.viewport(0, 0, r.width, r.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, null));
  }
  /**
   * The phase of the last frame measured, once the GPU has handed it back,
   * and null while it is still on its way. It is handed back once.
   */
  poll() {
    const e = this.#t, t = this.#l;
    if (t === null || this.#a === null) return null;
    switch (e.clientWaitSync(t, 0, 0)) {
      case e.ALREADY_SIGNALED:
      case e.CONDITION_SATISFIED:
        return e.bindBuffer(e.PIXEL_PACK_BUFFER, this.#a), e.getBufferSubData(e.PIXEL_PACK_BUFFER, 0, this.metrics), e.bindBuffer(e.PIXEL_PACK_BUFFER, null), e.deleteSync(t), this.#l = null, {
          phase: this.metrics[p.phase * 4] ?? 0,
          run: this.metrics[p.phase * 4 + 1] ?? 0,
          age: this.#h - this.#f
        };
      default:
        return null;
    }
  }
  destroy() {
    const e = this.#t;
    if (this.#x(), this.#p !== null) {
      for (const t of this.#p) M(e, t);
      this.#p = null;
    }
    e.deleteSync(this.#l), this.#l = null, e.deleteBuffer(this.#a), this.#a = null, e.deleteProgram(this.#i), e.deleteProgram(this.#n), e.deleteProgram(this.#o), e.deleteProgram(this.#A);
  }
  #m(e, t, i) {
    const s = this.#t;
    s.activeTexture(s.TEXTURE0 + e), s.bindTexture(s.TEXTURE_2D, t ?? null), s.uniform1i(i, e);
  }
  #x() {
    const e = this.#t;
    this.#r !== null && M(e, this.#r), this.#T !== null && M(e, this.#T), this.#v !== null && M(e, this.#v), this.#r = null, this.#T = null, this.#v = null;
  }
  /** Everything detect needs that is not there yet. */
  #V() {
    const e = this.#t;
    if (this.#r === null || this.#T === null || this.#v === null) {
      this.#x();
      const t = Math.ceil(this.#d / se), i = Math.ceil(this.#F / (re * 2));
      this.#r = D(e, t, i, 2), this.#T = D(
        e,
        Math.ceil(t / S),
        Math.ceil(i / S),
        2
      ), this.#v = D(
        e,
        Math.ceil(this.#d / y),
        Math.ceil(this.#F / y),
        1
      );
    }
    this.#p === null && (this.#p = [
      D(e, g, 1, 1),
      D(e, g, 1, 1)
    ], this.#E = 0, this.reset()), this.#a === null && (this.#a = e.createBuffer(), e.bindBuffer(e.PIXEL_PACK_BUFFER, this.#a), e.bufferData(
      e.PIXEL_PACK_BUFFER,
      this.metrics.byteLength,
      e.STREAM_COPY
    ), e.bindBuffer(e.PIXEL_PACK_BUFFER, null));
  }
}
function D(n, e, t, i) {
  const s = n.createFramebuffer();
  n.bindFramebuffer(n.FRAMEBUFFER, s);
  const r = [];
  for (let a = 0; a < i; a++) {
    const c = n.createTexture();
    n.bindTexture(n.TEXTURE_2D, c), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MIN_FILTER, n.NEAREST), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MAG_FILTER, n.NEAREST), n.texImage2D(
      n.TEXTURE_2D,
      0,
      n.RGBA32F,
      e,
      t,
      0,
      n.RGBA,
      n.FLOAT,
      null
    ), n.framebufferTexture2D(
      n.FRAMEBUFFER,
      n.COLOR_ATTACHMENT0 + a,
      n.TEXTURE_2D,
      c,
      0
    ), r.push(c);
  }
  n.drawBuffers(r.map((a, c) => n.COLOR_ATTACHMENT0 + c));
  const o = n.checkFramebufferStatus(n.FRAMEBUFFER) === n.FRAMEBUFFER_COMPLETE;
  n.bindFramebuffer(n.FRAMEBUFFER, null);
  const h = { framebuffer: s, textures: r, width: e, height: t };
  if (!o)
    throw M(n, h), new Error("failed to allocate framebuffer");
  return h;
}
function M(n, { framebuffer: e, textures: t }) {
  n.deleteFramebuffer(e);
  for (const i of t) n.deleteTexture(i);
}
function T(n, e = 0, t = n.length) {
  const i = new DataView(n.buffer, n.byteOffset, n.byteLength), s = [];
  for (let r = e; r < t; ) {
    if (r + 8 > t) throw new Error("Incomplete MP4 box");
    const o = i.getUint32(r);
    if (o < 8 || r + o > t) throw new Error("Invalid MP4 box size");
    s.push({
      type: String.fromCharCode(...n.subarray(r + 4, r + 8)),
      start: r,
      body: r + 8,
      end: r + o
    }), r += o;
  }
  return s;
}
function _e(n, e) {
  for (const t of T(n, e.body, e.end).filter(
    (i) => i.type === "trak"
  )) {
    let i = t;
    for (const s of ["mdia", "minf", "stbl", "stsd"]) {
      const r = T(n, i.body, i.end).find(
        (o) => o.type === s
      );
      if (!r) break;
      i = r;
    }
    if (i.type === "stsd")
      for (const s of T(n, i.body + 8, i.end)) {
        if (s.type !== "avc1") continue;
        const r = T(n, s.body + 78, s.end).find(
          (a) => a.type === "avcC"
        );
        if (!r) throw new Error("AVC sample entry has no avcC");
        const o = n.slice(r.body, r.end);
        return { codec: "avc1." + Array.from(o.subarray(1, 4)).map((a) => a.toString(16).padStart(2, "0")).join(""), description: o };
      }
  }
  return null;
}
class Me {
  #t;
  #i = null;
  #e = null;
  /** Compressed frames within the MSE buffer, retained at normal speed for seeks and later accelerated playback. */
  #n = [];
  #u = 0;
  #o = null;
  #s = [];
  /** Timestamps of one-tick duplicate pictures needed only as open-GOP decoding references. */
  #A = /* @__PURE__ */ new Set();
  #c = !1;
  #r = !1;
  #T = !1;
  #v = !1;
  #p = !1;
  #E = /* @__PURE__ */ new WeakMap();
  constructor(e) {
    this.#t = e, e.addEventListener("seeking", this.#l), e.addEventListener("ratechange", this.#l);
  }
  get active() {
    return this.#v;
  }
  /** Receive input in MSE append order; the caller retains ownership of the original ArrayBuffer. */
  append(e) {
    if (this.#T) return;
    const t = new Uint8Array(e), i = new DataView(e);
    try {
      for (const r of T(t)) {
        if (r.type === "moov") {
          this.#i = _e(t, r);
          const o = this.#i;
          o && VideoDecoder.isConfigSupported(o).then((h) => {
            this.#E.set(o, h.supported === !0);
          }).catch((h) => this.#h(h));
        }
        if (!(r.type !== "moof" || this.#i === null))
          for (const o of T(t, r.body, r.end).filter(
            (h) => h.type === "traf"
          )) {
            const h = T(t, o.body, o.end), a = h.find((l) => l.type === "tfhd");
            if (!a || i.getUint32(a.body + 4) !== 1) continue;
            const c = h.find((l) => l.type === "tfdt"), A = h.find((l) => l.type === "trun");
            if (!c || !A || i.getUint32(c.body) !== 16777216 || i.getUint32(A.body) !== 16781057)
              throw new Error("Unexpected mpeg2toh264 video fragment layout");
            let f = Number(i.getBigUint64(c.body + 4)), m = r.start + i.getInt32(A.body + 8);
            const u = i.getUint32(A.body + 4);
            if (A.body + 12 + u * 16 > A.end)
              throw new Error("Incomplete video samples");
            for (let l = 0; l < u; l++) {
              const d = A.body + 12 + l * 16, E = i.getUint32(d), v = i.getUint32(d + 4), U = i.getUint32(d + 8), Ae = i.getInt32(d + 12);
              if (m < 0 || m + v > t.length)
                throw new Error("Video sample outside fragment");
              this.#n.push({
                config: this.#i,
                decodeTime: f / 9e4,
                timestamp: Math.round((f + Ae) * 1e6 / 9e4),
                duration: Math.round(E * 1e6 / 9e4),
                type: U & 65536 ? "delta" : "key",
                data: t.subarray(m, m + v)
              }), f += E, m += v;
            }
          }
      }
      const s = this.#t.buffered;
      if (s.length > 0) {
        let r = 0;
        for (let o = 0; o < (this.#v ? this.#u : this.#n.length); o++) {
          const h = this.#n[o];
          h.type === "key" && h.timestamp / 1e6 <= s.start(0) && (r = o);
        }
        r > 0 && (this.#n.splice(0, r), this.#u = Math.max(0, this.#u - r));
      }
    } catch (s) {
      this.#h(s);
    }
  }
  /** Return undefined to use the video element, or null to wait for the next decoded frame. */
  take() {
    if (this.#T || this.#t.playbackRate <= 1.25 || this.#i === null || this.#E.get(this.#i) !== !0) {
      this.#v && this.#l();
      return;
    }
    this.#v || (this.#l(), this.#v = !0);
    const e = this.#t.currentTime;
    try {
      for (; this.#u < this.#n.length && (this.#o?.decodeQueueSize ?? 0) < 6 && this.#s.length < 12; ) {
        const i = this.#n[this.#u];
        if (i.decodeTime > e + 0.25) break;
        if (this.#e !== i.config) {
          if (this.#o) {
            if (!this.#r) {
              this.#r = !0;
              const r = this.#o;
              r.flush().then(() => {
                this.#o === r && (r.close(), this.#o = null, this.#e = null, this.#r = !1);
              }).catch((o) => {
                this.#o === r && this.#h(o);
              });
            }
            break;
          }
          const s = new VideoDecoder({
            output: (r) => {
              this.#o !== s ? r.close() : this.#a(r);
            },
            error: (r) => {
              this.#o === s && this.#h(r);
            }
          });
          this.#o = s, this.#o.configure(i.config), this.#e = i.config;
        }
        (i.duration ?? 0) < 1e3 && this.#A.add(i.timestamp), this.#o.decode(new EncodedVideoChunk(i)), this.#u++;
      }
      if (this.#c && this.#u === this.#n.length && this.#o && !this.#r) {
        this.#r = !0;
        const i = this.#o;
        i.flush().catch((s) => {
          this.#o === i && this.#h(s);
        });
      }
    } catch (i) {
      this.#h(i);
      return;
    }
    const t = this.#s[0];
    return !t || t.timestamp / 1e6 > e + 3e-3 * this.#t.playbackRate ? this.#p ? null : void 0 : (this.#p = !0, this.#s.shift());
  }
  #a = (e) => {
    this.#A.delete(e.timestamp) || e.timestamp / 1e6 < this.#t.currentTime - (this.#p ? 0.1 : 0.04) ? e.close() : this.#s.push(e);
  };
  #l = () => {
    this.#o && this.#o.state !== "closed" && this.#o.close(), this.#o = null, this.#e = null;
    for (const e of this.#s) e.close();
    this.#s = [], this.#A.clear(), this.#r = !1, this.#v = !1, this.#p = !1, this.#u = 0;
    for (let e = 0; e < this.#n.length; e++) {
      const t = this.#n[e];
      t.type === "key" && t.timestamp / 1e6 <= this.#t.currentTime && (this.#u = e);
    }
  };
  finish() {
    this.#c = !0;
  }
  /** Release the decoder and undisplayed frames while the filter is stopped. */
  suspend() {
    this.#l();
  }
  reset() {
    this.#l(), this.#n = [], this.#u = 0, this.#i = null, this.#c = !1, this.#T = !1;
  }
  destroy() {
    this.reset(), this.#t.removeEventListener("seeking", this.#l), this.#t.removeEventListener("ratechange", this.#l);
  }
  #h(e) {
    this.#l(), this.#T = !0, console.warn("mpeg2toh264: decoded video input unavailable", e);
  }
}
const P = 16, Se = 6, Pe = `#version 300 es
precision highp float;
uniform sampler2D uTake;
uniform sampler2D uReference;
out vec4 fragColor;

void main() {
  // The sizes are compared here as well as by the caller, which knows them
  // only from the element: that can disagree with the picture actually
  // uploaded for a moment when the stream changes resolution.
  if (textureSize(uTake, 0) != textureSize(uReference, 0)) {
    fragColor = vec4(1.0);
    return;
  }
  // Every texel is read, so a picture that differs anywhere is seen to differ.
  // The cells at the right and bottom edges read their last texels again.
  ivec2 last = textureSize(uTake, 0) - 1;
  ivec2 origin = ivec2(gl_FragCoord.xy) * ${P};
  vec3 difference = vec3(0.0);
  for (int y = 0; y < ${P}; y++) {
    for (int x = 0; x < ${P}; x++) {
      ivec2 at = min(origin + ivec2(x, y), last);
      difference = max(
        difference,
        abs(texelFetch(uTake, at, 0).rgb - texelFetch(uReference, at, 0).rgb)
      );
    }
  }
  fragColor = vec4(difference, 1.0);
}
`;
class Ce {
  #t;
  #i;
  #e = null;
  #n = null;
  /** Textures free to take the next picture. */
  #u = [];
  #o = 0;
  /** Readback buffers free for the next comparison. */
  #s = [];
  #A = new Uint8Array(0);
  /** Takes in order, from the oldest still held. */
  #c = [];
  /** The newest take, which the next one is compared with. */
  #r = null;
  #T = 0;
  constructor(e, t) {
    this.#t = e, this.#i = t;
  }
  take() {
    const e = this.#t, t = this.#u.pop() ?? this.#a();
    if (t === null) return null;
    const i = this.#i.videoWidth, s = this.#i.videoHeight;
    e.bindTexture(e.TEXTURE_2D, t);
    try {
      e.texImage2D(
        e.TEXTURE_2D,
        0,
        e.RGBA,
        e.RGBA,
        e.UNSIGNED_BYTE,
        this.#i
      );
    } catch (h) {
      throw this.#u.push(t), h;
    }
    const r = {
      id: ++this.#T,
      texture: t,
      width: i,
      height: s,
      changed: null,
      fence: null,
      buffer: null,
      reported: !1
    }, o = this.#r;
    return o === null || o.width !== i || o.height !== s ? r.changed = !0 : this.#v(r, o), this.#r = r, this.#c.push(r), r.id;
  }
  settle() {
    const e = this.#t, t = this.#c.find((i) => !i.reported);
    if (t === void 0 || t === this.#r) return null;
    if (t.changed === null) {
      const { fence: i, buffer: s } = t;
      if (i === null || s === null) return null;
      const r = e.clientWaitSync(i, 0, 0);
      if (r !== e.ALREADY_SIGNALED && r !== e.CONDITION_SATISFIED)
        return null;
      this.#A.byteLength < s.bytes && (this.#A = new Uint8Array(s.bytes));
      const o = this.#A.subarray(0, s.bytes);
      e.bindBuffer(e.PIXEL_PACK_BUFFER, s.buffer), e.getBufferSubData(e.PIXEL_PACK_BUFFER, 0, o), e.bindBuffer(e.PIXEL_PACK_BUFFER, null), t.changed = Be(o), this.#p(t);
    }
    return t.reported = !0, { id: t.id, changed: t.changed };
  }
  /**
   * Hand the texture of a take to the caller in exchange for one it no longer
   * needs, which becomes free for a later take.
   */
  adopt(e, t) {
    const i = this.#c.findIndex((r) => r.id === e), s = this.#c[i];
    if (s === void 0 || !s.reported)
      throw new Error(`picture ${e} is not available to adopt`);
    return this.#c.splice(i, 1), this.#u.push(t), s.texture;
  }
  release(e) {
    const t = this.#c.findIndex((s) => s.id === e), i = this.#c[t];
    i !== void 0 && (this.#c.splice(t, 1), this.#E(i));
  }
  reset() {
    const e = this.#c;
    this.#c = [], this.#r = null;
    for (const t of e)
      this.#p(t), this.#E(t);
  }
  destroy() {
    const e = this.#t;
    this.reset();
    for (const t of this.#u) e.deleteTexture(t);
    this.#u = [], this.#o = 0;
    for (const { buffer: t } of this.#s) e.deleteBuffer(t);
    this.#s = [], this.#f(), this.#e !== null && e.deleteProgram(this.#e), this.#e = null;
  }
  /** Draw the comparison of a take with the one before it and start its readback. */
  #v(e, t) {
    const i = this.#t, s = Math.ceil(e.width / P), r = Math.ceil(e.height / P), o = this.#h(s, r), h = this.#d(s * r * 4);
    this.#e ??= this.#l(), i.bindFramebuffer(i.FRAMEBUFFER, o.framebuffer), i.useProgram(this.#e), i.activeTexture(i.TEXTURE1), i.bindTexture(i.TEXTURE_2D, t.texture), i.activeTexture(i.TEXTURE0), i.bindTexture(i.TEXTURE_2D, e.texture), i.viewport(0, 0, s, r), i.drawArrays(i.TRIANGLES, 0, 3), i.bindBuffer(i.PIXEL_PACK_BUFFER, h.buffer), i.readPixels(0, 0, s, r, i.RGBA, i.UNSIGNED_BYTE, 0), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), i.bindFramebuffer(i.FRAMEBUFFER, null), e.fence = i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE, 0), e.buffer = h, i.flush();
  }
  /** Give back what a comparison held, whether or not it was read. */
  #p(e) {
    const t = this.#t;
    e.fence !== null && t.deleteSync(e.fence), e.fence = null;
    const i = e.buffer;
    if (e.buffer = null, i === null) return;
    const s = this.#n;
    s !== null && i.bytes === s.width * s.height * 4 ? this.#s.push(i) : t.deleteBuffer(i.buffer);
  }
  /**
   * Free the texture of a take that has left. By then a later take has
   * replaced it as the reference, and the comparison that read it is issued.
   */
  #E(e) {
    this.#u.push(e.texture);
  }
  #a() {
    if (this.#o === Se) return null;
    const e = this.#t, t = e.createTexture();
    return e.bindTexture(e.TEXTURE_2D, t), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), this.#o++, t;
  }
  #l() {
    const e = this.#t, t = R(e, Pe, _);
    return e.useProgram(t), e.uniform1i(e.getUniformLocation(t, "uTake"), 0), e.uniform1i(e.getUniformLocation(t, "uReference"), 1), t;
  }
  #h(e, t) {
    const i = this.#t, s = this.#n;
    if (s?.width === e && s.height === t) return s;
    this.#f();
    for (const { buffer: a } of this.#s) i.deleteBuffer(a);
    this.#s = [];
    const r = i.createTexture();
    i.bindTexture(i.TEXTURE_2D, r), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_MIN_FILTER, i.NEAREST), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_MAG_FILTER, i.NEAREST), i.texImage2D(
      i.TEXTURE_2D,
      0,
      i.RGBA8,
      e,
      t,
      0,
      i.RGBA,
      i.UNSIGNED_BYTE,
      null
    );
    const o = i.createFramebuffer();
    i.bindFramebuffer(i.FRAMEBUFFER, o), i.framebufferTexture2D(
      i.FRAMEBUFFER,
      i.COLOR_ATTACHMENT0,
      i.TEXTURE_2D,
      r,
      0
    ), i.bindFramebuffer(i.FRAMEBUFFER, null);
    const h = { framebuffer: o, texture: r, width: e, height: t };
    return this.#n = h, h;
  }
  #f() {
    const e = this.#t;
    this.#n !== null && (e.deleteFramebuffer(this.#n.framebuffer), e.deleteTexture(this.#n.texture), this.#n = null);
  }
  #d(e) {
    const t = this.#s.pop();
    if (t !== void 0) return t;
    const i = this.#t, s = i.createBuffer();
    return i.bindBuffer(i.PIXEL_PACK_BUFFER, s), i.bufferData(i.PIXEL_PACK_BUFFER, e, i.STREAM_COPY), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), { buffer: s, bytes: e };
  }
}
function Be(n) {
  for (let e = 0; e < n.length; e += 4)
    if (n[e] !== 0 || n[e + 1] !== 0 || n[e + 2] !== 0)
      return !0;
  return !1;
}
const ne = [
  "mozParsedFrames",
  "mozDecodedFrames",
  "mozPresentedFrames",
  "mozPaintedFrames"
];
function oe(n) {
  return ne.every((e) => e in n);
}
function ke(n) {
  return n.ownerDocument?.defaultView?.performance.timeOrigin ?? performance.timeOrigin;
}
function Le() {
  return typeof HTMLVideoElement < "u" && (oe(HTMLVideoElement.prototype) || typeof HTMLVideoElement.prototype.requestVideoFrameCallback == "function");
}
const Ue = 250, I = 500, Ie = 1.75, Ne = 3, Ge = 200;
class Oe {
  #t;
  #i;
  #e;
  #n;
  /** The watch the takes below belong to. */
  #u = null;
  /** Takes awaiting their verdict, oldest first. */
  #o = [];
  /** Frames counted on the watched path, standing in for `presentedFrames`. */
  #s = 0;
  #A = null;
  /** Unchanged verdicts in a row on takes made at rest. */
  #c = 0;
  /** When the take last delivered was made, and the painted count then. */
  #r = null;
  #T = null;
  #v = null;
  #p = null;
  #E = null;
  #a = null;
  #l = !0;
  #h = null;
  #f = null;
  #d = 0;
  #F;
  #m;
  #x = null;
  #V = null;
  #M = null;
  #N = null;
  #xe = 0;
  #H = [];
  #O = [];
  constructor(e, t, i) {
    if (this.#t = e, this.#i = t, this.#n = i, this.#e = oe(e) ? e : null, this.#F = this.#e === null && typeof VideoFrame < "u", this.#m = this.#F && e.playbackRate > 1, this.#e) {
      for (const s of ["emptied", "seeking", "seeked"])
        e.addEventListener(s, this.#X);
      for (const s of ["pause", "playing", "waiting", "ratechange"])
        e.addEventListener(s, this.#G);
    }
    if (this.#F)
      for (const s of [
        "loadeddata",
        "playing",
        "pause",
        "ended",
        "seeking",
        "seeked",
        "emptied",
        "ratechange"
      ])
        e.addEventListener(s, this.#P);
  }
  /** Whether acquisition uses the captured pictures' own timestamps. */
  get captureDriven() {
    return this.#m;
  }
  request(e) {
    if (this.#p === null) {
      if (this.#p = e, this.#m) {
        this.#k();
        return;
      }
      this.#v = this.#e ? requestAnimationFrame(this.#C) : this.#t.requestVideoFrameCallback(this.#_);
    }
  }
  cancel() {
    this.#v !== null && (this.#e ? cancelAnimationFrame(this.#v) : this.#t.cancelVideoFrameCallback(this.#v)), this.#v = null, this.#p = null, this.#x?.(), this.#x = null, this.#M !== null && this.#t.cancelVideoFrameCallback(this.#M), this.#M = null, this.#Q(), this.#N = null, this.#H = [], this.#m = this.#F && this.#t.playbackRate > 1, this.#X();
  }
  destroy() {
    this.cancel();
    for (const e of ["emptied", "seeking", "seeked"])
      this.#t.removeEventListener(e, this.#X);
    for (const e of ["pause", "playing", "waiting", "ratechange"])
      this.#t.removeEventListener(e, this.#G);
    for (const e of [
      "loadeddata",
      "playing",
      "pause",
      "ended",
      "seeking",
      "seeked",
      "emptied",
      "ratechange"
    ])
      this.#t.removeEventListener(e, this.#P);
  }
  /** Deliver pending input on the rendering window's refresh, before drawing. */
  flush(e) {
    if (this.#m)
      for (this.#t.ownerDocument !== this.#V && (this.#x?.(), this.#x = null, this.#k()); this.#O.length > 0 && this.#p !== null; ) {
        const t = this.#O.shift(), i = t.frame;
        try {
          this.#b(e, {
            width: i.visibleRect?.width ?? i.codedWidth,
            height: i.visibleRect?.height ?? i.codedHeight,
            mediaTime: i.timestamp / 1e6,
            presentedFrames: t.count,
            // A picture held until this refresh is scheduled no earlier than now.
            expectedDisplayTime: Math.max(t.at, e),
            timeOrigin: performance.timeOrigin,
            frame: i
          });
        } finally {
          i.close();
        }
      }
  }
  #Q() {
    for (const e of this.#O) e.frame.close();
    this.#O = [];
  }
  #P = (e) => {
    const t = this.#F && this.#t.playbackRate > 1;
    if (t !== this.#m) {
      const i = this.#p;
      this.cancel(), this.#m = t, i !== null && this.request(i);
      return;
    }
    ["seeking", "seeked", "emptied", "ratechange"].includes(e.type) && (this.#N = null, this.#H = []), this.#m && ((e.type === "pause" || e.type === "ended") && this.flush(performance.now()), this.#Q(), this.#x?.(), this.#x = null, this.#p !== null && this.#k());
  };
  #k() {
    if (!this.#m || this.#x !== null || this.#p === null || (this.#t.paused || this.#t.ended) && this.#N !== null)
      return;
    this.#M === null && typeof this.#t.requestVideoFrameCallback == "function" && (this.#M = this.#t.requestVideoFrameCallback(
      this.#we
    ));
    const e = Math.max(4, 8 / Math.max(1, this.#t.playbackRate)), t = this.#t.ownerDocument?.defaultView;
    if (this.#V = this.#t.ownerDocument, t) {
      const i = t.setTimeout(this.#L, e);
      this.#x = () => t.clearTimeout(i);
    } else {
      const i = setTimeout(this.#L, e);
      this.#x = () => clearTimeout(i);
    }
  }
  #we = () => {
    this.#M = null, this.#x?.(), this.#x = null, this.#L();
  };
  #L = () => {
    this.#x = null;
    const e = this.#t;
    if (this.#p === null) return;
    if (e.readyState < 2 || e.seeking) {
      this.#k();
      return;
    }
    let t, i = !1;
    try {
      const s = this.#i?.();
      if (s === null) {
        this.#k();
        return;
      }
      i = s !== void 0, t = s ?? new VideoFrame(e);
    } catch (s) {
      if (!(s instanceof DOMException) || s.name !== "InvalidStateError")
        throw s;
      this.#k();
      return;
    }
    if (t.timestamp === this.#N)
      t.close();
    else {
      let s = 1;
      if (this.#N !== null) {
        const o = t.timestamp - this.#N;
        if (o > 1e3 && o < 25e4 && (this.#H.push(o), this.#H.length > 7 && this.#H.shift()), o > 0 && this.#H.length > 0) {
          const h = [...this.#H].sort((c, A) => c - A), a = h[Math.floor(h.length / 2)];
          s = Math.max(1, Math.round(o / a));
        }
      }
      this.#N = t.timestamp, this.#xe += s;
      const r = performance.now() + (i ? (t.timestamp / 1e6 - e.currentTime) * 1e3 / e.playbackRate : 0);
      for (this.#O.push({ frame: t, at: r, count: this.#xe }); this.#O.length > 4; ) this.#O.shift().frame.close();
    }
    this.#k();
  };
  #G = () => {
    this.#h = null, this.#f = null, this.#d = 0;
  };
  #X = () => {
    this.#E = null, this.#a = null, this.#l = !0, this.#z(), this.#G();
  };
  /** Drop the takes in hand; the next one starts with nothing to compare to. */
  #z() {
    this.#u?.reset(), this.#o = [], this.#c = 0;
  }
  /** Native acquisition: pass the report on, with the clock it was made on. */
  #_ = (e, t) => {
    this.#b(e, {
      width: t.width,
      height: t.height,
      mediaTime: t.mediaTime,
      presentedFrames: t.presentedFrames,
      expectedDisplayTime: t.expectedDisplayTime,
      timeOrigin: ke(this.#t)
    });
  };
  #b = (e, t) => {
    const i = this.#p;
    this.#v = null, this.#p = null, i?.(e, t);
  };
  #C = (e) => {
    const t = this.#e, i = ne.map((a) => t[a]);
    this.#E?.some((a, c) => i[c] < a) && this.#X(), this.#E = i;
    const s = this.#n?.() ?? null;
    s !== this.#u && (this.#X(), this.#u = s);
    const r = t.mozPaintedFrames, o = !t.seeking && t.readyState >= 2 && t.videoWidth > 0 && t.videoHeight > 0, h = this.#a === null && (r > 0 || t.paused && (t.mozPresentedFrames > 0 || t.mozDecodedFrames > 0));
    if (s !== null) {
      this.#B(e, t, s, o, h);
      return;
    }
    if (o && (h || this.#a !== null && r !== this.#a)) {
      this.#h !== null && e - this.#h > I && (this.#G(), this.#l = !0), this.#W(e, t), this.#h = e, this.#a = r;
      const a = this.#l;
      this.#l = !1, this.#b(e, {
        width: t.videoWidth,
        height: t.videoHeight,
        // Used only to select source scan/size metadata on the media timeline.
        // It is deliberately NOT used as the frame identity or field clock.
        mediaTime: t.currentTime,
        presentedFrames: r,
        // The counters report no display time. The poll that found the frame
        // is the best stand-in, and it was taken on this module's clock --
        // not the video node's window, which may be a different one.
        expectedDisplayTime: e,
        timeOrigin: performance.timeOrigin,
        mozTiming: { periodMs: this.#d, discontinuity: a }
      });
    } else
      this.#v = requestAnimationFrame(this.#C);
  };
  /** Fold the painted count into the cadence, on a poll that saw it advance. */
  #W(e, t) {
    if (t.paused || t.ended) return;
    const i = t.mozPaintedFrames, s = this.#f;
    if (s && e - s.at >= Ue) {
      const r = i - s.frames;
      if (r > 0) {
        const o = (e - s.at) / r;
        o >= 4 && o <= 200 && (this.#d = this.#d ? this.#d + (o - this.#d) * 0.25 : o);
      }
      this.#f = null;
    }
    this.#f ??= { at: e, frames: i };
  }
  /**
   * The poll where the pictures themselves say what is new. Every refresh
   * takes the element's picture; a take is delivered once its verdict is in,
   * which is a refresh or more after it was made.
   */
  #B(e, t, i, s, r) {
    const o = t.mozPaintedFrames, h = this.#a !== null && o !== this.#a;
    this.#A !== null && e - this.#A > I && (this.#z(), this.#G(), this.#l = !0), this.#A = e, h && this.#W(e, t);
    const a = t.paused || t.ended;
    (!a || h) && (this.#c = 0), a && this.#r !== null && (this.#r = e);
    const c = a && this.#c >= Ne;
    if (s && (r || this.#a !== null)) {
      this.#a = o;
      const u = c ? null : i.take();
      u !== null && this.#o.push({
        id: u,
        at: e,
        mediaTime: t.currentTime,
        width: t.videoWidth,
        height: t.videoHeight,
        resting: a
      });
    }
    let A = null;
    for (let u = i.settle(); u !== null; u = i.settle()) {
      const l = this.#o.shift();
      if (l?.id !== u.id)
        throw new Error("picture verdicts arrived out of order");
      let d = u.changed;
      if (d ? this.#c = 0 : (this.#c = l.resting ? this.#c + 1 : 0, d = A === null && !l.resting && this.#r !== null && (l.at - this.#r) * (t.playbackRate || 1) >= Ge && o !== this.#T), !d) {
        i.release(l.id);
        continue;
      }
      A !== null && i.release(A.id), A = l;
    }
    if (A === null) {
      this.#v = requestAnimationFrame(this.#C);
      return;
    }
    let f = 1;
    if (this.#h !== null) {
      const u = A.at - this.#h;
      u > I ? (this.#G(), this.#l = !0) : this.#d > 0 && u > this.#d * Ie && (f = Math.round(u / this.#d));
    }
    this.#s += f, this.#h = A.at, this.#r = A.at, this.#T = o;
    const m = this.#l;
    this.#l = !1;
    try {
      this.#b(e, {
        width: A.width,
        height: A.height,
        // As on the counted path, this only places the frame on the media
        // timeline; it is the clock's value when the picture was taken.
        mediaTime: A.mediaTime,
        presentedFrames: this.#s,
        // The picture is in hand now, not when it was taken, and the
        // schedule is anchored to when a frame is handed over.
        expectedDisplayTime: e,
        timeOrigin: performance.timeOrigin,
        mozTiming: { periodMs: this.#d, discontinuity: m },
        picture: A.id
      });
    } finally {
      i.release(A.id);
    }
  }
}
let he = null;
function Xe(n) {
  he = n;
}
const $ = 0.5, b = 4, X = 5, w = X + 1, Q = 1e3, Z = 4, B = 200, ze = 0.25, We = 1e3 / 60, He = `#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`, Ve = 0.75, $e = 0.1, Y = 1, Qe = 0.02, Ze = 0.1, j = 1, Ye = 4, N = 5, je = 4, qe = {
  2: 0,
  3: 0.25,
  4: 0.5,
  5: 0.75
}, Ke = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`;
function At() {
  return Le() && typeof WebGL2RenderingContext < "u";
}
const Je = {
  requestAnimationFrame: (n) => requestAnimationFrame(n),
  cancelAnimationFrame: (n) => cancelAnimationFrame(n)
};
class at extends EventTarget {
  /** Receive fMP4 from the player and decode supplemental input only above 1.25x playback speed. */
  encodedVideo;
  #t;
  #i;
  #e;
  #n;
  /** Finds Firefox's new pictures for the main-thread renderer. */
  #u;
  /** The take holding the picture of the frame being ingested, if any. */
  #o = null;
  #s;
  /** The pulldown detection, built only while the `film` option needs it. */
  #A = null;
  #c;
  #r;
  /** The program that copies a filtered picture onto the canvas. */
  #T;
  #v;
  #p;
  #E = [];
  /** Somewhere to filter a field into, and to read it back out of. */
  #a = [];
  /** Which output slot was written last; the next one follows round the ring. */
  #l = w - 1;
  /** The draw path currently shown on the canvas, retained for snapshots. */
  #h = null;
  /** Filtered fields waiting for their moment, oldest first. */
  #f = [];
  /** The requestAnimationFrame() loop that puts them up, which is all that draws on the canvas. */
  #d = null;
  #F = 0;
  /** Deliver captured pictures on the page's refresh during faster playback. */
  #m = null;
  /** The document the owner-change listener is on, if any. */
  #x = null;
  #V;
  /** The gap between animation frames: as near as the page gets to the screen. */
  #M = We;
  /** Where the refresh grid fitted to the animation frames stands. (otya) */
  #N = 0;
  /** How far ahead of its animation frame the last picture shown stood. (otya) */
  #xe = 0;
  #H = 0;
  #O = 0;
  /** The last picture chained onto the schedule; a break restarts it. (otya) */
  #Q = null;
  /**
   * Drop the presentation queue and restart the schedule from the clock.
   * Every schedule restart goes through here (otya nulls #lastScheduled at
   * each queue clear): the old chain's clock no longer applies, so keeping
   * it would either count a phantom resync or pop freshly queued pictures
   * as late. Restart accounting for cadence changes lives in #schedule.
   */
  #P() {
    this.#f.length = 0, this.#Q = null, this.#O = 0;
  }
  /** The `<div>` this put around the element, so it can be taken away again. */
  #k = null;
  #we;
  #L;
  #G;
  #X = 0;
  /** otya GPU pulldown path: enabled by the `film` option (see below). */
  #z;
  #_;
  /** How long a frame lasts in wall time, from what the frames themselves say. */
  #b = 0;
  /** The size of a frame as it is coded, which is what a texture holds. */
  #C = 0;
  #W = 0;
  /** Where the newest frame is. The two before it follow round the ring. */
  #B = b - 1;
  /** How many of the held frames are consecutive, up to HISTORY. */
  #R = 0;
  #Te = 0;
  /** presentedFrames at the last ingested frame; pairs with #lastMediaTime. */
  #qe = 0;
  /** A destination frame that arrived before the browser finished seeking. */
  #ye = !1;
  #D = !1;
  /** Cancels work suspended inside a synchronous owner callback. */
  #se = 0;
  #Ne = !1;
  #Z = !1;
  #y = null;
  #oe = [];
  #$ = !1;
  #Ke;
  #Je;
  #S;
  #he;
  #j;
  #et;
  #g = null;
  #w;
  #Fe = !1;
  #tt = 0;
  #it = !1;
  #$t = 0;
  #Re = !1;
  #Ge = !1;
  #Ae = null;
  #Qt = 0;
  #De = /* @__PURE__ */ new Map();
  /** Everything the next report is counted from. See DeinterlaceStats. */
  #U = {
    filtered: 0,
    missed: 0,
    degraded: 0,
    discontinuities: 0,
    resynced: 0,
    late: 0,
    queueResetted: 0
  };
  /** `presentedFrames` of the last frame the callback saw; 0 before any. */
  #_e = 0;
  /** When the last frame the filter took arrived, to see the gaps between. */
  #Oe = 0;
  #Xe = 0;
  #q = 0;
  #ae = 0;
  #le = 0;
  #Me = 0;
  #ue = 0;
  #ce;
  #ze = [];
  #fe = [];
  #Se = 0;
  #de = 0;
  #Pe = 0;
  #me = 0;
  /** The last phase read back from the GPU, and how many frames ago it was for. */
  #Ce = x;
  #pe = 0;
  /** The phase of the frame being filtered: #known advanced by #knownAge. */
  #I = x;
  #K = !1;
  #Ee = null;
  #gt = "";
  /** Debug only: frames given each phase (0 for none), and repeats dropped. */
  #We = [0, 0, 0, 0, 0, 0];
  #st = 0;
  /**
   * Why requested film reconstruction is currently degraded, or null while
   * healthy. The `film` option stays as the caller set it;
   * only the engine stands down, so this is never a silent option change.
   */
  #re = null;
  /** Last worker-reported filmError, to derive the page-side failure event. */
  #rt = null;
  #nt = 0;
  constructor(e, t = {}, i = null) {
    super(), this.#e = e, this.#L = t.doubleRate ?? !1, this.#G = t.spatialCheck ?? !0, this.#z = t.debug ?? !1, this.#_ = t.film ?? !1, this.#Ke = t.onStats, this.#Je = t.onFailure, this.#S = i, this.#j = i ? "main" : t.rendering ?? "main", this.#et = t.workerUrl ?? he, this.#w = this.#j === "main" ? "main" : "idle", this.#i = i ? i.canvas : document.createElement("canvas"), this.#t = i?.canvas ?? (this.#j === "main" ? this.#i : document.createElement("canvas")), this.#he = e, i || (this.#i.style.cssText = "position:absolute;pointer-events:none;visibility:hidden");
    const s = this.#t.getContext("webgl2", {
      // Keep the underlying video in Chromium's compositor to receive frame notifications at the source rate.
      alpha: !0,
      antialias: !1,
      depth: !1,
      stencil: !1,
      preserveDrawingBuffer: !1,
      powerPreference: "high-performance"
    });
    if (!(s instanceof WebGL2RenderingContext))
      throw new Error("this browser has no WebGL2");
    this.#s = s, this.#_ && (this.#yt(), this.#A = new V(s)), this.#c = q(s, De);
    const r = this.#c;
    this.#r = Object.fromEntries(
      Object.entries(Re).map(([o, h]) => [
        o,
        s.getUniformLocation(r, h)
      ])
    ), this.#T = q(s, Ke), this.#v = s.getUniformLocation(this.#T, "uField"), this.#p = s.getUniformLocation(this.#T, "uFlip"), this.#ce = s.getExtension(
      "EXT_disjoint_timer_query_webgl2"
    ), this.#t.addEventListener(
      "webglcontextlost",
      this.#Vt
    ), this.#we = i ? null : new ResizeObserver(() => this.#Ue()), this.#V = i ? null : new MutationObserver(() => {
      this.#i.ownerDocument !== this.#x && this.#Ue();
    }), this.encodedVideo = !i && typeof VideoDecoder < "u" ? new Me(e) : null, this.#u = i ? null : new Ce(s, e), this.#n = new Oe(
      e,
      () => this.encodedVideo?.take(),
      () => this.#w === "main" ? this.#u : null
    ), e.addEventListener("emptied", this.#zt), e.addEventListener("resize", this.#Xt), e.addEventListener("pause", this.#ie), e.addEventListener("ended", this.#ie), e.addEventListener("seeking", this.#Ht), e.addEventListener("seeked", this.#ie), e.addEventListener("ratechange", this.#ie);
  }
  get running() {
    return this.#D && (this.#y?.interlaced ?? !0);
  }
  /** The HTML canvas currently placed over the media element. */
  get canvas() {
    return this.#i;
  }
  /** Field order for the current scan state, defaulting to top-field-first. */
  get #xt() {
    return this.#y?.topFieldFirst !== !1;
  }
  /** The same public filter options for either rendering target. */
  #wt() {
    return {
      doubleRate: this.#L,
      spatialCheck: this.#G,
      film: this.#_,
      debug: this.#z
    };
  }
  /** Whether the caller wants filtering, independently of the current source. */
  get enabled() {
    return this.#Ne;
  }
  set enabled(e) {
    this.#Ne = e, this.#ot(), this.#g?.postMessage({
      type: "enabled",
      enabled: e
    });
  }
  /** Update whether the source needs filtering and which field comes first. */
  set scan(e) {
    const t = this.#y?.interlaced !== e?.interlaced, i = t || this.#y?.topFieldFirst !== e?.topFieldFirst;
    this.#y = e, !(i && (!this.#be() || this.#y !== e)) && (this.#g?.postMessage({ type: "scan", scan: e }), i && (this.#R = 0, this.#P(), this.#Y(), t && (this.#b = 0), this.#h = null, this.#te(!1)), this.#ot(), i && ((e?.interlaced ?? !0) && (this.#S || this.#w === "main") ? this.#Le() : this.#ft()));
  }
  get scan() {
    return this.#y;
  }
  set videoTimeline(e) {
    this.#oe = e, this.#g?.postMessage({
      type: "timeline",
      videoTimeline: e
    }), e.length === 0 && (this.#y = null), this.#ot();
  }
  get videoTimeline() {
    return this.#oe;
  }
  /**
   * What to put on the screen for fullscreen: the `<div>` holding both the
   * element and the canvas once there is one, and the element itself before
   * that. Fullscreening the element alone would leave the canvas behind in
   * the page, and with it the only deinterlaced picture there is.
   */
  get container() {
    return this.#k ?? this.#e;
  }
  /** Whether a picture goes up for every field rather than every frame. */
  get doubleRate() {
    return this.#L;
  }
  set doubleRate(e) {
    e !== this.#L && (this.#L = e, this.#ve(), this.#P(), this.#Tt());
  }
  get spatialCheck() {
    return this.#G;
  }
  set spatialCheck(e) {
    e !== this.#G && (this.#G = e, this.#ve());
  }
  get film() {
    return this.#_;
  }
  set film(e) {
    const t = this.#g ? this.#rt : this.#re;
    if (!(e === this.#_ && (e === !1 || t === null))) {
      if (this.#g) {
        this.#_ = e, this.#ve(e ? "film" : void 0);
        return;
      }
      if (e) {
        if (!this.#be()) return;
        try {
          this.#Ft();
        } catch (i) {
          this.#_ = !0, this.#ve(), this.#At(
            `film detector unavailable: ${i instanceof Error ? i.message : String(i)}`
          );
          return;
        }
      }
      if (this.#_ = e, this.#ve(), !e) {
        if (!this.#be()) return;
        this.#K = !1, this.#I = x, this.#Y(), this.#A?.destroy(), this.#A = null;
      }
      this.#Tt();
    }
  }
  get debug() {
    return this.#z;
  }
  set debug(e) {
    e !== this.#z && (this.#z = e, this.#ve());
  }
  /** Whether pictures are queued for presentation by the frame loop. */
  get #Zt() {
    return this.#L || this.#_;
  }
  #Tt() {
    this.#Z || (this.#Zt ? (this.#C > 0 && this.#Ot(), (this.#y?.interlaced ?? !0) && (this.#S || this.#w === "main") && this.#Le()) : this.#_ || (this.#h = null, this.#te(!1), this.#Ie()));
  }
  /** Apply mutable filter settings to the existing Worker and canvas. */
  #ve(e) {
    this.#g?.postMessage({
      type: "settings",
      options: this.#wt(),
      retryFilm: e
    });
  }
  #yt() {
    if (this.#s.getExtension("EXT_color_buffer_float") === null)
      throw new Error("film needs EXT_color_buffer_float");
  }
  /** Build the GPU pulldown detector the `film` option needs, or throw. */
  #Ft() {
    this.#yt(), this.#A ??= new V(this.#s), this.#C > 0 && this.#A.resize(this.#C, this.#W);
  }
  #ot() {
    this.#Ne && (this.#oe.length > 0 || (this.#y?.interlaced ?? !0)) ? this.start() : this.stop();
  }
  /** Start the bundled Worker when the required transfer APIs are available. */
  #Yt() {
    return this.#S || this.#j === "main" ? !1 : this.#w === "starting" || this.#w === "active" ? !0 : typeof Worker < "u" && typeof VideoFrame < "u" && typeof OffscreenCanvas < "u" && this.#et !== null && "transferControlToOffscreen" in HTMLCanvasElement.prototype ? (this.#Rt(), !0) : this.#j === "auto" ? (this.#He(), !1) : (this.#w = "failed", this.#D = !1, !0);
  }
  /** Transfer the display canvas to a new Worker, replacing it if already transferred. */
  #Rt() {
    this.#J(), this.#g?.terminate(), this.#g = null, this.#Re = !1, this.#Ge = !1, this.#rt = null, this.#nt = 0;
    let e = this.#i;
    if (this.#it) {
      e = document.createElement("canvas"), e.className = this.#i.className;
      const r = this.#i.getAttribute("style");
      r === null ? e.removeAttribute("style") : e.setAttribute("style", r), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e;
    }
    const t = ++this.#tt;
    this.#w = "starting";
    let i, s;
    try {
      s = e.transferControlToOffscreen(), this.#it = !0, i = new Worker(this.#et, { type: "module" });
    } catch (r) {
      this.#Be(
        r instanceof Error ? r.message : String(r)
      );
      return;
    }
    this.#g = i, i.onmessage = (r) => {
      t === this.#tt && this.#jt(r.data);
    }, i.onerror = (r) => {
      t === this.#tt && (r.preventDefault(), this.#Be(r.message || "the deinterlacer worker failed"));
    }, i.postMessage(
      {
        type: "initialize",
        canvas: s,
        options: this.#wt(),
        scan: this.#y,
        videoTimeline: this.#oe,
        enabled: this.#D,
        video: this.#at()
      },
      [s]
    );
  }
  /** Apply Worker notifications and release the wait for the next input frame. */
  #jt(e) {
    switch (e.type) {
      case "ready":
        this.#w = "active", this.#D && (this.#ke(), this.#je());
        break;
      case "failed":
        this.#Be(e.message);
        break;
      case "consumed": {
        this.#Re = !1, this.#Ge = !0;
        const t = this.#Ae;
        this.#Ae = null, t && this.#_t(t);
        break;
      }
      case "visibility":
        this.#i.style.visibility = e.visible ? "visible" : "hidden";
        break;
      case "stats": {
        const t = {
          ...e.stats,
          dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0
        }, i = t.filmError ?? null, s = this.#nt;
        if (this.#rt = i, this.#nt = e.filmFailure, i !== null && e.filmFailure !== s) {
          this.dispatchEvent(
            new CustomEvent("failure", { detail: i })
          );
          try {
            this.#Je?.(i);
          } catch {
          }
        }
        this.dispatchEvent(new CustomEvent("stats", { detail: t })), this.#Ke?.(t);
        break;
      }
      case "capture": {
        const t = this.#De.get(e.id);
        if (this.#De.delete(e.id), !t) {
          e.image?.close();
          break;
        }
        e.image ? t.resolve(e.image) : createImageBitmap(this.#e).then(
          t.resolve,
          t.reject
        );
        break;
      }
    }
  }
  /**
   * Tell the owner that a rendering resource failed after construction.
   * In the worker domain the boundary counts episodes: the reason travels in
   * `stats.filmError` and the page derives the event from the episode count,
   * so a film degradation is never mistaken for worker death.
   */
  #ht(e) {
    if (this.dispatchEvent(new CustomEvent("failure", { detail: e })), !this.#S)
      try {
        this.#Je?.(e);
      } catch {
      }
  }
  /**
   * Stand down film reconstruction without touching the caller's options.
   * Pictures keep flowing through plain YADIF; the reason is reported once
   * per episode through the failure event/option and `stats.filmError`.
   * Silently turning the `film` option off is not a fallback -- it would
   * rewrite the caller's 24fps intent -- so the option stays on and only
   * the engine stands down.
   */
  #At(e) {
    this.#re !== e && (this.#re = e, this.#K = !1, this.#I = x, this.#Y(), this.#A?.destroy(), this.#A = null, this.#ht(e));
  }
  /**
   * Re-arm film reconstruction at a resource-reallocation point (start, scan
   * change, resize, or re-setting the option). The next frame retries; a
   * repeated failure degrades again and notifies as a new episode.
   */
  #be() {
    return this.#Z ? !1 : (this.#g || (this.#re = null), !0);
  }
  /** Retry a transient Worker failure once, then show the media element if it fails again. */
  #Be(e) {
    if (this.#w === "starting" && this.#j === "auto" && !this.#Fe) {
      this.#He();
      return;
    }
    if (this.#Dt(e), !this.#Fe) {
      this.#Fe = !0, this.#Rt();
      return;
    }
    console.error(`Deinterlacer Worker stopped: ${e}`), this.#w = "failed", this.#g?.terminate(), this.#g = null, this.#J(), this.#ht(`deinterlacer worker stopped: ${e}`), this.stop();
  }
  /** Restore the main-thread canvas when automatic Worker selection fails. */
  #He() {
    const e = this.#t;
    e.className = this.#i.className;
    const t = this.#i.getAttribute("style");
    t === null ? e.removeAttribute("style") : e.setAttribute("style", t), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e, this.#it = !1, this.#g?.terminate(), this.#g = null, this.#w = "main", this.#J(), this.#D && (this.#ke(), this.#je(), (this.#y?.interlaced ?? !0) && this.#Le());
  }
  /** Close the queued frame still owned by the page when switching renderers. */
  #J() {
    this.#Ae?.frame.close(), this.#Ae = null;
  }
  /** Reject captures whose replies would be lost when the Worker is rebuilt. */
  #Dt(e) {
    for (const t of this.#De.values())
      t.reject(new Error(e));
    this.#De.clear();
  }
  start() {
    if (!(this.#D || this.#Z || this.#$) && (this.#se++, this.#D = !0, this.#Wt(), !!this.#be())) {
      if (this.#ci(), this.#je(), this.#Yt()) {
        this.#g?.postMessage({
          type: "enabled",
          enabled: !0
        }), this.#w === "active" && this.#ke();
        return;
      }
      this.#ke(), (this.#y?.interlaced ?? !0) && this.#Le();
    }
  }
  /** Take the deinterlaced picture away, leaving the element's own showing. */
  stop() {
    this.#se++, this.#D && (this.#D = !1, this.#n.cancel(), this.encodedVideo?.suspend(), this.#Bt(), this.#ft(), this.#R = 0, this.#h = null, this.#te(!1), this.#J(), this.#g?.postMessage({
      type: "enabled",
      enabled: !1
    }));
  }
  destroy() {
    if (!this.#Z) {
      this.#Z = !0, this.#Ne = !1, this.stop(), this.#g?.postMessage({ type: "destroy" }), this.#g?.terminate(), this.#g = null, this.#J(), this.#Dt("the deinterlacer was destroyed"), this.#x?.removeEventListener(
        "visibilitychange",
        this.#pt
      ), this.#x = null, this.#V?.disconnect(), this.#t.removeEventListener(
        "webglcontextlost",
        this.#Vt
      ), this.#n.destroy(), this.#u?.destroy(), this.encodedVideo?.destroy(), this.#e.removeEventListener("emptied", this.#zt), this.#e.removeEventListener("resize", this.#Xt), this.#e.removeEventListener("pause", this.#ie), this.#e.removeEventListener("ended", this.#ie), this.#e.removeEventListener("seeking", this.#Ht), this.#e.removeEventListener("seeked", this.#ie), this.#e.removeEventListener("ratechange", this.#ie), this.#fi();
      for (const e of this.#E) this.#s.deleteTexture(e);
      this.#E = [], this.#Ie();
      for (const e of [
        ...this.#ze,
        ...this.#fe.map(({ q: t }) => t)
      ])
        this.#s.deleteQuery(e);
      this.#ze.length = 0, this.#fe.length = 0, this.#A?.destroy(), this.#A = null, this.#Ee !== null && (de(this.#Ee), this.#Ee = null), this.#s.deleteProgram(this.#c), this.#s.deleteProgram(this.#T), this.#s.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
  /**
   * Copy the picture currently represented by the deinterlacer.
   *
   * The WebGL drawing buffer is deliberately not preserved between browser
   * composites. Repeating the exact draw path of the presented picture before
   * `createImageBitmap` makes a snapshot reliable without imposing the
   * permanent cost of `preserveDrawingBuffer` on ordinary playback.
   */
  capture() {
    if (this.#w === "active" && this.#i.style.visibility === "visible" && this.#g) {
      const s = ++this.#Qt, r = new Promise((o, h) => {
        this.#De.set(s, { resolve: o, reject: h });
      });
      return this.#g.postMessage({
        type: "capture",
        id: s,
        width: this.#e.videoWidth,
        height: this.#e.videoHeight
      }), r;
    }
    if (this.#w === "starting" || this.#w === "failed")
      return createImageBitmap(this.#e);
    const e = this.#h;
    if (this.#S && (!this.#D || this.#$ || !e))
      return Promise.reject(new Error("no rendered picture is available"));
    if (!this.#D || this.#$ || !e)
      return createImageBitmap(this.#e);
    e.kind === "texture" ? this.#vt(e.texture, e.flip, !1) : this.#ne(e.flush, e.second, null, !1);
    const t = this.#e.videoWidth, i = this.#e.videoHeight;
    return t > 0 && i > 0 && (t !== this.#t.width || i !== this.#t.height) ? createImageBitmap(this.#t, {
      resizeWidth: t,
      resizeHeight: i,
      resizeQuality: "high"
    }) : createImageBitmap(this.#t);
  }
  addEventListener(e, t, i) {
    super.addEventListener(e, t, i);
  }
  removeEventListener(e, t, i) {
    super.removeEventListener(e, t, i);
  }
  #ke() {
    this.#S || !this.#D || this.#n.request(this.#si);
  }
  /** Copy the element's playback state for seek and presentation timing decisions. */
  #at() {
    const e = [];
    for (let t = 0; t < this.#e.buffered.length; t++)
      e.push({
        start: this.#e.buffered.start(t),
        end: this.#e.buffered.end(t)
      });
    return {
      currentTime: this.#e.currentTime,
      playbackRate: this.#e.playbackRate,
      seeking: this.#e.seeking,
      paused: this.#e.paused,
      ended: this.#e.ended,
      readyState: this.#e.readyState,
      videoWidth: this.#e.videoWidth,
      videoHeight: this.#e.videoHeight,
      buffered: e
    };
  }
  /** Keep one frame in flight and the newest one waiting, staying close to the audio clock. */
  #qt(e, t, i) {
    let s;
    try {
      s = i?.clone() ?? new VideoFrame(this.#e, {
        timestamp: Math.max(0, Math.round(t.mediaTime * 1e6))
      });
    } catch (o) {
      const h = o instanceof Error ? o.message : String(o);
      this.#j === "auto" && !this.#Ge && !this.#Fe ? (this.#He(), this.#$e(e, t)) : this.#Be(h);
      return;
    }
    const r = {
      id: ++this.#$t,
      frame: s,
      now: e,
      metadata: t,
      video: this.#at()
    };
    if (this.#Re) {
      this.#Ae?.frame.close(), this.#Ae = r;
      return;
    }
    this.#_t(r);
  }
  /** Transfer the selected frame once the Worker has released the previous input. */
  #_t(e) {
    const t = this.#g;
    if (!t || this.#w !== "active") {
      e.frame.close();
      return;
    }
    this.#Re = !0;
    const i = {
      type: "frame",
      id: e.id,
      frame: e.frame,
      metadata: e.metadata,
      video: e.video
    };
    try {
      t.postMessage(i, [e.frame]);
    } catch (s) {
      this.#Re = !1, e.frame.close();
      const r = s instanceof Error ? s.message : String(s);
      this.#j === "auto" && !this.#Ge && !this.#Fe ? (this.#He(), this.#$e(e.now, e.metadata)) : this.#Be(r);
    }
  }
  #Kt(e, t, i) {
    this.#Ee == null && (this.#Ee = ce(this.#s, "20px monospace")), me(this.#Ee, e, t, i, this.#C, this.#W, 20);
  }
  #Mt(e) {
    if (this.#ce == null || this.#fe.length > 30)
      return;
    const t = this.#ze.pop() ?? this.#s.createQuery();
    return this.#s.beginQuery(this.#ce.TIME_ELAPSED_EXT, t), this.#fe.push({ q: t, isField: e }), t;
  }
  #Ve(e) {
    this.#ce != null && (e != null && this.#s.endQuery(this.#ce.TIME_ELAPSED_EXT), this.#fe = this.#fe.filter(
      ({ q: t, isField: i }) => {
        if (this.#s.getQueryParameter(t, this.#s.QUERY_RESULT_AVAILABLE)) {
          const s = this.#s.getQueryParameter(t, this.#s.QUERY_RESULT);
          return i ? (this.#Pe += s, this.#me++) : (this.#Se += s, this.#de++), this.#ze.push(t), !1;
        }
        return !0;
      }
    ));
  }
  #Y() {
    this.#I = x, this.#Ce = x, this.#pe = 0, this.#K = !1, this.#A?.reset();
  }
  /** Detect the pulldown phase of the frame being filtered on the GPU. */
  #Jt() {
    const { prev: e, cur: t, next: i } = this.#Nt(!1), s = this.#E[e], r = this.#E[t], o = this.#E[i];
    if (!s || !r || !o) return;
    const h = this.#y?.topFieldFirst !== !1 ? 0 : 1;
    this.#A?.detect(r, o, h), this.#A?.measureComb(s, r, h);
  }
  /**
   * Read back the previous frame's phase if it has arrived, and advance it
   * to the frame being filtered. The run is not advanced: only the GPU
   * counts observed frames.
   */
  #ei() {
    const e = this.#A?.poll() ?? null;
    e !== null && (this.#Ce = e, this.#pe = e.age), this.#pe++;
    const { phase: t, run: i } = this.#Ce;
    t === 0 || this.#pe > Math.ceil(N * Math.max(1, this.#e.playbackRate)) ? this.#I = x : this.#I = {
      phase: (t - 1 + this.#pe) % N + 1,
      run: i
    };
  }
  #ti(e) {
    const t = [], i = this.#A?.metrics ?? new Float32Array(0);
    for (let r = 0; r < p.phase; r++) {
      const o = i[r * 4] ?? 0, h = i[r * 4 + 1] ?? 0, a = i[r * 4 + 2] ?? 0;
      t.push(
        `${o.toFixed(3)},${h.toString().padStart(4)},${a.toFixed(3)}`
      );
    }
    const s = this.#We.map((r, o) => `${o === 0 ? "-" : o}:${r}`).join(" ");
    return `frame=${e} phase=${this.#I.phase} run=${this.#I.run} known=${this.#Ce.phase}/${this.#Ce.run} age=${this.#pe} ${this.#K ? "film" : "video"} period=${this.#b.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#st}`;
  }
  /**
   * A timestamp taken on `origin`'s clock, expressed on this realm's.
   *
   * `performance.timeOrigin` is defined against the same moment in every
   * realm, so the difference between two origins is the whole of the
   * conversion between their clocks (W3C HR-Time 1.2). The origins are
   * subtracted from one another before the timestamp is added: they are the
   * large numbers, their difference is not, and doing it the other way round
   * would spend the precision the schedule is measured in.
   */
  #lt(e, t) {
    const i = t - performance.timeOrigin;
    return Number.isFinite(i) && i !== 0 ? e + i : e;
  }
  /**
   * When this frame reaches the screen, on the clock this renderer draws by.
   *
   * requestVideoFrameCallback()'s display time is what holds the schedule on
   * the refresh grid, so it is preferred wherever it is usable -- including
   * across realms, since #localTime converts it exactly. It is not always
   * usable: 0 and NaN have both been reported, an origin may be missing, and
   * a time that cannot belong to this frame is worse than no time at all.
   * Those fall back to the moment the frame was taken in hand, which is this
   * renderer's own clock and always valid.
   */
  #ii(e, t) {
    const i = e.expectedDisplayTime;
    if (!Number.isFinite(i) || i <= 0 || !Number.isFinite(e.timeOrigin)) return t;
    const s = this.#lt(i, e.timeOrigin), r = Ye * Math.max(this.#M, this.#b);
    return s < t - r || s > t + r ? t : s;
  }
  #si = (e, t) => {
    if (!this.#D || this.#$) return;
    this.#mt();
    const i = this.#lt(e, t.timeOrigin), { frame: s, picture: r, ...o } = t;
    this.#he = s ?? this.#e, this.#o = r ?? null;
    try {
      this.#ri(i, o, s);
    } finally {
      this.#he = this.#e, this.#o = null;
    }
    this.#ke();
  };
  /**
   * Take a frame from either acquisition path into the selected renderer.
   * `now` is the ingestion time on this realm's clock.
   */
  #ri(e, t, i) {
    if (this.#w === "active") {
      this.#qt(e, t, i);
      return;
    }
    this.#w !== "starting" && this.#$e(e, t);
  }
  /**
   * @internal Feed Worker input through the same history and rendering decisions
   * as main-thread input. `now` is the ingestion time on the Worker's clock.
   * The metadata's display time stays on the page's clock and is converted
   * using the accompanying timeOrigin.
   */
  ingestExternalFrame(e, t, i) {
    this.#he = i;
    try {
      this.#$e(e, t);
    } finally {
      this.#he = this.#e;
    }
  }
  /** Take one input into the shared history and decide its YADIF or IVTC presentation. */
  #$e(e, t) {
    const i = this.#se;
    if (this.#ee(i) && (this.#ni(t.mediaTime), !!this.#ee(i) && t.width > 0 && t.height > 0)) {
      let s = !1;
      if (!this.#ye && this.#e.seeking) {
        const l = this.#e.buffered, d = this.#b >= Z ? this.#b / 1e3 : B / 1e3;
        for (let E = 0; E < l.length; E++)
          if (t.mediaTime >= l.start(E) && t.mediaTime < l.end(E) && Math.abs(t.mediaTime - this.#e.currentTime) <= d) {
            s = !0;
            break;
          }
      }
      if (s && (this.#ye = !0), (this.#C === 0 || this.#W === 0) && this.#Gt(t.width, t.height), !this.#ee(i)) return;
      if (this.#y && !this.#y.interlaced) {
        const l = performance.now();
        this.#Lt(l), this.#Oe = l, this.#li(), this.#ae += performance.now() - l, this.#q++, this.#le++, this.#Ut(l);
        return;
      }
      const r = t.mediaTime - this.#Te, o = t.mozTiming, h = s || (o ? o.discontinuity || r < 0 || r > $ : r < 0 || r > $);
      h && (this.#R = 0, this.#b = 0, this.#U.discontinuities++, this.#P(), this.#Y());
      const a = this.#ui(t.presentedFrames, h);
      if (this.#R > 0 && t.mediaTime === this.#Te && (!o || t.presentedFrames === this.#qe))
        return;
      if (!h) {
        const l = o?.periodMs ?? 0;
        l > 0 ? this.#St(
          l * (this.#e.playbackRate || 1) / 1e3,
          1
        ) : this.#R > 0 && r > 0 && this.#St(r, a + 1);
      }
      this.#Te = t.mediaTime, this.#qe = t.presentedFrames;
      const c = performance.now();
      this.#Lt(c), this.#Oe = c;
      const A = performance.now(), f = this.#Mt(!1);
      if (this.#It(), this.#_ && !this.#re && !this.#A)
        try {
          this.#Ft();
        } catch (l) {
          this.#At(
            `film detector unavailable: ${l instanceof Error ? l.message : String(l)}`
          );
        }
      if (!this.#ee(i)) {
        this.#Z || this.#Ve(f);
        return;
      }
      if (this.#_ && !this.#re) {
        if (this.#R === b && a === 0)
          try {
            this.#ei(), this.#Jt();
          } catch (l) {
            this.#At(
              `film detection failed: ${l instanceof Error ? l.message : String(l)}`
            );
          }
        else
          this.#Y();
        this.#We[this.#I.phase] = (this.#We[this.#I.phase] ?? 0) + 1, this.#K = this.#I.phase !== 0 && this.#I.run >= W, this.#z && (this.#gt = this.#ti(t.presentedFrames));
      }
      if (!this.#ee(i)) {
        this.#Z || this.#Ve(f);
        return;
      }
      const u = this.#ii(t, e) + this.#M;
      if (this.#K)
        if (this.#Qe()) {
          const l = this.#I.phase;
          if (l === O)
            this.#st++, this.#O++;
          else {
            const d = this.#b * N / je, E = this.#ct(1, e, d), v = qe[l] ?? 0, U = E || this.#Q === null ? u + d : u + v * this.#b;
            this.#Ze(
              "film",
              !1,
              this.#ut("film", U, d),
              d
            );
          }
        } else
          this.#ne(!1, !1, null);
      else if (this.#L && this.#Qe()) {
        const l = this.#b / 2, E = this.#ct(2, e, l) || this.#Q === null ? u + l * 2 : u, v = this.#ut("field", E, l);
        this.#Ze("field", !1, v, l), this.#Ze("field", !0, v + l, l);
      } else if (this.#Qe()) {
        const l = this.#b, E = this.#ct(1, e, l) || this.#Q === null ? u + l : u;
        this.#Ze(
          "frame",
          !1,
          this.#ut("frame", E, l),
          l
        ) || (this.#U.late++, this.#ne(!1, !1, null));
      } else
        this.#U.late += this.#f.length, this.#P(), this.#ne(!1, !1, null);
      this.#ue = Math.max(
        this.#ue,
        this.#f.length
      ), this.#Ve(f), this.#ae += performance.now() - A, this.#q++, this.#Ut(c);
    }
  }
  #ee(e) {
    return !this.#Z && this.#D && e === this.#se;
  }
  #ni(e) {
    const t = this.#se;
    let i;
    for (let o = this.#oe.length - 1; o >= 0; o--) {
      const h = this.#oe[o];
      if (h.start <= e + 1e-6) {
        i = h;
        break;
      }
    }
    if (i?.codedSize && (i.codedSize.width !== this.#C || i.codedSize.height !== this.#W) && this.#Gt(i.codedSize.width, i.codedSize.height), !this.#ee(t)) return;
    const s = i?.scan;
    if (!s || this.#y?.interlaced === s.interlaced && this.#y.topFieldFirst === s.topFieldFirst)
      return;
    const r = this.#y?.interlaced;
    this.#y = s, this.#R = 0, this.#P(), this.#be() && (r !== s.interlaced && (this.#b = 0), s.interlaced && (this.#S || this.#w === "main") ? this.#Le() : this.#ft(), this.#Y());
  }
  /**
   * Whether pictures are being filtered ahead of time and queued, rather than
   * drawn as their frame arrives.
   *
   * A picture for every frame has nothing to schedule -- there is one of them
   * and it goes up now -- and neither has a filter that has yet to see two
   * frames go by, since until then there is no idea how long a frame lasts.
   */
  #Qe() {
    return (this.#L || this.#_) && this.#b > 0 && this.#a.length === w;
  }
  /**
   * How long a frame lasts in wall time, kept as a smoothed estimate.
   *
   * Taken from the frames themselves rather than from a frame rate nobody
   * reports, and in wall time, so a rate other than 1 moves the fields with
   * it. A frame the callback never saw makes the step between two of them a
   * whole multiple of the period, and dividing that back out matters: taken
   * at face value, one missed frame would put every field of the next one
   * half a frame late and hold the picture through a refresh it should have
   * moved in.
   */
  #St(e, t) {
    const s = e * 1e3 / (this.#e.playbackRate || 1) / t;
    s < Z || s > B || (this.#b = this.#b > 0 && s > this.#b * Ve ? this.#b + (s - this.#b) * ze : s);
  }
  /**
   * Filter one field into an output texture and put it in the queue.
   *
   * The three frames the filter reads are only the right three between one
   * frame arriving and the next, so both fields of a frame are built here and
   * held as pictures. What is queued after that is a copy waiting for a
   * moment, which no later frame can take away.
   */
  #Ze(e, t, i, s) {
    const r = this.#Pt();
    if (r === null) return !1;
    const o = this.#a[r];
    if (!o) return !1;
    for (this.#l = r; this.#f.length > 0 && this.#f[0]?.slot === r; )
      this.#f.shift(), this.#U.late++;
    this.#ne(!1, t, o.framebuffer);
    const h = {
      slot: r,
      at: i,
      duration: s,
      cadence: e,
      phase: e === "film" ? this.#I.phase : e === "field" ? t ? 2 : 1 : 0,
      droppedBefore: this.#O
    };
    return this.#O = 0, this.#f.push(h), this.#Q = h, !0;
  }
  /**
   * When a picture goes up: one duration after the last one of its cadence,
   * nudged towards `ideal` by a fraction of the gap so that the schedule
   * follows the clock without a picture ever moving across a refresh. It
   * restarts from `ideal` when the gap has grown to a whole picture or the
   * cadence has changed. (otya)
   */
  #ut(e, t, i) {
    if (!(i > 0)) return t;
    const s = this.#Q;
    if (s !== null && s.cadence === e) {
      const r = s.at + s.duration, o = t - r;
      if (Math.abs(o) < i) {
        const h = Math.max(
          -Y,
          Math.min(Y, o * $e)
        );
        return r + h;
      }
    }
    s !== null && this.#U.resynced++;
    for (let r = this.#f.at(-1); r && r.at >= t; )
      this.#f.pop(), this.#U.late++, r = this.#f.at(-1);
    return t;
  }
  /** Make room without treating ordinary capacity pressure as clock divergence. */
  #ct(e, t, i) {
    const s = this.#f.at(-1), r = (X + 1) * Math.max(this.#M, i);
    if (s && s.at - t > r)
      return this.#P(), this.#U.queueResetted++, !0;
    const o = Math.max(
      0,
      this.#f.length + e - X
    );
    let h = 0, a = 0;
    for (; a < o; ) {
      const c = this.#f.shift();
      if (!c) break;
      h += c.duration, a++;
    }
    for (const c of this.#f) c.at -= h;
    return this.#U.late += a, !1;
  }
  /** Select an output whose pixels are not still represented by the canvas or queue. */
  #Pt() {
    const e = this.#h?.kind === "texture" ? this.#h.texture : null, t = new Set(this.#f.map(({ slot: s }) => s));
    for (let s = 1; s <= w; s++) {
      const r = (this.#l + s) % w, o = this.#a[r];
      if (o && o.texture !== e && !t.has(r))
        return r;
    }
    const i = this.#f[0];
    if (i) {
      const s = this.#a[i.slot];
      if (s && s.texture !== e) return i.slot;
    }
    return null;
  }
  /** The loop that puts filtered fields up, and the only thing that draws. */
  #Le() {
    this.#d === null && (!this.#D || this.#$ || (this.#F = 0, this.#d = this.#ge(this.#dt)));
  }
  #ft() {
    this.#Ye(this.#d), this.#d = null, this.#P();
  }
  #dt = (e) => {
    if (this.#d = null, !this.#D || this.#$) return;
    this.#oi(e);
    const t = this.#se;
    this.#n.flush(e), this.#ee(t) && (this.#w === "main" && this.#Ai(this.#N, e), this.#d = this.#ge(this.#dt));
  };
  /**
   * Fit a grid of refreshes (period and phase) to the animation frames. rAF
   * timestamps wander by a millisecond or so, which is more than the
   * nearest-refresh decision in #present can take; the grid is what it
   * compares against. A frame far off the grid restarts it. (otya)
   */
  #oi(e) {
    const t = e - this.#F;
    this.#F = e;
    const i = Math.max(1, Math.round(t / this.#M)), s = this.#N + i * this.#M, r = e - s;
    if (this.#N === 0 || t <= 0 || t > B || Math.abs(r) > this.#M / 4) {
      t >= 1 && t <= B && (this.#M = t), this.#N = e;
      return;
    }
    this.#M += r / i * Qe, this.#N = s + r * Ze;
  }
  /**
   * Where animation frames come from, and the clock their timestamps carry.
   *
   * For Worker rendering it is the host the Worker entry supplied, whose
   * frames are already this realm's. Otherwise it is the window of the
   * document the canvas is in, which is the window that composites it -- and
   * which a document picture-in-picture window becomes by adopting the
   * element. The element is consulted as well, because the two move together
   * and either may be read first while a move is in progress.
   */
  #Ct() {
    const e = this.#S;
    if (e)
      return { frames: e, origin: performance.timeOrigin };
    const t = this.#i.ownerDocument?.defaultView ?? this.#e.ownerDocument?.defaultView ?? null;
    return t === null ? { frames: Je, origin: performance.timeOrigin } : { frames: t, origin: t.performance.timeOrigin };
  }
  /**
   * Ask the current source for one frame, on this module's clock.
   *
   * An animation frame is timestamped against the clock of the window that
   * served it, and after an adoption that is not the clock the presentation
   * deadlines are on. The conversion belongs to the request rather than to
   * the callback: the source that was asked is the source that answers, so
   * the origin captured here is the right one however often the owner moves.
   */
  #ge(e) {
    const { frames: t, origin: i } = this.#Ct(), s = t.requestAnimationFrame(
      (r) => e(this.#lt(r, i))
    );
    return { frames: t, handle: s };
  }
  /** Cancel a pending animation frame through the source that issued it. */
  #Ye(e) {
    e?.frames.cancelAnimationFrame(e.handle);
  }
  /**
   * Follow the window that composites the canvas.
   *
   * A request already outstanding on the previous window is not merely late.
   * A window that has gone hidden serves no animation frames at all, so
   * waiting for that callback to notice the move waits for something that
   * will not happen; and cancelling it anywhere but on that same window
   * leaves it outstanding. Every other thing still being observed -- a frame
   * arriving, a layout, the old window saying it is going away -- re-points
   * both requests instead.
   *
   * Nothing queued moves: presentation deadlines are on this module's clock,
   * which no adoption changes. Only the refresh grid starts again, because a
   * grid describes one compositor and this is a different one.
   */
  #mt() {
    if (this.#S) return;
    this.#hi();
    const { frames: e } = this.#Ct(), t = this.#d !== null && this.#d.frames !== e, i = this.#m !== null && this.#m.frames !== e;
    !t && !i || (this.#F = 0, t && (this.#Ye(this.#d), this.#d = this.#ge(this.#dt)), i && (this.#Ye(this.#m), this.#m = this.#ge(this.#Et)));
  }
  /** Watch the current document for visibility changes and DOM adoption. */
  #hi() {
    const e = this.#S ? null : this.#i.ownerDocument ?? null;
    e !== this.#x && (this.#x?.removeEventListener(
      "visibilitychange",
      this.#pt
    ), this.#x = e, e?.addEventListener("visibilitychange", this.#pt), this.#V?.disconnect(), e && this.#V?.observe(e, { childList: !0, subtree: !0 }));
  }
  #pt = () => {
    this.#Z || this.#mt();
  };
  /** Deliver faster-playback captures even when a Worker owns the drawing loop. */
  #je() {
    this.#S || this.#m !== null || !this.#n.captureDriven || !this.#D || this.#$ || (this.#m = this.#ge(this.#Et));
  }
  /** Cancel the page's pending capture delivery. */
  #Bt() {
    this.#Ye(this.#m), this.#m = null;
  }
  /** Flush captured pictures on the refresh that will present them. */
  #Et = (e) => {
    if (this.#m = null, !this.#D || this.#$) return;
    const t = this.#se;
    this.#n.flush(e), this.#ee(t) && this.#n.captureDriven && (this.#m = this.#ge(this.#Et));
  };
  /**
   * Put up whichever filtered field belongs on the screen next.
   *
   * What is drawn during an animation frame reaches the screen at the composite
   * after it, so that is the moment being filled, and a field goes up at
   * whichever composite falls nearest the moment it stands for -- half a
   * refresh either side of it. Where two of them have come due since the last
   * one, only the newer is shown: a screen has one picture per refresh, and
   * the older of the two is a moment the viewer should already be past.
   *
   * Near the half-refresh boundary a picture goes the way the last one went,
   * so that the slip a cadence the refresh does not divide into must make
   * every so often happens once rather than flapping.
   */
  #Ai(e, t) {
    const i = this.#M / 2, s = (a) => {
      const c = a.at - e;
      return c <= i - j ? !0 : c > i + j ? !1 : this.#xe > 0;
    };
    for (; this.#f[1] && s(this.#f[1]); )
      this.#U.late++, this.#f.shift();
    const r = this.#f[0];
    if (!r || !s(r)) return;
    this.#f.shift(), this.#xe = r.at - e;
    const o = performance.now(), h = this.#Mt(!0);
    this.#kt(r.slot), this.#Ve(h), this.#Me += performance.now() - o, this.#le++, this.#z && this.#ai(r, t), this.#H = t;
  }
  /** Preserve upstream's opt-in presentation timing log in either renderer. */
  #ai(e, t) {
    const i = this.#H === 0 ? 0 : t - this.#H, s = i / this.#M, r = e.cadence === "film" ? `phase ${e.phase}` : e.cadence === "field" ? `field ${e.phase}` : "frame", o = e.phase === 0 ? "duplicate" : `phase ${O}`, h = e.droppedBefore > 0 ? `, ${o} dropped before it` + (e.droppedBefore > 1 ? ` (${e.droppedBefore})` : "") : "";
    console.log(
      `yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at - t).toFixed(2)} ms${h}`
    );
  }
  /** Copy one of the filtered pictures onto the canvas. */
  #kt(e) {
    const t = this.#a[e];
    t && this.#vt(t.texture);
  }
  /** Put a progressive frame through unchanged, keeping one display surface. */
  #li() {
    this.#It();
    const e = this.#E[this.#B];
    e && this.#vt(e, !0), this.#R = 0;
  }
  /** Apply visibility on the page; a Worker reports only the desired state. */
  #te(e) {
    if (this.#S) {
      this.#S.onVisibility(e);
      return;
    }
    this.#i.style.visibility = e ? "visible" : "hidden";
  }
  #vt(e, t = !1, i = !0) {
    const s = this.#s;
    s.bindFramebuffer(s.FRAMEBUFFER, null), s.useProgram(this.#T), s.activeTexture(s.TEXTURE0), s.bindTexture(s.TEXTURE_2D, e), s.uniform1i(this.#v, 0), s.uniform1i(this.#p, t ? 1 : 0), s.viewport(0, 0, this.#C, this.#W), s.drawArrays(s.TRIANGLES, 0, 3), this.#h = { kind: "texture", texture: e, flip: t }, this.#te(!0), i && this.#X++;
  }
  /**
   * Account for the frames between this one and the last one seen.
   *
   * There is no event for a frame the callback was not run for; the only sign
   * of one is that the count of frames went up by more than one. That count
   * is the compositor's where it gives one, and otherwise the one VideoFrames
   * keeps. Frames thrown away either side of a discontinuity are not
   * counted: the held frames were being dropped anyway, and a seek presents
   * what it passes over.
   *
   * Returns how many frames were missed between the last one and this one.
   */
  #ui(e, t) {
    let i = 0;
    return this.#_e !== 0 && !t && (i = Math.max(0, e - this.#_e - 1), this.#U.missed += i), this.#_e = e, i;
  }
  /**
   * Frames stopped arriving for a while -- a pause, a stall, a tab in the
   * background -- and a rate averaged over time nothing was asked of the
   * filter says nothing about it. Begin the interval at this frame.
   */
  #Lt(e) {
    e - this.#Oe <= Q || (this.#Xe = e, this.#q = 0, this.#ae = 0, this.#le = 0, this.#Me = 0, this.#ue = 0, this.#X = 0, this.#Se = 0, this.#de = 0, this.#Pe = 0, this.#me = 0);
  }
  #Ut(e) {
    const t = e - this.#Xe;
    if (t < Q) return;
    const i = this.#Qe() && (this.#L || this.#K) ? this.#le : this.#q, s = this.#q ? (this.#ae + this.#Me) / this.#q : 0;
    let r;
    this.#ce != null && (r = 0, this.#de !== 0 && (r += this.#Se / 1e6 / this.#de), this.#me !== 0 && (r += this.#Pe / 1e6 / this.#me / 2));
    const o = {
      ...this.#U,
      // The element's own count of what its decoder could not keep up with,
      // which is the machine being behind rather than this filter.
      dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0,
      fps: i * 1e3 / t,
      frameMs: s,
      maxQueuedFields: this.#ue,
      outputFps: this.#X * 1e3 / t,
      gpuMs: r,
      film: this.#K,
      filmError: this.#re
    };
    this.dispatchEvent(new CustomEvent("stats", { detail: o })), this.#Ke?.(o), this.#Xe = e, this.#q = 0, this.#ae = 0, this.#le = 0, this.#Me = 0, this.#ue = 0, this.#X = 0, this.#Se = 0, this.#de = 0, this.#Pe = 0, this.#me = 0;
  }
  /** Take the newest frame into the ring. */
  #It() {
    const e = this.#s;
    this.#B = (this.#B + 1) % b;
    const t = this.#o, i = this.#E[this.#B];
    t !== null && this.#u !== null && i !== void 0 ? (this.#E[this.#B] = this.#u.adopt(t, i), this.#o = null) : (e.bindTexture(e.TEXTURE_2D, i ?? null), e.texImage2D(
      e.TEXTURE_2D,
      0,
      e.RGBA,
      e.RGBA,
      e.UNSIGNED_BYTE,
      this.#he
    )), this.#R = Math.min(this.#R + 1, b);
  }
  /**
   * Filter one frame, onto the canvas or into an output texture.
   *
   * A null `target` is the canvas itself, which is where the picture goes when
   * there is one per frame and nothing to schedule. An output framebuffer is a
   * field being kept for its moment.
   *
   * `second` asks for the frame's other field: the same three frames filtered
   * the other way round, keeping the field that came second and rebuilding
   * the first. The shader takes the pair of frames the missing line sits
   * between from the parity, so this is the whole of it.
   *
   * With `film` on, the shader is also given the field metrics, and puts a
   * film frame back together rather than filtering it.
   */
  #ne(e, t, i, s = !0) {
    if (this.#R === 0 || this.#$) return;
    s && (this.#R === b && !e ? this.#U.filtered++ : this.#U.degraded++);
    const r = this.#s, { prev: o, cur: h, next: a } = this.#Nt(e);
    r.bindFramebuffer(r.FRAMEBUFFER, i), r.useProgram(this.#c);
    for (const [u, l] of [o, h, a].entries())
      r.activeTexture(r.TEXTURE0 + u), r.bindTexture(r.TEXTURE_2D, this.#E[l] ?? null);
    r.uniform1i(this.#r.prev, 0), r.uniform1i(this.#r.cur, 1), r.uniform1i(this.#r.next, 2);
    const c = this.#_ ? this.#A?.texture ?? null : null, A = this.#_ ? this.#A?.combTexture ?? null : null, f = c !== null && A !== null;
    c !== null && A !== null && (r.activeTexture(r.TEXTURE0 + 3), r.bindTexture(r.TEXTURE_2D, c), r.uniform1i(this.#r.fieldMetrics, 3), r.activeTexture(r.TEXTURE0 + 4), r.bindTexture(r.TEXTURE_2D, A), r.uniform1i(this.#r.comb, 4)), r.uniform2i(this.#r.size, this.#C, this.#W);
    const m = this.#xt ? 0 : 1;
    r.uniform1i(this.#r.parity, t ? 1 - m : m), r.uniform1i(this.#r.tff, this.#xt ? 1 : 0), r.uniform1i(this.#r.second, t ? 1 : 0), r.uniform1i(this.#r.spatialCheck, this.#G ? 1 : 0), r.uniform1i(this.#r.debug, this.#z ? 1 : 0), r.uniform1i(this.#r.film, f ? 1 : 0), r.uniform1i(this.#r.phase, this.#I.phase), r.viewport(0, 0, this.#C, this.#W), r.drawArrays(r.TRIANGLES, 0, 3), this.#z && f && this.#Kt(this.#gt, 0, 90), i === null && (this.#h = { kind: "yadif", flush: e, second: t }, this.#te(!0), s && this.#X++);
  }
  #Nt(e) {
    const t = (i) => (this.#B + b - i) % b;
    return this.#R === 1 ? { prev: this.#B, cur: this.#B, next: this.#B } : e ? { prev: t(1), cur: this.#B, next: this.#B } : this.#R === 2 ? { prev: t(1), cur: t(1), next: this.#B } : { prev: t(2), cur: t(1), next: this.#B };
  }
  /**
   * Put the canvas exactly where the element's picture is.
   *
   * The buffer holds coded pixels and is stretched across a box of the shape
   * the picture is meant to be seen in, which is what applies the sample
   * aspect ratio -- the same stretch the element does with its own picture.
   * The box itself is the picture's, not the element's: a media element fits
   * its picture inside its box and this has to land on top of that, so the fit
   * is worked out again here. It assumes the element's `object-fit` is the
   * `contain` it is by default.
   */
  #Ue() {
    if (this.#mt(), !this.#k) return;
    const e = this.#e, t = e.videoWidth, i = e.videoHeight;
    if (t === 0 || i === 0) return;
    const s = Math.min(
      e.offsetWidth / t,
      e.offsetHeight / i
    ), r = t * s, o = i * s;
    this.#i.style.left = `${e.offsetLeft + (e.offsetWidth - r) / 2}px`, this.#i.style.top = `${e.offsetTop + (e.offsetHeight - o) / 2}px`, this.#i.style.width = `${r}px`, this.#i.style.height = `${o}px`;
  }
  #Gt(e, t) {
    const i = this.#s;
    this.#t.width = e, this.#t.height = t, this.#C = e, this.#W = t, this.#R = 0, this.#h = null, this.#P(), this.#Ue();
    for (const s of this.#E) i.deleteTexture(s);
    this.#E = [];
    for (let s = 0; s < b; s++) {
      const r = i.createTexture();
      i.bindTexture(i.TEXTURE_2D, r), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_MIN_FILTER, i.NEAREST), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_MAG_FILTER, i.NEAREST), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_WRAP_S, i.CLAMP_TO_EDGE), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_WRAP_T, i.CLAMP_TO_EDGE), i.texImage2D(
        i.TEXTURE_2D,
        0,
        i.RGBA,
        e,
        t,
        0,
        i.RGBA,
        i.UNSIGNED_BYTE,
        null
      ), this.#E.push(r);
    }
    this.#Ie(), (this.#L || this.#_) && this.#Ot(), this.#A?.resize(e, t), this.#be();
  }
  /**
   * Somewhere to keep a filtered field until its moment comes.
   *
   * A frame's worth of texture each, so they exist only while a picture is
   * being shown for every field. Where a framebuffer will not take one -- an
   * implementation that will not render to RGBA8, or memory it will not find
   * -- the whole lot goes and the fields are drawn as their frames arrive,
   * which is the timing this replaces but is still a picture.
   */
  #Ot() {
    const e = this.#s;
    if (!(this.#a.length === w || this.#C === 0)) {
      this.#Ie();
      for (let t = 0; t < w; t++) {
        const i = e.createTexture();
        e.bindTexture(e.TEXTURE_2D, i), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), e.texImage2D(
          e.TEXTURE_2D,
          0,
          e.RGBA,
          this.#C,
          this.#W,
          0,
          e.RGBA,
          e.UNSIGNED_BYTE,
          null
        );
        const s = e.createFramebuffer();
        e.bindFramebuffer(e.FRAMEBUFFER, s), e.framebufferTexture2D(
          e.FRAMEBUFFER,
          e.COLOR_ATTACHMENT0,
          e.TEXTURE_2D,
          i,
          0
        );
        const r = e.checkFramebufferStatus(e.FRAMEBUFFER) === e.FRAMEBUFFER_COMPLETE;
        if (e.bindFramebuffer(e.FRAMEBUFFER, null), !r) {
          e.deleteFramebuffer(s), e.deleteTexture(i), this.#Ie();
          return;
        }
        this.#a.push({ texture: i, framebuffer: s });
      }
      this.#l = w - 1;
    }
  }
  #Ie() {
    const e = this.#s, t = this.#h?.kind === "texture" ? this.#h.texture : null;
    this.#a.some((i) => i.texture === t) && (this.#h = null);
    for (const { texture: i, framebuffer: s } of this.#a)
      e.deleteFramebuffer(s), e.deleteTexture(i);
    this.#a = [], this.#P();
  }
  /**
   * Wrap the element in a `<div>` of this one's own and put the canvas over
   * it. The wrapper is what the canvas is positioned against; moving the
   * element out of the tree and back within the one task leaves playback
   * alone, which is what makes turning this on mid-stream free.
   */
  #ci() {
    if (this.#k) return;
    const e = this.#e.parentElement;
    if (!e) return;
    const t = document.createElement("div");
    t.style.cssText = "position:relative;display:inline-block;line-height:0;max-width:100%", e.insertBefore(t, this.#e), t.appendChild(this.#e), t.appendChild(this.#i), this.#k = t, this.#we?.observe(this.#e), this.#Ue();
  }
  #fi() {
    if (this.#S) return;
    const e = this.#k;
    this.#k = null, this.#we?.disconnect(), this.#i.remove(), e?.parentElement && (e.parentElement.insertBefore(this.#e, e), e.remove());
  }
  #Xt = () => this.#Ue();
  /** Forward a media event with the page's playback state that gives it meaning. */
  #bt(e) {
    return !this.#g || this.#w === "main" ? !1 : (this.#g.postMessage({
      type: "event",
      name: e,
      video: this.#at()
    }), !0);
  }
  #zt = () => {
    if (this.#bt("emptied")) {
      this.#J(), this.#te(!1);
      return;
    }
    this.#R = 0, this.#Te = 0, this.#qe = 0, this.#P(), this.#Y(), this.#b = 0, this.#Wt(), this.#h = null, this.#te(!1);
  };
  #Wt() {
    this.#U = {
      filtered: 0,
      missed: 0,
      degraded: 0,
      discontinuities: 0,
      resynced: 0,
      late: 0,
      queueResetted: 0
    }, this.#We.fill(0), this.#st = 0, this.#_e = 0, this.#Xe = 0, this.#Oe = 0, this.#q = 0, this.#ae = 0, this.#le = 0, this.#Me = 0, this.#ue = 0, this.#X = 0, this.#P(), this.#Se = 0, this.#de = 0, this.#Pe = 0, this.#me = 0;
  }
  /**
   * A new seek invalidates any destination frame remembered for the last one.
   */
  #Ht = () => {
    if (this.#bt("seeking")) {
      this.#J();
      return;
    }
    this.#ye = !1;
  };
  /**
   * Playback stopped, so the frame being held back goes up now. One picture,
   * whatever the rate: a still frame stands for a moment, and the moment is
   * the one the first field was taken at.
   */
  #ie = (e) => {
    if (e.type === "ratechange" && (this.#n.captureDriven ? this.#je() : this.#Bt()), (e.type === "pause" || e.type === "ended" || e.type === "seeked" || e.type === "ratechange") && this.#bt(e.type)) {
      this.#J();
      return;
    }
    if (e.type === "seeked") {
      const i = this.#ye;
      if (this.#ye = !1, i) return;
      this.#R = 0, this.#P(), this.#Y(), this.#h = null, this.#te(!1);
      return;
    }
    const t = e.type === "ratechange";
    if (t && (this.#b = 0, this.#Te = this.#e.currentTime), this.#P(), this.#D && this.#R > 0) {
      const i = this.#Pt(), s = i === null ? void 0 : this.#a[i];
      i !== null && s ? (this.#l = i, this.#ne(!0, !1, s.framebuffer), this.#kt(i)) : this.#ne(!0, !1, null);
    }
    t && (this.#R = 0, this.#_e = 0, this.#Y());
  };
  /**
   * A lost context takes the textures and the program with it. Rebuilding
   * them is possible, but a page that has lost its context has bigger
   * problems; getting out of the way leaves the element's own picture showing.
   */
  #Vt = (e) => {
    if (e.preventDefault(), this.#S) {
      this.#S.onFailure("the deinterlacer WebGL context was lost");
      return;
    }
    this.#w !== "active" && (this.#$ = !0, this.#ht("the deinterlacer WebGL context was lost"), this.stop());
  };
}
function q(n, e) {
  const t = n.createProgram(), i = K(n, n.VERTEX_SHADER, He), s = K(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(t, i), n.attachShader(t, s), n.linkProgram(t), n.deleteShader(i), n.deleteShader(s), !n.getProgramParameter(t, n.LINK_STATUS)) {
    const r = n.getProgramInfoLog(t);
    throw n.deleteProgram(t), new Error(
      `the deinterlacer failed to link: ${r ?? "no reason given"}`
    );
  }
  return t;
}
function K(n, e, t) {
  const i = n.createShader(e);
  if (!i) throw new Error("the deinterlacer could not create a shader");
  if (n.shaderSource(i, t), n.compileShader(i), !n.getShaderParameter(i, n.COMPILE_STATUS)) {
    const s = n.getShaderInfoLog(i);
    throw n.deleteShader(i), new Error(
      `the deinterlacer failed to compile: ${s ?? "no reason given"}`
    );
  }
  return i;
}
const J = "data:video/mp4;base64,AAAAHGZ0eXBpc281AAACAGlzbzVpc282bXA0MQAAAu9tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAB8nRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAFoAAABDgAAAAAAY5tZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAHUwAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAE5bWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAA+XN0YmwAAACtc3RzZAAAAAAAAAABAAAAnWF2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAFoAQ4AEgAAABIAAAAAAAAAAEVTGF2YzYxLjE5LjEwMSBsaWJ4MjY0AAAAAAAAAAAAAAAY//8AAAA3YXZjQwFkACn/4QAZZ2QAKazZQFoET94CIAAAfSAAHUwD4sWywAEAB2j5KBLLIsD9+PgAAAAAEHBhc3AAAAABAAAAAQAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAAKG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAAAAAAAAAAAAAAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuNy4xMDAAAACYbW9vZgAAABBtZmhkAAAAAAAAAAEAAACAdHJhZgAAABx0ZmhkAAIAOAAAAAEAAAPpAAAEJwEBAAAAAAAUdGZkdAEAAAAAAAAAAAAAAAAAAEh0cnVuAAAKBQAAAAYAAACgAgAAAAAABCcAAAfSAAAAQgAAE40AAAA/AAAH0gAAAgAAAAAAAAAARAAAA+kAAAG7AAAH0gAACK9tZGF0AAACrwYF//+r3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTQgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDEzMyBtZT11bWggc3VibWU9MTAgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0yNCBjaHJvbWFfbWU9MSB0cmVsbGlzPTIgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xNSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9dGZmIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTIgYl9iaWFzPTAgZGlyZWN0PTMgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0wIGtleWludD0zMCBrZXlpbnRfbWluPTMgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD0zMCByYz1jcmYgbWJ0cmVlPTEgY3JmPTguMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAUGAQEygAAAAWdliIICAj/+/76ivgU3edyfbbnP6kzu1BfFPXa9rMu/FCi/GMk76JT20AAAAwAAAwAAAwAAAwAAAwAAAwEJmrWZnq7KhXxVTgAAAwAAAwAAAwAABJ9gAAADAAAKtgAAAwAAAwCi4AAAAwAAHQgAAAMAAAiqAAADAAADA7EAAAMAAAMCCgAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAL+QAAAAUGAQEygAAAADVBmiIWQj/51kP//f3t2AAPsAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAS8AAAAAUGAQEygAAAADJBnkETiEf/hv/80gAJcAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAkIQAAAAUGAQEygAAAAfMBnmCTRCP/9ZJR/1zH/6vL5qeSOTmASFdQlObW+4YAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAxvEAAAAwAAAwAAAwAAE4wAAAMAAAMAAAMAAFuAAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAMuAAAAABQYBATKAAAAANwGeYZakI//1bXH/Een/+rAALngAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAN+EAAAAFBgEBMoAAAAGuQZpileloiEf/2XyP/Fn/6mXyw21/v4X7ly3FFO60AAADAAADAAADAAADAAADAAADAAADADKWVJAQiFeS9HQZhFSJuVc/HAAAAwAAAwAAAwAAAwAAAwAAAwAAj8AAAAMAAAMABTIAAAMAAAMAAD+QAAADAAADAAQkAAADAAADAABJgAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAXUQAAAENtZnJhAAAAK3RmcmEBAAAAAAAAAQAAAAAAAAABAAAAAAAAB9IAAAAAAAADCwEBAQAAABBtZnJvAAAAAAAAAEM=", et = 0.5, tt = 3e3, ee = 0.1, F = 16, te = 'video/mp4; codecs="avc1.640029"';
let z = null;
function it(n = {}) {
  return z ??= st(n), z;
}
async function lt(n = {}) {
  return (await it(n)).deinterlaces;
}
function ut() {
  z = null;
}
async function st(n) {
  const e = n.tolerance ?? et, t = n.timeoutMs ?? tt, i = performance.now(), s = (h) => ({
    deinterlaces: !1,
    survives: null,
    tookMs: performance.now() - i,
    error: h instanceof Error ? h.message : String(h)
  });
  if (typeof document > "u")
    return s(new Error("there is no document to decode in"));
  const r = document.createElement("video");
  r.muted = !0, r.defaultMuted = !0, r.playsInline = !0, r.preload = "auto";
  let o = null;
  try {
    o = nt(r, t);
    const h = L(k(r, "loadeddata"), t), a = r.play().then(
      () => !0,
      () => !1
    );
    if (await o.ready, await h, await ot(r, t, await a), r.videoWidth === 0 || r.videoHeight === 0)
      return s(new Error("the probe clip decoded to nothing"));
    const c = ht(r);
    return {
      deinterlaces: c < 1 - e,
      survives: c,
      tookMs: performance.now() - i
    };
  } catch (h) {
    return s(h);
  } finally {
    r.pause(), r.removeAttribute("src"), r.replaceChildren(), r.load(), o && URL.revokeObjectURL(o.url);
  }
}
const G = typeof MediaSource > "u" ? globalThis.ManagedMediaSource : MediaSource, rt = typeof MediaSource > "u";
function nt(n, e) {
  if (!G || !G.isTypeSupported(te))
    throw new Error("the probe clip needs Media Source Extensions");
  const t = J.indexOf(","), i = atob(J.slice(t + 1)), s = new Uint8Array(i.length);
  for (let a = 0; a < i.length; a++) s[a] = i.charCodeAt(a);
  const r = new G(), o = URL.createObjectURL(r);
  if (rt) {
    n.disableRemotePlayback = !0;
    const a = document.createElement("source");
    a.type = "video/mp4", a.src = o, n.append(a), n.load();
  } else
    n.src = o;
  const h = (async () => {
    await L(k(r, "sourceopen"), e);
    const a = r.addSourceBuffer(te), c = L(k(a, "updateend"), e);
    a.appendBuffer(s), await c, r.endOfStream();
  })();
  return { url: o, ready: h };
}
async function ot(n, e, t) {
  if (t) {
    const i = performance.now();
    for (; n.currentTime < ee && performance.now() - i < e; )
      await new Promise((s) => requestAnimationFrame(s));
    n.pause();
  } else
    n.currentTime = ee, await L(k(n, "seeked"), e);
}
function ht(n) {
  const e = n.videoHeight, t = document.createElement("canvas");
  t.width = F, t.height = e;
  const i = t.getContext("2d", { willReadFrequently: !0 });
  if (!i) throw new Error("there is no 2d context to read the clip with");
  i.imageSmoothingEnabled = !1, i.drawImage(n, 0, 0, F, e);
  const s = i.getImageData(0, 0, F, e).data, r = (A) => {
    let f = 0;
    for (let m = 0; m < F; m++)
      f += s[(A * F + m) * 4 + 1] ?? 0;
    return f / F;
  };
  let o = 0;
  const h = 2, a = e - 3;
  let c = r(h);
  for (let A = h + 1; A <= a; A++) {
    const f = r(A);
    o += Math.abs(f - c), c = f;
  }
  return o / (a - h) / 255;
}
function k(n, e) {
  return new Promise((t, i) => {
    n.addEventListener(e, () => t(), { once: !0 }), n.addEventListener(
      "error",
      () => {
        const s = n instanceof HTMLMediaElement ? n.error : null, r = s ? ` (MediaError ${s.code}${s.message ? `: ${s.message}` : ""})` : "";
        i(new Error(`the probe clip ${e} failed${r}`));
      },
      { once: !0 }
    );
  });
}
function L(n, e) {
  return Promise.race([
    n,
    new Promise(
      (t, i) => setTimeout(
        () => i(new Error("the probe clip took too long")),
        e
      )
    )
  ]);
}
Xe(ae);
export {
  at as Deinterlacer,
  De as YADIF_FRAGMENT_SHADER,
  Re as YADIF_UNIFORMS,
  lt as decoderDeinterlaces,
  ut as forgetDecoderProbe,
  it as probeDecoder,
  At as supportsDeinterlace
};
//# sourceMappingURL=index.js.map
