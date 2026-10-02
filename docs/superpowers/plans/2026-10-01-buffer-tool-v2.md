# Buffer Tool v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Buffer & Media tool as a recipe-first mixture where any row can be a buffer with a pH layer (premade pH'd stock, or designed to a target pH), with a pH-at-working-temperature and ionic-strength check and a cleaner single-column UI.

**Architecture:** New pure calculation core in `src/core/buffers/` (`pka.ts` table, `speciation.ts` acid–base and Davies maths, `mixture.ts` solver that wraps the existing `solveRecipe`), consumed by a split-up `src/tools/buffers/` view (`state.ts`, `BuffersModel.tsx`, `components/*`). `henderson.ts` and `recipe.ts` stay unchanged so existing tests and saved data keep working.

**Tech Stack:** Preact + signals, TypeScript, Tailwind v4, vitest + @testing-library/preact, Playwright (+ axe).

**Spec:** `docs/superpowers/specs/2026-10-01-buffer-tool-v2-design.md`

## Global Constraints

- Core code in `src/core/**` may not import from `app`, `tools`, `lib`, `preact` or use `window`/`document`/`fetch` etc. (eslint-enforced).
- Ionic-strength correction is the Davies equation, valid to I ≤ 0.5 M and 0–50 °C; outside that the UI warns and says the prediction is approximate.
- A pH drift of more than 0.1 pH between the pH the user set and the predicted pH at the working temperature triggers the warning.
- 13 buffer systems: Tris, HEPES, MES, MOPS, PIPES, Bicine, Tricine, CHES, CAPS, imidazole, acetate, citrate, phosphate. Every pKa and dpKa/dT carries a source; a step without a published dpKa/dT is flagged `temperatureData: false` and not temperature-corrected.
- Titrant volumes are estimates; the UI says to finish with a pH meter.
- Saved buffers keep their stored shape (`bb.library.buffers`, version 1, additive change only); old saved recipes, presets and share links (solid/stock components, old `pH`/`temperature`/`bufferId` state keys) must still load.
- Existing accessible names must survive: `Chemical search`, `Molecular weight`, `Additional waters`, `Recipe preset`, `Stock Conc`, `Stock Unit`, `Density (g/mL, opt)`, buttons `Solid` / `Stock` / `Contribute`, `Copy JSON`, `Close modal` title, test id `buffer-results`.
- Mobile: no horizontal overflow at 390 px. The axe (light + dark) and mobile e2e suites must pass.
- Out of scope for v1: buffer-capacity plots, multi-buffer pH optimisation, activity coefficients beyond Davies, converting presets to buffer rows (presets carry no pH, so the new "Set pH…" button on a matching row is the route instead).
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Input classes the spec implies but a happy-path test would miss. Each has a test in the task named in brackets.

1. **Cleared or half-typed numeric fields** (pH, concentration, temperature become `NaN`) must show an error message, never throw or blank the page. [Task 3 core errors; Task 6 UI test]
2. **A requested pH far from every pKa** (e.g. Tris at pH 3) is not a buffer: warn that it barely buffers and the working-temperature prediction is unreliable. [Task 3]
3. **High ionic strength** (1 M premade stock, > 0.5 M mixture) and **temperature outside 0–50 °C** must warn rather than claim precision. [Task 3]
4. **Mix-forms with a pH outside the two forms' range** (phosphate pH 11 from NaH₂PO₄ + Na₂HPO₄) gives a clear "use the titrate method" error, not negative grams. [Task 3]
5. **Old data**: share links with the removed `pH`/`temperature`/`bufferId` keys, saved buffers and presets with only solid/stock rows, and rows that expand into several sheet lines (buffer + titrant) with duplicate names must keep working and keep unique checkbox state. [Task 4 and Task 5]

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/buffers/pka.ts` (new) | 13-system table: steps, pKa, dpKa/dT, forms (weighable salts with MW), sources; `matchForm` name hints |
| `src/core/buffers/speciation.ts` (new) | Davies activity, effective pKa′, species fractions, charge, pH solver, buffer ionic strength |
| `src/core/buffers/mixture.ts` (new) | `solveMixture`: solid/stock via `solveRecipe`, buffer rows (premade / titrate / mix-forms), global ionic-strength iteration, pH at working temperature, warnings |
| `src/core/buffers/henderson.ts`, `recipe.ts` | unchanged |
| `src/tools/buffers/state.ts` (new) | Editor types, defaults, editor ↔ mixture conversion, library validator |
| `src/tools/buffers/recipe-text.ts` (new) | `displayAmount`, copy text, CSV rows |
| `src/tools/buffers/BuffersModel.tsx` (new) | `useBuffersModel` hook: state, calculation memo, handlers, library |
| `src/tools/buffers/components/ui.tsx` (new) | shared classes, `Segmented`, `NumberField` |
| `src/tools/buffers/components/ComponentRow.tsx` (new) | one component card (Solid / Stock / Buffer) |
| `src/tools/buffers/components/BufferFields.tsx` (new) | buffer-row fields + `PhCheck` |
| `src/tools/buffers/components/PhCheck.tsx` (new) | the pH-at-temperature line |
| `src/tools/buffers/components/RecipeSheet.tsx` (new) | weigh-out sheet, steps, warnings |
| `src/tools/buffers/components/PresetBar.tsx`, `ContributeModal.tsx` (new) | moved verbatim from the old `View.tsx` |
| `src/tools/buffers/View.tsx` | thin composition |
| `src/tools/buffers/science.ts`, `src/tools/assurance.ts` | formulas, assumptions, references, assurance text |

Test files: `tests/core/buffer-pka.test.ts`, `buffer-speciation.test.ts`, `buffer-mixture.test.ts`; `tests/app/buffers-state.test.ts`, `buffers-v2.test.tsx`; `tests/e2e/buffers.spec.ts`. Existing `tests/core/buffers.test.ts`, `tests/app/buffers-modal.test.tsx`, `tests/app/calculators.test.tsx` must keep passing unchanged until Task 6 (Task 6 may adjust only what its step says).

Run unit tests with `npx vitest run <file>`; full gate: `npm run typecheck && npm run lint && npm run test:unit && npm run build`. If `node_modules` is missing run `npm ci` first. For `<select>` change events in app tests import `fireEvent` from `@testing-library/dom` (the preact/compat helper remaps select `change` to `input`); inputs and clicks work with either.

---

### Task 1: Buffer system table (`pka.ts`)

**Files:**
- Create: `src/core/buffers/pka.ts`
- Test: `tests/core/buffer-pka.test.ts`

**Interfaces:**
- Produces: `AcidStep { pKa25; dpKadT; temperatureData }`, `BufferForm { id; label; protonsRemoved; mw }`, `BufferSystem { id; name; z0; steps; forms; source }`, `BUFFER_SYSTEMS`, `findSystem(id): BufferSystem | undefined`, `getSystem(id): BufferSystem` (throws `RangeError`), `matchForm(name): { system; form } | undefined`.
- Convention: species index `k` = number of protons removed from the fully modelled acid; the charge of species `k` is `z0 − k`; `forms[].protonsRemoved` is `k` for the compound you weigh.

- [ ] **Step 1: Write the failing test**

Create `tests/core/buffer-pka.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/buffer-pka.test.ts`
Expected: FAIL (module `@/core/buffers/pka` not found).

- [ ] **Step 3: Write the implementation**

Create `src/core/buffers/pka.ts` with exactly this content. The values were prototyped against hand calculations; the source strings name where each value family comes from.

```ts
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
```

- [ ] **Step 4: Verify the sourced values before committing**

Open the cited sources (Good et al. 1966, doi:10.1021/bi00866a011; Ferguson et al. 1980, Anal. Biochem. 104:300; supplier reference tables) and check every `step(pKa25, dpKadT)` in the file. If a value cannot be confirmed from a source, correct it, or drop its `dpKadT` argument so it is flagged `temperatureData: false`. Update the test expectation in `flags steps without a published temperature coefficient…` if you change which steps carry data. Record each correction in the commit message.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/buffer-pka.test.ts tests/core/buffers.test.ts`
Expected: PASS (both files).

- [ ] **Step 6: Commit**

```bash
git add src/core/buffers/pka.ts tests/core/buffer-pka.test.ts
git commit -m "feat(buffers): 13-system pKa table with weighable forms and name hints

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Speciation and ionic-strength maths (`speciation.ts`)

**Files:**
- Create: `src/core/buffers/speciation.ts`
- Test: `tests/core/buffer-speciation.test.ts`

**Interfaces:**
- Consumes: `BufferSystem` from `./pka`.
- Produces: `daviesA(temp_C)`, `daviesF(I)`, `pKaIonicShift(zAcid, I, temp_C)`, `effectivePKas(system, temp_C, I, correctIonic): number[]`, `fractions(pH, pKas): number[]` (index = protons removed), `meanProtonsRemoved(fr)`, `meanCharge(system, fr)`, `solvePHForCharge(system, targetQ, pKas)` (throws `RangeError` if unreachable), `bufferIonicStrength(system, totalConc_M, fr)`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/buffer-speciation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getSystem } from '@/core/buffers/pka';
import {
  bufferIonicStrength, daviesA, daviesF, effectivePKas, fractions, meanCharge, meanProtonsRemoved, pKaIonicShift, solvePHForCharge,
} from '@/core/buffers/speciation';

const tris = getSystem('tris');
const phosphate = getSystem('phosphate');

describe('Davies activity model', () => {
  it('reproduces A and f(I) at 25 °C and 0.15 M', () => {
    expect(daviesA(25)).toBeCloseTo(0.5114, 4);
    expect(daviesF(0.15)).toBeCloseTo(0.2342, 4);
    expect(daviesF(0)).toBe(0);
  });

  it('rejects negative ionic strength', () => {
    expect(() => daviesF(-0.1)).toThrow(RangeError);
  });

  it('shifts pKa by (2z − 1)·A·f(I): cationic acids up, neutral acids down, anionic acids down more', () => {
    expect(pKaIonicShift(1, 0.15, 25)).toBeCloseTo(0.1198, 3);
    expect(pKaIonicShift(0, 0.15, 25)).toBeCloseTo(-0.1198, 3);
    expect(pKaIonicShift(-1, 0.15, 25)).toBeCloseTo(-0.3593, 3);
  });
});

describe('effective pKa', () => {
  it('applies the linear temperature coefficient (Tris 8.06 → 8.648 at 4 °C)', () => {
    expect(effectivePKas(tris, 4, 0, false)[0]).toBeCloseTo(8.648, 10);
  });

  it('adds the ionic correction per step using each step\'s acid charge (phosphate at 0.15 M)', () => {
    const [p1, p2, p3] = effectivePKas(phosphate, 25, 0.15, true);
    expect(p1).toBeCloseTo(2.15 - 0.1198, 3);
    expect(p2).toBeCloseTo(7.2 - 0.3593, 3);
    expect(p3).toBeCloseTo(12.35 - 0.5988, 3);
  });
});

describe('species fractions and charge', () => {
  it('sums to 1 and is 50:50 at pH = pKa', () => {
    expect(fractions(8.06, [8.06])).toEqual([0.5, 0.5]);
    const fr = fractions(5, [2.15, 7.2, 12.35]);
    expect(fr.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('puts phosphate at pH 7.4 at 61.3 % HPO4²⁻ (2 protons removed)', () => {
    const fr = fractions(7.4, [2.15, 7.2, 12.35]);
    expect(fr[2]).toBeCloseTo(0.613, 3);
    expect(fr[1]).toBeCloseTo(0.387, 3);
  });

  it('does not overflow far from every pKa', () => {
    const fr = fractions(40, [2.15, 7.2, 12.35]);
    expect(fr[3]).toBeCloseTo(1, 12);
    expect(fractions(-30, [8.06])[0]).toBeCloseTo(1, 12);
  });

  it('computes mean protons removed and net charge', () => {
    const fr = fractions(8.0, [8.06]);
    expect(fr[1]).toBeCloseTo(0.4655, 4);
    expect(meanProtonsRemoved(fr)).toBeCloseTo(0.4655, 4);
    expect(meanCharge(tris, fr)).toBeCloseTo(1 - 0.4655, 4);
  });
});

describe('pH solver', () => {
  it('inverts charge back to pH', () => {
    const kas = effectivePKas(phosphate, 25, 0.1, true);
    const q = meanCharge(phosphate, fractions(6.9, kas));
    expect(solvePHForCharge(phosphate, q, kas)).toBeCloseTo(6.9, 8);
  });

  it('moves a fixed-composition Tris buffer from pH 8.0 at 25 °C to 8.588 at 4 °C', () => {
    const q = meanCharge(tris, fractions(8.0, effectivePKas(tris, 25, 0, false)));
    expect(solvePHForCharge(tris, q, effectivePKas(tris, 4, 0, false))).toBeCloseTo(8.588, 6);
  });

  it('throws when the charge cannot be reached', () => {
    expect(() => solvePHForCharge(tris, 5, [8.06])).toThrow(RangeError);
  });
});

describe('buffer ionic strength', () => {
  it('is 0.025 M for 50 mM Tris at pH = pKa (half Tris-H⁺ with one monovalent counter-ion)', () => {
    expect(bufferIonicStrength(tris, 0.05, [0.5, 0.5])).toBeCloseTo(0.025, 10);
  });

  it('counts divalent species: 100 mM phosphate at 60 % HPO4²⁻ / 40 % H2PO4⁻ is 0.22 M', () => {
    expect(bufferIonicStrength(phosphate, 0.1, [0, 0.4, 0.6, 0])).toBeCloseTo(0.22, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/buffer-speciation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/core/buffers/speciation.ts`:

```ts
import type { BufferSystem } from './pka';

/** Debye–Hückel A parameter for water, 0–50 °C (polynomial fit to Bates, Robinson tables). */
export function daviesA(temp_C: number): number {
  return 0.4918 + 6.6e-4 * temp_C + 5e-6 * temp_C * temp_C;
}

/** Davies activity function f(I) with log10(gamma) = -A z^2 f(I). Valid to about I = 0.5 M. */
export function daviesF(I: number): number {
  if (!(I >= 0)) throw new RangeError('Ionic strength must be non-negative');
  const root = Math.sqrt(I);
  return root / (1 + root) - 0.3 * I;
}

/** Apparent (concentration) pKa minus thermodynamic pKa for an acid species of charge zAcid. */
export function pKaIonicShift(zAcid: number, I: number, temp_C: number): number {
  return (2 * zAcid - 1) * daviesA(temp_C) * daviesF(I);
}

/** pKa' of every step at a temperature and ionic strength (linear dpKa/dT about 25 °C). */
export function effectivePKas(system: BufferSystem, temp_C: number, I: number, correctIonic: boolean): number[] {
  return system.steps.map((s, j) => {
    const pKa = s.pKa25 + s.dpKadT * (temp_C - 25);
    return correctIonic ? pKa + pKaIonicShift(system.z0 - j, I, temp_C) : pKa;
  });
}

/** Fraction of each species; index k = number of protons removed. */
export function fractions(pH: number, pKas: number[]): number[] {
  const logW = [0];
  for (const pKa of pKas) logW.push(logW[logW.length - 1]! + (pH - pKa));
  const max = Math.max(...logW);
  const w = logW.map(l => 10 ** (l - max));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / sum);
}

export const meanProtonsRemoved = (fr: number[]) => fr.reduce((a, f, k) => a + f * k, 0);
export const meanCharge = (system: BufferSystem, fr: number[]) => system.z0 - meanProtonsRemoved(fr);

/** pH at which the buffer carries mean charge targetQ (monotonic in pH, bisection). */
export function solvePHForCharge(system: BufferSystem, targetQ: number, pKas: number[]): number {
  let lo = -2, hi = 16;
  const q = (pH: number) => meanCharge(system, fractions(pH, pKas));
  if (targetQ > q(lo) + 1e-12 || targetQ < q(hi) - 1e-12) throw new RangeError('Charge not reachable for this buffer system');
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (q(mid) > targetQ) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Ionic strength (M) of a buffer of total concentration C (M) with monovalent counter-ions. */
export function bufferIonicStrength(system: BufferSystem, totalConc_M: number, fr: number[]): number {
  let z2 = 0, z = 0;
  fr.forEach((f, k) => { const charge = system.z0 - k; z2 += f * charge * charge; z += f * charge; });
  return 0.5 * totalConc_M * (z2 + Math.abs(z));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/buffer-speciation.test.ts`
Expected: PASS. (The 12-digit `toEqual([0.5, 0.5])` relies on `10 ** 0 === 1`; if floating-point gives 0.4999999999999999 use `toBeCloseTo` instead and say so in the commit.)

- [ ] **Step 5: Commit**

```bash
git add src/core/buffers/speciation.ts tests/core/buffer-speciation.test.ts
git commit -m "feat(buffers): species fractions, Davies ionic correction and pH solver

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Mixture solver (`mixture.ts`)

**Files:**
- Create: `src/core/buffers/mixture.ts`
- Test: `tests/core/buffer-mixture.test.ts`

**Interfaces:**
- Consumes: `solveRecipe`, `BufferRecipeError`, `RecipeComponent`, `RecipeRow` from `./recipe`; `findSystem` from `./pka`; speciation functions from `./speciation`.
- Produces: `PremadeBuffer`, `DesignBuffer`, `BufferComponent`, `MixtureComponent`, `MixtureOptions { finalVolume_L; workingTemp_C; ionicCorrection }`, `MixtureRow extends RecipeRow { componentIndex; role: 'component' | 'titrant' }`, `BufferReport { componentIndex; name; pHSet; setTemp_C; pHWorking; drift; titrantEquiv?; outOfRange }`, `MixtureResult { rows; buffers; ionicStrength; notCounted; warnings }`, `solveMixture(components, opts): MixtureResult`. Throws `BufferRecipeError` for every user-input problem.
- `DesignBuffer.pHTemp_C` is the temperature the pH is specified at (the UI resolves "follow working temperature" before calling).

- [ ] **Step 1: Write the failing test**

Create `tests/core/buffer-mixture.test.ts`. Every expected number was computed from the closed-form model and cross-checked by hand (Tris base fraction at pH 8, 8 + 0.028·21 shift, HEPES speciation at I = 0.179, phosphate 0.1 M pH 7.0 ≈ 61 % dibasic as in the standard Sambrook & Russell phosphate table).

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/buffer-mixture.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/core/buffers/mixture.ts`:

```ts
import { BufferRecipeError, solveRecipe, type RecipeComponent, type RecipeRow } from './recipe';
import { findSystem } from './pka';
import { bufferIonicStrength, effectivePKas, fractions, meanCharge, meanProtonsRemoved, solvePHForCharge } from './speciation';

interface BufferBase { kind: 'buffer'; name: string; systemId: string; target: { value: number; unit: 'M' | 'mM' } }
export interface PremadeBuffer extends BufferBase {
  mode: 'premade'; stockConc: number; stockUnit: 'M' | 'mM'; stockPH: number; stockTemp_C: number;
}
export interface DesignBuffer extends BufferBase {
  mode: 'design'; pH: number; pHTemp_C: number; method: 'titrate' | 'mix-forms';
  formId: string; formId2?: string; titrantConc_M: number;
}
export type BufferComponent = PremadeBuffer | DesignBuffer;
export type MixtureComponent = RecipeComponent | BufferComponent;

export interface MixtureOptions { finalVolume_L: number; workingTemp_C: number; ionicCorrection: boolean }
export interface MixtureRow extends RecipeRow { componentIndex: number; role: 'component' | 'titrant' }
export interface BufferReport {
  componentIndex: number;
  name: string;
  /** pH the user asked for (design) or the stock pH (premade). */
  pHSet: number;
  /** Temperature that pH refers to. */
  setTemp_C: number;
  /** pH the finished mixture is predicted to read at the working temperature. */
  pHWorking: number;
  /** Predicted pH minus pHSet; warn when its magnitude exceeds 0.1. */
  drift: number;
  /** Equivalents of titrant per mole of buffer (design/titrate only); negative = acid. */
  titrantEquiv?: number;
  /** True when pHSet is more than 1.5 units from every pKa', so the mixture barely buffers. */
  outOfRange: boolean;
}
export interface MixtureResult {
  rows: MixtureRow[];
  buffers: BufferReport[];
  ionicStrength: number;
  /** Names of molar components whose ions are not part of the ionic-strength estimate. */
  notCounted: string[];
  /** Plain-language caveats (e.g. ionic strength beyond the Davies equation's range). */
  warnings: string[];
}

/** ionic weight per mole of salt: 0.5 * sum(n_i z_i^2) for the dissociated ions. */
const SALTS: { test: RegExp; weight: number }[] = [
  { test: /sodium chloride|\bnacl\b/i, weight: 1 },
  { test: /potassium chloride|\bkcl\b/i, weight: 1 },
  { test: /ammonium chloride|nh4cl/i, weight: 1 },
  { test: /sodium acetate/i, weight: 1 },
  { test: /magnesium chloride|mgcl2|calcium chloride|cacl2/i, weight: 3 },
  { test: /ammonium sulfate|\(nh4\)2so4/i, weight: 3 },
  { test: /magnesium sulfate|mgso4/i, weight: 4 },
];

const molar = (t: { value: number; unit: string }): number | undefined =>
  t.unit === 'M' ? t.value : t.unit === 'mM' ? t.value / 1000 : undefined;

const positive = (v: number, label: string) => {
  if (!Number.isFinite(v) || v <= 0) throw new BufferRecipeError(`${label} must be a positive number`);
};

interface Resolved { rows: MixtureRow[]; report: BufferReport; ionic: number; stockIonic?: number }
const DAVIES_LIMIT_M = 0.5;
const BUFFERING_RANGE = 1.5;

function resolveBuffer(c: BufferComponent, index: number, I: number, opts: MixtureOptions): Resolved {
  const system = findSystem(c.systemId);
  if (!system) throw new BufferRecipeError(`${c.name}: unknown buffer system`);
  const conc = molar(c.target);
  if (conc === undefined || !(conc > 0)) throw new BufferRecipeError(`${c.name}: buffer concentration must be positive and in M or mM`);
  const moles = conc * opts.finalVolume_L;
  const correct = opts.ionicCorrection;
  const useKas = effectivePKas(system, opts.workingTemp_C, I, correct);
  const rows: MixtureRow[] = [];
  let Q: number, pHSet: number, setTemp: number, titrantEquiv: number | undefined, stockIonic: number | undefined;
  if (!Number.isFinite(opts.workingTemp_C)) throw new BufferRecipeError('Working temperature must be a number');

  if (c.mode === 'premade') {
    positive(c.stockConc, `${c.name} stock concentration`);
    const stockM = c.stockUnit === 'M' ? c.stockConc : c.stockConc / 1000;
    if (conc > stockM) throw new BufferRecipeError(`${c.name}: target is above the stock concentration`);
    if (!Number.isFinite(c.stockPH) || !Number.isFinite(c.stockTemp_C)) throw new BufferRecipeError(`${c.name}: stock pH and temperature must be numbers`);
    let Is = 0;
    for (let i = 0; i < 60; i++) {
      Is = bufferIonicStrength(system, stockM, fractions(c.stockPH, effectivePKas(system, c.stockTemp_C, Is, correct)));
    }
    stockIonic = Is;
    Q = meanCharge(system, fractions(c.stockPH, effectivePKas(system, c.stockTemp_C, Is, correct)));
    pHSet = c.stockPH; setTemp = c.stockTemp_C;
    rows.push({ name: `${c.name} (${c.stockConc} ${c.stockUnit}, pH ${c.stockPH})`, amount: (conc / stockM) * opts.finalVolume_L * 1000, unit: 'mL', componentIndex: index, role: 'component' });
  } else {
    if (!Number.isFinite(c.pH) || !Number.isFinite(c.pHTemp_C)) throw new BufferRecipeError(`${c.name}: pH and temperature must be numbers`);
    const setKas = effectivePKas(system, c.pHTemp_C, I, correct);
    const fr = fractions(c.pH, setKas);
    const m = meanProtonsRemoved(fr);
    Q = system.z0 - m; pHSet = c.pH; setTemp = c.pHTemp_C;
    const form = system.forms.find(f => f.id === c.formId);
    if (!form) throw new BufferRecipeError(`${c.name}: choose a starting form`);
    if (c.method === 'titrate') {
      positive(c.titrantConc_M, 'Titrant concentration');
      rows.push({ name: form.label, amount: moles * form.mw, unit: 'g', componentIndex: index, role: 'component' });
      titrantEquiv = m - form.protonsRemoved;
      if (Math.abs(titrantEquiv) > 1e-9) {
        const base = titrantEquiv > 0;
        rows.push({ name: `${base ? 'NaOH' : 'HCl'} ${c.titrantConc_M} M (approx., finish with pH meter)`, amount: (Math.abs(titrantEquiv) * moles / c.titrantConc_M) * 1000, unit: 'mL', componentIndex: index, role: 'titrant' });
      }
    } else {
      const other = system.forms.find(f => f.id === c.formId2);
      if (!other) throw new BufferRecipeError(`${c.name}: choose a second form to mix`);
      const [a, b] = form.protonsRemoved <= other.protonsRemoved ? [form, other] : [other, form];
      if (a.protonsRemoved === b.protonsRemoved) throw new BufferRecipeError(`${c.name}: the two forms differ by no protons; pick an acid and a base form`);
      const xb = (m - a.protonsRemoved) / (b.protonsRemoved - a.protonsRemoved);
      if (xb < -1e-9 || xb > 1 + 1e-9) throw new BufferRecipeError(`${c.name}: pH ${c.pH} cannot be reached by mixing ${a.label} and ${b.label}; use the titrate method`);
      const xbc = Math.min(1, Math.max(0, xb));
      rows.push({ name: a.label, amount: moles * (1 - xbc) * a.mw, unit: 'g', componentIndex: index, role: 'component' });
      rows.push({ name: b.label, amount: moles * xbc * b.mw, unit: 'g', componentIndex: index, role: 'component' });
    }
  }

  let pHWorking: number;
  try { pHWorking = solvePHForCharge(system, Q, useKas); } catch (error) {
    if (error instanceof RangeError) throw new BufferRecipeError(`${c.name}: the pH at the working temperature could not be solved`);
    throw error;
  }
  const ionic = bufferIonicStrength(system, conc, fractions(pHWorking, useKas));
  const nearest = Math.min(...effectivePKas(system, setTemp, I, correct).map(pKa => Math.abs(pHSet - pKa)));
  return { rows, ionic, stockIonic, report: { componentIndex: index, name: c.name, pHSet, setTemp_C: setTemp, pHWorking, drift: pHWorking - pHSet, titrantEquiv, outOfRange: nearest > BUFFERING_RANGE } };
}

export function solveMixture(components: MixtureComponent[], opts: MixtureOptions): MixtureResult {
  positive(opts.finalVolume_L, 'Final volume');
  if (!Number.isFinite(opts.workingTemp_C)) throw new BufferRecipeError('Working temperature must be a number');
  let saltI = 0;
  const notCounted: string[] = [];
  components.forEach(c => {
    if (c.kind === 'buffer') return;
    const conc = molar(c.target);
    const salt = SALTS.find(s => s.test.test(c.name));
    if (conc !== undefined && salt) saltI += conc * salt.weight;
    else notCounted.push(c.name);
  });

  const solveAll = (I: number) => components.map((c, i) => c.kind === 'buffer' ? resolveBuffer(c, i, I, opts) : undefined);
  let I = saltI;
  let resolved = solveAll(I);
  for (let i = 0; i < 60; i++) {
    const next = saltI + resolved.reduce((a, r) => a + (r?.ionic ?? 0), 0);
    const done = Math.abs(next - I) < 1e-9;
    I = done ? next : 0.5 * (I + next);
    resolved = solveAll(I);
    if (done) break;
  }

  const rows: MixtureRow[] = [];
  const buffers: BufferReport[] = [];
  components.forEach((c, i) => {
    const r = resolved[i];
    if (c.kind === 'buffer' && r) { rows.push(...r.rows); buffers.push(r.report); return; }
    const [row] = solveRecipe([c as RecipeComponent], opts.finalVolume_L);
    rows.push({ ...row!, componentIndex: i, role: 'component' });
  });
  const warnings: string[] = [];
  if (opts.ionicCorrection && I > DAVIES_LIMIT_M) warnings.push(`Ionic strength ${I.toFixed(2)} M is above the ${DAVIES_LIMIT_M} M range of the Davies equation; the pH prediction is approximate.`);
  if (opts.ionicCorrection && buffers.length > 0 && (opts.workingTemp_C < 0 || opts.workingTemp_C > 50)) warnings.push('Temperature is outside 0–50 °C, the range of the activity-coefficient fit; the ionic-strength correction is approximate.');
  buffers.forEach(b => {
    if (b.outOfRange) warnings.push(`${components[b.componentIndex]!.name}: pH ${b.pHSet} is more than ${BUFFERING_RANGE} units from every pKa of this buffer, so it barely buffers and the predicted pH at the working temperature is unreliable.`);
  });
  resolved.forEach((r, i) => {
    if (opts.ionicCorrection && r?.stockIonic !== undefined && r.stockIonic > DAVIES_LIMIT_M) warnings.push(`${components[i]!.name}: the stock's own ionic strength (${r.stockIonic.toFixed(2)} M) is above the Davies range, so its predicted pH shift on dilution is approximate.`);
  });
  return { rows, buffers, ionicStrength: I, notCounted, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/buffer-mixture.test.ts tests/core/buffer-speciation.test.ts tests/core/buffer-pka.test.ts tests/core/buffers.test.ts && npm run typecheck && npm run lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/buffers/mixture.ts tests/core/buffer-mixture.test.ts
git commit -m "feat(buffers): mixture solver with premade/titrate/mix-forms buffers and pH at working temperature

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Editor state, conversion and recipe text

**Files:**
- Create: `src/tools/buffers/state.ts`, `src/tools/buffers/recipe-text.ts`
- Test: `tests/app/buffers-state.test.ts`

**Interfaces:**
- Consumes: `MixtureComponent`, `BufferComponent`, `MixtureResult`, `BufferReport` from `@/core/buffers/mixture`; `findSystem`, `matchForm`, `BufferSystem` from `@/core/buffers/pka`; `RecipeTarget`, `RecipeUnit` from `@/core/buffers/recipe`; `QValue`; `isPositiveNumber`, `isRecord` from `@/lib/local-library`; `formatSI` from `@/core/units`.
- Produces (`state.ts`): `BufferEditor`, `EditorComponent`, `State`, `Preset`, `newId()`, `DEFAULT_COMPONENT`, `DEFAULTS`, `defaultBuffer(systemId?)`, `mixDefaults(system)`, `toMixture(editor, workingTemp_C)`, `fromMixture(component)`, `isMixtureComponent(value)`.
- Produces (`recipe-text.ts`): `displayAmount(amount, unit)`, `phLines(result, workingTemp)`, `recipeText(result, volumeLabel, workingTemp, science)`, `recipeCsvRows(result)`.

- [ ] **Step 1: Write the failing test**

Create `tests/app/buffers-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeLinkState } from '@/lib/url-state';
import { solveMixture } from '@/core/buffers/mixture';
import {
  DEFAULTS, defaultBuffer, fromMixture, isMixtureComponent, mixDefaults, toMixture, type EditorComponent,
} from '@/tools/buffers/state';
import { findSystem } from '@/core/buffers/pka';
import { displayAmount, phLines, recipeCsvRows, recipeText } from '@/tools/buffers/recipe-text';

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
    const solid = fromMixture({ name: 'NaCl', kind: 'solid', mw: 58.44, target: { value: 150, unit: 'mM' } });
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/buffers-state.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `state.ts`**

Create `src/tools/buffers/state.ts`:

```ts
import type { QValue } from '@/app/components/Quantity';
import type { MixtureComponent } from '@/core/buffers/mixture';
import { findSystem, type BufferSystem } from '@/core/buffers/pka';
import type { RecipeTarget, RecipeUnit } from '@/core/buffers/recipe';
import { isPositiveNumber, isRecord } from '@/lib/local-library';

export interface BufferEditor {
  systemId: string;
  mode: 'premade' | 'design';
  stockConc: number; stockUnit: 'M' | 'mM'; stockPH: number; stockTemp_C: number;
  pH: number;
  /** undefined = the pH is specified at the working temperature. */
  pHTemp_C?: number;
  method: 'titrate' | 'mix-forms';
  formId: string; formId2?: string;
  titrantConc_M: number;
}

export interface EditorComponent {
  id: string; query: string; name: string; kind: 'solid' | 'stock' | 'buffer';
  mw?: number; waters?: number;
  stockConc?: number; stockUnit?: RecipeUnit; density?: number;
  target: RecipeTarget;
  buffer?: BufferEditor;
}

export interface State { volume: QValue; workingTemp_C: number; ionicCorrection: boolean; components: EditorComponent[] }
export interface Preset { id: string; name: string; finalVolume_L: number; source: string; components: MixtureComponent[] }

let nextId = 1;
export const newId = () => `buffer-row-${nextId++}`;

export const DEFAULT_COMPONENT: EditorComponent = {
  id: 'buffer-row-0', query: 'Tris-base', name: 'Tris-base', kind: 'solid', mw: 121.14,
  waters: 0, target: { value: 10, unit: 'mM' },
};
export const DEFAULTS: State = {
  volume: { value: 500, unit: 'mL' }, workingTemp_C: 25, ionicCorrection: true, components: [DEFAULT_COMPONENT],
};

/** The weighable forms with the fewest and the most protons removed, used as the acid/base pair for mixing. */
export function mixDefaults(system: BufferSystem): { formId: string; formId2: string } {
  const lo = system.forms.reduce((a, f) => f.protonsRemoved < a.protonsRemoved ? f : a);
  const hi = system.forms.reduce((a, f) => f.protonsRemoved > a.protonsRemoved ? f : a);
  return { formId: lo.id, formId2: hi.id };
}

/** pKa closest to neutral: the step a bench scientist means by "the buffer's pKa". */
const mainPKa = (system: BufferSystem) =>
  system.steps.reduce((a, s) => Math.abs(s.pKa25 - 7) < Math.abs(a - 7) ? s.pKa25 : a, system.steps[0]!.pKa25);

export function defaultBuffer(systemId = 'tris'): BufferEditor {
  const system = findSystem(systemId) ?? findSystem('tris')!;
  const startS = system.z0 === 1 ? 1 : 0;
  const start = system.forms.find(f => f.protonsRemoved === startS) ?? system.forms[0]!;
  const pH = Math.round(mainPKa(system) * 2) / 2;
  return {
    systemId: system.id, mode: 'design', stockConc: 1, stockUnit: 'M', stockPH: pH, stockTemp_C: 25,
    pH, method: 'titrate', formId: start.id, titrantConc_M: 1,
  };
}

export function toMixture(c: EditorComponent, workingTemp_C: number): MixtureComponent {
  if (c.kind === 'solid') return { name: c.name, kind: 'solid', mw: c.mw, waters: c.waters, target: c.target };
  if (c.kind === 'stock') {
    return {
      name: c.name, kind: 'stock', stockConc: (c.stockConc !== undefined && !isNaN(c.stockConc)) ? c.stockConc : 1,
      stockUnit: c.stockUnit ?? 'M', target: c.target, density: c.density,
    };
  }
  const b = c.buffer ?? defaultBuffer();
  const target = { value: c.target.value, unit: c.target.unit === 'M' ? 'M' as const : 'mM' as const };
  if (b.mode === 'premade') {
    return { kind: 'buffer', mode: 'premade', name: c.name, systemId: b.systemId, target, stockConc: b.stockConc, stockUnit: b.stockUnit, stockPH: b.stockPH, stockTemp_C: b.stockTemp_C };
  }
  return {
    kind: 'buffer', mode: 'design', name: c.name, systemId: b.systemId, target, pH: b.pH, pHTemp_C: b.pHTemp_C ?? workingTemp_C,
    method: b.method, formId: b.formId, formId2: b.formId2, titrantConc_M: b.titrantConc_M,
  };
}

export function fromMixture(c: MixtureComponent): EditorComponent {
  if (c.kind !== 'buffer') {
    return { ...c, id: newId(), query: c.name, waters: c.kind === 'solid' ? c.waters ?? 0 : undefined };
  }
  const defaults = defaultBuffer(c.systemId);
  const buffer: BufferEditor = c.mode === 'premade'
    ? { ...defaults, mode: 'premade', stockConc: c.stockConc, stockUnit: c.stockUnit, stockPH: c.stockPH, stockTemp_C: c.stockTemp_C }
    : { ...defaults, mode: 'design', pH: c.pH, pHTemp_C: c.pHTemp_C, method: c.method, formId: c.formId, formId2: c.formId2, titrantConc_M: c.titrantConc_M };
  return { id: newId(), query: c.name, name: c.name, kind: 'buffer', target: c.target, buffer };
}

/** Validator for stored and preset components: the old solid/stock shapes plus the new buffer shape. */
export function isMixtureComponent(c: unknown): c is MixtureComponent {
  if (!isRecord(c) || typeof c.name !== 'string' || !isRecord(c.target)) return false;
  if (c.kind === 'solid') return true;
  if (c.kind === 'stock') return isPositiveNumber(c.stockConc) && typeof c.stockUnit === 'string';
  if (c.kind !== 'buffer' || typeof c.systemId !== 'string' || !findSystem(c.systemId)) return false;
  if (c.mode === 'premade') return isPositiveNumber(c.stockConc) && Number.isFinite(c.stockPH) && Number.isFinite(c.stockTemp_C);
  return c.mode === 'design' && Number.isFinite(c.pH) && Number.isFinite(c.pHTemp_C)
    && (c.method === 'titrate' || c.method === 'mix-forms') && typeof c.formId === 'string' && isPositiveNumber(c.titrantConc_M);
}
```

- [ ] **Step 4: Write `recipe-text.ts`**

Create `src/tools/buffers/recipe-text.ts`:

```ts
import type { MixtureResult } from '@/core/buffers/mixture';
import { formatSI } from '@/core/units';

export function displayAmount(amount: number, unit: 'g' | 'mL'): string {
  return unit === 'g' ? formatSI(amount, 'mass').text : formatSI(amount / 1000, 'volume').text;
}

const ph = (v: number) => String(Number(v.toFixed(2)));

export function phLines(result: MixtureResult, workingTemp_C: number): string[] {
  return result.buffers.map(b => {
    const changed = b.setTemp_C !== workingTemp_C || Math.abs(b.drift) >= 0.005;
    return `${b.name}: pH ${ph(b.pHSet)} at ${b.setTemp_C} °C${changed ? ` → pH ${ph(b.pHWorking)} at ${workingTemp_C} °C` : ''}`;
  });
}

export function recipeText(result: MixtureResult, volumeLabel: string, workingTemp_C: number, science: string): string {
  return [
    `Buffer recipe — ${volumeLabel}`,
    ...result.rows.map(row => `${row.name}: ${displayAmount(row.amount, row.unit)}${row.mass_g === undefined ? '' : ` (${Number(row.mass_g.toPrecision(4))} g by density)`}`),
    ...phLines(result, workingTemp_C),
    `Ionic strength about ${Number(result.ionicStrength.toPrecision(3))} M.`,
    ...result.warnings,
    `Bring to ${volumeLabel} with water.`, '', science,
  ].join('\n');
}

export function recipeCsvRows(result: MixtureResult): (string | number)[][] {
  return [
    ['Component', 'Amount', 'Unit', 'Mass from density (g)'],
    ...result.rows.map(row => [row.name, Number(row.amount.toPrecision(8)), row.unit, row.mass_g ?? '']),
  ];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/app/buffers-state.test.ts && npm run typecheck`
Expected: PASS. If `displayAmount(2.5, 'mL')` formats differently (e.g. `2.5 mL` vs `2.50 mL`), loosen only that regex; the mg assertion mirrors the existing calculators test.

- [ ] **Step 6: Commit**

```bash
git add src/tools/buffers/state.ts src/tools/buffers/recipe-text.ts tests/app/buffers-state.test.ts
git commit -m "feat(buffers): editor state, stored-shape conversion and recipe text for the v2 tool

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Split the view into model + components (behaviour-preserving refactor)

This task changes structure only: after it, the tool looks and behaves as today, but runs on `solveMixture` and the new `State`. The three existing buffer test files must pass untouched.

**Files:**
- Create: `src/tools/buffers/components/ui.tsx`, `ComponentRow.tsx`, `RecipeSheet.tsx`, `PresetBar.tsx`, `ContributeModal.tsx`, `src/tools/buffers/BuffersModel.tsx`
- Modify: `src/tools/buffers/View.tsx` (becomes a thin composition)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: `useBuffersModel()` returning `BuffersModel` (below); components `ComponentRow`, `RecipeSheet`, `PresetBar`, `ContributeModal`; `ui.tsx` exports `fieldClass`, `labelClass`, `Segmented`, `NumberField`.

- [ ] **Step 1: Baseline**

Run: `npx vitest run tests/app/buffers-modal.test.tsx tests/app/calculators.test.tsx tests/core/buffers.test.ts`
Expected: PASS (this is the behaviour to preserve).

- [ ] **Step 2: Create `components/ui.tsx`**

```tsx
import type { ComponentChildren } from 'preact';

export const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
export const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} class="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          class={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${value === o.value ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Number input with a visible caption. An empty field becomes NaN so the core can report it. */
export function NumberField({ label, ariaLabel, value, onValue, step = 'any', min, placeholder, children }: {
  label: string; ariaLabel?: string; value: number | undefined; onValue: (n: number) => void;
  step?: string; min?: string; placeholder?: string; children?: ComponentChildren;
}) {
  return (
    <div>
      <span class={labelClass}>{label}</span>
      <input
        aria-label={ariaLabel ?? label}
        type="number"
        step={step}
        min={min}
        placeholder={placeholder}
        value={value === undefined || Number.isNaN(value) ? '' : value}
        onInput={event => { const v = (event.target as HTMLInputElement).value; onValue(v === '' ? NaN : Number(v)); }}
        class={`${fieldClass} mono py-1.5 text-xs`}
      />
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Move `PresetBar.tsx` and `ContributeModal.tsx` verbatim**

Create `components/PresetBar.tsx` containing the JSX currently at `View.tsx` lines 387–498 (the "Preset Selector & Action Buttons" card, from `<div class="rounded-xl border … space-y-3">` to its closing `</div>`; line 386 is a comment you can drop), as:

```tsx
import type { Preset } from '../state';
import { fieldClass } from './ui';

export interface PresetBarProps {
  presets: Preset[];                 // the built-in PRESETS
  customPresets: Preset[];
  saveName: string; showSaveDialog: boolean;
  onSaveName: (v: string) => void; onShowSave: (open: boolean) => void;
  onSave: () => void; onDelete: (id: string) => void; onLoad: (id: string) => void;
  onContribute: () => void;
}

export function PresetBar(props: PresetBarProps) {
  const { presets: PRESETS, customPresets, saveName, showSaveDialog } = props;
  return (
    /* paste the card JSX here, replacing: setShowSaveDialog(x) → props.onShowSave(x); setShowContributeModal(true) → props.onContribute();
       setSaveName(v) → props.onSaveName(v); saveCustomBuffer → props.onSave; deleteCustomBuffer(id) → props.onDelete(id); loadPreset(id) → props.onLoad(id) */
  );
}
```

Create `components/ContributeModal.tsx` containing the JSX at `View.tsx` lines 655–712 (the fixed overlay, from `<div class="fixed inset-0 …">` to its closing `</div>`, without the surrounding `{showContributeModal && ( … )}`), as:

```tsx
export function ContributeModal({ recipeJson, title, onClose }: { recipeJson: string; title: string; onClose: () => void }) {
  return (
    /* paste the overlay JSX here, replacing: setShowContributeModal(false) → onClose();
       recipeJsonString → recipeJson; `saveName || s.components[0]?.name || 'New Buffer'` → title */
  );
}
```

The two `/* paste … */` blocks are a mechanical move of existing, unchanged markup (same classes, same `title="Close modal"`, same button texts `Contribute` / `Copy JSON` / `Submit via GitHub Issue ↗`); do not restyle in this task.

- [ ] **Step 4: Create `components/ComponentRow.tsx`**

Solid and stock rows keep today's fields and labels. Buffer handling arrives in Task 6, so for now `kind` is `'solid' | 'stock'` only in the UI.

```tsx
import chemicalsJson from '@/data/chemicals.json';
import type { RecipeUnit } from '@/core/buffers/recipe';
import type { EditorComponent } from '../state';
import { Segmented, fieldClass, labelClass } from './ui';

interface Chemical { name: string; mw: number; type: string; synonyms?: string[]; hydrateOf?: string; waters?: number }
const CHEMICALS = chemicalsJson.chemicals as Chemical[];
const explicitForm = (name: string) => /hydrate|anhydrous|[·.]\s*\d*\s*h[₂2]o/i.test(name);

export interface ComponentRowProps {
  component: EditorComponent; index: number; total: number;
  onChange: (patch: Partial<EditorComponent>) => void;
  onKind: (kind: EditorComponent['kind']) => void;
  onRemove: () => void;
  onLookup: () => void;
}

export function ComponentRow({ component, index, total, onChange, onKind, onRemove, onLookup }: ComponentRowProps) {
  const suffix = index === 0 ? '' : ` ${index + 1}`;
  const q = component.query.trim().toLowerCase();
  const matches = q && q !== component.name.toLowerCase() ? CHEMICALS.filter(chemical =>
    chemical.name.toLowerCase().includes(q) || chemical.synonyms?.some(synonym => synonym.toLowerCase().includes(q)),
  ).slice(0, 8) : [];

  return (
    <div class="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs transition dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800/80">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <span class="inline-flex h-5 w-5 shrink-0 select-none items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700 dark:bg-accent-950 dark:text-accent-300">{index + 1}</span>
          <strong class="max-w-[200px] truncate text-sm font-bold text-slate-900 dark:text-slate-100">{component.name || 'New component'}</strong>
          <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {component.kind === 'solid' ? (component.mw ? `${component.mw} g/mol` : 'MW needed') : `${component.stockConc ?? 1} ${component.stockUnit || 'M'}`}
          </span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Segmented<'solid' | 'stock'>
            label={`Component form${suffix}`}
            value={component.kind as 'solid' | 'stock'}
            options={[{ value: 'solid', label: 'Solid' }, { value: 'stock', label: 'Stock' }]}
            onChange={onKind}
          />
          <button
            type="button"
            onClick={onRemove}
            disabled={total === 1}
            class="flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-20 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            title="Remove component"
            aria-label={`Remove component${suffix}`}
          >✕</button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
        <div class="relative sm:col-span-7">
          <label class="block">
            <span class={labelClass}>Search Chemical / Formula</span>
            <div class="relative">
              <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs text-slate-500 dark:text-slate-400">🔍</span>
              <input
                aria-label={`Chemical search${suffix}`}
                value={component.query}
                onInput={event => onChange({ query: (event.target as HTMLInputElement).value })}
                class={`${fieldClass} py-1.5 pl-7 text-xs`}
                placeholder="e.g. Tris, NaCl, MgCl2, SDS"
              />
            </div>
          </label>
          {matches.length > 0 && (
            <div class="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800" aria-label="Chemical matches">
              {matches.map(chemical => (
                <button
                  key={chemical.name}
                  type="button"
                  class="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-700/80"
                  onClick={() => onChange({ query: chemical.name, name: chemical.name, mw: chemical.mw, waters: 0 })}
                >
                  <strong class="font-medium text-slate-900 dark:text-slate-100">{chemical.name}</strong>
                  <span class="ml-1.5 text-slate-500 dark:text-slate-400">— {chemical.mw} g/mol{chemical.hydrateOf ? ` (${chemical.waters} waters)` : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div class="sm:col-span-5">
          <label class="block">
            <span class={labelClass}>Target Concentration</span>
            <span class="flex">
              <input
                aria-label={`Target concentration${suffix}`}
                type="number" min="0" step="any"
                value={component.target.value}
                onInput={event => onChange({ target: { ...component.target, value: Number((event.target as HTMLInputElement).value) } })}
                class={`${fieldClass} mono flex-1 rounded-r-none py-1.5 text-xs`}
              />
              <select
                aria-label={`Target unit${suffix}`}
                value={component.target.unit}
                onChange={event => onChange({ target: { ...component.target, unit: (event.target as HTMLSelectElement).value as RecipeUnit } })}
                class="rounded-r-lg border border-l-0 border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option>M</option><option>mM</option><option>%</option><option value="x">×</option>
              </select>
            </span>
          </label>
        </div>
      </div>

      {component.kind === 'solid' ? (
        <div class="grid grid-cols-1 gap-2.5 pt-0.5 sm:grid-cols-2">
          <div>
            <div class="mb-1 flex items-center justify-between">
              <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">MW (g/mol)</span>
              <button type="button" onClick={onLookup} class="text-[10px] font-medium text-accent-600 hover:underline dark:text-accent-400">PubChem MW ↗</button>
            </div>
            <input
              aria-label={`Molecular weight${suffix}`}
              type="number" step="any" value={component.mw ?? ''}
              onInput={event => onChange({ mw: Number((event.target as HTMLInputElement).value) })}
              class={`${fieldClass} mono py-1.5 text-xs`}
            />
          </div>
          <div>
            <span class={labelClass}>Hydrate Waters (·nH₂O)</span>
            <input
              aria-label={`Additional waters${suffix}`}
              type="number" min="0" step="1" value={component.waters ?? 0}
              disabled={explicitForm(component.name)}
              onInput={event => onChange({ waters: Number((event.target as HTMLInputElement).value) })}
              class={`${fieldClass} mono py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50`}
            />
          </div>
        </div>
      ) : (
        <div class="grid grid-cols-1 gap-2.5 pt-0.5 sm:grid-cols-3">
          <div>
            <span class={labelClass}>Stock Conc</span>
            <input aria-label="Stock Conc" type="number" step="any" value={component.stockConc ?? 1}
              onInput={event => onChange({ stockConc: Number((event.target as HTMLInputElement).value) })}
              class={`${fieldClass} mono py-1.5 text-xs`} />
          </div>
          <div>
            <span class={labelClass}>Stock Unit</span>
            <select aria-label="Stock Unit" value={component.stockUnit ?? 'M'}
              onChange={event => onChange({ stockUnit: (event.target as HTMLSelectElement).value as RecipeUnit })}
              class={`${fieldClass} py-1.5 text-xs`}>
              <option>M</option><option>mM</option><option>%</option><option value="x">×</option>
            </select>
          </div>
          <div>
            <span class={labelClass}>Density (g/mL, opt)</span>
            <input aria-label="Density (g/mL, opt)" type="number" step="any" value={component.density ?? ''}
              onInput={event => { const v = (event.target as HTMLInputElement).value; onChange({ density: v ? Number(v) : undefined }); }}
              class={`${fieldClass} mono py-1.5 text-xs`} />
          </div>
        </div>
      )}
    </div>
  );
}
```

The old row used `Stock Conc` / `Stock Unit` / `Density` labels without an index suffix; keep that (tests rely on it for row 1; the duplicate names on later rows are a pre-existing a11y wart, fixed in Task 6 Step 3).

- [ ] **Step 5: Create `components/RecipeSheet.tsx`**

```tsx
import type { MixtureResult } from '@/core/buffers/mixture';
import { toSI } from '@/core/units';
import type { QValue } from '@/app/components/Quantity';
import { displayAmount } from '../recipe-text';
import type { EditorComponent } from '../state';

export interface RecipeSheetProps {
  result: MixtureResult; components: EditorComponent[]; volume: QValue; workingTemp_C: number;
  checked: Record<string, boolean>; onToggle: (key: string) => void;
}

export function prepSteps(result: MixtureResult, volume: QValue, volumeL: number, workingTemp_C: number): string[] {
  const titrated = result.buffers.filter(b => b.titrantEquiv !== undefined && Math.abs(b.titrantEquiv) > 1e-9);
  const steps = [
    `Add ~80% of final volume of purified water (${Math.round(volumeL * 800)} mL) to a beaker.`,
    'Weigh out or pipette each component listed above and dissolve with magnetic stirring.',
  ];
  if (titrated.length > 0) {
    const where = [...new Set(titrated.map(b => b.setTemp_C))].map(t => `${t} °C`).join(' / ');
    steps.push(`Add the listed acid or base while watching a pH meter calibrated at ${where}. The volume is an estimate; stop at the target pH.`);
  } else if (result.buffers.length === 0) {
    steps.push('If the recipe specifies a pH, adjust with concentrated HCl or NaOH.');
  }
  steps.push(`Transfer to a graduated cylinder, bring to final volume (${volume.value} ${volume.unit}) with water${workingTemp_C < 15 ? ' (cool the solution to its working temperature first)' : ''}, and sterile filter (0.22 µm) or autoclave as appropriate.`);
  return steps;
}

export function RecipeSheet({ result, components, volume, workingTemp_C, checked, onToggle }: RecipeSheetProps) {
  const volumeL = toSI(volume);
  return (
    <div data-testid="buffer-results" class="space-y-5">
      <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">Preparation Protocol — {volume.value} {volume.unit}</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Weigh and dissolve each component in order into purified water</p>
          </div>
          <span class="rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 dark:bg-accent-950 dark:text-accent-300">
            {components.length} Components
          </span>
        </div>

        <ul class="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Weigh-out list">
          {result.rows.map((row, idx) => {
            const comp = components[row.componentIndex];
            const key = `${idx}:${row.name}`;
            const isChecked = !!checked[key];
            const report = result.buffers.find(b => b.componentIndex === row.componentIndex);
            return (
              <li
                key={key}
                onClick={() => onToggle(key)}
                class={`flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border px-2 py-3 transition ${isChecked ? 'border-emerald-200 bg-emerald-50/50 opacity-60 dark:border-emerald-800/60 dark:bg-emerald-950/20' : 'border-transparent hover:bg-slate-50/70 dark:hover:bg-slate-800/30'}`}
              >
                <div class="flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`${row.name} added`}
                    checked={isChecked}
                    onChange={() => onToggle(key)}
                    onClick={e => e.stopPropagation()}
                    class="h-4 w-4 shrink-0 cursor-pointer rounded accent-emerald-600"
                  />
                  <div class="space-y-0.5">
                    <h4 class={`text-base font-bold transition ${isChecked ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>{row.name}</h4>
                    <div class="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                      {row.role === 'titrant' && <span>pH adjustment · approximate</span>}
                      {row.role === 'component' && comp && (
                        <span>Target: <strong class="text-slate-700 dark:text-slate-300">{comp.target.value} {comp.target.unit}</strong></span>
                      )}
                      {row.role === 'component' && comp?.kind === 'solid' && comp.mw && <span>· MW {comp.mw.toFixed(2)} g/mol</span>}
                      {row.role === 'component' && comp?.kind === 'stock' && <span>· Stock: {comp.stockConc} {comp.stockUnit}</span>}
                      {row.role === 'component' && report && <span>· pH {Number(report.pHSet.toFixed(2))} at {report.setTemp_C} °C</span>}
                      {row.mass_g !== undefined && <span>({Number(row.mass_g.toPrecision(4))} g by density)</span>}
                    </div>
                  </div>
                </div>
                <div class="ml-auto text-right">
                  <span class={`inline-block rounded-xl border px-3.5 py-1.5 font-mono text-base font-bold shadow-xs transition ${isChecked ? 'border-emerald-200 bg-emerald-100/60 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : 'border-accent-200 bg-accent-50 text-accent-700 dark:border-accent-800 dark:bg-accent-950/70 dark:text-accent-300'}`}>
                    {displayAmount(row.amount, row.unit)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {result.warnings.length > 0 && (
          <ul role="status" aria-label="Warnings" class="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            {result.warnings.map(w => <li key={w}>⚠ {w}</li>)}
          </ul>
        )}

        <div class="space-y-1.5 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <strong class="block font-semibold text-slate-900 dark:text-slate-100">Preparation Steps:</strong>
          <ol class="list-inside list-decimal space-y-1 text-slate-500 dark:text-slate-400">
            {prepSteps(result, volume, volumeL, workingTemp_C).map(step => <li key={step}>{step}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `BuffersModel.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'preact/hooks';
import presetsJson from '@/data/buffer-presets.json';
import { BufferRecipeError } from '@/core/buffers/recipe';
import { solveMixture, type MixtureResult } from '@/core/buffers/mixture';
import { toSI, UnitError } from '@/core/units';
import { scienceText } from '@/app/components/SciencePanel';
import { downloadText, toCsv } from '@/lib/export';
import { useUrlState } from '@/lib/url-state';
import { isPositiveNumber, isRecord, loadLibrary, saveLibrary, type LibrarySpec } from '@/lib/local-library';
import { recipeCsvRows, recipeText } from './recipe-text';
import { SCIENCE } from './science';
import {
  DEFAULTS, DEFAULT_COMPONENT, fromMixture, isMixtureComponent, newId, toMixture,
  type EditorComponent, type Preset, type State,
} from './state';

const CUSTOM_BUFFERS: LibrarySpec<Preset> = {
  key: 'bb.library.buffers',
  version: 1,
  legacyKeys: ['toolbox_custom_buffers'],
  validate: (v): v is Preset => isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string'
    && isPositiveNumber(v.finalVolume_L) && Array.isArray(v.components) && v.components.every(isMixtureComponent),
};
export const PRESETS = presetsJson.presets as unknown as Preset[];

export function useBuffersModel() {
  const [state, shareUrl] = useUrlState<State>('buffers', DEFAULTS);
  const [lookupStatus, setLookupStatus] = useState('');
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const update = (index: number, patch: Partial<EditorComponent>) => {
    set({ components: s.components.map((component, i) => i === index ? { ...component, ...patch } : component) });
  };

  useEffect(() => { setCustomPresets(loadLibrary(CUSTOM_BUFFERS)); }, []);

  const calculation = useMemo((): { result?: MixtureResult; error?: string } => {
    try {
      return {
        result: solveMixture(s.components.map(c => toMixture(c, s.workingTemp_C)), {
          finalVolume_L: toSI(s.volume), workingTemp_C: s.workingTemp_C, ionicCorrection: s.ionicCorrection,
        }),
      };
    } catch (error) {
      if (error instanceof BufferRecipeError || error instanceof UnitError) return { error: error.message };
      throw error;
    }
  }, [s]);

  const volumeLabel = `${s.volume.value} ${s.volume.unit}`;
  const copyText = calculation.result ? recipeText(calculation.result, volumeLabel, s.workingTemp_C, scienceText(SCIENCE)) : calculation.error ?? '';
  const exportCsv = () => {
    if (!calculation.result) return;
    downloadText([
      ...scienceText(SCIENCE).split('\n').map(line => `# ${line}`),
      toCsv(recipeCsvRows(calculation.result)),
    ].join('\n'), 'buffer-recipe.csv', 'text/csv;charset=utf-8');
  };

  const saveCustomBuffer = () => {
    if (!saveName.trim()) return;
    const preset: Preset = {
      id: `custom_${Date.now()}`, name: saveName.trim(), finalVolume_L: toSI(s.volume),
      source: 'User Custom Buffer (Local Storage)', components: s.components.map(c => toMixture(c, s.workingTemp_C)),
    };
    const updated = [...customPresets, preset];
    setCustomPresets(updated); saveLibrary(CUSTOM_BUFFERS, updated);
    setShowSaveDialog(false); setSaveName('');
  };
  const deleteCustomBuffer = (id: string) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated); saveLibrary(CUSTOM_BUFFERS, updated);
  };
  const loadPreset = (id: string) => {
    const preset = [...PRESETS, ...customPresets].find(item => item.id === id);
    if (!preset) return;
    set({
      volume: { value: preset.finalVolume_L >= 1 ? preset.finalVolume_L : preset.finalVolume_L * 1000, unit: preset.finalVolume_L >= 1 ? 'L' : 'mL' },
      components: preset.components.map(fromMixture),
    });
    setChecked({});
  };

  const lookup = async (index: number) => {
    const component = s.components[index];
    if (!component?.query.trim()) return;
    setLookupStatus('Looking up molecular weight…');
    try {
      const response = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(component.query)}/property/MolecularWeight/JSON`);
      if (!response.ok) throw new Error(`PubChem returned ${response.status}`);
      const payload = await response.json() as { PropertyTable?: { Properties?: { MolecularWeight?: number | string }[] } };
      const mw = Number(payload.PropertyTable?.Properties?.[0]?.MolecularWeight);
      if (!(mw > 0)) throw new Error('No molecular weight found');
      update(index, { name: component.query.trim(), mw });
      setLookupStatus(`PubChem molecular weight: ${mw} g/mol`);
    } catch (error) {
      setLookupStatus(error instanceof Error ? `Lookup failed: ${error.message}` : 'Lookup failed');
    }
  };

  const recipeJson = useMemo(() => JSON.stringify({
    id: saveName.trim() ? saveName.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'custom_recipe',
    name: saveName.trim() || 'My Custom Buffer',
    finalVolume_L: toSI(s.volume), source: 'Community Contribution',
    components: s.components.map(c => toMixture(c, s.workingTemp_C)),
  }, null, 2), [s, saveName]);

  const addComponent = () => set({ components: [...s.components, { ...DEFAULT_COMPONENT, id: newId(), query: '', name: 'New component' }] });
  const removeComponent = (index: number) => set({ components: s.components.filter((_, i) => i !== index) });
  const setKind = (index: number, kind: EditorComponent['kind']) => update(index, { kind });
  const toggleChecked = (key: string) => setChecked(prev => ({ ...prev, [key]: !prev[key] }));

  return {
    s, set, update, shareUrl, calculation, copyText, exportCsv, lookup, lookupStatus,
    customPresets, loadPreset, saveCustomBuffer, deleteCustomBuffer,
    showSaveDialog, setShowSaveDialog, saveName, setSaveName, showContributeModal, setShowContributeModal, recipeJson,
    addComponent, removeComponent, setKind, checked, toggleChecked,
  };
}
export type BuffersModel = ReturnType<typeof useBuffersModel>;
```

- [ ] **Step 7: Replace `View.tsx` with the composition**

```tsx
import { Quantity } from '@/app/components/Quantity';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import { PRESETS, useBuffersModel } from './BuffersModel';
import { ComponentRow } from './components/ComponentRow';
import { ContributeModal } from './components/ContributeModal';
import { PresetBar } from './components/PresetBar';
import { RecipeSheet } from './components/RecipeSheet';
import { SCIENCE } from './science';

export default function View() {
  const m = useBuffersModel();
  const { s, calculation } = m;

  return (
    <>
      <ToolLayout
        icon="🧪"
        title="Buffer & Media Recipes"
        blurb="Build recipes from exact chemical forms, solids and liquid stocks with automated unit-safe solving."
        wide={true}
        mobileResultSummary={
          calculation.error ? (
            <span class="font-semibold text-rose-700 dark:text-rose-400">{calculation.error}</span>
          ) : (
            <span><strong>{calculation.result?.rows.length} lines</strong> for <strong class="font-mono text-accent-700 dark:text-accent-300">{s.volume.value} {s.volume.unit}</strong></span>
          )
        }
        inputs={
          <div class="space-y-4">
            <PresetBar
              presets={PRESETS} customPresets={m.customPresets} saveName={m.saveName} showSaveDialog={m.showSaveDialog}
              onSaveName={m.setSaveName} onShowSave={m.setShowSaveDialog} onSave={m.saveCustomBuffer}
              onDelete={m.deleteCustomBuffer} onLoad={m.loadPreset} onContribute={() => m.setShowContributeModal(true)}
            />
            <Quantity id="buffer-volume" label="Final Volume" value={s.volume} units={['L', 'mL']} onChange={volume => m.set({ volume })} />
            <div class="space-y-3">
              <div class="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>Recipe Components ({s.components.length})</span>
              </div>
              {s.components.map((component, index) => (
                <ComponentRow
                  key={component.id} component={component} index={index} total={s.components.length}
                  onChange={patch => m.update(index, patch)} onKind={kind => m.setKind(index, kind)}
                  onRemove={() => m.removeComponent(index)} onLookup={() => void m.lookup(index)}
                />
              ))}
            </div>
            <button
              type="button" onClick={m.addComponent}
              class="w-full rounded-xl border-2 border-dashed border-slate-300 p-3 text-xs font-semibold text-slate-600 transition hover:border-accent-500 hover:text-accent-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-accent-400"
            >+ Add Component</button>
            {m.lookupStatus && <p role="status" class="px-1 text-xs text-slate-500 dark:text-slate-400">{m.lookupStatus}</p>}
          </div>
        }
        results={
          calculation.result ? (
            <RecipeSheet result={calculation.result} components={s.components} volume={s.volume} workingTemp_C={s.workingTemp_C} checked={m.checked} onToggle={m.toggleChecked} />
          ) : (
            <p role="alert" class="p-4 text-red-600 dark:text-red-400">{calculation.error}</p>
          )
        }
        actions={
          <div class="flex flex-wrap items-center gap-2">
            <ActionBar onCopy={() => m.copyText} shareUrl={m.shareUrl} />
            <button
              type="button" onClick={m.exportCsv}
              class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >📥 Export Recipe CSV</button>
          </div>
        }
        science={<SciencePanel science={SCIENCE} />}
      />
      {m.showContributeModal && (
        <ContributeModal recipeJson={m.recipeJson} title={m.saveName || s.components[0]?.name || 'New Buffer'} onClose={() => m.setShowContributeModal(false)} />
      )}
    </>
  );
}
```

The old Henderson–Hasselbalch helper card is intentionally gone here: Task 6 replaces it with the buffer row. (`henderson.ts` stays for its tests.)

- [ ] **Step 8: Run the preserved-behaviour suite**

Run: `npx vitest run tests/app/buffers-modal.test.tsx tests/app/calculators.test.tsx tests/core/buffers.test.ts tests/app/buffers-state.test.ts && npm run typecheck && npm run lint`
Expected: PASS. `buffers-modal` clicks `Stock`/`Solid` (now `aria-pressed` buttons from `Segmented`, same names); `calculators` still finds `605.7 mg`, the `Chemical search` / `Molecular weight` / `Additional waters` labels and the TAE `1.14 mL` row. Fix the refactor, not the tests, if any fail.

- [ ] **Step 9: Commit**

```bash
git add src/tools/buffers
git commit -m "refactor(buffers): split the view into model and components, run on solveMixture

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Buffer rows, pH check, conditions bar and "Set pH…"

**Files:**
- Create: `src/tools/buffers/components/PhCheck.tsx`, `src/tools/buffers/components/BufferFields.tsx`, `src/tools/buffers/components/ConditionsBar.tsx`
- Modify: `components/ComponentRow.tsx`, `BuffersModel.tsx`, `View.tsx`
- Test: `tests/app/buffers-v2.test.tsx`

**Interfaces:**
- Consumes: `BufferReport`, `MixtureResult` (Task 3); `BufferEditor`, `EditorComponent`, `defaultBuffer`, `mixDefaults` (Task 4); `BUFFER_SYSTEMS`, `findSystem`, `matchForm` (Task 1); `Segmented`, `NumberField`, `fieldClass`, `labelClass` (Task 5).
- Produces: `PhCheck`, `BufferFields`, `ConditionsBar`; model handlers `setSystem(index, systemId)`, `setBuffer(index, patch)`, `setMethod(index, method)`, `makeBuffer(index)`; `setKind` extended to `'buffer'`.

- [ ] **Step 1: Write the failing UI tests**

Create `tests/app/buffers-v2.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/preact';
// Select change events must come from the DOM helper (preact/compat remaps them to input).
import { fireEvent as domFire } from '@testing-library/dom';
import { route } from '@/app/router';
import BuffersView from '@/tools/buffers/View';

const results = () => screen.getByTestId('buffer-results').textContent ?? '';

beforeEach(() => { route.value = { name: 'tool', toolId: 'buffers' }; });

describe('buffer rows', () => {
  it('turns the first row into a Tris buffer made to pH 8: weigh the base, add HCl', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    expect(screen.getByLabelText('Buffer system')).toBeTruthy();
    expect(results()).toMatch(/Tris base/);
    expect(results()).toMatch(/605\.7 mg/);
    expect(results()).toMatch(/HCl 1 M/);
    expect(screen.getByTestId('ph-check').textContent).toMatch(/pH 8 at 25 °C/);
  });

  it('a premade pH-adjusted stock is just a dilution', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Premade stock' }));
    expect(results()).toMatch(/Tris \(1 M, pH 8\)/);
    expect(results()).toMatch(/(?:^|[^\d.])5(?:\.0+)? mL/);
    expect(results()).not.toMatch(/HCl|NaOH/);
  });

  it('warns when the pH was set at 25 °C but the working temperature is 4 °C, and offers to adjust at 4 °C', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    fireEvent.input(screen.getByLabelText('Working temperature (°C)'), { target: { value: '4' } });
    fireEvent.input(screen.getByLabelText('pH measured at (°C)'), { target: { value: '25' } });
    const check = screen.getByTestId('ph-check');
    expect(check.textContent).toMatch(/pH 8 at 25 °C → pH 8\.5[89] at 4 °C/);
    fireEvent.click(within(check).getByRole('button', { name: /Adjust at 4 °C instead/ }));
    expect(screen.getByTestId('ph-check').textContent).toMatch(/pH 8 at 4 °C/);
    expect(screen.getByTestId('ph-check').textContent).not.toMatch(/→/);
  });

  it('switches to mixing the acid and base forms for phosphate', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    domFire.change(screen.getByLabelText('Buffer system'), { target: { value: 'phosphate' } });
    domFire.change(screen.getByLabelText('Method'), { target: { value: 'mix-forms' } });
    expect(results()).toMatch(/NaH₂PO₄/);
    expect(results()).toMatch(/Na₂HPO₄/);
    expect(results()).not.toMatch(/HCl|NaOH/);
  });

  it('shows a message, not a crash, when the pH field is cleared (review focus 1)', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    fireEvent.input(screen.getByLabelText('Target pH'), { target: { value: '' } });
    expect(screen.getByRole('alert').textContent).toMatch(/pH and temperature must be numbers/);
    fireEvent.input(screen.getByLabelText('Target pH'), { target: { value: '8' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns, in the sheet and on the row, when the pH is far from every pKa', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    fireEvent.input(screen.getByLabelText('Target pH'), { target: { value: '3' } });
    expect(screen.getByLabelText('Warnings').textContent).toMatch(/barely buffers/);
    expect(screen.getByTestId('ph-check').textContent).toMatch(/barely buffers|useful range/);
  });

  it('keeps unique checkbox state for the two lines a buffer row produces (review focus 5)', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: 'Buffer' }));
    // The ionic-strength toggle is also a checkbox, so look only inside the weigh-out list.
    const list = () => within(screen.getByLabelText('Weigh-out list')).getAllByRole('checkbox') as HTMLInputElement[];
    expect(list()).toHaveLength(2);
    fireEvent.click(list()[0]!);
    expect(list()[0]!.checked).toBe(true);
    expect(list()[1]!.checked).toBe(false);
  });
});

describe('Set pH… on a matching solid row', () => {
  it('converts the default Tris-base row to a buffer with the Tris-base form and the same concentration', () => {
    render(<BuffersView />);
    fireEvent.click(screen.getByRole('button', { name: /Set pH/ }));
    expect(screen.getByLabelText('Buffer system')).toBeTruthy();
    expect((screen.getByLabelText('Target concentration') as HTMLInputElement).value).toBe('10');
    expect(results()).toMatch(/Tris base/);
  });

  it('is not offered for a non-buffer chemical', () => {
    render(<BuffersView />);
    fireEvent.input(screen.getByLabelText('Chemical search'), { target: { value: 'Sodium Chloride' } });
    fireEvent.click(screen.getByRole('button', { name: /Sodium Chloride \(NaCl\)/ }));
    expect(screen.queryByRole('button', { name: /Set pH/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/app/buffers-v2.test.tsx`
Expected: FAIL (no `Buffer` button).

- [ ] **Step 3: Create `components/PhCheck.tsx`**

```tsx
import type { BufferReport } from '@/core/buffers/mixture';

const ph = (v: number) => String(Number(v.toFixed(2)));

export function PhCheck({ report, workingTemp_C, ionicStrength, onAdjustAtWorking }: {
  report?: BufferReport; workingTemp_C: number; ionicStrength: number; onAdjustAtWorking?: () => void;
}) {
  if (!report) return null;
  const sameTemp = report.setTemp_C === workingTemp_C;
  const changed = !sameTemp || Math.abs(report.drift) >= 0.005;
  const warn = Math.abs(report.drift) > 0.1;
  return (
    <div
      data-testid="ph-check"
      role="status"
      class={`space-y-1 rounded-lg border px-3 py-2 text-xs ${warn || report.outOfRange
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'}`}
    >
      <p>
        <strong class="mono">pH {ph(report.pHSet)} at {report.setTemp_C} °C</strong>
        {changed && <strong class="mono"> → pH {ph(report.pHWorking)} at {workingTemp_C} °C</strong>}
        <span class="mono"> · I = {Number(ionicStrength.toPrecision(2))} M</span>
      </p>
      {warn && (
        <p>
          The mixture will read {report.drift > 0 ? 'higher' : 'lower'} by {Math.abs(report.drift).toFixed(2)} pH at the working temperature.
          {onAdjustAtWorking && (
            <button type="button" onClick={onAdjustAtWorking} class="ml-2 rounded-md border border-amber-400 px-2 py-0.5 font-semibold hover:bg-amber-100 dark:border-amber-600 dark:hover:bg-amber-900/40">
              Adjust at {workingTemp_C} °C instead
            </button>
          )}
        </p>
      )}
      {report.outOfRange && <p>pH {ph(report.pHSet)} is outside this buffer's useful range (more than 1.5 pH units from every pKa): it barely buffers.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/BufferFields.tsx`**

```tsx
import type { ComponentChildren } from 'preact';
import { BUFFER_SYSTEMS, findSystem } from '@/core/buffers/pka';
import type { BufferReport } from '@/core/buffers/mixture';
import type { BufferEditor, EditorComponent } from '../state';
import { NumberField, Segmented, fieldClass, labelClass } from './ui';
import { PhCheck } from './PhCheck';

export interface BufferFieldsProps {
  component: EditorComponent; index: number; workingTemp_C: number;
  report?: BufferReport; ionicStrength: number;
  onBuffer: (patch: Partial<BufferEditor>) => void;
  onMethod: (method: BufferEditor['method']) => void;
}

export function BufferFields({ component, index, workingTemp_C, report, ionicStrength, onBuffer, onMethod }: BufferFieldsProps) {
  const b = component.buffer!;
  const system = findSystem(b.systemId) ?? BUFFER_SYSTEMS[0]!;
  const suffix = index === 0 ? '' : ` ${index + 1}`;
  const canMix = new Set(system.forms.map(f => f.protonsRemoved)).size > 1;
  const formOptions = system.forms.map(f => <option key={f.id} value={f.id}>{f.label}</option>);
  const select = (label: string, value: string, onChange: (v: string) => void, children: ComponentChildren) => (
    <div>
      <span class={labelClass}>{label}</span>
      <select aria-label={`${label}${suffix}`} value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)} class={`${fieldClass} py-1.5 text-xs`}>{children}</select>
    </div>
  );

  return (
    <div class="space-y-2.5 pt-0.5">
      <Segmented<BufferEditor['mode']>
        label={`Buffer mode${suffix}`}
        value={b.mode}
        options={[{ value: 'design', label: 'Make to pH' }, { value: 'premade', label: 'Premade stock' }]}
        onChange={mode => onBuffer({ mode })}
      />

      {b.mode === 'premade' ? (
        <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <NumberField label="Stock concentration" ariaLabel={`Premade stock concentration${suffix}`} value={b.stockConc} onValue={stockConc => onBuffer({ stockConc })} />
          {select('Stock unit', b.stockUnit, v => onBuffer({ stockUnit: v as 'M' | 'mM' }), <><option>M</option><option>mM</option></>)}
          <NumberField label="Stock pH" ariaLabel={`Stock pH${suffix}`} value={b.stockPH} onValue={stockPH => onBuffer({ stockPH })} />
          <NumberField label="pH measured at (°C)" ariaLabel={`Stock pH temperature (°C)${suffix}`} value={b.stockTemp_C} onValue={stockTemp_C => onBuffer({ stockTemp_C })} />
        </div>
      ) : (
        <div class="space-y-2.5">
          <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <NumberField label="Target pH" ariaLabel={`Target pH${suffix}`} value={b.pH} onValue={pH => onBuffer({ pH })} />
            <div>
              <span class={labelClass}>pH measured at (°C)</span>
              <input
                aria-label={`pH measured at (°C)${suffix}`}
                type="number" step="any"
                placeholder={String(workingTemp_C)}
                value={b.pHTemp_C ?? ''}
                onInput={e => { const v = (e.target as HTMLInputElement).value; onBuffer({ pHTemp_C: v === '' ? undefined : Number(v) }); }}
                class={`${fieldClass} mono py-1.5 text-xs`}
              />
            </div>
            {select('Method', b.method, v => onMethod(v as BufferEditor['method']), <>
              <option value="titrate">Adjust with acid / base</option>
              <option value="mix-forms" disabled={!canMix}>Mix acid and base forms</option>
            </>)}
            {b.method === 'titrate' && <NumberField label="Titrant (M)" ariaLabel={`Titrant concentration (M)${suffix}`} value={b.titrantConc_M} onValue={titrantConc_M => onBuffer({ titrantConc_M })} />}
          </div>
          {b.method === 'titrate'
            ? select('Starting form', b.formId, v => onBuffer({ formId: v }), formOptions)
            : <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {select('Acid form', b.formId, v => onBuffer({ formId: v }), formOptions)}
              {select('Base form', b.formId2 ?? b.formId, v => onBuffer({ formId2: v }), formOptions)}
            </div>}
        </div>
      )}

      <PhCheck
        report={report}
        workingTemp_C={workingTemp_C}
        ionicStrength={ionicStrength}
        onAdjustAtWorking={b.mode === 'design' && b.pHTemp_C !== undefined ? () => onBuffer({ pHTemp_C: undefined }) : undefined}
      />
    </div>
  );
}
```


- [ ] **Step 5: Create `components/ConditionsBar.tsx`**

```tsx
import { Quantity, type QValue } from '@/app/components/Quantity';
import { NumberField } from './ui';

export function ConditionsBar({ volume, workingTemp_C, ionicCorrection, onVolume, onTemp, onIonic }: {
  volume: QValue; workingTemp_C: number; ionicCorrection: boolean;
  onVolume: (v: QValue) => void; onTemp: (t: number) => void; onIonic: (on: boolean) => void;
}) {
  return (
    <div class="grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-3">
      <Quantity id="buffer-volume" label="Final Volume" value={volume} units={['L', 'mL']} onChange={onVolume} />
      <NumberField label="Working temperature (°C)" value={workingTemp_C} onValue={onTemp} />
      <label class="flex items-center gap-2 pb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
        <input type="checkbox" aria-label="Ionic-strength correction" checked={ionicCorrection} onChange={e => onIonic((e.target as HTMLInputElement).checked)} class="h-4 w-4 accent-accent-600" />
        Ionic-strength correction
      </label>
    </div>
  );
}
```

- [ ] **Step 6: Wire buffer rows into `ComponentRow.tsx`**

Make these exact changes:

1. Imports: add `BUFFER_SYSTEMS, matchForm` from `@/core/buffers/pka`, `BufferReport` from `@/core/buffers/mixture`, `BufferEditor` from `../state`, and `BufferFields` from `./BufferFields`.
2. Props: add `workingTemp_C: number; report?: BufferReport; ionicStrength: number; onSystem: (systemId: string) => void; onBuffer: (patch: Partial<BufferEditor>) => void; onMethod: (m: BufferEditor['method']) => void; onMakeBuffer: () => void;`.
3. The kind selector becomes three-way: `Segmented<EditorComponent['kind']>` with options Solid / Stock / Buffer and `value={component.kind}`.
4. Header summary pill: for `kind === 'buffer'` show `` `${component.buffer?.mode === 'premade' ? 'premade stock' : `pH ${component.buffer?.pH}`}` ``.
5. Left column of the search/target grid: when `component.kind === 'buffer'` render, instead of the chemical search, a system select (`aria-label={`Buffer system${suffix}`}`, label text "Buffer system", `value={component.buffer?.systemId}`, options from `BUFFER_SYSTEMS`, `onChange` → `onSystem(value)`); otherwise the existing search block.
6. Target unit select: for buffers render only `<option>M</option><option>mM</option>`.
7. Below the grid: `component.kind === 'buffer'` → `<BufferFields …/>`; `solid` → existing fields **plus**, when `matchForm(component.name)` is defined and `component.target.unit` is `M` or `mM`, a small button under the MW grid: `<button type="button" onClick={onMakeBuffer} class="text-xs font-medium text-accent-600 hover:underline dark:text-accent-400" aria-label="Set pH for this component">Set pH…</button>`; `stock` → existing fields.
8. Make the stock-row labels unique per row: change `aria-label="Stock Conc"` → `` aria-label={`Stock Conc${suffix}`} ``, and likewise `Stock Unit` and `Density (g/mL, opt)` (row 1 keeps today's names because `suffix` is empty).

- [ ] **Step 7: Extend the model and view**

In `BuffersModel.tsx` add (imports: `findSystem`, `matchForm` from `@/core/buffers/pka`; `defaultBuffer`, `mixDefaults`, `type BufferEditor` from `./state`):

```tsx
  const bufferOf = (index: number) => s.components[index]?.buffer ?? defaultBuffer();
  const setBuffer = (index: number, patch: Partial<BufferEditor>) => update(index, { buffer: { ...bufferOf(index), ...patch } });
  const setSystem = (index: number, systemId: string) => {
    const system = findSystem(systemId);
    if (!system) return;
    update(index, { name: system.name, query: system.name, buffer: { ...defaultBuffer(systemId), mode: bufferOf(index).mode } });
  };
  const setMethod = (index: number, method: BufferEditor['method']) => {
    const system = findSystem(bufferOf(index).systemId);
    setBuffer(index, method === 'mix-forms' && system ? { method, ...mixDefaults(system) } : { method });
  };
  const makeBuffer = (index: number) => {
    const hit = matchForm(s.components[index]?.name ?? '');
    if (!hit) return;
    update(index, {
      kind: 'buffer', name: hit.system.name, query: hit.system.name,
      buffer: { ...defaultBuffer(hit.system.id), formId: hit.form.id },
    });
  };
  const setKind = (index: number, kind: EditorComponent['kind']) => {
    const c = s.components[index];
    if (!c) return;
    if (kind !== 'buffer') return update(index, { kind });
    const hit = matchForm(c.name);
    const system = hit?.system ?? findSystem('tris')!;
    update(index, {
      kind: 'buffer', name: system.name, query: system.name,
      target: { value: c.target.value, unit: c.target.unit === 'M' ? 'M' : 'mM' },
      buffer: { ...defaultBuffer(system.id), ...(hit ? { formId: hit.form.id } : {}) },
    });
  };
```

Remove the earlier simple `setKind` from Task 5 and add `setBuffer, setSystem, setMethod, makeBuffer` to the returned object. In `View.tsx`: pass the new props to each `ComponentRow` (`workingTemp_C={s.workingTemp_C}`, `report={calculation.result?.buffers.find(b => b.componentIndex === index)}`, `ionicStrength={calculation.result?.ionicStrength ?? 0}`, `onSystem={id => m.setSystem(index, id)}`, `onBuffer={p => m.setBuffer(index, p)}`, `onMethod={x => m.setMethod(index, x)}`, `onMakeBuffer={() => m.makeBuffer(index)}`), and replace the standalone `<Quantity id="buffer-volume" … />` with:

```tsx
<ConditionsBar
  volume={s.volume} workingTemp_C={s.workingTemp_C} ionicCorrection={s.ionicCorrection}
  onVolume={volume => m.set({ volume })} onTemp={workingTemp_C => m.set({ workingTemp_C })} onIonic={ionicCorrection => m.set({ ionicCorrection })}
/>
```

Note: when the working temperature is cleared the core throws `Working temperature must be a number`, which the model already turns into the red alert.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/app/buffers-v2.test.tsx tests/app/buffers-modal.test.tsx tests/app/calculators.test.tsx tests/app/buffers-state.test.ts tests/core && npm run typecheck && npm run lint`
Expected: PASS. If `getByRole('button', { name: 'Stock' })` in `buffers-modal` now matches two buttons (no: with one row there is one `Stock` toggle; the buffer-only `Premade stock` button does not exist unless a buffer row is shown), nothing to change. If a v2 test fails on a formatting detail (`5 mL` vs `5.00 mL`) loosen only that regex.

- [ ] **Step 9: Manual check in the browser**

Run: `npm run dev`, open `/#/t/buffers`. Verify at 390 px and desktop, light and dark: add a Buffer row, switch Premade/Make to pH, set working temperature 4 and pH measured at 25, see the amber drift line and the "Adjust at 4 °C instead" button; load the TBS preset and click `Set pH…` on the Tris row; no horizontal scroll. Report what you saw; do not claim visual quality you did not look at.

- [ ] **Step 10: Commit**

```bash
git add src/tools/buffers tests/app/buffers-v2.test.tsx
git commit -m "feat(buffers): buffer rows with premade/titrate/mix-forms, pH-at-temperature check and Set pH

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Science panel, assurance, e2e and roadmap

**Files:**
- Modify: `src/tools/buffers/science.ts`, `src/tools/assurance.ts` (the `buffers` entry), `docs/roadmap.md`, `docs/superpowers/specs/2026-10-01-buffer-tool-v2-design.md`
- Create: `tests/e2e/buffers.spec.ts`

**Interfaces:** consumes the finished tool; produces documentation and the e2e gate.

- [ ] **Step 1: Update `science.ts`**

Replace the `formulas`, `assumptions` and `references` arrays so they cover the new methods (keep the existing recipe formulas):

```ts
  formulas: [
    'solid mass (g) = target (mol/L) × final volume (L) × formula MW (g/mol)',
    '% w/v mass (g) = target (%) × final volume (mL) / 100',
    'stock volume = target concentration × final volume / stock concentration',
    'fraction of species k = ∏(j≤k) 10^(pH − pKa′_j) / Σ(…); m = Σ k·f_k is the mean number of protons removed',
    'pKa′ = pKa(25 °C) + (dpKa/dT)(T − 25 °C) + (2z − 1)·A·f(I); f(I) = √I/(1+√I) − 0.3·I, A ≈ 0.511 at 25 °C, z = charge of the acid species',
    'titrant equivalents per mole of buffer = m(pH) − (protons removed in the weighed form); positive = base, negative = acid',
    'mixing two forms: x(base) = (m − s_acid)/(s_base − s_acid)',
    'pH at the working temperature: solve Σ f_k(pH, pKa′(T_use))·z_k = Q, with the net charge Q fixed at preparation',
  ],
  assumptions: [
    /* keep the four existing assumptions, then add: */
    'Activity coefficients follow the Davies equation (valid to about 0.5 M ionic strength and 0–50 °C); above that the pH prediction is flagged as approximate.',
    'Counter-ions are monovalent (Na⁺ or Cl⁻) and ionic strength counts the buffer species plus the listed salts (NaCl, KCl, NH₄Cl, MgCl₂, CaCl₂, MgSO₄, (NH₄)₂SO₄, sodium acetate); other components are listed as not counted.',
    'Water ionisation is ignored, so a pH more than about 1.5 units from every pKa is not a buffer and the working-temperature prediction is unreliable there.',
    'Temperature dependence is linear about 25 °C; steps without a published coefficient are not temperature-corrected.',
    'Titrant volumes are estimates; finish with a calibrated pH meter at the temperature the pH is specified for.',
  ],
  references: [
    /* keep the three existing references, then add (no url unless you have opened and confirmed it): */
    { text: 'Ferguson et al. (1980), Anal. Biochem. 104:300–310, temperature dependence of buffer pKa' },
    { text: 'Davies (1938), J. Chem. Soc. 2093, ionic-strength activity equation' },
    { text: 'Sambrook & Russell, Molecular Cloning, phosphate buffer tables (check for 0.1 M pH 7.0 ≈ 61 % Na₂HPO₄)' },
  ],
  verified: '2026-10-01',
```

Before saving, open each added reference and confirm title, volume and pages; if one cannot be confirmed, remove it rather than leaving an unverified citation.

- [ ] **Step 2: Update the assurance entry**

In `src/tools/assurance.ts`, replace the `buffers:` line with:

```ts
  buffers: { status: 'reference-tested', reviewed: '2026-10-01', scope: 'Buffer recipes from declared stocks, solids and hydrate forms, plus buffer pH design (titrate or mix acid and base forms), temperature-dependent pKa, Davies ionic-strength correction and the predicted pH at a working temperature.', verification: 'Reference fixtures: Tris pH 8.0 at 25 °C reads 8.588 at 4 °C, 0.1 M phosphate pH 7.0 is about 61 % dibasic as in the standard table, HEPES and Tris titrant equivalents from closed-form speciation, Davies and speciation identities, plus audited supplier molecular-weight fixtures. Software checks do not replace calibrating a pH meter.' },
```

Run `npx vitest run tests/app/assurance.test.tsx` and keep it green (the reviewed date constant is local to the file; the literal here is intentional).

- [ ] **Step 3: Write the e2e test**

Create `tests/e2e/buffers.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const theme of ['light', 'dark'] as const) {
  test(`buffers: designing a Tris buffer shows the pH check and passes axe (${theme})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(t => localStorage.setItem('bb.theme', t), theme);
    await page.goto('/#/t/buffers');
    await page.getByRole('button', { name: 'Buffer', exact: true }).click();
    await page.getByLabel('Working temperature (°C)').fill('4');
    await page.getByLabel('pH measured at (°C)').fill('25');
    await expect(page.getByTestId('ph-check')).toContainText(/pH 8 at 25 °C → pH 8\.5\d at 4 °C/);
    await expect(page.getByTestId('buffer-results')).toContainText(/HCl 1 M/);
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 140)}`)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('buffers: a premade HEPES stock is a plain dilution', async ({ page }) => {
  await page.goto('/#/t/buffers');
  await page.getByRole('button', { name: 'Buffer', exact: true }).click();
  await page.getByLabel('Buffer system').selectOption('hepes');
  await page.getByRole('button', { name: 'Premade stock' }).click();
  await expect(page.getByTestId('buffer-results')).toContainText(/HEPES \(1 M, pH 7\.5\)/);
  await expect(page.getByTestId('buffer-results')).not.toContainText(/NaOH|HCl/);
});
```

The mobile and a11y suites already include `buffers` (`tests/e2e/tools.ts`); they exercise the default screen. This new spec covers the buffer row.

- [ ] **Step 4: Update docs**

- `docs/roadmap.md`: add a section `## Buffer tool v2 (2026-10-01)` with the delivered items (buffer rows, pH at working temperature, Davies correction, 13 systems, Set pH…) and the not-done items (buffer-capacity plot, multi-buffer optimisation, converting presets once they carry a pH, a verified source for every dpKa/dT flagged `temperatureData: false`).
- Spec: change the file list to match what was built (`speciation.ts` holds ionic strength and speciation together; `henderson.ts` is kept because an existing test pins it, with a parity test), and resolve the open point: presets are not converted (they carry no pH); the `Set pH…` button on a matching row is the route.

- [ ] **Step 5: Full verification**

Run, and read the output of each:

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:coverage && npm run build
npx playwright test tests/e2e/buffers.spec.ts tests/e2e/a11y.spec.ts tests/e2e/mobile.spec.ts tests/e2e/contrast.spec.ts
```

Expected: all green; coverage floors in `vitest.config.ts` still met (the new core files are fully exercised by Tasks 1–3). If an e2e run is not possible in the environment, say so and give the unit results instead of claiming e2e passed.

- [ ] **Step 6: Commit**

```bash
git add src/tools/buffers/science.ts src/tools/assurance.ts tests/e2e/buffers.spec.ts docs
git commit -m "docs(buffers): methods, assurance, e2e and roadmap for buffer tool v2

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:** recipe-first rows and the three kinds (Tasks 3–6); premade pH'd stock as a plain dilution (Task 3 `premade`, Task 6 test); design with titrate and mix-forms (Task 3); pH-at-working-temperature check with the one-click fix (Tasks 3, 6); ionic strength with a toggle and shared global iteration (Tasks 2, 3, 6 ConditionsBar); 13 systems with sources and temperature flags (Task 1); single-column layout, split view, saved-buffer compatibility (Tasks 4–5); testing with sourced reference values (Tasks 1–3, 7); assurance entry (Task 7). Open points resolved in Task 1 Step 4 (sources) and the Global Constraints (presets not converted; `Set pH…` instead).

**Placeholder scan:** the only `/* paste … */` blocks are the two mechanical moves in Task 5 Step 3, each naming exact source line ranges and the exact substitutions; everything else is complete code. Task 1 Step 4 and Task 7 Step 1 are explicit verification steps, not deferred work.

**Type consistency:** `BufferReport.name` is added in Task 3 and used in Task 4 `phLines`; `MixtureRow.componentIndex`/`role` are used by `RecipeSheet` (Task 5); `defaultBuffer`/`mixDefaults`/`toMixture`/`fromMixture`/`isMixtureComponent` signatures match between Task 4 and the model in Tasks 5–6; `setKind` is defined in Task 5 and replaced (not duplicated) in Task 6 Step 7; `ComponentRow` props grow in Task 6 Step 6 and `View.tsx` passes them in Step 7.
