// Minimal WebGL2 helpers: context, programs, render targets, fullscreen draw.

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  const extFloat = gl.getExtension('EXT_color_buffer_float');
  const extHalf = extFloat ? null : gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  const caps = {
    floatRT: !!(extFloat || extHalf),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    renderer: '',
  };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) caps.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
  return { gl, caps };
}

function compileShader(gl, type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    console.error(`Shader compile failed (${name}):\n${log}\n${lines}`);
    throw new Error(`Shader compile failed: ${name}`);
  }
  return sh;
}

export class Program {
  constructor(gl, vsSrc, fsSrc, name = 'program') {
    this.gl = gl;
    this.name = name;
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, name + '.vs');
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, name + '.fs');
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      console.error(`Program link failed (${name}): ${log}`);
      throw new Error(`Program link failed: ${name}`);
    }
    this.prog = p;
    this.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const base = info.name.replace(/\[0\]$/, '');
      this.u[base] = gl.getUniformLocation(p, info.name);
    }
  }
  use() { this.gl.useProgram(this.prog); return this; }
  f(name, v) { const l = this.u[name]; if (l) this.gl.uniform1f(l, v); return this; }
  i(name, v) { const l = this.u[name]; if (l) this.gl.uniform1i(l, v); return this; }
  v2(name, x, y) { const l = this.u[name]; if (l) this.gl.uniform2f(l, x, y); return this; }
  v3(name, x, y, z) { const l = this.u[name]; if (l) this.gl.uniform3f(l, x, y, z); return this; }
  v4(name, x, y, z, w) { const l = this.u[name]; if (l) this.gl.uniform4f(l, x, y, z, w); return this; }
  v4a(name, arr) { const l = this.u[name]; if (l) this.gl.uniform4fv(l, arr); return this; }
  tex(name, unit, texture) {
    const l = this.u[name];
    if (l) {
      this.gl.activeTexture(this.gl.TEXTURE0 + unit);
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.uniform1i(l, unit);
    }
    return this;
  }
}

export function createTexture(gl, w, h, opts = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const filter = opts.filter ?? gl.LINEAR;
  const wrap = opts.wrap ?? gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texStorage2D(gl.TEXTURE_2D, 1, opts.internalFormat ?? gl.RGBA8, w, h);
  return tex;
}

export function createTarget(gl, w, h, opts = {}) {
  const tex = createTexture(gl, w, h, opts);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('Framebuffer incomplete', status.toString(16));
    throw new Error('Framebuffer incomplete');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}

export function destroyTarget(gl, t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
}

export function bindTarget(gl, t) {
  if (t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
}

let emptyVao = null;
export function drawFullscreen(gl) {
  if (!emptyVao) emptyVao = gl.createVertexArray();
  gl.bindVertexArray(emptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
