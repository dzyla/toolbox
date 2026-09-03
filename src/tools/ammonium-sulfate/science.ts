import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Ammonium sulfate precipitation',
  formulas: [
    '25 °C: grams/L = 533 × (S₂ − S₁) / (100 − 0.30 S₂)',
    '0–4 °C: grams/L = 515 × (S₂ − S₁) / (100 − 0.27 S₂)',
    'grams to add = grams/L × starting volume (L)',
  ],
  assumptions: [
    'S₁ and S₂ are percent saturation, not percent w/v.',
    'The target must exceed the current saturation and remain below 100%.',
    'Add solid ammonium sulfate slowly with stirring while maintaining the selected temperature.',
  ],
  references: [
    { text: 'Green & Hughes (1955), Protein Fractionation on the Basis of Solubility', url: 'https://doi.org/10.1016/0076-6879(55)01014-8' },
    { text: 'Wingfield (2001), Protein Precipitation Using Ammonium Sulfate', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4817497/' },
  ],
  verified: '2026-09-03',
};
