(function(){"use strict";const D=`#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;function w(n,e,t){const i=n.createProgram(),s=W(n,n.VERTEX_SHADER,t),r=W(n,n.FRAGMENT_SHADER,e);if(n.attachShader(i,s),n.attachShader(i,r),n.linkProgram(i),n.deleteShader(s),n.deleteShader(r),!n.getProgramParameter(i,n.LINK_STATUS)){const h=n.getProgramInfoLog(i);throw n.deleteProgram(i),new Error(`the deinterlacer failed to link: ${h??"no reason given"}`)}return i}function W(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const re=`#version 300 es
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
`,ne=`#version 300 es
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
`;function he(n,e){const t=w(n,re,ne),i=n.getAttribLocation(t,"aVertexPosition"),s=n.getAttribLocation(t,"aTextureCoord"),r=n.getUniformLocation(t,"uTexture"),h=n.getUniformLocation(t,"uMatrix"),o=n.getUniformLocation(t,"uUvMatrix"),l=n.getUniformLocation(t,"uTextColor"),f=n.getUniformLocation(t,"uBackColor");if(r==null||h==null||o==null||l==null||f==null)throw new Error("failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER");const a=n.createBuffer(),p=n.createBuffer();return{gl:n,...oe(n,e),program:t,programUniforms:{vertex:i,textureCoord:s,texture:r,matrix:h,uvMatrix:o,textColor:l,backColor:f},positionBuffer:a,textureBuffer:p}}function oe(n,e){const t=new OffscreenCanvas(0,0),i=t.getContext("2d"),s=new Map;let r=0;const h=0;let o=1;i.font=e,i.fillStyle="white";for(let f=32;f<128;f++){const a=String.fromCharCode(f),p=i.measureText(a),v=Math.ceil(p.actualBoundingBoxDescent+p.actualBoundingBoxAscent+1),u=Math.ceil(p.actualBoundingBoxLeft+p.actualBoundingBoxRight+1);s.set(a,{x:r,y:h,width:u,height:v,metrics:p}),o=Math.max(o,v),r+=u}t.width=r,t.height=o,i.font=e,i.fillStyle="white";for(const[f,a]of s)i.fillText(f,Math.floor(a.x+a.metrics.actualBoundingBoxLeft+1),Math.floor(a.metrics.actualBoundingBoxAscent+1));const l=n.createTexture();return n.bindTexture(n.TEXTURE_2D,l),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t),{fontTexture:l,chars:s,textureSize:{width:r,height:o}}}function ae(n){const e=n.gl;e.deleteBuffer(n.positionBuffer),e.deleteBuffer(n.textureBuffer),e.deleteTexture(n.fontTexture),e.deleteProgram(n.program)}function le(n,e,t,i,s,r,h){const o=[],l=[],f=t;for(const v of e){if(v===`
`){t=f,i+=h;continue}const u=n.chars.get(v);if(u==null)continue;if(u.width===1){t+=u.metrics.width;continue}const c=Math.floor(t-u.metrics.actualBoundingBoxLeft),d=Math.floor(i-u.metrics.actualBoundingBoxAscent),b=c+u.width,E=d+u.height;o.push(c,d),l.push(u.x,u.y),o.push(c,E),l.push(u.x,u.y+u.height),o.push(c+u.width,E),l.push(u.x+u.width,u.y+u.height),o.push(b,E),l.push(u.x+u.width,u.y+u.height),o.push(c,d),l.push(u.x,u.y),o.push(b,d),l.push(u.x+u.width,u.y),t+=u.metrics.width}const a=n.gl;a.useProgram(n.program),a.bindBuffer(a.ARRAY_BUFFER,n.positionBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(o),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.vertex,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.vertex),a.bindBuffer(a.ARRAY_BUFFER,n.textureBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(l),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.textureCoord,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.textureCoord),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,n.fontTexture),a.uniform1i(n.programUniforms.texture,0),a.uniform3fv(n.programUniforms.textColor,[1,1,1]),a.uniform3fv(n.programUniforms.backColor,[0,0,0]);function p(v,u,c){const d=[];for(let b=0;b<u;b++)for(let E=0;E<v;E++)d.push(c[E*v+b]);return d}a.uniformMatrix4fv(n.programUniforms.matrix,!1,p(4,4,[1/(s/2),0,0,-1,0,-2/r,0,1,0,0,1,0,0,0,0,1])),a.uniformMatrix3fv(n.programUniforms.uvMatrix,!1,p(3,3,[1/n.textureSize.width,0,0,0,1/n.textureSize.height,0,0,0,1])),a.viewport(0,0,s,r),a.enable(a.BLEND),a.blendFunc(a.SRC_ALPHA,a.ONE_MINUS_SRC_ALPHA),a.drawArrays(a.TRIANGLES,0,o.length/2),a.disable(a.BLEND)}const m={firstRepeatsPrevious:0,secondRepeatsNext:1,secondRepeatsPrevious:2,previousSecondRepeated:3,firstRepeatsNext:4,previousFirstRepeated:5,phase:6,instant:7},S=8,g=16,U=8,ue=15,ce=6,fe=8,de=30,me=.01,pe=.002,H=2,N=1,ve=2,O=10,be={a:"uA",b:"uB",fieldMetrics:"uFieldMetrics",first:"uFirst",size:"uSize"},V=16,q=8,Ee=`#version 300 es

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
  const int BLOCK_W = ${V};
  const int BLOCK_H = ${q};

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

  float run = texelFetch(uFieldMetrics, ivec2(${m.phase}, 0), 0)[1];
  float threshold = run == 0.0 ? 0.025 : (run <= 10.0 ? 0.11 : 0.15);

  vec4 even = measure(diffEven, float(totalEven), threshold);
  vec4 odd = measure(diffOdd, float(totalOdd), threshold);
  outFirst = uFirst == 0 ? even : odd;
  outSecond = uFirst == 0 ? odd : even;
}
`,xe={second:"uSecond",first:"uFirst",size:"uSize"},M=8,ge=`#version 300 es
precision highp float;

uniform sampler2D uSecond;
uniform sampler2D uFirst;

uniform ivec2 uSize;

layout(location = 0) out vec4 outSecond;
layout(location = 1) out vec4 outFirst;

void main()
{
  ivec2 dst = ivec2(gl_FragCoord.xy);
  ivec2 base = dst * ${M};

  vec4 second = vec4(0.0);
  vec4 first = vec4(0.0);

  for (int y = 0; y < ${M}; ++y) {
    for (int x = 0; x < ${M}; ++x) {
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
`,Te={previous:"uPrevious",second:"uSecond",first:"uFirst",comb:"uComb",size:"uSize"},ye=`#version 300 es
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
  return differing <= ${H}.0;
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
  bool believed = run >= ${O}.0;
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
  if (max(dSecondPrevious[2], dFirstPrevious[2]) <= ${pe}) return vec4(score, 0.0, 0.0, last[3]);
  ivec2 blocks = textureSize(uComb, 0);
  float combed = 0.0;
  for (int y = 0; y < blocks.y; ++y) {
    for (int x = 0; x < blocks.x; ++x) {
      if (texelFetch(uComb, ivec2(x, y), 0)[0] > ${U}.0) combed += 1.0;
    }
  }
  bool clean = combed <= ${me} * float(blocks.x * blocks.y);
  score = clean ? min(score + 1.0, ${de}.0) : max(score - ${fe}.0, 0.0);
  bool on = last[3] > 0.5 ? score >= ${ce}.0 : score >= ${ue}.0;
  return vec4(score, clean ? 1.0 : 0.0, combed, on ? 1.0 : 0.0);
}

void main()
{
  int metric = int(gl_FragCoord.x);
  // The comparisons against the next frame become, a frame later, the ones
  // against the previous frame, and those the ones before.
  if (metric == ${m.firstRepeatsPrevious}) {
    outValue = previous(${m.firstRepeatsNext});
  } else if (metric == ${m.secondRepeatsNext}) {
    outValue = fold(uSecond);
  } else if (metric == ${m.secondRepeatsPrevious}) {
    outValue = previous(${m.secondRepeatsNext});
  } else if (metric == ${m.previousSecondRepeated}) {
    outValue = previous(${m.secondRepeatsPrevious});
  } else if (metric == ${m.firstRepeatsNext}) {
    outValue = fold(uFirst);
  } else if (metric == ${m.previousFirstRepeated}) {
    outValue = previous(${m.firstRepeatsPrevious});
  } else if (metric == ${m.instant}) {
    outValue = instant(
      previous(${m.instant}),
      previous(${m.secondRepeatsNext}),
      previous(${m.firstRepeatsNext})
    );
  } else {
    outValue = decide(
      previous(${m.phase}),
      previous(${m.firstRepeatsNext}),
      fold(uSecond),
      previous(${m.secondRepeatsNext}),
      previous(${m.secondRepeatsPrevious}),
      fold(uFirst),
      previous(${m.firstRepeatsPrevious})
    );
  }
}
`,Fe={prev:"uPrev",cur:"uCur",first:"uFirst",size:"uSize"},Re=`#version 300 es
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
`,_e={prev:"uPrev",cur:"uCur",next:"uNext",size:"uSize",parity:"uParity",tff:"uTff",spatialCheck:"uSpatialCheck",debug:"uDebug",film:"uFilm",second:"uSecond",phase:"uPhase",fieldMetrics:"uFieldMetrics",comb:"uComb",combAhead:"uCombAhead",match:"uMatch",instant:"uInstant"},Ae=`#version 300 es
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
  return texelFetch(uFieldMetrics, ivec2(metric, 0), 0)[1] <= ${H}.0;
}

/** The pulldown phase the detection gave this frame, or 0. See film-shader.ts. */
int detectedPhase() {
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${m.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${O}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${N} || phase == ${ve};
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

/** Whether the detection has settled that both fields of a frame are one instant. */
bool oneInstant() {
  return texelFetch(uFieldMetrics, ivec2(${m.instant}, 0), 0)[3] > 0.5;
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
`,R={phase:0,run:0};function I(n,e,t){return Object.fromEntries(Object.entries(t).map(([i,s])=>[i,n.getUniformLocation(e,s)]))}class K{#t;#i;#e;#o;#d;#a;#s;#h;#m;#r=null;#y=null;#b=null;#E=null;#c=null;#f=0;#l=null;#n=null;#u=0;#x=0;metrics=new Float32Array(S*4);#A=0;#v=0;constructor(e){this.#t=e,this.#i=w(e,Ee,D),this.#e=I(e,this.#i,be),this.#o=w(e,ge,D),this.#d=I(e,this.#o,xe),this.#a=w(e,ye,D),this.#s=I(e,this.#a,Te),this.#h=w(e,Re,D),this.#m=I(e,this.#h,Fe)}get texture(){return this.#c?.[this.#f]?.textures[0]??null}get combTexture(){return this.#b?.textures[0]??null}get combAheadTexture(){return this.#E?.textures[0]??null}resize(e,t){e===this.#A&&t===this.#v||(this.#A=e,this.#v=t,this.#z())}reset(e=!1){const t=this.#t;t.deleteSync(this.#n),this.#n=null,this.#u=0;const i=this.#c?.[this.#f];if(!i)return;const s=e?m.instant:S,r=new Float32Array(s*4);for(let h=0;h<m.phase;h++)r[h*4+1]=1;t.bindTexture(t.TEXTURE_2D,i.textures[0]??null),t.texSubImage2D(t.TEXTURE_2D,0,0,0,s,1,t.RGBA,t.FLOAT,r)}detect(e,t,i){const s=this.#t;if(this.#A===0||this.#v===0)return;this.#F();const r=this.#r,h=this.#y,o=this.#c;if(r===null||h===null||o===null)return;const l=o[this.#f],f=o[1-this.#f];if(s.bindFramebuffer(s.FRAMEBUFFER,r.framebuffer),s.useProgram(this.#i),this.#p(0,e,this.#e.a),this.#p(1,t,this.#e.b),this.#p(2,l.textures[0],this.#e.fieldMetrics),s.uniform1i(this.#e.first,i),s.uniform2i(this.#e.size,this.#A,this.#v),s.viewport(0,0,r.width,r.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,h.framebuffer),s.useProgram(this.#o),this.#p(0,r.textures[0],this.#d.second),this.#p(1,r.textures[1],this.#d.first),s.uniform2i(this.#d.size,r.width,r.height),s.viewport(0,0,h.width,h.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,f.framebuffer),s.useProgram(this.#a),this.#p(0,l.textures[0],this.#s.previous),this.#p(1,h.textures[0],this.#s.second),this.#p(2,h.textures[1],this.#s.first),this.#p(3,this.#b?.textures[0],this.#s.comb),s.uniform2i(this.#s.size,h.width,h.height),s.viewport(0,0,S,1),s.drawArrays(s.TRIANGLES,0,3),this.#f=1-this.#f,this.#u++,this.#n!==null){s.bindFramebuffer(s.FRAMEBUFFER,null);return}this.#x=this.#u,s.bindBuffer(s.PIXEL_PACK_BUFFER,this.#l),s.readPixels(0,0,S,1,s.RGBA,s.FLOAT,0),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.FRAMEBUFFER,null),this.#n=s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE,0),s.flush()}measureComb(e,t,i,s=!1){const r=this.#t;if(this.#A===0||this.#v===0)return;this.#F();const h=s?this.#E:this.#b;h!==null&&(r.bindFramebuffer(r.FRAMEBUFFER,h.framebuffer),r.useProgram(this.#h),this.#p(0,e,this.#m.prev),this.#p(1,t,this.#m.cur),r.uniform1i(this.#m.first,i),r.uniform2i(this.#m.size,this.#A,this.#v),r.viewport(0,0,h.width,h.height),r.drawArrays(r.TRIANGLES,0,3),r.bindFramebuffer(r.FRAMEBUFFER,null))}poll(){const e=this.#t,t=this.#n;if(t===null||this.#l===null)return null;switch(e.clientWaitSync(t,0,0)){case e.ALREADY_SIGNALED:case e.CONDITION_SATISFIED:return e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#l),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,this.metrics),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),e.deleteSync(t),this.#n=null,{phase:this.metrics[m.phase*4]??0,run:this.metrics[m.phase*4+1]??0,instant:(this.metrics[m.instant*4+3]??0)>.5,age:this.#u-this.#x};default:return null}}destroy(){const e=this.#t;if(this.#z(),this.#c!==null){for(const t of this.#c)k(e,t);this.#c=null}e.deleteSync(this.#n),this.#n=null,e.deleteBuffer(this.#l),this.#l=null,e.deleteProgram(this.#i),e.deleteProgram(this.#o),e.deleteProgram(this.#a),e.deleteProgram(this.#h)}#p(e,t,i){const s=this.#t;s.activeTexture(s.TEXTURE0+e),s.bindTexture(s.TEXTURE_2D,t??null),s.uniform1i(i,e)}#z(){const e=this.#t;this.#r!==null&&k(e,this.#r),this.#y!==null&&k(e,this.#y),this.#b!==null&&k(e,this.#b),this.#E!==null&&k(e,this.#E),this.#r=null,this.#y=null,this.#b=null,this.#E=null}#F(){const e=this.#t;if(this.#r===null||this.#y===null||this.#b===null||this.#E===null){this.#z();const t=Math.ceil(this.#A/V),i=Math.ceil(this.#v/(q*2));this.#r=P(e,t,i,2),this.#y=P(e,Math.ceil(t/M),Math.ceil(i/M),2),this.#b=P(e,Math.ceil(this.#A/g),Math.ceil(this.#v/g),1),this.#E=P(e,Math.ceil(this.#A/g),Math.ceil(this.#v/g),1)}this.#c===null&&(this.#c=[P(e,S,1,1),P(e,S,1,1)],this.#f=0,this.reset()),this.#l===null&&(this.#l=e.createBuffer(),e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#l),e.bufferData(e.PIXEL_PACK_BUFFER,this.metrics.byteLength,e.STREAM_COPY),e.bindBuffer(e.PIXEL_PACK_BUFFER,null))}}function P(n,e,t,i){const s=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,s);const r=[];for(let l=0;l<i;l++){const f=n.createTexture();n.bindTexture(n.TEXTURE_2D,f),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,e,t,0,n.RGBA,n.FLOAT,null),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+l,n.TEXTURE_2D,f,0),r.push(f)}n.drawBuffers(r.map((l,f)=>n.COLOR_ATTACHMENT0+f));const h=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE;n.bindFramebuffer(n.FRAMEBUFFER,null);const o={framebuffer:s,textures:r,width:e,height:t};if(!h)throw k(n,o),new Error("failed to allocate framebuffer");return o}function k(n,{framebuffer:e,textures:t}){n.deleteFramebuffer(e);for(const i of t)n.deleteTexture(i)}function _(n,e=0,t=n.length){const i=new DataView(n.buffer,n.byteOffset,n.byteLength),s=[];for(let r=e;r<t;){if(r+8>t)throw new Error("Incomplete MP4 box");const h=i.getUint32(r);if(h<8||r+h>t)throw new Error("Invalid MP4 box size");s.push({type:String.fromCharCode(...n.subarray(r+4,r+8)),start:r,body:r+8,end:r+h}),r+=h}return s}function we(n,e){for(const t of _(n,e.body,e.end).filter(i=>i.type==="trak")){let i=t;for(const s of["mdia","minf","stbl","stsd"]){const r=_(n,i.body,i.end).find(h=>h.type===s);if(!r)break;i=r}if(i.type==="stsd")for(const s of _(n,i.body+8,i.end)){if(s.type!=="avc1")continue;const r=_(n,s.body+78,s.end).find(l=>l.type==="avcC");if(!r)throw new Error("AVC sample entry has no avcC");const h=n.slice(r.body,r.end);return{codec:"avc1."+Array.from(h.subarray(1,4)).map(l=>l.toString(16).padStart(2,"0")).join(""),description:h}}}return null}class Se{#t;#i=null;#e=null;#o=[];#d=0;#a=null;#s=[];#h=new Set;#m=!1;#r=!1;#y=!1;#b=!1;#E=!1;#c=new WeakMap;constructor(e){this.#t=e,e.addEventListener("seeking",this.#l),e.addEventListener("ratechange",this.#l)}get active(){return this.#b}append(e){if(this.#y)return;const t=new Uint8Array(e),i=new DataView(e);try{for(const r of _(t)){if(r.type==="moov"){this.#i=we(t,r);const h=this.#i;h&&VideoDecoder.isConfigSupported(h).then(o=>{this.#c.set(h,o.supported===!0)}).catch(o=>this.#n(o))}if(!(r.type!=="moof"||this.#i===null))for(const h of _(t,r.body,r.end).filter(o=>o.type==="traf")){const o=_(t,h.body,h.end),l=o.find(c=>c.type==="tfhd");if(!l||i.getUint32(l.body+4)!==1)continue;const f=o.find(c=>c.type==="tfdt"),a=o.find(c=>c.type==="trun");if(!f||!a||i.getUint32(f.body)!==16777216||i.getUint32(a.body)!==16781057)throw new Error("Unexpected mpeg2toh264 video fragment layout");let p=Number(i.getBigUint64(f.body+4)),v=r.start+i.getInt32(a.body+8);const u=i.getUint32(a.body+4);if(a.body+12+u*16>a.end)throw new Error("Incomplete video samples");for(let c=0;c<u;c++){const d=a.body+12+c*16,b=i.getUint32(d),E=i.getUint32(d+4),$=i.getUint32(d+8),ot=i.getInt32(d+12);if(v<0||v+E>t.length)throw new Error("Video sample outside fragment");this.#o.push({config:this.#i,decodeTime:p/9e4,timestamp:Math.round((p+ot)*1e6/9e4),duration:Math.round(b*1e6/9e4),type:$&65536?"delta":"key",data:t.subarray(v,v+E)}),p+=b,v+=E}}}const s=this.#t.buffered;if(s.length>0){let r=0;for(let h=0;h<(this.#b?this.#d:this.#o.length);h++){const o=this.#o[h];o.type==="key"&&o.timestamp/1e6<=s.start(0)&&(r=h)}r>0&&(this.#o.splice(0,r),this.#d=Math.max(0,this.#d-r))}}catch(s){this.#n(s)}}take(){if(this.#y||this.#t.playbackRate<=1.25||this.#i===null||this.#c.get(this.#i)!==!0){this.#b&&this.#l();return}this.#b||(this.#l(),this.#b=!0);const e=this.#t.currentTime;try{for(;this.#d<this.#o.length&&(this.#a?.decodeQueueSize??0)<6&&this.#s.length<12;){const i=this.#o[this.#d];if(i.decodeTime>e+.25)break;if(this.#e!==i.config){if(this.#a){if(!this.#r){this.#r=!0;const r=this.#a;r.flush().then(()=>{this.#a===r&&(r.close(),this.#a=null,this.#e=null,this.#r=!1)}).catch(h=>{this.#a===r&&this.#n(h)})}break}const s=new VideoDecoder({output:r=>{this.#a!==s?r.close():this.#f(r)},error:r=>{this.#a===s&&this.#n(r)}});this.#a=s,this.#a.configure(i.config),this.#e=i.config}(i.duration??0)<1e3&&this.#h.add(i.timestamp),this.#a.decode(new EncodedVideoChunk(i)),this.#d++}if(this.#m&&this.#d===this.#o.length&&this.#a&&!this.#r){this.#r=!0;const i=this.#a;i.flush().catch(s=>{this.#a===i&&this.#n(s)})}}catch(i){this.#n(i);return}const t=this.#s[0];return!t||t.timestamp/1e6>e+.003*this.#t.playbackRate?this.#E?null:void 0:(this.#E=!0,this.#s.shift())}#f=e=>{this.#h.delete(e.timestamp)||e.timestamp/1e6<this.#t.currentTime-(this.#E?.1:.04)?e.close():this.#s.push(e)};#l=()=>{this.#a&&this.#a.state!=="closed"&&this.#a.close(),this.#a=null,this.#e=null;for(const e of this.#s)e.close();this.#s=[],this.#h.clear(),this.#r=!1,this.#b=!1,this.#E=!1,this.#d=0;for(let e=0;e<this.#o.length;e++){const t=this.#o[e];t.type==="key"&&t.timestamp/1e6<=this.#t.currentTime&&(this.#d=e)}};finish(){this.#m=!0}suspend(){this.#l()}reset(){this.#l(),this.#o=[],this.#d=0,this.#i=null,this.#m=!1,this.#y=!1}destroy(){this.reset(),this.#t.removeEventListener("seeking",this.#l),this.#t.removeEventListener("ratechange",this.#l)}#n(e){this.#l(),this.#y=!0,console.warn("mpeg2toh264: decoded video input unavailable",e)}}const L=16,Pe=6,ke=`#version 300 es
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
`;class Ce{#t;#i;#e=null;#o=null;#d=[];#a=0;#s=[];#h=new Uint8Array(0);#m=[];#r=null;#y=0;constructor(e,t){this.#t=e,this.#i=t}take(){const e=this.#t,t=this.#d.pop()??this.#f();if(t===null)return null;const i=this.#i.videoWidth,s=this.#i.videoHeight;e.bindTexture(e.TEXTURE_2D,t);try{e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#i)}catch(o){throw this.#d.push(t),o}const r={id:++this.#y,texture:t,width:i,height:s,changed:null,fence:null,buffer:null,reported:!1},h=this.#r;return h===null||h.width!==i||h.height!==s?r.changed=!0:this.#b(r,h),this.#r=r,this.#m.push(r),r.id}settle(){const e=this.#t,t=this.#m.find(i=>!i.reported);if(t===void 0||t===this.#r)return null;if(t.changed===null){const{fence:i,buffer:s}=t;if(i===null||s===null)return null;const r=e.clientWaitSync(i,0,0);if(r!==e.ALREADY_SIGNALED&&r!==e.CONDITION_SATISFIED)return null;this.#h.byteLength<s.bytes&&(this.#h=new Uint8Array(s.bytes));const h=this.#h.subarray(0,s.bytes);e.bindBuffer(e.PIXEL_PACK_BUFFER,s.buffer),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,h),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),t.changed=De(h),this.#E(t)}return t.reported=!0,{id:t.id,changed:t.changed}}adopt(e,t){const i=this.#m.findIndex(r=>r.id===e),s=this.#m[i];if(s===void 0||!s.reported)throw new Error(`picture ${e} is not available to adopt`);return this.#m.splice(i,1),this.#d.push(t),s.texture}release(e){const t=this.#m.findIndex(s=>s.id===e),i=this.#m[t];i!==void 0&&(this.#m.splice(t,1),this.#c(i))}reset(){const e=this.#m;this.#m=[],this.#r=null;for(const t of e)this.#E(t),this.#c(t)}destroy(){const e=this.#t;this.reset();for(const t of this.#d)e.deleteTexture(t);this.#d=[],this.#a=0;for(const{buffer:t}of this.#s)e.deleteBuffer(t);this.#s=[],this.#u(),this.#e!==null&&e.deleteProgram(this.#e),this.#e=null}#b(e,t){const i=this.#t,s=Math.ceil(e.width/L),r=Math.ceil(e.height/L),h=this.#n(s,r),o=this.#x(s*r*4);this.#e??=this.#l(),i.bindFramebuffer(i.FRAMEBUFFER,h.framebuffer),i.useProgram(this.#e),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,t.texture),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e.texture),i.viewport(0,0,s,r),i.drawArrays(i.TRIANGLES,0,3),i.bindBuffer(i.PIXEL_PACK_BUFFER,o.buffer),i.readPixels(0,0,s,r,i.RGBA,i.UNSIGNED_BYTE,0),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),i.bindFramebuffer(i.FRAMEBUFFER,null),e.fence=i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE,0),e.buffer=o,i.flush()}#E(e){const t=this.#t;e.fence!==null&&t.deleteSync(e.fence),e.fence=null;const i=e.buffer;if(e.buffer=null,i===null)return;const s=this.#o;s!==null&&i.bytes===s.width*s.height*4?this.#s.push(i):t.deleteBuffer(i.buffer)}#c(e){this.#d.push(e.texture)}#f(){if(this.#a===Pe)return null;const e=this.#t,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.#a++,t}#l(){const e=this.#t,t=w(e,ke,D);return e.useProgram(t),e.uniform1i(e.getUniformLocation(t,"uTake"),0),e.uniform1i(e.getUniformLocation(t,"uReference"),1),t}#n(e,t){const i=this.#t,s=this.#o;if(s?.width===e&&s.height===t)return s;this.#u();for(const{buffer:l}of this.#s)i.deleteBuffer(l);this.#s=[];const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null);const h=i.createFramebuffer();i.bindFramebuffer(i.FRAMEBUFFER,h),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,r,0),i.bindFramebuffer(i.FRAMEBUFFER,null);const o={framebuffer:h,texture:r,width:e,height:t};return this.#o=o,o}#u(){const e=this.#t;this.#o!==null&&(e.deleteFramebuffer(this.#o.framebuffer),e.deleteTexture(this.#o.texture),this.#o=null)}#x(e){const t=this.#s.pop();if(t!==void 0)return t;const i=this.#t,s=i.createBuffer();return i.bindBuffer(i.PIXEL_PACK_BUFFER,s),i.bufferData(i.PIXEL_PACK_BUFFER,e,i.STREAM_COPY),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),{buffer:s,bytes:e}}}function De(n){for(let e=0;e<n.length;e+=4)if(n[e]!==0||n[e+1]!==0||n[e+2]!==0)return!0;return!1}const Y=["mozParsedFrames","mozDecodedFrames","mozPresentedFrames","mozPaintedFrames"];function Me(n){return Y.every(e=>e in n)}function Le(n){return n.ownerDocument?.defaultView?.performance.timeOrigin??performance.timeOrigin}const Ue=250,X=500,Ie=1.75,Be=3,Ne=200;class Oe{#t;#i;#e;#o;#d=null;#a=[];#s=0;#h=null;#m=0;#r=null;#y=null;#b=null;#E=null;#c=null;#f=null;#l=!0;#n=null;#u=null;#x=0;#A;#v;#p=null;#z=null;#F=null;#I=null;#we=0;#$=[];#X=[];constructor(e,t,i){if(this.#t=e,this.#i=t,this.#o=i,this.#e=Me(e)?e:null,this.#A=this.#e===null&&typeof VideoFrame<"u",this.#v=this.#A&&e.playbackRate>1,this.#e){for(const s of["emptied","seeking","seeked"])e.addEventListener(s,this.#j);for(const s of["pause","playing","waiting","ratechange"])e.addEventListener(s,this.#B)}if(this.#A)for(const s of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])e.addEventListener(s,this.#Y)}get captureDriven(){return this.#v}request(e){if(this.#E===null){if(this.#E=e,this.#v){this.#M();return}this.#b=this.#e?requestAnimationFrame(this.#N):this.#t.requestVideoFrameCallback(this.#ee)}}cancel(){this.#b!==null&&(this.#e?cancelAnimationFrame(this.#b):this.#t.cancelVideoFrameCallback(this.#b)),this.#b=null,this.#E=null,this.#p?.(),this.#p=null,this.#F!==null&&this.#t.cancelVideoFrameCallback(this.#F),this.#F=null,this.#K(),this.#I=null,this.#$=[],this.#v=this.#A&&this.#t.playbackRate>1,this.#j()}destroy(){this.cancel();for(const e of["emptied","seeking","seeked"])this.#t.removeEventListener(e,this.#j);for(const e of["pause","playing","waiting","ratechange"])this.#t.removeEventListener(e,this.#B);for(const e of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])this.#t.removeEventListener(e,this.#Y)}flush(e){if(this.#v)for(this.#t.ownerDocument!==this.#z&&(this.#p?.(),this.#p=null,this.#M());this.#X.length>0&&this.#E!==null;){const t=this.#X.shift(),i=t.frame;try{this.#W(e,{width:i.visibleRect?.width??i.codedWidth,height:i.visibleRect?.height??i.codedHeight,mediaTime:i.timestamp/1e6,presentedFrames:t.count,expectedDisplayTime:Math.max(t.at,e),timeOrigin:performance.timeOrigin,frame:i})}finally{i.close()}}}#K(){for(const e of this.#X)e.frame.close();this.#X=[]}#Y=e=>{const t=this.#A&&this.#t.playbackRate>1;if(t!==this.#v){const i=this.#E;this.cancel(),this.#v=t,i!==null&&this.request(i);return}["seeking","seeked","emptied","ratechange"].includes(e.type)&&(this.#I=null,this.#$=[]),this.#v&&((e.type==="pause"||e.type==="ended")&&this.flush(performance.now()),this.#K(),this.#p?.(),this.#p=null,this.#E!==null&&this.#M())};#M(){if(!this.#v||this.#p!==null||this.#E===null||(this.#t.paused||this.#t.ended)&&this.#I!==null)return;this.#F===null&&typeof this.#t.requestVideoFrameCallback=="function"&&(this.#F=this.#t.requestVideoFrameCallback(this.#oe));const e=Math.max(4,8/Math.max(1,this.#t.playbackRate)),t=this.#t.ownerDocument?.defaultView;if(this.#z=this.#t.ownerDocument,t){const i=t.setTimeout(this.#k,e);this.#p=()=>t.clearTimeout(i)}else{const i=setTimeout(this.#k,e);this.#p=()=>clearTimeout(i)}}#oe=()=>{this.#F=null,this.#p?.(),this.#p=null,this.#k()};#k=()=>{this.#p=null;const e=this.#t;if(this.#E===null)return;if(e.readyState<2||e.seeking){this.#M();return}let t,i=!1;try{const s=this.#i?.();if(s===null){this.#M();return}i=s!==void 0,t=s??new VideoFrame(e)}catch(s){if(!(s instanceof DOMException)||s.name!=="InvalidStateError")throw s;this.#M();return}if(t.timestamp===this.#I)t.close();else{let s=1;if(this.#I!==null){const h=t.timestamp-this.#I;if(h>1e3&&h<25e4&&(this.#$.push(h),this.#$.length>7&&this.#$.shift()),h>0&&this.#$.length>0){const o=[...this.#$].sort((f,a)=>f-a),l=o[Math.floor(o.length/2)];s=Math.max(1,Math.round(h/l))}}this.#I=t.timestamp,this.#we+=s;const r=performance.now()+(i?(t.timestamp/1e6-e.currentTime)*1e3/e.playbackRate:0);for(this.#X.push({frame:t,at:r,count:this.#we});this.#X.length>4;)this.#X.shift().frame.close()}this.#M()};#B=()=>{this.#n=null,this.#u=null,this.#x=0};#j=()=>{this.#c=null,this.#f=null,this.#l=!0,this.#L(),this.#B()};#L(){this.#d?.reset(),this.#a=[],this.#m=0}#ee=(e,t)=>{this.#W(e,{width:t.width,height:t.height,mediaTime:t.mediaTime,presentedFrames:t.presentedFrames,expectedDisplayTime:t.expectedDisplayTime,timeOrigin:Le(this.#t)})};#W=(e,t)=>{const i=this.#E;this.#b=null,this.#E=null,i?.(e,t)};#N=e=>{const t=this.#e,i=Y.map(l=>t[l]);this.#c?.some((l,f)=>i[f]<l)&&this.#j(),this.#c=i;const s=this.#o?.()??null;s!==this.#d&&(this.#j(),this.#d=s);const r=t.mozPaintedFrames,h=!t.seeking&&t.readyState>=2&&t.videoWidth>0&&t.videoHeight>0,o=this.#f===null&&(r>0||t.paused&&(t.mozPresentedFrames>0||t.mozDecodedFrames>0));if(s!==null){this.#R(e,t,s,h,o);return}if(h&&(o||this.#f!==null&&r!==this.#f)){this.#n!==null&&e-this.#n>X&&(this.#B(),this.#l=!0),this.#w(e,t),this.#n=e,this.#f=r;const l=this.#l;this.#l=!1,this.#W(e,{width:t.videoWidth,height:t.videoHeight,mediaTime:t.currentTime,presentedFrames:r,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#x,discontinuity:l}})}else this.#b=requestAnimationFrame(this.#N)};#w(e,t){if(t.paused||t.ended)return;const i=t.mozPaintedFrames,s=this.#u;if(s&&e-s.at>=Ue){const r=i-s.frames;if(r>0){const h=(e-s.at)/r;h>=4&&h<=200&&(this.#x=this.#x?this.#x+(h-this.#x)*.25:h)}this.#u=null}this.#u??={at:e,frames:i}}#R(e,t,i,s,r){const h=t.mozPaintedFrames,o=this.#f!==null&&h!==this.#f;this.#h!==null&&e-this.#h>X&&(this.#L(),this.#B(),this.#l=!0),this.#h=e,o&&this.#w(e,t);const l=t.paused||t.ended;(!l||o)&&(this.#m=0),l&&this.#r!==null&&(this.#r=e);const f=l&&this.#m>=Be;if(s&&(r||this.#f!==null)){this.#f=h;const u=f?null:i.take();u!==null&&this.#a.push({id:u,at:e,mediaTime:t.currentTime,width:t.videoWidth,height:t.videoHeight,resting:l})}let a=null;for(let u=i.settle();u!==null;u=i.settle()){const c=this.#a.shift();if(c?.id!==u.id)throw new Error("picture verdicts arrived out of order");let d=u.changed;if(d?this.#m=0:(this.#m=c.resting?this.#m+1:0,d=a===null&&!c.resting&&this.#r!==null&&(c.at-this.#r)*(t.playbackRate||1)>=Ne&&h!==this.#y),!d){i.release(c.id);continue}a!==null&&i.release(a.id),a=c}if(a===null){this.#b=requestAnimationFrame(this.#N);return}let p=1;if(this.#n!==null){const u=a.at-this.#n;u>X?(this.#B(),this.#l=!0):this.#x>0&&u>this.#x*Ie&&(p=Math.round(u/this.#x))}this.#s+=p,this.#n=a.at,this.#r=a.at,this.#y=h;const v=this.#l;this.#l=!1;try{this.#W(e,{width:a.width,height:a.height,mediaTime:a.mediaTime,presentedFrames:this.#s,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#x,discontinuity:v},picture:a.id})}finally{i.release(a.id)}}}let Xe=null;const j=.5,y=4,G=5,A=G+1,Q=1e3,J=4,B=200,Ge=.25,ze=1e3/60,$e=`#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`,We=.75,He=.1,Z=1,Ve=60,qe=.02,Ke=.1,ee=1,Ye=4,je=90,z=5,Qe=4,Je={2:0,3:.25,4:.5,5:.75},Ze=`#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`,et={requestAnimationFrame:n=>requestAnimationFrame(n),cancelAnimationFrame:n=>cancelAnimationFrame(n)};class tt extends EventTarget{encodedVideo;#t;#i;#e;#o;#d;#a=null;#s;#h=null;#m;#r;#y;#b;#E;#c=[];#f=[];#l=A-1;#n=null;#u=[];#x=null;#A=0;#v=null;#p=null;#z;#F=ze;#I=0;#we=0;#$=0;#X=0;#K=null;#Y=0;#M=0;#oe=0;#k(){this.#u.length=0,this.#K=null,this.#Y=0,this.#M=0,this.#X=0}#B=null;#j;#L;#ee;#W=0;#N;#w;#R=0;#G=0;#Q=0;#O=y-1;#S=0;#Se=0;#rt=0;#Pe=!1;#P=!1;#ae=0;#We=!1;#J=!1;#_=null;#fe=[];#q=!1;#nt;#ht;#C;#de;#te;#ot;#g=null;#T;#ke=!1;#at=0;#lt=!1;#si=0;#Ce=!1;#He=!1;#me=null;#ri=0;#De=new Map;#D={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0};#Me=0;#Ve=0;#qe=0;#ie=0;#pe=0;#ve=0;#Le=0;#be=0;#Ee;#Ke=[];#xe=[];#Ue=0;#ge=0;#Ie=0;#Te=0;#Be=R;#ye=0;#U=R;#H=!1;#V=0;#Ye=!1;#le=!1;#ut=!1;#ct=!1;#Ct=!1;#ft=!1;#Fe=null;#Dt="";#je=[0,0,0,0,0,0];#dt=0;#ue=null;#mt=null;#pt=0;constructor(e,t={},i=null){super(),this.#e=e,this.#L=t.doubleRate??!1,this.#ee=t.spatialCheck??!0,this.#N=t.debug??!1,this.#w=t.film??!1,this.#nt=t.onStats,this.#ht=t.onFailure,this.#C=i,this.#te=i?"main":t.rendering??"main",this.#ot=t.workerUrl??Xe,this.#T=this.#te==="main"?"main":"idle",this.#i=i?i.canvas:document.createElement("canvas"),this.#t=i?.canvas??(this.#te==="main"?this.#i:document.createElement("canvas")),this.#de=e,i||(this.#i.style.cssText="position:absolute;pointer-events:none;visibility:hidden");const s=this.#t.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"});if(!(s instanceof WebGL2RenderingContext))throw new Error("this browser has no WebGL2");this.#s=s,this.#w&&(this.#It(),this.#h=new K(s)),this.#m=te(s,Ae);const r=this.#m;this.#r=Object.fromEntries(Object.entries(_e).map(([h,o])=>[h,s.getUniformLocation(r,o)])),this.#y=te(s,Ze),this.#b=s.getUniformLocation(this.#y,"uField"),this.#E=s.getUniformLocation(this.#y,"uFlip"),this.#Ee=s.getExtension("EXT_disjoint_timer_query_webgl2"),this.#t.addEventListener("webglcontextlost",this.#ii),this.#j=i?null:new ResizeObserver(()=>this.#ze()),this.#z=i?null:new MutationObserver(()=>{this.#i.ownerDocument!==this.#p&&this.#ze()}),this.encodedVideo=!i&&typeof VideoDecoder<"u"?new Se(e):null,this.#d=i?null:new Ce(s,e),this.#o=new Oe(e,()=>this.encodedVideo?.take(),()=>this.#T==="main"?this.#d:null),e.addEventListener("emptied",this.#Zt),e.addEventListener("resize",this.#Jt),e.addEventListener("pause",this.#he),e.addEventListener("ended",this.#he),e.addEventListener("seeking",this.#ti),e.addEventListener("seeked",this.#he),e.addEventListener("ratechange",this.#he)}get running(){return this.#P&&(this.#_?.interlaced??!0)}get canvas(){return this.#i}get#Mt(){return this.#_?.topFieldFirst!==!1}#Lt(){return{doubleRate:this.#L,spatialCheck:this.#ee,film:this.#w,debug:this.#N}}get enabled(){return this.#We}set enabled(e){this.#We=e,this.#vt(),this.#g?.postMessage({type:"enabled",enabled:e})}set scan(e){const t=this.#_?.interlaced!==e?.interlaced,i=t||this.#_?.topFieldFirst!==e?.topFieldFirst;this.#_=e,!(i&&(!this.#_e()||this.#_!==e))&&(this.#g?.postMessage({type:"scan",scan:e}),i&&(this.#S=0,this.#k(),this.#Z(),t&&(this.#R=0),this.#n=null,this.#ne(!1)),this.#vt(),i&&((e?.interlaced??!0)&&(this.#C||this.#T==="main")?this.#Ge():this.#Ft()))}get scan(){return this.#_}set videoTimeline(e){this.#fe=e,this.#g?.postMessage({type:"timeline",videoTimeline:e}),e.length===0&&(this.#_=null),this.#vt()}get videoTimeline(){return this.#fe}get container(){return this.#B??this.#e}get doubleRate(){return this.#L}set doubleRate(e){e!==this.#L&&(this.#L=e,this.#Re(),this.#k(),this.#Ut())}get spatialCheck(){return this.#ee}set spatialCheck(e){e!==this.#ee&&(this.#ee=e,this.#Re())}get film(){return this.#w}set film(e){const t=this.#g?this.#mt:this.#ue;if(!(e===this.#w&&(e===!1||t===null))){if(this.#g){this.#w=e,this.#Re(e?"film":void 0);return}if(e){if(!this.#_e())return;try{this.#Bt()}catch(i){this.#w=!0,this.#Re(),this.#Qe(`film detector unavailable: ${i instanceof Error?i.message:String(i)}`);return}}if(this.#w=e,this.#Re(),!e){if(!this.#_e())return;this.#H=!1,this.#V=0,this.#le=!1,this.#U=R,this.#Z(),this.#h?.destroy(),this.#h=null}this.#Ut()}}get debug(){return this.#N}set debug(e){e!==this.#N&&(this.#N=e,this.#Re())}get#ni(){return this.#L||this.#w}#Ut(){this.#J||(this.#ni?(this.#G>0&&this.#Qt(),(this.#_?.interlaced??!0)&&(this.#C||this.#T==="main")&&this.#Ge()):this.#w||(this.#n=null,this.#ne(!1),this.#$e()))}#Re(e){this.#g?.postMessage({type:"settings",options:this.#Lt(),retryFilm:e})}#It(){if(this.#s.getExtension("EXT_color_buffer_float")===null)throw new Error("film needs EXT_color_buffer_float")}#Bt(){this.#It(),this.#h??=new K(this.#s),this.#G>0&&this.#h.resize(this.#G,this.#Q)}#vt(){this.#We&&(this.#fe.length>0||(this.#_?.interlaced??!0))?this.start():this.stop()}#hi(){return this.#C||this.#te==="main"?!1:this.#T==="starting"||this.#T==="active"?!0:typeof Worker<"u"&&typeof VideoFrame<"u"&&typeof OffscreenCanvas<"u"&&this.#ot!==null&&"transferControlToOffscreen"in HTMLCanvasElement.prototype?(this.#Nt(),!0):this.#te==="auto"?(this.#Je(),!1):(this.#T="failed",this.#P=!1,!0)}#Nt(){this.#se(),this.#g?.terminate(),this.#g=null,this.#Ce=!1,this.#He=!1,this.#mt=null,this.#pt=0;let e=this.#i;if(this.#lt){e=document.createElement("canvas"),e.className=this.#i.className;const r=this.#i.getAttribute("style");r===null?e.removeAttribute("style"):e.setAttribute("style",r),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e}const t=++this.#at;this.#T="starting";let i,s;try{s=e.transferControlToOffscreen(),this.#lt=!0,i=new Worker(this.#ot,{type:"module"})}catch(r){this.#Ne(r instanceof Error?r.message:String(r));return}this.#g=i,i.onmessage=r=>{t===this.#at&&this.#oi(r.data)},i.onerror=r=>{t===this.#at&&(r.preventDefault(),this.#Ne(r.message||"the deinterlacer worker failed"))},i.postMessage({type:"initialize",canvas:s,options:this.#Lt(),scan:this.#_,videoTimeline:this.#fe,enabled:this.#P,video:this.#Et()},[s])}#oi(e){switch(e.type){case"ready":this.#T="active",this.#P&&(this.#Oe(),this.#st());break;case"failed":this.#Ne(e.message);break;case"consumed":{this.#Ce=!1,this.#He=!0;const t=this.#me;this.#me=null,t&&this.#Xt(t);break}case"visibility":this.#i.style.visibility=e.visible?"visible":"hidden";break;case"stats":{const t={...e.stats,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0},i=t.filmError??null,s=this.#pt;if(this.#mt=i,this.#pt=e.filmFailure,i!==null&&e.filmFailure!==s){this.dispatchEvent(new CustomEvent("failure",{detail:i}));try{this.#ht?.(i)}catch{}}this.dispatchEvent(new CustomEvent("stats",{detail:t})),this.#nt?.(t);break}case"capture":{const t=this.#De.get(e.id);if(this.#De.delete(e.id),!t){e.image?.close();break}e.image?t.resolve(e.image):createImageBitmap(this.#e).then(t.resolve,t.reject);break}}}#bt(e){if(this.dispatchEvent(new CustomEvent("failure",{detail:e})),!this.#C)try{this.#ht?.(e)}catch{}}#Qe(e){this.#ue!==e&&(this.#ue=e,this.#H=!1,this.#V=0,this.#le=!1,this.#U=R,this.#Z(),this.#h?.destroy(),this.#h=null,this.#bt(e))}#_e(){return this.#J?!1:(this.#g||(this.#ue=null),!0)}#Ne(e){if(this.#T==="starting"&&this.#te==="auto"&&!this.#ke){this.#Je();return}if(this.#Ot(e),!this.#ke){this.#ke=!0,this.#Nt();return}console.error(`Deinterlacer Worker stopped: ${e}`),this.#T="failed",this.#g?.terminate(),this.#g=null,this.#se(),this.#bt(`deinterlacer worker stopped: ${e}`),this.stop()}#Je(){const e=this.#t;e.className=this.#i.className;const t=this.#i.getAttribute("style");t===null?e.removeAttribute("style"):e.setAttribute("style",t),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e,this.#lt=!1,this.#g?.terminate(),this.#g=null,this.#T="main",this.#se(),this.#P&&(this.#Oe(),this.#st(),(this.#_?.interlaced??!0)&&this.#Ge())}#se(){this.#me?.frame.close(),this.#me=null}#Ot(e){for(const t of this.#De.values())t.reject(new Error(e));this.#De.clear()}start(){if(!(this.#P||this.#J||this.#q)&&(this.#ae++,this.#P=!0,this.#ei(),!!this.#_e())){if(this.#Ri(),this.#st(),this.#hi()){this.#g?.postMessage({type:"enabled",enabled:!0}),this.#T==="active"&&this.#Oe();return}this.#Oe(),(this.#_?.interlaced??!0)&&this.#Ge()}}stop(){this.#ae++,this.#P&&(this.#P=!1,this.#o.cancel(),this.encodedVideo?.suspend(),this.#Ht(),this.#Ft(),this.#S=0,this.#n=null,this.#ne(!1),this.#se(),this.#g?.postMessage({type:"enabled",enabled:!1}))}destroy(){if(!this.#J){this.#J=!0,this.#We=!1,this.stop(),this.#g?.postMessage({type:"destroy"}),this.#g?.terminate(),this.#g=null,this.#se(),this.#Ot("the deinterlacer was destroyed"),this.#p?.removeEventListener("visibilitychange",this.#At),this.#p=null,this.#z?.disconnect(),this.#t.removeEventListener("webglcontextlost",this.#ii),this.#o.destroy(),this.#d?.destroy(),this.encodedVideo?.destroy(),this.#e.removeEventListener("emptied",this.#Zt),this.#e.removeEventListener("resize",this.#Jt),this.#e.removeEventListener("pause",this.#he),this.#e.removeEventListener("ended",this.#he),this.#e.removeEventListener("seeking",this.#ti),this.#e.removeEventListener("seeked",this.#he),this.#e.removeEventListener("ratechange",this.#he),this.#_i();for(const e of this.#c)this.#s.deleteTexture(e);this.#c=[],this.#$e();for(const e of[...this.#Ke,...this.#xe.map(({q:t})=>t)])this.#s.deleteQuery(e);this.#Ke.length=0,this.#xe.length=0,this.#h?.destroy(),this.#h=null,this.#Fe!==null&&(ae(this.#Fe),this.#Fe=null),this.#s.deleteProgram(this.#m),this.#s.deleteProgram(this.#y),this.#s.getExtension("WEBGL_lose_context")?.loseContext()}}capture(){if(this.#T==="active"&&this.#i.style.visibility==="visible"&&this.#g){const s=++this.#ri,r=new Promise((h,o)=>{this.#De.set(s,{resolve:h,reject:o})});return this.#g.postMessage({type:"capture",id:s,width:this.#e.videoWidth,height:this.#e.videoHeight}),r}if(this.#T==="starting"||this.#T==="failed")return createImageBitmap(this.#e);const e=this.#n;if(this.#C&&(!this.#P||this.#q||!e))return Promise.reject(new Error("no rendered picture is available"));if(!this.#P||this.#q||!e)return createImageBitmap(this.#e);e.kind==="texture"?this.#St(e.texture,e.flip,!1):this.#ce(e.flush,e.second,null,!1);const t=this.#e.videoWidth,i=this.#e.videoHeight;return t>0&&i>0&&(t!==this.#t.width||i!==this.#t.height)?createImageBitmap(this.#t,{resizeWidth:t,resizeHeight:i,resizeQuality:"high"}):createImageBitmap(this.#t)}addEventListener(e,t,i){super.addEventListener(e,t,i)}removeEventListener(e,t,i){super.removeEventListener(e,t,i)}#Oe(){this.#C||!this.#P||this.#o.request(this.#pi)}#Et(){const e=[];for(let t=0;t<this.#e.buffered.length;t++)e.push({start:this.#e.buffered.start(t),end:this.#e.buffered.end(t)});return{currentTime:this.#e.currentTime,playbackRate:this.#e.playbackRate,seeking:this.#e.seeking,paused:this.#e.paused,ended:this.#e.ended,readyState:this.#e.readyState,videoWidth:this.#e.videoWidth,videoHeight:this.#e.videoHeight,buffered:e}}#ai(e,t,i){let s;try{s=i?.clone()??new VideoFrame(this.#e,{timestamp:Math.max(0,Math.round(t.mediaTime*1e6))})}catch(h){const o=h instanceof Error?h.message:String(h);this.#te==="auto"&&!this.#He&&!this.#ke?(this.#Je(),this.#et(e,t)):this.#Ne(o);return}const r={id:++this.#si,frame:s,now:e,metadata:t,video:this.#Et()};if(this.#Ce){this.#me?.frame.close(),this.#me=r;return}this.#Xt(r)}#Xt(e){const t=this.#g;if(!t||this.#T!=="active"){e.frame.close();return}this.#Ce=!0;const i={type:"frame",id:e.id,frame:e.frame,metadata:e.metadata,video:e.video};try{t.postMessage(i,[e.frame])}catch(s){this.#Ce=!1,e.frame.close();const r=s instanceof Error?s.message:String(s);this.#te==="auto"&&!this.#He&&!this.#ke?(this.#Je(),this.#et(e.now,e.metadata)):this.#Ne(r)}}#li(e,t,i){this.#Fe==null&&(this.#Fe=he(this.#s,"20px monospace")),le(this.#Fe,e,t,i,this.#G,this.#Q,20)}#Gt(e){if(this.#Ee==null||this.#xe.length>30)return;const t=this.#Ke.pop()??this.#s.createQuery();return this.#s.beginQuery(this.#Ee.TIME_ELAPSED_EXT,t),this.#xe.push({q:t,isField:e}),t}#Ze(e){this.#Ee!=null&&(e!=null&&this.#s.endQuery(this.#Ee.TIME_ELAPSED_EXT),this.#xe=this.#xe.filter(({q:t,isField:i})=>{if(this.#s.getQueryParameter(t,this.#s.QUERY_RESULT_AVAILABLE)){const s=this.#s.getQueryParameter(t,this.#s.QUERY_RESULT);return i?(this.#Ie+=s,this.#Te++):(this.#Ue+=s,this.#ge++),this.#Ke.push(t),!1}return!0}))}#Z(e=!1){this.#U=R,this.#Be=R,this.#ye=0,e||(this.#ut=!1),this.#H=!1,this.#h?.reset(e)}#ui(){const{prev:e,cur:t,next:i}=this.#Pt(!1),s=this.#c[e],r=this.#c[t],h=this.#c[i];if(!s||!r||!h)return;const o=this.#_?.topFieldFirst!==!1?0:1;this.#h?.measureComb(s,r,o),this.#h?.detect(r,h,o)}#ci(){const{cur:e,next:t}=this.#Pt(!1),i=this.#c[e],s=this.#c[t],r=this.#h;if(!i||!s||!r)return!1;const h=this.#_?.topFieldFirst!==!1?0:1;try{r.measureComb(i,s,h,!0)}catch(o){return this.#Qe(`film detection failed: ${o instanceof Error?o.message:String(o)}`),!1}return!0}#fi(){const e=this.#h?.poll()??null;e!==null&&(this.#Be=e,this.#ye=e.age,this.#ut=e.instant),this.#ye++;const{phase:t,run:i}=this.#Be;t===0||this.#ye>Math.ceil(z*Math.max(1,this.#e.playbackRate))?this.#U=R:this.#U={phase:(t-1+this.#ye)%z+1,run:i}}#di(e){const t=[],i=this.#h?.metrics??new Float32Array(0);for(let r=0;r<m.phase;r++){const h=i[r*4]??0,o=i[r*4+1]??0,l=i[r*4+2]??0;t.push(`${h.toFixed(3)},${o.toString().padStart(4)},${l.toFixed(3)}`)}const s=this.#je.map((r,h)=>`${h===0?"-":h}:${r}`).join(" ");return`frame=${e} phase=${this.#U.phase} run=${this.#U.run} known=${this.#Be.phase}/${this.#Be.run} age=${this.#ye} ${this.#H?"film":"video"} period=${this.#R.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#dt}`}#xt(e,t){const i=t-performance.timeOrigin;return Number.isFinite(i)&&i!==0?e+i:e}#mi(e,t){const i=e.expectedDisplayTime;if(!Number.isFinite(i)||i<=0||!Number.isFinite(e.timeOrigin))return t;const s=this.#xt(i,e.timeOrigin),r=Ye*Math.max(this.#F,this.#R);return s<t-r||s>t+r?t:s}#pi=(e,t)=>{if(!this.#P||this.#q)return;this.#_t();const i=this.#xt(e,t.timeOrigin),{frame:s,picture:r,...h}=t;this.#de=s??this.#e,this.#a=r??null;try{this.#vi(i,h,s)}finally{this.#de=this.#e,this.#a=null}this.#Oe()};#vi(e,t,i){if(this.#T==="active"){this.#ai(e,t,i);return}this.#T!=="starting"&&this.#et(e,t)}ingestExternalFrame(e,t,i){this.#de=i;try{this.#et(e,t)}finally{this.#de=this.#e}}#et(e,t){const i=this.#ae;if(this.#re(i)&&(this.#bi(t.mediaTime),!!this.#re(i)&&t.width>0&&t.height>0)){let s=!1;if(!this.#Pe&&this.#e.seeking){const c=this.#e.buffered,d=this.#R>=J?this.#R/1e3:B/1e3;for(let b=0;b<c.length;b++)if(t.mediaTime>=c.start(b)&&t.mediaTime<c.end(b)&&Math.abs(t.mediaTime-this.#e.currentTime)<=d){s=!0;break}}if(s&&(this.#Pe=!0),(this.#G===0||this.#Q===0)&&this.#jt(t.width,t.height),!this.#re(i))return;if(this.#_&&!this.#_.interlaced){const c=performance.now();this.#qt(c),this.#Ve=c,this.#V>0&&this.#V--,this.#ft=!0,this.#yi(),this.#pe+=performance.now()-c,this.#ie++,this.#ve++,this.#Kt(c);return}const r=t.mediaTime-this.#Se,h=t.mozTiming,o=s||(h?h.discontinuity||r<0||r>j:r<0||r>j);o&&(this.#S=0,this.#R=0,this.#D.discontinuities++,this.#k(),this.#Z(),(s||!this.#ft)&&(this.#V=0)),this.#ft=!1;const l=this.#Fi(t.presentedFrames,o);if(this.#S>0&&t.mediaTime===this.#Se&&(!h||t.presentedFrames===this.#rt))return;if(!o){const c=h?.periodMs??0;c>0?this.#zt(c*(this.#e.playbackRate||1)/1e3,1):this.#S>0&&r>0&&this.#zt(r,l+1)}this.#Se=t.mediaTime,this.#rt=t.presentedFrames;const f=performance.now();this.#qt(f),this.#Ve=f;const a=performance.now(),p=this.#Gt(!1);if(this.#Yt(),this.#w&&!this.#ue&&!this.#h)try{this.#Bt()}catch(c){this.#Qe(`film detector unavailable: ${c instanceof Error?c.message:String(c)}`)}if(!this.#re(i)){this.#J||this.#Ze(p);return}if(this.#Ye=!1,this.#le=!1,this.#ct=!1,this.#w&&!this.#ue){let c=!1;if(this.#S===y&&l===0)try{this.#fi(),this.#ui(),c=!0}catch(d){this.#Qe(`film detection failed: ${d instanceof Error?d.message:String(d)}`)}else this.#Z(!0);this.#je[this.#U.phase]=(this.#je[this.#U.phase]??0)+1,this.#H=this.#U.phase!==0&&this.#U.run>=O,this.#H?this.#V=je:this.#V>0&&this.#V--,this.#Ye=c&&!this.#Ct,this.#le=this.#Ye&&this.#V>0,this.#ct=this.#le&&!this.#H&&this.#L&&this.#Xe()&&this.#ci(),this.#le&&!this.#H&&this.#D.matched++,this.#N&&(this.#Dt=this.#di(t.presentedFrames))}if(this.#Ct=l>0,!this.#re(i)){this.#J||this.#Ze(p);return}const u=this.#mi(t,e)+this.#F;if(this.#H)if(this.#Xe()){const c=this.#U.phase;if(c===N)this.#dt++,this.#X++;else{const d=this.#R*z/Qe,b=this.#yt(1,e,d),E=Je[c]??0,$=b||this.#K===null?u+d:u+E*this.#R;this.#tt("film",!1,this.#gt("film",$,d),d)}}else this.#ce(!1,!1,null);else if(this.#L&&this.#Xe()){const c=this.#R/2,b=this.#yt(2,e,c)||this.#K===null?u+c*2:u,E=this.#gt("field",b,c);this.#tt("field",!1,E,c),this.#tt("field",!0,E+c,c)}else if(this.#Xe()){const c=this.#R,b=this.#yt(1,e,c)||this.#K===null?u+c:u;this.#tt("frame",!1,this.#gt("frame",b,c),c)||(this.#D.late++,this.#ce(!1,!1,null))}else this.#D.late+=this.#u.length,this.#k(),this.#ce(!1,!1,null);this.#be=Math.max(this.#be,this.#u.length),this.#Ze(p),this.#pe+=performance.now()-a,this.#ie++,this.#Kt(f)}}#re(e){return!this.#J&&this.#P&&e===this.#ae}#bi(e){const t=this.#ae;let i;for(let h=this.#fe.length-1;h>=0;h--){const o=this.#fe[h];if(o.start<=e+1e-6){i=o;break}}if(i?.codedSize&&(i.codedSize.width!==this.#G||i.codedSize.height!==this.#Q)&&this.#jt(i.codedSize.width,i.codedSize.height),!this.#re(t))return;const s=i?.scan;if(!s||this.#_?.interlaced===s.interlaced&&this.#_.topFieldFirst===s.topFieldFirst)return;const r=this.#_?.interlaced;this.#_=s,this.#S=0,this.#k(),this.#_e()&&(r!==s.interlaced&&(this.#R=0),s.interlaced&&(this.#C||this.#T==="main")?this.#Ge():this.#Ft(),this.#Z())}#Xe(){return(this.#L||this.#w)&&this.#R>0&&this.#f.length===A}#zt(e,t){const s=e*1e3/(this.#e.playbackRate||1)/t;s<J||s>B||(this.#R=this.#R>0&&s>this.#R*We?this.#R+(s-this.#R)*Ge:s)}#tt(e,t,i,s){const r=this.#$t();if(r===null)return!1;const h=this.#f[r];if(!h)return!1;for(this.#l=r;this.#u.length>0&&this.#u[0]?.slot===r;)this.#u.shift(),this.#D.late++;this.#ce(!1,t,h.framebuffer);const o={slot:r,at:i,duration:s,cadence:e,phase:e==="film"?this.#U.phase:e==="field"?t?2:1:0,droppedBefore:this.#X};return this.#X=0,this.#u.push(o),this.#K=o,!0}#gt(e,t,i){if(!(i>0))return t;const s=this.#K,r=this.#F;if(s!==null&&s.cadence===e){const h=s.at+s.duration,o=h-t,l=o-this.#Y;if(o>-r/2&&l<r*1.5){const a=Math.round(l/r),p=l-a*r,v=h+Math.max(-Z,Math.min(Z,-p*He));if(a===0)return this.#M=0,v;if(this.#M===0||a>0!=this.#oe>0?(this.#M=0,this.#oe=l):Math.abs(l)<Math.abs(this.#oe)&&(this.#oe=l),++this.#M<Ve)return v;const u=this.#oe;return this.#M=0,u<0?(this.#Y+=u,v):(this.#D.resynced++,this.#Tt(h-u))}const f=this.#Y-o;if(o<=-r/2&&f<r*1.5)return this.#Y=f,this.#M=0,this.#D.resynced++,this.#Tt(t)}return this.#Y=0,this.#M=0,s!==null&&this.#D.resynced++,this.#Tt(t)}#Tt(e){for(let t=this.#u.at(-1);t&&t.at>=e;)this.#u.pop(),this.#D.late++,t=this.#u.at(-1);return e}#yt(e,t,i){const s=this.#u.at(-1),r=(G+1)*Math.max(this.#F,i);if(s&&s.at-t>r)return this.#k(),this.#D.queueResetted++,!0;const h=Math.max(0,this.#u.length+e-G);let o=0,l=0;for(;l<h;){const f=this.#u.shift();if(!f)break;o+=f.duration,l++}for(const f of this.#u)f.at-=o;return this.#D.late+=l,!1}#$t(){const e=this.#n?.kind==="texture"?this.#n.texture:null,t=new Set(this.#u.map(({slot:s})=>s));for(let s=1;s<=A;s++){const r=(this.#l+s)%A,h=this.#f[r];if(h&&h.texture!==e&&!t.has(r))return r}const i=this.#u[0];if(i){const s=this.#f[i.slot];if(s&&s.texture!==e)return i.slot}return null}#Ge(){this.#x===null&&(!this.#P||this.#q||(this.#A=0,this.#x=this.#Ae(this.#Rt)))}#Ft(){this.#it(this.#x),this.#x=null,this.#k()}#Rt=e=>{if(this.#x=null,!this.#P||this.#q)return;this.#Ei(e);const t=this.#ae;this.#o.flush(e),this.#re(t)&&(this.#T==="main"&&this.#gi(this.#I,e),this.#x=this.#Ae(this.#Rt))};#Ei(e){const t=e-this.#A;this.#A=e;const i=Math.max(1,Math.round(t/this.#F)),s=this.#I+i*this.#F,r=e-s;if(this.#I===0||t<=0||t>B||Math.abs(r)>this.#F/4){t>=1&&t<=B&&(this.#F=t),this.#I=e;return}this.#F+=r/i*qe,this.#I=s+r*Ke}#Wt(){const e=this.#C;if(e)return{frames:e,origin:performance.timeOrigin};const t=this.#i.ownerDocument?.defaultView??this.#e.ownerDocument?.defaultView??null;return t===null?{frames:et,origin:performance.timeOrigin}:{frames:t,origin:t.performance.timeOrigin}}#Ae(e){const{frames:t,origin:i}=this.#Wt(),s=t.requestAnimationFrame(r=>e(this.#xt(r,i)));return{frames:t,handle:s}}#it(e){e?.frames.cancelAnimationFrame(e.handle)}#_t(){if(this.#C)return;this.#xi();const{frames:e}=this.#Wt(),t=this.#x!==null&&this.#x.frames!==e,i=this.#v!==null&&this.#v.frames!==e;!t&&!i||(this.#A=0,t&&(this.#it(this.#x),this.#x=this.#Ae(this.#Rt)),i&&(this.#it(this.#v),this.#v=this.#Ae(this.#wt)))}#xi(){const e=this.#C?null:this.#i.ownerDocument??null;e!==this.#p&&(this.#p?.removeEventListener("visibilitychange",this.#At),this.#p=e,e?.addEventListener("visibilitychange",this.#At),this.#z?.disconnect(),e&&this.#z?.observe(e,{childList:!0,subtree:!0}))}#At=()=>{this.#J||this.#_t()};#st(){this.#C||this.#v!==null||!this.#o.captureDriven||!this.#P||this.#q||(this.#v=this.#Ae(this.#wt))}#Ht(){this.#it(this.#v),this.#v=null}#wt=e=>{if(this.#v=null,!this.#P||this.#q)return;const t=this.#ae;this.#o.flush(e),this.#re(t)&&this.#o.captureDriven&&(this.#v=this.#Ae(this.#wt))};#gi(e,t){const i=this.#F/2,s=l=>{const f=l.at-e;return f<=i-ee?!0:f>i+ee?!1:this.#we>0};for(;this.#u[1]&&s(this.#u[1]);)this.#D.late++,this.#u.shift();const r=this.#u[0];if(!r||!s(r))return;this.#u.shift(),this.#we=r.at-e;const h=performance.now(),o=this.#Gt(!0);this.#Vt(r.slot),this.#Ze(o),this.#Le+=performance.now()-h,this.#ve++,this.#N&&this.#Ti(r,t),this.#$=t}#Ti(e,t){const i=this.#$===0?0:t-this.#$,s=i/this.#F,r=e.cadence==="film"?`phase ${e.phase}`:e.cadence==="field"?`field ${e.phase}`:"frame",h=e.phase===0?"duplicate":`phase ${N}`,o=e.droppedBefore>0?`, ${h} dropped before it`+(e.droppedBefore>1?` (${e.droppedBefore})`:""):"";console.log(`yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at-t).toFixed(2)} ms${o}`)}#Vt(e){const t=this.#f[e];t&&this.#St(t.texture)}#yi(){this.#Yt();const e=this.#c[this.#O];e&&this.#St(e,!0),this.#S=0}#ne(e){if(this.#C){this.#C.onVisibility(e);return}this.#i.style.visibility=e?"visible":"hidden"}#St(e,t=!1,i=!0){const s=this.#s;s.bindFramebuffer(s.FRAMEBUFFER,null),s.useProgram(this.#y),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this.#b,0),s.uniform1i(this.#E,t?1:0),s.viewport(0,0,this.#G,this.#Q),s.drawArrays(s.TRIANGLES,0,3),this.#n={kind:"texture",texture:e,flip:t},this.#ne(!0),i&&this.#W++}#Fi(e,t){let i=0;return this.#Me!==0&&!t&&(i=Math.max(0,e-this.#Me-1),this.#D.missed+=i),this.#Me=e,i}#qt(e){e-this.#Ve<=Q||(this.#qe=e,this.#ie=0,this.#pe=0,this.#ve=0,this.#Le=0,this.#be=0,this.#W=0,this.#Ue=0,this.#ge=0,this.#Ie=0,this.#Te=0)}#Kt(e){const t=e-this.#qe;if(t<Q)return;const i=this.#Xe()&&(this.#L||this.#H)?this.#ve:this.#ie,s=this.#ie?(this.#pe+this.#Le)/this.#ie:0;let r;this.#Ee!=null&&(r=0,this.#ge!==0&&(r+=this.#Ue/1e6/this.#ge),this.#Te!==0&&(r+=this.#Ie/1e6/this.#Te/2));const h={...this.#D,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0,fps:i*1e3/t,frameMs:s,maxQueuedFields:this.#be,outputFps:this.#W*1e3/t,gpuMs:r,film:this.#H,oneInstant:this.#ut,filmError:this.#ue};this.dispatchEvent(new CustomEvent("stats",{detail:h})),this.#nt?.(h),this.#qe=e,this.#ie=0,this.#pe=0,this.#ve=0,this.#Le=0,this.#be=0,this.#W=0,this.#Ue=0,this.#ge=0,this.#Ie=0,this.#Te=0}#Yt(){const e=this.#s;this.#O=(this.#O+1)%y;const t=this.#a,i=this.#c[this.#O];t!==null&&this.#d!==null&&i!==void 0?(this.#c[this.#O]=this.#d.adopt(t,i),this.#a=null):(e.bindTexture(e.TEXTURE_2D,i??null),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#de)),this.#S=Math.min(this.#S+1,y)}#ce(e,t,i,s=!0){if(this.#S===0||this.#q)return;s&&(this.#S===y&&!e?this.#D.filtered++:this.#D.degraded++);const r=this.#s,{prev:h,cur:o,next:l}=this.#Pt(e);r.bindFramebuffer(r.FRAMEBUFFER,i),r.useProgram(this.#m);for(const[d,b]of[h,o,l].entries())r.activeTexture(r.TEXTURE0+d),r.bindTexture(r.TEXTURE_2D,this.#c[b]??null);r.uniform1i(this.#r.prev,0),r.uniform1i(this.#r.cur,1),r.uniform1i(this.#r.next,2);const f=this.#w?this.#h?.texture??null:null,a=this.#w?this.#h?.combTexture??null:null,p=f!==null&&a!==null;f!==null&&a!==null&&(r.activeTexture(r.TEXTURE0+3),r.bindTexture(r.TEXTURE_2D,f),r.uniform1i(this.#r.fieldMetrics,3),r.activeTexture(r.TEXTURE0+4),r.bindTexture(r.TEXTURE_2D,a),r.uniform1i(this.#r.comb,4));const v=this.#ct?this.#h?.combAheadTexture??null:null,u=p&&!e;r.activeTexture(r.TEXTURE0+5),r.bindTexture(r.TEXTURE_2D,v),r.uniform1i(this.#r.combAhead,5),r.activeTexture(r.TEXTURE0),r.uniform2i(this.#r.size,this.#G,this.#Q);const c=this.#Mt?0:1;r.uniform1i(this.#r.parity,t?1-c:c),r.uniform1i(this.#r.tff,this.#Mt?1:0),r.uniform1i(this.#r.second,t?1:0),r.uniform1i(this.#r.spatialCheck,this.#ee?1:0),r.uniform1i(this.#r.debug,this.#N?1:0),r.uniform1i(this.#r.film,p?1:0),r.uniform1i(this.#r.match,u&&this.#le&&(!t||v!==null)?1:0),r.uniform1i(this.#r.instant,u&&this.#Ye?1:0),r.uniform1i(this.#r.phase,this.#U.phase),r.viewport(0,0,this.#G,this.#Q),r.drawArrays(r.TRIANGLES,0,3),this.#N&&p&&this.#li(this.#Dt,0,90),i===null&&(this.#n={kind:"yadif",flush:e,second:t},this.#ne(!0),s&&this.#W++)}#Pt(e){const t=i=>(this.#O+y-i)%y;return this.#S===1?{prev:this.#O,cur:this.#O,next:this.#O}:e?{prev:t(1),cur:this.#O,next:this.#O}:this.#S===2?{prev:t(1),cur:t(1),next:this.#O}:{prev:t(2),cur:t(1),next:this.#O}}#ze(){if(this.#_t(),!this.#B)return;const e=this.#e,t=e.videoWidth,i=e.videoHeight;if(t===0||i===0)return;const s=Math.min(e.offsetWidth/t,e.offsetHeight/i),r=t*s,h=i*s;this.#i.style.left=`${e.offsetLeft+(e.offsetWidth-r)/2}px`,this.#i.style.top=`${e.offsetTop+(e.offsetHeight-h)/2}px`,this.#i.style.width=`${r}px`,this.#i.style.height=`${h}px`}#jt(e,t){const i=this.#s;this.#t.width=e,this.#t.height=t,this.#G=e,this.#Q=t,this.#S=0,this.#V=0,this.#n=null,this.#k(),this.#ze();for(const s of this.#c)i.deleteTexture(s);this.#c=[];for(let s=0;s<y;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null),this.#c.push(r)}this.#$e(),(this.#L||this.#w)&&this.#Qt(),this.#h?.resize(e,t),this.#_e()}#Qt(){const e=this.#s;if(!(this.#f.length===A||this.#G===0)){this.#$e();for(let t=0;t<A;t++){const i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,this.#G,this.#Q,0,e.RGBA,e.UNSIGNED_BYTE,null);const s=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0);const r=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!r){e.deleteFramebuffer(s),e.deleteTexture(i),this.#$e();return}this.#f.push({texture:i,framebuffer:s})}this.#l=A-1}}#$e(){const e=this.#s,t=this.#n?.kind==="texture"?this.#n.texture:null;this.#f.some(i=>i.texture===t)&&(this.#n=null);for(const{texture:i,framebuffer:s}of this.#f)e.deleteFramebuffer(s),e.deleteTexture(i);this.#f=[],this.#k()}#Ri(){if(this.#B)return;const e=this.#e.parentElement;if(!e)return;const t=document.createElement("div");t.style.cssText="position:relative;display:inline-block;line-height:0;max-width:100%",e.insertBefore(t,this.#e),t.appendChild(this.#e),t.appendChild(this.#i),this.#B=t,this.#j?.observe(this.#e),this.#ze()}#_i(){if(this.#C)return;const e=this.#B;this.#B=null,this.#j?.disconnect(),this.#i.remove(),e?.parentElement&&(e.parentElement.insertBefore(this.#e,e),e.remove())}#Jt=()=>this.#ze();#kt(e){return!this.#g||this.#T==="main"?!1:(this.#g.postMessage({type:"event",name:e,video:this.#Et()}),!0)}#Zt=()=>{if(this.#kt("emptied")){this.#se(),this.#ne(!1);return}this.#S=0,this.#Se=0,this.#rt=0,this.#k(),this.#Z(),this.#V=0,this.#R=0,this.#ei(),this.#n=null,this.#ne(!1)};#ei(){this.#D={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0},this.#je.fill(0),this.#dt=0,this.#Me=0,this.#qe=0,this.#Ve=0,this.#ie=0,this.#pe=0,this.#ve=0,this.#Le=0,this.#be=0,this.#W=0,this.#k(),this.#Ue=0,this.#ge=0,this.#Ie=0,this.#Te=0}#ti=()=>{if(this.#kt("seeking")){this.#se();return}this.#Pe=!1};#he=e=>{if(e.type==="ratechange"&&(this.#o.captureDriven?this.#st():this.#Ht()),(e.type==="pause"||e.type==="ended"||e.type==="seeked"||e.type==="ratechange")&&this.#kt(e.type)){this.#se();return}if(e.type==="seeked"){const i=this.#Pe;if(this.#Pe=!1,i)return;this.#S=0,this.#k(),this.#Z(),this.#n=null,this.#ne(!1);return}const t=e.type==="ratechange";if(t&&(this.#R=0,this.#Se=this.#e.currentTime),this.#k(),this.#P&&this.#S>0){const i=this.#$t(),s=i===null?void 0:this.#f[i];i!==null&&s?(this.#l=i,this.#ce(!0,!1,s.framebuffer),this.#Vt(i)):this.#ce(!0,!1,null)}t&&(this.#S=0,this.#Me=0,this.#Z())};#ii=e=>{if(e.preventDefault(),this.#C){this.#C.onFailure("the deinterlacer WebGL context was lost");return}this.#T!=="active"&&(this.#q=!0,this.#bt("the deinterlacer WebGL context was lost"),this.stop())}}function it(n,e,t,i,s,r,h){return new tt(n,t,{canvas:e,onFailure:i,onVisibility:s,requestAnimationFrame:r,cancelAnimationFrame:h})}function te(n,e){const t=n.createProgram(),i=ie(n,n.VERTEX_SHADER,$e),s=ie(n,n.FRAGMENT_SHADER,e);if(n.attachShader(t,i),n.attachShader(t,s),n.linkProgram(t),n.deleteShader(i),n.deleteShader(s),!n.getProgramParameter(t,n.LINK_STATUS)){const r=n.getProgramInfoLog(t);throw n.deleteProgram(t),new Error(`the deinterlacer failed to link: ${r??"no reason given"}`)}return t}function ie(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const C=self;class st extends EventTarget{currentTime=0;playbackRate=1;seeking=!1;paused=!0;ended=!1;readyState=0;videoWidth=0;videoHeight=0;parentElement=null;offsetWidth=0;offsetHeight=0;offsetLeft=0;offsetTop=0;#t=[];update(e){this.currentTime=e.currentTime,this.playbackRate=e.playbackRate,this.seeking=e.seeking,this.paused=e.paused,this.ended=e.ended,this.readyState=e.readyState,this.videoWidth=e.videoWidth,this.videoHeight=e.videoHeight,this.#t=e.buffered}get buffered(){return{length:this.#t.length,start:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.start},end:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.end}}}getVideoPlaybackQuality(){return{creationTime:performance.now(),droppedVideoFrames:0,totalVideoFrames:0,corruptedVideoFrames:0}}requestVideoFrameCallback(){return 0}cancelVideoFrameCallback(){}}let T=null,x=null,se=!1;function rt(n){return C.requestAnimationFrame(n)}function nt(n){C.cancelAnimationFrame(n)}function F(n,e=[]){C.postMessage(n,e)}function ht(n,e,t){n.doubleRate=e.doubleRate,n.spatialCheck=e.spatialCheck,(n.film!==e.film||t==="film")&&(n.film=e.film),n.debug=e.debug}C.onmessage=n=>{const e=n.data;try{if(e.type==="initialize"){if(typeof C.requestAnimationFrame!="function")throw new Error("requestAnimationFrame is unavailable in this Worker");T=new st,T.update(e.video),x=it(T,e.canvas,e.options,i=>{se||F({type:"failed",message:i})},i=>F({type:"visibility",visible:i}),rt,nt);let t=0;x.addEventListener("failure",()=>t++),x.addEventListener("stats",i=>{const{dropped:s,...r}=i.detail;F({type:"stats",stats:r,filmFailure:t})}),x.scan=e.scan,x.videoTimeline=e.videoTimeline,x.enabled=e.enabled,F({type:"ready"});return}if(!T||!x)return;switch(e.type){case"frame":T.update(e.video);try{x.ingestExternalFrame(performance.now(),e.metadata,e.frame)}finally{e.frame.close(),F({type:"consumed",id:e.id})}break;case"settings":ht(x,e.options,e.retryFilm);break;case"scan":x.scan=e.scan;break;case"timeline":x.videoTimeline=e.videoTimeline;break;case"enabled":x.enabled=e.enabled;break;case"event":T.update(e.video),T.dispatchEvent(new Event(e.name));break;case"capture":T.videoWidth=e.width,T.videoHeight=e.height,x.capture().then(t=>F({type:"capture",id:e.id,image:t},[t])).catch(()=>F({type:"capture",id:e.id,image:null}));break;case"destroy":se=!0,x.destroy(),x=null,T=null,C.close();break}}catch(t){const i=t instanceof Error?t.message:String(t);F({type:"failed",message:i})}}})();
//# sourceMappingURL=worker-DrsJgm3l.js.map
