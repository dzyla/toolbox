import { describe, it, expect } from 'vitest';
import { fitMassCalibration, formatMass, MASS_STANDARD_PRESETS } from '@/core/gel/calibration';

describe('Densitometric Mass Calibration', () => {
  const points = [
    { bandId: 'b1', netIntensity: 100, knownMass: 25 },
    { bandId: 'b2', netIntensity: 200, knownMass: 50 },
    { bandId: 'b3', netIntensity: 400, knownMass: 100 },
    { bandId: 'b4', netIntensity: 800, knownMass: 200 },
  ];

  it('fits linear model with high R2', () => {
    const cal = fitMassCalibration(points, 'linear', 'ng');
    expect(cal.r2).toBeGreaterThan(0.999);
    expect(cal.massAt(400)).toBeCloseTo(100, 1);
    expect(cal.massAt(200)).toBeCloseTo(50, 1);
    expect(cal.formula).toContain('Mass =');
    expect(cal.residuals.length).toBe(4);
  });

  it('fits linear_zero model through origin', () => {
    const cal = fitMassCalibration(points, 'linear_zero', 'ng');
    expect(cal.r2).toBeGreaterThan(0.999);
    expect(cal.coefficients.slope).toBeCloseTo(0.25, 2);
    expect(cal.massAt(0)).toBe(0);
    expect(cal.massAt(600)).toBeCloseTo(150, 1);
  });

  it('fits quadratic and power models', () => {
    const quad = fitMassCalibration(points, 'quadratic', 'ng');
    expect(quad.r2).toBeGreaterThan(0.99);
    expect(quad.massAt(400)).toBeCloseTo(100, 0);

    const pow = fitMassCalibration(points, 'power', 'ng');
    expect(pow.r2).toBeGreaterThan(0.99);
    expect(pow.massAt(400)).toBeCloseTo(100, 0);
  });

  it('formats mass with units', () => {
    expect(formatMass(1500, 'ng')).toBe('1.50 µg');
    expect(formatMass(250, 'ng')).toBe('250 ng');
    expect(formatMass(45.6, 'ng')).toBe('45.6 ng');
    expect(formatMass(0.05, 'ng')).toBe('0.050 ng');
    expect(formatMass(null)).toBe('–');
  });

  it('exports mass presets', () => {
    expect(MASS_STANDARD_PRESETS.length).toBeGreaterThanOrEqual(3);
    const lowDna = MASS_STANDARD_PRESETS.find(p => p.id === 'invitrogen-low-dna');
    expect(lowDna).toBeDefined();
    expect(lowDna!.masses).toContain(2000);
  });
});
