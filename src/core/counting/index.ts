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

export interface DishBoundary {
  cx: number;
  cy: number;
  radius: number;
}

/**
 * Automatically estimates the circular petri dish boundary in an image
 * by scanning outward from the image center for the circular plastic rim gradient.
 */
export function detectPetriDishBoundary(imageData: ImageData): DishBoundary {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const defaultCx = width / 2;
  const defaultCy = height / 2;
  const defaultR = Math.min(width, height) / 2;

  const luma = (x: number, y: number): number => {
    const px = Math.max(0, Math.min(width - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const idx = (py * width + px) * 4;
    return 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!;
  };

  const numRays = 36;
  const edgePoints: Array<{ x: number; y: number; r: number }> = [];
  const minSearchR = defaultR * 0.40;
  const maxSearchR = defaultR * 0.98;

  for (let i = 0; i < numRays; i++) {
    const angle = (i / numRays) * 2 * Math.PI;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let maxGrad = 0;
    let bestR = defaultR * 0.85;

    for (let r = minSearchR; r <= maxSearchR; r += 2) {
      const x1 = defaultCx + (r - 4) * cosA;
      const y1 = defaultCy + (r - 4) * sinA;
      const x2 = defaultCx + (r + 4) * cosA;
      const y2 = defaultCy + (r + 4) * sinA;

      const grad = Math.abs(luma(x1, y1) - luma(x2, y2));
      if (grad > maxGrad) {
        maxGrad = grad;
        bestR = r;
      }
    }

    if (maxGrad > 15) {
      edgePoints.push({
        x: defaultCx + bestR * cosA,
        y: defaultCy + bestR * sinA,
        r: bestR,
      });
    }
  }

  if (edgePoints.length >= 12) {
    const sortedR = [...edgePoints].map(p => p.r).sort((a, b) => a - b);
    const medianR = sortedR[Math.floor(sortedR.length / 2)]!;
    const inliers = edgePoints.filter(p => Math.abs(p.r - medianR) < medianR * 0.14);

    if (inliers.length >= 8) {
      // Algebraic circle fit (Kåsa least squares)
      let sX = 0, sY = 0, sX2 = 0, sY2 = 0, sXY = 0;
      let sZ = 0, sXZ = 0, sYZ = 0;
      const n = inliers.length;

      for (const p of inliers) {
        const x = p.x;
        const y = p.y;
        const z = x * x + y * y;
        sX += x; sY += y;
        sX2 += x * x; sY2 += y * y; sXY += x * y;
        sZ += z; sXZ += x * z; sYZ += y * z;
      }

      const a11 = sX2, a12 = sXY, a13 = sX, b1 = -sXZ;
      const a21 = sXY, a22 = sY2, a23 = sY, b2 = -sYZ;
      const a31 = sX, a32 = sY, a33 = n, b3 = -sZ;

      const det = a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31);
      if (Math.abs(det) > 1e-4) {
        const detA = b1 * (a22 * a33 - a23 * a32) - a12 * (b2 * a33 - a23 * b3) + a13 * (b2 * a32 - a22 * b3);
        const detB = a11 * (b2 * a33 - a23 * b3) - b1 * (a21 * a33 - a23 * a31) + a13 * (a21 * b3 - b2 * a31);
        const detC = a11 * (a22 * b3 - b2 * a32) - a12 * (a21 * b3 - b2 * a31) + b1 * (a21 * a32 - a22 * b3);

        const A = detA / det;
        const B = detB / det;
        const C = detC / det;

        const fitCx = -A / 2;
        const fitCy = -B / 2;
        const rSq = fitCx * fitCx + fitCy * fitCy - C;

        if (rSq > 0) {
          const fitR = Math.sqrt(rSq);
          if (
            Math.abs(fitCx - defaultCx) < width * 0.22 &&
            Math.abs(fitCy - defaultCy) < height * 0.22 &&
            fitR > defaultR * 0.45 &&
            fitR < defaultR * 1.15
          ) {
            return { cx: fitCx, cy: fitCy, radius: fitR };
          }
        }
      }
    }
  }

  return { cx: defaultCx, cy: defaultCy, radius: defaultR };
}

export interface ColonyDetectionOptions {
  minRadius?: number;
  maxRadius?: number;
  minCertainty?: number;
  minDistance?: number;    // minimum distance between colony centers in pixels
  dishRadiusFrac?: number; // rim exclusion fraction (e.g. 0.84 to exclude plastic rim glare)
  dishCenterX?: number;
  dishCenterY?: number;
  dishRadius?: number;
}

/**
 * Automated computer-vision colony detection on ImageData.
 * Features:
 * - True centroid refinement (local intensity-weighted centroid, not edge)
 * - Automatic petri dish boundary centering (prevents clipping near bottom/right rim)
 * - Marker pen ink rejection
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

  // Determine actual dish center and radius (auto-detected or provided)
  const dish = (options.dishCenterX !== undefined && options.dishCenterY !== undefined && options.dishRadius !== undefined)
    ? { cx: options.dishCenterX, cy: options.dishCenterY, radius: options.dishRadius }
    : detectPetriDishBoundary(imageData);

  const cx = dish.cx;
  const cy = dish.cy;
  const maxDishRadius = dish.radius * dishRadiusFrac;

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

      // Marker pen ink rejection (only reject high-brightness saturated marker pen lines, e.g. sharp red, blue, green Sharpie)
      const pxIdx = (Math.floor(y) * width + Math.floor(x)) * 4;
      const rVal = data[pxIdx]!;
      const gVal = data[pxIdx + 1]!;
      const bVal = data[pxIdx + 2]!;
      const maxChannel = Math.max(rVal, gVal, bVal);
      const minChannel = Math.min(rVal, gVal, bVal);
      const colorSpread = maxChannel - minChannel;
      if (maxChannel > 160 && colorSpread > 80 && (rVal > gVal * 1.8 || bVal > gVal * 1.8 || gVal > rVal * 1.8)) {
        continue;
      }

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

      // If closer than minDistance or within the same colony radius, suppress duplicate peak
      const minColonyR = Math.min(existing.radius || 4, c.radius || 4);
      if (d < minDistance || d < minColonyR * 0.85) {
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
        if (midContrast < minPeakCont * 0.88 && d >= minDistance) {
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
