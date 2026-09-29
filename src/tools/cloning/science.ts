import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Cloning design methods and their sources',
  formulas: [
    'Tm = ΔH / (ΔS + R ln Ct); SantaLucia 1998 nearest neighbours, Owczarzy 2004 monovalent correction (Phusion: Breslauer 1986 with Schildkraut 16.6·log10[Na⁺]); the NEB Tm calculator used by NEBuilder and NEBaseChanger',
    'NEBuilder overlaps: grown until Wallace Tm (4·GC + 2·AT) ≥ 48 °C; primer anneals grown to Tm ≥ 55 °C with a 3′ G/C clamp and a pair difference ≤ 5 °C; Ta from the polymerase rule (Q5: lower Tm + 1 °C)',
    'In-Fusion extensions: 15 nt in the vector (20 nt at vector junctions and 10 + 10 nt between inserts for two or more inserts); bases opposite a 5′ overhang included, 3′ overhang bases excluded',
    'Insert mass (ng) = vector mass (ng) × insert bp ÷ vector bp × molar ratio; dsDNA MW = 36.04 + 615.94 × bp (NEBioCalculator)',
    'Sticky ends ligate when overhang kind, length and letters agree (BamHI/BglII compatible); blunt to blunt; T4 ligase needs a 5′ phosphate at a nick',
    'SDM (Q5 + KLD): non-overlapping back-to-back primers; edits up to 6 nt on the forward primer 5′ tail, longer edits split with the larger half forward',
  ],
  assumptions: [
    'DNA is pure and accurately quantified; concentrations you enter are those of the actual stocks.',
    'Restriction sites are those of the REBASE snapshot in Biopython 1.84 (612 commercially available enzymes); methylation sensitivity is not modelled.',
    'For In-Fusion the gene-specific part uses Takara’s documented rules (18–25 nt, Tm 58–65 °C, ΔTm ≤ 4 °C, ≤ 2 G/C in the last five bases) with our own Tm; Takara’s Tm formula is not public, so lengths can differ from its tool by a base or two. The homology extensions do not differ.',
    'NEBaseChanger’s default design for changes of five bases or fewer (mutation inside the primer, mismatch-aware Tm) is not implemented; the 5′-tail design is.',
    'Sequences are checked for A, C, G and T only; ambiguous bases are rejected.',
    'Software agreement with a vendor tool does not establish that a construct will work; sequence-verify every clone.',
  ],
  references: [
    { text: 'Gibson DG et al. Enzymatic assembly of DNA molecules up to several hundred kilobases. Nat Methods 2009;6:343–345.', url: 'https://doi.org/10.1038/nmeth.1318' },
    { text: 'Engler C, Kandzia R, Marillonnet S. A one pot, one step, precision cloning method with high throughput capability. PLoS ONE 2008;3:e3647.', url: 'https://doi.org/10.1371/journal.pone.0003647' },
    { text: 'SantaLucia J Jr. A unified view of polymer, dumbbell, and oligonucleotide DNA nearest-neighbor thermodynamics. PNAS 1998;95:1460–1465.', url: 'https://doi.org/10.1073/pnas.95.4.1460' },
    { text: 'Owczarzy R et al. Effects of sodium ions on DNA duplex oligomers: improved predictions of melting temperatures. Biochemistry 2004;43:3537–3554.', url: 'https://doi.org/10.1021/bi034621r' },
    { text: 'Breslauer KJ et al. Predicting DNA duplex stability from the base sequence. PNAS 1986;83:3746–3750.', url: 'https://doi.org/10.1073/pnas.83.11.3746' },
    { text: 'Roberts RJ et al. REBASE: a database for DNA restriction and modification. Nucleic Acids Res 2023;51:D629–D630.', url: 'https://doi.org/10.1093/nar/gkac975' },
    { text: 'NEBuilder Assembly Tool and NEBuilder HiFi DNA Assembly protocol (E2621), New England Biolabs.', url: 'https://nebuilder.neb.com/' },
    { text: 'NEBaseChanger and Q5 Site-Directed Mutagenesis Kit protocol (E0554), New England Biolabs.', url: 'https://nebasechanger.neb.com/' },
    { text: 'NEBioCalculator and T4 DNA Ligase protocol (M0202), New England Biolabs.', url: 'https://nebiocalculator.neb.com/' },
    { text: 'In-Fusion Snap Assembly user manual and Primer Design Tool, Takara Bio.', url: 'https://www.takarabio.com/products/cloning/in-fusion-cloning' },
  ],
  verified: '2026-09-28',
};
