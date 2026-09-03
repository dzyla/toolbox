import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Buffer and media recipes',
  formulas: [
    'solid mass (g) = target (mol/L) × final volume (L) × formula MW (g/mol)',
    '% w/v mass (g) = target (%) × final volume (mL) / 100',
    'stock volume = target concentration × final volume / stock concentration',
    '[base]/[acid] = 10^(pH − pKa); pKa(T) = pKa(25 °C) + (dpKa/dT)(T − 25 °C)',
  ],
  assumptions: [
    'Molecular weight is for the exact salt or hydrate selected. Additional waters are ignored when the selected entry is already a named hydrate.',
    'Percentage solids are interpreted as % w/v; percentage stock liquids are interpreted as % v/v.',
    'Volumes are additive and stock and target units describe the same concentration basis.',
    'Adjust pH experimentally after dissolving components, then bring the solution to final volume.',
  ],
  references: [
    { text: 'Good et al. (1966), Hydrogen Ion Buffers for Biological Research', url: 'https://doi.org/10.1021/bi00866a011' },
    { text: 'Cold Spring Harbor Protocols recipe index', url: 'https://cshprotocols.cshlp.org/site/recipes/nav_t.dtl' },
    { text: 'Sigma-Aldrich TAE and TBE recipes', url: 'https://www.sigmaaldrich.com/US/en/technical-documents/protocol/protein-biology/gel-electrophoresis/tae-and-tbe-running-buffers-recipe' },
  ],
  verified: '2026-09-03',
};
