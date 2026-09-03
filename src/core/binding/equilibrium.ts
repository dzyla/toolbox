/* Binding equilibria, thermodynamics and kinetics. Pure TypeScript, no DOM.
 *
 * Concentrations are in nM throughout (P1 = receptor/protein, P2 = ligand). For the single-step
 * n-mer model the overall Kd has units nM^n. Temperatures are °C at the API, K internally.
 * Kinetic rate constants use SI: kon in M⁻¹·s⁻¹, koff in s⁻¹, ligand in M.
 *
 * Models
 *   1:1            P + L ⇌ PL,   Kd = [P][L]/[PL]         Morrison 1969 closed form (mass balance quadratic)
 *   single-step    P1 + n·P2 ⇌ P1·(P2)n,  Kd = [P1][P2]^n/[complex]     bisection on the mass-balance polynomial
 *   stepwise Adair n identical sites with cooperativity α: the micro-Kd of step k is Kd·α^(k−1)
 *                  (α = 1 independent sites, α < 1 positive cooperativity, α > 1 negative);
 *                  binding polynomial Z = Σ βk·L^k, βk = Π_{j≤k} (n−j+1)/(j·Kd_j); species fraction k = βk·L^k / Z.
 */
export class BindingError extends Error {}

/** Molar gas constant, J·mol⁻¹·K⁻¹ (CODATA 2018, exact). */
export const R_GAS = 8.314462618;
/** Thermochemical calorie, J (exact definition). */
export const J_PER_CAL = 4.184;

const num = (x: number, name: string) => { if (!Number.isFinite(x)) throw new BindingError(`${name} must be a number`); };
const nonNeg = (x: number, name: string) => { num(x, name); if (x < 0) throw new BindingError(`${name} must be ≥ 0`); };
const pos = (x: number, name: string) => { num(x, name); if (!(x > 0)) throw new BindingError(`${name} must be > 0`); };
const intPos = (n: number, name: string) => { if (!Number.isInteger(n) || n < 1) throw new BindingError(`${name} must be an integer ≥ 1`); };

// ---------------------------------------------------------------------------------------------
// 1:1 and single-step n-mer
// ---------------------------------------------------------------------------------------------

/**
 * Complex concentration for P + L ⇌ PL with depletion (Morrison 1969).
 * x = [(P + L + Kd) − sqrt((P + L + Kd)² − 4PL)] / 2, evaluated in the cancellation-free form
 * x = 2PL / [(P + L + Kd) + sqrt((P + L + Kd)² − 4PL)] so weak binding (Kd ≫ P, L) keeps full precision.
 */
export function morrison(P: number, L: number, Kd: number): number {
  nonNeg(P, '[P] total'); nonNeg(L, '[L] total'); pos(Kd, 'Kd');
  if (P === 0 || L === 0) return 0;
  const b = P + L + Kd;
  return 2 * P * L / (b + Math.sqrt(b * b - 4 * P * L));
}

/**
 * Complex concentration x for P1 + n·P2 ⇌ P1·(P2)n by bisection on
 * f(x) = (P1 − x)(P2 − n·x)^n − Kd·x, which is strictly decreasing on [0, min(P1, P2/n)],
 * so the root is unique. Kd in nM^n. For n = 1 this reproduces the Morrison quadratic.
 */
export function solveSingleStep(P1: number, P2: number, Kd: number, n: number): number {
  nonNeg(P1, '[P1] total'); nonNeg(P2, '[P2] total'); pos(Kd, 'Kd'); intPos(n, 'n');
  if (P1 === 0 || P2 === 0) return 0;
  const f = (x: number) => (P1 - x) * Math.pow(P2 - n * x, n) - Kd * x;
  let lo = 0, hi = Math.min(P1, P2 / n);
  for (let i = 0; i < 200 && hi - lo > 1e-15 * hi; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export interface SingleStepResult {
  /** [P1·(P2)n] */ complex: number;
  p1Free: number; p2Free: number;
  /** Fraction of P1 in the complex. */ fractionBound: number;
  /** [P1·(P2)k] for k = 0..n: only k = 0 (free P1) and k = n (complex) exist in this model. */ concs: number[];
  probs: number[];
}

export function singleStep(P1: number, P2: number, Kd: number, n: number): SingleStepResult {
  const x = solveSingleStep(P1, P2, Kd, n);
  const p1Free = Math.max(0, P1 - x), p2Free = Math.max(0, P2 - n * x);
  const concs = Array<number>(n + 1).fill(0); concs[0] = p1Free; concs[n] = x;
  const probs = concs.map((c, k) => (P1 > 0 ? c / P1 : (k === 0 ? 1 : 0)));
  return { complex: x, p1Free, p2Free, fractionBound: P1 > 0 ? x / P1 : 0, concs, probs };
}

// ---------------------------------------------------------------------------------------------
// Stepwise Adair model with cooperativity
// ---------------------------------------------------------------------------------------------

export interface StepwiseResult {
  /** Free ligand [P2]free. */ L: number;
  /** Fractional saturation of sites, 0..1. */ theta: number;
  /** Fraction of P1 carrying exactly k ligands, k = 0..n. */ probs: number[];
  /** [P1·(P2)k] for k = 0..n. */ concs: number[];
  /** Average ligands per P1 = n·θ. */ boundSites: number;
  p1Free: number; anyBound: number; fullyBound: number;
}

/** Adair binding-polynomial coefficients βk for n identical sites, intrinsic site Kd and cooperativity α. */
export function adairCoefficients(Kd: number, n: number, alpha: number): number[] {
  pos(Kd, 'Kd'); intPos(n, 'n'); pos(alpha, 'α');
  const betas = [1];
  for (let k = 1; k <= n; k++) betas.push(betas[k - 1]! * ((n - k + 1) / k) / (Kd * Math.pow(alpha, k - 1)));
  return betas;
}

/** Species fractions at a given FREE ligand concentration. */
export function speciesAtFreeLigand(betas: number[], L: number): number[] {
  const terms = betas.map((b, k) => b * Math.pow(L, k));
  const Z = terms.reduce((a, b) => a + b, 0);
  return terms.map(t => t / Z);
}

/**
 * Stepwise binding of n identical sites on P1 with cooperativity α, solved exactly for the free
 * ligand by bisection on mass balance L + P·ν̄(L) − Ltot = 0 (left side strictly increasing in L,
 * bracket [0, Ltot]). α = 1 reduces to the binomial (independent sites) distribution.
 */
export function solveStepwise(P: number, Ltot: number, Kd: number, n: number, alpha = 1): StepwiseResult {
  nonNeg(P, '[P1] total'); nonNeg(Ltot, '[P2] total');
  const betas = adairCoefficients(Kd, n, alpha);
  const nuBar = (L: number) => { const p = speciesAtFreeLigand(betas, L); return p.reduce((a, pk, k) => a + k * pk, 0); };
  let L = Ltot;
  if (P > 0 && Ltot > 0) {
    let lo = 0, hi = Ltot;
    for (let i = 0; i < 200 && hi - lo > 1e-15 * Ltot; i++) {
      const mid = 0.5 * (lo + hi);
      if (mid + P * nuBar(mid) - Ltot > 0) hi = mid; else lo = mid;
    }
    L = 0.5 * (lo + hi);
  }
  const probs = speciesAtFreeLigand(betas, L);
  const concs = probs.map(p => p * P);
  const boundSites = probs.reduce((a, pk, k) => a + k * pk, 0);
  return { L, theta: boundSites / n, probs, concs, boundSites, p1Free: concs[0]!, anyBound: P * (1 - probs[0]!), fullyBound: concs[n]! };
}

// ---------------------------------------------------------------------------------------------
// Target occupancy solvers (exact, through the same models)
// ---------------------------------------------------------------------------------------------

export type TargetMode = 'any_bound' | 'fully_bound';

const checkFrac = (f: number) => { if (!(f > 0 && f < 1)) throw new BindingError('Target must be between 0 and 100 % (exclusive)'); };

/** Total P2 so that fraction f of P1 is in P1·(P2)n (single-step model). Closed form: [P2]free = (Kd·x/(P1−x))^(1/n), Ltot = n·x + [P2]free. */
export function targetLigandSingleStep(P1: number, Kd: number, n: number, frac: number): number {
  pos(P1, '[P1] total'); pos(Kd, 'Kd'); intPos(n, 'n'); checkFrac(frac);
  const x = frac * P1;
  return n * x + Math.pow(Kd * x / (P1 - x), 1 / n);
}

/**
 * Total P2 so that the fraction of P1 with ≥ 1 ligand ('any_bound') or with all n sites filled
 * ('fully_bound') equals frac, by bisection on Ltot through the exact stepwise solver.
 */
export function targetLigandStepwise(P: number, Kd: number, n: number, alpha: number, mode: TargetMode, frac: number): number {
  pos(P, '[P1] total'); checkFrac(frac);
  const got = (Ltot: number) => { const r = solveStepwise(P, Ltot, Kd, n, alpha); return mode === 'fully_bound' ? r.probs[n]! : 1 - r.probs[0]!; };
  let lo = 0, hi = Math.max(Kd, P, 1) * 10;
  for (let guard = 0; got(hi) < frac; guard++) { hi *= 4; if (guard > 60) throw new BindingError('Target not reachable'); }
  for (let i = 0; i < 200 && hi - lo > 1e-12 * hi; i++) { const mid = 0.5 * (lo + hi); if (got(mid) < frac) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------------------------------------
// Species table
// ---------------------------------------------------------------------------------------------

export interface SpeciesRow { k: number; fraction: number; conc_nM: number; mw_kDa: number | null; massConc_mg_per_mL: number | null }

/** Rows for k = 0..n with mass concentration when both molecular weights (kDa) are known. mg/mL = nM·1e-9 · kDa·1000. */
export function speciesTable(res: { probs: number[]; concs: number[] }, mwP1_kDa?: number, mwP2_kDa?: number): SpeciesRow[] {
  const haveMw = mwP1_kDa !== undefined && mwP2_kDa !== undefined && mwP1_kDa > 0 && mwP2_kDa >= 0;
  return res.probs.map((p, k) => {
    const mw = haveMw ? mwP1_kDa + k * mwP2_kDa : null;
    return { k, fraction: p, conc_nM: res.concs[k]!, mw_kDa: mw, massConc_mg_per_mL: mw === null ? null : res.concs[k]! * 1e-9 * mw * 1000 };
  });
}

// ---------------------------------------------------------------------------------------------
// Thermodynamics
// ---------------------------------------------------------------------------------------------

export interface DeltaG { kJ: number; kcal: number; T_K: number }

/** ΔG° = RT·ln(Kd/1 M) for a dissociation constant in nM at a temperature in °C. Negative for favourable binding. */
export function deltaG(kd_nM: number, tempC: number): DeltaG {
  pos(kd_nM, 'Kd'); num(tempC, 'Temperature');
  const T = tempC + 273.15;
  if (!(T > 0)) throw new BindingError('Temperature must be above absolute zero');
  const J = R_GAS * T * Math.log(kd_nM * 1e-9);
  return { kJ: J / 1000, kcal: J / J_PER_CAL / 1000, T_K: T };
}

/** Overall ΔG for P1 + n·P2 ⇌ P1·(P2)n with Kd in nM^n, plus the value per P2 equivalent. */
export function deltaGSingleStep(kd_nMpown: number, n: number, tempC: number): { total: DeltaG; perSite: DeltaG } {
  pos(kd_nMpown, 'Kd'); intPos(n, 'n');
  const total = deltaG(Math.pow(kd_nMpown, 1 / n), tempC); // ln(Kd·1e-9^n) = n·ln(Kd^(1/n)·1e-9)
  const scaled = { kJ: total.kJ * n, kcal: total.kcal * n, T_K: total.T_K };
  return { total: scaled, perSite: total };
}

/** Kd (nM) from ΔG° (kJ/mol) at a temperature in °C: Kd = exp(ΔG/RT). */
export function kdFromDeltaG(dG_kJ: number, tempC: number): number {
  num(dG_kJ, 'ΔG');
  return Math.exp(dG_kJ * 1000 / (R_GAS * (tempC + 273.15))) * 1e9;
}

/**
 * Cheng–Prusoff (1973): Ki = IC50 / (1 + [L]/Kd) for a COMPETITIVE inhibitor against ligand L at
 * concentration [L] with affinity Kd. [L] and Kd must share a unit; Ki has the unit of IC50.
 */
export function chengPrusoff(ic50: number, L: number, Kd: number): number {
  pos(ic50, 'IC50'); nonNeg(L, '[L]'); pos(Kd, 'Kd');
  return ic50 / (1 + L / Kd);
}

// ---------------------------------------------------------------------------------------------
// Titration series and Hill analysis
// ---------------------------------------------------------------------------------------------

export type Model = 'single_step' | 'stepwise';
export interface TitrationInput {
  model: Model; P1: number; Kd: number; n: number; alpha?: number;
  /** P2 total range in nM and number of points; log spacing needs start > 0. */
  start: number; end: number; points: number; log: boolean;
}
export interface Titration {
  /** Total P2 per point. */ Ltot: number[];
  /** Free P2 per point. */ Lfree: number[];
  /** Site saturation 0..1 per point. */ theta: number[];
  /** Σ k·[P1·(P2)k]: bound P2, the linear signal. */ boundSites: number[];
  /** [P1·(P2)n]: the threshold (fully bound) signal. */ fullyBound: number[];
  /** species[k][i] = [P1·(P2)k] at point i. */ species: number[][];
}

export function titrationGrid(start: number, end: number, points: number, log: boolean): number[] {
  nonNeg(start, 'Start'); pos(end, 'End');
  if (!Number.isInteger(points) || points < 2) throw new BindingError('Number of points must be an integer ≥ 2');
  if (log && !(start > 0)) throw new BindingError('Logarithmic spacing needs a start > 0');
  return Array.from({ length: points }, (_, i) => log ? start * Math.pow(end / start, i / (points - 1)) : start + (end - start) * i / (points - 1));
}

/** Titrate P2 against fixed P1 through the chosen model. */
export function titration(inp: TitrationInput): Titration {
  const { model, P1, Kd, n } = inp;
  const Ltot = titrationGrid(inp.start, inp.end, inp.points, inp.log);
  const species: number[][] = Array.from({ length: n + 1 }, () => []);
  const Lfree: number[] = [], theta: number[] = [], boundSites: number[] = [], fullyBound: number[] = [];
  const betas = model === 'stepwise' ? adairCoefficients(Kd, n, inp.alpha ?? 1) : null;
  for (const L of Ltot) {
    if (betas) {
      const r = solveStepwise(P1, L, Kd, n, inp.alpha ?? 1);
      Lfree.push(r.L); theta.push(r.theta); boundSites.push(r.boundSites * P1); fullyBound.push(r.fullyBound);
      r.concs.forEach((c, k) => species[k]!.push(c));
    } else {
      const r = singleStep(P1, L, Kd, n);
      Lfree.push(r.p2Free); theta.push(r.fractionBound); boundSites.push(n * r.complex); fullyBound.push(r.complex);
      r.concs.forEach((c, k) => species[k]!.push(c));
    }
  }
  return { Ltot, Lfree, theta, boundSites, fullyBound, species };
}

export interface HillPoint { L: number; theta: number; logL: number; logOdds: number }
export interface HillFit { points: HillPoint[]; slope: number; intercept: number; r2: number; used: number; lo: number; hi: number }

/**
 * Hill plot log(θ/(1−θ)) vs log[L]free and its slope nH by ordinary least squares over the points
 * with lo < θ < hi (default 0.1–0.9, where the linearisation is well conditioned). θ must be the
 * site saturation computed at the FREE ligand concentration; using total ligand under depletion
 * biases the slope. Slope 1 = non-cooperative; > 1 positive, < 1 negative cooperativity.
 */
export function hillSeries(Lfree: number[], theta: number[], lo = 0.1, hi = 0.9): HillFit {
  if (Lfree.length !== theta.length) throw new BindingError('Lfree and theta must have the same length');
  const points: HillPoint[] = [];
  for (let i = 0; i < Lfree.length; i++) {
    const L = Lfree[i]!, t = theta[i]!;
    if (L > 0 && t > 0 && t < 1) points.push({ L, theta: t, logL: Math.log10(L), logOdds: Math.log10(t / (1 - t)) });
  }
  const fitPts = points.filter(p => p.theta > lo && p.theta < hi);
  let slope = NaN, intercept = NaN, r2 = NaN;
  if (fitPts.length >= 2) {
    const m = fitPts.length;
    const mx = fitPts.reduce((a, p) => a + p.logL, 0) / m, my = fitPts.reduce((a, p) => a + p.logOdds, 0) / m;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of fitPts) { const dx = p.logL - mx, dy = p.logOdds - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (sxx > 0) { slope = sxy / sxx; intercept = my - slope * mx; r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1; }
  }
  return { points, slope, intercept, r2, used: fitPts.length, lo, hi };
}

// ---------------------------------------------------------------------------------------------
// Kinetics (pseudo-first-order, ligand in excess and constant)
// ---------------------------------------------------------------------------------------------

/** Kd (M) = koff / kon with kon in M⁻¹·s⁻¹ and koff in s⁻¹. */
export function kdFromRates(kon: number, koff: number): number { pos(kon, 'kon'); pos(koff, 'koff'); return koff / kon; }
/** Observed association rate kobs = kon·[L] + koff (s⁻¹), ligand in M. */
export function kObs(kon: number, koff: number, L_M: number): number { pos(kon, 'kon'); nonNeg(koff, 'koff'); nonNeg(L_M, '[L]'); return kon * L_M + koff; }
/** Half-time to reach equilibrium after mixing: t½ = ln 2 / (kon·[L] + koff). */
export function tHalfObs(kon: number, koff: number, L_M: number): number { return Math.LN2 / kObs(kon, koff, L_M); }
/** Dissociation half-life t½ = ln 2 / koff. */
export function tHalfDissociation(koff: number): number { pos(koff, 'koff'); return Math.LN2 / koff; }

export interface TimeCourse { t: number[]; fraction: number[] }

/** Fraction of receptor bound vs time from an empty start: θ(t) = θeq·(1 − e^(−kobs·t)), θeq = [L]/([L] + Kd). */
export function associationCourse(kon: number, koff: number, L_M: number, tMax: number, points = 100): TimeCourse {
  pos(tMax, 'Time span'); if (!Number.isInteger(points) || points < 2) throw new BindingError('points must be an integer ≥ 2');
  const k = kObs(kon, koff, L_M), thetaEq = L_M / (L_M + koff / kon);
  const t = Array.from({ length: points }, (_, i) => tMax * i / (points - 1));
  return { t, fraction: t.map(x => thetaEq * (1 - Math.exp(-k * x))) };
}
/** Fraction still bound after ligand is removed: e^(−koff·t). */
export function dissociationCourse(koff: number, tMax: number, points = 100): TimeCourse {
  pos(koff, 'koff'); pos(tMax, 'Time span'); if (!Number.isInteger(points) || points < 2) throw new BindingError('points must be an integer ≥ 2');
  const t = Array.from({ length: points }, (_, i) => tMax * i / (points - 1));
  return { t, fraction: t.map(x => Math.exp(-koff * x)) };
}

// ---------------------------------------------------------------------------------------------
// Bench helpers: mixing and serial dilution
// ---------------------------------------------------------------------------------------------

export interface MixInput { p1Total: number; p2Total: number; p1Stock: number; p2Stock: number; finalVolume: number }
export interface MixRecipe { v1: number; v2: number; buffer: number }

/** Volumes of each stock (same volume unit as finalVolume) to reach the totals; concentrations in one unit. */
export function mixRecipe(m: MixInput): MixRecipe {
  nonNeg(m.p1Total, '[P1] total'); nonNeg(m.p2Total, '[P2] total'); pos(m.p1Stock, 'P1 stock'); pos(m.p2Stock, 'P2 stock'); pos(m.finalVolume, 'Final volume');
  const v1 = m.p1Total / m.p1Stock * m.finalVolume, v2 = m.p2Total / m.p2Stock * m.finalVolume;
  const buffer = m.finalVolume - v1 - v2;
  if (buffer < -1e-9 * m.finalVolume) throw new BindingError(`Stocks too dilute: P1 needs ${v1.toPrecision(4)} and P2 ${v2.toPrecision(4)} of a ${m.finalVolume} final volume`);
  return { v1, v2, buffer: Math.max(0, buffer) };
}

export interface DilutionTube { tube: number; conc: number; recipe: string }
export interface DilutionPlan { factor: number; tubes: DilutionTube[] }

/** Dilution factor that spans high/low in a sensible number of tubes: 2 up to 50×, 3 up to 1000×, 10 beyond. */
export function autoDilutionFactor(high: number, low: number): number {
  const ratio = high / low;
  return ratio > 1000 ? 10 : ratio > 50 ? 3 : 2;
}

/**
 * Serial dilution from `high` down to about `low` with the given factor (auto if omitted). Tube 1 is
 * made from `stock` (same unit) when given. Each further tube: 1 volume of the previous + (factor − 1)
 * volumes of buffer. Stops after 20 tubes.
 */
export function serialDilutionPlan(o: { high: number; low: number; factor?: number; stock?: number; maxTubes?: number }): DilutionPlan {
  pos(o.high, 'Highest concentration'); pos(o.low, 'Lowest concentration');
  const high = Math.max(o.high, o.low), low = Math.min(o.high, o.low);
  const factor = o.factor ?? autoDilutionFactor(high, low);
  if (!(factor > 1)) throw new BindingError('Dilution factor must be > 1');
  let recipe1 = 'Prepare from stock';
  if (o.stock !== undefined && o.stock > 0) {
    const dil = o.stock / high;
    if (dil < 1 - 1e-9) recipe1 = 'Stock is too dilute for this concentration';
    else if (Math.abs(dil - 1) < 0.01) recipe1 = 'Use stock directly';
    else recipe1 = `1 part stock + ${(dil - 1).toPrecision(4)} parts buffer (${dil.toPrecision(4)}-fold)`;
  }
  const tubes: DilutionTube[] = [{ tube: 1, conc: high, recipe: recipe1 }];
  const maxTubes = o.maxTubes ?? 20;
  let current = high;
  while (current / factor >= low * 0.9 && tubes.length < maxTubes) {
    current /= factor;
    tubes.push({ tube: tubes.length + 1, conc: current, recipe: `1 vol tube ${tubes.length} + ${factor - 1} vol buffer (${factor}-fold)` });
  }
  return { factor, tubes };
}

// ---------------------------------------------------------------------------------------------
// Unit helpers specific to this tool: molar ↔ mass concentration through a molecular weight
// ---------------------------------------------------------------------------------------------

/** mg/mL → nM for a molecule of `mw_kDa`: (g/L) / (g/mol) × 1e9. */
export function massToNM(mg_per_mL: number, mw_kDa: number): number {
  nonNeg(mg_per_mL, 'Mass concentration');
  if (!(mw_kDa > 0)) throw new BindingError('Molecular weight must be > 0 to convert mass concentration');
  return mg_per_mL / (mw_kDa * 1000) * 1e9;
}
/** nM → mg/mL. */
export function nmToMass(nM: number, mw_kDa: number): number {
  if (!(mw_kDa > 0)) throw new BindingError('Molecular weight must be > 0 to convert to mass concentration');
  return nM * 1e-9 * mw_kDa * 1000;
}
