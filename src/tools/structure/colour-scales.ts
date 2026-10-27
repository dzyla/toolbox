/** Colour scales shared by the Mol* themes and the legend drawn over the viewer (no Mol* imports). */

/** AlphaFold's pLDDT bands, highest first: a residue at `min` or above (and under the band above) gets `color`. */
export const PLDDT_BANDS: { min: number; label: string; color: number }[] = [
  { min: 90, label: 'Very high (> 90)', color: 0x0053d6 },
  { min: 70, label: 'Confident (70–90)', color: 0x65cbf3 },
  { min: 50, label: 'Low (50–70)', color: 0xffdb13 },
  { min: -Infinity, label: 'Very low (< 50)', color: 0xff7d45 },
];

export function plddtColor(score: number): number {
  return (PLDDT_BANDS.find(b => score > b.min) ?? PLDDT_BANDS[PLDDT_BANDS.length - 1]!).color;
}

/** B-factor: blue (well ordered) through white to red (mobile), PyMOL's convention. */
export const BFACTOR_COLORS = [0x2166ac, 0xf7f7f7, 0xb2182b];

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
