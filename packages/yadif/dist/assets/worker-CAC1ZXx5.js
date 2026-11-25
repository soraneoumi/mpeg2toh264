(function(){"use strict";const M=`#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;function N(n,e,t){const i=n.createProgram(),s=J(n,n.VERTEX_SHADER,t),r=J(n,n.FRAGMENT_SHADER,e);if(n.attachShader(i,s),n.attachShader(i,r),n.linkProgram(i),n.deleteShader(s),n.deleteShader(r),!n.getProgramParameter(i,n.LINK_STATUS)){const h=n.getProgramInfoLog(i);throw n.deleteProgram(i),new Error(`the deinterlacer failed to link: ${h??"no reason given"}`)}return i}function S(n,e,t,i=1){const s=n.createTexture();n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,s),n.texStorage2D(n.TEXTURE_2D,1,n.RGBA8,1,1),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST);const r=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,r);const h=[];for(let o=0;o<i;o++){const u=n.createTexture();n.bindTexture(n.TEXTURE_2D,u),n.texStorage2D(n.TEXTURE_2D,1,t,1,1),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+o,n.TEXTURE_2D,u,0),h.push(u)}n.drawBuffers(h.map((o,u)=>n.COLOR_ATTACHMENT0+u)),n.bindTexture(n.TEXTURE_2D,s),n.useProgram(e),n.viewport(0,0,1,1),n.drawArrays(n.TRIANGLES,0,3),n.bindFramebuffer(n.FRAMEBUFFER,null),n.deleteFramebuffer(r);for(const o of h)n.deleteTexture(o);n.deleteTexture(s)}function J(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const Te=`#version 300 es
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
`,ge=`#version 300 es
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
`;function Fe(n,e){const t=N(n,Te,ge),i=n.getAttribLocation(t,"aVertexPosition"),s=n.getAttribLocation(t,"aTextureCoord"),r=n.getUniformLocation(t,"uTexture"),h=n.getUniformLocation(t,"uMatrix"),o=n.getUniformLocation(t,"uUvMatrix"),u=n.getUniformLocation(t,"uTextColor"),c=n.getUniformLocation(t,"uBackColor");if(r==null||h==null||o==null||u==null||c==null)throw new Error("failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER");const a=n.createBuffer(),d=n.createBuffer();return{gl:n,...Re(n,e),program:t,programUniforms:{vertex:i,textureCoord:s,texture:r,matrix:h,uvMatrix:o,textColor:u,backColor:c},positionBuffer:a,textureBuffer:d}}function Re(n,e){const t=new OffscreenCanvas(0,0),i=t.getContext("2d"),s=new Map;let r=0;const h=0;let o=1;i.font=e,i.fillStyle="white";for(let c=32;c<128;c++){const a=String.fromCharCode(c),d=i.measureText(a),p=Math.ceil(d.actualBoundingBoxDescent+d.actualBoundingBoxAscent+1),l=Math.ceil(d.actualBoundingBoxLeft+d.actualBoundingBoxRight+1);s.set(a,{x:r,y:h,width:l,height:p,metrics:d}),o=Math.max(o,p),r+=l}t.width=r,t.height=o,i.font=e,i.fillStyle="white";for(const[c,a]of s)i.fillText(c,Math.floor(a.x+a.metrics.actualBoundingBoxLeft+1),Math.floor(a.metrics.actualBoundingBoxAscent+1));const u=n.createTexture();return n.bindTexture(n.TEXTURE_2D,u),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t),{fontTexture:u,chars:s,textureSize:{width:r,height:o}}}function ye(n){const e=n.gl;e.deleteBuffer(n.positionBuffer),e.deleteBuffer(n.textureBuffer),e.deleteTexture(n.fontTexture),e.deleteProgram(n.program)}function _e(n,e,t,i,s,r,h){const o=[],u=[],c=t;for(const p of e){if(p===`
`){t=c,i+=h;continue}const l=n.chars.get(p);if(l==null)continue;if(l.width===1){t+=l.metrics.width;continue}const f=Math.floor(t-l.metrics.actualBoundingBoxLeft),m=Math.floor(i-l.metrics.actualBoundingBoxAscent),b=f+l.width,T=m+l.height;o.push(f,m),u.push(l.x,l.y),o.push(f,T),u.push(l.x,l.y+l.height),o.push(f+l.width,T),u.push(l.x+l.width,l.y+l.height),o.push(b,T),u.push(l.x+l.width,l.y+l.height),o.push(f,m),u.push(l.x,l.y),o.push(b,m),u.push(l.x+l.width,l.y),t+=l.metrics.width}const a=n.gl;a.useProgram(n.program),a.bindBuffer(a.ARRAY_BUFFER,n.positionBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(o),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.vertex,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.vertex),a.bindBuffer(a.ARRAY_BUFFER,n.textureBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(u),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.textureCoord,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.textureCoord),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,n.fontTexture),a.uniform1i(n.programUniforms.texture,0),a.uniform3fv(n.programUniforms.textColor,[1,1,1]),a.uniform3fv(n.programUniforms.backColor,[0,0,0]);function d(p,l,f){const m=[];for(let b=0;b<l;b++)for(let T=0;T<p;T++)m.push(f[T*p+b]);return m}a.uniformMatrix4fv(n.programUniforms.matrix,!1,d(4,4,[1/(s/2),0,0,-1,0,-2/r,0,1,0,0,1,0,0,0,0,1])),a.uniformMatrix3fv(n.programUniforms.uvMatrix,!1,d(3,3,[1/n.textureSize.width,0,0,0,1/n.textureSize.height,0,0,0,1])),a.viewport(0,0,s,r),a.enable(a.BLEND),a.blendFunc(a.SRC_ALPHA,a.ONE_MINUS_SRC_ALPHA),a.drawArrays(a.TRIANGLES,0,o.length/2),a.disable(a.BLEND)}const E={firstRepeatsPrevious:0,secondRepeatsNext:1,secondRepeatsPrevious:2,previousSecondRepeated:3,firstRepeatsNext:4,previousFirstRepeated:5,phase:6,instant:7},k=8,y=16,X=8,Ae=15,Ne=6,Se=8,we=30,Me=.01,Pe=.002,Z=2,$=1,De=2,q=10,Ce={a:"uA",b:"uB",fieldMetrics:"uFieldMetrics",first:"uFirst",size:"uSize"},ee=16,te=8,Ie=`#version 300 es

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
  const int BLOCK_W = ${ee};
  const int BLOCK_H = ${te};

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

  float run = texelFetch(uFieldMetrics, ivec2(${E.phase}, 0), 0)[1];
  float threshold = run == 0.0 ? 0.025 : (run <= 10.0 ? 0.11 : 0.15);

  vec4 even = measure(diffEven, float(totalEven), threshold);
  vec4 odd = measure(diffOdd, float(totalOdd), threshold);
  outFirst = uFirst == 0 ? even : odd;
  outSecond = uFirst == 0 ? odd : even;
}
`,ke={second:"uSecond",first:"uFirst",size:"uSize"},U=8,Le=`#version 300 es
precision highp float;

uniform sampler2D uSecond;
uniform sampler2D uFirst;

uniform ivec2 uSize;

layout(location = 0) out vec4 outSecond;
layout(location = 1) out vec4 outFirst;

void main()
{
  ivec2 dst = ivec2(gl_FragCoord.xy);
  ivec2 base = dst * ${U};

  vec4 second = vec4(0.0);
  vec4 first = vec4(0.0);

  for (int y = 0; y < ${U}; ++y) {
    for (int x = 0; x < ${U}; ++x) {
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
`,Ue={previous:"uPrevious",second:"uSecond",first:"uFirst",comb:"uComb",size:"uSize"},Be=`#version 300 es
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
  return differing <= ${Z}.0;
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
  bool believed = run >= ${q}.0;
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
      if (texelFetch(uComb, ivec2(x, y), 0)[0] > ${X}.0) combed += 1.0;
    }
  }
  bool clean = combed <= ${Me} * float(blocks.x * blocks.y);
  score = clean ? min(score + 1.0, ${we}.0) : max(score - ${Se}.0, 0.0);
  bool on = last[3] > 0.5 ? score >= ${Ne}.0 : score >= ${Ae}.0;
  return vec4(score, clean ? 1.0 : 0.0, combed, on ? 1.0 : 0.0);
}

void main()
{
  int metric = int(gl_FragCoord.x);
  // The comparisons against the next frame become, a frame later, the ones
  // against the previous frame, and those the ones before.
  if (metric == ${E.firstRepeatsPrevious}) {
    outValue = previous(${E.firstRepeatsNext});
  } else if (metric == ${E.secondRepeatsNext}) {
    outValue = fold(uSecond);
  } else if (metric == ${E.secondRepeatsPrevious}) {
    outValue = previous(${E.secondRepeatsNext});
  } else if (metric == ${E.previousSecondRepeated}) {
    outValue = previous(${E.secondRepeatsPrevious});
  } else if (metric == ${E.firstRepeatsNext}) {
    outValue = fold(uFirst);
  } else if (metric == ${E.previousFirstRepeated}) {
    outValue = previous(${E.firstRepeatsPrevious});
  } else if (metric == ${E.instant}) {
    outValue = instant(
      previous(${E.instant}),
      previous(${E.secondRepeatsNext}),
      previous(${E.firstRepeatsNext})
    );
  } else {
    outValue = decide(
      previous(${E.phase}),
      previous(${E.firstRepeatsNext}),
      fold(uSecond),
      previous(${E.secondRepeatsNext}),
      previous(${E.secondRepeatsPrevious}),
      fold(uFirst),
      previous(${E.firstRepeatsPrevious})
    );
  }
}
`,Oe={prev:"uPrev",cur:"uCur",first:"uFirst",size:"uSize"},Ge=`#version 300 es
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
  ivec2 at = ivec2(gl_FragCoord.xy);
  int x = at.x;
  int y = 2 * at.y + 1 - uFirst;
  outValue = vec4(0.0);
  if (y >= uSize.y) return;
  float current = luma(uCur, x, y);
  float previous = luma(uPrev, x, y);
  if (abs(current - previous) <= COMB) return;
  // The first field's lines either side are the same whichever second
  // field is woven between them.
  float above = luma(uCur, x, y - 1);
  float below = luma(uCur, x, y + 1);
  outValue.r = float(combed(luma(uCur, x, y - 2), above, current, below, luma(uCur, x, y + 2)));
  outValue.g = float(combed(luma(uPrev, x, y - 2), above, previous, below, luma(uPrev, x, y + 2)));
}
`,Xe={flags:"uFlags",size:"uSize"},$e=`#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uFlags;
/** The size of the marks. */
uniform ivec2 uSize;

out vec4 outValue;

void main() {
  ivec2 block = ivec2(gl_FragCoord.xy);
  ivec2 base = block * ivec2(${y}, ${y/2});
  ivec2 end = min(base + ivec2(${y}, ${y/2}), uSize);
  vec2 count = vec2(0.0);
  for (int y = base.y; y < end.y; ++y)
    for (int x = base.x; x < end.x; ++x)
      count += texelFetch(uFlags, ivec2(x, y), 0).rg;
  outValue = vec4(count, 0.0, 0.0);
}
`,ze={prev:"uPrev",cur:"uCur",next:"uNext",size:"uSize",parity:"uParity",tff:"uTff",spatialCheck:"uSpatialCheck",debug:"uDebug",film:"uFilm",second:"uSecond",phase:"uPhase",fieldMetrics:"uFieldMetrics",comb:"uComb",combAhead:"uCombAhead",match:"uMatch",instant:"uInstant"},Ve=`#version 300 es
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
  return texelFetch(uFieldMetrics, ivec2(metric, 0), 0)[1] <= ${Z}.0;
}

/** The pulldown phase the detection gave this frame, or 0. See film-shader.ts. */
int detectedPhase() {
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${E.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${q}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${$} || phase == ${De};
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
  ivec2 block = ivec2(x / ${y}, y / ${y});
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
  return texelFetch(uFieldMetrics, ivec2(${E.instant}, 0), 0)[3] > 0.5;
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
`,P={phase:0,run:0};function B(n,e,t){return Object.fromEntries(Object.entries(t).map(([i,s])=>[i,n.getUniformLocation(e,s)]))}class ie{#t;#i;#e;#l;#v;#_;#s;#n;#u;#h;#x;#T=null;#C=null;#o=null;#a=null;#d=null;#f=null;#r=0;#m=null;#F=null;#S=0;#V=0;metrics=new Float32Array(k*4);#g=0;#E=0;constructor(e){this.#t=e,this.#i=N(e,Ie,M),this.#e=B(e,this.#i,Ce),this.#l=N(e,Le,M),this.#v=B(e,this.#l,ke),this.#_=N(e,Be,M),this.#s=B(e,this.#_,Ue),this.#n=N(e,Ge,M),this.#u=B(e,this.#n,Oe),this.#h=N(e,$e,M),this.#x=B(e,this.#h,Xe),S(e,this.#i,e.RGBA32F,2),S(e,this.#l,e.RGBA32F,2),S(e,this.#_,e.RGBA32F),S(e,this.#n,e.RG8),S(e,this.#h,e.RGBA32F)}get texture(){return this.#f?.[this.#r]?.textures[0]??null}get combTexture(){return this.#a?.textures[0]??null}get combAheadTexture(){return this.#d?.textures[0]??null}resize(e,t){e===this.#g&&t===this.#E||(this.#g=e,this.#E=t,this.#c())}reset(e=!1){const t=this.#t;t.deleteSync(this.#F),this.#F=null,this.#S=0;const i=this.#f?.[this.#r];if(!i)return;const s=e?E.instant:k,r=new Float32Array(s*4);for(let h=0;h<E.phase;h++)r[h*4+1]=1;t.bindTexture(t.TEXTURE_2D,i.textures[0]??null),t.texSubImage2D(t.TEXTURE_2D,0,0,0,s,1,t.RGBA,t.FLOAT,r)}detect(e,t,i){const s=this.#t;if(this.#g===0||this.#E===0)return;this.#A();const r=this.#T,h=this.#C,o=this.#f;if(r===null||h===null||o===null)return;const u=o[this.#r],c=o[1-this.#r];if(s.bindFramebuffer(s.FRAMEBUFFER,r.framebuffer),s.useProgram(this.#i),this.#w(0,e,this.#e.a),this.#w(1,t,this.#e.b),this.#w(2,u.textures[0],this.#e.fieldMetrics),s.uniform1i(this.#e.first,i),s.uniform2i(this.#e.size,this.#g,this.#E),s.viewport(0,0,r.width,r.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,h.framebuffer),s.useProgram(this.#l),this.#w(0,r.textures[0],this.#v.second),this.#w(1,r.textures[1],this.#v.first),s.uniform2i(this.#v.size,r.width,r.height),s.viewport(0,0,h.width,h.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,c.framebuffer),s.useProgram(this.#_),this.#w(0,u.textures[0],this.#s.previous),this.#w(1,h.textures[0],this.#s.second),this.#w(2,h.textures[1],this.#s.first),this.#w(3,this.#a?.textures[0],this.#s.comb),s.uniform2i(this.#s.size,h.width,h.height),s.viewport(0,0,k,1),s.drawArrays(s.TRIANGLES,0,3),this.#r=1-this.#r,this.#S++,this.#F!==null){s.bindFramebuffer(s.FRAMEBUFFER,null);return}this.#V=this.#S,s.bindBuffer(s.PIXEL_PACK_BUFFER,this.#m),s.readPixels(0,0,k,1,s.RGBA,s.FLOAT,0),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.FRAMEBUFFER,null),this.#F=s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE,0),s.flush()}measureComb(e,t,i,s=!1){const r=this.#t;if(this.#g===0||this.#E===0)return;this.#A();const h=s?this.#d:this.#a,o=this.#o;h===null||o===null||(r.bindFramebuffer(r.FRAMEBUFFER,o.framebuffer),r.useProgram(this.#n),this.#w(0,e,this.#u.prev),this.#w(1,t,this.#u.cur),r.uniform1i(this.#u.first,i),r.uniform2i(this.#u.size,this.#g,this.#E),r.viewport(0,0,o.width,o.height),r.drawArrays(r.TRIANGLES,0,3),r.bindFramebuffer(r.FRAMEBUFFER,h.framebuffer),r.useProgram(this.#h),this.#w(0,o.textures[0],this.#x.flags),r.uniform2i(this.#x.size,o.width,o.height),r.viewport(0,0,h.width,h.height),r.drawArrays(r.TRIANGLES,0,3),r.bindFramebuffer(r.FRAMEBUFFER,null))}poll(){const e=this.#t,t=this.#F;if(t===null||this.#m===null)return null;switch(e.clientWaitSync(t,0,0)){case e.ALREADY_SIGNALED:case e.CONDITION_SATISFIED:return e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#m),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,this.metrics),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),e.deleteSync(t),this.#F=null,{phase:this.metrics[E.phase*4]??0,run:this.metrics[E.phase*4+1]??0,instant:(this.metrics[E.instant*4+3]??0)>.5,age:this.#S-this.#V};default:return null}}destroy(){const e=this.#t;if(this.#c(),this.#f!==null){for(const t of this.#f)C(e,t);this.#f=null}e.deleteSync(this.#F),this.#F=null,e.deleteBuffer(this.#m),this.#m=null,e.deleteProgram(this.#i),e.deleteProgram(this.#l),e.deleteProgram(this.#_),e.deleteProgram(this.#n),e.deleteProgram(this.#h)}#w(e,t,i){const s=this.#t;s.activeTexture(s.TEXTURE0+e),s.bindTexture(s.TEXTURE_2D,t??null),s.uniform1i(i,e)}#c(){const e=this.#t;this.#T!==null&&C(e,this.#T),this.#C!==null&&C(e,this.#C),this.#o!==null&&C(e,this.#o),this.#a!==null&&C(e,this.#a),this.#d!==null&&C(e,this.#d),this.#T=null,this.#C=null,this.#o=null,this.#a=null,this.#d=null}#A(){const e=this.#t;if(this.#T===null||this.#C===null||this.#o===null||this.#a===null||this.#d===null){this.#c();const t=Math.ceil(this.#g/ee),i=Math.ceil(this.#E/(te*2));this.#T=D(e,t,i,2),this.#C=D(e,Math.ceil(t/U),Math.ceil(i/U),2),this.#o=D(e,this.#g,Math.ceil(this.#E/2),1,"marks"),this.#a=D(e,Math.ceil(this.#g/y),Math.ceil(this.#E/y),1),this.#d=D(e,Math.ceil(this.#g/y),Math.ceil(this.#E/y),1)}this.#f===null&&(this.#f=[D(e,k,1,1),D(e,k,1,1)],this.#r=0,this.reset()),this.#m===null&&(this.#m=e.createBuffer(),e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#m),e.bufferData(e.PIXEL_PACK_BUFFER,this.metrics.byteLength,e.STREAM_COPY),e.bindBuffer(e.PIXEL_PACK_BUFFER,null))}}function D(n,e,t,i,s="floats"){const r=s==="marks",h=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,h);const o=[];for(let a=0;a<i;a++){const d=n.createTexture();n.bindTexture(n.TEXTURE_2D,d),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texImage2D(n.TEXTURE_2D,0,r?n.RG8:n.RGBA32F,e,t,0,r?n.RG:n.RGBA,r?n.UNSIGNED_BYTE:n.FLOAT,null),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+a,n.TEXTURE_2D,d,0),o.push(d)}n.drawBuffers(o.map((a,d)=>n.COLOR_ATTACHMENT0+d));const u=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE;n.bindFramebuffer(n.FRAMEBUFFER,null);const c={framebuffer:h,textures:o,width:e,height:t};if(!u)throw C(n,c),new Error("failed to allocate framebuffer");return c}function C(n,{framebuffer:e,textures:t}){n.deleteFramebuffer(e);for(const i of t)n.deleteTexture(i)}function se(n){return Number.isInteger(n)&&n>0}function We(n){const{timestamp:e,duration:t,width:i,height:s,displayWidth:r,displayHeight:h,data:o,planes:u,matrix:c}=n;if(!Number.isFinite(e)||!(t>0)||!Number.isFinite(t))throw new TypeError(`invalid picture timing ${e}+${t}`);if(!se(i)||!se(s))throw new TypeError(`invalid picture size ${i}x${s}`);if(!(r>0)||!(h>0))throw new TypeError(`invalid display size ${r}x${h}`);if(c!=="bt709"&&c!=="bt601")throw new TypeError(`unknown matrix ${String(c)}`);if(u.length!==3)throw new TypeError("a picture has three planes");for(let a=0;a<3;a++){const d=a===0?i:Math.ceil(i/2),p=a===0?s:Math.ceil(s/2),{offset:l,stride:f}=u[a];if(!Number.isInteger(l)||l<0||!Number.isInteger(f)||f<d||l+f*(p-1)+d>o.byteLength)throw new TypeError(`plane ${a} at ${l} with stride ${f} does not fit ${d}x${p} samples in ${o.byteLength} bytes`)}}function re(n,e){const t=1-n-e;return Float32Array.of(2*(1-n),2*(1-e)*e/t,2*(1-n)*n/t,2*(1-e))}const He={bt709:re(.2126,.0722),bt601:re(.299,.114)},qe=`#version 300 es
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
`;class Ke{#t;#i;#e;#l;#v;#_;#s;#n;#u=[];#h=0;#x=0;#T=!1;constructor(e){this.#t=e,this.#i=N(e,qe,M),this.#e=e.getUniformLocation(this.#i,"uLuma"),this.#l=e.getUniformLocation(this.#i,"uCb"),this.#v=e.getUniformLocation(this.#i,"uCr"),this.#_=e.getUniformLocation(this.#i,"uInterlaced"),this.#s=e.getUniformLocation(this.#i,"uMatrix"),this.#n=e.createFramebuffer(),S(e,this.#i,e.RGBA8)}resize(e,t){const i=this.#t;for(const s of this.#u)i.deleteTexture(s);this.#u=[];for(let s=0;s<3;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texStorage2D(i.TEXTURE_2D,1,i.R8,s===0?e:Math.ceil(e/2),s===0?t:Math.ceil(t/2)),this.#u.push(r)}this.#h=e,this.#x=t,this.#T=!1}convert(e,t){const i=this.#t,s=new Uint8Array(e.data);i.pixelStorei(i.UNPACK_ALIGNMENT,1);for(let r=0;r<3;r++){const{offset:h,stride:o}=e.planes[r];i.bindTexture(i.TEXTURE_2D,this.#u[r]),i.pixelStorei(i.UNPACK_ROW_LENGTH,o),i.texSubImage2D(i.TEXTURE_2D,0,0,0,r===0?this.#h:Math.ceil(this.#h/2),r===0?this.#x:Math.ceil(this.#x/2),i.RED,i.UNSIGNED_BYTE,s,h)}if(i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.bindFramebuffer(i.FRAMEBUFFER,this.#n),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,t,0),!this.#T){if(i.checkFramebufferStatus(i.FRAMEBUFFER)!==i.FRAMEBUFFER_COMPLETE)throw i.bindFramebuffer(i.FRAMEBUFFER,null),new Error("decoded pictures cannot be drawn into RGBA8");this.#T=!0}i.useProgram(this.#i);for(let r=0;r<3;r++)i.activeTexture(i.TEXTURE0+r),i.bindTexture(i.TEXTURE_2D,this.#u[r]);i.uniform1i(this.#e,0),i.uniform1i(this.#l,1),i.uniform1i(this.#v,2),i.uniform1i(this.#_,e.interlaced?1:0),i.uniform4fv(this.#s,He[e.matrix]),i.viewport(0,0,this.#h,this.#x),i.drawArrays(i.TRIANGLES,0,3),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null)}destroy(){const e=this.#t;for(const t of this.#u)e.deleteTexture(t);this.#u=[],e.deleteFramebuffer(this.#n),e.deleteProgram(this.#i)}}const ne=250,F=4,Ye=.01,je=100,Qe=250,he=.5,w=2;class Je{#t=0;#i=Number.NaN;#e=0;#l=1;#v=!0;#_=Number.NaN;#s=0;#n=!1;#u=0;#h=0;#x=Number.NaN;#T=0;#C=new Float64Array(F);#o=0;#a=!0;#d=new Float64Array(F).fill(Number.NaN);#f=0;#r=0;#m=!1;#F=!1;#S=!1;#V=new Float64Array(3).fill(Number.NaN);#g=0;#E=Number.NaN;#w=Number.NaN;#c=Number.NaN;#A=Number.NaN;#he=!1;#ie=Number.NEGATIVE_INFINITY;at(e){return this.#v&&!Number.isNaN(this.#A)&&!Number.isNaN(this.#i)?this.#q(e):this.#i+this.#e*(e-this.#t)/1e3}#q(e){const t=this.#l,i=this.#w+t*(e-this.#c-this.#A)/1e3,s=this.#_+t*(e-this.#h)/1e3;return Math.max(this.#ie,Math.min(s,Math.max(this.#E,i)))}get rate(){return this.#e}get origin(){return this.#x}hold(){this.#a=!0,this.#i=Number.NaN,this.#e=0}observe(e,t,i,s){const r=e-this.#h;if(this.#h=e,!s||i===0||this.#a||i!==this.#l){const x=i!==0&&(!s||this.#l===0||i===this.#l);return this.#a=!1,this.#l=i,this.#P(e,t),x&&(this.#E=t),!1}const h=this.#r!==0;if(!this.#v&&!h&&this.#se(r),t===this.#_){if(this.#v)return Number.isNaN(this.#A)||(this.#he=!0),!1;if(h)return e>this.#r&&(this.#m=!0,this.#B(e,t,!0)),!1;const x=this.#Z(i),G=Number.isNaN(x)?Qe:x+r+w;return e-this.#s>G&&this.#B(e,t,!Number.isNaN(x)),!1}const o=(t-this.#_)*1e3/i,u=e-this.#s,c=u-r,a=this.#u;this.#_=t,this.#s=e,this.#u=r;const d=o<=u+a+w,p=o>=u*he&&d;if(this.#v){const x=!this.#n;if(this.#n=!0,x&&!Number.isNaN(this.#E)&&c<=w){this.#w=t,this.#c=e;const xe=this.#re();this.#A=xe>r+w?xe:Number.NaN}else this.#he&&o>=r*he&&o<=r+a+w&&(this.#ie=t);this.#S&&!x&&p&&this.#W(c,i),this.#S=!1;const G=this.#I(i,r);if(!x&&p){if(G||this.#F)return this.#m=!1,this.#K(e,t,i,r,G),!0;this.#F=!0}else if(this.#F=!1,x&&!this.#m&&G&&o>0&&d)return this.#K(e,t,i,r,!0),!0;return this.#t=e,this.#i=t,!1}if(h){if(!p)return this.#m=!0,this.#P(e,t),!1;this.#r=0,this.#m=!1}else p&&this.#W(c,i);const l=t-this.at(e);if(Math.abs(l)>je/1e3*i)return this.#x=t,this.#Q(e,t),!0;const f=this.#C;e-this.#o>=ne?(f.copyWithin(0,1),f[F-1]=l,this.#o=e):f[F-1]=Math.max(f[F-1],l);let m=f[0];for(let x=1;x<F;x++)m=Math.max(m,f[x]);const b=Ye*i*(e-this.#T)/1e3,T=Math.max(-b,Math.min(b,m));this.#T=e,this.#i+=T;for(let x=0;x<F;x++)f[x]=f[x]-T;return!1}#se(e){this.#f+=e,!(this.#f<ne)&&(this.#d.copyWithin(0,1),this.#d[F-1]=0,this.#f=0)}#K(e,t,i,s,r){Number.isNaN(this.#c)||(this.#V[this.#g++%this.#V.length]=(this.#w-t)*1e3/i+(e-this.#c)),this.#Q(e,t),r&&(this.#r=e+this.#Z(i)+s+w)}#B(e,t,i){const s=this.#s;this.#P(e,t),i&&(this.#s=s,this.#n=!0,this.#S=!0)}#W(e,t){const i=this.#d[F-1],s=e*t/1e3;this.#d[F-1]=Number.isNaN(i)?s:Math.max(i,s)}#I(e,t){let i=Number.POSITIVE_INFINITY;for(let r=0;r<F-1;r++){const h=this.#d[r];if(Number.isNaN(h))return!1;i=Math.min(i,h)}const s=i*1e3/e;return s>w&&s+w>=t}#Z(e){let t=Number.NaN;for(let s=0;s<F-1;s++){const r=this.#d[s];Number.isNaN(r)||(t=Number.isNaN(t)?r:Math.max(t,r))}if(Number.isNaN(t))return t;const i=this.#d[F-1];return Number.isNaN(i)||(t=Math.max(t,i)),t*1e3/e}#re(){const[e,t,i]=this.#V;return Number.isNaN(e)||Number.isNaN(t)||Number.isNaN(i)?Number.NaN:Math.max(Math.min(e,t),Math.min(Math.max(e,t),i))}#P(e,t){this.#E=Number.NaN,this.#w=Number.NaN,this.#c=Number.NaN,this.#A=Number.NaN,this.#he=!1,this.#ie=Number.NEGATIVE_INFINITY,this.#S=!1,this.#F=!1,this.#r=0,this.#t=e,this.#i=t,this.#e=0,this.#v=!0,this.#n=!1,this.#_=t,this.#s=e,this.#x=t}#Q(e,t){this.#c=Number.NaN,this.#A=Number.NaN,this.#r=0,this.#t=e,this.#i=t,this.#e=this.#l,this.#v=!1,this.#T=e,this.#o=e,this.#C.fill(Number.NEGATIVE_INFINITY),this.#C[F-1]=0}}const O=16,Ze=6,et=`#version 300 es
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
  ivec2 origin = ivec2(gl_FragCoord.xy) * ${O};
  vec3 difference = vec3(0.0);
  for (int y = 0; y < ${O}; y++) {
    for (int x = 0; x < ${O}; x++) {
      ivec2 at = min(origin + ivec2(x, y), last);
      difference = max(
        difference,
        abs(texelFetch(uTake, at, 0).rgb - texelFetch(uReference, at, 0).rgb)
      );
    }
  }
  fragColor = vec4(difference, 1.0);
}
`;class tt{#t;#i;#e=null;#l=null;#v=[];#_=0;#s=[];#n=new Uint8Array(0);#u=[];#h=null;#x=0;constructor(e,t){this.#t=e,this.#i=t}take(){const e=this.#t,t=this.#v.pop()??this.#a();if(t===null)return null;const i=this.#i.videoWidth,s=this.#i.videoHeight;e.bindTexture(e.TEXTURE_2D,t);try{e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#i)}catch(o){throw this.#v.push(t),o}const r={id:++this.#x,texture:t,width:i,height:s,changed:null,fence:null,buffer:null,reported:!1},h=this.#h;return h===null||h.width!==i||h.height!==s?r.changed=!0:this.#T(r,h),this.#h=r,this.#u.push(r),r.id}settle(){const e=this.#t,t=this.#u.find(i=>!i.reported);if(t===void 0||t===this.#h)return null;if(t.changed===null){const{fence:i,buffer:s}=t;if(i===null||s===null)return null;const r=e.clientWaitSync(i,0,0);if(r!==e.ALREADY_SIGNALED&&r!==e.CONDITION_SATISFIED)return null;this.#n.byteLength<s.bytes&&(this.#n=new Uint8Array(s.bytes));const h=this.#n.subarray(0,s.bytes);e.bindBuffer(e.PIXEL_PACK_BUFFER,s.buffer),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,h),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),t.changed=it(h),this.#C(t)}return t.reported=!0,{id:t.id,changed:t.changed}}adopt(e,t){const i=this.#u.findIndex(r=>r.id===e),s=this.#u[i];if(s===void 0||!s.reported)throw new Error(`picture ${e} is not available to adopt`);return this.#u.splice(i,1),this.#v.push(t),s.texture}release(e){const t=this.#u.findIndex(s=>s.id===e),i=this.#u[t];i!==void 0&&(this.#u.splice(t,1),this.#o(i))}reset(){const e=this.#u;this.#u=[],this.#h=null;for(const t of e)this.#C(t),this.#o(t)}destroy(){const e=this.#t;this.reset();for(const t of this.#v)e.deleteTexture(t);this.#v=[],this.#_=0;for(const{buffer:t}of this.#s)e.deleteBuffer(t);this.#s=[],this.#r(),this.#e!==null&&e.deleteProgram(this.#e),this.#e=null}#T(e,t){const i=this.#t,s=Math.ceil(e.width/O),r=Math.ceil(e.height/O),h=this.#f(s,r),o=this.#m(s*r*4);this.#e??=this.#d(),i.bindFramebuffer(i.FRAMEBUFFER,h.framebuffer),i.useProgram(this.#e),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,t.texture),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e.texture),i.viewport(0,0,s,r),i.drawArrays(i.TRIANGLES,0,3),i.bindBuffer(i.PIXEL_PACK_BUFFER,o.buffer),i.readPixels(0,0,s,r,i.RGBA,i.UNSIGNED_BYTE,0),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),i.bindFramebuffer(i.FRAMEBUFFER,null),e.fence=i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE,0),e.buffer=o,i.flush()}#C(e){const t=this.#t;e.fence!==null&&t.deleteSync(e.fence),e.fence=null;const i=e.buffer;if(e.buffer=null,i===null)return;const s=this.#l;s!==null&&i.bytes===s.width*s.height*4?this.#s.push(i):t.deleteBuffer(i.buffer)}#o(e){this.#v.push(e.texture)}#a(){if(this.#_===Ze)return null;const e=this.#t,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.#_++,t}#d(){const e=this.#t,t=N(e,et,M);return e.useProgram(t),e.uniform1i(e.getUniformLocation(t,"uTake"),0),e.uniform1i(e.getUniformLocation(t,"uReference"),1),t}#f(e,t){const i=this.#t,s=this.#l;if(s?.width===e&&s.height===t)return s;this.#r();for(const{buffer:u}of this.#s)i.deleteBuffer(u);this.#s=[];const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null);const h=i.createFramebuffer();i.bindFramebuffer(i.FRAMEBUFFER,h),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,r,0),i.bindFramebuffer(i.FRAMEBUFFER,null);const o={framebuffer:h,texture:r,width:e,height:t};return this.#l=o,o}#r(){const e=this.#t;this.#l!==null&&(e.deleteFramebuffer(this.#l.framebuffer),e.deleteTexture(this.#l.texture),this.#l=null)}#m(e){const t=this.#s.pop();if(t!==void 0)return t;const i=this.#t,s=i.createBuffer();return i.bindBuffer(i.PIXEL_PACK_BUFFER,s),i.bufferData(i.PIXEL_PACK_BUFFER,e,i.STREAM_COPY),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),{buffer:s,bytes:e}}}function it(n){for(let e=0;e<n.length;e+=4)if(n[e]!==0||n[e+1]!==0||n[e+2]!==0)return!0;return!1}const oe=["mozParsedFrames","mozDecodedFrames","mozPresentedFrames","mozPaintedFrames"];function st(n){return oe.every(e=>e in n)}function rt(n){return n.ownerDocument?.defaultView?.performance.timeOrigin??performance.timeOrigin}const nt=250,K=500,ht=1.75,ot=3,at=200;class ut{#t;#i;#e;#l=null;#v=[];#_=0;#s=null;#n=0;#u=null;#h=null;#x=null;#T=null;#C=null;#o=null;#a=!0;#d=null;#f=null;#r=0;#m;#F;#S=null;#V=null;#g=null;#E=null;#w=0;#c=[];#A=[];constructor(e,t){if(this.#t=e,this.#e=t,this.#i=st(e)?e:null,this.#m=this.#i===null&&typeof VideoFrame<"u",this.#F=this.#m&&e.playbackRate>1,this.#i){for(const i of["emptied","seeking","seeked"])e.addEventListener(i,this.#W);for(const i of["pause","playing","waiting","ratechange"])e.addEventListener(i,this.#B)}if(this.#m)for(const i of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])e.addEventListener(i,this.#ie)}get captureDriven(){return this.#F}request(e){if(this.#T===null){if(this.#T=e,this.#F){this.#q();return}this.#x=this.#i?requestAnimationFrame(this.#P):this.#t.requestVideoFrameCallback(this.#Z)}}cancel(){this.#x!==null&&(this.#i?cancelAnimationFrame(this.#x):this.#t.cancelVideoFrameCallback(this.#x)),this.#x=null,this.#T=null,this.#S?.(),this.#S=null,this.#g!==null&&this.#t.cancelVideoFrameCallback(this.#g),this.#g=null,this.#he(),this.#E=null,this.#c=[],this.#F=this.#m&&this.#t.playbackRate>1,this.#W()}destroy(){this.cancel();for(const e of["emptied","seeking","seeked"])this.#t.removeEventListener(e,this.#W);for(const e of["pause","playing","waiting","ratechange"])this.#t.removeEventListener(e,this.#B);for(const e of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])this.#t.removeEventListener(e,this.#ie)}flush(e){if(this.#F)for(this.#t.ownerDocument!==this.#V&&(this.#S?.(),this.#S=null,this.#q());this.#A.length>0&&this.#T!==null;){const t=this.#A.shift(),i=t.frame;try{this.#re(e,{width:i.visibleRect?.width??i.codedWidth,height:i.visibleRect?.height??i.codedHeight,mediaTime:i.timestamp/1e6,presentedFrames:t.count,expectedDisplayTime:Math.max(t.at,e),timeOrigin:performance.timeOrigin,frame:i})}finally{i.close()}}}#he(){for(const e of this.#A)e.frame.close();this.#A=[]}#ie=e=>{const t=this.#m&&this.#t.playbackRate>1;if(t!==this.#F){const i=this.#T;this.cancel(),this.#F=t,i!==null&&this.request(i);return}["seeking","seeked","emptied","ratechange"].includes(e.type)&&(this.#E=null,this.#c=[]),this.#F&&((e.type==="pause"||e.type==="ended")&&this.flush(performance.now()),this.#he(),this.#S?.(),this.#S=null,this.#T!==null&&this.#q())};#q(){if(!this.#F||this.#S!==null||this.#T===null||(this.#t.paused||this.#t.ended)&&this.#E!==null)return;this.#g===null&&typeof this.#t.requestVideoFrameCallback=="function"&&(this.#g=this.#t.requestVideoFrameCallback(this.#se));const e=Math.max(4,8/Math.max(1,this.#t.playbackRate)),t=this.#t.ownerDocument?.defaultView;if(this.#V=this.#t.ownerDocument,t){const i=t.setTimeout(this.#K,e);this.#S=()=>t.clearTimeout(i)}else{const i=setTimeout(this.#K,e);this.#S=()=>clearTimeout(i)}}#se=()=>{this.#g=null,this.#S?.(),this.#S=null,this.#K()};#K=()=>{this.#S=null;const e=this.#t;if(this.#T===null)return;if(e.readyState<2||e.seeking){this.#q();return}let t;try{t=new VideoFrame(e)}catch(i){if(!(i instanceof DOMException)||i.name!=="InvalidStateError")throw i;this.#q();return}if(t.timestamp===this.#E)t.close();else{let i=1;if(this.#E!==null){const s=t.timestamp-this.#E;if(s>1e3&&s<25e4&&(this.#c.push(s),this.#c.length>7&&this.#c.shift()),s>0&&this.#c.length>0){const r=[...this.#c].sort((o,u)=>o-u),h=r[Math.floor(r.length/2)];i=Math.max(1,Math.round(s/h))}}for(this.#E=t.timestamp,this.#w+=i,this.#A.push({frame:t,at:performance.now(),count:this.#w});this.#A.length>4;)this.#A.shift().frame.close()}this.#q()};#B=()=>{this.#d=null,this.#f=null,this.#r=0};#W=()=>{this.#C=null,this.#o=null,this.#a=!0,this.#I(),this.#B()};#I(){this.#l?.reset(),this.#v=[],this.#n=0}#Z=(e,t)=>{this.#re(e,{width:t.width,height:t.height,mediaTime:t.mediaTime,presentedFrames:t.presentedFrames,expectedDisplayTime:t.expectedDisplayTime,timeOrigin:rt(this.#t)})};#re=(e,t)=>{const i=this.#T;this.#x=null,this.#T=null,i?.(e,t)};#P=e=>{const t=this.#i,i=oe.map(u=>t[u]);this.#C?.some((u,c)=>i[c]<u)&&this.#W(),this.#C=i;const s=this.#e?.()??null;s!==this.#l&&(this.#W(),this.#l=s);const r=t.mozPaintedFrames,h=!t.seeking&&t.readyState>=2&&t.videoWidth>0&&t.videoHeight>0,o=this.#o===null&&(r>0||t.paused&&(t.mozPresentedFrames>0||t.mozDecodedFrames>0));if(s!==null){this.#pe(e,t,s,h,o);return}if(h&&(o||this.#o!==null&&r!==this.#o)){this.#d!==null&&e-this.#d>K&&(this.#B(),this.#a=!0),this.#Q(e,t),this.#d=e,this.#o=r;const u=this.#a;this.#a=!1,this.#re(e,{width:t.videoWidth,height:t.videoHeight,mediaTime:t.currentTime,presentedFrames:r,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#r,discontinuity:u}})}else this.#x=requestAnimationFrame(this.#P)};#Q(e,t){if(t.paused||t.ended)return;const i=t.mozPaintedFrames,s=this.#f;if(s&&e-s.at>=nt){const r=i-s.frames;if(r>0){const h=(e-s.at)/r;h>=4&&h<=200&&(this.#r=this.#r?this.#r+(h-this.#r)*.25:h)}this.#f=null}this.#f??={at:e,frames:i}}#pe(e,t,i,s,r){const h=t.mozPaintedFrames,o=this.#o!==null&&h!==this.#o;this.#s!==null&&e-this.#s>K&&(this.#I(),this.#B(),this.#a=!0),this.#s=e,o&&this.#Q(e,t);const u=t.paused||t.ended;(!u||o)&&(this.#n=0),u&&this.#u!==null&&(this.#u=e);const c=u&&this.#n>=ot;if(s&&(r||this.#o!==null)){this.#o=h;const l=c?null:i.take();l!==null&&this.#v.push({id:l,at:e,mediaTime:t.currentTime,width:t.videoWidth,height:t.videoHeight,resting:u})}let a=null;for(let l=i.settle();l!==null;l=i.settle()){const f=this.#v.shift();if(f?.id!==l.id)throw new Error("picture verdicts arrived out of order");let m=l.changed;if(m?this.#n=0:(this.#n=f.resting?this.#n+1:0,m=a===null&&!f.resting&&this.#u!==null&&(f.at-this.#u)*(t.playbackRate||1)>=at&&h!==this.#h),!m){i.release(f.id);continue}a!==null&&i.release(a.id),a=f}if(a===null){this.#x=requestAnimationFrame(this.#P);return}let d=1;if(this.#d!==null){const l=a.at-this.#d;l>K?(this.#B(),this.#a=!0):this.#r>0&&l>this.#r*ht&&(d=Math.round(l/this.#r))}this.#_+=d,this.#d=a.at,this.#u=a.at,this.#h=h;const p=this.#a;this.#a=!1;try{this.#re(e,{width:a.width,height:a.height,mediaTime:a.mediaTime,presentedFrames:this.#_,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#r,discontinuity:p},picture:a.id})}finally{i.release(a.id)}}}let lt=null;const Y=.5,g=4,j=5,_=j+1,ae=1e3,ue=4,z=200,ct=.25,ft=1e3/60,dt=`#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`,mt=.75,pt=.1,le=1,Et=60,vt=.02,bt=.1,V=1,xt=.02,Tt=.005,gt=250,ce=1e3,fe=16,Ft=4,Rt=90,yt=1.5,de=4,_t=24,I=.001,W=5,me=4,pe={2:0,3:.25,4:.5,5:.75};function Ee(n){return Nt[(n.interlaced?2:0)+(n.topFieldFirst?1:0)]}const At=`#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`,Nt=[{interlaced:!1,topFieldFirst:!1},{interlaced:!1,topFieldFirst:!0},{interlaced:!0,topFieldFirst:!1},{interlaced:!0,topFieldFirst:!0}],St={requestAnimationFrame:n=>requestAnimationFrame(n),cancelAnimationFrame:n=>cancelAnimationFrame(n)},wt={setTimeout:(n,e)=>setTimeout(n,e),clearTimeout:n=>clearTimeout(n)};class Mt extends EventTarget{decodedVideo;#t;#i;#e;#l;#v;#_=null;#s;#n=null;#u;#h;#x;#T;#C;#o=[];#a=[];#d=_-1;#f=null;#r=[];#m=null;#F=null;#S=Number.NEGATIVE_INFINITY;#V=0;#g=null;#E=null;#w;#c=ft;#A=0;#he=0;#ie=0;#q=0;#se=null;#K=0;#B=0;#W=0;#I(){this.#r.length=0,this.#Ve.length=0,this.#se=null,this.#K=0,this.#B=0,this.#q=0}#Z=null;#re;#P;#Q;#pe=0;#oe;#O;#L=0;#G=0;#J=0;#N=g-1;#M=0;#je=0;#Xt=0;#Qe=!1;#k=!1;#ee=0;#Ce=!1;#te=!1;#U=null;#Ie=[];#ae=!1;#bt=null;#$t;#zt;#D;#ke;#Ee;#Vt;#p=null;#R;#Je=!1;#Wt=0;#Ht=!1;#ps=0;#Ze=!1;#xt=!1;#Le=null;#Es=0;#et=new Map;#y={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0};#tt=0;#it=0;#Tt=0;#ue=0;#Re=0;#ye=0;#Ue=0;#ve=0;#Be;#gt=[];#Oe=[];#st=0;#Ge=0;#rt=0;#Xe=0;#nt=P;#$e=0;#X=P;#Y=!1;#$=0;#Ft=!1;#_e=!1;#qt=!1;#Kt=!1;#Yt=!1;#ht=!1;#ze=null;#_i="";#Rt=[0,0,0,0,0,0];#yt=0;#Ae=null;#jt=null;#Qt=0;#b=!1;#Ne=[];#Jt=!1;#H=new Je;#ot;#Ai=!1;#be=Array.from({length:g},()=>({timestamp:0,duration:0,interlaced:!0,topFieldFirst:!0,repeatFirstField:!1}));#Zt=!1;#_t=Number.NEGATIVE_INFINITY;#Se=!1;#at=!1;#Ve=[];#ei=null;#ut=Number.NEGATIVE_INFINITY;#ne=!1;#le=0;#We=0;#lt=1;#we=null;#ce=Number.NaN;#Ni=0;#fe=Number.NaN;#Si=0;#ti=Number.NaN;#ii=!0;#ct=0;#ft=0;#si=null;#At=!1;#ri=0;#ni=0;#Nt=!1;#wi=Number.NaN;#Mi=Number.NaN;#St=new Map;#vs=0;constructor(e,t={},i=null){super(),this.#e=e,this.#P=t.doubleRate??!1,this.#Q=t.spatialCheck??!0,this.#oe=t.debug??!1,this.#O=t.film??!1,this.#$t=t.onStats,this.#zt=t.onFailure,this.#D=i,this.#Ee=i?"main":t.rendering??"main",this.#Vt=t.workerUrl??lt,this.#R=this.#Ee==="main"?"main":"idle",this.#i=i?i.canvas:document.createElement("canvas"),this.#t=i?.canvas??(this.#Ee==="main"?this.#i:document.createElement("canvas")),this.#ke=e,i||(this.#i.style.cssText="position:absolute;pointer-events:none;visibility:hidden");const s=this.#t.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"});if(!(s instanceof WebGL2RenderingContext))throw new Error("this browser has no WebGL2");this.#s=s,this.#O&&(this.#Ci(),this.#n=new ie(s)),this.#u=ve(s,Ve);const r=this.#u;this.#h=Object.fromEntries(Object.entries(ze).map(([h,o])=>[h,s.getUniformLocation(r,o)])),this.#x=ve(s,At),this.#T=s.getUniformLocation(this.#x,"uField"),this.#C=s.getUniformLocation(this.#x,"uFlip"),S(s,this.#u,s.RGBA8),S(s,this.#x,s.RGBA8),this.#ot=new Ke(s),this.#xs(),this.#Be=s.getExtension("EXT_disjoint_timer_query_webgl2"),this.#t.addEventListener("webglcontextlost",this.#ms),this.#re=i?null:new ResizeObserver(()=>this.#Ye()),this.#w=i?null:new MutationObserver(()=>{this.#i.ownerDocument!==this.#E&&this.#Ye()}),this.decodedVideo={push:h=>this.#Ps(h),reset:()=>this.#Oi(),finish:()=>{this.#Jt=!0,this.#p?.postMessage({type:"pictures",action:"finish"})},onrelease:null,avDifference:()=>this.#p?this.#ti:this.#fe,startsAt:(h,o)=>{if(!Number.isFinite(h)||!Number.isFinite(o))throw new RangeError(`start at ${h} s, ${o} ms`);if(this.#p){this.#p.postMessage({type:"start",media:h,at:o,timeOrigin:performance.timeOrigin,video:this.#Me()});return}this.#we={media:h,wall:o}},rendererStatus:()=>this.#bt!==null?{state:"failed",reason:this.#bt}:{state:(this.#R==="main"?this.#Ai:this.#R==="active")?"prepared":"preparing"},onrendererstatus:null},this.#v=i?null:new tt(s,e),this.#l=new ut(e,()=>this.#R==="main"?this.#v:null),e.addEventListener("emptied",this.#ls),e.addEventListener("resize",this.#us),e.addEventListener("pause",this.#Fe),e.addEventListener("ended",this.#Fe),e.addEventListener("seeking",this.#fs),e.addEventListener("seeked",this.#Fe),e.addEventListener("ratechange",this.#Fe),e.addEventListener("waiting",this.#ds)}get running(){return this.#b?this.#k:this.#k&&(this.#U?.interlaced??!0)}get canvas(){return this.#i}get#wt(){return this.#b?this.#ii:this.#U?.topFieldFirst!==!1}#Pi(){return{doubleRate:this.#P,spatialCheck:this.#Q,film:this.#O,debug:this.#oe}}get enabled(){return this.#Ce}set enabled(e){this.#Ce=e,this.#Pt(),this.#p?.postMessage({type:"enabled",enabled:e})}set scan(e){if(this.#b)return;const t=this.#U?.interlaced!==e?.interlaced,i=t||this.#U?.topFieldFirst!==e?.topFieldFirst;this.#U=e,!(i&&(!this.#qe()||this.#U!==e))&&(this.#p?.postMessage({type:"scan",scan:e}),i&&(this.#M=0,this.#I(),this.#j(),t&&(this.#L=0),this.#f=null,this.#Te(!1)),this.#Pt(),i&&((e?.interlaced??!0)&&(this.#D||this.#R==="main")?this.#Pe():this.#di()))}get scan(){return this.#b?this.#ei?.scan??null:this.#U}set videoTimeline(e){this.#Ie=e,this.#p?.postMessage({type:"timeline",videoTimeline:e}),e.length===0&&(this.#U=null),this.#Pt()}get videoTimeline(){return this.#Ie}get container(){return this.#Z??this.#e}get doubleRate(){return this.#P}set doubleRate(e){e!==this.#P&&(this.#P=e,this.#He(),!this.#b&&(this.#I(),this.#Di()))}get spatialCheck(){return this.#Q}set spatialCheck(e){e!==this.#Q&&(this.#Q=e,this.#He())}get film(){return this.#O}set film(e){const t=this.#p?this.#jt:this.#Ae;if(!(e===this.#O&&(e===!1||t===null))){if(this.#p){this.#O=e,this.#He(e?"film":void 0);return}if(e){if(!this.#qe())return;try{this.#Ii()}catch(i){this.#O=!0,this.#He(),this.#Dt(`film detector unavailable: ${i instanceof Error?i.message:String(i)}`);return}}if(this.#O=e,this.#He(),!e){if(!this.#qe())return;this.#Y=!1,this.#$=0,this.#_e=!1,this.#X=P,this.#j(),this.#n?.destroy(),this.#n=null}this.#Di()}}get debug(){return this.#oe}set debug(e){e!==this.#oe&&(this.#oe=e,this.#He())}get#bs(){return this.#P||this.#O}#Di(){this.#te||this.#b||(this.#bs?(this.#G>0&&this.#as(),(this.#U?.interlaced??!0)&&(this.#D||this.#R==="main")&&this.#Pe()):this.#O||(this.#f=null,this.#Te(!1),this.#vt()))}#He(e){this.#p?.postMessage({type:"settings",options:this.#Pi(),retryFilm:e})}#Ci(){if(this.#s.getExtension("EXT_color_buffer_float")===null)throw new Error("film needs EXT_color_buffer_float")}#xs(){const e=this.#s,t=e.fenceSync(e.SYNC_GPU_COMMANDS_COMPLETE,0);e.flush();const i=this.#rs(),s=()=>{if(e.clientWaitSync(t,0,0)===e.TIMEOUT_EXPIRED){i.setTimeout(s,fe);return}e.deleteSync(t),this.#Ai=!0,this.#R==="main"&&this.decodedVideo.onrendererstatus?.()};i.setTimeout(s,fe)}#Mt(e){if(this.#bt=e,this.#D){this.#D.onFailure(e),this.stop();return}this.#Li(e),this.stop(),this.decodedVideo.onrendererstatus?.()}#Ii(){this.#Ci(),this.#n??=new ie(this.#s),this.#G>0&&this.#n.resize(this.#G,this.#J)}#Pt(){this.#b||this.#Ce&&(this.#Ie.length>0||(this.#U?.interlaced??!0))?this.start():this.stop()}#Ts(){return this.#D||this.#Ee==="main"?!1:this.#R==="starting"||this.#R==="active"?!0:typeof Worker<"u"&&typeof VideoFrame<"u"&&typeof OffscreenCanvas<"u"&&this.#Vt!==null&&"transferControlToOffscreen"in HTMLCanvasElement.prototype?(this.#ki(),!0):this.#Ee==="auto"?(this.#Ct(),!1):(this.#R="failed",this.#Mt("rendering in a Worker needs Worker, VideoFrame, OffscreenCanvas transfer and a worker URL, and this page lacks one"),!0)}#ki(){this.#de(),this.#p?.terminate(),this.#p=null,this.#kt(),this.#Ze=!1,this.#xt=!1,this.#jt=null,this.#Qt=0;let e=this.#i;if(this.#Ht){e=document.createElement("canvas"),e.className=this.#i.className;const r=this.#i.getAttribute("style");r===null?e.removeAttribute("style"):e.setAttribute("style",r),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e}const t=++this.#Wt;this.#R="starting",this.decodedVideo.onrendererstatus?.();let i,s;try{s=e.transferControlToOffscreen(),this.#Ht=!0,i=new Worker(this.#Vt,{type:"module"})}catch(r){this.#dt(r instanceof Error?r.message:String(r));return}this.#p=i,i.onmessage=r=>{t===this.#Wt&&this.#gs(r.data)},i.onerror=r=>{t===this.#Wt&&(r.preventDefault(),this.#dt(r.message||"the deinterlacer worker failed"))},i.postMessage({type:"initialize",canvas:s,options:this.#Pi(),scan:this.#U,videoTimeline:this.#Ie,enabled:this.#k,video:this.#Me()},[s]),this.#Nt&&i.postMessage({type:"pageVisibility",hidden:!0,video:this.#Me()})}#gs(e){switch(e.type){case"ready":this.#R="active",this.decodedVideo.onrendererstatus?.(),this.#k&&(this.#mt(),this.#Gt());break;case"failed":this.#dt(e.message);break;case"consumed":{this.#Ze=!1,this.#xt=!0;const t=this.#Le;this.#Le=null,t&&this.#Bi(t);break}case"visibility":this.#i.style.visibility=e.visible?"visible":"hidden";break;case"stats":{this.#b&&(this.#ni=e.stats.missed+e.stats.queueResetted),this.#ti=e.stats.avDifference;const t={...e.stats,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0},i=t.filmError??null,s=this.#Qt;if(this.#jt=i,this.#Qt=e.filmFailure,i!==null&&e.filmFailure!==s){this.dispatchEvent(new CustomEvent("failure",{detail:i}));try{this.#zt?.(i)}catch{}}this.dispatchEvent(new CustomEvent("stats",{detail:t})),this.#$t?.(t);break}case"capture":{const t=this.#et.get(e.id);if(this.#et.delete(e.id),!t){e.image?.close();break}e.image?t.resolve(e.image):this.#b?t.reject(new Error("no rendered picture is available")):createImageBitmap(this.#e).then(t.resolve,t.reject);break}case"release":this.#St.delete(e.id)&&this.#me(e.data);break}}#Li(e){if(this.dispatchEvent(new CustomEvent("failure",{detail:e})),!this.#D)try{this.#zt?.(e)}catch{}}#Dt(e){this.#Ae!==e&&(this.#Ae=e,this.#Y=!1,this.#$=0,this.#_e=!1,this.#X=P,this.#j(),this.#n?.destroy(),this.#n=null,this.#Li(e))}#qe(){return this.#te?!1:(this.#p||(this.#Ae=null),!0)}#dt(e){if(this.#R==="starting"&&this.#Ee==="auto"&&!this.#Je){this.#Ct();return}if(this.#Ui(e),!this.#Je){this.#Je=!0,this.#ki();return}console.error(`Deinterlacer Worker stopped: ${e}`),this.#R="failed",this.#p?.terminate(),this.#p=null,this.#de(),this.#kt(),this.#Mt(`deinterlacer worker stopped: ${e}`)}#Ct(){const e=this.#t;e.className=this.#i.className;const t=this.#i.getAttribute("style");t===null?e.removeAttribute("style"):e.setAttribute("style",t),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e,this.#Ht=!1,this.#p?.terminate(),this.#p=null,this.#R="main",this.#de(),this.#kt(),this.decodedVideo.onrendererstatus?.(),this.#k&&(this.#mt(),this.#Gt(),(this.#U?.interlaced??!0)&&this.#Pe())}#de(){this.#Le?.frame.close(),this.#Le=null}#Ui(e){for(const t of this.#et.values())t.reject(new Error(e));this.#et.clear()}start(){if(!(this.#k||this.#te||this.#bt!==null)&&(this.#ee++,this.#k=!0,this.#cs(),!!this.#qe())){if(this.#tr(),this.#Gt(),this.#Ts()){if(this.#b){this.#p?.postMessage({type:"running",running:!0}),this.#Pe();return}this.#p?.postMessage({type:"enabled",enabled:!0}),this.#R==="active"&&this.#mt();return}this.#mt(),(this.#b||(this.#U?.interlaced??!0))&&this.#Pe()}}stop(){this.#ee++,this.#k&&(this.#k=!1,this.#b&&this.#Oi(),this.#l.cancel(),this.#vi(),this.#di(),this.#M=0,this.#f=null,this.#Te(!1),this.#de(),this.#p?.postMessage(this.#b?{type:"running",running:!1}:{type:"enabled",enabled:!1}))}destroy(){if(!this.#te){this.#te=!0,this.#Ce=!1,this.stop(),this.#p?.postMessage({type:"destroy"}),this.#p?.terminate(),this.#p=null,this.#de(),this.#kt(),this.#Ui("the deinterlacer was destroyed"),this.#E?.removeEventListener("visibilitychange",this.#Ei),this.#E=null,this.#w?.disconnect(),this.#t.removeEventListener("webglcontextlost",this.#ms),this.#l.destroy(),this.#v?.destroy(),this.#e.removeEventListener("emptied",this.#ls),this.#e.removeEventListener("resize",this.#us),this.#e.removeEventListener("pause",this.#Fe),this.#e.removeEventListener("ended",this.#Fe),this.#e.removeEventListener("seeking",this.#fs),this.#e.removeEventListener("seeked",this.#Fe),this.#e.removeEventListener("ratechange",this.#Fe),this.#e.removeEventListener("waiting",this.#ds),this.#si!==null&&(this.#e.style.aspectRatio=this.#si),this.#Is(),this.#ir();for(const e of this.#o)this.#s.deleteTexture(e);this.#o=[],this.#vt();for(const e of[...this.#gt,...this.#Oe.map(({q:t})=>t)])this.#s.deleteQuery(e);this.#gt.length=0,this.#Oe.length=0,this.#n?.destroy(),this.#n=null,this.#ot?.destroy(),this.#ot=null,this.#ze!==null&&(ye(this.#ze),this.#ze=null),this.#s.deleteProgram(this.#u),this.#s.deleteProgram(this.#x),this.#s.getExtension("WEBGL_lose_context")?.loseContext()}}capture(){if(this.#R==="active"&&this.#i.style.visibility==="visible"&&this.#p){const s=++this.#Es,r=new Promise((h,o)=>{this.#et.set(s,{resolve:h,reject:o})});return this.#p.postMessage({type:"capture",id:s,width:this.#e.videoWidth,height:this.#e.videoHeight}),r}if(!this.#b&&(this.#R==="starting"||this.#R==="failed"))return createImageBitmap(this.#e);const e=this.#f;if((this.#D||this.#b)&&(!this.#k||this.#ae||!e))return Promise.reject(new Error("no rendered picture is available"));if(!this.#k||this.#ae||!e)return createImageBitmap(this.#e);e.kind==="texture"?this.#Ti(e.texture,e.flip,!1):this.#ge(e.flush,e.second,null,!1);const t=this.#b?this.#ct:this.#e.videoWidth,i=this.#b?this.#ft:this.#e.videoHeight;return t>0&&i>0&&(t!==this.#t.width||i!==this.#t.height)?createImageBitmap(this.#t,{resizeWidth:t,resizeHeight:i,resizeQuality:"high"}):createImageBitmap(this.#t)}addEventListener(e,t,i){super.addEventListener(e,t,i)}removeEventListener(e,t,i){super.removeEventListener(e,t,i)}#mt(){this.#D||!this.#k||this.#b||this.#l.request(this.#ws)}#Me(){const e=[];for(let t=0;t<this.#e.buffered.length;t++)e.push({start:this.#e.buffered.start(t),end:this.#e.buffered.end(t)});return{currentTime:this.#e.currentTime,playbackRate:this.#e.playbackRate,seeking:this.#e.seeking,paused:this.#e.paused,ended:this.#e.ended,readyState:this.#e.readyState,videoWidth:this.#e.videoWidth,videoHeight:this.#e.videoHeight,buffered:e}}#Fs(e,t,i){let s;try{s=i?.clone()??new VideoFrame(this.#e,{timestamp:Math.max(0,Math.round(t.mediaTime*1e6))})}catch(h){const o=h instanceof Error?h.message:String(h);this.#Ee==="auto"&&!this.#xt&&!this.#Je?(this.#Ct(),this.#Ut(e,t)):this.#dt(o);return}const r={id:++this.#ps,frame:s,now:e,metadata:t,video:this.#Me()};if(this.#Ze){this.#Le?.frame.close(),this.#Le=r;return}this.#Bi(r)}#Bi(e){const t=this.#p;if(!t||this.#R!=="active"){e.frame.close();return}this.#Ze=!0;const i={type:"frame",id:e.id,frame:e.frame,metadata:e.metadata,video:e.video};try{t.postMessage(i,[e.frame])}catch(s){this.#Ze=!1,e.frame.close();const r=s instanceof Error?s.message:String(s);this.#Ee==="auto"&&!this.#xt&&!this.#Je?(this.#Ct(),this.#Ut(e.now,e.metadata)):this.#dt(r)}}#Rs(e,t,i){this.#ze==null&&(this.#ze=Fe(this.#s,"20px monospace")),_e(this.#ze,e,t,i,this.#G,this.#J,20)}#It(e){if(this.#Be==null||this.#Oe.length>30)return;const t=this.#gt.pop()??this.#s.createQuery();return this.#s.beginQuery(this.#Be.TIME_ELAPSED_EXT,t),this.#Oe.push({q:t,isField:e}),t}#xe(e){this.#Be!=null&&(e!=null&&this.#s.endQuery(this.#Be.TIME_ELAPSED_EXT),this.#Oe=this.#Oe.filter(({q:t,isField:i})=>{if(this.#s.getQueryParameter(t,this.#s.QUERY_RESULT_AVAILABLE)){const s=this.#s.getQueryParameter(t,this.#s.QUERY_RESULT);return i?(this.#rt+=s,this.#Xe++):(this.#st+=s,this.#Ge++),this.#gt.push(t),!1}return!0}))}#j(e=!1){this.#X=P,this.#nt=P,this.#$e=0,e||(this.#qt=!1),this.#Y=!1,this.#n?.reset(e)}#ys(){const{prev:e,cur:t,next:i}=this.#Ri(!1),s=this.#o[e],r=this.#o[t],h=this.#o[i];if(!s||!r||!h)return;const o=this.#wt?0:1;this.#n?.measureComb(s,r,o),this.#n?.detect(r,h,o)}#_s(){const{cur:e,next:t}=this.#Ri(!1),i=this.#o[e],s=this.#o[t],r=this.#n;if(!i||!s||!r)return!1;const h=this.#wt?0:1;try{r.measureComb(i,s,h,!0)}catch(o){return this.#Dt(`film detection failed: ${o instanceof Error?o.message:String(o)}`),!1}return!0}#As(){const e=this.#n?.poll()??null;e!==null&&(this.#nt=e,this.#$e=e.age,this.#qt=e.instant),this.#$e++;const{phase:t,run:i}=this.#nt;t===0||this.#$e>Math.ceil(W*Math.max(1,this.#e.playbackRate))?this.#X=P:this.#X={phase:(t-1+this.#$e)%W+1,run:i}}#Ns(e){const t=[],i=this.#n?.metrics??new Float32Array(0);for(let r=0;r<E.phase;r++){const h=i[r*4]??0,o=i[r*4+1]??0,u=i[r*4+2]??0;t.push(`${h.toFixed(3)},${o.toString().padStart(4)},${u.toFixed(3)}`)}const s=this.#Rt.map((r,h)=>`${h===0?"-":h}:${r}`).join(" ");return`frame=${e} phase=${this.#X.phase} run=${this.#X.run} known=${this.#nt.phase}/${this.#nt.run} age=${this.#$e} ${this.#Y?"film":"video"} period=${this.#L.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#yt}`}#pt(e,t){const i=t-performance.timeOrigin;return Number.isFinite(i)&&i!==0?e+i:e}#Ss(e,t){const i=e.expectedDisplayTime;if(!Number.isFinite(i)||i<=0||!Number.isFinite(e.timeOrigin))return t;const s=this.#pt(i,e.timeOrigin),r=Ft*Math.max(this.#c,this.#L);return s<t-r||s>t+r?t:s}#ws=(e,t)=>{if(!this.#k||this.#ae)return;this.#pi();const i=this.#pt(e,t.timeOrigin),{frame:s,picture:r,...h}=t;this.#ke=s??this.#e,this.#_=r??null;try{this.#Ms(i,h,s)}finally{this.#ke=this.#e,this.#_=null}this.#mt()};#Ms(e,t,i){if(this.#R==="active"){this.#Fs(e,t,i);return}this.#R!=="starting"&&this.#Ut(e,t)}ingestExternalFrame(e,t,i){this.#ke=i;try{this.#Ut(e,t)}finally{this.#ke=this.#e}}#Ps(e){try{if(We(e),e.timestamp<this.#_t+I)throw new RangeError(`a picture at ${e.timestamp} s came after one at ${this.#_t} s; pictures come in presentation order`);this.#b||this.#Ls()}catch(s){throw this.#me(e.data),s}if(this.#_t=e.timestamp,this.#ri++,this.#Ds(e.displayWidth,e.displayHeight),!this.#k){this.#me(e.data);return}if(this.#R==="starting"||this.#R==="active"){this.#ks(e);return}const t=this.#Ne;t.push(e),this.#hi(this.#H.at(performance.now()));const i=Math.ceil(_t*Math.max(1,this.#e.playbackRate));for(;t.length>i;){const s=t.pop();this.#Lt(s.timestamp+s.duration)&&this.#y.queueResetted++,this.#me(s.data)}this.#ve=Math.max(this.#ve,t.length)}#Ds(e,t){if(!(e===this.#ct&&t===this.#ft)){if(this.#ct=e,this.#ft=t,this.#D||this.#te){this.#Ye();return}this.#si??=this.#e.style.aspectRatio,this.#e.style.aspectRatio=`${e} / ${t}`,this.#Cs(),this.#e.dispatchEvent(new Event("resize"))}}#Cs(){if(this.#At)return;this.#At=!0;const e=this.#e;Object.defineProperty(e,"videoWidth",{configurable:!0,get:()=>this.#ct}),Object.defineProperty(e,"videoHeight",{configurable:!0,get:()=>this.#ft}),Object.defineProperty(e,"getVideoPlaybackQuality",{configurable:!0,value:()=>({creationTime:performance.now(),totalVideoFrames:this.#ri,droppedVideoFrames:this.#y.missed+this.#y.queueResetted+this.#ni,corruptedVideoFrames:0})})}#Is(){if(!this.#At)return;this.#At=!1;const e=this.#e;delete e.videoWidth,delete e.videoHeight,delete e.getVideoPlaybackQuality}#ks(e){const t=++this.#vs;try{this.#p.postMessage({type:"picture",id:t,picture:e},[e.data])}catch(i){throw this.#me(e.data),i}this.#St.set(t,e.data)}#kt(){const e=[...this.#St.values()];this.#St.clear();for(const t of e)this.#me(t)}#Ls(){this.#b=!0,this.#de(),this.#l.cancel(),this.#vi(),this.#M=0,this.#I(),this.#j(),this.#f=null,this.#G=0,this.#J=0,this.#H.hold(),this.#Pt(),this.#Pe()}#me(e){const t=this.decodedVideo.onrelease;if(t!==null)try{t(e)}catch(i){queueMicrotask(()=>{throw i})}}#Oi(){if(!this.#b)return;this.#p?.postMessage({type:"pictures",action:"reset"});const e=this.#Ne;this.#Ne=[],this.#Jt=!1,this.#Zt=!1,this.#_t=Number.NEGATIVE_INFINITY,this.#ti=Number.NaN,this.#Se=!1,this.#at=!1,this.#M=0,this.#I(),this.#ut=Number.NEGATIVE_INFINITY,this.#ne=!1,this.#we=null,this.#ce=Number.NaN,this.#fe=Number.NaN,this.#j(),this.#$=0,this.#H.hold();for(const t of e)this.#me(t.data)}#hi(e){const t=this.#Ne;for(;t.length>2&&t[2].timestamp<=e;){const i=t.shift();this.#$i(i.timestamp+i.duration),this.#me(i.data)}}#Gi(e){return!(e<=this.#H.origin+I)}#Lt(e){return this.#Nt||!this.#Gi(e)?!1:!(this.#H.origin===this.#Mi&&e<=this.#wi+I)}#Xi(e){if(e===this.#Nt||(this.#Nt=e,this.#p?.postMessage({type:"pageVisibility",hidden:e,video:this.#Me()}),e))return;const t=this.#H.at(performance.now()),i=this.#e.currentTime;this.#wi=Number.isNaN(t)?i:Math.max(t,i),this.#Mi=this.#H.origin}observePageVisibility(e){this.#Xi(e)}#$i(e){this.#Lt(e)&&this.#y.missed++}#zi(e){const t=this.#e;this.#H.observe(e,t.currentTime,t.playbackRate,!t.paused&&!t.seeking&&!t.ended)&&(this.#y.resynced++,Number.isNaN(this.#ce)&&(this.#ne=!1))}observeMediaClock(e,t){this.#zi(this.#pt(e,t))}observeStart(e,t,i){this.#we={media:e,wall:this.#pt(t,i)}}#Us(){this.#F!==null&&(this.#Wi(),this.#Vi());const e=this.#rs(),t=this.#A+this.#c-de,i=e.setTimeout(()=>{this.#F=null,this.#Vi()},Math.max(0,t-performance.now()));this.#F={timers:e,handle:i}}#Vi(){performance.now()-this.#S<this.#c-de||this.#Bs()}#Wi(){const e=this.#F;e!==null&&(this.#F=null,e.timers.clearTimeout(e.handle))}#Bs(){this.#S=performance.now(),this.#p?.postMessage({type:"clock",video:this.#Me(),at:performance.now(),timeOrigin:performance.timeOrigin})}#Os(){const e=this.#e;this.#D||this.#zi(performance.now());const t=this.#A+this.#c;if(e.paused)this.#we=null,this.#ce=Number.NaN,this.#ne=!1;else if(this.#we!==null){const o=this.#we;if(t<o.wall){if(!this.#ne)return;const u=this.#lt,c=this.#ui(t,u),a=this.#ee;this.#Hi(c,u),this.#z(a)&&this.#Qi(c,u,!1);return}this.#we=null,this.#ne=!0,this.#le=o.media+(t-o.wall)*e.playbackRate/1e3,this.#We=t,this.#lt=e.playbackRate,this.#ce=t,this.#fe=Number.NaN}let i=this.#H.rate;const s=this.#H.at(t);let r;if(!Number.isNaN(this.#ce)&&(Number.isNaN(s)||!(i>0))){if(t-this.#ce>gt){this.#ce=Number.NaN,this.#ne=!1;return}i=this.#lt,r=this.#We===t?this.#le:this.#ui(t,i)}else{if(this.#ce=Number.NaN,Number.isNaN(s))return;r=e.paused?s:this.#Ws(s,i)}const h=this.#ee;this.#Hi(r,i),this.#z(h)&&this.#Qi(r,i,e.paused)}#Hi(e,t){const i=this.#ee,s=yt*this.#c*Math.max(1,t)/1e3;for(this.#hi(e);;){const u=this.#Ne[0];if(u===void 0||(this.#Se?this.#be[this.#N].timestamp:u.timestamp-u.duration)>e+s||(u.width===this.#G&&u.height===this.#J?this.#Yi():_)<this.#Gs(u))break;if(this.#Ne.shift(),this.#Xs(u,e,t),!this.#z(i))return;this.#hi(e)}if(!this.#Se||this.#at||this.#Yi()<this.#qi())return;const r=this.#be[this.#N],h=this.#Ne[0];if(h!==void 0&&h.timestamp-(r.timestamp+r.duration)<=I)return;const o=V*t/1e3;(this.#Jt||r.timestamp<=e+o)&&(this.#oi(!0,e,t),this.#at=!0)}#qi(){return this.#P&&!this.#Y?2:1}#Gs(e){const t=!e.interlaced||!this.#Ce;return(this.#Se?this.#qi():0)+(t?1:0)}#Ki(e){const t=this.#a[e];if(t===void 0)return!1;const i=this.#f;if(i?.kind==="texture"&&i.texture===t.texture)return!1;for(const s of this.#Ve)if(s.slot===e)return!1;return!0}#Yi(){let e=0;for(let t=0;t<this.#a.length;t++)this.#Ki(t)&&e++;return e}#ji(){for(let e=1;e<=_;e++){const t=(this.#d+e)%_;if(this.#Ki(t))return t}return null}#Xs(e,t,i){this.#Ni=e.duration/(e.interlaced?e.repeatFirstField?3:2:1);const s=this.#Zt?this.#be[this.#N]:null,r=s===null?0:s.timestamp+s.duration,h=e.width!==this.#G||e.height!==this.#J,o=s===null||h||e.timestamp<r-I||e.timestamp-r>Y,u=!o&&e.timestamp-r>I,c=!e.interlaced||!this.#Ce,a=this.#Se,d=this.#at;this.#Se=!1,this.#at=!1,a&&!d&&(o||c)&&!h&&this.#oi(!0,t,i),o?(s!==null&&this.#y.discontinuities++,this.#M=0,this.#j(),this.#$=0):s!==null&&!c&&s.interlaced&&s.topFieldFirst!==e.topFieldFirst&&this.#j(!0);const p=performance.now();this.#gi(p),this.#it=p;const l=this.#ee,f=this.#It(!1);try{if(h&&(this.#yi(e.width,e.height),this.#a.length!==_))throw new Error("decoded pictures have no output textures");this.#$s(e)}catch(m){this.#xe(f),this.#Mt(m instanceof Error?m.message:String(m));return}finally{this.#me(e.data)}if(c)e.interlaced||(this.#$>0&&this.#$--,this.#ht=!0),this.#zs(),this.#M=0;else{if(a&&!o&&!(d&&u)){const m=this.#be[(this.#N+g-1)%g];this.#ii=m.topFieldFirst,this.#Zi(),this.#z(l)&&this.#es(u?1:0,Math.round(m.timestamp*1e3),this.#P),this.#z(l)&&this.#oi(!1,t,i)}else this.#Yt=u;this.#ht=!1,this.#Se=!0}if(!this.#z(l)){this.#te||this.#xe(f);return}this.#xe(f),this.#Re+=performance.now()-p,this.#ue++,this.#Fi(p)}#$s(e){this.#N=(this.#N+1)%g,this.#ot.convert(e,this.#o[this.#N]);const t=this.#be[this.#N];t.timestamp=e.timestamp,t.duration=e.duration,t.interlaced=e.interlaced,t.topFieldFirst=e.topFieldFirst,t.repeatFirstField=e.repeatFirstField,this.#M=Math.min(this.#M+1,g),this.#Zt=!0}#zs(){const e=this.#be[this.#N],t=this.#ji();if(t===null){this.#y.late++;return}this.#d=t,this.#hs(this.#o[this.#N],!0,this.#a[t].framebuffer),this.#Ve.push({slot:t,time:e.timestamp,picture:e.timestamp,end:e.timestamp+e.duration,scan:Ee(e)})}#oi(e,t,i){const s=this.#be[e?this.#N:(this.#N+g-1)%g],r=this.#Ve;for(;r.length>0&&r.at(-1).picture===s.timestamp;)r.pop();this.#ii=s.topFieldFirst;const h=e?Number.POSITIVE_INFINITY:this.#be[this.#N].timestamp,o=Ee(s),u=s.timestamp+s.duration;let c=!1;if(this.#Y&&!e){const a=this.#X.phase;if(a===$){this.#yt++;return}const d=s.timestamp+(pe[a]??0)*s.duration;c=this.#ai(d,d+s.duration*W/me,h,s.timestamp,u,!1,null,e,o,t,i)!==null}else if(!this.#P)c=this.#ai(s.timestamp,h,h,s.timestamp,u,!1,null,e,o,t,i)!==null;else{const a=s.repeatFirstField?3:2,d=s.duration/a;let p=null;for(let l=0;l<a;l++){const f=s.timestamp+l*d,m=this.#ai(f,l+1<a?f+d:h,h,s.timestamp,u,l===1,l===2?p:null,e,o,t,i);l===0&&(p=m),m!==null&&(c=!0)}}!c&&h<=t&&s.timestamp>this.#ut&&this.#$i(u)}#ai(e,t,i,s,r,h,o,u,c,a,d){if(!this.#Vs(e,t,i,a,d))return e>this.#ut&&this.#Lt(t)&&this.#y.late++,null;if(o===null){if(o=this.#ji(),o===null)return this.#y.late++,null;this.#d=o,this.#ge(u,h,this.#a[o].framebuffer)}return this.#Ve.push({slot:o,time:e,picture:s,end:Number.isFinite(i)?Math.max(t,i):r,scan:c}),o}#Vs(e,t,i,s,r){if(r===0)return i>s;const h=2*V*r/1e3;if(t<=s-h)return!1;const o=this.#c*r/1e3;if(t-e+2*h>=o)return!0;const u=Math.max(0,Math.ceil((e-h-s)/o));return s+u*o<t+h}#Qi(e,t,i){const s=this.#Ve;let r=0;for(;r<s.length&&!this.#Gi(s[r].end);)r++;r>0&&s.splice(0,r);let h=0;for(;h<s.length&&s[h].time<=this.#ut;)h++;h>0&&s.splice(0,h);const o=I*(i?1:t);let u=-1;for(let a=0;a<s.length&&s[a].time<=e+o;a++)u=a;if(u<0)return;if(!i)for(let a=0;a<u;a++){const d=s[a+1].time;d<=e&&this.#Lt(d)&&this.#y.late++}const c=s[u];s.splice(0,u+1),this.#qs(c)}#Ws(e,t){const i=this.#A+this.#c,s=this.#Ji(t);if(!(t>0))return this.#ne=!1,e;if(!this.#ne)this.#ne=!0,this.#le=e,this.#lt=t,this.#fe=Number.NaN;else{this.#ui(i,t);const r=e-this.#le;Math.abs(r)>=Math.max(xt*t,s)&&(this.#le+=Math.trunc(r/s)*s)}return this.#We=i,this.#Hs(e-this.#le),this.#le}#ui(e,t){const i=Math.max(1,Math.round((e-this.#We)/this.#c));return this.#le+=i*this.#Ji(t),this.#We=e,this.#lt=t,this.#le}#Ji(e){const t=this.#c*e/1e3,i=this.#Ni;if(!(i>0))return t;const s=t/i,r=s>=1?Math.round(s):1/Math.round(1/s);return Math.abs(s/r-1)<=Tt?r*i:t}#Hs(e){const t=performance.now(),i=t-this.#Si;this.#Si=t,Number.isNaN(this.#fe)||i>ce?this.#fe=e:this.#fe+=(e-this.#fe)*i/ce}#qs(e){const t=performance.now(),i=this.#It(!0);this.#xi(e.slot),this.#xe(i),this.#Ue+=performance.now()-t,this.#ye++,this.#ei=e,this.#ut=e.time}#Ut(e,t){const i=this.#ee;if(this.#z(i)&&(this.#Ks(t.mediaTime),!!this.#z(i)&&t.width>0&&t.height>0)){let s=!1;if(!this.#Qe&&this.#e.seeking){const f=this.#e.buffered,m=this.#L>=ue?this.#L/1e3:z/1e3;for(let b=0;b<f.length;b++)if(t.mediaTime>=f.start(b)&&t.mediaTime<f.end(b)&&Math.abs(t.mediaTime-this.#e.currentTime)<=m){s=!0;break}}if(s&&(this.#Qe=!0),(this.#G===0||this.#J===0)&&this.#yi(t.width,t.height),!this.#z(i))return;if(this.#U&&!this.#U.interlaced){const f=performance.now();this.#gi(f),this.#it=f,this.#$>0&&this.#$--,this.#ht=!0,this.#Zs(),this.#Re+=performance.now()-f,this.#ue++,this.#ye++,this.#Fi(f);return}const r=t.mediaTime-this.#je,h=t.mozTiming,o=s||(h?h.discontinuity||r<0||r>Y:r<0||r>Y);o&&(this.#M=0,this.#L=0,this.#y.discontinuities++,this.#I(),this.#j(),(s||!this.#ht)&&(this.#$=0)),this.#ht=!1;const u=this.#er(t.presentedFrames,o);if(this.#M>0&&t.mediaTime===this.#je&&(!h||t.presentedFrames===this.#Xt))return;if(!o){const f=h?.periodMs??0;f>0?this.#ts(f*(this.#e.playbackRate||1)/1e3,1):this.#M>0&&r>0&&this.#ts(r,u+1)}this.#je=t.mediaTime,this.#Xt=t.presentedFrames;const c=performance.now();this.#gi(c),this.#it=c;const a=performance.now(),d=this.#It(!1);if(this.#os(),this.#Zi(),!this.#z(i)){this.#te||this.#xe(d);return}if(this.#es(u,t.presentedFrames,this.#P&&this.#Et()),!this.#z(i)){this.#te||this.#xe(d);return}const l=this.#Ss(t,e)+this.#c;if(this.#Y)if(this.#Et()){const f=this.#X.phase;if(f===$)this.#yt++,this.#q++;else{const m=this.#L*W/me,b=this.#fi(1,e,m),T=pe[f]??0,x=b||this.#se===null?l+m:l+T*this.#L;this.#Bt("film",!1,this.#li("film",x,m),m)}}else this.#ge(!1,!1,null);else if(this.#P&&this.#Et()){const f=this.#L/2,b=this.#fi(2,e,f)||this.#se===null?l+f*2:l,T=this.#li("field",b,f);this.#Bt("field",!1,T,f),this.#Bt("field",!0,T+f,f)}else if(this.#Et()){const f=this.#L,b=this.#fi(1,e,f)||this.#se===null?l+f:l;this.#Bt("frame",!1,this.#li("frame",b,f),f)||(this.#y.late++,this.#ge(!1,!1,null))}else this.#y.late+=this.#r.length,this.#I(),this.#ge(!1,!1,null);this.#ve=Math.max(this.#ve,this.#r.length),this.#xe(d),this.#Re+=performance.now()-a,this.#ue++,this.#Fi(c)}}#Zi(){if(this.#O&&!this.#Ae&&!this.#n)try{this.#Ii()}catch(e){this.#Dt(`film detector unavailable: ${e instanceof Error?e.message:String(e)}`)}}#es(e,t,i){if(this.#Ft=!1,this.#_e=!1,this.#Kt=!1,this.#O&&!this.#Ae){let s=!1;if(this.#M===g&&e===0)try{this.#As(),this.#ys(),s=!0}catch(r){this.#Dt(`film detection failed: ${r instanceof Error?r.message:String(r)}`)}else this.#j(!0);this.#Rt[this.#X.phase]=(this.#Rt[this.#X.phase]??0)+1,this.#Y=this.#X.phase!==0&&this.#X.run>=q,this.#Y?this.#$=Rt:this.#$>0&&this.#$--,this.#Ft=s&&!this.#Yt,this.#_e=this.#Ft&&this.#$>0,this.#Kt=this.#_e&&!this.#Y&&i&&this.#_s(),this.#_e&&!this.#Y&&this.#y.matched++,this.#oe&&(this.#_i=this.#Ns(t))}this.#Yt=e>0}#z(e){return!this.#te&&this.#k&&e===this.#ee}#Ks(e){const t=this.#ee;let i;for(let h=this.#Ie.length-1;h>=0;h--){const o=this.#Ie[h];if(o.start<=e+1e-6){i=o;break}}if(i?.codedSize&&(i.codedSize.width!==this.#G||i.codedSize.height!==this.#J)&&this.#yi(i.codedSize.width,i.codedSize.height),!this.#z(t))return;const s=i?.scan;if(!s||this.#U?.interlaced===s.interlaced&&this.#U.topFieldFirst===s.topFieldFirst)return;const r=this.#U?.interlaced;this.#U=s,this.#M=0,this.#I(),this.#qe()&&(r!==s.interlaced&&(this.#L=0),s.interlaced&&(this.#D||this.#R==="main")?this.#Pe():this.#di(),this.#j())}#Et(){return(this.#P||this.#O)&&this.#L>0&&this.#a.length===_}#ts(e,t){const s=e*1e3/(this.#e.playbackRate||1)/t;s<ue||s>z||(this.#L=this.#L>0&&s>this.#L*mt?this.#L+(s-this.#L)*ct:s)}#Bt(e,t,i,s){const r=this.#is();if(r===null)return!1;const h=this.#a[r];if(!h)return!1;for(this.#d=r;this.#r.length>0&&this.#r[0]?.slot===r;)this.#r.shift(),this.#y.late++;this.#ge(!1,t,h.framebuffer);const o={slot:r,at:i,duration:s,cadence:e,phase:e==="film"?this.#X.phase:e==="field"?t?2:1:0,droppedBefore:this.#q};return this.#q=0,this.#r.push(o),this.#se=o,!0}#li(e,t,i){if(!(i>0))return t;const s=this.#se,r=this.#c;if(s!==null&&s.cadence===e){const h=s.at+s.duration,o=h-t,u=Math.round(o/r),c=u-this.#K,a=o-u*r;if(u>=0&&c<=1){const d=h+Math.max(-le,Math.min(le,-a*pt));if(c===0)return this.#B=0,d;if(this.#B===0||c>0!=this.#W>0?(this.#B=0,this.#W=c):Math.abs(c)<Math.abs(this.#W)&&(this.#W=c),++this.#B<Et)return d;const p=this.#W;return this.#B=0,p<0?(this.#K+=p,d):(this.#y.resynced++,this.#ci(d-p*r))}if(u<0&&this.#K-u<=1)return this.#K-=u,this.#B=0,this.#y.resynced++,this.#ci(t)}return this.#K=0,this.#B=0,s!==null&&this.#y.resynced++,this.#ci(t)}#ci(e){for(let t=this.#r.at(-1);t&&t.at>=e;)this.#r.pop(),this.#y.late++,t=this.#r.at(-1);return e}#fi(e,t,i){const s=this.#r.at(-1),r=(j+1)*Math.max(this.#c,i);if(s&&s.at-t>r)return this.#I(),this.#y.queueResetted++,!0;const h=Math.max(0,this.#r.length+e-j);let o=0,u=0;for(;u<h;){const c=this.#r.shift();if(!c)break;o+=c.duration,u++}for(const c of this.#r)c.at-=o;return this.#y.late+=u,!1}#is(){const e=this.#f?.kind==="texture"?this.#f.texture:null,t=new Set(this.#r.map(({slot:s})=>s));for(let s=1;s<=_;s++){const r=(this.#d+s)%_,h=this.#a[r];if(h&&h.texture!==e&&!t.has(r))return r}const i=this.#r[0];if(i){const s=this.#a[i.slot];if(s&&s.texture!==e)return i.slot}return null}#Pe(){this.#m===null&&(!this.#k||this.#ae||(this.#V=0,this.#m=this.#Ke(this.#mi)))}#di(){this.#Ot(this.#m),this.#m=null,this.#Wi(),this.#I()}#mi=e=>{if(this.#m=null,!this.#k||this.#ae)return;this.#Ys(e);const t=this.#ee;if(this.#b)this.#D||this.#R==="main"?this.#Os():this.#Us();else{if(this.#l.flush(e),!this.#z(t))return;this.#R==="main"&&this.#Qs(this.#A,e)}this.#z(t)&&(this.#m=this.#Ke(this.#mi))};#Ys(e){const t=e-this.#V;this.#V=e;const i=Math.max(1,Math.round(t/this.#c)),s=this.#A+i*this.#c,r=e-s;if(this.#A===0||t<=0||t>z||Math.abs(r)>this.#c/4){t>=1&&t<=z&&(this.#c=t),this.#A=e;return}this.#c+=r/i*vt,this.#A=s+r*bt}#ss(){const e=this.#D;if(e)return{frames:e,origin:performance.timeOrigin};const t=this.#ns();return t===null?{frames:St,origin:performance.timeOrigin}:{frames:t,origin:t.performance.timeOrigin}}#Ke(e){const{frames:t,origin:i}=this.#ss(),s=t.requestAnimationFrame(r=>e(this.#pt(r,i)));return{frames:t,handle:s}}#rs(){return this.#ns()??wt}#ns(){return this.#i.ownerDocument?.defaultView??this.#e.ownerDocument?.defaultView??null}#Ot(e){e?.frames.cancelAnimationFrame(e.handle)}#pi(){if(this.#D)return;this.#js(),this.#E&&this.#Xi(this.#E.hidden);const{frames:e}=this.#ss(),t=this.#m!==null&&this.#m.frames!==e,i=this.#g!==null&&this.#g.frames!==e;!t&&!i||(this.#V=0,t&&(this.#Ot(this.#m),this.#m=this.#Ke(this.#mi)),i&&(this.#Ot(this.#g),this.#g=this.#Ke(this.#bi)))}#js(){const e=this.#D?null:this.#i.ownerDocument??null;e!==this.#E&&(this.#E?.removeEventListener("visibilitychange",this.#Ei),this.#E=e,e?.addEventListener("visibilitychange",this.#Ei),this.#w?.disconnect(),e&&this.#w?.observe(e,{childList:!0,subtree:!0}))}#Ei=()=>{this.#te||this.#pi()};#Gt(){this.#D||this.#b||this.#g!==null||!this.#l.captureDriven||!this.#k||this.#ae||(this.#g=this.#Ke(this.#bi))}#vi(){this.#Ot(this.#g),this.#g=null}#bi=e=>{if(this.#g=null,!this.#k||this.#ae)return;const t=this.#ee;this.#l.flush(e),this.#z(t)&&this.#l.captureDriven&&(this.#g=this.#Ke(this.#bi))};#Qs(e,t){const i=this.#c/2,s=u=>{const c=u.at-e;return c<=i-V?!0:c>i+V?!1:this.#he>0};for(;this.#r[1]&&s(this.#r[1]);)this.#y.late++,this.#r.shift();const r=this.#r[0];if(!r||!s(r))return;this.#r.shift(),this.#he=r.at-e;const h=performance.now(),o=this.#It(!0);this.#xi(r.slot),this.#xe(o),this.#Ue+=performance.now()-h,this.#ye++,this.#oe&&this.#Js(r,t),this.#ie=t}#Js(e,t){const i=this.#ie===0?0:t-this.#ie,s=i/this.#c,r=e.cadence==="film"?`phase ${e.phase}`:e.cadence==="field"?`field ${e.phase}`:"frame",h=e.phase===0?"duplicate":`phase ${$}`,o=e.droppedBefore>0?`, ${h} dropped before it`+(e.droppedBefore>1?` (${e.droppedBefore})`:""):"";console.log(`yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at-t).toFixed(2)} ms${o}`)}#xi(e){const t=this.#a[e];t&&this.#Ti(t.texture)}#Zs(){this.#os();const e=this.#o[this.#N];e&&this.#Ti(e,!0),this.#M=0}#Te(e){if(this.#D){this.#D.onVisibility(e);return}this.#i.style.visibility=e?"visible":"hidden"}#Ti(e,t=!1,i=!0){this.#hs(e,t,null),this.#f={kind:"texture",texture:e,flip:t},this.#Te(!0),i&&this.#pe++}#hs(e,t,i){const s=this.#s;s.bindFramebuffer(s.FRAMEBUFFER,i),s.useProgram(this.#x),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this.#T,0),s.uniform1i(this.#C,t?1:0),s.viewport(0,0,this.#G,this.#J),s.drawArrays(s.TRIANGLES,0,3)}#er(e,t){let i=0;return this.#tt!==0&&!t&&(i=Math.max(0,e-this.#tt-1),this.#y.missed+=i),this.#tt=e,i}#gi(e){e-this.#it<=ae||(this.#Tt=e,this.#ue=0,this.#Re=0,this.#ye=0,this.#Ue=0,this.#ve=0,this.#pe=0,this.#st=0,this.#Ge=0,this.#rt=0,this.#Xe=0)}#Fi(e){const t=e-this.#Tt;if(t<ae)return;const i=!this.#b&&this.#Et()&&(this.#P||this.#Y)?this.#ye:this.#ue,s=this.#ue?(this.#Re+this.#Ue)/this.#ue:0;let r;this.#Be!=null&&(r=0,this.#Ge!==0&&(r+=this.#st/1e6/this.#Ge),this.#Xe!==0&&(r+=this.#rt/1e6/this.#Xe/2));const h={...this.#y,avDifference:this.#fe,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0,fps:i*1e3/t,frameMs:s,maxQueuedFields:this.#ve,outputFps:this.#pe*1e3/t,gpuMs:r,film:this.#Y,oneInstant:this.#qt,filmError:this.#Ae};this.dispatchEvent(new CustomEvent("stats",{detail:h})),this.#$t?.(h),this.#Tt=e,this.#ue=0,this.#Re=0,this.#ye=0,this.#Ue=0,this.#ve=0,this.#pe=0,this.#st=0,this.#Ge=0,this.#rt=0,this.#Xe=0}#os(){const e=this.#s;this.#N=(this.#N+1)%g;const t=this.#_,i=this.#o[this.#N];t!==null&&this.#v!==null&&i!==void 0?(this.#o[this.#N]=this.#v.adopt(t,i),this.#_=null):(e.bindTexture(e.TEXTURE_2D,i??null),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#ke)),this.#M=Math.min(this.#M+1,g)}#ge(e,t,i,s=!0){if(this.#M===0||this.#ae)return;s&&(this.#M===g&&!e?this.#y.filtered++:this.#y.degraded++);const r=this.#s,{prev:h,cur:o,next:u}=this.#Ri(e);r.bindFramebuffer(r.FRAMEBUFFER,i),r.useProgram(this.#u);for(const[m,b]of[h,o,u].entries())r.activeTexture(r.TEXTURE0+m),r.bindTexture(r.TEXTURE_2D,this.#o[b]??null);r.uniform1i(this.#h.prev,0),r.uniform1i(this.#h.cur,1),r.uniform1i(this.#h.next,2);const c=this.#O?this.#n?.texture??null:null,a=this.#O?this.#n?.combTexture??null:null,d=c!==null&&a!==null;c!==null&&a!==null&&(r.activeTexture(r.TEXTURE0+3),r.bindTexture(r.TEXTURE_2D,c),r.uniform1i(this.#h.fieldMetrics,3),r.activeTexture(r.TEXTURE0+4),r.bindTexture(r.TEXTURE_2D,a),r.uniform1i(this.#h.comb,4));const p=this.#Kt?this.#n?.combAheadTexture??null:null,l=d&&!e;r.activeTexture(r.TEXTURE0+5),r.bindTexture(r.TEXTURE_2D,p),r.uniform1i(this.#h.combAhead,5),r.activeTexture(r.TEXTURE0),r.uniform2i(this.#h.size,this.#G,this.#J);const f=this.#wt?0:1;r.uniform1i(this.#h.parity,t?1-f:f),r.uniform1i(this.#h.tff,this.#wt?1:0),r.uniform1i(this.#h.second,t?1:0),r.uniform1i(this.#h.spatialCheck,this.#Q?1:0),r.uniform1i(this.#h.debug,this.#oe?1:0),r.uniform1i(this.#h.film,d?1:0),r.uniform1i(this.#h.match,l&&this.#_e&&(!t||p!==null)?1:0),r.uniform1i(this.#h.instant,l&&this.#Ft?1:0),r.uniform1i(this.#h.phase,this.#X.phase),r.viewport(0,0,this.#G,this.#J),r.drawArrays(r.TRIANGLES,0,3),this.#oe&&d&&this.#Rs(this.#_i,0,90),i===null&&(this.#f={kind:"yadif",flush:e,second:t},this.#Te(!0),s&&this.#pe++)}#Ri(e){const t=i=>(this.#N+g-i)%g;return this.#M===1?{prev:this.#N,cur:this.#N,next:this.#N}:e?{prev:t(1),cur:this.#N,next:this.#N}:this.#M===2?{prev:t(1),cur:t(1),next:this.#N}:{prev:t(2),cur:t(1),next:this.#N}}#Ye(){if(this.#pi(),!this.#Z)return;const e=this.#e,t=this.#b?this.#ct:e.videoWidth,i=this.#b?this.#ft:e.videoHeight;if(t===0||i===0)return;const s=Math.min(e.offsetWidth/t,e.offsetHeight/i),r=t*s,h=i*s;this.#i.style.left=`${e.offsetLeft+(e.offsetWidth-r)/2}px`,this.#i.style.top=`${e.offsetTop+(e.offsetHeight-h)/2}px`,this.#i.style.width=`${r}px`,this.#i.style.height=`${h}px`}#yi(e,t){const i=this.#s;this.#t.width=e,this.#t.height=t,this.#G=e,this.#J=t,this.#M=0,this.#$=0,this.#f=null,this.#I(),this.#Ye();for(const s of this.#o)i.deleteTexture(s);this.#o=[];for(let s=0;s<g;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null),this.#o.push(r)}this.#vt(),(this.#P||this.#O||this.#b)&&this.#as(),this.#ot?.resize(e,t),this.#n?.resize(e,t),this.#qe()}#as(){const e=this.#s;if(!(this.#a.length===_||this.#G===0)){this.#vt();for(let t=0;t<_;t++){const i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,this.#G,this.#J,0,e.RGBA,e.UNSIGNED_BYTE,null);const s=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0);const r=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!r){e.deleteFramebuffer(s),e.deleteTexture(i),this.#vt();return}this.#a.push({texture:i,framebuffer:s})}this.#d=_-1}}#vt(){const e=this.#s,t=this.#f?.kind==="texture"?this.#f.texture:null;this.#a.some(i=>i.texture===t)&&(this.#f=null),this.#ei=null;for(const{texture:i,framebuffer:s}of this.#a)e.deleteFramebuffer(s),e.deleteTexture(i);this.#a=[],this.#I()}#tr(){if(this.#Z)return;const e=this.#e.parentElement;if(!e)return;const t=document.createElement("div");t.style.cssText="position:relative;display:inline-block;line-height:0;max-width:100%",e.insertBefore(t,this.#e),t.appendChild(this.#e),t.appendChild(this.#i),this.#Z=t,this.#re?.observe(this.#e),this.#Ye()}#ir(){if(this.#D)return;const e=this.#Z;this.#Z=null,this.#re?.disconnect(),this.#i.remove(),e?.parentElement&&(e.parentElement.insertBefore(this.#e,e),e.remove())}#us=()=>this.#Ye();#De(e){return!this.#p||this.#R==="main"?!1:(this.#p.postMessage({type:"event",name:e,video:this.#Me()}),!0)}#ls=()=>{if(this.#b){this.#H.hold(),this.#De("emptied");return}if(this.#De("emptied")){this.#de(),this.#Te(!1);return}this.#M=0,this.#je=0,this.#Xt=0,this.#I(),this.#j(),this.#$=0,this.#L=0,this.#cs(),this.#f=null,this.#Te(!1)};#cs(){this.#y={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0},this.#ri=0,this.#ni=0,this.#Rt.fill(0),this.#yt=0,this.#tt=0,this.#Tt=0,this.#it=0,this.#ue=0,this.#Re=0,this.#ye=0,this.#Ue=0,this.#ve=0,this.#pe=0,this.#I(),this.#st=0,this.#Ge=0,this.#rt=0,this.#Xe=0}#fs=()=>{if(this.#b){this.#H.hold(),this.#De("seeking");return}if(this.#De("seeking")){this.#de();return}this.#Qe=!1};#Fe=e=>{if(this.#b){this.#H.hold(),e.type==="ratechange"&&this.#ne&&this.#e.playbackRate>0&&(this.#ce=this.#We),this.#De(e.type);return}if(e.type==="ratechange"&&(this.#l.captureDriven?this.#Gt():this.#vi()),(e.type==="pause"||e.type==="ended"||e.type==="seeked"||e.type==="ratechange")&&this.#De(e.type)){this.#de();return}if(e.type==="seeked"){const i=this.#Qe;if(this.#Qe=!1,i)return;this.#M=0,this.#I(),this.#j(),this.#f=null,this.#Te(!1);return}const t=e.type==="ratechange";if(t&&(this.#L=0,this.#je=this.#e.currentTime),this.#I(),this.#k&&this.#M>0){const i=this.#is(),s=i===null?void 0:this.#a[i];i!==null&&s?(this.#d=i,this.#ge(!0,!1,s.framebuffer),this.#xi(i)):this.#ge(!0,!1,null)}t&&(this.#M=0,this.#tt=0,this.#j())};#ds=()=>{this.#b&&(this.#H.hold(),this.#De("waiting"))};#ms=e=>{e.preventDefault(),!(!this.#D&&this.#R==="active")&&(this.#ae=!0,this.#Mt("the deinterlacer WebGL context was lost"))}}function Pt(n,e,t,i,s,r,h){return new Mt(n,t,{canvas:e,onFailure:i,onVisibility:s,requestAnimationFrame:r,cancelAnimationFrame:h})}function ve(n,e){const t=n.createProgram(),i=be(n,n.VERTEX_SHADER,dt),s=be(n,n.FRAGMENT_SHADER,e);if(n.attachShader(t,i),n.attachShader(t,s),n.linkProgram(t),n.deleteShader(i),n.deleteShader(s),!n.getProgramParameter(t,n.LINK_STATUS)){const r=n.getProgramInfoLog(t);throw n.deleteProgram(t),new Error(`the deinterlacer failed to link: ${r??"no reason given"}`)}return t}function be(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const L=self;class Dt extends EventTarget{currentTime=0;playbackRate=1;seeking=!1;paused=!0;ended=!1;readyState=0;videoWidth=0;videoHeight=0;parentElement=null;offsetWidth=0;offsetHeight=0;offsetLeft=0;offsetTop=0;#t=[];update(e){this.currentTime=e.currentTime,this.playbackRate=e.playbackRate,this.seeking=e.seeking,this.paused=e.paused,this.ended=e.ended,this.readyState=e.readyState,this.videoWidth=e.videoWidth,this.videoHeight=e.videoHeight,this.#t=e.buffered}get buffered(){return{length:this.#t.length,start:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.start},end:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.end}}}getVideoPlaybackQuality(){return{creationTime:performance.now(),droppedVideoFrames:0,totalVideoFrames:0,corruptedVideoFrames:0}}requestVideoFrameCallback(){return 0}cancelVideoFrameCallback(){}}let R=null,v=null,H=!1;const Q=new Map;function Ct(n){return L.requestAnimationFrame(n)}function It(n){L.cancelAnimationFrame(n)}function A(n,e=[]){L.postMessage(n,e)}function kt(n,e,t){n.doubleRate=e.doubleRate,n.spatialCheck=e.spatialCheck,(n.film!==e.film||t==="film")&&(n.film=e.film),n.debug=e.debug}L.onmessage=n=>{const e=n.data;try{if(e.type==="initialize"){if(typeof L.requestAnimationFrame!="function")throw new Error("requestAnimationFrame is unavailable in this Worker");R=new Dt,R.update(e.video),v=Pt(R,e.canvas,e.options,r=>{H||A({type:"failed",message:r})},r=>A({type:"visibility",visible:r}),Ct,It);const t=v;t.decodedVideo.onrelease=r=>{const h=Q.get(r);Q.delete(r),h!==void 0&&!H&&A({type:"release",id:h,data:r},[r])};let i=0;v.addEventListener("failure",()=>i++),v.addEventListener("stats",r=>{const{dropped:h,...o}=r.detail;A({type:"stats",stats:o,filmFailure:i})}),v.scan=e.scan,v.videoTimeline=e.videoTimeline,v.enabled=e.enabled;let s=!1;t.decodedVideo.onrendererstatus=()=>{s||t.decodedVideo.rendererStatus().state!=="prepared"||(s=!0,H||A({type:"ready"}))};return}if(!R||!v)return;switch(e.type){case"frame":R.update(e.video);try{v.ingestExternalFrame(performance.now(),e.metadata,e.frame)}finally{e.frame.close(),A({type:"consumed",id:e.id})}break;case"settings":kt(v,e.options,e.retryFilm);break;case"scan":v.scan=e.scan;break;case"timeline":v.videoTimeline=e.videoTimeline;break;case"enabled":v.enabled=e.enabled;break;case"running":e.running?v.start():v.stop();break;case"picture":Q.set(e.picture.data,e.id),v.decodedVideo.push(e.picture);break;case"pictures":e.action==="reset"?v.decodedVideo.reset():v.decodedVideo.finish();break;case"start":R.update(e.video),v.observeStart(e.media,e.at,e.timeOrigin);break;case"clock":R.update(e.video),v.observeMediaClock(e.at,e.timeOrigin);break;case"pageVisibility":R.update(e.video),v.observePageVisibility(e.hidden);break;case"event":R.update(e.video),R.dispatchEvent(new Event(e.name));break;case"capture":R.videoWidth=e.width,R.videoHeight=e.height,v.capture().then(t=>A({type:"capture",id:e.id,image:t},[t])).catch(()=>A({type:"capture",id:e.id,image:null}));break;case"destroy":H=!0,v.destroy(),v=null,R=null,L.close();break}}catch(t){const i=t instanceof Error?t.message:String(t);A({type:"failed",message:i})}}})();
//# sourceMappingURL=worker-CAC1ZXx5.js.map
