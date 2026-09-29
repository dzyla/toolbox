import { describe, expect, it } from 'vitest';
import { nebTm, wallaceTm } from '@/core/cloning/neb-tm';
import reference from '../fixtures/vendor/nebuilder/tm.json';

describe('NEB Tm (NEBuilder v2.11.2 reference values)', () => {
  for (const condition of reference.cases) {
    it(`method ${condition.method}, ${condition.salt} mM, ${condition.ct} nM`, () => {
      for (const [sequence, expected] of condition.results as [string, number][]) {
        const tm = nebTm(sequence, { method: condition.method as 4 | 5, monovalentMm: condition.salt, primerNm: condition.ct });
        expect(Math.abs(tm - expected), sequence).toBeLessThan(1e-9);
      }
    });
  }

  it('scores overlaps with the Wallace rule', () => {
    expect(wallaceTm('ctacgtccagggtaccgagc')).toBe(66); // 13 G/C × 4 + 7 A/T × 2
  });
});
