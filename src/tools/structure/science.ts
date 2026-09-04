import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Protein 3D Structure Superposition & Kabsch RMSD',
  formulas: [
    'Centroids: c_P = (1/N) Σ p_i,  c_Q = (1/N) Σ q_i',
    'Centered vectors: x_i = p_i − c_P,  y_i = q_i − c_Q',
    'Cross-covariance matrix: H = Σ x_i y_i^T = X^T Y',
    'Singular Value Decomposition: H = U Σ V^T',
    'Reflection check: d = sign(det(V U^T)),  D = diag(1, 1, d)',
    'Optimal rotation matrix: R = V D U^T (ensures det(R) = +1 in SO(3))',
    'Optimal translation vector: t = c_Q − R c_P',
    'Root-Mean-Square Deviation: RMSD = sqrt((1/N) Σ ||R p_i + t − q_i||²)',
    'Radius of Gyration: Rg = sqrt((1/N) Σ ||r_i − r_cm||²)',
  ],
  assumptions: [
    'Cα atoms are used for backbone superposition to avoid side-chain rotamer noise.',
    'Structures with identical length or corresponding sequence indices are aligned residue-by-residue.',
    'Kabsch algorithm mathematically minimizes the coordinate RMSD between paired 3D points.',
    'Right-handed rotation enforcement (det(R) = +1) prevents mirror-image reflection artifacts.',
  ],
  references: [
    {
      text: 'Kabsch (1976), A solution for the best rotation to relate two sets of vectors',
      url: 'https://doi.org/10.1107/S0567739476001873',
    },
    {
      text: 'Kabsch (1978), A discussion of the solution for the best rotation to relate two sets of vectors',
      url: 'https://doi.org/10.1107/S0567739478001715',
    },
    {
      text: 'Sehnal et al. (2021), Mol* Viewer: modern web app for 3D macromolecular data',
      url: 'https://doi.org/10.1093/nar/gkab314',
    },
  ],
  verified: '2026-09-04',
};
