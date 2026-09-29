import { describe, it, expect } from 'vitest';
import { matchLadder } from '@/core/gel/ladder-match';

// Bio-Rad Precision Plus sizes (kDa), unevenly spaced in log space.
const SIZES = [250, 150, 100, 75, 50, 37, 25, 20, 15, 10];
const yOf = (s: number) => 400 - 150 * Math.log10(s); // exact log-linear migration
const peaksFor = (sizes: number[]) => sizes.map(s => ({ y: yOf(s), prominence: 1 }));

describe('matchLadder', () => {
  it('pairs a complete ladder one-to-one', () => {
    const m = matchLadder(peaksFor(SIZES), SIZES)!;
    expect(m.pairs.map(p => p.size)).toEqual(SIZES);
    expect(m.residualSD).toBeLessThan(1e-9);
  });
  it('recovers when a middle band was not detected', () => {
    const detected = SIZES.filter(s => s !== 50);
    const m = matchLadder(peaksFor(detected), SIZES)!;
    expect(m.skippedSizes.map(i => SIZES[i])).toEqual([50]);
    for (const p of m.pairs) expect(yOf(p.size)).toBeCloseTo(p.y, 6);
  });
  it('skips a spurious extra peak', () => {
    const peaks = peaksFor(SIZES);
    peaks.splice(5, 0, { y: (yOf(50) + yOf(37)) / 2, prominence: 0.3 });
    const m = matchLadder(peaks, SIZES)!;
    expect(m.skippedPeaks).toEqual([5]);
    expect(m.pairs.map(p => p.size)).toEqual(SIZES);
  });
  it('keeps the most prominent peaks when there are many noise peaks', () => {
    const peaks = peaksFor(SIZES);
    for (let k = 0; k < 8; k++) peaks.push({ y: 20 + k * 45.3, prominence: 0.01 });
    peaks.sort((a, b) => a.y - b.y);
    const m = matchLadder(peaks, SIZES)!;
    expect(m.pairs.map(p => p.size)).toEqual(SIZES);
  });
  it('returns null with fewer than 3 possible pairs', () => {
    expect(matchLadder(peaksFor([250, 150]), SIZES)).toBeNull();
  });
});
