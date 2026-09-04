import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Molecular Cloning Principles & Method Selection',
  formulas: [
    'Insert Mass (ng) = Vector Mass (ng) × (Insert bp / Vector bp) × Molar Ratio ; Restriction-ligation stoichiometry',
    'Gibson Overlap: 20–30 bp, Tm ≥ 50°C ; T5 exonuclease 5\'→3\' chewback + Phusion + Taq ligase (50°C isothermal)',
    'SDM: Non-overlapping back-to-back primers ; Q5 exponential whole-plasmid PCR + KLD circularization',
    'Golden Gate: Type IIS restriction (e.g. BsaI 4 bp overhang) + T4 DNA ligase ; One-pot digestion-ligation cycle',
  ],
  assumptions: [
    'Vector and insert DNA are pure (A260/A280 ~ 1.8) and accurately quantified.',
    'For restriction-ligation, vector dephosphorylation (rSAP/CIP) minimizes non-recombinant background.',
    'Overhanging cohesive ends are checked for sequence compatibility and non-palindromic pairing.',
    'Type IIS Golden Gate fragments lack internal recognition sites for the chosen enzyme.',
  ],
  references: [
    { text: 'Gibson DG et al. Enzymatic assembly of DNA molecules up to several hundred kilobases. Nat Methods. 2009;6(5):343-345.', url: 'https://doi.org/10.1038/nmeth.1318' },
    { text: 'Engler C et al. Golden Gate Shuffling: A one-pot DNA shuffling approach. PLoS ONE. 2009;4(9):e6945.', url: 'https://doi.org/10.1371/journal.pone.0006945' },
    { text: 'NEB Ligation and Mutagenesis Protocols, New England Biolabs', url: 'https://www.neb.com/en-us/tools-and-resources/usage-guidelines' },
  ],
  verified: '2026-09-03',
};
