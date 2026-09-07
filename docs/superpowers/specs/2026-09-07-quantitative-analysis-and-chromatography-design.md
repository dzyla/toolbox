# Quantitative analysis and Chromatography Workbench

**Status:** approved by request; implementation plan next  
**Date:** 2026-09-07

## 1. Purpose and scope

Bio-Bench will add two browser-local, evidence-aware workflows:

1. **qPCR / RT-qPCR Analyzer** for reviewable Cq-table import, assay QC, relative expression, and standard curves.
2. **Chromatography Workbench**, replacing the user-facing SEC Calibration name while retaining its existing SEC calibration workflow. It adds import and analysis of chromatography runs, fractions, UV traces, method suggestions, and UV-Vis spectra.

The tools must not treat a plausible result as an experimentally validated result. Raw source data stay immutable; transformations, exclusions, parameters, and warnings remain visible and travel with exports.

This scope does not claim to control an instrument, write UNICORN methods, decode proprietary UNICORN result archives, identify a protein from a trace, or guarantee a purification/labeling outcome.

## 2. Shared product rules

- **Local-first:** parsing, fitting, plotting, and exports run in the browser. Import stays on-device.
- **No silent format assumptions:** imported columns are shown and mapped before analysis. A parser reports ignored rows, duplicate samples, missing values, unit guesses, and unsupported metadata.
- **Claims carry status:** values are `raw`, `derived`, `suggested`, `review required`, `blocked`, or `failed`; suggestions are never called validated methods.
- **Raw is immutable:** baseline changes, peak bounds, qPCR exclusions, and selected controls produce a derived analysis record rather than modifying source values.
- **Method record:** CSV/JSON/text exports include app version, source filename, import notices, settings, all user decisions, formulas, references, and warnings.

## 3. qPCR / RT-qPCR Analyzer

### 3.1 Input and import

The first release accepts paste/CSV/TSV Cq tables and normalizes them to records:

```ts
interface QpcrObservation {
  id: string;
  sample: string;
  target: string;
  cq: number | null;
  technicalReplicate?: string;
  biologicalReplicate?: string;
  condition?: string;
  well?: string;
  role?: 'sample' | 'ntc' | 'no-rt' | 'positive-control' | 'standard';
  standardQuantity?: number;
  exclusion?: { reason: string; decision: 'include' | 'exclude' };
}
```

Recognize common headings (`Sample Name`, `Target Name`, `Cq/Ct/Cp`, `Well`, `Quantity`) and otherwise require a visible one-time column mapping. Empty, nonnumeric, and explicitly undetermined Cq values are retained as notices, never coerced to zero. Vendor-specific parsers can be added only with versioned, redacted fixture exports; a robust delimited-table importer is the interoperable baseline.

### 3.2 Guided analysis

The interface follows **Import → Map controls & replicates → Assay QC → Normalize → Results & export**.

- Calculate technical-replicate mean, SD, range, count, and explicit candidate outliers. No candidate is excluded without a reason and confirmation.
- Standard curves fit Cq against `log10(quantity)`, report slope, intercept, R², usable range, and efficiency `E = 10^(-1/slope) - 1`. Failed/insufficient standards block absolute quantities.
- For relative expression, users select target(s), a calibrator condition, and one or more reference genes. Reference normalization uses the geometric mean of reference quantities/Cq-derived quantities.
- `2^-ΔΔCq` is available only after the user attests target/reference efficiencies are comparable; otherwise use the efficiency-corrected Pfaffl form with explicit per-assay efficiencies.
- NTC, no-RT, positive-control, replicate, and reference-gene concerns appear as visible blockers/warnings. The tool does not infer a reference gene's stability from a single experiment.
- Outputs include per-sample normalized expression, fold change, confidence summaries where the supplied replicates justify them, QC table, and a MIQE-oriented reporting checklist. They do not establish biological significance or replace statistical-design review.

### 3.3 qPCR verification

Fixtures cover generic 96/384 tables, comma/tab separators, header aliases, malformed values, standard curves with known efficiencies, comparable/non-comparable efficiency branches, multiple reference genes, invalid controls, missing replicates, and accepted/rejected exclusion decisions. References include MIQE (Bustin et al., 2009) and Pfaffl's efficiency-corrected model. The science panel makes the comparable-efficiency condition for `2^-ΔΔCq` explicit.

## 4. Chromatography Workbench

### 4.1 Naming and continuity

The route remains `sec` for stable links. Registry name and page title change from **SEC Calibration** to **Chromatography Workbench**. Tabs are:

1. **SEC calibration** — existing standards/Kav workflow, unchanged and independently tested.
2. **Run & fractions** — trace import, review, peaks, fractions, and amount estimates.
3. **Method planner** — sequence-informed ion-exchange suggestions and a transparent gradient simulator.
4. **UV-Vis spectra** — spectrum import, scatter correction option, and fluorescent-labeling efficiency.

### 4.2 Import contract

Import accepts browser-local CSV, TSV, and text/UNICORN ASCII exports. It recognizes the documented curve/peak/fraction exports from older UNICORN Evaluation and newer UNICORN 7 result exports through column aliases, but never promises support for proprietary result archives or Excel-native workbooks without fixtures.

The importer normalizes to:

```ts
interface ChromatogramPoint {
  volumeMl: number;
  uv280?: number;
  uv260?: number;
  conductivityMsCm?: number;
  pressureBar?: number;
  percentB?: number;
  ph?: number;
  [detector: string]: number | undefined;
}
interface Fraction {
  id: string;
  label: string;
  startVolumeMl: number;
  endVolumeMl: number;
  volumeMl: number;
  measuredA280?: number;
}
```

Detected mappings are presented for confirmation. When a trace has time but no volume, volume may be derived only from an explicitly selected constant flow rate; otherwise it remains time-based and volume-dependent features are blocked. Fractions can originate from an imported fraction table or manual reviewable boundaries.

### 4.3 Trace, peaks, fractions, and protein amount

- Display synchronized UV, conductivity, pressure, pH, `%B`, fractions, manual integration bounds, and raw-versus-derived overlay.
- Baseline modes are `none`, linear endpoints, and rolling minimum; the selected baseline is never silently applied.
- Detect candidate peaks after smoothing only on a derived trace. Require prominence, minimum width, and a user-visible review before a candidate becomes a reported peak. Report apex, start/end volume, height, area in detector units·mL, and whether it touches imported range boundaries.
- Sequence-derived protein extinction coefficient is available through the existing Protein Workbench calculation. With entered optical path length and selected A280 baseline, calculate fraction concentration by Beer-Lambert and amount by `amount = concentration × fraction volume`. All such quantities are labelled *UV-derived estimate*; they are blocked for absent/zero extinction coefficient, path length, A280 data, or volume.
- Integrating a trace provides an estimated A280-derived amount only under a defined constant path length and correctly scaled chromatogram signal. It is not a replacement for a calibrated assay.

### 4.4 Method planner and gradient simulator

The planner accepts a protein sequence, computes pI/epsilon through shared core protein functions, and asks for target pH, purification stage, tag, sample conductivity, and optional column constraints.

- Suggestions use a simple transparent rule: at a pH sufficiently below protein pI, propose cation exchange; above pI, anion exchange; near pI, state low-binding/solubility risk and do not assert a resin choice. Hydrophobic interaction and affinity are not inferred solely from sequence.
- Resin choices and buffer A/B presets are curated local data with citations and are suggestions, not instrument recipes. Buffer A is low salt and Buffer B is high salt for ion exchange; pH, buffer species, and salt concentration remain editable. The app passes accepted selections to the existing Buffer & Media Recipes workflow as a recipe draft rather than duplicating chemical calculations.
- The simulator takes column volume, flow rate, initial/final `%B`, optional hold, gradient length in column volumes, and sample/column limits. It plots `%B`, programmed buffer volume, flow/time, and optional conductivity only when the user has supplied a calibration. It does not equate `%B` to conductivity or predict binding capacity/yield.

### 4.5 Verification

Fixtures cover UNICORN-style ASCII/CSV headers, current curve exports, fraction tables, decimal/locale issues, time-only traces, malformed data, known synthetic overlapping peaks, manual boundaries, and Beer-Lambert amount calculations. Algorithm tests pin peak candidates and ensure data-quality blockers prevent amount/method claims.

## 5. UV-Vis spectra and scattering correction

### 5.1 Spectrum import and plot

Accept a two-column wavelength/absorbance file and delimited multi-sample spectra. The importer lets users map wavelength and sample columns, keeps duplicate wavelengths/reporting issues visible, plots raw spectra, and exposes selected wavelength readouts, A260/A280, baseline notes, and CSV/SVG export.

### 5.2 Optional scatter correction

Scatter correction is off by default. When enabled, default fit points are the supplied measurements from **300–340 nm**, as requested; the range remains editable and a notice recommends a non-absorbing region appropriate to the sample. Only finite positive absorbances enter the log fit.

Fit:

`log10(A) = m × log10(λ) + b`

and extrapolate the fitted scattering contribution to 280 nm:

`A_scatter,280 = 10^(m × log10(280) + b)`

Then report, without replacing raw data:

`A280_corrected = A280_observed − A_scatter,280`

The output includes point count, slope, R², observed A280, predicted scatter, corrected A280, and warnings for nonpositive data, too few points, poor fit, or a nonpositive corrected value. It is a scattering estimate—not proof that aggregation has been removed or that the protein is monodisperse. This follows the requested log–log extrapolation approach and is cross-checked against NIST/USP guidance on scattering correction.

## 6. Fluorescent protein-labeling efficiency

The first release implements the most reliable general approach: use the **manufacturer-provided** dye absorption maximum, extinction coefficient, and A280 correction factor rather than silently assuming values for a dye/lot/solvent.

Inputs are protein sequence or protein epsilon, path length, observed A280, dye absorbance at its lambda-max, dye epsilon, and dye `CF280`. Scatter-corrected A280 may be opted into before dye correction.

```text
A280_protein = A280_observed − A280_scatter(optional) − CF280 × A_dye,max
[protein] = A280_protein / (epsilon_protein × pathLength)
[dye] = A_dye,max / (epsilon_dye × pathLength)
degree of labeling = [dye] / [protein]
```

The UI reports dye/protein ratio, both concentrations, and every correction. It blocks zero/negative corrected protein absorbance and warns that DOL depends on the supplied manufacturer coefficients, free-dye removal, path length, and spectral overlap. It does not declare labeling complete or functional.

## 7. Delivery sequence

1. qPCR core types/parser/QC/normalization/tests, then guided view and exports.
2. Chromatography core data/import/trace/peak/fraction foundations, then rename and integrate existing SEC tab.
3. Sequence-informed planner and gradient simulator, including explicit buffer hand-off contract.
4. UV-Vis spectrum parser/plot/scatter correction and dye-labeling calculator.
5. Contract, component, browser, accessibility, and release review across all workflows.

## 8. Acceptance criteria

- A qPCR Cq table cannot emit relative expression without mapped targets, controls, and a stated normalization path.
- A chromatogram cannot claim volume/amount if its required units or optical inputs are unknown.
- Every imported mapping, peak selection, baseline, fraction boundary, buffer suggestion, qPCR exclusion, and correction is visible and exportable.
- Raw spectra/chromatograms remain downloadable after any derived analysis.
- qPCR, trace imports, and spectra have fixture-driven unit and UI tests; their primary paths have browser tests.
- Science panels cite MIQE, the qPCR efficiency model, UNICORN export/source guidance, Beer-Lambert assumptions, scattering guidance, and dye-labeling calculation sources.
