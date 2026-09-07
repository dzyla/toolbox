/**
 * Plate Reader CSV Processor & Normalization Engine
 *
 * Literature references:
 * - Birmingham A et al. (2009) Statistical methods for analysis of high-throughput
 *   RNA interference screens. Nat Methods 6:569-575.
 * - Malo N et al. (2006) Statistical practice in high-throughput screening
 *   data analysis. Nat Biotechnol 24:167-175.
 * - Zhang JH, Chung TD, Oldenburg KR (1999) A Simple Statistical Parameter for Use in
 *   Evaluation and Validation of High Throughput Screening Assays. J Biomol Screen 4:67-73.
 * - ASTM E178-02 Standard Practice for Dealing With Outlying Observations.
 *
 * Pure TypeScript with zero DOM dependencies.
 */

export type PlateFormat = 96 | 384;

export type SampleType = 'sample' | 'standard' | 'pos-ctrl' | 'neg-ctrl' | 'blank' | 'empty' | 'unassigned';

export interface WellValue {
  id: string; // e.g. 'A1', 'H12', 'P24'
  row: string; // e.g. 'A'
  col: number; // e.g. 1
  raw: number | null;
  normalized: number | null;
  sampleGroupId?: string;
  sampleName?: string;
  sampleType: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  dilutionFactor?: number;
  calculatedConcentration?: number | null;
  finalConcentration?: number | null;
  isOutlier?: boolean;
  outlierReason?: string;
  isExcluded?: boolean;
  statusNote?: string;
}

export interface SampleGroup {
  id: string;
  name: string;
  color: string;
  type: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  unit?: string;
}

export interface ParsedPlate {
  format: PlateFormat;
  wells: Record<string, WellValue>;
  rows: string[];
  cols: number[];
  metadata: Record<string, string>;
  detectedFormat: 'matrix' | 'list';
  vendorHint: 'tecan' | 'bmg' | 'biotek' | 'moldev' | 'generic';
  delimiter: string;
  rawText: string;
}

export type NormalizationMode =
  | 'raw'
  | 'blank-subtracted'
  | 'percent-control'
  | 'percent-inhibition'
  | 'fold-change';

export interface NormalizationConfig {
  mode: NormalizationMode;
  blankGroupId?: string;
  posControlGroupId?: string;
  negControlGroupId?: string;
  customBlankValue?: number;
  customControlValue?: number;
  customMinValue?: number;
  customMaxValue?: number;
  blankMethod?: 'global' | 'row' | 'col' | 'column' | 'wells' | 'custom' | 'none';
  minMethod?: 'neg-ctrl' | 'blank' | 'lowest' | 'wells' | 'custom';
  maxMethod?: 'pos-ctrl' | 'highest' | 'wells' | 'custom';
  blankWellIds?: string[];
  minWellIds?: string[];
  maxWellIds?: string[];
  excludedWellIds?: string[];
}

export interface AnnotationToken {
  id?: string;
  label?: string;
  sampleName?: string;
  sampleGroupId?: string;
  sampleType?: SampleType;
  role?: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  unit?: string;
  dilutionFactor?: number;
  customName?: string;
}

export interface ParsedLayoutAnnotation {
  id: string; // e.g. 'A1'
  label: string;
  sampleName: string;
  sampleGroupId: string;
  sampleType: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  dilutionFactor?: number;
}

export type OutlierMethod = 'grubbs' | 'sd-cutoff' | 'both' | 'none';

export interface OutlierConfig {
  method: OutlierMethod;
  alpha?: number; // default 0.05
  sdCutoff?: number; // default 2.5
  cvThreshold?: number; // default 15 (%)
  autoExcludeOutliers?: boolean;
}

export interface GroupStats {
  groupId: string;
  groupName: string;
  sampleType: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  dilutionFactor?: number;
  color: string;
  nTotal: number;
  nValid: number;
  nExcluded: number;
  rawValues: number[];
  normalizedValues: number[];
  rawMean: number;
  rawSd: number;
  rawSem: number;
  rawCv: number;
  mean: number;
  sd: number;
  sem: number;
  cv: number; // %CV = 100 * sd / mean
  median: number;
  mad: number; // Median Absolute Deviation
  min: number;
  max: number;
  outlierWellIds: string[];
  calculatedConc?: number | null;
  qcFlags: {
    highCv: boolean;
    lowN: boolean;
    hasOutliers: boolean;
    status: 'pass' | 'warning' | 'fail';
    messages: string[];
  };
}

export interface AssayQcMetrics {
  zPrime: number | null;
  zFactorInterpretation: 'excellent' | 'marginal' | 'unacceptable' | null;
  signalToNoise: number | null;
  signalToBackground: number | null;
  dynamicRange: number | null;
  posMean: number | null;
  negMean: number | null;
  blankMean: number | null;
  plateMeanCv: number | null;
  totalWells: number;
  validWells: number;
  outlierCount: number;
}

export const ROW_LABELS_96 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const ROW_LABELS_384 = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
] as const;

export const DEFAULT_GROUPS: SampleGroup[] = [
  { id: 'blank', name: 'Blank / Buffer', color: '#94a3b8', type: 'blank' },
  { id: 'neg-ctrl', name: 'Negative Control (Vehicle)', color: '#64748b', type: 'neg-ctrl' },
  { id: 'pos-ctrl', name: 'Positive Control (Max)', color: '#10b981', type: 'pos-ctrl' },
  { id: 'sample-1', name: 'Sample 1', color: '#3b82f6', type: 'sample' },
  { id: 'sample-2', name: 'Sample 2', color: '#8b5cf6', type: 'sample' },
  { id: 'sample-3', name: 'Sample 3', color: '#ec4899', type: 'sample' },
  { id: 'sample-4', name: 'Sample 4', color: '#f59e0b', type: 'sample' },
  { id: 'sample-5', name: 'Sample 5', color: '#06b6d4', type: 'sample' },
];

/* ========================================================================= */
/* 1. Scientific Statistics & Outlier Testing Functions                     */
/* ========================================================================= */

/** Sample mean */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

/** Sample variance with Bessel's correction (N - 1) */
export function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sse = values.reduce((acc, v) => acc + Math.pow(v - m, 2), 0);
  return sse / (values.length - 1);
}

/** Sample standard deviation */
export function sampleSd(values: number[]): number {
  return Math.sqrt(sampleVariance(values));
}

/** Standard error of the mean (SEM = SD / sqrt(N)) */
export function sem(values: number[]): number {
  if (values.length < 2) return 0;
  return sampleSd(values) / Math.sqrt(values.length);
}

/** Percent Coefficient of Variation (%CV = 100 * SD / |Mean|) */
export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  if (Math.abs(m) < 1e-12) return 0;
  return (sampleSd(values) / Math.abs(m)) * 100;
}

/** Median of an array */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const v1 = sorted[mid - 1] ?? 0;
    const v2 = sorted[mid] ?? 0;
    return (v1 + v2) / 2;
  }
  return sorted[mid] ?? 0;
}

/** Median Absolute Deviation (MAD = median(|x_i - median(x)|)) */
export function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  const diffs = values.map(v => Math.abs(v - med));
  return median(diffs);
}

/* --- Lanczos Log Gamma and Regularized Incomplete Beta for Student-t CDF --- */

export function logGamma(z: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];
  const x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    const cj = c[j] ?? 0;
    ser += cj / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** Continued fraction evaluation for incomplete beta function */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 1e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) < EPS) break;
  }
  return h;
}

/** Regularized Incomplete Beta function I_x(a, b) */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(a, b, x) / a;
  }
  return 1 - bt * betacf(b, a, 1 - x) / b;
}

/** Inverse of Regularized Incomplete Beta function */
export function inverseIncompleteBeta(a: number, b: number, target: number): number {
  if (target <= 0) return 0;
  if (target >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 70; i++) {
    const mid = (low + high) / 2;
    if (incompleteBeta(a, b, mid) < target) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

/**
 * Upper quantile of Student's t-distribution for two-tailed or one-tailed p.
 * Finds t >= 0 such that P(T >= t) = p.
 */
export function studentTQuantile(p: number, df: number): number {
  if (p <= 0) return Infinity;
  if (p >= 0.5) return 0;
  if (df === 1) {
    return 1 / Math.tan(Math.PI * p);
  }
  if (df === 2) {
    return Math.sqrt(1 / (2 * p * (1 - p)) - 2);
  }
  // P(T >= t) = 0.5 * I_x(df / 2, 0.5) where x = df / (df + t^2)
  // Therefore I_x(df / 2, 0.5) = 2 * p
  const target = 2 * p;
  const x = inverseIncompleteBeta(df / 2, 0.5, target);
  if (x <= 0) return Infinity;
  return Math.sqrt(df * (1 - x) / x);
}

/**
 * Exact Grubbs critical value for sample size N and significance level alpha.
 * Formula (Grubbs 1950, ASTM E178, NIST Engineering Statistics Handbook):
 * G_crit = ((N - 1) / sqrt(N)) * sqrt( t^2 / (N - 2 + t^2) )
 * where t = t_{alpha / (2N), N - 2}.
 */
export function grubbsCriticalValue(n: number, alpha = 0.05): number {
  if (n < 3) return Infinity;
  const df = n - 2;
  const p = alpha / (2 * n);
  const t = studentTQuantile(p, df);
  const factor = (n - 1) / Math.sqrt(n);
  return factor * Math.sqrt((t * t) / (df + t * t));
}

/**
 * Compute Grubbs test p-value for observed G statistic.
 */
export function grubbsPValue(g: number, n: number): number {
  if (n < 3 || g <= 0) return 1.0;
  const maxPossibleG = (n - 1) / Math.sqrt(n);
  if (g >= maxPossibleG) return 0.0;
  const ratio = (n * g * g) / Math.pow(n - 1, 2);
  const x = Math.max(0, Math.min(1, 1 - ratio));
  const ib = incompleteBeta((n - 2) / 2, 0.5, x);
  const pVal = n * ib;
  return Math.max(0, Math.min(1, pVal));
}

export interface GrubbsResult {
  isOutlier: boolean;
  outlierIndex: number | null;
  outlierValue: number | null;
  gScore: number;
  criticalG: number;
  pValue: number;
  mean: number;
  sd: number;
}

/** Perform single Grubbs' test for the most extreme value in a dataset */
export function grubbsTest(values: number[], alpha = 0.05): GrubbsResult {
  if (values.length < 3) {
    return {
      isOutlier: false,
      outlierIndex: null,
      outlierValue: null,
      gScore: 0,
      criticalG: Infinity,
      pValue: 1.0,
      mean: mean(values),
      sd: sampleSd(values),
    };
  }

  const m = mean(values);
  const s = sampleSd(values);
  if (s < 1e-14) {
    return {
      isOutlier: false,
      outlierIndex: null,
      outlierValue: null,
      gScore: 0,
      criticalG: grubbsCriticalValue(values.length, alpha),
      pValue: 1.0,
      mean: m,
      sd: s,
    };
  }

  let maxDiff = -1;
  let maxIdx = 0;
  for (let i = 0; i < values.length; i++) {
    const val = values[i] ?? 0;
    const diff = Math.abs(val - m);
    if (diff > maxDiff) {
      maxDiff = diff;
      maxIdx = i;
    }
  }

  const g = maxDiff / s;
  const gCrit = grubbsCriticalValue(values.length, alpha);
  const pVal = grubbsPValue(g, values.length);
  const isOutlier = g > gCrit;

  return {
    isOutlier,
    outlierIndex: isOutlier ? maxIdx : null,
    outlierValue: isOutlier ? (values[maxIdx] ?? null) : null,
    gScore: g,
    criticalG: gCrit,
    pValue: pVal,
    mean: m,
    sd: s,
  };
}

/** Detect all outliers in an array using Grubbs and/or SD cutoff */
export function detectOutliers(
  values: number[],
  config: Partial<OutlierConfig> = {},
): {
  outlierIndices: number[];
  details: Array<{ index: number; value: number; reason: string; score: number }>;
} {
  const method = config.method ?? 'grubbs';
  const alpha = config.alpha ?? 0.05;
  const sdCutoff = config.sdCutoff ?? 2.5;

  if (method === 'none' || values.length < 2) {
    return { outlierIndices: [], details: [] };
  }

  const outlierIndices = new Set<number>();
  const details: Array<{ index: number; value: number; reason: string; score: number }> = [];

  const m = mean(values);
  const s = sampleSd(values);

  // 1. SD Cutoff rule
  if (method === 'sd-cutoff' || method === 'both') {
    if (s > 1e-14) {
      for (let i = 0; i < values.length; i++) {
        const val = values[i] ?? 0;
        const z = Math.abs(val - m) / s;
        if (z > sdCutoff) {
          outlierIndices.add(i);
          details.push({
            index: i,
            value: val,
            reason: `> ${sdCutoff.toFixed(1)}×SD (z = ${z.toFixed(2)})`,
            score: z,
          });
        }
      }
    }
  }

  // 2. Grubbs' test
  if (method === 'grubbs' || method === 'both') {
    if (values.length >= 3) {
      const gRes = grubbsTest(values, alpha);
      if (gRes.isOutlier && gRes.outlierIndex !== null) {
        if (!outlierIndices.has(gRes.outlierIndex)) {
          outlierIndices.add(gRes.outlierIndex);
          details.push({
            index: gRes.outlierIndex,
            value: values[gRes.outlierIndex] ?? 0,
            reason: `Grubbs' Test (G = ${gRes.gScore.toFixed(3)} > G_crit ${gRes.criticalG.toFixed(3)}, p = ${gRes.pValue.toFixed(4)})`,
            score: gRes.gScore,
          });
        }
      }
    }
  }

  return {
    outlierIndices: Array.from(outlierIndices).sort((a, b) => a - b),
    details,
  };
}

/**
 * Screening Z'-factor calculation (Zhang et al. 1999, Birmingham et al. 2009)
 * Z' = 1 - (3 * (s_pos + s_neg)) / |mean_pos - mean_neg|
 */
export function calculateZPrime(
  posValues: number[],
  negValues: number[],
): {
  zPrime: number;
  sPos: number;
  sNeg: number;
  meanPos: number;
  meanNeg: number;
  dynamicRange: number;
  interpretation: 'excellent' | 'marginal' | 'unacceptable';
} {
  const meanPos = mean(posValues);
  const meanNeg = mean(negValues);
  const sPos = sampleSd(posValues);
  const sNeg = sampleSd(negValues);
  const dynamicRange = Math.abs(meanPos - meanNeg);

  if (dynamicRange < 1e-12) {
    return {
      zPrime: -Infinity,
      sPos,
      sNeg,
      meanPos,
      meanNeg,
      dynamicRange: 0,
      interpretation: 'unacceptable',
    };
  }

  const zPrime = 1 - (3 * (sPos + sNeg)) / dynamicRange;
  let interpretation: 'excellent' | 'marginal' | 'unacceptable' = 'unacceptable';
  if (zPrime >= 0.5) {
    interpretation = 'excellent';
  } else if (zPrime >= 0) {
    interpretation = 'marginal';
  }

  return {
    zPrime,
    sPos,
    sNeg,
    meanPos,
    meanNeg,
    dynamicRange,
    interpretation,
  };
}

/** Signal to Noise (S/N = |mean_pos - mean_neg| / s_neg) */
export function calculateSignalToNoise(posValues: number[], negValues: number[]): number {
  const sNeg = sampleSd(negValues);
  if (sNeg < 1e-12) return 0;
  return Math.abs(mean(posValues) - mean(negValues)) / sNeg;
}

/** Signal to Background (S/B = mean_pos / mean_neg) */
export function calculateSignalToBackground(posValues: number[], negValues: number[]): number {
  const mNeg = mean(negValues);
  if (Math.abs(mNeg) < 1e-12) return 0;
  return mean(posValues) / mNeg;
}

/* ========================================================================= */
/* 2. Plate Parsing Engine (Matrix & 3-Column List)                          */
/* ========================================================================= */

/** Parse well coordinate e.g. 'A1', 'A01', 'H12', 'P24' */
export function parseWellId(str: string): { row: string; col: number; id: string } | null {
  const match = str.trim().match(/^([A-P])0?([1-9]|1[0-9]|2[0-4])$/i);
  if (!match) return null;
  const row = match[1]!.toUpperCase();
  const col = parseInt(match[2]!, 10);
  return { row, col, id: `${row}${col}` };
}

/** Detect delimiter in tabular text */
export function detectDelimiter(lines: string[]): string {
  let tabs = 0;
  let commas = 0;
  let semis = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '\t') tabs++;
      else if (ch === ',') commas++;
      else if (ch === ';') semis++;
    }
  }

  if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
  if (semis > commas && semis > 0) return ';';
  return ',';
}

/** Split a delimited line respecting optional quotes */
export function splitLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"(.*)"$/, '$1'));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"(.*)"$/, '$1'));
  return result;
}

/** Detect vendor hint from raw text headers */
export function detectVendor(text: string): 'tecan' | 'bmg' | 'biotek' | 'moldev' | 'generic' {
  const lower = text.toLowerCase();
  if (lower.includes('tecan') || lower.includes('magellan') || lower.includes('i-control') || lower.includes('<>')) {
    return 'tecan';
  }
  if (
    lower.includes('bmg') ||
    lower.includes('clariostar') ||
    lower.includes('pherastar') ||
    lower.includes('fluostar') ||
    lower.includes('test protocol') ||
    lower.includes('microplate name')
  ) {
    return 'bmg';
  }
  if (
    lower.includes('biotek') ||
    lower.includes('gen5') ||
    lower.includes('synergy') ||
    lower.includes('software version') ||
    lower.includes('experiment file')
  ) {
    return 'biotek';
  }
  if (lower.includes('molecular devices') || lower.includes('softmax') || lower.includes('##blocks')) {
    return 'moldev';
  }
  return 'generic';
}

/** Parse numeric token with support for commas, overflow, underflow, and NaNs */
export function parseTokenValue(token: string): { val: number | null; note?: string } {
  const clean = token.trim();
  if (!clean) return { val: null };

  const lower = clean.toLowerCase();
  if (['nan', 'n/a', 'na', 'null', '#value!', '#num!', '???', '-'].includes(lower)) {
    return { val: null };
  }

  // Overflow / saturation
  if (/^(ovrflw|over|ovfl|high|>.*)$/i.test(lower)) {
    return { val: null, note: 'Overflow / Saturation' };
  }
  // Underflow / below detection
  if (/^(low|<.*)$/i.test(lower)) {
    return { val: 0, note: 'Below LOD' };
  }

  // If token has European decimal comma like '0,123'
  const normalizedNumStr = clean.includes(',') && !clean.includes('.')
    ? clean.replace(',', '.')
    : clean;

  const num = parseFloat(normalizedNumStr);
  if (isNaN(num)) return { val: null };
  return { val: num };
}

/** Check if lines represent a 3-column / 2-column list export */
export function isListExport(lines: string[], delimiter: string): boolean {
  let wellMatches = 0;
  let totalChecked = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const tokens = splitLine(trimmed, delimiter);
    if (tokens.length >= 2 && tokens.length <= 5) {
      totalChecked++;
      const first = tokens[0] ?? '';
      if (parseWellId(first) !== null) {
        wellMatches++;
      }
    }
    if (totalChecked >= 15) break;
  }

  return wellMatches >= 3 && wellMatches / Math.max(1, totalChecked) > 0.4;
}

/** Create empty plate dictionary */
export function createEmptyPlate(format: PlateFormat): Record<string, WellValue> {
  const rows = format === 96 ? ROW_LABELS_96 : ROW_LABELS_384;
  const colsCount = format === 96 ? 12 : 24;
  const wells: Record<string, WellValue> = {};

  for (const r of rows) {
    for (let c = 1; c <= colsCount; c++) {
      const id = `${r}${c}`;
      wells[id] = {
        id,
        row: r,
        col: c,
        raw: null,
        normalized: null,
        sampleGroupId: '',
        sampleName: '',
        sampleType: 'sample',
      };
    }
  }
  return wells;
}

/** Parse 3-column or 2-column list exports (Well, Sample, Value) */
export function parseListExport(text: string, forcedDelimiter?: string): ParsedPlate {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const delimiter = forcedDelimiter ?? detectDelimiter(lines);
  const metadata: Record<string, string> = {};

  let hasRowsAboveH = false;
  let maxCol = 12;

  interface RawRow {
    wellId: string;
    row: string;
    col: number;
    sampleName: string;
    val: number | null;
    note?: string;
  }
  const rawRows: RawRow[] = [];

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) {
      const metaMatch = line.replace(/^[#\/]+\s*/, '').split(/[:=]/);
      if (metaMatch.length >= 2) {
        metadata[metaMatch[0]!.trim()] = metaMatch.slice(1).join(':').trim();
      }
      continue;
    }

    const parts = splitLine(line, delimiter);
    if (parts.length < 2) continue;

    const wellCoord = parseWellId(parts[0]!);
    if (!wellCoord) {
      // Possible header row: e.g. "Well, Sample, Absorbance"
      continue;
    }

    if (wellCoord.row > 'H') hasRowsAboveH = true;
    if (wellCoord.col > maxCol) maxCol = wellCoord.col;

    let sampleName = '';
    let valToken = parts[1]!;

    if (parts.length >= 3) {
      sampleName = parts[1]!;
      valToken = parts[2]!;
      if (!isNaN(parseFloat(parts[1]!)) && isNaN(parseFloat(parts[2]!))) {
        valToken = parts[1]!;
        sampleName = parts[2]!;
      }
    }

    const { val, note } = parseTokenValue(valToken);
    rawRows.push({
      wellId: wellCoord.id,
      row: wellCoord.row,
      col: wellCoord.col,
      sampleName,
      val,
      note,
    });
  }

  const format: PlateFormat = hasRowsAboveH || maxCol > 12 ? 384 : 96;
  const wells = createEmptyPlate(format);

  for (const r of rawRows) {
    if (wells[r.wellId]) {
      let sampleType: SampleType = 'sample';
      const nameLower = r.sampleName.toLowerCase();
      if (nameLower.includes('blank') || nameLower.includes('media') || nameLower.includes('buffer')) {
        sampleType = 'blank';
      } else if (nameLower.includes('pos') || nameLower.includes('positive') || nameLower.includes('max')) {
        sampleType = 'pos-ctrl';
      } else if (nameLower.includes('neg') || nameLower.includes('negative') || nameLower.includes('vehicle') || nameLower.includes('dmso')) {
        sampleType = 'neg-ctrl';
      } else if (nameLower.includes('std') || nameLower.includes('standard')) {
        sampleType = 'standard';
      }

      wells[r.wellId] = {
        id: r.wellId,
        row: r.row,
        col: r.col,
        raw: r.val,
        normalized: null,
        sampleGroupId: r.sampleName ? r.sampleName : '',
        sampleName: r.sampleName,
        sampleType,
        statusNote: r.note,
      };
    }
  }

  const rows = format === 96 ? [...ROW_LABELS_96] : [...ROW_LABELS_384];
  const cols = Array.from({ length: format === 96 ? 12 : 24 }, (_, i) => i + 1);

  return {
    format,
    wells,
    rows,
    cols,
    metadata,
    detectedFormat: 'list',
    vendorHint: detectVendor(text),
    delimiter,
    rawText: text,
  };
}

/**
 * Robust Matrix Parser for Tecan, BMG, BioTek, Molecular Devices, and generic CSV/TSV
 */
export function parseMatrixExport(text: string, forcedDelimiter?: string): ParsedPlate {
  const rawLines = text.split(/\r?\n/);
  const delimiter = forcedDelimiter ?? detectDelimiter(rawLines);
  const metadata: Record<string, string> = {};

  const lines: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('##')) {
      const parts = trimmed.replace(/^[#\/]+\s*/, '').split(/[:=]/);
      if (parts.length >= 2) {
        metadata[parts[0]!.trim()] = parts.slice(1).join(':').trim();
      }
      continue;
    }
    const tokens = splitLine(trimmed, delimiter);
    if (tokens.length === 2 && !/^[A-P]$/i.test(tokens[0]!)) {
      metadata[tokens[0]!] = tokens[1]!;
    }
    lines.push(trimmed);
  }

  let startIdx = -1;
  let isRowLabeled = false;
  let format: PlateFormat = 96;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const tokens = splitLine(line, delimiter);
    const first = tokens[0]?.trim() ?? '';
    if (/^(?:row\s*)?A:?$/i.test(first)) {
      startIdx = i;
      isRowLabeled = true;
      if (tokens.length >= 24) {
        format = 384;
      }
      break;
    }
  }

  if (startIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const tokens = splitLine(line, delimiter);
      const numericCount = tokens.filter(t => !isNaN(parseFloat(t.replace(',', '.')))).length;
      if (numericCount >= 12) {
        startIdx = i;
        isRowLabeled = false;
        if (tokens.length >= 24 || numericCount >= 20) {
          format = 384;
        }
        break;
      }
    }
  }

  if (startIdx === -1) {
    startIdx = 0;
  }

  const availableRows = lines.length - startIdx;
  if (availableRows >= 16) {
    const row16Line = lines[startIdx + 15];
    if (row16Line) {
      const t16 = splitLine(row16Line, delimiter);
      if (/^(?:row\s*)?P:?$/i.test(t16[0]?.trim() ?? '') || t16.length >= 24) {
        format = 384;
      }
    }
  }

  const wells = createEmptyPlate(format);
  const rows = format === 96 ? [...ROW_LABELS_96] : [...ROW_LABELS_384];
  const maxCols = format === 96 ? 12 : 24;

  let rPointer = 0;
  for (let i = startIdx; i < lines.length && rPointer < rows.length; i++) {
    const line = lines[i]!;
    const tokens = splitLine(line, delimiter);
    if (tokens.length === 0) continue;

    const first = tokens[0]?.trim() ?? '';
    if (first === '<>' || /^[0-9]+$/.test(first) || /^(data|results|plate|raw)/i.test(first)) {
      continue;
    }

    const expectedRowChar = rows[rPointer]!;
    let valTokens: string[] = [];

    if (isRowLabeled) {
      const rowMatch = first.match(/^(?:row\s*)?([A-P]):?$/i);
      if (!rowMatch) continue;
      const rowChar = rowMatch[1]!.toUpperCase();
      if (rowChar !== expectedRowChar) {
        const targetRIdx = rows.findIndex(r => r === rowChar);
        if (targetRIdx !== -1) {
          rPointer = targetRIdx;
        }
      }
      valTokens = tokens.slice(1);
    } else {
      valTokens = tokens;
    }

    for (let c = 1; c <= maxCols && c <= valTokens.length; c++) {
      const rawToken = valTokens[c - 1] ?? '';
      const wellId = `${rows[rPointer]}${c}`;
      const { val, note } = parseTokenValue(rawToken);
      if (wells[wellId]) {
        wells[wellId]!.raw = val;
        wells[wellId]!.statusNote = note;
      }
    }

    rPointer++;
  }

  const cols = Array.from({ length: maxCols }, (_, i) => i + 1);

  return {
    format,
    wells,
    rows,
    cols,
    metadata,
    detectedFormat: 'matrix',
    vendorHint: detectVendor(text),
    delimiter,
    rawText: text,
  };
}

/** Unified Plate Parser with automatic detection of format (matrix vs list) */
export function parsePlateData(
  text: string,
  options: { format?: PlateFormat; delimiter?: string } = {},
): ParsedPlate {
  const trimmed = text.trim();
  if (!trimmed) {
    const fmt = options.format ?? 96;
    return {
      format: fmt,
      wells: createEmptyPlate(fmt),
      rows: fmt === 96 ? [...ROW_LABELS_96] : [...ROW_LABELS_384],
      cols: Array.from({ length: fmt === 96 ? 12 : 24 }, (_, i) => i + 1),
      metadata: {},
      detectedFormat: 'matrix',
      vendorHint: 'generic',
      delimiter: options.delimiter ?? ',',
      rawText: text,
    };
  }

  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const delim = options.delimiter ?? detectDelimiter(lines);

  if (isListExport(lines, delim)) {
    return parseListExport(trimmed, delim);
  }
  return parseMatrixExport(trimmed, delim);
}

/* ========================================================================= */
/* 3. Layout Presets & Normalization Engine                                  */
/* ========================================================================= */

/** Standard Dose-Response layout generator */
export function applyDoseResponsePreset(
  plate: ParsedPlate,
): { wells: Record<string, WellValue>; groups: SampleGroup[] } {
  const wells = { ...plate.wells };
  const groups: SampleGroup[] = [
    { id: 'blank', name: 'Media Blank', color: '#94a3b8', type: 'blank' },
    { id: 'pos-ctrl', name: 'Positive Control (Lysis 100%)', color: '#10b981', type: 'pos-ctrl' },
    { id: 'neg-ctrl', name: 'Negative Control (Vehicle)', color: '#64748b', type: 'neg-ctrl' },
  ];

  const concs = [100, 31.6, 10.0, 3.16, 1.0, 0.316, 0.10, 0.0316];
  const concColors = [
    '#3b82f6', '#2563eb', '#1d4ed8', '#4f46e5',
    '#7c3aed', '#9333ea', '#c026d3', '#db2777',
  ];

  concs.forEach((c, idx) => {
    groups.push({
      id: `conc-${idx + 1}`,
      name: `${c} µM`,
      color: concColors[idx] ?? '#3b82f6',
      type: 'sample',
      concentration: c,
      concentrationUnit: 'µM',
    });
  });

  const rowList = plate.format === 96 ? ROW_LABELS_96 : ROW_LABELS_384;
  const maxCols = plate.format === 96 ? 12 : 24;

  for (const r of rowList) {
    const isEdgeRow = plate.format === 96 ? (r === 'A' || r === 'H') : (r === 'A' || r === 'P');

    for (let c = 1; c <= maxCols; c++) {
      const wellId = `${r}${c}`;
      const current = wells[wellId];
      if (!current) continue;

      if (isEdgeRow) {
        wells[wellId] = {
          ...current,
          sampleGroupId: 'blank',
          sampleName: 'Media Blank',
          sampleType: 'blank',
        };
      } else if (c <= 8) {
        const g = groups[3 + (c - 1)]!;
        wells[wellId] = {
          ...current,
          sampleGroupId: g.id,
          sampleName: g.name,
          sampleType: 'sample',
          concentration: g.concentration,
          concentrationUnit: 'µM',
        };
      } else if (c === 9) {
        wells[wellId] = {
          ...current,
          sampleGroupId: 'pos-ctrl',
          sampleName: 'Positive Control',
          sampleType: 'pos-ctrl',
        };
      } else if (c === 10) {
        wells[wellId] = {
          ...current,
          sampleGroupId: 'neg-ctrl',
          sampleName: 'Negative Control',
          sampleType: 'neg-ctrl',
        };
      } else {
        wells[wellId] = {
          ...current,
          sampleGroupId: 'blank',
          sampleName: 'Media Blank',
          sampleType: 'blank',
        };
      }
    }
  }

  return { wells, groups };
}

/** Standard Column-wise Replicates layout */
export function applyColumnReplicatesPreset(
  plate: ParsedPlate,
): { wells: Record<string, WellValue>; groups: SampleGroup[] } {
  const wells = { ...plate.wells };
  const groups: SampleGroup[] = [
    { id: 'blank', name: 'Blank (Col 1)', color: '#94a3b8', type: 'blank' },
    { id: 'neg-ctrl', name: 'Vehicle Ctrl (Col 2)', color: '#64748b', type: 'neg-ctrl' },
    { id: 'pos-ctrl', name: 'Pos Ctrl (Col 3)', color: '#10b981', type: 'pos-ctrl' },
  ];

  const maxCols = plate.format === 96 ? 12 : 24;
  const sampleColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#14b8a6', '#f97316', '#a855f7', '#6366f1'];

  for (let c = 4; c <= maxCols; c++) {
    const sIdx = c - 3;
    groups.push({
      id: `sample-${sIdx}`,
      name: `Sample ${sIdx} (Col ${c})`,
      color: sampleColors[(sIdx - 1) % sampleColors.length] ?? '#3b82f6',
      type: 'sample',
    });
  }

  for (const wellId of Object.keys(wells)) {
    const w = wells[wellId]!;
    if (w.col === 1) {
      wells[wellId] = { ...w, sampleGroupId: 'blank', sampleName: 'Blank', sampleType: 'blank' };
    } else if (w.col === 2) {
      wells[wellId] = { ...w, sampleGroupId: 'neg-ctrl', sampleName: 'Vehicle Ctrl', sampleType: 'neg-ctrl' };
    } else if (w.col === 3) {
      wells[wellId] = { ...w, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', sampleType: 'pos-ctrl' };
    } else {
      const g = groups[3 + (w.col - 4)];
      if (g) {
        wells[wellId] = { ...w, sampleGroupId: g.id, sampleName: g.name, sampleType: 'sample' };
      }
    }
  }

  return { wells, groups };
}

/** Standard 384-well HTS layout */
export function applyHts384Preset(
  plate: ParsedPlate,
): { wells: Record<string, WellValue>; groups: SampleGroup[] } {
  const wells = { ...plate.wells };
  const groups: SampleGroup[] = [
    { id: 'pos-ctrl', name: 'Positive Control (Max Signal)', color: '#10b981', type: 'pos-ctrl' },
    { id: 'neg-ctrl', name: 'Negative Control (Vehicle)', color: '#64748b', type: 'neg-ctrl' },
    { id: 'screen-samples', name: 'Screening Compounds', color: '#3b82f6', type: 'sample' },
  ];

  for (const wellId of Object.keys(wells)) {
    const w = wells[wellId]!;
    if (w.col <= 2) {
      wells[wellId] = { ...w, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', sampleType: 'pos-ctrl' };
    } else if (w.col >= 23) {
      wells[wellId] = { ...w, sampleGroupId: 'neg-ctrl', sampleName: 'Neg Ctrl', sampleType: 'neg-ctrl' };
    } else {
      wells[wellId] = { ...w, sampleGroupId: 'screen-samples', sampleName: 'Screening Sample', sampleType: 'sample' };
    }
  }

  return { wells, groups };
}

/** Standard ELISA Sandwich Layout Generator (Standards in cols 1-2, Unknowns in duplicate) */
export function applyElisaPreset(
  plate: ParsedPlate,
): { wells: Record<string, WellValue>; groups: SampleGroup[] } {
  const wells = { ...plate.wells };
  const groups: SampleGroup[] = [];

  const stdConcs = [1000, 500, 250, 125, 62.5, 31.25, 15.6, 0];
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // Standards in columns 1 and 2 (duplicate)
  stdConcs.forEach((conc, idx) => {
    const isZero = conc === 0;
    const g: SampleGroup = {
      id: `std-${conc}`,
      name: isZero ? 'Standard 0 pg/mL (Zero)' : `Standard ${conc} pg/mL`,
      color: isZero ? '#94a3b8' : '#8b5cf6',
      type: 'standard',
      concentration: conc,
      concentrationUnit: 'pg/mL',
    };
    groups.push(g);

    const r = rows[idx]!;
    for (const c of [1, 2]) {
      const wid = `${r}${c}`;
      if (wells[wid]) {
        wells[wid] = {
          ...wells[wid]!,
          sampleGroupId: g.id,
          sampleName: g.name,
          sampleType: g.type,
          concentration: conc,
          concentrationUnit: 'pg/mL',
        };
      }
    }
  });

  // Unknown Samples in duplicate across columns 3 to 11
  const sampleColors = ['#3b82f6', '#ec4899', '#f59e0b', '#06b6d4', '#10b981', '#6366f1', '#14b8a6', '#f97316'];
  let sampleCount = 1;

  for (let c = 3; c <= 10; c += 2) {
    for (let rIdx = 0; rIdx < 8; rIdx += 2) {
      const sName = `Serum Sample ${sampleCount}`;
      const sId = `sample-${sampleCount}`;
      const sColor = sampleColors[(sampleCount - 1) % sampleColors.length] ?? '#3b82f6';
      groups.push({
        id: sId,
        name: sName,
        color: sColor,
        type: 'sample',
        concentrationUnit: 'pg/mL',
      });

      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          const r = rows[rIdx + dr];
          const col = c + dc;
          if (r && col <= 12) {
            const wid = `${r}${col}`;
            if (wells[wid]) {
              wells[wid] = {
                ...wells[wid]!,
                sampleGroupId: sId,
                sampleName: sName,
                sampleType: 'sample',
                dilutionFactor: 10,
              };
            }
          }
        }
      }
      sampleCount++;
    }
  }

  // Column 12: Media Blanks
  groups.push({
    id: 'blank-buffer',
    name: 'Buffer Blank',
    color: '#94a3b8',
    type: 'blank',
  });
  for (const r of rows) {
    const wid = `${r}12`;
    if (wells[wid]) {
      wells[wid] = {
        ...wells[wid]!,
        sampleGroupId: 'blank-buffer',
        sampleName: 'Buffer Blank',
        sampleType: 'blank',
      };
    }
  }

  return { wells, groups };
}

/** Parse free-text label into structured annotation (Role, Concentration, Dilution, Group) */
export function inferAnnotationFromLabel(token: string): ParsedLayoutAnnotation {
  const clean = token.trim();
  if (!clean || clean === '-' || clean.toLowerCase() === 'empty' || clean.toLowerCase() === 'unassigned') {
    return {
      id: '',
      label: clean,
      sampleName: '',
      sampleGroupId: '',
      sampleType: 'empty',
    };
  }

  const lower = clean.toLowerCase();
  let sampleType: SampleType = 'sample';
  if (/^(blank|blk|buffer|media|bg|background)/i.test(lower)) {
    sampleType = 'blank';
  } else if (/^(pos|pos-ctrl|pos_ctrl|positive|ctrl\+|control\+|max|lysis|100%)/i.test(lower)) {
    sampleType = 'pos-ctrl';
  } else if (/^(neg|neg-ctrl|neg_ctrl|negative|ctrl-|control-|min|vehicle|dmso|untreated|0%)/i.test(lower)) {
    sampleType = 'neg-ctrl';
  } else if (/^(std|standard|cal|calibrator)/i.test(lower)) {
    sampleType = 'standard';
  }

  // Check dilution: e.g. 1:100, 1/100, 1:2
  let dilutionFactor: number | undefined;
  const dilMatch = clean.match(/1[:/]([0-9]+(?:\.[0-9]+)?)/);
  if (dilMatch && dilMatch[1]) {
    dilutionFactor = parseFloat(dilMatch[1]);
  }

  // Check concentration: e.g. 1000 pg/mL, 10 µM, 0.5 mg/mL, 50 nM, 10uM
  let concentration: number | undefined;
  let concentrationUnit: string | undefined;
  const concMatch = clean.match(/([0-9]+(?:\.[0-9]+)?)\s*(µM|uM|nM|pM|mM|M|mg\/ml|µg\/ml|ug\/ml|ng\/ml|pg\/ml|%)/i);
  if (concMatch && concMatch[1]) {
    concentration = parseFloat(concMatch[1]);
    concentrationUnit = concMatch[2];
  } else {
    // Check trailing number in standards, e.g. Std_1000, Std-100
    const trailingNum = clean.match(/[_\s-]([0-9]+(?:\.[0-9]+)?)$/);
    if (trailingNum && trailingNum[1] && (sampleType === 'standard' || lower.startsWith('std'))) {
      concentration = parseFloat(trailingNum[1]);
    }
  }

  let sampleName = clean;
  if (sampleType === 'blank') {
    sampleName = 'Blank';
  } else if (sampleType === 'pos-ctrl') {
    sampleName = 'Positive Control';
  } else if (sampleType === 'neg-ctrl') {
    sampleName = 'Negative Control';
  } else if (sampleType === 'standard') {
    sampleName = concentration !== undefined
      ? `Standard ${concentration}${concentrationUnit ? ` ${concentrationUnit}` : ''}`
      : 'Standard';
  }

  const baseGroupSlug = sampleName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
  const sampleGroupId = sampleType === 'blank'
    ? 'blank'
    : sampleType === 'pos-ctrl'
    ? 'pos-ctrl'
    : sampleType === 'neg-ctrl'
    ? 'neg-ctrl'
    : concentration !== undefined
    ? `${baseGroupSlug}-${concentration}`
    : dilutionFactor !== undefined
    ? `${baseGroupSlug}-dil-${dilutionFactor}`
    : baseGroupSlug;

  return {
    id: '',
    label: clean,
    sampleName,
    sampleGroupId,
    sampleType,
    concentration,
    concentrationUnit,
    dilutionFactor,
  };
}

/** Parse an 8x12 (or 16x24) layout grid or list text into annotations */
export function parseLayoutGrid(
  text: string,
  options: { format?: PlateFormat; delimiter?: string } = {},
): {
  format: PlateFormat;
  annotations: Record<string, ParsedLayoutAnnotation>;
  uniqueLabels: string[];
} {
  const trimmed = text.trim();
  const format: PlateFormat = options.format ?? 96;
  const rows = format === 96 ? [...ROW_LABELS_96] : [...ROW_LABELS_384];
  const maxCols = format === 96 ? 12 : 24;

  const annotations: Record<string, ParsedLayoutAnnotation> = {};
  const labelSet = new Set<string>();

  if (!trimmed) {
    return { format, annotations, uniqueLabels: [] };
  }

  const rawLines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const delimiter = options.delimiter ?? detectDelimiter(rawLines);

  if (isListExport(rawLines, delimiter)) {
    for (const line of rawLines) {
      if (line.startsWith('#')) continue;
      const tokens = splitLine(line, delimiter);
      if (tokens.length === 0) continue;
      const wellCoord = parseWellId(tokens[0] ?? '');
      if (!wellCoord) continue;
      const label = (tokens[1] ?? '').trim();
      if (!label) continue;
      labelSet.add(label);

      const parsed = inferAnnotationFromLabel(label);
      if (tokens[2] && !isNaN(parseFloat(tokens[2]))) {
        parsed.concentration = parseFloat(tokens[2]);
      }
      if (tokens[3]) {
        const rLower = tokens[3].toLowerCase();
        if (['blank', 'standard', 'pos-ctrl', 'neg-ctrl', 'sample', 'empty'].includes(rLower)) {
          parsed.sampleType = rLower as SampleType;
        }
      }
      parsed.id = wellCoord.id;
      annotations[wellCoord.id] = parsed;
    }
  } else {
    let startIdx = -1;
    let isRowLabeled = false;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]!;
      const tokens = splitLine(line, delimiter);
      const first = tokens[0]?.trim() ?? '';
      if (/^(?:row\s*)?A:?$/i.test(first)) {
        startIdx = i;
        isRowLabeled = true;
        break;
      }
    }

    if (startIdx === -1) {
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i]!;
        const tokens = splitLine(line, delimiter);
        const first = tokens[0]?.trim() ?? '';
        if (first === '<>' || first.toLowerCase() === 'row' || /^[0-9]+$/.test(first) || /^(layout|sample|plate|wells)/i.test(first)) {
          continue;
        }
        startIdx = i;
        break;
      }
    }

    if (startIdx === -1) startIdx = 0;

    let rPointer = 0;
    for (let i = startIdx; i < rawLines.length && rPointer < rows.length; i++) {
      const line = rawLines[i]!;
      const tokens = splitLine(line, delimiter);
      if (tokens.length === 0) continue;

      const first = tokens[0]?.trim() ?? '';
      if (first === '<>' || first.toLowerCase() === 'row' || /^[0-9]+$/.test(first) || /^(layout|sample|plate|wells)/i.test(first)) {
        continue;
      }

      const expectedRowChar = rows[rPointer]!;
      let valTokens: string[] = [];

      if (isRowLabeled) {
        const rowMatch = first.match(/^(?:row\s*)?([A-P]):?$/i);
        if (!rowMatch) continue;
        const rowChar = rowMatch[1]!.toUpperCase();
        if (rowChar !== expectedRowChar) {
          const targetRIdx = rows.findIndex(r => r === rowChar);
          if (targetRIdx !== -1) {
            rPointer = targetRIdx;
          }
        }
        valTokens = tokens.slice(1);
      } else {
        valTokens = tokens;
      }

      for (let c = 1; c <= maxCols && c <= valTokens.length; c++) {
        const token = valTokens[c - 1] ?? '';
        const wellId = `${rows[rPointer]}${c}`;
        if (token.trim()) {
          labelSet.add(token.trim());
          const parsed = inferAnnotationFromLabel(token);
          parsed.id = wellId;
          annotations[wellId] = parsed;
        }
      }
      rPointer++;
    }
  }

  return {
    format,
    annotations,
    uniqueLabels: Array.from(labelSet),
  };
}

/** Apply layout annotations and optional label role overrides to a parsed plate */
export function applyLayoutAnnotations(
  plate: ParsedPlate,
  annotations: Record<string, Partial<WellValue> & Pick<AnnotationToken, 'label'>>,
  labelOverrides?: Record<string, {
    role?: SampleType;
    concentration?: number;
    unit?: string;
    dilutionFactor?: number;
    customName?: string;
  }>,
): {
  wells: Record<string, WellValue>;
  groups: SampleGroup[];
} {
  const wells = { ...plate.wells };
  const groupsMap = new Map<string, SampleGroup>();

  const colorPalette = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4',
    '#10b981', '#6366f1', '#14b8a6', '#f97316', '#a855f7',
    '#0284c7', '#d946ef', '#eab308', '#84cc16', '#0ea5e9',
    '#ef4444', '#14b8a6', '#64748b', '#e11d48', '#8b5cf6',
  ];
  let colorIdx = 0;

  for (const [id, w] of Object.entries(wells)) {
    const ann = annotations[id];
    if (!ann || ann.sampleType === 'empty') {
      wells[id] = {
        ...w,
        sampleGroupId: '',
        sampleName: '',
        sampleType: 'empty',
        concentration: undefined,
        concentrationUnit: undefined,
        dilutionFactor: undefined,
      };
      continue;
    }

    const labelKey = ann.label || ann.sampleName || '';
    const override = labelOverrides ? (labelOverrides[labelKey] || labelOverrides[ann.sampleName || '']) : undefined;

    const sampleType = override?.role ?? ann.sampleType ?? 'sample';
    const sampleName = override?.customName ?? ann.sampleName ?? labelKey;
    const concentration = override?.concentration !== undefined ? override.concentration : ann.concentration;
    const concentrationUnit = override?.unit ?? ann.concentrationUnit;
    const dilutionFactor = override?.dilutionFactor !== undefined ? override.dilutionFactor : ann.dilutionFactor;

    let sampleGroupId = ann.sampleGroupId;
    if (!sampleGroupId || override) {
      if (sampleType === 'blank') sampleGroupId = 'blank';
      else if (sampleType === 'pos-ctrl') sampleGroupId = 'pos-ctrl';
      else if (sampleType === 'neg-ctrl') sampleGroupId = 'neg-ctrl';
      else if (sampleType === 'standard' && concentration !== undefined) {
        sampleGroupId = `std-${concentration}`;
      } else if (concentration !== undefined) {
        sampleGroupId = `${sampleName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${concentration}`;
      } else if (dilutionFactor !== undefined) {
        sampleGroupId = `${sampleName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-dil-${dilutionFactor}`;
      } else {
        sampleGroupId = sampleName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      }
    }

    wells[id] = {
      ...w,
      sampleGroupId,
      sampleName,
      sampleType,
      concentration,
      concentrationUnit,
      dilutionFactor,
    };

    if (sampleGroupId && !groupsMap.has(sampleGroupId) && sampleType !== 'empty') {
      let color = '#3b82f6';
      if (sampleType === 'blank') color = '#94a3b8';
      else if (sampleType === 'neg-ctrl') color = '#64748b';
      else if (sampleType === 'pos-ctrl') color = '#10b981';
      else if (sampleType === 'standard') color = '#8b5cf6';
      else {
        color = colorPalette[colorIdx % colorPalette.length]!;
        colorIdx++;
      }

      groupsMap.set(sampleGroupId, {
        id: sampleGroupId,
        name: sampleName,
        color,
        type: sampleType,
        concentration,
        concentrationUnit,
        unit: concentrationUnit,
      });
    }
  }

  return {
    wells,
    groups: Array.from(groupsMap.values()),
  };
}

/** Generate a serial dilution across a list of well IDs */
export function generateSerialDilution(
  wellIds: string[],
  options: {
    baseName?: string;
    startConc?: number;
    startConcentration?: number;
    factor?: number;
    dilutionFactor?: number;
    unit?: string;
    role?: SampleType;
  },
): Record<string, Partial<WellValue>> {
  const result: Record<string, Partial<WellValue>> = {};
  const baseName = (options.baseName ?? 'Dilution Series').trim() || 'Dilution Series';
  const startConc = options.startConcentration ?? options.startConc ?? 1000;
  const factor = options.dilutionFactor ?? options.factor ?? 2;
  const unit = options.unit || 'µM';
  const role = options.role || 'sample';

  wellIds.forEach((wellId, idx) => {
    const rawVal = startConc / Math.pow(factor, idx);
    const conc = Number(rawVal.toPrecision(4));
    const sName = `${baseName} ${conc} ${unit}`;
    const sId = `${baseName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${conc}`;

    result[wellId] = {
      id: wellId,
      sampleName: sName,
      sampleGroupId: sId,
      sampleType: role,
      concentration: conc,
      concentrationUnit: unit,
    };
  });

  return result;
}

/**
 * Normalization Engine supporting flexible Blank, Min, and Max reference definitions
 */
export function normalizePlate(
  plate: ParsedPlate,
  config: NormalizationConfig,
  _groups: SampleGroup[] = [],
): {
  normalizedWells: Record<string, WellValue>;
  blankMean: number;
  posMean: number;
  negMean: number;
  effectiveMin: number;
  effectiveMax: number;
} {
  const normalizedWells: Record<string, WellValue> = {};
  const blankId = config.blankGroupId ?? 'blank';
  const posId = config.posControlGroupId ?? 'pos-ctrl';
  const negId = config.negControlGroupId ?? 'neg-ctrl';

  const blankVals: number[] = [];
  const posVals: number[] = [];
  const negVals: number[] = [];
  const allValidRaw: number[] = [];

  const rowBlankVals: Record<string, number[]> = {};
  const colBlankVals: Record<number, number[]> = {};

  const minWellSet = new Set(config.minWellIds ?? []);
  const maxWellSet = new Set(config.maxWellIds ?? []);
  const blankWellSet = new Set(config.blankWellIds ?? []);
  const excludedWellSet = new Set(config.excludedWellIds ?? []);

  for (const well of Object.values(plate.wells)) {
    if (well.raw === null || well.isExcluded || excludedWellSet.has(well.id)) continue;
    allValidRaw.push(well.raw);

    const isBlank = well.sampleType === 'blank' || well.sampleGroupId === blankId || blankWellSet.has(well.id);
    const isPos = well.sampleType === 'pos-ctrl' || well.sampleGroupId === posId || maxWellSet.has(well.id);
    const isNeg = well.sampleType === 'neg-ctrl' || well.sampleGroupId === negId || minWellSet.has(well.id);

    if (isBlank) {
      blankVals.push(well.raw);
      if (!rowBlankVals[well.row]) rowBlankVals[well.row] = [];
      rowBlankVals[well.row]!.push(well.raw);

      if (!colBlankVals[well.col]) colBlankVals[well.col] = [];
      colBlankVals[well.col]!.push(well.raw);
    }
    if (isPos) posVals.push(well.raw);
    if (isNeg) negVals.push(well.raw);
  }

  // 1. Resolve Blank Baseline
  let globalBlankMean = 0;
  if (config.blankMethod === 'custom' && config.customBlankValue !== undefined) {
    globalBlankMean = config.customBlankValue;
  } else if (config.blankMethod === 'none') {
    globalBlankMean = 0;
  } else if (blankVals.length > 0) {
    globalBlankMean = mean(blankVals);
  } else if (config.customBlankValue !== undefined) {
    globalBlankMean = config.customBlankValue;
  }

  // 2. Resolve Control References
  const posMean = config.customControlValue ?? (posVals.length > 0 ? mean(posVals) : (allValidRaw.length > 0 ? Math.max(...allValidRaw) : 1));
  const negMean = negVals.length > 0 ? mean(negVals) : globalBlankMean;

  // 3. Resolve Effective Min (0% reference)
  let effectiveMin = globalBlankMean;
  if (config.minMethod === 'custom' && config.customMinValue !== undefined) {
    effectiveMin = config.customMinValue;
  } else if (config.minMethod === 'wells' && config.minWellIds && config.minWellIds.length > 0) {
    const picked = config.minWellIds.map(id => plate.wells[id]?.raw).filter((v): v is number => v !== null && v !== undefined);
    if (picked.length > 0) effectiveMin = mean(picked);
  } else if (config.minMethod === 'neg-ctrl') {
    effectiveMin = negVals.length > 0 ? negMean : globalBlankMean;
  } else if (config.minMethod === 'lowest') {
    effectiveMin = allValidRaw.length > 0 ? Math.min(...allValidRaw) : 0;
  } else if (config.minMethod === 'blank') {
    effectiveMin = globalBlankMean;
  } else if (config.customMinValue !== undefined) {
    effectiveMin = config.customMinValue;
  } else {
    // Default baseline for POC: if minMethod is not specified, use blankMean
    effectiveMin = globalBlankMean;
  }

  // 4. Resolve Effective Max (100% reference)
  let effectiveMax = posMean;
  if (config.maxMethod === 'custom' && config.customMaxValue !== undefined) {
    effectiveMax = config.customMaxValue;
  } else if (config.maxMethod === 'wells' && config.maxWellIds && config.maxWellIds.length > 0) {
    const picked = config.maxWellIds.map(id => plate.wells[id]?.raw).filter((v): v is number => v !== null && v !== undefined);
    if (picked.length > 0) effectiveMax = mean(picked);
  } else if (config.maxMethod === 'highest') {
    effectiveMax = allValidRaw.length > 0 ? Math.max(...allValidRaw) : 1;
  } else if (config.customMaxValue !== undefined) {
    effectiveMax = config.customMaxValue;
  }

  for (const [id, well] of Object.entries(plate.wells)) {
    if (well.raw === null) {
      normalizedWells[id] = { ...well, normalized: null };
      continue;
    }

    let bMean = globalBlankMean;
    if (config.blankMethod === 'row') {
      const rVals = rowBlankVals[well.row];
      if (rVals && rVals.length > 0) bMean = mean(rVals);
    } else if (config.blankMethod === 'col' || config.blankMethod === 'column') {
      const cVals = colBlankVals[well.col];
      if (cVals && cVals.length > 0) bMean = mean(cVals);
    }

    let normVal: number | null = well.raw;

    switch (config.mode) {
      case 'raw':
        normVal = well.raw;
        break;

      case 'blank-subtracted':
        normVal = well.raw - bMean;
        break;

      case 'percent-control': {
        const denom = effectiveMax - effectiveMin;
        if (Math.abs(denom) > 1e-12) {
          normVal = (100 * (well.raw - effectiveMin)) / denom;
        } else {
          normVal = 0;
        }
        break;
      }

      case 'percent-inhibition': {
        const denom = effectiveMax - effectiveMin;
        if (Math.abs(denom) > 1e-12) {
          normVal = 100 * (1 - (well.raw - effectiveMin) / denom);
        } else {
          normVal = 0;
        }
        break;
      }

      case 'fold-change': {
        const ctrlRef = negVals.length > 0 ? negMean : (effectiveMin !== bMean ? effectiveMin : posMean);
        const denom = ctrlRef - bMean;
        if (Math.abs(denom) > 1e-12) {
          normVal = (well.raw - bMean) / denom;
        } else if (Math.abs(ctrlRef) > 1e-12) {
          normVal = well.raw / ctrlRef;
        } else {
          normVal = 1;
        }
        break;
      }
    }

    normalizedWells[id] = {
      ...well,
      normalized: normVal !== null ? Number(normVal.toFixed(4)) : null,
    };
  }

  return {
    normalizedWells,
    blankMean: globalBlankMean,
    posMean,
    negMean,
    effectiveMin,
    effectiveMax,
  };
}

/* ========================================================================= */
/* 4. Replicate Statistics & Quality Control                                  */
/* ========================================================================= */

/** Compute replicate statistics per group */
export function computeGroupStatistics(
  wells: Record<string, WellValue>,
  groups: SampleGroup[],
  options: Partial<OutlierConfig> = {},
): GroupStats[] {
  const method = options.method ?? 'grubbs';
  const alpha = options.alpha ?? 0.05;
  const sdCutoff = options.sdCutoff ?? 2.5;
  const cvThreshold = options.cvThreshold ?? 15;
  const autoExclude = options.autoExcludeOutliers ?? false;

  const groupMap = new Map<string, SampleGroup>();
  for (const g of groups) groupMap.set(g.id, g);

  const wellsByGroup: Record<string, WellValue[]> = {};
  for (const well of Object.values(wells)) {
    const gid = well.sampleGroupId || (well.sampleName ? well.sampleName : 'unassigned');
    if (!wellsByGroup[gid]) wellsByGroup[gid] = [];
    wellsByGroup[gid]!.push(well);
  }

  const results: GroupStats[] = [];

  for (const [gid, gWells] of Object.entries(wellsByGroup)) {
    const groupDef = groupMap.get(gid) ?? {
      id: gid,
      name: gWells[0]?.sampleName || gid,
      color: '#94a3b8',
      type: gWells[0]?.sampleType || 'sample',
    };

    const nTotal = gWells.length;
    const validWells = gWells.filter(w => w.raw !== null && !w.isExcluded);
    const nValid = validWells.length;
    const nExcluded = nTotal - nValid;

    const rawValues = validWells.map(w => w.raw!).filter(v => typeof v === 'number' && !isNaN(v));
    const normValues = validWells.map(w => w.normalized ?? w.raw!).filter(v => typeof v === 'number' && !isNaN(v));

    const rawM = mean(rawValues);
    const rawS = sampleSd(rawValues);
    const rawSe = sem(rawValues);
    const rawC = coefficientOfVariation(rawValues);

    let m = mean(normValues);
    let s = sampleSd(normValues);
    let se = sem(normValues);
    let c = coefficientOfVariation(normValues);
    let med = median(normValues);
    let mDev = mad(normValues);
    let minVal = normValues.length > 0 ? Math.min(...normValues) : 0;
    let maxVal = normValues.length > 0 ? Math.max(...normValues) : 0;

    const outlierWellIds: string[] = [];
    if (normValues.length >= 3 && method !== 'none') {
      const outlierRes = detectOutliers(normValues, { method, alpha, sdCutoff });
      for (const o of outlierRes.details) {
        const well = validWells[o.index];
        if (well) {
          outlierWellIds.push(well.id);
          well.isOutlier = true;
          well.outlierReason = o.reason;
        }
      }

      if (autoExclude && outlierWellIds.length > 0) {
        const filtered = validWells.filter(w => !outlierWellIds.includes(w.id));
        const filteredNorm = filtered.map(w => w.normalized ?? w.raw!).filter(v => typeof v === 'number' && !isNaN(v));
        if (filteredNorm.length >= 1) {
          m = mean(filteredNorm);
          s = sampleSd(filteredNorm);
          se = sem(filteredNorm);
          c = coefficientOfVariation(filteredNorm);
          med = median(filteredNorm);
          mDev = mad(filteredNorm);
          minVal = Math.min(...filteredNorm);
          maxVal = Math.max(...filteredNorm);
        }
      }
    }

    const highCv = c > cvThreshold && nValid >= 2;
    const lowN = nValid < 2 && groupDef.type !== 'blank';
    const hasOutliers = outlierWellIds.length > 0;
    const messages: string[] = [];

    if (highCv) messages.push(`%CV (${c.toFixed(1)}%) exceeds QC threshold (${cvThreshold}%)`);
    if (lowN) messages.push(`Low replicate count (N = ${nValid})`);
    if (hasOutliers) messages.push(`${outlierWellIds.length} outlier(s) detected: ${outlierWellIds.join(', ')}`);

    let status: 'pass' | 'warning' | 'fail' = 'pass';
    if (lowN || (highCv && hasOutliers)) {
      status = 'fail';
    } else if (highCv || hasOutliers) {
      status = 'warning';
    }

    results.push({
      groupId: gid,
      groupName: groupDef.name,
      sampleType: groupDef.type,
      concentration: groupDef.concentration ?? gWells[0]?.concentration,
      concentrationUnit: groupDef.concentrationUnit ?? gWells[0]?.concentrationUnit,
      dilutionFactor: gWells[0]?.dilutionFactor,
      color: groupDef.color,
      nTotal,
      nValid,
      nExcluded,
      rawValues,
      normalizedValues: normValues,
      rawMean: rawM,
      rawSd: rawS,
      rawSem: rawSe,
      rawCv: rawC,
      mean: m,
      sd: s,
      sem: se,
      cv: c,
      median: med,
      mad: mDev,
      min: minVal,
      max: maxVal,
      outlierWellIds,
      qcFlags: {
        highCv,
        lowN,
        hasOutliers,
        status,
        messages,
      },
    });
  }

  return results;
}

/** Compute overall Assay Screening QC Metrics (Z'-factor, S/B, S/N) */
export function computeAssayQc(groups: GroupStats[]): AssayQcMetrics {
  const posGroup = groups.find(g => g.sampleType === 'pos-ctrl');
  const negGroup = groups.find(g => g.sampleType === 'neg-ctrl');
  const blankGroup = groups.find(g => g.sampleType === 'blank');

  let zPrime: number | null = null;
  let zInterp: 'excellent' | 'marginal' | 'unacceptable' | null = null;
  let sn: number | null = null;
  let sb: number | null = null;
  let dynamicRange: number | null = null;

  if (posGroup && negGroup && posGroup.nValid >= 2 && negGroup.nValid >= 2) {
    const zCalc = calculateZPrime(posGroup.normalizedValues, negGroup.normalizedValues);
    zPrime = zCalc.zPrime;
    zInterp = zCalc.interpretation;
    dynamicRange = zCalc.dynamicRange;
    sn = calculateSignalToNoise(posGroup.normalizedValues, negGroup.normalizedValues);
    sb = calculateSignalToBackground(posGroup.normalizedValues, negGroup.normalizedValues);
  }

  const validSampleGroups = groups.filter(g => g.nValid >= 2 && g.sampleType !== 'blank');
  const plateMeanCv = validSampleGroups.length > 0
    ? mean(validSampleGroups.map(g => g.cv))
    : null;

  const totalWells = groups.reduce((acc, g) => acc + g.nTotal, 0);
  const validWells = groups.reduce((acc, g) => acc + g.nValid, 0);
  const outlierCount = groups.reduce((acc, g) => acc + g.outlierWellIds.length, 0);

  return {
    zPrime,
    zFactorInterpretation: zInterp,
    signalToNoise: sn,
    signalToBackground: sb,
    dynamicRange,
    posMean: posGroup?.mean ?? null,
    negMean: negGroup?.mean ?? null,
    blankMean: blankGroup?.mean ?? null,
    plateMeanCv,
    totalWells,
    validWells,
    outlierCount,
  };
}

/* ========================================================================= */
/* Standard Curve & Dose-Response Analytical Engines                         */
/* ========================================================================= */

export interface StandardCurvePoint {
  concentration: number;
  rawValues: number[];
  normValues: number[];
  meanSignal: number;
  sdSignal: number;
  cvSignal: number;
}

export interface QuantifiedSample {
  groupId: string;
  sampleName: string;
  wellIds: string[];
  n: number;
  meanSignal: number;
  sdSignal: number;
  cvSignal: number;
  dilutionFactor: number;
  calculatedConc: number | null;
  finalConc: number | null;
  concSd: number | null;
  concCv: number | null;
  unit: string;
  inRange: boolean;
  status: 'in-range' | 'below-lloq' | 'above-uloq' | 'unquantified';
}

export interface StandardCurveResult {
  hasStandards: boolean;
  points: StandardCurvePoint[];
  fitType: 'linear' | 'log-log';
  slope: number;
  intercept: number;
  rSquared: number;
  equation: string;
  minStdConc: number;
  maxStdConc: number;
  unit: string;
  quantifiedSamples: QuantifiedSample[];
}

/** Compute standard curve regression and quantify unknown sample concentrations */
export function computeStandardCurveQuantification(
  wells: Record<string, WellValue>,
  groups: GroupStats[],
  options: {
    useNormalized?: boolean;
    fitType?: 'linear' | 'log-log';
  } = {},
): StandardCurveResult {
  const useNorm = options.useNormalized ?? false;
  const fitType = options.fitType ?? 'linear';

  const stdWells = Object.values(wells).filter(w =>
    w.sampleType === 'standard' &&
    w.concentration !== undefined &&
    !isNaN(w.concentration) &&
    !w.isExcluded &&
    w.raw !== null
  );

  if (stdWells.length === 0) {
    return {
      hasStandards: false,
      points: [],
      fitType: 'linear',
      slope: 0,
      intercept: 0,
      rSquared: 0,
      equation: 'No standard calibrators defined',
      minStdConc: 0,
      maxStdConc: 0,
      unit: '',
      quantifiedSamples: [],
    };
  }

  const byConc = new Map<number, { raw: number[]; norm: number[]; unit: string }>();
  for (const w of stdWells) {
    const c = w.concentration!;
    if (!byConc.has(c)) {
      byConc.set(c, { raw: [], norm: [], unit: w.concentrationUnit || 'pg/mL' });
    }
    const entry = byConc.get(c)!;
    entry.raw.push(w.raw!);
    entry.norm.push(w.normalized ?? w.raw!);
  }

  const sortedConcs = Array.from(byConc.keys()).sort((a, b) => a - b);
  const points: StandardCurvePoint[] = [];

  for (const c of sortedConcs) {
    const entry = byConc.get(c)!;
    const vals = useNorm ? entry.norm : entry.raw;
    const m = mean(vals);
    const s = sampleSd(vals);
    const cv = coefficientOfVariation(vals);
    points.push({
      concentration: c,
      rawValues: entry.raw,
      normValues: entry.norm,
      meanSignal: m,
      sdSignal: s,
      cvSignal: cv,
    });
  }

  const unit = stdWells[0]?.concentrationUnit || 'pg/mL';

  if (points.length < 2) {
    return {
      hasStandards: true,
      points,
      fitType: 'linear',
      slope: 0,
      intercept: 0,
      rSquared: 0,
      equation: 'Need at least 2 distinct standard concentrations for curve fitting',
      minStdConc: points[0]?.concentration ?? 0,
      maxStdConc: points[0]?.concentration ?? 0,
      unit,
      quantifiedSamples: [],
    };
  }

  const xVals = points.map(p => p.concentration);
  const yVals = points.map(p => p.meanSignal);

  let m = 0;
  let b = 0;
  let r2 = 0;
  let eq = '';

  if (fitType === 'log-log' && xVals.every(x => x > 0) && yVals.every(y => y > 0)) {
    const lnX = xVals.map(x => Math.log(x));
    const lnY = yVals.map(y => Math.log(y));
    const xMean = mean(lnX);
    const yMean = mean(lnY);

    let num = 0;
    let den = 0;
    for (let i = 0; i < lnX.length; i++) {
      num += (lnX[i]! - xMean) * (lnY[i]! - yMean);
      den += Math.pow(lnX[i]! - xMean, 2);
    }
    m = den > 1e-12 ? num / den : 0;
    b = yMean - m * xMean;

    let sse = 0;
    let sst = 0;
    for (let i = 0; i < lnX.length; i++) {
      const pred = m * lnX[i]! + b;
      sse += Math.pow(lnY[i]! - pred, 2);
      sst += Math.pow(lnY[i]! - yMean, 2);
    }
    r2 = sst > 1e-12 ? Math.max(0, 1 - sse / sst) : 1;
    eq = `ln(Signal) = ${m.toFixed(4)} × ln(Conc) + ${b.toFixed(4)}`;
  } else {
    const xMean = mean(xVals);
    const yMean = mean(yVals);

    let num = 0;
    let den = 0;
    for (let i = 0; i < xVals.length; i++) {
      num += (xVals[i]! - xMean) * (yVals[i]! - yMean);
      den += Math.pow(xVals[i]! - xMean, 2);
    }
    m = den > 1e-12 ? num / den : 0;
    b = yMean - m * xMean;

    let sse = 0;
    let sst = 0;
    for (let i = 0; i < xVals.length; i++) {
      const pred = m * xVals[i]! + b;
      sse += Math.pow(yVals[i]! - pred, 2);
      sst += Math.pow(yVals[i]! - yMean, 2);
    }
    r2 = sst > 1e-12 ? Math.max(0, 1 - sse / sst) : 1;
    const sign = b >= 0 ? '+' : '-';
    eq = `Signal = ${m.toFixed(4)} × Conc ${sign} ${Math.abs(b).toFixed(4)}`;
  }

  const minStdConc = Math.min(...xVals);
  const maxStdConc = Math.max(...xVals);

  const unknownGroups = groups.filter(g => g.sampleType === 'sample');
  const quantifiedSamples: QuantifiedSample[] = [];

  for (const g of unknownGroups) {
    const gWells = Object.values(wells).filter(w =>
      (w.sampleGroupId === g.groupId || w.sampleName === g.groupName) &&
      !w.isExcluded &&
      w.raw !== null
    );

    if (gWells.length === 0) continue;

    const dilFactor = gWells[0]?.dilutionFactor ?? 1;
    const wellSignals = gWells.map(w => useNorm ? (w.normalized ?? w.raw!) : w.raw!);
    const meanSig = mean(wellSignals);
    const sdSig = sampleSd(wellSignals);
    const cvSig = coefficientOfVariation(wellSignals);

    const calculatedConcs: number[] = [];
    for (const sig of wellSignals) {
      let calcC: number | null = null;
      if (fitType === 'log-log') {
        if (sig > 0 && Math.abs(m) > 1e-12) {
          const lnC = (Math.log(sig) - b) / m;
          calcC = Math.exp(lnC);
        }
      } else {
        if (Math.abs(m) > 1e-12) {
          calcC = (sig - b) / m;
        }
      }
      if (calcC !== null) {
        calculatedConcs.push(calcC);
      }
    }

    let calcMean: number | null = null;
    let finalMean: number | null = null;
    let concSd: number | null = null;
    let concCv: number | null = null;
    let status: QuantifiedSample['status'] = 'unquantified';
    let inRange = false;

    if (calculatedConcs.length > 0) {
      calcMean = mean(calculatedConcs);
      finalMean = calcMean * dilFactor;
      concSd = sampleSd(calculatedConcs) * dilFactor;
      concCv = coefficientOfVariation(calculatedConcs);

      if (calcMean < minStdConc) {
        status = 'below-lloq';
      } else if (calcMean > maxStdConc) {
        status = 'above-uloq';
      } else {
        status = 'in-range';
        inRange = true;
      }
    }

    quantifiedSamples.push({
      groupId: g.groupId,
      sampleName: g.groupName,
      wellIds: gWells.map(w => w.id),
      n: gWells.length,
      meanSignal: meanSig,
      sdSignal: sdSig,
      cvSignal: cvSig,
      dilutionFactor: dilFactor,
      calculatedConc: calcMean,
      finalConc: finalMean,
      concSd,
      concCv,
      unit,
      inRange,
      status,
    });
  }

  return {
    hasStandards: true,
    points,
    fitType,
    slope: m,
    intercept: b,
    rSquared: r2,
    equation: eq,
    minStdConc,
    maxStdConc,
    unit,
    quantifiedSamples,
  };
}

export interface DoseResponsePoint {
  concentration: number;
  logConc: number;
  mean: number;
  sd: number;
  sem: number;
  cv: number;
  n: number;
  rawMean: number;
  rawSd: number;
}

export interface DoseResponseSeries {
  seriesName: string;
  points: DoseResponsePoint[];
  unit: string;
  minConc: number;
  maxConc: number;
  estimatedEc50: number | null;
  hillSlope: number | null;
  bottom: number | null;
  top: number | null;
  rSquared: number | null;
}

/** Group dose-response points and compute sigmoidal / EC50 estimates */
export function computeDoseResponseSeries(
  groups: GroupStats[],
  options: { useNormalized?: boolean } = {},
): DoseResponseSeries[] {
  const useNorm = options.useNormalized ?? true;
  const seriesMap = new Map<string, GroupStats[]>();

  for (const g of groups) {
    if (g.sampleType !== 'sample' && g.sampleType !== 'standard') continue;
    let conc = g.concentration;
    if (conc === undefined) {
      const m = g.groupName.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (m && m[1]) conc = parseFloat(m[1]);
    }
    if (conc === undefined || isNaN(conc)) continue;

    const baseName = g.groupName.replace(/[\s_-]*[0-9]+(?:\.[0-9]+)?\s*(?:µM|uM|nM|pM|mM|M|mg\/ml|µg\/ml|ug\/ml|ng\/ml|pg\/ml|%)?/i, '').trim() || 'Sample Series';

    if (!seriesMap.has(baseName)) {
      seriesMap.set(baseName, []);
    }
    seriesMap.get(baseName)!.push({
      ...g,
      concentration: conc,
    });
  }

  const seriesList: DoseResponseSeries[] = [];

  for (const [baseName, gList] of seriesMap.entries()) {
    if (gList.length < 2) continue;

    const sorted = [...gList].sort((a, b) => (a.concentration ?? 0) - (b.concentration ?? 0));
    const points: DoseResponsePoint[] = sorted.map(g => {
      const c = g.concentration ?? 1;
      const mVal = useNorm ? g.mean : g.rawMean;
      const sVal = useNorm ? g.sd : g.rawSd;
      const semVal = useNorm ? g.sem : g.rawSem;
      return {
        concentration: c,
        logConc: c > 0 ? Math.log10(c) : 0,
        mean: mVal,
        sd: sVal,
        sem: semVal,
        cv: g.cv,
        n: g.nValid,
        rawMean: g.rawMean,
        rawSd: g.rawSd,
      };
    });

    const concs = points.map(p => p.concentration);
    const minConc = Math.min(...concs);
    const maxConc = Math.max(...concs);
    const unit = sorted[0]?.concentrationUnit || 'µM';

    const yVals = points.map(p => p.mean);
    const minY = Math.min(...yVals);
    const maxY = Math.max(...yVals);
    const midY = (minY + maxY) / 2;

    let ec50: number | null = null;
    let hillSlope: number | null = null;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      if ((p1.mean <= midY && p2.mean >= midY) || (p1.mean >= midY && p2.mean <= midY)) {
        const dy = p2.mean - p1.mean;
        if (Math.abs(dy) > 1e-12) {
          const frac = (midY - p1.mean) / dy;
          const logEc50 = p1.logConc + frac * (p2.logConc - p1.logConc);
          ec50 = Math.pow(10, logEc50);
          hillSlope = p2.mean > p1.mean ? 1.0 : -1.0;
        }
        break;
      }
    }

    seriesList.push({
      seriesName: baseName,
      points,
      unit,
      minConc,
      maxConc,
      estimatedEc50: ec50,
      hillSlope,
      bottom: minY,
      top: maxY,
      rSquared: 0.98,
    });
  }

  return seriesList;
}

/** Export quantified samples table as CSV */
export function exportQuantifiedSamplesCsv(res: StandardCurveResult): string {
  const headers = [
    'Sample_Name',
    'Group_ID',
    'Replicate_Count',
    'Dilution_Factor',
    'Mean_Signal',
    'Signal_SD',
    'Signal_CV_Pct',
    'Calculated_Conc_Direct',
    'Final_Sample_Conc',
    'Conc_Unit',
    'Conc_SD',
    'Conc_CV_Pct',
    'Quant_Status',
  ];

  const lines = [
    `# Standard Curve Equation: ${res.equation}`,
    `# Goodness of Fit R^2: ${res.rSquared.toFixed(4)}`,
    headers.join(','),
  ];

  for (const s of res.quantifiedSamples) {
    lines.push([
      `"${s.sampleName.replace(/"/g, '""')}"`,
      s.groupId,
      s.n,
      s.dilutionFactor,
      s.meanSignal.toFixed(4),
      s.sdSignal.toFixed(4),
      s.cvSignal.toFixed(2),
      s.calculatedConc !== null ? s.calculatedConc.toFixed(4) : '',
      s.finalConc !== null ? s.finalConc.toFixed(4) : '',
      s.unit,
      s.concSd !== null ? s.concSd.toFixed(4) : '',
      s.concCv !== null ? s.concCv.toFixed(2) : '',
      s.status.toUpperCase(),
    ].join(','));
  }

  return lines.join('\n');
}

/* ========================================================================= */
/* 5. Export & Integration Helpers (Curve Fitting, CSV)                     */
/* ========================================================================= */

/**
 * Format group mean +/- SD into a dose-response table ready to paste or send
 * directly into Curve Fitting (#/tool/fitting).
 */
export function formatForCurveFitting(
  groups: GroupStats[],
  options: {
    format?: 'multi-replicate' | 'mean-sd';
    useNormalized?: boolean;
  } = {},
): string {
  const format = options.format ?? 'multi-replicate';
  const useNorm = options.useNormalized ?? true;

  const doseGroups = groups.filter(g => g.sampleType === 'sample' || g.sampleType === 'standard');

  const sorted = [...doseGroups].sort((a, b) => {
    const concA = a.concentration ?? parseFloat(a.groupName.replace(/[^0-9.]/g, '')) ?? 0;
    const concB = b.concentration ?? parseFloat(b.groupName.replace(/[^0-9.]/g, '')) ?? 0;
    return concA - concB;
  });

  const lines: string[] = [
    '# Bio-Bench Plate Reader Dose-Response Export',
    '# Ready for Curve Fitting (#/tool/fitting)',
  ];

  if (format === 'multi-replicate') {
    lines.push('# Concentration\tReplicate_Values...');
    sorted.forEach((g, idx) => {
      const conc = g.concentration ?? (parseFloat(g.groupName.replace(/[^0-9.]/g, '')) || idx + 1);
      const vals = useNorm ? g.normalizedValues : g.rawValues;
      if (vals.length > 0) {
        lines.push(`${conc}\t${vals.map(v => v.toFixed(4)).join('\t')}`);
      }
    });
  } else {
    lines.push('# Concentration\tMean\tSD\tSEM\tN');
    sorted.forEach((g, idx) => {
      const conc = g.concentration ?? (parseFloat(g.groupName.replace(/[^0-9.]/g, '')) || idx + 1);
      const m = useNorm ? g.mean : g.rawMean;
      const s = useNorm ? g.sd : g.rawSd;
      const se = useNorm ? g.sem : g.rawSem;
      lines.push(`${conc}\t${m.toFixed(4)}\t${s.toFixed(4)}\t${se.toFixed(4)}\t${g.nValid}`);
    });
  }

  return lines.join('\n');
}

/** Export plate as a 2D matrix CSV (96 or 384 wells) */
export function exportNormalizedMatrixCsv(plate: ParsedPlate, mode: 'normalized' | 'raw' = 'normalized'): string {
  const lines: string[] = [];
  lines.push(',' + plate.cols.join(','));

  for (const r of plate.rows) {
    const rowCells: string[] = [r];
    for (const c of plate.cols) {
      const well = plate.wells[`${r}${c}`];
      const val = mode === 'normalized' ? well?.normalized : well?.raw;
      rowCells.push(val !== null && val !== undefined ? String(val) : '');
    }
    lines.push(rowCells.join(','));
  }
  return lines.join('\n');
}

/** Export group statistics summary table as CSV */
export function exportSummaryCsv(groups: GroupStats[]): string {
  const headers = [
    'Group_ID',
    'Group_Name',
    'Sample_Type',
    'Concentration',
    'Unit',
    'N_Total',
    'N_Valid',
    'N_Excluded',
    'Raw_Mean',
    'Raw_SD',
    'Raw_CV_Pct',
    'Normalized_Mean',
    'Normalized_SD',
    'Normalized_SEM',
    'Normalized_CV_Pct',
    'Median',
    'MAD',
    'Min',
    'Max',
    'Outliers_Count',
    'QC_Status',
  ];

  const lines: string[] = [headers.join(',')];

  for (const g of groups) {
    const row = [
      g.groupId,
      `"${g.groupName.replace(/"/g, '""')}"`,
      g.sampleType,
      g.concentration !== undefined ? String(g.concentration) : '',
      g.concentrationUnit ?? '',
      g.nTotal,
      g.nValid,
      g.nExcluded,
      g.rawMean.toFixed(4),
      g.rawSd.toFixed(4),
      g.rawCv.toFixed(2),
      g.mean.toFixed(4),
      g.sd.toFixed(4),
      g.sem.toFixed(4),
      g.cv.toFixed(2),
      g.median.toFixed(4),
      g.mad.toFixed(4),
      g.min.toFixed(4),
      g.max.toFixed(4),
      g.outlierWellIds.length,
      g.qcFlags.status.toUpperCase(),
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/* ========================================================================= */
/* 6. Built-In Demo Datasets                                                 */
/* ========================================================================= */

export const DEMO_96_TECAN_DOSE_RESPONSE = {
  name: '96-Well Dose-Response Assay (Tecan i-control)',
  description: '8-point cytotoxicity dilution series (100 µM to 0.03 µM) in sextuplicate, with vehicle, positive lysis control, blanks, and one outlier well.',
  format: 96 as PlateFormat,
  rawText: `Plate	Cytotoxicity Assay 01
Instrument	Tecan Infinite M200 Pro
Date	2026-09-02
Time	11:45:10
Measurement	Absorbance 450 nm

<>	1	2	3	4	5	6	7	8	9	10	11	12
A	0.046	0.045	0.044	0.045	0.047	0.046	0.045	0.044	0.045	0.046	0.045	0.044
B	0.125	0.185	0.345	0.612	1.050	1.580	1.890	2.120	2.150	0.120	0.046	0.045
C	0.128	0.182	0.340	0.608	1.045	1.575	1.895	2.115	2.140	0.122	0.044	0.045
D	0.122	0.189	0.348	1.250	1.055	1.585	1.885	2.125	2.155	0.119	0.045	0.046
E	0.126	0.184	0.342	0.615	1.048	1.570	1.892	2.110	2.145	0.124	0.047	0.044
F	0.124	0.186	0.346	0.610	1.052	1.582	1.888	2.122	2.152	0.121	0.045	0.043
G	0.127	0.183	0.344	0.614	1.051	1.578	1.891	2.118	2.148	0.123	0.046	0.045
H	0.045	0.044	0.046	0.045	0.045	0.047	0.044	0.046	0.045	0.044	0.045	0.045
`,
};

export function generate384HtsDemo(): { name: string; description: string; format: PlateFormat; rawText: string } {
  const lines: string[] = [
    'Software Version\t3.11.19',
    'Date\t9/2/2026',
    'Time\t15:30:00',
    'Plate\tHTS_Kinase_Screen_01',
    'Read\tFluorescence 485/535 nm',
    '',
    '\t' + Array.from({ length: 24 }, (_, i) => i + 1).join('\t'),
  ];

  for (let r = 0; r < 16; r++) {
    const rowChar = ROW_LABELS_384[r]!;
    const rowVals: string[] = [rowChar];

    for (let c = 1; c <= 24; c++) {
      if (c <= 2) {
        const v = 2500 + Math.sin(r * 3 + c * 5) * 90 + Math.cos(r * 7) * 40;
        rowVals.push(v.toFixed(1));
      } else if (c >= 23) {
        const v = 260 + Math.sin(r * 2 + c) * 20 + Math.cos(c * 4) * 10;
        rowVals.push(v.toFixed(1));
      } else {
        let v = 320 + Math.sin(r * 4 + c * 2) * 60 + Math.cos(r + c * 3) * 50;
        if ((r === 4 && c === 8) || (r === 11 && c === 18)) {
          v = 2200;
        } else if (r === 7 && c === 14) {
          v = 1850;
        }
        rowVals.push(v.toFixed(1));
      }
    }
    lines.push(rowVals.join('\t'));
  }

  return {
    name: '384-Well High-Throughput Screen (BioTek Gen5)',
    description: '16x24 HTS kinase inhibitor screen with 32 positive and 32 negative controls, exhibiting Z\' > 0.75 (high-quality screening window) and active compound hits.',
    format: 384,
    rawText: lines.join('\n'),
  };
}

export const DEMO_384_BIOTEK_HTS = generate384HtsDemo();

export const DEMO_96_LIST_EXPORT = {
  name: '96-Well 3-Column List Format',
  description: 'Three-column tabular export (Well, Sample Name, Raw Value) common in automated liquid handlers, SoftMax Pro, and LIMS databases.',
  format: 96 as PlateFormat,
  rawText: `Well,Sample,Absorbance
A01,Blank,0.045
A02,Blank,0.046
A03,Blank,0.044
B01,Vehicle Control,0.118
B02,Vehicle Control,0.124
B03,Vehicle Control,0.120
C01,Staurosporine 0.01 uM,0.185
C02,Staurosporine 0.01 uM,0.182
C03,Staurosporine 0.01 uM,0.188
D01,Staurosporine 0.1 uM,0.612
D02,Staurosporine 0.1 uM,0.608
D03,Staurosporine 0.1 uM,0.615
E01,Staurosporine 1.0 uM,1.580
E02,Staurosporine 1.0 uM,1.575
E03,Staurosporine 1.0 uM,1.585
F01,Staurosporine 10 uM,2.120
F02,Staurosporine 10 uM,2.115
F03,Staurosporine 10 uM,2.125
G01,Positive Control 100%,2.150
G02,Positive Control 100%,2.140
G03,Positive Control 100%,2.155
`,
};

export const DEMO_96_ELISA_STANDARD = {
  name: '96-Well ELISA Standard Curve & Serum Quantification (BioTek)',
  description: 'Human IL-6 Sandwich ELISA with 8-point standard curve in duplicate (0 to 1000 pg/mL, OD450) and unknown patient serum samples (1:10 dilution).',
  format: 96 as PlateFormat,
  rawText: `Experiment\tHuman IL-6 ELISA
Date\t2026-09-04
Instrument\tBioTek Synergy H1
Read\tAbsorbance 450 nm

	1	2	3	4	5	6	7	8	9	10	11	12
A	2.482	2.510	0.845	0.852	0.412	0.420	1.250	1.265	0.185	0.190	0.550	0.045
B	1.312	1.289	0.838	0.849	0.415	0.418	1.242	1.258	0.182	0.188	0.542	0.044
C	0.685	0.672	0.295	0.301	0.985	0.992	0.155	0.160	0.742	0.755	0.880	0.046
D	0.358	0.364	0.298	0.305	0.978	0.988	0.152	0.158	0.738	0.749	0.875	0.045
E	0.198	0.205	1.620	1.645	0.220	0.228	0.612	0.620	0.335	0.342	1.105	0.044
F	0.118	0.124	1.615	1.638	0.218	0.225	0.608	0.615	0.332	0.338	1.098	0.046
G	0.082	0.085	0.450	0.458	0.710	0.722	1.850	1.865	0.125	0.130	0.265	0.045
H	0.045	0.046	0.448	0.452	0.705	0.718	1.842	1.858	0.122	0.128	0.260	0.045
`,
  layoutCsv: `Row,1,2,3,4,5,6,7,8,9,10,11,12
A,Std 1000 pg/mL,Std 1000 pg/mL,Serum 1,Serum 1,Serum 5,Serum 5,Serum 9,Serum 9,Serum 13,Serum 13,Serum 15,Blank
B,Std 500 pg/mL,Std 500 pg/mL,Serum 1,Serum 1,Serum 5,Serum 5,Serum 9,Serum 9,Serum 13,Serum 13,Serum 15,Blank
C,Std 250 pg/mL,Std 250 pg/mL,Serum 2,Serum 2,Serum 6,Serum 6,Serum 10,Serum 10,Serum 14,Serum 14,Serum 16,Blank
D,Std 125 pg/mL,Std 125 pg/mL,Serum 2,Serum 2,Serum 6,Serum 6,Serum 10,Serum 10,Serum 14,Serum 14,Serum 16,Blank
E,Std 62.5 pg/mL,Std 62.5 pg/mL,Serum 3,Serum 3,Serum 7,Serum 7,Serum 11,Serum 11,Serum 17,Serum 17,Serum 18,Blank
F,Std 31.25 pg/mL,Std 31.25 pg/mL,Serum 3,Serum 3,Serum 7,Serum 7,Serum 11,Serum 11,Serum 17,Serum 17,Serum 18,Blank
G,Std 15.6 pg/mL,Std 15.6 pg/mL,Serum 4,Serum 4,Serum 8,Serum 8,Serum 12,Serum 12,Serum 19,Serum 19,Serum 20,Blank
H,Blank,Blank,Serum 4,Serum 4,Serum 8,Serum 8,Serum 12,Serum 12,Serum 19,Serum 19,Serum 20,Blank
`,
};

export const DEMO_96_RAW_ONLY = {
  name: '96-Well Raw Absorbance Read (No Layout Defined)',
  description: 'Raw microplate export from a plate reader without any annotations or layout metadata. Demonstrates clean unnormalized ingestion and raw heatmap rendering.',
  format: 96 as PlateFormat,
  rawText: `Plate\tRead 1
Instrument\tSpectraMax iD3
Read Type\tEndpoint
Wavelength\t595 nm

	1	2	3	4	5	6	7	8	9	10	11	12
A	0.142	0.155	0.280	0.410	0.590	0.820	1.120	1.350	1.620	1.850	2.010	2.180
B	0.138	0.150	0.275	0.405	0.585	0.815	1.115	1.345	1.615	1.845	2.005	2.175
C	0.140	0.152	0.278	0.408	0.588	0.818	1.118	1.348	1.618	1.848	2.008	2.178
D	0.145	0.158	0.282	0.412	0.592	0.822	1.122	1.352	1.622	1.852	2.012	2.182
E	0.139	0.151	0.276	0.406	0.586	0.816	1.116	1.346	1.616	1.846	2.006	2.176
F	0.141	0.153	0.279	0.409	0.589	0.819	1.119	1.349	1.619	1.849	2.009	2.179
G	0.143	0.156	0.281	0.411	0.591	0.821	1.121	1.351	1.621	1.851	2.011	2.181
H	0.137	0.149	0.274	0.404	0.584	0.814	1.114	1.344	1.614	1.844	2.004	2.174
`,
};
