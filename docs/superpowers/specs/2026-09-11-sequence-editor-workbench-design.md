# Sequence Editor Workbench Design

## Goal

Turn Sequence Annotator into a readable, expanded scientific sequence editor for protein, DNA, and RNA. Protein workflows additionally expose the local, deterministic feature scans already used by Protein Workbench. It remains a local analysis and annotation tool, not a structural-prediction service.

## User problems addressed

- A wide sequence was compressed into tiny residue stripes, while a partial final row stretched to fill the panel.
- Selection coordinates could be made with a mouse but not corrected precisely.
- Protein Workbench feature calls were absent from the editor, so discoveries could not be inspected alongside annotations.
- Controls, statistics, sequence, and annotations competed for the same narrow column.

## Design

The desktop route is a wide workspace. A compact left rail holds input, display mode, and exports. The right canvas occupies the remaining width and uses fixed-pitch residues: each selected row count has a fixed cell width, and the canvas scrolls only inside its own bounded viewport when a user explicitly chooses a density that cannot fit. The short final row retains its natural width; it never distributes its residues across the whole canvas.

Above the canvas, the range inspector contains Start and End numeric fields, a length badge, and a concise sequence preview. Editing either coordinate normalizes to the current sequence length and updates all analyses immediately. The status layout remains one line at desktop widths and stacks only at small mobile widths.

The canvas is organized into three visual layers:

1. A coordinate ruler and fixed-pitch residue rows, coloured by the chosen biochemical scheme.
2. User annotation marks, shown as subdued coloured underlines so they remain separate from selection.
3. A detected-feature lane for proteins. It lists exact tags/motifs and heuristic topology candidates from `scanFeatures`, `transmembraneCandidates`, and `signalPeptideCandidates`; clicking an item selects its exact 1-based inclusive coordinates. Each candidate retains its provenance/note so a signal peptide or transmembrane hit is never presented as confirmed biology.

## Scientific data flow

For protein sequences, detected features are recomputed from the sanitized sequence with the same local algorithms and defaults as Protein Workbench:

- exact tags, curated motifs, and large-tag identity matches: `scanFeatures(sequence, 0.9)`;
- transmembrane candidates: Kyte–Doolittle window 19, threshold 1.6;
- N-terminal hydrophobic signal-peptide candidates: legacy heuristic.

The editor displays these as transient calculated results; only user annotations are stored/exported as annotations. DNA and RNA retain their existing properties and do not show protein detection UI.

## Visual language

The editor uses a restrained instrument-panel palette: ink `#0f172a`, paper `#ffffff`, grid `#e2e8f0`, coordinate `#64748b`, selection `#312e81`, and evidence callouts in the source feature colour. The memorable element is the long-form sequence strip itself; cards are reduced to framing rather than repeated decoration. Scientific coordinates use a consistent monospace face, while labels and analysis use the application’s proportional UI face.

## Accessibility and testing

Residues remain buttons with accessible coordinates and keyboard activation. Pointer capture prevents text selection during drag selection. The new range inputs have labels and clamp invalid values through `normaliseSelection`. Tests cover direct coordinate adjustment, non-stretched final rows, feature discovery/selection, and preserved pointer interaction.
