import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Size Exclusion Chromatography (SEC) Calibration & Hydrodynamics',
  formulas: [
    'Kav = (Ve - V0) / (Vt - V0) ; Gel phase distribution coefficient',
    'Kav = -m × log10(MW) + c ; Linear calibration curve across fractionation range',
    'Rh ≈ 0.066 × MW^(1/3) nm ; Empirical Stokes radius for hydrated globular proteins',
    'N_subunits = MW_apparent / MW_monomer ; Estimated oligomeric state',
  ],
  assumptions: [
    'Standard proteins and samples behave as compact globular particles in solution.',
    'Non-specific interactions (hydrophobic or electrostatic) are suppressed by adequate mobile phase ionic strength (~150 mM NaCl, pH 7–8).',
    'Sample loading volume is ≤ 1–2% of column bed volume Vt to prevent column overload and peak distortion.',
  ],
  references: [
    { text: 'Laurent TC, Killander J. Theory of gel filtration and experimental verification. J Chromatogr. 1964;14:317-330.', url: 'https://doi.org/10.1016/S0021-9673(00)86637-6' },
    { text: 'Erickson HP. Size and shape of protein molecules at the nanometer level. Biol Proced Online. 2009;11(1):32-51.', url: 'https://doi.org/10.1007/s12575-009-9008-x' },
    { text: 'Cytiva Handbook: Size Exclusion Chromatography Principles and Methods (2021)', url: 'https://www.cytivalifesciences.com' },
  ],
  verified: '2026-09-03',
};
