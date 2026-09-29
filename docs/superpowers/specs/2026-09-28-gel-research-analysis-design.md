# Gel Analyzer: Research-Grade Quantification (Phase 1)

Date: 2026-09-28
Tool: `src/tools/gel/` (UI, hooks) · `src/core/gel/` (algorithms)

## Goal

Make the gel analyzer's numbers defensible in a publication (Part A), then add the replicate / condition
workflow a Western-blot or densitometry study needs (Part B). Sizing accuracy (smile correction, size
confidence intervals, overlapping-band fitting) and multi-blot pooling are Phase 2 and out of scope here.

Success criteria:
- No silently fabricated or silently defaulted value reaches the table, charts or CSV.
- Every result that is outside a validated range (saturated, extrapolated, below LOQ) carries a visible flag
  in the UI and a column in the CSV.
- A user can label lanes by condition and replicate, pick a normalization, and export per-lane tidy data,
  a group summary with statistics, and a methods paragraph that reproduces the analysis.

## Part A: Correctness

### A1. Saturation and source integrity
- One threshold: `SATURATION_WARN = 0.01` in `core/gel/quant.ts` is the only definition. Remove the 5 % constant in
  `tools/gel/analysis.ts`; the UI, CSV and `science.ts` all read the core constant.
- Image loading records a `SourceInfo { format: 'png'|'jpeg'|'webp'|'tiff'|'bmp'; bitDepth: 8|16|32; lossy: boolean;
  rescaled: boolean }`. `rescaled` is true when the loader min–max normalizes (32-bit float TIFF).
- When `rescaled` is true, the band saturation is reported as `null` ("not assessable"), not as a number.
- A data-quality panel in the Quant tab lists:
  - lossy input (JPEG, lossy WebP): "compression distorts densitometry, use the imager's raw TIFF"
  - 8-bit depth: "limited dynamic range"
  - rescaled float
  - any saturated band
  - the geometric transforms applied
- `SourceInfo` is saved with the project. Projects saved before this change load with `SourceInfo` absent, which the
  panel shows as "source unknown".

### A2. Monotone calibration spline
- Replace the natural cubic spline in `calibration.ts` with a monotone piecewise cubic Hermite interpolant
  (Fritsch–Carlson) of log10(size) vs y.
- The model id becomes `'monotone'`. Projects that stored `'spline'` load as `'monotone'`.
- The UI label stays "Monotone cubic spline", which is now accurate.
- Test: on ladder data with uneven spacing, the fitted curve is strictly monotone between knots and never leaves the
  range of the two adjacent knots.

### A3. Ladder band matching
- New `core/gel/ladder-match.ts`: `matchLadder(peaks: {y, prominence}[], sizes: number[]): LadderMatch`.
- The matcher is a monotone alignment (dynamic programming) that may skip peaks (extra bands) and skip sizes (missed
  bands). Among alignments that use at least `min(nPeaks, nSizes) − 2` pairs, and at least 3 pairs, it chooses the one
  with the lowest residual SD of a log-linear fit.
- It returns the pairs, the skipped peaks and sizes, and a residual SD.
- Manual overrides: a `ladderSizeMap: Record<bandId, number | null>` in workspace state.
  - A number pins that band's size.
  - `null` excludes the band from calibration.
  - Overrides take precedence over the matcher.
- In the ladder lane, the band table shows the **assigned** size, the **fitted** size and the residual (%). Bands
  that are not assigned show "–".
- The existing index-pairing code in `workspace/analysis.ts` and the unused `assignLadder` are removed.
- Tests:
  - one missing ladder band in the middle, recovered correctly
  - one spurious extra peak, skipped
  - an override is respected

### A4. Mass standard curve
- Remove the `1000/2^i` fallback. Standard-lane bands pair with preset masses top-down.
  - Bands beyond the preset length are "unassigned" and excluded.
  - Per-band overrides (`customMassMap`) are unchanged.
- `MassCalibration` gains:
  - `range: {minMass, maxMass, minNet, maxNet}`
  - `residualSD`
  - `lod = 3.3·σ/|slope|` and `loq = 10·σ/|slope|` in mass units (ICH Q2), where σ is the residual SD of the fit in
    net-intensity units and slope is dNet/dMass at the lowest standard (exact for linear models; the local
    derivative for quadratic and power)
  - `lod`/`loq` are `null` when there are fewer than 3 points
- Each band's `massEst` carries flags: `extrapolated` (net outside `[minNet, maxNet]`) and `belowLoq`.
- Test: a linear series with known noise gives the analytic LOD/LOQ; extrapolated and below-LOQ flags are set
  correctly.

### A5. Reference band
- When `refBandId` is unset or not in the lane, `ratio` is `null`.
  - The table shows "–" and a one-line prompt: "pick a reference band".
  - The CSV column is empty.
- There is no fallback to the first band.

### A6. Baselines (`core/gel/background.ts`)
- **Rolling ball:** a true 1-D rolling ball. Grey-scale opening with a circular-arc structuring element of radius `r`
  (height scaled to the profile's intensity range, as in ImageJ's rolling-ball), followed by the documented light
  Gaussian smoothing (σ = r/10).
  - Each band whose width (y1−y0) exceeds `r` gets a `baselineWarning` of "band wider than ball radius; increase radius".
- **Shared baseline:** computed per row index over the lanes that have that row.
  - Each lane's baseline is taken over its own length, and rows past the shortest lane use the lanes available.
  - Test: lanes of unequal length produce no NaN or undefined values.
- The unused `roi` method and its option are removed.

### A7. Minor
- Loading SD and CV use the sample SD (n−1). With n = 1 the SD is `null`.
- A 90° rotation or a flip is an exact index remap (no bilinear resampling).
- Deskew and arbitrary-angle transforms still resample, and the data-quality panel lists them.

## Part B: Condition / replicate quantification

### B1. Lane metadata
- A new `laneMeta: Record<laneId, { role: 'sample'|'ladder'|'standard'|'excluded'; condition: string; replicate: number | null }>`.
- `role` for ladder and standard lanes is derived from `ladderLaneId` and `massLaneId`, and editing it keeps them in sync.
- It is edited in a compact lane table in the Quant tab, with a bulk action: "assign conditions by pattern" (e.g. 3
  conditions × 3 replicates, in order).
- `laneLabels` stay as the display name. If `condition` is empty, it defaults to the label.

### B2. Target and normalization
- The **target** is a band cluster from `computeTargetBandClusters` (by size, or Rf if uncalibrated), selected by size.
- **Normalization modes:**
  - `none`: value = target net
  - `control-band`: a second cluster at a chosen size (e.g. actin 42 kDa); value = target net ÷ control net
  - `total-lane`: value = target net ÷ total lane signal (the existing TPN)
- A lane with no target or control band, or with a control net ≤ 0, gives `null` with a reason. It is never 0 and
  never 1.
- Flags propagate from bands to the lane value: saturated (target or control), extrapolated or below LOQ when mass
  units are used, and baseline warning.

### B3. Group statistics (`core/gel/groups.ts`, pure)
- `summarizeGroups(values: {laneId, condition, replicate, value, flags}[], controlCondition): GroupSummary[]`.
- Per condition: n, mean, sample SD, SEM, 95 % CI (t with n−1 df, using `core/stats` `tCritical95`), CV%, and fold
  change = mean ÷ mean(control).
- Optional: a Welch t-test of each condition vs. control, two-sided.
  - p-values are Holm-adjusted across the comparisons.
  - It uses the existing t CDF in `core/stats`.
  - It is shown only when both groups have n ≥ 2, with a persistent note that n < 3 is not enough for inference.
- Excluded lanes and `null` values are left out of the statistics and counted as "n excluded".
- Tests: hand-computed means, SDs and CIs; a Welch t-test checked against reference values (R `t.test`); Holm ordering.

### B4. UI
- The Quant tab gets a third sub-view, **Groups**, which shows:
  - the lane-metadata table
  - target / normalization / control-condition pickers
  - the summary table
  - a dot plot (every replicate shown, mean ± SD bar), built on the existing chart conventions of `BandQuantChart`
- The data-quality panel (A1) is shown above it.

### B5. Exports
- **Tidy CSV:** one row per lane × band, with these columns:
  - lane, label, role, condition, replicate, band, peakY
  - size, size fitted, size residual
  - raw, background, net, % lane, ratio
  - mass, mass flags
  - saturation, baseline warning
  - normalized value, null reason
- **Group summary CSV.**
- **Calibration CSV:** size-ladder points (y, assigned, fitted, residual) and mass-standard points, plus the fit
  parameters, R², LOD and LOQ.
- **Methods text** (copy-to-clipboard and .txt), generated from the current state:
  - source info
  - transforms
  - lane width
  - baseline method and radius
  - band detection sensitivity
  - calibration model and R²
  - normalization mode
  - the statistics used
  - the tool version
- The existing band and loading CSVs are replaced by the tidy CSV. The annotated PNG, SVG and PDF are unchanged.

### B6. Persistence
- `laneMeta`, `ladderSizeMap`, the normalization settings and `SourceInfo` are added to the project schema.
- The schema version is bumped. Missing fields load as defaults, so old projects open unchanged.

## Structure

| Unit | Responsibility |
|---|---|
| `core/gel/ladder-match.ts` (new) | pure ladder alignment |
| `core/gel/calibration.ts` | monotone spline; mass range, LOD and LOQ |
| `core/gel/background.ts` | true rolling ball; shared baseline for unequal lane lengths; ROI removed |
| `core/gel/groups.ts` (new) | normalization-independent group statistics and Welch/Holm |
| `core/gel/quant.ts` | single saturation constant; nullable saturation |
| `src/lib/image.ts` | returns `SourceInfo` |
| `tools/gel/workspace/analysis.ts` | uses the matcher, the overrides, and nullable ratio/mass flags |
| `tools/gel/workspace/groups.ts` (new hook `useGelGroups`) | lane metadata → values → summaries |
| `tools/gel/GelGroupsView.tsx` (new), data-quality panel | UI |
| `tools/gel/workspace/exports.ts` | tidy, group, calibration CSVs; methods text |

## Testing
- TDD for every core change, using known-answer tests on `core/gel/synthetic.ts` gels:
  - a ladder with a missing band and one with an extra band
  - a saturated band
  - a float TIFF that was rescaled on import
  - lanes of unequal length
  - spline monotonicity
  - LOD/LOQ
  - group statistics and Welch/Holm
- App tests:
  - the Groups view renders
  - a missing reference band shows "–"
  - the data-quality warnings appear for JPEG input
- Extend the e2e export spec to cover the new CSVs.
- The existing gel test suites must still pass. Where a test pinned the old, incorrect behaviour (the 5 % threshold,
  index pairing), it is updated and the change is noted in the commit.

## Out of scope (Phase 2)
- Smile correction and curved lanes.
- Confidence intervals on size estimates.
- Deconvolution of overlapping bands (Gaussian fitting).
- Pooling several gels or blots into one analysis.
- Exposing an ROI baseline.
