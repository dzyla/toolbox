/*
 * Global 1:1 (Langmuir) kinetic fit of SPR / BLI sensorgrams measured at several analyte concentrations.
 *   association (t ≤ t_d): R = R0 + Req·(1 − exp(−kobs·(t − t_a))),   kobs = kon·C + koff,  Req = Rmax·kon·C/kobs
 *   dissociation (t > t_d): R = R0 + R_d·exp(−koff·(t − t_d)),        R_d = Req·(1 − exp(−kobs·(t_d − t_a)))
 * Karlsson et al. 1991 J Immunol Methods 145:229; O'Shannessy et al. 1993 Anal Biochem 212:457;
 * Myszka 1999 J Mol Recognit 12:279. kon and koff are shared by all curves; Rmax is shared by default.
 */

import type { ModelParameter } from './index';
import { fitNls, fitNlsMultiStart, nlsCi95 } from './nls';
import type { GlobalSeries } from './global';

export type ConcUnit = 'pM' | 'nM' | 'uM' | 'mM' | 'M';
const UNIT_TO_M: Record<ConcUnit, number> = { pM: 1e-12, nM: 1e-9, uM: 1e-6, mM: 1e-3, M: 1 };

export interface Sensorgram {
  label: string;
  /** Analyte concentration in M (undefined when the header carried no number). */
  conc?: number;
  t: number[];
  r: number[];
}

/**
 * Wide table: first column time, one column per concentration. Header cells like "12.5nM", "12.5 nM",
 * "6.25" (unit from `defaultUnit`) or "100 µM" give the concentration. Empty/NaN cells are skipped.
 */
export function parseSensorgrams(text: string, defaultUnit: ConcUnit = 'nM'): Sensorgram[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
  if (lines.length < 2) return [];
  const split = (l: string) => l.split(/[\t,;]|\s{2,}/).map(s => s.trim());
  let rows = lines.map(split);
  let header: string[] | null = null;
  if (Number.isNaN(Number(rows[0]![0]))) { header = rows[0]!; rows = rows.slice(1); }
  const nCols = Math.max(...rows.map(r => r.length));
  const curves: Sensorgram[] = [];
  for (let c = 1; c < nCols; c++) {
    const t: number[] = [], r: number[] = [];
    for (const row of rows) {
      const x = Number(row[0]), y = row[c] === undefined || row[c] === '' ? NaN : Number(row[c]);
      if (Number.isFinite(x) && Number.isFinite(y)) { t.push(x); r.push(y); }
    }
    if (t.length < 3) continue;
    const label = header?.[c] || `Curve ${c}`;
    const m = /^\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*(pM|nM|[uµμ]M|mM|M)?\s*$/.exec(label);
    let conc: number | undefined;
    if (m) {
      const unitRaw = (m[2] ?? defaultUnit).replace(/[µμ]/, 'u') as ConcUnit;
      conc = Number(m[1]) * UNIT_TO_M[unitRaw];
    }
    curves.push({ label, conc, t, r });
  }
  return curves;
}

export interface SprOptions {
  /** Start of association (default: first time point of each curve). */
  tAssocStart?: number;
  /** Injection stop / start of dissociation (required). */
  tDissStart: number;
  /** One Rmax for all curves (default true). When false each curve has its own Rmax. */
  globalRmax?: boolean;
  /** Fit a response offset per curve (default false: curves are assumed baseline-zeroed). */
  fitBaseline?: boolean;
}

export interface SprFit {
  parameters: ModelParameter[];
  series: GlobalSeries[];
  kon: number;
  koff: number;
  KD: number;
  /** Steady-state KD (M) from curves that reached equilibrium (≥ 4 needed); a cross-check, undefined otherwise. */
  KDsteadyState?: number;
  rmax: number[];
  sse: number;
  df: number;
  rmse: number;
  r2: number;
  notes: string[];
  converged: boolean;
}

function curveModel(t: number, C: number, kon: number, koff: number, rmax: number, r0: number, ta: number, td: number): number {
  const kobs = kon * C + koff;
  const req = (rmax * kon * C) / kobs;
  if (t <= td) return r0 + req * (1 - Math.exp(-kobs * Math.max(0, t - ta)));
  const rd = req * (1 - Math.exp(-kobs * Math.max(0, td - ta)));
  return r0 + rd * Math.exp(-koff * (t - td));
}

export function fitSprGlobal(curves: Sensorgram[], options: SprOptions): SprFit {
  const usable = curves.filter(c => c.conc !== undefined && c.conc > 0);
  if (usable.length < 2) throw new Error('Need at least two curves with analyte concentrations (put them in the column headers, e.g. "25 nM").');
  const td = options.tDissStart;
  for (const c of usable) {
    if (!c.t.some(t => t > td)) throw new Error(`Curve "${c.label}" has no points after the dissociation start (${td}).`);
    if (c.t.filter(t => t <= td).length < 4) throw new Error(`Curve "${c.label}" has fewer than 4 points in the association phase.`);
  }
  const globalR = options.globalRmax ?? true;
  const k = usable.length;
  const ta = (c: Sensorgram) => options.tAssocStart ?? c.t[0]!;
  const nRmax = globalR ? 1 : k;
  // p = [log10 kon, log10 koff, Rmax..., R0...]
  const iR = 2, iB = 2 + nRmax;
  const nP = 2 + nRmax + (options.fitBaseline ? k : 0);
  const rmaxOf = (p: number[], j: number) => p[iR + (globalR ? 0 : j)]!;
  const evalCurve = (p: number[], j: number, t: number) => curveModel(t, usable[j]!.conc!, 10 ** p[0]!, 10 ** p[1]!, rmaxOf(p, j), options.fitBaseline ? p[iB + j]! : 0, ta(usable[j]!), td);
  const ys = usable.flatMap(c => c.r);
  const predict = (p: number[]) => usable.flatMap((c, j) => c.t.map(t => evalCurve(p, j, t)));

  // Starting values.
  const top = usable.reduce((a, b) => (a.conc! > b.conc! ? a : b));
  const rTop = Math.max(...top.r);
  const dissTop = top.t.map((t, i) => ({ t, r: top.r[i]! })).filter(p => p.t > td);
  const rStart = dissTop[0]!.r, rEnd = dissTop[dissTop.length - 1]!.r;
  const spanT = dissTop[dissTop.length - 1]!.t - dissTop[0]!.t;
  const koffEst = rStart > rEnd * 1.05 && rEnd > 0 ? Math.log(rStart / rEnd) / spanT : 1 / Math.max(spanT, 1);
  const cMid = usable.map(c => c.conc!).sort((a, b) => a - b)[Math.floor(k / 2)]!;
  const starts: number[][] = [];
  for (const lk of [-1, 0, 1]) for (const lon of [4, 5, 6, 7]) {
    for (const rm of [1, 1.6]) {
      const p0 = [lon, Math.log10(koffEst) + lk * 0.5, ...new Array<number>(nRmax).fill(rTop * rm), ...(options.fitBaseline ? new Array<number>(k).fill(0) : [])];
      starts.push(p0);
    }
  }
  void cMid;
  const lower = [2, -7, ...new Array<number>(nRmax).fill(0), ...(options.fitBaseline ? new Array<number>(k).fill(-Infinity) : [])];
  const upper = [10, 1, ...new Array<number>(nRmax).fill(Infinity), ...(options.fitBaseline ? new Array<number>(k).fill(Infinity) : [])];
  let nls;
  if (!globalR || options.fitBaseline) {
    // Many parameters: solve the shared-Rmax, zero-baseline model first (cheap multi-start), then refine the
    // extended model from that solution instead of scanning dozens of starting points in 10+ dimensions.
    const base = fitSprGlobal(curves, { ...options, globalRmax: true, fitBaseline: false });
    const seed = [Math.log10(base.kon), Math.log10(base.koff), ...new Array<number>(nRmax).fill(base.rmax[0]!), ...(options.fitBaseline ? new Array<number>(k).fill(0) : [])];
    nls = fitNlsMultiStart({ predict, y: ys, p0: seed, lower, upper, maxIterations: 400 }, [seed]);
  } else {
    nls = fitNlsMultiStart({ predict, y: ys, p0: starts[0]!, lower, upper, maxIterations: 400 }, starts);
  }

  const p = nls.params;
  const kon = 10 ** p[0]!, koff = 10 ** p[1]!;
  const seLogKon = nls.se[0], seLogKoff = nls.se[1];
  const ciK = (idx: number, v: number) => { const r = nlsCi95(nls, idx); return r.ci95Low !== undefined ? { ci95Low: 10 ** r.ci95Low, ci95High: 10 ** r.ci95High! } : {}; void v; };
  const rmax = usable.map((_, j) => rmaxOf(p, j));
  const params: ModelParameter[] = [
    { name: 'Association rate constant', symbol: 'kon', unit: 'M⁻¹s⁻¹', value: kon, standardError: seLogKon !== undefined ? kon * Math.LN10 * seLogKon : undefined, ...ciK(0, kon), description: 'Shared by all curves (interval from log10 kon)' },
    { name: 'Dissociation rate constant', symbol: 'koff', unit: 's⁻¹', value: koff, standardError: seLogKoff !== undefined ? koff * Math.LN10 * seLogKoff : undefined, ...ciK(1, koff), description: 'Shared by all curves (interval from log10 koff)' },
    { name: 'Equilibrium dissociation constant', symbol: 'KD', unit: 'nM', value: (koff / kon) * 1e9, description: 'KD = koff / kon' },
    { name: 'Complex half-life', symbol: 't1/2', unit: 's', value: Math.LN2 / koff, description: 'ln 2 / koff' },
  ];
  if (globalR) params.push({ name: 'Maximal response', symbol: 'Rmax', value: rmax[0]!, standardError: nls.se[iR], ...nlsCi95(nls, iR), description: 'Response at full ligand saturation (shared)' });
  else rmax.forEach((v, j) => params.push({ name: `Rmax, ${usable[j]!.label}`, symbol: `Rmax${j + 1}`, value: v, standardError: nls.se[iR + j], ...nlsCi95(nls, iR + j), description: 'Per-curve maximal response' }));
  void nP;

  const series: GlobalSeries[] = usable.map((c, j) => {
    const predictT = (t: number) => evalCurve(p, j, t);
    return { id: `c${j}`, label: c.label, predict: predictT, points: c.t.map((t, i) => ({ x: t, y: c.r[i]!, yFit: predictT(t), residual: c.r[i]! - predictT(t) })) };
  });

  // Steady-state cross-check, only from curves whose association phase actually reached ≥ 95% of equilibrium.
  let KDss: number | undefined;
  const reached = usable.filter((c, j) => {
    const kobs = kon * c.conc! + koff;
    void j;
    return 1 - Math.exp(-kobs * (td - ta(c))) >= 0.95;
  });
  if (reached.length >= 4) {
    const reqEnd = reached.map(c => { const j = usable.indexOf(c); return { c: c.conc!, r: evalCurve(p, j, td) - (options.fitBaseline ? p[iB + j]! : 0) }; });
    try {
      const ss = fitNls({ predict: q => reqEnd.map(e => (q[0]! * e.c) / (q[1]! + e.c)), y: reqEnd.map(e => e.r), p0: [Math.max(...reqEnd.map(e => e.r)) * 1.5, cMid], lower: [0, 1e-14] });
      if (ss.converged && Number.isFinite(ss.params[1]!)) KDss = ss.params[1]!;
    } catch { /* cross-check is optional */ }
  }
  if (KDss !== undefined) params.push({ name: 'Steady-state KD (cross-check)', symbol: 'KD,ss', unit: 'nM', value: KDss * 1e9, description: 'Hyperbolic fit of the fitted end-of-association response vs concentration, from curves that reached ≥ 95% of equilibrium' });

  const notes: string[] = [];
  const concs = usable.map(c => c.conc!);
  const kdKin = koff / kon;
  if (Math.min(...concs) > kdKin * 3) notes.push('All concentrations are well above KD: the curves saturate and kon is poorly determined. Include concentrations around and below KD.');
  if (Math.max(...concs) < kdKin / 3) notes.push('All concentrations are well below KD: Rmax and KD are poorly determined. Include concentrations above KD.');
  const span = Math.max(...concs) / Math.min(...concs);
  if (span < 5) notes.push('The concentration series spans less than 5-fold; use a wider (typically 2- or 3-fold dilution, ≥ 5 points) series.');
  if (usable.length < 5) notes.push('Fewer than five concentrations: global fits are less well constrained.');
  if (KDss !== undefined && (KDss / kdKin > 2 || KDss / kdKin < 0.5)) notes.push('Kinetic and steady-state KD differ by more than 2-fold: check for mass transport, heterogeneity, or an incomplete association phase.');
  if (nls.se[0] === undefined || nls.se[1] === undefined) notes.push('The covariance is singular: kon and koff cannot be separated with these curves.');
  if (!nls.converged) notes.push('The optimiser did not fully converge.');
  notes.push('1:1 Langmuir model assumed. Systematic residuals that repeat across curves point to mass transport, a conformational change or heterogeneous binding; this tool does not fit those.');

  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sst = ys.reduce((a, v) => a + (v - mean) ** 2, 0);
  return { parameters: params, series, kon, koff, KD: kdKin, KDsteadyState: KDss, rmax, sse: nls.sse, df: nls.df, rmse: Math.sqrt(nls.sse / nls.df), r2: sst > 0 ? 1 - nls.sse / sst : 1, notes, converged: nls.converged };
}
