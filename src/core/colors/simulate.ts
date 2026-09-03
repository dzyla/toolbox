/**
 * Colour-vision-deficiency simulation.
 *
 * Model: Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model
 * for Simulation of Color Vision Deficiency", IEEE Transactions on
 * Visualization and Computer Graphics 15(6):1291–1298,
 * doi:10.1109/TVCG.2009.113. The 3×3 matrices below are the authors'
 * published severity-1.0 (dichromat) matrices, which act on LINEAR sRGB
 * (https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html).
 *
 * Achromatopsia has no matrix in that paper; it is rendered as the relative
 * luminance Y of ITU-R BT.709 / IEC 61966-2-1 (0.2126 R + 0.7152 G + 0.0722 B,
 * linear light), i.e. a monochromat who sees only luminance.
 *
 * Limits: the model describes a typical dichromat viewing an sRGB display; it
 * does not reproduce any individual's perception, anomalous trichromacy
 * (milder, more common forms) is not modelled at severity 1.0, and out-of-gamut
 * results are clamped channel-wise.
 */
import { hexToLinear, linearToHex, type Linear } from './rgb';

export type Deficiency = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
export type Vision = 'normal' | Deficiency;

type Matrix = readonly [Linear, Linear, Linear];

/** Machado et al. 2009, severity 1.0. Rows give output R, G, B; columns take input R, G, B (linear light). */
export const MACHADO_2009: Record<Exclude<Deficiency, 'achromatopsia'>, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

/** ITU-R BT.709 luminance coefficients (also used by sRGB and WCAG). */
export const LUMA_709: Linear = [0.2126, 0.7152, 0.0722];

export const VISIONS: { id: Vision; label: string; blurb: string }[] = [
  { id: 'normal', label: 'Normal vision', blurb: 'As designed' },
  { id: 'protanopia', label: 'Protanopia', blurb: 'No L (red) cones' },
  { id: 'deuteranopia', label: 'Deuteranopia', blurb: 'No M (green) cones' },
  { id: 'tritanopia', label: 'Tritanopia', blurb: 'No S (blue) cones' },
  { id: 'achromatopsia', label: 'Achromatopsia', blurb: 'Luminance only' },
];

function apply(m: Matrix, v: Linear): Linear {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Simulate how `hex` appears to a viewer with the given vision. 'normal' returns the input normalised to #rrggbb. */
export function simulate(hex: string, vision: Vision): string {
  const lin = hexToLinear(hex);
  if (vision === 'normal') return linearToHex(lin);
  if (vision === 'achromatopsia') {
    const y = LUMA_709[0] * lin[0] + LUMA_709[1] * lin[1] + LUMA_709[2] * lin[2];
    return linearToHex([y, y, y]);
  }
  return linearToHex(apply(MACHADO_2009[vision], lin));
}

export function simulatePalette(hexes: readonly string[], vision: Vision): string[] {
  return hexes.map(h => simulate(h, vision));
}
