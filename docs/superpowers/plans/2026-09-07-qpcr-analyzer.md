# qPCR / RT-qPCR Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-local, MIQE-aware qPCR/RT-qPCR Cq-table analyzer with transparent QC, normalization, and exports.

**Architecture:** Keep all parsing and numerical logic in a new framework-free `src/core/qpcr` module. The Preact view consumes that model through an explicit six-step workflow and retains all source observations and exclusion decisions. The shared science panel and export pattern carry the method/provenance into copied and downloaded results.

**Tech Stack:** TypeScript, Preact, Vitest, Testing Library, Vite, existing `ToolLayout`, `SciencePanel`, and `ActionBar` components.

**Spec:** `docs/superpowers/specs/2026-09-07-quantitative-analysis-and-chromatography-design.md`

## Global Constraints

- Run entirely in-browser; never upload imported Cq tables.
- Preserve raw values and require an explicit inclusion/exclusion decision and reason.
- Use `Cq`, not `Ct`, in user-facing scientific copy except when recognizing source headers.
- Do not report `2^-ΔΔCq` unless comparable efficiency is explicitly confirmed.
- Do not automatically infer reference-gene stability, assay validity, or biological significance.
- New core calculations need fixed expected-value tests and literature references in the tool science panel.

---

### Task 1: Core Cq parsing and normalized model

**Files:**
- Create: `src/core/qpcr/index.ts`
- Create: `tests/core/qpcr.test.ts`

**Interfaces:**
- Produces `QpcrObservation`, `QpcrImport`, `parseQpcrTable(text: string): QpcrImport`, and `mapQpcrColumns(rows, mapping): QpcrObservation[]`.
- `QpcrObservation` has `id`, `sample`, `target`, `cq`, optional replicate/condition/well fields, optional `role`, `standardQuantity`, and optional exclusion decision.

- [ ] **Step 1: Write failing parser tests**

```ts
it('recognizes Sample Name, Target Name, Ct, Well and Quantity aliases', () => {
  const imported = parseQpcrTable('Sample Name,Target Name,Ct,Well,Quantity\nS1,GAPDH,20.1,A1,100\n');
  expect(imported.observations[0]).toMatchObject({ sample: 'S1', target: 'GAPDH', cq: 20.1, well: 'A1', standardQuantity: 100 });
});
it('keeps undetermined Cq as null and reports it', () => {
  const imported = parseQpcrTable('sample\ttarget\tCq\nS1\tACTB\tUndetermined');
  expect(imported.observations[0]!.cq).toBeNull();
  expect(imported.notices.join(' ')).toMatch(/undetermined/i);
});
```

- [ ] **Step 2: Run `npm test -- --run tests/core/qpcr.test.ts` and confirm it fails because the module does not exist.**

- [ ] **Step 3: Implement delimiter detection, normalized lowercase header matching, and aliases.**

```ts
export const QPCR_HEADER_ALIASES = {
  sample: ['sample', 'sample name'], target: ['target', 'target name', 'gene'],
  cq: ['cq', 'ct', 'cp', 'c(t)'], well: ['well', 'well position'],
  quantity: ['quantity', 'starting quantity', 'standard quantity'],
} as const;
```

Return source headers, mapped headers, untouched row cells, observations, and notices. Reject tables with no mappable sample/target/Cq combination rather than fabricating values.

- [ ] **Step 4: Add tests for TSV, decimal Cq, blank Cq, nonnumeric Cq, duplicate headers, and unmapped tables; run the test file.**
- [ ] **Step 5: Commit `feat: add qPCR Cq table parser`.**

### Task 2: qPCR QC, standard curves, and relative-expression calculations

**Files:**
- Modify: `src/core/qpcr/index.ts`
- Modify: `tests/core/qpcr.test.ts`

**Interfaces:**
- Consumes `QpcrObservation[]` plus explicit `QpcrAnalysisSettings`.
- Produces `summarizeTechnicalReplicates`, `fitQpcrStandardCurve`, `computeRelativeExpression`, and `buildQpcrQc`.

- [ ] **Step 1: Write failing numerical tests.**

```ts
expect(fitQpcrStandardCurve([{ logQuantity: 0, cq: 30 }, { logQuantity: 1, cq: 26.678 }])!.efficiency).toBeCloseTo(1, 3);
expect(computeRelativeExpression({ targetCq: 24, refCqs: [20, 20], calibratorTargetCq: 26, calibratorRefCqs: [20, 20], method: 'delta-delta', comparableEfficiencyConfirmed: true }).foldChange).toBeCloseTo(4);
expect(() => computeRelativeExpression({ targetCq: 24, refCqs: [20], calibratorTargetCq: 26, calibratorRefCqs: [20], method: 'delta-delta', comparableEfficiencyConfirmed: false })).toThrow(/efficien/i);
```

- [ ] **Step 2: Run the focused tests and confirm missing exports fail.**
- [ ] **Step 3: Implement sample mean/SD/range/count; candidate technical-replicate flags; standard-curve least squares; `E = 10 ** (-1 / slope) - 1`; and 2^-ΔΔCq.**

For multiple references, use the geometric mean of reference expression factors. Implement an efficiency-corrected path as:

```ts
relative = (targetEfficiency ** (calibratorTargetCq - targetCq)) /
  geometricMean(referenceCqs.map((cq, i) => referenceEfficiencies[i]! ** (calibratorReferenceCqs[i]! - cq)));
```

Return a blocked status rather than divide by invalid inputs.

- [ ] **Step 4: Add tests for multiple reference genes, no template/no-RT controls, insufficient standards, explicit exclusion decisions, and non-comparable efficiencies; run the file.**
- [ ] **Step 5: Commit `feat: add qPCR analysis core`.**

### Task 3: qPCR science panel, export record, and tool registration

**Files:**
- Create: `src/tools/qpcr/science.ts`
- Modify: `src/tools/registry.ts`
- Modify: `tests/app/tool-registry.test.ts`

**Interfaces:**
- Produces `SCIENCE: Science` for the qPCR tool.
- Registers `{ id: 'qpcr', name: 'qPCR / RT-qPCR Analyzer', category: 'sequences', ... }` with a lazy `View` import.

- [ ] **Step 1: Write a failing registry test asserting that `findTool('qpcr')` returns a ready tool.**
- [ ] **Step 2: Run the focused registry test and confirm it fails.**
- [ ] **Step 3: Add MIQE, efficiency, ΔΔCq, and Pfaffl formulas/assumptions/reference links to `science.ts`; register the new tool.**
- [ ] **Step 4: Make the registry test pass and run lint.**
- [ ] **Step 5: Commit `feat: register qPCR analyzer`.**

### Task 4: Guided qPCR user interface and download exports

**Files:**
- Create: `src/tools/qpcr/View.tsx`
- Create: `tests/app/qpcr.test.tsx`
- Modify: `src/lib/export.ts` only if an existing download helper lacks a text/CSV method.

**Interfaces:**
- Consumes `parseQpcrTable`, `fitQpcrStandardCurve`, `computeRelativeExpression`, `buildQpcrQc`, `SCIENCE`, and `ActionBar`.
- Produces a six-step UI: Import, Map, QC, Normalize, Results, Export.

- [ ] **Step 1: Write failing component tests for import, a visible undetermined-Cq warning, an invalid ΔΔCq blocker, and an export containing raw/derived data.**

```tsx
render(<QpcrView />);
fireEvent.input(screen.getByLabelText(/Cq table/i), { target: { value: 'sample,target,Cq\nS1,GAPDH,20\n' } });
expect(screen.getByText(/1 observation/i)).toBeTruthy();
expect(screen.getByText(/map controls/i)).toBeTruthy();
```

- [ ] **Step 2: Run `npm test -- --run tests/app/qpcr.test.tsx` and confirm it fails because the view is absent.**
- [ ] **Step 3: Implement an empty initial state, CSV/TSV paste/file import, visible header mapping, role/ref/calibrator selection, reviewable exclusions, QC cards, and results.**

Do not load a realistic demo by default. Include an explicit “Load example” button only.

- [ ] **Step 4: Implement CSV and JSON downloads with source rows, mapping, roles, settings, exclusions, summaries, formula text, science text, and warnings.**
- [ ] **Step 5: Make component tests pass; run `npm run typecheck && npm run lint && npm test`.**
- [ ] **Step 6: Commit `feat: add guided qPCR analyzer`.**

### Task 5: Browser path and release verification

**Files:**
- Modify: `tests/e2e/smoke.spec.ts` or create `tests/e2e/qpcr.spec.ts`

- [ ] **Step 1: Write a failing browser test that opens `/tool/qpcr`, imports a two-row Cq table, and sees the QC step.**
- [ ] **Step 2: Run `npm run e2e -- --grep qPCR` and confirm it fails before the test/view exist.**
- [ ] **Step 3: Add only the needed accessibility labels or routing corrections to make the journey work.**
- [ ] **Step 4: Run `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`.**
- [ ] **Step 5: Commit `test: cover qPCR import workflow`.**
