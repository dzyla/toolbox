import { describe, expect, it } from 'vitest';
import { designSdm, isSdmDesign, type SdmDesign } from '@/core/cloning/methods/basechanger';
import { sdmEditView } from '@/core/cloning/edit-view';
import { randomDna } from './helpers';

const plasmid = randomDna(3000, 81);
const design = (start: number, end: number, replacement: string): SdmDesign => {
  const result = designSdm(plasmid, { start, end, replacement, label: 'x' });
  if (!isSdmDesign(result)) throw new Error(result.findings[0]!.message);
  return result;
};

describe('sdmEditView', () => {
  it('shows a replacement: removed bases before, added bases after, same context', () => {
    const view = sdmEditView(plasmid, design(1000, 1006, 'GGATCC'));
    expect(view.kind).toBe('replace');
    expect(view.before.removed).toBe(plasmid.slice(1000, 1006));
    expect(view.after.added).toBe('GGATCC');
    expect(view.before.left).toBe(plasmid.slice(970, 1000));
    expect(view.after.left).toBe(view.before.left);
    expect(view.after.right).toBe(view.before.right);
    expect(view.beforeStart).toBe(971);
    expect(view.afterStart).toBe(971);
    expect(view.delta).toBe(0);
  });

  it('shows a deletion with nothing added', () => {
    const view = sdmEditView(plasmid, design(500, 512, ''));
    expect(view).toMatchObject({ kind: 'delete', removedCount: 12, addedCount: 0, delta: -12 });
    expect(view.after.added).toBe('');
    expect(view.before.removed).toBe(plasmid.slice(500, 512));
  });

  it('shows an insertion with nothing removed', () => {
    const view = sdmEditView(plasmid, design(700, 700, 'ATGCATGC'));
    expect(view).toMatchObject({ kind: 'insert', removedCount: 0, addedCount: 8, delta: 8 });
    expect(view.before.removed).toBe('');
  });

  it('places the primers on either side of the edit in original coordinates', () => {
    const d = design(1000, 1006, 'GGATCC');
    const view = sdmEditView(plasmid, d);
    const fwd = view.primers.find(p => p.strand === 'fwd')!;
    const rev = view.primers.find(p => p.strand === 'rev')!;
    expect(fwd.start).toBe(1006);
    expect(fwd.length).toBe(d.forward.anneal.length);
    expect(rev.start + rev.length).toBe(1000);
    expect(fwd.tailLength).toBe(d.forward.tail.length);
  });

  it('wraps the context at the plasmid ends', () => {
    const view = sdmEditView(plasmid, design(5, 8, 'TTT'), 30);
    expect(view.beforeStart).toBe(1);
    expect(view.before.left).toBe(plasmid.slice(0, 5));
    const tail = sdmEditView(plasmid, design(2990, 2995, ''), 30);
    expect(tail.before.right).toBe(plasmid.slice(2995));
  });

  it('wraps the reverse primer position across the origin', () => {
    const view = sdmEditView(plasmid, design(3, 6, 'AAA'));
    const rev = view.primers.find(p => p.strand === 'rev')!;
    expect((rev.start + rev.length) % 3000).toBe(3);
    expect(rev.start).toBeGreaterThan(2900);
  });
});
