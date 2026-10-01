/* Binning for plots: uniform bins on the display scale, a 2-D count grid, and deterministic subsampling. */
import { forward, type ScaleSpec } from './scales';
import { percentileSorted } from './gates';

/** Evenly spaced event indices (at most `max`), identical on every run. */
export function subsampleIndices(total: number, max = 100_000): Uint32Array {
  const n = Math.min(total, max);
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor((i * total) / n);
  return out;
}

export interface Range { min: number; max: number }

/** Display-space axis range from the 0.05-99.95 percentiles of up to 20,000 evenly sampled events, padded 2%. */
export function autoRange(col: ArrayLike<number>, scale: ScaleSpec): Range {
  const idx = subsampleIndices(col.length, 20_000);
  const vals = new Float64Array(idx.length);
  let n = 0;
  for (let i = 0; i < idx.length; i++) {
    const v = forward(col[idx[i]!]!, scale);
    if (Number.isFinite(v)) vals[n++] = v;
  }
  if (n === 0) return { min: 0, max: 1 };
  const sorted = vals.subarray(0, n).sort();
  let lo = percentileSorted(sorted, 0.05), hi = percentileSorted(sorted, 99.95);
  if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.02;
  return { min: lo - pad, max: hi + pad };
}

export interface Histogram { min: number; max: number; counts: Uint32Array; maxCount: number }

/** Uniform bins over [range.min, range.max] on the display scale; out-of-range events pile into the edge bins. */
export function histogram(
  col: ArrayLike<number>, mask: Uint8Array | null, scale: ScaleSpec, bins: number, range: Range,
): Histogram {
  const counts = new Uint32Array(bins);
  const w = (range.max - range.min) / bins;
  for (let i = 0; i < col.length; i++) {
    if (mask !== null && mask[i] !== 1) continue;
    const v = forward(col[i]!, scale);
    if (!Number.isFinite(v)) continue;
    const b = Math.min(bins - 1, Math.max(0, Math.floor((v - range.min) / w)));
    counts[b]!++;
  }
  let maxCount = 0;
  for (const c of counts) if (c > maxCount) maxCount = c;
  return { min: range.min, max: range.max, counts, maxCount };
}

export interface Density2d { nx: number; ny: number; counts: Uint32Array; maxCount: number }

/** Count grid, row-major with y increasing upward in data terms (row 0 = lowest y). */
export function density2d(
  xs: ArrayLike<number>, ys: ArrayLike<number>, mask: Uint8Array | null,
  xScale: ScaleSpec, yScale: ScaleSpec, xRange: Range, yRange: Range, nx: number, ny: number,
): Density2d {
  const counts = new Uint32Array(nx * ny);
  const wx = (xRange.max - xRange.min) / nx, wy = (yRange.max - yRange.min) / ny;
  for (let i = 0; i < xs.length; i++) {
    if (mask !== null && mask[i] !== 1) continue;
    const x = forward(xs[i]!, xScale), y = forward(ys[i]!, yScale);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const bx = Math.min(nx - 1, Math.max(0, Math.floor((x - xRange.min) / wx)));
    const by = Math.min(ny - 1, Math.max(0, Math.floor((y - yRange.min) / wy)));
    counts[by * nx + bx]!++;
  }
  let maxCount = 0;
  for (const c of counts) if (c > maxCount) maxCount = c;
  return { nx, ny, counts, maxCount };
}
