import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Gibson & In-Fusion Isothermal Assembly Principles',
  formulas: [
    'Cascade = T5 Exonuc(5\'→3\') + Phusion Pol + Taq Ligase (50°C) ; 3-enzyme isothermal reaction',
    'Tm = 64.9 + 41 × (GC - 16.4) / L ; Salt-corrected melting temperature of homology arms',
    'Ta = Tm_anneal + 3°C ; Recommended annealing temperature for Q5 / NEB HiFi',
    'Overhang = 15 to 30 bp ; Optimal homologous overlap length between adjacent fragments',
  ],
  assumptions: [
    'Insert fragments are amplified with high-fidelity polymerase to prevent unwanted mutations.',
    'Overlapping homology arms have Tm ≥ 48°C and are free of stable hairpins at 50°C.',
    'Linearized vector is purified or DpnI treated to eliminate parental plasmid background.',
  ],
  references: [
    { text: 'Gibson DG et al. Enzymatic assembly of DNA molecules up to several hundred kilobases. Nat Methods. 2009;6(5):343-345.', url: 'https://doi.org/10.1038/nmeth.1318' },
    { text: 'NEBuilder HiFi DNA Assembly Guidelines, New England Biolabs', url: 'https://www.neb.com/en-us/products/e2621-nebuilder-hifi-dna-assembly-master-mix' },
  ],
  verified: '2026-09-03',
};
