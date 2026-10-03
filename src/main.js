import { createContext } from './gl.js';
import { Water } from './water.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Game, UPGRADES } from './game.js';
import { dailyKey } from './rng.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const params = new URLSearchParams(location.search);

const ctx = createContext(canvas);
if (!ctx) {
  $('err').hidden = false;
  throw new Error('WebGL2 unavailable');
}
const { gl, caps } = ctx;

// ---- quality tiers ---------------------------------------------------------
const TIERS = [
  { name: 'high',   grid: 256, substeps: 2, scaleCap: 2.0, mul: 1.0,  dof: true,  bloom: true, blurDiv: 4, micro: true },
  { name: 'medium', grid: 256, substeps: 2, scaleCap: 1.5, mul: 0.85, dof: true,  bloom: true, blurDiv: 4, micro: true },
  { name: 'low',    grid: 128, substeps: 1, scaleCap: 1.0, mul: 0.8,  dof: false, bloom: true, blurDiv: 8, micro: false },
];
const isMobile = navigator.maxTouchPoints > 1 && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const isSoftware = /SwiftShader|llvmpipe|Software/i.test(caps.renderer);
let tier = isSoftware ? 2 : isMobile ? 1 : 0;
let autoQuality = true;
const qParam = params.get('quality');
if (qParam && ['high', 'medium', 'low'].includes(qParam)) { tier = ['high', 'medium', 'low'].indexOf(qParam); autoQuality = false; }
try {
  const saved = localStorage.getItem('glasswater.quality');
  if (saved && !qParam) {
    if (saved === 'auto') autoQuality = true;
    else { tier = ['high', 'medium', 'low'].indexOf(saved); autoQuality = false; }
  }
} catch (_) { /* ignore */ }

const water = new Water(gl, caps, TIERS[tier].grid);
const renderer = new Renderer(gl, caps);
const input = new Input(canvas);
const audio = new AudioEngine();
const game = new Game(water, audio);

function applyTier() {
  const t = TIERS[tier];
  water.resize(t.grid);
  const dpr = Math.min(window.devicePixelRatio || 1, t.scaleCap);
  renderer.setQuality({ renderScale: dpr * t.mul, dof: t.dof, bloom: t.bloom, blurDiv: t.blurDiv, micro: t.micro });
  $('q-label').textContent = (autoQuality ? 'auto · ' : '') + t.name;
}

// ---- resize ----------------------------------------------------------------
let cssW = 0, cssH = 0;
function resize() {
  const w = Math.max(1, Math.floor(window.innerWidth)), h = Math.max(1, Math.floor(window.innerHeight));
  if (w === cssW && h === cssH) return;
  cssW = w; cssH = h;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  renderer.resize(w, h);
  game.setViewport(w, h);
}
window.addEventListener('resize', resize);
resize();
applyTier();

// ---- DOM ------------------------------------------------------------------
const ui = {
  title: $('title'), end: $('end'), pause: $('pause'), hud: $('hud'), hint: $('hint'), popups: $('popups'),
  phase: $('phase'), time: $('time'), score: $('score'), best: $('best'), dailyInfo: $('daily-info'), molts: $('molts'),
};
let paused = false;
let soundOn = true;
try { soundOn = localStorage.getItem('glasswater.sound') !== 'off'; } catch (_) { /* ignore */ }

function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${s < 10 ? '0' : ''}${s}`; }
function moltSummary() {
  const m = game.save.molts;
  const parts = Object.keys(UPGRADES).filter((k) => m[k] > 0).map((k) => `${UPGRADES[k].name} ${'·'.repeat(m[k])}`);
  return parts.length ? parts.join('  ') : 'no molts yet';
}
function showTitle() {
  ui.title.hidden = false; ui.end.hidden = true; ui.pause.hidden = true; ui.hud.classList.add('dim');
  ui.best.textContent = game.save.best ? `best ${game.save.best}` : '';
  const d = game.save.daily;
  ui.dailyInfo.textContent = dailyKey() + (d && d.key === dailyKey() ? ` · your best ${d.best}` : '');
  ui.molts.textContent = moltSummary();
  $('endless-best').textContent = game.save.bestEndless ? `endless best ${game.save.bestEndless}` : '';
  $('snd').textContent = soundOn ? 'sound on' : 'sound off';
}
function start(mode) {
  audio.init();
  audio.master && (audio.master.gain.value = soundOn ? 0.8 : 0);
  ui.title.hidden = true; ui.end.hidden = true; ui.hud.classList.remove('dim');
  game.startRun(mode);
}
$('btn-daily').onclick = () => start('daily');
$('btn-free').onclick = () => start('free');
$('q-btn').onclick = () => {
  // cycle auto → high → medium → low → auto
  if (autoQuality) { autoQuality = false; tier = 0; }
  else if (tier < 2) tier++;
  else { autoQuality = true; tier = isSoftware ? 2 : isMobile ? 1 : 0; }
  try { localStorage.setItem('glasswater.quality', autoQuality ? 'auto' : TIERS[tier].name); } catch (_) { /* ignore */ }
  applyTier();
};
$('snd').onclick = () => {
  soundOn = !soundOn;
  try { localStorage.setItem('glasswater.sound', soundOn ? 'on' : 'off'); } catch (_) { /* ignore */ }
  audio.init();
  if (audio.master) audio.master.gain.value = soundOn ? 0.8 : 0;
  $('snd').textContent = soundOn ? 'sound on' : 'sound off';
};
$('btn-resume').onclick = () => setPaused(false);
$('btn-quit').onclick = () => { setPaused(false); game.toTitle(); showTitle(); };
$('btn-again').onclick = () => start(game.mode);
$('btn-endless').onclick = () => { ui.end.hidden = true; ui.hud.classList.remove('dim'); game.continueEndless(); };
$('btn-title').onclick = () => { game.toTitle(); showTitle(); };

function setPaused(p) {
  if (game.state !== 'playing' && p) return;
  paused = p;
  ui.pause.hidden = !p;
  if (audio.ctx) { if (p) audio.ctx.suspend(); else audio.ctx.resume(); }
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') { if (game.state === 'playing' || paused) setPaused(!paused); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') setPaused(true); });
canvas.addEventListener('pointerdown', () => audio.init(), { once: true });

game.onEnd = (res) => {
  ui.hud.classList.add('dim');
  ui.end.hidden = false;
  $('end-title').textContent = res.reason === 'survived' ? (game.endless ? 'The storm took you.' : 'Sunrise.') : 'You sank.';
  const causes = { wave: 'A wave tipped you.', slick: 'The slick let go of you.', hunger: 'You starved.', weight: 'Too heavy for the skin.', fish: 'The god below took you.', frog: 'The frog.', bug: 'A backswimmer found you.' };
  $('end-sub').textContent = res.reason === 'survived' && !game.endless
    ? 'The camera pulls back. It was a puddle all along.'
    : `${causes[res.cause] || ''} You lasted ${fmtTime(res.time)}.`.trim();
  $('end-score').textContent = res.score;
  const st = res.stats;
  $('end-stats').innerHTML = [
    ['time', fmtTime(res.time)], ['eaten', st.gnats], ['cancels', st.cancels], ['perfect', st.perfect],
    ['best combo', st.bestCombo], ['fish scared', st.fishScared], ['storms', st.loops],
  ].map(([k, v]) => `<span><b>${v}</b>${k}</span>`).join('');
  $('end-best').textContent = res.newBest ? 'new best' : (res.newDaily ? 'new daily best' : '');
  $('btn-endless').hidden = !res.endlessOffered;
  // molt
  const choices = game.moltChoices();
  const box = $('molt');
  box.innerHTML = '';
  if (choices.length) {
    $('molt-title').textContent = 'Molt · choose one';
    for (const k of choices) {
      const u = UPGRADES[k];
      const lvl = game.save.molts[k];
      const el = document.createElement('button');
      el.className = 'card';
      el.innerHTML = `<b>${u.name}</b><span>${u.desc}</span><i>${'●'.repeat(lvl)}${'○'.repeat(u.max - lvl)}</i>`;
      el.onclick = () => {
        game.applyMolt(k);
        for (const c of box.children) { c.disabled = true; c.classList.toggle('picked', c === el); }
        $('molt-title').textContent = 'Molted · ' + u.name;
      };
      box.appendChild(el);
    }
  } else {
    $('molt-title').textContent = 'Fully molted';
  }
};

// popup pool
const popupPool = [];
function drawPopups() {
  const list = game.popups();
  while (popupPool.length < list.length) {
    const el = document.createElement('div');
    el.className = 'pop';
    ui.popups.appendChild(el);
    popupPool.push(el);
  }
  for (let i = 0; i < popupPool.length; i++) {
    const el = popupPool[i];
    const p = list[i];
    if (!p) { el.style.display = 'none'; continue; }
    const k = p.t / p.dur;
    const sx = (p.x - game.cam.x) * game.cam.scale + cssW / 2;
    const sy = cssH / 2 - (p.y - game.cam.y) * game.cam.scale - 34 - k * 40;
    el.style.display = 'block';
    el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%,-50%)`;
    el.style.opacity = (1 - k * k).toFixed(2);
    el.textContent = (p.perfect ? 'perfect  +' : '+') + p.pts;
    el.classList.toggle('perfect', !!p.perfect);
  }
}

let domT = 0;
function updateDom(dt) {
  domT += dt;
  drawPopups();
  if (domT < 0.1) return;
  domT = 0;
  ui.phase.textContent = game.hud.phase;
  ui.time.textContent = fmtTime(game.hud.time);
  ui.score.textContent = game.hud.score;
  if (game.hud.hint !== ui.hint.textContent) ui.hint.textContent = game.hud.hint;
  ui.hint.style.opacity = game.hud.hintT > 0 ? Math.min(1, game.hud.hintT) : 0;
}

// ---- performance monitor ---------------------------------------------------
let ema = 1 / 60, slowT = 0, fastT = 0, tierChangeT = 0;
function perf(dt) {
  ema = ema * 0.9 + dt * 0.1;
  tierChangeT += dt;
  if (!autoQuality || tierChangeT < 4) return;
  if (ema > 1 / 45) { slowT += dt; fastT = 0; } else if (ema < 1 / 58) { fastT += dt; slowT = 0; } else { slowT = 0; fastT = 0; }
  if (slowT > 2.5 && tier < 2) { tier++; slowT = 0; tierChangeT = 0; applyTier(); }
  else if (fastT > 30 && tier > 0 && !isSoftware) { tier--; fastT = 0; tierChangeT = 0; applyTier(); }
}

// ---- main loop -------------------------------------------------------------
const DT = 1 / 60;
let last = performance.now();
let acc = 0;
function joyWorld() {
  const j = input.lastTouchJoy;
  if (!j) return null;
  const toW = (px, py) => ({ x: (px - cssW / 2) / game.cam.scale + game.cam.x, y: -(py - cssH / 2) / game.cam.scale + game.cam.y });
  const a = toW(j.sx, j.sy), b = toW(j.cx, j.cy);
  return { sx: a.x, sy: a.y, cx: b.x, cy: b.y, r: 70 / game.cam.scale };
}
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  resize();
  water.pollReadback();
  if (!paused) {
    input.poll();
    game.setInput(input.dir);
    const pulses = input.takePulse();
    for (let i = 0; i < pulses; i++) game.pulse();
    acc += dt;
    let steps = 0;
    const sub = TIERS[tier].substeps;
    while (acc >= DT && steps < 3) {
      game.update(DT);
      water.step(sub);
      acc -= DT;
      steps++;
    }
    if (steps === 3) acc = 0;
    water.requestReadback();
  } else {
    input.takePulse();
  }
  game.updateCamera(dt);
  const view = game.buildView(renderer.quality.renderScale);
  const joy = joyWorld();
  renderer.render(water, view, (r, additive) => game.drawSprites(r, additive, additive ? null : joy));
  perf(dt);
  updateDom(dt);
}

showTitle();
requestAnimationFrame(frame);

// ---- debug hooks (used by tools/shot.mjs) ---------------------------------
window.__gw = {
  game, water, renderer, audio, input,
  get paused() { return paused; },
  start, tiers: TIERS, get tier() { return tier; },
  advance(seconds) {
    const sub = TIERS[tier].substeps;
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) { game.update(DT); water.step(sub); }
    water.requestReadback();
  },
  press(key, down = true) {
    if (down) input.keys.add(key); else input.keys.delete(key);
  },
  pulse() { game.pulse(); },
  jump(t) { game.time = t; },
};
if (params.get('autostart')) {
  setTimeout(() => { soundOn = false; start(params.get('mode') || 'daily'); if (params.get('t')) game.time = +params.get('t'); }, 50);
}
