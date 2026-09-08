# Plasmid Workspace Design

## Goal

Replace the current demonstration-style plasmid viewer with a dependable, local-first plasmid workspace: users can import, inspect, edit, analyze, save, and export annotated DNA constructs without losing biological coordinates or annotation metadata.

## Product boundaries

The workspace supports DNA sequence documents only. It imports FASTA/plain sequence, GenBank (`.gb`, `.gbk`), and native SnapGene DNA (`.dna`) files. It does not write proprietary SnapGene files. The browser never uploads sequences; saved documents remain in IndexedDB and can be exported as GenBank, FASTA, or SVG/PNG maps.

## Canonical document and coordinate rules

`PlasmidDocument` is the sole editable source of truth. Coordinates are zero-based, half-open `Location` segments in biological 5′→3′ order. A `Location` carries strand and one or more segments so GenBank `join`, `complement(join())`, origin-spanning features, and SnapGene segmented features are preserved exactly. The UI may derive legacy one-based inclusive ranges for display, but must not use them for mutations or persistence.

The document stores sequence, topology, annotations, description, import provenance and import warnings. Annotations hold type, name, source, confidence, optional color, location, and every imported qualifier. Document-edit commands create immutable next documents and return enough information for the UI undo/redo stack.

## Import and export

The file loader chooses a parser from file bytes: valid SnapGene cookie packets use the native parser; recognized GenBank records use the GenBank parser; other text is parsed as FASTA/plain DNA. The loader reports actionable errors and warnings.

GenBank import accepts nested `complement`, `join`, and order-style compound locations, split/multiline qualifiers, quoted qualifier continuations, labels, genes, colors and translations. It rejects malformed or out-of-bounds locations rather than silently changing them.

SnapGene import verifies bounded TLV packet framing, imports DNA topology, notes, feature XML (directions, segments, colors and attributes), and supported primer metadata. Unknown packets do not cause failure and appear as provenance warnings. Invalid XML or unsupported malformed feature records are warnings only when the valid sequence can still be imported.

GenBank export emits a standards-compatible sequence record and all representable annotations/qualifiers. FASTA export emits the selected document sequence. Map export remains a selectable SVG; PNG is produced from the SVG client-side.

## Workspace behavior

The page has a document toolbar (open, save locally, duplicate, undo, redo, export) and document summary. An annotation inspector supports create, rename, type/color/strand edits, location segment edits, qualifier edits, delete, and copy DNA/protein. Sequence selection creates a new annotation or a direct copy target. Edits update every view instantly and are fully undoable in the active session.

The circular map uses packed lanes, directional feature arcs, resilient labels, selection/hover affordances and restriction/ORF overlays. The linear map uses non-overlapping lanes and supports origin-spanning annotations. The base-pair view displays annotation highlighting, both strands, configurable translation frames, search/goto coordinates, and robust drag range selection. The annotation table is sortable/filterable and opens the same inspector. Every map/table/ORF/sequence click selects the same location and gives precise copy DNA, reverse-complement DNA, and translated protein actions.

## Analysis

Six-frame ORF analysis uses the document topology and never duplicates a circular ORF. Its findings are explicitly predicted, distinguish start/stop completeness, and can be promoted to editable CDS annotations. Restriction sites use the same topology and origin convention. Imported annotations are never overwritten by automatic element detection; detected elements and predicted ORFs remain separately labeled, optionally visible layers.

## Persistence, safety, and accessibility

Documents are persisted in the existing local project storage and schema-versioned for future migrations. File parsing enforces byte limits and document validation before rendering. Clipboard writes have a fallback for browsers without `navigator.clipboard`. Maps and controls provide keyboard-accessible buttons, names, focus states and textual coordinates; no interaction requires a hover-only affordance.

## Verification

Unit tests cover import detection, GenBank compound locations/qualifiers, SnapGene packet and feature parsing, document edits/history, circular ORFs, and export round-trips. UI tests cover file open, editable annotation workflow, synchronized selection/copy, all views, and project restore. Typecheck, lint, unit tests, build, and a focused browser smoke test must pass.
