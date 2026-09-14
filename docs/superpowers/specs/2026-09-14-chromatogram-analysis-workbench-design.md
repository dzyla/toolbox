# Chromatogram Analysis Workbench Design

## Purpose

Turn the existing chromatography run viewer into an analysis workspace for real
ÅKTA/UNICORN ASCII exports. The workspace must make native traces, injection,
fractions, baseline choices, peak boundaries, and integrated areas visible and
reviewable without changing the imported instrument data.

## Scope and safety boundaries

- All parsing and analysis run in the browser; uploaded laboratory data is not
  transmitted.
- Imported coordinates and signals remain immutable raw records. Displayed
  volumes may be injection-relative, but exports retain the original values and
  record the display offset.
- A bare ÅKTA `UV` channel continues to require detector-wavelength review
  before a user interprets it as A280.
- A candidate, manually drawn region, or adjusted region is not a derived peak
  record until the user explicitly accepts it.
- Peak integration uses the selected UV analysis trace after the selected
  baseline correction. Every derived export records the baseline and exact
  integration bounds.

## ÅKTA annotations and volume origin

The paired-channel ASCII reader already retains numeric traces on independent
volume axes. It will additionally recognize sparse paired channels named
`Fraction` and `Injection`:

- Each Fraction axis/value pair becomes an ordered collection event
  `{ label, volumeMl }`. Repeated labels or discontinuous collection records are
  retained as individual events rather than collapsed into one label.
- Fraction display bands extend from an event to the next event, with the final
  band ending at the end of the visible chromatogram. Labels appear above the
  plot where space permits and have a compact selectable list for dense runs.
- The first finite Injection-axis coordinate establishes `injectionVolumeMl`.
  The viewer shows an injection marker at displayed 0 mL and subtracts this
  offset from all plotted x values. When no Injection channel exists, the
  offset is zero and the UI says that the instrument origin is in use.
- Original axes, labels, and injection coordinates remain in the raw import and
  audit exports. The derived export includes `displayVolumeOffsetMl`.

This directly supports the supplied ÅKTA exports, whose injection channels have
a sparse first coordinate and whose fraction channels contain label-bearing,
independently sampled positions.

## Trace controls and chart

The viewer is a single SVG chart with an analysis-aware UV trace and independent
native overlays. Its control strip contains one row per trace:

- A pressed visibility toggle controls whether the trace is rendered.
- An accessible color input changes that trace's stroke and legend swatch.
- UV is the primary analysis trace. Other native traces remain independently
  normalized so a conductivity or `% Cond` overlay cannot change UV peak areas.
- Raw UV and baseline-corrected UV can both be shown, with the corrected signal
  visually distinguished. The raw trace remains the reference data.

The viewport holds an x-domain in display-volume units. It supports wheel zoom
around the pointer, pointer-drag panning, `Fit run`, `Reset zoom`, and a
`Focus selected fractions` action. Zoom affects plotting and fraction labels,
not parsing or peak area calculations. Empty, reversed, and less-than-two-point
ranges are rejected by the state helper rather than producing an invalid SVG.

The chart renders:

- a dashed vertical injection line at 0 mL when an injection is known;
- switchable fraction bands and labels;
- raw/corrected UV and active native trace paths;
- a baseline path whenever a non-none baseline is active;
- translucent, color-matched accepted peak regions bounded by vertical handles.

The style colors, active traces, fraction-display choice, and viewport are held
in the Run & Fractions panel and exported as review state.

## Baseline definition

Existing `none`, `endpoint`, and `rolling-minimum` modes remain available. A
new `manual-linear` mode adds two finite anchor points, each expressed as a
volume and a signal value. The chart renders the anchor line, and every trace
point receives the linearly interpolated baseline value.

For a manual baseline, the panel exposes editable start/end volume and signal
inputs. It validates that the two volumes are distinct and lie inside the raw
UV extent. Invalid anchors show a blocking explanation and cannot be used to
accept an integration. Replacing source data resets manual anchors to avoid
applying them to a different run.

## Peak selection and integration

Peak candidates remain a convenience rather than an automatic result. The user
can accept any number of candidates. Accepted peaks have stable local IDs and
store a source (`candidate` or `manual`), initial apex if detected, and editable
start/end bounds.

The manual integration controls add a new accepted region; they do not replace
an earlier one. Each accepted-peak card shows its index, provenance, editable
bounds, recalculated area, and remove action. Updating valid bounds immediately
reintegrates the baseline-corrected UV values with the existing trapezoidal
calculation. Candidate and accepted regions are shaded in the chart; selected
cards receive a stronger outline. Overlap is allowed but explicitly flagged in
the card because it can double-count area.

Candidate detection and integration retain raw physical volume coordinates.
Only chart presentation subtracts the injection offset.

## Data model and module boundaries

`src/core/chromatography/import.ts` owns ASCII parsing. Its `ChromatogramImport`
gains strongly typed fraction events and optional injection volume alongside the
existing numeric traces. Generic delimited imports preserve their current
fraction-label behavior.

`src/core/chromatography/analysis.ts` owns pure review-state helpers:

- `applyBaseline` receives optional manual anchors and supports
  `manual-linear`;
- viewport helpers constrain/focus a display-volume range;
- fraction-bound helpers transform ordered collection events into visible bands;
- accepted-peak helpers validate bounds and re-integrate a supplied trace.

`src/tools/sec/ChromatogramPlot.tsx` becomes the focused interactive chart.
It receives records and callbacks, contains no parsing or integration rules,
and is testable through accessible controls and SVG labels. `RunFractionsPanel`
owns imported data, user review state, exports, and the surrounding controls.

## Error handling and audit exports

Malformed sparse annotation pairs produce one concise parser notice and do not
prevent numeric UV data from loading. Unknown paired ÅKTA channels are retained
in source headers but are not fabricated into trace types.

Derived JSON contains source filename/text provenance, original and display
volume origin, active trace/color settings, viewport, fraction visibility and
selection, baseline configuration, candidate details, accepted peaks, and their
integrations. Derived CSV emits one row per accepted peak with IDs, provenance,
bounds, and area. Raw exports remain raw and do not include calculated values.

## Testing and verification

- Core parser tests use compact fixtures that mirror the supplied files to pin
  sparse injection parsing, ordered/labeled fraction events, and preservation
  of legacy ÅKTA numeric traces.
- Core analysis tests pin manual-linear baselines, fraction bands, viewport
  constraints, and multiple integrations with edited bounds.
- UI tests cover trace activation/color choice, multiple accepted shaded peaks,
  manual baseline controls, zoom reset/fraction focus, injection origin, and
  fraction visibility/selection.
- The focused browser test loads a representative ÅKTA fixture, changes an
  overlay, accepts more than one peak, and verifies the injection and fraction
  annotations before the complete typecheck, lint, unit-test, build, and
  browser suite run.
