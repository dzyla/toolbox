# Guided Plate Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plate-reader route and tab maze with a reviewable import-to-export workflow that never fabricates fit results or silently excludes data.

**Architecture:** Retain parsing/statistical primitives in `src/core/plates/reader.ts`; extract immutable analysis records, review decisions, fit adapters, and exports. The dedicated reader page owns the six-step workflow; Plate Layout remains distinct.

**Tech Stack:** TypeScript, Preact, Vitest, Testing Library, existing `src/core/fitting` 4PL/linear fits.

**Spec:** `docs/superpowers/specs/2026-09-07-scientific-workbench-gold-standard-design.md`

## Global Constraints

- Raw values are immutable; exclusions are review records with reasons.
- Min/max baseline is exploratory only and cannot silently stand in for controls.
- EC50/IC50 is shown only after actual converged diagnostics.
- Exports include raw values, layout, settings, decisions, QC, model/version, and findings.
- `plate-reader` loads `src/tools/plate-reader/View.tsx`; `plate` remains layout/design.

---

### Task 1: Correct route and remove fabricated curve statistics

**Files:** Modify `src/tools/registry.ts`, `src/core/plates/reader.ts`, `src/tools/plate-reader/View.tsx`, `science.ts`; test `tests/core/plate-reader.test.ts`, `tests/app/plate-reader.test.tsx`, `tests/e2e/smoke.spec.ts`.

**Interfaces:** `DoseResponseSeries` gains `fitStatus: 'not-fit'`; it has no fake EC50, hill slope, or R².

- [ ] **Step 1: Write route/statistics regressions.**

```ts
expect(TOOLS.find(t => t.id === 'plate-reader')!.load).toImportDefault('src/tools/plate-reader/View');
expect(computeDoseResponseSeries(groups)[0]!.fitStatus).toBe('not-fit');
expect(computeDoseResponseSeries(groups)[0]!.rSquared).toBeUndefined();
```

- [ ] **Step 2: Run `npm test -- tests/core/plate-reader.test.ts tests/app/plate-reader.test.tsx`; confirm failure.**
- [ ] **Step 3: Route to the dedicated view and replace fake fields/copy with explicit “not fitted—export or fit” state.** Update science-panel assertions to match implemented capability.
- [ ] **Step 4: Run `npm test -- tests/core/plate-reader.test.ts tests/app/plate-reader.test.tsx && npm run build`; commit `fix: route plate reader and remove fabricated fits`.**

### Task 2: Immutable import record and inspection

**Files:** Create `src/core/plates/analysis.ts`, `src/tools/plate-reader/ImportStep.tsx`, `InspectStep.tsx`; modify `reader.ts`, `View.tsx`; test `tests/core/plate-analysis.test.ts`, `tests/app/plate-reader.test.tsx`.

**Interfaces:** Produce `PlateAnalysisRecord`, `ParseFinding`, `createAnalysisRecord()`, `inspectPlate()`, and `applyAnalysis()`.

- [ ] **Step 1: Write failing duplicate/missing/non-numeric and immutability tests.**

```ts
const record = createAnalysisRecord(parsePlateData('A1,1\nA1,2\nB1,not-a-number'));
expect(inspectPlate(record.raw).findings.map(f => f.code)).toContain('DUPLICATE_WELL');
expect(applyAnalysis(record, settings).raw).toEqual(record.raw);
```

- [ ] **Step 2: Run `npm test -- tests/core/plate-analysis.test.ts`; confirm failure.**
- [ ] **Step 3: Store source text/hash, vendor/delimiter/geometry, raw wells, findings, and timestamp.** Derivations return new records. The empty reader begins at Import; demo data loads only from an explicit example control. Failed import retains previous data.
- [ ] **Step 4: Run `npm test -- tests/core/plate-analysis.test.ts tests/app/plate-reader.test.tsx`; commit `feat: add reviewable plate import workflow`.**

### Task 3: Mapping, review decisions, and QC gate

**Files:** Create `src/core/plates/review.ts`, `src/tools/plate-reader/MapStep.tsx`, `QcStep.tsx`; modify `reader.ts`, `View.tsx`; test `tests/core/plate-review.test.ts`, `tests/app/plate-reader.test.tsx`.

**Interfaces:** Produce `ReviewDecision`, `validateLayout()`, `suggestOutliers()`, `applyReview()`.

- [ ] **Step 1: Write failing incomplete-control, exploratory-baseline, and explicit-exclusion tests.**

```ts
expect(validateLayout(noPositiveControl).blockers).toContainEqual(expect.objectContaining({ code: 'MISSING_POSITIVE_CONTROL' }));
expect(applyReview(record, [{ wellId: 'D4', action: 'exclude', reason: 'bubble observed' }]).exclusions).toHaveLength(1);
expect(applyReview(record, []).exclusions).toHaveLength(0);
```

- [ ] **Step 2: Run `npm test -- tests/core/plate-review.test.ts`; confirm failure.**
- [ ] **Step 3: Implement `Import → Inspect → Map → Analyze → QC review → Results` gates.** Paint/select roles/replicates; show suggested outliers and Grubbs assumptions; remove auto-exclusion. Results remain blocked when required roles or acknowledgement are missing.
- [ ] **Step 4: Run `npm test -- tests/core/plate-review.test.ts tests/app/plate-reader.test.tsx`; commit `feat: add plate QC review decisions`.**

### Task 4: Diagnosed fits and provenance exports

**Files:** Create `src/core/plates/fitting.ts`, `export.ts`, `src/tools/plate-reader/AnalyzeStep.tsx`, `ResultsStep.tsx`, `tests/e2e/plate-reader.spec.ts`; modify `View.tsx`; tests `tests/core/plate-fitting.test.ts`, `tests/core/plate-export.test.ts`.

**Interfaces:** Produce `fitPlateDoseResponse()`, `fitPlateStandardCurve()`, `PlateFitResult`, and `exportPlateAnalysis()`.

- [ ] **Step 1: Write known-4PL and invalid-fit tests.**

```ts
expect(fitPlateDoseResponse(synthetic4pl).status).toBe('converged');
expect(fitPlateDoseResponse(synthetic4pl).parameters.ec50).toBeCloseTo(10, 1);
expect(fitPlateDoseResponse(twoConcentrations).findings[0]!.code).toBe('INSUFFICIENT_LEVELS');
```

- [ ] **Step 2: Run `npm test -- tests/core/plate-fitting.test.ts`; confirm failure.**
- [ ] **Step 3: Adapt `fit4PL`/`fitLinear` with preconditions.** Require five valid concentration levels for 4PL, reject invalid log input, catch numerical failures, and expose parameters/residuals/R²/bounds/convergence/calibration interval only for a converged result. Mark quantified out-of-range samples extrapolated.
- [ ] **Step 4: Implement JSON/CSV/report export with raw source hash, layout, settings, review log, QC, model/version, and findings.** Label every result raw/derived/exploratory/review-required/fit-failed/converged.
- [ ] **Step 5: Run `npm test -- tests/core/plate-*.test.ts tests/app/plate-reader.test.tsx && npm run e2e -- tests/e2e/plate-reader.spec.ts && npm run build`; commit `feat: export traceable plate analysis records`.**
