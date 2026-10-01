import { describe, expect, it } from 'vitest';
import { amplify, templateRegion } from '@/core/cloning/pcr';
import { displayPrimer, gcPercent, primersToCsv, primersToIdtBulk, type DesignedPrimer } from '@/core/cloning/oligo';
import { reverseComplement } from '@/core/nucleic/sequence';
import type { Molecule } from '@/core/cloning/molecule';

const circular: Molecule = { name: 'ring', sequence: 'ACGTACGTAAGGCCTT', topology: 'circular', annotations: [] };
const linear: Molecule = { ...circular, name: 'line', topology: 'linear', left: { kind: 'blunt', length: 0, phosphorylated: false, origin: 'x' }, right: { kind: 'blunt', length: 0, phosphorylated: false, origin: 'x' } };

describe('in-silico PCR', () => {
  it('reads a linear region directly and wraps a circular one across the origin', () => {
    expect(templateRegion(linear, { start: 2, length: 6 })).toBe('GTACGT');
    expect(templateRegion(circular, { start: 14, length: 6 })).toBe('TTACGT');
  });

  it('builds a blunt product with 5′ and 3′ tails and primers that anneal where they should', () => {
    const a = amplify(linear, { start: 0, length: 12 }, 6, 5, 'GGATCC', 'GAATTC', 'prod');
    expect(a.molecule.sequence).toBe('GGATCC' + 'ACGTACGTAAGG' + 'GAATTC');
    expect(a.molecule.topology).toBe('linear');
    expect(a.molecule.left).toMatchObject({ kind: 'blunt', phosphorylated: false });
    expect(a.forward.sequence).toBe('GGATCC' + 'ACGTAC');
    // Reverse primer = revcomp(tail on the 3′ end of the product) + revcomp(last 5 nt of the template region)
    expect(a.reverse.tail).toBe(reverseComplement('GAATTC'));
    expect(a.reverse.anneal).toBe(reverseComplement('GTAAGG'.slice(1)));
    expect(a.reverse.sequence).toBe(a.reverse.tail + a.reverse.anneal);
  });

  it('amplifies across the origin of a circular template', () => {
    const a = amplify(circular, { start: 12, length: 8 }, 4, 4);
    expect(a.molecule.sequence).toBe('CCTTACGT');
  });
});

describe('primer output formats', () => {
  const primer: DesignedPrimer = { name: 'F1', sequence: 'GGATCCACGTAC', tail: 'GGATCC', anneal: 'ACGTAC', annealTmC: 58.04, gcPercent: 58, target: 'insert', direction: 'forward', notes: ['a', 'b "q"'] };
  it('shows the tail in lower case and the annealing part in upper case', () => {
    expect(displayPrimer(primer)).toBe('ggatccACGTAC');
  });
  it('computes GC percent, including the empty case', () => {
    expect(gcPercent('GGCC')).toBe(100);
    expect(gcPercent('atgc')).toBe(50);
    expect(gcPercent('')).toBe(0);
  });
  it('writes CSV with quoted cells and IDT bulk TSV', () => {
    const csv = primersToCsv([primer]);
    expect(csv.split('\n')[0]).toContain('Anneal Tm (°C)');
    expect(csv).toContain('ggatccACGTAC');
    expect(csv).toContain('58.0');
    expect(csv).toContain('"a; b ""q"""');
    expect(primersToIdtBulk([primer])).toBe('F1\tGGATCCACGTAC\t25nm\tSTD\n');
  });
});
