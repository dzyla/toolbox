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
