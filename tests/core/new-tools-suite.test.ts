import { describe, it, expect } from 'vitest';
import {
  computeKav,
  estimateStokesRadius,
  fitSecCalibration,
  predictFromVe,
  predictVeFromMw,
  PRESET_COLUMNS,
  DEFAULT_STANDARDS_S200,
} from '@/core/sec';
import {
  revComp,
  calcTm,
  calcGc,
  cleanDna as cleanGibsonDna,
  designAssembly,
} from '@/core/gibson';
import {
  cleanDna as cleanMutagenesisDna,
  translateDna,
  extractOrfCodons,
  designSiteDirectedMutagenesis,
  GENETIC_CODE,
  PREFERRED_CODONS_ECOLI,
  parseMutationList,
  generateMutatedSequence,
  designBatchMutations,
} from '@/core/mutagenesis';
import {
  evaluateMwco,
  simulateUltrafiltration,
  simulateDialysis,
  COMMON_SOLUTES,
} from '@/core/diafiltration';
import {
  analyzeCodonUsage,
  HOST_NAMES,
} from '@/core/rare-codons';

describe('SEC Core Logic', () => {
  it('calculates Kav correctly', () => {
    // Column with V0 = 7.5, Vt = 24.0
    // Ve = 7.5 -> Kav = 0
    expect(computeKav(7.5, 7.5, 24.0)).toBeCloseTo(0.0, 4);
    // Ve = 24.0 -> Kav = 1
    expect(computeKav(24.0, 7.5, 24.0)).toBeCloseTo(1.0, 4);
    // Ve = 15.75 -> Kav = (15.75 - 7.5)/(24 - 7.5) = 8.25 / 16.5 = 0.5
    expect(computeKav(15.75, 7.5, 24.0)).toBeCloseTo(0.5, 4);
  });

  it('calculates Stokes radius from globular molecular weight', () => {
    // 66 kDa BSA -> ~2.6 nm
    const rhBsa = estimateStokesRadius(66000);
    expect(rhBsa.nm).toBeGreaterThan(2.0);
    expect(rhBsa.nm).toBeLessThan(4.0);
    expect(rhBsa.angstrom).toBeCloseTo(rhBsa.nm * 10, 2);
  });

  it('fits standard curve with high R² and predicts apparent MW and elution volume', () => {
    const v0 = 7.5;
    const vt = 24.0;
    const fit = fitSecCalibration(DEFAULT_STANDARDS_S200, v0, vt);
    expect(fit).not.toBeNull();
    if (!fit) return;

    expect(fit.rSquared).toBeGreaterThan(0.95);
    expect(fit.slope).toBeLessThan(0); // Kav increases as MW decreases

    // Predict for known standard: Ovalbumin (44 kDa, Ve = 14.5 mL)
    const pred = predictFromVe(14.5, fit, 44000);
    expect(pred.apparentMwkDa).toBeGreaterThan(30);
    expect(pred.apparentMwkDa).toBeLessThan(60);
    expect(pred.oligomericRatio).toBeCloseTo(1.0, 0);

    // Predict Ve for 44 kDa
    const expected = predictVeFromMw(44000, fit);
    expect(expected.elutionVolumeMl).toBeCloseTo(14.5, 0);
  });

  it('contains expected column presets', () => {
    expect(PRESET_COLUMNS.length).toBeGreaterThan(5);
    const s200 = PRESET_COLUMNS.find(c => c.id === 's200_10_300');
    expect(s200).toBeTruthy();
    expect(s200?.bedVolume).toBe(24);
  });
});

describe('Gibson Assembly Core Logic', () => {
  it('computes reverse complement accurately', () => {
    expect(revComp('ATGC')).toBe('GCAT');
    expect(revComp('AATTCCGG')).toBe('CCGGAATT');
  });

  it('calculates GC content and Nearest-Neighbor Tm', () => {
    const gc = calcGc('GCGCATAT');
    expect(gc).toBe(50);

    // ~20 bp oligo should have Tm in realistic range (50-65°C)
    const tm = calcTm('GGTACCGAGCTCGAATTCAC');
    expect(tm).toBeGreaterThan(50);
    expect(tm).toBeLessThan(70);
  });

  it('designs primers with 5 prime homology overhangs and matching 3 prime annealing regions', () => {
    const vector = {
      id: 'vector',
      name: 'Vector',
      sequence: 'GGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAAAACCCTGGCGTTACCCAACTTAATCGCCTTGCAGCACATCCCCCTTTCGCCAGCTGGCGTAATAGCGAAGAGGCCCGCACCGATCGCCCTTCCCAACAGTTGCGCAGCCTGAATGGCGAATGGCGCTTTGCCTGGTTTCCGGCACCAGAAGCGGTGCCGGAAAGCTGGCTGGAGTGCGATCTTCCTGAGGCCGATACTGTCGTCGTCCCCTCAAACTGGCAGATGCACGGT',
    };
    const insert = {
      id: 'insert',
      name: 'Insert_GFP',
      sequence: 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG',
    };

    const res = designAssembly(vector, [insert], 'gibson', 25, 60);

    expect(res.junctions.length).toBe(2);
    expect(res.primers.length).toBe(2); // 2 primers for insert

    // Check primer structure
    for (const p of res.primers) {
      expect(p.fullSequence.length).toBeGreaterThan(p.annealSeq.length);
      expect(p.fullSequence.endsWith(p.annealSeq)).toBe(true);
      expect(p.annealTm).toBeGreaterThan(45);
    }

    // Circular assembly length equals sum of fragment lengths
    const cleanVec = cleanGibsonDna(vector.sequence);
    const cleanIns = cleanGibsonDna(insert.sequence);
    expect(res.assembledLength).toBe(cleanVec.length + cleanIns.length);
  });
});

describe('Site-Directed Mutagenesis Core Logic', () => {
  it('translates codons according to standard genetic code', () => {
    expect(GENETIC_CODE['ATG']).toBe('M');
    expect(GENETIC_CODE['TAA']).toBe('*');
    expect(GENETIC_CODE['GAG']).toBe('E');
    expect(GENETIC_CODE['AGC']).toBe('S');
    expect(GENETIC_CODE['ACC']).toBe('T');

    expect(translateDna('ATGGTGTAG')).toBe('MV*');
  });

  it('cleans DNA and extracts full reading frame codons', () => {
    const raw = 'atg gtg agc aag ggc gag gag ctg \n 123';
    const clean = cleanMutagenesisDna(raw);
    expect(clean).toBe('ATGGTGAGCAAGGGCGAGGAGCTG');
    const codons = extractOrfCodons('ATGGTGTAG');
    expect(codons.length).toBe(3);
    expect(codons[0]!.wtAa).toBe('M');
    expect(codons[1]!.wtAa).toBe('V');
    expect(codons[2]!.wtAa).toBe('*');
  });

  it('designs back-to-back non-overlapping primers with Q5 Ta recommendation and correct reverse primer orientation', () => {
    const seq = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';
    // Codon 2 starts at bp index 6 (0-indexed). Original codon is AGC (Ser). Let's mutate it to Thr (ACC)
    const targetCodon = PREFERRED_CODONS_ECOLI['T']!; // ACC
    const result = designSiteDirectedMutagenesis(seq, 6, targetCodon, 3, 62, 'GFP', 'S3T');

    expect(result.wtCodon).toBe('AGC');
    expect(result.wtAa).toBe('S');
    expect(result.mutCodon).toBe('ACC');
    expect(result.mutAa).toBe('T');

    // Named primers
    expect(result.forwardPrimer.name).toBe('GFP_S3T_Fwd');
    expect(result.reversePrimer.name).toBe('GFP_S3T_Rev');

    // Forward and reverse primers must be non-overlapping (back-to-back)
    expect(result.forwardPrimer.sequence.length).toBeGreaterThan(15);
    expect(result.reversePrimer.sequence.length).toBeGreaterThan(15);

    // Forward primer 5' starts with mutation (ACC)
    expect(result.forwardPrimer.sequence.startsWith('ACC')).toBe(true);

    // Reverse primer 5' must be directly adjacent to bp index 6 on template (i.e. bp 5 = G).
    // Complement of G is C, so reverse primer 5' base MUST be C!
    expect(result.reversePrimer.sequence[0]).toBe('C');

    // Q5 recommended Ta is Tm(lower) + 3°C
    const minTm = Math.min(result.forwardPrimer.tm, result.reversePrimer.tm);
    expect(Math.abs(result.recommendedTa - (minTm + 3))).toBeLessThanOrEqual(1.0);

    // Mutated plasmid has exact same length as original for single codon point mutation
    expect(result.mutantPlasmidSeq.length).toBe(seq.length);
  });

  it('designs batch point mutations with named primers and IDT CSV format', () => {
    const seq = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';
    const batch = designBatchMutations(seq, 'S3T, K4E', {
      constructName: 'GFP',
      targetPrimerTm: 62,
    });

    expect(batch.constructName).toBe('GFP');
    expect(batch.items.length).toBe(2);

    const s3t = batch.items[0]!;
    expect(s3t.valid).toBe(true);
    expect(s3t.fwdPrimerName).toBe('GFP_S3T_Fwd');
    expect(s3t.revPrimerName).toBe('GFP_S3T_Rev');
    expect(s3t.fwdPrimerSeq?.startsWith('ACC')).toBe(true);

    const k4e = batch.items[1]!;
    expect(k4e.valid).toBe(true);
    expect(k4e.fwdPrimerName).toBe('GFP_K4E_Fwd');
    expect(k4e.revPrimerName).toBe('GFP_K4E_Rev');

    // Check IDT bulk CSV
    expect(batch.idtBulkCsv).toContain('Name,Sequence,Scale,Purification');
    expect(batch.idtBulkCsv).toContain('GFP_S3T_Fwd');
    expect(batch.idtBulkCsv).toContain('GFP_S3T_Rev');
    expect(batch.idtBulkCsv).toContain('GFP_K4E_Fwd');
    expect(batch.idtBulkCsv).toContain('GFP_K4E_Rev');
  });

  it('parses biochemical mutation lists like A22Y and Ala22Tyr', () => {
    const list = parseMutationList('A22Y, Y443H, p.Ala65Thr, S65T');
    expect(list.length).toBe(4);
    expect(list[0]).toEqual({ raw: 'A22Y', wtAa: 'A', position: 22, mutAa: 'Y', valid: true });
    expect(list[1]).toEqual({ raw: 'Y443H', wtAa: 'Y', position: 443, mutAa: 'H', valid: true });
    expect(list[2]).toEqual({ raw: 'p.Ala65Thr', wtAa: 'A', position: 65, mutAa: 'T', valid: true });
    expect(list[3]).toEqual({ raw: 'S65T', wtAa: 'S', position: 65, mutAa: 'T', valid: true });
  });

  it('generates mutated DNA and protein sequence preview', () => {
    const dna = 'ATGGTGAGCAAGGGC'; // MVskG
    const res = generateMutatedSequence(dna, 6, 3, 'ACC'); // mutate codon 3 (AGC -> ACC, S -> T)
    expect(res.mutatedDna).toBe('ATGGTGACCAAGGGC');
    expect(res.originalProtein).toBe('MVSKG');
    expect(res.mutatedProtein).toBe('MVTKG');
    expect(res.mutationWindow.wtSegment).toContain('AGC');
    expect(res.mutationWindow.mutSegment).toContain('ACC');
  });
});

describe('Diafiltration & Dialysis Core Logic', () => {
  it('evaluates MWCO 3x safety rule', () => {
    // 30 kDa protein with 10 kDa MWCO (ratio = 3) -> safe
    const safeEval = evaluateMwco(30, 10);
    expect(safeEval.status).toBe('safe');
    expect(safeEval.ratio).toBe(3);

    // 30 kDa protein with 30 kDa MWCO (ratio = 1) -> high loss
    const unsafeEval = evaluateMwco(30, 30);
    expect(unsafeEval.status).toBe('high_loss');
  });

  it('simulates centrifugal ultrafiltration DFV clearance kinetics', () => {
    // Imidazole removal: 15 mL initial -> 1 mL concentrate (15x concentration per cycle)
    const imidazole = COMMON_SOLUTES.find(s => s.id === 'imidazole')!;
    const sim = simulateUltrafiltration(15, 1, 3, imidazole);

    // 3 cycles with 14 mL buffer added each cycle: DFV = (14*3)/1 = 42
    expect(sim.cycles.length).toBe(3);
    expect(sim.finalConc).toBeLessThan(1.0); // 300 mM -> < 0.1 mM
    expect(sim.cycles[2]!.removalPct).toBeGreaterThan(99.9);
  });

  it('simulates equilibrium dialysis kinetics across bath exchanges', () => {
    const nacl = COMMON_SOLUTES.find(s => s.id === 'nacl')!;
    // 3 mL sample, 1000 mL bath, 3 changes
    const sim = simulateDialysis(3, 1000, 3, nacl);

    expect(sim.steps.length).toBe(3);
    expect(sim.finalConc).toBeLessThan(160); // Approaches 150 mM buffer conc
    expect(sim.steps[2]!.removalPct).toBeGreaterThan(99.9);
  });
});

describe('Rare Codons Core Logic', () => {
  it('analyzes rare codons, CAI, and identifies ribosomal pause clusters', () => {
    // Sequence with clustered rare arginine codons (AGG, AGA) in E. coli
    const testDna = 'ATGAGGAGAAGACGGATAATGCGGAGGAGACGTTAA';
    const analysis = analyzeCodonUsage(testDna, 'ecoli');

    expect(analysis.totalCodons).toBe(testDna.length / 3);
    expect(analysis.cai).toBeLessThan(0.7); // Low CAI due to rare arginines
    expect(analysis.rareCodonCount).toBeGreaterThan(4);
    expect(analysis.pauseClusters.length).toBeGreaterThan(0);

    // Recommended host should be Rosetta
    expect(analysis.strainRecommendation.recommendedStrain).toMatch(/rosetta/i);

    // Synonymous optimized DNA should have higher CAI
    const optAnalysis = analyzeCodonUsage(analysis.optimizedDna, 'ecoli');
    expect(optAnalysis.cai).toBeGreaterThan(analysis.cai);
    expect(optAnalysis.cai).toBeGreaterThan(0.9);
  });

  it('supports multiple host organisms and organism-specific tables', () => {
    expect(Object.keys(HOST_NAMES)).toContain('ecoli');
    expect(Object.keys(HOST_NAMES)).toContain('yeast');
    expect(Object.keys(HOST_NAMES)).toContain('human');
    expect(Object.keys(HOST_NAMES)).toContain('insect');

    // CGA is rare in yeast (<10% threshold), while standard in other organisms
    const testDna = 'ATGCGACGACGACGATAA';
    const yeastAnalysis = analyzeCodonUsage(testDna, 'yeast');
    const humanAnalysis = analyzeCodonUsage(testDna, 'human');

    expect(yeastAnalysis.host).toBe('yeast');
    expect(humanAnalysis.host).toBe('human');
    expect(yeastAnalysis.cai).toBeDefined();
    expect(humanAnalysis.cai).toBeDefined();
    // CGA is much rarer in yeast than in human
    expect(yeastAnalysis.rareCodonCount).toBeGreaterThan(0);
  });
});
