import { describe, it, expect } from 'vitest';
import { parseRoute, toHash } from '@/app/router';

describe('router', () => {
  it('parses home', () => {
    for (const h of ['', '#', '#/']) expect(parseRoute(h)).toEqual({ name: 'home' });
  });
  it('parses tool routes', () => {
    expect(parseRoute('#/t/molarity')).toEqual({ name: 'tool', toolId: 'molarity' });
    expect(parseRoute('#/t/molarity/p/abc123')).toEqual({ name: 'tool', toolId: 'molarity', projectId: 'abc123' });
    expect(parseRoute('#/t/molarity?s=N4Ig')).toEqual({ name: 'tool', toolId: 'molarity', state: 'N4Ig' });
  });
  it('round-trips', () => {
    const r = { name: 'tool', toolId: 'gel', projectId: 'p1' } as const;
    expect(parseRoute(toHash(r))).toEqual(r);
    expect(toHash({ name: 'home' })).toBe('#/');
    expect(toHash({ name: 'tool', toolId: 'molarity', state: 'AB' })).toBe('#/t/molarity?s=AB');
  });
  it('flags unknown', () => {
    expect(parseRoute('#/nope').name).toBe('notfound');
  });
});
