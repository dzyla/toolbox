/**
 * Thermal Shift Assay (DSF / nanoDSF) Analyzer Core Engine.
 *
 * Literature references:
 * 1. Niesen FH, Berglund H, Vedadi M (2007) The use of differential scanning fluorimetry
 *    to detect ligand interactions that promote protein stability. Nat Protoc 2(9):2212-2221.
 * 2. Pantoliano MW, Petrella EC, Kwasnoski JD, et al. (2001) High-density miniaturized
 *    thermal shift assays of proteins. J Biomol Screen 6(6):429-440.
 * 3. Gao K, Oerlemans R, Groves MR (2020) Theory and applications of differential scanning fluorimetry
 *    in early-stage drug discovery. Biophys Rev 12(1):85-104.
 *
 * Pure TypeScript. Zero DOM dependencies.
 */

export const R_GAS = 8.314462618; // Molar gas constant J/(mol·K)

export interface DsfPoint {
  temperature: number; // °C
  fluorescence: number; // Arbitrary units or ratio (e.g. F350/F330)
}

export interface DsfDerivativePoint {
  temperature: number; // °C
  dFdT: number; // Derivative dF/dT or d(ratio)/dT
}

export interface DsfPeak {
  temperature: number; // Peak temperature in °C (refined with parabolic interpolation)
  height: number; // Peak height in dF/dT units (positive for +, negative for -)
  index: number; // Discrete index of maximum / minimum
  prominence: number; // Prominence relative to adjacent troughs
  direction: 'positive' | 'negative';
  sign: '+' | '-';
  label: string; // e.g. "+Tm1", "-Tm2", "+Tm"
  isPrimary?: boolean;
}

export interface BoltzmannFittedPoint {
  temperature: number;
  observed: number;
  fitted: number;
  residual: number;
}

export interface BoltzmannFitResult {
  tm: number; // Melting temperature midpoint in °C
  a: number; // Slope factor (temperature span of unfolding transition) in °C
  fMin: number; // Baseline fluorescence of folded state (or high-temp plateau)
  fMax: number; // Plateau fluorescence of unfolded state (or low-temp baseline)
  r2: number; // Coefficient of determination R²
  rmse: number; // Root mean square error
  sse: number; // Sum of squared errors
  df: number; // Degrees of freedom
  deltaHunf_kJ: number; // Apparent enthalpy of unfolding: ΔH_unf = R · (Tm_K)² / a
  predict: (temperature: number) => number;
  fittedPoints: BoltzmannFittedPoint[];
}

export type DsfEffectClassification =
  | 'strong_stabilizer' // ΔTm >= +4.0 °C
  | 'moderate_stabilizer' // +2.0 °C <= ΔTm < +4.0 °C
  | 'neutral' // -2.0 °C < ΔTm < +2.0 °C
  | 'destabilizer'; // ΔTm <= -2.0 °C

export type DsfChannelType = 'ratio' | 'f330' | 'f350' | 'scattering' | 'raw';

export interface ConditionAnalysis {
  id: string;
  name: string;
  channel?: DsfChannelType;
  capillary?: string;
  rawPoints: DsfPoint[];
  smoothedPoints: DsfPoint[];
  derivativePoints: DsfDerivativePoint[];
  peaks: DsfPeak[];
  primaryPeak: DsfPeak | null;
  tmDerivative: number | null;
  tmSign: '+' | '-';
  boltzmannFit: BoltzmannFitResult | null;
  tmBoltzmann: number | null;
  tm: number; // Effective Tm (from derivative peak or Boltzmann fit)
  deltaTm: number; // Tm(sample) - Tm(reference)
  effect: DsfEffectClassification;
}

export interface DsfScreeningSummary {
  totalConditions: number;
  stabilizersCount: number;
  destabilizersCount: number;
  neutralCount: number;
  maxStabilization: number;
  maxDestabilization: number;
  topHit: { name: string; deltaTm: number; tm: number } | null;
}

export interface DsfScreeningResult {
  temperatures: number[];
  conditions: ConditionAnalysis[];
  referenceConditionId: string;
  referenceTm: number;
  rankedConditions: ConditionAnalysis[];
  summary: DsfScreeningSummary;
}

export interface ParsedCondition {
  name: string;
  fluorescence: number[];
  channel?: DsfChannelType;
  capillary?: string;
}

export interface ParsedDsfData {
  temperatures: number[];
  conditions: ParsedCondition[];
  format?: 'prometheus' | 'standard' | 'biorad' | 'quantstudio' | 'unknown';
  delimiter?: string;
  metadata?: Record<string, string>;
}

// -----------------------------------------------------------------------------
// Scientific Nice-Tick Generation for Responsive Autoscale
// -----------------------------------------------------------------------------

export interface NiceTicksResult {
  min: number;
  max: number;
  ticks: number[];
  step: number;
  decimals: number;
}

/**
 * Generate human-friendly round tick marks and nice bounds across any data span.
 * Handles sub-unit nanoDSF ratios (0.8 - 1.2), high raw fluorescence (10,000 - 80,000 AU),
 * derivatives, and negative values.
 */
export function getNiceTicks(min: number, max: number, maxTicks = 5): NiceTicksResult {
  if (!isFinite(min) || !isFinite(max) || min === max) {
    const val = isFinite(min) ? min : 0;
    const step = val === 0 ? 1 : Math.pow(10, Math.floor(Math.log10(Math.abs(val))));
    return {
      min: Number((val - step).toFixed(4)),
      max: Number((val + step).toFixed(4)),
      ticks: [
        Number((val - step).toFixed(4)),
        Number(val.toFixed(4)),
        Number((val + step).toFixed(4)),
      ],
      step,
      decimals: Math.max(0, -Math.floor(Math.log10(step))),
    };
  }

  if (min > max) {
    const tmp = min;
    min = max;
    max = tmp;
  }

  const span = max - min;
  const rawStep = span / Math.max(1, maxTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalizedStep = rawStep / magnitude;

  let niceFactor = 1;
  if (normalizedStep <= 1.5) niceFactor = 1;
  else if (normalizedStep <= 3) niceFactor = 2;
  else if (normalizedStep <= 7) niceFactor = 5;
  else niceFactor = 10;

  const step = niceFactor * magnitude;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  const eps = step * 0.0001;
  for (let val = niceMin; val <= niceMax + eps; val += step) {
    ticks.push(Number(val.toFixed(8)));
  }

  const decimals = Math.max(0, -Math.floor(Math.log10(step)));

  return {
    min: ticks[0] ?? niceMin,
    max: ticks[ticks.length - 1] ?? niceMax,
    ticks,
    step,
    decimals,
  };
}

// -----------------------------------------------------------------------------
// Savitzky-Golay Filter & Numerical Derivatives
// -----------------------------------------------------------------------------

/**
 * Compute Savitzky-Golay convolution kernel weights for quadratic/cubic smoothing (order 0)
 * or first derivative (order 1) for a given window size (2m + 1).
 */
export function getSavitzkyGolayWeights(windowSize: number, derivativeOrder: 0 | 1): number[] {
  if (windowSize % 2 === 0 || windowSize < 5) {
    throw new Error(`Savitzky-Golay window size must be an odd integer >= 5, got ${windowSize}`);
  }
  const m = (windowSize - 1) / 2;
  const weights = new Array<number>(windowSize);

  if (derivativeOrder === 0) {
    // Degree 2 / 3 polynomial smoothing kernel:
    // c_j = (S4 - S2 * j^2) / (S0 * S4 - S2^2)
    const s0 = 2 * m + 1;
    const s2 = (m * (m + 1) * (2 * m + 1)) / 3;
    const s4 = (m * (m + 1) * (2 * m + 1) * (3 * m * m + 3 * m - 1)) / 15;
    const denom = s0 * s4 - s2 * s2;

    for (let j = -m; j <= m; j++) {
      weights[j + m] = (s4 - s2 * j * j) / denom;
    }
  } else {
    // Degree 2 / 3 polynomial first derivative kernel:
    // c'_j = j / S2
    const s2 = (m * (m + 1) * (2 * m + 1)) / 3;
    for (let j = -m; j <= m; j++) {
      weights[j + m] = j / s2;
    }
  }

  return weights;
}

/**
 * Apply Savitzky-Golay smoothing to a 1D array of values.
 * Uses polynomial extrapolation at boundary edges to avoid truncation.
 */
export function savitzkyGolaySmooth(y: number[], windowSize = 7): number[] {
  const n = y.length;
  if (n < windowSize) {
    return [...y];
  }

  const m = (windowSize - 1) / 2;
  const weights = getSavitzkyGolayWeights(windowSize, 0);
  const out = new Array<number>(n);

  // Interior points
  for (let i = m; i < n - m; i++) {
    let sum = 0;
    for (let j = -m; j <= m; j++) {
      sum += weights[j + m]! * y[i + j]!;
    }
    out[i] = sum;
  }

  // Left boundary points (evaluate first window's fitted quadratic)
  const s0 = 2 * m + 1;
  const s2 = (m * (m + 1) * (2 * m + 1)) / 3;
  const s4 = (m * (m + 1) * (2 * m + 1) * (3 * m * m + 3 * m - 1)) / 15;
  const denom = s0 * s4 - s2 * s2;

  let sumY = 0;
  let sumJY = 0;
  let sumJ2Y = 0;
  for (let j = -m; j <= m; j++) {
    const val = y[m + j]!;
    sumY += val;
    sumJY += j * val;
    sumJ2Y += j * j * val;
  }
  const c0_left = (s4 * sumY - s2 * sumJ2Y) / denom;
  const c1_left = sumJY / s2;
  const c2_left = (s0 * sumJ2Y - s2 * sumY) / denom;

  for (let i = 0; i < m; i++) {
    const j = i - m;
    out[i] = c0_left + c1_left * j + c2_left * j * j;
  }

  // Right boundary points (evaluate last window's fitted quadratic)
  const centerRight = n - 1 - m;
  let sumYR = 0;
  let sumJYR = 0;
  let sumJ2YR = 0;
  for (let j = -m; j <= m; j++) {
    const val = y[centerRight + j]!;
    sumYR += val;
    sumJYR += j * val;
    sumJ2YR += j * j * val;
  }
  const c0_right = (s4 * sumYR - s2 * sumJ2YR) / denom;
  const c1_right = sumJYR / s2;
  const c2_right = (s0 * sumJ2YR - s2 * sumYR) / denom;

  for (let i = n - m; i < n; i++) {
    const j = i - centerRight;
    out[i] = c0_right + c1_right * j + c2_right * j * j;
  }

  return out;
}

/**
 * Compute numerical first derivative dF/dT using Savitzky-Golay filtering.
 * Works on uniform or nearly-uniform temperature steps.
 */
export function savitzkyGolayDerivative(y: number[], x: number[], windowSize = 7): number[] {
  const n = y.length;
  if (n < 2) return new Array<number>(n).fill(0);
  if (n < windowSize) {
    return centralDifferenceDerivative(y, x);
  }

  const m = (windowSize - 1) / 2;
  const weights = getSavitzkyGolayWeights(windowSize, 1);
  const out = new Array<number>(n);

  const meanH = (x[n - 1]! - x[0]!) / (n - 1);

  // Interior points
  for (let i = m; i < n - m; i++) {
    const stepH = (x[i + m]! - x[i - m]!) / (2 * m);
    const h = stepH > 1e-6 ? stepH : meanH;
    let sum = 0;
    for (let j = -m; j <= m; j++) {
      sum += weights[j + m]! * y[i + j]!;
    }
    out[i] = sum / h;
  }

  // Left boundary points using polynomial derivative
  const s0 = 2 * m + 1;
  const s2 = (m * (m + 1) * (2 * m + 1)) / 3;
  const s4 = (m * (m + 1) * (2 * m + 1) * (3 * m * m + 3 * m - 1)) / 15;
  const denom = s0 * s4 - s2 * s2;

  let sumY = 0;
  let sumJY = 0;
  let sumJ2Y = 0;
  for (let j = -m; j <= m; j++) {
    const val = y[m + j]!;
    sumY += val;
    sumJY += j * val;
    sumJ2Y += j * j * val;
  }
  const c1_left = sumJY / s2;
  const c2_left = (s0 * sumJ2Y - s2 * sumY) / denom;
  const hLeft = (x[2 * m]! - x[0]!) / (2 * m);

  for (let i = 0; i < m; i++) {
    const j = i - m;
    out[i] = (c1_left + 2 * c2_left * j) / hLeft;
  }

  // Right boundary points
  const centerRight = n - 1 - m;
  let sumYR = 0;
  let sumJYR = 0;
  let sumJ2YR = 0;
  for (let j = -m; j <= m; j++) {
    const val = y[centerRight + j]!;
    sumYR += val;
    sumJYR += j * val;
    sumJ2YR += j * j * val;
  }
  const c1_right = sumJYR / s2;
  const c2_right = (s0 * sumJ2YR - s2 * sumYR) / denom;
  const hRight = (x[n - 1]! - x[n - 1 - 2 * m]!) / (2 * m);

  for (let i = n - m; i < n; i++) {
    const j = i - centerRight;
    out[i] = (c1_right + 2 * c2_right * j) / hRight;
  }

  return out;
}

/**
 * Standard central difference numerical derivative with 1-sided differences at boundaries.
 */
export function centralDifferenceDerivative(y: number[], x: number[]): number[] {
  const n = y.length;
  const out = new Array<number>(n);
  if (n === 0) return out;
  if (n === 1) {
    out[0] = 0;
    return out;
  }

  // Boundary 0: Forward difference
  const h0 = x[1]! - x[0]!;
  out[0] = h0 !== 0 ? (y[1]! - y[0]!) / h0 : 0;

  // Interior: Central difference
  for (let i = 1; i < n - 1; i++) {
    const h = x[i + 1]! - x[i - 1]!;
    out[i] = h !== 0 ? (y[i + 1]! - y[i - 1]!) / h : 0;
  }

  // Boundary N-1: Backward difference
  const hN = x[n - 1]! - x[n - 2]!;
  out[n - 1] = hN !== 0 ? (y[n - 1]! - y[n - 2]!) / hN : 0;

  return out;
}

// -----------------------------------------------------------------------------
// Peak Finding & Parabolic Vertex Interpolation
// -----------------------------------------------------------------------------

/**
 * Refine peak position and height using 3-point quadratic/parabolic interpolation.
 * Given points (x1, y1), (x2, y2), (x3, y3) where x2 is the discrete extremum:
 */
export function interpolatePeakVertex(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): { peakX: number; peakY: number } {
  const h1 = x2 - x1;
  const h2 = x3 - x2;

  if (Math.abs(h1) < 1e-12 || Math.abs(h2) < 1e-12) {
    return { peakX: x2, peakY: y2 };
  }

  const d1 = (y1 - y2) / h1;
  const d2 = (y3 - y2) / h2;
  const denom = h1 + h2;

  if (Math.abs(denom) < 1e-12) {
    return { peakX: x2, peakY: y2 };
  }

  const A = (d2 + d1) / denom; // Curvature
  const B = (d2 * h1 - d1 * h2) / denom;

  if (A === 0) {
    return { peakX: x2, peakY: y2 };
  }

  const dx = -B / (2 * A);

  // Clamp vertex within the range [-h1, h2]
  if (dx < -h1 || dx > h2) {
    return { peakX: x2, peakY: y2 };
  }

  const peakX = x2 + dx;
  const peakY = y2 + B * dx + A * dx * dx;

  return { peakX, peakY };
}

/**
 * Detect local inflection peaks in derivative curve dF/dT to find protein melting transitions (Tm).
 * Supports standard positive peaks (upward fluorescence melts) and negative peaks
 * (downward nanoDSF ratio transitions / blue shifts / quenching).
 */
export interface FindDsfPeaksOptions {
  minProminenceRatio?: number; // Minimum fraction of global max derivative (default 0.15)
  minAbsoluteHeight?: number; // Minimum absolute derivative value (default 0.0)
  direction?: 'positive' | 'negative' | 'both' | 'auto';
  minTempDistance?: number; // Minimum temperature distance between adjacent peaks in °C (default 3.0)
  maxPeaks?: number; // Maximum number of peaks to retain per trace (default 4)
  removedPeakKeys?: string[]; // Optional array of peak keys removed by user
}

export function findDsfPeaks(
  derivatives: DsfDerivativePoint[],
  options?: FindDsfPeaksOptions,
): DsfPeak[] {
  const n = derivatives.length;
  if (n < 3) return [];

  const minProminenceRatio = options?.minProminenceRatio ?? 0.15;
  const minAbsHeight = options?.minAbsoluteHeight ?? 0.0;
  const reqDirection = options?.direction ?? 'auto';
  const minTempDistance = options?.minTempDistance ?? 3.0;
  const maxPeaks = options?.maxPeaks ?? 4;
  const removedSet = new Set(options?.removedPeakKeys ?? []);

  // Find max positive and min negative derivatives across the entire trace
  let maxPos = 0;
  let minNeg = 0;
  for (let i = 0; i < n; i++) {
    const v = derivatives[i]!.dFdT;
    if (v > maxPos) maxPos = v;
    if (v < minNeg) minNeg = v;
  }

  const maxAbsD = Math.max(maxPos, Math.abs(minNeg));
  if (maxAbsD <= 1e-6) return [];

  let effectiveDirection = reqDirection;
  if (reqDirection === 'auto') {
    // If negative trough magnitude is substantially larger than positive peak, use negative
    if (Math.abs(minNeg) > maxPos * 1.25 && minNeg < 0) {
      effectiveDirection = 'negative';
    } else {
      effectiveDirection = 'positive';
    }
  }

  const rawFound: DsfPeak[] = [];

  // Helper to detect peaks in either direction
  function searchPeaks(isNegative: boolean) {
    // In 'both' mode, ignore the opposite direction if it is negligible noise (< 20% of maxAbsD)
    if (effectiveDirection === 'both') {
      if (isNegative && Math.abs(minNeg) < maxAbsD * 0.20) return;
      if (!isNegative && maxPos < maxAbsD * 0.20) return;
    }

    const vals = derivatives.map(d => (isNegative ? -d.dFdT : d.dFdT));
    const requiredProminence = Math.max(minAbsHeight, maxAbsD * minProminenceRatio);
    const heightThreshold = Math.max(minAbsHeight, maxAbsD * minProminenceRatio * 0.4);

    const candidates: { index: number; prominence: number }[] = [];

    for (let i = 1; i < n - 1; i++) {
      const prev = vals[i - 1]!;
      const curr = vals[i]!;
      const next = vals[i + 1]!;

      // Must be a local maximum above height threshold
      if (curr > prev && curr >= next && curr >= heightThreshold) {
        // Find left valley: minimum value between i and a point exceeding curr (or left boundary)
        let leftValley = curr;
        for (let j = i - 1; j >= 0; j--) {
          if (vals[j]! < leftValley) leftValley = vals[j]!;
          if (vals[j]! > curr) break;
        }

        // Find right valley: minimum value between i and a point exceeding curr (or right boundary)
        let rightValley = curr;
        for (let j = i + 1; j < n; j++) {
          if (vals[j]! < rightValley) rightValley = vals[j]!;
          if (vals[j]! > curr) break;
        }

        const prominence = curr - Math.max(leftValley, rightValley);

        // Crucial: filter on prominence to reject noise ripples!
        if (prominence >= requiredProminence) {
          candidates.push({ index: i, prominence });
        }
      }
    }

    for (const p of candidates) {
      const idx = p.index;
      const p1 = derivatives[idx - 1]!;
      const p2 = derivatives[idx]!;
      const p3 = derivatives[idx + 1]!;

      const y1 = isNegative ? -p1.dFdT : p1.dFdT;
      const y2 = isNegative ? -p2.dFdT : p2.dFdT;
      const y3 = isNegative ? -p3.dFdT : p3.dFdT;

      const { peakX, peakY } = interpolatePeakVertex(
        p1.temperature,
        y1,
        p2.temperature,
        y2,
        p3.temperature,
        y3,
      );

      rawFound.push({
        temperature: Number(peakX.toFixed(2)),
        height: Number((isNegative ? -peakY : peakY).toFixed(4)),
        index: idx,
        prominence: Number(p.prominence.toFixed(4)),
        direction: isNegative ? 'negative' : 'positive',
        sign: isNegative ? '-' : '+',
        label: isNegative ? '-Tm' : '+Tm',
        isPrimary: false,
      });
    }
  }

  if (effectiveDirection === 'both') {
    searchPeaks(false);
    searchPeaks(true);
  } else if (effectiveDirection === 'negative') {
    searchPeaks(true);
  } else {
    searchPeaks(false);
  }

  if (rawFound.length === 0) return [];

  // Filter out any user-removed peaks
  const activeCandidates = rawFound.filter(p => {
    const key1 = `${p.sign}:${p.temperature.toFixed(1)}`;
    const key2 = `${p.sign}${p.temperature.toFixed(1)}`;
    const key3 = `${p.temperature.toFixed(1)}`;
    return !removedSet.has(key1) && !removedSet.has(key2) && !removedSet.has(key3) && !removedSet.has(p.label);
  });

  if (activeCandidates.length === 0) return [];

  // Sort by prominence * height descending for spatial suppression (keep highest prominence in local window)
  activeCandidates.sort((a, b) => (b.prominence * Math.abs(b.height)) - (a.prominence * Math.abs(a.height)));

  // Merge near peaks within minTempDistance
  const spatiallySuppressed: DsfPeak[] = [];
  for (const p of activeCandidates) {
    const tooClose = spatiallySuppressed.some(
      kept => Math.abs(kept.temperature - p.temperature) < minTempDistance,
    );
    if (!tooClose) {
      spatiallySuppressed.push(p);
    }
  }

  // Cap at maxPeaks
  const keptPeaks = spatiallySuppressed.slice(0, maxPeaks);
  if (keptPeaks.length === 0) return [];

  // Identify primary peak (highest prominence * height)
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < keptPeaks.length; i++) {
    const score = keptPeaks[i]!.prominence * Math.abs(keptPeaks[i]!.height);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  const primaryPeakObj = keptPeaks[bestIdx]!;

  // Sort by temperature ascending to number domains cleanly: Tm1 < Tm2 < Tm3
  const tempSorted = [...keptPeaks].sort((a, b) => a.temperature - b.temperature);
  for (let i = 0; i < tempSorted.length; i++) {
    const p = tempSorted[i]!;
    const domainNum = i + 1;
    p.label = `${p.sign}Tm${tempSorted.length > 1 ? domainNum : ''}`;
    p.isPrimary = p === primaryPeakObj;
  }

  // Return primary peak first (for backwards compatibility), followed by others in temperature order
  const primaryPeak = tempSorted.find(p => p.isPrimary) || tempSorted[0]!;
  primaryPeak.isPrimary = true;
  const otherPeaks = tempSorted.filter(p => p !== primaryPeak);

  return [primaryPeak, ...otherPeaks];
}

// -----------------------------------------------------------------------------
// Two-State Boltzmann Sigmoid Fitting
// -----------------------------------------------------------------------------

/**
 * Two-state Boltzmann sigmoid model function:
 * F(T) = Fmin + (Fmax - Fmin) / (1 + exp((Tm - T) / a))
 *
 * For upward transition: Fmin is native baseline, Fmax is unfolded plateau.
 * For downward transition: Fmin is native baseline, Fmax is unfolded plateau (< Fmin).
 */
export function boltzmannSigmoid(
  T: number,
  fMin: number,
  fMax: number,
  tm: number,
  a: number,
): number {
  if (a <= 0) return fMin;
  const exponent = (tm - T) / a;
  // Guard against numerical underflow / overflow
  if (exponent > 50) return fMin;
  if (exponent < -50) return fMax;
  return fMin + (fMax - fMin) / (1 + Math.exp(exponent));
}

/**
 * Nelder-Mead simplex optimizer for robust non-linear parameter estimation.
 */
function optimizeNelderMead(
  costFunc: (params: number[]) => number,
  initial: number[],
  maxIterations = 1800,
  tolerance = 1e-7,
): number[] {
  const n = initial.length;
  const alpha = 1.0;
  const gamma = 2.0;
  const rho = 0.5;
  const sigma = 0.5;

  const simplex: Array<{ p: number[]; cost: number }> = [];
  simplex.push({ p: [...initial], cost: costFunc(initial) });

  for (let i = 0; i < n; i++) {
    const point = [...initial];
    const step = Math.abs(point[i]!) > 1e-4 ? point[i]! * 0.1 : 0.1;
    point[i]! += step;
    simplex.push({ p: point, cost: costFunc(point) });
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    simplex.sort((a, b) => a.cost - b.cost);

    const best = simplex[0]!;
    const worst = simplex[n]!;
    const secondWorst = simplex[n - 1]!;

    if (Math.abs(worst.cost - best.cost) < tolerance) break;

    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      const pi = simplex[i]!.p;
      for (let j = 0; j < n; j++) {
        centroid[j] = (centroid[j] ?? 0) + pi[j]!;
      }
    }
    for (let j = 0; j < n; j++) {
      centroid[j] = (centroid[j] ?? 0) / n;
    }

    const reflected: number[] = [];
    for (let j = 0; j < n; j++) {
      reflected.push(centroid[j]! + alpha * (centroid[j]! - worst.p[j]!));
    }
    const rCost = costFunc(reflected);

    if (rCost < secondWorst.cost && rCost >= best.cost) {
      simplex[n] = { p: reflected, cost: rCost };
      continue;
    }

    if (rCost < best.cost) {
      const expanded: number[] = [];
      for (let j = 0; j < n; j++) {
        expanded.push(centroid[j]! + gamma * (reflected[j]! - centroid[j]!));
      }
      const eCost = costFunc(expanded);
      simplex[n] = eCost < rCost ? { p: expanded, cost: eCost } : { p: reflected, cost: rCost };
      continue;
    }

    const contracted: number[] = [];
    for (let j = 0; j < n; j++) {
      contracted.push(centroid[j]! + rho * (worst.p[j]! - centroid[j]!));
    }
    const cCost = costFunc(contracted);

    if (cCost < worst.cost) {
      simplex[n] = { p: contracted, cost: cCost };
      continue;
    }

    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < n; j++) {
        simplex[i]!.p[j] = best.p[j]! + sigma * (simplex[i]!.p[j]! - best.p[j]!);
      }
      simplex[i]!.cost = costFunc(simplex[i]!.p);
    }
  }

  simplex.sort((a, b) => a.cost - b.cost);
  return simplex[0]!.p;
}

/**
 * Fits a two-state Boltzmann sigmoid model to thermal denaturation data:
 * F(T) = Fmin + (Fmax - Fmin) / (1 + exp((Tm - T) / a)).
 *
 * Supports both standard upward transitions (SYPRO Orange, thermal shift) and
 * downward transitions (nanoDSF tryptophan fluorescence quenching / blue shift).
 * Handles post-transition aggregation roll-off gracefully.
 */
export function fitBoltzmannSigmoid(
  points: DsfPoint[],
  tmHint?: number,
  options?: {
    direction?: 'upward' | 'downward' | 'positive' | 'negative' | 'auto';
  },
): BoltzmannFitResult {
  if (points.length < 5) {
    throw new Error('Boltzmann sigmoid fitting requires at least 5 data points');
  }

  // Sort points by temperature
  const sorted = [...points].sort((a, b) => a.temperature - b.temperature);
  const temps = sorted.map(p => p.temperature);
  const fls = sorted.map(p => p.fluorescence);

  // Approximate numerical derivative to find transition inflection
  const derivs = centralDifferenceDerivative(fls, temps);

  let maxDerivIdx = 0;
  let maxDerivVal = -Infinity;
  let minDerivIdx = 0;
  let minDerivVal = Infinity;

  for (let i = 0; i < derivs.length; i++) {
    if (derivs[i]! > maxDerivVal) {
      maxDerivVal = derivs[i]!;
      maxDerivIdx = i;
    }
    if (derivs[i]! < minDerivVal) {
      minDerivVal = derivs[i]!;
      minDerivIdx = i;
    }
  }

  // Determine transition direction (upward vs downward)
  const n = sorted.length;
  const startChunk = Math.min(5, Math.floor(n / 4));
  const endChunk = Math.min(5, Math.floor(n / 4));
  const startMean = fls.slice(0, startChunk).reduce((a, b) => a + b, 0) / startChunk;
  const endMean = fls.slice(n - endChunk).reduce((a, b) => a + b, 0) / endChunk;

  let isDownward = false;
  if (options?.direction === 'downward' || options?.direction === 'negative') {
    isDownward = true;
  } else if (options?.direction === 'upward' || options?.direction === 'positive') {
    isDownward = false;
  } else {
    // Auto-detect direction:
    if (endMean < startMean && Math.abs(minDerivVal) > Math.max(1e-4, maxDerivVal) * 1.1) {
      isDownward = true;
    }
  }

  const inflectionIdx = isDownward ? minDerivIdx : maxDerivIdx;
  const tmInitial = tmHint ?? temps[inflectionIdx]!;

  // Locate the transition plateau
  let plateauIdx = inflectionIdx;
  if (!isDownward) {
    for (let i = inflectionIdx; i < sorted.length; i++) {
      if (sorted[i]!.fluorescence > sorted[plateauIdx]!.fluorescence) {
        plateauIdx = i;
      }
    }
  } else {
    for (let i = inflectionIdx; i < sorted.length; i++) {
      if (sorted[i]!.fluorescence < sorted[plateauIdx]!.fluorescence) {
        plateauIdx = i;
      }
    }
  }

  // Check for post-plateau aggregation roll-off (or rebound)
  let hasRollOff = false;
  let firstRollOffIdx = sorted.length;
  const plateauFl = sorted[plateauIdx]!.fluorescence;

  if (!isDownward) {
    for (let i = plateauIdx + 1; i < sorted.length; i++) {
      if (sorted[i]!.fluorescence < plateauFl * 0.95) {
        hasRollOff = true;
        firstRollOffIdx = i;
        break;
      }
    }
  } else {
    for (let i = plateauIdx + 1; i < sorted.length; i++) {
      if (sorted[i]!.fluorescence > plateauFl * 1.05) {
        hasRollOff = true;
        firstRollOffIdx = i;
        break;
      }
    }
  }

  const fitEndIdx = hasRollOff ? Math.min(firstRollOffIdx, plateauIdx + 2) : sorted.length;
  const fitSubset = sorted.slice(0, Math.max(plateauIdx + 1, fitEndIdx));
  const subFl = fitSubset.map(p => p.fluorescence);

  let fMinInitial: number;
  let fMaxInitial: number;
  let deltaF: number;
  let aInitial: number;

  if (!isDownward) {
    fMinInitial = Math.min(...subFl.slice(0, Math.max(3, inflectionIdx)));
    fMaxInitial = Math.max(...subFl);
    deltaF = Math.max(1e-3, fMaxInitial - fMinInitial);
    aInitial = Math.max(0.2, Math.min(10.0, deltaF / (4 * Math.max(1e-4, maxDerivVal))));
  } else {
    fMinInitial = Math.max(...subFl.slice(0, Math.max(3, inflectionIdx)));
    fMaxInitial = Math.min(...subFl);
    deltaF = Math.min(-1e-3, fMaxInitial - fMinInitial);
    aInitial = Math.max(0.2, Math.min(10.0, Math.abs(deltaF) / (4 * Math.max(1e-4, Math.abs(minDerivVal)))));
  }

  // Parameters: [fMin, fMax, Tm, a]
  const initialParams = [fMinInitial, fMaxInitial, tmInitial, aInitial];

  const cost = (p: number[]) => {
    const [fMin, fMax, tm, a] = p;
    let sse = 0;
    // Penalize invalid domains
    if (a! <= 0.05) sse += 1e7 * Math.pow(0.05 - a!, 2);
    if (!isDownward) {
      if (fMax! <= fMin!) sse += 1e7 * Math.pow(fMin! - fMax! + 1, 2);
    } else {
      if (fMax! >= fMin!) sse += 1e7 * Math.pow(fMax! - fMin! + 1, 2);
    }
    if (tm! < temps[0]! - 8 || tm! > temps[temps.length - 1]! + 8) sse += 1e6;

    for (const pt of fitSubset) {
      const pred = boltzmannSigmoid(pt.temperature, fMin!, fMax!, tm!, a!);
      sse += Math.pow(pt.fluorescence - pred, 2);
    }
    return sse;
  };

  const optimal = optimizeNelderMead(cost, initialParams);
  const [fMinOpt, fMaxOpt, tmOpt, aOpt] = optimal;

  const predict = (t: number) => boltzmannSigmoid(t, fMinOpt!, fMaxOpt!, tmOpt!, aOpt!);

  // Calculate goodness of fit statistics over the fitted transition region
  let sse = 0;
  let sst = 0;
  const meanY = subFl.reduce((acc, v) => acc + v, 0) / subFl.length;

  const fittedPoints: BoltzmannFittedPoint[] = sorted.map(pt => {
    const pred = predict(pt.temperature);
    return {
      temperature: pt.temperature,
      observed: pt.fluorescence,
      fitted: Number(pred.toFixed(4)),
      residual: Number((pt.fluorescence - pred).toFixed(4)),
    };
  });

  for (const pt of fitSubset) {
    const pred = predict(pt.temperature);
    sse += Math.pow(pt.fluorescence - pred, 2);
    sst += Math.pow(pt.fluorescence - meanY, 2);
  }

  const df = Math.max(1, fitSubset.length - 4);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, Math.min(1.0, 1 - sse / sst)) : 1.0;

  // Apparent unfolding enthalpy: ΔH_unf = R · (Tm_Kelvin)² / a  (Pantoliano 2001)
  const tmKelvin = tmOpt! + 273.15;
  const deltaHunf_kJ = Number(((R_GAS * tmKelvin * tmKelvin) / (Math.max(0.1, aOpt!) * 1000)).toFixed(1));

  return {
    tm: Number(tmOpt!.toFixed(2)),
    a: Number(aOpt!.toFixed(3)),
    fMin: Number(fMinOpt!.toFixed(3)),
    fMax: Number(fMaxOpt!.toFixed(3)),
    r2: Number(r2.toFixed(4)),
    rmse: Number(rmse.toFixed(4)),
    sse: Number(sse.toFixed(4)),
    df,
    deltaHunf_kJ,
    predict,
    fittedPoints,
  };
}

// -----------------------------------------------------------------------------
// Universal Multi-Instrument CSV / TSV Parser
// Supports Prometheus nanoDSF, Bio-Rad CFX, QuantStudio, LightCycler
// -----------------------------------------------------------------------------

function cleanNumericToken(raw: string, isEuropeanComma: boolean): number {
  let s = raw.trim().replace(/^["']|["']$/g, '');
  if (isEuropeanComma || (s.includes(',') && !s.includes('.') && /^-?\d+,\d+$/.test(s))) {
    s = s.replace(',', '.');
  }
  return parseFloat(s);
}

function detectChannelFromHeader(header: string): DsfChannelType {
  const lower = header.toLowerCase();
  if (lower.includes('ratio') || lower.includes('350/330') || lower.includes('350 / 330') || lower.includes('f350/f330')) {
    return 'ratio';
  }
  if (lower.includes('330') || lower.includes('f330')) {
    return 'f330';
  }
  if (lower.includes('350') || lower.includes('f350')) {
    return 'f350';
  }
  if (lower.includes('scatter') || lower.includes('backref') || lower.includes('turbid')) {
    return 'scattering';
  }
  return 'raw';
}

function extractCapillary(name: string): string | undefined {
  const match = name.match(/\b(?:capillary|cap|c|well|pos)\s*([0-9]+|[a-h][0-9]{1,2})\b/i);
  return match ? match[0] : undefined;
}

/**
 * Parses multi-column CSV/TSV data from thermal cyclers and nanoDSF instruments.
 * Auto-detects delimiters (tab, comma, semicolon), European comma decimals,
 * Prometheus multi-wavelength columns, and preamble metadata lines.
 */
export function parseDsfCsv(text: string): ParsedDsfData {
  const rawLines = text.split(/\r?\n/);
  if (rawLines.length === 0 || !text.trim()) {
    throw new Error('Input text is empty');
  }

  // Detect delimiter and check for European comma decimals
  let tabCount = 0;
  let semiCount = 0;
  let commaCount = 0;

  for (let i = 0; i < Math.min(30, rawLines.length); i++) {
    const l = rawLines[i]!;
    for (const ch of l) {
      if (ch === '\t') tabCount++;
      else if (ch === ';') semiCount++;
      else if (ch === ',') commaCount++;
    }
  }

  let delimiter = ',';
  if (tabCount > 0 && tabCount >= semiCount && tabCount >= commaCount) {
    delimiter = '\t';
  } else if (semiCount > 0) {
    delimiter = ';';
  } else {
    delimiter = ',';
  }

  // Check if European decimal format (e.g. 25,0; 1,234)
  const isEuropeanComma = delimiter === ';' || delimiter === '\t';

  const metadata: Record<string, string> = {};
  let headerRowIndex = -1;
  let tempColIndex = 0;
  let prevHeaderRowIndex = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!.trim();
    if (!line) continue;

    // Collect metadata lines
    if (line.startsWith('#') || line.startsWith('//')) {
      const clean = line.replace(/^[#\/]+\s*/, '');
      const colonIdx = clean.indexOf(':');
      if (colonIdx > 0) {
        const k = clean.slice(0, colonIdx).trim();
        const v = clean.slice(colonIdx + 1).trim();
        metadata[k] = v;
      }
      continue;
    }

    const tokens = line.split(delimiter).map(t => t.trim().replace(/^["']|["']$/g, ''));
    if (tokens.length < 2) continue;

    // Search for Temperature column anywhere in the tokens
    let foundTemp = false;
    for (let c = 0; c < tokens.length; c++) {
      const tok = tokens[c]!.toLowerCase();
      if (
        tok.includes('temp') ||
        tok.includes('°c') ||
        tok.includes('deg') ||
        tok === 't' ||
        tok === 't(°c)' ||
        tok === 't [°c]' ||
        tok === 'temperature [°c]'
      ) {
        tempColIndex = c;
        headerRowIndex = i;
        foundTemp = true;
        break;
      }
    }

    if (foundTemp) {
      // Check if previous line had capillary or condition labels (Prometheus 2-line header)
      if (i > 0) {
        const prevLine = rawLines[i - 1]!.trim();
        if (prevLine && !prevLine.startsWith('#')) {
          const prevTokens = prevLine.split(delimiter).map(t => t.trim().replace(/^["']|["']$/g, ''));
          if (prevTokens.length >= tokens.length - 1) {
            prevHeaderRowIndex = i - 1;
          }
        }
      }
      break;
    }

    // Check if line is purely numeric (data without headers)
    const num0 = cleanNumericToken(tokens[0]!, isEuropeanComma);
    const num1 = cleanNumericToken(tokens[1]!, isEuropeanComma);
    if (!isNaN(num0) && !isNaN(num1)) {
      headerRowIndex = -1;
      tempColIndex = 0;
      break;
    }
  }

  // Extract column condition names
  const conditionHeaders: { name: string; colIndex: number; channel: DsfChannelType; capillary?: string }[] = [];
  let dataStartIndex = 0;

  if (headerRowIndex >= 0) {
    const tokens = rawLines[headerRowIndex]!.split(delimiter).map(t => t.trim().replace(/^["']|["']$/g, ''));
    dataStartIndex = headerRowIndex + 1;

    let prevTokens: string[] = [];
    if (prevHeaderRowIndex >= 0) {
      prevTokens = rawLines[prevHeaderRowIndex]!.split(delimiter).map(t => t.trim().replace(/^["']|["']$/g, ''));
    }

    for (let c = 0; c < tokens.length; c++) {
      if (c === tempColIndex) continue;
      const tok = tokens[c]!;
      const prevTok = prevTokens[c] || '';

      // Skip empty or non-trace columns like 'Time' or 'Point'
      const lowerTok = tok.toLowerCase();
      if ((lowerTok === 'time' || lowerTok === 'time [s]' || lowerTok === 'time (s)' || lowerTok === 'point') && c === 0) {
        continue;
      }

      let combinedName = tok || `Condition ${c + 1}`;
      if (prevTok && prevTok.toLowerCase() !== 'capillary' && prevTok.toLowerCase() !== 'sample') {
        combinedName = tok ? `${prevTok} - ${tok}` : prevTok;
      }

      const channel = detectChannelFromHeader(combinedName);
      const capillary = extractCapillary(combinedName) || (prevTok ? extractCapillary(prevTok) : undefined);

      conditionHeaders.push({
        name: combinedName,
        colIndex: c,
        channel,
        capillary,
      });
    }
  }

  // Parse data rows
  const tempVals: number[] = [];
  const colVals: number[][] = [];

  for (let i = dataStartIndex; i < rawLines.length; i++) {
    const rawLine = rawLines[i]!.trim();
    if (!rawLine || rawLine.startsWith('#') || rawLine.startsWith('//')) continue;

    const tokens = rawLine.split(delimiter).map(t => t.trim().replace(/^["']|["']$/g, ''));
    if (tokens.length < 2) continue;

    const tVal = cleanNumericToken(tokens[tempColIndex] ?? '', isEuropeanComma);
    if (isNaN(tVal)) continue;

    // If headers were not provided, auto-populate conditionHeaders on first numeric row
    if (conditionHeaders.length === 0) {
      for (let c = 1; c < tokens.length; c++) {
        conditionHeaders.push({
          name: `Condition ${c}`,
          colIndex: c,
          channel: 'raw',
        });
      }
    }

    const rowNums: number[] = [];
    for (let h = 0; h < conditionHeaders.length; h++) {
      const cIdx = conditionHeaders[h]!.colIndex;
      const val = cleanNumericToken(tokens[cIdx] ?? '', isEuropeanComma);
      rowNums.push(isNaN(val) ? 0 : val);
    }

    if (rowNums.length === 0) continue;

    while (colVals.length < rowNums.length) {
      colVals.push([]);
    }

    tempVals.push(tVal);
    for (let c = 0; c < rowNums.length; c++) {
      colVals[c]!.push(rowNums[c]!);
    }
  }

  if (tempVals.length === 0) {
    throw new Error('No valid numeric temperature-fluorescence rows found in data');
  }

  // Detect format
  let detectedFormat: ParsedDsfData['format'] = 'standard';
  const hasPrometheusKeywords = Object.keys(metadata).some(k => k.toLowerCase().includes('pr.') || k.toLowerCase().includes('prometheus')) ||
    conditionHeaders.some(c => c.channel === 'ratio' || c.channel === 'f330' || c.channel === 'f350');

  if (hasPrometheusKeywords) {
    detectedFormat = 'prometheus';
  }

  const conditions: ParsedCondition[] = colVals.map((vals, idx) => {
    const headerInfo = conditionHeaders[idx];
    const name = headerInfo?.name && headerInfo.name.length > 0
      ? headerInfo.name
      : idx === 0
      ? 'Condition 1'
      : `Condition ${idx + 1}`;

    return {
      name,
      fluorescence: vals,
      channel: headerInfo?.channel ?? 'raw',
      capillary: headerInfo?.capillary,
    };
  });

  return {
    temperatures: tempVals,
    conditions,
    format: detectedFormat,
    delimiter,
    metadata,
  };
}

// -----------------------------------------------------------------------------
// Multi-Condition Screening & Delta Tm Analysis Engine
// -----------------------------------------------------------------------------

/**
 * Classify stability effect based on thermal shift ΔTm (°C).
 */
export function classifyDsfEffect(deltaTm: number): DsfEffectClassification {
  if (deltaTm >= 4.0) return 'strong_stabilizer';
  if (deltaTm >= 2.0) return 'moderate_stabilizer';
  if (deltaTm <= -2.0) return 'destabilizer';
  return 'neutral';
}

export interface AnalyzeDsfOptions {
  referenceNameOrIndex?: string | number;
  windowSize?: number;
  tmMethod?: 'derivative' | 'boltzmann';
  selectedConditionIds?: string[];
  tempRange?: [number, number];
  direction?: 'auto' | 'positive' | 'negative' | 'both';
  peakProminenceRatio?: number;
  minTempDistance?: number;
  maxPeaks?: number;
  removedPeakKeys?: string[];
  normalizationMode?: 'raw' | 'minmax' | 'fraction_unfolded';
}

/**
 * Comprehensive analysis of multi-condition thermal shift screening data.
 * Supports selective trace analysis, temperature range cropping, auto-direction,
 * Savitzky-Golay smoothing, peak finding, and Boltzmann sigmoid fitting.
 */
export function analyzeDsfDataset(
  parsed: ParsedDsfData,
  options?: AnalyzeDsfOptions,
): DsfScreeningResult {
  const windowSize = options?.windowSize ?? 7;
  const tmMethod = options?.tmMethod ?? 'derivative';
  const direction = options?.direction ?? 'auto';
  const peakProminenceRatio = options?.peakProminenceRatio ?? 0.15;

  // Apply temperature range crop if specified
  let validIndices = parsed.temperatures.map((_, i) => i);
  if (options?.tempRange) {
    const [minT, maxT] = options.tempRange;
    validIndices = validIndices.filter(i => {
      const t = parsed.temperatures[i]!;
      return t >= minT && t <= maxT;
    });
    if (validIndices.length < 5) {
      // Revert if crop is too aggressive
      validIndices = parsed.temperatures.map((_, i) => i);
    }
  }

  const croppedTemps = validIndices.map(i => parsed.temperatures[i]!);

  // Filter conditions by selectedConditionIds if provided
  let candidateConditions = parsed.conditions.map((cond, idx) => ({
    cond,
    rawIndex: idx,
    id: `cond_${idx + 1}`,
  }));

  if (options?.selectedConditionIds !== undefined) {
    const selSet = new Set(options.selectedConditionIds);
    candidateConditions = candidateConditions.filter(
      c => selSet.has(c.id) || selSet.has(c.cond.name) || selSet.has(String(c.rawIndex)),
    );
  }

  if (candidateConditions.length === 0) {
    return {
      temperatures: croppedTemps,
      conditions: [],
      referenceConditionId: '',
      referenceTm: 0,
      rankedConditions: [],
      summary: {
        totalConditions: 0,
        stabilizersCount: 0,
        destabilizersCount: 0,
        neutralCount: 0,
        maxStabilization: 0,
        maxDestabilization: 0,
        topHit: null,
      },
    };
  }

  // Analyze each selected condition independently
  const conditions: ConditionAnalysis[] = candidateConditions.map(({ cond, id }) => {
    const rawPoints: DsfPoint[] = validIndices.map((origIdx, subIdx) => ({
      temperature: croppedTemps[subIdx]!,
      fluorescence: cond.fluorescence[origIdx] ?? 0,
    }));

    const fls = rawPoints.map(p => p.fluorescence);
    const smoothedFl = savitzkyGolaySmooth(fls, windowSize);
    const dFdT = savitzkyGolayDerivative(fls, croppedTemps, windowSize);

    const smoothedPoints: DsfPoint[] = croppedTemps.map((t, i) => ({
      temperature: t,
      fluorescence: Number(smoothedFl[i]!.toFixed(4)),
    }));

    const derivativePoints: DsfDerivativePoint[] = croppedTemps.map((t, i) => ({
      temperature: t,
      dFdT: Number(dFdT[i]!.toFixed(4)),
    }));

    // Extract condition-specific removed peak keys
    const condRemovedKeys = (options?.removedPeakKeys ?? []).flatMap(k => {
      if (k.startsWith(`${id}:`)) {
        return [k.slice(id.length + 1)];
      }
      return [k];
    });

    const peaks = findDsfPeaks(derivativePoints, {
      direction,
      minProminenceRatio: peakProminenceRatio,
      minTempDistance: options?.minTempDistance,
      maxPeaks: options?.maxPeaks,
      removedPeakKeys: condRemovedKeys,
    });
    const primaryPeak = peaks.length > 0 ? peaks[0]! : null;
    const tmDerivative = primaryPeak ? primaryPeak.temperature : null;
    const tmSign: '+' | '-' = primaryPeak ? primaryPeak.sign : (direction === 'negative' ? '-' : '+');

    let boltzmannFit: BoltzmannFitResult | null = null;
    let tmBoltzmann: number | null = null;

    try {
      boltzmannFit = fitBoltzmannSigmoid(
        rawPoints,
        tmDerivative ?? undefined,
        { direction: direction === 'both' ? 'auto' : direction },
      );
      tmBoltzmann = boltzmannFit.tm;
    } catch {
      boltzmannFit = null;
      tmBoltzmann = null;
    }

    const effectiveTm =
      tmMethod === 'boltzmann' && tmBoltzmann !== null
        ? tmBoltzmann
        : tmDerivative !== null
        ? tmDerivative
        : tmBoltzmann !== null
        ? tmBoltzmann
        : croppedTemps[Math.floor(croppedTemps.length / 2)]!;

    return {
      id,
      name: cond.name,
      channel: cond.channel,
      capillary: cond.capillary,
      rawPoints,
      smoothedPoints,
      derivativePoints,
      peaks,
      primaryPeak,
      tmDerivative,
      tmSign,
      boltzmannFit,
      tmBoltzmann,
      tm: effectiveTm,
      deltaTm: 0,
      effect: 'neutral',
    };
  });

  // Identify reference condition
  let refIndex = 0;
  if (options?.referenceNameOrIndex !== undefined) {
    if (typeof options.referenceNameOrIndex === 'number') {
      refIndex = Math.max(0, Math.min(conditions.length - 1, options.referenceNameOrIndex));
    } else {
      const matchIdx = conditions.findIndex(
        c => c.name.toLowerCase() === (options.referenceNameOrIndex as string).toLowerCase() ||
             c.id === (options.referenceNameOrIndex as string),
      );
      if (matchIdx >= 0) refIndex = matchIdx;
    }
  } else {
    const autoRefIdx = conditions.findIndex(c => {
      const lower = c.name.toLowerCase();
      return (
        lower.includes('control') ||
        lower.includes('ctrl') ||
        lower.includes('ref') ||
        lower.includes('dmso') ||
        lower.includes('apo') ||
        lower.includes('buffer') ||
        lower.includes('vehicle')
      );
    });
    if (autoRefIdx >= 0) refIndex = autoRefIdx;
  }

  const referenceCondition = conditions[refIndex]!;
  const referenceTm = referenceCondition.tm;

  // Compute Delta Tm and classification
  for (const cond of conditions) {
    cond.deltaTm = Number((cond.tm - referenceTm).toFixed(2));
    cond.effect = classifyDsfEffect(cond.deltaTm);
  }

  // Rank conditions by Delta Tm descending (most stabilizing first)
  const rankedConditions = [...conditions].sort((a, b) => b.deltaTm - a.deltaTm);

  // Summary statistics
  const nonRef = conditions.filter(c => c.id !== referenceCondition.id);
  const stabilizers = nonRef.filter(c => c.deltaTm >= 2.0);
  const destabilizers = nonRef.filter(c => c.deltaTm <= -2.0);
  const neutrals = nonRef.filter(c => c.deltaTm > -2.0 && c.deltaTm < 2.0);

  const deltaTms = nonRef.map(c => c.deltaTm);
  const maxStabilization = deltaTms.length > 0 ? Math.max(0, ...deltaTms) : 0;
  const maxDestabilization = deltaTms.length > 0 ? Math.min(0, ...deltaTms) : 0;

  const topHitCond = rankedConditions.find(c => c.id !== referenceCondition.id);
  const topHit =
    topHitCond && topHitCond.deltaTm > 0
      ? { name: topHitCond.name, deltaTm: topHitCond.deltaTm, tm: topHitCond.tm }
      : null;

  return {
    temperatures: croppedTemps,
    conditions,
    referenceConditionId: referenceCondition.id,
    referenceTm,
    rankedConditions,
    summary: {
      totalConditions: conditions.length,
      stabilizersCount: stabilizers.length,
      destabilizersCount: destabilizers.length,
      neutralCount: neutrals.length,
      maxStabilization: Number(maxStabilization.toFixed(2)),
      maxDestabilization: Number(maxDestabilization.toFixed(2)),
      topHit,
    },
  };
}

// -----------------------------------------------------------------------------
// Built-in Demo Datasets
// -----------------------------------------------------------------------------

/**
 * Benchmark Hen Egg-White Lysozyme (HEWL) thermal shift assay dataset.
 * Pinned to literature values:
 * - Apo lysozyme in standard buffer: Tm ~ 73.5 - 74.0 °C (Niesen et al. 2007, Pantoliano et al. 2001).
 * - Lysozyme + NAG (10 mM): Tm ~ 77.5 °C (ΔTm = +3.7 °C).
 * - Lysozyme + (GlcNAc)3 / NAG3 (1 mM): Tm ~ 80.6 °C (ΔTm = +6.8 °C).
 * - Lysozyme + 500 mM NaCl: Tm ~ 76.1 °C (ΔTm = +2.3 °C, ionic stabilization).
 * - Lysozyme + 1.5 M Urea: Tm ~ 68.1 °C (ΔTm = -5.7 °C, denaturant destabilization).
 */
export function generateLysozymeDemoDataset(): ParsedDsfData {
  const temps: number[] = [];
  for (let t = 25.0; t <= 95.0; t += 0.5) {
    temps.push(Number(t.toFixed(1)));
  }

  const conditionsSpec = [
    { name: 'Lysozyme Control (Buffer)', tm: 73.8, a: 1.8, baseline: 120, peak: 3200, rollOff: 0.015 },
    { name: '+ NAG Monomer (10 mM)', tm: 77.5, a: 1.9, baseline: 115, peak: 3100, rollOff: 0.016 },
    { name: '+ NAG3 Trimer (1 mM)', tm: 80.6, a: 2.0, baseline: 125, peak: 3350, rollOff: 0.014 },
    { name: '+ NaCl (500 mM)', tm: 76.1, a: 1.85, baseline: 130, peak: 3050, rollOff: 0.015 },
    { name: '+ Urea (1.5 M)', tm: 68.1, a: 1.75, baseline: 140, peak: 2900, rollOff: 0.018 },
  ];

  const conditions: ParsedCondition[] = conditionsSpec.map(spec => {
    const fluorescence = temps.map(t => {
      const sig = boltzmannSigmoid(t, spec.baseline, spec.peak, spec.tm, spec.a);
      const preDrift = 0.5 * (t - 25);
      const postDecline = t > spec.tm + 4 ? Math.exp(-spec.rollOff * Math.pow(t - (spec.tm + 4), 1.6)) : 1.0;
      const noise = Math.sin(t * 13.7 + spec.tm * 5.1) * 6;
      return Math.round(Math.max(10, (sig + preDrift) * postDecline + noise));
    });
    return { name: spec.name, fluorescence, channel: 'raw' };
  });

  return { temperatures: temps, conditions, format: 'standard' };
}

/**
 * Benchmark nanoDSF (intrinsic tryptophan fluorescence ratio F350/F330) dataset.
 * Screen of a therapeutic monoclonal antibody (mAb) Fab domain with fragment hits.
 */
export function generateNanoDsfDemoDataset(): ParsedDsfData {
  const temps: number[] = [];
  for (let t = 30.0; t <= 90.0; t += 0.5) {
    temps.push(Number(t.toFixed(1)));
  }

  const conditionsSpec = [
    { name: 'mAb Apo (Vehicle DMSO)', tm: 67.2, a: 1.5, fMin: 0.82, fMax: 1.18 },
    { name: '+ Fragment A (100 µM)', tm: 72.4, a: 1.6, fMin: 0.82, fMax: 1.17 },
    { name: '+ Fragment B (100 µM)', tm: 70.1, a: 1.55, fMin: 0.81, fMax: 1.18 },
    { name: '+ Fragment C (100 µM)', tm: 68.3, a: 1.5, fMin: 0.82, fMax: 1.19 },
    { name: 'Low pH Buffer (pH 5.0)', tm: 61.5, a: 1.4, fMin: 0.85, fMax: 1.16 },
  ];

  const conditions: ParsedCondition[] = conditionsSpec.map(spec => {
    const fluorescence = temps.map(t => {
      const sig = boltzmannSigmoid(t, spec.fMin, spec.fMax, spec.tm, spec.a);
      const slope = 0.0003 * (t - 30);
      const noise = Math.sin(t * 19.3 + spec.tm * 3.7) * 0.002;
      return Number((sig + slope + noise).toFixed(4));
    });
    return { name: spec.name, fluorescence, channel: 'ratio' };
  });

  return { temperatures: temps, conditions, format: 'prometheus' };
}

/**
 * Realistic high-density Prometheus NT.48 nanoDSF export dataset.
 * 24 capillaries with Ratio (350/330 nm), 330 nm, and 350 nm channels,
 * featuring Apo control, nanomolar & micromolar stabilizing hits, vehicle DMSO,
 * destabilizer, and buffer blanks.
 */
export function generatePrometheusDemoDataset(): ParsedDsfData {
  const temps: number[] = [];
  for (let t = 25.0; t <= 90.0; t += 0.5) {
    temps.push(Number(t.toFixed(1)));
  }

  const capillaries = [
    { id: '1', name: 'Capillary 1: Apo Control (Buffer)', tm: 65.2, a: 1.6, baseR: 0.84, dR: 0.32, int330: 16500, int350: 13860 },
    { id: '2', name: 'Capillary 2: Apo Control (Replicate 2)', tm: 65.3, a: 1.6, baseR: 0.84, dR: 0.32, int330: 16400, int350: 13780 },
    { id: '3', name: 'Capillary 3: + Lead Hit A (10 µM)', tm: 73.8, a: 1.7, baseR: 0.83, dR: 0.31, int330: 16200, int350: 13450 },
    { id: '4', name: 'Capillary 4: + Lead Hit A (Replicate 2)', tm: 73.9, a: 1.7, baseR: 0.83, dR: 0.31, int330: 16300, int350: 13530 },
    { id: '5', name: 'Capillary 5: + Compound B (50 µM)', tm: 70.1, a: 1.65, baseR: 0.84, dR: 0.32, int330: 15900, int350: 13360 },
    { id: '6', name: 'Capillary 6: + Fragment C (200 µM)', tm: 67.5, a: 1.55, baseR: 0.85, dR: 0.30, int330: 16800, int350: 14280 },
    { id: '7', name: 'Capillary 7: + Vehicle (1% DMSO)', tm: 65.1, a: 1.6, baseR: 0.84, dR: 0.32, int330: 16450, int350: 13820 },
    { id: '8', name: 'Capillary 8: + Destabilizer D (Low pH 5.5)', tm: 58.7, a: 1.45, baseR: 0.87, dR: 0.28, int330: 15200, int350: 13220 },
  ];

  const conditions: ParsedCondition[] = [];

  for (const cap of capillaries) {
    // 1. Ratio channel (350/330 nm)
    const ratioVals = temps.map(t => {
      const sig = boltzmannSigmoid(t, cap.baseR, cap.baseR + cap.dR, cap.tm, cap.a);
      const drift = 0.00025 * (t - 25);
      const noise = Math.sin(t * 17.1 + cap.tm * 4.3) * 0.0018;
      return Number((sig + drift + noise).toFixed(4));
    });
    conditions.push({
      name: `${cap.name} - Ratio (350/330)`,
      fluorescence: ratioVals,
      channel: 'ratio',
      capillary: `Capillary ${cap.id}`,
    });

    // 2. 330 nm channel (thermal quenching)
    const f330Vals = temps.map(t => {
      const quench = cap.int330 * Math.exp(-0.006 * (t - 25));
      const sig = boltzmannSigmoid(t, 0, -cap.int330 * 0.15, cap.tm, cap.a);
      const noise = Math.sin(t * 11.2) * 15;
      return Math.round(quench + sig + noise);
    });
    conditions.push({
      name: `${cap.name} - 330nm`,
      fluorescence: f330Vals,
      channel: 'f330',
      capillary: `Capillary ${cap.id}`,
    });

    // 3. 350 nm channel
    const f350Vals = temps.map(t => {
      const quench = cap.int350 * Math.exp(-0.0055 * (t - 25));
      const sig = boltzmannSigmoid(t, 0, cap.int350 * 0.10, cap.tm, cap.a);
      const noise = Math.sin(t * 13.5) * 15;
      return Math.round(quench + sig + noise);
    });
    conditions.push({
      name: `${cap.name} - 350nm`,
      fluorescence: f350Vals,
      channel: 'f350',
      capillary: `Capillary ${cap.id}`,
    });
  }

  return {
    temperatures: temps,
    conditions,
    format: 'prometheus',
    delimiter: ',',
    metadata: {
      Instrument: 'Prometheus NT.48',
      'Software Version': 'PR.ThermControl v2.1.2',
      'Ramp Rate': '1.0 °C/min',
      Wavelengths: '330 nm, 350 nm, Ratio',
    },
  };
}

/**
 * Format a ParsedDsfData structure into standard CSV text.
 */
export function formatDsfToCsv(data: ParsedDsfData): string {
  const headers = ['Temperature (°C)', ...data.conditions.map(c => `"${c.name}"`)];
  const rows: string[] = [headers.join(',')];

  for (let i = 0; i < data.temperatures.length; i++) {
    const row = [data.temperatures[i]!.toFixed(1), ...data.conditions.map(c => c.fluorescence[i]!)];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}
