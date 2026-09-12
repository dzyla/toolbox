# Sequence Annotator Interaction Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sequence type explicit and provide a stable, optional-analysis selection workspace for protein, DNA, and RNA.

**Architecture:** Keep `View.tsx` as route composition, but move type confidence and RNA pairing into small pure modules. Make `RangeInspector` the durable selection-detail surface and replace the below-canvas detected-feature list with an in-place detail presentation. Persist user choices in URL state without changing raw sequence content.

**Tech Stack:** TypeScript, Preact, Vitest, Testing Library, Tailwind CSS; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-12-sequence-annotator-interaction-redesign.md`

## Global Constraints

- All ranges remain 1-based and inclusive.
- DNA, RNA, and protein selection is explicit; detection supplies a non-mutating hint only.
- Optional feature and RNA structure layers are disabled by default.
- All calculations run locally and selection detail remains above the canvas.
- The quick RNA structure is a non-pseudoknotted pairing heuristic capped at 400 nt and must not claim thermodynamic prediction.
- Do not add dependencies.

---

### Task 1: Explicit type detection and a quick RNA folding core

**Files:**
- Create: `src/core/sequence-annotator/type.ts`
- Create: `src/core/sequence-annotator/rna-structure.ts`
- Modify: `src/core/sequence-annotator/index.ts`
- Test: `tests/core/sequence-annotator.test.ts`

**Interfaces:**
- Produces `sequenceTypeHint(raw): { kind: SequenceKind | null; label: string; confidence: 'likely' | 'possible' | 'uncertain' }`.
- Produces `foldQuickRna(sequence): { dotBracket: string; pairs: Array<[number, number]>; pairCount: number }` and `QUICK_RNA_MAX_LENGTH = 400`.

- [ ] **Step 1: Write failing core tests** for DNA/RNA/protein hints, ambiguous mixed T/U text, GU pairing, and the 400 nt guard.
- [ ] **Step 2: Run** `npm run test:unit -- tests/core/sequence-annotator.test.ts` **and verify the tests fail because the exports are absent.**
- [ ] **Step 3: Implement the smallest pure classifiers and Nussinov-style, minimum-loop-three RNA pairing helper to satisfy those cases.**
- [ ] **Step 4: Re-run the focused core tests and verify they pass.**

### Task 2: Immediate selection range editing and in-place analysis detail

**Files:**
- Modify: `src/tools/sequence/RangeInspector.tsx`
- Modify: `src/tools/sequence/View.tsx`
- Test: `tests/app/sequence-annotator.test.tsx`

**Interfaces:**
- `RangeInspector` accepts `proteinMetrics`, `nucleicMetrics`, `featureDetail`, and optional RNA structure props and calls `onSelectionChange` on every valid endpoint edit.
- It keeps an always-mounted details region directly before `SequenceCanvas`.

- [ ] **Step 1: Write failing UI tests** proving that changing the end then start input immediately changes the selection to the normalised range and that mass/pI, GC%, and Tm display inside the inspector.
- [ ] **Step 2: Run** `npm run test:unit -- tests/app/sequence-annotator.test.tsx` **and verify the assertions fail against the current blur-only inspector and lower metric panels.**
- [ ] **Step 3: Implement input-time normalisation, pass dynamic metric objects from `View`, calculate selected oligo Tm with safe warning capture, and render metrics in a persistent inspector detail grid.**
- [ ] **Step 4: Re-run the focused UI tests and verify they pass.**

### Task 3: Type chooser, type-aware parsing, and optional analysis layers

**Files:**
- Modify: `src/tools/sequence/View.tsx`
- Modify: `src/tools/sequence/SequenceCanvas.tsx`
- Test: `tests/app/sequence-annotator.test.tsx`

**Interfaces:**
- Route state gains `kind: SequenceKind`, `featureLayer: boolean`, and `rnaStructureLayer: boolean`.
- `parseInput(raw, kind)` cleans according to chosen kind; `sequenceTypeHint(raw)` displays advisory text only.
- `SequenceCanvas.features` receives `[]` while the protein feature layer is disabled.

- [ ] **Step 1: Write failing UI tests** selecting RNA for an ACGU input, showing a DNA suggestion without auto-changing the type, and confirming protein candidates are absent until the feature layer is enabled.
- [ ] **Step 2: Run the focused UI suite and verify the new behavior fails.**
- [ ] **Step 3: Add the segmented type control and hint, type-aware parsing/reset behavior, and independently labelled layer switches. Ensure default state keeps feature and RNA structure layers off.**
- [ ] **Step 4: Re-run focused UI tests and verify they pass.**

### Task 4: Compact feature selection and RNA structure display

**Files:**
- Create: `src/tools/sequence/RnaStructure.tsx`
- Modify: `src/tools/sequence/RangeInspector.tsx`
- Modify: `src/tools/sequence/View.tsx`
- Remove: `src/tools/sequence/DetectedFeatures.tsx`
- Test: `tests/app/sequence-annotator.test.tsx`

**Interfaces:**
- `RnaStructure` consumes `{ dotBracket, pairs, pairCount }` and renders accessible text plus an SVG arc map.
- `RangeInspector` presents enabled feature hits as chips and selected feature/annotation details without mounting a lower feature list.

- [ ] **Step 1: Write failing UI tests** that enable the feature layer, select one compact hit, assert the same selection and detail card, enable RNA structure, and assert dot-bracket/arc output for a short RNA selection.
- [ ] **Step 2: Run focused UI tests and verify they fail because the current lower feature section is still present and no RNA renderer exists.**
- [ ] **Step 3: Replace the lower feature list with in-inspector feature chips/detail, build the compact SVG RNA arc component, and display its length guard without disturbing canvas position.**
- [ ] **Step 4: Re-run focused UI tests and verify they pass.**

### Task 5: Full verification and visual QA

**Files:**
- Modify only files required to fix failures caused by Tasks 1–4.

- [ ] **Step 1: Run** `npm run typecheck`, `npm run lint`, `npm run test:unit`, **and** `npm run build`.
- [ ] **Step 2: Resolve only failures related to this work and re-run each failed command.**
- [ ] **Step 3: Start the Vite app and capture desktop and mobile screenshots of protein, DNA, and RNA annotator states.**
- [ ] **Step 4: Review screenshots for selection/detail stability, readable switches, no lower detected-feature wall, and RNA arc clipping.**
