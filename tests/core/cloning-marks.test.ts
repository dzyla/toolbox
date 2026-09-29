import { describe, expect, it } from 'vitest';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { legacyPlasmidToDocument } from '@/core/plasmid/legacy';
import { reverseComplement } from '@/core/nucleic/sequence';
import { designNebuilder, NEBUILDER_DEFAULTS } from '@/core/cloning/methods/nebuilder';
import { designInfusion } from '@/core/cloning/methods/infusion';
import { designLigation } from '@/core/cloning/methods/ligation';
import { designSdm } from '@/core/cloning/methods/basechanger';
import { infusionMarks, ligationMarks, nebuilderMarks, sdmMarks, type ProductMark } from '@/core/cloning/products';
import { moleculeFromDocument, type Molecule } from '@/core/cloning/molecule';

const puc19 = moleculeFromDocument(legacyPlasmidToDocument(PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!));
const GENE = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACC'.repeat(2);
const gene: Molecule = { name: 'gene', sequence: GENE, topology: 'linear', annotations: [] };

function inRange(marks: ProductMark[], length: number) {
  for (const mark of marks) {
    expect(mark.start, mark.label).toBeGreaterThanOrEqual(0);
    expect(mark.end, mark.label).toBeGreaterThan(mark.start);
    expect(mark.end, mark.label).toBeLessThanOrEqual(length);
  }
}

describe('nebuilderMarks', () => {
  const design = designNebuilder([
    { name: 'pUC19', sequence: puc19.sequence, topology: 'circular', kind: 'digest', leftEnzyme: 'HindIII', rightEnzyme: 'EcoRI', isVectorBackbone: true },
    { name: 'gene', sequence: GENE, topology: 'linear', kind: 'pcr' },
  ], NEBUILDER_DEFAULTS);

  it('marks each overlap on exactly the overlap bases (the closing one split at the origin)', () => {
    expect(design.findings.filter(finding => finding.severity === 'blocker')).toEqual([]);
    const marks = nebuilderMarks(design);
    inRange(marks, design.product.length);
    expect(marks.every(mark => mark.kind === 'junction')).toBe(true);
    const first = design.junctions[0]!;
    const inner = marks.find(mark => mark.label.startsWith('Junction 1:'))!;
    expect(inner.label).toBe('Junction 1: pUC19 → gene');
    expect(design.product.slice(inner.start, inner.end)).toBe(first.upstreamTail + first.spacer + reverseComplement(first.downstreamTail));
    expect(inner.detail).toContain(`${first.overlapLength}-bp overlap`);
    const closing = design.junctions[1]!;
    const parts = marks.filter(mark => mark.label.startsWith('Junction 2:'));
    const joined = parts.map(mark => design.product.slice(mark.start, mark.end)).join('');
    expect(joined).toBe(closing.upstreamTail + closing.spacer + reverseComplement(closing.downstreamTail));
    if (parts.length === 2) expect(parts[1]!.start).toBe(0);
  });

  it('marks overlap that already exists between the fragments', () => {
    const left = 'ACGTAGCTAGCTAGGATCGATCGGCTAAGCTTGGCCAATTGGCATCGATCGA';
    const overlap = 'GCTTGGCCAATTGGCATCGATCGATTAGGC';
    const right = overlap + 'CCGGTTAACCGGTTAAGGCCTTAAGGCCTTAAGCGCGCTATATAGCGCTATATTTAAAGCGC';
    const shared = designNebuilder([
      { name: 'a', sequence: left + overlap, topology: 'linear', kind: 'pcr' },
      { name: 'b', sequence: right, topology: 'linear', kind: 'pcr' },
    ], { ...NEBUILDER_DEFAULTS, circularize: false });
    const marks = nebuilderMarks(shared);
    expect(marks).toHaveLength(1);
    expect(shared.product.slice(marks[0]!.start, marks[0]!.end)).toBe(overlap);
  });

  it('returns nothing for a failed design', () => {
    expect(nebuilderMarks({ ...design, product: '', templates: [], junctions: [] })).toEqual([]);
  });
});

describe('infusionMarks', () => {
  const design = designInfusion(puc19.sequence, 'circular', { method: 'digest', enzymes: ['EcoRI', 'HindIII'] }, [{ name: 'gene', sequence: GENE }]);

  it('marks the vector homology arms on the vector ends carried by the insert primers', () => {
    const marks = infusionMarks(design, [gene]);
    inRange(marks, design.product.length);
    expect(marks.map(mark => mark.label)).toEqual(['Junction 1: vector → gene', 'Junction 2: gene → vector']);
    const forward = design.primers.find(primer => primer.direction === 'forward' && primer.role === 'insert')!;
    const reverse = design.primers.find(primer => primer.direction === 'reverse' && primer.role === 'insert')!;
    expect(design.product.slice(marks[0]!.start, marks[0]!.end)).toBe(forward.extension);
    expect(design.product.slice(marks[1]!.start, marks[1]!.end)).toBe(reverseComplement(reverse.extension));
    expect(marks[0]!.detail).toContain('15-bp homology');
  });

  it('marks the insert-to-insert homology of a multi-insert assembly', () => {
    const second: Molecule = { ...gene, name: 'gene2', sequence: reverseComplement(GENE) };
    const multi = designInfusion(puc19.sequence, 'circular', { method: 'digest', enzymes: ['EcoRI', 'HindIII'] }, [{ name: 'gene', sequence: GENE }, { name: 'gene2', sequence: second.sequence }]);
    const marks = infusionMarks(multi, [gene, second]);
    expect(marks.map(mark => mark.label)).toEqual(['Junction 1: vector → gene', 'Junction 2: gene → gene2', 'Junction 3: gene2 → vector']);
    inRange(marks, multi.product.length);
    expect(multi.product.slice(marks[1]!.start, marks[1]!.end)).toBe(GENE.slice(-10));
    expect(marks[0]!.detail).toContain('20-bp homology');
  });

  it('returns nothing without a product', () => {
    expect(infusionMarks({ ...design, product: '' }, [gene])).toEqual([]);
  });
});

describe('ligationMarks', () => {
  it('marks each overhang on the product bases', () => {
    const design = designLigation({
      vector: puc19,
      insert: { name: 'ins', sequence: `TTTTTTGAATTC${GENE}AAGCTTTTTTTT`, topology: 'linear', annotations: [] },
      vectorEnzymes: ['EcoRI', 'HindIII'],
      insertEnzymes: ['EcoRI', 'HindIII'],
    });
    const product = design.product!;
    expect(design.junctions.length).toBeGreaterThan(0);
    const marks = ligationMarks(design.junctions);
    expect(marks).toHaveLength(design.junctions.length);
    inRange(marks, product.sequence.length);
    marks.forEach((mark, index) => {
      expect(product.sequence.slice(mark.start, mark.end), mark.label).toBe(design.junctions[index]!.sequence);
      expect(mark.label).toBe(`Junction ${index + 1}: ${design.junctions[index]!.leftName} → ${design.junctions[index]!.rightName}`);
    });
    expect(marks[0]!.detail).toContain('overhang');
  });

  it('marks a blunt junction with 2 bp around the point and the origin junction from base 1', () => {
    const marks = ligationMarks([
      { index: 0, leftName: 'a', rightName: 'b', position: 40, kind: 'blunt', sequence: '', description: '' },
      { index: 1, leftName: 'b', rightName: 'a', position: 0, kind: 'sticky', sequence: 'AATT', description: '' },
    ]);
    expect(marks[0]).toMatchObject({ start: 39, end: 41, kind: 'junction' });
    expect(marks[1]).toMatchObject({ start: 0, end: 4 });
  });
});

describe('sdmMarks', () => {
  it('marks the replacement bases', () => {
    const design = designSdm(puc19.sequence, { start: 150, end: 153, replacement: 'GGGGGG', label: 'X50G' });
    if (!('forward' in design)) throw new Error('design failed');
    const [mark] = sdmMarks(design);
    expect(mark).toMatchObject({ kind: 'edit', start: 150, end: 156, label: 'Edit: X50G' });
    expect(design.product.slice(mark!.start, mark!.end)).toBe('GGGGGG');
  });

  it('marks a deletion as 2 bp around the point, clamped into the product', () => {
    const design = designSdm(puc19.sequence, { start: 150, end: 153, replacement: '', label: 'del' });
    if (!('forward' in design)) throw new Error('design failed');
    const [mark] = sdmMarks(design);
    expect(mark).toMatchObject({ start: 149, end: 151 });
    inRange([mark!], design.product.length);
    expect(sdmMarks({ ...design, edit: { ...design.edit, start: 0 } })[0]).toMatchObject({ start: 0, end: 2 });
  });
});
