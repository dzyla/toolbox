import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Tally counting and statistical frequency',
  formulas: [
    'Percentage (%) = (Category count / Total count) × 100',
    'Standard Error (SE) = √[p(1 - p) / N]',
  ],
  assumptions: [
    'Independent events categorized into mutually exclusive bins.',
    'Total count N represents the sum across all active counters.',
  ],
  references: [
    { text: 'Statistical Principles in Biological Counting and Frequencies', url: 'https://en.wikipedia.org/wiki/Categorical_distribution' },
  ],
  verified: '2026-09-03',
};
