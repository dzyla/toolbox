import { describe, it, expect } from 'vitest';
import { massForSolution, molarityFromMass, volumeForMass, solveDilution, InputError } from '@/core/reactions/molarity';

describe('molarity', () => {
  it('mass for 10 mM NaCl in 500 mL = 292.2 mg', () => {
    expect(massForSolution(0.01, 0.5, 58.44)).toBeCloseTo(0.2922, 4);
  });
  it('round trips', () => {
    const m = massForSolution(0.25, 0.02, 121.14);
    expect(molarityFromMass(m, 0.02, 121.14)).toBeCloseTo(0.25, 10);
    expect(volumeForMass(m, 0.25, 121.14)).toBeCloseTo(0.02, 10);
  });
  it('dilution solves each unknown', () => {
    const near = (r: Record<string, number | string>, k: string, v: number) => expect(r[k] as number).toBeCloseTo(v, 12);
    let r = solveDilution({ c1: 1, c2: 0.1, v2: 0.01 }); near(r, 'v1', 0.001); near(r, 'diluent', 0.009); expect(r.solved).toBe('v1');
    r = solveDilution({ c1: 1, v1: 0.001, v2: 0.01 }); near(r, 'c2', 0.1); expect(r.solved).toBe('c2');
    r = solveDilution({ v1: 0.001, c2: 0.1, v2: 0.01 }); near(r, 'c1', 1); expect(r.solved).toBe('c1');
    r = solveDilution({ c1: 1, v1: 0.001, c2: 0.1 }); near(r, 'v2', 0.01); expect(r.solved).toBe('v2');
  });
  it('rejects impossible input', () => {
    expect(() => solveDilution({ c1: 1, c2: 0.1 })).toThrow(InputError);
    expect(() => solveDilution({ c1: 0.1, c2: 1, v2: 0.01 })).toThrow(/concentrate/);
    expect(() => solveDilution({ c1: -1, c2: 0.1, v2: 0.01 })).toThrow(InputError);
  });
});
