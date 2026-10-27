import { describe, expect, it } from 'vitest';
import { bFactorStats, detectPlddt, parseMmcif, parsePdbToModel, parseStructure } from '@/core/structure';
import { read } from './structure-helpers';

/** ATOM lines for a two-residue chain with the given per-atom B-factors (no header records). */
function pdb(bs: number[], extra = ''): string {
  const lines = bs.map((b, i) => {
    const res = i < bs.length / 2 ? 1 : 2;
    const name = i % 2 === 0 ? ' N  ' : ' CA ';
    return `ATOM  ${String(i + 1).padStart(5)} ${name} ALA A${String(res).padStart(4)}    `
      + `${(i * 1.5).toFixed(3).padStart(8)}${'0.000'.padStart(8)}${'0.000'.padStart(8)}  1.00${b.toFixed(2).padStart(6)}           ${name.trim()[0]}`;
  });
  return `${extra}${lines.join('\n')}\nEND\n`;
}

describe('bFactorStats', () => {
  it('1UBQ: range over non-water atoms, with 2nd/98th percentile ends inside it', () => {
    const m = parseMmcif(read('1UBQ.cif'), '1UBQ');
    const s = bFactorStats(m, 0)!;
    expect(s.min).toBeCloseTo(2, 0);
    expect(s.max).toBeGreaterThan(s.high);
    expect(s.low).toBeGreaterThanOrEqual(s.min);
    expect(s.high).toBeGreaterThan(s.low);
  });

  it('is null when every B-factor is the same, or the model has no atoms', () => {
    expect(bFactorStats(parsePdbToModel(pdb([0, 0, 0, 0]), 'flat'), 0)).toBeNull();
    expect(bFactorStats(parsePdbToModel(pdb([50, 60, 70, 80]), 'x'), 3)).toBeNull();
  });
});

describe('detectPlddt', () => {
  const detect = (text: string, name = 'model') => {
    const m = parseStructure(text, name);
    return detectPlddt(m, bFactorStats(m, 0));
  };

  it('experimental entries are not predicted (mmCIF method, PDB EXPDTA, waters)', () => {
    expect(detect(read('1UBQ.cif'), '1UBQ.cif')).toBeNull();
    expect(detect(read('1UBQ.pdb'), '1UBQ.pdb')).toBeNull();
    // No method recorded, but waters: an experimental file with its header stripped.
    const water = 'HETATM  999  O   HOH W   1      10.000  10.000  10.000  1.00 30.00           O\n';
    expect(detect(pdb([50, 60, 70, 80]).replace('END\n', `${water}END\n`), 'stripped.pdb')).toBeNull();
  });

  it('a bare model file (no method, no water, 0–100) is read as pLDDT on 0–100', () => {
    expect(detect(pdb([91.2, 88.5, 45.1, 30.0]), 'colabfold.pdb')).toEqual({ scale: 1, reason: expect.stringContaining('no experimental method') });
    expect(detect(read('minimal.cif'), 'minimal.cif')?.scale).toBe(1);
  });

  it('values within 0–1 (ESMFold) are pLDDT / 100', () => {
    expect(detect(pdb([0.91, 0.88, 0.45, 0.3]), 'esmfold.pdb')?.scale).toBe(100);
  });

  it('ModelCIF categories, a computational method or a predictor in the title count even with waters', () => {
    const modelCif = read('minimal.cif').replace('data_MINIMAL\n', 'data_MINIMAL\n_ma_qa_metric.id 1\n_ma_qa_metric.name pLDDT\n');
    expect(parseMmcif(modelCif, 'm').header.modelCif).toBe(true);
    expect(detect(modelCif, 'model.cif')?.reason).toBe('ModelCIF file');
    expect(detect(pdb([70, 80, 90, 95], 'EXPDTA    THEORETICAL MODEL\n'), 't.pdb')?.reason).toBe('method: THEORETICAL MODEL');
    const water = 'HETATM  999  O   HOH W   1      10.000  10.000  10.000  1.00 30.00           O\n';
    expect(detect(pdb([70, 80, 90, 95], 'TITLE     ALPHAFOLD MONOMER V2.0 PREDICTION\n').replace('END\n', `${water}END\n`), 'af.pdb')?.reason)
      .toBe('predictor named in the title');
  });

  it('B-factors outside 0–100 are never pLDDT', () => {
    expect(detect(pdb([20, 150, 30, 40]), 'md.pdb')).toBeNull();
    expect(detect(pdb([-5, 10, 20, 30]), 'neg.pdb')).toBeNull();
  });
});
