import { describe, it, expect } from 'vitest';
import * as P from '@/core/protein';

// ExPASy ProtParam reference values (hen egg-white lysozyme, mature 129 aa; insulin B chain)
export const LYSOZYME = 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL';
export const INSULIN_B = 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT';

describe('core/protein', () => {
  const s = P.summarize(LYSOZYME);
  it('mass, pI, ε, Abs 0.1 %, formula match ProtParam for lysozyme', () => {
    expect(s.mw).toBeCloseTo(14313.14, 2);
    expect(s.pI).toBeCloseTo(9.32, 2);
    expect(s.ext.reduced).toBe(37470);
    expect(s.ext.cystines).toBe(37970);
    expect(s.ext.absCys).toBeCloseTo(2.653, 3);
    expect(s.formula).toBe('C613H959N193O185S10');
    expect(s.instability).toBeCloseTo(16.09, 2);
    expect(s.aliphatic).toBeCloseTo(65.12, 2);
    expect(s.gravy).toBeCloseTo(-0.472, 3);
  });
  it('insulin B chain pI and instability', () => {
    const b = P.summarize(INSULIN_B);
    expect(b.pI).toBeCloseTo(6.90, 2);
    expect(b.instability).toBeCloseTo(9.85, 2);
    expect(b.mw).toBeCloseTo(3429.96, 1);
  });
  it('EMBOSS pKa set is available and differs from Bjellqvist', () => {
    expect(P.isoelectricPoint(s.counts, 'emboss', LYSOZYME)).not.toBeCloseTo(s.pI, 2);
    expect(P.PKA_SETS.emboss.side.K).toBe(10.8);
  });
  it('net charge is zero at the pI and per-residue charges sum to net charge', () => {
    expect(P.netCharge(s.counts, s.pI, 'bjellqvist', LYSOZYME)).toBeCloseTo(0, 6);
    const arr = P.perResidueCharge(LYSOZYME, 7.4);
    expect(arr.reduce((a, b) => a + b, 0)).toBeCloseTo(P.netCharge(s.counts, 7.4, 'bjellqvist', LYSOZYME), 6);
  });
  it('denatured extinction coefficients', () => {
    const e = P.extinctionCoefficients(s.counts, s.mw, 'denatured');
    expect(e.reduced).toBe(37965);
    expect(e.cystines).toBe(38465);
  });
  it('monoisotopic mass of GAGAGA = 402.1863', () => {
    // 6 residues: G 57.02146 ×3 + A 71.03711 ×3 + H2O 18.010565
    expect(P.monoisotopicMass(P.countAA('GAGAGA'))).toBeCloseTo(402.18628, 4);
  });
  it('digest with trypsin respects K/R and the proline rule; missed cleavages', () => {
    const tryp = P.PROTEASES.find(p => p.name === 'Trypsin')!;
    const peps = P.digest('MKWVTFISLLFLFSSAYSRGVFRRDAHKSEVAHRPFK', tryp);
    expect(peps.map(p => p.seq)).toEqual(['MK', 'WVTFISLLFLFSSAYSR', 'GVFR', 'R', 'DAHK', 'SEVAHRPFK']);
    const mc1 = P.digest('AKBKC', P.PROTEASES.find(p => p.name === 'Trypsin/P')!, 1).map(p => p.seq);
    expect(mc1).toEqual(['AK', 'AKBK', 'BK', 'BKC', 'C']);
    const aspn = P.digest('MADGDA', P.PROTEASES.find(p => p.name === 'AspN')!).map(p => p.seq);
    expect(aspn).toEqual(['MA', 'DG', 'DA']);
    const lysc = P.digest('AKPAK', P.PROTEASES.find(p => p.name === 'LysC')!).map(p => p.seq);
    expect(lysc).toEqual(['AK', 'PAK']);
  });
  it('half-life lookup and FASTA parsing and sanitising', () => {
    expect(P.halfLife('MKW', 'mammal')).toBe('30 h');
    expect(P.parseFasta('>a\nAC\nDE\n>b\nGG')).toEqual([{ header: 'a', seq: 'ACDE' }, { header: 'b', seq: 'GG' }]);
    expect(P.parseFasta('acgt kk')).toEqual([{ header: 'Sequence 1', seq: 'acgtkk' }]);
    const sa = P.sanitize('m k 12 x-*b');
    expect(sa.seq).toBe('MKXB');
    expect(sa.ambiguous).toEqual(['X', 'B']);
    expect(sa.removed).toMatchObject({ whitespace: 3, digits: 2, dashes: 1, stars: 1 });
  });
});
