import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Silent Restriction Site Finder',
  formulas: [
    'Silent change: translate(codon) = translate(codon with one base substituted) ; synonymous under the standard genetic code (NCBI table 1)',
    'Site match at start s: every base is in the IUPAC set of the recognition sequence ; checked on the top strand and, for non-palindromic enzymes, against the reverse complement',
    'Destroys a site: matched before the substitution and not after ; creates a site: matched after and not before',
  ],
  assumptions: [
    'Only single-nucleotide substitutions are considered; sites that need two or more changes are not reported.',
    '"Silent" means the encoded protein is unchanged. Stop codons are never mutated and no codon-usage, mRNA-structure, splicing or regulatory effects are evaluated.',
    'Recognition sequences come from REBASE (commercially available enzymes). Sites are matched on the sequence as given, with no DNA methylation sensitivity (Dam, Dcm, CpG) and no star activity.',
    'Type IIS enzymes cut outside their recognition site; only the recognition sequence is analysed, so cut positions and flanking sequence requirements are not checked.',
    'Sites may span codon boundaries and may be partly outside the selected reading frame; only codons inside the frame are mutated, but the whole input is scanned.',
    'Codon rarity uses the rare-codon sets and Kazusa codon-usage fractions in this app for the chosen organism; it is informational only.',
    'The side-effect columns list other chosen-enzyme sites destroyed or created by the same change; enzymes not selected are not checked.',
  ],
  references: [
    { text: 'Roberts RJ, Vincze T, Posfai J, Macelis D. REBASE: a database for DNA restriction and modification. Nucleic Acids Res. 2023;51(D1):D629-D630.', url: 'https://doi.org/10.1093/nar/gkac996' },
    { text: 'Cornish-Bowden A. Nomenclature for incompletely specified bases in nucleic acid sequences (IUPAC-IUB). Nucleic Acids Res. 1985;13(9):3021-3030.', url: 'https://doi.org/10.1093/nar/13.9.3021' },
    { text: 'NCBI Genetic Codes (translation table 1, standard).', url: 'https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi' },
    { text: 'Nakamura Y, Gojobori T, Ikemura T. Codon usage tabulated from international DNA sequence databases. Nucleic Acids Res. 2000;28(1):292.', url: 'https://doi.org/10.1093/nar/28.1.292' },
  ],
  verified: '2026-09-30',
};
