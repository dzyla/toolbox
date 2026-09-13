# Chromatography Focus and ÅKTA Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Focus chromatography on chromatography, move A280 spectrum correction to Protein Concentration, and import real ÅKTA/UNICORN ASCII chromatograms by file drop or paste.

**Architecture:** Keep `src/core/chromatography` as the single source for parsing and spectrum maths. Add a narrow ÅKTA paired-channel parser behind `parseChromatogram`, migrate the existing spectrum panel into a focused Protein Concentration component, and keep the SEC UI limited to its three chromatography workflows.

**Tech Stack:** Preact, TypeScript, Vitest, Testing Library, Vite, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-13-chromatography-focus-and-akta-import-design.md`

## Global Constraints

- Preserve pasted CSV/TSV parsing and all existing raw-versus-derived audit exports.
- Accept `.asc`, `.csv`, `.tsv`, and `.txt` chromatogram files entirely in-browser; do not upload laboratory data.
- Preserve the observed A280 and label the requested result as a log-space scattering adjustment.
- A bare ÅKTA `UV` channel must show a detector-wavelength verification notice before it is interpreted as A280.
- Keep the assurance route and deep links intact, but expose the entry point only in the footer.

---

### Task 1: Specify and implement the log-space A280 correction

**Files:**
- Modify: `tests/core/spectra.test.ts`
- Modify: `src/core/chromatography/spectra.ts`

**Interfaces:**
- Consumes: `fitLogScatter(points, 300, 340): LogScatterFit`
- Produces: `correctA280ForScatter(observedA280, fit): ScatterCorrection`, now with a log-space adjusted A280 and extrapolated log contribution for display.

- [ ] **Step 1: Write the failing test** — add a test with positive points at 300, 320, and 340 nm. Calculate `10 ** (log10(1) - (fit.slope * log10(280) + fit.intercept))` and expect it to equal `correctA280ForScatter(1, fit).correctedA280`.
- [ ] **Step 2: Run the test to verify it fails.** Run `npm test -- tests/core/spectra.test.ts`. Expected: the new assertion fails because the current code subtracts a linear predicted absorbance.
- [ ] **Step 3: Write minimal implementation.** Add `predictedScatterLogA280?: number` to `ScatterCorrection`; calculate the predicted log value and anti-log the requested subtraction. Retain invalid-input and undefined-fit warnings, and update public comments from linear correction to log-space adjustment.
- [ ] **Step 4: Run the focused test to verify it passes.** Run `npm test -- tests/core/spectra.test.ts`. Expected: all spectrum tests pass.
- [ ] **Step 5: Commit.** Run `git add tests/core/spectra.test.ts src/core/chromatography/spectra.ts` then `git commit -m "feat: use log-space A280 scatter adjustment"`.

### Task 2: Parse paired-channel ÅKTA/UNICORN ASCII exports

**Files:**
- Modify: `tests/core/chromatography-analysis.test.ts`
- Modify: `src/core/chromatography/import.ts`

**Interfaces:**
- Consumes: `parseChromatogram(text, options?): ChromatogramImport`
- Produces: `ChromatogramImport` whose `points` include the UV trace plus recognized conductivity and percent-B data from paired independent axes.

- [ ] **Step 1: Write the failing test.** Define a tab-delimited fixture with group row `Chrom.1`, channel row `Cond / % Cond / UV`, unit row `ml / mS/cm / ml / % / ml / mAU`, and two paired data rows. Assert `parseChromatogram` creates UV trace points containing the matching `conductivityMsCm` and `percentB`, emits a bare-UV detector notice, and retains standard `volume,uv280` parsing unchanged.
- [ ] **Step 2: Run the test to verify it fails.** Run `npm test -- tests/core/chromatography-analysis.test.ts`. Expected: the paired-channel assertion fails because the group row is currently parsed as a normal header.
- [ ] **Step 3: Write minimal implementation.** Add `parseAktaPairedChannels(lines): ChromatogramImport | undefined`. Recognize the three-row tab-delimited shape, collect supported axis/value pairs, build records on the UV axis, merge exact-axis conductivity and percent-B values, and return `undefined` for all other shapes so generic parsing remains authoritative. Map bare `UV` to the review trace only with a detector-verification notice and preserve malformed-row notices/source headers.
- [ ] **Step 4: Run the focused test to verify it passes.** Run `npm test -- tests/core/chromatography-analysis.test.ts`. Expected: every focused test passes.
- [ ] **Step 5: Commit.** Run `git add tests/core/chromatography-analysis.test.ts src/core/chromatography/import.ts` then `git commit -m "feat: import ÅKTA ASCII chromatograms"`.

### Task 3: Add a safe chromatogram file drop and preserve provenance

**Files:**
- Modify: `tests/app/chromatography.test.tsx`
- Modify: `src/tools/sec/View.tsx`

**Interfaces:**
- Consumes: a browser `File` with UTF-8 text content and extension `.asc`, `.csv`, `.tsv`, or `.txt`.
- Produces: populated source text, displayed filename, and `source.filename` in raw/derived JSON exports.

- [ ] **Step 1: Write the failing UI test.** Select `new File(['volume,uv280\\n1,0\\n2,4\\n3,0\\n'], 'run.asc', { type: 'text/plain' })` through label `Import chromatogram file`; await the filename and candidate peaks; export derived JSON and expect it to contain `"filename": "run.asc"`.
- [ ] **Step 2: Run the test to verify it fails.** Run `npm test -- tests/app/chromatography.test.tsx`. Expected: no labelled file input exists.
- [ ] **Step 3: Write minimal implementation.** Add a labelled `<input type="file">` accepting `.asc,.csv,.tsv,.txt`, an accessible keyboard-operable drop target, and `File.text()` loading. Reject unsupported extension/file-count states in a panel alert. Reset accepted peaks/fraction selection and carry the uploaded filename into the audit export; retain `pasted-chromatogram.csv` for pasted content.
- [ ] **Step 4: Run the focused UI test to verify it passes.** Run `npm test -- tests/app/chromatography.test.tsx`. Expected: every existing chromatography UI test and the file-import test pass.
- [ ] **Step 5: Commit.** Run `git add tests/app/chromatography.test.tsx src/tools/sec/View.tsx` then `git commit -m "feat: add chromatogram file drop"`.

### Task 4: Move spectrum correction out of chromatography

**Files:**
- Create: `src/tools/protein-conc/SpectrumCorrection.tsx`
- Modify: `tests/app/chromatography.test.tsx`
- Modify: `tests/app/protein-tools.test.tsx`
- Modify: `src/tools/sec/View.tsx`
- Modify: `src/tools/protein-conc/View.tsx`
- Modify: `src/tools/registry.ts`

**Interfaces:**
- Consumes: `parseSpectrum`, `fitLogScatter`, `correctA280ForScatter`, and `calculateDyeLabeling` from `@/core/chromatography`.
- Produces: a Protein Concentration spectrum section with raw A280, fit diagnostics, adjusted A280, and migrated DOL controls.

- [ ] **Step 1: Write failing UI tests.** In the SEC test, assert no `UV-Vis spectra` tab exists. In Protein Concentration, import `Wavelength,Absorbance` points at 280/300/320/340, enable correction, and expect `Observed A280` plus `Log-space scattering-adjusted A280`.
- [ ] **Step 2: Run the tests to verify they fail.** Run `npm test -- tests/app/chromatography.test.tsx tests/app/protein-tools.test.tsx`. Expected: SEC still exposes UV-Vis and Protein Concentration has no spectrum workflow.
- [ ] **Step 3: Write minimal implementation.** Extract the existing spectrum UI into `SpectrumCorrection.tsx`. Show fit count, slope, R-squared, extrapolated log contribution, adjusted A280, and warnings; retain DOL fields there. Add an explicit `Use adjusted A280` control that updates the parent’s A280 value. Remove the SEC spectra tab/imports/audit plumbing, and revise SEC and registry text to omit UV-Vis/DOL.
- [ ] **Step 4: Run the focused UI tests to verify they pass.** Run `npm test -- tests/app/chromatography.test.tsx tests/app/protein-tools.test.tsx`. Expected: SEC has three tabs and Protein Concentration owns the spectrum correction UI.
- [ ] **Step 5: Commit.** Run `git add tests/app/chromatography.test.tsx tests/app/protein-tools.test.tsx src/tools/sec/View.tsx src/tools/protein-conc/View.tsx src/tools/protein-conc/SpectrumCorrection.tsx src/tools/registry.ts` then `git commit -m "feat: move spectrum correction to protein concentration"`.

### Task 5: Reduce assurance prominence and verify the complete product

**Files:**
- Modify: `tests/app/assurance.test.tsx`
- Modify: `tests/app/home.test.tsx`
- Modify: `src/app/components/Nav.tsx`
- Modify: `src/app/components/Footer.tsx`
- Modify: `src/app/pages/Home.tsx`

**Interfaces:**
- Consumes: assurance route `#/assurance`.
- Produces: a footer-only `Methods & Assurance` entry while keeping the route renderable and directly addressable.

- [ ] **Step 1: Write failing navigation tests.** Assert the global banner has no `Methods & Assurance` link and the footer has a link with that name and `href="#/assurance"`; retain direct-route coverage.
- [ ] **Step 2: Run the tests to verify they fail.** Run `npm test -- tests/app/assurance.test.tsx tests/app/home.test.tsx`. Expected: header/banner still expose the route and the footer does not.
- [ ] **Step 3: Write minimal implementation.** Remove header and preview-banner anchors; add the route link to `Footer`; do not alter `Assurance`, `router.ts`, or deep-link support.
- [ ] **Step 4: Run focused tests and complete product verification.** Run `npm test -- tests/app/assurance.test.tsx tests/app/home.test.tsx && npm run typecheck && npm run lint && npm test && npm run build`. Expected: all commands exit 0.
- [ ] **Step 5: Run browser coverage and commit.** Run `npm run e2e -- tests/e2e/chromatography.spec.ts tests/e2e/smoke.spec.ts`, then `git add tests/app/assurance.test.tsx tests/app/home.test.tsx src/app/components/Nav.tsx src/app/components/Footer.tsx src/app/pages/Home.tsx` and `git commit -m "feat: move assurance link to footer"`.
