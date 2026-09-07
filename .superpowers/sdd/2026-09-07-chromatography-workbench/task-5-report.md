# Task 5 report — Chromatography Workbench UI

## Summary

Expanded the stable `sec` tool route into the **Chromatography Workbench** without changing its route ID. The original SEC calibration component remains intact as the `SEC calibration` tab; the new UI layers consume the completed chromatography and protein core modules rather than reimplementing their calculations.

## Delivered behavior

- Renamed the registry-visible tool to **Chromatography Workbench** while retaining `id: 'sec'` and its existing loader/routing.
- Added four accessible tabs: `SEC calibration`, `Run & fractions`, `Method planner`, and `UV-Vis spectra`.
- Preserved the existing SEC calibration and simulated chromatogram UI as a dedicated tab.
- Added chromatogram paste/import review with explicit volume, UV280, and fraction mapping; visibly labelled raw mAU and derived AU overlays; candidate peak acceptance; selected peak and fraction details; and raw/derived CSV/JSON export through the established export helpers.
- Added a pI- and epsilon-informed ion-exchange planner using the protein core, editable Buffer A/B cards, review-required status, and an SVG gradient timeline from the gradient core.
- Added UV-Vis import/plot/readout table, an unchecked-by-default 300–340 nm scatter correction, and DOL blocking until the user supplies dye absorbance, dye epsilon, CF280, and protein epsilon.
- Updated scientific scope text for the added workbench functions and their review boundaries.

## TDD record

`tests/app/chromatography.test.tsx` was written before the UI work and initially failed for the old registry name and missing tabs. It now covers registry naming, manual trace mapping and raw/derived overlay, explicit candidate acceptance, selected fraction details, the opt-in scatter correction/DOL blocker, and planner review-required status. The additional fraction-details and four-export checks each had an observed failing run before implementation.

## Verification

| Command | Result |
| --- | --- |
| `npm run test:unit -- --run tests/app/chromatography.test.tsx` | passed: 4 tests |
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm test` | passed: 90 files, 663 tests |
| `git diff --check` | passed |

## Explicit spec compliance verdict

PASS. The requested four-tab SEC workbench is present on the existing SEC tool route. All requested integrations—calibration retention, raw/derived run review and exports, sequence-informed planner and gradient, opt-in scatter correction, and coefficient-gated DOL—are implemented with accessible controls and component coverage. No Task 6 E2E work was added.

## Task quality verdict

PASS. The UI delegates science and parsing to the completed core modules, labels derived data clearly, makes candidate acceptance explicit, maintains the SEC route contract, and verifies the change with focused and full automated checks.
