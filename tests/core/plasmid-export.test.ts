import { describe, expect, it } from 'vitest';
import { exportGenBank } from '@/core/plasmid/export';
import { importPlasmidText } from '@/core/plasmid/import';

describe('plasmid export', () => {
  it('exports annotations as a GenBank record that can be imported again', () => {
    const document = importPlasmidText(`LOCUS       demo 12 bp DNA circular
FEATURES             Location/Qualifiers
     CDS             complement(join(10..12,1..3))
                     /label="wrapped gene"
                     /note="kept intact"
ORIGIN
        1 aaacccgggttt
//`).document;

    const roundTripped = importPlasmidText(exportGenBank(document)).document;
    expect(roundTripped).toMatchObject({
      name: 'demo', sequence: 'AAACCCGGGTTT', topology: 'circular',
      annotations: [expect.objectContaining({ name: 'wrapped gene', qualifiers: expect.objectContaining({ note: ['kept intact'] }) })],
    });
  });
});
