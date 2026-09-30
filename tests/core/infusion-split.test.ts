import { describe, expect, it } from 'vitest';
import { designInfusion } from '@/core/cloning/methods/infusion';
import { infusionMarks } from '@/core/cloning/products';
import { reverseComplement } from '@/core/nucleic/sequence';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { randomDna } from './helpers';

const vector = randomDna(2000, 41);
const insert = randomDna(300, 42);
const inserts = [{ name: 'gene', sequence: insert }];
const inverse = { method: 'pcr' as const, caret: 500 };

describe('vectorShare', () => {
  it('is identical to today at 0 and when unset', () => {
    const base = designInfusion(vector, 'circular', inverse, inserts);
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 0 })).toEqual(base);
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: undefined })).toEqual(base);
  });

  it('carries part of the left homology on the vector reverse primer', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 0.5 });
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    const b = 8; // Math.round(15 * 0.5)
    const a = 15 - b;
    const insertForward = design.primers.find(p => p.name === 'gene_fwd')!;
    const vectorReverse = design.primers.find(p => p.name === 'vector_rev')!;
    expect(insertForward.extension).toBe(design.vector.slice(-a));
    expect(vectorReverse.extension).toBe(reverseComplement(insert.slice(0, b)));
    const overlap = design.vector.slice(-a) + insert.slice(0, b);
    expect((design.vector + insert.slice(0, b)).endsWith(overlap)).toBe(true);
    expect((design.vector.slice(-a) + insert).startsWith(overlap)).toBe(true);
    expect(overlap).toHaveLength(15);
  });

  it('carries the matching part of the right homology on the vector forward primer', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 0.5 });
    const insertReverse = design.primers.find(p => p.name === 'gene_rev')!;
    const vectorForward = design.primers.find(p => p.name === 'vector_fwd')!;
    expect(vectorForward.extension).toBe(insert.slice(-8));
    expect(insertReverse.extension).toBe(reverseComplement(design.vector.slice(0, 7)));
  });

  it('does not change the product', () => {
    const base = designInfusion(vector, 'circular', inverse, inserts);
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 1 }).product).toBe(base.product);
  });

  it('put all 15 bases on the vector primers at share 1', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 1 });
    expect(design.primers.find(p => p.name === 'gene_fwd')!.extension).toBe('');
    expect(design.primers.find(p => p.name === 'vector_rev')!.extension).toHaveLength(15);
  });

  it('uses the multi-insert length (20) as the total', () => {
    const two = [...inserts, { name: 'tag', sequence: randomDna(200, 43) }];
    const design = designInfusion(vector, 'circular', inverse, two, { vectorShare: 0.5 });
    expect(design.primers.find(p => p.name === 'gene_fwd')!.extension).toHaveLength(10);
    expect(design.primers.find(p => p.name === 'vector_rev')!.extension).toHaveLength(10);
    // The insert–insert junction is untouched.
    expect(design.primers.find(p => p.name === 'tag_fwd')!.extension).toBe(insert.slice(-10));
  });

  it('is ignored, with a note, when the vector is cut or already linear', () => {
    const base = designInfusion(vector, 'linear', { method: 'linear' }, inserts);
    const shared = designInfusion(vector, 'linear', { method: 'linear' }, inserts, { vectorShare: 0.5 });
    expect(shared.primers).toEqual(base.primers);
    expect(shared.findings.some(f => f.code === 'SHARE_IGNORED' && f.severity === 'info')).toBe(true);
    const puc19 = PRESET_PLASMIDS.find(p => p.id === 'puc19')!.seq;
    const cut = { method: 'digest' as const, enzymes: ['HindIII', 'EcoRI'] as [string, string] };
    const cutBase = designInfusion(puc19, 'circular', cut, inserts);
    const cutShared = designInfusion(puc19, 'circular', cut, inserts, { vectorShare: 0.5 });
    expect(cutShared.primers).toEqual(cutBase.primers);
    expect(cutShared.findings.some(f => f.code === 'SHARE_IGNORED' && f.severity === 'info')).toBe(true);
  });

  it('clamps a share outside 0–1', () => {
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 5 }).primers)
      .toEqual(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 1 }).primers);
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: -2 }).primers)
      .toEqual(designInfusion(vector, 'circular', inverse, inserts).primers);
  });
});

describe('infusionMarks with a shared homology', () => {
  const insertMolecules = [{ name: 'gene', sequence: insert, topology: 'linear' as const, annotations: [] }];

  it('marks the whole 15 bp at the left junction and both halves at the right one', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 0.5 });
    const marks = infusionMarks(design, insertMolecules);
    const left = marks.find(m => m.label.startsWith('Junction 1'))!;
    expect(left.end - left.start).toBe(15);
    expect(left.start).toBe(design.vector.length - 7);
    const right = marks.filter(m => m.label.startsWith('Junction 2'));
    expect(right).toHaveLength(2);
    expect(right.reduce((sum, m) => sum + m.end - m.start, 0)).toBe(15);
    for (const mark of right) {
      expect(mark.start).toBeGreaterThanOrEqual(0);
      expect(mark.end).toBeLessThanOrEqual(design.product.length);
    }
  });

  it('keeps the single mark when nothing is shared', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts);
    const marks = infusionMarks(design, insertMolecules);
    expect(marks.filter(m => m.label.startsWith('Junction 2'))).toHaveLength(1);
    expect(marks.find(m => m.label.startsWith('Junction 2'))).toMatchObject({ start: 0, end: 15 });
  });
});

describe('infusionMarks for several inserts and extreme shares', () => {
  const second = randomDna(200, 43);
  const two = [...inserts, { name: 'tag', sequence: second }];
  const molecules = two.map(item => ({ name: item.name, sequence: item.sequence, topology: 'linear' as const, annotations: [] }));

  it('marks 20 bp at each vector junction at share 0.5, half on each primer', () => {
    const design = designInfusion(vector, 'circular', inverse, two, { vectorShare: 0.5 });
    const marks = infusionMarks(design, molecules);
    const left = marks.find(m => m.label.startsWith('Junction 1'))!;
    expect(left).toMatchObject({ start: design.vector.length - 10, end: design.vector.length + 10 });
    const middle = marks.find(m => m.label.startsWith('Junction 2'))!;
    expect(middle.end - middle.start).toBe(10);
    const right = marks.filter(m => m.label.startsWith('Junction 3'));
    expect(right).toHaveLength(2);
    expect(right.reduce((sum, m) => sum + m.end - m.start, 0)).toBe(20);
    for (const mark of marks) { expect(mark.start).toBeGreaterThanOrEqual(0); expect(mark.end).toBeLessThanOrEqual(design.product.length); }
  });

  it('marks the whole homology beyond the vector at share 1 and a single right-hand mark', () => {
    const design = designInfusion(vector, 'circular', inverse, two, { vectorShare: 1 });
    const marks = infusionMarks(design, molecules);
    const left = marks.find(m => m.label.startsWith('Junction 1'))!;
    expect(left).toMatchObject({ start: design.vector.length, end: design.vector.length + 20 });
    const right = marks.filter(m => m.label.startsWith('Junction 3'));
    expect(right).toEqual([expect.objectContaining({ start: design.product.length - 20, end: design.product.length })]);
  });

  it('marks 15 bp at each end at share 1 for one insert', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 1 });
    const marks = infusionMarks(design, [{ name: 'gene', sequence: insert, topology: 'linear', annotations: [] }]);
    expect(marks.find(m => m.label.startsWith('Junction 1'))).toMatchObject({ start: design.vector.length, end: design.vector.length + 15 });
    expect(marks.filter(m => m.label.startsWith('Junction 2'))).toEqual([expect.objectContaining({ start: design.product.length - 15, end: design.product.length })]);
  });
});
