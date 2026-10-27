/**
 * Colony and Tally counting core calculations and automated computer-vision detection.
 */

export interface ColonySpot {
  id: string;
  x: number;
  y: number;
  category: string;
  radius?: number;
  certainty?: number; // 0..1
  isManual?: boolean;
}

export interface ColonyCategory {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_COLONY_CATEGORIES: ColonyCategory[] = [
  { id: 'cat-1', name: 'Primary Colony', color: '#10b981' }, // Emerald
  { id: 'cat-2', name: 'Secondary / Small', color: '#3b82f6' }, // Blue
  { id: 'cat-3', name: 'Low Certainty', color: '#f59e0b' }, // Amber
  { id: 'cat-4', name: 'Manual Tag', color: '#ec4899' }, // Pink
];

export interface SizeDistributionBin {
  binLabel: string;
  binLabelMm?: string;
  minRadius: number;
  maxRadius: number;
  minRadiusMm?: number;
  maxRadiusMm?: number;
  count: number;
  percentage: number;
}

export interface SizeDistributionStats {
  totalCount: number;
  meanRadius: number;
  meanDiameter: number;
  stdDev: number;
  cvPercent: number;
  bins: SizeDistributionBin[];
  meanRadiusMm?: number;
  meanDiameterMm?: number;
  stdDevMm?: number;
}

export interface ColonyPhysicalMetrics {
  radiusMm: number;
  diameterMm: number;
  areaMm2: number;
  distanceFromCenterMm: number;
}

export interface PlatePhysicalSummary {
  dishDiameterMm: number;
  dishAreaCm2: number;
  pixelsPerMm: number;
  mmPerPixel: number;
  platingDensityCfuPerCm2: number;
  meanDiameterMm: number;
  meanAreaMm2: number;
  densityStatus: 'sparse' | 'optimal' | 'dense' | 'confluent';
}

export interface PetriDishPreset {
  label: string;
  diameterMm: number;
  description: string;
}

export const PETRI_DISH_PRESETS: PetriDishPreset[] = [
  { label: '90 mm (Standard Petri)', diameterMm: 90, description: 'Standard 90 × 15 mm microbiology Petri dish' },
  { label: '100 mm (Falcon / BD)', diameterMm: 100, description: '100 mm culture dish (approx. 78.5 cm² area)' },
  { label: '60 mm (Contact / Grid)', diameterMm: 60, description: 'Small 60 mm grid/contact plate (approx. 28.3 cm² area)' },
  { label: '150 mm (Bioassay / Mega)', diameterMm: 150, description: 'Large 150 mm bioassay/cloning plate (approx. 176.7 cm² area)' },
];

/** Calculate physical dimensions of a colony from pixel radius, position, and dish scale */
export function calculateColonyPhysicalMetrics(
  radiusPx: number,
  x: number,
  y: number,
  dishCenter: { cx: number; cy: number },
  mmPerPixel: number,
): ColonyPhysicalMetrics {
  const radiusMm = radiusPx * mmPerPixel;
  const diameterMm = radiusMm * 2;
  const areaMm2 = Math.PI * radiusMm * radiusMm;
  const distPx = Math.hypot(x - dishCenter.cx, y - dishCenter.cy);
  const distanceFromCenterMm = distPx * mmPerPixel;

  return {
    radiusMm,
    diameterMm,
    areaMm2,
    distanceFromCenterMm,
  };
}

/** Calculate overall plate physical summary and colony plating density */
export function calculatePlatePhysicalSummary(
  colonyCount: number,
  meanRadiusPx: number,
  dishDiameterMm: number,
  dishRadiusPx: number,
): PlatePhysicalSummary {
  const safeDishR = dishRadiusPx > 0 ? dishRadiusPx : 215;
  const dishRadiusMm = dishDiameterMm / 2;
  const mmPerPixel = dishRadiusMm / safeDishR;
  const pixelsPerMm = 1 / mmPerPixel;

  const dishRadiusCm = dishDiameterMm / 20;
  const dishAreaCm2 = Math.PI * dishRadiusCm * dishRadiusCm;

  const platingDensityCfuPerCm2 = dishAreaCm2 > 0 ? colonyCount / dishAreaCm2 : 0;

  const meanRadiusMm = meanRadiusPx * mmPerPixel;
  const meanDiameterMm = meanRadiusMm * 2;
  const meanAreaMm2 = Math.PI * meanRadiusMm * meanRadiusMm;

  let densityStatus: 'sparse' | 'optimal' | 'dense' | 'confluent' = 'optimal';
  if (colonyCount < 30) densityStatus = 'sparse';
  else if (colonyCount <= 300) densityStatus = 'optimal';
  else if (colonyCount <= 600) densityStatus = 'dense';
  else densityStatus = 'confluent';

  return {
    dishDiameterMm,
    dishAreaCm2,
    pixelsPerMm,
    mmPerPixel,
    platingDensityCfuPerCm2,
    meanDiameterMm,
    meanAreaMm2,
    densityStatus,
  };
}

/** Calculate CFU per mL from colony count, volume plated, and dilution factor */
export function calculateCfu({
  coloniesCounted,
  volumePlatedMl,
  dilutionFactor,
}: {
  coloniesCounted: number;
  volumePlatedMl: number;
  dilutionFactor: number;
}): {
  cfuPerMl: number;
  totalCfuPlated: number;
  dilutionExponent: number;
} {
  if (volumePlatedMl <= 0) {
    throw new Error('Volume plated must be greater than zero.');
  }
  if (dilutionFactor <= 0) {
    throw new Error('Dilution factor must be greater than zero.');
  }
  if (coloniesCounted < 0) {
    throw new Error('Colony count cannot be negative.');
  }

  const actualDilution = dilutionFactor < 1 ? 1 / dilutionFactor : dilutionFactor;
  const cfuPerMl = (coloniesCounted / volumePlatedMl) * actualDilution;
  const dilutionExponent = Math.log10(actualDilution);

  return {
    cfuPerMl,
    totalCfuPlated: coloniesCounted,
    dilutionExponent,
  };
}

/** Compute size distribution statistics and histogram bins */
export function computeSizeDistribution(
  colonies: ColonySpot[],
  mmPerPixel?: number,
): SizeDistributionStats {
  if (colonies.length === 0) {
    return {
      totalCount: 0,
      meanRadius: 0,
      meanDiameter: 0,
      stdDev: 0,
      cvPercent: 0,
      bins: [],
      meanRadiusMm: 0,
      meanDiameterMm: 0,
      stdDevMm: 0,
    };
  }

  const radii = colonies.map(c => c.radius || 4);
  const n = radii.length;
  const meanRadius = radii.reduce((a, b) => a + b, 0) / n;
  const variance = radii.reduce((acc, r) => acc + Math.pow(r - meanRadius, 2), 0) / (n > 1 ? n - 1 : 1);
  const stdDev = Math.sqrt(variance);
  const cvPercent = meanRadius > 0 ? (stdDev / meanRadius) * 100 : 0;

  const minR = Math.min(...radii);
  const maxR = Math.max(...radii);
  const numBins = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(n))));
  const binStep = Math.max(0.5, (maxR - minR) / numBins);

  const scale = mmPerPixel ?? 1;
  const bins: SizeDistributionBin[] = [];
  for (let i = 0; i < numBins; i++) {
    const low = minR + i * binStep;
    const high = i === numBins - 1 ? maxR + 0.01 : low + binStep;
    const inBin = radii.filter(r => r >= low && r < high).length;
    bins.push({
      binLabel: `${(low * 2).toFixed(1)}–${(high * 2).toFixed(1)} px`,
      binLabelMm: mmPerPixel ? `${(low * 2 * scale).toFixed(2)}–${(high * 2 * scale).toFixed(2)} mm` : undefined,
      minRadius: low,
      maxRadius: high,
      minRadiusMm: mmPerPixel ? low * scale : undefined,
      maxRadiusMm: mmPerPixel ? high * scale : undefined,
      count: inBin,
      percentage: n > 0 ? (inBin / n) * 100 : 0,
    });
  }

  return {
    totalCount: n,
    meanRadius,
    meanDiameter: meanRadius * 2,
    stdDev,
    cvPercent,
    bins,
    meanRadiusMm: mmPerPixel ? meanRadius * mmPerPixel : undefined,
    meanDiameterMm: mmPerPixel ? meanRadius * 2 * mmPerPixel : undefined,
    stdDevMm: mmPerPixel ? stdDev * mmPerPixel : undefined,
  };
}

export { detectPetriDishBoundary } from './dish';
export type { DishBoundary } from './dish';
export { detectColonies } from './detect';
export type { DetectOptions, DetectResult, Polarity, RgbaImage } from './detect';

export interface TallyCounter {
  id: string;
  name: string;
  count: number;
  step: number;
  goal?: number;
  color: string;
}
