import { describe, expect, it } from 'vitest';
import { mergeLinkState } from '@/lib/url-state';
import { solveMixture } from '@/core/buffers/mixture';
import {
  DEFAULTS, defaultBuffer, fromMixture, isMixtureComponent, mixDefaults, toMixture, type EditorComponent,
} from '@/tools/buffers/state';
import { findSystem } from '@/core/buffers/pka';
import { displayAmount, ionicStrengthLines, phLines, recipeCsvRows, recipeText } from '@/tools/buffers/recipe-text';
import presetsJson from '@/data/buffer-presets.json';
import type { Preset } from '@/tools/buffers/state';

const preset = (id: string) => (presetsJson.presets as unknown as Preset[]).find(p => p.id === id)!;
const solvePreset = (id: string) => {
  const p = preset(id);
  return solveMixture(p.components, { finalVolume_L: p.finalVolume_L, workingTemp_C: 25, ionicCorrection: true });
};

const opts = { finalVolume_L: 0.5, workingTemp_C: 25, ionicCorrection: true };

describe('editor defaults', () => {
  it('starts from the audited Tris-base row so the first screen still weighs 605.7 mg', () => {
    expect(DEFAULTS.components).toHaveLength(1);
    const result = solveMixture(DEFAULTS.components.map(c => toMixture(c, 25)), { ...opts, finalVolume_L: 0.5 });
    expect(result.rows[0]!.amount).toBeCloseTo(0.6057, 4);
  });

  it('picks sensible buffer defaults per system', () => {
    expect(defaultBuffer('tris')).toMatchObject({ systemId: 'tris', mode: 'design', method: 'titrate', formId: 'tris-base', pH: 8 });
    expect(defaultBuffer('hepes')).toMatchObject({ formId: 'hepes-acid', pH: 7.5 });
    expect(defaultBuffer('phosphate')).toMatchObject({ pH: 7 });
    expect(defaultBuffer('nope').systemId).toBe('tris');
  });

  it('chooses the most- and least-protonated forms for mixing', () => {
    expect(mixDefaults(findSystem('phosphate')!)).toEqual({ formId: 'nah2po4', formId2: 'na2hpo4' });
    expect(mixDefaults(findSystem('tris')!)).toEqual({ formId: 'tris-hcl', formId2: 'tris-base' });
  });
});

describe('editor ↔ mixture conversion', () => {
  const bufferRow: EditorComponent = {
    id: 'r1', query: 'Tris', name: 'Tris', kind: 'buffer', target: { value: 50, unit: 'mM' }, buffer: defaultBuffer('tris'),
  };

  it('resolves "follow the working temperature" into the core component', () => {
    const c = toMixture(bufferRow, 4);
    expect(c).toMatchObject({ kind: 'buffer', mode: 'design', pHTemp_C: 4, pH: 8 });
    expect(toMixture({ ...bufferRow, buffer: { ...bufferRow.buffer!, pHTemp_C: 25 } }, 4)).toMatchObject({ pHTemp_C: 25 });
  });

  it('coerces a non-molar buffer target to mM rather than passing % or x to the core', () => {
    const c = toMixture({ ...bufferRow, target: { value: 5, unit: '%' } }, 25);
    expect(c.kind === 'buffer' && c.target.unit).toBe('mM');
  });

  it('round-trips a buffer row through the stored shape', () => {
    const stored = toMixture({ ...bufferRow, buffer: { ...bufferRow.buffer!, mode: 'premade', stockConc: 1, stockPH: 8 } }, 25);
    expect(isMixtureComponent(stored)).toBe(true);
    const back = fromMixture(stored);
    expect(back).toMatchObject({ kind: 'buffer', name: 'Tris', buffer: { mode: 'premade', systemId: 'tris', stockPH: 8 } });
    expect(toMixture(back, 25)).toEqual(stored);
  });

  it('keeps solid and stock rows exactly as before', () => {
    const solid = fromMixture({ name: 'NaCl', kind: 'solid', mw: 58.44, waters: 0, target: { value: 150, unit: 'mM' } });
    expect(solid).toMatchObject({ kind: 'solid', waters: 0, query: 'NaCl' });
    expect(toMixture(solid, 25)).toEqual({ name: 'NaCl', kind: 'solid', mw: 58.44, waters: 0, target: { value: 150, unit: 'mM' } });
    const stock = fromMixture({ name: 'Glycerol', kind: 'stock', stockConc: 100, stockUnit: '%', target: { value: 10, unit: '%' }, density: 1.26 });
    expect(stock.waters).toBeUndefined();
    expect(toMixture({ ...stock, stockConc: NaN }, 25)).toMatchObject({ stockConc: 1 });
  });
});

describe('library validation and old data (review focus 5)', () => {
  it('accepts old solid/stock rows and new buffer rows, and rejects malformed ones', () => {
    expect(isMixtureComponent({ name: 'x', kind: 'solid', target: { value: 1, unit: 'mM' } })).toBe(true);
    expect(isMixtureComponent({ name: 'x', kind: 'stock', stockConc: 10, stockUnit: 'x', target: { value: 1, unit: 'x' } })).toBe(true);
    expect(isMixtureComponent({ name: 'x', kind: 'stock', target: { value: 1, unit: 'x' } })).toBe(false);
    const ok = { kind: 'buffer', mode: 'design', name: 'T', systemId: 'tris', target: { value: 50, unit: 'mM' }, pH: 8, pHTemp_C: 25, method: 'titrate', formId: 'tris-base', titrantConc_M: 1 };
    expect(isMixtureComponent(ok)).toBe(true);
    expect(isMixtureComponent({ ...ok, systemId: 'nope' })).toBe(false);
    expect(isMixtureComponent({ ...ok, pH: 'eight' })).toBe(false);
    expect(isMixtureComponent({ ...ok, mode: 'other' })).toBe(false);
    expect(isMixtureComponent(null)).toBe(false);
  });

  it('merges an old share link (removed pH/temperature/bufferId keys, solid rows only) onto the new defaults', () => {
    const old = {
      volume: { value: 100, unit: 'mL' }, pH: 7.4, temperature: 4, bufferId: 'hepes',
      components: [{ id: 'buffer-row-0', query: 'NaCl', name: 'NaCl', kind: 'solid', mw: 58.44, waters: 0, target: { value: 150, unit: 'mM' } }],
    };
    const merged = mergeLinkState(DEFAULTS, old);
    expect(merged.volume).toEqual({ value: 100, unit: 'mL' });
    expect(merged.workingTemp_C).toBe(25);
    expect(merged.ionicCorrection).toBe(true);
    const result = solveMixture(merged.components.map(c => toMixture(c, merged.workingTemp_C)), { ...opts, finalVolume_L: 0.1 });
    expect(result.rows[0]!.amount).toBeCloseTo(0.8766, 4);
  });
});

describe('a missing temperature coefficient reaches the copy text', () => {
  const caps = (pHTemp_C?: number) => solveMixture([
    toMixture({ id: 'c', query: 'CAPS', name: 'CAPS', kind: 'buffer', target: { value: 50, unit: 'mM' }, buffer: { ...defaultBuffer('caps'), pH: 10.4, pHTemp_C } }, 4),
  ], { ...opts, finalVolume_L: 1, workingTemp_C: 4 });

  it('caveats the pasted protocol instead of claiming pH 10.4 at 4 °C outright', () => {
    const result = caps(undefined);
    // The pH line on its own is the bare positive claim the review objected to.
    expect(phLines(result, 4)[0]).toMatch(/^CAPS: pH 10\.4 at 4 °C/);
    const text = recipeText(result, '1 L', 4, 'SCIENCE');
    expect(text).toMatch(/CAPS: no published temperature coefficient \(dpKa\/dT\)/);
    expect(text).toMatch(/set the pH with a meter at 4 °C/);
  });

  it('says nothing extra when the whole recipe sits at 25 °C', () => {
    const result = solveMixture([
      toMixture({ id: 'c', query: 'CAPS', name: 'CAPS', kind: 'buffer', target: { value: 50, unit: 'mM' }, buffer: { ...defaultBuffer('caps'), pH: 10.4 } }, 25),
    ], { ...opts, finalVolume_L: 1, workingTemp_C: 25 });
    expect(recipeText(result, '1 L', 25, 'SCIENCE')).not.toMatch(/dpKa\/dT/);
  });
});

describe('recipe text', () => {
  const result = solveMixture([
    toMixture({ id: 'a', query: 'Tris', name: 'Tris', kind: 'buffer', target: { value: 50, unit: 'mM' }, buffer: { ...defaultBuffer('tris'), pHTemp_C: 25 } }, 4),
  ], { ...opts, workingTemp_C: 4 });

  it('formats grams and millilitres with SI prefixes', () => {
    expect(displayAmount(0.6057, 'g')).toBe('605.7 mg');
    expect(displayAmount(2.5, 'mL')).toMatch(/2\.5 mL/);
  });

  it('writes pH lines, copy text and CSV rows including the titrant row', () => {
    expect(phLines(result, 4)[0]).toMatch(/^Tris: pH 8 at 25 °C → pH 8\.5\d at 4 °C/);
    const text = recipeText(result, '500 mL', 4, 'SCIENCE');
    expect(text).toMatch(/^Buffer recipe — 500 mL/);
    expect(text).toMatch(/Tris base:/);
    expect(text).toMatch(/HCl 1 M/);
    expect(text).toMatch(/Bring to 500 mL with water\./);
    expect(text).toMatch(/SCIENCE$/);
    const rows = recipeCsvRows(result);
    expect(rows[0]).toEqual(['Component', 'Amount', 'Unit', 'Mass from density (g)']);
    expect(rows).toHaveLength(3);
  });

  it('reports the ionic strength of a buffer recipe and names nothing when everything is counted', () => {
    expect(ionicStrengthLines(result)).toEqual(['Ionic strength about 0.0287 M.']);
  });

  it('LB (Miller) says the ionic strength is not estimated rather than printing "about 0 M"', () => {
    const lb = solvePreset('LB_Miller');
    expect(lb.ionicStrength).toBe(0);
    expect(lb.notCounted).toEqual(['Tryptone', 'Yeast extract', 'Sodium Chloride (NaCl)']);
    const text = recipeText(lb, '1 L', 25, 'SCIENCE');
    expect(text).not.toMatch(/Ionic strength about/);
    expect(text).toMatch(/Ionic strength is not estimated: none of these components is in the ionic-strength model \(Tryptone, Yeast extract, Sodium Chloride \(NaCl\)\)\./);
  });

  it('PBS (1×) names the two phosphates its 0.14 M estimate leaves out', () => {
    const pbs = solvePreset('PBS_1x');
    expect(pbs.ionicStrength).toBeCloseTo(0.1397, 4);
    const text = recipeText(pbs, '1 L', 25, 'SCIENCE');
    expect(text).toMatch(/Ionic strength about 0\.14 M\./);
    expect(text).toMatch(/That excludes Sodium Phosphate Dibasic \(Na2HPO4\) anhydrous, Potassium Phosphate Monobasic \(KH2PO4\) anhydrous, whose ions are not in the ionic-strength model\./);
  });
});
