import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Macromolecular 3D Structure Representation & Geometry',
  formulas: [
    'Center of Mass: r_cm = (1/N) Σ r_i',
    'Radius of Gyration: Rg = sqrt((1/N) Σ ||r_i − r_cm||²)',
    'Root-Mean-Square Deviation: RMSD = sqrt((1/N) Σ ||p_i − q_i||²)',
    'Secondary Structure H-bond geometry: N−H···O=C distance ~2.9 Å, angle ~160°',
  ],
  assumptions: [
    'Coordinates are parsed from standard PDB/mmCIF ATOM and HETATM records.',
    'Radius of gyration (Rg) reflects overall molecular compactness and globular shape.',
    'Mol* uses hardware-accelerated WebGL with ambient occlusion for publication-quality rendering.',
    'Secondary structure ribbons follow standard DSSP peptide backbone curvature.',
  ],
  references: [
    {
      text: 'Sehnal et al. (2021), Mol* Viewer: modern web app for 3D macromolecular data',
      url: 'https://doi.org/10.1093/nar/gkab314',
    },
    {
      text: 'Berman et al. (2000), The Protein Data Bank',
      url: 'https://doi.org/10.1093/nar/28.1.235',
    },
    {
      text: 'Lobanov et al. (2008), Radius of gyration is an indicator of protein compactness',
      url: 'https://doi.org/10.1093/molbev/msm269',
    },
  ],
  verified: '2026-09-05',
};
