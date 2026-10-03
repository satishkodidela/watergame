// Level recipes: authored openers + a seeded generator with a difficulty
// budget. A recipe is small data; the game turns it into weather, threats,
// a goal and star conditions.

import { mulberry32 } from './rng.js';
import { WORLDS } from './worlds.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
export function kf(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      return lerp(v0, v1, (t - t0) / (t1 - t0));
    }
  }
  return pts[pts.length - 1][1];
}

// ---- the classic storm (Daily / Free / Endless) ----------------------------
export const PHASES = [['dawn', 0], ['wind', 60], ['rain', 150], ['night', 240], ['downpour', 330], ['sunrise', 420]];
export const LOOP_START = 60, LOOP_END = 420, RUN_END = 432;

export function classicEnv(tRaw, endless) {
  let t = tRaw;
  let loop = 0;
  if (t > RUN_END && endless) {
    const span = LOOP_END - LOOP_START;
    const over = t - RUN_END;
    loop = 1 + Math.floor(over / span);
    t = LOOP_START + (over % span);
  }
  const k = 1 + 0.28 * loop;
  const e = {
    t, loop,
    rain: k * kf(t, [[0, 0], [57, 0], [62, 0.2], [150, 0.35], [168, 1.5], [225, 2.2], [240, 1.2], [252, 0.5], [330, 0.6], [344, 3.0], [405, 3.8], [420, 2.2], [430, 0]]),
    night: kf(t, [[236, 0], [250, 1], [330, 1], [344, 0.6], [418, 0.6], [426, 0.15], [432, 0]]),
    storm: kf(t, [[0, 0], [140, 0.15], [170, 0.85], [238, 0.6], [330, 0.7], [344, 1], [418, 0.9], [428, 0.2], [432, 0]]),
    dawn: kf(t, [[0, 1], [45, 1], [80, 0], [418, 0], [426, 1]]),
    wind: kf(t, [[0, 0.05], [60, 0.25], [95, 0.9], [150, 0.9], [240, 0.45], [330, 0.6], [344, 1.3], [418, 0.6], [432, 0.1]]),
    gnatRate: kf(t, [[0, 0.4], [60, 0.3], [150, 0.3], [240, 0.22], [330, 0.28], [420, 0.1], [432, 0]]),
    slickRate: k * kf(t, [[0, 0], [60, 0.04], [150, 0.03], [240, 0.012], [330, 0.035], [420, 0]]),
    fish: Math.min(1.4, k * kf(t, [[0, 0], [85, 0], [95, 0.6], [240, 0.5], [330, 1.0], [420, 0]])),
    frog: t >= 236 && t < 420 ? 1 : 0,
    bugs: t >= 244 && t < 420 ? Math.min(2, (t < 272 ? 1 : 2)) : 0,
    dropSize: kf(t, [[0, 0.7], [150, 0.8], [240, 0.8], [330, 0.9], [420, 0.9]]) * (1 + 0.1 * loop),
    aimed: 0, hail: 0, cars: 0, egret: 0, fog: 0,
  };
  let ph = 'dawn';
  for (const [name, t0] of PHASES) if (t >= t0) ph = name;
  if (tRaw > RUN_END && endless) ph = 'endless · ' + ph;
  e.phase = ph;
  const windAng = 0.6 + 0.35 * Math.sin(t * 0.02) + 1.5 * loop;
  e.windX = Math.cos(windAng) * e.wind;
  e.windY = Math.sin(windAng) * e.wind;
  return e;
}

// ---- templates, goals, stars -------------------------------------------------
export const TEMPLATES = {
  survive: { name: 'Survive',      rainK: 1.0, verb: 'survive the storm' },
  feast:   { name: 'Feast',        rainK: 0.6, verb: 'eat' },
  glass:   { name: 'Glassmaker',   rainK: 0.9, verb: 'cancel' },
  hunt:    { name: 'Hunt',         rainK: 0.5, verb: 'strike' },
  cross:   { name: 'Dark Crossing', rainK: 0.7, verb: 'reach the lights' },
};

export const MODIFIERS = {
  fog:        { name: 'Fog',        desc: 'you only see what you can feel' },
  heavy:      { name: 'Full belly', desc: 'you start heavy' },
  lowTension: { name: 'Thin skin',  desc: 'you start at half tension' },
  gusts:      { name: 'Gusts',      desc: 'the wind never settles' },
  nightfall:  { name: 'Nightfall',  desc: 'the light goes halfway through' },
};

// Star conditions, evaluated live against the game.
export const STARS = {
  untipped:  { text: () => 'never tipped',                 test: (g) => g.stats.hits === 0 },
  tension70: { text: () => 'finish with the skin strong',  test: (g) => g.strider.tension >= 0.7, atEnd: true },
  eat:       { text: (n) => `eat ${n}`,                    test: (g, n) => g.stats.gnats >= n },
  cancels:   { text: (n) => `cancel ${n} waves`,           test: (g, n) => g.stats.cancels >= n },
  perfect:   { text: (n) => `${n} perfect cancels`,        test: (g, n) => g.stats.perfect >= n },
  combo:     { text: (n) => `a ${n} cancel chain`,         test: (g, n) => g.stats.bestCombo >= n },
  fast:      { text: () => 'finish with a third of the time left', test: (g) => g.level && g.level.remaining >= g.level.recipe.duration * 0.33, atEnd: true },
  light:     { text: () => 'never get heavy',              test: (g) => g.stats.maxWeight < 1.0 },
  noSlick:   { text: () => 'never touch a slick',          test: (g) => g.stats.slickTouches === 0 },
  scare:     { text: (n) => `scare the fish ${n > 1 ? n + ' times' : 'once'}`, test: (g, n) => g.stats.fishScared >= n },
  stun:      { text: (n) => `stun ${n} hunter${n > 1 ? 's' : ''}`, test: (g, n) => g.stats.bugsStunned >= n },
};

export function goalText(goal) {
  switch (goal.type) {
    case 'survive': return 'survive until the storm passes';
    case 'eat': return `eat ${goal.n} before the storm ends`;
    case 'cancel': return `cancel ${goal.n} waves`;
    case 'perfect': return `land ${goal.n} perfect cancels`;
    case 'scare': return goal.n > 1 ? `scare the fish off ${goal.n} times` : 'scare the fish off with a crest';
    case 'stun': return `stun ${goal.n} hunter${goal.n > 1 ? 's' : ''} with a crest`;
    case 'cross': return `reach ${goal.n} lights in order`;
    default: return '';
  }
}

export function goalProgress(goal, g) {
  const s = g.stats;
  switch (goal.type) {
    case 'survive': return { done: false, text: 'survive' };
    case 'eat': return { done: s.gnats >= goal.n, text: `eat ${Math.min(s.gnats, goal.n)}/${goal.n}` };
    case 'cancel': return { done: s.cancels >= goal.n, text: `cancel ${Math.min(s.cancels, goal.n)}/${goal.n}` };
    case 'perfect': return { done: s.perfect >= goal.n, text: `perfect ${Math.min(s.perfect, goal.n)}/${goal.n}` };
    case 'scare': return { done: s.fishScared >= goal.n, text: `scare the fish ${Math.min(s.fishScared, goal.n)}/${goal.n}` };
    case 'stun': return { done: s.bugsStunned >= goal.n, text: `stun ${Math.min(s.bugsStunned, goal.n)}/${goal.n}` };
    case 'cross': return { done: s.markers >= goal.n, text: `lights ${Math.min(s.markers, goal.n)}/${goal.n}` };
    default: return { done: false, text: '' };
  }
}

// ---- authored openers --------------------------------------------------------
// Partial recipes that override the generator for the first levels of a world.
const OPENERS = {
  puddle: [
    { template: 'survive', duration: 55, rainPeak: 0.5, hint: 'drag to skate · tap to pulse' },
    { template: 'feast', goal: { type: 'eat', n: 4 }, duration: 70, rainPeak: 0.2, gnatRate: 0.45 },
    { template: 'glass', goal: { type: 'cancel', n: 4 }, duration: 75, rainPeak: 0.3, aimed: 0.22, hint: 'pulse on dark as the bright crest arrives' },
    { template: 'survive', duration: 65, rainPeak: 1.0 },
    { template: 'feast', goal: { type: 'eat', n: 5 }, duration: 80, rainPeak: 0.6, gnatRate: 0.55 },
    { template: 'glass', goal: { type: 'perfect', n: 2 }, duration: 80, rainPeak: 0.5, aimed: 0.3, hint: 'closer crests make perfect cancels' },
    { template: 'cross', goal: { type: 'cross', n: 4 }, duration: 75, rainPeak: 0.6 },
    { template: 'survive', duration: 70, rainPeak: 1.4 },
  ],
  garden: [
    { template: 'survive', duration: 60, rainPeak: 0.6, hint: 'lily pads break the waves · stand on one to rest' },
    { template: 'hunt', goal: { type: 'scare', n: 1 }, duration: 90, rainPeak: 0.3, fish: 1.3, hint: 'the koi rises · meet it with a bright crest' },
    { template: 'feast', goal: { type: 'eat', n: 5 }, duration: 80, rainPeak: 0.5 },
  ],
  barrel: [
    { template: 'survive', duration: 60, rainPeak: 0.6, hint: 'hard walls · every wave comes back' },
    { template: 'glass', goal: { type: 'cancel', n: 4 }, duration: 80, rainPeak: 0.5, aimed: 0.25 },
  ],
  ditch: [
    { template: 'survive', duration: 60, rainPeak: 0.6, hint: 'the water drifts · the rainbow is poison' },
    { template: 'feast', goal: { type: 'eat', n: 4 }, duration: 80, rainPeak: 0.5 },
  ],
  paddy: [
    { template: 'survive', duration: 60, rainPeak: 0.5, hint: 'night · you see only the waves' },
    { template: 'hunt', goal: { type: 'stun', n: 1 }, duration: 90, rainPeak: 0.3, bugs: 1, hint: 'a hunter by vibration · hold still, then strike' },
    { template: 'cross', goal: { type: 'cross', n: 3 }, duration: 80, rainPeak: 0.4 },
  ],
  tarn: [
    { template: 'survive', duration: 60, rainPeak: 0.4, hint: 'hail · short, sharp and many' },
    { template: 'glass', goal: { type: 'perfect', n: 3 }, duration: 85, rainPeak: 0.5, aimed: 0.3 },
  ],
};

const BOSSES = {
  puddle: { name: 'The First Downpour', template: 'survive', duration: 90, rainPeak: 2.6, dropSize: 0.88, hint: 'chain cancels · carve a calm patch' },
  garden: { name: 'The Koi', template: 'hunt', goal: { type: 'scare', n: 3 }, duration: 110, rainPeak: 1.2, fish: 1.6, boss: 'koi' },
  barrel: { name: 'The Overflow', template: 'survive', duration: 95, rainPeak: 1.6, boss: 'overflow' },
  ditch: { name: 'The Storm Drain', template: 'survive', duration: 95, rainPeak: 1.8, boss: 'drain' },
  paddy: { name: 'The Egret', template: 'survive', duration: 100, rainPeak: 1.0, boss: 'egret', egret: 1.5 },
  tarn: { name: 'The Hailstorm', template: 'survive', duration: 100, rainPeak: 1.0, boss: 'hail', hail: 2 },
};

// ---- generator --------------------------------------------------------------
function hashSeed(w, i) { return ((w + 1) * 73856093 ^ (i + 1) * 19349663) >>> 0; }

export function levelId(w, i) { return `w${w}l${i}`; }

export function makeLevel(w, i) {
  const season = w >= WORLDS.length;              // Storm Season: endless generated levels
  const world = WORLDS[season ? (w % WORLDS.length) : w];
  const n = world.levels;
  const rng = mulberry32(hashSeed(w, i));
  const isBoss = !season && i === n - 1;
  const p = season ? 1 : i / (n - 1);
  const D = season ? world.baseD + world.slopeD + 0.25 * (w - WORLDS.length + 1) + 0.05 * i : world.baseD + p * world.slopeD;
  const opener = !season && OPENERS[world.key] && OPENERS[world.key][i];
  const boss = isBoss ? BOSSES[world.key] : null;
  const auth = opener || boss || {};

  // template
  const canHunt = world.roster.fish > 0 || world.roster.bugs > 0;
  let template = auth.template;
  if (!template) {
    const r = rng();
    template = r < 0.34 ? 'survive' : r < 0.56 ? 'feast' : r < 0.76 ? 'glass' : (r < 0.88 && canHunt) ? 'hunt' : 'cross';
  }
  const T = TEMPLATES[template];

  // goal
  let goal = auth.goal;
  if (!goal) {
    if (template === 'survive') goal = { type: 'survive' };
    else if (template === 'feast') goal = { type: 'eat', n: 4 + Math.round(D * 2) };
    else if (template === 'glass') goal = rng() < 0.5 || D < 0.8 ? { type: 'cancel', n: 4 + Math.round(D * 2.5) } : { type: 'perfect', n: 2 + Math.round(D * 1.2) };
    else if (template === 'hunt') goal = world.roster.bugs > 0 && (world.roster.fish === 0 || rng() < 0.5) ? { type: 'stun', n: 1 + Math.round(D * 0.6) } : { type: 'scare', n: 1 + Math.round(D * 0.5) };
    else goal = { type: 'cross', n: 4 + Math.round(D * 1.2) };
  }

  // duration & weather
  const duration = auth.duration || clamp(Math.round(template === 'survive' ? 60 + 28 * p : 72 + 24 * p), 55, 110);
  const rainPeak = auth.rainPeak ?? (world.rainBase + D * world.rainSlope * T.rainK);
  const wind = world.windBase + D * 0.22;
  const modifiers = [];
  if (!opener && !boss && i >= 8 && rng() < 0.38) {
    const pool = ['fog', 'heavy', 'lowTension', 'gusts'];
    if (!world.night) pool.push('nightfall');
    modifiers.push(pool[rng.int(pool.length)]);
  }
  const night = world.night;
  const recipe = {
    id: levelId(w, i), w, i, season, worldKey: world.key, boss: auth.boss || (isBoss ? 'downpour' : null),
    name: boss ? boss.name : `${T.name}`,
    template, goal, duration, D: +D.toFixed(2), modifiers, hint: auth.hint || '',
    seed: hashSeed(w, i) ^ 0x5bd1e995,
    weather: {
      rainPeak, wind, night,
      storm: night ? 0 : clamp(rainPeak / 3.2, 0, 1),
      dawn: world.dawn * (1 - p * 0.6),
    },
    roster: {
      gnatRate: auth.gnatRate ?? (template === 'feast' ? 0.42 : 0.3),
      slickRate: world.roster.slicks * (0.6 + D * 0.4),
      fish: auth.fish ?? (world.roster.fish ? Math.min(1.4, world.roster.fish * (0.4 + D * 0.4)) : (D > 1.4 && rng() < 0.3 ? 0.6 : 0)),
      frog: world.roster.frog && D > 0.9 ? 1 : 0,
      bugs: auth.bugs ?? (world.roster.bugs ? Math.min(2, Math.max(1, Math.round(world.roster.bugs * (0.5 + D * 0.3)))) : 0),
      dropSize: auth.dropSize ?? (world.dropSize + D * 0.07),
      aimed: auth.aimed ?? (template === 'glass' ? 0.22 : 0),
      hail: auth.hail ?? world.roster.hail * (0.5 + D * 0.3),
      cars: world.roster.cars ? 0.4 + D * 0.3 : 0,
      egret: auth.egret ?? 0,
      pads: world.roster.pads || 0,
      stalks: world.roster.stalks || 0,
      overflow: 0,
    },
  };
  if (goal.type === 'scare') recipe.roster.fish = Math.max(recipe.roster.fish, 1.3);
  if (goal.type === 'stun') recipe.roster.bugs = Math.max(recipe.roster.bugs, 1);

  // stars: the goal is star 1; two more conditions by template
  const pools = {
    survive: [['untipped'], ['tension70'], ['eat', 2 + Math.round(D)]],
    feast: [['untipped'], ['fast'], ['light']],
    glass: [['combo', 3], ['untipped'], ['fast']],
    hunt: [['untipped'], ['eat', 2], ['tension70']],
    cross: [['untipped'], ['fast'], ['cancels', 2]],
  };
  const pool = pools[template].slice();
  if (recipe.roster.slickRate > 0) pool.push(['noSlick']);
  const stars = [];
  while (stars.length < 2 && pool.length) stars.push(pool.splice(rng.int(pool.length), 1)[0]);
  recipe.stars = stars.map(([key, n]) => ({ key, n: n || 0 }));
  return recipe;
}

// Turn a recipe into the per-second environment the game consumes.
export class LevelScript {
  constructor(recipe) {
    this.recipe = recipe;
    const r = recipe;
    const d = r.duration;
    const peak = r.weather.rainPeak;
    const gust = r.modifiers.includes('gusts') ? 1.8 : 1;
    this.rainKf = r.boss === 'downpour'
      ? [[0, peak * 0.2], [d * 0.15, peak * 0.7], [d * 0.4, peak], [d * 0.75, peak * 1.1], [d, peak * 0.5]]
      : [[0, 0], [d * 0.12, peak * 0.3], [d * 0.35, peak * 0.8], [d * 0.7, peak], [d * 0.92, peak * 0.6], [d, peak * 0.4]];
    this.windBase = r.weather.wind * gust;
    this.nightKf = r.modifiers.includes('nightfall') ? [[0, 0], [d * 0.45, 0], [d * 0.6, 1], [d, 1]] : [[0, r.weather.night]];
    this.fog = r.modifiers.includes('fog') ? 0.55 : 0;
  }
  envAt(t) {
    const r = this.recipe;
    const rain = kf(t, this.rainKf);
    const night = kf(t, this.nightKf);
    const e = {
      t, loop: 0, rain, night,
      storm: r.weather.storm * (1 - night),
      dawn: r.weather.dawn * (1 - night),
      wind: this.windBase * (0.8 + 0.3 * Math.sin(t * 0.37) + 0.2 * Math.sin(t * 1.3)),
      gnatRate: r.roster.gnatRate,
      slickRate: r.roster.slickRate,
      fish: r.roster.fish,
      frog: r.roster.frog,
      bugs: r.roster.bugs,
      dropSize: r.roster.dropSize,
      aimed: r.roster.aimed,
      hail: r.roster.hail * (0.5 + 0.5 * rain / Math.max(0.2, r.weather.rainPeak)),
      cars: r.roster.cars,
      egret: r.roster.egret,
      fog: this.fog,
      phase: r.name.toLowerCase(),
      remaining: Math.max(0, r.duration - t),
    };
    const windAng = 0.6 + 0.35 * Math.sin(t * 0.05);
    e.windX = Math.cos(windAng) * e.wind;
    e.windY = Math.sin(windAng) * e.wind;
    return e;
  }
}

export function starText(star) { return STARS[star.key].text(star.n); }
