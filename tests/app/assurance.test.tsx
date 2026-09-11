import { describe, expect, it } from 'vitest';
import { ASSURANCE, assuranceFor, assuranceSummary } from '@/tools/assurance';
import { TOOLS } from '@/tools/registry';

describe('scientific assurance registry', () => {
  it('assigns one honest assurance record to every registered tool', () => {
    expect(TOOLS).toHaveLength(37);
    expect(Object.keys(ASSURANCE).sort()).toEqual(TOOLS.map(tool => tool.id).sort());
    expect(Object.values(ASSURANCE).every(record => record.scope.length > 20 && record.verification.length > 12)).toBe(true);
    expect(assuranceSummary()['reference-tested']).toBeGreaterThan(0);
  });

  it('rejects assurance lookups for unregistered tools', () => {
    expect(() => assuranceFor('not-a-registered-tool')).toThrow('No assurance record is registered');
  });
});
