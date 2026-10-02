import type { BufferSystem } from './pka';

/** Debye–Hückel A parameter for water, 0–50 °C (polynomial fit to Bates, Robinson tables). */
export function daviesA(temp_C: number): number {
  return 0.4918 + 6.6e-4 * temp_C + 5e-6 * temp_C * temp_C;
}

/** Davies activity function f(I) with log10(gamma) = -A z^2 f(I). Valid to about I = 0.5 M. */
export function daviesF(I: number): number {
  if (!(I >= 0)) throw new RangeError('Ionic strength must be non-negative');
  const root = Math.sqrt(I);
  return root / (1 + root) - 0.3 * I;
}

/** Apparent (concentration) pKa minus thermodynamic pKa for an acid species of charge zAcid. */
export function pKaIonicShift(zAcid: number, I: number, temp_C: number): number {
  return (2 * zAcid - 1) * daviesA(temp_C) * daviesF(I);
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

/** Ionic strength (M) of a buffer of total concentration C (M) with monovalent counter-ions. */
export function bufferIonicStrength(system: BufferSystem, totalConc_M: number, fr: number[]): number {
  let z2 = 0, z = 0;
  fr.forEach((f, k) => { const charge = system.z0 - k; z2 += f * charge * charge; z += f * charge; });
  return 0.5 * totalConc_M * (z2 + Math.abs(z));
}
