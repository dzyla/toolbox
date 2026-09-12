import { describe, expect, it } from 'vitest';
import {
  normaliseSelection,
  foldQuickRna,
  sequenceTypeHint,
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

describe('explicit sequence-type guidance and quick RNA structure', () => {
  it('offers advisory type hints without selecting a type for the caller', () => {
    expect(sequenceTypeHint('ATCGATCG')).toMatchObject({ kind: 'DNA', confidence: 'possible', label: 'Possibly DNA' });
    expect(sequenceTypeHint('ACGUACGU')).toMatchObject({ kind: 'RNA', confidence: 'possible', label: 'Possibly RNA' });
    expect(sequenceTypeHint('MKWVTFIS')).toMatchObject({ kind: 'protein', confidence: 'likely', label: 'Likely protein' });
    expect(sequenceTypeHint('ACGTU')).toMatchObject({ kind: null, confidence: 'uncertain' });
  });

  it('returns nested non-pseudoknotted RNA base pairs as dot-bracket notation', () => {
    expect(foldQuickRna('GGGAAACCC')).toEqual({
      dotBracket: '(((...)))',
      pairs: [[1, 9], [2, 8], [3, 7]],
      pairCount: 3,
    });
  });

  it('rejects selections over the quick RNA folding limit', () => {
    expect(() => foldQuickRna('A'.repeat(401))).toThrow('up to 400 nt');
  });
});
