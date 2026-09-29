import { describe, expect, it } from 'vitest';
import { chooseCodon, designAminoAcidChanges, designSdm, parseMutations, sdmProtocol, translateCodon } from '@/core/cloning/methods/basechanger';
import fixture from '../fixtures/vendor/basechanger/tail-designs.json';

interface Case {
  id: string;
  input: { mode: 'codon' | 'general'; orfStart?: number; codonops?: string; start?: number; end?: number; repseq?: string };
  expected: { description: string; forward: string; reverse: string; tmForward: number; tmReverse: number; ta: number };
}

const plasmid = fixture.plasmid.sequence;
const tailLength = (vendorPrimer: string) => [...vendorPrimer].filter(base => base === base.toLowerCase() && /[a-z]/.test(base)).length;

describe('SDM primers match NEBaseChanger v2.8.4 (5′-tail designs)', () => {
  for (const c of fixture.cases as unknown as Case[]) {
    it(c.id, () => {
      let design;
      if (c.input.mode === 'codon') {
        const { results } = designAminoAcidChanges(plasmid, { start: c.input.orfStart! - 1 }, c.input.codonops!);
        expect(results).toHaveLength(1);
        design = results[0]!.design!;
        expect(design).not.toBeNull();
      } else {
        const result = designSdm(plasmid, { start: c.input.start!, end: c.input.end! - 1, replacement: c.input.repseq!, label: c.id });
        if (!('forward' in result)) throw new Error(result.findings[0]!.message);
        design = result;
      }
      expect(design.forward.tail + design.forward.anneal).toBe(c.expected.forward.toUpperCase());
      expect(design.reverse.tail + design.reverse.anneal).toBe(c.expected.reverse.toUpperCase());
      expect(design.forward.tail.length).toBe(tailLength(c.expected.forward));
      expect(design.reverse.tail.length).toBe(tailLength(c.expected.reverse));
      // NEB displays whole degrees; ours are kept to a tenth.
      expect(Math.abs(design.forward.annealTm - c.expected.tmForward)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(design.reverse.annealTm - c.expected.tmReverse)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(design.ta - c.expected.ta)).toBeLessThanOrEqual(0.5);
      // NEB appends the plasmid and set names, and prints nothing for the deleted bases of a deletion.
      const vendor = c.expected.description.replace(/ in \S+ \(.*\)$/, '');
      if (vendor.startsWith('Delete')) expect(design.description).toMatch(new RegExp(`^Delete [acgt]+ ${vendor.replace(/^Delete\s+/, '')}$`));
      else expect(design.description).toBe(vendor);
    });
  }
});

describe('amino-acid changes', () => {
  const orf = { start: 283 };
  it('parses one- and three-letter mutations, exact codons and + groups', () => {
    const { groups, errors } = parseMutations('Y127F, H443T p.Tyr40Phe Y40F:TTC T39A+Y40F nonsense');
    expect(groups.map(group => group.map(mutation => `${mutation.from}${mutation.position}${mutation.to}${mutation.codon ? `:${mutation.codon}` : ''}`))).toEqual([
      ['Y127F'], ['H443T'], ['Y40F'], ['Y40F:TTC'], ['T39A', 'Y40F'],
    ]);
    expect(errors).toHaveLength(1);
  });

  it('chooses codons by E. coli usage or by minimal change (Y→F from TAC)', () => {
    expect(chooseCodon('TAC', 'F', 'usage')).toBe('TTT');
    expect(chooseCodon('TAC', 'F', 'minimal')).toBe('TTC');
    expect(chooseCodon('TAC', 'F', 'usage', 'human')).toBe('TTC');
    expect(translateCodon('TAC')).toBe('Y');
    expect(chooseCodon('TAC', '*', 'minimal')).toBe('TAA');
    expect(chooseCodon('TAC', 'Z', 'usage')).toBeNull();
  });

  it('warns about a wrong original residue (NEBaseChanger wording) and designs the silent change', () => {
    const { results } = designAminoAcidChanges(plasmid, orf, 'F40Y');
    expect(results[0]!.findings.map(finding => finding.code)).toEqual(['RESIDUE_MISMATCH', 'SILENT_CHANGE']);
    expect(results[0]!.findings[0]!.message).toBe('F40Y: Y found at 40 instead of F.');
    expect(results[0]!.design).not.toBeNull();
    expect(results[0]!.design!.forward.tail).toBe('TAT');
  });

  it('blocks positions outside the ORF, no-op changes and bad codons', () => {
    expect(designAminoAcidChanges(plasmid, orf, 'Y900F').results[0]!.findings[0]!.code).toBe('POSITION_OUT_OF_RANGE');
    expect(designAminoAcidChanges(plasmid, orf, 'T39T').results[0]!.findings.map(finding => finding.code)).toContain('NO_CHANGE');
    expect(designAminoAcidChanges(plasmid, orf, 'Y40F:GGG').results[0]!.findings.map(finding => finding.code)).toContain('CODON_MISMATCH');
  });

  it('designs separate primer pairs for a comma list', () => {
    const { results } = designAminoAcidChanges(plasmid, orf, 'Y40F, T39A');
    expect(results.map(result => result.label)).toEqual(['Y40F', 'T39A']);
    expect(results.every(result => result.design && result.design.forward.sequence)).toBe(true);
  });

  it('merges close mutations into one design and the product carries both changes', () => {
    const { results } = designAminoAcidChanges(plasmid, orf, 'T39A+Y40F');
    const design = results[0]!.design!;
    expect(results[0]!.rounds).toBeUndefined();
    const product = design.product;
    expect(product).toHaveLength(plasmid.length);
    const rotatedStart = product.indexOf('GCT');
    expect(rotatedStart).toBeGreaterThanOrEqual(0);
    expect(product.slice(0, 6)).toMatch(/^[ACGT]{6}$/);
  });

  it('plans consecutive rounds when mutations are too far apart to share primers', () => {
    const { results } = designAminoAcidChanges(plasmid, orf, 'V11A+Y40F');
    expect(results[0]!.rounds).toHaveLength(2);
    expect(results[0]!.findings.map(finding => finding.code)).toContain('CONSECUTIVE_ROUNDS');
  });

  it('produces the NEB Q5 SDM + KLD protocol', () => {
    const { results } = designAminoAcidChanges(plasmid, orf, 'Y40F');
    const protocol = sdmProtocol(results[0]!.design!, plasmid.length);
    expect(protocol.reactions[0]!.components[0]).toMatchObject({ name: 'Q5 Hot Start High-Fidelity 2X Master Mix', volumeUl: 12.5 });
    expect(protocol.reactions[1]!.components.map(component => component.volumeUl)).toEqual([1, 5, 1, null]);
    expect(protocol.steps[1]!.text).toContain(`${results[0]!.design!.ta} °C`);
  });

  it('rejects impossible edits', () => {
    expect('findings' in designSdm('ACGT', { start: 0, end: 1, replacement: 'A', label: 'x' })).toBe(true);
    const twoStart = designSdm(plasmid, { start: 10, end: 10, replacement: '', label: 'noop' });
    expect(twoStart).toHaveProperty('findings');
  });
});
