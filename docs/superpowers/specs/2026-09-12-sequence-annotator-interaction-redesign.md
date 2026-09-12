# Sequence Annotator Interaction Redesign

## Goal

Make the Sequence Annotator an explicit, selection-led workspace: users choose whether a sequence is DNA, RNA, or protein; calculations and optional analysis layers follow that choice; and selecting a range or a feature never causes the layout to jump.

## Scope and boundaries

The annotator remains a local linear editor. It must not call external prediction services. Protein topology/tag/motif scanning is optional contextual evidence, never a durable annotation and never a required part of the default view. RNA secondary structure is a quick local, non-pseudoknotted base-pair sketch, not a thermodynamic folding claim.

## Sequence type and input

The UI presents an explicit DNA / RNA / Protein segmented control next to the input. Selection is stored in route state and drives cleaning, canvas colouring, controls, analysis, export metadata, and handoffs. Automatic detection becomes a compact suggestion only:

- Inputs containing only unambiguous A/C/G/T bases show “Possibly DNA”; A/C/G/U show “Possibly RNA”.
- Protein-compatible residues that rule out a nucleic input show “Likely protein”.
- Ambiguous IUPAC nucleic codes or mixed T/U report why automatic identification is uncertain.
- The suggestion does not change the selected type or start analysis.

Input cleaning retains valid IUPAC nucleic symbols for DNA/RNA and validates protein residues for protein. A type change preserves the raw text but clears annotations and selection, because their biological interpretation changed.

## Stable selection and analysis

The selection inspector is a fixed panel immediately above the sequence canvas. Its start and end inputs apply each valid edit immediately, normalising a temporarily reversed range rather than requiring a valid intermediate range. Thus changing either endpoint visibly updates the canvas window and all metrics without blur/enter choreography.

The inspector hosts dynamic metrics, so there is one stable information location:

- Protein: length, average and monoisotopic mass, pI, net charge at chosen pH, extinction coefficient.
- DNA/RNA: length, GC%, reverse complement, and a clearly labelled quick oligo Tm when the selected bases are unambiguous. Tm retains the formula’s range warning.
- RNA with the RNA structure layer enabled: a local dot-bracket pairing summary and a compact secondary-structure arc diagram.

No selection produces a quiet prompt in the same panel; it does not add or remove a lower results section.

## Optional layers and features

The workspace adds an “Analysis layers” disclosure with independent switches. Colouring remains always available. Protein feature candidates, RNA structure, and user annotations each have their own switch. All optional layers are off by default except user annotations once the user has created one. Disabled layers produce neither tracks nor result lists.

Protein feature discovery runs only when its switch is enabled. Instead of a full lower-page list, its visible hits are compact interactive chips in the fixed inspector. Selecting a chip selects the exact sequence interval and populates a persistent feature-detail card within the inspector. A chip selection never scrolls or moves the editor. Canvas marks are visible only when the layer is enabled.

User annotations remain authored data and keep their existing editor. Selecting one similarly updates selection and the persistent detail card.

## RNA secondary structure

For RNA, an enabled quick-structure layer folds at most the first 400 selected nucleotides using a deterministic maximum-base-pair dynamic program (AU, CG, GU; minimum hairpin loop of three bases). Longer selections receive an explicit “select up to 400 nt” message. The view shows dot-bracket notation, pair count, and a small SVG arc map. It is a visual heuristic only and makes no free-energy or biological-structure claim.

## Verification

Tests cover explicit type selection and non-mutating detection suggestions; immediate start/end selection updates; dynamic protein and nucleic metrics including Tm; off-by-default optional layers and compact feature selection/detail behavior; and RNA folding/arc rendering with its length guard. Existing canvas drag and annotation workflows remain covered. Typecheck, lint, the full unit suite, build, and desktop/mobile browser inspection are required.
