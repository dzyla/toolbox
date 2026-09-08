import type { PlasmidDocument } from '@/core/plasmid/model';
import { normalizeSelection, type Selection } from './selection';

export type { Selection, SelectionSource } from './selection';
export { clearSelection, selectRange } from './selection';

export interface WorkspaceHistory {
  past: PlasmidDocument[];
  future: PlasmidDocument[];
}

export interface WorkspaceState {
  document: PlasmidDocument;
  selection?: Selection;
  history: WorkspaceHistory;
}

export function initialWorkspace(document: PlasmidDocument): WorkspaceState {
  return { document, history: { past: [], future: [] } };
}

function selectionForDocument(document: PlasmidDocument, selection?: Selection): Selection | undefined {
  if (!selection) return undefined;
  const normalized = normalizeSelection(document, selection);
  return normalized.start === normalized.end ? undefined : normalized;
}

export function applyDocumentEdit(state: WorkspaceState, document: PlasmidDocument): WorkspaceState {
  return {
    ...state,
    document,
    selection: selectionForDocument(document, state.selection),
    history: {
      past: [...state.history.past.slice(-49), state.document],
      future: [],
    },
  };
}

export function undoWorkspace(state: WorkspaceState): WorkspaceState {
  const previous = state.history.past[state.history.past.length - 1];
  if (!previous) return state;

  return {
    ...state,
    document: previous,
    selection: selectionForDocument(previous, state.selection),
    history: {
      past: state.history.past.slice(0, -1),
      future: [...state.history.future, state.document],
    },
  };
}

export function redoWorkspace(state: WorkspaceState): WorkspaceState {
  const next = state.history.future[state.history.future.length - 1];
  if (!next) return state;

  return {
    ...state,
    document: next,
    selection: selectionForDocument(next, state.selection),
    history: {
      past: [...state.history.past, state.document],
      future: state.history.future.slice(0, -1),
    },
  };
}

export { normalizeSelection };
