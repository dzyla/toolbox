import { describe, it, expect } from 'vitest';
import { normalizeLaneValue, welchTTest, holmAdjust, summarizeGroups, type GroupInput } from '@/core/gel/groups';

const rows = (cond: string, vals: (number | null)[]): GroupInput[] =>
  vals.map((v, i) => ({ laneId: `${cond}${i}`, condition: cond, replicate: i + 1, value: v, flags: [] }));

describe('normalizeLaneValue', () => {
  it('divides by the control band or total lane and never invents values', () => {
    expect(normalizeLaneValue('none', 5, null, 0)).toEqual({ value: 5, reason: null });
    expect(normalizeLaneValue('control-band', 6, 3, 0)).toEqual({ value: 2, reason: null });
    expect(normalizeLaneValue('total-lane', 6, null, 12)).toEqual({ value: 0.5, reason: null });
    expect(normalizeLaneValue('none', null, null, 0).value).toBeNull();
    expect(normalizeLaneValue('control-band', 6, null, 0).reason).toMatch(/control/i);
    expect(normalizeLaneValue('control-band', 6, 0, 0).value).toBeNull();
    expect(normalizeLaneValue('total-lane', 6, null, 0).value).toBeNull();
  });
});

describe('welchTTest', () => {
  it('matches scipy for unequal variances and sizes', () => {
    const r = welchTTest([2.0, 2.4, 2.1, 2.6], [1.0, 1.2, 0.9])!;
    expect(r.t).toBeCloseTo(7.593743, 5);
    expect(r.df).toBeCloseTo(4.763780, 5);
    expect(r.p).toBeCloseTo(0.000777636, 6);
  });
  it('needs n ≥ 2 per group', () => {
    expect(welchTTest([1], [1, 2])).toBeNull();
  });
});

describe('holmAdjust', () => {
  it('step-down adjusts and keeps monotonicity', () => {
    const adj = holmAdjust([0.000777636, 0.467605]);
    expect(adj[0]).toBeCloseTo(0.001555272, 8);
    expect(adj[1]).toBeCloseTo(0.467605, 6);
    expect(holmAdjust([0.04, 0.01, 0.03])).toEqual([0.06, 0.03, 0.06]);
  });
});

describe('summarizeGroups', () => {
  const data = [...rows('ctrl', [1.0, 1.2, 0.9]), ...rows('drug', [2.0, 2.4, 2.1, 2.6]), ...rows('low', [1.1, 1.0, 1.3])];
  const out = summarizeGroups(data, 'ctrl', { welch: true });
  it('computes n, mean, SD, SEM and a t-based 95% CI', () => {
    const d = out.find(g => g.condition === 'drug')!;
    expect(d.n).toBe(4);
    expect(d.mean!).toBeCloseTo(2.275, 10);
    expect(d.sd!).toBeCloseTo(0.275378527, 8);
    expect(d.sem!).toBeCloseTo(0.137689264, 8);
    expect(d.ci95![1] - d.mean!).toBeCloseTo(3.182446305 * 0.137689264, 6);
    expect(d.foldChange!).toBeCloseTo(2.275 / (3.1 / 3), 8);
  });
  it('Holm-adjusts the comparisons against control', () => {
    expect(out.find(g => g.condition === 'drug')!.test!.pAdj).toBeCloseTo(0.001555272, 7);
    expect(out.find(g => g.condition === 'low')!.test!.p).toBeCloseTo(0.467605, 5);
    expect(out.find(g => g.condition === 'ctrl')!.test).toBeNull();
  });
  it('keeps first-appearance order and counts excluded values', () => {
    const g = summarizeGroups([...rows('a', [1, null, 3]), ...rows('b', [null])], 'a');
    expect(g.map(x => x.condition)).toEqual(['a', 'b']);
    expect(g[0]!.nExcluded).toBe(1);
    expect(g[1]).toMatchObject({ n: 0, mean: null, sd: null, ci95: null, foldChange: null });
  });
  it('gives no fold change when the control is missing or its mean is 0', () => {
    expect(summarizeGroups(rows('x', [1, 2]), 'nope')[0]!.foldChange).toBeNull();
    expect(summarizeGroups([...rows('c', [0, 0]), ...rows('x', [1, 2])], 'c')[1]!.foldChange).toBeNull();
  });
});
