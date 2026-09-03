import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Site-Directed Mutagenesis (Q5 / NEBaseChanger Non-Overlapping Primers)',
  formulas: [
    'Fwd(5\'-mut-anneal-3\') ⇄ Rev(5\'-anneal-3\') ; Back-to-back non-overlapping primers',
    'Ta = min(Tm_fwd, Tm_rev) + 3°C ; Q5 High-Fidelity optimal annealing temperature',
    'KLD = T4 PNK (5\'-P) + T4 Ligase (circularize) + DpnI (digest dam+ parental template)',
    'Yield > 95% ; Recombinant circular plasmid ready for transformation',
  ],
  assumptions: [
    'Parental template plasmid was propagated in a dam+ E. coli strain (DH5α, TOP10, etc.) for DpnI cleavage.',
    'PCR template is limited to 1–10 ng plasmid DNA to minimize background transformants.',
    'High-fidelity polymerase with low error rate (e.g. Q5) is used for exponential whole-plasmid amplification.',
  ],
  references: [
    { text: 'NEB Q5 Site-Directed Mutagenesis Kit Manual (NEB #E0554)', url: 'https://www.neb.com/en-us/products/e0554-q5-site-directed-mutagenesis-kit' },
    { text: 'Zheng L, Baumann U, Reymond JL. An efficient one-step site-directed mutagenesis protocol. Nucleic Acids Res. 2004;32(14):e115.', url: 'https://doi.org/10.1093/nar/gnh110' },
  ],
  verified: '2026-09-03',
};
