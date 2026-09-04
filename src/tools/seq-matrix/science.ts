import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Multiple Sequence Alignment & Identity/Similarity Matrix (PIM)',
  formulas: [
    'PID_{align} = (Identities / Alignment_Length) × 100% ; Standard EMBOSS needle / Clustal metric',
    'PID_{shorter} = (Identities / min(L_1, L_2)) × 100% ; Unpenalized terminal truncation metric',
    'Positives (%) = (Similarities / Alignment_Length) × 100% ; BLOSUM62 positive score pairs',
    'Distance D_{ij} = 1 - (PID / 100) ; Pairwise dissimilarity for UPGMA guide tree clustering',
    'D(C_{new}, C_k) = (|C_a| D(C_a, C_k) + |C_b| D(C_b, C_k)) / (|C_a| + |C_b|) ; UPGMA agglomeration',
  ],
  assumptions: [
    'Pairwise alignments are computed using Needleman-Wunsch global dynamic programming with affine gap penalties (Gotoh 1982).',
    'Protein similarity uses the standard NCBI BLOSUM62 log-odds matrix derived from conserved ungapped sequence blocks (Henikoff & Henikoff 1992).',
    'Progressive multiple sequence alignment follows the Feng-Doolittle / Clustal algorithm: pairwise distance matrix -> UPGMA guide tree -> progressive profile-profile alignment.',
    'Consensus conservation follows Clustal W conventions: asterisk (*) for 100% identical columns, colon (:) for conservative substitutions with positive score across all residues, period (.) for weakly conservative substitutions.',
  ],
  references: [
    { text: 'Needleman SB, Wunsch CD. A general method applicable to the search for similarities in the amino acid sequence of two proteins. J Mol Biol. 1970;48(3):443-453.', url: 'https://doi.org/10.1016/0022-2836(70)90057-4' },
    { text: 'Gotoh O. An improved algorithm for matching biological sequences with affine gap penalties. J Mol Biol. 1982;162(3):705-708.', url: 'https://doi.org/10.1016/0022-2836(82)90398-9' },
    { text: 'Henikoff S, Henikoff JG. Amino acid substitution matrices from protein blocks. Proc Natl Acad Sci USA. 1992;89(22):10915-10919.', url: 'https://doi.org/10.1073/pnas.89.22.10915' },
    { text: 'Thompson JD, Higgins DG, Gibson TJ. CLUSTAL W: improving the sensitivity of progressive multiple sequence alignment. Nucleic Acids Res. 1994;22(22):4673-4680.', url: 'https://doi.org/10.1093/nar/22.22.4673' },
  ],
  verified: '2026-09-03',
};
