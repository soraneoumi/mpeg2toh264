/** One triangle over the whole viewport: every pixel is the fragment shader's. */
export const VERTEX_SHADER = `#version 300 es
void main() {
  // From the vertex index alone. There is no geometry here worth a buffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

export function createProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
  vertexSource: string,
): WebGLProgram {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // Attached shaders live as long as the program needs them, and it is the
  // program that holds them now.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(
      `the deinterlacer failed to link: ${log ?? "no reason given"}`,
    );
  }
  return program;
}

/**
 * Draw with `program` once, into a 1×1 framebuffer of `outputs` textures of
 * `format`: as many as the program writes, of the format it writes in use.
 *
 * Linking is not the end of compiling. A driver may compile a program for the
 * GPU only when it is first drawn with, for the framebuffer it is drawn into:
 * Firefox on Windows (ANGLE over Direct3D 11) takes 50-65 ms there for the
 * film detector's larger programs. Done at their first picture, that holds up
 * the frame the picture is due in, and the pictures due meanwhile are passed
 * over; done here, as the program is made, it is part of setting up.
 *
 * Right after linking every sampler reads texture unit 0, which gets a 1×1
 * texture, so that the draw reads nothing incomplete.
 */
export function drawOnce(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  format: GLenum,
  outputs = 1,
): void {
  const input = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 1, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const targets: WebGLTexture[] = [];
  for (let index = 0; index < outputs; index++) {
    const target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, 1, 1);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0 + index,
      gl.TEXTURE_2D,
      target,
      0,
    );
    targets.push(target);
  }
  gl.drawBuffers(targets.map((_, index) => gl.COLOR_ATTACHMENT0 + index));
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.useProgram(program);
  gl.viewport(0, 0, 1, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  for (const target of targets) gl.deleteTexture(target);
  gl.deleteTexture(input);
}

export function compile(
  gl: WebGL2RenderingContext,
  kind: GLenum,
  source: string,
): WebGLShader {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("the deinterlacer could not create a shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(
      `the deinterlacer failed to compile: ${log ?? "no reason given"}`,
    );
  }
  return shader;
}
