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
  const yCurved = (s: number) => 400 - 150 * Math.log10(s) + 25 * (Math.log10(s) - 1.6) ** 2;
  it('keeps every band of a complete but curved ladder', () => {
    const m = matchLadder(SIZES.map(s => ({ y: yCurved(s), prominence: 1 })), SIZES)!;
    expect(m.pairs.map(p => p.size)).toEqual(SIZES);
    expect(m.skippedPeaks).toEqual([]);
    expect(m.skippedSizes).toEqual([]);
  });
  it('keeps every band of a strongly curved complete ladder', () => {
    const yStrong = (s: number) => 400 - 150 * Math.log10(s) + 60 * (Math.log10(s) - 1.6) ** 2;
    const m = matchLadder(SIZES.map(s => ({ y: yStrong(s), prominence: 1 })), SIZES)!;
    expect(m.pairs.map(p => p.size)).toEqual(SIZES);
    expect(m.skippedPeaks).toEqual([]);
    expect(m.skippedSizes).toEqual([]);
  });
  it('recovers a missing middle band on a curved ladder', () => {
    const detected = SIZES.filter(s => s !== 50);
    const m = matchLadder(detected.map(s => ({ y: yCurved(s), prominence: 1 })), SIZES)!;
    expect(m.skippedSizes.map(i => SIZES[i])).toEqual([50]);
  });
});

describe('matchLadderWithPins', () => {
  const pk = (sizes: number[]) => sizes.map(s => ({ y: yOf(s), prominence: 1, id: `b${s}` }));
  it('with no pins equals matchLadder', async () => {
    const { matchLadderWithPins } = await import('@/core/gel/ladder-match');
    const r = matchLadderWithPins(pk(SIZES), [], SIZES);
    expect(r.conflict).toBe(false);
    expect(r.pairs).toEqual(matchLadder(pk(SIZES), SIZES)!.pairs);
  });
  it('a middle pin constrains both sides', async () => {
    const { matchLadderWithPins } = await import('@/core/gel/ladder-match');
    const free = pk(SIZES.filter(s => s !== 50));
    const r = matchLadderWithPins(free, [{ y: yOf(50), size: 50 }], SIZES);
    expect(r.conflict).toBe(false);
    for (const p of r.pairs) expect(p.y < yOf(50) ? p.size > 50 : p.size < 50).toBe(true);
    expect(r.pairs.map(p => p.size)).toEqual(SIZES.filter(s => s !== 50));
    expect(r.pairs.every((p, i) => p.peakIndex === i)).toBe(true);
  });
  it('a pin below every large size forces the sizes above it to be larger', async () => {
    const { matchLadderWithPins } = await import('@/core/gel/ladder-match');
    // pin 50 kDa on the band that is really 37: sizes above must all be > 50, below < 50
    const free = pk(SIZES.filter(s => s !== 37));
    const r = matchLadderWithPins(free, [{ y: yOf(37), size: 50 }], SIZES);
    for (const p of r.pairs) expect(p.y < yOf(37) ? p.size > 50 : p.size < 50).toBe(true);
  });
  it('conflicting pins are reported', async () => {
    const { matchLadderWithPins } = await import('@/core/gel/ladder-match');
    const r = matchLadderWithPins(pk(SIZES), [{ y: yOf(250), size: 20 }, { y: yOf(10), size: 100 }], SIZES);
    expect(r.conflict).toBe(true);
    expect(r.pairs).toEqual([]);
  });
  it('duplicate pinned sizes are a conflict', async () => {
    const { matchLadderWithPins } = await import('@/core/gel/ladder-match');
    expect(matchLadderWithPins([], [{ y: 10, size: 50 }, { y: 20, size: 50 }], SIZES).conflict).toBe(true);
  });
});

describe('peakProminence + trim', () => {
  it('reads prominence from the profile and clamps indices', async () => {
    const { peakProminence } = await import('@/core/gel/ladder-match');
    const prof = [0, 1, 5, 1, 0.5, 0];
    expect(peakProminence(prof, 2, 0, 4)).toBeCloseTo(4.5);
    expect(peakProminence(prof, 2, -3, 99)).toBeCloseTo(5);
    expect(peakProminence(prof, 1, 0, 4)).toBe(0.5);
    expect(peakProminence([1, 1, 1], 1, 0, 2)).toBe(0);
  });
  it('real prominences keep weak-but-real bottom bands over a strong top smear', () => {
    const peaks = SIZES.map(s => ({ y: yOf(s), prominence: s <= 20 ? 0.3 : 1 }));
    for (let k = 0; k < 3; k++) peaks.push({ y: 5 + k * 3, prominence: 0.05 }); // top smear, weaker than the real bands
    // with flat prominences the trim would be positional and drop the bottom band
    expect(matchLadder(peaks.map(p => ({ ...p, prominence: 1 })).sort((a, b) => a.y - b.y), SIZES)!.pairs.map(p => p.size)).not.toEqual(SIZES);
    peaks.sort((a, b) => a.y - b.y);
    const m = matchLadder(peaks, SIZES)!;
    expect(m.pairs.map(p => p.size)).toEqual(SIZES);
  });
});
