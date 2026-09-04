/* Lane finding: vertical projection of the signal, smoothing, peaks = lane centres, valleys = boundaries. */
import type { Affine, Lane, Plane, Polarity } from './types';
import { IDENTITY, apply, sampleBilinear } from './transform';
import { findPeaks, gaussianSmooth } from './filters';
import { toSignal } from './profile';

export interface Region { x: number; y: number; w: number; h: number }

/** Mean signal per column of a working-frame region (bands positive). Columns outside the image are NaN. */
export function verticalProjection(plane: Plane, region: Region, polarity: Polarity, toRaw: Affine = IDENTITY, rowStep = 1): Float32Array {
  const w = Math.max(1, Math.round(region.w)), h = Math.max(1, Math.round(region.h));
  const out = new Float32Array(w);
  for (let c = 0; c < w; c++) {
    let sum = 0, k = 0;
    for (let r = 0; r < h; r += rowStep) {
      const [rx, ry] = apply(toRaw, region.x + c + 0.5, region.y + r + 0.5);
      const v = sampleBilinear(plane, rx - 0.5, ry - 0.5);
      if (!Number.isNaN(v)) { sum += toSignal(v, polarity); k++; }
    }
    out[c] = k ? sum / k : NaN;
  }
  return out;
}

export interface AutoLaneOptions {
  /** Gaussian sigma for the projection, px. Default: region width / 150, at least 1.5. */
  smoothing?: number;
  /** Minimum lane prominence as a fraction of the strongest lane. Default 0.15. */
  minProminence?: number;
  /** Minimum lane width, px. Default 4. */
  minWidth?: number;
  /** Shrink each detected lane to this fraction of its half-prominence width to avoid neighbours. Default 0.9. */
  widthFraction?: number;
}

let laneCounter = 0;
export const laneId = () => `lane${++laneCounter}-${Date.now().toString(36)}`;

/** Auto-detect lanes inside a region of the working frame. Returns lanes sorted left to right. */
export function autoLanes(plane: Plane, region: Region, polarity: Polarity, toRaw: Affine = IDENTITY, opts: AutoLaneOptions = {}): Lane[] {
  const proj = verticalProjection(plane, region, polarity, toRaw, region.h > 400 ? 2 : 1);
  const clean = Float32Array.from(proj, v => Number.isNaN(v) ? 0 : v);
  const sigma = opts.smoothing ?? Math.max(1.5, region.w / 150);
  const sm = gaussianSmooth(clean, sigma);
  // Prominence in findPeaks already judges each peak against its local valleys.
  const peaks = findPeaks(sm, { minProminence: opts.minProminence ?? 0.15, relative: true, minWidth: opts.minWidth ?? 4 });
  const frac = opts.widthFraction ?? 0.9;
  return peaks.map(p => {
    const width = Math.max(opts.minWidth ?? 4, Math.round(p.width * frac));
    const cx = p.halfCenter ?? (p.left + p.right) / 2;
    return { id: laneId(), x: region.x + cx + 0.5, y0: region.y, y1: region.y + region.h, width, tilt: 0 };
  });
}

/** N equally spaced lanes across a region; each lane is `widthFraction` of the pitch wide. */
export function equalLanes(n: number, region: Region, widthFraction = 0.7): Lane[] {
  if (!(n >= 1)) return [];
  const pitch = region.w / n;
  return Array.from({ length: n }, (_, i) => ({
    id: laneId(), x: region.x + pitch * (i + 0.5), y0: region.y, y1: region.y + region.h, width: Math.max(1, Math.round(pitch * widthFraction)), tilt: 0,
  }));
}

/** Centre x of a lane at a given working-frame y (clamped to the lane's extent). */
export function laneCentreAt(lane: Lane, y: number): number {
  const t = lane.y1 === lane.y0 ? 0 : Math.min(1, Math.max(0, (y - lane.y0) / (lane.y1 - lane.y0)));
  return lane.x + lane.tilt * t;
}

/**
 * Auto-detect/extrapolate lanes based on 2 or more user-placed lanes.
 * Uses pitch, width, vertical bounds, and tilt from the placed lanes,
 * with optional peak-refinement using vertical projection.
 */
export function gridLanesFromPlaced(
  placedLanes: Lane[],
  plane: Plane,
  polarity: Polarity,
  opts: { totalLanes?: number; refineToPeaks?: boolean } = {}
): Lane[] {
  if (placedLanes.length < 2) return placedLanes;

  const sorted = [...placedLanes].sort((a, b) => a.x - b.x);
  const nPlaced = sorted.length;

  const avgWidth = Math.round(sorted.reduce((acc, l) => acc + l.width, 0) / nPlaced);
  const minY0 = Math.min(...sorted.map(l => l.y0));
  const maxY1 = Math.max(...sorted.map(l => l.y1));
  const avgTilt = sorted.reduce((acc, l) => acc + l.tilt, 0) / nPlaced;

  const diffs: number[] = [];
  for (let i = 1; i < nPlaced; i++) {
    diffs.push(sorted[i]!.x - sorted[i - 1]!.x);
  }

  let pitch: number;
  if (opts.totalLanes && opts.totalLanes > 1) {
    const totalSpan = sorted[nPlaced - 1]!.x - sorted[0]!.x;
    pitch = totalSpan / (opts.totalLanes - 1);
  } else {
    diffs.sort((a, b) => a - b);
    const medianDiff = diffs[Math.floor(diffs.length / 2)]!;
    if (nPlaced === 2 && medianDiff > avgWidth * 3.5) {
      const approxCount = Math.max(2, Math.round(medianDiff / (avgWidth * 1.35)));
      pitch = medianDiff / (approxCount - 1);
    } else {
      pitch = medianDiff;
    }
  }

  if (pitch <= 5) pitch = Math.max(12, avgWidth * 1.3);

  let proj: Float32Array | null = null;
  if (opts.refineToPeaks !== false) {
    try {
      const region: Region = { x: 0, y: minY0, w: plane.width, h: Math.max(1, maxY1 - minY0) };
      proj = verticalProjection(plane, region, polarity);
    } catch {
      proj = null;
    }
  }

  const firstX = sorted[0]!.x;
  const lastX = sorted[nPlaced - 1]!.x;

  const newXCoords: number[] = [];

  // Lanes to the left of firstX
  const leftSlots = Math.max(0, Math.floor((firstX - avgWidth / 2) / pitch));
  for (let s = leftSlots; s >= 1; s--) {
    const x = firstX - s * pitch;
    if (x - avgWidth / 2 >= 0) newXCoords.push(x);
  }

  // Intermediate lanes between firstX and lastX
  const numInter = Math.max(1, Math.round((lastX - firstX) / pitch));
  const adjustedPitch = (lastX - firstX) / numInter;
  for (let i = 0; i <= numInter; i++) {
    newXCoords.push(firstX + i * adjustedPitch);
  }

  // Lanes to the right of lastX
  const rightSlots = Math.max(0, Math.floor((plane.width - (lastX + avgWidth / 2)) / pitch));
  for (let s = 1; s <= rightSlots; s++) {
    const x = lastX + s * pitch;
    if (x + avgWidth / 2 <= plane.width) newXCoords.push(x);
  }

  return newXCoords.map(candX => {
    let finalX = candX;
    const closePlaced = sorted.find(p => Math.abs(p.x - candX) < pitch * 0.35);
    if (closePlaced) {
      return {
        id: closePlaced.id,
        x: Math.round(closePlaced.x),
        y0: closePlaced.y0,
        y1: closePlaced.y1,
        width: closePlaced.width || avgWidth,
        tilt: closePlaced.tilt ?? avgTilt,
      };
    }

    if (proj) {
      const searchRadius = Math.round(pitch * 0.25);
      const startX = Math.max(0, Math.round(candX - searchRadius));
      const endX = Math.min(plane.width - 1, Math.round(candX + searchRadius));
      let maxVal = -Infinity;
      let bestX = candX;
      for (let px = startX; px <= endX; px++) {
        const v = proj[px] ?? 0;
        if (v > maxVal) {
          maxVal = v;
          bestX = px;
        }
      }
      if (maxVal > 0) {
        finalX = bestX;
      }
    }

    return {
      id: laneId(),
      x: Math.round(finalX),
      y0: minY0,
      y1: maxY1,
      width: avgWidth,
      tilt: avgTilt,
    };
  });
}

