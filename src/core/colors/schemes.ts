/**
 * Palette catalogue and sampling.
 *
 * Sources of the schemes (all via d3-scale-chromatic, https://github.com/d3/d3-scale-chromatic):
 *  - ColorBrewer sequential and diverging schemes: Brewer, C. A., Harrower, M.,
 *    Sheesley, B., Woodruff, A. and Heyman, D., https://colorbrewer2.org
 *    (Apache-2.0).
 *  - Viridis, Plasma, Inferno, Magma: van der Walt & Smith 2015, matplotlib
 *    (https://bids.github.io/colormap/). Cividis: Nuñez, Anderton & Renslow
 *    2018, PLoS ONE 13(7):e0199239. Turbo: Mikhailov 2019, Google AI Blog.
 *  - Warm, Cool, Rainbow, Sinebow: Bostock (cubehelix and sine-based rainbows).
 *  - Categorical: ColorBrewer qualitative sets, Tableau 10, Observable 10, and
 *    the D3 category10 set.
 */
import * as c from 'd3-scale-chromatic';
import { toHex } from './rgb';

export type SchemeGroup = 'Sequential (multi-hue)' | 'Sequential (single hue)' | 'Diverging' | 'Cyclical' | 'Categorical';

export interface Scheme {
  id: string; label: string; group: SchemeGroup;
  /** Continuous interpolator over t in [0, 1], or a fixed list of colours. */
  kind: 'continuous' | 'categorical';
  /** True when the palette reads well in greyscale and is designed to be colour-blind friendly (perceptually uniform maps). */
  uniform?: boolean;
}

type Entry = Scheme & ({ kind: 'continuous'; f: (t: number) => string } | { kind: 'categorical'; colors: readonly string[] });

const cont = (id: string, label: string, group: SchemeGroup, f: (t: number) => string, uniform = false): Entry => ({ id, label, group, kind: 'continuous', f, uniform });
const cat = (id: string, label: string, colors: readonly string[]): Entry => ({ id, label, group: 'Categorical', kind: 'categorical', colors });

const ENTRIES: Entry[] = [
  cont('viridis', 'Viridis', 'Sequential (multi-hue)', c.interpolateViridis, true),
  cont('plasma', 'Plasma', 'Sequential (multi-hue)', c.interpolatePlasma, true),
  cont('inferno', 'Inferno', 'Sequential (multi-hue)', c.interpolateInferno, true),
  cont('magma', 'Magma', 'Sequential (multi-hue)', c.interpolateMagma, true),
  cont('cividis', 'Cividis', 'Sequential (multi-hue)', c.interpolateCividis, true),
  cont('turbo', 'Turbo', 'Sequential (multi-hue)', c.interpolateTurbo),
  cont('warm', 'Warm', 'Sequential (multi-hue)', c.interpolateWarm),
  cont('cool', 'Cool', 'Sequential (multi-hue)', c.interpolateCool),
  cont('bugn', 'BuGn', 'Sequential (multi-hue)', c.interpolateBuGn),
  cont('bupu', 'BuPu', 'Sequential (multi-hue)', c.interpolateBuPu),
  cont('gnbu', 'GnBu', 'Sequential (multi-hue)', c.interpolateGnBu),
  cont('orrd', 'OrRd', 'Sequential (multi-hue)', c.interpolateOrRd),
  cont('pubugn', 'PuBuGn', 'Sequential (multi-hue)', c.interpolatePuBuGn),
  cont('pubu', 'PuBu', 'Sequential (multi-hue)', c.interpolatePuBu),
  cont('purd', 'PuRd', 'Sequential (multi-hue)', c.interpolatePuRd),
  cont('rdpu', 'RdPu', 'Sequential (multi-hue)', c.interpolateRdPu),
  cont('ylgnbu', 'YlGnBu', 'Sequential (multi-hue)', c.interpolateYlGnBu),
  cont('ylgn', 'YlGn', 'Sequential (multi-hue)', c.interpolateYlGn),
  cont('ylorbr', 'YlOrBr', 'Sequential (multi-hue)', c.interpolateYlOrBr),
  cont('ylorrd', 'YlOrRd', 'Sequential (multi-hue)', c.interpolateYlOrRd),
  cont('blues', 'Blues', 'Sequential (single hue)', c.interpolateBlues),
  cont('greens', 'Greens', 'Sequential (single hue)', c.interpolateGreens),
  cont('greys', 'Greys', 'Sequential (single hue)', c.interpolateGreys),
  cont('oranges', 'Oranges', 'Sequential (single hue)', c.interpolateOranges),
  cont('purples', 'Purples', 'Sequential (single hue)', c.interpolatePurples),
  cont('reds', 'Reds', 'Sequential (single hue)', c.interpolateReds),
  cont('brbg', 'BrBG', 'Diverging', c.interpolateBrBG),
  cont('prgn', 'PRGn', 'Diverging', c.interpolatePRGn),
  cont('piyg', 'PiYG', 'Diverging', c.interpolatePiYG),
  cont('puor', 'PuOr', 'Diverging', c.interpolatePuOr),
  cont('rdbu', 'RdBu', 'Diverging', c.interpolateRdBu),
  cont('rdgy', 'RdGy', 'Diverging', c.interpolateRdGy),
  cont('rdylbu', 'RdYlBu', 'Diverging', c.interpolateRdYlBu),
  cont('rdylgn', 'RdYlGn', 'Diverging', c.interpolateRdYlGn),
  cont('spectral', 'Spectral', 'Diverging', c.interpolateSpectral),
  cont('rainbow', 'Rainbow', 'Cyclical', c.interpolateRainbow),
  cont('sinebow', 'Sinebow', 'Cyclical', c.interpolateSinebow),
  cat('tableau10', 'Tableau 10', c.schemeTableau10),
  cat('observable10', 'Observable 10', c.schemeObservable10),
  cat('category10', 'Category 10', c.schemeCategory10),
  cat('accent', 'Accent', c.schemeAccent),
  cat('dark2', 'Dark2', c.schemeDark2),
  cat('paired', 'Paired', c.schemePaired),
  cat('pastel1', 'Pastel1', c.schemePastel1),
  cat('pastel2', 'Pastel2', c.schemePastel2),
  cat('set1', 'Set1', c.schemeSet1),
  cat('set2', 'Set2', c.schemeSet2),
  cat('set3', 'Set3', c.schemeSet3),
];

export const SCHEME_GROUPS: SchemeGroup[] = ['Sequential (multi-hue)', 'Sequential (single hue)', 'Diverging', 'Cyclical', 'Categorical'];

export const SCHEMES: Scheme[] = ENTRIES.map(({ id, label, group, kind, uniform }) => ({ id, label, group, kind, uniform }));

export function findScheme(id: string): Scheme | undefined { return SCHEMES.find(s => s.id === id); }

export function schemesByGroup(): { group: SchemeGroup; schemes: Scheme[] }[] {
  return SCHEME_GROUPS.map(group => ({ group, schemes: SCHEMES.filter(s => s.group === group) }));
}

export const MAX_COLORS = 256;

/** Number of colours a categorical scheme carries; undefined for continuous ones. */
export function schemeSize(id: string): number | undefined {
  const e = ENTRIES.find(s => s.id === id);
  return e?.kind === 'categorical' ? e.colors.length : undefined;
}

/**
 * Sample `n` colours from a scheme as #rrggbb.
 * Continuous: t_i = i / (n − 1) for i = 0..n−1 (both ends included; n = 1 gives t = 0.5).
 * Categorical: the first n colours of the fixed list; n defaults to, and is capped at, the list length.
 */
export function samplePalette(id: string, n?: number): string[] {
  const e = ENTRIES.find(s => s.id === id);
  if (!e) throw new Error(`Unknown colour scheme "${id}"`);
  if (e.kind === 'categorical') {
    const k = n === undefined ? e.colors.length : Math.min(e.colors.length, Math.max(1, Math.floor(n)));
    return e.colors.slice(0, k).map(toHex);
  }
  const k = Math.min(MAX_COLORS, Math.max(1, Math.floor(n ?? 8)));
  const out: string[] = [];
  for (let i = 0; i < k; i++) out.push(toHex(e.f(k > 1 ? i / (k - 1) : 0.5)));
  return out;
}
