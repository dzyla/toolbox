import { describe, expect, it } from 'vitest';
import {
  applyBaseline,
  buildFractionBands,
  constrainViewport,
  detectPeakCandidates,
  estimateFractionAmount,
  integratePeak,
} from '@/core/chromatography';

describe('chromatography analysis', () => {
  const triangularPeak = [
    { volumeMl: 0, signalAu: 0 },
    { volumeMl: 1, signalAu: 1 },
    { volumeMl: 2, signalAu: 0 },
  ];

  it('integrates a triangular peak with the trapezoidal rule', () => {
    expect(integratePeak(triangularPeak, 0, 2).areaAuMl).toBeCloseTo(1);
  });

  it('subtracts a linear endpoint baseline without changing the raw signal', () => {
    const result = applyBaseline([
      { volumeMl: 0, signalAu: 1 },
      { volumeMl: 1, signalAu: 3 },
      { volumeMl: 2, signalAu: 3 },
    ], 'endpoint');

    expect(result.points).toEqual([
      { volumeMl: 0, signalAu: 1, baselineAu: 1, correctedSignalAu: 0 },
      { volumeMl: 1, signalAu: 3, baselineAu: 2, correctedSignalAu: 1 },
      { volumeMl: 2, signalAu: 3, baselineAu: 3, correctedSignalAu: 0 },
    ]);
    expect(applyBaseline(triangularPeak, 'none').points).toEqual([
      { volumeMl: 0, signalAu: 0, baselineAu: 0, correctedSignalAu: 0 },
      { volumeMl: 1, signalAu: 1, baselineAu: 0, correctedSignalAu: 1 },
      { volumeMl: 2, signalAu: 0, baselineAu: 0, correctedSignalAu: 0 },
    ]);
  });

  it('does not propose a peak for a flat trace', () => {
    expect(detectPeakCandidates([
      { volumeMl: 0, signalAu: 0 },
      { volumeMl: 1, signalAu: 0 },
      { volumeMl: 2, signalAu: 0 },
    ], { minimumProminenceAu: 0.1, minimumWidthMl: 0.1 })).toEqual([]);
  });

  it('uses a local rolling minimum baseline and retains negative corrected values', () => {
    const rolling = applyBaseline([
      { volumeMl: 0, signalAu: 1 },
      { volumeMl: 1, signalAu: 3 },
      { volumeMl: 2, signalAu: 2 },
      { volumeMl: 3, signalAu: 4 },
      { volumeMl: 4, signalAu: 1 },
    ], 'rolling-minimum');
    const endpoint = applyBaseline([
      { volumeMl: 0, signalAu: 1 },
      { volumeMl: 1, signalAu: 0 },
      { volumeMl: 2, signalAu: 1 },
    ], 'endpoint');

    expect(rolling.points.map(point => point.baselineAu)).toEqual([1, 1, 1, 1, 1]);
    expect(endpoint.points[1]?.correctedSignalAu).toBe(-1);
  });

  it('subtracts a manually anchored linear baseline without changing the raw signal', () => {
    const result = applyBaseline([
      { volumeMl: 0, signalAu: 1 },
      { volumeMl: 1, signalAu: 3 },
      { volumeMl: 2, signalAu: 3 },
    ], 'manual-linear', {
      start: { volumeMl: 0, signalAu: 1 },
      end: { volumeMl: 2, signalAu: 3 },
    });

    expect(result.points.map(point => point.signalAu)).toEqual([1, 3, 3]);
    expect(result.points.map(point => point.correctedSignalAu)).toEqual([0, 1, 0]);
  });

  it('creates sequential fraction bands and constrains a requested viewport to the trace extent', () => {
    expect(buildFractionBands([
      { label: 'A1', volumeMl: 7 },
      { label: 'A2', volumeMl: 8 },
    ], 9)).toEqual([
      { label: 'A1', startVolumeMl: 7, endVolumeMl: 8 },
      { label: 'A2', startVolumeMl: 8, endVolumeMl: 9 },
    ]);
    expect(constrainViewport(
      { startVolumeMl: -1, endVolumeMl: 12 },
      { startVolumeMl: 0, endVolumeMl: 10 },
    )).toEqual({ startVolumeMl: 0, endVolumeMl: 10 });
  });

  it('reports a candidate peak that touches the imported range boundary', () => {
    const candidates = detectPeakCandidates([
      { volumeMl: 0, signalAu: 3 },
      { volumeMl: 1, signalAu: 2 },
      { volumeMl: 2, signalAu: 1 },
      { volumeMl: 3, signalAu: 0 },
    ], { minimumProminenceAu: 1, minimumWidthMl: 1 });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      apexVolumeMl: 0,
      startVolumeMl: 0,
      endVolumeMl: 3,
      touchesStartBoundary: true,
      touchesEndBoundary: true,
    });
  });

  it('bounds separated peaks at their adjacent valleys without sharing area', () => {
    const candidates = detectPeakCandidates([
      { volumeMl: 0, signalAu: 0 },
      { volumeMl: 1, signalAu: 2 },
      { volumeMl: 2, signalAu: 1 },
      { volumeMl: 3, signalAu: 3 },
      { volumeMl: 4, signalAu: 0 },
    ], { minimumProminenceAu: 1, minimumWidthMl: 1 });

    expect(candidates).toHaveLength(2);
    expect(candidates).toMatchObject([
      { apexVolumeMl: 1, startVolumeMl: 0, endVolumeMl: 2, areaAuMl: 2.5 },
      { apexVolumeMl: 3, startVolumeMl: 2, endVolumeMl: 4, areaAuMl: 3.5 },
    ]);
  });

  it('estimates fraction mass from Beer-Lambert concentration and molecular weight', () => {
    const result = estimateFractionAmount({
      a280: 0.5,
      epsilonMolar: 50000,
      molecularWeightGPerMol: 1000,
      pathCm: 1,
      fractionVolumeMl: 2,
    });

    expect(result.amountMg).toBeCloseTo(0.02);
    expect(result.status).toBe('derived');
  });

  it.each([
    [{ epsilonMolar: 50000, molecularWeightGPerMol: 1000, pathCm: 1, fractionVolumeMl: 2 }, 'a280'],
    [{ a280: 0.5, molecularWeightGPerMol: 1000, pathCm: 1, fractionVolumeMl: 2 }, 'epsilonMolar'],
    [{ a280: 0.5, epsilonMolar: 50000, pathCm: 1, fractionVolumeMl: 2 }, 'molecularWeightGPerMol'],
    [{ a280: 0.5, epsilonMolar: 50000, molecularWeightGPerMol: 1000, fractionVolumeMl: 2 }, 'pathCm'],
    [{ a280: 0.5, epsilonMolar: 50000, molecularWeightGPerMol: 1000, pathCm: 1 }, 'fractionVolumeMl'],
    [{ a280: 0.5, epsilonMolar: 0, molecularWeightGPerMol: 1000, pathCm: 1, fractionVolumeMl: 2 }, 'epsilonMolar'],
  ] as const)('blocks fraction mass when %s is absent or invalid', (input, blocker) => {
    const result = estimateFractionAmount(input);

    expect(result).toMatchObject({ status: 'blocked', amountMg: undefined });
    expect(result.blockers).toContain(blocker);
  });
});
