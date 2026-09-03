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
