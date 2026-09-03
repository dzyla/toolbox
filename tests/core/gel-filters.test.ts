import { describe, it, expect } from 'vitest';
import { gaussianSmooth, minFilter, maxFilter, opening, median, mean, findPeaks } from '@/core/gel/filters';

const gauss = (n: number, peaks: { c: number; s: number; a: number }[], base = 0) =>
  Float32Array.from({ length: n }, (_, i) => base + peaks.reduce((t, p) => t + p.a * Math.exp(-((i - p.c) ** 2) / (2 * p.s * p.s)), 0));

describe('gel filters', () => {
  it('gaussian smoothing preserves a constant and the sum of a bump', () => {
    const c = gaussianSmooth(new Float32Array(20).fill(3), 2);
    c.forEach(v => expect(v).toBeCloseTo(3, 5));
    const bump = gauss(101, [{ c: 50, s: 2, a: 1 }]);
    const sm = gaussianSmooth(bump, 3);
    const sum = (a: Float32Array) => a.reduce((t, v) => t + v, 0);
    expect(sum(sm)).toBeCloseTo(sum(bump), 3);
    expect(sm[50]).toBeLessThan(bump[50]!);
  });
  it('min/max filters and opening', () => {
    const x = [5, 1, 5, 5, 5, 0, 5];
    expect(Array.from(minFilter(x, 1))).toEqual([1, 1, 1, 5, 0, 0, 0]);
    expect(Array.from(maxFilter(x, 1))).toEqual([5, 5, 5, 5, 5, 5, 5]);
    // opening removes a narrow spike but keeps a wide plateau
    const spike = [0, 0, 0, 9, 0, 0, 0, 4, 4, 4, 4, 4, 0, 0];
    expect(Array.from(opening(spike, 1))).toEqual([0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 0, 0]);
  });
  it('median and mean ignore NaN', () => {
    expect(median([3, NaN, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(mean([1, NaN, 3])).toBe(2);
  });
  it('finds peaks with prominence, sub-pixel apex, widths and bounds', () => {
    const y = gauss(200, [{ c: 50.3, s: 3, a: 1 }, { c: 120, s: 5, a: 0.5 }, { c: 150, s: 2, a: 0.02 }], 0.1);
    const peaks = findPeaks(y, { minProminence: 0.05, relative: true });
    expect(peaks.length).toBe(2);
    expect(peaks[0]!.index).toBeCloseTo(50.3, 1);
    expect(peaks[0]!.prominence).toBeCloseTo(1, 2);
    expect(peaks[0]!.width).toBeCloseTo(2 * Math.sqrt(2 * Math.log(2)) * 3, 0); // FWHM 7.06
    expect(peaks[1]!.index).toBeCloseTo(120, 1);
    // 3 % edges of a Gaussian lie at ±2.65σ
    expect(peaks[0]!.left).toBeGreaterThanOrEqual(50 - 9); expect(peaks[0]!.left).toBeLessThanOrEqual(50 - 7);
    expect(peaks[0]!.right).toBeGreaterThanOrEqual(50 + 7); expect(peaks[0]!.right).toBeLessThanOrEqual(50 + 9);
    // the small bump appears with a lower threshold
    expect(findPeaks(y, { minProminence: 0.01, relative: true }).length).toBe(3);
  });
  it('splits overlapping peaks at the valley and handles plateaus', () => {
    const y = gauss(100, [{ c: 40, s: 3, a: 1 }, { c: 52, s: 3, a: 0.8 }]);
    const peaks = findPeaks(y);
    expect(peaks.length).toBe(2);
    expect(peaks[0]!.right).toBeLessThanOrEqual(46); expect(peaks[1]!.left).toBeGreaterThanOrEqual(46);
    const plateau = [0, 1, 2, 2, 2, 1, 0];
    expect(findPeaks(plateau)[0]!.index).toBe(3);
  });
});
