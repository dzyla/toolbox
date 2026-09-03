/* Protein property profiles. Pure calculations; indices in returned arrays map
   directly to residues in the input sequence.

   Sources: Kyte & Doolittle (1982) J Mol Biol 157:105–132;
   Prilusky et al. (2005) Bioinformatics 21:3435–3438;
   Eisenberg, Weiss & Terwilliger (1984) PNAS 81:140–144;
   Chou & Fasman (1978) Adv Enzymol 47:45–148. */
import chouFasmanJson from '@/data/protein/chou-fasman.json';
import { AA_KD, perResidueCharge, type PKaScheme } from './index';

const CHOU_FASMAN = chouFasmanJson.values as Record<string, { H: number; E: number }>;

function validateWindow(window: number): number {
  if (!Number.isInteger(window) || window < 1) throw new RangeError('Window must be a positive integer.');
  return window;
}

/** Centred moving average. Edge windows use the residues that are available. */
function centredAverage(values: number[], requestedWindow: number): number[] {
  const window = validateWindow(requestedWindow);
  const left = Math.floor((window - 1) / 2);
  const right = window - left - 1;
  return values.map((_, index) => {
    const start = Math.max(0, index - left);
    const end = Math.min(values.length - 1, index + right);
    let sum = 0;
    for (let cursor = start; cursor <= end; cursor++) sum += values[cursor]!;
    return sum / (end - start + 1);
  });
}

/** Kyte–Doolittle hydropathy, centred moving-average window (default 9). */
export function hydropathyProfile(seq: string, window = 9): number[] {
  return centredAverage([...seq].map(residue => AA_KD[residue] ?? 0), window);
}

/** Fractional charge per residue from `perResidueCharge`, then centred smoothing. */
export function chargeProfile(seq: string, pH: number, window = 9, scheme: PKaScheme = 'bjellqvist'): number[] {
  if (!Number.isFinite(pH)) throw new RangeError('pH must be finite.');
  return centredAverage(perResidueCharge(seq, pH, scheme), window);
}

/**
 * FoldIndex score using a 51-residue window by default.
 * H is normalised as (KD + 4.5) / 9. Integer K/R/D/E charges reproduce the
 * published FoldIndex server convention; positive predicts folded and negative
 * predicts intrinsically disordered sequence.
 */
export function foldIndexProfile(seq: string, window = 51): number[] {
  const meanHydropathy = centredAverage([...seq].map(residue => ((AA_KD[residue] ?? 0) + 4.5) / 9), window);
  const meanCharge = centredAverage([...seq].map(residue => residue === 'K' || residue === 'R' ? 1 : residue === 'D' || residue === 'E' ? -1 : 0), window);
  return meanHydropathy.map((hydropathy, index) => 2.785 * hydropathy - Math.abs(meanCharge[index]!) - 1.151);
}

/**
 * Eisenberg α-helical hydrophobic moment with δ=100° and a default 11-residue
 * window, using the Kyte–Doolittle scale. Positions without a complete window
 * are zero so partial edge windows are not mistaken for strong amphipathicity.
 */
export function hydrophobicMomentProfile(seq: string, window = 11, angleDegrees = 100): number[] {
  validateWindow(window);
  if (!Number.isFinite(angleDegrees)) throw new RangeError('Helix angle must be finite.');
  const result = new Array<number>(seq.length).fill(0);
  if (seq.length < window) return result;
  const angle = angleDegrees * Math.PI / 180;
  const offset = Math.floor(window / 2);
  for (let start = 0; start <= seq.length - window; start++) {
    let x = 0, y = 0;
    for (let position = 0; position < window; position++) {
      const hydropathy = AA_KD[seq[start + position]!] ?? 0;
      x += hydropathy * Math.cos(position * angle);
      y += hydropathy * Math.sin(position * angle);
    }
    result[start + offset] = Math.hypot(x, y) / window;
  }
  return result;
}

/** Chou–Fasman Pα/Pβ propensities divided by 100, with 6/5-residue windows. */
export function secondaryStructureProfiles(seq: string, helixWindow = 6, sheetWindow = 5): { helix: number[]; sheet: number[] } {
  const helix = [...seq].map(residue => (CHOU_FASMAN[residue]?.H ?? 100) / 100);
  const sheet = [...seq].map(residue => (CHOU_FASMAN[residue]?.E ?? 100) / 100);
  return { helix: centredAverage(helix, helixWindow), sheet: centredAverage(sheet, sheetWindow) };
}
