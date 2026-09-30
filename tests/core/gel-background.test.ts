import { describe, it, expect } from 'vitest';
import { rollingBaseline, sharedCrossLaneBaseline, baselineFor, bandHalfMaxWidth, bandWiderThanBall } from '@/core/gel/background';

const N = 300;
const bg = (i: number) => 0.1 + 0.0005 * i;                       // sloping background
const band = (i: number, c: number, s: number, a: number) => a * Math.exp(-((i - c) ** 2) / (2 * s * s));

describe('rolling ball baseline', () => {
  it('follows a sloping background under a narrow band', () => {
    const prof = Float32Array.from({ length: N }, (_, i) => bg(i) + band(i, 150, 4, 0.5));
    const base = rollingBaseline(prof, 30);
    expect(Math.abs(base[150]! - bg(150))).toBeLessThan(0.02);
    for (let i = 0; i < N; i++) expect(base[i]!).toBeLessThanOrEqual(prof[i]! + 1e-6);
  });
  it('returns a constant profile unchanged', () => {
    const base = rollingBaseline(new Float32Array(100).fill(0.3), 20);
    for (const v of base) expect(v).toBeCloseTo(0.3, 6);
  });
});

describe('shared cross-lane baseline', () => {
  it('handles lanes of unequal length without NaN', () => {
    const a = Float32Array.from({ length: 200 }, (_, i) => bg(i));
    const b = Float32Array.from({ length: 150 }, (_, i) => bg(i));
    const shared = sharedCrossLaneBaseline([b, a], 20);
    expect(shared.length).toBe(200);
    for (const v of shared) expect(Number.isFinite(v)).toBe(true);
    expect(baselineFor('shared', b, { sharedBaseline: shared }).length).toBe(150);
  });
});

describe('bandHalfMaxWidth', () => {
  it('measures a Gaussian band as its FWHM (2.355 sigma), independent of the band region it sits in', () => {
    const prof = Float32Array.from({ length: N }, (_, i) => bg(i) + band(i, 150, 8, 0.5));
    // A lone band's valley-to-valley region can span most of the lane; the width must not depend on it.
    expect(bandHalfMaxWidth(prof, { y0: 10, y1: 290, peakY: 150 })).toBeCloseTo(2.355 * 8, 0);
    expect(bandHalfMaxWidth(prof, { y0: 120, y1: 180, peakY: 150 })).toBeCloseTo(2.355 * 8, 0);
  });
  it('is 0 for a flat region', () => {
    expect(bandHalfMaxWidth(new Float32Array(50).fill(0.2), { y0: 5, y1: 45, peakY: 25 })).toBe(0);
  });
});

describe('bandWiderThanBall', () => {
  const lone = (sigma: number) => Float32Array.from({ length: N }, (_, i) => bg(i) + band(i, 150, sigma, 0.5));
  it('does not flag a narrow isolated band even when its valley-to-valley region is wide', () => {
    // FWHM ≈ 12 px, band region 280 px, radius 40 (warn above 20 px FWHM).
    expect(bandWiderThanBall('rolling', lone(5), { y0: 10, y1: 290, peakY: 150 }, 40)).toBe(false);
  });
  it('flags a band whose own width lets the ball eat into it', () => {
    // FWHM ≈ 59 px > 0.5 × 40.
    expect(bandWiderThanBall('rolling', lone(25), { y0: 10, y1: 290, peakY: 150 }, 40)).toBe(true);
    expect(bandWiderThanBall('shared', lone(25), { y0: 10, y1: 290, peakY: 150 }, 40)).toBe(true);
  });
  it('measures wide faint bands on a slope (apex off the detected peak)', () => {
    const faint = Float32Array.from({ length: 600 }, (_, i) => 0.1 + 0.0005 * i + band(i, 300, 16, 0.2));
    expect(bandHalfMaxWidth(faint, { y0: 0, y1: 600, peakY: 300 })).toBeCloseTo(2.355 * 16, -1);
  });
  it('only applies to the opening-based baselines', () => {
    expect(bandWiderThanBall('valley', lone(25), { y0: 10, y1: 290, peakY: 150 }, 40)).toBe(false);
    expect(bandWiderThanBall('none', lone(25), { y0: 10, y1: 290, peakY: 150 }, 40)).toBe(false);
  });
  it('agrees with what the rolling ball actually does: flagged bands lose signal, unflagged ones keep it', () => {
    // Bands clearly on either side of the threshold (FWHM 7–12 px vs 38–59 px at radius 40).
    for (const sigma of [3, 5, 16, 25]) {
      const prof = lone(sigma);
      const base = rollingBaseline(prof, 40);
      let truth = 0, net = 0;
      for (let i = 0; i < N; i++) { truth += band(i, 150, sigma, 0.5); net += Math.max(0, prof[i]! - base[i]!); }
      const lost = 1 - net / truth;
      const flagged = bandWiderThanBall('rolling', prof, { y0: 0, y1: N, peakY: 150 }, 40);
      if (flagged) expect(lost).toBeGreaterThan(0.1); else expect(lost).toBeLessThan(0.1);
    }
  });
});
