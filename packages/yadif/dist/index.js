const be = "" + new URL("assets/worker-DVHjcZho.js", import.meta.url).href, S = `#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;
function y(n, e, t) {
  const i = n.createProgram(), s = j(n, n.VERTEX_SHADER, t), r = j(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(i, s), n.attachShader(i, r), n.linkProgram(i), n.deleteShader(s), n.deleteShader(r), !n.getProgramParameter(i, n.LINK_STATUS)) {
    const h = n.getProgramInfoLog(i);
    throw n.deleteProgram(i), new Error(
      `the deinterlacer failed to link: ${h ?? "no reason given"}`
    );
  }
  return i;
}
function j(n, e, t) {
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
const xe = `#version 300 es
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
`, ge = `#version 300 es
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
function Te(n, e) {
  const t = y(n, xe, ge), i = n.getAttribLocation(t, "aVertexPosition"), s = n.getAttribLocation(t, "aTextureCoord"), r = n.getUniformLocation(t, "uTexture"), h = n.getUniformLocation(t, "uMatrix"), o = n.getUniformLocation(t, "uUvMatrix"), a = n.getUniformLocation(t, "uTextColor"), u = n.getUniformLocation(t, "uBackColor");
  if (r == null || h == null || o == null || a == null || u == null)
    throw new Error(
      "failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER"
    );
  const A = n.createBuffer(), f = n.createBuffer();
  return {
    gl: n,
    ...we(n, e),
    program: t,
    programUniforms: {
      vertex: i,
      textureCoord: s,
      texture: r,
      matrix: h,
      uvMatrix: o,
      textColor: a,
      backColor: u
    },
    positionBuffer: A,
    textureBuffer: f
  };
}
function we(n, e) {
  const t = new OffscreenCanvas(0, 0), i = t.getContext("2d"), s = /* @__PURE__ */ new Map();
  let r = 0;
  const h = 0;
  let o = 1;
  i.font = e, i.fillStyle = "white";
  for (let u = 32; u < 128; u++) {
    const A = String.fromCharCode(u), f = i.measureText(A), d = Math.ceil(
      f.actualBoundingBoxDescent + f.actualBoundingBoxAscent + 1
    ), l = Math.ceil(
      f.actualBoundingBoxLeft + f.actualBoundingBoxRight + 1
    );
    s.set(A, {
      x: r,
      y: h,
      width: l,
      height: d,
      metrics: f
    }), o = Math.max(o, d), r += l;
  }
  t.width = r, t.height = o, i.font = e, i.fillStyle = "white";
  for (const [u, A] of s)
    i.fillText(
      u,
      Math.floor(A.x + A.metrics.actualBoundingBoxLeft + 1),
      Math.floor(A.metrics.actualBoundingBoxAscent + 1)
    );
  const a = n.createTexture();
  return n.bindTexture(n.TEXTURE_2D, a), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MIN_FILTER, n.LINEAR), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MAG_FILTER, n.LINEAR), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_WRAP_S, n.CLAMP_TO_EDGE), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_WRAP_T, n.CLAMP_TO_EDGE), n.texImage2D(n.TEXTURE_2D, 0, n.RGBA, n.RGBA, n.UNSIGNED_BYTE, t), { fontTexture: a, chars: s, textureSize: { width: r, height: o } };
}
function Fe(n) {
  const e = n.gl;
  e.deleteBuffer(n.positionBuffer), e.deleteBuffer(n.textureBuffer), e.deleteTexture(n.fontTexture), e.deleteProgram(n.program);
}
function ye(n, e, t, i, s, r, h) {
  const o = [], a = [], u = t;
  for (const d of e) {
    if (d === `
`) {
      t = u, i += h;
      continue;
    }
    const l = n.chars.get(d);
    if (l == null)
      continue;
    if (l.width === 1) {
      t += l.metrics.width;
      continue;
    }
    const c = Math.floor(t - l.metrics.actualBoundingBoxLeft), m = Math.floor(i - l.metrics.actualBoundingBoxAscent), E = c + l.width, b = m + l.height;
    o.push(c, m), a.push(l.x, l.y), o.push(c, b), a.push(l.x, l.y + l.height), o.push(c + l.width, b), a.push(l.x + l.width, l.y + l.height), o.push(E, b), a.push(l.x + l.width, l.y + l.height), o.push(c, m), a.push(l.x, l.y), o.push(E, m), a.push(l.x + l.width, l.y), t += l.metrics.width;
  }
  const A = n.gl;
  A.useProgram(n.program), A.bindBuffer(A.ARRAY_BUFFER, n.positionBuffer), A.bufferData(A.ARRAY_BUFFER, new Float32Array(o), A.STATIC_DRAW), A.vertexAttribPointer(
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
  function f(d, l, c) {
    const m = [];
    for (let E = 0; E < l; E++)
      for (let b = 0; b < d; b++)
        m.push(c[b * d + E]);
    return m;
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
  ])), A.viewport(0, 0, s, r), A.enable(A.BLEND), A.blendFunc(A.SRC_ALPHA, A.ONE_MINUS_SRC_ALPHA), A.drawArrays(A.TRIANGLES, 0, o.length / 2), A.disable(A.BLEND);
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
   * `(score, clean, combed blocks, on)`: the one-instant score; whether this
   * frame was clean and how many blocks were combed (both 0 for a still
   * frame); and whether the verdict is on. See INSTANT_ON and the `instant`
   * function of METRICS.
   */
  instant: 7
}, R = 8, w = 16, G = 8, Re = 15, De = 6, _e = 8, Me = 30, Se = 0.01, Pe = 2e-3, fe = 2, X = 1, Ce = 2, Z = 10, Ie = {
  a: "uA",
  b: "uB",
  fieldMetrics: "uFieldMetrics",
  first: "uFirst",
  size: "uSize"
}, de = 16, me = 8, Ne = `#version 300 es

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
  const int BLOCK_W = ${de};
  const int BLOCK_H = ${me};

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
`, Be = {
  second: "uSecond",
  first: "uFirst",
  size: "uSize"
}, B = 8, Le = `#version 300 es
precision highp float;

uniform sampler2D uSecond;
uniform sampler2D uFirst;

uniform ivec2 uSize;

layout(location = 0) out vec4 outSecond;
layout(location = 1) out vec4 outFirst;

void main()
{
  ivec2 dst = ivec2(gl_FragCoord.xy);
  ivec2 base = dst * ${B};

  vec4 second = vec4(0.0);
  vec4 first = vec4(0.0);

  for (int y = 0; y < ${B}; ++y) {
    for (int x = 0; x < ${B}; ++x) {
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
`, ke = {
  previous: "uPrevious",
  second: "uSecond",
  first: "uFirst",
  comb: "uComb",
  size: "uSize"
}, Ue = `#version 300 es
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
  return differing <= ${fe}.0;
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
  bool believed = run >= ${Z}.0;
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
 * The instant texel; see INSTANT_ON. A frame is moving if it differs from
 * the frame before it. This is the pair the comb count uses, and the count
 * only sees what changed since that frame. A frame equal to the one before
 * it shows nothing, however much the next frame differs.
 */
vec4 instant(vec4 last, vec4 dSecondPrevious, vec4 dFirstPrevious)
{
  float score = last[0];
  if (max(dSecondPrevious[2], dFirstPrevious[2]) <= ${Pe}) return vec4(score, 0.0, 0.0, last[3]);
  ivec2 blocks = textureSize(uComb, 0);
  float combed = 0.0;
  for (int y = 0; y < blocks.y; ++y) {
    for (int x = 0; x < blocks.x; ++x) {
      if (texelFetch(uComb, ivec2(x, y), 0)[0] > ${G}.0) combed += 1.0;
    }
  }
  bool clean = combed <= ${Se} * float(blocks.x * blocks.y);
  score = clean ? min(score + 1.0, ${Me}.0) : max(score - ${_e}.0, 0.0);
  bool on = last[3] > 0.5 ? score >= ${De}.0 : score >= ${Re}.0;
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
`, Oe = {
  prev: "uPrev",
  cur: "uCur",
  first: "uFirst",
  size: "uSize"
}, Ge = `#version 300 es
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
  ivec2 base = block * ${w};
  float standing = 0.0;
  float woven = 0.0;
  for (int dy = 0; dy < ${w}; ++dy) {
    int y = base.y + dy;
    if (y >= uSize.y || (y & 1) == uFirst) continue;
    for (int dx = 0; dx < ${w}; ++dx) {
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
`, Xe = {
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
}, ze = `#version 300 es
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
/** Whether it may come from the frame's own other field where frames are one instant. */
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
  return texelFetch(uFieldMetrics, ivec2(metric, 0), 0)[1] <= ${fe}.0;
}

/** The pulldown phase the detection gave this frame, or 0. See film-shader.ts. */
int detectedPhase() {
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${p.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${Z}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${X} || phase == ${Ce};
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
 * A cut made after pulldown restarts the film cycle, and the phase is unknown
 * until two cycles have passed. Each field still has a partner from the same
 * film frame, and the partner can be found without knowing the phase. It is
 * the other field of this frame, or the adjoining field of a neighbouring
 * frame: the second field of the previous frame for a first field, the first
 * field of the next frame for a second field. The block is woven from
 * whichever candidate leaves it less combed. If neither leaves it clean, the
 * block is left to the filter, as in the film branch.
 *
 * Video has no partner, but a block that barely moves can look as if it had
 * one. So the neighbouring frames are used only shortly after film
 * (neighbours). Where the frames are found to hold one instant each, the
 * partner is always the frame's own other field. Both fields of a frame then
 * come out as the same picture, except in blocks that are combed as the frame
 * stands, which are filtered.
 */
bool matched(int x, int y, bool neighbours, out vec3 rgb) {
  ivec2 block = ivec2(x / ${w}, y / ${w});
  float standing = texelFetch(uComb, block, 0)[0];
  if (!neighbours) {
    if (standing > ${G}.0) return false;
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
    return true;
  }
  float adjoining = uSecond ? texelFetch(uCombAhead, block, 0)[1]
                            : texelFetch(uComb, block, 0)[1];
  if (min(standing, adjoining) > ${G}.0) return false;
  if (standing <= adjoining) {
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
  } else if (uSecond) {
    rgb = texelFetch(uNext, ivec2(x, y), 0).rgb;
  } else {
    rgb = texelFetch(uPrev, ivec2(x, y), 0).rgb;
  }
  return true;
}

/** Whether the detection found the two fields of each frame to be one instant. */
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
    vec4 comb = texelFetch(uComb, ivec2(x / ${w}, y / ${w}), 0);
    bool combedBlock = (mixed ? comb[1] : comb[0]) > ${G}.0;
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
`, F = { phase: 0, run: 0 };
function k(n, e, t) {
  return Object.fromEntries(
    Object.entries(t).map(([i, s]) => [
      i,
      n.getUniformLocation(e, s)
    ])
  );
}
class q {
  #t;
  #i;
  #e;
  #u;
  #p;
  #R;
  #s;
  #n;
  #A;
  /** The block comparisons of both fields, and the same folded most of the way. */
  #o = null;
  #f = null;
  /** Combed pixels per block of the frame being filtered, both ways of weaving it. */
  #d = null;
  /** Combed pixels per block of the frame after the one being filtered. */
  #M = null;
  /** The field metrics (see FIELD_METRICS) of this frame and the one before. */
  #h = null;
  /** Which of the two holds the newest metrics. */
  #a = 0;
  /** The metrics being read back asynchronously. */
  #c = null;
  #l = null;
  #r = 0;
  #x = 0;
  /** The last metrics read back, laid out as FIELD_METRICS says. */
  metrics = new Float32Array(R * 4);
  #E = 0;
  #v = 0;
  constructor(e) {
    this.#t = e, this.#i = y(
      e,
      Ne,
      S
    ), this.#e = k(
      e,
      this.#i,
      Ie
    ), this.#u = y(
      e,
      Le,
      S
    ), this.#p = k(
      e,
      this.#u,
      Be
    ), this.#R = y(
      e,
      Ue,
      S
    ), this.#s = k(e, this.#R, ke), this.#n = y(e, Ge, S), this.#A = k(e, this.#n, Oe);
  }
  /** The newest measurements, or null before any frame has been measured. */
  get texture() {
    return this.#h?.[this.#a]?.textures[0] ?? null;
  }
  /**
   * Combed pixels per block of the frame last measured by `measureComb`, or
   * null before one has been. See COMB_FRAGMENT_SHADER.
   */
  get combTexture() {
    return this.#d?.textures[0] ?? null;
  }
  /**
   * Combed pixels per block of the frame last measured with `ahead`, or null
   * before one has been.
   */
  get combAheadTexture() {
    return this.#M?.textures[0] ?? null;
  }
  /** The size of the frames to be measured, which sizes the block grid. */
  resize(e, t) {
    e === this.#E && t === this.#v || (this.#E = e, this.#v = t, this.#D());
  }
  /**
   * Forget the measurements: the next frame starts a cycle from nothing.
   * `keepInstant` keeps the one-instant score, for a gap in the frames when
   * the content has not changed.
   */
  reset(e = !1) {
    const t = this.#t;
    t.deleteSync(this.#l), this.#l = null, this.#r = 0;
    const i = this.#h?.[this.#a];
    if (!i) return;
    const s = e ? p.instant : R, r = new Float32Array(s * 4);
    for (let h = 0; h < p.phase; h++)
      r[h * 4 + 1] = 1;
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
   * The same pass scores whether the two fields of a frame are one instant,
   * from the comb counts of the frame as it stands. `measureComb` for this
   * frame must have run before this.
   */
  detect(e, t, i) {
    const s = this.#t;
    if (this.#E === 0 || this.#v === 0) return;
    this.#_();
    const r = this.#o, h = this.#f, o = this.#h;
    if (r === null || h === null || o === null) return;
    const a = o[this.#a], u = o[1 - this.#a];
    if (s.bindFramebuffer(s.FRAMEBUFFER, r.framebuffer), s.useProgram(this.#i), this.#S(0, e, this.#e.a), this.#S(1, t, this.#e.b), this.#S(2, a.textures[0], this.#e.fieldMetrics), s.uniform1i(this.#e.first, i), s.uniform2i(this.#e.size, this.#E, this.#v), s.viewport(0, 0, r.width, r.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, h.framebuffer), s.useProgram(this.#u), this.#S(0, r.textures[0], this.#p.second), this.#S(1, r.textures[1], this.#p.first), s.uniform2i(this.#p.size, r.width, r.height), s.viewport(0, 0, h.width, h.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, u.framebuffer), s.useProgram(this.#R), this.#S(0, a.textures[0], this.#s.previous), this.#S(1, h.textures[0], this.#s.second), this.#S(2, h.textures[1], this.#s.first), this.#S(3, this.#d?.textures[0], this.#s.comb), s.uniform2i(this.#s.size, h.width, h.height), s.viewport(0, 0, R, 1), s.drawArrays(s.TRIANGLES, 0, 3), this.#a = 1 - this.#a, this.#r++, this.#l !== null) {
      s.bindFramebuffer(s.FRAMEBUFFER, null);
      return;
    }
    this.#x = this.#r, s.bindBuffer(s.PIXEL_PACK_BUFFER, this.#c), s.readPixels(0, 0, R, 1, s.RGBA, s.FLOAT, 0), s.bindBuffer(s.PIXEL_PACK_BUFFER, null), s.bindFramebuffer(s.FRAMEBUFFER, null), this.#l = s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE, 0), s.flush();
  }
  /**
   * Count the combing each way of weaving `cur`, the frame being filtered,
   * would leave: as it stands, and with `prev`'s second field. `first` is the
   * parity of the field that was captured first. With `ahead`, `prev` is the
   * frame being filtered and `cur` is the one after it, and the counts are
   * those of `cur`.
   */
  measureComb(e, t, i, s = !1) {
    const r = this.#t;
    if (this.#E === 0 || this.#v === 0) return;
    this.#_();
    const h = s ? this.#M : this.#d;
    h !== null && (r.bindFramebuffer(r.FRAMEBUFFER, h.framebuffer), r.useProgram(this.#n), this.#S(0, e, this.#A.prev), this.#S(1, t, this.#A.cur), r.uniform1i(this.#A.first, i), r.uniform2i(this.#A.size, this.#E, this.#v), r.viewport(0, 0, h.width, h.height), r.drawArrays(r.TRIANGLES, 0, 3), r.bindFramebuffer(r.FRAMEBUFFER, null));
  }
  /**
   * The phase of the last frame measured, once the GPU has handed it back,
   * and null while it is still on its way. It is handed back once.
   * `instant` is the one-instant verdict as of that frame. The filter reads
   * the same verdict from `texture` without waiting for the readback.
   */
  poll() {
    const e = this.#t, t = this.#l;
    if (t === null || this.#c === null) return null;
    switch (e.clientWaitSync(t, 0, 0)) {
      case e.ALREADY_SIGNALED:
      case e.CONDITION_SATISFIED:
        return e.bindBuffer(e.PIXEL_PACK_BUFFER, this.#c), e.getBufferSubData(e.PIXEL_PACK_BUFFER, 0, this.metrics), e.bindBuffer(e.PIXEL_PACK_BUFFER, null), e.deleteSync(t), this.#l = null, {
          phase: this.metrics[p.phase * 4] ?? 0,
          run: this.metrics[p.phase * 4 + 1] ?? 0,
          instant: (this.metrics[p.instant * 4 + 3] ?? 0) > 0.5,
          age: this.#r - this.#x
        };
      default:
        return null;
    }
  }
  destroy() {
    const e = this.#t;
    if (this.#D(), this.#h !== null) {
      for (const t of this.#h) M(e, t);
      this.#h = null;
    }
    e.deleteSync(this.#l), this.#l = null, e.deleteBuffer(this.#c), this.#c = null, e.deleteProgram(this.#i), e.deleteProgram(this.#u), e.deleteProgram(this.#R), e.deleteProgram(this.#n);
  }
  #S(e, t, i) {
    const s = this.#t;
    s.activeTexture(s.TEXTURE0 + e), s.bindTexture(s.TEXTURE_2D, t ?? null), s.uniform1i(i, e);
  }
  #D() {
    const e = this.#t;
    this.#o !== null && M(e, this.#o), this.#f !== null && M(e, this.#f), this.#d !== null && M(e, this.#d), this.#M !== null && M(e, this.#M), this.#o = null, this.#f = null, this.#d = null, this.#M = null;
  }
  /** Everything detect needs that is not there yet. */
  #_() {
    const e = this.#t;
    if (this.#o === null || this.#f === null || this.#d === null || this.#M === null) {
      this.#D();
      const t = Math.ceil(this.#E / de), i = Math.ceil(this.#v / (me * 2));
      this.#o = D(e, t, i, 2), this.#f = D(
        e,
        Math.ceil(t / B),
        Math.ceil(i / B),
        2
      ), this.#d = D(
        e,
        Math.ceil(this.#E / w),
        Math.ceil(this.#v / w),
        1
      ), this.#M = D(
        e,
        Math.ceil(this.#E / w),
        Math.ceil(this.#v / w),
        1
      );
    }
    this.#h === null && (this.#h = [
      D(e, R, 1, 1),
      D(e, R, 1, 1)
    ], this.#a = 0, this.reset()), this.#c === null && (this.#c = e.createBuffer(), e.bindBuffer(e.PIXEL_PACK_BUFFER, this.#c), e.bufferData(
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
    const u = n.createTexture();
    n.bindTexture(n.TEXTURE_2D, u), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MIN_FILTER, n.NEAREST), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MAG_FILTER, n.NEAREST), n.texImage2D(
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
      u,
      0
    ), r.push(u);
  }
  n.drawBuffers(r.map((a, u) => n.COLOR_ATTACHMENT0 + u));
  const h = n.checkFramebufferStatus(n.FRAMEBUFFER) === n.FRAMEBUFFER_COMPLETE;
  n.bindFramebuffer(n.FRAMEBUFFER, null);
  const o = { framebuffer: s, textures: r, width: e, height: t };
  if (!h)
    throw M(n, o), new Error("failed to allocate framebuffer");
  return o;
}
function M(n, { framebuffer: e, textures: t }) {
  n.deleteFramebuffer(e);
  for (const i of t) n.deleteTexture(i);
}
function K(n) {
  return Number.isInteger(n) && n > 0;
}
function We(n) {
  const {
    timestamp: e,
    duration: t,
    width: i,
    height: s,
    displayWidth: r,
    displayHeight: h,
    data: o,
    planes: a,
    matrix: u
  } = n;
  if (!Number.isFinite(e) || !(t > 0) || !Number.isFinite(t))
    throw new TypeError(`invalid picture timing ${e}+${t}`);
  if (!K(i) || !K(s))
    throw new TypeError(`invalid picture size ${i}x${s}`);
  if (!(r > 0) || !(h > 0))
    throw new TypeError(
      `invalid display size ${r}x${h}`
    );
  if (u !== "bt709" && u !== "bt601")
    throw new TypeError(`unknown matrix ${String(u)}`);
  if (a.length !== 3) throw new TypeError("a picture has three planes");
  for (let A = 0; A < 3; A++) {
    const f = A === 0 ? i : Math.ceil(i / 2), d = A === 0 ? s : Math.ceil(s / 2), { offset: l, stride: c } = a[A];
    if (!Number.isInteger(l) || l < 0 || !Number.isInteger(c) || c < f || l + c * (d - 1) + f > o.byteLength)
      throw new TypeError(
        `plane ${A} at ${l} with stride ${c} does not fit ${f}x${d} samples in ${o.byteLength} bytes`
      );
  }
}
function J(n, e) {
  const t = 1 - n - e;
  return Float32Array.of(
    2 * (1 - n),
    2 * (1 - e) * e / t,
    2 * (1 - n) * n / t,
    2 * (1 - e)
  );
}
const He = {
  bt709: J(0.2126, 0.0722),
  bt601: J(0.299, 0.114)
}, $e = `#version 300 es
precision highp float;
precision highp int;

uniform highp sampler2D uLuma;
uniform highp sampler2D uCb;
uniform highp sampler2D uCr;
/** Whether chroma rows belong alternately to the two fields. */
uniform bool uInterlaced;
uniform vec4 uMatrix;

out vec4 fragColor;

/** Position of luma column x in chroma columns. */
float chromaColumn(int x) {
  return float(x) * 0.5;
}

/** Position of luma row y in chroma rows, progressive. */
float chromaRow(int y) {
  return float(y) * 0.5 - 0.25;
}

/** Position of luma row y among the chroma rows of its own field. */
float chromaFieldRow(int y) {
  return (float(y >> 1) - 0.25 - 0.5 * float(y & 1)) * 0.5;
}

vec2 tap(int x, int y) {
  return vec2(texelFetch(uCb, ivec2(x, y), 0).r, texelFetch(uCr, ivec2(x, y), 0).r);
}

vec2 chroma(int x, int y, int width, int height) {
  float u = clamp(chromaColumn(x), 0.0, float(width - 1));
  int x0 = int(u);
  int x1 = min(x0 + 1, width - 1);
  float wx = u - float(x0);
  int y0;
  int y1;
  float wy;
  if (uInterlaced) {
    int parity = y & 1;
    int rows = (height + 1 - parity) >> 1;
    float v = clamp(chromaFieldRow(y), 0.0, float(rows - 1));
    int row = int(v);
    y0 = 2 * row + parity;
    y1 = 2 * min(row + 1, rows - 1) + parity;
    wy = v - float(row);
  } else {
    float v = clamp(chromaRow(y), 0.0, float(height - 1));
    y0 = int(v);
    y1 = min(y0 + 1, height - 1);
    wy = v - float(y0);
  }
  return mix(mix(tap(x0, y0), tap(x1, y0), wx), mix(tap(x0, y1), tap(x1, y1), wx), wy);
}

/** Limited-range YCbCr, as texture values, to full-range RGB. */
vec3 rgb(float luma, vec2 c) {
  float l = (luma * 255.0 - 16.0) / 219.0;
  float b = (c.x * 255.0 - 128.0) / 224.0;
  float r = (c.y * 255.0 - 128.0) / 224.0;
  return clamp(vec3(l + uMatrix.x * r, l - uMatrix.y * b - uMatrix.z * r, l + uMatrix.w * b), 0.0, 1.0);
}

void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(uCb, 0);
  fragColor = vec4(rgb(texelFetch(uLuma, at, 0).r, chroma(at.x, at.y, size.x, size.y)), 1.0);
}
`;
class Ve {
  #t;
  #i;
  #e;
  #u;
  #p;
  #R;
  #s;
  #n;
  #A = [];
  #o = 0;
  #f = 0;
  /** Whether the target format was found renderable since the last resize. */
  #d = !1;
  constructor(e) {
    this.#t = e, this.#i = y(e, $e, S), this.#e = e.getUniformLocation(this.#i, "uLuma"), this.#u = e.getUniformLocation(this.#i, "uCb"), this.#p = e.getUniformLocation(this.#i, "uCr"), this.#R = e.getUniformLocation(this.#i, "uInterlaced"), this.#s = e.getUniformLocation(this.#i, "uMatrix"), this.#n = e.createFramebuffer();
  }
  /** Allocate the plane textures for pictures of this luma size. */
  resize(e, t) {
    const i = this.#t;
    for (const s of this.#A) i.deleteTexture(s);
    this.#A = [];
    for (let s = 0; s < 3; s++) {
      const r = i.createTexture();
      i.bindTexture(i.TEXTURE_2D, r), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_MIN_FILTER, i.NEAREST), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_MAG_FILTER, i.NEAREST), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_WRAP_S, i.CLAMP_TO_EDGE), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_WRAP_T, i.CLAMP_TO_EDGE), i.texStorage2D(
        i.TEXTURE_2D,
        1,
        i.R8,
        s === 0 ? e : Math.ceil(e / 2),
        s === 0 ? t : Math.ceil(t / 2)
      ), this.#A.push(r);
    }
    this.#o = e, this.#f = t, this.#d = !1;
  }
  /**
   * Upload the picture's planes and draw its RGB into `target`, a texture of
   * the size last given to resize(). Throws if `target` cannot be drawn into.
   */
  convert(e, t) {
    const i = this.#t, s = new Uint8Array(e.data);
    i.pixelStorei(i.UNPACK_ALIGNMENT, 1);
    for (let r = 0; r < 3; r++) {
      const { offset: h, stride: o } = e.planes[r];
      i.bindTexture(i.TEXTURE_2D, this.#A[r]), i.pixelStorei(i.UNPACK_ROW_LENGTH, o), i.texSubImage2D(
        i.TEXTURE_2D,
        0,
        0,
        0,
        r === 0 ? this.#o : Math.ceil(this.#o / 2),
        r === 0 ? this.#f : Math.ceil(this.#f / 2),
        i.RED,
        i.UNSIGNED_BYTE,
        s,
        h
      );
    }
    if (i.pixelStorei(i.UNPACK_ROW_LENGTH, 0), i.pixelStorei(i.UNPACK_ALIGNMENT, 4), i.bindFramebuffer(i.FRAMEBUFFER, this.#n), i.framebufferTexture2D(
      i.FRAMEBUFFER,
      i.COLOR_ATTACHMENT0,
      i.TEXTURE_2D,
      t,
      0
    ), !this.#d) {
      if (i.checkFramebufferStatus(i.FRAMEBUFFER) !== i.FRAMEBUFFER_COMPLETE)
        throw i.bindFramebuffer(i.FRAMEBUFFER, null), new Error("decoded pictures cannot be drawn into RGBA8");
      this.#d = !0;
    }
    i.useProgram(this.#i);
    for (let r = 0; r < 3; r++)
      i.activeTexture(i.TEXTURE0 + r), i.bindTexture(i.TEXTURE_2D, this.#A[r]);
    i.uniform1i(this.#e, 0), i.uniform1i(this.#u, 1), i.uniform1i(this.#p, 2), i.uniform1i(this.#R, e.interlaced ? 1 : 0), i.uniform4fv(this.#s, He[e.matrix]), i.viewport(0, 0, this.#o, this.#f), i.drawArrays(i.TRIANGLES, 0, 3), i.activeTexture(i.TEXTURE0), i.bindFramebuffer(i.FRAMEBUFFER, null);
  }
  destroy() {
    const e = this.#t;
    for (const t of this.#A) e.deleteTexture(t);
    this.#A = [], e.deleteFramebuffer(this.#n), e.deleteProgram(this.#i);
  }
}
const ee = 250, g = 4, Ye = 0.01, Qe = 100, Ze = 250, je = 0.5, C = 2;
class qe {
  /**
   * The position is #media + #rate * (wall - #wall) / 1000 seconds. It is
   * NaN between a hold and the reading after it, when it is not known.
   */
  #t = 0;
  #i = Number.NaN;
  /** The playback rate while running, 0 while held. */
  #e = 0;
  #u = 1;
  /** Whether the clock waits for the readings to show playing before it runs. */
  #p = !0;
  /** The last reading, and the wall time at which it was first seen. */
  #R = Number.NaN;
  #s = 0;
  /** While waiting: whether the last reading was a change, not where the clock was held. */
  #n = !1;
  /** Wall time between the last reading that changed and the reading before it. */
  #A = 0;
  /** Wall time of the last reading taken, changed or not. */
  #o = 0;
  #f = Number.NaN;
  /** Wall time of the last correction. */
  #d = 0;
  /** The highest error of a reading, in media seconds, per bucket; the last is the newest. */
  #M = new Float64Array(g);
  #h = 0;
  /** Whether the next reading holds the clock, as hold() asks. */
  #a = !0;
  /**
   * The longest the reading was seen unchanged before a change that moved it
   * as playing does, in media seconds, per BUCKET_MS of running; the last is
   * the newest. NaN for a bucket the clock has not run through.
   */
  #c = new Float64Array(g).fill(Number.NaN);
  /** Running time, in wall milliseconds, counted into the newest bucket of #stands. */
  #l = 0;
  /**
   * While running on a start that is still to be confirmed, which is any
   * start where the reading steps: the wall time by which the reading has to
   * change again for the start to hold. 0 otherwise.
   */
  #r = 0;
  /**
   * Whether a start still to be confirmed was taken back, so that the clock
   * does not run on a first change again before a start has held.
   */
  #x = !1;
  /** While waiting: whether the last change came at playing pace. */
  #E = !1;
  /** While waiting after a stop on a standstill, until the reading changes. */
  #v = !1;
  /** The position at `wall`, in media seconds, or NaN while not known. */
  at(e) {
    return this.#i + this.#e * (e - this.#t) / 1e3;
  }
  /** The rate the clock advances at: the playback rate, or 0 while held. */
  get rate() {
    return this.#e;
  }
  /**
   * Where the clock was last put by a reading instead of running there: at a
   * hold, or on a reading too far from it. Playback has been continuous from
   * here, so nothing that ended at or before it has been due since. NaN
   * before the first reading.
   */
  get origin() {
    return this.#f;
  }
  /**
   * Stop at the next reading and wait for the readings to show playing: a
   * seek, a pause or a stall the element has reported. Readings taken across
   * the event say nothing about the position after it.
   */
  hold() {
    this.#a = !0, this.#i = Number.NaN, this.#e = 0;
  }
  /**
   * Take a reading of `currentTime` made at `wall`. `playing` is whether the
   * element is playing at all: not paused, seeking or ended. Returns whether
   * the clock started running again from this reading.
   */
  observe(e, t, i, s) {
    const r = e - this.#o;
    if (this.#o = e, !s || this.#a || i !== this.#u)
      return this.#a = !1, this.#u = i, this.#te(e, t), !1;
    const h = this.#r !== 0;
    if (!this.#p && !h && this.#S(r), t === this.#R) {
      if (this.#p) return !1;
      if (h)
        return e > this.#r && (this.#x = !0, this.#_(e, t, !0)), !1;
      const v = this.#B(i), P = Number.isNaN(v) ? Ze : v + r + C;
      return e - this.#s > P && this.#_(e, t, !Number.isNaN(v)), !1;
    }
    const o = (t - this.#R) * 1e3 / i, a = e - this.#s, u = a - r, A = this.#A;
    this.#R = t, this.#s = e, this.#A = r;
    const f = o <= a + A + C, d = o >= a * je && f;
    if (this.#p) {
      const v = !this.#n;
      this.#n = !0, this.#v && !v && d && this.#q(u, i), this.#v = !1;
      const P = this.#T(i, r);
      if (!v && d) {
        if (P || this.#E)
          return this.#x = !1, this.#D(
            e,
            t,
            i,
            r,
            P
          ), !0;
        this.#E = !0;
      } else if (this.#E = !1, v && !this.#x && P && o > 0 && f)
        return this.#D(
          e,
          t,
          i,
          r,
          !0
        ), !0;
      return this.#t = e, this.#i = t, !1;
    }
    if (h) {
      if (!d)
        return this.#x = !0, this.#te(e, t), !1;
      this.#r = 0, this.#x = !1;
    } else d && this.#q(u, i);
    const l = t - this.at(e);
    if (Math.abs(l) > Qe / 1e3 * i)
      return this.#f = t, this.#ie(e, t), !0;
    const c = this.#M;
    e - this.#h >= ee ? (c.copyWithin(0, 1), c[g - 1] = l, this.#h = e) : c[g - 1] = Math.max(c[g - 1], l);
    let m = c[0];
    for (let v = 1; v < g; v++)
      m = Math.max(m, c[v]);
    const E = Ye * i * (e - this.#d) / 1e3, b = Math.max(-E, Math.min(E, m));
    this.#d = e, this.#i += b;
    for (let v = 0; v < g; v++)
      c[v] = c[v] - b;
    return !1;
  }
  /**
   * Count running time towards the window of #stands. The window advances
   * only while the clock runs, so holds and seeks in quick succession keep
   * what the playing before them showed.
   */
  #S(e) {
    this.#l += e, !(this.#l < ee) && (this.#c.copyWithin(0, 1), this.#c[g - 1] = 0, this.#l = 0);
  }
  /**
   * Run from a reading that has just changed. Where the reading steps, the
   * start holds only if the next change comes within the longest stand seen
   * and one reading more.
   */
  #D(e, t, i, s, r) {
    this.#ie(e, t), r && (this.#r = e + this.#B(i) + s + C);
  }
  /**
   * Stop a running clock on a reading that has stood too long, keeping when
   * the reading was first seen where its updates are known: the change that
   * ends the standstill is then judged over the whole time the reading
   * stood. An update that was merely late moves as far as that time; where
   * the reading steps it starts the clock again at once, and where it follows
   * the element the next change at playing pace does. A standstill of the
   * element moves less, and the clock waits.
   */
  #_(e, t, i) {
    const s = this.#s;
    this.#te(e, t), i && (this.#s = s, this.#n = !0, this.#v = !0);
  }
  /** Note that the reading stood `stood` wall milliseconds between two updates. */
  #q(e, t) {
    const i = this.#c[g - 1], s = e * t / 1e3;
    this.#c[g - 1] = Number.isNaN(i) ? s : Math.max(i, s);
  }
  /**
   * Whether the element updates its reading in steps: in each whole bucket
   * of the last second of running the reading stood, between two updates,
   * for longer than readings taken close together and at least as long as
   * the time between readings. One reading that happened to repeat does not
   * make it so.
   */
  #T(e, t) {
    let i = Number.POSITIVE_INFINITY;
    for (let r = 0; r < g - 1; r++) {
      const h = this.#c[r];
      if (Number.isNaN(h)) return !1;
      i = Math.min(i, h);
    }
    const s = i * 1e3 / e;
    return s > C && s + C >= t;
  }
  /**
   * The longest the reading was seen to stand between updates over the last
   * second of running, in wall milliseconds at `playbackRate`. NaN until the
   * clock has run through a whole bucket: the newest one is still filling.
   */
  #B(e) {
    let t = Number.NaN;
    for (let s = 0; s < g - 1; s++) {
      const r = this.#c[s];
      Number.isNaN(r) || (t = Number.isNaN(t) ? r : Math.max(t, r));
    }
    if (Number.isNaN(t)) return t;
    const i = this.#c[g - 1];
    return Number.isNaN(i) || (t = Math.max(t, i)), t * 1e3 / e;
  }
  #te(e, t) {
    this.#v = !1, this.#E = !1, this.#r = 0, this.#t = e, this.#i = t, this.#e = 0, this.#p = !0, this.#n = !1, this.#R = t, this.#s = e, this.#f = t;
  }
  #ie(e, t) {
    this.#r = 0, this.#t = e, this.#i = t, this.#e = this.#u, this.#p = !1, this.#d = e, this.#h = e, this.#M.fill(Number.NEGATIVE_INFINITY), this.#M[g - 1] = 0;
  }
}
const L = 16, Ke = 6, Je = `#version 300 es
precision highp float;
uniform sampler2D uTake;
uniform sampler2D uReference;
out vec4 fragColor;

void main() {
  // The caller compares sizes taken from the element. Those can briefly differ
  // from the uploaded picture when the stream changes resolution, so compare
  // the texture sizes here too. Different sizes count as changed.
  if (textureSize(uTake, 0) != textureSize(uReference, 0)) {
    fragColor = vec4(1.0);
    return;
  }
  // Each cell samples every texel it covers, so a change anywhere in the picture is detected.
  // Edge cells clamp and re-read their last row or column.
  ivec2 last = textureSize(uTake, 0) - 1;
  ivec2 origin = ivec2(gl_FragCoord.xy) * ${L};
  vec3 difference = vec3(0.0);
  for (int y = 0; y < ${L}; y++) {
    for (int x = 0; x < ${L}; x++) {
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
class et {
  #t;
  #i;
  #e = null;
  #u = null;
  /** Textures available for the next take. */
  #p = [];
  #R = 0;
  /** Readback buffers available for the next comparison. */
  #s = [];
  #n = new Uint8Array(0);
  /** Takes still held, oldest first. */
  #A = [];
  /** The newest take. The next take is compared with it. */
  #o = null;
  #f = 0;
  constructor(e, t) {
    this.#t = e, this.#i = t;
  }
  take() {
    const e = this.#t, t = this.#p.pop() ?? this.#a();
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
    } catch (o) {
      throw this.#p.push(t), o;
    }
    const r = {
      id: ++this.#f,
      texture: t,
      width: i,
      height: s,
      changed: null,
      fence: null,
      buffer: null,
      reported: !1
    }, h = this.#o;
    return h === null || h.width !== i || h.height !== s ? r.changed = !0 : this.#d(r, h), this.#o = r, this.#A.push(r), r.id;
  }
  settle() {
    const e = this.#t, t = this.#A.find((i) => !i.reported);
    if (t === void 0 || t === this.#o) return null;
    if (t.changed === null) {
      const { fence: i, buffer: s } = t;
      if (i === null || s === null) return null;
      const r = e.clientWaitSync(i, 0, 0);
      if (r !== e.ALREADY_SIGNALED && r !== e.CONDITION_SATISFIED)
        return null;
      this.#n.byteLength < s.bytes && (this.#n = new Uint8Array(s.bytes));
      const h = this.#n.subarray(0, s.bytes);
      e.bindBuffer(e.PIXEL_PACK_BUFFER, s.buffer), e.getBufferSubData(e.PIXEL_PACK_BUFFER, 0, h), e.bindBuffer(e.PIXEL_PACK_BUFFER, null), t.changed = tt(h), this.#M(t);
    }
    return t.reported = !0, { id: t.id, changed: t.changed };
  }
  /**
   * Give the texture of a reported take to the caller and accept a texture in
   * exchange. The replacement becomes available for later takes.
   */
  adopt(e, t) {
    const i = this.#A.findIndex((r) => r.id === e), s = this.#A[i];
    if (s === void 0 || !s.reported)
      throw new Error(`picture ${e} is not available to adopt`);
    return this.#A.splice(i, 1), this.#p.push(t), s.texture;
  }
  release(e) {
    const t = this.#A.findIndex((s) => s.id === e), i = this.#A[t];
    i !== void 0 && (this.#A.splice(t, 1), this.#h(i));
  }
  reset() {
    const e = this.#A;
    this.#A = [], this.#o = null;
    for (const t of e)
      this.#M(t), this.#h(t);
  }
  destroy() {
    const e = this.#t;
    this.reset();
    for (const t of this.#p) e.deleteTexture(t);
    this.#p = [], this.#R = 0;
    for (const { buffer: t } of this.#s) e.deleteBuffer(t);
    this.#s = [], this.#r(), this.#e !== null && e.deleteProgram(this.#e), this.#e = null;
  }
  /** Compare a take with the reference on the GPU and start reading back the result. */
  #d(e, t) {
    const i = this.#t, s = Math.ceil(e.width / L), r = Math.ceil(e.height / L), h = this.#l(s, r), o = this.#x(s * r * 4);
    this.#e ??= this.#c(), i.bindFramebuffer(i.FRAMEBUFFER, h.framebuffer), i.useProgram(this.#e), i.activeTexture(i.TEXTURE1), i.bindTexture(i.TEXTURE_2D, t.texture), i.activeTexture(i.TEXTURE0), i.bindTexture(i.TEXTURE_2D, e.texture), i.viewport(0, 0, s, r), i.drawArrays(i.TRIANGLES, 0, 3), i.bindBuffer(i.PIXEL_PACK_BUFFER, o.buffer), i.readPixels(0, 0, s, r, i.RGBA, i.UNSIGNED_BYTE, 0), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), i.bindFramebuffer(i.FRAMEBUFFER, null), e.fence = i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE, 0), e.buffer = o, i.flush();
  }
  /** Release the fence and readback buffer of a comparison, whether or not it was read. */
  #M(e) {
    const t = this.#t;
    e.fence !== null && t.deleteSync(e.fence), e.fence = null;
    const i = e.buffer;
    if (e.buffer = null, i === null) return;
    const s = this.#u;
    s !== null && i.bytes === s.width * s.height * 4 ? this.#s.push(i) : t.deleteBuffer(i.buffer);
  }
  /**
   * Return the texture of a removed take to the pool. This is safe because a
   * later take has replaced it as the reference and the comparison that read
   * it has been issued.
   */
  #h(e) {
    this.#p.push(e.texture);
  }
  #a() {
    if (this.#R === Ke) return null;
    const e = this.#t, t = e.createTexture();
    return e.bindTexture(e.TEXTURE_2D, t), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), this.#R++, t;
  }
  #c() {
    const e = this.#t, t = y(e, Je, S);
    return e.useProgram(t), e.uniform1i(e.getUniformLocation(t, "uTake"), 0), e.uniform1i(e.getUniformLocation(t, "uReference"), 1), t;
  }
  #l(e, t) {
    const i = this.#t, s = this.#u;
    if (s?.width === e && s.height === t) return s;
    this.#r();
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
    const h = i.createFramebuffer();
    i.bindFramebuffer(i.FRAMEBUFFER, h), i.framebufferTexture2D(
      i.FRAMEBUFFER,
      i.COLOR_ATTACHMENT0,
      i.TEXTURE_2D,
      r,
      0
    ), i.bindFramebuffer(i.FRAMEBUFFER, null);
    const o = { framebuffer: h, texture: r, width: e, height: t };
    return this.#u = o, o;
  }
  #r() {
    const e = this.#t;
    this.#u !== null && (e.deleteFramebuffer(this.#u.framebuffer), e.deleteTexture(this.#u.texture), this.#u = null);
  }
  #x(e) {
    const t = this.#s.pop();
    if (t !== void 0) return t;
    const i = this.#t, s = i.createBuffer();
    return i.bindBuffer(i.PIXEL_PACK_BUFFER, s), i.bufferData(i.PIXEL_PACK_BUFFER, e, i.STREAM_COPY), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), { buffer: s, bytes: e };
  }
}
function tt(n) {
  for (let e = 0; e < n.length; e += 4)
    if (n[e] !== 0 || n[e + 1] !== 0 || n[e + 2] !== 0)
      return !0;
  return !1;
}
const pe = [
  "mozParsedFrames",
  "mozDecodedFrames",
  "mozPresentedFrames",
  "mozPaintedFrames"
];
function Ee(n) {
  return pe.every((e) => e in n);
}
function it(n) {
  return n.ownerDocument?.defaultView?.performance.timeOrigin ?? performance.timeOrigin;
}
function st() {
  return typeof HTMLVideoElement < "u" && (Ee(HTMLVideoElement.prototype) || typeof HTMLVideoElement.prototype.requestVideoFrameCallback == "function");
}
const rt = 250, H = 500, nt = 1.75, ht = 3, ot = 200;
class at {
  #t;
  #i;
  #e;
  /** The watch that owns the takes in #taken. */
  #u = null;
  /** Takes whose results are pending, oldest first. */
  #p = [];
  /** Frame count on the picture-watching path, reported as `presentedFrames`. */
  #R = 0;
  #s = null;
  /** Consecutive unchanged results for takes made at rest. */
  #n = 0;
  /** When the last delivered take was made, and the painted count when it was delivered. */
  #A = null;
  #o = null;
  #f = null;
  #d = null;
  #M = null;
  #h = null;
  #a = !0;
  #c = null;
  #l = null;
  #r = 0;
  #x;
  #E;
  #v = null;
  #S = null;
  #D = null;
  #_ = null;
  #q = 0;
  #T = [];
  #B = [];
  constructor(e, t) {
    if (this.#t = e, this.#e = t, this.#i = Ee(e) ? e : null, this.#x = this.#i === null && typeof VideoFrame < "u", this.#E = this.#x && e.playbackRate > 1, this.#i) {
      for (const i of ["emptied", "seeking", "seeked"])
        e.addEventListener(i, this.#Z);
      for (const i of ["pause", "playing", "waiting", "ratechange"])
        e.addEventListener(i, this.#O);
    }
    if (this.#x)
      for (const i of [
        "loadeddata",
        "playing",
        "pause",
        "ended",
        "seeking",
        "seeked",
        "emptied",
        "ratechange"
      ])
        e.addEventListener(i, this.#ie);
  }
  /** Whether acquisition uses the captured pictures' own timestamps. */
  get captureDriven() {
    return this.#E;
  }
  request(e) {
    if (this.#d === null) {
      if (this.#d = e, this.#E) {
        this.#Q();
        return;
      }
      this.#f = this.#i ? requestAnimationFrame(this.#k) : this.#t.requestVideoFrameCallback(this.#Ae);
    }
  }
  cancel() {
    this.#f !== null && (this.#i ? cancelAnimationFrame(this.#f) : this.#t.cancelVideoFrameCallback(this.#f)), this.#f = null, this.#d = null, this.#v?.(), this.#v = null, this.#D !== null && this.#t.cancelVideoFrameCallback(this.#D), this.#D = null, this.#te(), this.#_ = null, this.#T = [], this.#E = this.#x && this.#t.playbackRate > 1, this.#Z();
  }
  destroy() {
    this.cancel();
    for (const e of ["emptied", "seeking", "seeked"])
      this.#t.removeEventListener(e, this.#Z);
    for (const e of ["pause", "playing", "waiting", "ratechange"])
      this.#t.removeEventListener(e, this.#O);
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
      this.#t.removeEventListener(e, this.#ie);
  }
  /** Deliver pending input on the rendering window's refresh, before drawing. */
  flush(e) {
    if (this.#E)
      for (this.#t.ownerDocument !== this.#S && (this.#v?.(), this.#v = null, this.#Q()); this.#B.length > 0 && this.#d !== null; ) {
        const t = this.#B.shift(), i = t.frame;
        try {
          this.#le(e, {
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
  #te() {
    for (const e of this.#B) e.frame.close();
    this.#B = [];
  }
  #ie = (e) => {
    const t = this.#x && this.#t.playbackRate > 1;
    if (t !== this.#E) {
      const i = this.#d;
      this.cancel(), this.#E = t, i !== null && this.request(i);
      return;
    }
    ["seeking", "seeked", "emptied", "ratechange"].includes(e.type) && (this.#_ = null, this.#T = []), this.#E && ((e.type === "pause" || e.type === "ended") && this.flush(performance.now()), this.#te(), this.#v?.(), this.#v = null, this.#d !== null && this.#Q());
  };
  #Q() {
    if (!this.#E || this.#v !== null || this.#d === null || (this.#t.paused || this.#t.ended) && this.#_ !== null)
      return;
    this.#D === null && typeof this.#t.requestVideoFrameCallback == "function" && (this.#D = this.#t.requestVideoFrameCallback(
      this.#ae
    ));
    const e = Math.max(4, 8 / Math.max(1, this.#t.playbackRate)), t = this.#t.ownerDocument?.defaultView;
    if (this.#S = this.#t.ownerDocument, t) {
      const i = t.setTimeout(this.#K, e);
      this.#v = () => t.clearTimeout(i);
    } else {
      const i = setTimeout(this.#K, e);
      this.#v = () => clearTimeout(i);
    }
  }
  #ae = () => {
    this.#D = null, this.#v?.(), this.#v = null, this.#K();
  };
  #K = () => {
    this.#v = null;
    const e = this.#t;
    if (this.#d === null) return;
    if (e.readyState < 2 || e.seeking) {
      this.#Q();
      return;
    }
    let t;
    try {
      t = new VideoFrame(e);
    } catch (i) {
      if (!(i instanceof DOMException) || i.name !== "InvalidStateError")
        throw i;
      this.#Q();
      return;
    }
    if (t.timestamp === this.#_)
      t.close();
    else {
      let i = 1;
      if (this.#_ !== null) {
        const s = t.timestamp - this.#_;
        if (s > 1e3 && s < 25e4 && (this.#T.push(s), this.#T.length > 7 && this.#T.shift()), s > 0 && this.#T.length > 0) {
          const r = [...this.#T].sort((o, a) => o - a), h = r[Math.floor(r.length / 2)];
          i = Math.max(1, Math.round(s / h));
        }
      }
      for (this.#_ = t.timestamp, this.#q += i, this.#B.push({
        frame: t,
        at: performance.now(),
        count: this.#q
      }); this.#B.length > 4; ) this.#B.shift().frame.close();
    }
    this.#Q();
  };
  #O = () => {
    this.#c = null, this.#l = null, this.#r = 0;
  };
  #Z = () => {
    this.#M = null, this.#h = null, this.#a = !0, this.#L(), this.#O();
  };
  /** Discard all takes. The next take has no reference to compare with. */
  #L() {
    this.#u?.reset(), this.#p = [], this.#n = 0;
  }
  /** Native acquisition: pass the report on, with the clock it was made on. */
  #Ae = (e, t) => {
    this.#le(e, {
      width: t.width,
      height: t.height,
      mediaTime: t.mediaTime,
      presentedFrames: t.presentedFrames,
      expectedDisplayTime: t.expectedDisplayTime,
      timeOrigin: it(this.#t)
    });
  };
  #le = (e, t) => {
    const i = this.#d;
    this.#f = null, this.#d = null, i?.(e, t);
  };
  #k = (e) => {
    const t = this.#i, i = pe.map((a) => t[a]);
    this.#M?.some((a, u) => i[u] < a) && this.#Z(), this.#M = i;
    const s = this.#e?.() ?? null;
    s !== this.#u && (this.#Z(), this.#u = s);
    const r = t.mozPaintedFrames, h = !t.seeking && t.readyState >= 2 && t.videoWidth > 0 && t.videoHeight > 0, o = this.#h === null && (r > 0 || t.paused && (t.mozPresentedFrames > 0 || t.mozDecodedFrames > 0));
    if (s !== null) {
      this.#ue(e, t, s, h, o);
      return;
    }
    if (h && (o || this.#h !== null && r !== this.#h)) {
      this.#c !== null && e - this.#c > H && (this.#O(), this.#a = !0), this.#se(e, t), this.#c = e, this.#h = r;
      const a = this.#a;
      this.#a = !1, this.#le(e, {
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
        mozTiming: { periodMs: this.#r, discontinuity: a }
      });
    } else
      this.#f = requestAnimationFrame(this.#k);
  };
  /** Update the cadence estimate from the painted count. Called on a poll where the count advanced. */
  #se(e, t) {
    if (t.paused || t.ended) return;
    const i = t.mozPaintedFrames, s = this.#l;
    if (s && e - s.at >= rt) {
      const r = i - s.frames;
      if (r > 0) {
        const h = (e - s.at) / r;
        h >= 4 && h <= 200 && (this.#r = this.#r ? this.#r + (h - this.#r) * 0.25 : h);
      }
      this.#l = null;
    }
    this.#l ??= { at: e, frames: i };
  }
  /**
   * Poll that finds new frames by comparing pictures. Every refresh takes the
   * element's picture. A take is delivered once its result is known, one or
   * more refreshes after it was made.
   */
  #ue(e, t, i, s, r) {
    const h = t.mozPaintedFrames, o = this.#h !== null && h !== this.#h;
    this.#s !== null && e - this.#s > H && (this.#L(), this.#O(), this.#a = !0), this.#s = e, o && this.#se(e, t);
    const a = t.paused || t.ended;
    (!a || o) && (this.#n = 0), a && this.#A !== null && (this.#A = e);
    const u = a && this.#n >= ht;
    if (s && (r || this.#h !== null)) {
      this.#h = h;
      const l = u ? null : i.take();
      l !== null && this.#p.push({
        id: l,
        at: e,
        mediaTime: t.currentTime,
        width: t.videoWidth,
        height: t.videoHeight,
        resting: a
      });
    }
    let A = null;
    for (let l = i.settle(); l !== null; l = i.settle()) {
      const c = this.#p.shift();
      if (c?.id !== l.id)
        throw new Error("picture verdicts arrived out of order");
      let m = l.changed;
      if (m ? this.#n = 0 : (this.#n = c.resting ? this.#n + 1 : 0, m = A === null && !c.resting && this.#A !== null && (c.at - this.#A) * (t.playbackRate || 1) >= ot && h !== this.#o), !m) {
        i.release(c.id);
        continue;
      }
      A !== null && i.release(A.id), A = c;
    }
    if (A === null) {
      this.#f = requestAnimationFrame(this.#k);
      return;
    }
    let f = 1;
    if (this.#c !== null) {
      const l = A.at - this.#c;
      l > H ? (this.#O(), this.#a = !0) : this.#r > 0 && l > this.#r * nt && (f = Math.round(l / this.#r));
    }
    this.#R += f, this.#c = A.at, this.#A = A.at, this.#o = h;
    const d = this.#a;
    this.#a = !1;
    try {
      this.#le(e, {
        width: A.width,
        height: A.height,
        // As on the counter path, this only places the frame on the media
        // timeline. It is the clock value when the picture was taken.
        mediaTime: A.mediaTime,
        presentedFrames: this.#R,
        // The picture is delivered now, not when it was taken, and the
        // schedule is anchored to the delivery time.
        expectedDisplayTime: e,
        timeOrigin: performance.timeOrigin,
        mozTiming: { periodMs: this.#r, discontinuity: d },
        picture: A.id
      });
    } finally {
      i.release(A.id);
    }
  }
}
let ve = null;
function At(n) {
  ve = n;
}
const $ = 0.5, x = 4, Y = 5, T = Y + 1, te = 1e3, ie = 4, U = 200, lt = 0.25, ut = 1e3 / 60, ct = `#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`, ft = 0.75, dt = 0.1, se = 1, mt = 60, pt = 0.02, Et = 0.1, I = 1, vt = 4, bt = 90, xt = 1.5, re = 4, gt = 24, N = 1e-3, O = 5, ne = 4, he = {
  2: 0,
  3: 0.25,
  4: 0.5,
  5: 0.75
};
function oe(n) {
  return wt[(n.interlaced ? 2 : 0) + (n.topFieldFirst ? 1 : 0)];
}
const Tt = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`, wt = [
  { interlaced: !1, topFieldFirst: !1 },
  { interlaced: !1, topFieldFirst: !0 },
  { interlaced: !0, topFieldFirst: !1 },
  { interlaced: !0, topFieldFirst: !0 }
];
function Nt() {
  return st() && typeof WebGL2RenderingContext < "u";
}
const Ft = {
  requestAnimationFrame: (n) => requestAnimationFrame(n),
  cancelAnimationFrame: (n) => cancelAnimationFrame(n)
}, yt = {
  setTimeout: (n, e) => setTimeout(n, e),
  clearTimeout: (n) => clearTimeout(n)
};
class Bt extends EventTarget {
  /**
   * Receive decoded pictures with their presentation times. From the first
   * push on they are the only pictures shown, and the element is only the
   * clock they are shown by.
   */
  decodedVideo;
  #t;
  #i;
  #e;
  #u;
  /** Finds Firefox's new pictures for the main-thread renderer. */
  #p;
  /** The take holding the picture of the frame being ingested, if any. */
  #R = null;
  #s;
  /** The pulldown detection, built only while the `film` option needs it. */
  #n = null;
  #A;
  #o;
  /** The program that copies a filtered picture onto the canvas. */
  #f;
  #d;
  #M;
  #h = [];
  /** Somewhere to filter a field into, and to read it back out of. */
  #a = [];
  /** Which output slot was written last; the next one follows round the ring. */
  #c = T - 1;
  /** The draw path currently shown on the canvas, retained for snapshots. */
  #l = null;
  /** Filtered fields waiting for their moment, oldest first. */
  #r = [];
  /** The requestAnimationFrame() loop that puts them up, which is all that draws on the canvas. */
  #x = null;
  /** The reading of the element's clock a Worker renderer is to be sent before its next frame. */
  #E = null;
  /** When the last reading went to the Worker renderer. */
  #v = Number.NEGATIVE_INFINITY;
  #S = 0;
  /** Deliver captured pictures on the page's refresh during faster playback. */
  #D = null;
  /** The document the owner-change listener is on, if any. */
  #_ = null;
  #q;
  /** The gap between animation frames: as near as the page gets to the screen. */
  #T = ut;
  /** Where the refresh grid fitted to the animation frames stands. (otya) */
  #B = 0;
  /** How far ahead of its animation frame the last picture shown stood. (otya) */
  #te = 0;
  #ie = 0;
  #Q = 0;
  /** The last picture chained onto the schedule; a break restarts it. (otya) */
  #ae = null;
  /** The lateness the schedule holds on purpose, in refreshes. See #schedule. */
  #K = 0;
  /** Pictures in a row that arrived off the phase the lag stands for, all on one side of it. */
  #O = 0;
  /** Of those, the phase closest to the lag's phase, in refreshes. */
  #Z = 0;
  /**
   * Drop the presentation queue and restart the schedule from the clock.
   * Every schedule restart goes through here (otya nulls #lastScheduled at
   * each queue clear): the old chain's clock no longer applies, so keeping
   * it would either count a phantom resync or pop freshly queued pictures
   * as late. Restart accounting for cadence changes lives in #schedule.
   */
  #L() {
    this.#r.length = 0, this.#Oe.length = 0, this.#ae = null, this.#K = 0, this.#O = 0, this.#Q = 0;
  }
  /** The `<div>` this put around the element, so it can be taken away again. */
  #Ae = null;
  #le;
  #k;
  #se;
  #ue = 0;
  /** otya GPU pulldown path: enabled by the `film` option (see below). */
  #re;
  #U;
  /** How long a frame lasts in wall time, from what the frames themselves say. */
  #I = 0;
  /** The size of a frame as it is coded, which is what a texture holds. */
  #G = 0;
  #Y = 0;
  /** Where the newest frame is. The two before it follow round the ring. */
  #F = x - 1;
  /** How many of the held frames are consecutive, up to HISTORY. */
  #y = 0;
  #Ve = 0;
  /** presentedFrames at the last ingested frame; pairs with #lastMediaTime. */
  #Lt = 0;
  /** A destination frame that arrived before the browser finished seeking. */
  #Ye = !1;
  #P = !1;
  /** Cancels work suspended inside a synchronous owner callback. */
  #J = 0;
  #De = !1;
  #j = !1;
  #N = null;
  #_e = [];
  #ee = !1;
  #kt;
  #Ut;
  #C;
  #Me;
  #ce;
  #Ot;
  #b = null;
  #w;
  #Qe = !1;
  #Gt = 0;
  #Xt = !1;
  #ts = 0;
  #Ze = !1;
  #ct = !1;
  #Se = null;
  #is = 0;
  #je = /* @__PURE__ */ new Map();
  /** Everything the next report is counted from. See DeinterlaceStats. */
  #g = {
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
  #qe = 0;
  /** When the last frame the filter took arrived, to see the gaps between. */
  #Ke = 0;
  #ft = 0;
  #ne = 0;
  #be = 0;
  #xe = 0;
  #Pe = 0;
  #fe = 0;
  #Ce;
  #dt = [];
  #Ie = [];
  #Je = 0;
  #Ne = 0;
  #et = 0;
  #Be = 0;
  /** The last phase read back from the GPU, and how many frames ago it was for. */
  #tt = F;
  #Le = 0;
  /** The phase of the frame being filtered: #known advanced by #knownAge. */
  #X = F;
  #$ = !1;
  /** Frames left of the FILM_HOLD_FRAMES window that starts when the cadence is held. */
  #z = 0;
  /** Whether the comb counts were made for the frame being filtered and its neighbours. */
  #mt = !1;
  /** Whether the frame being filtered may have its fields matched. See #render. */
  #ge = !1;
  /** Whether the last detection read back found each frame to be one instant. */
  #zt = !1;
  /** Whether comb counts were also made for the frame after it. */
  #Wt = !1;
  /** Whether the frame behind the newest (the one being filtered) came after a gap in the frames seen. */
  #Ht = !1;
  /** Whether the previous frame was progressive. */
  #it = !1;
  #ke = null;
  #vi = "";
  /** Debug only: frames given each phase (0 for none), and repeats dropped. */
  #pt = [0, 0, 0, 0, 0, 0];
  #Et = 0;
  /**
   * Why requested film reconstruction is currently degraded, or null while
   * healthy. The `film` option stays as the caller set it;
   * only the engine stands down, so this is never a silent option change.
   */
  #Te = null;
  /** Last worker-reported filmError, to derive the page-side failure event. */
  #$t = null;
  #Vt = 0;
  /** Whether pictures come from `decodedVideo`. Set by the first push and kept. */
  #m = !1;
  /** Pushed pictures not yet taken in, in timestamp order. */
  #we = [];
  /** Whether finish() was called since the last reset. */
  #Yt = !1;
  #W = new qe();
  /** Built when the first decoded picture arrives. */
  #st = null;
  /** The decoded picture in each history slot; the newest is at #head. */
  #Fe = Array.from({ length: x }, () => ({
    timestamp: 0,
    duration: 0,
    interlaced: !0,
    topFieldFirst: !0,
    repeatFirstField: !1
  }));
  /** Whether a decoded picture has been taken in since the last reset. */
  #Qt = !1;
  /** When the last picture pushed since the last reset starts. */
  #vt = Number.NEGATIVE_INFINITY;
  /** Whether the newest picture is still to be filtered against its successor. */
  #Ue = !1;
  /** Whether it has been filtered against itself meanwhile, its successor being late. */
  #rt = !1;
  /** Filtered decoded outputs waiting for their media time, in time order. */
  #Oe = [];
  /** The decoded output on the canvas. */
  #bt = null;
  /**
   * The first outputs of the last two pictures shown, whose slots are kept:
   * a pause can land in the picture before the one the canvas has gone on to.
   */
  #de = null;
  #Ge = null;
  /** The media time of the output on the canvas; nothing older goes up after it. */
  #Zt = Number.NEGATIVE_INFINITY;
  /** Outputs the last refresh advanced by. Near a refresh boundary the next refresh does the same. */
  #nt = 1;
  /** Field order of the decoded picture being filtered. */
  #jt = !0;
  /** The size the decoded pictures are shown at. */
  #ht = 0;
  #ot = 0;
  /** The element's own inline aspect ratio, from before decoded pictures gave it theirs. */
  #qt = null;
  /** Whether the element answers for the decoded pictures; see `#standInForElement`. */
  #xt = !1;
  /** Decoded pictures pushed since the counts were last reset. */
  #Kt = 0;
  /** Pictures a Worker renderer dropped unshown, as of its last report. */
  #Jt = 0;
  /** Whether the page showing the canvas is hidden; it is then given no refreshes. */
  #gt = !1;
  /**
   * The position when the page last became visible again, and the clock's
   * origin then. The position bounds what passed while it was hidden only for
   * as long as playback has been continuous since, which the origin tells.
   * It is the element's own position where the clock has not caught up with
   * it: a hidden page sends no readings, so playback resumed while it was
   * hidden finds the clock still where the element was paused.
   */
  #bi = Number.NaN;
  #xi = Number.NaN;
  /**
   * Buffers transferred to the Worker and not yet back, by the id they went
   * with. A Worker that goes away takes them with it, and what is handed
   * back for them then is the detached original.
   */
  #Tt = /* @__PURE__ */ new Map();
  #ss = 0;
  constructor(e, t = {}, i = null) {
    super(), this.#e = e, this.#k = t.doubleRate ?? !1, this.#se = t.spatialCheck ?? !0, this.#re = t.debug ?? !1, this.#U = t.film ?? !1, this.#kt = t.onStats, this.#Ut = t.onFailure, this.#C = i, this.#ce = i ? "main" : t.rendering ?? "main", this.#Ot = t.workerUrl ?? ve, this.#w = this.#ce === "main" ? "main" : "idle", this.#i = i ? i.canvas : document.createElement("canvas"), this.#t = i?.canvas ?? (this.#ce === "main" ? this.#i : document.createElement("canvas")), this.#Me = e, i || (this.#i.style.cssText = "position:absolute;pointer-events:none;visibility:hidden");
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
    this.#s = s, this.#U && (this.#wi(), this.#n = new q(s)), this.#A = ae(s, ze);
    const r = this.#A;
    this.#o = Object.fromEntries(
      Object.entries(Xe).map(([h, o]) => [
        h,
        s.getUniformLocation(r, o)
      ])
    ), this.#f = ae(s, Tt), this.#d = s.getUniformLocation(this.#f, "uField"), this.#M = s.getUniformLocation(this.#f, "uFlip"), this.#Ce = s.getExtension(
      "EXT_disjoint_timer_query_webgl2"
    ), this.#t.addEventListener(
      "webglcontextlost",
      this.#es
    ), this.#le = i ? null : new ResizeObserver(() => this.#$e()), this.#q = i ? null : new MutationObserver(() => {
      this.#i.ownerDocument !== this.#_ && this.#$e();
    }), this.decodedVideo = {
      push: (h) => this.#ps(h),
      reset: () => this.#_i(),
      finish: () => {
        this.#Yt = !0, this.#b?.postMessage({
          type: "pictures",
          action: "finish"
        });
      },
      onrelease: null
    }, this.#p = i ? null : new et(s, e), this.#u = new at(
      e,
      () => this.#w === "main" ? this.#p : null
    ), e.addEventListener("emptied", this.#ji), e.addEventListener("resize", this.#Zi), e.addEventListener("pause", this.#ve), e.addEventListener("ended", this.#ve), e.addEventListener("seeking", this.#Ki), e.addEventListener("seeked", this.#ve), e.addEventListener("ratechange", this.#ve), e.addEventListener("waiting", this.#Ji);
  }
  /**
   * Whether the canvas, rather than the element, is what shows the picture.
   * A page uses this to decide which of the two to capture or transform.
   * Filtering an element's own picture that is the same as filtering it at
   * all, since a progressive source is left to the element. Decoded pictures
   * are on the canvas filtered or not, because the element has none.
   */
  get running() {
    return this.#m ? this.#P : this.#P && (this.#N?.interlaced ?? !0);
  }
  /** The HTML canvas currently placed over the media element. */
  get canvas() {
    return this.#i;
  }
  /** Field order for the current scan state, defaulting to top-field-first. */
  get #wt() {
    return this.#m ? this.#jt : this.#N?.topFieldFirst !== !1;
  }
  /** The same public filter options for either rendering target. */
  #gi() {
    return {
      doubleRate: this.#k,
      spatialCheck: this.#se,
      film: this.#U,
      debug: this.#re
    };
  }
  /** Whether the caller wants filtering, independently of the current source. */
  get enabled() {
    return this.#De;
  }
  set enabled(e) {
    this.#De = e, this.#Ft(), this.#b?.postMessage({
      type: "enabled",
      enabled: e
    });
  }
  /** Update whether the source needs filtering and which field comes first. */
  set scan(e) {
    if (this.#m) return;
    const t = this.#N?.interlaced !== e?.interlaced, i = t || this.#N?.topFieldFirst !== e?.topFieldFirst;
    this.#N = e, !(i && (!this.#ze() || this.#N !== e)) && (this.#b?.postMessage({ type: "scan", scan: e }), i && (this.#y = 0, this.#L(), this.#V(), t && (this.#I = 0), this.#l = null, this.#pe(!1)), this.#Ft(), i && ((e?.interlaced ?? !0) && (this.#C || this.#w === "main") ? this.#ye() : this.#hi()));
  }
  get scan() {
    return this.#m ? this.#bt?.scan ?? null : this.#N;
  }
  set videoTimeline(e) {
    this.#_e = e, this.#b?.postMessage({
      type: "timeline",
      videoTimeline: e
    }), e.length === 0 && (this.#N = null), this.#Ft();
  }
  get videoTimeline() {
    return this.#_e;
  }
  /**
   * What to put on the screen for fullscreen: the `<div>` holding both the
   * element and the canvas once there is one, and the element itself before
   * that. Fullscreening the element alone would leave the canvas behind in
   * the page, and with it the only deinterlaced picture there is.
   */
  get container() {
    return this.#Ae ?? this.#e;
  }
  /** Whether a picture goes up for every field rather than every frame. */
  get doubleRate() {
    return this.#k;
  }
  set doubleRate(e) {
    e !== this.#k && (this.#k = e, this.#Xe(), !this.#m && (this.#L(), this.#Ti()));
  }
  get spatialCheck() {
    return this.#se;
  }
  set spatialCheck(e) {
    e !== this.#se && (this.#se = e, this.#Xe());
  }
  get film() {
    return this.#U;
  }
  set film(e) {
    const t = this.#b ? this.#$t : this.#Te;
    if (!(e === this.#U && (e === !1 || t === null))) {
      if (this.#b) {
        this.#U = e, this.#Xe(e ? "film" : void 0);
        return;
      }
      if (e) {
        if (!this.#ze()) return;
        try {
          this.#Fi();
        } catch (i) {
          this.#U = !0, this.#Xe(), this.#Rt(
            `film detector unavailable: ${i instanceof Error ? i.message : String(i)}`
          );
          return;
        }
      }
      if (this.#U = e, this.#Xe(), !e) {
        if (!this.#ze()) return;
        this.#$ = !1, this.#z = 0, this.#ge = !1, this.#X = F, this.#V(), this.#n?.destroy(), this.#n = null;
      }
      this.#Ti();
    }
  }
  get debug() {
    return this.#re;
  }
  set debug(e) {
    e !== this.#re && (this.#re = e, this.#Xe());
  }
  /** Whether pictures are queued for presentation by the frame loop. */
  get #rs() {
    return this.#k || this.#U;
  }
  #Ti() {
    this.#j || this.#m || (this.#rs ? (this.#G > 0 && this.#Qi(), (this.#N?.interlaced ?? !0) && (this.#C || this.#w === "main") && this.#ye()) : this.#U || (this.#l = null, this.#pe(!1), this.#ut()));
  }
  /** Apply mutable filter settings to the existing Worker and canvas. */
  #Xe(e) {
    this.#b?.postMessage({
      type: "settings",
      options: this.#gi(),
      retryFilm: e
    });
  }
  #wi() {
    if (this.#s.getExtension("EXT_color_buffer_float") === null)
      throw new Error("film needs EXT_color_buffer_float");
  }
  /** Build the GPU pulldown detector the `film` option needs, or throw. */
  #Fi() {
    this.#wi(), this.#n ??= new q(this.#s), this.#G > 0 && this.#n.resize(this.#G, this.#Y);
  }
  #Ft() {
    this.#m || this.#De && (this.#_e.length > 0 || (this.#N?.interlaced ?? !0)) ? this.start() : this.stop();
  }
  /** Start the bundled Worker when the required transfer APIs are available. */
  #ns() {
    return this.#C || this.#ce === "main" ? !1 : this.#w === "starting" || this.#w === "active" ? !0 : typeof Worker < "u" && typeof VideoFrame < "u" && typeof OffscreenCanvas < "u" && this.#Ot !== null && "transferControlToOffscreen" in HTMLCanvasElement.prototype ? (this.#yi(), !0) : this.#ce === "auto" ? (this.#Dt(), !1) : (this.#w = "failed", this.#P = !1, !0);
  }
  /** Transfer the display canvas to a new Worker, replacing it if already transferred. */
  #yi() {
    this.#he(), this.#b?.terminate(), this.#b = null, this.#St(), this.#Ze = !1, this.#ct = !1, this.#$t = null, this.#Vt = 0;
    let e = this.#i;
    if (this.#Xt) {
      e = document.createElement("canvas"), e.className = this.#i.className;
      const r = this.#i.getAttribute("style");
      r === null ? e.removeAttribute("style") : e.setAttribute("style", r), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e;
    }
    const t = ++this.#Gt;
    this.#w = "starting";
    let i, s;
    try {
      s = e.transferControlToOffscreen(), this.#Xt = !0, i = new Worker(this.#Ot, { type: "module" });
    } catch (r) {
      this.#at(
        r instanceof Error ? r.message : String(r)
      );
      return;
    }
    this.#b = i, i.onmessage = (r) => {
      t === this.#Gt && this.#hs(r.data);
    }, i.onerror = (r) => {
      t === this.#Gt && (r.preventDefault(), this.#at(r.message || "the deinterlacer worker failed"));
    }, i.postMessage(
      {
        type: "initialize",
        canvas: s,
        options: this.#gi(),
        scan: this.#N,
        videoTimeline: this.#_e,
        enabled: this.#P,
        video: this.#We()
      },
      [s]
    ), this.#gt && i.postMessage({
      type: "pageVisibility",
      hidden: !0,
      video: this.#We()
    });
  }
  /** Apply Worker notifications and release the wait for the next input frame. */
  #hs(e) {
    switch (e.type) {
      case "ready":
        this.#w = "active", this.#P && (this.#At(), this.#Bt());
        break;
      case "failed":
        this.#at(e.message);
        break;
      case "consumed": {
        this.#Ze = !1, this.#ct = !0;
        const t = this.#Se;
        this.#Se = null, t && this.#Di(t);
        break;
      }
      case "visibility":
        this.#i.style.visibility = e.visible ? "visible" : "hidden";
        break;
      case "stats": {
        this.#m && (this.#Jt = e.stats.missed + e.stats.queueResetted);
        const t = {
          ...e.stats,
          dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0
        }, i = t.filmError ?? null, s = this.#Vt;
        if (this.#$t = i, this.#Vt = e.filmFailure, i !== null && e.filmFailure !== s) {
          this.dispatchEvent(
            new CustomEvent("failure", { detail: i })
          );
          try {
            this.#Ut?.(i);
          } catch {
          }
        }
        this.dispatchEvent(new CustomEvent("stats", { detail: t })), this.#kt?.(t);
        break;
      }
      case "capture": {
        const t = this.#je.get(e.id);
        if (this.#je.delete(e.id), !t) {
          e.image?.close();
          break;
        }
        e.image ? t.resolve(e.image) : this.#m ? t.reject(new Error("no rendered picture is available")) : createImageBitmap(this.#e).then(
          t.resolve,
          t.reject
        );
        break;
      }
      case "release":
        this.#Tt.delete(e.id) && this.#oe(e.data);
        break;
    }
  }
  /**
   * Tell the owner that a rendering resource failed after construction.
   * In the worker domain the boundary counts episodes: the reason travels in
   * `stats.filmError` and the page derives the event from the episode count,
   * so a film degradation is never mistaken for worker death.
   */
  #yt(e) {
    if (this.dispatchEvent(new CustomEvent("failure", { detail: e })), !this.#C)
      try {
        this.#Ut?.(e);
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
  #Rt(e) {
    this.#Te !== e && (this.#Te = e, this.#$ = !1, this.#z = 0, this.#ge = !1, this.#X = F, this.#V(), this.#n?.destroy(), this.#n = null, this.#yt(e));
  }
  /**
   * Re-arm film reconstruction at a resource-reallocation point (start, scan
   * change, resize, or re-setting the option). The next frame retries; a
   * repeated failure degrades again and notifies as a new episode.
   */
  #ze() {
    return this.#j ? !1 : (this.#b || (this.#Te = null), !0);
  }
  /** Retry a transient Worker failure once, then show the media element if it fails again. */
  #at(e) {
    if (this.#w === "starting" && this.#ce === "auto" && !this.#Qe) {
      this.#Dt();
      return;
    }
    if (this.#Ri(e), !this.#Qe) {
      this.#Qe = !0, this.#yi();
      return;
    }
    console.error(`Deinterlacer Worker stopped: ${e}`), this.#w = "failed", this.#b?.terminate(), this.#b = null, this.#he(), this.#St(), this.#yt(`deinterlacer worker stopped: ${e}`), this.stop();
  }
  /** Restore the main-thread canvas when automatic Worker selection fails. */
  #Dt() {
    const e = this.#t;
    e.className = this.#i.className;
    const t = this.#i.getAttribute("style");
    t === null ? e.removeAttribute("style") : e.setAttribute("style", t), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e, this.#Xt = !1, this.#b?.terminate(), this.#b = null, this.#w = "main", this.#he(), this.#St(), this.#P && (this.#At(), this.#Bt(), (this.#N?.interlaced ?? !0) && this.#ye());
  }
  /** Close the queued frame still owned by the page when switching renderers. */
  #he() {
    this.#Se?.frame.close(), this.#Se = null;
  }
  /** Reject captures whose replies would be lost when the Worker is rebuilt. */
  #Ri(e) {
    for (const t of this.#je.values())
      t.reject(new Error(e));
    this.#je.clear();
  }
  start() {
    if (!(this.#P || this.#j || this.#ee) && (this.#J++, this.#P = !0, this.#qi(), !!this.#ze())) {
      if (this.#Gs(), this.#Bt(), this.#ns()) {
        if (this.#m) {
          this.#b?.postMessage({
            type: "running",
            running: !0
          }), this.#ye();
          return;
        }
        this.#b?.postMessage({
          type: "enabled",
          enabled: !0
        }), this.#w === "active" && this.#At();
        return;
      }
      this.#At(), (this.#m || (this.#N?.interlaced ?? !0)) && this.#ye();
    }
  }
  /**
   * Take the deinterlaced picture away, leaving the element's own showing.
   * Decoded pictures held are released, and those pushed until the next
   * start() are released at once.
   */
  stop() {
    this.#J++, this.#P && (this.#P = !1, this.#m && this.#_i(), this.#u.cancel(), this.#li(), this.#hi(), this.#y = 0, this.#l = null, this.#pe(!1), this.#he(), this.#b?.postMessage(
      this.#m ? { type: "running", running: !1 } : { type: "enabled", enabled: !1 }
    ));
  }
  destroy() {
    if (!this.#j) {
      this.#j = !0, this.#De = !1, this.stop(), this.#b?.postMessage({ type: "destroy" }), this.#b?.terminate(), this.#b = null, this.#he(), this.#St(), this.#Ri("the deinterlacer was destroyed"), this.#_?.removeEventListener(
        "visibilitychange",
        this.#Ai
      ), this.#_ = null, this.#q?.disconnect(), this.#t.removeEventListener(
        "webglcontextlost",
        this.#es
      ), this.#u.destroy(), this.#p?.destroy(), this.#e.removeEventListener("emptied", this.#ji), this.#e.removeEventListener("resize", this.#Zi), this.#e.removeEventListener("pause", this.#ve), this.#e.removeEventListener("ended", this.#ve), this.#e.removeEventListener("seeking", this.#Ki), this.#e.removeEventListener("seeked", this.#ve), this.#e.removeEventListener("ratechange", this.#ve), this.#e.removeEventListener("waiting", this.#Ji), this.#qt !== null && (this.#e.style.aspectRatio = this.#qt), this.#bs(), this.#Xs();
      for (const e of this.#h) this.#s.deleteTexture(e);
      this.#h = [], this.#ut();
      for (const e of [
        ...this.#dt,
        ...this.#Ie.map(({ q: t }) => t)
      ])
        this.#s.deleteQuery(e);
      this.#dt.length = 0, this.#Ie.length = 0, this.#n?.destroy(), this.#n = null, this.#st?.destroy(), this.#st = null, this.#ke !== null && (Fe(this.#ke), this.#ke = null), this.#s.deleteProgram(this.#A), this.#s.deleteProgram(this.#f), this.#s.getExtension("WEBGL_lose_context")?.loseContext();
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
    if (this.#w === "active" && this.#i.style.visibility === "visible" && this.#b) {
      const s = ++this.#is, r = new Promise((h, o) => {
        this.#je.set(s, { resolve: h, reject: o });
      });
      return this.#b.postMessage({
        type: "capture",
        id: s,
        width: this.#e.videoWidth,
        height: this.#e.videoHeight
      }), r;
    }
    if (!this.#m && (this.#w === "starting" || this.#w === "failed"))
      return createImageBitmap(this.#e);
    const e = this.#l;
    if ((this.#C || this.#m) && (!this.#P || this.#ee || !e))
      return Promise.reject(new Error("no rendered picture is available"));
    if (!this.#P || this.#ee || !e)
      return createImageBitmap(this.#e);
    e.kind === "texture" ? this.#fi(e.texture, e.flip, !1) : this.#Ee(e.flush, e.second, null, !1);
    const t = this.#m ? this.#ht : this.#e.videoWidth, i = this.#m ? this.#ot : this.#e.videoHeight;
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
  #At() {
    this.#C || !this.#P || this.#m || this.#u.request(this.#ds);
  }
  /** Copy the element's playback state for seek and presentation timing decisions. */
  #We() {
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
  #os(e, t, i) {
    let s;
    try {
      s = i?.clone() ?? new VideoFrame(this.#e, {
        timestamp: Math.max(0, Math.round(t.mediaTime * 1e6))
      });
    } catch (h) {
      const o = h instanceof Error ? h.message : String(h);
      this.#ce === "auto" && !this.#ct && !this.#Qe ? (this.#Dt(), this.#Ct(e, t)) : this.#at(o);
      return;
    }
    const r = {
      id: ++this.#ts,
      frame: s,
      now: e,
      metadata: t,
      video: this.#We()
    };
    if (this.#Ze) {
      this.#Se?.frame.close(), this.#Se = r;
      return;
    }
    this.#Di(r);
  }
  /** Transfer the selected frame once the Worker has released the previous input. */
  #Di(e) {
    const t = this.#b;
    if (!t || this.#w !== "active") {
      e.frame.close();
      return;
    }
    this.#Ze = !0;
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
      this.#Ze = !1, e.frame.close();
      const r = s instanceof Error ? s.message : String(s);
      this.#ce === "auto" && !this.#ct && !this.#Qe ? (this.#Dt(), this.#Ct(e.now, e.metadata)) : this.#at(r);
    }
  }
  #as(e, t, i) {
    this.#ke == null && (this.#ke = Te(this.#s, "20px monospace")), ye(this.#ke, e, t, i, this.#G, this.#Y, 20);
  }
  #_t(e) {
    if (this.#Ce == null || this.#Ie.length > 30)
      return;
    const t = this.#dt.pop() ?? this.#s.createQuery();
    return this.#s.beginQuery(this.#Ce.TIME_ELAPSED_EXT, t), this.#Ie.push({ q: t, isField: e }), t;
  }
  #me(e) {
    this.#Ce != null && (e != null && this.#s.endQuery(this.#Ce.TIME_ELAPSED_EXT), this.#Ie = this.#Ie.filter(
      ({ q: t, isField: i }) => {
        if (this.#s.getQueryParameter(t, this.#s.QUERY_RESULT_AVAILABLE)) {
          const s = this.#s.getQueryParameter(t, this.#s.QUERY_RESULT);
          return i ? (this.#et += s, this.#Be++) : (this.#Je += s, this.#Ne++), this.#dt.push(t), !1;
        }
        return !0;
      }
    ));
  }
  /**
   * Restart the detection. `gap` is for frames that went unseen in a stream
   * that carries on: the cadence must be found again, but the one-instant
   * verdict is kept because it has not changed.
   */
  #V(e = !1) {
    this.#X = F, this.#tt = F, this.#Le = 0, e || (this.#zt = !1), this.#$ = !1, this.#n?.reset(e);
  }
  /** Detect the pulldown phase of the frame being filtered on the GPU. */
  #As() {
    const { prev: e, cur: t, next: i } = this.#pi(!1), s = this.#h[e], r = this.#h[t], h = this.#h[i];
    if (!s || !r || !h) return;
    const o = this.#wt ? 0 : 1;
    this.#n?.measureComb(s, r, o), this.#n?.detect(r, h, o);
  }
  /**
   * Count the combing for the frame after the one being filtered. The count
   * says whether that frame's first field fits between this frame's
   * second-field lines. Returns whether the count was made.
   */
  #ls() {
    const { cur: e, next: t } = this.#pi(!1), i = this.#h[e], s = this.#h[t], r = this.#n;
    if (!i || !s || !r) return !1;
    const h = this.#wt ? 0 : 1;
    try {
      r.measureComb(i, s, h, !0);
    } catch (o) {
      return this.#Rt(
        `film detection failed: ${o instanceof Error ? o.message : String(o)}`
      ), !1;
    }
    return !0;
  }
  /**
   * Read back the previous frame's phase if it has arrived, and advance it
   * to the frame being filtered. The run is not advanced: only the GPU
   * counts observed frames.
   */
  #us() {
    const e = this.#n?.poll() ?? null;
    e !== null && (this.#tt = e, this.#Le = e.age, this.#zt = e.instant), this.#Le++;
    const { phase: t, run: i } = this.#tt;
    t === 0 || this.#Le > Math.ceil(O * Math.max(1, this.#e.playbackRate)) ? this.#X = F : this.#X = {
      phase: (t - 1 + this.#Le) % O + 1,
      run: i
    };
  }
  #cs(e) {
    const t = [], i = this.#n?.metrics ?? new Float32Array(0);
    for (let r = 0; r < p.phase; r++) {
      const h = i[r * 4] ?? 0, o = i[r * 4 + 1] ?? 0, a = i[r * 4 + 2] ?? 0;
      t.push(
        `${h.toFixed(3)},${o.toString().padStart(4)},${a.toFixed(3)}`
      );
    }
    const s = this.#pt.map((r, h) => `${h === 0 ? "-" : h}:${r}`).join(" ");
    return `frame=${e} phase=${this.#X.phase} run=${this.#X.run} known=${this.#tt.phase}/${this.#tt.run} age=${this.#Le} ${this.#$ ? "film" : "video"} period=${this.#I.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#Et}`;
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
  #Mt(e, t) {
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
  #fs(e, t) {
    const i = e.expectedDisplayTime;
    if (!Number.isFinite(i) || i <= 0 || !Number.isFinite(e.timeOrigin)) return t;
    const s = this.#Mt(i, e.timeOrigin), r = vt * Math.max(this.#T, this.#I);
    return s < t - r || s > t + r ? t : s;
  }
  #ds = (e, t) => {
    if (!this.#P || this.#ee) return;
    this.#ai();
    const i = this.#Mt(e, t.timeOrigin), { frame: s, picture: r, ...h } = t;
    this.#Me = s ?? this.#e, this.#R = r ?? null;
    try {
      this.#ms(i, h, s);
    } finally {
      this.#Me = this.#e, this.#R = null;
    }
    this.#At();
  };
  /**
   * Take a frame from either acquisition path into the selected renderer.
   * `now` is the ingestion time on this realm's clock.
   */
  #ms(e, t, i) {
    if (this.#w === "active") {
      this.#os(e, t, i);
      return;
    }
    this.#w !== "starting" && this.#Ct(e, t);
  }
  /**
   * @internal Feed Worker input through the same history and rendering decisions
   * as main-thread input. `now` is the ingestion time on the Worker's clock.
   * The metadata's display time stays on the page's clock and is converted
   * using the accompanying timeOrigin.
   */
  ingestExternalFrame(e, t, i) {
    this.#Me = i;
    try {
      this.#Ct(e, t);
    } finally {
      this.#Me = this.#e;
    }
  }
  /** Queue a pushed picture behind the ones before it. */
  #ps(e) {
    try {
      if (We(e), e.timestamp < this.#vt + N)
        throw new RangeError(
          `a picture at ${e.timestamp} s came after one at ${this.#vt} s; pictures come in presentation order`
        );
      this.#m || this.#gs();
    } catch (s) {
      throw this.#oe(e.data), s;
    }
    if (this.#vt = e.timestamp, this.#Kt++, this.#Es(e.displayWidth, e.displayHeight), !this.#P) {
      this.#oe(e.data);
      return;
    }
    if (this.#w === "starting" || this.#w === "active") {
      this.#xs(e);
      return;
    }
    const t = this.#we;
    t.push(e), this.#ei(this.#W.at(performance.now()));
    const i = Math.ceil(
      gt * Math.max(1, this.#e.playbackRate)
    );
    for (; t.length > i; ) {
      const s = t.pop();
      this.#Pt(s.timestamp + s.duration) && this.#g.queueResetted++, this.#oe(s.data);
    }
    this.#fe = Math.max(
      this.#fe,
      t.length
    );
  }
  /**
   * Note the size decoded pictures are shown at. An element playing only
   * sound has no proportions of its own, and a page that sizes its player
   * from the element's would lay it out as 2:1, so the element is given the
   * picture's.
   */
  #Es(e, t) {
    if (!(e === this.#ht && t === this.#ot)) {
      if (this.#ht = e, this.#ot = t, this.#C || this.#j) {
        this.#$e();
        return;
      }
      this.#qt ??= this.#e.style.aspectRatio, this.#e.style.aspectRatio = `${e} / ${t}`, this.#vs(), this.#e.dispatchEvent(new Event("resize"));
    }
  }
  /**
   * Let the element answer for the pictures it does not carry. A page reads
   * a video's size and frame counts from the element -- to refuse a capture
   * of nothing, to shape a picture-in-picture placeholder, to show them --
   * and an element playing only the sound says 0 by 0 and no frames. So it
   * is given the decoded pictures' answers as properties of its own, which
   * hide the built-in ones until `destroy` takes them away again.
   */
  #vs() {
    if (this.#xt) return;
    this.#xt = !0;
    const e = this.#e;
    Object.defineProperty(e, "videoWidth", {
      configurable: !0,
      get: () => this.#ht
    }), Object.defineProperty(e, "videoHeight", {
      configurable: !0,
      get: () => this.#ot
    }), Object.defineProperty(e, "getVideoPlaybackQuality", {
      configurable: !0,
      value: () => ({
        creationTime: performance.now(),
        totalVideoFrames: this.#Kt,
        // Whole pictures that were never shown: too late to be taken in, or
        // more than are held. A Worker renderer keeps its own count.
        droppedVideoFrames: this.#g.missed + this.#g.queueResetted + this.#Jt,
        corruptedVideoFrames: 0
      })
    });
  }
  /** Give the element's own size and frame counts back. */
  #bs() {
    if (!this.#xt) return;
    this.#xt = !1;
    const e = this.#e;
    delete e.videoWidth, delete e.videoHeight, delete e.getVideoPlaybackQuality;
  }
  /** Transfer a picture to the Worker, which sends its buffer back when done. */
  #xs(e) {
    const t = ++this.#ss;
    try {
      this.#b.postMessage(
        { type: "picture", id: t, picture: e },
        [e.data]
      );
    } catch (i) {
      throw this.#oe(e.data), i;
    }
    this.#Tt.set(t, e.data);
  }
  /** Hand back the buffers a Worker that is going away still holds. */
  #St() {
    const e = [...this.#Tt.values()];
    this.#Tt.clear();
    for (const t of e) this.#oe(t);
  }
  /** Make pushed pictures the only pictures shown, from now on. */
  #gs() {
    this.#st = new Ve(this.#s), this.#m = !0, this.#he(), this.#u.cancel(), this.#li(), this.#y = 0, this.#L(), this.#V(), this.#l = null, this.#G = 0, this.#Y = 0, this.#W.hold(), this.#Ft(), this.#ye();
  }
  /** Hand a picture's buffer back to the producer. */
  #oe(e) {
    const t = this.decodedVideo.onrelease;
    if (t !== null)
      try {
        t(e);
      } catch (i) {
        queueMicrotask(() => {
          throw i;
        });
      }
  }
  /** Release everything pushed and forget the history, keeping the canvas as it is. */
  #_i() {
    if (!this.#m) return;
    this.#b?.postMessage({
      type: "pictures",
      action: "reset"
    });
    const e = this.#we;
    this.#we = [], this.#Yt = !1, this.#Qt = !1, this.#vt = Number.NEGATIVE_INFINITY, this.#Ue = !1, this.#rt = !1, this.#y = 0, this.#L(), this.#de = null, this.#Ge = null, this.#Zt = Number.NEGATIVE_INFINITY, this.#nt = 1, this.#V(), this.#z = 0, this.#W.hold();
    for (const t of e) this.#oe(t.data);
  }
  /** Release pictures that will neither be shown nor be the neighbour of one that is. */
  #ei(e) {
    const t = this.#we;
    for (; t.length > 2 && t[2].timestamp <= e; ) {
      const i = t.shift();
      this.#Pi(i.timestamp + i.duration), this.#oe(i.data);
    }
  }
  /**
   * Whether something that ended at `end` was there to be shown. What ended
   * at or before the place playback last started from was not: the pictures
   * a seek's target is given as the filter's neighbours, and whatever was
   * still queued when the position jumped past it. Before the first reading
   * of the clock nothing is known to have been skipped.
   */
  #Mi(e) {
    return !(e <= this.#W.origin + N);
  }
  /**
   * Whether something ending at `end` that goes unshown counts against the
   * renderer. A hidden page is given no refreshes, so nothing goes up while it
   * is hidden, and what ended before the position it came back at passed
   * while it was. Neither was dropped for being late, and counting them would
   * report a background tab as thousands of dropped frames.
   */
  #Pt(e) {
    return this.#gt || !this.#Mi(e) ? !1 : !(this.#W.origin === this.#xi && e <= this.#bi + N);
  }
  /** Note whether the page showing the canvas is hidden. */
  #Si(e) {
    if (e === this.#gt || (this.#gt = e, this.#b?.postMessage({
      type: "pageVisibility",
      hidden: e,
      video: this.#We()
    }), e)) return;
    const t = this.#W.at(performance.now()), i = this.#e.currentTime;
    this.#bi = Number.isNaN(t) ? i : Math.max(t, i), this.#xi = this.#W.origin;
  }
  /**
   * @internal Tell a Worker renderer whether the page showing its canvas is
   * hidden. It has no document of its own to ask.
   */
  observePageVisibility(e) {
    this.#Si(e);
  }
  /** Count a decoded picture ending at `end` that was dropped unshown. */
  #Pi(e) {
    this.#Pt(e) && this.#g.missed++;
  }
  /** Read the element's clock, as it was at `wall` on this realm's clock. */
  #Ci(e) {
    const t = this.#e;
    this.#W.observe(
      e,
      t.currentTime,
      t.playbackRate,
      !t.paused && !t.seeking && !t.ended
    ) && (this.#g.resynced++, this.#nt = 1);
  }
  /**
   * @internal Give a Worker renderer a reading of the element's clock, taken
   * at `at` on the clock whose origin is `timeOrigin`. The element state it
   * belongs to has been applied to the Worker's video.
   */
  observeMediaClock(e, t) {
    this.#Ci(this.#Mt(e, t));
  }
  /**
   * Send the Worker renderer a reading of the element's clock just before its
   * next animation frame.
   *
   * The Worker fills a refresh in its own frame, which comes at the same
   * refresh as the page's and runs within a millisecond or so of it, before a
   * message posted from the page's frame can arrive. A reading taken there is
   * a refresh old by the time it is used; when it is the one that starts the
   * clock, the pictures due in that refresh are not shown. Taken late in the
   * refresh instead, the reading is used in the frame it was taken for.
   *
   * One reading per refresh, as before, and never two closer together than
   * a refresh less the lead: the clock tells an element that plays from one
   * that merely moves by the pace of readings taken about a refresh apart,
   * and two taken together look like a jump. A reading still waiting when
   * this frame comes (the page was busy past its time) goes now, unless a
   * late timer has only just sent one; either way the next is set for the
   * coming refresh.
   */
  #Ts() {
    this.#E !== null && (this.#Ni(), this.#Ii());
    const e = this.#Ns(), t = this.#B + this.#T - re, i = e.setTimeout(
      () => {
        this.#E = null, this.#Ii();
      },
      Math.max(0, t - performance.now())
    );
    this.#E = { timers: e, handle: i };
  }
  /** Send a reading unless the last one went less than a refresh less the lead ago. */
  #Ii() {
    performance.now() - this.#v < this.#T - re || this.#ws();
  }
  #Ni() {
    const e = this.#E;
    e !== null && (this.#E = null, e.timers.clearTimeout(e.handle));
  }
  /** Send the page's reading of the element's clock to the Worker renderer. */
  #ws() {
    this.#v = performance.now(), this.#b?.postMessage({
      type: "clock",
      video: this.#We(),
      at: performance.now(),
      timeOrigin: performance.timeOrigin
    });
  }
  /** Take in what the coming refresh needs and put up what belongs on it. */
  #Fs() {
    const e = this.#e;
    this.#C || this.#Ci(performance.now());
    const t = this.#W.rate, i = this.#W.at(this.#B + this.#T);
    if (Number.isNaN(i)) return;
    const s = this.#J;
    this.#ys(i, t), this.#H(s) && this.#Ps(i, t, e.paused);
  }
  /**
   * Take in pictures until the history holds the successor of every picture
   * whose outputs are due within the lookahead of `time`, the media time of
   * the refresh being filled.
   */
  #ys(e, t) {
    const i = this.#J, s = xt * this.#T * Math.max(1, t) / 1e3;
    for (this.#ei(e); ; ) {
      const o = this.#we[0];
      if (o === void 0 || o.timestamp > e + s + o.duration || (o.width === this.#G && o.height === this.#Y ? this.#ki() : T) < this.#Rs(o))
        break;
      if (this.#we.shift(), this.#Ds(o, e, t), !this.#H(i)) return;
      this.#ei(e);
    }
    if (!this.#Ue || this.#rt || this.#we.length > 0 || this.#ki() < this.#Bi())
      return;
    const r = this.#Fe[this.#F], h = I * t / 1e3;
    (this.#Yt || r.timestamp <= e + h) && (this.#ti(!0, e, t), this.#rt = !0);
  }
  /** Output slots a filtered picture takes. A repeated first field shares the first one's. */
  #Bi() {
    return this.#k && !this.#$ ? 2 : 1;
  }
  /** Output slots taking `picture` in can fill. */
  #Rs(e) {
    const t = !e.interlaced || !this.#De;
    return (this.#Ue ? this.#Bi() : 0) + (t ? 1 : 0);
  }
  /** Whether an output slot holds nothing still wanted. */
  #Li(e) {
    const t = this.#a[e];
    if (t === void 0) return !1;
    const i = this.#l;
    if (i?.kind === "texture" && i.texture === t.texture || this.#de?.slot === e || this.#Ge?.slot === e)
      return !1;
    for (const s of this.#Oe)
      if (s.slot === e) return !1;
    return !0;
  }
  #ki() {
    let e = 0;
    for (let t = 0; t < this.#a.length; t++)
      this.#Li(t) && e++;
    return e;
  }
  /** The next free output slot round the ring, or null. */
  #Ui() {
    for (let e = 1; e <= T; e++) {
      const t = (this.#c + e) % T;
      if (this.#Li(t)) return t;
    }
    return null;
  }
  /**
   * Take a decoded picture into the history and filter the picture before it,
   * which has its successor now.
   */
  #Ds(e, t, i) {
    const s = this.#Qt ? this.#Fe[this.#F] : null, r = s === null ? 0 : s.timestamp + s.duration, h = e.width !== this.#G || e.height !== this.#Y, o = s === null || h || e.timestamp < r - N || e.timestamp - r > $, a = !o && e.timestamp - r > N, u = !e.interlaced || !this.#De, A = this.#Ue, f = this.#rt;
    this.#Ue = !1, this.#rt = !1, A && !f && (o || u) && !h && this.#ti(!0, t, i), o ? (s !== null && this.#g.discontinuities++, this.#y = 0, this.#V(), this.#z = 0) : s !== null && !u && s.interlaced && s.topFieldFirst !== e.topFieldFirst && this.#V(!0);
    const d = performance.now();
    this.#di(d), this.#Ke = d;
    const l = this.#J, c = this.#_t(!1);
    try {
      if (h && (this.#Ei(e.width, e.height), this.#a.length !== T))
        throw new Error("decoded pictures have no output textures");
      this.#_s(e);
    } catch (m) {
      this.#me(c), this.#yt(
        m instanceof Error ? m.message : String(m)
      ), this.stop();
      return;
    } finally {
      this.#oe(e.data);
    }
    if (u)
      e.interlaced || (this.#z > 0 && this.#z--, this.#it = !0), this.#Ms(), this.#y = 0;
    else {
      if (A && !o) {
        const m = this.#Fe[(this.#F + x - 1) % x];
        this.#jt = m.topFieldFirst, this.#Gi(), this.#H(l) && this.#Xi(
          a ? 1 : 0,
          Math.round(m.timestamp * 1e3),
          this.#k
        ), this.#H(l) && this.#ti(!1, t, i);
      } else
        this.#Ht = a;
      this.#it = !1, this.#Ue = !0;
    }
    if (!this.#H(l)) {
      this.#j || this.#me(c);
      return;
    }
    this.#me(c), this.#be += performance.now() - d, this.#ne++, this.#mi(d);
  }
  /** Convert a decoded picture into the next history slot. */
  #_s(e) {
    this.#F = (this.#F + 1) % x, this.#st.convert(e, this.#h[this.#F]);
    const t = this.#Fe[this.#F];
    t.timestamp = e.timestamp, t.duration = e.duration, t.interlaced = e.interlaced, t.topFieldFirst = e.topFieldFirst, t.repeatFirstField = e.repeatFirstField, this.#y = Math.min(this.#y + 1, x), this.#Qt = !0;
  }
  /** Queue the newest picture as it is, both fields woven. */
  #Ms() {
    const e = this.#Fe[this.#F], t = this.#Ui();
    if (t === null) {
      this.#g.late++;
      return;
    }
    this.#c = t, this.#Vi(
      this.#h[this.#F],
      !0,
      this.#a[t].framebuffer
    ), this.#Oe.push({
      slot: t,
      time: e.timestamp,
      picture: e.timestamp,
      end: e.timestamp + e.duration,
      start: !0,
      scan: oe(e)
    });
  }
  /**
   * Filter the waiting picture into its outputs: against its successor, or
   * against itself with `flush`. Each output is queued at its own media time:
   * a field at its field's time, a film frame at its place in the film
   * cadence, one picture a frame at the first field's time.
   */
  #ti(e, t, i) {
    const s = this.#Fe[e ? this.#F : (this.#F + x - 1) % x], r = this.#Oe;
    for (; r.length > 0 && r.at(-1).picture === s.timestamp; )
      r.pop();
    this.#jt = s.topFieldFirst;
    const h = e ? Number.POSITIVE_INFINITY : this.#Fe[this.#F].timestamp, o = oe(s), a = s.timestamp + s.duration;
    let u = !1;
    if (this.#$ && !e) {
      const A = this.#X.phase;
      if (A === X) {
        this.#Et++;
        return;
      }
      const f = s.timestamp + (he[A] ?? 0) * s.duration;
      u = this.#ii(
        f,
        f + s.duration * O / ne,
        h,
        s.timestamp,
        a,
        !0,
        !1,
        null,
        e,
        o,
        t,
        i
      ) !== null;
    } else if (!this.#k)
      u = this.#ii(
        s.timestamp,
        h,
        h,
        s.timestamp,
        a,
        !0,
        !1,
        null,
        e,
        o,
        t,
        i
      ) !== null;
    else {
      const A = s.repeatFirstField ? 3 : 2, f = s.duration / A;
      let d = null;
      for (let l = 0; l < A; l++) {
        const c = s.timestamp + l * f, m = this.#ii(
          c,
          l + 1 < A ? c + f : h,
          h,
          s.timestamp,
          a,
          l === 0,
          l === 1,
          l === 2 ? d : null,
          e,
          o,
          t,
          i
        );
        l === 0 && (d = m), m !== null && (u = !0);
      }
    }
    !u && h <= t && this.#Pi(a);
  }
  /**
   * Filter one output into a slot and queue it for `at`, unless it can never
   * be shown. `until` is when the output after it is due and `pictureUntil`
   * when the next picture is; `picture` and `pictureEnd` are the picture's
   * own time and end. `slot` is a slot already holding the same field.
   * Returns the slot, or null.
   */
  #ii(e, t, i, s, r, h, o, a, u, A, f, d) {
    if (!this.#Ss(e, t, i, f, d))
      return this.#Pt(t) && this.#g.late++, null;
    if (a === null) {
      if (a = this.#Ui(), a === null)
        return this.#g.late++, null;
      this.#c = a, this.#Ee(u, o, this.#a[a].framebuffer);
    }
    return this.#Oe.push({
      slot: a,
      time: e,
      picture: s,
      // A film frame is due past the time of the picture after it.
      end: Number.isFinite(i) ? Math.max(t, i) : r,
      start: h,
      scan: A
    }), a;
  }
  /**
   * Whether an output due from `at` until `until` can be shown. A refresh
   * shows the newest output due by then, so one whose successor is due before
   * the next refresh after `at` is never seen: at rates the display cannot
   * keep up with, or after it was due. Refreshes are predicted from `time`,
   * the media time of the coming one, with a margin for the hysteresis.
   * While the clock stands still every output of a current picture is kept,
   * since a paused element shows its picture's first field.
   */
  #Ss(e, t, i, s, r) {
    if (r === 0) return i > s;
    const h = 2 * I * r / 1e3;
    if (t <= s - h) return !1;
    const o = this.#T * r / 1e3;
    if (t - e + 2 * h >= o) return !0;
    const a = Math.max(0, Math.ceil((e - h - s) / o));
    return s + a * o < t + h;
  }
  /**
   * Put up the output the coming refresh should show.
   *
   * Playing, that is the newest output due by `time`. Where an output's time
   * is within the hysteresis of `time`, the refresh advances by as many
   * outputs as the last one did if it can, so that the one slip a field rate
   * the refresh does not divide into must make happens once rather than
   * flapping. Paused, it is the first output of the picture `time` falls in.
   */
  #Ps(e, t, i) {
    const s = this.#Oe;
    let r = 0;
    for (; r < s.length && !this.#Mi(s[r].end); ) r++;
    r > 0 && s.splice(0, r);
    let h = -1;
    if (i) {
      for (let a = 0; a < s.length && s[a].picture <= e; a++)
        s[a].start && (h = a);
      if (h < 0) {
        const a = this.#de, u = this.#Ge;
        let A = a !== null && a.picture <= e ? a : null;
        u !== null && u.picture <= e && (A === null || u.picture > A.picture) && (A = u), A !== null && A !== this.#bt && this.#Oi(A);
        return;
      }
      this.#nt = 1;
    } else {
      let a = 0;
      for (; a < s.length && s[a].time <= this.#Zt; )
        a++;
      const u = I * t / 1e3;
      let A = 0, f = 0;
      for (let l = a; l < s.length; l++) {
        const c = e - s[l].time;
        if (c >= u) A++;
        else if (c >= -u) f++;
        else break;
      }
      const d = Math.min(Math.max(this.#nt, A), A + f);
      if (this.#nt = d, d === 0) {
        s.splice(0, a);
        return;
      }
      h = a + d - 1;
      for (let l = a; l < h; l++)
        this.#Pt(s[l + 1].time) && this.#g.late++;
    }
    const o = s[h];
    s.splice(0, h + 1), this.#Oi(o);
  }
  #Oi(e) {
    const t = performance.now(), i = this.#_t(!0);
    this.#ci(e.slot), this.#me(i), this.#Pe += performance.now() - t, this.#xe++, this.#bt = e, this.#Zt = e.time, !(e === this.#de || e === this.#Ge) && (e.start || this.#de?.picture !== e.picture) && (this.#Ge = this.#de, this.#de = e.start ? e : null);
  }
  /** Take one input into the shared history and decide its YADIF or IVTC presentation. */
  #Ct(e, t) {
    const i = this.#J;
    if (this.#H(i) && (this.#Cs(t.mediaTime), !!this.#H(i) && t.width > 0 && t.height > 0)) {
      let s = !1;
      if (!this.#Ye && this.#e.seeking) {
        const c = this.#e.buffered, m = this.#I >= ie ? this.#I / 1e3 : U / 1e3;
        for (let E = 0; E < c.length; E++)
          if (t.mediaTime >= c.start(E) && t.mediaTime < c.end(E) && Math.abs(t.mediaTime - this.#e.currentTime) <= m) {
            s = !0;
            break;
          }
      }
      if (s && (this.#Ye = !0), (this.#G === 0 || this.#Y === 0) && this.#Ei(t.width, t.height), !this.#H(i)) return;
      if (this.#N && !this.#N.interlaced) {
        const c = performance.now();
        this.#di(c), this.#Ke = c, this.#z > 0 && this.#z--, this.#it = !0, this.#Us(), this.#be += performance.now() - c, this.#ne++, this.#xe++, this.#mi(c);
        return;
      }
      const r = t.mediaTime - this.#Ve, h = t.mozTiming, o = s || (h ? h.discontinuity || r < 0 || r > $ : r < 0 || r > $);
      o && (this.#y = 0, this.#I = 0, this.#g.discontinuities++, this.#L(), this.#V(), (s || !this.#it) && (this.#z = 0)), this.#it = !1;
      const a = this.#Os(t.presentedFrames, o);
      if (this.#y > 0 && t.mediaTime === this.#Ve && (!h || t.presentedFrames === this.#Lt))
        return;
      if (!o) {
        const c = h?.periodMs ?? 0;
        c > 0 ? this.#zi(
          c * (this.#e.playbackRate || 1) / 1e3,
          1
        ) : this.#y > 0 && r > 0 && this.#zi(r, a + 1);
      }
      this.#Ve = t.mediaTime, this.#Lt = t.presentedFrames;
      const u = performance.now();
      this.#di(u), this.#Ke = u;
      const A = performance.now(), f = this.#_t(!1);
      if (this.#Yi(), this.#Gi(), !this.#H(i)) {
        this.#j || this.#me(f);
        return;
      }
      if (this.#Xi(
        a,
        t.presentedFrames,
        this.#k && this.#lt()
      ), !this.#H(i)) {
        this.#j || this.#me(f);
        return;
      }
      const l = this.#fs(t, e) + this.#T;
      if (this.#$)
        if (this.#lt()) {
          const c = this.#X.phase;
          if (c === X)
            this.#Et++, this.#Q++;
          else {
            const m = this.#I * O / ne, E = this.#ni(1, e, m), b = he[c] ?? 0, v = E || this.#ae === null ? l + m : l + b * this.#I;
            this.#It(
              "film",
              !1,
              this.#si("film", v, m),
              m
            );
          }
        } else
          this.#Ee(!1, !1, null);
      else if (this.#k && this.#lt()) {
        const c = this.#I / 2, E = this.#ni(2, e, c) || this.#ae === null ? l + c * 2 : l, b = this.#si("field", E, c);
        this.#It("field", !1, b, c), this.#It("field", !0, b + c, c);
      } else if (this.#lt()) {
        const c = this.#I, E = this.#ni(1, e, c) || this.#ae === null ? l + c : l;
        this.#It(
          "frame",
          !1,
          this.#si("frame", E, c),
          c
        ) || (this.#g.late++, this.#Ee(!1, !1, null));
      } else
        this.#g.late += this.#r.length, this.#L(), this.#Ee(!1, !1, null);
      this.#fe = Math.max(
        this.#fe,
        this.#r.length
      ), this.#me(f), this.#be += performance.now() - A, this.#ne++, this.#mi(u);
    }
  }
  /** Rebuild the detector a retry point stood the engine back up for. */
  #Gi() {
    if (this.#U && !this.#Te && !this.#n)
      try {
        this.#Fi();
      } catch (e) {
        this.#Rt(
          `film detector unavailable: ${e instanceof Error ? e.message : String(e)}`
        );
      }
  }
  /**
   * Run the pulldown detection for the frame behind the newest, which is the
   * one about to be filtered. `missed` is how many frames went unseen before
   * the newest, `frame` labels the debug overlay, and `secondFields` is
   * whether the frame's second field is drawn too.
   */
  #Xi(e, t, i) {
    if (this.#mt = !1, this.#ge = !1, this.#Wt = !1, this.#U && !this.#Te) {
      let s = !1;
      if (this.#y === x && e === 0)
        try {
          this.#us(), this.#As(), s = !0;
        } catch (r) {
          this.#Rt(
            `film detection failed: ${r instanceof Error ? r.message : String(r)}`
          );
        }
      else
        this.#V(!0);
      this.#pt[this.#X.phase] = (this.#pt[this.#X.phase] ?? 0) + 1, this.#$ = this.#X.phase !== 0 && this.#X.run >= Z, this.#$ ? this.#z = bt : this.#z > 0 && this.#z--, this.#mt = s && !this.#Ht, this.#ge = this.#mt && this.#z > 0, this.#Wt = this.#ge && !this.#$ && i && this.#ls(), this.#ge && !this.#$ && this.#g.matched++, this.#re && (this.#vi = this.#cs(t));
    }
    this.#Ht = e > 0;
  }
  #H(e) {
    return !this.#j && this.#P && e === this.#J;
  }
  #Cs(e) {
    const t = this.#J;
    let i;
    for (let h = this.#_e.length - 1; h >= 0; h--) {
      const o = this.#_e[h];
      if (o.start <= e + 1e-6) {
        i = o;
        break;
      }
    }
    if (i?.codedSize && (i.codedSize.width !== this.#G || i.codedSize.height !== this.#Y) && this.#Ei(i.codedSize.width, i.codedSize.height), !this.#H(t)) return;
    const s = i?.scan;
    if (!s || this.#N?.interlaced === s.interlaced && this.#N.topFieldFirst === s.topFieldFirst)
      return;
    const r = this.#N?.interlaced;
    this.#N = s, this.#y = 0, this.#L(), this.#ze() && (r !== s.interlaced && (this.#I = 0), s.interlaced && (this.#C || this.#w === "main") ? this.#ye() : this.#hi(), this.#V());
  }
  /**
   * Whether pictures are being filtered ahead of time and queued, rather than
   * drawn as their frame arrives.
   *
   * A picture for every frame has nothing to schedule -- there is one of them
   * and it goes up now -- and neither has a filter that has yet to see two
   * frames go by, since until then there is no idea how long a frame lasts.
   */
  #lt() {
    return (this.#k || this.#U) && this.#I > 0 && this.#a.length === T;
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
  #zi(e, t) {
    const s = e * 1e3 / (this.#e.playbackRate || 1) / t;
    s < ie || s > U || (this.#I = this.#I > 0 && s > this.#I * ft ? this.#I + (s - this.#I) * lt : s);
  }
  /**
   * Filter one field into an output texture and put it in the queue.
   *
   * The three frames the filter reads are only the right three between one
   * frame arriving and the next, so both fields of a frame are built here and
   * held as pictures. What is queued after that is a copy waiting for a
   * moment, which no later frame can take away.
   */
  #It(e, t, i, s) {
    const r = this.#Wi();
    if (r === null) return !1;
    const h = this.#a[r];
    if (!h) return !1;
    for (this.#c = r; this.#r.length > 0 && this.#r[0]?.slot === r; )
      this.#r.shift(), this.#g.late++;
    this.#Ee(!1, t, h.framebuffer);
    const o = {
      slot: r,
      at: i,
      duration: s,
      cadence: e,
      phase: e === "film" ? this.#X.phase : e === "field" ? t ? 2 : 1 : 0,
      droppedBefore: this.#Q
    };
    return this.#Q = 0, this.#r.push(o), this.#ae = o, !0;
  }
  /**
   * When a picture goes up: one duration after the last one of its cadence,
   * nudged towards the clock by a fraction of the gap so that the schedule
   * follows it without a picture ever moving across a refresh. (otya)
   *
   * `ideal` is when this frame would go up if it were the only one. Frames
   * do not arrive evenly. Where the frame period and the refresh nearly
   * divide, a frame arrives a refresh early or late now and then, and for
   * seconds at a time while the two drift past each other. An early frame is
   * harmless because its pictures wait. A late frame has missed its moment,
   * so the chain restarts from where the frame is. That costs a refresh with
   * nothing new to show, which cannot be avoided. The cost should be paid
   * only once. The frames after it arrive on time, which now counts as a
   * refresh early, and pulling the chain back to them would skip a picture to
   * undo a delay nobody sees. So the chain keeps the lateness it was pushed
   * to (`#scheduleLag`), treats frames that arrive at that phase as on time,
   * and puts frames that are late by no more than the lag covers on the chain.
   *
   * Frames arrive on refreshes. At whatever phase a frame arrives, the
   * remainder of its distance from the chain after removing whole refreshes
   * is the chain's own drift against the refresh grid, and each frame
   * corrects part of it. The lag is kept in whole refreshes for the same
   * reason. A chain held half a refresh off the grid makes each pair of
   * fields come due together, and one of each pair is dropped.
   *
   * The lag follows what frames actually do. If no frame arrives at the
   * lag's phase within SCHEDULE_WINDOW pictures, the lag moves to the nearest
   * phase they did arrive at. If that phase is earlier than the chain allows
   * for, the chain moves up to it, which skips one picture. A frame more than
   * a refresh off on either side is not jitter, and the chain restarts from
   * the clock.
   */
  #si(e, t, i) {
    if (!(i > 0)) return t;
    const s = this.#ae, r = this.#T;
    if (s !== null && s.cadence === e) {
      const h = s.at + s.duration, o = h - t, a = Math.round(o / r), u = a - this.#K, A = o - a * r;
      if (a >= 0 && u <= 1) {
        const f = h + Math.max(
          -se,
          Math.min(se, -A * dt)
        );
        if (u === 0)
          return this.#O = 0, f;
        if (this.#O === 0 || u > 0 != this.#Z > 0 ? (this.#O = 0, this.#Z = u) : Math.abs(u) < Math.abs(this.#Z) && (this.#Z = u), ++this.#O < mt) return f;
        const d = this.#Z;
        return this.#O = 0, d < 0 ? (this.#K += d, f) : (this.#g.resynced++, this.#ri(f - d * r));
      }
      if (a < 0 && this.#K - a <= 1)
        return this.#K -= a, this.#O = 0, this.#g.resynced++, this.#ri(t);
    }
    return this.#K = 0, this.#O = 0, s !== null && this.#g.resynced++, this.#ri(t);
  }
  /** Start the chain again at `at`, which is where the caller's picture goes. */
  #ri(e) {
    for (let t = this.#r.at(-1); t && t.at >= e; )
      this.#r.pop(), this.#g.late++, t = this.#r.at(-1);
    return e;
  }
  /** Make room without treating ordinary capacity pressure as clock divergence. */
  #ni(e, t, i) {
    const s = this.#r.at(-1), r = (Y + 1) * Math.max(this.#T, i);
    if (s && s.at - t > r)
      return this.#L(), this.#g.queueResetted++, !0;
    const h = Math.max(
      0,
      this.#r.length + e - Y
    );
    let o = 0, a = 0;
    for (; a < h; ) {
      const u = this.#r.shift();
      if (!u) break;
      o += u.duration, a++;
    }
    for (const u of this.#r) u.at -= o;
    return this.#g.late += a, !1;
  }
  /** Select an output whose pixels are not still represented by the canvas or queue. */
  #Wi() {
    const e = this.#l?.kind === "texture" ? this.#l.texture : null, t = new Set(this.#r.map(({ slot: s }) => s));
    for (let s = 1; s <= T; s++) {
      const r = (this.#c + s) % T, h = this.#a[r];
      if (h && h.texture !== e && !t.has(r))
        return r;
    }
    const i = this.#r[0];
    if (i) {
      const s = this.#a[i.slot];
      if (s && s.texture !== e) return i.slot;
    }
    return null;
  }
  /** The loop that puts filtered fields up, and the only thing that draws. */
  #ye() {
    this.#x === null && (!this.#P || this.#ee || (this.#S = 0, this.#x = this.#He(this.#oi)));
  }
  #hi() {
    this.#Nt(this.#x), this.#x = null, this.#Ni(), this.#L();
  }
  #oi = (e) => {
    if (this.#x = null, !this.#P || this.#ee) return;
    this.#Is(e);
    const t = this.#J;
    if (this.#m)
      this.#C || this.#w === "main" ? this.#Fs() : this.#Ts();
    else {
      if (this.#u.flush(e), !this.#H(t)) return;
      this.#w === "main" && this.#Ls(this.#B, e);
    }
    this.#H(t) && (this.#x = this.#He(this.#oi));
  };
  /**
   * Fit a grid of refreshes (period and phase) to the animation frames. rAF
   * timestamps wander by a millisecond or so, which is more than the
   * nearest-refresh decision in #present can take; the grid is what it
   * compares against. A frame far off the grid restarts it. (otya)
   */
  #Is(e) {
    const t = e - this.#S;
    this.#S = e;
    const i = Math.max(1, Math.round(t / this.#T)), s = this.#B + i * this.#T, r = e - s;
    if (this.#B === 0 || t <= 0 || t > U || Math.abs(r) > this.#T / 4) {
      t >= 1 && t <= U && (this.#T = t), this.#B = e;
      return;
    }
    this.#T += r / i * pt, this.#B = s + r * Et;
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
  #Hi() {
    const e = this.#C;
    if (e)
      return { frames: e, origin: performance.timeOrigin };
    const t = this.#$i();
    return t === null ? { frames: Ft, origin: performance.timeOrigin } : { frames: t, origin: t.performance.timeOrigin };
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
  #He(e) {
    const { frames: t, origin: i } = this.#Hi(), s = t.requestAnimationFrame(
      (r) => e(this.#Mt(r, i))
    );
    return { frames: t, handle: s };
  }
  /** Timers of the window the loop's animation frames come from. */
  #Ns() {
    return this.#$i() ?? yt;
  }
  /** The window that composites the canvas, or null in none. */
  #$i() {
    return this.#i.ownerDocument?.defaultView ?? this.#e.ownerDocument?.defaultView ?? null;
  }
  /** Cancel a pending animation frame through the source that issued it. */
  #Nt(e) {
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
  #ai() {
    if (this.#C) return;
    this.#Bs(), this.#_ && this.#Si(this.#_.hidden);
    const { frames: e } = this.#Hi(), t = this.#x !== null && this.#x.frames !== e, i = this.#D !== null && this.#D.frames !== e;
    !t && !i || (this.#S = 0, t && (this.#Nt(this.#x), this.#x = this.#He(this.#oi)), i && (this.#Nt(this.#D), this.#D = this.#He(this.#ui)));
  }
  /** Watch the current document for visibility changes and DOM adoption. */
  #Bs() {
    const e = this.#C ? null : this.#i.ownerDocument ?? null;
    e !== this.#_ && (this.#_?.removeEventListener(
      "visibilitychange",
      this.#Ai
    ), this.#_ = e, e?.addEventListener("visibilitychange", this.#Ai), this.#q?.disconnect(), e && this.#q?.observe(e, { childList: !0, subtree: !0 }));
  }
  #Ai = () => {
    this.#j || this.#ai();
  };
  /** Deliver faster-playback captures even when a Worker owns the drawing loop. */
  #Bt() {
    this.#C || this.#m || this.#D !== null || !this.#u.captureDriven || !this.#P || this.#ee || (this.#D = this.#He(this.#ui));
  }
  /** Cancel the page's pending capture delivery. */
  #li() {
    this.#Nt(this.#D), this.#D = null;
  }
  /** Flush captured pictures on the refresh that will present them. */
  #ui = (e) => {
    if (this.#D = null, !this.#P || this.#ee) return;
    const t = this.#J;
    this.#u.flush(e), this.#H(t) && this.#u.captureDriven && (this.#D = this.#He(this.#ui));
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
  #Ls(e, t) {
    const i = this.#T / 2, s = (a) => {
      const u = a.at - e;
      return u <= i - I ? !0 : u > i + I ? !1 : this.#te > 0;
    };
    for (; this.#r[1] && s(this.#r[1]); )
      this.#g.late++, this.#r.shift();
    const r = this.#r[0];
    if (!r || !s(r)) return;
    this.#r.shift(), this.#te = r.at - e;
    const h = performance.now(), o = this.#_t(!0);
    this.#ci(r.slot), this.#me(o), this.#Pe += performance.now() - h, this.#xe++, this.#re && this.#ks(r, t), this.#ie = t;
  }
  /** Preserve upstream's opt-in presentation timing log in either renderer. */
  #ks(e, t) {
    const i = this.#ie === 0 ? 0 : t - this.#ie, s = i / this.#T, r = e.cadence === "film" ? `phase ${e.phase}` : e.cadence === "field" ? `field ${e.phase}` : "frame", h = e.phase === 0 ? "duplicate" : `phase ${X}`, o = e.droppedBefore > 0 ? `, ${h} dropped before it` + (e.droppedBefore > 1 ? ` (${e.droppedBefore})` : "") : "";
    console.log(
      `yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at - t).toFixed(2)} ms${o}`
    );
  }
  /** Copy one of the filtered pictures onto the canvas. */
  #ci(e) {
    const t = this.#a[e];
    t && this.#fi(t.texture);
  }
  /** Put a progressive frame through unchanged, keeping one display surface. */
  #Us() {
    this.#Yi();
    const e = this.#h[this.#F];
    e && this.#fi(e, !0), this.#y = 0;
  }
  /** Apply visibility on the page; a Worker reports only the desired state. */
  #pe(e) {
    if (this.#C) {
      this.#C.onVisibility(e);
      return;
    }
    this.#i.style.visibility = e ? "visible" : "hidden";
  }
  #fi(e, t = !1, i = !0) {
    this.#Vi(e, t, null), this.#l = { kind: "texture", texture: e, flip: t }, this.#pe(!0), i && this.#ue++;
  }
  /** Copy a texture onto the canvas or into an output. */
  #Vi(e, t, i) {
    const s = this.#s;
    s.bindFramebuffer(s.FRAMEBUFFER, i), s.useProgram(this.#f), s.activeTexture(s.TEXTURE0), s.bindTexture(s.TEXTURE_2D, e), s.uniform1i(this.#d, 0), s.uniform1i(this.#M, t ? 1 : 0), s.viewport(0, 0, this.#G, this.#Y), s.drawArrays(s.TRIANGLES, 0, 3);
  }
  /**
   * Account for the frames between this one and the last one seen.
   *
   * There is no event for a frame the callback was not run for; the only sign
   * of one is that the count of frames went up by more than one. That count
   * comes from the compositor where it provides one, and otherwise from
   * VideoFrames. Frames thrown away either side of a discontinuity are not
   * counted: the held frames were being dropped anyway, and a seek presents
   * what it passes over.
   *
   * Returns how many frames were missed between the last one and this one.
   */
  #Os(e, t) {
    let i = 0;
    return this.#qe !== 0 && !t && (i = Math.max(0, e - this.#qe - 1), this.#g.missed += i), this.#qe = e, i;
  }
  /**
   * Frames stopped arriving for a while -- a pause, a stall, a tab in the
   * background -- and a rate averaged over time nothing was asked of the
   * filter says nothing about it. Begin the interval at this frame.
   */
  #di(e) {
    e - this.#Ke <= te || (this.#ft = e, this.#ne = 0, this.#be = 0, this.#xe = 0, this.#Pe = 0, this.#fe = 0, this.#ue = 0, this.#Je = 0, this.#Ne = 0, this.#et = 0, this.#Be = 0);
  }
  #mi(e) {
    const t = e - this.#ft;
    if (t < te) return;
    const i = !this.#m && this.#lt() && (this.#k || this.#$) ? this.#xe : this.#ne, s = this.#ne ? (this.#be + this.#Pe) / this.#ne : 0;
    let r;
    this.#Ce != null && (r = 0, this.#Ne !== 0 && (r += this.#Je / 1e6 / this.#Ne), this.#Be !== 0 && (r += this.#et / 1e6 / this.#Be / 2));
    const h = {
      ...this.#g,
      // The element's own count of what its decoder could not keep up with,
      // which is the machine being behind rather than this filter.
      dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0,
      fps: i * 1e3 / t,
      frameMs: s,
      maxQueuedFields: this.#fe,
      outputFps: this.#ue * 1e3 / t,
      gpuMs: r,
      film: this.#$,
      oneInstant: this.#zt,
      filmError: this.#Te
    };
    this.dispatchEvent(new CustomEvent("stats", { detail: h })), this.#kt?.(h), this.#ft = e, this.#ne = 0, this.#be = 0, this.#xe = 0, this.#Pe = 0, this.#fe = 0, this.#ue = 0, this.#Je = 0, this.#Ne = 0, this.#et = 0, this.#Be = 0;
  }
  /** Take the newest frame into the ring. */
  #Yi() {
    const e = this.#s;
    this.#F = (this.#F + 1) % x;
    const t = this.#R, i = this.#h[this.#F];
    t !== null && this.#p !== null && i !== void 0 ? (this.#h[this.#F] = this.#p.adopt(t, i), this.#R = null) : (e.bindTexture(e.TEXTURE_2D, i ?? null), e.texImage2D(
      e.TEXTURE_2D,
      0,
      e.RGBA,
      e.RGBA,
      e.UNSIGNED_BYTE,
      this.#Me
    )), this.#y = Math.min(this.#y + 1, x);
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
  #Ee(e, t, i, s = !0) {
    if (this.#y === 0 || this.#ee) return;
    s && (this.#y === x && !e ? this.#g.filtered++ : this.#g.degraded++);
    const r = this.#s, { prev: h, cur: o, next: a } = this.#pi(e);
    r.bindFramebuffer(r.FRAMEBUFFER, i), r.useProgram(this.#A);
    for (const [m, E] of [h, o, a].entries())
      r.activeTexture(r.TEXTURE0 + m), r.bindTexture(r.TEXTURE_2D, this.#h[E] ?? null);
    r.uniform1i(this.#o.prev, 0), r.uniform1i(this.#o.cur, 1), r.uniform1i(this.#o.next, 2);
    const u = this.#U ? this.#n?.texture ?? null : null, A = this.#U ? this.#n?.combTexture ?? null : null, f = u !== null && A !== null;
    u !== null && A !== null && (r.activeTexture(r.TEXTURE0 + 3), r.bindTexture(r.TEXTURE_2D, u), r.uniform1i(this.#o.fieldMetrics, 3), r.activeTexture(r.TEXTURE0 + 4), r.bindTexture(r.TEXTURE_2D, A), r.uniform1i(this.#o.comb, 4));
    const d = this.#Wt ? this.#n?.combAheadTexture ?? null : null, l = f && !e;
    r.activeTexture(r.TEXTURE0 + 5), r.bindTexture(r.TEXTURE_2D, d), r.uniform1i(this.#o.combAhead, 5), r.activeTexture(r.TEXTURE0), r.uniform2i(this.#o.size, this.#G, this.#Y);
    const c = this.#wt ? 0 : 1;
    r.uniform1i(this.#o.parity, t ? 1 - c : c), r.uniform1i(this.#o.tff, this.#wt ? 1 : 0), r.uniform1i(this.#o.second, t ? 1 : 0), r.uniform1i(this.#o.spatialCheck, this.#se ? 1 : 0), r.uniform1i(this.#o.debug, this.#re ? 1 : 0), r.uniform1i(this.#o.film, f ? 1 : 0), r.uniform1i(
      this.#o.match,
      l && this.#ge && (!t || d !== null) ? 1 : 0
    ), r.uniform1i(this.#o.instant, l && this.#mt ? 1 : 0), r.uniform1i(this.#o.phase, this.#X.phase), r.viewport(0, 0, this.#G, this.#Y), r.drawArrays(r.TRIANGLES, 0, 3), this.#re && f && this.#as(this.#vi, 0, 90), i === null && (this.#l = { kind: "yadif", flush: e, second: t }, this.#pe(!0), s && this.#ue++);
  }
  #pi(e) {
    const t = (i) => (this.#F + x - i) % x;
    return this.#y === 1 ? { prev: this.#F, cur: this.#F, next: this.#F } : e ? { prev: t(1), cur: this.#F, next: this.#F } : this.#y === 2 ? { prev: t(1), cur: t(1), next: this.#F } : { prev: t(2), cur: t(1), next: this.#F };
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
  #$e() {
    if (this.#ai(), !this.#Ae) return;
    const e = this.#e, t = this.#m ? this.#ht : e.videoWidth, i = this.#m ? this.#ot : e.videoHeight;
    if (t === 0 || i === 0) return;
    const s = Math.min(
      e.offsetWidth / t,
      e.offsetHeight / i
    ), r = t * s, h = i * s;
    this.#i.style.left = `${e.offsetLeft + (e.offsetWidth - r) / 2}px`, this.#i.style.top = `${e.offsetTop + (e.offsetHeight - h) / 2}px`, this.#i.style.width = `${r}px`, this.#i.style.height = `${h}px`;
  }
  #Ei(e, t) {
    const i = this.#s;
    this.#t.width = e, this.#t.height = t, this.#G = e, this.#Y = t, this.#y = 0, this.#z = 0, this.#l = null, this.#L(), this.#$e();
    for (const s of this.#h) i.deleteTexture(s);
    this.#h = [];
    for (let s = 0; s < x; s++) {
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
      ), this.#h.push(r);
    }
    this.#ut(), (this.#k || this.#U || this.#m) && this.#Qi(), this.#st?.resize(e, t), this.#n?.resize(e, t), this.#ze();
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
  #Qi() {
    const e = this.#s;
    if (!(this.#a.length === T || this.#G === 0)) {
      this.#ut();
      for (let t = 0; t < T; t++) {
        const i = e.createTexture();
        e.bindTexture(e.TEXTURE_2D, i), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), e.texImage2D(
          e.TEXTURE_2D,
          0,
          e.RGBA,
          this.#G,
          this.#Y,
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
          e.deleteFramebuffer(s), e.deleteTexture(i), this.#ut();
          return;
        }
        this.#a.push({ texture: i, framebuffer: s });
      }
      this.#c = T - 1;
    }
  }
  #ut() {
    const e = this.#s, t = this.#l?.kind === "texture" ? this.#l.texture : null;
    this.#a.some((i) => i.texture === t) && (this.#l = null), this.#bt = null, this.#de = null, this.#Ge = null;
    for (const { texture: i, framebuffer: s } of this.#a)
      e.deleteFramebuffer(s), e.deleteTexture(i);
    this.#a = [], this.#L();
  }
  /**
   * Wrap the element in a `<div>` of this one's own and put the canvas over
   * it. The wrapper is what the canvas is positioned against; moving the
   * element out of the tree and back within the one task leaves playback
   * alone, which is what makes turning this on mid-stream free.
   */
  #Gs() {
    if (this.#Ae) return;
    const e = this.#e.parentElement;
    if (!e) return;
    const t = document.createElement("div");
    t.style.cssText = "position:relative;display:inline-block;line-height:0;max-width:100%", e.insertBefore(t, this.#e), t.appendChild(this.#e), t.appendChild(this.#i), this.#Ae = t, this.#le?.observe(this.#e), this.#$e();
  }
  #Xs() {
    if (this.#C) return;
    const e = this.#Ae;
    this.#Ae = null, this.#le?.disconnect(), this.#i.remove(), e?.parentElement && (e.parentElement.insertBefore(this.#e, e), e.remove());
  }
  #Zi = () => this.#$e();
  /** Forward a media event with the page's playback state that gives it meaning. */
  #Re(e) {
    return !this.#b || this.#w === "main" ? !1 : (this.#b.postMessage({
      type: "event",
      name: e,
      video: this.#We()
    }), !0);
  }
  #ji = () => {
    if (this.#m) {
      this.#W.hold(), this.#Re("emptied");
      return;
    }
    if (this.#Re("emptied")) {
      this.#he(), this.#pe(!1);
      return;
    }
    this.#y = 0, this.#Ve = 0, this.#Lt = 0, this.#L(), this.#V(), this.#z = 0, this.#I = 0, this.#qi(), this.#l = null, this.#pe(!1);
  };
  #qi() {
    this.#g = {
      filtered: 0,
      missed: 0,
      degraded: 0,
      discontinuities: 0,
      resynced: 0,
      late: 0,
      queueResetted: 0,
      matched: 0
    }, this.#Kt = 0, this.#Jt = 0, this.#pt.fill(0), this.#Et = 0, this.#qe = 0, this.#ft = 0, this.#Ke = 0, this.#ne = 0, this.#be = 0, this.#xe = 0, this.#Pe = 0, this.#fe = 0, this.#ue = 0, this.#L(), this.#Je = 0, this.#Ne = 0, this.#et = 0, this.#Be = 0;
  }
  /**
   * A new seek invalidates any destination frame remembered for the last one.
   */
  #Ki = () => {
    if (this.#m) {
      this.#W.hold(), this.#Re("seeking");
      return;
    }
    if (this.#Re("seeking")) {
      this.#he();
      return;
    }
    this.#Ye = !1;
  };
  /**
   * Playback stopped, so the frame being held back goes up now. One picture,
   * whatever the rate: a still frame stands for a moment, and the moment is
   * the one the first field was taken at.
   */
  #ve = (e) => {
    if (this.#m) {
      this.#W.hold(), this.#Re(
        e.type
      );
      return;
    }
    if (e.type === "ratechange" && (this.#u.captureDriven ? this.#Bt() : this.#li()), (e.type === "pause" || e.type === "ended" || e.type === "seeked" || e.type === "ratechange") && this.#Re(e.type)) {
      this.#he();
      return;
    }
    if (e.type === "seeked") {
      const i = this.#Ye;
      if (this.#Ye = !1, i) return;
      this.#y = 0, this.#L(), this.#V(), this.#l = null, this.#pe(!1);
      return;
    }
    const t = e.type === "ratechange";
    if (t && (this.#I = 0, this.#Ve = this.#e.currentTime), this.#L(), this.#P && this.#y > 0) {
      const i = this.#Wi(), s = i === null ? void 0 : this.#a[i];
      i !== null && s ? (this.#c = i, this.#Ee(!0, !1, s.framebuffer), this.#ci(i)) : this.#Ee(!0, !1, null);
    }
    t && (this.#y = 0, this.#qe = 0, this.#V());
  };
  /** The element ran out of data. Its readings stop moving until it has more. */
  #Ji = () => {
    this.#m && (this.#W.hold(), this.#Re("waiting"));
  };
  /**
   * A lost context takes the textures and the program with it. Rebuilding
   * them is possible, but a page that has lost its context has bigger
   * problems; getting out of the way leaves the element's own picture showing.
   */
  #es = (e) => {
    if (e.preventDefault(), this.#C) {
      this.#C.onFailure("the deinterlacer WebGL context was lost");
      return;
    }
    this.#w !== "active" && (this.#ee = !0, this.#yt("the deinterlacer WebGL context was lost"), this.stop());
  };
}
function ae(n, e) {
  const t = n.createProgram(), i = Ae(n, n.VERTEX_SHADER, ct), s = Ae(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(t, i), n.attachShader(t, s), n.linkProgram(t), n.deleteShader(i), n.deleteShader(s), !n.getProgramParameter(t, n.LINK_STATUS)) {
    const r = n.getProgramInfoLog(t);
    throw n.deleteProgram(t), new Error(
      `the deinterlacer failed to link: ${r ?? "no reason given"}`
    );
  }
  return t;
}
function Ae(n, e, t) {
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
const le = "data:video/mp4;base64,AAAAHGZ0eXBpc281AAACAGlzbzVpc282bXA0MQAAAu9tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAB8nRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAFoAAABDgAAAAAAY5tZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAHUwAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAE5bWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAA+XN0YmwAAACtc3RzZAAAAAAAAAABAAAAnWF2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAFoAQ4AEgAAABIAAAAAAAAAAEVTGF2YzYxLjE5LjEwMSBsaWJ4MjY0AAAAAAAAAAAAAAAY//8AAAA3YXZjQwFkACn/4QAZZ2QAKazZQFoET94CIAAAfSAAHUwD4sWywAEAB2j5KBLLIsD9+PgAAAAAEHBhc3AAAAABAAAAAQAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAAKG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAAAAAAAAAAAAAAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuNy4xMDAAAACYbW9vZgAAABBtZmhkAAAAAAAAAAEAAACAdHJhZgAAABx0ZmhkAAIAOAAAAAEAAAPpAAAEJwEBAAAAAAAUdGZkdAEAAAAAAAAAAAAAAAAAAEh0cnVuAAAKBQAAAAYAAACgAgAAAAAABCcAAAfSAAAAQgAAE40AAAA/AAAH0gAAAgAAAAAAAAAARAAAA+kAAAG7AAAH0gAACK9tZGF0AAACrwYF//+r3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTQgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDEzMyBtZT11bWggc3VibWU9MTAgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0yNCBjaHJvbWFfbWU9MSB0cmVsbGlzPTIgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xNSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9dGZmIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTIgYl9iaWFzPTAgZGlyZWN0PTMgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0wIGtleWludD0zMCBrZXlpbnRfbWluPTMgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD0zMCByYz1jcmYgbWJ0cmVlPTEgY3JmPTguMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAUGAQEygAAAAWdliIICAj/+/76ivgU3edyfbbnP6kzu1BfFPXa9rMu/FCi/GMk76JT20AAAAwAAAwAAAwAAAwAAAwAAAwEJmrWZnq7KhXxVTgAAAwAAAwAAAwAABJ9gAAADAAAKtgAAAwAAAwCi4AAAAwAAHQgAAAMAAAiqAAADAAADA7EAAAMAAAMCCgAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAL+QAAAAUGAQEygAAAADVBmiIWQj/51kP//f3t2AAPsAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAS8AAAAAUGAQEygAAAADJBnkETiEf/hv/80gAJcAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAkIQAAAAUGAQEygAAAAfMBnmCTRCP/9ZJR/1zH/6vL5qeSOTmASFdQlObW+4YAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAxvEAAAAwAAAwAAAwAAE4wAAAMAAAMAAAMAAFuAAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAMuAAAAABQYBATKAAAAANwGeYZakI//1bXH/Een/+rAALngAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAN+EAAAAFBgEBMoAAAAGuQZpileloiEf/2XyP/Fn/6mXyw21/v4X7ly3FFO60AAADAAADAAADAAADAAADAAADAAADADKWVJAQiFeS9HQZhFSJuVc/HAAAAwAAAwAAAwAAAwAAAwAAAwAAj8AAAAMAAAMABTIAAAMAAAMAAD+QAAADAAADAAQkAAADAAADAABJgAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAXUQAAAENtZnJhAAAAK3RmcmEBAAAAAAAAAQAAAAAAAAABAAAAAAAAB9IAAAAAAAADCwEBAQAAABBtZnJvAAAAAAAAAEM=", Rt = 0.5, Dt = 3e3, ue = 0.1, _ = 16, ce = 'video/mp4; codecs="avc1.640029"';
let Q = null;
function _t(n = {}) {
  return Q ??= Mt(n), Q;
}
async function Lt(n = {}) {
  return (await _t(n)).deinterlaces;
}
function kt() {
  Q = null;
}
async function Mt(n) {
  const e = n.tolerance ?? Rt, t = n.timeoutMs ?? Dt, i = performance.now(), s = (o) => ({
    deinterlaces: !1,
    survives: null,
    tookMs: performance.now() - i,
    error: o instanceof Error ? o.message : String(o)
  });
  if (typeof document > "u")
    return s(new Error("there is no document to decode in"));
  const r = document.createElement("video");
  r.muted = !0, r.defaultMuted = !0, r.playsInline = !0, r.preload = "auto";
  let h = null;
  try {
    h = Pt(r, t);
    const o = W(z(r, "loadeddata"), t), a = r.play().then(
      () => !0,
      () => !1
    );
    if (await h.ready, await o, await Ct(r, t, await a), r.videoWidth === 0 || r.videoHeight === 0)
      return s(new Error("the probe clip decoded to nothing"));
    const u = It(r);
    return {
      deinterlaces: u < 1 - e,
      survives: u,
      tookMs: performance.now() - i
    };
  } catch (o) {
    return s(o);
  } finally {
    r.pause(), r.removeAttribute("src"), r.replaceChildren(), r.load(), h && URL.revokeObjectURL(h.url);
  }
}
const V = typeof MediaSource > "u" ? globalThis.ManagedMediaSource : MediaSource, St = typeof MediaSource > "u";
function Pt(n, e) {
  if (!V || !V.isTypeSupported(ce))
    throw new Error("the probe clip needs Media Source Extensions");
  const t = le.indexOf(","), i = atob(le.slice(t + 1)), s = new Uint8Array(i.length);
  for (let a = 0; a < i.length; a++) s[a] = i.charCodeAt(a);
  const r = new V(), h = URL.createObjectURL(r);
  if (St) {
    n.disableRemotePlayback = !0;
    const a = document.createElement("source");
    a.type = "video/mp4", a.src = h, n.append(a), n.load();
  } else
    n.src = h;
  const o = (async () => {
    await W(z(r, "sourceopen"), e);
    const a = r.addSourceBuffer(ce), u = W(z(a, "updateend"), e);
    a.appendBuffer(s), await u, r.endOfStream();
  })();
  return { url: h, ready: o };
}
async function Ct(n, e, t) {
  if (t) {
    const i = performance.now();
    for (; n.currentTime < ue && performance.now() - i < e; )
      await new Promise((s) => requestAnimationFrame(s));
    n.pause();
  } else
    n.currentTime = ue, await W(z(n, "seeked"), e);
}
function It(n) {
  const e = n.videoHeight, t = document.createElement("canvas");
  t.width = _, t.height = e;
  const i = t.getContext("2d", { willReadFrequently: !0 });
  if (!i) throw new Error("there is no 2d context to read the clip with");
  i.imageSmoothingEnabled = !1, i.drawImage(n, 0, 0, _, e);
  const s = i.getImageData(0, 0, _, e).data, r = (A) => {
    let f = 0;
    for (let d = 0; d < _; d++)
      f += s[(A * _ + d) * 4 + 1] ?? 0;
    return f / _;
  };
  let h = 0;
  const o = 2, a = e - 3;
  let u = r(o);
  for (let A = o + 1; A <= a; A++) {
    const f = r(A);
    h += Math.abs(f - u), u = f;
  }
  return h / (a - o) / 255;
}
function z(n, e) {
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
function W(n, e) {
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
At(be);
export {
  Bt as Deinterlacer,
  ze as YADIF_FRAGMENT_SHADER,
  Xe as YADIF_UNIFORMS,
  Lt as decoderDeinterlaces,
  kt as forgetDecoderProbe,
  _t as probeDecoder,
  Nt as supportsDeinterlace
};
//# sourceMappingURL=index.js.map
