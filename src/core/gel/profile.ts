/* Lane sampling and profiles. A lane is sampled along its own axis (so tilted lanes and rotated images are exact),
 * one sample per pixel along and across the lane, using bilinear interpolation of the raw plane. */
import type { Affine, Lane, Plane, Polarity } from './types';
import { IDENTITY, apply, sampleBilinear, sampleNearest } from './transform';
import { findPeaks, type Peak, type PeakOptions } from './filters';

export interface LaneSamples {
  rows: number; cols: number;
  /** Row-major signal samples (polarity applied: bands are positive), NaN outside the image. */
  signal: Float32Array;
  /** Raw (display-independent) intensity at the nearest pixel, for saturation checks. */
  rawNearest: Float32Array;
}

/** Signal value for a raw intensity: dark bands are flipped so that bands are always positive peaks. */
export const toSignal = (v: number, polarity: Polarity) => polarity === 'dark' ? 1 - v : v;

/**
 * Sample a lane from the plane. `toRaw` maps working-frame coordinates to raw pixel coordinates (identity when the image
 * is untransformed). Each row r (0..rows-1) is at distance r along the centre line from (x, y0).
 */
export function sampleLane(plane: Plane, lane: Lane, polarity: Polarity, toRaw: Affine = IDENTITY): LaneSamples {
  const rows = Math.max(1, Math.round(lane.y1 - lane.y0));
  const cols = Math.max(1, Math.round(lane.width));
  const signal = new Float32Array(rows * cols), rawNearest = new Float32Array(rows * cols);
  const len = Math.hypot(lane.tilt, lane.y1 - lane.y0) || 1;
  const ax = lane.tilt / len, ay = (lane.y1 - lane.y0) / len; // unit vector along the lane
  const px = ay, py = -ax; // unit vector across the lane
  for (let r = 0; r < rows; r++) {
    const cx = lane.x + ax * (r + 0.5), cy = lane.y0 + ay * (r + 0.5);
    for (let c = 0; c < cols; c++) {
      const off = c - (cols - 1) / 2;
      const wx = cx + px * off, wy = cy + py * off;
      const [rx, ry] = apply(toRaw, wx, wy);
      const v = sampleBilinear(plane, rx - 0.5, ry - 0.5);
      signal[r * cols + c] = Number.isNaN(v) ? NaN : toSignal(v, polarity);
      rawNearest[r * cols + c] = sampleNearest(plane, rx - 0.5, ry - 0.5);
    }
  }
  return { rows, cols, signal, rawNearest };
}

/** Mean signal across the lane per row (the densitometric profile). Rows fully outside the image are NaN. */
export function laneProfile(s: LaneSamples): Float32Array {
  const out = new Float32Array(s.rows);
  for (let r = 0; r < s.rows; r++) {
    let sum = 0, k = 0;
    for (let c = 0; c < s.cols; c++) { const v = s.signal[r * s.cols + c]!; if (!Number.isNaN(v)) { sum += v; k++; } }
    out[r] = k ? sum / k : NaN;
  }
  return out;
}

export interface BandPeak extends Peak { y0: number; y1: number }

/** Detect bands in a profile. Default sensitivity: prominence ≥ 5 % of the strongest band, width ≥ 2 px, σ = 1 px smoothing. */
export function detectBands(profile: ArrayLike<number>, opts: PeakOptions = {}): BandPeak[] {
  const clean = Float32Array.from(profile, v => Number.isNaN(v) ? 0 : v);
  const o: PeakOptions = { minProminence: 0.05, relative: true, minWidth: 2, smoothing: 1, ...opts };
  return findPeaks(clean, o).map(p => ({ ...p, y0: p.valleyLeft ?? p.left, y1: (p.valleyRight ?? p.right) + 1 }));
}
