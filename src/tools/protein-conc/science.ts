import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Protein concentration',
  formulas: [
    'Beer–Lambert: A₂₈₀ = ε₂₈₀ × c × path length',
    'c (mol/L) = A₂₈₀ × dilution / (ε₂₈₀ × path length)',
    'mass concentration (g/L) = c × molecular weight (g/mol)',
    'linear standard: A = b₀ + b₁c; quadratic standard: A = b₀ + b₁c + b₂c²',
    'R² = 1 − residual sum of squares / total sum of squares',
  ],
  assumptions: [
    'A280 is blank-corrected and within the instrument linear range.',
    'Sequence-derived ε uses native-water coefficients and assumes all cysteines form cystines.',
    'Standard-curve fits use ordinary unweighted least squares. Unknowns outside the calibration range are extrapolations.',
    'Bradford and BCA response depends on the protein and reagent; match standards and samples where possible.',
  ],
  references: [
    { text: 'Pace et al. 1995, Protein Science 4:2411–2423', url: 'https://doi.org/10.1002/pro.5560041120' },
    { text: 'Bradford 1976, Analytical Biochemistry 72:248–254', url: 'https://doi.org/10.1016/0003-2697(76)90527-3' },
    { text: 'ExPASy ProtParam documentation', url: 'https://web.expasy.org/protparam/protparam-doc.html' },
  ],
  verified: '2026-09-03',
};
