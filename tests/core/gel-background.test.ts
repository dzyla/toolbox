import { describe, it, expect } from 'vitest';
import { rollingBaseline, sharedCrossLaneBaseline, baselineFor } from '@/core/gel/background';

const N = 300;
const bg = (i: number) => 0.1 + 0.0005 * i;                       // sloping background
const band = (i: number, c: number, s: number, a: number) => a * Math.exp(-((i - c) ** 2) / (2 * s * s));

describe('rolling ball baseline', () => {
  it('follows a sloping background under a narrow band', () => {
    const prof = Float32Array.from({ length: N }, (_, i) => bg(i) + band(i, 150, 4, 0.5));
    const base = rollingBaseline(prof, 30);
    expect(Math.abs(base[150]! - bg(150))).toBeLessThan(0.02);
    for (let i = 0; i < N; i++) expect(base[i]!).toBeLessThanOrEqual(prof[i]! + 1e-6);
  });
  it('returns a constant profile unchanged', () => {
    const base = rollingBaseline(new Float32Array(100).fill(0.3), 20);
    for (const v of base) expect(v).toBeCloseTo(0.3, 6);
  });
});

describe('shared cross-lane baseline', () => {
  it('handles lanes of unequal length without NaN', () => {
    const a = Float32Array.from({ length: 200 }, (_, i) => bg(i));
    const b = Float32Array.from({ length: 150 }, (_, i) => bg(i));
    const shared = sharedCrossLaneBaseline([b, a], 20);
    expect(shared.length).toBe(200);
    for (const v of shared) expect(Number.isFinite(v)).toBe(true);
    expect(baselineFor('shared', b, { sharedBaseline: shared }).length).toBe(150);
  });
});
