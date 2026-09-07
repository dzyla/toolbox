/**
 * Detergent & Membrane Protein Science Core
 *
 * Implements published physical and chemical parameters for laboratory detergents,
 * micelle thermodynamics, critical micelle concentration (CMC) partitioning,
 * protein-detergent complex (PDC) sizing, micelle counting, and dialyzability.
 *
 * References:
 * - Seddon AM, Curnow P, Booth PJ (2004) Membrane proteins, lipids and detergents:
 *   not just a soap opera. Biochim Biophys Acta 1666:105-117.
 * - le Maire M, Champeil P, Møller JV (2000) Interaction of membrane proteins
 *   and lipids with solubilizing detergents. Biochim Biophys Acta 1508:86-111.
 * - Anatrace Detergent Handbook (2020) Anatrace Products, LLC.
 */

export class DetergentError extends Error {}

export const AVOGADRO = 6.02214076e23;

export type DetergentCategory = 'non-ionic' | 'zwitterionic' | 'ionic';

export interface DetergentInfo {
  id: string;
  name: string;
  fullName: string;
  category: DetergentCategory;
  molecularWeight: number; // g/mol (monomer MW)
  cmcMm: number; // Critical Micelle Concentration in mM
  cmcPct: number; // Critical Micelle Concentration in % (w/v)
  aggregationNumber: number; // Mean Nagg
  aggregationRange?: [number, number]; // [min, max] if varied
  micelleMwKDa: number; // Micelle mass in kDa
  dialyzability: 'easily_dialyzed' | 'slowly_dialyzed' | 'non_dialyzable';
  recommendedWorkingMultiplier: [number, number]; // e.g. [1.5, 3] * CMC for maintenance
  description: string;
}

export type KnownDetergentId =
  | 'ddm'
  | 'lmng'
  | 'og'
  | 'ng'
  | 'dm'
  | 'chaps'
  | 'digitonin'
  | 'triton_x100'
  | 'tween_20';

/**
 * Published benchmark database of detergents used in membrane protein biochemistry.
 * Parameters sourced from Anatrace Handbook, Seddon et al. (2004), and le Maire et al. (2000).
 */
export const DETERGENT_DATABASE: Record<KnownDetergentId, DetergentInfo> = {
  ddm: {
    id: 'ddm',
    name: 'DDM',
    fullName: 'n-Dodecyl-β-D-maltoside',
    category: 'non-ionic',
    molecularWeight: 510.6,
    cmcMm: 0.17,
    cmcPct: 0.0087,
    aggregationNumber: 110,
    aggregationRange: [78, 140],
    micelleMwKDa: 56.0,
    dialyzability: 'non_dialyzable',
    recommendedWorkingMultiplier: [1.5, 3.0],
    description: 'Gold standard non-ionic detergent for membrane protein crystallography and cryo-EM. Forms stable, medium-sized micelles (~56 kDa). Very low CMC makes it practically impossible to dialyze away without Bio-Beads.',
  },
  lmng: {
    id: 'lmng',
    name: 'LMNG',
    fullName: 'Lauryl Maltose Neopentyl Glycol',
    category: 'non-ionic',
    molecularWeight: 1005.2,
    cmcMm: 0.010,
    cmcPct: 0.0010,
    aggregationNumber: 70,
    micelleMwKDa: 70.0,
    dialyzability: 'non_dialyzable',
    recommendedWorkingMultiplier: [2.0, 5.0],
    description: 'Neopentyl glycol-derived amphiphile with exceptionally slow off-rate and high conformational stabilization. Favored for GPCRs and challenging cryo-EM targets at ultra-low concentrations (0.005–0.01%). Non-dialyzable.',
  },
  og: {
    id: 'og',
    name: 'OG',
    fullName: 'n-Octyl-β-D-glucoside',
    category: 'non-ionic',
    molecularWeight: 292.4,
    cmcMm: 18.0,
    cmcPct: 0.53,
    aggregationNumber: 84,
    micelleMwKDa: 25.0,
    dialyzability: 'easily_dialyzed',
    recommendedWorkingMultiplier: [1.2, 1.5],
    description: 'Short alkyl chain glucoside with very high CMC (18 mM). Readily dialyzed away for reconstitution into liposomes or nanodiscs. Forms compact micelles (25 kDa). Can destabilize sensitive multi-pass membrane proteins.',
  },
  ng: {
    id: 'ng',
    name: 'NG',
    fullName: 'n-Nonyl-β-D-glucoside',
    category: 'non-ionic',
    molecularWeight: 306.4,
    cmcMm: 6.5,
    cmcPct: 0.20,
    aggregationNumber: 130,
    micelleMwKDa: 40.0,
    dialyzability: 'easily_dialyzed',
    recommendedWorkingMultiplier: [1.2, 2.0],
    description: 'Intermediate chain length between OG and decyl glucosides. Readily dialyzable (CMC 6.5 mM) with gentler solubilizing characteristics than OG.',
  },
  dm: {
    id: 'dm',
    name: 'DM',
    fullName: 'n-Decyl-β-D-maltoside',
    category: 'non-ionic',
    molecularWeight: 482.6,
    cmcMm: 1.8,
    cmcPct: 0.087,
    aggregationNumber: 69,
    micelleMwKDa: 33.0,
    dialyzability: 'slowly_dialyzed',
    recommendedWorkingMultiplier: [1.5, 2.5],
    description: 'Shorter chain maltoside cousin of DDM. Moderate CMC (1.8 mM) permits gradual dialysis. Creates smaller micellar belt (33 kDa), frequently useful in 2D and 3D crystallization trials.',
  },
  chaps: {
    id: 'chaps',
    name: 'CHAPS',
    fullName: '3-[(3-Cholamidopropyl)dimethylammonio]-1-propanesulfonate',
    category: 'zwitterionic',
    molecularWeight: 614.9,
    cmcMm: 8.0,
    cmcPct: 0.49,
    aggregationNumber: 10,
    micelleMwKDa: 6.0,
    dialyzability: 'easily_dialyzed',
    recommendedWorkingMultiplier: [1.2, 2.0],
    description: 'Zwitterionic bile acid derivative with rigid steroid backbone. Forms tiny oligomeric micelles (~6–10 monomers, 6 kDa). Easily dialyzable and non-denaturing; excellent for breaking non-specific protein aggregates.',
  },
  digitonin: {
    id: 'digitonin',
    name: 'Digitonin',
    fullName: 'Digitonin (Steroidal saponin)',
    category: 'non-ionic',
    molecularWeight: 1229.3,
    cmcMm: 0.5,
    cmcPct: 0.06,
    aggregationNumber: 60,
    micelleMwKDa: 74.0,
    dialyzability: 'slowly_dialyzed',
    recommendedWorkingMultiplier: [1.5, 3.0],
    description: 'Natural steroid saponin renowned for preserving fragile multi-subunit complexes (e.g., mitochondrial respirasomes, GPCR-G protein assemblies). Slowly dialyzable; high micelle MW (~74 kDa).',
  },
  triton_x100: {
    id: 'triton_x100',
    name: 'Triton X-100',
    fullName: 'Polyethylene glycol tert-octylphenyl ether',
    category: 'non-ionic',
    molecularWeight: 625.0,
    cmcMm: 0.24,
    cmcPct: 0.015,
    aggregationNumber: 140,
    micelleMwKDa: 88.0,
    dialyzability: 'non_dialyzable',
    recommendedWorkingMultiplier: [2.0, 5.0],
    description: 'Classic polyoxyethylene detergent with strong UV absorption at 280 nm (aromatic ring), interfering with spectrophotometric protein quantification. Forms bulky 88 kDa micelles; practically non-dialyzable.',
  },
  tween_20: {
    id: 'tween_20',
    name: 'Tween-20',
    fullName: 'Polysorbate 20 (Polyoxyethylene sorbitan monolaurate)',
    category: 'non-ionic',
    molecularWeight: 1228.0,
    cmcMm: 0.06,
    cmcPct: 0.007,
    aggregationNumber: 40,
    micelleMwKDa: 49.0,
    dialyzability: 'non_dialyzable',
    recommendedWorkingMultiplier: [2.0, 5.0],
    description: 'Flexible branched polyoxyethylene surfactant widely used in blocking buffers and protein stabilization. Extremely low CMC (0.06 mM); essentially non-dialyzable.',
  },
};

export const DETERGENT_LIST: DetergentInfo[] = Object.values(DETERGENT_DATABASE);

export type ConcentrationUnit = 'mM' | '%' | 'mg/mL';

/**
 * Validates that a numeric argument is finite and non-negative.
 */
function assertNonNegative(val: number, label: string): void {
  if (!Number.isFinite(val) || val < 0) {
    throw new DetergentError(`${label} must be a finite, non-negative number`);
  }
}

/**
 * Validates that a numeric argument is finite and strictly positive.
 */
function assertPositive(val: number, label: string): void {
  if (!Number.isFinite(val) || val <= 0) {
    throw new DetergentError(`${label} must be a finite, positive number`);
  }
}

// ---------------------------------------------------------------------------
// 1. Concentration Conversions
// ---------------------------------------------------------------------------

/**
 * Converts concentration from mM to % (w/v).
 * % (w/v) = (conc_mM * MW) / 10,000
 * (Because 1% = 1 g / 100 mL = 10 g / L = 10,000 mg / L = 10,000 / MW mM).
 */
export function mmToPercent(concMm: number, mw: number): number {
  assertNonNegative(concMm, 'Concentration');
  assertPositive(mw, 'Molecular weight');
  return (concMm * mw) / 10000;
}

/**
 * Converts concentration from % (w/v) to mM.
 * mM = (conc_pct * 10,000) / MW
 */
export function percentToMm(concPct: number, mw: number): number {
  assertNonNegative(concPct, 'Concentration');
  assertPositive(mw, 'Molecular weight');
  return (concPct * 10000) / mw;
}

/**
 * Converts concentration from mM to mg/mL.
 * mg/mL = (conc_mM * MW) / 1,000
 */
export function mmToMgMl(concMm: number, mw: number): number {
  assertNonNegative(concMm, 'Concentration');
  assertPositive(mw, 'Molecular weight');
  return (concMm * mw) / 1000;
}

/**
 * Converts concentration from mg/mL to mM.
 * mM = (conc_mg_per_ml * 1,000) / MW
 */
export function mgMlToMm(concMgMl: number, mw: number): number {
  assertNonNegative(concMgMl, 'Concentration');
  assertPositive(mw, 'Molecular weight');
  return (concMgMl * 1000) / mw;
}

/**
 * Converts % (w/v) to mg/mL.
 * 1% (w/v) = 1 g / 100 mL = 10 mg / mL.
 */
export function percentToMgMl(concPct: number): number {
  assertNonNegative(concPct, 'Concentration');
  return concPct * 10;
}

/**
 * Converts mg/mL to % (w/v).
 */
export function mgMlToPercent(concMgMl: number): number {
  assertNonNegative(concMgMl, 'Concentration');
  return concMgMl / 10;
}

/**
 * Unified concentration conversion across mM, % (w/v), and mg/mL.
 */
export function convertConcentration(
  value: number,
  from: ConcentrationUnit,
  to: ConcentrationUnit,
  mw: number
): number {
  if (from === to) return value;
  assertNonNegative(value, 'Concentration value');
  assertPositive(mw, 'Molecular weight');

  // Convert incoming to mM as common intermediate
  let inMm = 0;
  if (from === 'mM') inMm = value;
  else if (from === '%') inMm = percentToMm(value, mw);
  else if (from === 'mg/mL') inMm = mgMlToMm(value, mw);

  // Convert from mM to target unit
  if (to === 'mM') return inMm;
  if (to === '%') return mmToPercent(inMm, mw);
  if (to === 'mg/mL') return mmToMgMl(inMm, mw);

  throw new DetergentError(`Unsupported target unit: ${to}`);
}

// ---------------------------------------------------------------------------
// 2. Free vs Micellar Partitioning
// ---------------------------------------------------------------------------

export interface DetergentPartition {
  totalConcMm: number;
  totalConcPct: number;
  totalConcMgMl: number;
  freeConcMm: number;
  freeConcPct: number;
  freeConcMgMl: number;
  micellarConcMm: number;
  micellarConcPct: number;
  micellarConcMgMl: number;
  cmcRatio: number; // total / CMC
  micellarFraction: number; // micellar / total
  isAboveCmc: boolean;
}

/**
 * Calculates free (monomeric) vs micellar detergent partitioning according to
 * classical phase separation / pseudophase model:
 * C_free = min(C_total, CMC)
 * C_micellar = max(0, C_total - CMC)
 */
export function partitionDetergent(totalConcMm: number, cmcMm: number, mw: number): DetergentPartition {
  assertNonNegative(totalConcMm, 'Total concentration');
  assertPositive(cmcMm, 'CMC');
  assertPositive(mw, 'Molecular weight');

  const freeConcMm = Math.min(totalConcMm, cmcMm);
  const micellarConcMm = Math.max(0, totalConcMm - cmcMm);
  const cmcRatio = cmcMm > 0 ? totalConcMm / cmcMm : 0;
  const micellarFraction = totalConcMm > 0 ? micellarConcMm / totalConcMm : 0;
  const isAboveCmc = totalConcMm >= cmcMm;

  return {
    totalConcMm,
    totalConcPct: mmToPercent(totalConcMm, mw),
    totalConcMgMl: mmToMgMl(totalConcMm, mw),
    freeConcMm,
    freeConcPct: mmToPercent(freeConcMm, mw),
    freeConcMgMl: mmToMgMl(freeConcMm, mw),
    micellarConcMm,
    micellarConcPct: mmToPercent(micellarConcMm, mw),
    micellarConcMgMl: mmToMgMl(micellarConcMm, mw),
    cmcRatio,
    micellarFraction,
    isAboveCmc,
  };
}

// ---------------------------------------------------------------------------
// 3. Micelle Concentration and Particle Count
// ---------------------------------------------------------------------------

export interface MicelleCountResult {
  micelleConcMm: number; // Concentration of micelle particles (mM)
  micelleConcUm: number; // Concentration of micelle particles (µM)
  micelleMols: number; // Total moles of micelles in the sample volume
  micelleCount: number; // Total discrete micelle particles in sample
  freeMonomerCount: number; // Discrete free monomer molecules
  totalMonomerCount: number; // Total discrete detergent molecules
}

/**
 * Calculates micelle molar concentration and absolute particle count in a given sample volume.
 * [Micelle] = C_micellar / N_agg
 */
export function calculateMicelles(
  micellarConcMm: number,
  freeConcMm: number,
  aggregationNumber: number,
  volumeMl: number
): MicelleCountResult {
  assertNonNegative(micellarConcMm, 'Micellar concentration');
  assertNonNegative(freeConcMm, 'Free concentration');
  assertPositive(aggregationNumber, 'Aggregation number');
  assertNonNegative(volumeMl, 'Volume');

  const micelleConcMm = aggregationNumber > 0 ? micellarConcMm / aggregationNumber : 0;
  const micelleConcUm = micelleConcMm * 1000;

  // Volume in Liters
  const volumeL = volumeMl / 1000;

  // Moles: conc (mM) * 10^-3 M/mM * volume (L)
  const micelleMols = micelleConcMm * 1e-3 * volumeL;
  const freeMonomerMols = freeConcMm * 1e-3 * volumeL;
  const totalMonomerMols = (micellarConcMm + freeConcMm) * 1e-3 * volumeL;

  const micelleCount = micelleMols * AVOGADRO;
  const freeMonomerCount = freeMonomerMols * AVOGADRO;
  const totalMonomerCount = totalMonomerMols * AVOGADRO;

  return {
    micelleConcMm,
    micelleConcUm,
    micelleMols,
    micelleCount,
    freeMonomerCount,
    totalMonomerCount,
  };
}

// ---------------------------------------------------------------------------
// 4. Illustrative PDC Mass Model and Mass-Based SEC Screen
// ---------------------------------------------------------------------------

export interface SecColumnRecommendation {
  name: string;
  fractionationRangeKDa: [number, number];
  suitability: 'mass_range_match' | 'near_mass_range' | 'outside_mass_range';
  notes: string;
}

export interface ComplexMwResult {
  proteinMonomerMwKDa: number;
  stoichiometry: number;
  proteinTotalMwKDa: number;
  micelleMwKDa: number;
  complexMwKDa: number;
  proteinMassFraction: number; // 0 to 1
  detergentMassFraction: number; // 0 to 1
  estimatedStokesRadiusNm: number; // Globular-equivalent hydrodynamic radius Rh
  secColumns: SecColumnRecommendation[];
}

/**
 * Standard SEC analytical / preparative columns widely used in membrane structural biology.
 */
const SEC_COLUMNS = [
  { name: 'Superdex 75 Increase 10/300 GL', minKDa: 3, maxKDa: 70, optimalMin: 5, optimalMax: 50 },
  { name: 'Superdex 200 Increase 10/300 GL', minKDa: 10, maxKDa: 600, optimalMin: 40, optimalMax: 450 },
  { name: 'Superose 6 Increase 10/300 GL', minKDa: 5, maxKDa: 5000, optimalMin: 100, optimalMax: 3000 },
];

/**
 * Calculates an illustrative one-reference-micelle PDC mass model and a
 * mass-based SEC screening estimate. The detergent/lipid belt and PDC shape
 * are protein- and condition-dependent; this is not a measured PDC mass,
 * hydrodynamic radius, or SEC-elution prediction.
 */
export function calculateComplexMw(
  proteinMwKDa: number,
  micelleMwKDa: number,
  stoichiometry = 1
): ComplexMwResult {
  assertPositive(proteinMwKDa, 'Protein molecular weight');
  assertPositive(micelleMwKDa, 'Micelle molecular weight');
  assertPositive(stoichiometry, 'Stoichiometry');

  const proteinTotalMwKDa = proteinMwKDa * stoichiometry;
  const complexMwKDa = proteinTotalMwKDa + micelleMwKDa;
  const proteinMassFraction = proteinTotalMwKDa / complexMwKDa;
  const detergentMassFraction = micelleMwKDa / complexMwKDa;

  // Globular-equivalent Rh estimate (nm) from the illustrative mass model:
  // Rh ≈ 0.066 * (MW_Da)^(1/3). PDC geometry can differ substantially.
  const complexMwDa = complexMwKDa * 1000;
  const estimatedStokesRadiusNm = 0.066 * Math.cbrt(complexMwDa);

  // Evaluate SEC column suitability
  const secColumns: SecColumnRecommendation[] = SEC_COLUMNS.map(col => {
    let suitability: 'mass_range_match' | 'near_mass_range' | 'outside_mass_range' = 'outside_mass_range';
    let notes = '';

    if (complexMwKDa >= col.optimalMin && complexMwKDa <= col.optimalMax) {
      suitability = 'mass_range_match';
      notes = `The illustrative mass model (${complexMwKDa.toFixed(1)} kDa) falls within this column's nominal mass range (${col.minKDa}–${col.maxKDa} kDa). Confirm with a pilot run because PDC shape and detergent/lipid binding affect elution.`;
    } else if (complexMwKDa >= col.minKDa && complexMwKDa <= col.maxKDa) {
      suitability = 'near_mass_range';
      notes = `The illustrative mass model is inside the nominal range (${col.minKDa}–${col.maxKDa} kDa), near a boundary. Confirm with a pilot run because PDC shape and detergent/lipid binding affect elution.`;
    } else if (complexMwKDa < col.minKDa) {
      notes = `The illustrative mass model is below this column's nominal range; it may elute near total column volume (Vt).`;
    } else {
      notes = `The illustrative mass model exceeds this column's nominal range; it may elute near void volume (V0).`;
    }

    return {
      name: col.name,
      fractionationRangeKDa: [col.minKDa, col.maxKDa],
      suitability,
      notes,
    };
  });

  return {
    proteinMonomerMwKDa: proteinMwKDa,
    stoichiometry,
    proteinTotalMwKDa,
    micelleMwKDa,
    complexMwKDa,
    proteinMassFraction,
    detergentMassFraction,
    estimatedStokesRadiusNm,
    secColumns,
  };
}

// ---------------------------------------------------------------------------
// 5. Dialyzability Assessment
// ---------------------------------------------------------------------------

export type DialyzabilityRating = 'easily_dialyzed' | 'slowly_dialyzed' | 'non_dialyzable';

export interface DialyzabilityAssessment {
  score: number; // 0 (impossible) to 100 (readily dialyzable)
  rating: DialyzabilityRating;
  label: string;
  description: string;
  monomerDiffusibility: string;
  removalStrategy: string[];
}

/**
 * Assesses dialyzability of detergent based on published CMC thermodynamics.
 * High CMC (>= 2.0 mM): Monomer gradient across membrane is high; readily dialyzed.
 * Intermediate (0.5 to 2.0 mM): Dialyzable with extended time and multiple bath changes.
 * Low CMC (< 0.5 mM): Practically non-dialyzable; requires Bio-Beads or cyclodextrins.
 */
export function assessDialyzability(cmcMm: number): DialyzabilityAssessment {
  assertPositive(cmcMm, 'CMC');

  if (cmcMm >= 2.0) {
    // Score between 70 and 100
    const score = Math.min(100, Math.round(70 + Math.min(30, (cmcMm - 2.0) * 2)));
    return {
      score,
      rating: 'easily_dialyzed',
      label: 'Easily Dialyzable',
      description: `High CMC (${cmcMm} mM ≥ 2 mM). Rapidly removed or exchanged using standard dialysis tubing (MWCO 3.5–14 kDa) or centrifugal diafiltration.`,
      monomerDiffusibility: 'Rapid monomer diffusion across dialysis membrane pore cutoffs.',
      removalStrategy: [
        'Standard dialysis cassettes or tubing (MWCO 3.5–14 kDa) against detergent-free buffer (2–3 changes, 4–8 h each at 4°C).',
        'Centrifugal ultrafiltration (Amicon Ultra / Vivaspin) with 5–7 diafiltration volumes (DFV).',
        'Gravity-flow gel filtration (e.g. PD-10 desalting).',
      ],
    };
  }

  if (cmcMm >= 0.5) {
    // Score between 30 and 69
    const score = Math.round(30 + ((cmcMm - 0.5) / 1.5) * 39);
    return {
      score,
      rating: 'slowly_dialyzed',
      label: 'Slowly Dialyzable',
      description: `Moderate CMC (${cmcMm} mM, 0.5–2.0 mM). Dialysis is feasible but slow, demanding large bath volumes and extended equilibration (>48–72 hours).`,
      monomerDiffusibility: 'Moderate monomer diffusion; significant micellar fraction remains trapped.',
      removalStrategy: [
        'Prolonged dialysis (>48–72 hours at 4°C) with 4–6 buffer changes at 1:500–1:1000 volume ratio.',
        'Bio-Beads SM-2 polystyrene adsorbent (gentle rate to prevent protein precipitation).',
        'Size exclusion chromatography (SEC) running in the target exchange buffer.',
      ],
    };
  }

  // Low CMC (< 0.5 mM)
  const score = Math.max(0, Math.round((cmcMm / 0.5) * 28));
  return {
    score,
    rating: 'non_dialyzable',
    label: 'Practically Non-Dialyzable',
    description: `Low CMC (${cmcMm} mM < 0.5 mM). Monomer driving force across dialysis membrane is virtually zero, while micelles (50–100 kDa) are retained.`,
    monomerDiffusibility: 'Negligible monomer gradient; standard dialysis will fail to remove detergent.',
    removalStrategy: [
      'Bio-Beads SM-2 or Amberlite XAD-2 hydrophobic adsorbent beads.',
      'Methyl-β-cyclodextrin or α-cyclodextrin trapping (extracts hydrophobic alkyl chains).',
      'On-column exchange during affinity chromatography (Ni-NTA, Strep-Tactin, or anti-FLAG wash step).',
      'SEC column equilibration with target buffer / detergent.',
    ],
  };
}

// ---------------------------------------------------------------------------
// 6. Detergent-to-Protein Bulk Concentration Estimate
// ---------------------------------------------------------------------------

export interface DetergentProteinRatioResult {
  proteinMolarConcMm: number;
  proteinMolarConcUm: number;
  /** Total detergent monomers divided by protein molecules; not bound detergent. */
  detergentMolarRatio: number;
  /**
   * Detergent-only pseudophase estimate of bulk micelle particles divided by
   * protein molecules. This is not protein-detergent-complex (PDC) stoichiometry.
   */
  bulkMicelleToProteinRatio: number;
  /** Reciprocal of bulkMicelleToProteinRatio when bulk micelles are present. */
  proteinToBulkMicelleRatio: number;
  /** Explanation of the model boundary and required experimental validation. */
  interpretation: string;
}

/**
 * Estimates concentration-derived detergent/protein ratios under a detergent-only
 * pseudophase model. Protein- and lipid-bound detergent are not partitioned by
 * this model, so the bulk micelle ratio cannot establish PDC coverage, solubility,
 * activity, or monodispersity.
 */
export function calculateDetergentProteinRatio(
  proteinMwKDa: number,
  proteinConcMgMl: number,
  totalDetergentMm: number,
  micellarDetergentMm: number,
  aggregationNumber: number
): DetergentProteinRatioResult {
  assertPositive(proteinMwKDa, 'Protein molecular weight');
  assertNonNegative(proteinConcMgMl, 'Protein concentration');
  assertNonNegative(totalDetergentMm, 'Total detergent concentration');
  assertNonNegative(micellarDetergentMm, 'Micellar detergent concentration');
  assertPositive(aggregationNumber, 'Aggregation number');

  if (proteinConcMgMl === 0) {
    return {
      proteinMolarConcMm: 0,
      proteinMolarConcUm: 0,
      detergentMolarRatio: 0,
      bulkMicelleToProteinRatio: 0,
      proteinToBulkMicelleRatio: 0,
      interpretation: 'No protein concentration was specified, so a bulk micelle-to-protein ratio cannot be calculated.',
    };
  }

  // Protein molar conc: (mg/mL) / (g/mol) = mol/L = M -> * 1000 = mM
  const proteinMwDa = proteinMwKDa * 1000;
  const proteinMolarConcMm = (proteinConcMgMl / proteinMwDa) * 1000;
  const proteinMolarConcUm = proteinMolarConcMm * 1000;

  const detergentMolarRatio = totalDetergentMm / proteinMolarConcMm;
  const micelleConcMm = micellarDetergentMm / aggregationNumber;
  const bulkMicelleToProteinRatio = micelleConcMm / proteinMolarConcMm;
  const proteinToBulkMicelleRatio = micelleConcMm > 0 ? proteinMolarConcMm / micelleConcMm : 0;
  const interpretation = `The detergent-only pseudophase model estimates ${bulkMicelleToProteinRatio.toFixed(2)} bulk micelle particles per protein molecule. Protein- and lipid-bound detergent are not modeled, so this value cannot determine protein coverage, PDC stoichiometry, solubility, activity, or monodispersity. Validate the sample with SEC, DLS, and an activity or stability assay.`;

  return {
    proteinMolarConcMm,
    proteinMolarConcUm,
    detergentMolarRatio,
    bulkMicelleToProteinRatio,
    proteinToBulkMicelleRatio,
    interpretation,
  };
}

// ---------------------------------------------------------------------------
// 7. Stock Dilution / Buffer Preparation
// ---------------------------------------------------------------------------

export interface DetergentDilutionResult {
  stockVolumeMl: number;
  stockVolumeUl: number;
  bufferVolumeMl: number;
  dilutionFactor: number;
  targetConcMm: number;
  targetConcPct: number;
  targetConcMgMl: number;
  finalCmcMultiplier: number;
}

/**
 * Calculates stock detergent solution volume required to prepare a target working buffer.
 */
export function calculateStockDilution(
  stockConc: number,
  stockUnit: ConcentrationUnit,
  targetConc: number,
  targetUnit: ConcentrationUnit,
  finalVolumeMl: number,
  mw: number,
  cmcMm: number
): DetergentDilutionResult {
  assertPositive(stockConc, 'Stock concentration');
  assertPositive(targetConc, 'Target concentration');
  assertPositive(finalVolumeMl, 'Final volume');
  assertPositive(mw, 'Molecular weight');
  assertPositive(cmcMm, 'CMC');

  const stockConcMm = convertConcentration(stockConc, stockUnit, 'mM', mw);
  const targetConcMm = convertConcentration(targetConc, targetUnit, 'mM', mw);

  if (targetConcMm > stockConcMm) {
    throw new DetergentError(
      `Target concentration (${targetConcMm.toFixed(3)} mM) cannot exceed stock concentration (${stockConcMm.toFixed(3)} mM)`
    );
  }

  const stockVolumeMl = (targetConcMm * finalVolumeMl) / stockConcMm;
  const stockVolumeUl = stockVolumeMl * 1000;
  const bufferVolumeMl = finalVolumeMl - stockVolumeMl;
  const dilutionFactor = stockConcMm / targetConcMm;

  const targetConcPct = mmToPercent(targetConcMm, mw);
  const targetConcMgMl = mmToMgMl(targetConcMm, mw);
  const finalCmcMultiplier = targetConcMm / cmcMm;

  return {
    stockVolumeMl,
    stockVolumeUl,
    bufferVolumeMl,
    dilutionFactor,
    targetConcMm,
    targetConcPct,
    targetConcMgMl,
    finalCmcMultiplier,
  };
}
