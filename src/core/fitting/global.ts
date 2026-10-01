/*
 * Global (multi-series) fits: enzyme inhibition with model comparison, and Morrison tight-binding.
 * Equations follow Cornish-Bowden, "Fundamentals of Enzyme Kinetics" (4th ed., 2012) and
 * Copeland, "Evaluation of Enzyme Inhibitors in Drug Discovery" (2nd ed., 2013); Morrison 1969
 * Biochim Biophys Acta 185:269. Model choice uses AICc (Burnham & Anderson 2002).
 */

import type { FittedPoint, ModelParameter } from './index';
import { aicc, fitNlsMultiStart, nlsCi95, type NlsResult } from './nls';

export interface GlobalSeries {
  id: string;
  label: string;
  points: FittedPoint[];
  predict: (x: number) => number;
}

export interface GlobalFitResult {
  modelName: string;
  equationStr: string;
  parameters: ModelParameter[];
  r2: number;
  adjR2: number;
  rmse: number;
  sse: number;
  df: number;
  n: number;
  aicc: number;
  series: GlobalSeries[];
  notes: string[];
  converged: boolean;
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

export interface InhibitionPoint { s: number; i: number; v: number }

/** Columns: [S], [I], v (optionally further columns = replicate velocities, each used as its own observation). */
export function parseInhibitionData(text: string): InhibitionPoint[] {
  const out: InhibitionPoint[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const parts = line.split(/[\t,;]+|\s{2,}|\s(?=[-+\d.])/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) continue;
    const nums = parts.map(Number);
    if (!Number.isFinite(nums[0]!) || !Number.isFinite(nums[1]!)) continue; // header line
    for (let c = 2; c < nums.length; c++) if (Number.isFinite(nums[c]!)) out.push({ s: nums[0]!, i: nums[1]!, v: nums[c]! });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Enzyme inhibition
// ---------------------------------------------------------------------------------------------

export type InhibitionModel = 'competitive' | 'uncompetitive' | 'noncompetitive' | 'mixed';

export interface ModelComparison {
  model: InhibitionModel;
  name: string;
  nParams: number;
  sse: number;
  aicc: number;
  deltaAicc: number;
  /** Akaike weight among the candidate models (sums to 1). */
  weight: number;
  converged: boolean;
}

export interface InhibitionAnalysis {
  best: InhibitionModel;
  fits: Record<InhibitionModel, GlobalFitResult>;
  comparison: ModelComparison[];
  /** Plain-language summary of the preferred mechanism and how decisive the data are. */
  summary: string;
}

const MODEL_NAMES: Record<InhibitionModel, string> = {
  competitive: 'Competitive inhibition',
  uncompetitive: 'Uncompetitive inhibition',
  noncompetitive: 'Non-competitive inhibition (α = 1)',
  mixed: 'Mixed inhibition',
};

const EQUATIONS: Record<InhibitionModel, string> = {
  competitive: 'v = Vmax·[S] / (Km·(1 + [I]/Ki) + [S])',
  uncompetitive: 'v = Vmax·[S] / (Km + [S]·(1 + [I]/Ki))',
  noncompetitive: 'v = Vmax·[S] / ((Km + [S])·(1 + [I]/Ki))',
  mixed: 'v = Vmax·[S] / (Km·(1 + [I]/Ki) + [S]·(1 + [I]/Ki′))',
};

/** Velocity for parameters p = [Vmax, Km, Ki, Ki′]; Ki′ is only used by the mixed model. */
export function inhibitionVelocity(model: InhibitionModel, s: number, i: number, p: number[]): number {
  const [vmax, km, ki, kip] = p as [number, number, number, number];
  switch (model) {
    case 'competitive': return (vmax * s) / (km * (1 + i / ki) + s);
    case 'uncompetitive': return (vmax * s) / (km + s * (1 + i / ki));
    case 'noncompetitive': return (vmax * s) / ((km + s) * (1 + i / ki));
    case 'mixed': return (vmax * s) / (km * (1 + i / ki) + s * (1 + i / kip));
  }
}

export function fitInhibitionModel(model: InhibitionModel, data: InhibitionPoint[]): GlobalFitResult {
  const n = data.length;
  const levels = [...new Set(data.map(d => d.i))].sort((a, b) => a - b);
  const nFree = model === 'mixed' ? 4 : 3;
  if (n <= nFree + 1) throw new Error(`Need more than ${nFree + 1} observations for the ${MODEL_NAMES[model].toLowerCase()} fit.`);
  if (levels.length < 2) throw new Error('Inhibition analysis needs at least two inhibitor concentrations (including 0).');
  if (data.some(d => d.s < 0 || d.i < 0)) throw new Error('Concentrations must be non-negative.');

  const y = data.map(d => d.v);
  const vmax0 = Math.max(...data.filter(d => d.i === levels[0]).map(d => d.v), 1e-9) * 1.2;
  const sVals = data.map(d => d.s).filter(v => v > 0);
  const km0 = sVals.length ? sVals.sort((a, b) => a - b)[Math.floor(sVals.length / 2)]! : 1;
  const iPos = levels.filter(v => v > 0);
  const ki0 = iPos.length ? iPos[Math.floor(iPos.length / 2)]! : 1;
  const predict = (p: number[]) => data.map(d => inhibitionVelocity(model, d.s, d.i, p));
  const lower = [1e-12, 1e-12, 1e-12, 1e-12];
  const starts: number[][] = [];
  for (const vm of [0.8, 1.2]) for (const km of [0.3, 1, 3]) for (const ki of [0.1, 1, 10]) for (const kp of model === 'mixed' ? [0.1, 1, 10] : [1]) {
    starts.push([vmax0 * vm, km0 * km, ki0 * ki, ki0 * kp]);
  }
  const nls = fitNlsMultiStart({ predict, y, p0: starts[0]!, lower, fixed: [false, false, false, model !== 'mixed'] }, starts);
  return packInhibition(model, data, nls, levels);
}

function packInhibition(model: InhibitionModel, data: InhibitionPoint[], nls: NlsResult, levels: number[]): GlobalFitResult {
  const n = data.length;
  const p = nls.params;
  const y = data.map(d => d.v);
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  const sst = y.reduce((a, v) => a + (v - meanY) ** 2, 0);
  const sMax = Math.max(...data.map(d => d.s));

  const series: GlobalSeries[] = levels.map(level => {
    const rows = data.filter(d => d.i === level);
    const predict = (s: number) => inhibitionVelocity(model, s, level, p);
    return {
      id: `I=${level}`, label: `[I] = ${level}`, predict,
      points: rows.map(d => ({ x: d.s, y: d.v, yFit: predict(d.s), residual: d.v - predict(d.s) })).sort((a, b) => a.x - b.x),
    };
  });
  void sMax;

  const params: ModelParameter[] = [
    { name: 'Maximal velocity', symbol: 'Vmax', value: p[0]!, standardError: nls.se[0], ...nlsCi95(nls, 0), description: 'Velocity at saturating substrate without inhibitor' },
    { name: 'Michaelis constant', symbol: 'Km', value: p[1]!, standardError: nls.se[1], ...nlsCi95(nls, 1), description: 'Substrate concentration at half Vmax without inhibitor' },
    { name: model === 'mixed' ? 'Inhibition constant (free enzyme), Ki' : 'Inhibition constant', symbol: 'Ki', value: p[2]!, standardError: nls.se[2], ...nlsCi95(nls, 2),
      description: model === 'uncompetitive' ? 'Dissociation constant of the inhibitor from the enzyme–substrate complex' : 'Dissociation constant of the inhibitor' },
  ];
  if (model === 'mixed') {
    params.push({ name: 'Inhibition constant (ES complex), Ki′', symbol: 'Ki′', value: p[3]!, standardError: nls.se[3], ...nlsCi95(nls, 3), description: 'Dissociation constant from the enzyme–substrate complex' });
    params.push({ name: 'Mixed-inhibition factor', symbol: 'α = Ki′/Ki', value: p[3]! / p[2]!, description: 'α ≫ 1 behaves competitively, α ≪ 1 uncompetitively, α = 1 non-competitively' });
  }
  const notes: string[] = [];
  if (!nls.converged) notes.push('The optimiser did not fully converge; treat the numbers with caution.');
  if (nls.se.some((s, i) => !nls.freeIndex.includes(i) ? false : s === undefined)) notes.push('Some parameters are not identifiable from these data (singular covariance): add more substrate or inhibitor levels.');
  if (nls.params[2]! > 1e4 * Math.max(...levels, 1e-12)) notes.push('Ki is far above the highest inhibitor concentration tested: the inhibitor barely acts, so Ki is only a lower bound.');

  return {
    modelName: MODEL_NAMES[model], equationStr: EQUATIONS[model], parameters: params,
    r2: sst > 0 ? Math.max(0, 1 - nls.sse / sst) : 1,
    adjR2: sst > 0 ? Math.max(0, 1 - (nls.sse / nls.df) / (sst / (n - 1))) : 1,
    rmse: Math.sqrt(nls.sse / nls.df), sse: nls.sse, df: nls.df, n,
    aicc: aicc(nls.sse, n, nls.nFree), series, notes, converged: nls.converged,
  };
}

/** Fit all four mechanisms to the same data and rank them by AICc. */
export function analyzeInhibition(data: InhibitionPoint[]): InhibitionAnalysis {
  const models: InhibitionModel[] = ['competitive', 'uncompetitive', 'noncompetitive', 'mixed'];
  const fits = {} as Record<InhibitionModel, GlobalFitResult>;
  for (const m of models) fits[m] = fitInhibitionModel(m, data);
  const minAicc = Math.min(...models.map(m => fits[m].aicc));
  const raw = models.map(m => Math.exp(-0.5 * (fits[m].aicc - minAicc)));
  const total = raw.reduce((a, b) => a + b, 0);
  const comparison: ModelComparison[] = models.map((m, k) => ({
    model: m, name: MODEL_NAMES[m], nParams: m === 'mixed' ? 4 : 3, sse: fits[m].sse, aicc: fits[m].aicc,
    deltaAicc: fits[m].aicc - minAicc, weight: raw[k]! / total, converged: fits[m].converged,
  })).sort((a, b) => a.aicc - b.aicc);
  const best = comparison[0]!;
  const second = comparison[1]!;
  const decisive = second.deltaAicc >= 4;
  const summary = decisive
    ? `${best.name} is clearly preferred (Akaike weight ${(best.weight * 100).toFixed(0)}%, ΔAICc to the next model ${second.deltaAicc.toFixed(1)}).`
    : `${best.name} fits best but ${second.name.toLowerCase()} is nearly as good (ΔAICc ${second.deltaAicc.toFixed(1)}): these data cannot distinguish the mechanisms; a wider substrate range or more inhibitor levels would help.`;
  return { best: best.model, fits, comparison, summary };
}

// ---------------------------------------------------------------------------------------------
// Morrison tight-binding inhibition
// ---------------------------------------------------------------------------------------------

export interface MorrisonOptions {
  /** Total active enzyme concentration (same units as [I]); fixed unless `fitEnzyme` is set. */
  enzymeConc: number;
  fitEnzyme?: boolean;
  /** For a competitive inhibitor: substrate and Km convert the apparent Ki to the true Ki: Ki = Ki,app / (1 + [S]/Km). */
  substrateConc?: number;
  km?: number;
}

/** Fractional activity v/v0 for total enzyme E, total inhibitor I and apparent Ki (Morrison 1969). */
export function morrisonFraction(E: number, I: number, kiApp: number): number {
  const b = E + I + kiApp;
  const root = Math.sqrt(Math.max(0, b * b - 4 * E * I));
  return E > 0 ? 1 - (b - root) / (2 * E) : 1;
}

export function fitMorrison(data: Array<{ x: number; y: number }>, options: MorrisonOptions): GlobalFitResult {
  const n = data.length;
  if (n < 5) throw new Error('Morrison fit requires at least 5 inhibitor concentrations.');
  if (!(options.enzymeConc > 0)) throw new Error('Enter the total active enzyme concentration (> 0).');
  const d = [...data].sort((a, b) => a.x - b.x);
  const ys = d.map(p => p.y);
  const v0 = Math.max(...ys) * 1.05;
  const half = d.find(p => p.y <= v0 / 2)?.x ?? d[Math.floor(n / 2)]!.x;
  const predict = (p: number[]) => d.map(pt => p[0]! * morrisonFraction(p[2]!, pt.x, p[1]!));
  const starts = [0.1, 1, 10].flatMap(k => [1, 0.5].map(e => [v0, Math.max(half * k, 1e-9), options.enzymeConc * e]));
  const nls = fitNlsMultiStart(
    { predict, y: ys, p0: [v0, Math.max(half, 1e-9), options.enzymeConc], lower: [-Infinity, 1e-12, 1e-12], fixed: [false, false, !options.fitEnzyme] },
    starts.map(s => (options.fitEnzyme ? s : [s[0]!, s[1]!, options.enzymeConc])),
  );
  const p = nls.params;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const sst = ys.reduce((a, v) => a + (v - meanY) ** 2, 0);
  const evalAt = (x: number) => p[0]! * morrisonFraction(p[2]!, x, p[1]!);
  const params: ModelParameter[] = [
    { name: 'Uninhibited rate', symbol: 'v0', value: p[0]!, standardError: nls.se[0], ...nlsCi95(nls, 0), description: 'Activity without inhibitor' },
    { name: 'Apparent inhibition constant', symbol: 'Ki,app', value: p[1]!, standardError: nls.se[1], ...nlsCi95(nls, 1), description: 'Dissociation constant under the assay conditions' },
    { name: 'Total active enzyme', symbol: '[E]t', value: p[2]!, standardError: nls.se[2], ...nlsCi95(nls, 2), description: options.fitEnzyme ? 'Fitted active-site concentration (titration)' : 'Fixed to the value entered' },
  ];
  const notes: string[] = [];
  if (options.substrateConc !== undefined && options.km !== undefined && options.km > 0) {
    params.push({ name: 'Ki for a competitive inhibitor', symbol: 'Ki', value: p[1]! / (1 + options.substrateConc / options.km), description: 'Ki,app / (1 + [S]/Km); valid only if the inhibitor is competitive' });
  } else {
    notes.push('Enter the substrate concentration and Km to convert Ki,app to Ki for a competitive inhibitor.');
  }
  if (p[1]! > 10 * options.enzymeConc) notes.push('Ki,app is well above the enzyme concentration, so tight-binding corrections are unnecessary: an ordinary IC50 or competitive fit would give the same Ki.');
  if (p[1]! < 0.01 * options.enzymeConc) notes.push('Ki,app is far below the enzyme concentration: the curve mainly titrates the enzyme, so Ki is poorly determined (only an upper bound).');
  if (!nls.converged) notes.push('The optimiser did not fully converge.');
  return {
    modelName: 'Morrison tight-binding inhibition',
    equationStr: 'v/v0 = 1 − [ (E+I+Ki) − √((E+I+Ki)² − 4EI) ] / (2E)',
    parameters: params, r2: sst > 0 ? Math.max(0, 1 - nls.sse / sst) : 1,
    adjR2: sst > 0 ? Math.max(0, 1 - (nls.sse / nls.df) / (sst / (n - 1))) : 1,
    rmse: Math.sqrt(nls.sse / nls.df), sse: nls.sse, df: nls.df, n, aicc: aicc(nls.sse, n, nls.nFree),
    series: [{ id: 'morrison', label: 'Fit', predict: evalAt, points: d.map(pt => ({ x: pt.x, y: pt.y, yFit: evalAt(pt.x), residual: pt.y - evalAt(pt.x) })) }],
    notes, converged: nls.converged,
  };
}
