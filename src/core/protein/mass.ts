/* Mass-spectrometry helpers. Proton mass is from Unimod's elemental table. */
import { PROTON, type Peptide } from './index';

export interface EsiCharge { charge: number; mz: number }
export type MassToleranceUnit = 'Da' | 'ppm';
export type PeptideMassMode = 'M' | '[M+H]+';
export interface PeptideMassMatch {
  observed: number;
  calculated: number;
  errorDa: number;
  errorPpm: number;
  peptide: Peptide;
}

/** Positive-mode ESI charge ladder, m/z = (M + z·proton)/z. */
export function esiChargeLadder(mass: number, zmax = 10): EsiCharge[] {
  if (!(mass > 0) || !Number.isFinite(mass)) throw new RangeError('Mass must be greater than zero.');
  if (!Number.isInteger(zmax) || zmax < 1) throw new RangeError('Maximum charge must be a positive integer.');
  return Array.from({ length: zmax }, (_, index) => {
    const charge = index + 1;
    return { charge, mz: (mass + charge * PROTON) / charge };
  });
}

/** Match observed neutral or singly protonated masses to digest monoisotopic masses. */
export function matchPeptideMasses(peptides: Peptide[], observedMasses: number[], tolerance: number,
  unit: MassToleranceUnit, mode: PeptideMassMode): PeptideMassMatch[] {
  if (!(tolerance >= 0) || !Number.isFinite(tolerance)) throw new RangeError('Mass tolerance must be zero or greater.');
  const matches: PeptideMassMatch[] = [];
  for (const observed of observedMasses) {
    if (!(observed > 0) || !Number.isFinite(observed)) continue;
    for (const peptide of peptides) {
      const calculated = peptide.mono + (mode === '[M+H]+' ? PROTON : 0);
      const errorDa = observed - calculated;
      const errorPpm = errorDa / calculated * 1e6;
      if (unit === 'Da' ? Math.abs(errorDa) <= tolerance : Math.abs(errorPpm) <= tolerance) {
        matches.push({ observed, calculated, errorDa, errorPpm, peptide });
      }
    }
  }
  return matches.sort((a, b) => a.observed - b.observed || Math.abs(a.errorDa) - Math.abs(b.errorDa));
}
