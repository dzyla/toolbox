import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Rare Codons & Recombinant Protein Expression Biology',
  formulas: [
    'CAI = exp( (1/L) × Σ ln(w_k) ) ; Codon Adaptation Index (Sharp & Li 1987)',
    'w_k = freq_k / max(freq_synonymous) ; Relative adaptiveness of codon k',
    'Pause Hotspots = ≥ 2 rare codons in 8-codon window ; Risk of ribosome stall and drop-off',
    'Rare Codons = Arg(AGG, AGA, CGA, CGG), Ile(ATA), Leu(CTA), Pro(CCC) in E. coli',
  ],
  assumptions: [
    'Codon usage tables are based on highly expressed genes in E. coli B/K-12 strains.',
    'mRNA secondary structure at the 5\' initiation region (RBS) also influences expression independently of CAI.',
    'Rosetta 2 strains harboring the pRARE2 plasmid complement rare tRNAs for AGG, AGA, AUA, CUA, CCC, and GGA.',
  ],
  references: [
    { text: 'Sharp PM, Li WH. Codon adaptation index - measure of directional synonymous codon usage bias. Nucleic Acids Res. 1987;15(3):1281-1295.', url: 'https://doi.org/10.1093/nar/15.3.1281' },
    { text: 'Kane JF. Effects of rare codon clusters on high-level expression in E. coli. Curr Opin Biotechnol. 1995;6(5):494-500.', url: 'https://doi.org/10.1016/0958-1669(95)80082-4' },
    { text: 'Novagen: Rosetta 2 Competent Cells User Protocol', url: 'https://www.merckmillipore.com' },
  ],
  verified: '2026-09-03',
};
