# Plasmid Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first editable plasmid workspace that accurately imports annotated GenBank and SnapGene DNA files and presents synchronized map, sequence, analysis, and export workflows.

**Architecture:** `PlasmidDocument` becomes the single source of truth; UI-specific features are derived from rich annotations only at render boundaries. Dedicated import, editing, serialization, analysis, persistence, and map-layout modules keep binary parsing and coordinate transforms out of the Preact view.

**Tech Stack:** TypeScript, Preact, Vitest, `idb`, browser File/Clipboard APIs, SVG and existing export utilities.

**Spec:** `docs/superpowers/specs/2026-09-07-plasmid-workspace-design.md`

## Global Constraints

- Preserve zero-based, half-open `Location` segments and their biological order internally.
- Support `.dna`, `.gb`, `.gbk`, `.fasta`, `.fa`, `.seq`, and plain DNA in browser-only workflows.
- Never upload sequence data or write a proprietary SnapGene `.dna` file.
- Validate byte sizes, parser bounds, document shape, and coordinates before rendering.
- Label automatic feature calls and ORFs as predicted; do not overwrite imported annotations.
- Preserve imported qualifiers, colors, topology, and compound locations through local persistence and GenBank export.
- Verify typecheck, lint, unit tests, build, and focused UI/browser behavior before completion.

---

### Task 1: Strengthen the canonical plasmid document and document commands

**Files:**
- Modify: `src/core/plasmid/model.ts`, `src/core/plasmid/coordinates.ts`, `src/core/plasmid/legacy.ts`
- Create: `src/core/plasmid/document.ts`
- Test: `tests/core/plasmid-model.test.ts`, `tests/core/plasmid-document.test.ts`

**Interfaces:**
- Produces `createDocument`, `replaceAnnotation`, `deleteAnnotation`, `createAnnotation`, `documentToLegacyPlasmid`, `locationSequence`, and `displayRange` helpers.
- Consumes `PlasmidDocument`, `Annotation`, `Location`, and validation results.

- [ ] Write failing tests for multi-segment plus/minus locations, annotation replacement/deletion, invalid coordinates, and circular display ranges.
- [ ] Run `npm run test:unit -- tests/core/plasmid-model.test.ts tests/core/plasmid-document.test.ts` and confirm failures identify missing commands.
- [ ] Implement immutable document commands, unique annotation IDs, qualifier normalization, and range conversion without changing imported location data.
- [ ] Run the focused tests and confirm all pass.
- [ ] Commit `feat: add editable plasmid document commands`.

### Task 2: Complete robust text import and GenBank export

**Files:**
- Modify: `src/core/plasmid/import.ts`, `src/core/plasmid/model.ts`
- Create: `src/core/plasmid/genbank.ts`, `src/core/plasmid/export.ts`
- Test: `tests/core/plasmid-import.test.ts`, `tests/core/plasmid-export.test.ts`

**Interfaces:**
- Produces `importPlasmidText`, `parseGenBank`, `exportGenBank`, and `exportFasta`.
- Consumes canonical document types and location parser/serializer.

- [ ] Add failing fixtures for nested complement/join/order locations, quoted multiline qualifiers, label/gene/color/translation preservation, malformed records, and export/import round-trips.
- [ ] Run `npm run test:unit -- tests/core/plasmid-import.test.ts tests/core/plasmid-export.test.ts` and confirm the new behavior fails.
- [ ] Parse every feature/qualifier before validation; serialize exact representable locations and qualifiers to GenBank with a valid ORIGIN block and wrap sequence lines at 60 bases.
- [ ] Run focused tests and confirm imports retain qualified annotations and exports re-import equivalently.
- [ ] Commit `feat: preserve annotated GenBank documents`.

### Task 3: Decode native SnapGene sequence, notes, features, and primer packets safely

**Files:**
- Modify: `src/core/plasmid/snapgene.ts`, `src/core/plasmid/import.ts`
- Test: `tests/core/snapgene-import.test.ts`, `tests/core/plasmid-import.test.ts`

**Interfaces:**
- Produces `parseSnapGene(bytes: ArrayBuffer): ImportResult` and `importPlasmidFile(file: Blob): Promise<ImportResult>`.
- Consumes packet framing, canonical annotations, XML parsing, and document validation.

- [ ] Add failing byte-level fixtures for valid cookie/DNA/feature packets, direction/color/segments/attributes, notes, unknown packets, malformed XML, oversized and truncated payloads.
- [ ] Run `npm run test:unit -- tests/core/snapgene-import.test.ts` and verify only the sequence-only parser passes initially.
- [ ] Implement a bounded TLV iterator; parse type `0x00`, notes `0x06`, features `0x0A`, and supported primer `0x05` XML into canonical annotations/qualifiers; attach recoverable warnings for unknown or malformed optional packets.
- [ ] Detect native magic before text decoding and reject byte/text inputs with clear errors.
- [ ] Run focused parser tests and commit `feat: import annotated SnapGene DNA files`.

### Task 4: Make analysis topology-aware and render-independent

**Files:**
- Modify: `src/core/plasmid/index.ts`
- Create: `src/core/plasmid/analysis.ts`
- Test: `tests/core/plasmid.test.ts`, `tests/core/plasmid-analysis.test.ts`

**Interfaces:**
- Produces `findDocumentOrfs(document, options)`, `findDocumentRestrictionSites(document)`, and `orfToAnnotation(orf)`.
- Consumes canonical documents and existing translation/restriction logic.

- [ ] Add failing tests for circular origin-spanning ORFs (one result only), linear no-wrap behavior, forward/reverse translations, predicted metadata, and restriction sites crossing circular origin.
- [ ] Run focused analysis tests and confirm current legacy functions fail the document cases.
- [ ] Move/supplement sequence calculations with canonical-document adapters; explicitly retain complete/incomplete status and predicted source/confidence on ORF annotations.
- [ ] Run focused tests and commit `feat: add topology-aware plasmid analysis`.

### Task 5: Persist plasmid workspace projects and maintain undo/redo history

**Files:**
- Modify: `src/lib/projects.ts`, `src/tools/registry.ts`
- Create: `src/tools/plasmid/workspace.ts`
- Test: `tests/lib/projects.test.ts`, `tests/core/plasmid-workspace.test.ts`, `tests/app/tool-registry.test.ts`

**Interfaces:**
- Produces versioned `PlasmidWorkspaceState`, `restoreWorkspace`, `applyDocumentEdit`, `undoWorkspace`, and `redoWorkspace`.
- Consumes `saveProject`, `getProject`, document commands, and `ToolProps.projectId`.

- [ ] Add failing tests for a project save/load that preserves annotations and provenance, schema migration from legacy plasmid state, history boundary behavior, and the registry project flag.
- [ ] Run focused tests and confirm project restore/history APIs do not yet exist.
- [ ] Implement a JSON-safe versioned state with bounded undo/redo snapshots; mark the plasmid registry entry as project-capable.
- [ ] Run focused tests and commit `feat: persist editable plasmid workspaces`.

### Task 6: Replace the viewer state with document-driven workspace controls

**Files:**
- Modify: `src/tools/plasmid/View.tsx`, `src/tools/plasmid/science.ts`
- Create: `src/tools/plasmid/ImportToolbar.tsx`, `src/tools/plasmid/AnnotationInspector.tsx`, `src/tools/plasmid/SelectionSummary.tsx`
- Test: `tests/app/plasmid.test.tsx`

**Interfaces:**
- Consumes `PlasmidWorkspaceState`, `importPlasmidFile`, document commands, and selection locations.
- Produces accessible Open, Save, Duplicate, Undo, Redo, Export, annotation CRUD, search/goto, and copy controls.

- [ ] Add failing UI tests that upload GenBank/SnapGene fixture data, edit and delete annotations, create an annotation from selection, undo/redo the edit, and assert the selected sequence copy text.
- [ ] Run `npm run test:unit -- tests/app/plasmid.test.tsx` and confirm controls/data flow are absent.
- [ ] Replace legacy local plasmid state with workspace state; connect file input bytes, project save/load, graceful import errors/warnings, clipboard fallback, and inspector form validation.
- [ ] Run focused UI tests and commit `feat: add editable plasmid workspace controls`.

### Task 7: Build synchronized circular and linear annotation views

**Files:**
- Modify: `src/tools/plasmid/View.tsx`
- Create: `src/tools/plasmid/map-layout.ts`, `src/tools/plasmid/CircularMap.tsx`, `src/tools/plasmid/LinearMap.tsx`
- Test: `tests/core/plasmid-map-layout.test.ts`, `tests/app/plasmid.test.tsx`

**Interfaces:**
- Produces `assignAnnotationLanes(annotations, length)`, `CircularMap`, and `LinearMap` accepting canonical annotations and an `onSelect(location, annotationId?)` callback.
- Consumes shared selection state and display-range helpers.

- [ ] Add failing lane-layout tests for overlapping, wrapping, and multi-segment annotations; add UI tests for selection synchronization and accessible feature buttons.
- [ ] Run the focused tests to establish the current maps use legacy flat ranges.
- [ ] Render packed directional arcs/bars and individual compound segments while retaining one selected annotation; add label collision fallback, restriction/ORF overlays, SVG and PNG export.
- [ ] Run focused tests and commit `feat: synchronize plasmid map views`.

### Task 8: Build an annotated base-pair view and analysis/table panels

**Files:**
- Modify: `src/tools/plasmid/View.tsx`
- Create: `src/tools/plasmid/SequenceView.tsx`, `src/tools/plasmid/AnnotationTable.tsx`, `src/tools/plasmid/AnalysisPanel.tsx`
- Test: `tests/app/plasmid.test.tsx`, `tests/core/plasmid-analysis.test.ts`

**Interfaces:**
- Produces sequence selection, translation-frame selector, coordinate search, sortable annotation table, and ORF promotion callback.
- Consumes the same workspace selection and document analysis adapters.

- [ ] Add failing UI tests for base-pair annotation highlighting, drag selection, coordinate goto, six-frame switching, table filtering, ORF copy, and “promote to CDS” behavior.
- [ ] Run focused tests and confirm those workflows are unavailable.
- [ ] Implement virtual-safe chunked sequence rendering, both strand labels, selection normalization across origin, keyboard reachable features, sortable/filterable annotations, and predicted analysis layers.
- [ ] Run focused tests and commit `feat: add annotated sequence and analysis panels`.

### Task 9: Integrate, protect regressions, and verify the user workflow

**Files:**
- Modify: `tests/app/plasmid.test.tsx`, `tests/e2e/smoke.spec.ts`, `README.md`
- Test: `tests/core/plasmid-*.test.ts`, `tests/core/snapgene-import.test.ts`, `tests/app/plasmid.test.tsx`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Validates the complete file open → inspect/edit → save/restore → export workflow.

- [ ] Add one user-path browser test with an annotated fixture that edits an annotation, switches all views, promotes an ORF, saves/restores, and downloads GenBank/SVG.
- [ ] Run the targeted unit/UI/e2e suite to establish expected failures before integration updates.
- [ ] Update user-facing help/README and science assumptions to describe local-first persistence, import formats, predicted annotations, and non-proprietary export limits.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build`, and `npm run e2e -- --grep plasmid` (or the focused Playwright test) and resolve failures.
- [ ] Commit `feat: deliver editable plasmid workspace`.
