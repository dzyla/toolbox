import { describe, it, expect } from 'vitest';
import { massFlagSuffix } from '@/tools/gel/analysis';

describe('massFlagSuffix', () => {
  it('is empty without flags', () => {
    expect(massFlagSuffix(null)).toBe('');
    expect(massFlagSuffix({ extrapolated: false, belowLoq: false })).toBe('');
  });
  it('marks extrapolation, sub-LOQ, or both', () => {
    expect(massFlagSuffix({ extrapolated: true, belowLoq: false })).toBe(' *');
    expect(massFlagSuffix({ extrapolated: false, belowLoq: true })).toBe(' <LOQ');
    expect(massFlagSuffix({ extrapolated: true, belowLoq: true })).toBe(' * <LOQ');
  });
});
