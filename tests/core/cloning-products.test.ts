import { describe, expect, it } from 'vitest';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { legacyPlasmidToDocument } from '@/core/plasmid/legacy';
import { designNebuilder, NEBUILDER_DEFAULTS } from '@/core/cloning/methods/nebuilder';
import { designInfusion } from '@/core/cloning/methods/infusion';
import { designSdm } from '@/core/cloning/methods/basechanger';
import { infusionProduct, nebuilderProduct, sdmProduct } from '@/core/cloning/products';
import { moleculeFromDocument, moleculeToDocument, type Molecule } from '@/core/cloning/molecule';
import { exportGenBank } from '@/core/plasmid/export';
import { validateDocument, type Annotation } from '@/core/plasmid/model';

const puc19 = moleculeFromDocument(legacyPlasmidToDocument(PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!));
const GENE = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACC'.repeat(2);

function feature(id: string, start: number, end: number, strand: 1 | -1 = 1): Annotation {
  return { id, name: id, type: 'misc_feature', location: { segments: [{ start, end }], strand }, qualifiers: {}, source: 'manual' };
}

const insertMolecule: Molecule = {
  name: 'gene', sequence: GENE, topology: 'linear', annotations: [feature('cds', 0, GENE.length), feature('tail', 200, 230)],
};

/** Bases a feature covers, on the top strand, reading its segments in order. */
function covered(molecule: Molecule, annotation: Annotation): string {
  return annotation.location.segments.map(segment => molecule.sequence.slice(segment.start, segment.end)).join('');
}

describe('product features', () => {
  it('NEBuilder product keeps every carried feature on the same bases', () => {
    const design = designNebuilder([
      { name: 'pUC19', sequence: puc19.sequence, topology: 'circular', kind: 'digest', leftEnzyme: 'HindIII', rightEnzyme: 'EcoRI', isVectorBackbone: true },
      { name: 'gene', sequence: GENE, topology: 'linear', kind: 'pcr' },
    ], NEBUILDER_DEFAULTS);
    expect(design.findings.filter(finding => finding.severity === 'blocker')).toEqual([]);
    const product = nebuilderProduct(design, [puc19, insertMolecule], 'construct', true)!;
    expect(product.annotations.length).toBeGreaterThan(3);
    const sources = [puc19, insertMolecule];
    for (const annotation of product.annotations) {
      const original = sources.flatMap(source => source.annotations.map(candidate => ({ source, candidate }))).filter(entry => entry.candidate.name === annotation.name);
      expect(original.length, annotation.name).toBeGreaterThan(0);
      expect(original.some(entry => covered(entry.source, entry.candidate) === covered(product, annotation)), annotation.name).toBe(true);
    }
    expect(product.annotations.map(annotation => annotation.name)).toContain('cds');
    expect(product.annotations.map(annotation => annotation.name)).toContain('pUC origin');
    // lacZα runs through the MCS that this cloning replaces, so it no longer exists intact.
    expect(product.annotations.map(annotation => annotation.name)).not.toContain('lacZ alpha');
  });

  it('In-Fusion product keeps vector and insert features on the same bases', () => {
    const design = designInfusion(puc19.sequence, 'circular', { method: 'digest', enzymes: ['EcoRI', 'HindIII'] }, [{ name: 'gene', sequence: GENE }]);
    const product = infusionProduct(design, puc19, [insertMolecule], 'construct')!;
    expect(product.sequence).toBe(design.product);
    for (const annotation of product.annotations) {
      const source = annotation.name === 'cds' || annotation.name === 'tail' ? insertMolecule : puc19;
      const original = source.annotations.find(candidate => candidate.name === annotation.name)!;
      expect(covered(product, annotation), annotation.name).toBe(covered(source, original));
    }
    expect(product.annotations.map(annotation => annotation.name)).toContain('cds');
  });

  it('SDM product keeps features that flank the edit, shifts those after it and adds the edit', () => {
    const plasmid: Molecule = {
      name: 'p', sequence: puc19.sequence, topology: 'circular',
      annotations: [feature('before', 10, 40), feature('around', 90, 200), feature('after', 300, 340), feature('cut', 148, 160)],
    };
    const design = designSdm(plasmid.sequence, { start: 150, end: 153, replacement: 'GGGGGG', label: 'X50G' });
    if (!('forward' in design)) throw new Error('design failed');
    const product = sdmProduct(plasmid, design);
    const names = product.annotations.map(annotation => annotation.name);
    expect(names).toEqual(expect.arrayContaining(['before', 'around', 'after', 'X50G']));
    const after = product.annotations.find(annotation => annotation.name === 'after')!;
    expect(covered(product, after)).toBe(plasmid.sequence.slice(300, 340));
    const around = product.annotations.find(annotation => annotation.name === 'around')!;
    expect(around.location.segments[0]!.end).toBe(200 + 3);
    expect(covered(product, product.annotations.find(annotation => annotation.name === 'X50G')!)).toBe('GGGGGG');
  });

  it('builds valid documents and GenBank text even when sources share feature ids', () => {
    const shared: Molecule = { ...insertMolecule, annotations: [feature('f1', 0, 20), feature('f1', 30, 50)] };
    const document = moleculeToDocument({ ...shared, topology: 'circular' }, 'doc');
    expect(validateDocument(document).valid).toBe(true);
    expect(exportGenBank(document)).toContain('LOCUS');
  });
});
