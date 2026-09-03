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
 * Valley-to-valley baseline: a straight line under each band from the profile value at its first row to the value at its
 * last row (ImageJ Gel Analyzer convention when the user closes each peak with a line). Outside bands the baseline
 * follows the profile.
 */
export function valleyBaseline(profile: ArrayLike<number>, bands: Band[]): Float32Array {
  const n = profile.length;
  const out = Float32Array.from(profile, v => Number.isNaN(v) ? 0 : v);
  for (const b of bands) {
    const y0 = Math.max(0, Math.round(b.y0)), y1 = Math.min(n - 1, Math.round(b.y1) - 1);
    if (y1 <= y0) continue;
    const v0 = out[y0]!, v1 = out[y1]!;
    for (let y = y0; y <= y1; y++) out[y] = v0 + (v1 - v0) * (y - y0) / (y1 - y0);
  }
  return out;
}

/** Constant baseline from a user-drawn background region: the mean signal of that region. */
export function constantBaseline(length: number, roiSignal: ArrayLike<number>): Float32Array {
  const m = mean(roiSignal);
  return new Float32Array(length).fill(Number.isFinite(m) ? m : 0);
}

export function baselineFor(method: BackgroundMethod, profile: ArrayLike<number>, opts: { radius?: number; bands?: Band[]; roiSignal?: ArrayLike<number> }): Float32Array {
  switch (method) {
    case 'rolling': return rollingBaseline(profile, opts.radius ?? 50);
    case 'valley': return valleyBaseline(profile, opts.bands ?? []);
    case 'roi': return constantBaseline(profile.length, opts.roiSignal ?? []);
    default: return new Float32Array(profile.length);
  }
}
