(function(){"use strict";const P=`#version 300 es
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
`;function Fe(n,e){const t=w(n,Te,ge),i=n.getAttribLocation(t,"aVertexPosition"),s=n.getAttribLocation(t,"aTextureCoord"),r=n.getUniformLocation(t,"uTexture"),h=n.getUniformLocation(t,"uMatrix"),o=n.getUniformLocation(t,"uUvMatrix"),a=n.getUniformLocation(t,"uTextColor"),c=n.getUniformLocation(t,"uBackColor");if(r==null||h==null||o==null||a==null||c==null)throw new Error("failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER");const u=n.createBuffer(),d=n.createBuffer();return{gl:n,...Re(n,e),program:t,programUniforms:{vertex:i,textureCoord:s,texture:r,matrix:h,uvMatrix:o,textColor:a,backColor:c},positionBuffer:u,textureBuffer:d}}function Re(n,e){const t=new OffscreenCanvas(0,0),i=t.getContext("2d"),s=new Map;let r=0;const h=0;let o=1;i.font=e,i.fillStyle="white";for(let c=32;c<128;c++){const u=String.fromCharCode(c),d=i.measureText(u),m=Math.ceil(d.actualBoundingBoxDescent+d.actualBoundingBoxAscent+1),l=Math.ceil(d.actualBoundingBoxLeft+d.actualBoundingBoxRight+1);s.set(u,{x:r,y:h,width:l,height:m,metrics:d}),o=Math.max(o,m),r+=l}t.width=r,t.height=o,i.font=e,i.fillStyle="white";for(const[c,u]of s)i.fillText(c,Math.floor(u.x+u.metrics.actualBoundingBoxLeft+1),Math.floor(u.metrics.actualBoundingBoxAscent+1));const a=n.createTexture();return n.bindTexture(n.TEXTURE_2D,a),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t),{fontTexture:a,chars:s,textureSize:{width:r,height:o}}}function ye(n){const e=n.gl;e.deleteBuffer(n.positionBuffer),e.deleteBuffer(n.textureBuffer),e.deleteTexture(n.fontTexture),e.deleteProgram(n.program)}function _e(n,e,t,i,s,r,h){const o=[],a=[],c=t;for(const m of e){if(m===`
`){t=c,i+=h;continue}const l=n.chars.get(m);if(l==null)continue;if(l.width===1){t+=l.metrics.width;continue}const f=Math.floor(t-l.metrics.actualBoundingBoxLeft),p=Math.floor(i-l.metrics.actualBoundingBoxAscent),b=f+l.width,T=p+l.height;o.push(f,p),a.push(l.x,l.y),o.push(f,T),a.push(l.x,l.y+l.height),o.push(f+l.width,T),a.push(l.x+l.width,l.y+l.height),o.push(b,T),a.push(l.x+l.width,l.y+l.height),o.push(f,p),a.push(l.x,l.y),o.push(b,p),a.push(l.x+l.width,l.y),t+=l.metrics.width}const u=n.gl;u.useProgram(n.program),u.bindBuffer(u.ARRAY_BUFFER,n.positionBuffer),u.bufferData(u.ARRAY_BUFFER,new Float32Array(o),u.STATIC_DRAW),u.vertexAttribPointer(n.programUniforms.vertex,2,u.FLOAT,!1,0,0),u.enableVertexAttribArray(n.programUniforms.vertex),u.bindBuffer(u.ARRAY_BUFFER,n.textureBuffer),u.bufferData(u.ARRAY_BUFFER,new Float32Array(a),u.STATIC_DRAW),u.vertexAttribPointer(n.programUniforms.textureCoord,2,u.FLOAT,!1,0,0),u.enableVertexAttribArray(n.programUniforms.textureCoord),u.activeTexture(u.TEXTURE0),u.bindTexture(u.TEXTURE_2D,n.fontTexture),u.uniform1i(n.programUniforms.texture,0),u.uniform3fv(n.programUniforms.textColor,[1,1,1]),u.uniform3fv(n.programUniforms.backColor,[0,0,0]);function d(m,l,f){const p=[];for(let b=0;b<l;b++)for(let T=0;T<m;T++)p.push(f[T*m+b]);return p}u.uniformMatrix4fv(n.programUniforms.matrix,!1,d(4,4,[1/(s/2),0,0,-1,0,-2/r,0,1,0,0,1,0,0,0,0,1])),u.uniformMatrix3fv(n.programUniforms.uvMatrix,!1,d(3,3,[1/n.textureSize.width,0,0,0,1/n.textureSize.height,0,0,0,1])),u.viewport(0,0,s,r),u.enable(u.BLEND),u.blendFunc(u.SRC_ALPHA,u.ONE_MINUS_SRC_ALPHA),u.drawArrays(u.TRIANGLES,0,o.length/2),u.disable(u.BLEND)}const E={firstRepeatsPrevious:0,secondRepeatsNext:1,secondRepeatsPrevious:2,previousSecondRepeated:3,firstRepeatsNext:4,previousFirstRepeated:5,phase:6,instant:7},D=8,y=16,X=8,Ae=15,Ne=6,we=8,Se=30,Me=.01,Pe=.002,Z=2,G=1,De=2,q=10,Ce={a:"uA",b:"uB",fieldMetrics:"uFieldMetrics",first:"uFirst",size:"uSize"},ee=16,te=8,Ie=`#version 300 es

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
`,M={phase:0,run:0};function $(n,e,t){return Object.fromEntries(Object.entries(t).map(([i,s])=>[i,n.getUniformLocation(e,s)]))}class ie{#t;#i;#e;#l;#v;#y;#s;#n;#a;#o=null;#m=null;#E=null;#D=null;#h=null;#u=0;#f=null;#c=null;#r=0;#F=0;metrics=new Float32Array(D*4);#x=0;#T=0;constructor(e){this.#t=e,this.#i=w(e,Ie,P),this.#e=$(e,this.#i,Ce),this.#l=w(e,Le,P),this.#v=$(e,this.#l,ke),this.#y=w(e,Be,P),this.#s=$(e,this.#y,Ue),this.#n=w(e,Xe,P),this.#a=$(e,this.#n,Oe),S(e,this.#i,e.RGBA32F,2),S(e,this.#l,e.RGBA32F,2),S(e,this.#y,e.RGBA32F),S(e,this.#n,e.RGBA32F)}get texture(){return this.#h?.[this.#u]?.textures[0]??null}get combTexture(){return this.#E?.textures[0]??null}get combAheadTexture(){return this.#D?.textures[0]??null}resize(e,t){e===this.#x&&t===this.#T||(this.#x=e,this.#T=t,this.#S())}reset(e=!1){const t=this.#t;t.deleteSync(this.#c),this.#c=null,this.#r=0;const i=this.#h?.[this.#u];if(!i)return;const s=e?E.instant:D,r=new Float32Array(s*4);for(let h=0;h<E.phase;h++)r[h*4+1]=1;t.bindTexture(t.TEXTURE_2D,i.textures[0]??null),t.texSubImage2D(t.TEXTURE_2D,0,0,0,s,1,t.RGBA,t.FLOAT,r)}detect(e,t,i){const s=this.#t;if(this.#x===0||this.#T===0)return;this.#N();const r=this.#o,h=this.#m,o=this.#h;if(r===null||h===null||o===null)return;const a=o[this.#u],c=o[1-this.#u];if(s.bindFramebuffer(s.FRAMEBUFFER,r.framebuffer),s.useProgram(this.#i),this.#w(0,e,this.#e.a),this.#w(1,t,this.#e.b),this.#w(2,a.textures[0],this.#e.fieldMetrics),s.uniform1i(this.#e.first,i),s.uniform2i(this.#e.size,this.#x,this.#T),s.viewport(0,0,r.width,r.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,h.framebuffer),s.useProgram(this.#l),this.#w(0,r.textures[0],this.#v.second),this.#w(1,r.textures[1],this.#v.first),s.uniform2i(this.#v.size,r.width,r.height),s.viewport(0,0,h.width,h.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,c.framebuffer),s.useProgram(this.#y),this.#w(0,a.textures[0],this.#s.previous),this.#w(1,h.textures[0],this.#s.second),this.#w(2,h.textures[1],this.#s.first),this.#w(3,this.#E?.textures[0],this.#s.comb),s.uniform2i(this.#s.size,h.width,h.height),s.viewport(0,0,D,1),s.drawArrays(s.TRIANGLES,0,3),this.#u=1-this.#u,this.#r++,this.#c!==null){s.bindFramebuffer(s.FRAMEBUFFER,null);return}this.#F=this.#r,s.bindBuffer(s.PIXEL_PACK_BUFFER,this.#f),s.readPixels(0,0,D,1,s.RGBA,s.FLOAT,0),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.FRAMEBUFFER,null),this.#c=s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE,0),s.flush()}measureComb(e,t,i,s=!1){const r=this.#t;if(this.#x===0||this.#T===0)return;this.#N();const h=s?this.#D:this.#E;h!==null&&(r.bindFramebuffer(r.FRAMEBUFFER,h.framebuffer),r.useProgram(this.#n),this.#w(0,e,this.#a.prev),this.#w(1,t,this.#a.cur),r.uniform1i(this.#a.first,i),r.uniform2i(this.#a.size,this.#x,this.#T),r.viewport(0,0,h.width,h.height),r.drawArrays(r.TRIANGLES,0,3),r.bindFramebuffer(r.FRAMEBUFFER,null))}poll(){const e=this.#t,t=this.#c;if(t===null||this.#f===null)return null;switch(e.clientWaitSync(t,0,0)){case e.ALREADY_SIGNALED:case e.CONDITION_SATISFIED:return e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#f),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,this.metrics),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),e.deleteSync(t),this.#c=null,{phase:this.metrics[E.phase*4]??0,run:this.metrics[E.phase*4+1]??0,instant:(this.metrics[E.instant*4+3]??0)>.5,age:this.#r-this.#F};default:return null}}destroy(){const e=this.#t;if(this.#S(),this.#h!==null){for(const t of this.#h)I(e,t);this.#h=null}e.deleteSync(this.#c),this.#c=null,e.deleteBuffer(this.#f),this.#f=null,e.deleteProgram(this.#i),e.deleteProgram(this.#l),e.deleteProgram(this.#y),e.deleteProgram(this.#n)}#w(e,t,i){const s=this.#t;s.activeTexture(s.TEXTURE0+e),s.bindTexture(s.TEXTURE_2D,t??null),s.uniform1i(i,e)}#S(){const e=this.#t;this.#o!==null&&I(e,this.#o),this.#m!==null&&I(e,this.#m),this.#E!==null&&I(e,this.#E),this.#D!==null&&I(e,this.#D),this.#o=null,this.#m=null,this.#E=null,this.#D=null}#N(){const e=this.#t;if(this.#o===null||this.#m===null||this.#E===null||this.#D===null){this.#S();const t=Math.ceil(this.#x/ee),i=Math.ceil(this.#T/(te*2));this.#o=C(e,t,i,2),this.#m=C(e,Math.ceil(t/U),Math.ceil(i/U),2),this.#E=C(e,Math.ceil(this.#x/y),Math.ceil(this.#T/y),1),this.#D=C(e,Math.ceil(this.#x/y),Math.ceil(this.#T/y),1)}this.#h===null&&(this.#h=[C(e,D,1,1),C(e,D,1,1)],this.#u=0,this.reset()),this.#f===null&&(this.#f=e.createBuffer(),e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#f),e.bufferData(e.PIXEL_PACK_BUFFER,this.metrics.byteLength,e.STREAM_COPY),e.bindBuffer(e.PIXEL_PACK_BUFFER,null))}}function C(n,e,t,i){const s=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,s);const r=[];for(let a=0;a<i;a++){const c=n.createTexture();n.bindTexture(n.TEXTURE_2D,c),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,e,t,0,n.RGBA,n.FLOAT,null),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+a,n.TEXTURE_2D,c,0),r.push(c)}n.drawBuffers(r.map((a,c)=>n.COLOR_ATTACHMENT0+c));const h=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE;n.bindFramebuffer(n.FRAMEBUFFER,null);const o={framebuffer:s,textures:r,width:e,height:t};if(!h)throw I(n,o),new Error("failed to allocate framebuffer");return o}function I(n,{framebuffer:e,textures:t}){n.deleteFramebuffer(e);for(const i of t)n.deleteTexture(i)}function se(n){return Number.isInteger(n)&&n>0}function ze(n){const{timestamp:e,duration:t,width:i,height:s,displayWidth:r,displayHeight:h,data:o,planes:a,matrix:c}=n;if(!Number.isFinite(e)||!(t>0)||!Number.isFinite(t))throw new TypeError(`invalid picture timing ${e}+${t}`);if(!se(i)||!se(s))throw new TypeError(`invalid picture size ${i}x${s}`);if(!(r>0)||!(h>0))throw new TypeError(`invalid display size ${r}x${h}`);if(c!=="bt709"&&c!=="bt601")throw new TypeError(`unknown matrix ${String(c)}`);if(a.length!==3)throw new TypeError("a picture has three planes");for(let u=0;u<3;u++){const d=u===0?i:Math.ceil(i/2),m=u===0?s:Math.ceil(s/2),{offset:l,stride:f}=a[u];if(!Number.isInteger(l)||l<0||!Number.isInteger(f)||f<d||l+f*(m-1)+d>o.byteLength)throw new TypeError(`plane ${u} at ${l} with stride ${f} does not fit ${d}x${m} samples in ${o.byteLength} bytes`)}}function re(n,e){const t=1-n-e;return Float32Array.of(2*(1-n),2*(1-e)*e/t,2*(1-n)*n/t,2*(1-e))}const We={bt709:re(.2126,.0722),bt601:re(.299,.114)},Ve=`#version 300 es
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
`;class He{#t;#i;#e;#l;#v;#y;#s;#n;#a=[];#o=0;#m=0;#E=!1;constructor(e){this.#t=e,this.#i=w(e,Ve,P),this.#e=e.getUniformLocation(this.#i,"uLuma"),this.#l=e.getUniformLocation(this.#i,"uCb"),this.#v=e.getUniformLocation(this.#i,"uCr"),this.#y=e.getUniformLocation(this.#i,"uInterlaced"),this.#s=e.getUniformLocation(this.#i,"uMatrix"),this.#n=e.createFramebuffer(),S(e,this.#i,e.RGBA8)}resize(e,t){const i=this.#t;for(const s of this.#a)i.deleteTexture(s);this.#a=[];for(let s=0;s<3;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texStorage2D(i.TEXTURE_2D,1,i.R8,s===0?e:Math.ceil(e/2),s===0?t:Math.ceil(t/2)),this.#a.push(r)}this.#o=e,this.#m=t,this.#E=!1}convert(e,t){const i=this.#t,s=new Uint8Array(e.data);i.pixelStorei(i.UNPACK_ALIGNMENT,1);for(let r=0;r<3;r++){const{offset:h,stride:o}=e.planes[r];i.bindTexture(i.TEXTURE_2D,this.#a[r]),i.pixelStorei(i.UNPACK_ROW_LENGTH,o),i.texSubImage2D(i.TEXTURE_2D,0,0,0,r===0?this.#o:Math.ceil(this.#o/2),r===0?this.#m:Math.ceil(this.#m/2),i.RED,i.UNSIGNED_BYTE,s,h)}if(i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.bindFramebuffer(i.FRAMEBUFFER,this.#n),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,t,0),!this.#E){if(i.checkFramebufferStatus(i.FRAMEBUFFER)!==i.FRAMEBUFFER_COMPLETE)throw i.bindFramebuffer(i.FRAMEBUFFER,null),new Error("decoded pictures cannot be drawn into RGBA8");this.#E=!0}i.useProgram(this.#i);for(let r=0;r<3;r++)i.activeTexture(i.TEXTURE0+r),i.bindTexture(i.TEXTURE_2D,this.#a[r]);i.uniform1i(this.#e,0),i.uniform1i(this.#l,1),i.uniform1i(this.#v,2),i.uniform1i(this.#y,e.interlaced?1:0),i.uniform4fv(this.#s,We[e.matrix]),i.viewport(0,0,this.#o,this.#m),i.drawArrays(i.TRIANGLES,0,3),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null)}destroy(){const e=this.#t;for(const t of this.#a)e.deleteTexture(t);this.#a=[],e.deleteFramebuffer(this.#n),e.deleteProgram(this.#i)}}const ne=250,F=4,qe=.01,Ke=100,Ye=250,he=.5,N=2;class je{#t=0;#i=Number.NaN;#e=0;#l=1;#v=!0;#y=Number.NaN;#s=0;#n=!1;#a=0;#o=0;#m=Number.NaN;#E=0;#D=new Float64Array(F);#h=0;#u=!0;#f=new Float64Array(F).fill(Number.NaN);#c=0;#r=0;#F=!1;#x=!1;#T=!1;#w=new Float64Array(3).fill(Number.NaN);#S=0;#N=Number.NaN;#j=Number.NaN;#d=Number.NaN;#M=Number.NaN;#oe=!1;#ie=Number.NEGATIVE_INFINITY;at(e){return this.#v&&!Number.isNaN(this.#M)&&!Number.isNaN(this.#i)?this.#H(e):this.#i+this.#e*(e-this.#t)/1e3}#H(e){const t=this.#l,i=this.#j+t*(e-this.#d-this.#M)/1e3,s=this.#y+t*(e-this.#o)/1e3;return Math.max(this.#ie,Math.min(s,Math.max(this.#N,i)))}get rate(){return this.#e}get origin(){return this.#m}hold(){this.#u=!0,this.#i=Number.NaN,this.#e=0}observe(e,t,i,s){const r=e-this.#o;if(this.#o=e,!s||i===0||this.#u||i!==this.#l){const x=i!==0&&(!s||this.#l===0||i===this.#l);return this.#u=!1,this.#l=i,this.#P(e,t),x&&(this.#N=t),!1}const h=this.#r!==0;if(!this.#v&&!h&&this.#se(r),t===this.#y){if(this.#v)return Number.isNaN(this.#M)||(this.#oe=!0),!1;if(h)return e>this.#r&&(this.#F=!0,this.#B(e,t,!0)),!1;const x=this.#Z(i),O=Number.isNaN(x)?Ye:x+r+N;return e-this.#s>O&&this.#B(e,t,!Number.isNaN(x)),!1}const o=(t-this.#y)*1e3/i,a=e-this.#s,c=a-r,u=this.#a;this.#y=t,this.#s=e,this.#a=r;const d=o<=a+u+N,m=o>=a*he&&d;if(this.#v){const x=!this.#n;if(this.#n=!0,x&&!Number.isNaN(this.#N)&&c<=N){this.#j=t,this.#d=e;const xe=this.#re();this.#M=xe>r+N?xe:Number.NaN}else this.#oe&&o>=r*he&&o<=r+u+N&&(this.#ie=t);this.#T&&!x&&m&&this.#W(c,i),this.#T=!1;const O=this.#I(i,r);if(!x&&m){if(O||this.#x)return this.#F=!1,this.#q(e,t,i,r,O),!0;this.#x=!0}else if(this.#x=!1,x&&!this.#F&&O&&o>0&&d)return this.#q(e,t,i,r,!0),!0;return this.#t=e,this.#i=t,!1}if(h){if(!m)return this.#F=!0,this.#P(e,t),!1;this.#r=0,this.#F=!1}else m&&this.#W(c,i);const l=t-this.at(e);if(Math.abs(l)>Ke/1e3*i)return this.#m=t,this.#Q(e,t),!0;const f=this.#D;e-this.#h>=ne?(f.copyWithin(0,1),f[F-1]=l,this.#h=e):f[F-1]=Math.max(f[F-1],l);let p=f[0];for(let x=1;x<F;x++)p=Math.max(p,f[x]);const b=qe*i*(e-this.#E)/1e3,T=Math.max(-b,Math.min(b,p));this.#E=e,this.#i+=T;for(let x=0;x<F;x++)f[x]=f[x]-T;return!1}#se(e){this.#c+=e,!(this.#c<ne)&&(this.#f.copyWithin(0,1),this.#f[F-1]=0,this.#c=0)}#q(e,t,i,s,r){Number.isNaN(this.#d)||(this.#w[this.#S++%this.#w.length]=(this.#j-t)*1e3/i+(e-this.#d)),this.#Q(e,t),r&&(this.#r=e+this.#Z(i)+s+N)}#B(e,t,i){const s=this.#s;this.#P(e,t),i&&(this.#s=s,this.#n=!0,this.#T=!0)}#W(e,t){const i=this.#f[F-1],s=e*t/1e3;this.#f[F-1]=Number.isNaN(i)?s:Math.max(i,s)}#I(e,t){let i=Number.POSITIVE_INFINITY;for(let r=0;r<F-1;r++){const h=this.#f[r];if(Number.isNaN(h))return!1;i=Math.min(i,h)}const s=i*1e3/e;return s>N&&s+N>=t}#Z(e){let t=Number.NaN;for(let s=0;s<F-1;s++){const r=this.#f[s];Number.isNaN(r)||(t=Number.isNaN(t)?r:Math.max(t,r))}if(Number.isNaN(t))return t;const i=this.#f[F-1];return Number.isNaN(i)||(t=Math.max(t,i)),t*1e3/e}#re(){const[e,t,i]=this.#w;return Number.isNaN(e)||Number.isNaN(t)||Number.isNaN(i)?Number.NaN:Math.max(Math.min(e,t),Math.min(Math.max(e,t),i))}#P(e,t){this.#N=Number.NaN,this.#j=Number.NaN,this.#d=Number.NaN,this.#M=Number.NaN,this.#oe=!1,this.#ie=Number.NEGATIVE_INFINITY,this.#T=!1,this.#x=!1,this.#r=0,this.#t=e,this.#i=t,this.#e=0,this.#v=!0,this.#n=!1,this.#y=t,this.#s=e,this.#m=t}#Q(e,t){this.#d=Number.NaN,this.#M=Number.NaN,this.#r=0,this.#t=e,this.#i=t,this.#e=this.#l,this.#v=!1,this.#E=e,this.#h=e,this.#D.fill(Number.NEGATIVE_INFINITY),this.#D[F-1]=0}}const B=16,Qe=6,Je=`#version 300 es
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
`;class Ze{#t;#i;#e=null;#l=null;#v=[];#y=0;#s=[];#n=new Uint8Array(0);#a=[];#o=null;#m=0;constructor(e,t){this.#t=e,this.#i=t}take(){const e=this.#t,t=this.#v.pop()??this.#u();if(t===null)return null;const i=this.#i.videoWidth,s=this.#i.videoHeight;e.bindTexture(e.TEXTURE_2D,t);try{e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#i)}catch(o){throw this.#v.push(t),o}const r={id:++this.#m,texture:t,width:i,height:s,changed:null,fence:null,buffer:null,reported:!1},h=this.#o;return h===null||h.width!==i||h.height!==s?r.changed=!0:this.#E(r,h),this.#o=r,this.#a.push(r),r.id}settle(){const e=this.#t,t=this.#a.find(i=>!i.reported);if(t===void 0||t===this.#o)return null;if(t.changed===null){const{fence:i,buffer:s}=t;if(i===null||s===null)return null;const r=e.clientWaitSync(i,0,0);if(r!==e.ALREADY_SIGNALED&&r!==e.CONDITION_SATISFIED)return null;this.#n.byteLength<s.bytes&&(this.#n=new Uint8Array(s.bytes));const h=this.#n.subarray(0,s.bytes);e.bindBuffer(e.PIXEL_PACK_BUFFER,s.buffer),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,h),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),t.changed=et(h),this.#D(t)}return t.reported=!0,{id:t.id,changed:t.changed}}adopt(e,t){const i=this.#a.findIndex(r=>r.id===e),s=this.#a[i];if(s===void 0||!s.reported)throw new Error(`picture ${e} is not available to adopt`);return this.#a.splice(i,1),this.#v.push(t),s.texture}release(e){const t=this.#a.findIndex(s=>s.id===e),i=this.#a[t];i!==void 0&&(this.#a.splice(t,1),this.#h(i))}reset(){const e=this.#a;this.#a=[],this.#o=null;for(const t of e)this.#D(t),this.#h(t)}destroy(){const e=this.#t;this.reset();for(const t of this.#v)e.deleteTexture(t);this.#v=[],this.#y=0;for(const{buffer:t}of this.#s)e.deleteBuffer(t);this.#s=[],this.#r(),this.#e!==null&&e.deleteProgram(this.#e),this.#e=null}#E(e,t){const i=this.#t,s=Math.ceil(e.width/B),r=Math.ceil(e.height/B),h=this.#c(s,r),o=this.#F(s*r*4);this.#e??=this.#f(),i.bindFramebuffer(i.FRAMEBUFFER,h.framebuffer),i.useProgram(this.#e),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,t.texture),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e.texture),i.viewport(0,0,s,r),i.drawArrays(i.TRIANGLES,0,3),i.bindBuffer(i.PIXEL_PACK_BUFFER,o.buffer),i.readPixels(0,0,s,r,i.RGBA,i.UNSIGNED_BYTE,0),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),i.bindFramebuffer(i.FRAMEBUFFER,null),e.fence=i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE,0),e.buffer=o,i.flush()}#D(e){const t=this.#t;e.fence!==null&&t.deleteSync(e.fence),e.fence=null;const i=e.buffer;if(e.buffer=null,i===null)return;const s=this.#l;s!==null&&i.bytes===s.width*s.height*4?this.#s.push(i):t.deleteBuffer(i.buffer)}#h(e){this.#v.push(e.texture)}#u(){if(this.#y===Qe)return null;const e=this.#t,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.#y++,t}#f(){const e=this.#t,t=w(e,Je,P);return e.useProgram(t),e.uniform1i(e.getUniformLocation(t,"uTake"),0),e.uniform1i(e.getUniformLocation(t,"uReference"),1),t}#c(e,t){const i=this.#t,s=this.#l;if(s?.width===e&&s.height===t)return s;this.#r();for(const{buffer:a}of this.#s)i.deleteBuffer(a);this.#s=[];const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null);const h=i.createFramebuffer();i.bindFramebuffer(i.FRAMEBUFFER,h),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,r,0),i.bindFramebuffer(i.FRAMEBUFFER,null);const o={framebuffer:h,texture:r,width:e,height:t};return this.#l=o,o}#r(){const e=this.#t;this.#l!==null&&(e.deleteFramebuffer(this.#l.framebuffer),e.deleteTexture(this.#l.texture),this.#l=null)}#F(e){const t=this.#s.pop();if(t!==void 0)return t;const i=this.#t,s=i.createBuffer();return i.bindBuffer(i.PIXEL_PACK_BUFFER,s),i.bufferData(i.PIXEL_PACK_BUFFER,e,i.STREAM_COPY),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),{buffer:s,bytes:e}}}function et(n){for(let e=0;e<n.length;e+=4)if(n[e]!==0||n[e+1]!==0||n[e+2]!==0)return!0;return!1}const oe=["mozParsedFrames","mozDecodedFrames","mozPresentedFrames","mozPaintedFrames"];function tt(n){return oe.every(e=>e in n)}function it(n){return n.ownerDocument?.defaultView?.performance.timeOrigin??performance.timeOrigin}const st=250,K=500,rt=1.75,nt=3,ht=200;class ot{#t;#i;#e;#l=null;#v=[];#y=0;#s=null;#n=0;#a=null;#o=null;#m=null;#E=null;#D=null;#h=null;#u=!0;#f=null;#c=null;#r=0;#F;#x;#T=null;#w=null;#S=null;#N=null;#j=0;#d=[];#M=[];constructor(e,t){if(this.#t=e,this.#e=t,this.#i=tt(e)?e:null,this.#F=this.#i===null&&typeof VideoFrame<"u",this.#x=this.#F&&e.playbackRate>1,this.#i){for(const i of["emptied","seeking","seeked"])e.addEventListener(i,this.#W);for(const i of["pause","playing","waiting","ratechange"])e.addEventListener(i,this.#B)}if(this.#F)for(const i of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])e.addEventListener(i,this.#ie)}get captureDriven(){return this.#x}request(e){if(this.#E===null){if(this.#E=e,this.#x){this.#H();return}this.#m=this.#i?requestAnimationFrame(this.#P):this.#t.requestVideoFrameCallback(this.#Z)}}cancel(){this.#m!==null&&(this.#i?cancelAnimationFrame(this.#m):this.#t.cancelVideoFrameCallback(this.#m)),this.#m=null,this.#E=null,this.#T?.(),this.#T=null,this.#S!==null&&this.#t.cancelVideoFrameCallback(this.#S),this.#S=null,this.#oe(),this.#N=null,this.#d=[],this.#x=this.#F&&this.#t.playbackRate>1,this.#W()}destroy(){this.cancel();for(const e of["emptied","seeking","seeked"])this.#t.removeEventListener(e,this.#W);for(const e of["pause","playing","waiting","ratechange"])this.#t.removeEventListener(e,this.#B);for(const e of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])this.#t.removeEventListener(e,this.#ie)}flush(e){if(this.#x)for(this.#t.ownerDocument!==this.#w&&(this.#T?.(),this.#T=null,this.#H());this.#M.length>0&&this.#E!==null;){const t=this.#M.shift(),i=t.frame;try{this.#re(e,{width:i.visibleRect?.width??i.codedWidth,height:i.visibleRect?.height??i.codedHeight,mediaTime:i.timestamp/1e6,presentedFrames:t.count,expectedDisplayTime:Math.max(t.at,e),timeOrigin:performance.timeOrigin,frame:i})}finally{i.close()}}}#oe(){for(const e of this.#M)e.frame.close();this.#M=[]}#ie=e=>{const t=this.#F&&this.#t.playbackRate>1;if(t!==this.#x){const i=this.#E;this.cancel(),this.#x=t,i!==null&&this.request(i);return}["seeking","seeked","emptied","ratechange"].includes(e.type)&&(this.#N=null,this.#d=[]),this.#x&&((e.type==="pause"||e.type==="ended")&&this.flush(performance.now()),this.#oe(),this.#T?.(),this.#T=null,this.#E!==null&&this.#H())};#H(){if(!this.#x||this.#T!==null||this.#E===null||(this.#t.paused||this.#t.ended)&&this.#N!==null)return;this.#S===null&&typeof this.#t.requestVideoFrameCallback=="function"&&(this.#S=this.#t.requestVideoFrameCallback(this.#se));const e=Math.max(4,8/Math.max(1,this.#t.playbackRate)),t=this.#t.ownerDocument?.defaultView;if(this.#w=this.#t.ownerDocument,t){const i=t.setTimeout(this.#q,e);this.#T=()=>t.clearTimeout(i)}else{const i=setTimeout(this.#q,e);this.#T=()=>clearTimeout(i)}}#se=()=>{this.#S=null,this.#T?.(),this.#T=null,this.#q()};#q=()=>{this.#T=null;const e=this.#t;if(this.#E===null)return;if(e.readyState<2||e.seeking){this.#H();return}let t;try{t=new VideoFrame(e)}catch(i){if(!(i instanceof DOMException)||i.name!=="InvalidStateError")throw i;this.#H();return}if(t.timestamp===this.#N)t.close();else{let i=1;if(this.#N!==null){const s=t.timestamp-this.#N;if(s>1e3&&s<25e4&&(this.#d.push(s),this.#d.length>7&&this.#d.shift()),s>0&&this.#d.length>0){const r=[...this.#d].sort((o,a)=>o-a),h=r[Math.floor(r.length/2)];i=Math.max(1,Math.round(s/h))}}for(this.#N=t.timestamp,this.#j+=i,this.#M.push({frame:t,at:performance.now(),count:this.#j});this.#M.length>4;)this.#M.shift().frame.close()}this.#H()};#B=()=>{this.#f=null,this.#c=null,this.#r=0};#W=()=>{this.#D=null,this.#h=null,this.#u=!0,this.#I(),this.#B()};#I(){this.#l?.reset(),this.#v=[],this.#n=0}#Z=(e,t)=>{this.#re(e,{width:t.width,height:t.height,mediaTime:t.mediaTime,presentedFrames:t.presentedFrames,expectedDisplayTime:t.expectedDisplayTime,timeOrigin:it(this.#t)})};#re=(e,t)=>{const i=this.#E;this.#m=null,this.#E=null,i?.(e,t)};#P=e=>{const t=this.#i,i=oe.map(a=>t[a]);this.#D?.some((a,c)=>i[c]<a)&&this.#W(),this.#D=i;const s=this.#e?.()??null;s!==this.#l&&(this.#W(),this.#l=s);const r=t.mozPaintedFrames,h=!t.seeking&&t.readyState>=2&&t.videoWidth>0&&t.videoHeight>0,o=this.#h===null&&(r>0||t.paused&&(t.mozPresentedFrames>0||t.mozDecodedFrames>0));if(s!==null){this.#pe(e,t,s,h,o);return}if(h&&(o||this.#h!==null&&r!==this.#h)){this.#f!==null&&e-this.#f>K&&(this.#B(),this.#u=!0),this.#Q(e,t),this.#f=e,this.#h=r;const a=this.#u;this.#u=!1,this.#re(e,{width:t.videoWidth,height:t.videoHeight,mediaTime:t.currentTime,presentedFrames:r,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#r,discontinuity:a}})}else this.#m=requestAnimationFrame(this.#P)};#Q(e,t){if(t.paused||t.ended)return;const i=t.mozPaintedFrames,s=this.#c;if(s&&e-s.at>=st){const r=i-s.frames;if(r>0){const h=(e-s.at)/r;h>=4&&h<=200&&(this.#r=this.#r?this.#r+(h-this.#r)*.25:h)}this.#c=null}this.#c??={at:e,frames:i}}#pe(e,t,i,s,r){const h=t.mozPaintedFrames,o=this.#h!==null&&h!==this.#h;this.#s!==null&&e-this.#s>K&&(this.#I(),this.#B(),this.#u=!0),this.#s=e,o&&this.#Q(e,t);const a=t.paused||t.ended;(!a||o)&&(this.#n=0),a&&this.#a!==null&&(this.#a=e);const c=a&&this.#n>=nt;if(s&&(r||this.#h!==null)){this.#h=h;const l=c?null:i.take();l!==null&&this.#v.push({id:l,at:e,mediaTime:t.currentTime,width:t.videoWidth,height:t.videoHeight,resting:a})}let u=null;for(let l=i.settle();l!==null;l=i.settle()){const f=this.#v.shift();if(f?.id!==l.id)throw new Error("picture verdicts arrived out of order");let p=l.changed;if(p?this.#n=0:(this.#n=f.resting?this.#n+1:0,p=u===null&&!f.resting&&this.#a!==null&&(f.at-this.#a)*(t.playbackRate||1)>=ht&&h!==this.#o),!p){i.release(f.id);continue}u!==null&&i.release(u.id),u=f}if(u===null){this.#m=requestAnimationFrame(this.#P);return}let d=1;if(this.#f!==null){const l=u.at-this.#f;l>K?(this.#B(),this.#u=!0):this.#r>0&&l>this.#r*rt&&(d=Math.round(l/this.#r))}this.#y+=d,this.#f=u.at,this.#a=u.at,this.#o=h;const m=this.#u;this.#u=!1;try{this.#re(e,{width:u.width,height:u.height,mediaTime:u.mediaTime,presentedFrames:this.#y,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#r,discontinuity:m},picture:u.id})}finally{i.release(u.id)}}}let at=null;const Y=.5,g=4,j=5,_=j+1,ae=1e3,ue=4,z=200,ut=.25,lt=1e3/60,ct=`#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`,ft=.75,dt=.1,le=1,mt=60,pt=.02,Et=.1,W=1,vt=.02,bt=.005,xt=250,ce=1e3,fe=16,Tt=4,gt=90,Ft=1.5,de=4,Rt=24,k=.001,V=5,me=4,pe={2:0,3:.25,4:.5,5:.75};function Ee(n){return _t[(n.interlaced?2:0)+(n.topFieldFirst?1:0)]}const yt=`#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`,_t=[{interlaced:!1,topFieldFirst:!1},{interlaced:!1,topFieldFirst:!0},{interlaced:!0,topFieldFirst:!1},{interlaced:!0,topFieldFirst:!0}],At={requestAnimationFrame:n=>requestAnimationFrame(n),cancelAnimationFrame:n=>cancelAnimationFrame(n)},Nt={setTimeout:(n,e)=>setTimeout(n,e),clearTimeout:n=>clearTimeout(n)};class wt extends EventTarget{decodedVideo;#t;#i;#e;#l;#v;#y=null;#s;#n=null;#a;#o;#m;#E;#D;#h=[];#u=[];#f=_-1;#c=null;#r=[];#F=null;#x=null;#T=Number.NEGATIVE_INFINITY;#w=0;#S=null;#N=null;#j;#d=lt;#M=0;#oe=0;#ie=0;#H=0;#se=null;#q=0;#B=0;#W=0;#I(){this.#r.length=0,this.#Ve.length=0,this.#se=null,this.#q=0,this.#B=0,this.#H=0}#Z=null;#re;#P;#Q;#pe=0;#ae;#O;#L=0;#X=0;#J=0;#_=g-1;#A=0;#Je=0;#$t=0;#Ze=!1;#C=!1;#ee=0;#Ce=!1;#te=!1;#U=null;#Ie=[];#ne=!1;#zt;#Wt;#k;#ke;#Ee;#Vt;#p=null;#g;#et=!1;#Ht=0;#qt=!1;#Es=0;#tt=!1;#xt=!1;#Le=null;#vs=0;#it=new Map;#R={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0};#st=0;#rt=0;#Tt=0;#ue=0;#Re=0;#ye=0;#Ue=0;#ve=0;#Be;#gt=[];#Oe=[];#nt=0;#Xe=0;#ht=0;#Ge=0;#ot=M;#$e=0;#G=M;#K=!1;#$=0;#Ft=!1;#_e=!1;#Kt=!1;#Yt=!1;#jt=!1;#at=!1;#ze=null;#Ni="";#Rt=[0,0,0,0,0,0];#yt=0;#Ae=null;#Qt=null;#Jt=0;#b=!1;#Ne=[];#Zt=!1;#V=new je;#ut;#wi=!1;#we=Array.from({length:g},()=>({timestamp:0,duration:0,interlaced:!0,topFieldFirst:!0,repeatFirstField:!1}));#ei=!1;#_t=Number.NEGATIVE_INFINITY;#We=!1;#lt=!1;#Ve=[];#At=null;#be=null;#He=null;#ti=Number.NEGATIVE_INFINITY;#he=!1;#le=0;#qe=0;#ct=1;#Se=null;#ce=Number.NaN;#Si=0;#fe=Number.NaN;#Mi=0;#ii=Number.NaN;#si=!0;#ft=0;#dt=0;#ri=null;#Nt=!1;#ni=0;#hi=0;#wt=!1;#Pi=Number.NaN;#Di=Number.NaN;#St=new Map;#bs=0;constructor(e,t={},i=null){super(),this.#e=e,this.#P=t.doubleRate??!1,this.#Q=t.spatialCheck??!0,this.#ae=t.debug??!1,this.#O=t.film??!1,this.#zt=t.onStats,this.#Wt=t.onFailure,this.#k=i,this.#Ee=i?"main":t.rendering??"main",this.#Vt=t.workerUrl??at,this.#g=this.#Ee==="main"?"main":"idle",this.#i=i?i.canvas:document.createElement("canvas"),this.#t=i?.canvas??(this.#Ee==="main"?this.#i:document.createElement("canvas")),this.#ke=e,i||(this.#i.style.cssText="position:absolute;pointer-events:none;visibility:hidden");const s=this.#t.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"});if(!(s instanceof WebGL2RenderingContext))throw new Error("this browser has no WebGL2");this.#s=s,this.#O&&(this.#ki(),this.#n=new ie(s)),this.#a=ve(s,$e);const r=this.#a;this.#o=Object.fromEntries(Object.entries(Ge).map(([h,o])=>[h,s.getUniformLocation(r,o)])),this.#m=ve(s,yt),this.#E=s.getUniformLocation(this.#m,"uField"),this.#D=s.getUniformLocation(this.#m,"uFlip"),S(s,this.#a,s.RGBA8),S(s,this.#m,s.RGBA8),this.#ut=new He(s),this.#Ts(),this.#Be=s.getExtension("EXT_disjoint_timer_query_webgl2"),this.#t.addEventListener("webglcontextlost",this.#ps),this.#re=i?null:new ResizeObserver(()=>this.#Qe()),this.#j=i?null:new MutationObserver(()=>{this.#i.ownerDocument!==this.#N&&this.#Qe()}),this.decodedVideo={push:h=>this.#Ds(h),reset:()=>this.#Xi(),finish:()=>{this.#Zt=!0,this.#p?.postMessage({type:"pictures",action:"finish"})},onrelease:null,avDifference:()=>this.#p?this.#ii:this.#fe,startsAt:(h,o)=>{if(!Number.isFinite(h)||!Number.isFinite(o))throw new RangeError(`start at ${h} s, ${o} ms`);if(this.#p){this.#p.postMessage({type:"start",media:h,at:o,timeOrigin:performance.timeOrigin,video:this.#Me()});return}this.#Se={media:h,wall:o}},prepared:()=>this.#g==="main"?this.#wi:this.#g==="active",onprepared:null},this.#v=i?null:new Ze(s,e),this.#l=new ot(e,()=>this.#g==="main"?this.#v:null),e.addEventListener("emptied",this.#cs),e.addEventListener("resize",this.#ls),e.addEventListener("pause",this.#Fe),e.addEventListener("ended",this.#Fe),e.addEventListener("seeking",this.#ds),e.addEventListener("seeked",this.#Fe),e.addEventListener("ratechange",this.#Fe),e.addEventListener("waiting",this.#ms)}get running(){return this.#b?this.#C:this.#C&&(this.#U?.interlaced??!0)}get canvas(){return this.#i}get#Mt(){return this.#b?this.#si:this.#U?.topFieldFirst!==!1}#Ci(){return{doubleRate:this.#P,spatialCheck:this.#Q,film:this.#O,debug:this.#ae}}get enabled(){return this.#Ce}set enabled(e){this.#Ce=e,this.#Pt(),this.#p?.postMessage({type:"enabled",enabled:e})}set scan(e){if(this.#b)return;const t=this.#U?.interlaced!==e?.interlaced,i=t||this.#U?.topFieldFirst!==e?.topFieldFirst;this.#U=e,!(i&&(!this.#Ye()||this.#U!==e))&&(this.#p?.postMessage({type:"scan",scan:e}),i&&(this.#A=0,this.#I(),this.#Y(),t&&(this.#L=0),this.#c=null,this.#Te(!1)),this.#Pt(),i&&((e?.interlaced??!0)&&(this.#k||this.#g==="main")?this.#Pe():this.#pi()))}get scan(){return this.#b?this.#At?.scan??null:this.#U}set videoTimeline(e){this.#Ie=e,this.#p?.postMessage({type:"timeline",videoTimeline:e}),e.length===0&&(this.#U=null),this.#Pt()}get videoTimeline(){return this.#Ie}get container(){return this.#Z??this.#e}get doubleRate(){return this.#P}set doubleRate(e){e!==this.#P&&(this.#P=e,this.#Ke(),!this.#b&&(this.#I(),this.#Ii()))}get spatialCheck(){return this.#Q}set spatialCheck(e){e!==this.#Q&&(this.#Q=e,this.#Ke())}get film(){return this.#O}set film(e){const t=this.#p?this.#Qt:this.#Ae;if(!(e===this.#O&&(e===!1||t===null))){if(this.#p){this.#O=e,this.#Ke(e?"film":void 0);return}if(e){if(!this.#Ye())return;try{this.#Li()}catch(i){this.#O=!0,this.#Ke(),this.#Ct(`film detector unavailable: ${i instanceof Error?i.message:String(i)}`);return}}if(this.#O=e,this.#Ke(),!e){if(!this.#Ye())return;this.#K=!1,this.#$=0,this.#_e=!1,this.#G=M,this.#Y(),this.#n?.destroy(),this.#n=null}this.#Ii()}}get debug(){return this.#ae}set debug(e){e!==this.#ae&&(this.#ae=e,this.#Ke())}get#xs(){return this.#P||this.#O}#Ii(){this.#te||this.#b||(this.#xs?(this.#X>0&&this.#us(),(this.#U?.interlaced??!0)&&(this.#k||this.#g==="main")&&this.#Pe()):this.#O||(this.#c=null,this.#Te(!1),this.#bt()))}#Ke(e){this.#p?.postMessage({type:"settings",options:this.#Ci(),retryFilm:e})}#ki(){if(this.#s.getExtension("EXT_color_buffer_float")===null)throw new Error("film needs EXT_color_buffer_float")}#Ts(){const e=this.#s,t=e.fenceSync(e.SYNC_GPU_COMMANDS_COMPLETE,0);e.flush();const i=this.#ns(),s=()=>{if(e.clientWaitSync(t,0,0)===e.TIMEOUT_EXPIRED){i.setTimeout(s,fe);return}e.deleteSync(t),this.#wi=!0,this.#g==="main"&&this.decodedVideo.onprepared?.()};i.setTimeout(s,fe)}#Li(){this.#ki(),this.#n??=new ie(this.#s),this.#X>0&&this.#n.resize(this.#X,this.#J)}#Pt(){this.#b||this.#Ce&&(this.#Ie.length>0||(this.#U?.interlaced??!0))?this.start():this.stop()}#gs(){return this.#k||this.#Ee==="main"?!1:this.#g==="starting"||this.#g==="active"?!0:typeof Worker<"u"&&typeof VideoFrame<"u"&&typeof OffscreenCanvas<"u"&&this.#Vt!==null&&"transferControlToOffscreen"in HTMLCanvasElement.prototype?(this.#Ui(),!0):this.#Ee==="auto"?(this.#It(),!1):(this.#g="failed",this.#C=!1,!0)}#Ui(){this.#de(),this.#p?.terminate(),this.#p=null,this.#Lt(),this.#tt=!1,this.#xt=!1,this.#Qt=null,this.#Jt=0;let e=this.#i;if(this.#qt){e=document.createElement("canvas"),e.className=this.#i.className;const r=this.#i.getAttribute("style");r===null?e.removeAttribute("style"):e.setAttribute("style",r),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e}const t=++this.#Ht;this.#g="starting";let i,s;try{s=e.transferControlToOffscreen(),this.#qt=!0,i=new Worker(this.#Vt,{type:"module"})}catch(r){this.#mt(r instanceof Error?r.message:String(r));return}this.#p=i,i.onmessage=r=>{t===this.#Ht&&this.#Fs(r.data)},i.onerror=r=>{t===this.#Ht&&(r.preventDefault(),this.#mt(r.message||"the deinterlacer worker failed"))},i.postMessage({type:"initialize",canvas:s,options:this.#Ci(),scan:this.#U,videoTimeline:this.#Ie,enabled:this.#C,video:this.#Me()},[s]),this.#wt&&i.postMessage({type:"pageVisibility",hidden:!0,video:this.#Me()})}#Fs(e){switch(e.type){case"ready":this.#g="active",this.decodedVideo.onprepared?.(),this.#C&&(this.#pt(),this.#Gt());break;case"failed":this.#mt(e.message);break;case"consumed":{this.#tt=!1,this.#xt=!0;const t=this.#Le;this.#Le=null,t&&this.#Oi(t);break}case"visibility":this.#i.style.visibility=e.visible?"visible":"hidden";break;case"stats":{this.#b&&(this.#hi=e.stats.missed+e.stats.queueResetted),this.#ii=e.stats.avDifference;const t={...e.stats,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0},i=t.filmError??null,s=this.#Jt;if(this.#Qt=i,this.#Jt=e.filmFailure,i!==null&&e.filmFailure!==s){this.dispatchEvent(new CustomEvent("failure",{detail:i}));try{this.#Wt?.(i)}catch{}}this.dispatchEvent(new CustomEvent("stats",{detail:t})),this.#zt?.(t);break}case"capture":{const t=this.#it.get(e.id);if(this.#it.delete(e.id),!t){e.image?.close();break}e.image?t.resolve(e.image):this.#b?t.reject(new Error("no rendered picture is available")):createImageBitmap(this.#e).then(t.resolve,t.reject);break}case"release":this.#St.delete(e.id)&&this.#me(e.data);break}}#Dt(e){if(this.dispatchEvent(new CustomEvent("failure",{detail:e})),!this.#k)try{this.#Wt?.(e)}catch{}}#Ct(e){this.#Ae!==e&&(this.#Ae=e,this.#K=!1,this.#$=0,this.#_e=!1,this.#G=M,this.#Y(),this.#n?.destroy(),this.#n=null,this.#Dt(e))}#Ye(){return this.#te?!1:(this.#p||(this.#Ae=null),!0)}#mt(e){if(this.#g==="starting"&&this.#Ee==="auto"&&!this.#et){this.#It();return}if(this.#Bi(e),!this.#et){this.#et=!0,this.#Ui();return}console.error(`Deinterlacer Worker stopped: ${e}`),this.#g="failed",this.#p?.terminate(),this.#p=null,this.#de(),this.#Lt(),this.#Dt(`deinterlacer worker stopped: ${e}`),this.stop()}#It(){const e=this.#t;e.className=this.#i.className;const t=this.#i.getAttribute("style");t===null?e.removeAttribute("style"):e.setAttribute("style",t),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e,this.#qt=!1,this.#p?.terminate(),this.#p=null,this.#g="main",this.#de(),this.#Lt(),this.decodedVideo.onprepared?.(),this.#C&&(this.#pt(),this.#Gt(),(this.#U?.interlaced??!0)&&this.#Pe())}#de(){this.#Le?.frame.close(),this.#Le=null}#Bi(e){for(const t of this.#it.values())t.reject(new Error(e));this.#it.clear()}start(){if(!(this.#C||this.#te||this.#ne)&&(this.#ee++,this.#C=!0,this.#fs(),!!this.#Ye())){if(this.#ir(),this.#Gt(),this.#gs()){if(this.#b){this.#p?.postMessage({type:"running",running:!0}),this.#Pe();return}this.#p?.postMessage({type:"enabled",enabled:!0}),this.#g==="active"&&this.#pt();return}this.#pt(),(this.#b||(this.#U?.interlaced??!0))&&this.#Pe()}}stop(){this.#ee++,this.#C&&(this.#C=!1,this.#b&&this.#Xi(),this.#l.cancel(),this.#xi(),this.#pi(),this.#A=0,this.#c=null,this.#Te(!1),this.#de(),this.#p?.postMessage(this.#b?{type:"running",running:!1}:{type:"enabled",enabled:!1}))}destroy(){if(!this.#te){this.#te=!0,this.#Ce=!1,this.stop(),this.#p?.postMessage({type:"destroy"}),this.#p?.terminate(),this.#p=null,this.#de(),this.#Lt(),this.#Bi("the deinterlacer was destroyed"),this.#N?.removeEventListener("visibilitychange",this.#bi),this.#N=null,this.#j?.disconnect(),this.#t.removeEventListener("webglcontextlost",this.#ps),this.#l.destroy(),this.#v?.destroy(),this.#e.removeEventListener("emptied",this.#cs),this.#e.removeEventListener("resize",this.#ls),this.#e.removeEventListener("pause",this.#Fe),this.#e.removeEventListener("ended",this.#Fe),this.#e.removeEventListener("seeking",this.#ds),this.#e.removeEventListener("seeked",this.#Fe),this.#e.removeEventListener("ratechange",this.#Fe),this.#e.removeEventListener("waiting",this.#ms),this.#ri!==null&&(this.#e.style.aspectRatio=this.#ri),this.#ks(),this.#sr();for(const e of this.#h)this.#s.deleteTexture(e);this.#h=[],this.#bt();for(const e of[...this.#gt,...this.#Oe.map(({q:t})=>t)])this.#s.deleteQuery(e);this.#gt.length=0,this.#Oe.length=0,this.#n?.destroy(),this.#n=null,this.#ut?.destroy(),this.#ut=null,this.#ze!==null&&(ye(this.#ze),this.#ze=null),this.#s.deleteProgram(this.#a),this.#s.deleteProgram(this.#m),this.#s.getExtension("WEBGL_lose_context")?.loseContext()}}capture(){if(this.#g==="active"&&this.#i.style.visibility==="visible"&&this.#p){const s=++this.#vs,r=new Promise((h,o)=>{this.#it.set(s,{resolve:h,reject:o})});return this.#p.postMessage({type:"capture",id:s,width:this.#e.videoWidth,height:this.#e.videoHeight}),r}if(!this.#b&&(this.#g==="starting"||this.#g==="failed"))return createImageBitmap(this.#e);const e=this.#c;if((this.#k||this.#b)&&(!this.#C||this.#ne||!e))return Promise.reject(new Error("no rendered picture is available"));if(!this.#C||this.#ne||!e)return createImageBitmap(this.#e);e.kind==="texture"?this.#Fi(e.texture,e.flip,!1):this.#ge(e.flush,e.second,null,!1);const t=this.#b?this.#ft:this.#e.videoWidth,i=this.#b?this.#dt:this.#e.videoHeight;return t>0&&i>0&&(t!==this.#t.width||i!==this.#t.height)?createImageBitmap(this.#t,{resizeWidth:t,resizeHeight:i,resizeQuality:"high"}):createImageBitmap(this.#t)}addEventListener(e,t,i){super.addEventListener(e,t,i)}removeEventListener(e,t,i){super.removeEventListener(e,t,i)}#pt(){this.#k||!this.#C||this.#b||this.#l.request(this.#Ms)}#Me(){const e=[];for(let t=0;t<this.#e.buffered.length;t++)e.push({start:this.#e.buffered.start(t),end:this.#e.buffered.end(t)});return{currentTime:this.#e.currentTime,playbackRate:this.#e.playbackRate,seeking:this.#e.seeking,paused:this.#e.paused,ended:this.#e.ended,readyState:this.#e.readyState,videoWidth:this.#e.videoWidth,videoHeight:this.#e.videoHeight,buffered:e}}#Rs(e,t,i){let s;try{s=i?.clone()??new VideoFrame(this.#e,{timestamp:Math.max(0,Math.round(t.mediaTime*1e6))})}catch(h){const o=h instanceof Error?h.message:String(h);this.#Ee==="auto"&&!this.#xt&&!this.#et?(this.#It(),this.#Bt(e,t)):this.#mt(o);return}const r={id:++this.#Es,frame:s,now:e,metadata:t,video:this.#Me()};if(this.#tt){this.#Le?.frame.close(),this.#Le=r;return}this.#Oi(r)}#Oi(e){const t=this.#p;if(!t||this.#g!=="active"){e.frame.close();return}this.#tt=!0;const i={type:"frame",id:e.id,frame:e.frame,metadata:e.metadata,video:e.video};try{t.postMessage(i,[e.frame])}catch(s){this.#tt=!1,e.frame.close();const r=s instanceof Error?s.message:String(s);this.#Ee==="auto"&&!this.#xt&&!this.#et?(this.#It(),this.#Bt(e.now,e.metadata)):this.#mt(r)}}#ys(e,t,i){this.#ze==null&&(this.#ze=Fe(this.#s,"20px monospace")),_e(this.#ze,e,t,i,this.#X,this.#J,20)}#kt(e){if(this.#Be==null||this.#Oe.length>30)return;const t=this.#gt.pop()??this.#s.createQuery();return this.#s.beginQuery(this.#Be.TIME_ELAPSED_EXT,t),this.#Oe.push({q:t,isField:e}),t}#xe(e){this.#Be!=null&&(e!=null&&this.#s.endQuery(this.#Be.TIME_ELAPSED_EXT),this.#Oe=this.#Oe.filter(({q:t,isField:i})=>{if(this.#s.getQueryParameter(t,this.#s.QUERY_RESULT_AVAILABLE)){const s=this.#s.getQueryParameter(t,this.#s.QUERY_RESULT);return i?(this.#ht+=s,this.#Ge++):(this.#nt+=s,this.#Xe++),this.#gt.push(t),!1}return!0}))}#Y(e=!1){this.#G=M,this.#ot=M,this.#$e=0,e||(this.#Kt=!1),this.#K=!1,this.#n?.reset(e)}#_s(){const{prev:e,cur:t,next:i}=this.#_i(!1),s=this.#h[e],r=this.#h[t],h=this.#h[i];if(!s||!r||!h)return;const o=this.#Mt?0:1;this.#n?.measureComb(s,r,o),this.#n?.detect(r,h,o)}#As(){const{cur:e,next:t}=this.#_i(!1),i=this.#h[e],s=this.#h[t],r=this.#n;if(!i||!s||!r)return!1;const h=this.#Mt?0:1;try{r.measureComb(i,s,h,!0)}catch(o){return this.#Ct(`film detection failed: ${o instanceof Error?o.message:String(o)}`),!1}return!0}#Ns(){const e=this.#n?.poll()??null;e!==null&&(this.#ot=e,this.#$e=e.age,this.#Kt=e.instant),this.#$e++;const{phase:t,run:i}=this.#ot;t===0||this.#$e>Math.ceil(V*Math.max(1,this.#e.playbackRate))?this.#G=M:this.#G={phase:(t-1+this.#$e)%V+1,run:i}}#ws(e){const t=[],i=this.#n?.metrics??new Float32Array(0);for(let r=0;r<E.phase;r++){const h=i[r*4]??0,o=i[r*4+1]??0,a=i[r*4+2]??0;t.push(`${h.toFixed(3)},${o.toString().padStart(4)},${a.toFixed(3)}`)}const s=this.#Rt.map((r,h)=>`${h===0?"-":h}:${r}`).join(" ");return`frame=${e} phase=${this.#G.phase} run=${this.#G.run} known=${this.#ot.phase}/${this.#ot.run} age=${this.#$e} ${this.#K?"film":"video"} period=${this.#L.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#yt}`}#Et(e,t){const i=t-performance.timeOrigin;return Number.isFinite(i)&&i!==0?e+i:e}#Ss(e,t){const i=e.expectedDisplayTime;if(!Number.isFinite(i)||i<=0||!Number.isFinite(e.timeOrigin))return t;const s=this.#Et(i,e.timeOrigin),r=Tt*Math.max(this.#d,this.#L);return s<t-r||s>t+r?t:s}#Ms=(e,t)=>{if(!this.#C||this.#ne)return;this.#vi();const i=this.#Et(e,t.timeOrigin),{frame:s,picture:r,...h}=t;this.#ke=s??this.#e,this.#y=r??null;try{this.#Ps(i,h,s)}finally{this.#ke=this.#e,this.#y=null}this.#pt()};#Ps(e,t,i){if(this.#g==="active"){this.#Rs(e,t,i);return}this.#g!=="starting"&&this.#Bt(e,t)}ingestExternalFrame(e,t,i){this.#ke=i;try{this.#Bt(e,t)}finally{this.#ke=this.#e}}#Ds(e){try{if(ze(e),e.timestamp<this.#_t+k)throw new RangeError(`a picture at ${e.timestamp} s came after one at ${this.#_t} s; pictures come in presentation order`);this.#b||this.#Us()}catch(s){throw this.#me(e.data),s}if(this.#_t=e.timestamp,this.#ni++,this.#Cs(e.displayWidth,e.displayHeight),!this.#C){this.#me(e.data);return}if(this.#g==="starting"||this.#g==="active"){this.#Ls(e);return}const t=this.#Ne;t.push(e),this.#oi(this.#V.at(performance.now()));const i=Math.ceil(Rt*Math.max(1,this.#e.playbackRate));for(;t.length>i;){const s=t.pop();this.#Ut(s.timestamp+s.duration)&&this.#R.queueResetted++,this.#me(s.data)}this.#ve=Math.max(this.#ve,t.length)}#Cs(e,t){if(!(e===this.#ft&&t===this.#dt)){if(this.#ft=e,this.#dt=t,this.#k||this.#te){this.#Qe();return}this.#ri??=this.#e.style.aspectRatio,this.#e.style.aspectRatio=`${e} / ${t}`,this.#Is(),this.#e.dispatchEvent(new Event("resize"))}}#Is(){if(this.#Nt)return;this.#Nt=!0;const e=this.#e;Object.defineProperty(e,"videoWidth",{configurable:!0,get:()=>this.#ft}),Object.defineProperty(e,"videoHeight",{configurable:!0,get:()=>this.#dt}),Object.defineProperty(e,"getVideoPlaybackQuality",{configurable:!0,value:()=>({creationTime:performance.now(),totalVideoFrames:this.#ni,droppedVideoFrames:this.#R.missed+this.#R.queueResetted+this.#hi,corruptedVideoFrames:0})})}#ks(){if(!this.#Nt)return;this.#Nt=!1;const e=this.#e;delete e.videoWidth,delete e.videoHeight,delete e.getVideoPlaybackQuality}#Ls(e){const t=++this.#bs;try{this.#p.postMessage({type:"picture",id:t,picture:e},[e.data])}catch(i){throw this.#me(e.data),i}this.#St.set(t,e.data)}#Lt(){const e=[...this.#St.values()];this.#St.clear();for(const t of e)this.#me(t)}#Us(){this.#b=!0,this.#de(),this.#l.cancel(),this.#xi(),this.#A=0,this.#I(),this.#Y(),this.#c=null,this.#X=0,this.#J=0,this.#V.hold(),this.#Pt(),this.#Pe()}#me(e){const t=this.decodedVideo.onrelease;if(t!==null)try{t(e)}catch(i){queueMicrotask(()=>{throw i})}}#Xi(){if(!this.#b)return;this.#p?.postMessage({type:"pictures",action:"reset"});const e=this.#Ne;this.#Ne=[],this.#Zt=!1,this.#ei=!1,this.#_t=Number.NEGATIVE_INFINITY,this.#ii=Number.NaN,this.#We=!1,this.#lt=!1,this.#A=0,this.#I(),this.#be=null,this.#He=null,this.#ti=Number.NEGATIVE_INFINITY,this.#he=!1,this.#Se=null,this.#ce=Number.NaN,this.#fe=Number.NaN,this.#Y(),this.#$=0,this.#V.hold();for(const t of e)this.#me(t.data)}#oi(e){const t=this.#Ne;for(;t.length>2&&t[2].timestamp<=e;){const i=t.shift();this.#zi(i.timestamp+i.duration),this.#me(i.data)}}#Gi(e){return!(e<=this.#V.origin+k)}#Ut(e){return this.#wt||!this.#Gi(e)?!1:!(this.#V.origin===this.#Di&&e<=this.#Pi+k)}#$i(e){if(e===this.#wt||(this.#wt=e,this.#p?.postMessage({type:"pageVisibility",hidden:e,video:this.#Me()}),e))return;const t=this.#V.at(performance.now()),i=this.#e.currentTime;this.#Pi=Number.isNaN(t)?i:Math.max(t,i),this.#Di=this.#V.origin}observePageVisibility(e){this.#$i(e)}#zi(e){this.#Ut(e)&&this.#R.missed++}#Wi(e){const t=this.#e;this.#V.observe(e,t.currentTime,t.playbackRate,!t.paused&&!t.seeking&&!t.ended)&&(this.#R.resynced++,Number.isNaN(this.#ce)&&(this.#he=!1))}observeMediaClock(e,t){this.#Wi(this.#Et(e,t))}observeStart(e,t,i){this.#Se={media:e,wall:this.#Et(t,i)}}#Bs(){this.#x!==null&&(this.#Hi(),this.#Vi());const e=this.#ns(),t=this.#M+this.#d-de,i=e.setTimeout(()=>{this.#x=null,this.#Vi()},Math.max(0,t-performance.now()));this.#x={timers:e,handle:i}}#Vi(){performance.now()-this.#T<this.#d-de||this.#Os()}#Hi(){const e=this.#x;e!==null&&(this.#x=null,e.timers.clearTimeout(e.handle))}#Os(){this.#T=performance.now(),this.#p?.postMessage({type:"clock",video:this.#Me(),at:performance.now(),timeOrigin:performance.timeOrigin})}#Xs(){const e=this.#e;this.#k||this.#Wi(performance.now());const t=this.#M+this.#d;if(e.paused)this.#Se=null,this.#ce=Number.NaN,this.#he=!1;else if(this.#Se!==null){const o=this.#Se;if(t<o.wall){if(!this.#he)return;const a=this.#ct,c=this.#li(t,a),u=this.#ee;this.#qi(c,a),this.#z(u)&&this.#Ji(c,a,!1);return}this.#Se=null,this.#he=!0,this.#le=o.media+(t-o.wall)*e.playbackRate/1e3,this.#qe=t,this.#ct=e.playbackRate,this.#ce=t,this.#fe=Number.NaN}let i=this.#V.rate;const s=this.#V.at(t);let r;if(!Number.isNaN(this.#ce)&&(Number.isNaN(s)||!(i>0))){if(t-this.#ce>xt){this.#ce=Number.NaN,this.#he=!1;return}i=this.#ct,r=this.#qe===t?this.#le:this.#li(t,i)}else{if(this.#ce=Number.NaN,Number.isNaN(s))return;r=e.paused?s:this.#Hs(s,i)}const h=this.#ee;this.#qi(r,i),this.#z(h)&&this.#Ji(r,i,e.paused)}#qi(e,t){const i=this.#ee,s=Ft*this.#d*Math.max(1,t)/1e3;for(this.#oi(e);;){const o=this.#Ne[0];if(o===void 0||o.timestamp>e+s+o.duration||(o.width===this.#X&&o.height===this.#J?this.#ji():_)<this.#Gs(o))break;if(this.#Ne.shift(),this.#$s(o,e,t),!this.#z(i))return;this.#oi(e)}if(!this.#We||this.#lt||this.#Ne.length>0||this.#ji()<this.#Ki())return;const r=this.#we[this.#_],h=W*t/1e3;(this.#Zt||r.timestamp<=e+h)&&(this.#ai(!0,e,t),this.#lt=!0)}#Ki(){return this.#P&&!this.#K?2:1}#Gs(e){const t=!e.interlaced||!this.#Ce;return(this.#We?this.#Ki():0)+(t?1:0)}#Yi(e){const t=this.#u[e];if(t===void 0)return!1;const i=this.#c;if(i?.kind==="texture"&&i.texture===t.texture||this.#be?.slot===e||this.#He?.slot===e)return!1;for(const s of this.#Ve)if(s.slot===e)return!1;return!0}#ji(){let e=0;for(let t=0;t<this.#u.length;t++)this.#Yi(t)&&e++;return e}#Qi(){for(let e=1;e<=_;e++){const t=(this.#f+e)%_;if(this.#Yi(t))return t}return null}#$s(e,t,i){this.#Si=e.duration/(e.interlaced?e.repeatFirstField?3:2:1);const s=this.#ei?this.#we[this.#_]:null,r=s===null?0:s.timestamp+s.duration,h=e.width!==this.#X||e.height!==this.#J,o=s===null||h||e.timestamp<r-k||e.timestamp-r>Y,a=!o&&e.timestamp-r>k,c=!e.interlaced||!this.#Ce,u=this.#We,d=this.#lt;this.#We=!1,this.#lt=!1,u&&!d&&(o||c)&&!h&&this.#ai(!0,t,i),o?(s!==null&&this.#R.discontinuities++,this.#A=0,this.#Y(),this.#$=0):s!==null&&!c&&s.interlaced&&s.topFieldFirst!==e.topFieldFirst&&this.#Y(!0);const m=performance.now();this.#Ri(m),this.#rt=m;const l=this.#ee,f=this.#kt(!1);try{if(h&&(this.#Ai(e.width,e.height),this.#u.length!==_))throw new Error("decoded pictures have no output textures");this.#zs(e)}catch(p){this.#xe(f),this.#Dt(p instanceof Error?p.message:String(p)),this.stop();return}finally{this.#me(e.data)}if(c)e.interlaced||(this.#$>0&&this.#$--,this.#at=!0),this.#Ws(),this.#A=0;else{if(u&&!o){const p=this.#we[(this.#_+g-1)%g];this.#si=p.topFieldFirst,this.#es(),this.#z(l)&&this.#ts(a?1:0,Math.round(p.timestamp*1e3),this.#P),this.#z(l)&&this.#ai(!1,t,i)}else this.#jt=a;this.#at=!1,this.#We=!0}if(!this.#z(l)){this.#te||this.#xe(f);return}this.#xe(f),this.#Re+=performance.now()-m,this.#ue++,this.#yi(m)}#zs(e){this.#_=(this.#_+1)%g,this.#ut.convert(e,this.#h[this.#_]);const t=this.#we[this.#_];t.timestamp=e.timestamp,t.duration=e.duration,t.interlaced=e.interlaced,t.topFieldFirst=e.topFieldFirst,t.repeatFirstField=e.repeatFirstField,this.#A=Math.min(this.#A+1,g),this.#ei=!0}#Ws(){const e=this.#we[this.#_],t=this.#Qi();if(t===null){this.#R.late++;return}this.#f=t,this.#os(this.#h[this.#_],!0,this.#u[t].framebuffer),this.#Ve.push({slot:t,time:e.timestamp,picture:e.timestamp,end:e.timestamp+e.duration,start:!0,scan:Ee(e)})}#ai(e,t,i){const s=this.#we[e?this.#_:(this.#_+g-1)%g],r=this.#Ve;for(;r.length>0&&r.at(-1).picture===s.timestamp;)r.pop();this.#si=s.topFieldFirst;const h=e?Number.POSITIVE_INFINITY:this.#we[this.#_].timestamp,o=Ee(s),a=s.timestamp+s.duration;let c=!1;if(this.#K&&!e){const u=this.#G.phase;if(u===G){this.#yt++;return}const d=s.timestamp+(pe[u]??0)*s.duration;c=this.#ui(d,d+s.duration*V/me,h,s.timestamp,a,!0,!1,null,e,o,t,i)!==null}else if(!this.#P)c=this.#ui(s.timestamp,h,h,s.timestamp,a,!0,!1,null,e,o,t,i)!==null;else{const u=s.repeatFirstField?3:2,d=s.duration/u;let m=null;for(let l=0;l<u;l++){const f=s.timestamp+l*d,p=this.#ui(f,l+1<u?f+d:h,h,s.timestamp,a,l===0,l===1,l===2?m:null,e,o,t,i);l===0&&(m=p),p!==null&&(c=!0)}}!c&&h<=t&&this.#zi(a)}#ui(e,t,i,s,r,h,o,a,c,u,d,m){if(!this.#Vs(e,t,i,d,m))return this.#Ut(t)&&this.#R.late++,null;if(a===null){if(a=this.#Qi(),a===null)return this.#R.late++,null;this.#f=a,this.#ge(c,o,this.#u[a].framebuffer)}return this.#Ve.push({slot:a,time:e,picture:s,end:Number.isFinite(i)?Math.max(t,i):r,start:h,scan:u}),a}#Vs(e,t,i,s,r){if(r===0)return i>s;const h=2*W*r/1e3;if(t<=s-h)return!1;const o=this.#d*r/1e3;if(t-e+2*h>=o)return!0;const a=Math.max(0,Math.ceil((e-h-s)/o));return s+a*o<t+h}#Ji(e,t,i){const s=this.#Ve;let r=0;for(;r<s.length&&!this.#Gi(s[r].end);)r++;r>0&&s.splice(0,r);let h=-1;if(i){for(let a=0;a<s.length&&s[a].picture<=e;a++)s[a].start&&(h=a);if(h<0){const a=this.#be,c=this.#He;let u=a!==null&&a.picture<=e?a:null;c!==null&&c.picture<=e&&(u===null||c.picture>u.picture)&&(u=c),u!==null&&u!==this.#At&&this.#ci(u);return}}else{this.#qs(s,e,t);return}const o=s[h];s.splice(0,h+1),this.#ci(o)}#Hs(e,t){const i=this.#M+this.#d,s=this.#Zi(t);if(!(t>0))return this.#he=!1,e;if(!this.#he)this.#he=!0,this.#le=e,this.#ct=t,this.#fe=Number.NaN;else{this.#li(i,t);const r=e-this.#le;Math.abs(r)>=Math.max(vt*t,s)&&(this.#le+=Math.trunc(r/s)*s)}return this.#qe=i,this.#Ks(e-this.#le),this.#le}#li(e,t){const i=Math.max(1,Math.round((e-this.#qe)/this.#d));return this.#le+=i*this.#Zi(t),this.#qe=e,this.#ct=t,this.#le}#qs(e,t,i){let s=0;for(;s<e.length&&e[s].time<=this.#ti;)s++;s>0&&e.splice(0,s);const r=k*i;let h=-1;for(let a=0;a<e.length&&e[a].time<=t+r;a++)h=a;if(h<0)return;for(let a=0;a<h;a++)this.#Ut(e[a+1].time)&&this.#R.late++;const o=e[h];e.splice(0,h+1),this.#ci(o)}#Zi(e){const t=this.#d*e/1e3,i=this.#Si;if(!(i>0))return t;const s=t/i,r=s>=1?Math.round(s):1/Math.round(1/s);return Math.abs(s/r-1)<=bt?r*i:t}#Ks(e){const t=performance.now(),i=t-this.#Mi;this.#Mi=t,Number.isNaN(this.#fe)||i>ce?this.#fe=e:this.#fe+=(e-this.#fe)*i/ce}#ci(e){const t=performance.now(),i=this.#kt(!0);this.#gi(e.slot),this.#xe(i),this.#Ue+=performance.now()-t,this.#ye++,this.#At=e,this.#ti=e.time,!(e===this.#be||e===this.#He)&&(e.start||this.#be?.picture!==e.picture)&&(this.#He=this.#be,this.#be=e.start?e:null)}#Bt(e,t){const i=this.#ee;if(this.#z(i)&&(this.#Ys(t.mediaTime),!!this.#z(i)&&t.width>0&&t.height>0)){let s=!1;if(!this.#Ze&&this.#e.seeking){const f=this.#e.buffered,p=this.#L>=ue?this.#L/1e3:z/1e3;for(let b=0;b<f.length;b++)if(t.mediaTime>=f.start(b)&&t.mediaTime<f.end(b)&&Math.abs(t.mediaTime-this.#e.currentTime)<=p){s=!0;break}}if(s&&(this.#Ze=!0),(this.#X===0||this.#J===0)&&this.#Ai(t.width,t.height),!this.#z(i))return;if(this.#U&&!this.#U.interlaced){const f=performance.now();this.#Ri(f),this.#rt=f,this.#$>0&&this.#$--,this.#at=!0,this.#er(),this.#Re+=performance.now()-f,this.#ue++,this.#ye++,this.#yi(f);return}const r=t.mediaTime-this.#Je,h=t.mozTiming,o=s||(h?h.discontinuity||r<0||r>Y:r<0||r>Y);o&&(this.#A=0,this.#L=0,this.#R.discontinuities++,this.#I(),this.#Y(),(s||!this.#at)&&(this.#$=0)),this.#at=!1;const a=this.#tr(t.presentedFrames,o);if(this.#A>0&&t.mediaTime===this.#Je&&(!h||t.presentedFrames===this.#$t))return;if(!o){const f=h?.periodMs??0;f>0?this.#is(f*(this.#e.playbackRate||1)/1e3,1):this.#A>0&&r>0&&this.#is(r,a+1)}this.#Je=t.mediaTime,this.#$t=t.presentedFrames;const c=performance.now();this.#Ri(c),this.#rt=c;const u=performance.now(),d=this.#kt(!1);if(this.#as(),this.#es(),!this.#z(i)){this.#te||this.#xe(d);return}if(this.#ts(a,t.presentedFrames,this.#P&&this.#vt()),!this.#z(i)){this.#te||this.#xe(d);return}const l=this.#Ss(t,e)+this.#d;if(this.#K)if(this.#vt()){const f=this.#G.phase;if(f===G)this.#yt++,this.#H++;else{const p=this.#L*V/me,b=this.#mi(1,e,p),T=pe[f]??0,x=b||this.#se===null?l+p:l+T*this.#L;this.#Ot("film",!1,this.#fi("film",x,p),p)}}else this.#ge(!1,!1,null);else if(this.#P&&this.#vt()){const f=this.#L/2,b=this.#mi(2,e,f)||this.#se===null?l+f*2:l,T=this.#fi("field",b,f);this.#Ot("field",!1,T,f),this.#Ot("field",!0,T+f,f)}else if(this.#vt()){const f=this.#L,b=this.#mi(1,e,f)||this.#se===null?l+f:l;this.#Ot("frame",!1,this.#fi("frame",b,f),f)||(this.#R.late++,this.#ge(!1,!1,null))}else this.#R.late+=this.#r.length,this.#I(),this.#ge(!1,!1,null);this.#ve=Math.max(this.#ve,this.#r.length),this.#xe(d),this.#Re+=performance.now()-u,this.#ue++,this.#yi(c)}}#es(){if(this.#O&&!this.#Ae&&!this.#n)try{this.#Li()}catch(e){this.#Ct(`film detector unavailable: ${e instanceof Error?e.message:String(e)}`)}}#ts(e,t,i){if(this.#Ft=!1,this.#_e=!1,this.#Yt=!1,this.#O&&!this.#Ae){let s=!1;if(this.#A===g&&e===0)try{this.#Ns(),this.#_s(),s=!0}catch(r){this.#Ct(`film detection failed: ${r instanceof Error?r.message:String(r)}`)}else this.#Y(!0);this.#Rt[this.#G.phase]=(this.#Rt[this.#G.phase]??0)+1,this.#K=this.#G.phase!==0&&this.#G.run>=q,this.#K?this.#$=gt:this.#$>0&&this.#$--,this.#Ft=s&&!this.#jt,this.#_e=this.#Ft&&this.#$>0,this.#Yt=this.#_e&&!this.#K&&i&&this.#As(),this.#_e&&!this.#K&&this.#R.matched++,this.#ae&&(this.#Ni=this.#ws(t))}this.#jt=e>0}#z(e){return!this.#te&&this.#C&&e===this.#ee}#Ys(e){const t=this.#ee;let i;for(let h=this.#Ie.length-1;h>=0;h--){const o=this.#Ie[h];if(o.start<=e+1e-6){i=o;break}}if(i?.codedSize&&(i.codedSize.width!==this.#X||i.codedSize.height!==this.#J)&&this.#Ai(i.codedSize.width,i.codedSize.height),!this.#z(t))return;const s=i?.scan;if(!s||this.#U?.interlaced===s.interlaced&&this.#U.topFieldFirst===s.topFieldFirst)return;const r=this.#U?.interlaced;this.#U=s,this.#A=0,this.#I(),this.#Ye()&&(r!==s.interlaced&&(this.#L=0),s.interlaced&&(this.#k||this.#g==="main")?this.#Pe():this.#pi(),this.#Y())}#vt(){return(this.#P||this.#O)&&this.#L>0&&this.#u.length===_}#is(e,t){const s=e*1e3/(this.#e.playbackRate||1)/t;s<ue||s>z||(this.#L=this.#L>0&&s>this.#L*ft?this.#L+(s-this.#L)*ut:s)}#Ot(e,t,i,s){const r=this.#ss();if(r===null)return!1;const h=this.#u[r];if(!h)return!1;for(this.#f=r;this.#r.length>0&&this.#r[0]?.slot===r;)this.#r.shift(),this.#R.late++;this.#ge(!1,t,h.framebuffer);const o={slot:r,at:i,duration:s,cadence:e,phase:e==="film"?this.#G.phase:e==="field"?t?2:1:0,droppedBefore:this.#H};return this.#H=0,this.#r.push(o),this.#se=o,!0}#fi(e,t,i){if(!(i>0))return t;const s=this.#se,r=this.#d;if(s!==null&&s.cadence===e){const h=s.at+s.duration,o=h-t,a=Math.round(o/r),c=a-this.#q,u=o-a*r;if(a>=0&&c<=1){const d=h+Math.max(-le,Math.min(le,-u*dt));if(c===0)return this.#B=0,d;if(this.#B===0||c>0!=this.#W>0?(this.#B=0,this.#W=c):Math.abs(c)<Math.abs(this.#W)&&(this.#W=c),++this.#B<mt)return d;const m=this.#W;return this.#B=0,m<0?(this.#q+=m,d):(this.#R.resynced++,this.#di(d-m*r))}if(a<0&&this.#q-a<=1)return this.#q-=a,this.#B=0,this.#R.resynced++,this.#di(t)}return this.#q=0,this.#B=0,s!==null&&this.#R.resynced++,this.#di(t)}#di(e){for(let t=this.#r.at(-1);t&&t.at>=e;)this.#r.pop(),this.#R.late++,t=this.#r.at(-1);return e}#mi(e,t,i){const s=this.#r.at(-1),r=(j+1)*Math.max(this.#d,i);if(s&&s.at-t>r)return this.#I(),this.#R.queueResetted++,!0;const h=Math.max(0,this.#r.length+e-j);let o=0,a=0;for(;a<h;){const c=this.#r.shift();if(!c)break;o+=c.duration,a++}for(const c of this.#r)c.at-=o;return this.#R.late+=a,!1}#ss(){const e=this.#c?.kind==="texture"?this.#c.texture:null,t=new Set(this.#r.map(({slot:s})=>s));for(let s=1;s<=_;s++){const r=(this.#f+s)%_,h=this.#u[r];if(h&&h.texture!==e&&!t.has(r))return r}const i=this.#r[0];if(i){const s=this.#u[i.slot];if(s&&s.texture!==e)return i.slot}return null}#Pe(){this.#F===null&&(!this.#C||this.#ne||(this.#w=0,this.#F=this.#je(this.#Ei)))}#pi(){this.#Xt(this.#F),this.#F=null,this.#Hi(),this.#I()}#Ei=e=>{if(this.#F=null,!this.#C||this.#ne)return;this.#js(e);const t=this.#ee;if(this.#b)this.#k||this.#g==="main"?this.#Xs():this.#Bs();else{if(this.#l.flush(e),!this.#z(t))return;this.#g==="main"&&this.#Js(this.#M,e)}this.#z(t)&&(this.#F=this.#je(this.#Ei))};#js(e){const t=e-this.#w;this.#w=e;const i=Math.max(1,Math.round(t/this.#d)),s=this.#M+i*this.#d,r=e-s;if(this.#M===0||t<=0||t>z||Math.abs(r)>this.#d/4){t>=1&&t<=z&&(this.#d=t),this.#M=e;return}this.#d+=r/i*pt,this.#M=s+r*Et}#rs(){const e=this.#k;if(e)return{frames:e,origin:performance.timeOrigin};const t=this.#hs();return t===null?{frames:At,origin:performance.timeOrigin}:{frames:t,origin:t.performance.timeOrigin}}#je(e){const{frames:t,origin:i}=this.#rs(),s=t.requestAnimationFrame(r=>e(this.#Et(r,i)));return{frames:t,handle:s}}#ns(){return this.#hs()??Nt}#hs(){return this.#i.ownerDocument?.defaultView??this.#e.ownerDocument?.defaultView??null}#Xt(e){e?.frames.cancelAnimationFrame(e.handle)}#vi(){if(this.#k)return;this.#Qs(),this.#N&&this.#$i(this.#N.hidden);const{frames:e}=this.#rs(),t=this.#F!==null&&this.#F.frames!==e,i=this.#S!==null&&this.#S.frames!==e;!t&&!i||(this.#w=0,t&&(this.#Xt(this.#F),this.#F=this.#je(this.#Ei)),i&&(this.#Xt(this.#S),this.#S=this.#je(this.#Ti)))}#Qs(){const e=this.#k?null:this.#i.ownerDocument??null;e!==this.#N&&(this.#N?.removeEventListener("visibilitychange",this.#bi),this.#N=e,e?.addEventListener("visibilitychange",this.#bi),this.#j?.disconnect(),e&&this.#j?.observe(e,{childList:!0,subtree:!0}))}#bi=()=>{this.#te||this.#vi()};#Gt(){this.#k||this.#b||this.#S!==null||!this.#l.captureDriven||!this.#C||this.#ne||(this.#S=this.#je(this.#Ti))}#xi(){this.#Xt(this.#S),this.#S=null}#Ti=e=>{if(this.#S=null,!this.#C||this.#ne)return;const t=this.#ee;this.#l.flush(e),this.#z(t)&&this.#l.captureDriven&&(this.#S=this.#je(this.#Ti))};#Js(e,t){const i=this.#d/2,s=a=>{const c=a.at-e;return c<=i-W?!0:c>i+W?!1:this.#oe>0};for(;this.#r[1]&&s(this.#r[1]);)this.#R.late++,this.#r.shift();const r=this.#r[0];if(!r||!s(r))return;this.#r.shift(),this.#oe=r.at-e;const h=performance.now(),o=this.#kt(!0);this.#gi(r.slot),this.#xe(o),this.#Ue+=performance.now()-h,this.#ye++,this.#ae&&this.#Zs(r,t),this.#ie=t}#Zs(e,t){const i=this.#ie===0?0:t-this.#ie,s=i/this.#d,r=e.cadence==="film"?`phase ${e.phase}`:e.cadence==="field"?`field ${e.phase}`:"frame",h=e.phase===0?"duplicate":`phase ${G}`,o=e.droppedBefore>0?`, ${h} dropped before it`+(e.droppedBefore>1?` (${e.droppedBefore})`:""):"";console.log(`yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at-t).toFixed(2)} ms${o}`)}#gi(e){const t=this.#u[e];t&&this.#Fi(t.texture)}#er(){this.#as();const e=this.#h[this.#_];e&&this.#Fi(e,!0),this.#A=0}#Te(e){if(this.#k){this.#k.onVisibility(e);return}this.#i.style.visibility=e?"visible":"hidden"}#Fi(e,t=!1,i=!0){this.#os(e,t,null),this.#c={kind:"texture",texture:e,flip:t},this.#Te(!0),i&&this.#pe++}#os(e,t,i){const s=this.#s;s.bindFramebuffer(s.FRAMEBUFFER,i),s.useProgram(this.#m),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this.#E,0),s.uniform1i(this.#D,t?1:0),s.viewport(0,0,this.#X,this.#J),s.drawArrays(s.TRIANGLES,0,3)}#tr(e,t){let i=0;return this.#st!==0&&!t&&(i=Math.max(0,e-this.#st-1),this.#R.missed+=i),this.#st=e,i}#Ri(e){e-this.#rt<=ae||(this.#Tt=e,this.#ue=0,this.#Re=0,this.#ye=0,this.#Ue=0,this.#ve=0,this.#pe=0,this.#nt=0,this.#Xe=0,this.#ht=0,this.#Ge=0)}#yi(e){const t=e-this.#Tt;if(t<ae)return;const i=!this.#b&&this.#vt()&&(this.#P||this.#K)?this.#ye:this.#ue,s=this.#ue?(this.#Re+this.#Ue)/this.#ue:0;let r;this.#Be!=null&&(r=0,this.#Xe!==0&&(r+=this.#nt/1e6/this.#Xe),this.#Ge!==0&&(r+=this.#ht/1e6/this.#Ge/2));const h={...this.#R,avDifference:this.#fe,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0,fps:i*1e3/t,frameMs:s,maxQueuedFields:this.#ve,outputFps:this.#pe*1e3/t,gpuMs:r,film:this.#K,oneInstant:this.#Kt,filmError:this.#Ae};this.dispatchEvent(new CustomEvent("stats",{detail:h})),this.#zt?.(h),this.#Tt=e,this.#ue=0,this.#Re=0,this.#ye=0,this.#Ue=0,this.#ve=0,this.#pe=0,this.#nt=0,this.#Xe=0,this.#ht=0,this.#Ge=0}#as(){const e=this.#s;this.#_=(this.#_+1)%g;const t=this.#y,i=this.#h[this.#_];t!==null&&this.#v!==null&&i!==void 0?(this.#h[this.#_]=this.#v.adopt(t,i),this.#y=null):(e.bindTexture(e.TEXTURE_2D,i??null),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#ke)),this.#A=Math.min(this.#A+1,g)}#ge(e,t,i,s=!0){if(this.#A===0||this.#ne)return;s&&(this.#A===g&&!e?this.#R.filtered++:this.#R.degraded++);const r=this.#s,{prev:h,cur:o,next:a}=this.#_i(e);r.bindFramebuffer(r.FRAMEBUFFER,i),r.useProgram(this.#a);for(const[p,b]of[h,o,a].entries())r.activeTexture(r.TEXTURE0+p),r.bindTexture(r.TEXTURE_2D,this.#h[b]??null);r.uniform1i(this.#o.prev,0),r.uniform1i(this.#o.cur,1),r.uniform1i(this.#o.next,2);const c=this.#O?this.#n?.texture??null:null,u=this.#O?this.#n?.combTexture??null:null,d=c!==null&&u!==null;c!==null&&u!==null&&(r.activeTexture(r.TEXTURE0+3),r.bindTexture(r.TEXTURE_2D,c),r.uniform1i(this.#o.fieldMetrics,3),r.activeTexture(r.TEXTURE0+4),r.bindTexture(r.TEXTURE_2D,u),r.uniform1i(this.#o.comb,4));const m=this.#Yt?this.#n?.combAheadTexture??null:null,l=d&&!e;r.activeTexture(r.TEXTURE0+5),r.bindTexture(r.TEXTURE_2D,m),r.uniform1i(this.#o.combAhead,5),r.activeTexture(r.TEXTURE0),r.uniform2i(this.#o.size,this.#X,this.#J);const f=this.#Mt?0:1;r.uniform1i(this.#o.parity,t?1-f:f),r.uniform1i(this.#o.tff,this.#Mt?1:0),r.uniform1i(this.#o.second,t?1:0),r.uniform1i(this.#o.spatialCheck,this.#Q?1:0),r.uniform1i(this.#o.debug,this.#ae?1:0),r.uniform1i(this.#o.film,d?1:0),r.uniform1i(this.#o.match,l&&this.#_e&&(!t||m!==null)?1:0),r.uniform1i(this.#o.instant,l&&this.#Ft?1:0),r.uniform1i(this.#o.phase,this.#G.phase),r.viewport(0,0,this.#X,this.#J),r.drawArrays(r.TRIANGLES,0,3),this.#ae&&d&&this.#ys(this.#Ni,0,90),i===null&&(this.#c={kind:"yadif",flush:e,second:t},this.#Te(!0),s&&this.#pe++)}#_i(e){const t=i=>(this.#_+g-i)%g;return this.#A===1?{prev:this.#_,cur:this.#_,next:this.#_}:e?{prev:t(1),cur:this.#_,next:this.#_}:this.#A===2?{prev:t(1),cur:t(1),next:this.#_}:{prev:t(2),cur:t(1),next:this.#_}}#Qe(){if(this.#vi(),!this.#Z)return;const e=this.#e,t=this.#b?this.#ft:e.videoWidth,i=this.#b?this.#dt:e.videoHeight;if(t===0||i===0)return;const s=Math.min(e.offsetWidth/t,e.offsetHeight/i),r=t*s,h=i*s;this.#i.style.left=`${e.offsetLeft+(e.offsetWidth-r)/2}px`,this.#i.style.top=`${e.offsetTop+(e.offsetHeight-h)/2}px`,this.#i.style.width=`${r}px`,this.#i.style.height=`${h}px`}#Ai(e,t){const i=this.#s;this.#t.width=e,this.#t.height=t,this.#X=e,this.#J=t,this.#A=0,this.#$=0,this.#c=null,this.#I(),this.#Qe();for(const s of this.#h)i.deleteTexture(s);this.#h=[];for(let s=0;s<g;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null),this.#h.push(r)}this.#bt(),(this.#P||this.#O||this.#b)&&this.#us(),this.#ut?.resize(e,t),this.#n?.resize(e,t),this.#Ye()}#us(){const e=this.#s;if(!(this.#u.length===_||this.#X===0)){this.#bt();for(let t=0;t<_;t++){const i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,this.#X,this.#J,0,e.RGBA,e.UNSIGNED_BYTE,null);const s=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0);const r=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!r){e.deleteFramebuffer(s),e.deleteTexture(i),this.#bt();return}this.#u.push({texture:i,framebuffer:s})}this.#f=_-1}}#bt(){const e=this.#s,t=this.#c?.kind==="texture"?this.#c.texture:null;this.#u.some(i=>i.texture===t)&&(this.#c=null),this.#At=null,this.#be=null,this.#He=null;for(const{texture:i,framebuffer:s}of this.#u)e.deleteFramebuffer(s),e.deleteTexture(i);this.#u=[],this.#I()}#ir(){if(this.#Z)return;const e=this.#e.parentElement;if(!e)return;const t=document.createElement("div");t.style.cssText="position:relative;display:inline-block;line-height:0;max-width:100%",e.insertBefore(t,this.#e),t.appendChild(this.#e),t.appendChild(this.#i),this.#Z=t,this.#re?.observe(this.#e),this.#Qe()}#sr(){if(this.#k)return;const e=this.#Z;this.#Z=null,this.#re?.disconnect(),this.#i.remove(),e?.parentElement&&(e.parentElement.insertBefore(this.#e,e),e.remove())}#ls=()=>this.#Qe();#De(e){return!this.#p||this.#g==="main"?!1:(this.#p.postMessage({type:"event",name:e,video:this.#Me()}),!0)}#cs=()=>{if(this.#b){this.#V.hold(),this.#De("emptied");return}if(this.#De("emptied")){this.#de(),this.#Te(!1);return}this.#A=0,this.#Je=0,this.#$t=0,this.#I(),this.#Y(),this.#$=0,this.#L=0,this.#fs(),this.#c=null,this.#Te(!1)};#fs(){this.#R={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0},this.#ni=0,this.#hi=0,this.#Rt.fill(0),this.#yt=0,this.#st=0,this.#Tt=0,this.#rt=0,this.#ue=0,this.#Re=0,this.#ye=0,this.#Ue=0,this.#ve=0,this.#pe=0,this.#I(),this.#nt=0,this.#Xe=0,this.#ht=0,this.#Ge=0}#ds=()=>{if(this.#b){this.#V.hold(),this.#De("seeking");return}if(this.#De("seeking")){this.#de();return}this.#Ze=!1};#Fe=e=>{if(this.#b){this.#V.hold(),e.type==="ratechange"&&this.#he&&this.#e.playbackRate>0&&(this.#ce=this.#qe),this.#De(e.type);return}if(e.type==="ratechange"&&(this.#l.captureDriven?this.#Gt():this.#xi()),(e.type==="pause"||e.type==="ended"||e.type==="seeked"||e.type==="ratechange")&&this.#De(e.type)){this.#de();return}if(e.type==="seeked"){const i=this.#Ze;if(this.#Ze=!1,i)return;this.#A=0,this.#I(),this.#Y(),this.#c=null,this.#Te(!1);return}const t=e.type==="ratechange";if(t&&(this.#L=0,this.#Je=this.#e.currentTime),this.#I(),this.#C&&this.#A>0){const i=this.#ss(),s=i===null?void 0:this.#u[i];i!==null&&s?(this.#f=i,this.#ge(!0,!1,s.framebuffer),this.#gi(i)):this.#ge(!0,!1,null)}t&&(this.#A=0,this.#st=0,this.#Y())};#ms=()=>{this.#b&&(this.#V.hold(),this.#De("waiting"))};#ps=e=>{if(e.preventDefault(),this.#k){this.#k.onFailure("the deinterlacer WebGL context was lost");return}this.#g!=="active"&&(this.#ne=!0,this.#Dt("the deinterlacer WebGL context was lost"),this.stop())}}function St(n,e,t,i,s,r,h){return new wt(n,t,{canvas:e,onFailure:i,onVisibility:s,requestAnimationFrame:r,cancelAnimationFrame:h})}function ve(n,e){const t=n.createProgram(),i=be(n,n.VERTEX_SHADER,ct),s=be(n,n.FRAGMENT_SHADER,e);if(n.attachShader(t,i),n.attachShader(t,s),n.linkProgram(t),n.deleteShader(i),n.deleteShader(s),!n.getProgramParameter(t,n.LINK_STATUS)){const r=n.getProgramInfoLog(t);throw n.deleteProgram(t),new Error(`the deinterlacer failed to link: ${r??"no reason given"}`)}return t}function be(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const L=self;class Mt extends EventTarget{currentTime=0;playbackRate=1;seeking=!1;paused=!0;ended=!1;readyState=0;videoWidth=0;videoHeight=0;parentElement=null;offsetWidth=0;offsetHeight=0;offsetLeft=0;offsetTop=0;#t=[];update(e){this.currentTime=e.currentTime,this.playbackRate=e.playbackRate,this.seeking=e.seeking,this.paused=e.paused,this.ended=e.ended,this.readyState=e.readyState,this.videoWidth=e.videoWidth,this.videoHeight=e.videoHeight,this.#t=e.buffered}get buffered(){return{length:this.#t.length,start:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.start},end:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.end}}}getVideoPlaybackQuality(){return{creationTime:performance.now(),droppedVideoFrames:0,totalVideoFrames:0,corruptedVideoFrames:0}}requestVideoFrameCallback(){return 0}cancelVideoFrameCallback(){}}let R=null,v=null,H=!1;const Q=new Map;function Pt(n){return L.requestAnimationFrame(n)}function Dt(n){L.cancelAnimationFrame(n)}function A(n,e=[]){L.postMessage(n,e)}function Ct(n,e,t){n.doubleRate=e.doubleRate,n.spatialCheck=e.spatialCheck,(n.film!==e.film||t==="film")&&(n.film=e.film),n.debug=e.debug}L.onmessage=n=>{const e=n.data;try{if(e.type==="initialize"){if(typeof L.requestAnimationFrame!="function")throw new Error("requestAnimationFrame is unavailable in this Worker");R=new Mt,R.update(e.video),v=St(R,e.canvas,e.options,s=>{H||A({type:"failed",message:s})},s=>A({type:"visibility",visible:s}),Pt,Dt);const t=v;t.decodedVideo.onrelease=s=>{const r=Q.get(s);Q.delete(s),r!==void 0&&!H&&A({type:"release",id:r,data:s},[s])};let i=0;v.addEventListener("failure",()=>i++),v.addEventListener("stats",s=>{const{dropped:r,...h}=s.detail;A({type:"stats",stats:h,filmFailure:i})}),v.scan=e.scan,v.videoTimeline=e.videoTimeline,v.enabled=e.enabled,t.decodedVideo.onprepared=()=>{H||A({type:"ready"})};return}if(!R||!v)return;switch(e.type){case"frame":R.update(e.video);try{v.ingestExternalFrame(performance.now(),e.metadata,e.frame)}finally{e.frame.close(),A({type:"consumed",id:e.id})}break;case"settings":Ct(v,e.options,e.retryFilm);break;case"scan":v.scan=e.scan;break;case"timeline":v.videoTimeline=e.videoTimeline;break;case"enabled":v.enabled=e.enabled;break;case"running":e.running?v.start():v.stop();break;case"picture":Q.set(e.picture.data,e.id),v.decodedVideo.push(e.picture);break;case"pictures":e.action==="reset"?v.decodedVideo.reset():v.decodedVideo.finish();break;case"start":R.update(e.video),v.observeStart(e.media,e.at,e.timeOrigin);break;case"clock":R.update(e.video),v.observeMediaClock(e.at,e.timeOrigin);break;case"pageVisibility":R.update(e.video),v.observePageVisibility(e.hidden);break;case"event":R.update(e.video),R.dispatchEvent(new Event(e.name));break;case"capture":R.videoWidth=e.width,R.videoHeight=e.height,v.capture().then(t=>A({type:"capture",id:e.id,image:t},[t])).catch(()=>A({type:"capture",id:e.id,image:null}));break;case"destroy":H=!0,v.destroy(),v=null,R=null,L.close();break}}catch(t){const i=t instanceof Error?t.message:String(t);A({type:"failed",message:i})}}})();
//# sourceMappingURL=worker-CAkDds4u.js.map
