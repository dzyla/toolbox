import { describe, it, expect } from 'vitest';
import {
  getSavitzkyGolayWeights,
  savitzkyGolaySmooth,
  savitzkyGolayDerivative,
  centralDifferenceDerivative,
  interpolatePeakVertex,
  findDsfPeaks,
  boltzmannSigmoid,
  fitBoltzmannSigmoid,
  parseDsfCsv,
  classifyDsfEffect,
  analyzeDsfDataset,
  generateLysozymeDemoDataset,
  generateNanoDsfDemoDataset,
  generatePrometheusDemoDataset,
  formatDsfToCsv,
  getNiceTicks,
} from '@/core/dsf';

describe('DSF / nanoDSF Core Engine', () => {
  describe('Savitzky-Golay Weights and Mathematical Derivatives', () => {
    it('generates exact analytical convolution weights for window 5, 7, and 9', () => {
      // Window 5 (m = 2) smoothing weights: [-3, 12, 17, 12, -3] / 35
      const w5Smooth = getSavitzkyGolayWeights(5, 0);
      expect(w5Smooth[0]).toBeCloseTo(-3 / 35, 6);
      expect(w5Smooth[1]).toBeCloseTo(12 / 35, 6);
      expect(w5Smooth[2]).toBeCloseTo(17 / 35, 6);
      expect(w5Smooth[3]).toBeCloseTo(12 / 35, 6);
      expect(w5Smooth[4]).toBeCloseTo(-3 / 35, 6);
      expect(w5Smooth.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 6);

      // Window 5 (m = 2) 1st derivative weights: [-2, -1, 0, 1, 2] / 10
      const w5Deriv = getSavitzkyGolayWeights(5, 1);
      expect(w5Deriv[0]).toBeCloseTo(-2 / 10, 6);
      expect(w5Deriv[1]).toBeCloseTo(-1 / 10, 6);
      expect(w5Deriv[2]).toBeCloseTo(0, 6);
      expect(w5Deriv[3]).toBeCloseTo(1 / 10, 6);
      expect(w5Deriv[4]).toBeCloseTo(2 / 10, 6);

      // Window 7 (m = 3) smoothing weights: [-2, 3, 6, 7, 6, 3, -2] / 21
      const w7Smooth = getSavitzkyGolayWeights(7, 0);
      expect(w7Smooth[0]).toBeCloseTo(-2 / 21, 6);
      expect(w7Smooth[1]).toBeCloseTo(3 / 21, 6);
      expect(w7Smooth[2]).toBeCloseTo(6 / 21, 6);
      expect(w7Smooth[3]).toBeCloseTo(7 / 21, 6);
      expect(w7Smooth.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 6);

      // Window 7 (m = 3) 1st derivative weights: [-3, -2, -1, 0, 1, 2, 3] / 28
      const w7Deriv = getSavitzkyGolayWeights(7, 1);
      expect(w7Deriv[0]).toBeCloseTo(-3 / 28, 6);
      expect(w7Deriv[3]).toBeCloseTo(0, 6);
      expect(w7Deriv[6]).toBeCloseTo(3 / 28, 6);
    });

    it('throws error for invalid window sizes', () => {
      expect(() => getSavitzkyGolayWeights(4, 0)).toThrow();
      expect(() => getSavitzkyGolayWeights(6, 1)).toThrow();
      expect(() => getSavitzkyGolayWeights(3, 0)).toThrow();
    });

    it('exact derivative calculation on quadratic test function y = 3x^2 + 2x + 5', () => {
      // Theoretical derivative: y' = 6x + 2
      const x = Array.from({ length: 25 }, (_, i) => 1.0 + i * 0.5); // x = 1.0 to 13.0
      const y = x.map(v => 3 * v * v + 2 * v + 5);

      const derivSG = savitzkyGolayDerivative(y, x, 7);

      // Interior points should match exact analytical derivative y' = 6x + 2 within 1e-4
      for (let i = 3; i < x.length - 3; i++) {
        const expected = 6 * x[i]! + 2;
        expect(derivSG[i]).toBeCloseTo(expected, 3);
      }
    });

    it('smooths noisy signal and preserves underlying polynomial trend', () => {
      const x = Array.from({ length: 21 }, (_, i) => i * 1.0);
      const trueY = x.map(v => 2 * v + 10);
      // Add alternating high-frequency noise
      const noisyY = trueY.map((v, i) => v + (i % 2 === 0 ? 5 : -5));
      const smoothed = savitzkyGolaySmooth(noisyY, 7);

      expect(smoothed.length).toBe(noisyY.length);
      // Smoothed interior points should be much closer to true trend than raw noisy points
      for (let i = 4; i < x.length - 4; i++) {
        expect(Math.abs(smoothed[i]! - trueY[i]!)).toBeLessThan(1.5);
      }
    });

    it('central difference derivative matches linear function slope', () => {
      const x = [10, 20, 30, 40, 50];
      const y = [25, 45, 65, 85, 105]; // slope = 2.0
      const d = centralDifferenceDerivative(y, x);
      for (let i = 0; i < d.length; i++) {
        expect(d[i]).toBeCloseTo(2.0, 5);
      }
    });
  });

  describe('Peak Finding and Parabolic Refinement', () => {
    it('refines discrete peak vertex using 3-point parabolic interpolation', () => {
      // True parabola y = -(x - 55.4)^2 + 100
      // Points at x = 54, 55, 56
      const f = (x: number) => -Math.pow(x - 55.4, 2) + 100;
      const x1 = 54, y1 = f(x1);
      const x2 = 55, y2 = f(x2);
      const x3 = 56, y3 = f(x3);

      const res = interpolatePeakVertex(x1, y1, x2, y2, x3, y3);
      expect(res.peakX).toBeCloseTo(55.4, 2);
      expect(res.peakY).toBeCloseTo(100.0, 2);
    });

    it('identifies inflection peak Tm from derivative of a known sigmoidal transition', () => {
      // Synthetic sigmoid with Tm = 65.0, a = 2.0
      const temps: number[] = [];
      const fl: number[] = [];
      for (let t = 40; t <= 80; t += 0.5) {
        temps.push(t);
        fl.push(boltzmannSigmoid(t, 100, 1000, 65.0, 2.0));
      }

      const dFdT = savitzkyGolayDerivative(fl, temps, 7);
      const derivPoints = temps.map((t, i) => ({ temperature: t, dFdT: dFdT[i]! }));

      const peaks = findDsfPeaks(derivPoints);
      expect(peaks.length).toBeGreaterThan(0);
      expect(peaks[0]!.temperature).toBeCloseTo(65.0, 1);
    });
  });

  describe('Two-State Boltzmann Sigmoid Model Fitting', () => {
    it('recovers known simulation parameters (Tm, a, Fmin, Fmax) with high R2', () => {
      const trueTm = 72.5;
      const trueA = 1.8;
      const trueFmin = 50;
      const trueFmax = 1200;

      const points = [];
      for (let t = 45; t <= 90; t += 0.5) {
        points.push({
          temperature: t,
          fluorescence: boltzmannSigmoid(t, trueFmin, trueFmax, trueTm, trueA),
        });
      }

      const fit = fitBoltzmannSigmoid(points);
      expect(fit.r2).toBeGreaterThan(0.999);
      expect(fit.tm).toBeCloseTo(trueTm, 1);
      expect(fit.a).toBeCloseTo(trueA, 1);
      expect(fit.fMin).toBeCloseTo(trueFmin, 0);
      expect(fit.fMax).toBeCloseTo(trueFmax, 0);
    });

    it('computes apparent unfolding enthalpy Delta H_unf in kJ/mol (Pantoliano 2001)', () => {
      // Tm = 75 °C = 348.15 K, a = 2.0 °C
      // ΔH_unf = R * (348.15)^2 / a = 8.314 * 121208.4 / 2.0 = 503.9 kJ/mol
      const points = [];
      for (let t = 50; t <= 90; t += 0.5) {
        points.push({
          temperature: t,
          fluorescence: boltzmannSigmoid(t, 100, 2000, 75.0, 2.0),
        });
      }

      const fit = fitBoltzmannSigmoid(points);
      expect(fit.deltaHunf_kJ).toBeGreaterThan(450);
      expect(fit.deltaHunf_kJ).toBeLessThan(550);
    });

    it('robustly fits transition when high-temperature aggregation roll-off is present', () => {
      // Simulate SYPRO Orange DSF curve with post-unfolding fluorescence drop
      const points = [];
      for (let t = 40; t <= 95; t += 0.5) {
        const sig = boltzmannSigmoid(t, 200, 2500, 70.0, 2.2);
        const rollOff = t > 74 ? Math.exp(-0.02 * Math.pow(t - 74, 1.5)) : 1.0;
        points.push({
          temperature: t,
          fluorescence: Math.round(sig * rollOff),
        });
      }

      const fit = fitBoltzmannSigmoid(points, 70.0);
      expect(fit.r2).toBeGreaterThan(0.98);
      expect(fit.tm).toBeCloseTo(70.0, 0);
    });
  });

  describe('CSV Parsing & Multi-Condition Data Ingestion', () => {
    it('parses comma-delimited multi-well data with header row', () => {
      const csv = `
        # Run 2026-09-05 Bio-Rad CFX
        Temp,Control,Ligand_A,Ligand_B
        25.0,100,105,102
        30.0,110,112,111
        35.0,125,128,124
      `;
      const parsed = parseDsfCsv(csv);
      expect(parsed.temperatures.length).toBe(3);
      expect(parsed.temperatures[0]).toBe(25.0);
      expect(parsed.conditions.length).toBe(3);
      expect(parsed.conditions[0]!.name).toBe('Control');
      expect(parsed.conditions[1]!.name).toBe('Ligand_A');
      expect(parsed.conditions[1]!.fluorescence[1]).toBe(112);
    });

    it('parses tab-delimited data without headers', () => {
      const tsv = `
        25.0\t500\t510
        30.0\t520\t525
        35.0\t540\t550
      `;
      const parsed = parseDsfCsv(tsv);
      expect(parsed.temperatures.length).toBe(3);
      expect(parsed.conditions.length).toBe(2);
      expect(parsed.conditions[0]!.name).toBe('Condition 1');
      expect(parsed.conditions[1]!.name).toBe('Condition 2');
    });

    it('throws descriptive error on empty or invalid CSV', () => {
      expect(() => parseDsfCsv('')).toThrow();
      expect(() => parseDsfCsv('No numeric values here\nOnly text')).toThrow();
    });
  });

  describe('Literature-Pinned Benchmark Assay (Lysozyme + NAG Screen)', () => {
    it('verifies Lysozyme benchmark dataset pinned to Niesen et al. (2007) and Pantoliano et al. (2001)', () => {
      const demoData = generateLysozymeDemoDataset();
      expect(demoData.temperatures.length).toBeGreaterThan(100);
      expect(demoData.conditions.length).toBe(5);

      const result = analyzeDsfDataset(demoData, { referenceNameOrIndex: 'Lysozyme Control (Buffer)' });

      // Check Reference Lysozyme Control Tm: expected ~ 73.8 °C (±0.8 °C)
      expect(result.referenceTm).toBeGreaterThan(73.0);
      expect(result.referenceTm).toBeLessThan(74.8);

      // Check + NAG Monomer stabilization: expected ΔTm in range +3.0 to +4.5 °C
      const nagCond = result.conditions.find(c => c.name.includes('NAG Monomer'))!;
      expect(nagCond).toBeDefined();
      expect(nagCond.tm).toBeGreaterThan(76.5);
      expect(nagCond.tm).toBeLessThan(78.5);
      expect(nagCond.deltaTm).toBeGreaterThan(3.0);
      expect(nagCond.deltaTm).toBeLessThan(4.5);
      expect(nagCond.effect).toBe('moderate_stabilizer');

      // Check + NAG3 Trimer stabilization: expected ΔTm in range +6.0 to +7.5 °C (~ +4 to +8 °C)
      const nag3Cond = result.conditions.find(c => c.name.includes('NAG3 Trimer'))!;
      expect(nag3Cond).toBeDefined();
      expect(nag3Cond.tm).toBeGreaterThan(79.5);
      expect(nag3Cond.tm).toBeLessThan(81.5);
      expect(nag3Cond.deltaTm).toBeGreaterThan(6.0);
      expect(nag3Cond.deltaTm).toBeLessThan(7.8);
      expect(nag3Cond.effect).toBe('strong_stabilizer');

      // Check + Urea denaturant destabilization: negative ΔTm
      const ureaCond = result.conditions.find(c => c.name.includes('Urea'))!;
      expect(ureaCond).toBeDefined();
      expect(ureaCond.deltaTm).toBeLessThan(-4.5);
      expect(ureaCond.effect).toBe('destabilizer');

      // Ranking verification: NAG3 trimer should be top hit
      expect(result.rankedConditions[0]!.name).toContain('NAG3 Trimer');
      expect(result.summary.topHit?.name).toContain('NAG3 Trimer');
      expect(result.summary.stabilizersCount).toBeGreaterThanOrEqual(2);
      expect(result.summary.destabilizersCount).toBeGreaterThanOrEqual(1);
    });

    it('verifies nanoDSF ratio dataset with multi-condition hit ranking', () => {
      const nanoData = generateNanoDsfDemoDataset();
      const result = analyzeDsfDataset(nanoData, { referenceNameOrIndex: 'mAb Apo (Vehicle DMSO)' });

      expect(result.referenceTm).toBeCloseTo(67.2, 0);
      const fragA = result.conditions.find(c => c.name.includes('Fragment A'))!;
      expect(fragA.deltaTm).toBeCloseTo(5.2, 0);
      expect(fragA.effect).toBe('strong_stabilizer');

      const lowPh = result.conditions.find(c => c.name.includes('Low pH'))!;
      expect(lowPh.deltaTm).toBeLessThan(-5.0);
      expect(lowPh.effect).toBe('destabilizer');
    });

    it('formats parsed dataset back to standard CSV round-trip', () => {
      const demoData = generateLysozymeDemoDataset();
      const csv = formatDsfToCsv(demoData);
      expect(csv).toContain('Temperature (°C)');
      expect(csv).toContain('Lysozyme Control (Buffer)');
      expect(csv).toContain('+ NAG3 Trimer');

      const reParsed = parseDsfCsv(csv);
      expect(reParsed.temperatures.length).toBe(demoData.temperatures.length);
      expect(reParsed.conditions.length).toBe(demoData.conditions.length);
    });
  });

  describe('Effect Classification Thresholds', () => {
    it('correctly categorizes ΔTm thresholds', () => {
      expect(classifyDsfEffect(5.5)).toBe('strong_stabilizer');
      expect(classifyDsfEffect(4.0)).toBe('strong_stabilizer');
      expect(classifyDsfEffect(2.5)).toBe('moderate_stabilizer');
      expect(classifyDsfEffect(2.0)).toBe('moderate_stabilizer');
      expect(classifyDsfEffect(1.2)).toBe('neutral');
      expect(classifyDsfEffect(0.0)).toBe('neutral');
      expect(classifyDsfEffect(-1.5)).toBe('neutral');
      expect(classifyDsfEffect(-2.0)).toBe('destabilizer');
      expect(classifyDsfEffect(-4.5)).toBe('destabilizer');
    });
  });

  describe('Prometheus & Advanced nanoDSF Processing', () => {
    it('generates human-friendly nice ticks across various scales', () => {
      // nanoDSF ratio scale (0.82 to 1.18)
      const ratioTicks = getNiceTicks(0.82, 1.18, 5);
      expect(ratioTicks.min).toBeLessThanOrEqual(0.82);
      expect(ratioTicks.max).toBeGreaterThanOrEqual(1.18);
      expect(ratioTicks.ticks.length).toBeGreaterThanOrEqual(4);
      expect(ratioTicks.ticks.every(t => typeof t === 'number' && !isNaN(t))).toBe(true);

      // Raw fluorescence (12,000 to 65,000)
      const rawTicks = getNiceTicks(12000, 65000, 5);
      expect(rawTicks.min).toBeLessThanOrEqual(12000);
      expect(rawTicks.max).toBeGreaterThanOrEqual(65000);
      expect(rawTicks.step).toBeGreaterThanOrEqual(10000);

      // Derivative scale (-15.2 to +42.0)
      const derivTicks = getNiceTicks(-15.2, 42.0, 6);
      expect(derivTicks.min).toBeLessThanOrEqual(-15.2);
      expect(derivTicks.max).toBeGreaterThanOrEqual(42.0);
    });

    it('parses Prometheus nanoDSF format with Time column, temperature column, and capillary channels', () => {
      const prometheusCsv = `
# Software: PR.ThermControl v2.1.2
# Ramp rate: 1.0 °C/min
Time [s],Temperature [°C],Capillary 1 - Ratio (350nm/330nm),Capillary 1 - 330nm,Capillary 2 - Ratio (350nm/330nm)
0.0,25.0,0.842,16200,0.839
30.0,25.5,0.843,16150,0.840
60.0,26.0,0.845,16100,0.842
      `.trim();

      const parsed = parseDsfCsv(prometheusCsv);
      expect(parsed.format).toBe('prometheus');
      expect(parsed.temperatures).toEqual([25.0, 25.5, 26.0]);
      expect(parsed.conditions.length).toBe(3);
      expect(parsed.conditions[0]!.name).toBe('Capillary 1 - Ratio (350nm/330nm)');
      expect(parsed.conditions[0]!.channel).toBe('ratio');
      expect(parsed.conditions[1]!.channel).toBe('f330');
      expect(parsed.conditions[2]!.name).toBe('Capillary 2 - Ratio (350nm/330nm)');
    });

    it('parses European semicolon-delimited CSV with comma decimals', () => {
      const euroCsv = `
Temperature [°C];Capillary 1;Capillary 2
25,0;0,842;0,851
30,5;0,849;0,858
35,0;0,861;0,870
      `.trim();

      const parsed = parseDsfCsv(euroCsv);
      expect(parsed.temperatures).toEqual([25.0, 30.5, 35.0]);
      expect(parsed.conditions.length).toBe(2);
      expect(parsed.conditions[0]!.fluorescence[0]).toBeCloseTo(0.842, 3);
      expect(parsed.conditions[1]!.fluorescence[1]).toBeCloseTo(0.858, 3);
    });

    it('fits downward transitions (nanoDSF blue-shift / fluorescence quenching)', () => {
      // Simulate downward transition from 1.20 down to 0.80 at Tm = 62.0
      const points = [];
      for (let t = 40; t <= 85; t += 0.5) {
        points.push({
          temperature: t,
          fluorescence: boltzmannSigmoid(t, 1.20, 0.80, 62.0, 1.8),
        });
      }

      const fit = fitBoltzmannSigmoid(points, 62.0, { direction: 'downward' });
      expect(fit.r2).toBeGreaterThan(0.99);
      expect(fit.tm).toBeCloseTo(62.0, 1);
      expect(fit.fMin).toBeCloseTo(1.20, 1);
      expect(fit.fMax).toBeCloseTo(0.80, 1);
      expect(fit.a).toBeCloseTo(1.8, 1);
      expect(fit.deltaHunf_kJ).toBeGreaterThan(300);
    });

    it('analyzes selected conditions subset with temperature cropping', () => {
      const demoData = generateLysozymeDemoDataset();
      const allResult = analyzeDsfDataset(demoData);
      expect(allResult.conditions.length).toBe(5);

      // Select only 2 conditions and crop temperature from 50 to 85 °C
      const filteredResult = analyzeDsfDataset(demoData, {
        selectedConditionIds: ['cond_1', 'cond_3'],
        tempRange: [50, 85],
      });

      expect(filteredResult.conditions.length).toBe(2);
      expect(filteredResult.temperatures[0]).toBeGreaterThanOrEqual(50);
      expect(filteredResult.temperatures[filteredResult.temperatures.length - 1]).toBeLessThanOrEqual(85);
      expect(filteredResult.conditions[0]!.name).toBe('Lysozyme Control (Buffer)');
      expect(filteredResult.conditions[1]!.name).toBe('+ NAG3 Trimer (1 mM)');
    });

    it('verifies 24-capillary Prometheus demo dataset generation', () => {
      const promData = generatePrometheusDemoDataset();
      expect(promData.format).toBe('prometheus');
      expect(promData.temperatures.length).toBeGreaterThan(100);
      expect(promData.conditions.length).toBe(24); // 8 capillaries x 3 channels
      const ratioConds = promData.conditions.filter(c => c.channel === 'ratio');
      expect(ratioConds.length).toBe(8);
    });

    it('detects multiple transition peaks with explicit + and - signs', () => {
      // Simulate multi-domain protein with:
      // Domain 1: low-temperature blue-shift compaction at 52.0 °C (- inflection)
      // Domain 2: main unfolding at 71.5 °C (+ inflection)
      // Domain 3: high-temperature domain unfolding at 83.0 °C (+ inflection)
      const temps: number[] = [];
      const dFdT: number[] = [];
      for (let t = 35; t <= 92; t += 0.5) {
        temps.push(t);
        // Gaussian derivative peaks
        const p1 = -0.04 * Math.exp(-Math.pow((t - 52.0) / 2.0, 2)); // negative peak at 52
        const p2 = 0.09 * Math.exp(-Math.pow((t - 71.5) / 2.2, 2)); // positive peak at 71.5
        const p3 = 0.05 * Math.exp(-Math.pow((t - 83.0) / 2.0, 2)); // positive peak at 83
        dFdT.push(p1 + p2 + p3);
      }

      const derivPoints = temps.map((t, i) => ({ temperature: t, dFdT: dFdT[i]! }));
      const peaks = findDsfPeaks(derivPoints, { direction: 'both', minProminenceRatio: 0.1 });

      expect(peaks.length).toBeGreaterThanOrEqual(3);

      const negPeak = peaks.find(p => p.sign === '-');
      expect(negPeak).toBeDefined();
      expect(negPeak!.temperature).toBeCloseTo(52.0, 1);
      expect(negPeak!.direction).toBe('negative');
      expect(negPeak!.height).toBeLessThan(0);
      expect(negPeak!.label).toContain('-Tm');

      const posPeaks = peaks.filter(p => p.sign === '+');
      expect(posPeaks.length).toBeGreaterThanOrEqual(2);
      expect(posPeaks.some(p => Math.abs(p.temperature - 71.5) < 1.0)).toBe(true);
      expect(posPeaks.some(p => Math.abs(p.temperature - 83.0) < 1.0)).toBe(true);
      expect(posPeaks[0]!.label).toContain('+Tm');

      // Primary peak should be the highest peak (+71.5)
      expect(peaks[0]!.isPrimary).toBe(true);
      expect(peaks[0]!.temperature).toBeCloseTo(71.5, 1);
    });
  });
});
