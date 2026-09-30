import { describe, expect, it } from 'vitest';
import { designNebuilder, fragmentTemplate, NEBUILDER_DEFAULTS, type NebuilderFragment } from '@/core/cloning/methods/nebuilder';
import { randomDna } from './helpers';

const circle = (open?: NebuilderFragment['open'], sequence = 'AAAACCCCGG'): NebuilderFragment =>
  ({ name: 'v', sequence, topology: 'circular', kind: 'pcr', open });

describe('fragmentTemplate with an opening', () => {
  it('leaves an unopened circle exactly as before', () => {
    expect(fragmentTemplate(circle())).toEqual({ sequence: 'AAAACCCCGG', start: 0, findings: [] });
  });

  it('starts a caret-opened circle at the caret', () => {
    expect(fragmentTemplate(circle({ caret: 4 }))).toEqual({ sequence: 'CCCCGGAAAA', start: 4, findings: [] });
  });

  it('treats caret 0 and caret = length as the same place', () => {
    expect(fragmentTemplate(circle({ caret: 0 })).sequence).toBe('AAAACCCCGG');
    expect(fragmentTemplate(circle({ caret: 10 }))).toEqual({ sequence: 'AAAACCCCGG', start: 0, findings: [] });
  });

  it('drops a replaced region and starts after it', () => {
    expect(fragmentTemplate(circle({ start: 2, end: 6 }))).toEqual({ sequence: 'CCGGAA', start: 6, findings: [] });
  });

  it('handles a replaced region that crosses the origin', () => {
    expect(fragmentTemplate(circle({ start: 8, end: 2 }))).toEqual({ sequence: 'AACCCC', start: 2, findings: [] });
  });

  it('accepts a region that ends at the sequence length', () => {
    expect(fragmentTemplate(circle({ start: 6, end: 10 }))).toEqual({ sequence: 'AAAACC', start: 0, findings: [] });
  });

  it.each([
    ['caret past the end', { caret: 11 }],
    ['negative caret', { caret: -1 }],
    ['fractional caret', { caret: 2.5 }],
    ['empty region', { start: 3, end: 3 }],
    ['region start past the end', { start: 10, end: 2 }],
    ['region end past the end', { start: 2, end: 11 }],
  ])('blocks %s with a message', (_label, open) => {
    const result = fragmentTemplate(circle(open));
    expect(result.sequence).toBe('');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ code: 'INVALID_OPEN_SITE', severity: 'blocker' });
    expect(result.findings[0]!.message).toContain('v');
  });

  it('says a whole-circle region covers the whole sequence, not that it is empty', () => {
    const whole = fragmentTemplate(circle({ start: 0, end: 10 }));
    expect(whole.sequence).toBe('');
    expect(whole.findings[0]).toMatchObject({ code: 'INVALID_OPEN_SITE', severity: 'blocker' });
    expect(whole.findings[0]!.message).toContain('covers the whole sequence');
    expect(whole.findings[0]!.message).not.toContain('empty');
    const empty = fragmentTemplate(circle({ start: 3, end: 3 }));
    expect(empty.findings[0]!.message).toContain('region is empty');
    expect(empty.findings[0]!.message).not.toContain('whole');
  });

  it('never produces NaN for an empty sequence', () => {
    for (const open of [{ caret: 0 }, { start: 0, end: 0 }] as const) {
      const result = fragmentTemplate(circle(open, ''));
      expect(result.sequence).toBe('');
      expect(result.start).toBe(0);
      expect(Number.isNaN(result.start)).toBe(false);
      expect(result.findings[0]).toMatchObject({ code: 'INVALID_OPEN_SITE', severity: 'blocker' });
    }
  });

  it('ignores an opening on a linear or digested fragment', () => {
    expect(fragmentTemplate({ ...circle({ caret: 4 }), topology: 'linear' }).sequence).toBe('AAAACCCCGG');
  });
});

describe('designNebuilder with an opened vector', () => {
  const vector = randomDna(3000, 21);
  const insert = randomDna(400, 22);
  const fragments = (open: NebuilderFragment['open']): NebuilderFragment[] => [
    { name: 'vec', sequence: vector, topology: 'circular', kind: 'pcr', isVectorBackbone: true, open },
    { name: 'gene', sequence: insert, topology: 'linear', kind: 'pcr' },
  ];

  it('amplifies the vector from the opening and puts the insert there', () => {
    const design = designNebuilder(fragments({ caret: 1000 }), NEBUILDER_DEFAULTS);
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    const rotated = vector.slice(1000) + vector.slice(0, 1000);
    expect(design.templates[0]).toMatchObject({ sequence: rotated, start: 1000 });
    expect(design.product.startsWith(rotated)).toBe(true);
    expect(design.product.slice(rotated.length, rotated.length + insert.length)).toBe(insert);
    const forward = design.primers.find(p => p.name === 'vec_fwd')!;
    expect(rotated.startsWith(forward.anneal)).toBe(true);
  });

  it('replaces a region: the product no longer contains the removed bases', () => {
    const design = designNebuilder(fragments({ start: 1000, end: 1200 }), NEBUILDER_DEFAULTS);
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    expect(design.templates[0]!.sequence).toHaveLength(2800);
    expect(design.product).toHaveLength(2800 + 400);
    expect(design.product.includes(vector.slice(1000, 1200))).toBe(false);
  });

  it('gives a blocker, not a crash, when the region leaves too little to prime', () => {
    const design = designNebuilder(fragments({ start: 10, end: 2990 }), NEBUILDER_DEFAULTS);
    expect(design.primers).toEqual([]);
    expect(design.findings.some(f => f.severity === 'blocker' && f.code === 'PRIMER_DESIGN_FAILED')).toBe(true);
  });

  it('is identical with no opening and with open: undefined', () => {
    expect(designNebuilder(fragments(undefined), NEBUILDER_DEFAULTS)).toEqual(designNebuilder(fragments(undefined).map(f => ({ ...f, open: undefined })), NEBUILDER_DEFAULTS));
  });
});
