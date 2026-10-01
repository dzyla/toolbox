/*
 * Isothermal titration calorimetry: one set of identical, independent sites.
 * Heat per injection follows Wiseman et al. 1989, Anal Biochem 179:131, with the fixed-cell-volume
 * (overflow) displacement correction used by MicroCal Origin ITC software:
 *   Q_i = (n·Mt_i·ΔH·V0/2)·[1 + Xt_i/(n·Mt_i) + 1/(n·K·Mt_i) − √((1 + Xt_i/(n·Mt_i) + 1/(n·K·Mt_i))² − 4·Xt_i/(n·Mt_i))]
 *   ΔQ_i = Q_i + (dV_i/V0)·(Q_i + Q_{i−1})/2 − Q_{i−1}
 * Wiseman's c-value: c = n·K·Mt (Wiseman 1989; Turnbull & Daranas 2003 J Am Chem Soc 125:14859).
 */

import { aicc, fitNlsMultiStart, nlsCi95 } from './nls';
import type { ModelParameter } from './index';

export const GAS_CONSTANT_CAL = 1.987204; // cal mol⁻¹ K⁻¹ (CODATA 2018: 8.314462618 J/(mol K) / 4.184)

export type HeatUnit = 'ucal' | 'uJ' | 'kcal/mol';

export interface ItcExperiment {
  /** Cell volume, µL (active volume of the instrument; e.g. 1400 for VP-ITC, ~200 for iTC200, 190 for PEAQ). */
  cellVolumeUl: number;
  /** Macromolecule concentration in the cell at the start, µM. */
  cellConcUm: number;
  /** Ligand concentration in the syringe, µM. */
  syringeConcUm: number;
  temperatureC: number;
  /** Per-injection volumes, µL. */
  volumesUl: number[];
  /** Per-injection measured heats (integrated peaks) in `heatUnit`. */
  heats: number[];
  heatUnit: HeatUnit;
}

export interface ItcOptions {
  /** Fit a constant heat added to every injection (heat of dilution); in µcal. Default false. */
  fitOffset?: boolean;
  /** Fix the stoichiometry n (use when c is low or the active concentration is uncertain). */
  fixedN?: number;
  /** Leave out the first injection (commonly an inaccurate small priming injection). */
  skipFirst?: boolean;
}

export interface ItcInjection {
  index: number;
  molarRatio: number;
  /** Heat per mole of injectant, kcal/mol. */
  observed: number;
  fitted: number;
  residual: number;
  excluded: boolean;
}

export interface ItcFit {
  parameters: ModelParameter[];
  injections: ItcInjection[];
  n: number;
  /** Association constant, M⁻¹. */
  K: number;
  KD: number;
  /** kcal/mol */
  deltaH: number;
  deltaG: number;
  minusTdeltaS: number;
  /** cal/(mol K) */
  deltaS: number;
  cValue: number;
  /** cal² */
  sse: number;
  df: number;
  /** Root-mean-square residual per injection, µcal. */
  rmse: number;
  notes: string[];
  converged: boolean;
  aicc: number;
}

const UL_TO_L = 1e-6;
const UM_TO_M = 1e-6;
const J_PER_CAL = 4.184;

/** Heat per injection (cal) for given n, K (M⁻¹), ΔH (cal/mol), offset (cal). Returns also bulk Xt/Mt per injection. */
export function itcHeats(
  exp: Pick<ItcExperiment, 'cellVolumeUl' | 'cellConcUm' | 'syringeConcUm' | 'volumesUl'>,
  n: number, K: number, dH: number, offsetCal = 0,
): { dQ: number[]; Xt: number[]; Mt: number[] } {
  const V0 = exp.cellVolumeUl * UL_TO_L;
  let Mt = exp.cellConcUm * UM_TO_M;
  let Xt = 0;
  let Qprev = 0;
  const dQ: number[] = [], XtOut: number[] = [], MtOut: number[] = [];
  for (const dVul of exp.volumesUl) {
    const dV = dVul * UL_TO_L;
    const f = dV / (2 * V0);
    Mt = (Mt * (1 - f)) / (1 + f);
    Xt = (Xt * (1 - f)) / (1 + f) + (exp.syringeConcUm * UM_TO_M * dV / V0) / (1 + f);
    const r = Xt / (n * Mt);
    const b = 1 + r + 1 / (n * K * Mt);
    const Q = ((n * Mt * dH * V0) / 2) * (b - Math.sqrt(Math.max(0, b * b - 4 * r)));
    dQ.push(Q + (dV / V0) * ((Q + Qprev) / 2) - Qprev + offsetCal);
    XtOut.push(Xt); MtOut.push(Mt);
    Qprev = Q;
  }
  return { dQ, Xt: XtOut, Mt: MtOut };
}

function toCal(value: number, unit: HeatUnit, molInjected: number): number {
  if (unit === 'ucal') return value * 1e-6;
  if (unit === 'uJ') return (value * 1e-6) / J_PER_CAL;
  return value * 1000 * molInjected; // kcal/mol injectant → cal
}

export function fitItcOneSite(exp: ItcExperiment, options: ItcOptions = {}): ItcFit {
  const nInj = exp.volumesUl.length;
  if (exp.heats.length !== nInj) throw new Error('Each injection needs a volume and a heat.');
  if (nInj < 8) throw new Error('ITC fit needs at least 8 injections.');
  if (!(exp.cellVolumeUl > 0 && exp.cellConcUm > 0 && exp.syringeConcUm > 0)) throw new Error('Cell volume, cell concentration and syringe concentration must be positive.');
  if (exp.volumesUl.some(v => !(v > 0))) throw new Error('Injection volumes must be positive.');
  if (exp.heats.some(h => !Number.isFinite(h))) throw new Error('Heats must be numbers.');
  if (options.fixedN !== undefined && !(options.fixedN > 0)) throw new Error('A fixed stoichiometry must be positive.');

  const T = exp.temperatureC + 273.15;
  const V0 = exp.cellVolumeUl * UL_TO_L;
  const molInj = exp.volumesUl.map(v => v * UL_TO_L * exp.syringeConcUm * UM_TO_M);
  const observedCal = exp.heats.map((h, i) => toCal(h, exp.heatUnit, molInj[i]!));
  const used = observedCal.map((_, i) => !(options.skipFirst && i === 0));
  const idx = used.map((u, i) => (u ? i : -1)).filter(i => i >= 0);
  if (idx.length < 6) throw new Error('Too few injections left to fit.');

  // Starting values: ΔH from the first (largest-heat) injection, n from where the heat drops to half, K scanned.
  const perMol = observedCal.map((q, i) => q / molInj[i]!); // cal per mol of injectant
  const start = idx[0]!;
  const dH0 = perMol[start]!;
  const Mt0 = exp.cellConcUm * UM_TO_M;
  const cumX = exp.volumesUl.map((_, i) => exp.volumesUl.slice(0, i + 1).reduce((a, b) => a + b, 0) * UL_TO_L * exp.syringeConcUm * UM_TO_M / V0);
  const halfIdx = idx.find(i => Math.abs(perMol[i]!) < Math.abs(dH0) / 2) ?? idx[Math.floor(idx.length / 2)]!;
  const n0 = options.fixedN ?? Math.min(20, Math.max(0.1, cumX[halfIdx]! / Mt0));

  // Parameters: [n, log10 K, ΔH (cal/mol), offset (cal)]
  const predict = (p: number[]) => {
    const { dQ } = itcHeats(exp, p[0]!, 10 ** p[1]!, p[2]!, p[3]!);
    return idx.map(i => dQ[i]!);
  };
  const y = idx.map(i => observedCal[i]!);
  // Weight so each injection counts by its heat per mole (cal → µcal scale keeps the numbers well conditioned).
  const scale = 1e6;
  const fixed = [options.fixedN !== undefined, false, false, !options.fitOffset];
  const starts: number[][] = [];
  for (const lk of [4, 5, 6, 7, 8]) for (const nm of [0.7, 1, 1.4]) starts.push([options.fixedN ?? n0 * nm, lk, dH0, 0]);
  const nls = fitNlsMultiStart(
    {
      predict: p => predict(p).map(v => v * scale), y: y.map(v => v * scale), p0: starts[0]!,
      lower: [0.01, 0, -1e7, -1e-3], upper: [100, 12, 1e7, 1e-3], fixed,
    },
    starts,
  );
  // nls params are in the scaled problem but parameters themselves are unscaled (only y was scaled).
  const [n, log10K, dH, offset] = nls.params as [number, number, number, number];
  const K = 10 ** log10K;
  const fittedCal = itcHeats(exp, n, K, dH, offset).dQ;
  const base = itcHeats(exp, n, K, dH, 0);
  const off = options.fitOffset ? offset : 0;
  const injections: ItcInjection[] = exp.volumesUl.map((_, i) => {
    const observed = (observedCal[i]! - off) / molInj[i]! / 1000;
    const fitted = (fittedCal[i]! - off) / molInj[i]! / 1000;
    return { index: i + 1, molarRatio: base.Xt[i]! / base.Mt[i]!, observed, fitted, residual: observed - fitted, excluded: !used[i] };
  });

  const dG = -GAS_CONSTANT_CAL * T * Math.log(K);
  const c = n * K * Mt0;
  // Standard error of K from log10 K: SE(K) = K·ln10·SE(log10 K).
  const seLog = nls.se[1];
  const params: ModelParameter[] = [
    { name: 'Stoichiometry', symbol: 'n', value: n, standardError: nls.se[0], ...nlsCi95(nls, 0), description: options.fixedN !== undefined ? 'Fixed by the user' : 'Binding sites per macromolecule' },
    { name: 'Association constant', symbol: 'K', unit: 'M⁻¹', value: K, standardError: seLog !== undefined ? K * Math.LN10 * seLog : undefined,
      ...(seLog !== undefined ? (() => { const r = nlsCi95(nls, 1); return { ci95Low: 10 ** r.ci95Low!, ci95High: 10 ** r.ci95High! }; })() : {}), description: 'K = 1/KD (interval from log10 K)' },
    { name: 'Dissociation constant', symbol: 'KD', unit: 'µM', value: (1 / K) * 1e6, description: 'KD = 1/K' },
    { name: 'Enthalpy', symbol: 'ΔH', unit: 'kcal/mol', value: dH / 1000, standardError: nls.se[2] !== undefined ? nls.se[2]! / 1000 : undefined, ...(nls.se[2] !== undefined ? { ci95Low: nlsCi95(nls, 2).ci95Low! / 1000, ci95High: nlsCi95(nls, 2).ci95High! / 1000 } : {}), description: 'Heat of binding per mole of complex' },
    { name: 'Gibbs free energy', symbol: 'ΔG', unit: 'kcal/mol', value: dG / 1000, description: `−RT·ln K at ${exp.temperatureC} °C (1 M standard state)` },
    { name: '−T·ΔS', symbol: '−TΔS', unit: 'kcal/mol', value: (dG - dH) / 1000, description: 'ΔG − ΔH' },
    { name: 'Entropy', symbol: 'ΔS', unit: 'cal/(mol·K)', value: (dH - dG) / T, description: '(ΔH − ΔG)/T' },
    { name: "Wiseman c-value", symbol: 'c', value: c, description: 'n·K·[M]cell; 1 < c < 1000 gives a well-defined K' },
  ];
  if (options.fitOffset) params.push({ name: 'Heat offset', symbol: 'offset', unit: 'µcal', value: offset * 1e6, standardError: nls.se[3] !== undefined ? nls.se[3]! * 1e6 : undefined, description: 'Constant heat per injection (heat of dilution)' });

  const notes: string[] = [];
  if (c < 1) notes.push('c < 1: the isotherm is nearly featureless, so K and ΔH are strongly correlated. Fix n from independent knowledge (active concentration) for a defensible K.');
  if (c > 1000) notes.push('c > 1000: the transition is too sharp to measure K; n and ΔH are reliable but K is only a lower bound. Lower the cell concentration.');
  if (nls.se[1] === undefined && options.fixedN === undefined) notes.push('The covariance is singular: n, K and ΔH cannot be separated with these data.');
  const lastRatio = injections[injections.length - 1]!.molarRatio;
  if (lastRatio < 1.5 * n) notes.push(`The titration ends at a molar ratio of ${lastRatio.toFixed(2)}, before saturation of n = ${n.toFixed(2)}: extend the titration past about 2× the stoichiometry.`);
  if (!options.skipFirst && exp.volumesUl[0]! < Math.min(...exp.volumesUl.slice(1)) * 0.8) notes.push('The first injection is smaller than the rest; it is usually inaccurate. Consider skipping it.');
  if (!nls.converged) notes.push('The optimiser did not fully converge.');

  const sse = nls.sse / (scale * scale);
  return {
    parameters: params, injections, n, K, KD: 1 / K, deltaH: dH / 1000, deltaG: dG / 1000, minusTdeltaS: (dG - dH) / 1000,
    deltaS: (dH - dG) / T, cValue: c, sse, df: nls.df, rmse: Math.sqrt(sse / nls.df) * 1e6, notes, converged: nls.converged,
    aicc: aicc(nls.sse, idx.length, nls.nFree),
  };
}

/**
 * Reads injection data: one column = heats (volume taken from `defaultVolumeUl`), two columns = volume (µL) and heat,
 * three columns = injection number, volume and heat. A header line, comments (#) and blank lines are skipped.
 */
export function parseItcInjections(text: string, defaultVolumeUl: number): { volumesUl: number[]; heats: number[] } {
  const rows: number[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const parts = line.split(/[\t,;]+|\s+/).filter(Boolean);
    const nums = parts.map(Number);
    if (nums.some(n => !Number.isFinite(n))) { if (rows.length === 0) continue; throw new Error(`Cannot read the line "${line}" as numbers.`); }
    rows.push(nums);
  }
  if (rows.length === 0) return { volumesUl: [], heats: [] };
  const width = rows[0]!.length;
  if (width > 3 || rows.some(r => r.length !== width)) throw new Error('Use one column (heat), two columns (volume, heat) or three columns (injection, volume, heat), with the same number of columns on every line.');
  if (width === 1) return { volumesUl: rows.map(() => defaultVolumeUl), heats: rows.map(r => r[0]!) };
  if (width === 2) return { volumesUl: rows.map(r => r[0]!), heats: rows.map(r => r[1]!) };
  return { volumesUl: rows.map(r => r[1]!), heats: rows.map(r => r[2]!) };
}
