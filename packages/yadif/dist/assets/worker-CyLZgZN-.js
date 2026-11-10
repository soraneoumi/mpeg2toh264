(function(){"use strict";const D=`#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;function S(n,e,t){const i=n.createProgram(),s=$(n,n.VERTEX_SHADER,t),r=$(n,n.FRAGMENT_SHADER,e);if(n.attachShader(i,s),n.attachShader(i,r),n.linkProgram(i),n.deleteShader(s),n.deleteShader(r),!n.getProgramParameter(i,n.LINK_STATUS)){const h=n.getProgramInfoLog(i);throw n.deleteProgram(i),new Error(`the deinterlacer failed to link: ${h??"no reason given"}`)}return i}function $(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const se=`#version 300 es
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
`,re=`#version 300 es
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
`;function ne(n,e){const t=S(n,se,re),i=n.getAttribLocation(t,"aVertexPosition"),s=n.getAttribLocation(t,"aTextureCoord"),r=n.getUniformLocation(t,"uTexture"),h=n.getUniformLocation(t,"uMatrix"),o=n.getUniformLocation(t,"uUvMatrix"),u=n.getUniformLocation(t,"uTextColor"),f=n.getUniformLocation(t,"uBackColor");if(r==null||h==null||o==null||u==null||f==null)throw new Error("failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER");const a=n.createBuffer(),m=n.createBuffer();return{gl:n,...he(n,e),program:t,programUniforms:{vertex:i,textureCoord:s,texture:r,matrix:h,uvMatrix:o,textColor:u,backColor:f},positionBuffer:a,textureBuffer:m}}function he(n,e){const t=new OffscreenCanvas(0,0),i=t.getContext("2d"),s=new Map;let r=0;const h=0;let o=1;i.font=e,i.fillStyle="white";for(let f=32;f<128;f++){const a=String.fromCharCode(f),m=i.measureText(a),v=Math.ceil(m.actualBoundingBoxDescent+m.actualBoundingBoxAscent+1),c=Math.ceil(m.actualBoundingBoxLeft+m.actualBoundingBoxRight+1);s.set(a,{x:r,y:h,width:c,height:v,metrics:m}),o=Math.max(o,v),r+=c}t.width=r,t.height=o,i.font=e,i.fillStyle="white";for(const[f,a]of s)i.fillText(f,Math.floor(a.x+a.metrics.actualBoundingBoxLeft+1),Math.floor(a.metrics.actualBoundingBoxAscent+1));const u=n.createTexture();return n.bindTexture(n.TEXTURE_2D,u),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t),{fontTexture:u,chars:s,textureSize:{width:r,height:o}}}function oe(n){const e=n.gl;e.deleteBuffer(n.positionBuffer),e.deleteBuffer(n.textureBuffer),e.deleteTexture(n.fontTexture),e.deleteProgram(n.program)}function ae(n,e,t,i,s,r,h){const o=[],u=[],f=t;for(const v of e){if(v===`
`){t=f,i+=h;continue}const c=n.chars.get(v);if(c==null)continue;if(c.width===1){t+=c.metrics.width;continue}const l=Math.floor(t-c.metrics.actualBoundingBoxLeft),d=Math.floor(i-c.metrics.actualBoundingBoxAscent),E=l+c.width,x=d+c.height;o.push(l,d),u.push(c.x,c.y),o.push(l,x),u.push(c.x,c.y+c.height),o.push(l+c.width,x),u.push(c.x+c.width,c.y+c.height),o.push(E,x),u.push(c.x+c.width,c.y+c.height),o.push(l,d),u.push(c.x,c.y),o.push(E,d),u.push(c.x+c.width,c.y),t+=c.metrics.width}const a=n.gl;a.useProgram(n.program),a.bindBuffer(a.ARRAY_BUFFER,n.positionBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(o),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.vertex,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.vertex),a.bindBuffer(a.ARRAY_BUFFER,n.textureBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(u),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.textureCoord,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.textureCoord),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,n.fontTexture),a.uniform1i(n.programUniforms.texture,0),a.uniform3fv(n.programUniforms.textColor,[1,1,1]),a.uniform3fv(n.programUniforms.backColor,[0,0,0]);function m(v,c,l){const d=[];for(let E=0;E<c;E++)for(let x=0;x<v;x++)d.push(l[x*v+E]);return d}a.uniformMatrix4fv(n.programUniforms.matrix,!1,m(4,4,[1/(s/2),0,0,-1,0,-2/r,0,1,0,0,1,0,0,0,0,1])),a.uniformMatrix3fv(n.programUniforms.uvMatrix,!1,m(3,3,[1/n.textureSize.width,0,0,0,1/n.textureSize.height,0,0,0,1])),a.viewport(0,0,s,r),a.enable(a.BLEND),a.blendFunc(a.SRC_ALPHA,a.ONE_MINUS_SRC_ALPHA),a.drawArrays(a.TRIANGLES,0,o.length/2),a.disable(a.BLEND)}const p={firstRepeatsPrevious:0,secondRepeatsNext:1,secondRepeatsPrevious:2,previousSecondRepeated:3,firstRepeatsNext:4,previousFirstRepeated:5,phase:6},R=7,H=2,I=1,le=2,O=10,ue={a:"uA",b:"uB",fieldMetrics:"uFieldMetrics",first:"uFirst",size:"uSize"},V=16,W=8,ce=`#version 300 es

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
  const int BLOCK_H = ${W};

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
`,fe={second:"uSecond",first:"uFirst",size:"uSize"},k=8,de=`#version 300 es
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
`,me={previous:"uPrevious",second:"uSecond",first:"uFirst",size:"uSize"},pe=`#version 300 es
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
`,F=16,ve=8,Ee={prev:"uPrev",cur:"uCur",first:"uFirst",size:"uSize"},xe=`#version 300 es
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
  ivec2 base = block * ${F};
  float standing = 0.0;
  float woven = 0.0;
  for (int dy = 0; dy < ${F}; ++dy) {
    int y = base.y + dy;
    if (y >= uSize.y || (y & 1) == uFirst) continue;
    for (int dx = 0; dx < ${F}; ++dx) {
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
`,be={prev:"uPrev",cur:"uCur",next:"uNext",size:"uSize",parity:"uParity",tff:"uTff",spatialCheck:"uSpatialCheck",debug:"uDebug",film:"uFilm",second:"uSecond",phase:"uPhase",fieldMetrics:"uFieldMetrics",comb:"uComb"},ge=`#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform sampler2D uNext;
uniform sampler2D uFieldMetrics;
uniform sampler2D uComb;
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
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${p.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${O}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${I} || phase == ${le};
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
    vec4 comb = texelFetch(uComb, ivec2(x / ${F}, y / ${F}), 0);
    bool combedBlock = (mixed ? comb[1] : comb[0]) > ${ve}.0;
    if ((y & 1) != uParity &&
        (combedBlock || (detectedPhase() == 4 && movingComb(rgb, x, y))))
      rgb = filterPixel(uPrev, uCur, x, y);
  } else if ((y & 1) == uParity) {
    rgb = texelFetch(uCur, ivec2(x, y), 0).rgb;
  } else if ((uParity ^ uTff) != 0) {
    // The first field of the frame: the moment it holds sits between the
    // previous frame and the second field of this one.
    rgb = filterPixel(uPrev, uCur, x, y);
  } else {
    rgb = filterPixel(uCur, uNext, x, y);
  }
  fragColor = vec4(rgb, 1.0);
}
`,_={phase:0,run:0};function U(n,e,t){return Object.fromEntries(Object.entries(t).map(([i,s])=>[i,n.getUniformLocation(e,s)]))}class q{#t;#i;#e;#n;#c;#h;#s;#a;#f;#r=null;#R=null;#x=null;#v=null;#E=0;#l=null;#u=null;#o=0;#d=0;metrics=new Float32Array(R*4);#m=0;#_=0;constructor(e){this.#t=e,this.#i=S(e,ce,D),this.#e=U(e,this.#i,ue),this.#n=S(e,de,D),this.#c=U(e,this.#n,fe),this.#h=S(e,pe,D),this.#s=U(e,this.#h,me),this.#a=S(e,xe,D),this.#f=U(e,this.#a,Ee)}get texture(){return this.#v?.[this.#E]?.textures[0]??null}get combTexture(){return this.#x?.textures[0]??null}resize(e,t){e===this.#m&&t===this.#_||(this.#m=e,this.#_=t,this.#T())}reset(){const e=this.#t;e.deleteSync(this.#u),this.#u=null,this.#o=0;const t=this.#v?.[this.#E];if(!t)return;const i=new Float32Array(R*4);for(let s=0;s<p.phase;s++)i[s*4+1]=1;e.bindTexture(e.TEXTURE_2D,t.textures[0]??null),e.texSubImage2D(e.TEXTURE_2D,0,0,0,R,1,e.RGBA,e.FLOAT,i)}detect(e,t,i){const s=this.#t;if(this.#m===0||this.#_===0)return;this.#V();const r=this.#r,h=this.#R,o=this.#v;if(r===null||h===null||o===null)return;const u=o[this.#E],f=o[1-this.#E];if(s.bindFramebuffer(s.FRAMEBUFFER,r.framebuffer),s.useProgram(this.#i),this.#p(0,e,this.#e.a),this.#p(1,t,this.#e.b),this.#p(2,u.textures[0],this.#e.fieldMetrics),s.uniform1i(this.#e.first,i),s.uniform2i(this.#e.size,this.#m,this.#_),s.viewport(0,0,r.width,r.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,h.framebuffer),s.useProgram(this.#n),this.#p(0,r.textures[0],this.#c.second),this.#p(1,r.textures[1],this.#c.first),s.uniform2i(this.#c.size,r.width,r.height),s.viewport(0,0,h.width,h.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,f.framebuffer),s.useProgram(this.#h),this.#p(0,u.textures[0],this.#s.previous),this.#p(1,h.textures[0],this.#s.second),this.#p(2,h.textures[1],this.#s.first),s.uniform2i(this.#s.size,h.width,h.height),s.viewport(0,0,R,1),s.drawArrays(s.TRIANGLES,0,3),this.#E=1-this.#E,this.#o++,this.#u!==null){s.bindFramebuffer(s.FRAMEBUFFER,null);return}this.#d=this.#o,s.bindBuffer(s.PIXEL_PACK_BUFFER,this.#l),s.readPixels(0,0,R,1,s.RGBA,s.FLOAT,0),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.FRAMEBUFFER,null),this.#u=s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE,0),s.flush()}measureComb(e,t,i){const s=this.#t;if(this.#m===0||this.#_===0)return;this.#V();const r=this.#x;r!==null&&(s.bindFramebuffer(s.FRAMEBUFFER,r.framebuffer),s.useProgram(this.#a),this.#p(0,e,this.#f.prev),this.#p(1,t,this.#f.cur),s.uniform1i(this.#f.first,i),s.uniform2i(this.#f.size,this.#m,this.#_),s.viewport(0,0,r.width,r.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,null))}poll(){const e=this.#t,t=this.#u;if(t===null||this.#l===null)return null;switch(e.clientWaitSync(t,0,0)){case e.ALREADY_SIGNALED:case e.CONDITION_SATISFIED:return e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#l),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,this.metrics),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),e.deleteSync(t),this.#u=null,{phase:this.metrics[p.phase*4]??0,run:this.metrics[p.phase*4+1]??0,age:this.#o-this.#d};default:return null}}destroy(){const e=this.#t;if(this.#T(),this.#v!==null){for(const t of this.#v)M(e,t);this.#v=null}e.deleteSync(this.#u),this.#u=null,e.deleteBuffer(this.#l),this.#l=null,e.deleteProgram(this.#i),e.deleteProgram(this.#n),e.deleteProgram(this.#h),e.deleteProgram(this.#a)}#p(e,t,i){const s=this.#t;s.activeTexture(s.TEXTURE0+e),s.bindTexture(s.TEXTURE_2D,t??null),s.uniform1i(i,e)}#T(){const e=this.#t;this.#r!==null&&M(e,this.#r),this.#R!==null&&M(e,this.#R),this.#x!==null&&M(e,this.#x),this.#r=null,this.#R=null,this.#x=null}#V(){const e=this.#t;if(this.#r===null||this.#R===null||this.#x===null){this.#T();const t=Math.ceil(this.#m/V),i=Math.ceil(this.#_/(W*2));this.#r=C(e,t,i,2),this.#R=C(e,Math.ceil(t/k),Math.ceil(i/k),2),this.#x=C(e,Math.ceil(this.#m/F),Math.ceil(this.#_/F),1)}this.#v===null&&(this.#v=[C(e,R,1,1),C(e,R,1,1)],this.#E=0,this.reset()),this.#l===null&&(this.#l=e.createBuffer(),e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#l),e.bufferData(e.PIXEL_PACK_BUFFER,this.metrics.byteLength,e.STREAM_COPY),e.bindBuffer(e.PIXEL_PACK_BUFFER,null))}}function C(n,e,t,i){const s=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,s);const r=[];for(let u=0;u<i;u++){const f=n.createTexture();n.bindTexture(n.TEXTURE_2D,f),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,e,t,0,n.RGBA,n.FLOAT,null),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+u,n.TEXTURE_2D,f,0),r.push(f)}n.drawBuffers(r.map((u,f)=>n.COLOR_ATTACHMENT0+f));const h=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE;n.bindFramebuffer(n.FRAMEBUFFER,null);const o={framebuffer:s,textures:r,width:e,height:t};if(!h)throw M(n,o),new Error("failed to allocate framebuffer");return o}function M(n,{framebuffer:e,textures:t}){n.deleteFramebuffer(e);for(const i of t)n.deleteTexture(i)}function A(n,e=0,t=n.length){const i=new DataView(n.buffer,n.byteOffset,n.byteLength),s=[];for(let r=e;r<t;){if(r+8>t)throw new Error("Incomplete MP4 box");const h=i.getUint32(r);if(h<8||r+h>t)throw new Error("Invalid MP4 box size");s.push({type:String.fromCharCode(...n.subarray(r+4,r+8)),start:r,body:r+8,end:r+h}),r+=h}return s}function Te(n,e){for(const t of A(n,e.body,e.end).filter(i=>i.type==="trak")){let i=t;for(const s of["mdia","minf","stbl","stsd"]){const r=A(n,i.body,i.end).find(h=>h.type===s);if(!r)break;i=r}if(i.type==="stsd")for(const s of A(n,i.body+8,i.end)){if(s.type!=="avc1")continue;const r=A(n,s.body+78,s.end).find(u=>u.type==="avcC");if(!r)throw new Error("AVC sample entry has no avcC");const h=n.slice(r.body,r.end);return{codec:"avc1."+Array.from(h.subarray(1,4)).map(u=>u.toString(16).padStart(2,"0")).join(""),description:h}}}return null}class ye{#t;#i=null;#e=null;#n=[];#c=0;#h=null;#s=[];#a=new Set;#f=!1;#r=!1;#R=!1;#x=!1;#v=!1;#E=new WeakMap;constructor(e){this.#t=e,e.addEventListener("seeking",this.#u),e.addEventListener("ratechange",this.#u)}get active(){return this.#x}append(e){if(this.#R)return;const t=new Uint8Array(e),i=new DataView(e);try{for(const r of A(t)){if(r.type==="moov"){this.#i=Te(t,r);const h=this.#i;h&&VideoDecoder.isConfigSupported(h).then(o=>{this.#E.set(h,o.supported===!0)}).catch(o=>this.#o(o))}if(!(r.type!=="moof"||this.#i===null))for(const h of A(t,r.body,r.end).filter(o=>o.type==="traf")){const o=A(t,h.body,h.end),u=o.find(l=>l.type==="tfhd");if(!u||i.getUint32(u.body+4)!==1)continue;const f=o.find(l=>l.type==="tfdt"),a=o.find(l=>l.type==="trun");if(!f||!a||i.getUint32(f.body)!==16777216||i.getUint32(a.body)!==16781057)throw new Error("Unexpected mpeg2toh264 video fragment layout");let m=Number(i.getBigUint64(f.body+4)),v=r.start+i.getInt32(a.body+8);const c=i.getUint32(a.body+4);if(a.body+12+c*16>a.end)throw new Error("Incomplete video samples");for(let l=0;l<c;l++){const d=a.body+12+l*16,E=i.getUint32(d),x=i.getUint32(d+4),z=i.getUint32(d+8),Ze=i.getInt32(d+12);if(v<0||v+x>t.length)throw new Error("Video sample outside fragment");this.#n.push({config:this.#i,decodeTime:m/9e4,timestamp:Math.round((m+Ze)*1e6/9e4),duration:Math.round(E*1e6/9e4),type:z&65536?"delta":"key",data:t.subarray(v,v+x)}),m+=E,v+=x}}}const s=this.#t.buffered;if(s.length>0){let r=0;for(let h=0;h<(this.#x?this.#c:this.#n.length);h++){const o=this.#n[h];o.type==="key"&&o.timestamp/1e6<=s.start(0)&&(r=h)}r>0&&(this.#n.splice(0,r),this.#c=Math.max(0,this.#c-r))}}catch(s){this.#o(s)}}take(){if(this.#R||this.#t.playbackRate<=1.25||this.#i===null||this.#E.get(this.#i)!==!0){this.#x&&this.#u();return}this.#x||(this.#u(),this.#x=!0);const e=this.#t.currentTime;try{for(;this.#c<this.#n.length&&(this.#h?.decodeQueueSize??0)<6&&this.#s.length<12;){const i=this.#n[this.#c];if(i.decodeTime>e+.25)break;if(this.#e!==i.config){if(this.#h){if(!this.#r){this.#r=!0;const r=this.#h;r.flush().then(()=>{this.#h===r&&(r.close(),this.#h=null,this.#e=null,this.#r=!1)}).catch(h=>{this.#h===r&&this.#o(h)})}break}const s=new VideoDecoder({output:r=>{this.#h!==s?r.close():this.#l(r)},error:r=>{this.#h===s&&this.#o(r)}});this.#h=s,this.#h.configure(i.config),this.#e=i.config}(i.duration??0)<1e3&&this.#a.add(i.timestamp),this.#h.decode(new EncodedVideoChunk(i)),this.#c++}if(this.#f&&this.#c===this.#n.length&&this.#h&&!this.#r){this.#r=!0;const i=this.#h;i.flush().catch(s=>{this.#h===i&&this.#o(s)})}}catch(i){this.#o(i);return}const t=this.#s[0];return!t||t.timestamp/1e6>e+.003*this.#t.playbackRate?this.#v?null:void 0:(this.#v=!0,this.#s.shift())}#l=e=>{this.#a.delete(e.timestamp)||e.timestamp/1e6<this.#t.currentTime-(this.#v?.1:.04)?e.close():this.#s.push(e)};#u=()=>{this.#h&&this.#h.state!=="closed"&&this.#h.close(),this.#h=null,this.#e=null;for(const e of this.#s)e.close();this.#s=[],this.#a.clear(),this.#r=!1,this.#x=!1,this.#v=!1,this.#c=0;for(let e=0;e<this.#n.length;e++){const t=this.#n[e];t.type==="key"&&t.timestamp/1e6<=this.#t.currentTime&&(this.#c=e)}};finish(){this.#f=!0}suspend(){this.#u()}reset(){this.#u(),this.#n=[],this.#c=0,this.#i=null,this.#f=!1,this.#R=!1}destroy(){this.reset(),this.#t.removeEventListener("seeking",this.#u),this.#t.removeEventListener("ratechange",this.#u)}#o(e){this.#u(),this.#R=!0,console.warn("mpeg2toh264: decoded video input unavailable",e)}}const L=16,Re=6,Fe=`#version 300 es
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
`;class _e{#t;#i;#e=null;#n=null;#c=[];#h=0;#s=[];#a=new Uint8Array(0);#f=[];#r=null;#R=0;constructor(e,t){this.#t=e,this.#i=t}take(){const e=this.#t,t=this.#c.pop()??this.#l();if(t===null)return null;const i=this.#i.videoWidth,s=this.#i.videoHeight;e.bindTexture(e.TEXTURE_2D,t);try{e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#i)}catch(o){throw this.#c.push(t),o}const r={id:++this.#R,texture:t,width:i,height:s,changed:null,fence:null,buffer:null,reported:!1},h=this.#r;return h===null||h.width!==i||h.height!==s?r.changed=!0:this.#x(r,h),this.#r=r,this.#f.push(r),r.id}settle(){const e=this.#t,t=this.#f.find(i=>!i.reported);if(t===void 0||t===this.#r)return null;if(t.changed===null){const{fence:i,buffer:s}=t;if(i===null||s===null)return null;const r=e.clientWaitSync(i,0,0);if(r!==e.ALREADY_SIGNALED&&r!==e.CONDITION_SATISFIED)return null;this.#a.byteLength<s.bytes&&(this.#a=new Uint8Array(s.bytes));const h=this.#a.subarray(0,s.bytes);e.bindBuffer(e.PIXEL_PACK_BUFFER,s.buffer),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,h),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),t.changed=Ae(h),this.#v(t)}return t.reported=!0,{id:t.id,changed:t.changed}}adopt(e,t){const i=this.#f.findIndex(r=>r.id===e),s=this.#f[i];if(s===void 0||!s.reported)throw new Error(`picture ${e} is not available to adopt`);return this.#f.splice(i,1),this.#c.push(t),s.texture}release(e){const t=this.#f.findIndex(s=>s.id===e),i=this.#f[t];i!==void 0&&(this.#f.splice(t,1),this.#E(i))}reset(){const e=this.#f;this.#f=[],this.#r=null;for(const t of e)this.#v(t),this.#E(t)}destroy(){const e=this.#t;this.reset();for(const t of this.#c)e.deleteTexture(t);this.#c=[],this.#h=0;for(const{buffer:t}of this.#s)e.deleteBuffer(t);this.#s=[],this.#d(),this.#e!==null&&e.deleteProgram(this.#e),this.#e=null}#x(e,t){const i=this.#t,s=Math.ceil(e.width/L),r=Math.ceil(e.height/L),h=this.#o(s,r),o=this.#m(s*r*4);this.#e??=this.#u(),i.bindFramebuffer(i.FRAMEBUFFER,h.framebuffer),i.useProgram(this.#e),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,t.texture),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e.texture),i.viewport(0,0,s,r),i.drawArrays(i.TRIANGLES,0,3),i.bindBuffer(i.PIXEL_PACK_BUFFER,o.buffer),i.readPixels(0,0,s,r,i.RGBA,i.UNSIGNED_BYTE,0),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),i.bindFramebuffer(i.FRAMEBUFFER,null),e.fence=i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE,0),e.buffer=o,i.flush()}#v(e){const t=this.#t;e.fence!==null&&t.deleteSync(e.fence),e.fence=null;const i=e.buffer;if(e.buffer=null,i===null)return;const s=this.#n;s!==null&&i.bytes===s.width*s.height*4?this.#s.push(i):t.deleteBuffer(i.buffer)}#E(e){this.#c.push(e.texture)}#l(){if(this.#h===Re)return null;const e=this.#t,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.#h++,t}#u(){const e=this.#t,t=S(e,Fe,D);return e.useProgram(t),e.uniform1i(e.getUniformLocation(t,"uTake"),0),e.uniform1i(e.getUniformLocation(t,"uReference"),1),t}#o(e,t){const i=this.#t,s=this.#n;if(s?.width===e&&s.height===t)return s;this.#d();for(const{buffer:u}of this.#s)i.deleteBuffer(u);this.#s=[];const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null);const h=i.createFramebuffer();i.bindFramebuffer(i.FRAMEBUFFER,h),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,r,0),i.bindFramebuffer(i.FRAMEBUFFER,null);const o={framebuffer:h,texture:r,width:e,height:t};return this.#n=o,o}#d(){const e=this.#t;this.#n!==null&&(e.deleteFramebuffer(this.#n.framebuffer),e.deleteTexture(this.#n.texture),this.#n=null)}#m(e){const t=this.#s.pop();if(t!==void 0)return t;const i=this.#t,s=i.createBuffer();return i.bindBuffer(i.PIXEL_PACK_BUFFER,s),i.bufferData(i.PIXEL_PACK_BUFFER,e,i.STREAM_COPY),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),{buffer:s,bytes:e}}}function Ae(n){for(let e=0;e<n.length;e+=4)if(n[e]!==0||n[e+1]!==0||n[e+2]!==0)return!0;return!1}const K=["mozParsedFrames","mozDecodedFrames","mozPresentedFrames","mozPaintedFrames"];function we(n){return K.every(e=>e in n)}function Se(n){return n.ownerDocument?.defaultView?.performance.timeOrigin??performance.timeOrigin}const Pe=250,N=500,De=1.75,ke=3,Ce=200;class Me{#t;#i;#e;#n;#c=null;#h=[];#s=0;#a=null;#f=0;#r=null;#R=null;#x=null;#v=null;#E=null;#l=null;#u=!0;#o=null;#d=null;#m=0;#_;#p;#T=null;#V=null;#P=null;#O=null;#Te=0;#H=[];#X=[];constructor(e,t,i){if(this.#t=e,this.#i=t,this.#n=i,this.#e=we(e)?e:null,this.#_=this.#e===null&&typeof VideoFrame<"u",this.#p=this.#_&&e.playbackRate>1,this.#e){for(const s of["emptied","seeking","seeked"])e.addEventListener(s,this.#G);for(const s of["pause","playing","waiting","ratechange"])e.addEventListener(s,this.#N)}if(this.#_)for(const s of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])e.addEventListener(s,this.#k)}get captureDriven(){return this.#p}request(e){if(this.#v===null){if(this.#v=e,this.#p){this.#L();return}this.#x=this.#e?requestAnimationFrame(this.#C):this.#t.requestVideoFrameCallback(this.#S)}}cancel(){this.#x!==null&&(this.#e?cancelAnimationFrame(this.#x):this.#t.cancelVideoFrameCallback(this.#x)),this.#x=null,this.#v=null,this.#T?.(),this.#T=null,this.#P!==null&&this.#t.cancelVideoFrameCallback(this.#P),this.#P=null,this.#q(),this.#O=null,this.#H=[],this.#p=this.#_&&this.#t.playbackRate>1,this.#G()}destroy(){this.cancel();for(const e of["emptied","seeking","seeked"])this.#t.removeEventListener(e,this.#G);for(const e of["pause","playing","waiting","ratechange"])this.#t.removeEventListener(e,this.#N);for(const e of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])this.#t.removeEventListener(e,this.#k)}flush(e){if(this.#p)for(this.#t.ownerDocument!==this.#V&&(this.#T?.(),this.#T=null,this.#L());this.#X.length>0&&this.#v!==null;){const t=this.#X.shift(),i=t.frame;try{this.#b(e,{width:i.visibleRect?.width??i.codedWidth,height:i.visibleRect?.height??i.codedHeight,mediaTime:i.timestamp/1e6,presentedFrames:t.count,expectedDisplayTime:Math.max(t.at,e),timeOrigin:performance.timeOrigin,frame:i})}finally{i.close()}}}#q(){for(const e of this.#X)e.frame.close();this.#X=[]}#k=e=>{const t=this.#_&&this.#t.playbackRate>1;if(t!==this.#p){const i=this.#v;this.cancel(),this.#p=t,i!==null&&this.request(i);return}["seeking","seeked","emptied","ratechange"].includes(e.type)&&(this.#O=null,this.#H=[]),this.#p&&((e.type==="pause"||e.type==="ended")&&this.flush(performance.now()),this.#q(),this.#T?.(),this.#T=null,this.#v!==null&&this.#L())};#L(){if(!this.#p||this.#T!==null||this.#v===null||(this.#t.paused||this.#t.ended)&&this.#O!==null)return;this.#P===null&&typeof this.#t.requestVideoFrameCallback=="function"&&(this.#P=this.#t.requestVideoFrameCallback(this.#ye));const e=Math.max(4,8/Math.max(1,this.#t.playbackRate)),t=this.#t.ownerDocument?.defaultView;if(this.#V=this.#t.ownerDocument,t){const i=t.setTimeout(this.#U,e);this.#T=()=>t.clearTimeout(i)}else{const i=setTimeout(this.#U,e);this.#T=()=>clearTimeout(i)}}#ye=()=>{this.#P=null,this.#T?.(),this.#T=null,this.#U()};#U=()=>{this.#T=null;const e=this.#t;if(this.#v===null)return;if(e.readyState<2||e.seeking){this.#L();return}let t,i=!1;try{const s=this.#i?.();if(s===null){this.#L();return}i=s!==void 0,t=s??new VideoFrame(e)}catch(s){if(!(s instanceof DOMException)||s.name!=="InvalidStateError")throw s;this.#L();return}if(t.timestamp===this.#O)t.close();else{let s=1;if(this.#O!==null){const h=t.timestamp-this.#O;if(h>1e3&&h<25e4&&(this.#H.push(h),this.#H.length>7&&this.#H.shift()),h>0&&this.#H.length>0){const o=[...this.#H].sort((f,a)=>f-a),u=o[Math.floor(o.length/2)];s=Math.max(1,Math.round(h/u))}}this.#O=t.timestamp,this.#Te+=s;const r=performance.now()+(i?(t.timestamp/1e6-e.currentTime)*1e3/e.playbackRate:0);for(this.#X.push({frame:t,at:r,count:this.#Te});this.#X.length>4;)this.#X.shift().frame.close()}this.#L()};#N=()=>{this.#o=null,this.#d=null,this.#m=0};#G=()=>{this.#E=null,this.#l=null,this.#u=!0,this.#z(),this.#N()};#z(){this.#c?.reset(),this.#h=[],this.#f=0}#S=(e,t)=>{this.#b(e,{width:t.width,height:t.height,mediaTime:t.mediaTime,presentedFrames:t.presentedFrames,expectedDisplayTime:t.expectedDisplayTime,timeOrigin:Se(this.#t)})};#b=(e,t)=>{const i=this.#v;this.#x=null,this.#v=null,i?.(e,t)};#C=e=>{const t=this.#e,i=K.map(u=>t[u]);this.#E?.some((u,f)=>i[f]<u)&&this.#G(),this.#E=i;const s=this.#n?.()??null;s!==this.#c&&(this.#G(),this.#c=s);const r=t.mozPaintedFrames,h=!t.seeking&&t.readyState>=2&&t.videoWidth>0&&t.videoHeight>0,o=this.#l===null&&(r>0||t.paused&&(t.mozPresentedFrames>0||t.mozDecodedFrames>0));if(s!==null){this.#M(e,t,s,h,o);return}if(h&&(o||this.#l!==null&&r!==this.#l)){this.#o!==null&&e-this.#o>N&&(this.#N(),this.#u=!0),this.#$(e,t),this.#o=e,this.#l=r;const u=this.#u;this.#u=!1,this.#b(e,{width:t.videoWidth,height:t.videoHeight,mediaTime:t.currentTime,presentedFrames:r,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#m,discontinuity:u}})}else this.#x=requestAnimationFrame(this.#C)};#$(e,t){if(t.paused||t.ended)return;const i=t.mozPaintedFrames,s=this.#d;if(s&&e-s.at>=Pe){const r=i-s.frames;if(r>0){const h=(e-s.at)/r;h>=4&&h<=200&&(this.#m=this.#m?this.#m+(h-this.#m)*.25:h)}this.#d=null}this.#d??={at:e,frames:i}}#M(e,t,i,s,r){const h=t.mozPaintedFrames,o=this.#l!==null&&h!==this.#l;this.#a!==null&&e-this.#a>N&&(this.#z(),this.#N(),this.#u=!0),this.#a=e,o&&this.#$(e,t);const u=t.paused||t.ended;(!u||o)&&(this.#f=0),u&&this.#r!==null&&(this.#r=e);const f=u&&this.#f>=ke;if(s&&(r||this.#l!==null)){this.#l=h;const c=f?null:i.take();c!==null&&this.#h.push({id:c,at:e,mediaTime:t.currentTime,width:t.videoWidth,height:t.videoHeight,resting:u})}let a=null;for(let c=i.settle();c!==null;c=i.settle()){const l=this.#h.shift();if(l?.id!==c.id)throw new Error("picture verdicts arrived out of order");let d=c.changed;if(d?this.#f=0:(this.#f=l.resting?this.#f+1:0,d=a===null&&!l.resting&&this.#r!==null&&(l.at-this.#r)*(t.playbackRate||1)>=Ce&&h!==this.#R),!d){i.release(l.id);continue}a!==null&&i.release(a.id),a=l}if(a===null){this.#x=requestAnimationFrame(this.#C);return}let m=1;if(this.#o!==null){const c=a.at-this.#o;c>N?(this.#N(),this.#u=!0):this.#m>0&&c>this.#m*De&&(m=Math.round(c/this.#m))}this.#s+=m,this.#o=a.at,this.#r=a.at,this.#R=h;const v=this.#u;this.#u=!1;try{this.#b(e,{width:a.width,height:a.height,mediaTime:a.mediaTime,presentedFrames:this.#s,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#m,discontinuity:v},picture:a.id})}finally{i.release(a.id)}}}let Le=null;const Y=.5,T=4,X=5,w=X+1,Q=1e3,j=4,B=200,Ue=.25,Be=1e3/60,Ie=`#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`,Oe=.75,Ne=.1,J=1,Xe=.02,Ge=.1,Z=1,ze=4,G=5,$e=4,He={2:0,3:.25,4:.5,5:.75},Ve=`#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`,We={requestAnimationFrame:n=>requestAnimationFrame(n),cancelAnimationFrame:n=>cancelAnimationFrame(n)};class qe extends EventTarget{encodedVideo;#t;#i;#e;#n;#c;#h=null;#s;#a=null;#f;#r;#R;#x;#v;#E=[];#l=[];#u=w-1;#o=null;#d=[];#m=null;#_=0;#p=null;#T=null;#V;#P=Be;#O=0;#Te=0;#H=0;#X=0;#q=null;#k(){this.#d.length=0,this.#q=null,this.#X=0}#L=null;#ye;#U;#N;#G=0;#z;#S;#b=0;#C=0;#$=0;#M=T-1;#A=0;#Re=0;#je=0;#Fe=!1;#w=!1;#se=0;#Oe=!1;#K=!1;#F=null;#he=[];#W=!1;#Je;#Ze;#D;#oe;#Q;#et;#g=null;#y;#_e=!1;#tt=0;#it=!1;#Wt=0;#Ae=!1;#Ne=!1;#ae=null;#qt=0;#we=new Map;#B={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0};#Se=0;#Xe=0;#Ge=0;#j=0;#le=0;#ue=0;#Pe=0;#ce=0;#fe;#ze=[];#de=[];#De=0;#me=0;#ke=0;#pe=0;#Ce=_;#ve=0;#I=_;#J=!1;#Ee=null;#gt="";#$e=[0,0,0,0,0,0];#st=0;#re=null;#rt=null;#nt=0;constructor(e,t={},i=null){super(),this.#e=e,this.#U=t.doubleRate??!1,this.#N=t.spatialCheck??!0,this.#z=t.debug??!1,this.#S=t.film??!1,this.#Je=t.onStats,this.#Ze=t.onFailure,this.#D=i,this.#Q=i?"main":t.rendering??"main",this.#et=t.workerUrl??Le,this.#y=this.#Q==="main"?"main":"idle",this.#i=i?i.canvas:document.createElement("canvas"),this.#t=i?.canvas??(this.#Q==="main"?this.#i:document.createElement("canvas")),this.#oe=e,i||(this.#i.style.cssText="position:absolute;pointer-events:none;visibility:hidden");const s=this.#t.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"});if(!(s instanceof WebGL2RenderingContext))throw new Error("this browser has no WebGL2");this.#s=s,this.#S&&(this.#Ft(),this.#a=new q(s)),this.#f=ee(s,ge);const r=this.#f;this.#r=Object.fromEntries(Object.entries(be).map(([h,o])=>[h,s.getUniformLocation(r,o)])),this.#R=ee(s,Ve),this.#x=s.getUniformLocation(this.#R,"uField"),this.#v=s.getUniformLocation(this.#R,"uFlip"),this.#fe=s.getExtension("EXT_disjoint_timer_query_webgl2"),this.#t.addEventListener("webglcontextlost",this.#Vt),this.#ye=i?null:new ResizeObserver(()=>this.#Be()),this.#V=i?null:new MutationObserver(()=>{this.#i.ownerDocument!==this.#T&&this.#Be()}),this.encodedVideo=!i&&typeof VideoDecoder<"u"?new ye(e):null,this.#c=i?null:new _e(s,e),this.#n=new Me(e,()=>this.encodedVideo?.take(),()=>this.#y==="main"?this.#c:null),e.addEventListener("emptied",this.#zt),e.addEventListener("resize",this.#Gt),e.addEventListener("pause",this.#ie),e.addEventListener("ended",this.#ie),e.addEventListener("seeking",this.#Ht),e.addEventListener("seeked",this.#ie),e.addEventListener("ratechange",this.#ie)}get running(){return this.#w&&(this.#F?.interlaced??!0)}get canvas(){return this.#i}get#Tt(){return this.#F?.topFieldFirst!==!1}#yt(){return{doubleRate:this.#U,spatialCheck:this.#N,film:this.#S,debug:this.#z}}get enabled(){return this.#Oe}set enabled(e){this.#Oe=e,this.#ht(),this.#g?.postMessage({type:"enabled",enabled:e})}set scan(e){const t=this.#F?.interlaced!==e?.interlaced,i=t||this.#F?.topFieldFirst!==e?.topFieldFirst;this.#F=e,!(i&&(!this.#be()||this.#F!==e))&&(this.#g?.postMessage({type:"scan",scan:e}),i&&(this.#A=0,this.#k(),this.#Y(),t&&(this.#b=0),this.#o=null,this.#te(!1)),this.#ht(),i&&((e?.interlaced??!0)&&(this.#D||this.#y==="main")?this.#Ue():this.#dt()))}get scan(){return this.#F}set videoTimeline(e){this.#he=e,this.#g?.postMessage({type:"timeline",videoTimeline:e}),e.length===0&&(this.#F=null),this.#ht()}get videoTimeline(){return this.#he}get container(){return this.#L??this.#e}get doubleRate(){return this.#U}set doubleRate(e){e!==this.#U&&(this.#U=e,this.#xe(),this.#k(),this.#Rt())}get spatialCheck(){return this.#N}set spatialCheck(e){e!==this.#N&&(this.#N=e,this.#xe())}get film(){return this.#S}set film(e){const t=this.#g?this.#rt:this.#re;if(!(e===this.#S&&(e===!1||t===null))){if(this.#g){this.#S=e,this.#xe(e?"film":void 0);return}if(e){if(!this.#be())return;try{this.#_t()}catch(i){this.#S=!0,this.#xe(),this.#at(`film detector unavailable: ${i instanceof Error?i.message:String(i)}`);return}}if(this.#S=e,this.#xe(),!e){if(!this.#be())return;this.#J=!1,this.#I=_,this.#Y(),this.#a?.destroy(),this.#a=null}this.#Rt()}}get debug(){return this.#z}set debug(e){e!==this.#z&&(this.#z=e,this.#xe())}get#Kt(){return this.#U||this.#S}#Rt(){this.#K||(this.#Kt?(this.#C>0&&this.#Xt(),(this.#F?.interlaced??!0)&&(this.#D||this.#y==="main")&&this.#Ue()):this.#S||(this.#o=null,this.#te(!1),this.#Ie()))}#xe(e){this.#g?.postMessage({type:"settings",options:this.#yt(),retryFilm:e})}#Ft(){if(this.#s.getExtension("EXT_color_buffer_float")===null)throw new Error("film needs EXT_color_buffer_float")}#_t(){this.#Ft(),this.#a??=new q(this.#s),this.#C>0&&this.#a.resize(this.#C,this.#$)}#ht(){this.#Oe&&(this.#he.length>0||(this.#F?.interlaced??!0))?this.start():this.stop()}#Yt(){return this.#D||this.#Q==="main"?!1:this.#y==="starting"||this.#y==="active"?!0:typeof Worker<"u"&&typeof VideoFrame<"u"&&typeof OffscreenCanvas<"u"&&this.#et!==null&&"transferControlToOffscreen"in HTMLCanvasElement.prototype?(this.#At(),!0):this.#Q==="auto"?(this.#He(),!1):(this.#y="failed",this.#w=!1,!0)}#At(){this.#Z(),this.#g?.terminate(),this.#g=null,this.#Ae=!1,this.#Ne=!1,this.#rt=null,this.#nt=0;let e=this.#i;if(this.#it){e=document.createElement("canvas"),e.className=this.#i.className;const r=this.#i.getAttribute("style");r===null?e.removeAttribute("style"):e.setAttribute("style",r),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e}const t=++this.#tt;this.#y="starting";let i,s;try{s=e.transferControlToOffscreen(),this.#it=!0,i=new Worker(this.#et,{type:"module"})}catch(r){this.#Me(r instanceof Error?r.message:String(r));return}this.#g=i,i.onmessage=r=>{t===this.#tt&&this.#Qt(r.data)},i.onerror=r=>{t===this.#tt&&(r.preventDefault(),this.#Me(r.message||"the deinterlacer worker failed"))},i.postMessage({type:"initialize",canvas:s,options:this.#yt(),scan:this.#F,videoTimeline:this.#he,enabled:this.#w,video:this.#lt()},[s])}#Qt(e){switch(e.type){case"ready":this.#y="active",this.#w&&(this.#Le(),this.#Qe());break;case"failed":this.#Me(e.message);break;case"consumed":{this.#Ae=!1,this.#Ne=!0;const t=this.#ae;this.#ae=null,t&&this.#St(t);break}case"visibility":this.#i.style.visibility=e.visible?"visible":"hidden";break;case"stats":{const t={...e.stats,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0},i=t.filmError??null,s=this.#nt;if(this.#rt=i,this.#nt=e.filmFailure,i!==null&&e.filmFailure!==s){this.dispatchEvent(new CustomEvent("failure",{detail:i}));try{this.#Ze?.(i)}catch{}}this.dispatchEvent(new CustomEvent("stats",{detail:t})),this.#Je?.(t);break}case"capture":{const t=this.#we.get(e.id);if(this.#we.delete(e.id),!t){e.image?.close();break}e.image?t.resolve(e.image):createImageBitmap(this.#e).then(t.resolve,t.reject);break}}}#ot(e){if(this.dispatchEvent(new CustomEvent("failure",{detail:e})),!this.#D)try{this.#Ze?.(e)}catch{}}#at(e){this.#re!==e&&(this.#re=e,this.#J=!1,this.#I=_,this.#Y(),this.#a?.destroy(),this.#a=null,this.#ot(e))}#be(){return this.#K?!1:(this.#g||(this.#re=null),!0)}#Me(e){if(this.#y==="starting"&&this.#Q==="auto"&&!this.#_e){this.#He();return}if(this.#wt(e),!this.#_e){this.#_e=!0,this.#At();return}console.error(`Deinterlacer Worker stopped: ${e}`),this.#y="failed",this.#g?.terminate(),this.#g=null,this.#Z(),this.#ot(`deinterlacer worker stopped: ${e}`),this.stop()}#He(){const e=this.#t;e.className=this.#i.className;const t=this.#i.getAttribute("style");t===null?e.removeAttribute("style"):e.setAttribute("style",t),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e,this.#it=!1,this.#g?.terminate(),this.#g=null,this.#y="main",this.#Z(),this.#w&&(this.#Le(),this.#Qe(),(this.#F?.interlaced??!0)&&this.#Ue())}#Z(){this.#ae?.frame.close(),this.#ae=null}#wt(e){for(const t of this.#we.values())t.reject(new Error(e));this.#we.clear()}start(){if(!(this.#w||this.#K||this.#W)&&(this.#se++,this.#w=!0,this.#$t(),!!this.#be())){if(this.#fi(),this.#Qe(),this.#Yt()){this.#g?.postMessage({type:"enabled",enabled:!0}),this.#y==="active"&&this.#Le();return}this.#Le(),(this.#F?.interlaced??!0)&&this.#Ue()}}stop(){this.#se++,this.#w&&(this.#w=!1,this.#n.cancel(),this.encodedVideo?.suspend(),this.#Mt(),this.#dt(),this.#A=0,this.#o=null,this.#te(!1),this.#Z(),this.#g?.postMessage({type:"enabled",enabled:!1}))}destroy(){if(!this.#K){this.#K=!0,this.#Oe=!1,this.stop(),this.#g?.postMessage({type:"destroy"}),this.#g?.terminate(),this.#g=null,this.#Z(),this.#wt("the deinterlacer was destroyed"),this.#T?.removeEventListener("visibilitychange",this.#vt),this.#T=null,this.#V?.disconnect(),this.#t.removeEventListener("webglcontextlost",this.#Vt),this.#n.destroy(),this.#c?.destroy(),this.encodedVideo?.destroy(),this.#e.removeEventListener("emptied",this.#zt),this.#e.removeEventListener("resize",this.#Gt),this.#e.removeEventListener("pause",this.#ie),this.#e.removeEventListener("ended",this.#ie),this.#e.removeEventListener("seeking",this.#Ht),this.#e.removeEventListener("seeked",this.#ie),this.#e.removeEventListener("ratechange",this.#ie),this.#di();for(const e of this.#E)this.#s.deleteTexture(e);this.#E=[],this.#Ie();for(const e of[...this.#ze,...this.#de.map(({q:t})=>t)])this.#s.deleteQuery(e);this.#ze.length=0,this.#de.length=0,this.#a?.destroy(),this.#a=null,this.#Ee!==null&&(oe(this.#Ee),this.#Ee=null),this.#s.deleteProgram(this.#f),this.#s.deleteProgram(this.#R),this.#s.getExtension("WEBGL_lose_context")?.loseContext()}}capture(){if(this.#y==="active"&&this.#i.style.visibility==="visible"&&this.#g){const s=++this.#qt,r=new Promise((h,o)=>{this.#we.set(s,{resolve:h,reject:o})});return this.#g.postMessage({type:"capture",id:s,width:this.#e.videoWidth,height:this.#e.videoHeight}),r}if(this.#y==="starting"||this.#y==="failed")return createImageBitmap(this.#e);const e=this.#o;if(this.#D&&(!this.#w||this.#W||!e))return Promise.reject(new Error("no rendered picture is available"));if(!this.#w||this.#W||!e)return createImageBitmap(this.#e);e.kind==="texture"?this.#xt(e.texture,e.flip,!1):this.#ne(e.flush,e.second,null,!1);const t=this.#e.videoWidth,i=this.#e.videoHeight;return t>0&&i>0&&(t!==this.#t.width||i!==this.#t.height)?createImageBitmap(this.#t,{resizeWidth:t,resizeHeight:i,resizeQuality:"high"}):createImageBitmap(this.#t)}addEventListener(e,t,i){super.addEventListener(e,t,i)}removeEventListener(e,t,i){super.removeEventListener(e,t,i)}#Le(){this.#D||!this.#w||this.#n.request(this.#si)}#lt(){const e=[];for(let t=0;t<this.#e.buffered.length;t++)e.push({start:this.#e.buffered.start(t),end:this.#e.buffered.end(t)});return{currentTime:this.#e.currentTime,playbackRate:this.#e.playbackRate,seeking:this.#e.seeking,paused:this.#e.paused,ended:this.#e.ended,readyState:this.#e.readyState,videoWidth:this.#e.videoWidth,videoHeight:this.#e.videoHeight,buffered:e}}#jt(e,t,i){let s;try{s=i?.clone()??new VideoFrame(this.#e,{timestamp:Math.max(0,Math.round(t.mediaTime*1e6))})}catch(h){const o=h instanceof Error?h.message:String(h);this.#Q==="auto"&&!this.#Ne&&!this.#_e?(this.#He(),this.#We(e,t)):this.#Me(o);return}const r={id:++this.#Wt,frame:s,now:e,metadata:t,video:this.#lt()};if(this.#Ae){this.#ae?.frame.close(),this.#ae=r;return}this.#St(r)}#St(e){const t=this.#g;if(!t||this.#y!=="active"){e.frame.close();return}this.#Ae=!0;const i={type:"frame",id:e.id,frame:e.frame,metadata:e.metadata,video:e.video};try{t.postMessage(i,[e.frame])}catch(s){this.#Ae=!1,e.frame.close();const r=s instanceof Error?s.message:String(s);this.#Q==="auto"&&!this.#Ne&&!this.#_e?(this.#He(),this.#We(e.now,e.metadata)):this.#Me(r)}}#Jt(e,t,i){this.#Ee==null&&(this.#Ee=ne(this.#s,"20px monospace")),ae(this.#Ee,e,t,i,this.#C,this.#$,20)}#Pt(e){if(this.#fe==null||this.#de.length>30)return;const t=this.#ze.pop()??this.#s.createQuery();return this.#s.beginQuery(this.#fe.TIME_ELAPSED_EXT,t),this.#de.push({q:t,isField:e}),t}#Ve(e){this.#fe!=null&&(e!=null&&this.#s.endQuery(this.#fe.TIME_ELAPSED_EXT),this.#de=this.#de.filter(({q:t,isField:i})=>{if(this.#s.getQueryParameter(t,this.#s.QUERY_RESULT_AVAILABLE)){const s=this.#s.getQueryParameter(t,this.#s.QUERY_RESULT);return i?(this.#ke+=s,this.#pe++):(this.#De+=s,this.#me++),this.#ze.push(t),!1}return!0}))}#Y(){this.#I=_,this.#Ce=_,this.#ve=0,this.#J=!1,this.#a?.reset()}#Zt(){const{prev:e,cur:t,next:i}=this.#Ot(!1),s=this.#E[e],r=this.#E[t],h=this.#E[i];if(!s||!r||!h)return;const o=this.#F?.topFieldFirst!==!1?0:1;this.#a?.detect(r,h,o),this.#a?.measureComb(s,r,o)}#ei(){const e=this.#a?.poll()??null;e!==null&&(this.#Ce=e,this.#ve=e.age),this.#ve++;const{phase:t,run:i}=this.#Ce;t===0||this.#ve>Math.ceil(G*Math.max(1,this.#e.playbackRate))?this.#I=_:this.#I={phase:(t-1+this.#ve)%G+1,run:i}}#ti(e){const t=[],i=this.#a?.metrics??new Float32Array(0);for(let r=0;r<p.phase;r++){const h=i[r*4]??0,o=i[r*4+1]??0,u=i[r*4+2]??0;t.push(`${h.toFixed(3)},${o.toString().padStart(4)},${u.toFixed(3)}`)}const s=this.#$e.map((r,h)=>`${h===0?"-":h}:${r}`).join(" ");return`frame=${e} phase=${this.#I.phase} run=${this.#I.run} known=${this.#Ce.phase}/${this.#Ce.run} age=${this.#ve} ${this.#J?"film":"video"} period=${this.#b.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#st}`}#ut(e,t){const i=t-performance.timeOrigin;return Number.isFinite(i)&&i!==0?e+i:e}#ii(e,t){const i=e.expectedDisplayTime;if(!Number.isFinite(i)||i<=0||!Number.isFinite(e.timeOrigin))return t;const s=this.#ut(i,e.timeOrigin),r=ze*Math.max(this.#P,this.#b);return s<t-r||s>t+r?t:s}#si=(e,t)=>{if(!this.#w||this.#W)return;this.#pt();const i=this.#ut(e,t.timeOrigin),{frame:s,picture:r,...h}=t;this.#oe=s??this.#e,this.#h=r??null;try{this.#ri(i,h,s)}finally{this.#oe=this.#e,this.#h=null}this.#Le()};#ri(e,t,i){if(this.#y==="active"){this.#jt(e,t,i);return}this.#y!=="starting"&&this.#We(e,t)}ingestExternalFrame(e,t,i){this.#oe=i;try{this.#We(e,t)}finally{this.#oe=this.#e}}#We(e,t){const i=this.#se;if(this.#ee(i)&&(this.#ni(t.mediaTime),!!this.#ee(i)&&t.width>0&&t.height>0)){let s=!1;if(!this.#Fe&&this.#e.seeking){const l=this.#e.buffered,d=this.#b>=j?this.#b/1e3:B/1e3;for(let E=0;E<l.length;E++)if(t.mediaTime>=l.start(E)&&t.mediaTime<l.end(E)&&Math.abs(t.mediaTime-this.#e.currentTime)<=d){s=!0;break}}if(s&&(this.#Fe=!0),(this.#C===0||this.#$===0)&&this.#Nt(t.width,t.height),!this.#ee(i))return;if(this.#F&&!this.#F.interlaced){const l=performance.now();this.#Ut(l),this.#Xe=l,this.#ui(),this.#le+=performance.now()-l,this.#j++,this.#ue++,this.#Bt(l);return}const r=t.mediaTime-this.#Re,h=t.mozTiming,o=s||(h?h.discontinuity||r<0||r>Y:r<0||r>Y);o&&(this.#A=0,this.#b=0,this.#B.discontinuities++,this.#k(),this.#Y());const u=this.#ci(t.presentedFrames,o);if(this.#A>0&&t.mediaTime===this.#Re&&(!h||t.presentedFrames===this.#je))return;if(!o){const l=h?.periodMs??0;l>0?this.#Dt(l*(this.#e.playbackRate||1)/1e3,1):this.#A>0&&r>0&&this.#Dt(r,u+1)}this.#Re=t.mediaTime,this.#je=t.presentedFrames;const f=performance.now();this.#Ut(f),this.#Xe=f;const a=performance.now(),m=this.#Pt(!1);if(this.#It(),this.#S&&!this.#re&&!this.#a)try{this.#_t()}catch(l){this.#at(`film detector unavailable: ${l instanceof Error?l.message:String(l)}`)}if(!this.#ee(i)){this.#K||this.#Ve(m);return}if(this.#S&&!this.#re){if(this.#A===T&&u===0)try{this.#ei(),this.#Zt()}catch(l){this.#at(`film detection failed: ${l instanceof Error?l.message:String(l)}`)}else this.#Y();this.#$e[this.#I.phase]=(this.#$e[this.#I.phase]??0)+1,this.#J=this.#I.phase!==0&&this.#I.run>=O,this.#z&&(this.#gt=this.#ti(t.presentedFrames))}if(!this.#ee(i)){this.#K||this.#Ve(m);return}const c=this.#ii(t,e)+this.#P;if(this.#J)if(this.#qe()){const l=this.#I.phase;if(l===I)this.#st++,this.#X++;else{const d=this.#b*G/$e,E=this.#ft(1,e,d),x=He[l]??0,z=E||this.#q===null?c+d:c+x*this.#b;this.#Ke("film",!1,this.#ct("film",z,d),d)}}else this.#ne(!1,!1,null);else if(this.#U&&this.#qe()){const l=this.#b/2,E=this.#ft(2,e,l)||this.#q===null?c+l*2:c,x=this.#ct("field",E,l);this.#Ke("field",!1,x,l),this.#Ke("field",!0,x+l,l)}else if(this.#qe()){const l=this.#b,E=this.#ft(1,e,l)||this.#q===null?c+l:c;this.#Ke("frame",!1,this.#ct("frame",E,l),l)||(this.#B.late++,this.#ne(!1,!1,null))}else this.#B.late+=this.#d.length,this.#k(),this.#ne(!1,!1,null);this.#ce=Math.max(this.#ce,this.#d.length),this.#Ve(m),this.#le+=performance.now()-a,this.#j++,this.#Bt(f)}}#ee(e){return!this.#K&&this.#w&&e===this.#se}#ni(e){const t=this.#se;let i;for(let h=this.#he.length-1;h>=0;h--){const o=this.#he[h];if(o.start<=e+1e-6){i=o;break}}if(i?.codedSize&&(i.codedSize.width!==this.#C||i.codedSize.height!==this.#$)&&this.#Nt(i.codedSize.width,i.codedSize.height),!this.#ee(t))return;const s=i?.scan;if(!s||this.#F?.interlaced===s.interlaced&&this.#F.topFieldFirst===s.topFieldFirst)return;const r=this.#F?.interlaced;this.#F=s,this.#A=0,this.#k(),this.#be()&&(r!==s.interlaced&&(this.#b=0),s.interlaced&&(this.#D||this.#y==="main")?this.#Ue():this.#dt(),this.#Y())}#qe(){return(this.#U||this.#S)&&this.#b>0&&this.#l.length===w}#Dt(e,t){const s=e*1e3/(this.#e.playbackRate||1)/t;s<j||s>B||(this.#b=this.#b>0&&s>this.#b*Oe?this.#b+(s-this.#b)*Ue:s)}#Ke(e,t,i,s){const r=this.#kt();if(r===null)return!1;const h=this.#l[r];if(!h)return!1;for(this.#u=r;this.#d.length>0&&this.#d[0]?.slot===r;)this.#d.shift(),this.#B.late++;this.#ne(!1,t,h.framebuffer);const o={slot:r,at:i,duration:s,cadence:e,phase:e==="film"?this.#I.phase:e==="field"?t?2:1:0,droppedBefore:this.#X};return this.#X=0,this.#d.push(o),this.#q=o,!0}#ct(e,t,i){if(!(i>0))return t;const s=this.#q;if(s!==null&&s.cadence===e){const r=s.at+s.duration,h=t-r;if(Math.abs(h)<i){const o=Math.max(-J,Math.min(J,h*Ne));return r+o}}s!==null&&this.#B.resynced++;for(let r=this.#d.at(-1);r&&r.at>=t;)this.#d.pop(),this.#B.late++,r=this.#d.at(-1);return t}#ft(e,t,i){const s=this.#d.at(-1),r=(X+1)*Math.max(this.#P,i);if(s&&s.at-t>r)return this.#k(),this.#B.queueResetted++,!0;const h=Math.max(0,this.#d.length+e-X);let o=0,u=0;for(;u<h;){const f=this.#d.shift();if(!f)break;o+=f.duration,u++}for(const f of this.#d)f.at-=o;return this.#B.late+=u,!1}#kt(){const e=this.#o?.kind==="texture"?this.#o.texture:null,t=new Set(this.#d.map(({slot:s})=>s));for(let s=1;s<=w;s++){const r=(this.#u+s)%w,h=this.#l[r];if(h&&h.texture!==e&&!t.has(r))return r}const i=this.#d[0];if(i){const s=this.#l[i.slot];if(s&&s.texture!==e)return i.slot}return null}#Ue(){this.#m===null&&(!this.#w||this.#W||(this.#_=0,this.#m=this.#ge(this.#mt)))}#dt(){this.#Ye(this.#m),this.#m=null,this.#k()}#mt=e=>{if(this.#m=null,!this.#w||this.#W)return;this.#hi(e);const t=this.#se;this.#n.flush(e),this.#ee(t)&&(this.#y==="main"&&this.#ai(this.#O,e),this.#m=this.#ge(this.#mt))};#hi(e){const t=e-this.#_;this.#_=e;const i=Math.max(1,Math.round(t/this.#P)),s=this.#O+i*this.#P,r=e-s;if(this.#O===0||t<=0||t>B||Math.abs(r)>this.#P/4){t>=1&&t<=B&&(this.#P=t),this.#O=e;return}this.#P+=r/i*Xe,this.#O=s+r*Ge}#Ct(){const e=this.#D;if(e)return{frames:e,origin:performance.timeOrigin};const t=this.#i.ownerDocument?.defaultView??this.#e.ownerDocument?.defaultView??null;return t===null?{frames:We,origin:performance.timeOrigin}:{frames:t,origin:t.performance.timeOrigin}}#ge(e){const{frames:t,origin:i}=this.#Ct(),s=t.requestAnimationFrame(r=>e(this.#ut(r,i)));return{frames:t,handle:s}}#Ye(e){e?.frames.cancelAnimationFrame(e.handle)}#pt(){if(this.#D)return;this.#oi();const{frames:e}=this.#Ct(),t=this.#m!==null&&this.#m.frames!==e,i=this.#p!==null&&this.#p.frames!==e;!t&&!i||(this.#_=0,t&&(this.#Ye(this.#m),this.#m=this.#ge(this.#mt)),i&&(this.#Ye(this.#p),this.#p=this.#ge(this.#Et)))}#oi(){const e=this.#D?null:this.#i.ownerDocument??null;e!==this.#T&&(this.#T?.removeEventListener("visibilitychange",this.#vt),this.#T=e,e?.addEventListener("visibilitychange",this.#vt),this.#V?.disconnect(),e&&this.#V?.observe(e,{childList:!0,subtree:!0}))}#vt=()=>{this.#K||this.#pt()};#Qe(){this.#D||this.#p!==null||!this.#n.captureDriven||!this.#w||this.#W||(this.#p=this.#ge(this.#Et))}#Mt(){this.#Ye(this.#p),this.#p=null}#Et=e=>{if(this.#p=null,!this.#w||this.#W)return;const t=this.#se;this.#n.flush(e),this.#ee(t)&&this.#n.captureDriven&&(this.#p=this.#ge(this.#Et))};#ai(e,t){const i=this.#P/2,s=u=>{const f=u.at-e;return f<=i-Z?!0:f>i+Z?!1:this.#Te>0};for(;this.#d[1]&&s(this.#d[1]);)this.#B.late++,this.#d.shift();const r=this.#d[0];if(!r||!s(r))return;this.#d.shift(),this.#Te=r.at-e;const h=performance.now(),o=this.#Pt(!0);this.#Lt(r.slot),this.#Ve(o),this.#Pe+=performance.now()-h,this.#ue++,this.#z&&this.#li(r,t),this.#H=t}#li(e,t){const i=this.#H===0?0:t-this.#H,s=i/this.#P,r=e.cadence==="film"?`phase ${e.phase}`:e.cadence==="field"?`field ${e.phase}`:"frame",h=e.phase===0?"duplicate":`phase ${I}`,o=e.droppedBefore>0?`, ${h} dropped before it`+(e.droppedBefore>1?` (${e.droppedBefore})`:""):"";console.log(`yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at-t).toFixed(2)} ms${o}`)}#Lt(e){const t=this.#l[e];t&&this.#xt(t.texture)}#ui(){this.#It();const e=this.#E[this.#M];e&&this.#xt(e,!0),this.#A=0}#te(e){if(this.#D){this.#D.onVisibility(e);return}this.#i.style.visibility=e?"visible":"hidden"}#xt(e,t=!1,i=!0){const s=this.#s;s.bindFramebuffer(s.FRAMEBUFFER,null),s.useProgram(this.#R),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this.#x,0),s.uniform1i(this.#v,t?1:0),s.viewport(0,0,this.#C,this.#$),s.drawArrays(s.TRIANGLES,0,3),this.#o={kind:"texture",texture:e,flip:t},this.#te(!0),i&&this.#G++}#ci(e,t){let i=0;return this.#Se!==0&&!t&&(i=Math.max(0,e-this.#Se-1),this.#B.missed+=i),this.#Se=e,i}#Ut(e){e-this.#Xe<=Q||(this.#Ge=e,this.#j=0,this.#le=0,this.#ue=0,this.#Pe=0,this.#ce=0,this.#G=0,this.#De=0,this.#me=0,this.#ke=0,this.#pe=0)}#Bt(e){const t=e-this.#Ge;if(t<Q)return;const i=this.#qe()&&(this.#U||this.#J)?this.#ue:this.#j,s=this.#j?(this.#le+this.#Pe)/this.#j:0;let r;this.#fe!=null&&(r=0,this.#me!==0&&(r+=this.#De/1e6/this.#me),this.#pe!==0&&(r+=this.#ke/1e6/this.#pe/2));const h={...this.#B,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0,fps:i*1e3/t,frameMs:s,maxQueuedFields:this.#ce,outputFps:this.#G*1e3/t,gpuMs:r,film:this.#J,filmError:this.#re};this.dispatchEvent(new CustomEvent("stats",{detail:h})),this.#Je?.(h),this.#Ge=e,this.#j=0,this.#le=0,this.#ue=0,this.#Pe=0,this.#ce=0,this.#G=0,this.#De=0,this.#me=0,this.#ke=0,this.#pe=0}#It(){const e=this.#s;this.#M=(this.#M+1)%T;const t=this.#h,i=this.#E[this.#M];t!==null&&this.#c!==null&&i!==void 0?(this.#E[this.#M]=this.#c.adopt(t,i),this.#h=null):(e.bindTexture(e.TEXTURE_2D,i??null),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#oe)),this.#A=Math.min(this.#A+1,T)}#ne(e,t,i,s=!0){if(this.#A===0||this.#W)return;s&&(this.#A===T&&!e?this.#B.filtered++:this.#B.degraded++);const r=this.#s,{prev:h,cur:o,next:u}=this.#Ot(e);r.bindFramebuffer(r.FRAMEBUFFER,i),r.useProgram(this.#f);for(const[c,l]of[h,o,u].entries())r.activeTexture(r.TEXTURE0+c),r.bindTexture(r.TEXTURE_2D,this.#E[l]??null);r.uniform1i(this.#r.prev,0),r.uniform1i(this.#r.cur,1),r.uniform1i(this.#r.next,2);const f=this.#S?this.#a?.texture??null:null,a=this.#S?this.#a?.combTexture??null:null,m=f!==null&&a!==null;f!==null&&a!==null&&(r.activeTexture(r.TEXTURE0+3),r.bindTexture(r.TEXTURE_2D,f),r.uniform1i(this.#r.fieldMetrics,3),r.activeTexture(r.TEXTURE0+4),r.bindTexture(r.TEXTURE_2D,a),r.uniform1i(this.#r.comb,4)),r.uniform2i(this.#r.size,this.#C,this.#$);const v=this.#Tt?0:1;r.uniform1i(this.#r.parity,t?1-v:v),r.uniform1i(this.#r.tff,this.#Tt?1:0),r.uniform1i(this.#r.second,t?1:0),r.uniform1i(this.#r.spatialCheck,this.#N?1:0),r.uniform1i(this.#r.debug,this.#z?1:0),r.uniform1i(this.#r.film,m?1:0),r.uniform1i(this.#r.phase,this.#I.phase),r.viewport(0,0,this.#C,this.#$),r.drawArrays(r.TRIANGLES,0,3),this.#z&&m&&this.#Jt(this.#gt,0,90),i===null&&(this.#o={kind:"yadif",flush:e,second:t},this.#te(!0),s&&this.#G++)}#Ot(e){const t=i=>(this.#M+T-i)%T;return this.#A===1?{prev:this.#M,cur:this.#M,next:this.#M}:e?{prev:t(1),cur:this.#M,next:this.#M}:this.#A===2?{prev:t(1),cur:t(1),next:this.#M}:{prev:t(2),cur:t(1),next:this.#M}}#Be(){if(this.#pt(),!this.#L)return;const e=this.#e,t=e.videoWidth,i=e.videoHeight;if(t===0||i===0)return;const s=Math.min(e.offsetWidth/t,e.offsetHeight/i),r=t*s,h=i*s;this.#i.style.left=`${e.offsetLeft+(e.offsetWidth-r)/2}px`,this.#i.style.top=`${e.offsetTop+(e.offsetHeight-h)/2}px`,this.#i.style.width=`${r}px`,this.#i.style.height=`${h}px`}#Nt(e,t){const i=this.#s;this.#t.width=e,this.#t.height=t,this.#C=e,this.#$=t,this.#A=0,this.#o=null,this.#k(),this.#Be();for(const s of this.#E)i.deleteTexture(s);this.#E=[];for(let s=0;s<T;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null),this.#E.push(r)}this.#Ie(),(this.#U||this.#S)&&this.#Xt(),this.#a?.resize(e,t),this.#be()}#Xt(){const e=this.#s;if(!(this.#l.length===w||this.#C===0)){this.#Ie();for(let t=0;t<w;t++){const i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,this.#C,this.#$,0,e.RGBA,e.UNSIGNED_BYTE,null);const s=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0);const r=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!r){e.deleteFramebuffer(s),e.deleteTexture(i),this.#Ie();return}this.#l.push({texture:i,framebuffer:s})}this.#u=w-1}}#Ie(){const e=this.#s,t=this.#o?.kind==="texture"?this.#o.texture:null;this.#l.some(i=>i.texture===t)&&(this.#o=null);for(const{texture:i,framebuffer:s}of this.#l)e.deleteFramebuffer(s),e.deleteTexture(i);this.#l=[],this.#k()}#fi(){if(this.#L)return;const e=this.#e.parentElement;if(!e)return;const t=document.createElement("div");t.style.cssText="position:relative;display:inline-block;line-height:0;max-width:100%",e.insertBefore(t,this.#e),t.appendChild(this.#e),t.appendChild(this.#i),this.#L=t,this.#ye?.observe(this.#e),this.#Be()}#di(){if(this.#D)return;const e=this.#L;this.#L=null,this.#ye?.disconnect(),this.#i.remove(),e?.parentElement&&(e.parentElement.insertBefore(this.#e,e),e.remove())}#Gt=()=>this.#Be();#bt(e){return!this.#g||this.#y==="main"?!1:(this.#g.postMessage({type:"event",name:e,video:this.#lt()}),!0)}#zt=()=>{if(this.#bt("emptied")){this.#Z(),this.#te(!1);return}this.#A=0,this.#Re=0,this.#je=0,this.#k(),this.#Y(),this.#b=0,this.#$t(),this.#o=null,this.#te(!1)};#$t(){this.#B={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0},this.#$e.fill(0),this.#st=0,this.#Se=0,this.#Ge=0,this.#Xe=0,this.#j=0,this.#le=0,this.#ue=0,this.#Pe=0,this.#ce=0,this.#G=0,this.#k(),this.#De=0,this.#me=0,this.#ke=0,this.#pe=0}#Ht=()=>{if(this.#bt("seeking")){this.#Z();return}this.#Fe=!1};#ie=e=>{if(e.type==="ratechange"&&(this.#n.captureDriven?this.#Qe():this.#Mt()),(e.type==="pause"||e.type==="ended"||e.type==="seeked"||e.type==="ratechange")&&this.#bt(e.type)){this.#Z();return}if(e.type==="seeked"){const i=this.#Fe;if(this.#Fe=!1,i)return;this.#A=0,this.#k(),this.#Y(),this.#o=null,this.#te(!1);return}const t=e.type==="ratechange";if(t&&(this.#b=0,this.#Re=this.#e.currentTime),this.#k(),this.#w&&this.#A>0){const i=this.#kt(),s=i===null?void 0:this.#l[i];i!==null&&s?(this.#u=i,this.#ne(!0,!1,s.framebuffer),this.#Lt(i)):this.#ne(!0,!1,null)}t&&(this.#A=0,this.#Se=0,this.#Y())};#Vt=e=>{if(e.preventDefault(),this.#D){this.#D.onFailure("the deinterlacer WebGL context was lost");return}this.#y!=="active"&&(this.#W=!0,this.#ot("the deinterlacer WebGL context was lost"),this.stop())}}function Ke(n,e,t,i,s,r,h){return new qe(n,t,{canvas:e,onFailure:i,onVisibility:s,requestAnimationFrame:r,cancelAnimationFrame:h})}function ee(n,e){const t=n.createProgram(),i=te(n,n.VERTEX_SHADER,Ie),s=te(n,n.FRAGMENT_SHADER,e);if(n.attachShader(t,i),n.attachShader(t,s),n.linkProgram(t),n.deleteShader(i),n.deleteShader(s),!n.getProgramParameter(t,n.LINK_STATUS)){const r=n.getProgramInfoLog(t);throw n.deleteProgram(t),new Error(`the deinterlacer failed to link: ${r??"no reason given"}`)}return t}function te(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const P=self;class Ye extends EventTarget{currentTime=0;playbackRate=1;seeking=!1;paused=!0;ended=!1;readyState=0;videoWidth=0;videoHeight=0;parentElement=null;offsetWidth=0;offsetHeight=0;offsetLeft=0;offsetTop=0;#t=[];update(e){this.currentTime=e.currentTime,this.playbackRate=e.playbackRate,this.seeking=e.seeking,this.paused=e.paused,this.ended=e.ended,this.readyState=e.readyState,this.videoWidth=e.videoWidth,this.videoHeight=e.videoHeight,this.#t=e.buffered}get buffered(){return{length:this.#t.length,start:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.start},end:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.end}}}getVideoPlaybackQuality(){return{creationTime:performance.now(),droppedVideoFrames:0,totalVideoFrames:0,corruptedVideoFrames:0}}requestVideoFrameCallback(){return 0}cancelVideoFrameCallback(){}}let g=null,b=null,ie=!1;function Qe(n){return P.requestAnimationFrame(n)}function je(n){P.cancelAnimationFrame(n)}function y(n,e=[]){P.postMessage(n,e)}function Je(n,e,t){n.doubleRate=e.doubleRate,n.spatialCheck=e.spatialCheck,(n.film!==e.film||t==="film")&&(n.film=e.film),n.debug=e.debug}P.onmessage=n=>{const e=n.data;try{if(e.type==="initialize"){if(typeof P.requestAnimationFrame!="function")throw new Error("requestAnimationFrame is unavailable in this Worker");g=new Ye,g.update(e.video),b=Ke(g,e.canvas,e.options,i=>{ie||y({type:"failed",message:i})},i=>y({type:"visibility",visible:i}),Qe,je);let t=0;b.addEventListener("failure",()=>t++),b.addEventListener("stats",i=>{const{dropped:s,...r}=i.detail;y({type:"stats",stats:r,filmFailure:t})}),b.scan=e.scan,b.videoTimeline=e.videoTimeline,b.enabled=e.enabled,y({type:"ready"});return}if(!g||!b)return;switch(e.type){case"frame":g.update(e.video);try{b.ingestExternalFrame(performance.now(),e.metadata,e.frame)}finally{e.frame.close(),y({type:"consumed",id:e.id})}break;case"settings":Je(b,e.options,e.retryFilm);break;case"scan":b.scan=e.scan;break;case"timeline":b.videoTimeline=e.videoTimeline;break;case"enabled":b.enabled=e.enabled;break;case"event":g.update(e.video),g.dispatchEvent(new Event(e.name));break;case"capture":g.videoWidth=e.width,g.videoHeight=e.height,b.capture().then(t=>y({type:"capture",id:e.id,image:t},[t])).catch(()=>y({type:"capture",id:e.id,image:null}));break;case"destroy":ie=!0,b.destroy(),b=null,g=null,P.close();break}}catch(t){const i=t instanceof Error?t.message:String(t);y({type:"failed",message:i})}}})();
//# sourceMappingURL=worker-CyLZgZN-.js.map
