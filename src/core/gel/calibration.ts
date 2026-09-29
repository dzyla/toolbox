/* Molecular-weight calibration: log10(size) as a function of migration (y, px along the lane).
 * Models: linear (log-linear, the classic semi-log plot), piecewise linear between ladder bands, monotone piecewise cubic Hermite
 * (Fritsch & Carlson 1980, SIAM J Numer Anal 17:238). Size at any y is 10^f(y).
 * Reference for the log-linear relation: Weber & Osborn 1969, J Biol Chem 244:4406 (SDS-PAGE); Helling, Goodman &
 * Boyer 1974, J Virol 14:1235 (DNA fragments in agarose). */
import { GelInputError } from './types';

export type CalibrationModel = 'linear' | 'piecewise' | 'monotone';
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

/** Monotone piecewise cubic Hermite interpolant (Fritsch–Carlson); linear extrapolation with the end slopes. */
function monotoneCubic(p: CalibrationPoint[]): (y: number) => number {
  const n = p.length;
  if (n < 3) return piecewise(p);
  const x = p.map(q => q.y), a = p.map(q => Math.log10(q.size));
  const h = Array.from({ length: n - 1 }, (_, i) => x[i + 1]! - x[i]!);
  const dlt = Array.from({ length: n - 1 }, (_, i) => (a[i + 1]! - a[i]!) / h[i]!);
  const m = new Array<number>(n);
  m[0] = dlt[0]!; m[n - 1] = dlt[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = dlt[i - 1]! * dlt[i]! <= 0 ? 0 : (dlt[i - 1]! + dlt[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (dlt[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const al = m[i]! / dlt[i]!, be = m[i + 1]! / dlt[i]!;
    const s = al * al + be * be;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * al * dlt[i]!; m[i + 1] = t * be * dlt[i]!; }
  }
  return (y: number) => {
    if (y <= x[0]!) return a[0]! + m[0]! * (y - x[0]!);
    if (y >= x[n - 1]!) return a[n - 1]! + m[n - 1]! * (y - x[n - 1]!);
    let i = 0;
    while (i < n - 2 && y > x[i + 1]!) i++;
    const t = (y - x[i]!) / h[i]!, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a[i]! + (t3 - 2 * t2 + t) * h[i]! * m[i]! + (-2 * t3 + 3 * t2) * a[i + 1]! + (t3 - t2) * h[i]! * m[i + 1]!;
  };
}

export function fitCalibration(points: CalibrationPoint[], model: CalibrationModel = 'linear'): Calibration {
  const p = sorted(points);
  const need = model === 'monotone' ? 3 : 2;
  if (p.length < need) throw new GelInputError(`The ${model} model needs at least ${need} ladder bands (have ${p.length})`);
  const f = model === 'linear' ? linearFit(p) : model === 'piecewise' ? piecewise(p) : monotoneCubic(p);
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

/** Human-readable size with the right unit: kDa for protein, bp/kb for DNA. */
export function formatSize(size: number, kind: 'protein' | 'dna'): string {
  if (!Number.isFinite(size) || size <= 0) return '–';
  if (kind === 'protein') return `${size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)} kDa`;
  return size >= 1000 ? `${(size / 1000).toFixed(size >= 10000 ? 1 : 2)} kb` : `${size.toFixed(0)} bp`;
}

/* =========================================================================
   Densitometric Mass Calibration
   Quantitative relationship between integrated optical density / net band
   signal (OD · px) and known absolute mass (ng, µg, pmol, etc.).
   Supports linear, linear through origin (no intercept), quadratic (film/detector curvature),
   and power law / allometric fits.
   ========================================================================= */

export type MassCalibrationModel = 'linear' | 'linear_zero' | 'quadratic' | 'power';

export interface MassCalibrationPoint {
  bandId: string;
  laneId?: string;
  laneIdx?: number;
  netIntensity: number; // integrated optical density (net signal)
  knownMass: number;    // mass in specified unit (e.g. ng)
  unit?: string;
}

export interface MassCalibrationResidual {
  netIntensity: number;
  knownMass: number;
  fittedMass: number;
  residual: number;
  fraction: number;
}

export interface MassCalibration {
  model: MassCalibrationModel;
  points: MassCalibrationPoint[];
  unit: string;
  r2: number;
  formula: string;
  massAt(netIntensity: number): number;
  residuals: MassCalibrationResidual[];
  /** Signal and mass span of the standards; anything outside is extrapolation. */
  range: { minMass: number; maxMass: number; minNet: number; maxNet: number };
  /**
   * Residual SD of the fit in mass units (df = n − parameters); null with < 3 standards or no residual df.
   * This is σ in ICH Q2(R1) §6.3/7.3 and equals σ_net/slope for linear models.
   */
  residualSD: number | null;
  /** Limit of detection, 3.3·σ (mass units). */
  lod: number | null;
  /** Limit of quantitation, 10·σ (mass units). */
  loq: number | null;
  coefficients: {
    slope?: number;
    intercept?: number;
    a?: number;
    b?: number;
    c?: number;
  };
}

export interface MassLadderPreset {
  id: string;
  name: string;
  kind: 'protein' | 'dna';
  masses: number[];
  unit: string;
  description?: string;
}

export const MASS_STANDARD_PRESETS: MassLadderPreset[] = [
  {
    id: 'invitrogen-low-dna',
    name: 'Invitrogen Low DNA Mass Ladder (ng)',
    kind: 'dna',
    masses: [2000, 1200, 800, 400, 200, 100],
    unit: 'ng',
    description: '6 discrete bands from 100 ng to 2,000 ng for mass quantification',
  },
  {
    id: 'neb-1kb-plus',
    name: 'NEB 1kb Plus DNA Ladder (0.5 µg load, ng)',
    kind: 'dna',
    masses: [40, 40, 40, 40, 120, 40, 40, 40, 40, 40, 120, 40],
    unit: 'ng',
    description: 'Standard 0.5 µg loading with 120 ng indicator bands at 3 kb & 0.5 kb',
  },
  {
    id: 'bsa-dilution-series',
    name: 'BSA Standard Dilution Series (ng)',
    kind: 'protein',
    masses: [2000, 1000, 500, 250, 125, 50, 25],
    unit: 'ng',
    description: 'Bovine Serum Albumin standard curve for Coomassie / Silver densitometry',
  },
  {
    id: 'two-fold-dilution',
    name: '2-Fold Serial Dilution (1000 to 31.25 ng)',
    kind: 'protein',
    masses: [1000, 500, 250, 125, 62.5, 31.25],
    unit: 'ng',
    description: 'Standard two-fold quantitative standard series',
  },
];

/**
 * Fits a densitometric mass standard curve to relate integrated optical density / net volume
 * to known molecular mass (ng / µg).
 */
export function fitMassCalibration(
  points: MassCalibrationPoint[],
  model: MassCalibrationModel = 'linear',
  unit = 'ng'
): MassCalibration {
  const valid = points
    .filter(p => Number.isFinite(p.netIntensity) && Number.isFinite(p.knownMass) && p.knownMass > 0)
    .sort((a, b) => a.netIntensity - b.netIntensity);

  const minPts = model === 'quadratic' ? 3 : model === 'linear_zero' ? 1 : 2;
  if (valid.length < minPts) {
    throw new GelInputError(`The ${model} mass calibration model needs at least ${minPts} standard bands (have ${valid.length})`);
  }

  const n = valid.length;
  const meanMass = valid.reduce((acc, p) => acc + p.knownMass, 0) / n;
  let massAt: (net: number) => number;
  let formula = '';
  const coeffs: MassCalibration['coefficients'] = {};

  if (model === 'linear_zero') {
    // Linear through origin: Mass = slope * Net
    let sxy = 0, sxx = 0;
    for (const p of valid) {
      sxy += p.netIntensity * p.knownMass;
      sxx += p.netIntensity * p.netIntensity;
    }
    const slope = sxx === 0 ? 0 : sxy / sxx;
    coeffs.slope = slope;
    coeffs.intercept = 0;
    formula = `Mass = ${slope.toPrecision(4)} · OD`;
    massAt = (net: number) => Math.max(0, slope * Math.max(0, net));
  } else if (model === 'linear') {
    // Ordinary linear regression: Mass = slope * Net + intercept
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of valid) {
      sx += p.netIntensity;
      sy += p.knownMass;
      sxx += p.netIntensity * p.netIntensity;
      sxy += p.netIntensity * p.knownMass;
    }
    const den = n * sxx - sx * sx;
    const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
    const intercept = (sy - slope * sx) / n;
    coeffs.slope = slope;
    coeffs.intercept = intercept;
    const sign = intercept >= 0 ? '+' : '−';
    formula = `Mass = ${slope.toPrecision(4)} · OD ${sign} ${Math.abs(intercept).toPrecision(4)}`;
    massAt = (net: number) => Math.max(0, slope * Math.max(0, net) + intercept);
  } else if (model === 'quadratic') {
    // Polynomial order 2: Mass = a * Net^2 + b * Net + c
    // Solve 3x3 normal equations: [sx4 sx3 sx2; sx3 sx2 sx; sx2 sx n] * [a; b; c] = [sx2y; sxy; sy]
    let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0;
    let sy = 0, sxy = 0, sx2y = 0;
    for (const p of valid) {
      const x = p.netIntensity, y = p.knownMass;
      const x2 = x * x;
      sx += x;
      sx2 += x2;
      sx3 += x2 * x;
      sx4 += x2 * x2;
      sy += y;
      sxy += x * y;
      sx2y += x2 * y;
    }
    const A = [
      [sx4, sx3, sx2],
      [sx3, sx2, sx],
      [sx2, sx, n],
    ];
    const B = [sx2y, sxy, sy];
    const det =
      A[0]![0]! * (A[1]![1]! * A[2]![2]! - A[1]![2]! * A[2]![1]!) -
      A[0]![1]! * (A[1]![0]! * A[2]![2]! - A[1]![2]! * A[2]![0]!) +
      A[0]![2]! * (A[1]![0]! * A[2]![1]! - A[1]![1]! * A[2]![0]!);

    if (Math.abs(det) < 1e-12) {
      // Degenerate to linear
      return fitMassCalibration(valid, 'linear', unit);
    }

    const detA = (col: number) => {
      const m = A.map(row => [...row]);
      for (let r = 0; r < 3; r++) m[r]![col] = B[r]!;
      return (
        m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
        m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
        m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
      );
    };

    const a = detA(0) / det;
    const b = detA(1) / det;
    const c = detA(2) / det;
    coeffs.a = a;
    coeffs.b = b;
    coeffs.c = c;
    formula = `Mass = ${a.toPrecision(3)} · OD² + ${b.toPrecision(3)} · OD + ${c.toPrecision(3)}`;
    massAt = (net: number) => {
      const x = Math.max(0, net);
      return Math.max(0, a * x * x + b * x + c);
    };
  } else {
    // Power law: Mass = a * Net^b  <=>  ln(Mass) = ln(a) + b * ln(Net)
    const positive = valid.filter(p => p.netIntensity > 0 && p.knownMass > 0);
    if (positive.length < 2) return fitMassCalibration(valid, 'linear_zero', unit);

    let slx = 0, sly = 0, slxx = 0, slxy = 0;
    const m = positive.length;
    for (const p of positive) {
      const lx = Math.log(p.netIntensity);
      const ly = Math.log(p.knownMass);
      slx += lx;
      sly += ly;
      slxx += lx * lx;
      slxy += lx * ly;
    }
    const den = m * slxx - slx * slx;
    const b = den === 0 ? 1 : (m * slxy - slx * sly) / den;
    const lna = (sly - b * slx) / m;
    const a = Math.exp(lna);
    coeffs.a = a;
    coeffs.b = b;
    formula = `Mass = ${a.toPrecision(4)} · OD^${b.toPrecision(3)}`;
    massAt = (net: number) => (net > 0 ? Math.max(0, a * Math.pow(net, b)) : 0);
  }

  // Calculate residuals and R²
  let ssRes = 0, ssTot = 0;
  const residuals: MassCalibrationResidual[] = valid.map(p => {
    const fitted = massAt(p.netIntensity);
    const res = p.knownMass - fitted;
    ssRes += res * res;
    ssTot += Math.pow(p.knownMass - meanMass, 2);
    return {
      netIntensity: p.netIntensity,
      knownMass: p.knownMass,
      fittedMass: fitted,
      residual: res,
      fraction: p.knownMass > 0 ? res / p.knownMass : 0,
    };
  });

  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const params = model === 'linear_zero' ? 1 : model === 'quadratic' ? 3 : 2;
  const dof = valid.length - params;
  const residualSD = valid.length >= 3 && dof >= 1 ? Math.sqrt(ssRes / dof) : null;
  const nets = valid.map(p => p.netIntensity), masses = valid.map(p => p.knownMass);
  const range = { minMass: Math.min(...masses), maxMass: Math.max(...masses), minNet: Math.min(...nets), maxNet: Math.max(...nets) };

  return {
    model,
    points: valid,
    unit,
    r2,
    formula,
    massAt,
    residuals,
    coefficients: coeffs,
    range,
    residualSD,
    lod: residualSD === null ? null : 3.3 * residualSD,
    loq: residualSD === null ? null : 10 * residualSD,
  };
}

export interface MassFlags { extrapolated: boolean; belowLoq: boolean }

/** Validity flags for one quantified band: outside the standards' signal range, or below the limit of quantitation. */
export function massFlags(cal: MassCalibration, net: number, mass: number): MassFlags {
  return {
    extrapolated: net < cal.range.minNet || net > cal.range.maxNet,
    belowLoq: cal.loq !== null && mass < cal.loq,
  };
}

/** Formats calibrated mass value with appropriate precision and unit */
export function formatMass(mass: number | null | undefined, unit = 'ng'): string {
  if (mass === null || mass === undefined || !Number.isFinite(mass) || mass <= 0) return '–';
  if (mass >= 1000) return `${(mass / 1000).toFixed(2)} µg`;
  if (mass >= 100) return `${mass.toFixed(0)} ${unit}`;
  if (mass >= 10) return `${mass.toFixed(1)} ${unit}`;
  if (mass >= 1) return `${mass.toFixed(2)} ${unit}`;
  return `${mass.toFixed(3)} ${unit}`;
}

