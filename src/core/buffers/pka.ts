export interface AcidStep { pKa25: number; dpKadT: number; temperatureData: boolean }
export interface BufferForm { id: string; label: string; protonsRemoved: number; mw: number }
export interface BufferSystem {
  id: string; name: string;
  /** Net charge of the acid species of the first modelled step (the species with 0 protons removed). */
  z0: number;
  steps: AcidStep[];
  forms: BufferForm[];
  source: string;
}

const step = (pKa25: number, dpKadT?: number): AcidStep => ({ pKa25, dpKadT: dpKadT ?? 0, temperatureData: dpKadT !== undefined });
const GOOD = 'Good et al. 1966, Biochemistry 5:467 (pKa); Ferguson et al. 1980, Anal. Biochem. 104:300 (dpKa/dT)';
const SUPPLIER = 'Supplier buffer reference tables (Sigma-Aldrich, Calbiochem); Dawson et al., Data for Biochemical Research';

export const BUFFER_SYSTEMS: BufferSystem[] = [
  { id: 'tris', name: 'Tris', z0: 1, steps: [step(8.06, -0.028)], source: GOOD, forms: [
    { id: 'tris-hcl', label: 'Tris-HCl', protonsRemoved: 0, mw: 157.6 },
    { id: 'tris-base', label: 'Tris base', protonsRemoved: 1, mw: 121.14 },
  ] },
  { id: 'hepes', name: 'HEPES', z0: 0, steps: [step(7.48, -0.014)], source: GOOD, forms: [
    { id: 'hepes-acid', label: 'HEPES free acid', protonsRemoved: 0, mw: 238.3 },
    { id: 'hepes-na', label: 'HEPES sodium salt', protonsRemoved: 1, mw: 260.29 },
  ] },
  { id: 'mes', name: 'MES', z0: 0, steps: [step(6.1, -0.011)], source: GOOD, forms: [
    { id: 'mes-acid', label: 'MES free acid (anhydrous)', protonsRemoved: 0, mw: 195.24 },
    { id: 'mes-hydrate', label: 'MES monohydrate', protonsRemoved: 0, mw: 213.25 },
    { id: 'mes-na', label: 'MES sodium salt', protonsRemoved: 1, mw: 217.22 },
  ] },
  { id: 'mops', name: 'MOPS', z0: 0, steps: [step(7.14, -0.015)], source: GOOD, forms: [
    { id: 'mops-acid', label: 'MOPS free acid', protonsRemoved: 0, mw: 209.26 },
    { id: 'mops-na', label: 'MOPS sodium salt', protonsRemoved: 1, mw: 231.25 },
  ] },
  { id: 'pipes', name: 'PIPES', z0: 0, steps: [step(2.67), step(6.76, -0.0085)], source: GOOD, forms: [
    { id: 'pipes-acid', label: 'PIPES free acid', protonsRemoved: 0, mw: 302.37 },
    { id: 'pipes-na2', label: 'PIPES disodium salt', protonsRemoved: 2, mw: 346.33 },
  ] },
  { id: 'bicine', name: 'Bicine', z0: 0, steps: [step(8.26, -0.018)], source: GOOD, forms: [
    { id: 'bicine-acid', label: 'Bicine', protonsRemoved: 0, mw: 163.17 },
    { id: 'bicine-na', label: 'Bicine sodium salt', protonsRemoved: 1, mw: 185.15 },
  ] },
  { id: 'tricine', name: 'Tricine', z0: 0, steps: [step(8.05, -0.021)], source: GOOD, forms: [
    { id: 'tricine-acid', label: 'Tricine', protonsRemoved: 0, mw: 179.17 },
    { id: 'tricine-na', label: 'Tricine sodium salt', protonsRemoved: 1, mw: 201.15 },
  ] },
  { id: 'ches', name: 'CHES', z0: 0, steps: [step(9.3, -0.011)], source: SUPPLIER, forms: [
    { id: 'ches-acid', label: 'CHES free acid', protonsRemoved: 0, mw: 207.29 },
  ] },
  { id: 'caps', name: 'CAPS', z0: 0, steps: [step(10.4)], source: SUPPLIER, forms: [
    { id: 'caps-acid', label: 'CAPS free acid', protonsRemoved: 0, mw: 221.32 },
  ] },
  { id: 'imidazole', name: 'Imidazole', z0: 1, steps: [step(6.95, -0.02)], source: SUPPLIER, forms: [
    { id: 'imidazole-hcl', label: 'Imidazole-HCl', protonsRemoved: 0, mw: 104.54 },
    { id: 'imidazole-base', label: 'Imidazole', protonsRemoved: 1, mw: 68.08 },
  ] },
  { id: 'acetate', name: 'Acetate', z0: 0, steps: [step(4.76)], source: SUPPLIER, forms: [
    { id: 'acetic-acid', label: 'Acetic acid (glacial)', protonsRemoved: 0, mw: 60.05 },
    { id: 'na-acetate', label: 'Sodium acetate (anhydrous)', protonsRemoved: 1, mw: 82.03 },
    { id: 'na-acetate-3h2o', label: 'Sodium acetate trihydrate', protonsRemoved: 1, mw: 136.08 },
  ] },
  { id: 'citrate', name: 'Citrate', z0: 0, steps: [step(3.13), step(4.76), step(6.4)], source: SUPPLIER, forms: [
    { id: 'citric-acid', label: 'Citric acid (anhydrous)', protonsRemoved: 0, mw: 192.12 },
    { id: 'citric-acid-h2o', label: 'Citric acid monohydrate', protonsRemoved: 0, mw: 210.14 },
    { id: 'na3-citrate-2h2o', label: 'Trisodium citrate dihydrate', protonsRemoved: 3, mw: 294.1 },
  ] },
  { id: 'phosphate', name: 'Phosphate', z0: 0, steps: [step(2.15), step(7.2, -0.0028), step(12.35)], source: SUPPLIER, forms: [
    { id: 'nah2po4', label: 'NaH₂PO₄ (anhydrous)', protonsRemoved: 1, mw: 119.98 },
    { id: 'nah2po4-h2o', label: 'NaH₂PO₄ monohydrate', protonsRemoved: 1, mw: 137.99 },
    { id: 'na2hpo4', label: 'Na₂HPO₄ (anhydrous)', protonsRemoved: 2, mw: 141.96 },
    { id: 'na2hpo4-7h2o', label: 'Na₂HPO₄ heptahydrate', protonsRemoved: 2, mw: 268.07 },
  ] },
];

export const findSystem = (id: string): BufferSystem | undefined => BUFFER_SYSTEMS.find(s => s.id === id);

export function getSystem(id: string): BufferSystem {
  const system = findSystem(id);
  if (!system) throw new RangeError(`Unknown buffer system: ${id}`);
  return system;
}

/** Chemical-library names (src/data/chemicals.json) that are a weighable form of a buffer system. */
const FORM_HINTS: [RegExp, string][] = [
  [/^tris-base$/i, 'tris-base'], [/^tris-hcl$/i, 'tris-hcl'],
  [/^hepes \(free acid\)$/i, 'hepes-acid'], [/^hepes sodium salt$/i, 'hepes-na'],
  [/^mes \(anhydrous\)$/i, 'mes-acid'], [/^mes \(monohydrate\)$/i, 'mes-hydrate'], [/^mes sodium salt$/i, 'mes-na'],
  [/^mops \(free acid\)$/i, 'mops-acid'], [/^mops sodium salt$/i, 'mops-na'],
  [/^pipes \(free acid\)$/i, 'pipes-acid'], [/^pipes disodium salt$/i, 'pipes-na2'],
  [/^bicine$/i, 'bicine-acid'], [/^tricine$/i, 'tricine-acid'], [/^caps$/i, 'caps-acid'], [/^imidazole$/i, 'imidazole-base'],
  [/^acetic acid \(glacial\)$/i, 'acetic-acid'],
  [/^sodium acetate \(anhydrous\)$/i, 'na-acetate'], [/^sodium acetate \(trihydrate\)$/i, 'na-acetate-3h2o'],
  [/^citric acid \(anhydrous\)$/i, 'citric-acid'], [/^citric acid \(monohydrate\)$/i, 'citric-acid-h2o'], [/^sodium citrate \(dihydrate\)$/i, 'na3-citrate-2h2o'],
  [/^sodium phosphate monobasic \(nah2po4\) anhydrous$/i, 'nah2po4'], [/^sodium phosphate monobasic \(nah2po4\) monohydrate$/i, 'nah2po4-h2o'],
  [/^sodium phosphate dibasic \(na2hpo4\) anhydrous$/i, 'na2hpo4'], [/^sodium phosphate dibasic \(na2hpo4\) heptahydrate$/i, 'na2hpo4-7h2o'],
];

/** The buffer system and form that a chemical-library name refers to, if any. */
export function matchForm(name: string): { system: BufferSystem; form: BufferForm } | undefined {
  const id = FORM_HINTS.find(([test]) => test.test(name.trim()))?.[1];
  if (!id) return undefined;
  for (const system of BUFFER_SYSTEMS) {
    const form = system.forms.find(f => f.id === id);
    if (form) return { system, form };
  }
  return undefined;
}
