import { describe, expect, it } from 'vitest';
import chemicalsJson from '@/data/chemicals.json';
import { BUFFER_PKA } from '@/core/buffers/henderson';
import { BUFFER_SYSTEMS, findSystem, getSystem, matchForm } from '@/core/buffers/pka';

const CHEMICALS = chemicalsJson.chemicals as { name: string; mw: number }[];

describe('buffer system table', () => {
  it('lists the 13 systems with unique ids, sources and weighable forms', () => {
    expect(BUFFER_SYSTEMS.map(s => s.id)).toEqual([
      'tris', 'hepes', 'mes', 'mops', 'pipes', 'bicine', 'tricine', 'ches', 'caps', 'imidazole', 'acetate', 'citrate', 'phosphate',
    ]);
    for (const system of BUFFER_SYSTEMS) {
      expect(system.source.length).toBeGreaterThan(10);
      expect(system.steps.length).toBeGreaterThan(0);
      expect(system.forms.length).toBeGreaterThan(0);
      for (const form of system.forms) {
        expect(form.mw).toBeGreaterThan(0);
        expect(form.protonsRemoved).toBeGreaterThanOrEqual(0);
        expect(form.protonsRemoved).toBeLessThanOrEqual(system.steps.length);
      }
      expect(new Set(system.forms.map(f => f.id)).size).toBe(system.forms.length);
    }
  });

  it('agrees with the pinned monoprotic table in henderson.ts', () => {
    const stepIndex: Record<string, number> = { pipes: 1, phosphate: 1 };
    for (const old of BUFFER_PKA) {
      const step = getSystem(old.id).steps[stepIndex[old.id] ?? 0]!;
      expect(step.pKa25).toBe(old.pKa25);
      expect(step.dpKadT).toBe(old.dpKadT);
    }
  });

  it('flags steps without a published temperature coefficient instead of inventing one', () => {
    expect(getSystem('tris').steps[0]!.temperatureData).toBe(true);
    expect(getSystem('acetate').steps[0]!.temperatureData).toBe(false);
    expect(getSystem('acetate').steps[0]!.dpKadT).toBe(0);
    expect(getSystem('phosphate').steps.map(s => s.temperatureData)).toEqual([false, true, false]);
  });

  it('returns undefined for unknown ids from findSystem and throws from getSystem', () => {
    expect(findSystem('nope')).toBeUndefined();
    expect(() => getSystem('nope')).toThrow(RangeError);
  });
});

describe('matchForm', () => {
  it('maps chemical-library names to a system and form, and rejects non-buffers', () => {
    expect(matchForm('Tris-base')).toMatchObject({ system: { id: 'tris' }, form: { id: 'tris-base' } });
    expect(matchForm('HEPES (Free Acid)')?.system.id).toBe('hepes');
    expect(matchForm('Sodium Chloride (NaCl)')).toBeUndefined();
    expect(matchForm('')).toBeUndefined();
  });

  it('matches 25 library entries and every matched molecular weight agrees with chemicals.json to 0.1 g/mol', () => {
    const matched = CHEMICALS.map(c => ({ c, m: matchForm(c.name) })).filter(x => x.m);
    expect(matched).toHaveLength(25);
    for (const { c, m } of matched) expect(Math.abs(c.mw - m!.form.mw), c.name).toBeLessThan(0.1);
  });
});
