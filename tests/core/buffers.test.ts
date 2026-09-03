import { describe, expect, it } from 'vitest';
import presetsJson from '@/data/buffer-presets.json';
import { BUFFER_PKA, pKaAtTemperature, ratioBaseAcid } from '@/core/buffers/henderson';
import { BufferRecipeError, solveRecipe, type RecipeComponent } from '@/core/buffers/recipe';

describe('buffer recipes', () => {
  it('computes solids from molarity and final volume', () => {
    const [tris] = solveRecipe([
      { name: 'Tris-base', kind: 'solid', mw: 121.14, target: { value: 10, unit: 'mM' } },
    ], 0.5);
    expect(tris?.amount).toBeCloseTo(0.6057, 4);
    expect(tris?.unit).toBe('g');
  });

  it('uses C1V1=C2V2 for molar and fold stocks', () => {
    const rows = solveRecipe([
      { name: 'Tris stock', kind: 'stock', stockConc: 1, stockUnit: 'M', target: { value: 50, unit: 'mM' } },
      { name: 'Buffer stock', kind: 'stock', stockConc: 10, stockUnit: 'x', target: { value: 1, unit: 'x' } },
    ], 0.1);
    expect(rows[0]?.amount).toBeCloseTo(5, 10);
    expect(rows[0]?.unit).toBe('mL');
    expect(rows[1]?.amount).toBeCloseTo(10, 10);
  });

  it('treats a solid percentage as w/v and can report stock-liquid mass from density', () => {
    const rows = solveRecipe([
      { name: 'Tryptone', kind: 'solid', target: { value: 10, unit: '%' } },
      { name: 'Glycerol', kind: 'stock', stockConc: 100, stockUnit: '%', target: { value: 10, unit: '%' }, density: 1.26 },
    ], 0.5);
    expect(rows[0]).toMatchObject({ amount: 50, unit: 'g' });
    expect(rows[1]).toMatchObject({ amount: 50, unit: 'mL', mass_g: 63 });
  });

  it('does not add waters twice when the selected MW is already a hydrate', () => {
    const [row] = solveRecipe([
      { name: 'Magnesium Chloride (MgCl2) hexahydrate', kind: 'solid', mw: 203.3, waters: 6, target: { value: 10, unit: 'mM' } },
    ], 1);
    expect(row?.amount).toBeCloseTo(2.033, 6);
  });

  it('throws a typed error for incompatible stock and target units', () => {
    const invalid: RecipeComponent[] = [
      { name: '10x buffer', kind: 'stock', stockConc: 10, stockUnit: 'x', target: { value: 10, unit: 'mM' } },
    ];
    expect(() => solveRecipe(invalid, 1)).toThrow(BufferRecipeError);
    expect(() => solveRecipe(invalid, 1)).toThrow(/unit/i);
  });

  it('resolves the audited TAE preset to 1.14 mL glacial acetic acid per litre', () => {
    const preset = presetsJson.presets.find(p => p.id === 'TAE_1x');
    expect(preset).toBeDefined();
    const rows = solveRecipe(preset!.components as RecipeComponent[], preset!.finalVolume_L);
    expect(rows.find(r => r.name.includes('Acetic'))?.amount).toBeCloseTo(1.14, 6);
  });
});

describe('Henderson-Hasselbalch helper', () => {
  it('computes the base-to-acid ratio', () => {
    expect(ratioBaseAcid(8.06, 8.06)).toBeCloseTo(1, 12);
    expect(ratioBaseAcid(9.06, 8.06)).toBeCloseTo(10, 12);
  });

  it('corrects pKa linearly for temperature', () => {
    expect(pKaAtTemperature(8.06, -0.028, 4)).toBeCloseTo(8.648, 10);
  });

  it('pins the sourced common-buffer pKa table', () => {
    expect(BUFFER_PKA).toEqual([
      { id: 'tris', name: 'Tris', pKa25: 8.06, dpKadT: -0.028 },
      { id: 'hepes', name: 'HEPES', pKa25: 7.48, dpKadT: -0.014 },
      { id: 'mes', name: 'MES', pKa25: 6.1, dpKadT: -0.011 },
      { id: 'mops', name: 'MOPS', pKa25: 7.14, dpKadT: -0.015 },
      { id: 'pipes', name: 'PIPES', pKa25: 6.76, dpKadT: -0.0085 },
      { id: 'phosphate', name: 'Phosphate (pKa2)', pKa25: 7.2, dpKadT: -0.0028 },
    ]);
  });
});
