/* Molecular-weight calibration: log10(size) as a function of migration (y, px along the lane).
 * Models: linear (log-linear, the classic semi-log plot), piecewise linear between ladder bands, natural cubic spline
 * (ImageJ "Analyze > Calibrate" style interpolation). Size at any y is 10^f(y).
 * Reference for the log-linear relation: Weber & Osborn 1969, J Biol Chem 244:4406 (SDS-PAGE); Helling, Goodman &
 * Boyer 1974, J Virol 14:1235 (DNA fragments in agarose). */
import { GelInputError } from './types';

export type CalibrationModel = 'linear' | 'piecewise' | 'spline';
export interface CalibrationPoint { y: number; size: number }
export interface Calibration {
  model: CalibrationModel;
  points: CalibrationPoint[];
  /** Estimated size at migration y. Outside the ladder range the end segment (or line) is extrapolated. */
  sizeAt(y: number): number;
  /** Migration at which a size would run (inverse of sizeAt by bisection over the extended ladder range). */
  yAt(size: number): number;
  /** Coefficient of determination of log10(size) vs y for the fitted model (1 for interpolating models). */
  r2: number;
  /** Per point: fitted size and residual in log10 units and as a fraction of size. */
  residuals: { y: number; size: number; fitted: number; logResidual: number; fraction: number }[];
  /** For the linear model: log10(size) = intercept + slope · y. */
  slope?: number; intercept?: number;
}

function sorted(points: CalibrationPoint[]): CalibrationPoint[] {
  const p = points.filter(q => Number.isFinite(q.y) && q.size > 0).sort((a, b) => a.y - b.y);
  for (let i = 1; i < p.length; i++) if (p[i]!.y === p[i - 1]!.y) throw new GelInputError('Two ladder bands share the same position');
  return p;
}

function linearFit(p: CalibrationPoint[]): (y: number) => number {
  const n = p.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const q of p) { const ly = Math.log10(q.size); sx += q.y; sy += ly; sxx += q.y * q.y; sxy += q.y * ly; }
  const den = n * sxx - sx * sx;
  const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const f = (y: number) => intercept + slope * y;
  (f as unknown as { slope: number; intercept: number }).slope = slope;
  (f as unknown as { slope: number; intercept: number }).intercept = intercept;
  return f;
}

function piecewise(p: CalibrationPoint[]): (y: number) => number {
  const ys = p.map(q => q.y), ls = p.map(q => Math.log10(q.size));
  return (y: number) => {
    const n = ys.length;
    if (n === 1) return ls[0]!;
    let i = 0;
    while (i < n - 2 && y > ys[i + 1]!) i++;
    const t = (y - ys[i]!) / (ys[i + 1]! - ys[i]!);
    return ls[i]! + t * (ls[i + 1]! - ls[i]!);
  };
}

/** Natural cubic spline through the points (second derivative zero at the ends); linear extrapolation outside. */
function naturalSpline(p: CalibrationPoint[]): (y: number) => number {
  const n = p.length;
  if (n < 3) return piecewise(p);
  const x = p.map(q => q.y), a = p.map(q => Math.log10(q.size));
  const h = Array.from({ length: n - 1 }, (_, i) => x[i + 1]! - x[i]!);
  // Tridiagonal system for the second derivatives (Burden & Faires, Numerical Analysis, natural cubic spline algorithm).
  const alpha = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) alpha[i] = 3 / h[i]! * (a[i + 1]! - a[i]!) - 3 / h[i - 1]! * (a[i]! - a[i - 1]!);
  const l = new Array<number>(n).fill(1), mu = new Array<number>(n).fill(0), z = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (x[i + 1]! - x[i - 1]!) - h[i - 1]! * mu[i - 1]!;
    mu[i] = h[i]! / l[i]!;
    z[i] = (alpha[i]! - h[i - 1]! * z[i - 1]!) / l[i]!;
  }
  const c = new Array<number>(n).fill(0), b = new Array<number>(n - 1).fill(0), d = new Array<number>(n - 1).fill(0);
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j]! - mu[j]! * c[j + 1]!;
    b[j] = (a[j + 1]! - a[j]!) / h[j]! - h[j]! * (c[j + 1]! + 2 * c[j]!) / 3;
    d[j] = (c[j + 1]! - c[j]!) / (3 * h[j]!);
  }
  return (y: number) => {
    if (y <= x[0]!) return a[0]! + b[0]! * (y - x[0]!);
    if (y >= x[n - 1]!) {
      const j = n - 2, dx = x[n - 1]! - x[j]!;
      const slopeEnd = b[j]! + 2 * c[j]! * dx + 3 * d[j]! * dx * dx;
      return a[n - 1]! + slopeEnd * (y - x[n - 1]!);
    }
    let j = 0;
    while (j < n - 2 && y > x[j + 1]!) j++;
    const dx = y - x[j]!;
    return a[j]! + b[j]! * dx + c[j]! * dx * dx + d[j]! * dx * dx * dx;
  };
}

export function fitCalibration(points: CalibrationPoint[], model: CalibrationModel = 'linear'): Calibration {
  const p = sorted(points);
  const need = model === 'spline' ? 3 : 2;
  if (p.length < need) throw new GelInputError(`The ${model} model needs at least ${need} ladder bands (have ${p.length})`);
  const f = model === 'linear' ? linearFit(p) : model === 'piecewise' ? piecewise(p) : naturalSpline(p);
  const logs = p.map(q => Math.log10(q.size));
  const meanLog = logs.reduce((s, v) => s + v, 0) / logs.length;
  let ssRes = 0, ssTot = 0;
  const residuals = p.map((q, i) => {
    const fit = f(q.y), res = logs[i]! - fit;
    ssRes += res * res; ssTot += (logs[i]! - meanLog) ** 2;
    return { y: q.y, size: q.size, fitted: 10 ** fit, logResidual: res, fraction: 10 ** res - 1 };
  });
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const yMin = p[0]!.y, yMax = p[p.length - 1]!.y, span = Math.max(1, yMax - yMin);
  const sizeAt = (y: number) => 10 ** f(y);
  const yAt = (size: number) => {
    const target = Math.log10(size);
    let lo = yMin - span, hi = yMax + span;
    const dec = f(hi) < f(lo); // sizes usually decrease with y
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const v = f(mid);
      if (dec ? v > target : v < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const lin = f as unknown as { slope?: number; intercept?: number };
  return { model, points: p, sizeAt, yAt, r2, residuals, slope: lin.slope, intercept: lin.intercept };
}

/**
 * Pair detected ladder peaks (y ascending = top to bottom) with ladder sizes (descending). If there are more peaks than
 * sizes, the most prominent ones are kept; if fewer, the largest sizes are used top-down. The user can fix the rest.
 */
export function assignLadder(peaks: { y: number; prominence: number }[], sizes: number[]): CalibrationPoint[] {
  const sorted = [...sizes].sort((a, b) => b - a);
  let chosen = peaks;
  if (peaks.length > sorted.length) chosen = [...peaks].sort((a, b) => b.prominence - a.prominence).slice(0, sorted.length);
  chosen = [...chosen].sort((a, b) => a.y - b.y);
  return chosen.map((p, i) => ({ y: p.y, size: sorted[i]! }));
}

/** Human-readable size with the right unit: kDa for protein, bp/kb for DNA. */
export function formatSize(size: number, kind: 'protein' | 'dna'): string {
  if (!Number.isFinite(size) || size <= 0) return '–';
  if (kind === 'protein') return `${size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)} kDa`;
  return size >= 1000 ? `${(size / 1000).toFixed(size >= 10000 ? 1 : 2)} kb` : `${size.toFixed(0)} bp`;
}
