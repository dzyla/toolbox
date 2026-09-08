# Task 7 final fixes

- Added an explicit `typeof sequence === 'string'` validation gate so malformed persisted arrays are rejected by restore before analysis or rendering.
- Made GenBank `/label` authoritative over `/gene` after parsing all qualifiers, while retaining the original `gene` metadata.
- Added regression coverage for both cases.

Verification:

- `npm test -- tests/core/plasmid-model.test.ts tests/core/plasmid-import.test.ts tests/core/plasmid-export.test.ts tests/app/plasmid.test.tsx` — 46 passing
- `npm test` — 743 passing
- `npm run typecheck`
- `npm run lint`
- `npm run build`
