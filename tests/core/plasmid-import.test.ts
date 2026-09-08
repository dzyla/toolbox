import { describe, expect, it } from 'vitest';
import { importPlasmidFile, importPlasmidText } from '@/core/plasmid/import';

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

  it('preserves wrapped GenBank qualifiers and annotation colour metadata', () => {
    const result = importPlasmidText(`LOCUS       demo 12 bp DNA circular
FEATURES             Location/Qualifiers
     misc_feature    2..8
                     /label="editor note"
                     /note="first line
                     second line"
                     /ApEinfo_fwdcolor="#a855f7"
ORIGIN
        1 aaacccgggttt
//`);

    expect(result.document.annotations[0]).toMatchObject({
      name: 'editor note', color: '#a855f7',
      qualifiers: { note: ['first line second line'], ApEinfo_fwdcolor: ['#a855f7'] },
    });
  });

  it('detects native SnapGene bytes rather than decoding them as text', async () => {
    const packet = (type: number, data: number[]) => [type, 0, 0, 0, data.length, ...data];
    const ascii = (value: string) => [...value].map(char => char.charCodeAt(0));
    const file = new Blob([new Uint8Array([
      ...packet(0x09, [...ascii('SnapGene'), 0, 1, 0, 1, 0, 1]),
      ...packet(0x00, [1, ...ascii('ATGCGT')]),
    ])]);

    await expect(importPlasmidFile(file)).resolves.toMatchObject({ document: { sequence: 'ATGCGT', topology: 'circular' } });
  });
});
