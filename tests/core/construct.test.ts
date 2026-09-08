import { describe, expect, it } from 'vitest';
import { finalizeConstructPlan, orientFragment, type ConstructPlan } from '@/core/cloning';

const basePlan: Omit<ConstructPlan, 'status' | 'product'> = {
  method: 'nebuilder',
  topology: 'circular',
  fragments: [
    { id: 'vector', name: 'Vector', sourceSequence: 'AAAACCCC', orientedSequence: 'AAAACCCC', role: 'vector', orientation: 'forward' },
    { id: 'insert', name: 'Insert', sourceSequence: 'CCCCGGGG', orientedSequence: 'CCCCGGGG', role: 'insert', orientation: 'forward' },
  ],
  junctions: [
    {
      leftFragmentId: 'vector', rightFragmentId: 'insert', method: 'nebuilder', overlap: 'CCCC', expectedOverlapLength: 4,
      observedLeftTerminal: 'CCCC', observedRightTerminal: 'CCCC', validated: true, notes: [],
    },
    {
      leftFragmentId: 'insert', rightFragmentId: 'vector', method: 'nebuilder', overlap: 'AAAA', expectedOverlapLength: 0,
      observedLeftTerminal: '', observedRightTerminal: '', validated: true, notes: ['Circular closure is an explicit seamless join.'],
    },
  ],
  findings: [],
  provenance: { workflow: 'test' },
};

describe('validated construct plans', () => {
  it('orients reverse fragments exactly once at the domain boundary', () => {
    expect(orientFragment({ sourceSequence: 'ATGC', orientation: 'reverse' })).toBe('GCAT');
  });

  it('merges each verified junction once into a sequence-validated circular product', () => {
    const plan = finalizeConstructPlan(basePlan);

    expect(plan.status).toBe('sequence-validated');
    expect(plan.product).toMatchObject({ sequence: 'AAAACCCCGGGG', topology: 'circular' });
  });

  it('blocks a plan whose declared overlap is not present on both junction sides', () => {
    const plan = finalizeConstructPlan({
      ...basePlan,
      junctions: [{ ...basePlan.junctions[0]!, observedRightTerminal: 'CCCA' }],
    });

    expect(plan.status).toBe('blocked');
    expect(plan.product).toBeUndefined();
    expect(plan.findings).toContainEqual(expect.objectContaining({ code: 'OVERLAP_MISMATCH', severity: 'blocker' }));
  });

  it('blocks duplicate fragment IDs before simulating a product', () => {
    const plan = finalizeConstructPlan({
      ...basePlan,
      fragments: [basePlan.fragments[0]!, { ...basePlan.fragments[1]!, id: 'vector' }],
    });

    expect(plan.status).toBe('blocked');
    expect(plan.findings).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_FRAGMENT_ID', severity: 'blocker' }));
  });
});
