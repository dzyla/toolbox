/* Condition / replicate statistics for normalized band values. Pure. Welch 1947, Biometrika 34:28 (unequal-variance
 * t-test); Holm 1979, Scand J Stat 6:65 (step-down multiple-comparison adjustment). */
import { centralTCdf, tCritical95 } from '@/core/stats';

export type NormMode = 'none' | 'control-band' | 'total-lane';
export interface LaneValue { value: number | null; reason: string | null }

export function normalizeLaneValue(mode: NormMode, targetNet: number | null, controlNet: number | null, totalLane: number): LaneValue {
  if (targetNet === null) return { value: null, reason: 'no target band in this lane' };
  if (mode === 'none') return { value: targetNet, reason: null };
  if (mode === 'control-band') {
    if (controlNet === null) return { value: null, reason: 'no control band in this lane' };
    if (controlNet <= 0) return { value: null, reason: 'control band signal ≤ 0' };
    return { value: targetNet / controlNet, reason: null };
  }
  if (!(totalLane > 0)) return { value: null, reason: 'total lane signal ≤ 0' };
  return { value: targetNet / totalLane, reason: null };
}

export interface GroupInput { laneId: string; condition: string; replicate: number | null; value: number | null; flags: string[] }
export interface WelchResult { t: number; df: number; p: number }
export interface GroupSummary {
  condition: string; n: number; nExcluded: number; values: number[];
  mean: number | null; sd: number | null; sem: number | null; ci95: [number, number] | null; cvPct: number | null;
  foldChange: number | null; flags: string[]; test: (WelchResult & { pAdj: number }) | null;
}

const meanOf = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const varOf = (v: number[], m: number) => v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1);

/** Two-sided Welch t-test of a vs b (a − b). Null when either group has n < 2 or both variances are 0. */
export function welchTTest(a: number[], b: number[]): WelchResult | null {
  if (a.length < 2 || b.length < 2) return null;
  const ma = meanOf(a), mb = meanOf(b);
  const va = varOf(a, ma) / a.length, vb = varOf(b, mb) / b.length;
  if (va + vb === 0) return null;
  const t = (ma - mb) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const p = 2 * centralTCdf(-Math.abs(t), df);
  return { t, df, p };
}

/** Holm step-down adjusted p-values, in the input order. */
export function holmAdjust(p: number[]): number[] {
  const m = p.length, order = p.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(m);
  let running = 0;
  order.forEach(({ v, i }, k) => { running = Math.max(running, Math.min(1, (m - k) * v)); out[i] = running; });
  return out;
}

export function summarizeGroups(rows: GroupInput[], controlCondition: string, opts: { welch?: boolean } = {}): GroupSummary[] {
  const conds: string[] = [];
  for (const r of rows) if (!conds.includes(r.condition)) conds.push(r.condition);
  const valuesOf = (c: string) => rows.filter(r => r.condition === c && r.value !== null && Number.isFinite(r.value)).map(r => r.value as number);
  const ctrl = valuesOf(controlCondition);
  const ctrlMean = ctrl.length ? meanOf(ctrl) : null;
  const base: GroupSummary[] = conds.map(c => {
    const inC = rows.filter(r => r.condition === c), vals = valuesOf(c), n = vals.length;
    const mean = n ? meanOf(vals) : null;
    const sd = n >= 2 ? Math.sqrt(varOf(vals, mean!)) : null;
    const sem = sd === null ? null : sd / Math.sqrt(n);
    const half = sem === null ? null : tCritical95(n - 1) * sem;
    return {
      condition: c, n, nExcluded: inC.length - n, values: vals, mean, sd, sem,
      ci95: half === null ? null : [mean! - half, mean! + half],
      cvPct: sd !== null && mean ? (sd / Math.abs(mean)) * 100 : null,
      foldChange: mean !== null && ctrlMean !== null && ctrlMean > 0 ? mean / ctrlMean : null,
      flags: [...new Set(inC.filter(r => r.value !== null && Number.isFinite(r.value)).flatMap(r => r.flags))],
      test: null,
    };
  });
  if (opts.welch && ctrl.length >= 2) {
    const tested = base.filter(g => g.condition !== controlCondition).map(g => ({ g, r: welchTTest(g.values, ctrl) })).filter(x => x.r);
    const adj = holmAdjust(tested.map(x => x.r!.p));
    tested.forEach((x, k) => { x.g.test = { ...x.r!, pAdj: adj[k]! }; });
  }
  return base;
}
