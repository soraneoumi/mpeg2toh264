(function(){"use strict";const C=`#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;function S(n,e,t){const i=n.createProgram(),s=$(n,n.VERTEX_SHADER,t),r=$(n,n.FRAGMENT_SHADER,e);if(n.attachShader(i,s),n.attachShader(i,r),n.linkProgram(i),n.deleteShader(s),n.deleteShader(r),!n.getProgramParameter(i,n.LINK_STATUS)){const h=n.getProgramInfoLog(i);throw n.deleteProgram(i),new Error(`the deinterlacer failed to link: ${h??"no reason given"}`)}return i}function $(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const re=`#version 300 es
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
`;function he(n,e){const t=S(n,re,ne),i=n.getAttribLocation(t,"aVertexPosition"),s=n.getAttribLocation(t,"aTextureCoord"),r=n.getUniformLocation(t,"uTexture"),h=n.getUniformLocation(t,"uMatrix"),o=n.getUniformLocation(t,"uUvMatrix"),u=n.getUniformLocation(t,"uTextColor"),f=n.getUniformLocation(t,"uBackColor");if(r==null||h==null||o==null||u==null||f==null)throw new Error("failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER");const a=n.createBuffer(),m=n.createBuffer();return{gl:n,...oe(n,e),program:t,programUniforms:{vertex:i,textureCoord:s,texture:r,matrix:h,uvMatrix:o,textColor:u,backColor:f},positionBuffer:a,textureBuffer:m}}function oe(n,e){const t=new OffscreenCanvas(0,0),i=t.getContext("2d"),s=new Map;let r=0;const h=0;let o=1;i.font=e,i.fillStyle="white";for(let f=32;f<128;f++){const a=String.fromCharCode(f),m=i.measureText(a),E=Math.ceil(m.actualBoundingBoxDescent+m.actualBoundingBoxAscent+1),c=Math.ceil(m.actualBoundingBoxLeft+m.actualBoundingBoxRight+1);s.set(a,{x:r,y:h,width:c,height:E,metrics:m}),o=Math.max(o,E),r+=c}t.width=r,t.height=o,i.font=e,i.fillStyle="white";for(const[f,a]of s)i.fillText(f,Math.floor(a.x+a.metrics.actualBoundingBoxLeft+1),Math.floor(a.metrics.actualBoundingBoxAscent+1));const u=n.createTexture();return n.bindTexture(n.TEXTURE_2D,u),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t),{fontTexture:u,chars:s,textureSize:{width:r,height:o}}}function ae(n){const e=n.gl;e.deleteBuffer(n.positionBuffer),e.deleteBuffer(n.textureBuffer),e.deleteTexture(n.fontTexture),e.deleteProgram(n.program)}function le(n,e,t,i,s,r,h){const o=[],u=[],f=t;for(const E of e){if(E===`
`){t=f,i+=h;continue}const c=n.chars.get(E);if(c==null)continue;if(c.width===1){t+=c.metrics.width;continue}const l=Math.floor(t-c.metrics.actualBoundingBoxLeft),d=Math.floor(i-c.metrics.actualBoundingBoxAscent),p=l+c.width,b=d+c.height;o.push(l,d),u.push(c.x,c.y),o.push(l,b),u.push(c.x,c.y+c.height),o.push(l+c.width,b),u.push(c.x+c.width,c.y+c.height),o.push(p,b),u.push(c.x+c.width,c.y+c.height),o.push(l,d),u.push(c.x,c.y),o.push(p,d),u.push(c.x+c.width,c.y),t+=c.metrics.width}const a=n.gl;a.useProgram(n.program),a.bindBuffer(a.ARRAY_BUFFER,n.positionBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(o),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.vertex,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.vertex),a.bindBuffer(a.ARRAY_BUFFER,n.textureBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(u),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.textureCoord,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.textureCoord),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,n.fontTexture),a.uniform1i(n.programUniforms.texture,0),a.uniform3fv(n.programUniforms.textColor,[1,1,1]),a.uniform3fv(n.programUniforms.backColor,[0,0,0]);function m(E,c,l){const d=[];for(let p=0;p<c;p++)for(let b=0;b<E;b++)d.push(l[b*E+p]);return d}a.uniformMatrix4fv(n.programUniforms.matrix,!1,m(4,4,[1/(s/2),0,0,-1,0,-2/r,0,1,0,0,1,0,0,0,0,1])),a.uniformMatrix3fv(n.programUniforms.uvMatrix,!1,m(3,3,[1/n.textureSize.width,0,0,0,1/n.textureSize.height,0,0,0,1])),a.viewport(0,0,s,r),a.enable(a.BLEND),a.blendFunc(a.SRC_ALPHA,a.ONE_MINUS_SRC_ALPHA),a.drawArrays(a.TRIANGLES,0,o.length/2),a.disable(a.BLEND)}const v={firstRepeatsPrevious:0,secondRepeatsNext:1,secondRepeatsPrevious:2,previousSecondRepeated:3,firstRepeatsNext:4,previousFirstRepeated:5,phase:6},R=7,H=2,I=1,ue=2,O=10,ce={a:"uA",b:"uB",fieldMetrics:"uFieldMetrics",first:"uFirst",size:"uSize"},W=16,V=8,fe=`#version 300 es

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
  const int BLOCK_W = ${W};
  const int BLOCK_H = ${V};

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
`,de={second:"uSecond",first:"uFirst",size:"uSize"},M=8,me=`#version 300 es
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
`,pe={previous:"uPrevious",second:"uSecond",first:"uFirst",size:"uSize"},ve=`#version 300 es
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
`,g=16,q=8,Ee={prev:"uPrev",cur:"uCur",first:"uFirst",size:"uSize"},be=`#version 300 es
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
`,xe={prev:"uPrev",cur:"uCur",next:"uNext",size:"uSize",parity:"uParity",tff:"uTff",spatialCheck:"uSpatialCheck",debug:"uDebug",film:"uFilm",second:"uSecond",phase:"uPhase",fieldMetrics:"uFieldMetrics",comb:"uComb",combAhead:"uCombAhead",match:"uMatch"},ge=`#version 300 es
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
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${v.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${O}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${I} || phase == ${ue};
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
 * if it had one, so the caller asks for this only shortly after film.
 */
bool matched(int x, int y, out vec3 rgb) {
  ivec2 block = ivec2(x / ${g}, y / ${g});
  float standing = texelFetch(uComb, block, 0)[0];
  float adjoining = uSecond ? texelFetch(uCombAhead, block, 0)[1]
                            : texelFetch(uComb, block, 0)[1];
  if (min(standing, adjoining) > ${q}.0) return false;
  if (standing <= adjoining) {
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
  } else if (uSecond) {
    rgb = texelFetch(uNext, ivec2(x, y), 0).rgb;
  } else {
    rgb = texelFetch(uPrev, ivec2(x, y), 0).rgb;
  }
  return true;
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
    bool combedBlock = (mixed ? comb[1] : comb[0]) > ${q}.0;
    if ((y & 1) != uParity &&
        (combedBlock || (detectedPhase() == 4 && movingComb(rgb, x, y))))
      rgb = filterPixel(uPrev, uCur, x, y);
  } else if ((y & 1) == uParity) {
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
  } else if (uMatch && matched(x, y, rgb)) {
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
`,_={phase:0,run:0};function U(n,e,t){return Object.fromEntries(Object.entries(t).map(([i,s])=>[i,n.getUniformLocation(e,s)]))}class K{#t;#i;#e;#o;#d;#a;#s;#h;#m;#r=null;#F=null;#b=null;#E=null;#c=null;#f=0;#l=null;#n=null;#u=0;#x=0;metrics=new Float32Array(R*4);#_=0;#p=0;constructor(e){this.#t=e,this.#i=S(e,fe,C),this.#e=U(e,this.#i,ce),this.#o=S(e,me,C),this.#d=U(e,this.#o,de),this.#a=S(e,ve,C),this.#s=U(e,this.#a,pe),this.#h=S(e,be,C),this.#m=U(e,this.#h,Ee)}get texture(){return this.#c?.[this.#f]?.textures[0]??null}get combTexture(){return this.#b?.textures[0]??null}get combAheadTexture(){return this.#E?.textures[0]??null}resize(e,t){e===this.#_&&t===this.#p||(this.#_=e,this.#p=t,this.#H())}reset(){const e=this.#t;e.deleteSync(this.#n),this.#n=null,this.#u=0;const t=this.#c?.[this.#f];if(!t)return;const i=new Float32Array(R*4);for(let s=0;s<v.phase;s++)i[s*4+1]=1;e.bindTexture(e.TEXTURE_2D,t.textures[0]??null),e.texSubImage2D(e.TEXTURE_2D,0,0,0,R,1,e.RGBA,e.FLOAT,i)}detect(e,t,i){const s=this.#t;if(this.#_===0||this.#p===0)return;this.#A();const r=this.#r,h=this.#F,o=this.#c;if(r===null||h===null||o===null)return;const u=o[this.#f],f=o[1-this.#f];if(s.bindFramebuffer(s.FRAMEBUFFER,r.framebuffer),s.useProgram(this.#i),this.#v(0,e,this.#e.a),this.#v(1,t,this.#e.b),this.#v(2,u.textures[0],this.#e.fieldMetrics),s.uniform1i(this.#e.first,i),s.uniform2i(this.#e.size,this.#_,this.#p),s.viewport(0,0,r.width,r.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,h.framebuffer),s.useProgram(this.#o),this.#v(0,r.textures[0],this.#d.second),this.#v(1,r.textures[1],this.#d.first),s.uniform2i(this.#d.size,r.width,r.height),s.viewport(0,0,h.width,h.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,f.framebuffer),s.useProgram(this.#a),this.#v(0,u.textures[0],this.#s.previous),this.#v(1,h.textures[0],this.#s.second),this.#v(2,h.textures[1],this.#s.first),s.uniform2i(this.#s.size,h.width,h.height),s.viewport(0,0,R,1),s.drawArrays(s.TRIANGLES,0,3),this.#f=1-this.#f,this.#u++,this.#n!==null){s.bindFramebuffer(s.FRAMEBUFFER,null);return}this.#x=this.#u,s.bindBuffer(s.PIXEL_PACK_BUFFER,this.#l),s.readPixels(0,0,R,1,s.RGBA,s.FLOAT,0),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.FRAMEBUFFER,null),this.#n=s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE,0),s.flush()}measureComb(e,t,i,s=!1){const r=this.#t;if(this.#_===0||this.#p===0)return;this.#A();const h=s?this.#E:this.#b;h!==null&&(r.bindFramebuffer(r.FRAMEBUFFER,h.framebuffer),r.useProgram(this.#h),this.#v(0,e,this.#m.prev),this.#v(1,t,this.#m.cur),r.uniform1i(this.#m.first,i),r.uniform2i(this.#m.size,this.#_,this.#p),r.viewport(0,0,h.width,h.height),r.drawArrays(r.TRIANGLES,0,3),r.bindFramebuffer(r.FRAMEBUFFER,null))}poll(){const e=this.#t,t=this.#n;if(t===null||this.#l===null)return null;switch(e.clientWaitSync(t,0,0)){case e.ALREADY_SIGNALED:case e.CONDITION_SATISFIED:return e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#l),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,this.metrics),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),e.deleteSync(t),this.#n=null,{phase:this.metrics[v.phase*4]??0,run:this.metrics[v.phase*4+1]??0,age:this.#u-this.#x};default:return null}}destroy(){const e=this.#t;if(this.#H(),this.#c!==null){for(const t of this.#c)k(e,t);this.#c=null}e.deleteSync(this.#n),this.#n=null,e.deleteBuffer(this.#l),this.#l=null,e.deleteProgram(this.#i),e.deleteProgram(this.#o),e.deleteProgram(this.#a),e.deleteProgram(this.#h)}#v(e,t,i){const s=this.#t;s.activeTexture(s.TEXTURE0+e),s.bindTexture(s.TEXTURE_2D,t??null),s.uniform1i(i,e)}#H(){const e=this.#t;this.#r!==null&&k(e,this.#r),this.#F!==null&&k(e,this.#F),this.#b!==null&&k(e,this.#b),this.#E!==null&&k(e,this.#E),this.#r=null,this.#F=null,this.#b=null,this.#E=null}#A(){const e=this.#t;if(this.#r===null||this.#F===null||this.#b===null||this.#E===null){this.#H();const t=Math.ceil(this.#_/W),i=Math.ceil(this.#p/(V*2));this.#r=P(e,t,i,2),this.#F=P(e,Math.ceil(t/M),Math.ceil(i/M),2),this.#b=P(e,Math.ceil(this.#_/g),Math.ceil(this.#p/g),1),this.#E=P(e,Math.ceil(this.#_/g),Math.ceil(this.#p/g),1)}this.#c===null&&(this.#c=[P(e,R,1,1),P(e,R,1,1)],this.#f=0,this.reset()),this.#l===null&&(this.#l=e.createBuffer(),e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#l),e.bufferData(e.PIXEL_PACK_BUFFER,this.metrics.byteLength,e.STREAM_COPY),e.bindBuffer(e.PIXEL_PACK_BUFFER,null))}}function P(n,e,t,i){const s=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,s);const r=[];for(let u=0;u<i;u++){const f=n.createTexture();n.bindTexture(n.TEXTURE_2D,f),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,e,t,0,n.RGBA,n.FLOAT,null),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+u,n.TEXTURE_2D,f,0),r.push(f)}n.drawBuffers(r.map((u,f)=>n.COLOR_ATTACHMENT0+f));const h=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE;n.bindFramebuffer(n.FRAMEBUFFER,null);const o={framebuffer:s,textures:r,width:e,height:t};if(!h)throw k(n,o),new Error("failed to allocate framebuffer");return o}function k(n,{framebuffer:e,textures:t}){n.deleteFramebuffer(e);for(const i of t)n.deleteTexture(i)}function A(n,e=0,t=n.length){const i=new DataView(n.buffer,n.byteOffset,n.byteLength),s=[];for(let r=e;r<t;){if(r+8>t)throw new Error("Incomplete MP4 box");const h=i.getUint32(r);if(h<8||r+h>t)throw new Error("Invalid MP4 box size");s.push({type:String.fromCharCode(...n.subarray(r+4,r+8)),start:r,body:r+8,end:r+h}),r+=h}return s}function Te(n,e){for(const t of A(n,e.body,e.end).filter(i=>i.type==="trak")){let i=t;for(const s of["mdia","minf","stbl","stsd"]){const r=A(n,i.body,i.end).find(h=>h.type===s);if(!r)break;i=r}if(i.type==="stsd")for(const s of A(n,i.body+8,i.end)){if(s.type!=="avc1")continue;const r=A(n,s.body+78,s.end).find(u=>u.type==="avcC");if(!r)throw new Error("AVC sample entry has no avcC");const h=n.slice(r.body,r.end);return{codec:"avc1."+Array.from(h.subarray(1,4)).map(u=>u.toString(16).padStart(2,"0")).join(""),description:h}}}return null}class ye{#t;#i=null;#e=null;#o=[];#d=0;#a=null;#s=[];#h=new Set;#m=!1;#r=!1;#F=!1;#b=!1;#E=!1;#c=new WeakMap;constructor(e){this.#t=e,e.addEventListener("seeking",this.#l),e.addEventListener("ratechange",this.#l)}get active(){return this.#b}append(e){if(this.#F)return;const t=new Uint8Array(e),i=new DataView(e);try{for(const r of A(t)){if(r.type==="moov"){this.#i=Te(t,r);const h=this.#i;h&&VideoDecoder.isConfigSupported(h).then(o=>{this.#c.set(h,o.supported===!0)}).catch(o=>this.#n(o))}if(!(r.type!=="moof"||this.#i===null))for(const h of A(t,r.body,r.end).filter(o=>o.type==="traf")){const o=A(t,h.body,h.end),u=o.find(l=>l.type==="tfhd");if(!u||i.getUint32(u.body+4)!==1)continue;const f=o.find(l=>l.type==="tfdt"),a=o.find(l=>l.type==="trun");if(!f||!a||i.getUint32(f.body)!==16777216||i.getUint32(a.body)!==16781057)throw new Error("Unexpected mpeg2toh264 video fragment layout");let m=Number(i.getBigUint64(f.body+4)),E=r.start+i.getInt32(a.body+8);const c=i.getUint32(a.body+4);if(a.body+12+c*16>a.end)throw new Error("Incomplete video samples");for(let l=0;l<c;l++){const d=a.body+12+l*16,p=i.getUint32(d),b=i.getUint32(d+4),z=i.getUint32(d+8),et=i.getInt32(d+12);if(E<0||E+b>t.length)throw new Error("Video sample outside fragment");this.#o.push({config:this.#i,decodeTime:m/9e4,timestamp:Math.round((m+et)*1e6/9e4),duration:Math.round(p*1e6/9e4),type:z&65536?"delta":"key",data:t.subarray(E,E+b)}),m+=p,E+=b}}}const s=this.#t.buffered;if(s.length>0){let r=0;for(let h=0;h<(this.#b?this.#d:this.#o.length);h++){const o=this.#o[h];o.type==="key"&&o.timestamp/1e6<=s.start(0)&&(r=h)}r>0&&(this.#o.splice(0,r),this.#d=Math.max(0,this.#d-r))}}catch(s){this.#n(s)}}take(){if(this.#F||this.#t.playbackRate<=1.25||this.#i===null||this.#c.get(this.#i)!==!0){this.#b&&this.#l();return}this.#b||(this.#l(),this.#b=!0);const e=this.#t.currentTime;try{for(;this.#d<this.#o.length&&(this.#a?.decodeQueueSize??0)<6&&this.#s.length<12;){const i=this.#o[this.#d];if(i.decodeTime>e+.25)break;if(this.#e!==i.config){if(this.#a){if(!this.#r){this.#r=!0;const r=this.#a;r.flush().then(()=>{this.#a===r&&(r.close(),this.#a=null,this.#e=null,this.#r=!1)}).catch(h=>{this.#a===r&&this.#n(h)})}break}const s=new VideoDecoder({output:r=>{this.#a!==s?r.close():this.#f(r)},error:r=>{this.#a===s&&this.#n(r)}});this.#a=s,this.#a.configure(i.config),this.#e=i.config}(i.duration??0)<1e3&&this.#h.add(i.timestamp),this.#a.decode(new EncodedVideoChunk(i)),this.#d++}if(this.#m&&this.#d===this.#o.length&&this.#a&&!this.#r){this.#r=!0;const i=this.#a;i.flush().catch(s=>{this.#a===i&&this.#n(s)})}}catch(i){this.#n(i);return}const t=this.#s[0];return!t||t.timestamp/1e6>e+.003*this.#t.playbackRate?this.#E?null:void 0:(this.#E=!0,this.#s.shift())}#f=e=>{this.#h.delete(e.timestamp)||e.timestamp/1e6<this.#t.currentTime-(this.#E?.1:.04)?e.close():this.#s.push(e)};#l=()=>{this.#a&&this.#a.state!=="closed"&&this.#a.close(),this.#a=null,this.#e=null;for(const e of this.#s)e.close();this.#s=[],this.#h.clear(),this.#r=!1,this.#b=!1,this.#E=!1,this.#d=0;for(let e=0;e<this.#o.length;e++){const t=this.#o[e];t.type==="key"&&t.timestamp/1e6<=this.#t.currentTime&&(this.#d=e)}};finish(){this.#m=!0}suspend(){this.#l()}reset(){this.#l(),this.#o=[],this.#d=0,this.#i=null,this.#m=!1,this.#F=!1}destroy(){this.reset(),this.#t.removeEventListener("seeking",this.#l),this.#t.removeEventListener("ratechange",this.#l)}#n(e){this.#l(),this.#F=!0,console.warn("mpeg2toh264: decoded video input unavailable",e)}}const L=16,Fe=6,Re=`#version 300 es
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
`;class _e{#t;#i;#e=null;#o=null;#d=[];#a=0;#s=[];#h=new Uint8Array(0);#m=[];#r=null;#F=0;constructor(e,t){this.#t=e,this.#i=t}take(){const e=this.#t,t=this.#d.pop()??this.#f();if(t===null)return null;const i=this.#i.videoWidth,s=this.#i.videoHeight;e.bindTexture(e.TEXTURE_2D,t);try{e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#i)}catch(o){throw this.#d.push(t),o}const r={id:++this.#F,texture:t,width:i,height:s,changed:null,fence:null,buffer:null,reported:!1},h=this.#r;return h===null||h.width!==i||h.height!==s?r.changed=!0:this.#b(r,h),this.#r=r,this.#m.push(r),r.id}settle(){const e=this.#t,t=this.#m.find(i=>!i.reported);if(t===void 0||t===this.#r)return null;if(t.changed===null){const{fence:i,buffer:s}=t;if(i===null||s===null)return null;const r=e.clientWaitSync(i,0,0);if(r!==e.ALREADY_SIGNALED&&r!==e.CONDITION_SATISFIED)return null;this.#h.byteLength<s.bytes&&(this.#h=new Uint8Array(s.bytes));const h=this.#h.subarray(0,s.bytes);e.bindBuffer(e.PIXEL_PACK_BUFFER,s.buffer),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,h),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),t.changed=Ae(h),this.#E(t)}return t.reported=!0,{id:t.id,changed:t.changed}}adopt(e,t){const i=this.#m.findIndex(r=>r.id===e),s=this.#m[i];if(s===void 0||!s.reported)throw new Error(`picture ${e} is not available to adopt`);return this.#m.splice(i,1),this.#d.push(t),s.texture}release(e){const t=this.#m.findIndex(s=>s.id===e),i=this.#m[t];i!==void 0&&(this.#m.splice(t,1),this.#c(i))}reset(){const e=this.#m;this.#m=[],this.#r=null;for(const t of e)this.#E(t),this.#c(t)}destroy(){const e=this.#t;this.reset();for(const t of this.#d)e.deleteTexture(t);this.#d=[],this.#a=0;for(const{buffer:t}of this.#s)e.deleteBuffer(t);this.#s=[],this.#u(),this.#e!==null&&e.deleteProgram(this.#e),this.#e=null}#b(e,t){const i=this.#t,s=Math.ceil(e.width/L),r=Math.ceil(e.height/L),h=this.#n(s,r),o=this.#x(s*r*4);this.#e??=this.#l(),i.bindFramebuffer(i.FRAMEBUFFER,h.framebuffer),i.useProgram(this.#e),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,t.texture),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e.texture),i.viewport(0,0,s,r),i.drawArrays(i.TRIANGLES,0,3),i.bindBuffer(i.PIXEL_PACK_BUFFER,o.buffer),i.readPixels(0,0,s,r,i.RGBA,i.UNSIGNED_BYTE,0),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),i.bindFramebuffer(i.FRAMEBUFFER,null),e.fence=i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE,0),e.buffer=o,i.flush()}#E(e){const t=this.#t;e.fence!==null&&t.deleteSync(e.fence),e.fence=null;const i=e.buffer;if(e.buffer=null,i===null)return;const s=this.#o;s!==null&&i.bytes===s.width*s.height*4?this.#s.push(i):t.deleteBuffer(i.buffer)}#c(e){this.#d.push(e.texture)}#f(){if(this.#a===Fe)return null;const e=this.#t,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.#a++,t}#l(){const e=this.#t,t=S(e,Re,C);return e.useProgram(t),e.uniform1i(e.getUniformLocation(t,"uTake"),0),e.uniform1i(e.getUniformLocation(t,"uReference"),1),t}#n(e,t){const i=this.#t,s=this.#o;if(s?.width===e&&s.height===t)return s;this.#u();for(const{buffer:u}of this.#s)i.deleteBuffer(u);this.#s=[];const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null);const h=i.createFramebuffer();i.bindFramebuffer(i.FRAMEBUFFER,h),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,r,0),i.bindFramebuffer(i.FRAMEBUFFER,null);const o={framebuffer:h,texture:r,width:e,height:t};return this.#o=o,o}#u(){const e=this.#t;this.#o!==null&&(e.deleteFramebuffer(this.#o.framebuffer),e.deleteTexture(this.#o.texture),this.#o=null)}#x(e){const t=this.#s.pop();if(t!==void 0)return t;const i=this.#t,s=i.createBuffer();return i.bindBuffer(i.PIXEL_PACK_BUFFER,s),i.bufferData(i.PIXEL_PACK_BUFFER,e,i.STREAM_COPY),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),{buffer:s,bytes:e}}}function Ae(n){for(let e=0;e<n.length;e+=4)if(n[e]!==0||n[e+1]!==0||n[e+2]!==0)return!0;return!1}const Y=["mozParsedFrames","mozDecodedFrames","mozPresentedFrames","mozPaintedFrames"];function we(n){return Y.every(e=>e in n)}function Se(n){return n.ownerDocument?.defaultView?.performance.timeOrigin??performance.timeOrigin}const Pe=250,N=500,ke=1.75,De=3,Ce=200;class Me{#t;#i;#e;#o;#d=null;#a=[];#s=0;#h=null;#m=0;#r=null;#F=null;#b=null;#E=null;#c=null;#f=null;#l=!0;#n=null;#u=null;#x=0;#_;#p;#v=null;#H=null;#A=null;#O=null;#Fe=0;#W=[];#X=[];constructor(e,t,i){if(this.#t=e,this.#i=t,this.#o=i,this.#e=we(e)?e:null,this.#_=this.#e===null&&typeof VideoFrame<"u",this.#p=this.#_&&e.playbackRate>1,this.#e){for(const s of["emptied","seeking","seeked"])e.addEventListener(s,this.#G);for(const s of["pause","playing","waiting","ratechange"])e.addEventListener(s,this.#N)}if(this.#_)for(const s of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])e.addEventListener(s,this.#D)}get captureDriven(){return this.#p}request(e){if(this.#E===null){if(this.#E=e,this.#p){this.#B();return}this.#b=this.#e?requestAnimationFrame(this.#C):this.#t.requestVideoFrameCallback(this.#P)}}cancel(){this.#b!==null&&(this.#e?cancelAnimationFrame(this.#b):this.#t.cancelVideoFrameCallback(this.#b)),this.#b=null,this.#E=null,this.#v?.(),this.#v=null,this.#A!==null&&this.#t.cancelVideoFrameCallback(this.#A),this.#A=null,this.#Y(),this.#O=null,this.#W=[],this.#p=this.#_&&this.#t.playbackRate>1,this.#G()}destroy(){this.cancel();for(const e of["emptied","seeking","seeked"])this.#t.removeEventListener(e,this.#G);for(const e of["pause","playing","waiting","ratechange"])this.#t.removeEventListener(e,this.#N);for(const e of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])this.#t.removeEventListener(e,this.#D)}flush(e){if(this.#p)for(this.#t.ownerDocument!==this.#H&&(this.#v?.(),this.#v=null,this.#B());this.#X.length>0&&this.#E!==null;){const t=this.#X.shift(),i=t.frame;try{this.#g(e,{width:i.visibleRect?.width??i.codedWidth,height:i.visibleRect?.height??i.codedHeight,mediaTime:i.timestamp/1e6,presentedFrames:t.count,expectedDisplayTime:Math.max(t.at,e),timeOrigin:performance.timeOrigin,frame:i})}finally{i.close()}}}#Y(){for(const e of this.#X)e.frame.close();this.#X=[]}#D=e=>{const t=this.#_&&this.#t.playbackRate>1;if(t!==this.#p){const i=this.#E;this.cancel(),this.#p=t,i!==null&&this.request(i);return}["seeking","seeked","emptied","ratechange"].includes(e.type)&&(this.#O=null,this.#W=[]),this.#p&&((e.type==="pause"||e.type==="ended")&&this.flush(performance.now()),this.#Y(),this.#v?.(),this.#v=null,this.#E!==null&&this.#B())};#B(){if(!this.#p||this.#v!==null||this.#E===null||(this.#t.paused||this.#t.ended)&&this.#O!==null)return;this.#A===null&&typeof this.#t.requestVideoFrameCallback=="function"&&(this.#A=this.#t.requestVideoFrameCallback(this.#Re));const e=Math.max(4,8/Math.max(1,this.#t.playbackRate)),t=this.#t.ownerDocument?.defaultView;if(this.#H=this.#t.ownerDocument,t){const i=t.setTimeout(this.#M,e);this.#v=()=>t.clearTimeout(i)}else{const i=setTimeout(this.#M,e);this.#v=()=>clearTimeout(i)}}#Re=()=>{this.#A=null,this.#v?.(),this.#v=null,this.#M()};#M=()=>{this.#v=null;const e=this.#t;if(this.#E===null)return;if(e.readyState<2||e.seeking){this.#B();return}let t,i=!1;try{const s=this.#i?.();if(s===null){this.#B();return}i=s!==void 0,t=s??new VideoFrame(e)}catch(s){if(!(s instanceof DOMException)||s.name!=="InvalidStateError")throw s;this.#B();return}if(t.timestamp===this.#O)t.close();else{let s=1;if(this.#O!==null){const h=t.timestamp-this.#O;if(h>1e3&&h<25e4&&(this.#W.push(h),this.#W.length>7&&this.#W.shift()),h>0&&this.#W.length>0){const o=[...this.#W].sort((f,a)=>f-a),u=o[Math.floor(o.length/2)];s=Math.max(1,Math.round(h/u))}}this.#O=t.timestamp,this.#Fe+=s;const r=performance.now()+(i?(t.timestamp/1e6-e.currentTime)*1e3/e.playbackRate:0);for(this.#X.push({frame:t,at:r,count:this.#Fe});this.#X.length>4;)this.#X.shift().frame.close()}this.#B()};#N=()=>{this.#n=null,this.#u=null,this.#x=0};#G=()=>{this.#c=null,this.#f=null,this.#l=!0,this.#z(),this.#N()};#z(){this.#d?.reset(),this.#a=[],this.#m=0}#P=(e,t)=>{this.#g(e,{width:t.width,height:t.height,mediaTime:t.mediaTime,presentedFrames:t.presentedFrames,expectedDisplayTime:t.expectedDisplayTime,timeOrigin:Se(this.#t)})};#g=(e,t)=>{const i=this.#E;this.#b=null,this.#E=null,i?.(e,t)};#C=e=>{const t=this.#e,i=Y.map(u=>t[u]);this.#c?.some((u,f)=>i[f]<u)&&this.#G(),this.#c=i;const s=this.#o?.()??null;s!==this.#d&&(this.#G(),this.#d=s);const r=t.mozPaintedFrames,h=!t.seeking&&t.readyState>=2&&t.videoWidth>0&&t.videoHeight>0,o=this.#f===null&&(r>0||t.paused&&(t.mozPresentedFrames>0||t.mozDecodedFrames>0));if(s!==null){this.#L(e,t,s,h,o);return}if(h&&(o||this.#f!==null&&r!==this.#f)){this.#n!==null&&e-this.#n>N&&(this.#N(),this.#l=!0),this.#$(e,t),this.#n=e,this.#f=r;const u=this.#l;this.#l=!1,this.#g(e,{width:t.videoWidth,height:t.videoHeight,mediaTime:t.currentTime,presentedFrames:r,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#x,discontinuity:u}})}else this.#b=requestAnimationFrame(this.#C)};#$(e,t){if(t.paused||t.ended)return;const i=t.mozPaintedFrames,s=this.#u;if(s&&e-s.at>=Pe){const r=i-s.frames;if(r>0){const h=(e-s.at)/r;h>=4&&h<=200&&(this.#x=this.#x?this.#x+(h-this.#x)*.25:h)}this.#u=null}this.#u??={at:e,frames:i}}#L(e,t,i,s,r){const h=t.mozPaintedFrames,o=this.#f!==null&&h!==this.#f;this.#h!==null&&e-this.#h>N&&(this.#z(),this.#N(),this.#l=!0),this.#h=e,o&&this.#$(e,t);const u=t.paused||t.ended;(!u||o)&&(this.#m=0),u&&this.#r!==null&&(this.#r=e);const f=u&&this.#m>=De;if(s&&(r||this.#f!==null)){this.#f=h;const c=f?null:i.take();c!==null&&this.#a.push({id:c,at:e,mediaTime:t.currentTime,width:t.videoWidth,height:t.videoHeight,resting:u})}let a=null;for(let c=i.settle();c!==null;c=i.settle()){const l=this.#a.shift();if(l?.id!==c.id)throw new Error("picture verdicts arrived out of order");let d=c.changed;if(d?this.#m=0:(this.#m=l.resting?this.#m+1:0,d=a===null&&!l.resting&&this.#r!==null&&(l.at-this.#r)*(t.playbackRate||1)>=Ce&&h!==this.#F),!d){i.release(l.id);continue}a!==null&&i.release(a.id),a=l}if(a===null){this.#b=requestAnimationFrame(this.#C);return}let m=1;if(this.#n!==null){const c=a.at-this.#n;c>N?(this.#N(),this.#l=!0):this.#x>0&&c>this.#x*ke&&(m=Math.round(c/this.#x))}this.#s+=m,this.#n=a.at,this.#r=a.at,this.#F=h;const E=this.#l;this.#l=!1;try{this.#g(e,{width:a.width,height:a.height,mediaTime:a.mediaTime,presentedFrames:this.#s,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#x,discontinuity:E},picture:a.id})}finally{i.release(a.id)}}}let Le=null;const j=.5,y=4,X=5,w=X+1,Q=1e3,J=4,B=200,Ue=.25,Be=1e3/60,Ie=`#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`,Oe=.75,Ne=.1,Z=1,Xe=.02,Ge=.1,ee=1,ze=4,$e=90,G=5,He=4,We={2:0,3:.25,4:.5,5:.75},Ve=`#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`,qe={requestAnimationFrame:n=>requestAnimationFrame(n),cancelAnimationFrame:n=>cancelAnimationFrame(n)};class Ke extends EventTarget{encodedVideo;#t;#i;#e;#o;#d;#a=null;#s;#h=null;#m;#r;#F;#b;#E;#c=[];#f=[];#l=w-1;#n=null;#u=[];#x=null;#_=0;#p=null;#v=null;#H;#A=Be;#O=0;#Fe=0;#W=0;#X=0;#Y=null;#D(){this.#u.length=0,this.#Y=null,this.#X=0}#B=null;#Re;#M;#N;#G=0;#z;#P;#g=0;#C=0;#$=0;#L=y-1;#w=0;#_e=0;#et=0;#Ae=!1;#S=!1;#re=0;#Ge=!1;#j=!1;#R=null;#ae=[];#K=!1;#tt;#it;#k;#le;#J;#st;#T=null;#y;#we=!1;#rt=0;#nt=!1;#Qt=0;#Se=!1;#ze=!1;#ue=null;#Jt=0;#Pe=new Map;#U={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0};#ke=0;#$e=0;#He=0;#Z=0;#ce=0;#fe=0;#De=0;#de=0;#me;#We=[];#pe=[];#Ce=0;#ve=0;#Me=0;#Ee=0;#Le=_;#be=0;#I=_;#V=!1;#q=0;#ne=!1;#ht=!1;#_t=!1;#ot=!1;#xe=null;#At="";#Ve=[0,0,0,0,0,0];#at=0;#he=null;#lt=null;#ut=0;constructor(e,t={},i=null){super(),this.#e=e,this.#M=t.doubleRate??!1,this.#N=t.spatialCheck??!0,this.#z=t.debug??!1,this.#P=t.film??!1,this.#tt=t.onStats,this.#it=t.onFailure,this.#k=i,this.#J=i?"main":t.rendering??"main",this.#st=t.workerUrl??Le,this.#y=this.#J==="main"?"main":"idle",this.#i=i?i.canvas:document.createElement("canvas"),this.#t=i?.canvas??(this.#J==="main"?this.#i:document.createElement("canvas")),this.#le=e,i||(this.#i.style.cssText="position:absolute;pointer-events:none;visibility:hidden");const s=this.#t.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"});if(!(s instanceof WebGL2RenderingContext))throw new Error("this browser has no WebGL2");this.#s=s,this.#P&&(this.#kt(),this.#h=new K(s)),this.#m=te(s,ge);const r=this.#m;this.#r=Object.fromEntries(Object.entries(xe).map(([h,o])=>[h,s.getUniformLocation(r,o)])),this.#F=te(s,Ve),this.#b=s.getUniformLocation(this.#F,"uField"),this.#E=s.getUniformLocation(this.#F,"uFlip"),this.#me=s.getExtension("EXT_disjoint_timer_query_webgl2"),this.#t.addEventListener("webglcontextlost",this.#jt),this.#Re=i?null:new ResizeObserver(()=>this.#Ne()),this.#H=i?null:new MutationObserver(()=>{this.#i.ownerDocument!==this.#v&&this.#Ne()}),this.encodedVideo=!i&&typeof VideoDecoder<"u"?new ye(e):null,this.#d=i?null:new _e(s,e),this.#o=new Me(e,()=>this.encodedVideo?.take(),()=>this.#y==="main"?this.#d:null),e.addEventListener("emptied",this.#qt),e.addEventListener("resize",this.#Vt),e.addEventListener("pause",this.#se),e.addEventListener("ended",this.#se),e.addEventListener("seeking",this.#Yt),e.addEventListener("seeked",this.#se),e.addEventListener("ratechange",this.#se)}get running(){return this.#S&&(this.#R?.interlaced??!0)}get canvas(){return this.#i}get#wt(){return this.#R?.topFieldFirst!==!1}#St(){return{doubleRate:this.#M,spatialCheck:this.#N,film:this.#P,debug:this.#z}}get enabled(){return this.#Ge}set enabled(e){this.#Ge=e,this.#ct(),this.#T?.postMessage({type:"enabled",enabled:e})}set scan(e){const t=this.#R?.interlaced!==e?.interlaced,i=t||this.#R?.topFieldFirst!==e?.topFieldFirst;this.#R=e,!(i&&(!this.#Te()||this.#R!==e))&&(this.#T?.postMessage({type:"scan",scan:e}),i&&(this.#w=0,this.#D(),this.#Q(),t&&(this.#g=0),this.#n=null,this.#ie(!1)),this.#ct(),i&&((e?.interlaced??!0)&&(this.#k||this.#y==="main")?this.#Oe():this.#Et()))}get scan(){return this.#R}set videoTimeline(e){this.#ae=e,this.#T?.postMessage({type:"timeline",videoTimeline:e}),e.length===0&&(this.#R=null),this.#ct()}get videoTimeline(){return this.#ae}get container(){return this.#B??this.#e}get doubleRate(){return this.#M}set doubleRate(e){e!==this.#M&&(this.#M=e,this.#ge(),this.#D(),this.#Pt())}get spatialCheck(){return this.#N}set spatialCheck(e){e!==this.#N&&(this.#N=e,this.#ge())}get film(){return this.#P}set film(e){const t=this.#T?this.#lt:this.#he;if(!(e===this.#P&&(e===!1||t===null))){if(this.#T){this.#P=e,this.#ge(e?"film":void 0);return}if(e){if(!this.#Te())return;try{this.#Dt()}catch(i){this.#P=!0,this.#ge(),this.#qe(`film detector unavailable: ${i instanceof Error?i.message:String(i)}`);return}}if(this.#P=e,this.#ge(),!e){if(!this.#Te())return;this.#V=!1,this.#q=0,this.#ne=!1,this.#I=_,this.#Q(),this.#h?.destroy(),this.#h=null}this.#Pt()}}get debug(){return this.#z}set debug(e){e!==this.#z&&(this.#z=e,this.#ge())}get#Zt(){return this.#M||this.#P}#Pt(){this.#j||(this.#Zt?(this.#C>0&&this.#Wt(),(this.#R?.interlaced??!0)&&(this.#k||this.#y==="main")&&this.#Oe()):this.#P||(this.#n=null,this.#ie(!1),this.#Xe()))}#ge(e){this.#T?.postMessage({type:"settings",options:this.#St(),retryFilm:e})}#kt(){if(this.#s.getExtension("EXT_color_buffer_float")===null)throw new Error("film needs EXT_color_buffer_float")}#Dt(){this.#kt(),this.#h??=new K(this.#s),this.#C>0&&this.#h.resize(this.#C,this.#$)}#ct(){this.#Ge&&(this.#ae.length>0||(this.#R?.interlaced??!0))?this.start():this.stop()}#ei(){return this.#k||this.#J==="main"?!1:this.#y==="starting"||this.#y==="active"?!0:typeof Worker<"u"&&typeof VideoFrame<"u"&&typeof OffscreenCanvas<"u"&&this.#st!==null&&"transferControlToOffscreen"in HTMLCanvasElement.prototype?(this.#Ct(),!0):this.#J==="auto"?(this.#Ke(),!1):(this.#y="failed",this.#S=!1,!0)}#Ct(){this.#ee(),this.#T?.terminate(),this.#T=null,this.#Se=!1,this.#ze=!1,this.#lt=null,this.#ut=0;let e=this.#i;if(this.#nt){e=document.createElement("canvas"),e.className=this.#i.className;const r=this.#i.getAttribute("style");r===null?e.removeAttribute("style"):e.setAttribute("style",r),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e}const t=++this.#rt;this.#y="starting";let i,s;try{s=e.transferControlToOffscreen(),this.#nt=!0,i=new Worker(this.#st,{type:"module"})}catch(r){this.#Ue(r instanceof Error?r.message:String(r));return}this.#T=i,i.onmessage=r=>{t===this.#rt&&this.#ti(r.data)},i.onerror=r=>{t===this.#rt&&(r.preventDefault(),this.#Ue(r.message||"the deinterlacer worker failed"))},i.postMessage({type:"initialize",canvas:s,options:this.#St(),scan:this.#R,videoTimeline:this.#ae,enabled:this.#S,video:this.#dt()},[s])}#ti(e){switch(e.type){case"ready":this.#y="active",this.#S&&(this.#Be(),this.#Ze());break;case"failed":this.#Ue(e.message);break;case"consumed":{this.#Se=!1,this.#ze=!0;const t=this.#ue;this.#ue=null,t&&this.#Lt(t);break}case"visibility":this.#i.style.visibility=e.visible?"visible":"hidden";break;case"stats":{const t={...e.stats,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0},i=t.filmError??null,s=this.#ut;if(this.#lt=i,this.#ut=e.filmFailure,i!==null&&e.filmFailure!==s){this.dispatchEvent(new CustomEvent("failure",{detail:i}));try{this.#it?.(i)}catch{}}this.dispatchEvent(new CustomEvent("stats",{detail:t})),this.#tt?.(t);break}case"capture":{const t=this.#Pe.get(e.id);if(this.#Pe.delete(e.id),!t){e.image?.close();break}e.image?t.resolve(e.image):createImageBitmap(this.#e).then(t.resolve,t.reject);break}}}#ft(e){if(this.dispatchEvent(new CustomEvent("failure",{detail:e})),!this.#k)try{this.#it?.(e)}catch{}}#qe(e){this.#he!==e&&(this.#he=e,this.#V=!1,this.#q=0,this.#ne=!1,this.#I=_,this.#Q(),this.#h?.destroy(),this.#h=null,this.#ft(e))}#Te(){return this.#j?!1:(this.#T||(this.#he=null),!0)}#Ue(e){if(this.#y==="starting"&&this.#J==="auto"&&!this.#we){this.#Ke();return}if(this.#Mt(e),!this.#we){this.#we=!0,this.#Ct();return}console.error(`Deinterlacer Worker stopped: ${e}`),this.#y="failed",this.#T?.terminate(),this.#T=null,this.#ee(),this.#ft(`deinterlacer worker stopped: ${e}`),this.stop()}#Ke(){const e=this.#t;e.className=this.#i.className;const t=this.#i.getAttribute("style");t===null?e.removeAttribute("style"):e.setAttribute("style",t),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e,this.#nt=!1,this.#T?.terminate(),this.#T=null,this.#y="main",this.#ee(),this.#S&&(this.#Be(),this.#Ze(),(this.#R?.interlaced??!0)&&this.#Oe())}#ee(){this.#ue?.frame.close(),this.#ue=null}#Mt(e){for(const t of this.#Pe.values())t.reject(new Error(e));this.#Pe.clear()}start(){if(!(this.#S||this.#j||this.#K)&&(this.#re++,this.#S=!0,this.#Kt(),!!this.#Te())){if(this.#bi(),this.#Ze(),this.#ei()){this.#T?.postMessage({type:"enabled",enabled:!0}),this.#y==="active"&&this.#Be();return}this.#Be(),(this.#R?.interlaced??!0)&&this.#Oe()}}stop(){this.#re++,this.#S&&(this.#S=!1,this.#o.cancel(),this.encodedVideo?.suspend(),this.#Nt(),this.#Et(),this.#w=0,this.#n=null,this.#ie(!1),this.#ee(),this.#T?.postMessage({type:"enabled",enabled:!1}))}destroy(){if(!this.#j){this.#j=!0,this.#Ge=!1,this.stop(),this.#T?.postMessage({type:"destroy"}),this.#T?.terminate(),this.#T=null,this.#ee(),this.#Mt("the deinterlacer was destroyed"),this.#v?.removeEventListener("visibilitychange",this.#gt),this.#v=null,this.#H?.disconnect(),this.#t.removeEventListener("webglcontextlost",this.#jt),this.#o.destroy(),this.#d?.destroy(),this.encodedVideo?.destroy(),this.#e.removeEventListener("emptied",this.#qt),this.#e.removeEventListener("resize",this.#Vt),this.#e.removeEventListener("pause",this.#se),this.#e.removeEventListener("ended",this.#se),this.#e.removeEventListener("seeking",this.#Yt),this.#e.removeEventListener("seeked",this.#se),this.#e.removeEventListener("ratechange",this.#se),this.#xi();for(const e of this.#c)this.#s.deleteTexture(e);this.#c=[],this.#Xe();for(const e of[...this.#We,...this.#pe.map(({q:t})=>t)])this.#s.deleteQuery(e);this.#We.length=0,this.#pe.length=0,this.#h?.destroy(),this.#h=null,this.#xe!==null&&(ae(this.#xe),this.#xe=null),this.#s.deleteProgram(this.#m),this.#s.deleteProgram(this.#F),this.#s.getExtension("WEBGL_lose_context")?.loseContext()}}capture(){if(this.#y==="active"&&this.#i.style.visibility==="visible"&&this.#T){const s=++this.#Jt,r=new Promise((h,o)=>{this.#Pe.set(s,{resolve:h,reject:o})});return this.#T.postMessage({type:"capture",id:s,width:this.#e.videoWidth,height:this.#e.videoHeight}),r}if(this.#y==="starting"||this.#y==="failed")return createImageBitmap(this.#e);const e=this.#n;if(this.#k&&(!this.#S||this.#K||!e))return Promise.reject(new Error("no rendered picture is available"));if(!this.#S||this.#K||!e)return createImageBitmap(this.#e);e.kind==="texture"?this.#yt(e.texture,e.flip,!1):this.#oe(e.flush,e.second,null,!1);const t=this.#e.videoWidth,i=this.#e.videoHeight;return t>0&&i>0&&(t!==this.#t.width||i!==this.#t.height)?createImageBitmap(this.#t,{resizeWidth:t,resizeHeight:i,resizeQuality:"high"}):createImageBitmap(this.#t)}addEventListener(e,t,i){super.addEventListener(e,t,i)}removeEventListener(e,t,i){super.removeEventListener(e,t,i)}#Be(){this.#k||!this.#S||this.#o.request(this.#li)}#dt(){const e=[];for(let t=0;t<this.#e.buffered.length;t++)e.push({start:this.#e.buffered.start(t),end:this.#e.buffered.end(t)});return{currentTime:this.#e.currentTime,playbackRate:this.#e.playbackRate,seeking:this.#e.seeking,paused:this.#e.paused,ended:this.#e.ended,readyState:this.#e.readyState,videoWidth:this.#e.videoWidth,videoHeight:this.#e.videoHeight,buffered:e}}#ii(e,t,i){let s;try{s=i?.clone()??new VideoFrame(this.#e,{timestamp:Math.max(0,Math.round(t.mediaTime*1e6))})}catch(h){const o=h instanceof Error?h.message:String(h);this.#J==="auto"&&!this.#ze&&!this.#we?(this.#Ke(),this.#je(e,t)):this.#Ue(o);return}const r={id:++this.#Qt,frame:s,now:e,metadata:t,video:this.#dt()};if(this.#Se){this.#ue?.frame.close(),this.#ue=r;return}this.#Lt(r)}#Lt(e){const t=this.#T;if(!t||this.#y!=="active"){e.frame.close();return}this.#Se=!0;const i={type:"frame",id:e.id,frame:e.frame,metadata:e.metadata,video:e.video};try{t.postMessage(i,[e.frame])}catch(s){this.#Se=!1,e.frame.close();const r=s instanceof Error?s.message:String(s);this.#J==="auto"&&!this.#ze&&!this.#we?(this.#Ke(),this.#je(e.now,e.metadata)):this.#Ue(r)}}#si(e,t,i){this.#xe==null&&(this.#xe=he(this.#s,"20px monospace")),le(this.#xe,e,t,i,this.#C,this.#$,20)}#Ut(e){if(this.#me==null||this.#pe.length>30)return;const t=this.#We.pop()??this.#s.createQuery();return this.#s.beginQuery(this.#me.TIME_ELAPSED_EXT,t),this.#pe.push({q:t,isField:e}),t}#Ye(e){this.#me!=null&&(e!=null&&this.#s.endQuery(this.#me.TIME_ELAPSED_EXT),this.#pe=this.#pe.filter(({q:t,isField:i})=>{if(this.#s.getQueryParameter(t,this.#s.QUERY_RESULT_AVAILABLE)){const s=this.#s.getQueryParameter(t,this.#s.QUERY_RESULT);return i?(this.#Me+=s,this.#Ee++):(this.#Ce+=s,this.#ve++),this.#We.push(t),!1}return!0}))}#Q(){this.#I=_,this.#Le=_,this.#be=0,this.#V=!1,this.#h?.reset()}#ri(){const{prev:e,cur:t,next:i}=this.#Ft(!1),s=this.#c[e],r=this.#c[t],h=this.#c[i];if(!s||!r||!h)return;const o=this.#R?.topFieldFirst!==!1?0:1;this.#h?.detect(r,h,o),this.#h?.measureComb(s,r,o)}#ni(){const{cur:e,next:t}=this.#Ft(!1),i=this.#c[e],s=this.#c[t],r=this.#h;if(!i||!s||!r)return!1;const h=this.#R?.topFieldFirst!==!1?0:1;try{r.measureComb(i,s,h,!0)}catch(o){return this.#qe(`film detection failed: ${o instanceof Error?o.message:String(o)}`),!1}return!0}#hi(){const e=this.#h?.poll()??null;e!==null&&(this.#Le=e,this.#be=e.age),this.#be++;const{phase:t,run:i}=this.#Le;t===0||this.#be>Math.ceil(G*Math.max(1,this.#e.playbackRate))?this.#I=_:this.#I={phase:(t-1+this.#be)%G+1,run:i}}#oi(e){const t=[],i=this.#h?.metrics??new Float32Array(0);for(let r=0;r<v.phase;r++){const h=i[r*4]??0,o=i[r*4+1]??0,u=i[r*4+2]??0;t.push(`${h.toFixed(3)},${o.toString().padStart(4)},${u.toFixed(3)}`)}const s=this.#Ve.map((r,h)=>`${h===0?"-":h}:${r}`).join(" ");return`frame=${e} phase=${this.#I.phase} run=${this.#I.run} known=${this.#Le.phase}/${this.#Le.run} age=${this.#be} ${this.#V?"film":"video"} period=${this.#g.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#at}`}#mt(e,t){const i=t-performance.timeOrigin;return Number.isFinite(i)&&i!==0?e+i:e}#ai(e,t){const i=e.expectedDisplayTime;if(!Number.isFinite(i)||i<=0||!Number.isFinite(e.timeOrigin))return t;const s=this.#mt(i,e.timeOrigin),r=ze*Math.max(this.#A,this.#g);return s<t-r||s>t+r?t:s}#li=(e,t)=>{if(!this.#S||this.#K)return;this.#xt();const i=this.#mt(e,t.timeOrigin),{frame:s,picture:r,...h}=t;this.#le=s??this.#e,this.#a=r??null;try{this.#ui(i,h,s)}finally{this.#le=this.#e,this.#a=null}this.#Be()};#ui(e,t,i){if(this.#y==="active"){this.#ii(e,t,i);return}this.#y!=="starting"&&this.#je(e,t)}ingestExternalFrame(e,t,i){this.#le=i;try{this.#je(e,t)}finally{this.#le=this.#e}}#je(e,t){const i=this.#re;if(this.#te(i)&&(this.#ci(t.mediaTime),!!this.#te(i)&&t.width>0&&t.height>0)){let s=!1;if(!this.#Ae&&this.#e.seeking){const l=this.#e.buffered,d=this.#g>=J?this.#g/1e3:B/1e3;for(let p=0;p<l.length;p++)if(t.mediaTime>=l.start(p)&&t.mediaTime<l.end(p)&&Math.abs(t.mediaTime-this.#e.currentTime)<=d){s=!0;break}}if(s&&(this.#Ae=!0),(this.#C===0||this.#$===0)&&this.#Ht(t.width,t.height),!this.#te(i))return;if(this.#R&&!this.#R.interlaced){const l=performance.now();this.#Gt(l),this.#$e=l,this.#q>0&&this.#q--,this.#ot=!0,this.#vi(),this.#ce+=performance.now()-l,this.#Z++,this.#fe++,this.#zt(l);return}const r=t.mediaTime-this.#_e,h=t.mozTiming,o=s||(h?h.discontinuity||r<0||r>j:r<0||r>j);o&&(this.#w=0,this.#g=0,this.#U.discontinuities++,this.#D(),this.#Q(),(s||!this.#ot)&&(this.#q=0)),this.#ot=!1;const u=this.#Ei(t.presentedFrames,o);if(this.#w>0&&t.mediaTime===this.#_e&&(!h||t.presentedFrames===this.#et))return;if(!o){const l=h?.periodMs??0;l>0?this.#Bt(l*(this.#e.playbackRate||1)/1e3,1):this.#w>0&&r>0&&this.#Bt(r,u+1)}this.#_e=t.mediaTime,this.#et=t.presentedFrames;const f=performance.now();this.#Gt(f),this.#$e=f;const a=performance.now(),m=this.#Ut(!1);if(this.#$t(),this.#P&&!this.#he&&!this.#h)try{this.#Dt()}catch(l){this.#qe(`film detector unavailable: ${l instanceof Error?l.message:String(l)}`)}if(!this.#te(i)){this.#j||this.#Ye(m);return}if(this.#ne=!1,this.#ht=!1,this.#P&&!this.#he){let l=!1;if(this.#w===y&&u===0)try{this.#hi(),this.#ri(),l=!0}catch(d){this.#qe(`film detection failed: ${d instanceof Error?d.message:String(d)}`)}else this.#Q();this.#Ve[this.#I.phase]=(this.#Ve[this.#I.phase]??0)+1,this.#V=this.#I.phase!==0&&this.#I.run>=O,this.#V?this.#q=$e:this.#q>0&&this.#q--,this.#ne=l&&!this.#_t&&this.#q>0,this.#ht=this.#ne&&!this.#V&&this.#M&&this.#Ie()&&this.#ni(),this.#ne&&!this.#V&&this.#U.matched++,this.#z&&(this.#At=this.#oi(t.presentedFrames))}if(this.#_t=u>0,!this.#te(i)){this.#j||this.#Ye(m);return}const c=this.#ai(t,e)+this.#A;if(this.#V)if(this.#Ie()){const l=this.#I.phase;if(l===I)this.#at++,this.#X++;else{const d=this.#g*G/He,p=this.#vt(1,e,d),b=We[l]??0,z=p||this.#Y===null?c+d:c+b*this.#g;this.#Qe("film",!1,this.#pt("film",z,d),d)}}else this.#oe(!1,!1,null);else if(this.#M&&this.#Ie()){const l=this.#g/2,p=this.#vt(2,e,l)||this.#Y===null?c+l*2:c,b=this.#pt("field",p,l);this.#Qe("field",!1,b,l),this.#Qe("field",!0,b+l,l)}else if(this.#Ie()){const l=this.#g,p=this.#vt(1,e,l)||this.#Y===null?c+l:c;this.#Qe("frame",!1,this.#pt("frame",p,l),l)||(this.#U.late++,this.#oe(!1,!1,null))}else this.#U.late+=this.#u.length,this.#D(),this.#oe(!1,!1,null);this.#de=Math.max(this.#de,this.#u.length),this.#Ye(m),this.#ce+=performance.now()-a,this.#Z++,this.#zt(f)}}#te(e){return!this.#j&&this.#S&&e===this.#re}#ci(e){const t=this.#re;let i;for(let h=this.#ae.length-1;h>=0;h--){const o=this.#ae[h];if(o.start<=e+1e-6){i=o;break}}if(i?.codedSize&&(i.codedSize.width!==this.#C||i.codedSize.height!==this.#$)&&this.#Ht(i.codedSize.width,i.codedSize.height),!this.#te(t))return;const s=i?.scan;if(!s||this.#R?.interlaced===s.interlaced&&this.#R.topFieldFirst===s.topFieldFirst)return;const r=this.#R?.interlaced;this.#R=s,this.#w=0,this.#D(),this.#Te()&&(r!==s.interlaced&&(this.#g=0),s.interlaced&&(this.#k||this.#y==="main")?this.#Oe():this.#Et(),this.#Q())}#Ie(){return(this.#M||this.#P)&&this.#g>0&&this.#f.length===w}#Bt(e,t){const s=e*1e3/(this.#e.playbackRate||1)/t;s<J||s>B||(this.#g=this.#g>0&&s>this.#g*Oe?this.#g+(s-this.#g)*Ue:s)}#Qe(e,t,i,s){const r=this.#It();if(r===null)return!1;const h=this.#f[r];if(!h)return!1;for(this.#l=r;this.#u.length>0&&this.#u[0]?.slot===r;)this.#u.shift(),this.#U.late++;this.#oe(!1,t,h.framebuffer);const o={slot:r,at:i,duration:s,cadence:e,phase:e==="film"?this.#I.phase:e==="field"?t?2:1:0,droppedBefore:this.#X};return this.#X=0,this.#u.push(o),this.#Y=o,!0}#pt(e,t,i){if(!(i>0))return t;const s=this.#Y;if(s!==null&&s.cadence===e){const r=s.at+s.duration,h=t-r;if(Math.abs(h)<i){const o=Math.max(-Z,Math.min(Z,h*Ne));return r+o}}s!==null&&this.#U.resynced++;for(let r=this.#u.at(-1);r&&r.at>=t;)this.#u.pop(),this.#U.late++,r=this.#u.at(-1);return t}#vt(e,t,i){const s=this.#u.at(-1),r=(X+1)*Math.max(this.#A,i);if(s&&s.at-t>r)return this.#D(),this.#U.queueResetted++,!0;const h=Math.max(0,this.#u.length+e-X);let o=0,u=0;for(;u<h;){const f=this.#u.shift();if(!f)break;o+=f.duration,u++}for(const f of this.#u)f.at-=o;return this.#U.late+=u,!1}#It(){const e=this.#n?.kind==="texture"?this.#n.texture:null,t=new Set(this.#u.map(({slot:s})=>s));for(let s=1;s<=w;s++){const r=(this.#l+s)%w,h=this.#f[r];if(h&&h.texture!==e&&!t.has(r))return r}const i=this.#u[0];if(i){const s=this.#f[i.slot];if(s&&s.texture!==e)return i.slot}return null}#Oe(){this.#x===null&&(!this.#S||this.#K||(this.#_=0,this.#x=this.#ye(this.#bt)))}#Et(){this.#Je(this.#x),this.#x=null,this.#D()}#bt=e=>{if(this.#x=null,!this.#S||this.#K)return;this.#fi(e);const t=this.#re;this.#o.flush(e),this.#te(t)&&(this.#y==="main"&&this.#mi(this.#O,e),this.#x=this.#ye(this.#bt))};#fi(e){const t=e-this.#_;this.#_=e;const i=Math.max(1,Math.round(t/this.#A)),s=this.#O+i*this.#A,r=e-s;if(this.#O===0||t<=0||t>B||Math.abs(r)>this.#A/4){t>=1&&t<=B&&(this.#A=t),this.#O=e;return}this.#A+=r/i*Xe,this.#O=s+r*Ge}#Ot(){const e=this.#k;if(e)return{frames:e,origin:performance.timeOrigin};const t=this.#i.ownerDocument?.defaultView??this.#e.ownerDocument?.defaultView??null;return t===null?{frames:qe,origin:performance.timeOrigin}:{frames:t,origin:t.performance.timeOrigin}}#ye(e){const{frames:t,origin:i}=this.#Ot(),s=t.requestAnimationFrame(r=>e(this.#mt(r,i)));return{frames:t,handle:s}}#Je(e){e?.frames.cancelAnimationFrame(e.handle)}#xt(){if(this.#k)return;this.#di();const{frames:e}=this.#Ot(),t=this.#x!==null&&this.#x.frames!==e,i=this.#p!==null&&this.#p.frames!==e;!t&&!i||(this.#_=0,t&&(this.#Je(this.#x),this.#x=this.#ye(this.#bt)),i&&(this.#Je(this.#p),this.#p=this.#ye(this.#Tt)))}#di(){const e=this.#k?null:this.#i.ownerDocument??null;e!==this.#v&&(this.#v?.removeEventListener("visibilitychange",this.#gt),this.#v=e,e?.addEventListener("visibilitychange",this.#gt),this.#H?.disconnect(),e&&this.#H?.observe(e,{childList:!0,subtree:!0}))}#gt=()=>{this.#j||this.#xt()};#Ze(){this.#k||this.#p!==null||!this.#o.captureDriven||!this.#S||this.#K||(this.#p=this.#ye(this.#Tt))}#Nt(){this.#Je(this.#p),this.#p=null}#Tt=e=>{if(this.#p=null,!this.#S||this.#K)return;const t=this.#re;this.#o.flush(e),this.#te(t)&&this.#o.captureDriven&&(this.#p=this.#ye(this.#Tt))};#mi(e,t){const i=this.#A/2,s=u=>{const f=u.at-e;return f<=i-ee?!0:f>i+ee?!1:this.#Fe>0};for(;this.#u[1]&&s(this.#u[1]);)this.#U.late++,this.#u.shift();const r=this.#u[0];if(!r||!s(r))return;this.#u.shift(),this.#Fe=r.at-e;const h=performance.now(),o=this.#Ut(!0);this.#Xt(r.slot),this.#Ye(o),this.#De+=performance.now()-h,this.#fe++,this.#z&&this.#pi(r,t),this.#W=t}#pi(e,t){const i=this.#W===0?0:t-this.#W,s=i/this.#A,r=e.cadence==="film"?`phase ${e.phase}`:e.cadence==="field"?`field ${e.phase}`:"frame",h=e.phase===0?"duplicate":`phase ${I}`,o=e.droppedBefore>0?`, ${h} dropped before it`+(e.droppedBefore>1?` (${e.droppedBefore})`:""):"";console.log(`yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at-t).toFixed(2)} ms${o}`)}#Xt(e){const t=this.#f[e];t&&this.#yt(t.texture)}#vi(){this.#$t();const e=this.#c[this.#L];e&&this.#yt(e,!0),this.#w=0}#ie(e){if(this.#k){this.#k.onVisibility(e);return}this.#i.style.visibility=e?"visible":"hidden"}#yt(e,t=!1,i=!0){const s=this.#s;s.bindFramebuffer(s.FRAMEBUFFER,null),s.useProgram(this.#F),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this.#b,0),s.uniform1i(this.#E,t?1:0),s.viewport(0,0,this.#C,this.#$),s.drawArrays(s.TRIANGLES,0,3),this.#n={kind:"texture",texture:e,flip:t},this.#ie(!0),i&&this.#G++}#Ei(e,t){let i=0;return this.#ke!==0&&!t&&(i=Math.max(0,e-this.#ke-1),this.#U.missed+=i),this.#ke=e,i}#Gt(e){e-this.#$e<=Q||(this.#He=e,this.#Z=0,this.#ce=0,this.#fe=0,this.#De=0,this.#de=0,this.#G=0,this.#Ce=0,this.#ve=0,this.#Me=0,this.#Ee=0)}#zt(e){const t=e-this.#He;if(t<Q)return;const i=this.#Ie()&&(this.#M||this.#V)?this.#fe:this.#Z,s=this.#Z?(this.#ce+this.#De)/this.#Z:0;let r;this.#me!=null&&(r=0,this.#ve!==0&&(r+=this.#Ce/1e6/this.#ve),this.#Ee!==0&&(r+=this.#Me/1e6/this.#Ee/2));const h={...this.#U,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0,fps:i*1e3/t,frameMs:s,maxQueuedFields:this.#de,outputFps:this.#G*1e3/t,gpuMs:r,film:this.#V,filmError:this.#he};this.dispatchEvent(new CustomEvent("stats",{detail:h})),this.#tt?.(h),this.#He=e,this.#Z=0,this.#ce=0,this.#fe=0,this.#De=0,this.#de=0,this.#G=0,this.#Ce=0,this.#ve=0,this.#Me=0,this.#Ee=0}#$t(){const e=this.#s;this.#L=(this.#L+1)%y;const t=this.#a,i=this.#c[this.#L];t!==null&&this.#d!==null&&i!==void 0?(this.#c[this.#L]=this.#d.adopt(t,i),this.#a=null):(e.bindTexture(e.TEXTURE_2D,i??null),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#le)),this.#w=Math.min(this.#w+1,y)}#oe(e,t,i,s=!0){if(this.#w===0||this.#K)return;s&&(this.#w===y&&!e?this.#U.filtered++:this.#U.degraded++);const r=this.#s,{prev:h,cur:o,next:u}=this.#Ft(e);r.bindFramebuffer(r.FRAMEBUFFER,i),r.useProgram(this.#m);for(const[d,p]of[h,o,u].entries())r.activeTexture(r.TEXTURE0+d),r.bindTexture(r.TEXTURE_2D,this.#c[p]??null);r.uniform1i(this.#r.prev,0),r.uniform1i(this.#r.cur,1),r.uniform1i(this.#r.next,2);const f=this.#P?this.#h?.texture??null:null,a=this.#P?this.#h?.combTexture??null:null,m=f!==null&&a!==null;f!==null&&a!==null&&(r.activeTexture(r.TEXTURE0+3),r.bindTexture(r.TEXTURE_2D,f),r.uniform1i(this.#r.fieldMetrics,3),r.activeTexture(r.TEXTURE0+4),r.bindTexture(r.TEXTURE_2D,a),r.uniform1i(this.#r.comb,4));const E=this.#ht?this.#h?.combAheadTexture??null:null,c=m&&this.#ne&&!e&&(!t||E!==null);r.activeTexture(r.TEXTURE0+5),r.bindTexture(r.TEXTURE_2D,E),r.uniform1i(this.#r.combAhead,5),r.activeTexture(r.TEXTURE0),r.uniform2i(this.#r.size,this.#C,this.#$);const l=this.#wt?0:1;r.uniform1i(this.#r.parity,t?1-l:l),r.uniform1i(this.#r.tff,this.#wt?1:0),r.uniform1i(this.#r.second,t?1:0),r.uniform1i(this.#r.spatialCheck,this.#N?1:0),r.uniform1i(this.#r.debug,this.#z?1:0),r.uniform1i(this.#r.film,m?1:0),r.uniform1i(this.#r.match,c?1:0),r.uniform1i(this.#r.phase,this.#I.phase),r.viewport(0,0,this.#C,this.#$),r.drawArrays(r.TRIANGLES,0,3),this.#z&&m&&this.#si(this.#At,0,90),i===null&&(this.#n={kind:"yadif",flush:e,second:t},this.#ie(!0),s&&this.#G++)}#Ft(e){const t=i=>(this.#L+y-i)%y;return this.#w===1?{prev:this.#L,cur:this.#L,next:this.#L}:e?{prev:t(1),cur:this.#L,next:this.#L}:this.#w===2?{prev:t(1),cur:t(1),next:this.#L}:{prev:t(2),cur:t(1),next:this.#L}}#Ne(){if(this.#xt(),!this.#B)return;const e=this.#e,t=e.videoWidth,i=e.videoHeight;if(t===0||i===0)return;const s=Math.min(e.offsetWidth/t,e.offsetHeight/i),r=t*s,h=i*s;this.#i.style.left=`${e.offsetLeft+(e.offsetWidth-r)/2}px`,this.#i.style.top=`${e.offsetTop+(e.offsetHeight-h)/2}px`,this.#i.style.width=`${r}px`,this.#i.style.height=`${h}px`}#Ht(e,t){const i=this.#s;this.#t.width=e,this.#t.height=t,this.#C=e,this.#$=t,this.#w=0,this.#q=0,this.#n=null,this.#D(),this.#Ne();for(const s of this.#c)i.deleteTexture(s);this.#c=[];for(let s=0;s<y;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null),this.#c.push(r)}this.#Xe(),(this.#M||this.#P)&&this.#Wt(),this.#h?.resize(e,t),this.#Te()}#Wt(){const e=this.#s;if(!(this.#f.length===w||this.#C===0)){this.#Xe();for(let t=0;t<w;t++){const i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,this.#C,this.#$,0,e.RGBA,e.UNSIGNED_BYTE,null);const s=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0);const r=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!r){e.deleteFramebuffer(s),e.deleteTexture(i),this.#Xe();return}this.#f.push({texture:i,framebuffer:s})}this.#l=w-1}}#Xe(){const e=this.#s,t=this.#n?.kind==="texture"?this.#n.texture:null;this.#f.some(i=>i.texture===t)&&(this.#n=null);for(const{texture:i,framebuffer:s}of this.#f)e.deleteFramebuffer(s),e.deleteTexture(i);this.#f=[],this.#D()}#bi(){if(this.#B)return;const e=this.#e.parentElement;if(!e)return;const t=document.createElement("div");t.style.cssText="position:relative;display:inline-block;line-height:0;max-width:100%",e.insertBefore(t,this.#e),t.appendChild(this.#e),t.appendChild(this.#i),this.#B=t,this.#Re?.observe(this.#e),this.#Ne()}#xi(){if(this.#k)return;const e=this.#B;this.#B=null,this.#Re?.disconnect(),this.#i.remove(),e?.parentElement&&(e.parentElement.insertBefore(this.#e,e),e.remove())}#Vt=()=>this.#Ne();#Rt(e){return!this.#T||this.#y==="main"?!1:(this.#T.postMessage({type:"event",name:e,video:this.#dt()}),!0)}#qt=()=>{if(this.#Rt("emptied")){this.#ee(),this.#ie(!1);return}this.#w=0,this.#_e=0,this.#et=0,this.#D(),this.#Q(),this.#q=0,this.#g=0,this.#Kt(),this.#n=null,this.#ie(!1)};#Kt(){this.#U={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0},this.#Ve.fill(0),this.#at=0,this.#ke=0,this.#He=0,this.#$e=0,this.#Z=0,this.#ce=0,this.#fe=0,this.#De=0,this.#de=0,this.#G=0,this.#D(),this.#Ce=0,this.#ve=0,this.#Me=0,this.#Ee=0}#Yt=()=>{if(this.#Rt("seeking")){this.#ee();return}this.#Ae=!1};#se=e=>{if(e.type==="ratechange"&&(this.#o.captureDriven?this.#Ze():this.#Nt()),(e.type==="pause"||e.type==="ended"||e.type==="seeked"||e.type==="ratechange")&&this.#Rt(e.type)){this.#ee();return}if(e.type==="seeked"){const i=this.#Ae;if(this.#Ae=!1,i)return;this.#w=0,this.#D(),this.#Q(),this.#n=null,this.#ie(!1);return}const t=e.type==="ratechange";if(t&&(this.#g=0,this.#_e=this.#e.currentTime),this.#D(),this.#S&&this.#w>0){const i=this.#It(),s=i===null?void 0:this.#f[i];i!==null&&s?(this.#l=i,this.#oe(!0,!1,s.framebuffer),this.#Xt(i)):this.#oe(!0,!1,null)}t&&(this.#w=0,this.#ke=0,this.#Q())};#jt=e=>{if(e.preventDefault(),this.#k){this.#k.onFailure("the deinterlacer WebGL context was lost");return}this.#y!=="active"&&(this.#K=!0,this.#ft("the deinterlacer WebGL context was lost"),this.stop())}}function Ye(n,e,t,i,s,r,h){return new Ke(n,t,{canvas:e,onFailure:i,onVisibility:s,requestAnimationFrame:r,cancelAnimationFrame:h})}function te(n,e){const t=n.createProgram(),i=ie(n,n.VERTEX_SHADER,Ie),s=ie(n,n.FRAGMENT_SHADER,e);if(n.attachShader(t,i),n.attachShader(t,s),n.linkProgram(t),n.deleteShader(i),n.deleteShader(s),!n.getProgramParameter(t,n.LINK_STATUS)){const r=n.getProgramInfoLog(t);throw n.deleteProgram(t),new Error(`the deinterlacer failed to link: ${r??"no reason given"}`)}return t}function ie(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const D=self;class je extends EventTarget{currentTime=0;playbackRate=1;seeking=!1;paused=!0;ended=!1;readyState=0;videoWidth=0;videoHeight=0;parentElement=null;offsetWidth=0;offsetHeight=0;offsetLeft=0;offsetTop=0;#t=[];update(e){this.currentTime=e.currentTime,this.playbackRate=e.playbackRate,this.seeking=e.seeking,this.paused=e.paused,this.ended=e.ended,this.readyState=e.readyState,this.videoWidth=e.videoWidth,this.videoHeight=e.videoHeight,this.#t=e.buffered}get buffered(){return{length:this.#t.length,start:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.start},end:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.end}}}getVideoPlaybackQuality(){return{creationTime:performance.now(),droppedVideoFrames:0,totalVideoFrames:0,corruptedVideoFrames:0}}requestVideoFrameCallback(){return 0}cancelVideoFrameCallback(){}}let T=null,x=null,se=!1;function Qe(n){return D.requestAnimationFrame(n)}function Je(n){D.cancelAnimationFrame(n)}function F(n,e=[]){D.postMessage(n,e)}function Ze(n,e,t){n.doubleRate=e.doubleRate,n.spatialCheck=e.spatialCheck,(n.film!==e.film||t==="film")&&(n.film=e.film),n.debug=e.debug}D.onmessage=n=>{const e=n.data;try{if(e.type==="initialize"){if(typeof D.requestAnimationFrame!="function")throw new Error("requestAnimationFrame is unavailable in this Worker");T=new je,T.update(e.video),x=Ye(T,e.canvas,e.options,i=>{se||F({type:"failed",message:i})},i=>F({type:"visibility",visible:i}),Qe,Je);let t=0;x.addEventListener("failure",()=>t++),x.addEventListener("stats",i=>{const{dropped:s,...r}=i.detail;F({type:"stats",stats:r,filmFailure:t})}),x.scan=e.scan,x.videoTimeline=e.videoTimeline,x.enabled=e.enabled,F({type:"ready"});return}if(!T||!x)return;switch(e.type){case"frame":T.update(e.video);try{x.ingestExternalFrame(performance.now(),e.metadata,e.frame)}finally{e.frame.close(),F({type:"consumed",id:e.id})}break;case"settings":Ze(x,e.options,e.retryFilm);break;case"scan":x.scan=e.scan;break;case"timeline":x.videoTimeline=e.videoTimeline;break;case"enabled":x.enabled=e.enabled;break;case"event":T.update(e.video),T.dispatchEvent(new Event(e.name));break;case"capture":T.videoWidth=e.width,T.videoHeight=e.height,x.capture().then(t=>F({type:"capture",id:e.id,image:t},[t])).catch(()=>F({type:"capture",id:e.id,image:null}));break;case"destroy":se=!0,x.destroy(),x=null,T=null,D.close();break}}catch(t){const i=t instanceof Error?t.message:String(t);F({type:"failed",message:i})}}})();
//# sourceMappingURL=worker-D15SyVxv.js.map
