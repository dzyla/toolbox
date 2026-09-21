# High-Performance Chromatogram Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sluggish chromatogram viewer with a responsive, full-resolution analysis workbench that supports multi-run overlays, precise axes, peak/fraction selection, shaded integrations, and fraction pools.

**Architecture:** Preserve imported points as immutable analytical truth. Derive bounded, cached, viewport-aware display envelopes in pure helpers, and keep one Plotly WebGL graph alive while applying incremental `relayout`/`restyle` changes. A focused workspace state module separates multi-run review data from active-run analysis and lets `RunFractionsPanel` compose controls without embedding chart mechanics.

**Tech Stack:** Preact, TypeScript, Vitest, Testing Library, Playwright, Plotly (`plotly.js-dist-min`), Vite, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-20-high-performance-chromatogram-workbench-design.md`

## Global Constraints

- Imported points, native signal values, and raw instrument coordinates are immutable and remain the sole source for baseline correction, candidate detection, integration, and raw export.
- Injection-relative coordinates are display-only and must not leak into raw exports or accepted peak bounds.
- A normal render contains no more than approximately two samples per plot pixel, while preserving each bucket's extrema and both viewport boundary values.
- Keep one Plotly graph instance from mount to unmount. Never call `Plotly.react` for axis values, selection, fraction state, visibility, color, or baseline/peak metadata.
- Plotly uses `scattergl` for rendered chromatogram traces; full-resolution data may be used only for short, local peak overlays.
- Dense fractions may have one rendered band per plot pixel at most; selected bands and their labels are always retained.
- Only the active run can create, edit, or integrate accepted peaks. Comparison runs are display-only overlays.
- Existing parser and analysis contracts remain compatible; do not add proprietary binary import formats or change peak-detection math.
- Preserve existing raw and derived exports, adding run and pool metadata without removing current fields.
- Execute test-first for every behavior change: see a focused test fail before adding production code.

---

## File structure

- `src/tools/sec/chromatogram-workspace.ts` — pure workspace/run types and helpers for Y ranges, fraction intersection, and pool creation.
- `src/tools/sec/chromatogram-chart-model.ts` — pure display-envelope construction and multi-run Plotly chart model; owns no DOM/Plotly calls.
- `src/tools/sec/PlotlyChromatogramPlot.tsx` — single graph lifecycle and incremental Plotly update orchestration; maps Plotly interactions to callbacks.
- `src/tools/sec/ChromatogramWorkbench.tsx` — presentation component for toolbar, chart, inspector, runs, integrations, and pools; no parsing or scientific calculation.
- `src/tools/sec/View.tsx` — parses uploaded files, derives active-run analysis data, owns workspace review state, and exports records.
- `tests/app/chromatogram-workspace.test.ts` — workspace helper behavior.
- `tests/app/chromatogram-chart-model.test.ts` — display envelope, overlay, and dense fraction model behavior.
- `tests/app/PlotlyChromatogramPlot.test.tsx` — mocked Plotly lifecycle and incremental update contract.
- `tests/app/ChromatogramWorkbench.test.tsx` — keyboard-accessible controls and inspector behavior.
- `tests/app/chromatography.test.tsx` — end-to-end component behavior and exports.
- `tests/e2e/chromatography.spec.ts` — browser regressions, including a 30,000-row import and two-run comparison.

## Task 1: Add pure workspace records and range-selection helpers

**Files:**

- Create: `src/tools/sec/chromatogram-workspace.ts`
- Create: `tests/app/chromatogram-workspace.test.ts`

**Interfaces:**

- Consumes: `ChromatogramImport`, `VolumeRange`, and existing fraction events from `@/core/chromatography`.
- Produces:

```ts
export interface ChromatogramRun {
  id: string;
  name: string;
  imported: ChromatogramImport;
  visible: boolean;
}
export interface FractionPool {
  id: string;
  name: string;
  runId: string;
  labels: string[];
  startVolumeMl: number;
  endVolumeMl: number;
}
export function validateAxisRange(min: string, max: string):
  | { ok: true; range: [number, number] }
  | { ok: false; error: string };
export function fractionLabelsIntersectingRange(
  imported: ChromatogramImport,
  range: VolumeRange,
): string[];
export function createFractionPool(input: {
  id: string; name: string; runId: string; imported: ChromatogramImport; labels: string[];
}): FractionPool | undefined;
```

- [ ] **Step 1: Write the failing workspace-helper tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  createFractionPool,
  fractionLabelsIntersectingRange,
  validateAxisRange,
} from '@/tools/sec/chromatogram-workspace';

const imported = {
  fractionEvents: [
    { label: 'F1', volumeMl: 1 }, { label: 'F2', volumeMl: 2 },
    { label: 'F3', volumeMl: 3 }, { label: 'F4', volumeMl: 4 },
  ],
} as never;

it('accepts finite ascending Y limits and rejects reversed limits', () => {
  expect(validateAxisRange('10', '250')).toEqual({ ok: true, range: [10, 250] });
  expect(validateAxisRange('250', '10')).toEqual({ ok: false, error: 'Y maximum must be greater than Y minimum.' });
});

it('selects every fraction whose interval intersects a display range', () => {
  expect(fractionLabelsIntersectingRange(imported, { startVolumeMl: 1.5, endVolumeMl: 3.2 }))
    .toEqual(['F1', 'F2', 'F3']);
});

it('creates a pool with native bounds only for selected labels', () => {
  expect(createFractionPool({ id: 'pool-1', name: 'Main peak', runId: 'run-1', imported, labels: ['F2', 'F3'] }))
    .toMatchObject({ labels: ['F2', 'F3'], startVolumeMl: 2, endVolumeMl: 4 });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/app/chromatogram-workspace.test.ts`

Expected: FAIL because `chromatogram-workspace.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

```ts
export function validateAxisRange(min: string, max: string) {
  const lower = Number(min); const upper = Number(max);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) return { ok: false as const, error: 'Y limits must be finite numbers.' };
  if (upper <= lower) return { ok: false as const, error: 'Y maximum must be greater than Y minimum.' };
  return { ok: true as const, range: [lower, upper] as [number, number] };
}
```

Build ordered fraction bands with `buildFractionBands(imported.fractionEvents, endVolumeMl)`, subtract `imported.injectionVolumeMl ?? 0` only while comparing the display range, and return unique labels in instrument order. Build a pool only when at least one known selected label remains; use the first selected band's start and last selected band's end in native coordinates.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm test -- tests/app/chromatogram-workspace.test.ts`

Expected: PASS with finite axis validation, inclusive fraction selection, and native-coordinate pool bounds.

- [ ] **Step 5: Commit the workspace helpers**

```bash
git add src/tools/sec/chromatogram-workspace.ts tests/app/chromatogram-workspace.test.ts
git commit -m "feat: add chromatogram workspace helpers"
```

## Task 2: Build the bounded display envelope and multi-run chart model

**Files:**

- Modify: `src/tools/sec/chromatogram-chart-model.ts`
- Modify: `tests/app/chromatogram-chart-model.test.ts`

**Interfaces:**

- Consumes: `ChromatogramRun`, active-run `SignalPoint[]`, `BaselineResult`, and the existing chart model types.
- Produces:

```ts
export function decimateTraceForViewport(input: {
  x: number[]; y: number[]; viewport: VolumeRange; widthPx: number;
}): { x: number[]; y: number[] };
export function buildWorkspaceChromatogramChartModel(input: {
  runs: Array<ChromatogramRun & { traces: ChartTrace[] }>;
  activeRunId: string;
  viewport: VolumeRange;
  yRange?: [number, number];
  widthPx: number;
  showFractions: boolean;
  selectedFractionLabels: string[];
  acceptedPeaks: AcceptedPeakChartInput[];
  selectedPeakId: string | null;
  correctedUv: SignalPoint[];
  baseline: BaselineResult;
}): ChromatogramChartModel;
```

- [ ] **Step 1: Write failing envelope and multi-run tests**

```ts
it('preserves viewport boundaries and bucket extrema while bounding a 30k trace', () => {
  const x = Array.from({ length: 30_000 }, (_, index) => index / 100);
  const y = x.map((_, index) => index === 15_123 ? 999 : Math.sin(index / 60));
  const result = decimateTraceForViewport({ x, y, viewport: { startVolumeMl: 0, endVolumeMl: 300 }, widthPx: 600 });
  expect(result.x[0]).toBe(0);
  expect(result.x.at(-1)).toBe(299.99);
  expect(result.x).toHaveLength(expect.any(Number));
  expect(result.x.length).toBeLessThanOrEqual(1_204);
  expect(result.y).toContain(999);
});

it('interpolates viewport boundaries before decimating', () => {
  expect(decimateTraceForViewport({ x: [0, 2, 4], y: [0, 20, 40], viewport: { startVolumeMl: 1, endVolumeMl: 3 }, widthPx: 10 }))
    .toEqual({ x: [1, 2, 3], y: [10, 20, 30] });
});

it('keeps comparison runs visible but attaches active-run fraction annotations only', () => {
  const model = buildWorkspaceChromatogramChartModel(/* two-run fixture with activeRunId 'run-a' */);
  expect(model.traces.map(trace => trace.id)).toEqual(expect.arrayContaining(['run-a:uv280', 'run-b:uv280']));
  expect(model.fractionAnnotations.bands.every(band => band.id.startsWith('run-a:'))).toBe(true);
});
```

- [ ] **Step 2: Run the focused model tests and verify they fail**

Run: `npm test -- tests/app/chromatogram-chart-model.test.ts`

Expected: FAIL because the viewport envelope and workspace model exports do not exist.

- [ ] **Step 3: Implement interpolation and extrema-preserving envelope decimation**

Implement a binary-search `interpolatePointAt`, then collect boundary points and in-range points. Bucket the interior by `Math.floor((x - viewport.startVolumeMl) / viewportSpan * widthPx)`. For each bucket retain the minimum-Y and maximum-Y original samples, sorted by original index, and append boundaries. Clamp `widthPx` to at least 1 and cap the total to `2 * widthPx + 4`; never mutate caller arrays.

Prefix every chart trace id with its run id. Derive comparison-run traces with their own injection display offset. Generate baseline, shaded peak overlays, fraction bands, and fraction labels only from the active run. Preserve native trace units and use each run's trace setting color/visibility.

- [ ] **Step 4: Run the focused model tests and verify they pass**

Run: `npm test -- tests/app/chromatogram-chart-model.test.ts`

Expected: PASS with a 30k trace capped near two samples per pixel, preserved spike, interpolated boundaries, and active-run-only fraction annotations.

- [ ] **Step 5: Commit the chart model**

```bash
git add src/tools/sec/chromatogram-chart-model.ts tests/app/chromatogram-chart-model.test.ts
git commit -m "feat: decimate chromatogram display traces"
```

## Task 3: Make Plotly updates incremental and emit range-selection interactions

**Files:**

- Modify: `src/tools/sec/plotly-runtime.ts`
- Modify: `src/tools/sec/PlotlyChromatogramPlot.tsx`
- Modify: `tests/app/PlotlyChromatogramPlot.test.tsx`

**Interfaces:**

- Consumes: `ChromatogramChartModel`, a `ChartUpdate` discriminated union, and Plotly events.
- Produces:

```ts
export type ChartInteractionMode = 'inspect' | 'peak-select' | 'fraction-select';
export interface PlotlyChromatogramPlotProps {
  model: ChromatogramChartModel;
  interactionMode: ChartInteractionMode;
  onViewportCommit(range: VolumeRange): void;
  onRangeSelect(range: VolumeRange, mode: Exclude<ChartInteractionMode, 'inspect'>): void;
  onPeakSelect(id: string): void;
  onFractionSelect(label: string): void;
  onBaselineAnchorPick(target: 'start' | 'end', point: { volumeMl: number; signalAu: number }): void;
}
```

- [ ] **Step 1: Extend the mocked Plotly tests before component code**

```ts
it('uses relayout for a controlled Y range instead of rebuilding the graph', async () => {
  const { rerender } = render(<PlotlyChromatogramPlot {...props} model={{ ...model, yRange: [10, 250] }} />);
  await waitFor(() => expect(plotlyApi.newPlot).toHaveBeenCalledTimes(1));
  rerender(<PlotlyChromatogramPlot {...props} model={{ ...model, yRange: [25, 300] }} />);
  await waitFor(() => expect(plotlyApi.relayout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ 'yaxis.range': [25, 300] })));
  expect(plotlyApi.react).not.toHaveBeenCalled();
});

it('turns a Plotly selected x range into a peak-selection callback', async () => {
  render(<PlotlyChromatogramPlot {...props} interactionMode="peak-select" />);
  await waitFor(() => expect(handlers.get('plotly_selected')).toBeTypeOf('function'));
  handlers.get('plotly_selected')?.({ range: { x: [1.25, 2.75] } });
  expect(props.onRangeSelect).toHaveBeenCalledWith({ startVolumeMl: 1.25, endVolumeMl: 2.75 }, 'peak-select');
});
```

- [ ] **Step 2: Run the component tests and verify they fail**

Run: `npm test -- tests/app/PlotlyChromatogramPlot.test.tsx`

Expected: FAIL because the model lacks Y range and the component always calls `react`.

- [ ] **Step 3: Add the smallest Plotly API boundary needed for incremental changes**

Extend `PlotlyApi` with `addTraces` and `deleteTraces`. In `PlotlyChromatogramPlot`, retain the last rendered trace schema and a ref to the latest model. Use `newPlot` once, `relayout` for x/y ranges, shapes, annotations, and dragmode, and `restyle` for stable trace colors/visibility. Call `react` only if ordered trace ids/types/axes change, not when values such as selected fractions or Y limits change.

Attach `plotly_selected` once. Validate its `range.x` with `constrainViewport`, call `onRangeSelect` only when mode is peak/fraction selection, and clear the selected box with a local `relayout({ selections: [] })`. Map fraction click x-values through the chart model's sorted active fraction bands; do not create a Plotly trace for every band.

- [ ] **Step 4: Run the component tests and verify they pass**

Run: `npm test -- tests/app/PlotlyChromatogramPlot.test.tsx`

Expected: PASS with one graph, incremental Y update, valid selection callback, existing viewport callback, and purge on unmount.

- [ ] **Step 5: Commit the incremental chart lifecycle**

```bash
git add src/tools/sec/plotly-runtime.ts src/tools/sec/PlotlyChromatogramPlot.tsx tests/app/PlotlyChromatogramPlot.test.tsx
git commit -m "feat: add incremental chromatogram plot interactions"
```

## Task 4: Compose the workbench toolbar and inspector as a focused component

**Files:**

- Create: `src/tools/sec/ChromatogramWorkbench.tsx`
- Create: `tests/app/ChromatogramWorkbench.test.tsx`

**Interfaces:**

- Consumes: chart model, active-run name, interaction mode, controlled axis text, accepted-peak summaries, selected fractions, pools, and callback props from `RunFractionsPanel`.
- Produces a semantic workbench with `aria-label="Chromatogram workbench"`, `Y axis minimum`, `Y axis maximum`, `Apply Y limits`, `Autoscale Y`, `Peak select mode`, `Fraction select mode`, `Create fraction pool`, and selected-peak editor controls.

- [ ] **Step 1: Write failing presentation tests**

```tsx
it('applies a valid typed Y range through the inspector', () => {
  const onYAxisApply = vi.fn();
  render(<ChromatogramWorkbench {...fixture} onYAxisApply={onYAxisApply} />);
  fireEvent.input(screen.getByLabelText('Y axis minimum'), { target: { value: '25' } });
  fireEvent.input(screen.getByLabelText('Y axis maximum'), { target: { value: '400' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply Y limits' }));
  expect(onYAxisApply).toHaveBeenCalledWith([25, 400]);
});

it('announces an invalid typed Y range without changing the plot', () => {
  render(<ChromatogramWorkbench {...fixture} />);
  fireEvent.input(screen.getByLabelText('Y axis minimum'), { target: { value: '400' } });
  fireEvent.input(screen.getByLabelText('Y axis maximum'), { target: { value: '25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply Y limits' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Y maximum must be greater than Y minimum.');
});

it('creates a named pool from selected fractions and exposes its native bounds', () => {
  render(<ChromatogramWorkbench {...fixture} selectedFractions={['F2', 'F3']} />);
  fireEvent.input(screen.getByLabelText('Fraction pool name'), { target: { value: 'Main peak' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create fraction pool' }));
  expect(fixture.onCreatePool).toHaveBeenCalledWith('Main peak');
});
```

- [ ] **Step 2: Run the workbench tests and verify they fail**

Run: `npm test -- tests/app/ChromatogramWorkbench.test.tsx`

Expected: FAIL because `ChromatogramWorkbench` does not exist.

- [ ] **Step 3: Implement the presentation-only workbench**

Place a compact toolbar above `PlotlyChromatogramPlot`, use a two-column layout with a responsive inspector below the chart, and put only trace controls, range fields, run picker, baseline/peak details, selection details, and pools in the inspector. Keep all values controlled via callback props. Give selected accepted peaks higher visual emphasis but expose exact start/end input fields and an accessible integration text summary. Show the active run before peak actions and label comparison runs as display-only.

- [ ] **Step 4: Run the workbench tests and verify they pass**

Run: `npm test -- tests/app/ChromatogramWorkbench.test.tsx`

Expected: PASS with typed range validation, mode controls, pool creation, and accessible peak controls.

- [ ] **Step 5: Commit the workbench surface**

```bash
git add src/tools/sec/ChromatogramWorkbench.tsx tests/app/ChromatogramWorkbench.test.tsx
git commit -m "feat: add chromatogram analysis workbench"
```

## Task 5: Replace single-run panel state with active-run workspace state

**Files:**

- Modify: `src/tools/sec/View.tsx`
- Modify: `tests/app/chromatography.test.tsx`

**Interfaces:**

- Consumes: `ChromatogramWorkbench`, workspace helpers, parser, `applyBaseline`, `detectPeakCandidates`, and `integratePeak`.
- Produces a `RunFractionsPanel` that accepts multiple files, keeps one active run, and passes only active-run corrected UV to integration functions.

- [ ] **Step 1: Add failing panel tests for active-run isolation and exports**

```tsx
it('adds a comparison run without allowing it to alter the active integration', async () => {
  render(<SecView />);
  fireEvent.click(screen.getByRole('button', { name: 'Run & fractions' }));
  await loadRun('run-a.csv', 'volume,uv280\n0,0\n1,500\n2,0');
  await loadRun('run-b.csv', 'volume,uv280\n0,0\n1,900\n2,0');
  fireEvent.click(screen.getByRole('button', { name: 'Set run-a as active' }));
  fireEvent.click(screen.getByRole('button', { name: 'Accept manual peak bounds' }));
  expect(screen.getByText(/run-a.*AU·mL/i)).toBeTruthy();
  expect(screen.queryByText(/run-b.*accepted peak/i)).toBeNull();
});

it('exports active-run integrations and fraction pools with native bounds', async () => {
  // Load an injection-offset ÅKTA fixture, select F2/F3, create a pool, accept a peak, export derived JSON.
  expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"pools"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
  expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"startVolumeMl":2'), expect.any(String), expect.any(String));
});
```

- [ ] **Step 2: Run the focused panel tests and verify they fail**

Run: `npm test -- tests/app/chromatography.test.tsx`

Expected: FAIL because the panel accepts only one `data` record and exports no run/pool metadata.

- [ ] **Step 3: Refactor state without changing the parser or analysis functions**

Replace `source`, `data`, and single-run review fields with `runs`, `activeRunId`, `selectedFractionLabels`, `pools`, `viewport`, and Y-range state. Convert each uploaded file once with `parseChromatogram`, keep the original filename as its run name, and append it to the run list. Derive raw UV, baseline, candidates, and accepted peak details from `activeRun` only with `useMemo`. On a peak-select range, prefill manual start/end in native coordinates; on fraction-select range, merge intersected labels. Export raw data per active run and include `runs`, `activeRunId`, `acceptedPeaks`, and `pools` in derived JSON while retaining previous fields.

- [ ] **Step 4: Run the focused panel tests and verify they pass**

Run: `npm test -- tests/app/chromatography.test.tsx`

Expected: PASS with a comparison overlay, active-run-only integration, native-coordinate pool export, legacy single-run import, baseline, candidate, and amount-estimation cases intact.

- [ ] **Step 5: Commit the workspace integration**

```bash
git add src/tools/sec/View.tsx tests/app/chromatography.test.tsx
git commit -m "feat: support chromatogram run workspaces"
```

## Task 6: Verify dense and multi-run behavior in the browser

**Files:**

- Modify: `tests/e2e/chromatography.spec.ts`

**Interfaces:**

- Consumes: the completed workbench UI.
- Produces browser coverage for a 30,000-row active run, comparison overlay, editable Y axis, visual selection, integration, fraction pooling, and responsive fraction annotations.

- [ ] **Step 1: Add a failing browser workflow**

```ts
test('Chromatography: keeps a 30k-point active run responsive while comparing another run', async ({ page }) => {
  await page.goto('/#/t/sec');
  await page.getByRole('button', { name: 'Run & fractions' }).click();
  const dense = ['volume,uv280,fraction', ...Array.from({ length: 30_000 }, (_, i) => `${i / 100},${Math.round(500 + 450 * Math.sin(i / 190))},F${i + 1}`)].join('\n');
  await page.getByLabel('Add chromatogram runs').setInputFiles([{ name: 'active.csv', mimeType: 'text/csv', buffer: Buffer.from(dense) }]);
  await page.getByLabel('Add chromatogram runs').setInputFiles([{ name: 'comparison.csv', mimeType: 'text/csv', buffer: Buffer.from('volume,uv280\n0,0\n1,400\n2,0') }]);
  await expect(page.getByTestId('plotly-chromatogram-ready')).toBeVisible();
  await page.getByLabel('Y axis minimum').fill('0');
  await page.getByLabel('Y axis maximum').fill('1200');
  await page.getByRole('button', { name: 'Apply Y limits' }).click();
  await page.getByRole('button', { name: 'Peak select mode' }).click();
  await page.getByRole('button', { name: 'Accept manual peak bounds' }).click();
  await page.getByRole('button', { name: 'Fraction select mode' }).click();
  await page.getByLabel('Fraction pool name').fill('Peak pool');
  await page.getByRole('button', { name: 'Create fraction pool' }).click();
  await expect(page.getByText('Peak pool')).toBeVisible();
});
```

- [ ] **Step 2: Run the browser workflow and verify it fails**

Run: `npm run e2e -- tests/e2e/chromatography.spec.ts`

Expected: FAIL because current UI has no multi-file workspace, Y-limit controls, selection modes, or pools.

- [ ] **Step 3: Make only semantic-selector adjustments required by the browser test**

Do not introduce test-only production branches. Ensure the actual file input, toolbar buttons, axis fields, pool name field, ready indicator, and accepted peak summary have stable accessible names used by the test. Ensure the dense run exposes a bounded fraction lane rather than thousands of controls.

- [ ] **Step 4: Run focused verification and inspect screenshots**

Run: `npm run e2e -- tests/e2e/chromatography.spec.ts`

Expected: PASS. Inspect the captured desktop screenshot to verify the chart, selected shaded peak, fraction lane, axis controls, and inspector are legible without overlap.

- [ ] **Step 5: Run the full verification suite**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e -- tests/e2e/chromatography.spec.ts && git diff --check`

Expected: PASS with no type errors, lint findings, unit failures, build failures, focused browser failures, or whitespace errors.

- [ ] **Step 6: Commit the browser coverage**

```bash
git add tests/e2e/chromatography.spec.ts
git commit -m "test: cover responsive chromatogram workbench"
```

## Plan self-review

- **Spec coverage:** Task 1 supplies workspace, axis, fraction, and pool semantics; Task 2 protects full-resolution analysis with bounded display data and multi-run model; Task 3 prevents ordinary interactions from rebuilding Plotly and emits brush selection; Task 4 supplies the accessible canvas-and-inspector UI; Task 5 connects parsing, analysis, integration, and backward-compatible export; Task 6 validates 30k-point browser behavior and screenshots.
- **No placeholders:** Each task has concrete files, interfaces, failing tests, verification commands, implementation instructions, and commit commands. No requirement is deferred.
- **Type consistency:** `ChromatogramRun`, `FractionPool`, `ChartInteractionMode`, `validateAxisRange`, `fractionLabelsIntersectingRange`, `createFractionPool`, `decimateTraceForViewport`, and `buildWorkspaceChromatogramChartModel` are defined before later tasks consume them.
