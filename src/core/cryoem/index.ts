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
