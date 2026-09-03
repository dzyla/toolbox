import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Microplate layouts, replicate randomization, and dilution series',
  formulas: [
    'Replicate mean x̄ = (1/n) × ∑ x_i',
    'Standard Deviation s = √[ (1/(n - 1)) × ∑ (x_i - x̄)² ]',
    'Coefficient of Variation CV (%) = (s / x̄) × 100',
  ],
  assumptions: [
    'ANSI/SLAS microplate standards for 6-, 12-, 24-, 48-, 96-, and 384-well microplates.',
    'Edge wells in 96/384-well plates often exhibit increased evaporation ("edge effect"); dedicating outer wells to water/PBS blanks is standard best practice for long incubations.',
  ],
  references: [
    { text: 'ANSI/SLAS Microplate Standards Guidelines', url: 'https://www.slas.org' },
  ],
  verified: '2026-09-03',
};
