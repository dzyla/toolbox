# Cloning Hub — design

Date: 2026-09-27 · Status: draft for review

## Goal

Turn the Cloning Suite into a cloning hub the lab actually uses. You load a vector and inserts once, choose a method, and get:

- primers identical to what the vendor tool returns,
- a bench protocol computed from your stocks,
- the product as a map and a GenBank file.

"1:1" means the same inputs, rules and outputs as the vendor tools (primer sequences, overlap/Tm figures and reaction amounts). Each method is checked against reference cases captured from the live vendor tools. The UI is our own; we do not copy vendor look or branding.

## Scope and order

| # | Deliverable | Vendor reference |
|---|---|---|
| 1 | Shared workspace and in-silico engine (sequences, digest, linearise, assemble, GenBank export) | — |
| 2 | NEBuilder HiFi / Gibson designer | NEBuilder Assembly Tool v2.11.2 |
| 3 | In-Fusion designer | Takara In-Fusion Primer Design Tool |
| 4 | Restriction + ligation, sticky and blunt | NEBioCalculator (ligation), NEB M0202 protocol |
| 5 | Amino-acid substitution / insertion / deletion (Q5 SDM + KLD) | NEBaseChanger |
| later | Golden Gate; NEBcloner-style enzyme and buffer advice | NEBridge Golden Gate tool; NEBcloner |

Out of scope for this spec: Golden Gate and NEBcloner (separate spec on the same interfaces), sequencing-read verification, and ordering integration beyond CSV/IDT bulk text.

## Architecture

### Core (`src/core/cloning/`, DOM-free, unit-tested)

- `workspace.ts`: `CloningWorkspace` = ordered `CloningSource[]` (existing `sources.ts`: a `PlasmidDocument` plus id and role). Roles are `vector | insert`.
- `digest.ts`: finds cut sites from `src/data/restriction-enzymes.json` (REBASE via Biopython: site plus top/bottom cut offsets, Type IIS included). It handles both strands and circular wrap-around, and returns fragments with explicit end structures.
- `ends.ts`: an `End` has a type (`blunt | 5' | 3'`), an overhang sequence and a phosphorylation state. Provides compatibility (sticky pairing including enzyme-pair compatibility such as BamHI/BglII, blunt–blunt), Klenow fill-in, T4/Quick Blunting chew-back, and scar-site reconstitution.
- `linearize.ts`: opens a vector by (a) one or two restriction enzymes, (b) inverse PCR between two positions, or (c) already linear. It returns the linear backbone with its two ends. This extends the existing `linearizeSource`.
- `assemble.ts`: joins oriented fragments into the product and checks each junction (overlap identity, end compatibility). It builds on the existing `finalizeConstructPlan` / `ConstructPlan`, which holds findings, provenance and status.
- `features.ts`: carries annotations from the inputs into product coordinates (shifting, reverse-complementing, dropping features broken by a junction), then adds primer-binding, junction and mutation features.
- `protocol.ts`: a shared reaction-table model (component, stock, amount in ng/pmol/fmol, volume, per-reaction and master mix) plus incubation steps, exported to text and to the Protocols tool.
- `oligo.ts`: primer output model (name, full sequence with the tail in lowercase, anneal part, length, GC, Tm, Ta) and the CSV and IDT bulk-order formatters.
- Tm: the method modules use the NEB Tm-calculator method for the chosen polymerase, and Takara's own Tm rule for In-Fusion. Both are implemented in `src/core/nucleic/` and pinned to vendor outputs.

### Method modules (`src/core/cloning/methods/`)

Each is a pure function `design(workspace, settings) → CloningDesign`, where `CloningDesign` extends `ConstructPlan` with `primers`, `protocol` and `junctionViews`. The methods are:

- `nebuilder.ts`
- `infusion.ts`
- `ligation.ts`
- `basechanger.ts`

The detailed rules for each are in the "Method rules" section.

### UI (`src/tools/cloning/`)

The hub replaces the four tabs:

1. **Sequences.** Add a vector and any number of inserts by dropping SnapGene/GenBank/FASTA files, pasting a sequence, choosing a built-in vector, or importing from the Plasmid Viewer. Each card shows length, topology and a mini map; cards can be reordered, flipped and removed.
2. **Method.** A method picker, then the method's own settings:
   - vector opening (a list of single-cutter enzymes, inverse-PCR coordinates, or already linear),
   - insert order and orientation,
   - vendor settings with vendor defaults.
3. **Results**, recomputed live:
   - a primer table (copy, CSV, IDT bulk),
   - junction views (overlap or sticky-end diagram with Tm and flags),
   - a protocol card (from the user's stock concentrations; printable; "Start run" in Protocols),
   - the product map (CircularMap/LinearMap from the Plasmid Viewer), with "Download GenBank" and "Open in Plasmid Viewer".
4. **Findings.** Blockers stop primer and protocol output, e.g. an enzyme that cuts inside an insert, incompatible ends, or a mutation that does not match the wild-type residue. Warnings do not, e.g. low overlap Tm or hairpins.

State is URL/draft-backed, and the hub saves as a project through `useToolProject`, with sequences stored as project assets. The legacy `#gibson` and `#mutagenesis` links resolve to the hub with the matching method preselected. The existing Gibson and Mutagenesis views and `src/core/gibson` and `src/core/mutagenesis` are removed once the hub methods pass their vendor fixtures.

## Method rules

<!-- Filled from the vendor research report (captured tool behaviour, manuals). -->

### NEBuilder HiFi / Gibson

### In-Fusion

### Restriction + ligation (sticky and blunt)

### Amino-acid changes (NEBaseChanger-style)

Input: pick an ORF (auto-detected on both strands, or from an imported CDS annotation), then type mutations in one-letter (`Y127F`) or three-letter (`p.Tyr127Phe`) notation, plus insertions and deletions.

- A comma-separated list gives one design per mutation (primer pair, mutant plasmid, protocol).
- `+` joins mutations into one multi-mutant. If the sites fit within one primer design they are made in one reaction; otherwise the design is split into consecutive rounds, each round using the previous product as its template.
- The wild-type residue is checked against the ORF translation; a mismatch is a blocker that shows the actual residue.

## Error handling

- Import errors use the existing `file-import` path (size limits, friendly messages, `ImportAlert`).
- Every design function returns findings rather than throwing. The UI shows blockers inline next to the input that caused them.
- Invalid bases, empty inserts, enzymes absent from the vector, and too-short fragments are blockers with the vendor's wording where it exists.

## Testing

- **Vendor fixtures:** `tests/fixtures/vendor/<tool>/<case>.json` holds the inputs, settings, raw vendor output, tool version and capture date, captured by `scripts/vendor/*.mjs` (Playwright). Each method has a fixture test requiring exact primer sequences and names, and Tm/amounts within the vendor's display rounding. There are at least 5 cases per method, covering 1–3 inserts, digest vs PCR linearisation, 5′/3′/blunt ends, and edge cases (short fragments, high GC).
- **Core unit tests:** digest (known pUC19/pET-28a maps from REBASE/Biopython), end compatibility tables, fill-in and chew-back, feature carry-over, and GenBank round trip.
- **UI:** component tests for each step, e2e runs of a full NEBuilder design, an In-Fusion design and a Y127F design including GenBank download, and axe checks in light and dark mode.
- **Science panel:** each method cites the vendor manual, the tool version and the fixture capture date, and is marked as reference-tested in `assurance.ts`.
