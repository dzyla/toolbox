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
