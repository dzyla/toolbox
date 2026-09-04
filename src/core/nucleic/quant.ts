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

export const DNA_EXTINCTION_DIMERS: Record<string, number> = {
  AA: 27400, AC: 21200, AG: 25000, AT: 22800,
  CA: 21200, CC: 14600, CG: 18000, CT: 15200,
  GA: 25200, GC: 17600, GG: 21600, GT: 20000,
  TA: 23400, TC: 16200, TG: 19000, TT: 16800,
};

export const DNA_EXTINCTION_MONOMERS: Record<string, number> = {
  A: 15200, C: 7050, G: 12010, T: 8400,
};

export const RNA_EXTINCTION_DIMERS: Record<string, number> = {
  AA: 27400, AC: 21000, AG: 25000, AU: 24000,
  CA: 21000, CC: 14200, CG: 17800, CU: 16200,
  GA: 25200, GC: 17400, GG: 21600, GU: 21200,
  UA: 24600, UC: 17200, UG: 20000, UU: 19600,
};

export const RNA_EXTINCTION_MONOMERS: Record<string, number> = {
  A: 15400, C: 7200, G: 11500, U: 9900,
};

/**
 * Computes exact nearest-neighbor molar extinction coefficient at 260 nm (ε260 in M⁻¹ cm⁻¹)
 * using Warshaw & Cantor (1970) / Puglisi & Tinoco (1989) / Cavaluzzi & Borer (2004) parameters.
 */
export function oligoExtinctionCoefficient(seq: string, type: NucleicType = 'DNA'): number {
  const s = seq.toUpperCase().replace(/\s/g, '');
  if (!s) throw new NucleicError('Empty sequence');
  const clean = type === 'RNA' ? s.replace(/T/g, 'U') : s.replace(/U/g, 'T');

  const dimers = type === 'RNA' ? RNA_EXTINCTION_DIMERS : DNA_EXTINCTION_DIMERS;
  const monomers = type === 'RNA' ? RNA_EXTINCTION_MONOMERS : DNA_EXTINCTION_MONOMERS;

  if (clean.length === 1) {
    const m = monomers[clean[0]!];
    if (m === undefined) throw new NucleicError(`"${clean[0]}" is not a valid ${type} base`);
    return m;
  }

  let total = 0;
  // Sum of nearest-neighbor dimers
  for (let i = 0; i < clean.length - 1; i++) {
    const pair = clean.slice(i, i + 2);
    const dVal = dimers[pair];
    if (dVal === undefined) throw new NucleicError(`"${pair}" contains an invalid ${type} base`);
    total += dVal;
  }

  // Subtract internal monomers (for length >= 3)
  for (let i = 1; i < clean.length - 1; i++) {
    const base = clean[i]!;
    const mVal = monomers[base];
    if (mVal === undefined) throw new NucleicError(`"${base}" is not a valid ${type} base`);
    total -= mVal;
  }

  return total;
}

export interface OligoQuantResult {
  extinctionCoefficient: number; // M^-1 cm^-1
  mw: number; // g/mol
  molarConcUM: number; // µM (µmol/L)
  massConcUgPerMl: number; // µg/mL (ng/µL)
  nmolPerOd260: number; // nmol / OD260 (in 1 mL)
  ugPerOd260: number; // µg / OD260
}

/**
 * Calculates exact sequence-specific concentration and optical density parameters from A260.
 */
export function quantifyOligoA260(
  a260: number,
  seq: string,
  type: NucleicType = 'DNA',
  pathCm = 1,
  dilution = 1
): OligoQuantResult {
  if (!Number.isFinite(a260) || a260 < 0) throw new NucleicError('A260 must be ≥ 0');
  positive(pathCm, 'Path length');
  positive(dilution, 'Dilution factor');

  const ec = oligoExtinctionCoefficient(seq, type);
  const mw = oligoMass(seq, type);

  // c = (A260 * dilution) / (ec * pathCm) in mol/L
  const molarM = (a260 * dilution) / (ec * pathCm);
  const molarConcUM = molarM * 1e6;
  const massConcUgPerMl = molarM * mw * 1e3;
  const nmolPerOd260 = ec > 0 ? (1e6 / ec) : 0;
  const ugPerOd260 = ec > 0 ? ((mw * 1e3) / ec) : 0;

  return {
    extinctionCoefficient: ec,
    mw,
    molarConcUM,
    massConcUgPerMl,
    nmolPerOd260: Math.round(nmolPerOd260 * 100) / 100,
    ugPerOd260: Math.round(ugPerOd260 * 100) / 100,
  };
}
