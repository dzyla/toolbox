/**
 * sRGB helpers shared by the colour modules. Everything here is DOM-free.
 *
 * Colours travel as lowercase 6-digit hex strings (#rrggbb). Channel values are
 * 0..255 integers in `Rgb255` and 0..1 floats in `Linear` (gamma-expanded, the
 * space in which colour-blind simulation and luminance are computed).
 *
 * Transfer function: IEC 61966-2-1:1999 (sRGB), thresholds 0.04045 / 0.0031308.
 */
import { color as parseColor, rgb as d3rgb } from 'd3-color';

export class ColorError extends Error {}

export type Rgb255 = { r: number; g: number; b: number };
export type Linear = readonly [number, number, number];

/** Parse any CSS colour d3-color understands (hex, rgb(), hsl(), named) into #rrggbb. */
export function toHex(input: string): string {
  const c = parseColor(input.trim());
  if (!c) throw new ColorError(`Not a colour: "${input}"`);
  return c.formatHex();
}

export function hexToRgb(hex: string): Rgb255 {
  const c = parseColor(hex);
  if (!c) throw new ColorError(`Not a colour: "${hex}"`);
  const { r, g, b } = c.rgb();
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

const clamp255 = (x: number) => Math.min(255, Math.max(0, Math.round(x)));
export function rgbToHex({ r, g, b }: Rgb255): string {
  return d3rgb(clamp255(r), clamp255(g), clamp255(b)).formatHex();
}

/** sRGB 8-bit channel → linear light (IEC 61966-2-1). */
export function srgbToLinear(c255: number): number {
  const c = c255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
/** Linear light → sRGB 8-bit channel, clamped to the gamut. */
export function linearToSrgb(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  const c = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return clamp255(c * 255);
}

export function hexToLinear(hex: string): Linear {
  const { r, g, b } = hexToRgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}
export function linearToHex([r, g, b]: Linear): string {
  return rgbToHex({ r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) });
}
