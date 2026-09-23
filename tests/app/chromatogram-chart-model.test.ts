import { describe, expect, it } from 'vitest';
import {
  buildFractionAnnotations,
  buildPeakOverlays,
  decimateTraceForViewport,
  getDisplayExtent,
} from '@/tools/sec/chromatogram-chart-model';

describe('chromatogram chart model', () => {
  it('uses injection-relative values only for the displayed extent', () => {
    expect(getDisplayExtent([
      { volumeMl: 3, signalAu: 0 },
      { volumeMl: 5, signalAu: 1 },
    ], 3)).toEqual({ startVolumeMl: 0, endVolumeMl: 2 });
  });

  it('limits dense fraction labels but retains selected labels', () => {
    const annotations = buildFractionAnnotations({
      events: Array.from({ length: 80 }, (_, index) => ({
        label: `F${index + 1}`,
        volumeMl: index,
      })),
      endInstrumentVolumeMl: 80,
      displayOffsetMl: 0,
      viewport: { startVolumeMl: 0, endVolumeMl: 80 },
      widthPx: 640,
      selectedLabels: ['F43'],
      visible: true,
    });

    expect(annotations.bands).toHaveLength(80);
    expect(annotations.labels.length).toBeLessThan(25);
    expect(annotations.labels.map(label => label.text)).toContain('F1');
    expect(annotations.labels.map(label => label.text)).toContain('F43');
    expect(annotations.labels.map(label => label.text)).toContain('F80');
  });

  it('bounds rendered fraction bands for very dense collection records', () => {
    const annotations = buildFractionAnnotations({
      events: Array.from({ length: 2_000 }, (_, index) => ({
        label: `F${index + 1}`,
        volumeMl: index,
      })),
      endInstrumentVolumeMl: 2_000,
      displayOffsetMl: 0,
      viewport: { startVolumeMl: 0, endVolumeMl: 2_000 },
      widthPx: 1_000,
      selectedLabels: ['F1337'],
      visible: true,
    });

    expect(annotations.bands.length).toBeLessThanOrEqual(500);
    expect(annotations.bands.map(band => band.label)).toContain('F1337');
  });

  it('builds each accepted-peak fill from only its local trace segment', () => {
    const overlays = buildPeakOverlays({
      correctedUv: [0, 1, 2, 3, 4].map(volumeMl => ({
        volumeMl,
        signalAu: volumeMl === 1 || volumeMl === 3 ? 1 : 0,
      })),
      baseline: {
        mode: 'none',
        points: [0, 1, 2, 3, 4].map(volumeMl => ({
          volumeMl,
          signalAu: 0,
          baselineAu: 0,
          correctedSignalAu: 0,
        })),
      },
      acceptedPeaks: [
        { id: 'one', source: 'manual', startVolumeMl: 0, endVolumeMl: 2 },
        { id: 'two', source: 'manual', startVolumeMl: 2, endVolumeMl: 4 },
      ],
      displayOffsetMl: 0,
      selectedPeakId: 'two',
    });

    expect(overlays).toHaveLength(2);
    expect(overlays[0]?.x).toEqual([0, 1, 2]);
    expect(overlays[1]?.x).toEqual([2, 3, 4]);
    expect(overlays[0]?.selected).toBe(false);
    expect(overlays[1]?.selected).toBe(true);
  });

  it('assigns every accepted peak a distinct integration color', () => {
    const overlays = buildPeakOverlays({
      correctedUv: Array.from({ length: 13 }, (_, volumeMl) => ({ volumeMl, signalAu: 1 })),
      baseline: { mode: 'none', points: Array.from({ length: 13 }, (_, volumeMl) => ({ volumeMl, signalAu: 0, baselineAu: 0, correctedSignalAu: 0 })) },
      acceptedPeaks: Array.from({ length: 6 }, (_, index) => ({ id: `peak-${index}`, source: 'manual' as const, startVolumeMl: index * 2, endVolumeMl: index * 2 + 2 })),
      displayOffsetMl: 0,
      selectedPeakId: null,
    });

    expect(new Set(overlays.map(overlay => overlay.color)).size).toBe(6);
  });

  it('preserves viewport boundaries and local extrema while bounding a 30k trace', () => {
    const x = Array.from({ length: 30_000 }, (_, index) => index / 100);
    const y = x.map((_, index) => index === 15_123 ? 999 : Math.sin(index / 60));

    const result = decimateTraceForViewport({
      x,
      y,
      viewport: { startVolumeMl: 0, endVolumeMl: 300 },
      widthPx: 600,
    });

    expect(result.x[0]).toBe(0);
    expect(result.x.at(-1)).toBe(299.99);
    expect(result.x.length).toBeLessThanOrEqual(1_204);
    expect(result.y).toContain(999);
  });

  it('interpolates viewport boundaries before decimating', () => {
    expect(decimateTraceForViewport({
      x: [0, 2, 4], y: [0, 20, 40],
      viewport: { startVolumeMl: 1, endVolumeMl: 3 }, widthPx: 10,
    })).toEqual({ x: [1, 2, 3], y: [10, 20, 30] });
  });
});
