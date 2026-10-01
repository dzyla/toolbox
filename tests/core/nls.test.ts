import { describe, expect, it } from 'vitest';
import { aicc, fitNls, fitNlsMultiStart, invertMatrix, nlsCi95, solveLinear } from '@/core/fitting/nls';

describe('linear algebra helpers', () => {
  it('solves and inverts a small system', () => {
    expect(solveLinear([[2, 1], [1, 3]], [3, 5])!.map(v => +v.toFixed(10))).toEqual([0.8, 1.4]);
    const inv = invertMatrix([[4, 7], [2, 6]])!;
    expect(inv[0]![0]).toBeCloseTo(0.6, 10);
    expect(inv[0]![1]).toBeCloseTo(-0.7, 10);
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeNull();
  });
});

describe('Levenberg–Marquardt', () => {
  const xs = Array.from({ length: 25 }, (_, i) => i * 0.4);
  const noise = (i: number) => 0.05 * Math.sin(i * 7.31);

  it('reproduces the closed-form OLS slope, intercept and standard errors for a linear model', () => {
    const y = xs.map((x, i) => 1.5 + 2 * x + noise(i));
    const r = fitNls({ predict: p => xs.map(x => p[0]! + p[1]! * x), y, p0: [0, 0] });
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (y[i]! - my), 0) / sxx;
    const icpt = my - slope * mx;
    const sse = y.reduce((a, v, i) => a + (v - icpt - slope * xs[i]!) ** 2, 0);
    const s2 = sse / (n - 2);
    expect(r.params[1]).toBeCloseTo(slope, 8);
    expect(r.params[0]).toBeCloseTo(icpt, 8);
    expect(r.se[1]).toBeCloseTo(Math.sqrt(s2 / sxx), 6);
    expect(r.se[0]).toBeCloseTo(Math.sqrt(s2 * (1 / n + mx * mx / sxx)), 6);
    expect(r.df).toBe(n - 2);
  });

  it('recovers a six-parameter double-exponential plus baseline that Nelder–Mead struggles with', () => {
    const t = Array.from({ length: 80 }, (_, i) => i * 0.25);
    const truth = [5, 2, 0.1, 3, 0.8, 1];
    const f = (p: number[]) => t.map(x => p[0]! * Math.exp(-p[2]! * x) + p[1]! * Math.exp(-p[4]! * x) * p[3]! / 3 + p[5]!);
    const y = f(truth).map((v, i) => v + noise(i) * 0.1);
    const r = fitNlsMultiStart({ predict: f, y, p0: [1, 1, 1, 1, 1, 1], lower: [0, 0, 0, 0, 0, -10] }, [[4, 1, 0.2, 1, 1, 0.5], [2, 3, 0.05, 2, 2, 0]]);
    expect(r.sse).toBeLessThan(0.1);
  });

  it('respects bounds and fixed parameters, and reports undefined SE for fixed ones', () => {
    const y = xs.map((x, i) => 3 * x + noise(i));
    const r = fitNls({ predict: p => xs.map(x => p[0]! * x + p[1]!), y, p0: [1, 0.5], fixed: [false, true] });
    expect(r.params[1]).toBe(0.5);
    expect(r.se[1]).toBeUndefined();
    expect(r.df).toBe(xs.length - 1);
    const b = fitNls({ predict: p => xs.map(x => p[0]! * x), y, p0: [1], upper: [2] });
    expect(b.params[0]).toBeLessThanOrEqual(2);
  });

  it('gives a Student-t confidence interval wider than ±1.96·SE for small n', () => {
    const x6 = [0, 1, 2, 3, 4, 5];
    const y6 = x6.map((x, i) => 2 + 0.7 * x + noise(i));
    const r = fitNls({ predict: p => x6.map(x => p[0]! + p[1]! * x), y: y6, p0: [0, 0] });
    const ci = nlsCi95(r, 1);
    expect(ci.ci95High! - r.params[1]!).toBeGreaterThan(1.96 * r.se[1]!);
  });

  it('AICc penalises extra parameters at equal fit and is infinite when n is too small', () => {
    expect(aicc(1, 20, 4)).toBeGreaterThan(aicc(1, 20, 2));
    expect(aicc(1, 3, 2)).toBe(Infinity);
  });
});
