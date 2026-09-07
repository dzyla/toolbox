# Gold-standard plasmid, plate-reader, and cloning workflows

**Status:** Approved design, pending implementation plan
**Date:** 2026-09-07
**Scope:** Plasmid Viewer, Plate Reader Processor, Plate Layout & Reader integration, and Cloning Suite

## 1. Purpose and quality bar

Bio-Bench must make scientifically traceable calculations and visualizations available without requiring a commercial desktop application. It must never turn incomplete input, unverified assumptions, or a heuristic into an affirmative scientific claim.

This work replaces three unreliable workflows with a shared standard:

- imports retain enough provenance to determine what was read, interpreted, and not interpreted;
- sequence coordinates, strands, and origin-crossing intervals are represented exactly;
- a result is labelled only as strongly as its evidence permits;
- a scientist can review, correct, and export every material assumption; and
- failure modes are specific, non-destructive, and actionable.

The initial target is a high-quality free, browser-local alternative for day-to-day plasmid inspection, plate analysis, and construct planning. It is not a claim of feature-for-feature parity with commercial SnapGene, nor a substitute for assay-specific validation or bench controls.

## 2. Current defects to correct

### Plasmid Viewer

- The file picker advertises `.gb` and `.dna`, but routes their bytes through a FASTA/text parser. This can discard or misread annotations.
- Feature selection falls back to a display name, so duplicate names are ambiguous.
- The 1-based inclusive `start`/`end` feature model cannot faithfully express a feature that crosses a circular origin or a multi-segment location.
- ORF scanning loses alternative starts, mishandles some circular/reverse coordinates, and does not give the selected strand a consistent sequence-track translation.

### Plate Reader

- The `plate-reader` dashboard entry loads the plate-layout view, not the dedicated reader workflow.
- Default demo data obscures the required import, mapping, QC, and analysis steps.
- The dose-response helper fabricates a hill slope and `rSquared: 0.98` rather than performing a validated fit.
- Outlier handling can alter analysis state without a review decision, and minimum/maximum plate values can be treated like assay controls.

### Cloning

- The Gibson result concatenates vector and inserts rather than constructing and validating real overlaps and joins.
- Restriction/ligation describes cohesive-end compatibility without inspecting exact cut products.
- Golden Gate is a static setup guide, but describes internal-site and overhang checks it does not perform.

## 3. Scope and non-goals

### In scope

1. Correct routing and explicit readiness/provenance states for all three tools.
2. Browser-local import of FASTA, GenBank/DDBJ, and native SnapGene `.dna` files.
3. Browser-local export of GenBank/DDBJ and FASTA, plus the app's lossless project document format.
4. A robust plasmid editor/map/sequence inspector, including manual annotations and six-frame ORF prediction.
5. A guided plate-reader workflow with trustworthy QC, fitting, and exports.
6. Sequence-aware Gibson, restriction/ligation, and Golden Gate construct planners, plus separate reaction setup advisers.
7. Fixture-driven scientific and interface verification.

### Explicit non-goals for this cycle

- Native SnapGene `.dna` export, edit-history reconstruction, chromatograms, and alignment project support.
- A server-side parser or upload of scientific data to a service.
- Automatically deciding a laboratory's assay acceptance criteria, control identity, cloning enzyme, or protocol conditions.
- Making a wet-lab success guarantee.

Native SnapGene writing is deferred because the native format is proprietary and SnapGene directs developers to contact it about native read/write integration. Its reader will be used only as an independently expected behavior reference where licensing permits. The portable GenBank/DDBJ and FASTA formats remain the interchange formats. [SnapGene file-format information](https://www.snapgene.com/features/convert-file-formats) · [Biopython SnapGene reader](https://biopython.org/docs/latest/api/Bio.SeqIO.SnapGeneIO.html)

## 4. Shared design principles

1. **No silent coercion.** Parsers report cleaned bases, skipped records, inferred topology, unknown packets, and feature-level failures. A data-bearing feature that cannot be represented blocks a fidelity-preserving import rather than disappearing.
2. **Stable scientific identity.** A selection always refers to an ID and a location, never a human-readable name.
3. **Raw data remains raw.** Analysis creates derived datasets and reviewable decisions; it does not overwrite source data.
4. **Claims carry a status.** Every predicted, fitted, validated, exploratory, blocked, and error state is visible in the UI and export.
5. **Local first.** Import, parsing, calculation, and export run in the browser. No file or sequence is sent off-device.
6. **Portable record.** The app document preserves the imported source metadata, annotations, analysis/construct plan, warnings, and result provenance; GenBank and FASTA exports state their expected lossiness.

## 5. Plasmid document and import architecture

### 5.1 Canonical document model

Replace the present display-oriented `Plasmid` object with a validated `PlasmidDocument`.

```ts
type Topology = 'circular' | 'linear';
type Strand = 1 | -1 | 0;

interface Segment { start: number; end: number } // 0-based, half-open; 0 <= start < end <= sequence.length
interface Location { segments: Segment[]; strand: Strand }
interface Annotation {
  id: string;
  name: string;
  type: string;              // preserve source type; map known types only for styling
  location: Location;        // ordered in biological 5′→3′ direction
  qualifiers: Record<string, string[]>;
  color?: string;
  source: 'imported' | 'manual' | 'detected';
  confidence?: 'annotated' | 'predicted';
}
interface ImportProvenance {
  format: 'fasta' | 'genbank' | 'snapgene';
  filename?: string;
  parserVersion: string;
  warnings: ImportWarning[];
}
interface PlasmidDocument {
  id: string; name: string; sequence: string; topology: Topology;
  annotations: Annotation[]; description?: string; provenance: ImportProvenance;
}
```

The internal coordinate convention is zero-based, half-open. UI coordinates are converted at the boundary to conventional one-based inclusive ranges. A circular feature is stored as two or more ordered segments, not as an artificial `start > end`; joined locations remain joined. The model validates all bounds, topology, base alphabet, segment order, annotation IDs, and qualifier values before rendering or calculation.

`Selection` is independent of `Annotation`: it is an ID-addressed annotation, ORF, restriction site, or explicit location. This permits a user to select an origin-crossing interval, duplicate-name annotations, and ORFs without ambiguity.

### 5.2 Import adapters

An import coordinator sniffs bytes and then dispatches to a format-specific adapter; an extension is a hint only.

| Format | First-release support | Failure/notice policy |
|---|---|---|
| FASTA/text | one sequence, header-derived name, explicit topology choice | reject invalid/empty alphabet; report removed whitespace only |
| GenBank/DDBJ | sequence, topology, source metadata, feature types, joined/complement locations, qualifiers | reject malformed records or unrepresentable locations; do not strip features |
| SnapGene `.dna` | cookie/header, DNA/topology, notes, features, segments, qualifiers, and primers when representable | strict packet-length and XML bounds checks; report unrecognized nonessential packets; block if a required sequence or a data-bearing annotation cannot be faithfully represented |

The SnapGene adapter is a small, browser-native TypeScript reader for the supported packet set. It uses `ArrayBuffer`/`DataView`, contains no remote converter, and has hard limits for file size, packet length, XML depth, feature count, and sequence length. Its expected semantics are tested against versioned fixture output produced independently from public-format readers, including Biopython's reader. It does not claim to decode unknown packet types or native history.

Imported annotations are never mixed with automatic element detection. Detection is an optional, separately labelled `predicted` layer; users can accept, edit, or discard its suggestions.

### 5.3 Editing and viewing

The viewer has synchronized Map, Sequence, Annotations, ORFs, and Restriction views over the same document.

- Map rendering projects each segment independently, places directional arrows by strand, handles origin crossings, and uses collision-aware lanes/labels.
- Sequence rendering supports click/drag/keyboard range selection, circular wrapped ranges, direct coordinate search, copy of the correct strand, and an explicit selected-frame translation.
- Annotation editing provides create, edit, delete, color, strand, segment, qualifier, and source controls with validation before save.
- The selection inspector shows original source, exact coordinates, length, sequence, reverse complement where applicable, translated CDS/ORF, and warnings.
- Origin reset, flip, and linearization are document transformations with a before/after coordinate preview and deterministic transformation of every segment and strand.

### 5.4 ORF policy

ORF prediction is an independent prediction layer, not an annotation import.

- Scan each requested frame across both strands; enumerate every valid start-to-in-frame-stop candidate up to one complete circular traversal, deduplicated by biological start/strand/frame.
- Preserve the coding location in biological direction, including wrapped and reverse-strand ORFs.
- State whether the terminal stop is included in nucleotide length and exclude it from amino-acid length; translate from the ORF's strand and frame.
- Default to NCBI translation table 1 with `ATG` start; expose named start-codon policies (standard and bacterial) and label them in results/exports. Never infer a non-standard genetic code.
- Do not report an ORF without a valid stop as complete. If an open-ended prediction mode is later added, label it as such.

## 6. Plate-reader architecture and workflow

### 6.1 Tool boundaries and route repair

`Plate Layout & Reader` remains the design workflow. `Plate Reader Processor` routes directly to its dedicated reader page; the two share data contracts but not an overloaded screen. The latter begins empty with a concise example button, never as if a demo assay were the user's completed experiment.

### 6.2 Guided workflow

The reader uses these persistent steps: **Import → Inspect → Map → Analyze → QC review → Results & export**. A step cannot be marked complete until its input requirements are met. Advanced controls remain available behind an “Advanced” disclosure inside the relevant step.

1. **Import:** accept paste, CSV/TSV, and known instrument layouts; identify detected geometry/vendor; show the parse table, missing wells, duplicate wells, ignored cells, and units before continuing.
2. **Inspect:** show raw heatmap, table, range, missingness, and plate geometry. No normalization is applied here.
3. **Map:** apply/import a layout; paint/select wells and define sample, blank, negative/positive control, standard, concentration, and replicate group. The source and count of every role remain visible.
4. **Analyze:** choose an explicitly named method (blank subtraction, percent control, inhibition, fold change, standard curve, or dose response). Plate min/max references are available only as an explicitly acknowledged exploratory baseline, never as controls.
5. **QC review:** show validation blockers, warnings, replicate CV, control separation, Z′ where appropriate, missingness, spatial patterns, and suggested outliers. Outlier candidates require an explicit include/exclude decision with a reason; raw input remains immutable.
6. **Results & export:** show only quantities justified by the selected, valid method. Exports include full provenance and cannot masquerade as a validated assay report when warnings remain.

### 6.3 Fitting and result integrity

The existing hard-coded dose-response statistics are removed. A result may be called fitted only when an actual numerical fit converges and its diagnostics are computed from the provided data.

- Reuse or extract the app's tested curve-fitting routines only after confirming their parameterization and numerical behavior; otherwise implement a bounded, tested optimizer.
- A 4PL fit reports parameter estimates, residuals, R²/calculated diagnostics, convergence state, parameter bounds, data count, and a warning that fit quality does not validate the assay.
- Insufficient concentration levels, insufficient replicates, nonpositive values for log transforms, singular fits, and failed convergence block EC50/IC50 reporting rather than yielding a plausible number.
- Standard curves expose selected model, calibration levels, residuals, interpolation/extrapolation status, and fit diagnostics. Quantified unknowns outside the calibration interval are visibly marked extrapolated.
- Grubbs and other parametric outlier suggestions state their sample-size and distribution assumptions. They never delete a value or recalculate a result until the user confirms a recorded decision.

### 6.4 Plate export record

CSV/JSON/report exports contain raw import rows, parser notices, layout, role assignments, normalization formula/inputs, excluded observations and reasons, analysis model/version/settings, QC results, fit diagnostics, timestamps, and app version. A human-readable report distinguishes `raw`, `derived`, `exploratory`, `fit failed`, and `review required` results.

## 7. Cloning architecture and validation policy

### 7.1 Separate construct design from reaction setup

The Cloning Suite has two explicit modes:

- **Construct designer:** produces an ordered, oriented set of DNA fragments, exact junction definitions, and a simulated product only after all selected method checks pass.
- **Reaction planner:** calculates concentrations, masses, volumes, and protocol guidance. It can consume a validated construct plan or be explicitly labelled as an unverified stoichiometry helper.

No raw sequence concatenation is named an assembled construct. The result state is one of `draft`, `blocked`, `sequence-validated`, or `bench-verified` (the last requires user-entered experimental evidence and is never inferred).

```ts
interface ConstructFragment { id: string; name: string; sequence: string; orientation: 'forward' | 'reverse'; role: 'vector' | 'insert'; }
interface Junction { leftFragmentId: string; rightFragmentId: string; method: 'gibson' | 'restriction-ligation' | 'golden-gate'; evidence: JunctionEvidence; }
interface ConstructPlan { fragments: ConstructFragment[]; junctions: Junction[]; product?: PlasmidDocument; status: ConstructStatus; findings: Finding[]; provenance: Provenance; }
```

The product is generated only from validated oriented fragment sequences and exact joins. Its sequence, topology, junction table, feature transfer policy, and warnings are available for review and hand-off to the plasmid viewer.

### 7.2 Gibson / HiFi assembly

- Require a linearized vector and ordered/oriented fragments, or require explicit topology/cut information before accepting a circular source vector.
- Derive each primer homology arm from the neighboring oriented fragment(s), verify the resulting terminal overlaps by exact sequence comparison, and merge each verified overlap once in the simulated product.
- Report each junction's sequence, overlap length, calculated method-labeled Tm, uniqueness/repeat warning, and any mismatch. Do not use a vendor-specific annealing-temperature claim unless it is directly supported by that vendor's published method.
- Reject a product with unmatched terminal overlap, contradictory circular closure, empty sequence, or unresolved fragment order.

The workflow implements the prerequisite to create an in-silico construct before primer design, not a wet-lab success promise. [NEB HiFi DNA Assembly guidance](https://www.neb.com/en-us/tools-and-resources/usage-guidelines/guidelines-for-using-nebuilder-hifi-dna-assembly)

### 7.3 Restriction and ligation

- Model enzyme recognition sequence, strand-specific cleavage offsets, end sequence/orientation, end type, and methylation sensitivity where verified source data exists.
- Scan actual fragments for selected recognition sites and present all candidate cut products.
- Validate the selected cuts yield the requested vector/insert ends and that cohesive ends are sequence-compatible in the intended orientation; blunt ligation is labelled non-directional unless other evidence establishes direction.
- Keep mass/volume guidance usable as a standalone helper, but label it `unverified stoichiometry` unless linked to a sequence-validated construct.

### 7.4 Golden Gate

- Require actual source fragment sequences, selected Type IIS enzyme, ordered construct, and proposed overhangs before generating a product.
- Use enzyme-specific recognition and cleavage geometry; do not assume every enzyme creates a 4-bp overhang.
- Scan every source fragment for internal chosen-enzyme sites and block or require an explicit domestication plan before assembly.
- Validate overhang length, direction, uniqueness, complementarity at each junction, duplicate/cross-reactive use, and desired product order. Explain which checks are sequence-derived and which ligation-fidelity knowledge is not modeled.
- Show a digest/ligation junction table and simulated final product. Static protocol suggestions identify their source and are never presented as universal conditions.

## 8. Error handling, accessibility, and usability

- All blocking findings have a severity, short explanation, exact affected wells/bases/junctions, and a suggested correction. Warnings do not vanish on navigation.
- Imports are transactional: a failed parse cannot replace the current document or assay. Users can download an import diagnostic without exporting sequence data by default.
- Destructive annotation/edit/reset actions offer undo for the active session and are represented in project provenance.
- Keyboard navigation, visible focus, semantic labels, contrast-safe status colors, readable sequence/map labels, and non-color status cues are acceptance requirements.
- Loading or analysis progress is visible; long operations remain cancelable when the runtime permits it.

## 9. Verification strategy and acceptance criteria

### 9.1 Core test fixtures

Create versioned fixtures and expected normalized documents for:

- FASTA and GenBank: circular/linear sequences, duplicate names, joined/complement/wrapped locations, source qualifiers, malformed records.
- SnapGene: linear and circular valid files, rich annotations, primers, unknown optional packet, malformed cookie, truncated packet, oversized packet, malformed XML, and an annotation that cannot be represented.
- ORFs: nested starts, all six frames, reverse strand, origin-spanning ORF, no-stop candidate, short sequence, alternate start policy, and translation/length boundaries.
- Plate data: valid 96/384 imports, missing/duplicate/non-numeric wells, incomplete control layouts, accepted/rejected outlier decisions, known 4PL and linear data, insufficient data, failed convergence, and extrapolated standards.
- Cloning: known valid Gibson joins, mismatched/reversed/ambiguous joins, restriction cut/end compatibility and incompatibility, Golden Gate valid products, internal sites, incorrect overhang length, duplicate overhangs, and reversed order.

### 9.2 Test layers

1. Unit tests validate coordinates, parser bounds, transformations, ORF calls, QC/fitting status, cut-end geometry, and construct assembly.
2. Fixture/contract tests assert normalized imported documents and exported provenance records.
3. Component tests assert blocked/ready states, exact labels, review decisions, selection identity, and accessible controls.
4. Browser tests begin from dashboard routes and exercise import → review → export for each workflow, including rejected inputs. The `plate-reader` card must reach the dedicated reader view.
5. Manual visual QA checks dense map labels, origin crossings, six-frame tracks, 96/384 well mapping, responsive layouts, keyboard selection, and export readability.

### 9.3 Release gates

- Typecheck, lint, full unit suite, production build, and end-to-end suite pass.
- No test permits a fit parameter, compatible end, complete ORF, or assembled construct to be emitted after a documented blocker.
- Science-panel statements, help text, dashboard blurbs, and export labels match implemented capabilities; unsupported claims are removed.
- Any new scientific algorithm has a cited source, fixed benchmark fixtures, edge-case tests, and stated assumptions before it is surfaced as ready.

## 10. Delivery sequence

### Phase A — safety and navigation

Fix the Plate Reader route; make demo data opt-in; remove fabricated dose-response output; qualify or block unsupported cloning claims; correct science/help text; add regression tests. This phase reduces immediate risk without pretending the underlying workflows are complete.

### Phase B — plasmid foundation

Introduce canonical document/location/selection types and compatibility adapters; implement true FASTA/GenBank import and export; add strict read-only SnapGene import; migrate map/sequence/annotation UI; then add reliable ORF and transform behavior. Preserve an adapter for legacy callers until all dependent tools migrate.

### Phase C — plate-reader guided analysis

Separate layout/design from reader route; introduce the six-step workflow and immutable raw-data model; add QC review decisions and provenance exports; integrate a real, diagnosed fit path; validate with reference plate fixtures.

### Phase D — sequence-aware cloning

Build the construct plan, fragment orientation, junction evidence, and product simulation; migrate Gibson; add verified restriction/ligation; add Golden Gate checks; connect validated products to the plasmid viewer; retain the reaction planner as a clearly labelled separate tool.

### Phase E — release audit

Run all release gates; visually inspect the principal workflows; review every related scientific claim and user-visible export; update documentation and add a changelog that identifies any remaining capability boundaries.

## 11. Success definition

The cycle is successful when a scientist can import an annotated GenBank or supported SnapGene file without silent loss, select/edit/copy any valid feature or circular interval, inspect an honest six-frame ORF prediction, analyze a plate through a reviewable workflow without fabricated fit results, and produce a cloning plan whose product and every asserted junction have been verified from the supplied sequences. All other outcomes are visibly marked as drafts, exploratory work, warnings, or blockers.
