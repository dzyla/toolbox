import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Differential Scanning Fluorimetry (DSF / nanoDSF) & Thermal Shift Assay',
  formulas: [
    'Two-State Boltzmann Sigmoid: F(T) = Fmin + (Fmax - Fmin) / [1 + exp((Tm - T) / a)], where a is the transition slope factor',
    'Denaturation Midpoint Inflection: (dF/dT)max = (Fmax - Fmin) / (4·a), occurring precisely at T = Tm for a two-state process',
    'Savitzky-Golay Numerical 1st Derivative: dF/dT = [1 / (h · S2)] · Σ j·F(T + j·h), for window 2m+1 with S2 = m(m+1)(2m+1)/3',
    'Sub-step Parabolic Peak Refinement: Tm = T_peak - B / (2·A), derived from the vertex of a 3-point local quadratic fit to dF/dT',
    'Ligand Thermal Shift: ΔTm = Tm(sample) - Tm(reference), where ΔTm > 0 denotes thermodynamic stabilization',
    'Apparent Unfolding Enthalpy (van \'t Hoff): ΔH_unf = R · (Tm_K)² / a, with R = 8.31446 J·mol⁻¹·K⁻¹ and Tm_K = Tm(°C) + 273.15',
  ],
  assumptions: [
    'Two-state transition: protein denaturation is modeled as a cooperative two-state equilibrium (Native ⇌ Unfolded) without populated unfolding intermediates.',
    'Fluorophore mechanism: extrinsic dye (SYPRO Orange) binds non-covalently to exposed hydrophobic cores with low native-state background, or intrinsic nanoDSF (F350/F330) monitors tryptophan dipole solvation.',
    'Post-peak aggregation: at elevated temperatures, irreversible aggregation and dye exclusion often lead to signal roll-off; Boltzmann regression is bounded to the unfolding transition window.',
    'Equilibrium thermodynamic linkage: ligand stabilization (ΔTm > 0) is driven by preferential binding to the folded state (Wyman-Tanford linkage).',
    'Savitzky-Golay window: uses an odd window length (e.g. 7 or 9 points) with quadratic polynomial convolution to suppress high-frequency noise without broadening or shifting peak Tm.',
  ],
  references: [
    {
      text: 'Niesen FH, Berglund H, Vedadi M (2007) The use of differential scanning fluorimetry to detect ligand interactions that promote protein stability. Nat Protoc 2(9):2212–2221',
      url: 'https://doi.org/10.1038/nprot.2007.321',
    },
    {
      text: 'Pantoliano MW, Petrella EC, Kwasnoski JD, et al. (2001) High-density miniaturized thermal shift assays of proteins. J Biomol Screen 6(6):429–440',
      url: 'https://doi.org/10.1177/108705710100600609',
    },
    {
      text: 'Vedadi M, Niesen FH, Allali-Hassani A, et al. (2006) Chemical screening methods to identify ligands that promote protein stability. Proc Natl Acad Sci USA 103(43):15835–15840',
      url: 'https://doi.org/10.1073/pnas.0605224103',
    },
    {
      text: 'Savitzky A, Golay MJE (1964) Smoothing and differentiation of data by simplified least squares procedures. Anal Chem 36(8):1627–1639',
      url: 'https://doi.org/10.1021/ac60214a047',
    },
  ],
  verified: '2026-09-05',
};
