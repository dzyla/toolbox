# Task 3 report — UV-Vis, scatter correction, and DOL core

## Scope verdict: PASS

Only the assigned chromatography core barrel, spectrum module, and spectrum tests were changed:

- src/core/chromatography/spectra.ts
- src/core/chromatography/index.ts
- tests/core/spectra.test.ts

No UI or unrelated modules were changed.

## Implementation verdict: PASS

- parseSpectrum parses CSV/TSV/semicolon-delimited two- or multi-column input, exposes source/mapped headers, accepts manual mappings, retains the first duplicate wavelength, and emits notices for invalid rows or unmapped required columns.
- fitLogScatter performs least-squares fitting in log10 wavelength/log10 absorbance space for positive 300–340 nm (caller-editable) points; it rejects invalid bounds and returns warnings for excluded points, insufficient points, undefined fits, and poor R².
- correctA280ForScatter returns observed A280, predicted 280-nm scatter, corrected A280, and explicit warnings, including nonpositive corrected A280.
- calculateDyeLabeling leaves scatter correction opt-in, then applies manufacturer CF280 dye correction, Beer–Lambert concentrations, and the dye/protein ratio. Invalid required inputs and nonpositive corrected protein A280 are blocked explicitly.

## DOL fixture ruling: PASS (corrected plan inconsistency)

The brief listed a DOL expectation of 0.5714, but its own specified formula yields:

(0.4 / 100000) / ((0.8 - 0.1 × 0.4) / 50000) = 0.2631579

The parent task owner confirmed the formula-derived value. The regression test uses 0.2632 and documents this calculation.

## TDD verdict: PASS

tests/core/spectra.test.ts was added before spectra.ts; the initial focused run failed because the requested exports were absent. After the minimal implementation, the focused suite passed.

Note: the brief's literal npm test -- --run invocation is not accepted by this package's npm argument forwarding (EUNKNOWNCONFIG for --run). The equivalent direct script invocation was used:

npm run test:unit -- --run tests/core/spectra.test.ts

## Verification verdict: PASS

| Command | Result |
| --- | --- |
| npm run test:unit -- --run tests/core/spectra.test.ts | 6/6 tests passed |
| npm run typecheck | passed |
| npm run lint | passed |
| npm test | 88 files, 651 tests passed |
