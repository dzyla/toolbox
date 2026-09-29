import { describe, it, expect } from 'vitest';
import {
  computeKav,
  estimateStokesRadius,
  GLOBULAR_FRICTIONAL_RATIO,
  fitSecCalibration,
  secCalibrationIssue,
  predictFromVe,
  predictVeFromMw,
  PRESET_COLUMNS,
  DEFAULT_STANDARDS_S200,
} from '@/core/sec';
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

  it('computes Erickson minimal radius and a globular Stokes radius estimate', () => {
    // Erickson 2009: Rmin = 0.066 × M^(1/3) nm. BSA (66,400 Da) -> Rmin 2.67 nm.
    const bsa = estimateStokesRadius(66400);
    expect(bsa.minimalNm).toBeCloseTo(2.67, 2);
    expect(bsa.nm).toBeCloseTo(bsa.minimalNm * GLOBULAR_FRICTIONAL_RATIO, 10);
    expect(bsa.angstrom).toBeCloseTo(bsa.nm * 10, 10);
    // Measured BSA Rs is ~3.5 nm; Rmin alone (2.67 nm) under-reports it by ~25%.
    expect(bsa.nm).toBeGreaterThan(3.2);
    expect(bsa.nm).toBeLessThan(3.6);
  });

  it('estimates Stokes radius within 15% of published values for compact globular standards', () => {
    // Compact globular calibration standards with Stokes radii from the SEC standard table.
    const globular = DEFAULT_STANDARDS_S200.filter(s =>
      ['aldolase', 'conalbumin', 'ovalbumin', 'carbonic'].includes(s.id),
    );
    expect(globular).toHaveLength(4);
    for (const { mwDa: mw, stokesRadiusNm: rs } of globular) {
      if (rs === undefined) throw new Error('standard is missing its Stokes radius');
      const est = estimateStokesRadius(mw).nm;
      expect(Math.abs(est - rs) / rs).toBeLessThan(0.15);
    }
  });

  it('returns zero radius for non-positive molecular weight', () => {
    expect(estimateStokesRadius(0).nm).toBe(0);
    expect(estimateStokesRadius(-5).minimalNm).toBe(0);
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

  it('rejects calibrations that cannot be inverted to MW', () => {
    const std = (id: string, mwDa: number, elutionVolumeMl: number) => ({ id, name: id, mwDa, elutionVolumeMl, enabled: true });
    // Reversed elution order: larger standards elute later -> positive slope.
    const reversed = [std('a', 10000, 10), std('b', 100000, 15), std('c', 500000, 18)];
    expect(fitSecCalibration(reversed, 7.5, 24)).toBeNull();
    expect(secCalibrationIssue(reversed, 7.5, 24)).toMatch(/slope/i);
    // Vt must exceed V0.
    expect(computeKav(12, 24, 7.5)).toBeNaN();
    expect(secCalibrationIssue(DEFAULT_STANDARDS_S200, 24, 7.5)).toMatch(/Vt/);
    // Too few standards.
    expect(secCalibrationIssue([std('a', 10000, 15)], 7.5, 24)).toMatch(/two standards/);
    // A valid calibration has no issue.
    expect(secCalibrationIssue(DEFAULT_STANDARDS_S200, 7.5, 24)).toBeNull();
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
