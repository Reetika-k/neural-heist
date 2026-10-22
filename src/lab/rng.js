// Seedable random numbers (mulberry32) so datasets, training and tests are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randRange = (rng, a, b) => a + rng() * (b - a);
export const randInt = (rng, a, b) => Math.floor(randRange(rng, a, b + 1));
/** Approximately normal noise (sum of uniforms). */
export const gauss = (rng) => (rng() + rng() + rng() + rng() - 2) * 1.2247;
