import { describe, expect, it } from 'vitest';
import { designNebuilder, NEBUILDER_DEFAULTS, type NebuilderFragment } from '@/core/cloning/methods/nebuilder';
import { designInfusion } from '@/core/cloning/methods/infusion';
import { infusionSegments, nebuilderSegments, segmentAnnotations } from '@/core/cloning/segments';
import { readableOn, sourceColor, SOURCE_COLORS } from '@/core/cloning/source-colors';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { randomDna } from './helpers';

const pcr = (name: string, seed: number, length = 300, topology: 'linear' | 'circular' = 'linear'): NebuilderFragment =>
  ({ name, sequence: randomDna(length, seed), topology, kind: 'pcr' });

describe('source colours', () => {
  it('cycles a fixed palette and greys out "no source"', () => {
    expect(sourceColor(0)).toBe(SOURCE_COLORS[0]);
    expect(sourceColor(SOURCE_COLORS.length)).toBe(SOURCE_COLORS[0]);
    expect(sourceColor(-1)).toBe('#9ca3af');
    expect(new Set(SOURCE_COLORS).size).toBe(SOURCE_COLORS.length);
  });
  it('picks dark text on light colours and white on dark ones', () => {
    expect(readableOn('#F0E442')).toBe('#111827');
    expect(readableOn('#0072B2')).toBe('#ffffff');
  });
});

describe('nebuilderSegments', () => {
  const settings = { ...NEBUILDER_DEFAULTS, circularize: false };

  it('partitions a linear assembly by source, in product coordinates', () => {
    const design = designNebuilder([pcr('A', 1), pcr('B', 2), pcr('C', 3)], settings);
    const segments = nebuilderSegments(design);
    expect(segments.map(s => s.sourceIndex)).toEqual([0, 1, 2]);
    expect(segments[0]).toMatchObject({ start: 0, end: 300 });
    expect(segments[1]!.start).toBe(300);
    expect(segments[2]!.end).toBe(design.product.length);
  });

  it('gives a spacer its own no-source segment', () => {
    const design = designNebuilder([pcr('A', 1), pcr('B', 2)], { ...settings, junctions: [{ spacer: 'GGATCC', mode: 'downstream' }] });
    const segments = nebuilderSegments(design);
    expect(segments.map(s => s.sourceIndex)).toEqual([0, -1, 1]);
    expect(segments[1]).toMatchObject({ start: 300, end: 306 });
    expect(segments[2]!.start).toBe(306);
  });

  it('keys by source index, so duplicate names stay distinct', () => {
    const design = designNebuilder([pcr('same', 1), pcr('same', 2)], settings);
    expect(nebuilderSegments(design).map(s => s.sourceIndex)).toEqual([0, 1]);
  });

  it('never runs past the product when the closing junction already overlaps', () => {
    const a = randomDna(300, 5);
    const b = randomDna(300, 6);
    const tailOfB = b.slice(-30);
    const design = designNebuilder([
      { name: 'A', sequence: tailOfB + a, topology: 'linear', kind: 'pcr' },
      { name: 'B', sequence: b, topology: 'linear', kind: 'pcr' },
    ], { ...NEBUILDER_DEFAULTS, circularize: true });
    expect(design.junctions[design.junctions.length - 1]!.intrinsicOverlap).toBeGreaterThan(0);
    const segments = nebuilderSegments(design);
    expect(Math.max(...segments.map(s => s.end))).toBeLessThanOrEqual(design.product.length);
  });

  it('returns nothing for a failed design', () => {
    expect(nebuilderSegments(designNebuilder([], NEBUILDER_DEFAULTS))).toEqual([]);
  });
});

describe('infusionSegments', () => {
  it('lays out vector then inserts, by hub source index', () => {
    const vector = randomDna(2000, 9);
    const inserts = [{ name: 'X', sequence: randomDna(300, 10) }, { name: 'Y', sequence: randomDna(200, 11) }];
    const design = designInfusion(vector, 'linear', { method: 'linear' }, inserts);
    const segments = infusionSegments(design, { sourceIndex: 2, name: 'vec' }, [
      { sourceIndex: 0, name: 'X', length: 300 }, { sourceIndex: 1, name: 'Y', length: 200 },
    ]);
    expect(segments.map(s => s.sourceIndex)).toEqual([2, 0, 1]);
    expect(segments[0]).toMatchObject({ start: 0, end: 2000 });
    expect(segments[1]).toMatchObject({ start: 2000, end: 2300 });
    expect(segments[2]!.end).toBe(design.product.length);
  });
});

describe('infusionSegments with restriction sites', () => {
  it('accounts for the added left and right site bases, so the segments add up to the product', () => {
    const puc19 = PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!.seq;
    const inserts = [{ name: 'X', sequence: randomDna(300, 10) }, { name: 'Y', sequence: randomDna(200, 11) }];
    const design = designInfusion(puc19, 'circular', { method: 'digest', enzymes: ['HindIII', 'EcoRI'], includeSites: { first: true, second: true } }, inserts);
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    expect(design.leftSite.length).toBeGreaterThan(0);
    expect(design.rightSite.length).toBeGreaterThan(0);
    const segments = infusionSegments(design, { sourceIndex: 2, name: 'pUC19' }, [
      { sourceIndex: 0, name: 'X', length: 300 }, { sourceIndex: 1, name: 'Y', length: 200 },
    ]);
    expect(segments.map(s => s.sourceIndex)).toEqual([2, -1, 0, 1, -1]);
    expect(segments.reduce((sum, s) => sum + s.end - s.start, 0)).toBe(design.product.length);
    for (let i = 1; i < segments.length; i++) expect(segments[i]!.start).toBe(segments[i - 1]!.end);
    expect(segments[segments.length - 1]!.end).toBe(design.product.length);
  });
});

describe('segmentAnnotations', () => {
  it('makes one coloured, numbered annotation per source segment and skips no-source bases', () => {
    const annotations = segmentAnnotations([
      { sourceIndex: 0, name: 'A', start: 0, end: 10 },
      { sourceIndex: -1, name: 'spacer', start: 10, end: 16 },
      { sourceIndex: 1, name: 'B', start: 16, end: 30 },
    ]);
    expect(annotations.map(a => a.name)).toEqual(['1 · A', '2 · B']);
    expect(annotations[0]!.color).toBe(sourceColor(0));
    expect(annotations[1]!.location.segments).toEqual([{ start: 16, end: 30 }]);
    expect(annotations.every(a => a.location.strand === 0)).toBe(true);
  });
});
