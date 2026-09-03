import { describe, it, expect } from 'vitest';
import {
  toHex, hexToRgb, rgbToHex, srgbToLinear, linearToSrgb, ColorError,
  SCHEMES, SCHEME_GROUPS, schemesByGroup, findScheme, schemeSize, samplePalette, MAX_COLORS,
  simulate, simulatePalette, MACHADO_2009,
  relativeLuminance, contrastRatio, labelColor, deltaE, closestPair,
  tints, tones, shades, variations,
  toPyMOL, toMatplotlib, toHexList, toRgbList, safeName,
} from '@/core/colors';

describe('rgb helpers', () => {
  it('parses and formats', () => {
    expect(toHex('#FF0000')).toBe('#ff0000');
    expect(toHex('rgb(68, 1, 84)')).toBe('#440154');
    expect(toHex('white')).toBe('#ffffff');
    expect(hexToRgb('#440154')).toEqual({ r: 68, g: 1, b: 84 });
    expect(rgbToHex({ r: 300, g: -5, b: 12.4 })).toBe('#ff000c');
    expect(() => toHex('not a colour')).toThrow(ColorError);
  });
  it('sRGB transfer function round-trips and hits IEC anchor points', () => {
    // IEC 61966-2-1: 8-bit 128 → 0.2158 linear (Poynton's tables give 0.2159 for 128/255 = 0.50196).
    expect(srgbToLinear(128)).toBeCloseTo(0.2158, 3);
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBe(1);
    for (const v of [0, 1, 10, 77, 128, 200, 255]) expect(linearToSrgb(srgbToLinear(v))).toBe(v);
  });
});

describe('schemes', () => {
  it('catalogue is complete and grouped', () => {
    expect(SCHEMES.length).toBeGreaterThanOrEqual(45);
    expect(new Set(SCHEMES.map(s => s.id)).size).toBe(SCHEMES.length);
    for (const g of schemesByGroup()) expect(g.schemes.length).toBeGreaterThan(0);
    expect(schemesByGroup().map(g => g.group)).toEqual(SCHEME_GROUPS);
    expect(findScheme('viridis')?.kind).toBe('continuous');
    expect(findScheme('set1')?.kind).toBe('categorical');
  });
  it('samples continuous schemes end to end', () => {
    // matplotlib viridis endpoints: #440154 and #fde725 (van der Walt & Smith 2015).
    const v = samplePalette('viridis', 5);
    expect(v).toHaveLength(5);
    expect(v[0]).toBe('#440154');
    expect(v[4]).toBe('#fde725');
    expect(samplePalette('viridis', 1)).toEqual([toHex(samplePalette('viridis', 3)[1]!)]);
    expect(samplePalette('viridis', 1000)).toHaveLength(MAX_COLORS);
    // d3 spline-interpolates the ColorBrewer diverging classes, so the RdBu midpoint is near-neutral, not exactly #f7f7f7.
    expect(deltaE(samplePalette('rdbu', 3)[1]!, '#f7f7f7')).toBeLessThan(5);
  });
  it('samples categorical schemes up to their size', () => {
    // ColorBrewer Set1 first colour is #e41a1c; the set has 9 colours.
    expect(schemeSize('set1')).toBe(9);
    expect(schemeSize('viridis')).toBeUndefined();
    expect(samplePalette('set1')).toHaveLength(9);
    expect(samplePalette('set1', 3)).toEqual(['#e41a1c', '#377eb8', '#4daf4a']);
    expect(samplePalette('set1', 99)).toHaveLength(9);
    expect(samplePalette('tableau10')).toHaveLength(10);
    expect(() => samplePalette('nope', 3)).toThrow(/Unknown/);
  });
});

describe('colour-blind simulation (Machado, Oliveira & Fernandes 2009, severity 1.0)', () => {
  it('pure red under protanopia lands on the published matrix result', () => {
    // Pure red is linear (1, 0, 0), so the output is the first column of the
    // protanopia matrix: (0.152286, 0.114503, −0.003882) linear.
    // sRGB encode: 1.055·0.152286^(1/2.4) − 0.055 = 0.4266 → 108.8 → 109;
    //              1.055·0.114503^(1/2.4) − 0.055 = 0.3727 → 95.0 → 95;
    //              negative clamps to 0. Expected #6d5f00 = (109, 95, 0).
    const { r, g, b } = hexToRgb(simulate('#ff0000', 'protanopia'));
    expect(Math.abs(r - 109)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - 95)).toBeLessThanOrEqual(2);
    expect(b).toBe(0);
  });
  it('deuteranopia and tritanopia columns behave the same way', () => {
    // Deuteranopia of red: first column (0.367322, 0.280085, −0.011820) → (163, 144, 0).
    expect(hexToRgb(simulate('#ff0000', 'deuteranopia'))).toEqual({ r: 163, g: 144, b: 0 });
    // Tritanopia of blue: third column (−0.178779, 0.147602, 0.303900) → (0, 107, 150).
    expect(hexToRgb(simulate('#0000ff', 'tritanopia'))).toEqual({ r: 0, g: 107, b: 150 });
  });
  it('matrices preserve white (rows sum to 1) so neutrals stay neutral', () => {
    for (const m of Object.values(MACHADO_2009)) for (const row of m) expect(row[0] + row[1] + row[2]).toBeCloseTo(1, 4);
    for (const v of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const) {
      expect(simulate('#ffffff', v)).toBe('#ffffff');
      expect(simulate('#000000', v)).toBe('#000000');
    }
  });
  it('achromatopsia is BT.709 luminance: red → Y = 0.2126 linear → 127', () => {
    expect(hexToRgb(simulate('#ff0000', 'achromatopsia'))).toEqual({ r: 127, g: 127, b: 127 });
    expect(simulate('#123456', 'normal')).toBe('#123456');
    expect(simulatePalette(['#ff0000', '#00ff00'], 'protanopia')).toHaveLength(2);
  });
});

describe('contrast (WCAG 2.1)', () => {
  it('black/white = 21 and white/white = 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 10);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(relativeLuminance('#000000')).toBe(0);
  });
  it('matches a published pair: #777777 on white is 4.48 (fails AA text by a hair)', () => {
    // Widely quoted WCAG example: grey #777 on white → 4.48:1.
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(labelColor('#ffff00')).toBe('#000000');
    expect(labelColor('#000080')).toBe('#ffffff');
  });
  it('ΔE*ab: identical colours 0, black/white 100, closest pair found', () => {
    expect(deltaE('#ff0000', '#ff0000')).toBe(0);
    expect(deltaE('#000000', '#ffffff')).toBeCloseTo(100, 0);
    expect(closestPair(['#ff0000', '#00ff00', '#ff0101'])).toMatchObject({ i: 0, j: 2 });
    expect(closestPair(['#ff0000'])).toBeUndefined();
  });
});

describe('tints, tones, shades', () => {
  const lum = (hexes: string[]) => hexes.map(relativeLuminance);
  const increasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);
  it('tints of #000000 lighten monotonically', () => {
    const t = tints('#000000', 5);
    expect(t).toHaveLength(5);
    expect(increasing(lum(t))).toBe(true);
    expect(t[0]).toBe('#2b2b2b'); // 255/6 = 42.5 → 43 = 0x2b
    expect(t[4]).toBe('#d5d5d5'); // 5·255/6 = 212.5 → 213 = 0xd5
  });
  it('shades darken, tones desaturate toward grey', () => {
    expect(increasing(lum(shades('#ffffff', 4)).reverse())).toBe(true);
    const tn = tones('#ff0000', 3);
    expect(deltaE(tn[2]!, '#808080')).toBeLessThan(deltaE(tn[0]!, '#808080'));
    const v = variations('#3366cc');
    expect(v.tints).toHaveLength(5); expect(v.tones).toHaveLength(5); expect(v.shades).toHaveLength(5);
    expect(tints('#000000', 0)).toEqual([]);
  });
});

describe('exports', () => {
  it('PyMOL set_color lines', () => {
    expect(toPyMOL(['#000000', '#ffffff'], 'name')).toBe('set_color name_1, [0.000, 0.000, 0.000]\nset_color name_2, [1.000, 1.000, 1.000]');
    expect(toPyMOL(['#440154'])).toBe('set_color color_1, [0.267, 0.004, 0.329]');
    expect(toPyMOL(['#000000'], 'my palette!')).toMatch(/^set_color my_palette_1, /);
    expect(safeName('1abc')).toBe('_1abc');
    expect(safeName('   ')).toBe('color');
  });
  it('matplotlib, hex and rgb lists', () => {
    expect(toMatplotlib(['#440154', '#fde725'])).toBe("colors = ['#440154', '#fde725']");
    expect(toMatplotlib(['#440154'], 'viridis 3')).toBe("viridis_3 = ['#440154']");
    expect(toHexList(['#440154', '#fde725'])).toBe('#440154\n#fde725');
    expect(toRgbList(['#440154'])).toBe('68, 1, 84');
  });
});
