import { describe, expect, it } from 'vitest';
import { dsDnaMolecularWeight, ligationInsertNg, nebuilderAmounts } from '@/core/cloning/amounts';

describe('cloning amounts', () => {
  it('uses the NEBioCalculator dsDNA molecular weight', () => {
    expect(dsDnaMolecularWeight(1000)).toBeCloseTo(615976.04, 6);
  });

  it('reproduces NEBioCalculator ligation insert masses (754 bp into 2686 bp, 50 ng vector)', () => {
    const masses = [1, 2, 3, 5, 7].map(ratio => Number(ligationInsertNg(50, 2686, 754, ratio).toPrecision(4)));
    expect(masses).toEqual([14.04, 28.07, 42.11, 70.18, 98.25]);
  });

  it('reproduces the NEBuilder Protocol Calculator two-fragment reaction', () => {
    const plan = nebuilderAmounts([
      { name: 'pUC19', bp: 2686, ngPerUl: 50, isVector: true },
      { name: 'insert', bp: 754, ngPerUl: 20, isVector: false },
    ]);
    expect(plan.fragments.map(fragment => [fragment.volumeUl.toFixed(1), fragment.pmol.toFixed(3)])).toEqual([['1.7', '0.050'], ['2.3', '0.100']]);
    expect(plan.waterUl.toFixed(1)).toBe('6.0');
    expect(plan.masterMixUl).toBe(10);
    expect(plan.totalPmol.toFixed(3)).toBe('0.150');
    expect(plan.incubationMinutes).toBe(15);
    expect(plan.transformUl).toBe(2);
  });

  it('uses 1:2 for three fragments, 5-fold for short fragments and 0.05 pmol each for four or more', () => {
    const three = nebuilderAmounts([
      { name: 'v', bp: 3000, ngPerUl: 100, isVector: true },
      { name: 'a', bp: 800, ngPerUl: 50, isVector: false },
      { name: 'b', bp: 900, ngPerUl: 50, isVector: false },
    ]);
    expect(three.fragments.map(fragment => fragment.pmol.toFixed(3))).toEqual(['0.025', '0.050', '0.050']);

    const short = nebuilderAmounts([
      { name: 'v', bp: 3000, ngPerUl: 100, isVector: true },
      { name: 'oligo', bp: 150, ngPerUl: 20, isVector: false },
    ]);
    expect(short.fragments[1]!.pmol / short.fragments[0]!.pmol).toBeCloseTo(5, 10);

    const four = nebuilderAmounts(['a', 'b', 'c', 'd'].map(name => ({ name, bp: 1000, ngPerUl: 50, isVector: name === 'a' })));
    expect(four.fragments.every(fragment => fragment.pmol === 0.05)).toBe(true);
    expect(four.incubationMinutes).toBe(60);
  });

  it('warns about dilute-needed stocks and doubles the reaction when the DNA exceeds 10 µL', () => {
    const dilute = nebuilderAmounts([
      { name: 'v', bp: 3000, ngPerUl: 5000, isVector: true },
      { name: 'i', bp: 1000, ngPerUl: 5000, isVector: false },
    ]);
    expect(dilute.notes.some(note => note.startsWith('Dilute'))).toBe(true);

    const big = nebuilderAmounts([
      { name: 'v', bp: 5000, ngPerUl: 10, isVector: true },
      { name: 'i', bp: 2000, ngPerUl: 10, isVector: false },
    ]);
    expect(big.totalVolumeUl).toBeGreaterThan(20);
    expect(big.waterUl).toBe(0);
  });
});
