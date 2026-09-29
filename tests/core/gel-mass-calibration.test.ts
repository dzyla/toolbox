import { describe, it, expect } from 'vitest';
import { fitMassCalibration, formatMass, massFlags, MASS_STANDARD_PRESETS } from '@/core/gel/calibration';

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

describe('mass calibration limits', () => {
  const pts = [[102, 10], [198, 20], [402, 40], [798, 80]].map(([net, mass], i) => ({ bandId: `b${i}`, netIntensity: net!, knownMass: mass! }));
  it('reports residual SD, LOD and LOQ (ICH Q2) for a linear fit', () => {
    const cal = fitMassCalibration(pts, 'linear');
    expect(cal.residualSD!).toBeCloseTo(0.25109, 4);
    expect(cal.lod!).toBeCloseTo(0.82858, 4);
    expect(cal.loq!).toBeCloseTo(2.51085, 4);
    expect(cal.range).toEqual({ minMass: 10, maxMass: 80, minNet: 102, maxNet: 798 });
  });
  it('has no LOD/LOQ with fewer than 3 points', () => {
    const cal = fitMassCalibration(pts.slice(0, 2), 'linear');
    expect(cal.lod).toBeNull();
    expect(cal.loq).toBeNull();
  });
  it('flags extrapolation and values below LOQ', () => {
    const cal = fitMassCalibration(pts, 'linear');
    expect(massFlags(cal, 900, cal.massAt(900))).toEqual({ extrapolated: true, belowLoq: false });
    expect(massFlags(cal, 300, cal.massAt(300))).toEqual({ extrapolated: false, belowLoq: false });
    expect(massFlags(cal, 20, 1.9)).toEqual({ extrapolated: true, belowLoq: true });
  });
});
