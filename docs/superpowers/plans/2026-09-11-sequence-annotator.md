# Sequence Annotator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Sequence Viewer route as a durable, mouse-selectable sequence annotator for protein, DNA, and RNA.

**Architecture:** A small pure `sequence-annotator` core owns coordinate validation and annotation edit transforms. Focused Preact components render the sequence canvas and annotation editor; `View.tsx` composes parsing, property calculations, export, and handoff actions. Existing protein and nucleic calculation functions remain the scientific source of truth.

**Tech Stack:** TypeScript, Preact, Vitest, Testing Library, Tailwind CSS, existing URL-state and export helpers.

**Spec:** `docs/superpowers/specs/2026-09-11-sequence-annotator-design.md`

## Global Constraints

- All sequence and annotation coordinates are 1-based inclusive.
- The annotator is linear and local-first; it must not send sequences to external services.
- Protein calculations reuse `src/core/protein`; nucleic calculations reuse `src/core/nucleic`.
- JSON is the lossless annotation format; FASTA is sequence-only.
- Do not add dependencies.

---

### Task 1: Durable annotation-document core

**Files:**
- Create: `src/core/sequence-annotator/index.ts`
- Create: `tests/core/sequence-annotator.test.ts`

**Interfaces:**
- Produces `SequenceKind`, `SequenceAnnotation`, `Selection`, `normaliseSelection`, `validateAnnotations`, and `transformAnnotationsForEdit`.
- Consumed by the canvas and Sequence Annotator route.

- [ ] **Step 1: Write failing unit tests**

```ts
it('shifts a downstream annotation after an insertion', () => {
  const annotation = { id: 'a', name: 'domain', type: 'domain', start: 6, end: 10, color: '#000', note: '', evidence: 'user' as const };
  expect(transformAnnotationsForEdit([annotation], 3, 0, 2, 20)).toMatchObject([{ start: 8, end: 12 }]);
});
```

- [ ] **Step 2: Run `npm run test:unit -- tests/core/sequence-annotator.test.ts` and confirm the missing-module failure.**
- [ ] **Step 3: Implement typed range validation, selection normalisation, and insertion/deletion transforms in the new core module.**
- [ ] **Step 4: Re-run the focused test and confirm it passes.**

### Task 2: Mouse-selectable, labelled sequence canvas

**Files:**
- Create: `src/tools/sequence/SequenceCanvas.tsx`
- Create: `tests/app/sequence-annotator.test.tsx`

**Interfaces:**
- Consumes `SequenceAnnotation`, `Selection`, and a residue/base colour callback.
- Produces `SequenceCanvas` with `onSelectionChange(selection)` and `onAnnotationSelect(annotation)`.

- [ ] **Step 1: Write a failing UI test that drags from residue 2 to 5 and expects `Selection: 2–5`.**
- [ ] **Step 2: Run `npm run test:unit -- tests/app/sequence-annotator.test.tsx` and confirm it fails because the canvas is absent.**
- [ ] **Step 3: Implement numbered, 10-character-grouped sequence rows; pointer drag and shift-click selection; visible annotation bands; and accessible residue buttons.**
- [ ] **Step 4: Re-run the focused test and confirm it passes.**

### Task 3: Annotation editor and edit-stable sequence state

**Files:**
- Create: `src/tools/sequence/AnnotationEditor.tsx`
- Modify: `src/tools/sequence/View.tsx`
- Modify: `tests/app/sequence-annotator.test.tsx`

**Interfaces:**
- Consumes active selection and an annotation list.
- Produces annotation create/update/remove controls and a clickable annotation list.

- [ ] **Step 1: Write failing UI tests for creating a named range annotation and selecting it from the annotation list.**
- [ ] **Step 2: Run the focused test and confirm it fails.**
- [ ] **Step 3: Replace the current details-first route composition with persisted annotation state, range editing, the sequence canvas, and the annotation editor. Use `transformAnnotationsForEdit` when the cleaned sequence changes.**
- [ ] **Step 4: Re-run the focused tests and confirm they pass.**

### Task 4: Range analysis, colour modes, export, and handoffs

**Files:**
- Modify: `src/tools/sequence/View.tsx`
- Modify: `src/tools/sequence/science.ts`
- Modify: `tests/app/sequence-annotator.test.tsx`

**Interfaces:**
- Uses existing `summarize`, `netCharge`, `extinctionCoefficients`, `gcContent`, and `reverseComplement` functions.
- Provides JSON/FASTA downloads and destination links carrying the current selection.

- [ ] **Step 1: Write failing UI tests asserting protein selections show MW and pI, while DNA selections show GC%, and asserting an annotation JSON export action is present.**
- [ ] **Step 2: Run the focused test and confirm it fails.**
- [ ] **Step 3: Implement sequence-kind-specific range metrics, plain/type/charge/hydropathy or base/GC colour modes, JSON/FASTA export, and explicit handoff links. Update method text to distinguish visual annotation from prediction.**
- [ ] **Step 4: Re-run the focused tests and confirm they pass.**

### Task 5: Integration verification

**Files:**
- Modify: `tests/app/nucleic-sequence-cryo.test.tsx` only if route-copy expectations require it.

- [ ] **Step 1: Run `npm run typecheck`, `npm run lint`, `npm run test:unit`, and `npm run build`.**
- [ ] **Step 2: Fix only failures caused by the Sequence Annotator changes and re-run each failed command.**
- [ ] **Step 3: Manually inspect the rendered protein and DNA annotator at desktop and mobile widths.**
- [ ] **Step 4: Commit the feature with `feat: rebuild sequence annotator`.**
