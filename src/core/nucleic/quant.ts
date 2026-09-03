/* Nucleic-acid quantification: mass ↔ molar, A260, copy number, oligo mass.
   Conventions (stated in the tool's Science panel):
   - Average mass per unit: dsDNA 650 g/mol per bp, ssDNA 330 g/mol per nt, ssRNA 340 g/mol per nt
     (NEB "Nucleic Acid Data", https://www.neb.com/tools-and-resources/usage-guidelines/nucleic-acid-data;
     Thermo Fisher "DNA and RNA Molecular Weights and Conversions"). These include sodium counter-ions;
     anhydrous free-acid values are ~5 % lower (Thermo: 617.96 g/mol per bp).
   - A260 = 1 corresponds to 50 µg/mL dsDNA, 33 µg/mL ssDNA, 40 µg/mL ssRNA at 1 cm path
     (Sambrook & Russell, Molecular Cloning, 3rd ed., Appendix 8; Thermo NanoDrop technical note).
   - Oligo residue masses (internal nucleotide monophosphate residues, anhydrous, free acid) from IDT
     "Molecular Facts and Figures": dA 313.21, dC 289.18, dG 329.21, dT 304.20; rA 329.21, rC 305.18,
     rG 345.21, rU 306.17. Sum of residues − 61.96 for a 5'-OH / 3'-OH oligo (removes one HPO3 (79.98)
     and adds H2O (18.02)). https://www.idtdna.com/pages/education/decoded/article/molecular-facts-and-figures
   - Avogadro constant 6.02214076e23 mol⁻¹ (CODATA 2018 exact). */
import { NucleicError, type NucleicType } from './sequence';

export type NaType = 'dsDNA' | 'ssDNA' | 'ssRNA';
export const NA_TYPES: NaType[] = ['dsDNA', 'ssDNA', 'ssRNA'];
export const AVG_MW_PER_UNIT: Record<NaType, number> = { dsDNA: 650, ssDNA: 330, ssRNA: 340 };
export const A260_UG_PER_ML: Record<NaType, number> = { dsDNA: 50, ssDNA: 33, ssRNA: 40 };
export const AVOGADRO = 6.02214076e23;

function positive(x: number, what: string) {
  if (!(Number.isFinite(x) && x > 0)) throw new NucleicError(`${what} must be a positive number`);
}

/** Approximate molecular weight (g/mol) of a molecule of `length` bp or nt. */
export function approxMolecularWeight(length: number, type: NaType): number {
  positive(length, 'Length');
  return length * AVG_MW_PER_UNIT[type];
}

/** ng/µL → nM. ng/µL = mg/L = 1e-3 g/L; nM = 1e-3 g/L ÷ MW × 1e9. */
export function massConcToMolar(ngPerUl: number, length: number, type: NaType): number {
  if (!Number.isFinite(ngPerUl) || ngPerUl < 0) throw new NucleicError('Concentration must be ≥ 0');
  return (ngPerUl * 1e6) / approxMolecularWeight(length, type);
}
/** nM → ng/µL. */
export function molarToMassConc(nM: number, length: number, type: NaType): number {
  if (!Number.isFinite(nM) || nM < 0) throw new NucleicError('Concentration must be ≥ 0');
  return (nM * approxMolecularWeight(length, type)) / 1e6;
}

/** A260 → µg/mL (numerically equal to ng/µL) using the 50/33/40 factors, a dilution factor and path length in cm. */
export function a260ToMassConc(a260: number, type: NaType, dilution = 1, pathCm = 1): number {
  if (!Number.isFinite(a260) || a260 < 0) throw new NucleicError('A260 must be ≥ 0');
  positive(dilution, 'Dilution factor'); positive(pathCm, 'Path length');
  return (a260 * A260_UG_PER_ML[type] * dilution) / pathCm;
}

/** Number of molecules in `ng` of a `length` bp/nt molecule. */
export function copyNumber(ng: number, length: number, type: NaType = 'dsDNA'): number {
  if (!Number.isFinite(ng) || ng < 0) throw new NucleicError('Mass must be ≥ 0');
  return ((ng * 1e-9) / approxMolecularWeight(length, type)) * AVOGADRO;
}
/** Mass in ng for a number of molecules. */
export function massForCopies(copies: number, length: number, type: NaType = 'dsDNA'): number {
  if (!Number.isFinite(copies) || copies < 0) throw new NucleicError('Copies must be ≥ 0');
  return (copies / AVOGADRO) * approxMolecularWeight(length, type) * 1e9;
}

export const RESIDUE_MASS: Record<NucleicType, Record<string, number>> = {
  DNA: { A: 313.21, C: 289.18, G: 329.21, T: 304.20 },
  RNA: { A: 329.21, C: 305.18, G: 345.21, U: 306.17 },
};
/** 5'-OH / 3'-OH end correction: −HPO3 + H2O. */
export const END_CORRECTION = -61.96;

/** Exact anhydrous mass (g/mol) of a single-stranded oligo with 5'-OH and 3'-OH ends. Ambiguity codes are rejected. */
export function oligoMass(seq: string, type: NucleicType = 'DNA'): number {
  const s = seq.toUpperCase().replace(/\s/g, '');
  if (!s) throw new NucleicError('Empty sequence');
  const table = RESIDUE_MASS[type];
  let m = 0;
  for (const c of s) {
    const r = table[type === 'RNA' && c === 'T' ? 'U' : type === 'DNA' && c === 'U' ? 'T' : c];
    if (r === undefined) throw new NucleicError(`"${c}" is not an unambiguous ${type} base`);
    m += r;
  }
  return m + END_CORRECTION;
}

/** nmol of an oligo in `ug` micrograms at molecular weight `mw`. */
export function oligoNmol(ug: number, mw: number): number {
  if (!Number.isFinite(ug) || ug < 0) throw new NucleicError('Mass must be ≥ 0');
  positive(mw, 'Molecular weight');
  return (ug / mw) * 1000;
}
