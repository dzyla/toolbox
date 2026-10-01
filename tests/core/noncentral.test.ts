import { describe, expect, it } from 'vitest';
import { seededNormal } from './helpers';
import { centralTCdf, logGamma } from '@/core/stats';
import {
  criticalF, logBeta, noncentralFCdf, noncentralFSf, noncentralTCdf, normalCdf, regularizedBeta,
} from '@/core/stats/noncentral';


describe('incomplete beta and normal CDF', () => {
  it('logBeta agrees with log Gamma, including the large-argument branch', () => {
    for (const [a, b] of [[0.5, 0.5], [2, 3], [7.5, 40], [20, 30], [9, 100]] as const) {
      expect(logBeta(a, b)).toBeCloseTo(logGamma(a) + logGamma(b) - logGamma(a + b), 9);
    }
  });

  it('matches closed forms for integer shapes', () => {
    expect(regularizedBeta(0.3, 1, 1)).toBeCloseTo(0.3, 13);
    expect(regularizedBeta(0.3, 2, 1)).toBeCloseTo(0.09, 13);
    expect(regularizedBeta(0.3, 1, 4)).toBeCloseTo(1 - 0.7 ** 4, 13);
    expect(regularizedBeta(0.4, 3, 5) + regularizedBeta(0.6, 5, 3)).toBeCloseTo(1, 13);
  });

  it('normal CDF reproduces textbook values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 15);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 12); // Phi(1.96), standard table 0.9750
    expect(normalCdf(-5)).toBeCloseTo(2.866515718791939e-7, 18); // Phi(-5), 2.8665e-7
    expect(normalCdf(-3) + normalCdf(3)).toBeCloseTo(1, 15);
  });
});

describe('noncentral F', () => {
  it('with lambda = 0 equals the central F: closed form for df1 = 2', () => {
    // P(F > f) = (df2 / (df2 + 2 f))^(df2 / 2) exactly when df1 = 2.
    for (const [f, d2] of [[0.5, 6], [3, 10], [9.5, 25], [1, 3]] as const) {
      expect(noncentralFSf(f, 2, d2, 0)).toBeCloseTo((d2 / (d2 + 2 * f)) ** (d2 / 2), 12);
      expect(noncentralFCdf(f, 2, d2, 0)).toBeCloseTo(1 - (d2 / (d2 + 2 * f)) ** (d2 / 2), 12);
    }
  });

  it('with lambda = 0 and df1 = 1 equals the square of a central t', () => {
    for (const [f, d2] of [[0.7, 5], [4, 12], [10, 40]] as const) {
      expect(noncentralFCdf(f, 1, d2, 0)).toBeCloseTo(2 * centralTCdf(Math.sqrt(f), d2) - 1, 11);
    }
  });

  it('with df1 = 1 equals the noncentral t interval (independent code path)', () => {
    for (const [f, d2, lambda] of [[3.2, 14, 4], [8, 30, 9.5], [1.1, 6, 0.8], [20, 100, 25]] as const) {
      const root = Math.sqrt(f), delta = Math.sqrt(lambda);
      const viaT = noncentralTCdf(root, d2, delta) - noncentralTCdf(-root, d2, delta);
      expect(noncentralFCdf(f, 1, d2, lambda)).toBeCloseTo(viaT, 10);
    }
  });

  it('cdf + sf = 1, increases with f and decreases with lambda', () => {
    expect(noncentralFCdf(2.5, 3, 40, 6) + noncentralFSf(2.5, 3, 40, 6)).toBeCloseTo(1, 12);
    expect(noncentralFSf(2.5, 3, 40, 12)).toBeGreaterThan(noncentralFSf(2.5, 3, 40, 6));
    expect(noncentralFSf(4, 3, 40, 6)).toBeLessThan(noncentralFSf(2.5, 3, 40, 6));
  });

  it('critical F: F(0.05; 1, 10) = t(0.975; 10)^2 = 4.9646 (standard table)', () => {
    expect(criticalF(0.05, 1, 10)).toBeCloseTo(4.9646, 3);
    expect(criticalF(0.05, 2, 10)).toBeCloseTo(4.1028, 3); // standard F table, df (2, 10)
    expect(criticalF(0.05, 3, 120)).toBeCloseTo(2.6802, 3); // standard F table, df (3, 120)
  });

  it('stays finite for very large noncentrality and large df', () => {
    expect(noncentralFSf(3, 3, 1000, 1e5)).toBeCloseTo(1, 12);
    expect(noncentralFCdf(3, 3, 1000, 1e5)).toBeCloseTo(0, 12);
    const p = noncentralFSf(1.5, 3, 1_000_000, 4000);
    expect(p).toBeGreaterThan(0.999999);
  });

  it('matches a seeded Monte Carlo simulation of the definition', () => {
    const normal = seededNormal(20260930);
    const d1 = 3, d2 = 20, lambda = 9, draws = 40000, f0 = 3;
    const shift = Math.sqrt(lambda);
    let above = 0;
    for (let i = 0; i < draws; i++) {
      let numerator = 0, denominator = 0;
      for (let j = 0; j < d1; j++) { const z = normal() + (j === 0 ? shift : 0); numerator += z * z; }
      for (let j = 0; j < d2; j++) { const z = normal(); denominator += z * z; }
      if (numerator / d1 / (denominator / d2) > f0) above++;
    }
    // Binomial SE <= 0.0025; allow 5 SE.
    expect(Math.abs(above / draws - noncentralFSf(f0, d1, d2, lambda))).toBeLessThan(0.0125);
  });
});

describe('noncentral t', () => {
  it('with delta = 0 equals the central t', () => {
    for (const [t, df] of [[1.3, 12], [-0.4, 3], [2.8, 40], [0, 9]] as const) {
      expect(noncentralTCdf(t, df, 0)).toBeCloseTo(centralTCdf(t, df), 12);
      // A vanishing delta is continuous with the central distribution.
      expect(noncentralTCdf(t, df, 1e-9)).toBeCloseTo(centralTCdf(t, df), 8);
    }
  });

  it('satisfies the reflection identity and bounds', () => {
    expect(noncentralTCdf(-2, 20, 1.5)).toBeCloseTo(1 - noncentralTCdf(2, 20, -1.5), 14);
    expect(noncentralTCdf(0, 15, 2)).toBeCloseTo(normalCdf(-2), 12);
    expect(noncentralTCdf(Infinity, 5, 3)).toBe(1);
    expect(noncentralTCdf(-Infinity, 5, 3)).toBe(0);
  });

  // SciPy 1.14.1 nct.sf fixtures already used by tests/core/study-design.test.ts:
  // power = nct.sf(c, df, nc) + nct.cdf(-c, df, nc) with c = t.isf(alpha/2, df) and nc = d / sqrt(2/n).
  it.each([
    [64, 0.5, 1.9789706019673938, 0.8014595579287098],
    [63, 0.5, 1.979280116579683, 0.7951683381304626],
    [2, 0.5, 4.302652729696144, 0.06150785655741482],
  ])('reproduces the SciPy two-sided power for n = %i per group, d = %d', (n, d, c, power) => {
    const df = 2 * n - 2, delta = d / Math.sqrt(2 / n);
    expect(1 - noncentralTCdf(c, df, delta) + noncentralTCdf(-c, df, delta)).toBeCloseTo(power, 9);
  });

  it('approaches the normal CDF Phi(t - delta) as df grows', () => {
    expect(noncentralTCdf(2.5, 1_000_000, 1.5)).toBeCloseTo(normalCdf(1), 4);
    expect(noncentralTCdf(40, 1_000_000, 40)).toBeCloseTo(0.5, 4);
  });

  it('survives a large noncentrality (series started at the Poisson mode)', () => {
    // delta = 60: exp(-delta^2 / 2) underflows a naive start; T' ~ delta is near the median.
    const p = noncentralTCdf(60, 5000, 60);
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });

  it('matches a seeded Monte Carlo simulation of the definition', () => {
    const normal = seededNormal(77);
    const df = 9, delta = 2.2, draws = 40000;
    const points = [1, 2.2, 3.5];
    const below = points.map(() => 0);
    for (let i = 0; i < draws; i++) {
      let chi = 0;
      for (let j = 0; j < df; j++) { const z = normal(); chi += z * z; }
      const t = (normal() + delta) / Math.sqrt(chi / df);
      points.forEach((point, index) => { if (t <= point) below[index]!++; });
    }
    points.forEach((point, index) => {
      expect(Math.abs(below[index]! / draws - noncentralTCdf(point, df, delta))).toBeLessThan(0.0125);
    });
  });
});
