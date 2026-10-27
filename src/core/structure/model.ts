/**
 * Structure viewer data model: format-independent description of a macromolecular
 * structure as read from mmCIF or PDB. Atoms are stored columnar (one table per model).
 */

export type StructureFormat = 'mmcif' | 'pdb';
export type PolymerType = 'protein' | 'dna' | 'rna' | 'other';

export interface ResidueRef { authAsymId: string; authSeqId: number; insCode: string } // insCode '' when none

export interface SeqResidue {
  seqId: number;            // 1-based position in the entity sequence (label_seq_id; PDB: SEQRES index)
  compId: string;           // e.g. 'MSE'
  oneLetter: string;        // parent letter for modified residues, 'X' if unknown
  parentCompId?: string;    // set when compId is a modified residue
  modelled: boolean;
  auth?: { seqId: number; insCode: string };  // present when modelled (or known from scheme)
}

export interface PolymerChain { labelAsymId: string; authAsymId: string; entityId: string; residues: SeqResidue[] }

export interface Entity {
  id: string; kind: 'polymer' | 'non-polymer' | 'branched' | 'water';
  polymerType?: PolymerType; description: string;
  sequence: string;          // full canonical one-letter sequence (polymers), '' otherwise
  labelAsymIds: string[];
}

export interface Ligand {
  compId: string; name: string; entityId: string; labelAsymId: string;
  authAsymId: string; authSeqId: number; atomCount: number;
}

/** One per model, columnar; index i is one atom. */
export interface AtomTable {
  modelNumber: number; count: number;
  xyz: Float32Array;                 // 3 * count
  bFactor: Float32Array; occupancy: Float32Array;
  isHetatm: Uint8Array; isHydrogen: Uint8Array;
  atomName: string[]; element: string[]; compId: string[];
  labelAsymId: string[]; labelSeqId: Int32Array;   // 0 for non-polymer
  authAsymId: string[]; authSeqId: Int32Array; insCode: string[];
  entityId: string[];
}

export interface StructureHeader {
  id?: string; title?: string; method?: string; resolution?: number;
  organisms: string[]; depositionDate?: string;
  /** The file carries ModelCIF (`_ma_*`) categories: a computed model, not an experimental one. */
  modelCif?: boolean;
}

export interface StructureModel {
  name: string; format: StructureFormat; header: StructureHeader;
  entities: Entity[]; chains: PolymerChain[]; ligands: Ligand[];
  models: AtomTable[];               // models[0] is the first model in the file
  warnings: string[];                // user-facing notes, e.g. "Unknown residue XYZ shown as X"
}
