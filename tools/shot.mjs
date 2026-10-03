// Headless screenshot harness: node tools/shot.mjs [outDir]
// Requires playwright-core (npm i -D playwright-core) and a Chromium binary.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const port = 8123;
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));

const exe = process.env.CHROME || fs.readdirSync('/opt/pw-browsers').filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

await page.goto(`http://localhost:${port}${process.env.PAGE || '/'}?quality=${process.env.Q || 'high'}`);
await page.waitForFunction(() => window.__gw && window.__gw.game);
await page.waitForTimeout(800);
const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });

const scenes = (process.env.SCENES || 'title,dawn,glass,wind,rain,night,downpour,sunrise').split(',');
if (scenes.includes('title')) { await page.evaluate(() => window.__gw.advance(6)); await page.waitForTimeout(300); await shot('01-title'); }

await page.evaluate(() => { window.__gw.start('daily'); window.__gw.game.god = true; });
const run = async (fn, arg) => page.evaluate(fn, arg);
const settle = async () => { for (let i = 0; i < 3; i++) await page.waitForTimeout(120); };

if (scenes.includes('dawn')) {
  await run(() => { window.__gw.press('d'); window.__gw.advance(6); window.__gw.press('d', false); window.__gw.press('w'); window.__gw.advance(3); window.__gw.press('w', false); window.__gw.advance(1.0); });
  await settle(); await shot('02-dawn-skate');
  await run(() => { window.__gw.game.time = 17.9; window.__gw.advance(1.6); });
  await settle(); await shot('03-dawn-drop');
}
if (scenes.includes('glass')) {
  await run(() => { const g = window.__gw.game; g.time = 35.9; window.__gw.advance(1.6); g.phaseT = 0.9; window.__gw.advance(0.05); g.pulse(); window.__gw.advance(0.35); });
  await settle(); await shot('04-glass-cancel');
}
if (scenes.includes('wind')) {
  await run(() => { const g = window.__gw.game; g.time = 100; g.fish.state = 'rise'; g.fish.t = 0.6; g.fish.visible = true; g.fish.x = g.strider.x + 0.05; g.fish.y = g.strider.y - 0.09; g.fish.tx = g.strider.x; g.fish.ty = g.strider.y; g.fish.heading = Math.atan2(0.09, -0.05); g.fish.depth = 0.8; g.slicks.push({ x: g.strider.x - 0.16, y: g.strider.y + 0.1, r: 0.07, t: 0, kind: 'oil' }); window.__gw.advance(0.5); });
  await settle(); await shot('05-wind-fish-slick');
}
if (scenes.includes('rain')) {
  await run(() => { window.__gw.game.time = 200; window.__gw.advance(6); });
  await settle(); await shot('06-rain-front');
}
if (scenes.includes('night')) {
  await run(() => { const g = window.__gw.game; g.time = 280; window.__gw.advance(5); g.frog.state = 'aim'; g.frog.t = 0.3; g.frog.visible = true; g.frog.ang = Math.atan2(g.strider.y - 0.5, g.strider.x - 0.5); g.frog.x = 0.5 + Math.cos(g.frog.ang) * 0.505; g.frog.y = 0.5 + Math.sin(g.frog.ang) * 0.505; g.frog.face = g.frog.ang + Math.PI; g.frog.cool = 0; window.__gw.advance(0.25); });
  await settle(); await shot('07-night-hunt');
}
if (scenes.includes('downpour')) {
  await run(() => { const g = window.__gw.game; g.time = 370; window.__gw.advance(5); g.phaseT = 0.9; window.__gw.advance(0.05); g.pulse(); window.__gw.advance(0.4); });
  await settle(); await shot('08-downpour');
}
if (scenes.includes('fish')) {
  await run(() => { const g = window.__gw.game; g.time = 110; g.envOverride = { bugs: 1, rain: 0 }; window.__gw.advance(2); g.fish.state = 'stalk'; g.fish.t = 6; g.fish.cool = 99; g.fish.visible = true; g.fish.depth = 0.5; g.fish.x = g.strider.x - 0.12; g.fish.y = g.strider.y - 0.10; g.fish.heading = Math.atan2(0.10, 0.12); g.bugs.push({ x: g.strider.x + 0.14, y: g.strider.y + 0.06, heading: 2.5, size: 0.016, state: 'hunt', t: 0, wake: 0, stun: 0, flee: 0, turnT: 9, wander: { x: g.strider.x - 0.2, y: g.strider.y + 0.2 } }); window.__gw.advance(1.5); });
  await settle(); await shot('11-fish-stalk');
  await run(() => { window.__gw.game.envOverride = null; });
}
if (scenes.includes('fishclose')) {
  await run(() => { const g = window.__gw.game; g.time = 110; g.envOverride = { bugs: 1, rain: 0 }; window.__gw.advance(1); g.fish.state = 'stalk'; g.fish.t = 6; g.fish.cool = 99; g.fish.visible = true; g.fish.depth = 0.6; g.fish.x = g.strider.x - 0.09; g.fish.y = g.strider.y - 0.04; g.fish.heading = 0.4; g.bugs.length = 0; g.bugs.push({ x: g.strider.x + 0.08, y: g.strider.y + 0.05, heading: 2.5, size: 0.016, state: 'hunt', t: 0, wake: 0, stun: 0, flee: 0, turnT: 9, wander: { x: g.strider.x - 0.2, y: g.strider.y + 0.2 } }); g.debugZoom = 2.2; window.__gw.advance(0.4); g.cam.scale *= 2.2; });
  await page.waitForTimeout(1500); await shot('12-fish-close');
  await run(() => { const g = window.__gw.game; g.debugZoom = 0; g.envOverride = null; });
}
if (scenes.includes('input')) {
  // real pointer input: drag = joystick, tap = pulse, tier switch mid-run
  const before = await page.evaluate(() => ({ x: window.__gw.game.strider.x, y: window.__gw.game.strider.y, cool: window.__gw.game.strider.pulseCool }));
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(700, 300, { steps: 8 });
  await page.waitForTimeout(900);
  const mid = await page.evaluate(() => ({ dir: { ...window.__gw.input.dir }, x: window.__gw.game.strider.x, y: window.__gw.game.strider.y }));
  await page.mouse.up();
  await page.mouse.click(300, 500);
  const queued = await page.evaluate(() => window.__gw.input.pulseQueued);
  await page.waitForTimeout(1500);
  const after = await page.evaluate((q) => ({ queued: q, cool: window.__gw.game.strider.pulseCool, lastPulse: window.__gw.game.strider.lastPulse, pulsesFx: window.__gw.game.fx.length }), queued);
  console.log('INPUT', JSON.stringify({ before, mid, after }));
  await page.evaluate(() => { const g = window.__gw; g.renderer.setQuality({ renderScale: 0.8, dof: false, bloom: true, blurDiv: 8, micro: false }); g.water.resize(128); g.advance(1); });
  await settle(); await shot('13-after-tier-drop');
  const err = await page.evaluate(() => window.__gw.renderer.gl ? 0 : 0);
}
// ---- campaign scenes ----
const botStep = `
  const g = window.__gw.game; const s = g.strider; const step = 1 / 6;
  let dir = window.__botDir || { x: 0, y: 0 }; window.__botTurn = (window.__botTurn || 0) - step;
  if (window.__botTurn <= 0) { window.__botTurn = 1 + Math.random() * 2; const a = Math.random() * 6.283; dir = { x: Math.cos(a) * 0.5, y: Math.sin(a) * 0.5 }; }
  const dc = Math.hypot(s.x - 0.5, s.y - 0.5);
  if (dc > g.pondR - 0.2) dir = { x: (0.5 - s.x) / dc, y: (0.5 - s.y) / dc };
  const goal = g.level ? g.level.recipe.goal : { type: 'survive' };
  // objectives
  if (goal.type === 'cross') { const m = g.markers.find((k) => !k.done); if (m) { const d = Math.hypot(m.x - s.x, m.y - s.y) + 1e-4; dir = { x: (m.x - s.x) / d, y: (m.y - s.y) / d }; } }
  if (goal.type === 'eat' || s.hunger < 0.5) { let best = null, bd = 1; for (const gn of g.gnats) { if (gn.state !== 'struggle') continue; const d = Math.hypot(gn.x - s.x, gn.y - s.y); if (d < bd) { bd = d; best = gn; } } if (best && bd < 0.45) dir = { x: (best.x - s.x) / bd, y: (best.y - s.y) / bd }; }
  for (const sl of g.slicks) { const d = Math.hypot(s.x - sl.x, s.y - sl.y); if (d < sl.r * 1.6) dir = { x: (s.x - sl.x) / d, y: (s.y - sl.y) / d }; }
  if (g.fish.state === 'rise') { const d = Math.hypot(s.x - g.fish.tx, s.y - g.fish.ty) + 1e-3; dir = { x: (s.x - g.fish.tx) / d, y: (s.y - g.fish.ty) / d }; }
  else if (g.fish.visible && g.fish.state === 'stalk' && goal.type !== 'scare') { const d = Math.hypot(s.x - g.fish.x, s.y - g.fish.y); if (d < 0.14) dir = { x: (s.x - g.fish.x) / d, y: (s.y - g.fish.y) / d }; }
  if (g.frog.visible && g.frog.state !== 'away') { const d = Math.hypot(s.x - g.frog.x, s.y - g.frog.y); if (d < 0.26) dir = { x: (s.x - g.frog.x) / d, y: (s.y - g.frog.y) / d }; }
  window.__botDir = dir; g.setInput(dir);
  // pulses: cancel on dark against a crest; strike on bright when hunting
  if ((g.incoming || 0) > 0.02 && g.phaseSign() < 0 && s.pulseCool <= 0) g.pulse();
  else if (goal.type === 'scare' && g.fish.visible && g.fish.depth > 0.45 && Math.hypot(s.x - g.fish.x, s.y - g.fish.y) < 0.12 && g.phaseSign() > 0 && s.pulseCool <= 0) g.pulse();
  else if (goal.type === 'stun') { const b = g.bugs[0]; if (b && Math.hypot(s.x - b.x, s.y - b.y) < 0.1 && g.phaseSign() > 0 && s.pulseCool <= 0) g.pulse(); }
  window.__gw.advance(step);
`;
if (scenes.includes('level')) {
  await run(() => { window.__gw.startLevel(0, 2); window.__gw.game.god = true; window.__gw.advance(12); });
  await settle(); await shot('20-level-glass');
  await run(() => { window.__gw.startLevel(0, 6); window.__gw.game.god = true; window.__gw.advance(5); });
  await settle(); await shot('21-level-cross');
  await run(() => { window.__gw.show('intro'); window.__gw.showIntro(0, 6); });
  await page.waitForTimeout(300); await shot('22-intro');
  await run(() => { window.__gw.showLevels(0); });
  await page.waitForTimeout(300); await shot('23-levels');
  await run(() => { window.__gw.showPonds(); });
  await page.waitForTimeout(300); await shot('24-ponds');
}
if (scenes.includes('worlds')) {
  for (let w = 0; w < 6; w++) {
    await run((w) => { window.__gw.show(null); window.__gw.startLevel(w, 3); window.__gw.game.god = true; window.__gw.advance(14); }, w);
    await settle(); await shot(`30-world-${w}`);
  }
}
if (scenes.includes('mech')) {
  // garden: pads + koi boss
  await run(() => { window.__gw.show(null); window.__gw.startLevel(1, 24); const g = window.__gw.game; g.god = true; window.__gw.advance(6); g.fish.state = 'stalk'; g.fish.t = 6; g.fish.cool = 99; g.fish.visible = true; g.fish.depth = 0.6; g.fish.x = g.strider.x - 0.1; g.fish.y = g.strider.y - 0.06; g.fish.heading = 0.5; window.__gw.advance(0.5); });
  await settle(); await shot('40-garden-koi');
  // barrel: overflow boss
  await run(() => { window.__gw.show(null); window.__gw.startLevel(2, 24); window.__gw.game.god = true; window.__gw.advance(10); });
  await settle(); await shot('41-barrel-overflow');
  // ditch: car + drain boss
  await run(() => { window.__gw.show(null); window.__gw.startLevel(3, 24); const g = window.__gw.game; g.god = true; window.__gw.advance(5); g.carT = 0; window.__gw.advance(1.0); g.drain.t = 0.5; window.__gw.advance(1.2); });
  await settle(); await shot('42-ditch-car-drain');
  // paddy: stalks + egret
  await run(() => { window.__gw.show(null); window.__gw.startLevel(4, 24); const g = window.__gw.game; g.god = true; window.__gw.advance(4); g.egret.t = 0; window.__gw.advance(1.9); });
  await settle(); await shot('43-paddy-egret');
  // tarn: hail boss
  await run(() => { window.__gw.show(null); window.__gw.startLevel(5, 24); const g = window.__gw.game; g.god = true; window.__gw.advance(6); g.hailT = 0; window.__gw.advance(0.6); });
  await settle(); await shot('44-tarn-hail');
  await run(() => { window.__gw.game.debugZoom = 2.2; window.__gw.show(null); window.__gw.startLevel(1, 3); const g = window.__gw.game; g.god = true; window.__gw.advance(3); const p = g.obstacles.pads[0]; if (p) { g.strider.x = p.x + p.r * 0.2; g.strider.y = p.y; } window.__gw.advance(0.5); g.cam.scale *= 2.2; });
  await page.waitForTimeout(1500); await shot('45-pad-closeup');
  await run(() => { window.__gw.game.debugZoom = 0; });
}
if (scenes.includes('skel')) {
  const keys = ['common', 'skater', 'broadfoot', 'giant', 'seaskater', 'nymph'];
  for (const k of keys) {
    await run((k) => { const g = window.__gw.game; g.save.campaign.stars = { x: 300 }; g.save.campaign.skeleton = k; window.__gw.show(null); window.__gw.startLevel(0, 3); g.god = true; g.debugZoom = 3; window.__gw.press('d'); window.__gw.advance(1.5); window.__gw.press('d', false); window.__gw.advance(0.4); g.cam.scale *= 3; }, k);
    await page.waitForTimeout(1200); await shot('50-skel-' + k);
  }
  await run(() => { const g = window.__gw.game; g.debugZoom = 0; g.save.campaign.stars = {}; g.save.campaign.skeleton = 'common'; window.__gw.showIntro(0, 3); });
  await page.waitForTimeout(300); await shot('51-intro-skeletons');
}
if (scenes.includes('calib')) {
  const list = (process.env.LEVELS || '0:0,0:1,0:2,0:4,0:6,0:9,0:14,0:19,0:24').split(',').map((s) => s.split(':').map(Number));
  const out = [];
  for (const [w, i] of list) {
    const res = await page.evaluate(async ([w, i, botStep]) => {
      const g = window.__gw.game; window.__gw.show(null); window.__gw.startLevel(w, i); g.god = false;
      window.__botDir = null; window.__botTurn = 0;
      const fn = new Function(botStep);
      let guard = 0;
      while (g.state !== 'ended' && guard++ < 6 * 200) fn();
      const r = g.level.recipe;
      return { id: r.id, tpl: r.template, goal: r.goal.type + (r.goal.n ? ' ' + r.goal.n : ''), D: r.D, dur: r.duration, rain: +r.weather.rainPeak.toFixed(2), state: g.state, t: +g.time.toFixed(0), tension: +g.strider.tension.toFixed(2), cause: g.cause, stars: g.save.campaign.stars[r.id], cancels: g.stats.cancels, hits: g.stats.hits };
    }, [w, i, botStep]);
    out.push(res);
    console.log('CALIB', JSON.stringify(res));
  }
}
if (scenes.includes('bot')) {
  const res = await page.evaluate(() => {
    const g = window.__gw.game; g.god = false; g.time = 0;
    const log = []; let t = 0; const step = 1 / 6; let dir = { x: 0, y: 0 }; let turnT = 0;
    while (g.state === 'playing' && t < 440) {
      const s = g.strider;
      // steer: drift toward centre, random wander, flee slicks, dodge the fish target
      turnT -= step;
      if (turnT <= 0) { turnT = 1 + Math.random() * 2; const a = Math.random() * 6.283; dir = { x: Math.cos(a) * 0.6, y: Math.sin(a) * 0.6 }; }
      const dc = Math.hypot(s.x - 0.5, s.y - 0.5);
      if (dc > 0.25) { dir = { x: (0.5 - s.x) / dc, y: (0.5 - s.y) / dc }; }
      for (const sl of g.slicks) { const d = Math.hypot(s.x - sl.x, s.y - sl.y); if (d < sl.r * 1.6) dir = { x: (s.x - sl.x) / d, y: (s.y - sl.y) / d }; }
      if (g.fish.state === 'rise') { const d = Math.hypot(s.x - g.fish.tx, s.y - g.fish.ty) + 1e-3; dir = { x: (s.x - g.fish.tx) / d, y: (s.y - g.fish.ty) / d }; }
      else if (g.fish.visible && g.fish.state === 'stalk') { const d = Math.hypot(s.x - g.fish.x, s.y - g.fish.y); if (d < 0.14) dir = { x: (s.x - g.fish.x) / d, y: (s.y - g.fish.y) / d }; }
      // hunt the nearest gnat when hungry
      if (s.hunger < 0.6) { let best = null, bd = 1; for (const gn of g.gnats) { if (gn.state !== 'struggle') continue; const d = Math.hypot(gn.x - s.x, gn.y - s.y); if (d < bd) { bd = d; best = gn; } } if (best && bd < 0.3) dir = { x: (best.x - s.x) / bd, y: (best.y - s.y) / bd }; }
      g.setInput(dir);
      // cancel: pulse when a crest is incoming and the phase is dark
      if ((g.incoming || 0) > 0.02 && g.phaseSign() < 0 && s.pulseCool <= 0) g.pulse();
      window.__gw.advance(step); t += step;
      if (Math.round(t * 6) % 60 === 0) log.push([Math.round(t), +s.tension.toFixed(2), +s.hunger.toFixed(2), g.hud.phase, g.stats.cancels, g.stats.gnats]);
    }
    return { end: g.state, cause: g.cause, dmg: g.dmg, t: +t.toFixed(1), score: g.score | 0, stats: g.stats, log };
  });
  console.log('BOT', JSON.stringify(res));
}
if (scenes.includes('closeup')) {
  await run(() => { const g = window.__gw.game; g.time = 30; g.debugZoom = 3.2; window.__gw.press('d'); window.__gw.advance(2.5); window.__gw.press('d', false); window.__gw.advance(0.6); g.cam.scale *= 3.2; });
  await page.waitForTimeout(1500); await shot('10-closeup');
  await run(() => { window.__gw.game.debugZoom = 0; });
}
if (scenes.includes('sunrise')) {
  await run(() => { const g = window.__gw.game; g.time = 431.9; window.__gw.advance(4.5); });
  await settle(); await shot('09-sunrise-reveal');
}
const info = await page.evaluate(() => ({ state: window.__gw.game.state, score: window.__gw.game.score | 0, tension: window.__gw.game.strider.tension, tier: window.__gw.tier, cancels: window.__gw.game.stats.cancels, cam: window.__gw.game.cam, time: window.__gw.game.time, hud: window.__gw.game.hud, dom: document.getElementById('time').textContent, css: [window.innerWidth, window.innerHeight], paused: !!window.__gw.paused }));
console.log(JSON.stringify(info));
const uniq = [...new Set(errors.filter((e) => !e.includes('READ-usage buffer')))];
console.log(uniq.length ? uniq.slice(0, 8).join('\n') : 'no console errors');
await browser.close();
server.kill();
