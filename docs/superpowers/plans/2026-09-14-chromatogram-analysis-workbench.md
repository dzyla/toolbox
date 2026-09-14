# Chromatogram Analysis Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Run & Fractions a reviewable ÅKTA analysis workspace with trace styling, injection/fraction annotations, zoom, baselines, and multiple editable peak integrations.

**Architecture:** Extend pure import/analysis first while preserving raw ÅKTA coordinates. Extract an interactive SVG into `ChromatogramPlot`; `RunFractionsPanel` owns its review state and exports it only as derived data.

**Tech Stack:** Preact, TypeScript, Vitest, Testing Library, Playwright, Vite, Tailwind CSS, SVG.

**Spec:** `docs/superpowers/specs/2026-09-14-chromatogram-analysis-workbench-design.md`

## Global Constraints

- Preserve pasted CSV/TSV parsing and raw-versus-derived audit exports.
- Keep all laboratory data in-browser and retain original instrument coordinates.
- Keep the bare-UV detector notice, and require explicit peak acceptance.
- Integrate baseline-corrected UV using original-volume bounds; never use display offsets in analysis.
- Test each behavior red before production code.

---

### Task 1: Parse native ÅKTA fraction and injection annotations

**Files:**

- Modify: `tests/core/chromatography-import.test.ts`
- Modify: `src/core/chromatography/import.ts`

**Interfaces:**

- Produces: `ChromatogramImport.fractionEvents: FractionEvent[]` and optional `injectionVolumeMl` alongside unchanged numeric UV/traces.

- [ ] **Step 1: Write the failing test.**

```ts
it('retains sparse fraction labels and the injection coordinate', () => {
  const result = parseChromatogram([
    'Chrom.1\t\tChrom.1\t\tChrom.1\t',
    'Fraction\t\tInjection\t\tUV\t',
    'ml\tFraction\tml\tInjection\tml\tmAU',
    '7.5\t"A1"\t3.55\t\t3.5\t1',
    '8\t"A2"\t\t\t4\t3',
  ].join('\n'));
  expect(result.injectionVolumeMl).toBe(3.55);
  expect(result.fractionEvents).toEqual([{ label: 'A1', volumeMl: 7.5 }, { label: 'A2', volumeMl: 8 }]);
  expect(result.points.map(point => point.volumeMl)).toEqual([3.5, 4]);
});
```

- [ ] **Step 2: Run red verification.**

Run: `npm test -- tests/core/chromatography-import.test.ts`

Expected: FAIL because sparse text annotations and blank-valued injection records are discarded.

- [ ] **Step 3: Implement minimal parsing.** Define:

```ts
export interface FractionEvent { label: string; volumeMl: number; }
// Add to ChromatogramImport:
fractionEvents: FractionEvent[];
injectionVolumeMl?: number;
```

Classify `Fraction` and `Injection` separately from numeric ÅKTA channels. Append unquoted string fraction labels only with a finite paired axis; retain the first finite injection axis even when its marker value is blank. Exclude annotations from `traces`, include empty `fractionEvents` in generic imports, and leave generic `fractions` behavior unchanged.

- [ ] **Step 4: Run green verification.**

Run: `npm test -- tests/core/chromatography-import.test.ts`

Expected: PASS with existing bare-UV, ragged trace, and generic-fraction tests.

- [ ] **Step 5: Commit.**

Run: `git add tests/core/chromatography-import.test.ts src/core/chromatography/import.ts && git commit -m "feat: parse ÅKTA fraction and injection annotations"`

### Task 2: Add pure baseline, fraction-band, and viewport helpers

**Files:**

- Modify: `tests/core/chromatography-analysis.test.ts`
- Modify: `src/core/chromatography/analysis.ts`

**Interfaces:**

- Produces: `applyBaseline(points, mode, anchors?)`, `buildFractionBands(events, traceEndVolumeMl)`, and `constrainViewport(requested, extent)`.

- [ ] **Step 1: Write failing tests.**

```ts
it('subtracts a manually anchored linear baseline', () => {
  const baseline = applyBaseline([
    { volumeMl: 0, signalAu: 1 }, { volumeMl: 1, signalAu: 3 }, { volumeMl: 2, signalAu: 3 },
  ], 'manual-linear', { start: { volumeMl: 0, signalAu: 1 }, end: { volumeMl: 2, signalAu: 3 } });
  expect(baseline.points.map(point => point.correctedSignalAu)).toEqual([0, 1, 0]);
});

it('creates collection bands and clamps a viewport', () => {
  expect(buildFractionBands([{ label: 'A1', volumeMl: 7 }, { label: 'A2', volumeMl: 8 }], 9))
    .toEqual([{ label: 'A1', startVolumeMl: 7, endVolumeMl: 8 }, { label: 'A2', startVolumeMl: 8, endVolumeMl: 9 }]);
  expect(constrainViewport({ startVolumeMl: -1, endVolumeMl: 12 }, { startVolumeMl: 0, endVolumeMl: 10 }))
    .toEqual({ startVolumeMl: 0, endVolumeMl: 10 });
});
```

- [ ] **Step 2: Run red verification.**

Run: `npm test -- tests/core/chromatography-analysis.test.ts`

Expected: FAIL because manual anchors, bands, and viewport helpers are absent.

- [ ] **Step 3: Implement the tested APIs.**

```ts
export type BaselineMode = 'none' | 'endpoint' | 'rolling-minimum' | 'manual-linear';
export interface BaselineAnchors { start: SignalPoint; end: SignalPoint; }
export interface VolumeRange { startVolumeMl: number; endVolumeMl: number; }
export interface FractionBand extends VolumeRange { label: string; }
```

For `manual-linear`, validate distinct finite anchor volumes and interpolate the anchor signal at each raw point. Order events before making consecutive fraction bands, terminate the last at `traceEndVolumeMl`, and return the full extent if a clamped viewport has no positive width.

- [ ] **Step 4: Run green verification.**

Run: `npm test -- tests/core/chromatography-analysis.test.ts`

Expected: PASS with all existing trapezoidal integration/candidate tests.

- [ ] **Step 5: Commit.**

Run: `git add tests/core/chromatography-analysis.test.ts src/core/chromatography/analysis.ts && git commit -m "feat: add chromatogram review helpers"`

### Task 3: Create the interactive analysis plot

**Files:**

- Create: `src/tools/sec/ChromatogramPlot.tsx`
- Modify: `tests/app/chromatography.test.tsx`
- Modify: `src/tools/sec/View.tsx`

**Interfaces:**

- Consumes: imported records, raw/corrected UV, baseline, `VolumeRange`, trace settings, fraction bands, and accepted peaks.
- Produces: an accessible `Chromatogram analysis plot`, active/color trace controls, injection/fraction annotations, and controlled zoom state.

- [ ] **Step 1: Write the failing UI test.**

```ts
expect(screen.getByRole('button', { name: /Cond \(mS\/cm\)/i }).getAttribute('aria-pressed')).toBe('true');
fireEvent.click(screen.getByRole('button', { name: /Cond \(mS\/cm\)/i }));
expect(screen.getByRole('button', { name: /Cond \(mS\/cm\)/i }).getAttribute('aria-pressed')).toBe('false');
fireEvent.input(screen.getByLabelText(/Color for UV/i), { target: { value: '#dc2626' } });
expect(screen.getByLabelText(/Chromatogram analysis plot/i)).toBeTruthy();
expect(screen.getByText(/Injection at 0\.00 mL/i)).toBeTruthy();
```

- [ ] **Step 2: Run red verification.**

Run: `npm test -- tests/app/chromatography.test.tsx`

Expected: FAIL because the current `TracePlot` has no color input, injection annotation, or controlled viewport.

- [ ] **Step 3: Implement `ChromatogramPlot`.**

```ts
export interface TraceDisplaySetting { id: string; visible: boolean; color: string; }
export interface AcceptedPeakDisplay { id: string; startVolumeMl: number; endVolumeMl: number; selected: boolean; }
export function ChromatogramPlot(props: {
  imported: ChromatogramImport; rawUv: SignalPoint[]; correctedUv: SignalPoint[];
  baseline: BaselineResult; traceSettings: TraceDisplaySetting[]; viewport: VolumeRange;
  showFractions: boolean; selectedFractionLabels: string[]; acceptedPeaks: AcceptedPeakDisplay[];
  onTraceSettingChange: (id: string, patch: Partial<TraceDisplaySetting>) => void;
  onViewportChange: (viewport: VolumeRange) => void; onShowFractionsChange: (shown: boolean) => void;
}): JSX.Element
```

Use `<svg aria-label="Chromatogram analysis plot">`; subtract `injectionVolumeMl ?? 0` only while mapping x coordinates. Give every native trace a pressed visibility button and `<input type="color" aria-label={`Color for ${label}`}>`. Render independently normalized overlays, distinct raw/corrected/baseline paths, a dashed injection line at displayed zero, fraction-band rectangles/labels, and translucent accepted-peak regions. Implement pointer-wheel zoom around the pointer, pointer-drag panning, `Fit run`, `Reset zoom`, and `Focus selected fractions`, using `constrainViewport`.

- [ ] **Step 4: Replace `TracePlot` call sites and run green verification.**

Run: `npm test -- tests/app/chromatography.test.tsx`

Expected: PASS with previous independent trace visibility coverage.

- [ ] **Step 5: Commit.**

Run: `git add tests/app/chromatography.test.tsx src/tools/sec/ChromatogramPlot.tsx src/tools/sec/View.tsx && git commit -m "feat: add interactive chromatogram plot"`

### Task 4: Support multiple editable integrations and manual baselines

**Files:**

- Modify: `tests/app/chromatography.test.tsx`
- Modify: `src/tools/sec/View.tsx`

**Interfaces:**

- Produces: an immutable `AcceptedPeak[]` with ID, source, optional apex, bounds, derived integration, and removal action.

- [ ] **Step 1: Write the failing UI test.**

```ts
fireEvent.click(screen.getByRole('button', { name: /Accept candidate 1/i }));
fireEvent.click(screen.getByRole('button', { name: /Accept candidate 2/i }));
expect(screen.getAllByRole('heading', { name: /Accepted peak/i })).toHaveLength(2);
fireEvent.input(screen.getByLabelText(/Peak 1 start/i), { target: { value: '0.5' } });
expect(screen.getByText(/Peak 1.*AU·mL/i)).toBeTruthy();
fireEvent.click(screen.getByRole('button', { name: /Remove peak 2/i }));
expect(screen.getAllByRole('heading', { name: /Accepted peak/i })).toHaveLength(1);
```

Select `manual-linear`, enter start/end volume and signal, and assert a visible `Manual baseline` chart legend.

- [ ] **Step 2: Run red verification.**

Run: `npm test -- tests/app/chromatography.test.tsx`

Expected: FAIL because state is one accepted candidate index and manual anchors are unavailable.

- [ ] **Step 3: Implement local review state.**

```ts
type AcceptedPeak = {
  id: string; source: 'candidate' | 'manual'; apexVolumeMl?: number;
  startVolumeMl: number; endVolumeMl: number;
};
```

Append candidates/manual selections rather than replacing prior peaks. Use an item mapper for bound edits and `integratePeak(derived, startVolumeMl, endVolumeMl)` to derive every card’s area/error. Render `Peak N start`, `Peak N end`, integration, overlap warning, and `Remove peak N`; pass these bounds to the plot. Add four manual-anchor inputs; if any are invalid, show an inline error and do not accept integrations under that baseline.

- [ ] **Step 4: Run green verification.**

Run: `npm test -- tests/app/chromatography.test.tsx`

Expected: PASS with all current fraction amount and manual integration coverage.

- [ ] **Step 5: Commit.**

Run: `git add tests/app/chromatography.test.tsx src/tools/sec/View.tsx && git commit -m "feat: support multiple editable chromatogram peaks"`

### Task 5: Audit review state and run complete verification

**Files:**

- Modify: `tests/app/chromatography.test.tsx`
- Modify: `tests/e2e/chromatography.spec.ts`
- Modify: `src/tools/sec/View.tsx`

**Interfaces:**

- Produces: derived JSON/CSV containing review choices and a browser-tested ÅKTA workflow; raw exports remain instrument-only.

- [ ] **Step 1: Write failing export and browser tests.** Require a derived export after two accepted peaks and a color change to contain:

```ts
expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"acceptedPeaks"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"displayVolumeOffsetMl"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"traceSettings"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
```

Add a Playwright ÅKTA fixture with `Fraction`, `Injection`, `Cond`, and `UV`; focus selected fractions, change overlay color, accept two candidates, and assert the injection marker plus both peak cards.

- [ ] **Step 2: Run red verification.**

Run: `npm test -- tests/app/chromatography.test.tsx`

Run: `npm run e2e -- tests/e2e/chromatography.spec.ts`

Expected: FAIL because only singular acceptance/baseline fields are exported and the new interaction controls do not exist.

- [ ] **Step 3: Export review state only with derived records.** Add to the derived audit record:

```ts
displayVolumeOffsetMl: data?.injectionVolumeMl ?? 0,
traceSettings, viewport, showFractions, selectedFractionLabels,
baseline: { mode: baselineMode, anchors: parsedBaselineAnchors },
acceptedPeaks: acceptedPeaks.map(peak => ({ ...peak, integration: integrationFor(peak) })),
```

Write one derived CSV row per accepted peak with `peak_id`, `source`, start/end/apex volume and area. Do not add viewport, colors, baselines, or calculated integrations to raw exports.

- [ ] **Step 4: Run green verification.**

Run: `npm test -- tests/app/chromatography.test.tsx`

Run: `npm run e2e -- tests/e2e/chromatography.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run the complete suite and commit.**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e -- tests/e2e/chromatography.spec.ts`

Expected: all commands exit 0.

Run: `git add tests/app/chromatography.test.tsx tests/e2e/chromatography.spec.ts src/tools/sec/View.tsx && git commit -m "feat: preserve chromatogram review state"`

## Plan self-review

- Coverage: Tasks 1–2 cover import/analysis foundations; Task 3 covers trace styling, annotations, and zoom; Task 4 covers multiple peaks and manual baselines; Task 5 makes all review decisions auditable and verifies the browser workflow.
- Placeholder scan: no unfinished placeholder or deferred implementation step remains.
- Type consistency: `FractionEvent`, `BaselineAnchors`, `VolumeRange`, `TraceDisplaySetting`, and `AcceptedPeak` are declared before their consumers, and original-volume coordinates remain the calculation domain.
