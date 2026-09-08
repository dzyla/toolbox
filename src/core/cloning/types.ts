import type { PlasmidDocument, PlasmidTopology } from '@/core/plasmid/model';

export type ConstructMethod =
  | 'q5-sdm'
  | 'nebuilder'
  | 'gibson'
  | 'infusion'
  | 'restriction-ligation'
  | 'golden-gate';
export type ConstructStatus = 'draft' | 'blocked' | 'sequence-validated' | 'bench-verified';
export type FragmentRole = 'vector' | 'insert' | 'amplicon';

export interface DesignFragment {
  id: string;
  name: string;
  sourceSequence: string;
  orientedSequence: string;
  role: FragmentRole;
  orientation: 'forward' | 'reverse';
}

export interface JunctionEvidence {
  leftFragmentId: string;
  rightFragmentId: string;
  method: ConstructMethod;
  overlap: string;
  expectedOverlapLength: number;
  observedLeftTerminal: string;
  observedRightTerminal: string;
  validated: boolean;
  tmC?: number;
  notes: string[];
}

export interface Finding {
  code: string;
  severity: 'blocker' | 'warning' | 'info';
  message: string;
  fragmentId?: string;
  junctionIndex?: number;
}

export interface ConstructPlan {
  method: ConstructMethod;
  status: ConstructStatus;
  topology: PlasmidTopology;
  fragments: DesignFragment[];
  junctions: JunctionEvidence[];
  product?: PlasmidDocument;
  findings: Finding[];
  provenance: Record<string, string | number | boolean>;
}
