/* Ladder band matching: pair detected ladder peaks (top → bottom) with ladder sizes (large → small) so that a missed
 * or an extra band does not shift every later assignment. Candidates are monotone alignments that skip a few peaks
 * and/or sizes; the winner has the smallest residual SD (quadratic fit of log10 size vs y when 5+ pairs, else linear) plus a small
 * penalty per avoidable skip. */

export interface LadderPeak { y: number; prominence: number; id?: string }
export interface LadderPair { y: number; size: number; peakIndex: number; id?: string }
export interface LadderMatch { pairs: LadderPair[]; skippedPeaks: number[]; skippedSizes: number[]; /** SD of the fit used for matching: quadratic (k-3 df) for 5+ pairs, linear (k-2 df) otherwise. */ residualSD: number }

/** Penalty in log10 units per skip beyond the unavoidable |peaks - sizes|. */
const SKIP_PENALTY = 0.01;
const MAX_EXTRA_SKIPS = 2;
const MAX_EVALUATIONS = 500_000;

function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > n) return;
  while (true) {
    yield idx.slice();
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]!++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
}

function linearSD(ys: number[], logs: number[]): number {
  const n = ys.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += ys[i]!; sy += logs[i]!; sxx += ys[i]! ** 2; sxy += ys[i]! * logs[i]!; }
  const den = n * sxx - sx * sx;
  const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (logs[i]! - icpt - slope * ys[i]!) ** 2;
  return n > 2 ? Math.sqrt(ss / (n - 2)) : 0;
}

/** Residual SD of a least-squares quadratic (y centred and scaled); falls back to linear when degenerate. */
function fitSD(ys: number[], logs: number[]): number {
  const n = ys.length;
  if (n < 5) return linearSD(ys, logs);
  const mean = ys.reduce((s, v) => s + v, 0) / n;
  const scale = Math.max(...ys.map(v => Math.abs(v - mean))) || 1;
  const x = ys.map(v => (v - mean) / scale);
  const s = [0, 0, 0, 0, 0], r = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    let p = 1;
    for (let j = 0; j < 5; j++) { s[j]! += p; if (j < 3) r[j]! += p * logs[i]!; p *= x[i]!; }
  }
  const A = [[s[0]!, s[1]!, s[2]!, r[0]!], [s[1]!, s[2]!, s[3]!, r[1]!], [s[2]!, s[3]!, s[4]!, r[2]!]];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let i = c + 1; i < 3; i++) if (Math.abs(A[i]![c]!) > Math.abs(A[piv]![c]!)) piv = i;
    if (Math.abs(A[piv]![c]!) < 1e-12) return linearSD(ys, logs);
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    for (let i = c + 1; i < 3; i++) {
      const f = A[i]![c]! / A[c]![c]!;
      for (let j = c; j < 4; j++) A[i]![j]! -= f * A[c]![j]!;
    }
  }
  const co = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let v = A[i]![3]!;
    for (let j = i + 1; j < 3; j++) v -= A[i]![j]! * co[j]!;
    co[i] = v / A[i]![i]!;
  }
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (logs[i]! - (co[0]! + co[1]! * x[i]! + co[2]! * x[i]! ** 2)) ** 2;
  return Math.sqrt(ss / (n - 3));
}

export function matchLadder(peaks: LadderPeak[], sizes: number[]): LadderMatch | null {
  const order = sizes.map((s, i) => ({ s, i })).filter(q => q.s > 0).sort((a, b) => b.s - a.s);
  // Keep at most sizes + 2 peaks, the most prominent, then back in migration order.
  let cand = peaks.map((p, i) => ({ ...p, i }));
  if (cand.length > order.length + MAX_EXTRA_SKIPS) cand = [...cand].sort((a, b) => b.prominence - a.prominence).slice(0, order.length + MAX_EXTRA_SKIPS);
  cand.sort((a, b) => a.y - b.y);
  const n = cand.length, m = order.length, full = Math.min(n, m);
  const kMin = Math.max(3, full - MAX_EXTRA_SKIPS);
  if (full < 3) return null;
  let best: { score: number; pi: number[]; si: number[]; sd: number } | null = null;
  let evals = 0;
  search: for (let k = full; k >= kMin; k--) {
    for (const pi of combinations(n, k)) {
      const ys = pi.map(i => cand[i]!.y);
      for (const si of combinations(m, k)) {
        if (++evals > MAX_EVALUATIONS) break search;
        const sd = fitSD(ys, si.map(i => Math.log10(order[i]!.s)));
        const avoidable = (n - k) + (m - k) - Math.abs(n - m);
        const score = sd + SKIP_PENALTY * avoidable;
        if (!best || score < best.score - 1e-12) best = { score, pi, si, sd };
      }
    }
  }
  if (!best) return null;
  const usedP = new Set(best.pi.map(i => cand[i]!.i)), usedS = new Set(best.si.map(i => order[i]!.i));
  return {
    pairs: best.pi.map((ci, j) => ({ y: cand[ci]!.y, size: order[best!.si[j]!]!.s, peakIndex: cand[ci]!.i, id: cand[ci]!.id })),
    skippedPeaks: peaks.map((_, i) => i).filter(i => !usedP.has(i)),
    skippedSizes: sizes.map((_, i) => i).filter(i => sizes[i]! > 0 && !usedS.has(i)),
    residualSD: best.sd,
  };
}
