# Plotly Chromatogram Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slow custom SVG chromatogram viewer with a lazy-loaded Plotly WebGL analysis workbench that keeps ÅKTA traces, fractions, injection, baselines, and multiple editable integrations legible and fast.

**Architecture:** Pure chart-model helpers transform existing immutable ÅKTA import and analysis data into bounded Plotly records. A single Plotly component owns its graph and commits only settled interactions back to `RunFractionsPanel`; Preact continues to own durable review/export state and inspector controls.

**Tech Stack:** Preact, TypeScript, Vitest, Playwright, `plotly.js-dist-min`, `@types/plotly.js`, Tailwind CSS, Vite dynamic imports.

**Spec:** `docs/superpowers/specs/2026-09-14-plotly-chromatogram-workbench-redesign.md`

## Global Constraints

- Keep parser and chromatography-analysis contracts intact; do not rewrite ASCII import handling.
- Raw imported coordinates and signals remain immutable; only displayed x values subtract `injectionVolumeMl ?? 0`.
- UV is the integration trace in native units. Never independently normalize an overlay trace.
- The chart owns continuous pan and zoom. Do not call a parent state setter from a pointer-move event.
- Load Plotly only when the Run & fractions workbench mounts, maintain one WebGL graph, and purge it on unmount.
- Hide fraction labels adaptively. Never render every fraction label on a dense run.
- Preserve current derived-export fields: trace settings, viewport, fraction display/selection, baseline configuration, and accepted peaks.
- Run typecheck, lint, full unit tests, production build, focused browser tests, and a desktop visual screenshot before the final merge.

---

## File structure

- `src/tools/sec/chromatogram-chart-model.ts` — pure conversion from imported/analysis records to chart trace, fraction, peak, and range models.
- `src/tools/sec/plotly-runtime.ts` — dynamically loads and narrows the Plotly browser API; contains no chromatography logic.
- `src/tools/sec/PlotlyChromatogramPlot.tsx` — owns the single Plotly instance, lifecycle, layout updates, and Plotly event translation.
- `src/tools/sec/View.tsx` — retains Run & fractions state/export behavior and becomes the chart toolbar plus inspector composition root.
- `tests/tools/sec/chromatogram-chart-model.test.ts` — pure model edge cases.
- `tests/tools/sec/PlotlyChromatogramPlot.test.tsx` — mocked Plotly lifecycle and interaction contract.
- `tests/app/chromatography.test.tsx` — workbench-level inspector/export behavior with the runtime mocked.
- `tests/e2e/chromatography.spec.ts` — browser regression coverage for the usable chromatogram workflow.
- `package.json` and `package-lock.json` — Plotly runtime/type dependencies.

### Task 1: Establish the typed Plotly boundary and chart model

**Files:**
- Create: `tests/tools/sec/chromatogram-chart-model.test.ts`
- Create: `src/tools/sec/chromatogram-chart-model.ts`
- Create: `src/tools/sec/plotly-runtime.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `ChromatogramImport`, `SignalPoint`, `BaselineResult`, `VolumeRange`, and accepted-peak review records.
- Produces: `getChromatogramTraces`, `getDisplayExtent`, `buildFractionAnnotations`, `buildPeakOverlays`, and `buildChromatogramChartModel` for Tasks 2–4.

- [ ] **Step 1: Write failing pure-model tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildChromatogramChartModel, buildFractionAnnotations, getDisplayExtent } from '@/tools/sec/chromatogram-chart-model';

it('shifts instrument volumes to the injection-relative display origin', () => {
  expect(getDisplayExtent([{ volumeMl: 3, signalAu: 0 }, { volumeMl: 5, signalAu: 1 }], 3))
    .toEqual({ startVolumeMl: 0, endVolumeMl: 2 });
});

it('limits dense fraction labels while retaining selected labels', () => {
  const annotations = buildFractionAnnotations({
    events: Array.from({ length: 80 }, (_, index) => ({ label: `F${index + 1}`, volumeMl: index })),
    endInstrumentVolumeMl: 80, displayOffsetMl: 0,
    viewport: { startVolumeMl: 0, endVolumeMl: 80 }, widthPx: 640,
    selectedLabels: ['F43'], visible: true,
  });
  expect(annotations.bands).toHaveLength(80);
  expect(annotations.labels.length).toBeLessThan(25);
  expect(annotations.labels.map(label => label.text)).toContain('F43');
});
```

Add this concrete two-peak assertion:

```ts
const overlay = buildPeakOverlays({
  correctedUv: [0, 1, 2, 3, 4].map(volumeMl => ({ volumeMl, signalAu: volumeMl === 1 || volumeMl === 3 ? 1 : 0 })),
  baseline: { mode: 'none', points: [0, 1, 2, 3, 4].map(volumeMl => ({ volumeMl, signalAu: 0, baselineAu: 0, correctedSignalAu: 0 })) },
  acceptedPeaks: [
    { id: 'one', source: 'manual', startVolumeMl: 0, endVolumeMl: 2 },
    { id: 'two', source: 'manual', startVolumeMl: 2, endVolumeMl: 4 },
  ],
  displayOffsetMl: 0,
  selectedPeakId: 'two',
});
expect(overlay).toHaveLength(2);
expect(overlay[0]!.x.every(x => x >= 0 && x <= 2)).toBe(true);
expect(overlay[1]!.x.every(x => x >= 2 && x <= 4)).toBe(true);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/tools/sec/chromatogram-chart-model.test.ts`

Expected: FAIL because the chart-model module does not exist.

- [ ] **Step 3: Install the lazy-loadable Plotly distribution and declarations**

Run: `npm install plotly.js-dist-min && npm install -D @types/plotly.js`

Create a runtime boundary rather than importing Plotly from UI code:

```ts
import type Plotly from 'plotly.js';

export type PlotlyApi = Pick<typeof Plotly, 'newPlot' | 'react' | 'restyle' | 'relayout' | 'purge'>;

export async function loadPlotly(): Promise<PlotlyApi> {
  const module = await import('plotly.js-dist-min');
  return module.default as unknown as PlotlyApi;
}
```

- [ ] **Step 4: Implement the pure chart model**

Define focused serializable types:

```ts
export interface ChartTraceSetting { id: string; visible: boolean; color: string; axis: 'uv' | 'overlay'; }
export interface ChartTrace { id: string; label: string; unit: string; x: number[]; y: number[]; color: string; axis: 'uv' | 'overlay'; }
export interface ChartLine { x: number[]; y: number[]; color: string; dash: 'solid' | 'dash'; }
export interface AcceptedPeakChartInput { id: string; source: 'candidate' | 'manual'; startVolumeMl: number; endVolumeMl: number; }
export interface FractionAnnotation { id: string; label: string; startVolumeMl: number; endVolumeMl: number; selected: boolean; }
export interface FractionLabel { id: string; text: string; volumeMl: number; }
export interface PeakOverlay { id: string; x: number[]; correctedY: number[]; baselineY: number[]; selected: boolean; }
export interface ChromatogramChartModel {
  extent: VolumeRange; viewport: VolumeRange; traces: ChartTrace[];
  fractionAnnotations: { bands: FractionAnnotation[]; labels: FractionLabel[] };
  injectionDisplayVolumeMl?: number; baseline: ChartLine | undefined; peakOverlays: PeakOverlay[];
}
export interface BuildChromatogramChartModelInput {
  imported: ChromatogramImport; rawUv: SignalPoint[]; correctedUv: SignalPoint[];
  baseline: BaselineResult; traceSettings: ChartTraceSetting[]; viewport: VolumeRange;
  showFractions: boolean; selectedFractionLabels: string[];
  acceptedPeaks: AcceptedPeakChartInput[]; selectedPeakId: string | null; graphWidthPx: number;
}
export function buildChromatogramChartModel(input: BuildChromatogramChartModelInput): ChromatogramChartModel;
```

Implement these rules:

- `getChromatogramTraces(imported, rawUv)` returns native imported traces or a UV fallback in mAU.
- `getDisplayExtent(rawUv, offset)` transforms only the returned range to injection-relative volumes and returns `{ 0, 1 }` for absent/invalid data.
- `buildFractionAnnotations` calls existing `buildFractionBands`, clips to the viewport, uses `minLabelWidthPx = 64`, and always includes first, last, and selected visible labels in addition to stride labels.
- `buildPeakOverlays({ correctedUv, baseline, acceptedPeaks, displayOffsetMl, selectedPeakId })` brackets each accepted peak with interpolated start/end points, then emits clipped corrected UV and matching baseline arrays.
- `buildChromatogramChartModel` produces no JSX, Plotly calls, mutable arrays shared with import data, or DOM measurement.

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- tests/tools/sec/chromatogram-chart-model.test.ts`

Expected: PASS with offset ranges, sparse labels, native trace values, and two local peak fills covered.

- [ ] **Step 6: Commit the model boundary**

```bash
git add package.json package-lock.json src/tools/sec/plotly-runtime.ts src/tools/sec/chromatogram-chart-model.ts tests/tools/sec/chromatogram-chart-model.test.ts
git commit -m "feat: add Plotly chromatogram chart model"
```

### Task 2: Build the one-instance Plotly component

**Files:**
- Create: `tests/tools/sec/PlotlyChromatogramPlot.test.tsx`
- Create: `src/tools/sec/PlotlyChromatogramPlot.tsx`

**Interfaces:**
- Consumes: `ChromatogramChartModel`, `PlotlyApi`, `VolumeRange`, and the pure model functions from Task 1.
- Produces: `PlotlyChromatogramPlot`, with these props:

```ts
interface PlotlyChromatogramPlotProps {
  model: ChromatogramChartModel;
  onViewportCommit: (range: VolumeRange) => void;
  onFractionSelect: (label: string) => void;
  onPeakSelect: (id: string) => void;
  baselineAnchorTarget: 'start' | 'end' | null;
  onBaselineAnchorPick: (target: 'start' | 'end', point: { volumeMl: number; signalAu: number }) => void;
}
```

- [ ] **Step 1: Write failing component tests with a mocked runtime**

```ts
const api = { newPlot: vi.fn(), react: vi.fn(), restyle: vi.fn(), relayout: vi.fn(), purge: vi.fn() };
vi.mock('@/tools/sec/plotly-runtime', () => ({ loadPlotly: vi.fn(async () => api) }));
const callbacks = {
  onFractionSelect: vi.fn(), onPeakSelect: vi.fn(), baselineAnchorTarget: null,
  onBaselineAnchorPick: vi.fn(),
};

it('creates one WebGL graph, commits a relayout range, and purges it on unmount', async () => {
  const onViewportCommit = vi.fn();
  const { unmount } = render(<PlotlyChromatogramPlot model={model} onViewportCommit={onViewportCommit} {...callbacks} />);
  await waitFor(() => expect(api.newPlot).toHaveBeenCalledTimes(1));
  const graph = api.newPlot.mock.calls[0]![0] as HTMLElement;
  graph.dispatchEvent(new CustomEvent('plotly_relayout', { detail: { 'xaxis.range[0]': 1, 'xaxis.range[1]': 2 } }));
  expect(onViewportCommit).toHaveBeenCalledWith({ startVolumeMl: 1, endVolumeMl: 2 });
  unmount();
  expect(api.purge).toHaveBeenCalledWith(graph);
});
```

Add tests that assert imported traces use `type: 'scattergl'`, peak fills are local scatter traces with `fill: 'tonexty'`, and a `plotly_click` on a fraction/UV point calls the fraction or baseline-anchor callback.

- [ ] **Step 2: Run the focused component test to verify it fails**

Run: `npm test -- tests/tools/sec/PlotlyChromatogramPlot.test.tsx`

Expected: FAIL because `PlotlyChromatogramPlot` does not exist.

- [ ] **Step 3: Implement graph lifecycle and update discipline**

Create a container `<div aria-label="Chromatogram analysis plot" />` with a visible loading state and retry button. In an effect, call `loadPlotly()` once, then call `newPlot` with `responsive: true`, `scrollZoom: true`, `displaylogo: false`, and one `scattergl` trace per visible imported trace. Store the API and graph element in refs; call `purge` during cleanup.

Use separate effects:

```ts
// source or overlays changed: Plotly.react(graph, data, layout, config)
// visibility or color changed: Plotly.restyle(graph, { visible, 'line.color': color }, traceIndexes)
// viewport or fraction labels changed: Plotly.relayout(graph, layoutPatch)
```

Attach Plotly listeners directly to the graph. Validate `plotly_relayout` values with `constrainViewport` against `model.extent` and call `onViewportCommit` only when both are finite and ordered. Never attach Preact pointer handlers to the graph container.

- [ ] **Step 4: Implement accessible interaction translation**

Render an adjacent `sr-only` summary containing active trace names, displayed range, injection state, selected fractions, and accepted-peak count. On `plotly_click`, select a fraction band by its `customdata` label; when `baselineAnchorTarget` is set, translate the clicked UV point into AU and call `onBaselineAnchorPick`. This gives both baseline anchors direct chart picking while the inspector keeps exact keyboard-editable fields.

- [ ] **Step 5: Run focused component tests and commit**

Run: `npm test -- tests/tools/sec/PlotlyChromatogramPlot.test.tsx`

Expected: PASS with lifecycle, event, WebGL, and cleanup assertions.

```bash
git add src/tools/sec/PlotlyChromatogramPlot.tsx tests/tools/sec/PlotlyChromatogramPlot.test.tsx
git commit -m "feat: add Plotly chromatogram viewer"
```

### Task 3: Recompose Run & fractions into chart, toolbar, and inspector

**Files:**
- Modify: `src/tools/sec/View.tsx:1-40, 888-1040`
- Delete: `src/tools/sec/ChromatogramPlot.tsx`
- Modify: `tests/app/chromatography.test.tsx`

**Interfaces:**
- Consumes: Task 1 `ChartTraceSetting`, `getChromatogramTraces`, `buildChromatogramChartModel`; Task 2 `PlotlyChromatogramPlot`.
- Produces: a responsive Run & fractions workbench while preserving `auditRecord`, `exportJson`, `exportCsv`, `acceptCandidate`, and `updateAcceptedPeak` behavior.

- [ ] **Step 1: Write a failing app test for the replacement layout**

```ts
function openDenseAktaRun() {
  fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
  const rows = Array.from({ length: 80 }, (_, index) => `${index},${index % 7},F${index + 1}`);
  fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), {
    target: { value: ['volume,uv280,fraction', ...rows].join('\\n') },
  });
}

it('uses a concise toolbar and inspector without rendering a fraction chip per band', () => {
  render(<SecView />);
  openDenseAktaRun();
  expect(screen.getByRole('button', { name: /Fit run/i })).toBeTruthy();
  expect(screen.getByRole('heading', { name: /Trace display/i })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /Select fraction/i }).length).toBeLessThan(8);
  expect(screen.getByRole('checkbox', { name: /Show fractions/i })).toBeTruthy();
});
```

Mock the Plotly runtime and add assertions for range-derived manual bounds, baseline-anchor picking, trace color persistence, two accepted peaks, and unchanged derived-export keys.

- [ ] **Step 2: Run the targeted app test to verify it fails**

Run: `npm test -- tests/app/chromatography.test.tsx`

Expected: FAIL because the old SVG viewer and all-fraction buttons are still mounted.

- [ ] **Step 3: Replace the old viewer composition**

Remove the `ChromatogramPlot` import and calculate `chartModel` with `useMemo`. Replace the old viewer/fraction-chip block with:

```tsx
<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
  <section aria-label="Chromatogram canvas" class="min-w-0 rounded-xl border p-3">
    <ChromatogramToolbar />
    <PlotlyChromatogramPlot model={chartModel} onViewportCommit={setViewport} />
  </section>
  <aside aria-label="Chromatogram inspector" class="space-y-4">
    <TraceDisplayInspector />
    <FractionInspector />
    <BaselineInspector />
    <PeakInspector />
  </aside>
</div>
```

Keep the helpers in `View.tsx` initially; extract only if that file becomes difficult to review. A dense event list must show the selected fraction and a compact searchable list, not one button per event. Retain the fraction amount estimate after selection.

- [ ] **Step 4: Make analysis interactions explicit and durable**

Add `selectedPeakId` and `baselineAnchorTarget` state. A `Use visible range` button copies the settled chart viewport plus injection offset into manual start/end fields; `Accept manual peak bounds` still adds, rather than replaces, a peak. Feed selected-peak state into `buildPeakOverlays`, update accepted bounds through the existing integration path, and include a new selection only as optional derived review state if useful to restore.

Implement `onBaselineAnchorPick` by writing selected start/end volume and signal strings, then clearing the target. Preserve validation from `applyBaseline`; display its error in the inspector and do not accept an invalid manual integration.

- [ ] **Step 5: Remove the SVG renderer, run target tests, and commit**

Run: `npm test -- tests/app/chromatography.test.tsx`

Expected: PASS with old regression behavior preserved and new layout assertions satisfied.

```bash
git add src/tools/sec/View.tsx src/tools/sec/ChromatogramPlot.tsx tests/app/chromatography.test.tsx
git commit -m "feat: redesign chromatogram analysis workbench"
```

### Task 4: Cover dense-run behavior in the browser

**Files:**
- Modify: `tests/e2e/chromatography.spec.ts`

**Interfaces:**
- Consumes: the complete Task 3 workbench and its accessible labels.
- Produces: browser-level assurance for large data, annotations, and the normal ÅKTA analysis sequence.

- [ ] **Step 1: Add a failing browser regression scenario**

Generate a 25,000-point UV trace and sparse `Fraction`/`Injection` paired records inside the test; do not commit user laboratory data. Exercise:

```ts
await expect(page.getByLabel('Chromatogram analysis plot')).toBeVisible();
await page.getByRole('button', { name: /Fit run/i }).click();
await page.getByRole('checkbox', { name: /Show fractions/i }).uncheck();
await page.getByRole('checkbox', { name: /Show fractions/i }).check();
await page.getByRole('button', { name: /Use visible range/i }).click();
await page.getByRole('button', { name: /Accept manual peak bounds/i }).click();
await expect(page.getByRole('heading', { name: /Accepted peak details/i })).toHaveCount(1);
```

Retain the small ÅKTA fixture and assert injection at `0.00 mL`, a selected fraction, an optional trace toggle, two accepted peaks, and an editable boundary.

- [ ] **Step 2: Run the browser test to verify it fails before final fixes**

Run: `npm run e2e -- tests/e2e/chromatography.spec.ts`

Expected: FAIL only if an accessible control or event contract from Task 3 is missing; correct the app contract rather than weakening the test.

- [ ] **Step 3: Stabilize graph readiness**

Use explicit `aria-label`s for graph, toolbar, trace controls, fraction visibility, baseline anchor pick actions, and manual range actions. Expose `data-testid="plotly-chromatogram-ready"` only after `newPlot` resolves, and wait for it in tests instead of arbitrary delays.

- [ ] **Step 4: Run focused browser tests, screenshot review, and commit**

Run: `npm run e2e -- tests/e2e/chromatography.spec.ts`

Expected: PASS without a machine-dependent millisecond threshold.

Run the built preview and capture the Run & fractions route at 1600 px width after loading the dense fixture. Verify visually that the canvas is dominant, the inspector is readable, the fraction lane uses sparse labels, and no text overlaps the chromatogram.

```bash
git add tests/e2e/chromatography.spec.ts
git commit -m "test: cover dense Plotly chromatogram workflow"
```

### Task 5: Full verification and integration handoff

**Files:**
- Modify only if verification exposes a focused defect in Tasks 1–4.

**Interfaces:**
- Consumes: all completed tasks.
- Produces: evidence that the redesigned viewer is buildable, tested, and visually reviewed before merge.

- [ ] **Step 1: Run static and unit verification**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all commands exit 0.

- [ ] **Step 2: Run production build verification**

Run: `npm run build`

Expected: exit 0, with Plotly emitted as a lazy chunk rather than bundled into the initial application chunk.

- [ ] **Step 3: Run browser verification**

Run: `npm run e2e -- tests/e2e/chromatography.spec.ts`

Expected: all chromatography browser tests pass.

- [ ] **Step 4: Review final diff and present evidence before merge/push**

```bash
git diff --check main~4..HEAD
git status --short
```

If a focused fix was needed, add its test and implementation in the same commit. Do not fold unrelated cleanup into this redesign. Report exact command results, commit IDs, screenshot-review result, and limitations; do not describe the viewer as fast or complete without fresh results.
