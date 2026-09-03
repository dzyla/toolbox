/**
 * Colony and Tally counting core calculations and algorithms.
 */

export interface ColonySpot {
  id: string;
  x: number; // normalized 0..1 or pixel coord
  y: number;
  category: string;
  radius?: number;
}

export interface ColonyCategory {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_COLONY_CATEGORIES: ColonyCategory[] = [
  { id: 'cat-1', name: 'Primary Colony', color: '#ef4444' }, // Red
  { id: 'cat-2', name: 'Secondary / Small', color: '#3b82f6' }, // Blue
  { id: 'cat-3', name: 'White / Clear', color: '#10b981' }, // Green
  { id: 'cat-4', name: 'Contaminant', color: '#f59e0b' }, // Amber
];

/** Calculate CFU per mL from colony count, volume plated, and dilution factor */
export function calculateCfu({
  coloniesCounted,
  volumePlatedMl,
  dilutionFactor,
}: {
  coloniesCounted: number;
  volumePlatedMl: number;
  dilutionFactor: number; // e.g. 10^-5 or 100000
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

  // If dilution factor is passed as e.g. 1e-5 (dilution), invert it.
  const actualDilution = dilutionFactor < 1 ? 1 / dilutionFactor : dilutionFactor;
  const cfuPerMl = (coloniesCounted / volumePlatedMl) * actualDilution;
  const dilutionExponent = Math.log10(actualDilution);

  return {
    cfuPerMl,
    totalCfuPlated: coloniesCounted,
    dilutionExponent,
  };
}

export interface TallyCounter {
  id: string;
  name: string;
  count: number;
  step: number;
  goal?: number;
  color: string;
}
