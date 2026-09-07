import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Detergent & Membrane Protein Thermodynamics',
  formulas: [
    'C_micellar = max(0, C_total - CMC) ; Micellar detergent concentration above CMC',
    'C_free = min(C_total, CMC) ; Free monomer concentration driving dialysis flux',
    '[Micelle] = C_micellar / N_agg ; Molar concentration of discrete detergent micelles',
    '% (w/v) = (C_mM × MW) / 10,000 ; Weight/volume percent from molarity and monomer MW',
    'MW_PDC = (N_subunits × MW_protein) + MW_micelle ; Protein-detergent complex (PDC) apparent mass',
    'R_h ≈ 0.066 × (MW_complex, Da)^(1/3) nm ; Empirical Stokes hydrodynamic radius for SEC sizing',
    'Ratio_micelle:prot = [Micelle] / [Protein] ; Target ≥ 1.0–2.0 to ensure monodisperse single particles',
  ],
  assumptions: [
    'Phase separation / pseudophase model applies: monomeric detergent concentration plateaus at the CMC, with excess detergent partitioned exclusively into micelles.',
    'Measurements assume standard aqueous buffers (pH 7.0–8.0, 100–150 mM NaCl, 20–25°C). Ionic strength and multivalent salts may moderately shift non-ionic CMC.',
    'A single detergent micellar belt encapsulates the hydrophobic transmembrane domain of the target protein, approximating the published micelle mass (Seddon et al. 2004).',
    'Dialysis membrane pore cutoffs (MWCO 3.5–14 kDa) selectively permit monomer diffusion while retaining micelles (25–88 kDa) and protein complexes.',
  ],
  references: [
    {
      text: 'Seddon AM, Curnow P, Booth PJ. Membrane proteins, lipids and detergents: not just a soap opera. Biochim Biophys Acta 1666:105-117 (2004).',
      url: 'https://doi.org/10.1016/j.bbamem.2004.04.011',
    },
    {
      text: 'le Maire M, Champeil P, Møller JV. Interaction of membrane proteins and lipids with solubilizing detergents. Biochim Biophys Acta 1508:86-111 (2000).',
      url: 'https://doi.org/10.1016/S0304-4157(00)00010-1',
    },
    {
      text: 'Anatrace Detergent Handbook: A guide to the properties and use of detergents in biology and biochemistry (2020).',
      url: 'https://www.anatrace.com',
    },
  ],
  verified: '2026-09-05',
};
