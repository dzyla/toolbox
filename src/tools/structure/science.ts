import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Macromolecular 3D Structure Representation & Geometry',
  formulas: [
    'Center of geometry: r_c = (1/N) Σ r_i over heavy atoms',
    'Radius of gyration: Rg = sqrt((1/N) Σ ||r_i − r_c||²) over heavy atoms',
    'Interface: two residues from different chains are in contact when any pair of their heavy atoms lies within the cutoff (default 4.5 Å).',
  ],
  assumptions: [
    'Coordinates and sequences are read from PDBx/mmCIF (preferred) or PDB ATOM and HETATM records; hydrogens are excluded from metrics.',
    'The full sequence comes from the entity sequence in the file (mmCIF), the modelled sequence from residues that have coordinates; unmodelled positions are reported as such.',
    'Modified residues are mapped to their parent standard residue when the file declares one.',
    'Only the first alternate location of an atom is used.',
    'The first model is used by default; other models of an ensemble can be selected.',
    'Radius of gyration reflects overall compactness; it is computed on the selected model only.',
    'Rendering (cartoon, surfaces, colouring) is done by Mol*; this tool does not compute secondary structure, hydrogen bonds or RMSD.',
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
      text: 'wwPDB PDBx/mmCIF dictionary',
      url: 'https://mmcif.wwpdb.org/',
    },
  ],
  verified: '2026-10-25',
};
