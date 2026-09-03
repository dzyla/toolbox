import { describe, it, expect } from 'vitest';
import {
  parseFittingData,
  fitLinear,
  fit4PL,
  fitMichaelisMenten,
  fitExpDecay,
} from '@/core/fitting';

describe('Curve Fitting Core Engine', () => {
  it('parses single-Y and multi-replicate tabular data with SD and SEM', () => {
    const raw = `
      # Header comment
      0.1, 10, 12, 11
      0.5, 20, 22, 21
      1.0, 30, 31, 29
    `;
    const points = parseFittingData(raw);
    expect(points.length).toBe(3);
    expect(points[0]!.x).toBe(0.1);
    expect(points[0]!.y).toBe(11); // mean of 10, 12, 11
    expect(points[0]!.yValues?.length).toBe(3);
    expect(points[0]!.sd).toBeCloseTo(1.0, 1);
    expect(points[0]!.sem).toBeCloseTo(1.0 / Math.sqrt(3), 2);
  });

  it('fits linear regression and calculates R2 and standard errors', () => {
    // y = 2.5 * x + 1.0
    const points = [
      { x: 0, y: 1.0 },
      { x: 2, y: 6.0 },
      { x: 4, y: 11.0 },
      { x: 6, y: 16.0 },
    ];
    const res = fitLinear(points);
    expect(res.r2).toBeCloseTo(1.0, 4);
    const slope = res.parameters.find(p => p.symbol === 'm')!;
    const intercept = res.parameters.find(p => p.symbol === 'b')!;
    expect(slope.value).toBeCloseTo(2.5, 3);
    expect(intercept.value).toBeCloseTo(1.0, 3);
  });

  it('fits 4-Parameter Logistic curve and estimates EC50', () => {
    // 4PL sigmoidal curve with EC50 = 10, Bottom = 0, Top = 100
    const points = [
      { x: 0.1, y: 1.0 },
      { x: 1.0, y: 9.1 },
      { x: 5.0, y: 33.3 },
      { x: 10.0, y: 50.0 }, // at EC50
      { x: 20.0, y: 66.7 },
      { x: 100.0, y: 90.9 },
      { x: 500.0, y: 98.0 },
    ];
    const res = fit4PL(points);
    expect(res.r2).toBeGreaterThan(0.98);
    const ec50 = res.parameters.find(p => p.symbol === 'EC50 / IC50')!;
    expect(ec50.value).toBeCloseTo(10, 0);
  });

  it('fits Michaelis-Menten kinetics and estimates Vmax and Km', () => {
    // Vmax = 50, Km = 20: v = 50 * s / (20 + s)
    const points = [
      { x: 5, y: 10 },
      { x: 10, y: 16.67 },
      { x: 20, y: 25 }, // at Km = 20, v = 25
      { x: 40, y: 33.33 },
      { x: 80, y: 40 },
      { x: 200, y: 45.45 },
    ];
    const res = fitMichaelisMenten(points);
    expect(res.r2).toBeGreaterThan(0.99);
    const vmax = res.parameters.find(p => p.symbol === 'Vmax')!;
    const km = res.parameters.find(p => p.symbol === 'Km')!;
    expect(vmax.value).toBeCloseTo(50, 0);
    expect(km.value).toBeCloseTo(20, 0);
  });

  it('fits exponential decay and calculates half-life', () => {
    // y = 100 * exp(-0.1 * x), half-life = ln(2)/0.1 = 6.93
    const points = [
      { x: 0, y: 100 },
      { x: 3, y: 74.08 },
      { x: 6.93, y: 50 }, // at half-life
      { x: 14, y: 24.66 },
      { x: 21, y: 12.25 },
    ];
    const res = fitExpDecay(points);
    expect(res.r2).toBeGreaterThan(0.99);
    const halfLife = res.parameters.find(p => p.symbol === 't1/2')!;
    expect(halfLife.value).toBeCloseTo(6.93, 1);
  });
});
