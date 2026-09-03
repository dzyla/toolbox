/**
 * Contrast and colour difference.
 *
 * Relative luminance and contrast ratio follow WCAG 2.1
 * (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance,
 *  https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio). WCAG's text uses the
 * 0.03928 threshold in the transfer function; ./rgb uses IEC's 0.04045 (same
 * curve, the difference is below 8-bit precision) so one conversion serves all.
 *
 * Colour difference: CIE76 ΔE*ab, the Euclidean distance in CIELAB (D65, as
 * implemented by d3-color). Mahy, Van Eycken & Oosterlinck (1994), Color
 * Research & Application 19(2):105–121, put the just-noticeable difference at
 * about 2.3 ΔE*ab.
 */
import { lab } from 'd3-color';
import { hexToLinear } from './rgb';
import { LUMA_709 } from './simulate';

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToLinear(hex);
  return LUMA_709[0] * r + LUMA_709[1] * g + LUMA_709[2] * b;
}

/** WCAG contrast ratio, 1 .. 21, symmetric in its arguments. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.1 success-criterion thresholds (1.4.3 and 1.4.6). */
export const WCAG = { AA_TEXT: 4.5, AA_LARGE: 3, AAA_TEXT: 7 } as const;

/** Black or white, whichever contrasts more with `hex` (for labels drawn on a swatch). */
export function labelColor(hex: string): '#000000' | '#ffffff' {
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#ffffff') ? '#000000' : '#ffffff';
}

/** CIE76 colour difference ΔE*ab. */
export function deltaE(a: string, b: string): number {
  const la = lab(a), lb = lab(b);
  return Math.hypot(la.l - lb.l, la.a - lb.a, la.b - lb.b);
}

/** Just-noticeable difference in ΔE*ab (Mahy et al. 1994). */
export const JND_DELTA_E = 2.3;

/** The closest pair in a palette; undefined for fewer than two colours. */
export function closestPair(hexes: readonly string[]): { i: number; j: number; deltaE: number } | undefined {
  let best: { i: number; j: number; deltaE: number } | undefined;
  for (let i = 0; i < hexes.length; i++) for (let j = i + 1; j < hexes.length; j++) {
    const d = deltaE(hexes[i]!, hexes[j]!);
    if (!best || d < best.deltaE) best = { i, j, deltaE: d };
  }
  return best;
}
