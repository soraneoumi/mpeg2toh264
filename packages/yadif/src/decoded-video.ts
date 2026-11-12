/**
 * Decoded pictures handed to the deinterlacer from outside, and their
 * conversion to the RGB the filter works on.
 */
import { createProgram, VERTEX_SHADER } from "./utils.js";

/** One decoded picture. */
export interface DecodedPicture {
  /** Presentation time of the picture's first field, in seconds on the media element's timeline. */
  timestamp: number;
  /** How long the picture is presented, in seconds: two field periods, or three with a repeated first field. */
  duration: number;
  /** Visible luma size in samples. */
  width: number;
  height: number;
  /** Size the picture is displayed at after its sample aspect ratio, e.g. 1920x1080 for 1440x1080. */
  displayWidth: number;
  displayHeight: number;
  /** Planar 4:2:0, 8-bit, limited range: Y, then Cb, then Cr. Ownership passes to the renderer. */
  data: ArrayBuffer;
  /** Where each plane starts in `data` and its row stride in bytes. The chroma planes hold ceil(width/2) x ceil(height/2) visible samples. */
  planes: readonly [
    { offset: number; stride: number },
    { offset: number; stride: number },
    { offset: number; stride: number },
  ];
  /** False when both fields of the frame are one instant (MPEG-2 progressive_frame). */
  interlaced: boolean;
  topFieldFirst: boolean;
  repeatFirstField: boolean;
  /** YCbCr matrix of the samples. */
  matrix: "bt709" | "bt601";
}

/** Where decoded pictures enter the deinterlacer. */
export interface DecodedVideoInput {
  /**
   * Hand over a picture. Pictures arrive a little ahead of their time and not
   * necessarily in presentation order (an anchor picture is decoded before
   * the B pictures shown ahead of it); order them by timestamp.
   */
  push(picture: DecodedPicture): void;
  /** Forget everything queued or held: a seek, or a new stream. */
  reset(): void;
  /** No more pictures will come; present what is queued. */
  finish(): void;
  /**
   * Set by the producer. Called with a picture's `data` once the renderer no
   * longer needs it, so the buffer can be reused. Every pushed buffer comes
   * back exactly once, including on reset(), finish(), stop and destroy.
   */
  onrelease: ((data: ArrayBuffer) => void) | null;
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Throw if the picture's fields or its planes do not describe a picture inside `data`. */
export function checkPicture(picture: DecodedPicture): void {
  const {
    timestamp,
    duration,
    width,
    height,
    displayWidth,
    displayHeight,
    data,
    planes,
    matrix,
  } = picture;
  if (
    !Number.isFinite(timestamp) ||
    !(duration > 0) ||
    !Number.isFinite(duration)
  )
    throw new TypeError(`invalid picture timing ${timestamp}+${duration}`);
  if (!positiveInteger(width) || !positiveInteger(height))
    throw new TypeError(`invalid picture size ${width}x${height}`);
  if (!(displayWidth > 0) || !(displayHeight > 0))
    throw new TypeError(
      `invalid display size ${displayWidth}x${displayHeight}`,
    );
  if (matrix !== "bt709" && matrix !== "bt601")
    throw new TypeError(`unknown matrix ${String(matrix)}`);
  if (planes.length !== 3) throw new TypeError("a picture has three planes");
  for (let index = 0; index < 3; index++) {
    const columns = index === 0 ? width : Math.ceil(width / 2);
    const rows = index === 0 ? height : Math.ceil(height / 2);
    const { offset, stride } = planes[index]!;
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(stride) ||
      stride < columns ||
      offset + stride * (rows - 1) + columns > data.byteLength
    )
      throw new TypeError(
        `plane ${index} at ${offset} with stride ${stride} does not fit ${columns}x${rows} samples in ${data.byteLength} bytes`,
      );
  }
}

function coefficients(kr: number, kb: number): Float32Array {
  const kg = 1 - kr - kb;
  return Float32Array.of(
    2 * (1 - kr),
    (2 * (1 - kb) * kb) / kg,
    (2 * (1 - kr) * kr) / kg,
    2 * (1 - kb),
  );
}

/**
 * Coefficients of limited-range YCbCr to RGB, from each matrix's Kr and Kb:
 * Cr in R, Cb and Cr in G, and Cb in B, as `uMatrix` takes them.
 */
export const MATRIX_COEFFICIENTS: Readonly<
  Record<DecodedPicture["matrix"], Float32Array>
> = {
  bt709: coefficients(0.2126, 0.0722),
  bt601: coefficients(0.299, 0.114),
};

/**
 * Conversion of one picture to RGB, one output texel per luma sample, rows
 * from the top as the history textures hold them.
 *
 * Chroma is interpolated linearly from the four nearest chroma samples of the
 * right rows. Horizontally a chroma sample sits on an even luma column
 * (H.262 6.1.1.8). Vertically, in a progressive picture chroma row c sits
 * between luma rows 2c and 2c + 1. In an interlaced picture the chroma rows
 * alternate between the fields as the luma rows do, and a luma row takes its
 * chroma from its own field only: within a field, chroma row k sits at field
 * row 2k + 1/4 in the top field and 2k + 3/4 in the bottom field (H.262
 * Figures 6-2 and 6-3), which puts it where it would be in a progressive
 * frame. Taking rows of the other field would mix two instants wherever
 * anything moves.
 *
 * The functions before `main` use only scalar arithmetic, shifts and the
 * helpers they call, so that a test can evaluate them outside a GPU.
 */
export const PICTURE_FRAGMENT_SHADER = `#version 300 es
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

/** Uploads decoded pictures and converts them into RGBA textures of the same size. */
export class PictureConverter {
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #luma: WebGLUniformLocation | null;
  readonly #cb: WebGLUniformLocation | null;
  readonly #cr: WebGLUniformLocation | null;
  readonly #interlaced: WebGLUniformLocation | null;
  readonly #matrix: WebGLUniformLocation | null;
  readonly #framebuffer: WebGLFramebuffer;
  #planes: WebGLTexture[] = [];
  #width = 0;
  #height = 0;
  /** Whether the target format was found renderable since the last resize. */
  #checked = false;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#program = createProgram(gl, PICTURE_FRAGMENT_SHADER, VERTEX_SHADER);
    this.#luma = gl.getUniformLocation(this.#program, "uLuma");
    this.#cb = gl.getUniformLocation(this.#program, "uCb");
    this.#cr = gl.getUniformLocation(this.#program, "uCr");
    this.#interlaced = gl.getUniformLocation(this.#program, "uInterlaced");
    this.#matrix = gl.getUniformLocation(this.#program, "uMatrix");
    this.#framebuffer = gl.createFramebuffer();
  }

  /** Allocate the plane textures for pictures of this luma size. */
  resize(width: number, height: number): void {
    const gl = this.#gl;
    for (const texture of this.#planes) gl.deleteTexture(texture);
    this.#planes = [];
    for (let index = 0; index < 3; index++) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(
        gl.TEXTURE_2D,
        1,
        gl.R8,
        index === 0 ? width : Math.ceil(width / 2),
        index === 0 ? height : Math.ceil(height / 2),
      );
      this.#planes.push(texture);
    }
    this.#width = width;
    this.#height = height;
    this.#checked = false;
  }

  /**
   * Upload the picture's planes and draw its RGB into `target`, a texture of
   * the size last given to resize(). Throws if `target` cannot be drawn into.
   */
  convert(picture: DecodedPicture, target: WebGLTexture): void {
    const gl = this.#gl;
    const bytes = new Uint8Array(picture.data);
    // Rows are as long as the stride says and start on any byte.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (let index = 0; index < 3; index++) {
      const { offset, stride } = picture.planes[index]!;
      gl.bindTexture(gl.TEXTURE_2D, this.#planes[index]!);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, stride);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        index === 0 ? this.#width : Math.ceil(this.#width / 2),
        index === 0 ? this.#height : Math.ceil(this.#height / 2),
        gl.RED,
        gl.UNSIGNED_BYTE,
        bytes,
        offset,
      );
    }
    // Other uploads into this context expect the defaults.
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      target,
      0,
    );
    if (!this.#checked) {
      if (
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
      ) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        throw new Error("decoded pictures cannot be drawn into RGBA8");
      }
      this.#checked = true;
    }
    gl.useProgram(this.#program);
    for (let index = 0; index < 3; index++) {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, this.#planes[index]!);
    }
    gl.uniform1i(this.#luma, 0);
    gl.uniform1i(this.#cb, 1);
    gl.uniform1i(this.#cr, 2);
    gl.uniform1i(this.#interlaced, picture.interlaced ? 1 : 0);
    gl.uniform4fv(this.#matrix, MATRIX_COEFFICIENTS[picture.matrix]);
    gl.viewport(0, 0, this.#width, this.#height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Leave unit 0 active, which every other draw rebinds.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  destroy(): void {
    const gl = this.#gl;
    for (const texture of this.#planes) gl.deleteTexture(texture);
    this.#planes = [];
    gl.deleteFramebuffer(this.#framebuffer);
    gl.deleteProgram(this.#program);
  }
}
