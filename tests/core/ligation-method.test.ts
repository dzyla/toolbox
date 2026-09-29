import { describe, expect, it } from 'vitest';
import { designLigation, ligationProtocol } from '@/core/cloning/methods/ligation';
import { moleculeFromDocument, type Molecule } from '@/core/cloning/molecule';
import { protocolText } from '@/core/cloning/protocol';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { legacyPlasmidToDocument } from '@/core/plasmid/legacy';

const circular = (name: string, sequence: string): Molecule => ({ name, sequence, topology: 'circular', annotations: [] });
const linear = (name: string, sequence: string): Molecule => ({
  name, sequence, topology: 'linear', annotations: [],
  left: { kind: 'blunt', length: 0, phosphorylated: false, origin: 'PCR' },
  right: { kind: 'blunt', length: 0, phosphorylated: false, origin: 'PCR' },
});

// pUC-like vector with an EcoRI ... BamHI polylinker; the insert carries the same enzymes.
const PAD = 'GATCACGTACGTTAGCTAGCATCGATCGAT'.repeat(3);
const VECTOR = circular('vec', `${PAD}GAATTCAAACCCGGGTTTGGATCC${PAD}ACGT${PAD}`);
const GENE = 'ATGAAACGTAAAGCTTACGGATTTCGACCCGTAGCATAA';
const INSERT_SOURCE = linear('gene', `TTTT${'GC'.repeat(3)}GAATTC${GENE}GGATCC${'AT'.repeat(3)}TTTT`);

describe('restriction + ligation', () => {
  it('clones an EcoRI–BamHI insert directionally and rebuilds both sites', () => {
    const design = designLigation({ vector: VECTOR, insert: INSERT_SOURCE, vectorEnzymes: ['EcoRI', 'BamHI'], insertEnzymes: ['EcoRI', 'BamHI'] });
    expect(design.findings.filter(finding => finding.severity === 'blocker')).toEqual([]);
    expect(design.directional).toBe(true);
    expect(design.insertFlipped).toBe(false);
    const product = design.product!;
    expect(product.topology).toBe('circular');
    expect(product.sequence + product.sequence).toContain(`GAATTC${GENE}GGATCC`);
    expect(design.regeneratedSites.flat().sort()).toEqual(['BamHI', 'EcoRI']);
    // Product length = vector backbone + insert fragment − nothing lost: both fragments keep their overhangs once.
    expect(product.sequence.length).toBe(design.vectorFragment!.sequence.length + design.insertFragment!.sequence.length - 8);
  });

  it('finds the reverse orientation when the insert sites are the other way round', () => {
    const swapped = linear('gene', `TTTT${'GC'.repeat(3)}GGATCC${GENE}GAATTC${'AT'.repeat(3)}TTTT`);
    const design = designLigation({ vector: VECTOR, insert: swapped, vectorEnzymes: ['EcoRI', 'BamHI'], insertEnzymes: ['EcoRI', 'BamHI'] });
    expect(design.product).not.toBeNull();
    expect(design.insertFlipped).toBe(true);
    expect(design.directional).toBe(true);
  });

  it('warns that a single-enzyme cloning is not directional', () => {
    const vector = circular('v', `${PAD}GAATTC${PAD}`);
    const insert = linear('i', `TTTT${'GC'.repeat(3)}GAATTC${GENE}GAATTC${'AT'.repeat(3)}TTTT`);
    const design = designLigation({ vector, insert, vectorEnzymes: ['EcoRI'], insertEnzymes: ['EcoRI'] });
    expect(design.directional).toBe(false);
    expect(design.findings.map(finding => finding.code)).toContain('NOT_DIRECTIONAL');
  });

  it('blocks incompatible sticky ends and suggests blunting', () => {
    const bamInsert = linear('gene', `TTTT${'GC'.repeat(3)}GGATCC${GENE}GGATCC${'AT'.repeat(3)}TTTT`);
    const design = designLigation({ vector: VECTOR, insert: bamInsert, vectorEnzymes: ['EcoRI'], insertEnzymes: ['BamHI'] });
    expect(design.product).toBeNull();
    expect(design.findings[0]!.code).toBe('INCOMPATIBLE_ENDS');
    expect(design.findings[0]!.message).toMatch(/Blunting/);
  });

  it('makes incompatible ends compatible by blunting when asked', () => {
    const vector = circular('v', `${PAD}GAATTC${PAD}`);
    const insert = linear('i', `${'GC'.repeat(6)}GGATCC${GENE}GGATCC${'AT'.repeat(6)}`);
    const blocked = designLigation({ vector, insert, vectorEnzymes: ['EcoRI'], insertEnzymes: ['BamHI'] });
    expect(blocked.product).toBeNull();
    const blunt = designLigation({ vector, insert, vectorEnzymes: ['EcoRI'], insertEnzymes: ['BamHI'], makeBlunt: true });
    expect(blunt.product).not.toBeNull();
    expect(blunt.directional).toBe(false);
  });

  it('rejects a dephosphorylated vector with an unphosphorylated PCR insert, and accepts it after phosphorylation', () => {
    const vector = circular('v', `${PAD}CCCGGG${PAD}`);
    const pcr = linear('pcr', GENE);
    const blocked = designLigation({ vector, insert: pcr, vectorEnzymes: ['SmaI'], insertEnzymes: [], dephosphorylateVector: true });
    expect(blocked.findings.map(finding => finding.code)).toContain('NO_5_PHOSPHATE');
    const ok = designLigation({ vector, insert: pcr, vectorEnzymes: ['SmaI'], insertEnzymes: [], dephosphorylateVector: true, phosphorylateInsert: true });
    expect(ok.product).not.toBeNull();
    expect(ok.product!.sequence).toHaveLength(design(vector).length + GENE.length);
  });

  it('reports enzymes that do not cut, cut too often or are unknown', () => {
    expect(designLigation({ vector: VECTOR, insert: INSERT_SOURCE, vectorEnzymes: ['NotI', 'BamHI'], insertEnzymes: ['EcoRI', 'BamHI'] }).findings[0]!.code).toBe('NO_SITE');
    expect(designLigation({ vector: VECTOR, insert: INSERT_SOURCE, vectorEnzymes: ['Nope', 'BamHI'], insertEnzymes: ['EcoRI', 'BamHI'] }).findings[0]!.code).toBe('UNKNOWN_ENZYME');
    const twice = circular('v', `${PAD}GAATTC${PAD}GAATTC${PAD}GGATCC${PAD}`);
    const many = designLigation({ vector: twice, insert: INSERT_SOURCE, vectorEnzymes: ['EcoRI', 'BamHI'], insertEnzymes: ['EcoRI', 'BamHI'] });
    expect(many.findings.map(finding => finding.code)).toContain('MULTIPLE_SITES');
  });

  it('digests a real vector: pUC19 EcoRI + HindIII takes the 2.6 kb backbone', () => {
    const puc19 = moleculeFromDocument(legacyPlasmidToDocument(PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!));
    const insert = linear('gene', `TTTTTT${'GC'.repeat(3)}GAATTC${GENE}AAGCTT${'AT'.repeat(3)}TTTTTT`);
    const design2 = designLigation({ vector: puc19, insert, vectorEnzymes: ['EcoRI', 'HindIII'], insertEnzymes: ['EcoRI', 'HindIII'] });
    expect(design2.product).not.toBeNull();
    expect(design2.vectorFragment!.sequence.length).toBeGreaterThan(2600);
    // The two 4-nt EcoRI/HindIII overhangs are shared between the parts, so they are counted once.
    expect(design2.product!.sequence.length).toBe(design2.vectorFragment!.sequence.length + design2.insertFragment!.sequence.length - 8);
    expect(design2.regeneratedSites.flat().sort()).toEqual(['EcoRI', 'HindIII']);
  });

  it('produces the NEB M0202 protocol with the NEBioCalculator insert mass', () => {
    const design2 = designLigation({ vector: VECTOR, insert: INSERT_SOURCE, vectorEnzymes: ['EcoRI', 'BamHI'], insertEnzymes: ['EcoRI', 'BamHI'] });
    const protocol = ligationProtocol(design2, { vectorNg: 50, ratio: 3, vectorNgPerUl: 25, insertNgPerUl: 10 })!;
    const table = protocol.reactions[0]!;
    expect(table.totalVolumeUl).toBe(20);
    expect(table.components[0]).toMatchObject({ name: 'T4 DNA Ligase Buffer', volumeUl: 2 });
    const insertRow = table.components[2]!;
    const expectedNg = 50 * design2.insertFragment!.sequence.length / design2.vectorFragment!.sequence.length * 3;
    expect(insertRow.volumeUl).toBeCloseTo(expectedNg / 10, 10);
    expect(protocolText(protocol)).toContain('Heat inactivate at 65 °C');
    expect(protocol.steps[1]!.text).toMatch(/10 minutes/);
  });

  it('gives blunt ligations the longer incubation', () => {
    const vector = circular('v', `${PAD}CCCGGG${PAD}`);
    const design2 = designLigation({ vector, insert: linear('pcr', GENE), vectorEnzymes: ['SmaI'], insertEnzymes: [], phosphorylateInsert: true });
    const protocol = ligationProtocol(design2, { vectorNg: 50, ratio: 3, vectorNgPerUl: 25, insertNgPerUl: 10 })!;
    expect(protocol.title).toMatch(/Blunt/);
    expect(protocol.steps[1]!.text).toMatch(/2 hours/);
    expect(ligationProtocol({ ...design2, product: null }, { vectorNg: 50, ratio: 3, vectorNgPerUl: 25, insertNgPerUl: 10 })).toBeNull();
  });
});

function design(vector: Molecule): string {
  // SmaI blunt-opens the vector: the backbone is the whole circle.
  return vector.sequence;
}
