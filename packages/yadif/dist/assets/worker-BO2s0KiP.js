(function(){"use strict";const D=`#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;function w(n,e,t){const i=n.createProgram(),s=J(n,n.VERTEX_SHADER,t),r=J(n,n.FRAGMENT_SHADER,e);if(n.attachShader(i,s),n.attachShader(i,r),n.linkProgram(i),n.deleteShader(s),n.deleteShader(r),!n.getProgramParameter(i,n.LINK_STATUS)){const h=n.getProgramInfoLog(i);throw n.deleteProgram(i),new Error(`the deinterlacer failed to link: ${h??"no reason given"}`)}return i}function S(n,e,t,i=1){const s=n.createTexture();n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,s),n.texStorage2D(n.TEXTURE_2D,1,n.RGBA8,1,1),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST);const r=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,r);const h=[];for(let o=0;o<i;o++){const a=n.createTexture();n.bindTexture(n.TEXTURE_2D,a),n.texStorage2D(n.TEXTURE_2D,1,t,1,1),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+o,n.TEXTURE_2D,a,0),h.push(a)}n.drawBuffers(h.map((o,a)=>n.COLOR_ATTACHMENT0+a)),n.bindTexture(n.TEXTURE_2D,s),n.useProgram(e),n.viewport(0,0,1,1),n.drawArrays(n.TRIANGLES,0,3),n.bindFramebuffer(n.FRAMEBUFFER,null),n.deleteFramebuffer(r);for(const o of h)n.deleteTexture(o);n.deleteTexture(s)}function J(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const Te=`#version 300 es
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
`;function Fe(n,e){const t=w(n,Te,ge),i=n.getAttribLocation(t,"aVertexPosition"),s=n.getAttribLocation(t,"aTextureCoord"),r=n.getUniformLocation(t,"uTexture"),h=n.getUniformLocation(t,"uMatrix"),o=n.getUniformLocation(t,"uUvMatrix"),a=n.getUniformLocation(t,"uTextColor"),c=n.getUniformLocation(t,"uBackColor");if(r==null||h==null||o==null||a==null||c==null)throw new Error("failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER");const u=n.createBuffer(),d=n.createBuffer();return{gl:n,...Re(n,e),program:t,programUniforms:{vertex:i,textureCoord:s,texture:r,matrix:h,uvMatrix:o,textColor:a,backColor:c},positionBuffer:u,textureBuffer:d}}function Re(n,e){const t=new OffscreenCanvas(0,0),i=t.getContext("2d"),s=new Map;let r=0;const h=0;let o=1;i.font=e,i.fillStyle="white";for(let c=32;c<128;c++){const u=String.fromCharCode(c),d=i.measureText(u),p=Math.ceil(d.actualBoundingBoxDescent+d.actualBoundingBoxAscent+1),l=Math.ceil(d.actualBoundingBoxLeft+d.actualBoundingBoxRight+1);s.set(u,{x:r,y:h,width:l,height:p,metrics:d}),o=Math.max(o,p),r+=l}t.width=r,t.height=o,i.font=e,i.fillStyle="white";for(const[c,u]of s)i.fillText(c,Math.floor(u.x+u.metrics.actualBoundingBoxLeft+1),Math.floor(u.metrics.actualBoundingBoxAscent+1));const a=n.createTexture();return n.bindTexture(n.TEXTURE_2D,a),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t),{fontTexture:a,chars:s,textureSize:{width:r,height:o}}}function ye(n){const e=n.gl;e.deleteBuffer(n.positionBuffer),e.deleteBuffer(n.textureBuffer),e.deleteTexture(n.fontTexture),e.deleteProgram(n.program)}function _e(n,e,t,i,s,r,h){const o=[],a=[],c=t;for(const p of e){if(p===`
`){t=c,i+=h;continue}const l=n.chars.get(p);if(l==null)continue;if(l.width===1){t+=l.metrics.width;continue}const f=Math.floor(t-l.metrics.actualBoundingBoxLeft),m=Math.floor(i-l.metrics.actualBoundingBoxAscent),b=f+l.width,T=m+l.height;o.push(f,m),a.push(l.x,l.y),o.push(f,T),a.push(l.x,l.y+l.height),o.push(f+l.width,T),a.push(l.x+l.width,l.y+l.height),o.push(b,T),a.push(l.x+l.width,l.y+l.height),o.push(f,m),a.push(l.x,l.y),o.push(b,m),a.push(l.x+l.width,l.y),t+=l.metrics.width}const u=n.gl;u.useProgram(n.program),u.bindBuffer(u.ARRAY_BUFFER,n.positionBuffer),u.bufferData(u.ARRAY_BUFFER,new Float32Array(o),u.STATIC_DRAW),u.vertexAttribPointer(n.programUniforms.vertex,2,u.FLOAT,!1,0,0),u.enableVertexAttribArray(n.programUniforms.vertex),u.bindBuffer(u.ARRAY_BUFFER,n.textureBuffer),u.bufferData(u.ARRAY_BUFFER,new Float32Array(a),u.STATIC_DRAW),u.vertexAttribPointer(n.programUniforms.textureCoord,2,u.FLOAT,!1,0,0),u.enableVertexAttribArray(n.programUniforms.textureCoord),u.activeTexture(u.TEXTURE0),u.bindTexture(u.TEXTURE_2D,n.fontTexture),u.uniform1i(n.programUniforms.texture,0),u.uniform3fv(n.programUniforms.textColor,[1,1,1]),u.uniform3fv(n.programUniforms.backColor,[0,0,0]);function d(p,l,f){const m=[];for(let b=0;b<l;b++)for(let T=0;T<p;T++)m.push(f[T*p+b]);return m}u.uniformMatrix4fv(n.programUniforms.matrix,!1,d(4,4,[1/(s/2),0,0,-1,0,-2/r,0,1,0,0,1,0,0,0,0,1])),u.uniformMatrix3fv(n.programUniforms.uvMatrix,!1,d(3,3,[1/n.textureSize.width,0,0,0,1/n.textureSize.height,0,0,0,1])),u.viewport(0,0,s,r),u.enable(u.BLEND),u.blendFunc(u.SRC_ALPHA,u.ONE_MINUS_SRC_ALPHA),u.drawArrays(u.TRIANGLES,0,o.length/2),u.disable(u.BLEND)}const E={firstRepeatsPrevious:0,secondRepeatsNext:1,secondRepeatsPrevious:2,previousSecondRepeated:3,firstRepeatsNext:4,previousFirstRepeated:5,phase:6,instant:7},C=8,y=16,X=8,Ae=15,Ne=6,we=8,Se=30,Me=.01,Pe=.002,Z=2,G=1,De=2,q=10,Ce={a:"uA",b:"uB",fieldMetrics:"uFieldMetrics",first:"uFirst",size:"uSize"},ee=16,te=8,Ie=`#version 300 es

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
  score = clean ? min(score + 1.0, ${Se}.0) : max(score - ${we}.0, 0.0);
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
`,Oe={prev:"uPrev",cur:"uCur",first:"uFirst",size:"uSize"},Xe=`#version 300 es
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
`,Ge={prev:"uPrev",cur:"uCur",next:"uNext",size:"uSize",parity:"uParity",tff:"uTff",spatialCheck:"uSpatialCheck",debug:"uDebug",film:"uFilm",second:"uSecond",phase:"uPhase",fieldMetrics:"uFieldMetrics",comb:"uComb",combAhead:"uCombAhead",match:"uMatch",instant:"uInstant"},$e=`#version 300 es
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
  return phase == ${G} || phase == ${De};
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
`,M={phase:0,run:0};function $(n,e,t){return Object.fromEntries(Object.entries(t).map(([i,s])=>[i,n.getUniformLocation(e,s)]))}class ie{#t;#i;#e;#l;#v;#y;#s;#n;#a;#o=null;#m=null;#E=null;#D=null;#h=null;#u=0;#f=null;#c=null;#r=0;#F=0;metrics=new Float32Array(C*4);#x=0;#T=0;constructor(e){this.#t=e,this.#i=w(e,Ie,D),this.#e=$(e,this.#i,Ce),this.#l=w(e,Le,D),this.#v=$(e,this.#l,ke),this.#y=w(e,Be,D),this.#s=$(e,this.#y,Ue),this.#n=w(e,Xe,D),this.#a=$(e,this.#n,Oe),S(e,this.#i,e.RGBA32F,2),S(e,this.#l,e.RGBA32F,2),S(e,this.#y,e.RGBA32F),S(e,this.#n,e.RGBA32F)}get texture(){return this.#h?.[this.#u]?.textures[0]??null}get combTexture(){return this.#E?.textures[0]??null}get combAheadTexture(){return this.#D?.textures[0]??null}resize(e,t){e===this.#x&&t===this.#T||(this.#x=e,this.#T=t,this.#S())}reset(e=!1){const t=this.#t;t.deleteSync(this.#c),this.#c=null,this.#r=0;const i=this.#h?.[this.#u];if(!i)return;const s=e?E.instant:C,r=new Float32Array(s*4);for(let h=0;h<E.phase;h++)r[h*4+1]=1;t.bindTexture(t.TEXTURE_2D,i.textures[0]??null),t.texSubImage2D(t.TEXTURE_2D,0,0,0,s,1,t.RGBA,t.FLOAT,r)}detect(e,t,i){const s=this.#t;if(this.#x===0||this.#T===0)return;this.#N();const r=this.#o,h=this.#m,o=this.#h;if(r===null||h===null||o===null)return;const a=o[this.#u],c=o[1-this.#u];if(s.bindFramebuffer(s.FRAMEBUFFER,r.framebuffer),s.useProgram(this.#i),this.#w(0,e,this.#e.a),this.#w(1,t,this.#e.b),this.#w(2,a.textures[0],this.#e.fieldMetrics),s.uniform1i(this.#e.first,i),s.uniform2i(this.#e.size,this.#x,this.#T),s.viewport(0,0,r.width,r.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,h.framebuffer),s.useProgram(this.#l),this.#w(0,r.textures[0],this.#v.second),this.#w(1,r.textures[1],this.#v.first),s.uniform2i(this.#v.size,r.width,r.height),s.viewport(0,0,h.width,h.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,c.framebuffer),s.useProgram(this.#y),this.#w(0,a.textures[0],this.#s.previous),this.#w(1,h.textures[0],this.#s.second),this.#w(2,h.textures[1],this.#s.first),this.#w(3,this.#E?.textures[0],this.#s.comb),s.uniform2i(this.#s.size,h.width,h.height),s.viewport(0,0,C,1),s.drawArrays(s.TRIANGLES,0,3),this.#u=1-this.#u,this.#r++,this.#c!==null){s.bindFramebuffer(s.FRAMEBUFFER,null);return}this.#F=this.#r,s.bindBuffer(s.PIXEL_PACK_BUFFER,this.#f),s.readPixels(0,0,C,1,s.RGBA,s.FLOAT,0),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.FRAMEBUFFER,null),this.#c=s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE,0),s.flush()}measureComb(e,t,i,s=!1){const r=this.#t;if(this.#x===0||this.#T===0)return;this.#N();const h=s?this.#D:this.#E;h!==null&&(r.bindFramebuffer(r.FRAMEBUFFER,h.framebuffer),r.useProgram(this.#n),this.#w(0,e,this.#a.prev),this.#w(1,t,this.#a.cur),r.uniform1i(this.#a.first,i),r.uniform2i(this.#a.size,this.#x,this.#T),r.viewport(0,0,h.width,h.height),r.drawArrays(r.TRIANGLES,0,3),r.bindFramebuffer(r.FRAMEBUFFER,null))}poll(){const e=this.#t,t=this.#c;if(t===null||this.#f===null)return null;switch(e.clientWaitSync(t,0,0)){case e.ALREADY_SIGNALED:case e.CONDITION_SATISFIED:return e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#f),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,this.metrics),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),e.deleteSync(t),this.#c=null,{phase:this.metrics[E.phase*4]??0,run:this.metrics[E.phase*4+1]??0,instant:(this.metrics[E.instant*4+3]??0)>.5,age:this.#r-this.#F};default:return null}}destroy(){const e=this.#t;if(this.#S(),this.#h!==null){for(const t of this.#h)k(e,t);this.#h=null}e.deleteSync(this.#c),this.#c=null,e.deleteBuffer(this.#f),this.#f=null,e.deleteProgram(this.#i),e.deleteProgram(this.#l),e.deleteProgram(this.#y),e.deleteProgram(this.#n)}#w(e,t,i){const s=this.#t;s.activeTexture(s.TEXTURE0+e),s.bindTexture(s.TEXTURE_2D,t??null),s.uniform1i(i,e)}#S(){const e=this.#t;this.#o!==null&&k(e,this.#o),this.#m!==null&&k(e,this.#m),this.#E!==null&&k(e,this.#E),this.#D!==null&&k(e,this.#D),this.#o=null,this.#m=null,this.#E=null,this.#D=null}#N(){const e=this.#t;if(this.#o===null||this.#m===null||this.#E===null||this.#D===null){this.#S();const t=Math.ceil(this.#x/ee),i=Math.ceil(this.#T/(te*2));this.#o=I(e,t,i,2),this.#m=I(e,Math.ceil(t/U),Math.ceil(i/U),2),this.#E=I(e,Math.ceil(this.#x/y),Math.ceil(this.#T/y),1),this.#D=I(e,Math.ceil(this.#x/y),Math.ceil(this.#T/y),1)}this.#h===null&&(this.#h=[I(e,C,1,1),I(e,C,1,1)],this.#u=0,this.reset()),this.#f===null&&(this.#f=e.createBuffer(),e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#f),e.bufferData(e.PIXEL_PACK_BUFFER,this.metrics.byteLength,e.STREAM_COPY),e.bindBuffer(e.PIXEL_PACK_BUFFER,null))}}function I(n,e,t,i){const s=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,s);const r=[];for(let a=0;a<i;a++){const c=n.createTexture();n.bindTexture(n.TEXTURE_2D,c),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,e,t,0,n.RGBA,n.FLOAT,null),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+a,n.TEXTURE_2D,c,0),r.push(c)}n.drawBuffers(r.map((a,c)=>n.COLOR_ATTACHMENT0+c));const h=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE;n.bindFramebuffer(n.FRAMEBUFFER,null);const o={framebuffer:s,textures:r,width:e,height:t};if(!h)throw k(n,o),new Error("failed to allocate framebuffer");return o}function k(n,{framebuffer:e,textures:t}){n.deleteFramebuffer(e);for(const i of t)n.deleteTexture(i)}function se(n){return Number.isInteger(n)&&n>0}function ze(n){const{timestamp:e,duration:t,width:i,height:s,displayWidth:r,displayHeight:h,data:o,planes:a,matrix:c}=n;if(!Number.isFinite(e)||!(t>0)||!Number.isFinite(t))throw new TypeError(`invalid picture timing ${e}+${t}`);if(!se(i)||!se(s))throw new TypeError(`invalid picture size ${i}x${s}`);if(!(r>0)||!(h>0))throw new TypeError(`invalid display size ${r}x${h}`);if(c!=="bt709"&&c!=="bt601")throw new TypeError(`unknown matrix ${String(c)}`);if(a.length!==3)throw new TypeError("a picture has three planes");for(let u=0;u<3;u++){const d=u===0?i:Math.ceil(i/2),p=u===0?s:Math.ceil(s/2),{offset:l,stride:f}=a[u];if(!Number.isInteger(l)||l<0||!Number.isInteger(f)||f<d||l+f*(p-1)+d>o.byteLength)throw new TypeError(`plane ${u} at ${l} with stride ${f} does not fit ${d}x${p} samples in ${o.byteLength} bytes`)}}function re(n,e){const t=1-n-e;return Float32Array.of(2*(1-n),2*(1-e)*e/t,2*(1-n)*n/t,2*(1-e))}const Ve={bt709:re(.2126,.0722),bt601:re(.299,.114)},We=`#version 300 es
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
`;class He{#t;#i;#e;#l;#v;#y;#s;#n;#a=[];#o=0;#m=0;#E=!1;constructor(e){this.#t=e,this.#i=w(e,We,D),this.#e=e.getUniformLocation(this.#i,"uLuma"),this.#l=e.getUniformLocation(this.#i,"uCb"),this.#v=e.getUniformLocation(this.#i,"uCr"),this.#y=e.getUniformLocation(this.#i,"uInterlaced"),this.#s=e.getUniformLocation(this.#i,"uMatrix"),this.#n=e.createFramebuffer(),S(e,this.#i,e.RGBA8)}resize(e,t){const i=this.#t;for(const s of this.#a)i.deleteTexture(s);this.#a=[];for(let s=0;s<3;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texStorage2D(i.TEXTURE_2D,1,i.R8,s===0?e:Math.ceil(e/2),s===0?t:Math.ceil(t/2)),this.#a.push(r)}this.#o=e,this.#m=t,this.#E=!1}convert(e,t){const i=this.#t,s=new Uint8Array(e.data);i.pixelStorei(i.UNPACK_ALIGNMENT,1);for(let r=0;r<3;r++){const{offset:h,stride:o}=e.planes[r];i.bindTexture(i.TEXTURE_2D,this.#a[r]),i.pixelStorei(i.UNPACK_ROW_LENGTH,o),i.texSubImage2D(i.TEXTURE_2D,0,0,0,r===0?this.#o:Math.ceil(this.#o/2),r===0?this.#m:Math.ceil(this.#m/2),i.RED,i.UNSIGNED_BYTE,s,h)}if(i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.bindFramebuffer(i.FRAMEBUFFER,this.#n),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,t,0),!this.#E){if(i.checkFramebufferStatus(i.FRAMEBUFFER)!==i.FRAMEBUFFER_COMPLETE)throw i.bindFramebuffer(i.FRAMEBUFFER,null),new Error("decoded pictures cannot be drawn into RGBA8");this.#E=!0}i.useProgram(this.#i);for(let r=0;r<3;r++)i.activeTexture(i.TEXTURE0+r),i.bindTexture(i.TEXTURE_2D,this.#a[r]);i.uniform1i(this.#e,0),i.uniform1i(this.#l,1),i.uniform1i(this.#v,2),i.uniform1i(this.#y,e.interlaced?1:0),i.uniform4fv(this.#s,Ve[e.matrix]),i.viewport(0,0,this.#o,this.#m),i.drawArrays(i.TRIANGLES,0,3),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null)}destroy(){const e=this.#t;for(const t of this.#a)e.deleteTexture(t);this.#a=[],e.deleteFramebuffer(this.#n),e.deleteProgram(this.#i)}}const ne=250,F=4,qe=.01,Ke=100,Ye=250,he=.5,N=2;class je{#t=0;#i=Number.NaN;#e=0;#l=1;#v=!0;#y=Number.NaN;#s=0;#n=!1;#a=0;#o=0;#m=Number.NaN;#E=0;#D=new Float64Array(F);#h=0;#u=!0;#f=new Float64Array(F).fill(Number.NaN);#c=0;#r=0;#F=!1;#x=!1;#T=!1;#w=new Float64Array(3).fill(Number.NaN);#S=0;#N=Number.NaN;#j=Number.NaN;#d=Number.NaN;#M=Number.NaN;#he=!1;#ie=Number.NEGATIVE_INFINITY;at(e){return this.#v&&!Number.isNaN(this.#M)&&!Number.isNaN(this.#i)?this.#H(e):this.#i+this.#e*(e-this.#t)/1e3}#H(e){const t=this.#l,i=this.#j+t*(e-this.#d-this.#M)/1e3,s=this.#y+t*(e-this.#o)/1e3;return Math.max(this.#ie,Math.min(s,Math.max(this.#N,i)))}get rate(){return this.#e}get origin(){return this.#m}hold(){this.#u=!0,this.#i=Number.NaN,this.#e=0}observe(e,t,i,s){const r=e-this.#o;if(this.#o=e,!s||i===0||this.#u||i!==this.#l){const x=i!==0&&(!s||this.#l===0||i===this.#l);return this.#u=!1,this.#l=i,this.#P(e,t),x&&(this.#N=t),!1}const h=this.#r!==0;if(!this.#v&&!h&&this.#se(r),t===this.#y){if(this.#v)return Number.isNaN(this.#M)||(this.#he=!0),!1;if(h)return e>this.#r&&(this.#F=!0,this.#B(e,t,!0)),!1;const x=this.#Z(i),O=Number.isNaN(x)?Ye:x+r+N;return e-this.#s>O&&this.#B(e,t,!Number.isNaN(x)),!1}const o=(t-this.#y)*1e3/i,a=e-this.#s,c=a-r,u=this.#a;this.#y=t,this.#s=e,this.#a=r;const d=o<=a+u+N,p=o>=a*he&&d;if(this.#v){const x=!this.#n;if(this.#n=!0,x&&!Number.isNaN(this.#N)&&c<=N){this.#j=t,this.#d=e;const xe=this.#re();this.#M=xe>r+N?xe:Number.NaN}else this.#he&&o>=r*he&&o<=r+u+N&&(this.#ie=t);this.#T&&!x&&p&&this.#V(c,i),this.#T=!1;const O=this.#I(i,r);if(!x&&p){if(O||this.#x)return this.#F=!1,this.#q(e,t,i,r,O),!0;this.#x=!0}else if(this.#x=!1,x&&!this.#F&&O&&o>0&&d)return this.#q(e,t,i,r,!0),!0;return this.#t=e,this.#i=t,!1}if(h){if(!p)return this.#F=!0,this.#P(e,t),!1;this.#r=0,this.#F=!1}else p&&this.#V(c,i);const l=t-this.at(e);if(Math.abs(l)>Ke/1e3*i)return this.#m=t,this.#Q(e,t),!0;const f=this.#D;e-this.#h>=ne?(f.copyWithin(0,1),f[F-1]=l,this.#h=e):f[F-1]=Math.max(f[F-1],l);let m=f[0];for(let x=1;x<F;x++)m=Math.max(m,f[x]);const b=qe*i*(e-this.#E)/1e3,T=Math.max(-b,Math.min(b,m));this.#E=e,this.#i+=T;for(let x=0;x<F;x++)f[x]=f[x]-T;return!1}#se(e){this.#c+=e,!(this.#c<ne)&&(this.#f.copyWithin(0,1),this.#f[F-1]=0,this.#c=0)}#q(e,t,i,s,r){Number.isNaN(this.#d)||(this.#w[this.#S++%this.#w.length]=(this.#j-t)*1e3/i+(e-this.#d)),this.#Q(e,t),r&&(this.#r=e+this.#Z(i)+s+N)}#B(e,t,i){const s=this.#s;this.#P(e,t),i&&(this.#s=s,this.#n=!0,this.#T=!0)}#V(e,t){const i=this.#f[F-1],s=e*t/1e3;this.#f[F-1]=Number.isNaN(i)?s:Math.max(i,s)}#I(e,t){let i=Number.POSITIVE_INFINITY;for(let r=0;r<F-1;r++){const h=this.#f[r];if(Number.isNaN(h))return!1;i=Math.min(i,h)}const s=i*1e3/e;return s>N&&s+N>=t}#Z(e){let t=Number.NaN;for(let s=0;s<F-1;s++){const r=this.#f[s];Number.isNaN(r)||(t=Number.isNaN(t)?r:Math.max(t,r))}if(Number.isNaN(t))return t;const i=this.#f[F-1];return Number.isNaN(i)||(t=Math.max(t,i)),t*1e3/e}#re(){const[e,t,i]=this.#w;return Number.isNaN(e)||Number.isNaN(t)||Number.isNaN(i)?Number.NaN:Math.max(Math.min(e,t),Math.min(Math.max(e,t),i))}#P(e,t){this.#N=Number.NaN,this.#j=Number.NaN,this.#d=Number.NaN,this.#M=Number.NaN,this.#he=!1,this.#ie=Number.NEGATIVE_INFINITY,this.#T=!1,this.#x=!1,this.#r=0,this.#t=e,this.#i=t,this.#e=0,this.#v=!0,this.#n=!1,this.#y=t,this.#s=e,this.#m=t}#Q(e,t){this.#d=Number.NaN,this.#M=Number.NaN,this.#r=0,this.#t=e,this.#i=t,this.#e=this.#l,this.#v=!1,this.#E=e,this.#h=e,this.#D.fill(Number.NEGATIVE_INFINITY),this.#D[F-1]=0}}const B=16,Qe=6,Je=`#version 300 es
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
`;class Ze{#t;#i;#e=null;#l=null;#v=[];#y=0;#s=[];#n=new Uint8Array(0);#a=[];#o=null;#m=0;constructor(e,t){this.#t=e,this.#i=t}take(){const e=this.#t,t=this.#v.pop()??this.#u();if(t===null)return null;const i=this.#i.videoWidth,s=this.#i.videoHeight;e.bindTexture(e.TEXTURE_2D,t);try{e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#i)}catch(o){throw this.#v.push(t),o}const r={id:++this.#m,texture:t,width:i,height:s,changed:null,fence:null,buffer:null,reported:!1},h=this.#o;return h===null||h.width!==i||h.height!==s?r.changed=!0:this.#E(r,h),this.#o=r,this.#a.push(r),r.id}settle(){const e=this.#t,t=this.#a.find(i=>!i.reported);if(t===void 0||t===this.#o)return null;if(t.changed===null){const{fence:i,buffer:s}=t;if(i===null||s===null)return null;const r=e.clientWaitSync(i,0,0);if(r!==e.ALREADY_SIGNALED&&r!==e.CONDITION_SATISFIED)return null;this.#n.byteLength<s.bytes&&(this.#n=new Uint8Array(s.bytes));const h=this.#n.subarray(0,s.bytes);e.bindBuffer(e.PIXEL_PACK_BUFFER,s.buffer),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,h),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),t.changed=et(h),this.#D(t)}return t.reported=!0,{id:t.id,changed:t.changed}}adopt(e,t){const i=this.#a.findIndex(r=>r.id===e),s=this.#a[i];if(s===void 0||!s.reported)throw new Error(`picture ${e} is not available to adopt`);return this.#a.splice(i,1),this.#v.push(t),s.texture}release(e){const t=this.#a.findIndex(s=>s.id===e),i=this.#a[t];i!==void 0&&(this.#a.splice(t,1),this.#h(i))}reset(){const e=this.#a;this.#a=[],this.#o=null;for(const t of e)this.#D(t),this.#h(t)}destroy(){const e=this.#t;this.reset();for(const t of this.#v)e.deleteTexture(t);this.#v=[],this.#y=0;for(const{buffer:t}of this.#s)e.deleteBuffer(t);this.#s=[],this.#r(),this.#e!==null&&e.deleteProgram(this.#e),this.#e=null}#E(e,t){const i=this.#t,s=Math.ceil(e.width/B),r=Math.ceil(e.height/B),h=this.#c(s,r),o=this.#F(s*r*4);this.#e??=this.#f(),i.bindFramebuffer(i.FRAMEBUFFER,h.framebuffer),i.useProgram(this.#e),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,t.texture),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e.texture),i.viewport(0,0,s,r),i.drawArrays(i.TRIANGLES,0,3),i.bindBuffer(i.PIXEL_PACK_BUFFER,o.buffer),i.readPixels(0,0,s,r,i.RGBA,i.UNSIGNED_BYTE,0),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),i.bindFramebuffer(i.FRAMEBUFFER,null),e.fence=i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE,0),e.buffer=o,i.flush()}#D(e){const t=this.#t;e.fence!==null&&t.deleteSync(e.fence),e.fence=null;const i=e.buffer;if(e.buffer=null,i===null)return;const s=this.#l;s!==null&&i.bytes===s.width*s.height*4?this.#s.push(i):t.deleteBuffer(i.buffer)}#h(e){this.#v.push(e.texture)}#u(){if(this.#y===Qe)return null;const e=this.#t,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.#y++,t}#f(){const e=this.#t,t=w(e,Je,D);return e.useProgram(t),e.uniform1i(e.getUniformLocation(t,"uTake"),0),e.uniform1i(e.getUniformLocation(t,"uReference"),1),t}#c(e,t){const i=this.#t,s=this.#l;if(s?.width===e&&s.height===t)return s;this.#r();for(const{buffer:a}of this.#s)i.deleteBuffer(a);this.#s=[];const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null);const h=i.createFramebuffer();i.bindFramebuffer(i.FRAMEBUFFER,h),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,r,0),i.bindFramebuffer(i.FRAMEBUFFER,null);const o={framebuffer:h,texture:r,width:e,height:t};return this.#l=o,o}#r(){const e=this.#t;this.#l!==null&&(e.deleteFramebuffer(this.#l.framebuffer),e.deleteTexture(this.#l.texture),this.#l=null)}#F(e){const t=this.#s.pop();if(t!==void 0)return t;const i=this.#t,s=i.createBuffer();return i.bindBuffer(i.PIXEL_PACK_BUFFER,s),i.bufferData(i.PIXEL_PACK_BUFFER,e,i.STREAM_COPY),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),{buffer:s,bytes:e}}}function et(n){for(let e=0;e<n.length;e+=4)if(n[e]!==0||n[e+1]!==0||n[e+2]!==0)return!0;return!1}const oe=["mozParsedFrames","mozDecodedFrames","mozPresentedFrames","mozPaintedFrames"];function tt(n){return oe.every(e=>e in n)}function it(n){return n.ownerDocument?.defaultView?.performance.timeOrigin??performance.timeOrigin}const st=250,K=500,rt=1.75,nt=3,ht=200;class ot{#t;#i;#e;#l=null;#v=[];#y=0;#s=null;#n=0;#a=null;#o=null;#m=null;#E=null;#D=null;#h=null;#u=!0;#f=null;#c=null;#r=0;#F;#x;#T=null;#w=null;#S=null;#N=null;#j=0;#d=[];#M=[];constructor(e,t){if(this.#t=e,this.#e=t,this.#i=tt(e)?e:null,this.#F=this.#i===null&&typeof VideoFrame<"u",this.#x=this.#F&&e.playbackRate>1,this.#i){for(const i of["emptied","seeking","seeked"])e.addEventListener(i,this.#V);for(const i of["pause","playing","waiting","ratechange"])e.addEventListener(i,this.#B)}if(this.#F)for(const i of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])e.addEventListener(i,this.#ie)}get captureDriven(){return this.#x}request(e){if(this.#E===null){if(this.#E=e,this.#x){this.#H();return}this.#m=this.#i?requestAnimationFrame(this.#P):this.#t.requestVideoFrameCallback(this.#Z)}}cancel(){this.#m!==null&&(this.#i?cancelAnimationFrame(this.#m):this.#t.cancelVideoFrameCallback(this.#m)),this.#m=null,this.#E=null,this.#T?.(),this.#T=null,this.#S!==null&&this.#t.cancelVideoFrameCallback(this.#S),this.#S=null,this.#he(),this.#N=null,this.#d=[],this.#x=this.#F&&this.#t.playbackRate>1,this.#V()}destroy(){this.cancel();for(const e of["emptied","seeking","seeked"])this.#t.removeEventListener(e,this.#V);for(const e of["pause","playing","waiting","ratechange"])this.#t.removeEventListener(e,this.#B);for(const e of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])this.#t.removeEventListener(e,this.#ie)}flush(e){if(this.#x)for(this.#t.ownerDocument!==this.#w&&(this.#T?.(),this.#T=null,this.#H());this.#M.length>0&&this.#E!==null;){const t=this.#M.shift(),i=t.frame;try{this.#re(e,{width:i.visibleRect?.width??i.codedWidth,height:i.visibleRect?.height??i.codedHeight,mediaTime:i.timestamp/1e6,presentedFrames:t.count,expectedDisplayTime:Math.max(t.at,e),timeOrigin:performance.timeOrigin,frame:i})}finally{i.close()}}}#he(){for(const e of this.#M)e.frame.close();this.#M=[]}#ie=e=>{const t=this.#F&&this.#t.playbackRate>1;if(t!==this.#x){const i=this.#E;this.cancel(),this.#x=t,i!==null&&this.request(i);return}["seeking","seeked","emptied","ratechange"].includes(e.type)&&(this.#N=null,this.#d=[]),this.#x&&((e.type==="pause"||e.type==="ended")&&this.flush(performance.now()),this.#he(),this.#T?.(),this.#T=null,this.#E!==null&&this.#H())};#H(){if(!this.#x||this.#T!==null||this.#E===null||(this.#t.paused||this.#t.ended)&&this.#N!==null)return;this.#S===null&&typeof this.#t.requestVideoFrameCallback=="function"&&(this.#S=this.#t.requestVideoFrameCallback(this.#se));const e=Math.max(4,8/Math.max(1,this.#t.playbackRate)),t=this.#t.ownerDocument?.defaultView;if(this.#w=this.#t.ownerDocument,t){const i=t.setTimeout(this.#q,e);this.#T=()=>t.clearTimeout(i)}else{const i=setTimeout(this.#q,e);this.#T=()=>clearTimeout(i)}}#se=()=>{this.#S=null,this.#T?.(),this.#T=null,this.#q()};#q=()=>{this.#T=null;const e=this.#t;if(this.#E===null)return;if(e.readyState<2||e.seeking){this.#H();return}let t;try{t=new VideoFrame(e)}catch(i){if(!(i instanceof DOMException)||i.name!=="InvalidStateError")throw i;this.#H();return}if(t.timestamp===this.#N)t.close();else{let i=1;if(this.#N!==null){const s=t.timestamp-this.#N;if(s>1e3&&s<25e4&&(this.#d.push(s),this.#d.length>7&&this.#d.shift()),s>0&&this.#d.length>0){const r=[...this.#d].sort((o,a)=>o-a),h=r[Math.floor(r.length/2)];i=Math.max(1,Math.round(s/h))}}for(this.#N=t.timestamp,this.#j+=i,this.#M.push({frame:t,at:performance.now(),count:this.#j});this.#M.length>4;)this.#M.shift().frame.close()}this.#H()};#B=()=>{this.#f=null,this.#c=null,this.#r=0};#V=()=>{this.#D=null,this.#h=null,this.#u=!0,this.#I(),this.#B()};#I(){this.#l?.reset(),this.#v=[],this.#n=0}#Z=(e,t)=>{this.#re(e,{width:t.width,height:t.height,mediaTime:t.mediaTime,presentedFrames:t.presentedFrames,expectedDisplayTime:t.expectedDisplayTime,timeOrigin:it(this.#t)})};#re=(e,t)=>{const i=this.#E;this.#m=null,this.#E=null,i?.(e,t)};#P=e=>{const t=this.#i,i=oe.map(a=>t[a]);this.#D?.some((a,c)=>i[c]<a)&&this.#V(),this.#D=i;const s=this.#e?.()??null;s!==this.#l&&(this.#V(),this.#l=s);const r=t.mozPaintedFrames,h=!t.seeking&&t.readyState>=2&&t.videoWidth>0&&t.videoHeight>0,o=this.#h===null&&(r>0||t.paused&&(t.mozPresentedFrames>0||t.mozDecodedFrames>0));if(s!==null){this.#pe(e,t,s,h,o);return}if(h&&(o||this.#h!==null&&r!==this.#h)){this.#f!==null&&e-this.#f>K&&(this.#B(),this.#u=!0),this.#Q(e,t),this.#f=e,this.#h=r;const a=this.#u;this.#u=!1,this.#re(e,{width:t.videoWidth,height:t.videoHeight,mediaTime:t.currentTime,presentedFrames:r,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#r,discontinuity:a}})}else this.#m=requestAnimationFrame(this.#P)};#Q(e,t){if(t.paused||t.ended)return;const i=t.mozPaintedFrames,s=this.#c;if(s&&e-s.at>=st){const r=i-s.frames;if(r>0){const h=(e-s.at)/r;h>=4&&h<=200&&(this.#r=this.#r?this.#r+(h-this.#r)*.25:h)}this.#c=null}this.#c??={at:e,frames:i}}#pe(e,t,i,s,r){const h=t.mozPaintedFrames,o=this.#h!==null&&h!==this.#h;this.#s!==null&&e-this.#s>K&&(this.#I(),this.#B(),this.#u=!0),this.#s=e,o&&this.#Q(e,t);const a=t.paused||t.ended;(!a||o)&&(this.#n=0),a&&this.#a!==null&&(this.#a=e);const c=a&&this.#n>=nt;if(s&&(r||this.#h!==null)){this.#h=h;const l=c?null:i.take();l!==null&&this.#v.push({id:l,at:e,mediaTime:t.currentTime,width:t.videoWidth,height:t.videoHeight,resting:a})}let u=null;for(let l=i.settle();l!==null;l=i.settle()){const f=this.#v.shift();if(f?.id!==l.id)throw new Error("picture verdicts arrived out of order");let m=l.changed;if(m?this.#n=0:(this.#n=f.resting?this.#n+1:0,m=u===null&&!f.resting&&this.#a!==null&&(f.at-this.#a)*(t.playbackRate||1)>=ht&&h!==this.#o),!m){i.release(f.id);continue}u!==null&&i.release(u.id),u=f}if(u===null){this.#m=requestAnimationFrame(this.#P);return}let d=1;if(this.#f!==null){const l=u.at-this.#f;l>K?(this.#B(),this.#u=!0):this.#r>0&&l>this.#r*rt&&(d=Math.round(l/this.#r))}this.#y+=d,this.#f=u.at,this.#a=u.at,this.#o=h;const p=this.#u;this.#u=!1;try{this.#re(e,{width:u.width,height:u.height,mediaTime:u.mediaTime,presentedFrames:this.#y,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#r,discontinuity:p},picture:u.id})}finally{i.release(u.id)}}}let at=null;const Y=.5,g=4,j=5,_=j+1,ae=1e3,ue=4,z=200,ut=.25,lt=1e3/60,ct=`#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`,ft=.75,dt=.1,le=1,mt=60,pt=.02,Et=.1,V=1,vt=.02,bt=.005,xt=250,ce=1e3,fe=16,Tt=4,gt=90,Ft=1.5,de=4,Rt=24,P=.001,W=5,me=4,pe={2:0,3:.25,4:.5,5:.75};function Ee(n){return _t[(n.interlaced?2:0)+(n.topFieldFirst?1:0)]}const yt=`#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`,_t=[{interlaced:!1,topFieldFirst:!1},{interlaced:!1,topFieldFirst:!0},{interlaced:!0,topFieldFirst:!1},{interlaced:!0,topFieldFirst:!0}],At={requestAnimationFrame:n=>requestAnimationFrame(n),cancelAnimationFrame:n=>cancelAnimationFrame(n)},Nt={setTimeout:(n,e)=>setTimeout(n,e),clearTimeout:n=>clearTimeout(n)};class wt extends EventTarget{decodedVideo;#t;#i;#e;#l;#v;#y=null;#s;#n=null;#a;#o;#m;#E;#D;#h=[];#u=[];#f=_-1;#c=null;#r=[];#F=null;#x=null;#T=Number.NEGATIVE_INFINITY;#w=0;#S=null;#N=null;#j;#d=lt;#M=0;#he=0;#ie=0;#H=0;#se=null;#q=0;#B=0;#V=0;#I(){this.#r.length=0,this.#Ve.length=0,this.#se=null,this.#q=0,this.#B=0,this.#H=0}#Z=null;#re;#P;#Q;#pe=0;#oe;#O;#L=0;#X=0;#J=0;#_=g-1;#A=0;#je=0;#Gt=0;#Qe=!1;#k=!1;#ee=0;#De=!1;#te=!1;#U=null;#Ce=[];#ae=!1;#bt=null;#$t;#zt;#C;#Ie;#Ee;#Vt;#p=null;#g;#Je=!1;#Wt=0;#Ht=!1;#ps=0;#Ze=!1;#xt=!1;#ke=null;#Es=0;#et=new Map;#R={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0};#tt=0;#it=0;#Tt=0;#ue=0;#Fe=0;#Re=0;#Le=0;#ve=0;#Ue;#gt=[];#Be=[];#st=0;#Oe=0;#rt=0;#Xe=0;#nt=M;#Ge=0;#G=M;#K=!1;#$=0;#Ft=!1;#ye=!1;#qt=!1;#Kt=!1;#Yt=!1;#ht=!1;#$e=null;#_i="";#Rt=[0,0,0,0,0,0];#yt=0;#_e=null;#jt=null;#Qt=0;#b=!1;#Ae=[];#Jt=!1;#W=new je;#ot;#Ai=!1;#Ne=Array.from({length:g},()=>({timestamp:0,duration:0,interlaced:!0,topFieldFirst:!0,repeatFirstField:!1}));#Zt=!1;#_t=Number.NEGATIVE_INFINITY;#ze=!1;#at=!1;#Ve=[];#ei=null;#ut=Number.NEGATIVE_INFINITY;#ne=!1;#le=0;#We=0;#lt=1;#we=null;#ce=Number.NaN;#Ni=0;#fe=Number.NaN;#wi=0;#ti=Number.NaN;#ii=!0;#ct=0;#ft=0;#si=null;#At=!1;#ri=0;#ni=0;#Nt=!1;#Si=Number.NaN;#Mi=Number.NaN;#wt=new Map;#vs=0;constructor(e,t={},i=null){super(),this.#e=e,this.#P=t.doubleRate??!1,this.#Q=t.spatialCheck??!0,this.#oe=t.debug??!1,this.#O=t.film??!1,this.#$t=t.onStats,this.#zt=t.onFailure,this.#C=i,this.#Ee=i?"main":t.rendering??"main",this.#Vt=t.workerUrl??at,this.#g=this.#Ee==="main"?"main":"idle",this.#i=i?i.canvas:document.createElement("canvas"),this.#t=i?.canvas??(this.#Ee==="main"?this.#i:document.createElement("canvas")),this.#Ie=e,i||(this.#i.style.cssText="position:absolute;pointer-events:none;visibility:hidden");const s=this.#t.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"});if(!(s instanceof WebGL2RenderingContext))throw new Error("this browser has no WebGL2");this.#s=s,this.#O&&(this.#Ci(),this.#n=new ie(s)),this.#a=ve(s,$e);const r=this.#a;this.#o=Object.fromEntries(Object.entries(Ge).map(([h,o])=>[h,s.getUniformLocation(r,o)])),this.#m=ve(s,yt),this.#E=s.getUniformLocation(this.#m,"uField"),this.#D=s.getUniformLocation(this.#m,"uFlip"),S(s,this.#a,s.RGBA8),S(s,this.#m,s.RGBA8),this.#ot=new He(s),this.#xs(),this.#Ue=s.getExtension("EXT_disjoint_timer_query_webgl2"),this.#t.addEventListener("webglcontextlost",this.#ms),this.#re=i?null:new ResizeObserver(()=>this.#Ye()),this.#j=i?null:new MutationObserver(()=>{this.#i.ownerDocument!==this.#N&&this.#Ye()}),this.decodedVideo={push:h=>this.#Ps(h),reset:()=>this.#Oi(),finish:()=>{this.#Jt=!0,this.#p?.postMessage({type:"pictures",action:"finish"})},onrelease:null,avDifference:()=>this.#p?this.#ti:this.#fe,startsAt:(h,o)=>{if(!Number.isFinite(h)||!Number.isFinite(o))throw new RangeError(`start at ${h} s, ${o} ms`);if(this.#p){this.#p.postMessage({type:"start",media:h,at:o,timeOrigin:performance.timeOrigin,video:this.#Se()});return}this.#we={media:h,wall:o}},rendererStatus:()=>this.#bt!==null?{state:"failed",reason:this.#bt}:{state:(this.#g==="main"?this.#Ai:this.#g==="active")?"prepared":"preparing"},onrendererstatus:null},this.#v=i?null:new Ze(s,e),this.#l=new ot(e,()=>this.#g==="main"?this.#v:null),e.addEventListener("emptied",this.#ls),e.addEventListener("resize",this.#us),e.addEventListener("pause",this.#ge),e.addEventListener("ended",this.#ge),e.addEventListener("seeking",this.#fs),e.addEventListener("seeked",this.#ge),e.addEventListener("ratechange",this.#ge),e.addEventListener("waiting",this.#ds)}get running(){return this.#b?this.#k:this.#k&&(this.#U?.interlaced??!0)}get canvas(){return this.#i}get#St(){return this.#b?this.#ii:this.#U?.topFieldFirst!==!1}#Pi(){return{doubleRate:this.#P,spatialCheck:this.#Q,film:this.#O,debug:this.#oe}}get enabled(){return this.#De}set enabled(e){this.#De=e,this.#Pt(),this.#p?.postMessage({type:"enabled",enabled:e})}set scan(e){if(this.#b)return;const t=this.#U?.interlaced!==e?.interlaced,i=t||this.#U?.topFieldFirst!==e?.topFieldFirst;this.#U=e,!(i&&(!this.#qe()||this.#U!==e))&&(this.#p?.postMessage({type:"scan",scan:e}),i&&(this.#A=0,this.#I(),this.#Y(),t&&(this.#L=0),this.#c=null,this.#xe(!1)),this.#Pt(),i&&((e?.interlaced??!0)&&(this.#C||this.#g==="main")?this.#Me():this.#di()))}get scan(){return this.#b?this.#ei?.scan??null:this.#U}set videoTimeline(e){this.#Ce=e,this.#p?.postMessage({type:"timeline",videoTimeline:e}),e.length===0&&(this.#U=null),this.#Pt()}get videoTimeline(){return this.#Ce}get container(){return this.#Z??this.#e}get doubleRate(){return this.#P}set doubleRate(e){e!==this.#P&&(this.#P=e,this.#He(),!this.#b&&(this.#I(),this.#Di()))}get spatialCheck(){return this.#Q}set spatialCheck(e){e!==this.#Q&&(this.#Q=e,this.#He())}get film(){return this.#O}set film(e){const t=this.#p?this.#jt:this.#_e;if(!(e===this.#O&&(e===!1||t===null))){if(this.#p){this.#O=e,this.#He(e?"film":void 0);return}if(e){if(!this.#qe())return;try{this.#Ii()}catch(i){this.#O=!0,this.#He(),this.#Dt(`film detector unavailable: ${i instanceof Error?i.message:String(i)}`);return}}if(this.#O=e,this.#He(),!e){if(!this.#qe())return;this.#K=!1,this.#$=0,this.#ye=!1,this.#G=M,this.#Y(),this.#n?.destroy(),this.#n=null}this.#Di()}}get debug(){return this.#oe}set debug(e){e!==this.#oe&&(this.#oe=e,this.#He())}get#bs(){return this.#P||this.#O}#Di(){this.#te||this.#b||(this.#bs?(this.#X>0&&this.#as(),(this.#U?.interlaced??!0)&&(this.#C||this.#g==="main")&&this.#Me()):this.#O||(this.#c=null,this.#xe(!1),this.#vt()))}#He(e){this.#p?.postMessage({type:"settings",options:this.#Pi(),retryFilm:e})}#Ci(){if(this.#s.getExtension("EXT_color_buffer_float")===null)throw new Error("film needs EXT_color_buffer_float")}#xs(){const e=this.#s,t=e.fenceSync(e.SYNC_GPU_COMMANDS_COMPLETE,0);e.flush();const i=this.#rs(),s=()=>{if(e.clientWaitSync(t,0,0)===e.TIMEOUT_EXPIRED){i.setTimeout(s,fe);return}e.deleteSync(t),this.#Ai=!0,this.#g==="main"&&this.decodedVideo.onrendererstatus?.()};i.setTimeout(s,fe)}#Mt(e){if(this.#bt=e,this.#C){this.#C.onFailure(e),this.stop();return}this.#Li(e),this.stop(),this.decodedVideo.onrendererstatus?.()}#Ii(){this.#Ci(),this.#n??=new ie(this.#s),this.#X>0&&this.#n.resize(this.#X,this.#J)}#Pt(){this.#b||this.#De&&(this.#Ce.length>0||(this.#U?.interlaced??!0))?this.start():this.stop()}#Ts(){return this.#C||this.#Ee==="main"?!1:this.#g==="starting"||this.#g==="active"?!0:typeof Worker<"u"&&typeof VideoFrame<"u"&&typeof OffscreenCanvas<"u"&&this.#Vt!==null&&"transferControlToOffscreen"in HTMLCanvasElement.prototype?(this.#ki(),!0):this.#Ee==="auto"?(this.#Ct(),!1):(this.#g="failed",this.#Mt("rendering in a Worker needs Worker, VideoFrame, OffscreenCanvas transfer and a worker URL, and this page lacks one"),!0)}#ki(){this.#de(),this.#p?.terminate(),this.#p=null,this.#kt(),this.#Ze=!1,this.#xt=!1,this.#jt=null,this.#Qt=0;let e=this.#i;if(this.#Ht){e=document.createElement("canvas"),e.className=this.#i.className;const r=this.#i.getAttribute("style");r===null?e.removeAttribute("style"):e.setAttribute("style",r),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e}const t=++this.#Wt;this.#g="starting",this.decodedVideo.onrendererstatus?.();let i,s;try{s=e.transferControlToOffscreen(),this.#Ht=!0,i=new Worker(this.#Vt,{type:"module"})}catch(r){this.#dt(r instanceof Error?r.message:String(r));return}this.#p=i,i.onmessage=r=>{t===this.#Wt&&this.#gs(r.data)},i.onerror=r=>{t===this.#Wt&&(r.preventDefault(),this.#dt(r.message||"the deinterlacer worker failed"))},i.postMessage({type:"initialize",canvas:s,options:this.#Pi(),scan:this.#U,videoTimeline:this.#Ce,enabled:this.#k,video:this.#Se()},[s]),this.#Nt&&i.postMessage({type:"pageVisibility",hidden:!0,video:this.#Se()})}#gs(e){switch(e.type){case"ready":this.#g="active",this.decodedVideo.onrendererstatus?.(),this.#k&&(this.#mt(),this.#Xt());break;case"failed":this.#dt(e.message);break;case"consumed":{this.#Ze=!1,this.#xt=!0;const t=this.#ke;this.#ke=null,t&&this.#Bi(t);break}case"visibility":this.#i.style.visibility=e.visible?"visible":"hidden";break;case"stats":{this.#b&&(this.#ni=e.stats.missed+e.stats.queueResetted),this.#ti=e.stats.avDifference;const t={...e.stats,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0},i=t.filmError??null,s=this.#Qt;if(this.#jt=i,this.#Qt=e.filmFailure,i!==null&&e.filmFailure!==s){this.dispatchEvent(new CustomEvent("failure",{detail:i}));try{this.#zt?.(i)}catch{}}this.dispatchEvent(new CustomEvent("stats",{detail:t})),this.#$t?.(t);break}case"capture":{const t=this.#et.get(e.id);if(this.#et.delete(e.id),!t){e.image?.close();break}e.image?t.resolve(e.image):this.#b?t.reject(new Error("no rendered picture is available")):createImageBitmap(this.#e).then(t.resolve,t.reject);break}case"release":this.#wt.delete(e.id)&&this.#me(e.data);break}}#Li(e){if(this.dispatchEvent(new CustomEvent("failure",{detail:e})),!this.#C)try{this.#zt?.(e)}catch{}}#Dt(e){this.#_e!==e&&(this.#_e=e,this.#K=!1,this.#$=0,this.#ye=!1,this.#G=M,this.#Y(),this.#n?.destroy(),this.#n=null,this.#Li(e))}#qe(){return this.#te?!1:(this.#p||(this.#_e=null),!0)}#dt(e){if(this.#g==="starting"&&this.#Ee==="auto"&&!this.#Je){this.#Ct();return}if(this.#Ui(e),!this.#Je){this.#Je=!0,this.#ki();return}console.error(`Deinterlacer Worker stopped: ${e}`),this.#g="failed",this.#p?.terminate(),this.#p=null,this.#de(),this.#kt(),this.#Mt(`deinterlacer worker stopped: ${e}`)}#Ct(){const e=this.#t;e.className=this.#i.className;const t=this.#i.getAttribute("style");t===null?e.removeAttribute("style"):e.setAttribute("style",t),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e,this.#Ht=!1,this.#p?.terminate(),this.#p=null,this.#g="main",this.#de(),this.#kt(),this.decodedVideo.onrendererstatus?.(),this.#k&&(this.#mt(),this.#Xt(),(this.#U?.interlaced??!0)&&this.#Me())}#de(){this.#ke?.frame.close(),this.#ke=null}#Ui(e){for(const t of this.#et.values())t.reject(new Error(e));this.#et.clear()}start(){if(!(this.#k||this.#te||this.#bt!==null)&&(this.#ee++,this.#k=!0,this.#cs(),!!this.#qe())){if(this.#tr(),this.#Xt(),this.#Ts()){if(this.#b){this.#p?.postMessage({type:"running",running:!0}),this.#Me();return}this.#p?.postMessage({type:"enabled",enabled:!0}),this.#g==="active"&&this.#mt();return}this.#mt(),(this.#b||(this.#U?.interlaced??!0))&&this.#Me()}}stop(){this.#ee++,this.#k&&(this.#k=!1,this.#b&&this.#Oi(),this.#l.cancel(),this.#vi(),this.#di(),this.#A=0,this.#c=null,this.#xe(!1),this.#de(),this.#p?.postMessage(this.#b?{type:"running",running:!1}:{type:"enabled",enabled:!1}))}destroy(){if(!this.#te){this.#te=!0,this.#De=!1,this.stop(),this.#p?.postMessage({type:"destroy"}),this.#p?.terminate(),this.#p=null,this.#de(),this.#kt(),this.#Ui("the deinterlacer was destroyed"),this.#N?.removeEventListener("visibilitychange",this.#Ei),this.#N=null,this.#j?.disconnect(),this.#t.removeEventListener("webglcontextlost",this.#ms),this.#l.destroy(),this.#v?.destroy(),this.#e.removeEventListener("emptied",this.#ls),this.#e.removeEventListener("resize",this.#us),this.#e.removeEventListener("pause",this.#ge),this.#e.removeEventListener("ended",this.#ge),this.#e.removeEventListener("seeking",this.#fs),this.#e.removeEventListener("seeked",this.#ge),this.#e.removeEventListener("ratechange",this.#ge),this.#e.removeEventListener("waiting",this.#ds),this.#si!==null&&(this.#e.style.aspectRatio=this.#si),this.#Is(),this.#ir();for(const e of this.#h)this.#s.deleteTexture(e);this.#h=[],this.#vt();for(const e of[...this.#gt,...this.#Be.map(({q:t})=>t)])this.#s.deleteQuery(e);this.#gt.length=0,this.#Be.length=0,this.#n?.destroy(),this.#n=null,this.#ot?.destroy(),this.#ot=null,this.#$e!==null&&(ye(this.#$e),this.#$e=null),this.#s.deleteProgram(this.#a),this.#s.deleteProgram(this.#m),this.#s.getExtension("WEBGL_lose_context")?.loseContext()}}capture(){if(this.#g==="active"&&this.#i.style.visibility==="visible"&&this.#p){const s=++this.#Es,r=new Promise((h,o)=>{this.#et.set(s,{resolve:h,reject:o})});return this.#p.postMessage({type:"capture",id:s,width:this.#e.videoWidth,height:this.#e.videoHeight}),r}if(!this.#b&&(this.#g==="starting"||this.#g==="failed"))return createImageBitmap(this.#e);const e=this.#c;if((this.#C||this.#b)&&(!this.#k||this.#ae||!e))return Promise.reject(new Error("no rendered picture is available"));if(!this.#k||this.#ae||!e)return createImageBitmap(this.#e);e.kind==="texture"?this.#Ti(e.texture,e.flip,!1):this.#Te(e.flush,e.second,null,!1);const t=this.#b?this.#ct:this.#e.videoWidth,i=this.#b?this.#ft:this.#e.videoHeight;return t>0&&i>0&&(t!==this.#t.width||i!==this.#t.height)?createImageBitmap(this.#t,{resizeWidth:t,resizeHeight:i,resizeQuality:"high"}):createImageBitmap(this.#t)}addEventListener(e,t,i){super.addEventListener(e,t,i)}removeEventListener(e,t,i){super.removeEventListener(e,t,i)}#mt(){this.#C||!this.#k||this.#b||this.#l.request(this.#Ss)}#Se(){const e=[];for(let t=0;t<this.#e.buffered.length;t++)e.push({start:this.#e.buffered.start(t),end:this.#e.buffered.end(t)});return{currentTime:this.#e.currentTime,playbackRate:this.#e.playbackRate,seeking:this.#e.seeking,paused:this.#e.paused,ended:this.#e.ended,readyState:this.#e.readyState,videoWidth:this.#e.videoWidth,videoHeight:this.#e.videoHeight,buffered:e}}#Fs(e,t,i){let s;try{s=i?.clone()??new VideoFrame(this.#e,{timestamp:Math.max(0,Math.round(t.mediaTime*1e6))})}catch(h){const o=h instanceof Error?h.message:String(h);this.#Ee==="auto"&&!this.#xt&&!this.#Je?(this.#Ct(),this.#Ut(e,t)):this.#dt(o);return}const r={id:++this.#ps,frame:s,now:e,metadata:t,video:this.#Se()};if(this.#Ze){this.#ke?.frame.close(),this.#ke=r;return}this.#Bi(r)}#Bi(e){const t=this.#p;if(!t||this.#g!=="active"){e.frame.close();return}this.#Ze=!0;const i={type:"frame",id:e.id,frame:e.frame,metadata:e.metadata,video:e.video};try{t.postMessage(i,[e.frame])}catch(s){this.#Ze=!1,e.frame.close();const r=s instanceof Error?s.message:String(s);this.#Ee==="auto"&&!this.#xt&&!this.#Je?(this.#Ct(),this.#Ut(e.now,e.metadata)):this.#dt(r)}}#Rs(e,t,i){this.#$e==null&&(this.#$e=Fe(this.#s,"20px monospace")),_e(this.#$e,e,t,i,this.#X,this.#J,20)}#It(e){if(this.#Ue==null||this.#Be.length>30)return;const t=this.#gt.pop()??this.#s.createQuery();return this.#s.beginQuery(this.#Ue.TIME_ELAPSED_EXT,t),this.#Be.push({q:t,isField:e}),t}#be(e){this.#Ue!=null&&(e!=null&&this.#s.endQuery(this.#Ue.TIME_ELAPSED_EXT),this.#Be=this.#Be.filter(({q:t,isField:i})=>{if(this.#s.getQueryParameter(t,this.#s.QUERY_RESULT_AVAILABLE)){const s=this.#s.getQueryParameter(t,this.#s.QUERY_RESULT);return i?(this.#rt+=s,this.#Xe++):(this.#st+=s,this.#Oe++),this.#gt.push(t),!1}return!0}))}#Y(e=!1){this.#G=M,this.#nt=M,this.#Ge=0,e||(this.#qt=!1),this.#K=!1,this.#n?.reset(e)}#ys(){const{prev:e,cur:t,next:i}=this.#Ri(!1),s=this.#h[e],r=this.#h[t],h=this.#h[i];if(!s||!r||!h)return;const o=this.#St?0:1;this.#n?.measureComb(s,r,o),this.#n?.detect(r,h,o)}#_s(){const{cur:e,next:t}=this.#Ri(!1),i=this.#h[e],s=this.#h[t],r=this.#n;if(!i||!s||!r)return!1;const h=this.#St?0:1;try{r.measureComb(i,s,h,!0)}catch(o){return this.#Dt(`film detection failed: ${o instanceof Error?o.message:String(o)}`),!1}return!0}#As(){const e=this.#n?.poll()??null;e!==null&&(this.#nt=e,this.#Ge=e.age,this.#qt=e.instant),this.#Ge++;const{phase:t,run:i}=this.#nt;t===0||this.#Ge>Math.ceil(W*Math.max(1,this.#e.playbackRate))?this.#G=M:this.#G={phase:(t-1+this.#Ge)%W+1,run:i}}#Ns(e){const t=[],i=this.#n?.metrics??new Float32Array(0);for(let r=0;r<E.phase;r++){const h=i[r*4]??0,o=i[r*4+1]??0,a=i[r*4+2]??0;t.push(`${h.toFixed(3)},${o.toString().padStart(4)},${a.toFixed(3)}`)}const s=this.#Rt.map((r,h)=>`${h===0?"-":h}:${r}`).join(" ");return`frame=${e} phase=${this.#G.phase} run=${this.#G.run} known=${this.#nt.phase}/${this.#nt.run} age=${this.#Ge} ${this.#K?"film":"video"} period=${this.#L.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#yt}`}#pt(e,t){const i=t-performance.timeOrigin;return Number.isFinite(i)&&i!==0?e+i:e}#ws(e,t){const i=e.expectedDisplayTime;if(!Number.isFinite(i)||i<=0||!Number.isFinite(e.timeOrigin))return t;const s=this.#pt(i,e.timeOrigin),r=Tt*Math.max(this.#d,this.#L);return s<t-r||s>t+r?t:s}#Ss=(e,t)=>{if(!this.#k||this.#ae)return;this.#pi();const i=this.#pt(e,t.timeOrigin),{frame:s,picture:r,...h}=t;this.#Ie=s??this.#e,this.#y=r??null;try{this.#Ms(i,h,s)}finally{this.#Ie=this.#e,this.#y=null}this.#mt()};#Ms(e,t,i){if(this.#g==="active"){this.#Fs(e,t,i);return}this.#g!=="starting"&&this.#Ut(e,t)}ingestExternalFrame(e,t,i){this.#Ie=i;try{this.#Ut(e,t)}finally{this.#Ie=this.#e}}#Ps(e){try{if(ze(e),e.timestamp<this.#_t+P)throw new RangeError(`a picture at ${e.timestamp} s came after one at ${this.#_t} s; pictures come in presentation order`);this.#b||this.#Ls()}catch(s){throw this.#me(e.data),s}if(this.#_t=e.timestamp,this.#ri++,this.#Ds(e.displayWidth,e.displayHeight),!this.#k){this.#me(e.data);return}if(this.#g==="starting"||this.#g==="active"){this.#ks(e);return}const t=this.#Ae;t.push(e),this.#hi(this.#W.at(performance.now()));const i=Math.ceil(Rt*Math.max(1,this.#e.playbackRate));for(;t.length>i;){const s=t.pop();this.#Lt(s.timestamp+s.duration)&&this.#R.queueResetted++,this.#me(s.data)}this.#ve=Math.max(this.#ve,t.length)}#Ds(e,t){if(!(e===this.#ct&&t===this.#ft)){if(this.#ct=e,this.#ft=t,this.#C||this.#te){this.#Ye();return}this.#si??=this.#e.style.aspectRatio,this.#e.style.aspectRatio=`${e} / ${t}`,this.#Cs(),this.#e.dispatchEvent(new Event("resize"))}}#Cs(){if(this.#At)return;this.#At=!0;const e=this.#e;Object.defineProperty(e,"videoWidth",{configurable:!0,get:()=>this.#ct}),Object.defineProperty(e,"videoHeight",{configurable:!0,get:()=>this.#ft}),Object.defineProperty(e,"getVideoPlaybackQuality",{configurable:!0,value:()=>({creationTime:performance.now(),totalVideoFrames:this.#ri,droppedVideoFrames:this.#R.missed+this.#R.queueResetted+this.#ni,corruptedVideoFrames:0})})}#Is(){if(!this.#At)return;this.#At=!1;const e=this.#e;delete e.videoWidth,delete e.videoHeight,delete e.getVideoPlaybackQuality}#ks(e){const t=++this.#vs;try{this.#p.postMessage({type:"picture",id:t,picture:e},[e.data])}catch(i){throw this.#me(e.data),i}this.#wt.set(t,e.data)}#kt(){const e=[...this.#wt.values()];this.#wt.clear();for(const t of e)this.#me(t)}#Ls(){this.#b=!0,this.#de(),this.#l.cancel(),this.#vi(),this.#A=0,this.#I(),this.#Y(),this.#c=null,this.#X=0,this.#J=0,this.#W.hold(),this.#Pt(),this.#Me()}#me(e){const t=this.decodedVideo.onrelease;if(t!==null)try{t(e)}catch(i){queueMicrotask(()=>{throw i})}}#Oi(){if(!this.#b)return;this.#p?.postMessage({type:"pictures",action:"reset"});const e=this.#Ae;this.#Ae=[],this.#Jt=!1,this.#Zt=!1,this.#_t=Number.NEGATIVE_INFINITY,this.#ti=Number.NaN,this.#ze=!1,this.#at=!1,this.#A=0,this.#I(),this.#ut=Number.NEGATIVE_INFINITY,this.#ne=!1,this.#we=null,this.#ce=Number.NaN,this.#fe=Number.NaN,this.#Y(),this.#$=0,this.#W.hold();for(const t of e)this.#me(t.data)}#hi(e){const t=this.#Ae;for(;t.length>2&&t[2].timestamp<=e;){const i=t.shift();this.#$i(i.timestamp+i.duration),this.#me(i.data)}}#Xi(e){return!(e<=this.#W.origin+P)}#Lt(e){return this.#Nt||!this.#Xi(e)?!1:!(this.#W.origin===this.#Mi&&e<=this.#Si+P)}#Gi(e){if(e===this.#Nt||(this.#Nt=e,this.#p?.postMessage({type:"pageVisibility",hidden:e,video:this.#Se()}),e))return;const t=this.#W.at(performance.now()),i=this.#e.currentTime;this.#Si=Number.isNaN(t)?i:Math.max(t,i),this.#Mi=this.#W.origin}observePageVisibility(e){this.#Gi(e)}#$i(e){this.#Lt(e)&&this.#R.missed++}#zi(e){const t=this.#e;this.#W.observe(e,t.currentTime,t.playbackRate,!t.paused&&!t.seeking&&!t.ended)&&(this.#R.resynced++,Number.isNaN(this.#ce)&&(this.#ne=!1))}observeMediaClock(e,t){this.#zi(this.#pt(e,t))}observeStart(e,t,i){this.#we={media:e,wall:this.#pt(t,i)}}#Us(){this.#x!==null&&(this.#Wi(),this.#Vi());const e=this.#rs(),t=this.#M+this.#d-de,i=e.setTimeout(()=>{this.#x=null,this.#Vi()},Math.max(0,t-performance.now()));this.#x={timers:e,handle:i}}#Vi(){performance.now()-this.#T<this.#d-de||this.#Bs()}#Wi(){const e=this.#x;e!==null&&(this.#x=null,e.timers.clearTimeout(e.handle))}#Bs(){this.#T=performance.now(),this.#p?.postMessage({type:"clock",video:this.#Se(),at:performance.now(),timeOrigin:performance.timeOrigin})}#Os(){const e=this.#e;this.#C||this.#zi(performance.now());const t=this.#M+this.#d;if(e.paused)this.#we=null,this.#ce=Number.NaN,this.#ne=!1;else if(this.#we!==null){const o=this.#we;if(t<o.wall){if(!this.#ne)return;const a=this.#lt,c=this.#ui(t,a),u=this.#ee;this.#Hi(c,a),this.#z(u)&&this.#Qi(c,a,!1);return}this.#we=null,this.#ne=!0,this.#le=o.media+(t-o.wall)*e.playbackRate/1e3,this.#We=t,this.#lt=e.playbackRate,this.#ce=t,this.#fe=Number.NaN}let i=this.#W.rate;const s=this.#W.at(t);let r;if(!Number.isNaN(this.#ce)&&(Number.isNaN(s)||!(i>0))){if(t-this.#ce>xt){this.#ce=Number.NaN,this.#ne=!1;return}i=this.#lt,r=this.#We===t?this.#le:this.#ui(t,i)}else{if(this.#ce=Number.NaN,Number.isNaN(s))return;r=e.paused?s:this.#Ws(s,i)}const h=this.#ee;this.#Hi(r,i),this.#z(h)&&this.#Qi(r,i,e.paused)}#Hi(e,t){const i=this.#ee,s=Ft*this.#d*Math.max(1,t)/1e3;for(this.#hi(e);;){const a=this.#Ae[0];if(a===void 0||a.timestamp>e+s+a.duration||(a.width===this.#X&&a.height===this.#J?this.#Yi():_)<this.#Xs(a))break;if(this.#Ae.shift(),this.#Gs(a,e,t),!this.#z(i))return;this.#hi(e)}if(!this.#ze||this.#at||this.#Yi()<this.#qi())return;const r=this.#Ne[this.#_],h=this.#Ae[0];if(h!==void 0&&h.timestamp-(r.timestamp+r.duration)<=P)return;const o=V*t/1e3;(this.#Jt||r.timestamp<=e+o)&&(this.#oi(!0,e,t),this.#at=!0)}#qi(){return this.#P&&!this.#K?2:1}#Xs(e){const t=!e.interlaced||!this.#De;return(this.#ze?this.#qi():0)+(t?1:0)}#Ki(e){const t=this.#u[e];if(t===void 0)return!1;const i=this.#c;if(i?.kind==="texture"&&i.texture===t.texture)return!1;for(const s of this.#Ve)if(s.slot===e)return!1;return!0}#Yi(){let e=0;for(let t=0;t<this.#u.length;t++)this.#Ki(t)&&e++;return e}#ji(){for(let e=1;e<=_;e++){const t=(this.#f+e)%_;if(this.#Ki(t))return t}return null}#Gs(e,t,i){this.#Ni=e.duration/(e.interlaced?e.repeatFirstField?3:2:1);const s=this.#Zt?this.#Ne[this.#_]:null,r=s===null?0:s.timestamp+s.duration,h=e.width!==this.#X||e.height!==this.#J,o=s===null||h||e.timestamp<r-P||e.timestamp-r>Y,a=!o&&e.timestamp-r>P,c=!e.interlaced||!this.#De,u=this.#ze,d=this.#at;this.#ze=!1,this.#at=!1,u&&!d&&(o||c)&&!h&&this.#oi(!0,t,i),o?(s!==null&&this.#R.discontinuities++,this.#A=0,this.#Y(),this.#$=0):s!==null&&!c&&s.interlaced&&s.topFieldFirst!==e.topFieldFirst&&this.#Y(!0);const p=performance.now();this.#gi(p),this.#it=p;const l=this.#ee,f=this.#It(!1);try{if(h&&(this.#yi(e.width,e.height),this.#u.length!==_))throw new Error("decoded pictures have no output textures");this.#$s(e)}catch(m){this.#be(f),this.#Mt(m instanceof Error?m.message:String(m));return}finally{this.#me(e.data)}if(c)e.interlaced||(this.#$>0&&this.#$--,this.#ht=!0),this.#zs(),this.#A=0;else{if(u&&!o&&!(d&&a)){const m=this.#Ne[(this.#_+g-1)%g];this.#ii=m.topFieldFirst,this.#Zi(),this.#z(l)&&this.#es(a?1:0,Math.round(m.timestamp*1e3),this.#P),this.#z(l)&&this.#oi(!1,t,i)}else this.#Yt=a;this.#ht=!1,this.#ze=!0}if(!this.#z(l)){this.#te||this.#be(f);return}this.#be(f),this.#Fe+=performance.now()-p,this.#ue++,this.#Fi(p)}#$s(e){this.#_=(this.#_+1)%g,this.#ot.convert(e,this.#h[this.#_]);const t=this.#Ne[this.#_];t.timestamp=e.timestamp,t.duration=e.duration,t.interlaced=e.interlaced,t.topFieldFirst=e.topFieldFirst,t.repeatFirstField=e.repeatFirstField,this.#A=Math.min(this.#A+1,g),this.#Zt=!0}#zs(){const e=this.#Ne[this.#_],t=this.#ji();if(t===null){this.#R.late++;return}this.#f=t,this.#hs(this.#h[this.#_],!0,this.#u[t].framebuffer),this.#Ve.push({slot:t,time:e.timestamp,picture:e.timestamp,end:e.timestamp+e.duration,scan:Ee(e)})}#oi(e,t,i){const s=this.#Ne[e?this.#_:(this.#_+g-1)%g],r=this.#Ve;for(;r.length>0&&r.at(-1).picture===s.timestamp;)r.pop();this.#ii=s.topFieldFirst;const h=e?Number.POSITIVE_INFINITY:this.#Ne[this.#_].timestamp,o=Ee(s),a=s.timestamp+s.duration;let c=!1;if(this.#K&&!e){const u=this.#G.phase;if(u===G){this.#yt++;return}const d=s.timestamp+(pe[u]??0)*s.duration;c=this.#ai(d,d+s.duration*W/me,h,s.timestamp,a,!1,null,e,o,t,i)!==null}else if(!this.#P)c=this.#ai(s.timestamp,h,h,s.timestamp,a,!1,null,e,o,t,i)!==null;else{const u=s.repeatFirstField?3:2,d=s.duration/u;let p=null;for(let l=0;l<u;l++){const f=s.timestamp+l*d,m=this.#ai(f,l+1<u?f+d:h,h,s.timestamp,a,l===1,l===2?p:null,e,o,t,i);l===0&&(p=m),m!==null&&(c=!0)}}!c&&h<=t&&s.timestamp>this.#ut&&this.#$i(a)}#ai(e,t,i,s,r,h,o,a,c,u,d){if(!this.#Vs(e,t,i,u,d))return e>this.#ut&&this.#Lt(t)&&this.#R.late++,null;if(o===null){if(o=this.#ji(),o===null)return this.#R.late++,null;this.#f=o,this.#Te(a,h,this.#u[o].framebuffer)}return this.#Ve.push({slot:o,time:e,picture:s,end:Number.isFinite(i)?Math.max(t,i):r,scan:c}),o}#Vs(e,t,i,s,r){if(r===0)return i>s;const h=2*V*r/1e3;if(t<=s-h)return!1;const o=this.#d*r/1e3;if(t-e+2*h>=o)return!0;const a=Math.max(0,Math.ceil((e-h-s)/o));return s+a*o<t+h}#Qi(e,t,i){const s=this.#Ve;let r=0;for(;r<s.length&&!this.#Xi(s[r].end);)r++;r>0&&s.splice(0,r);let h=0;for(;h<s.length&&s[h].time<=this.#ut;)h++;h>0&&s.splice(0,h);const o=P*(i?1:t);let a=-1;for(let u=0;u<s.length&&s[u].time<=e+o;u++)a=u;if(a<0)return;if(!i)for(let u=0;u<a;u++){const d=s[u+1].time;d<=e&&this.#Lt(d)&&this.#R.late++}const c=s[a];s.splice(0,a+1),this.#qs(c)}#Ws(e,t){const i=this.#M+this.#d,s=this.#Ji(t);if(!(t>0))return this.#ne=!1,e;if(!this.#ne)this.#ne=!0,this.#le=e,this.#lt=t,this.#fe=Number.NaN;else{this.#ui(i,t);const r=e-this.#le;Math.abs(r)>=Math.max(vt*t,s)&&(this.#le+=Math.trunc(r/s)*s)}return this.#We=i,this.#Hs(e-this.#le),this.#le}#ui(e,t){const i=Math.max(1,Math.round((e-this.#We)/this.#d));return this.#le+=i*this.#Ji(t),this.#We=e,this.#lt=t,this.#le}#Ji(e){const t=this.#d*e/1e3,i=this.#Ni;if(!(i>0))return t;const s=t/i,r=s>=1?Math.round(s):1/Math.round(1/s);return Math.abs(s/r-1)<=bt?r*i:t}#Hs(e){const t=performance.now(),i=t-this.#wi;this.#wi=t,Number.isNaN(this.#fe)||i>ce?this.#fe=e:this.#fe+=(e-this.#fe)*i/ce}#qs(e){const t=performance.now(),i=this.#It(!0);this.#xi(e.slot),this.#be(i),this.#Le+=performance.now()-t,this.#Re++,this.#ei=e,this.#ut=e.time}#Ut(e,t){const i=this.#ee;if(this.#z(i)&&(this.#Ks(t.mediaTime),!!this.#z(i)&&t.width>0&&t.height>0)){let s=!1;if(!this.#Qe&&this.#e.seeking){const f=this.#e.buffered,m=this.#L>=ue?this.#L/1e3:z/1e3;for(let b=0;b<f.length;b++)if(t.mediaTime>=f.start(b)&&t.mediaTime<f.end(b)&&Math.abs(t.mediaTime-this.#e.currentTime)<=m){s=!0;break}}if(s&&(this.#Qe=!0),(this.#X===0||this.#J===0)&&this.#yi(t.width,t.height),!this.#z(i))return;if(this.#U&&!this.#U.interlaced){const f=performance.now();this.#gi(f),this.#it=f,this.#$>0&&this.#$--,this.#ht=!0,this.#Zs(),this.#Fe+=performance.now()-f,this.#ue++,this.#Re++,this.#Fi(f);return}const r=t.mediaTime-this.#je,h=t.mozTiming,o=s||(h?h.discontinuity||r<0||r>Y:r<0||r>Y);o&&(this.#A=0,this.#L=0,this.#R.discontinuities++,this.#I(),this.#Y(),(s||!this.#ht)&&(this.#$=0)),this.#ht=!1;const a=this.#er(t.presentedFrames,o);if(this.#A>0&&t.mediaTime===this.#je&&(!h||t.presentedFrames===this.#Gt))return;if(!o){const f=h?.periodMs??0;f>0?this.#ts(f*(this.#e.playbackRate||1)/1e3,1):this.#A>0&&r>0&&this.#ts(r,a+1)}this.#je=t.mediaTime,this.#Gt=t.presentedFrames;const c=performance.now();this.#gi(c),this.#it=c;const u=performance.now(),d=this.#It(!1);if(this.#os(),this.#Zi(),!this.#z(i)){this.#te||this.#be(d);return}if(this.#es(a,t.presentedFrames,this.#P&&this.#Et()),!this.#z(i)){this.#te||this.#be(d);return}const l=this.#ws(t,e)+this.#d;if(this.#K)if(this.#Et()){const f=this.#G.phase;if(f===G)this.#yt++,this.#H++;else{const m=this.#L*W/me,b=this.#fi(1,e,m),T=pe[f]??0,x=b||this.#se===null?l+m:l+T*this.#L;this.#Bt("film",!1,this.#li("film",x,m),m)}}else this.#Te(!1,!1,null);else if(this.#P&&this.#Et()){const f=this.#L/2,b=this.#fi(2,e,f)||this.#se===null?l+f*2:l,T=this.#li("field",b,f);this.#Bt("field",!1,T,f),this.#Bt("field",!0,T+f,f)}else if(this.#Et()){const f=this.#L,b=this.#fi(1,e,f)||this.#se===null?l+f:l;this.#Bt("frame",!1,this.#li("frame",b,f),f)||(this.#R.late++,this.#Te(!1,!1,null))}else this.#R.late+=this.#r.length,this.#I(),this.#Te(!1,!1,null);this.#ve=Math.max(this.#ve,this.#r.length),this.#be(d),this.#Fe+=performance.now()-u,this.#ue++,this.#Fi(c)}}#Zi(){if(this.#O&&!this.#_e&&!this.#n)try{this.#Ii()}catch(e){this.#Dt(`film detector unavailable: ${e instanceof Error?e.message:String(e)}`)}}#es(e,t,i){if(this.#Ft=!1,this.#ye=!1,this.#Kt=!1,this.#O&&!this.#_e){let s=!1;if(this.#A===g&&e===0)try{this.#As(),this.#ys(),s=!0}catch(r){this.#Dt(`film detection failed: ${r instanceof Error?r.message:String(r)}`)}else this.#Y(!0);this.#Rt[this.#G.phase]=(this.#Rt[this.#G.phase]??0)+1,this.#K=this.#G.phase!==0&&this.#G.run>=q,this.#K?this.#$=gt:this.#$>0&&this.#$--,this.#Ft=s&&!this.#Yt,this.#ye=this.#Ft&&this.#$>0,this.#Kt=this.#ye&&!this.#K&&i&&this.#_s(),this.#ye&&!this.#K&&this.#R.matched++,this.#oe&&(this.#_i=this.#Ns(t))}this.#Yt=e>0}#z(e){return!this.#te&&this.#k&&e===this.#ee}#Ks(e){const t=this.#ee;let i;for(let h=this.#Ce.length-1;h>=0;h--){const o=this.#Ce[h];if(o.start<=e+1e-6){i=o;break}}if(i?.codedSize&&(i.codedSize.width!==this.#X||i.codedSize.height!==this.#J)&&this.#yi(i.codedSize.width,i.codedSize.height),!this.#z(t))return;const s=i?.scan;if(!s||this.#U?.interlaced===s.interlaced&&this.#U.topFieldFirst===s.topFieldFirst)return;const r=this.#U?.interlaced;this.#U=s,this.#A=0,this.#I(),this.#qe()&&(r!==s.interlaced&&(this.#L=0),s.interlaced&&(this.#C||this.#g==="main")?this.#Me():this.#di(),this.#Y())}#Et(){return(this.#P||this.#O)&&this.#L>0&&this.#u.length===_}#ts(e,t){const s=e*1e3/(this.#e.playbackRate||1)/t;s<ue||s>z||(this.#L=this.#L>0&&s>this.#L*ft?this.#L+(s-this.#L)*ut:s)}#Bt(e,t,i,s){const r=this.#is();if(r===null)return!1;const h=this.#u[r];if(!h)return!1;for(this.#f=r;this.#r.length>0&&this.#r[0]?.slot===r;)this.#r.shift(),this.#R.late++;this.#Te(!1,t,h.framebuffer);const o={slot:r,at:i,duration:s,cadence:e,phase:e==="film"?this.#G.phase:e==="field"?t?2:1:0,droppedBefore:this.#H};return this.#H=0,this.#r.push(o),this.#se=o,!0}#li(e,t,i){if(!(i>0))return t;const s=this.#se,r=this.#d;if(s!==null&&s.cadence===e){const h=s.at+s.duration,o=h-t,a=Math.round(o/r),c=a-this.#q,u=o-a*r;if(a>=0&&c<=1){const d=h+Math.max(-le,Math.min(le,-u*dt));if(c===0)return this.#B=0,d;if(this.#B===0||c>0!=this.#V>0?(this.#B=0,this.#V=c):Math.abs(c)<Math.abs(this.#V)&&(this.#V=c),++this.#B<mt)return d;const p=this.#V;return this.#B=0,p<0?(this.#q+=p,d):(this.#R.resynced++,this.#ci(d-p*r))}if(a<0&&this.#q-a<=1)return this.#q-=a,this.#B=0,this.#R.resynced++,this.#ci(t)}return this.#q=0,this.#B=0,s!==null&&this.#R.resynced++,this.#ci(t)}#ci(e){for(let t=this.#r.at(-1);t&&t.at>=e;)this.#r.pop(),this.#R.late++,t=this.#r.at(-1);return e}#fi(e,t,i){const s=this.#r.at(-1),r=(j+1)*Math.max(this.#d,i);if(s&&s.at-t>r)return this.#I(),this.#R.queueResetted++,!0;const h=Math.max(0,this.#r.length+e-j);let o=0,a=0;for(;a<h;){const c=this.#r.shift();if(!c)break;o+=c.duration,a++}for(const c of this.#r)c.at-=o;return this.#R.late+=a,!1}#is(){const e=this.#c?.kind==="texture"?this.#c.texture:null,t=new Set(this.#r.map(({slot:s})=>s));for(let s=1;s<=_;s++){const r=(this.#f+s)%_,h=this.#u[r];if(h&&h.texture!==e&&!t.has(r))return r}const i=this.#r[0];if(i){const s=this.#u[i.slot];if(s&&s.texture!==e)return i.slot}return null}#Me(){this.#F===null&&(!this.#k||this.#ae||(this.#w=0,this.#F=this.#Ke(this.#mi)))}#di(){this.#Ot(this.#F),this.#F=null,this.#Wi(),this.#I()}#mi=e=>{if(this.#F=null,!this.#k||this.#ae)return;this.#Ys(e);const t=this.#ee;if(this.#b)this.#C||this.#g==="main"?this.#Os():this.#Us();else{if(this.#l.flush(e),!this.#z(t))return;this.#g==="main"&&this.#Qs(this.#M,e)}this.#z(t)&&(this.#F=this.#Ke(this.#mi))};#Ys(e){const t=e-this.#w;this.#w=e;const i=Math.max(1,Math.round(t/this.#d)),s=this.#M+i*this.#d,r=e-s;if(this.#M===0||t<=0||t>z||Math.abs(r)>this.#d/4){t>=1&&t<=z&&(this.#d=t),this.#M=e;return}this.#d+=r/i*pt,this.#M=s+r*Et}#ss(){const e=this.#C;if(e)return{frames:e,origin:performance.timeOrigin};const t=this.#ns();return t===null?{frames:At,origin:performance.timeOrigin}:{frames:t,origin:t.performance.timeOrigin}}#Ke(e){const{frames:t,origin:i}=this.#ss(),s=t.requestAnimationFrame(r=>e(this.#pt(r,i)));return{frames:t,handle:s}}#rs(){return this.#ns()??Nt}#ns(){return this.#i.ownerDocument?.defaultView??this.#e.ownerDocument?.defaultView??null}#Ot(e){e?.frames.cancelAnimationFrame(e.handle)}#pi(){if(this.#C)return;this.#js(),this.#N&&this.#Gi(this.#N.hidden);const{frames:e}=this.#ss(),t=this.#F!==null&&this.#F.frames!==e,i=this.#S!==null&&this.#S.frames!==e;!t&&!i||(this.#w=0,t&&(this.#Ot(this.#F),this.#F=this.#Ke(this.#mi)),i&&(this.#Ot(this.#S),this.#S=this.#Ke(this.#bi)))}#js(){const e=this.#C?null:this.#i.ownerDocument??null;e!==this.#N&&(this.#N?.removeEventListener("visibilitychange",this.#Ei),this.#N=e,e?.addEventListener("visibilitychange",this.#Ei),this.#j?.disconnect(),e&&this.#j?.observe(e,{childList:!0,subtree:!0}))}#Ei=()=>{this.#te||this.#pi()};#Xt(){this.#C||this.#b||this.#S!==null||!this.#l.captureDriven||!this.#k||this.#ae||(this.#S=this.#Ke(this.#bi))}#vi(){this.#Ot(this.#S),this.#S=null}#bi=e=>{if(this.#S=null,!this.#k||this.#ae)return;const t=this.#ee;this.#l.flush(e),this.#z(t)&&this.#l.captureDriven&&(this.#S=this.#Ke(this.#bi))};#Qs(e,t){const i=this.#d/2,s=a=>{const c=a.at-e;return c<=i-V?!0:c>i+V?!1:this.#he>0};for(;this.#r[1]&&s(this.#r[1]);)this.#R.late++,this.#r.shift();const r=this.#r[0];if(!r||!s(r))return;this.#r.shift(),this.#he=r.at-e;const h=performance.now(),o=this.#It(!0);this.#xi(r.slot),this.#be(o),this.#Le+=performance.now()-h,this.#Re++,this.#oe&&this.#Js(r,t),this.#ie=t}#Js(e,t){const i=this.#ie===0?0:t-this.#ie,s=i/this.#d,r=e.cadence==="film"?`phase ${e.phase}`:e.cadence==="field"?`field ${e.phase}`:"frame",h=e.phase===0?"duplicate":`phase ${G}`,o=e.droppedBefore>0?`, ${h} dropped before it`+(e.droppedBefore>1?` (${e.droppedBefore})`:""):"";console.log(`yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at-t).toFixed(2)} ms${o}`)}#xi(e){const t=this.#u[e];t&&this.#Ti(t.texture)}#Zs(){this.#os();const e=this.#h[this.#_];e&&this.#Ti(e,!0),this.#A=0}#xe(e){if(this.#C){this.#C.onVisibility(e);return}this.#i.style.visibility=e?"visible":"hidden"}#Ti(e,t=!1,i=!0){this.#hs(e,t,null),this.#c={kind:"texture",texture:e,flip:t},this.#xe(!0),i&&this.#pe++}#hs(e,t,i){const s=this.#s;s.bindFramebuffer(s.FRAMEBUFFER,i),s.useProgram(this.#m),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this.#E,0),s.uniform1i(this.#D,t?1:0),s.viewport(0,0,this.#X,this.#J),s.drawArrays(s.TRIANGLES,0,3)}#er(e,t){let i=0;return this.#tt!==0&&!t&&(i=Math.max(0,e-this.#tt-1),this.#R.missed+=i),this.#tt=e,i}#gi(e){e-this.#it<=ae||(this.#Tt=e,this.#ue=0,this.#Fe=0,this.#Re=0,this.#Le=0,this.#ve=0,this.#pe=0,this.#st=0,this.#Oe=0,this.#rt=0,this.#Xe=0)}#Fi(e){const t=e-this.#Tt;if(t<ae)return;const i=!this.#b&&this.#Et()&&(this.#P||this.#K)?this.#Re:this.#ue,s=this.#ue?(this.#Fe+this.#Le)/this.#ue:0;let r;this.#Ue!=null&&(r=0,this.#Oe!==0&&(r+=this.#st/1e6/this.#Oe),this.#Xe!==0&&(r+=this.#rt/1e6/this.#Xe/2));const h={...this.#R,avDifference:this.#fe,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0,fps:i*1e3/t,frameMs:s,maxQueuedFields:this.#ve,outputFps:this.#pe*1e3/t,gpuMs:r,film:this.#K,oneInstant:this.#qt,filmError:this.#_e};this.dispatchEvent(new CustomEvent("stats",{detail:h})),this.#$t?.(h),this.#Tt=e,this.#ue=0,this.#Fe=0,this.#Re=0,this.#Le=0,this.#ve=0,this.#pe=0,this.#st=0,this.#Oe=0,this.#rt=0,this.#Xe=0}#os(){const e=this.#s;this.#_=(this.#_+1)%g;const t=this.#y,i=this.#h[this.#_];t!==null&&this.#v!==null&&i!==void 0?(this.#h[this.#_]=this.#v.adopt(t,i),this.#y=null):(e.bindTexture(e.TEXTURE_2D,i??null),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#Ie)),this.#A=Math.min(this.#A+1,g)}#Te(e,t,i,s=!0){if(this.#A===0||this.#ae)return;s&&(this.#A===g&&!e?this.#R.filtered++:this.#R.degraded++);const r=this.#s,{prev:h,cur:o,next:a}=this.#Ri(e);r.bindFramebuffer(r.FRAMEBUFFER,i),r.useProgram(this.#a);for(const[m,b]of[h,o,a].entries())r.activeTexture(r.TEXTURE0+m),r.bindTexture(r.TEXTURE_2D,this.#h[b]??null);r.uniform1i(this.#o.prev,0),r.uniform1i(this.#o.cur,1),r.uniform1i(this.#o.next,2);const c=this.#O?this.#n?.texture??null:null,u=this.#O?this.#n?.combTexture??null:null,d=c!==null&&u!==null;c!==null&&u!==null&&(r.activeTexture(r.TEXTURE0+3),r.bindTexture(r.TEXTURE_2D,c),r.uniform1i(this.#o.fieldMetrics,3),r.activeTexture(r.TEXTURE0+4),r.bindTexture(r.TEXTURE_2D,u),r.uniform1i(this.#o.comb,4));const p=this.#Kt?this.#n?.combAheadTexture??null:null,l=d&&!e;r.activeTexture(r.TEXTURE0+5),r.bindTexture(r.TEXTURE_2D,p),r.uniform1i(this.#o.combAhead,5),r.activeTexture(r.TEXTURE0),r.uniform2i(this.#o.size,this.#X,this.#J);const f=this.#St?0:1;r.uniform1i(this.#o.parity,t?1-f:f),r.uniform1i(this.#o.tff,this.#St?1:0),r.uniform1i(this.#o.second,t?1:0),r.uniform1i(this.#o.spatialCheck,this.#Q?1:0),r.uniform1i(this.#o.debug,this.#oe?1:0),r.uniform1i(this.#o.film,d?1:0),r.uniform1i(this.#o.match,l&&this.#ye&&(!t||p!==null)?1:0),r.uniform1i(this.#o.instant,l&&this.#Ft?1:0),r.uniform1i(this.#o.phase,this.#G.phase),r.viewport(0,0,this.#X,this.#J),r.drawArrays(r.TRIANGLES,0,3),this.#oe&&d&&this.#Rs(this.#_i,0,90),i===null&&(this.#c={kind:"yadif",flush:e,second:t},this.#xe(!0),s&&this.#pe++)}#Ri(e){const t=i=>(this.#_+g-i)%g;return this.#A===1?{prev:this.#_,cur:this.#_,next:this.#_}:e?{prev:t(1),cur:this.#_,next:this.#_}:this.#A===2?{prev:t(1),cur:t(1),next:this.#_}:{prev:t(2),cur:t(1),next:this.#_}}#Ye(){if(this.#pi(),!this.#Z)return;const e=this.#e,t=this.#b?this.#ct:e.videoWidth,i=this.#b?this.#ft:e.videoHeight;if(t===0||i===0)return;const s=Math.min(e.offsetWidth/t,e.offsetHeight/i),r=t*s,h=i*s;this.#i.style.left=`${e.offsetLeft+(e.offsetWidth-r)/2}px`,this.#i.style.top=`${e.offsetTop+(e.offsetHeight-h)/2}px`,this.#i.style.width=`${r}px`,this.#i.style.height=`${h}px`}#yi(e,t){const i=this.#s;this.#t.width=e,this.#t.height=t,this.#X=e,this.#J=t,this.#A=0,this.#$=0,this.#c=null,this.#I(),this.#Ye();for(const s of this.#h)i.deleteTexture(s);this.#h=[];for(let s=0;s<g;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null),this.#h.push(r)}this.#vt(),(this.#P||this.#O||this.#b)&&this.#as(),this.#ot?.resize(e,t),this.#n?.resize(e,t),this.#qe()}#as(){const e=this.#s;if(!(this.#u.length===_||this.#X===0)){this.#vt();for(let t=0;t<_;t++){const i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,this.#X,this.#J,0,e.RGBA,e.UNSIGNED_BYTE,null);const s=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0);const r=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!r){e.deleteFramebuffer(s),e.deleteTexture(i),this.#vt();return}this.#u.push({texture:i,framebuffer:s})}this.#f=_-1}}#vt(){const e=this.#s,t=this.#c?.kind==="texture"?this.#c.texture:null;this.#u.some(i=>i.texture===t)&&(this.#c=null),this.#ei=null;for(const{texture:i,framebuffer:s}of this.#u)e.deleteFramebuffer(s),e.deleteTexture(i);this.#u=[],this.#I()}#tr(){if(this.#Z)return;const e=this.#e.parentElement;if(!e)return;const t=document.createElement("div");t.style.cssText="position:relative;display:inline-block;line-height:0;max-width:100%",e.insertBefore(t,this.#e),t.appendChild(this.#e),t.appendChild(this.#i),this.#Z=t,this.#re?.observe(this.#e),this.#Ye()}#ir(){if(this.#C)return;const e=this.#Z;this.#Z=null,this.#re?.disconnect(),this.#i.remove(),e?.parentElement&&(e.parentElement.insertBefore(this.#e,e),e.remove())}#us=()=>this.#Ye();#Pe(e){return!this.#p||this.#g==="main"?!1:(this.#p.postMessage({type:"event",name:e,video:this.#Se()}),!0)}#ls=()=>{if(this.#b){this.#W.hold(),this.#Pe("emptied");return}if(this.#Pe("emptied")){this.#de(),this.#xe(!1);return}this.#A=0,this.#je=0,this.#Gt=0,this.#I(),this.#Y(),this.#$=0,this.#L=0,this.#cs(),this.#c=null,this.#xe(!1)};#cs(){this.#R={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0},this.#ri=0,this.#ni=0,this.#Rt.fill(0),this.#yt=0,this.#tt=0,this.#Tt=0,this.#it=0,this.#ue=0,this.#Fe=0,this.#Re=0,this.#Le=0,this.#ve=0,this.#pe=0,this.#I(),this.#st=0,this.#Oe=0,this.#rt=0,this.#Xe=0}#fs=()=>{if(this.#b){this.#W.hold(),this.#Pe("seeking");return}if(this.#Pe("seeking")){this.#de();return}this.#Qe=!1};#ge=e=>{if(this.#b){this.#W.hold(),e.type==="ratechange"&&this.#ne&&this.#e.playbackRate>0&&(this.#ce=this.#We),this.#Pe(e.type);return}if(e.type==="ratechange"&&(this.#l.captureDriven?this.#Xt():this.#vi()),(e.type==="pause"||e.type==="ended"||e.type==="seeked"||e.type==="ratechange")&&this.#Pe(e.type)){this.#de();return}if(e.type==="seeked"){const i=this.#Qe;if(this.#Qe=!1,i)return;this.#A=0,this.#I(),this.#Y(),this.#c=null,this.#xe(!1);return}const t=e.type==="ratechange";if(t&&(this.#L=0,this.#je=this.#e.currentTime),this.#I(),this.#k&&this.#A>0){const i=this.#is(),s=i===null?void 0:this.#u[i];i!==null&&s?(this.#f=i,this.#Te(!0,!1,s.framebuffer),this.#xi(i)):this.#Te(!0,!1,null)}t&&(this.#A=0,this.#tt=0,this.#Y())};#ds=()=>{this.#b&&(this.#W.hold(),this.#Pe("waiting"))};#ms=e=>{e.preventDefault(),!(!this.#C&&this.#g==="active")&&(this.#ae=!0,this.#Mt("the deinterlacer WebGL context was lost"))}}function St(n,e,t,i,s,r,h){return new wt(n,t,{canvas:e,onFailure:i,onVisibility:s,requestAnimationFrame:r,cancelAnimationFrame:h})}function ve(n,e){const t=n.createProgram(),i=be(n,n.VERTEX_SHADER,ct),s=be(n,n.FRAGMENT_SHADER,e);if(n.attachShader(t,i),n.attachShader(t,s),n.linkProgram(t),n.deleteShader(i),n.deleteShader(s),!n.getProgramParameter(t,n.LINK_STATUS)){const r=n.getProgramInfoLog(t);throw n.deleteProgram(t),new Error(`the deinterlacer failed to link: ${r??"no reason given"}`)}return t}function be(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const L=self;class Mt extends EventTarget{currentTime=0;playbackRate=1;seeking=!1;paused=!0;ended=!1;readyState=0;videoWidth=0;videoHeight=0;parentElement=null;offsetWidth=0;offsetHeight=0;offsetLeft=0;offsetTop=0;#t=[];update(e){this.currentTime=e.currentTime,this.playbackRate=e.playbackRate,this.seeking=e.seeking,this.paused=e.paused,this.ended=e.ended,this.readyState=e.readyState,this.videoWidth=e.videoWidth,this.videoHeight=e.videoHeight,this.#t=e.buffered}get buffered(){return{length:this.#t.length,start:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.start},end:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.end}}}getVideoPlaybackQuality(){return{creationTime:performance.now(),droppedVideoFrames:0,totalVideoFrames:0,corruptedVideoFrames:0}}requestVideoFrameCallback(){return 0}cancelVideoFrameCallback(){}}let R=null,v=null,H=!1;const Q=new Map;function Pt(n){return L.requestAnimationFrame(n)}function Dt(n){L.cancelAnimationFrame(n)}function A(n,e=[]){L.postMessage(n,e)}function Ct(n,e,t){n.doubleRate=e.doubleRate,n.spatialCheck=e.spatialCheck,(n.film!==e.film||t==="film")&&(n.film=e.film),n.debug=e.debug}L.onmessage=n=>{const e=n.data;try{if(e.type==="initialize"){if(typeof L.requestAnimationFrame!="function")throw new Error("requestAnimationFrame is unavailable in this Worker");R=new Mt,R.update(e.video),v=St(R,e.canvas,e.options,r=>{H||A({type:"failed",message:r})},r=>A({type:"visibility",visible:r}),Pt,Dt);const t=v;t.decodedVideo.onrelease=r=>{const h=Q.get(r);Q.delete(r),h!==void 0&&!H&&A({type:"release",id:h,data:r},[r])};let i=0;v.addEventListener("failure",()=>i++),v.addEventListener("stats",r=>{const{dropped:h,...o}=r.detail;A({type:"stats",stats:o,filmFailure:i})}),v.scan=e.scan,v.videoTimeline=e.videoTimeline,v.enabled=e.enabled;let s=!1;t.decodedVideo.onrendererstatus=()=>{s||t.decodedVideo.rendererStatus().state!=="prepared"||(s=!0,H||A({type:"ready"}))};return}if(!R||!v)return;switch(e.type){case"frame":R.update(e.video);try{v.ingestExternalFrame(performance.now(),e.metadata,e.frame)}finally{e.frame.close(),A({type:"consumed",id:e.id})}break;case"settings":Ct(v,e.options,e.retryFilm);break;case"scan":v.scan=e.scan;break;case"timeline":v.videoTimeline=e.videoTimeline;break;case"enabled":v.enabled=e.enabled;break;case"running":e.running?v.start():v.stop();break;case"picture":Q.set(e.picture.data,e.id),v.decodedVideo.push(e.picture);break;case"pictures":e.action==="reset"?v.decodedVideo.reset():v.decodedVideo.finish();break;case"start":R.update(e.video),v.observeStart(e.media,e.at,e.timeOrigin);break;case"clock":R.update(e.video),v.observeMediaClock(e.at,e.timeOrigin);break;case"pageVisibility":R.update(e.video),v.observePageVisibility(e.hidden);break;case"event":R.update(e.video),R.dispatchEvent(new Event(e.name));break;case"capture":R.videoWidth=e.width,R.videoHeight=e.height,v.capture().then(t=>A({type:"capture",id:e.id,image:t},[t])).catch(()=>A({type:"capture",id:e.id,image:null}));break;case"destroy":H=!0,v.destroy(),v=null,R=null,L.close();break}}catch(t){const i=t instanceof Error?t.message:String(t);A({type:"failed",message:i})}}})();
//# sourceMappingURL=worker-BO2s0KiP.js.map
