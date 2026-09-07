# Sequence-aware Cloning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert cloning calculators into sequence-aware construct planners that validate every displayed product and junction.

**Architecture:** A `src/core/cloning` boundary owns oriented fragments, exact junction evidence, simulated products, findings, and provenance. Gibson, restriction/ligation, and Golden Gate feed the boundary. Reaction stoichiometry stays separate and is labelled unverified without a validated plan.

**Tech Stack:** TypeScript, Preact, Vitest, existing sequence/plasmid utilities and Gibson UI.

**Spec:** `docs/superpowers/specs/2026-09-07-scientific-workbench-gold-standard-design.md`

## Global Constraints

- A product status is `draft`, `blocked`, `sequence-validated`, or manual `bench-verified`; no status is inferred from a calculation.
- Exact oriented sequence evidence is mandatory for every asserted junction.
- Reaction quantities without a validated construct are called unverified stoichiometry.
- Golden Gate uses each enzyme's actual cleavage geometry; it never assumes universal 4-bp overhangs.
- User-visible help/science claims match implemented checks and cite sources.

---

### Task 1: Construct-plan foundation

**Files:** Create `src/core/cloning/types.ts`, `construct.ts`; modify `src/tools/cloning/View.tsx`; test `tests/core/construct.test.ts`.

**Interfaces:** Produce `ConstructFragment`, `JunctionEvidence`, `ConstructPlan`, `Finding`, `orientFragment()`, `createConstructPlan()`, and `simulateProduct()`.

- [ ] **Step 1: Write failing orientation, validated-product, and unresolved-junction tests.**

```ts
expect(orientFragment({ sequence: 'ATGC', orientation: 'reverse' })).toBe('GCAT');
expect(simulateProduct(validPlan).status).toBe('sequence-validated');
expect(simulateProduct(planWithUnresolvedJunction).status).toBe('blocked');
```

- [ ] **Step 2: Run `npm test -- tests/core/construct.test.ts`; confirm failure.**
- [ ] **Step 3: Implement immutable plan validation.** Validate unique IDs, DNA alphabet, vector/insert roles, orientation, requested topology, every evidence record, and closure. Simulate a product only after each join is exact; do not invent feature transfer.
- [ ] **Step 4: Run `npm test -- tests/core/construct.test.ts && npm run typecheck`; commit `feat: add validated cloning construct plans`.**

### Task 2: Gibson/HiFi verified overlaps

**Files:** Create `src/core/cloning/gibson.ts`; modify `src/core/gibson/index.ts`, `src/tools/gibson/View.tsx`, `src/tools/cloning/View.tsx`, `science.ts`; tests `tests/core/gibson-benchmark.test.ts`, `tests/core/gibson-validation.test.ts`.

**Interfaces:** Produce `planGibsonAssembly(input): ConstructPlan & { primers: AssemblyPrimer[] }`; retain `designAssembly()` as a deprecated adapter during migration.

- [ ] **Step 1: Write failures for valid multi-fragment joins, reverse insert, mismatch, and circular closure.**

```ts
expect(planGibsonAssembly(validThreeFragmentInput).status).toBe('sequence-validated');
expect(planGibsonAssembly(reversedInsertInput).product!.sequence).toContain(reverseComplement(insert));
expect(planGibsonAssembly(mismatchedOverlapInput).findings).toContainEqual(expect.objectContaining({ code: 'OVERLAP_MISMATCH' }));
```

- [ ] **Step 2: Run `npm test -- tests/core/gibson-benchmark.test.ts tests/core/gibson-validation.test.ts`; confirm failure.**
- [ ] **Step 3: Derive primer homology from adjacent oriented fragments and compare terminal overlaps exactly.** Merge each verified overlap once; reject unmatched or ambiguous closures; record sequence/length/method-labelled Tm/repeat warnings. Remove unsupported vendor-specific annealing claims.
- [ ] **Step 4: Keep the official primer benchmark plus negative tests passing; commit `fix: validate Gibson construct junctions`.**

### Task 3: Restriction digest geometry and ligation checks

**Files:** Create `src/core/cloning/enzymes.ts`, `restriction.ts`; modify `src/core/plasmid/index.ts`, `src/tools/cloning/View.tsx`, `science.ts`; test `tests/core/restriction-ligation.test.ts`.

**Interfaces:** Produce `RestrictionEnzyme`, `digestFragment()`, `validateLigationPlan()`, and `calculateReactionSetup()`.

- [ ] **Step 1: Write failing exact-end and incompatibility tests.**

```ts
const digest = digestFragment(ecoriVector, ECO_RI, selectedSite);
expect(digest.ends.right.sequence).toBe('AATT');
expect(validateLigationPlan(incompatibleEnds).status).toBe('blocked');
expect(validateLigationPlan(compatibleDirectionalEnds).status).toBe('sequence-validated');
```

- [ ] **Step 2: Run `npm test -- tests/core/restriction-ligation.test.ts`; confirm failure.**
- [ ] **Step 3: Model recognition sequence, forward/reverse cuts, end sequence/orientation/type, and sourced methylation sensitivity.** Scan actual fragments; list candidate products; validate selected vector/insert end compatibility and direction. Keep quantity math callable separately with `unverified-stoichiometry` status.
- [ ] **Step 4: Run `npm test -- tests/core/restriction-ligation.test.ts tests/core/plasmid.test.ts`; commit `feat: validate restriction ligation ends`.**

### Task 4: Golden Gate sequence checks

**Files:** Create `src/core/cloning/golden-gate.ts`; modify `src/tools/cloning/View.tsx`, `science.ts`; tests `tests/core/golden-gate.test.ts`, `tests/app/cloning.test.tsx`.

**Interfaces:** Produce `planGoldenGateAssembly()`, `scanInternalSites()`, and `validateOverhangs()`.

- [ ] **Step 1: Write valid-product, internal-site, incorrect-length, duplicate-overhang, and reversed-order failures.**

```ts
expect(planGoldenGateAssembly(validBsaIPlan).status).toBe('sequence-validated');
expect(planGoldenGateAssembly(internalSitePlan).findings).toContainEqual(expect.objectContaining({ code: 'INTERNAL_RECOGNITION_SITE' }));
expect(validateOverhangs(duplicateOverhangs).blockers).toHaveLength(1);
```

- [ ] **Step 2: Run `npm test -- tests/core/golden-gate.test.ts tests/app/cloning.test.tsx`; confirm failure.**
- [ ] **Step 3: Require source sequences, enzyme, order, and explicit overhangs.** Use actual enzyme cuts; block internal chosen-enzyme sites unless an explicit domestication plan exists; validate direction, length, uniqueness, and complementarity. State absent ligation-fidelity modeling rather than claim it.
- [ ] **Step 4: Run focused tests; commit `feat: validate Golden Gate assembly plans`.**

### Task 5: Construct review, provenance export, and hand-off

**Files:** Create `src/tools/cloning/ConstructReview.tsx`, `src/core/cloning/export.ts`, `tests/e2e/cloning.spec.ts`; modify `src/tools/cloning/View.tsx`, `src/tools/registry.ts`; tests `tests/core/cloning-export.test.ts`, `tests/app/cloning.test.tsx`.

**Interfaces:** Produce `exportConstructPlan(plan, format)` and `ConstructReview` accepting a `ConstructPlan`.

- [ ] **Step 1: Write blocked/validated-label and evidence-export tests.**

```ts
expect(screen.getByText(/Sequence-validated construct/)).toBeTruthy();
expect(screen.getByText(/Blocked: OVERLAP_MISMATCH/)).toBeTruthy();
expect(JSON.parse(exportConstructPlan(validPlan, 'json')).junctions[0].evidence.sequence).toBeDefined();
```

- [ ] **Step 2: Run `npm test -- tests/core/cloning-export.test.ts tests/app/cloning.test.tsx`; confirm failure.**
- [ ] **Step 3: Render order, oriented fragments, exact joins, findings, product/topology, and method settings.** Export JSON/GenBank only for a validated product; show reaction plans separately. Hand off only a validated `PlasmidDocument` to the plasmid viewer.
- [ ] **Step 4: Run `npm test -- tests/core/construct.test.ts tests/core/gibson*.test.ts tests/core/restriction-ligation.test.ts tests/core/golden-gate.test.ts tests/core/cloning-export.test.ts tests/app/cloning.test.tsx && npm run e2e -- tests/e2e/cloning.spec.ts && npm run build`; commit `feat: review and export validated cloning constructs`.**
