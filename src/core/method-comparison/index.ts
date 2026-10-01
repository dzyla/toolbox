/**
 * Bland–Altman method comparison.
 * Bland JM, Altman DG (1986) Lancet 327:307-310; Bland JM, Altman DG (1999) Stat Methods Med Res 8:135-160.
 * Bias = mean difference d̄; limits of agreement d̄ ± 1.96 s; 95% CIs use Student t with n − 1 df,
 * SE(bias) = s/√n and SE(limit) = s √(1/n + 1.96²/(2(n − 1))).
 */
import { centralTCdf, tCritical95 } from '@/core/stats';

export type DifferenceMode = 'raw' | 'percent' | 'log';

export interface PairedColumns {
  a: number[];
  b: number[];
  labelA: string;
  labelB: string;
  /** Human-readable notes about skipped lines or a detected header. */
  notes: string[];
}

export interface Interval { estimate: number; lower: number; upper: number }

export interface BlandAltmanResult {
  mode: DifferenceMode;
  n: number;
  /** Per-pair x (mean of the two methods) and y (the analysed difference, in the analysis scale). */
  means: number[];
  differences: number[];
  bias: Interval;
  sd: number;
  lowerLimit: Interval;
  upperLimit: Interval;
  tCritical: number;
  /** Regression of difference on mean (proportional bias). */
  slope: { estimate: number; standardError: number; t: number; p: number; intercept: number } | null;
  /** Back-transformed ratios for the log analysis (bias and limits as ratios of A to B). */
  ratios?: { bias: Interval; lowerLimit: Interval; upperLimit: Interval };
  warnings: string[];
}

const Z = 1.96;

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === 'whitespace') return line.trim().split(/\s+/);
  return line.split(delimiter).map(cell => cell.trim().replace(/^"(.*)"$/, '$1'));
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 10).join('\n');
  if (sample.includes('\t')) return '\t';
  if (sample.includes(';')) return ';';
  if (sample.includes(',')) return ',';
  return 'whitespace';
}

const toNumber = (cell: string | undefined): number => {
  if (cell === undefined || cell.trim() === '') return NaN;
  return Number(cell.trim().replace(/^\+/, ''));
};

/**
 * Parse two columns of paired measurements from pasted or imported CSV/TSV/space text.
 * The first two columns are used. A non-numeric first row is taken as the header.
 * Rows with a missing or non-numeric value are skipped and counted in `notes`.
 */
export function parsePairedColumns(text: string): PairedColumns {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
  if (!lines.length) throw new RangeError('Paste or import two columns of paired measurements.');
  const delimiter = detectDelimiter(lines);
  const rows = lines.map(line => splitLine(line, delimiter));
  const notes: string[] = [];
  let labelA = 'Method A', labelB = 'Method B';
  let start = 0;
  const first = rows[0]!;
  if (first.length >= 2 && (Number.isNaN(toNumber(first[0])) || Number.isNaN(toNumber(first[1])))) {
    if (first[0]) labelA = first[0];
    if (first[1]) labelB = first[1];
    start = 1;
    notes.push(`First row used as column names: ${labelA}, ${labelB}.`);
  }
  const a: number[] = [], b: number[] = [];
  let skipped = 0;
  for (const row of rows.slice(start)) {
    const x = toNumber(row[0]), y = toNumber(row[1]);
    if (row.length < 2 || !Number.isFinite(x) || !Number.isFinite(y)) { skipped++; continue; }
    a.push(x); b.push(y);
  }
  if (skipped) notes.push(`${skipped} row${skipped === 1 ? '' : 's'} skipped because a value was missing or not a number.`);
  if (rows[0] && rows[0].length > 2) notes.push('More than two columns found; only the first two were used.');
  return { a, b, labelA, labelB, notes };
}

function mean(values: number[]): number { return values.reduce((s, v) => s + v, 0) / values.length; }

function interval(estimate: number, halfWidth: number): Interval {
  return { estimate, lower: estimate - halfWidth, upper: estimate + halfWidth };
}

/**
 * Two-sided p-value for a Student t statistic.
 * Uses P = 2 P(T ≤ −|t|) so very small p-values keep precision.
 */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, 2 * centralTCdf(-Math.abs(t), df));
}

/** Ordinary least squares of y on x with the slope's t test (df = n − 2). */
export function regressDifferenceOnMean(x: number[], y: number[]): BlandAltmanResult['slope'] {
  const n = x.length;
  if (n < 3) return null;
  const mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i]! - mx) ** 2; sxy += (x[i]! - mx) * (y[i]! - my); }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i]! - (intercept + slope * x[i]!)) ** 2;
  const df = n - 2;
  const standardError = Math.sqrt(sse / df / sxx);
  // A perfectly linear difference has zero residual: report it as t = ±Infinity, p = 0.
  const t = standardError === 0 ? (slope === 0 ? 0 : Math.sign(slope) * Infinity) : slope / standardError;
  return { estimate: slope, standardError, t, p: slope === 0 && standardError === 0 ? 1 : tTwoSidedP(t, df), intercept };
}

/**
 * Bland–Altman analysis of paired measurements a (method A) and b (method B), difference = A − B.
 * mode `percent`: 100 (A − B) / mean(A, B), requires every pair mean ≠ 0.
 * mode `log`: ln A − ln B, requires positive values; limits are also given as A/B ratios.
 * The plotted and regressed x is always the mean of the two original measurements.
 */
export function blandAltman(a: number[], b: number[], mode: DifferenceMode = 'raw'): BlandAltmanResult {
  if (a.length !== b.length) throw new RangeError('The two columns must have the same number of values.');
  const n = a.length;
  if (n < 3) throw new RangeError('At least three pairs are needed for limits of agreement and their confidence intervals.');
  if ([...a, ...b].some(v => !Number.isFinite(v))) throw new RangeError('All values must be finite numbers.');
  const means = a.map((v, i) => (v + b[i]!) / 2);
  let differences: number[];
  if (mode === 'log') {
    if ([...a, ...b].some(v => v <= 0)) throw new RangeError('The log-transformed analysis needs every measurement to be greater than zero.');
    differences = a.map((v, i) => Math.log(v) - Math.log(b[i]!));
  } else if (mode === 'percent') {
    if (means.some(m => m === 0)) throw new RangeError('Percent differences need the mean of every pair to be non-zero.');
    differences = a.map((v, i) => 100 * (v - b[i]!) / means[i]!);
  } else {
    differences = a.map((v, i) => v - b[i]!);
  }
  const bias = mean(differences);
  const variance = differences.reduce((s, d) => s + (d - bias) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const t = tCritical95(n - 1);
  const biasHalf = t * sd / Math.sqrt(n);
  const limitHalf = t * sd * Math.sqrt(1 / n + Z * Z / (2 * (n - 1)));
  const lowerLimit = interval(bias - Z * sd, limitHalf);
  const upperLimit = interval(bias + Z * sd, limitHalf);
  const biasInterval = interval(bias, biasHalf);
  const warnings: string[] = [];
  if (n < 20) warnings.push(`Only ${n} pairs: the limits of agreement are imprecise (see their wide confidence intervals).`);
  if (sd <= 1e-12 * Math.max(1, Math.abs(bias))) warnings.push('Every difference is identical, so the limits of agreement collapse onto the bias.');
  const ratios = mode === 'log' ? {
    bias: expInterval(biasInterval), lowerLimit: expInterval(lowerLimit), upperLimit: expInterval(upperLimit),
  } : undefined;
  return {
    mode, n, means, differences, bias: biasInterval, sd, lowerLimit, upperLimit, tCritical: t,
    slope: regressDifferenceOnMean(means, differences), ratios, warnings,
  };
}

function expInterval(i: Interval): Interval {
  return { estimate: Math.exp(i.estimate), lower: Math.exp(i.lower), upper: Math.exp(i.upper) };
}

/** Plain-language reading of the proportional-bias check. */
export function proportionalBiasNote(result: BlandAltmanResult): { flagged: boolean; text: string } {
  const slope = result.slope;
  if (!slope) return { flagged: false, text: 'Proportional bias could not be checked (the mean of the pairs does not vary, or there are fewer than three pairs).' };
  const p = slope.p < 0.001 ? 'p < 0.001' : `p = ${slope.p.toFixed(3)}`;
  const unit = result.mode === 'percent' ? ' percentage points' : result.mode === 'log' ? ' in log units' : '';
  const size = `${Number(slope.estimate.toPrecision(3))}${unit} per unit increase in the pair mean`;
  if (slope.p < 0.05) {
    return {
      flagged: true,
      text: `The difference changes with the size of the measurement (slope ${size}, ${p}). A single bias and fixed limits may mislead; try the percent or log-transformed option.`,
    };
  }
  return {
    flagged: false,
    text: `No clear proportional bias: the difference does not change detectably with the size of the measurement (slope ${size}, ${p}). With few pairs this check has little power.`,
  };
}
