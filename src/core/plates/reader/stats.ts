import { regularizedBetaHalf, studentTQuantile } from '@/core/stats';
import { type OutlierConfig } from './types';

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

/* Student-t distribution helpers live in src/core/stats. */
export { logGamma, studentTQuantile } from '@/core/stats';

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
  const ratio = Math.max(0, Math.min(1, (n * g * g) / Math.pow(n - 1, 2)));
  const ib = regularizedBetaHalf(1 - ratio, ratio, (n - 2) / 2);
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
