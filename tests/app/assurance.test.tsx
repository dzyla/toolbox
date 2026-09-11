import { describe, expect, it } from 'vitest';
import { ASSURANCE, assuranceSummary } from '@/tools/assurance';
import { TOOLS } from '@/tools/registry';

describe('scientific assurance registry', () => {
  it('assigns one honest assurance record to every registered tool', () => {
    expect(Object.keys(ASSURANCE).sort()).toEqual(TOOLS.map(tool => tool.id).sort());
    expect(Object.values(ASSURANCE).every(record => record.scope.length > 20 && record.verification.length > 12)).toBe(true);
    expect(assuranceSummary()['reference-tested']).toBeGreaterThan(0);
  });
});
