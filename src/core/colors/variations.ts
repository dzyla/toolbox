/**
 * Tints, tones and shades in the colour-theory sense (Itten, The Art of
 * Color, 1961): a tint mixes the colour with white, a shade with black, a
 * tone with mid grey. Mixing is linear in sRGB (d3-interpolate's
 * interpolateRgb), the same result as compositing the colour at reduced
 * opacity over white / black / grey in a figure editor.
 */
import { interpolateRgb } from 'd3-interpolate';
import { toHex } from './rgb';

export interface Variations { tints: string[]; tones: string[]; shades: string[] }

function mixSeries(hex: string, target: string, steps: number): string[] {
  if (!(steps >= 1)) return [];
  const f = interpolateRgb(toHex(hex), target);
  const out: string[] = [];
  for (let i = 1; i <= steps; i++) out.push(toHex(f(i / (steps + 1))));
  return out;
}

/** `steps` colours from the base towards white, both ends excluded, lightest last. */
export function tints(hex: string, steps = 5): string[] { return mixSeries(hex, '#ffffff', steps); }
/** `steps` colours from the base towards black, both ends excluded, darkest last. */
export function shades(hex: string, steps = 5): string[] { return mixSeries(hex, '#000000', steps); }
/** `steps` colours from the base towards mid grey (#808080), both ends excluded, greyest last. */
export function tones(hex: string, steps = 5): string[] { return mixSeries(hex, '#808080', steps); }

export function variations(hex: string, steps = 5): Variations {
  return { tints: tints(hex, steps), tones: tones(hex, steps), shades: shades(hex, steps) };
}
