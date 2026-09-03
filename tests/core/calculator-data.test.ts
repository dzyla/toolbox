import { describe, expect, it } from 'vitest';
import chemicalJson from '@/data/chemicals.json';

describe('chemical table', () => {
  it('contains unique, positive molecular-weight records', () => {
    const names = chemicalJson.chemicals.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(chemicalJson.chemicals.every(c => c.mw > 0)).toBe(true);
  });

  it('pins audited supplier molecular weights', () => {
    const mw = (name: string) => chemicalJson.chemicals.find(c => c.name === name)?.mw;
    expect(mw('Tris-base')).toBe(121.14);
    expect(mw('HEPES (Free Acid)')).toBe(238.3);
    expect(mw('Magnesium Chloride (MgCl2) hexahydrate')).toBe(203.3);
    expect(mw('EDTA (disodium, dihydrate)')).toBe(372.24);
    expect(mw('E-64')).toBe(357.41);
    expect(mw('dTTP (Disodium)')).toBe(526.13);
  });

  it('groups hydrate and anhydrous variants explicitly', () => {
    const variants = chemicalJson.chemicals.filter(c => /(?:mono|di|tri|tetra|penta|hexa|hepta|dodeca)hydrate|anhydrous/i.test(c.name));
    expect(variants.length).toBeGreaterThan(10);
    for (const chemical of variants) {
      expect(chemical.hydrateOf).toBeTruthy();
      expect(Number.isInteger(chemical.waters)).toBe(true);
    }
    expect(chemicalJson.chemicals.find(c => c.name.includes('MgCl2) hexahydrate'))?.waters).toBe(6);
  });

  it('keeps the audit removals and rename', () => {
    const names = chemicalJson.chemicals.map(c => c.name);
    expect(names).not.toContain('Agarose');
    expect(names).not.toContain('Glycogen');
    expect(names).not.toContain('EDTA 0.5 M soln');
    expect(names).not.toContain('L-Glutamate');
    expect(names).toContain('L-Glutamic acid');
  });
});
