import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Master mix',
  formulas: [
    'effective reactions = reaction count × (1 + excess% / 100)',
    'total mix volume = reaction volume × effective reactions + dead volume',
    'component total = component volume per reaction × total mix volume / reaction volume',
    'water per reaction = reaction volume − Σ(component volumes)',
  ],
  assumptions: [
    'Dead volume is added to the whole mix and distributed proportionally across every component.',
    'Template can be listed as a component if it belongs in the common mix; otherwise omit it and account for its volume in the reaction total.',
    'All volumes are in microlitres.',
  ],
  references: [
    { text: 'Legacy Bio-Bench master-mix calculation, audited 2026-09-03' },
    { text: 'MIQE guidelines for qPCR assay reporting', url: 'https://doi.org/10.1373/clinchem.2008.112797' },
  ],
  verified: '2026-09-03',
};
