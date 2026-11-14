const me = "" + new URL("assets/worker-DCiHVpUg.js", import.meta.url).href, M = `#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;
function F(n, e, t) {
  const i = n.createProgram(), s = Q(n, n.VERTEX_SHADER, t), r = Q(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(i, s), n.attachShader(i, r), n.linkProgram(i), n.deleteShader(s), n.deleteShader(r), !n.getProgramParameter(i, n.LINK_STATUS)) {
    const h = n.getProgramInfoLog(i);
    throw n.deleteProgram(i), new Error(
      `the deinterlacer failed to link: ${h ?? "no reason given"}`
    );
  }
  return i;
}
function Q(n, e, t) {
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
const pe = `#version 300 es
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
`, Ee = `#version 300 es
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
function ve(n, e) {
  const t = F(n, pe, Ee), i = n.getAttribLocation(t, "aVertexPosition"), s = n.getAttribLocation(t, "aTextureCoord"), r = n.getUniformLocation(t, "uTexture"), h = n.getUniformLocation(t, "uMatrix"), o = n.getUniformLocation(t, "uUvMatrix"), a = n.getUniformLocation(t, "uTextColor"), u = n.getUniformLocation(t, "uBackColor");
  if (r == null || h == null || o == null || a == null || u == null)
    throw new Error(
      "failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER"
    );
  const A = n.createBuffer(), f = n.createBuffer();
  return {
    gl: n,
    ...xe(n, e),
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
function xe(n, e) {
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
function be(n) {
  const e = n.gl;
  e.deleteBuffer(n.positionBuffer), e.deleteBuffer(n.textureBuffer), e.deleteTexture(n.fontTexture), e.deleteProgram(n.program);
}
function ge(n, e, t, i, s, r, h) {
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
    const c = Math.floor(t - l.metrics.actualBoundingBoxLeft), m = Math.floor(i - l.metrics.actualBoundingBoxAscent), E = c + l.width, x = m + l.height;
    o.push(c, m), a.push(l.x, l.y), o.push(c, x), a.push(l.x, l.y + l.height), o.push(c + l.width, x), a.push(l.x + l.width, l.y + l.height), o.push(E, x), a.push(l.x + l.width, l.y + l.height), o.push(c, m), a.push(l.x, l.y), o.push(E, m), a.push(l.x + l.width, l.y), t += l.metrics.width;
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
      for (let x = 0; x < d; x++)
        m.push(c[x * d + E]);
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
}, y = 8, g = 16, U = 8, Te = 15, we = 6, Fe = 8, ye = 30, Re = 0.01, De = 2e-3, ae = 2, N = 1, _e = 2, V = 10, Me = {
  a: "uA",
  b: "uB",
  fieldMetrics: "uFieldMetrics",
  first: "uFirst",
  size: "uSize"
}, Ae = 16, le = 8, Se = `#version 300 es

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
  const int BLOCK_W = ${Ae};
  const int BLOCK_H = ${le};

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
`, Pe = {
  second: "uSecond",
  first: "uFirst",
  size: "uSize"
}, C = 8, Ce = `#version 300 es
precision highp float;

uniform sampler2D uSecond;
uniform sampler2D uFirst;

uniform ivec2 uSize;

layout(location = 0) out vec4 outSecond;
layout(location = 1) out vec4 outFirst;

void main()
{
  ivec2 dst = ivec2(gl_FragCoord.xy);
  ivec2 base = dst * ${C};

  vec4 second = vec4(0.0);
  vec4 first = vec4(0.0);

  for (int y = 0; y < ${C}; ++y) {
    for (int x = 0; x < ${C}; ++x) {
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
`, Be = {
  previous: "uPrevious",
  second: "uSecond",
  first: "uFirst",
  comb: "uComb",
  size: "uSize"
}, Ie = `#version 300 es
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
  return differing <= ${ae}.0;
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
  bool believed = run >= ${V}.0;
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
  if (max(dSecondPrevious[2], dFirstPrevious[2]) <= ${De}) return vec4(score, 0.0, 0.0, last[3]);
  ivec2 blocks = textureSize(uComb, 0);
  float combed = 0.0;
  for (int y = 0; y < blocks.y; ++y) {
    for (int x = 0; x < blocks.x; ++x) {
      if (texelFetch(uComb, ivec2(x, y), 0)[0] > ${U}.0) combed += 1.0;
    }
  }
  bool clean = combed <= ${Re} * float(blocks.x * blocks.y);
  score = clean ? min(score + 1.0, ${ye}.0) : max(score - ${Fe}.0, 0.0);
  bool on = last[3] > 0.5 ? score >= ${we}.0 : score >= ${Te}.0;
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
`, Le = {
  prev: "uPrev",
  cur: "uCur",
  first: "uFirst",
  size: "uSize"
}, ke = `#version 300 es
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
  ivec2 base = block * ${g};
  float standing = 0.0;
  float woven = 0.0;
  for (int dy = 0; dy < ${g}; ++dy) {
    int y = base.y + dy;
    if (y >= uSize.y || (y & 1) == uFirst) continue;
    for (int dx = 0; dx < ${g}; ++dx) {
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
`, Ue = {
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
}, Ne = `#version 300 es
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
  return texelFetch(uFieldMetrics, ivec2(metric, 0), 0)[1] <= ${ae}.0;
}

/** The pulldown phase the detection gave this frame, or 0. See film-shader.ts. */
int detectedPhase() {
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${p.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${V}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${N} || phase == ${_e};
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
  ivec2 block = ivec2(x / ${g}, y / ${g});
  float standing = texelFetch(uComb, block, 0)[0];
  if (!neighbours) {
    if (standing > ${U}.0) return false;
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
    return true;
  }
  float adjoining = uSecond ? texelFetch(uCombAhead, block, 0)[1]
                            : texelFetch(uComb, block, 0)[1];
  if (min(standing, adjoining) > ${U}.0) return false;
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
    vec4 comb = texelFetch(uComb, ivec2(x / ${g}, y / ${g}), 0);
    bool combedBlock = (mixed ? comb[1] : comb[0]) > ${U}.0;
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
`, T = { phase: 0, run: 0 };
function I(n, e, t) {
  return Object.fromEntries(
    Object.entries(t).map(([i, s]) => [
      i,
      n.getUniformLocation(e, s)
    ])
  );
}
class Y {
  #t;
  #i;
  #e;
  #u;
  #E;
  #F;
  #s;
  #r;
  #A;
  /** The block comparisons of both fields, and the same folded most of the way. */
  #h = null;
  #f = null;
  /** Combed pixels per block of the frame being filtered, both ways of weaving it. */
  #d = null;
  /** Combed pixels per block of the frame after the one being filtered. */
  #_ = null;
  /** The field metrics (see FIELD_METRICS) of this frame and the one before. */
  #n = null;
  /** Which of the two holds the newest metrics. */
  #a = 0;
  /** The metrics being read back asynchronously. */
  #v = null;
  #l = null;
  #o = 0;
  #M = 0;
  /** The last metrics read back, laid out as FIELD_METRICS says. */
  metrics = new Float32Array(y * 4);
  #y = 0;
  #c = 0;
  constructor(e) {
    this.#t = e, this.#i = F(
      e,
      Se,
      M
    ), this.#e = I(
      e,
      this.#i,
      Me
    ), this.#u = F(
      e,
      Ce,
      M
    ), this.#E = I(
      e,
      this.#u,
      Pe
    ), this.#F = F(
      e,
      Ie,
      M
    ), this.#s = I(e, this.#F, Be), this.#r = F(e, ke, M), this.#A = I(e, this.#r, Le);
  }
  /** The newest measurements, or null before any frame has been measured. */
  get texture() {
    return this.#n?.[this.#a]?.textures[0] ?? null;
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
    return this.#_?.textures[0] ?? null;
  }
  /** The size of the frames to be measured, which sizes the block grid. */
  resize(e, t) {
    e === this.#y && t === this.#c || (this.#y = e, this.#c = t, this.#k());
  }
  /**
   * Forget the measurements: the next frame starts a cycle from nothing.
   * `keepInstant` keeps the one-instant score, for a gap in the frames when
   * the content has not changed.
   */
  reset(e = !1) {
    const t = this.#t;
    t.deleteSync(this.#l), this.#l = null, this.#o = 0;
    const i = this.#n?.[this.#a];
    if (!i) return;
    const s = e ? p.instant : y, r = new Float32Array(s * 4);
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
    if (this.#y === 0 || this.#c === 0) return;
    this.#T();
    const r = this.#h, h = this.#f, o = this.#n;
    if (r === null || h === null || o === null) return;
    const a = o[this.#a], u = o[1 - this.#a];
    if (s.bindFramebuffer(s.FRAMEBUFFER, r.framebuffer), s.useProgram(this.#i), this.#R(0, e, this.#e.a), this.#R(1, t, this.#e.b), this.#R(2, a.textures[0], this.#e.fieldMetrics), s.uniform1i(this.#e.first, i), s.uniform2i(this.#e.size, this.#y, this.#c), s.viewport(0, 0, r.width, r.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, h.framebuffer), s.useProgram(this.#u), this.#R(0, r.textures[0], this.#E.second), this.#R(1, r.textures[1], this.#E.first), s.uniform2i(this.#E.size, r.width, r.height), s.viewport(0, 0, h.width, h.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, u.framebuffer), s.useProgram(this.#F), this.#R(0, a.textures[0], this.#s.previous), this.#R(1, h.textures[0], this.#s.second), this.#R(2, h.textures[1], this.#s.first), this.#R(3, this.#d?.textures[0], this.#s.comb), s.uniform2i(this.#s.size, h.width, h.height), s.viewport(0, 0, y, 1), s.drawArrays(s.TRIANGLES, 0, 3), this.#a = 1 - this.#a, this.#o++, this.#l !== null) {
      s.bindFramebuffer(s.FRAMEBUFFER, null);
      return;
    }
    this.#M = this.#o, s.bindBuffer(s.PIXEL_PACK_BUFFER, this.#v), s.readPixels(0, 0, y, 1, s.RGBA, s.FLOAT, 0), s.bindBuffer(s.PIXEL_PACK_BUFFER, null), s.bindFramebuffer(s.FRAMEBUFFER, null), this.#l = s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE, 0), s.flush();
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
    if (this.#y === 0 || this.#c === 0) return;
    this.#T();
    const h = s ? this.#_ : this.#d;
    h !== null && (r.bindFramebuffer(r.FRAMEBUFFER, h.framebuffer), r.useProgram(this.#r), this.#R(0, e, this.#A.prev), this.#R(1, t, this.#A.cur), r.uniform1i(this.#A.first, i), r.uniform2i(this.#A.size, this.#y, this.#c), r.viewport(0, 0, h.width, h.height), r.drawArrays(r.TRIANGLES, 0, 3), r.bindFramebuffer(r.FRAMEBUFFER, null));
  }
  /**
   * The phase of the last frame measured, once the GPU has handed it back,
   * and null while it is still on its way. It is handed back once.
   * `instant` is the one-instant verdict as of that frame. The filter reads
   * the same verdict from `texture` without waiting for the readback.
   */
  poll() {
    const e = this.#t, t = this.#l;
    if (t === null || this.#v === null) return null;
    switch (e.clientWaitSync(t, 0, 0)) {
      case e.ALREADY_SIGNALED:
      case e.CONDITION_SATISFIED:
        return e.bindBuffer(e.PIXEL_PACK_BUFFER, this.#v), e.getBufferSubData(e.PIXEL_PACK_BUFFER, 0, this.metrics), e.bindBuffer(e.PIXEL_PACK_BUFFER, null), e.deleteSync(t), this.#l = null, {
          phase: this.metrics[p.phase * 4] ?? 0,
          run: this.metrics[p.phase * 4 + 1] ?? 0,
          instant: (this.metrics[p.instant * 4 + 3] ?? 0) > 0.5,
          age: this.#o - this.#M
        };
      default:
        return null;
    }
  }
  destroy() {
    const e = this.#t;
    if (this.#k(), this.#n !== null) {
      for (const t of this.#n) _(e, t);
      this.#n = null;
    }
    e.deleteSync(this.#l), this.#l = null, e.deleteBuffer(this.#v), this.#v = null, e.deleteProgram(this.#i), e.deleteProgram(this.#u), e.deleteProgram(this.#F), e.deleteProgram(this.#r);
  }
  #R(e, t, i) {
    const s = this.#t;
    s.activeTexture(s.TEXTURE0 + e), s.bindTexture(s.TEXTURE_2D, t ?? null), s.uniform1i(i, e);
  }
  #k() {
    const e = this.#t;
    this.#h !== null && _(e, this.#h), this.#f !== null && _(e, this.#f), this.#d !== null && _(e, this.#d), this.#_ !== null && _(e, this.#_), this.#h = null, this.#f = null, this.#d = null, this.#_ = null;
  }
  /** Everything detect needs that is not there yet. */
  #T() {
    const e = this.#t;
    if (this.#h === null || this.#f === null || this.#d === null || this.#_ === null) {
      this.#k();
      const t = Math.ceil(this.#y / Ae), i = Math.ceil(this.#c / (le * 2));
      this.#h = R(e, t, i, 2), this.#f = R(
        e,
        Math.ceil(t / C),
        Math.ceil(i / C),
        2
      ), this.#d = R(
        e,
        Math.ceil(this.#y / g),
        Math.ceil(this.#c / g),
        1
      ), this.#_ = R(
        e,
        Math.ceil(this.#y / g),
        Math.ceil(this.#c / g),
        1
      );
    }
    this.#n === null && (this.#n = [
      R(e, y, 1, 1),
      R(e, y, 1, 1)
    ], this.#a = 0, this.reset()), this.#v === null && (this.#v = e.createBuffer(), e.bindBuffer(e.PIXEL_PACK_BUFFER, this.#v), e.bufferData(
      e.PIXEL_PACK_BUFFER,
      this.metrics.byteLength,
      e.STREAM_COPY
    ), e.bindBuffer(e.PIXEL_PACK_BUFFER, null));
  }
}
function R(n, e, t, i) {
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
    throw _(n, o), new Error("failed to allocate framebuffer");
  return o;
}
function _(n, { framebuffer: e, textures: t }) {
  n.deleteFramebuffer(e);
  for (const i of t) n.deleteTexture(i);
}
function Z(n) {
  return Number.isInteger(n) && n > 0;
}
function Oe(n) {
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
  if (!Z(i) || !Z(s))
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
function j(n, e) {
  const t = 1 - n - e;
  return Float32Array.of(
    2 * (1 - n),
    2 * (1 - e) * e / t,
    2 * (1 - n) * n / t,
    2 * (1 - e)
  );
}
const Ge = {
  bt709: j(0.2126, 0.0722),
  bt601: j(0.299, 0.114)
}, Xe = `#version 300 es
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
class ze {
  #t;
  #i;
  #e;
  #u;
  #E;
  #F;
  #s;
  #r;
  #A = [];
  #h = 0;
  #f = 0;
  /** Whether the target format was found renderable since the last resize. */
  #d = !1;
  constructor(e) {
    this.#t = e, this.#i = F(e, Xe, M), this.#e = e.getUniformLocation(this.#i, "uLuma"), this.#u = e.getUniformLocation(this.#i, "uCb"), this.#E = e.getUniformLocation(this.#i, "uCr"), this.#F = e.getUniformLocation(this.#i, "uInterlaced"), this.#s = e.getUniformLocation(this.#i, "uMatrix"), this.#r = e.createFramebuffer();
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
    this.#h = e, this.#f = t, this.#d = !1;
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
        r === 0 ? this.#h : Math.ceil(this.#h / 2),
        r === 0 ? this.#f : Math.ceil(this.#f / 2),
        i.RED,
        i.UNSIGNED_BYTE,
        s,
        h
      );
    }
    if (i.pixelStorei(i.UNPACK_ROW_LENGTH, 0), i.pixelStorei(i.UNPACK_ALIGNMENT, 4), i.bindFramebuffer(i.FRAMEBUFFER, this.#r), i.framebufferTexture2D(
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
    i.uniform1i(this.#e, 0), i.uniform1i(this.#u, 1), i.uniform1i(this.#E, 2), i.uniform1i(this.#F, e.interlaced ? 1 : 0), i.uniform4fv(this.#s, Ge[e.matrix]), i.viewport(0, 0, this.#h, this.#f), i.drawArrays(i.TRIANGLES, 0, 3), i.activeTexture(i.TEXTURE0), i.bindFramebuffer(i.FRAMEBUFFER, null);
  }
  destroy() {
    const e = this.#t;
    for (const t of this.#A) e.deleteTexture(t);
    this.#A = [], e.deleteFramebuffer(this.#r), e.deleteProgram(this.#i);
  }
}
const We = 250, w = 4, He = 0.01, $e = 100, Ve = 250, Qe = 0.5, Ye = 2;
class Ze {
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
  #E = !0;
  /** The last reading, and the wall time at which it was first seen. */
  #F = Number.NaN;
  #s = 0;
  /** While waiting: whether the last reading was a change, not where the clock was held. */
  #r = !1;
  /** Wall time between the last reading that changed and the reading before it. */
  #A = 0;
  /** Wall time of the last reading taken, changed or not. */
  #h = 0;
  #f = Number.NaN;
  /** Wall time of the last correction. */
  #d = 0;
  /** The highest error of a reading, in media seconds, per bucket; the last is the newest. */
  #_ = new Float64Array(w);
  #n = 0;
  /** Whether the next reading holds the clock, as hold() asks. */
  #a = !0;
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
    const r = e - this.#h;
    if (this.#h = e, !s || this.#a || i !== this.#u)
      return this.#a = !1, this.#u = i, this.#v(e, t), !1;
    if (t === this.#F)
      return !this.#E && e - this.#s > Ve && this.#v(e, t), !1;
    const h = (t - this.#F) * 1e3 / i, o = e - this.#s, a = this.#A;
    if (this.#F = t, this.#s = e, this.#A = r, this.#E) {
      const c = this.#r && h >= o * Qe && h <= o + a + Ye;
      return this.#r = !0, c ? (this.#l(e, t), !0) : (this.#t = e, this.#i = t, !1);
    }
    const u = t - this.at(e);
    if (Math.abs(u) > $e / 1e3 * i)
      return this.#f = t, this.#l(e, t), !0;
    const A = this.#_;
    e - this.#n >= We ? (A.copyWithin(0, 1), A[w - 1] = u, this.#n = e) : A[w - 1] = Math.max(A[w - 1], u);
    let f = A[0];
    for (let c = 1; c < w; c++)
      f = Math.max(f, A[c]);
    const d = He * i * (e - this.#d) / 1e3, l = Math.max(-d, Math.min(d, f));
    this.#d = e, this.#i += l;
    for (let c = 0; c < w; c++)
      A[c] = A[c] - l;
    return !1;
  }
  #v(e, t) {
    this.#t = e, this.#i = t, this.#e = 0, this.#E = !0, this.#r = !1, this.#F = t, this.#s = e, this.#f = t;
  }
  #l(e, t) {
    this.#t = e, this.#i = t, this.#e = this.#u, this.#E = !1, this.#d = e, this.#n = e, this.#_.fill(Number.NEGATIVE_INFINITY), this.#_[w - 1] = 0;
  }
}
const B = 16, je = 6, qe = `#version 300 es
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
  ivec2 origin = ivec2(gl_FragCoord.xy) * ${B};
  vec3 difference = vec3(0.0);
  for (int y = 0; y < ${B}; y++) {
    for (int x = 0; x < ${B}; x++) {
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
class Ke {
  #t;
  #i;
  #e = null;
  #u = null;
  /** Textures available for the next take. */
  #E = [];
  #F = 0;
  /** Readback buffers available for the next comparison. */
  #s = [];
  #r = new Uint8Array(0);
  /** Takes still held, oldest first. */
  #A = [];
  /** The newest take. The next take is compared with it. */
  #h = null;
  #f = 0;
  constructor(e, t) {
    this.#t = e, this.#i = t;
  }
  take() {
    const e = this.#t, t = this.#E.pop() ?? this.#a();
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
      throw this.#E.push(t), o;
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
    }, h = this.#h;
    return h === null || h.width !== i || h.height !== s ? r.changed = !0 : this.#d(r, h), this.#h = r, this.#A.push(r), r.id;
  }
  settle() {
    const e = this.#t, t = this.#A.find((i) => !i.reported);
    if (t === void 0 || t === this.#h) return null;
    if (t.changed === null) {
      const { fence: i, buffer: s } = t;
      if (i === null || s === null) return null;
      const r = e.clientWaitSync(i, 0, 0);
      if (r !== e.ALREADY_SIGNALED && r !== e.CONDITION_SATISFIED)
        return null;
      this.#r.byteLength < s.bytes && (this.#r = new Uint8Array(s.bytes));
      const h = this.#r.subarray(0, s.bytes);
      e.bindBuffer(e.PIXEL_PACK_BUFFER, s.buffer), e.getBufferSubData(e.PIXEL_PACK_BUFFER, 0, h), e.bindBuffer(e.PIXEL_PACK_BUFFER, null), t.changed = Je(h), this.#_(t);
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
    return this.#A.splice(i, 1), this.#E.push(t), s.texture;
  }
  release(e) {
    const t = this.#A.findIndex((s) => s.id === e), i = this.#A[t];
    i !== void 0 && (this.#A.splice(t, 1), this.#n(i));
  }
  reset() {
    const e = this.#A;
    this.#A = [], this.#h = null;
    for (const t of e)
      this.#_(t), this.#n(t);
  }
  destroy() {
    const e = this.#t;
    this.reset();
    for (const t of this.#E) e.deleteTexture(t);
    this.#E = [], this.#F = 0;
    for (const { buffer: t } of this.#s) e.deleteBuffer(t);
    this.#s = [], this.#o(), this.#e !== null && e.deleteProgram(this.#e), this.#e = null;
  }
  /** Compare a take with the reference on the GPU and start reading back the result. */
  #d(e, t) {
    const i = this.#t, s = Math.ceil(e.width / B), r = Math.ceil(e.height / B), h = this.#l(s, r), o = this.#M(s * r * 4);
    this.#e ??= this.#v(), i.bindFramebuffer(i.FRAMEBUFFER, h.framebuffer), i.useProgram(this.#e), i.activeTexture(i.TEXTURE1), i.bindTexture(i.TEXTURE_2D, t.texture), i.activeTexture(i.TEXTURE0), i.bindTexture(i.TEXTURE_2D, e.texture), i.viewport(0, 0, s, r), i.drawArrays(i.TRIANGLES, 0, 3), i.bindBuffer(i.PIXEL_PACK_BUFFER, o.buffer), i.readPixels(0, 0, s, r, i.RGBA, i.UNSIGNED_BYTE, 0), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), i.bindFramebuffer(i.FRAMEBUFFER, null), e.fence = i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE, 0), e.buffer = o, i.flush();
  }
  /** Release the fence and readback buffer of a comparison, whether or not it was read. */
  #_(e) {
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
  #n(e) {
    this.#E.push(e.texture);
  }
  #a() {
    if (this.#F === je) return null;
    const e = this.#t, t = e.createTexture();
    return e.bindTexture(e.TEXTURE_2D, t), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), this.#F++, t;
  }
  #v() {
    const e = this.#t, t = F(e, qe, M);
    return e.useProgram(t), e.uniform1i(e.getUniformLocation(t, "uTake"), 0), e.uniform1i(e.getUniformLocation(t, "uReference"), 1), t;
  }
  #l(e, t) {
    const i = this.#t, s = this.#u;
    if (s?.width === e && s.height === t) return s;
    this.#o();
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
  #o() {
    const e = this.#t;
    this.#u !== null && (e.deleteFramebuffer(this.#u.framebuffer), e.deleteTexture(this.#u.texture), this.#u = null);
  }
  #M(e) {
    const t = this.#s.pop();
    if (t !== void 0) return t;
    const i = this.#t, s = i.createBuffer();
    return i.bindBuffer(i.PIXEL_PACK_BUFFER, s), i.bufferData(i.PIXEL_PACK_BUFFER, e, i.STREAM_COPY), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), { buffer: s, bytes: e };
  }
}
function Je(n) {
  for (let e = 0; e < n.length; e += 4)
    if (n[e] !== 0 || n[e + 1] !== 0 || n[e + 2] !== 0)
      return !0;
  return !1;
}
const ue = [
  "mozParsedFrames",
  "mozDecodedFrames",
  "mozPresentedFrames",
  "mozPaintedFrames"
];
function ce(n) {
  return ue.every((e) => e in n);
}
function et(n) {
  return n.ownerDocument?.defaultView?.performance.timeOrigin ?? performance.timeOrigin;
}
function tt() {
  return typeof HTMLVideoElement < "u" && (ce(HTMLVideoElement.prototype) || typeof HTMLVideoElement.prototype.requestVideoFrameCallback == "function");
}
const it = 250, X = 500, st = 1.75, rt = 3, nt = 200;
class ht {
  #t;
  #i;
  #e;
  /** The watch that owns the takes in #taken. */
  #u = null;
  /** Takes whose results are pending, oldest first. */
  #E = [];
  /** Frame count on the picture-watching path, reported as `presentedFrames`. */
  #F = 0;
  #s = null;
  /** Consecutive unchanged results for takes made at rest. */
  #r = 0;
  /** When the last delivered take was made, and the painted count when it was delivered. */
  #A = null;
  #h = null;
  #f = null;
  #d = null;
  #_ = null;
  #n = null;
  #a = !0;
  #v = null;
  #l = null;
  #o = 0;
  #M;
  #y;
  #c = null;
  #R = null;
  #k = null;
  #T = null;
  #se = 0;
  #q = [];
  #Y = [];
  constructor(e, t) {
    if (this.#t = e, this.#e = t, this.#i = ce(e) ? e : null, this.#M = this.#i === null && typeof VideoFrame < "u", this.#y = this.#M && e.playbackRate > 1, this.#i) {
      for (const i of ["emptied", "seeking", "seeked"])
        e.addEventListener(i, this.#$);
      for (const i of ["pause", "playing", "waiting", "ratechange"])
        e.addEventListener(i, this.#D);
    }
    if (this.#M)
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
        e.addEventListener(i, this.#re);
  }
  /** Whether acquisition uses the captured pictures' own timestamps. */
  get captureDriven() {
    return this.#y;
  }
  request(e) {
    if (this.#d === null) {
      if (this.#d = e, this.#y) {
        this.#z();
        return;
      }
      this.#f = this.#i ? requestAnimationFrame(this.#J) : this.#t.requestVideoFrameCallback(this.#L);
    }
  }
  cancel() {
    this.#f !== null && (this.#i ? cancelAnimationFrame(this.#f) : this.#t.cancelVideoFrameCallback(this.#f)), this.#f = null, this.#d = null, this.#c?.(), this.#c = null, this.#k !== null && this.#t.cancelVideoFrameCallback(this.#k), this.#k = null, this.#pe(), this.#T = null, this.#q = [], this.#y = this.#M && this.#t.playbackRate > 1, this.#$();
  }
  destroy() {
    this.cancel();
    for (const e of ["emptied", "seeking", "seeked"])
      this.#t.removeEventListener(e, this.#$);
    for (const e of ["pause", "playing", "waiting", "ratechange"])
      this.#t.removeEventListener(e, this.#D);
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
      this.#t.removeEventListener(e, this.#re);
  }
  /** Deliver pending input on the rendering window's refresh, before drawing. */
  flush(e) {
    if (this.#y)
      for (this.#t.ownerDocument !== this.#R && (this.#c?.(), this.#c = null, this.#z()); this.#Y.length > 0 && this.#d !== null; ) {
        const t = this.#Y.shift(), i = t.frame;
        try {
          this.#Z(e, {
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
  #pe() {
    for (const e of this.#Y) e.frame.close();
    this.#Y = [];
  }
  #re = (e) => {
    const t = this.#M && this.#t.playbackRate > 1;
    if (t !== this.#y) {
      const i = this.#d;
      this.cancel(), this.#y = t, i !== null && this.request(i);
      return;
    }
    ["seeking", "seeked", "emptied", "ratechange"].includes(e.type) && (this.#T = null, this.#q = []), this.#y && ((e.type === "pause" || e.type === "ended") && this.flush(performance.now()), this.#pe(), this.#c?.(), this.#c = null, this.#d !== null && this.#z());
  };
  #z() {
    if (!this.#y || this.#c !== null || this.#d === null || (this.#t.paused || this.#t.ended) && this.#T !== null)
      return;
    this.#k === null && typeof this.#t.requestVideoFrameCallback == "function" && (this.#k = this.#t.requestVideoFrameCallback(
      this.#K
    ));
    const e = Math.max(4, 8 / Math.max(1, this.#t.playbackRate)), t = this.#t.ownerDocument?.defaultView;
    if (this.#R = this.#t.ownerDocument, t) {
      const i = t.setTimeout(this.#ne, e);
      this.#c = () => t.clearTimeout(i);
    } else {
      const i = setTimeout(this.#ne, e);
      this.#c = () => clearTimeout(i);
    }
  }
  #K = () => {
    this.#k = null, this.#c?.(), this.#c = null, this.#ne();
  };
  #ne = () => {
    this.#c = null;
    const e = this.#t;
    if (this.#d === null) return;
    if (e.readyState < 2 || e.seeking) {
      this.#z();
      return;
    }
    let t;
    try {
      t = new VideoFrame(e);
    } catch (i) {
      if (!(i instanceof DOMException) || i.name !== "InvalidStateError")
        throw i;
      this.#z();
      return;
    }
    if (t.timestamp === this.#T)
      t.close();
    else {
      let i = 1;
      if (this.#T !== null) {
        const s = t.timestamp - this.#T;
        if (s > 1e3 && s < 25e4 && (this.#q.push(s), this.#q.length > 7 && this.#q.shift()), s > 0 && this.#q.length > 0) {
          const r = [...this.#q].sort((o, a) => o - a), h = r[Math.floor(r.length / 2)];
          i = Math.max(1, Math.round(s / h));
        }
      }
      for (this.#T = t.timestamp, this.#se += i, this.#Y.push({
        frame: t,
        at: performance.now(),
        count: this.#se
      }); this.#Y.length > 4; ) this.#Y.shift().frame.close();
    }
    this.#z();
  };
  #D = () => {
    this.#v = null, this.#l = null, this.#o = 0;
  };
  #$ = () => {
    this.#_ = null, this.#n = null, this.#a = !0, this.#Fe(), this.#D();
  };
  /** Discard all takes. The next take has no reference to compare with. */
  #Fe() {
    this.#u?.reset(), this.#E = [], this.#r = 0;
  }
  /** Native acquisition: pass the report on, with the clock it was made on. */
  #L = (e, t) => {
    this.#Z(e, {
      width: t.width,
      height: t.height,
      mediaTime: t.mediaTime,
      presentedFrames: t.presentedFrames,
      expectedDisplayTime: t.expectedDisplayTime,
      timeOrigin: et(this.#t)
    });
  };
  #Z = (e, t) => {
    const i = this.#d;
    this.#f = null, this.#d = null, i?.(e, t);
  };
  #J = (e) => {
    const t = this.#i, i = ue.map((a) => t[a]);
    this.#_?.some((a, u) => i[u] < a) && this.#$(), this.#_ = i;
    const s = this.#e?.() ?? null;
    s !== this.#u && (this.#$(), this.#u = s);
    const r = t.mozPaintedFrames, h = !t.seeking && t.readyState >= 2 && t.videoWidth > 0 && t.videoHeight > 0, o = this.#n === null && (r > 0 || t.paused && (t.mozPresentedFrames > 0 || t.mozDecodedFrames > 0));
    if (s !== null) {
      this.#I(e, t, s, h, o);
      return;
    }
    if (h && (o || this.#n !== null && r !== this.#n)) {
      this.#v !== null && e - this.#v > X && (this.#D(), this.#a = !0), this.#V(e, t), this.#v = e, this.#n = r;
      const a = this.#a;
      this.#a = !1, this.#Z(e, {
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
        mozTiming: { periodMs: this.#o, discontinuity: a }
      });
    } else
      this.#f = requestAnimationFrame(this.#J);
  };
  /** Update the cadence estimate from the painted count. Called on a poll where the count advanced. */
  #V(e, t) {
    if (t.paused || t.ended) return;
    const i = t.mozPaintedFrames, s = this.#l;
    if (s && e - s.at >= it) {
      const r = i - s.frames;
      if (r > 0) {
        const h = (e - s.at) / r;
        h >= 4 && h <= 200 && (this.#o = this.#o ? this.#o + (h - this.#o) * 0.25 : h);
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
  #I(e, t, i, s, r) {
    const h = t.mozPaintedFrames, o = this.#n !== null && h !== this.#n;
    this.#s !== null && e - this.#s > X && (this.#Fe(), this.#D(), this.#a = !0), this.#s = e, o && this.#V(e, t);
    const a = t.paused || t.ended;
    (!a || o) && (this.#r = 0), a && this.#A !== null && (this.#A = e);
    const u = a && this.#r >= rt;
    if (s && (r || this.#n !== null)) {
      this.#n = h;
      const l = u ? null : i.take();
      l !== null && this.#E.push({
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
      const c = this.#E.shift();
      if (c?.id !== l.id)
        throw new Error("picture verdicts arrived out of order");
      let m = l.changed;
      if (m ? this.#r = 0 : (this.#r = c.resting ? this.#r + 1 : 0, m = A === null && !c.resting && this.#A !== null && (c.at - this.#A) * (t.playbackRate || 1) >= nt && h !== this.#h), !m) {
        i.release(c.id);
        continue;
      }
      A !== null && i.release(A.id), A = c;
    }
    if (A === null) {
      this.#f = requestAnimationFrame(this.#J);
      return;
    }
    let f = 1;
    if (this.#v !== null) {
      const l = A.at - this.#v;
      l > X ? (this.#D(), this.#a = !0) : this.#o > 0 && l > this.#o * st && (f = Math.round(l / this.#o));
    }
    this.#F += f, this.#v = A.at, this.#A = A.at, this.#h = h;
    const d = this.#a;
    this.#a = !1;
    try {
      this.#Z(e, {
        width: A.width,
        height: A.height,
        // As on the counter path, this only places the frame on the media
        // timeline. It is the clock value when the picture was taken.
        mediaTime: A.mediaTime,
        presentedFrames: this.#F,
        // The picture is delivered now, not when it was taken, and the
        // schedule is anchored to the delivery time.
        expectedDisplayTime: e,
        timeOrigin: performance.timeOrigin,
        mozTiming: { periodMs: this.#o, discontinuity: d },
        picture: A.id
      });
    } finally {
      i.release(A.id);
    }
  }
}
let fe = null;
function ot(n) {
  fe = n;
}
const z = 0.5, v = 4, H = 5, b = H + 1, q = 1e3, K = 4, L = 200, at = 0.25, At = 1e3 / 60, lt = `#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`, ut = 0.75, ct = 0.1, J = 1, ft = 60, dt = 0.02, mt = 0.1, S = 1, pt = 4, Et = 90, vt = 1.5, xt = 24, P = 1e-3, k = 5, ee = 4, te = {
  2: 0,
  3: 0.25,
  4: 0.5,
  5: 0.75
};
function ie(n) {
  return gt[(n.interlaced ? 2 : 0) + (n.topFieldFirst ? 1 : 0)];
}
const bt = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`, gt = [
  { interlaced: !1, topFieldFirst: !1 },
  { interlaced: !1, topFieldFirst: !0 },
  { interlaced: !0, topFieldFirst: !1 },
  { interlaced: !0, topFieldFirst: !0 }
];
function Pt() {
  return tt() && typeof WebGL2RenderingContext < "u";
}
const Tt = {
  requestAnimationFrame: (n) => requestAnimationFrame(n),
  cancelAnimationFrame: (n) => cancelAnimationFrame(n)
};
class Ct extends EventTarget {
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
  #E;
  /** The take holding the picture of the frame being ingested, if any. */
  #F = null;
  #s;
  /** The pulldown detection, built only while the `film` option needs it. */
  #r = null;
  #A;
  #h;
  /** The program that copies a filtered picture onto the canvas. */
  #f;
  #d;
  #_;
  #n = [];
  /** Somewhere to filter a field into, and to read it back out of. */
  #a = [];
  /** Which output slot was written last; the next one follows round the ring. */
  #v = b - 1;
  /** The draw path currently shown on the canvas, retained for snapshots. */
  #l = null;
  /** Filtered fields waiting for their moment, oldest first. */
  #o = [];
  /** The requestAnimationFrame() loop that puts them up, which is all that draws on the canvas. */
  #M = null;
  #y = 0;
  /** Deliver captured pictures on the page's refresh during faster playback. */
  #c = null;
  /** The document the owner-change listener is on, if any. */
  #R = null;
  #k;
  /** The gap between animation frames: as near as the page gets to the screen. */
  #T = At;
  /** Where the refresh grid fitted to the animation frames stands. (otya) */
  #se = 0;
  /** How far ahead of its animation frame the last picture shown stood. (otya) */
  #q = 0;
  #Y = 0;
  #pe = 0;
  /** The last picture chained onto the schedule; a break restarts it. (otya) */
  #re = null;
  /** The lateness the schedule holds on purpose, in refreshes. See #schedule. */
  #z = 0;
  /** Pictures in a row that arrived off the phase the lag stands for, all on one side of it. */
  #K = 0;
  /** Of those, the phase closest to the lag's phase, in refreshes. */
  #ne = 0;
  /**
   * Drop the presentation queue and restart the schedule from the clock.
   * Every schedule restart goes through here (otya nulls #lastScheduled at
   * each queue clear): the old chain's clock no longer applies, so keeping
   * it would either count a phantom resync or pop freshly queued pictures
   * as late. Restart accounting for cadence changes lives in #schedule.
   */
  #D() {
    this.#o.length = 0, this.#Ue.length = 0, this.#re = null, this.#z = 0, this.#K = 0, this.#pe = 0;
  }
  /** The `<div>` this put around the element, so it can be taken away again. */
  #$ = null;
  #Fe;
  #L;
  #Z;
  #J = 0;
  /** otya GPU pulldown path: enabled by the `film` option (see below). */
  #V;
  #I;
  /** How long a frame lasts in wall time, from what the frames themselves say. */
  #C = 0;
  /** The size of a frame as it is coded, which is what a texture holds. */
  #U = 0;
  #Q = 0;
  /** Where the newest frame is. The two before it follow round the ring. */
  #b = v - 1;
  /** How many of the held frames are consecutive, up to HISTORY. */
  #w = 0;
  #We = 0;
  /** presentedFrames at the last ingested frame; pairs with #lastMediaTime. */
  #Bt = 0;
  /** A destination frame that arrived before the browser finished seeking. */
  #He = !1;
  #S = !1;
  /** Cancels work suspended inside a synchronous owner callback. */
  #ee = 0;
  #ye = !1;
  #j = !1;
  #B = null;
  #Re = [];
  #te = !1;
  #It;
  #Lt;
  #P;
  #De;
  #ae;
  #kt;
  #p = null;
  #g;
  #$e = !1;
  #Ut = 0;
  #Nt = !1;
  #Zi = 0;
  #Ve = !1;
  #At = !1;
  #_e = null;
  #ji = 0;
  #Qe = /* @__PURE__ */ new Map();
  /** Everything the next report is counted from. See DeinterlaceStats. */
  #x = {
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
  #Ye = 0;
  /** When the last frame the filter took arrived, to see the gaps between. */
  #Ze = 0;
  #lt = 0;
  #he = 0;
  #Ee = 0;
  #ve = 0;
  #Me = 0;
  #Ae = 0;
  #Se;
  #ut = [];
  #Pe = [];
  #je = 0;
  #Ce = 0;
  #qe = 0;
  #Be = 0;
  /** The last phase read back from the GPU, and how many frames ago it was for. */
  #Ke = T;
  #Ie = 0;
  /** The phase of the frame being filtered: #known advanced by #knownAge. */
  #N = T;
  #W = !1;
  /** Frames left of the FILM_HOLD_FRAMES window that starts when the cadence is held. */
  #O = 0;
  /** Whether the comb counts were made for the frame being filtered and its neighbours. */
  #ct = !1;
  /** Whether the frame being filtered may have its fields matched. See #render. */
  #xe = !1;
  /** Whether the last detection read back found each frame to be one instant. */
  #Ot = !1;
  /** Whether comb counts were also made for the frame after it. */
  #Gt = !1;
  /** Whether the frame behind the newest (the one being filtered) came after a gap in the frames seen. */
  #Xt = !1;
  /** Whether the previous frame was progressive. */
  #Je = !1;
  #Le = null;
  #pi = "";
  /** Debug only: frames given each phase (0 for none), and repeats dropped. */
  #ft = [0, 0, 0, 0, 0, 0];
  #dt = 0;
  /**
   * Why requested film reconstruction is currently degraded, or null while
   * healthy. The `film` option stays as the caller set it;
   * only the engine stands down, so this is never a silent option change.
   */
  #be = null;
  /** Last worker-reported filmError, to derive the page-side failure event. */
  #zt = null;
  #Wt = 0;
  /** Whether pictures come from `decodedVideo`. Set by the first push and kept. */
  #m = !1;
  /** Pushed pictures not yet taken in, in timestamp order. */
  #ge = [];
  /** Whether finish() was called since the last reset. */
  #Ht = !1;
  #G = new Ze();
  /** Built when the first decoded picture arrives. */
  #et = null;
  /** The decoded picture in each history slot; the newest is at #head. */
  #le = Array.from({ length: v }, () => ({
    timestamp: 0,
    duration: 0,
    interlaced: !0,
    topFieldFirst: !0,
    repeatFirstField: !1
  }));
  /** Whether a decoded picture has been taken in since the last reset. */
  #mt = !1;
  /** Whether the newest picture is still to be filtered against its successor. */
  #ke = !1;
  /** Whether it has been filtered against itself meanwhile, its successor being late. */
  #tt = !1;
  /** Filtered decoded outputs waiting for their media time, in time order. */
  #Ue = [];
  /** The decoded output on the canvas. */
  #pt = null;
  /**
   * The first outputs of the last two pictures shown, whose slots are kept:
   * a pause can land in the picture before the one the canvas has gone on to.
   */
  #ue = null;
  #Ne = null;
  /** The media time of the output on the canvas; nothing older goes up after it. */
  #$t = Number.NEGATIVE_INFINITY;
  /** Outputs the last refresh advanced by. Near a refresh boundary the next refresh does the same. */
  #it = 1;
  /** Field order of the decoded picture being filtered. */
  #Vt = !0;
  /** The size the decoded pictures are shown at. */
  #st = 0;
  #rt = 0;
  /** The element's own inline aspect ratio, from before decoded pictures gave it theirs. */
  #Qt = null;
  /** Whether the element answers for the decoded pictures; see `#standInForElement`. */
  #Et = !1;
  /** Decoded pictures pushed since the counts were last reset. */
  #Yt = 0;
  /** Pictures a Worker renderer dropped unshown, as of its last report. */
  #Zt = 0;
  /** Whether the page showing the canvas is hidden; it is then given no refreshes. */
  #vt = !1;
  /**
   * The position when the page last became visible again, and the clock's
   * origin then. The position bounds what passed while it was hidden only for
   * as long as playback has been continuous since, which the origin tells.
   */
  #Ei = Number.NaN;
  #vi = Number.NaN;
  /**
   * Buffers transferred to the Worker and not yet back, by the id they went
   * with. A Worker that goes away takes them with it, and what is handed
   * back for them then is the detached original.
   */
  #xt = /* @__PURE__ */ new Map();
  #qi = 0;
  constructor(e, t = {}, i = null) {
    super(), this.#e = e, this.#L = t.doubleRate ?? !1, this.#Z = t.spatialCheck ?? !0, this.#V = t.debug ?? !1, this.#I = t.film ?? !1, this.#It = t.onStats, this.#Lt = t.onFailure, this.#P = i, this.#ae = i ? "main" : t.rendering ?? "main", this.#kt = t.workerUrl ?? fe, this.#g = this.#ae === "main" ? "main" : "idle", this.#i = i ? i.canvas : document.createElement("canvas"), this.#t = i?.canvas ?? (this.#ae === "main" ? this.#i : document.createElement("canvas")), this.#De = e, i || (this.#i.style.cssText = "position:absolute;pointer-events:none;visibility:hidden");
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
    this.#s = s, this.#I && (this.#gi(), this.#r = new Y(s)), this.#A = se(s, Ne);
    const r = this.#A;
    this.#h = Object.fromEntries(
      Object.entries(Ue).map(([h, o]) => [
        h,
        s.getUniformLocation(r, o)
      ])
    ), this.#f = se(s, bt), this.#d = s.getUniformLocation(this.#f, "uField"), this.#_ = s.getUniformLocation(this.#f, "uFlip"), this.#Se = s.getExtension(
      "EXT_disjoint_timer_query_webgl2"
    ), this.#t.addEventListener(
      "webglcontextlost",
      this.#Yi
    ), this.#Fe = i ? null : new ResizeObserver(() => this.#ze()), this.#k = i ? null : new MutationObserver(() => {
      this.#i.ownerDocument !== this.#R && this.#ze();
    }), this.decodedVideo = {
      push: (h) => this.#ls(h),
      reset: () => this.#Ri(),
      finish: () => {
        this.#Ht = !0, this.#p?.postMessage({
          type: "pictures",
          action: "finish"
        });
      },
      onrelease: null
    }, this.#E = i ? null : new Ke(s, e), this.#u = new ht(
      e,
      () => this.#g === "main" ? this.#E : null
    ), e.addEventListener("emptied", this.#Hi), e.addEventListener("resize", this.#Wi), e.addEventListener("pause", this.#me), e.addEventListener("ended", this.#me), e.addEventListener("seeking", this.#Vi), e.addEventListener("seeked", this.#me), e.addEventListener("ratechange", this.#me), e.addEventListener("waiting", this.#Qi);
  }
  /**
   * Whether the canvas, rather than the element, is what shows the picture.
   * A page uses this to decide which of the two to capture or transform.
   * Filtering an element's own picture that is the same as filtering it at
   * all, since a progressive source is left to the element. Decoded pictures
   * are on the canvas filtered or not, because the element has none.
   */
  get running() {
    return this.#m ? this.#S : this.#S && (this.#B?.interlaced ?? !0);
  }
  /** The HTML canvas currently placed over the media element. */
  get canvas() {
    return this.#i;
  }
  /** Field order for the current scan state, defaulting to top-field-first. */
  get #bt() {
    return this.#m ? this.#Vt : this.#B?.topFieldFirst !== !1;
  }
  /** The same public filter options for either rendering target. */
  #xi() {
    return {
      doubleRate: this.#L,
      spatialCheck: this.#Z,
      film: this.#I,
      debug: this.#V
    };
  }
  /** Whether the caller wants filtering, independently of the current source. */
  get enabled() {
    return this.#ye;
  }
  set enabled(e) {
    this.#ye = e, this.#gt(), this.#p?.postMessage({
      type: "enabled",
      enabled: e
    });
  }
  /** Update whether the source needs filtering and which field comes first. */
  set scan(e) {
    if (this.#m) return;
    const t = this.#B?.interlaced !== e?.interlaced, i = t || this.#B?.topFieldFirst !== e?.topFieldFirst;
    this.#B = e, !(i && (!this.#Ge() || this.#B !== e)) && (this.#p?.postMessage({ type: "scan", scan: e }), i && (this.#w = 0, this.#D(), this.#H(), t && (this.#C = 0), this.#l = null, this.#fe(!1)), this.#gt(), i && ((e?.interlaced ?? !0) && (this.#P || this.#g === "main") ? this.#Te() : this.#ri()));
  }
  get scan() {
    return this.#m ? this.#pt?.scan ?? null : this.#B;
  }
  set videoTimeline(e) {
    this.#Re = e, this.#p?.postMessage({
      type: "timeline",
      videoTimeline: e
    }), e.length === 0 && (this.#B = null), this.#gt();
  }
  get videoTimeline() {
    return this.#Re;
  }
  /**
   * What to put on the screen for fullscreen: the `<div>` holding both the
   * element and the canvas once there is one, and the element itself before
   * that. Fullscreening the element alone would leave the canvas behind in
   * the page, and with it the only deinterlaced picture there is.
   */
  get container() {
    return this.#$ ?? this.#e;
  }
  /** Whether a picture goes up for every field rather than every frame. */
  get doubleRate() {
    return this.#L;
  }
  set doubleRate(e) {
    e !== this.#L && (this.#L = e, this.#Oe(), !this.#m && (this.#D(), this.#bi()));
  }
  get spatialCheck() {
    return this.#Z;
  }
  set spatialCheck(e) {
    e !== this.#Z && (this.#Z = e, this.#Oe());
  }
  get film() {
    return this.#I;
  }
  set film(e) {
    const t = this.#p ? this.#zt : this.#be;
    if (!(e === this.#I && (e === !1 || t === null))) {
      if (this.#p) {
        this.#I = e, this.#Oe(e ? "film" : void 0);
        return;
      }
      if (e) {
        if (!this.#Ge()) return;
        try {
          this.#Ti();
        } catch (i) {
          this.#I = !0, this.#Oe(), this.#wt(
            `film detector unavailable: ${i instanceof Error ? i.message : String(i)}`
          );
          return;
        }
      }
      if (this.#I = e, this.#Oe(), !e) {
        if (!this.#Ge()) return;
        this.#W = !1, this.#O = 0, this.#xe = !1, this.#N = T, this.#H(), this.#r?.destroy(), this.#r = null;
      }
      this.#bi();
    }
  }
  get debug() {
    return this.#V;
  }
  set debug(e) {
    e !== this.#V && (this.#V = e, this.#Oe());
  }
  /** Whether pictures are queued for presentation by the frame loop. */
  get #Ki() {
    return this.#L || this.#I;
  }
  #bi() {
    this.#j || this.#m || (this.#Ki ? (this.#U > 0 && this.#zi(), (this.#B?.interlaced ?? !0) && (this.#P || this.#g === "main") && this.#Te()) : this.#I || (this.#l = null, this.#fe(!1), this.#at()));
  }
  /** Apply mutable filter settings to the existing Worker and canvas. */
  #Oe(e) {
    this.#p?.postMessage({
      type: "settings",
      options: this.#xi(),
      retryFilm: e
    });
  }
  #gi() {
    if (this.#s.getExtension("EXT_color_buffer_float") === null)
      throw new Error("film needs EXT_color_buffer_float");
  }
  /** Build the GPU pulldown detector the `film` option needs, or throw. */
  #Ti() {
    this.#gi(), this.#r ??= new Y(this.#s), this.#U > 0 && this.#r.resize(this.#U, this.#Q);
  }
  #gt() {
    this.#m || this.#ye && (this.#Re.length > 0 || (this.#B?.interlaced ?? !0)) ? this.start() : this.stop();
  }
  /** Start the bundled Worker when the required transfer APIs are available. */
  #Ji() {
    return this.#P || this.#ae === "main" ? !1 : this.#g === "starting" || this.#g === "active" ? !0 : typeof Worker < "u" && typeof VideoFrame < "u" && typeof OffscreenCanvas < "u" && this.#kt !== null && "transferControlToOffscreen" in HTMLCanvasElement.prototype ? (this.#wi(), !0) : this.#ae === "auto" ? (this.#Ft(), !1) : (this.#g = "failed", this.#S = !1, !0);
  }
  /** Transfer the display canvas to a new Worker, replacing it if already transferred. */
  #wi() {
    this.#oe(), this.#p?.terminate(), this.#p = null, this.#_t(), this.#Ve = !1, this.#At = !1, this.#zt = null, this.#Wt = 0;
    let e = this.#i;
    if (this.#Nt) {
      e = document.createElement("canvas"), e.className = this.#i.className;
      const r = this.#i.getAttribute("style");
      r === null ? e.removeAttribute("style") : e.setAttribute("style", r), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e;
    }
    const t = ++this.#Ut;
    this.#g = "starting";
    let i, s;
    try {
      s = e.transferControlToOffscreen(), this.#Nt = !0, i = new Worker(this.#kt, { type: "module" });
    } catch (r) {
      this.#nt(
        r instanceof Error ? r.message : String(r)
      );
      return;
    }
    this.#p = i, i.onmessage = (r) => {
      t === this.#Ut && this.#es(r.data);
    }, i.onerror = (r) => {
      t === this.#Ut && (r.preventDefault(), this.#nt(r.message || "the deinterlacer worker failed"));
    }, i.postMessage(
      {
        type: "initialize",
        canvas: s,
        options: this.#xi(),
        scan: this.#B,
        videoTimeline: this.#Re,
        enabled: this.#S,
        video: this.#yt()
      },
      [s]
    ), this.#vt && i.postMessage({
      type: "pageVisibility",
      hidden: !0
    });
  }
  /** Apply Worker notifications and release the wait for the next input frame. */
  #es(e) {
    switch (e.type) {
      case "ready":
        this.#g = "active", this.#S && (this.#ht(), this.#Ct());
        break;
      case "failed":
        this.#nt(e.message);
        break;
      case "consumed": {
        this.#Ve = !1, this.#At = !0;
        const t = this.#_e;
        this.#_e = null, t && this.#yi(t);
        break;
      }
      case "visibility":
        this.#i.style.visibility = e.visible ? "visible" : "hidden";
        break;
      case "stats": {
        this.#m && (this.#Zt = e.stats.missed + e.stats.queueResetted);
        const t = {
          ...e.stats,
          dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0
        }, i = t.filmError ?? null, s = this.#Wt;
        if (this.#zt = i, this.#Wt = e.filmFailure, i !== null && e.filmFailure !== s) {
          this.dispatchEvent(
            new CustomEvent("failure", { detail: i })
          );
          try {
            this.#Lt?.(i);
          } catch {
          }
        }
        this.dispatchEvent(new CustomEvent("stats", { detail: t })), this.#It?.(t);
        break;
      }
      case "capture": {
        const t = this.#Qe.get(e.id);
        if (this.#Qe.delete(e.id), !t) {
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
        this.#xt.delete(e.id) && this.#ie(e.data);
        break;
    }
  }
  /**
   * Tell the owner that a rendering resource failed after construction.
   * In the worker domain the boundary counts episodes: the reason travels in
   * `stats.filmError` and the page derives the event from the episode count,
   * so a film degradation is never mistaken for worker death.
   */
  #Tt(e) {
    if (this.dispatchEvent(new CustomEvent("failure", { detail: e })), !this.#P)
      try {
        this.#Lt?.(e);
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
  #wt(e) {
    this.#be !== e && (this.#be = e, this.#W = !1, this.#O = 0, this.#xe = !1, this.#N = T, this.#H(), this.#r?.destroy(), this.#r = null, this.#Tt(e));
  }
  /**
   * Re-arm film reconstruction at a resource-reallocation point (start, scan
   * change, resize, or re-setting the option). The next frame retries; a
   * repeated failure degrades again and notifies as a new episode.
   */
  #Ge() {
    return this.#j ? !1 : (this.#p || (this.#be = null), !0);
  }
  /** Retry a transient Worker failure once, then show the media element if it fails again. */
  #nt(e) {
    if (this.#g === "starting" && this.#ae === "auto" && !this.#$e) {
      this.#Ft();
      return;
    }
    if (this.#Fi(e), !this.#$e) {
      this.#$e = !0, this.#wi();
      return;
    }
    console.error(`Deinterlacer Worker stopped: ${e}`), this.#g = "failed", this.#p?.terminate(), this.#p = null, this.#oe(), this.#_t(), this.#Tt(`deinterlacer worker stopped: ${e}`), this.stop();
  }
  /** Restore the main-thread canvas when automatic Worker selection fails. */
  #Ft() {
    const e = this.#t;
    e.className = this.#i.className;
    const t = this.#i.getAttribute("style");
    t === null ? e.removeAttribute("style") : e.setAttribute("style", t), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e, this.#Nt = !1, this.#p?.terminate(), this.#p = null, this.#g = "main", this.#oe(), this.#_t(), this.#S && (this.#ht(), this.#Ct(), (this.#B?.interlaced ?? !0) && this.#Te());
  }
  /** Close the queued frame still owned by the page when switching renderers. */
  #oe() {
    this.#_e?.frame.close(), this.#_e = null;
  }
  /** Reject captures whose replies would be lost when the Worker is rebuilt. */
  #Fi(e) {
    for (const t of this.#Qe.values())
      t.reject(new Error(e));
    this.#Qe.clear();
  }
  start() {
    if (!(this.#S || this.#j || this.#te) && (this.#ee++, this.#S = !0, this.#$i(), !!this.#Ge())) {
      if (this.#Cs(), this.#Ct(), this.#Ji()) {
        if (this.#m) {
          this.#p?.postMessage({
            type: "running",
            running: !0
          }), this.#Te();
          return;
        }
        this.#p?.postMessage({
          type: "enabled",
          enabled: !0
        }), this.#g === "active" && this.#ht();
        return;
      }
      this.#ht(), (this.#m || (this.#B?.interlaced ?? !0)) && this.#Te();
    }
  }
  /**
   * Take the deinterlaced picture away, leaving the element's own showing.
   * Decoded pictures held are released, and those pushed until the next
   * start() are released at once.
   */
  stop() {
    this.#ee++, this.#S && (this.#S = !1, this.#m && this.#Ri(), this.#u.cancel(), this.#ai(), this.#ri(), this.#w = 0, this.#l = null, this.#fe(!1), this.#oe(), this.#p?.postMessage(
      this.#m ? { type: "running", running: !1 } : { type: "enabled", enabled: !1 }
    ));
  }
  destroy() {
    if (!this.#j) {
      this.#j = !0, this.#ye = !1, this.stop(), this.#p?.postMessage({ type: "destroy" }), this.#p?.terminate(), this.#p = null, this.#oe(), this.#_t(), this.#Fi("the deinterlacer was destroyed"), this.#R?.removeEventListener(
        "visibilitychange",
        this.#oi
      ), this.#R = null, this.#k?.disconnect(), this.#t.removeEventListener(
        "webglcontextlost",
        this.#Yi
      ), this.#u.destroy(), this.#E?.destroy(), this.#e.removeEventListener("emptied", this.#Hi), this.#e.removeEventListener("resize", this.#Wi), this.#e.removeEventListener("pause", this.#me), this.#e.removeEventListener("ended", this.#me), this.#e.removeEventListener("seeking", this.#Vi), this.#e.removeEventListener("seeked", this.#me), this.#e.removeEventListener("ratechange", this.#me), this.#e.removeEventListener("waiting", this.#Qi), this.#Qt !== null && (this.#e.style.aspectRatio = this.#Qt), this.#fs(), this.#Bs();
      for (const e of this.#n) this.#s.deleteTexture(e);
      this.#n = [], this.#at();
      for (const e of [
        ...this.#ut,
        ...this.#Pe.map(({ q: t }) => t)
      ])
        this.#s.deleteQuery(e);
      this.#ut.length = 0, this.#Pe.length = 0, this.#r?.destroy(), this.#r = null, this.#et?.destroy(), this.#et = null, this.#Le !== null && (be(this.#Le), this.#Le = null), this.#s.deleteProgram(this.#A), this.#s.deleteProgram(this.#f), this.#s.getExtension("WEBGL_lose_context")?.loseContext();
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
    if (this.#g === "active" && this.#i.style.visibility === "visible" && this.#p) {
      const s = ++this.#ji, r = new Promise((h, o) => {
        this.#Qe.set(s, { resolve: h, reject: o });
      });
      return this.#p.postMessage({
        type: "capture",
        id: s,
        width: this.#e.videoWidth,
        height: this.#e.videoHeight
      }), r;
    }
    if (!this.#m && (this.#g === "starting" || this.#g === "failed"))
      return createImageBitmap(this.#e);
    const e = this.#l;
    if ((this.#P || this.#m) && (!this.#S || this.#te || !e))
      return Promise.reject(new Error("no rendered picture is available"));
    if (!this.#S || this.#te || !e)
      return createImageBitmap(this.#e);
    e.kind === "texture" ? this.#ui(e.texture, e.flip, !1) : this.#de(e.flush, e.second, null, !1);
    const t = this.#m ? this.#st : this.#e.videoWidth, i = this.#m ? this.#rt : this.#e.videoHeight;
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
  #ht() {
    this.#P || !this.#S || this.#m || this.#u.request(this.#as);
  }
  /** Copy the element's playback state for seek and presentation timing decisions. */
  #yt() {
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
  #ts(e, t, i) {
    let s;
    try {
      s = i?.clone() ?? new VideoFrame(this.#e, {
        timestamp: Math.max(0, Math.round(t.mediaTime * 1e6))
      });
    } catch (h) {
      const o = h instanceof Error ? h.message : String(h);
      this.#ae === "auto" && !this.#At && !this.#$e ? (this.#Ft(), this.#Mt(e, t)) : this.#nt(o);
      return;
    }
    const r = {
      id: ++this.#Zi,
      frame: s,
      now: e,
      metadata: t,
      video: this.#yt()
    };
    if (this.#Ve) {
      this.#_e?.frame.close(), this.#_e = r;
      return;
    }
    this.#yi(r);
  }
  /** Transfer the selected frame once the Worker has released the previous input. */
  #yi(e) {
    const t = this.#p;
    if (!t || this.#g !== "active") {
      e.frame.close();
      return;
    }
    this.#Ve = !0;
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
      this.#Ve = !1, e.frame.close();
      const r = s instanceof Error ? s.message : String(s);
      this.#ae === "auto" && !this.#At && !this.#$e ? (this.#Ft(), this.#Mt(e.now, e.metadata)) : this.#nt(r);
    }
  }
  #is(e, t, i) {
    this.#Le == null && (this.#Le = ve(this.#s, "20px monospace")), ge(this.#Le, e, t, i, this.#U, this.#Q, 20);
  }
  #Rt(e) {
    if (this.#Se == null || this.#Pe.length > 30)
      return;
    const t = this.#ut.pop() ?? this.#s.createQuery();
    return this.#s.beginQuery(this.#Se.TIME_ELAPSED_EXT, t), this.#Pe.push({ q: t, isField: e }), t;
  }
  #ce(e) {
    this.#Se != null && (e != null && this.#s.endQuery(this.#Se.TIME_ELAPSED_EXT), this.#Pe = this.#Pe.filter(
      ({ q: t, isField: i }) => {
        if (this.#s.getQueryParameter(t, this.#s.QUERY_RESULT_AVAILABLE)) {
          const s = this.#s.getQueryParameter(t, this.#s.QUERY_RESULT);
          return i ? (this.#qe += s, this.#Be++) : (this.#je += s, this.#Ce++), this.#ut.push(t), !1;
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
  #H(e = !1) {
    this.#N = T, this.#Ke = T, this.#Ie = 0, e || (this.#Ot = !1), this.#W = !1, this.#r?.reset(e);
  }
  /** Detect the pulldown phase of the frame being filtered on the GPU. */
  #ss() {
    const { prev: e, cur: t, next: i } = this.#di(!1), s = this.#n[e], r = this.#n[t], h = this.#n[i];
    if (!s || !r || !h) return;
    const o = this.#bt ? 0 : 1;
    this.#r?.measureComb(s, r, o), this.#r?.detect(r, h, o);
  }
  /**
   * Count the combing for the frame after the one being filtered. The count
   * says whether that frame's first field fits between this frame's
   * second-field lines. Returns whether the count was made.
   */
  #rs() {
    const { cur: e, next: t } = this.#di(!1), i = this.#n[e], s = this.#n[t], r = this.#r;
    if (!i || !s || !r) return !1;
    const h = this.#bt ? 0 : 1;
    try {
      r.measureComb(i, s, h, !0);
    } catch (o) {
      return this.#wt(
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
  #ns() {
    const e = this.#r?.poll() ?? null;
    e !== null && (this.#Ke = e, this.#Ie = e.age, this.#Ot = e.instant), this.#Ie++;
    const { phase: t, run: i } = this.#Ke;
    t === 0 || this.#Ie > Math.ceil(k * Math.max(1, this.#e.playbackRate)) ? this.#N = T : this.#N = {
      phase: (t - 1 + this.#Ie) % k + 1,
      run: i
    };
  }
  #hs(e) {
    const t = [], i = this.#r?.metrics ?? new Float32Array(0);
    for (let r = 0; r < p.phase; r++) {
      const h = i[r * 4] ?? 0, o = i[r * 4 + 1] ?? 0, a = i[r * 4 + 2] ?? 0;
      t.push(
        `${h.toFixed(3)},${o.toString().padStart(4)},${a.toFixed(3)}`
      );
    }
    const s = this.#ft.map((r, h) => `${h === 0 ? "-" : h}:${r}`).join(" ");
    return `frame=${e} phase=${this.#N.phase} run=${this.#N.run} known=${this.#Ke.phase}/${this.#Ke.run} age=${this.#Ie} ${this.#W ? "film" : "video"} period=${this.#C.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#dt}`;
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
  #Dt(e, t) {
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
  #os(e, t) {
    const i = e.expectedDisplayTime;
    if (!Number.isFinite(i) || i <= 0 || !Number.isFinite(e.timeOrigin)) return t;
    const s = this.#Dt(i, e.timeOrigin), r = pt * Math.max(this.#T, this.#C);
    return s < t - r || s > t + r ? t : s;
  }
  #as = (e, t) => {
    if (!this.#S || this.#te) return;
    this.#hi();
    const i = this.#Dt(e, t.timeOrigin), { frame: s, picture: r, ...h } = t;
    this.#De = s ?? this.#e, this.#F = r ?? null;
    try {
      this.#As(i, h, s);
    } finally {
      this.#De = this.#e, this.#F = null;
    }
    this.#ht();
  };
  /**
   * Take a frame from either acquisition path into the selected renderer.
   * `now` is the ingestion time on this realm's clock.
   */
  #As(e, t, i) {
    if (this.#g === "active") {
      this.#ts(e, t, i);
      return;
    }
    this.#g !== "starting" && this.#Mt(e, t);
  }
  /**
   * @internal Feed Worker input through the same history and rendering decisions
   * as main-thread input. `now` is the ingestion time on the Worker's clock.
   * The metadata's display time stays on the page's clock and is converted
   * using the accompanying timeOrigin.
   */
  ingestExternalFrame(e, t, i) {
    this.#De = i;
    try {
      this.#Mt(e, t);
    } finally {
      this.#De = this.#e;
    }
  }
  /** Queue a pushed picture in timestamp order. */
  #ls(e) {
    try {
      Oe(e), this.#m || this.#ms();
    } catch (r) {
      throw this.#ie(e.data), r;
    }
    if (this.#Yt++, this.#us(e.displayWidth, e.displayHeight), !this.#S) {
      this.#ie(e.data);
      return;
    }
    if (this.#g === "starting" || this.#g === "active") {
      this.#ds(e);
      return;
    }
    if (this.#mt && e.timestamp < this.#le[this.#b].timestamp + P) {
      this.#Kt(e.timestamp + e.duration), this.#ie(e.data);
      return;
    }
    const t = this.#ge;
    let i = t.length;
    for (; i > 0 && t[i - 1].timestamp > e.timestamp; )
      i--;
    t.splice(i, 0, e), this.#jt(this.#G.at(performance.now()));
    const s = Math.ceil(
      xt * Math.max(1, this.#e.playbackRate)
    );
    for (; t.length > s; )
      this.#x.queueResetted++, this.#ie(t.pop().data);
    this.#Ae = Math.max(
      this.#Ae,
      t.length
    );
  }
  /**
   * Note the size decoded pictures are shown at. An element playing only
   * sound has no proportions of its own, and a page that sizes its player
   * from the element's would lay it out as 2:1, so the element is given the
   * picture's.
   */
  #us(e, t) {
    if (!(e === this.#st && t === this.#rt)) {
      if (this.#st = e, this.#rt = t, this.#P || this.#j) {
        this.#ze();
        return;
      }
      this.#Qt ??= this.#e.style.aspectRatio, this.#e.style.aspectRatio = `${e} / ${t}`, this.#cs(), this.#e.dispatchEvent(new Event("resize"));
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
  #cs() {
    if (this.#Et) return;
    this.#Et = !0;
    const e = this.#e;
    Object.defineProperty(e, "videoWidth", {
      configurable: !0,
      get: () => this.#st
    }), Object.defineProperty(e, "videoHeight", {
      configurable: !0,
      get: () => this.#rt
    }), Object.defineProperty(e, "getVideoPlaybackQuality", {
      configurable: !0,
      value: () => ({
        creationTime: performance.now(),
        totalVideoFrames: this.#Yt,
        // Whole pictures that were never shown: too late to be taken in, or
        // more than are held. A Worker renderer keeps its own count.
        droppedVideoFrames: this.#x.missed + this.#x.queueResetted + this.#Zt,
        corruptedVideoFrames: 0
      })
    });
  }
  /** Give the element's own size and frame counts back. */
  #fs() {
    if (!this.#Et) return;
    this.#Et = !1;
    const e = this.#e;
    delete e.videoWidth, delete e.videoHeight, delete e.getVideoPlaybackQuality;
  }
  /** Transfer a picture to the Worker, which sends its buffer back when done. */
  #ds(e) {
    const t = ++this.#qi;
    try {
      this.#p.postMessage(
        { type: "picture", id: t, picture: e },
        [e.data]
      );
    } catch (i) {
      throw this.#ie(e.data), i;
    }
    this.#xt.set(t, e.data);
  }
  /** Hand back the buffers a Worker that is going away still holds. */
  #_t() {
    const e = [...this.#xt.values()];
    this.#xt.clear();
    for (const t of e) this.#ie(t);
  }
  /** Make pushed pictures the only pictures shown, from now on. */
  #ms() {
    this.#et = new ze(this.#s), this.#m = !0, this.#oe(), this.#u.cancel(), this.#ai(), this.#w = 0, this.#D(), this.#H(), this.#l = null, this.#U = 0, this.#Q = 0, this.#G.hold(), this.#gt(), this.#Te();
  }
  /** Hand a picture's buffer back to the producer. */
  #ie(e) {
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
  #Ri() {
    if (!this.#m) return;
    this.#p?.postMessage({
      type: "pictures",
      action: "reset"
    });
    const e = this.#ge;
    this.#ge = [], this.#Ht = !1, this.#mt = !1, this.#ke = !1, this.#tt = !1, this.#w = 0, this.#D(), this.#ue = null, this.#Ne = null, this.#$t = Number.NEGATIVE_INFINITY, this.#it = 1, this.#H(), this.#O = 0, this.#G.hold();
    for (const t of e) this.#ie(t.data);
  }
  /** Release pictures that will neither be shown nor be the neighbour of one that is. */
  #jt(e) {
    const t = this.#ge;
    for (; t.length > 2 && t[2].timestamp <= e; ) {
      const i = t.shift();
      this.#Kt(i.timestamp + i.duration), this.#ie(i.data);
    }
  }
  /**
   * Whether something that ended at `end` was there to be shown. What ended
   * at or before the place playback last started from was not: the pictures
   * a seek's target is given as the filter's neighbours, and whatever was
   * still queued when the position jumped past it. Before the first reading
   * of the clock nothing is known to have been skipped.
   */
  #Di(e) {
    return !(e <= this.#G.origin + P);
  }
  /**
   * Whether something ending at `end` that goes unshown counts against the
   * renderer. A hidden page is given no refreshes, so nothing goes up while it
   * is hidden, and what ended before the position it came back at passed
   * while it was. Neither was dropped for being late, and counting them would
   * report a background tab as thousands of dropped frames.
   */
  #qt(e) {
    return this.#vt || !this.#Di(e) ? !1 : !(this.#G.origin === this.#vi && e <= this.#Ei + P);
  }
  /** Note whether the page showing the canvas is hidden. */
  #_i(e) {
    e !== this.#vt && (this.#vt = e, this.#p?.postMessage({
      type: "pageVisibility",
      hidden: e
    }), !e && (this.#Ei = this.#G.at(performance.now()), this.#vi = this.#G.origin));
  }
  /**
   * @internal Tell a Worker renderer whether the page showing its canvas is
   * hidden. It has no document of its own to ask.
   */
  observePageVisibility(e) {
    this.#_i(e);
  }
  /** Count a decoded picture ending at `end` that was dropped unshown. */
  #Kt(e) {
    this.#qt(e) && this.#x.missed++;
  }
  /** Read the element's clock, as it was at `wall` on this realm's clock. */
  #Mi(e) {
    const t = this.#e;
    this.#G.observe(
      e,
      t.currentTime,
      t.playbackRate,
      !t.paused && !t.seeking && !t.ended
    ) && (this.#x.resynced++, this.#it = 1);
  }
  /**
   * @internal Give a Worker renderer a reading of the element's clock, taken
   * at `at` on the clock whose origin is `timeOrigin`. The element state it
   * belongs to has been applied to the Worker's video.
   */
  observeMediaClock(e, t) {
    this.#Mi(this.#Dt(e, t));
  }
  /** Send the page's reading of the element's clock to the Worker renderer. */
  #ps() {
    this.#p?.postMessage({
      type: "clock",
      video: this.#yt(),
      at: performance.now(),
      timeOrigin: performance.timeOrigin
    });
  }
  /** Take in what the coming refresh needs and put up what belongs on it. */
  #Es() {
    const e = this.#e;
    this.#P || this.#Mi(performance.now());
    const t = this.#G.rate, i = this.#G.at(this.#se + this.#T);
    if (Number.isNaN(i)) return;
    const s = this.#ee;
    this.#vs(i, t), this.#X(s) && this.#Fs(i, t, e.paused);
  }
  /**
   * Take in pictures until the history holds the successor of every picture
   * whose outputs are due within the lookahead of `time`, the media time of
   * the refresh being filled.
   */
  #vs(e, t) {
    const i = this.#ee, s = vt * this.#T * Math.max(1, t) / 1e3;
    for (this.#jt(e); ; ) {
      const o = this.#ge[0];
      if (o === void 0 || o.timestamp > e + s + o.duration || (o.width === this.#U && o.height === this.#Q ? this.#Ci() : b) < this.#xs(o))
        break;
      if (this.#ge.shift(), this.#bs(o, e, t), !this.#X(i)) return;
      this.#jt(e);
    }
    if (!this.#ke || this.#tt || this.#ge.length > 0 || this.#Ci() < this.#Si())
      return;
    const r = this.#le[this.#b], h = S * t / 1e3;
    (this.#Ht || r.timestamp <= e + h) && (this.#Jt(!0, e, t), this.#tt = !0);
  }
  /** Output slots a filtered picture takes. A repeated first field shares the first one's. */
  #Si() {
    return this.#L && !this.#W ? 2 : 1;
  }
  /** Output slots taking `picture` in can fill. */
  #xs(e) {
    const t = !e.interlaced || !this.#ye;
    return (this.#ke ? this.#Si() : 0) + (t ? 1 : 0);
  }
  /** Whether an output slot holds nothing still wanted. */
  #Pi(e) {
    const t = this.#a[e];
    if (t === void 0) return !1;
    const i = this.#l;
    if (i?.kind === "texture" && i.texture === t.texture || this.#ue?.slot === e || this.#Ne?.slot === e)
      return !1;
    for (const s of this.#Ue)
      if (s.slot === e) return !1;
    return !0;
  }
  #Ci() {
    let e = 0;
    for (let t = 0; t < this.#a.length; t++)
      this.#Pi(t) && e++;
    return e;
  }
  /** The next free output slot round the ring, or null. */
  #Bi() {
    for (let e = 1; e <= b; e++) {
      const t = (this.#v + e) % b;
      if (this.#Pi(t)) return t;
    }
    return null;
  }
  /**
   * Take a decoded picture into the history and filter the picture before it,
   * which has its successor now.
   */
  #bs(e, t, i) {
    const s = this.#mt ? this.#le[this.#b] : null, r = s === null ? 0 : s.timestamp + s.duration, h = e.width !== this.#U || e.height !== this.#Q, o = s === null || h || e.timestamp < r - P || e.timestamp - r > z, a = !o && e.timestamp - r > P, u = !e.interlaced || !this.#ye, A = this.#ke, f = this.#tt;
    this.#ke = !1, this.#tt = !1, A && !f && (o || u) && !h && this.#Jt(!0, t, i), o ? (s !== null && this.#x.discontinuities++, this.#w = 0, this.#H(), this.#O = 0) : s !== null && !u && s.interlaced && s.topFieldFirst !== e.topFieldFirst && this.#H(!0);
    const d = performance.now();
    this.#ci(d), this.#Ze = d;
    const l = this.#ee, c = this.#Rt(!1);
    try {
      if (h && (this.#mi(e.width, e.height), this.#a.length !== b))
        throw new Error("decoded pictures have no output textures");
      this.#gs(e);
    } catch (m) {
      this.#ce(c), this.#Tt(
        m instanceof Error ? m.message : String(m)
      ), this.stop();
      return;
    } finally {
      this.#ie(e.data);
    }
    if (u)
      e.interlaced || (this.#O > 0 && this.#O--, this.#Je = !0), this.#Ts(), this.#w = 0;
    else {
      if (A && !o) {
        const m = this.#le[(this.#b + v - 1) % v];
        this.#Vt = m.topFieldFirst, this.#Li(), this.#X(l) && this.#ki(
          a ? 1 : 0,
          Math.round(m.timestamp * 1e3),
          this.#L
        ), this.#X(l) && this.#Jt(!1, t, i);
      } else
        this.#Xt = a;
      this.#Je = !1, this.#ke = !0;
    }
    if (!this.#X(l)) {
      this.#j || this.#ce(c);
      return;
    }
    this.#ce(c), this.#Ee += performance.now() - d, this.#he++, this.#fi(d);
  }
  /** Convert a decoded picture into the next history slot. */
  #gs(e) {
    this.#b = (this.#b + 1) % v, this.#et.convert(e, this.#n[this.#b]);
    const t = this.#le[this.#b];
    t.timestamp = e.timestamp, t.duration = e.duration, t.interlaced = e.interlaced, t.topFieldFirst = e.topFieldFirst, t.repeatFirstField = e.repeatFirstField, this.#w = Math.min(this.#w + 1, v), this.#mt = !0;
  }
  /** Queue the newest picture as it is, both fields woven. */
  #Ts() {
    const e = this.#le[this.#b], t = this.#Bi();
    if (t === null) {
      this.#x.late++;
      return;
    }
    this.#v = t, this.#Gi(
      this.#n[this.#b],
      !0,
      this.#a[t].framebuffer
    ), this.#Ue.push({
      slot: t,
      time: e.timestamp,
      picture: e.timestamp,
      end: e.timestamp + e.duration,
      start: !0,
      scan: ie(e)
    });
  }
  /**
   * Filter the waiting picture into its outputs: against its successor, or
   * against itself with `flush`. Each output is queued at its own media time:
   * a field at its field's time, a film frame at its place in the film
   * cadence, one picture a frame at the first field's time.
   */
  #Jt(e, t, i) {
    const s = this.#le[e ? this.#b : (this.#b + v - 1) % v], r = this.#Ue;
    for (; r.length > 0 && r.at(-1).picture === s.timestamp; )
      r.pop();
    this.#Vt = s.topFieldFirst;
    const h = e ? Number.POSITIVE_INFINITY : this.#le[this.#b].timestamp, o = ie(s), a = s.timestamp + s.duration;
    let u = !1;
    if (this.#W && !e) {
      const A = this.#N.phase;
      if (A === N) {
        this.#dt++;
        return;
      }
      const f = s.timestamp + (te[A] ?? 0) * s.duration;
      u = this.#ei(
        f,
        f + s.duration * k / ee,
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
    } else if (!this.#L)
      u = this.#ei(
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
        const c = s.timestamp + l * f, m = this.#ei(
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
    !u && h <= t && this.#Kt(a);
  }
  /**
   * Filter one output into a slot and queue it for `at`, unless it can never
   * be shown. `until` is when the output after it is due and `pictureUntil`
   * when the next picture is; `picture` and `pictureEnd` are the picture's
   * own time and end. `slot` is a slot already holding the same field.
   * Returns the slot, or null.
   */
  #ei(e, t, i, s, r, h, o, a, u, A, f, d) {
    if (!this.#ws(e, t, i, f, d))
      return this.#qt(t) && this.#x.late++, null;
    if (a === null) {
      if (a = this.#Bi(), a === null)
        return this.#x.late++, null;
      this.#v = a, this.#de(u, o, this.#a[a].framebuffer);
    }
    return this.#Ue.push({
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
  #ws(e, t, i, s, r) {
    if (r === 0) return i > s;
    const h = 2 * S * r / 1e3;
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
  #Fs(e, t, i) {
    const s = this.#Ue;
    let r = 0;
    for (; r < s.length && !this.#Di(s[r].end); ) r++;
    r > 0 && s.splice(0, r);
    let h = -1;
    if (i) {
      for (let a = 0; a < s.length && s[a].picture <= e; a++)
        s[a].start && (h = a);
      if (h < 0) {
        const a = this.#ue, u = this.#Ne;
        let A = a !== null && a.picture <= e ? a : null;
        u !== null && u.picture <= e && (A === null || u.picture > A.picture) && (A = u), A !== null && A !== this.#pt && this.#Ii(A);
        return;
      }
      this.#it = 1;
    } else {
      let a = 0;
      for (; a < s.length && s[a].time <= this.#$t; )
        a++;
      const u = S * t / 1e3;
      let A = 0, f = 0;
      for (let l = a; l < s.length; l++) {
        const c = e - s[l].time;
        if (c >= u) A++;
        else if (c >= -u) f++;
        else break;
      }
      const d = Math.min(Math.max(this.#it, A), A + f);
      if (this.#it = d, d === 0) {
        s.splice(0, a);
        return;
      }
      h = a + d - 1;
      for (let l = a; l < h; l++)
        this.#qt(s[l + 1].time) && this.#x.late++;
    }
    const o = s[h];
    s.splice(0, h + 1), this.#Ii(o);
  }
  #Ii(e) {
    const t = performance.now(), i = this.#Rt(!0);
    this.#li(e.slot), this.#ce(i), this.#Me += performance.now() - t, this.#ve++, this.#pt = e, this.#$t = e.time, !(e === this.#ue || e === this.#Ne) && (e.start || this.#ue?.picture !== e.picture) && (this.#Ne = this.#ue, this.#ue = e.start ? e : null);
  }
  /** Take one input into the shared history and decide its YADIF or IVTC presentation. */
  #Mt(e, t) {
    const i = this.#ee;
    if (this.#X(i) && (this.#ys(t.mediaTime), !!this.#X(i) && t.width > 0 && t.height > 0)) {
      let s = !1;
      if (!this.#He && this.#e.seeking) {
        const c = this.#e.buffered, m = this.#C >= K ? this.#C / 1e3 : L / 1e3;
        for (let E = 0; E < c.length; E++)
          if (t.mediaTime >= c.start(E) && t.mediaTime < c.end(E) && Math.abs(t.mediaTime - this.#e.currentTime) <= m) {
            s = !0;
            break;
          }
      }
      if (s && (this.#He = !0), (this.#U === 0 || this.#Q === 0) && this.#mi(t.width, t.height), !this.#X(i)) return;
      if (this.#B && !this.#B.interlaced) {
        const c = performance.now();
        this.#ci(c), this.#Ze = c, this.#O > 0 && this.#O--, this.#Je = !0, this.#Ss(), this.#Ee += performance.now() - c, this.#he++, this.#ve++, this.#fi(c);
        return;
      }
      const r = t.mediaTime - this.#We, h = t.mozTiming, o = s || (h ? h.discontinuity || r < 0 || r > z : r < 0 || r > z);
      o && (this.#w = 0, this.#C = 0, this.#x.discontinuities++, this.#D(), this.#H(), (s || !this.#Je) && (this.#O = 0)), this.#Je = !1;
      const a = this.#Ps(t.presentedFrames, o);
      if (this.#w > 0 && t.mediaTime === this.#We && (!h || t.presentedFrames === this.#Bt))
        return;
      if (!o) {
        const c = h?.periodMs ?? 0;
        c > 0 ? this.#Ui(
          c * (this.#e.playbackRate || 1) / 1e3,
          1
        ) : this.#w > 0 && r > 0 && this.#Ui(r, a + 1);
      }
      this.#We = t.mediaTime, this.#Bt = t.presentedFrames;
      const u = performance.now();
      this.#ci(u), this.#Ze = u;
      const A = performance.now(), f = this.#Rt(!1);
      if (this.#Xi(), this.#Li(), !this.#X(i)) {
        this.#j || this.#ce(f);
        return;
      }
      if (this.#ki(
        a,
        t.presentedFrames,
        this.#L && this.#ot()
      ), !this.#X(i)) {
        this.#j || this.#ce(f);
        return;
      }
      const l = this.#os(t, e) + this.#T;
      if (this.#W)
        if (this.#ot()) {
          const c = this.#N.phase;
          if (c === N)
            this.#dt++, this.#pe++;
          else {
            const m = this.#C * k / ee, E = this.#si(1, e, m), x = te[c] ?? 0, de = E || this.#re === null ? l + m : l + x * this.#C;
            this.#St(
              "film",
              !1,
              this.#ti("film", de, m),
              m
            );
          }
        } else
          this.#de(!1, !1, null);
      else if (this.#L && this.#ot()) {
        const c = this.#C / 2, E = this.#si(2, e, c) || this.#re === null ? l + c * 2 : l, x = this.#ti("field", E, c);
        this.#St("field", !1, x, c), this.#St("field", !0, x + c, c);
      } else if (this.#ot()) {
        const c = this.#C, E = this.#si(1, e, c) || this.#re === null ? l + c : l;
        this.#St(
          "frame",
          !1,
          this.#ti("frame", E, c),
          c
        ) || (this.#x.late++, this.#de(!1, !1, null));
      } else
        this.#x.late += this.#o.length, this.#D(), this.#de(!1, !1, null);
      this.#Ae = Math.max(
        this.#Ae,
        this.#o.length
      ), this.#ce(f), this.#Ee += performance.now() - A, this.#he++, this.#fi(u);
    }
  }
  /** Rebuild the detector a retry point stood the engine back up for. */
  #Li() {
    if (this.#I && !this.#be && !this.#r)
      try {
        this.#Ti();
      } catch (e) {
        this.#wt(
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
  #ki(e, t, i) {
    if (this.#ct = !1, this.#xe = !1, this.#Gt = !1, this.#I && !this.#be) {
      let s = !1;
      if (this.#w === v && e === 0)
        try {
          this.#ns(), this.#ss(), s = !0;
        } catch (r) {
          this.#wt(
            `film detection failed: ${r instanceof Error ? r.message : String(r)}`
          );
        }
      else
        this.#H(!0);
      this.#ft[this.#N.phase] = (this.#ft[this.#N.phase] ?? 0) + 1, this.#W = this.#N.phase !== 0 && this.#N.run >= V, this.#W ? this.#O = Et : this.#O > 0 && this.#O--, this.#ct = s && !this.#Xt, this.#xe = this.#ct && this.#O > 0, this.#Gt = this.#xe && !this.#W && i && this.#rs(), this.#xe && !this.#W && this.#x.matched++, this.#V && (this.#pi = this.#hs(t));
    }
    this.#Xt = e > 0;
  }
  #X(e) {
    return !this.#j && this.#S && e === this.#ee;
  }
  #ys(e) {
    const t = this.#ee;
    let i;
    for (let h = this.#Re.length - 1; h >= 0; h--) {
      const o = this.#Re[h];
      if (o.start <= e + 1e-6) {
        i = o;
        break;
      }
    }
    if (i?.codedSize && (i.codedSize.width !== this.#U || i.codedSize.height !== this.#Q) && this.#mi(i.codedSize.width, i.codedSize.height), !this.#X(t)) return;
    const s = i?.scan;
    if (!s || this.#B?.interlaced === s.interlaced && this.#B.topFieldFirst === s.topFieldFirst)
      return;
    const r = this.#B?.interlaced;
    this.#B = s, this.#w = 0, this.#D(), this.#Ge() && (r !== s.interlaced && (this.#C = 0), s.interlaced && (this.#P || this.#g === "main") ? this.#Te() : this.#ri(), this.#H());
  }
  /**
   * Whether pictures are being filtered ahead of time and queued, rather than
   * drawn as their frame arrives.
   *
   * A picture for every frame has nothing to schedule -- there is one of them
   * and it goes up now -- and neither has a filter that has yet to see two
   * frames go by, since until then there is no idea how long a frame lasts.
   */
  #ot() {
    return (this.#L || this.#I) && this.#C > 0 && this.#a.length === b;
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
  #Ui(e, t) {
    const s = e * 1e3 / (this.#e.playbackRate || 1) / t;
    s < K || s > L || (this.#C = this.#C > 0 && s > this.#C * ut ? this.#C + (s - this.#C) * at : s);
  }
  /**
   * Filter one field into an output texture and put it in the queue.
   *
   * The three frames the filter reads are only the right three between one
   * frame arriving and the next, so both fields of a frame are built here and
   * held as pictures. What is queued after that is a copy waiting for a
   * moment, which no later frame can take away.
   */
  #St(e, t, i, s) {
    const r = this.#Ni();
    if (r === null) return !1;
    const h = this.#a[r];
    if (!h) return !1;
    for (this.#v = r; this.#o.length > 0 && this.#o[0]?.slot === r; )
      this.#o.shift(), this.#x.late++;
    this.#de(!1, t, h.framebuffer);
    const o = {
      slot: r,
      at: i,
      duration: s,
      cadence: e,
      phase: e === "film" ? this.#N.phase : e === "field" ? t ? 2 : 1 : 0,
      droppedBefore: this.#pe
    };
    return this.#pe = 0, this.#o.push(o), this.#re = o, !0;
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
  #ti(e, t, i) {
    if (!(i > 0)) return t;
    const s = this.#re, r = this.#T;
    if (s !== null && s.cadence === e) {
      const h = s.at + s.duration, o = h - t, a = Math.round(o / r), u = a - this.#z, A = o - a * r;
      if (a >= 0 && u <= 1) {
        const f = h + Math.max(
          -J,
          Math.min(J, -A * ct)
        );
        if (u === 0)
          return this.#K = 0, f;
        if (this.#K === 0 || u > 0 != this.#ne > 0 ? (this.#K = 0, this.#ne = u) : Math.abs(u) < Math.abs(this.#ne) && (this.#ne = u), ++this.#K < ft) return f;
        const d = this.#ne;
        return this.#K = 0, d < 0 ? (this.#z += d, f) : (this.#x.resynced++, this.#ii(f - d * r));
      }
      if (a < 0 && this.#z - a <= 1)
        return this.#z -= a, this.#K = 0, this.#x.resynced++, this.#ii(t);
    }
    return this.#z = 0, this.#K = 0, s !== null && this.#x.resynced++, this.#ii(t);
  }
  /** Start the chain again at `at`, which is where the caller's picture goes. */
  #ii(e) {
    for (let t = this.#o.at(-1); t && t.at >= e; )
      this.#o.pop(), this.#x.late++, t = this.#o.at(-1);
    return e;
  }
  /** Make room without treating ordinary capacity pressure as clock divergence. */
  #si(e, t, i) {
    const s = this.#o.at(-1), r = (H + 1) * Math.max(this.#T, i);
    if (s && s.at - t > r)
      return this.#D(), this.#x.queueResetted++, !0;
    const h = Math.max(
      0,
      this.#o.length + e - H
    );
    let o = 0, a = 0;
    for (; a < h; ) {
      const u = this.#o.shift();
      if (!u) break;
      o += u.duration, a++;
    }
    for (const u of this.#o) u.at -= o;
    return this.#x.late += a, !1;
  }
  /** Select an output whose pixels are not still represented by the canvas or queue. */
  #Ni() {
    const e = this.#l?.kind === "texture" ? this.#l.texture : null, t = new Set(this.#o.map(({ slot: s }) => s));
    for (let s = 1; s <= b; s++) {
      const r = (this.#v + s) % b, h = this.#a[r];
      if (h && h.texture !== e && !t.has(r))
        return r;
    }
    const i = this.#o[0];
    if (i) {
      const s = this.#a[i.slot];
      if (s && s.texture !== e) return i.slot;
    }
    return null;
  }
  /** The loop that puts filtered fields up, and the only thing that draws. */
  #Te() {
    this.#M === null && (!this.#S || this.#te || (this.#y = 0, this.#M = this.#Xe(this.#ni)));
  }
  #ri() {
    this.#Pt(this.#M), this.#M = null, this.#D();
  }
  #ni = (e) => {
    if (this.#M = null, !this.#S || this.#te) return;
    this.#Rs(e);
    const t = this.#ee;
    if (this.#m)
      this.#P || this.#g === "main" ? this.#Es() : this.#ps();
    else {
      if (this.#u.flush(e), !this.#X(t)) return;
      this.#g === "main" && this.#_s(this.#se, e);
    }
    this.#X(t) && (this.#M = this.#Xe(this.#ni));
  };
  /**
   * Fit a grid of refreshes (period and phase) to the animation frames. rAF
   * timestamps wander by a millisecond or so, which is more than the
   * nearest-refresh decision in #present can take; the grid is what it
   * compares against. A frame far off the grid restarts it. (otya)
   */
  #Rs(e) {
    const t = e - this.#y;
    this.#y = e;
    const i = Math.max(1, Math.round(t / this.#T)), s = this.#se + i * this.#T, r = e - s;
    if (this.#se === 0 || t <= 0 || t > L || Math.abs(r) > this.#T / 4) {
      t >= 1 && t <= L && (this.#T = t), this.#se = e;
      return;
    }
    this.#T += r / i * dt, this.#se = s + r * mt;
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
  #Oi() {
    const e = this.#P;
    if (e)
      return { frames: e, origin: performance.timeOrigin };
    const t = this.#i.ownerDocument?.defaultView ?? this.#e.ownerDocument?.defaultView ?? null;
    return t === null ? { frames: Tt, origin: performance.timeOrigin } : { frames: t, origin: t.performance.timeOrigin };
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
  #Xe(e) {
    const { frames: t, origin: i } = this.#Oi(), s = t.requestAnimationFrame(
      (r) => e(this.#Dt(r, i))
    );
    return { frames: t, handle: s };
  }
  /** Cancel a pending animation frame through the source that issued it. */
  #Pt(e) {
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
  #hi() {
    if (this.#P) return;
    this.#Ds(), this.#R && this.#_i(this.#R.hidden);
    const { frames: e } = this.#Oi(), t = this.#M !== null && this.#M.frames !== e, i = this.#c !== null && this.#c.frames !== e;
    !t && !i || (this.#y = 0, t && (this.#Pt(this.#M), this.#M = this.#Xe(this.#ni)), i && (this.#Pt(this.#c), this.#c = this.#Xe(this.#Ai)));
  }
  /** Watch the current document for visibility changes and DOM adoption. */
  #Ds() {
    const e = this.#P ? null : this.#i.ownerDocument ?? null;
    e !== this.#R && (this.#R?.removeEventListener(
      "visibilitychange",
      this.#oi
    ), this.#R = e, e?.addEventListener("visibilitychange", this.#oi), this.#k?.disconnect(), e && this.#k?.observe(e, { childList: !0, subtree: !0 }));
  }
  #oi = () => {
    this.#j || this.#hi();
  };
  /** Deliver faster-playback captures even when a Worker owns the drawing loop. */
  #Ct() {
    this.#P || this.#m || this.#c !== null || !this.#u.captureDriven || !this.#S || this.#te || (this.#c = this.#Xe(this.#Ai));
  }
  /** Cancel the page's pending capture delivery. */
  #ai() {
    this.#Pt(this.#c), this.#c = null;
  }
  /** Flush captured pictures on the refresh that will present them. */
  #Ai = (e) => {
    if (this.#c = null, !this.#S || this.#te) return;
    const t = this.#ee;
    this.#u.flush(e), this.#X(t) && this.#u.captureDriven && (this.#c = this.#Xe(this.#Ai));
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
  #_s(e, t) {
    const i = this.#T / 2, s = (a) => {
      const u = a.at - e;
      return u <= i - S ? !0 : u > i + S ? !1 : this.#q > 0;
    };
    for (; this.#o[1] && s(this.#o[1]); )
      this.#x.late++, this.#o.shift();
    const r = this.#o[0];
    if (!r || !s(r)) return;
    this.#o.shift(), this.#q = r.at - e;
    const h = performance.now(), o = this.#Rt(!0);
    this.#li(r.slot), this.#ce(o), this.#Me += performance.now() - h, this.#ve++, this.#V && this.#Ms(r, t), this.#Y = t;
  }
  /** Preserve upstream's opt-in presentation timing log in either renderer. */
  #Ms(e, t) {
    const i = this.#Y === 0 ? 0 : t - this.#Y, s = i / this.#T, r = e.cadence === "film" ? `phase ${e.phase}` : e.cadence === "field" ? `field ${e.phase}` : "frame", h = e.phase === 0 ? "duplicate" : `phase ${N}`, o = e.droppedBefore > 0 ? `, ${h} dropped before it` + (e.droppedBefore > 1 ? ` (${e.droppedBefore})` : "") : "";
    console.log(
      `yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at - t).toFixed(2)} ms${o}`
    );
  }
  /** Copy one of the filtered pictures onto the canvas. */
  #li(e) {
    const t = this.#a[e];
    t && this.#ui(t.texture);
  }
  /** Put a progressive frame through unchanged, keeping one display surface. */
  #Ss() {
    this.#Xi();
    const e = this.#n[this.#b];
    e && this.#ui(e, !0), this.#w = 0;
  }
  /** Apply visibility on the page; a Worker reports only the desired state. */
  #fe(e) {
    if (this.#P) {
      this.#P.onVisibility(e);
      return;
    }
    this.#i.style.visibility = e ? "visible" : "hidden";
  }
  #ui(e, t = !1, i = !0) {
    this.#Gi(e, t, null), this.#l = { kind: "texture", texture: e, flip: t }, this.#fe(!0), i && this.#J++;
  }
  /** Copy a texture onto the canvas or into an output. */
  #Gi(e, t, i) {
    const s = this.#s;
    s.bindFramebuffer(s.FRAMEBUFFER, i), s.useProgram(this.#f), s.activeTexture(s.TEXTURE0), s.bindTexture(s.TEXTURE_2D, e), s.uniform1i(this.#d, 0), s.uniform1i(this.#_, t ? 1 : 0), s.viewport(0, 0, this.#U, this.#Q), s.drawArrays(s.TRIANGLES, 0, 3);
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
  #Ps(e, t) {
    let i = 0;
    return this.#Ye !== 0 && !t && (i = Math.max(0, e - this.#Ye - 1), this.#x.missed += i), this.#Ye = e, i;
  }
  /**
   * Frames stopped arriving for a while -- a pause, a stall, a tab in the
   * background -- and a rate averaged over time nothing was asked of the
   * filter says nothing about it. Begin the interval at this frame.
   */
  #ci(e) {
    e - this.#Ze <= q || (this.#lt = e, this.#he = 0, this.#Ee = 0, this.#ve = 0, this.#Me = 0, this.#Ae = 0, this.#J = 0, this.#je = 0, this.#Ce = 0, this.#qe = 0, this.#Be = 0);
  }
  #fi(e) {
    const t = e - this.#lt;
    if (t < q) return;
    const i = !this.#m && this.#ot() && (this.#L || this.#W) ? this.#ve : this.#he, s = this.#he ? (this.#Ee + this.#Me) / this.#he : 0;
    let r;
    this.#Se != null && (r = 0, this.#Ce !== 0 && (r += this.#je / 1e6 / this.#Ce), this.#Be !== 0 && (r += this.#qe / 1e6 / this.#Be / 2));
    const h = {
      ...this.#x,
      // The element's own count of what its decoder could not keep up with,
      // which is the machine being behind rather than this filter.
      dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0,
      fps: i * 1e3 / t,
      frameMs: s,
      maxQueuedFields: this.#Ae,
      outputFps: this.#J * 1e3 / t,
      gpuMs: r,
      film: this.#W,
      oneInstant: this.#Ot,
      filmError: this.#be
    };
    this.dispatchEvent(new CustomEvent("stats", { detail: h })), this.#It?.(h), this.#lt = e, this.#he = 0, this.#Ee = 0, this.#ve = 0, this.#Me = 0, this.#Ae = 0, this.#J = 0, this.#je = 0, this.#Ce = 0, this.#qe = 0, this.#Be = 0;
  }
  /** Take the newest frame into the ring. */
  #Xi() {
    const e = this.#s;
    this.#b = (this.#b + 1) % v;
    const t = this.#F, i = this.#n[this.#b];
    t !== null && this.#E !== null && i !== void 0 ? (this.#n[this.#b] = this.#E.adopt(t, i), this.#F = null) : (e.bindTexture(e.TEXTURE_2D, i ?? null), e.texImage2D(
      e.TEXTURE_2D,
      0,
      e.RGBA,
      e.RGBA,
      e.UNSIGNED_BYTE,
      this.#De
    )), this.#w = Math.min(this.#w + 1, v);
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
  #de(e, t, i, s = !0) {
    if (this.#w === 0 || this.#te) return;
    s && (this.#w === v && !e ? this.#x.filtered++ : this.#x.degraded++);
    const r = this.#s, { prev: h, cur: o, next: a } = this.#di(e);
    r.bindFramebuffer(r.FRAMEBUFFER, i), r.useProgram(this.#A);
    for (const [m, E] of [h, o, a].entries())
      r.activeTexture(r.TEXTURE0 + m), r.bindTexture(r.TEXTURE_2D, this.#n[E] ?? null);
    r.uniform1i(this.#h.prev, 0), r.uniform1i(this.#h.cur, 1), r.uniform1i(this.#h.next, 2);
    const u = this.#I ? this.#r?.texture ?? null : null, A = this.#I ? this.#r?.combTexture ?? null : null, f = u !== null && A !== null;
    u !== null && A !== null && (r.activeTexture(r.TEXTURE0 + 3), r.bindTexture(r.TEXTURE_2D, u), r.uniform1i(this.#h.fieldMetrics, 3), r.activeTexture(r.TEXTURE0 + 4), r.bindTexture(r.TEXTURE_2D, A), r.uniform1i(this.#h.comb, 4));
    const d = this.#Gt ? this.#r?.combAheadTexture ?? null : null, l = f && !e;
    r.activeTexture(r.TEXTURE0 + 5), r.bindTexture(r.TEXTURE_2D, d), r.uniform1i(this.#h.combAhead, 5), r.activeTexture(r.TEXTURE0), r.uniform2i(this.#h.size, this.#U, this.#Q);
    const c = this.#bt ? 0 : 1;
    r.uniform1i(this.#h.parity, t ? 1 - c : c), r.uniform1i(this.#h.tff, this.#bt ? 1 : 0), r.uniform1i(this.#h.second, t ? 1 : 0), r.uniform1i(this.#h.spatialCheck, this.#Z ? 1 : 0), r.uniform1i(this.#h.debug, this.#V ? 1 : 0), r.uniform1i(this.#h.film, f ? 1 : 0), r.uniform1i(
      this.#h.match,
      l && this.#xe && (!t || d !== null) ? 1 : 0
    ), r.uniform1i(this.#h.instant, l && this.#ct ? 1 : 0), r.uniform1i(this.#h.phase, this.#N.phase), r.viewport(0, 0, this.#U, this.#Q), r.drawArrays(r.TRIANGLES, 0, 3), this.#V && f && this.#is(this.#pi, 0, 90), i === null && (this.#l = { kind: "yadif", flush: e, second: t }, this.#fe(!0), s && this.#J++);
  }
  #di(e) {
    const t = (i) => (this.#b + v - i) % v;
    return this.#w === 1 ? { prev: this.#b, cur: this.#b, next: this.#b } : e ? { prev: t(1), cur: this.#b, next: this.#b } : this.#w === 2 ? { prev: t(1), cur: t(1), next: this.#b } : { prev: t(2), cur: t(1), next: this.#b };
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
    if (this.#hi(), !this.#$) return;
    const e = this.#e, t = this.#m ? this.#st : e.videoWidth, i = this.#m ? this.#rt : e.videoHeight;
    if (t === 0 || i === 0) return;
    const s = Math.min(
      e.offsetWidth / t,
      e.offsetHeight / i
    ), r = t * s, h = i * s;
    this.#i.style.left = `${e.offsetLeft + (e.offsetWidth - r) / 2}px`, this.#i.style.top = `${e.offsetTop + (e.offsetHeight - h) / 2}px`, this.#i.style.width = `${r}px`, this.#i.style.height = `${h}px`;
  }
  #mi(e, t) {
    const i = this.#s;
    this.#t.width = e, this.#t.height = t, this.#U = e, this.#Q = t, this.#w = 0, this.#O = 0, this.#l = null, this.#D(), this.#ze();
    for (const s of this.#n) i.deleteTexture(s);
    this.#n = [];
    for (let s = 0; s < v; s++) {
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
      ), this.#n.push(r);
    }
    this.#at(), (this.#L || this.#I || this.#m) && this.#zi(), this.#et?.resize(e, t), this.#r?.resize(e, t), this.#Ge();
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
  #zi() {
    const e = this.#s;
    if (!(this.#a.length === b || this.#U === 0)) {
      this.#at();
      for (let t = 0; t < b; t++) {
        const i = e.createTexture();
        e.bindTexture(e.TEXTURE_2D, i), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), e.texImage2D(
          e.TEXTURE_2D,
          0,
          e.RGBA,
          this.#U,
          this.#Q,
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
          e.deleteFramebuffer(s), e.deleteTexture(i), this.#at();
          return;
        }
        this.#a.push({ texture: i, framebuffer: s });
      }
      this.#v = b - 1;
    }
  }
  #at() {
    const e = this.#s, t = this.#l?.kind === "texture" ? this.#l.texture : null;
    this.#a.some((i) => i.texture === t) && (this.#l = null), this.#pt = null, this.#ue = null, this.#Ne = null;
    for (const { texture: i, framebuffer: s } of this.#a)
      e.deleteFramebuffer(s), e.deleteTexture(i);
    this.#a = [], this.#D();
  }
  /**
   * Wrap the element in a `<div>` of this one's own and put the canvas over
   * it. The wrapper is what the canvas is positioned against; moving the
   * element out of the tree and back within the one task leaves playback
   * alone, which is what makes turning this on mid-stream free.
   */
  #Cs() {
    if (this.#$) return;
    const e = this.#e.parentElement;
    if (!e) return;
    const t = document.createElement("div");
    t.style.cssText = "position:relative;display:inline-block;line-height:0;max-width:100%", e.insertBefore(t, this.#e), t.appendChild(this.#e), t.appendChild(this.#i), this.#$ = t, this.#Fe?.observe(this.#e), this.#ze();
  }
  #Bs() {
    if (this.#P) return;
    const e = this.#$;
    this.#$ = null, this.#Fe?.disconnect(), this.#i.remove(), e?.parentElement && (e.parentElement.insertBefore(this.#e, e), e.remove());
  }
  #Wi = () => this.#ze();
  /** Forward a media event with the page's playback state that gives it meaning. */
  #we(e) {
    return !this.#p || this.#g === "main" ? !1 : (this.#p.postMessage({
      type: "event",
      name: e,
      video: this.#yt()
    }), !0);
  }
  #Hi = () => {
    if (this.#m) {
      this.#G.hold(), this.#we("emptied");
      return;
    }
    if (this.#we("emptied")) {
      this.#oe(), this.#fe(!1);
      return;
    }
    this.#w = 0, this.#We = 0, this.#Bt = 0, this.#D(), this.#H(), this.#O = 0, this.#C = 0, this.#$i(), this.#l = null, this.#fe(!1);
  };
  #$i() {
    this.#x = {
      filtered: 0,
      missed: 0,
      degraded: 0,
      discontinuities: 0,
      resynced: 0,
      late: 0,
      queueResetted: 0,
      matched: 0
    }, this.#Yt = 0, this.#Zt = 0, this.#ft.fill(0), this.#dt = 0, this.#Ye = 0, this.#lt = 0, this.#Ze = 0, this.#he = 0, this.#Ee = 0, this.#ve = 0, this.#Me = 0, this.#Ae = 0, this.#J = 0, this.#D(), this.#je = 0, this.#Ce = 0, this.#qe = 0, this.#Be = 0;
  }
  /**
   * A new seek invalidates any destination frame remembered for the last one.
   */
  #Vi = () => {
    if (this.#m) {
      this.#G.hold(), this.#we("seeking");
      return;
    }
    if (this.#we("seeking")) {
      this.#oe();
      return;
    }
    this.#He = !1;
  };
  /**
   * Playback stopped, so the frame being held back goes up now. One picture,
   * whatever the rate: a still frame stands for a moment, and the moment is
   * the one the first field was taken at.
   */
  #me = (e) => {
    if (this.#m) {
      this.#G.hold(), this.#we(
        e.type
      );
      return;
    }
    if (e.type === "ratechange" && (this.#u.captureDriven ? this.#Ct() : this.#ai()), (e.type === "pause" || e.type === "ended" || e.type === "seeked" || e.type === "ratechange") && this.#we(e.type)) {
      this.#oe();
      return;
    }
    if (e.type === "seeked") {
      const i = this.#He;
      if (this.#He = !1, i) return;
      this.#w = 0, this.#D(), this.#H(), this.#l = null, this.#fe(!1);
      return;
    }
    const t = e.type === "ratechange";
    if (t && (this.#C = 0, this.#We = this.#e.currentTime), this.#D(), this.#S && this.#w > 0) {
      const i = this.#Ni(), s = i === null ? void 0 : this.#a[i];
      i !== null && s ? (this.#v = i, this.#de(!0, !1, s.framebuffer), this.#li(i)) : this.#de(!0, !1, null);
    }
    t && (this.#w = 0, this.#Ye = 0, this.#H());
  };
  /** The element ran out of data. Its readings stop moving until it has more. */
  #Qi = () => {
    this.#m && (this.#G.hold(), this.#we("waiting"));
  };
  /**
   * A lost context takes the textures and the program with it. Rebuilding
   * them is possible, but a page that has lost its context has bigger
   * problems; getting out of the way leaves the element's own picture showing.
   */
  #Yi = (e) => {
    if (e.preventDefault(), this.#P) {
      this.#P.onFailure("the deinterlacer WebGL context was lost");
      return;
    }
    this.#g !== "active" && (this.#te = !0, this.#Tt("the deinterlacer WebGL context was lost"), this.stop());
  };
}
function se(n, e) {
  const t = n.createProgram(), i = re(n, n.VERTEX_SHADER, lt), s = re(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(t, i), n.attachShader(t, s), n.linkProgram(t), n.deleteShader(i), n.deleteShader(s), !n.getProgramParameter(t, n.LINK_STATUS)) {
    const r = n.getProgramInfoLog(t);
    throw n.deleteProgram(t), new Error(
      `the deinterlacer failed to link: ${r ?? "no reason given"}`
    );
  }
  return t;
}
function re(n, e, t) {
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
const ne = "data:video/mp4;base64,AAAAHGZ0eXBpc281AAACAGlzbzVpc282bXA0MQAAAu9tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAB8nRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAFoAAABDgAAAAAAY5tZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAHUwAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAE5bWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAA+XN0YmwAAACtc3RzZAAAAAAAAAABAAAAnWF2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAFoAQ4AEgAAABIAAAAAAAAAAEVTGF2YzYxLjE5LjEwMSBsaWJ4MjY0AAAAAAAAAAAAAAAY//8AAAA3YXZjQwFkACn/4QAZZ2QAKazZQFoET94CIAAAfSAAHUwD4sWywAEAB2j5KBLLIsD9+PgAAAAAEHBhc3AAAAABAAAAAQAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAAKG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAAAAAAAAAAAAAAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuNy4xMDAAAACYbW9vZgAAABBtZmhkAAAAAAAAAAEAAACAdHJhZgAAABx0ZmhkAAIAOAAAAAEAAAPpAAAEJwEBAAAAAAAUdGZkdAEAAAAAAAAAAAAAAAAAAEh0cnVuAAAKBQAAAAYAAACgAgAAAAAABCcAAAfSAAAAQgAAE40AAAA/AAAH0gAAAgAAAAAAAAAARAAAA+kAAAG7AAAH0gAACK9tZGF0AAACrwYF//+r3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTQgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDEzMyBtZT11bWggc3VibWU9MTAgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0yNCBjaHJvbWFfbWU9MSB0cmVsbGlzPTIgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xNSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9dGZmIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTIgYl9iaWFzPTAgZGlyZWN0PTMgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0wIGtleWludD0zMCBrZXlpbnRfbWluPTMgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD0zMCByYz1jcmYgbWJ0cmVlPTEgY3JmPTguMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAUGAQEygAAAAWdliIICAj/+/76ivgU3edyfbbnP6kzu1BfFPXa9rMu/FCi/GMk76JT20AAAAwAAAwAAAwAAAwAAAwAAAwEJmrWZnq7KhXxVTgAAAwAAAwAAAwAABJ9gAAADAAAKtgAAAwAAAwCi4AAAAwAAHQgAAAMAAAiqAAADAAADA7EAAAMAAAMCCgAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAL+QAAAAUGAQEygAAAADVBmiIWQj/51kP//f3t2AAPsAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAS8AAAAAUGAQEygAAAADJBnkETiEf/hv/80gAJcAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAkIQAAAAUGAQEygAAAAfMBnmCTRCP/9ZJR/1zH/6vL5qeSOTmASFdQlObW+4YAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAxvEAAAAwAAAwAAAwAAE4wAAAMAAAMAAAMAAFuAAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAMuAAAAABQYBATKAAAAANwGeYZakI//1bXH/Een/+rAALngAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAN+EAAAAFBgEBMoAAAAGuQZpileloiEf/2XyP/Fn/6mXyw21/v4X7ly3FFO60AAADAAADAAADAAADAAADAAADAAADADKWVJAQiFeS9HQZhFSJuVc/HAAAAwAAAwAAAwAAAwAAAwAAAwAAj8AAAAMAAAMABTIAAAMAAAMAAD+QAAADAAADAAQkAAADAAADAABJgAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAXUQAAAENtZnJhAAAAK3RmcmEBAAAAAAAAAQAAAAAAAAABAAAAAAAAB9IAAAAAAAADCwEBAQAAABBtZnJvAAAAAAAAAEM=", wt = 0.5, Ft = 3e3, he = 0.1, D = 16, oe = 'video/mp4; codecs="avc1.640029"';
let $ = null;
function yt(n = {}) {
  return $ ??= Rt(n), $;
}
async function Bt(n = {}) {
  return (await yt(n)).deinterlaces;
}
function It() {
  $ = null;
}
async function Rt(n) {
  const e = n.tolerance ?? wt, t = n.timeoutMs ?? Ft, i = performance.now(), s = (o) => ({
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
    h = _t(r, t);
    const o = G(O(r, "loadeddata"), t), a = r.play().then(
      () => !0,
      () => !1
    );
    if (await h.ready, await o, await Mt(r, t, await a), r.videoWidth === 0 || r.videoHeight === 0)
      return s(new Error("the probe clip decoded to nothing"));
    const u = St(r);
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
const W = typeof MediaSource > "u" ? globalThis.ManagedMediaSource : MediaSource, Dt = typeof MediaSource > "u";
function _t(n, e) {
  if (!W || !W.isTypeSupported(oe))
    throw new Error("the probe clip needs Media Source Extensions");
  const t = ne.indexOf(","), i = atob(ne.slice(t + 1)), s = new Uint8Array(i.length);
  for (let a = 0; a < i.length; a++) s[a] = i.charCodeAt(a);
  const r = new W(), h = URL.createObjectURL(r);
  if (Dt) {
    n.disableRemotePlayback = !0;
    const a = document.createElement("source");
    a.type = "video/mp4", a.src = h, n.append(a), n.load();
  } else
    n.src = h;
  const o = (async () => {
    await G(O(r, "sourceopen"), e);
    const a = r.addSourceBuffer(oe), u = G(O(a, "updateend"), e);
    a.appendBuffer(s), await u, r.endOfStream();
  })();
  return { url: h, ready: o };
}
async function Mt(n, e, t) {
  if (t) {
    const i = performance.now();
    for (; n.currentTime < he && performance.now() - i < e; )
      await new Promise((s) => requestAnimationFrame(s));
    n.pause();
  } else
    n.currentTime = he, await G(O(n, "seeked"), e);
}
function St(n) {
  const e = n.videoHeight, t = document.createElement("canvas");
  t.width = D, t.height = e;
  const i = t.getContext("2d", { willReadFrequently: !0 });
  if (!i) throw new Error("there is no 2d context to read the clip with");
  i.imageSmoothingEnabled = !1, i.drawImage(n, 0, 0, D, e);
  const s = i.getImageData(0, 0, D, e).data, r = (A) => {
    let f = 0;
    for (let d = 0; d < D; d++)
      f += s[(A * D + d) * 4 + 1] ?? 0;
    return f / D;
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
function O(n, e) {
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
function G(n, e) {
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
ot(me);
export {
  Ct as Deinterlacer,
  Ne as YADIF_FRAGMENT_SHADER,
  Ue as YADIF_UNIFORMS,
  Bt as decoderDeinterlaces,
  It as forgetDecoderProbe,
  yt as probeDecoder,
  Pt as supportsDeinterlace
};
//# sourceMappingURL=index.js.map
