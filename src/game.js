import { POND_R } from './water.js';
import { mulberry32, dailySeed, dailyKey } from './rng.js';

export const UPGRADES = {
  legs:      { name: 'Longer legs',      desc: 'Skate faster',                         max: 3 },
  hairs:     { name: 'Repellent hairs',  desc: 'Waves tip you less',                  max: 3 },
  pulse:     { name: 'Stronger pulse',   desc: 'Bigger rings, wider glass zones',     max: 3 },
  sense:     { name: 'Wider sense',      desc: 'Feel prey further, see in the dark',  max: 3 },
  resonance: { name: 'Resonance',        desc: 'Small waves cancel themselves',       max: 3 },
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function kf(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      return lerp(v0, v1, (t - t0) / (t1 - t0));
    }
  }
  return pts[pts.length - 1][1];
}

export const PHASES = [['dawn', 0], ['wind', 60], ['rain', 150], ['night', 240], ['downpour', 330], ['sunrise', 420]];
const LOOP_START = 60, LOOP_END = 420, RUN_END = 432;
const PHASE_PERIOD = 1.2;          // pulse metronome period (s)
const STORE_KEY = 'glasswater.v1';

const LEG_DEF = [
  // hip (body frame, x forward, y left), rest foot, dimple radius
  { hip: [0.013, 0.003],  rest: [0.026, 0.013],  r: 0.0045, kind: 'front' },
  { hip: [0.013, -0.003], rest: [0.026, -0.013], r: 0.0045, kind: 'front' },
  { hip: [0.004, 0.004],  rest: [0.008, 0.036],  r: 0.0075, kind: 'mid' },
  { hip: [0.004, -0.004], rest: [0.008, -0.036], r: 0.0075, kind: 'mid' },
  { hip: [-0.008, 0.0035], rest: [-0.024, 0.029], r: 0.0065, kind: 'rear' },
  { hip: [-0.008, -0.0035], rest: [-0.024, -0.029], r: 0.0065, kind: 'rear' },
];

export class Game {
  constructor(water, audio) {
    this.water = water;
    this.audio = audio;
    this.save = this._load();
    this.state = 'title';
    this.mode = 'daily';
    this.time = 0;
    this.wall = 0;
    this.events = [];       // UI messages {type, ...}
    this.hud = { phase: 'dawn', time: 0, score: 0, hint: '', hintT: 0 };
    this.onEnd = null;
    this.inputDir = { x: 0, y: 0 };
    this.cssW = 1; this.cssH = 1;
    this.cam = { x: 0.5, y: 0.5, scale: 1000, reveal: 0 };
    this.view = this._makeView();
    this._resetWorld(Math.random() * 1e9 | 0);
    this.attract = true;
  }

  // ---- persistence -------------------------------------------------------
  _load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return {
        best: s.best || 0,
        bestEndless: s.bestEndless || 0,
        molts: Object.assign({ legs: 0, hairs: 0, pulse: 0, sense: 0, resonance: 0 }, s.molts || {}),
        runs: s.runs || 0,
        clears: s.clears || 0,
        daily: s.daily || null,   // {key, best, trace}
        ghost: s.ghost || null,
        ghostScore: s.ghostScore || 0,
      };
    } catch (_) {
      return { best: 0, bestEndless: 0, molts: { legs: 0, hairs: 0, pulse: 0, sense: 0, resonance: 0 }, runs: 0, clears: 0, daily: null, ghost: null, ghostScore: 0 };
    }
  }
  _store() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.save)); } catch (_) { /* private mode */ } }

  // ---- world reset -------------------------------------------------------
  _resetWorld(seed) {
    this.rng = mulberry32(seed);
    this.seed = seed;
    this.time = 0;
    this.loop = 0;
    this.endless = false;
    this.score = 0;
    this.stats = { gnats: 0, cancels: 0, perfect: 0, fishScared: 0, bugsStunned: 0, bestCombo: 0, loops: 0, survived: 0 };
    this.combo = 0;
    this.comboT = 0;
    this.gnats = [];
    this.drops = [];
    this.splashes = [];
    this.slicks = [];
    this.zones = [];
    this.fx = [];
    this.bugs = [];
    this.tongue = null;
    this.trace = [];
    this.traceT = 0;
    this.ghostTrace = null;
    this.ghostT = 0;
    this.ghostI = 0;
    this.ghostPos = null;
    this.spawnAcc = { gnat: 0, rain: 0, slick: 0, wind: 0 };
    this.teach = { drops: [18, 36, 50], i: 0 };
    this.fish = { x: 0.5, y: 0.2, heading: 0, size: 0.09, depth: 0.1, mouth: 0, visible: false, state: 'hidden', t: 14, tx: 0.5, ty: 0.5, cool: 0 };
    this.frog = { x: 0, y: 0, ang: 0, face: 0, state: 'away', t: 20, glint: 0, visible: false, cool: 0 };
    this.strider = {
      x: 0.5, y: 0.5, vx: 0, vy: 0, heading: Math.PI / 2, speed: 0,
      tension: 1, hunger: 1, weight: 0, alive: true, sink: 0, visible: true,
      halfLen: 0.02, halfWid: 0.0045,
      strokePhase: 0, immune: 0, pulseCool: 0, lastPulse: 9, hurtT: 0, resonT: 0,
      feet: LEG_DEF.map(() => ({ x: 0.5, y: 0.5, r: 0.006, w: 1, kx: 0.5, ky: 0.5 })),
    };
    this.phaseT = 0;
    this.dmg = { wave: 0, slick: 0, hunger: 0, weight: 0, fish: 0, frog: 0, bug: 0 };
    this.cause = '';
    this.ready = 0;        // "cancel window open" indicator strength
    this.flash = 0;
    this.water.clear();
    this.cam.x = 0.5; this.cam.y = 0.5; this.cam.reveal = 0;
  }

  levels() { return this.save.molts; }

  // ---- public control ----------------------------------------------------
  startRun(mode = 'daily') {
    this.mode = mode;
    const seed = mode === 'daily' ? dailySeed() : (Math.random() * 1e9) | 0;
    this._resetWorld(seed);
    const lv = this.levels();
    this.senseR = 0.16 + 0.05 * lv.sense;
    if (mode === 'daily' && this.save.daily && this.save.daily.key === dailyKey() && this.save.daily.trace) {
      this.ghostTrace = this.save.daily.trace;
    } else if (this.save.ghost) {
      this.ghostTrace = this.save.ghost;
    }
    this.attract = false;
    this.state = 'playing';
    this.save.runs++;
    this._store();
    this.hint('drag to skate · tap to pulse', 4);
  }

  continueEndless() {
    this.endless = true;
    this.state = 'playing';
    this.cam.reveal = 0;
    this.hint('endless · the storms return', 3);
  }

  toTitle() {
    this.attract = true;
    this.state = 'title';
    this._resetWorld((Math.random() * 1e9) | 0);
    this.strider.visible = true;
  }

  applyMolt(key) {
    const m = this.save.molts;
    if (m[key] < UPGRADES[key].max) m[key]++;
    this._store();
  }

  moltChoices() {
    const avail = Object.keys(UPGRADES).filter((k) => this.save.molts[k] < UPGRADES[k].max);
    const r = mulberry32((Date.now() / 1000) | 0);
    const out = [];
    while (out.length < 3 && avail.length) out.push(avail.splice(r.int(avail.length), 1)[0]);
    return out;
  }

  hint(text, dur = 3) { this.hud.hint = text; this.hud.hintT = dur; }

  setInput(dir) { this.inputDir.x = dir.x; this.inputDir.y = dir.y; }

  // ---- director ----------------------------------------------------------
  envAt(tRaw) {
    let t = tRaw;
    let loop = 0;
    if (t > RUN_END && this.endless) {
      const span = LOOP_END - LOOP_START;
      const over = t - RUN_END;
      loop = 1 + Math.floor(over / span);
      t = LOOP_START + (over % span);
    }
    const k = 1 + 0.28 * loop;
    const e = {
      t, loop,
      rain: k * kf(t, [[0, 0], [57, 0], [62, 0.2], [150, 0.35], [168, 1.8], [225, 2.8], [240, 1.4], [252, 0.5], [330, 0.6], [344, 4.5], [405, 5.5], [420, 3], [430, 0]]),
      night: kf(t, [[236, 0], [250, 1], [330, 1], [344, 0.6], [418, 0.6], [426, 0.15], [432, 0]]),
      storm: kf(t, [[0, 0], [140, 0.15], [170, 0.85], [238, 0.6], [330, 0.7], [344, 1], [418, 0.9], [428, 0.2], [432, 0]]),
      dawn: kf(t, [[0, 1], [45, 1], [80, 0], [418, 0], [426, 1]]),
      wind: kf(t, [[0, 0.05], [60, 0.25], [95, 0.9], [150, 0.9], [240, 0.45], [330, 0.6], [344, 1.3], [418, 0.6], [432, 0.1]]),
      gnatRate: kf(t, [[0, 0.4], [60, 0.3], [150, 0.3], [240, 0.22], [330, 0.28], [420, 0.1], [432, 0]]),
      slickRate: k * kf(t, [[0, 0], [60, 0.04], [150, 0.03], [240, 0.012], [330, 0.035], [420, 0]]),
      fish: Math.min(1.4, k * kf(t, [[0, 0], [85, 0], [95, 0.6], [240, 0.5], [330, 1.0], [420, 0]])),
      frog: t >= 236 && t < 420 ? 1 : 0,
      bugs: t >= 244 && t < 420 ? Math.min(2, (t < 272 ? 1 : 2)) : 0,
      dropSize: kf(t, [[0, 0.7], [150, 0.8], [240, 0.8], [330, 1.0], [420, 1.0]]) * (1 + 0.1 * loop),
    };
    let ph = 'dawn';
    for (const [name, t0] of PHASES) if (t >= t0) ph = name;
    if (tRaw > RUN_END && this.endless) ph = 'endless · ' + ph;
    e.phase = ph;
    if (this.envOverride) Object.assign(e, this.envOverride);
    const windAng = 0.6 + 0.35 * Math.sin(t * 0.02) + 1.5 * loop;
    e.windX = Math.cos(windAng) * e.wind;
    e.windY = Math.sin(windAng) * e.wind;
    return e;
  }

  // ---- main update (fixed dt) -------------------------------------------
  update(dt) {
    this.wall += dt;
    if (this.state === 'title') { this._updateAttract(dt); return; }
    if (this.state === 'ended') { this._updateAmbient(dt, this.envAt(this.time), 0.2); return; }
    const env = this.envAt(this.time);
    this.env = env;
    if (this.state === 'playing' || this.state === 'sinking' || this.state === 'sunrise') this.time += dt;

    this.phaseT += dt;
    this.hud.phase = env.phase;
    this.hud.time = this.time;
    if (this.hud.hintT > 0) { this.hud.hintT -= dt; if (this.hud.hintT <= 0) this.hud.hint = ''; }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    this._updateAmbient(dt, env, 1);
    this._updateDrops(dt, env);
    this._updateGnats(dt, env);
    this._updateSlicks(dt, env);
    this._updateZones(dt);
    this._updateFish(dt, env);
    this._updateFrog(dt, env);
    this._updateBugs(dt, env);
    this._updateGhost(dt);
    this._updateFx(dt);

    if (this.state === 'playing') {
      this._updateStrider(dt, env);
      this._checkEating();
      this.score += dt * 10;
      this.traceT += dt;
      if (this.traceT >= 0.5) { this.traceT = 0; this.trace.push([Math.round(this.time * 10) / 10, +this.strider.x.toFixed(3), +this.strider.y.toFixed(3)]); }
      if (!this.endless && this.time >= RUN_END - 10 && this.state === 'playing') {
        // the storm fades; reveal begins at sunrise
        if (this.time >= RUN_END) this._sunrise();
      }
      if (this.endless && env.loop > this.stats.loops) {
        this.stats.loops = env.loop;
        this.score += 1000;
        this.hint('storm ' + (env.loop + 1), 2.5);
      }
    } else if (this.state === 'sinking') {
      this._updateSinking(dt);
    } else if (this.state === 'sunrise') {
      this.cam.reveal = Math.min(1, this.cam.reveal + dt / 4.5);
      this._updateLegs(dt, 0);
      if (this.cam.reveal >= 1 && this.time > RUN_END + 5.5) this._finish('survived');
    }
    this.hud.score = Math.floor(this.score);
    this._pushZones();
    this._audioAmbience(dt, env);
  }

  _updateAttract(dt) {
    this.wall += dt;
    const env = { rain: 0.5, wind: 0.3, windX: 0.2, windY: 0.1, night: 0, storm: 0.1, dawn: 0.6, dropSize: 0.6, gnatRate: 0.1 };
    this.env = this.envAt(20);
    this.env.rain = 0.5; this.env.storm = 0.1;
    this.phaseT += dt;
    this._updateAmbient(dt, env, 1);
    this._updateDrops(dt, env);
    this._updateSplashes(dt);
    this._updateGnats(dt, env);
    this._updateFx(dt);
    const s = this.strider;
    s.heading += dt * 0.15;
    s.x = 0.5 + Math.cos(this.wall * 0.3) * 0.05;
    s.y = 0.5 + Math.sin(this.wall * 0.3) * 0.05;
    s.vx = -Math.sin(this.wall * 0.3) * 0.015; s.vy = Math.cos(this.wall * 0.3) * 0.015;
    s.speed = Math.hypot(s.vx, s.vy);
    s.heading = Math.atan2(s.vy, s.vx);
    this._updateLegs(dt, s.speed / 0.2);
    this._pushZones();
    this.hud.phase = 'dawn';
    this._audioAmbience(dt, this.env);
  }

  _updateAmbient(dt, env, k) {
    // wind texture: tiny random impulses
    this.spawnAcc.wind += dt * env.wind * 14 * k;
    while (this.spawnAcc.wind >= 1) {
      this.spawnAcc.wind -= 1;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * POND_R;
      this.water.disc(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0.012 + Math.random() * 0.01, (Math.random() - 0.5) * 0.004 * (0.5 + env.wind));
    }
    this._updateSplashes(dt);
  }

  _audioAmbience(dt, env) {
    this.audio.setAmbience(env.rain, env.wind, env.night, dt);
    const s = this.strider;
    const low = this.state === 'playing' ? clamp((0.35 - s.tension) / 0.35, 0, 1) : 0;
    this.audio.heartbeat(dt, low);
  }

  // ---- strider -----------------------------------------------------------
  _updateStrider(dt, env) {
    const s = this.strider;
    const lv = this.levels();
    const dir = this.inputDir;
    const dl = Math.hypot(dir.x, dir.y);
    const inSlick = this._inSlick(s.x, s.y);
    const heavy = Math.max(0, s.weight - 0.9);
    const maxV = 0.21 * (1 + 0.12 * lv.legs) / (1 + 0.45 * heavy) * (inSlick ? 0.78 : 1) * (s.hunger <= 0 ? 0.8 : 1);
    const drag = dl > 0.01 ? 1.3 : 1.9;
    if (dl > 0.01) {
      const acc = maxV * drag * 1.05;
      s.vx += dir.x * acc * dt;
      s.vy += dir.y * acc * dt;
    }
    const k = Math.exp(-drag * dt);
    s.vx *= k; s.vy *= k;
    s.speed = Math.hypot(s.vx, s.vy);
    if (s.speed > maxV) { s.vx *= maxV / s.speed; s.vy *= maxV / s.speed; s.speed = maxV; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    // stay on the pond
    const dx = s.x - 0.5, dy = s.y - 0.5, d = Math.hypot(dx, dy);
    const lim = POND_R - 0.02;
    if (d > lim) {
      s.x = 0.5 + dx / d * lim; s.y = 0.5 + dy / d * lim;
      const vn = (s.vx * dx + s.vy * dy) / d;
      if (vn > 0) { s.vx -= dx / d * vn; s.vy -= dy / d * vn; }
    }
    if (s.speed > 0.015) {
      const target = Math.atan2(s.vy, s.vx);
      let da = target - s.heading;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      s.heading += da * Math.min(1, dt * 9);
    }
    s.immune = Math.max(0, s.immune - dt);
    s.pulseCool = Math.max(0, s.pulseCool - dt);
    s.lastPulse += dt;
    s.hurtT = Math.max(0, s.hurtT - dt);
    this._updateLegs(dt, s.speed / maxV);

    // surface tension
    const smp = this.water.sample(s.x, s.y);
    const slope = Math.hypot(smp.gx, smp.gy);
    const wave = slope * 0.085 + Math.abs(smp.h) * 5;
    this.waveAtStrider = wave;
    const tipThr = 0.44 - 0.10 * heavy;
    const hairs = 1 - 0.16 * lv.hairs;
    const decay = Math.exp(-dt / 4);
    for (const k in this.dmg) this.dmg[k] *= decay;
    if (wave > tipThr && s.immune <= 0) {
      const dmg = Math.min(0.75, (wave - tipThr) * 1.8) * dt * hairs;
      s.tension -= dmg;
      this.dmg.wave += dmg;
      if (s.hurtT <= 0 && dmg > 0.004) { s.hurtT = 0.5; this.audio.hurt(); this.combo = 0; }
    } else if (wave < tipThr * 0.6 && !inSlick && s.hunger > 0) {
      s.tension += dt * 0.035;
    }
    if (inSlick) { s.tension -= dt * 0.11; this.dmg.slick += dt * 0.11; if (s.hurtT <= 0) { s.hurtT = 1.2; this.hint('slick · surface weakens', 2); } }
    s.hunger -= dt / 110;
    if (s.hunger <= 0) { s.hunger = 0; s.tension -= dt * 0.05; this.dmg.hunger += dt * 0.05; }
    s.weight = Math.max(0, s.weight - dt * 0.035);
    if (s.weight > 1) { s.tension -= dt * 0.06 * (s.weight - 1); this.dmg.weight += dt * 0.06 * (s.weight - 1); }
    s.tension = clamp(s.tension, 0, 1);
    if (this.god) s.tension = Math.max(s.tension, 0.5);
    if (s.tension <= 0) this._sink();

    // resonance: auto cancel small waves
    if (lv.resonance > 0) {
      s.resonT -= dt;
      if (s.resonT <= 0) {
        const pk = this.water.peakAround(s.x, s.y, 0.04, 0.12);
        if (pk.h > 0.012 && pk.h < 0.045) {
          s.resonT = 3.2 - 0.7 * lv.resonance;
          this.zones.push({ x: s.x, y: s.y, r: 0.06 + 0.01 * lv.resonance, s: 0.8, t: 0, dur: 0.6 });
          this.fx.push({ type: 'ring', x: s.x, y: s.y, t: 0, dur: 0.5, r0: 0.02, r1: 0.07, col: [0.5, 0.9, 1.0], a: 0.5 });
        } else s.resonT = 0.3;
      }
    }
    // "cancel window open" indicator: a crest approaching while phase is negative
    const pk = this.water.peakAround(s.x, s.y, 0.05, 0.14);
    this.incoming = pk.h;
    const sign = this.phaseSign();
    const open = pk.h > 0.02 && sign < 0;
    this.ready = lerp(this.ready, open ? 1 : 0, Math.min(1, dt * 14));
  }

  phaseSign() { return Math.sin(TAU * this.phaseT / PHASE_PERIOD) >= 0 ? 1 : -1; }
  phaseValue() { return Math.sin(TAU * this.phaseT / PHASE_PERIOD); }

  pulse() {
    const s = this.strider;
    if (this.state !== 'playing' || s.pulseCool > 0) return;
    const lv = this.levels();
    const sign = this.phaseSign();
    const strength = 1 + 0.22 * lv.pulse;
    s.pulseCool = 0.42;
    s.lastPulse = 0;
    s.immune = Math.max(s.immune, 0.22);
    const amp = sign * 0.055 * strength;
    this.water.ring(s.x, s.y, 0.045, 0.011, amp);
    this.audio.pulse(sign);
    const pk = this.water.peakAround(s.x, s.y, 0.05, 0.14);
    const big = pk.h > 0.02;   // a real crest is coming (your own strokes are troughs)
    if (big && sign < 0) {
      // CANCEL: counter-phase pulse against an incoming crest → glass zone
      const quality = clamp(pk.h / 0.05, 0.4, 1);
      const perfect = pk.h > 0.05;
      const r = (0.10 + 0.018 * lv.pulse) * (0.8 + 0.4 * quality);
      this.zones.push({ x: s.x, y: s.y, r, s: 1, t: 0, dur: 0.95 + 0.12 * lv.pulse });
      this.combo = Math.min(9, this.combo + 1);
      this.comboT = 3.5;
      this.stats.cancels++;
      if (perfect) this.stats.perfect++;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
      const pts = Math.round((100 + (perfect ? 100 : 0)) * (1 + 0.25 * (this.combo - 1)));
      this.score += pts;
      this.audio.cancel(quality);
      this.flash = 0.12 * quality;
      this.fx.push({ type: 'ring', x: s.x, y: s.y, t: 0, dur: 0.7, r0: 0.03, r1: r * 1.1, col: [0.85, 0.97, 1.0], a: 0.9 * quality });
      this.fx.push({ type: 'text', x: s.x, y: s.y, t: 0, dur: 1, pts, perfect });
      if (this.stats.cancels === 1) this.hint('glass · the wave is gone', 2.5);
    } else if (big) {
      // same phase: constructive. The ring stacks with the crest (risky, but a strike).
      this.fx.push({ type: 'ring', x: s.x, y: s.y, t: 0, dur: 0.5, r0: 0.03, r1: 0.09, col: [1.0, 0.8, 0.5], a: 0.5 });
    } else {
      this.fx.push({ type: 'ring', x: s.x, y: s.y, t: 0, dur: 0.5, r0: 0.03, r1: 0.08, col: sign > 0 ? [1.0, 0.85, 0.6] : [0.5, 0.7, 1.0], a: 0.35 });
    }
  }

  _updateLegs(dt, speedNorm) {
    const s = this.strider;
    const c = Math.cos(s.heading), sn = Math.sin(s.heading);
    const moving = speedNorm > 0.06;
    const period = clamp(0.6 - speedNorm * 0.3, 0.26, 0.6);
    const prev = s.strokePhase;
    if (moving) s.strokePhase = (s.strokePhase + dt / period) % 1;
    else s.strokePhase = s.strokePhase > 0.02 ? (s.strokePhase + dt / 0.6) % 1 : 0;
    const ph = s.strokePhase;
    const strokeStart = moving && prev > ph;
    for (let i = 0; i < 6; i++) {
      const def = LEG_DEF[i];
      const f = s.feet[i];
      let ox = def.rest[0], oy = def.rest[1], w = 1;
      if (def.kind === 'mid') {
        if (ph < 0.4) { ox += lerp(0.012, -0.015, ph / 0.4); w = 1; }
        else { const q = (ph - 0.4) / 0.6; ox += lerp(-0.015, 0.012, q); w = moving ? 0.12 : 1; }
        if (!moving && ph === 0) { ox = def.rest[0]; w = 1; }
      } else if (def.kind === 'rear') {
        ox += 0.004 * Math.sin(TAU * ph + Math.PI) * (moving ? 1 : 0);
      }
      // rear legs steer slightly with velocity
      const fx = s.x + ox * c - oy * sn, fy = s.y + ox * sn + oy * c;
      const hx = s.x + def.hip[0] * c - def.hip[1] * sn, hy = s.y + def.hip[0] * sn + def.hip[1] * c;
      f.x = fx; f.y = fy; f.r = def.r; f.w = w * (1 - s.sink);
      f.hx = hx; f.hy = hy;
      // knee: 55% along, pushed outward from body
      const side = Math.sign(def.rest[1]);
      const px = -sn * side, py = c * side; // outward perpendicular
      const out = def.kind === 'front' ? 0.004 : 0.009;
      f.kx = hx + (fx - hx) * 0.5 + px * out;
      f.ky = hy + (fy - hy) * 0.5 + py * out;
      if (strokeStart && def.kind === 'mid' && this.state !== 'title') {
        this.water.disc(fx, fy, 0.012, -(0.003 + 0.012 * speedNorm));
      }
    }
    if (strokeStart && this.state === 'title') {
      this.water.disc(s.feet[2].x, s.feet[2].y, 0.012, -0.004);
      this.water.disc(s.feet[3].x, s.feet[3].y, 0.012, -0.004);
    }
  }

  loudness() {
    const s = this.strider;
    return clamp(s.speed / 0.2, 0, 1) + Math.max(0, 1.5 - s.lastPulse) * 1.2;
  }

  _sink() {
    const s = this.strider;
    s.tension = 0;
    let best = 0;
    for (const k in this.dmg) if (this.dmg[k] > best) { best = this.dmg[k]; this.cause = k; }
    this.state = 'sinking';
    this.sinkT = 0;
    this.water.disc(s.x, s.y, 0.03, -0.12);
    this.audio.sink();
  }

  _updateSinking(dt) {
    const s = this.strider;
    this.sinkT += dt;
    s.sink = smooth(this.sinkT / 1.4);
    s.vx *= 0.9; s.vy *= 0.9;
    s.x += s.vx * dt; s.y += s.vy * dt;
    this._updateLegs(dt, 0);
    if (this.sinkT > 0.2 && this.sinkT < 1.2 && Math.random() < dt * 8) this.water.disc(s.x + (Math.random() - 0.5) * 0.02, s.y + (Math.random() - 0.5) * 0.02, 0.008, 0.01);
    if (this.sinkT > 2.0) { s.visible = false; this._finish('sank'); }
  }

  _sunrise() {
    this.state = 'sunrise';
    this.stats.survived = 1;
    this.audio.chime();
    this.hint('sunrise', 4);
  }

  _finish(reason) {
    this.state = 'ended';
    const score = Math.floor(this.score);
    const res = { reason, cause: this.cause, score, stats: this.stats, time: this.time, mode: this.mode, newBest: false, newDaily: false, endlessOffered: reason === 'survived' && !this.endless };
    if (this.endless) { if (score > this.save.bestEndless) { this.save.bestEndless = score; res.newBest = true; } }
    else if (score > this.save.best) { this.save.best = score; res.newBest = true; }
    if (reason === 'survived') this.save.clears++;
    if (this.mode === 'daily') {
      const key = dailyKey();
      if (!this.save.daily || this.save.daily.key !== key || score > this.save.daily.best) {
        this.save.daily = { key, best: score, trace: this.trace.slice(0, 1200) };
        res.newDaily = true;
      }
    }
    if (!this.save.ghost || score >= (this.save.ghostScore || 0)) { this.save.ghost = this.trace.slice(0, 1200); this.save.ghostScore = score; }
    this._store();
    if (this.onEnd) this.onEnd(res);
  }

  // ---- food --------------------------------------------------------------
  _updateGnats(dt, env) {
    const live = this.gnats.filter((g) => g.state !== 'gone').length;
    this.spawnAcc.gnat += dt * env.gnatRate * (live < 7 ? 1 : 0);
    while (this.spawnAcc.gnat >= 1) {
      this.spawnAcc.gnat -= 1;
      const a = this.rng() * TAU, r = Math.sqrt(this.rng()) * (POND_R - 0.06);
      const mosquito = this.rng() < 0.25;
      this.gnats.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r, kind: mosquito ? 1 : 0, state: 'fall', t: 0, life: mosquito ? 13 : 24, burst: this.rng() * 0.8, wing: this.rng() * TAU, stun: 0, heading: this.rng() * TAU, size: mosquito ? 0.012 : 0.0085 });
    }
    for (const g of this.gnats) {
      g.t += dt;
      g.wing += dt * (g.stun > 0 ? 2 : 38);
      if (g.state === 'fall') {
        if (g.t > 0.8) { g.state = 'struggle'; g.t = 0; this.water.disc(g.x, g.y, 0.008, 0.012 + 0.01 * g.kind); this.audio.blip(0.15, (g.x - 0.5) * 2); }
        continue;
      }
      if (g.state === 'struggle') {
        if (g.stun > 0) {
          g.stun -= dt;
        } else {
          g.burst -= dt;
          if (g.burst <= 0) {
            g.burst = g.kind ? 0.75 : 1.1;
            g.wiggle = 3 + g.kind * 2; g.wiggleT = 0;
          }
          if (g.wiggle > 0) {
            g.wiggleT -= dt;
            if (g.wiggleT <= 0) { g.wiggleT = 0.07; g.wiggle--; this.water.disc(g.x, g.y, 0.006, (g.kind ? 0.0075 : 0.0045) * (g.wiggle % 2 ? 1 : -0.8)); }
          }
          // drift
          g.x += (Math.sin(g.heading) * 0.002 + env.windX * 0.004) * dt;
          g.y += (Math.cos(g.heading) * 0.002 + env.windY * 0.004) * dt;
          if (g.t > g.life) { g.state = 'escape'; g.t = 0; }
        }
        // a strong crest flips it
        const smp = this.water.sample(g.x, g.y);
        if (smp.h > 0.045 && g.stun <= 0 && g.t > 0.5) {
          g.stun = 4.5; g.life += 4.5;
          g.x -= smp.gx * 0.0015; g.y -= smp.gy * 0.0015;
          this.fx.push({ type: 'spark', x: g.x, y: g.y, t: 0, dur: 0.5, col: [1, 0.9, 0.6], size: 0.02 });
        }
        const dd = Math.hypot(g.x - 0.5, g.y - 0.5);
        if (dd > POND_R - 0.01) { g.state = 'escape'; g.t = 0; }
      } else if (g.state === 'escape') {
        g.x += Math.cos(g.heading) * 0.12 * dt; g.y += Math.sin(g.heading) * 0.12 * dt;
        if (g.t > 0.8) g.state = 'gone';
      }
    }
    this.gnats = this.gnats.filter((g) => g.state !== 'gone');
  }

  _checkEating() {
    const s = this.strider;
    const hx = s.x + Math.cos(s.heading) * 0.016, hy = s.y + Math.sin(s.heading) * 0.016;
    for (const g of this.gnats) {
      if (g.state !== 'struggle') continue;
      const d = Math.hypot(g.x - hx, g.y - hy);
      if (d < 0.016 + g.size * 0.6) {
        g.state = 'gone';
        const pts = (g.kind ? 80 : 50) + (g.stun > 0 ? 60 : 0);
        this.score += pts;
        this.stats.gnats++;
        s.hunger = Math.min(1, s.hunger + (g.kind ? 0.45 : 0.32));
        s.weight += g.kind ? 0.42 : 0.28;
        this.audio.eat();
        this.fx.push({ type: 'spark', x: g.x, y: g.y, t: 0, dur: 0.45, col: [1, 0.95, 0.7], size: 0.016 });
        this.fx.push({ type: 'text', x: g.x, y: g.y, t: 0, dur: 0.9, pts });
        if (s.weight > 1.05) this.hint('heavy · the skin strains', 2.2);
      }
    }
  }

  // ---- rain --------------------------------------------------------------
  _updateDrops(dt, env) {
    this.spawnAcc.rain += dt * env.rain;
    while (this.spawnAcc.rain >= 1) {
      this.spawnAcc.rain -= 1;
      const a = this.rng() * TAU, r = Math.sqrt(this.rng()) * 0.5;
      this._spawnDrop(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, env.dropSize * (0.75 + this.rng() * 0.5));
    }
    // teaching drops: placed near the player so the first cancel comes early
    if (this.state === 'playing' && !this.endless && this.teach.i < this.teach.drops.length && this.time >= this.teach.drops[this.teach.i]) {
      this.teach.i++;
      const s = this.strider;
      const a = this.rng() * TAU, d = 0.13;
      let x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
      const dd = Math.hypot(x - 0.5, y - 0.5);
      if (dd > POND_R - 0.05) { x = 0.5 + (x - 0.5) / dd * (POND_R - 0.08); y = 0.5 + (y - 0.5) / dd * (POND_R - 0.08); }
      this._spawnDrop(x, y, 0.9);
      if (this.teach.i === 1) this.hint('a drop · pulse when the ring is dark', 3.5);
    }
    for (const d of this.drops) {
      d.t += dt;
      if (d.t >= d.fall) {
        d.done = true;
        const onPond = Math.hypot(d.x - 0.5, d.y - 0.5) < POND_R;
        if (onPond) {
          this.water.disc(d.x, d.y, 0.011 + 0.009 * d.size, 0.08 + 0.09 * d.size);
          this.splashes.push({ x: d.x, y: d.y, t: 0, dur: 0.38, size: 0.016 + 0.014 * d.size, seed: Math.random() * 10 });
        }
        this.audio.blip(d.size * (onPond ? 1 : 0.4), clamp((d.x - this.cam.x) * 3, -1, 1));
      }
    }
    this.drops = this.drops.filter((d) => !d.done);
  }

  _spawnDrop(x, y, size) { this.drops.push({ x, y, size, t: 0, fall: 1.15 }); }

  _updateSplashes(dt) {
    for (const s of this.splashes) s.t += dt;
    this.splashes = this.splashes.filter((s) => s.t < s.dur);
  }

  // ---- slicks & zones ----------------------------------------------------
  _updateSlicks(dt, env) {
    this.spawnAcc.slick += dt * env.slickRate * (this.slicks.length < 6 ? 1 : 0);
    while (this.spawnAcc.slick >= 1) {
      this.spawnAcc.slick -= 1;
      const wl = Math.hypot(env.windX, env.windY) || 0.2;
      const ux = -env.windX / wl, uy = -env.windY / wl;        // upwind
      const side = (this.rng() - 0.5) * 0.7;
      const px = ux * (POND_R - 0.02) + -uy * side, py = uy * (POND_R - 0.02) + ux * side;
      this.slicks.push({ x: 0.5 + px, y: 0.5 + py, r: 0.045 + this.rng() * 0.05, t: 0, kind: this.rng() < 0.5 ? 'oil' : 'soap' });
    }
    for (const s of this.slicks) {
      s.t += dt;
      s.x += (env.windX * 0.022 + Math.sin(s.t * 0.7) * 0.002) * dt;
      s.y += (env.windY * 0.022 + Math.cos(s.t * 0.9) * 0.002) * dt;
      const d = Math.hypot(s.x - 0.5, s.y - 0.5);
      if (d > POND_R + s.r + 0.02 || s.t > 150) s.dead = true;
    }
    this.slicks = this.slicks.filter((s) => !s.dead);
  }

  _inSlick(x, y) {
    for (const s of this.slicks) if (Math.hypot(x - s.x, y - s.y) < s.r * 0.85) return true;
    return false;
  }

  _updateZones(dt) {
    for (const z of this.zones) z.t += dt;
    this.zones = this.zones.filter((z) => z.t < z.dur);
  }

  _pushZones() {
    const out = this.water.zones;
    out.length = 0;
    for (const z of this.zones) {
      const k = z.t / z.dur;
      const fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      out.push({ x: z.x, y: z.y, r: z.r, s: z.s * fade });
      if (out.length >= 8) break;
    }
    for (const s of this.slicks) {
      if (out.length >= 12) break;
      out.push({ x: s.x, y: s.y, r: s.r, s: 0.5 });
    }
  }

  // ---- fish --------------------------------------------------------------
  _updateFish(dt, env) {
    const f = this.fish;
    const s = this.strider;
    f.t -= dt;
    f.cool = Math.max(0, f.cool - dt);
    const aggro = env.fish;
    switch (f.state) {
      case 'hidden':
        f.visible = false; f.depth = 0.05; f.mouth = 0;
        if (aggro > 0 && f.t <= 0) {
          f.state = 'prowl'; f.t = 12 + this.rng() * 8;
          const a = this.rng() * TAU; f.x = 0.5 + Math.cos(a) * 0.3; f.y = 0.5 + Math.sin(a) * 0.3; f.heading = a + Math.PI / 2;
          f.visible = true;
        }
        break;
      case 'prowl': {
        f.depth = lerp(f.depth, 0.3, dt * 1.5);
        // lazy circling
        const ang = Math.atan2(f.y - 0.5, f.x - 0.5) + dt * 0.25;
        const rr = 0.28 + 0.06 * Math.sin(this.time * 0.3);
        const nx = 0.5 + Math.cos(ang) * rr, ny = 0.5 + Math.sin(ang) * rr;
        f.heading = Math.atan2(ny - f.y, nx - f.x);
        f.x = nx; f.y = ny;
        if (f.t <= 0 && this.state === 'playing') {
          if (this.rng() < aggro * 0.8) { f.state = 'stalk'; f.t = 7; }
          else { f.state = 'retreat'; f.t = 1.2; }
        }
        break;
      }
      case 'stalk': {
        f.depth = lerp(f.depth, 0.5, dt * 1.2);
        const ang = Math.atan2(s.y - f.y, s.x - f.x);
        let da = Math.atan2(Math.sin(ang - f.heading), Math.cos(ang - f.heading));
        f.heading += da * Math.min(1, dt * 2.2);
        const sp = 0.075 * (1 + 0.3 * aggro);
        f.x += Math.cos(f.heading) * sp * dt; f.y += Math.sin(f.heading) * sp * dt;
        const d = Math.hypot(s.x - f.x, s.y - f.y);
        if (d < 0.09 || f.t <= 0) {
          if (d < 0.16) { f.state = 'rise'; f.t = 1.6; f.tx = s.x; f.ty = s.y; this.audio.rumble(1.6); }
          else { f.state = 'retreat'; f.t = 1.2; }
        }
        break;
      }
      case 'rise': {
        const k = 1 - f.t / 1.6;
        f.depth = lerp(0.55, 0.97, smooth(k));
        f.x = lerp(f.x, f.tx - Math.cos(f.heading) * 0.06, dt * 3);
        f.y = lerp(f.y, f.ty - Math.sin(f.heading) * 0.06, dt * 3);
        f.heading = Math.atan2(f.ty - f.y, f.tx - f.x);
        f.mouth = smooth(k * 1.5 - 0.3);
        if (f.t <= 0) {
          f.state = 'lunge'; f.t = 0.3;
          const mx = f.x + Math.cos(f.heading) * 0.07, my = f.y + Math.sin(f.heading) * 0.07;
          this.water.disc(mx, my, 0.045, 0.22);
          this.splashes.push({ x: mx, y: my, t: 0, dur: 0.5, size: 0.06, seed: 3 });
          this.audio.splashBig();
          const d = Math.hypot(s.x - mx, s.y - my);
          if (d < 0.055 && this.state === 'playing') {
            s.tension -= 0.45; this.dmg.fish += 0.45; s.hurtT = 1; this.audio.hurt(); this.combo = 0;
            const push = 0.5; s.vx += (s.x - mx) / (d + 1e-4) * push; s.vy += (s.y - my) / (d + 1e-4) * push;
            this.hint('the god below', 2.5);
          }
        }
        break;
      }
      case 'lunge':
        f.depth = 1; f.mouth = 1;
        if (f.t <= 0) { f.state = 'retreat'; f.t = 1.4; }
        break;
      case 'retreat':
        f.depth = lerp(f.depth, 0.0, dt * 1.6);
        f.mouth = lerp(f.mouth, 0, dt * 6);
        f.x += Math.cos(f.heading + Math.PI) * 0.06 * dt; f.y += Math.sin(f.heading + Math.PI) * 0.06 * dt;
        if (f.t <= 0) { f.state = 'hidden'; f.t = (16 + this.rng() * 18) / Math.max(0.3, aggro); f.visible = false; }
        break;
    }
    // a strong crest on its back scares it off (strike)
    if ((f.state === 'stalk' || f.state === 'rise') && f.cool <= 0) {
      const smp = this.water.sample(f.x, f.y);
      if (smp.h > 0.05) {
        f.state = 'retreat'; f.t = 1.6; f.cool = 3;
        this.score += 150; this.stats.fishScared++;
        this.water.disc(f.x, f.y, 0.04, -0.08);
        this.fx.push({ type: 'text', x: f.x, y: f.y, t: 0, dur: 1.2, pts: 150 });
        this.fx.push({ type: 'spark', x: f.x, y: f.y, t: 0, dur: 0.6, col: [0.9, 1, 1], size: 0.05 });
        this.audio.blip(1);
        this.hint('struck · it flees', 2);
      }
    }
    if (f.visible && f.state !== 'hidden') {
      const d = Math.hypot(f.x - 0.5, f.y - 0.5);
      if (d > POND_R - 0.05) { f.x = 0.5 + (f.x - 0.5) / d * (POND_R - 0.05); f.y = 0.5 + (f.y - 0.5) / d * (POND_R - 0.05); }
    }
  }

  // ---- frog --------------------------------------------------------------
  _updateFrog(dt, env) {
    const fr = this.frog, s = this.strider;
    fr.t -= dt;
    if (fr.state === 'away') {
      fr.visible = false;
      if (env.frog && fr.t <= 0) {
        fr.ang = this.rng() * TAU;
        fr.x = 0.5 + Math.cos(fr.ang) * (POND_R + 0.045);
        fr.y = 0.5 + Math.sin(fr.ang) * (POND_R + 0.045);
        fr.face = fr.ang + Math.PI;
        fr.state = 'sit'; fr.t = 40 + this.rng() * 20; fr.visible = true; fr.glint = 0;
        this.water.disc(0.5 + Math.cos(fr.ang) * (POND_R - 0.01), 0.5 + Math.sin(fr.ang) * (POND_R - 0.01), 0.03, 0.09);
        this.audio.blip(0.8, clamp((fr.x - this.cam.x) * 3, -1, 1));
      }
      return;
    }
    if (!env.frog && fr.state === 'sit') { fr.state = 'hop'; fr.t = 0.4; }
    const d = Math.hypot(s.x - fr.x, s.y - fr.y);
    if (fr.state === 'sit') {
      fr.glint = lerp(fr.glint, 0, dt * 4);
      if (d < 0.23 && fr.cool <= 0 && this.state === 'playing') { fr.state = 'aim'; fr.t = 0.85; }
      else if (fr.t <= 0) { fr.state = 'hop'; fr.t = 0.4; }
      fr.cool = Math.max(0, (fr.cool || 0) - dt);
    } else if (fr.state === 'aim') {
      fr.glint = clamp(1 - fr.t / 0.85, 0, 1);
      fr.face = Math.atan2(s.y - fr.y, s.x - fr.x);
      if (fr.t <= 0) {
        fr.state = 'tongue'; fr.t = 0.34;
        this.tongue = { x0: fr.x + Math.cos(fr.face) * 0.02, y0: fr.y + Math.sin(fr.face) * 0.02, tx: s.x, ty: s.y, t: 0, hit: false };
      }
    } else if (fr.state === 'tongue') {
      const tg = this.tongue;
      tg.t += dt;
      const k = tg.t < 0.12 ? tg.t / 0.12 : Math.max(0, 1 - (tg.t - 0.12) / 0.22);
      tg.k = k;
      tg.x = lerp(tg.x0, tg.tx, k); tg.y = lerp(tg.y0, tg.ty, k);
      if (!tg.hit && tg.t >= 0.1 && tg.t < 0.16 && this.state === 'playing') {
        if (Math.hypot(s.x - tg.tx, s.y - tg.ty) < 0.026) {
          tg.hit = true; s.tension -= 0.45; this.dmg.frog += 0.45; s.hurtT = 1; this.audio.hurt(); this.combo = 0;
          s.vx += Math.cos(fr.face + Math.PI) * 0.25; s.vy += Math.sin(fr.face + Math.PI) * 0.25;
          this.hint('frog · keep to the open centre', 2.5);
        }
      }
      if (fr.t <= 0) { fr.state = 'sit'; fr.t = 30; fr.cool = 5.5; this.tongue = null; fr.glint = 0; }
    } else if (fr.state === 'hop') {
      if (fr.t <= 0) {
        fr.state = 'away'; fr.t = 8 + this.rng() * 10; fr.visible = false;
        this.water.disc(0.5 + Math.cos(fr.ang) * (POND_R - 0.02), 0.5 + Math.sin(fr.ang) * (POND_R - 0.02), 0.035, 0.16);
        this.splashes.push({ x: 0.5 + Math.cos(fr.ang) * (POND_R - 0.02), y: 0.5 + Math.sin(fr.ang) * (POND_R - 0.02), t: 0, dur: 0.45, size: 0.035, seed: 5 });
        this.audio.splashBig();
      }
    }
  }

  // ---- backswimmers ------------------------------------------------------
  _updateBugs(dt, env) {
    const s = this.strider;
    while (this.bugs.length < env.bugs) {
      const a = this.rng() * TAU;
      this.bugs.push({ x: 0.5 + Math.cos(a) * (POND_R - 0.06), y: 0.5 + Math.sin(a) * (POND_R - 0.06), heading: a + Math.PI, size: 0.016, state: 'hunt', t: 0, wake: 0, stun: 0, flee: 0, turnT: 0 });
    }
    if (env.bugs === 0 && this.bugs.length) { for (const b of this.bugs) b.leaving = true; }
    for (const b of this.bugs) {
      b.t += dt;
      if (b.stun > 0) {
        b.stun -= dt; b.heading += dt * 4;
        continue;
      }
      let speed = 0.11;
      let target = null;
      if (b.leaving) {
        const ang = Math.atan2(b.y - 0.5, b.x - 0.5);
        target = { x: 0.5 + Math.cos(ang) * (POND_R + 0.1), y: 0.5 + Math.sin(ang) * (POND_R + 0.1) };
        if (Math.hypot(b.x - 0.5, b.y - 0.5) > POND_R + 0.03) b.dead = true;
      } else if (b.flee > 0) {
        b.flee -= dt;
        target = { x: b.x + (b.x - s.x), y: b.y + (b.y - s.y) };
        speed = 0.16;
      } else {
        // pick the loudest vibration source in range
        let best = 0.12, bx = null;
        const loud = this.loudness();
        const ds = Math.hypot(s.x - b.x, s.y - b.y);
        if (ds < 0.42 && this.state === 'playing') { const v = loud / (0.3 + ds * 2); if (v > best) { best = v; bx = s; } }
        for (const g of this.gnats) {
          if (g.state !== 'struggle' || g.stun > 0) continue;
          const dg = Math.hypot(g.x - b.x, g.y - b.y);
          const v = 0.55 / (0.3 + dg * 2);
          if (dg < 0.35 && v > best) { best = v; bx = g; }
        }
        if (bx) { target = bx; b.wander = null; }
        else {
          b.turnT -= dt;
          if (!b.wander || b.turnT <= 0) {
            const a = this.rng() * TAU, r = Math.sqrt(this.rng()) * (POND_R - 0.08);
            b.wander = { x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r }; b.turnT = 4 + this.rng() * 4;
          }
          target = b.wander; speed = 0.06;
        }
      }
      if (target) {
        const ang = Math.atan2(target.y - b.y, target.x - b.x);
        const da = Math.atan2(Math.sin(ang - b.heading), Math.cos(ang - b.heading));
        b.heading += da * Math.min(1, dt * 3.5);
      }
      b.x += Math.cos(b.heading) * speed * dt; b.y += Math.sin(b.heading) * speed * dt;
      const dd = Math.hypot(b.x - 0.5, b.y - 0.5);
      if (!b.leaving && dd > POND_R - 0.03) { b.x = 0.5 + (b.x - 0.5) / dd * (POND_R - 0.03); b.y = 0.5 + (b.y - 0.5) / dd * (POND_R - 0.03); b.heading += Math.PI * 0.5; }
      // wake: a stream of small impulses → V-shaped pattern emerges from the sim
      b.wake -= dt;
      if (b.wake <= 0 && speed > 0.07) { b.wake = 0.055; this.water.disc(b.x, b.y, 0.008, 0.0045); }
      // interactions
      if (!b.leaving && b.flee <= 0) {
        for (const g of this.gnats) {
          if (g.state === 'struggle' && Math.hypot(g.x - b.x, g.y - b.y) < 0.016) { g.state = 'gone'; b.flee = 1.5; }
        }
        const ds = Math.hypot(s.x - b.x, s.y - b.y);
        if (ds < 0.022 && this.loudness() > 0.15 && this.state === 'playing') {
          s.tension -= 0.3; this.dmg.bug += 0.3; s.hurtT = 1; this.audio.hurt(); this.combo = 0; b.flee = 4;
          this.hint('backswimmer · stop moving to go silent', 3);
        }
      }
      const smp = this.water.sample(b.x, b.y);
      if (smp.h > 0.06 && b.t > 1) {
        b.stun = 3.5; this.score += 80; this.stats.bugsStunned++;
        this.fx.push({ type: 'text', x: b.x, y: b.y, t: 0, dur: 1, pts: 80 });
        this.fx.push({ type: 'spark', x: b.x, y: b.y, t: 0, dur: 0.5, col: [1, 1, 0.8], size: 0.03 });
      }
    }
    this.bugs = this.bugs.filter((b) => !b.dead);
  }

  // ---- ghost (your best run's faint ripples) ----------------------------
  _updateGhost(dt) {
    const tr = this.ghostTrace;
    if (!tr || !tr.length) { this.ghostPos = null; return; }
    const t = this.time;
    let i = this.ghostI || 0;
    while (i < tr.length - 1 && tr[i + 1][0] <= t) i++;
    this.ghostI = i;
    if (t > tr[tr.length - 1][0] + 1) { this.ghostPos = null; return; }
    const a = tr[i], b = tr[Math.min(i + 1, tr.length - 1)];
    const k = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 0;
    this.ghostPos = { x: lerp(a[1], b[1], k), y: lerp(a[2], b[2], k) };
    this.ghostT -= dt;
    if (this.ghostT <= 0) { this.ghostT = 0.5; this.water.disc(this.ghostPos.x, this.ghostPos.y, 0.01, 0.0025); }
  }

  _updateFx(dt) {
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.dur);
  }

  // ---- camera & view -----------------------------------------------------
  setViewport(cssW, cssH) { this.cssW = cssW; this.cssH = cssH; }

  updateCamera(dt) {
    const W = this.cssW, H = this.cssH;
    const s = this.strider;
    let px = Math.max(Math.min(W, H) * 1.3, 0.9 * Math.max(W, H));
    if (this.state === 'title') px = Math.min(W, H) * 1.7;
    const far = Math.min(W, H) * 0.86;
    if (this.cam.reveal > 0) px = lerp(px, far, smooth(this.cam.reveal));
    if (this.debugZoom) px *= this.debugZoom;
    this.cam.scale = lerp(this.cam.scale || px, px, Math.min(1, dt * 3));
    const hx = W / (2 * this.cam.scale), hy = H / (2 * this.cam.scale);
    let tx = s.x + s.vx * 0.25, ty = s.y + s.vy * 0.25;
    if (this.state === 'title' || this.cam.reveal > 0.5) { tx = lerp(tx, 0.5, this.state === 'title' ? 1 : smooth((this.cam.reveal - 0.5) * 2)); ty = lerp(ty, 0.5, this.state === 'title' ? 1 : smooth((this.cam.reveal - 0.5) * 2)); }
    const m = 0.06;
    const minX = Math.min(0.5, -m + hx), maxX = Math.max(0.5, 1 + m - hx);
    const minY = Math.min(0.5, -m + hy), maxY = Math.max(0.5, 1 + m - hy);
    tx = clamp(tx, minX, maxX); ty = clamp(ty, minY, maxY);
    const k = Math.min(1, dt * 4);
    this.cam.x = lerp(this.cam.x, tx, k); this.cam.y = lerp(this.cam.y, ty, k);
  }

  _makeView() {
    return {
      cam: { x: 0.5, y: 0.5, scale: 1000 }, time: 0, focusY: 0.5, senseR: 0.16,
      env: { night: 0, storm: 0, dawn: 1, sun: [0, 0, 1], fog: 0, glow: 1, normalScale: 0.1, caustic: 110, dof: 0.7, bloom: 0.5, bloomThr: 0.9, flash: 0, vignette: 0.45, micro: 0.02, wind: [1, 0] },
      strider: null, fish: null, bug: { x: 0, y: 0, heading: 0, size: 0, visible: false }, slicks: [], ghost: { x: 0, y: 0, r: 0, a: 0 },
    };
  }

  buildView(renderScale) {
    const v = this.view;
    const e = this.env || this.envAt(0);
    v.cam.x = this.cam.x; v.cam.y = this.cam.y; v.cam.scale = this.cam.scale * renderScale;
    v.time = this.wall;
    const az = -0.9 + 0.3 * Math.sin(this.time * 0.003);
    const el = lerp(1.3, 1.15, e.dawn);
    v.env.sun = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
    v.env.night = e.night; v.env.storm = e.storm; v.env.dawn = e.dawn;
    v.env.fog = e.night * 0.6 * (this.state === 'playing' ? 1 : 0.5);
    v.env.glow = 1.0;
    v.env.normalScale = 0.085;
    v.env.caustic = 110;
    v.env.dof = lerp(0.7, 0.35, this.cam.reveal);
    v.env.bloom = lerp(0.5, 0.6, e.night);
    v.env.bloomThr = lerp(0.9, 0.5, e.night);
    v.env.micro = 0.006 + 0.02 * Math.min(1.3, e.wind);
    const wl = Math.hypot(e.windX, e.windY) || 1;
    v.env.wind[0] = e.windX / wl; v.env.wind[1] = e.windY / wl;
    v.env.flash = this.flash;
    v.env.vignette = lerp(0.45, 0.6, e.night);
    v.strider = this.strider;
    v.fish = this.fish;
    const b = this.bugs.find((x) => !x.dead);
    if (b) { v.bug.x = b.x; v.bug.y = b.y; v.bug.heading = b.heading; v.bug.size = b.size; v.bug.visible = true; }
    else v.bug.visible = false;
    v.slicks = this.slicks;
    v.senseR = this.senseR || 0.16;
    v.focusY = clamp(0.5 + (this.strider.y - this.cam.y) * this.cam.scale / this.cssH, 0.2, 0.8);
    if (this.ghostPos) { v.ghost.x = this.ghostPos.x; v.ghost.y = this.ghostPos.y; v.ghost.r = 0.012; v.ghost.a = 0.6; }
    else v.ghost.a = 0;
    return v;
  }

  // ---- sprites -----------------------------------------------------------
  drawSprites(r, additive, joy) {
    const s = this.strider;
    const e = this.env || this.envAt(0);
    const night = e.night;
    if (!additive) {
      // raindrop shadows
      for (const d of this.drops) {
        const k = d.t / d.fall;
        const size = lerp(0.004, 0.016, k) * (0.7 + 0.5 * d.size);
        r.sprite(d.x, d.y, size, 0, 9, 0.2, 0, 0, 0.02, 0.03, 0.05, 0.22 + 0.4 * k * k);
      }
      // slick faint edge marker (helps readability)
      // gnats
      for (const g of this.gnats) {
        if (g.state === 'fall') { const k = g.t / 0.8; r.sprite(g.x, g.y, g.size * (0.4 + 0.6 * k), 0, 9, 0.3, 0, 0, 0.02, 0.03, 0.05, 0.3 * k); continue; }
        let a = 1, size = g.size;
        if (g.state === 'escape') { a = 1 - g.t / 0.8; size *= 1 + g.t; }
        const vis = night > 0.5 ? (Math.hypot(g.x - s.x, g.y - s.y) < (this.senseR || 0.16) ? 1 : 0.35) : 1;
        const col = g.kind ? [0.22, 0.17, 0.14] : [0.12, 0.1, 0.1];
        r.sprite(g.x, g.y, size, g.heading, 2, g.wing, g.kind, g.stun > 0 ? 1 : 0, col[0], col[1], col[2], a * vis);
      }
      // strider legs & body
      if (s.visible) {
        const fade = 1 - s.sink * 0.8;
        const lc = [0.2, 0.15, 0.1];
        for (let i = 0; i < 6; i++) {
          const f = s.feet[i];
          const rad = 0.0012;
          r.capsule(f.hx, f.hy, f.kx, f.ky, rad * 1.1, lc[0], lc[1], lc[2], fade);
          r.capsule(f.kx, f.ky, f.x, f.y, rad, lc[0], lc[1], lc[2], fade);
        }
        const hurt = s.hurtT > 0 ? 0.5 + 0.5 * Math.sin(this.wall * 40) : 0;
        r.sprite(s.x, s.y, 0.028, s.heading, 6, s.sink, 0, 0, lerp(0.15, 0.55, hurt * 0.35), lerp(0.11, 0.18, hurt * 0.2), 0.08, fade);
      }
      // frog + tongue
      const fr = this.frog;
      if (fr.visible) {
        r.sprite(fr.x, fr.y, 0.03, 0, 5, fr.glint, fr.face, 0, 0.32, 0.5, 0.2, 1);
      }
      if (this.tongue && this.tongue.k > 0) {
        const tg = this.tongue;
        r.capsule(tg.x0, tg.y0, tg.x, tg.y, 0.0035, 0.92, 0.42, 0.48, 1);
        r.sprite(tg.x, tg.y, 0.007, 0, 0, 0.6, 0, 0, 0.95, 0.5, 0.55, 1);
      }
      // splashes
      for (const sp of this.splashes) {
        const k = sp.t / sp.dur;
        r.sprite(sp.x, sp.y, sp.size * (0.5 + 0.9 * k), 0, 7, lerp(0.3, 0.95, k), 1 - k, sp.seed, 0.95, 0.97, 1.0, 0.8);
      }
      // HUD arcs around the strider
      if (this.state === 'playing' || this.state === 'sinking') {
        const R = 0.058;
        const tf = s.tension;
        const ta = 0.25 + 0.65 * (1 - tf) + (s.hurtT > 0 ? 0.3 : 0);
        const tc = tf > 0.5 ? [lerp(1, 1, 0), lerp(0.75, 1, (tf - 0.5) * 2), lerp(0.3, 1, (tf - 0.5) * 2)] : [1, lerp(0.2, 0.75, tf * 2), lerp(0.1, 0.3, tf * 2)];
        r.sprite(s.x, s.y, R, 0, 3, Math.PI * 0.25, Math.PI * 0.25 + Math.PI * 0.5 * Math.max(0.01, tf), 0.045, tc[0], tc[1], tc[2], ta);
        const hf = s.hunger;
        const ha = 0.2 + 0.6 * (1 - hf);
        const hc = hf > 0.4 ? [0.55, 0.9, 0.5] : [0.95, 0.6, 0.3];
        r.sprite(s.x, s.y, R, 0, 3, -Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 0.5 * Math.max(0.01, hf), 0.045, hc[0], hc[1], hc[2], ha);
        if (s.weight > 0.9) {
          const wf = clamp((s.weight - 0.9) / 0.6, 0, 1);
          r.sprite(s.x, s.y, R * 0.8, 0, 3, Math.PI * 0.8, Math.PI * 0.8 + 0.3 * wf, 0.05, 1, 0.5, 0.4, 0.6);
        }
      }
      // joystick
      if (joy) {
        r.sprite(joy.sx, joy.sy, joy.r, 0, 10, 0, 0, 0, 1, 1, 1, 0.35);
        r.sprite(joy.cx, joy.cy, joy.r * 0.35, 0, 0, 0.7, 0, 0, 1, 1, 1, 0.5);
      }
    } else {
      // phase ring (the signature verb's metronome)
      if (this.state === 'playing') {
        const pv = this.phaseValue();
        const sign = pv >= 0 ? 1 : -1;
        const col = sign > 0 ? [1.0, 0.8, 0.45] : [0.3, 0.55, 1.0];
        const rr = 0.68 + 0.14 * pv;
        const base = 0.16 + 0.12 * Math.abs(pv) + 0.6 * this.ready * (sign < 0 ? 1 : 0.3);
        const cool = s.pulseCool > 0 ? 0.35 : 1;
        r.sprite(s.x, s.y, 0.07, 0, 1, rr, 0.03 + 0.03 * this.ready, 0.08, col[0], col[1], col[2], base * cool);
        if (this.ready > 0.3 && sign < 0) r.sprite(s.x, s.y, 0.07 * rr, this.wall * 2, 8, 0, 0, 0, 0.5, 0.8, 1, 0.25 * this.ready * (0.6 + 0.4 * Math.sin(this.wall * 12)));
        // sense radius hint at night: faint halos on prey you can feel
        if (night > 0.3) {
          for (const g of this.gnats) {
            if (g.state !== 'struggle') continue;
            const d = Math.hypot(g.x - s.x, g.y - s.y);
            if (d < (this.senseR || 0.16)) r.sprite(g.x, g.y, 0.02, 0, 0, 0.0, 0, 0, 0.3, 0.9, 1.0, 0.18 * night * (0.6 + 0.4 * Math.sin(this.wall * 6 + g.wing)));
          }
        }
      }
      // frog eye glint
      const fr = this.frog;
      if (fr.visible && fr.glint > 0.05) {
        const gx = fr.x + Math.cos(fr.face) * 0.0135, gy = fr.y + Math.sin(fr.face) * 0.0135;
        r.sprite(gx, gy, 0.014 * fr.glint, this.wall * 3, 8, 0, 0, 0, 1, 0.95, 0.7, 0.9 * fr.glint);
      }
      // fish rising: soft warning glow under the water
      const f = this.fish;
      if (f.visible && f.state === 'rise') {
        const k = f.depth;
        r.sprite(f.x + Math.cos(f.heading) * 0.05, f.y + Math.sin(f.heading) * 0.05, 0.09 * k, 0, 0, 0.0, 0, 0, 0.9, 0.5, 0.3, 0.12 * k * (0.5 + 0.5 * Math.sin(this.wall * 14)));
      }
      // effects
      for (const x of this.fx) {
        const k = x.t / x.dur;
        if (x.type === 'ring') {
          const rr = lerp(x.r0, x.r1, smooth(k));
          r.sprite(x.x, x.y, rr * 1.15, 0, 1, 0.87, 0.04, 0.1, x.col[0], x.col[1], x.col[2], x.a * (1 - k));
        } else if (x.type === 'spark') {
          r.sprite(x.x, x.y, x.size * (0.5 + k), this.wall * 4, 8, 0, 0, 0, x.col[0], x.col[1], x.col[2], (1 - k) * 0.9);
        }
      }
      // ghost marker glow
      if (this.ghostPos) r.sprite(this.ghostPos.x, this.ghostPos.y, 0.012, 0, 0, 0.0, 0, 0, 0.4, 0.8, 1.0, 0.2);
    }
  }

  // text popups for the DOM layer
  popups() {
    const out = [];
    for (const x of this.fx) if (x.type === 'text') out.push(x);
    return out;
  }
}
