import { describe, expect, it } from 'vitest';
import { CentrifugeError, kFactor, rcf, rpm, runTime } from '@/core/centrifuge';

describe('centrifuge calculations', () => {
  it('uses the RCF constant for a radius in millimetres', () => {
    expect(rcf(10_000, 100)).toBeCloseTo(11_180, 10);
  });

  it('round trips RPM through RCF', () => {
    expect(rpm(rcf(36_000, 72), 72)).toBeCloseTo(36_000, 10);
  });

  it('matches the Beckman rotor k-factor example and pelleting time equation', () => {
    const k = kFactor(50_000, 91.9, 35.9);
    expect(k).toBeCloseTo(95, 0);
    expect(runTime(k, 100)).toBeCloseTo(k / 100, 12);
  });

  it('rejects non-positive values and reversed rotor radii', () => {
    expect(() => rcf(0, 100)).toThrow(CentrifugeError);
    expect(() => kFactor(50_000, 35.9, 91.9)).toThrow(/greater/i);
    expect(() => runTime(10, 0)).toThrow(CentrifugeError);
  });
});
