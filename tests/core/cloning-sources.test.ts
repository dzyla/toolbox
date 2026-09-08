import { describe, expect, it } from 'vitest';
import { linearizeSource, sourceFromText } from '@/core/cloning/sources';

describe('cloning sources', () => {
  it('preserves imported GenBank topology and annotations as a cloning source', () => {
    const source = sourceFromText('vector', [
      'LOCUS       TestVector       8 bp    DNA     circular',
      'FEATURES             Location/Qualifiers',
      '     CDS             1..6',
      '                     /label="marker"',
      'ORIGIN',
      '        1 atgcatgc',
      '//',
    ].join('\n'));

    expect(source).toMatchObject({ id: 'vector', kind: 'plasmid', document: { topology: 'circular', sequence: 'ATGCATGC' } });
    expect(source.document.annotations[0]).toMatchObject({ name: 'marker', type: 'CDS' });
  });

  it('linearizes a circular plasmid across its origin without altering the source', () => {
    const source = sourceFromText('vector', '>Vector\nATGCATGC');
    const result = linearizeSource({ ...source, document: { ...source.document, topology: 'circular' } }, { kind: 'coordinates', start: 6, end: 2 });

    expect(result.sequence).toBe('GCAT');
    expect(result.findings).toEqual([]);
    expect(source.document.sequence).toBe('ATGCATGC');
  });

  it('blocks a wrapped boundary on a linear source', () => {
    const source = sourceFromText('fragment', '>Fragment\nATGCATGC', 'linear');
    const result = linearizeSource(source, { kind: 'coordinates', start: 6, end: 2 });

    expect(result.sequence).toBe('');
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'WRAPPED_LINEARIZATION_ON_LINEAR_SOURCE', severity: 'blocker' }));
  });
});
