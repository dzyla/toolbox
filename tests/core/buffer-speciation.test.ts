import { describe, expect, it } from 'vitest';
import { getSystem } from '@/core/buffers/pka';
import {
  DAVIES_LIMIT_M, bufferIonicStrength, daviesA, daviesF, effectivePKas, fractions, meanCharge, meanProtonsRemoved,
  pKaIonicShift, solvePHForCharge,
} from '@/core/buffers/speciation';

const tris = getSystem('tris');
const citrate = getSystem('citrate');
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

  it('f(I) itself turns over and reverses sign, which is why the shift must be clamped', () => {
    expect(daviesF(0.4)).toBeGreaterThan(daviesF(DAVIES_LIMIT_M));
    expect(daviesF(2)).toBeLessThan(0);
    expect(daviesF(5)).toBeLessThan(daviesF(2));
  });

  it('saturates the shift at the Davies limit instead of reversing it above about 1.9 M', () => {
    const at = (I: number) => pKaIonicShift(1, I, 25);
    expect(at(DAVIES_LIMIT_M)).toBeCloseTo(0.13513, 5);
    expect(at(2)).toBe(at(DAVIES_LIMIT_M));
    expect(at(5)).toBe(at(DAVIES_LIMIT_M));
    // Signs stay as the acid charge dictates, never flipped by an out-of-range f(I).
    for (const I of [DAVIES_LIMIT_M, 2, 5]) {
      expect(pKaIonicShift(1, I, 25)).toBeGreaterThan(0);
      expect(pKaIonicShift(0, I, 25)).toBeLessThan(0);
      expect(pKaIonicShift(-1, I, 25)).toBeCloseTo(-0.40538, 5);
    }
    expect(() => pKaIonicShift(1, -0.1, 25)).toThrow(RangeError);
  });

  it('holds the whole effective-pKa correction at 0.5 M for a polyprotic buffer', () => {
    expect(effectivePKas(phosphate, 25, 2, true)).toEqual(effectivePKas(phosphate, 25, DAVIES_LIMIT_M, true));
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

  it('keeps the spectator ions of the weighed form: 50 mM Tris at pH = pKa is 0.05 M from Tris-HCl, 0.025 M from Tris base', () => {
    // Tris-HCl (0 protons removed) brings 1 Cl⁻ per molecule, and titrating up adds 0.5 Na⁺: 2 charges in all.
    expect(bufferIonicStrength(tris, 0.05, [0.5, 0.5], 0)).toBeCloseTo(0.05, 10);
    // Tris base is neutral and the HCl added is the only counter-ion, so it matches the minimum model.
    expect(bufferIonicStrength(tris, 0.05, [0.5, 0.5], 1)).toBeCloseTo(0.025, 10);
    expect(bufferIonicStrength(tris, 0.05, [0.5, 0.5], 1)).toBe(bufferIonicStrength(tris, 0.05, [0.5, 0.5]));
  });

  it('is unchanged when the weighed form lies between the neutral species and the target', () => {
    // 100 mM citrate fully at citrate²⁻: from citric acid the 2 Na⁺ added are the only counter-ions (0.3 M),
    // but from trisodium citrate 3 Na⁺ stay in solution and 1 Cl⁻ arrives with the HCl (0.4 M).
    expect(bufferIonicStrength(citrate, 0.1, [0, 0, 1, 0], 0)).toBeCloseTo(0.3, 10);
    expect(bufferIonicStrength(citrate, 0.1, [0, 0, 1, 0])).toBeCloseTo(0.3, 10);
    expect(bufferIonicStrength(citrate, 0.1, [0, 0, 1, 0], 3)).toBeCloseTo(0.4, 10);
    expect(bufferIonicStrength(phosphate, 0.1, [0, 0.4, 0.6, 0], 2)).toBeCloseTo(0.26, 10);
  });
});
