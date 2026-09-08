import { describe, expect, it } from 'vitest';
import { planQ5Mutagenesis } from '@/core/cloning/q5';
import { sourceFromText } from '@/core/cloning/sources';

const source = sourceFromText('gfp', '>GFP\nATGAGCAAGGGC');
const defaults = {
  partial: false,
  minPrimerLength: 15,
  minAnnealTm: 55,
  confineChangesToFivePrimeTails: false,
  constructName: 'GFP',
};

describe('Q5 / NEBaseChanger mutation planning', () => {
  it('applies an amino-acid mutation and validates the exact mutant sequence', () => {
    const plan = planQ5Mutagenesis(source, [{ kind: 'amino-acid', expression: 'S2T', orfStart: 1, strategy: 'ecoli-max-usage' }], defaults);

    expect(plan.status).toBe('sequence-validated');
    expect(plan.product!.sequence).toBe('ATGACCAAGGGC');
    expect(plan.primers).toHaveLength(2);
    expect(plan.primers[0]!.sequence).toContain('ACC');
  });

  it('honours an explicit codon and blocks an incorrect wild-type amino acid', () => {
    const explicit = planQ5Mutagenesis(source, [{ kind: 'amino-acid', expression: 'S2G:GGG', orfStart: 1, strategy: 'maximum-parsimony' }], defaults);
    const invalid = planQ5Mutagenesis(source, [{ kind: 'amino-acid', expression: 'A2T', orfStart: 1, strategy: 'ecoli-max-usage' }], defaults);

    expect(explicit.product!.sequence).toBe('ATGGGGAAGGGC');
    expect(invalid.status).toBe('blocked');
    expect(invalid.findings).toContainEqual(expect.objectContaining({ code: 'WILDTYPE_AMINO_ACID_MISMATCH' }));
  });
});
