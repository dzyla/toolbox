# Scientific Assurance and Study Design — Final Fix Report

**Fix implementation commit:** `671a99a90663596ca8ab9268c6c1028760047da8` (`fix: correct assurance and planner provenance`)

## Findings resolved

1. `README.md` now describes assurance evidence by per-tool status. It limits
   published reference-value claims to tools marked **Reference-tested** and
   avoids presenting any status as experimental, assay, clinical, or statistical
   certification.
2. The two-group planner now keeps the input as **Requested allocation ratio**
   and separately reports **Realized allocation ratio** as `n2 / n1 = value`
   after integer rounding and the two-sample minimum. Both values travel in the
   text export. The planner remains a planning estimate only.
3. The authoritative design specification now matches implementation: one
   `?methods=1` intent link, methods opened by the user inside the tool, and
   core functions that return values or throw named bounded errors.
4. Ratio-only bounded-search tests cover direct Cohen's d and
   difference/common-SD modes, asserting active effect inputs remain unmarked.
5. Playwright validates the assurance and planner routes for exact body width
   at both 390px phone and 1440px desktop viewports.

## Changed files

- `README.md`
- `docs/superpowers/specs/2026-09-10-scientific-assurance-and-study-design-design.md`
- `src/tools/study-design/View.tsx`
- `tests/app/study-design.test.tsx`
- `tests/e2e/smoke.spec.ts`
- `docs/superpowers/plans/2026-09-11-scientific-assurance-final-review.md`

## TDD evidence

### RED

Before changing production code, the added planner/export regression was run:

```text
npm test -- tests/app/study-design.test.tsx
22 tests: 20 passed, 2 failed
```

The new `1.1` allocation-ratio case failed because the result did not contain
`Requested allocation ratio`; the updated export contract also failed because
the old summary exposed a single, incorrectly labelled allocation ratio. The
ratio-only bounded-search field tests passed before the implementation change,
confirming the pre-existing correct field-selection behavior.

### GREEN

After the minimum view/provenance change:

```text
npm test -- tests/app/study-design.test.tsx tests/app/assurance.test.tsx
2 test files passed; 28 tests passed

npm run e2e -- --grep "methods index and study planner avoid horizontal overflow"
1 passed
```

The focused Playwright command required the approved local Vite listener after
the sandbox prevented `webServer` startup; it then passed at both target widths.

## Full verification

```text
npm run typecheck                         PASS
npm run lint                              PASS
npm test                                  102 files passed; 829 tests passed
npm run build                             PASS (326 modules transformed)
npm run e2e                               11 passed
git diff --check                          PASS
```

## Concerns

- No unresolved implementation concern found.
- The planner deliberately remains limited to two independent pooled-variance
  groups and planning estimates. It does not certify an assay, protocol,
  distributional assumptions, or statistical analysis plan.
- Playwright emitted the existing `NO_COLOR`/`FORCE_COLOR` environment warning;
  all browser tests completed successfully.
