import { describe, expect, it } from 'vitest';
import { importPlasmidText } from '@/core/plasmid/import';

describe('plasmid text import', () => {
  it('imports a GenBank complement(join()) feature with qualifiers', () => {
    const result = importPlasmidText(`LOCUS       demo 12 bp DNA circular\nFEATURES             Location/Qualifiers\n     CDS             complement(join(10..12,1..3))\n                     /label="wrapped gene"\n                     /note="kept intact"\nORIGIN\n        1 aaacccgggttt\n//`);

    expect(result.document.topology).toBe('circular');
    expect(result.document.annotations[0]?.location).toEqual({ strand: -1, segments: [{ start: 9, end: 12 }, { start: 0, end: 3 }] });
    expect(result.document.annotations[0]?.qualifiers.label).toEqual(['wrapped gene']);
    expect(result.document.annotations[0]?.qualifiers.note).toEqual(['kept intact']);
  });

  it('rejects a GenBank record without sequence data', () => {
    expect(() => importPlasmidText('LOCUS       bad 12 bp DNA circular\nORIGIN\n//')).toThrow(/sequence/i);
  });
});
