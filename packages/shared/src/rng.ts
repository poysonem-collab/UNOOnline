/** mulberry32: small seeded PRNG. Returns [value in [0,1), next state]. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Fisher-Yates shuffle in place. Returns the new RNG state. */
export function shuffle<T>(items: T[], rng: number): number {
  for (let i = items.length - 1; i > 0; i--) {
    const [r, next] = nextRandom(rng);
    rng = next;
    const j = Math.floor(r * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return rng;
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
