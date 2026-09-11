# Scientific Assurance and Study Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scientific status of every Bio-Bench tool discoverable and add a source-tested, browser-local two-independent-groups study-design and power planner.

**Architecture:** A typed assurance registry, checked against the existing tool registry, supplies method status and scope text without duplicating each tool’s Science panel. The new planner keeps numerical distributions and power inversions in framework-free core code; its Preact view only validates form state, renders explicit planning status, and exports provenance.

**Tech Stack:** TypeScript 5.9, Preact, Preact signals/hooks, Tailwind CSS 4, Vitest, Testing Library, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-scientific-assurance-and-study-design-design.md`

## Global Constraints

- Keep all calculation, parsing, and export work in the browser; do not add a server, telemetry, account, or network dependency.
- A tool without an assurance record must fail tests; the UI must never imply wet-lab, clinical, or assay certification.
- The planner supports only independent two-group Student-t designs with a common standard deviation; blocked states are preferable to approximations outside that domain.
- Core code must remain free of DOM and framework imports.
- Every numerical behavior needs a source-backed fixture or a property test before its implementation.

---

## File structure

- Create `src/core/study-design/index.ts`: stable normal, gamma, beta, central-t, and noncentral-t numerical primitives plus the two-group power API.
- Create `tests/core/study-design.test.ts`: source fixtures, inversion checks, monotonicity, dropout, and invalid-input tests.
- Create `src/tools/assurance.ts`: assurance status types, all-tool record, summary and lookup helpers.
- Create `tests/app/assurance.test.tsx`: registry completeness and assurance-page interaction tests.
- Create `src/app/pages/Assurance.tsx`: filterable, accessible methods-and-assurance inventory.
- Modify `src/app/router.ts`, `src/app/App.tsx`, `src/app/components/Nav.tsx`, and `src/app/pages/ToolPage.tsx`: route and deep link into a tool’s methods section.
- Create `src/tools/study-design/View.tsx` and `src/tools/study-design/science.ts`: planner UI and its method panel.
- Modify `src/tools/registry.ts`: register the planner and its assurance entry.
- Create `tests/app/study-design.test.tsx`: user-facing planner behavior and export provenance.
- Modify `tests/e2e/smoke.spec.ts`: verify route loading and no horizontal overflow at desktop and phone widths.

### Task 1: Build and verify the numerical study-design core

**Files:**
- Create: `src/core/study-design/index.ts`
- Create: `tests/core/study-design.test.ts`

**Interfaces:**
- Produces `twoSamplePower(input: TwoSamplePowerInput): TwoSamplePowerResult`, `requiredSampleSize(input: RequiredSampleSizeInput): RequiredSampleSizeResult`, `minimumDetectableEffect(input: MinimumDetectableEffectInput): number`, and `cohensD(difference: number, commonSd: number): number`.
- `TwoSamplePowerInput` is `{ n1: number; n2: number; effectSize: number; alpha: number; alternative: 'two-sided' | 'one-sided' }`.
- `TwoSamplePowerResult` is `{ power: number; degreesOfFreedom: number; noncentrality: number; criticalValue: number }`.
- `RequiredSampleSizeInput` is `{ effectSize: number; alpha: number; targetPower: number; alternative: 'two-sided' | 'one-sided'; allocationRatio: number; dropoutFraction: number }`.
- `RequiredSampleSizeResult` is `{ n1: number; n2: number; enrollN1: number; enrollN2: number; achievedPower: number; degreesOfFreedom: number }`.

- [ ] **Step 1: Write failing numerical-contract tests**

```ts
import { cohensD, requiredSampleSize, twoSamplePower } from '@/core/study-design';

it('matches the R/G*Power independent two-sample reference design', () => {
  const result = requiredSampleSize({ effectSize: 0.5, alpha: 0.05, targetPower: 0.8, alternative: 'two-sided', allocationRatio: 1, dropoutFraction: 0 });
  expect(result.n1).toBe(64);
  expect(result.n2).toBe(64);
  expect(result.achievedPower).toBeGreaterThanOrEqual(0.8);
  expect(twoSamplePower({ n1: 63, n2: 63, effectSize: 0.5, alpha: 0.05, alternative: 'two-sided' }).power).toBeLessThan(0.8);
});

it('preserves scientific monotonicity and never accepts an invalid design', () => {
  expect(twoSamplePower({ n1: 40, n2: 40, effectSize: 0.8, alpha: 0.05, alternative: 'two-sided' }).power)
    .toBeGreaterThan(twoSamplePower({ n1: 20, n2: 20, effectSize: 0.8, alpha: 0.05, alternative: 'two-sided' }).power);
  expect(() => cohensD(1, 0)).toThrow('common standard deviation must be greater than zero');
  expect(() => requiredSampleSize({ effectSize: 0, alpha: 0.05, targetPower: 0.8, alternative: 'two-sided', allocationRatio: 1, dropoutFraction: 0 })).toThrow('effect size must be greater than zero');
});
```

- [ ] **Step 2: Run the new core test to verify it fails**

Run: `npm test -- tests/core/study-design.test.ts`

Expected: FAIL because `@/core/study-design` does not yet exist.

- [ ] **Step 3: Implement numerically bounded distribution and inversion functions**

```ts
export function requiredSampleSize(input: RequiredSampleSizeInput): RequiredSampleSizeResult {
  validateRequiredInput(input);
  let low = 2;
  let high = 4;
  while (powerForN1(high, input) < input.targetPower && high < 1_000_000) high *= 2;
  if (high >= 1_000_000) throw new RangeError('target power could not be reached within one million samples per group');
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (powerForN1(middle, input) >= input.targetPower) high = middle;
    else low = middle + 1;
  }
  const n1 = low;
  const n2 = Math.max(2, Math.ceil(n1 * input.allocationRatio));
  const achieved = twoSamplePower({ n1, n2, effectSize: input.effectSize, alpha: input.alpha, alternative: input.alternative });
  return { n1, n2, enrollN1: Math.ceil(n1 / (1 - input.dropoutFraction)), enrollN2: Math.ceil(n2 / (1 - input.dropoutFraction)), achievedPower: achieved.power, degreesOfFreedom: achieved.degreesOfFreedom };
}
```

Implement `centralTCdf` using regularized incomplete beta and bisection for its inverse. Implement `noncentralTCdf` as an adaptive-Simpson expectation over the chi-square denominator of the noncentral t variate, with an explicit absolute tolerance of `1e-8`, positive finite degrees of freedom, and a finite integration bound whose remaining chi-square tail is below the displayed precision. Define two-sided power as `F(-critical) + 1 - F(critical)` and one-sided power as `1 - F(critical)`.

- [ ] **Step 4: Run the core test and complete the required edge tests**

Run: `npm test -- tests/core/study-design.test.ts`

Expected: PASS, including d=0.5/alpha=0.05/80% reference, one-sided lower-N result, unequal allocation, inverse detectable effect, 20% dropout rounding, alpha/power/effect/allocation bounds, and 63-versus-64 sample-size boundary.

- [ ] **Step 5: Commit the independent core deliverable**

```bash
git add src/core/study-design/index.ts tests/core/study-design.test.ts
git commit -m "feat: add validated two-group power core"
```

### Task 2: Add assurance data with a registry contract

**Files:**
- Create: `src/tools/assurance.ts`
- Modify: `src/tools/registry.ts`
- Create: `tests/app/assurance.test.tsx`

**Interfaces:**
- Produces `ASSURANCE: Record<string, ToolAssurance>`, `assuranceFor(toolId: string): ToolAssurance`, and `assuranceSummary(): Record<AssuranceStatus, number>`.
- Consumes `TOOLS` from `src/tools/registry.ts`; a test compares all keys after registration of `study-design`.

- [ ] **Step 1: Write a failing completeness and summary test**

```tsx
import { ASSURANCE, assuranceSummary } from '@/tools/assurance';
import { TOOLS } from '@/tools/registry';

it('assigns one honest assurance record to every registered tool', () => {
  expect(Object.keys(ASSURANCE).sort()).toEqual(TOOLS.map(tool => tool.id).sort());
  expect(Object.values(ASSURANCE).every(record => record.scope.length > 20 && record.verification.length > 12)).toBe(true);
  expect(assuranceSummary()['reference-tested']).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/app/assurance.test.tsx`

Expected: FAIL because the assurance module is absent.

- [ ] **Step 3: Implement the complete assurance record**

```ts
export type AssuranceStatus = 'reference-tested' | 'method-documented' | 'review-required';
export interface ToolAssurance { status: AssuranceStatus; reviewed: string; scope: string; verification: string; }
export const ASSURANCE: Record<string, ToolAssurance> = { /* one explicit record for every TOOLS id */ };
export function assuranceSummary(): Record<AssuranceStatus, number> {
  return Object.values(ASSURANCE).reduce((total, record) => ({ ...total, [record.status]: total[record.status] + 1 }), { 'reference-tested': 0, 'method-documented': 0, 'review-required': 0 });
}
```

Classify a tool as `reference-tested` only where its current core suite includes source or independently derived fixture tests; use `method-documented` while a documented tool awaits that audit; use `review-required` for intentionally exploratory workflows. Every scope string must name the supported method, not promise experimental validity.

- [ ] **Step 4: Run the assurance test and verify stale/missing records are rejected**

Run: `npm test -- tests/app/assurance.test.tsx`

Expected: PASS. Temporarily remove one record locally to observe the key-equality failure, restore it, then run the same command again.

- [ ] **Step 5: Commit the registry contract**

```bash
git add src/tools/assurance.ts src/tools/registry.ts tests/app/assurance.test.tsx
git commit -m "feat: track scientific assurance for every tool"
```

### Task 3: Build methods-and-assurance navigation

**Files:**
- Create: `src/app/pages/Assurance.tsx`
- Modify: `src/app/router.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/Nav.tsx`
- Modify: `src/app/pages/Home.tsx`
- Modify: `src/app/pages/ToolPage.tsx`
- Modify: `src/app/components/SciencePanel.tsx`
- Modify: `tests/app/assurance.test.tsx`

**Interfaces:**
- Consumes `TOOLS`, `CATEGORIES`, `ASSURANCE`, and `assuranceSummary`.
- Adds route `{ name: 'assurance' }` for `/assurance` and accepts `?methods=1` on a tool URL.
- `SciencePanel` accepts the existing `open?: boolean`; tool views read a shared route flag to pass it through their `ToolLayout` without duplicating science content.

- [ ] **Step 1: Extend tests with route and accessible-filter expectations**

```tsx
it('filters the entire assurance inventory without color-only controls', async () => {
  render(<Assurance />);
  expect(screen.getByRole('heading', { name: /methods & assurance/i })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText(/assurance status/i), 'reference-tested');
  expect(screen.getAllByRole('link', { name: /open .* tool/i }).length).toBeGreaterThan(0);
  expect(screen.queryByText(/wet-lab certified/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the page test to verify it fails**

Run: `npm test -- tests/app/assurance.test.tsx`

Expected: FAIL because `Assurance` and the route are absent.

- [ ] **Step 3: Implement the index and deep links**

Use semantic `<label>`/`<select>` filters and text-plus-icon badges. The route must retain existing home/tool/not-found behavior. Add a compact home link near the research-preview notice. Tool links use `/tool/<id>?methods=1`; load the usual tool and expand its existing Science panel rather than copying formulas into the index. If a tool cannot surface the panel through its present layout, link normally and show `Methods available inside the tool` rather than falsifying an open state.

- [ ] **Step 4: Run tests and verify keyboard navigation**

Run: `npm test -- tests/app/assurance.test.tsx tests/app/router.test.ts tests/app/home.test.tsx`

Expected: PASS. Verify tab focus reaches filter controls and each tool link, category/status selection narrows the displayed records, and the tool URL parses with its existing route.

- [ ] **Step 5: Commit the navigable assurance layer**

```bash
git add src/app/pages/Assurance.tsx src/app/router.ts src/app/App.tsx src/app/components/Nav.tsx src/app/pages/Home.tsx src/app/pages/ToolPage.tsx src/app/components/SciencePanel.tsx tests/app/assurance.test.tsx
git commit -m "feat: add methods and assurance index"
```

### Task 4: Deliver the study-design planner interface

**Files:**
- Create: `src/tools/study-design/View.tsx`
- Create: `src/tools/study-design/science.ts`
- Modify: `src/tools/registry.ts`
- Modify: `src/tools/assurance.ts`
- Create: `tests/app/study-design.test.tsx`

**Interfaces:**
- Consumes `requiredSampleSize`, `twoSamplePower`, `minimumDetectableEffect`, and `cohensD` from the completed core task.
- Produces the registered `study-design` tool with `status: 'ready'` and a `<ToolLayout>` result carrying the explicit text `Planning estimate`.

- [ ] **Step 1: Write failing interaction and export tests**

```tsx
it('shows a source-backed sample-size recommendation and preserves settings in export', async () => {
  render(<StudyDesign />);
  expect(await screen.findByText(/64 analysable samples per group/i)).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText(/anticipated difference/i));
  await userEvent.type(screen.getByLabelText(/anticipated difference/i), '2');
  expect(screen.getByText(/planning estimate/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /copy design summary/i }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/Two independent groups/));
});
```

- [ ] **Step 2: Run the planner test to verify it fails**

Run: `npm test -- tests/app/study-design.test.tsx`

Expected: FAIL because the planner module is absent.

- [ ] **Step 3: Implement the accessible planner and science panel**

Use visible labels for objective, difference/common SD or Cohen's d, alpha, power, sidedness, allocation, and dropout. Default to d=0.5, alpha=0.05, target power=0.80, equal allocation, and zero dropout; default output is 64 analysable samples per group. Put optional controls in a named `<details>` section. Block the result on invalid state and identify the specific field. Use `scienceText(SCIENCE)` for copy/export so methods, sources, assumptions, settings, and warnings travel with the result. The science panel must cite Cohen, R `power.t.test`, and the G*Power manual and state that a power calculation does not validate the assay or statistical analysis plan.

- [ ] **Step 4: Run app and core regression tests**

Run: `npm test -- tests/app/study-design.test.tsx tests/app/tool-registry.test.ts tests/core/study-design.test.ts`

Expected: PASS, including screen-reader labels, invalid-result blocking, one-sided mode, dropout enrollment, copy provenance, and registry visibility/search.

- [ ] **Step 5: Commit the complete planner**

```bash
git add src/tools/study-design/View.tsx src/tools/study-design/science.ts src/tools/registry.ts src/tools/assurance.ts tests/app/study-design.test.tsx
git commit -m "feat: add study design and power planner"
```

### Task 5: Verify the release path and document user-facing limits

**Files:**
- Modify: `README.md`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `docs/superpowers/specs/2026-09-10-scientific-assurance-and-study-design-design.md`

**Interfaces:**
- Consumes the `/assurance` route and registered `study-design` tool from prior tasks.
- Produces a source-tree verification record and a README discoverability entry.

- [ ] **Step 1: Add a failing browser scenario**

```ts
test('methods index and study planner are usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/toolbox/#/assurance');
  await expect(page.getByRole('heading', { name: /methods & assurance/i })).toBeVisible();
  await page.goto('/toolbox/#/tool/study-design');
  await expect(page.getByText(/planning estimate/i)).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
});
```

- [ ] **Step 2: Run the scenario to verify it fails before its route/tool exists**

Run: `npm run e2e -- tests/e2e/smoke.spec.ts`

Expected: FAIL until Tasks 3 and 4 are complete; after they are complete, use this step to confirm the route is served by the built app.

- [ ] **Step 3: Add concise README guidance**

Add `Study design` to the tool overview and explain that Methods & assurance distinguishes source-tested methods from documented or review-required workflows. State that calculator outputs aid planning and do not replace assay validation, protocol controls, or a statistical analysis plan.

- [ ] **Step 4: Run the complete verification suite**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`

Expected: all commands exit 0. Inspect the build output for no route-loading error and record the command output in the implementation handoff.

- [ ] **Step 5: Commit the verified release**

```bash
git add README.md tests/e2e/smoke.spec.ts docs/superpowers/specs/2026-09-10-scientific-assurance-and-study-design-design.md
git commit -m "docs: explain scientific assurance and study planning"
```

## Plan self-review

- Spec coverage: Tasks 1 and 4 implement the exact, bounded two-group solver and planning UI; Tasks 2 and 3 implement all-tool assurance data, inventory, filter, route, and method links; Task 5 covers docs, responsive browser verification, and full release gates.
- Scope: multi-arm, paired, clustered, survival, Bayesian, and repeated-measures designs remain absent from the interface and core API.
- Type consistency: all later tasks use the exact core function names and `AssuranceStatus` union defined in Tasks 1 and 2.
- Placeholder scan: no deferred implementation placeholder is left in a task; explicit deferred scope is a product boundary, not unfinished work.
