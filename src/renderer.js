import { Program, createTarget, destroyTarget, bindTarget, drawFullscreen } from './gl.js';
import { quadVS, bedFS, waterFS, spriteVS, spriteFS, downFS, blurFS, compositeFS, debugSimFS } from './shaders.js';
import { POND_R } from './water.js';

const MAX_SPRITES = 512;
const STRIDE = 12; // floats per sprite

export class Renderer {
  constructor(gl, caps) {
    this.gl = gl;
    this.caps = caps;
    this.progBed = new Program(gl, quadVS, bedFS, 'bed');
    this.progWater = new Program(gl, quadVS, waterFS, 'water');
    this.progSprite = new Program(gl, spriteVS, spriteFS, 'sprite');
    this.progDown = new Program(gl, quadVS, downFS, 'down');
    this.progBlur = new Program(gl, quadVS, blurFS, 'blur');
    this.progComp = new Program(gl, quadVS, compositeFS, 'composite');
    this.progDebug = new Program(gl, quadVS, debugSimFS, 'debugSim');
    this.debugView = null;
    this.quality = { renderScale: 1, dof: true, bloom: true, blurDiv: 4, micro: true };
    this.width = 0; this.height = 0;
    this.scene = null; this.blurA = null; this.blurB = null;
    this.feet = new Float32Array(6 * 4);
    this.slicks = new Float32Array(8 * 4);
    this._initSprites();
    this._bakeBed();
  }

  _bakeBed() {
    const gl = this.gl;
    const size = Math.min(1024, this.caps.maxTex);
    this.bed = createTarget(gl, size, size, { internalFormat: gl.RGBA8, filter: gl.LINEAR, wrap: gl.REPEAT });
    bindTarget(gl, this.bed);
    this.progBed.use();
    drawFullscreen(gl);
    gl.bindTexture(gl.TEXTURE_2D, this.bed.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    // texStorage with 1 level can't mipmap; re-create with mips for cleaner minification on the bank
    const mipTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, mipTex);
    const levels = Math.floor(Math.log2(size)) + 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bed.fbo);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, size, size);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    destroyTarget(gl, this.bed);
    this.bedTex = mipTex;
  }

  _initSprites() {
    const gl = this.gl;
    this.spriteData = new Float32Array(MAX_SPRITES * STRIDE);
    this.spriteCount = 0;
    this.spriteVao = gl.createVertexArray();
    this.spriteVbo = gl.createBuffer();
    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.spriteData.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);
  }

  setQuality(q) { Object.assign(this.quality, q); this.resize(this.cssW, this.cssH, true); }

  resize(cssW, cssH, force = false) {
    this.cssW = cssW; this.cssH = cssH;
    const gl = this.gl;
    const w = Math.max(2, Math.round(cssW * this.quality.renderScale));
    const h = Math.max(2, Math.round(cssH * this.quality.renderScale));
    if (!force && w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    gl.canvas.width = w; gl.canvas.height = h;
    destroyTarget(gl, this.scene); destroyTarget(gl, this.blurA); destroyTarget(gl, this.blurB);
    const fmt = this.caps.floatRT ? gl.RGBA16F : gl.RGBA8;
    this.scene = createTarget(gl, w, h, { internalFormat: fmt, filter: gl.LINEAR });
    const bw = Math.max(2, Math.round(w / this.quality.blurDiv)), bh = Math.max(2, Math.round(h / this.quality.blurDiv));
    this.blurA = createTarget(gl, bw, bh, { internalFormat: fmt, filter: gl.LINEAR });
    this.blurB = createTarget(gl, bw, bh, { internalFormat: fmt, filter: gl.LINEAR });
  }

  // Sprite submission -----------------------------------------------------
  beginSprites() { this.spriteCount = 0; }
  sprite(x, y, size, rot, type, p0, p1, p2, r, g, b, a) {
    if (this.spriteCount >= MAX_SPRITES) return;
    const o = this.spriteCount * STRIDE;
    const d = this.spriteData;
    d[o] = x; d[o + 1] = y; d[o + 2] = size; d[o + 3] = rot;
    d[o + 4] = type; d[o + 5] = p0; d[o + 6] = p1; d[o + 7] = p2;
    d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = a;
    this.spriteCount++;
  }
  capsule(ax, ay, bx, by, radius, r, g, b, a) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const size = len * 0.5 + radius;
    this.sprite((ax + bx) * 0.5, (ay + by) * 0.5, size, Math.atan2(dy, dx), 4, radius / size, 0, 0, r, g, b, a);
  }

  _flushSprites(additive) {
    if (!this.spriteCount) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    if (additive) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.progSprite.use().v2('uRes', this.width, this.height).v3('uCam', this.cam.x, this.cam.y, this.cam.scale).f('uTime', this.time);
    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteData, 0, this.spriteCount * STRIDE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.spriteCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.spriteCount = 0;
  }

  // Frame ------------------------------------------------------------------
  // view: {cam:{x,y,scale(px per world unit in render px)}, env:{...}, strider, fish, bug, slicks, ...}
  render(water, view, drawSprites) {
    const gl = this.gl;
    const env = view.env;
    this.cam = view.cam;
    this.time = view.time;

    // 1. water surface → scene
    bindTarget(gl, this.scene);
    const p = this.progWater.use();
    p.tex('uH', 0, water.tex).tex('uBed', 1, this.bedTex);
    p.v2('uRes', this.width, this.height).v3('uCam', this.cam.x, this.cam.y, this.cam.scale);
    p.f('uTexel', water.texel).f('uTime', view.time);
    p.f('uNight', env.night).f('uStorm', env.storm).f('uDawn', env.dawn);
    p.v3('uSun', env.sun[0], env.sun[1], env.sun[2]);
    p.f('uPondR', POND_R);
    const s = view.strider;
    for (let i = 0; i < 6; i++) {
      const f = s.feet[i];
      this.feet[i * 4] = f.x; this.feet[i * 4 + 1] = f.y; this.feet[i * 4 + 2] = f.r; this.feet[i * 4 + 3] = f.w;
    }
    p.v4a('uFeet', this.feet);
    p.v4('uBody', s.x, s.y, Math.cos(s.heading), Math.sin(s.heading));
    p.v3('uBodySize', s.visible ? s.halfLen : 0, s.halfWid, s.sink);
    const fish = view.fish;
    p.v4('uFish', fish.x, fish.y, fish.heading, fish.size);
    p.v3('uFishState', fish.depth, fish.mouth, fish.visible ? 1 : 0);
    const bug = view.bug;
    p.v4('uBug', bug.x, bug.y, bug.heading, bug.visible ? bug.size : 0);
    const ns = Math.min(8, view.slicks.length);
    for (let i = 0; i < ns; i++) {
      const sl = view.slicks[i];
      this.slicks[i * 4] = sl.x; this.slicks[i * 4 + 1] = sl.y; this.slicks[i * 4 + 2] = sl.r; this.slicks[i * 4 + 3] = 0;
    }
    p.i('uNumSlick', ns).v4a('uSlick', this.slicks);
    p.v2('uStriderPos', s.x, s.y).f('uSenseR', view.senseR).f('uFog', env.fog).f('uGlow', env.glow);
    p.f('uNormalScale', env.normalScale).f('uCaustic', env.caustic);
    const gh = view.ghost;
    p.v4('uGhost', gh.x, gh.y, gh.r, gh.a);
    p.f('uMicro', this.quality.micro ? env.micro : 0).v2('uWind', env.wind[0], env.wind[1]);
    drawFullscreen(gl);

    // 2. sprites (normal, then additive)
    this.beginSprites();
    drawSprites(this, false);
    this._flushSprites(false);
    this.beginSprites();
    drawSprites(this, true);
    this._flushSprites(true);

    // 3. blur chain (bloom + tilt-shift share it)
    bindTarget(gl, this.blurA);
    this.progDown.use().tex('uSrc', 0, this.scene.tex).v2('uTexel', 1 / this.width, 1 / this.height);
    drawFullscreen(gl);
    bindTarget(gl, this.blurB);
    this.progBlur.use().tex('uSrc', 0, this.blurA.tex).v2('uDir', 1 / this.blurA.w, 0);
    drawFullscreen(gl);
    bindTarget(gl, this.blurA);
    this.progBlur.use().tex('uSrc', 0, this.blurB.tex).v2('uDir', 0, 1 / this.blurA.h);
    drawFullscreen(gl);
    if (this.quality.blurDiv <= 4) {
      // second blur pass for a softer, wider bloom
      bindTarget(gl, this.blurB);
      this.progBlur.use().tex('uSrc', 0, this.blurA.tex).v2('uDir', 1.5 / this.blurA.w, 0);
      drawFullscreen(gl);
      bindTarget(gl, this.blurA);
      this.progBlur.use().tex('uSrc', 0, this.blurB.tex).v2('uDir', 0, 1.5 / this.blurA.h);
      drawFullscreen(gl);
    }

    // 4. composite → canvas
    bindTarget(gl, null);
    if (this.debugView === 'sim') {
      gl.bindTexture(gl.TEXTURE_2D, water.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.progDebug.use().tex('uSrc', 0, water.tex);
      drawFullscreen(gl);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return;
    }
    const c = this.progComp.use();
    c.tex('uScene', 0, this.scene.tex).tex('uBlur', 1, this.blurA.tex);
    c.f('uDof', this.quality.dof ? env.dof : 0).f('uBloom', this.quality.bloom ? env.bloom : 0).f('uBloomThr', env.bloomThr);
    c.f('uAspect', this.width / this.height).f('uFocusY', view.focusY).f('uNight', env.night);
    c.f('uFlash', env.flash).f('uVignette', env.vignette).f('uTime', view.time);
    drawFullscreen(gl);
  }
}
