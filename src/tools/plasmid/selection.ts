import type { PlasmidDocument } from '@/core/plasmid/model';
import type { WorkspaceState } from './workspace';

export type SelectionSource = 'map' | 'sequence' | 'table' | 'analysis';

export interface Selection {
  /** Zero-based, half-open coordinates in the document sequence. */
  start: number;
  end: number;
  source: SelectionSource;
  annotationId?: string;
}

function normalizeEndpoint(value: number, sequenceLength: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(sequenceLength, Math.max(0, Math.trunc(value)));
}

/**
 * Keep selection coordinates inside the document while retaining circular
 * origin-crossing order. Linear selections are always returned in ascending
 * order so a backwards drag has the same interval as a forwards drag.
 */
export function normalizeSelection(document: PlasmidDocument, selection: Selection): Selection {
  const sequenceLength = document.sequence.length;
  const start = normalizeEndpoint(selection.start, sequenceLength);
  const end = normalizeEndpoint(selection.end, sequenceLength);

  if (document.topology === 'linear' && start > end) {
    return { ...selection, start: end, end: start };
  }

  return { ...selection, start, end };
}

export function selectRange(state: WorkspaceState, selection: Selection): WorkspaceState {
  return { ...state, selection: normalizeSelection(state.document, selection) };
}

export function clearSelection(state: WorkspaceState): WorkspaceState {
  const { selection: _selection, ...withoutSelection } = state;
  return withoutSelection;
}
