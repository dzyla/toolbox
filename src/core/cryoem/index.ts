/* Cryo-EM image-processing arithmetic. Pixel sizes in Å/px, box sizes in px, dose in e⁻/Å².
   - Nyquist limit = 2 × pixel size (sampling theorem; Frank J (2006) Three-Dimensional Electron Microscopy of
     Macromolecular Assemblies, ch. 2).
   - "Good" box sizes are even and 2·3·5·7-smooth so FFTs stay fast (RELION and cryoSPARC recommend this;
     Zivanov J et al. (2018) eLife 7:e42166, RELION documentation on particle extraction).
   - Fourier cropping a box of B px to B' px multiplies the pixel size by B/B' (binning factor) and leaves the
     physical box width unchanged.
   - Dose per frame = dose rate (e⁻/px/s) × frame time (s) ÷ (pixel size)² (e⁻/Å²). Grant T, Grigorieff N (2015)
     eLife 4:e06980 for typical 30–60 e⁻/Å² total exposures.
   - Pixel size (Å) = physical detector pixel (µm) × 1e4 ÷ magnification (detector-plane magnification).
     Detector pixel sizes: Gatan K3 5 µm, Falcon 4 14 µm (supplier data sheets). */

export class CryoEmError extends Error {}
function positive(x: number, what: string) {
  if (!(Number.isFinite(x) && x > 0)) throw new CryoEmError(`${what} must be a positive number`);
}

export function nyquist(pixelSize: number): number { positive(pixelSize, 'Pixel size'); return 2 * pixelSize; }
export function boxWidth(pixelSize: number, box: number): number { positive(pixelSize, 'Pixel size'); positive(box, 'Box size'); return pixelSize * box; }

/** Even and only prime factors 2, 3, 5, 7. */
export function isGoodBox(n: number): boolean {
  if (!Number.isInteger(n) || n <= 0 || n % 2 !== 0) return false;
  let x = n;
  for (const f of [2, 3, 5, 7]) while (x % f === 0) x /= f;
  return x === 1;
}
/** Smallest good box ≥ start. */
export function nextGoodBox(start: number): number {
  positive(start, 'Box size');
  let n = Math.ceil(start);
  if (n % 2 !== 0) n++;
  while (!isGoodBox(n)) n += 2;
  return n;
}
/** Cropped box that reaches a target Nyquist, rounded up to a good box and never larger than the original. */
export function requiredBoxForNyquist(pixelSize: number, box: number, targetNyquist: number): number {
  positive(targetNyquist, 'Target Nyquist');
  const raw = (boxWidth(pixelSize, box) * 2) / targetNyquist;
  return Math.min(box, nextGoodBox(raw));
}
/** Box after binning by `bin`, snapped to a good (even) box. */
export function cropBoxForBin(box: number, bin: number): number {
  positive(box, 'Box size'); positive(bin, 'Binning factor');
  return Math.min(box, nextGoodBox(box / bin));
}
export function binnedPixelSize(pixelSize: number, box: number, cropBox: number): number {
  positive(cropBox, 'Cropped box');
  return (boxWidth(pixelSize, box)) / cropBox;
}

export interface BoxComparison {
  raw: { pixelSize: number; nyquist: number; box: number; width: number };
  binned: { pixelSize: number; nyquist: number; box: number; width: number; bin: number };
  /** A better (FFT-friendly) crop box when the requested one is not good. */ suggestion?: number;
}
export function compareBoxes(pixelSize: number, box: number, cropBox: number): BoxComparison {
  const bp = binnedPixelSize(pixelSize, box, cropBox);
  return {
    raw: { pixelSize, nyquist: nyquist(pixelSize), box, width: boxWidth(pixelSize, box) },
    binned: { pixelSize: bp, nyquist: 2 * bp, box: cropBox, width: bp * cropBox, bin: box / cropBox },
    suggestion: isGoodBox(cropBox) ? undefined : nextGoodBox(cropBox),
  };
}

/* ---------- dose ---------- */
export function dosePerFrame(ratePerPxPerS: number, frameTimeS: number, pixelSize: number): number {
  positive(ratePerPxPerS, 'Dose rate'); positive(frameTimeS, 'Frame time'); positive(pixelSize, 'Pixel size');
  return (ratePerPxPerS * frameTimeS) / (pixelSize * pixelSize);
}
export function totalDose(ratePerPxPerS: number, exposureS: number, pixelSize: number): number {
  return dosePerFrame(ratePerPxPerS, exposureS, pixelSize);
}
export interface DosePlan { totalDose: number; dosePerFrame: number; frames: number; frameTime: number; rateAtSpecimen: number }
/** Full plan from rate, pixel size, total exposure and number of frames. rateAtSpecimen is e⁻/Å²/s. */
export function dosePlan(ratePerPxPerS: number, pixelSize: number, exposureS: number, frames: number): DosePlan {
  positive(frames, 'Number of frames');
  if (!Number.isInteger(frames)) throw new CryoEmError('Number of frames must be an integer');
  const total = totalDose(ratePerPxPerS, exposureS, pixelSize);
  return { totalDose: total, dosePerFrame: total / frames, frames, frameTime: exposureS / frames, rateAtSpecimen: ratePerPxPerS / (pixelSize * pixelSize) };
}
/** Exposure time (s) that delivers `targetDose` e⁻/Å². */
export function exposureForDose(ratePerPxPerS: number, pixelSize: number, targetDose: number): number {
  positive(ratePerPxPerS, 'Dose rate'); positive(pixelSize, 'Pixel size'); positive(targetDose, 'Target dose');
  return (targetDose * pixelSize * pixelSize) / ratePerPxPerS;
}

/* ---------- magnification ---------- */
export function pixelSizeFromMag(physicalPixelUm: number, magnification: number): number {
  positive(physicalPixelUm, 'Detector pixel'); positive(magnification, 'Magnification');
  return (physicalPixelUm * 1e4) / magnification;
}
export function magFromPixelSize(physicalPixelUm: number, pixelSize: number): number {
  positive(physicalPixelUm, 'Detector pixel'); positive(pixelSize, 'Pixel size');
  return (physicalPixelUm * 1e4) / pixelSize;
}

/* ---------- CTF & Thon Rings Simulation ---------- */

export interface CtfPoint {
  s: number;     // Spatial frequency (1/Å)
  d: number;     // Resolution (Å)
  ctf: number;   // CTF amplitude (-1 to 1)
  power: number; // CTF^2 or total power (0 to 1)
  diffraction?: number; // Added diffraction intensity (0 to 1)
}

/**
 * Calculates relativistic de Broglie electron wavelength (in Å)
 * for acceleration voltage V (in kV).
 * e.g. 300 kV -> ~0.019687 Å (Titan Krios)
 *      200 kV -> ~0.025079 Å (Talos / Glacios)
 *      100 kV -> ~0.037014 Å
 */
export function relativisticWavelength(voltageKv: number): number {
  positive(voltageKv, 'Acceleration voltage');
  const h = 6.62607015e-34; // J*s
  const m0 = 9.1093837e-31;  // kg
  const e = 1.602176634e-19; // C
  const c = 299792458;       // m/s
  const V = voltageKv * 1000; // Volts

  const E = e * V;
  const rel = 1 + E / (2 * m0 * c * c);
  const p = Math.sqrt(2 * m0 * E * rel);
  const lambdaMeters = h / p;
  return lambdaMeters * 1e10; // Convert to Å
}

/**
 * Phase aberration function χ(s, α) in radians.
 * s: spatial frequency in 1/Å
 * defocusA: defocus in Å (underfocus > 0)
 * csA: spherical aberration in Å (Cs_mm * 1e7)
 * lambdaA: electron wavelength in Å
 */
export function waveAberration(s: number, defocusA: number, csA: number, lambdaA: number): number {
  const s2 = s * s;
  const s4 = s2 * s2;
  const l3 = lambdaA * lambdaA * lambdaA;
  return Math.PI * lambdaA * s2 * defocusA - 0.5 * Math.PI * csA * l3 * s4;
}

/**
 * Contrast Transfer Function value at frequency s.
 * Includes amplitude contrast Q and envelope B-factor decay.
 */
export function ctfValue(
  s: number,
  defocusA: number,
  csA: number,
  lambdaA: number,
  amplitudeContrast = 0.07,
  bFactor = 50
): number {
  const chi = waveAberration(s, defocusA, csA, lambdaA);
  const Q = Math.max(0, Math.min(1, amplitudeContrast));
  const phaseFactor = Math.sqrt(1 - Q * Q);
  const envelope = Math.exp((-bFactor * s * s) / 4);
  return - (phaseFactor * Math.sin(chi) + Q * Math.cos(chi)) * envelope;
}

/**
 * 2D CTF value at spatial frequency coordinates (sx, sy) in 1/Å,
 * including astigmatism: dfU, dfV in Å, and astigmatism angle in radians.
 */
export function ctf2D(
  sx: number,
  sy: number,
  dfU_A: number,
  dfV_A: number,
  astAngleRad: number,
  csA: number,
  lambdaA: number,
  amplitudeContrast = 0.07,
  bFactor = 50
): number {
  const s = Math.sqrt(sx * sx + sy * sy);
  if (s === 0) return -amplitudeContrast;
  const alpha = Math.atan2(sy, sx);
  // Astigmatic defocus at angle alpha
  const dfAlpha = (dfU_A + dfV_A) / 2 + ((dfU_A - dfV_A) / 2) * Math.cos(2 * (alpha - astAngleRad));
  return ctfValue(s, dfAlpha, csA, lambdaA, amplitudeContrast, bFactor);
}

/**
 * Computes the first CTF zero resolution d1 (in Å) and frequency s1 (in 1/Å).
 * At low frequencies, χ ≈ π * λ * s^2 * Δf. For weak amplitude contrast (Q ≈ 0),
 * first zero is at χ = π => s1 = sqrt(1 / (λ * Δf)), d1 = sqrt(λ * Δf).
 */
export function firstCtfZero(
  defocusUm: number,
  voltageKv: number,
  csMm: number,
  amplitudeContrast = 0.07
): { s1: number; d1: number } {
  positive(defocusUm, 'Defocus');
  positive(voltageKv, 'Voltage');
  const lambdaA = relativisticWavelength(voltageKv);
  const dfA = defocusUm * 10000;
  const csA = csMm * 1e7;

  // Step forward from low frequency to find the FIRST zero crossing bracket
  let sA = 0.001;
  let sB = 0.002;
  const step = 0.0005;
  const valA = ctfValue(sA, dfA, csA, lambdaA, amplitudeContrast, 0);

  for (let s = sA + step; s < 0.5; s += step) {
    const curVal = ctfValue(s, dfA, csA, lambdaA, amplitudeContrast, 0);
    if (valA * curVal <= 0) {
      sA = s - step;
      sB = s;
      break;
    }
  }

  // Refine bracket with bisection
  for (let i = 0; i < 25; i++) {
    const sMid = (sA + sB) / 2;
    const midVal = ctfValue(sMid, dfA, csA, lambdaA, amplitudeContrast, 0);
    if (midVal * valA <= 0) {
      sB = sMid;
    } else {
      sA = sMid;
    }
  }

  const s1 = (sA + sB) / 2;
  const d1 = s1 > 0 ? 1 / s1 : 0;
  return { s1: Math.round(s1 * 10000) / 10000, d1: Math.round(d1 * 100) / 100 };
}

export type DiffractionArtifactType = 'none' | 'ice' | 'graphene' | 'carbon' | 'gold';

export interface DiffractionRing {
  dSpacingA: number; // Resolution in Angstroms
  label: string;
  millerIndices?: string;
  intensity: number; // 0 to 1
  widthA: number;    // Radial width sigma in 1/Angstrom
}

export interface DiffractionPreset {
  id: DiffractionArtifactType;
  name: string;
  description: string;
  rings: DiffractionRing[];
}

export const DIFFRACTION_PRESETS: Record<DiffractionArtifactType, DiffractionPreset> = {
  none: {
    id: 'none',
    name: 'Pure Vitreous Ice (No Artifacts)',
    description: 'Ideal amorphous vitreous ice with pure CTF Thon ring modulation.',
    rings: [],
  },
  ice: {
    id: 'ice',
    name: 'Crystalline Ice Rings (Hexagonal Ih)',
    description: 'Hexagonal / cubic crystalline ice contamination exhibiting intense Bragg powder diffraction rings at 3.66 Å (100, strongest), 2.25 Å (102), 2.07 Å (103), and 1.92 Å (110). Corrupts high-resolution particle alignment.',
    rings: [
      { dSpacingA: 3.66, label: '3.66 Å (100)', millerIndices: '(100)', intensity: 0.95, widthA: 0.006 },
      { dSpacingA: 2.25, label: '2.25 Å (102)', millerIndices: '(102)', intensity: 0.75, widthA: 0.007 },
      { dSpacingA: 2.07, label: '2.07 Å (103)', millerIndices: '(103)', intensity: 0.45, widthA: 0.007 },
      { dSpacingA: 1.92, label: '1.92 Å (110)', millerIndices: '(110)', intensity: 0.70, widthA: 0.008 },
    ],
  },
  graphene: {
    id: 'graphene',
    name: 'Single-Crystal Graphene (Hexagonal Bragg Spots)',
    description: 'Monolayer / few-layer single-crystal graphene support grid exhibiting characteristic 6-fold hexagonal Bragg reflection spots at 2.13 Å {10-10} and 1.23 Å {11-20} (rotated 30°).',
    rings: [
      { dSpacingA: 2.13, label: '2.13 Å {10-10} (6-fold)', millerIndices: '{10-10}', intensity: 0.90, widthA: 0.007 },
      { dSpacingA: 1.23, label: '1.23 Å {11-20} (6-fold)', millerIndices: '{11-20}', intensity: 0.70, widthA: 0.008 },
    ],
  },
  carbon: {
    id: 'carbon',
    name: 'Amorphous Carbon Support Halo',
    description: 'Continuous or ultrathin carbon support film showing broad, diffuse scattering halos centered at ~4.2 Å and ~2.1 Å.',
    rings: [
      { dSpacingA: 4.20, label: '4.20 Å (diffuse halo)', intensity: 0.55, widthA: 0.035 },
      { dSpacingA: 2.10, label: '2.10 Å (diffuse)', intensity: 0.30, widthA: 0.040 },
    ],
  },
  gold: {
    id: 'gold',
    name: 'Gold (Au) Grid Foil / UltraAuFoil',
    description: 'Gold grid substrate (UltraAuFoil) or fiducial gold beads exhibiting FCC crystalline lattice diffraction rings at 2.35 Å (111) and 2.04 Å (200).',
    rings: [
      { dSpacingA: 2.355, label: '2.35 Å (111)', millerIndices: '(111)', intensity: 0.90, widthA: 0.006 },
      { dSpacingA: 2.039, label: '2.04 Å (200)', millerIndices: '(200)', intensity: 0.65, widthA: 0.007 },
      { dSpacingA: 1.442, label: '1.44 Å (220)', millerIndices: '(220)', intensity: 0.50, widthA: 0.008 },
    ],
  },
};

/**
 * Computes extra diffraction intensity at spatial frequency s (in 1/Å)
 * from Bragg lattice reflections or diffuse support scattering.
 */
export function computeDiffractionIntensity(
  s: number,
  diffractionType: DiffractionArtifactType = 'none'
): number {
  if (diffractionType === 'none' || s <= 0) return 0;
  const preset = DIFFRACTION_PRESETS[diffractionType];
  if (!preset || preset.rings.length === 0) return 0;

  let total = 0;
  for (const ring of preset.rings) {
    const s0 = 1 / ring.dSpacingA;
    const diff = s - s0;
    const g = ring.intensity * Math.exp(-0.5 * (diff * diff) / (ring.widthA * ring.widthA));
    total += g;
  }
  return total;
}

/**
 * Computes 2D diffraction intensity at reciprocal coordinates (sx, sy) in 1/Å.
 * For crystalline single-crystal graphene, produces the characteristic 6-fold hexagonal
 * Bragg diffraction spot pattern at 2.13 Å {10-10} and 1.23 Å {11-20}.
 * For other materials (ice, gold, carbon), computes isotropic radial Debye-Scherrer rings/halos.
 */
export function compute2DDiffractionIntensity(
  sx: number,
  sy: number,
  s: number,
  diffractionType: DiffractionArtifactType = 'none'
): number {
  if (diffractionType === 'none' || s <= 0) return 0;
  if (diffractionType !== 'graphene') {
    return computeDiffractionIntensity(s, diffractionType);
  }

  const s1 = 1 / 2.13;
  const s2 = 1 / 1.23;
  const sigma = 0.012;
  const sigmaSq2 = 2 * sigma * sigma;
  const theta0 = (15 * Math.PI) / 180;
  let total = 0;

  for (let k = 0; k < 6; k++) {
    const a = theta0 + (k * Math.PI) / 3;
    const px = s1 * Math.cos(a);
    const py = s1 * Math.sin(a);
    const dSq = (sx - px) * (sx - px) + (sy - py) * (sy - py);
    if (dSq < 9 * sigma * sigma) {
      total += 0.95 * Math.exp(-dSq / sigmaSq2);
    }
  }

  const theta1 = theta0 + Math.PI / 6;
  for (let k = 0; k < 6; k++) {
    const a = theta1 + (k * Math.PI) / 3;
    const px = s2 * Math.cos(a);
    const py = s2 * Math.sin(a);
    const dSq = (sx - px) * (sx - px) + (sy - py) * (sy - py);
    if (dSq < 9 * sigma * sigma) {
      total += 0.70 * Math.exp(-dSq / sigmaSq2);
    }
  }

  return Math.min(1.0, total);
}

/**
 * Generates 1D CTF oscillation curve from s = 0 up to Nyquist frequency,
 * with optional diffraction artifact simulation.
 */
export function generateCtfProfile(
  voltageKv: number,
  csMm: number,
  defocusUm: number,
  pixelSize: number,
  amplitudeContrast = 0.07,
  bFactor = 50,
  points = 250,
  diffractionType: DiffractionArtifactType = 'none'
): CtfPoint[] {
  const lambdaA = relativisticWavelength(voltageKv);
  const dfA = defocusUm * 10000;
  const csA = csMm * 1e7;
  const sNyquist = 1 / (2 * pixelSize);

  const result: CtfPoint[] = [];
  for (let i = 0; i <= points; i++) {
    const s = (i / points) * sNyquist;
    const d = s > 0 ? 1 / s : 999;
    const ctf = ctfValue(s, dfA, csA, lambdaA, amplitudeContrast, bFactor);
    const diffInt = computeDiffractionIntensity(s, diffractionType);
    const totalPower = Math.min(1.0, ctf * ctf + diffInt);
    result.push({
      s: Math.round(s * 10000) / 10000,
      d: Math.round(d * 100) / 100,
      ctf: Math.round(ctf * 10000) / 10000,
      power: Math.round(totalPower * 10000) / 10000,
      diffraction: Math.round(diffInt * 10000) / 10000,
    });
  }
  return result;
}

/**
 * Generates 2D power spectrum matrix (Thon rings) for a square grid of size x size,
 * incorporating astigmatic defocus, phase envelope, and structural diffraction rings.
 * Returns normalized values (0 to 1) for direct rendering on an HTML Canvas.
 */
export function generateThonRingsMatrix(
  size: number,
  voltageKv: number,
  csMm: number,
  dfU_um: number,
  dfV_um: number,
  astAngleDeg: number,
  pixelSize: number,
  amplitudeContrast = 0.07,
  bFactor = 50,
  diffractionType: DiffractionArtifactType = 'none'
): Float32Array {
  const lambdaA = relativisticWavelength(voltageKv);
  const dfU_A = dfU_um * 10000;
  const dfV_A = dfV_um * 10000;
  const astAngleRad = (astAngleDeg * Math.PI) / 180;
  const csA = csMm * 1e7;
  const sNyquist = 1 / (2 * pixelSize);

  const matrix = new Float32Array(size * size);
  const half = size / 2;

  // Precompute 2D hexagonal spots for graphene
  const grapheneSpots: { px: number; py: number; intensity: number; sigmaSq2: number }[] = [];
  if (diffractionType === 'graphene') {
    const s1 = 1 / 2.13;
    const s2 = 1 / 1.23;
    const sigma = 0.012;
    const sigmaSq2 = 2 * sigma * sigma;
    const theta0 = (15 * Math.PI) / 180;
    for (let k = 0; k < 6; k++) {
      const a = theta0 + (k * Math.PI) / 3;
      grapheneSpots.push({ px: s1 * Math.cos(a), py: s1 * Math.sin(a), intensity: 0.95, sigmaSq2 });
    }
    const theta1 = theta0 + Math.PI / 6;
    for (let k = 0; k < 6; k++) {
      const a = theta1 + (k * Math.PI) / 3;
      grapheneSpots.push({ px: s2 * Math.cos(a), py: s2 * Math.sin(a), intensity: 0.70, sigmaSq2 });
    }
  }

  for (let y = 0; y < size; y++) {
    const ny = (y - half) / half; // -1 to 1
    const sy = ny * sNyquist;
    const yOffset = y * size;

    for (let x = 0; x < size; x++) {
      const nx = (x - half) / half; // -1 to 1
      const sx = nx * sNyquist;

      const s = Math.sqrt(sx * sx + sy * sy);
      if (s > sNyquist) {
        matrix[yOffset + x] = 0;
        continue;
      }

      const ctf = ctf2D(sx, sy, dfU_A, dfV_A, astAngleRad, csA, lambdaA, amplitudeContrast, bFactor);
      let power = ctf * ctf;
      if (diffractionType === 'graphene') {
        let diffInt = 0;
        for (let i = 0; i < grapheneSpots.length; i++) {
          const spot = grapheneSpots[i]!;
          const dx = sx - spot.px;
          const dy = sy - spot.py;
          const dSq = dx * dx + dy * dy;
          if (dSq < 0.0014) {
            diffInt += spot.intensity * Math.exp(-dSq / spot.sigmaSq2);
          }
        }
        power = Math.min(1.0, power + diffInt);
      } else if (diffractionType !== 'none') {
        const diffInt = computeDiffractionIntensity(s, diffractionType);
        power = Math.min(1.0, power + diffInt);
      }
      matrix[yOffset + x] = power;
    }
  }

  return matrix;
}

export * from './mrc';

