// Seeded PRNG (mulberry32) so a Daily Storm is identical for everyone.

export function mulberry32(seed) {
  let a = seed >>> 0;
  const r = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (n) => Math.floor(r() * n);
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}

export function dailySeed(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  return (day * 2654435761) >>> 0;
}

export function dailyKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
