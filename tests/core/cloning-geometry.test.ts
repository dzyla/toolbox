import { describe, expect, it } from 'vitest';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { designInfusion } from '@/core/cloning/methods/infusion';
import { designNebuilder, NEBUILDER_DEFAULTS, type NebuilderFragment } from '@/core/cloning/methods/nebuilder';
import { infusionGeometry, nebuilderGeometry } from '@/core/cloning/geometry';
import { randomDna } from './helpers';

const vector = randomDna(3000, 51);
const insert = randomDna(400, 52);
const fragments = (open?: NebuilderFragment['open']): NebuilderFragment[] => [
  { name: 'vec', sequence: vector, topology: 'circular', kind: 'pcr', isVectorBackbone: true, open },
  { name: 'gene', sequence: insert, topology: 'linear', kind: 'pcr' },
];

describe('nebuilderGeometry', () => {
  it('draws the opened vector from the caret, primers at the ends of the region', () => {
    const list = fragments({ caret: 1000 });
    const pieces = nebuilderGeometry(designNebuilder(list, NEBUILDER_DEFAULTS), list);
    const vec = pieces[0]!;
    expect(vec).toMatchObject({ sourceIndex: 0, name: 'vec', length: 3000, kind: 'pcr', region: { start: 1000, length: 3000 } });
    const fwd = vec.primers.find(p => p.strand === 'fwd')!;
    const rev = vec.primers.find(p => p.strand === 'rev')!;
    expect(fwd.start).toBe(1000);
    expect((rev.start + rev.length) % 3000).toBe(1000);
    expect(vec.removed).toBeUndefined();
  });

  it('reports the removed part of a replaced region and the tail neighbours', () => {
    const list = fragments({ start: 1000, end: 1200 });
    const pieces = nebuilderGeometry(designNebuilder(list, NEBUILDER_DEFAULTS), list);
    const vec = pieces[0]!;
    expect(vec.region).toEqual({ start: 1200, length: 2800 });
    expect(vec.removed).toEqual({ start: 1000, length: 200 });
    const gene = pieces[1]!;
    const geneFwd = gene.primers.find(p => p.strand === 'fwd')!;
    const geneRev = gene.primers.find(p => p.strand === 'rev')!;
    expect(geneFwd.tailLength).toBeGreaterThan(0);
    expect(geneFwd.tailNeighborIndex).toBe(0);
    expect(geneRev.tailNeighborIndex).toBe(0);
  });

  it('tags tails with the right neighbour in a three-fragment circle', () => {
    const list: NebuilderFragment[] = ['a', 'b', 'c'].map((name, i) => ({ name, sequence: randomDna(300, 60 + i), topology: 'linear', kind: 'pcr' }));
    const pieces = nebuilderGeometry(designNebuilder(list, NEBUILDER_DEFAULTS), list);
    expect(pieces[0]!.primers.find(p => p.strand === 'fwd')!.tailNeighborIndex).toBe(2);
    expect(pieces[0]!.primers.find(p => p.strand === 'rev')!.tailNeighborIndex).toBe(1);
    expect(pieces[2]!.primers.find(p => p.strand === 'rev')!.tailNeighborIndex).toBe(0);
  });

  it('keeps duplicate names apart and has no primers on a digested piece', () => {
    const dup: NebuilderFragment[] = [
      { name: 'same', sequence: randomDna(300, 71), topology: 'linear', kind: 'pcr' },
      { name: 'same', sequence: randomDna(300, 72), topology: 'linear', kind: 'pcr' },
    ];
    const pieces = nebuilderGeometry(designNebuilder(dup, NEBUILDER_DEFAULTS), dup);
    expect(pieces.map(p => p.sourceIndex)).toEqual([0, 1]);
    expect(pieces.every(p => p.primers.length === 2)).toBe(true);
  });

  it('returns nothing when the design failed', () => {
    expect(nebuilderGeometry(designNebuilder([], NEBUILDER_DEFAULTS), [])).toEqual([]);
  });
});

describe('infusionGeometry', () => {
  it('places the inverse-PCR vector primers at the ends of the opened vector', () => {
    const design = designInfusion(vector, 'circular', { method: 'pcr', caret: 500 }, [{ name: 'gene', sequence: insert }], { vectorShare: 0.5 });
    const pieces = infusionGeometry(design, { sourceIndex: 0, name: 'vec', length: 3000 }, [{ sourceIndex: 1, name: 'gene', length: 400 }]);
    const vec = pieces[0]!;
    expect(vec.region).toEqual({ start: 500, length: 3000 });
    expect(vec.primers.find(p => p.strand === 'fwd')!.start).toBe(500);
    expect(vec.primers.find(p => p.strand === 'rev')!.tailNeighborIndex).toBe(1);
    const gene = pieces[1]!;
    expect(gene.primers.find(p => p.strand === 'fwd')!.tailLength).toBeGreaterThan(0);
    expect(gene.primers.find(p => p.strand === 'fwd')!.tailNeighborIndex).toBe(0);
  });

  it('shows a cut vector as a band with the removed stretch and no primers', () => {
    const puc19 = PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!.seq;
    const design = designInfusion(puc19, 'circular', { method: 'digest', enzymes: ['HindIII', 'EcoRI'] }, [{ name: 'gene', sequence: insert }]);
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    const pieces = infusionGeometry(design, { sourceIndex: 0, name: 'pUC19', length: puc19.length }, [{ sourceIndex: 1, name: 'gene', length: 400 }]);
    expect(pieces[0]!.kind).toBe('digest');
    expect(pieces[0]!.primers).toEqual([]);
    expect(pieces[0]!.removed).toBeDefined();
    expect(pieces[0]!.removed!.length).toBe(puc19.length - design.vector.length);
  });
});
