import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Macromolecular 3D Structure Representation & Geometry',
  formulas: [
    'Centre of geometry: r_c = (1/N) Σ r_i; unweighted mean over the N non-water heavy atoms of the model, ligands included',
    'Radius of gyration: Rg = sqrt((1/N) Σ ||r_i − r_c||²); same N atoms, unweighted (no masses)',
    'Interface: residues i, j of different polymer chains are in contact when any heavy atom of i lies within the cutoff of any heavy atom of j (default 4.5 Å); polymer–polymer only, ligands, glycans and water are excluded',
  ],
  assumptions: [
    'Coordinates and sequences are read from PDBx/mmCIF (preferred) or PDB ATOM and HETATM records. Rg, the centre and the bounding box use non-water heavy atoms; "Atoms (incl. H)" counts every atom of the model, hydrogens and water included, and "Heavy atoms" every non-hydrogen atom.',
    'The full sequence comes from the deposited sequence (mmCIF entity sequence, PDB SEQRES) and the modelled sequence from residues that have coordinates; unmodelled positions are shown as such.',
    'When the file has no deposited sequence, only modelled residues are shown and gaps cannot be detected; a warning lists each jump in residue numbering.',
    'Modified residues are mapped to their parent from the file (_pdbx_struct_mod_residue, _chem_comp or MODRES) or, failing that, a built-in table of common modifications; otherwise they are shown as X with a warning.',
    'Alternate locations: per residue only the first non-blank alt id is kept; atoms with a blank alt id are always kept.',
    'Mol*, the metrics and the interfaces use the deposited coordinates (the asymmetric unit), not the biological assembly: contacts with symmetry mates are not included, and some contacts within the asymmetric unit may be crystal packing.',
    'The first model is used by default; other models of an ensemble can be selected, and the metrics and interfaces follow the selected model.',
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
  verified: '2026-10-26',
};
