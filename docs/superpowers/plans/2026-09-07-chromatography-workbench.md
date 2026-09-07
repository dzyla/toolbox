# Chromatography Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand SEC Calibration into Chromatography Workbench with local chromatogram/fraction analysis, sequence-informed method suggestions, UV-Vis spectra, opt-in scatter correction, and dye-labeling efficiency.

**Architecture:** Preserve the framework-free SEC calculations and add focused `src/core/chromatography` modules for import, traces/peaks, UV-Vis, and method advice. The existing `sec` route becomes a multi-tab UI so shared links survive; each imported dataset is raw, while mappings, baselines, peak bounds, and calculations are derived and exportable.

**Tech Stack:** TypeScript, Preact, D3-compatible SVG plotting utilities, Vitest, Testing Library, existing protein and buffer core modules.

**Spec:** `docs/superpowers/specs/2026-09-07-quantitative-analysis-and-chromatography-design.md`

## Global Constraints

- Keep `sec` route stable; change the visible name to Chromatography Workbench.
- Support CSV, TSV, text, and UNICORN ASCII-style delimited exports; do not claim native/proprietary archive or Excel parsing.
- Never silently convert time to volume; require an explicit flow rate.
- Treat peak, amount, resin, gradient, scatter, and DOL results as derived/suggested, never bench-validated.
- Scatter correction is off by default and fits positive 300–340 nm points in log10 wavelength/log10 absorbance space.
- Dye coefficients and correction factor come from the manufacturer/user; do not silently guess them.

---

### Task 1: Chromatogram import model and mapping

**Files:**
- Create: `src/core/chromatography/import.ts`
- Create: `src/core/chromatography/index.ts`
- Create: `tests/core/chromatography-import.test.ts`

**Interfaces:**
- Produces `ChromatogramPoint`, `Fraction`, `ChromatogramImport`, and `parseChromatogram(text, mapping?)`.
- Canonical channels include `volumeMl`, `timeMin`, `uv280`, `uv260`, `conductivityMsCm`, `pressureBar`, `percentB`, and `ph`.

- [ ] **Step 1: Write failing tests for UNICORN-style aliases, generic CSV, TSV, fractions, and unmapped input.**

```ts
const parsed = parseChromatogram('Volume (ml),UV 280 (mAU),Cond (mS/cm),Fraction\n1.0,10,2,F1\n');
expect(parsed.points[0]).toMatchObject({ volumeMl: 1, uv280: 10, conductivityMsCm: 2 });
expect(parsed.fractions[0]).toMatchObject({ label: 'F1' });
```

- [ ] **Step 2: Run `npm test -- --run tests/core/chromatography-import.test.ts` and confirm failure.**
- [ ] **Step 3: Implement delimiter/header normalization and aliases.**

```ts
export const CHANNEL_ALIASES = {
  volumeMl: ['volume (ml)', 'volume', 'elution volume'], timeMin: ['time (min)', 'time'],
  uv280: ['uv 280 (mau)', 'uv280', 'a280'], conductivityMsCm: ['cond (ms/cm)', 'conductivity'],
  percentB: ['%b', 'buffer b'], pressureBar: ['pressure (bar)', 'pressure'], ph: ['ph'],
} as const;
```

Retain header/source mapping and notices. Convert mAU to AU only in an explicitly named derived accessor.

- [ ] **Step 4: Test time-only imports, explicit `flowMlPerMin` conversion, duplicate/invalid rows, and manual fraction bounds; run focused tests.**
- [ ] **Step 5: Commit `feat: add chromatography import model`.**

### Task 2: Baselines, peak candidates, fraction amounts, and core tests

**Files:**
- Create: `src/core/chromatography/analysis.ts`
- Modify: `src/core/chromatography/index.ts`
- Create: `tests/core/chromatography-analysis.test.ts`

**Interfaces:**
- Produces `applyBaseline(points, mode)`, `detectPeakCandidates(points, options)`, `integratePeak(points, start, end)`, and `estimateFractionAmount(input)`.

- [ ] **Step 1: Write failing tests for a known triangular peak, endpoint baseline, no-peak data, and Beer-Lambert fraction amounts.**

```ts
expect(integratePeak([{ volumeMl: 0, signalAu: 0 }, { volumeMl: 1, signalAu: 1 }, { volumeMl: 2, signalAu: 0 }], 0, 2).areaAuMl).toBeCloseTo(1);
expect(estimateFractionAmount({ a280: 0.5, epsilonMolar: 50000, pathCm: 1, fractionVolumeMl: 2 }).amountMg).toBeCloseTo(0.02);
```

- [ ] **Step 2: Run the focused test and confirm exports are missing.**
- [ ] **Step 3: Implement trapezoidal integration, `none`/endpoint/rolling-minimum baselines, local-maxima peak candidates with prominence and minimum-width thresholds, and Beer-Lambert conversions.**

For amount, use `molar = A/(epsilon×path)`, `mg/mL = molar×MW(g/mol)`, and `mg = mg/mL×mL`; block absent/invalid epsilon, MW, path, A280, or volume.

- [ ] **Step 4: Add tests for boundary-touching peaks, absent UV, negative baseline-corrected values, and all amount blockers; run focused tests.**
- [ ] **Step 5: Commit `feat: analyze chromatography peaks and fractions`.**

### Task 3: UV-Vis import, opt-in scatter correction, and fluorescent DOL core

**Files:**
- Create: `src/core/chromatography/spectra.ts`
- Create: `tests/core/spectra.test.ts`
- Modify: `src/core/chromatography/index.ts`

**Interfaces:**
- Produces `parseSpectrum`, `fitLogScatter`, `correctA280ForScatter`, and `calculateDyeLabeling`.

- [ ] **Step 1: Write failing fixed-value tests.**

```ts
const fit = fitLogScatter([{ wavelengthNm: 300, absorbance: 1 / 300 ** 2 }, { wavelengthNm: 320, absorbance: 1 / 320 ** 2 }, { wavelengthNm: 340, absorbance: 1 / 340 ** 2 }], 300, 340);
expect(fit.slope).toBeCloseTo(-2, 6);
expect(correctA280ForScatter(1, fit).correctedA280).toBeLessThan(1);
expect(calculateDyeLabeling({ a280: 0.8, dyeAbsorbance: 0.4, dyeEpsilon: 100000, correctionFactor280: 0.1, proteinEpsilon: 50000, pathCm: 1 }).dol).toBeCloseTo(0.5714, 4);
```

- [ ] **Step 2: Run `npm test -- --run tests/core/spectra.test.ts` and confirm failure.**
- [ ] **Step 3: Implement two-column/multi-column spectrum parsing, least-squares log fit, explicit scatter correction result, and DOL formulas.**

Reject zero/negative fit points and return warnings for fewer than two points, poor/undefined fit, or nonpositive corrected protein A280. DOL order is optional scatter correction, then `A280 - CF280×A_dye,max`, then Beer-Lambert concentrations and dye/protein ratio.

- [ ] **Step 4: Add tests for TSV, duplicate wavelengths, invalid ranges, nonpositive input, no scatter option, and blocked DOL; run focused tests.**
- [ ] **Step 5: Commit `feat: add UV-Vis and dye labeling calculations`.**

### Task 4: Sequence-informed ion-exchange advice and gradient simulator

**Files:**
- Create: `src/core/chromatography/method.ts`
- Create: `tests/core/chromatography-method.test.ts`
- Modify: `src/core/chromatography/index.ts`

**Interfaces:**
- Consumes `proteinP I`, `targetPh`, column volume, flow, start/end `%B`, holds, and gradient CV.
- Produces `suggestIonExchange`, `simulateGradient`, `GradientPoint`, and `MethodFinding`.

- [ ] **Step 1: Write failing recommendation and interpolation tests.**

```ts
expect(suggestIonExchange({ proteinPi: 9, targetPh: 7 }).mode).toBe('cation-exchange');
expect(suggestIonExchange({ proteinPi: 7.2, targetPh: 7 }).status).toBe('review-required');
expect(simulateGradient({ columnVolumeMl: 5, flowMlPerMin: 1, startPercentB: 0, endPercentB: 100, gradientCv: 10 }).atGradientEnd.percentB).toBe(100);
```

- [ ] **Step 2: Run focused test and confirm failure.**
- [ ] **Step 3: Implement transparent pI-distance advice, editable buffer-A/B suggestions, and a piecewise hold/linear-gradient simulator.**

Only advise cation exchange below pI and anion exchange above pI when distance is at least 1 pH unit; otherwise return review-required. Do not predict resin capacity, conductivity, or yield.

- [ ] **Step 4: Add tests for invalid flow/CV, pI-near-pH, endpoints, and hold segments; run focused tests.**
- [ ] **Step 5: Commit `feat: add chromatography method advisor`.**

### Task 5: Rename SEC and build Workbench UI

**Files:**
- Modify: `src/tools/registry.ts`
- Modify: `src/tools/sec/View.tsx`
- Modify: `src/tools/sec/science.ts`
- Create: `tests/app/chromatography.test.tsx`

**Interfaces:**
- Consumes all `src/core/chromatography` exports and existing `src/core/sec` calibration API.
- Produces tabs `SEC calibration`, `Run & fractions`, `Method planner`, `UV-Vis spectra` on stable `/tool/sec` routing.

- [ ] **Step 1: Write failing UI tests for new registry name, trace mapping, selected peak/fraction details, opt-in scatter correction, DOL warning, and planner review status.**
- [ ] **Step 2: Run `npm test -- --run tests/app/chromatography.test.tsx` and confirm failure.**
- [ ] **Step 3: Add tabs without regressing the calibration view, then implement trace and fraction import/review.**

Use visibly labeled raw/derived overlays. Candidate peaks require an “accept” action. Export raw and derived records as CSV/JSON via the existing export utilities.

- [ ] **Step 4: Add method planner with sequence input routed through the existing protein pI/epsilon core, editable buffer A/B cards, and a gradient SVG plot.**
- [ ] **Step 5: Add UV-Vis spectrum plot, 300–340 nm scatter opt-in control, readout table, and DOL calculator requiring user-supplied dye epsilon/CF280.**
- [ ] **Step 6: Make all component tests pass and run `npm run typecheck && npm run lint && npm test`.**
- [ ] **Step 7: Commit `feat: expand SEC into chromatography workbench`.**

### Task 6: Browser workflow and release verification

**Files:**
- Create: `tests/e2e/chromatography.spec.ts`

- [ ] **Step 1: Write a failing browser test that opens `/tool/sec`, imports a generic UV trace, confirms mapping, accepts a peak, and opens the spectrum tab.**
- [ ] **Step 2: Run `npm run e2e -- --grep Chromatography` and confirm it fails before the flow is implemented.**
- [ ] **Step 3: Add required accessible labels and interaction fixes only.**
- [ ] **Step 4: Run `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`.**
- [ ] **Step 5: Commit `test: cover chromatography workbench workflow`.**
