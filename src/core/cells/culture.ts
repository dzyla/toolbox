/**
 * Cell culture passaging, surface area scaling, doubling time, and seeding calculations.
 */

export interface CultureVessel {
  id: string;
  name: string;
  category: 'dish' | 'plate' | 'flask';
  areaCm2: number;
  typicalVolumeMl: number;
  typicalMaxCells: number; // typical confluent cell count (e.g. HeLa / fibroblast)
}

export const CULTURE_VESSELS: CultureVessel[] = [
  { id: 'well-96', name: '96-well plate (per well)', category: 'plate', areaCm2: 0.32, typicalVolumeMl: 0.1, typicalMaxCells: 40_000 },
  { id: 'well-48', name: '48-well plate (per well)', category: 'plate', areaCm2: 0.95, typicalVolumeMl: 0.3, typicalMaxCells: 120_000 },
  { id: 'well-24', name: '24-well plate (per well)', category: 'plate', areaCm2: 1.9, typicalVolumeMl: 0.5, typicalMaxCells: 250_000 },
  { id: 'well-12', name: '12-well plate (per well)', category: 'plate', areaCm2: 3.8, typicalVolumeMl: 1.0, typicalMaxCells: 500_000 },
  { id: 'well-6', name: '6-well plate (per well)', category: 'plate', areaCm2: 9.5, typicalVolumeMl: 2.0, typicalMaxCells: 1_200_000 },
  { id: 'dish-35', name: '35 mm Petri dish', category: 'dish', areaCm2: 8.8, typicalVolumeMl: 2.0, typicalMaxCells: 1_000_000 },
  { id: 'dish-60', name: '60 mm Petri dish', category: 'dish', areaCm2: 21.5, typicalVolumeMl: 4.0, typicalMaxCells: 3_000_000 },
  { id: 'dish-100', name: '100 mm Petri dish', category: 'dish', areaCm2: 58.2, typicalVolumeMl: 10.0, typicalMaxCells: 8_000_000 },
  { id: 'dish-150', name: '150 mm Petri dish', category: 'dish', areaCm2: 148.0, typicalVolumeMl: 25.0, typicalMaxCells: 20_000_000 },
  { id: 'flask-t25', name: 'T-25 Flask', category: 'flask', areaCm2: 25.0, typicalVolumeMl: 5.0, typicalMaxCells: 3_000_000 },
  { id: 'flask-t75', name: 'T-75 Flask', category: 'flask', areaCm2: 75.0, typicalVolumeMl: 12.0, typicalMaxCells: 9_000_000 },
  { id: 'flask-t175', name: 'T-175 Flask', category: 'flask', areaCm2: 175.0, typicalVolumeMl: 30.0, typicalMaxCells: 22_000_000 },
  { id: 'flask-t225', name: 'T-225 Flask', category: 'flask', areaCm2: 225.0, typicalVolumeMl: 40.0, typicalMaxCells: 30_000_000 },
];

export interface CellLinePreset {
  id: string;
  name: string;
  organism: string;
  doublingTimeHours: number;
  recommendedDensityPerCm2: number;
  typicalHarvestConcCellsPerMl: number;
  description: string;
}

export const CELL_LINE_PRESETS: CellLinePreset[] = [
  {
    id: 'hek293t',
    name: 'HEK293T',
    organism: 'Human (kidney)',
    doublingTimeHours: 20,
    recommendedDensityPerCm2: 25_000,
    typicalHarvestConcCellsPerMl: 1_500_000,
    description: 'Human embryonic kidney with SV40 large T-antigen. Highly transfectable.',
  },
  {
    id: 'hek293f',
    name: 'HEK293F',
    organism: 'Human (kidney)',
    doublingTimeHours: 24,
    recommendedDensityPerCm2: 20_000,
    typicalHarvestConcCellsPerMl: 2_000_000,
    description: 'Suspension adapted HEK293 clone optimized for serum-free protein production.',
  },
  {
    id: 'expi293f',
    name: 'Expi293F',
    organism: 'Human (kidney)',
    doublingTimeHours: 22,
    recommendedDensityPerCm2: 25_000,
    typicalHarvestConcCellsPerMl: 3_000_000,
    description: 'High-density suspension HEK293 derivative for high-yield transient expression.',
  },
  {
    id: 'expicho',
    name: 'ExpiCHO',
    organism: 'Hamster (ovary)',
    doublingTimeHours: 17,
    recommendedDensityPerCm2: 20_000,
    typicalHarvestConcCellsPerMl: 4_000_000,
    description: 'High-yield suspension CHO cell line with rapid doubling and high titers.',
  },
  {
    id: 'cho-k1',
    name: 'CHO-K1',
    organism: 'Hamster (ovary)',
    doublingTimeHours: 21,
    recommendedDensityPerCm2: 15_000,
    typicalHarvestConcCellsPerMl: 1_200_000,
    description: 'Standard adherent Chinese hamster ovary line for recombinant biotherapeutics.',
  },
  {
    id: 'hela',
    name: 'HeLa',
    organism: 'Human (cervical)',
    doublingTimeHours: 23,
    recommendedDensityPerCm2: 10_000,
    typicalHarvestConcCellsPerMl: 1_000_000,
    description: 'Human epithelial adenocarcinoma line. Fast-growing and robust.',
  },
  {
    id: 'jurkat',
    name: 'Jurkat',
    organism: 'Human (T-lymphocyte)',
    doublingTimeHours: 24,
    recommendedDensityPerCm2: 20_000,
    typicalHarvestConcCellsPerMl: 1_500_000,
    description: 'Human immortalized T lymphocyte suspension line for immunology and signaling.',
  },
  {
    id: 'vero',
    name: 'Vero',
    organism: 'Monkey (kidney)',
    doublingTimeHours: 24,
    recommendedDensityPerCm2: 20_000,
    typicalHarvestConcCellsPerMl: 1_200_000,
    description: 'African green monkey kidney epithelial line widely used in virology and vaccines.',
  },
  {
    id: 'drosophila-s2',
    name: 'Drosophila S2',
    organism: 'Insect (D. melanogaster)',
    doublingTimeHours: 24,
    recommendedDensityPerCm2: 30_000,
    typicalHarvestConcCellsPerMl: 2_500_000,
    description: 'Schneider 2 embryonic macrophage-like insect cells growing at 25-28 °C without CO2.',
  },
  {
    id: 'sf9',
    name: 'Sf9',
    organism: 'Insect (S. frugiperda)',
    doublingTimeHours: 26,
    recommendedDensityPerCm2: 25_000,
    typicalHarvestConcCellsPerMl: 2_000_000,
    description: 'Spodoptera frugiperda ovarian clone standard for baculovirus expression vectors.',
  },
];

export class CellCultureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CellCultureError';
  }
}

/** Calculate doubling time and growth rate from initial and final counts over time in hours */
export function calculateDoublingTime(initialCount: number, finalCount: number, timeHours: number): {
  doublingTimeHours: number;
  growthRatePerHour: number;
  populationDoublings: number;
} {
  if (initialCount <= 0 || finalCount <= 0) {
    throw new CellCultureError('Initial and final cell counts must be greater than zero.');
  }
  if (timeHours <= 0) {
    throw new CellCultureError('Elapsed time must be greater than zero.');
  }
  if (finalCount < initialCount) {
    throw new CellCultureError('Final count is less than initial count (negative net growth).');
  }

  const growthRatePerHour = Math.log(finalCount / initialCount) / timeHours;
  const doublingTimeHours = Math.LN2 / growthRatePerHour;
  const populationDoublings = Math.log2(finalCount / initialCount);

  return {
    doublingTimeHours,
    growthRatePerHour,
    populationDoublings,
  };
}

/** Calculate seeding requirements across vessels */
export function calculateSeeding({
  targetDensityPerCm2,
  vesselAreaCm2,
  vesselCount = 1,
  stockConcentrationCellsPerMl,
}: {
  targetDensityPerCm2: number;
  vesselAreaCm2: number;
  vesselCount?: number;
  stockConcentrationCellsPerMl: number;
}): {
  cellsPerVessel: number;
  totalCellsNeeded: number;
  volumePerVesselMl: number;
  totalVolumeNeededMl: number;
} {
  if (targetDensityPerCm2 <= 0 || vesselAreaCm2 <= 0 || stockConcentrationCellsPerMl <= 0 || vesselCount <= 0) {
    throw new CellCultureError('All parameters must be strictly positive.');
  }

  const cellsPerVessel = targetDensityPerCm2 * vesselAreaCm2;
  const totalCellsNeeded = cellsPerVessel * vesselCount;
  const volumePerVesselMl = cellsPerVessel / stockConcentrationCellsPerMl;
  const totalVolumeNeededMl = volumePerVesselMl * vesselCount;

  return {
    cellsPerVessel,
    totalCellsNeeded,
    volumePerVesselMl,
    totalVolumeNeededMl,
  };
}

export interface GrowthObservation {
  timeHours: number;
  count: number;
}

export interface GrowthFitResult {
  growthRatePerHour: number; // specific growth rate (mu)
  doublingTimeHours: number; // ln(2) / mu
  initialCountEstimate: number; // N0 from intercept
  rSquared: number;
  pointsCount: number;
  predictions: Array<{
    timeHours: number;
    observedCount: number;
    fittedCount: number;
    residual: number;
  }>;
  calculateTimeToTarget: (targetCount: number) => {
    totalHoursFromZero: number;
    hoursFromLastObs: number;
  };
}

/** Fit log-linear exponential cell growth to multiple (t_i, N_i) observations */
export function fitGrowthObservations(observations: GrowthObservation[]): GrowthFitResult {
  const valid = observations
    .filter(p => !isNaN(p.timeHours) && !isNaN(p.count) && p.timeHours >= 0 && p.count > 0)
    .sort((a, b) => a.timeHours - b.timeHours);

  if (valid.length < 2) {
    throw new CellCultureError('At least 2 valid observations with positive cell counts are required.');
  }

  const n = valid.length;
  let sumX = 0;
  let sumY = 0;
  for (const p of valid) {
    sumX += p.timeHours;
    sumY += Math.log(p.count);
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssXX = 0;
  let ssYY = 0;
  let ssXY = 0;

  for (const p of valid) {
    const dx = p.timeHours - meanX;
    const dy = Math.log(p.count) - meanY;
    ssXX += dx * dx;
    ssYY += dy * dy;
    ssXY += dx * dy;
  }

  if (ssXX === 0) {
    throw new CellCultureError('Observations must have distinct elapsed time values.');
  }

  const slope = ssXY / ssXX; // specific growth rate mu
  if (slope <= 0) {
    throw new CellCultureError('Calculated growth rate is zero or negative (no net proliferation observed).');
  }

  const intercept = meanY - slope * meanX; // ln(N0)
  const doublingTimeHours = Math.LN2 / slope;
  const initialCountEstimate = Math.exp(intercept);

  const rSquared = ssYY === 0 ? 1 : Math.max(0, Math.min(1, (ssXY * ssXY) / (ssXX * ssYY)));

  const predictions = valid.map(p => {
    const fittedCount = Math.exp(intercept + slope * p.timeHours);
    return {
      timeHours: p.timeHours,
      observedCount: p.count,
      fittedCount,
      residual: p.count - fittedCount,
    };
  });

  const lastObs = valid[valid.length - 1]!;

  const calculateTimeToTarget = (targetCount: number) => {
    if (targetCount <= 0) {
      throw new CellCultureError('Target count must be greater than zero.');
    }
    const totalHoursFromZero = (Math.log(targetCount) - intercept) / slope;
    const hoursFromLastObs = Math.max(0, (Math.log(targetCount) - Math.log(lastObs.count)) / slope);
    return {
      totalHoursFromZero,
      hoursFromLastObs,
    };
  };

  return {
    growthRatePerHour: slope,
    doublingTimeHours,
    initialCountEstimate,
    rSquared,
    pointsCount: n,
    predictions,
    calculateTimeToTarget,
  };
}

export interface HarvestPredictionInput {
  initialCount: number;
  targetCount: number;
  doublingTimeHours: number;
  startDateTime?: string | Date;
}

export interface HarvestPredictionResult {
  doublingsRequired: number;
  hoursRequired: number;
  daysAndHoursText: string;
  startDate: Date;
  targetDate: Date;
  targetDateIso: string;
  targetDateFormatted: string;
  windowEarlyHours: number;
  windowLateHours: number;
  windowEarlyDate: Date;
  windowLateDate: Date;
  windowEarlyFormatted: string;
  windowLateFormatted: string;
}

/** Calculate exact future calendar date/time when cells will reach target yield */
export function calculateHarvestTime({
  initialCount,
  targetCount,
  doublingTimeHours,
  startDateTime,
}: HarvestPredictionInput): HarvestPredictionResult {
  if (initialCount <= 0 || targetCount <= 0) {
    throw new CellCultureError('Initial and target counts must be strictly positive.');
  }
  if (doublingTimeHours <= 0) {
    throw new CellCultureError('Doubling time must be greater than zero.');
  }
  if (targetCount < initialCount) {
    throw new CellCultureError('Target count must be greater than or equal to initial seeding count.');
  }

  const doublingsRequired = Math.log2(targetCount / initialCount);
  const hoursRequired = doublingsRequired * doublingTimeHours;

  const totalMinutes = Math.round(hoursRequired * 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingMinutes = totalMinutes % (24 * 60);
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  const daysAndHoursText = `${hoursRequired.toFixed(1)} h (${parts.join(' ')})`;

  let startDate: Date;
  if (!startDateTime) {
    startDate = new Date();
  } else if (typeof startDateTime === 'string') {
    startDate = new Date(startDateTime);
    if (isNaN(startDate.getTime())) {
      startDate = new Date();
    }
  } else {
    startDate = startDateTime;
  }

  const targetMillis = startDate.getTime() + hoursRequired * 3600 * 1000;
  const targetDate = new Date(targetMillis);

  // 10% biological doubling variance window
  const windowEarlyHours = doublingsRequired * (doublingTimeHours * 0.9);
  const windowLateHours = doublingsRequired * (doublingTimeHours * 1.1);

  const windowEarlyDate = new Date(startDate.getTime() + windowEarlyHours * 3600 * 1000);
  const windowLateDate = new Date(startDate.getTime() + windowLateHours * 3600 * 1000);

  const formatOptions: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  const targetDateFormatted = targetDate.toLocaleString(undefined, formatOptions);
  const windowEarlyFormatted = windowEarlyDate.toLocaleString(undefined, formatOptions);
  const windowLateFormatted = windowLateDate.toLocaleString(undefined, formatOptions);

  return {
    doublingsRequired,
    hoursRequired,
    daysAndHoursText,
    startDate,
    targetDate,
    targetDateIso: targetDate.toISOString(),
    targetDateFormatted,
    windowEarlyHours,
    windowLateHours,
    windowEarlyDate,
    windowLateDate,
    windowEarlyFormatted,
    windowLateFormatted,
  };
}

