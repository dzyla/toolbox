# Cloning Bench Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the calculator-led cloning bench with a sequence-validated design workspace for Q5 mutagenesis, NEBuilder HiFi/Gibson, In-Fusion, restriction/ligation, and Golden Gate.

**Architecture:** `src/core/cloning` is the method-neutral construct domain and exact product simulator. Q5, homology assembly, restriction/ligation, and Golden Gate each produce a `ConstructPlan` with explicit evidence and findings. Preact panels are thin clients over those pure engines and share imported plasmid sources, ordered fragments, review, and export.

**Tech Stack:** TypeScript, Preact, Vitest, the existing plasmid import/export/document model, nucleic-acid thermodynamics, and browser `File` APIs.

**Spec:** `docs/superpowers/specs/2026-09-07-cloning-bench-rework-design.md`

## Global Constraints

- All source sequence processing is browser-local; supported import formats are FASTA, GenBank/DDBJ, and SnapGene `.dna`.
- A product status is exactly `draft`, `blocked`, `sequence-validated`, or manually recorded `bench-verified`; no status is inferred from a reaction calculation.
- Product sequence is generated only from exact oriented designed fragments and verified junctions; never concatenate raw sources and call it assembled.
- Q5 defaults are minimum 15 nt annealing region and 55°C minimum annealing Tm; partial inputs require 35 nt upstream and 25 nt downstream of each edit.
- NEBuilder HiFi defaults to a 20 nt arm (range 15–30 nt) and warns below 48°C homology Tm.
- In-Fusion defaults to 15 nt terminal homology, recommends 20 nt for multiple fragments, allows 12–21 nt, and models vector end type.
- Every displayed blocked condition has a finding code, severity, affected source, and correction text. Reaction stoichiometry without a valid plan is labelled `unverified stoichiometry`.

---

### Task 1: Create the immutable construct-plan foundation

**Files:**
- Create: `src/core/cloning/types.ts`
- Create: `src/core/cloning/construct.ts`
- Create: `src/core/cloning/index.ts`
- Test: `tests/core/construct.test.ts`

**Interfaces:**

```ts
export type ConstructStatus = 'draft' | 'blocked' | 'sequence-validated' | 'bench-verified';
export interface DesignFragment { id: string; name: string; sourceSequence: string; orientedSequence: string; role: 'vector' | 'insert' | 'amplicon'; orientation: 'forward' | 'reverse'; }
export interface JunctionEvidence { leftFragmentId: string; rightFragmentId: string; method: ConstructMethod; overlap: string; expectedOverlapLength: number; observedLeftTerminal: string; observedRightTerminal: string; validated: boolean; tmC?: number; notes: string[]; }
export interface Finding { code: string; severity: 'blocker' | 'warning' | 'info'; message: string; fragmentId?: string; junctionIndex?: number; }
export interface ConstructPlan { method: ConstructMethod; status: ConstructStatus; topology: 'circular' | 'linear'; fragments: DesignFragment[]; junctions: JunctionEvidence[]; product?: PlasmidDocument; findings: Finding[]; provenance: Record<string, string | number | boolean>; }
export function orientFragment(fragment: Pick<DesignFragment, 'sourceSequence' | 'orientation'>): string;
export function finalizeConstructPlan(input: Omit<ConstructPlan, 'status' | 'product'>): ConstructPlan;
```

- [ ] **Step 1: Write failing construct validation tests.**

```ts
expect(orientFragment({ sourceSequence: 'ATGC', orientation: 'reverse' })).toBe('GCAT');
expect(finalizeConstructPlan(validCircularInput).status).toBe('sequence-validated');
expect(finalizeConstructPlan(withUnresolvedJunction).status).toBe('blocked');
expect(finalizeConstructPlan(withDuplicateFragmentId).findings).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_FRAGMENT_ID' }));
```

- [ ] **Step 2: Run `npm run test:unit -- tests/core/construct.test.ts` and confirm the missing module/function failures.**
- [ ] **Step 3: Implement `types.ts` and `construct.ts`.** Sanitize IUPAC DNA, validate non-empty unique fragment IDs and oriented sequences, derive reverse orientation once, validate every declared junction, merge a validated overlap once per join, verify a circular closing join, create a linear/circular `PlasmidDocument`, and return actionable blockers instead of throwing for user input.
- [ ] **Step 4: Re-run `npm run test:unit -- tests/core/construct.test.ts` and `npm run typecheck`; confirm passing output.**
- [ ] **Step 5: Commit `feat: add validated cloning construct domain`.**

### Task 2: Add plasmid and fragment source ingestion

**Files:**
- Create: `src/core/cloning/sources.ts`
- Modify: `src/core/plasmid/import.ts`
- Test: `tests/core/cloning-sources.test.ts`

**Interfaces:**

```ts
export interface CloningSource { id: string; name: string; document: PlasmidDocument; kind: 'plasmid' | 'fragment'; }
export interface Linearization { kind: 'coordinates' | 'inverse-pcr'; start: number; end: number; }
export function sourceFromText(id: string, text: string, topology?: PlasmidTopology): CloningSource;
export function sourceFromFile(id: string, file: Blob): Promise<CloningSource>;
export function linearizeSource(source: CloningSource, selection: Linearization): { sequence: string; findings: Finding[] };
```

- [ ] **Step 1: Write failing tests for FASTA/GenBank/SnapGene source preservation, circular wrap linearization, linear-source rejection of wrapped bounds, and duplicate source IDs.**

```ts
expect(linearizeSource(circularSource, { kind: 'coordinates', start: 7, end: 3 }).sequence).toBe('TACATG');
expect(linearizeSource(linearSource, { kind: 'coordinates', start: 7, end: 3 }).findings[0]!.code).toBe('WRAPPED_LINEARIZATION_ON_LINEAR_SOURCE');
await expect(sourceFromFile('p1', snapGeneFixture)).resolves.toMatchObject({ document: { annotations: expect.any(Array) } });
```

- [ ] **Step 2: Run `npm run test:unit -- tests/core/cloning-sources.test.ts` and confirm failures.**
- [ ] **Step 3: Implement source wrappers around the existing import adapters.** Preserve document metadata/annotations, make a user-selected topology explicit for plain FASTA, and return a contiguous retained backbone for selected circular coordinates without mutating the source document.
- [ ] **Step 4: Run `npm run test:unit -- tests/core/cloning-sources.test.ts tests/core/plasmid-import.test.ts` and `npm run typecheck`.**
- [ ] **Step 5: Commit `feat: add cloning plasmid and fragment sources`.**

### Task 3: Implement Q5/NEBaseChanger-compatible mutation planning

**Files:**
- Create: `src/core/cloning/q5.ts`
- Modify: `src/core/mutagenesis/index.ts`
- Test: `tests/core/q5-mutagenesis.test.ts`

**Interfaces:**

```ts
export type CodonStrategy = 'ecoli-max-usage' | 'maximum-parsimony';
export type Q5Edit = { kind: 'amino-acid'; expression: string; orfStart: number; strategy: CodonStrategy } | { kind: 'replace'; start: number; end: number; replacement: string };
export interface Q5Options { partial: boolean; minPrimerLength: number; minAnnealTm: number; confineChangesToFivePrimeTails: boolean; constructName: string; }
export interface Q5Plan extends ConstructPlan { primers: AssemblyPrimer[]; edits: Q5Edit[]; }
export function planQ5Mutagenesis(source: CloningSource, edits: Q5Edit[], options: Q5Options): Q5Plan;
```

- [ ] **Step 1: Write failing tests for `M2A`, explicit `M2G:GGG`, wild-type mismatch, insertion, deletion, partial flank insufficiency, 5′-tail placement, circular wrap mutation, and exact mutant-product sequence.**

```ts
expect(planQ5Mutagenesis(gfpSource, [{ kind: 'amino-acid', expression: 'S3T', orfStart: 1, strategy: 'ecoli-max-usage' }], defaults).product!.sequence).toContain('ACC');
expect(planQ5Mutagenesis(gfpSource, [{ kind: 'amino-acid', expression: 'A3T', orfStart: 1, strategy: 'maximum-parsimony' }], defaults).findings).toContainEqual(expect.objectContaining({ code: 'WILDTYPE_AMINO_ACID_MISMATCH' }));
expect(planQ5Mutagenesis(partialSource, [edgeEdit], { ...defaults, partial: true }).status).toBe('blocked');
```

- [ ] **Step 2: Run `npm run test:unit -- tests/core/q5-mutagenesis.test.ts` and confirm failures.**
- [ ] **Step 3: Implement strict edit parsing and exact edit application.** Reuse translation/codon tables and nearest-neighbour Tm; add maximum-parsimony selection; generate non-overlapping back-to-back primers with documented minimums; identify primer mutation/annealing segments; and only finalize a product after re-checking every requested edit.
- [ ] **Step 4: Keep `designSiteDirectedMutagenesis`, `designFlexibleMutagenesis`, and existing mutagenesis tests as compatibility adapters. Run `npm run test:unit -- tests/core/q5-mutagenesis.test.ts tests/core/new-tools-suite.test.ts`.**
- [ ] **Step 5: Commit `feat: add Q5 mutagenesis construct planner`.**

### Task 4: Implement exact NEBuilder HiFi and Gibson assembly planning

**Files:**
- Create: `src/core/cloning/homology.ts`
- Modify: `src/core/gibson/index.ts`
- Test: `tests/core/nebuilder-assembly.test.ts`
- Test: `tests/core/gibson-benchmark.test.ts`

**Interfaces:**

```ts
export interface HomologyAssemblyInput { method: 'nebuilder' | 'gibson'; vector: DesignFragment; inserts: DesignFragment[]; topology: 'circular' | 'linear'; overlapLength: number; targetAnnealTm: number; }
export interface HomologyAssemblyPlan extends ConstructPlan { primers: AssemblyPrimer[]; }
export function planHomologyAssembly(input: HomologyAssemblyInput): HomologyAssemblyPlan;
```

- [ ] **Step 1: Write failing tests for a published NEBuilder two-fragment benchmark, three fragments, reversed insert orientation, overlap merged once in the product, failed closing overlap, short template, repeat-ambiguous arm, and low-Tm finding.**

```ts
expect(planHomologyAssembly(validThreeFragmentInput).status).toBe('sequence-validated');
expect(planHomologyAssembly(reversedInsertInput).product!.sequence).toContain(reverseComplement(insert.sequence));
expect(planHomologyAssembly(mismatchInput).findings).toContainEqual(expect.objectContaining({ code: 'OVERLAP_MISMATCH' }));
expect(planHomologyAssembly(validInput).product!.sequence.length).toBe(expectedMergedLength);
```

- [ ] **Step 2: Run `npm run test:unit -- tests/core/nebuilder-assembly.test.ts tests/core/gibson-benchmark.test.ts` and confirm failures.**
- [ ] **Step 3: Implement primer-derived amplicons and exact junction checks.** For each ordered oriented fragment, derive the 5′ homology tail from its predecessor and corresponding reverse-primer tail from its successor, create designed amplicon sequences, verify left/right terminal overlap equality, calculate Tm/GC/repeat diagnostics, and finalize only if all joins validate.
- [ ] **Step 4: Convert `designAssembly()` into a compatibility adapter around `planHomologyAssembly()`. Preserve existing public primer fields and the official benchmark sequences.**
- [ ] **Step 5: Run `npm run test:unit -- tests/core/nebuilder-assembly.test.ts tests/core/gibson-benchmark.test.ts tests/core/new-tools-suite.test.ts` and `npm run typecheck`; commit `feat: validate NEBuilder and Gibson assemblies`.**

### Task 5: Implement In-Fusion-specific assembly and vector-end semantics

**Files:**
- Create: `src/core/cloning/infusion.ts`
- Test: `tests/core/infusion-assembly.test.ts`

**Interfaces:**

```ts
export type InFusionVectorEnd = 'inverse-pcr' | 'blunt' | 'five-prime-overhang' | 'three-prime-overhang';
export interface InFusionInput { vector: DesignFragment; inserts: DesignFragment[]; topology: 'circular' | 'linear'; vectorEnd: InFusionVectorEnd; overlapLength: number; interstitialSequences: string[]; }
export function planInFusionAssembly(input: InFusionInput): HomologyAssemblyPlan;
```

- [ ] **Step 1: Write failing tests for 15 nt default arms, 20 nt multi-fragment recommendation, rejected 11/22 nt arms, 5′-overhang inclusion, 3′-overhang exclusion, optional inserted tag bases, reverse insert, and exact product junctions.**

```ts
expect(planInFusionAssembly(defaultInput).primers[0]!.overhangLength).toBe(15);
expect(planInFusionAssembly({ ...defaultInput, overlapLength: 11 }).status).toBe('blocked');
expect(planInFusionAssembly(fivePrimeOverhangInput).primers[0]!.overhangSeq).toBe(expectedComplementaryVectorEnd);
expect(planInFusionAssembly(threePrimeOverhangInput).primers[0]!.overhangSeq).not.toContain(excludedThreePrimeEnd);
```

- [ ] **Step 2: Run `npm run test:unit -- tests/core/infusion-assembly.test.ts` and confirm failures.**
- [ ] **Step 3: Implement the In-Fusion policy separately from generic homology assembly.** Use terminal 15 nt default/12–21 nt range, expose a 20 nt multi-fragment warning recommendation, choose vector terminal homology according to its end type, append declared interstitial bases between arm and gene-specific sequence, and validate every product junction.
- [ ] **Step 4: Run `npm run test:unit -- tests/core/infusion-assembly.test.ts tests/core/nebuilder-assembly.test.ts` and `npm run typecheck`; commit `feat: add In-Fusion assembly planner`.**

### Task 6: Make restriction/ligation and Golden Gate sequence-aware advanced methods

**Files:**
- Create: `src/core/cloning/enzymes.ts`
- Create: `src/core/cloning/restriction.ts`
- Create: `src/core/cloning/golden-gate.ts`
- Test: `tests/core/restriction-ligation.test.ts`
- Test: `tests/core/golden-gate.test.ts`

**Interfaces:**

```ts
export interface RestrictionEnzyme { id: string; recognition: string; forwardCut: number; reverseCut: number; }
export function digestFragment(fragment: DesignFragment, enzyme: RestrictionEnzyme): DigestResult;
export function planRestrictionLigation(input: RestrictionLigationInput): ConstructPlan;
export function planGoldenGateAssembly(input: GoldenGateInput): ConstructPlan;
```

- [ ] **Step 1: Write failing tests for EcoRI-compatible and incompatible ligation ends, blunt-end non-directional warnings, BsaI valid product, internal Type IIS site blocker, incorrect overhang length, duplicate overhang, complement mismatch, and reversed-order product.**

```ts
expect(digestFragment(ecoriVector, ECO_RI).products[0]!.rightEnd.sequence).toBe('AATT');
expect(planRestrictionLigation(incompatibleInput).status).toBe('blocked');
expect(planGoldenGateAssembly(validBsaIInput).status).toBe('sequence-validated');
expect(planGoldenGateAssembly(internalSiteInput).findings).toContainEqual(expect.objectContaining({ code: 'INTERNAL_RECOGNITION_SITE' }));
```

- [ ] **Step 2: Run `npm run test:unit -- tests/core/restriction-ligation.test.ts tests/core/golden-gate.test.ts` and confirm failures.**
- [ ] **Step 3: Implement enzyme cut geometry and end validation from actual sequences.** Ensure reaction-mass calculation remains a separate helper returning `unverified-stoichiometry` until it is passed a validated plan.
- [ ] **Step 4: Run the two focused test files and `npm run typecheck`; commit `feat: validate advanced cloning methods`.**

### Task 7: Build shared design, fragment, primer, and review panels

**Files:**
- Create: `src/tools/cloning/DesignSources.tsx`
- Create: `src/tools/cloning/FragmentStrip.tsx`
- Create: `src/tools/cloning/PrimerTable.tsx`
- Create: `src/tools/cloning/ConstructReview.tsx`
- Create: `src/tools/cloning/export.ts`
- Test: `tests/app/cloning-components.test.tsx`

**Interfaces:**

```ts
export function DesignSources(props: { sources: CloningSource[]; onAddText: (text: string) => void; onAddFile: (file: File) => Promise<void>; }): JSX.Element;
export function FragmentStrip(props: { fragments: DesignFragment[]; onMove: (id: string, direction: -1 | 1) => void; onToggleOrientation: (id: string) => void; }): JSX.Element;
export function ConstructReview(props: { plan: ConstructPlan; onOpenProduct: () => void; }): JSX.Element;
export function exportConstructPlan(plan: ConstructPlan, format: 'json' | 'genbank' | 'fasta'): string;
```

- [ ] **Step 1: Write failing UI tests for file/text source controls, keyboard-labelled move/reverse controls, primer copy/export controls, blocked-finding rendering, and disabled product export on blocked plans.**

```tsx
expect(screen.getByRole('button', { name: /Reverse Insert GFP/i })).toBeTruthy();
expect(screen.getByText(/Blocked: OVERLAP_MISMATCH/i)).toBeTruthy();
expect(screen.getByRole('button', { name: /Download GenBank/i })).toBeDisabled();
```

- [ ] **Step 2: Run `npm run test:unit -- tests/app/cloning-components.test.tsx` and confirm failures.**
- [ ] **Step 3: Implement accessible source cards, ordered fragment strip, copyable primer table, and a review panel that exposes method, status, topology, exact junction evidence, findings, and product preview.** Ensure JSON exports include provenance/findings; GenBank/FASTA export only validated products.
- [ ] **Step 4: Run `npm run test:unit -- tests/app/cloning-components.test.tsx` and `npm run typecheck`; commit `feat: add cloning design review components`.**

### Task 8: Replace the cloning bench UI and preserve legacy entry points

**Files:**
- Modify: `src/tools/cloning/View.tsx`
- Modify: `src/tools/gibson/View.tsx`
- Modify: `src/tools/mutagenesis/View.tsx`
- Modify: `src/tools/cloning/science.ts`
- Test: `tests/app/cloning.test.tsx`
- Test: `tests/e2e/cloning.spec.ts`

**Interfaces:**

```ts
type DesignMethod = 'q5' | 'nebuilder' | 'gibson' | 'infusion' | 'restriction-ligation' | 'golden-gate';
interface CloningBenchState { method: DesignMethod; step: 'sources' | 'settings' | 'review' | 'results'; sources: CloningSource[]; fragmentOrder: string[]; }
```

- [ ] **Step 1: Write failing integration tests for the three method cards, full-plasmid import, explicit circular-vector linearization requirement, fragment reorder/reverse, Q5 mutation design, In-Fusion vector-end selection, sequence-validated product hand-off, and legacy Gibson/mutagenesis route compatibility.**

```tsx
fireEvent.click(screen.getByRole('button', { name: /In-Fusion Assembly/i }));
expect(screen.getByRole('combobox', { name: /Vector end preparation/i })).toBeTruthy();
expect(screen.getByText(/Select how to linearize this circular plasmid/i)).toBeTruthy();
expect(screen.getByRole('button', { name: /Open sequence-validated product in Plasmid Viewer/i })).toBeEnabled();
```

- [ ] **Step 2: Run `npm run test:unit -- tests/app/cloning.test.tsx` and `npm run e2e -- tests/e2e/cloning.spec.ts`; confirm failures.**
- [ ] **Step 3: Replace the tabbed calculators with the five-step workspace.** Use the shared panels and method engines, persist only serializable source/settings state in URLs, report legacy malformed state as a visible recoverable finding, and let Gibson/Mutagenesis tool routes preselect their equivalent primary method without duplicating design logic.
- [ ] **Step 4: Update the science panel to state implemented checks and cite the NEB/Takara sources in the design spec.**
- [ ] **Step 5: Run `npm run test:unit -- tests/app/cloning.test.tsx tests/app/cloning-components.test.tsx && npm run e2e -- tests/e2e/cloning.spec.ts && npm run typecheck`; commit `feat: rebuild cloning construct workspace`.**

### Task 9: Verify product hand-off and release quality

**Files:**
- Modify: `src/tools/plasmid/View.tsx` only if the hand-off contract needs a routing adapter
- Test: `tests/core/cloning-export.test.ts`
- Test: `tests/e2e/cloning.spec.ts`

- [ ] **Step 1: Write failing tests that pass a validated `PlasmidDocument` into the viewer and reject blocked product hand-off.**

```ts
expect(exportConstructPlan(validPlan, 'genbank')).toContain('LOCUS');
expect(() => exportConstructPlan(blockedPlan, 'genbank')).toThrow(/sequence-validated/i);
```

- [ ] **Step 2: Run `npm run test:unit -- tests/core/cloning-export.test.ts` and confirm failures.**
- [ ] **Step 3: Complete any minimal route adapter needed for the existing project-backed plasmid viewer. Do not create a second plasmid model.**
- [ ] **Step 4: Run `npm run test:unit && npm run typecheck && npm run lint && npm run build && npm run e2e -- tests/e2e/cloning.spec.ts`. Review `git diff --check` and the browser result states before committing `feat: deliver validated cloning bench`.**
