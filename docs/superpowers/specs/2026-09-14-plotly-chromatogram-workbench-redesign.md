# Plotly Chromatogram Workbench Redesign

## Decision

Replace the custom SVG chromatogram renderer with a Plotly-backed analysis
surface. The existing ÅKTA parser, chromatogram analysis functions, review
state, and raw/derived export formats stay in place. The replacement is a
focused rendering and interaction redesign, not a new chromatography data
model.

The new workbench must remain responsive with complete ÅKTA/UNICORN runs,
including the supplied 20,000- and 46,000-row ASCII exports. It must present a
clean overview at first load, preserve native trace units, and keep peak
analysis explicit and reviewable.

## Why replace the current viewer

The current component builds SVG paths and fraction label nodes in Preact on
every viewport change. Pointer movement updates parent state, rebuilds derived
data, and re-renders all labels and trace paths. A dense fraction run therefore
causes both slow interaction and unreadable overlapping text. Incremental
tuning of that renderer cannot provide instrument-grade interaction.

Plotly's WebGL line trace supplies pan, wheel zoom, hover, range selection, and
an overview range slider without routing continuous pointer movement through
Preact. Plot updates use the smallest practical API: restyle for trace
appearance, relayout for annotations and ranges, and a complete react update
only when source data or analysis overlays materially change.

## Workbench layout

The desktop workbench has two persistent regions:

- The main region is a large chromatogram canvas with a compact toolbar above
  it and a small annotation lane below it.
- The inspector is a fixed-width right panel for trace styling, fractions,
  baseline definition, candidate detection, accepted peaks, and export
  summaries. It becomes a drawer on narrow screens.

This replaces rows of controls and fraction chips above the data. Controls
never overlap the plot, and labels are never allowed to obscure the traces.

The main toolbar contains `Fit run`, `Reset view`, a zoom/inspect mode
indicator, and a concise trace legend. Each legend item toggles visibility;
the inspector provides its color picker and axis choice. The default overview
shows UV and only the traces the user has enabled.

## Chart and annotations

`PlotlyChromatogramPlot` owns one Plotly graph instance. It uses `scattergl`
for imported sample traces and ordinary lightweight traces/shapes for local
analysis overlays. Its input is an immutable chart model produced by a pure
adapter; it contains no parsing or integration decisions.

### Axes and traces

- UV is the primary left-axis trace in its native units. UV remains the only
  trace used by the integration workflow.
- Conductivity, UV260, `%B`, and other optional native traces have a real
  compatible axis, rather than per-trace normalization. The inspector lets a
  user make a trace visible and choose its assigned compatible axis.
- Visible traces have persistent user-selected colors. Hidden traces are
  removed from the rendered data rather than drawn transparently.
- The chart exposes Plotly hover labels with physical volume and native signal
  values. It does not render a Preact data label for each point.
- A bottom range slider always represents the full run; the visible x-range is
  the analysis range. `Fit run` makes the complete injection-relative extent
  visible.

### Injection and fractions

The first finite ÅKTA Injection coordinate remains the display origin. The
main chart draws a labelled vertical `Injection · 0.00 mL` marker when it is
known, while raw exports retain instrument coordinates.

Fractions use the existing ordered event data. The annotation lane renders
alternating shaded bands bounded by collection events. It deliberately does
not render a label for every band:

- It computes a label stride from the current x-range and actual plot width,
  reserving a minimum readable label width.
- It labels the first, last, selected, hovered, and every stride-th fraction.
- Hovering or clicking a band reveals its full fraction label and bounds in a
  single tooltip/inspector row; a click selects it.
- A visibility switch hides the lane completely. Selected fractions can focus
  the viewport without requiring a separate chip for every fraction.

Fraction bands and labels are bounded annotation data, not one React DOM node
per imported event. Selecting a band never changes source data.

## Analysis workflow

The inspector uses a clear left-to-right analysis order: choose UV, define the
baseline, propose or define regions, accept integrations, then export. It
retains all existing baseline modes and manual anchors.

### Baseline

The selected baseline is displayed as an explicit thin dashed trace. In
manual-linear mode, editable anchors are shown as drag handles in the chart
and as exact number fields in the inspector. Updating an anchor recalculates
the corrected UV and accepted-peak areas without modifying the raw trace.

### Peaks and integrations

Candidate detection remains a pure analysis operation. Candidates appear in
the inspector and as subtle boundary markers; they become integrations only
after an explicit `Accept` action.

An analyst can create a manual integration from the current x-range or exact
start/end fields. Each accepted peak stores stable identity, source, bounds,
selected state, and the integration result. Multiple peaks are valid, and
their bounds are independently editable; overlap is visually and textually
flagged because it double-counts signal.

For an accepted peak the graph generates a small local filled trace between the
baseline and corrected UV, plus start/end handles. The fill is calculated only
for the peak's range, so accepting several peaks does not duplicate an entire
run's data. Selecting a peak raises its fill opacity and opens its inspector
section. The inspector can remove it or adjust its numerical limits.

## Rendering and state contract

The chart must not receive a new Preact state value for every pointer move.
The Plotly instance handles continuous pan and zoom locally. `plotly_relayout`
is reduced to a final, valid x-range update when interaction completes, so
review/export state is kept current without rebuilding the graph during a
drag.

`RunFractionsPanel` continues to own durable review state: source identity,
injection-relative viewport, trace settings, fraction visibility/selection,
baseline configuration, candidates, accepted peaks, and exports. It passes a
serializable model and focused callbacks to the chart adapter.

The adapter is split into small pure helpers:

- `buildPlotTraces` maps imported traces to Plotly traces and preserves native
  units and colors.
- `buildFractionAnnotations` chooses visible bands and collision-safe labels
  from events, x-range, and measured graph width.
- `buildPeakOverlays` builds only the local fills, boundaries, and handles for
  accepted peaks.
- `toPlotlyRange` and `fromPlotlyRange` translate validated display-volume
  ranges without leaking instrument offsets into the UI.

The dynamically imported Plotly distribution is loaded only when the
chromatography run panel mounts. The app keeps one WebGL graph per open
workbench and cleans it up on unmount. No separate chart is created for each
trace, fraction, or accepted peak.

## Failure handling and accessibility

If Plotly cannot load, the panel displays a concise retryable error and keeps
the imported data and non-chart analysis controls intact. Malformed fraction
or injection records continue to produce parser notices rather than blocking
numeric data.

Every inspector action is keyboard accessible. The chart has an accessible
summary of its active traces, displayed volume range, injection origin, and
selected integrations; the inspector exposes the same values as semantic text
and fields, so Plotly canvas interaction is not the sole way to perform
analysis.

## Implementation boundaries

- Replace `src/tools/sec/ChromatogramPlot.tsx` with a Plotly chart component
  and narrowly scoped model/adapter helpers. Remove the custom SVG path,
  pointer-drag, and all-fraction chip implementations.
- Preserve `src/core/chromatography/import.ts` and
  `src/core/chromatography/analysis.ts` contracts unless a type extension is
  necessary for a chart model. No parser rewrite is in scope.
- Add a Plotly distribution package suitable for browser bundling and its TypeScript
  declarations. Load it lazily instead of adding it to the initial tool bundle.
- Keep review-state import/export backward-compatible with the current fields.

## Tests and acceptance criteria

- Unit-test chart adapters for native axes, injection-relative ranges,
  collision-safe fraction label selection, and local peak-fill construction.
- Component-test visibility and color updates, range synchronization after a
  chart relayout event, fraction selection, baseline anchors, multiple
  accepted peaks, and integration-bound updates through a mocked Plotly API.
- Browser-test a generated dense chromatogram plus ÅKTA-shaped annotation
  fixtures: opening the run, zooming, toggling a trace, selecting a fraction,
  accepting two peaks, and changing an accepted bound must finish without
  overlapping fraction-label clutter or a stalled interaction.
- Verify the supplied ÅKTA imports still put Injection at 0 mL, retain fraction
  events, and preserve raw instrument coordinates in exported review data.
- Before merge, run typecheck, lint, the complete unit suite, production build,
  and focused browser tests. A visual screenshot review must confirm the dense
  run is legible at desktop width.
