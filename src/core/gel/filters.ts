/* 1-D signal helpers used by lane finding, profiles and baselines. */

/** Gaussian smoothing with reflected edges. sigma ≤ 0 returns a copy. */
export function gaussianSmooth(x: ArrayLike<number>, sigma: number): Float32Array {
  const n = x.length, out = new Float32Array(n);
  if (sigma <= 0 || n === 0) { for (let i = 0; i < n; i++) out[i] = x[i]!; return out; }
  const r = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; sum += v; }
  for (let i = 0; i < k.length; i++) k[i]! /= sum;
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) {
      let idx = i + j;
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * n - idx - 2;
      if (idx < 0) idx = 0;
      acc += x[idx]! * k[j + r]!;
    }
    out[i] = acc;
  }
  return out;
}

/** Sliding-window minimum over [i-r, i+r]; edges use the available window. */
export function minFilter(x: ArrayLike<number>, r: number): Float32Array {
  const n = x.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) if (x[j]! < m) m = x[j]!;
    out[i] = m;
  }
  return out;
}
export function maxFilter(x: ArrayLike<number>, r: number): Float32Array {
  const n = x.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = -Infinity;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) if (x[j]! > m) m = x[j]!;
    out[i] = m;
  }
  return out;
}
/** Morphological opening (min then max): the largest signal that fits under x with a window of 2r+1. */
export const opening = (x: ArrayLike<number>, r: number) => maxFilter(minFilter(x, r), r);

export function median(values: ArrayLike<number>): number {
  const a = Array.from(values as ArrayLike<number>).filter(v => Number.isFinite(v)).sort((p, q) => p - q);
  if (a.length === 0) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}
export function mean(values: ArrayLike<number>): number {
  let s = 0, k = 0;
  for (let i = 0; i < values.length; i++) { const v = values[i]!; if (Number.isFinite(v)) { s += v; k++; } }
  return k ? s / k : NaN;
}

export interface Peak {
  /** Sub-pixel position (parabolic refinement of the maximum). */
  index: number; height: number; prominence: number;
  /** Bounds (integer sample indices) where the peak's own signal falls to 3 % of its prominence above the local base. */
  left: number; right: number;
  valleyLeft?: number; valleyRight?: number;
  /** Width at half prominence, in samples. */
  width: number;
  halfCenter?: number;
}

export interface PeakOptions {
  /** Absolute minimum prominence; if `relative` is true it is a fraction of the largest prominence found. */
  minProminence?: number; relative?: boolean;
  minWidth?: number;
  /** Gaussian sigma applied before searching (bounds and heights are read from the smoothed signal). */
  smoothing?: number;
  /** Fraction of prominence (above base) that defines the band edges. Default 0.03. */
  edgeFraction?: number;
}

/**
 * Peak detection with scipy-style prominence: for each local maximum, the base on each side is the minimum between the
 * peak and the next higher point; prominence = height − max(leftBase, rightBase).
 */
export function findPeaks(signal: ArrayLike<number>, opts: PeakOptions = {}): Peak[] {
  const y = gaussianSmooth(signal, opts.smoothing ?? 0);
  const n = y.length;
  const cand: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (y[i]! > y[i - 1]! && y[i]! >= y[i + 1]!) {
      // plateau: walk to its end and take the centre
      let j = i;
      while (j + 1 < n && y[j + 1] === y[i]) j++;
      if (j + 1 < n && y[j + 1]! < y[i]!) cand.push(Math.round((i + j) / 2));
      i = j;
    }
  }
  const peaks: Peak[] = [];
  const edge = opts.edgeFraction ?? 0.03;
  for (const p of cand) {
    const h = y[p]!;
    let lmin = h, l = p;
    for (let i = p - 1; i >= 0; i--) { if (y[i]! > h) break; if (y[i]! < lmin) { lmin = y[i]!; l = i; } }
    let rmin = h, r = p;
    for (let i = p + 1; i < n; i++) { if (y[i]! > h) break; if (y[i]! < rmin) { rmin = y[i]!; r = i; } }
    const prominence = h - Math.max(lmin, rmin);
    if (prominence <= 0) continue;
    // Edges: from the peak outward until the signal drops to base + edge·(h − base) on that side, or the base position.
    const lThr = lmin + edge * (h - lmin), rThr = rmin + edge * (h - rmin);
    let left = p; while (left > l && y[left - 1]! > lThr) left--;
    let right = p; while (right < r && y[right + 1]! > rThr) right++;
    // Width at half prominence (linear interpolation).
    const half = h - prominence / 2;
    let wl = p; while (wl > l && y[wl - 1]! > half) wl--;
    let wr = p; while (wr < r && y[wr + 1]! > half) wr++;
    const fl = wl > 0 && y[wl - 1]! < half && y[wl]! !== y[wl - 1]! ? (y[wl]! - half) / (y[wl]! - y[wl - 1]!) : 0;
    const fr = wr < n - 1 && y[wr + 1]! < half && y[wr]! !== y[wr + 1]! ? (y[wr]! - half) / (y[wr]! - y[wr + 1]!) : 0;
    const width = (wr + fr) - (wl - fl);
    const halfCenter = ((wl - fl) + (wr + fr)) / 2;
    // Sub-pixel apex from a parabola through the three samples around the maximum.
    let index = p;
    if (p > 0 && p < n - 1) {
      const a = y[p - 1]!, b = h, c = y[p + 1]!;
      const den = a - 2 * b + c;
      if (den < 0) index = p + 0.5 * (a - c) / den;
    }
    peaks.push({ index, height: h, prominence, left, right, valleyLeft: l, valleyRight: r, width, halfCenter });
  }
  const maxProm = peaks.reduce((m, p) => Math.max(m, p.prominence), 0);
  const minProm = opts.relative ? (opts.minProminence ?? 0) * maxProm : (opts.minProminence ?? 0);
  const filtered = peaks.filter(p => p.prominence >= minProm && p.width >= (opts.minWidth ?? 0)).sort((p, q) => p.index - q.index);
  for (let i = 0; i < filtered.length - 1; i++) {
    const p1 = filtered[i]!, p2 = filtered[i + 1]!;
    const start = Math.round(p1.index);
    const end = Math.round(p2.index);
    let vIdx = start;
    let vVal = y[start]!;
    for (let j = start; j <= end; j++) {
      if (y[j]! < vVal) {
        vVal = y[j]!;
        vIdx = j;
      }
    }
    p1.right = Math.min(p1.right, vIdx);
    p2.left = Math.max(p2.left, vIdx);
    p1.valleyRight = Math.min(p1.valleyRight ?? p1.right, vIdx);
    p2.valleyLeft = Math.max(p2.valleyLeft ?? p2.left, vIdx);
  }
  return filtered;
}
