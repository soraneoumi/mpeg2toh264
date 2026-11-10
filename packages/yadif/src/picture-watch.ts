import { VERTEX_SHADER, createProgram } from "./utils.js";
import type { Pictures } from "./video-frame.js";

/** Source texels along each side of the square one comparison cell covers. */
const BLOCK = 16;

/**
 * Textures this may create. Two are in use on every refresh, the newest take
 * and the one awaiting its verdict; the rest cover verdicts that arrive late.
 * With none left a refresh goes without a take.
 */
const TEXTURE_LIMIT = 6;

const COMPARE_FRAGMENT_SHADER = `#version 300 es
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
  ivec2 origin = ivec2(gl_FragCoord.xy) * ${BLOCK};
  vec3 difference = vec3(0.0);
  for (int y = 0; y < ${BLOCK}; y++) {
    for (int x = 0; x < ${BLOCK}; x++) {
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

interface Take {
  id: number;
  texture: WebGLTexture;
  width: number;
  height: number;
  /** Whether the picture differs from the take before it; null until known. */
  changed: boolean | null;
  fence: WebGLSync | null;
  buffer: ReadbackBuffer | null;
  reported: boolean;
}

interface ReadbackBuffer {
  buffer: WebGLBuffer;
  bytes: number;
}

interface Target {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

/**
 * Tells the pictures of a video element apart by looking at them.
 *
 * Firefox gives no dependable notice of a new picture. The element's current
 * picture is replaced by the media sink on the audio clock, at a moment that
 * has nothing to do with the display's refresh. `mozPaintedFrames` counts
 * what the compositor has painted and trails that moment by up to a refresh,
 * so the picture read when the count goes up may already be the next one,
 * which the next count then delivers again while the picture between is
 * never read. requestVideoFrameCallback() names frames exactly but is not
 * called for every one of them. What can be relied on is the picture itself:
 * texImage2D() reads whichever one is current. Taking it on every refresh and
 * comparing it with the take before finds each picture exactly once, for as
 * long as a picture lasts at least a refresh.
 *
 * The comparison runs on the GPU and its result comes back through a pixel
 * buffer behind a fence. Reading it back at once would hold the calling
 * thread until the GPU process had caught up, on every refresh; measured in
 * Firefox that was about 3 ms against 0.3 ms this way. A verdict is therefore
 * known a refresh or more after its take, and the take keeps its texture
 * until then. A new picture hands that texture to the filter: reading the
 * element again by then could return a later picture.
 *
 * Two pictures with the same pixels cannot be told apart, and the second is
 * reported as no change.
 */
export class PictureWatch implements Pictures {
  readonly #gl: WebGL2RenderingContext;
  readonly #video: HTMLVideoElement;
  #program: WebGLProgram | null = null;
  #target: Target | null = null;
  /** Textures free to take the next picture. */
  #textures: WebGLTexture[] = [];
  #created = 0;
  /** Readback buffers free for the next comparison. */
  #buffers: ReadbackBuffer[] = [];
  #cells = new Uint8Array(0);
  /** Takes in order, from the oldest still held. */
  #takes: Take[] = [];
  /** The newest take, which the next one is compared with. */
  #reference: Take | null = null;
  #id = 0;

  constructor(gl: WebGL2RenderingContext, video: HTMLVideoElement) {
    this.#gl = gl;
    this.#video = video;
  }

  take(): number | null {
    const gl = this.#gl;
    const texture = this.#textures.pop() ?? this.#createTexture();
    if (texture === null) return null;
    const width = this.#video.videoWidth;
    const height = this.#video.videoHeight;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.#video,
      );
    } catch (error) {
      this.#textures.push(texture);
      throw error;
    }
    const take: Take = {
      id: ++this.#id,
      texture,
      width,
      height,
      changed: null,
      fence: null,
      buffer: null,
      reported: false,
    };
    const reference = this.#reference;
    if (
      reference === null ||
      reference.width !== width ||
      reference.height !== height
    ) {
      // Nothing of the same shape to compare with: it is a new picture.
      take.changed = true;
    } else {
      this.#compare(take, reference);
    }
    // The take before stays held until its own verdict has been dealt with.
    this.#reference = take;
    this.#takes.push(take);
    return take.id;
  }

  settle(): { id: number; changed: boolean } | null {
    const gl = this.#gl;
    const take = this.#takes.find((candidate) => !candidate.reported);
    // The newest take is still read by the comparison that follows it, so it
    // stays here until that has been issued; its texture cannot go to the
    // filter, which is free to delete what it owns, while that is pending.
    if (take === undefined || take === this.#reference) return null;
    if (take.changed === null) {
      const { fence, buffer } = take;
      if (fence === null || buffer === null) return null;
      const status = gl.clientWaitSync(fence, 0, 0);
      if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED)
        return null;
      if (this.#cells.byteLength < buffer.bytes)
        this.#cells = new Uint8Array(buffer.bytes);
      const cells = this.#cells.subarray(0, buffer.bytes);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer.buffer);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, cells);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      take.changed = differs(cells);
      this.#finishComparison(take);
    }
    take.reported = true;
    return { id: take.id, changed: take.changed };
  }

  /**
   * Hand the texture of a take to the caller in exchange for one it no longer
   * needs, which becomes free for a later take.
   */
  adopt(id: number, replacement: WebGLTexture): WebGLTexture {
    const index = this.#takes.findIndex((take) => take.id === id);
    const take = this.#takes[index];
    if (take === undefined || !take.reported)
      throw new Error(`picture ${id} is not available to adopt`);
    this.#takes.splice(index, 1);
    this.#textures.push(replacement);
    return take.texture;
  }

  release(id: number): void {
    const index = this.#takes.findIndex((take) => take.id === id);
    const take = this.#takes[index];
    // An adopted take has already left.
    if (take === undefined) return;
    this.#takes.splice(index, 1);
    this.#recycle(take);
  }

  reset(): void {
    // The reference is the newest take, so it is among these.
    const takes = this.#takes;
    this.#takes = [];
    this.#reference = null;
    for (const take of takes) {
      this.#finishComparison(take);
      this.#recycle(take);
    }
  }

  destroy(): void {
    const gl = this.#gl;
    this.reset();
    for (const texture of this.#textures) gl.deleteTexture(texture);
    this.#textures = [];
    this.#created = 0;
    for (const { buffer } of this.#buffers) gl.deleteBuffer(buffer);
    this.#buffers = [];
    this.#freeTarget();
    if (this.#program !== null) gl.deleteProgram(this.#program);
    this.#program = null;
  }

  /** Draw the comparison of a take with the one before it and start its readback. */
  #compare(take: Take, reference: Take): void {
    const gl = this.#gl;
    const width = Math.ceil(take.width / BLOCK);
    const height = Math.ceil(take.height / BLOCK);
    const target = this.#allocateTarget(width, height);
    const buffer = this.#allocateBuffer(width * height * 4);
    this.#program ??= this.#createProgram();
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.useProgram(this.#program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, reference.texture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, take.texture);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer.buffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    take.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    take.buffer = buffer;
    gl.flush();
  }

  /** Give back what a comparison held, whether or not it was read. */
  #finishComparison(take: Take): void {
    const gl = this.#gl;
    if (take.fence !== null) gl.deleteSync(take.fence);
    take.fence = null;
    const buffer = take.buffer;
    take.buffer = null;
    if (buffer === null) return;
    // A buffer sized for an earlier picture is of no use to the next one.
    const target = this.#target;
    if (target !== null && buffer.bytes === target.width * target.height * 4)
      this.#buffers.push(buffer);
    else gl.deleteBuffer(buffer.buffer);
  }

  /**
   * Free the texture of a take that has left. By then a later take has
   * replaced it as the reference, and the comparison that read it is issued.
   */
  #recycle(take: Take): void {
    this.#textures.push(take.texture);
  }

  #createTexture(): WebGLTexture | null {
    if (this.#created === TEXTURE_LIMIT) return null;
    const gl = this.#gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // The same parameters as the filter's own frames: these textures join them.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.#created++;
    return texture;
  }

  #createProgram(): WebGLProgram {
    const gl = this.#gl;
    const program = createProgram(gl, COMPARE_FRAGMENT_SHADER, VERTEX_SHADER);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "uTake"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uReference"), 1);
    return program;
  }

  #allocateTarget(width: number, height: number): Target {
    const gl = this.#gl;
    const current = this.#target;
    if (current?.width === width && current.height === height) return current;
    this.#freeTarget();
    for (const { buffer } of this.#buffers) gl.deleteBuffer(buffer);
    this.#buffers = [];
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const target = { framebuffer, texture, width, height };
    this.#target = target;
    return target;
  }

  #freeTarget(): void {
    const gl = this.#gl;
    if (this.#target === null) return;
    gl.deleteFramebuffer(this.#target.framebuffer);
    gl.deleteTexture(this.#target.texture);
    this.#target = null;
  }

  #allocateBuffer(bytes: number): ReadbackBuffer {
    const free = this.#buffers.pop();
    if (free !== undefined) return free;
    const gl = this.#gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    // STREAM_COPY for the reason given in the film detector: Chromium keeps
    // an unused shadow copy for READ buffers.
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_COPY);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return { buffer, bytes };
  }
}

/** Whether any cell saw a colour channel differ. Alpha is constant. */
function differs(cells: Uint8Array): boolean {
  for (let index = 0; index < cells.length; index += 4) {
    if (cells[index] !== 0 || cells[index + 1] !== 0 || cells[index + 2] !== 0)
      return true;
  }
  return false;
}
