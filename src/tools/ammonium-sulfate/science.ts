import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Ammonium sulfate precipitation',
  formulas: [
    'Solid Addition (25 °C): grams/L = 533 × (S₂ − S₁) / (100 − 0.30 S₂)',
    'Solid Addition (0–4 °C): grams/L = 515 × (S₂ − S₁) / (100 − 0.27 S₂)',
    'grams to add = grams/L × starting volume (L)',
    'Heuristic cut window (Cohn functional form): log₁₀(S) = β − Kₛ × (% saturation)',
    'Heuristic, uncalibrated: Kₛ = 0.052 × (MW/40 kDa)^0.36 × (1 + 0.32 × (GRAVY + 0.4))',
    'Heuristic, uncalibrated: β = 2.05 − 0.45 × (GRAVY + 0.4) + 0.10 × (pH − pI)²  (−0.06 at 0–4 °C)',
  ],
  assumptions: [
    'S₁ and S₂ are percent saturation, not percent w/v.',
    'The target must exceed the current saturation and remain below 100%.',
    'Add solid ammonium sulfate slowly with stirring while maintaining the selected temperature.',
    'The cut-window tab is a Bio-Bench heuristic, not a published predictive model. Only the functional form log S = β − Kₛ·I follows Cohn (1925); the sequence-based β and Kₛ constants are uncalibrated, and Cohn\'s equation is defined in ionic strength or molar salt rather than % saturation.',
    'Use the heuristic window only to choose pilot cuts; determine the actual precipitation range experimentally (Wingfield 2001).',
  ],
  references: [
    { text: 'Green & Hughes (1955), Protein Fractionation on the Basis of Solubility', url: 'https://doi.org/10.1016/0076-6879(55)01014-8' },
    { text: 'Cohn (1925), The Physical Chemistry of the Proteins', url: 'https://doi.org/10.1152/physrev.1925.5.3.349' },
    { text: 'Melander & Horváth (1977), Salt effects on hydrophobic interactions in precipitation and chromatography of proteins', url: 'https://doi.org/10.1016/0003-9861(77)90299-4' },
    { text: 'Wingfield (2001), Protein Precipitation Using Ammonium Sulfate', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4817497/' },
  ],
  verified: '2026-09-27',
};
