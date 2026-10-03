import { Program, createTarget, destroyTarget, bindTarget, drawFullscreen } from './gl.js';
import { quadVS, simFS, copyFS, readbackFS } from './shaders.js';

export const POND_R = 0.46;
const RB = 128; // readback resolution

// GPU wave simulation. One height field drives both the visuals and the game.
export class Water {
  constructor(gl, caps, n = 256) {
    this.gl = gl;
    this.caps = caps;
    this.n = 0;
    this.c2 = 0.46;
    this.damp = 0.998;
    this.nu = 0.01;
    this.progSim = new Program(gl, quadVS, simFS, 'sim');
    this.progCopy = new Program(gl, quadVS, copyFS, 'copy');
    this.progRead = new Program(gl, quadVS, readbackFS, 'readback');
    this.impulses = [];      // {x,y,r,amp,ring,width}
    this.zones = [];         // {x,y,r,s}
    this.impA = new Float32Array(16 * 4);
    this.impB = new Float32Array(16 * 4);
    this.zoneA = new Float32Array(12 * 4);
    this.readTarget = createTarget(gl, RB, RB, { internalFormat: gl.RGBA8, filter: gl.LINEAR });
    this.pbos = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
    for (const b of this.pbos) {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, RB * RB * 4, gl.STREAM_READ);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.fences = [null, null, null];
    this.pboIndex = 0;
    this.pixels = new Uint8Array(RB * RB * 4);
    this.hasData = false;
    this.resize(n);
  }

  get tex() { return this.a.tex; }
  get texel() { return 1 / this.n; }

  resize(n) {
    if (n === this.n) return;
    const gl = this.gl;
    const fmt = gl.RGBA16F;
    const na = createTarget(gl, n, n, { internalFormat: fmt, filter: gl.LINEAR });
    const nb = createTarget(gl, n, n, { internalFormat: fmt, filter: gl.LINEAR });
    if (this.a) {
      bindTarget(gl, na);
      this.progCopy.use().tex('uSrc', 0, this.a.tex);
      drawFullscreen(gl);
      destroyTarget(gl, this.a);
      destroyTarget(gl, this.b);
    } else {
      bindTarget(gl, na);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.a = na; this.b = nb; this.n = n;
  }

  clear() {
    const gl = this.gl;
    for (const t of [this.a, this.b]) {
      bindTarget(gl, t);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.impulses.length = 0;
    this.zones.length = 0;
  }

  // Disc impulse (raindrop, stroke) — amp sign sets crest (+) or trough (−).
  disc(x, y, r, amp) { this.impulses.push({ x, y, r: Math.max(r, 2.2 * this.texel), amp, ring: 0, width: 0 }); }
  // Ring impulse (pulse): a ring wave at radius r with gaussian width.
  ring(x, y, r, width, amp) { this.impulses.push({ x, y, r, amp, ring: 1, width: Math.max(width, 2.0 * this.texel) }); }

  // One sim step. Impulses are consumed 16 at a time.
  step(substeps = 1) {
    const gl = this.gl;
    const p = this.progSim.use();
    p.f('uTexel', this.texel).f('uC2', this.c2).f('uDamp', this.damp).f('uNu', this.nu).f('uPondR', POND_R);
    const nz = Math.min(12, this.zones.length);
    for (let i = 0; i < nz; i++) {
      const z = this.zones[i];
      this.zoneA[i * 4] = z.x; this.zoneA[i * 4 + 1] = z.y; this.zoneA[i * 4 + 2] = z.r; this.zoneA[i * 4 + 3] = z.s;
    }
    p.i('uNumZones', nz).v4a('uZone', this.zoneA);
    for (let s = 0; s < substeps; s++) {
      const ni = Math.min(16, this.impulses.length);
      for (let i = 0; i < ni; i++) {
        const im = this.impulses[i];
        this.impA[i * 4] = im.x; this.impA[i * 4 + 1] = im.y; this.impA[i * 4 + 2] = im.r; this.impA[i * 4 + 3] = im.amp;
        this.impB[i * 4] = im.ring; this.impB[i * 4 + 1] = im.width; this.impB[i * 4 + 2] = 0; this.impB[i * 4 + 3] = 0;
      }
      if (ni) this.impulses.splice(0, ni);
      p.i('uNumImp', ni).v4a('uImp', this.impA).v4a('uImpB', this.impB);
      bindTarget(gl, this.b);
      p.tex('uPrev', 0, this.a.tex);
      drawFullscreen(gl);
      const t = this.a; this.a = this.b; this.b = t;
    }
  }

  // Kick off an async readback of height + slope for gameplay queries.
  requestReadback() {
    const gl = this.gl;
    bindTarget(gl, this.readTarget);
    this.progRead.use().f('uTexel', this.texel).tex('uH', 0, this.a.tex);
    drawFullscreen(gl);
    const idx = this.pboIndex;
    // Still in flight from three frames ago (very slow GPU): skip this frame's
    // readback rather than stall or overwrite.
    if (this.fences[idx]) return;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[idx]);
    gl.readPixels(0, 0, RB, RB, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.fences[idx] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.pboIndex = (idx + 1) % 3;
  }

  // Collect the previous frame's readback if it has landed.
  _consume(idx) {
    const gl = this.gl;
    gl.deleteSync(this.fences[idx]);
    this.fences[idx] = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[idx]);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.pixels);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.hasData = true;
  }

  // Synchronous readback (tests / headless): no PBO, stalls the pipeline.
  readbackSync() {
    const gl = this.gl;
    bindTarget(gl, this.readTarget);
    this.progRead.use().f('uTexel', this.texel).tex('uH', 0, this.a.tex);
    drawFullscreen(gl);
    gl.readPixels(0, 0, RB, RB, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    this.hasData = true;
  }

  // Collect any readback whose fence has signaled, oldest first.
  pollReadback() {
    const gl = this.gl;
    let got = false;
    for (let k = 0; k < 3; k++) {
      const idx = (this.pboIndex + k) % 3; // oldest first
      const f = this.fences[idx];
      if (!f) continue;
      if (gl.getSyncParameter(f, gl.SYNC_STATUS) !== gl.SIGNALED) continue;
      this._consume(idx);
      got = true;
    }
    return got;
  }

  // Bilinear sample of height/slope at a world position.
  sample(x, y, out = { h: 0, gx: 0, gy: 0 }) {
    if (!this.hasData) { out.h = 0; out.gx = 0; out.gy = 0; return out; }
    const fx = Math.min(RB - 1.001, Math.max(0, x * RB - 0.5));
    const fy = Math.min(RB - 1.001, Math.max(0, y * RB - 0.5));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const px = this.pixels;
    const i00 = (y0 * RB + x0) * 4, i10 = i00 + 4, i01 = i00 + RB * 4, i11 = i01 + 4;
    const lerp = (c) => {
      const a = px[i00 + c] * (1 - tx) + px[i10 + c] * tx;
      const b = px[i01 + c] * (1 - tx) + px[i11 + c] * tx;
      return a * (1 - ty) + b * ty;
    };
    out.h = (lerp(0) / 255 - 0.5) * 0.5;
    out.gx = (lerp(1) / 255 - 0.5) * 20;
    out.gy = (lerp(2) / 255 - 0.5) * 20;
    return out;
  }

  // Strongest |h| in an annulus around (x,y). Returns {h (signed), x, y} of the peak.
  peakAround(x, y, r0, r1, out = { h: 0, x: 0, y: 0 }) {
    out.h = 0; out.x = x; out.y = y;
    if (!this.hasData) return out;
    const px = this.pixels;
    const n = 24;
    const rings = 3;
    let best = 0;
    for (let k = 0; k < rings; k++) {
      const rr = r0 + (r1 - r0) * (k / (rings - 1));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr;
        if (sx < 0 || sx > 1 || sy < 0 || sy > 1) continue;
        const ix = Math.min(RB - 1, Math.max(0, Math.round(sx * RB - 0.5)));
        const iy = Math.min(RB - 1, Math.max(0, Math.round(sy * RB - 0.5)));
        const h = (px[(iy * RB + ix) * 4] / 255 - 0.5) * 0.5;
        if (Math.abs(h) > Math.abs(best)) { best = h; out.x = sx; out.y = sy; }
      }
    }
    out.h = best;
    return out;
  }
}
