/* Band quantification from lane samples. All intensities are in arbitrary units: signal (0..1 of the nominal range,
 * bands positive) summed over pixels. Relative only: compare within one gel, within the imager's linear range. */
import type { Band, Plane, Polarity } from './types';
import type { LaneSamples } from './profile';
import { median } from './filters';

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
  /** Start row of band in lane coordinates. */
  y0?: number;
  /** End row of band in lane coordinates. */
  y1?: number;
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
    return { bandId: b.id, raw, background: bg, net: raw - bg, area, saturation: area ? clipped / area : 0, peakY: b.peakY, y0: b.y0, y1: b.y1 };
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
 * Detect polarity from the plane using the scanner background plate.
 *
 * The outer border ring of the image is the unexposed background of the gel tray/plate (no lanes
 * or bands reach the very edge). If that background is bright, the bands are the DARK feature
 * ('dark' polarity — typical bright-field/fluorescence gels on a white or black background where the
 * sample is darker than the plate); if it is dark, the bands are the light feature ('light').
 *
 * The previous heuristic (mean < median) was wrong for real gels: the gel matrix plus bands make up
 * most of the frame, so the global mean and median sit inside the matrix and the test was effectively
 * "is the matrix darker than the plate" — which misclassifies a dark-band gel whose background plate
 * is bright. The border is the only part that reliably reflects the true background level.
 */
export function detectPolarity(plane: Plane): Polarity {
  const w = plane.width, h = plane.height;
  if (w < 8 || h < 8) return 'dark';
  const rt = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const ring: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < rt || x >= w - rt || y < rt || y >= h - rt) {
        const v = plane.data[y * w + x]!;
        if (!Number.isNaN(v)) ring.push(v);
      }
    }
  }
  const bg = median(ring);
  return bg >= 0.5 ? 'dark' : 'light';
}
