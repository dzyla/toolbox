/**
 * Size Exclusion Chromatography (SEC) Calibration and Hydrodynamic Analysis
 * Computes partition coefficient Kav = (Ve - V0) / (Vt - V0),
 * linear standard curve Kav vs log10(MW), Stokes radius Rh, and oligomeric states.
 */

export interface SecColumn {
  id: string;
  name: string;
  manufacturer: string;
  bedVolume: number; // Vt (mL)
  voidVolume: number; // V0 (mL)
  rangeMinDa: number; // e.g. 10,000 Da
  rangeMaxDa: number; // e.g. 600,000 Da
}

export interface SecStandard {
  id: string;
  name: string;
  mwDa: number;
  elutionVolumeMl: number;
  stokesRadiusNm?: number;
  enabled: boolean;
}

export interface SecCalibrationModel {
  slope: number; // m in Kav = -m * log10(MW) + c
  intercept: number; // c in Kav = -m * log10(MW) + c
  rSquared: number;
  n: number;
  v0: number;
  vt: number;
  points: {
    name: string;
    mwDa: number;
    logMw: number;
    elutionVolumeMl: number;
    kav: number;
    fittedKav: number;
    residual: number;
  }[];
}

export interface SecPrediction {
  elutionVolumeMl: number;
  kav: number;
  apparentMwDa: number;
  apparentMwkDa: number;
  stokesRadiusNm: number;
  stokesRadiusAngstrom: number;
  isExtrapolated: boolean;
  oligomericRatio?: number;
  oligomericState?: string;
}

export const PRESET_COLUMNS: SecColumn[] = [
  {
    id: 's200_10_300',
    name: 'Superdex 200 Increase 10/300 GL',
    manufacturer: 'Cytiva',
    bedVolume: 24.0,
    voidVolume: 7.5,
    rangeMinDa: 10000,
    rangeMaxDa: 600000,
  },
  {
    id: 's75_10_300',
    name: 'Superdex 75 Increase 10/300 GL',
    manufacturer: 'Cytiva',
    bedVolume: 24.0,
    voidVolume: 8.0,
    rangeMinDa: 3000,
    rangeMaxDa: 70000,
  },
  {
    id: 'superose6_10_300',
    name: 'Superose 6 Increase 10/300 GL',
    manufacturer: 'Cytiva',
    bedVolume: 24.0,
    voidVolume: 7.2,
    rangeMinDa: 5000,
    rangeMaxDa: 5000000,
  },
  {
    id: 's200_5_150',
    name: 'Superdex 200 Increase 5/150 GL',
    manufacturer: 'Cytiva',
    bedVolume: 3.0,
    voidVolume: 0.95,
    rangeMinDa: 10000,
    rangeMaxDa: 600000,
  },
  {
    id: 's75_5_150',
    name: 'Superdex 75 Increase 5/150 GL',
    manufacturer: 'Cytiva',
    bedVolume: 3.0,
    voidVolume: 1.0,
    rangeMinDa: 3000,
    rangeMaxDa: 70000,
  },
  {
    id: 'hiload_16_600_s200',
    name: 'HiLoad 16/600 Superdex 200 pg',
    manufacturer: 'Cytiva',
    bedVolume: 120.0,
    voidVolume: 40.0,
    rangeMinDa: 10000,
    rangeMaxDa: 600000,
  },
  {
    id: 'hiload_16_600_s75',
    name: 'HiLoad 16/600 Superdex 75 pg',
    manufacturer: 'Cytiva',
    bedVolume: 120.0,
    voidVolume: 42.0,
    rangeMinDa: 3000,
    rangeMaxDa: 70000,
  },
  {
    id: 'custom',
    name: 'Custom User Column',
    manufacturer: 'Custom',
    bedVolume: 24.0,
    voidVolume: 7.5,
    rangeMinDa: 5000,
    rangeMaxDa: 1000000,
  },
];

export const DEFAULT_STANDARDS_S200_10_300: SecStandard[] = [
  { id: 'thyro', name: 'Thyroglobulin (bovine)', mwDa: 669000, elutionVolumeMl: 8.8, stokesRadiusNm: 8.5, enabled: true },
  { id: 'ferritin', name: 'Ferritin (horse)', mwDa: 440000, elutionVolumeMl: 10.2, stokesRadiusNm: 6.1, enabled: true },
  { id: 'aldolase', name: 'Aldolase (rabbit)', mwDa: 158000, elutionVolumeMl: 11.9, stokesRadiusNm: 4.8, enabled: true },
  { id: 'conalbumin', name: 'Conalbumin (chicken)', mwDa: 75000, elutionVolumeMl: 13.4, stokesRadiusNm: 3.6, enabled: true },
  { id: 'ovalbumin', name: 'Ovalbumin (chicken)', mwDa: 44000, elutionVolumeMl: 14.5, stokesRadiusNm: 3.0, enabled: true },
  { id: 'carbonic', name: 'Carbonic Anhydrase', mwDa: 29000, elutionVolumeMl: 16.0, stokesRadiusNm: 2.4, enabled: true },
  { id: 'rnase', name: 'Ribonuclease A', mwDa: 13700, elutionVolumeMl: 17.5, stokesRadiusNm: 1.6, enabled: true },
  { id: 'aprotinin', name: 'Aprotinin (bovine)', mwDa: 6500, elutionVolumeMl: 19.3, stokesRadiusNm: 1.3, enabled: false },
];

export const DEFAULT_STANDARDS_S200 = DEFAULT_STANDARDS_S200_10_300;

export const DEFAULT_STANDARDS_S200_5_150: SecStandard[] = [
  { id: 'thyro', name: 'Thyroglobulin (bovine)', mwDa: 669000, elutionVolumeMl: 1.11, stokesRadiusNm: 8.5, enabled: true },
  { id: 'ferritin', name: 'Ferritin (horse)', mwDa: 440000, elutionVolumeMl: 1.28, stokesRadiusNm: 6.1, enabled: true },
  { id: 'aldolase', name: 'Aldolase (rabbit)', mwDa: 158000, elutionVolumeMl: 1.50, stokesRadiusNm: 4.8, enabled: true },
  { id: 'conalbumin', name: 'Conalbumin (chicken)', mwDa: 75000, elutionVolumeMl: 1.68, stokesRadiusNm: 3.6, enabled: true },
  { id: 'ovalbumin', name: 'Ovalbumin (chicken)', mwDa: 44000, elutionVolumeMl: 1.82, stokesRadiusNm: 3.0, enabled: true },
  { id: 'carbonic', name: 'Carbonic Anhydrase', mwDa: 29000, elutionVolumeMl: 2.01, stokesRadiusNm: 2.4, enabled: true },
  { id: 'rnase', name: 'Ribonuclease A', mwDa: 13700, elutionVolumeMl: 2.19, stokesRadiusNm: 1.6, enabled: true },
  { id: 'aprotinin', name: 'Aprotinin (bovine)', mwDa: 6500, elutionVolumeMl: 2.41, stokesRadiusNm: 1.3, enabled: false },
];

export const DEFAULT_STANDARDS_S75_10_300: SecStandard[] = [
  { id: 'conalbumin', name: 'Conalbumin (chicken)', mwDa: 75000, elutionVolumeMl: 8.9, stokesRadiusNm: 3.6, enabled: true },
  { id: 'ovalbumin', name: 'Ovalbumin (chicken)', mwDa: 44000, elutionVolumeMl: 10.3, stokesRadiusNm: 3.0, enabled: true },
  { id: 'carbonic', name: 'Carbonic Anhydrase', mwDa: 29000, elutionVolumeMl: 11.8, stokesRadiusNm: 2.4, enabled: true },
  { id: 'rnase', name: 'Ribonuclease A', mwDa: 13700, elutionVolumeMl: 13.9, stokesRadiusNm: 1.6, enabled: true },
  { id: 'aprotinin', name: 'Aprotinin (bovine)', mwDa: 6500, elutionVolumeMl: 16.2, stokesRadiusNm: 1.3, enabled: true },
  { id: 'cobalamin', name: 'Vitamin B12', mwDa: 1355, elutionVolumeMl: 19.5, stokesRadiusNm: 0.85, enabled: true },
];

export const DEFAULT_STANDARDS_S75_5_150: SecStandard[] = [
  { id: 'conalbumin', name: 'Conalbumin (chicken)', mwDa: 75000, elutionVolumeMl: 1.11, stokesRadiusNm: 3.6, enabled: true },
  { id: 'ovalbumin', name: 'Ovalbumin (chicken)', mwDa: 44000, elutionVolumeMl: 1.29, stokesRadiusNm: 3.0, enabled: true },
  { id: 'carbonic', name: 'Carbonic Anhydrase', mwDa: 29000, elutionVolumeMl: 1.48, stokesRadiusNm: 2.4, enabled: true },
  { id: 'rnase', name: 'Ribonuclease A', mwDa: 13700, elutionVolumeMl: 1.74, stokesRadiusNm: 1.6, enabled: true },
  { id: 'aprotinin', name: 'Aprotinin (bovine)', mwDa: 6500, elutionVolumeMl: 2.03, stokesRadiusNm: 1.3, enabled: true },
  { id: 'cobalamin', name: 'Vitamin B12', mwDa: 1355, elutionVolumeMl: 2.44, stokesRadiusNm: 0.85, enabled: true },
];

export const DEFAULT_STANDARDS_SUPEROSE6: SecStandard[] = [
  { id: 'thyro', name: 'Thyroglobulin (bovine)', mwDa: 669000, elutionVolumeMl: 10.5, stokesRadiusNm: 8.5, enabled: true },
  { id: 'ferritin', name: 'Ferritin (horse)', mwDa: 440000, elutionVolumeMl: 12.1, stokesRadiusNm: 6.1, enabled: true },
  { id: 'catalase', name: 'Catalase (bovine)', mwDa: 232000, elutionVolumeMl: 13.6, stokesRadiusNm: 5.2, enabled: true },
  { id: 'aldolase', name: 'Aldolase (rabbit)', mwDa: 158000, elutionVolumeMl: 14.5, stokesRadiusNm: 4.8, enabled: true },
  { id: 'bsa', name: 'Bovine Serum Albumin', mwDa: 66000, elutionVolumeMl: 16.0, stokesRadiusNm: 3.5, enabled: true },
  { id: 'ovalbumin', name: 'Ovalbumin (chicken)', mwDa: 44000, elutionVolumeMl: 17.2, stokesRadiusNm: 3.0, enabled: true },
  { id: 'carbonic', name: 'Carbonic Anhydrase', mwDa: 29000, elutionVolumeMl: 18.5, stokesRadiusNm: 2.4, enabled: true },
];

export const COLUMN_STANDARDS_MAP: Record<string, SecStandard[]> = {
  s200_10_300: DEFAULT_STANDARDS_S200_10_300,
  s200_5_150: DEFAULT_STANDARDS_S200_5_150,
  s75_10_300: DEFAULT_STANDARDS_S75_10_300,
  s75_5_150: DEFAULT_STANDARDS_S75_5_150,
  superose6_10_300: DEFAULT_STANDARDS_SUPEROSE6,
  hiload_16_600_s200: DEFAULT_STANDARDS_S200_10_300.map(s => ({
    ...s,
    elutionVolumeMl: Math.round((40.0 + ((s.elutionVolumeMl - 7.5) / (24.0 - 7.5)) * 80.0) * 10) / 10,
  })),
  hiload_16_600_s75: DEFAULT_STANDARDS_S75_10_300.map(s => ({
    ...s,
    elutionVolumeMl: Math.round((42.0 + ((s.elutionVolumeMl - 8.0) / (24.0 - 8.0)) * 78.0) * 10) / 10,
  })),
};

export function getStandardsForColumn(colId: string): SecStandard[] {
  const standards = COLUMN_STANDARDS_MAP[colId] || DEFAULT_STANDARDS_S200_10_300;
  return JSON.parse(JSON.stringify(standards));
}

/** Scale elution volumes when column dimensions change while keeping Kav constant */
export function scaleStandardsForColumn(
  standards: SecStandard[],
  oldV0: number,
  oldVt: number,
  newV0: number,
  newVt: number
): SecStandard[] {
  if (oldVt <= oldV0 || newVt <= newV0) return standards;
  return standards.map(s => {
    const kav = (s.elutionVolumeMl - oldV0) / (oldVt - oldV0);
    const newVe = newV0 + Math.max(0.01, Math.min(1.05, kav)) * (newVt - newV0);
    return {
      ...s,
      elutionVolumeMl: Math.round(newVe * 100) / 100,
    };
  });
}

/**
 * Computes Gel Phase Distribution Coefficient (Kav)
 * Kav = (Ve - V0) / (Vt - V0)
 */
export function computeKav(ve: number, v0: number, vt: number): number {
  if (vt <= v0) return 0;
  return (ve - v0) / (vt - v0);
}

/**
 * Fits linear calibration curve: Kav = -m * log10(MW) + c
 */
export function fitSecCalibration(
  standards: SecStandard[],
  v0: number,
  vt: number
): SecCalibrationModel | null {
  const active = standards.filter(s => s.enabled && s.mwDa > 0 && s.elutionVolumeMl > 0);
  if (active.length < 2 || vt <= v0) return null;

  const points = active.map(s => {
    const logMw = Math.log10(s.mwDa);
    const kav = computeKav(s.elutionVolumeMl, v0, vt);
    return { name: s.name, mwDa: s.mwDa, logMw, elutionVolumeMl: s.elutionVolumeMl, kav };
  });

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const p of points) {
    sumX += p.logMw;
    sumY += p.kav;
    sumXY += p.logMw * p.kav;
    sumXX += p.logMw * p.logMw;
  }

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R^2
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  const evaluatedPoints = points.map(p => {
    const fittedKav = slope * p.logMw + intercept;
    const res = p.kav - fittedKav;
    ssTot += (p.kav - meanY) ** 2;
    ssRes += res ** 2;
    return { ...p, fittedKav, residual: res };
  });

  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;

  return {
    slope,
    intercept,
    rSquared,
    n,
    v0,
    vt,
    points: evaluatedPoints,
  };
}

/**
 * Estimates Stokes hydrodynamic radius (Rh) from molecular weight (globular model):
 * Rh ≈ 0.066 * MW^(1/3) in nm (Erickson 2009 Biol Proced Online)
 */
export function estimateStokesRadius(mwDa: number): { nm: number; angstrom: number } {
  if (mwDa <= 0) return { nm: 0, angstrom: 0 };
  const nm = 0.066 * Math.cbrt(mwDa);
  return { nm, angstrom: nm * 10 };
}

/**
 * Predicts MW and properties from elution volume Ve
 */
export function predictFromVe(
  ve: number,
  model: SecCalibrationModel,
  monomerMwDa?: number
): SecPrediction {
  const kav = computeKav(ve, model.v0, model.vt);
  // Kav = slope * log10(MW) + intercept => log10(MW) = (Kav - intercept) / slope
  const logMw = (kav - model.intercept) / model.slope;
  const apparentMwDa = Math.max(1, 10 ** logMw);
  const apparentMwkDa = apparentMwDa / 1000;

  const minObsLog = Math.min(...model.points.map(p => p.logMw));
  const maxObsLog = Math.max(...model.points.map(p => p.logMw));
  const isExtrapolated = logMw < minObsLog - 0.2 || logMw > maxObsLog + 0.2;

  const stokes = estimateStokesRadius(apparentMwDa);

  let oligomericRatio: number | undefined;
  let oligomericState: string | undefined;

  if (monomerMwDa && monomerMwDa > 0) {
    oligomericRatio = apparentMwDa / monomerMwDa;
    if (oligomericRatio < 0.7) oligomericState = 'Fragment / Degraded (<1×)';
    else if (oligomericRatio <= 1.4) oligomericState = 'Monomer (1×)';
    else if (oligomericRatio <= 2.4) oligomericState = 'Dimer (2×)';
    else if (oligomericRatio <= 3.4) oligomericState = 'Trimer (3×)';
    else if (oligomericRatio <= 4.4) oligomericState = 'Tetramer (4×)';
    else if (oligomericRatio <= 5.5) oligomericState = 'Pentamer (5×)';
    else if (oligomericRatio <= 6.6) oligomericState = 'Hexamer (6×)';
    else if (oligomericRatio <= 8.8) oligomericState = 'Octamer (8×)';
    else oligomericState = `Higher-order Oligomer / Aggregate (~${Math.round(oligomericRatio)}×)`;
  }

  return {
    elutionVolumeMl: ve,
    kav,
    apparentMwDa,
    apparentMwkDa,
    stokesRadiusNm: stokes.nm,
    stokesRadiusAngstrom: stokes.angstrom,
    isExtrapolated,
    oligomericRatio,
    oligomericState,
  };
}

/**
 * Predicts expected elution volume Ve from a target MW
 */
export function predictVeFromMw(
  mwDa: number,
  model: SecCalibrationModel
): { elutionVolumeMl: number; kav: number } {
  if (mwDa <= 0) return { elutionVolumeMl: model.v0, kav: 0 };
  const logMw = Math.log10(mwDa);
  const kav = model.slope * logMw + model.intercept;
  const ve = model.v0 + kav * (model.vt - model.v0);
  return { elutionVolumeMl: ve, kav };
}
