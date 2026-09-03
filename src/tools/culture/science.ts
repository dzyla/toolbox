import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Cell culture passaging, surface areas, and doubling time',
  formulas: [
    'Growth rate µ (h⁻¹) = ln(N_final / N_initial) / t',
    'Doubling time T_d (h) = ln(2) / µ = t × [ln(2) / ln(N_final / N_initial)]',
    'Population doublings (PD) = log₂(N_final / N_initial)',
    'Target cells per vessel = Target density (cells/cm²) × Vessel surface area (cm²)',
    'Required harvest volume (mL) = Target cells per vessel / Harvest concentration (cells/mL)',
  ],
  assumptions: [
    'Assumes exponential log-phase growth during the measured incubation period.',
    'Surface areas and capacities are standard culture vessel specifications (Corning/Falcon/Greiner bio-one standards).',
    'Seeding density recommendations are typical for adherent mammalian cell lines (e.g. HEK293, HeLa, CHO).',
  ],
  references: [
    { text: 'Freshney, R. I. (2015). Culture of Animal Cells: A Manual of Basic Technique and Specialized Applications (7th ed.). Wiley-Blackwell.', url: 'https://doi.org/10.1002/9781118873373' },
    { text: 'Corning Cell Culture Vessel Dimensions and Surface Area Guidelines', url: 'https://www.corning.com' },
  ],
  verified: '2026-09-03',
};
