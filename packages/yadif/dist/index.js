const le = "" + new URL("assets/worker-CC0S3qLS.js", import.meta.url).href, M = `#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;
function _(n, e, t) {
  const i = n.createProgram(), s = $(n, n.VERTEX_SHADER, t), r = $(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(i, s), n.attachShader(i, r), n.linkProgram(i), n.deleteShader(s), n.deleteShader(r), !n.getProgramParameter(i, n.LINK_STATUS)) {
    const o = n.getProgramInfoLog(i);
    throw n.deleteProgram(i), new Error(
      `the deinterlacer failed to link: ${o ?? "no reason given"}`
    );
  }
  return i;
}
function $(n, e, t) {
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
const ce = `#version 300 es
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
function fe(n, e) {
  const t = _(n, ce, ue), i = n.getAttribLocation(t, "aVertexPosition"), s = n.getAttribLocation(t, "aTextureCoord"), r = n.getUniformLocation(t, "uTexture"), o = n.getUniformLocation(t, "uMatrix"), h = n.getUniformLocation(t, "uUvMatrix"), a = n.getUniformLocation(t, "uTextColor"), c = n.getUniformLocation(t, "uBackColor");
  if (r == null || o == null || h == null || a == null || c == null)
    throw new Error(
      "failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER"
    );
  const A = n.createBuffer(), f = n.createBuffer();
  return {
    gl: n,
    ...de(n, e),
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
function de(n, e) {
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
function me(n) {
  const e = n.gl;
  e.deleteBuffer(n.positionBuffer), e.deleteBuffer(n.textureBuffer), e.deleteTexture(n.fontTexture), e.deleteProgram(n.program);
}
function pe(n, e, t, i, s, r, o) {
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
    const l = Math.floor(t - u.metrics.actualBoundingBoxLeft), d = Math.floor(i - u.metrics.actualBoundingBoxAscent), v = l + u.width, E = d + u.height;
    h.push(l, d), a.push(u.x, u.y), h.push(l, E), a.push(u.x, u.y + u.height), h.push(l + u.width, E), a.push(u.x + u.width, u.y + u.height), h.push(v, E), a.push(u.x + u.width, u.y + u.height), h.push(l, d), a.push(u.x, u.y), h.push(v, d), a.push(u.x + u.width, u.y), t += u.metrics.width;
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
    for (let v = 0; v < u; v++)
      for (let E = 0; E < m; E++)
        d.push(l[E * m + v]);
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
  phase: 6,
  /**
   * `(score, clean, combed blocks, on)`: how settled it is that both fields
   * of each frame are one instant, and whether that is the verdict. See the
   * `instant` function of METRICS.
   */
  instant: 7
}, y = 8, b = 16, B = 8, ve = 15, Ee = 6, be = 8, ge = 30, xe = 0.01, Te = 2e-3, se = 2, X = 1, we = 2, H = 10, ye = {
  a: "uA",
  b: "uB",
  fieldMetrics: "uFieldMetrics",
  first: "uFirst",
  size: "uSize"
}, re = 16, ne = 8, Fe = `#version 300 es

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
  const int BLOCK_W = ${re};
  const int BLOCK_H = ${ne};

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
`, Re = {
  second: "uSecond",
  first: "uFirst",
  size: "uSize"
}, S = 8, De = `#version 300 es
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
`, _e = {
  previous: "uPrevious",
  second: "uSecond",
  first: "uFirst",
  comb: "uComb",
  size: "uSize"
}, Me = `#version 300 es
precision highp float;

uniform sampler2D uPrevious;
uniform sampler2D uSecond;
uniform sampler2D uFirst;
/** The comb counts of the frame being decided, as it stands. */
uniform sampler2D uComb;

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
  return differing <= ${se}.0;
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
  bool believed = run >= ${H}.0;
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

/**
 * The instant texel: see INSTANT_ON. The frame counts as moving by its
 * difference from the frame before, the same pair the comb count looks at:
 * that count only sees what changed since then, so a frame unchanged from
 * the one before has nothing to show however much the next one differs.
 */
vec4 instant(vec4 last, vec4 dSecondPrevious, vec4 dFirstPrevious)
{
  float score = last[0];
  if (max(dSecondPrevious[2], dFirstPrevious[2]) <= ${Te}) return vec4(score, 0.0, 0.0, last[3]);
  ivec2 blocks = textureSize(uComb, 0);
  float combed = 0.0;
  for (int y = 0; y < blocks.y; ++y) {
    for (int x = 0; x < blocks.x; ++x) {
      if (texelFetch(uComb, ivec2(x, y), 0)[0] > ${B}.0) combed += 1.0;
    }
  }
  bool clean = combed <= ${xe} * float(blocks.x * blocks.y);
  score = clean ? min(score + 1.0, ${ge}.0) : max(score - ${be}.0, 0.0);
  bool on = last[3] > 0.5 ? score >= ${Ee}.0 : score >= ${ve}.0;
  return vec4(score, clean ? 1.0 : 0.0, combed, on ? 1.0 : 0.0);
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
  } else if (metric == ${p.instant}) {
    outValue = instant(
      previous(${p.instant}),
      previous(${p.secondRepeatsNext}),
      previous(${p.firstRepeatsNext})
    );
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
`, Se = {
  prev: "uPrev",
  cur: "uCur",
  first: "uFirst",
  size: "uSize"
}, Pe = `#version 300 es
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
  ivec2 base = block * ${b};
  float standing = 0.0;
  float woven = 0.0;
  for (int dy = 0; dy < ${b}; ++dy) {
    int y = base.y + dy;
    if (y >= uSize.y || (y & 1) == uFirst) continue;
    for (int dx = 0; dx < ${b}; ++dx) {
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
`, Ce = {
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
  comb: "uComb",
  combAhead: "uCombAhead",
  match: "uMatch",
  instant: "uInstant"
}, ke = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform sampler2D uNext;
uniform sampler2D uFieldMetrics;
uniform sampler2D uComb;
uniform sampler2D uCombAhead;
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
/** Whether a missing line may be taken from a neighbouring field that fits. */
uniform bool uMatch;
/** Whether it may where the frames have been found to be one instant each. */
uniform bool uInstant;
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
  return texelFetch(uFieldMetrics, ivec2(metric, 0), 0)[1] <= ${se}.0;
}

/** The pulldown phase the detection gave this frame, or 0. See film-shader.ts. */
int detectedPhase() {
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${p.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${H}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${X} || phase == ${we};
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

/**
 * Take a missing line from the field it was captured with, if there is one.
 *
 * Film keeps arriving as film when its cadence is lost: at a cut made after
 * pulldown the cycle starts again somewhere else, and the phase is unknown
 * until two cycles have gone by. Each field still has a partner from the same
 * film frame all the while, and which one it is can be seen without knowing
 * the phase: the other field of this frame, or the adjoining field of the
 * neighbouring frame -- the second field of the one before for a first
 * field, the first field of the one after for a second. Whichever leaves the
 * block less combed is woven in, and a block neither leaves clean is left to
 * the filter, as it is when a film weave would comb.
 *
 * Real video has no such partner, but a block that barely moves can look as
 * if it had one, so the neighbouring frames are looked to only shortly
 * after film (neighbours). Where the frames have been found to hold one
 * instant each the partner is the frame's own other field and nothing else:
 * both fields of a frame then come out as the same whole picture, apart
 * from blocks that comb as the frame stands, which are filtered.
 */
bool matched(int x, int y, bool neighbours, out vec3 rgb) {
  ivec2 block = ivec2(x / ${b}, y / ${b});
  float standing = texelFetch(uComb, block, 0)[0];
  if (!neighbours) {
    if (standing > ${B}.0) return false;
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
    return true;
  }
  float adjoining = uSecond ? texelFetch(uCombAhead, block, 0)[1]
                            : texelFetch(uComb, block, 0)[1];
  if (min(standing, adjoining) > ${B}.0) return false;
  if (standing <= adjoining) {
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
  } else if (uSecond) {
    rgb = texelFetch(uNext, ivec2(x, y), 0).rgb;
  } else {
    rgb = texelFetch(uPrev, ivec2(x, y), 0).rgb;
  }
  return true;
}

/** Whether the detection has settled that both fields of a frame are one instant. */
bool oneInstant() {
  return texelFetch(uFieldMetrics, ivec2(${p.instant}, 0), 0)[3] > 0.5;
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
    vec4 comb = texelFetch(uComb, ivec2(x / ${b}, y / ${b}), 0);
    bool combedBlock = (mixed ? comb[1] : comb[0]) > ${B}.0;
    if ((y & 1) != uParity &&
        (combedBlock || (detectedPhase() == 4 && movingComb(rgb, x, y))))
      rgb = filterPixel(uPrev, uCur, x, y);
  } else if ((y & 1) == uParity) {
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
  } else if ((uMatch || (uInstant && oneInstant())) && matched(x, y, uMatch, rgb)) {
    // Woven from the field that fits.
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
  #h;
  #f;
  #A;
  #s;
  #o;
  #d;
  /** The block comparisons of both fields, and the same folded most of the way. */
  #r = null;
  #T = null;
  /** Combed pixels per block of the frame being filtered, both ways of weaving it. */
  #v = null;
  /** The same for the frame after it. */
  #E = null;
  /** The field metrics (see FIELD_METRICS) of this frame and the one before. */
  #c = null;
  /** Which of the two holds the newest metrics. */
  #u = 0;
  /** The metrics being read back asynchronously. */
  #a = null;
  #n = null;
  #l = 0;
  #b = 0;
  /** The last metrics read back, laid out as FIELD_METRICS says. */
  metrics = new Float32Array(y * 4);
  #R = 0;
  #p = 0;
  constructor(e) {
    this.#t = e, this.#i = _(
      e,
      Fe,
      M
    ), this.#e = C(
      e,
      this.#i,
      ye
    ), this.#h = _(
      e,
      De,
      M
    ), this.#f = C(
      e,
      this.#h,
      Re
    ), this.#A = _(
      e,
      Me,
      M
    ), this.#s = C(e, this.#A, _e), this.#o = _(e, Pe, M), this.#d = C(e, this.#o, Se);
  }
  /** The newest measurements, or null before any frame has been measured. */
  get texture() {
    return this.#c?.[this.#u]?.textures[0] ?? null;
  }
  /**
   * Combed pixels per block of the frame last measured by `measureComb`, or
   * null before one has been. See COMB_FRAGMENT_SHADER.
   */
  get combTexture() {
    return this.#v?.textures[0] ?? null;
  }
  /** Combed pixels per block of the frame last measured ahead, or null. */
  get combAheadTexture() {
    return this.#E?.textures[0] ?? null;
  }
  /** The size of the frames to be measured, which sizes the block grid. */
  resize(e, t) {
    e === this.#R && t === this.#p || (this.#R = e, this.#p = t, this.#z());
  }
  /**
   * Forget the measurements: the next frame starts a cycle from nothing.
   * `keepInstant` leaves the one-instant score as it is, for a gap in the
   * frames seen that does not mean the content has changed.
   */
  reset(e = !1) {
    const t = this.#t;
    t.deleteSync(this.#n), this.#n = null, this.#l = 0;
    const i = this.#c?.[this.#u];
    if (!i) return;
    const s = e ? p.instant : y, r = new Float32Array(s * 4);
    for (let o = 0; o < p.phase; o++)
      r[o * 4 + 1] = 1;
    t.bindTexture(t.TEXTURE_2D, i.textures[0] ?? null), t.texSubImage2D(
      t.TEXTURE_2D,
      0,
      0,
      0,
      s,
      1,
      t.RGBA,
      t.FLOAT,
      r
    );
  }
  /**
   * Detect the pulldown phase of `cur`, the frame being filtered, against
   * `next`, and start reading it back. Only the two comparisons against the
   * next frame are measured; the rest are earlier ones moved along a frame.
   * `first` is the parity of the field that was captured first.
   *
   * Whether the frame's two fields are one instant is scored in the same
   * pass, from the comb counts of the frame as it stands: `measureComb` for
   * this frame has to have run before this.
   */
  detect(e, t, i) {
    const s = this.#t;
    if (this.#R === 0 || this.#p === 0) return;
    this.#w();
    const r = this.#r, o = this.#T, h = this.#c;
    if (r === null || o === null || h === null) return;
    const a = h[this.#u], c = h[1 - this.#u];
    if (s.bindFramebuffer(s.FRAMEBUFFER, r.framebuffer), s.useProgram(this.#i), this.#m(0, e, this.#e.a), this.#m(1, t, this.#e.b), this.#m(2, a.textures[0], this.#e.fieldMetrics), s.uniform1i(this.#e.first, i), s.uniform2i(this.#e.size, this.#R, this.#p), s.viewport(0, 0, r.width, r.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, o.framebuffer), s.useProgram(this.#h), this.#m(0, r.textures[0], this.#f.second), this.#m(1, r.textures[1], this.#f.first), s.uniform2i(this.#f.size, r.width, r.height), s.viewport(0, 0, o.width, o.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, c.framebuffer), s.useProgram(this.#A), this.#m(0, a.textures[0], this.#s.previous), this.#m(1, o.textures[0], this.#s.second), this.#m(2, o.textures[1], this.#s.first), this.#m(3, this.#v?.textures[0], this.#s.comb), s.uniform2i(this.#s.size, o.width, o.height), s.viewport(0, 0, y, 1), s.drawArrays(s.TRIANGLES, 0, 3), this.#u = 1 - this.#u, this.#l++, this.#n !== null) {
      s.bindFramebuffer(s.FRAMEBUFFER, null);
      return;
    }
    this.#b = this.#l, s.bindBuffer(s.PIXEL_PACK_BUFFER, this.#a), s.readPixels(0, 0, y, 1, s.RGBA, s.FLOAT, 0), s.bindBuffer(s.PIXEL_PACK_BUFFER, null), s.bindFramebuffer(s.FRAMEBUFFER, null), this.#n = s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE, 0), s.flush();
  }
  /**
   * Count the combing each way of weaving `cur`, the frame being filtered,
   * would leave: as it stands, and with `prev`'s second field. `first` is the
   * parity of the field that was captured first. With `ahead`, the two are
   * the frame being filtered and the one after it, counted for the latter.
   */
  measureComb(e, t, i, s = !1) {
    const r = this.#t;
    if (this.#R === 0 || this.#p === 0) return;
    this.#w();
    const o = s ? this.#E : this.#v;
    o !== null && (r.bindFramebuffer(r.FRAMEBUFFER, o.framebuffer), r.useProgram(this.#o), this.#m(0, e, this.#d.prev), this.#m(1, t, this.#d.cur), r.uniform1i(this.#d.first, i), r.uniform2i(this.#d.size, this.#R, this.#p), r.viewport(0, 0, o.width, o.height), r.drawArrays(r.TRIANGLES, 0, 3), r.bindFramebuffer(r.FRAMEBUFFER, null));
  }
  /**
   * The phase of the last frame measured, once the GPU has handed it back,
   * and null while it is still on its way. It is handed back once.
   * `instant` is whether the frames up to then were found to hold one
   * instant each; the filter reads the same from `texture` without waiting.
   */
  poll() {
    const e = this.#t, t = this.#n;
    if (t === null || this.#a === null) return null;
    switch (e.clientWaitSync(t, 0, 0)) {
      case e.ALREADY_SIGNALED:
      case e.CONDITION_SATISFIED:
        return e.bindBuffer(e.PIXEL_PACK_BUFFER, this.#a), e.getBufferSubData(e.PIXEL_PACK_BUFFER, 0, this.metrics), e.bindBuffer(e.PIXEL_PACK_BUFFER, null), e.deleteSync(t), this.#n = null, {
          phase: this.metrics[p.phase * 4] ?? 0,
          run: this.metrics[p.phase * 4 + 1] ?? 0,
          instant: (this.metrics[p.instant * 4 + 3] ?? 0) > 0.5,
          age: this.#l - this.#b
        };
      default:
        return null;
    }
  }
  destroy() {
    const e = this.#t;
    if (this.#z(), this.#c !== null) {
      for (const t of this.#c) D(e, t);
      this.#c = null;
    }
    e.deleteSync(this.#n), this.#n = null, e.deleteBuffer(this.#a), this.#a = null, e.deleteProgram(this.#i), e.deleteProgram(this.#h), e.deleteProgram(this.#A), e.deleteProgram(this.#o);
  }
  #m(e, t, i) {
    const s = this.#t;
    s.activeTexture(s.TEXTURE0 + e), s.bindTexture(s.TEXTURE_2D, t ?? null), s.uniform1i(i, e);
  }
  #z() {
    const e = this.#t;
    this.#r !== null && D(e, this.#r), this.#T !== null && D(e, this.#T), this.#v !== null && D(e, this.#v), this.#E !== null && D(e, this.#E), this.#r = null, this.#T = null, this.#v = null, this.#E = null;
  }
  /** Everything detect needs that is not there yet. */
  #w() {
    const e = this.#t;
    if (this.#r === null || this.#T === null || this.#v === null || this.#E === null) {
      this.#z();
      const t = Math.ceil(this.#R / re), i = Math.ceil(this.#p / (ne * 2));
      this.#r = F(e, t, i, 2), this.#T = F(
        e,
        Math.ceil(t / S),
        Math.ceil(i / S),
        2
      ), this.#v = F(
        e,
        Math.ceil(this.#R / b),
        Math.ceil(this.#p / b),
        1
      ), this.#E = F(
        e,
        Math.ceil(this.#R / b),
        Math.ceil(this.#p / b),
        1
      );
    }
    this.#c === null && (this.#c = [
      F(e, y, 1, 1),
      F(e, y, 1, 1)
    ], this.#u = 0, this.reset()), this.#a === null && (this.#a = e.createBuffer(), e.bindBuffer(e.PIXEL_PACK_BUFFER, this.#a), e.bufferData(
      e.PIXEL_PACK_BUFFER,
      this.metrics.byteLength,
      e.STREAM_COPY
    ), e.bindBuffer(e.PIXEL_PACK_BUFFER, null));
  }
}
function F(n, e, t, i) {
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
    throw D(n, h), new Error("failed to allocate framebuffer");
  return h;
}
function D(n, { framebuffer: e, textures: t }) {
  n.deleteFramebuffer(e);
  for (const i of t) n.deleteTexture(i);
}
function w(n, e = 0, t = n.length) {
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
function Be(n, e) {
  for (const t of w(n, e.body, e.end).filter(
    (i) => i.type === "trak"
  )) {
    let i = t;
    for (const s of ["mdia", "minf", "stbl", "stsd"]) {
      const r = w(n, i.body, i.end).find(
        (o) => o.type === s
      );
      if (!r) break;
      i = r;
    }
    if (i.type === "stsd")
      for (const s of w(n, i.body + 8, i.end)) {
        if (s.type !== "avc1") continue;
        const r = w(n, s.body + 78, s.end).find(
          (a) => a.type === "avcC"
        );
        if (!r) throw new Error("AVC sample entry has no avcC");
        const o = n.slice(r.body, r.end);
        return { codec: "avc1." + Array.from(o.subarray(1, 4)).map((a) => a.toString(16).padStart(2, "0")).join(""), description: o };
      }
  }
  return null;
}
class Le {
  #t;
  #i = null;
  #e = null;
  /** Compressed frames within the MSE buffer, retained at normal speed for seeks and later accelerated playback. */
  #h = [];
  #f = 0;
  #A = null;
  #s = [];
  /** Timestamps of one-tick duplicate pictures needed only as open-GOP decoding references. */
  #o = /* @__PURE__ */ new Set();
  #d = !1;
  #r = !1;
  #T = !1;
  #v = !1;
  #E = !1;
  #c = /* @__PURE__ */ new WeakMap();
  constructor(e) {
    this.#t = e, e.addEventListener("seeking", this.#a), e.addEventListener("ratechange", this.#a);
  }
  get active() {
    return this.#v;
  }
  /** Receive input in MSE append order; the caller retains ownership of the original ArrayBuffer. */
  append(e) {
    if (this.#T) return;
    const t = new Uint8Array(e), i = new DataView(e);
    try {
      for (const r of w(t)) {
        if (r.type === "moov") {
          this.#i = Be(t, r);
          const o = this.#i;
          o && VideoDecoder.isConfigSupported(o).then((h) => {
            this.#c.set(o, h.supported === !0);
          }).catch((h) => this.#n(h));
        }
        if (!(r.type !== "moof" || this.#i === null))
          for (const o of w(t, r.body, r.end).filter(
            (h) => h.type === "traf"
          )) {
            const h = w(t, o.body, o.end), a = h.find((l) => l.type === "tfhd");
            if (!a || i.getUint32(a.body + 4) !== 1) continue;
            const c = h.find((l) => l.type === "tfdt"), A = h.find((l) => l.type === "trun");
            if (!c || !A || i.getUint32(c.body) !== 16777216 || i.getUint32(A.body) !== 16781057)
              throw new Error("Unexpected mpeg2toh264 video fragment layout");
            let f = Number(i.getBigUint64(c.body + 4)), m = r.start + i.getInt32(A.body + 8);
            const u = i.getUint32(A.body + 4);
            if (A.body + 12 + u * 16 > A.end)
              throw new Error("Incomplete video samples");
            for (let l = 0; l < u; l++) {
              const d = A.body + 12 + l * 16, v = i.getUint32(d), E = i.getUint32(d + 4), U = i.getUint32(d + 8), ae = i.getInt32(d + 12);
              if (m < 0 || m + E > t.length)
                throw new Error("Video sample outside fragment");
              this.#h.push({
                config: this.#i,
                decodeTime: f / 9e4,
                timestamp: Math.round((f + ae) * 1e6 / 9e4),
                duration: Math.round(v * 1e6 / 9e4),
                type: U & 65536 ? "delta" : "key",
                data: t.subarray(m, m + E)
              }), f += v, m += E;
            }
          }
      }
      const s = this.#t.buffered;
      if (s.length > 0) {
        let r = 0;
        for (let o = 0; o < (this.#v ? this.#f : this.#h.length); o++) {
          const h = this.#h[o];
          h.type === "key" && h.timestamp / 1e6 <= s.start(0) && (r = o);
        }
        r > 0 && (this.#h.splice(0, r), this.#f = Math.max(0, this.#f - r));
      }
    } catch (s) {
      this.#n(s);
    }
  }
  /** Return undefined to use the video element, or null to wait for the next decoded frame. */
  take() {
    if (this.#T || this.#t.playbackRate <= 1.25 || this.#i === null || this.#c.get(this.#i) !== !0) {
      this.#v && this.#a();
      return;
    }
    this.#v || (this.#a(), this.#v = !0);
    const e = this.#t.currentTime;
    try {
      for (; this.#f < this.#h.length && (this.#A?.decodeQueueSize ?? 0) < 6 && this.#s.length < 12; ) {
        const i = this.#h[this.#f];
        if (i.decodeTime > e + 0.25) break;
        if (this.#e !== i.config) {
          if (this.#A) {
            if (!this.#r) {
              this.#r = !0;
              const r = this.#A;
              r.flush().then(() => {
                this.#A === r && (r.close(), this.#A = null, this.#e = null, this.#r = !1);
              }).catch((o) => {
                this.#A === r && this.#n(o);
              });
            }
            break;
          }
          const s = new VideoDecoder({
            output: (r) => {
              this.#A !== s ? r.close() : this.#u(r);
            },
            error: (r) => {
              this.#A === s && this.#n(r);
            }
          });
          this.#A = s, this.#A.configure(i.config), this.#e = i.config;
        }
        (i.duration ?? 0) < 1e3 && this.#o.add(i.timestamp), this.#A.decode(new EncodedVideoChunk(i)), this.#f++;
      }
      if (this.#d && this.#f === this.#h.length && this.#A && !this.#r) {
        this.#r = !0;
        const i = this.#A;
        i.flush().catch((s) => {
          this.#A === i && this.#n(s);
        });
      }
    } catch (i) {
      this.#n(i);
      return;
    }
    const t = this.#s[0];
    return !t || t.timestamp / 1e6 > e + 3e-3 * this.#t.playbackRate ? this.#E ? null : void 0 : (this.#E = !0, this.#s.shift());
  }
  #u = (e) => {
    this.#o.delete(e.timestamp) || e.timestamp / 1e6 < this.#t.currentTime - (this.#E ? 0.1 : 0.04) ? e.close() : this.#s.push(e);
  };
  #a = () => {
    this.#A && this.#A.state !== "closed" && this.#A.close(), this.#A = null, this.#e = null;
    for (const e of this.#s) e.close();
    this.#s = [], this.#o.clear(), this.#r = !1, this.#v = !1, this.#E = !1, this.#f = 0;
    for (let e = 0; e < this.#h.length; e++) {
      const t = this.#h[e];
      t.type === "key" && t.timestamp / 1e6 <= this.#t.currentTime && (this.#f = e);
    }
  };
  finish() {
    this.#d = !0;
  }
  /** Release the decoder and undisplayed frames while the filter is stopped. */
  suspend() {
    this.#a();
  }
  reset() {
    this.#a(), this.#h = [], this.#f = 0, this.#i = null, this.#d = !1, this.#T = !1;
  }
  destroy() {
    this.reset(), this.#t.removeEventListener("seeking", this.#a), this.#t.removeEventListener("ratechange", this.#a);
  }
  #n(e) {
    this.#a(), this.#T = !0, console.warn("mpeg2toh264: decoded video input unavailable", e);
  }
}
const P = 16, Ie = 6, Ue = `#version 300 es
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
class Ne {
  #t;
  #i;
  #e = null;
  #h = null;
  /** Textures free to take the next picture. */
  #f = [];
  #A = 0;
  /** Readback buffers free for the next comparison. */
  #s = [];
  #o = new Uint8Array(0);
  /** Takes in order, from the oldest still held. */
  #d = [];
  /** The newest take, which the next one is compared with. */
  #r = null;
  #T = 0;
  constructor(e, t) {
    this.#t = e, this.#i = t;
  }
  take() {
    const e = this.#t, t = this.#f.pop() ?? this.#u();
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
      throw this.#f.push(t), h;
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
    return o === null || o.width !== i || o.height !== s ? r.changed = !0 : this.#v(r, o), this.#r = r, this.#d.push(r), r.id;
  }
  settle() {
    const e = this.#t, t = this.#d.find((i) => !i.reported);
    if (t === void 0 || t === this.#r) return null;
    if (t.changed === null) {
      const { fence: i, buffer: s } = t;
      if (i === null || s === null) return null;
      const r = e.clientWaitSync(i, 0, 0);
      if (r !== e.ALREADY_SIGNALED && r !== e.CONDITION_SATISFIED)
        return null;
      this.#o.byteLength < s.bytes && (this.#o = new Uint8Array(s.bytes));
      const o = this.#o.subarray(0, s.bytes);
      e.bindBuffer(e.PIXEL_PACK_BUFFER, s.buffer), e.getBufferSubData(e.PIXEL_PACK_BUFFER, 0, o), e.bindBuffer(e.PIXEL_PACK_BUFFER, null), t.changed = Oe(o), this.#E(t);
    }
    return t.reported = !0, { id: t.id, changed: t.changed };
  }
  /**
   * Hand the texture of a take to the caller in exchange for one it no longer
   * needs, which becomes free for a later take.
   */
  adopt(e, t) {
    const i = this.#d.findIndex((r) => r.id === e), s = this.#d[i];
    if (s === void 0 || !s.reported)
      throw new Error(`picture ${e} is not available to adopt`);
    return this.#d.splice(i, 1), this.#f.push(t), s.texture;
  }
  release(e) {
    const t = this.#d.findIndex((s) => s.id === e), i = this.#d[t];
    i !== void 0 && (this.#d.splice(t, 1), this.#c(i));
  }
  reset() {
    const e = this.#d;
    this.#d = [], this.#r = null;
    for (const t of e)
      this.#E(t), this.#c(t);
  }
  destroy() {
    const e = this.#t;
    this.reset();
    for (const t of this.#f) e.deleteTexture(t);
    this.#f = [], this.#A = 0;
    for (const { buffer: t } of this.#s) e.deleteBuffer(t);
    this.#s = [], this.#l(), this.#e !== null && e.deleteProgram(this.#e), this.#e = null;
  }
  /** Draw the comparison of a take with the one before it and start its readback. */
  #v(e, t) {
    const i = this.#t, s = Math.ceil(e.width / P), r = Math.ceil(e.height / P), o = this.#n(s, r), h = this.#b(s * r * 4);
    this.#e ??= this.#a(), i.bindFramebuffer(i.FRAMEBUFFER, o.framebuffer), i.useProgram(this.#e), i.activeTexture(i.TEXTURE1), i.bindTexture(i.TEXTURE_2D, t.texture), i.activeTexture(i.TEXTURE0), i.bindTexture(i.TEXTURE_2D, e.texture), i.viewport(0, 0, s, r), i.drawArrays(i.TRIANGLES, 0, 3), i.bindBuffer(i.PIXEL_PACK_BUFFER, h.buffer), i.readPixels(0, 0, s, r, i.RGBA, i.UNSIGNED_BYTE, 0), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), i.bindFramebuffer(i.FRAMEBUFFER, null), e.fence = i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE, 0), e.buffer = h, i.flush();
  }
  /** Give back what a comparison held, whether or not it was read. */
  #E(e) {
    const t = this.#t;
    e.fence !== null && t.deleteSync(e.fence), e.fence = null;
    const i = e.buffer;
    if (e.buffer = null, i === null) return;
    const s = this.#h;
    s !== null && i.bytes === s.width * s.height * 4 ? this.#s.push(i) : t.deleteBuffer(i.buffer);
  }
  /**
   * Free the texture of a take that has left. By then a later take has
   * replaced it as the reference, and the comparison that read it is issued.
   */
  #c(e) {
    this.#f.push(e.texture);
  }
  #u() {
    if (this.#A === Ie) return null;
    const e = this.#t, t = e.createTexture();
    return e.bindTexture(e.TEXTURE_2D, t), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), this.#A++, t;
  }
  #a() {
    const e = this.#t, t = _(e, Ue, M);
    return e.useProgram(t), e.uniform1i(e.getUniformLocation(t, "uTake"), 0), e.uniform1i(e.getUniformLocation(t, "uReference"), 1), t;
  }
  #n(e, t) {
    const i = this.#t, s = this.#h;
    if (s?.width === e && s.height === t) return s;
    this.#l();
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
    return this.#h = h, h;
  }
  #l() {
    const e = this.#t;
    this.#h !== null && (e.deleteFramebuffer(this.#h.framebuffer), e.deleteTexture(this.#h.texture), this.#h = null);
  }
  #b(e) {
    const t = this.#s.pop();
    if (t !== void 0) return t;
    const i = this.#t, s = i.createBuffer();
    return i.bindBuffer(i.PIXEL_PACK_BUFFER, s), i.bufferData(i.PIXEL_PACK_BUFFER, e, i.STREAM_COPY), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), { buffer: s, bytes: e };
  }
}
function Oe(n) {
  for (let e = 0; e < n.length; e += 4)
    if (n[e] !== 0 || n[e + 1] !== 0 || n[e + 2] !== 0)
      return !0;
  return !1;
}
const oe = [
  "mozParsedFrames",
  "mozDecodedFrames",
  "mozPresentedFrames",
  "mozPaintedFrames"
];
function he(n) {
  return oe.every((e) => e in n);
}
function Ge(n) {
  return n.ownerDocument?.defaultView?.performance.timeOrigin ?? performance.timeOrigin;
}
function Xe() {
  return typeof HTMLVideoElement < "u" && (he(HTMLVideoElement.prototype) || typeof HTMLVideoElement.prototype.requestVideoFrameCallback == "function");
}
const ze = 250, N = 500, We = 1.75, He = 3, $e = 200;
class Ve {
  #t;
  #i;
  #e;
  #h;
  /** The watch the takes below belong to. */
  #f = null;
  /** Takes awaiting their verdict, oldest first. */
  #A = [];
  /** Frames counted on the watched path, standing in for `presentedFrames`. */
  #s = 0;
  #o = null;
  /** Unchanged verdicts in a row on takes made at rest. */
  #d = 0;
  /** When the take last delivered was made, and the painted count then. */
  #r = null;
  #T = null;
  #v = null;
  #E = null;
  #c = null;
  #u = null;
  #a = !0;
  #n = null;
  #l = null;
  #b = 0;
  #R;
  #p;
  #m = null;
  #z = null;
  #w = null;
  #I = null;
  #De = 0;
  #W = [];
  #G = [];
  constructor(e, t, i) {
    if (this.#t = e, this.#i = t, this.#h = i, this.#e = he(e) ? e : null, this.#R = this.#e === null && typeof VideoFrame < "u", this.#p = this.#R && e.playbackRate > 1, this.#e) {
      for (const s of ["emptied", "seeking", "seeked"])
        e.addEventListener(s, this.#j);
      for (const s of ["pause", "playing", "waiting", "ratechange"])
        e.addEventListener(s, this.#U);
    }
    if (this.#R)
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
        e.addEventListener(s, this.#Z);
  }
  /** Whether acquisition uses the captured pictures' own timestamps. */
  get captureDriven() {
    return this.#p;
  }
  request(e) {
    if (this.#E === null) {
      if (this.#E = e, this.#p) {
        this.#k();
        return;
      }
      this.#v = this.#e ? requestAnimationFrame(this.#N) : this.#t.requestVideoFrameCallback(this.#ee);
    }
  }
  cancel() {
    this.#v !== null && (this.#e ? cancelAnimationFrame(this.#v) : this.#t.cancelVideoFrameCallback(this.#v)), this.#v = null, this.#E = null, this.#m?.(), this.#m = null, this.#w !== null && this.#t.cancelVideoFrameCallback(this.#w), this.#w = null, this.#Y(), this.#I = null, this.#W = [], this.#p = this.#R && this.#t.playbackRate > 1, this.#j();
  }
  destroy() {
    this.cancel();
    for (const e of ["emptied", "seeking", "seeked"])
      this.#t.removeEventListener(e, this.#j);
    for (const e of ["pause", "playing", "waiting", "ratechange"])
      this.#t.removeEventListener(e, this.#U);
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
      this.#t.removeEventListener(e, this.#Z);
  }
  /** Deliver pending input on the rendering window's refresh, before drawing. */
  flush(e) {
    if (this.#p)
      for (this.#t.ownerDocument !== this.#z && (this.#m?.(), this.#m = null, this.#k()); this.#G.length > 0 && this.#E !== null; ) {
        const t = this.#G.shift(), i = t.frame;
        try {
          this.#H(e, {
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
  #Y() {
    for (const e of this.#G) e.frame.close();
    this.#G = [];
  }
  #Z = (e) => {
    const t = this.#R && this.#t.playbackRate > 1;
    if (t !== this.#p) {
      const i = this.#E;
      this.cancel(), this.#p = t, i !== null && this.request(i);
      return;
    }
    ["seeking", "seeked", "emptied", "ratechange"].includes(e.type) && (this.#I = null, this.#W = []), this.#p && ((e.type === "pause" || e.type === "ended") && this.flush(performance.now()), this.#Y(), this.#m?.(), this.#m = null, this.#E !== null && this.#k());
  };
  #k() {
    if (!this.#p || this.#m !== null || this.#E === null || (this.#t.paused || this.#t.ended) && this.#I !== null)
      return;
    this.#w === null && typeof this.#t.requestVideoFrameCallback == "function" && (this.#w = this.#t.requestVideoFrameCallback(
      this.#he
    ));
    const e = Math.max(4, 8 / Math.max(1, this.#t.playbackRate)), t = this.#t.ownerDocument?.defaultView;
    if (this.#z = this.#t.ownerDocument, t) {
      const i = t.setTimeout(this.#S, e);
      this.#m = () => t.clearTimeout(i);
    } else {
      const i = setTimeout(this.#S, e);
      this.#m = () => clearTimeout(i);
    }
  }
  #he = () => {
    this.#w = null, this.#m?.(), this.#m = null, this.#S();
  };
  #S = () => {
    this.#m = null;
    const e = this.#t;
    if (this.#E === null) return;
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
    if (t.timestamp === this.#I)
      t.close();
    else {
      let s = 1;
      if (this.#I !== null) {
        const o = t.timestamp - this.#I;
        if (o > 1e3 && o < 25e4 && (this.#W.push(o), this.#W.length > 7 && this.#W.shift()), o > 0 && this.#W.length > 0) {
          const h = [...this.#W].sort((c, A) => c - A), a = h[Math.floor(h.length / 2)];
          s = Math.max(1, Math.round(o / a));
        }
      }
      this.#I = t.timestamp, this.#De += s;
      const r = performance.now() + (i ? (t.timestamp / 1e6 - e.currentTime) * 1e3 / e.playbackRate : 0);
      for (this.#G.push({ frame: t, at: r, count: this.#De }); this.#G.length > 4; ) this.#G.shift().frame.close();
    }
    this.#k();
  };
  #U = () => {
    this.#n = null, this.#l = null, this.#b = 0;
  };
  #j = () => {
    this.#c = null, this.#u = null, this.#a = !0, this.#B(), this.#U();
  };
  /** Drop the takes in hand; the next one starts with nothing to compare to. */
  #B() {
    this.#f?.reset(), this.#A = [], this.#d = 0;
  }
  /** Native acquisition: pass the report on, with the clock it was made on. */
  #ee = (e, t) => {
    this.#H(e, {
      width: t.width,
      height: t.height,
      mediaTime: t.mediaTime,
      presentedFrames: t.presentedFrames,
      expectedDisplayTime: t.expectedDisplayTime,
      timeOrigin: Ge(this.#t)
    });
  };
  #H = (e, t) => {
    const i = this.#E;
    this.#v = null, this.#E = null, i?.(e, t);
  };
  #N = (e) => {
    const t = this.#e, i = oe.map((a) => t[a]);
    this.#c?.some((a, c) => i[c] < a) && this.#j(), this.#c = i;
    const s = this.#h?.() ?? null;
    s !== this.#f && (this.#j(), this.#f = s);
    const r = t.mozPaintedFrames, o = !t.seeking && t.readyState >= 2 && t.videoWidth > 0 && t.videoHeight > 0, h = this.#u === null && (r > 0 || t.paused && (t.mozPresentedFrames > 0 || t.mozDecodedFrames > 0));
    if (s !== null) {
      this.#y(e, t, s, o, h);
      return;
    }
    if (o && (h || this.#u !== null && r !== this.#u)) {
      this.#n !== null && e - this.#n > N && (this.#U(), this.#a = !0), this.#D(e, t), this.#n = e, this.#u = r;
      const a = this.#a;
      this.#a = !1, this.#H(e, {
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
        mozTiming: { periodMs: this.#b, discontinuity: a }
      });
    } else
      this.#v = requestAnimationFrame(this.#N);
  };
  /** Fold the painted count into the cadence, on a poll that saw it advance. */
  #D(e, t) {
    if (t.paused || t.ended) return;
    const i = t.mozPaintedFrames, s = this.#l;
    if (s && e - s.at >= ze) {
      const r = i - s.frames;
      if (r > 0) {
        const o = (e - s.at) / r;
        o >= 4 && o <= 200 && (this.#b = this.#b ? this.#b + (o - this.#b) * 0.25 : o);
      }
      this.#l = null;
    }
    this.#l ??= { at: e, frames: i };
  }
  /**
   * The poll where the pictures themselves say what is new. Every refresh
   * takes the element's picture; a take is delivered once its verdict is in,
   * which is a refresh or more after it was made.
   */
  #y(e, t, i, s, r) {
    const o = t.mozPaintedFrames, h = this.#u !== null && o !== this.#u;
    this.#o !== null && e - this.#o > N && (this.#B(), this.#U(), this.#a = !0), this.#o = e, h && this.#D(e, t);
    const a = t.paused || t.ended;
    (!a || h) && (this.#d = 0), a && this.#r !== null && (this.#r = e);
    const c = a && this.#d >= He;
    if (s && (r || this.#u !== null)) {
      this.#u = o;
      const u = c ? null : i.take();
      u !== null && this.#A.push({
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
      const l = this.#A.shift();
      if (l?.id !== u.id)
        throw new Error("picture verdicts arrived out of order");
      let d = u.changed;
      if (d ? this.#d = 0 : (this.#d = l.resting ? this.#d + 1 : 0, d = A === null && !l.resting && this.#r !== null && (l.at - this.#r) * (t.playbackRate || 1) >= $e && o !== this.#T), !d) {
        i.release(l.id);
        continue;
      }
      A !== null && i.release(A.id), A = l;
    }
    if (A === null) {
      this.#v = requestAnimationFrame(this.#N);
      return;
    }
    let f = 1;
    if (this.#n !== null) {
      const u = A.at - this.#n;
      u > N ? (this.#U(), this.#a = !0) : this.#b > 0 && u > this.#b * We && (f = Math.round(u / this.#b));
    }
    this.#s += f, this.#n = A.at, this.#r = A.at, this.#T = o;
    const m = this.#a;
    this.#a = !1;
    try {
      this.#H(e, {
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
        mozTiming: { periodMs: this.#b, discontinuity: m },
        picture: A.id
      });
    } finally {
      i.release(A.id);
    }
  }
}
let Ae = null;
function Qe(n) {
  Ae = n;
}
const Q = 0.5, g = 4, z = 5, T = z + 1, Y = 1e3, Z = 4, k = 200, Ye = 0.25, Ze = 1e3 / 60, je = `#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`, qe = 0.75, Ke = 0.1, j = 1, Je = 60, et = 0.02, tt = 0.1, q = 1, it = 4, st = 90, O = 5, rt = 4, nt = {
  2: 0,
  3: 0.25,
  4: 0.5,
  5: 0.75
}, ot = `#version 300 es
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
function pt() {
  return Xe() && typeof WebGL2RenderingContext < "u";
}
const ht = {
  requestAnimationFrame: (n) => requestAnimationFrame(n),
  cancelAnimationFrame: (n) => cancelAnimationFrame(n)
};
class vt extends EventTarget {
  /** Receive fMP4 from the player and decode supplemental input only above 1.25x playback speed. */
  encodedVideo;
  #t;
  #i;
  #e;
  #h;
  /** Finds Firefox's new pictures for the main-thread renderer. */
  #f;
  /** The take holding the picture of the frame being ingested, if any. */
  #A = null;
  #s;
  /** The pulldown detection, built only while the `film` option needs it. */
  #o = null;
  #d;
  #r;
  /** The program that copies a filtered picture onto the canvas. */
  #T;
  #v;
  #E;
  #c = [];
  /** Somewhere to filter a field into, and to read it back out of. */
  #u = [];
  /** Which output slot was written last; the next one follows round the ring. */
  #a = T - 1;
  /** The draw path currently shown on the canvas, retained for snapshots. */
  #n = null;
  /** Filtered fields waiting for their moment, oldest first. */
  #l = [];
  /** The requestAnimationFrame() loop that puts them up, which is all that draws on the canvas. */
  #b = null;
  #R = 0;
  /** Deliver captured pictures on the page's refresh during faster playback. */
  #p = null;
  /** The document the owner-change listener is on, if any. */
  #m = null;
  #z;
  /** The gap between animation frames: as near as the page gets to the screen. */
  #w = Ze;
  /** Where the refresh grid fitted to the animation frames stands. (otya) */
  #I = 0;
  /** How far ahead of its animation frame the last picture shown stood. (otya) */
  #De = 0;
  #W = 0;
  #G = 0;
  /** The last picture chained onto the schedule; a break restarts it. (otya) */
  #Y = null;
  /** The lateness the schedule holds on purpose, in refreshes. See #schedule. */
  #Z = 0;
  /** Pictures in a row that arrived off the phase the lag stands for, all on one side of it. */
  #k = 0;
  /** The phase nearest it among them, in refreshes. */
  #he = 0;
  /**
   * Drop the presentation queue and restart the schedule from the clock.
   * Every schedule restart goes through here (otya nulls #lastScheduled at
   * each queue clear): the old chain's clock no longer applies, so keeping
   * it would either count a phantom resync or pop freshly queued pictures
   * as late. Restart accounting for cadence changes lives in #schedule.
   */
  #S() {
    this.#l.length = 0, this.#Y = null, this.#Z = 0, this.#k = 0, this.#G = 0;
  }
  /** The `<div>` this put around the element, so it can be taken away again. */
  #U = null;
  #j;
  #B;
  #ee;
  #H = 0;
  /** otya GPU pulldown path: enabled by the `film` option (see below). */
  #N;
  #D;
  /** How long a frame lasts in wall time, from what the frames themselves say. */
  #y = 0;
  /** The size of a frame as it is coded, which is what a texture holds. */
  #X = 0;
  #q = 0;
  /** Where the newest frame is. The two before it follow round the ring. */
  #O = g - 1;
  /** How many of the held frames are consecutive, up to HISTORY. */
  #_ = 0;
  #_e = 0;
  /** presentedFrames at the last ingested frame; pairs with #lastMediaTime. */
  #rt = 0;
  /** A destination frame that arrived before the browser finished seeking. */
  #Me = !1;
  #M = !1;
  /** Cancels work suspended inside a synchronous owner callback. */
  #Ae = 0;
  #He = !1;
  #K = !1;
  #F = null;
  #ue = [];
  #Q = !1;
  #nt;
  #ot;
  #P;
  #fe;
  #te;
  #ht;
  #g = null;
  #x;
  #Se = !1;
  #At = 0;
  #at = !1;
  #si = 0;
  #Pe = !1;
  #$e = !1;
  #de = null;
  #ri = 0;
  #Ce = /* @__PURE__ */ new Map();
  /** Everything the next report is counted from. See DeinterlaceStats. */
  #C = {
    filtered: 0,
    missed: 0,
    degraded: 0,
    discontinuities: 0,
    resynced: 0,
    late: 0,
    queueResetted: 0,
    matched: 0
  };
  /** `presentedFrames` of the last frame the callback saw; 0 before any. */
  #ke = 0;
  /** When the last frame the filter took arrived, to see the gaps between. */
  #Ve = 0;
  #Qe = 0;
  #ie = 0;
  #me = 0;
  #pe = 0;
  #Be = 0;
  #ve = 0;
  #Ee;
  #Ye = [];
  #be = [];
  #Le = 0;
  #ge = 0;
  #Ie = 0;
  #xe = 0;
  /** The last phase read back from the GPU, and how many frames ago it was for. */
  #Ue = x;
  #Te = 0;
  /** The phase of the frame being filtered: #known advanced by #knownAge. */
  #L = x;
  #$ = !1;
  /** Frames of FILM_HOLD_FRAMES left since the cadence was last held. */
  #V = 0;
  /** Whether the comb counts are of the frame being filtered and its neighbours. */
  #Ze = !1;
  /** Whether the frame being filtered may have its fields matched. See #render. */
  #ae = !1;
  /** Whether the frames lately read back were found to hold one instant each. */
  #lt = !1;
  /** Whether the comb counts of the frame after it were made as well. */
  #ct = !1;
  /** Whether the frame before the newest followed a gap in the frames seen. */
  #Pt = !1;
  /** Whether the frames just before this one were progressive. */
  #ut = !1;
  #we = null;
  #Ct = "";
  /** Debug only: frames given each phase (0 for none), and repeats dropped. */
  #je = [0, 0, 0, 0, 0, 0];
  #ft = 0;
  /**
   * Why requested film reconstruction is currently degraded, or null while
   * healthy. The `film` option stays as the caller set it;
   * only the engine stands down, so this is never a silent option change.
   */
  #le = null;
  /** Last worker-reported filmError, to derive the page-side failure event. */
  #dt = null;
  #mt = 0;
  constructor(e, t = {}, i = null) {
    super(), this.#e = e, this.#B = t.doubleRate ?? !1, this.#ee = t.spatialCheck ?? !0, this.#N = t.debug ?? !1, this.#D = t.film ?? !1, this.#nt = t.onStats, this.#ot = t.onFailure, this.#P = i, this.#te = i ? "main" : t.rendering ?? "main", this.#ht = t.workerUrl ?? Ae, this.#x = this.#te === "main" ? "main" : "idle", this.#i = i ? i.canvas : document.createElement("canvas"), this.#t = i?.canvas ?? (this.#te === "main" ? this.#i : document.createElement("canvas")), this.#fe = e, i || (this.#i.style.cssText = "position:absolute;pointer-events:none;visibility:hidden");
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
    this.#s = s, this.#D && (this.#It(), this.#o = new V(s)), this.#d = K(s, ke);
    const r = this.#d;
    this.#r = Object.fromEntries(
      Object.entries(Ce).map(([o, h]) => [
        o,
        s.getUniformLocation(r, h)
      ])
    ), this.#T = K(s, ot), this.#v = s.getUniformLocation(this.#T, "uField"), this.#E = s.getUniformLocation(this.#T, "uFlip"), this.#Ee = s.getExtension(
      "EXT_disjoint_timer_query_webgl2"
    ), this.#t.addEventListener(
      "webglcontextlost",
      this.#ii
    ), this.#j = i ? null : new ResizeObserver(() => this.#ze()), this.#z = i ? null : new MutationObserver(() => {
      this.#i.ownerDocument !== this.#m && this.#ze();
    }), this.encodedVideo = !i && typeof VideoDecoder < "u" ? new Le(e) : null, this.#f = i ? null : new Ne(s, e), this.#h = new Ve(
      e,
      () => this.encodedVideo?.take(),
      () => this.#x === "main" ? this.#f : null
    ), e.addEventListener("emptied", this.#Jt), e.addEventListener("resize", this.#Kt), e.addEventListener("pause", this.#oe), e.addEventListener("ended", this.#oe), e.addEventListener("seeking", this.#ti), e.addEventListener("seeked", this.#oe), e.addEventListener("ratechange", this.#oe);
  }
  get running() {
    return this.#M && (this.#F?.interlaced ?? !0);
  }
  /** The HTML canvas currently placed over the media element. */
  get canvas() {
    return this.#i;
  }
  /** Field order for the current scan state, defaulting to top-field-first. */
  get #kt() {
    return this.#F?.topFieldFirst !== !1;
  }
  /** The same public filter options for either rendering target. */
  #Bt() {
    return {
      doubleRate: this.#B,
      spatialCheck: this.#ee,
      film: this.#D,
      debug: this.#N
    };
  }
  /** Whether the caller wants filtering, independently of the current source. */
  get enabled() {
    return this.#He;
  }
  set enabled(e) {
    this.#He = e, this.#pt(), this.#g?.postMessage({
      type: "enabled",
      enabled: e
    });
  }
  /** Update whether the source needs filtering and which field comes first. */
  set scan(e) {
    const t = this.#F?.interlaced !== e?.interlaced, i = t || this.#F?.topFieldFirst !== e?.topFieldFirst;
    this.#F = e, !(i && (!this.#Fe() || this.#F !== e)) && (this.#g?.postMessage({ type: "scan", scan: e }), i && (this.#_ = 0, this.#S(), this.#J(), t && (this.#y = 0), this.#n = null, this.#ne(!1)), this.#pt(), i && ((e?.interlaced ?? !0) && (this.#P || this.#x === "main") ? this.#Xe() : this.#wt()));
  }
  get scan() {
    return this.#F;
  }
  set videoTimeline(e) {
    this.#ue = e, this.#g?.postMessage({
      type: "timeline",
      videoTimeline: e
    }), e.length === 0 && (this.#F = null), this.#pt();
  }
  get videoTimeline() {
    return this.#ue;
  }
  /**
   * What to put on the screen for fullscreen: the `<div>` holding both the
   * element and the canvas once there is one, and the element itself before
   * that. Fullscreening the element alone would leave the canvas behind in
   * the page, and with it the only deinterlaced picture there is.
   */
  get container() {
    return this.#U ?? this.#e;
  }
  /** Whether a picture goes up for every field rather than every frame. */
  get doubleRate() {
    return this.#B;
  }
  set doubleRate(e) {
    e !== this.#B && (this.#B = e, this.#ye(), this.#S(), this.#Lt());
  }
  get spatialCheck() {
    return this.#ee;
  }
  set spatialCheck(e) {
    e !== this.#ee && (this.#ee = e, this.#ye());
  }
  get film() {
    return this.#D;
  }
  set film(e) {
    const t = this.#g ? this.#dt : this.#le;
    if (!(e === this.#D && (e === !1 || t === null))) {
      if (this.#g) {
        this.#D = e, this.#ye(e ? "film" : void 0);
        return;
      }
      if (e) {
        if (!this.#Fe()) return;
        try {
          this.#Ut();
        } catch (i) {
          this.#D = !0, this.#ye(), this.#qe(
            `film detector unavailable: ${i instanceof Error ? i.message : String(i)}`
          );
          return;
        }
      }
      if (this.#D = e, this.#ye(), !e) {
        if (!this.#Fe()) return;
        this.#$ = !1, this.#V = 0, this.#ae = !1, this.#L = x, this.#J(), this.#o?.destroy(), this.#o = null;
      }
      this.#Lt();
    }
  }
  get debug() {
    return this.#N;
  }
  set debug(e) {
    e !== this.#N && (this.#N = e, this.#ye());
  }
  /** Whether pictures are queued for presentation by the frame loop. */
  get #ni() {
    return this.#B || this.#D;
  }
  #Lt() {
    this.#K || (this.#ni ? (this.#X > 0 && this.#qt(), (this.#F?.interlaced ?? !0) && (this.#P || this.#x === "main") && this.#Xe()) : this.#D || (this.#n = null, this.#ne(!1), this.#We()));
  }
  /** Apply mutable filter settings to the existing Worker and canvas. */
  #ye(e) {
    this.#g?.postMessage({
      type: "settings",
      options: this.#Bt(),
      retryFilm: e
    });
  }
  #It() {
    if (this.#s.getExtension("EXT_color_buffer_float") === null)
      throw new Error("film needs EXT_color_buffer_float");
  }
  /** Build the GPU pulldown detector the `film` option needs, or throw. */
  #Ut() {
    this.#It(), this.#o ??= new V(this.#s), this.#X > 0 && this.#o.resize(this.#X, this.#q);
  }
  #pt() {
    this.#He && (this.#ue.length > 0 || (this.#F?.interlaced ?? !0)) ? this.start() : this.stop();
  }
  /** Start the bundled Worker when the required transfer APIs are available. */
  #oi() {
    return this.#P || this.#te === "main" ? !1 : this.#x === "starting" || this.#x === "active" ? !0 : typeof Worker < "u" && typeof VideoFrame < "u" && typeof OffscreenCanvas < "u" && this.#ht !== null && "transferControlToOffscreen" in HTMLCanvasElement.prototype ? (this.#Nt(), !0) : this.#te === "auto" ? (this.#Ke(), !1) : (this.#x = "failed", this.#M = !1, !0);
  }
  /** Transfer the display canvas to a new Worker, replacing it if already transferred. */
  #Nt() {
    this.#se(), this.#g?.terminate(), this.#g = null, this.#Pe = !1, this.#$e = !1, this.#dt = null, this.#mt = 0;
    let e = this.#i;
    if (this.#at) {
      e = document.createElement("canvas"), e.className = this.#i.className;
      const r = this.#i.getAttribute("style");
      r === null ? e.removeAttribute("style") : e.setAttribute("style", r), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e;
    }
    const t = ++this.#At;
    this.#x = "starting";
    let i, s;
    try {
      s = e.transferControlToOffscreen(), this.#at = !0, i = new Worker(this.#ht, { type: "module" });
    } catch (r) {
      this.#Ne(
        r instanceof Error ? r.message : String(r)
      );
      return;
    }
    this.#g = i, i.onmessage = (r) => {
      t === this.#At && this.#hi(r.data);
    }, i.onerror = (r) => {
      t === this.#At && (r.preventDefault(), this.#Ne(r.message || "the deinterlacer worker failed"));
    }, i.postMessage(
      {
        type: "initialize",
        canvas: s,
        options: this.#Bt(),
        scan: this.#F,
        videoTimeline: this.#ue,
        enabled: this.#M,
        video: this.#Et()
      },
      [s]
    );
  }
  /** Apply Worker notifications and release the wait for the next input frame. */
  #hi(e) {
    switch (e.type) {
      case "ready":
        this.#x = "active", this.#M && (this.#Oe(), this.#st());
        break;
      case "failed":
        this.#Ne(e.message);
        break;
      case "consumed": {
        this.#Pe = !1, this.#$e = !0;
        const t = this.#de;
        this.#de = null, t && this.#Gt(t);
        break;
      }
      case "visibility":
        this.#i.style.visibility = e.visible ? "visible" : "hidden";
        break;
      case "stats": {
        const t = {
          ...e.stats,
          dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0
        }, i = t.filmError ?? null, s = this.#mt;
        if (this.#dt = i, this.#mt = e.filmFailure, i !== null && e.filmFailure !== s) {
          this.dispatchEvent(
            new CustomEvent("failure", { detail: i })
          );
          try {
            this.#ot?.(i);
          } catch {
          }
        }
        this.dispatchEvent(new CustomEvent("stats", { detail: t })), this.#nt?.(t);
        break;
      }
      case "capture": {
        const t = this.#Ce.get(e.id);
        if (this.#Ce.delete(e.id), !t) {
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
  #vt(e) {
    if (this.dispatchEvent(new CustomEvent("failure", { detail: e })), !this.#P)
      try {
        this.#ot?.(e);
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
  #qe(e) {
    this.#le !== e && (this.#le = e, this.#$ = !1, this.#V = 0, this.#ae = !1, this.#L = x, this.#J(), this.#o?.destroy(), this.#o = null, this.#vt(e));
  }
  /**
   * Re-arm film reconstruction at a resource-reallocation point (start, scan
   * change, resize, or re-setting the option). The next frame retries; a
   * repeated failure degrades again and notifies as a new episode.
   */
  #Fe() {
    return this.#K ? !1 : (this.#g || (this.#le = null), !0);
  }
  /** Retry a transient Worker failure once, then show the media element if it fails again. */
  #Ne(e) {
    if (this.#x === "starting" && this.#te === "auto" && !this.#Se) {
      this.#Ke();
      return;
    }
    if (this.#Ot(e), !this.#Se) {
      this.#Se = !0, this.#Nt();
      return;
    }
    console.error(`Deinterlacer Worker stopped: ${e}`), this.#x = "failed", this.#g?.terminate(), this.#g = null, this.#se(), this.#vt(`deinterlacer worker stopped: ${e}`), this.stop();
  }
  /** Restore the main-thread canvas when automatic Worker selection fails. */
  #Ke() {
    const e = this.#t;
    e.className = this.#i.className;
    const t = this.#i.getAttribute("style");
    t === null ? e.removeAttribute("style") : e.setAttribute("style", t), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e, this.#at = !1, this.#g?.terminate(), this.#g = null, this.#x = "main", this.#se(), this.#M && (this.#Oe(), this.#st(), (this.#F?.interlaced ?? !0) && this.#Xe());
  }
  /** Close the queued frame still owned by the page when switching renderers. */
  #se() {
    this.#de?.frame.close(), this.#de = null;
  }
  /** Reject captures whose replies would be lost when the Worker is rebuilt. */
  #Ot(e) {
    for (const t of this.#Ce.values())
      t.reject(new Error(e));
    this.#Ce.clear();
  }
  start() {
    if (!(this.#M || this.#K || this.#Q) && (this.#Ae++, this.#M = !0, this.#ei(), !!this.#Fe())) {
      if (this.#yi(), this.#st(), this.#oi()) {
        this.#g?.postMessage({
          type: "enabled",
          enabled: !0
        }), this.#x === "active" && this.#Oe();
        return;
      }
      this.#Oe(), (this.#F?.interlaced ?? !0) && this.#Xe();
    }
  }
  /** Take the deinterlaced picture away, leaving the element's own showing. */
  stop() {
    this.#Ae++, this.#M && (this.#M = !1, this.#h.cancel(), this.encodedVideo?.suspend(), this.#$t(), this.#wt(), this.#_ = 0, this.#n = null, this.#ne(!1), this.#se(), this.#g?.postMessage({
      type: "enabled",
      enabled: !1
    }));
  }
  destroy() {
    if (!this.#K) {
      this.#K = !0, this.#He = !1, this.stop(), this.#g?.postMessage({ type: "destroy" }), this.#g?.terminate(), this.#g = null, this.#se(), this.#Ot("the deinterlacer was destroyed"), this.#m?.removeEventListener(
        "visibilitychange",
        this.#Rt
      ), this.#m = null, this.#z?.disconnect(), this.#t.removeEventListener(
        "webglcontextlost",
        this.#ii
      ), this.#h.destroy(), this.#f?.destroy(), this.encodedVideo?.destroy(), this.#e.removeEventListener("emptied", this.#Jt), this.#e.removeEventListener("resize", this.#Kt), this.#e.removeEventListener("pause", this.#oe), this.#e.removeEventListener("ended", this.#oe), this.#e.removeEventListener("seeking", this.#ti), this.#e.removeEventListener("seeked", this.#oe), this.#e.removeEventListener("ratechange", this.#oe), this.#Fi();
      for (const e of this.#c) this.#s.deleteTexture(e);
      this.#c = [], this.#We();
      for (const e of [
        ...this.#Ye,
        ...this.#be.map(({ q: t }) => t)
      ])
        this.#s.deleteQuery(e);
      this.#Ye.length = 0, this.#be.length = 0, this.#o?.destroy(), this.#o = null, this.#we !== null && (me(this.#we), this.#we = null), this.#s.deleteProgram(this.#d), this.#s.deleteProgram(this.#T), this.#s.getExtension("WEBGL_lose_context")?.loseContext();
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
    if (this.#x === "active" && this.#i.style.visibility === "visible" && this.#g) {
      const s = ++this.#ri, r = new Promise((o, h) => {
        this.#Ce.set(s, { resolve: o, reject: h });
      });
      return this.#g.postMessage({
        type: "capture",
        id: s,
        width: this.#e.videoWidth,
        height: this.#e.videoHeight
      }), r;
    }
    if (this.#x === "starting" || this.#x === "failed")
      return createImageBitmap(this.#e);
    const e = this.#n;
    if (this.#P && (!this.#M || this.#Q || !e))
      return Promise.reject(new Error("no rendered picture is available"));
    if (!this.#M || this.#Q || !e)
      return createImageBitmap(this.#e);
    e.kind === "texture" ? this.#_t(e.texture, e.flip, !1) : this.#ce(e.flush, e.second, null, !1);
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
  #Oe() {
    this.#P || !this.#M || this.#h.request(this.#mi);
  }
  /** Copy the element's playback state for seek and presentation timing decisions. */
  #Et() {
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
  #Ai(e, t, i) {
    let s;
    try {
      s = i?.clone() ?? new VideoFrame(this.#e, {
        timestamp: Math.max(0, Math.round(t.mediaTime * 1e6))
      });
    } catch (o) {
      const h = o instanceof Error ? o.message : String(o);
      this.#te === "auto" && !this.#$e && !this.#Se ? (this.#Ke(), this.#et(e, t)) : this.#Ne(h);
      return;
    }
    const r = {
      id: ++this.#si,
      frame: s,
      now: e,
      metadata: t,
      video: this.#Et()
    };
    if (this.#Pe) {
      this.#de?.frame.close(), this.#de = r;
      return;
    }
    this.#Gt(r);
  }
  /** Transfer the selected frame once the Worker has released the previous input. */
  #Gt(e) {
    const t = this.#g;
    if (!t || this.#x !== "active") {
      e.frame.close();
      return;
    }
    this.#Pe = !0;
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
      this.#Pe = !1, e.frame.close();
      const r = s instanceof Error ? s.message : String(s);
      this.#te === "auto" && !this.#$e && !this.#Se ? (this.#Ke(), this.#et(e.now, e.metadata)) : this.#Ne(r);
    }
  }
  #ai(e, t, i) {
    this.#we == null && (this.#we = fe(this.#s, "20px monospace")), pe(this.#we, e, t, i, this.#X, this.#q, 20);
  }
  #Xt(e) {
    if (this.#Ee == null || this.#be.length > 30)
      return;
    const t = this.#Ye.pop() ?? this.#s.createQuery();
    return this.#s.beginQuery(this.#Ee.TIME_ELAPSED_EXT, t), this.#be.push({ q: t, isField: e }), t;
  }
  #Je(e) {
    this.#Ee != null && (e != null && this.#s.endQuery(this.#Ee.TIME_ELAPSED_EXT), this.#be = this.#be.filter(
      ({ q: t, isField: i }) => {
        if (this.#s.getQueryParameter(t, this.#s.QUERY_RESULT_AVAILABLE)) {
          const s = this.#s.getQueryParameter(t, this.#s.QUERY_RESULT);
          return i ? (this.#Ie += s, this.#xe++) : (this.#Le += s, this.#ge++), this.#Ye.push(t), !1;
        }
        return !0;
      }
    ));
  }
  /**
   * Start the detection again. `gap` is for frames that went unseen in a
   * stream that carries on: the cadence has to be found again, but whether
   * its frames hold one instant each has not changed.
   */
  #J(e = !1) {
    this.#L = x, this.#Ue = x, this.#Te = 0, e || (this.#lt = !1), this.#$ = !1, this.#o?.reset(e);
  }
  /** Detect the pulldown phase of the frame being filtered on the GPU. */
  #li() {
    const { prev: e, cur: t, next: i } = this.#Mt(!1), s = this.#c[e], r = this.#c[t], o = this.#c[i];
    if (!s || !r || !o) return;
    const h = this.#F?.topFieldFirst !== !1 ? 0 : 1;
    this.#o?.measureComb(s, r, h), this.#o?.detect(r, o, h);
  }
  /**
   * Count the combing of the frame after the one being filtered, which says
   * whether its first field belongs between this frame's second-field lines.
   * Returns whether the count was made.
   */
  #ci() {
    const { cur: e, next: t } = this.#Mt(!1), i = this.#c[e], s = this.#c[t], r = this.#o;
    if (!i || !s || !r) return !1;
    const o = this.#F?.topFieldFirst !== !1 ? 0 : 1;
    try {
      r.measureComb(i, s, o, !0);
    } catch (h) {
      return this.#qe(
        `film detection failed: ${h instanceof Error ? h.message : String(h)}`
      ), !1;
    }
    return !0;
  }
  /**
   * Read back the previous frame's phase if it has arrived, and advance it
   * to the frame being filtered. The run is not advanced: only the GPU
   * counts observed frames.
   */
  #ui() {
    const e = this.#o?.poll() ?? null;
    e !== null && (this.#Ue = e, this.#Te = e.age, this.#lt = e.instant), this.#Te++;
    const { phase: t, run: i } = this.#Ue;
    t === 0 || this.#Te > Math.ceil(O * Math.max(1, this.#e.playbackRate)) ? this.#L = x : this.#L = {
      phase: (t - 1 + this.#Te) % O + 1,
      run: i
    };
  }
  #fi(e) {
    const t = [], i = this.#o?.metrics ?? new Float32Array(0);
    for (let r = 0; r < p.phase; r++) {
      const o = i[r * 4] ?? 0, h = i[r * 4 + 1] ?? 0, a = i[r * 4 + 2] ?? 0;
      t.push(
        `${o.toFixed(3)},${h.toString().padStart(4)},${a.toFixed(3)}`
      );
    }
    const s = this.#je.map((r, o) => `${o === 0 ? "-" : o}:${r}`).join(" ");
    return `frame=${e} phase=${this.#L.phase} run=${this.#L.run} known=${this.#Ue.phase}/${this.#Ue.run} age=${this.#Te} ${this.#$ ? "film" : "video"} period=${this.#y.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#ft}`;
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
  #bt(e, t) {
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
  #di(e, t) {
    const i = e.expectedDisplayTime;
    if (!Number.isFinite(i) || i <= 0 || !Number.isFinite(e.timeOrigin)) return t;
    const s = this.#bt(i, e.timeOrigin), r = it * Math.max(this.#w, this.#y);
    return s < t - r || s > t + r ? t : s;
  }
  #mi = (e, t) => {
    if (!this.#M || this.#Q) return;
    this.#Ft();
    const i = this.#bt(e, t.timeOrigin), { frame: s, picture: r, ...o } = t;
    this.#fe = s ?? this.#e, this.#A = r ?? null;
    try {
      this.#pi(i, o, s);
    } finally {
      this.#fe = this.#e, this.#A = null;
    }
    this.#Oe();
  };
  /**
   * Take a frame from either acquisition path into the selected renderer.
   * `now` is the ingestion time on this realm's clock.
   */
  #pi(e, t, i) {
    if (this.#x === "active") {
      this.#Ai(e, t, i);
      return;
    }
    this.#x !== "starting" && this.#et(e, t);
  }
  /**
   * @internal Feed Worker input through the same history and rendering decisions
   * as main-thread input. `now` is the ingestion time on the Worker's clock.
   * The metadata's display time stays on the page's clock and is converted
   * using the accompanying timeOrigin.
   */
  ingestExternalFrame(e, t, i) {
    this.#fe = i;
    try {
      this.#et(e, t);
    } finally {
      this.#fe = this.#e;
    }
  }
  /** Take one input into the shared history and decide its YADIF or IVTC presentation. */
  #et(e, t) {
    const i = this.#Ae;
    if (this.#re(i) && (this.#vi(t.mediaTime), !!this.#re(i) && t.width > 0 && t.height > 0)) {
      let s = !1;
      if (!this.#Me && this.#e.seeking) {
        const l = this.#e.buffered, d = this.#y >= Z ? this.#y / 1e3 : k / 1e3;
        for (let v = 0; v < l.length; v++)
          if (t.mediaTime >= l.start(v) && t.mediaTime < l.end(v) && Math.abs(t.mediaTime - this.#e.currentTime) <= d) {
            s = !0;
            break;
          }
      }
      if (s && (this.#Me = !0), (this.#X === 0 || this.#q === 0) && this.#jt(t.width, t.height), !this.#re(i)) return;
      if (this.#F && !this.#F.interlaced) {
        const l = performance.now();
        this.#Qt(l), this.#Ve = l, this.#V > 0 && this.#V--, this.#ut = !0, this.#Ti(), this.#me += performance.now() - l, this.#ie++, this.#pe++, this.#Yt(l);
        return;
      }
      const r = t.mediaTime - this.#_e, o = t.mozTiming, h = s || (o ? o.discontinuity || r < 0 || r > Q : r < 0 || r > Q);
      h && (this.#_ = 0, this.#y = 0, this.#C.discontinuities++, this.#S(), this.#J(), (s || !this.#ut) && (this.#V = 0)), this.#ut = !1;
      const a = this.#wi(t.presentedFrames, h);
      if (this.#_ > 0 && t.mediaTime === this.#_e && (!o || t.presentedFrames === this.#rt))
        return;
      if (!h) {
        const l = o?.periodMs ?? 0;
        l > 0 ? this.#zt(
          l * (this.#e.playbackRate || 1) / 1e3,
          1
        ) : this.#_ > 0 && r > 0 && this.#zt(r, a + 1);
      }
      this.#_e = t.mediaTime, this.#rt = t.presentedFrames;
      const c = performance.now();
      this.#Qt(c), this.#Ve = c;
      const A = performance.now(), f = this.#Xt(!1);
      if (this.#Zt(), this.#D && !this.#le && !this.#o)
        try {
          this.#Ut();
        } catch (l) {
          this.#qe(
            `film detector unavailable: ${l instanceof Error ? l.message : String(l)}`
          );
        }
      if (!this.#re(i)) {
        this.#K || this.#Je(f);
        return;
      }
      if (this.#Ze = !1, this.#ae = !1, this.#ct = !1, this.#D && !this.#le) {
        let l = !1;
        if (this.#_ === g && a === 0)
          try {
            this.#ui(), this.#li(), l = !0;
          } catch (d) {
            this.#qe(
              `film detection failed: ${d instanceof Error ? d.message : String(d)}`
            );
          }
        else
          this.#J(!0);
        this.#je[this.#L.phase] = (this.#je[this.#L.phase] ?? 0) + 1, this.#$ = this.#L.phase !== 0 && this.#L.run >= H, this.#$ ? this.#V = st : this.#V > 0 && this.#V--, this.#Ze = l && !this.#Pt, this.#ae = this.#Ze && this.#V > 0, this.#ct = this.#ae && !this.#$ && this.#B && this.#Ge() && this.#ci(), this.#ae && !this.#$ && this.#C.matched++, this.#N && (this.#Ct = this.#fi(t.presentedFrames));
      }
      if (this.#Pt = a > 0, !this.#re(i)) {
        this.#K || this.#Je(f);
        return;
      }
      const u = this.#di(t, e) + this.#w;
      if (this.#$)
        if (this.#Ge()) {
          const l = this.#L.phase;
          if (l === X)
            this.#ft++, this.#G++;
          else {
            const d = this.#y * O / rt, v = this.#Tt(1, e, d), E = nt[l] ?? 0, U = v || this.#Y === null ? u + d : u + E * this.#y;
            this.#tt(
              "film",
              !1,
              this.#gt("film", U, d),
              d
            );
          }
        } else
          this.#ce(!1, !1, null);
      else if (this.#B && this.#Ge()) {
        const l = this.#y / 2, v = this.#Tt(2, e, l) || this.#Y === null ? u + l * 2 : u, E = this.#gt("field", v, l);
        this.#tt("field", !1, E, l), this.#tt("field", !0, E + l, l);
      } else if (this.#Ge()) {
        const l = this.#y, v = this.#Tt(1, e, l) || this.#Y === null ? u + l : u;
        this.#tt(
          "frame",
          !1,
          this.#gt("frame", v, l),
          l
        ) || (this.#C.late++, this.#ce(!1, !1, null));
      } else
        this.#C.late += this.#l.length, this.#S(), this.#ce(!1, !1, null);
      this.#ve = Math.max(
        this.#ve,
        this.#l.length
      ), this.#Je(f), this.#me += performance.now() - A, this.#ie++, this.#Yt(c);
    }
  }
  #re(e) {
    return !this.#K && this.#M && e === this.#Ae;
  }
  #vi(e) {
    const t = this.#Ae;
    let i;
    for (let o = this.#ue.length - 1; o >= 0; o--) {
      const h = this.#ue[o];
      if (h.start <= e + 1e-6) {
        i = h;
        break;
      }
    }
    if (i?.codedSize && (i.codedSize.width !== this.#X || i.codedSize.height !== this.#q) && this.#jt(i.codedSize.width, i.codedSize.height), !this.#re(t)) return;
    const s = i?.scan;
    if (!s || this.#F?.interlaced === s.interlaced && this.#F.topFieldFirst === s.topFieldFirst)
      return;
    const r = this.#F?.interlaced;
    this.#F = s, this.#_ = 0, this.#S(), this.#Fe() && (r !== s.interlaced && (this.#y = 0), s.interlaced && (this.#P || this.#x === "main") ? this.#Xe() : this.#wt(), this.#J());
  }
  /**
   * Whether pictures are being filtered ahead of time and queued, rather than
   * drawn as their frame arrives.
   *
   * A picture for every frame has nothing to schedule -- there is one of them
   * and it goes up now -- and neither has a filter that has yet to see two
   * frames go by, since until then there is no idea how long a frame lasts.
   */
  #Ge() {
    return (this.#B || this.#D) && this.#y > 0 && this.#u.length === T;
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
  #zt(e, t) {
    const s = e * 1e3 / (this.#e.playbackRate || 1) / t;
    s < Z || s > k || (this.#y = this.#y > 0 && s > this.#y * qe ? this.#y + (s - this.#y) * Ye : s);
  }
  /**
   * Filter one field into an output texture and put it in the queue.
   *
   * The three frames the filter reads are only the right three between one
   * frame arriving and the next, so both fields of a frame are built here and
   * held as pictures. What is queued after that is a copy waiting for a
   * moment, which no later frame can take away.
   */
  #tt(e, t, i, s) {
    const r = this.#Wt();
    if (r === null) return !1;
    const o = this.#u[r];
    if (!o) return !1;
    for (this.#a = r; this.#l.length > 0 && this.#l[0]?.slot === r; )
      this.#l.shift(), this.#C.late++;
    this.#ce(!1, t, o.framebuffer);
    const h = {
      slot: r,
      at: i,
      duration: s,
      cadence: e,
      phase: e === "film" ? this.#L.phase : e === "field" ? t ? 2 : 1 : 0,
      droppedBefore: this.#G
    };
    return this.#G = 0, this.#l.push(h), this.#Y = h, !0;
  }
  /**
   * When a picture goes up: one duration after the last one of its cadence,
   * nudged towards the clock by a fraction of the gap so that the schedule
   * follows it without a picture ever moving across a refresh. (otya)
   *
   * `ideal` is when this frame would go up were it the only one, and frames
   * do not arrive evenly: where the frame period and the refresh nearly
   * divide, a frame comes a refresh early or late now and then, and for
   * seconds at a time while the two drift past each other. An early frame
   * is no trouble, its pictures wait. A late one has missed its moment, and
   * the chain can only start again from where the frame is -- a refresh
   * with nothing new to show, which nothing can avoid. What can be avoided
   * is paying for it twice: the frames after it arrive on time, which is
   * now a refresh early, and pulling the chain back to them skips a picture
   * to undo a delay nobody sees. So the chain keeps the lateness it was
   * pushed to (`#scheduleLag`), treats the frames that arrive at that phase
   * as on time, and takes the next late frame in its stride.
   *
   * Frames arrive on refreshes, so whichever phase one arrives at, what is
   * left of its distance from the chain after whole refreshes is the
   * chain's own drift against the refresh grid, and every frame nudges that
   * out. The lag is kept in whole refreshes for the same reason: a chain
   * held half a refresh off the grid has each pair of fields come due
   * together, and one of every pair is dropped for as long as it stays.
   *
   * The lag follows what frames actually do. When none has arrived at the
   * phase it stands for in SCHEDULE_WINDOW pictures, it moves to the nearest
   * phase they did arrive at; if that was earlier than the chain allows for,
   * the chain moves up to it, which skips a picture once. Anything further
   * out than a refresh either way is not jitter, and the chain restarts from
   * the clock.
   */
  #gt(e, t, i) {
    if (!(i > 0)) return t;
    const s = this.#Y, r = this.#w;
    if (s !== null && s.cadence === e) {
      const o = s.at + s.duration, h = o - t, a = Math.round(h / r), c = a - this.#Z, A = h - a * r;
      if (a >= 0 && c <= 1) {
        const f = o + Math.max(
          -j,
          Math.min(j, -A * Ke)
        );
        if (c === 0)
          return this.#k = 0, f;
        if (this.#k === 0 || c > 0 != this.#he > 0 ? (this.#k = 0, this.#he = c) : Math.abs(c) < Math.abs(this.#he) && (this.#he = c), ++this.#k < Je) return f;
        const m = this.#he;
        return this.#k = 0, m < 0 ? (this.#Z += m, f) : (this.#C.resynced++, this.#xt(f - m * r));
      }
      if (a < 0 && this.#Z - a <= 1)
        return this.#Z -= a, this.#k = 0, this.#C.resynced++, this.#xt(t);
    }
    return this.#Z = 0, this.#k = 0, s !== null && this.#C.resynced++, this.#xt(t);
  }
  /** Start the chain again at `at`, which is where the caller's picture goes. */
  #xt(e) {
    for (let t = this.#l.at(-1); t && t.at >= e; )
      this.#l.pop(), this.#C.late++, t = this.#l.at(-1);
    return e;
  }
  /** Make room without treating ordinary capacity pressure as clock divergence. */
  #Tt(e, t, i) {
    const s = this.#l.at(-1), r = (z + 1) * Math.max(this.#w, i);
    if (s && s.at - t > r)
      return this.#S(), this.#C.queueResetted++, !0;
    const o = Math.max(
      0,
      this.#l.length + e - z
    );
    let h = 0, a = 0;
    for (; a < o; ) {
      const c = this.#l.shift();
      if (!c) break;
      h += c.duration, a++;
    }
    for (const c of this.#l) c.at -= h;
    return this.#C.late += a, !1;
  }
  /** Select an output whose pixels are not still represented by the canvas or queue. */
  #Wt() {
    const e = this.#n?.kind === "texture" ? this.#n.texture : null, t = new Set(this.#l.map(({ slot: s }) => s));
    for (let s = 1; s <= T; s++) {
      const r = (this.#a + s) % T, o = this.#u[r];
      if (o && o.texture !== e && !t.has(r))
        return r;
    }
    const i = this.#l[0];
    if (i) {
      const s = this.#u[i.slot];
      if (s && s.texture !== e) return i.slot;
    }
    return null;
  }
  /** The loop that puts filtered fields up, and the only thing that draws. */
  #Xe() {
    this.#b === null && (!this.#M || this.#Q || (this.#R = 0, this.#b = this.#Re(this.#yt)));
  }
  #wt() {
    this.#it(this.#b), this.#b = null, this.#S();
  }
  #yt = (e) => {
    if (this.#b = null, !this.#M || this.#Q) return;
    this.#Ei(e);
    const t = this.#Ae;
    this.#h.flush(e), this.#re(t) && (this.#x === "main" && this.#gi(this.#I, e), this.#b = this.#Re(this.#yt));
  };
  /**
   * Fit a grid of refreshes (period and phase) to the animation frames. rAF
   * timestamps wander by a millisecond or so, which is more than the
   * nearest-refresh decision in #present can take; the grid is what it
   * compares against. A frame far off the grid restarts it. (otya)
   */
  #Ei(e) {
    const t = e - this.#R;
    this.#R = e;
    const i = Math.max(1, Math.round(t / this.#w)), s = this.#I + i * this.#w, r = e - s;
    if (this.#I === 0 || t <= 0 || t > k || Math.abs(r) > this.#w / 4) {
      t >= 1 && t <= k && (this.#w = t), this.#I = e;
      return;
    }
    this.#w += r / i * et, this.#I = s + r * tt;
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
  #Ht() {
    const e = this.#P;
    if (e)
      return { frames: e, origin: performance.timeOrigin };
    const t = this.#i.ownerDocument?.defaultView ?? this.#e.ownerDocument?.defaultView ?? null;
    return t === null ? { frames: ht, origin: performance.timeOrigin } : { frames: t, origin: t.performance.timeOrigin };
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
  #Re(e) {
    const { frames: t, origin: i } = this.#Ht(), s = t.requestAnimationFrame(
      (r) => e(this.#bt(r, i))
    );
    return { frames: t, handle: s };
  }
  /** Cancel a pending animation frame through the source that issued it. */
  #it(e) {
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
  #Ft() {
    if (this.#P) return;
    this.#bi();
    const { frames: e } = this.#Ht(), t = this.#b !== null && this.#b.frames !== e, i = this.#p !== null && this.#p.frames !== e;
    !t && !i || (this.#R = 0, t && (this.#it(this.#b), this.#b = this.#Re(this.#yt)), i && (this.#it(this.#p), this.#p = this.#Re(this.#Dt)));
  }
  /** Watch the current document for visibility changes and DOM adoption. */
  #bi() {
    const e = this.#P ? null : this.#i.ownerDocument ?? null;
    e !== this.#m && (this.#m?.removeEventListener(
      "visibilitychange",
      this.#Rt
    ), this.#m = e, e?.addEventListener("visibilitychange", this.#Rt), this.#z?.disconnect(), e && this.#z?.observe(e, { childList: !0, subtree: !0 }));
  }
  #Rt = () => {
    this.#K || this.#Ft();
  };
  /** Deliver faster-playback captures even when a Worker owns the drawing loop. */
  #st() {
    this.#P || this.#p !== null || !this.#h.captureDriven || !this.#M || this.#Q || (this.#p = this.#Re(this.#Dt));
  }
  /** Cancel the page's pending capture delivery. */
  #$t() {
    this.#it(this.#p), this.#p = null;
  }
  /** Flush captured pictures on the refresh that will present them. */
  #Dt = (e) => {
    if (this.#p = null, !this.#M || this.#Q) return;
    const t = this.#Ae;
    this.#h.flush(e), this.#re(t) && this.#h.captureDriven && (this.#p = this.#Re(this.#Dt));
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
  #gi(e, t) {
    const i = this.#w / 2, s = (a) => {
      const c = a.at - e;
      return c <= i - q ? !0 : c > i + q ? !1 : this.#De > 0;
    };
    for (; this.#l[1] && s(this.#l[1]); )
      this.#C.late++, this.#l.shift();
    const r = this.#l[0];
    if (!r || !s(r)) return;
    this.#l.shift(), this.#De = r.at - e;
    const o = performance.now(), h = this.#Xt(!0);
    this.#Vt(r.slot), this.#Je(h), this.#Be += performance.now() - o, this.#pe++, this.#N && this.#xi(r, t), this.#W = t;
  }
  /** Preserve upstream's opt-in presentation timing log in either renderer. */
  #xi(e, t) {
    const i = this.#W === 0 ? 0 : t - this.#W, s = i / this.#w, r = e.cadence === "film" ? `phase ${e.phase}` : e.cadence === "field" ? `field ${e.phase}` : "frame", o = e.phase === 0 ? "duplicate" : `phase ${X}`, h = e.droppedBefore > 0 ? `, ${o} dropped before it` + (e.droppedBefore > 1 ? ` (${e.droppedBefore})` : "") : "";
    console.log(
      `yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at - t).toFixed(2)} ms${h}`
    );
  }
  /** Copy one of the filtered pictures onto the canvas. */
  #Vt(e) {
    const t = this.#u[e];
    t && this.#_t(t.texture);
  }
  /** Put a progressive frame through unchanged, keeping one display surface. */
  #Ti() {
    this.#Zt();
    const e = this.#c[this.#O];
    e && this.#_t(e, !0), this.#_ = 0;
  }
  /** Apply visibility on the page; a Worker reports only the desired state. */
  #ne(e) {
    if (this.#P) {
      this.#P.onVisibility(e);
      return;
    }
    this.#i.style.visibility = e ? "visible" : "hidden";
  }
  #_t(e, t = !1, i = !0) {
    const s = this.#s;
    s.bindFramebuffer(s.FRAMEBUFFER, null), s.useProgram(this.#T), s.activeTexture(s.TEXTURE0), s.bindTexture(s.TEXTURE_2D, e), s.uniform1i(this.#v, 0), s.uniform1i(this.#E, t ? 1 : 0), s.viewport(0, 0, this.#X, this.#q), s.drawArrays(s.TRIANGLES, 0, 3), this.#n = { kind: "texture", texture: e, flip: t }, this.#ne(!0), i && this.#H++;
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
  #wi(e, t) {
    let i = 0;
    return this.#ke !== 0 && !t && (i = Math.max(0, e - this.#ke - 1), this.#C.missed += i), this.#ke = e, i;
  }
  /**
   * Frames stopped arriving for a while -- a pause, a stall, a tab in the
   * background -- and a rate averaged over time nothing was asked of the
   * filter says nothing about it. Begin the interval at this frame.
   */
  #Qt(e) {
    e - this.#Ve <= Y || (this.#Qe = e, this.#ie = 0, this.#me = 0, this.#pe = 0, this.#Be = 0, this.#ve = 0, this.#H = 0, this.#Le = 0, this.#ge = 0, this.#Ie = 0, this.#xe = 0);
  }
  #Yt(e) {
    const t = e - this.#Qe;
    if (t < Y) return;
    const i = this.#Ge() && (this.#B || this.#$) ? this.#pe : this.#ie, s = this.#ie ? (this.#me + this.#Be) / this.#ie : 0;
    let r;
    this.#Ee != null && (r = 0, this.#ge !== 0 && (r += this.#Le / 1e6 / this.#ge), this.#xe !== 0 && (r += this.#Ie / 1e6 / this.#xe / 2));
    const o = {
      ...this.#C,
      // The element's own count of what its decoder could not keep up with,
      // which is the machine being behind rather than this filter.
      dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0,
      fps: i * 1e3 / t,
      frameMs: s,
      maxQueuedFields: this.#ve,
      outputFps: this.#H * 1e3 / t,
      gpuMs: r,
      film: this.#$,
      oneInstant: this.#lt,
      filmError: this.#le
    };
    this.dispatchEvent(new CustomEvent("stats", { detail: o })), this.#nt?.(o), this.#Qe = e, this.#ie = 0, this.#me = 0, this.#pe = 0, this.#Be = 0, this.#ve = 0, this.#H = 0, this.#Le = 0, this.#ge = 0, this.#Ie = 0, this.#xe = 0;
  }
  /** Take the newest frame into the ring. */
  #Zt() {
    const e = this.#s;
    this.#O = (this.#O + 1) % g;
    const t = this.#A, i = this.#c[this.#O];
    t !== null && this.#f !== null && i !== void 0 ? (this.#c[this.#O] = this.#f.adopt(t, i), this.#A = null) : (e.bindTexture(e.TEXTURE_2D, i ?? null), e.texImage2D(
      e.TEXTURE_2D,
      0,
      e.RGBA,
      e.RGBA,
      e.UNSIGNED_BYTE,
      this.#fe
    )), this.#_ = Math.min(this.#_ + 1, g);
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
  #ce(e, t, i, s = !0) {
    if (this.#_ === 0 || this.#Q) return;
    s && (this.#_ === g && !e ? this.#C.filtered++ : this.#C.degraded++);
    const r = this.#s, { prev: o, cur: h, next: a } = this.#Mt(e);
    r.bindFramebuffer(r.FRAMEBUFFER, i), r.useProgram(this.#d);
    for (const [d, v] of [o, h, a].entries())
      r.activeTexture(r.TEXTURE0 + d), r.bindTexture(r.TEXTURE_2D, this.#c[v] ?? null);
    r.uniform1i(this.#r.prev, 0), r.uniform1i(this.#r.cur, 1), r.uniform1i(this.#r.next, 2);
    const c = this.#D ? this.#o?.texture ?? null : null, A = this.#D ? this.#o?.combTexture ?? null : null, f = c !== null && A !== null;
    c !== null && A !== null && (r.activeTexture(r.TEXTURE0 + 3), r.bindTexture(r.TEXTURE_2D, c), r.uniform1i(this.#r.fieldMetrics, 3), r.activeTexture(r.TEXTURE0 + 4), r.bindTexture(r.TEXTURE_2D, A), r.uniform1i(this.#r.comb, 4));
    const m = this.#ct ? this.#o?.combAheadTexture ?? null : null, u = f && !e;
    r.activeTexture(r.TEXTURE0 + 5), r.bindTexture(r.TEXTURE_2D, m), r.uniform1i(this.#r.combAhead, 5), r.activeTexture(r.TEXTURE0), r.uniform2i(this.#r.size, this.#X, this.#q);
    const l = this.#kt ? 0 : 1;
    r.uniform1i(this.#r.parity, t ? 1 - l : l), r.uniform1i(this.#r.tff, this.#kt ? 1 : 0), r.uniform1i(this.#r.second, t ? 1 : 0), r.uniform1i(this.#r.spatialCheck, this.#ee ? 1 : 0), r.uniform1i(this.#r.debug, this.#N ? 1 : 0), r.uniform1i(this.#r.film, f ? 1 : 0), r.uniform1i(
      this.#r.match,
      u && this.#ae && (!t || m !== null) ? 1 : 0
    ), r.uniform1i(this.#r.instant, u && this.#Ze ? 1 : 0), r.uniform1i(this.#r.phase, this.#L.phase), r.viewport(0, 0, this.#X, this.#q), r.drawArrays(r.TRIANGLES, 0, 3), this.#N && f && this.#ai(this.#Ct, 0, 90), i === null && (this.#n = { kind: "yadif", flush: e, second: t }, this.#ne(!0), s && this.#H++);
  }
  #Mt(e) {
    const t = (i) => (this.#O + g - i) % g;
    return this.#_ === 1 ? { prev: this.#O, cur: this.#O, next: this.#O } : e ? { prev: t(1), cur: this.#O, next: this.#O } : this.#_ === 2 ? { prev: t(1), cur: t(1), next: this.#O } : { prev: t(2), cur: t(1), next: this.#O };
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
  #ze() {
    if (this.#Ft(), !this.#U) return;
    const e = this.#e, t = e.videoWidth, i = e.videoHeight;
    if (t === 0 || i === 0) return;
    const s = Math.min(
      e.offsetWidth / t,
      e.offsetHeight / i
    ), r = t * s, o = i * s;
    this.#i.style.left = `${e.offsetLeft + (e.offsetWidth - r) / 2}px`, this.#i.style.top = `${e.offsetTop + (e.offsetHeight - o) / 2}px`, this.#i.style.width = `${r}px`, this.#i.style.height = `${o}px`;
  }
  #jt(e, t) {
    const i = this.#s;
    this.#t.width = e, this.#t.height = t, this.#X = e, this.#q = t, this.#_ = 0, this.#V = 0, this.#n = null, this.#S(), this.#ze();
    for (const s of this.#c) i.deleteTexture(s);
    this.#c = [];
    for (let s = 0; s < g; s++) {
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
      ), this.#c.push(r);
    }
    this.#We(), (this.#B || this.#D) && this.#qt(), this.#o?.resize(e, t), this.#Fe();
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
  #qt() {
    const e = this.#s;
    if (!(this.#u.length === T || this.#X === 0)) {
      this.#We();
      for (let t = 0; t < T; t++) {
        const i = e.createTexture();
        e.bindTexture(e.TEXTURE_2D, i), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), e.texImage2D(
          e.TEXTURE_2D,
          0,
          e.RGBA,
          this.#X,
          this.#q,
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
          e.deleteFramebuffer(s), e.deleteTexture(i), this.#We();
          return;
        }
        this.#u.push({ texture: i, framebuffer: s });
      }
      this.#a = T - 1;
    }
  }
  #We() {
    const e = this.#s, t = this.#n?.kind === "texture" ? this.#n.texture : null;
    this.#u.some((i) => i.texture === t) && (this.#n = null);
    for (const { texture: i, framebuffer: s } of this.#u)
      e.deleteFramebuffer(s), e.deleteTexture(i);
    this.#u = [], this.#S();
  }
  /**
   * Wrap the element in a `<div>` of this one's own and put the canvas over
   * it. The wrapper is what the canvas is positioned against; moving the
   * element out of the tree and back within the one task leaves playback
   * alone, which is what makes turning this on mid-stream free.
   */
  #yi() {
    if (this.#U) return;
    const e = this.#e.parentElement;
    if (!e) return;
    const t = document.createElement("div");
    t.style.cssText = "position:relative;display:inline-block;line-height:0;max-width:100%", e.insertBefore(t, this.#e), t.appendChild(this.#e), t.appendChild(this.#i), this.#U = t, this.#j?.observe(this.#e), this.#ze();
  }
  #Fi() {
    if (this.#P) return;
    const e = this.#U;
    this.#U = null, this.#j?.disconnect(), this.#i.remove(), e?.parentElement && (e.parentElement.insertBefore(this.#e, e), e.remove());
  }
  #Kt = () => this.#ze();
  /** Forward a media event with the page's playback state that gives it meaning. */
  #St(e) {
    return !this.#g || this.#x === "main" ? !1 : (this.#g.postMessage({
      type: "event",
      name: e,
      video: this.#Et()
    }), !0);
  }
  #Jt = () => {
    if (this.#St("emptied")) {
      this.#se(), this.#ne(!1);
      return;
    }
    this.#_ = 0, this.#_e = 0, this.#rt = 0, this.#S(), this.#J(), this.#V = 0, this.#y = 0, this.#ei(), this.#n = null, this.#ne(!1);
  };
  #ei() {
    this.#C = {
      filtered: 0,
      missed: 0,
      degraded: 0,
      discontinuities: 0,
      resynced: 0,
      late: 0,
      queueResetted: 0,
      matched: 0
    }, this.#je.fill(0), this.#ft = 0, this.#ke = 0, this.#Qe = 0, this.#Ve = 0, this.#ie = 0, this.#me = 0, this.#pe = 0, this.#Be = 0, this.#ve = 0, this.#H = 0, this.#S(), this.#Le = 0, this.#ge = 0, this.#Ie = 0, this.#xe = 0;
  }
  /**
   * A new seek invalidates any destination frame remembered for the last one.
   */
  #ti = () => {
    if (this.#St("seeking")) {
      this.#se();
      return;
    }
    this.#Me = !1;
  };
  /**
   * Playback stopped, so the frame being held back goes up now. One picture,
   * whatever the rate: a still frame stands for a moment, and the moment is
   * the one the first field was taken at.
   */
  #oe = (e) => {
    if (e.type === "ratechange" && (this.#h.captureDriven ? this.#st() : this.#$t()), (e.type === "pause" || e.type === "ended" || e.type === "seeked" || e.type === "ratechange") && this.#St(e.type)) {
      this.#se();
      return;
    }
    if (e.type === "seeked") {
      const i = this.#Me;
      if (this.#Me = !1, i) return;
      this.#_ = 0, this.#S(), this.#J(), this.#n = null, this.#ne(!1);
      return;
    }
    const t = e.type === "ratechange";
    if (t && (this.#y = 0, this.#_e = this.#e.currentTime), this.#S(), this.#M && this.#_ > 0) {
      const i = this.#Wt(), s = i === null ? void 0 : this.#u[i];
      i !== null && s ? (this.#a = i, this.#ce(!0, !1, s.framebuffer), this.#Vt(i)) : this.#ce(!0, !1, null);
    }
    t && (this.#_ = 0, this.#ke = 0, this.#J());
  };
  /**
   * A lost context takes the textures and the program with it. Rebuilding
   * them is possible, but a page that has lost its context has bigger
   * problems; getting out of the way leaves the element's own picture showing.
   */
  #ii = (e) => {
    if (e.preventDefault(), this.#P) {
      this.#P.onFailure("the deinterlacer WebGL context was lost");
      return;
    }
    this.#x !== "active" && (this.#Q = !0, this.#vt("the deinterlacer WebGL context was lost"), this.stop());
  };
}
function K(n, e) {
  const t = n.createProgram(), i = J(n, n.VERTEX_SHADER, je), s = J(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(t, i), n.attachShader(t, s), n.linkProgram(t), n.deleteShader(i), n.deleteShader(s), !n.getProgramParameter(t, n.LINK_STATUS)) {
    const r = n.getProgramInfoLog(t);
    throw n.deleteProgram(t), new Error(
      `the deinterlacer failed to link: ${r ?? "no reason given"}`
    );
  }
  return t;
}
function J(n, e, t) {
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
const ee = "data:video/mp4;base64,AAAAHGZ0eXBpc281AAACAGlzbzVpc282bXA0MQAAAu9tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAB8nRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAFoAAABDgAAAAAAY5tZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAHUwAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAE5bWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAA+XN0YmwAAACtc3RzZAAAAAAAAAABAAAAnWF2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAFoAQ4AEgAAABIAAAAAAAAAAEVTGF2YzYxLjE5LjEwMSBsaWJ4MjY0AAAAAAAAAAAAAAAY//8AAAA3YXZjQwFkACn/4QAZZ2QAKazZQFoET94CIAAAfSAAHUwD4sWywAEAB2j5KBLLIsD9+PgAAAAAEHBhc3AAAAABAAAAAQAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAAKG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAAAAAAAAAAAAAAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuNy4xMDAAAACYbW9vZgAAABBtZmhkAAAAAAAAAAEAAACAdHJhZgAAABx0ZmhkAAIAOAAAAAEAAAPpAAAEJwEBAAAAAAAUdGZkdAEAAAAAAAAAAAAAAAAAAEh0cnVuAAAKBQAAAAYAAACgAgAAAAAABCcAAAfSAAAAQgAAE40AAAA/AAAH0gAAAgAAAAAAAAAARAAAA+kAAAG7AAAH0gAACK9tZGF0AAACrwYF//+r3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTQgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDEzMyBtZT11bWggc3VibWU9MTAgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0yNCBjaHJvbWFfbWU9MSB0cmVsbGlzPTIgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xNSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9dGZmIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTIgYl9iaWFzPTAgZGlyZWN0PTMgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0wIGtleWludD0zMCBrZXlpbnRfbWluPTMgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD0zMCByYz1jcmYgbWJ0cmVlPTEgY3JmPTguMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAUGAQEygAAAAWdliIICAj/+/76ivgU3edyfbbnP6kzu1BfFPXa9rMu/FCi/GMk76JT20AAAAwAAAwAAAwAAAwAAAwAAAwEJmrWZnq7KhXxVTgAAAwAAAwAAAwAABJ9gAAADAAAKtgAAAwAAAwCi4AAAAwAAHQgAAAMAAAiqAAADAAADA7EAAAMAAAMCCgAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAL+QAAAAUGAQEygAAAADVBmiIWQj/51kP//f3t2AAPsAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAS8AAAAAUGAQEygAAAADJBnkETiEf/hv/80gAJcAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAkIQAAAAUGAQEygAAAAfMBnmCTRCP/9ZJR/1zH/6vL5qeSOTmASFdQlObW+4YAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAxvEAAAAwAAAwAAAwAAE4wAAAMAAAMAAAMAAFuAAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAMuAAAAABQYBATKAAAAANwGeYZakI//1bXH/Een/+rAALngAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAN+EAAAAFBgEBMoAAAAGuQZpileloiEf/2XyP/Fn/6mXyw21/v4X7ly3FFO60AAADAAADAAADAAADAAADAAADAAADADKWVJAQiFeS9HQZhFSJuVc/HAAAAwAAAwAAAwAAAwAAAwAAAwAAj8AAAAMAAAMABTIAAAMAAAMAAD+QAAADAAADAAQkAAADAAADAABJgAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAXUQAAAENtZnJhAAAAK3RmcmEBAAAAAAAAAQAAAAAAAAABAAAAAAAAB9IAAAAAAAADCwEBAQAAABBtZnJvAAAAAAAAAEM=", At = 0.5, at = 3e3, te = 0.1, R = 16, ie = 'video/mp4; codecs="avc1.640029"';
let W = null;
function lt(n = {}) {
  return W ??= ct(n), W;
}
async function Et(n = {}) {
  return (await lt(n)).deinterlaces;
}
function bt() {
  W = null;
}
async function ct(n) {
  const e = n.tolerance ?? At, t = n.timeoutMs ?? at, i = performance.now(), s = (h) => ({
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
    o = ft(r, t);
    const h = I(L(r, "loadeddata"), t), a = r.play().then(
      () => !0,
      () => !1
    );
    if (await o.ready, await h, await dt(r, t, await a), r.videoWidth === 0 || r.videoHeight === 0)
      return s(new Error("the probe clip decoded to nothing"));
    const c = mt(r);
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
const G = typeof MediaSource > "u" ? globalThis.ManagedMediaSource : MediaSource, ut = typeof MediaSource > "u";
function ft(n, e) {
  if (!G || !G.isTypeSupported(ie))
    throw new Error("the probe clip needs Media Source Extensions");
  const t = ee.indexOf(","), i = atob(ee.slice(t + 1)), s = new Uint8Array(i.length);
  for (let a = 0; a < i.length; a++) s[a] = i.charCodeAt(a);
  const r = new G(), o = URL.createObjectURL(r);
  if (ut) {
    n.disableRemotePlayback = !0;
    const a = document.createElement("source");
    a.type = "video/mp4", a.src = o, n.append(a), n.load();
  } else
    n.src = o;
  const h = (async () => {
    await I(L(r, "sourceopen"), e);
    const a = r.addSourceBuffer(ie), c = I(L(a, "updateend"), e);
    a.appendBuffer(s), await c, r.endOfStream();
  })();
  return { url: o, ready: h };
}
async function dt(n, e, t) {
  if (t) {
    const i = performance.now();
    for (; n.currentTime < te && performance.now() - i < e; )
      await new Promise((s) => requestAnimationFrame(s));
    n.pause();
  } else
    n.currentTime = te, await I(L(n, "seeked"), e);
}
function mt(n) {
  const e = n.videoHeight, t = document.createElement("canvas");
  t.width = R, t.height = e;
  const i = t.getContext("2d", { willReadFrequently: !0 });
  if (!i) throw new Error("there is no 2d context to read the clip with");
  i.imageSmoothingEnabled = !1, i.drawImage(n, 0, 0, R, e);
  const s = i.getImageData(0, 0, R, e).data, r = (A) => {
    let f = 0;
    for (let m = 0; m < R; m++)
      f += s[(A * R + m) * 4 + 1] ?? 0;
    return f / R;
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
function L(n, e) {
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
function I(n, e) {
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
Qe(le);
export {
  vt as Deinterlacer,
  ke as YADIF_FRAGMENT_SHADER,
  Ce as YADIF_UNIFORMS,
  Et as decoderDeinterlaces,
  bt as forgetDecoderProbe,
  lt as probeDecoder,
  pt as supportsDeinterlace
};
//# sourceMappingURL=index.js.map
