import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Molarity and dilution',
  formulas: [
    'mass (g) = C (mol/L) × V (L) × MW (g/mol)',
    'C1 × V1 = C2 × V2',
    'diluent = V2 − V1',
    'serial transfer = final well volume / (dilution factor − 1)',
    'well 1 preparation = final well volume + transfer volume',
  ],
  assumptions: [
    'Volumes are additive (true for dilute aqueous solutions).',
    'MW is for the exact form you weigh (hydrate, salt). The Buffer tool has a chemical list with hydrate forms.',
    'Purity 100 %.',
    'Serial-dilution rows use equal final volumes after each transfer; remove the transfer volume from the final well as waste.',
  ],
  references: [{ text: 'IUPAC Gold Book: amount concentration', url: 'https://goldbook.iupac.org/terms/view/A00295' }],
  verified: '2026-09-03',
};
