import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Colony forming units (CFU) and serial dilution plating',
  formulas: [
    'CFU/mL = (Colonies counted / Volume plated in mL) × Dilution factor',
    'Total CFU = Colonies counted × Dilution factor',
  ],
  assumptions: [
    'Statistically valid counts typically range from 30 to 300 colonies per standard 100 mm agar plate.',
    'Assumes each visible colony arises from a single viable bacterial cell or fungal spore (or uniform clump).',
    'Dilution factor represents the reciprocal of the dilution (e.g. 10⁻⁴ dilution = 10,000 dilution factor).',
  ],
  references: [
    { text: 'Breed, R. S., & Dotterrer, W. D. (1916). The Number of Colonies Allowable on Satisfactory Agar Plates. J Bacteriol, 1(3), 321–331.', url: 'https://doi.org/10.1128/jb.1.3.321-331.1916' },
  ],
  verified: '2026-09-03',
};
