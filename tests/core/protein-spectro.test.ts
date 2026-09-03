import { describe, expect, it } from 'vitest';
import { bradfordFit, concentrationFromA280, standardCurve } from '@/core/spectro/protein';

describe('protein spectrophotometry', () => {
  it('recovers 1 mg/mL BSA from A280 0.660', () => {
    // 1 mg/mL = 1 g/L; c = 1 / 66,430 M and A = 43,824*c*1 cm = 0.6597019.
    const result = concentrationFromA280(43824 / 66430, 43824, 1, 1, 66430);
    expect(result.molar).toBeCloseTo(1 / 66430, 12);
    expect(result.gPerL).toBeCloseTo(1, 12);
  });

  it('recovers slope, intercept, R squared, and an unknown from exact linear points', () => {
    const fit = standardCurve([
      { concentration: 0, absorbance: 0.1 },
      { concentration: 1, absorbance: 2.1 },
      { concentration: 2, absorbance: 4.1 },
    ], 'linear');
    expect(fit.coefficients).toEqual(expect.arrayContaining([expect.closeTo(0.1, 12), expect.closeTo(2, 12)]));
    expect(fit.r2).toBeCloseTo(1, 12);
    expect(fit.concentrationAt(3.1)).toBeCloseTo(1.5, 12);
  });

  it('fits and inverts an exact quadratic standard curve', () => {
    const fit = standardCurve([
      { concentration: 0, absorbance: 1 },
      { concentration: 1, absorbance: 4 },
      { concentration: 2, absorbance: 9 },
      { concentration: 3, absorbance: 16 },
    ], 'quadratic');
    // y = x² + 2x + 1
    expect(fit.coefficients[0]).toBeCloseTo(1, 10);
    expect(fit.coefficients[1]).toBeCloseTo(2, 10);
    expect(fit.coefficients[2]).toBeCloseTo(1, 10);
    expect(fit.r2).toBeCloseTo(1, 12);
    expect(fit.concentrationAt(12.25)).toBeCloseTo(2.5, 10);
  });

  it('uses the linear Bradford convenience fit', () => {
    const fit = bradfordFit([
      { concentration: 0, absorbance: 0 },
      { concentration: 0.5, absorbance: 0.25 },
      { concentration: 1, absorbance: 0.5 },
    ]);
    expect(fit.model).toBe('linear');
    expect(fit.concentrationAt(0.125)).toBeCloseTo(0.25, 12);
  });
});
