import { describe, it, expect } from 'vitest';
import { fitCalibration, assignLadder, formatSize } from '@/core/gel/calibration';

describe('gel molecular weight calibration', () => {
  const points = [
    { y: 50, size: 100 },
    { y: 100, size: 50 },
    { y: 150, size: 25 },
    { y: 200, size: 12.5 },
  ];

  it('fits log-linear model and calculates size at position', () => {
    const cal = fitCalibration(points, 'linear');
    expect(cal.r2).toBeCloseTo(1.0, 4);
    expect(cal.sizeAt(50)).toBeCloseTo(100, 2);
    expect(cal.sizeAt(125)).toBeCloseTo(35.35, 1);
    expect(cal.yAt(50)).toBeCloseTo(100, 2);
  });

  it('interpolates with piecewise linear model', () => {
    const cal = fitCalibration(points, 'piecewise');
    expect(cal.sizeAt(50)).toBeCloseTo(100, 2);
    expect(cal.sizeAt(100)).toBeCloseTo(50, 2);
    expect(cal.sizeAt(75)).toBeCloseTo(Math.pow(10, (Math.log10(100) + Math.log10(50)) / 2), 2);
  });

  it('interpolates with natural cubic spline model', () => {
    const cal = fitCalibration(points, 'spline');
    expect(cal.sizeAt(50)).toBeCloseTo(100, 1);
    expect(cal.sizeAt(100)).toBeCloseTo(50, 1);
    expect(cal.sizeAt(150)).toBeCloseTo(25, 1);
    expect(cal.sizeAt(200)).toBeCloseTo(12.5, 1);
  });

  it('assigns ladder sizes and formats sizes', () => {
    const peaks = [
      { y: 10, prominence: 1 },
      { y: 30, prominence: 2 },
      { y: 50, prominence: 0.5 },
    ];
    const assigned = assignLadder(peaks, [100, 50, 25]);
    expect(assigned.length).toBe(3);
    expect(assigned[0]!.size).toBe(100);
    expect(assigned[1]!.size).toBe(50);
    expect(assigned[2]!.size).toBe(25);

    expect(formatSize(150, 'protein')).toBe('150 kDa');
    expect(formatSize(1500, 'dna')).toBe('1.50 kb');
  });
});
