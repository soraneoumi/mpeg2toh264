(function(){"use strict";const S=`#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;function _(n,e,t){const i=n.createProgram(),s=K(n,n.VERTEX_SHADER,t),r=K(n,n.FRAGMENT_SHADER,e);if(n.attachShader(i,s),n.attachShader(i,r),n.linkProgram(i),n.deleteShader(s),n.deleteShader(r),!n.getProgramParameter(i,n.LINK_STATUS)){const h=n.getProgramInfoLog(i);throw n.deleteProgram(i),new Error(`the deinterlacer failed to link: ${h??"no reason given"}`)}return i}function K(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const ue=`#version 300 es
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
`,ce=`#version 300 es
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
`;function fe(n,e){const t=_(n,ue,ce),i=n.getAttribLocation(t,"aVertexPosition"),s=n.getAttribLocation(t,"aTextureCoord"),r=n.getUniformLocation(t,"uTexture"),h=n.getUniformLocation(t,"uMatrix"),o=n.getUniformLocation(t,"uUvMatrix"),l=n.getUniformLocation(t,"uTextColor"),c=n.getUniformLocation(t,"uBackColor");if(r==null||h==null||o==null||l==null||c==null)throw new Error("failed to initialize DEBUG_FRAGMENT_SHADER, DEBUG_VERTEX_SHADER");const a=n.createBuffer(),d=n.createBuffer();return{gl:n,...de(n,e),program:t,programUniforms:{vertex:i,textureCoord:s,texture:r,matrix:h,uvMatrix:o,textColor:l,backColor:c},positionBuffer:a,textureBuffer:d}}function de(n,e){const t=new OffscreenCanvas(0,0),i=t.getContext("2d"),s=new Map;let r=0;const h=0;let o=1;i.font=e,i.fillStyle="white";for(let c=32;c<128;c++){const a=String.fromCharCode(c),d=i.measureText(a),m=Math.ceil(d.actualBoundingBoxDescent+d.actualBoundingBoxAscent+1),u=Math.ceil(d.actualBoundingBoxLeft+d.actualBoundingBoxRight+1);s.set(a,{x:r,y:h,width:u,height:m,metrics:d}),o=Math.max(o,m),r+=u}t.width=r,t.height=o,i.font=e,i.fillStyle="white";for(const[c,a]of s)i.fillText(c,Math.floor(a.x+a.metrics.actualBoundingBoxLeft+1),Math.floor(a.metrics.actualBoundingBoxAscent+1));const l=n.createTexture();return n.bindTexture(n.TEXTURE_2D,l),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t),{fontTexture:l,chars:s,textureSize:{width:r,height:o}}}function me(n){const e=n.gl;e.deleteBuffer(n.positionBuffer),e.deleteBuffer(n.textureBuffer),e.deleteTexture(n.fontTexture),e.deleteProgram(n.program)}function pe(n,e,t,i,s,r,h){const o=[],l=[],c=t;for(const m of e){if(m===`
`){t=c,i+=h;continue}const u=n.chars.get(m);if(u==null)continue;if(u.width===1){t+=u.metrics.width;continue}const f=Math.floor(t-u.metrics.actualBoundingBoxLeft),p=Math.floor(i-u.metrics.actualBoundingBoxAscent),x=f+u.width,T=p+u.height;o.push(f,p),l.push(u.x,u.y),o.push(f,T),l.push(u.x,u.y+u.height),o.push(f+u.width,T),l.push(u.x+u.width,u.y+u.height),o.push(x,T),l.push(u.x+u.width,u.y+u.height),o.push(f,p),l.push(u.x,u.y),o.push(x,p),l.push(u.x+u.width,u.y),t+=u.metrics.width}const a=n.gl;a.useProgram(n.program),a.bindBuffer(a.ARRAY_BUFFER,n.positionBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(o),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.vertex,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.vertex),a.bindBuffer(a.ARRAY_BUFFER,n.textureBuffer),a.bufferData(a.ARRAY_BUFFER,new Float32Array(l),a.STATIC_DRAW),a.vertexAttribPointer(n.programUniforms.textureCoord,2,a.FLOAT,!1,0,0),a.enableVertexAttribArray(n.programUniforms.textureCoord),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,n.fontTexture),a.uniform1i(n.programUniforms.texture,0),a.uniform3fv(n.programUniforms.textColor,[1,1,1]),a.uniform3fv(n.programUniforms.backColor,[0,0,0]);function d(m,u,f){const p=[];for(let x=0;x<u;x++)for(let T=0;T<m;T++)p.push(f[T*m+x]);return p}a.uniformMatrix4fv(n.programUniforms.matrix,!1,d(4,4,[1/(s/2),0,0,-1,0,-2/r,0,1,0,0,1,0,0,0,0,1])),a.uniformMatrix3fv(n.programUniforms.uvMatrix,!1,d(3,3,[1/n.textureSize.width,0,0,0,1/n.textureSize.height,0,0,0,1])),a.viewport(0,0,s,r),a.enable(a.BLEND),a.blendFunc(a.SRC_ALPHA,a.ONE_MINUS_SRC_ALPHA),a.drawArrays(a.TRIANGLES,0,o.length/2),a.disable(a.BLEND)}const v={firstRepeatsPrevious:0,secondRepeatsNext:1,secondRepeatsPrevious:2,previousSecondRepeated:3,firstRepeatsNext:4,previousFirstRepeated:5,phase:6,instant:7},P=8,g=16,U=8,ve=15,Ee=6,xe=8,be=30,Te=.01,ge=.002,Y=2,B=1,Fe=2,$=10,ye={a:"uA",b:"uB",fieldMetrics:"uFieldMetrics",first:"uFirst",size:"uSize"},j=16,Q=8,Re=`#version 300 es

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
  const int BLOCK_W = ${j};
  const int BLOCK_H = ${Q};

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
`,_e={second:"uSecond",first:"uFirst",size:"uSize"},k=8,Ae=`#version 300 es
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
`,we={previous:"uPrevious",second:"uSecond",first:"uFirst",comb:"uComb",size:"uSize"},Se=`#version 300 es
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
  return differing <= ${Y}.0;
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
  bool believed = run >= ${$}.0;
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
  if (max(dSecondPrevious[2], dFirstPrevious[2]) <= ${ge}) return vec4(score, 0.0, 0.0, last[3]);
  ivec2 blocks = textureSize(uComb, 0);
  float combed = 0.0;
  for (int y = 0; y < blocks.y; ++y) {
    for (int x = 0; x < blocks.x; ++x) {
      if (texelFetch(uComb, ivec2(x, y), 0)[0] > ${U}.0) combed += 1.0;
    }
  }
  bool clean = combed <= ${Te} * float(blocks.x * blocks.y);
  score = clean ? min(score + 1.0, ${be}.0) : max(score - ${xe}.0, 0.0);
  bool on = last[3] > 0.5 ? score >= ${Ee}.0 : score >= ${ve}.0;
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
`,Pe={prev:"uPrev",cur:"uCur",first:"uFirst",size:"uSize"},Me=`#version 300 es
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
`,Ce={prev:"uPrev",cur:"uCur",next:"uNext",size:"uSize",parity:"uParity",tff:"uTff",spatialCheck:"uSpatialCheck",debug:"uDebug",film:"uFilm",second:"uSecond",phase:"uPhase",fieldMetrics:"uFieldMetrics",comb:"uComb",combAhead:"uCombAhead",match:"uMatch",instant:"uInstant"},De=`#version 300 es
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
  return texelFetch(uFieldMetrics, ivec2(metric, 0), 0)[1] <= ${Y}.0;
}

/** The pulldown phase the detection gave this frame, or 0. See film-shader.ts. */
int detectedPhase() {
  vec4 phase = texelFetch(uFieldMetrics, ivec2(${v.phase}, 0), 0);
  // Deinterlace each field normally until the cadence is confirmed.
  return phase[1] >= ${$}.0 ? int(phase[0]) : 0;
}

bool isMixedPhase(int phase) {
  return phase == ${B} || phase == ${Fe};
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
`,A={phase:0,run:0};function N(n,e,t){return Object.fromEntries(Object.entries(t).map(([i,s])=>[i,n.getUniformLocation(e,s)]))}class J{#t;#i;#e;#c;#v;#R;#s;#r;#l;#h=null;#d=null;#m=null;#w=null;#n=null;#a=0;#E=null;#u=null;#o=0;#S=0;metrics=new Float32Array(P*4);#_=0;#f=0;constructor(e){this.#t=e,this.#i=_(e,Re,S),this.#e=N(e,this.#i,ye),this.#c=_(e,Ae,S),this.#v=N(e,this.#c,_e),this.#R=_(e,Se,S),this.#s=N(e,this.#R,we),this.#r=_(e,Me,S),this.#l=N(e,this.#r,Pe)}get texture(){return this.#n?.[this.#a]?.textures[0]??null}get combTexture(){return this.#m?.textures[0]??null}get combAheadTexture(){return this.#w?.textures[0]??null}resize(e,t){e===this.#_&&t===this.#f||(this.#_=e,this.#f=t,this.#U())}reset(e=!1){const t=this.#t;t.deleteSync(this.#u),this.#u=null,this.#o=0;const i=this.#n?.[this.#a];if(!i)return;const s=e?v.instant:P,r=new Float32Array(s*4);for(let h=0;h<v.phase;h++)r[h*4+1]=1;t.bindTexture(t.TEXTURE_2D,i.textures[0]??null),t.texSubImage2D(t.TEXTURE_2D,0,0,0,s,1,t.RGBA,t.FLOAT,r)}detect(e,t,i){const s=this.#t;if(this.#_===0||this.#f===0)return;this.#F();const r=this.#h,h=this.#d,o=this.#n;if(r===null||h===null||o===null)return;const l=o[this.#a],c=o[1-this.#a];if(s.bindFramebuffer(s.FRAMEBUFFER,r.framebuffer),s.useProgram(this.#i),this.#P(0,e,this.#e.a),this.#P(1,t,this.#e.b),this.#P(2,l.textures[0],this.#e.fieldMetrics),s.uniform1i(this.#e.first,i),s.uniform2i(this.#e.size,this.#_,this.#f),s.viewport(0,0,r.width,r.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,h.framebuffer),s.useProgram(this.#c),this.#P(0,r.textures[0],this.#v.second),this.#P(1,r.textures[1],this.#v.first),s.uniform2i(this.#v.size,r.width,r.height),s.viewport(0,0,h.width,h.height),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,c.framebuffer),s.useProgram(this.#R),this.#P(0,l.textures[0],this.#s.previous),this.#P(1,h.textures[0],this.#s.second),this.#P(2,h.textures[1],this.#s.first),this.#P(3,this.#m?.textures[0],this.#s.comb),s.uniform2i(this.#s.size,h.width,h.height),s.viewport(0,0,P,1),s.drawArrays(s.TRIANGLES,0,3),this.#a=1-this.#a,this.#o++,this.#u!==null){s.bindFramebuffer(s.FRAMEBUFFER,null);return}this.#S=this.#o,s.bindBuffer(s.PIXEL_PACK_BUFFER,this.#E),s.readPixels(0,0,P,1,s.RGBA,s.FLOAT,0),s.bindBuffer(s.PIXEL_PACK_BUFFER,null),s.bindFramebuffer(s.FRAMEBUFFER,null),this.#u=s.fenceSync(s.SYNC_GPU_COMMANDS_COMPLETE,0),s.flush()}measureComb(e,t,i,s=!1){const r=this.#t;if(this.#_===0||this.#f===0)return;this.#F();const h=s?this.#w:this.#m;h!==null&&(r.bindFramebuffer(r.FRAMEBUFFER,h.framebuffer),r.useProgram(this.#r),this.#P(0,e,this.#l.prev),this.#P(1,t,this.#l.cur),r.uniform1i(this.#l.first,i),r.uniform2i(this.#l.size,this.#_,this.#f),r.viewport(0,0,h.width,h.height),r.drawArrays(r.TRIANGLES,0,3),r.bindFramebuffer(r.FRAMEBUFFER,null))}poll(){const e=this.#t,t=this.#u;if(t===null||this.#E===null)return null;switch(e.clientWaitSync(t,0,0)){case e.ALREADY_SIGNALED:case e.CONDITION_SATISFIED:return e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#E),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,this.metrics),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),e.deleteSync(t),this.#u=null,{phase:this.metrics[v.phase*4]??0,run:this.metrics[v.phase*4+1]??0,instant:(this.metrics[v.instant*4+3]??0)>.5,age:this.#o-this.#S};default:return null}}destroy(){const e=this.#t;if(this.#U(),this.#n!==null){for(const t of this.#n)C(e,t);this.#n=null}e.deleteSync(this.#u),this.#u=null,e.deleteBuffer(this.#E),this.#E=null,e.deleteProgram(this.#i),e.deleteProgram(this.#c),e.deleteProgram(this.#R),e.deleteProgram(this.#r)}#P(e,t,i){const s=this.#t;s.activeTexture(s.TEXTURE0+e),s.bindTexture(s.TEXTURE_2D,t??null),s.uniform1i(i,e)}#U(){const e=this.#t;this.#h!==null&&C(e,this.#h),this.#d!==null&&C(e,this.#d),this.#m!==null&&C(e,this.#m),this.#w!==null&&C(e,this.#w),this.#h=null,this.#d=null,this.#m=null,this.#w=null}#F(){const e=this.#t;if(this.#h===null||this.#d===null||this.#m===null||this.#w===null){this.#U();const t=Math.ceil(this.#_/j),i=Math.ceil(this.#f/(Q*2));this.#h=M(e,t,i,2),this.#d=M(e,Math.ceil(t/k),Math.ceil(i/k),2),this.#m=M(e,Math.ceil(this.#_/g),Math.ceil(this.#f/g),1),this.#w=M(e,Math.ceil(this.#_/g),Math.ceil(this.#f/g),1)}this.#n===null&&(this.#n=[M(e,P,1,1),M(e,P,1,1)],this.#a=0,this.reset()),this.#E===null&&(this.#E=e.createBuffer(),e.bindBuffer(e.PIXEL_PACK_BUFFER,this.#E),e.bufferData(e.PIXEL_PACK_BUFFER,this.metrics.byteLength,e.STREAM_COPY),e.bindBuffer(e.PIXEL_PACK_BUFFER,null))}}function M(n,e,t,i){const s=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,s);const r=[];for(let l=0;l<i;l++){const c=n.createTexture();n.bindTexture(n.TEXTURE_2D,c),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,e,t,0,n.RGBA,n.FLOAT,null),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+l,n.TEXTURE_2D,c,0),r.push(c)}n.drawBuffers(r.map((l,c)=>n.COLOR_ATTACHMENT0+c));const h=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE;n.bindFramebuffer(n.FRAMEBUFFER,null);const o={framebuffer:s,textures:r,width:e,height:t};if(!h)throw C(n,o),new Error("failed to allocate framebuffer");return o}function C(n,{framebuffer:e,textures:t}){n.deleteFramebuffer(e);for(const i of t)n.deleteTexture(i)}function Z(n){return Number.isInteger(n)&&n>0}function ke(n){const{timestamp:e,duration:t,width:i,height:s,displayWidth:r,displayHeight:h,data:o,planes:l,matrix:c}=n;if(!Number.isFinite(e)||!(t>0)||!Number.isFinite(t))throw new TypeError(`invalid picture timing ${e}+${t}`);if(!Z(i)||!Z(s))throw new TypeError(`invalid picture size ${i}x${s}`);if(!(r>0)||!(h>0))throw new TypeError(`invalid display size ${r}x${h}`);if(c!=="bt709"&&c!=="bt601")throw new TypeError(`unknown matrix ${String(c)}`);if(l.length!==3)throw new TypeError("a picture has three planes");for(let a=0;a<3;a++){const d=a===0?i:Math.ceil(i/2),m=a===0?s:Math.ceil(s/2),{offset:u,stride:f}=l[a];if(!Number.isInteger(u)||u<0||!Number.isInteger(f)||f<d||u+f*(m-1)+d>o.byteLength)throw new TypeError(`plane ${a} at ${u} with stride ${f} does not fit ${d}x${m} samples in ${o.byteLength} bytes`)}}function ee(n,e){const t=1-n-e;return Float32Array.of(2*(1-n),2*(1-e)*e/t,2*(1-n)*n/t,2*(1-e))}const Le={bt709:ee(.2126,.0722),bt601:ee(.299,.114)},Ie=`#version 300 es
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
`;class Ue{#t;#i;#e;#c;#v;#R;#s;#r;#l=[];#h=0;#d=0;#m=!1;constructor(e){this.#t=e,this.#i=_(e,Ie,S),this.#e=e.getUniformLocation(this.#i,"uLuma"),this.#c=e.getUniformLocation(this.#i,"uCb"),this.#v=e.getUniformLocation(this.#i,"uCr"),this.#R=e.getUniformLocation(this.#i,"uInterlaced"),this.#s=e.getUniformLocation(this.#i,"uMatrix"),this.#r=e.createFramebuffer()}resize(e,t){const i=this.#t;for(const s of this.#l)i.deleteTexture(s);this.#l=[];for(let s=0;s<3;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texStorage2D(i.TEXTURE_2D,1,i.R8,s===0?e:Math.ceil(e/2),s===0?t:Math.ceil(t/2)),this.#l.push(r)}this.#h=e,this.#d=t,this.#m=!1}convert(e,t){const i=this.#t,s=new Uint8Array(e.data);i.pixelStorei(i.UNPACK_ALIGNMENT,1);for(let r=0;r<3;r++){const{offset:h,stride:o}=e.planes[r];i.bindTexture(i.TEXTURE_2D,this.#l[r]),i.pixelStorei(i.UNPACK_ROW_LENGTH,o),i.texSubImage2D(i.TEXTURE_2D,0,0,0,r===0?this.#h:Math.ceil(this.#h/2),r===0?this.#d:Math.ceil(this.#d/2),i.RED,i.UNSIGNED_BYTE,s,h)}if(i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.bindFramebuffer(i.FRAMEBUFFER,this.#r),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,t,0),!this.#m){if(i.checkFramebufferStatus(i.FRAMEBUFFER)!==i.FRAMEBUFFER_COMPLETE)throw i.bindFramebuffer(i.FRAMEBUFFER,null),new Error("decoded pictures cannot be drawn into RGBA8");this.#m=!0}i.useProgram(this.#i);for(let r=0;r<3;r++)i.activeTexture(i.TEXTURE0+r),i.bindTexture(i.TEXTURE_2D,this.#l[r]);i.uniform1i(this.#e,0),i.uniform1i(this.#c,1),i.uniform1i(this.#v,2),i.uniform1i(this.#R,e.interlaced?1:0),i.uniform4fv(this.#s,Le[e.matrix]),i.viewport(0,0,this.#h,this.#d),i.drawArrays(i.TRIANGLES,0,3),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null)}destroy(){const e=this.#t;for(const t of this.#l)e.deleteTexture(t);this.#l=[],e.deleteFramebuffer(this.#r),e.deleteProgram(this.#i)}}const Be=250,w=4,Ne=.01,Oe=100,Xe=250,Ge=.5,$e=2;class ze{#t=0;#i=Number.NaN;#e=0;#c=1;#v=!0;#R=Number.NaN;#s=0;#r=!1;#l=0;#h=0;#d=Number.NaN;#m=0;#w=new Float64Array(w);#n=0;#a=!0;at(e){return this.#i+this.#e*(e-this.#t)/1e3}get rate(){return this.#e}get origin(){return this.#d}hold(){this.#a=!0,this.#i=Number.NaN,this.#e=0}observe(e,t,i,s){const r=e-this.#h;if(this.#h=e,!s||this.#a||i!==this.#c)return this.#a=!1,this.#c=i,this.#E(e,t),!1;if(t===this.#R)return!this.#v&&e-this.#s>Xe&&this.#E(e,t),!1;const h=(t-this.#R)*1e3/i,o=e-this.#s,l=this.#l;if(this.#R=t,this.#s=e,this.#l=r,this.#v){const f=this.#r&&h>=o*Ge&&h<=o+l+$e;return this.#r=!0,f?(this.#u(e,t),!0):(this.#t=e,this.#i=t,!1)}const c=t-this.at(e);if(Math.abs(c)>Oe/1e3*i)return this.#d=t,this.#u(e,t),!0;const a=this.#w;e-this.#n>=Be?(a.copyWithin(0,1),a[w-1]=c,this.#n=e):a[w-1]=Math.max(a[w-1],c);let d=a[0];for(let f=1;f<w;f++)d=Math.max(d,a[f]);const m=Ne*i*(e-this.#m)/1e3,u=Math.max(-m,Math.min(m,d));this.#m=e,this.#i+=u;for(let f=0;f<w;f++)a[f]=a[f]-u;return!1}#E(e,t){this.#t=e,this.#i=t,this.#e=0,this.#v=!0,this.#r=!1,this.#R=t,this.#s=e,this.#d=t}#u(e,t){this.#t=e,this.#i=t,this.#e=this.#c,this.#v=!1,this.#m=e,this.#n=e,this.#w.fill(Number.NEGATIVE_INFINITY),this.#w[w-1]=0}}const L=16,We=6,He=`#version 300 es
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
`;class Ve{#t;#i;#e=null;#c=null;#v=[];#R=0;#s=[];#r=new Uint8Array(0);#l=[];#h=null;#d=0;constructor(e,t){this.#t=e,this.#i=t}take(){const e=this.#t,t=this.#v.pop()??this.#a();if(t===null)return null;const i=this.#i.videoWidth,s=this.#i.videoHeight;e.bindTexture(e.TEXTURE_2D,t);try{e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#i)}catch(o){throw this.#v.push(t),o}const r={id:++this.#d,texture:t,width:i,height:s,changed:null,fence:null,buffer:null,reported:!1},h=this.#h;return h===null||h.width!==i||h.height!==s?r.changed=!0:this.#m(r,h),this.#h=r,this.#l.push(r),r.id}settle(){const e=this.#t,t=this.#l.find(i=>!i.reported);if(t===void 0||t===this.#h)return null;if(t.changed===null){const{fence:i,buffer:s}=t;if(i===null||s===null)return null;const r=e.clientWaitSync(i,0,0);if(r!==e.ALREADY_SIGNALED&&r!==e.CONDITION_SATISFIED)return null;this.#r.byteLength<s.bytes&&(this.#r=new Uint8Array(s.bytes));const h=this.#r.subarray(0,s.bytes);e.bindBuffer(e.PIXEL_PACK_BUFFER,s.buffer),e.getBufferSubData(e.PIXEL_PACK_BUFFER,0,h),e.bindBuffer(e.PIXEL_PACK_BUFFER,null),t.changed=qe(h),this.#w(t)}return t.reported=!0,{id:t.id,changed:t.changed}}adopt(e,t){const i=this.#l.findIndex(r=>r.id===e),s=this.#l[i];if(s===void 0||!s.reported)throw new Error(`picture ${e} is not available to adopt`);return this.#l.splice(i,1),this.#v.push(t),s.texture}release(e){const t=this.#l.findIndex(s=>s.id===e),i=this.#l[t];i!==void 0&&(this.#l.splice(t,1),this.#n(i))}reset(){const e=this.#l;this.#l=[],this.#h=null;for(const t of e)this.#w(t),this.#n(t)}destroy(){const e=this.#t;this.reset();for(const t of this.#v)e.deleteTexture(t);this.#v=[],this.#R=0;for(const{buffer:t}of this.#s)e.deleteBuffer(t);this.#s=[],this.#o(),this.#e!==null&&e.deleteProgram(this.#e),this.#e=null}#m(e,t){const i=this.#t,s=Math.ceil(e.width/L),r=Math.ceil(e.height/L),h=this.#u(s,r),o=this.#S(s*r*4);this.#e??=this.#E(),i.bindFramebuffer(i.FRAMEBUFFER,h.framebuffer),i.useProgram(this.#e),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,t.texture),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e.texture),i.viewport(0,0,s,r),i.drawArrays(i.TRIANGLES,0,3),i.bindBuffer(i.PIXEL_PACK_BUFFER,o.buffer),i.readPixels(0,0,s,r,i.RGBA,i.UNSIGNED_BYTE,0),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),i.bindFramebuffer(i.FRAMEBUFFER,null),e.fence=i.fenceSync(i.SYNC_GPU_COMMANDS_COMPLETE,0),e.buffer=o,i.flush()}#w(e){const t=this.#t;e.fence!==null&&t.deleteSync(e.fence),e.fence=null;const i=e.buffer;if(e.buffer=null,i===null)return;const s=this.#c;s!==null&&i.bytes===s.width*s.height*4?this.#s.push(i):t.deleteBuffer(i.buffer)}#n(e){this.#v.push(e.texture)}#a(){if(this.#R===We)return null;const e=this.#t,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.#R++,t}#E(){const e=this.#t,t=_(e,He,S);return e.useProgram(t),e.uniform1i(e.getUniformLocation(t,"uTake"),0),e.uniform1i(e.getUniformLocation(t,"uReference"),1),t}#u(e,t){const i=this.#t,s=this.#c;if(s?.width===e&&s.height===t)return s;this.#o();for(const{buffer:l}of this.#s)i.deleteBuffer(l);this.#s=[];const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null);const h=i.createFramebuffer();i.bindFramebuffer(i.FRAMEBUFFER,h),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,r,0),i.bindFramebuffer(i.FRAMEBUFFER,null);const o={framebuffer:h,texture:r,width:e,height:t};return this.#c=o,o}#o(){const e=this.#t;this.#c!==null&&(e.deleteFramebuffer(this.#c.framebuffer),e.deleteTexture(this.#c.texture),this.#c=null)}#S(e){const t=this.#s.pop();if(t!==void 0)return t;const i=this.#t,s=i.createBuffer();return i.bindBuffer(i.PIXEL_PACK_BUFFER,s),i.bufferData(i.PIXEL_PACK_BUFFER,e,i.STREAM_COPY),i.bindBuffer(i.PIXEL_PACK_BUFFER,null),{buffer:s,bytes:e}}}function qe(n){for(let e=0;e<n.length;e+=4)if(n[e]!==0||n[e+1]!==0||n[e+2]!==0)return!0;return!1}const te=["mozParsedFrames","mozDecodedFrames","mozPresentedFrames","mozPaintedFrames"];function Ke(n){return te.every(e=>e in n)}function Ye(n){return n.ownerDocument?.defaultView?.performance.timeOrigin??performance.timeOrigin}const je=250,z=500,Qe=1.75,Je=3,Ze=200;class et{#t;#i;#e;#c=null;#v=[];#R=0;#s=null;#r=0;#l=null;#h=null;#d=null;#m=null;#w=null;#n=null;#a=!0;#E=null;#u=null;#o=0;#S;#_;#f=null;#P=null;#U=null;#F=null;#se=0;#Q=[];#q=[];constructor(e,t){if(this.#t=e,this.#e=t,this.#i=Ke(e)?e:null,this.#S=this.#i===null&&typeof VideoFrame<"u",this.#_=this.#S&&e.playbackRate>1,this.#i){for(const i of["emptied","seeking","seeked"])e.addEventListener(i,this.#W);for(const i of["pause","playing","waiting","ratechange"])e.addEventListener(i,this.#A)}if(this.#S)for(const i of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])e.addEventListener(i,this.#re)}get captureDriven(){return this.#_}request(e){if(this.#m===null){if(this.#m=e,this.#_){this.#G();return}this.#d=this.#i?requestAnimationFrame(this.#Z):this.#t.requestVideoFrameCallback(this.#I)}}cancel(){this.#d!==null&&(this.#i?cancelAnimationFrame(this.#d):this.#t.cancelVideoFrameCallback(this.#d)),this.#d=null,this.#m=null,this.#f?.(),this.#f=null,this.#U!==null&&this.#t.cancelVideoFrameCallback(this.#U),this.#U=null,this.#ve(),this.#F=null,this.#Q=[],this.#_=this.#S&&this.#t.playbackRate>1,this.#W()}destroy(){this.cancel();for(const e of["emptied","seeking","seeked"])this.#t.removeEventListener(e,this.#W);for(const e of["pause","playing","waiting","ratechange"])this.#t.removeEventListener(e,this.#A);for(const e of["loadeddata","playing","pause","ended","seeking","seeked","emptied","ratechange"])this.#t.removeEventListener(e,this.#re)}flush(e){if(this.#_)for(this.#t.ownerDocument!==this.#P&&(this.#f?.(),this.#f=null,this.#G());this.#q.length>0&&this.#m!==null;){const t=this.#q.shift(),i=t.frame;try{this.#K(e,{width:i.visibleRect?.width??i.codedWidth,height:i.visibleRect?.height??i.codedHeight,mediaTime:i.timestamp/1e6,presentedFrames:t.count,expectedDisplayTime:Math.max(t.at,e),timeOrigin:performance.timeOrigin,frame:i})}finally{i.close()}}}#ve(){for(const e of this.#q)e.frame.close();this.#q=[]}#re=e=>{const t=this.#S&&this.#t.playbackRate>1;if(t!==this.#_){const i=this.#m;this.cancel(),this.#_=t,i!==null&&this.request(i);return}["seeking","seeked","emptied","ratechange"].includes(e.type)&&(this.#F=null,this.#Q=[]),this.#_&&((e.type==="pause"||e.type==="ended")&&this.flush(performance.now()),this.#ve(),this.#f?.(),this.#f=null,this.#m!==null&&this.#G())};#G(){if(!this.#_||this.#f!==null||this.#m===null||(this.#t.paused||this.#t.ended)&&this.#F!==null)return;this.#U===null&&typeof this.#t.requestVideoFrameCallback=="function"&&(this.#U=this.#t.requestVideoFrameCallback(this.#J));const e=Math.max(4,8/Math.max(1,this.#t.playbackRate)),t=this.#t.ownerDocument?.defaultView;if(this.#P=this.#t.ownerDocument,t){const i=t.setTimeout(this.#ne,e);this.#f=()=>t.clearTimeout(i)}else{const i=setTimeout(this.#ne,e);this.#f=()=>clearTimeout(i)}}#J=()=>{this.#U=null,this.#f?.(),this.#f=null,this.#ne()};#ne=()=>{this.#f=null;const e=this.#t;if(this.#m===null)return;if(e.readyState<2||e.seeking){this.#G();return}let t;try{t=new VideoFrame(e)}catch(i){if(!(i instanceof DOMException)||i.name!=="InvalidStateError")throw i;this.#G();return}if(t.timestamp===this.#F)t.close();else{let i=1;if(this.#F!==null){const s=t.timestamp-this.#F;if(s>1e3&&s<25e4&&(this.#Q.push(s),this.#Q.length>7&&this.#Q.shift()),s>0&&this.#Q.length>0){const r=[...this.#Q].sort((o,l)=>o-l),h=r[Math.floor(r.length/2)];i=Math.max(1,Math.round(s/h))}}for(this.#F=t.timestamp,this.#se+=i,this.#q.push({frame:t,at:performance.now(),count:this.#se});this.#q.length>4;)this.#q.shift().frame.close()}this.#G()};#A=()=>{this.#E=null,this.#u=null,this.#o=0};#W=()=>{this.#w=null,this.#n=null,this.#a=!0,this.#Re(),this.#A()};#Re(){this.#c?.reset(),this.#v=[],this.#r=0}#I=(e,t)=>{this.#K(e,{width:t.width,height:t.height,mediaTime:t.mediaTime,presentedFrames:t.presentedFrames,expectedDisplayTime:t.expectedDisplayTime,timeOrigin:Ye(this.#t)})};#K=(e,t)=>{const i=this.#m;this.#d=null,this.#m=null,i?.(e,t)};#Z=e=>{const t=this.#i,i=te.map(l=>t[l]);this.#w?.some((l,c)=>i[c]<l)&&this.#W(),this.#w=i;const s=this.#e?.()??null;s!==this.#c&&(this.#W(),this.#c=s);const r=t.mozPaintedFrames,h=!t.seeking&&t.readyState>=2&&t.videoWidth>0&&t.videoHeight>0,o=this.#n===null&&(r>0||t.paused&&(t.mozPresentedFrames>0||t.mozDecodedFrames>0));if(s!==null){this.#L(e,t,s,h,o);return}if(h&&(o||this.#n!==null&&r!==this.#n)){this.#E!==null&&e-this.#E>z&&(this.#A(),this.#a=!0),this.#H(e,t),this.#E=e,this.#n=r;const l=this.#a;this.#a=!1,this.#K(e,{width:t.videoWidth,height:t.videoHeight,mediaTime:t.currentTime,presentedFrames:r,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#o,discontinuity:l}})}else this.#d=requestAnimationFrame(this.#Z)};#H(e,t){if(t.paused||t.ended)return;const i=t.mozPaintedFrames,s=this.#u;if(s&&e-s.at>=je){const r=i-s.frames;if(r>0){const h=(e-s.at)/r;h>=4&&h<=200&&(this.#o=this.#o?this.#o+(h-this.#o)*.25:h)}this.#u=null}this.#u??={at:e,frames:i}}#L(e,t,i,s,r){const h=t.mozPaintedFrames,o=this.#n!==null&&h!==this.#n;this.#s!==null&&e-this.#s>z&&(this.#Re(),this.#A(),this.#a=!0),this.#s=e,o&&this.#H(e,t);const l=t.paused||t.ended;(!l||o)&&(this.#r=0),l&&this.#l!==null&&(this.#l=e);const c=l&&this.#r>=Je;if(s&&(r||this.#n!==null)){this.#n=h;const u=c?null:i.take();u!==null&&this.#v.push({id:u,at:e,mediaTime:t.currentTime,width:t.videoWidth,height:t.videoHeight,resting:l})}let a=null;for(let u=i.settle();u!==null;u=i.settle()){const f=this.#v.shift();if(f?.id!==u.id)throw new Error("picture verdicts arrived out of order");let p=u.changed;if(p?this.#r=0:(this.#r=f.resting?this.#r+1:0,p=a===null&&!f.resting&&this.#l!==null&&(f.at-this.#l)*(t.playbackRate||1)>=Ze&&h!==this.#h),!p){i.release(f.id);continue}a!==null&&i.release(a.id),a=f}if(a===null){this.#d=requestAnimationFrame(this.#Z);return}let d=1;if(this.#E!==null){const u=a.at-this.#E;u>z?(this.#A(),this.#a=!0):this.#o>0&&u>this.#o*Qe&&(d=Math.round(u/this.#o))}this.#R+=d,this.#E=a.at,this.#l=a.at,this.#h=h;const m=this.#a;this.#a=!1;try{this.#K(e,{width:a.width,height:a.height,mediaTime:a.mediaTime,presentedFrames:this.#R,expectedDisplayTime:e,timeOrigin:performance.timeOrigin,mozTiming:{periodMs:this.#o,discontinuity:m},picture:a.id})}finally{i.release(a.id)}}}let tt=null;const W=.5,b=4,H=5,F=H+1,ie=1e3,se=4,O=200,it=.25,st=1e3/60,rt=`#version 300 es
void main() {
  // One triangle over the whole viewport, from the vertex index alone. There
  // is no geometry here worth a buffer: every pixel is the fragment shader's.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`,nt=.75,ht=.1,re=1,ot=60,at=.02,lt=.1,I=1,ut=4,ct=90,ft=1.5,dt=24,X=.001,G=5,ne=4,he={2:0,3:.25,4:.5,5:.75};function oe(n){return pt[(n.interlaced?2:0)+(n.topFieldFirst?1:0)]}const mt=`#version 300 es
precision highp float;
uniform sampler2D uField;
uniform bool uFlip;
out vec4 fragColor;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  if (uFlip) position.y = textureSize(uField, 0).y - 1 - position.y;
  fragColor = texelFetch(uField, position, 0);
}
`,pt=[{interlaced:!1,topFieldFirst:!1},{interlaced:!1,topFieldFirst:!0},{interlaced:!0,topFieldFirst:!1},{interlaced:!0,topFieldFirst:!0}],vt={requestAnimationFrame:n=>requestAnimationFrame(n),cancelAnimationFrame:n=>cancelAnimationFrame(n)};class Et extends EventTarget{decodedVideo;#t;#i;#e;#c;#v;#R=null;#s;#r=null;#l;#h;#d;#m;#w;#n=[];#a=[];#E=F-1;#u=null;#o=[];#S=null;#_=0;#f=null;#P=null;#U;#F=st;#se=0;#Q=0;#q=0;#ve=0;#re=null;#G=0;#J=0;#ne=0;#A(){this.#o.length=0,this.#Be.length=0,this.#re=null,this.#G=0,this.#J=0,this.#ve=0}#W=null;#Re;#I;#K;#Z=0;#H;#L;#D=0;#B=0;#V=0;#T=b-1;#y=0;#ze=0;#kt=0;#We=!1;#M=!1;#ee=0;#_e=!1;#Y=!1;#k=null;#Ae=[];#te=!1;#Lt;#It;#C;#we;#ae;#Ut;#x=null;#g;#He=!1;#Bt=0;#Nt=!1;#Wi=0;#Ve=!1;#lt=!1;#Se=null;#Hi=0;#qe=new Map;#b={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0};#Ke=0;#Ye=0;#ut=0;#he=0;#Ee=0;#xe=0;#Pe=0;#le=0;#Me;#ct=[];#Ce=[];#je=0;#De=0;#Qe=0;#ke=0;#Je=A;#Le=0;#N=A;#$=!1;#O=0;#ft=!1;#be=!1;#Ot=!1;#Xt=!1;#Gt=!1;#Ze=!1;#Ie=null;#pi="";#dt=[0,0,0,0,0,0];#mt=0;#Te=null;#$t=null;#zt=0;#p=!1;#ge=[];#Wt=!1;#j=new ze;#et=null;#ue=Array.from({length:b},()=>({timestamp:0,duration:0,interlaced:!0,topFieldFirst:!0,repeatFirstField:!1}));#pt=!1;#Ue=!1;#tt=!1;#Be=[];#vt=null;#ce=null;#Ne=null;#Ht=Number.NEGATIVE_INFINITY;#it=1;#Vt=!0;#st=0;#rt=0;#qt=null;#Et=!1;#Kt=0;#Yt=0;#xt=new Map;#Vi=0;constructor(e,t={},i=null){super(),this.#e=e,this.#I=t.doubleRate??!1,this.#K=t.spatialCheck??!0,this.#H=t.debug??!1,this.#L=t.film??!1,this.#Lt=t.onStats,this.#It=t.onFailure,this.#C=i,this.#ae=i?"main":t.rendering??"main",this.#Ut=t.workerUrl??tt,this.#g=this.#ae==="main"?"main":"idle",this.#i=i?i.canvas:document.createElement("canvas"),this.#t=i?.canvas??(this.#ae==="main"?this.#i:document.createElement("canvas")),this.#we=e,i||(this.#i.style.cssText="position:absolute;pointer-events:none;visibility:hidden");const s=this.#t.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"});if(!(s instanceof WebGL2RenderingContext))throw new Error("this browser has no WebGL2");this.#s=s,this.#L&&(this.#xi(),this.#r=new J(s)),this.#l=ae(s,De);const r=this.#l;this.#h=Object.fromEntries(Object.entries(Ce).map(([h,o])=>[h,s.getUniformLocation(r,o)])),this.#d=ae(s,mt),this.#m=s.getUniformLocation(this.#d,"uField"),this.#w=s.getUniformLocation(this.#d,"uFlip"),this.#Me=s.getExtension("EXT_disjoint_timer_query_webgl2"),this.#t.addEventListener("webglcontextlost",this.#zi),this.#Re=i?null:new ResizeObserver(()=>this.#$e()),this.#U=i?null:new MutationObserver(()=>{this.#i.ownerDocument!==this.#P&&this.#$e()}),this.decodedVideo={push:h=>this.#ns(h),reset:()=>this.#yi(),finish:()=>{this.#Wt=!0,this.#x?.postMessage({type:"pictures",action:"finish"})},onrelease:null},this.#v=i?null:new Ve(s,e),this.#c=new et(e,()=>this.#g==="main"?this.#v:null),e.addEventListener("emptied",this.#Oi),e.addEventListener("resize",this.#Ni),e.addEventListener("pause",this.#pe),e.addEventListener("ended",this.#pe),e.addEventListener("seeking",this.#Gi),e.addEventListener("seeked",this.#pe),e.addEventListener("ratechange",this.#pe),e.addEventListener("waiting",this.#$i)}get running(){return this.#p?this.#M:this.#M&&(this.#k?.interlaced??!0)}get canvas(){return this.#i}get#bt(){return this.#p?this.#Vt:this.#k?.topFieldFirst!==!1}#vi(){return{doubleRate:this.#I,spatialCheck:this.#K,film:this.#L,debug:this.#H}}get enabled(){return this.#_e}set enabled(e){this.#_e=e,this.#Tt(),this.#x?.postMessage({type:"enabled",enabled:e})}set scan(e){if(this.#p)return;const t=this.#k?.interlaced!==e?.interlaced,i=t||this.#k?.topFieldFirst!==e?.topFieldFirst;this.#k=e,!(i&&(!this.#Xe()||this.#k!==e))&&(this.#x?.postMessage({type:"scan",scan:e}),i&&(this.#y=0,this.#A(),this.#z(),t&&(this.#D=0),this.#u=null,this.#de(!1)),this.#Tt(),i&&((e?.interlaced??!0)&&(this.#C||this.#g==="main")?this.#Fe():this.#si()))}get scan(){return this.#p?this.#vt?.scan??null:this.#k}set videoTimeline(e){this.#Ae=e,this.#x?.postMessage({type:"timeline",videoTimeline:e}),e.length===0&&(this.#k=null),this.#Tt()}get videoTimeline(){return this.#Ae}get container(){return this.#W??this.#e}get doubleRate(){return this.#I}set doubleRate(e){e!==this.#I&&(this.#I=e,this.#Oe(),!this.#p&&(this.#A(),this.#Ei()))}get spatialCheck(){return this.#K}set spatialCheck(e){e!==this.#K&&(this.#K=e,this.#Oe())}get film(){return this.#L}set film(e){const t=this.#x?this.#$t:this.#Te;if(!(e===this.#L&&(e===!1||t===null))){if(this.#x){this.#L=e,this.#Oe(e?"film":void 0);return}if(e){if(!this.#Xe())return;try{this.#bi()}catch(i){this.#L=!0,this.#Oe(),this.#Ft(`film detector unavailable: ${i instanceof Error?i.message:String(i)}`);return}}if(this.#L=e,this.#Oe(),!e){if(!this.#Xe())return;this.#$=!1,this.#O=0,this.#be=!1,this.#N=A,this.#z(),this.#r?.destroy(),this.#r=null}this.#Ei()}}get debug(){return this.#H}set debug(e){e!==this.#H&&(this.#H=e,this.#Oe())}get#qi(){return this.#I||this.#L}#Ei(){this.#Y||this.#p||(this.#qi?(this.#B>0&&this.#Bi(),(this.#k?.interlaced??!0)&&(this.#C||this.#g==="main")&&this.#Fe()):this.#L||(this.#u=null,this.#de(!1),this.#at()))}#Oe(e){this.#x?.postMessage({type:"settings",options:this.#vi(),retryFilm:e})}#xi(){if(this.#s.getExtension("EXT_color_buffer_float")===null)throw new Error("film needs EXT_color_buffer_float")}#bi(){this.#xi(),this.#r??=new J(this.#s),this.#B>0&&this.#r.resize(this.#B,this.#V)}#Tt(){this.#p||this.#_e&&(this.#Ae.length>0||(this.#k?.interlaced??!0))?this.start():this.stop()}#Ki(){return this.#C||this.#ae==="main"?!1:this.#g==="starting"||this.#g==="active"?!0:typeof Worker<"u"&&typeof VideoFrame<"u"&&typeof OffscreenCanvas<"u"&&this.#Ut!==null&&"transferControlToOffscreen"in HTMLCanvasElement.prototype?(this.#Ti(),!0):this.#ae==="auto"?(this.#yt(),!1):(this.#g="failed",this.#M=!1,!0)}#Ti(){this.#oe(),this.#x?.terminate(),this.#x=null,this.#wt(),this.#Ve=!1,this.#lt=!1,this.#$t=null,this.#zt=0;let e=this.#i;if(this.#Nt){e=document.createElement("canvas"),e.className=this.#i.className;const r=this.#i.getAttribute("style");r===null?e.removeAttribute("style"):e.setAttribute("style",r),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e}const t=++this.#Bt;this.#g="starting";let i,s;try{s=e.transferControlToOffscreen(),this.#Nt=!0,i=new Worker(this.#Ut,{type:"module"})}catch(r){this.#nt(r instanceof Error?r.message:String(r));return}this.#x=i,i.onmessage=r=>{t===this.#Bt&&this.#Yi(r.data)},i.onerror=r=>{t===this.#Bt&&(r.preventDefault(),this.#nt(r.message||"the deinterlacer worker failed"))},i.postMessage({type:"initialize",canvas:s,options:this.#vi(),scan:this.#k,videoTimeline:this.#Ae,enabled:this.#M,video:this.#Rt()},[s])}#Yi(e){switch(e.type){case"ready":this.#g="active",this.#M&&(this.#ht(),this.#Dt());break;case"failed":this.#nt(e.message);break;case"consumed":{this.#Ve=!1,this.#lt=!0;const t=this.#Se;this.#Se=null,t&&this.#Fi(t);break}case"visibility":this.#i.style.visibility=e.visible?"visible":"hidden";break;case"stats":{this.#p&&(this.#Yt=e.stats.missed+e.stats.queueResetted);const t={...e.stats,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0},i=t.filmError??null,s=this.#zt;if(this.#$t=i,this.#zt=e.filmFailure,i!==null&&e.filmFailure!==s){this.dispatchEvent(new CustomEvent("failure",{detail:i}));try{this.#It?.(i)}catch{}}this.dispatchEvent(new CustomEvent("stats",{detail:t})),this.#Lt?.(t);break}case"capture":{const t=this.#qe.get(e.id);if(this.#qe.delete(e.id),!t){e.image?.close();break}e.image?t.resolve(e.image):this.#p?t.reject(new Error("no rendered picture is available")):createImageBitmap(this.#e).then(t.resolve,t.reject);break}case"release":this.#xt.delete(e.id)&&this.#ie(e.data);break}}#gt(e){if(this.dispatchEvent(new CustomEvent("failure",{detail:e})),!this.#C)try{this.#It?.(e)}catch{}}#Ft(e){this.#Te!==e&&(this.#Te=e,this.#$=!1,this.#O=0,this.#be=!1,this.#N=A,this.#z(),this.#r?.destroy(),this.#r=null,this.#gt(e))}#Xe(){return this.#Y?!1:(this.#x||(this.#Te=null),!0)}#nt(e){if(this.#g==="starting"&&this.#ae==="auto"&&!this.#He){this.#yt();return}if(this.#gi(e),!this.#He){this.#He=!0,this.#Ti();return}console.error(`Deinterlacer Worker stopped: ${e}`),this.#g="failed",this.#x?.terminate(),this.#x=null,this.#oe(),this.#wt(),this.#gt(`deinterlacer worker stopped: ${e}`),this.stop()}#yt(){const e=this.#t;e.className=this.#i.className;const t=this.#i.getAttribute("style");t===null?e.removeAttribute("style"):e.setAttribute("style",t),e.style.visibility="hidden",this.#i.parentElement&&this.#i.replaceWith(e),this.#i=e,this.#Nt=!1,this.#x?.terminate(),this.#x=null,this.#g="main",this.#oe(),this.#wt(),this.#M&&(this.#ht(),this.#Dt(),(this.#k?.interlaced??!0)&&this.#Fe())}#oe(){this.#Se?.frame.close(),this.#Se=null}#gi(e){for(const t of this.#qe.values())t.reject(new Error(e));this.#qe.clear()}start(){if(!(this.#M||this.#Y||this.#te)&&(this.#ee++,this.#M=!0,this.#Xi(),!!this.#Xe())){if(this.#ws(),this.#Dt(),this.#Ki()){if(this.#p){this.#x?.postMessage({type:"running",running:!0}),this.#Fe();return}this.#x?.postMessage({type:"enabled",enabled:!0}),this.#g==="active"&&this.#ht();return}this.#ht(),(this.#p||(this.#k?.interlaced??!0))&&this.#Fe()}}stop(){this.#ee++,this.#M&&(this.#M=!1,this.#p&&this.#yi(),this.#c.cancel(),this.#oi(),this.#si(),this.#y=0,this.#u=null,this.#de(!1),this.#oe(),this.#x?.postMessage(this.#p?{type:"running",running:!1}:{type:"enabled",enabled:!1}))}destroy(){if(!this.#Y){this.#Y=!0,this.#_e=!1,this.stop(),this.#x?.postMessage({type:"destroy"}),this.#x?.terminate(),this.#x=null,this.#oe(),this.#wt(),this.#gi("the deinterlacer was destroyed"),this.#P?.removeEventListener("visibilitychange",this.#hi),this.#P=null,this.#U?.disconnect(),this.#t.removeEventListener("webglcontextlost",this.#zi),this.#c.destroy(),this.#v?.destroy(),this.#e.removeEventListener("emptied",this.#Oi),this.#e.removeEventListener("resize",this.#Ni),this.#e.removeEventListener("pause",this.#pe),this.#e.removeEventListener("ended",this.#pe),this.#e.removeEventListener("seeking",this.#Gi),this.#e.removeEventListener("seeked",this.#pe),this.#e.removeEventListener("ratechange",this.#pe),this.#e.removeEventListener("waiting",this.#$i),this.#qt!==null&&(this.#e.style.aspectRatio=this.#qt),this.#as(),this.#Ss();for(const e of this.#n)this.#s.deleteTexture(e);this.#n=[],this.#at();for(const e of[...this.#ct,...this.#Ce.map(({q:t})=>t)])this.#s.deleteQuery(e);this.#ct.length=0,this.#Ce.length=0,this.#r?.destroy(),this.#r=null,this.#et?.destroy(),this.#et=null,this.#Ie!==null&&(me(this.#Ie),this.#Ie=null),this.#s.deleteProgram(this.#l),this.#s.deleteProgram(this.#d),this.#s.getExtension("WEBGL_lose_context")?.loseContext()}}capture(){if(this.#g==="active"&&this.#i.style.visibility==="visible"&&this.#x){const s=++this.#Hi,r=new Promise((h,o)=>{this.#qe.set(s,{resolve:h,reject:o})});return this.#x.postMessage({type:"capture",id:s,width:this.#e.videoWidth,height:this.#e.videoHeight}),r}if(!this.#p&&(this.#g==="starting"||this.#g==="failed"))return createImageBitmap(this.#e);const e=this.#u;if((this.#C||this.#p)&&(!this.#M||this.#te||!e))return Promise.reject(new Error("no rendered picture is available"));if(!this.#M||this.#te||!e)return createImageBitmap(this.#e);e.kind==="texture"?this.#ui(e.texture,e.flip,!1):this.#me(e.flush,e.second,null,!1);const t=this.#p?this.#st:this.#e.videoWidth,i=this.#p?this.#rt:this.#e.videoHeight;return t>0&&i>0&&(t!==this.#t.width||i!==this.#t.height)?createImageBitmap(this.#t,{resizeWidth:t,resizeHeight:i,resizeQuality:"high"}):createImageBitmap(this.#t)}addEventListener(e,t,i){super.addEventListener(e,t,i)}removeEventListener(e,t,i){super.removeEventListener(e,t,i)}#ht(){this.#C||!this.#M||this.#p||this.#c.request(this.#ss)}#Rt(){const e=[];for(let t=0;t<this.#e.buffered.length;t++)e.push({start:this.#e.buffered.start(t),end:this.#e.buffered.end(t)});return{currentTime:this.#e.currentTime,playbackRate:this.#e.playbackRate,seeking:this.#e.seeking,paused:this.#e.paused,ended:this.#e.ended,readyState:this.#e.readyState,videoWidth:this.#e.videoWidth,videoHeight:this.#e.videoHeight,buffered:e}}#ji(e,t,i){let s;try{s=i?.clone()??new VideoFrame(this.#e,{timestamp:Math.max(0,Math.round(t.mediaTime*1e6))})}catch(h){const o=h instanceof Error?h.message:String(h);this.#ae==="auto"&&!this.#lt&&!this.#He?(this.#yt(),this.#Pt(e,t)):this.#nt(o);return}const r={id:++this.#Wi,frame:s,now:e,metadata:t,video:this.#Rt()};if(this.#Ve){this.#Se?.frame.close(),this.#Se=r;return}this.#Fi(r)}#Fi(e){const t=this.#x;if(!t||this.#g!=="active"){e.frame.close();return}this.#Ve=!0;const i={type:"frame",id:e.id,frame:e.frame,metadata:e.metadata,video:e.video};try{t.postMessage(i,[e.frame])}catch(s){this.#Ve=!1,e.frame.close();const r=s instanceof Error?s.message:String(s);this.#ae==="auto"&&!this.#lt&&!this.#He?(this.#yt(),this.#Pt(e.now,e.metadata)):this.#nt(r)}}#Qi(e,t,i){this.#Ie==null&&(this.#Ie=fe(this.#s,"20px monospace")),pe(this.#Ie,e,t,i,this.#B,this.#V,20)}#_t(e){if(this.#Me==null||this.#Ce.length>30)return;const t=this.#ct.pop()??this.#s.createQuery();return this.#s.beginQuery(this.#Me.TIME_ELAPSED_EXT,t),this.#Ce.push({q:t,isField:e}),t}#fe(e){this.#Me!=null&&(e!=null&&this.#s.endQuery(this.#Me.TIME_ELAPSED_EXT),this.#Ce=this.#Ce.filter(({q:t,isField:i})=>{if(this.#s.getQueryParameter(t,this.#s.QUERY_RESULT_AVAILABLE)){const s=this.#s.getQueryParameter(t,this.#s.QUERY_RESULT);return i?(this.#Qe+=s,this.#ke++):(this.#je+=s,this.#De++),this.#ct.push(t),!1}return!0}))}#z(e=!1){this.#N=A,this.#Je=A,this.#Le=0,e||(this.#Ot=!1),this.#$=!1,this.#r?.reset(e)}#Ji(){const{prev:e,cur:t,next:i}=this.#di(!1),s=this.#n[e],r=this.#n[t],h=this.#n[i];if(!s||!r||!h)return;const o=this.#bt?0:1;this.#r?.measureComb(s,r,o),this.#r?.detect(r,h,o)}#Zi(){const{cur:e,next:t}=this.#di(!1),i=this.#n[e],s=this.#n[t],r=this.#r;if(!i||!s||!r)return!1;const h=this.#bt?0:1;try{r.measureComb(i,s,h,!0)}catch(o){return this.#Ft(`film detection failed: ${o instanceof Error?o.message:String(o)}`),!1}return!0}#es(){const e=this.#r?.poll()??null;e!==null&&(this.#Je=e,this.#Le=e.age,this.#Ot=e.instant),this.#Le++;const{phase:t,run:i}=this.#Je;t===0||this.#Le>Math.ceil(G*Math.max(1,this.#e.playbackRate))?this.#N=A:this.#N={phase:(t-1+this.#Le)%G+1,run:i}}#ts(e){const t=[],i=this.#r?.metrics??new Float32Array(0);for(let r=0;r<v.phase;r++){const h=i[r*4]??0,o=i[r*4+1]??0,l=i[r*4+2]??0;t.push(`${h.toFixed(3)},${o.toString().padStart(4)},${l.toFixed(3)}`)}const s=this.#dt.map((r,h)=>`${h===0?"-":h}:${r}`).join(" ");return`frame=${e} phase=${this.#N.phase} run=${this.#N.run} known=${this.#Je.phase}/${this.#Je.run} age=${this.#Le} ${this.#$?"film":"video"} period=${this.#D.toFixed(3)}
${t.join(" ")}
${s} dropped:${this.#mt}`}#At(e,t){const i=t-performance.timeOrigin;return Number.isFinite(i)&&i!==0?e+i:e}#is(e,t){const i=e.expectedDisplayTime;if(!Number.isFinite(i)||i<=0||!Number.isFinite(e.timeOrigin))return t;const s=this.#At(i,e.timeOrigin),r=ut*Math.max(this.#F,this.#D);return s<t-r||s>t+r?t:s}#ss=(e,t)=>{if(!this.#M||this.#te)return;this.#ni();const i=this.#At(e,t.timeOrigin),{frame:s,picture:r,...h}=t;this.#we=s??this.#e,this.#R=r??null;try{this.#rs(i,h,s)}finally{this.#we=this.#e,this.#R=null}this.#ht()};#rs(e,t,i){if(this.#g==="active"){this.#ji(e,t,i);return}this.#g!=="starting"&&this.#Pt(e,t)}ingestExternalFrame(e,t,i){this.#we=i;try{this.#Pt(e,t)}finally{this.#we=this.#e}}#ns(e){try{ke(e),this.#p||this.#us()}catch(r){throw this.#ie(e.data),r}if(this.#Kt++,this.#hs(e.displayWidth,e.displayHeight),!this.#M){this.#ie(e.data);return}if(this.#g==="starting"||this.#g==="active"){this.#ls(e);return}if(this.#pt&&e.timestamp<this.#ue[this.#T].timestamp+X){this.#Qt(e.timestamp+e.duration),this.#ie(e.data);return}const t=this.#ge;let i=t.length;for(;i>0&&t[i-1].timestamp>e.timestamp;)i--;t.splice(i,0,e),this.#jt(this.#j.at(performance.now()));const s=Math.ceil(dt*Math.max(1,this.#e.playbackRate));for(;t.length>s;)this.#b.queueResetted++,this.#ie(t.pop().data);this.#le=Math.max(this.#le,t.length)}#hs(e,t){if(!(e===this.#st&&t===this.#rt)){if(this.#st=e,this.#rt=t,this.#C||this.#Y){this.#$e();return}this.#qt??=this.#e.style.aspectRatio,this.#e.style.aspectRatio=`${e} / ${t}`,this.#os(),this.#e.dispatchEvent(new Event("resize"))}}#os(){if(this.#Et)return;this.#Et=!0;const e=this.#e;Object.defineProperty(e,"videoWidth",{configurable:!0,get:()=>this.#st}),Object.defineProperty(e,"videoHeight",{configurable:!0,get:()=>this.#rt}),Object.defineProperty(e,"getVideoPlaybackQuality",{configurable:!0,value:()=>({creationTime:performance.now(),totalVideoFrames:this.#Kt,droppedVideoFrames:this.#b.missed+this.#b.queueResetted+this.#Yt,corruptedVideoFrames:0})})}#as(){if(!this.#Et)return;this.#Et=!1;const e=this.#e;delete e.videoWidth,delete e.videoHeight,delete e.getVideoPlaybackQuality}#ls(e){const t=++this.#Vi;try{this.#x.postMessage({type:"picture",id:t,picture:e},[e.data])}catch(i){throw this.#ie(e.data),i}this.#xt.set(t,e.data)}#wt(){const e=[...this.#xt.values()];this.#xt.clear();for(const t of e)this.#ie(t)}#us(){this.#et=new Ue(this.#s),this.#p=!0,this.#oe(),this.#c.cancel(),this.#oi(),this.#y=0,this.#A(),this.#z(),this.#u=null,this.#B=0,this.#V=0,this.#j.hold(),this.#Tt(),this.#Fe()}#ie(e){const t=this.decodedVideo.onrelease;if(t!==null)try{t(e)}catch(i){queueMicrotask(()=>{throw i})}}#yi(){if(!this.#p)return;this.#x?.postMessage({type:"pictures",action:"reset"});const e=this.#ge;this.#ge=[],this.#Wt=!1,this.#pt=!1,this.#Ue=!1,this.#tt=!1,this.#y=0,this.#A(),this.#ce=null,this.#Ne=null,this.#Ht=Number.NEGATIVE_INFINITY,this.#it=1,this.#z(),this.#O=0,this.#j.hold();for(const t of e)this.#ie(t.data)}#jt(e){const t=this.#ge;for(;t.length>2&&t[2].timestamp<=e;){const i=t.shift();this.#Qt(i.timestamp+i.duration),this.#ie(i.data)}}#St(e){return!(e<=this.#j.origin+X)}#Qt(e){this.#St(e)&&this.#b.missed++}#Ri(e){const t=this.#e;this.#j.observe(e,t.currentTime,t.playbackRate,!t.paused&&!t.seeking&&!t.ended)&&(this.#b.resynced++,this.#it=1)}observeMediaClock(e,t){this.#Ri(this.#At(e,t))}#cs(){this.#x?.postMessage({type:"clock",video:this.#Rt(),at:performance.now(),timeOrigin:performance.timeOrigin})}#fs(){const e=this.#e;this.#C||this.#Ri(performance.now());const t=this.#j.rate,i=this.#j.at(this.#se+this.#F);if(Number.isNaN(i))return;const s=this.#ee;this.#ds(i,t),this.#X(s)&&this.#bs(i,t,e.paused)}#ds(e,t){const i=this.#ee,s=ft*this.#F*Math.max(1,t)/1e3;for(this.#jt(e);;){const o=this.#ge[0];if(o===void 0||o.timestamp>e+s+o.duration||(o.width===this.#B&&o.height===this.#V?this.#wi():F)<this.#ms(o))break;if(this.#ge.shift(),this.#ps(o,e,t),!this.#X(i))return;this.#jt(e)}if(!this.#Ue||this.#tt||this.#ge.length>0||this.#wi()<this.#_i())return;const r=this.#ue[this.#T],h=I*t/1e3;(this.#Wt||r.timestamp<=e+h)&&(this.#Jt(!0,e,t),this.#tt=!0)}#_i(){return this.#I&&!this.#$?2:1}#ms(e){const t=!e.interlaced||!this.#_e;return(this.#Ue?this.#_i():0)+(t?1:0)}#Ai(e){const t=this.#a[e];if(t===void 0)return!1;const i=this.#u;if(i?.kind==="texture"&&i.texture===t.texture||this.#ce?.slot===e||this.#Ne?.slot===e)return!1;for(const s of this.#Be)if(s.slot===e)return!1;return!0}#wi(){let e=0;for(let t=0;t<this.#a.length;t++)this.#Ai(t)&&e++;return e}#Si(){for(let e=1;e<=F;e++){const t=(this.#E+e)%F;if(this.#Ai(t))return t}return null}#ps(e,t,i){const s=this.#pt?this.#ue[this.#T]:null,r=s===null?0:s.timestamp+s.duration,h=e.width!==this.#B||e.height!==this.#V,o=s===null||h||e.timestamp<r-X||e.timestamp-r>W,l=!o&&e.timestamp-r>X,c=!e.interlaced||!this.#_e,a=this.#Ue,d=this.#tt;this.#Ue=!1,this.#tt=!1,a&&!d&&(o||c)&&!h&&this.#Jt(!0,t,i),o?(s!==null&&this.#b.discontinuities++,this.#y=0,this.#z(),this.#O=0):s!==null&&!c&&s.interlaced&&s.topFieldFirst!==e.topFieldFirst&&this.#z(!0);const m=performance.now();this.#ci(m),this.#Ye=m;const u=this.#ee,f=this.#_t(!1);try{if(h&&(this.#mi(e.width,e.height),this.#a.length!==F))throw new Error("decoded pictures have no output textures");this.#vs(e)}catch(p){this.#fe(f),this.#gt(p instanceof Error?p.message:String(p)),this.stop();return}finally{this.#ie(e.data)}if(c)e.interlaced||(this.#O>0&&this.#O--,this.#Ze=!0),this.#Es(),this.#y=0;else{if(a&&!o){const p=this.#ue[(this.#T+b-1)%b];this.#Vt=p.topFieldFirst,this.#Mi(),this.#X(u)&&this.#Ci(l?1:0,Math.round(p.timestamp*1e3),this.#I),this.#X(u)&&this.#Jt(!1,t,i)}else this.#Gt=l;this.#Ze=!1,this.#Ue=!0}if(!this.#X(u)){this.#Y||this.#fe(f);return}this.#fe(f),this.#Ee+=performance.now()-m,this.#he++,this.#fi(m)}#vs(e){this.#T=(this.#T+1)%b,this.#et.convert(e,this.#n[this.#T]);const t=this.#ue[this.#T];t.timestamp=e.timestamp,t.duration=e.duration,t.interlaced=e.interlaced,t.topFieldFirst=e.topFieldFirst,t.repeatFirstField=e.repeatFirstField,this.#y=Math.min(this.#y+1,b),this.#pt=!0}#Es(){const e=this.#ue[this.#T],t=this.#Si();if(t===null){this.#b.late++;return}this.#E=t,this.#Ii(this.#n[this.#T],!0,this.#a[t].framebuffer),this.#Be.push({slot:t,time:e.timestamp,picture:e.timestamp,end:e.timestamp+e.duration,start:!0,scan:oe(e)})}#Jt(e,t,i){const s=this.#ue[e?this.#T:(this.#T+b-1)%b],r=this.#Be;for(;r.length>0&&r.at(-1).picture===s.timestamp;)r.pop();this.#Vt=s.topFieldFirst;const h=e?Number.POSITIVE_INFINITY:this.#ue[this.#T].timestamp,o=oe(s),l=s.timestamp+s.duration;let c=!1;if(this.#$&&!e){const a=this.#N.phase;if(a===B){this.#mt++;return}const d=s.timestamp+(he[a]??0)*s.duration;c=this.#Zt(d,d+s.duration*G/ne,h,s.timestamp,l,!0,!1,null,e,o,t,i)!==null}else if(!this.#I)c=this.#Zt(s.timestamp,h,h,s.timestamp,l,!0,!1,null,e,o,t,i)!==null;else{const a=s.repeatFirstField?3:2,d=s.duration/a;let m=null;for(let u=0;u<a;u++){const f=s.timestamp+u*d,p=this.#Zt(f,u+1<a?f+d:h,h,s.timestamp,l,u===0,u===1,u===2?m:null,e,o,t,i);u===0&&(m=p),p!==null&&(c=!0)}}!c&&h<=t&&this.#Qt(l)}#Zt(e,t,i,s,r,h,o,l,c,a,d,m){if(!this.#xs(e,t,i,d,m))return this.#St(t)&&this.#b.late++,null;if(l===null){if(l=this.#Si(),l===null)return this.#b.late++,null;this.#E=l,this.#me(c,o,this.#a[l].framebuffer)}return this.#Be.push({slot:l,time:e,picture:s,end:Number.isFinite(i)?Math.max(t,i):r,start:h,scan:a}),l}#xs(e,t,i,s,r){if(r===0)return i>s;const h=2*I*r/1e3;if(t<=s-h)return!1;const o=this.#F*r/1e3;if(t-e+2*h>=o)return!0;const l=Math.max(0,Math.ceil((e-h-s)/o));return s+l*o<t+h}#bs(e,t,i){const s=this.#Be;let r=0;for(;r<s.length&&!this.#St(s[r].end);)r++;r>0&&s.splice(0,r);let h=-1;if(i){for(let l=0;l<s.length&&s[l].picture<=e;l++)s[l].start&&(h=l);if(h<0){const l=this.#ce,c=this.#Ne;let a=l!==null&&l.picture<=e?l:null;c!==null&&c.picture<=e&&(a===null||c.picture>a.picture)&&(a=c),a!==null&&a!==this.#vt&&this.#Pi(a);return}this.#it=1}else{let l=0;for(;l<s.length&&s[l].time<=this.#Ht;)l++;const c=I*t/1e3;let a=0,d=0;for(let u=l;u<s.length;u++){const f=e-s[u].time;if(f>=c)a++;else if(f>=-c)d++;else break}const m=Math.min(Math.max(this.#it,a),a+d);if(this.#it=m,m===0){s.splice(0,l);return}h=l+m-1;for(let u=l;u<h;u++)this.#St(s[u+1].time)&&this.#b.late++}const o=s[h];s.splice(0,h+1),this.#Pi(o)}#Pi(e){const t=performance.now(),i=this.#_t(!0);this.#li(e.slot),this.#fe(i),this.#Pe+=performance.now()-t,this.#xe++,this.#vt=e,this.#Ht=e.time,!(e===this.#ce||e===this.#Ne)&&(e.start||this.#ce?.picture!==e.picture)&&(this.#Ne=this.#ce,this.#ce=e.start?e:null)}#Pt(e,t){const i=this.#ee;if(this.#X(i)&&(this.#Ts(t.mediaTime),!!this.#X(i)&&t.width>0&&t.height>0)){let s=!1;if(!this.#We&&this.#e.seeking){const f=this.#e.buffered,p=this.#D>=se?this.#D/1e3:O/1e3;for(let x=0;x<f.length;x++)if(t.mediaTime>=f.start(x)&&t.mediaTime<f.end(x)&&Math.abs(t.mediaTime-this.#e.currentTime)<=p){s=!0;break}}if(s&&(this.#We=!0),(this.#B===0||this.#V===0)&&this.#mi(t.width,t.height),!this.#X(i))return;if(this.#k&&!this.#k.interlaced){const f=performance.now();this.#ci(f),this.#Ye=f,this.#O>0&&this.#O--,this.#Ze=!0,this.#_s(),this.#Ee+=performance.now()-f,this.#he++,this.#xe++,this.#fi(f);return}const r=t.mediaTime-this.#ze,h=t.mozTiming,o=s||(h?h.discontinuity||r<0||r>W:r<0||r>W);o&&(this.#y=0,this.#D=0,this.#b.discontinuities++,this.#A(),this.#z(),(s||!this.#Ze)&&(this.#O=0)),this.#Ze=!1;const l=this.#As(t.presentedFrames,o);if(this.#y>0&&t.mediaTime===this.#ze&&(!h||t.presentedFrames===this.#kt))return;if(!o){const f=h?.periodMs??0;f>0?this.#Di(f*(this.#e.playbackRate||1)/1e3,1):this.#y>0&&r>0&&this.#Di(r,l+1)}this.#ze=t.mediaTime,this.#kt=t.presentedFrames;const c=performance.now();this.#ci(c),this.#Ye=c;const a=performance.now(),d=this.#_t(!1);if(this.#Ui(),this.#Mi(),!this.#X(i)){this.#Y||this.#fe(d);return}if(this.#Ci(l,t.presentedFrames,this.#I&&this.#ot()),!this.#X(i)){this.#Y||this.#fe(d);return}const u=this.#is(t,e)+this.#F;if(this.#$)if(this.#ot()){const f=this.#N.phase;if(f===B)this.#mt++,this.#ve++;else{const p=this.#D*G/ne,x=this.#ii(1,e,p),T=he[f]??0,yt=x||this.#re===null?u+p:u+T*this.#D;this.#Mt("film",!1,this.#ei("film",yt,p),p)}}else this.#me(!1,!1,null);else if(this.#I&&this.#ot()){const f=this.#D/2,x=this.#ii(2,e,f)||this.#re===null?u+f*2:u,T=this.#ei("field",x,f);this.#Mt("field",!1,T,f),this.#Mt("field",!0,T+f,f)}else if(this.#ot()){const f=this.#D,x=this.#ii(1,e,f)||this.#re===null?u+f:u;this.#Mt("frame",!1,this.#ei("frame",x,f),f)||(this.#b.late++,this.#me(!1,!1,null))}else this.#b.late+=this.#o.length,this.#A(),this.#me(!1,!1,null);this.#le=Math.max(this.#le,this.#o.length),this.#fe(d),this.#Ee+=performance.now()-a,this.#he++,this.#fi(c)}}#Mi(){if(this.#L&&!this.#Te&&!this.#r)try{this.#bi()}catch(e){this.#Ft(`film detector unavailable: ${e instanceof Error?e.message:String(e)}`)}}#Ci(e,t,i){if(this.#ft=!1,this.#be=!1,this.#Xt=!1,this.#L&&!this.#Te){let s=!1;if(this.#y===b&&e===0)try{this.#es(),this.#Ji(),s=!0}catch(r){this.#Ft(`film detection failed: ${r instanceof Error?r.message:String(r)}`)}else this.#z(!0);this.#dt[this.#N.phase]=(this.#dt[this.#N.phase]??0)+1,this.#$=this.#N.phase!==0&&this.#N.run>=$,this.#$?this.#O=ct:this.#O>0&&this.#O--,this.#ft=s&&!this.#Gt,this.#be=this.#ft&&this.#O>0,this.#Xt=this.#be&&!this.#$&&i&&this.#Zi(),this.#be&&!this.#$&&this.#b.matched++,this.#H&&(this.#pi=this.#ts(t))}this.#Gt=e>0}#X(e){return!this.#Y&&this.#M&&e===this.#ee}#Ts(e){const t=this.#ee;let i;for(let h=this.#Ae.length-1;h>=0;h--){const o=this.#Ae[h];if(o.start<=e+1e-6){i=o;break}}if(i?.codedSize&&(i.codedSize.width!==this.#B||i.codedSize.height!==this.#V)&&this.#mi(i.codedSize.width,i.codedSize.height),!this.#X(t))return;const s=i?.scan;if(!s||this.#k?.interlaced===s.interlaced&&this.#k.topFieldFirst===s.topFieldFirst)return;const r=this.#k?.interlaced;this.#k=s,this.#y=0,this.#A(),this.#Xe()&&(r!==s.interlaced&&(this.#D=0),s.interlaced&&(this.#C||this.#g==="main")?this.#Fe():this.#si(),this.#z())}#ot(){return(this.#I||this.#L)&&this.#D>0&&this.#a.length===F}#Di(e,t){const s=e*1e3/(this.#e.playbackRate||1)/t;s<se||s>O||(this.#D=this.#D>0&&s>this.#D*nt?this.#D+(s-this.#D)*it:s)}#Mt(e,t,i,s){const r=this.#ki();if(r===null)return!1;const h=this.#a[r];if(!h)return!1;for(this.#E=r;this.#o.length>0&&this.#o[0]?.slot===r;)this.#o.shift(),this.#b.late++;this.#me(!1,t,h.framebuffer);const o={slot:r,at:i,duration:s,cadence:e,phase:e==="film"?this.#N.phase:e==="field"?t?2:1:0,droppedBefore:this.#ve};return this.#ve=0,this.#o.push(o),this.#re=o,!0}#ei(e,t,i){if(!(i>0))return t;const s=this.#re,r=this.#F;if(s!==null&&s.cadence===e){const h=s.at+s.duration,o=h-t,l=Math.round(o/r),c=l-this.#G,a=o-l*r;if(l>=0&&c<=1){const d=h+Math.max(-re,Math.min(re,-a*ht));if(c===0)return this.#J=0,d;if(this.#J===0||c>0!=this.#ne>0?(this.#J=0,this.#ne=c):Math.abs(c)<Math.abs(this.#ne)&&(this.#ne=c),++this.#J<ot)return d;const m=this.#ne;return this.#J=0,m<0?(this.#G+=m,d):(this.#b.resynced++,this.#ti(d-m*r))}if(l<0&&this.#G-l<=1)return this.#G-=l,this.#J=0,this.#b.resynced++,this.#ti(t)}return this.#G=0,this.#J=0,s!==null&&this.#b.resynced++,this.#ti(t)}#ti(e){for(let t=this.#o.at(-1);t&&t.at>=e;)this.#o.pop(),this.#b.late++,t=this.#o.at(-1);return e}#ii(e,t,i){const s=this.#o.at(-1),r=(H+1)*Math.max(this.#F,i);if(s&&s.at-t>r)return this.#A(),this.#b.queueResetted++,!0;const h=Math.max(0,this.#o.length+e-H);let o=0,l=0;for(;l<h;){const c=this.#o.shift();if(!c)break;o+=c.duration,l++}for(const c of this.#o)c.at-=o;return this.#b.late+=l,!1}#ki(){const e=this.#u?.kind==="texture"?this.#u.texture:null,t=new Set(this.#o.map(({slot:s})=>s));for(let s=1;s<=F;s++){const r=(this.#E+s)%F,h=this.#a[r];if(h&&h.texture!==e&&!t.has(r))return r}const i=this.#o[0];if(i){const s=this.#a[i.slot];if(s&&s.texture!==e)return i.slot}return null}#Fe(){this.#S===null&&(!this.#M||this.#te||(this.#_=0,this.#S=this.#Ge(this.#ri)))}#si(){this.#Ct(this.#S),this.#S=null,this.#A()}#ri=e=>{if(this.#S=null,!this.#M||this.#te)return;this.#gs(e);const t=this.#ee;if(this.#p)this.#C||this.#g==="main"?this.#fs():this.#cs();else{if(this.#c.flush(e),!this.#X(t))return;this.#g==="main"&&this.#ys(this.#se,e)}this.#X(t)&&(this.#S=this.#Ge(this.#ri))};#gs(e){const t=e-this.#_;this.#_=e;const i=Math.max(1,Math.round(t/this.#F)),s=this.#se+i*this.#F,r=e-s;if(this.#se===0||t<=0||t>O||Math.abs(r)>this.#F/4){t>=1&&t<=O&&(this.#F=t),this.#se=e;return}this.#F+=r/i*at,this.#se=s+r*lt}#Li(){const e=this.#C;if(e)return{frames:e,origin:performance.timeOrigin};const t=this.#i.ownerDocument?.defaultView??this.#e.ownerDocument?.defaultView??null;return t===null?{frames:vt,origin:performance.timeOrigin}:{frames:t,origin:t.performance.timeOrigin}}#Ge(e){const{frames:t,origin:i}=this.#Li(),s=t.requestAnimationFrame(r=>e(this.#At(r,i)));return{frames:t,handle:s}}#Ct(e){e?.frames.cancelAnimationFrame(e.handle)}#ni(){if(this.#C)return;this.#Fs();const{frames:e}=this.#Li(),t=this.#S!==null&&this.#S.frames!==e,i=this.#f!==null&&this.#f.frames!==e;!t&&!i||(this.#_=0,t&&(this.#Ct(this.#S),this.#S=this.#Ge(this.#ri)),i&&(this.#Ct(this.#f),this.#f=this.#Ge(this.#ai)))}#Fs(){const e=this.#C?null:this.#i.ownerDocument??null;e!==this.#P&&(this.#P?.removeEventListener("visibilitychange",this.#hi),this.#P=e,e?.addEventListener("visibilitychange",this.#hi),this.#U?.disconnect(),e&&this.#U?.observe(e,{childList:!0,subtree:!0}))}#hi=()=>{this.#Y||this.#ni()};#Dt(){this.#C||this.#p||this.#f!==null||!this.#c.captureDriven||!this.#M||this.#te||(this.#f=this.#Ge(this.#ai))}#oi(){this.#Ct(this.#f),this.#f=null}#ai=e=>{if(this.#f=null,!this.#M||this.#te)return;const t=this.#ee;this.#c.flush(e),this.#X(t)&&this.#c.captureDriven&&(this.#f=this.#Ge(this.#ai))};#ys(e,t){const i=this.#F/2,s=l=>{const c=l.at-e;return c<=i-I?!0:c>i+I?!1:this.#Q>0};for(;this.#o[1]&&s(this.#o[1]);)this.#b.late++,this.#o.shift();const r=this.#o[0];if(!r||!s(r))return;this.#o.shift(),this.#Q=r.at-e;const h=performance.now(),o=this.#_t(!0);this.#li(r.slot),this.#fe(o),this.#Pe+=performance.now()-h,this.#xe++,this.#H&&this.#Rs(r,t),this.#q=t}#Rs(e,t){const i=this.#q===0?0:t-this.#q,s=i/this.#F,r=e.cadence==="film"?`phase ${e.phase}`:e.cadence==="field"?`field ${e.phase}`:"frame",h=e.phase===0?"duplicate":`phase ${B}`,o=e.droppedBefore>0?`, ${h} dropped before it`+(e.droppedBefore>1?` (${e.droppedBefore})`:""):"";console.log(`yadif: +${i.toFixed(2)} ms (${s.toFixed(2)} refreshes) ${e.cadence} ${r}, due ${(e.at-t).toFixed(2)} ms${o}`)}#li(e){const t=this.#a[e];t&&this.#ui(t.texture)}#_s(){this.#Ui();const e=this.#n[this.#T];e&&this.#ui(e,!0),this.#y=0}#de(e){if(this.#C){this.#C.onVisibility(e);return}this.#i.style.visibility=e?"visible":"hidden"}#ui(e,t=!1,i=!0){this.#Ii(e,t,null),this.#u={kind:"texture",texture:e,flip:t},this.#de(!0),i&&this.#Z++}#Ii(e,t,i){const s=this.#s;s.bindFramebuffer(s.FRAMEBUFFER,i),s.useProgram(this.#d),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this.#m,0),s.uniform1i(this.#w,t?1:0),s.viewport(0,0,this.#B,this.#V),s.drawArrays(s.TRIANGLES,0,3)}#As(e,t){let i=0;return this.#Ke!==0&&!t&&(i=Math.max(0,e-this.#Ke-1),this.#b.missed+=i),this.#Ke=e,i}#ci(e){e-this.#Ye<=ie||(this.#ut=e,this.#he=0,this.#Ee=0,this.#xe=0,this.#Pe=0,this.#le=0,this.#Z=0,this.#je=0,this.#De=0,this.#Qe=0,this.#ke=0)}#fi(e){const t=e-this.#ut;if(t<ie)return;const i=!this.#p&&this.#ot()&&(this.#I||this.#$)?this.#xe:this.#he,s=this.#he?(this.#Ee+this.#Pe)/this.#he:0;let r;this.#Me!=null&&(r=0,this.#De!==0&&(r+=this.#je/1e6/this.#De),this.#ke!==0&&(r+=this.#Qe/1e6/this.#ke/2));const h={...this.#b,dropped:this.#e.getVideoPlaybackQuality?.().droppedVideoFrames??0,fps:i*1e3/t,frameMs:s,maxQueuedFields:this.#le,outputFps:this.#Z*1e3/t,gpuMs:r,film:this.#$,oneInstant:this.#Ot,filmError:this.#Te};this.dispatchEvent(new CustomEvent("stats",{detail:h})),this.#Lt?.(h),this.#ut=e,this.#he=0,this.#Ee=0,this.#xe=0,this.#Pe=0,this.#le=0,this.#Z=0,this.#je=0,this.#De=0,this.#Qe=0,this.#ke=0}#Ui(){const e=this.#s;this.#T=(this.#T+1)%b;const t=this.#R,i=this.#n[this.#T];t!==null&&this.#v!==null&&i!==void 0?(this.#n[this.#T]=this.#v.adopt(t,i),this.#R=null):(e.bindTexture(e.TEXTURE_2D,i??null),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.#we)),this.#y=Math.min(this.#y+1,b)}#me(e,t,i,s=!0){if(this.#y===0||this.#te)return;s&&(this.#y===b&&!e?this.#b.filtered++:this.#b.degraded++);const r=this.#s,{prev:h,cur:o,next:l}=this.#di(e);r.bindFramebuffer(r.FRAMEBUFFER,i),r.useProgram(this.#l);for(const[p,x]of[h,o,l].entries())r.activeTexture(r.TEXTURE0+p),r.bindTexture(r.TEXTURE_2D,this.#n[x]??null);r.uniform1i(this.#h.prev,0),r.uniform1i(this.#h.cur,1),r.uniform1i(this.#h.next,2);const c=this.#L?this.#r?.texture??null:null,a=this.#L?this.#r?.combTexture??null:null,d=c!==null&&a!==null;c!==null&&a!==null&&(r.activeTexture(r.TEXTURE0+3),r.bindTexture(r.TEXTURE_2D,c),r.uniform1i(this.#h.fieldMetrics,3),r.activeTexture(r.TEXTURE0+4),r.bindTexture(r.TEXTURE_2D,a),r.uniform1i(this.#h.comb,4));const m=this.#Xt?this.#r?.combAheadTexture??null:null,u=d&&!e;r.activeTexture(r.TEXTURE0+5),r.bindTexture(r.TEXTURE_2D,m),r.uniform1i(this.#h.combAhead,5),r.activeTexture(r.TEXTURE0),r.uniform2i(this.#h.size,this.#B,this.#V);const f=this.#bt?0:1;r.uniform1i(this.#h.parity,t?1-f:f),r.uniform1i(this.#h.tff,this.#bt?1:0),r.uniform1i(this.#h.second,t?1:0),r.uniform1i(this.#h.spatialCheck,this.#K?1:0),r.uniform1i(this.#h.debug,this.#H?1:0),r.uniform1i(this.#h.film,d?1:0),r.uniform1i(this.#h.match,u&&this.#be&&(!t||m!==null)?1:0),r.uniform1i(this.#h.instant,u&&this.#ft?1:0),r.uniform1i(this.#h.phase,this.#N.phase),r.viewport(0,0,this.#B,this.#V),r.drawArrays(r.TRIANGLES,0,3),this.#H&&d&&this.#Qi(this.#pi,0,90),i===null&&(this.#u={kind:"yadif",flush:e,second:t},this.#de(!0),s&&this.#Z++)}#di(e){const t=i=>(this.#T+b-i)%b;return this.#y===1?{prev:this.#T,cur:this.#T,next:this.#T}:e?{prev:t(1),cur:this.#T,next:this.#T}:this.#y===2?{prev:t(1),cur:t(1),next:this.#T}:{prev:t(2),cur:t(1),next:this.#T}}#$e(){if(this.#ni(),!this.#W)return;const e=this.#e,t=this.#p?this.#st:e.videoWidth,i=this.#p?this.#rt:e.videoHeight;if(t===0||i===0)return;const s=Math.min(e.offsetWidth/t,e.offsetHeight/i),r=t*s,h=i*s;this.#i.style.left=`${e.offsetLeft+(e.offsetWidth-r)/2}px`,this.#i.style.top=`${e.offsetTop+(e.offsetHeight-h)/2}px`,this.#i.style.width=`${r}px`,this.#i.style.height=`${h}px`}#mi(e,t){const i=this.#s;this.#t.width=e,this.#t.height=t,this.#B=e,this.#V=t,this.#y=0,this.#O=0,this.#u=null,this.#A(),this.#$e();for(const s of this.#n)i.deleteTexture(s);this.#n=[];for(let s=0;s<b;s++){const r=i.createTexture();i.bindTexture(i.TEXTURE_2D,r),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e,t,0,i.RGBA,i.UNSIGNED_BYTE,null),this.#n.push(r)}this.#at(),(this.#I||this.#L||this.#p)&&this.#Bi(),this.#et?.resize(e,t),this.#r?.resize(e,t),this.#Xe()}#Bi(){const e=this.#s;if(!(this.#a.length===F||this.#B===0)){this.#at();for(let t=0;t<F;t++){const i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,this.#B,this.#V,0,e.RGBA,e.UNSIGNED_BYTE,null);const s=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0);const r=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!r){e.deleteFramebuffer(s),e.deleteTexture(i),this.#at();return}this.#a.push({texture:i,framebuffer:s})}this.#E=F-1}}#at(){const e=this.#s,t=this.#u?.kind==="texture"?this.#u.texture:null;this.#a.some(i=>i.texture===t)&&(this.#u=null),this.#vt=null,this.#ce=null,this.#Ne=null;for(const{texture:i,framebuffer:s}of this.#a)e.deleteFramebuffer(s),e.deleteTexture(i);this.#a=[],this.#A()}#ws(){if(this.#W)return;const e=this.#e.parentElement;if(!e)return;const t=document.createElement("div");t.style.cssText="position:relative;display:inline-block;line-height:0;max-width:100%",e.insertBefore(t,this.#e),t.appendChild(this.#e),t.appendChild(this.#i),this.#W=t,this.#Re?.observe(this.#e),this.#$e()}#Ss(){if(this.#C)return;const e=this.#W;this.#W=null,this.#Re?.disconnect(),this.#i.remove(),e?.parentElement&&(e.parentElement.insertBefore(this.#e,e),e.remove())}#Ni=()=>this.#$e();#ye(e){return!this.#x||this.#g==="main"?!1:(this.#x.postMessage({type:"event",name:e,video:this.#Rt()}),!0)}#Oi=()=>{if(this.#p){this.#j.hold(),this.#ye("emptied");return}if(this.#ye("emptied")){this.#oe(),this.#de(!1);return}this.#y=0,this.#ze=0,this.#kt=0,this.#A(),this.#z(),this.#O=0,this.#D=0,this.#Xi(),this.#u=null,this.#de(!1)};#Xi(){this.#b={filtered:0,missed:0,degraded:0,discontinuities:0,resynced:0,late:0,queueResetted:0,matched:0},this.#Kt=0,this.#Yt=0,this.#dt.fill(0),this.#mt=0,this.#Ke=0,this.#ut=0,this.#Ye=0,this.#he=0,this.#Ee=0,this.#xe=0,this.#Pe=0,this.#le=0,this.#Z=0,this.#A(),this.#je=0,this.#De=0,this.#Qe=0,this.#ke=0}#Gi=()=>{if(this.#p){this.#j.hold(),this.#ye("seeking");return}if(this.#ye("seeking")){this.#oe();return}this.#We=!1};#pe=e=>{if(this.#p){this.#j.hold(),this.#ye(e.type);return}if(e.type==="ratechange"&&(this.#c.captureDriven?this.#Dt():this.#oi()),(e.type==="pause"||e.type==="ended"||e.type==="seeked"||e.type==="ratechange")&&this.#ye(e.type)){this.#oe();return}if(e.type==="seeked"){const i=this.#We;if(this.#We=!1,i)return;this.#y=0,this.#A(),this.#z(),this.#u=null,this.#de(!1);return}const t=e.type==="ratechange";if(t&&(this.#D=0,this.#ze=this.#e.currentTime),this.#A(),this.#M&&this.#y>0){const i=this.#ki(),s=i===null?void 0:this.#a[i];i!==null&&s?(this.#E=i,this.#me(!0,!1,s.framebuffer),this.#li(i)):this.#me(!0,!1,null)}t&&(this.#y=0,this.#Ke=0,this.#z())};#$i=()=>{this.#p&&(this.#j.hold(),this.#ye("waiting"))};#zi=e=>{if(e.preventDefault(),this.#C){this.#C.onFailure("the deinterlacer WebGL context was lost");return}this.#g!=="active"&&(this.#te=!0,this.#gt("the deinterlacer WebGL context was lost"),this.stop())}}function xt(n,e,t,i,s,r,h){return new Et(n,t,{canvas:e,onFailure:i,onVisibility:s,requestAnimationFrame:r,cancelAnimationFrame:h})}function ae(n,e){const t=n.createProgram(),i=le(n,n.VERTEX_SHADER,rt),s=le(n,n.FRAGMENT_SHADER,e);if(n.attachShader(t,i),n.attachShader(t,s),n.linkProgram(t),n.deleteShader(i),n.deleteShader(s),!n.getProgramParameter(t,n.LINK_STATUS)){const r=n.getProgramInfoLog(t);throw n.deleteProgram(t),new Error(`the deinterlacer failed to link: ${r??"no reason given"}`)}return t}function le(n,e,t){const i=n.createShader(e);if(!i)throw new Error("the deinterlacer could not create a shader");if(n.shaderSource(i,t),n.compileShader(i),!n.getShaderParameter(i,n.COMPILE_STATUS)){const s=n.getShaderInfoLog(i);throw n.deleteShader(i),new Error(`the deinterlacer failed to compile: ${s??"no reason given"}`)}return i}const D=self;class bt extends EventTarget{currentTime=0;playbackRate=1;seeking=!1;paused=!0;ended=!1;readyState=0;videoWidth=0;videoHeight=0;parentElement=null;offsetWidth=0;offsetHeight=0;offsetLeft=0;offsetTop=0;#t=[];update(e){this.currentTime=e.currentTime,this.playbackRate=e.playbackRate,this.seeking=e.seeking,this.paused=e.paused,this.ended=e.ended,this.readyState=e.readyState,this.videoWidth=e.videoWidth,this.videoHeight=e.videoHeight,this.#t=e.buffered}get buffered(){return{length:this.#t.length,start:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.start},end:e=>{const t=this.#t[e];if(!t)throw new DOMException("Invalid range index","IndexSizeError");return t.end}}}getVideoPlaybackQuality(){return{creationTime:performance.now(),droppedVideoFrames:0,totalVideoFrames:0,corruptedVideoFrames:0}}requestVideoFrameCallback(){return 0}cancelVideoFrameCallback(){}}let y=null,E=null,V=!1;const q=new Map;function Tt(n){return D.requestAnimationFrame(n)}function gt(n){D.cancelAnimationFrame(n)}function R(n,e=[]){D.postMessage(n,e)}function Ft(n,e,t){n.doubleRate=e.doubleRate,n.spatialCheck=e.spatialCheck,(n.film!==e.film||t==="film")&&(n.film=e.film),n.debug=e.debug}D.onmessage=n=>{const e=n.data;try{if(e.type==="initialize"){if(typeof D.requestAnimationFrame!="function")throw new Error("requestAnimationFrame is unavailable in this Worker");y=new bt,y.update(e.video),E=xt(y,e.canvas,e.options,s=>{V||R({type:"failed",message:s})},s=>R({type:"visibility",visible:s}),Tt,gt);const t=E;t.decodedVideo.onrelease=s=>{const r=q.get(s);q.delete(s),r!==void 0&&!V&&R({type:"release",id:r,data:s},[s])};let i=0;E.addEventListener("failure",()=>i++),E.addEventListener("stats",s=>{const{dropped:r,...h}=s.detail;R({type:"stats",stats:h,filmFailure:i})}),E.scan=e.scan,E.videoTimeline=e.videoTimeline,E.enabled=e.enabled,R({type:"ready"});return}if(!y||!E)return;switch(e.type){case"frame":y.update(e.video);try{E.ingestExternalFrame(performance.now(),e.metadata,e.frame)}finally{e.frame.close(),R({type:"consumed",id:e.id})}break;case"settings":Ft(E,e.options,e.retryFilm);break;case"scan":E.scan=e.scan;break;case"timeline":E.videoTimeline=e.videoTimeline;break;case"enabled":E.enabled=e.enabled;break;case"running":e.running?E.start():E.stop();break;case"picture":q.set(e.picture.data,e.id),E.decodedVideo.push(e.picture);break;case"pictures":e.action==="reset"?E.decodedVideo.reset():E.decodedVideo.finish();break;case"clock":y.update(e.video),E.observeMediaClock(e.at,e.timeOrigin);break;case"event":y.update(e.video),y.dispatchEvent(new Event(e.name));break;case"capture":y.videoWidth=e.width,y.videoHeight=e.height,E.capture().then(t=>R({type:"capture",id:e.id,image:t},[t])).catch(()=>R({type:"capture",id:e.id,image:null}));break;case"destroy":V=!0,E.destroy(),E=null,y=null,D.close();break}}catch(t){const i=t instanceof Error?t.message:String(t);R({type:"failed",message:i})}}})();
//# sourceMappingURL=worker-tG0fmEpz.js.map
