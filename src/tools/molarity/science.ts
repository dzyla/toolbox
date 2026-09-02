import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Molarity and dilution',
  formulas: ['mass (g) = C (mol/L) × V (L) × MW (g/mol)', 'C1 × V1 = C2 × V2', 'diluent = V2 − V1'],
  assumptions: [
    'Volumes are additive (true for dilute aqueous solutions).',
    'MW is for the exact form you weigh (hydrate, salt). The Buffer tool has a chemical list with hydrate forms.',
    'Purity 100 %.',
  ],
  references: [{ text: 'IUPAC Gold Book: amount concentration', url: 'https://goldbook.iupac.org/terms/view/A00295' }],
  verified: '2026-09-02',
};
