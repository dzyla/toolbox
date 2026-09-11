import type { ToolId } from './registry';

export type AssuranceStatus = 'reference-tested' | 'method-documented' | 'review-required';

export interface ToolAssurance {
  status: AssuranceStatus;
  reviewed: string;
  scope: string;
  verification: string;
}

const reviewed = '2026-09-11';

/**
 * Method-level assurance for the registered Bio-Bench tools. These statuses
 * describe software-method evidence, not wet-lab, assay, or clinical validity.
 */
export const ASSURANCE: Record<ToolId, ToolAssurance> = {
  molarity: { status: 'method-documented', reviewed, scope: 'Molarity, mass-concentration, and C1V1 dilution arithmetic.', verification: 'Calculator behavior tests cover representative inputs.' },
  buffers: { status: 'reference-tested', reviewed, scope: 'Buffer recipes from declared stocks, solids, and hydrate forms.', verification: 'Audited supplier molecular-weight fixtures cover chemical data.' },
  centrifuge: { status: 'reference-tested', reviewed, scope: 'RPM/RCF conversion and rotor k-factor timing calculations.', verification: 'Rotor preset and conversion fixtures exercise the core formulas.' },
  'master-mix': { status: 'method-documented', reviewed, scope: 'Reaction master-mix scaling with configurable excess and dead volume.', verification: 'Calculator behavior tests cover representative reaction setups.' },
  'ammonium-sulfate': { status: 'method-documented', reviewed, scope: 'Ammonium-sulfate mass estimates for specified saturation cuts.', verification: 'Calculator behavior tests cover temperature and cut selection.' },
  cryoem: { status: 'method-documented', reviewed, scope: 'Cryo-EM sampling, box-size, dose, and CTF planning calculations.', verification: 'Interface tests cover representative planning inputs and displays.' },
  fitting: { status: 'method-documented', reviewed, scope: 'Curve fitting for declared 4PL, linear, kinetic, and exponential models.', verification: 'Component tests cover model selection and fitted-result rendering.' },
  sec: { status: 'review-required', reviewed, scope: 'Chromatography calibration, trace review, gradient planning, and UV-Vis calculations.', verification: 'Core and UI tests preserve explicit review gates for exploratory workflows.' },
  diafiltration: { status: 'method-documented', reviewed, scope: 'Diafiltration volume cycles and dialysis kinetic estimates.', verification: 'Interface tests cover mode changes and representative simulations.' },
  dsf: { status: 'method-documented', reviewed, scope: 'Thermal-shift derivative, Boltzmann-fit, and delta-Tm calculations.', verification: 'Core and UI tests cover representative thermal-shift fixtures.' },
  detergent: { status: 'method-documented', reviewed, scope: 'CMC, micelle mass, and protein-detergent-complex sizing estimates.', verification: 'Core tests cover representative detergent calculations.' },
  protein: { status: 'method-documented', reviewed, scope: 'Protein sequence composition, molecular mass, pI, and digest analysis.', verification: 'Core tests cover sequence-analysis behavior and edge cases.' },
  structure: { status: 'review-required', reviewed, scope: 'Local or fetched structure visualization and coordinate-derived metrics.', verification: 'UI tests cover loading and presentation, not structure interpretation.' },
  'protein-conc': { status: 'method-documented', reviewed, scope: 'Protein concentration conversions from absorbance and declared coefficients.', verification: 'Calculator behavior tests cover representative concentration inputs.' },
  nucleic: { status: 'method-documented', reviewed, scope: 'Nucleic-acid concentration, mass, copy-number, and melting estimates.', verification: 'Core tests cover sequence and concentration calculation behavior.' },
  sequence: { status: 'review-required', reviewed, scope: 'Sequence viewing, editing, annotation, and local format transformations.', verification: 'Interface tests cover editing behavior, not biological interpretation.' },
  plasmid: { status: 'method-documented', reviewed, scope: 'Circular and linear plasmid maps, feature display, ORF, and restriction analysis.', verification: 'Core import and workspace tests cover structured sequence fixtures.' },
  cloning: { status: 'method-documented', reviewed, scope: 'In-silico Gibson, mutagenesis, restriction-ligation, and Golden Gate planning.', verification: 'Core tests cover source preservation and mutation-planning fixtures.' },
  'rare-codons': { status: 'review-required', reviewed, scope: 'Codon-use summaries, pause clusters, and expression-strain suggestions.', verification: 'Interface tests cover displayed heuristics; expression outcomes need review.' },
  align: { status: 'reference-tested', reviewed, scope: 'Pairwise global and local sequence alignment with declared scoring matrices.', verification: 'Core alignment fixtures verify expected scoring and alignment results.' },
  'seq-matrix': { status: 'method-documented', reviewed, scope: 'Multi-sequence identity, similarity, conservation, and matrix visualization.', verification: 'Component tests cover representative matrix and heatmap behavior.' },
  binding: { status: 'method-documented', reviewed, scope: 'Equilibrium binding fractions, Kd, Hill, and Cheng-Prusoff calculations.', verification: 'Core tests cover representative equilibrium calculation cases.' },
  primers: { status: 'reference-tested', reviewed, scope: 'Primer thermodynamics, 3-prime stability, hairpin, dimer, and Ta estimates.', verification: 'SantaLucia reference-value fixtures exercise thermodynamic calculations.' },
  qpcr: { status: 'method-documented', reviewed, scope: 'Cq table processing, standard-curve checks, and relative-expression calculations.', verification: 'Core tests cover representative qPCR calculation fixtures.' },
  tags: { status: 'reference-tested', reviewed, scope: 'Protease cleavage, affinity-tag, and virtual SDS-PAGE sequence simulations.', verification: 'Literature-pinned protease and tag fixtures exercise the scientific core.' },
  gel: { status: 'method-documented', reviewed, scope: 'Gel and blot annotation, ladder-assisted sizing, and densitometry workflows.', verification: 'Core transform and export tests cover image-processing behavior.' },
  measure: { status: 'method-documented', reviewed, scope: 'Calibrated image distance and area measurement from user-defined scale.', verification: 'Interface tests cover calibration and coordinate-rescaling behavior.' },
  colonies: { status: 'method-documented', reviewed, scope: 'On-device colony marking, counting, and calibrated plate-density summaries.', verification: 'Core SI-unit fixtures and interface tests cover counting workflows.' },
  hemocytometer: { status: 'method-documented', reviewed, scope: 'Hemocytometer cell-count, viability, and seeding-density calculations.', verification: 'Calculator behavior tests cover representative counting inputs.' },
  tally: { status: 'method-documented', reviewed, scope: 'Named manual counters with user-set limits and totals.', verification: 'Interface tests cover counter state and limit behavior.' },
  plate: { status: 'method-documented', reviewed, scope: 'Multi-well layout, serial dilution, normalization, and curve-fit planning.', verification: 'Component tests cover representative plate layout and analysis flows.' },
  'plate-reader': { status: 'method-documented', reviewed, scope: 'Plate-reader matrix parsing, blanking, QC, normalization, and fit export.', verification: 'Core and UI tests cover representative plate-reader fixtures.' },
  culture: { status: 'method-documented', reviewed, scope: 'Cell-culture passaging, seeding, growth, and harvest timing estimates.', verification: 'Interface tests cover presets, regression, and predictor behavior.' },
  timers: { status: 'method-documented', reviewed, scope: 'Browser-local countdown, stopwatch, and multi-timer timekeeping.', verification: 'Interface tests cover timer controls and state transitions.' },
  protocols: { status: 'method-documented', reviewed, scope: 'Stepwise protocol checklists with browser-local timer support.', verification: 'Interface tests cover protocol and timer interaction behavior.' },
  colors: { status: 'reference-tested', reviewed, scope: 'Scientific palette generation, color-vision simulation, contrast, and export.', verification: 'Published color-science and WCAG anchor fixtures exercise the core.' },
  'unit-converter': { status: 'method-documented', reviewed, scope: 'Laboratory and customary-unit conversions across declared dimensions.', verification: 'Core and UI tests cover representative conversion fixtures.' },
};

export function assuranceFor(toolId: string): ToolAssurance {
  const assurance = ASSURANCE[toolId];
  if (!assurance) throw new Error(`No assurance record is registered for tool "${toolId}".`);
  return assurance;
}

export function assuranceSummary(): Record<AssuranceStatus, number> {
  return Object.values(ASSURANCE).reduce<Record<AssuranceStatus, number>>(
    (total, record) => ({ ...total, [record.status]: total[record.status] + 1 }),
    { 'reference-tested': 0, 'method-documented': 0, 'review-required': 0 },
  );
}
