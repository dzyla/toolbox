import { describe, it, expect } from 'vitest';
import { designAssembly, calcTm } from '@/core/gibson';

describe('NEBuilder HiFi & Gibson Assembly Benchmark', () => {
  const DEMO_VECTOR = 'GGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAAAACCCTGGCGTTACCCAACTTAATCGCCTTGCAGCACATCCCCCTTTCGCCAGCTGGCGTAATAGCGAAGAGGCCCGCACCGATCGCCCTTCCCAACAGTTGCGCAGCCTGAATGGCGAATGGCGCTTTGCCTGGTTTCCGGCACCAGAAGCGGTGCCGGAAAGCTGGCTGGAGTGCGATCTTCCTGAGGCCGATACTGTCGTCGTCCCCTCAAACTGGCAGATGCACGGT';
  const DEMO_INSERT_GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

  it('reproduces NEBuilder HiFi #E5520 benchmark primers exactly', () => {
    // Fragment 1: Vector (named "NewFragment1")
    // Fragment 0: GFP Insert (named "NewFragment")
    const vector = { id: 'frag1', name: 'NewFragment1', sequence: DEMO_VECTOR };
    const insert = { id: 'frag0', name: 'NewFragment', sequence: DEMO_INSERT_GFP };

    const res = designAssembly(vector, [insert], {
      method: 'nebuilder',
      overlapLen: 20,
      circularize: true,
      polymerase: 'q5',
      primerConcentrationNm: 500,
      minPrimerLen: 18,
      maxPrimerTmDiff: 5.0,
    });

    expect(res.primers.length).toBe(4);

    const f1Fwd = res.primers.find(p => p.name === 'NewFragment1_fwd');
    const f1Rev = res.primers.find(p => p.name === 'NewFragment1_rev');
    const f0Fwd = res.primers.find(p => p.name === 'NewFragment_fwd');
    const f0Rev = res.primers.find(p => p.name === 'NewFragment_rev');

    expect(f1Fwd).toBeDefined();
    expect(f1Rev).toBeDefined();
    expect(f0Fwd).toBeDefined();
    expect(f0Rev).toBeDefined();

    // Verify exact sequences from official NEBuilder benchmark
    expect(f1Fwd!.fullSequence).toBe('ctacgtccagggtaccgagctcgaattcac');
    expect(f1Fwd!.totalLength).toBe(30);

    expect(f1Rev!.fullSequence).toBe('tgctcaccataccgtgcatctgccagtttg');
    expect(f1Rev!.totalLength).toBe(30);

    expect(f0Fwd!.fullSequence).toBe('gatgcacggtatggtgagcaagggcgag');
    expect(f0Fwd!.totalLength).toBe(28);

    expect(f0Rev!.fullSequence).toBe('gctcggtaccctggacgtagccttcggg');
    expect(f0Rev!.totalLength).toBe(28);

    // Verify junction overlaps
    expect(res.junctions.length).toBe(2);
    for (const j of res.junctions) {
      expect(j.overlapLength).toBe(20);
      expect(j.overlapTm).toBeGreaterThan(60);
    }
  });

  it('preserves backward compatibility with legacy Gibson positional call', () => {
    const vector = { id: 'vec', name: 'pUC19', sequence: DEMO_VECTOR };
    const insert = { id: 'ins', name: 'GFP', sequence: DEMO_INSERT_GFP };

    const res = designAssembly(vector, [insert], 'gibson', 25, 60);
    expect(res.method).toBe('gibson');
    expect(res.junctions.length).toBe(2);
    expect(res.primers.length).toBe(2);
    expect(res.assembledLength).toBe(DEMO_VECTOR.length + DEMO_INSERT_GFP.length);
  });
});
