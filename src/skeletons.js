// Strider skeletons: selectable bodies with different stats and looks.
// Harder bodies pay out a score multiplier. Unlocked by campaign stars.

export const SKELETONS = [
  {
    key: 'common', name: 'Common Strider', sci: 'Gerris lacustris', unlock: 0, mult: 1.0,
    desc: 'the one on every pond',
    stats: { speed: 1, tension: 1, pulse: 1, sense: 1, weight: 1, slickImmune: false, dimple: 1 },
    look: { scale: 1, legLen: 1, legWidth: 1, body: [0.15, 0.11, 0.08], legs: [0.20, 0.15, 0.10], stripe: [0.80, 0.78, 0.70] },
  },
  {
    key: 'skater', name: 'Pond Skater', sci: 'Aquarius paludum', unlock: 12, mult: 1.2,
    desc: 'long legs, thin skin',
    stats: { speed: 1.28, tension: 0.78, pulse: 1, sense: 1, weight: 0.9, slickImmune: false, dimple: 0.9 },
    look: { scale: 0.95, legLen: 1.25, legWidth: 0.85, body: [0.24, 0.17, 0.10], legs: [0.30, 0.21, 0.12], stripe: [0.92, 0.86, 0.70] },
  },
  {
    key: 'broadfoot', name: 'Broadfoot', sci: 'Limnoporus dissortis', unlock: 35, mult: 1.1,
    desc: 'wide feet, slow and steady',
    stats: { speed: 0.85, tension: 1.3, pulse: 1, sense: 1, weight: 1.2, slickImmune: false, dimple: 1.35 },
    look: { scale: 1.05, legLen: 1.0, legWidth: 1.45, body: [0.10, 0.08, 0.06], legs: [0.14, 0.11, 0.08], stripe: [0.60, 0.60, 0.55] },
  },
  {
    key: 'giant', name: 'Giant Strider', sci: 'Gigantometra gigas', unlock: 70, mult: 1.3,
    desc: 'the largest of all, a pulse like thunder',
    stats: { speed: 0.8, tension: 1.1, pulse: 1.5, sense: 1, weight: 1.5, slickImmune: false, dimple: 1.3 },
    look: { scale: 1.35, legLen: 1.15, legWidth: 1.2, body: [0.12, 0.09, 0.07], legs: [0.18, 0.13, 0.09], stripe: [0.75, 0.70, 0.60] },
  },
  {
    key: 'seaskater', name: 'Sea Skater', sci: 'Halobates', unlock: 120, mult: 1.4,
    desc: 'born on the ocean, nothing sticks to it',
    stats: { speed: 1.1, tension: 0.95, pulse: 0.7, sense: 1.1, weight: 1, slickImmune: true, dimple: 0.9 },
    look: { scale: 0.85, legLen: 0.95, legWidth: 1.0, body: [0.08, 0.10, 0.14], legs: [0.12, 0.15, 0.20], stripe: [0.70, 0.80, 0.90] },
  },
  {
    key: 'nymph', name: 'Nymph', sci: 'first instar', unlock: 180, mult: 2.0,
    desc: 'tiny, fragile, and worth double',
    stats: { speed: 1.1, tension: 0.6, pulse: 0.8, sense: 1.25, weight: 0.7, slickImmune: false, dimple: 0.7 },
    look: { scale: 0.62, legLen: 0.9, legWidth: 0.85, body: [0.30, 0.25, 0.18], legs: [0.36, 0.29, 0.19], stripe: [0.92, 0.90, 0.80] },
  },
];

export const SKELETON_BY_KEY = Object.fromEntries(SKELETONS.map((s) => [s.key, s]));

export function statLine(sk) {
  const s = sk.stats;
  const arrow = (v) => (v > 1.05 ? '▲' : v < 0.95 ? '▼' : '–');
  return `speed ${arrow(s.speed)} · skin ${arrow(s.tension)} · pulse ${arrow(s.pulse)} · sense ${arrow(s.sense)}${s.slickImmune ? ' · slick-proof' : ''}`;
}
