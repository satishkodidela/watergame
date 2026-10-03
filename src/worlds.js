// World presets: each pond has its own bed, water, light, edge behaviour,
// glow colour and default threat roster. Everything here is data that feeds
// the bed baker, the water shader and the level generator.

export const WORLDS = [
  {
    key: 'puddle', name: 'Puddle', tagline: 'a rain puddle on gravel', levels: 25, starsToUnlock: 0,
    pondR: 0.46, edge: 'sponge', night: 0, dawn: 0.55, drift: [0, 0],
    rainBase: 0.15, rainSlope: 1.5, windBase: 0.15, dropSize: 0.72, baseD: 0.25, slopeD: 1.5,
    roster: { fish: 0, frog: 0, bugs: 0, slicks: 0, hail: 0, cars: 0, egret: 0 },
    bed: { sandA: [0.40, 0.36, 0.29], sandB: [0.62, 0.56, 0.45], density: 1.0, tint: [1, 1, 1], moss: 0.5, mossColor: [0.20, 0.36, 0.16], scale: 1.0 },
    water: { tint: [0.50, 0.78, 0.84], deep: [0.06, 0.20, 0.26], murk: 0.42, depth: 0.10 },
    light: { az: -0.9, el: 1.25, sun: [1.0, 0.97, 0.90], zenith: [0.30, 0.52, 0.86], horizon: [0.86, 0.90, 0.95] },
    glow: { a: [0.05, 0.50, 0.70], b: [0.40, 0.95, 1.00] },
    bank: { tint: [0.70, 0.62, 0.48], moss: 0.55, mossColor: [0.22, 0.36, 0.15] },
  },
  {
    key: 'garden', name: 'Garden Pond', tagline: 'lily pads, silt and a koi', levels: 25, starsToUnlock: 30,
    pondR: 0.46, edge: 'sponge', night: 0, dawn: 0.2, drift: [0, 0],
    rainBase: 0.2, rainSlope: 1.4, windBase: 0.2, dropSize: 0.8, baseD: 0.6, slopeD: 1.5,
    roster: { fish: 1, frog: 1, bugs: 0, slicks: 0, hail: 0, cars: 0, egret: 0, pads: 7 },
    bed: { sandA: [0.22, 0.24, 0.16], sandB: [0.40, 0.40, 0.26], density: 0.45, tint: [0.85, 0.95, 0.8], moss: 0.9, mossColor: [0.16, 0.34, 0.14], scale: 0.8 },
    water: { tint: [0.45, 0.74, 0.60], deep: [0.03, 0.15, 0.11], murk: 0.6, depth: 0.14 },
    light: { az: -0.6, el: 1.3, sun: [1.0, 0.98, 0.88], zenith: [0.36, 0.58, 0.82], horizon: [0.88, 0.92, 0.84] },
    glow: { a: [0.05, 0.55, 0.45], b: [0.45, 1.00, 0.75] },
    bank: { tint: [0.45, 0.55, 0.32], moss: 0.9, mossColor: [0.24, 0.42, 0.16] },
  },
  {
    key: 'barrel', name: 'Rain Barrel', tagline: 'hard walls, every wave comes back', levels: 25, starsToUnlock: 70,
    pondR: 0.40, edge: 'wall', night: 0, dawn: 0, drift: [0, 0],
    rainBase: 0.15, rainSlope: 1.0, windBase: 0.05, dropSize: 0.85, baseD: 0.8, slopeD: 1.5,
    roster: { fish: 0, frog: 0, bugs: 0, slicks: 0, hail: 0, cars: 0, egret: 0, overflow: 1 },
    bed: { sandA: [0.10, 0.12, 0.15], sandB: [0.18, 0.20, 0.24], density: 0.0, tint: [1, 1, 1], moss: 0.25, mossColor: [0.18, 0.24, 0.16], scale: 1.0, rust: 1 },
    water: { tint: [0.35, 0.50, 0.66], deep: [0.03, 0.06, 0.12], murk: 0.7, depth: 0.08 },
    light: { az: -1.2, el: 1.35, sun: [1.0, 0.98, 0.95], zenith: [0.40, 0.46, 0.56], horizon: [0.70, 0.72, 0.76] },
    glow: { a: [0.10, 0.35, 0.80], b: [0.50, 0.75, 1.00] },
    bank: { tint: [0.16, 0.17, 0.19], moss: 0.0, mossColor: [0.1, 0.1, 0.1], rim: 1 },
  },
  {
    key: 'ditch', name: 'Roadside Ditch', tagline: 'oil, grit and passing cars', levels: 25, starsToUnlock: 115,
    pondR: 0.46, edge: 'sponge', night: 0, dawn: 0, drift: [0.018, 0.004],
    rainBase: 0.3, rainSlope: 1.3, windBase: 0.4, dropSize: 0.85, baseD: 1.0, slopeD: 1.5,
    roster: { fish: 0, frog: 0, bugs: 1, slicks: 0.06, hail: 0, cars: 1, egret: 0 },
    bed: { sandA: [0.30, 0.26, 0.20], sandB: [0.46, 0.40, 0.30], density: 0.8, tint: [0.9, 0.85, 0.75], moss: 0.3, mossColor: [0.26, 0.30, 0.14], scale: 1.2 },
    water: { tint: [0.52, 0.50, 0.38], deep: [0.12, 0.10, 0.05], murk: 0.75, depth: 0.09 },
    light: { az: -0.8, el: 1.2, sun: [0.95, 0.95, 0.95], zenith: [0.46, 0.50, 0.56], horizon: [0.74, 0.74, 0.74] },
    glow: { a: [0.60, 0.35, 0.05], b: [1.00, 0.75, 0.35] },
    bank: { tint: [0.34, 0.34, 0.35], moss: 0.1, mossColor: [0.3, 0.3, 0.2], asphalt: 1 },
  },
  {
    key: 'paddy', name: 'Rice Paddy', tagline: 'night water between the stalks', levels: 25, starsToUnlock: 165,
    pondR: 0.46, edge: 'sponge', night: 1, dawn: 0, drift: [0, 0],
    rainBase: 0.2, rainSlope: 1.2, windBase: 0.2, dropSize: 0.8, baseD: 1.2, slopeD: 1.5,
    roster: { fish: 0.5, frog: 1, bugs: 2, slicks: 0, hail: 0, cars: 0, egret: 1, stalks: 22 },
    bed: { sandA: [0.14, 0.14, 0.09], sandB: [0.26, 0.26, 0.16], density: 0.2, tint: [0.9, 1.0, 0.85], moss: 0.8, mossColor: [0.12, 0.26, 0.10], scale: 0.9 },
    water: { tint: [0.30, 0.52, 0.42], deep: [0.02, 0.08, 0.06], murk: 0.7, depth: 0.12 },
    light: { az: -0.5, el: 1.1, sun: [0.75, 0.82, 1.0], zenith: [0.02, 0.03, 0.08], horizon: [0.05, 0.07, 0.12] },
    glow: { a: [0.05, 0.60, 0.50], b: [0.50, 1.00, 0.80] },
    bank: { tint: [0.30, 0.28, 0.18], moss: 0.7, mossColor: [0.18, 0.32, 0.12] },
  },
  {
    key: 'tarn', name: 'Mountain Tarn', tagline: 'cold, clear and hailing', levels: 25, starsToUnlock: 220,
    pondR: 0.46, edge: 'sponge', night: 0, dawn: 0.15, drift: [0, 0],
    rainBase: 0.1, rainSlope: 1.1, windBase: 0.6, dropSize: 0.7, baseD: 1.4, slopeD: 1.6,
    roster: { fish: 0.6, frog: 0, bugs: 0, slicks: 0, hail: 1, cars: 0, egret: 0 },
    bed: { sandA: [0.46, 0.47, 0.48], sandB: [0.70, 0.71, 0.72], density: 1.0, tint: [0.95, 0.97, 1.0], moss: 0.15, mossColor: [0.30, 0.42, 0.30], scale: 0.9, granite: 1 },
    water: { tint: [0.62, 0.86, 0.96], deep: [0.04, 0.18, 0.32], murk: 0.3, depth: 0.16 },
    light: { az: -1.0, el: 1.15, sun: [1.0, 1.0, 1.0], zenith: [0.22, 0.42, 0.80], horizon: [0.80, 0.88, 0.98] },
    glow: { a: [0.20, 0.50, 0.90], b: [0.70, 0.90, 1.00] },
    bank: { tint: [0.66, 0.67, 0.70], moss: 0.2, mossColor: [0.34, 0.44, 0.32], snow: 1 },
  },
];

export const WORLD_BY_KEY = Object.fromEntries(WORLDS.map((w) => [w.key, w]));

// The classic 7-minute storm uses the puddle look.
export const CLASSIC_WORLD = WORLDS[0];
