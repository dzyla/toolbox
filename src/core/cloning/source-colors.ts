/* One colour per hub source, the same everywhere in the hub. Okabe–Ito palette (colour-blind safe). */

export const SOURCE_COLORS: readonly string[] = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#7A7A7A'];
export const NO_SOURCE_COLOR = '#9ca3af';

export function sourceColor(index: number): string {
  return index < 0 ? NO_SOURCE_COLOR : SOURCE_COLORS[index % SOURCE_COLORS.length]!;
}

/** Dark or white text, whichever contrasts better with the background (WCAG relative luminance). */
export function readableOn(hex: string): '#111827' | '#ffffff' {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.35 ? '#111827' : '#ffffff';
}
