// Everything is synthesized with the Web Audio API. No audio files.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.rainLevel = 0;
    this.windLevel = 0;
    this.night = 0;
    this._heartT = 0;
    this._lastBlip = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);

    // noise source shared by rain & wind
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    }
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    // rain: bandpassed hiss
    this.rainBP = ctx.createBiquadFilter();
    this.rainBP.type = 'bandpass';
    this.rainBP.frequency.value = 4200;
    this.rainBP.Q.value = 0.5;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.noise.connect(this.rainBP).connect(this.rainGain).connect(this.master);
    // wind: lowpassed rumble with slow LFO
    this.windLP = ctx.createBiquadFilter();
    this.windLP.type = 'lowpass';
    this.windLP.frequency.value = 320;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.noise.connect(this.windLP).connect(this.windGain).connect(this.master);
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.13;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 160;
    this.lfo.connect(this.lfoGain).connect(this.windLP.frequency);
    this.lfo.start();
    this.noise.start();
    // soft pad for night
    this.pad = ctx.createOscillator();
    this.pad.type = 'sine';
    this.pad.frequency.value = 55;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.pad.connect(this.padGain).connect(this.master);
    this.pad.start();
  }

  setAmbience(rain, wind, night, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rg = Math.min(1, rain / 5) * 0.55;
    this.rainGain.gain.setTargetAtTime(rg, t, 0.4);
    this.rainBP.frequency.setTargetAtTime(3000 + 2500 * Math.min(1, rain / 5), t, 0.5);
    this.windGain.gain.setTargetAtTime(Math.min(1, wind) * 0.35, t, 0.6);
    this.padGain.gain.setTargetAtTime(night * 0.05, t, 1.0);
    this.night = night;
  }

  _env(node, t0, a, peak, d, end = 0.0001) {
    node.gain.cancelScheduledValues(t0);
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(end, t0 + a + d);
  }

  // Raindrop / splash: tonal "plip", pitch falls with size.
  blip(size = 0.5, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this._lastBlip < 0.025) return;
    this._lastBlip = t;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    const f0 = 1400 - 900 * size;
    o.frequency.setValueAtTime(f0 * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.06);
    this._env(g, t, 0.004, 0.18 + 0.25 * size, 0.18 + 0.2 * size);
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(this.master); }
    else o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.6);
  }

  pulse(sign) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    const f = sign > 0 ? 520 : 330;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (sign > 0 ? 0.6 : 1.5), t + 0.25);
    this._env(g, t, 0.01, 0.22, 0.3);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.5);
  }

  cancel(quality = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      this._env(g, t + i * 0.04, 0.02, 0.12 * quality, 0.9);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.04); o.stop(t + 1.4);
    });
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise.buffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    const g = this.ctx.createGain();
    this._env(g, t, 0.01, 0.25 * quality, 0.6);
    n.connect(lp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.8);
  }

  rumble(dur = 1.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(38, t);
    o.frequency.linearRampToValueAtTime(52, t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, dur * 0.7, 0.5, dur * 0.3);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.1);
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise.buffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 140;
    const g2 = this.ctx.createGain();
    this._env(g2, t, dur * 0.6, 0.6, dur * 0.4);
    n.connect(lp).connect(g2).connect(this.master);
    n.start(t); n.stop(t + dur + 0.2);
  }

  splashBig() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise.buffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
    const g = this.ctx.createGain();
    this._env(g, t, 0.02, 0.7, 0.7);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 1);
    this.blip(1);
  }

  eat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.08);
    const g = this.ctx.createGain();
    this._env(g, t, 0.005, 0.12, 0.12);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = this.ctx.createGain();
    this._env(g, t, 0.005, 0.25, 0.3);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.4);
  }

  heartbeat(dt, intensity) {
    if (!this.ctx || intensity <= 0) { this._heartT = 0; return; }
    this._heartT += dt;
    const period = 1.1 - 0.5 * intensity;
    if (this._heartT >= period) {
      this._heartT = 0;
      const t = this.ctx.currentTime;
      for (let k = 0; k < 2; k++) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(70, t + k * 0.16);
        o.frequency.exponentialRampToValueAtTime(40, t + k * 0.16 + 0.12);
        const g = this.ctx.createGain();
        this._env(g, t + k * 0.16, 0.005, 0.35 * intensity, 0.16);
        o.connect(g).connect(this.master);
        o.start(t + k * 0.16); o.stop(t + k * 0.16 + 0.3);
      }
    }
  }

  sink() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(400, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 1.5);
    const g = this.ctx.createGain();
    this._env(g, t, 0.05, 0.3, 1.6);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 1.8);
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this._env(g, t + i * 0.12, 0.02, 0.15, 1.6);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.12); o.stop(t + 3);
    });
  }
}
