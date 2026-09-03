/**
 * Ultrafiltration & Dialysis Buffer Exchange Simulator
 * Models diafiltration volume (DFV), stepwise solute dilution,
 * equilibrium dialysis, and MWCO protein retention efficiency.
 */

export type ExchangeMode = 'ultrafiltration' | 'dialysis';

export interface SoluteTarget {
  id: string;
  name: string;
  initialConc: number; // mM or %
  bufferConc: number; // mM or % in exchange buffer
  targetSafeConc: number; // mM or % safe threshold
  unit: string;
}

export interface SpinFilterPreset {
  id: string;
  name: string;
  maxVolumeMl: number;
  deadStopVolumeMl: number;
  availableMwcoKDa: number[];
}

export const SPIN_FILTER_PRESETS: SpinFilterPreset[] = [
  { id: 'amicon_15', name: 'Amicon Ultra-15', maxVolumeMl: 15.0, deadStopVolumeMl: 0.2, availableMwcoKDa: [3, 10, 30, 50, 100] },
  { id: 'amicon_4', name: 'Amicon Ultra-4', maxVolumeMl: 4.0, deadStopVolumeMl: 0.1, availableMwcoKDa: [3, 10, 30, 50, 100] },
  { id: 'amicon_05', name: 'Amicon Ultra-0.5', maxVolumeMl: 0.5, deadStopVolumeMl: 0.015, availableMwcoKDa: [3, 10, 30, 50, 100] },
  { id: 'vivaspin_20', name: 'Vivaspin 20', maxVolumeMl: 20.0, deadStopVolumeMl: 0.15, availableMwcoKDa: [5, 10, 30, 50, 100] },
  { id: 'vivaspin_2', name: 'Vivaspin 2', maxVolumeMl: 2.0, deadStopVolumeMl: 0.05, availableMwcoKDa: [3, 10, 30, 50, 100] },
  { id: 'custom', name: 'Custom Concentrator', maxVolumeMl: 15.0, deadStopVolumeMl: 0.5, availableMwcoKDa: [3, 10, 30, 50, 100] },
];

export const COMMON_SOLUTES: SoluteTarget[] = [
  { id: 'imidazole', name: 'Imidazole', initialConc: 300, bufferConc: 0, targetSafeConc: 5, unit: 'mM' },
  { id: 'nacl', name: 'NaCl', initialConc: 500, bufferConc: 150, targetSafeConc: 150, unit: 'mM' },
  { id: 'dtt', name: 'DTT', initialConc: 10, bufferConc: 0.5, targetSafeConc: 1, unit: 'mM' },
  { id: 'glycerol', name: 'Glycerol', initialConc: 20, bufferConc: 5, targetSafeConc: 5, unit: '%' },
  { id: 'urea', name: 'Urea', initialConc: 6000, bufferConc: 0, targetSafeConc: 50, unit: 'mM' },
];

/**
 * Calculates protein retention status based on MW to MWCO ratio.
 * Millipore / Cytiva golden rule: MW_protein >= 3 * MWCO for >95% retention.
 */
export function evaluateMwco(proteinMwKDa: number, mwcoKDa: number): {
  ratio: number;
  retentionPercent: number;
  status: 'safe' | 'borderline' | 'high_loss';
  recommendation: string;
} {
  if (mwcoKDa <= 0 || proteinMwKDa <= 0) {
    return { ratio: 1, retentionPercent: 50, status: 'high_loss', recommendation: 'Specify valid protein MW and MWCO' };
  }

  const ratio = proteinMwKDa / mwcoKDa;

  if (ratio >= 3.0) {
    return {
      ratio,
      retentionPercent: 98,
      status: 'safe',
      recommendation: `Excellent retention (>98%). Protein mass is ${ratio.toFixed(1)}× MWCO, well above the 3× safety threshold.`,
    };
  } else if (ratio >= 2.0) {
    return {
      ratio,
      retentionPercent: 90,
      status: 'borderline',
      recommendation: `Moderate retention (~90%). Minor protein loss through membrane pores may occur (${ratio.toFixed(1)}× MWCO).`,
    };
  } else if (ratio >= 1.2) {
    return {
      ratio,
      retentionPercent: 70,
      status: 'high_loss',
      recommendation: `High protein loss (~30% loss). Ratio ${ratio.toFixed(1)}× is below the recommended 3× cutoff. Use a smaller MWCO.`,
    };
  } else {
    return {
      ratio,
      retentionPercent: 40,
      status: 'high_loss',
      recommendation: `Severe protein loss (>60%). Target protein will pass through membrane pores. Switch to ${Math.max(3, Math.floor(proteinMwKDa / 3))} kDa MWCO.`,
    };
  }
}

/**
 * Simulates centrifugal ultrafiltration concentration & refilling cycles.
 */
export function simulateUltrafiltration(
  initialVolumeMl: number,
  concentrateVolumeMl: number,
  numCycles: number,
  solute: SoluteTarget
): {
  cycles: {
    cycleNum: number;
    concAfterConcentration: number;
    concAfterRefill: number;
    cumulativeDfv: number;
    removalPct: number;
  }[];
  finalConc: number;
  totalDfv: number;
  cyclesToSafeTarget: number;
} {
  const cycles = [];
  let currentConc = solute.initialConc;
  let cumulativeDfv = 0;
  let cyclesToSafeTarget = -1;

  for (let i = 1; i <= numCycles; i++) {
    // During concentration of freely permeable microsolute: concentration inside retentate remains approximately equal to filtrate
    // Then retentate is refilled with wash buffer (containing bufferConc):
    // C_refill = (currentConc * concentrateVolumeMl + bufferConc * (initialVolumeMl - concentrateVolumeMl)) / initialVolumeMl
    const addedWashMl = initialVolumeMl - concentrateVolumeMl;
    cumulativeDfv += addedWashMl / concentrateVolumeMl;

    const concAfterRefill =
      (currentConc * concentrateVolumeMl + solute.bufferConc * addedWashMl) / initialVolumeMl;

    const removalPct =
      solute.initialConc > solute.bufferConc
        ? Math.min(100, Math.max(0, ((solute.initialConc - concAfterRefill) / (solute.initialConc - solute.bufferConc)) * 100))
        : 100;

    cycles.push({
      cycleNum: i,
      concAfterConcentration: currentConc,
      concAfterRefill,
      cumulativeDfv,
      removalPct,
    });

    currentConc = concAfterRefill;

    if (cyclesToSafeTarget === -1 && currentConc <= solute.targetSafeConc) {
      cyclesToSafeTarget = i;
    }
  }

  // Calculate needed cycles if not reached within numCycles
  if (cyclesToSafeTarget === -1 && solute.initialConc > solute.targetSafeConc && solute.targetSafeConc > solute.bufferConc) {
    const dilutionRatioPerCycle = concentrateVolumeMl / initialVolumeMl;
    const requiredTotalDilution = (solute.targetSafeConc - solute.bufferConc) / (solute.initialConc - solute.bufferConc);
    cyclesToSafeTarget = Math.ceil(Math.log(requiredTotalDilution) / Math.log(dilutionRatioPerCycle));
  }

  return {
    cycles,
    finalConc: currentConc,
    totalDfv: cumulativeDfv,
    cyclesToSafeTarget: cyclesToSafeTarget > 0 ? cyclesToSafeTarget : 1,
  };
}

/**
 * Simulates dialysis equilibrium exchange across bath changes.
 */
export function simulateDialysis(
  sampleVolumeMl: number,
  bathVolumeMl: number,
  bathChanges: number,
  solute: SoluteTarget
): {
  steps: {
    stepNum: number;
    equilibriumConc: number;
    removalPct: number;
    dilutionFactor: number;
  }[];
  finalConc: number;
  changesToSafeTarget: number;
} {
  const steps = [];
  let currentConc = solute.initialConc;
  let changesToSafeTarget = -1;

  for (let k = 1; k <= bathChanges; k++) {
    // Equilibrium: (C_prev * V_sample + C_buffer * V_bath) / (V_sample + V_bath)
    const eqConc =
      (currentConc * sampleVolumeMl + solute.bufferConc * bathVolumeMl) / (sampleVolumeMl + bathVolumeMl);

    const removalPct =
      solute.initialConc > solute.bufferConc
        ? Math.min(100, Math.max(0, ((solute.initialConc - eqConc) / (solute.initialConc - solute.bufferConc)) * 100))
        : 100;

    steps.push({
      stepNum: k,
      equilibriumConc: eqConc,
      removalPct,
      dilutionFactor: (sampleVolumeMl + bathVolumeMl) / sampleVolumeMl,
    });

    currentConc = eqConc;

    if (changesToSafeTarget === -1 && currentConc <= solute.targetSafeConc) {
      changesToSafeTarget = k;
    }
  }

  return {
    steps,
    finalConc: currentConc,
    changesToSafeTarget: changesToSafeTarget > 0 ? changesToSafeTarget : 1,
  };
}
