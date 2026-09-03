import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Standard operating procedures (SOPs) and protocol workflows',
  formulas: [
    'Completion (%) = (Completed steps / Total steps) × 100',
  ],
  assumptions: [
    'Step-by-step sequential procedures with inline critical timing milestones.',
    'Protocols use standard markdown checkbox notation `- [ ]` and custom timer brackets `[timer: X min]`.',
  ],
  references: [
    { text: 'Green, M. R., & Sambrook, J. (2012). Molecular Cloning: A Laboratory Manual (4th ed.). Cold Spring Harbor Laboratory Press.', url: 'https://www.cshlpress.com' },
  ],
  verified: '2026-09-03',
};
