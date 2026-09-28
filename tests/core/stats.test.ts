import { describe, expect, it } from 'vitest';
import { centralTCdf, logGamma, regularizedBetaHalf, studentTQuantile, tCritical95 } from '@/core/stats';

// Reference values from SciPy 1.14 (scipy.stats.t, scipy.special.gammaln / betainc).
describe('shared statistics', () => {
  it('matches SciPy two-sided 95% t multipliers', () => {
    const scipy: Array<[number, number]> = [
      [1, 12.706204736432095],
      [2, 4.302652729696142],
      [3, 3.182446305284263],
      [4, 2.7764451051977987],
      [6, 2.4469118511449692],
      [10, 2.2281388519649385],
      [30, 2.0422724563012373],
      [120, 1.9799304050527766],
    ];
    for (const [df, t] of scipy) expect(tCritical95(df)).toBeCloseTo(t, 9);
  });

  it('matches SciPy upper-tail quantiles and CDF values', () => {
    expect(studentTQuantile(0.005, 5)).toBeCloseTo(4.032142983557536, 9);
    expect(studentTQuantile(0, 5)).toBe(Infinity);
    expect(studentTQuantile(0.5, 5)).toBe(0);
    expect(centralTCdf(-2, 7)).toBeCloseTo(0.04280966428148798, 12);
    expect(centralTCdf(1.5, 3)).toBeCloseTo(0.8847080673775886, 12);
  });

  it('matches SciPy log Gamma and incomplete beta', () => {
    expect(logGamma(0.3)).toBeCloseTo(1.0957979948180756, 12);
    expect(logGamma(10.5)).toBeCloseTo(13.940625219403763, 11);
    expect(logGamma(171.2)).toBeCloseTo(707.60092684767, 9);
    expect(regularizedBetaHalf(0.7, 0.3, 3.5)).toBeCloseTo(0.12687036692367099, 12);
  });

  it('rejects non-positive degrees of freedom', () => {
    expect(() => centralTCdf(1, 0)).toThrow(RangeError);
  });
});
