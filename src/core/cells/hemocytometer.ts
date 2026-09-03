/**
 * Hemocytometer cell concentration, viability, and seeding calculations.
 */

export interface HemocytometerSquare {
  id: number;
  name: string;
  live: number;
  dead: number;
}

export interface HemocytometerInput {
  squares: Array<{ live: number; dead: number }>;
  dilutionFactor: number; // e.g. 2 for 1:1 Trypan Blue
  squareVolumeMl?: number; // default 1e-4 mL (0.1 mm^3 standard Neubauer square)
  totalCultureVolumeMl?: number;
  targetSeedingCount?: number;
}

export interface HemocytometerResult {
  squaresCounted: number;
  totalLiveCounted: number;
  totalDeadCounted: number;
  totalCounted: number;
  viabilityPercent: number;
  meanLivePerSquare: number;
  meanTotalPerSquare: number;
  liveCellsPerMl: number;
  totalCellsPerMl: number;
  totalViableInCulture?: number;
  seedingVolumeMl?: number;
  seedingVolumeUl?: number;
}

export class HemocytometerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HemocytometerError';
  }
}

export function calculateHemocytometer(input: HemocytometerInput): HemocytometerResult {
  const {
    squares,
    dilutionFactor,
    squareVolumeMl = 1e-4,
    totalCultureVolumeMl,
    targetSeedingCount,
  } = input;

  if (squares.length === 0) {
    throw new HemocytometerError('At least one square must be counted.');
  }

  if (dilutionFactor <= 0) {
    throw new HemocytometerError('Dilution factor must be greater than zero.');
  }

  if (squareVolumeMl <= 0) {
    throw new HemocytometerError('Square volume must be greater than zero.');
  }

  let totalLive = 0;
  let totalDead = 0;

  for (const sq of squares) {
    if (sq.live < 0 || sq.dead < 0) {
      throw new HemocytometerError('Cell counts cannot be negative.');
    }
    totalLive += sq.live;
    totalDead += sq.dead;
  }

  const squaresCounted = squares.length;
  const totalCounted = totalLive + totalDead;
  const viabilityPercent = totalCounted > 0 ? (totalLive / totalCounted) * 100 : 100;

  const meanLivePerSquare = totalLive / squaresCounted;
  const meanTotalPerSquare = totalCounted / squaresCounted;

  // Concentration = (Count / (N_squares * V_square)) * Dilution
  const liveCellsPerMl = (meanLivePerSquare / squareVolumeMl) * dilutionFactor;
  const totalCellsPerMl = (meanTotalPerSquare / squareVolumeMl) * dilutionFactor;

  let totalViableInCulture: number | undefined;
  if (totalCultureVolumeMl !== undefined && totalCultureVolumeMl > 0) {
    totalViableInCulture = liveCellsPerMl * totalCultureVolumeMl;
  }

  let seedingVolumeMl: number | undefined;
  let seedingVolumeUl: number | undefined;
  if (targetSeedingCount !== undefined && targetSeedingCount > 0 && liveCellsPerMl > 0) {
    seedingVolumeMl = targetSeedingCount / liveCellsPerMl;
    seedingVolumeUl = seedingVolumeMl * 1000;
  }

  return {
    squaresCounted,
    totalLiveCounted: totalLive,
    totalDeadCounted: totalDead,
    totalCounted,
    viabilityPercent,
    meanLivePerSquare,
    meanTotalPerSquare,
    liveCellsPerMl,
    totalCellsPerMl,
    totalViableInCulture,
    seedingVolumeMl,
    seedingVolumeUl,
  };
}
