import { describe, expect, it } from 'vitest';
import { BufferRecipeError, solveRecipe } from '@/core/buffers/recipe';
import { solveMixture, type DesignBuffer, type MixtureComponent, type PremadeBuffer } from '@/core/buffers/mixture';

const base = { finalVolume_L: 1, workingTemp_C: 25, ionicCorrection: true };
const off = { ...base, ionicCorrection: false };
const design = (o: Partial<DesignBuffer> & Pick<DesignBuffer, 'name' | 'systemId' | 'formId'>): DesignBuffer => ({
  kind: 'buffer', mode: 'design', method: 'titrate', pH: 7, pHTemp_C: 25, titrantConc_M: 1, target: { value: 50, unit: 'mM' }, ...o,
});
const premade = (o: Partial<PremadeBuffer> & Pick<PremadeBuffer, 'name' | 'systemId'>): PremadeBuffer => ({
  kind: 'buffer', mode: 'premade', stockConc: 1, stockUnit: 'M', stockPH: 8, stockTemp_C: 25, target: { value: 50, unit: 'mM' }, ...o,
});
const nacl: MixtureComponent = { kind: 'solid', name: 'Sodium Chloride (NaCl)', mw: 58.44, target: { value: 150, unit: 'mM' } };

describe('mixtures without buffer rows', () => {
  it('match solveRecipe row for row and report what the ionic strength could not count', () => {
    const comps: MixtureComponent[] = [
      nacl,
      { kind: 'solid', name: 'Glycerol', mw: 92.09, target: { value: 5, unit: '%' } },
    ];
    const result = solveMixture(comps, base);
    const expected = solveRecipe(comps as Parameters<typeof solveRecipe>[0], 1);
    expect(result.rows.map(r => [r.name, r.amount, r.unit])).toEqual(expected.map(r => [r.name, r.amount, r.unit]));
    expect(result.rows.every(r => r.role === 'component')).toBe(true);
    expect(result.buffers).toEqual([]);
    expect(result.ionicStrength).toBeCloseTo(0.15, 12);
    expect(result.notCounted).toEqual(['Glycerol']);
  });

  it('counts divalent salts with their ionic weight (MgCl2 3·C)', () => {
    const r = solveMixture([{ kind: 'solid', name: 'Magnesium Chloride (MgCl2) hexahydrate', mw: 203.3, target: { value: 10, unit: 'mM' } }], base);
    expect(r.ionicStrength).toBeCloseTo(0.03, 12);
  });
});

describe('design buffers: titrate', () => {
  it('Tris base to pH 8.0 at 25 °C needs 0.5345 equivalents of HCl (26.7 mL of 1 M per 50 mmol)', () => {
    const r = solveMixture([design({ name: 'Tris', systemId: 'tris', formId: 'tris-base', pH: 8 })], off);
    expect(r.rows[0]).toMatchObject({ name: 'Tris base', unit: 'g', role: 'component' });
    expect(r.rows[0]!.amount).toBeCloseTo(6.057, 3);
    expect(r.rows[1]).toMatchObject({ unit: 'mL', role: 'titrant' });
    expect(r.rows[1]!.name).toMatch(/^HCl 1 M/);
    expect(r.rows[1]!.amount).toBeCloseTo(26.724, 2);
    expect(r.buffers[0]!.titrantEquiv).toBeCloseTo(-0.5345, 4);
  });

  it('HEPES free acid to pH 7.5 with 150 mM NaCl needs NaOH, with the ionic correction (I = 0.179 M)', () => {
    const r = solveMixture([design({ name: 'HEPES', systemId: 'hepes', formId: 'hepes-acid', pH: 7.5 }), nacl], base);
    expect(r.rows[0]!.amount).toBeCloseTo(11.915, 3);
    expect(r.rows[1]!.name).toMatch(/^NaOH 1 M/);
    expect(r.rows[1]!.amount).toBeCloseTo(29.12, 1);
    expect(r.ionicStrength).toBeCloseTo(0.179, 3);
  });

  it('the ionic correction changes the answer (HEPES pH 7.5 without it needs 25.58 mL)', () => {
    const r = solveMixture([design({ name: 'HEPES', systemId: 'hepes', formId: 'hepes-acid', pH: 7.5 })], off);
    expect(r.rows[1]!.amount).toBeCloseTo(25.58, 1);
  });

  it('starts from the other form: Tris-HCl to pH 8.0 needs NaOH (0.4655 equivalents, 23.28 mL per 50 mmol)', () => {
    const r = solveMixture([design({ name: 'Tris', systemId: 'tris', formId: 'tris-hcl', pH: 8 })], off);
    expect(r.rows[0]).toMatchObject({ name: 'Tris-HCl', unit: 'g' });
    expect(r.rows[0]!.amount).toBeCloseTo(7.88, 2);
    expect(r.rows[1]!.name).toMatch(/^NaOH 1 M/);
    expect(r.rows[1]!.amount).toBeCloseTo(23.28, 1);
  });
});

describe('design buffers: mix forms', () => {
  it('100 mM phosphate pH 7.0 with the ionic correction is 61 % Na2HPO4, as in the standard table', () => {
    const r = solveMixture([design({ name: 'Pi', systemId: 'phosphate', formId: 'nah2po4', formId2: 'na2hpo4', method: 'mix-forms', pH: 7, target: { value: 100, unit: 'mM' } })], base);
    expect(r.rows.map(x => x.name)).toEqual(['NaH₂PO₄ (anhydrous)', 'Na₂HPO₄ (anhydrous)']);
    expect(r.rows[0]!.amount).toBeCloseTo(4.714, 2);
    expect(r.rows[1]!.amount).toBeCloseTo(8.619, 2);
    expect(r.ionicStrength).toBeCloseTo(0.2214, 3);
  });

  it('without the correction the same target is 38.7 % Na2HPO4', () => {
    const r = solveMixture([design({ name: 'Pi', systemId: 'phosphate', formId: 'nah2po4', formId2: 'na2hpo4', method: 'mix-forms', pH: 7, target: { value: 100, unit: 'mM' } })], off);
    expect(r.rows[0]!.amount).toBeCloseTo(7.356, 1);
    expect(r.rows[1]!.amount).toBeCloseTo(5.492, 1);
  });

  it('accepts the two forms in either order', () => {
    const a = solveMixture([design({ name: 'Pi', systemId: 'phosphate', formId: 'na2hpo4', formId2: 'nah2po4', method: 'mix-forms', pH: 7 })], off);
    const b = solveMixture([design({ name: 'Pi', systemId: 'phosphate', formId: 'nah2po4', formId2: 'na2hpo4', method: 'mix-forms', pH: 7 })], off);
    expect(a.rows.map(r => r.amount)).toEqual(b.rows.map(r => r.amount));
  });

  it('refuses a pH outside the range of the two forms and points to titration', () => {
    const bad = design({ name: 'Pi', systemId: 'phosphate', formId: 'nah2po4', formId2: 'na2hpo4', method: 'mix-forms', pH: 11 });
    expect(() => solveMixture([bad], base)).toThrow(BufferRecipeError);
    expect(() => solveMixture([bad], base)).toThrow(/titrate/);
  });

  it('refuses two forms with the same protonation', () => {
    const bad = design({ name: 'Pi', systemId: 'phosphate', formId: 'nah2po4', formId2: 'nah2po4-h2o', method: 'mix-forms', pH: 7 });
    expect(() => solveMixture([bad], base)).toThrow(/no protons/);
  });
});

describe('pH at the working temperature', () => {
  it('Tris adjusted to pH 8.0 at 25 °C reads 8.588 at 4 °C and warns by 0.588', () => {
    const r = solveMixture([design({ name: 'Tris', systemId: 'tris', formId: 'tris-base', pH: 8 })], { ...off, workingTemp_C: 4 });
    expect(r.buffers[0]!.pHWorking).toBeCloseTo(8.588, 3);
    expect(r.buffers[0]!.drift).toBeCloseTo(0.588, 3);
  });

  it('adjusting at the working temperature gives no drift and needs more HCl (0.842 equivalents at 4 °C)', () => {
    const r = solveMixture([design({ name: 'Tris', systemId: 'tris', formId: 'tris-base', pH: 8, pHTemp_C: 4 })], { ...base, workingTemp_C: 4 });
    expect(r.buffers[0]!.drift).toBeCloseTo(0, 6);
    expect(r.buffers[0]!.titrantEquiv).toBeCloseTo(-0.8418, 3);
  });

  it('copes with temperature extremes (0 °C and 37 °C) for a polyprotic buffer', () => {
    for (const t of [0, 37]) {
      const r = solveMixture([design({ name: 'Pi', systemId: 'phosphate', formId: 'nah2po4', pH: 7.4 })], { ...base, workingTemp_C: t });
      expect(Number.isFinite(r.buffers[0]!.pHWorking)).toBe(true);
      expect(Math.abs(r.buffers[0]!.drift)).toBeLessThan(0.3);
    }
  });
});

describe('premade pH-adjusted stocks', () => {
  it('HEPES 1 M pH 8.0 → 50 mM is a plain 50 mL dilution and reads 8.294 at 4 °C without the ionic correction', () => {
    const r = solveMixture([premade({ name: 'HEPES', systemId: 'hepes' })], { ...off, workingTemp_C: 4 });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ name: 'HEPES (1 M, pH 8)', unit: 'mL', role: 'component' });
    expect(r.rows[0]!.amount).toBeCloseTo(50, 10);
    expect(r.buffers[0]!.pHWorking).toBeCloseTo(8.294, 3);
  });

  it('warns that a 1 M stock is beyond the Davies range', () => {
    const r = solveMixture([premade({ name: 'HEPES', systemId: 'hepes' })], base);
    expect(r.warnings.some(w => /stock/.test(w) && /Davies/.test(w))).toBe(true);
  });

  it('rejects a target above the stock concentration', () => {
    expect(() => solveMixture([premade({ name: 'HEPES', systemId: 'hepes', target: { value: 2, unit: 'M' } })], base)).toThrow(/above the stock/);
  });

  it('accepts a stock given in mM', () => {
    const r = solveMixture([premade({ name: 'Tris', systemId: 'tris', stockConc: 500, stockUnit: 'mM', target: { value: 50, unit: 'mM' } })], base);
    expect(r.rows[0]!.amount).toBeCloseTo(100, 10);
  });
});

describe('warnings and refusals', () => {
  it('flags a pH more than 1.5 units from every pKa as barely buffering', () => {
    const r = solveMixture([design({ name: 'Tris', systemId: 'tris', formId: 'tris-base', pH: 3 })], base);
    expect(r.buffers[0]!.outOfRange).toBe(true);
    expect(r.warnings.some(w => /barely buffers/.test(w))).toBe(true);
    expect(solveMixture([design({ name: 'Tris', systemId: 'tris', formId: 'tris-base', pH: 8 })], base).buffers[0]!.outOfRange).toBe(false);
  });

  it('warns about ionic strength above 0.5 M and temperatures outside 0–50 °C, only when the correction is on', () => {
    const salty: MixtureComponent = { kind: 'solid', name: 'Sodium Chloride (NaCl)', mw: 58.44, target: { value: 800, unit: 'mM' } };
    const tris = design({ name: 'Tris', systemId: 'tris', formId: 'tris-base', pH: 8 });
    expect(solveMixture([tris, salty], base).warnings.some(w => /0\.5 M/.test(w))).toBe(true);
    expect(solveMixture([tris, salty], off).warnings).toEqual([]);
    expect(solveMixture([tris], { ...base, workingTemp_C: 60 }).warnings.some(w => /0–50 °C/.test(w))).toBe(true);
  });

  it('turns every bad input into a BufferRecipeError instead of a raw crash', () => {
    const t = (o: Partial<DesignBuffer>) => () => solveMixture([design({ name: 'T', systemId: 'tris', formId: 'tris-base', pH: 8, ...o })], base);
    expect(t({ pH: NaN })).toThrow(BufferRecipeError);
    expect(t({ pHTemp_C: NaN })).toThrow(BufferRecipeError);
    expect(t({ target: { value: 0, unit: 'mM' } })).toThrow(BufferRecipeError);
    expect(t({ target: { value: NaN, unit: 'mM' } })).toThrow(BufferRecipeError);
    expect(t({ target: { value: 5, unit: '%' as 'mM' } })).toThrow(/M or mM/);
    expect(t({ titrantConc_M: 0 })).toThrow(/Titrant/);
    expect(t({ systemId: 'nope' })).toThrow(/unknown buffer system/);
    expect(t({ formId: 'nope' })).toThrow(/starting form/);
    expect(() => solveMixture([premade({ name: 'T', systemId: 'tris', stockPH: NaN })], base)).toThrow(BufferRecipeError);
    expect(() => solveMixture([premade({ name: 'T', systemId: 'tris', stockConc: -1 })], base)).toThrow(BufferRecipeError);
    expect(() => solveMixture([], { ...base, finalVolume_L: 0 })).toThrow(BufferRecipeError);
    expect(() => solveMixture([], { ...base, workingTemp_C: NaN })).toThrow(BufferRecipeError);
  });

  it('solves several buffer rows together through one shared ionic strength', () => {
    const r = solveMixture([
      design({ name: 'Tris', systemId: 'tris', formId: 'tris-base', pH: 8 }),
      design({ name: 'HEPES', systemId: 'hepes', formId: 'hepes-acid', pH: 7.5 }),
    ], base);
    expect(r.buffers.map(b => b.componentIndex)).toEqual([0, 1]);
    expect(r.buffers.map(b => b.name)).toEqual(['Tris', 'HEPES']);
    expect(r.ionicStrength).toBeCloseTo(0.0574, 3);
  });
});
