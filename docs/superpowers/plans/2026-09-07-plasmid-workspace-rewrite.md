# Plasmid Workspace Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the unstable demonstration plasmid viewer with a document-driven workspace whose maps, sequence view, table, inspector, and analysis layers stay synchronized without changing the visible viewport during selection.

**Architecture:** PlasmidDocument is the sole persisted biological model. A local workspace reducer owns undoable document edits and ephemeral selection independently from URL state; visual components consume immutable document-derived models and emit typed selection events. Circular, linear, and base-pair views become focused components, so selection uses pointer capture and never triggers URL serialization, analysis changes, or layout insertion while dragging.

**Tech Stack:** TypeScript, Preact, Preact Signals, Vitest, Testing Library, browser Pointer Events, SVG, IndexedDB (idb).

**Spec:** docs/superpowers/specs/2026-09-07-plasmid-workspace-design.md

## Global Constraints

- Keep PlasmidDocument coordinates zero-based and half-open; convert only at UI boundaries.
- Preserve topology, compound locations, qualifiers, colors, translations, provenance, and warnings.
- Keep selection, drag state, and hover state local; do not put them in useUrlState.
- Pointer selection captures on pointerdown and releases on pointerup or pointercancel.
- ORFs, restriction sites, and detected elements are derived layers; selecting must not mutate or recalculate them.
- Do not upload sequence data or export proprietary SnapGene files.
- Verify focused tests per task, then typecheck, lint, unit tests, build, and browser behavior.

---

### Task 1: Establish workspace and selection state

**Files:**
- Create: src/tools/plasmid/workspace.ts
- Create: src/tools/plasmid/selection.ts
- Test: tests/core/plasmid-workspace.test.ts

**Interfaces:**
- Consumes: PlasmidDocument plus addAnnotation, replaceAnnotation, deleteAnnotation.
- Produces: WorkspaceState, Selection, initialWorkspace, applyDocumentEdit, undoWorkspace, redoWorkspace, selectRange, clearSelection.

- [ ] Step 1: Write the failing reducer tests.

    it('keeps drag selection ephemeral', () => {
      const initial = initialWorkspace(document);
      const selected = selectRange(initial, { start: 5, end: 14, source: 'sequence' });
      expect(selected.document).toBe(document);
      expect(selected.history.past).toHaveLength(0);
      expect(selected.selection).toMatchObject({ start: 5, end: 14 });
    });

    it('preserves selection through document undo', () => {
      const edited = applyDocumentEdit(initialWorkspace(document), nextDocument);
      const selected = selectRange(edited, { start: 2, end: 7, source: 'map' });
      expect(undoWorkspace(selected).document).toBe(document);
      expect(undoWorkspace(selected).selection).toMatchObject({ start: 2, end: 7 });
    });

- [ ] Step 2: Run npm run test:unit -- tests/core/plasmid-workspace.test.ts. Expected: FAIL because the workspace modules do not exist.
- [ ] Step 3: Implement the immutable reducer.

    export interface Selection { start: number; end: number; source: 'map' | 'sequence' | 'table' | 'analysis'; annotationId?: string }
    export interface WorkspaceState { document: PlasmidDocument; selection?: Selection; history: { past: PlasmidDocument[]; future: PlasmidDocument[] } }
    export const selectRange = (state: WorkspaceState, selection: Selection): WorkspaceState => ({ ...state, selection });
    export const applyDocumentEdit = (state: WorkspaceState, document: PlasmidDocument): WorkspaceState => ({ ...state, document, history: { past: [...state.history.past.slice(-49), state.document], future: [] } });

  Normalize against document length; allow start > end only for circular selection.
- [ ] Step 4: Run npm run test:unit -- tests/core/plasmid-workspace.test.ts. Expected: PASS.
- [ ] Step 5: Commit.

    git add src/tools/plasmid/workspace.ts src/tools/plasmid/selection.ts tests/core/plasmid-workspace.test.ts
    git commit -m "feat: add plasmid workspace state"

### Task 2: Make analysis canonical-document based

**Files:**
- Create: src/core/plasmid/analysis.ts
- Modify: src/core/plasmid/index.ts
- Test: tests/core/plasmid-analysis.test.ts

**Interfaces:**
- Consumes: PlasmidDocument, findORFs, findRestrictionSites, Annotation.
- Produces: findDocumentOrfs(document, options), findDocumentRestrictionSites(document), orfToAnnotation(orf).

- [ ] Step 1: Write failing topology tests.

    it('returns one origin-spanning circular ORF as predicted', () => {
      const result = findDocumentOrfs(circularDocument, { minLengthAa: 2 });
      expect(result.filter(orf => orf.start > orf.end)).toHaveLength(1);
      expect(result[0]).toMatchObject({ source: 'detected', confidence: 'predicted' });
    });

    it('does not wrap linear analysis', () => {
      expect(findDocumentOrfs(linearDocument, { minLengthAa: 2 })).toEqual([]);
      expect(findDocumentRestrictionSites(linearDocument)).not.toContainEqual(expect.objectContaining({ crossesOrigin: true }));
    });

- [ ] Step 2: Run npm run test:unit -- tests/core/plasmid-analysis.test.ts. Expected: FAIL because document adapters do not exist.
- [ ] Step 3: Implement analysis.ts. Define document ORFs with zero-based selection coordinates, frame, strand, protein, completeStart, and completeStop. Deduplicate circular results by frame/strand/start/end. Only orfToAnnotation creates a predicted CDS annotation with a new ID.
- [ ] Step 4: Run npm run test:unit -- tests/core/plasmid-analysis.test.ts. Expected: PASS.
- [ ] Step 5: Commit.

    git add src/core/plasmid/analysis.ts src/core/plasmid/index.ts tests/core/plasmid-analysis.test.ts
    git commit -m "feat: add document plasmid analysis"

### Task 3: Build deterministic annotation layout primitives

**Files:**
- Create: src/tools/plasmid/map-layout.ts
- Test: tests/core/plasmid-map-layout.test.ts

**Interfaces:**
- Consumes: Annotation, length, topology.
- Produces: assignAnnotationLanes(annotations, length, topology), annotationSegments(annotation), displayLabel(annotation, lane).

- [ ] Step 1: Write failing lane and compound-location tests.

    it('assigns overlapping annotations to deterministic lanes', () => {
      const lanes = assignAnnotationLanes([a0to10, a5to15, a16to22], 30, 'linear');
      expect(lanes.get(a0to10.id)).toBe(0);
      expect(lanes.get(a5to15.id)).toBe(1);
      expect(lanes.get(a16to22.id)).toBe(0);
    });

    it('splits origin-spanning features only for drawing', () => {
      expect(annotationSegments(wrappedAnnotation)).toEqual([{ start: 24, end: 30 }, { start: 0, end: 4 }]);
    });

- [ ] Step 2: Run npm run test:unit -- tests/core/plasmid-map-layout.test.ts. Expected: FAIL.
- [ ] Step 3: Sort segments by start/end/annotation ID; assign the first non-overlapping lane and reserve every segment of a wrapped annotation in that lane. Return data only, never JSX.
- [ ] Step 4: Run npm run test:unit -- tests/core/plasmid-map-layout.test.ts. Expected: PASS.
- [ ] Step 5: Commit.

    git add src/tools/plasmid/map-layout.ts tests/core/plasmid-map-layout.test.ts
    git commit -m "feat: add plasmid annotation layout"

### Task 4: Replace map renderers

**Files:**
- Create: src/tools/plasmid/CircularMap.tsx
- Create: src/tools/plasmid/LinearMap.tsx
- Modify: tests/app/plasmid.test.tsx

**Interfaces:**
- Consumes: PlasmidDocument, derived analysis, Selection, map layout, onSelect(selection).
- Produces: accessible CircularMap and LinearMap SVG components.

- [ ] Step 1: Add failing interaction tests.

    fireEvent.click(screen.getByRole('button', { name: /AmpR.*1.*861/i }));
    expect(screen.getByTestId('plasmid-selection')).toHaveTextContent('AmpR');
    expect(screen.getByTestId('plasmid-selection')).toHaveTextContent('1–861');
    fireEvent.click(screen.getByRole('tab', { name: /Linear map/i }));
    expect(screen.getByRole('img', { name: /Linear map of pUC19/i })).toBeTruthy();

- [ ] Step 2: Run npm run test:unit -- tests/app/plasmid.test.tsx. Expected: FAIL.
- [ ] Step 3: Render all canonical annotation segments, one synchronized selection, packed directional lanes, keyboard focus, and textual coordinates. Place persistent selection status beside the canvas, never above the scrolling sequence view. Use an overlay switch for restriction and ORF layers. Do not call documentToLegacyPlasmid.
- [ ] Step 4: Run npm run test:unit -- tests/app/plasmid.test.tsx. Expected: PASS for map-mode selection.
- [ ] Step 5: Commit.

    git add src/tools/plasmid/CircularMap.tsx src/tools/plasmid/LinearMap.tsx tests/app/plasmid.test.tsx
    git commit -m "feat: replace plasmid map renderers"

### Task 5: Implement the stable annotated sequence viewport

**Files:**
- Create: src/tools/plasmid/SequenceView.tsx
- Modify: tests/app/plasmid.test.tsx

**Interfaces:**
- Consumes: PlasmidDocument, Selection, sequence display preferences, onSelect(selection).
- Produces: SequenceView with internal scrolling, coordinate search, both strands, highlights, and pointer selection.

- [ ] Step 1: Add the failing drag regression.

    const viewport = screen.getByTestId('plasmid-sequence-viewport');
    Object.defineProperty(viewport, 'scrollTop', { value: 180, writable: true });
    fireEvent.pointerDown(screen.getByLabelText('Base 1'), { pointerId: 4, button: 0 });
    fireEvent.pointerEnter(screen.getByLabelText('Base 12'), { pointerId: 4 });
    fireEvent.pointerUp(viewport, { pointerId: 4 });
    expect(screen.getByTestId('plasmid-selection')).toHaveTextContent('1–12');
    expect(viewport.scrollTop).toBe(180);
    expect(screen.getByText(/Detected Open Reading Frames/)).toHaveTextContent(originalOrfCount.toString());

- [ ] Step 2: Run npm run test:unit -- tests/app/plasmid.test.tsx. Expected: FAIL because current mouse handlers and conditional summary shift layout.
- [ ] Step 3: Store drag anchor and active pointer ID in refs. On pointerdown call currentTarget.setPointerCapture(pointerId); on matching pointerenter emit a normalized local range; on pointerup/pointercancel release capture and clear refs. Never use mouseleave to finish a selection. Memoize analysis only from document and filters.
- [ ] Step 4: Add a labeled coordinate input, internal scroll-to-coordinate behavior, translation display controls, and Base {coordinate} aria labels. Highlight annotations independently from selection.
- [ ] Step 5: Run npm run test:unit -- tests/app/plasmid.test.tsx. Expected: PASS, including unchanged scroll and ORF count.
- [ ] Step 6: Commit.

    git add src/tools/plasmid/SequenceView.tsx tests/app/plasmid.test.tsx
    git commit -m "feat: add stable plasmid sequence selection"

### Task 6: Build inspector, table, and analysis panels

**Files:**
- Create: src/tools/plasmid/AnnotationInspector.tsx
- Create: src/tools/plasmid/AnnotationTable.tsx
- Create: src/tools/plasmid/AnalysisPanel.tsx
- Modify: tests/app/plasmid.test.tsx

**Interfaces:**
- Consumes: workspace actions, Annotation, derived ORFs/sites, clipboard callbacks.
- Produces: annotation CRUD, filterable table, and ORF promotion.

- [ ] Step 1: Write failing workflow tests.

    fireEvent.click(screen.getByRole('button', { name: /Create annotation from selection/i }));
    fireEvent.input(screen.getByLabelText('Annotation name'), { target: { value: 'insert' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    expect(screen.getByRole('button', { name: /insert.*1.*12/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Promote ORF 1 to CDS/i }));
    expect(screen.getByRole('row', { name: /Predicted CDS/i })).toBeTruthy();

- [ ] Step 2: Run npm run test:unit -- tests/app/plasmid.test.tsx. Expected: FAIL.
- [ ] Step 3: Edit annotations through immutable document commands and applyDocumentEdit. Inspector edits name, type, color, strand, segments, qualifiers; validates before save. Table filtering/sorting remains local presentation state. Copy DNA/protein uses canonical locations with a textarea fallback when clipboard is unavailable.
- [ ] Step 4: Show predicted ORFs/sites separately; promotion adds a new CDS annotation and never changes imported annotation data. Analysis selection only calls selectRange.
- [ ] Step 5: Run npm run test:unit -- tests/app/plasmid.test.tsx. Expected: PASS.
- [ ] Step 6: Commit.

    git add src/tools/plasmid/AnnotationInspector.tsx src/tools/plasmid/AnnotationTable.tsx src/tools/plasmid/AnalysisPanel.tsx tests/app/plasmid.test.tsx
    git commit -m "feat: add plasmid workspace panels"

### Task 7: Compose the workspace and migrate persistence

**Files:**
- Create: src/tools/plasmid/ImportToolbar.tsx
- Modify: src/tools/plasmid/View.tsx
- Modify: tests/app/plasmid.test.tsx

**Interfaces:**
- Consumes: import/export APIs, projects, workspace reducer, visual components.
- Produces: composition-only PlasmidView and document toolbar.

- [ ] Step 1: Write failing integration test.

    fireEvent.input(screen.getByLabelText(/Paste FASTA, GenBank, or raw DNA/i), { target: { value: annotatedGenBank } });
    fireEvent.click(screen.getByRole('button', { name: 'Open sequence' }));
    fireEvent.click(screen.getByRole('tab', { name: /Sequence/i }));
    fireEvent.click(screen.getByLabelText('Base 2'));
    fireEvent.click(screen.getByRole('button', { name: /Create annotation from selection/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save locally/i }));
    expect(await screen.findByText(/Saved .* locally/i)).toBeTruthy();

- [ ] Step 2: Run npm run test:unit -- tests/app/plasmid.test.tsx. Expected: FAIL.
- [ ] Step 3: Make View.tsx load PlasmidDocument, initialize workspace, derive analysis from workspace.document, and route typed child actions. Remove useUrlState from plasmid; summary sharing must omit sequence/selection. Persist schemaVersion 2 plus document; migrate the existing raw document project state. Export directly from workspace.document.
- [ ] Step 4: Implement ImportToolbar open paste/file, save, undo/redo, GenBank/FASTA/SVG export, metadata/warnings, and dismissible errors. Accept .dna,.gb,.gbk,.fasta,.fa,.seq,.txt.
- [ ] Step 5: Run npm run test:unit -- tests/app/plasmid.test.tsx. Expected: PASS.
- [ ] Step 6: Commit.

    git add src/tools/plasmid/ImportToolbar.tsx src/tools/plasmid/View.tsx tests/app/plasmid.test.tsx
    git commit -m "feat: rewrite plasmid workspace"

### Task 8: Verify browser workflow and document it

**Files:**
- Modify: tests/e2e/smoke.spec.ts
- Modify: README.md

- [ ] Step 1: Add a Playwright test that opens the plasmid workspace, changes to Sequence, sets its internal viewport scrollTop to 160, selects Base 1, asserts selection text, and asserts scrollTop remains 160.
- [ ] Step 2: Run npm run e2e -- --grep "plasmid workspace". Expected: PASS.
- [ ] Step 3: Document supported import formats, local-only storage, no SnapGene export, selection behavior, predicted versus imported layers, and GenBank/FASTA/SVG exports.
- [ ] Step 4: Run npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run e2e -- --grep "plasmid workspace". Expected: every command exits 0.
- [ ] Step 5: Commit.

    git add tests/e2e/smoke.spec.ts README.md
    git commit -m "test: verify plasmid workspace workflow"

## Plan self-review

- Spec coverage: Tasks 1 and 7 cover canonical state, history, persistence, import, and export; Tasks 2 and 6 cover analysis; Tasks 3 through 5 cover synchronized maps, sequence, and the reported drag regression; Task 8 verifies and documents the user path.
- Placeholder scan: every task supplies concrete files, test cases, commands, and behavior.
- Type consistency: visual components consume PlasmidDocument plus WorkspaceState/Selection, and no rendering task depends on the legacy plasmid adapter.

