import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Chromatography Workbench: SEC, ion exchange, and UV-Vis review',
  formulas: [
    'Kav = (Ve - V0) / (Vt - V0) ; Gel phase distribution coefficient (Laurent & Killander 1964)',
    'Kav = -m × log10(MW) + c ; Linear calibration curve across column fractionation range',
    'Ve / V0 = a - b × log10(MW) ; Relative retention volume standard curve (Andrews 1965)',
    'Kd = (Ve - V0) / Vi ; True partition coefficient within accessible pore volume Vi',
    'Rh ≈ 0.066 × MW^(1/3) nm ; Empirical Stokes radius for hydrated globular proteins (Erickson 2009)',
    'N = (Ve / σ_V)^2 ; Theoretical plate count (chromatographic efficiency)',
    'N_subunits = MW_apparent / MW_monomer ; Estimated oligomeric state ratio',
    'A = εbc ; Beer–Lambert relation used for fraction amounts and DOL after user-supplied dye CF280 correction',
    'Ion-exchange polarity is a pI-versus-buffer-pH charge-sign starting point; the method remains subject to experimental review.',
  ],
  assumptions: [
    'Standard proteins and samples behave as compact globular particles in solution with partial specific volume v̄ ≈ 0.73 cm³/g and typical hydration shell δ ≈ 0.35 g/g.',
    'An elongated, rod-like, or intrinsically disordered protein has an expanded hydrodynamic radius (Rh) and will elute earlier than expected for a compact sphere of the same mass.',
    'Void volume V0 represents the complete exclusion limit (Kav = 0). Molecules eluting at Ve ≤ V0 cannot enter pores and their MW is at or above the matrix exclusion limit.',
    'Total volume Vt represents the geometric column bed volume (Kav = 1). Elution at Ve > Vt (Kav > 1) indicates non-ideal partitioning or attractive matrix interactions (e.g. aromatic/hydrophobic sticking).',
    'Non-specific interactions are suppressed by adequate mobile phase ionic strength (~150 mM NaCl, pH 7–8).',
    'Sample loading volume is ≤ 1–2% of column bed volume Vt to prevent volumetric band broadening.',
    'Chromatogram peak candidates and scatter corrections are review aids: they do not replace inspection of raw traces, fraction identity, or instrument metadata.',
    'Dye-to-protein labeling requires manufacturer-supplied dye ε and CF280; neither is inferred from a spectrum.',
  ],
  references: [
    { text: 'Laurent TC, Killander J. Theory of gel filtration and experimental verification. J Chromatogr. 1964;14:317-330.', url: 'https://doi.org/10.1016/S0021-9673(00)86637-6' },
    { text: 'Andrews P. The gel-filtration behaviour of proteins related to their molecular weights over a wide range. Biochem J. 1965;96(3):595-606.', url: 'https://doi.org/10.1042/bj0960595' },
    { text: 'Erickson HP. Size and shape of protein molecules at the nanometer level. Biol Proced Online. 2009;11(1):32-51.', url: 'https://doi.org/10.1007/s12575-009-9008-x' },
    { text: 'Cytiva Handbook: Size Exclusion Chromatography Principles and Methods (2021)', url: 'https://www.cytivalifesciences.com' },
  ],
  verified: '2026-09-05',
};
