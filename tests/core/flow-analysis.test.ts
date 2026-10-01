import { describe, it, expect } from 'vitest';
import {
  forward, inverse, defaultScale, axisTicks, sameScale, transformColumn,
  pointInPolygon, evaluateGates, populationStats, allGateStats, maskCount,
  histogram, density2d, subsampleIndices, autoRange, syntheticExample, syntheticObserved,
  type Gate,
} from '@/core/flow';

const lin = defaultScale('linear');

describe('scales', () => {
  it('round-trips linear, log and arcsinh', () => {
    for (const s of [lin, defaultScale('log'), { ...defaultScale('asinh'), cofactor: 5 }]) {
      for (const v of [10, 100, 12345]) expect(inverse(forward(v, s), s)).toBeCloseTo(v, 6);
    }
    expect(forward(0, defaultScale('log'))).toBe(0); // clipped to the floor of 1
    expect(forward(-5, defaultScale('log'))).toBe(0);
    expect(forward(150, defaultScale('asinh'))).toBeCloseTo(Math.asinh(1), 12);
    expect(forward(-150, defaultScale('asinh'))).toBeCloseTo(-Math.asinh(1), 12);
    expect(sameScale(defaultScale('asinh'), { ...defaultScale('asinh'), cofactor: 5 })).toBe(false);
    expect(Array.from(transformColumn([1, 10, 100], defaultScale('log')))).toEqual([0, 1, 2].map(Math.fround));
  });
  it('produces ticks for each kind', () => {
    expect(axisTicks(lin, 0, 100).map(t => t.value)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(axisTicks(defaultScale('log'), 0, 4).map(t => t.label)).toEqual(['1', '10', '100', '1k', '10k']);
    const t = axisTicks(defaultScale('asinh'), forward(-1000, defaultScale('asinh')), forward(100000, defaultScale('asinh')));
    expect(t.map(x => x.label)).toContain('0');
    expect(axisTicks(lin, 1, 1)).toEqual([]);
  });
});

describe('gates', () => {
  // 10 x 10 grid of events at integer coordinates 0..9
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { xs.push(i); ys.push(j); }
  const cols = [xs, ys];
  const n = xs.length;
  const rect: Gate = { id: 'r', name: 'rect', parent: null, type: 'rect', xParam: 0, yParam: 1, xScale: lin, yScale: lin, xMin: 2, xMax: 5, yMin: 0, yMax: 4 };

  it('range gate counts a 1-D interval inclusively', () => {
    const g: Gate = { id: 'g', name: 'g', parent: null, type: 'range', param: 0, scale: lin, min: 3, max: 4 };
    expect(maskCount(evaluateGates(cols, [g], n).g!)).toBe(20);
  });
  it('rectangle gate', () => {
    expect(maskCount(evaluateGates(cols, [rect], n).r!)).toBe(4 * 5);
  });
  it('polygon gate uses ray casting (triangle (0,0),(8,0),(0,8) has strict-interior points)', () => {
    const tri = [[-0.5, -0.5], [9, -0.5], [-0.5, 9]] as [number, number][];
    expect(pointInPolygon(1, 1, tri)).toBe(true);
    expect(pointInPolygon(8, 8, tri)).toBe(false);
    const g: Gate = { id: 'p', name: 'p', parent: null, type: 'polygon', xParam: 0, yParam: 1, xScale: lin, yScale: lin, points: tri };
    // points with x + y <= 8 inside: sum over x=0..8 of (9 - x) = 45
    expect(maskCount(evaluateGates(cols, [g], n).p!)).toBe(45);
    // concave polygon (L-shape) excludes the notch
    const L: [number, number][] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
    expect(pointInPolygon(2, 8, L)).toBe(true);
    expect(pointInPolygon(8, 8, L)).toBe(false);
  });
  it('hierarchy: child counts only events inside the parent', () => {
    const child: Gate = { id: 'c', name: 'child', parent: 'r', type: 'range', param: 0, scale: lin, min: 4, max: 9 };
    const masks = evaluateGates(cols, [child, rect], n); // child listed before its parent
    expect(maskCount(masks.c!)).toBe(2 * 5); // x in {4,5}, y 0..4
    const rows = allGateStats(cols, [rect, child], n, 0, masks);
    expect(rows.map(r => r.name)).toEqual(['All events', 'rect', 'child']);
    expect(rows[1]!.stats).toMatchObject({ count: 20, pctParent: 20, pctTotal: 20 });
    expect(rows[2]!.stats).toMatchObject({ count: 10, pctParent: 50, pctTotal: 10 });
  });
  it('gates are evaluated on the scale they were drawn on', () => {
    const log = defaultScale('log');
    const g: Gate = { id: 'g', name: 'g', parent: null, type: 'range', param: 0, scale: log, min: 1, max: 2 };
    expect(maskCount(evaluateGates([[5, 10, 50, 100, 500]], [g], 5).g!)).toBe(3); // 10, 50, 100
  });
  it('rejects cycles and missing parents', () => {
    const a: Gate = { ...rect, id: 'a', parent: 'b' }, b: Gate = { ...rect, id: 'b', parent: 'a' };
    expect(() => evaluateGates(cols, [a, b], n)).toThrow(/ancestor/);
    expect(() => evaluateGates(cols, [{ ...rect, parent: 'zzz' }], n)).toThrow(/parent/);
  });
});

describe('population statistics', () => {
  it('matches hand-computed values for 1..5', () => {
    const s = populationStats([1, 2, 3, 4, 5], null, 5, 5);
    expect(s.count).toBe(5);
    expect(s.mean).toBe(3);
    expect(s.median).toBe(3);
    expect(s.geoMean).toBeCloseTo(120 ** 0.2, 10); // 2.6052
    expect(s.cv).toBeCloseTo((Math.sqrt(2.5) / 3) * 100, 10); // 52.70
    expect(s.robustCv).toBeCloseTo(((0.5 * (4.3652 - 1.6348)) / 3) * 100, 3); // 45.51
  });
  it('even-count median, masks, parent and total percentages', () => {
    const mask = Uint8Array.from([1, 1, 0, 1, 0, 0, 0, 0]);
    const s = populationStats([2, 4, 100, 8, 100, 100, 100, 100], mask, 4, 8);
    expect(s).toMatchObject({ count: 3, pctParent: 75, pctTotal: 37.5 });
    expect(s.median).toBe(4);
    expect(s.mean).toBeCloseTo(14 / 3, 12);
  });
  it('geometric mean ignores non-positive values and empty gates give NaN', () => {
    expect(populationStats([0, 4, 16], null, 3, 3).geoMean).toBeCloseTo(8, 10);
    const e = populationStats([1, 2], Uint8Array.from([0, 0]), 0, 2);
    expect(e.count).toBe(0);
    expect(e.mean).toBeNaN();
    expect(e.pctParent).toBeNaN();
  });
});

describe('binning', () => {
  it('histogram uses uniform bins on the display scale and clamps outliers', () => {
    const h = histogram([1, 10, 10, 100, 1000, 1e6], null, defaultScale('log'), 3, { min: 0, max: 3 });
    expect(Array.from(h.counts)).toEqual([1, 2, 3]); // [0,1): 1; [1,2): 10,10 ; [2,3]: 100,1000(clamped),1e6(clamped)
    expect(h.maxCount).toBe(3);
    const masked = histogram([1, 2, 3, 4], Uint8Array.from([1, 0, 1, 0]), lin, 2, { min: 0, max: 4 });
    expect(Array.from(masked.counts)).toEqual([1, 1]);
  });
  it('2-D density counts every event once', () => {
    const d = density2d([0.5, 0.5, 3.5, 2], [0.5, 0.5, 3.5, 2], null, lin, lin, { min: 0, max: 4 }, { min: 0, max: 4 }, 4, 4);
    expect(d.counts[0]).toBe(2);
    expect(d.counts[3 * 4 + 3]).toBe(1);
    expect(d.counts[2 * 4 + 2]).toBe(1);
    expect(d.maxCount).toBe(2);
    expect(Array.from(d.counts).reduce((a, b) => a + b, 0)).toBe(4);
  });
  it('subsamples deterministically and evenly', () => {
    expect(subsampleIndices(5, 10).length).toBe(5);
    const a = subsampleIndices(1_000_000), b = subsampleIndices(1_000_000);
    expect(a.length).toBe(100_000);
    expect(Array.from(a.subarray(0, 4))).toEqual([0, 10, 20, 30]);
    expect(a[99_999]).toBe(999_990);
    expect(Array.from(a.subarray(500, 505))).toEqual(Array.from(b.subarray(500, 505)));
  });
  it('auto range covers the data', () => {
    const r = autoRange(Array.from({ length: 1001 }, (_, i) => i), lin);
    expect(r.min).toBeLessThan(1);
    expect(r.max).toBeGreaterThan(999);
    expect(autoRange([5, 5, 5], lin).max).toBeGreaterThan(5);
    expect(autoRange([], lin)).toEqual({ min: 0, max: 1 });
  });
});

describe('synthetic example', () => {
  it('is seeded, labelled synthetic, and compensation changes FL2', () => {
    const a = syntheticExample(2000), b = syntheticExample(2000);
    expect(Array.from(a.columns[2]!.subarray(0, 5))).toEqual(Array.from(b.columns[2]!.subarray(0, 5)));
    expect(a.warnings[0]).toMatch(/Synthetic/);
    const raw = syntheticObserved(2000);
    expect(raw.columns[3]![0]).toBeGreaterThan(a.columns[3]![0]!);
    expect(a.eventCount).toBe(2000);
    const f = a.columns[0]!;
    const g: Gate = { id: 'g', name: 'big', parent: null, type: 'range', param: 0, scale: lin, min: 100_000, max: 1e9 };
    const frac = maskCount(evaluateGates(a.columns, [g], a.eventCount).g!) / f.length;
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.5);
  });
});
