/**
 * Exact power planning for a paired t-test (one-sample t on within-pair differences) and a
 * balanced one-way ANOVA. Both use noncentral distributions from src/core/stats/noncentral
 * (Cohen 1988; Lenth 1989 AS 243). The two-independent-group planner stays in ./index.
 */
import { criticalT } from '@/core/stats';
import { criticalF, noncentralFSf, noncentralTCdf } from '@/core/stats/noncentral';

export type PairedAlternative = 'two-sided' | 'one-sided';

const MAX_N = 1_000_000;
const SIZE_LIMIT_MESSAGE = 'target power could not be reached within one million samples per group';

function positive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be greater than zero and finite`);
}
function probability(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) throw new RangeError(`${label} must be between zero and one`);
}
function validateTarget(targetPower: number, alpha: number): void {
  probability(targetPower, 'target power');
  if (targetPower <= alpha) throw new RangeError('target power must be greater than alpha');
}
function validateDropout(dropoutFraction: number): void {
  if (!Number.isFinite(dropoutFraction) || dropoutFraction < 0 || dropoutFraction >= 1) {
    throw new RangeError('dropout fraction must be at least zero and less than one');
  }
}
function enrollment(n: number, dropoutFraction: number): number {
  const enrolled = Math.ceil(n / (1 - dropoutFraction));
  if (!Number.isSafeInteger(enrolled)) throw new RangeError('dropout-adjusted enrollment exceeds the safe integer range');
  return enrolled;
}

/** Smallest integer n ≥ minN whose power reaches the target (power is increasing in n). */
function smallestN(powerFor: (n: number) => number, targetPower: number, minN: number, maxN: number): number {
  let low = minN;
  let high = Math.min(Math.max(minN, 4), maxN);
  while (powerFor(high) < targetPower) {
    if (high === maxN) throw new RangeError(SIZE_LIMIT_MESSAGE);
    high = Math.min(high * 2, maxN);
  }
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (powerFor(middle) >= targetPower) high = middle; else low = middle + 1;
  }
  return low;
}

function invertEffect(powerFor: (effect: number) => number, targetPower: number): number {
  let low = 0, high = 1;
  for (let i = 0; powerFor(high) < targetPower; i++) {
    if (i >= 64) throw new RangeError('detectable effect could not be bracketed');
    high *= 2;
  }
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2;
    if (powerFor(middle) >= targetPower) high = middle; else low = middle;
    if (high - low < 1e-10 * Math.max(1, high)) return high;
  }
  throw new RangeError('detectable effect inversion did not converge');
}

/* ------------------------------ paired t-test ------------------------------ */

export interface PairedPowerInput {
  /** Number of pairs (analysable). */
  n: number;
  /** Cohen's d_z = |mean difference| / SD of the differences. */
  effectSize: number;
  alpha: number;
  alternative: PairedAlternative;
}
export interface PairedPowerResult { power: number; degreesOfFreedom: number; noncentrality: number; criticalValue: number }

function validatePairs(n: number): void {
  if (!Number.isInteger(n) || n < 2 || n > MAX_N) throw new RangeError('number of pairs must be an integer from two to one million');
}
function validateSettings(alpha: number, alternative: PairedAlternative): void {
  probability(alpha, 'alpha');
  if (alternative !== 'two-sided' && alternative !== 'one-sided') throw new RangeError('alternative must be two-sided or one-sided');
}

/** Exact power of the one-sample t-test on n differences: δ = d_z √n, df = n − 1. */
export function pairedPower(input: PairedPowerInput): PairedPowerResult {
  validatePairs(input.n);
  validateSettings(input.alpha, input.alternative);
  positive(input.effectSize, 'effect size');
  const degreesOfFreedom = input.n - 1;
  const noncentrality = input.effectSize * Math.sqrt(input.n);
  const criticalValue = criticalT(input.alpha / (input.alternative === 'two-sided' ? 2 : 1), degreesOfFreedom);
  const upper = 1 - noncentralTCdf(criticalValue, degreesOfFreedom, noncentrality);
  const lower = input.alternative === 'two-sided' ? noncentralTCdf(-criticalValue, degreesOfFreedom, noncentrality) : 0;
  return { power: Math.min(1, Math.max(0, lower + upper)), degreesOfFreedom, noncentrality, criticalValue };
}

export interface PairedSampleSizeInput {
  effectSize: number; alpha: number; targetPower: number; alternative: PairedAlternative; dropoutFraction: number;
}
export interface PairedSampleSizeResult { n: number; enrollN: number; achievedPower: number; degreesOfFreedom: number }

export function requiredPairedSampleSize(input: PairedSampleSizeInput): PairedSampleSizeResult {
  validateSettings(input.alpha, input.alternative);
  positive(input.effectSize, 'effect size');
  validateTarget(input.targetPower, input.alpha);
  validateDropout(input.dropoutFraction);
  const powerFor = (n: number) => pairedPower({ ...input, n }).power;
  const n = smallestN(powerFor, input.targetPower, 2, MAX_N);
  const achieved = pairedPower({ ...input, n });
  return { n, enrollN: enrollment(n, input.dropoutFraction), achievedPower: achieved.power, degreesOfFreedom: achieved.degreesOfFreedom };
}

export interface PairedMdeInput { n: number; alpha: number; alternative: PairedAlternative; targetPower: number }

/** Minimum detectable d_z for n pairs at the target power. */
export function pairedMinimumDetectableEffect(input: PairedMdeInput): number {
  validatePairs(input.n);
  validateSettings(input.alpha, input.alternative);
  validateTarget(input.targetPower, input.alpha);
  return invertEffect(effectSize => pairedPower({ ...input, effectSize }).power, input.targetPower);
}

/** d_z magnitude from the anticipated mean difference and the SD of the paired differences. */
export function cohensDz(meanDifference: number, sdOfDifferences: number): number {
  positive(sdOfDifferences, 'standard deviation of differences');
  if (!Number.isFinite(meanDifference)) throw new RangeError('mean difference must be finite');
  const effect = Math.abs(meanDifference) / sdOfDifferences;
  positive(effect, 'effect size');
  return effect;
}

/* ------------------------------ one-way ANOVA ------------------------------ */

export interface AnovaPowerInput {
  /** Number of groups, at least 2. */
  groups: number;
  /** Analysable samples in every group (balanced design). */
  nPerGroup: number;
  /** Cohen's f = σ_means / σ_within. */
  effectSize: number;
  alpha: number;
}
export interface AnovaPowerResult {
  power: number; df1: number; df2: number; noncentrality: number; criticalValue: number; totalN: number;
}

function validateAnova(groups: number, nPerGroup: number | undefined): void {
  if (!Number.isInteger(groups) || groups < 2 || groups > 1000) throw new RangeError('number of groups must be an integer from two to 1,000');
  if (nPerGroup !== undefined && (!Number.isInteger(nPerGroup) || nPerGroup < 2 || nPerGroup > MAX_N)) {
    throw new RangeError('samples per group must be an integer from two to one million');
  }
}

/** Exact power of the balanced one-way ANOVA F-test: λ = f² N, df1 = k − 1, df2 = N − k. */
export function anovaPower(input: AnovaPowerInput): AnovaPowerResult {
  validateAnova(input.groups, input.nPerGroup);
  probability(input.alpha, 'alpha');
  positive(input.effectSize, 'effect size');
  const totalN = input.groups * input.nPerGroup;
  const df1 = input.groups - 1, df2 = totalN - input.groups;
  const noncentrality = input.effectSize ** 2 * totalN;
  const criticalValue = criticalF(input.alpha, df1, df2);
  return { power: noncentralFSf(criticalValue, df1, df2, noncentrality), df1, df2, noncentrality, criticalValue, totalN };
}

export interface AnovaSampleSizeInput { groups: number; effectSize: number; alpha: number; targetPower: number; dropoutFraction: number }
export interface AnovaSampleSizeResult { nPerGroup: number; totalN: number; enrollPerGroup: number; enrollTotal: number; achievedPower: number; df1: number; df2: number }

export function requiredAnovaSampleSize(input: AnovaSampleSizeInput): AnovaSampleSizeResult {
  validateAnova(input.groups, undefined);
  probability(input.alpha, 'alpha');
  positive(input.effectSize, 'effect size');
  validateTarget(input.targetPower, input.alpha);
  validateDropout(input.dropoutFraction);
  const maxN = Math.floor(MAX_N / input.groups);
  if (maxN < 2) throw new RangeError(SIZE_LIMIT_MESSAGE);
  const powerFor = (nPerGroup: number) => anovaPower({ ...input, nPerGroup }).power;
  const nPerGroup = smallestN(powerFor, input.targetPower, 2, maxN);
  const achieved = anovaPower({ ...input, nPerGroup });
  const enrollPerGroup = enrollment(nPerGroup, input.dropoutFraction);
  return { nPerGroup, totalN: achieved.totalN, enrollPerGroup, enrollTotal: enrollPerGroup * input.groups,
    achievedPower: achieved.power, df1: achieved.df1, df2: achieved.df2 };
}

export interface AnovaMdeInput { groups: number; nPerGroup: number; alpha: number; targetPower: number }

/** Minimum detectable Cohen's f. */
export function anovaMinimumDetectableEffect(input: AnovaMdeInput): number {
  validateAnova(input.groups, input.nPerGroup);
  probability(input.alpha, 'alpha');
  validateTarget(input.targetPower, input.alpha);
  return invertEffect(effectSize => anovaPower({ ...input, effectSize }).power, input.targetPower);
}

/** Cohen's f = sqrt(Σ(μ_i − μ̄)² / k) / σ for balanced groups with common within-group SD σ. */
export function cohensF(groupMeans: number[], commonSd: number): number {
  if (groupMeans.length < 2) throw new RangeError('at least two group means are required');
  if (groupMeans.some(mean => !Number.isFinite(mean))) throw new RangeError('group means must be finite');
  positive(commonSd, 'common standard deviation');
  const grand = groupMeans.reduce((sum, mean) => sum + mean, 0) / groupMeans.length;
  const variance = groupMeans.reduce((sum, mean) => sum + (mean - grand) ** 2, 0) / groupMeans.length;
  const effect = Math.sqrt(variance) / commonSd;
  positive(effect, 'effect size');
  return effect;
}
