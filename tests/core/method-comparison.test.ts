import { describe, expect, it } from 'vitest';
import {
  blandAltman, parsePairedColumns, proportionalBiasNote, regressDifferenceOnMean, tTwoSidedP,
} from '@/core/method-comparison';

// Hand-computable fixture: differences 1..5. Mean 3, s = sqrt(2.5) = 1.58114, n = 5, t(0.975, 4) = 2.776445 (t table).
const b = [10, 11, 12, 13, 14];
const a = [11, 13, 15, 17, 19];

describe('Bland-Altman statistics', () => {
  it('computes bias, limits of agreement and their confidence intervals by the 1986/1999 formulas', () => {
    const r = blandAltman(a, b);
    const s = Math.sqrt(2.5), t = 2.776445;
    expect(r.n).toBe(5);
    expect(r.bias.estimate).toBeCloseTo(3, 12);
    expect(r.sd).toBeCloseTo(s, 12);
    expect(r.lowerLimit.estimate).toBeCloseTo(3 - 1.96 * s, 12);
    expect(r.upperLimit.estimate).toBeCloseTo(3 + 1.96 * s, 12);
    // SE(bias) = s / sqrt(n) = 0.707107; CI half-width = 2.776445 * 0.707107 = 1.963224
    expect(r.bias.upper - r.bias.estimate).toBeCloseTo(t * s / Math.sqrt(5), 5);
    expect(r.bias.upper - r.bias.estimate).toBeCloseTo(1.96322, 4);
    // SE(limit) = s sqrt(1/5 + 1.96^2 / 8) = 1.58114 * 0.82475 = 1.30403; half-width = 3.62065
    expect(r.upperLimit.upper - r.upperLimit.estimate).toBeCloseTo(t * s * Math.sqrt(0.2 + 1.96 ** 2 / 8), 5);
    expect(r.upperLimit.upper - r.upperLimit.estimate).toBeCloseTo(3.6206, 3);
    expect(r.lowerLimit.estimate - r.lowerLimit.lower).toBeCloseTo(r.upperLimit.upper - r.upperLimit.estimate, 12);
    expect(r.warnings.join(' ')).toMatch(/Only 5 pairs/);
  });

  it('uses A minus B and the mean of each pair', () => {
    const r = blandAltman([5, 7, 9], [4, 4, 4]);
    expect(r.differences).toEqual([1, 3, 5]);
    expect(r.means).toEqual([4.5, 5.5, 6.5]);
  });

  it('reports a perfectly linear difference-versus-mean trend as proportional bias', () => {
    const r = blandAltman(a, b);
    expect(r.slope!.estimate).toBeCloseTo(2 / 3, 12);
    expect(r.slope!.p).toBe(0);
    expect(proportionalBiasNote(r).flagged).toBe(true);
  });

  it('regression slope test matches a hand calculation (t = 2.3094, df = 3, two-sided p between 0.10 and 0.11)', () => {
    // x = 1..5, y = 2,1,4,3,5: slope 0.8, SSE 3.6, SE = sqrt(3.6/3/10) = 0.34641.
    const fit = regressDifferenceOnMean([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])!;
    expect(fit.estimate).toBeCloseTo(0.8, 12);
    expect(fit.intercept).toBeCloseTo(0.6, 12);
    expect(fit.standardError).toBeCloseTo(Math.sqrt(0.12), 12);
    expect(fit.t).toBeCloseTo(2.3094, 4);
    // t(0.95; 3) = 2.353 gives p = 0.10, so a slightly smaller t gives a slightly larger p.
    expect(fit.p).toBeGreaterThan(0.1);
    expect(fit.p).toBeLessThan(0.11);
    expect(regressDifferenceOnMean([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it('two-sided t p-value equals 0.05 at the tabulated critical values', () => {
    expect(tTwoSidedP(2.776445, 4)).toBeCloseTo(0.05, 5);
    expect(tTwoSidedP(-2.228139, 10)).toBeCloseTo(0.05, 5); // t(0.975, 10) = 2.228139
    expect(tTwoSidedP(0, 7)).toBeCloseTo(1, 12);
  });

  it('says there is no clear proportional bias for unrelated differences', () => {
    const r = blandAltman([10, 12, 14, 16, 18, 20], [9.5, 12.8, 13.1, 16.9, 17.2, 20.4]);
    const note = proportionalBiasNote(r);
    expect(note.flagged).toBe(false);
    expect(note.text).toMatch(/No clear proportional bias/);
  });

  it('percent variant: constant 10% excess gives constant percent difference', () => {
    const base = [2, 4, 6, 8];
    const r = blandAltman(base.map(v => v * 1.1), base, 'percent');
    expect(r.bias.estimate).toBeCloseTo(100 * 0.1 / 1.05, 10);
    expect(r.sd).toBeCloseTo(0, 10);
  });

  it('log variant: constant ratio of two is recovered by back-transformation', () => {
    const base = [1, 2, 3, 4, 5];
    const r = blandAltman(base.map(v => v * 2), base, 'log');
    expect(r.bias.estimate).toBeCloseTo(Math.LN2, 12);
    expect(r.ratios!.bias.estimate).toBeCloseTo(2, 12);
    expect(r.ratios!.lowerLimit.estimate).toBeCloseTo(2, 8);
    expect(r.warnings.join(' ')).toMatch(/identical/);
  });

  it('rejects data the chosen variant cannot handle', () => {
    expect(() => blandAltman([1, 2], [1, 2])).toThrow(/three pairs/);
    expect(() => blandAltman([1, 2, 0], [1, 2, 3], 'log')).toThrow(/greater than zero/);
    expect(() => blandAltman([1, -2, 3], [-1, 2, 3], 'percent')).toThrow(/non-zero/);
    expect(() => blandAltman([1, 2, 3], [1, 2])).toThrow(/same number/);
  });
});

describe('paired column parsing', () => {
  it('reads a CSV with a header and names the methods', () => {
    const r = parsePairedColumns('Lab,Meter\n5.1,5.3\n6.2,6.0\n7.5,7.9\n');
    expect(r).toMatchObject({ labelA: 'Lab', labelB: 'Meter', a: [5.1, 6.2, 7.5], b: [5.3, 6.0, 7.9] });
  });

  it('reads TSV and whitespace tables without a header, skipping bad rows with a note', () => {
    const tsv = parsePairedColumns('1\t2\n3\t4\nx\t5\n6\t\n');
    expect(tsv.a).toEqual([1, 3]);
    expect(tsv.b).toEqual([2, 4]);
    expect(tsv.notes.join(' ')).toMatch(/2 rows skipped/);
    expect(parsePairedColumns('1 2\n3  4\n').b).toEqual([2, 4]);
    expect(parsePairedColumns('1;2\n3;4').a).toEqual([1, 3]);
  });

  it('notes extra columns and rejects empty input', () => {
    expect(parsePairedColumns('1,2,3\n4,5,6').notes.join(' ')).toMatch(/only the first two/);
    expect(() => parsePairedColumns('  \n')).toThrow(RangeError);
  });
});
