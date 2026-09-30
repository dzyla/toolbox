# Cloning hub: construct views, placed PCR, split overhangs, mutation views

Date: 2026-09-29 · Status: draft for review

## Goal

Make the cloning hub answer "what came from where, and where do the primers go?" without the user having to know the vendor tools.

- The finished construct shows which vector or insert every stretch of sequence came from.
- A circular vector or insert made by PCR can be opened at a place the user chooses, and the primers are drawn on the sequence at their real positions.
- The homology overhang can be shared between the two primer pairs at a junction, as in NEBuilder, and not only sit on one pair.
- Amino-acid changes show residue numbering and a pairwise alignment for every mutation.
- Replace, delete and insert edits show the sequence before and after, and a graphic of the edit.

## Scope

In scope: the NEBuilder / Gibson and In-Fusion panels, the product preview, and the amino-acid / sequence-edit (`sdm`) panel. Out of scope: the ligation and Golden Gate panels, and any change to vendor-tested defaults.

**Constraint:** with the new options left at their defaults, every vendor fixture output (primer sequences, names, Tm, amounts) is unchanged. The new options are additive.

## Shared pieces

### Source colors (`src/tools/cloning/hub/source-colors.ts`)
A fixed palette maps each source (by its order in the workspace) to a color and a number. The same source has the same color in the sequence cards, the primer maps, the product viewer and the legend. Color is never the only cue: each source also has its number and name in labels.

### Construct diagram (`src/tools/cloning/hub/ConstructDiagram.tsx`)
One SVG component used by the primer maps and the edit graphic.

Input: a `length`, a `topology` (`linear` or `circular`), `segments` (start, end, label, color), `primers` (position, strand, anneal span, tail length and tail color, name) and optional `selection` and `onPick` (click a position, drag a region).

It draws a line or a ring, the segments as colored bands, each primer as an arrow (solid for the anneal part, hatched in the neighbor's color for the tail), and labels. It is keyboard operable, and every mark has a text label and an accessible name.

## 1. Source coloring in the final viewer

- `nebuilderProduct` and `infusionProduct` (`src/core/cloning/products.ts`) also return `segments: {sourceId, name, start, end}[]` in product coordinates. Together the segments cover the product; a junction's homology overlap is reported as an `overlap` range that belongs to both neighbors.
- `ProductPreview` gets a legend (color, number, name, length) above the map. Clicking a legend entry selects that source's range.
- The circular and linear maps color an outer band by segment. The sequence view shades each stretch and prints the source name at every boundary. Hovering shows "from <name>, bases a–b of the source".
- The overlap is drawn as a hatched band across the boundary.

## 2. PCR at a chosen place, with primers drawn

### Core
- `NebuilderFragment` gains an optional `open`: `{ caret: number }` (insert before base N, 1-based in the UI) or `{ start: number; end: number }` (replace bases start to end, inclusive). It applies to `kind: 'pcr'` on a circular source.
- `fragmentTemplate` turns `open` into the linear template running from the base after the opening to the base before it (for a replace, the region is dropped). With `open` unset the result is unchanged, so whole-circle amplification stays as it is.
- In-Fusion already has `pcr-caret` and `pcr-region`. Its settings are unchanged, and the click-to-place control (below) writes to them.
- Each design returns per-piece primer geometry (`PrimerGeometry`: piece, strand, source start and end of the anneal part, tail length, tail neighbor) so the UI draws from the same data as the primer table.

### UI
- In "How each fragment is made" a circular source made by PCR gets a choice: **Whole circle**, **Open at a position**, **Replace a region**. The position or region is set by typing, or by clicking (and dragging) on the source's diagram.
- Beneath each piece, a **primer map** shows the template, the amplified band, the primer arrows, the tails colored by the neighbor they overlap, and the position labels. Clicking a primer highlights its row in the primer table, and the reverse.
- In-Fusion shows the same map for the vector (opened by inverse PCR) and for each insert.

## 3. Splitting the overhang between the primer pairs

- Each junction gets a **split** control: a slider from "all on the left primer" to "all on the right primer", with presets **All left**, **50/50** and **All right**. The label shows "k nt on <left>, N−k nt on <right>", and the primer map redraws as it moves.
- **NEBuilder:** `JunctionOptions` gains `split?: number` (bases of the overlap carried by the upstream fragment's primer). The existing modes map onto it: `upstream` is all, `downstream` is none, and `split` is NEB's rounding of half. Unset keeps today's behavior exactly.
- **In-Fusion:** the vector-end and insert-end primers can share the extension. Default is Takara's rule (all on the insert primers), which stays reference-tested. The slider is marked as a Bio-Bench addition, and the vector primers then carry a tail too.
- Findings warn when a split makes a primer longer than 60 nt or gives a primer pair a Tm difference above the setting.

## 4. Amino-acid change: numbering and alignment

- The protein sequence is shown in blocks of 10, 50 per line, with the residue number at the start and end of each line. Mutated residues are highlighted.
- Each designed mutation gets a card with: `Y127F`, the wild-type and mutant codon, and a pairwise alignment of the wild-type and mutant protein windows (position ±10 residues). It shows match, mismatch and gap marks and residue numbers, and it reuses `src/core/align` (Gotoh). Below it is the DNA-level alignment of the primer region, with the changed bases marked.
- The alignment logic is a pure function in `src/core/cloning/mutation-view.ts` (`mutationAlignment(wtProtein, mutProtein, position, flank)`), unit tested.

## 5. Replace, delete and insert

- **Before/after:** the original sequence with the removed region struck through and boxed, over the new sequence with the inserted bases highlighted, both numbered.
- **Graphic:** a `ConstructDiagram` strip of the plasmid with the edit site marked and the back-to-back primers drawn as arrows. Delete shows the removed span, insert shows a marker, and replace shows both.
- Core: `sdmEditView(source, design)` returns `{ before, after, removed, added, primers }`, tested against the existing `designSdm` fixtures.

## Ease of use

- Plain-language labels ("Where should the insert go?", "How much of the overlap goes on each primer?") and defaults that reproduce current behavior.
- Every new control has a text alternative, works by keyboard, and passes axe in light and dark themes.
- Invalid positions (outside the sequence, region end before start) show a message next to the input and never throw.

## Testing

- **Core unit tests:** `open` templates for caret and region (and wrap-around at the origin), split arithmetic for every k from 0 to N, segments cover the product length and the overlap belongs to both neighbors, `mutationAlignment` for substitutions near the ends of the protein, and `sdmEditView` for the three edit kinds.
- **Regression:** all vendor fixtures pass unchanged; a new test asserts the unset options produce identical designs.
- **Component tests:** the legend and segment coloring, the primer map linking to the table, the split slider, and the numbered protein view.
- **E2E:** a NEBuilder design with a PCR-opened vector and a 50/50 split, an In-Fusion design with click-to-place, and a Y127F design showing its alignment.
- **Docs:** `docs/cloning-hub.md` is updated with the new options and states that In-Fusion split and NEBuilder free split are additions beyond the vendor tools.

## Open decisions

None. The scope (NEBuilder and In-Fusion) was confirmed with the user.
