/** Exact pooled-variance t-test planning for two independent groups. */
export type Alternative = 'two-sided' | 'one-sided';

export interface TwoSamplePowerInput {
  n1: number;
  n2: number;
  /** Positive magnitude; a one-sided test is in the prespecified effect direction. */
  effectSize: number;
  alpha: number;
  alternative: Alternative;
}

export interface TwoSamplePowerResult {
  power: number;
  degreesOfFreedom: number;
  noncentrality: number;
  criticalValue: number;
}

export interface RequiredSampleSizeInput {
  effectSize: number;
  alpha: number;
  targetPower: number;
  alternative: Alternative;
  /** Group two / group one; group two is rounded up, with at least two observations. */
  allocationRatio: number;
  dropoutFraction: number;
}

export interface RequiredSampleSizeResult {
  n1: number;
  n2: number;
  enrollN1: number;
  enrollN2: number;
  achievedPower: number;
  degreesOfFreedom: number;
}

export interface MinimumDetectableEffectInput {
  n1: number;
  n2: number;
  alpha: number;
  alternative: Alternative;
  targetPower: number;
}

const MAX_GROUP_SIZE = 1_000_000;
const INTEGRATION_TOLERANCE = 1e-8;
const SIZE_LIMIT_MESSAGE = 'target power could not be reached within one million samples per group';

function positive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be greater than zero and finite`);
}

function probability(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) throw new RangeError(`${label} must be between zero and one`);
}

function validateSettings(alpha: number, alternative: Alternative): void {
  probability(alpha, 'alpha');
  if (alternative !== 'two-sided' && alternative !== 'one-sided') throw new RangeError('alternative must be two-sided or one-sided');
}

function validateGroups(n1: number, n2: number): void {
  for (const [label, n] of [['n1', n1], ['n2', n2]] as const) {
    if (!Number.isInteger(n) || n < 2 || n > MAX_GROUP_SIZE) {
      throw new RangeError(`${label} must be an integer from two to one million`);
    }
  }
}

function validateTarget(targetPower: number, alpha: number): void {
  probability(targetPower, 'target power');
  if (targetPower <= alpha) throw new RangeError('target power must be greater than alpha');
}

// Lanczos log Gamma, used only with positive arguments.
function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  const x = z - 1;
  let sum = 0.9999999999998099;
  for (let i = 0; i < coefficients.length; i++) sum += coefficients[i]! / (x + i + 1);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

// Avoid subtracting large, nearly equal log Gamma values for large sample sizes.
function logBetaHalf(a: number): number {
  const logRatio = a < 16 ? logGamma(a + 0.5) - logGamma(a)
    : 0.5 * Math.log(a) - 1 / (8 * a) + 1 / (192 * a ** 3)
      - 1 / (640 * a ** 5) + 17 / (14336 * a ** 7);
  return 0.5 * Math.log(Math.PI) - logRatio;
}

function betaFraction(a: number, b: number, x: number): number {
  const floor = 1e-300;
  const safe = (v: number) => Math.abs(v) < floor ? (v < 0 ? -floor : floor) : v;
  let c = 1;
  let d = 1 / safe(1 - (a + b) * x / (a + 1));
  let h = d;
  for (let m = 1; m <= 10000; m++) {
    const twice = 2 * m;
    let numerator = m * (b - m) * x / ((a + twice - 1) * (a + twice));
    d = 1 / safe(1 + numerator * d);
    c = safe(1 + numerator / c);
    h *= d * c;
    numerator = -(a + m) * (a + b + m) * x / ((a + twice) * (a + twice + 1));
    d = 1 / safe(1 + numerator * d);
    c = safe(1 + numerator / c);
    const change = d * c;
    h *= change;
    if (Math.abs(change - 1) < 3e-14) return h;
  }
  throw new RangeError('incomplete beta did not converge');
}

function regularizedBetaHalf(x: number, complement: number, a: number): number {
  if (x <= 0) return 0;
  if (complement <= 0) return 1;
  const logX = complement < 0.5 ? Math.log1p(-complement) : Math.log(x);
  const logComplement = x < 0.5 ? Math.log1p(-x) : Math.log(complement);
  const front = Math.exp(a * logX + 0.5 * logComplement - logBetaHalf(a));
  if (x < (a + 1) / (a + 2.5)) return front * betaFraction(a, 0.5, x) / a;
  return 1 - front * betaFraction(0.5, a, complement) / 0.5;
}

function centralTCdf(t: number, df: number): number {
  positive(df, 'degrees of freedom');
  if (t === 0) return 0.5;
  const square = t * t;
  const beta = regularizedBetaHalf(df / (df + square), square / (df + square), df / 2);
  return t < 0 ? beta / 2 : 1 - beta / 2;
}

/** Invert a tail directly so small alpha does not round 1 - alpha to one. */
function criticalT(tail: number, df: number): number {
  if (tail === 0.5) return 0;
  if (tail > 0.5) return -criticalT(1 - tail, df);
  let low = 0;
  let high = 1;
  for (let i = 0; centralTCdf(-high, df) > tail; i++) {
    if (i >= 100) throw new RangeError('critical t value could not be bracketed');
    high *= 2;
  }
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2;
    if (centralTCdf(-middle, df) > tail) low = middle;
    else high = middle;
    if (high - low <= 1e-12 * Math.max(1, high)) return (low + high) / 2;
  }
  throw new RangeError('critical t inversion did not converge');
}

function normalCdf(x: number): number {
  if (x <= -9) return 0;
  if (x >= 9) return 1;
  // Convergent, all-positive series; no alternating large-term cancellation.
  const absolute = Math.abs(x);
  let term = absolute;
  let sum = term;
  for (let i = 1; i <= 256; i++) {
    term *= absolute * absolute / (2 * i + 1);
    sum += term;
    if (term <= sum * Number.EPSILON) {
      const halfArea = sum * Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
      return Math.max(0, Math.min(1, 0.5 + (x < 0 ? -halfArea : halfArea)));
    }
  }
  throw new RangeError('normal CDF did not converge');
}

function adaptiveSimpson(f: (x: number) => number, a: number, b: number, tolerance: number): number {
  const midpoint = (a + b) / 2;
  const fa = f(a), fm = f(midpoint), fb = f(b);
  const estimate = (b - a) * (fa + 4 * fm + fb) / 6;
  function refine(left: number, right: number, fl: number, fc: number, fr: number, whole: number, tol: number, depth: number): number {
    const center = (left + right) / 2;
    const fLeft = f((left + center) / 2), fRight = f((center + right) / 2);
    const first = (center - left) * (fl + 4 * fLeft + fc) / 6;
    const second = (right - center) * (fc + 4 * fRight + fr) / 6;
    const error = first + second - whole;
    if (Math.abs(error) <= 15 * tol) return first + second + error / 15;
    if (depth === 0) throw new RangeError('noncentral t integration did not converge');
    return refine(left, center, fl, fLeft, fc, first, tol / 2, depth - 1)
      + refine(center, right, fc, fRight, fr, second, tol / 2, depth - 1);
  }
  return refine(a, b, fa, fm, fb, estimate, tolerance, 24);
}

function log1pMinusX(x: number): number {
  if (Math.abs(x) >= 0.1) return Math.log1p(x) - x;
  let term = -x * x / 2;
  let sum = term;
  for (let k = 3; k <= 24; k++) {
    term *= -x * (k - 1) / k;
    sum += term;
  }
  return sum;
}

/**
 * F(t; df, delta) = E[Phi(t sqrt(V / df) - delta)], V ~ chi-square(df).
 * Integrate in r = sqrt(V), centered at sqrt(df), to resolve the density even
 * at large df. This is the noncentral-t expectation, not a normal approximation.
 * Laurent–Massart chi-square bounds with x=32 omit at most 2 exp(-32) < 3e-14.
 * Simpson's explicit absolute error budget is 1e-8 across both rejection
 * tails: each CDF gets half that budget. Subdivision is bounded.
 * Definition: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.nct.html
 */
function noncentralTCdf(t: number, df: number, delta: number): number {
  positive(df, 'degrees of freedom');
  if (!Number.isFinite(t) || !Number.isFinite(delta)) throw new RangeError('noncentral t parameters must be finite');
  const root = Math.sqrt(df);
  const tailBound = 32;
  const lower = Math.sqrt(Math.max(0, df - 2 * Math.sqrt(df * tailBound))) - root;
  const upper = Math.sqrt(df + 2 * Math.sqrt(df * tailBound) + 2 * tailBound) - root;
  const shape = df / 2;
  const correction = 1 / (12 * shape) - 1 / (360 * shape ** 3) + 1 / (1260 * shape ** 5);
  const centerLogDensity = shape >= 16 ? -0.5 * Math.log(Math.PI) - correction
    : Math.log(2) + (df - 1) * Math.log(root) - df / 2 - shape * Math.log(2) - logGamma(shape);
  const integrand = (offset: number): number => {
    const r = root + offset;
    if (r <= 0) return 0; // df >= 2 for every supported two-group design.
    const relative = offset / root;
    const logDensity = centerLogDensity + df * log1pMinusX(relative) - Math.log1p(relative) - offset * offset / 2;
    return normalCdf(t * (r / root) - delta) * Math.exp(logDensity);
  };
  // Short initial panels prevent adaptive integration from missing the peak.
  const panels = Math.ceil((upper - lower) / 0.5);
  let integral = 0;
  for (let i = 0; i < panels; i++) {
    integral += adaptiveSimpson(integrand, lower + (upper - lower) * i / panels,
      lower + (upper - lower) * (i + 1) / panels, INTEGRATION_TOLERANCE / (2 * panels));
  }
  if (!Number.isFinite(integral) || integral < -INTEGRATION_TOLERANCE || integral > 1 + INTEGRATION_TOLERANCE) {
    throw new RangeError('noncentral t integration produced an invalid probability');
  }
  return Math.max(0, Math.min(1, integral));
}

export function twoSamplePower(input: TwoSamplePowerInput): TwoSamplePowerResult {
  validateGroups(input.n1, input.n2);
  validateSettings(input.alpha, input.alternative);
  positive(input.effectSize, 'effect size');
  const degreesOfFreedom = input.n1 + input.n2 - 2;
  const noncentrality = input.effectSize / Math.sqrt(1 / input.n1 + 1 / input.n2);
  const criticalValue = criticalT(input.alpha / (input.alternative === 'two-sided' ? 2 : 1), degreesOfFreedom);
  const upper = 1 - noncentralTCdf(criticalValue, degreesOfFreedom, noncentrality);
  const lower = input.alternative === 'two-sided' ? noncentralTCdf(-criticalValue, degreesOfFreedom, noncentrality) : 0;
  return { power: Math.min(1, Math.max(0, lower + upper)), degreesOfFreedom, noncentrality, criticalValue };
}

export function requiredSampleSize(input: RequiredSampleSizeInput): RequiredSampleSizeResult {
  validateSettings(input.alpha, input.alternative);
  positive(input.effectSize, 'effect size');
  validateTarget(input.targetPower, input.alpha);
  positive(input.allocationRatio, 'allocation ratio');
  if (!Number.isFinite(input.dropoutFraction) || input.dropoutFraction < 0 || input.dropoutFraction >= 1) {
    throw new RangeError('dropout fraction must be at least zero and less than one');
  }
  const n2For = (n1: number) => Math.max(2, Math.ceil(n1 * input.allocationRatio));
  const maxN1 = Math.min(MAX_GROUP_SIZE, Math.floor(MAX_GROUP_SIZE / input.allocationRatio));
  if (maxN1 < 2) throw new RangeError(SIZE_LIMIT_MESSAGE);
  const powerFor = (n1: number) => twoSamplePower({ ...input, n1, n2: n2For(n1) });
  let low = 2;
  let high = Math.min(4, maxN1);
  while (powerFor(high).power < input.targetPower) {
    if (high === maxN1) throw new RangeError(SIZE_LIMIT_MESSAGE);
    high = Math.min(high * 2, maxN1);
  }
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (powerFor(middle).power >= input.targetPower) high = middle;
    else low = middle + 1;
  }
  const n1 = low;
  const n2 = n2For(n1);
  const achieved = powerFor(n1);
  const enrollN1 = Math.ceil(n1 / (1 - input.dropoutFraction));
  const enrollN2 = Math.ceil(n2 / (1 - input.dropoutFraction));
  if (!Number.isSafeInteger(enrollN1) || !Number.isSafeInteger(enrollN2)) throw new RangeError('dropout-adjusted enrollment exceeds the safe integer range');
  return { n1, n2, enrollN1, enrollN2, achievedPower: achieved.power, degreesOfFreedom: achieved.degreesOfFreedom };
}

export function minimumDetectableEffect(input: MinimumDetectableEffectInput): number {
  validateGroups(input.n1, input.n2);
  validateSettings(input.alpha, input.alternative);
  validateTarget(input.targetPower, input.alpha);
  let low = 0;
  let high = 1;
  for (let i = 0; twoSamplePower({ ...input, effectSize: high }).power < input.targetPower; i++) {
    if (i >= 64) throw new RangeError('detectable effect could not be bracketed');
    high *= 2;
  }
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2;
    if (twoSamplePower({ ...input, effectSize: middle }).power >= input.targetPower) high = middle;
    else low = middle;
    if (high - low < 1e-10 * Math.max(1, high)) return high;
  }
  throw new RangeError('detectable effect inversion did not converge');
}

/** Cohen's d magnitude; sign does not choose or change a one-sided hypothesis. */
export function cohensD(difference: number, commonSd: number): number {
  positive(commonSd, 'common standard deviation');
  if (!Number.isFinite(difference)) throw new RangeError('difference must be finite');
  const effect = Math.abs(difference) / commonSd;
  positive(effect, 'effect size');
  return effect;
}
