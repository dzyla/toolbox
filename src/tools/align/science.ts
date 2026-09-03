import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Pairwise alignment (Gotoh affine gaps)',
  formulas: [
    'M[i,j] = s(a_i, b_j) + max(M, X, Y)[i−1, j−1]',
    'X[i,j] = max(M[i−1,j] − open, X[i−1,j] − extend, Y[i−1,j] − open)   (gap in sequence 2)',
    'Y[i,j] = max(M[i,j−1] − open, Y[i,j−1] − extend, X[i,j−1] − open)   (gap in sequence 1)',
    'gap of length k costs open + (k − 1) × extend',
    'global: score = max(M, X, Y)[n, m]; local: max over all M[i,j] with M clipped at 0; semi-global: max over the last row and column with zero-cost borders',
    'identity % = identical columns / all alignment columns (gap columns included); similarity % adds columns with a positive substitution score',
  ],
  assumptions: [
    'Identity, similarity and gap percentages use every alignment column as the denominator (EMBOSS needle/water convention). Tools that divide by the shorter sequence or by aligned pairs only will report higher identities for the same alignment.',
    'Gap penalties follow the EMBOSS convention (the first gap column costs "open", each further column "extend"); BLAST quotes the same model as open + k × extend, so BLAST\'s 11/1 corresponds to 12/1 here.',
    'Scores are in the units of the chosen matrix (1/2-bit for BLOSUM62, 1/3-bit for BLOSUM45 and BLOSUM80, ln2/2 for PAM30 and PAM70, ln2/3 for PAM250) and are not comparable across matrices. Gap penalties are in the same units.',
    'Letters absent from a matrix are scored as X (protein) or N (DNA); RNA U is scored as T. Ambiguity codes B, Z (protein) and IUPAC nucleotides use the published matrix rows.',
    'Sequence type is guessed as DNA when at least 90 % of letters are A, C, G, T, U or N; override it if a protein happens to be rich in those letters.',
    'Ties in the dynamic programme are resolved in favour of a substitution, then a gap in sequence 2, then a gap in sequence 1; other optimal alignments with the same score may exist.',
    'Semi-global mode leaves both leading and trailing gaps free in both sequences; they are drawn but do not count towards the score.',
  ],
  references: [
    { text: 'Gotoh O (1982) An improved algorithm for matching biological sequences. J Mol Biol 162:705–708', url: 'https://doi.org/10.1016/0022-2836(82)90398-9' },
    { text: 'Needleman SB, Wunsch CD (1970) J Mol Biol 48:443–453 (global alignment)', url: 'https://doi.org/10.1016/0022-2836(70)90057-4' },
    { text: 'Smith TF, Waterman MS (1981) J Mol Biol 147:195–197 (local alignment)', url: 'https://doi.org/10.1016/0022-2836(81)90087-5' },
    { text: 'Henikoff S, Henikoff JG (1992) Amino acid substitution matrices from protein blocks. PNAS 89:10915–10919 (BLOSUM)', url: 'https://doi.org/10.1073/pnas.89.22.10915' },
    { text: 'Dayhoff MO, Schwartz RM, Orcutt BC (1978) A model of evolutionary change in proteins. Atlas of Protein Sequence and Structure 5(3):345–352 (PAM)' },
    { text: 'NCBI BLAST matrix files (BLOSUM45/62/80, PAM30/70/250, NUC.4.4 = EDNAFULL), transcribed 2026-09-02', url: 'https://ftp.ncbi.nih.gov/blast/matrices/' },
    { text: 'EMBOSS needle documentation (identity convention, gap penalties)', url: 'https://emboss.sourceforge.net/apps/release/6.6/emboss/apps/needle.html' },
  ],
  verified: '2026-09-03',
};
