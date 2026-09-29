import { describe, it, expect } from 'vitest';
import { fitCalibration, formatSize } from '@/core/gel/calibration';

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

  it('interpolates with the monotone cubic model', () => {
    const cal = fitCalibration(points, 'monotone');
    for (const q of points) expect(cal.sizeAt(q.y)).toBeCloseTo(q.size, 6);
  });

  it('monotone cubic never overshoots between unevenly spaced bands', () => {
    // A natural spline overshoots here: a tight pair of bands next to a long gap.
    const pts = [{ y: 0, size: 100 }, { y: 10, size: 79.4 }, { y: 12, size: 15.8 }, { y: 100, size: 10 }];
    const cal = fitCalibration(pts, 'monotone');
    let prev = Infinity;
    for (let y = 0; y <= 100; y += 0.25) {
      const s = cal.sizeAt(y);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const mid = cal.sizeAt((pts[i]!.y + pts[i + 1]!.y) / 2);
      expect(mid).toBeLessThanOrEqual(pts[i]!.size);
      expect(mid).toBeGreaterThanOrEqual(pts[i + 1]!.size);
    }
    expect(cal.yAt(cal.sizeAt(50))).toBeCloseTo(50, 3);
  });

  it('formats sizes', () => {
    expect(formatSize(150, 'protein')).toBe('150 kDa');
    expect(formatSize(1500, 'dna')).toBe('1.50 kb');
  });
});
