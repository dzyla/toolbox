import { describe, expect, it } from 'vitest';
import {
  normaliseSelection,
  transformAnnotationsForEdit,
  validateAnnotations,
  type SequenceAnnotation,
} from '@/core/sequence-annotator';
import { detectSequenceFeatures } from '@/tools/sequence/features';

const annotation = (overrides: Partial<SequenceAnnotation> = {}): SequenceAnnotation => ({
  id: 'domain-1',
  name: 'Catalytic domain',
  type: 'domain',
  start: 6,
  end: 10,
  color: '#2563eb',
  note: '',
  evidence: 'user',
  ...overrides,
});

describe('sequence annotation document', () => {
  it('normalises reverse drag coordinates into a valid inclusive selection', () => {
    expect(normaliseSelection(9, 3, 12)).toEqual({ start: 3, end: 9 });
  });

  it('drops annotations outside the sequence and clamps their valid boundary', () => {
    expect(validateAnnotations([annotation({ start: 8, end: 14 }), annotation({ id: 'gone', start: 15, end: 16 })], 10))
      .toEqual([annotation({ start: 8, end: 10 })]);
  });

  it('shifts a downstream annotation after an insertion', () => {
    expect(transformAnnotationsForEdit([annotation()], 3, 0, 2, 20)).toMatchObject([{ start: 8, end: 12 }]);
  });

  it('contracts an annotation that intersects deleted residues', () => {
    expect(transformAnnotationsForEdit([annotation()], 8, 2, 0, 18)).toMatchObject([{ start: 6, end: 8 }]);
  });

  it('removes an annotation that is fully deleted', () => {
    expect(transformAnnotationsForEdit([annotation()], 6, 5, 0, 15)).toEqual([]);
  });
});

describe('Sequence Annotator protein feature adapter', () => {
  it('reuses Protein Workbench tag detection but does not scan nucleic acid', () => {
    expect(detectSequenceFeatures('AAHHHHHHGG', 'protein')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'His-Tag (6x)', start: 3, end: 8, kind: 'tag' }),
    ]));
    expect(detectSequenceFeatures('ACGTACGT', 'DNA')).toEqual([]);
  });
});
