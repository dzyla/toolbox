/** Deterministic pseudo-random DNA (LCG), so tests never depend on Math.random. */
export function randomDna(length: number, seed: number): string {
  let state = seed >>> 0;
  let out = '';
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out += 'ACGT'[state >>> 30];
  }
  return out;
}

/** Seeded standard-normal generator (mulberry32 + Box-Muller) for Monte Carlo checks. */
export function seededNormal(seed: number): () => number {
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | undefined;
  return () => {
    if (spare !== undefined) { const v = spare; spare = undefined; return v; }
    const u = Math.max(uniform(), 1e-300), v = uniform();
    const radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  };
}
