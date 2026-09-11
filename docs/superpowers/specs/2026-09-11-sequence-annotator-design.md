# Sequence Annotator Design

## Goal

Replace the current sequence-viewing route with a dedicated, local-first editor for
linear protein, DNA, and RNA sequences. It restores the useful legacy selection and
highlight workflow without duplicating the Protein Workbench or Plasmid Viewer.

## Product boundaries

The Sequence Annotator owns a sequence, its durable range annotations, an active
selection, property colouring, and range-level calculations. Protein Workbench remains
the place for topology/domain prediction, digestion, mass matching, and structure work.
Plasmid Viewer remains the GenBank/SnapGene and circular-map workspace.

The first version accepts raw sequence/FASTA and its own JSON document export. It offers
links to the dedicated protein and plasmid tools, passing the current sequence and
selection in their shareable route state. It does not silently upload sequences or infer
functional annotations from motif matches.

## Data model

All coordinates are 1-based and inclusive.

```ts
type SequenceKind = 'protein' | 'DNA' | 'RNA';
type AnnotationEvidence = 'user' | 'imported';
interface SequenceAnnotation {
  id: string;
  name: string;
  type: string;
  start: number;
  end: number;
  color: string;
  note: string;
  evidence: AnnotationEvidence;
}
interface Selection { start: number; end: number; }
```

Annotations must be validated against the current sequence length. A single edit is
represented by a 1-based insertion point and deleted residue count. Ranges before an
edit remain unchanged; downstream ranges shift; intersecting ranges contract or expand
to continue marking the surviving sequence. A range that is fully deleted is removed.

## Interaction

The central canvas renders fixed-size, numbered rows in a monospaced grid. Clicking a
residue/base selects it. Dragging selects a continuous range. Shift-click extends from
the selection anchor. The canvas has a range-jump control and a rows-of-10 grouping.

Annotations are displayed as labelled, clickable bands above their sequence rows. The
active selection is always an outline and therefore remains visible under every property
colour mode. Clicking an annotation selects its range; selecting a range enables the
annotation form. The table/inspector is a second access path rather than the only way to
operate annotations.

## Analysis and colouring

For proteins, the selected interval shows residue count, average and monoisotopic mass,
theoretical pI, net charge at selected pH, and epsilon-280 under the same assumptions as
Protein Workbench. Colour modes are plain, residue class, charge at pH, and hydropathy.

For DNA/RNA, the selected interval shows length, GC%, and the reverse complement.
Colour modes are plain, base class, and GC/AT(U). The generic tool does not show
protein-only measures for nucleic acid or claim that short patterns are functional
annotations.

## Persistence and interoperability

Tool state is shareable through its URL state. JSON export/import is the durable,
lossless form for annotations; FASTA export is sequence-only. The user creates or edits
annotations deliberately. Handoffs are explicit links whose destination remains the
source of any advanced analysis.

## Verification

Pure document functions receive unit tests for validation, selection normalization, and
annotation transformation across insertions/deletions. UI tests verify mouse range
selection, annotation creation/selection, protein and nucleic range analysis, and route
handoff targets. Type checking, lint, unit tests, and a production build must pass.
