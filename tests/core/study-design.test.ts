import { describe, expect, it } from 'vitest';
import { cohensD, minimumDetectableEffect, requiredSampleSize, twoSamplePower } from '@/core/study-design';

const design = {
  effectSize: 0.5, alpha: 0.05, targetPower: 0.8,
  alternative: 'two-sided' as const, allocationRatio: 1, dropoutFraction: 0,
};
const powerInput = { n1: 64, n2: 64, effectSize: 0.5, alpha: 0.05, alternative: 'two-sided' as const };

describe('independent two-group study design', () => {
  it('finds the first integer design meeting the R/G*Power reference target', () => {
    const result = requiredSampleSize(design);
    expect(result).toMatchObject({ n1: 64, n2: 64, enrollN1: 64, enrollN2: 64, degreesOfFreedom: 126 });
    expect(result.achievedPower).toBeGreaterThanOrEqual(0.8);
    expect(twoSamplePower({ ...powerInput, n1: 63, n2: 63 }).power).toBeLessThan(0.8);
  });

  // Independent fixtures: SciPy 1.14.1 scipy.stats.t.isf and nct.sf/cdf.
  // c = t.isf(alpha / sides, n1+n2-2); nc = d/sqrt(1/n1+1/n2).
  // power = nct.sf(c, df, nc) + (nct.cdf(-c, df, nc) if sides == 2 else 0).
  // https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.nct.html
  // R comparison must use strict=TRUE to include both rejection tails:
  // https://stat.ethz.ch/R-manual/R-devel/library/stats/html/power.t.test.html
  it.each([
    [64, 64, 0.5, 0.05, 'two-sided', 1.9789706019673938, 0.8014595579287098],
    [63, 63, 0.5, 0.05, 'two-sided', 1.979280116579683, 0.7951683381304626],
    [51, 51, 0.5, 0.05, 'one-sided', 1.6602343260657506, 0.805898599099362],
    [48, 96, 0.5, 0.05, 'two-sided', 1.97681099362009, 0.8021395496712933],
    [2, 2, 0.5, 0.05, 'two-sided', 4.302652729696144, 0.06150785655741482],
    [20, 30, 0.8, 0.01, 'two-sided', 2.682204026950214, 0.5397025710941604],
    [1000000, 1000000, 0.005, 0.05, 'two-sided', 1.9599651706775612, 0.9424373474287423],
  ] as const)('matches exact reference n1=%s n2=%s d=%s alpha=%s %s', (n1, n2, effectSize, alpha, alternative, critical, power) => {
    const result = twoSamplePower({ n1, n2, effectSize, alpha, alternative });
    expect(Math.abs(result.power - power)).toBeLessThan(1e-8);
    expect(result.criticalValue).toBeCloseTo(critical, 7);
    expect(result.degreesOfFreedom).toBe(n1 + n2 - 2);
    expect(result.noncentrality).toBeCloseTo(effectSize / Math.sqrt(1 / n1 + 1 / n2), 12);
  });

  it('requires fewer observations for a prespecified one-sided alternative', () => {
    expect(requiredSampleSize({ ...design, alternative: 'one-sided' })).toMatchObject({ n1: 51, n2: 51 });
    expect(twoSamplePower({ ...powerInput, n1: 50, n2: 50, alternative: 'one-sided' }).power).toBeLessThan(0.8);
  });

  it('keeps combined rejection-tail error within tolerance at small df and large alpha', () => {
    // Same independent SciPy fixture generator; protects the combined CDF error budget.
    const result = twoSamplePower({ n1: 3, n2: 3, effectSize: 0.001, alpha: 0.8, alternative: 'two-sided' });
    expect(Math.abs(result.power - 0.8000001455246012)).toBeLessThan(1e-8);
  });

  it('rounds unequal allocation up and finds the smallest group-one size', () => {
    expect(requiredSampleSize({ ...design, allocationRatio: 2 })).toMatchObject({ n1: 48, n2: 96 });
    const result = requiredSampleSize({ ...design, allocationRatio: 1.5 });
    expect(result.n2).toBe(Math.ceil(result.n1 * 1.5));
    expect(result.achievedPower).toBeGreaterThanOrEqual(0.8);
    expect(twoSamplePower({ ...powerInput, n1: result.n1 - 1, n2: Math.ceil((result.n1 - 1) * 1.5) }).power).toBeLessThan(0.8);
  });

  it('inflates enrollment for dropout without changing analysis power', () => {
    expect(requiredSampleSize({ ...design, dropoutFraction: 0.2 })).toMatchObject({ n1: 64, n2: 64, enrollN1: 80, enrollN2: 80 });
    expect(requiredSampleSize({ ...design, dropoutFraction: 0.2, alternative: 'one-sided' })).toMatchObject({ n1: 51, n2: 51, enrollN1: 64, enrollN2: 64 });
  });

  it('inverts power for detectable standardized effect', () => {
    const effect = minimumDetectableEffect({ n1: 64, n2: 64, alpha: 0.05, alternative: 'two-sided', targetPower: 0.8 });
    // scipy.optimize.brentq applied to the independent fixture formula above.
    expect(effect).toBeCloseTo(0.4990691779617176, 7);
    expect(twoSamplePower({ ...powerInput, effectSize: effect }).power).toBeGreaterThanOrEqual(0.8);
    expect(twoSamplePower({ ...powerInput, effectSize: effect - 0.00001 }).power).toBeLessThan(0.8);
  });

  it('preserves scientific monotonicity for sample size and effect', () => {
    expect(twoSamplePower({ ...powerInput, n1: 40, n2: 40, effectSize: 0.8 }).power)
      .toBeGreaterThan(twoSamplePower({ ...powerInput, n1: 20, n2: 20, effectSize: 0.8 }).power);
    expect(requiredSampleSize({ ...design, effectSize: 0.8 }).n1).toBeLessThan(requiredSampleSize(design).n1);
  });

  it('standardizes a meaningful absolute difference', () => {
    expect(cohensD(5, 10)).toBe(0.5);
    expect(cohensD(-5, 10)).toBe(0.5);
    expect(() => cohensD(1, 0)).toThrow('common standard deviation must be greater than zero');
    expect(() => cohensD(Infinity, 10)).toThrow();
    expect(() => cohensD(1, NaN)).toThrow();
    expect(() => cohensD(1e308, 1e-308)).toThrow();
  });

  it.each([
    { effectSize: 0 }, { effectSize: -0.1 }, { effectSize: Infinity }, { effectSize: NaN },
    { alpha: 0 }, { alpha: 1 }, { alpha: NaN }, { alpha: Infinity },
    { targetPower: 0 }, { targetPower: 1 }, { targetPower: 0.05 }, { targetPower: NaN },
    { allocationRatio: 0 }, { allocationRatio: -1 }, { allocationRatio: Infinity }, { allocationRatio: NaN },
    { dropoutFraction: -0.1 }, { dropoutFraction: 1 }, { dropoutFraction: NaN },
  ])('rejects invalid required-size settings %o', invalid => {
    expect(() => requiredSampleSize({ ...design, ...invalid })).toThrow(RangeError);
  });

  it.each([
    { n1: 1 }, { n2: 1 }, { n1: 2.5 }, { n2: NaN }, { n1: Infinity }, { n2: 1000001 },
    { effectSize: 0 }, { effectSize: -1 }, { effectSize: Infinity }, { alpha: 0 }, { alpha: 1 },
  ])('rejects invalid power settings %o', invalid => {
    expect(() => twoSamplePower({ ...powerInput, ...invalid })).toThrow(RangeError);
  });

  it('rejects unknown alternatives even for untyped callers', () => {
    expect(() => twoSamplePower({ ...powerInput, alternative: 'paired' as 'two-sided' })).toThrow(RangeError);
  });

  it('rejects invalid detectable-effect designs', () => {
    expect(() => minimumDetectableEffect({ ...powerInput, n1: 1, targetPower: 0.8 })).toThrow();
    expect(() => minimumDetectableEffect({ ...powerInput, targetPower: 0.01 })).toThrow();
  });

  it('bounds impossible designs and does not overflow enrollment', () => {
    expect(() => requiredSampleSize({ ...design, effectSize: 1e-8 })).toThrow('one million samples per group');
    expect(() => requiredSampleSize({ ...design, allocationRatio: 1000000 })).toThrow('one million samples per group');
    expect(() => requiredSampleSize({ ...design, dropoutFraction: 1 - Number.EPSILON })).toThrow();
  });
});
