/* Band quantification from lane samples. All intensities are in arbitrary units: signal (0..1 of the nominal range,
 * bands positive) summed over pixels. Relative only: compare within one gel, within the imager's linear range. */
import type { Band, Plane, Polarity } from './types';
import type { LaneSamples } from './profile';
import { median, mean } from './filters';

export interface BandMetrics {
  bandId: string;
  /** Sum of signal over the band region (rows × lane width). */
  raw: number;
  /** Sum of the baseline over the same region. */
  background: number;
  net: number;
  /** Pixels in the band region. */
  area: number;
  /** Fraction of band pixels whose raw value is at the top or bottom of the dynamic range. */
  saturation: number;
  /** Sub-pixel peak position along the lane if known. */
  peakY?: number;
}

export interface SaturationRange { low: number; high: number }
export const DEFAULT_SATURATION: SaturationRange = { low: 0.002, high: 0.998 };

/** Quantify every band of a lane. `baseline` is per row in signal units (see background.ts). */
export function quantifyBands(s: LaneSamples, bands: Band[], baseline: ArrayLike<number>, sat: SaturationRange = DEFAULT_SATURATION): BandMetrics[] {
  return bands.map(b => {
    const y0 = Math.max(0, Math.round(b.y0)), y1 = Math.min(s.rows, Math.round(b.y1));
    let raw = 0, bg = 0, area = 0, clipped = 0;
    for (let r = y0; r < y1; r++) {
      const base = baseline[r] ?? 0;
      for (let c = 0; c < s.cols; c++) {
        const v = s.signal[r * s.cols + c]!;
        if (Number.isNaN(v)) continue;
        raw += v; bg += base; area++;
        const rv = s.rawNearest[r * s.cols + c]!;
        if (rv >= sat.high || rv <= sat.low) clipped++;
      }
    }
    return { bandId: b.id, raw, background: bg, net: raw - bg, area, saturation: area ? clipped / area : 0, peakY: b.peakY };
  });
}

export interface LaneShare { bandId: string; percentOfLane: number }
/** Each band's net as a percentage of the lane's total net (negative nets count as 0). */
export function percentOfLane(metrics: BandMetrics[]): LaneShare[] {
  const total = metrics.reduce((t, m) => t + Math.max(0, m.net), 0);
  return metrics.map(m => ({ bandId: m.bandId, percentOfLane: total > 0 ? 100 * Math.max(0, m.net) / total : NaN }));
}

/** Ratio of a band's net to a reference net (a loading-control band, or a whole lane's total). NaN if the reference is ≤ 0. */
export function normalise(net: number, referenceNet: number): number {
  return referenceNet > 0 ? net / referenceNet : NaN;
}

/** Saturation warning threshold from the spec: more than 1 % of pixels at either end of the range. */
export const SATURATION_WARN = 0.01;

/**
 * Detect polarity from the plane: bands are the minority of pixels, so with dark bands on a light background
 * the mean is pulled below the median; with light bands on dark, above it.
 */
export function detectPolarity(plane: Plane): Polarity {
  const n = plane.width * plane.height;
  const step = Math.max(1, Math.floor(n / 20000));
  const sample: number[] = [];
  for (let i = 0; i < n; i += step) sample.push(plane.data[i]!);
  return mean(sample) < median(sample) ? 'dark' : 'light';
}
