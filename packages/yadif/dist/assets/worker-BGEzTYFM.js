(function(){"use strict";const P=`#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;function N(n,e,t){const i=n.createProgram(),s=Q(n,n.VERTEX_SHADER,t),r=Q(n,n.FRAGMENT_SHADER,e);if(n.attachShader(i,s),n.attachShader(i,r),n.linkProgram(i),n.deleteShader(s),n.deleteShader(r),!n.getProgramParameter(i,n.LINK_STATUS)){const h=n.getProgramInfoLog(i);throw n.deleteProgram(i),new Error(`the deinterlacer failed to link: ${h??"no reason given"}`)}return i}function Q(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const Ee=`#version 300 es
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
`,be=`#version 300 es
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
`;function xe(n,e){const t=N(n,Ee,be),i=n.getAttribLocation(t,"aVertexPosition"),s=n.getAttribLocation(t,"aTextureCoord"),r=n.getUniformLocation(t,"uTexture"),h=n.getUniformLocation(t,"uMatrix"),o=n.getUniformLocation(t,"uUvMatrix"),l=n.getUniformLocation(t,"uTextColor"),c=n.getUniformLocation(t,"uBackColor");if(r==null||h==null||o==null||l==null||c==null)throw new Error("failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER");const a=n.createBuffer(),d=n.createBuffer();return{gl:n,...Te(n,e),program:t,programUniforms:{vertex:i,textureCoord:s,texture:r,matrix:h,uvMatrix:o,textColor:l,backColor:c},positionBuffer:a,textureBuffer:d}}function Te(n,e){const t=new OffscreenCanvas(0,0),i=t.getContext("2d"),s=new Map;let r=0;const h=0;let o=1;i.font=e,i.fillStyle="white";for(let c=32;c<128;c++){const a=String.fromCharCode(c),d=i.measureText(a),m=Math.ceil(d.actualBoundingBoxDescent+d.actualBoundingBoxAscent+1),u=Math.ceil(d.actualBoundingBoxLeft+d.actualBoundingBoxRight+1);s.set(a,{x:r,y:h,width:u,height:m,metrics:d}),o=Math.max(o,m),r+=u}t.width=r,t.height=o,i.font=e,i.fillStyle="white";for(const[c,a]of s)i.fillText(c,Math.floor(a.x+a.metrics.actualBoundingBoxLeft+1),Math.floor(a.metrics.actualBoundingBoxAscent+1));const l=n.createTexture();return n.bindTexture(n.TEXTURE_2D,l),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t),{fontTexture:l,chars:s,textureSize:{width:r,height:o}}}function ge(n){const e=n.gl;e.deleteBuffer(n.positionBuffer),e.deleteBuffer(n.textureBuffer),e.deleteTexture(n.fontTexture),e.deleteProgram(n.program)}function Fe(n,e,t,i,s,r,h){const o=[],l=[],c=t;for(const m of e){if(m===`
`){t=c,i+=h;continue}const u=n.chars.get(m);if(u==null)continue;if(u.width===1){t+=u.metrics.width;continue}const f=Math.floor(t-u.metrics.actualBoundingBoxLeft),p=Math.floor(i-u.metrics.actualBoundingBoxAscent),b=f+u.width,T=p+u.height;o.push(f,p),l.push(u.x,u.y),o.push(f,T),l.push(u.x,u.y+u.height),o.push(f+u.width,T),l.push(u.x+u.width,u.y+u.height),o.push(b,T),l.push(u.x+u.width,u.y+u.height),o.push(f,p),l.push(u.x,u.y),o.push(b,p),l.push(u.x+u.width,u.y),t+=u.metrics.width}const a=n.gl;a.useProgram(n.program),a.bindBuffer(a.ARRAY_BUFFER,n.positionBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(o),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.vertex,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.vertex),a.bindBuffer(a.ARRAY_BUFFER,n.textureBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(l),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.textureCoord,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.textureCoord),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,n.fontTexture),a.uniform1i(n.programUniforms.texture,0),a.uniform3fv(n.programUniforms.textColor,[1,1,1]),a.uniform3fv(n.programUniforms.backColor,[0,0,0]);function d(m,u,f){const p=[];for(let b=0;b<u;b++)for(let T=0;T<m;T++)p.push(f[T*m+b]);return p}a.uniformMatrix4fv(n.programUniforms.matrix,!1,d(4,4,[1/(s/2),0,0,-1,0,-2/r,0,1,0,0,1,0,0,0,0,1])),a.uniformMatrix3fv(n.programUniforms.uvMatrix,!1,d(3,3,[1/n.textureSize.width,0,0,0,1/n.textureSize.height,0,0,0,1])),a.viewport(0,0,s,r),a.enable(a.BLEND),a.blendFunc(a.SRC_ALPHA,a.ONE_MINUS_SRC_ALPHA),a.drawArrays(a.TRIANGLES,0,o.length/2),a.disable(a.BLEND)}const v={firstRepeatsPrevious:0,secondRepeatsNext:1,secondRepeatsPrevious:2,previousSecondRepeated:3,firstRepeatsNext:4,previousFirstRepeated:5,phase:6,instant:7},M=8,R=16,X=8,ye=15,Re=6,_e=8,Ae=30,we=.01,Ne=.002,J=2,G=1,Se=2,H=10,Pe={a:"uA",b:"uB",fieldMetrics:"uFieldMetrics",first:"uFirst",size:"uSize"},Z=16,ee=8,Me=`#version 300 es

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
  const int BLOCK_W = ${Z};
  const int BLOCK_H = ${ee};

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

  float run = texelFetch(uFieldMetrics, ivec2(${v.phase}, 0), 0)[1];
  float threshold = run == 0.0 ? 0.025 : (run <= 10.0 ? 0.11 : 0.15);

  vec4 even = measure(diffEven, float(totalEven), threshold);
  vec4 odd = measure(diffOdd, float(totalOdd), threshold);
  outFirst = uFirst == 0 ? even : odd;
  outSecond = uFirst == 0 ? odd : even;
}
`,Ce={second:"uSecond",first:"uFirst",size:"uSize"},k=8,De=`#version 300 es
precision highp float;

uniform sampler2D uSecond;
uniform sampler2D uFirst;

uniform ivec2 uSize;

layout(location = 0) out vec4 outSecond;
layout(location = 1) out vec4 outFirst;

void main()
{
  ivec2 dst = ivec2(gl_FragCoord.xy);
  ivec2 base = dst * ${k};

  vec4 second = vec4(0.0);
  vec4 first = vec4(0.0);

  for (int y = 0; y < ${k}; ++y) {
    for (int x = 0; x < ${k}; ++x) {
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
`,Ie={previous:"uPrevious",second:"uSecond",first:"uFirst",comb:"uComb",size:"uSize"},ke=`#version 300 es
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
  return differing <= ${J}.0;
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
 * The instant texel; see INSTANT_ON. A frame is moving if it differs from
 * the frame before it. This is the pair the comb count uses, and the count
 * only sees what changed since that frame. A frame equal to the one before
 * it shows nothing, however much the next frame differs.
 */
vec4 instant(vec4 last, vec4 dSecondPrevious, vec4 dFirstPrevious)
{
  float score = last[0];
  if (max(dSecondPrevious[2], dFirstPrevious[2]) <= ${Ne}) return vec4(score, 0.0, 0.0, last[3]);
  ivec2 blocks = textureSize(uComb, 0);
  float combed = 0.0;
  for (int y = 0; y < blocks.y; ++y) {
    for (int x = 0; x < blocks.x; ++x) {
      if (texelFetch(uComb, ivec2(x, y), 0)[0] > ${X}.0) combed += 1.0;
    }
  }
  bool clean = combed <= ${we} * float(blocks.x * blocks.y);
  score = clean ? min(score + 1.0, ${Ae}.0) : max(score - ${_e}.0, 0.0);
  bool on = last[3] > 0.5 ? score >= ${Re}.0 : score >= ${ye}.0;
  return vec4(score, clean ? 1.0 : 0.0, combed, on ? 1.0 : 0.0);
}

void main()
{
  int metric = int(gl_FragCoord.x);
  // The comparisons against the next frame become, a frame later, the ones
  // against the previous frame, and those the ones before.
  if (metric == ${v.firstRepeatsPrevious}) {
    outValue = previous(${v.firstRepeatsNext});
  } else if (metric == ${v.secondRepeatsNext}) {
    outValue = fold(uSecond);
  } else if (metric == ${v.secondRepeatsPrevious}) {
    outValue = previous(${v.secondRepeatsNext});
  } else if (metric == ${v.previousSecondRepeated}) {
    outValue = previous(${v.secondRepeatsPrevious});
  } else if (metric == ${v.firstRepeatsNext}) {
    outValue = fold(uFirst);
  } else if (metric == ${v.previousFirstRepeated}) {
    outValue = previous(${v.firstRepeatsPrevious});
  } else if (metric == ${v.instant}) {
    outValue = instant(
      previous(${v.instant}),
      previous(${v.secondRepeatsNext}),
      previous(${v.firstRepeatsNext})
    );
  } else {
    outValue = decide(
      previous(${v.phase}),
      previous(${v.firstRepeatsNext}),
      fold(uSecond),
      previous(${v.secondRepeatsNext}),
      previous(${v.secondRepeatsPrevious}),
      fold(uFirst),
      previous(${v.firstRepeatsPrevious})
    );
  }
}
`,Le={prev:"uPrev",cur:"uCur",first:"uFirst",size:"uSize"},Ue=`#version 300 es
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
  ivec2 base = block * ${R};
  float standing = 0.0;
  float woven = 0.0;
  for (int dy = 0; dy < ${R}; ++dy) {
    int y = base.y + dy;
    if (y >= uSize.y || (y & 1) == uFirst) continue;
    for (int dx = 0; dx < ${R}; ++dx) {
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
`,Be={prev:"uPrev",cur:"uCur",next:"uNext",size:"uSize",parity:"uParity",tff:"uTff",spatialCheck:"uSpatialCheck",debug:"uDebug",film:"uFilm",second:"uSecond",phase:"uPhase",fieldMetrics:"uFieldMetrics",comb:"uComb",combAhead:"uCombAhead",match:"uMatch",instant:"uInstant"},Oe=`#version 300 es
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
  return texelFetch(uFieldMetrics, ivec2(metric, 0), 0)[1] <= ${J}.0;
}

/** The pulldown phase the detection gave this frame, or 0. See film-shader.ts. */
int detectedPhase() {
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${v.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${H}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${G} || phase == ${Se};
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
  ivec2 block = ivec2(x / ${R}, y / ${R});
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
  return texelFetch(uFieldMetrics, ivec2(${v.instant}, 0), 0)[3] > 0.5;
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
    vec4 comb = texelFetch(uComb, ivec2(x / ${R}, y / ${R}), 0);
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
`,S={phase:0,run:0};function $(n,e,t){return Object.fromEntries(Object.entries(t).map(([i,s])=>[i,n.getUniformLocation(e,s)]))}class te{#t;#i;#e;#u;#p;#R;#s;#n;#l;#o=null;#d=null;#m=null;#C=null;#h=null;#a=0;#f=null;#c=null;#r=0;#g=0;metrics=new Float32Array(M*4);#b=0;#x=0;constructor(e){this.#t=e,this.#i=N(e,Me,P),this.#e=$(e,this.#i,Pe),this.#u=N(e,De,P),this.#p=$(e,this.#u,Ce),this.#R=N(e,ke,P),this.#s=$(e,this.#R,Ie),this.#n=N(e,Ue,P),this.#l=$(e,this.#n,Le)}get texture(){return this.#h?.[this.#a]?.textures[0]??null}get combTexture(){return this.#m?.textures[0]??null}get combAheadTexture(){return this.#C?.textures[0]??null}resize(e,t){e===this.#b&&t===this.#x||(this.#b=e,this.#x=t,this.#S())}reset(e=!1){const t=this.#t;t.deleteSync(this.#c),this.#c=null,this.#r=0;const i=this.#h?.[this.#a];if(!i)return;const s=e?v.instant:M,r=new Float32Array(s*4);for(let h=0;h<v.phase;h++)r[h*4+1]=1;t.bindTexture(t.TEXTURE_2D,i.textures[0]??null),t.texSubImage2D(t.TEXTURE_2D,0,0,0,s,1,t.RGBA,t.FLOAT,r)}detect(e,t,i){const s=this.#t;if(this.#b===0||this.#x===0)return;this.#w();const r=this.#o,h=this.#d,o=this.#h;if(r===null||h===null||o===null)return;const l=o[this.#a],c=o[1-this.#a];if(s.bindFramebuffer(s.FRAMEBUFFER,r.framebuffer),s.useProgram(this.#i),this.#N(0,e,this.#e.a),this.#N(1,t,this.#e.b),this.#N(2,l.textures[0],this.#e.fieldMetrics),s.uniform1i(this.#e.first,i),s.uniform2i(this.#e.size,this.#b,this.#x),s.viewport(0,0,r.width,r.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,h.framebuffer),s.useProgram(this.#u),this.#N(0,r.textures[0],this.#p.second),this.#N(1,r.textures[1],this.#p.first),s.uniform2i(this.#p.size,r.width,r.height),s.viewport(0,0,h.width,h.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,c.framebuffer),s.useProgram(this.#R),this.#N(0,l.textures[0],this.#s.previous),this.#N(1,h.textures[0],this.#s.second),this.#N(2,h.textures[1],this.#s.first),this.#N(3,this.#m?.textures[0],this.#s.comb),s.uniform2i(this.#s.size,h.width,h.height),s.viewport(0,0,M,1),s.drawArrays(s.TRIANGLES,0,3),this.#a=1-this.#a,this.#r++,this.#c!==null){s.bindFramebuffer(s.FRAMEBUFFER,null);return}this.#g=this.#r,s.bindBuffer(s.PIXEL_PACK_BUFFER,this.#f),s.readPixels(0,0,M,1,s.RGBA,s.FLOAT,0),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.FRAMEBUFFER,null),this.#c=s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE,0),s.flush()}measureComb(e,t,i,s=!1){const r=this.#t;if(this.#b===0||this.#x===0)return;this.#w();const h=s?this.#C:this.#m;h!==null&&(r.bindFramebuffer(r.FRAMEBUFFER,h.framebuffer),r.useProgram(this.#n),this.#N(0,e,this.#l.prev),this.#N(1,t,this.#l.cur),r.uniform1i(this.#l.first,i),r.uniform2i(this.#l.size,this.#b,this.#x),r.viewport(0,0,h.width,h.height),r.drawArrays(r.TRIANGLES,0,3),r.bindFramebuffer(r.FRAMEBUFFER,null))}poll(){const e=this.#t,t=this.#c;if(t===null||this.#f===null)return null;switch(e.clientWaitSync(t,0,0)){case e.ALREADY_SIGNALED:case e.CONDITION_SATISFIED:return e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#f),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,this.metrics),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),e.deleteSync(t),this.#c=null,{phase:this.metrics[v.phase*4]??0,run:this.metrics[v.phase*4+1]??0,instant:(this.metrics[v.instant*4+3]??0)>.5,age:this.#r-this.#g};default:return null}}destroy(){const e=this.#t;if(this.#S(),this.#h!==null){for(const t of this.#h)D(e,t);this.#h=null}e.deleteSync(this.#c),this.#c=null,e.deleteBuffer(this.#f),this.#f=null,e.deleteProgram(this.#i),e.deleteProgram(this.#u),e.deleteProgram(this.#R),e.deleteProgram(this.#n)}#N(e,t,i){const s=this.#t;s.activeTexture(s.TEXTURE0+e),s.bindTexture(s.TEXTURE_2D,t??null),s.uniform1i(i,e)}#S(){const e=this.#t;this.#o!==null&&D(e,this.#o),this.#d!==null&&D(e,this.#d),this.#m!==null&&D(e,this.#m),this.#C!==null&&D(e,this.#C),this.#o=null,this.#d=null,this.#m=null,this.#C=null}#w(){const e=this.#t;if(this.#o===null||this.#d===null||this.#m===null||this.#C===null){this.#S();const t=Math.ceil(this.#b/Z),i=Math.ceil(this.#x/(ee*2));this.#o=C(e,t,i,2),this.#d=C(e,Math.ceil(t/k),Math.ceil(i/k),2),this.#m=C(e,Math.ceil(this.#b/R),Math.ceil(this.#x/R),1),this.#C=C(e,Math.ceil(this.#b/R),Math.ceil(this.#x/R),1)}this.#h===null&&(this.#h=[C(e,M,1,1),C(e,M,1,1)],this.#a=0,this.reset()),this.#f===null&&(this.#f=e.createBuffer(),e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#f),e.bufferData(e.PIXEL_PACK_BUFFER,this.metrics.byteLength,e.STREAM_COPY),e.bindBuffer(e.PIXEL_PACK_BUFFER,null))}}function C(n,e,t,i){const s=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,s);const r=[];for(let l=0;l<i;l++){const c=n.createTexture();n.bindTexture(n.TEXTURE_2D,c),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,e,t,0,n.RGBA,n.FLOAT,null),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+l,n.TEXTURE_2D,c,0),r.push(c)}n.drawBuffers(r.map((l,c)=>n.COLOR_ATTACHMENT0+c));const h=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE;n.bindFramebuffer(n.FRAMEBUFFER,null);const o={framebuffer:s,textures:r,width:e,height:t};if(!h)throw D(n,o),new Error("failed to allocate framebuffer");return o}function D(n,{framebuffer:e,textures:t}){n.deleteFramebuffer(e);for(const i of t)n.deleteTexture(i)}function ie(n){return Number.isInteger(n)&&n>0}function Xe(n){const{timestamp:e,duration:t,width:i,height:s,displayWidth:r,displayHeight:h,data:o,planes:l,matrix:c}=n;if(!Number.isFinite(e)||!(t>0)||!Number.isFinite(t))throw new TypeError(`invalid picture timing ${e}+${t}`);if(!ie(i)||!ie(s))throw new TypeError(`invalid picture size ${i}x${s}`);if(!(r>0)||!(h>0))throw new TypeError(`invalid display size ${r}x${h}`);if(c!=="bt709"&&c!=="bt601")throw new TypeError(`unknown matrix ${String(c)}`);if(l.length!==3)throw new TypeError("a picture has three planes");for(let a=0;a<3;a++){const d=a===0?i:Math.ceil(i/2),m=a===0?s:Math.ceil(s/2),{offset:u,stride:f}=l[a];if(!Number.isInteger(u)||u<0||!Number.isInteger(f)||f<d||u+f*(m-1)+d>o.byteLength)throw new TypeError(`plane ${a} at ${u} with stride ${f} does not fit ${d}x${m} samples in ${o.byteLength} bytes`)}}function se(n,e){const t=1-n-e;return Float32Array.of(2*(1-n),2*(1-e)*e/t,2*(1-n)*n/t,2*(1-e))}const Ge={bt709:se(.2126,.0722),bt601:se(.299,.114)},$e=`#version 300 es
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
`;class ze{#t;#i;#e;#u;#p;#R;#s;#n;#l=[];#o=0;#d=0;#m=!1;constructor(e){this.#t=e,this.#i=N(e,$e,P),this.#e=e.getUniformLocation(this.#i,"uLuma"),this.#u=e.getUniformLocation(this.#i,"uCb"),this.#p=e.getUniformLocation(this.#i,"uCr"),this.#R=e.getUniformLocation(this.#i,"uInterlaced"),this.#s=e.getUniformLocation(this.#i,"uMatrix"),this.#n=e.createFramebuffer()}resize(e,t){const i=this.#t;for(const s of this.#l)i.deleteTexture(s);this.#l=[];for(let s=0;s<3;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texStorage2D(i.TEXTURE_2D,1,i.R8,s===0?e:Math.ceil(e/2),s===0?t:Math.ceil(t/2)),this.#l.push(r)}this.#o=e,this.#d=t,this.#m=!1}convert(e,t){const i=this.#t,s=new Uint8Array(e.data);i.pixelStorei(i.UNPACK_ALIGNMENT,1);for(let r=0;r<3;r++){const{offset:h,stride:o}=e.planes[r];i.bindTexture(i.TEXTURE_2D,this.#l[r]),i.pixelStorei(i.UNPACK_ROW_LENGTH,o),i.texSubImage2D(i.TEXTURE_2D,0,0,0,r===0?this.#o:Math.ceil(this.#o/2),r===0?this.#d:Math.ceil(this.#d/2),i.RED,i.UNSIGNED_BYTE,s,h)}if(i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.bindFramebuffer(i.FRAMEBUFFER,this.#n),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,t,0),!this.#m){if(i.checkFramebufferStatus(i.FRAMEBUFFER)!==i.FRAMEBUFFER_COMPLETE)throw i.bindFramebuffer(i.FRAMEBUFFER,null),new Error("decoded pictures cannot be drawn into RGBA8");this.#m=!0}i.useProgram(this.#i);for(let r=0;r<3;r++)i.activeTexture(i.TEXTURE0+r),i.bindTexture(i.TEXTURE_2D,this.#l[r]);i.uniform1i(this.#e,0),i.uniform1i(this.#u,1),i.uniform1i(this.#p,2),i.uniform1i(this.#R,e.interlaced?1:0),i.uniform4fv(this.#s,Ge[e.matrix]),i.viewport(0,0,this.#o,this.#d),i.drawArrays(i.TRIANGLES,0,3),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null)}destroy(){const e=this.#t;for(const t of this.#l)e.deleteTexture(t);this.#l=[],e.deleteFramebuffer(this.#n),e.deleteProgram(this.#i)}}const re=250,F=4,We=.01,He=100,Ve=250,ne=.5,w=2;class qe{#t=0;#i=Number.NaN;#e=0;#u=1;#p=!0;#R=Number.NaN;#s=0;#n=!1;#l=0;#o=0;#d=Number.NaN;#m=0;#C=new Float64Array(F);#h=0;#a=!0;#f=new Float64Array(F).fill(Number.NaN);#c=0;#r=0;#g=!1;#b=!1;#x=!1;#N=new Float64Array(3).fill(Number.NaN);#S=0;#w=Number.NaN;#j=Number.NaN;#v=Number.NaN;#P=Number.NaN;#he=!1;#te=Number.NEGATIVE_INFINITY;at(e){return this.#p&&!Number.isNaN(this.#P)&&!Number.isNaN(this.#i)?this.#V(e):this.#i+this.#e*(e-this.#t)/1e3}#V(e){const t=this.#u,i=this.#j+t*(e-this.#v-this.#P)/1e3,s=this.#R+t*(e-this.#o)/1e3;return Math.max(this.#te,Math.min(s,Math.max(this.#w,i)))}get rate(){return this.#e}get origin(){return this.#d}hold(){this.#a=!0,this.#i=Number.NaN,this.#e=0}observe(e,t,i,s){const r=e-this.#o;if(this.#o=e,!s||i===0||this.#a||i!==this.#u){const x=i!==0&&(!s||this.#u===0||i===this.#u);return this.#a=!1,this.#u=i,this.#M(e,t),x&&(this.#w=t),!1}const h=this.#r!==0;if(!this.#p&&!h&&this.#ie(r),t===this.#R){if(this.#p)return Number.isNaN(this.#P)||(this.#he=!0),!1;if(h)return e>this.#r&&(this.#g=!0,this.#B(e,t,!0)),!1;const x=this.#Z(i),O=Number.isNaN(x)?Ve:x+r+w;return e-this.#s>O&&this.#B(e,t,!Number.isNaN(x)),!1}const o=(t-this.#R)*1e3/i,l=e-this.#s,c=l-r,a=this.#l;this.#R=t,this.#s=e,this.#l=r;const d=o<=l+a+w,m=o>=l*ne&&d;if(this.#p){const x=!this.#n;if(this.#n=!0,x&&!Number.isNaN(this.#w)&&c<=w){this.#j=t,this.#v=e;const ve=this.#se();this.#P=ve>r+w?ve:Number.NaN}else this.#he&&o>=r*ne&&o<=r+a+w&&(this.#te=t);this.#x&&!x&&m&&this.#z(c,i),this.#x=!1;const O=this.#I(i,r);if(!x&&m){if(O||this.#b)return this.#g=!1,this.#q(e,t,i,r,O),!0;this.#b=!0}else if(this.#b=!1,x&&!this.#g&&O&&o>0&&d)return this.#q(e,t,i,r,!0),!0;return this.#t=e,this.#i=t,!1}if(h){if(!m)return this.#g=!0,this.#M(e,t),!1;this.#r=0,this.#g=!1}else m&&this.#z(c,i);const u=t-this.at(e);if(Math.abs(u)>He/1e3*i)return this.#d=t,this.#Q(e,t),!0;const f=this.#C;e-this.#h>=re?(f.copyWithin(0,1),f[F-1]=u,this.#h=e):f[F-1]=Math.max(f[F-1],u);let p=f[0];for(let x=1;x<F;x++)p=Math.max(p,f[x]);const b=We*i*(e-this.#m)/1e3,T=Math.max(-b,Math.min(b,p));this.#m=e,this.#i+=T;for(let x=0;x<F;x++)f[x]=f[x]-T;return!1}#ie(e){this.#c+=e,!(this.#c<re)&&(this.#f.copyWithin(0,1),this.#f[F-1]=0,this.#c=0)}#q(e,t,i,s,r){Number.isNaN(this.#v)||(this.#N[this.#S++%this.#N.length]=(this.#j-t)*1e3/i+(e-this.#v)),this.#Q(e,t),r&&(this.#r=e+this.#Z(i)+s+w)}#B(e,t,i){const s=this.#s;this.#M(e,t),i&&(this.#s=s,this.#n=!0,this.#x=!0)}#z(e,t){const i=this.#f[F-1],s=e*t/1e3;this.#f[F-1]=Number.isNaN(i)?s:Math.max(i,s)}#I(e,t){let i=Number.POSITIVE_INFINITY;for(let r=0;r<F-1;r++){const h=this.#f[r];if(Number.isNaN(h))return!1;i=Math.min(i,h)}const s=i*1e3/e;return s>w&&s+w>=t}#Z(e){let t=Number.NaN;for(let s=0;s<F-1;s++){const r=this.#f[s];Number.isNaN(r)||(t=Number.isNaN(t)?r:Math.max(t,r))}if(Number.isNaN(t))return t;const i=this.#f[F-1];return Number.isNaN(i)||(t=Math.max(t,i)),t*1e3/e}#se(){const[e,t,i]=this.#N;return Number.isNaN(e)||Number.isNaN(t)||Number.isNaN(i)?Number.NaN:Math.max(Math.min(e,t),Math.min(Math.max(e,t),i))}#M(e,t){this.#w=Number.NaN,this.#j=Number.NaN,this.#v=Number.NaN,this.#P=Number.NaN,this.#he=!1,this.#te=Number.NEGATIVE_INFINITY,this.#x=!1,this.#b=!1,this.#r=0,this.#t=e,this.#i=t,this.#e=0,this.#p=!0,this.#n=!1,this.#R=t,this.#s=e,this.#d=t}#Q(e,t){this.#v=Number.NaN,this.#P=Number.NaN,this.#r=0,this.#t=e,this.#i=t,this.#e=this.#u,this.#p=!1,this.#m=e,this.#h=e,this.#C.fill(Number.NEGATIVE_INFINITY),this.#C[F-1]=0}}const L=16,Ke=6,Ye=`#version 300 es
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
`;class je{#t;#i;#e=null;#u=null;#p=[];#R=0;#s=[];#n=new Uint8Array(0);#l=[];#o=null;#d=0;constructor(e,t){this.#t=e,this.#i=t}take(){const e=this.#t,t=this.#p.pop()??this.#a();if(t===null)return null;const i=this.#i.videoWidth,s=this.#i.videoHeight;e.bindTexture(e.TEXTURE_2D,t);try{e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#i)}catch(o){throw this.#p.push(t),o}const r={id:++this.#d,texture:t,width:i,height:s,changed:null,fence:null,buffer:null,reported:!1},h=this.#o;return h===null||h.width!==i||h.height!==s?r.changed=!0:this.#m(r,h),this.#o=r,this.#l.push(r),r.id}settle(){const e=this.#t,t=this.#l.find(i=>!i.reported);if(t===void 0||t===this.#o)return null;if(t.changed===null){const{fence:i,buffer:s}=t;if(i===null||s===null)return null;const r=e.clientWaitSync(i,0,0);if(r!==e.ALREADY_SIGNALED&&r!==e.CONDITION_SATISFIED)return null;this.#n.byteLength<s.bytes&&(this.#n=new Uint8Array(s.bytes));const h=this.#n.subarray(0,s.bytes);e.bindBuffer(e.PIXEL_PACK_BUFFER,s.buffer),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,h),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),t.changed=Qe(h),this.#C(t)}return t.reported=!0,{id:t.id,changed:t.changed}}adopt(e,t){const i=this.#l.findIndex(r=>r.id===e),s=this.#l[i];if(s===void 0||!s.reported)throw new Error(`picture ${e} is not available to adopt`);return this.#l.splice(i,1),this.#p.push(t),s.texture}release(e){const t=this.#l.findIndex(s=>s.id===e),i=this.#l[t];i!==void 0&&(this.#l.splice(t,1),this.#h(i))}reset(){const e=this.#l;this.#l=[],this.#o=null;for(const t of e)this.#C(t),this.#h(t)}destroy(){const e=this.#t;this.reset();for(const t of this.#p)e.deleteTexture(t);this.#p=[],this.#R=0;for(const{buffer:t}of this.#s)e.deleteBuffer(t);this.#s=[],this.#r(),this.#e!==null&&e.deleteProgram(this.#e),this.#e=null}#m(e,t){const i=this.#t,s=Math.ceil(e.width/L),r=Math.ceil(e.height/L),h=this.#c(s,r),o=this.#g(s*r*4);this.#e??=this.#f(),i.bindFramebuffer(i.FRAMEBUFFER,h.framebuffer),i.useProgram(this.#e),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,t.texture),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e.texture),i.viewport(0,0,s,r),i.drawArrays(i.TRIANGLES,0,3),i.bindBuffer(i.PIXEL_PACK_BUFFER,o.buffer),i.readPixels(0,0,s,r,i.RGBA,i.UNSIGNED_BYTE,0),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),i.bindFramebuffer(i.FRAMEBUFFER,null),e.fence=i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE,0),e.buffer=o,i.flush()}#C(e){const t=this.#t;e.fence!==null&&t.deleteSync(e.fence),e.fence=null;const i=e.buffer;if(e.buffer=null,i===null)return;const s=this.#u;s!==null&&i.bytes===s.width*s.height*4?this.#s.push(i):t.deleteBuffer(i.buffer)}#h(e){this.#p.push(e.texture)}#a(){if(this.#R===Ke)return null;const e=this.#t,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.#R++,t}#f(){const e=this.#t,t=N(e,Ye,P);return e.useProgram(t),e.uniform1i(e.getUniformLocation(t,"uTake"),0),e.uniform1i(e.getUniformLocation(t,"uReference"),1),t}#c(e,t){const i=this.#t,s=this.#u;if(s?.width===e&&s.height===t)return s;this.#r();for(const{buffer:l}of this.#s)i.deleteBuffer(l);this.#s=[];const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null);const h=i.createFramebuffer();i.bindFramebuffer(i.FRAMEBUFFER,h),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,r,0),i.bindFramebuffer(i.FRAMEBUFFER,null);const o={framebuffer:h,texture:r,width:e,height:t};return this.#u=o,o}#r(){const e=this.#t;this.#u!==null&&(e.deleteFramebuffer(this.#u.framebuffer),e.deleteTexture(this.#u.texture),this.#u=null)}#g(e){const t=this.#s.pop();if(t!==void 0)return t;const i=this.#t,s=i.createBuffer();return i.bindBuffer(i.PIXEL_PACK_BUFFER,s),i.bufferData(i.PIXEL_PACK_BUFFER,e,i.STREAM_COPY),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),{buffer:s,bytes:e}}}function Qe(n){for(let e=0;e<n.length;e+=4)if(n[e]!==0||n[e+1]!==0||n[e+2]!==0)return!0;return!1}const he=["mozParsedFrames","mozDecodedFrames","mozPresentedFrames","mozPaintedFrames"];function Je(n){return he.every(e=>e in n)}function Ze(n){return n.ownerDocument?.defaultView?.performance.timeOrigin??performance.timeOrigin}const et=250,V=500,tt=1.75,it=3,st=200;class rt{#t;#i;#e;#u=null;#p=[];#R=0;#s=null;#n=0;#l=null;#o=null;#d=null;#m=null;#C=null;#h=null;#a=!0;#f=null;#c=null;#r=0;#g;#b;#x=null;#N=null;#S=null;#w=null;#j=0;#v=[];#P=[];constructor(e,t){if(this.#t=e,this.#e=t,this.#i=Je(e)?e:null,this.#g=this.#i===null&&typeof VideoFrame<"u",this.#b=this.#g&&e.playbackRate>1,this.#i){for(const i of["emptied","seeking","seeked"])e.addEventListener(i,this.#z);for(const i of["pause","playing","waiting","ratechange"])e.addEventListener(i,this.#B)}if(this.#g)for(const i of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])e.addEventListener(i,this.#te)}get captureDriven(){return this.#b}request(e){if(this.#m===null){if(this.#m=e,this.#b){this.#V();return}this.#d=this.#i?requestAnimationFrame(this.#M):this.#t.requestVideoFrameCallback(this.#Z)}}cancel(){this.#d!==null&&(this.#i?cancelAnimationFrame(this.#d):this.#t.cancelVideoFrameCallback(this.#d)),this.#d=null,this.#m=null,this.#x?.(),this.#x=null,this.#S!==null&&this.#t.cancelVideoFrameCallback(this.#S),this.#S=null,this.#he(),this.#w=null,this.#v=[],this.#b=this.#g&&this.#t.playbackRate>1,this.#z()}destroy(){this.cancel();for(const e of["emptied","seeking","seeked"])this.#t.removeEventListener(e,this.#z);for(const e of["pause","playing","waiting","ratechange"])this.#t.removeEventListener(e,this.#B);for(const e of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])this.#t.removeEventListener(e,this.#te)}flush(e){if(this.#b)for(this.#t.ownerDocument!==this.#N&&(this.#x?.(),this.#x=null,this.#V());this.#P.length>0&&this.#m!==null;){const t=this.#P.shift(),i=t.frame;try{this.#se(e,{width:i.visibleRect?.width??i.codedWidth,height:i.visibleRect?.height??i.codedHeight,mediaTime:i.timestamp/1e6,presentedFrames:t.count,expectedDisplayTime:Math.max(t.at,e),timeOrigin:performance.timeOrigin,frame:i})}finally{i.close()}}}#he(){for(const e of this.#P)e.frame.close();this.#P=[]}#te=e=>{const t=this.#g&&this.#t.playbackRate>1;if(t!==this.#b){const i=this.#m;this.cancel(),this.#b=t,i!==null&&this.request(i);return}["seeking","seeked","emptied","ratechange"].includes(e.type)&&(this.#w=null,this.#v=[]),this.#b&&((e.type==="pause"||e.type==="ended")&&this.flush(performance.now()),this.#he(),this.#x?.(),this.#x=null,this.#m!==null&&this.#V())};#V(){if(!this.#b||this.#x!==null||this.#m===null||(this.#t.paused||this.#t.ended)&&this.#w!==null)return;this.#S===null&&typeof this.#t.requestVideoFrameCallback=="function"&&(this.#S=this.#t.requestVideoFrameCallback(this.#ie));const e=Math.max(4,8/Math.max(1,this.#t.playbackRate)),t=this.#t.ownerDocument?.defaultView;if(this.#N=this.#t.ownerDocument,t){const i=t.setTimeout(this.#q,e);this.#x=()=>t.clearTimeout(i)}else{const i=setTimeout(this.#q,e);this.#x=()=>clearTimeout(i)}}#ie=()=>{this.#S=null,this.#x?.(),this.#x=null,this.#q()};#q=()=>{this.#x=null;const e=this.#t;if(this.#m===null)return;if(e.readyState<2||e.seeking){this.#V();return}let t;try{t=new VideoFrame(e)}catch(i){if(!(i instanceof DOMException)||i.name!=="InvalidStateError")throw i;this.#V();return}if(t.timestamp===this.#w)t.close();else{let i=1;if(this.#w!==null){const s=t.timestamp-this.#w;if(s>1e3&&s<25e4&&(this.#v.push(s),this.#v.length>7&&this.#v.shift()),s>0&&this.#v.length>0){const r=[...this.#v].sort((o,l)=>o-l),h=r[Math.floor(r.length/2)];i=Math.max(1,Math.round(s/h))}}for(this.#w=t.timestamp,this.#j+=i,this.#P.push({frame:t,at:performance.now(),count:this.#j});this.#P.length>4;)this.#P.shift().frame.close()}this.#V()};#B=()=>{this.#f=null,this.#c=null,this.#r=0};#z=()=>{this.#C=null,this.#h=null,this.#a=!0,this.#I(),this.#B()};#I(){this.#u?.reset(),this.#p=[],this.#n=0}#Z=(e,t)=>{this.#se(e,{width:t.width,height:t.height,mediaTime:t.mediaTime,presentedFrames:t.presentedFrames,expectedDisplayTime:t.expectedDisplayTime,timeOrigin:Ze(this.#t)})};#se=(e,t)=>{const i=this.#m;this.#d=null,this.#m=null,i?.(e,t)};#M=e=>{const t=this.#i,i=he.map(l=>t[l]);this.#C?.some((l,c)=>i[c]<l)&&this.#z(),this.#C=i;const s=this.#e?.()??null;s!==this.#u&&(this.#z(),this.#u=s);const r=t.mozPaintedFrames,h=!t.seeking&&t.readyState>=2&&t.videoWidth>0&&t.videoHeight>0,o=this.#h===null&&(r>0||t.paused&&(t.mozPresentedFrames>0||t.mozDecodedFrames>0));if(s!==null){this.#ce(e,t,s,h,o);return}if(h&&(o||this.#h!==null&&r!==this.#h)){this.#f!==null&&e-this.#f>V&&(this.#B(),this.#a=!0),this.#Q(e,t),this.#f=e,this.#h=r;const l=this.#a;this.#a=!1,this.#se(e,{width:t.videoWidth,height:t.videoHeight,mediaTime:t.currentTime,presentedFrames:r,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#r,discontinuity:l}})}else this.#d=requestAnimationFrame(this.#M)};#Q(e,t){if(t.paused||t.ended)return;const i=t.mozPaintedFrames,s=this.#c;if(s&&e-s.at>=et){const r=i-s.frames;if(r>0){const h=(e-s.at)/r;h>=4&&h<=200&&(this.#r=this.#r?this.#r+(h-this.#r)*.25:h)}this.#c=null}this.#c??={at:e,frames:i}}#ce(e,t,i,s,r){const h=t.mozPaintedFrames,o=this.#h!==null&&h!==this.#h;this.#s!==null&&e-this.#s>V&&(this.#I(),this.#B(),this.#a=!0),this.#s=e,o&&this.#Q(e,t);const l=t.paused||t.ended;(!l||o)&&(this.#n=0),l&&this.#l!==null&&(this.#l=e);const c=l&&this.#n>=it;if(s&&(r||this.#h!==null)){this.#h=h;const u=c?null:i.take();u!==null&&this.#p.push({id:u,at:e,mediaTime:t.currentTime,width:t.videoWidth,height:t.videoHeight,resting:l})}let a=null;for(let u=i.settle();u!==null;u=i.settle()){const f=this.#p.shift();if(f?.id!==u.id)throw new Error("picture verdicts arrived out of order");let p=u.changed;if(p?this.#n=0:(this.#n=f.resting?this.#n+1:0,p=a===null&&!f.resting&&this.#l!==null&&(f.at-this.#l)*(t.playbackRate||1)>=st&&h!==this.#o),!p){i.release(f.id);continue}a!==null&&i.release(a.id),a=f}if(a===null){this.#d=requestAnimationFrame(this.#M);return}let d=1;if(this.#f!==null){const u=a.at-this.#f;u>V?(this.#B(),this.#a=!0):this.#r>0&&u>this.#r*tt&&(d=Math.round(u/this.#r))}this.#R+=d,this.#f=a.at,this.#l=a.at,this.#o=h;const m=this.#a;this.#a=!1;try{this.#se(e,{width:a.width,height:a.height,mediaTime:a.mediaTime,presentedFrames:this.#R,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#r,discontinuity:m},picture:a.id})}finally{i.release(a.id)}}}let nt=null;const q=.5,g=4,K=5,_=K+1,oe=1e3,ae=4,z=200,ht=.25,ot=1e3/60,at=`#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`,lt=.75,ut=.1,le=1,ct=60,ft=.02,dt=.1,U=1,mt=4,pt=90,vt=1.5,ue=4,Et=24,B=.001,W=5,ce=4,fe={2:0,3:.25,4:.5,5:.75};function de(n){return xt[(n.interlaced?2:0)+(n.topFieldFirst?1:0)]}const bt=`#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`,xt=[{interlaced:!1,topFieldFirst:!1},{interlaced:!1,topFieldFirst:!0},{interlaced:!0,topFieldFirst:!1},{interlaced:!0,topFieldFirst:!0}],Tt={requestAnimationFrame:n=>requestAnimationFrame(n),cancelAnimationFrame:n=>cancelAnimationFrame(n)},gt={setTimeout:(n,e)=>setTimeout(n,e),clearTimeout:n=>clearTimeout(n)};class Ft extends EventTarget{decodedVideo;#t;#i;#e;#u;#p;#R=null;#s;#n=null;#l;#o;#d;#m;#C;#h=[];#a=[];#f=_-1;#c=null;#r=[];#g=null;#b=null;#x=Number.NEGATIVE_INFINITY;#N=0;#S=null;#w=null;#j;#v=ot;#P=0;#he=0;#te=0;#V=0;#ie=null;#q=0;#B=0;#z=0;#I(){this.#r.length=0,this.#Oe.length=0,this.#ie=null,this.#q=0,this.#B=0,this.#V=0}#Z=null;#se;#M;#Q;#ce=0;#oe;#O;#L=0;#X=0;#J=0;#_=g-1;#A=0;#Ve=0;#Lt=0;#qe=!1;#D=!1;#re=0;#we=!1;#ee=!1;#U=null;#Ne=[];#ne=!1;#Ut;#Bt;#k;#Se;#fe;#Ot;#T=null;#y;#Ke=!1;#Xt=0;#Gt=!1;#ts=0;#Ye=!1;#ft=!1;#Pe=null;#is=0;#je=new Map;#F={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0};#Qe=0;#Je=0;#dt=0;#ae=0;#xe=0;#Te=0;#Me=0;#de=0;#Ce;#mt=[];#De=[];#Ze=0;#Ie=0;#et=0;#ke=0;#tt=S;#Le=0;#G=S;#K=!1;#$=0;#pt=!1;#ge=!1;#$t=!1;#zt=!1;#Wt=!1;#it=!1;#Ue=null;#bi="";#vt=[0,0,0,0,0,0];#Et=0;#Fe=null;#Ht=null;#Vt=0;#E=!1;#ye=[];#qt=!1;#W=new qe;#st=null;#Re=Array.from({length:g},()=>({timestamp:0,duration:0,interlaced:!0,topFieldFirst:!0,repeatFirstField:!1}));#Kt=!1;#bt=Number.NEGATIVE_INFINITY;#Be=!1;#rt=!1;#Oe=[];#xt=null;#me=null;#Xe=null;#Yt=Number.NEGATIVE_INFINITY;#nt=1;#jt=!0;#ht=0;#ot=0;#Qt=null;#Tt=!1;#Jt=0;#Zt=0;#gt=!1;#xi=Number.NaN;#Ti=Number.NaN;#Ft=new Map;#ss=0;constructor(e,t={},i=null){super(),this.#e=e,this.#M=t.doubleRate??!1,this.#Q=t.spatialCheck??!0,this.#oe=t.debug??!1,this.#O=t.film??!1,this.#Ut=t.onStats,this.#Bt=t.onFailure,this.#k=i,this.#fe=i?"main":t.rendering??"main",this.#Ot=t.workerUrl??nt,this.#y=this.#fe==="main"?"main":"idle",this.#i=i?i.canvas:document.createElement("canvas"),this.#t=i?.canvas??(this.#fe==="main"?this.#i:document.createElement("canvas")),this.#Se=e,i||(this.#i.style.cssText="position:absolute;pointer-events:none;visibility:hidden");const s=this.#t.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"});if(!(s instanceof WebGL2RenderingContext))throw new Error("this browser has no WebGL2");this.#s=s,this.#O&&(this.#yi(),this.#n=new te(s)),this.#l=me(s,Oe);const r=this.#l;this.#o=Object.fromEntries(Object.entries(Be).map(([h,o])=>[h,s.getUniformLocation(r,o)])),this.#d=me(s,bt),this.#m=s.getUniformLocation(this.#d,"uField"),this.#C=s.getUniformLocation(this.#d,"uFlip"),this.#Ce=s.getExtension("EXT_disjoint_timer_query_webgl2"),this.#t.addEventListener("webglcontextlost",this.#es),this.#se=i?null:new ResizeObserver(()=>this.#He()),this.#j=i?null:new MutationObserver(()=>{this.#i.ownerDocument!==this.#w&&this.#He()}),this.decodedVideo={push:h=>this.#vs(h),reset:()=>this.#Ni(),finish:()=>{this.#qt=!0,this.#T?.postMessage({type:"pictures",action:"finish"})},onrelease:null},this.#p=i?null:new je(s,e),this.#u=new rt(e,()=>this.#y==="main"?this.#p:null),e.addEventListener("emptied",this.#ji),e.addEventListener("resize",this.#Yi),e.addEventListener("pause",this.#be),e.addEventListener("ended",this.#be),e.addEventListener("seeking",this.#Ji),e.addEventListener("seeked",this.#be),e.addEventListener("ratechange",this.#be),e.addEventListener("waiting",this.#Zi)}get running(){return this.#E?this.#D:this.#D&&(this.#U?.interlaced??!0)}get canvas(){return this.#i}get#yt(){return this.#E?this.#jt:this.#U?.topFieldFirst!==!1}#gi(){return{doubleRate:this.#M,spatialCheck:this.#Q,film:this.#O,debug:this.#oe}}get enabled(){return this.#we}set enabled(e){this.#we=e,this.#Rt(),this.#T?.postMessage({type:"enabled",enabled:e})}set scan(e){if(this.#E)return;const t=this.#U?.interlaced!==e?.interlaced,i=t||this.#U?.topFieldFirst!==e?.topFieldFirst;this.#U=e,!(i&&(!this.#$e()||this.#U!==e))&&(this.#T?.postMessage({type:"scan",scan:e}),i&&(this.#A=0,this.#I(),this.#Y(),t&&(this.#L=0),this.#c=null,this.#ve(!1)),this.#Rt(),i&&((e?.interlaced??!0)&&(this.#k||this.#y==="main")?this.#_e():this.#hi()))}get scan(){return this.#E?this.#xt?.scan??null:this.#U}set videoTimeline(e){this.#Ne=e,this.#T?.postMessage({type:"timeline",videoTimeline:e}),e.length===0&&(this.#U=null),this.#Rt()}get videoTimeline(){return this.#Ne}get container(){return this.#Z??this.#e}get doubleRate(){return this.#M}set doubleRate(e){e!==this.#M&&(this.#M=e,this.#Ge(),!this.#E&&(this.#I(),this.#Fi()))}get spatialCheck(){return this.#Q}set spatialCheck(e){e!==this.#Q&&(this.#Q=e,this.#Ge())}get film(){return this.#O}set film(e){const t=this.#T?this.#Ht:this.#Fe;if(!(e===this.#O&&(e===!1||t===null))){if(this.#T){this.#O=e,this.#Ge(e?"film":void 0);return}if(e){if(!this.#$e())return;try{this.#Ri()}catch(i){this.#O=!0,this.#Ge(),this.#At(`film detector unavailable: ${i instanceof Error?i.message:String(i)}`);return}}if(this.#O=e,this.#Ge(),!e){if(!this.#$e())return;this.#K=!1,this.#$=0,this.#ge=!1,this.#G=S,this.#Y(),this.#n?.destroy(),this.#n=null}this.#Fi()}}get debug(){return this.#oe}set debug(e){e!==this.#oe&&(this.#oe=e,this.#Ge())}get#rs(){return this.#M||this.#O}#Fi(){this.#ee||this.#E||(this.#rs?(this.#X>0&&this.#Ki(),(this.#U?.interlaced??!0)&&(this.#k||this.#y==="main")&&this.#_e()):this.#O||(this.#c=null,this.#ve(!1),this.#ct()))}#Ge(e){this.#T?.postMessage({type:"settings",options:this.#gi(),retryFilm:e})}#yi(){if(this.#s.getExtension("EXT_color_buffer_float")===null)throw new Error("film needs EXT_color_buffer_float")}#Ri(){this.#yi(),this.#n??=new te(this.#s),this.#X>0&&this.#n.resize(this.#X,this.#J)}#Rt(){this.#E||this.#we&&(this.#Ne.length>0||(this.#U?.interlaced??!0))?this.start():this.stop()}#ns(){return this.#k||this.#fe==="main"?!1:this.#y==="starting"||this.#y==="active"?!0:typeof Worker<"u"&&typeof VideoFrame<"u"&&typeof OffscreenCanvas<"u"&&this.#Ot!==null&&"transferControlToOffscreen"in HTMLCanvasElement.prototype?(this.#_i(),!0):this.#fe==="auto"?(this.#wt(),!1):(this.#y="failed",this.#D=!1,!0)}#_i(){this.#le(),this.#T?.terminate(),this.#T=null,this.#Pt(),this.#Ye=!1,this.#ft=!1,this.#Ht=null,this.#Vt=0;let e=this.#i;if(this.#Gt){e=document.createElement("canvas"),e.className=this.#i.className;const r=this.#i.getAttribute("style");r===null?e.removeAttribute("style"):e.setAttribute("style",r),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e}const t=++this.#Xt;this.#y="starting";let i,s;try{s=e.transferControlToOffscreen(),this.#Gt=!0,i=new Worker(this.#Ot,{type:"module"})}catch(r){this.#at(r instanceof Error?r.message:String(r));return}this.#T=i,i.onmessage=r=>{t===this.#Xt&&this.#hs(r.data)},i.onerror=r=>{t===this.#Xt&&(r.preventDefault(),this.#at(r.message||"the deinterlacer worker failed"))},i.postMessage({type:"initialize",canvas:s,options:this.#gi(),scan:this.#U,videoTimeline:this.#Ne,enabled:this.#D,video:this.#ze()},[s]),this.#gt&&i.postMessage({type:"pageVisibility",hidden:!0,video:this.#ze()})}#hs(e){switch(e.type){case"ready":this.#y="active",this.#D&&(this.#lt(),this.#kt());break;case"failed":this.#at(e.message);break;case"consumed":{this.#Ye=!1,this.#ft=!0;const t=this.#Pe;this.#Pe=null,t&&this.#wi(t);break}case"visibility":this.#i.style.visibility=e.visible?"visible":"hidden";break;case"stats":{this.#E&&(this.#Zt=e.stats.missed+e.stats.queueResetted);const t={...e.stats,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0},i=t.filmError??null,s=this.#Vt;if(this.#Ht=i,this.#Vt=e.filmFailure,i!==null&&e.filmFailure!==s){this.dispatchEvent(new CustomEvent("failure",{detail:i}));try{this.#Bt?.(i)}catch{}}this.dispatchEvent(new CustomEvent("stats",{detail:t})),this.#Ut?.(t);break}case"capture":{const t=this.#je.get(e.id);if(this.#je.delete(e.id),!t){e.image?.close();break}e.image?t.resolve(e.image):this.#E?t.reject(new Error("no rendered picture is available")):createImageBitmap(this.#e).then(t.resolve,t.reject);break}case"release":this.#Ft.delete(e.id)&&this.#ue(e.data);break}}#_t(e){if(this.dispatchEvent(new CustomEvent("failure",{detail:e})),!this.#k)try{this.#Bt?.(e)}catch{}}#At(e){this.#Fe!==e&&(this.#Fe=e,this.#K=!1,this.#$=0,this.#ge=!1,this.#G=S,this.#Y(),this.#n?.destroy(),this.#n=null,this.#_t(e))}#$e(){return this.#ee?!1:(this.#T||(this.#Fe=null),!0)}#at(e){if(this.#y==="starting"&&this.#fe==="auto"&&!this.#Ke){this.#wt();return}if(this.#Ai(e),!this.#Ke){this.#Ke=!0,this.#_i();return}console.error(`Deinterlacer Worker stopped: ${e}`),this.#y="failed",this.#T?.terminate(),this.#T=null,this.#le(),this.#Pt(),this.#_t(`deinterlacer worker stopped: ${e}`),this.stop()}#wt(){const e=this.#t;e.className=this.#i.className;const t=this.#i.getAttribute("style");t===null?e.removeAttribute("style"):e.setAttribute("style",t),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e,this.#Gt=!1,this.#T?.terminate(),this.#T=null,this.#y="main",this.#le(),this.#Pt(),this.#D&&(this.#lt(),this.#kt(),(this.#U?.interlaced??!0)&&this.#_e())}#le(){this.#Pe?.frame.close(),this.#Pe=null}#Ai(e){for(const t of this.#je.values())t.reject(new Error(e));this.#je.clear()}start(){if(!(this.#D||this.#ee||this.#ne)&&(this.#re++,this.#D=!0,this.#Qi(),!!this.#$e())){if(this.#Xs(),this.#kt(),this.#ns()){if(this.#E){this.#T?.postMessage({type:"running",running:!0}),this.#_e();return}this.#T?.postMessage({type:"enabled",enabled:!0}),this.#y==="active"&&this.#lt();return}this.#lt(),(this.#E||(this.#U?.interlaced??!0))&&this.#_e()}}stop(){this.#re++,this.#D&&(this.#D=!1,this.#E&&this.#Ni(),this.#u.cancel(),this.#ui(),this.#hi(),this.#A=0,this.#c=null,this.#ve(!1),this.#le(),this.#T?.postMessage(this.#E?{type:"running",running:!1}:{type:"enabled",enabled:!1}))}destroy(){if(!this.#ee){this.#ee=!0,this.#we=!1,this.stop(),this.#T?.postMessage({type:"destroy"}),this.#T?.terminate(),this.#T=null,this.#le(),this.#Pt(),this.#Ai("the deinterlacer was destroyed"),this.#w?.removeEventListener("visibilitychange",this.#li),this.#w=null,this.#j?.disconnect(),this.#t.removeEventListener("webglcontextlost",this.#es),this.#u.destroy(),this.#p?.destroy(),this.#e.removeEventListener("emptied",this.#ji),this.#e.removeEventListener("resize",this.#Yi),this.#e.removeEventListener("pause",this.#be),this.#e.removeEventListener("ended",this.#be),this.#e.removeEventListener("seeking",this.#Ji),this.#e.removeEventListener("seeked",this.#be),this.#e.removeEventListener("ratechange",this.#be),this.#e.removeEventListener("waiting",this.#Zi),this.#Qt!==null&&(this.#e.style.aspectRatio=this.#Qt),this.#xs(),this.#Gs();for(const e of this.#h)this.#s.deleteTexture(e);this.#h=[],this.#ct();for(const e of[...this.#mt,...this.#De.map(({q:t})=>t)])this.#s.deleteQuery(e);this.#mt.length=0,this.#De.length=0,this.#n?.destroy(),this.#n=null,this.#st?.destroy(),this.#st=null,this.#Ue!==null&&(ge(this.#Ue),this.#Ue=null),this.#s.deleteProgram(this.#l),this.#s.deleteProgram(this.#d),this.#s.getExtension("WEBGL_lose_context")?.loseContext()}}capture(){if(this.#y==="active"&&this.#i.style.visibility==="visible"&&this.#T){const s=++this.#is,r=new Promise((h,o)=>{this.#je.set(s,{resolve:h,reject:o})});return this.#T.postMessage({type:"capture",id:s,width:this.#e.videoWidth,height:this.#e.videoHeight}),r}if(!this.#E&&(this.#y==="starting"||this.#y==="failed"))return createImageBitmap(this.#e);const e=this.#c;if((this.#k||this.#E)&&(!this.#D||this.#ne||!e))return Promise.reject(new Error("no rendered picture is available"));if(!this.#D||this.#ne||!e)return createImageBitmap(this.#e);e.kind==="texture"?this.#di(e.texture,e.flip,!1):this.#Ee(e.flush,e.second,null,!1);const t=this.#E?this.#ht:this.#e.videoWidth,i=this.#E?this.#ot:this.#e.videoHeight;return t>0&&i>0&&(t!==this.#t.width||i!==this.#t.height)?createImageBitmap(this.#t,{resizeWidth:t,resizeHeight:i,resizeQuality:"high"}):createImageBitmap(this.#t)}addEventListener(e,t,i){super.addEventListener(e,t,i)}removeEventListener(e,t,i){super.removeEventListener(e,t,i)}#lt(){this.#k||!this.#D||this.#E||this.#u.request(this.#ms)}#ze(){const e=[];for(let t=0;t<this.#e.buffered.length;t++)e.push({start:this.#e.buffered.start(t),end:this.#e.buffered.end(t)});return{currentTime:this.#e.currentTime,playbackRate:this.#e.playbackRate,seeking:this.#e.seeking,paused:this.#e.paused,ended:this.#e.ended,readyState:this.#e.readyState,videoWidth:this.#e.videoWidth,videoHeight:this.#e.videoHeight,buffered:e}}#os(e,t,i){let s;try{s=i?.clone()??new VideoFrame(this.#e,{timestamp:Math.max(0,Math.round(t.mediaTime*1e6))})}catch(h){const o=h instanceof Error?h.message:String(h);this.#fe==="auto"&&!this.#ft&&!this.#Ke?(this.#wt(),this.#Ct(e,t)):this.#at(o);return}const r={id:++this.#ts,frame:s,now:e,metadata:t,video:this.#ze()};if(this.#Ye){this.#Pe?.frame.close(),this.#Pe=r;return}this.#wi(r)}#wi(e){const t=this.#T;if(!t||this.#y!=="active"){e.frame.close();return}this.#Ye=!0;const i={type:"frame",id:e.id,frame:e.frame,metadata:e.metadata,video:e.video};try{t.postMessage(i,[e.frame])}catch(s){this.#Ye=!1,e.frame.close();const r=s instanceof Error?s.message:String(s);this.#fe==="auto"&&!this.#ft&&!this.#Ke?(this.#wt(),this.#Ct(e.now,e.metadata)):this.#at(r)}}#as(e,t,i){this.#Ue==null&&(this.#Ue=xe(this.#s,"20px monospace")),Fe(this.#Ue,e,t,i,this.#X,this.#J,20)}#Nt(e){if(this.#Ce==null||this.#De.length>30)return;const t=this.#mt.pop()??this.#s.createQuery();return this.#s.beginQuery(this.#Ce.TIME_ELAPSED_EXT,t),this.#De.push({q:t,isField:e}),t}#pe(e){this.#Ce!=null&&(e!=null&&this.#s.endQuery(this.#Ce.TIME_ELAPSED_EXT),this.#De=this.#De.filter(({q:t,isField:i})=>{if(this.#s.getQueryParameter(t,this.#s.QUERY_RESULT_AVAILABLE)){const s=this.#s.getQueryParameter(t,this.#s.QUERY_RESULT);return i?(this.#et+=s,this.#ke++):(this.#Ze+=s,this.#Ie++),this.#mt.push(t),!1}return!0}))}#Y(e=!1){this.#G=S,this.#tt=S,this.#Le=0,e||(this.#$t=!1),this.#K=!1,this.#n?.reset(e)}#ls(){const{prev:e,cur:t,next:i}=this.#vi(!1),s=this.#h[e],r=this.#h[t],h=this.#h[i];if(!s||!r||!h)return;const o=this.#yt?0:1;this.#n?.measureComb(s,r,o),this.#n?.detect(r,h,o)}#us(){const{cur:e,next:t}=this.#vi(!1),i=this.#h[e],s=this.#h[t],r=this.#n;if(!i||!s||!r)return!1;const h=this.#yt?0:1;try{r.measureComb(i,s,h,!0)}catch(o){return this.#At(`film detection failed: ${o instanceof Error?o.message:String(o)}`),!1}return!0}#cs(){const e=this.#n?.poll()??null;e!==null&&(this.#tt=e,this.#Le=e.age,this.#$t=e.instant),this.#Le++;const{phase:t,run:i}=this.#tt;t===0||this.#Le>Math.ceil(W*Math.max(1,this.#e.playbackRate))?this.#G=S:this.#G={phase:(t-1+this.#Le)%W+1,run:i}}#fs(e){const t=[],i=this.#n?.metrics??new Float32Array(0);for(let r=0;r<v.phase;r++){const h=i[r*4]??0,o=i[r*4+1]??0,l=i[r*4+2]??0;t.push(`${h.toFixed(3)},${o.toString().padStart(4)},${l.toFixed(3)}`)}const s=this.#vt.map((r,h)=>`${h===0?"-":h}:${r}`).join(" ");return`frame=${e} phase=${this.#G.phase} run=${this.#G.run} known=${this.#tt.phase}/${this.#tt.run} age=${this.#Le} ${this.#K?"film":"video"} period=${this.#L.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#Et}`}#St(e,t){const i=t-performance.timeOrigin;return Number.isFinite(i)&&i!==0?e+i:e}#ds(e,t){const i=e.expectedDisplayTime;if(!Number.isFinite(i)||i<=0||!Number.isFinite(e.timeOrigin))return t;const s=this.#St(i,e.timeOrigin),r=mt*Math.max(this.#v,this.#L);return s<t-r||s>t+r?t:s}#ms=(e,t)=>{if(!this.#D||this.#ne)return;this.#ai();const i=this.#St(e,t.timeOrigin),{frame:s,picture:r,...h}=t;this.#Se=s??this.#e,this.#R=r??null;try{this.#ps(i,h,s)}finally{this.#Se=this.#e,this.#R=null}this.#lt()};#ps(e,t,i){if(this.#y==="active"){this.#os(e,t,i);return}this.#y!=="starting"&&this.#Ct(e,t)}ingestExternalFrame(e,t,i){this.#Se=i;try{this.#Ct(e,t)}finally{this.#Se=this.#e}}#vs(e){try{if(Xe(e),e.timestamp<this.#bt+B)throw new RangeError(`a picture at ${e.timestamp} s came after one at ${this.#bt} s; pictures come in presentation order`);this.#E||this.#gs()}catch(s){throw this.#ue(e.data),s}if(this.#bt=e.timestamp,this.#Jt++,this.#Es(e.displayWidth,e.displayHeight),!this.#D){this.#ue(e.data);return}if(this.#y==="starting"||this.#y==="active"){this.#Ts(e);return}const t=this.#ye;t.push(e),this.#ei(this.#W.at(performance.now()));const i=Math.ceil(Et*Math.max(1,this.#e.playbackRate));for(;t.length>i;){const s=t.pop();this.#Mt(s.timestamp+s.duration)&&this.#F.queueResetted++,this.#ue(s.data)}this.#de=Math.max(this.#de,t.length)}#Es(e,t){if(!(e===this.#ht&&t===this.#ot)){if(this.#ht=e,this.#ot=t,this.#k||this.#ee){this.#He();return}this.#Qt??=this.#e.style.aspectRatio,this.#e.style.aspectRatio=`${e} / ${t}`,this.#bs(),this.#e.dispatchEvent(new Event("resize"))}}#bs(){if(this.#Tt)return;this.#Tt=!0;const e=this.#e;Object.defineProperty(e,"videoWidth",{configurable:!0,get:()=>this.#ht}),Object.defineProperty(e,"videoHeight",{configurable:!0,get:()=>this.#ot}),Object.defineProperty(e,"getVideoPlaybackQuality",{configurable:!0,value:()=>({creationTime:performance.now(),totalVideoFrames:this.#Jt,droppedVideoFrames:this.#F.missed+this.#F.queueResetted+this.#Zt,corruptedVideoFrames:0})})}#xs(){if(!this.#Tt)return;this.#Tt=!1;const e=this.#e;delete e.videoWidth,delete e.videoHeight,delete e.getVideoPlaybackQuality}#Ts(e){const t=++this.#ss;try{this.#T.postMessage({type:"picture",id:t,picture:e},[e.data])}catch(i){throw this.#ue(e.data),i}this.#Ft.set(t,e.data)}#Pt(){const e=[...this.#Ft.values()];this.#Ft.clear();for(const t of e)this.#ue(t)}#gs(){this.#st=new ze(this.#s),this.#E=!0,this.#le(),this.#u.cancel(),this.#ui(),this.#A=0,this.#I(),this.#Y(),this.#c=null,this.#X=0,this.#J=0,this.#W.hold(),this.#Rt(),this.#_e()}#ue(e){const t=this.decodedVideo.onrelease;if(t!==null)try{t(e)}catch(i){queueMicrotask(()=>{throw i})}}#Ni(){if(!this.#E)return;this.#T?.postMessage({type:"pictures",action:"reset"});const e=this.#ye;this.#ye=[],this.#qt=!1,this.#Kt=!1,this.#bt=Number.NEGATIVE_INFINITY,this.#Be=!1,this.#rt=!1,this.#A=0,this.#I(),this.#me=null,this.#Xe=null,this.#Yt=Number.NEGATIVE_INFINITY,this.#nt=1,this.#Y(),this.#$=0,this.#W.hold();for(const t of e)this.#ue(t.data)}#ei(e){const t=this.#ye;for(;t.length>2&&t[2].timestamp<=e;){const i=t.shift();this.#Mi(i.timestamp+i.duration),this.#ue(i.data)}}#Si(e){return!(e<=this.#W.origin+B)}#Mt(e){return this.#gt||!this.#Si(e)?!1:!(this.#W.origin===this.#Ti&&e<=this.#xi+B)}#Pi(e){if(e===this.#gt||(this.#gt=e,this.#T?.postMessage({type:"pageVisibility",hidden:e,video:this.#ze()}),e))return;const t=this.#W.at(performance.now()),i=this.#e.currentTime;this.#xi=Number.isNaN(t)?i:Math.max(t,i),this.#Ti=this.#W.origin}observePageVisibility(e){this.#Pi(e)}#Mi(e){this.#Mt(e)&&this.#F.missed++}#Ci(e){const t=this.#e;this.#W.observe(e,t.currentTime,t.playbackRate,!t.paused&&!t.seeking&&!t.ended)&&(this.#F.resynced++,this.#nt=1)}observeMediaClock(e,t){this.#Ci(this.#St(e,t))}#Fs(){this.#b!==null&&(this.#Ii(),this.#Di());const e=this.#Is(),t=this.#P+this.#v-ue,i=e.setTimeout(()=>{this.#b=null,this.#Di()},Math.max(0,t-performance.now()));this.#b={timers:e,handle:i}}#Di(){performance.now()-this.#x<this.#v-ue||this.#ys()}#Ii(){const e=this.#b;e!==null&&(this.#b=null,e.timers.clearTimeout(e.handle))}#ys(){this.#x=performance.now(),this.#T?.postMessage({type:"clock",video:this.#ze(),at:performance.now(),timeOrigin:performance.timeOrigin})}#Rs(){const e=this.#e;this.#k||this.#Ci(performance.now());const t=this.#W.rate,i=this.#W.at(this.#P+this.#v);if(Number.isNaN(i))return;const s=this.#re;this.#_s(i,t),this.#H(s)&&this.#Ms(i,t,e.paused)}#_s(e,t){const i=this.#re,s=vt*this.#v*Math.max(1,t)/1e3;for(this.#ei(e);;){const o=this.#ye[0];if(o===void 0||o.timestamp>e+s+o.duration||(o.width===this.#X&&o.height===this.#J?this.#Ui():_)<this.#As(o))break;if(this.#ye.shift(),this.#ws(o,e,t),!this.#H(i))return;this.#ei(e)}if(!this.#Be||this.#rt||this.#ye.length>0||this.#Ui()<this.#ki())return;const r=this.#Re[this.#_],h=U*t/1e3;(this.#qt||r.timestamp<=e+h)&&(this.#ti(!0,e,t),this.#rt=!0)}#ki(){return this.#M&&!this.#K?2:1}#As(e){const t=!e.interlaced||!this.#we;return(this.#Be?this.#ki():0)+(t?1:0)}#Li(e){const t=this.#a[e];if(t===void 0)return!1;const i=this.#c;if(i?.kind==="texture"&&i.texture===t.texture||this.#me?.slot===e||this.#Xe?.slot===e)return!1;for(const s of this.#Oe)if(s.slot===e)return!1;return!0}#Ui(){let e=0;for(let t=0;t<this.#a.length;t++)this.#Li(t)&&e++;return e}#Bi(){for(let e=1;e<=_;e++){const t=(this.#f+e)%_;if(this.#Li(t))return t}return null}#ws(e,t,i){const s=this.#Kt?this.#Re[this.#_]:null,r=s===null?0:s.timestamp+s.duration,h=e.width!==this.#X||e.height!==this.#J,o=s===null||h||e.timestamp<r-B||e.timestamp-r>q,l=!o&&e.timestamp-r>B,c=!e.interlaced||!this.#we,a=this.#Be,d=this.#rt;this.#Be=!1,this.#rt=!1,a&&!d&&(o||c)&&!h&&this.#ti(!0,t,i),o?(s!==null&&this.#F.discontinuities++,this.#A=0,this.#Y(),this.#$=0):s!==null&&!c&&s.interlaced&&s.topFieldFirst!==e.topFieldFirst&&this.#Y(!0);const m=performance.now();this.#mi(m),this.#Je=m;const u=this.#re,f=this.#Nt(!1);try{if(h&&(this.#Ei(e.width,e.height),this.#a.length!==_))throw new Error("decoded pictures have no output textures");this.#Ns(e)}catch(p){this.#pe(f),this.#_t(p instanceof Error?p.message:String(p)),this.stop();return}finally{this.#ue(e.data)}if(c)e.interlaced||(this.#$>0&&this.#$--,this.#it=!0),this.#Ss(),this.#A=0;else{if(a&&!o){const p=this.#Re[(this.#_+g-1)%g];this.#jt=p.topFieldFirst,this.#Xi(),this.#H(u)&&this.#Gi(l?1:0,Math.round(p.timestamp*1e3),this.#M),this.#H(u)&&this.#ti(!1,t,i)}else this.#Wt=l;this.#it=!1,this.#Be=!0}if(!this.#H(u)){this.#ee||this.#pe(f);return}this.#pe(f),this.#xe+=performance.now()-m,this.#ae++,this.#pi(m)}#Ns(e){this.#_=(this.#_+1)%g,this.#st.convert(e,this.#h[this.#_]);const t=this.#Re[this.#_];t.timestamp=e.timestamp,t.duration=e.duration,t.interlaced=e.interlaced,t.topFieldFirst=e.topFieldFirst,t.repeatFirstField=e.repeatFirstField,this.#A=Math.min(this.#A+1,g),this.#Kt=!0}#Ss(){const e=this.#Re[this.#_],t=this.#Bi();if(t===null){this.#F.late++;return}this.#f=t,this.#Vi(this.#h[this.#_],!0,this.#a[t].framebuffer),this.#Oe.push({slot:t,time:e.timestamp,picture:e.timestamp,end:e.timestamp+e.duration,start:!0,scan:de(e)})}#ti(e,t,i){const s=this.#Re[e?this.#_:(this.#_+g-1)%g],r=this.#Oe;for(;r.length>0&&r.at(-1).picture===s.timestamp;)r.pop();this.#jt=s.topFieldFirst;const h=e?Number.POSITIVE_INFINITY:this.#Re[this.#_].timestamp,o=de(s),l=s.timestamp+s.duration;let c=!1;if(this.#K&&!e){const a=this.#G.phase;if(a===G){this.#Et++;return}const d=s.timestamp+(fe[a]??0)*s.duration;c=this.#ii(d,d+s.duration*W/ce,h,s.timestamp,l,!0,!1,null,e,o,t,i)!==null}else if(!this.#M)c=this.#ii(s.timestamp,h,h,s.timestamp,l,!0,!1,null,e,o,t,i)!==null;else{const a=s.repeatFirstField?3:2,d=s.duration/a;let m=null;for(let u=0;u<a;u++){const f=s.timestamp+u*d,p=this.#ii(f,u+1<a?f+d:h,h,s.timestamp,l,u===0,u===1,u===2?m:null,e,o,t,i);u===0&&(m=p),p!==null&&(c=!0)}}!c&&h<=t&&this.#Mi(l)}#ii(e,t,i,s,r,h,o,l,c,a,d,m){if(!this.#Ps(e,t,i,d,m))return this.#Mt(t)&&this.#F.late++,null;if(l===null){if(l=this.#Bi(),l===null)return this.#F.late++,null;this.#f=l,this.#Ee(c,o,this.#a[l].framebuffer)}return this.#Oe.push({slot:l,time:e,picture:s,end:Number.isFinite(i)?Math.max(t,i):r,start:h,scan:a}),l}#Ps(e,t,i,s,r){if(r===0)return i>s;const h=2*U*r/1e3;if(t<=s-h)return!1;const o=this.#v*r/1e3;if(t-e+2*h>=o)return!0;const l=Math.max(0,Math.ceil((e-h-s)/o));return s+l*o<t+h}#Ms(e,t,i){const s=this.#Oe;let r=0;for(;r<s.length&&!this.#Si(s[r].end);)r++;r>0&&s.splice(0,r);let h=-1;if(i){for(let l=0;l<s.length&&s[l].picture<=e;l++)s[l].start&&(h=l);if(h<0){const l=this.#me,c=this.#Xe;let a=l!==null&&l.picture<=e?l:null;c!==null&&c.picture<=e&&(a===null||c.picture>a.picture)&&(a=c),a!==null&&a!==this.#xt&&this.#Oi(a);return}this.#nt=1}else{let l=0;for(;l<s.length&&s[l].time<=this.#Yt;)l++;const c=U*t/1e3;let a=0,d=0;for(let u=l;u<s.length;u++){const f=e-s[u].time;if(f>=c)a++;else if(f>=-c)d++;else break}const m=Math.min(Math.max(this.#nt,a),a+d);if(this.#nt=m,m===0){s.splice(0,l);return}h=l+m-1;for(let u=l;u<h;u++)this.#Mt(s[u+1].time)&&this.#F.late++}const o=s[h];s.splice(0,h+1),this.#Oi(o)}#Oi(e){const t=performance.now(),i=this.#Nt(!0);this.#fi(e.slot),this.#pe(i),this.#Me+=performance.now()-t,this.#Te++,this.#xt=e,this.#Yt=e.time,!(e===this.#me||e===this.#Xe)&&(e.start||this.#me?.picture!==e.picture)&&(this.#Xe=this.#me,this.#me=e.start?e:null)}#Ct(e,t){const i=this.#re;if(this.#H(i)&&(this.#Cs(t.mediaTime),!!this.#H(i)&&t.width>0&&t.height>0)){let s=!1;if(!this.#qe&&this.#e.seeking){const f=this.#e.buffered,p=this.#L>=ae?this.#L/1e3:z/1e3;for(let b=0;b<f.length;b++)if(t.mediaTime>=f.start(b)&&t.mediaTime<f.end(b)&&Math.abs(t.mediaTime-this.#e.currentTime)<=p){s=!0;break}}if(s&&(this.#qe=!0),(this.#X===0||this.#J===0)&&this.#Ei(t.width,t.height),!this.#H(i))return;if(this.#U&&!this.#U.interlaced){const f=performance.now();this.#mi(f),this.#Je=f,this.#$>0&&this.#$--,this.#it=!0,this.#Bs(),this.#xe+=performance.now()-f,this.#ae++,this.#Te++,this.#pi(f);return}const r=t.mediaTime-this.#Ve,h=t.mozTiming,o=s||(h?h.discontinuity||r<0||r>q:r<0||r>q);o&&(this.#A=0,this.#L=0,this.#F.discontinuities++,this.#I(),this.#Y(),(s||!this.#it)&&(this.#$=0)),this.#it=!1;const l=this.#Os(t.presentedFrames,o);if(this.#A>0&&t.mediaTime===this.#Ve&&(!h||t.presentedFrames===this.#Lt))return;if(!o){const f=h?.periodMs??0;f>0?this.#$i(f*(this.#e.playbackRate||1)/1e3,1):this.#A>0&&r>0&&this.#$i(r,l+1)}this.#Ve=t.mediaTime,this.#Lt=t.presentedFrames;const c=performance.now();this.#mi(c),this.#Je=c;const a=performance.now(),d=this.#Nt(!1);if(this.#qi(),this.#Xi(),!this.#H(i)){this.#ee||this.#pe(d);return}if(this.#Gi(l,t.presentedFrames,this.#M&&this.#ut()),!this.#H(i)){this.#ee||this.#pe(d);return}const u=this.#ds(t,e)+this.#v;if(this.#K)if(this.#ut()){const f=this.#G.phase;if(f===G)this.#Et++,this.#V++;else{const p=this.#L*W/ce,b=this.#ni(1,e,p),T=fe[f]??0,x=b||this.#ie===null?u+p:u+T*this.#L;this.#Dt("film",!1,this.#si("film",x,p),p)}}else this.#Ee(!1,!1,null);else if(this.#M&&this.#ut()){const f=this.#L/2,b=this.#ni(2,e,f)||this.#ie===null?u+f*2:u,T=this.#si("field",b,f);this.#Dt("field",!1,T,f),this.#Dt("field",!0,T+f,f)}else if(this.#ut()){const f=this.#L,b=this.#ni(1,e,f)||this.#ie===null?u+f:u;this.#Dt("frame",!1,this.#si("frame",b,f),f)||(this.#F.late++,this.#Ee(!1,!1,null))}else this.#F.late+=this.#r.length,this.#I(),this.#Ee(!1,!1,null);this.#de=Math.max(this.#de,this.#r.length),this.#pe(d),this.#xe+=performance.now()-a,this.#ae++,this.#pi(c)}}#Xi(){if(this.#O&&!this.#Fe&&!this.#n)try{this.#Ri()}catch(e){this.#At(`film detector unavailable: ${e instanceof Error?e.message:String(e)}`)}}#Gi(e,t,i){if(this.#pt=!1,this.#ge=!1,this.#zt=!1,this.#O&&!this.#Fe){let s=!1;if(this.#A===g&&e===0)try{this.#cs(),this.#ls(),s=!0}catch(r){this.#At(`film detection failed: ${r instanceof Error?r.message:String(r)}`)}else this.#Y(!0);this.#vt[this.#G.phase]=(this.#vt[this.#G.phase]??0)+1,this.#K=this.#G.phase!==0&&this.#G.run>=H,this.#K?this.#$=pt:this.#$>0&&this.#$--,this.#pt=s&&!this.#Wt,this.#ge=this.#pt&&this.#$>0,this.#zt=this.#ge&&!this.#K&&i&&this.#us(),this.#ge&&!this.#K&&this.#F.matched++,this.#oe&&(this.#bi=this.#fs(t))}this.#Wt=e>0}#H(e){return!this.#ee&&this.#D&&e===this.#re}#Cs(e){const t=this.#re;let i;for(let h=this.#Ne.length-1;h>=0;h--){const o=this.#Ne[h];if(o.start<=e+1e-6){i=o;break}}if(i?.codedSize&&(i.codedSize.width!==this.#X||i.codedSize.height!==this.#J)&&this.#Ei(i.codedSize.width,i.codedSize.height),!this.#H(t))return;const s=i?.scan;if(!s||this.#U?.interlaced===s.interlaced&&this.#U.topFieldFirst===s.topFieldFirst)return;const r=this.#U?.interlaced;this.#U=s,this.#A=0,this.#I(),this.#$e()&&(r!==s.interlaced&&(this.#L=0),s.interlaced&&(this.#k||this.#y==="main")?this.#_e():this.#hi(),this.#Y())}#ut(){return(this.#M||this.#O)&&this.#L>0&&this.#a.length===_}#$i(e,t){const s=e*1e3/(this.#e.playbackRate||1)/t;s<ae||s>z||(this.#L=this.#L>0&&s>this.#L*lt?this.#L+(s-this.#L)*ht:s)}#Dt(e,t,i,s){const r=this.#zi();if(r===null)return!1;const h=this.#a[r];if(!h)return!1;for(this.#f=r;this.#r.length>0&&this.#r[0]?.slot===r;)this.#r.shift(),this.#F.late++;this.#Ee(!1,t,h.framebuffer);const o={slot:r,at:i,duration:s,cadence:e,phase:e==="film"?this.#G.phase:e==="field"?t?2:1:0,droppedBefore:this.#V};return this.#V=0,this.#r.push(o),this.#ie=o,!0}#si(e,t,i){if(!(i>0))return t;const s=this.#ie,r=this.#v;if(s!==null&&s.cadence===e){const h=s.at+s.duration,o=h-t,l=Math.round(o/r),c=l-this.#q,a=o-l*r;if(l>=0&&c<=1){const d=h+Math.max(-le,Math.min(le,-a*ut));if(c===0)return this.#B=0,d;if(this.#B===0||c>0!=this.#z>0?(this.#B=0,this.#z=c):Math.abs(c)<Math.abs(this.#z)&&(this.#z=c),++this.#B<ct)return d;const m=this.#z;return this.#B=0,m<0?(this.#q+=m,d):(this.#F.resynced++,this.#ri(d-m*r))}if(l<0&&this.#q-l<=1)return this.#q-=l,this.#B=0,this.#F.resynced++,this.#ri(t)}return this.#q=0,this.#B=0,s!==null&&this.#F.resynced++,this.#ri(t)}#ri(e){for(let t=this.#r.at(-1);t&&t.at>=e;)this.#r.pop(),this.#F.late++,t=this.#r.at(-1);return e}#ni(e,t,i){const s=this.#r.at(-1),r=(K+1)*Math.max(this.#v,i);if(s&&s.at-t>r)return this.#I(),this.#F.queueResetted++,!0;const h=Math.max(0,this.#r.length+e-K);let o=0,l=0;for(;l<h;){const c=this.#r.shift();if(!c)break;o+=c.duration,l++}for(const c of this.#r)c.at-=o;return this.#F.late+=l,!1}#zi(){const e=this.#c?.kind==="texture"?this.#c.texture:null,t=new Set(this.#r.map(({slot:s})=>s));for(let s=1;s<=_;s++){const r=(this.#f+s)%_,h=this.#a[r];if(h&&h.texture!==e&&!t.has(r))return r}const i=this.#r[0];if(i){const s=this.#a[i.slot];if(s&&s.texture!==e)return i.slot}return null}#_e(){this.#g===null&&(!this.#D||this.#ne||(this.#N=0,this.#g=this.#We(this.#oi)))}#hi(){this.#It(this.#g),this.#g=null,this.#Ii(),this.#I()}#oi=e=>{if(this.#g=null,!this.#D||this.#ne)return;this.#Ds(e);const t=this.#re;if(this.#E)this.#k||this.#y==="main"?this.#Rs():this.#Fs();else{if(this.#u.flush(e),!this.#H(t))return;this.#y==="main"&&this.#Ls(this.#P,e)}this.#H(t)&&(this.#g=this.#We(this.#oi))};#Ds(e){const t=e-this.#N;this.#N=e;const i=Math.max(1,Math.round(t/this.#v)),s=this.#P+i*this.#v,r=e-s;if(this.#P===0||t<=0||t>z||Math.abs(r)>this.#v/4){t>=1&&t<=z&&(this.#v=t),this.#P=e;return}this.#v+=r/i*ft,this.#P=s+r*dt}#Wi(){const e=this.#k;if(e)return{frames:e,origin:performance.timeOrigin};const t=this.#Hi();return t===null?{frames:Tt,origin:performance.timeOrigin}:{frames:t,origin:t.performance.timeOrigin}}#We(e){const{frames:t,origin:i}=this.#Wi(),s=t.requestAnimationFrame(r=>e(this.#St(r,i)));return{frames:t,handle:s}}#Is(){return this.#Hi()??gt}#Hi(){return this.#i.ownerDocument?.defaultView??this.#e.ownerDocument?.defaultView??null}#It(e){e?.frames.cancelAnimationFrame(e.handle)}#ai(){if(this.#k)return;this.#ks(),this.#w&&this.#Pi(this.#w.hidden);const{frames:e}=this.#Wi(),t=this.#g!==null&&this.#g.frames!==e,i=this.#S!==null&&this.#S.frames!==e;!t&&!i||(this.#N=0,t&&(this.#It(this.#g),this.#g=this.#We(this.#oi)),i&&(this.#It(this.#S),this.#S=this.#We(this.#ci)))}#ks(){const e=this.#k?null:this.#i.ownerDocument??null;e!==this.#w&&(this.#w?.removeEventListener("visibilitychange",this.#li),this.#w=e,e?.addEventListener("visibilitychange",this.#li),this.#j?.disconnect(),e&&this.#j?.observe(e,{childList:!0,subtree:!0}))}#li=()=>{this.#ee||this.#ai()};#kt(){this.#k||this.#E||this.#S!==null||!this.#u.captureDriven||!this.#D||this.#ne||(this.#S=this.#We(this.#ci))}#ui(){this.#It(this.#S),this.#S=null}#ci=e=>{if(this.#S=null,!this.#D||this.#ne)return;const t=this.#re;this.#u.flush(e),this.#H(t)&&this.#u.captureDriven&&(this.#S=this.#We(this.#ci))};#Ls(e,t){const i=this.#v/2,s=l=>{const c=l.at-e;return c<=i-U?!0:c>i+U?!1:this.#he>0};for(;this.#r[1]&&s(this.#r[1]);)this.#F.late++,this.#r.shift();const r=this.#r[0];if(!r||!s(r))return;this.#r.shift(),this.#he=r.at-e;const h=performance.now(),o=this.#Nt(!0);this.#fi(r.slot),this.#pe(o),this.#Me+=performance.now()-h,this.#Te++,this.#oe&&this.#Us(r,t),this.#te=t}#Us(e,t){const i=this.#te===0?0:t-this.#te,s=i/this.#v,r=e.cadence==="film"?`phase ${e.phase}`:e.cadence==="field"?`field ${e.phase}`:"frame",h=e.phase===0?"duplicate":`phase ${G}`,o=e.droppedBefore>0?`, ${h} dropped before it`+(e.droppedBefore>1?` (${e.droppedBefore})`:""):"";console.log(`yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at-t).toFixed(2)} ms${o}`)}#fi(e){const t=this.#a[e];t&&this.#di(t.texture)}#Bs(){this.#qi();const e=this.#h[this.#_];e&&this.#di(e,!0),this.#A=0}#ve(e){if(this.#k){this.#k.onVisibility(e);return}this.#i.style.visibility=e?"visible":"hidden"}#di(e,t=!1,i=!0){this.#Vi(e,t,null),this.#c={kind:"texture",texture:e,flip:t},this.#ve(!0),i&&this.#ce++}#Vi(e,t,i){const s=this.#s;s.bindFramebuffer(s.FRAMEBUFFER,i),s.useProgram(this.#d),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this.#m,0),s.uniform1i(this.#C,t?1:0),s.viewport(0,0,this.#X,this.#J),s.drawArrays(s.TRIANGLES,0,3)}#Os(e,t){let i=0;return this.#Qe!==0&&!t&&(i=Math.max(0,e-this.#Qe-1),this.#F.missed+=i),this.#Qe=e,i}#mi(e){e-this.#Je<=oe||(this.#dt=e,this.#ae=0,this.#xe=0,this.#Te=0,this.#Me=0,this.#de=0,this.#ce=0,this.#Ze=0,this.#Ie=0,this.#et=0,this.#ke=0)}#pi(e){const t=e-this.#dt;if(t<oe)return;const i=!this.#E&&this.#ut()&&(this.#M||this.#K)?this.#Te:this.#ae,s=this.#ae?(this.#xe+this.#Me)/this.#ae:0;let r;this.#Ce!=null&&(r=0,this.#Ie!==0&&(r+=this.#Ze/1e6/this.#Ie),this.#ke!==0&&(r+=this.#et/1e6/this.#ke/2));const h={...this.#F,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0,fps:i*1e3/t,frameMs:s,maxQueuedFields:this.#de,outputFps:this.#ce*1e3/t,gpuMs:r,film:this.#K,oneInstant:this.#$t,filmError:this.#Fe};this.dispatchEvent(new CustomEvent("stats",{detail:h})),this.#Ut?.(h),this.#dt=e,this.#ae=0,this.#xe=0,this.#Te=0,this.#Me=0,this.#de=0,this.#ce=0,this.#Ze=0,this.#Ie=0,this.#et=0,this.#ke=0}#qi(){const e=this.#s;this.#_=(this.#_+1)%g;const t=this.#R,i=this.#h[this.#_];t!==null&&this.#p!==null&&i!==void 0?(this.#h[this.#_]=this.#p.adopt(t,i),this.#R=null):(e.bindTexture(e.TEXTURE_2D,i??null),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#Se)),this.#A=Math.min(this.#A+1,g)}#Ee(e,t,i,s=!0){if(this.#A===0||this.#ne)return;s&&(this.#A===g&&!e?this.#F.filtered++:this.#F.degraded++);const r=this.#s,{prev:h,cur:o,next:l}=this.#vi(e);r.bindFramebuffer(r.FRAMEBUFFER,i),r.useProgram(this.#l);for(const[p,b]of[h,o,l].entries())r.activeTexture(r.TEXTURE0+p),r.bindTexture(r.TEXTURE_2D,this.#h[b]??null);r.uniform1i(this.#o.prev,0),r.uniform1i(this.#o.cur,1),r.uniform1i(this.#o.next,2);const c=this.#O?this.#n?.texture??null:null,a=this.#O?this.#n?.combTexture??null:null,d=c!==null&&a!==null;c!==null&&a!==null&&(r.activeTexture(r.TEXTURE0+3),r.bindTexture(r.TEXTURE_2D,c),r.uniform1i(this.#o.fieldMetrics,3),r.activeTexture(r.TEXTURE0+4),r.bindTexture(r.TEXTURE_2D,a),r.uniform1i(this.#o.comb,4));const m=this.#zt?this.#n?.combAheadTexture??null:null,u=d&&!e;r.activeTexture(r.TEXTURE0+5),r.bindTexture(r.TEXTURE_2D,m),r.uniform1i(this.#o.combAhead,5),r.activeTexture(r.TEXTURE0),r.uniform2i(this.#o.size,this.#X,this.#J);const f=this.#yt?0:1;r.uniform1i(this.#o.parity,t?1-f:f),r.uniform1i(this.#o.tff,this.#yt?1:0),r.uniform1i(this.#o.second,t?1:0),r.uniform1i(this.#o.spatialCheck,this.#Q?1:0),r.uniform1i(this.#o.debug,this.#oe?1:0),r.uniform1i(this.#o.film,d?1:0),r.uniform1i(this.#o.match,u&&this.#ge&&(!t||m!==null)?1:0),r.uniform1i(this.#o.instant,u&&this.#pt?1:0),r.uniform1i(this.#o.phase,this.#G.phase),r.viewport(0,0,this.#X,this.#J),r.drawArrays(r.TRIANGLES,0,3),this.#oe&&d&&this.#as(this.#bi,0,90),i===null&&(this.#c={kind:"yadif",flush:e,second:t},this.#ve(!0),s&&this.#ce++)}#vi(e){const t=i=>(this.#_+g-i)%g;return this.#A===1?{prev:this.#_,cur:this.#_,next:this.#_}:e?{prev:t(1),cur:this.#_,next:this.#_}:this.#A===2?{prev:t(1),cur:t(1),next:this.#_}:{prev:t(2),cur:t(1),next:this.#_}}#He(){if(this.#ai(),!this.#Z)return;const e=this.#e,t=this.#E?this.#ht:e.videoWidth,i=this.#E?this.#ot:e.videoHeight;if(t===0||i===0)return;const s=Math.min(e.offsetWidth/t,e.offsetHeight/i),r=t*s,h=i*s;this.#i.style.left=`${e.offsetLeft+(e.offsetWidth-r)/2}px`,this.#i.style.top=`${e.offsetTop+(e.offsetHeight-h)/2}px`,this.#i.style.width=`${r}px`,this.#i.style.height=`${h}px`}#Ei(e,t){const i=this.#s;this.#t.width=e,this.#t.height=t,this.#X=e,this.#J=t,this.#A=0,this.#$=0,this.#c=null,this.#I(),this.#He();for(const s of this.#h)i.deleteTexture(s);this.#h=[];for(let s=0;s<g;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null),this.#h.push(r)}this.#ct(),(this.#M||this.#O||this.#E)&&this.#Ki(),this.#st?.resize(e,t),this.#n?.resize(e,t),this.#$e()}#Ki(){const e=this.#s;if(!(this.#a.length===_||this.#X===0)){this.#ct();for(let t=0;t<_;t++){const i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,this.#X,this.#J,0,e.RGBA,e.UNSIGNED_BYTE,null);const s=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0);const r=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!r){e.deleteFramebuffer(s),e.deleteTexture(i),this.#ct();return}this.#a.push({texture:i,framebuffer:s})}this.#f=_-1}}#ct(){const e=this.#s,t=this.#c?.kind==="texture"?this.#c.texture:null;this.#a.some(i=>i.texture===t)&&(this.#c=null),this.#xt=null,this.#me=null,this.#Xe=null;for(const{texture:i,framebuffer:s}of this.#a)e.deleteFramebuffer(s),e.deleteTexture(i);this.#a=[],this.#I()}#Xs(){if(this.#Z)return;const e=this.#e.parentElement;if(!e)return;const t=document.createElement("div");t.style.cssText="position:relative;display:inline-block;line-height:0;max-width:100%",e.insertBefore(t,this.#e),t.appendChild(this.#e),t.appendChild(this.#i),this.#Z=t,this.#se?.observe(this.#e),this.#He()}#Gs(){if(this.#k)return;const e=this.#Z;this.#Z=null,this.#se?.disconnect(),this.#i.remove(),e?.parentElement&&(e.parentElement.insertBefore(this.#e,e),e.remove())}#Yi=()=>this.#He();#Ae(e){return!this.#T||this.#y==="main"?!1:(this.#T.postMessage({type:"event",name:e,video:this.#ze()}),!0)}#ji=()=>{if(this.#E){this.#W.hold(),this.#Ae("emptied");return}if(this.#Ae("emptied")){this.#le(),this.#ve(!1);return}this.#A=0,this.#Ve=0,this.#Lt=0,this.#I(),this.#Y(),this.#$=0,this.#L=0,this.#Qi(),this.#c=null,this.#ve(!1)};#Qi(){this.#F={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0},this.#Jt=0,this.#Zt=0,this.#vt.fill(0),this.#Et=0,this.#Qe=0,this.#dt=0,this.#Je=0,this.#ae=0,this.#xe=0,this.#Te=0,this.#Me=0,this.#de=0,this.#ce=0,this.#I(),this.#Ze=0,this.#Ie=0,this.#et=0,this.#ke=0}#Ji=()=>{if(this.#E){this.#W.hold(),this.#Ae("seeking");return}if(this.#Ae("seeking")){this.#le();return}this.#qe=!1};#be=e=>{if(this.#E){this.#W.hold(),this.#Ae(e.type);return}if(e.type==="ratechange"&&(this.#u.captureDriven?this.#kt():this.#ui()),(e.type==="pause"||e.type==="ended"||e.type==="seeked"||e.type==="ratechange")&&this.#Ae(e.type)){this.#le();return}if(e.type==="seeked"){const i=this.#qe;if(this.#qe=!1,i)return;this.#A=0,this.#I(),this.#Y(),this.#c=null,this.#ve(!1);return}const t=e.type==="ratechange";if(t&&(this.#L=0,this.#Ve=this.#e.currentTime),this.#I(),this.#D&&this.#A>0){const i=this.#zi(),s=i===null?void 0:this.#a[i];i!==null&&s?(this.#f=i,this.#Ee(!0,!1,s.framebuffer),this.#fi(i)):this.#Ee(!0,!1,null)}t&&(this.#A=0,this.#Qe=0,this.#Y())};#Zi=()=>{this.#E&&(this.#W.hold(),this.#Ae("waiting"))};#es=e=>{if(e.preventDefault(),this.#k){this.#k.onFailure("the deinterlacer WebGL context was lost");return}this.#y!=="active"&&(this.#ne=!0,this.#_t("the deinterlacer WebGL context was lost"),this.stop())}}function yt(n,e,t,i,s,r,h){return new Ft(n,t,{canvas:e,onFailure:i,onVisibility:s,requestAnimationFrame:r,cancelAnimationFrame:h})}function me(n,e){const t=n.createProgram(),i=pe(n,n.VERTEX_SHADER,at),s=pe(n,n.FRAGMENT_SHADER,e);if(n.attachShader(t,i),n.attachShader(t,s),n.linkProgram(t),n.deleteShader(i),n.deleteShader(s),!n.getProgramParameter(t,n.LINK_STATUS)){const r=n.getProgramInfoLog(t);throw n.deleteProgram(t),new Error(`the deinterlacer failed to link: ${r??"no reason given"}`)}return t}function pe(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const I=self;class Rt extends EventTarget{currentTime=0;playbackRate=1;seeking=!1;paused=!0;ended=!1;readyState=0;videoWidth=0;videoHeight=0;parentElement=null;offsetWidth=0;offsetHeight=0;offsetLeft=0;offsetTop=0;#t=[];update(e){this.currentTime=e.currentTime,this.playbackRate=e.playbackRate,this.seeking=e.seeking,this.paused=e.paused,this.ended=e.ended,this.readyState=e.readyState,this.videoWidth=e.videoWidth,this.videoHeight=e.videoHeight,this.#t=e.buffered}get buffered(){return{length:this.#t.length,start:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.start},end:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.end}}}getVideoPlaybackQuality(){return{creationTime:performance.now(),droppedVideoFrames:0,totalVideoFrames:0,corruptedVideoFrames:0}}requestVideoFrameCallback(){return 0}cancelVideoFrameCallback(){}}let y=null,E=null,Y=!1;const j=new Map;function _t(n){return I.requestAnimationFrame(n)}function At(n){I.cancelAnimationFrame(n)}function A(n,e=[]){I.postMessage(n,e)}function wt(n,e,t){n.doubleRate=e.doubleRate,n.spatialCheck=e.spatialCheck,(n.film!==e.film||t==="film")&&(n.film=e.film),n.debug=e.debug}I.onmessage=n=>{const e=n.data;try{if(e.type==="initialize"){if(typeof I.requestAnimationFrame!="function")throw new Error("requestAnimationFrame is unavailable in this Worker");y=new Rt,y.update(e.video),E=yt(y,e.canvas,e.options,s=>{Y||A({type:"failed",message:s})},s=>A({type:"visibility",visible:s}),_t,At);const t=E;t.decodedVideo.onrelease=s=>{const r=j.get(s);j.delete(s),r!==void 0&&!Y&&A({type:"release",id:r,data:s},[s])};let i=0;E.addEventListener("failure",()=>i++),E.addEventListener("stats",s=>{const{dropped:r,...h}=s.detail;A({type:"stats",stats:h,filmFailure:i})}),E.scan=e.scan,E.videoTimeline=e.videoTimeline,E.enabled=e.enabled,A({type:"ready"});return}if(!y||!E)return;switch(e.type){case"frame":y.update(e.video);try{E.ingestExternalFrame(performance.now(),e.metadata,e.frame)}finally{e.frame.close(),A({type:"consumed",id:e.id})}break;case"settings":wt(E,e.options,e.retryFilm);break;case"scan":E.scan=e.scan;break;case"timeline":E.videoTimeline=e.videoTimeline;break;case"enabled":E.enabled=e.enabled;break;case"running":e.running?E.start():E.stop();break;case"picture":j.set(e.picture.data,e.id),E.decodedVideo.push(e.picture);break;case"pictures":e.action==="reset"?E.decodedVideo.reset():E.decodedVideo.finish();break;case"clock":y.update(e.video),E.observeMediaClock(e.at,e.timeOrigin);break;case"pageVisibility":y.update(e.video),E.observePageVisibility(e.hidden);break;case"event":y.update(e.video),y.dispatchEvent(new Event(e.name));break;case"capture":y.videoWidth=e.width,y.videoHeight=e.height,E.capture().then(t=>A({type:"capture",id:e.id,image:t},[t])).catch(()=>A({type:"capture",id:e.id,image:null}));break;case"destroy":Y=!0,E.destroy(),E=null,y=null,I.close();break}}catch(t){const i=t instanceof Error?t.message:String(t);A({type:"failed",message:i})}}})();
//# sourceMappingURL=worker-BGEzTYFM.js.map
