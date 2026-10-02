import type { BufferSystem } from './pka';

/** Debye–Hückel A parameter for water, 0–50 °C (polynomial fit to Bates, Robinson tables). */
export function daviesA(temp_C: number): number {
  return 0.4918 + 6.6e-4 * temp_C + 5e-6 * temp_C * temp_C;
}

/**
 * Upper ionic strength (M) the Davies equation is valid to. f(I) is not monotone: it peaks near
 * I = 0.4 M and crosses zero at I ~ 1.94 M, so extrapolating past this limit would reverse the sign
 * of the correction. Callers clamp to it instead.
 */
export const DAVIES_LIMIT_M = 0.5;

/** Davies activity function f(I) with log10(gamma) = -A z^2 f(I). Valid to about I = 0.5 M. */
export function daviesF(I: number): number {
  if (!(I >= 0)) throw new RangeError('Ionic strength must be non-negative');
  const root = Math.sqrt(I);
  return root / (1 + root) - 0.3 * I;
}

/**
 * Apparent (concentration) pKa minus thermodynamic pKa for an acid species of charge zAcid.
 * I is clamped to DAVIES_LIMIT_M: beyond the equation's validity range the correction is held at its
 * 0.5 M value rather than extrapolated, because f(I) turns over and then reverses sign.
 */
export function pKaIonicShift(zAcid: number, I: number, temp_C: number): number {
  if (!(I >= 0)) throw new RangeError('Ionic strength must be non-negative');
  return (2 * zAcid - 1) * daviesA(temp_C) * daviesF(Math.min(I, DAVIES_LIMIT_M));
}

/** pKa' of every step at a temperature and ionic strength (linear dpKa/dT about 25 °C). */
export function effectivePKas(system: BufferSystem, temp_C: number, I: number, correctIonic: boolean): number[] {
  return system.steps.map((s, j) => {
    const pKa = s.pKa25 + s.dpKadT * (temp_C - 25);
    return correctIonic ? pKa + pKaIonicShift(system.z0 - j, I, temp_C) : pKa;
  });
}

/** Fraction of each species; index k = number of protons removed. */
export function fractions(pH: number, pKas: number[]): number[] {
  const logW = [0];
  for (const pKa of pKas) logW.push(logW[logW.length - 1]! + (pH - pKa));
  const max = Math.max(...logW);
  const w = logW.map(l => 10 ** (l - max));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / sum);
}

export const meanProtonsRemoved = (fr: number[]) => fr.reduce((a, f, k) => a + f * k, 0);
export const meanCharge = (system: BufferSystem, fr: number[]) => system.z0 - meanProtonsRemoved(fr);

/** pH at which the buffer carries mean charge targetQ (monotonic in pH, bisection). */
export function solvePHForCharge(system: BufferSystem, targetQ: number, pKas: number[]): number {
  let lo = -2, hi = 16;
  const q = (pH: number) => meanCharge(system, fractions(pH, pKas));
  if (targetQ > q(lo) + 1e-12 || targetQ < q(hi) - 1e-12) throw new RangeError('Charge not reachable for this buffer system');
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (q(mid) > targetQ) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Ionic strength (M) of a buffer of total concentration C (M) with monovalent counter-ions.
 *
 * I = 0.5·C·(Σ f z² + spectator ions). With `protonsRemovedInForm` the spectator term is the real
 * preparation route: |z0 − p_form| counter-ions come with the weighed salt and |m − p_form| more with
 * the titrant, so weighing a salt and titrating away from it keeps its spectator ions in solution.
 * Without it the term collapses to |z| = |z0 − m|, the minimum needed for electroneutrality, which is
 * exact when p_form lies between the neutral species and the target (mixed forms, titrating a neutral
 * acid) but too low otherwise.
 */
export function bufferIonicStrength(system: BufferSystem, totalConc_M: number, fr: number[], protonsRemovedInForm?: number): number {
  let z2 = 0, z = 0;
  fr.forEach((f, k) => { const charge = system.z0 - k; z2 += f * charge * charge; z += f * charge; });
  const spectators = protonsRemovedInForm === undefined
    ? Math.abs(z)
    : Math.abs(system.z0 - protonsRemovedInForm) + Math.abs(meanProtonsRemoved(fr) - protonsRemovedInForm);
  return 0.5 * totalConc_M * (z2 + spectators);
}
