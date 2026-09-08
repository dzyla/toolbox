# Final plasmid annotation color fix

## Delivered

- `exportGenBank` now treats a present canonical `annotation.color` as authoritative and rewrites `ApEinfo_fwdcolor` during export.
- Other imported qualifier metadata remains intact.
- Added a regression that imports a red ApE annotation, changes it to blue through `replaceAnnotation` (the inspector's canonical document edit path), exports and re-imports it, and verifies the blue color together with the edited label, retained gene, and retained note.

## TDD evidence

- Red: `npm test -- tests/core/plasmid-export.test.ts` failed as expected before the implementation, reporting exported/re-imported `#dc2626` where canonical `#2563eb` was required.
- Green: `npm test -- tests/core/plasmid-export.test.ts tests/core/plasmid-import.test.ts tests/core/plasmid-document.test.ts` — 3 files, 9 tests passed.

## Verification

- `npm test` — 99 files, 744 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build` — passed.
- `npm run e2e` — 10 Playwright tests passed.
- `git diff --check` — passed.
