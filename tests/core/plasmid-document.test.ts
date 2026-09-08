import { describe, expect, it } from 'vitest';
import { deleteAnnotation, replaceAnnotation } from '@/core/plasmid/document';
import type { PlasmidDocument } from '@/core/plasmid/model';

const document: PlasmidDocument = {
  id: 'doc', name: 'Test', sequence: 'AAACCCGGGTTT', topology: 'circular', annotations: [{
    id: 'a1', name: 'original', type: 'misc_feature', location: { strand: 1, segments: [{ start: 0, end: 3 }] }, qualifiers: {}, source: 'imported',
  }], provenance: { format: 'genbank', parserVersion: 'test', warnings: [] },
};

describe('plasmid document edits', () => {
  it('replaces an annotation without mutating the imported document', () => {
    const next = replaceAnnotation(document, { ...document.annotations[0]!, name: 'renamed' });
    expect(next.annotations[0]?.name).toBe('renamed');
    expect(document.annotations[0]?.name).toBe('original');
  });

  it('deletes an annotation by identity', () => {
    expect(deleteAnnotation(document, 'a1').annotations).toEqual([]);
  });
});
