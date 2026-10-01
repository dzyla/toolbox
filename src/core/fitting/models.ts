/*
 * Additional single-series models fitted with Levenberg–Marquardt: Hill (cooperative binding) and
 * microbial / cell growth curves (modified Gompertz and logistic, Zwietering et al. 1990, Appl Environ
 * Microbiol 56:1875; Baranyi & Roberts 1994, Int J Food Microbiol 23:277).
 */

import type { DataPoint, FitModelType, FitResult, FittedPoint, ModelParameter } from './index';
import { fitNlsMultiStart, nlsCi95, type NlsResult } from './nls';

interface ParamSpec { index: number; name: string; symbol: string; unit?: string; description: string }

/** Build a FitResult (with SE of the fitted curve via the linearised covariance) from an NLS fit. */
export function buildFitResult(args: {
  modelType: FitModelType;
  modelName: string;
  equationStr: string;
  nls: NlsResult;
  data: DataPoint[];
  /** y in the scale that was fitted (for R²). */
  fitY: number[];
  /** Model value at x for parameter vector p, in the data's original scale. */
  evalAt: (x: number, p: number[]) => number;
  params: ParamSpec[];
  extra?: ModelParameter[];
  notes?: string[];
}): FitResult {
  const { nls, data, evalAt } = args;
  const n = data.length;
  const predict = (x: number) => evalAt(x, nls.params);
  const meanFit = args.fitY.reduce((a, b) => a + b, 0) / n;
  const sst = args.fitY.reduce((a, v) => a + (v - meanFit) ** 2, 0);
  const r2 = sst > 0 ? Math.max(0, 1 - nls.sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - (nls.sse / nls.df) / (sst / (n - 1))) : 1;

  const fittedPoints: FittedPoint[] = data.map(d => {
    const yFit = predict(d.x);
    let seFit: number | undefined;
    if (nls.covariance) {
      const g = nls.freeIndex.map(pi => {
        const h = 1e-6 * Math.max(Math.abs(nls.params[pi]!), 1e-3);
        const up = [...nls.params]; up[pi]! += h;
        const dn = [...nls.params]; dn[pi]! -= h;
        return (evalAt(d.x, up) - evalAt(d.x, dn)) / (2 * h);
      });
      let v = 0;
      for (let a = 0; a < g.length; a++) for (let b = 0; b < g.length; b++) v += g[a]! * nls.covariance[a]![b]! * g[b]!;
      seFit = v >= 0 ? Math.sqrt(v) : undefined;
    }
    return { x: d.x, y: d.y, yFit, seFit, residual: d.y - yFit };
  });

  const parameters: ModelParameter[] = args.params.map(sp => ({
    name: sp.name, symbol: sp.symbol, unit: sp.unit, description: sp.description,
    value: nls.params[sp.index]!, standardError: nls.se[sp.index], ...nlsCi95(nls, sp.index),
  }));
  if (args.extra) parameters.push(...args.extra);

  return {
    modelType: args.modelType, modelName: args.modelName, equationStr: args.equationStr, parameters,
    r2, adjR2, rmse: Math.sqrt(nls.sse / nls.df), sse: nls.sse, df: nls.df, predict, fittedPoints,
    ...(args.notes?.length ? { notes: args.notes } : {}),
  };
}

const sorted = (data: DataPoint[]) => [...data].sort((a, b) => a.x - b.x);

// ---------------------------------------------------------------------------------------------
// Hill equation
// ---------------------------------------------------------------------------------------------

/** y = Bmax·x^n / (K^n + x^n): specific binding with a Hill coefficient (K is the half-saturating concentration, K0.5). */
export function fitHill(data: DataPoint[]): FitResult {
  const d = sorted(data);
  const n = d.length;
  if (n < 4) throw new Error('Hill fit requires at least 4 points.');
  if (d.some(p => p.x < 0)) throw new Error('Hill fit needs non-negative x (concentration) values.');
  const ys = d.map(p => p.y);
  const maxY = Math.max(...ys);
  const half = d.reduce((best, p) => (Math.abs(p.y - maxY / 2) < Math.abs(best.y - maxY / 2) ? p : best), d[0]!);
  const k0 = Math.max(half.x, 1e-9);
  const evalAt = (x: number, p: number[]) => {
    if (x <= 0) return 0;
    const [bmax, K, h] = p;
    const t = Math.pow(x / Math.max(K!, 1e-12), h!);
    return (bmax! * t) / (1 + t);
  };
  const nls = fitNlsMultiStart(
    { predict: p => d.map(pt => evalAt(pt.x, p)), y: ys, p0: [maxY, k0, 1], lower: [-Infinity, 1e-12, 0.05], upper: [Infinity, Infinity, 20] },
    [maxY * 1.1, maxY * 1.5].flatMap(b => [0.7, 1, 2, 3].map(h => [b, k0, h])),
  );
  const [bmax, K, h] = nls.params;
  const notes = [
    'A Hill coefficient is an empirical steepness measure, not by itself proof of cooperativity or of the number of binding sites.',
    ...(h! > 15 ? ['The Hill coefficient is at the upper bound of the fit (20): the data look step-like.'] : []),
  ];
  return buildFitResult({
    modelType: 'hill', modelName: 'Hill Equation (specific binding)',
    equationStr: `y = ${bmax!.toFixed(3)} · x^${h!.toFixed(2)} / (${K!.toFixed(3)}^${h!.toFixed(2)} + x^${h!.toFixed(2)})`,
    nls, data: d, fitY: ys, evalAt, notes,
    params: [
      { index: 0, name: 'Maximum binding / response', symbol: 'Bmax', description: 'Plateau at saturating ligand' },
      { index: 1, name: 'Half-saturating concentration', symbol: 'K0.5', description: 'Ligand concentration giving half of Bmax' },
      { index: 2, name: 'Hill coefficient', symbol: 'n', description: 'Steepness; 1 = non-cooperative, >1 positive cooperativity (empirical)' },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// Growth curves
// ---------------------------------------------------------------------------------------------

export type GrowthModel = 'gompertz_growth' | 'logistic_growth' | 'baranyi_growth';

export interface GrowthOptions {
  /**
   * When true (default) the fit is done on ln(y / y_ref), y_ref = mean of the first (up to) 3 points, so µmax is a
   * specific growth rate (per time unit). When false the model is fitted to y directly and µmax is a maximum slope in y units.
   */
  logTransform?: boolean;
}

const E = Math.E;
export const gompertz = (t: number, A: number, mu: number, lag: number) => A * Math.exp(-Math.exp(((mu * E) / A) * (lag - t) + 1));
export const logistic = (t: number, A: number, mu: number, lag: number) => A / (1 + Math.exp(((4 * mu) / A) * (lag - t) + 2));
/** Baranyi & Roberts 1994 with ν = µ: ymax is the log-scale asymptote; h0 = ln(1 + 1/q0) = µ·λ (lag). */
export function baranyi(t: number, y0: number, ymax: number, mu: number, lag: number) {
  const h0 = mu * lag;
  const At = t + (1 / mu) * Math.log(Math.exp(-mu * t) + Math.exp(-h0) - Math.exp(-mu * t - h0));
  return y0 + mu * At - Math.log(1 + (Math.exp(mu * At) - 1) / Math.exp(ymax - y0));
}

const GROWTH_NAMES: Record<GrowthModel, string> = {
  gompertz_growth: 'Gompertz growth (Zwietering)',
  logistic_growth: 'Logistic growth (Zwietering)',
  baranyi_growth: 'Baranyi–Roberts growth',
};

export function fitGrowth(model: GrowthModel, data: DataPoint[], options: GrowthOptions = {}): FitResult {
  const d = sorted(data);
  const n = d.length;
  if (n < 6) throw new Error('Growth-curve fit requires at least 6 points.');
  const log = options.logTransform ?? true;
  const raw = d.map(p => p.y);
  let yRef = 1;
  if (log) {
    if (raw.some(v => !(v > 0))) throw new Error('Growth in ln scale needs strictly positive values (blank-correct or remove zero/negative readings, or switch off the ln transform).');
    yRef = raw.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, n);
  }
  const t = d.map(p => p.x);
  const z = raw.map(v => (log ? Math.log(v / yRef) : v));
  const zMin = Math.min(...z), zMax = Math.max(...z);
  const span = zMax - zMin;
  if (!(span > 0)) throw new Error('The curve is flat: nothing to fit.');

  // Initial slope and lag from the steepest part of a 3-point smoothed derivative.
  let bestSlope = 0, bestIdx = 0;
  for (let i = 1; i < n - 1; i++) {
    const s = (z[i + 1]! - z[i - 1]!) / (t[i + 1]! - t[i - 1]!);
    if (s > bestSlope) { bestSlope = s; bestIdx = i; }
  }
  bestSlope = Math.max(bestSlope, span / (t[n - 1]! - t[0]!));
  const lag0 = Math.max(0, t[bestIdx]! - (z[bestIdx]! - z[0]!) / bestSlope - t[0]!);
  const tt = t.map(v => v - t[0]!); // fit relative to the first time point
  const y0Fit = !log; // baseline offset is only fitted in raw scale

  let evalZ: (x: number, p: number[]) => number;
  let p0s: number[][];
  let lower: number[], upper: number[];
  let params: ParamSpec[];
  const mu0 = bestSlope;
  const base = (p: number[]) => (y0Fit ? p[3]! : 0);
  if (model === 'baranyi_growth') {
    // p = [y0, ymax, mu, lag]; y0 free in both scales (initial level).
    evalZ = (x, p) => baranyi(x, p[0]!, p[1]!, p[2]!, p[3]!);
    p0s = [0.7, 1, 1.4].flatMap(m => [0, 0.5, 1.5].map(l => [z[0]!, zMax * 1.02, mu0 * m, lag0 * l + 0.01]));
    lower = [-Infinity, -Infinity, 1e-9, 0]; upper = [Infinity, Infinity, Infinity, Infinity];
    params = [
      { index: 0, name: 'Initial level', symbol: log ? 'y0 (ln)' : 'y0', description: 'Model value at the first time point' },
      { index: 1, name: 'Upper asymptote', symbol: log ? 'ymax (ln)' : 'ymax', description: 'Plateau level in the fitted scale' },
      { index: 2, name: log ? 'Max specific growth rate' : 'Max growth rate', symbol: 'µmax', description: log ? 'Maximum specific growth rate (per time unit)' : 'Maximum slope in y units per time unit' },
      { index: 3, name: 'Lag time', symbol: 'λ', description: 'Time before exponential growth (h0 / µmax)' },
    ];
  } else {
    const f = model === 'gompertz_growth' ? gompertz : logistic;
    evalZ = (x, p) => base(p) + f(x, p[0]!, p[1]!, p[2]!);
    const p3 = (a: number, m: number, l: number) => (y0Fit ? [a, m, l, zMin] : [a, m, l]);
    p0s = [0.8, 1, 1.25].flatMap(a => [0.7, 1, 1.5].flatMap(m => [0, 1, 2].map(l => p3(span * a, mu0 * m, lag0 * l + 0.01))));
    lower = y0Fit ? [1e-9, 1e-9, 0, -Infinity] : [1e-9, 1e-9, 0];
    upper = y0Fit ? [Infinity, Infinity, Infinity, Infinity] : [Infinity, Infinity, Infinity];
    params = [
      { index: 0, name: 'Amplitude (asymptote − baseline)', symbol: log ? 'A (ln)' : 'A', description: 'Total increase from baseline to plateau in the fitted scale' },
      { index: 1, name: log ? 'Max specific growth rate' : 'Max growth rate', symbol: 'µmax', description: log ? 'Maximum specific growth rate (per time unit)' : 'Maximum slope in y units per time unit' },
      { index: 2, name: 'Lag time', symbol: 'λ', description: 'x-intercept of the tangent at the steepest point' },
      ...(y0Fit ? [{ index: 3, name: 'Baseline', symbol: 'y0', description: 'Offset at the start' }] : []),
    ];
  }
  const nParam = lower.length;
  const nls = fitNlsMultiStart(
    { predict: p => tt.map(x => evalZ(x, p)), y: z, p0: p0s[0]!, lower, upper, maxIterations: 400 },
    p0s.map(p => p.slice(0, nParam)),
  );
  const toOrig = (zz: number) => (log ? yRef * Math.exp(zz) : zz);
  const evalAt = (x: number, p: number[]) => toOrig(evalZ(x - t[0]!, p));

  const muIdx = model === 'baranyi_growth' ? 2 : 1;
  const mu = nls.params[muIdx]!;
  const extra: ModelParameter[] = [];
  if (log) {
    extra.push({ name: 'Doubling time', symbol: 'Td', value: Math.LN2 / mu, description: 'ln 2 / µmax at the fastest growth' });
    const top = model === 'baranyi_growth' ? nls.params[1]! : nls.params[0]!;
    extra.push({ name: 'Plateau (original units)', symbol: 'ymax', value: toOrig(top), description: 'Upper asymptote converted back from the ln scale' });
  }
  const notes = [
    `Fitted on the ${log ? `ln(y / ${yRef.toPrecision(4)}) scale; R², SSE and residual df refer to that scale` : 'original scale'}. Time is measured from the first point (x = ${t[0]}).`,
    'These are empirical growth models (Zwietering et al. 1990; Baranyi & Roberts 1994): µmax and λ depend on the model chosen and on the time resolution of the data.',
    ...(nls.converged ? [] : ['The optimiser did not fully converge; check the starting region and the data.']),
  ];
  const y0txt = y0Fit ? 'y0 + ' : '';
  const eq = model === 'baranyi_growth'
    ? 'y = y0 + µ·A(t) − ln(1 + (e^{µ·A(t)} − 1)/e^{ymax − y0}), A(t) = t + ln(e^{−µt} + e^{−µλ} − e^{−µ(t+λ)})/µ'
    : model === 'gompertz_growth'
      ? `y = ${y0txt}A·exp(−exp(µmax·e/A·(λ − t) + 1))`
      : `y = ${y0txt}A / (1 + exp(4·µmax/A·(λ − t) + 2))`;
  const result = buildFitResult({
    modelType: model, modelName: GROWTH_NAMES[model], equationStr: eq, nls, data: d, fitY: z, evalAt, params, extra, notes,
  });
  // Observations in original units are already in data; residuals are in original units from buildFitResult.
  return result;
}
