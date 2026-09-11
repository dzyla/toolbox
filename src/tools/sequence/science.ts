import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Sequence annotation and selected-range analysis',
  formulas: [
    'Protein MW = sum(residue masses) + H₂O; pI is the pH where the Henderson–Hasselbalch net charge is zero',
    'Protein ε₂₈₀ uses Trp, Tyr, and optional cystine contributions; the selected-range panel reports the reduced-cysteine value',
    'GC% = (count(G) + count(C)) / total_valid_bases × 100%',
    'Reverse complement follows IUPAC base-pairing rules; RNA output uses U instead of T',
  ],
  assumptions: [
    'Annotations are user-authored coordinate labels, not automatically inferred biological function or experimental evidence.',
    'The sequence canvas is linear; use the Plasmid Viewer for circular maps, GenBank/SnapGene documents, and plasmid-specific feature analysis.',
    'Protein values assume an unmodified linear polypeptide; calculated values do not establish a modification, fold, or biological activity.',
  ],
  references: [
    { text: 'ExPASy ProtParam documentation', url: 'https://web.expasy.org/protparam/protparam-doc.html' },
    { text: 'IUPAC-IUB ambiguity codes (1985)', url: 'https://doi.org/10.1093/nar/13.9.3021' },
  ],
  verified: '2026-09-03',
};
