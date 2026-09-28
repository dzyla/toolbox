import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '@/lib/url-state';

describe('url-state', () => {
  it('round-trips and is URL safe', () => {
    const s = { a: 1, b: 'x y', c: [1, 2, { d: null }] };
    const enc = encodeState(s);
    expect(enc).toMatch(/^[A-Za-z0-9+\-$]*$/);
    expect(decodeState(enc, {})).toEqual(s);
  });
  it('falls back on garbage', () => {
    expect(decodeState('!!!', { z: 1 })).toEqual({ z: 1 });
    expect(decodeState(undefined, { z: 1 })).toEqual({ z: 1 });
  });
});

describe('url-state link validation', () => {
  const defaults = { volume: { value: 10, unit: 'mL' }, count: 3, name: 'x', tags: ['a'], crop: null as number | null, open: false, empty: [] as number[] };

  it('keeps values that match the default shape and fills missing keys', () => {
    const link = encodeState({ count: 7, crop: 42, volume: { value: 2 }, tags: ['b', 'c'], empty: [1, 2] });
    expect(decodeState(link, defaults)).toEqual({ ...defaults, count: 7, crop: 42, volume: { value: 2, unit: 'mL' }, tags: ['b', 'c'], empty: [1, 2] });
  });

  it('drops values of the wrong type instead of passing them to the tool', () => {
    const link = encodeState({ count: 'seven', open: 'yes', volume: 5, tags: 'a', name: null });
    expect(decodeState(link, defaults)).toEqual(defaults);
  });

  it('rejects arrays whose elements do not match the default elements', () => {
    expect(decodeState(encodeState({ tags: ['ok', 3] }), defaults).tags).toEqual(['a']);
  });

  it('keeps keys the defaults do not declare (optional state added later)', () => {
    expect(decodeState(encodeState({ extra: 1 }), defaults)).toMatchObject({ extra: 1 });
  });

  it('ignores a link that decodes to a non-object', () => {
    expect(decodeState(encodeState([1, 2]), defaults)).toEqual(defaults);
    expect(decodeState(encodeState('text'), defaults)).toEqual(defaults);
  });
});
