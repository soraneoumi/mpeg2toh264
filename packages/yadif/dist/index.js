const Fe = "" + new URL("assets/worker-CAkDds4u.js", import.meta.url).href, C = `#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;
function y(n, e, t) {
  const i = n.createProgram(), s = q(n, n.VERTEX_SHADER, t), r = q(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(i, s), n.attachShader(i, r), n.linkProgram(i), n.deleteShader(s), n.deleteShader(r), !n.getProgramParameter(i, n.LINK_STATUS)) {
    const h = n.getProgramInfoLog(i);
    throw n.deleteProgram(i), new Error(
      `the deinterlacer failed to link: ${h ?? "no reason given"}`
    );
  }
  return i;
}
function D(n, e, t, i = 1) {
  const s = n.createTexture();
  n.activeTexture(n.TEXTURE0), n.bindTexture(n.TEXTURE_2D, s), n.texStorage2D(n.TEXTURE_2D, 1, n.RGBA8, 1, 1), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MIN_FILTER, n.NEAREST), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MAG_FILTER, n.NEAREST);
  const r = n.createFramebuffer();
  n.bindFramebuffer(n.FRAMEBUFFER, r);
  const h = [];
  for (let o = 0; o < i; o++) {
    const a = n.createTexture();
    n.bindTexture(n.TEXTURE_2D, a), n.texStorage2D(n.TEXTURE_2D, 1, t, 1, 1), n.framebufferTexture2D(
      n.FRAMEBUFFER,
      n.COLOR_ATTACHMENT0 + o,
      n.TEXTURE_2D,
      a,
      0
    ), h.push(a);
  }
  n.drawBuffers(h.map((o, a) => n.COLOR_ATTACHMENT0 + a)), n.bindTexture(n.TEXTURE_2D, s), n.useProgram(e), n.viewport(0, 0, 1, 1), n.drawArrays(n.TRIANGLES, 0, 3), n.bindFramebuffer(n.FRAMEBUFFER, null), n.deleteFramebuffer(r);
  for (const o of h) n.deleteTexture(o);
  n.deleteTexture(s);
}
function q(n, e, t) {
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
const Re = `#version 300 es
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
`, ye = `#version 300 es
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
function De(n, e) {
  const t = y(n, Re, ye), i = n.getAttribLocation(t, "aVertexPosition"), s = n.getAttribLocation(t, "aTextureCoord"), r = n.getUniformLocation(t, "uTexture"), h = n.getUniformLocation(t, "uMatrix"), o = n.getUniformLocation(t, "uUvMatrix"), a = n.getUniformLocation(t, "uTextColor"), u = n.getUniformLocation(t, "uBackColor");
  if (r == null || h == null || o == null || a == null || u == null)
    throw new Error(
      "failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER"
    );
  const A = n.createBuffer(), f = n.createBuffer();
  return {
    gl: n,
    ..._e(n, e),
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
function _e(n, e) {
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
function Me(n) {
  const e = n.gl;
  e.deleteBuffer(n.positionBuffer), e.deleteBuffer(n.textureBuffer), e.deleteTexture(n.fontTexture), e.deleteProgram(n.program);
}
function Ne(n, e, t, i, s, r, h) {
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
}, _ = 8, w = 16, X = 8, Se = 15, Pe = 6, Ce = 8, Ie = 30, Be = 0.01, Le = 2e-3, ve = 2, W = 1, Ue = 2, j = 10, ke = {
  a: "uA",
  b: "uB",
  fieldMetrics: "uFieldMetrics",
  first: "uFirst",
  size: "uSize"
}, be = 16, Te = 8, Oe = `#version 300 es

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
  const int BLOCK_W = ${be};
  const int BLOCK_H = ${Te};

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
`, Ge = {
  second: "uSecond",
  first: "uFirst",
  size: "uSize"
}, B = 8, Xe = `#version 300 es
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
`, We = {
  previous: "uPrevious",
  second: "uSecond",
  first: "uFirst",
  comb: "uComb",
  size: "uSize"
}, ze = `#version 300 es
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
  return differing <= ${ve}.0;
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
  bool believed = run >= ${j}.0;
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
  if (max(dSecondPrevious[2], dFirstPrevious[2]) <= ${Le}) return vec4(score, 0.0, 0.0, last[3]);
  ivec2 blocks = textureSize(uComb, 0);
  float combed = 0.0;
  for (int y = 0; y < blocks.y; ++y) {
    for (int x = 0; x < blocks.x; ++x) {
      if (texelFetch(uComb, ivec2(x, y), 0)[0] > ${X}.0) combed += 1.0;
    }
  }
  bool clean = combed <= ${Be} * float(blocks.x * blocks.y);
  score = clean ? min(score + 1.0, ${Ie}.0) : max(score - ${Ce}.0, 0.0);
  bool on = last[3] > 0.5 ? score >= ${Pe}.0 : score >= ${Se}.0;
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
`, He = {
  prev: "uPrev",
  cur: "uCur",
  first: "uFirst",
  size: "uSize"
}, $e = `#version 300 es
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
`, Ve = {
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
}, Ye = `#version 300 es
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
  return texelFetch(uFieldMetrics, ivec2(metric, 0), 0)[1] <= ${ve}.0;
}

/** The pulldown phase the detection gave this frame, or 0. See film-shader.ts. */
int detectedPhase() {
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${p.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${j}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${W} || phase == ${Ue};
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
    if (standing > ${X}.0) return false;
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
    return true;
  }
  float adjoining = uSecond ? texelFetch(uCombAhead, block, 0)[1]
                            : texelFetch(uComb, block, 0)[1];
  if (min(standing, adjoining) > ${X}.0) return false;
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
    bool combedBlock = (mixed ? comb[1] : comb[0]) > ${X}.0;
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
`, R = { phase: 0, run: 0 };
function U(n, e, t) {
  return Object.fromEntries(
    Object.entries(t).map(([i, s]) => [
      i,
      n.getUniformLocation(e, s)
    ])
  );
}
class J {
  #t;
  #i;
  #e;
  #u;
  #E;
  #F;
  #s;
  #n;
  #a;
  /** The block comparisons of both fields, and the same folded most of the way. */
  #o = null;
  #d = null;
  /** Combed pixels per block of the frame being filtered, both ways of weaving it. */
  #p = null;
  /** Combed pixels per block of the frame after the one being filtered. */
  #P = null;
  /** The field metrics (see FIELD_METRICS) of this frame and the one before. */
  #h = null;
  /** Which of the two holds the newest metrics. */
  #A = 0;
  /** The metrics being read back asynchronously. */
  #c = null;
  #l = null;
  #r = 0;
  #g = 0;
  /** The last metrics read back, laid out as FIELD_METRICS says. */
  metrics = new Float32Array(_ * 4);
  #b = 0;
  #T = 0;
  constructor(e) {
    this.#t = e, this.#i = y(
      e,
      Oe,
      C
    ), this.#e = U(
      e,
      this.#i,
      ke
    ), this.#u = y(
      e,
      Xe,
      C
    ), this.#E = U(
      e,
      this.#u,
      Ge
    ), this.#F = y(
      e,
      ze,
      C
    ), this.#s = U(e, this.#F, We), this.#n = y(e, $e, C), this.#a = U(e, this.#n, He), D(e, this.#i, e.RGBA32F, 2), D(e, this.#u, e.RGBA32F, 2), D(e, this.#F, e.RGBA32F), D(e, this.#n, e.RGBA32F);
  }
  /** The newest measurements, or null before any frame has been measured. */
  get texture() {
    return this.#h?.[this.#A]?.textures[0] ?? null;
  }
  /**
   * Combed pixels per block of the frame last measured by `measureComb`, or
   * null before one has been. See COMB_FRAGMENT_SHADER.
   */
  get combTexture() {
    return this.#p?.textures[0] ?? null;
  }
  /**
   * Combed pixels per block of the frame last measured with `ahead`, or null
   * before one has been.
   */
  get combAheadTexture() {
    return this.#P?.textures[0] ?? null;
  }
  /** The size of the frames to be measured, which sizes the block grid. */
  resize(e, t) {
    e === this.#b && t === this.#T || (this.#b = e, this.#T = t, this.#M());
  }
  /**
   * Forget the measurements: the next frame starts a cycle from nothing.
   * `keepInstant` keeps the one-instant score, for a gap in the frames when
   * the content has not changed.
   */
  reset(e = !1) {
    const t = this.#t;
    t.deleteSync(this.#l), this.#l = null, this.#r = 0;
    const i = this.#h?.[this.#A];
    if (!i) return;
    const s = e ? p.instant : _, r = new Float32Array(s * 4);
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
    if (this.#b === 0 || this.#T === 0) return;
    this.#D();
    const r = this.#o, h = this.#d, o = this.#h;
    if (r === null || h === null || o === null) return;
    const a = o[this.#A], u = o[1 - this.#A];
    if (s.bindFramebuffer(s.FRAMEBUFFER, r.framebuffer), s.useProgram(this.#i), this.#_(0, e, this.#e.a), this.#_(1, t, this.#e.b), this.#_(2, a.textures[0], this.#e.fieldMetrics), s.uniform1i(this.#e.first, i), s.uniform2i(this.#e.size, this.#b, this.#T), s.viewport(0, 0, r.width, r.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, h.framebuffer), s.useProgram(this.#u), this.#_(0, r.textures[0], this.#E.second), this.#_(1, r.textures[1], this.#E.first), s.uniform2i(this.#E.size, r.width, r.height), s.viewport(0, 0, h.width, h.height), s.drawArrays(s.TRIANGLES, 0, 3), s.bindFramebuffer(s.FRAMEBUFFER, u.framebuffer), s.useProgram(this.#F), this.#_(0, a.textures[0], this.#s.previous), this.#_(1, h.textures[0], this.#s.second), this.#_(2, h.textures[1], this.#s.first), this.#_(3, this.#p?.textures[0], this.#s.comb), s.uniform2i(this.#s.size, h.width, h.height), s.viewport(0, 0, _, 1), s.drawArrays(s.TRIANGLES, 0, 3), this.#A = 1 - this.#A, this.#r++, this.#l !== null) {
      s.bindFramebuffer(s.FRAMEBUFFER, null);
      return;
    }
    this.#g = this.#r, s.bindBuffer(s.PIXEL_PACK_BUFFER, this.#c), s.readPixels(0, 0, _, 1, s.RGBA, s.FLOAT, 0), s.bindBuffer(s.PIXEL_PACK_BUFFER, null), s.bindFramebuffer(s.FRAMEBUFFER, null), this.#l = s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE, 0), s.flush();
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
    if (this.#b === 0 || this.#T === 0) return;
    this.#D();
    const h = s ? this.#P : this.#p;
    h !== null && (r.bindFramebuffer(r.FRAMEBUFFER, h.framebuffer), r.useProgram(this.#n), this.#_(0, e, this.#a.prev), this.#_(1, t, this.#a.cur), r.uniform1i(this.#a.first, i), r.uniform2i(this.#a.size, this.#b, this.#T), r.viewport(0, 0, h.width, h.height), r.drawArrays(r.TRIANGLES, 0, 3), r.bindFramebuffer(r.FRAMEBUFFER, null));
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
          age: this.#r - this.#g
        };
      default:
        return null;
    }
  }
  destroy() {
    const e = this.#t;
    if (this.#M(), this.#h !== null) {
      for (const t of this.#h) P(e, t);
      this.#h = null;
    }
    e.deleteSync(this.#l), this.#l = null, e.deleteBuffer(this.#c), this.#c = null, e.deleteProgram(this.#i), e.deleteProgram(this.#u), e.deleteProgram(this.#F), e.deleteProgram(this.#n);
  }
  #_(e, t, i) {
    const s = this.#t;
    s.activeTexture(s.TEXTURE0 + e), s.bindTexture(s.TEXTURE_2D, t ?? null), s.uniform1i(i, e);
  }
  #M() {
    const e = this.#t;
    this.#o !== null && P(e, this.#o), this.#d !== null && P(e, this.#d), this.#p !== null && P(e, this.#p), this.#P !== null && P(e, this.#P), this.#o = null, this.#d = null, this.#p = null, this.#P = null;
  }
  /** Everything detect needs that is not there yet. */
  #D() {
    const e = this.#t;
    if (this.#o === null || this.#d === null || this.#p === null || this.#P === null) {
      this.#M();
      const t = Math.ceil(this.#b / be), i = Math.ceil(this.#T / (Te * 2));
      this.#o = M(e, t, i, 2), this.#d = M(
        e,
        Math.ceil(t / B),
        Math.ceil(i / B),
        2
      ), this.#p = M(
        e,
        Math.ceil(this.#b / w),
        Math.ceil(this.#T / w),
        1
      ), this.#P = M(
        e,
        Math.ceil(this.#b / w),
        Math.ceil(this.#T / w),
        1
      );
    }
    this.#h === null && (this.#h = [
      M(e, _, 1, 1),
      M(e, _, 1, 1)
    ], this.#A = 0, this.reset()), this.#c === null && (this.#c = e.createBuffer(), e.bindBuffer(e.PIXEL_PACK_BUFFER, this.#c), e.bufferData(
      e.PIXEL_PACK_BUFFER,
      this.metrics.byteLength,
      e.STREAM_COPY
    ), e.bindBuffer(e.PIXEL_PACK_BUFFER, null));
  }
}
function M(n, e, t, i) {
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
    throw P(n, o), new Error("failed to allocate framebuffer");
  return o;
}
function P(n, { framebuffer: e, textures: t }) {
  n.deleteFramebuffer(e);
  for (const i of t) n.deleteTexture(i);
}
function ee(n) {
  return Number.isInteger(n) && n > 0;
}
function Qe(n) {
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
  if (!ee(i) || !ee(s))
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
function te(n, e) {
  const t = 1 - n - e;
  return Float32Array.of(
    2 * (1 - n),
    2 * (1 - e) * e / t,
    2 * (1 - n) * n / t,
    2 * (1 - e)
  );
}
const Ze = {
  bt709: te(0.2126, 0.0722),
  bt601: te(0.299, 0.114)
}, je = `#version 300 es
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
class Ke {
  #t;
  #i;
  #e;
  #u;
  #E;
  #F;
  #s;
  #n;
  #a = [];
  #o = 0;
  #d = 0;
  /** Whether the target format was found renderable since the last resize. */
  #p = !1;
  constructor(e) {
    this.#t = e, this.#i = y(e, je, C), this.#e = e.getUniformLocation(this.#i, "uLuma"), this.#u = e.getUniformLocation(this.#i, "uCb"), this.#E = e.getUniformLocation(this.#i, "uCr"), this.#F = e.getUniformLocation(this.#i, "uInterlaced"), this.#s = e.getUniformLocation(this.#i, "uMatrix"), this.#n = e.createFramebuffer(), D(e, this.#i, e.RGBA8);
  }
  /** Allocate the plane textures for pictures of this luma size. */
  resize(e, t) {
    const i = this.#t;
    for (const s of this.#a) i.deleteTexture(s);
    this.#a = [];
    for (let s = 0; s < 3; s++) {
      const r = i.createTexture();
      i.bindTexture(i.TEXTURE_2D, r), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_MIN_FILTER, i.NEAREST), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_MAG_FILTER, i.NEAREST), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_WRAP_S, i.CLAMP_TO_EDGE), i.texParameteri(i.TEXTURE_2D, i.TEXTURE_WRAP_T, i.CLAMP_TO_EDGE), i.texStorage2D(
        i.TEXTURE_2D,
        1,
        i.R8,
        s === 0 ? e : Math.ceil(e / 2),
        s === 0 ? t : Math.ceil(t / 2)
      ), this.#a.push(r);
    }
    this.#o = e, this.#d = t, this.#p = !1;
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
      i.bindTexture(i.TEXTURE_2D, this.#a[r]), i.pixelStorei(i.UNPACK_ROW_LENGTH, o), i.texSubImage2D(
        i.TEXTURE_2D,
        0,
        0,
        0,
        r === 0 ? this.#o : Math.ceil(this.#o / 2),
        r === 0 ? this.#d : Math.ceil(this.#d / 2),
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
    ), !this.#p) {
      if (i.checkFramebufferStatus(i.FRAMEBUFFER) !== i.FRAMEBUFFER_COMPLETE)
        throw i.bindFramebuffer(i.FRAMEBUFFER, null), new Error("decoded pictures cannot be drawn into RGBA8");
      this.#p = !0;
    }
    i.useProgram(this.#i);
    for (let r = 0; r < 3; r++)
      i.activeTexture(i.TEXTURE0 + r), i.bindTexture(i.TEXTURE_2D, this.#a[r]);
    i.uniform1i(this.#e, 0), i.uniform1i(this.#u, 1), i.uniform1i(this.#E, 2), i.uniform1i(this.#F, e.interlaced ? 1 : 0), i.uniform4fv(this.#s, Ze[e.matrix]), i.viewport(0, 0, this.#o, this.#d), i.drawArrays(i.TRIANGLES, 0, 3), i.activeTexture(i.TEXTURE0), i.bindFramebuffer(i.FRAMEBUFFER, null);
  }
  destroy() {
    const e = this.#t;
    for (const t of this.#a) e.deleteTexture(t);
    this.#a = [], e.deleteFramebuffer(this.#n), e.deleteProgram(this.#i);
  }
}
const ie = 250, x = 4, qe = 0.01, Je = 100, et = 250, se = 0.5, F = 2;
class tt {
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
  #n = !1;
  /** Wall time between the last reading that changed and the reading before it. */
  #a = 0;
  /** Wall time of the last reading taken, changed or not. */
  #o = 0;
  #d = Number.NaN;
  /** Wall time of the last correction. */
  #p = 0;
  /** The highest error of a reading, in media seconds, per bucket; the last is the newest. */
  #P = new Float64Array(x);
  #h = 0;
  /** Whether the next reading holds the clock, as hold() asks. */
  #A = !0;
  /**
   * The longest the reading was seen unchanged before a change that moved it
   * as playing does, in media seconds, per BUCKET_MS of running; the last is
   * the newest. NaN for a bucket the clock has not run through.
   */
  #c = new Float64Array(x).fill(Number.NaN);
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
  #g = !1;
  /** While waiting: whether the last change came at playing pace. */
  #b = !1;
  /** While waiting after a stop on a standstill, until the reading changes. */
  #T = !1;
  /**
   * How far ahead of the sound the reading's first change was, in wall
   * milliseconds, at the last starts whose reading moved at the first
   * reading after the element was stopped, oldest overwritten first. NaN
   * until there have been that many.
   */
  #_ = new Float64Array(3).fill(Number.NaN);
  #M = 0;
  /**
   * While waiting after the element was stopped: where it was held. NaN
   * otherwise, and after a change between two rates it plays at.
   */
  #D = Number.NaN;
  /** The reading's first change after that hold, and when it was seen. */
  #j = Number.NaN;
  #f = Number.NaN;
  /**
   * While waiting: the lead the sound is worked out with, or NaN where the
   * position is the reading.
   */
  #N = Number.NaN;
  /** Whether the reading has stood since its first change, while the lead is in use. */
  #oe = !1;
  /** A reading that stood and then moved on at playing pace, while the lead is in use. */
  #ie = Number.NEGATIVE_INFINITY;
  /** The position at `wall`, in media seconds, or NaN while not known. */
  at(e) {
    return this.#E && !Number.isNaN(this.#N) && !Number.isNaN(this.#i) ? this.#V(e) : this.#i + this.#e * (e - this.#t) / 1e3;
  }
  /**
   * Where the sound is at `wall` while the clock waits on a reading known to
   * lead it: where the reading's first change was, less the lead, playing on
   * from there. Not before where the element was held, from where the sound
   * starts. Not past the reading and the time since it was read, which is the
   * furthest the element can be. Not behind a reading that stood and moved
   * on at playing pace, which is where the sound was when it moved.
   */
  #V(e) {
    const t = this.#u, i = this.#j + t * (e - this.#f - this.#N) / 1e3, s = this.#F + t * (e - this.#o) / 1e3;
    return Math.max(
      this.#ie,
      Math.min(s, Math.max(this.#D, i))
    );
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
    return this.#d;
  }
  /**
   * Stop at the next reading and wait for the readings to show playing: a
   * seek, a pause or a stall the element has reported. Readings taken across
   * the event say nothing about the position after it.
   */
  hold() {
    this.#A = !0, this.#i = Number.NaN, this.#e = 0;
  }
  /**
   * Take a reading of `currentTime` made at `wall`. `playing` is whether the
   * element is playing at all: not paused, seeking or ended. Returns whether
   * the clock started running again from this reading.
   */
  observe(e, t, i, s) {
    const r = e - this.#o;
    if (this.#o = e, !s || i === 0 || this.#A || i !== this.#u) {
      const v = i !== 0 && (!s || this.#u === 0 || i === this.#u);
      return this.#A = !1, this.#u = i, this.#S(e, t), v && (this.#D = t), !1;
    }
    const h = this.#r !== 0;
    if (!this.#E && !h && this.#se(r), t === this.#F) {
      if (this.#E)
        return Number.isNaN(this.#N) || (this.#oe = !0), !1;
      if (h)
        return e > this.#r && (this.#g = !0, this.#k(e, t, !0)), !1;
      const v = this.#J(i), I = Number.isNaN(v) ? et : v + r + F;
      return e - this.#s > I && this.#k(e, t, !Number.isNaN(v)), !1;
    }
    const o = (t - this.#F) * 1e3 / i, a = e - this.#s, u = a - r, A = this.#a;
    this.#F = t, this.#s = e, this.#a = r;
    const f = o <= a + A + F, d = o >= a * se && f;
    if (this.#E) {
      const v = !this.#n;
      if (this.#n = !0, v && !Number.isNaN(this.#D) && u <= F) {
        this.#j = t, this.#f = e;
        const K = this.#re();
        this.#N = K > r + F ? K : Number.NaN;
      } else this.#oe && o >= r * se && o <= r + A + F && (this.#ie = t);
      this.#T && !v && d && this.#H(u, i), this.#T = !1;
      const I = this.#I(i, r);
      if (!v && d) {
        if (I || this.#b)
          return this.#g = !1, this.#Y(
            e,
            t,
            i,
            r,
            I
          ), !0;
        this.#b = !0;
      } else if (this.#b = !1, v && !this.#g && I && o > 0 && f)
        return this.#Y(
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
        return this.#g = !0, this.#S(e, t), !1;
      this.#r = 0, this.#g = !1;
    } else d && this.#H(u, i);
    const l = t - this.at(e);
    if (Math.abs(l) > Je / 1e3 * i)
      return this.#d = t, this.#K(e, t), !0;
    const c = this.#P;
    e - this.#h >= ie ? (c.copyWithin(0, 1), c[x - 1] = l, this.#h = e) : c[x - 1] = Math.max(c[x - 1], l);
    let m = c[0];
    for (let v = 1; v < x; v++)
      m = Math.max(m, c[v]);
    const E = qe * i * (e - this.#p) / 1e3, b = Math.max(-E, Math.min(E, m));
    this.#p = e, this.#i += b;
    for (let v = 0; v < x; v++)
      c[v] = c[v] - b;
    return !1;
  }
  /**
   * Count running time towards the window of #stands. The window advances
   * only while the clock runs, so holds and seeks in quick succession keep
   * what the playing before them showed.
   */
  #se(e) {
    this.#l += e, !(this.#l < ie) && (this.#c.copyWithin(0, 1), this.#c[x - 1] = 0, this.#l = 0);
  }
  /**
   * Run from a reading that has just changed. Where the reading steps, the
   * start holds only if the next change comes within the longest stand seen
   * and one reading more.
   */
  #Y(e, t, i, s, r) {
    Number.isNaN(this.#f) || (this.#_[this.#M++ % this.#_.length] = (this.#j - t) * 1e3 / i + (e - this.#f)), this.#K(e, t), r && (this.#r = e + this.#J(i) + s + F);
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
  #k(e, t, i) {
    const s = this.#s;
    this.#S(e, t), i && (this.#s = s, this.#n = !0, this.#T = !0);
  }
  /** Note that the reading stood `stood` wall milliseconds between two updates. */
  #H(e, t) {
    const i = this.#c[x - 1], s = e * t / 1e3;
    this.#c[x - 1] = Number.isNaN(i) ? s : Math.max(i, s);
  }
  /**
   * Whether the element updates its reading in steps: in each whole bucket
   * of the last second of running the reading stood, between two updates,
   * for longer than readings taken close together and at least as long as
   * the time between readings. One reading that happened to repeat does not
   * make it so.
   */
  #I(e, t) {
    let i = Number.POSITIVE_INFINITY;
    for (let r = 0; r < x - 1; r++) {
      const h = this.#c[r];
      if (Number.isNaN(h)) return !1;
      i = Math.min(i, h);
    }
    const s = i * 1e3 / e;
    return s > F && s + F >= t;
  }
  /**
   * The longest the reading was seen to stand between updates over the last
   * second of running, in wall milliseconds at `playbackRate`. NaN until the
   * clock has run through a whole bucket: the newest one is still filling.
   */
  #J(e) {
    let t = Number.NaN;
    for (let s = 0; s < x - 1; s++) {
      const r = this.#c[s];
      Number.isNaN(r) || (t = Number.isNaN(t) ? r : Math.max(t, r));
    }
    if (Number.isNaN(t)) return t;
    const i = this.#c[x - 1];
    return Number.isNaN(i) || (t = Math.max(t, i)), t * 1e3 / e;
  }
  /**
   * The lead of the last starts, the middle of them, so that one start the
   * element made differently does not move it. NaN until there have been
   * enough.
   */
  #re() {
    const [e, t, i] = this.#_;
    return Number.isNaN(e) || Number.isNaN(t) || Number.isNaN(i) ? Number.NaN : Math.max(Math.min(e, t), Math.min(Math.max(e, t), i));
  }
  #S(e, t) {
    this.#D = Number.NaN, this.#j = Number.NaN, this.#f = Number.NaN, this.#N = Number.NaN, this.#oe = !1, this.#ie = Number.NEGATIVE_INFINITY, this.#T = !1, this.#b = !1, this.#r = 0, this.#t = e, this.#i = t, this.#e = 0, this.#E = !0, this.#n = !1, this.#F = t, this.#s = e, this.#d = t;
  }
  #K(e, t) {
    this.#f = Number.NaN, this.#N = Number.NaN, this.#r = 0, this.#t = e, this.#i = t, this.#e = this.#u, this.#E = !1, this.#p = e, this.#h = e, this.#P.fill(Number.NEGATIVE_INFINITY), this.#P[x - 1] = 0;
  }
}
const L = 16, it = 6, st = `#version 300 es
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
class rt {
  #t;
  #i;
  #e = null;
  #u = null;
  /** Textures available for the next take. */
  #E = [];
  #F = 0;
  /** Readback buffers available for the next comparison. */
  #s = [];
  #n = new Uint8Array(0);
  /** Takes still held, oldest first. */
  #a = [];
  /** The newest take. The next take is compared with it. */
  #o = null;
  #d = 0;
  constructor(e, t) {
    this.#t = e, this.#i = t;
  }
  take() {
    const e = this.#t, t = this.#E.pop() ?? this.#A();
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
      id: ++this.#d,
      texture: t,
      width: i,
      height: s,
      changed: null,
      fence: null,
      buffer: null,
      reported: !1
    }, h = this.#o;
    return h === null || h.width !== i || h.height !== s ? r.changed = !0 : this.#p(r, h), this.#o = r, this.#a.push(r), r.id;
  }
  settle() {
    const e = this.#t, t = this.#a.find((i) => !i.reported);
    if (t === void 0 || t === this.#o) return null;
    if (t.changed === null) {
      const { fence: i, buffer: s } = t;
      if (i === null || s === null) return null;
      const r = e.clientWaitSync(i, 0, 0);
      if (r !== e.ALREADY_SIGNALED && r !== e.CONDITION_SATISFIED)
        return null;
      this.#n.byteLength < s.bytes && (this.#n = new Uint8Array(s.bytes));
      const h = this.#n.subarray(0, s.bytes);
      e.bindBuffer(e.PIXEL_PACK_BUFFER, s.buffer), e.getBufferSubData(e.PIXEL_PACK_BUFFER, 0, h), e.bindBuffer(e.PIXEL_PACK_BUFFER, null), t.changed = nt(h), this.#P(t);
    }
    return t.reported = !0, { id: t.id, changed: t.changed };
  }
  /**
   * Give the texture of a reported take to the caller and accept a texture in
   * exchange. The replacement becomes available for later takes.
   */
  adopt(e, t) {
    const i = this.#a.findIndex((r) => r.id === e), s = this.#a[i];
    if (s === void 0 || !s.reported)
      throw new Error(`picture ${e} is not available to adopt`);
    return this.#a.splice(i, 1), this.#E.push(t), s.texture;
  }
  release(e) {
    const t = this.#a.findIndex((s) => s.id === e), i = this.#a[t];
    i !== void 0 && (this.#a.splice(t, 1), this.#h(i));
  }
  reset() {
    const e = this.#a;
    this.#a = [], this.#o = null;
    for (const t of e)
      this.#P(t), this.#h(t);
  }
  destroy() {
    const e = this.#t;
    this.reset();
    for (const t of this.#E) e.deleteTexture(t);
    this.#E = [], this.#F = 0;
    for (const { buffer: t } of this.#s) e.deleteBuffer(t);
    this.#s = [], this.#r(), this.#e !== null && e.deleteProgram(this.#e), this.#e = null;
  }
  /** Compare a take with the reference on the GPU and start reading back the result. */
  #p(e, t) {
    const i = this.#t, s = Math.ceil(e.width / L), r = Math.ceil(e.height / L), h = this.#l(s, r), o = this.#g(s * r * 4);
    this.#e ??= this.#c(), i.bindFramebuffer(i.FRAMEBUFFER, h.framebuffer), i.useProgram(this.#e), i.activeTexture(i.TEXTURE1), i.bindTexture(i.TEXTURE_2D, t.texture), i.activeTexture(i.TEXTURE0), i.bindTexture(i.TEXTURE_2D, e.texture), i.viewport(0, 0, s, r), i.drawArrays(i.TRIANGLES, 0, 3), i.bindBuffer(i.PIXEL_PACK_BUFFER, o.buffer), i.readPixels(0, 0, s, r, i.RGBA, i.UNSIGNED_BYTE, 0), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), i.bindFramebuffer(i.FRAMEBUFFER, null), e.fence = i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE, 0), e.buffer = o, i.flush();
  }
  /** Release the fence and readback buffer of a comparison, whether or not it was read. */
  #P(e) {
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
    this.#E.push(e.texture);
  }
  #A() {
    if (this.#F === it) return null;
    const e = this.#t, t = e.createTexture();
    return e.bindTexture(e.TEXTURE_2D, t), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), this.#F++, t;
  }
  #c() {
    const e = this.#t, t = y(e, st, C);
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
  #g(e) {
    const t = this.#s.pop();
    if (t !== void 0) return t;
    const i = this.#t, s = i.createBuffer();
    return i.bindBuffer(i.PIXEL_PACK_BUFFER, s), i.bufferData(i.PIXEL_PACK_BUFFER, e, i.STREAM_COPY), i.bindBuffer(i.PIXEL_PACK_BUFFER, null), { buffer: s, bytes: e };
  }
}
function nt(n) {
  for (let e = 0; e < n.length; e += 4)
    if (n[e] !== 0 || n[e + 1] !== 0 || n[e + 2] !== 0)
      return !0;
  return !1;
}
const xe = [
  "mozParsedFrames",
  "mozDecodedFrames",
  "mozPresentedFrames",
  "mozPaintedFrames"
];
function ge(n) {
  return xe.every((e) => e in n);
}
function ht(n) {
  return n.ownerDocument?.defaultView?.performance.timeOrigin ?? performance.timeOrigin;
}
function ot() {
  return typeof HTMLVideoElement < "u" && (ge(HTMLVideoElement.prototype) || typeof HTMLVideoElement.prototype.requestVideoFrameCallback == "function");
}
const at = 250, $ = 500, At = 1.75, ut = 3, lt = 200;
class ct {
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
  #n = 0;
  /** When the last delivered take was made, and the painted count when it was delivered. */
  #a = null;
  #o = null;
  #d = null;
  #p = null;
  #P = null;
  #h = null;
  #A = !0;
  #c = null;
  #l = null;
  #r = 0;
  #g;
  #b;
  #T = null;
  #_ = null;
  #M = null;
  #D = null;
  #j = 0;
  #f = [];
  #N = [];
  constructor(e, t) {
    if (this.#t = e, this.#e = t, this.#i = ge(e) ? e : null, this.#g = this.#i === null && typeof VideoFrame < "u", this.#b = this.#g && e.playbackRate > 1, this.#i) {
      for (const i of ["emptied", "seeking", "seeked"])
        e.addEventListener(i, this.#H);
      for (const i of ["pause", "playing", "waiting", "ratechange"])
        e.addEventListener(i, this.#k);
    }
    if (this.#g)
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
    return this.#b;
  }
  request(e) {
    if (this.#p === null) {
      if (this.#p = e, this.#b) {
        this.#V();
        return;
      }
      this.#d = this.#i ? requestAnimationFrame(this.#S) : this.#t.requestVideoFrameCallback(this.#J);
    }
  }
  cancel() {
    this.#d !== null && (this.#i ? cancelAnimationFrame(this.#d) : this.#t.cancelVideoFrameCallback(this.#d)), this.#d = null, this.#p = null, this.#T?.(), this.#T = null, this.#M !== null && this.#t.cancelVideoFrameCallback(this.#M), this.#M = null, this.#oe(), this.#D = null, this.#f = [], this.#b = this.#g && this.#t.playbackRate > 1, this.#H();
  }
  destroy() {
    this.cancel();
    for (const e of ["emptied", "seeking", "seeked"])
      this.#t.removeEventListener(e, this.#H);
    for (const e of ["pause", "playing", "waiting", "ratechange"])
      this.#t.removeEventListener(e, this.#k);
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
    if (this.#b)
      for (this.#t.ownerDocument !== this.#_ && (this.#T?.(), this.#T = null, this.#V()); this.#N.length > 0 && this.#p !== null; ) {
        const t = this.#N.shift(), i = t.frame;
        try {
          this.#re(e, {
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
  #oe() {
    for (const e of this.#N) e.frame.close();
    this.#N = [];
  }
  #ie = (e) => {
    const t = this.#g && this.#t.playbackRate > 1;
    if (t !== this.#b) {
      const i = this.#p;
      this.cancel(), this.#b = t, i !== null && this.request(i);
      return;
    }
    ["seeking", "seeked", "emptied", "ratechange"].includes(e.type) && (this.#D = null, this.#f = []), this.#b && ((e.type === "pause" || e.type === "ended") && this.flush(performance.now()), this.#oe(), this.#T?.(), this.#T = null, this.#p !== null && this.#V());
  };
  #V() {
    if (!this.#b || this.#T !== null || this.#p === null || (this.#t.paused || this.#t.ended) && this.#D !== null)
      return;
    this.#M === null && typeof this.#t.requestVideoFrameCallback == "function" && (this.#M = this.#t.requestVideoFrameCallback(
      this.#se
    ));
    const e = Math.max(4, 8 / Math.max(1, this.#t.playbackRate)), t = this.#t.ownerDocument?.defaultView;
    if (this.#_ = this.#t.ownerDocument, t) {
      const i = t.setTimeout(this.#Y, e);
      this.#T = () => t.clearTimeout(i);
    } else {
      const i = setTimeout(this.#Y, e);
      this.#T = () => clearTimeout(i);
    }
  }
  #se = () => {
    this.#M = null, this.#T?.(), this.#T = null, this.#Y();
  };
  #Y = () => {
    this.#T = null;
    const e = this.#t;
    if (this.#p === null) return;
    if (e.readyState < 2 || e.seeking) {
      this.#V();
      return;
    }
    let t;
    try {
      t = new VideoFrame(e);
    } catch (i) {
      if (!(i instanceof DOMException) || i.name !== "InvalidStateError")
        throw i;
      this.#V();
      return;
    }
    if (t.timestamp === this.#D)
      t.close();
    else {
      let i = 1;
      if (this.#D !== null) {
        const s = t.timestamp - this.#D;
        if (s > 1e3 && s < 25e4 && (this.#f.push(s), this.#f.length > 7 && this.#f.shift()), s > 0 && this.#f.length > 0) {
          const r = [...this.#f].sort((o, a) => o - a), h = r[Math.floor(r.length / 2)];
          i = Math.max(1, Math.round(s / h));
        }
      }
      for (this.#D = t.timestamp, this.#j += i, this.#N.push({
        frame: t,
        at: performance.now(),
        count: this.#j
      }); this.#N.length > 4; ) this.#N.shift().frame.close();
    }
    this.#V();
  };
  #k = () => {
    this.#c = null, this.#l = null, this.#r = 0;
  };
  #H = () => {
    this.#P = null, this.#h = null, this.#A = !0, this.#I(), this.#k();
  };
  /** Discard all takes. The next take has no reference to compare with. */
  #I() {
    this.#u?.reset(), this.#E = [], this.#n = 0;
  }
  /** Native acquisition: pass the report on, with the clock it was made on. */
  #J = (e, t) => {
    this.#re(e, {
      width: t.width,
      height: t.height,
      mediaTime: t.mediaTime,
      presentedFrames: t.presentedFrames,
      expectedDisplayTime: t.expectedDisplayTime,
      timeOrigin: ht(this.#t)
    });
  };
  #re = (e, t) => {
    const i = this.#p;
    this.#d = null, this.#p = null, i?.(e, t);
  };
  #S = (e) => {
    const t = this.#i, i = xe.map((a) => t[a]);
    this.#P?.some((a, u) => i[u] < a) && this.#H(), this.#P = i;
    const s = this.#e?.() ?? null;
    s !== this.#u && (this.#H(), this.#u = s);
    const r = t.mozPaintedFrames, h = !t.seeking && t.readyState >= 2 && t.videoWidth > 0 && t.videoHeight > 0, o = this.#h === null && (r > 0 || t.paused && (t.mozPresentedFrames > 0 || t.mozDecodedFrames > 0));
    if (s !== null) {
      this.#me(e, t, s, h, o);
      return;
    }
    if (h && (o || this.#h !== null && r !== this.#h)) {
      this.#c !== null && e - this.#c > $ && (this.#k(), this.#A = !0), this.#K(e, t), this.#c = e, this.#h = r;
      const a = this.#A;
      this.#A = !1, this.#re(e, {
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
      this.#d = requestAnimationFrame(this.#S);
  };
  /** Update the cadence estimate from the painted count. Called on a poll where the count advanced. */
  #K(e, t) {
    if (t.paused || t.ended) return;
    const i = t.mozPaintedFrames, s = this.#l;
    if (s && e - s.at >= at) {
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
  #me(e, t, i, s, r) {
    const h = t.mozPaintedFrames, o = this.#h !== null && h !== this.#h;
    this.#s !== null && e - this.#s > $ && (this.#I(), this.#k(), this.#A = !0), this.#s = e, o && this.#K(e, t);
    const a = t.paused || t.ended;
    (!a || o) && (this.#n = 0), a && this.#a !== null && (this.#a = e);
    const u = a && this.#n >= ut;
    if (s && (r || this.#h !== null)) {
      this.#h = h;
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
      if (m ? this.#n = 0 : (this.#n = c.resting ? this.#n + 1 : 0, m = A === null && !c.resting && this.#a !== null && (c.at - this.#a) * (t.playbackRate || 1) >= lt && h !== this.#o), !m) {
        i.release(c.id);
        continue;
      }
      A !== null && i.release(A.id), A = c;
    }
    if (A === null) {
      this.#d = requestAnimationFrame(this.#S);
      return;
    }
    let f = 1;
    if (this.#c !== null) {
      const l = A.at - this.#c;
      l > $ ? (this.#k(), this.#A = !0) : this.#r > 0 && l > this.#r * At && (f = Math.round(l / this.#r));
    }
    this.#F += f, this.#c = A.at, this.#a = A.at, this.#o = h;
    const d = this.#A;
    this.#A = !1;
    try {
      this.#re(e, {
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
        mozTiming: { periodMs: this.#r, discontinuity: d },
        picture: A.id
      });
    } finally {
      i.release(A.id);
    }
  }
}
let we = null;
function ft(n) {
  we = n;
}
const V = 0.5, T = 4, Q = 5, g = Q + 1, re = 1e3, ne = 4, k = 200, dt = 0.25, mt = 1e3 / 60, pt = `#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`, Et = 0.75, vt = 0.1, he = 1, bt = 60, Tt = 0.02, xt = 0.1, O = 1, gt = 0.02, wt = 5e-3, Ft = 250, oe = 1e3, ae = 16, Rt = 4, yt = 90, Dt = 1.5, Ae = 4, _t = 24, N = 1e-3, G = 5, ue = 4, le = {
  2: 0,
  3: 0.25,
  4: 0.5,
  5: 0.75
};
function ce(n) {
  return Nt[(n.interlaced ? 2 : 0) + (n.topFieldFirst ? 1 : 0)];
}
const Mt = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`, Nt = [
  { interlaced: !1, topFieldFirst: !1 },
  { interlaced: !1, topFieldFirst: !0 },
  { interlaced: !0, topFieldFirst: !1 },
  { interlaced: !0, topFieldFirst: !0 }
];
function Xt() {
  return ot() && typeof WebGL2RenderingContext < "u";
}
const St = {
  requestAnimationFrame: (n) => requestAnimationFrame(n),
  cancelAnimationFrame: (n) => cancelAnimationFrame(n)
}, Pt = {
  setTimeout: (n, e) => setTimeout(n, e),
  clearTimeout: (n) => clearTimeout(n)
};
class Wt extends EventTarget {
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
  #n = null;
  #a;
  #o;
  /** The program that copies a filtered picture onto the canvas. */
  #d;
  #p;
  #P;
  #h = [];
  /** Somewhere to filter a field into, and to read it back out of. */
  #A = [];
  /** Which output slot was written last; the next one follows round the ring. */
  #c = g - 1;
  /** The draw path currently shown on the canvas, retained for snapshots. */
  #l = null;
  /** Filtered fields waiting for their moment, oldest first. */
  #r = [];
  /** The requestAnimationFrame() loop that puts them up, which is all that draws on the canvas. */
  #g = null;
  /** The reading of the element's clock a Worker renderer is to be sent before its next frame. */
  #b = null;
  /** When the last reading went to the Worker renderer. */
  #T = Number.NEGATIVE_INFINITY;
  #_ = 0;
  /** Deliver captured pictures on the page's refresh during faster playback. */
  #M = null;
  /** The document the owner-change listener is on, if any. */
  #D = null;
  #j;
  /** The gap between animation frames: as near as the page gets to the screen. */
  #f = mt;
  /** Where the refresh grid fitted to the animation frames stands. (otya) */
  #N = 0;
  /** How far ahead of its animation frame the last picture shown stood. (otya) */
  #oe = 0;
  #ie = 0;
  #V = 0;
  /** The last picture chained onto the schedule; a break restarts it. (otya) */
  #se = null;
  /** The lateness the schedule holds on purpose, in refreshes. See #schedule. */
  #Y = 0;
  /** Pictures in a row that arrived off the phase the lag stands for, all on one side of it. */
  #k = 0;
  /** Of those, the phase closest to the lag's phase, in refreshes. */
  #H = 0;
  /**
   * Drop the presentation queue and restart the schedule from the clock.
   * Every schedule restart goes through here (otya nulls #lastScheduled at
   * each queue clear): the old chain's clock no longer applies, so keeping
   * it would either count a phantom resync or pop freshly queued pictures
   * as late. Restart accounting for cadence changes lives in #schedule.
   */
  #I() {
    this.#r.length = 0, this.#$e.length = 0, this.#se = null, this.#Y = 0, this.#k = 0, this.#V = 0;
  }
  /** The `<div>` this put around the element, so it can be taken away again. */
  #J = null;
  #re;
  #S;
  #K;
  #me = 0;
  /** otya GPU pulldown path: enabled by the `film` option (see below). */
  #ae;
  #O;
  /** How long a frame lasts in wall time, from what the frames themselves say. */
  #L = 0;
  /** The size of a frame as it is coded, which is what a texture holds. */
  #G = 0;
  #q = 0;
  /** Where the newest frame is. The two before it follow round the ring. */
  #R = T - 1;
  /** How many of the held frames are consecutive, up to HISTORY. */
  #y = 0;
  #qe = 0;
  /** presentedFrames at the last ingested frame; pairs with #lastMediaTime. */
  #Wt = 0;
  /** A destination frame that arrived before the browser finished seeking. */
  #Je = !1;
  #C = !1;
  /** Cancels work suspended inside a synchronous owner callback. */
  #ee = 0;
  #Ce = !1;
  #te = !1;
  #U = null;
  #Ie = [];
  #ne = !1;
  #zt;
  #Ht;
  #B;
  #Be;
  #pe;
  #$t;
  #m = null;
  #x;
  #et = !1;
  #Vt = 0;
  #Yt = !1;
  #ps = 0;
  #tt = !1;
  #bt = !1;
  #Le = null;
  #Es = 0;
  #it = /* @__PURE__ */ new Map();
  /** Everything the next report is counted from. See DeinterlaceStats. */
  #w = {
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
  #st = 0;
  /** When the last frame the filter took arrived, to see the gaps between. */
  #rt = 0;
  #Tt = 0;
  #Ae = 0;
  #we = 0;
  #Fe = 0;
  #Ue = 0;
  #Ee = 0;
  #ke;
  #xt = [];
  #Oe = [];
  #nt = 0;
  #Ge = 0;
  #ht = 0;
  #Xe = 0;
  /** The last phase read back from the GPU, and how many frames ago it was for. */
  #ot = R;
  #We = 0;
  /** The phase of the frame being filtered: #known advanced by #knownAge. */
  #X = R;
  #Q = !1;
  /** Frames left of the FILM_HOLD_FRAMES window that starts when the cadence is held. */
  #W = 0;
  /** Whether the comb counts were made for the frame being filtered and its neighbours. */
  #gt = !1;
  /** Whether the frame being filtered may have its fields matched. See #render. */
  #Re = !1;
  /** Whether the last detection read back found each frame to be one instant. */
  #Qt = !1;
  /** Whether comb counts were also made for the frame after it. */
  #Zt = !1;
  /** Whether the frame behind the newest (the one being filtered) came after a gap in the frames seen. */
  #jt = !1;
  /** Whether the previous frame was progressive. */
  #at = !1;
  #ze = null;
  #Di = "";
  /** Debug only: frames given each phase (0 for none), and repeats dropped. */
  #wt = [0, 0, 0, 0, 0, 0];
  #Ft = 0;
  /**
   * Why requested film reconstruction is currently degraded, or null while
   * healthy. The `film` option stays as the caller set it;
   * only the engine stands down, so this is never a silent option change.
   */
  #ye = null;
  /** Last worker-reported filmError, to derive the page-side failure event. */
  #Kt = null;
  #qt = 0;
  /** Whether pictures come from `decodedVideo`. Set by the first push and kept. */
  #v = !1;
  /** Pushed pictures not yet taken in, in timestamp order. */
  #De = [];
  /** Whether finish() was called since the last reset. */
  #Jt = !1;
  #$ = new tt();
  /**
   * Made with the rest of the GPU setup, so that the first decoded picture
   * does not draw with its program first; null once destroyed.
   */
  #At;
  /** Whether the GPU has run this renderer's setup; see `#watchPrepared`. */
  #_i = !1;
  /** The decoded picture in each history slot; the newest is at #head. */
  #_e = Array.from({ length: T }, () => ({
    timestamp: 0,
    duration: 0,
    interlaced: !0,
    topFieldFirst: !0,
    repeatFirstField: !1
  }));
  /** Whether a decoded picture has been taken in since the last reset. */
  #ei = !1;
  /** When the last picture pushed since the last reset starts. */
  #Rt = Number.NEGATIVE_INFINITY;
  /** Whether the newest picture is still to be filtered against its successor. */
  #He = !1;
  /** Whether it has been filtered against itself meanwhile, its successor being late. */
  #ut = !1;
  /** Filtered decoded outputs waiting for their media time, in time order. */
  #$e = [];
  /** The decoded output on the canvas. */
  #yt = null;
  /**
   * The first outputs of the last two pictures shown, whose slots are kept:
   * a pause can land in the picture before the one the canvas has gone on to.
   */
  #ve = null;
  #Ve = null;
  /** The media time of the output on the canvas; nothing older goes up after it. */
  #ti = Number.NEGATIVE_INFINITY;
  /**
   * Decoded pictures are picked against a count of refreshes rather than the
   * clock read at each one; see `#countRefresh`. Whether the count runs, the
   * media time it has reached, and the refresh (wall ms) that time is for.
   */
  #he = !1;
  #ue = 0;
  #Ye = 0;
  /** The playback speed the count last moved at. */
  #lt = 1;
  /** A start announced through `startsAt` and not yet reached, on this realm's clock. */
  #Me = null;
  /**
   * The refresh (wall ms) the count began at from an announced start or
   * change of speed, while
   * no reading of the clock has confirmed it yet; NaN otherwise.
   */
  #le = Number.NaN;
  /**
   * The step decoded pictures change on -- a field, or a frame of
   * progressive video -- in seconds, from the last picture taken; 0 before.
   */
  #Mi = 0;
  /** The sound less the shown output, averaged, and when it was last taken; see `avDifference`. */
  #ce = Number.NaN;
  #Ni = 0;
  /** `avDifference` as the Worker renderer last reported it. */
  #ii = Number.NaN;
  /** Field order of the decoded picture being filtered. */
  #si = !0;
  /** The size the decoded pictures are shown at. */
  #ct = 0;
  #ft = 0;
  /** The element's own inline aspect ratio, from before decoded pictures gave it theirs. */
  #ri = null;
  /** Whether the element answers for the decoded pictures; see `#standInForElement`. */
  #Dt = !1;
  /** Decoded pictures pushed since the counts were last reset. */
  #ni = 0;
  /** Pictures a Worker renderer dropped unshown, as of its last report. */
  #hi = 0;
  /** Whether the page showing the canvas is hidden; it is then given no refreshes. */
  #_t = !1;
  /**
   * The position when the page last became visible again, and the clock's
   * origin then. The position bounds what passed while it was hidden only for
   * as long as playback has been continuous since, which the origin tells.
   * It is the element's own position where the clock has not caught up with
   * it: a hidden page sends no readings, so playback resumed while it was
   * hidden finds the clock still where the element was paused.
   */
  #Si = Number.NaN;
  #Pi = Number.NaN;
  /**
   * Buffers transferred to the Worker and not yet back, by the id they went
   * with. A Worker that goes away takes them with it, and what is handed
   * back for them then is the detached original.
   */
  #Mt = /* @__PURE__ */ new Map();
  #vs = 0;
  constructor(e, t = {}, i = null) {
    super(), this.#e = e, this.#S = t.doubleRate ?? !1, this.#K = t.spatialCheck ?? !0, this.#ae = t.debug ?? !1, this.#O = t.film ?? !1, this.#zt = t.onStats, this.#Ht = t.onFailure, this.#B = i, this.#pe = i ? "main" : t.rendering ?? "main", this.#$t = t.workerUrl ?? we, this.#x = this.#pe === "main" ? "main" : "idle", this.#i = i ? i.canvas : document.createElement("canvas"), this.#t = i?.canvas ?? (this.#pe === "main" ? this.#i : document.createElement("canvas")), this.#Be = e, i || (this.#i.style.cssText = "position:absolute;pointer-events:none;visibility:hidden");
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
    this.#s = s, this.#O && (this.#Bi(), this.#n = new J(s)), this.#a = fe(s, Ye);
    const r = this.#a;
    this.#o = Object.fromEntries(
      Object.entries(Ve).map(([h, o]) => [
        h,
        s.getUniformLocation(r, o)
      ])
    ), this.#d = fe(s, Mt), this.#p = s.getUniformLocation(this.#d, "uField"), this.#P = s.getUniformLocation(this.#d, "uFlip"), D(s, this.#a, s.RGBA8), D(s, this.#d, s.RGBA8), this.#At = new Ke(s), this.#Ts(), this.#ke = s.getExtension(
      "EXT_disjoint_timer_query_webgl2"
    ), this.#t.addEventListener(
      "webglcontextlost",
      this.#ms
    ), this.#re = i ? null : new ResizeObserver(() => this.#Ke()), this.#j = i ? null : new MutationObserver(() => {
      this.#i.ownerDocument !== this.#D && this.#Ke();
    }), this.decodedVideo = {
      push: (h) => this.#Ps(h),
      reset: () => this.#Gi(),
      finish: () => {
        this.#Jt = !0, this.#m?.postMessage({
          type: "pictures",
          action: "finish"
        });
      },
      onrelease: null,
      avDifference: () => this.#m ? this.#ii : this.#ce,
      startsAt: (h, o) => {
        if (!Number.isFinite(h) || !Number.isFinite(o))
          throw new RangeError(`start at ${h} s, ${o} ms`);
        if (this.#m) {
          this.#m.postMessage({
            type: "start",
            media: h,
            at: o,
            timeOrigin: performance.timeOrigin,
            video: this.#Ne()
          });
          return;
        }
        this.#Me = { media: h, wall: o };
      },
      // The renderer is the Worker once it has said it is ready, which it
      // does when its own setup is through, and this context otherwise.
      prepared: () => this.#x === "main" ? this.#_i : this.#x === "active",
      onprepared: null
    }, this.#E = i ? null : new rt(s, e), this.#u = new ct(
      e,
      () => this.#x === "main" ? this.#E : null
    ), e.addEventListener("emptied", this.#ls), e.addEventListener("resize", this.#us), e.addEventListener("pause", this.#ge), e.addEventListener("ended", this.#ge), e.addEventListener("seeking", this.#fs), e.addEventListener("seeked", this.#ge), e.addEventListener("ratechange", this.#ge), e.addEventListener("waiting", this.#ds);
  }
  /**
   * Whether the canvas, rather than the element, is what shows the picture.
   * A page uses this to decide which of the two to capture or transform.
   * Filtering an element's own picture that is the same as filtering it at
   * all, since a progressive source is left to the element. Decoded pictures
   * are on the canvas filtered or not, because the element has none.
   */
  get running() {
    return this.#v ? this.#C : this.#C && (this.#U?.interlaced ?? !0);
  }
  /** The HTML canvas currently placed over the media element. */
  get canvas() {
    return this.#i;
  }
  /** Field order for the current scan state, defaulting to top-field-first. */
  get #Nt() {
    return this.#v ? this.#si : this.#U?.topFieldFirst !== !1;
  }
  /** The same public filter options for either rendering target. */
  #Ci() {
    return {
      doubleRate: this.#S,
      spatialCheck: this.#K,
      film: this.#O,
      debug: this.#ae
    };
  }
  /** Whether the caller wants filtering, independently of the current source. */
  get enabled() {
    return this.#Ce;
  }
  set enabled(e) {
    this.#Ce = e, this.#St(), this.#m?.postMessage({
      type: "enabled",
      enabled: e
    });
  }
  /** Update whether the source needs filtering and which field comes first. */
  set scan(e) {
    if (this.#v) return;
    const t = this.#U?.interlaced !== e?.interlaced, i = t || this.#U?.topFieldFirst !== e?.topFieldFirst;
    this.#U = e, !(i && (!this.#Ze() || this.#U !== e)) && (this.#m?.postMessage({ type: "scan", scan: e }), i && (this.#y = 0, this.#I(), this.#Z(), t && (this.#L = 0), this.#l = null, this.#Te(!1)), this.#St(), i && ((e?.interlaced ?? !0) && (this.#B || this.#x === "main") ? this.#Se() : this.#mi()));
  }
  get scan() {
    return this.#v ? this.#yt?.scan ?? null : this.#U;
  }
  set videoTimeline(e) {
    this.#Ie = e, this.#m?.postMessage({
      type: "timeline",
      videoTimeline: e
    }), e.length === 0 && (this.#U = null), this.#St();
  }
  get videoTimeline() {
    return this.#Ie;
  }
  /**
   * What to put on the screen for fullscreen: the `<div>` holding both the
   * element and the canvas once there is one, and the element itself before
   * that. Fullscreening the element alone would leave the canvas behind in
   * the page, and with it the only deinterlaced picture there is.
   */
  get container() {
    return this.#J ?? this.#e;
  }
  /** Whether a picture goes up for every field rather than every frame. */
  get doubleRate() {
    return this.#S;
  }
  set doubleRate(e) {
    e !== this.#S && (this.#S = e, this.#Qe(), !this.#v && (this.#I(), this.#Ii()));
  }
  get spatialCheck() {
    return this.#K;
  }
  set spatialCheck(e) {
    e !== this.#K && (this.#K = e, this.#Qe());
  }
  get film() {
    return this.#O;
  }
  set film(e) {
    const t = this.#m ? this.#Kt : this.#ye;
    if (!(e === this.#O && (e === !1 || t === null))) {
      if (this.#m) {
        this.#O = e, this.#Qe(e ? "film" : void 0);
        return;
      }
      if (e) {
        if (!this.#Ze()) return;
        try {
          this.#Li();
        } catch (i) {
          this.#O = !0, this.#Qe(), this.#Ct(
            `film detector unavailable: ${i instanceof Error ? i.message : String(i)}`
          );
          return;
        }
      }
      if (this.#O = e, this.#Qe(), !e) {
        if (!this.#Ze()) return;
        this.#Q = !1, this.#W = 0, this.#Re = !1, this.#X = R, this.#Z(), this.#n?.destroy(), this.#n = null;
      }
      this.#Ii();
    }
  }
  get debug() {
    return this.#ae;
  }
  set debug(e) {
    e !== this.#ae && (this.#ae = e, this.#Qe());
  }
  /** Whether pictures are queued for presentation by the frame loop. */
  get #bs() {
    return this.#S || this.#O;
  }
  #Ii() {
    this.#te || this.#v || (this.#bs ? (this.#G > 0 && this.#As(), (this.#U?.interlaced ?? !0) && (this.#B || this.#x === "main") && this.#Se()) : this.#O || (this.#l = null, this.#Te(!1), this.#vt()));
  }
  /** Apply mutable filter settings to the existing Worker and canvas. */
  #Qe(e) {
    this.#m?.postMessage({
      type: "settings",
      options: this.#Ci(),
      retryFilm: e
    });
  }
  #Bi() {
    if (this.#s.getExtension("EXT_color_buffer_float") === null)
      throw new Error("film needs EXT_color_buffer_float");
  }
  /**
   * Note when the GPU has run the setup issued so far, every program's first
   * draw included (see `drawOnce`). The draws only queue the work, and how
   * long it takes shows nowhere but here; until then a picture can miss the
   * refresh it is due in, which is why a start waits for `prepared()`.
   */
  #Ts() {
    const e = this.#s, t = e.fenceSync(e.SYNC_GPU_COMMANDS_COMPLETE, 0);
    e.flush();
    const i = this.#ns(), s = () => {
      if (e.clientWaitSync(t, 0, 0) === e.TIMEOUT_EXPIRED) {
        i.setTimeout(s, ae);
        return;
      }
      e.deleteSync(t), this.#_i = !0, this.#x === "main" && this.decodedVideo.onprepared?.();
    };
    i.setTimeout(s, ae);
  }
  /** Build the GPU pulldown detector the `film` option needs, or throw. */
  #Li() {
    this.#Bi(), this.#n ??= new J(this.#s), this.#G > 0 && this.#n.resize(this.#G, this.#q);
  }
  #St() {
    this.#v || this.#Ce && (this.#Ie.length > 0 || (this.#U?.interlaced ?? !0)) ? this.start() : this.stop();
  }
  /** Start the bundled Worker when the required transfer APIs are available. */
  #xs() {
    return this.#B || this.#pe === "main" ? !1 : this.#x === "starting" || this.#x === "active" ? !0 : typeof Worker < "u" && typeof VideoFrame < "u" && typeof OffscreenCanvas < "u" && this.#$t !== null && "transferControlToOffscreen" in HTMLCanvasElement.prototype ? (this.#Ui(), !0) : this.#pe === "auto" ? (this.#It(), !1) : (this.#x = "failed", this.#C = !1, !0);
  }
  /** Transfer the display canvas to a new Worker, replacing it if already transferred. */
  #Ui() {
    this.#fe(), this.#m?.terminate(), this.#m = null, this.#Lt(), this.#tt = !1, this.#bt = !1, this.#Kt = null, this.#qt = 0;
    let e = this.#i;
    if (this.#Yt) {
      e = document.createElement("canvas"), e.className = this.#i.className;
      const r = this.#i.getAttribute("style");
      r === null ? e.removeAttribute("style") : e.setAttribute("style", r), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e;
    }
    const t = ++this.#Vt;
    this.#x = "starting";
    let i, s;
    try {
      s = e.transferControlToOffscreen(), this.#Yt = !0, i = new Worker(this.#$t, { type: "module" });
    } catch (r) {
      this.#dt(
        r instanceof Error ? r.message : String(r)
      );
      return;
    }
    this.#m = i, i.onmessage = (r) => {
      t === this.#Vt && this.#gs(r.data);
    }, i.onerror = (r) => {
      t === this.#Vt && (r.preventDefault(), this.#dt(r.message || "the deinterlacer worker failed"));
    }, i.postMessage(
      {
        type: "initialize",
        canvas: s,
        options: this.#Ci(),
        scan: this.#U,
        videoTimeline: this.#Ie,
        enabled: this.#C,
        video: this.#Ne()
      },
      [s]
    ), this.#_t && i.postMessage({
      type: "pageVisibility",
      hidden: !0,
      video: this.#Ne()
    });
  }
  /** Apply Worker notifications and release the wait for the next input frame. */
  #gs(e) {
    switch (e.type) {
      case "ready":
        this.#x = "active", this.decodedVideo.onprepared?.(), this.#C && (this.#mt(), this.#Xt());
        break;
      case "failed":
        this.#dt(e.message);
        break;
      case "consumed": {
        this.#tt = !1, this.#bt = !0;
        const t = this.#Le;
        this.#Le = null, t && this.#Oi(t);
        break;
      }
      case "visibility":
        this.#i.style.visibility = e.visible ? "visible" : "hidden";
        break;
      case "stats": {
        this.#v && (this.#hi = e.stats.missed + e.stats.queueResetted), this.#ii = e.stats.avDifference;
        const t = {
          ...e.stats,
          dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0
        }, i = t.filmError ?? null, s = this.#qt;
        if (this.#Kt = i, this.#qt = e.filmFailure, i !== null && e.filmFailure !== s) {
          this.dispatchEvent(
            new CustomEvent("failure", { detail: i })
          );
          try {
            this.#Ht?.(i);
          } catch {
          }
        }
        this.dispatchEvent(new CustomEvent("stats", { detail: t })), this.#zt?.(t);
        break;
      }
      case "capture": {
        const t = this.#it.get(e.id);
        if (this.#it.delete(e.id), !t) {
          e.image?.close();
          break;
        }
        e.image ? t.resolve(e.image) : this.#v ? t.reject(new Error("no rendered picture is available")) : createImageBitmap(this.#e).then(
          t.resolve,
          t.reject
        );
        break;
      }
      case "release":
        this.#Mt.delete(e.id) && this.#de(e.data);
        break;
    }
  }
  /**
   * Tell the owner that a rendering resource failed after construction.
   * In the worker domain the boundary counts episodes: the reason travels in
   * `stats.filmError` and the page derives the event from the episode count,
   * so a film degradation is never mistaken for worker death.
   */
  #Pt(e) {
    if (this.dispatchEvent(new CustomEvent("failure", { detail: e })), !this.#B)
      try {
        this.#Ht?.(e);
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
  #Ct(e) {
    this.#ye !== e && (this.#ye = e, this.#Q = !1, this.#W = 0, this.#Re = !1, this.#X = R, this.#Z(), this.#n?.destroy(), this.#n = null, this.#Pt(e));
  }
  /**
   * Re-arm film reconstruction at a resource-reallocation point (start, scan
   * change, resize, or re-setting the option). The next frame retries; a
   * repeated failure degrades again and notifies as a new episode.
   */
  #Ze() {
    return this.#te ? !1 : (this.#m || (this.#ye = null), !0);
  }
  /** Retry a transient Worker failure once, then show the media element if it fails again. */
  #dt(e) {
    if (this.#x === "starting" && this.#pe === "auto" && !this.#et) {
      this.#It();
      return;
    }
    if (this.#ki(e), !this.#et) {
      this.#et = !0, this.#Ui();
      return;
    }
    console.error(`Deinterlacer Worker stopped: ${e}`), this.#x = "failed", this.#m?.terminate(), this.#m = null, this.#fe(), this.#Lt(), this.#Pt(`deinterlacer worker stopped: ${e}`), this.stop();
  }
  /** Restore the main-thread canvas when automatic Worker selection fails. */
  #It() {
    const e = this.#t;
    e.className = this.#i.className;
    const t = this.#i.getAttribute("style");
    t === null ? e.removeAttribute("style") : e.setAttribute("style", t), e.style.visibility = "hidden", this.#i.parentElement && this.#i.replaceWith(e), this.#i = e, this.#Yt = !1, this.#m?.terminate(), this.#m = null, this.#x = "main", this.#fe(), this.#Lt(), this.decodedVideo.onprepared?.(), this.#C && (this.#mt(), this.#Xt(), (this.#U?.interlaced ?? !0) && this.#Se());
  }
  /** Close the queued frame still owned by the page when switching renderers. */
  #fe() {
    this.#Le?.frame.close(), this.#Le = null;
  }
  /** Reject captures whose replies would be lost when the Worker is rebuilt. */
  #ki(e) {
    for (const t of this.#it.values())
      t.reject(new Error(e));
    this.#it.clear();
  }
  start() {
    if (!(this.#C || this.#te || this.#ne) && (this.#ee++, this.#C = !0, this.#cs(), !!this.#Ze())) {
      if (this.#ir(), this.#Xt(), this.#xs()) {
        if (this.#v) {
          this.#m?.postMessage({
            type: "running",
            running: !0
          }), this.#Se();
          return;
        }
        this.#m?.postMessage({
          type: "enabled",
          enabled: !0
        }), this.#x === "active" && this.#mt();
        return;
      }
      this.#mt(), (this.#v || (this.#U?.interlaced ?? !0)) && this.#Se();
    }
  }
  /**
   * Take the deinterlaced picture away, leaving the element's own showing.
   * Decoded pictures held are released, and those pushed until the next
   * start() are released at once.
   */
  stop() {
    this.#ee++, this.#C && (this.#C = !1, this.#v && this.#Gi(), this.#u.cancel(), this.#bi(), this.#mi(), this.#y = 0, this.#l = null, this.#Te(!1), this.#fe(), this.#m?.postMessage(
      this.#v ? { type: "running", running: !1 } : { type: "enabled", enabled: !1 }
    ));
  }
  destroy() {
    if (!this.#te) {
      this.#te = !0, this.#Ce = !1, this.stop(), this.#m?.postMessage({ type: "destroy" }), this.#m?.terminate(), this.#m = null, this.#fe(), this.#Lt(), this.#ki("the deinterlacer was destroyed"), this.#D?.removeEventListener(
        "visibilitychange",
        this.#vi
      ), this.#D = null, this.#j?.disconnect(), this.#t.removeEventListener(
        "webglcontextlost",
        this.#ms
      ), this.#u.destroy(), this.#E?.destroy(), this.#e.removeEventListener("emptied", this.#ls), this.#e.removeEventListener("resize", this.#us), this.#e.removeEventListener("pause", this.#ge), this.#e.removeEventListener("ended", this.#ge), this.#e.removeEventListener("seeking", this.#fs), this.#e.removeEventListener("seeked", this.#ge), this.#e.removeEventListener("ratechange", this.#ge), this.#e.removeEventListener("waiting", this.#ds), this.#ri !== null && (this.#e.style.aspectRatio = this.#ri), this.#Bs(), this.#sr();
      for (const e of this.#h) this.#s.deleteTexture(e);
      this.#h = [], this.#vt();
      for (const e of [
        ...this.#xt,
        ...this.#Oe.map(({ q: t }) => t)
      ])
        this.#s.deleteQuery(e);
      this.#xt.length = 0, this.#Oe.length = 0, this.#n?.destroy(), this.#n = null, this.#At?.destroy(), this.#At = null, this.#ze !== null && (Me(this.#ze), this.#ze = null), this.#s.deleteProgram(this.#a), this.#s.deleteProgram(this.#d), this.#s.getExtension("WEBGL_lose_context")?.loseContext();
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
    if (this.#x === "active" && this.#i.style.visibility === "visible" && this.#m) {
      const s = ++this.#Es, r = new Promise((h, o) => {
        this.#it.set(s, { resolve: h, reject: o });
      });
      return this.#m.postMessage({
        type: "capture",
        id: s,
        width: this.#e.videoWidth,
        height: this.#e.videoHeight
      }), r;
    }
    if (!this.#v && (this.#x === "starting" || this.#x === "failed"))
      return createImageBitmap(this.#e);
    const e = this.#l;
    if ((this.#B || this.#v) && (!this.#C || this.#ne || !e))
      return Promise.reject(new Error("no rendered picture is available"));
    if (!this.#C || this.#ne || !e)
      return createImageBitmap(this.#e);
    e.kind === "texture" ? this.#gi(e.texture, e.flip, !1) : this.#xe(e.flush, e.second, null, !1);
    const t = this.#v ? this.#ct : this.#e.videoWidth, i = this.#v ? this.#ft : this.#e.videoHeight;
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
  #mt() {
    this.#B || !this.#C || this.#v || this.#u.request(this.#Ns);
  }
  /** Copy the element's playback state for seek and presentation timing decisions. */
  #Ne() {
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
  #ws(e, t, i) {
    let s;
    try {
      s = i?.clone() ?? new VideoFrame(this.#e, {
        timestamp: Math.max(0, Math.round(t.mediaTime * 1e6))
      });
    } catch (h) {
      const o = h instanceof Error ? h.message : String(h);
      this.#pe === "auto" && !this.#bt && !this.#et ? (this.#It(), this.#kt(e, t)) : this.#dt(o);
      return;
    }
    const r = {
      id: ++this.#ps,
      frame: s,
      now: e,
      metadata: t,
      video: this.#Ne()
    };
    if (this.#tt) {
      this.#Le?.frame.close(), this.#Le = r;
      return;
    }
    this.#Oi(r);
  }
  /** Transfer the selected frame once the Worker has released the previous input. */
  #Oi(e) {
    const t = this.#m;
    if (!t || this.#x !== "active") {
      e.frame.close();
      return;
    }
    this.#tt = !0;
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
      this.#tt = !1, e.frame.close();
      const r = s instanceof Error ? s.message : String(s);
      this.#pe === "auto" && !this.#bt && !this.#et ? (this.#It(), this.#kt(e.now, e.metadata)) : this.#dt(r);
    }
  }
  #Fs(e, t, i) {
    this.#ze == null && (this.#ze = De(this.#s, "20px monospace")), Ne(this.#ze, e, t, i, this.#G, this.#q, 20);
  }
  #Bt(e) {
    if (this.#ke == null || this.#Oe.length > 30)
      return;
    const t = this.#xt.pop() ?? this.#s.createQuery();
    return this.#s.beginQuery(this.#ke.TIME_ELAPSED_EXT, t), this.#Oe.push({ q: t, isField: e }), t;
  }
  #be(e) {
    this.#ke != null && (e != null && this.#s.endQuery(this.#ke.TIME_ELAPSED_EXT), this.#Oe = this.#Oe.filter(
      ({ q: t, isField: i }) => {
        if (this.#s.getQueryParameter(t, this.#s.QUERY_RESULT_AVAILABLE)) {
          const s = this.#s.getQueryParameter(t, this.#s.QUERY_RESULT);
          return i ? (this.#ht += s, this.#Xe++) : (this.#nt += s, this.#Ge++), this.#xt.push(t), !1;
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
  #Z(e = !1) {
    this.#X = R, this.#ot = R, this.#We = 0, e || (this.#Qt = !1), this.#Q = !1, this.#n?.reset(e);
  }
  /** Detect the pulldown phase of the frame being filtered on the GPU. */
  #Rs() {
    const { prev: e, cur: t, next: i } = this.#Ri(!1), s = this.#h[e], r = this.#h[t], h = this.#h[i];
    if (!s || !r || !h) return;
    const o = this.#Nt ? 0 : 1;
    this.#n?.measureComb(s, r, o), this.#n?.detect(r, h, o);
  }
  /**
   * Count the combing for the frame after the one being filtered. The count
   * says whether that frame's first field fits between this frame's
   * second-field lines. Returns whether the count was made.
   */
  #ys() {
    const { cur: e, next: t } = this.#Ri(!1), i = this.#h[e], s = this.#h[t], r = this.#n;
    if (!i || !s || !r) return !1;
    const h = this.#Nt ? 0 : 1;
    try {
      r.measureComb(i, s, h, !0);
    } catch (o) {
      return this.#Ct(
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
  #Ds() {
    const e = this.#n?.poll() ?? null;
    e !== null && (this.#ot = e, this.#We = e.age, this.#Qt = e.instant), this.#We++;
    const { phase: t, run: i } = this.#ot;
    t === 0 || this.#We > Math.ceil(G * Math.max(1, this.#e.playbackRate)) ? this.#X = R : this.#X = {
      phase: (t - 1 + this.#We) % G + 1,
      run: i
    };
  }
  #_s(e) {
    const t = [], i = this.#n?.metrics ?? new Float32Array(0);
    for (let r = 0; r < p.phase; r++) {
      const h = i[r * 4] ?? 0, o = i[r * 4 + 1] ?? 0, a = i[r * 4 + 2] ?? 0;
      t.push(
        `${h.toFixed(3)},${o.toString().padStart(4)},${a.toFixed(3)}`
      );
    }
    const s = this.#wt.map((r, h) => `${h === 0 ? "-" : h}:${r}`).join(" ");
    return `frame=${e} phase=${this.#X.phase} run=${this.#X.run} known=${this.#ot.phase}/${this.#ot.run} age=${this.#We} ${this.#Q ? "film" : "video"} period=${this.#L.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#Ft}`;
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
  #pt(e, t) {
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
  #Ms(e, t) {
    const i = e.expectedDisplayTime;
    if (!Number.isFinite(i) || i <= 0 || !Number.isFinite(e.timeOrigin)) return t;
    const s = this.#pt(i, e.timeOrigin), r = Rt * Math.max(this.#f, this.#L);
    return s < t - r || s > t + r ? t : s;
  }
  #Ns = (e, t) => {
    if (!this.#C || this.#ne) return;
    this.#Ei();
    const i = this.#pt(e, t.timeOrigin), { frame: s, picture: r, ...h } = t;
    this.#Be = s ?? this.#e, this.#F = r ?? null;
    try {
      this.#Ss(i, h, s);
    } finally {
      this.#Be = this.#e, this.#F = null;
    }
    this.#mt();
  };
  /**
   * Take a frame from either acquisition path into the selected renderer.
   * `now` is the ingestion time on this realm's clock.
   */
  #Ss(e, t, i) {
    if (this.#x === "active") {
      this.#ws(e, t, i);
      return;
    }
    this.#x !== "starting" && this.#kt(e, t);
  }
  /**
   * @internal Feed Worker input through the same history and rendering decisions
   * as main-thread input. `now` is the ingestion time on the Worker's clock.
   * The metadata's display time stays on the page's clock and is converted
   * using the accompanying timeOrigin.
   */
  ingestExternalFrame(e, t, i) {
    this.#Be = i;
    try {
      this.#kt(e, t);
    } finally {
      this.#Be = this.#e;
    }
  }
  /** Queue a pushed picture behind the ones before it. */
  #Ps(e) {
    try {
      if (Qe(e), e.timestamp < this.#Rt + N)
        throw new RangeError(
          `a picture at ${e.timestamp} s came after one at ${this.#Rt} s; pictures come in presentation order`
        );
      this.#v || this.#Us();
    } catch (s) {
      throw this.#de(e.data), s;
    }
    if (this.#Rt = e.timestamp, this.#ni++, this.#Cs(e.displayWidth, e.displayHeight), !this.#C) {
      this.#de(e.data);
      return;
    }
    if (this.#x === "starting" || this.#x === "active") {
      this.#Ls(e);
      return;
    }
    const t = this.#De;
    t.push(e), this.#oi(this.#$.at(performance.now()));
    const i = Math.ceil(
      _t * Math.max(1, this.#e.playbackRate)
    );
    for (; t.length > i; ) {
      const s = t.pop();
      this.#Ut(s.timestamp + s.duration) && this.#w.queueResetted++, this.#de(s.data);
    }
    this.#Ee = Math.max(
      this.#Ee,
      t.length
    );
  }
  /**
   * Note the size decoded pictures are shown at. An element playing only
   * sound has no proportions of its own, and a page that sizes its player
   * from the element's would lay it out as 2:1, so the element is given the
   * picture's.
   */
  #Cs(e, t) {
    if (!(e === this.#ct && t === this.#ft)) {
      if (this.#ct = e, this.#ft = t, this.#B || this.#te) {
        this.#Ke();
        return;
      }
      this.#ri ??= this.#e.style.aspectRatio, this.#e.style.aspectRatio = `${e} / ${t}`, this.#Is(), this.#e.dispatchEvent(new Event("resize"));
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
  #Is() {
    if (this.#Dt) return;
    this.#Dt = !0;
    const e = this.#e;
    Object.defineProperty(e, "videoWidth", {
      configurable: !0,
      get: () => this.#ct
    }), Object.defineProperty(e, "videoHeight", {
      configurable: !0,
      get: () => this.#ft
    }), Object.defineProperty(e, "getVideoPlaybackQuality", {
      configurable: !0,
      value: () => ({
        creationTime: performance.now(),
        totalVideoFrames: this.#ni,
        // Whole pictures that were never shown: too late to be taken in, or
        // more than are held. A Worker renderer keeps its own count.
        droppedVideoFrames: this.#w.missed + this.#w.queueResetted + this.#hi,
        corruptedVideoFrames: 0
      })
    });
  }
  /** Give the element's own size and frame counts back. */
  #Bs() {
    if (!this.#Dt) return;
    this.#Dt = !1;
    const e = this.#e;
    delete e.videoWidth, delete e.videoHeight, delete e.getVideoPlaybackQuality;
  }
  /** Transfer a picture to the Worker, which sends its buffer back when done. */
  #Ls(e) {
    const t = ++this.#vs;
    try {
      this.#m.postMessage(
        { type: "picture", id: t, picture: e },
        [e.data]
      );
    } catch (i) {
      throw this.#de(e.data), i;
    }
    this.#Mt.set(t, e.data);
  }
  /** Hand back the buffers a Worker that is going away still holds. */
  #Lt() {
    const e = [...this.#Mt.values()];
    this.#Mt.clear();
    for (const t of e) this.#de(t);
  }
  /** Make pushed pictures the only pictures shown, from now on. */
  #Us() {
    this.#v = !0, this.#fe(), this.#u.cancel(), this.#bi(), this.#y = 0, this.#I(), this.#Z(), this.#l = null, this.#G = 0, this.#q = 0, this.#$.hold(), this.#St(), this.#Se();
  }
  /** Hand a picture's buffer back to the producer. */
  #de(e) {
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
  #Gi() {
    if (!this.#v) return;
    this.#m?.postMessage({
      type: "pictures",
      action: "reset"
    });
    const e = this.#De;
    this.#De = [], this.#Jt = !1, this.#ei = !1, this.#Rt = Number.NEGATIVE_INFINITY, this.#ii = Number.NaN, this.#He = !1, this.#ut = !1, this.#y = 0, this.#I(), this.#ve = null, this.#Ve = null, this.#ti = Number.NEGATIVE_INFINITY, this.#he = !1, this.#Me = null, this.#le = Number.NaN, this.#ce = Number.NaN, this.#Z(), this.#W = 0, this.#$.hold();
    for (const t of e) this.#de(t.data);
  }
  /** Release pictures that will neither be shown nor be the neighbour of one that is. */
  #oi(e) {
    const t = this.#De;
    for (; t.length > 2 && t[2].timestamp <= e; ) {
      const i = t.shift();
      this.#zi(i.timestamp + i.duration), this.#de(i.data);
    }
  }
  /**
   * Whether something that ended at `end` was there to be shown. What ended
   * at or before the place playback last started from was not: the pictures
   * a seek's target is given as the filter's neighbours, and whatever was
   * still queued when the position jumped past it. Before the first reading
   * of the clock nothing is known to have been skipped.
   */
  #Xi(e) {
    return !(e <= this.#$.origin + N);
  }
  /**
   * Whether something ending at `end` that goes unshown counts against the
   * renderer. A hidden page is given no refreshes, so nothing goes up while it
   * is hidden, and what ended before the position it came back at passed
   * while it was. Neither was dropped for being late, and counting them would
   * report a background tab as thousands of dropped frames.
   */
  #Ut(e) {
    return this.#_t || !this.#Xi(e) ? !1 : !(this.#$.origin === this.#Pi && e <= this.#Si + N);
  }
  /** Note whether the page showing the canvas is hidden. */
  #Wi(e) {
    if (e === this.#_t || (this.#_t = e, this.#m?.postMessage({
      type: "pageVisibility",
      hidden: e,
      video: this.#Ne()
    }), e)) return;
    const t = this.#$.at(performance.now()), i = this.#e.currentTime;
    this.#Si = Number.isNaN(t) ? i : Math.max(t, i), this.#Pi = this.#$.origin;
  }
  /**
   * @internal Tell a Worker renderer whether the page showing its canvas is
   * hidden. It has no document of its own to ask.
   */
  observePageVisibility(e) {
    this.#Wi(e);
  }
  /** Count a decoded picture ending at `end` that was dropped unshown. */
  #zi(e) {
    this.#Ut(e) && this.#w.missed++;
  }
  /** Read the element's clock, as it was at `wall` on this realm's clock. */
  #Hi(e) {
    const t = this.#e;
    this.#$.observe(
      e,
      t.currentTime,
      t.playbackRate,
      !t.paused && !t.seeking && !t.ended
    ) && (this.#w.resynced++, Number.isNaN(this.#le) && (this.#he = !1));
  }
  /**
   * @internal Give a Worker renderer a reading of the element's clock, taken
   * at `at` on the clock whose origin is `timeOrigin`. The element state it
   * belongs to has been applied to the Worker's video.
   */
  observeMediaClock(e, t) {
    this.#Hi(this.#pt(e, t));
  }
  /**
   * @internal Give a Worker renderer `DecodedVideoInput.startsAt`, `at`
   * taken on the clock whose origin is `timeOrigin`.
   */
  observeStart(e, t, i) {
    this.#Me = { media: e, wall: this.#pt(t, i) };
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
  #ks() {
    this.#b !== null && (this.#Vi(), this.#$i());
    const e = this.#ns(), t = this.#N + this.#f - Ae, i = e.setTimeout(
      () => {
        this.#b = null, this.#$i();
      },
      Math.max(0, t - performance.now())
    );
    this.#b = { timers: e, handle: i };
  }
  /** Send a reading unless the last one went less than a refresh less the lead ago. */
  #$i() {
    performance.now() - this.#T < this.#f - Ae || this.#Os();
  }
  #Vi() {
    const e = this.#b;
    e !== null && (this.#b = null, e.timers.clearTimeout(e.handle));
  }
  /** Send the page's reading of the element's clock to the Worker renderer. */
  #Os() {
    this.#T = performance.now(), this.#m?.postMessage({
      type: "clock",
      video: this.#Ne(),
      at: performance.now(),
      timeOrigin: performance.timeOrigin
    });
  }
  /** Take in what the coming refresh needs and put up what belongs on it. */
  #Gs() {
    const e = this.#e;
    this.#B || this.#Hi(performance.now());
    const t = this.#N + this.#f;
    if (e.paused)
      this.#Me = null, this.#le = Number.NaN, this.#he = !1;
    else if (this.#Me !== null) {
      const o = this.#Me;
      if (t < o.wall) {
        if (!this.#he) return;
        const a = this.#lt, u = this.#ui(t, a), A = this.#ee;
        this.#Yi(u, a), this.#z(A) && this.#qi(u, a, !1);
        return;
      }
      this.#Me = null, this.#he = !0, this.#ue = o.media + (t - o.wall) * e.playbackRate / 1e3, this.#Ye = t, this.#lt = e.playbackRate, this.#le = t, this.#ce = Number.NaN;
    }
    let i = this.#$.rate;
    const s = this.#$.at(t);
    let r;
    if (!Number.isNaN(this.#le) && (Number.isNaN(s) || !(i > 0))) {
      if (t - this.#le > Ft) {
        this.#le = Number.NaN, this.#he = !1;
        return;
      }
      i = this.#lt, r = this.#Ye === t ? this.#ue : this.#ui(t, i);
    } else {
      if (this.#le = Number.NaN, Number.isNaN(s)) return;
      r = e.paused ? s : this.#Vs(s, i);
    }
    const h = this.#ee;
    this.#Yi(r, i), this.#z(h) && this.#qi(r, i, e.paused);
  }
  /**
   * Take in pictures until the history holds the successor of every picture
   * whose outputs are due within the lookahead of `time`, the media time of
   * the refresh being filled.
   */
  #Yi(e, t) {
    const i = this.#ee, s = Dt * this.#f * Math.max(1, t) / 1e3;
    for (this.#oi(e); ; ) {
      const o = this.#De[0];
      if (o === void 0 || o.timestamp > e + s + o.duration || (o.width === this.#G && o.height === this.#q ? this.#ji() : g) < this.#Xs(o))
        break;
      if (this.#De.shift(), this.#Ws(o, e, t), !this.#z(i)) return;
      this.#oi(e);
    }
    if (!this.#He || this.#ut || this.#De.length > 0 || this.#ji() < this.#Qi())
      return;
    const r = this.#_e[this.#R], h = O * t / 1e3;
    (this.#Jt || r.timestamp <= e + h) && (this.#ai(!0, e, t), this.#ut = !0);
  }
  /** Output slots a filtered picture takes. A repeated first field shares the first one's. */
  #Qi() {
    return this.#S && !this.#Q ? 2 : 1;
  }
  /** Output slots taking `picture` in can fill. */
  #Xs(e) {
    const t = !e.interlaced || !this.#Ce;
    return (this.#He ? this.#Qi() : 0) + (t ? 1 : 0);
  }
  /** Whether an output slot holds nothing still wanted. */
  #Zi(e) {
    const t = this.#A[e];
    if (t === void 0) return !1;
    const i = this.#l;
    if (i?.kind === "texture" && i.texture === t.texture || this.#ve?.slot === e || this.#Ve?.slot === e)
      return !1;
    for (const s of this.#$e)
      if (s.slot === e) return !1;
    return !0;
  }
  #ji() {
    let e = 0;
    for (let t = 0; t < this.#A.length; t++)
      this.#Zi(t) && e++;
    return e;
  }
  /** The next free output slot round the ring, or null. */
  #Ki() {
    for (let e = 1; e <= g; e++) {
      const t = (this.#c + e) % g;
      if (this.#Zi(t)) return t;
    }
    return null;
  }
  /**
   * Take a decoded picture into the history and filter the picture before it,
   * which has its successor now.
   */
  #Ws(e, t, i) {
    this.#Mi = e.duration / (e.interlaced ? e.repeatFirstField ? 3 : 2 : 1);
    const s = this.#ei ? this.#_e[this.#R] : null, r = s === null ? 0 : s.timestamp + s.duration, h = e.width !== this.#G || e.height !== this.#q, o = s === null || h || e.timestamp < r - N || e.timestamp - r > V, a = !o && e.timestamp - r > N, u = !e.interlaced || !this.#Ce, A = this.#He, f = this.#ut;
    this.#He = !1, this.#ut = !1, A && !f && (o || u) && !h && this.#ai(!0, t, i), o ? (s !== null && this.#w.discontinuities++, this.#y = 0, this.#Z(), this.#W = 0) : s !== null && !u && s.interlaced && s.topFieldFirst !== e.topFieldFirst && this.#Z(!0);
    const d = performance.now();
    this.#wi(d), this.#rt = d;
    const l = this.#ee, c = this.#Bt(!1);
    try {
      if (h && (this.#yi(e.width, e.height), this.#A.length !== g))
        throw new Error("decoded pictures have no output textures");
      this.#zs(e);
    } catch (m) {
      this.#be(c), this.#Pt(
        m instanceof Error ? m.message : String(m)
      ), this.stop();
      return;
    } finally {
      this.#de(e.data);
    }
    if (u)
      e.interlaced || (this.#W > 0 && this.#W--, this.#at = !0), this.#Hs(), this.#y = 0;
    else {
      if (A && !o) {
        const m = this.#_e[(this.#R + T - 1) % T];
        this.#si = m.topFieldFirst, this.#es(), this.#z(l) && this.#ts(
          a ? 1 : 0,
          Math.round(m.timestamp * 1e3),
          this.#S
        ), this.#z(l) && this.#ai(!1, t, i);
      } else
        this.#jt = a;
      this.#at = !1, this.#He = !0;
    }
    if (!this.#z(l)) {
      this.#te || this.#be(c);
      return;
    }
    this.#be(c), this.#we += performance.now() - d, this.#Ae++, this.#Fi(d);
  }
  /** Convert a decoded picture into the next history slot. */
  #zs(e) {
    this.#R = (this.#R + 1) % T, this.#At.convert(e, this.#h[this.#R]);
    const t = this.#_e[this.#R];
    t.timestamp = e.timestamp, t.duration = e.duration, t.interlaced = e.interlaced, t.topFieldFirst = e.topFieldFirst, t.repeatFirstField = e.repeatFirstField, this.#y = Math.min(this.#y + 1, T), this.#ei = !0;
  }
  /** Queue the newest picture as it is, both fields woven. */
  #Hs() {
    const e = this.#_e[this.#R], t = this.#Ki();
    if (t === null) {
      this.#w.late++;
      return;
    }
    this.#c = t, this.#os(
      this.#h[this.#R],
      !0,
      this.#A[t].framebuffer
    ), this.#$e.push({
      slot: t,
      time: e.timestamp,
      picture: e.timestamp,
      end: e.timestamp + e.duration,
      start: !0,
      scan: ce(e)
    });
  }
  /**
   * Filter the waiting picture into its outputs: against its successor, or
   * against itself with `flush`. Each output is queued at its own media time:
   * a field at its field's time, a film frame at its place in the film
   * cadence, one picture a frame at the first field's time.
   */
  #ai(e, t, i) {
    const s = this.#_e[e ? this.#R : (this.#R + T - 1) % T], r = this.#$e;
    for (; r.length > 0 && r.at(-1).picture === s.timestamp; )
      r.pop();
    this.#si = s.topFieldFirst;
    const h = e ? Number.POSITIVE_INFINITY : this.#_e[this.#R].timestamp, o = ce(s), a = s.timestamp + s.duration;
    let u = !1;
    if (this.#Q && !e) {
      const A = this.#X.phase;
      if (A === W) {
        this.#Ft++;
        return;
      }
      const f = s.timestamp + (le[A] ?? 0) * s.duration;
      u = this.#Ai(
        f,
        f + s.duration * G / ue,
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
    } else if (!this.#S)
      u = this.#Ai(
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
        const c = s.timestamp + l * f, m = this.#Ai(
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
    !u && h <= t && this.#zi(a);
  }
  /**
   * Filter one output into a slot and queue it for `at`, unless it can never
   * be shown. `until` is when the output after it is due and `pictureUntil`
   * when the next picture is; `picture` and `pictureEnd` are the picture's
   * own time and end. `slot` is a slot already holding the same field.
   * Returns the slot, or null.
   */
  #Ai(e, t, i, s, r, h, o, a, u, A, f, d) {
    if (!this.#$s(e, t, i, f, d))
      return this.#Ut(t) && this.#w.late++, null;
    if (a === null) {
      if (a = this.#Ki(), a === null)
        return this.#w.late++, null;
      this.#c = a, this.#xe(u, o, this.#A[a].framebuffer);
    }
    return this.#$e.push({
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
  #$s(e, t, i, s, r) {
    if (r === 0) return i > s;
    const h = 2 * O * r / 1e3;
    if (t <= s - h) return !1;
    const o = this.#f * r / 1e3;
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
  #qi(e, t, i) {
    const s = this.#$e;
    let r = 0;
    for (; r < s.length && !this.#Xi(s[r].end); ) r++;
    r > 0 && s.splice(0, r);
    let h = -1;
    if (i) {
      for (let a = 0; a < s.length && s[a].picture <= e; a++)
        s[a].start && (h = a);
      if (h < 0) {
        const a = this.#ve, u = this.#Ve;
        let A = a !== null && a.picture <= e ? a : null;
        u !== null && u.picture <= e && (A === null || u.picture > A.picture) && (A = u), A !== null && A !== this.#yt && this.#li(A);
        return;
      }
    } else {
      this.#Ys(s, e, t);
      return;
    }
    const o = s[h];
    s.splice(0, h + 1), this.#li(o);
  }
  /**
   * The media time of the refresh being filled while playing, from `reading`,
   * the clock's.
   *
   * Decoded pictures are shown against a count of refreshes, as mpv's display
   * sync shows frames, rather than against the clock read at each refresh,
   * which near the boundary of two outputs would show one twice and skip the
   * other at the smallest wobble. The count moves the media time on by a
   * fixed step each refresh. Where the screen runs within
   * `MAX_DISPLAY_DEVIATION` of a whole number of picture steps a refresh (or
   * of refreshes a step), the step is exactly that, so that every refresh
   * moves by whole steps and none is ever shown twice or passed over; the
   * sound is then played that much faster or slower to stay with the
   * pictures (`avDifference`, which the player steers the sound's speed by).
   * Elsewhere it is the refresh at this speed.
   *
   * The clock starts the count, so that the output due at the refresh being
   * filled goes up first, and moves it by whole steps where it has come
   * further from the count than `AV_CORRECTION_SECONDS` and a step: that
   * much is no wobble or rounding but a stall, which the sound's speed would
   * take too long over. While the clock stands -- a seek, a wait for data --
   * there is nothing to count, and the time is the reading.
   */
  #Vs(e, t) {
    const i = this.#N + this.#f, s = this.#Ji(t);
    if (!(t > 0))
      return this.#he = !1, e;
    if (!this.#he)
      this.#he = !0, this.#ue = e, this.#lt = t, this.#ce = Number.NaN;
    else {
      this.#ui(i, t);
      const r = e - this.#ue;
      Math.abs(r) >= Math.max(gt * t, s) && (this.#ue += Math.trunc(r / s) * s);
    }
    return this.#Ye = i, this.#Qs(e - this.#ue), this.#ue;
  }
  /** Move the count on to the refresh at `target`: by the refreshes since its last. */
  #ui(e, t) {
    const i = Math.max(
      1,
      Math.round((e - this.#Ye) / this.#f)
    );
    return this.#ue += i * this.#Ji(t), this.#Ye = e, this.#lt = t, this.#ue;
  }
  /**
   * Show the newest decoded output due by `time` while playing; see
   * `#countRefresh` for what that time is.
   */
  #Ys(e, t, i) {
    let s = 0;
    for (; s < e.length && e[s].time <= this.#ti; )
      s++;
    s > 0 && e.splice(0, s);
    const r = N * i;
    let h = -1;
    for (let a = 0; a < e.length && e[a].time <= t + r; a++)
      h = a;
    if (h < 0) return;
    for (let a = 0; a < h; a++)
      this.#Ut(e[a + 1].time) && this.#w.late++;
    const o = e[h];
    e.splice(0, h + 1), this.#li(o);
  }
  /**
   * Media seconds the count of `#countRefresh` moves by a refresh at speed
   * `rate`: whole picture steps where the screen is close enough to them,
   * else the refresh itself.
   */
  #Ji(e) {
    const t = this.#f * e / 1e3, i = this.#Mi;
    if (!(i > 0)) return t;
    const s = t / i, r = s >= 1 ? Math.round(s) : 1 / Math.round(1 / s);
    return Math.abs(s / r - 1) <= wt ? r * i : t;
  }
  /** Average the sound's lead over the output just shown, for `avDifference`. */
  #Qs(e) {
    const t = performance.now(), i = t - this.#Ni;
    this.#Ni = t, Number.isNaN(this.#ce) || i > oe ? this.#ce = e : this.#ce += (e - this.#ce) * i / oe;
  }
  #li(e) {
    const t = performance.now(), i = this.#Bt(!0);
    this.#xi(e.slot), this.#be(i), this.#Ue += performance.now() - t, this.#Fe++, this.#yt = e, this.#ti = e.time, !(e === this.#ve || e === this.#Ve) && (e.start || this.#ve?.picture !== e.picture) && (this.#Ve = this.#ve, this.#ve = e.start ? e : null);
  }
  /** Take one input into the shared history and decide its YADIF or IVTC presentation. */
  #kt(e, t) {
    const i = this.#ee;
    if (this.#z(i) && (this.#Zs(t.mediaTime), !!this.#z(i) && t.width > 0 && t.height > 0)) {
      let s = !1;
      if (!this.#Je && this.#e.seeking) {
        const c = this.#e.buffered, m = this.#L >= ne ? this.#L / 1e3 : k / 1e3;
        for (let E = 0; E < c.length; E++)
          if (t.mediaTime >= c.start(E) && t.mediaTime < c.end(E) && Math.abs(t.mediaTime - this.#e.currentTime) <= m) {
            s = !0;
            break;
          }
      }
      if (s && (this.#Je = !0), (this.#G === 0 || this.#q === 0) && this.#yi(t.width, t.height), !this.#z(i)) return;
      if (this.#U && !this.#U.interlaced) {
        const c = performance.now();
        this.#wi(c), this.#rt = c, this.#W > 0 && this.#W--, this.#at = !0, this.#er(), this.#we += performance.now() - c, this.#Ae++, this.#Fe++, this.#Fi(c);
        return;
      }
      const r = t.mediaTime - this.#qe, h = t.mozTiming, o = s || (h ? h.discontinuity || r < 0 || r > V : r < 0 || r > V);
      o && (this.#y = 0, this.#L = 0, this.#w.discontinuities++, this.#I(), this.#Z(), (s || !this.#at) && (this.#W = 0)), this.#at = !1;
      const a = this.#tr(t.presentedFrames, o);
      if (this.#y > 0 && t.mediaTime === this.#qe && (!h || t.presentedFrames === this.#Wt))
        return;
      if (!o) {
        const c = h?.periodMs ?? 0;
        c > 0 ? this.#is(
          c * (this.#e.playbackRate || 1) / 1e3,
          1
        ) : this.#y > 0 && r > 0 && this.#is(r, a + 1);
      }
      this.#qe = t.mediaTime, this.#Wt = t.presentedFrames;
      const u = performance.now();
      this.#wi(u), this.#rt = u;
      const A = performance.now(), f = this.#Bt(!1);
      if (this.#as(), this.#es(), !this.#z(i)) {
        this.#te || this.#be(f);
        return;
      }
      if (this.#ts(
        a,
        t.presentedFrames,
        this.#S && this.#Et()
      ), !this.#z(i)) {
        this.#te || this.#be(f);
        return;
      }
      const l = this.#Ms(t, e) + this.#f;
      if (this.#Q)
        if (this.#Et()) {
          const c = this.#X.phase;
          if (c === W)
            this.#Ft++, this.#V++;
          else {
            const m = this.#L * G / ue, E = this.#di(1, e, m), b = le[c] ?? 0, v = E || this.#se === null ? l + m : l + b * this.#L;
            this.#Ot(
              "film",
              !1,
              this.#ci("film", v, m),
              m
            );
          }
        } else
          this.#xe(!1, !1, null);
      else if (this.#S && this.#Et()) {
        const c = this.#L / 2, E = this.#di(2, e, c) || this.#se === null ? l + c * 2 : l, b = this.#ci("field", E, c);
        this.#Ot("field", !1, b, c), this.#Ot("field", !0, b + c, c);
      } else if (this.#Et()) {
        const c = this.#L, E = this.#di(1, e, c) || this.#se === null ? l + c : l;
        this.#Ot(
          "frame",
          !1,
          this.#ci("frame", E, c),
          c
        ) || (this.#w.late++, this.#xe(!1, !1, null));
      } else
        this.#w.late += this.#r.length, this.#I(), this.#xe(!1, !1, null);
      this.#Ee = Math.max(
        this.#Ee,
        this.#r.length
      ), this.#be(f), this.#we += performance.now() - A, this.#Ae++, this.#Fi(u);
    }
  }
  /** Rebuild the detector a retry point stood the engine back up for. */
  #es() {
    if (this.#O && !this.#ye && !this.#n)
      try {
        this.#Li();
      } catch (e) {
        this.#Ct(
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
  #ts(e, t, i) {
    if (this.#gt = !1, this.#Re = !1, this.#Zt = !1, this.#O && !this.#ye) {
      let s = !1;
      if (this.#y === T && e === 0)
        try {
          this.#Ds(), this.#Rs(), s = !0;
        } catch (r) {
          this.#Ct(
            `film detection failed: ${r instanceof Error ? r.message : String(r)}`
          );
        }
      else
        this.#Z(!0);
      this.#wt[this.#X.phase] = (this.#wt[this.#X.phase] ?? 0) + 1, this.#Q = this.#X.phase !== 0 && this.#X.run >= j, this.#Q ? this.#W = yt : this.#W > 0 && this.#W--, this.#gt = s && !this.#jt, this.#Re = this.#gt && this.#W > 0, this.#Zt = this.#Re && !this.#Q && i && this.#ys(), this.#Re && !this.#Q && this.#w.matched++, this.#ae && (this.#Di = this.#_s(t));
    }
    this.#jt = e > 0;
  }
  #z(e) {
    return !this.#te && this.#C && e === this.#ee;
  }
  #Zs(e) {
    const t = this.#ee;
    let i;
    for (let h = this.#Ie.length - 1; h >= 0; h--) {
      const o = this.#Ie[h];
      if (o.start <= e + 1e-6) {
        i = o;
        break;
      }
    }
    if (i?.codedSize && (i.codedSize.width !== this.#G || i.codedSize.height !== this.#q) && this.#yi(i.codedSize.width, i.codedSize.height), !this.#z(t)) return;
    const s = i?.scan;
    if (!s || this.#U?.interlaced === s.interlaced && this.#U.topFieldFirst === s.topFieldFirst)
      return;
    const r = this.#U?.interlaced;
    this.#U = s, this.#y = 0, this.#I(), this.#Ze() && (r !== s.interlaced && (this.#L = 0), s.interlaced && (this.#B || this.#x === "main") ? this.#Se() : this.#mi(), this.#Z());
  }
  /**
   * Whether pictures are being filtered ahead of time and queued, rather than
   * drawn as their frame arrives.
   *
   * A picture for every frame has nothing to schedule -- there is one of them
   * and it goes up now -- and neither has a filter that has yet to see two
   * frames go by, since until then there is no idea how long a frame lasts.
   */
  #Et() {
    return (this.#S || this.#O) && this.#L > 0 && this.#A.length === g;
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
  #is(e, t) {
    const s = e * 1e3 / (this.#e.playbackRate || 1) / t;
    s < ne || s > k || (this.#L = this.#L > 0 && s > this.#L * Et ? this.#L + (s - this.#L) * dt : s);
  }
  /**
   * Filter one field into an output texture and put it in the queue.
   *
   * The three frames the filter reads are only the right three between one
   * frame arriving and the next, so both fields of a frame are built here and
   * held as pictures. What is queued after that is a copy waiting for a
   * moment, which no later frame can take away.
   */
  #Ot(e, t, i, s) {
    const r = this.#ss();
    if (r === null) return !1;
    const h = this.#A[r];
    if (!h) return !1;
    for (this.#c = r; this.#r.length > 0 && this.#r[0]?.slot === r; )
      this.#r.shift(), this.#w.late++;
    this.#xe(!1, t, h.framebuffer);
    const o = {
      slot: r,
      at: i,
      duration: s,
      cadence: e,
      phase: e === "film" ? this.#X.phase : e === "field" ? t ? 2 : 1 : 0,
      droppedBefore: this.#V
    };
    return this.#V = 0, this.#r.push(o), this.#se = o, !0;
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
  #ci(e, t, i) {
    if (!(i > 0)) return t;
    const s = this.#se, r = this.#f;
    if (s !== null && s.cadence === e) {
      const h = s.at + s.duration, o = h - t, a = Math.round(o / r), u = a - this.#Y, A = o - a * r;
      if (a >= 0 && u <= 1) {
        const f = h + Math.max(
          -he,
          Math.min(he, -A * vt)
        );
        if (u === 0)
          return this.#k = 0, f;
        if (this.#k === 0 || u > 0 != this.#H > 0 ? (this.#k = 0, this.#H = u) : Math.abs(u) < Math.abs(this.#H) && (this.#H = u), ++this.#k < bt) return f;
        const d = this.#H;
        return this.#k = 0, d < 0 ? (this.#Y += d, f) : (this.#w.resynced++, this.#fi(f - d * r));
      }
      if (a < 0 && this.#Y - a <= 1)
        return this.#Y -= a, this.#k = 0, this.#w.resynced++, this.#fi(t);
    }
    return this.#Y = 0, this.#k = 0, s !== null && this.#w.resynced++, this.#fi(t);
  }
  /** Start the chain again at `at`, which is where the caller's picture goes. */
  #fi(e) {
    for (let t = this.#r.at(-1); t && t.at >= e; )
      this.#r.pop(), this.#w.late++, t = this.#r.at(-1);
    return e;
  }
  /** Make room without treating ordinary capacity pressure as clock divergence. */
  #di(e, t, i) {
    const s = this.#r.at(-1), r = (Q + 1) * Math.max(this.#f, i);
    if (s && s.at - t > r)
      return this.#I(), this.#w.queueResetted++, !0;
    const h = Math.max(
      0,
      this.#r.length + e - Q
    );
    let o = 0, a = 0;
    for (; a < h; ) {
      const u = this.#r.shift();
      if (!u) break;
      o += u.duration, a++;
    }
    for (const u of this.#r) u.at -= o;
    return this.#w.late += a, !1;
  }
  /** Select an output whose pixels are not still represented by the canvas or queue. */
  #ss() {
    const e = this.#l?.kind === "texture" ? this.#l.texture : null, t = new Set(this.#r.map(({ slot: s }) => s));
    for (let s = 1; s <= g; s++) {
      const r = (this.#c + s) % g, h = this.#A[r];
      if (h && h.texture !== e && !t.has(r))
        return r;
    }
    const i = this.#r[0];
    if (i) {
      const s = this.#A[i.slot];
      if (s && s.texture !== e) return i.slot;
    }
    return null;
  }
  /** The loop that puts filtered fields up, and the only thing that draws. */
  #Se() {
    this.#g === null && (!this.#C || this.#ne || (this.#_ = 0, this.#g = this.#je(this.#pi)));
  }
  #mi() {
    this.#Gt(this.#g), this.#g = null, this.#Vi(), this.#I();
  }
  #pi = (e) => {
    if (this.#g = null, !this.#C || this.#ne) return;
    this.#js(e);
    const t = this.#ee;
    if (this.#v)
      this.#B || this.#x === "main" ? this.#Gs() : this.#ks();
    else {
      if (this.#u.flush(e), !this.#z(t)) return;
      this.#x === "main" && this.#qs(this.#N, e);
    }
    this.#z(t) && (this.#g = this.#je(this.#pi));
  };
  /**
   * Fit a grid of refreshes (period and phase) to the animation frames. rAF
   * timestamps wander by a millisecond or so, which is more than the
   * nearest-refresh decision in #present can take; the grid is what it
   * compares against. A frame far off the grid restarts it. (otya)
   */
  #js(e) {
    const t = e - this.#_;
    this.#_ = e;
    const i = Math.max(1, Math.round(t / this.#f)), s = this.#N + i * this.#f, r = e - s;
    if (this.#N === 0 || t <= 0 || t > k || Math.abs(r) > this.#f / 4) {
      t >= 1 && t <= k && (this.#f = t), this.#N = e;
      return;
    }
    this.#f += r / i * Tt, this.#N = s + r * xt;
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
  #rs() {
    const e = this.#B;
    if (e)
      return { frames: e, origin: performance.timeOrigin };
    const t = this.#hs();
    return t === null ? { frames: St, origin: performance.timeOrigin } : { frames: t, origin: t.performance.timeOrigin };
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
  #je(e) {
    const { frames: t, origin: i } = this.#rs(), s = t.requestAnimationFrame(
      (r) => e(this.#pt(r, i))
    );
    return { frames: t, handle: s };
  }
  /** Timers of the window the loop's animation frames come from. */
  #ns() {
    return this.#hs() ?? Pt;
  }
  /** The window that composites the canvas, or null in none. */
  #hs() {
    return this.#i.ownerDocument?.defaultView ?? this.#e.ownerDocument?.defaultView ?? null;
  }
  /** Cancel a pending animation frame through the source that issued it. */
  #Gt(e) {
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
  #Ei() {
    if (this.#B) return;
    this.#Ks(), this.#D && this.#Wi(this.#D.hidden);
    const { frames: e } = this.#rs(), t = this.#g !== null && this.#g.frames !== e, i = this.#M !== null && this.#M.frames !== e;
    !t && !i || (this.#_ = 0, t && (this.#Gt(this.#g), this.#g = this.#je(this.#pi)), i && (this.#Gt(this.#M), this.#M = this.#je(this.#Ti)));
  }
  /** Watch the current document for visibility changes and DOM adoption. */
  #Ks() {
    const e = this.#B ? null : this.#i.ownerDocument ?? null;
    e !== this.#D && (this.#D?.removeEventListener(
      "visibilitychange",
      this.#vi
    ), this.#D = e, e?.addEventListener("visibilitychange", this.#vi), this.#j?.disconnect(), e && this.#j?.observe(e, { childList: !0, subtree: !0 }));
  }
  #vi = () => {
    this.#te || this.#Ei();
  };
  /** Deliver faster-playback captures even when a Worker owns the drawing loop. */
  #Xt() {
    this.#B || this.#v || this.#M !== null || !this.#u.captureDriven || !this.#C || this.#ne || (this.#M = this.#je(this.#Ti));
  }
  /** Cancel the page's pending capture delivery. */
  #bi() {
    this.#Gt(this.#M), this.#M = null;
  }
  /** Flush captured pictures on the refresh that will present them. */
  #Ti = (e) => {
    if (this.#M = null, !this.#C || this.#ne) return;
    const t = this.#ee;
    this.#u.flush(e), this.#z(t) && this.#u.captureDriven && (this.#M = this.#je(this.#Ti));
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
  #qs(e, t) {
    const i = this.#f / 2, s = (a) => {
      const u = a.at - e;
      return u <= i - O ? !0 : u > i + O ? !1 : this.#oe > 0;
    };
    for (; this.#r[1] && s(this.#r[1]); )
      this.#w.late++, this.#r.shift();
    const r = this.#r[0];
    if (!r || !s(r)) return;
    this.#r.shift(), this.#oe = r.at - e;
    const h = performance.now(), o = this.#Bt(!0);
    this.#xi(r.slot), this.#be(o), this.#Ue += performance.now() - h, this.#Fe++, this.#ae && this.#Js(r, t), this.#ie = t;
  }
  /** Preserve upstream's opt-in presentation timing log in either renderer. */
  #Js(e, t) {
    const i = this.#ie === 0 ? 0 : t - this.#ie, s = i / this.#f, r = e.cadence === "film" ? `phase ${e.phase}` : e.cadence === "field" ? `field ${e.phase}` : "frame", h = e.phase === 0 ? "duplicate" : `phase ${W}`, o = e.droppedBefore > 0 ? `, ${h} dropped before it` + (e.droppedBefore > 1 ? ` (${e.droppedBefore})` : "") : "";
    console.log(
      `yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at - t).toFixed(2)} ms${o}`
    );
  }
  /** Copy one of the filtered pictures onto the canvas. */
  #xi(e) {
    const t = this.#A[e];
    t && this.#gi(t.texture);
  }
  /** Put a progressive frame through unchanged, keeping one display surface. */
  #er() {
    this.#as();
    const e = this.#h[this.#R];
    e && this.#gi(e, !0), this.#y = 0;
  }
  /** Apply visibility on the page; a Worker reports only the desired state. */
  #Te(e) {
    if (this.#B) {
      this.#B.onVisibility(e);
      return;
    }
    this.#i.style.visibility = e ? "visible" : "hidden";
  }
  #gi(e, t = !1, i = !0) {
    this.#os(e, t, null), this.#l = { kind: "texture", texture: e, flip: t }, this.#Te(!0), i && this.#me++;
  }
  /** Copy a texture onto the canvas or into an output. */
  #os(e, t, i) {
    const s = this.#s;
    s.bindFramebuffer(s.FRAMEBUFFER, i), s.useProgram(this.#d), s.activeTexture(s.TEXTURE0), s.bindTexture(s.TEXTURE_2D, e), s.uniform1i(this.#p, 0), s.uniform1i(this.#P, t ? 1 : 0), s.viewport(0, 0, this.#G, this.#q), s.drawArrays(s.TRIANGLES, 0, 3);
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
  #tr(e, t) {
    let i = 0;
    return this.#st !== 0 && !t && (i = Math.max(0, e - this.#st - 1), this.#w.missed += i), this.#st = e, i;
  }
  /**
   * Frames stopped arriving for a while -- a pause, a stall, a tab in the
   * background -- and a rate averaged over time nothing was asked of the
   * filter says nothing about it. Begin the interval at this frame.
   */
  #wi(e) {
    e - this.#rt <= re || (this.#Tt = e, this.#Ae = 0, this.#we = 0, this.#Fe = 0, this.#Ue = 0, this.#Ee = 0, this.#me = 0, this.#nt = 0, this.#Ge = 0, this.#ht = 0, this.#Xe = 0);
  }
  #Fi(e) {
    const t = e - this.#Tt;
    if (t < re) return;
    const i = !this.#v && this.#Et() && (this.#S || this.#Q) ? this.#Fe : this.#Ae, s = this.#Ae ? (this.#we + this.#Ue) / this.#Ae : 0;
    let r;
    this.#ke != null && (r = 0, this.#Ge !== 0 && (r += this.#nt / 1e6 / this.#Ge), this.#Xe !== 0 && (r += this.#ht / 1e6 / this.#Xe / 2));
    const h = {
      ...this.#w,
      avDifference: this.#ce,
      // The element's own count of what its decoder could not keep up with,
      // which is the machine being behind rather than this filter.
      dropped: this.#e.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0,
      fps: i * 1e3 / t,
      frameMs: s,
      maxQueuedFields: this.#Ee,
      outputFps: this.#me * 1e3 / t,
      gpuMs: r,
      film: this.#Q,
      oneInstant: this.#Qt,
      filmError: this.#ye
    };
    this.dispatchEvent(new CustomEvent("stats", { detail: h })), this.#zt?.(h), this.#Tt = e, this.#Ae = 0, this.#we = 0, this.#Fe = 0, this.#Ue = 0, this.#Ee = 0, this.#me = 0, this.#nt = 0, this.#Ge = 0, this.#ht = 0, this.#Xe = 0;
  }
  /** Take the newest frame into the ring. */
  #as() {
    const e = this.#s;
    this.#R = (this.#R + 1) % T;
    const t = this.#F, i = this.#h[this.#R];
    t !== null && this.#E !== null && i !== void 0 ? (this.#h[this.#R] = this.#E.adopt(t, i), this.#F = null) : (e.bindTexture(e.TEXTURE_2D, i ?? null), e.texImage2D(
      e.TEXTURE_2D,
      0,
      e.RGBA,
      e.RGBA,
      e.UNSIGNED_BYTE,
      this.#Be
    )), this.#y = Math.min(this.#y + 1, T);
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
  #xe(e, t, i, s = !0) {
    if (this.#y === 0 || this.#ne) return;
    s && (this.#y === T && !e ? this.#w.filtered++ : this.#w.degraded++);
    const r = this.#s, { prev: h, cur: o, next: a } = this.#Ri(e);
    r.bindFramebuffer(r.FRAMEBUFFER, i), r.useProgram(this.#a);
    for (const [m, E] of [h, o, a].entries())
      r.activeTexture(r.TEXTURE0 + m), r.bindTexture(r.TEXTURE_2D, this.#h[E] ?? null);
    r.uniform1i(this.#o.prev, 0), r.uniform1i(this.#o.cur, 1), r.uniform1i(this.#o.next, 2);
    const u = this.#O ? this.#n?.texture ?? null : null, A = this.#O ? this.#n?.combTexture ?? null : null, f = u !== null && A !== null;
    u !== null && A !== null && (r.activeTexture(r.TEXTURE0 + 3), r.bindTexture(r.TEXTURE_2D, u), r.uniform1i(this.#o.fieldMetrics, 3), r.activeTexture(r.TEXTURE0 + 4), r.bindTexture(r.TEXTURE_2D, A), r.uniform1i(this.#o.comb, 4));
    const d = this.#Zt ? this.#n?.combAheadTexture ?? null : null, l = f && !e;
    r.activeTexture(r.TEXTURE0 + 5), r.bindTexture(r.TEXTURE_2D, d), r.uniform1i(this.#o.combAhead, 5), r.activeTexture(r.TEXTURE0), r.uniform2i(this.#o.size, this.#G, this.#q);
    const c = this.#Nt ? 0 : 1;
    r.uniform1i(this.#o.parity, t ? 1 - c : c), r.uniform1i(this.#o.tff, this.#Nt ? 1 : 0), r.uniform1i(this.#o.second, t ? 1 : 0), r.uniform1i(this.#o.spatialCheck, this.#K ? 1 : 0), r.uniform1i(this.#o.debug, this.#ae ? 1 : 0), r.uniform1i(this.#o.film, f ? 1 : 0), r.uniform1i(
      this.#o.match,
      l && this.#Re && (!t || d !== null) ? 1 : 0
    ), r.uniform1i(this.#o.instant, l && this.#gt ? 1 : 0), r.uniform1i(this.#o.phase, this.#X.phase), r.viewport(0, 0, this.#G, this.#q), r.drawArrays(r.TRIANGLES, 0, 3), this.#ae && f && this.#Fs(this.#Di, 0, 90), i === null && (this.#l = { kind: "yadif", flush: e, second: t }, this.#Te(!0), s && this.#me++);
  }
  #Ri(e) {
    const t = (i) => (this.#R + T - i) % T;
    return this.#y === 1 ? { prev: this.#R, cur: this.#R, next: this.#R } : e ? { prev: t(1), cur: this.#R, next: this.#R } : this.#y === 2 ? { prev: t(1), cur: t(1), next: this.#R } : { prev: t(2), cur: t(1), next: this.#R };
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
  #Ke() {
    if (this.#Ei(), !this.#J) return;
    const e = this.#e, t = this.#v ? this.#ct : e.videoWidth, i = this.#v ? this.#ft : e.videoHeight;
    if (t === 0 || i === 0) return;
    const s = Math.min(
      e.offsetWidth / t,
      e.offsetHeight / i
    ), r = t * s, h = i * s;
    this.#i.style.left = `${e.offsetLeft + (e.offsetWidth - r) / 2}px`, this.#i.style.top = `${e.offsetTop + (e.offsetHeight - h) / 2}px`, this.#i.style.width = `${r}px`, this.#i.style.height = `${h}px`;
  }
  #yi(e, t) {
    const i = this.#s;
    this.#t.width = e, this.#t.height = t, this.#G = e, this.#q = t, this.#y = 0, this.#W = 0, this.#l = null, this.#I(), this.#Ke();
    for (const s of this.#h) i.deleteTexture(s);
    this.#h = [];
    for (let s = 0; s < T; s++) {
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
    this.#vt(), (this.#S || this.#O || this.#v) && this.#As(), this.#At?.resize(e, t), this.#n?.resize(e, t), this.#Ze();
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
  #As() {
    const e = this.#s;
    if (!(this.#A.length === g || this.#G === 0)) {
      this.#vt();
      for (let t = 0; t < g; t++) {
        const i = e.createTexture();
        e.bindTexture(e.TEXTURE_2D, i), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.NEAREST), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), e.texImage2D(
          e.TEXTURE_2D,
          0,
          e.RGBA,
          this.#G,
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
          e.deleteFramebuffer(s), e.deleteTexture(i), this.#vt();
          return;
        }
        this.#A.push({ texture: i, framebuffer: s });
      }
      this.#c = g - 1;
    }
  }
  #vt() {
    const e = this.#s, t = this.#l?.kind === "texture" ? this.#l.texture : null;
    this.#A.some((i) => i.texture === t) && (this.#l = null), this.#yt = null, this.#ve = null, this.#Ve = null;
    for (const { texture: i, framebuffer: s } of this.#A)
      e.deleteFramebuffer(s), e.deleteTexture(i);
    this.#A = [], this.#I();
  }
  /**
   * Wrap the element in a `<div>` of this one's own and put the canvas over
   * it. The wrapper is what the canvas is positioned against; moving the
   * element out of the tree and back within the one task leaves playback
   * alone, which is what makes turning this on mid-stream free.
   */
  #ir() {
    if (this.#J) return;
    const e = this.#e.parentElement;
    if (!e) return;
    const t = document.createElement("div");
    t.style.cssText = "position:relative;display:inline-block;line-height:0;max-width:100%", e.insertBefore(t, this.#e), t.appendChild(this.#e), t.appendChild(this.#i), this.#J = t, this.#re?.observe(this.#e), this.#Ke();
  }
  #sr() {
    if (this.#B) return;
    const e = this.#J;
    this.#J = null, this.#re?.disconnect(), this.#i.remove(), e?.parentElement && (e.parentElement.insertBefore(this.#e, e), e.remove());
  }
  #us = () => this.#Ke();
  /** Forward a media event with the page's playback state that gives it meaning. */
  #Pe(e) {
    return !this.#m || this.#x === "main" ? !1 : (this.#m.postMessage({
      type: "event",
      name: e,
      video: this.#Ne()
    }), !0);
  }
  #ls = () => {
    if (this.#v) {
      this.#$.hold(), this.#Pe("emptied");
      return;
    }
    if (this.#Pe("emptied")) {
      this.#fe(), this.#Te(!1);
      return;
    }
    this.#y = 0, this.#qe = 0, this.#Wt = 0, this.#I(), this.#Z(), this.#W = 0, this.#L = 0, this.#cs(), this.#l = null, this.#Te(!1);
  };
  #cs() {
    this.#w = {
      filtered: 0,
      missed: 0,
      degraded: 0,
      discontinuities: 0,
      resynced: 0,
      late: 0,
      queueResetted: 0,
      matched: 0
    }, this.#ni = 0, this.#hi = 0, this.#wt.fill(0), this.#Ft = 0, this.#st = 0, this.#Tt = 0, this.#rt = 0, this.#Ae = 0, this.#we = 0, this.#Fe = 0, this.#Ue = 0, this.#Ee = 0, this.#me = 0, this.#I(), this.#nt = 0, this.#Ge = 0, this.#ht = 0, this.#Xe = 0;
  }
  /**
   * A new seek invalidates any destination frame remembered for the last one.
   */
  #fs = () => {
    if (this.#v) {
      this.#$.hold(), this.#Pe("seeking");
      return;
    }
    if (this.#Pe("seeking")) {
      this.#fe();
      return;
    }
    this.#Je = !1;
  };
  /**
   * Playback stopped, so the frame being held back goes up now. One picture,
   * whatever the rate: a still frame stands for a moment, and the moment is
   * the one the first field was taken at.
   */
  #ge = (e) => {
    if (this.#v) {
      this.#$.hold(), e.type === "ratechange" && this.#he && this.#e.playbackRate > 0 && (this.#le = this.#Ye), this.#Pe(
        e.type
      );
      return;
    }
    if (e.type === "ratechange" && (this.#u.captureDriven ? this.#Xt() : this.#bi()), (e.type === "pause" || e.type === "ended" || e.type === "seeked" || e.type === "ratechange") && this.#Pe(e.type)) {
      this.#fe();
      return;
    }
    if (e.type === "seeked") {
      const i = this.#Je;
      if (this.#Je = !1, i) return;
      this.#y = 0, this.#I(), this.#Z(), this.#l = null, this.#Te(!1);
      return;
    }
    const t = e.type === "ratechange";
    if (t && (this.#L = 0, this.#qe = this.#e.currentTime), this.#I(), this.#C && this.#y > 0) {
      const i = this.#ss(), s = i === null ? void 0 : this.#A[i];
      i !== null && s ? (this.#c = i, this.#xe(!0, !1, s.framebuffer), this.#xi(i)) : this.#xe(!0, !1, null);
    }
    t && (this.#y = 0, this.#st = 0, this.#Z());
  };
  /** The element ran out of data. Its readings stop moving until it has more. */
  #ds = () => {
    this.#v && (this.#$.hold(), this.#Pe("waiting"));
  };
  /**
   * A lost context takes the textures and the program with it. Rebuilding
   * them is possible, but a page that has lost its context has bigger
   * problems; getting out of the way leaves the element's own picture showing.
   */
  #ms = (e) => {
    if (e.preventDefault(), this.#B) {
      this.#B.onFailure("the deinterlacer WebGL context was lost");
      return;
    }
    this.#x !== "active" && (this.#ne = !0, this.#Pt("the deinterlacer WebGL context was lost"), this.stop());
  };
}
function fe(n, e) {
  const t = n.createProgram(), i = de(n, n.VERTEX_SHADER, pt), s = de(n, n.FRAGMENT_SHADER, e);
  if (n.attachShader(t, i), n.attachShader(t, s), n.linkProgram(t), n.deleteShader(i), n.deleteShader(s), !n.getProgramParameter(t, n.LINK_STATUS)) {
    const r = n.getProgramInfoLog(t);
    throw n.deleteProgram(t), new Error(
      `the deinterlacer failed to link: ${r ?? "no reason given"}`
    );
  }
  return t;
}
function de(n, e, t) {
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
const me = "data:video/mp4;base64,AAAAHGZ0eXBpc281AAACAGlzbzVpc282bXA0MQAAAu9tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAB8nRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAFoAAABDgAAAAAAY5tZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAHUwAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAE5bWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAA+XN0YmwAAACtc3RzZAAAAAAAAAABAAAAnWF2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAFoAQ4AEgAAABIAAAAAAAAAAEVTGF2YzYxLjE5LjEwMSBsaWJ4MjY0AAAAAAAAAAAAAAAY//8AAAA3YXZjQwFkACn/4QAZZ2QAKazZQFoET94CIAAAfSAAHUwD4sWywAEAB2j5KBLLIsD9+PgAAAAAEHBhc3AAAAABAAAAAQAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAAKG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAAAAAAAAAAAAAAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuNy4xMDAAAACYbW9vZgAAABBtZmhkAAAAAAAAAAEAAACAdHJhZgAAABx0ZmhkAAIAOAAAAAEAAAPpAAAEJwEBAAAAAAAUdGZkdAEAAAAAAAAAAAAAAAAAAEh0cnVuAAAKBQAAAAYAAACgAgAAAAAABCcAAAfSAAAAQgAAE40AAAA/AAAH0gAAAgAAAAAAAAAARAAAA+kAAAG7AAAH0gAACK9tZGF0AAACrwYF//+r3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTQgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDEzMyBtZT11bWggc3VibWU9MTAgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0yNCBjaHJvbWFfbWU9MSB0cmVsbGlzPTIgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xNSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9dGZmIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTIgYl9iaWFzPTAgZGlyZWN0PTMgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0wIGtleWludD0zMCBrZXlpbnRfbWluPTMgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD0zMCByYz1jcmYgbWJ0cmVlPTEgY3JmPTguMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAUGAQEygAAAAWdliIICAj/+/76ivgU3edyfbbnP6kzu1BfFPXa9rMu/FCi/GMk76JT20AAAAwAAAwAAAwAAAwAAAwAAAwEJmrWZnq7KhXxVTgAAAwAAAwAAAwAABJ9gAAADAAAKtgAAAwAAAwCi4AAAAwAAHQgAAAMAAAiqAAADAAADA7EAAAMAAAMCCgAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAL+QAAAAUGAQEygAAAADVBmiIWQj/51kP//f3t2AAPsAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAS8AAAAAUGAQEygAAAADJBnkETiEf/hv/80gAJcAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAkIQAAAAUGAQEygAAAAfMBnmCTRCP/9ZJR/1zH/6vL5qeSOTmASFdQlObW+4YAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAxvEAAAAwAAAwAAAwAAE4wAAAMAAAMAAAMAAFuAAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAAADAMuAAAAABQYBATKAAAAANwGeYZakI//1bXH/Een/+rAALngAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAN+EAAAAFBgEBMoAAAAGuQZpileloiEf/2XyP/Fn/6mXyw21/v4X7ly3FFO60AAADAAADAAADAAADAAADAAADAAADADKWVJAQiFeS9HQZhFSJuVc/HAAAAwAAAwAAAwAAAwAAAwAAAwAAj8AAAAMAAAMABTIAAAMAAAMAAD+QAAADAAADAAQkAAADAAADAABJgAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAXUQAAAENtZnJhAAAAK3RmcmEBAAAAAAAAAQAAAAAAAAABAAAAAAAAB9IAAAAAAAADCwEBAQAAABBtZnJvAAAAAAAAAEM=", Ct = 0.5, It = 3e3, pe = 0.1, S = 16, Ee = 'video/mp4; codecs="avc1.640029"';
let Z = null;
function Bt(n = {}) {
  return Z ??= Lt(n), Z;
}
async function zt(n = {}) {
  return (await Bt(n)).deinterlaces;
}
function Ht() {
  Z = null;
}
async function Lt(n) {
  const e = n.tolerance ?? Ct, t = n.timeoutMs ?? It, i = performance.now(), s = (o) => ({
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
    h = kt(r, t);
    const o = H(z(r, "loadeddata"), t), a = r.play().then(
      () => !0,
      () => !1
    );
    if (await h.ready, await o, await Ot(r, t, await a), r.videoWidth === 0 || r.videoHeight === 0)
      return s(new Error("the probe clip decoded to nothing"));
    const u = Gt(r);
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
const Y = typeof MediaSource > "u" ? globalThis.ManagedMediaSource : MediaSource, Ut = typeof MediaSource > "u";
function kt(n, e) {
  if (!Y || !Y.isTypeSupported(Ee))
    throw new Error("the probe clip needs Media Source Extensions");
  const t = me.indexOf(","), i = atob(me.slice(t + 1)), s = new Uint8Array(i.length);
  for (let a = 0; a < i.length; a++) s[a] = i.charCodeAt(a);
  const r = new Y(), h = URL.createObjectURL(r);
  if (Ut) {
    n.disableRemotePlayback = !0;
    const a = document.createElement("source");
    a.type = "video/mp4", a.src = h, n.append(a), n.load();
  } else
    n.src = h;
  const o = (async () => {
    await H(z(r, "sourceopen"), e);
    const a = r.addSourceBuffer(Ee), u = H(z(a, "updateend"), e);
    a.appendBuffer(s), await u, r.endOfStream();
  })();
  return { url: h, ready: o };
}
async function Ot(n, e, t) {
  if (t) {
    const i = performance.now();
    for (; n.currentTime < pe && performance.now() - i < e; )
      await new Promise((s) => requestAnimationFrame(s));
    n.pause();
  } else
    n.currentTime = pe, await H(z(n, "seeked"), e);
}
function Gt(n) {
  const e = n.videoHeight, t = document.createElement("canvas");
  t.width = S, t.height = e;
  const i = t.getContext("2d", { willReadFrequently: !0 });
  if (!i) throw new Error("there is no 2d context to read the clip with");
  i.imageSmoothingEnabled = !1, i.drawImage(n, 0, 0, S, e);
  const s = i.getImageData(0, 0, S, e).data, r = (A) => {
    let f = 0;
    for (let d = 0; d < S; d++)
      f += s[(A * S + d) * 4 + 1] ?? 0;
    return f / S;
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
function H(n, e) {
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
ft(Fe);
export {
  Wt as Deinterlacer,
  Ye as YADIF_FRAGMENT_SHADER,
  Ve as YADIF_UNIFORMS,
  zt as decoderDeinterlaces,
  Ht as forgetDecoderProbe,
  Bt as probeDecoder,
  Xt as supportsDeinterlace
};
//# sourceMappingURL=index.js.map
