# Buffer tool v2: recipe-first mixture with a pH layer

Date: 2026-10-01. Status: draft for review.

## Intent

A bench scientist wants to write down a mixture (buffer, salts, additives), get a weigh-out sheet, and, for any buffer in it, know the pH they will actually have at their working temperature and ionic strength. The recipe table stays the main screen. pH handling is a layer on a buffer row, never a mandatory wizard. A premade pH'd stock ("HEPES 1 M pH 8.0") must be as simple as a salt: it is a dilution and nothing more.

Said by the user: mixture first, buffering on top, premade pH'd stocks need no mixing, flexible but easy.
Assumed: titrant-adjust is the default way to reach a pH; ionic-strength correction is on by default.

Out of scope for v1: buffer capacity plots, multi-buffer pH optimisation, activity coefficients beyond the Davies equation.

## Current state

- `src/core/buffers/recipe.ts`: `solveRecipe` for `solid` and `stock` components (g / mL).
- `src/core/buffers/henderson.ts`: 6 monoprotic buffers, linear dpKa/dT, ratio only.
- `src/tools/buffers/View.tsx`: 716 lines, one file. Presets and saved buffers via `local-library.ts`, chemical search from `chemicals.json`.

## Model

A mixture has a final volume, a working temperature and a list of components. A component has one of three kinds:

1. `solid`: as today (weigh from formula MW, optional extra waters).
2. `stock`: as today (dilute a stock).
3. `buffer` (new), with a `mode`:
   - `premade`: stock concentration, stock pH, stock temperature (default 25 °C), target concentration. Output: stock volume (C1V1 = C2V2). No titration. Shows the predicted pH at the working temperature and ionic strength.
   - `design`: buffer system (from the pKa table), target pH, "pH set at" temperature, target concentration, and a `method`:
     - `titrate` (default): weigh the species chosen as the starting form (free base or acid, per system) and report the approximate volume of titrant (strong acid or base, user-chosen concentration) to reach the target pH.
     - `mix-forms`: weigh both species (e.g. NaH2PO4 and Na2HPO4) in the Henderson–Hasselbalch ratio. Only offered for systems that have a salt pair in `chemicals.json`.

## Calculation core (`src/core/buffers/`)

- `pka.ts` replaces the table in `henderson.ts`: each system lists its ionisation steps (pKa at 25 °C, dpKa/dT, charge of each species) with a source per value. Systems: Tris, HEPES, MES, MOPS, PIPES, Bicine, Tricine, CHES, CAPS, imidazole, acetate, citrate (3 steps), phosphate (3 steps). Values without a published dpKa/dT are flagged "no temperature data" and are not corrected.
- `ionic.ts`: ionic strength I from all charged components (buffer species by the speciation at the target pH, plus salts from the rows with known charges) and the Davies activity correction, so pKa' = pKa + correction(I, charges). Unknown components are listed as "not counted".
- `speciation.ts`: fractions of each species at a given pH (polyprotic, closed form). Gives the base/acid ratio and, for `titrate`, the equivalents of titrant per mole of buffer.
- `phAtTemperature(...)`: the pH of a mixture made to pH_a at T_a when it is used at T_b, assuming fixed composition and recomputing pKa'(T_b). Used for the check and for the "set pH at the working temperature instead" suggestion.
- `solveRecipe` keeps its signature for `solid` and `stock` and gains `buffer` handling, returning extra fields on a row (`titrant`, `predictedPH`, `notes`) instead of changing existing ones.
- Strong-acid/base titrant volume is an estimate. The UI says to finish with a pH meter.

## UI (`src/tools/buffers/`)

One column.

1. Header strip: final volume, working temperature, ionic-strength toggle, a presets and saved-buffers menu.
2. Component list: one row per component. A row has a kind selector (Solid, Stock, Buffer). A Buffer row shows a Premade/Design switch and, under Design, the system, pH, "pH set at" temperature and method. Chemical search and MW stay as now.
3. pH check line under every Buffer row: for example "pH 8.0 at 25 °C → pH 7.6 at 4 °C, I = 0.15 M". If it differs from the target by more than 0.1 pH, a warning with a one-click "set pH at 4 °C instead".
4. Weigh-out sheet: amounts in a sensible order of addition, titrant lines, final-volume step, copy and print.
5. A collapsible Science panel (formulas, assumptions, references, as today).

Split `View.tsx` into `BuffersModel.tsx` (state and memos), `components/ComponentRow.tsx`, `components/BufferRow.tsx`, `components/RecipeSheet.tsx`, `components/PhCheck.tsx`, matching the layout used for plate-reader, dsf and fitting. Saved buffers keep their stored shape, and the project validator accepts old projects (`solid` and `stock` only) unchanged.

Accessibility and mobile: every control labelled, no horizontal overflow at 390 px; the existing axe and mobile e2e suites must pass in light and dark.

## Testing

- Unit (vitest), reference values with sources: Tris pKa at 4 °C and 37 °C; HEPES pH shift 25 → 4 °C; phosphate speciation at pH 7.4; mix-forms ratio for 100 mM phosphate pH 7.0; premade dilution; ionic strength for 50 mM HEPES pH 7.5 + 150 mM NaCl; edge cases (pH within 0.1 of a pKa extreme, zero concentration, missing MW, unknown system).
- Existing `tests/core/buffers.test.ts` keeps passing.
- e2e: a Premade row (HEPES 1 M pH 8.0 → 50 mM) gives one stock volume; a Design row shows the temperature warning; the saved-buffer round trip; the a11y and mobile suites.
- Assurance registry entry for the new methods (reference-tested).

## Open points to confirm in review

- pKa and dpKa/dT sources are gathered during implementation; any value without a primary source is marked in the UI.
- Which presets (Tris-NaCl, PBS, TBS, SEC buffers) are converted to Buffer rows. Proposal: convert the ones that name a buffer with a pH, leave media recipes untouched.
