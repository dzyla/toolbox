import { sanitize, countAA, molecularWeight, isoelectricPoint, gravy } from '@/core/protein';

export class AmmoniumSulfateError extends Error {}

/**
 * Solid ammonium sulfate addition from Green & Hughes (1955) / EMBL tables.
 * Temperature constants are the audited Bio-Bench values: 533/0.30 at 25 °C,
 * and 515/0.27 at 0–4 °C.
 */
export function gramsToAdd(s1: number, s2: number, volume_L: number, temp: 25 | 0): number {
  if (!Number.isFinite(volume_L) || volume_L <= 0) throw new AmmoniumSulfateError('Volume must be a positive number');
  if (!Number.isFinite(s1) || s1 < 0 || s1 >= 100) throw new AmmoniumSulfateError('Current saturation must be from 0 to below 100%');
  if (!Number.isFinite(s2) || s2 >= 100) throw new AmmoniumSulfateError('Target saturation must be below 100%');
  if (s2 <= s1) throw new AmmoniumSulfateError('Target saturation must exceed current saturation');
  if (temp !== 25 && temp !== 0) throw new AmmoniumSulfateError('Temperature must be 25 °C or 0–4 °C');
  const factor = temp === 25 ? 533 : 515;
  const expansion = temp === 25 ? 0.30 : 0.27;
  return factor * (s2 - s1) / (100 - expansion * s2) * volume_L;
}

export interface SaltingOutInput {
  mwDa: number;
  pI: number;
  gravy: number;
  pH?: number;
  initialConcMgMl?: number;
  temp?: 25 | 0;
}

export interface SaltingOutPoint {
  saturation: number;
  solubilityMgMl: number;
  percentPrecipitated: number;
}

export interface SaltingOutResult {
  mwDa: number;
  pI: number;
  gravy: number;
  pH: number;
  ks: number;
  beta: number;
  onsetSaturation: number;
  midpointSaturation: number;
  completeSaturation: number;
  recommendedPreCut: number;
  recommendedTargetCut: number;
  curve: SaltingOutPoint[];
}

/**
 * Sequence-based Cohn salting-out prediction:
 * log10(S) = beta - Ks * (% saturation)
 * References: Cohn (1925, 1943), Melander & Horváth (1977), Englard & Seifter (1990).
 */
export function predictSaltingOut(params: SaltingOutInput): SaltingOutResult {
  const {
    mwDa,
    pI,
    gravy,
    pH = 7.0,
    initialConcMgMl = 2.0,
    temp = 25,
  } = params;

  if (mwDa <= 0) throw new AmmoniumSulfateError('Molecular weight must be positive');
  if (initialConcMgMl <= 0) throw new AmmoniumSulfateError('Protein concentration must be positive');

  const gravyShift = Math.max(-0.8, Math.min(0.8, gravy));
  const beta0 = 2.05 - 0.45 * (gravyShift + 0.4);

  const deltaPh = Math.abs(pH - pI);
  const phChargeBonus = 0.10 * Math.min(9, deltaPh * deltaPh);
  const tempCorrection = temp === 0 ? -0.06 : 0;

  const beta = beta0 + phChargeBonus + tempCorrection;

  const mwNorm = Math.max(0.1, mwDa / 40000);
  const ks = 0.052 * Math.pow(mwNorm, 0.36) * (1 + 0.32 * (gravyShift + 0.4));

  const logInitial = Math.log10(initialConcMgMl);
  const rawOnset = (beta - logInitial) / ks;
  const onsetSaturation = Math.max(5, Math.min(92, Math.round(rawOnset)));

  const rawMidpoint = (beta - Math.log10(initialConcMgMl * 0.5)) / ks;
  const midpointSaturation = Math.max(onsetSaturation + 1, Math.min(95, Math.round(rawMidpoint)));

  const rawComplete = (beta - Math.log10(initialConcMgMl * 0.05)) / ks;
  const completeSaturation = Math.max(midpointSaturation + 2, Math.min(98, Math.round(rawComplete)));

  const recommendedPreCut = Math.max(0, onsetSaturation - 6);
  const recommendedTargetCut = Math.min(95, completeSaturation + 4);

  const curve: SaltingOutPoint[] = [];
  for (let sat = 0; sat <= 95; sat += 2) {
    const logS = beta - ks * sat;
    const solubilityMgMl = Math.pow(10, logS);
    let percentPrecipitated = 0;
    if (solubilityMgMl < initialConcMgMl) {
      percentPrecipitated = Math.min(100, Math.max(0, ((initialConcMgMl - solubilityMgMl) / initialConcMgMl) * 100));
    }
    curve.push({
      saturation: sat,
      solubilityMgMl: Number(solubilityMgMl.toPrecision(3)),
      percentPrecipitated: Number(percentPrecipitated.toFixed(1)),
    });
  }

  return {
    mwDa,
    pI: Number(pI.toFixed(2)),
    gravy: Number(gravy.toFixed(3)),
    pH,
    ks: Number(ks.toFixed(4)),
    beta: Number(beta.toFixed(3)),
    onsetSaturation,
    midpointSaturation,
    completeSaturation,
    recommendedPreCut,
    recommendedTargetCut,
    curve,
  };
}

/**
 * Predict Cohn precipitation properties directly from an amino acid sequence.
 */
export function predictFromSequence(
  sequence: string,
  options?: { pH?: number; initialConcMgMl?: number; temp?: 25 | 0 }
): SaltingOutResult {
  const { seq } = sanitize(sequence);
  if (!seq) throw new AmmoniumSulfateError('Please provide a valid protein amino acid sequence');
  const counts = countAA(seq);
  const mwDa = molecularWeight(counts);
  const pI = isoelectricPoint(counts, 'bjellqvist', seq);
  const g = gravy(seq);
  return predictSaltingOut({
    mwDa,
    pI,
    gravy: g,
    pH: options?.pH ?? 7.0,
    initialConcMgMl: options?.initialConcMgMl ?? 2.0,
    temp: options?.temp ?? 25,
  });
}
