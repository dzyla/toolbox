import { describe, expect, it } from 'vitest';
import { parseSnapGene } from '@/core/plasmid/snapgene';

describe('SnapGene import safety', () => {
  it('rejects a truncated packet before interpreting sequence data', () => {
    const bytes = new Uint8Array([0x09, 0x00, 0x00, 0x00, 0x0e]);
    expect(() => parseSnapGene(bytes.buffer)).toThrow(/truncated/i);
  });

  it('imports a valid cookie and circular DNA packet', () => {
    const packet = (type: number, data: number[]) => [type, 0, 0, 0, data.length, ...data];
    const ascii = (value: string) => [...value].map(char => char.charCodeAt(0));
    const bytes = new Uint8Array([
      ...packet(0x09, [...ascii('SnapGene'), 0, 1, 0, 1, 0, 1]),
      ...packet(0x00, [1, ...ascii('ATGCGT')]),
    ]);

    const result = parseSnapGene(bytes.buffer);
    expect(result.document.sequence).toBe('ATGCGT');
    expect(result.document.topology).toBe('circular');
  });

  it('preserves native feature direction, segments, colour, and qualifiers', () => {
    const packet = (type: number, data: number[]) => [type, 0, 0, 0, data.length, ...data];
    const utf8 = (value: string) => [...new TextEncoder().encode(value)];
    const bytes = new Uint8Array([
      ...packet(0x09, [...utf8('SnapGene'), 0, 1, 0, 1, 0, 1]),
      ...packet(0x00, [1, ...utf8('AAACCCGGGTTT')]),
      ...packet(0x0a, utf8('<Features><Feature name="wrapped CDS" type="CDS" directionality="2"><Segment range="10-12" color="#e11d48"/><Segment range="1-3" color="#e11d48"/><Q name="note"><V text="kept intact"/></Q></Feature></Features>')),
    ]);

    const result = parseSnapGene(bytes.buffer);
    expect(result.document.annotations).toEqual([expect.objectContaining({
      name: 'wrapped CDS', type: 'CDS', color: '#e11d48',
      location: { strand: -1, segments: [{ start: 0, end: 3 }, { start: 9, end: 12 }] },
      qualifiers: expect.objectContaining({ label: ['wrapped CDS'], note: ['kept intact'] }),
    })]);
  });
});
