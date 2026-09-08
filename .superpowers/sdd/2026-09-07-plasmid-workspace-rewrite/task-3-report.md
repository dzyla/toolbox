# Task 3 report: deterministic plasmid annotation layout primitives

## RED

Added `tests/core/plasmid-map-layout.test.ts` before the layout module existed,
covering overlapping lane assignment, circular origin-spanning reservation,
canonical compound coordinates, and collision-lane labels.

```text
npm run test:unit -- tests/core/plasmid-map-layout.test.ts
```

The first run failed as expected because Vitest could not resolve
`@/tools/plasmid/map-layout`; the test suite had zero executed tests.

## GREEN

Created `src/tools/plasmid/map-layout.ts` with pure data-only APIs:

- `annotationSegments` clones canonical zero-based, half-open segments without
  mutating or merging compound locations.
- `assignAnnotationLanes` sorts drawing segments by start, end, and annotation
  ID, assigns the first available lane using half-open overlap, and reserves
  every segment of a compound/wrapped annotation in that lane.
- `displayLabel` preserves the annotation name and adds a stable one-based
  lane suffix only for secondary lanes.

```text
npm run test:unit -- tests/core/plasmid-map-layout.test.ts
```

Result: one test file passed; 4 tests passed.

Final verification:

```text
npm run typecheck                 # passed
npm run lint -- --quiet           # passed
git diff --check                  # passed
npm run test:unit                 # 99 files passed, 714 tests passed
npm run build                     # passed
```

## Self-review

- The module contains no JSX, SVG, renderer imports, or document mutation.
- Canonical annotation segments are copied for drawing, retaining biological
  order and preserving circular tail/head segments such as `24..30` then
  `0..4`.
- Lane overlap uses zero-based half-open semantics, so adjacent segments can
  share a lane while true overlaps cannot.
- Sorting is independent of caller annotation order; all segment reservations
  are made atomically for an annotation after its first sorted segment.
- Circular runtime ranges with `start > end` are defensively split at the
  layout boundary; validated `Location` values remain unchanged.

## Concerns

No blocking concerns. `displayLabel` uses a lane suffix for lane indices above
zero so overlapping annotations remain distinguishable while persisted names
stay untouched. The module assumes the document model has already validated
annotation IDs and coordinates; invalid segments are ignored for reservation
but their annotation IDs remain represented in the returned map.
