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

  it('designs back-to-back non-overlapping primers with Q5 Ta recommendation', () => {
    const seq = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';
    // Codon 2 starts at bp index 6 (0-indexed). Original codon is AGC (Ser). Let's mutate it to Thr (ACC)
    const targetCodon = PREFERRED_CODONS_ECOLI['T']!; // ACC
    const result = designSiteDirectedMutagenesis(seq, 6, targetCodon, 3, 62);

    expect(result.wtCodon).toBe('AGC');
    expect(result.wtAa).toBe('S');
    expect(result.mutCodon).toBe('ACC');
    expect(result.mutAa).toBe('T');

    // Forward and reverse primers must be non-overlapping (back-to-back)
    expect(result.forwardPrimer.sequence.length).toBeGreaterThan(15);
    expect(result.reversePrimer.sequence.length).toBeGreaterThan(15);

    // Q5 recommended Ta is Tm(lower) + 3°C
    const minTm = Math.min(result.forwardPrimer.tm, result.reversePrimer.tm);
    expect(Math.abs(result.recommendedTa - (minTm + 3))).toBeLessThanOrEqual(1.0);

    // Mutated plasmid has exact same length as original for single codon point mutation
    expect(result.mutantPlasmidSeq.length).toBe(seq.length);
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

  it('supports multiple host organisms', () => {
    expect(Object.keys(HOST_NAMES)).toContain('ecoli');
    expect(Object.keys(HOST_NAMES)).toContain('yeast');
    expect(Object.keys(HOST_NAMES)).toContain('human');
  });
});
