# Sequence Editor Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Sequence Annotator visual workspace so long protein selections are readable, precisely editable, and show Protein Workbench feature calls.

**Architecture:** Keep the existing URL-backed `SequenceView` state and annotation model. Add a small feature adapter for Protein Workbench detection, expose range editing in a dedicated inspector, and reshape the canvas into fixed-size residue cells with a bounded viewport and track lanes.

**Tech Stack:** Preact, TypeScript, Tailwind CSS v4, Vitest, existing `@/core/protein/features` algorithms.

**Spec:** `docs/superpowers/specs/2026-09-11-sequence-editor-workbench-design.md`

## Global Constraints

- Protein detected features are calculated only and must not be exported as user annotations.
- Coordinates are 1-based inclusive at the UI boundary.
- Signal-peptide and transmembrane results must retain candidate/heuristic language.
- Preserve pointer, keyboard, and mobile interaction support.

---

### Task 1: Add Protein Workbench feature adapter

**Files:**
- Create: `src/tools/sequence/features.ts`
- Modify: `tests/core/sequence-annotator.test.ts`

**Interfaces:**
- Produces: `detectSequenceFeatures(sequence: string, kind: SequenceKind): ProteinFeature[]`
- Consumes: `scanFeatures`, `transmembraneCandidates`, `signalPeptideCandidates`, `mergeFeatures` from `@/core/protein/features`

- [ ] **Step 1: Write the failing test**

```ts
expect(detectSequenceFeatures('AAHHHHHHGG', 'protein')).toEqual(expect.arrayContaining([
  expect.objectContaining({ name: 'His-Tag (6x)', start: 3, end: 8 }),
]));
expect(detectSequenceFeatures('ACGT', 'dna')).toEqual([]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/core/sequence-annotator.test.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
export function detectSequenceFeatures(sequence: string, kind: SequenceKind): ProteinFeature[] {
  return kind === 'protein' ? mergeFeatures([
    ...scanFeatures(sequence), ...transmembraneCandidates(sequence), ...signalPeptideCandidates(sequence),
  ]) : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/core/sequence-annotator.test.ts`

### Task 2: Add exact selection range editor

**Files:**
- Create: `src/tools/sequence/RangeInspector.tsx`
- Modify: `src/tools/sequence/View.tsx`
- Modify: `tests/app/sequence-annotator.test.tsx`

**Interfaces:**
- Produces: `RangeInspector` with `selection`, `length`, `kind`, and `onSelectionChange` props.
- Consumes: 1-based inclusive `Selection`.

- [ ] **Step 1: Write the failing test**

```tsx
fireEvent.input(screen.getByLabelText('Selection start'), { target: { value: '101' } });
fireEvent.input(screen.getByLabelText('Selection end'), { target: { value: '199' } });
expect(screen.getByText('Selection: 101–199')).toBeTruthy();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/app/sequence-annotator.test.tsx`

- [ ] **Step 3: Implement coordinate normalization and compact range inspector**

Use `normaliseSelection`, preserve the selection preview, and label the count as aa or nt.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/app/sequence-annotator.test.tsx`

### Task 3: Rebuild sequence canvas and detected-feature lane

**Files:**
- Modify: `src/tools/sequence/SequenceCanvas.tsx`
- Create: `src/tools/sequence/DetectedFeatures.tsx`
- Modify: `src/tools/sequence/View.tsx`
- Modify: `tests/app/sequence-annotator.test.tsx`

**Interfaces:**
- `SequenceCanvas` consumes `ProteinFeature[]` and invokes `onFeatureSelect(feature)`.
- `DetectedFeatures` consumes the calculated feature list and invokes `onSelect(start, end)`.

- [ ] **Step 1: Write failing tests**

```tsx
expect(screen.getByText('Detected protein features')).toBeTruthy();
fireEvent.click(screen.getByRole('button', { name: /His-Tag \(6x\).*3–8/ }));
expect(screen.getByText('Selection: 3–8')).toBeTruthy();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/app/sequence-annotator.test.tsx`

- [ ] **Step 3: Implement fixed-pitch rows and feature lane**

Replace proportional grid tracks with fixed-width residue cells. Give the sequence surface an intentional scroll viewport for density choices that exceed the available space; render all partial final rows at natural width. Add source-coloured detected feature chips/lanes and evidence text.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/app/sequence-annotator.test.tsx`

### Task 4: Expand desktop workspace and verify

**Files:**
- Modify: `src/tools/sequence/View.tsx`
- Modify: `tests/app/sequence-annotator.test.tsx`

- [ ] **Step 1: Write a failing layout regression test**

```tsx
expect(screen.getByLabelText('Sequence workbench').className).toContain('xl:col-span-');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/app/sequence-annotator.test.tsx`

- [ ] **Step 3: Implement expanded workbench layout**

Use `ToolLayout` wide mode and a sequence workbench that spans the results surface; keep summary analytics and annotation form below it.

- [ ] **Step 4: Run complete verification**

Run: `npm run test:unit && npm run typecheck && npm run lint && npm run build`

