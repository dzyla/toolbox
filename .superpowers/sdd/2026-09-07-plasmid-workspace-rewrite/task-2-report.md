# Task 2 report: canonical plasmid document analysis

## RED

The required topology suite was added before the adapter module existed.

```text
npm run test:unit -- tests/core/plasmid-analysis.test.ts
```

The first run failed as expected: Vitest could not resolve
`@/core/plasmid/analysis`, reporting one failed suite and zero executed tests.

After the first green implementation, two small regressions were added before
their production changes:

- Re-promoting the same ORF initially failed because both annotations had the
  same `predicted-cds-detected-orf-+1-91-6` ID.
- A 15 bp circular fixture with a complete 3-amino-acid origin-spanning ORF
  initially returned `[]`; the legacy detector rejected all sequences below
  90 bp despite the requested two-amino-acid minimum.

Both failures were behavior failures (not test setup or type errors).

## GREEN

```text
npm run test:unit -- tests/core/plasmid-analysis.test.ts
```

Result: one test file passed; 6 tests passed.

Final verification:

```text
npm run typecheck                 # passed
npm run lint -- --quiet           # passed
git diff --check                  # passed
npm run test:unit                 # 98 files passed, 707 tests passed
npm run build                     # passed
```

## Files changed

- `src/core/plasmid/analysis.ts`: provides pure canonical-document ORF and
  restriction adapters plus the explicit ORF-to-CDS promotion function.
  Document-facing ranges are zero-based and half-open; origin crossings use
  `start > end` and compound `Location` segments. ORFs and sites carry
  detected/predicted metadata and do not modify the document.
- `src/core/plasmid/index.ts`: allows short complete ORFs when the caller's
  requested minimum is met, and re-exports canonical analysis APIs.
- `tests/core/plasmid-analysis.test.ts`: covers one-only circular ORFs,
  no-wrap linear analysis, short circular ORFs, origin-crossing EcoRI ranges,
  non-persistent derived results, explicit predicted CDS promotion, and fresh
  IDs for repeated promotion.

## Self-review

- `findDocumentOrfs` passes the document topology to the legacy detector,
  converts one-based inclusive legacy endpoints to zero-based half-open
  selection endpoints, and de-duplicates by frame, strand, start, and end.
- Linear calls pass `false` for circular detection, so neither ORFs nor sites
  can wrap at the origin. Circular recognition sites record both canonical
  range coordinates and `crossesOrigin`.
- Derived ORFs/sites are returned as data only; the input document and its
  annotations remain unchanged. `orfToAnnotation` is the sole API that makes
  a predicted `CDS` annotation and it clones the ORF location.
- Promotion IDs include a monotonic promotion suffix, avoiding collisions for
  repeated promotion of the same derived ORF within a running workspace.
- The adapter preserves legacy protein translation and frame/strand values;
  it deliberately leaves unrelated legacy presentation APIs available for
  existing consumers.

## Concerns

No blocking concerns. The promotion counter is process-local, which is
appropriate for an unpersisted derived result; annotation insertion still
validates collisions against the canonical document.
