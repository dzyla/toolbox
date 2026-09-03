import { describe, it, expect } from 'vitest';
import { calculateHemocytometer } from '@/core/cells/hemocytometer';
import { calculateDoublingTime, calculateSeeding } from '@/core/cells/culture';

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
});
