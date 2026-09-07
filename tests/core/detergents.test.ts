import { describe, expect, it } from 'vitest';
import {
  AVOGADRO,
  DETERGENT_DATABASE,
  DETERGENT_LIST,
  DetergentError,
  assessDialyzability,
  calculateComplexMw,
  calculateDetergentProteinRatio,
  calculateMicelles,
  calculateStockDilution,
  convertConcentration,
  mgMlToMm,
  mgMlToPercent,
  KnownDetergentId,
  mmToMgMl,
  mmToPercent,
  partitionDetergent,
  percentToMgMl,
  percentToMm,
} from '@/core/detergents';

describe('Detergent Database & Literature Values', () => {
  it('contains all 9 benchmark detergents from literature', () => {
    const expectedIds: KnownDetergentId[] = [
      'ddm',
      'lmng',
      'og',
      'ng',
      'dm',
      'chaps',
      'digitonin',
      'triton_x100',
      'tween_20',
    ];
    expect(DETERGENT_LIST.length).toBe(9);
    for (const id of expectedIds) {
      expect(DETERGENT_DATABASE[id]).toBeDefined();
    }
  });

  it('matches published parameters for DDM (Seddon 2004, Anatrace)', () => {
    const ddm = DETERGENT_DATABASE.ddm;
    expect(ddm.molecularWeight).toBe(510.6);
    expect(ddm.cmcMm).toBe(0.17);
    expect(ddm.cmcPct).toBeCloseTo(0.0087, 4);
    expect(ddm.aggregationNumber).toBe(110);
    expect(ddm.micelleMwKDa).toBe(56.0);
    expect(ddm.dialyzability).toBe('non_dialyzable');
  });

  it('matches published parameters for LMNG (Anatrace 2020)', () => {
    const lmng = DETERGENT_DATABASE.lmng;
    expect(lmng.molecularWeight).toBe(1005.2);
    expect(lmng.cmcMm).toBe(0.01);
    expect(lmng.cmcPct).toBeCloseTo(0.001, 4);
    expect(lmng.aggregationNumber).toBe(70);
    expect(lmng.micelleMwKDa).toBe(70.0);
    expect(lmng.dialyzability).toBe('non_dialyzable');
  });

  it('matches published parameters for OG (le Maire 2000, Anatrace)', () => {
    const og = DETERGENT_DATABASE.og;
    expect(og.molecularWeight).toBe(292.4);
    expect(og.cmcMm).toBe(18.0);
    expect(og.cmcPct).toBeCloseTo(0.53, 2);
    expect(og.aggregationNumber).toBe(84);
    expect(og.micelleMwKDa).toBe(25.0);
    expect(og.dialyzability).toBe('easily_dialyzed');
  });

  it('matches published parameters for NG', () => {
    const ng = DETERGENT_DATABASE.ng;
    expect(ng.molecularWeight).toBe(306.4);
    expect(ng.cmcMm).toBe(6.5);
    expect(ng.cmcPct).toBeCloseTo(0.2, 2);
    expect(ng.aggregationNumber).toBe(130);
    expect(ng.micelleMwKDa).toBe(40.0);
    expect(ng.dialyzability).toBe('easily_dialyzed');
  });

  it('matches published parameters for DM', () => {
    const dm = DETERGENT_DATABASE.dm;
    expect(dm.molecularWeight).toBe(482.6);
    expect(dm.cmcMm).toBe(1.8);
    expect(dm.cmcPct).toBeCloseTo(0.087, 3);
    expect(dm.aggregationNumber).toBe(69);
    expect(dm.micelleMwKDa).toBe(33.0);
    expect(dm.dialyzability).toBe('slowly_dialyzed');
  });

  it('matches published parameters for CHAPS (zwitterionic bile derivative)', () => {
    const chaps = DETERGENT_DATABASE.chaps;
    expect(chaps.molecularWeight).toBe(614.9);
    expect(chaps.cmcMm).toBe(8.0);
    expect(chaps.cmcPct).toBeCloseTo(0.49, 2);
    expect(chaps.aggregationNumber).toBe(10);
    expect(chaps.micelleMwKDa).toBe(6.0);
    expect(chaps.category).toBe('zwitterionic');
    expect(chaps.dialyzability).toBe('easily_dialyzed');
  });

  it('matches published parameters for Digitonin', () => {
    const digitonin = DETERGENT_DATABASE.digitonin;
    expect(digitonin.molecularWeight).toBe(1229.3);
    expect(digitonin.cmcMm).toBe(0.5);
    expect(digitonin.cmcPct).toBeCloseTo(0.06, 2);
    expect(digitonin.aggregationNumber).toBe(60);
    expect(digitonin.micelleMwKDa).toBe(74.0);
    expect(digitonin.dialyzability).toBe('slowly_dialyzed');
  });

  it('matches published parameters for Triton X-100', () => {
    const triton = DETERGENT_DATABASE.triton_x100;
    expect(triton.molecularWeight).toBe(625.0);
    expect(triton.cmcMm).toBe(0.24);
    expect(triton.cmcPct).toBeCloseTo(0.015, 3);
    expect(triton.aggregationNumber).toBe(140);
    expect(triton.micelleMwKDa).toBe(88.0);
    expect(triton.dialyzability).toBe('non_dialyzable');
  });

  it('matches published parameters for Tween-20', () => {
    const tween = DETERGENT_DATABASE.tween_20;
    expect(tween.molecularWeight).toBe(1228.0);
    expect(tween.cmcMm).toBe(0.06);
    expect(tween.cmcPct).toBeCloseTo(0.007, 3);
    expect(tween.aggregationNumber).toBe(40);
    expect(tween.micelleMwKDa).toBe(49.0);
    expect(tween.dialyzability).toBe('non_dialyzable');
  });

  it('verifies theoretical % CMC agrees with published Anatrace % CMC for all detergents', () => {
    for (const det of DETERGENT_LIST) {
      const calculatedPct = mmToPercent(det.cmcMm, det.molecularWeight);
      // Theoretical and reported rounded % should be within 10% relative difference
      expect(calculatedPct).toBeCloseTo(det.cmcPct, 1);
    }
  });
});

describe('Concentration Conversions', () => {
  const mw = 510.6; // DDM

  it('converts mM to % (w/v)', () => {
    // 1 mM DDM = (1 * 510.6) / 10000 = 0.05106% (w/v)
    expect(mmToPercent(1.0, mw)).toBeCloseTo(0.05106, 5);
  });

  it('converts % (w/v) to mM', () => {
    // 0.05106% DDM = 1.0 mM
    expect(percentToMm(0.05106, mw)).toBeCloseTo(1.0, 4);
  });

  it('converts mM to mg/mL', () => {
    // 1 mM DDM = 0.5106 mg/mL
    expect(mmToMgMl(1.0, mw)).toBeCloseTo(0.5106, 4);
  });

  it('converts mg/mL to mM', () => {
    expect(mgMlToMm(0.5106, mw)).toBeCloseTo(1.0, 4);
  });

  it('converts % (w/v) to mg/mL and vice versa', () => {
    // 1% (w/v) = 10 mg/mL
    expect(percentToMgMl(1.5)).toBe(15);
    expect(mgMlToPercent(15)).toBe(1.5);
  });

  it('performs unified conversion correctly across all 3 units', () => {
    const valMm = 2.5;
    const valPct = mmToPercent(valMm, mw);
    const valMgMl = mmToMgMl(valMm, mw);

    expect(convertConcentration(valMm, 'mM', '%', mw)).toBeCloseTo(valPct, 6);
    expect(convertConcentration(valPct, '%', 'mg/mL', mw)).toBeCloseTo(valMgMl, 6);
    expect(convertConcentration(valMgMl, 'mg/mL', 'mM', mw)).toBeCloseTo(valMm, 6);
    expect(convertConcentration(valMm, 'mM', 'mM', mw)).toBe(valMm);
  });

  it('validates negative inputs and throws DetergentError', () => {
    expect(() => mmToPercent(-1, mw)).toThrow(DetergentError);
    expect(() => percentToMm(1, 0)).toThrow(DetergentError);
    expect(() => mmToMgMl(1, -5)).toThrow(DetergentError);
  });
});

describe('Free vs Micellar Partitioning', () => {
  const ddm = DETERGENT_DATABASE.ddm; // CMC = 0.17 mM, MW = 510.6

  it('correctly partitions detergent concentration below CMC', () => {
    const part = partitionDetergent(0.10, ddm.cmcMm, ddm.molecularWeight);
    expect(part.freeConcMm).toBeCloseTo(0.10, 4);
    expect(part.micellarConcMm).toBe(0);
    expect(part.cmcRatio).toBeCloseTo(0.10 / 0.17, 3);
    expect(part.micellarFraction).toBe(0);
    expect(part.isAboveCmc).toBe(false);
  });

  it('correctly partitions detergent concentration at CMC', () => {
    const part = partitionDetergent(0.17, ddm.cmcMm, ddm.molecularWeight);
    expect(part.freeConcMm).toBeCloseTo(0.17, 4);
    expect(part.micellarConcMm).toBe(0);
    expect(part.cmcRatio).toBeCloseTo(1.0, 4);
    expect(part.isAboveCmc).toBe(true);
  });

  it('correctly partitions detergent concentration above CMC', () => {
    const total = 1.0; // 1.0 mM DDM
    const part = partitionDetergent(total, ddm.cmcMm, ddm.molecularWeight);
    expect(part.freeConcMm).toBeCloseTo(0.17, 4);
    expect(part.micellarConcMm).toBeCloseTo(0.83, 4);
    expect(part.cmcRatio).toBeCloseTo(1.0 / 0.17, 3);
    expect(part.micellarFraction).toBeCloseTo(0.83 / 1.0, 3);
    expect(part.isAboveCmc).toBe(true);
  });
});

describe('Micelle Concentration & Particle Sizing', () => {
  it('calculates micelle molar concentration and absolute particle count in sample', () => {
    // DDM at 1.0 mM: micellar conc = 0.83 mM. Aggregation number = 110. Volume = 1 mL (1e-3 L).
    const micellarConcMm = 0.83;
    const freeConcMm = 0.17;
    const nAgg = 110;
    const volumeMl = 1.0;

    const res = calculateMicelles(micellarConcMm, freeConcMm, nAgg, volumeMl);

    // Micelle conc = 0.83 mM / 110 = 0.007545 mM = 7.545 µM
    expect(res.micelleConcMm).toBeCloseTo(0.83 / 110, 6);
    expect(res.micelleConcUm).toBeCloseTo((0.83 / 110) * 1000, 3);

    // Micelle moles in 1 mL = (0.83 / 110) * 1e-3 * 1e-3 = 7.545e-9 mol
    expect(res.micelleMols).toBeCloseTo(7.54545e-9, 12);

    // Discrete micelle count = 7.54545e-9 * 6.02214076e23 = 4.544e15 particles
    expect(res.micelleCount).toBeGreaterThan(4.5e15);
    expect(res.micelleCount).toBeLessThan(4.6e15);

    // Total monomer count: 1.0 mM * 1 mL = 1 µmol * NA = 6.022e17 molecules
    expect(res.totalMonomerCount).toBeCloseTo(1e-6 * AVOGADRO, -12);
  });
});

describe('Complex MW & SEC Sizing', () => {
  it('calculates monomeric membrane protein complex MW with DDM micelle', () => {
    // 45 kDa target protein + 56 kDa DDM micelle = 101 kDa PDC
    const proteinMw = 45.0;
    const micelleMw = 56.0;

    const res = calculateComplexMw(proteinMw, micelleMw, 1);
    expect(res.proteinTotalMwKDa).toBe(45.0);
    expect(res.complexMwKDa).toBe(101.0);
    expect(res.proteinMassFraction).toBeCloseTo(45 / 101, 3);
    expect(res.detergentMassFraction).toBeCloseTo(56 / 101, 3);
    expect(res.estimatedStokesRadiusNm).toBeGreaterThan(2.5);
    expect(res.estimatedStokesRadiusNm).toBeLessThan(4.5);

    // Superdex 200 should be optimal for a 101 kDa complex
    const s200 = res.secColumns.find(c => c.name.includes('Superdex 200'));
    expect(s200?.suitability).toBe('optimal');
  });

  it('calculates tetrameric ion channel complex with LMNG micelle', () => {
    // 4 x 35 kDa = 140 kDa protein + 70 kDa LMNG micelle = 210 kDa complex
    const res = calculateComplexMw(35.0, 70.0, 4);
    expect(res.proteinTotalMwKDa).toBe(140.0);
    expect(res.complexMwKDa).toBe(210.0);

    const s200 = res.secColumns.find(c => c.name.includes('Superdex 200'));
    expect(s200?.suitability).toBe('optimal');
  });

  it('correctly marks Superdex 75 unsuitable for large 300 kDa complex', () => {
    const res = calculateComplexMw(230.0, 70.0, 1);
    const s75 = res.secColumns.find(c => c.name.includes('Superdex 75'));
    expect(s75?.suitability).toBe('unsuitable');
  });
});

describe('Dialyzability Assessment', () => {
  it('rates high CMC detergents (>= 2 mM) as easily dialyzed', () => {
    const og = assessDialyzability(DETERGENT_DATABASE.og.cmcMm); // 18 mM
    expect(og.rating).toBe('easily_dialyzed');
    expect(og.score).toBeGreaterThanOrEqual(70);

    const chaps = assessDialyzability(DETERGENT_DATABASE.chaps.cmcMm); // 8 mM
    expect(chaps.rating).toBe('easily_dialyzed');
    expect(chaps.score).toBeGreaterThanOrEqual(70);

    const ng = assessDialyzability(DETERGENT_DATABASE.ng.cmcMm); // 6.5 mM
    expect(ng.rating).toBe('easily_dialyzed');
    expect(ng.score).toBeGreaterThanOrEqual(70);
  });

  it('rates intermediate CMC detergents (0.5 to 2.0 mM) as slowly dialyzed', () => {
    const dm = assessDialyzability(DETERGENT_DATABASE.dm.cmcMm); // 1.8 mM
    expect(dm.rating).toBe('slowly_dialyzed');
    expect(dm.score).toBeGreaterThanOrEqual(30);
    expect(dm.score).toBeLessThan(70);

    const digitonin = assessDialyzability(DETERGENT_DATABASE.digitonin.cmcMm); // 0.5 mM
    expect(digitonin.rating).toBe('slowly_dialyzed');
    expect(digitonin.score).toBe(30);
  });

  it('rates low CMC detergents (< 0.5 mM) as practically non-dialyzable', () => {
    const ddm = assessDialyzability(DETERGENT_DATABASE.ddm.cmcMm); // 0.17 mM
    expect(ddm.rating).toBe('non_dialyzable');
    expect(ddm.score).toBeLessThan(30);

    const lmng = assessDialyzability(DETERGENT_DATABASE.lmng.cmcMm); // 0.010 mM
    expect(lmng.rating).toBe('non_dialyzable');
    expect(lmng.score).toBeLessThan(5);

    const triton = assessDialyzability(DETERGENT_DATABASE.triton_x100.cmcMm); // 0.24 mM
    expect(triton.rating).toBe('non_dialyzable');

    const tween = assessDialyzability(DETERGENT_DATABASE.tween_20.cmcMm); // 0.06 mM
    expect(tween.rating).toBe('non_dialyzable');
  });
});

describe('Detergent-to-Protein Stoichiometry', () => {
  it('detects insufficient micelle coverage when micelles per protein < 1', () => {
    // 50 kDa protein at 10 mg/mL = 0.2 mM (200 µM).
    // Total DDM = 0.5 mM, CMC = 0.17 mM -> micellar = 0.33 mM.
    // Nagg = 110 -> Micelle conc = 0.33 / 110 = 0.003 mM (3 µM).
    // Micelles per protein = 0.003 / 0.2 = 0.015 (critical shortage!).
    const res = calculateDetergentProteinRatio(50.0, 10.0, 0.5, 0.33, 110);
    expect(res.status).toBe('insufficient_micelles');
    expect(res.micellesPerProtein).toBeLessThan(1.0);
  });

  it('identifies optimal monodisperse regime when micelles per protein is 1 to 3', () => {
    // 50 kDa protein at 1 mg/mL = 0.02 mM (20 µM).
    // DDM micellar conc = 3.3 mM, Nagg = 110 -> Micelle conc = 0.03 mM (30 µM).
    // Micelles per protein = 30 / 20 = 1.5 -> Optimal!
    const res = calculateDetergentProteinRatio(50.0, 1.0, 3.47, 3.3, 110);
    expect(res.status).toBe('optimal_monodisperse');
    expect(res.micellesPerProtein).toBeCloseTo(1.5, 1);
  });

  it('flags excess micelles when micelles per protein > 3', () => {
    // Very dilute protein: 0.1 mg/mL of 50 kDa = 2 µM.
    // Micelle conc = 30 µM -> 15 micelles per protein.
    const res = calculateDetergentProteinRatio(50.0, 0.1, 3.47, 3.3, 110);
    expect(res.status).toBe('excess_micelles');
    expect(res.micellesPerProtein).toBeGreaterThan(3.0);
  });
});

describe('Stock Solution Dilution', () => {
  it('calculates volume required to make 50 mL buffer of 0.03% DDM from 10% stock', () => {
    const ddm = DETERGENT_DATABASE.ddm;
    const res = calculateStockDilution(10, '%', 0.03, '%', 50, ddm.molecularWeight, ddm.cmcMm);

    // V_stock = (0.03% / 10%) * 50 mL = 0.15 mL = 150 µL
    expect(res.stockVolumeMl).toBeCloseTo(0.15, 4);
    expect(res.stockVolumeUl).toBeCloseTo(150, 2);
    expect(res.bufferVolumeMl).toBeCloseTo(49.85, 4);
    expect(res.dilutionFactor).toBeCloseTo(333.33, 1);
    expect(res.finalCmcMultiplier).toBeGreaterThan(3.0);
  });

  it('throws error when target concentration exceeds stock concentration', () => {
    const ddm = DETERGENT_DATABASE.ddm;
    expect(() =>
      calculateStockDilution(1.0, 'mM', 5.0, 'mM', 100, ddm.molecularWeight, ddm.cmcMm)
    ).toThrow(DetergentError);
  });
});
