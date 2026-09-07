import { describe, expect, it } from 'vitest';
import {
  applyBaseline,
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
