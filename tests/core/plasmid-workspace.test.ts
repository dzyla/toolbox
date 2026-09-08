import { describe, expect, it } from 'vitest';
import {
  applyDocumentEdit,
  initialWorkspace,
  redoWorkspace,
  undoWorkspace,
} from '@/tools/plasmid/workspace';
import { clearSelection, selectRange } from '@/tools/plasmid/selection';
import type { PlasmidDocument } from '@/core/plasmid/model';

const document: PlasmidDocument = {
  id: 'doc',
  name: 'Test',
  sequence: 'AAACCCGGGTTTAAACCCGGGTTT',
  topology: 'circular',
  annotations: [],
  provenance: { format: 'genbank', parserVersion: 'test', warnings: [] },
};

const nextDocument: PlasmidDocument = {
  ...document,
  name: 'Edited',
};

describe('plasmid workspace state', () => {
  it('keeps drag selection ephemeral', () => {
    const initial = initialWorkspace(document);
    const selected = selectRange(initial, { start: 5, end: 14, source: 'sequence' });

    expect(selected.document).toBe(document);
    expect(selected.history.past).toHaveLength(0);
    expect(selected.history.future).toHaveLength(0);
    expect(selected.selection).toMatchObject({ start: 5, end: 14 });
  });

  it('preserves selection through document undo', () => {
    const edited = applyDocumentEdit(initialWorkspace(document), nextDocument);
    const selected = selectRange(edited, { start: 2, end: 7, source: 'map' });
    const undone = undoWorkspace(selected);

    expect(undone.document).toBe(document);
    expect(undone.selection).toMatchObject({ start: 2, end: 7 });
  });

  it('reapplies a document edit without changing the local selection', () => {
    const edited = applyDocumentEdit(initialWorkspace(document), nextDocument);
    const selected = selectRange(edited, { start: 2, end: 7, source: 'table', annotationId: 'a1' });
    const redone = redoWorkspace(undoWorkspace(selected));

    expect(redone.document).toBe(nextDocument);
    expect(redone.selection).toMatchObject({ start: 2, end: 7, source: 'table', annotationId: 'a1' });
  });

  it('clears only the local selection', () => {
    const selected = selectRange(initialWorkspace(document), { start: 2, end: 7, source: 'analysis' });
    const cleared = clearSelection(selected);

    expect(cleared.document).toBe(document);
    expect(cleared.history).toEqual({ past: [], future: [] });
    expect(cleared.selection).toBeUndefined();
  });

  it('clamps linear selection endpoints and orders a backwards drag', () => {
    const linearDocument = { ...document, topology: 'linear' as const };
    const selected = selectRange(initialWorkspace(linearDocument), { start: 40, end: -2, source: 'sequence' });

    expect(selected.selection).toMatchObject({ start: 0, end: linearDocument.sequence.length });
  });

  it('preserves a circular origin-spanning selection after endpoint normalization', () => {
    const selected = selectRange(initialWorkspace(document), { start: 40, end: -2, source: 'map' });

    expect(selected.selection).toMatchObject({ start: document.sequence.length, end: 0 });
  });
});
