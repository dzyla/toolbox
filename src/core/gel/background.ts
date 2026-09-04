/* Baselines for lane profiles. All return a baseline array the same length as the profile, in signal units. */
import type { Band } from './types';
import { opening, mean } from './filters';

export type BackgroundMethod = 'none' | 'rolling' | 'valley' | 'roi' | 'shared';

/**
 * Cross-lane shared baseline: computes the uniform background matrix level across all lanes,
 * ensuring that baseline subtraction is strictly comparable between lanes without per-lane distortion.
 * Recommended for quantitative comparative Western blots and multi-lane densitometry.
 */
export function sharedCrossLaneBaseline(profiles: Float32Array[], radius = 50): Float32Array {
  if (profiles.length === 0) return new Float32Array(0);
  const len = profiles[0]!.length;
  const baselineValues = new Float32Array(len);
  for (let y = 0; y < len; y++) {
    const col: number[] = [];
    for (let l = 0; l < profiles.length; l++) {
      const v = profiles[l]![y] ?? 0;
      if (!Number.isNaN(v)) col.push(v);
    }
    if (col.length === 0) {
      baselineValues[y] = 0;
    } else {
      col.sort((a, b) => a - b);
      const qIdx = Math.floor(col.length * 0.25);
      baselineValues[y] = col[qIdx]!;
    }
  }
  return opening(baselineValues, Math.max(1, Math.round(radius)));
}

/**
 * Rolling-ball style baseline along a profile: the morphological opening with a window of 2·radius+1 samples
 * (the largest signal that fits under the profile without entering features narrower than the window),
 * smoothed with a small Gaussian. Bands wider than the window are partly absorbed, as with ImageJ's rolling ball.
 * Sternberg 1983, "Biomedical image processing", Computer 16(1):22 (rolling ball); opening approximation as in ImageJ.
 */
export function rollingBaseline(profile: ArrayLike<number>, radius: number): Float32Array {
  const clean = Float32Array.from(profile, v => Number.isNaN(v) ? 0 : v);
  const r = Math.max(1, Math.round(radius));
  return opening(clean, r);
}

/**
 * Valley-to-valley baseline: connects local valley minima between bands with a continuous baseline.
 * Under each band it forms a straight line from y0 to y1. Between bands, it linearly connects the valleys,
 * ensuring baseline subtraction is continuous, uniform, and scientifically sound across the entire lane profile.
 */
export function valleyBaseline(profile: ArrayLike<number>, bands: Band[]): Float32Array {
  const n = profile.length;
  if (n === 0) return new Float32Array(0);
  const clean = Float32Array.from(profile, v => Number.isNaN(v) ? 0 : v);
  const out = new Float32Array(n);

  const sortedBands = [...bands]
    .map(b => ({ y0: Math.max(0, Math.round(b.y0)), y1: Math.min(n - 1, Math.round(b.y1)) }))
    .filter(b => b.y1 > b.y0)
    .sort((a, b) => a.y0 - b.y0);

  if (sortedBands.length === 0) {
    let minVal = Infinity;
    for (let i = 0; i < n; i++) {
      if (clean[i]! < minVal) minVal = clean[i]!;
    }
    return out.fill(Number.isFinite(minVal) ? minVal : 0);
  }

  // Linear segments under each band
  for (const b of sortedBands) {
    const v0 = clean[b.y0]!, v1 = clean[b.y1]!;
    for (let y = b.y0; y <= b.y1; y++) {
      out[y] = v0 + (v1 - v0) * (y - b.y0) / (b.y1 - b.y0 || 1);
    }
  }

  // Fill region before first band: flat from first band start
  const first = sortedBands[0]!;
  const vFirst = clean[first.y0]!;
  for (let y = 0; y < first.y0; y++) {
    out[y] = vFirst;
  }

  // Inter-band regions: connect end of band k to start of band k+1
  for (let i = 0; i < sortedBands.length - 1; i++) {
    const curr = sortedBands[i]!;
    const next = sortedBands[i + 1]!;
    if (curr.y1 < next.y0) {
      const vEnd = clean[curr.y1]!;
      const vStart = clean[next.y0]!;
      for (let y = curr.y1 + 1; y < next.y0; y++) {
        out[y] = vEnd + (vStart - vEnd) * (y - curr.y1) / (next.y0 - curr.y1);
      }
    }
  }

  // Fill region after last band: flat from last band end
  const last = sortedBands[sortedBands.length - 1]!;
  const vLast = clean[last.y1]!;
  for (let y = last.y1 + 1; y < n; y++) {
    out[y] = vLast;
  }

  return out;
}

/** Constant baseline from a user-drawn background region: the mean signal of that region. */
export function constantBaseline(length: number, roiSignal: ArrayLike<number>): Float32Array {
  const m = mean(roiSignal);
  return new Float32Array(length).fill(Number.isFinite(m) ? m : 0);
}

export function baselineFor(
  method: BackgroundMethod,
  profile: ArrayLike<number>,
  opts: { radius?: number; bands?: Band[]; roiSignal?: ArrayLike<number>; sharedBaseline?: Float32Array } = {}
): Float32Array {
  switch (method) {
    case 'shared':
      return opts.sharedBaseline ?? rollingBaseline(profile, opts.radius ?? 50);
    case 'rolling':
      return rollingBaseline(profile, opts.radius ?? 50);
    case 'valley':
      return valleyBaseline(profile, opts.bands ?? []);
    case 'roi':
      return constantBaseline(profile.length, opts.roiSignal ?? []);
    default:
      return new Float32Array(profile.length);
  }
}

/**
 * Integrates the baseline-subtracted signal across an entire lane profile.
 * Total Lane Signal = laneWidth * sum_y max(0, profile[y] - baseline[y])
 */
export function integrateLaneSignal(profile: ArrayLike<number>, baseline: ArrayLike<number>, laneWidth = 1): number {
  let sum = 0;
  const n = Math.min(profile.length, baseline.length);
  for (let i = 0; i < n; i++) {
    const net = Math.max(0, (profile[i] ?? 0) - (baseline[i] ?? 0));
    sum += net;
  }
  return sum * Math.max(1, laneWidth);
}
