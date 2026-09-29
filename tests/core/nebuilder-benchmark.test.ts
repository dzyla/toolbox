import { describe, expect, it } from 'vitest';
import { designNebuilder, NEBUILDER_DEFAULTS } from '@/core/cloning/methods/nebuilder';

// The NEBuilder HiFi (E5520) example: a 283 bp vector fragment and a 285 bp GFP fragment, both PCR products,
// Q5 at 500 nM, 20 nt minimum overlap, circularized. Primer sequences, lengths and the 10 + 10 nt split overlap
// are those the NEBuilder Assembly Tool v2.11.2 returns (checked live on 2026-09-27).
const VECTOR = 'GGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAAAACCCTGGCGTTACCCAACTTAATCGCCTTGCAGCACATCCCCCTTTCGCCAGCTGGCGTAATAGCGAAGAGGCCCGCACCGATCGCCCTTCCCAACAGTTGCGCAGCCTGAATGGCGAATGGCGCTTTGCCTGGTTTCCGGCACCAGAAGCGGTGCCGGAAAGCTGGCTGGAGTGCGATCTTCCTGAGGCCGATACTGTCGTCGTCCCCTCAAACTGGCAGATGCACGGT';
const GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

describe('NEBuilder HiFi E5520 benchmark', () => {
  const design = designNebuilder([
    { name: 'NewFragment1', sequence: VECTOR, topology: 'linear', kind: 'pcr' },
    { name: 'NewFragment', sequence: GFP, topology: 'linear', kind: 'pcr' },
  ], { ...NEBUILDER_DEFAULTS, polymeraseId: 'q5-0', minOverlap: 20, minPrimerLength: 18, maxTmDifference: 5, circularize: true });

  it('reproduces the four NEBuilder primers exactly', () => {
    expect(design.findings).toEqual([]);
    const sequences = Object.fromEntries(design.primers.map(primer => [primer.name, (primer.overlap + primer.spacer + primer.anneal).toLowerCase()]));
    expect(sequences).toEqual({
      NewFragment1_fwd: 'ctacgtccagggtaccgagctcgaattcac',
      NewFragment1_rev: 'tgctcaccataccgtgcatctgccagtttg',
      NewFragment_fwd: 'gatgcacggtatggtgagcaagggcgag',
      NewFragment_rev: 'gctcggtaccctggacgtagccttcggg',
    });
  });

  it('reports the NEBuilder anneal Tm and Ta for each fragment', () => {
    const byName = Object.fromEntries(design.primers.map(primer => [primer.name, [primer.tm, primer.ta]]));
    expect(byName).toEqual({
      NewFragment1_fwd: [65.4, 66.4],
      NewFragment1_rev: [68.6, 66.4],
      NewFragment_fwd: [68.1, 69.1],
      NewFragment_rev: [68.1, 69.1],
    });
  });

  it('splits each 20 nt overlap 10 + 10 and assembles 568 bp', () => {
    expect(design.junctions).toHaveLength(2);
    for (const junction of design.junctions) {
      expect(junction.mode).toBe('split');
      expect(junction.overlapLength).toBe(20);
    }
    expect(design.product).toHaveLength(VECTOR.length + GFP.length);
    expect(design.product).toBe(VECTOR + GFP);
  });
});
