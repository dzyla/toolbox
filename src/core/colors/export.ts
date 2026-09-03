/** Text exports. Channels are written as 0..1 floats with three decimals. */
import { hexToRgb } from './rgb';

const chan = (v: number) => (v / 255).toFixed(3);

/** Identifier safe for PyMOL and Python: letters, digits, underscore; never empty or digit-led. */
export function safeName(name: string, fallback = 'color'): string {
  const s = name.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) return fallback;
  return /^[0-9]/.test(s) ? `_${s}` : s;
}

/** One `set_color name_i, [r, g, b]` line per colour, 1-based, as PyMOL's `set_color` command expects. */
export function toPyMOL(hexes: readonly string[], name = 'color'): string {
  const n = safeName(name);
  return hexes.map((h, i) => { const c = hexToRgb(h); return `set_color ${n}_${i + 1}, [${chan(c.r)}, ${chan(c.g)}, ${chan(c.b)}]`; }).join('\n');
}

/** A Python list of hex strings, e.g. `colors = ['#440154', '#fde725']`, usable as matplotlib `color=` or `ListedColormap(colors)`. */
export function toMatplotlib(hexes: readonly string[], name = 'colors'): string {
  return `${safeName(name, 'colors')} = [${hexes.map(h => `'${h}'`).join(', ')}]`;
}

/** Hex codes one per line. */
export function toHexList(hexes: readonly string[]): string { return hexes.join('\n'); }

/** RGB 0..255 triplets, one per line, comma separated (spreadsheets, ImageJ LUTs). */
export function toRgbList(hexes: readonly string[]): string {
  return hexes.map(h => { const c = hexToRgb(h); return `${c.r}, ${c.g}, ${c.b}`; }).join('\n');
}
