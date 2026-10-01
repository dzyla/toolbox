import { describe, expect, it } from 'vitest';
import { criticalT } from '@/core/stats';
import { criticalF } from '@/core/stats/noncentral';
import { twoSamplePower } from '@/core/study-design';
import {
  anovaMinimumDetectableEffect, anovaPower, cohensDz, cohensF, pairedMinimumDetectableEffect, pairedPower,
  requiredAnovaSampleSize, requiredPairedSampleSize,
} from '@/core/study-design/designs';
import { seededNormal } from './helpers';

const base = { alpha: 0.05, targetPower: 0.8, dropoutFraction: 0 };

describe('paired t-test planning', () => {
  // Cohen (1988) / G*Power "Means: difference from constant (one sample case)": d_z = 0.5, alpha = 0.05,
  // power 0.80 needs 34 pairs two-sided (actual power 0.8078) and 27 one-sided (actual power 0.8118).
  // The values below are recomputed here by the exact noncentral t and re-verified by the Monte Carlo test.
  it('reproduces the well-known d_z = 0.5 designs', () => {
    const two = requiredPairedSampleSize({ ...base, effectSize: 0.5, alternative: 'two-sided' });
    expect(two).toMatchObject({ n: 34, enrollN: 34, degreesOfFreedom: 33 });
    expect(two.achievedPower).toBeCloseTo(0.8078, 4);
    expect(pairedPower({ n: 33, effectSize: 0.5, alpha: 0.05, alternative: 'two-sided' }).power).toBeLessThan(0.8);
    const one = requiredPairedSampleSize({ ...base, effectSize: 0.5, alternative: 'one-sided' });
    expect(one.n).toBe(27);
    expect(one.achievedPower).toBeCloseTo(0.8118, 4);
  });

  it('matches a seeded Monte Carlo simulation of the paired t-test', () => {
    const normal = seededNormal(424242);
    const n = 10, dz = 0.8, draws = 20000;
    const critical = criticalT(0.025, n - 1);
    let rejected = 0;
    for (let i = 0; i < draws; i++) {
      const d = Array.from({ length: n }, () => dz + normal());
      const mean = d.reduce((s, v) => s + v, 0) / n;
      const sd = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
      if (Math.abs(mean / (sd / Math.sqrt(n))) > critical) rejected++;
    }
    const exact = pairedPower({ n, effectSize: dz, alpha: 0.05, alternative: 'two-sided' }).power;
    expect(Math.abs(rejected / draws - exact)).toBeLessThan(0.0175); // 5 binomial SE at most
  });

  it('is consistent with its own inversions and rejects invalid input', () => {
    const effect = pairedMinimumDetectableEffect({ n: 34, alpha: 0.05, alternative: 'two-sided', targetPower: 0.8 });
    expect(effect).toBeLessThan(0.5);
    expect(pairedPower({ n: 34, effectSize: effect, alpha: 0.05, alternative: 'two-sided' }).power).toBeCloseTo(0.8, 6);
    const dropped = requiredPairedSampleSize({ ...base, dropoutFraction: 0.1, effectSize: 0.5, alternative: 'two-sided' });
    expect(dropped.enrollN).toBe(38); // ceil(34 / 0.9)
    expect(cohensDz(-2, 4)).toBe(0.5);
    expect(() => pairedPower({ n: 1, effectSize: 0.5, alpha: 0.05, alternative: 'two-sided' })).toThrow(RangeError);
    expect(() => cohensDz(1, 0)).toThrow(RangeError);
    expect(() => requiredPairedSampleSize({ ...base, effectSize: 1e-6, alternative: 'two-sided' })).toThrow(/one million/);
  });
});

describe('one-way ANOVA planning', () => {
  // Cohen (1988) tables / G*Power "F tests: ANOVA fixed effects, omnibus, one-way": f = 0.25, alpha = 0.05,
  // power 0.80 gives N = 180 for four groups (45 each), N = 159 for three groups (53 each),
  // and N = 66 for three groups at f = 0.40.
  it('reproduces the well-known Cohen f designs', () => {
    const four = requiredAnovaSampleSize({ ...base, groups: 4, effectSize: 0.25 });
    expect(four).toMatchObject({ nPerGroup: 45, totalN: 180, df1: 3, df2: 176 });
    expect(four.achievedPower).toBeCloseTo(0.804, 3);
    expect(anovaPower({ groups: 4, nPerGroup: 44, effectSize: 0.25, alpha: 0.05 }).power).toBeLessThan(0.8);
    expect(requiredAnovaSampleSize({ ...base, groups: 3, effectSize: 0.25 }).totalN).toBe(159);
    expect(requiredAnovaSampleSize({ ...base, groups: 3, effectSize: 0.4 }).totalN).toBe(66);
  });

  it('equals the exact two-sided two-sample t-test for k = 2 (F = t^2, f = d / 2)', () => {
    // Independent of the F code path: the existing planner integrates the noncentral t definition.
    for (const [n, d] of [[20, 0.8], [64, 0.5], [12, 1.2]] as const) {
      const anova = anovaPower({ groups: 2, nPerGroup: n, effectSize: d / 2, alpha: 0.05 }).power;
      const t = twoSamplePower({ n1: n, n2: n, effectSize: d, alpha: 0.05, alternative: 'two-sided' }).power;
      expect(anova).toBeCloseTo(t, 7);
    }
  });

  it('matches a seeded Monte Carlo simulation of the F-test', () => {
    const normal = seededNormal(8675309);
    const k = 3, n = 8, f = 0.5, draws = 20000;
    const shift = f * Math.sqrt(1.5); // means (-a, 0, a): f = sqrt(2 a^2 / 3)
    const means = [-shift, 0, shift];
    const critical = criticalF(0.05, k - 1, k * (n - 1));
    let rejected = 0;
    for (let i = 0; i < draws; i++) {
      const groups = means.map(mu => Array.from({ length: n }, () => mu + normal()));
      const groupMeans = groups.map(g => g.reduce((s, v) => s + v, 0) / n);
      const grand = groupMeans.reduce((s, v) => s + v, 0) / k;
      const between = n * groupMeans.reduce((s, m) => s + (m - grand) ** 2, 0) / (k - 1);
      const within = groups.reduce((s, g, gi) => s + g.reduce((a, v) => a + (v - groupMeans[gi]!) ** 2, 0), 0) / (k * (n - 1));
      if (between / within > critical) rejected++;
    }
    const exact = anovaPower({ groups: k, nPerGroup: n, effectSize: f, alpha: 0.05 }).power;
    expect(Math.abs(rejected / draws - exact)).toBeLessThan(0.0175);
  });

  it('inverts to a minimum detectable f and derives f from group means', () => {
    const effect = anovaMinimumDetectableEffect({ groups: 4, nPerGroup: 45, alpha: 0.05, targetPower: 0.8 });
    expect(effect).toBeLessThan(0.25);
    expect(anovaPower({ groups: 4, nPerGroup: 45, effectSize: effect, alpha: 0.05 }).power).toBeCloseTo(0.8, 6);
    expect(cohensF([-0.5, 0.5], 1)).toBeCloseTo(0.5, 12); // f = d / 2 for two groups
    expect(cohensF([1, 2, 3], 1)).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect(() => cohensF([2, 2, 2], 1)).toThrow(RangeError);
    expect(() => cohensF([1], 1)).toThrow(RangeError);
    expect(requiredAnovaSampleSize({ ...base, dropoutFraction: 0.2, groups: 4, effectSize: 0.25 }))
      .toMatchObject({ enrollPerGroup: 57, enrollTotal: 228 }); // ceil(45 / 0.8) = 57
    expect(() => anovaPower({ groups: 1, nPerGroup: 10, effectSize: 0.3, alpha: 0.05 })).toThrow(RangeError);
  });
});
