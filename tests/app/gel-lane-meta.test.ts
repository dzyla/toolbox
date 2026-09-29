import { describe, it, expect } from 'vitest';
import { assignByPattern, effectiveMeta, laneRole } from '@/tools/gel/lane-meta';

describe('lane metadata', () => {
  it('assigns conditions × replicates in lane order, leaving extra lanes untouched', () => {
    const m = assignByPattern(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['ctrl', 'drug'], 3);
    expect(m.a).toEqual({ condition: 'ctrl', replicate: 1, excluded: false });
    expect(m.c).toEqual({ condition: 'ctrl', replicate: 3, excluded: false });
    expect(m.d).toEqual({ condition: 'drug', replicate: 1, excluded: false });
    expect(m.g).toBeUndefined();
  });
  it('defaults the condition to the lane label', () => {
    expect(effectiveMeta('x', {}, 'WT')).toEqual({ condition: 'WT', replicate: null, excluded: false });
  });
  it('derives ladder and standard roles from the calibration lanes', () => {
    expect(laneRole('l1', undefined, 'l1', '')).toBe('ladder');
    expect(laneRole('l2', undefined, 'l1', 'l2')).toBe('standard');
    expect(laneRole('l3', { condition: 'a', replicate: 1, excluded: true }, 'l1', 'l2')).toBe('excluded');
    expect(laneRole('l4', undefined, 'l1', 'l2')).toBe('sample');
  });
});
