import { describe, it, expect } from 'vitest';
import { calculateHemocytometer } from '@/core/cells/hemocytometer';
import { calculateDoublingTime, calculateSeeding, fitGrowthObservations, calculateHarvestTime } from '@/core/cells/culture';

describe('Hemocytometer calculations', () => {
  it('calculates cell concentration, viability, and seeding volume accurately', () => {
    // Counted 4 squares: 50, 45, 55, 50 live cells = 200 live cells; 10 dead cells
    // Total = 210 cells. Dilution = 2 (1:1 with Trypan Blue)
    // Mean live per square = 50. Mean total per square = 52.5.
    // Live cells/mL = (50 / 1e-4) * 2 = 1,000,000 cells/mL = 1.0e6
    const res = calculateHemocytometer({
      squares: [
        { live: 50, dead: 2 },
        { live: 45, dead: 3 },
        { live: 55, dead: 2 },
        { live: 50, dead: 3 },
      ],
      dilutionFactor: 2,
      totalCultureVolumeMl: 10,
      targetSeedingCount: 500_000,
    });

    expect(res.squaresCounted).toBe(4);
    expect(res.totalLiveCounted).toBe(200);
    expect(res.totalDeadCounted).toBe(10);
    expect(res.viabilityPercent).toBeCloseTo((200 / 210) * 100, 2);
    expect(res.liveCellsPerMl).toBe(1_000_000);
    expect(res.totalCellsPerMl).toBe(1_050_000);
    expect(res.totalViableInCulture).toBe(10_000_000);
    expect(res.seedingVolumeMl).toBe(0.5);
    expect(res.seedingVolumeUl).toBe(500);
  });
});

describe('Cell Culture and Doubling Time', () => {
  it('computes exponential doubling time correctly', () => {
    // 100,000 to 800,000 cells (3 doublings: 100k -> 200k -> 400k -> 800k) over 48 hours
    // Doubling time should be exactly 16 hours.
    const res = calculateDoublingTime(100_000, 800_000, 48);
    expect(res.doublingTimeHours).toBeCloseTo(16, 2);
    expect(res.populationDoublings).toBeCloseTo(3, 2);
  });

  it('computes vessel seeding requirements', () => {
    // T-75 flask (75 cm^2), target 20,000 cells/cm^2 -> 1,500,000 cells per flask
    // 3 flasks = 4,500,000 cells. Stock = 1,000,000 cells/mL -> 1.5 mL/flask, total 4.5 mL
    const res = calculateSeeding({
      targetDensityPerCm2: 20_000,
      vesselAreaCm2: 75,
      vesselCount: 3,
      stockConcentrationCellsPerMl: 1_000_000,
    });
    expect(res.cellsPerVessel).toBe(1_500_000);
    expect(res.totalCellsNeeded).toBe(4_500_000);
    expect(res.volumePerVesselMl).toBe(1.5);
    expect(res.totalVolumeNeededMl).toBe(4.5);
  });

  it('fits multi-point growth observations via log-linear regression', () => {
    // Exact doubling every 24 hours: t=0: 100k, t=24: 200k, t=48: 400k, t=72: 800k
    const obs = [
      { timeHours: 0, count: 100_000 },
      { timeHours: 24, count: 200_000 },
      { timeHours: 48, count: 400_000 },
      { timeHours: 72, count: 800_000 },
    ];
    const fit = fitGrowthObservations(obs);
    expect(fit.doublingTimeHours).toBeCloseTo(24, 1);
    expect(fit.rSquared).toBeGreaterThan(0.999);
    expect(fit.initialCountEstimate).toBeCloseTo(100_000, -1);

    // Predict time to reach 1,600,000 cells (1 more doubling, so at t=96h, remaining 24h from last obs)
    const targetPrediction = fit.calculateTimeToTarget(1_600_000);
    expect(targetPrediction.totalHoursFromZero).toBeCloseTo(96, 1);
    expect(targetPrediction.hoursFromLastObs).toBeCloseTo(24, 1);
  });

  it('calculates harvest availability time, hours, and tolerance window', () => {
    // 200k cells to 1.6M cells with 24h doubling time = 3 doublings = 72 hours
    const start = new Date('2026-09-01T10:00:00Z');
    const pred = calculateHarvestTime({
      initialCount: 200_000,
      targetCount: 1_600_000,
      doublingTimeHours: 24,
      startDateTime: start,
    });

    expect(pred.doublingsRequired).toBeCloseTo(3, 2);
    expect(pred.hoursRequired).toBeCloseTo(72, 2);
    expect(pred.targetDate.toISOString()).toBe('2026-09-04T10:00:00.000Z');
    expect(pred.daysAndHoursText).toContain('72.0 h');
    expect(pred.windowEarlyHours).toBeCloseTo(64.8, 1);
    expect(pred.windowLateHours).toBeCloseTo(79.2, 1);
  });
});
