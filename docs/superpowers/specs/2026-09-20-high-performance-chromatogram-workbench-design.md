# High-Performance Chromatogram Workbench

## Decision

Replace the current Plotly wrapper with a versioned chromatogram workbench that
separates durable analysis data from rendered view data. The workbench retains
the full imported signal for integration and export, while rendering a bounded,
viewport-aware representation. It supports multiple imported runs, native
instrument channels, interactive selections, editable axis limits, fraction
pooling, shaded peak annotations, and explicit peak integration.

The existing parser and chromatography mathematics remain the authoritative
source for import, baseline correction, candidate detection, and area
calculation. This change is a new UI/state/rendering layer, not a scientific
algorithm rewrite.

## User workflow

The Run & fractions tab becomes a single analysis workbench.

- Users may add one or more CSV/TSV/ÅKTA exports. Each run has a durable name,
  color family, visibility switch, injection offset, trace visibility choices,
  and its own fraction events. One run is the active analysis run; other runs
  may be overlaid for visual comparison but cannot silently contribute to an
  active-run integration.
- The chart toolbar has inspect, peak-select, and fraction-select modes; a
  reset-view action; an autoscale-Y action; and trace visibility controls.
  Peak-select draws a range directly on the chart. Fraction-select chooses all
  fraction bands crossed by the dragged range. Exact numeric controls remain
  available in the inspector.
- The inspector owns editable X and Y ranges, trace axes/colors, baseline
  settings, candidate list, active selection, accepted peaks, and fraction
  pools. Y bounds are explicit numeric controls with `Apply` and `Autoscale`,
  so users can reliably set limits independently of Plotly autorange.
- Accepting a candidate or selection creates an explicit peak record. The
  selected peak has a translucent shaded area between its selected baseline and
  corrected UV signal, boundaries, and an integration result. Multiple peaks
  are supported; overlap warnings explain that overlapped areas double-count.
- Fraction bands remain in a dedicated compact lane. A selected range selects
  all intersected fractions; a pool is a named list of selected fraction labels
  with start/end bounds and an exportable record. Dense runs show only labels
  that fit, plus every selected label.

Mobile keeps the chart and toolbar first; the inspector is a collapsible panel
below it. All chart operations also have semantic buttons/fields, so canvas
interaction is never the only way to perform analysis.

## Data and state model

`ChromatogramRun` wraps the existing immutable `ChromatogramImport` with a
stable run id, display name, per-run display settings, and persisted review
state. It never mutates imported points or trace values.

`ChromatogramWorkspace` owns an ordered run list, active-run id, shared display
viewport, y-axis policy, selected peak id, selected fraction ids, and named
fraction pools. Active-run analysis state retains the existing baseline mode,
manual baseline anchors, candidates, accepted peaks, and export records.

An accepted peak stores its id, run id, source (`candidate` or `manual`),
instrument-coordinate start/end bounds, baseline definition/result, and
integration result. UI coordinates are injection-relative only at the adapter
boundary. Exports retain raw instrument coordinates and add workspace/run
identifiers without removing existing derived fields.

## Rendering and performance architecture

The chart owns exactly one Plotly graph instance for its lifetime. Preact does
not recreate that graph while the user pans, zooms, edits limits, toggles a
trace, selects a region, or changes fraction visibility.

### Full-resolution truth; display-resolution rendering

All imported arrays remain full resolution and are the only arrays used by
baseline correction, candidate detection, `integratePeak`, and raw export.
The chart adapter derives a separate render series using deterministic
min/max envelope decimation:

1. Clip an ordered trace to the visible X range, including interpolated
   boundary samples.
2. Divide it into horizontal-pixel buckets using the measured plot width.
3. Keep the first/last sample and each bucket's local minimum and maximum in
   X order.
4. Cap normal display output at roughly two points per plot pixel plus boundary
   samples. A zoomed-in range can therefore reveal more original samples, but
   no render ever scales linearly with a 30k+ full trace.

Derived render series are cached by run id, trace id, viewport, graph width,
and display offset. Changing selection, inspector values, colors, a fraction
pool, or peak metadata does not recompute a trace envelope. Local shaded peak
overlays use the complete data inside their small bounds and are separately
bounded before sending them to Plotly.

### Incremental Plotly updates

`newPlot` runs once after lazy loading Plotly. Subsequent operations use the
smallest API compatible with the change:

- `relayout` updates X/Y ranges, fraction shapes/labels, tool mode, and
  baseline/peak shapes.
- `restyle` updates trace visibility, color, line width, and legend state.
- `addTraces`/`deleteTraces` (or one `react` with a new trace schema) is used
  only when runs/traces are added or removed.
- `react` is reserved for a dataset identity or trace-order change, never for
  generic workspace state.

The component holds the current callbacks and model in refs, attaches Plotly
event listeners once, debounces settled relayout commits, and ignores relayout
events caused by its own controlled updates. Continuous pan/zoom remains local
to Plotly; durable viewport state is committed only after the interaction has
settled.

`scattergl` remains the main trace renderer. Fraction annotations are capped:
no more than one visible band per rendered pixel unless selected, labels use a
measured collision stride, and selected bands always remain visible. Fraction
hit testing uses a sorted event index in TypeScript rather than thousands of
interactive Plotly objects.

## Interaction contract

- **Inspect:** hover/click reports all visible traces at a shared x position;
  clicking an accepted shaded peak selects it.
- **Peak select:** Plotly box selection maps its X extent to the active run,
  clamps it to valid data, and places it in the pending integration controls.
  The user can adjust exact bounds and choose baseline before accepting.
- **Fraction select:** the same X extent is intersected with active-run fraction
  bands, toggling matching labels. A nearest-event click selects one band.
- **Axis controls:** the typed `Y min` and `Y max` are parsed as a finite,
  ascending pair before `relayout`. Invalid values retain the last valid view
  and show an inline error. `Autoscale Y` computes values from the currently
  visible primary traces; `Fit run` resets X and Y to run extents.
- **Multi-run:** a run overlay can be hidden, shown, or assigned an axis. Its
  fraction lane is hidden by default unless it is active, avoiding ambiguous
  overlapping collection records. The inspector makes active-run switching
  explicit before any analysis modification.

## Failure handling and accessibility

Malformed imports remain isolated to their run and report parser notices; they
do not make other loaded runs unavailable. If Plotly fails to load, the UI
retains run/analysis state, shows a retry affordance, and exposes tabular peak
and fraction controls. The accessible chart summary reports active run, visible
traces, X/Y ranges, selected peak, selected fractions, and integration count.

## Testing and acceptance criteria

Unit tests cover envelope decimation (including extrema, boundaries, and a
strict output cap), range validation/autoscaling, fraction-range intersection,
multi-run identity, and local shaded peak data. They must prove integrations
still consume full-resolution values rather than display samples.

Component tests mock Plotly and prove that ordinary state updates call
`relayout` or `restyle` rather than `react`; typed Y limits apply; selection
maps to peak/fraction state; and active-run changes isolate integrations.

Browser tests import a generated 30,000-row run and a second comparison run,
then set Y limits, pan/zoom, toggle traces, create and accept a shaded peak,
select and pool fractions, and preserve the resulting derived export. The
workbench must remain usable without generating thousands of DOM nodes or
Plotly annotation objects. Typecheck, lint, all unit tests, build, focused
browser tests, and desktop/mobile screenshot review are required before merge.

## Scope boundaries

This work accepts delimited and ÅKTA ASCII exports already supported by the
parser; it does not add proprietary binary instrument formats or change the
scientific peak-detection algorithm. Multi-run overlays are comparison views,
not cross-run normalization or statistical alignment. Fraction pooling records
selection and bounds; it does not infer purity or concentration without the
existing user-supplied measurements.
