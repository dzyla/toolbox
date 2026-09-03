import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Plasmid mapping, restriction analysis, and ORF prediction',
  formulas: [
    'θ(bp) = (position / length) × 360°',
    'GC(%) = (count(G) + count(C)) / total_bases × 100',
    'ORF length (aa) = (stop_position - start_position) / 3',
  ],
  assumptions: [
    'Coordinates are 1-indexed, starting from base 1 to the full plasmid length N.',
    'Circular topology wraps seamlessly across the origin (0/N bp boundary) for restriction cleavage and ORFs.',
    'Standard genetic code (NCBI translation table 1) is used for translation with ATG initiation.',
  ],
  references: [
    { text: 'SnapGene Molecular Biology Reference: Designing and Annotating Plasmids', url: 'https://www.snapgene.com/resources/plasmid-files' },
    { text: 'NEB Restriction Enzyme Database (REBASE)', url: 'http://rebase.neb.com/rebase/rebase.html' },
  ],
  verified: '2026-09-03',
};
