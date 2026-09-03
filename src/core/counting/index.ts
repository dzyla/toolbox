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
  const binStep = Math.max(0.5, (maxR - minR) / numBins);

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

export interface ColonyDetectionOptions {
  minRadius?: number;
  maxRadius?: number;
  minCertainty?: number;
  minDistance?: number;    // minimum distance between colony centers in pixels
  dishRadiusFrac?: number; // rim exclusion fraction (e.g. 0.84 to exclude plastic rim glare)
}

/**
 * Automated computer-vision colony detection on ImageData.
 * Features:
 * - True centroid refinement (local intensity-weighted centroid, not edge)
 * - Touching / doublet colony separation via saddle thresholding
 * - Configurable minimum separation distance
 * - Petri dish plastic rim glare exclusion
 */
export function autoDetectColonies(
  imageData: ImageData,
  options: ColonyDetectionOptions = {},
): ColonySpot[] {
  const {
    minRadius = 2,
    maxRadius = 32,
    minCertainty = 0.40,
    minDistance = 5,
    dishRadiusFrac = 0.85,
  } = options;

  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const cx = width / 2;
  const cy = height / 2;
  const maxDishRadius = (Math.min(width, height) / 2) * dishRadiusFrac;

  // Convert to grayscale luminance
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!;
  }

  // Calculate local mean across dish interior (excluding plastic rim)
  let totalLuma = 0;
  let countLuma = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (Math.hypot(x - cx, y - cy) < maxDishRadius * 0.75) {
        totalLuma += gray[y * width + x]!;
        countLuma++;
      }
    }
  }
  const avgBg = countLuma > 0 ? totalLuma / countLuma : 128;

  // Determine whether colonies are darker or lighter than agar
  let darkContrastSum = 0;
  let lightContrastSum = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      if (Math.hypot(x - cx, y - cy) < maxDishRadius * 0.75) {
        const val = gray[y * width + x]!;
        if (val < avgBg - 12) darkContrastSum += (avgBg - val);
        else if (val > avgBg + 12) lightContrastSum += (val - avgBg);
      }
    }
  }
  const coloniesAreDark = darkContrastSum >= lightContrastSum;

  const getContrast = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    const val = gray[Math.floor(y) * width + Math.floor(x)]!;
    return coloniesAreDark ? (avgBg - val) : (val - avgBg);
  };

  const candidatePeaks: Array<{ x: number; y: number; contrast: number }> = [];
  const searchStep = 2;

  // Scan inside the safe dish interior
  for (let y = Math.floor(cy - maxDishRadius); y < cy + maxDishRadius; y += searchStep) {
    if (y < 4 || y >= height - 4) continue;
    for (let x = Math.floor(cx - maxDishRadius); x < cx + maxDishRadius; x += searchStep) {
      if (x < 4 || x >= width - 4) continue;
      const distFromCenter = Math.hypot(x - cx, y - cy);
      if (distFromCenter > maxDishRadius) continue;

      const cVal = getContrast(x, y);
      if (cVal <= 12) continue;

      // Check if it is a local maximum compared to immediate neighbors
      let isLocalMax = true;
      for (let dy = -2; dy <= 2; dy += 2) {
        for (let dx = -2; dx <= 2; dx += 2) {
          if (dx === 0 && dy === 0) continue;
          if (getContrast(x + dx, y + dy) > cVal) {
            isLocalMax = false;
            break;
          }
        }
        if (!isLocalMax) break;
      }

      if (isLocalMax) {
        candidatePeaks.push({ x, y, contrast: cVal });
      }
    }
  }

  // Refine each peak to its true intensity-weighted centroid and measure radius
  const refinedCandidates: Array<{ x: number; y: number; radius: number; certainty: number }> = [];

  for (const peak of candidatePeaks) {
    // 1. Centroid refinement in a local window (e.g. 5x5 to 9x9)
    const win = 4;
    let sumW = 0;
    let sumX = 0;
    let sumY = 0;
    const bgThreshold = peak.contrast * 0.35;

    for (let dy = -win; dy <= win; dy++) {
      for (let dx = -win; dx <= win; dx++) {
        const px = peak.x + dx;
        const py = peak.y + dy;
        const cont = getContrast(px, py);
        if (cont > bgThreshold) {
          const w = cont - bgThreshold;
          sumW += w;
          sumX += px * w;
          sumY += py * w;
        }
      }
    }

    const trueX = sumW > 0 ? sumX / sumW : peak.x;
    const trueY = sumW > 0 ? sumY / sumW : peak.y;

    if (Math.hypot(trueX - cx, trueY - cy) > maxDishRadius) continue;

    // 2. Measure radius from the true centroid outward across 8 radials
    let radialDistSum = 0;
    let validRadials = 0;
    const centerContrast = getContrast(trueX, trueY);

    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      let rFound = maxRadius;

      for (let r = minRadius; r <= maxRadius; r++) {
        const rx = trueX + r * cosA;
        const ry = trueY + r * sinA;
        const sampleCont = getContrast(rx, ry);

        // Edge boundary is when contrast drops below 30% of peak or to baseline
        if (sampleCont <= centerContrast * 0.30 || sampleCont <= 8) {
          rFound = r;
          break;
        }
      }

      radialDistSum += rFound;
      validRadials++;
    }

    const estRadius = Math.max(minRadius, Math.min(maxRadius, radialDistSum / validRadials));

    // 3. Contrast & Certainty Score
    // Calculate circularity / contrast ratio between center core and surrounding ring
    let ringSum = 0;
    let ringCount = 0;
    const ringR = estRadius + 3;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const rx = trueX + ringR * Math.cos(a);
      const ry = trueY + ringR * Math.sin(a);
      ringSum += getContrast(rx, ry);
      ringCount++;
    }
    const outerBg = ringSum / ringCount;
    const coreContrast = Math.max(0, centerContrast - outerBg);

    const certainty = Math.min(0.99, Math.max(0.15, (coreContrast / 60) * 0.65 + (centerContrast / 100) * 0.35));

    if (certainty >= minCertainty && estRadius >= minRadius && estRadius <= maxRadius) {
      refinedCandidates.push({
        x: Math.round(trueX * 10) / 10,
        y: Math.round(trueY * 10) / 10,
        radius: Math.round(estRadius * 10) / 10,
        certainty,
      });
    }
  }

  // Non-maximum suppression with doublet support and minDistance
  refinedCandidates.sort((a, b) => b.certainty - a.certainty);
  const results: ColonySpot[] = [];

  for (const c of refinedCandidates) {
    let keep = true;

    for (const existing of results) {
      const d = Math.hypot(existing.x - c.x, existing.y - c.y);

      // If closer than minDistance, definitely merge/suppress duplicate peak
      if (d < minDistance) {
        keep = false;
        break;
      }

      // If touching / close colonies: check if there is a distinct valley (saddle) between their centers
      if (d < Math.max(existing.radius || 4, c.radius) * 1.3) {
        const midX = (existing.x + c.x) / 2;
        const midY = (existing.y + c.y) / 2;
        const midContrast = getContrast(midX, midY);
        const c1Cont = getContrast(existing.x, existing.y);
        const c2Cont = getContrast(c.x, c.y);
        const minPeakCont = Math.min(c1Cont, c2Cont);

        // If the midpoint between them is noticeably lower than both peaks, they are two distinct touching colonies!
        if (midContrast < minPeakCont * 0.78 && d >= minDistance) {
          // Keep as doublet!
          continue;
        } else {
          // Midpoint is flat/high -> part of the same single colony
          keep = false;
          break;
        }
      }
    }

    if (keep) {
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
