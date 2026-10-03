// Store creatives rendered from the game itself: cover images (3 sizes) and
// preview videos (landscape + portrait), assembled frame by frame so they are
// smooth even on a software GPU.
//   node tools/creatives.mjs covers
//   node tools/creatives.mjs videos
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist', 'creatives');
fs.mkdirSync(outDir, { recursive: true });
const what = process.argv[2] || 'covers';
const port = 8130;
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const exe = process.env.CHROME || fs.readdirSync('/opt/pw-browsers').filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });

async function openPage(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/?quality=high`);
  await page.waitForFunction(() => window.__gw && window.__gw.game);
  await page.addStyleTag({ content: '#hud, #hint, #popups { display: none !important; }' });
  return page;
}
const settle = (page, ms = 900) => page.waitForTimeout(ms);

// ---- covers -----------------------------------------------------------------
const COVER_CSS = `
#cover { position: fixed; inset: 0; pointer-events: none; display: flex; flex-direction: column; font-family: ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #f2f8fa; }
#cover .band { padding: 4% 6%; background: linear-gradient(to var(--dir), rgba(4,12,18,0.0), rgba(4,12,18,0.62) 55%, rgba(4,12,18,0.85)); }
#cover .t { font-weight: 300; letter-spacing: .16em; text-shadow: 0 2px 6px rgba(0,0,0,.7), 0 0 30px rgba(0,0,0,.5); line-height: 1; }
#cover .s { margin-top: .5em; font-size: .3em; letter-spacing: .3em; text-transform: uppercase; color: rgba(242,248,250,.85); text-shadow: 0 1px 4px rgba(0,0,0,.8); }
#cover .k { margin-top: .9em; font-size: .22em; letter-spacing: .08em; color: #ffd27a; text-shadow: 0 1px 4px rgba(0,0,0,.8); }
`;
async function stageCover(page, zoom, dx, dy) {
  await page.evaluate(({ zoom, dx, dy }) => {
    const g = window.__gw.game;
    window.__gw.show(null);
    window.__gw.startLevel(0, 5);
    g.god = true;
    g.envOverride = { rain: 0, aimed: 0, gnatRate: 0 };
    g.debugZoom = zoom;
    window.__gw.renderer.setQuality({ dof: false });
    g.camOffset = { x: dx, y: dy };
    window.__gw.advance(2.0);
    const s = g.strider;
    // a crest arriving from the upper right, and a cancel at the right phase
    g._spawnDrop(s.x + 0.13, s.y + 0.06, 1.0);
    window.__gw.advance(1.15 + 0.42);
    g.phaseT = 0.9;
    window.__gw.advance(0.05);
    g.pulse();
    window.__gw.advance(0.22);
    g.cam.scale *= zoom;
    g.cam.x = s.x + dx; g.cam.y = s.y + dy;
  }, { zoom, dx, dy });
}
async function overlay(page, { title, sub, kicker, size, dir, align, justify }) {
  await page.addStyleTag({ content: COVER_CSS });
  await page.evaluate(({ title, sub, kicker, size, dir, align, justify }) => {
    const d = document.createElement('div');
    d.id = 'cover';
    d.style.justifyContent = justify;
    d.style.alignItems = align;
    d.innerHTML = `<div class="band" style="--dir:${dir}; text-align:${align === 'flex-start' ? 'left' : align === 'flex-end' ? 'right' : 'center'}; font-size:${size}px"><div class="t">GLASSWATER</div><div class="s">${sub}</div><div class="k">${kicker}</div></div>`;
    document.body.appendChild(d);
  }, { title, sub, kicker, size, dir, align, justify });
}
async function covers() {
  const specs = [
    { name: 'cover-landscape-1920x1080', w: 1920, h: 1080, zoom: 2.5, dx: 0.1, dy: -0.025, size: 150, dir: 'left', align: 'flex-start', justify: 'flex-end' },
    { name: 'cover-portrait-800x1200', w: 800, h: 1200, zoom: 2.1, dx: 0.0, dy: -0.05, size: 88, dir: 'top', align: 'center', justify: 'flex-start' },
    { name: 'cover-square-800x800', w: 800, h: 800, zoom: 2.2, dx: 0.0, dy: 0.045, size: 82, dir: 'bottom', align: 'center', justify: 'flex-end' },
  ];
  for (const sp of specs) {
    const page = await openPage(sp.w, sp.h);
    await stageCover(page, sp.zoom, sp.dx, sp.dy);
    await settle(page, 1200);
    await overlay(page, { title: 'GLASSWATER', sub: 'skate the skin of the pond', kicker: 'cancel the waves · survive the storm', size: sp.size, dir: sp.dir, align: sp.align, justify: sp.justify });
    await settle(page, 300);
    await page.screenshot({ path: path.join(outDir, sp.name + '.jpg'), type: 'jpeg', quality: 92 });
    console.log('wrote', sp.name);
    await page.close();
  }
}

// ---- videos -----------------------------------------------------------------
const FPS = 24;
const SCENES = [
  { dur: 3.0, setup: `window.__gw.startLevel(0, 3); g.god = true; g.debugZoom = 1.5; g.envOverride = { aimed: 0.6, rain: 0.4 }; window.__gw.advance(1.5);` },
  { dur: 3.0, setup: `window.__gw.startLevel(1, 10); g.god = true; g.debugZoom = 1.3; window.__gw.advance(3); g.fish.state = 'stalk'; g.fish.t = 1.2; g.fish.cool = 99; g.fish.visible = true; g.fish.depth = 0.55; g.fish.x = g.strider.x - 0.12; g.fish.y = g.strider.y - 0.08; g.fish.heading = 0.6;` },
  { dur: 3.0, setup: `window.__gw.startLevel(4, 10); g.god = true; g.debugZoom = 1.3; window.__gw.advance(2); g.egret.t = 0; g.envOverride = { rain: 0.9 };` },
  { dur: 3.0, setup: `window.__gw.startLevel(0, 24); g.god = true; g.debugZoom = 1.4; window.__gw.advance(12);` },
];
const DRIVE = `
  const g = window.__gw.game, s = g.strider, t = g.time;
  const a = t * 0.9 + (window.__seed || 0);
  let dir = { x: Math.cos(a) * 0.55, y: Math.sin(a) * 0.55 };
  const dc = Math.hypot(s.x - 0.5, s.y - 0.5);
  if (dc > g.pondR - 0.22) dir = { x: (0.5 - s.x) / dc, y: (0.5 - s.y) / dc };
  if (g.fish.state === 'rise') { const d = Math.hypot(s.x - g.fish.tx, s.y - g.fish.ty) + 1e-3; dir = { x: (s.x - g.fish.tx) / d, y: (s.y - g.fish.ty) / d }; }
  if (g.egret.state === 'glide' && g.egret.locked) { const d = Math.hypot(s.x - g.egret.tx, s.y - g.egret.ty) + 1e-3; dir = { x: (s.x - g.egret.tx) / d, y: (s.y - g.egret.ty) / d }; }
  g.setInput(dir);
  if ((g.incoming || 0) > 0.02 && g.phaseSign() < 0 && s.pulseCool <= 0) g.pulse();
  window.__gw.advance(1 / ${FPS});
  window.__gw.renderOnce(1 / ${FPS});
`;
async function video(name, w, h) {
  const page = await openPage(w, h);
  await page.addStyleTag({ content: '#hud { display: flex !important; } #hint { display: none !important; }' });
  await page.evaluate(() => window.__gw.hold(true));
  const frameDir = path.join(process.env.FRAME_DIR || '/tmp', 'frames-' + name);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  let n = 0;
  for (const sc of SCENES) {
    await page.evaluate((setup) => { const g = window.__gw.game; window.__gw.show(null); window.__seed = Math.random() * 6; eval(setup); g.cam.scale = g.cam.scale; }, sc.setup);
    // let the camera settle on the new zoom before recording
    for (let k = 0; k < 10; k++) { await page.evaluate(DRIVE); }
    const frames = Math.round(sc.dur * FPS);
    for (let f = 0; f < frames; f++) {
      await page.evaluate(DRIVE);
      await page.screenshot({ path: path.join(frameDir, `f${String(n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
      n++;
    }
    console.log(name, 'scene done, frames', n);
  }
  await page.close();
  const out = path.join(outDir, name + '.mp4');
  const ff = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
  const common = ['-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'f%05d.jpg'), '-r', String(FPS), '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  let r = spawnSync(ff, [...common, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', out], { stdio: 'pipe' });
  if (r.status !== 0) r = spawnSync(ff, [...common, '-c:v', 'mpeg4', '-q:v', '3', out], { stdio: 'pipe' });
  if (r.status !== 0) console.log(String(r.stderr).slice(-800));
  else console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
  fs.rmSync(frameDir, { recursive: true, force: true });
}

if (what === 'covers') await covers();
if (what === 'videos') { await video('preview-landscape-960x540', 960, 540); await video('preview-portrait-540x960', 540, 960); }
await browser.close();
server.kill();
