import { describe, expect, it } from 'vitest';
import { getSystem } from '@/core/buffers/pka';
import {
  bufferIonicStrength, daviesA, daviesF, effectivePKas, fractions, meanCharge, meanProtonsRemoved, pKaIonicShift, solvePHForCharge,
} from '@/core/buffers/speciation';

const tris = getSystem('tris');
const phosphate = getSystem('phosphate');

describe('Davies activity model', () => {
  it('reproduces A and f(I) at 25 °C and 0.15 M', () => {
    expect(daviesA(25)).toBeCloseTo(0.5114, 4);
    expect(daviesF(0.15)).toBeCloseTo(0.2342, 4);
    expect(daviesF(0)).toBe(0);
  });

  it('rejects negative ionic strength', () => {
    expect(() => daviesF(-0.1)).toThrow(RangeError);
  });

  it('shifts pKa by (2z − 1)·A·f(I): cationic acids up, neutral acids down, anionic acids down more', () => {
    expect(pKaIonicShift(1, 0.15, 25)).toBeCloseTo(0.1198, 3);
    expect(pKaIonicShift(0, 0.15, 25)).toBeCloseTo(-0.1198, 3);
    expect(pKaIonicShift(-1, 0.15, 25)).toBeCloseTo(-0.3593, 3);
  });
});

describe('effective pKa', () => {
  it('applies the linear temperature coefficient (Tris 8.06 → 8.648 at 4 °C)', () => {
    expect(effectivePKas(tris, 4, 0, false)[0]).toBeCloseTo(8.648, 10);
  });

  it('adds the ionic correction per step using each step\'s acid charge (phosphate at 0.15 M)', () => {
    const [p1, p2, p3] = effectivePKas(phosphate, 25, 0.15, true);
    expect(p1).toBeCloseTo(2.15 - 0.1198, 3);
    expect(p2).toBeCloseTo(7.2 - 0.3593, 3);
    expect(p3).toBeCloseTo(12.35 - 0.5988, 3);
  });
});

describe('species fractions and charge', () => {
  it('sums to 1 and is 50:50 at pH = pKa', () => {
    expect(fractions(8.06, [8.06])).toEqual([0.5, 0.5]);
    const fr = fractions(5, [2.15, 7.2, 12.35]);
    expect(fr.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('puts phosphate at pH 7.4 at 61.3 % HPO4²⁻ (2 protons removed)', () => {
    const fr = fractions(7.4, [2.15, 7.2, 12.35]);
    expect(fr[2]).toBeCloseTo(0.613, 3);
    expect(fr[1]).toBeCloseTo(0.387, 3);
  });

  it('does not overflow far from every pKa', () => {
    const fr = fractions(40, [2.15, 7.2, 12.35]);
    expect(fr[3]).toBeCloseTo(1, 12);
    expect(fractions(-30, [8.06])[0]).toBeCloseTo(1, 12);
  });

  it('computes mean protons removed and net charge', () => {
    const fr = fractions(8.0, [8.06]);
    expect(fr[1]).toBeCloseTo(0.4655, 4);
    expect(meanProtonsRemoved(fr)).toBeCloseTo(0.4655, 4);
    expect(meanCharge(tris, fr)).toBeCloseTo(1 - 0.4655, 4);
  });
});

describe('pH solver', () => {
  it('inverts charge back to pH', () => {
    const kas = effectivePKas(phosphate, 25, 0.1, true);
    const q = meanCharge(phosphate, fractions(6.9, kas));
    expect(solvePHForCharge(phosphate, q, kas)).toBeCloseTo(6.9, 8);
  });

  it('moves a fixed-composition Tris buffer from pH 8.0 at 25 °C to 8.588 at 4 °C', () => {
    const q = meanCharge(tris, fractions(8.0, effectivePKas(tris, 25, 0, false)));
    expect(solvePHForCharge(tris, q, effectivePKas(tris, 4, 0, false))).toBeCloseTo(8.588, 6);
  });

  it('throws when the charge cannot be reached', () => {
    expect(() => solvePHForCharge(tris, 5, [8.06])).toThrow(RangeError);
  });
});

describe('buffer ionic strength', () => {
  it('is 0.025 M for 50 mM Tris at pH = pKa (half Tris-H⁺ with one monovalent counter-ion)', () => {
    expect(bufferIonicStrength(tris, 0.05, [0.5, 0.5])).toBeCloseTo(0.025, 10);
  });

  it('counts divalent species: 100 mM phosphate at 60 % HPO4²⁻ / 40 % H2PO4⁻ is 0.22 M', () => {
    expect(bufferIonicStrength(phosphate, 0.1, [0, 0.4, 0.6, 0])).toBeCloseTo(0.22, 10);
  });
});
