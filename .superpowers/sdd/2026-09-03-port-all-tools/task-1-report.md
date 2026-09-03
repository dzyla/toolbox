# Task 1 report — calculator slice

Status: **DONE_WITH_CONCERNS**. The calculator slice is implemented and its focused tests, typecheck, lint, production build, full unit suite, and legacy regression suite pass. The browser smoke suite could not be completed because its sandboxed preview server was denied permission to bind localhost; the elevated retry was interrupted.

## Implementation

- Added a 241-entry audited chemical catalogue converted from `LAB_CONSTANTS.chemicals`. It retains the audit corrections/removals, synonym arrays, and explicit `hydrateOf`/integer `waters` metadata for 42 hydrate or anhydrous forms.
- Added sourced buffer/media presets: PBS, PBST, TBS, TBST, HBS, TE, TAE, TBE, LB Miller, SOB, and SOC. TAE uses a 17.4 M glacial-acetic-acid stock and the audited 1.14 mL/L addition.
- Added DOM-free buffer science for solid molarity, % w/v, liquid-stock dilution (M/mM, %, and ×), density-derived mass, explicit hydrate handling, Henderson-Hasselbalch ratio, and temperature-adjusted pKa.
- Added DOM-free centrifuge science for RPM↔RCF, Beckman k-factor, and pelleting time.
- Added DOM-free reaction science for master-mix scaling (excess plus proportional dead volume), temperature-specific ammonium-sulfate cuts with guards, and equal-final-volume serial dilution.
- Added complete Buffer, Centrifuge, Master Mix, and Ammonium Sulfate tools using `ToolLayout`, `Quantity`, `ActionBar`, `SciencePanel`, inline alerts, dark-mode classes, and `useUrlState`.
- Buffer UI includes explicit synonym/hydrate result selection, MW autofill, locked additional-water input for named forms, optional guarded PubChem lookup, presets, pH helper, copy, and method-bearing CSV export.
- Master Mix includes editable rows and method-bearing CSV export. Molarity now includes a Serial dilution tab with preparation, transfer, diluent, and per-well concentration details.
- Marked only the four Task 1 registry entries ready and added their lazy loaders.

## Scientific values pinned

- MW: Tris 121.14; HEPES 238.30; MgCl2·6H2O 203.30; EDTA·2Na·2H2O 372.24; E-64 357.41; dTTP·2Na 526.13.
- Buffer examples: 10 mM Tris/500 mL = 0.6057 g; 50 mM from 1 M/100 mL = 5 mL; 1× from 10×/100 mL = 10 mL; 10% w/v/500 mL = 50 g; hydrate MW is not hydrated twice; TAE acid = 1.14 mL/L.
- pKa/dpKa·dT: Tris 8.06/−0.028; HEPES 7.48/−0.014; MES 6.10/−0.011; MOPS 7.14/−0.015; PIPES 6.76/−0.0085; phosphate pKa2 7.20/−0.0028.
- Centrifuge: 100 mm at 10,000 RPM = 11,180 × g; rotor 91.9/35.9 mm at 50,000 RPM gives k ≈ 95.
- Ammonium sulfate 0→50% in 1 L: 313.5 g at 25 °C and 297.7 g at 0–4 °C.
- Serial dilution: factor 2 and final 100 µL gives 100 µL transfer, 100 µL receiving-well diluent, and 200 µL well-1 preparation.

## TDD evidence

1. Baseline: `npm run test:unit` — 12 files, 37 tests passed.
2. Core/data RED: compile-only stubs allowed all tests to execute — 4 files, 22 expected failures and 1 pass. (An earlier missing-import run was rejected as invalid RED evidence.)
3. Core/data GREEN: 4 files, 23 tests passed.
4. UI/registry RED: 3 files, 7 expected failures and 5 passes.
5. UI/core GREEN: 7 focused files, 35 tests passed.
6. Serial-contract RED: 1 expected failure proved named `transfer`/`diluent` fields were missing; final focused run passed 7 files, 35 tests.

## Verification

- Fresh focused tests: 7 files, 35 tests passed.
- Full unit suite: 17 files, 67 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; Vite transformed 57 modules and generated the PWA service worker.
- `npm run test:legacy`: 6/6 passed.
- `npm run e2e`: first run failed before tests because Vite Preview hit `listen EPERM 127.0.0.1:4173` in the sandbox. The elevated retry was interrupted after 535.9 seconds; no browser result is available.
- `git diff --check`: passed before final reporting edits; repeated before commit.

## Files changed

- `src/core/buffers/{recipe,henderson}.ts`
- `src/core/centrifuge/index.ts`
- `src/core/reactions/{mastermix,ammonium-sulfate,serial-dilution}.ts`
- `src/data/{chemicals,buffer-presets}.json`
- `src/tools/{buffers,centrifuge,master-mix,ammonium-sulfate}/{View,science}.tsx|ts`
- `src/tools/molarity/{View,science}.ts(x)`
- `src/tools/registry.ts` (Task 1 entries only)
- `tests/core/{buffers,calculator-data,centrifuge,reaction-calculators}.test.ts`
- `tests/app/calculators.test.tsx`, plus Task 1 additions to molarity/registry tests

## Concerns and follow-up

- Playwright smoke remains unverified for the reason above; rerun `npm run e2e` where localhost port binding and the configured browser are available.
- PubChem lookup is intentionally optional/network-dependent and guarded with an inline status; automated tests cover the local chemical-picker path, not the live service.
- TAE records 19.836 mM nominal acetate so 17.4 M stock resolves exactly to the audited 1.14 mL/L addition derived from the cited 50× recipe.
