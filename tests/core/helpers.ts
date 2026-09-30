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
