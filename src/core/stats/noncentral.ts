/**
 * General incomplete beta, noncentral t, and noncentral F distributions.
 *
 * Both noncentral distributions are Poisson-weighted mixtures of regularized incomplete betas
 * (Lenth RV (1989) Algorithm AS 243, Appl Stat 38:185-189; Johnson, Kotz & Balakrishnan,
 * Continuous Univariate Distributions vol. 2, 1995, ch. 30-31). The series is summed outward
 * from the Poisson mode, so a large noncentrality never underflows, and it stops only when the
 * neglected Poisson tail is below 1e-17; failure to converge throws.
 *
 * Accuracy (checked in tests/core/noncentral.test.ts against closed forms, the independent
 * numerical-integration noncentral t in src/core/study-design, and seeded Monte Carlo): absolute
 * error below about 1e-10 for df up to about 1e6 and noncentrality parameter up to about 1e5.
 */
import { centralTCdf, logGamma } from '@/core/stats';

/** Stirling-series correction del(x) = lnGamma(x) − [(x − 1/2) ln x − x + ln(2π)/2], x ≥ 8. */
function stirlingCorrection(x: number): number {
  const x2 = x * x;
  return (1 / 12 - (1 / 360 - (1 / 1260 - 1 / (1680 * x2)) / x2) / x2) / x;
}

/** ln B(a, b) for a, b > 0, avoiding subtraction of huge log Gamma values when both are large. */
export function logBeta(a: number, b: number): number {
  const small = Math.min(a, b), large = Math.max(a, b);
  if (small >= 8) {
    // Cody/Didonato–Morris (TOMS 708 BETALN) branch for min(a, b) ≥ 8.
    const h = small / large, c = h / (1 + h);
    const correction = stirlingCorrection(small) + stirlingCorrection(large) - stirlingCorrection(small + large);
    return -0.5 * Math.log(large) + 0.5 * Math.log(2 * Math.PI) + correction
      + (small - 0.5) * Math.log(c) - large * Math.log1p(h);
  }
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

function incompleteBetaFraction(a: number, b: number, x: number): number {
  const floor = 1e-300;
  const safe = (v: number) => Math.abs(v) < floor ? floor : v;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 / safe(1 - qab * x / qap);
  let h = d;
  for (let m = 1; m <= 200000; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 / safe(1 + aa * d); c = safe(1 + aa / c); h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 / safe(1 + aa * d); c = safe(1 + aa / c);
    const change = d * c; h *= change;
    if (Math.abs(change - 1) < 1e-15) return h;
  }
  throw new RangeError('incomplete beta did not converge');
}

/**
 * Regularized incomplete beta pair for x in [0, 1]: lower = I_x(a, b) and upper = I_y(b, a) = 1 − lower,
 * where y = 1 − x is passed separately so neither tail loses precision.
 */
export function regularizedBetaPair(x: number, y: number, a: number, b: number): { lower: number; upper: number } {
  if (!(a > 0) || !(b > 0)) throw new RangeError('beta shape parameters must be greater than zero');
  if (x <= 0) return { lower: 0, upper: 1 };
  if (y <= 0) return { lower: 1, upper: 0 };
  const front = Math.exp(a * Math.log(x) + b * Math.log(y) - logBeta(a, b));
  if (x < (a + 1) / (a + b + 2)) {
    const lower = Math.min(1, front * incompleteBetaFraction(a, b, x) / a);
    return { lower, upper: 1 - lower };
  }
  const upper = Math.min(1, front * incompleteBetaFraction(b, a, y) / b);
  return { lower: 1 - upper, upper };
}

/** Regularized incomplete beta I_x(a, b). */
export function regularizedBeta(x: number, a: number, b: number): number {
  return regularizedBetaPair(x, 1 - x, a, b).lower;
}

/** Standard normal CDF, accurate in both tails (series for |z| < 3, Mills-ratio continued fraction beyond). */
export function normalCdf(z: number): number {
  if (Number.isNaN(z)) throw new RangeError('z must be a number');
  const a = Math.abs(z);
  if (a >= 38) return z > 0 ? 1 : 0;
  let tail: number; // P(Z > a)
  if (a < 3) {
    let term = a, sum = a;
    for (let i = 1; i < 500; i++) {
      term *= a * a / (2 * i + 1);
      sum += term;
      if (term < sum * 1e-17) break;
    }
    tail = 0.5 - sum * Math.exp(-a * a / 2) / Math.sqrt(2 * Math.PI);
  } else {
    // Modified Lentz for Q(a) = phi(a) / (a + 1/(a + 2/(a + 3/(a + ...)))).
    let f = a, c = a, d = 0;
    for (let k = 1; k < 500; k++) {
      d = a + k * d; d = 1 / (d === 0 ? 1e-300 : d);
      c = a + k / (c === 0 ? 1e-300 : c);
      const delta = c * d; f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    tail = Math.exp(-a * a / 2) / Math.sqrt(2 * Math.PI) / f;
  }
  return z > 0 ? 1 - tail : tail;
}

const MIXTURE_TAIL = 1e-18;
const MIXTURE_MAX_TERMS = 4_000_000;

/**
 * Tracks I_x(a + j, b) and its complement while j moves one step at a time, using
 * I_x(a+1, b) = I_x(a, b) − T(a) with T(a) = x^a y^b / (a B(a, b)) kept in log form.
 */
class BetaLadder {
  lower: number;
  upper: number;
  private logT: number;
  private a: number;
  constructor(private readonly x: number, private readonly y: number, start: number, private readonly b: number) {
    const pair = regularizedBetaPair(x, y, start, b);
    this.lower = pair.lower; this.upper = pair.upper;
    this.logT = start * Math.log(x) + b * Math.log(y) - logBeta(start, b) - Math.log(start);
    this.a = start;
  }
  stepUp(): void {
    const t = Math.exp(this.logT);
    this.lower = Math.max(0, this.lower - t); this.upper = Math.min(1, this.upper + t);
    this.logT += Math.log(this.x) + Math.log(this.a + this.b) - Math.log(this.a + 1);
    this.a += 1;
  }
  stepDown(): void {
    this.logT -= Math.log(this.x) + Math.log(this.a - 1 + this.b) - Math.log(this.a);
    this.a -= 1;
    const t = Math.exp(this.logT);
    this.lower = Math.min(1, this.lower + t); this.upper = Math.max(0, this.upper - t);
  }
}

/**
 * Sum over j of term(j, Poisson weight), walking outward from the Poisson mode. `up` is called
 * for j = mode, mode + 1, ...; `down` for j = mode − 1, ..., 0. Each owns its own recurrence state.
 */
function poissonSum(mean: number, up: (j: number, weight: number, first: boolean) => number,
  down: (j: number, weight: number) => number): number {
  if (mean === 0) return up(0, 1, true);
  const mode = Math.floor(mean);
  const logMean = Math.log(mean);
  const logWeightMode = -mean + mode * logMean - logGamma(mode + 1);
  let total = 0;
  let logWeight = logWeightMode;
  let terms = 0;
  for (let j = mode; ; j++) {
    const weight = Math.exp(logWeight);
    total += up(j, weight, j === mode);
    const ratio = mean / (j + 1);
    if (ratio < 1 && weight * ratio / (1 - ratio) < MIXTURE_TAIL) break;
    if (++terms > MIXTURE_MAX_TERMS) throw new RangeError('noncentral series did not converge');
    logWeight += Math.log(ratio);
  }
  logWeight = logWeightMode;
  for (let j = mode - 1; j >= 0; j--) {
    logWeight += Math.log((j + 1) / mean);
    const weight = Math.exp(logWeight);
    total += down(j, weight);
    if (weight < MIXTURE_TAIL * 1e-3) break; // weights fall at least geometrically below the mode
    if (++terms > MIXTURE_MAX_TERMS) throw new RangeError('noncentral series did not converge');
  }
  return total;
}

/**
 * Noncentral F tail probabilities, df1, df2 > 0 and noncentrality λ ≥ 0
 * (λ = Σ n_i (μ_i − μ̄)² / σ² = f² N for a balanced one-way ANOVA).
 * P(F' ≤ f) = Σ_j Pois(j; λ/2) I_x(df1/2 + j, df2/2), x = df1 f / (df1 f + df2).
 * The upper tail is summed directly, so small p-values keep full relative precision.
 */
export function noncentralFTails(f: number, df1: number, df2: number, lambda: number): { cdf: number; sf: number } {
  if (!(df1 > 0) || !(df2 > 0) || !Number.isFinite(df1) || !Number.isFinite(df2)) throw new RangeError('degrees of freedom must be greater than zero and finite');
  if (!(lambda >= 0) || !Number.isFinite(lambda)) throw new RangeError('noncentrality must be zero or greater and finite');
  if (Number.isNaN(f)) throw new RangeError('F must be a number');
  if (f <= 0) return { cdf: 0, sf: 1 };
  if (f === Infinity) return { cdf: 1, sf: 0 };
  const denominator = df1 * f + df2;
  const x = df1 * f / denominator, y = df2 / denominator;
  const mean = lambda / 2;
  const mode = Math.floor(mean);
  const a0 = df1 / 2, b = df2 / 2;
  const sums = (pick: 'lower' | 'upper') => {
    const upLadder = new BetaLadder(x, y, a0 + mode, b);
    const downLadder = new BetaLadder(x, y, a0 + mode, b);
    return poissonSum(mean,
      (_j, w, first) => { if (!first) upLadder.stepUp(); return w * upLadder[pick]; },
      (_j, w) => { downLadder.stepDown(); return w * downLadder[pick]; });
  };
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { cdf: clamp(sums('lower')), sf: clamp(sums('upper')) };
}

/** Noncentral F CDF; `lambda = 0` is the central F distribution. */
export function noncentralFCdf(f: number, df1: number, df2: number, lambda: number): number {
  return noncentralFTails(f, df1, df2, lambda).cdf;
}

/** Noncentral F upper tail P(F' > f). */
export function noncentralFSf(f: number, df1: number, df2: number, lambda: number): number {
  return noncentralFTails(f, df1, df2, lambda).sf;
}

/** Upper-tail critical F: the c with P(F > c) = alpha under the central F distribution. */
export function criticalF(alpha: number, df1: number, df2: number): number {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('alpha must be between zero and one');
  let low = 0, high = 1;
  for (let i = 0; noncentralFSf(high, df1, df2, 0) > alpha; i++) {
    if (i >= 200) throw new RangeError('critical F value could not be bracketed');
    low = high; high *= 2;
  }
  for (let i = 0; i < 200; i++) {
    const middle = (low + high) / 2;
    if (noncentralFSf(middle, df1, df2, 0) > alpha) low = middle; else high = middle;
    if (high - low <= 1e-13 * Math.max(1, high)) return (low + high) / 2;
  }
  throw new RangeError('critical F inversion did not converge');
}

/**
 * Noncentral t CDF P(T' ≤ t), df > 0, noncentrality delta of either sign (Lenth 1989).
 * For t ≥ 0: Φ(−δ) + Σ_j [p_j I_x(j + 1/2, df/2) + q_j I_x(j + 1, df/2)], x = t²/(t² + df), with
 * m = δ²/2, p_j = ½ e^{−m} m^j / j!, q_j = (δ/√(2π)) e^{−m} (2m)^j / (2j + 1)!! (computed in logs below).
 * For t < 0: P(T' ≤ t; δ) = 1 − P(T' ≤ −t; −δ).
 */
export function noncentralTCdf(t: number, df: number, delta: number): number {
  if (!(df > 0) || !Number.isFinite(df)) throw new RangeError('degrees of freedom must be greater than zero and finite');
  if (Number.isNaN(t) || !Number.isFinite(delta)) throw new RangeError('noncentral t parameters must be finite numbers');
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  if (t < 0) return 1 - noncentralTCdf(-t, df, -delta);
  if (delta === 0) return centralTCdf(t, df);
  if (t === 0) return normalCdf(-delta);
  const mean = delta * delta / 2;
  const square = t * t;
  const x = square / (square + df), y = df / (square + df);
  const b = df / 2;
  const mode = Math.floor(mean);
  const logMean = Math.log(mean);
  // p_j = ½ Pois(j; m);  q_j = sign(δ) (|δ|/√(2π)) e^{−m} (2m)^j / ((2j + 1)!!) with
  // (2j + 1)!! = 2^{j+1} Γ(j + 3/2) / √π, so ln q_j = ln(|δ|/√(2π)) − m + j ln(2m) − [ln Γ(j + 3/2) + (j+1) ln 2 − ½ ln π].
  const logP = (j: number) => Math.log(0.5) - mean + j * logMean - logGamma(j + 1);
  const logQ = (j: number) => Math.log(Math.abs(delta) / Math.sqrt(2 * Math.PI)) - mean
    + j * Math.log(2 * mean) - (logGamma(j + 1.5) + (j + 1) * Math.LN2 - 0.5 * Math.log(Math.PI));
  const sign = delta < 0 ? -1 : 1;
  const oddUp = new BetaLadder(x, y, 0.5 + mode, b), evenUp = new BetaLadder(x, y, 1 + mode, b);
  const oddDown = new BetaLadder(x, y, 0.5 + mode, b), evenDown = new BetaLadder(x, y, 1 + mode, b);
  const sum = poissonSum(mean,
    (j, _w, first) => {
      if (!first) { oddUp.stepUp(); evenUp.stepUp(); }
      return Math.exp(logP(j)) * oddUp.lower + sign * Math.exp(logQ(j)) * evenUp.lower;
    },
    (j) => {
      oddDown.stepDown(); evenDown.stepDown();
      return Math.exp(logP(j)) * oddDown.lower + sign * Math.exp(logQ(j)) * evenDown.lower;
    });
  return Math.min(1, Math.max(0, normalCdf(-delta) + sum));
}
