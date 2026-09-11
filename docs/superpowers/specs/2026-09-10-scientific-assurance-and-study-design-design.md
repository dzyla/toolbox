# Scientific assurance and study-design workbench

**Status:** implemented and release-verified on 2026-09-11; 38 registered tools

**Date:** 2026-09-10

## Purpose

Bio-Bench is useful only when a researcher can tell what a result means, when
it is appropriate to use, and when the supplied data cannot support a claim.
The app began with 37 scientific tools, each with a methods panel and tests.
This release makes that evidence discoverable and actionable across the
application, then adds the browser-local experimental-design tool as the 38th
tool to help prevent avoidable underpowered studies before data collection.

The quality bar is practical rather than promotional: results must either be
calculated from supported inputs with their method and limits visible, or be
blocked with a specific corrective action. The app must not call a heuristic,
fit, or planning estimate a laboratory validation or a wet-lab guarantee.

## Scope

### Included

1. A typed assurance record for every registered tool. It records its method
   status, review date, scope note, and the kind of verification present. A
   registry test prevents a future tool from being listed without that record.
2. A Methods & assurance page linked from navigation and the home page. It
   summarizes coverage and lets a researcher filter the complete inventory by
   domain and assurance state, then opens the relevant tool or its method
   record.
3. Shared inline status language for validated, review-required, exploratory,
   and blocked outputs. The release applies it to the new planner and preserves
   existing tool-specific warnings; it does not relabel undocumented methods as
   validated.
4. An Experimental Design & Power Planner for two independent groups. It
   provides an exact noncentral-t power calculation, solves for sample size,
   power, or detectable standardized effect, exposes two- versus one-sided
   testing and allocation ratio, and reports the design assumptions in an
   exportable result. It is a planning aid, not an analysis of observed data.
5. Source-backed core tests, accessibility tests, and a browser smoke test for
   the planner and assurance navigation.

### Deferred deliberately

- Claiming clinical, assay, or instrument validation from software tests.
- A universal quality score; assurance depends on a tool's method and input
  domain, not a single number.
- Server-side statistics, data upload, accounts, or telemetry.
- Multi-arm, clustered, survival, Bayesian, and repeated-measures power
  designs. They need separately validated methods and are better added as
  explicit future planners than approximated silently.

## Architecture

### Assurance registry

`src/tools/assurance.ts` is the application-level index, keyed by every
`ToolMeta.id`. It contains:

```ts
type AssuranceStatus = 'reference-tested' | 'method-documented' | 'review-required';
interface ToolAssurance {
  status: AssuranceStatus;
  reviewed: string;
  scope: string;
  verification: string;
}
```

`reference-tested` means a tool has source-backed or independently derived
reference tests for its scientific core; `method-documented` means its method
and citations are available but it remains in the audit queue; and
`review-required` is used when a workflow is intentionally exploratory or has
not yet met the preceding bar. The UI spells these labels out and never shows a
status as a wet-lab certification.

The registry uses a `Record<ToolId, ToolAssurance>` and a unit test compares its
keys with `TOOLS`. Maintaining a new tool therefore requires an intentional
assurance classification. The summary counts are computed from the record, not
hard-coded.

### Methods & assurance page

The page is a plain, searchable table/card layout with: coverage summary,
status filter, category filter, each tool's short scope note, review date, and
one methods-intent link to the tool (`?methods=1`). It is reachable at `/assurance`.
It remains useful on a phone: summary cards stack, filters wrap, and each row
has text labels rather than color-only status.

The link preserves methods intent in the tool URL; users open the existing
methods panel inside the tool. The assurance index is therefore a navigation
layer rather than a duplicate of 38 bodies of scientific prose.

### Study-design core

`src/core/study-design/` is framework-free and exposes independent functions
for the Student-t distribution and the two-sample power problem. Given alpha,
power target, Cohen's d, alternative, and allocation ratio it uses a bracketed
integer search for the smallest per-group sample sizes whose noncentral-t
power meets the target. The same solver can invert for achieved power or
minimum detectable effect.

Numerical functions have finite-input checks and bounded iteration. They return
calculated values on success or throw named, bounded errors for invalid input,
unreachable targets, or failed numerical convergence. They never convert a
non-finite value into a plausible result.

The planner accepts standardized effect size directly or derives it from a
meaningful absolute difference and expected common standard deviation. It
states its equal-variance, independent-observation, and approximate-normality
assumptions. A planned dropout percentage increases the recommended enrollment
with `ceil(n / (1 - dropout))`; it does not alter analytical power.

### Planner interface and output states

The tool begins with a simple question: "How many samples per group?" Advanced
controls expose alpha, target power, sidedness, allocation, and dropout. The
result gives the analysis sample size for each group, enrollment after dropout,
the chosen effect size, and a short plain-language interpretation. A secondary
tab solves for achieved power or detectable effect without mixing objectives.

Invalid fields remain beside their inputs; no computed recommendation appears
until the design is valid. An explicit `Planning estimate` status explains that
the calculator helps choose a design and does not validate the experiment,
assay, distribution, or statistical analysis plan. Copy and CSV/text export
include settings, method, assumptions, version, and planning limitations.

## Data flow and errors

`planner controls → validated core inputs → exact solver → calculated values or
named bounded error → visible summary / export`.

All parsing happens locally. Bad numbers, alpha outside `(0,1)`, nonpositive
effect or SD, invalid allocation, impossible power targets, and nonconvergence
are named inline. No raw scientific data is stored or uploaded.

## Verification

1. Registry contract test: each current and future tool has exactly one
   assurance record; no stale record remains.
2. Reference tests: compare selected two-sample cases to G*Power/R `pwr.t.test`
   published or independently generated values; verify monotonicity (larger N
   never lowers power and larger effect never increases required N), inversion,
   dropout rounding, and invalid inputs.
3. Component tests: default result, invalid input blocking, alternate modes,
   exported provenance, assurance filters, and keyboard-accessible links.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and
   Playwright smoke coverage before release.

## Sources

- Cohen J. *Statistical Power Analysis for the Behavioral Sciences*, 2nd ed.
  Routledge, 1988. Cohen's conventional standardized-effect framework.
- Chow SC, Shao J, Wang H, Lokhnygina Y. *Sample Size Calculations in Clinical
  Research*, 3rd ed. Chapman & Hall/CRC, 2017. Two-sample t-test power design.
- R `stats::power.t.test` documentation and G*Power 3.1 methodology are used
  as independent numerical comparators for fixture values.
