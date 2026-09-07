# Plasmid Gold-standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a browser-local plasmid editor that accurately imports supported files, renders circular selections and ORFs, and exports traceable records.

**Architecture:** Separate canonical document, coordinate, import, ORF, transform, and rendering concerns. `View.tsx` consumes stable selection IDs and map projections; compatibility adapters support legacy callers until they migrate.

**Tech Stack:** TypeScript, Preact, Vitest, Testing Library, browser `ArrayBuffer`/`DataView`, Vite.

**Spec:** `docs/superpowers/specs/2026-09-07-scientific-workbench-gold-standard-design.md`

## Global Constraints

- Parsing, calculation, and export remain browser-local.
- Internal coordinates are 0-based half-open; display coordinates are 1-based inclusive.
- Unsupported data-bearing annotations block import; annotations must never disappear silently.
- `.dna` is read-only import; GenBank/DDBJ and FASTA are the interchange exports.
- Imported/manual/predicted annotations have distinct source labels.

---

### Task 1: Canonical document and coordinate model

**Files:** Create `src/core/plasmid/model.ts`, `src/core/plasmid/coordinates.ts`; modify `src/core/plasmid/index.ts`; test `tests/core/plasmid-model.test.ts`.

**Interfaces:** Produce `PlasmidDocument`, `Annotation`, `Location`, `Segment`, `Selection`, `validateDocument()`, `locationSequence()`, `toDisplayRange()`, and `legacyPlasmidToDocument()`.

- [ ] **Step 1: Write failing location tests.**

```ts
expect(toDisplayRange({ start: 0, end: 3 })).toEqual({ start: 1, end: 3 });
expect(locationSequence('AAACCCGGG', { strand: 1, segments: [{ start: 6, end: 9 }, { start: 0, end: 3 }] })).toBe('GGGAAA');
expect(locationSequence('AAACCCGGG', { strand: -1, segments: [{ start: 6, end: 9 }, { start: 0, end: 3 }] })).toBe('TTTCCC');
```

- [ ] **Step 2: Run `npm test -- tests/core/plasmid-model.test.ts`; confirm the absent API fails.**
- [ ] **Step 3: Implement the model.** Validate IDs, DNA alphabet, bounds, segment ordering, and qualifiers. Preserve source feature type/qualifiers; do not reduce to display colors. `locationSequence()` concatenates biological-order segments then reverse-complements strand `-1`.
- [ ] **Step 4: Run `npm test -- tests/core/plasmid-model.test.ts && npm run typecheck`; confirm pass.**
- [ ] **Step 5: Commit.**

```bash
git add src/core/plasmid/model.ts src/core/plasmid/coordinates.ts src/core/plasmid/index.ts tests/core/plasmid-model.test.ts && git commit -m "feat: add validated plasmid document model"
```

### Task 2: FASTA/GenBank import and portable export

**Files:** Create `src/core/plasmid/import.ts`, `src/core/plasmid/export.ts`; modify `src/core/plasmid/index.ts`, `src/tools/plasmid/View.tsx`; tests `tests/core/plasmid-import.test.ts`, `tests/fixtures/plasmids/*`.

**Interfaces:** Produce `sniffPlasmidFormat()`, `importPlasmid()`, `ImportResult`, `ImportWarning`, `exportGenBank()`, and `exportFasta()`.

- [ ] **Step 1: Write failing fixture tests.** Use circular GenBank with `complement(join())`, qualifiers, malformed `ORIGIN`, and FASTA topology choice.

```ts
const result = importPlasmid(genbankWithWrappedCds);
expect(result.document.annotations[0]!.location.segments).toEqual([{ start: 90, end: 100 }, { start: 0, end: 12 }]);
expect(() => importPlasmid('LOCUS bad\nORIGIN\n//')).toThrow(/sequence/i);
```

- [ ] **Step 2: Run `npm test -- tests/core/plasmid-import.test.ts`; confirm failure.**
- [ ] **Step 3: Implement byte/content sniffing and bounded format adapters.** Parse GenBank `LOCUS`, `FEATURES`, `ORIGIN`, joined/complement locations, and multiline qualifiers. Add GenBank/FASTA export; FASTA export explicitly warns it cannot carry annotations.
- [ ] **Step 4: Make file import transactional.** Use `File.arrayBuffer()`, show format/topology/feature-count/warnings, and retain the prior document on failure.
- [ ] **Step 5: Run `npm test -- tests/core/plasmid-import.test.ts tests/app/plasmid.test.tsx`; commit `feat: import and export annotated plasmids`.**

### Task 3: Strict SnapGene reader

**Files:** Create `src/core/plasmid/snapgene.ts`, `tests/fixtures/snapgene/*`; modify `src/core/plasmid/import.ts`; test `tests/core/snapgene-import.test.ts`.

**Interfaces:** Produce `parseSnapGene(bytes: ArrayBuffer, limits?: SnapGeneLimits): ImportResult`.

- [ ] **Step 1: Add fixture expectations.** Cover circular data, notes/features/primers, unknown optional packet, malformed cookie, truncated/oversized packet, malformed XML, and unrepresentable annotation.
- [ ] **Step 2: Write and run failing tests.**

```ts
expect(parseSnapGene(valid.buffer).document.topology).toBe('circular');
expect(() => parseSnapGene(truncated.buffer)).toThrow(/truncated packet/i);
expect(() => parseSnapGene(unrepresentable.buffer)).toThrow(/cannot faithfully represent/i);
```

Run: `npm test -- tests/core/snapgene-import.test.ts`

- [ ] **Step 3: Implement bounded TLV decoding.** Validate cookie, packet lengths, total bytes, XML depth, feature count, and encoding before allocation. Convert DNA/notes/features/primers only. List unknown optional packet IDs in warnings; never claim their contents survived. Do not implement `.dna` writing.
- [ ] **Step 4: Run `npm test -- tests/core/snapgene-import.test.ts tests/app/plasmid.test.tsx && npm run typecheck`; commit `feat: import supported SnapGene plasmid files`.**

### Task 4: ORFs and transformations

**Files:** Create `src/core/plasmid/orfs.ts`, `src/core/plasmid/transform.ts`; modify `src/core/plasmid/index.ts`, `src/tools/mutagenesis/View.tsx`; tests `tests/core/plasmid-orfs.test.ts`, `tests/core/plasmid-transform.test.ts`.

**Interfaces:** Produce `findOrfs(document, options)`, `setOrigin()`, `flipDocument()`, and `linearizeDocument()`.

- [ ] **Step 1: Write failing tests for nested starts, six-frame reverse prediction, wrapped ORF, no-stop candidates, and reindex/flip segment preservation.**
- [ ] **Step 2: Run `npm test -- tests/core/plasmid-orfs.test.ts tests/core/plasmid-transform.test.ts`; confirm failure.**
- [ ] **Step 3: Scan all selected frames through no more than one circular traversal per biological start.** Keep each valid start-to-stop candidate, deduplicate exact biological identity, store coding location/sequence/table/start policy, include terminal stop only in nucleotide length, and never label stop-less predictions complete. Transform every segment/strand deterministically.
- [ ] **Step 4: Migrate mutagenesis through an explicit location adapter; it must not flatten wrapped/reverse locations misleadingly.**
- [ ] **Step 5: Run `npm test -- tests/core/plasmid*.test.ts tests/core/new-tools-suite.test.ts`; commit `fix: preserve plasmid ORFs and circular coordinates`.**

### Task 5: Precise editor and synchronized rendering

**Files:** Create `src/tools/plasmid/Map.tsx`, `Sequence.tsx`, `AnnotationEditor.tsx`, `SelectionInspector.tsx`; modify `View.tsx`, `science.ts`; tests `tests/app/plasmid.test.tsx`, `tests/e2e/plasmid.spec.ts`.

**Interfaces:** Components consume `PlasmidDocument` and `Selection`; expose `onSelect()`, `onEditAnnotation()`, and `onTransform()`.

- [ ] **Step 1: Write failing UI tests for duplicate names, wrapped selection/copy, reverse ORF translation, edit/delete, and import-warning display.**
- [ ] **Step 2: Run `npm test -- tests/app/plasmid.test.tsx`; confirm failure.**
- [ ] **Step 3: Render every location segment and directional arrow in collision-aware lanes.** Use stable IDs in SVG/keyboard targets, support coordinate search and wrap selection, show source/provenance, permit validated edit/delete with session undo, and keep detected annotations opt-in.
- [ ] **Step 4: Correct science claims and run `npm test -- tests/app/plasmid.test.tsx && npm run e2e -- tests/e2e/plasmid.spec.ts && npm run build`.**
- [ ] **Step 5: Commit `feat: add precise plasmid selection and annotation editing`.**
