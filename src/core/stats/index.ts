/**
 * Shared statistical distributions for src/core.
 * Lanczos log Gamma (Numerical Recipes 3rd ed. §6.1), continued-fraction incomplete beta
 * (§6.4), and Student's t CDF / quantile derived from I_x(df/2, 1/2).
 */

/** Lanczos log Gamma (g = 7). Uses the reflection formula for z < 0.5. */
export function logGamma(z: number): number {
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

/** Regularized incomplete beta I_x(a, 1/2); `complement` is 1 − x, passed separately to keep precision. */
export function regularizedBetaHalf(x: number, complement: number, a: number): number {
  if (x <= 0) return 0;
  if (complement <= 0) return 1;
  const logX = complement < 0.5 ? Math.log1p(-complement) : Math.log(x);
  const logComplement = x < 0.5 ? Math.log1p(-x) : Math.log(complement);
  const front = Math.exp(a * logX + 0.5 * logComplement - logBetaHalf(a));
  if (x < (a + 1) / (a + 2.5)) return front * betaFraction(a, 0.5, x) / a;
  return 1 - front * betaFraction(0.5, a, complement) / 0.5;
}

/** Cumulative distribution function of Student's t with `df` degrees of freedom. */
export function centralTCdf(t: number, df: number): number {
  if (!Number.isFinite(df) || df <= 0) throw new RangeError('degrees of freedom must be greater than zero and finite');
  if (t === 0) return 0.5;
  const square = t * t;
  const beta = regularizedBetaHalf(df / (df + square), square / (df + square), df / 2);
  return t < 0 ? beta / 2 : 1 - beta / 2;
}

/**
 * Critical t: returns t with P(T ≤ −t) = tail, i.e. the upper-tail quantile for tail < 0.5.
 * Inverts the tail directly so small alpha does not round 1 − alpha to one.
 */
export function criticalT(tail: number, df: number): number {
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

/**
 * Upper-tail Student-t quantile: t ≥ 0 with P(T ≥ t) = p.
 * Returns Infinity for p ≤ 0 and 0 for p ≥ 0.5.
 */
export function studentTQuantile(p: number, df: number): number {
  if (p <= 0) return Infinity;
  if (p >= 0.5) return 0;
  return criticalT(p, df);
}

/** Two-sided 95% Student-t multiplier, t(0.975, df); df is clamped to at least 1. */
export function tCritical95(df: number): number {
  return studentTQuantile(0.025, Math.max(1, df));
}
