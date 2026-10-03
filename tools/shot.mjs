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

await page.goto(`http://localhost:${port}/?quality=${process.env.Q || 'high'}`);
await page.waitForFunction(() => window.__gw && window.__gw.game);
await page.waitForTimeout(800);
const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });

const scenes = (process.env.SCENES || 'title,dawn,glass,wind,rain,night,downpour,sunrise').split(',');
if (scenes.includes('title')) { await page.evaluate(() => window.__gw.advance(6)); await page.waitForTimeout(300); await shot('01-title'); }

await page.evaluate(() => { window.__gw.start('daily'); window.__gw.game.god = true; });
const run = async (fn) => page.evaluate(fn);
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
      // hunt the nearest gnat when hungry
      if (s.hunger < 0.6) { let best = null, bd = 1; for (const gn of g.gnats) { if (gn.state !== 'struggle') continue; const d = Math.hypot(gn.x - s.x, gn.y - s.y); if (d < bd) { bd = d; best = gn; } } if (best && bd < 0.3) dir = { x: (best.x - s.x) / bd, y: (best.y - s.y) / bd }; }
      g.setInput(dir);
      // cancel: pulse when a crest is incoming and the phase is dark
      if ((g.incoming || 0) > 0.02 && g.phaseSign() < 0 && s.pulseCool <= 0) g.pulse();
      window.__gw.advance(step); t += step;
      if (Math.round(t * 6) % 60 === 0) log.push([Math.round(t), +s.tension.toFixed(2), +s.hunger.toFixed(2), g.hud.phase, g.stats.cancels, g.stats.gnats]);
    }
    return { end: g.state, t: +t.toFixed(1), score: g.score | 0, stats: g.stats, log };
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
