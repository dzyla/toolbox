import { describe, it, expect } from 'vitest';
import {
  getStackThermodynamics,
  calcTerminalStability,
  getHairpinLoopPenalty,
  detectHairpins,
  detectDimers,
  calcTa,
  analyzePrimer,
  analyzePrimerPair,
  exportOrderingSheet,
} from '@/core/nucleic/primers';

describe('Primer QC & PCR Suite: Thermodynamics & Stacking', () => {
  it('computes exact nearest-neighbor parameters from SantaLucia 1998 Table 2', () => {
    // GC/CG: dH = -9.8 kcal/mol, dS = -24.4 cal/(mol·K)
    // dG37 = -9.8 - 310.15 * (-0.0244) = -2.23234 kcal/mol
    const gcStack = getStackThermodynamics('G', 'C');
    expect(gcStack.dH).toBe(-9.8);
    expect(gcStack.dS).toBe(-24.4);
    expect(gcStack.dG37).toBeCloseTo(-2.232, 3);

    // CG/GC: dH = -10.6, dS = -27.2 cal/(mol·K)
    // dG37 = -10.6 - 310.15 * (-0.0272) = -2.16392 kcal/mol
    const cgStack = getStackThermodynamics('C', 'G');
    expect(cgStack.dH).toBe(-10.6);
    expect(cgStack.dS).toBe(-27.2);
    expect(cgStack.dG37).toBeCloseTo(-2.164, 3);

    // AA/TT: dH = -7.9, dS = -22.2 cal/(mol·K)
    // dG37 = -7.9 - 310.15 * (-0.0222) = -1.01467 kcal/mol
    const aaStack = getStackThermodynamics('A', 'A');
    expect(aaStack.dH).toBe(-7.9);
    expect(aaStack.dS).toBe(-22.2);
    expect(aaStack.dG37).toBeCloseTo(-1.015, 3);
  });
});

describe('Primer QC: 3\' Terminal Stability & GC Clamp', () => {
  it('calculates exact 3\' terminal 5-mer stability pinned to SantaLucia 1998', () => {
    // Sequence ending in GCGCG: 4 stacks (GC + CG + GC + CG)
    // dG37 = 2 * (-2.23234) + 2 * (-2.16392) = -8.79252 kcal/mol
    const resGC = calcTerminalStability('ATCGATCGATCGCGCG');
    expect(resGC.terminalSequence).toBe('GCGCG');
    expect(resGC.deltaG).toBeCloseTo(-8.79, 2);
    expect(resGC.gcCount).toBe(5);
    expect(resGC.gcPercent).toBe(100);
    expect(resGC.gcClampStatus).toBe('risky'); // > 3 G/C
    expect(resGC.isRisky).toBe(true);

    // Sequence ending in AAAAA: 4 stacks of AA/TT
    // dG37 = 4 * (-1.01467) = -4.05868 kcal/mol
    const resA = calcTerminalStability('ATCGATCGATCAAAAA');
    expect(resA.terminalSequence).toBe('AAAAA');
    expect(resA.deltaG).toBeCloseTo(-4.06, 2);
    expect(resA.gcCount).toBe(0);
    expect(resA.gcClampStatus).toBe('poor'); // 0 G/C
    expect(resA.warnings.some(w => w.includes('0 G/C'))).toBe(true);

    // Sequence ending in ATATA: TA + AT + TA + AT
    // TA: -7.2 - 310.15 * (-0.0213) = -0.5938
    // AT: -7.2 - 310.15 * (-0.0204) = -0.8729
    // sum = 2 * (-0.5938) + 2 * (-0.8729) = -2.933 kcal/mol
    const resAT = calcTerminalStability('ATCGATCGATCATATA');
    expect(resAT.terminalSequence).toBe('ATATA');
    expect(resAT.deltaG).toBeCloseTo(-2.93, 2);
    expect(resAT.gcClampStatus).toBe('poor');
  });

  it('evaluates GC clamp status: optimal (1-3), poor (0), risky (>3)', () => {
    // Optimal: 2 G/C in terminal 5 nt (e.g. AAGCT)
    const optRes = calcTerminalStability('TGACGACATAAGCT');
    expect(optRes.gcCount).toBe(2);
    expect(optRes.gcClampStatus).toBe('optimal');
    expect(optRes.isRisky).toBe(false);

    // Poor: 0 G/C (e.g. AATTA)
    const poorRes = calcTerminalStability('TGACGACATAATTA');
    expect(poorRes.gcCount).toBe(0);
    expect(poorRes.gcClampStatus).toBe('poor');

    // Risky: 4 G/C (e.g. GCGCC)
    const riskyRes = calcTerminalStability('TGACGACATGCGCC');
    expect(riskyRes.gcCount).toBe(5);
    expect(riskyRes.gcClampStatus).toBe('risky');
    expect(riskyRes.isRisky).toBe(true);

    // Flags deltaG <= -9 kcal/mol
    const flagRes = calcTerminalStability('TGACGACATGCGCC', 5, -8.0);
    expect(flagRes.isRisky).toBe(true);
    expect(flagRes.warnings.some(w => w.includes("3' terminal stability"))).toBe(true);
  });
});

describe('Primer QC: Hairpin Detection', () => {
  it('uses SantaLucia & Hicks 2004 loop penalties', () => {
    expect(getHairpinLoopPenalty(3).dG37).toBe(3.5);
    expect(getHairpinLoopPenalty(4).dG37).toBe(3.5);
    expect(getHairpinLoopPenalty(5).dG37).toBe(4.0);
    expect(getHairpinLoopPenalty(6).dG37).toBe(4.3);
    expect(getHairpinLoopPenalty(2).dG37).toBe(Infinity); // < 3 nt loop sterically prohibited
  });

  it('detects inverted repeats and calculates folding deltaG with loop penalty', () => {
    // Primer containing GCGCG stem (5 bp), TTTT loop (4 nt), and complementary CGCGC stem (5 bp):
    // 5'-AAAA GCGCG TTTT CGCGC AAAA-3'
    // Flanks AAAA and AAAA do not pair (A pairs with T).
    // Stem NN dG: 4 stacks of GC/CG: -8.79 kcal/mol
    // Loop penalty for 4 nt: +3.5 kcal/mol
    // Closing pair is GC (closing5='G', closing3='C' -> no closing AT penalty)
    // Net folding deltaG = -8.79 + 3.5 = -5.29 kcal/mol
    const seq = 'AAAAGCGCGTTTTCGCGCAAAA';
    const hp = detectHairpins(seq);

    expect(hp.hasHairpin).toBe(true);
    expect(hp.isRisky).toBe(true); // <= -3.0 kcal/mol
    expect(hp.worstDeltaG).toBeCloseTo(-5.29, 1);
    expect(hp.primaryHairpin).not.toBeNull();
    expect(hp.primaryHairpin?.stemLength).toBe(5);
    expect(hp.primaryHairpin?.loopLength).toBe(4);
    expect(hp.primaryHairpin?.stem5Seq).toBe('GCGCG');
    expect(hp.primaryHairpin?.stem3Seq).toBe('CGCGC');
    expect(hp.warnings.some(w => w.includes('Stable hairpin predicted'))).toBe(true);
  });

  it('returns no hairpin for sequences without inverted repeats', () => {
    // A sequence with only A and C cannot form Watson-Crick base pairs (requires T and G)
    const seq = 'AAAAAACCCCCCCCAAAAAA';
    const hp = detectHairpins(seq);
    expect(hp.hasHairpin).toBe(false);
    expect(hp.isRisky).toBe(false);
  });
});

describe('Primer QC: Self-Dimer & Hetero-Dimer Detection', () => {
  it('detects 3\' self-dimer and flags extension risk', () => {
    // Primer ending in a self-complementary 3' sequence: e.g. GCGC (or CGCGCG)
    // 5'-ATCGATCGATCGCGCG-3'
    // In an antiparallel duplex, the 3' CGCGCG pairs with another molecule's 3' CGCGCG!
    const seq = 'ATCGATCGATCGCGCG';
    const dimer = detectDimers(seq, seq, 'P1', 'P1');

    expect(dimer.hasDimer).toBe(true);
    expect(dimer.is3PrimeEndRisky).toBe(true);
    expect(dimer.endDeltaG).toBeLessThan(-5.0);
    expect(dimer.endAlignment).not.toBeNull();
    expect(dimer.endAlignment?.involves3PrimeEnd).toBe(true);
    expect(dimer.warnings.some(w => w.includes("3' primer dimer"))).toBe(true);
  });

  it('detects cross-dimers between forward and reverse primers', () => {
    // Forward primer ending in 3'-GCTAG-5' complement, Reverse primer ending in 3'-CTAGC-5'
    // Fwd: 5'-TGACCGGCA GCTAGC-3'
    // Rev: 5'-GATGCCTTG GCTAGC-3'
    // GCTAGC is palindromic (reverse complement of GCTAGC is GCTAGC).
    // Both 3' ends will hybridize!
    const fwd = 'TGACCGGCAGCTAGC';
    const rev = 'GATGCCTTGGCTAGC';
    const cross = detectDimers(fwd, rev, 'Fwd', 'Rev');

    expect(cross.hasDimer).toBe(true);
    expect(cross.is3PrimeEndRisky).toBe(true);
    expect(cross.endAlignment?.matchLength).toBe(6);
  });
});

describe('Annealing Temperature (Ta) & Reaction Conditions', () => {
  it('computes Ta for Taq and Phusion/Q5 according to standard formulas', () => {
    // Taq: min(Tm1, Tm2) - 5 °C
    // Phusion/Q5: 0.893 * min(Tm1, Tm2) - 4.49 °C
    const tm1 = 60.0;
    const tm2 = 64.0;
    const ta = calcTa(tm1, tm2);

    expect(ta.minTm).toBe(60.0);
    expect(ta.taTaq).toBe(55.0);
    // 0.893 * 60 - 4.49 = 53.58 - 4.49 = 49.09 -> 49.1 °C
    expect(ta.taQ5).toBeCloseTo(49.1, 1);

    // Equal Tms
    const taSingle = calcTa(65.0);
    expect(taSingle.taTaq).toBe(60.0);
    // 0.893 * 65 - 4.49 = 58.045 - 4.49 = 53.555 -> 53.6 °C
    expect(taSingle.taQ5).toBeCloseTo(53.6, 1);
  });
});

describe('Comprehensive Primer & Primer Pair Analysis', () => {
  it('performs full primer QC with accurate nearest-neighbor Tm', () => {
    // Standard 20-mer primer
    const seq = 'TGACCGGCAGCAAAATGTTG';
    const analysis = analyzePrimer(seq, 'Fwd_Test', {
      primerNM: 250,
      naMM: 50,
      mgMM: 1.5,
      dntpMM: 0.8,
    });

    expect(analysis.length).toBe(20);
    expect(analysis.gcPercent).toBe(50.0);
    expect(analysis.tm).toBeGreaterThan(50);
    expect(analysis.tm).toBeLessThan(65);
    expect(analysis.terminalStability).toBeDefined();
    expect(analysis.hairpin).toBeDefined();
    expect(analysis.selfDimer).toBeDefined();
    expect(analysis.qualityScore).toBeGreaterThanOrEqual(70);
  });

  it('evaluates primer pair with Tm difference and cross-dimer warning', () => {
    const fwd = 'TGACCGGCAGCAAAATGTTG'; // Tm ~ 58 °C
    const rev = 'GCGCGCCCGGGCCCGCCGCG'; // very high Tm > 75 °C
    const pair = analyzePrimerPair(fwd, rev, 'Fwd', 'Rev');

    expect(pair.tmDiff).toBeGreaterThan(3.0);
    expect(pair.isTmDiffOptimal).toBe(false);
    expect(pair.pairWarnings.some(w => w.includes('Tm difference'))).toBe(true);
    expect(pair.overallStatus).not.toBe('optimal');
  });
});

describe('Export Ordering Sheet (TSV / CSV)', () => {
  it('formats TSV and CSV ordering sheets correctly', () => {
    const fwd = analyzePrimer('TGACCGGCAGCAAAATGTTG', 'Fwd_Ex');
    const rev = analyzePrimer('GTCGGTACCAAGTGTCACCA', 'Rev_Ex');

    const tsv = exportOrderingSheet([fwd, rev], 'tsv', { scale: '25nm', purification: 'STD' });
    const tsvLines = tsv.trim().split('\n');
    expect(tsvLines[0]).toBe('Well\tName\tSequence\tLength\tTm (°C)\tGC%\tScale\tPurification\tNotes');
    expect(tsvLines[1]).toContain('A01\tFwd_Ex\tTGACCGGCAGCAAAATGTTG\t20\t');
    expect(tsvLines[2]).toContain('A02\tRev_Ex\tGTCGGTACCAAGTGTCACCA\t20\t');

    const csv = exportOrderingSheet([fwd, rev], 'csv');
    const csvLines = csv.trim().split('\n');
    expect(csvLines[0]).toContain('"Well","Name","Sequence"');
    expect(csvLines[1]).toContain('"A01","Fwd_Ex","TGACCGGCAGCAAAATGTTG"');
  });
});
