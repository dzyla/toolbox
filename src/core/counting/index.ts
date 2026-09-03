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
  minRadius: number;
  maxRadius: number;
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
export function computeSizeDistribution(colonies: ColonySpot[]): SizeDistributionStats {
  if (colonies.length === 0) {
    return {
      totalCount: 0,
      meanRadius: 0,
      meanDiameter: 0,
      stdDev: 0,
      cvPercent: 0,
      bins: [],
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
  const binStep = Math.max(1, (maxR - minR) / numBins);

  const bins: SizeDistributionBin[] = [];
  for (let i = 0; i < numBins; i++) {
    const low = minR + i * binStep;
    const high = i === numBins - 1 ? maxR + 0.01 : low + binStep;
    const inBin = radii.filter(r => r >= low && r < high).length;
    bins.push({
      binLabel: `${(low * 2).toFixed(1)}–${(high * 2).toFixed(1)} px`,
      minRadius: low,
      maxRadius: high,
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
  };
}

/**
 * Automated computer-vision colony detection on ImageData.
 * Uses local contrast thresholding, peak detection, and radial profiling.
 */
export function autoDetectColonies(
  imageData: ImageData,
  options: {
    minRadius?: number;
    maxRadius?: number;
    minCertainty?: number;
    dishRadiusFrac?: number; // ignore outside dish rim (e.g. 0.88)
  } = {},
): ColonySpot[] {
  const {
    minRadius = 2,
    maxRadius = 28,
    minCertainty = 0.45,
    dishRadiusFrac = 0.90,
  } = options;

  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const cx = width / 2;
  const cy = height / 2;
  const dishRadius = (Math.min(width, height) / 2) * dishRadiusFrac;

  // Convert to grayscale luminance
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx]!;
    const g = data[idx + 1]!;
    const b = data[idx + 2]!;
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Calculate local mean across dish interior
  let totalLuma = 0;
  let countLuma = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (Math.hypot(x - cx, y - cy) < dishRadius * 0.8) {
        totalLuma += gray[y * width + x]!;
        countLuma++;
      }
    }
  }
  const avgBg = countLuma > 0 ? totalLuma / countLuma : 128;

  // Determine whether colonies are darker than agar or lighter than agar
  let darkContrastSum = 0;
  let lightContrastSum = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      if (Math.hypot(x - cx, y - cy) < dishRadius * 0.8) {
        const val = gray[y * width + x]!;
        if (val < avgBg - 15) darkContrastSum += (avgBg - val);
        else if (val > avgBg + 15) lightContrastSum += (val - avgBg);
      }
    }
  }
  const coloniesAreDark = darkContrastSum >= lightContrastSum;

  const candidates: Array<{ x: number; y: number; radius: number; certainty: number }> = [];
  const step = 3;

  for (let y = Math.floor(cy - dishRadius); y < cy + dishRadius; y += step) {
    if (y < maxRadius || y >= height - maxRadius) continue;
    for (let x = Math.floor(cx - dishRadius); x < cx + dishRadius; x += step) {
      if (x < maxRadius || x >= width - maxRadius) continue;
      const distFromCenter = Math.hypot(x - cx, y - cy);
      if (distFromCenter > dishRadius) continue;

      const centerVal = gray[y * width + x]!;
      const contrast = coloniesAreDark ? (avgBg - centerVal) : (centerVal - avgBg);

      if (contrast > 16) {
        // Measure local peak: check if center is extreme compared to neighboring ring
        let ringSum = 0;
        let ringCount = 0;
        for (let rad = 4; rad <= 7; rad += 2) {
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const rx = Math.round(x + rad * Math.cos(angle));
            const ry = Math.round(y + rad * Math.sin(angle));
            ringSum += gray[ry * width + rx]!;
            ringCount++;
          }
        }
        const ringAvg = ringSum / ringCount;
        const localPeak = coloniesAreDark ? (ringAvg - centerVal) : (centerVal - ringAvg);

        if (localPeak > 8) {
          // Estimate colony radius by finding where gradient drops to baseline
          let estRadius = minRadius;
          for (let r = minRadius + 1; r <= maxRadius; r++) {
            let sampleDiff = 0;
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
              const sx = Math.round(x + r * Math.cos(a));
              const sy = Math.round(y + r * Math.sin(a));
              const sVal = gray[sy * width + sx]!;
              sampleDiff += Math.abs(sVal - avgBg);
            }
            if (sampleDiff / 4 < 12) {
              estRadius = r;
              break;
            }
            estRadius = r;
          }

          // Certainty score based on contrast and edge steepness
          const certainty = Math.min(0.99, Math.max(0.1, (contrast / 80) * 0.6 + (localPeak / 35) * 0.4));

          if (certainty >= minCertainty && estRadius >= minRadius && estRadius <= maxRadius) {
            candidates.push({ x, y, radius: estRadius, certainty });
          }
        }
      }
    }
  }

  // Non-maximum suppression: merge candidates within distance
  const results: ColonySpot[] = [];
  candidates.sort((a, b) => b.certainty - a.certainty);

  for (const c of candidates) {
    const isOverlapping = results.some(existing => {
      const d = Math.hypot(existing.x - c.x, existing.y - c.y);
      return d < Math.max(existing.radius || 4, c.radius) * 1.2;
    });

    if (!isOverlapping) {
      const catId = c.certainty >= 0.75 ? 'cat-1' : c.certainty >= 0.5 ? 'cat-2' : 'cat-3';
      results.push({
        id: `auto-${results.length + 1}`,
        x: c.x,
        y: c.y,
        radius: c.radius,
        certainty: c.certainty,
        category: catId,
        isManual: false,
      });
    }
  }

  return results;
}

export interface TallyCounter {
  id: string;
  name: string;
  count: number;
  step: number;
  goal?: number;
  color: string;
}
