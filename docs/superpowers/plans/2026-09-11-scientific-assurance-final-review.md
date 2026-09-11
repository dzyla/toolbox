# Scientific Assurance Final-Review Implementation Plan

> **For agentic workers:** Execute inline in this dedicated worktree. Each behavior change follows a RED/GREEN test cycle.

**Goal:** Correct assurance wording, planner ratio provenance, design-document accuracy, and responsive coverage without expanding the planner beyond planning estimates.

**Architecture:** Keep the study-design core unchanged: it already returns integer realizable group sizes. Derive both the requested and realized ratios in the view/export from that result. Documentation states the existing single methods-intent link and bounded-error core contract.

**Tech Stack:** Preact, TypeScript, Vitest, Playwright, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-10-scientific-assurance-and-study-design-design.md`

## Global Constraints

- Do not present software checks as experimental, assay, clinical, or statistical certification.
- The planner remains a browser-local two-independent-group planning aid, not an analysis workflow.
- The core returns calculated values or bounded, named errors; it does not expose a warning-bearing discriminated result.
- Validate both phone and desktop routes for horizontal overflow.

### Task 1: Add planner and responsive regressions

**Files:**
- Modify: `tests/app/study-design.test.tsx`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] Add a component test using a ratio such as 1.1 that requires integer rounding; assert the result shows requested `1.1`, shows realized `n2 / n1`, and exports both fields.
- [ ] Add ratio-only bounded-search cases for direct-d and difference/common-SD input modes; assert the ratio field is marked but active effect fields are not.
- [ ] Extend smoke coverage to assert the assurance and planner routes have no horizontal overflow at 390px and a desktop width.
- [ ] Run the component regression test and observe failure because the requested/realized distinction is absent.

### Task 2: Implement the minimum planner correction

**Files:**
- Modify: `src/tools/study-design/View.tsx`

- [ ] Keep `Allocation ratio` as the requested input setting.
- [ ] Add a realized-ratio value derived from returned `n2 / n1` to visible results and exported provenance.
- [ ] Run focused component tests and observe all cases pass.

### Task 3: Correct scientific assurance and design documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-10-scientific-assurance-and-study-design-design.md`

- [ ] Replace universal reference-test claims with a per-tool assurance-status description.
- [ ] Describe one `?methods=1` intent link, with users opening methods inside tools.
- [ ] Describe core outcomes as values or bounded errors; remove abandoned warnings/discriminated-result claims.

### Task 4: Verify and hand off

**Files:**
- Create: `.superpowers/sdd/2026-09-10-scientific-assurance-and-study-design/final-fix-report.md`

- [ ] Run focused tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run e2e`.
- [ ] Run `git diff --check`; inspect the final diff and worktree state.
- [ ] Write RED/GREEN evidence, command outputs, changed files, commit SHA, and outstanding concerns to the final fix report.
- [ ] Commit the reviewed correction set.
