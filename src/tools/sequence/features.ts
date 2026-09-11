import {
  mergeFeatures,
  scanFeatures,
  signalPeptideCandidates,
  transmembraneCandidates,
  type ProteinFeature,
} from '@/core/protein/features';
import type { SequenceKind } from '@/core/sequence-annotator';

/**
 * Local, deterministic Protein Workbench feature calls for the sequence editor.
 * Topology results are candidates and must be presented as such in the UI.
 */
export function detectSequenceFeatures(sequence: string, kind: SequenceKind): ProteinFeature[] {
  if (kind !== 'protein') return [];
  return mergeFeatures([
    ...scanFeatures(sequence),
    ...transmembraneCandidates(sequence),
    ...signalPeptideCandidates(sequence),
  ]);
}
