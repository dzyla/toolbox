import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Sequence analysis, translation, ORF detection, and restriction mapping',
  formulas: [
    'Six-frame translation: frames +1, +2, +3 on the forward strand; frames −1, −2, −3 on the reverse complement; standard and alternative NCBI genetic codes (Tables 1, 2, 4, 11)',
    'ORF detection: scans all six frames from initiation codons (ATG, or alternative start codons defined by the genetic code) to the next in-frame termination codon (*)',
    'GC content: GC% = (count(G) + count(C)) / total_valid_bases × 100%',
    'Restriction sites: exact and degenerate IUPAC motif matching on both strands; fragment lengths computed for linear or circular topologies',
  ],
  assumptions: [
    'Sequences are assumed linear unless marked circular. Circular sequences wrap restriction search motifs across the origin (terminal boundary).',
    'Translations use the standard genetic code (NCBI translation table 1) by default. Alternative start codons (e.g. GTG, TTG in bacteria) are translated as Methionine (M) when serving as initiators, following NCBI and UniProt conventions.',
    'Restriction enzyme data is sourced from REBASE and standard commercial catalogs (NEB, Thermo Fisher).',
  ],
  references: [
    { text: 'NCBI Genetic Codes (Taxonomy): The Genetic Codes', url: 'https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi' },
    { text: 'Roberts RJ et al. (2015) REBASE—a database for DNA restriction and modification: enzymes, genes and genomes. Nucleic Acids Res 43:D298–D299', url: 'https://doi.org/10.1093/nar/gku1046' },
  ],
  verified: '2026-09-03',
};
