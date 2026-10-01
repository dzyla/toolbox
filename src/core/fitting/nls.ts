/*
 * Levenberg–Marquardt nonlinear least squares (Marquardt 1963, J Soc Ind Appl Math 11:431) with a
 * numerical Jacobian, box bounds (projection), fixed parameters and multi-start. Parameter
 * covariance is the linearised Cov = s²·(JᵀWJ)⁻¹ with s² = SSE/df, the same approximation used by
 * the single-curve fitters (GraphPad Prism "asymptotic standard errors").
 * It is used for global and multi-parameter fits where Nelder–Mead becomes unreliable (> ~5 parameters).
 */

import { tCritical95 } from '@/core/stats';

export interface NlsProblem {
  /** Model values for all observations given the full parameter vector. */
  predict: (p: number[]) => number[];
  /** Observations (same length and order as predict()). */
  y: number[];
  /** Optional weights (1/σ²-like); default 1. */
  weights?: number[];
  p0: number[];
  lower?: number[];
  upper?: number[];
  /** Parameters held at their p0 value (not fitted). */
  fixed?: boolean[];
  maxIterations?: number;
}

export interface NlsResult {
  params: number[];
  /** Standard errors; undefined for fixed parameters or when the covariance is singular. */
  se: (number | undefined)[];
  sse: number;
  /** Observations minus free parameters (at least 1). */
  df: number;
  nFree: number;
  n: number;
  iterations: number;
  converged: boolean;
  fitted: number[];
  residuals: number[];
  /** Full covariance of the free parameters (null if singular). */
  covariance: number[][] | null;
  freeIndex: number[];
}

export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x.every(Number.isFinite) ? x : null;
}

export function invertMatrix(A: number[][]): number[][] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!;
    for (let k = 0; k < 2 * n; k++) M[c]![k]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]!;
      if (f === 0) continue;
      for (let k = 0; k < 2 * n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  const inv = M.map(row => row.slice(n));
  return inv.every(row => row.every(Number.isFinite)) ? inv : null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function fitNls(problem: NlsProblem): NlsResult {
  const { y, p0 } = problem;
  const n = y.length;
  const k = p0.length;
  const w = problem.weights ?? y.map(() => 1);
  const lo = problem.lower ?? p0.map(() => -Infinity);
  const hi = problem.upper ?? p0.map(() => Infinity);
  const freeIndex = p0.map((_, i) => i).filter(i => !problem.fixed?.[i]);
  const nFree = freeIndex.length;
  const maxIter = problem.maxIterations ?? 300;

  const project = (p: number[]) => p.map((v, i) => (problem.fixed?.[i] ? p0[i]! : clamp(v, lo[i]!, hi[i]!)));
  const sseOf = (p: number[]) => {
    const f = problem.predict(p);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const r = y[i]! - f[i]!;
      s += w[i]! * r * r;
    }
    return Number.isFinite(s) ? s : Infinity;
  };

  const jacobian = (p: number[], central: boolean): number[][] => {
    // J[i][a] = d f_i / d p_{freeIndex[a]}
    const J = Array.from({ length: n }, () => new Array<number>(nFree).fill(0));
    const base = central ? null : problem.predict(p);
    freeIndex.forEach((pi, a) => {
      const h = 1e-6 * Math.max(Math.abs(p[pi]!), 1e-3);
      const up = [...p]; up[pi] = Math.min(hi[pi]!, p[pi]! + h);
      const dn = [...p]; dn[pi] = Math.max(lo[pi]!, p[pi]! - h);
      const fu = problem.predict(up);
      const span = up[pi]! - (central ? dn[pi]! : p[pi]!);
      const fd = central ? problem.predict(dn) : base!;
      for (let i = 0; i < n; i++) J[i]![a] = span > 0 ? (fu[i]! - fd[i]!) / span : 0;
    });
    return J;
  };

  let p = project(p0);
  let sse = sseOf(p);
  let lambda = 1e-3;
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIter && nFree > 0; iterations++) {
    const f = problem.predict(p);
    const J = jacobian(p, false);
    const A = Array.from({ length: nFree }, () => new Array<number>(nFree).fill(0));
    const g = new Array<number>(nFree).fill(0);
    for (let i = 0; i < n; i++) {
      const r = y[i]! - f[i]!;
      for (let a = 0; a < nFree; a++) {
        const ja = J[i]![a]! * w[i]!;
        g[a]! += ja * r;
        for (let b = a; b < nFree; b++) A[a]![b]! += ja * J[i]![b]!;
      }
    }
    for (let a = 0; a < nFree; a++) for (let b = 0; b < a; b++) A[a]![b] = A[b]![a]!;

    let improved = false;
    while (lambda < 1e14) {
      const Ad = A.map((row, a) => row.map((v, b) => (a === b ? v + lambda * Math.max(A[a]![a]!, 1e-12) : v)));
      const delta = solveLinear(Ad, g);
      if (delta) {
        const trial = [...p];
        freeIndex.forEach((pi, a) => { trial[pi] = p[pi]! + delta[a]!; });
        const projected = project(trial);
        const trialSse = sseOf(projected);
        if (trialSse < sse) {
          const rel = (sse - trialSse) / Math.max(sse, 1e-300);
          const step = Math.max(...freeIndex.map(pi => Math.abs(projected[pi]! - p[pi]!) / (Math.abs(p[pi]!) + 1e-9)));
          p = projected; sse = trialSse; lambda = Math.max(lambda * 0.3, 1e-12); improved = true;
          if (rel < 1e-13 || step < 1e-10) converged = true;
          break;
        }
      }
      lambda *= 6;
    }
    if (!improved) { converged = true; break; }
    if (converged) break;
  }
  if (nFree === 0) converged = true;

  // Final statistics with a central-difference Jacobian.
  const fitted = problem.predict(p);
  const residuals = y.map((v, i) => v - fitted[i]!);
  const df = Math.max(1, n - nFree);
  let covariance: number[][] | null = null;
  const se: (number | undefined)[] = new Array(k).fill(undefined);
  if (nFree > 0 && n > nFree) {
    const J = jacobian(p, true);
    const A = Array.from({ length: nFree }, () => new Array<number>(nFree).fill(0));
    for (let i = 0; i < n; i++) for (let a = 0; a < nFree; a++) for (let b = 0; b < nFree; b++) A[a]![b]! += w[i]! * J[i]![a]! * J[i]![b]!;
    const inv = invertMatrix(A);
    if (inv) {
      const s2 = sse / df;
      covariance = inv.map(row => row.map(v => v * s2));
      freeIndex.forEach((pi, a) => {
        const v = covariance![a]![a]!;
        se[pi] = v >= 0 && Number.isFinite(v) ? Math.sqrt(v) : undefined;
      });
    }
  }
  return { params: p, se, sse, df, nFree, n, iterations, converged, fitted, residuals, covariance, freeIndex };
}

/** Fit from several starting points and keep the lowest SSE (guards against local minima). */
export function fitNlsMultiStart(problem: NlsProblem, starts: number[][]): NlsResult {
  let best: NlsResult | null = null;
  for (const p0 of starts) {
    const r = fitNls({ ...problem, p0 });
    if (!best || r.sse < best.sse) best = r;
  }
  return best ?? fitNls(problem);
}

/** Wald 95% interval from an NLS result for parameter i (t multiplier with the residual df). */
export function nlsCi95(r: NlsResult, i: number): { ci95Low?: number; ci95High?: number } {
  const se = r.se[i];
  if (se === undefined) return {};
  const half = tCritical95(r.df) * se;
  return { ci95Low: r.params[i]! - half, ci95High: r.params[i]! + half };
}

/** Corrected Akaike information criterion for least squares (n observations, k free parameters + 1 for the variance). */
export function aicc(sse: number, n: number, kParams: number): number {
  const k = kParams + 1;
  const base = n * Math.log(Math.max(sse, 1e-300) / n) + 2 * k;
  return n - k - 1 > 0 ? base + (2 * k * (k + 1)) / (n - k - 1) : Infinity;
}
