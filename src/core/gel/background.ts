/* Baselines for lane profiles. All return a baseline array the same length as the profile, in signal units. */
import type { Band } from './types';
import { opening, gaussianSmooth } from './filters';

export type BackgroundMethod = 'none' | 'rolling' | 'valley' | 'shared';

/**
 * Cross-lane shared baseline: computes the uniform background matrix level across all lanes,
 * ensuring that baseline subtraction is strictly comparable between lanes without per-lane distortion.
 * Recommended for quantitative comparative Western blots and multi-lane densitometry.
 */
export function sharedCrossLaneBaseline(profiles: Float32Array[], radius = 50): Float32Array {
  if (profiles.length === 0) return new Float32Array(0);
  const len = Math.max(...profiles.map(p => p.length));
  const baselineValues = new Float32Array(len);
  for (let y = 0; y < len; y++) {
    const col: number[] = [];
    for (let l = 0; l < profiles.length; l++) {
      if (y >= profiles[l]!.length) continue;
      const v = profiles[l]![y]!;
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

/** Ball height as a fraction of the profile range. Taller balls sag into narrow bands (baseline too high); 0.1 keeps a sloping background within tolerance and synthetic-gel nets within 10 % of truth. */
const BALL_HEIGHT_FRACTION = 0.1;

/**
 * Rolling-ball baseline along a profile (Sternberg 1983): grey-scale opening with a ball-shaped structuring element of
 * radius r samples, whose height is a fraction of the profile's intensity range (so the ball's curvature scales with the data, as in
 * ImageJ), then a light Gaussian (σ = r/10) and clamping to the profile. Bands wider than about r are partly absorbed —
 * the workspace warns about those.
 */
export function rollingBaseline(profile: ArrayLike<number>, radius: number): Float32Array {
  const x = Float32Array.from(profile, v => Number.isNaN(v) ? 0 : v);
  const n = x.length, r = Math.max(1, Math.round(radius));
  if (n === 0) return x;
  let lo = Infinity, hi = -Infinity;
  for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const H = (hi - lo) * BALL_HEIGHT_FRACTION;
  const ball = Float32Array.from({ length: 2 * r + 1 }, (_, j) => { const k = (j - r) / r; return H * (Math.sqrt(Math.max(0, 1 - k * k)) - 1); });
  const ero = new Float32Array(n), dil = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let j = -r; j <= r; j++) { const t = i + j; if (t < 0 || t >= n) continue; const v = x[t]! - ball[j + r]!; if (v < m) m = v; }
    ero[i] = m;
  }
  for (let i = 0; i < n; i++) {
    let m = -Infinity;
    for (let j = -r; j <= r; j++) { const t = i - j; if (t < 0 || t >= n) continue; const v = ero[t]! + ball[j + r]!; if (v > m) m = v; }
    dil[i] = m;
  }
  const smooth = gaussianSmooth(dil, r / 10);
  for (let i = 0; i < n; i++) smooth[i] = Math.min(smooth[i]!, x[i]!);
  return smooth;
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

export function baselineFor(
  method: BackgroundMethod,
  profile: ArrayLike<number>,
  opts: { radius?: number; bands?: Band[]; sharedBaseline?: Float32Array } = {}
): Float32Array {
  switch (method) {
    case 'shared':
      return opts.sharedBaseline ? opts.sharedBaseline.slice(0, profile.length) : rollingBaseline(profile, opts.radius ?? 50);
    case 'rolling':
      return rollingBaseline(profile, opts.radius ?? 50);
    case 'valley':
      return valleyBaseline(profile, opts.bands ?? []);
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

/** True when a band's valley-to-valley extent exceeds the diameter (2 × radius) of the morphological opening used by the
 * rolling-ball ('rolling') and shared cross-lane ('shared') baselines, so the opening would eat into the band itself. */
export function bandWiderThanBall(bgMethod: string, y0: number, y1: number, radius: number): boolean {
  return (bgMethod === 'rolling' || bgMethod === 'shared') && (y1 - y0) > 2 * radius;
}
