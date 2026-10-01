import { describe, it, expect } from 'vitest';
import * as P from '@/core/protein';

// Same reference sequences as protein.test.ts (ExPASy ProtParam values).
const LYSOZYME = 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL';
const INSULIN_B = 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT';

describe('titrationCurve', () => {
  const seqs = { lysozyme: LYSOZYME, insulinB: INSULIN_B, acidic: 'DDEEAGDE' };
  for (const scheme of ['bjellqvist', 'emboss'] as const) {
    for (const [name, seq] of Object.entries(seqs)) {
      it(`${name} (${scheme}): zero at pI and strictly decreasing`, () => {
        const counts = P.countAA(seq);
        const t = P.titrationCurve(counts, scheme, seq);
        expect(t.pH.length).toBe(141);
        expect(t.pH[0]).toBe(0);
        expect(t.pH[140]).toBe(14);
        expect(Math.abs(P.netCharge(counts, t.pI, scheme, seq))).toBeLessThan(1e-3);
        for (let i = 1; i < t.charge.length; i++) expect(t.charge[i]!).toBeLessThan(t.charge[i - 1]!);
      });
    }
    it(`limiting charges match the group counts (${scheme})`, () => {
      // No Arg (pKa ~12), so basic groups are within a few percent of fully protonated at pH 0
      // and acidic groups within a few percent of fully deprotonated at pH 14.
      const seq = 'ACDEKYHKSG';
      const counts = P.countAA(seq);
      const t = P.titrationCurve(counts, scheme, seq);
      const basic = 1 + counts.K! + counts.H!;
      const acidic = 1 + counts.D! + counts.E! + counts.C! + counts.Y!;
      expect(t.charge[0]!).toBeGreaterThan(basic - 0.02 * (acidic + basic));
      expect(t.charge[0]!).toBeLessThanOrEqual(basic);
      expect(t.charge[140]!).toBeLessThan(-acidic + 0.02 * (acidic + basic));
      expect(t.charge[140]!).toBeGreaterThanOrEqual(-acidic);
    });
  }
  it('reproduces the published pI values', () => {
    expect(P.titrationCurve(P.countAA(LYSOZYME), 'bjellqvist', LYSOZYME).pI).toBeCloseTo(9.32, 2);
    expect(P.titrationCurve(P.countAA(INSULIN_B), 'bjellqvist', INSULIN_B).pI).toBeCloseTo(6.90, 2);
  });
});
