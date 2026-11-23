// Seeded RNG so the scene is identical on every load.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = mulberry32(20261120);
export const rr = (a, b) => a + (b - a) * rand();
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
