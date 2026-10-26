# Structure viewer v2: mmCIF-first, fast Mol*, sequence extraction

Date: 2026-10-25. Status: draft for review (builder check done).

## Intent

The structure tool (`src/tools/structure/`) is where a structural biologist drops a model or types a PDB ID to look at it, pull sequences out of it, and see what is in it. RCSB has moved to mmCIF (large entries and extended IDs exist only as CIF), and AlphaFold 3, Boltz and Protenix write CIF, so CIF becomes the primary format and PDB the legacy one. The Mol* part is slow and unreliable today and must be rebuilt, not patched.

Said by the user: support CIF (in fact everything, since PDB went CIF), make it a good viewer with sequence extraction, drag and drop is broken, Mol* is slow after loading, Mol* does not load when a new structure is loaded, the whole Mol* part needs improving. Order: CIF and general improvement first, prediction scoring second.

This document covers part 1 only. Part 2 (PAE heatmap, pTM/ipTM, ipSAE per chain pair for binder design, reading AF3/Boltz/Protenix confidence files) gets its own design later; part 1 must not block it (see "Hooks for part 2").

## Goals

1. Load mmCIF and PDB from file (picker or drag and drop anywhere on the tool) or RCSB ID (4-character and extended `pdb_0000xxxx`). `.gz` files open directly.
2. Mol* is fast and reliable: created once per page visit, structures are swapped in, layout changes never rebuild it, loading a second, third, … structure always works.
3. Sequence extraction that a structural biologist trusts: full deposited sequence vs modelled residues, gaps marked, modified residues mapped to parents, chains grouped by entity, both chain labels shown, FASTA export at every level.
4. Sequence strip linked to 3D in both directions.
5. Structure facts (header metadata, ligands, interface residues per chain pair), quick display controls, snapshot and export.
6. A cleaner page: one preset list, no duplicated headers and links.

## Non-goals (part 1)

Anything specific to predicted structures, by the user's decision on 2026-10-25: prediction detection, pLDDT colouring, AlphaFold DB fetch, AF3/Boltz/Protenix fixtures, PAE, ipTM, ipSAE, confidence JSON/NPZ files (all part 2). Predicted CIFs still load and display as ordinary structures. Superposition of two structures, coordinate editing, electron density maps, trajectories, BinaryCIF parsing in our own parser.

## Anti-goals

- The page freezes while a large complex (e.g. 1JGQ, 4V6X-sized ribosomes) parses.
- Sequence export silently differs from the deposited sequence (e.g. gaps glued together, MSE dropped, X where a parent is known) without saying so.
- Any request to molstar.org, or an iframe (the existing e2e `molstar-local.spec.ts` asserts this and stays).
- Mol* showing the previous structure, a blank canvas, or a stuck spinner after a new load.

## Current state

- `src/tools/structure/View.tsx` (986 lines, one file): RCSB fetch of `.pdb` only, `.pdb/.ent` upload via a hidden `<input>` inside a `<label>` with no drag handlers (why drop fails), presets, chain table, ligand grouping, metrics (Rg, atom counts).
- `src/tools/structure/MolstarViewer.tsx`: lazily imports `molstar/lib/apps/viewer/app` (the whole viewer app) and calls `Viewer.create` inside a `useEffect` keyed on `[pdbText, displayId, showControls, reloadKey]`, so every new structure, panel toggle or reload disposes and recreates the entire plugin. The cleanup calls `host.replaceChildren()` while a pending `Viewer.create` may still mount into the host; the "does not load when a new structure is loaded" bug is likely this race or the Mol* React root not being unmounted, but must be confirmed by reproducing it (systematic debugging) before the rewrite, and covered by a regression test. It also has its own second preset bar duplicating the View's.
- `src/core/protein/structure.ts`: `parsePdb` (PDB only, main thread, one object per atom in `allAtoms`), `kabschSuperposition`, `superimposeStructures`, `getDemoTrpCagePdb`. Tested in `tests/core/protein-structure.test.ts`; keep its exports and behaviour.
- Mol* is `molstar@^5.12.0` (npm), cached by the PWA (`vite.config.ts`, cache `molstar-viewer`).
- Worker helper: `src/lib/use-worker-compute.ts` (used by dsf, cryoem; e2e `workers.spec.ts` checks worker URLs).
- Assurance: `structure` is `review-required` in `src/tools/assurance.ts`.

## Design

### Parsing (`src/core/structure/` new, or extend `src/core/protein/` — builder's call)

- `detectFormat(text, filename)`: mmCIF (`data_` block / `_atom_site.` loop) vs PDB (`ATOM  `/`HETATM` records). Extension is a hint, content decides.
- `parseMmcif(text)`: a tokenizer for CIF loops and key-value pairs (quoted strings, `;` text fields, `?` and `.`), reading:
  - `_atom_site` (label and auth asym/seq IDs, comp ID, atom name, element, xyz, B-factor, occupancy, model number; all models kept, alt-loc: first or highest occupancy).
  - `_entity`, `_entity_poly` (`pdbx_seq_one_letter_code_can`, type), `_entity_poly_seq` (full sequence with numbering), `_pdbx_poly_seq_scheme` (maps full sequence to modelled auth numbering), `_struct_asym`.
  - `_chem_comp` (names, `mon_nstd_parent_comp_id`) and `_pdbx_struct_mod_residue` for modified-residue parents; fall back to a built-in table (MSE→M, SEP→S, TPO→T, PTR→Y, HYP→P, MLY→K, CSO→C, …) when the file lacks them.
  - Header: `_struct.title`, `_exptl.method`, `_refine.ls_d_res_high` / `_em_3d_reconstruction.resolution`, `_entity_src_gen` / `_entity_src_nat` organism, `_pdbx_database_status.recvd_initial_deposition_date`.
  - Multi-model files (my call; NMR ensembles such as the 1L2Y preset): the parser keeps every model's coordinates; a model picker appears only when there is more than one model. Mol* and every coordinate-derived number (interfaces, Rg, counts) always describe the same selected model, model 1 by default. Sequences do not depend on the model.
- Files missing most of these categories (minimal CIFs, including prediction outputs) must still parse: sequence comes from `_entity_poly_seq` if present, else from modelled residues.
- PDB parsing keeps `parsePdb`, extended to read SEQRES (full sequence), COMPND/SOURCE/HEADER/EXPDTA/REMARK 2 (resolution) and MODRES, into the same output model.
- One shared output model for both formats: entities → chains (label ID, auth ID, entity ID, type) → residues (label seq, auth seq + insertion code, comp ID, one-letter, modelled yes/no). Coordinates in typed arrays (`Float32Array` xyz, B-factor) rather than one object per atom, so large complexes stay small and transfer to the main thread cheaply. A thin adapter keeps the existing `ParsedStructure` shape for anything that still uses it.
- Parsing runs in a Web Worker (via `use-worker-compute` or the same pattern); the UI shows progress and stays responsive. Interface-residue computation also runs there.
- Gzip: `DecompressionStream('gzip')` for `.gz` uploads.

### Loading

- RCSB: `https://files.rcsb.org/download/<ID>.cif` (accept 4-character and `pdb_` extended IDs; normalise case). PDB-format download stays available as an export, not the fetch path.
- Drag and drop: the whole tool area is a drop target with a visible overlay while dragging; the picker accepts `.cif,.mmcif,.pdb,.ent,.gz`. Errors via `src/lib/file-import.ts` conventions.
- URL state keeps the loaded ID (`useUrlState`), so `#/t/structure?…` links reopen the same entry; local files are not put in the URL.
- One preset list (keep the current seven; drop the duplicate bar in `MolstarViewer`).
- Default and offline (my call): opening `#/t/structure` with no ID shows a bundled 1UBQ mmCIF (lazy-loaded asset, no network), labelled correctly; this replaces today's Trp-cage demo mislabelled "1UBQ". Fetched RCSB files are cached by the PWA (runtime cache, small entry limit) so recently opened entries work offline.

### Mol* (`MolstarViewer.tsx` rewrite)

- Create the plugin once when the component mounts and dispose it once on unmount. Builder's call between the `Viewer` app API and a leaner `createPluginUI`/`PluginContext` setup; pick whichever loads less code while keeping a usable optional controls panel. Measure bundle size and time-to-first-render before and after, and report both.
- New structure: `plugin.clear()` (or delete the previous data tree) then load from data, passing the detected format (`mmcif` or `pdb`) to Mol*; Mol* parses its own copy. Loads are serialised: if a second load starts before the first finishes, the first is abandoned and never renders over the second.
- Controls panel, canvas height: change layout props / resize the canvas in place; never recreate.
- Imperative handle used by the View: `load(data, format, label)`, `setRepresentation(kind)`, `setColoring(theme)`, `highlight(residues)`, `focus(residues | ligand)`, `select(residues)`, `snapshot(): Promise<Blob>`, plus a callback for residues the user clicks or hovers in 3D, expressed in our residue identifiers (label asym + label seq).
- Performance: sensible defaults for big structures (e.g. Mol*'s auto preset, no ambient occlusion above a size threshold); interaction must stay smooth on 1JGQ on a normal laptop.
- Display controls in our UI, not only in Mol* panels: representation (cartoon, surface, ball-and-stick, spacefill) and colour (chain, entity, secondary structure, residue type, B-factor). No prediction-specific colouring in part 1.

### Sequences

- Per chain: full deposited sequence with modelled vs unmodelled residues visually distinct (unmodelled shown lower-case or greyed with a gap marker); numbering in auth numbering with a toggle to label numbering.
- Chains grouped by entity: "Entity 1, chains A, C (2 copies)" with one sequence, expandable to per-chain differences in what is modelled.
- Modified residues shown as their parent letter with a marker and tooltip (e.g. MSE → M). Unknown residues with no parent are X and listed.
- Linked selection: click or drag across residues in the strip → highlight and focus in Mol*; clicking or hovering a residue in 3D highlights it in the strip and scrolls to it. Works for large complexes (the strip virtualises or lists one chain at a time; builder's call).
- Export: FASTA for the current selection, a chain, an entity, or all entities. Headers carry the entry ID, entity, chain labels (auth and label) and description, for example `>1ABC_1 | Chains A, C [auth A, C] | Hemoglobin alpha`. Option to export modelled-only (gaps as `-` or dropped, user's pick, default `-`) or the full deposited sequence (default). Copy to clipboard and download.

### Structure facts

- Header card: title, method, resolution, organism(s), deposition date, entity and chain counts. Missing fields are omitted, not shown as blanks.
- Ligands: grouped by comp ID with name, count and chains; water hidden by default; click to focus in 3D.
- Interface residues: for each chain pair, residues with any heavy atom within 4.5 Å of the other chain (cutoff adjustable), computed in the worker with a spatial grid. Shown as a compact chain-pair table; clicking a pair highlights both sides in 3D; copyable as residue lists.
- Keep Rg and atom counts but demote them below the sequence section.

### Export

Original file as loaded; a chosen chain or entity as mmCIF or PDB (PDB export warns when the structure exceeds PDB format limits: >62 chains with single-character IDs, >99,999 atoms); FASTA (above); PNG snapshot from Mol*.

### Page layout

Left inputs column: load (RCSB ID box, file picker, presets), header card. Main column: Mol* canvas with our display toolbar, sequence panel under it, then chain/entity table, ligands, interfaces, metrics. Mobile: no horizontal overflow at 390 px; the sequence strip scrolls inside its own box. Split `View.tsx` into a model hook plus components (`LoadPanel`, `SequencePanel`, `EntityTable`, `LigandList`, `InterfaceTable`, `DisplayToolbar`), following the layout used for the buffers and plate-reader tools.

### Hooks for part 2

Nothing is built for part 2. The residue model keeps residues and ligands in file order with per-atom B-factors accessible, so a later PAE/pLDDT layer can map onto it; the exact token order the prediction tools use is verified in part 2 against real files.

## Testing

- Unit (vitest), with small checked-in fixtures under `tests/fixtures/` (trimmed real files, kept small): an RCSB mmCIF with unmodelled loops and MSE (e.g. a trimmed selenomethionine entry), a multi-entity complex with homo-copies, a CIF with multi-line `;` text fields and quoted values, an NMR multi-model entry, a PDB with SEQRES/MODRES, a `.gz` file. Assert sequences, gap positions, parent mapping, entity grouping, auth vs label IDs, header fields, FASTA text, interface residues on a known pair.
- Parity: PDB and CIF of the same entry produce the same sequences and chain sets.
- Existing `tests/core/protein-structure.test.ts` and the protein tool keep passing; `tests/app/structure.test.tsx` is updated to the new UI.
- e2e never reaches the network (my call): RCSB requests are intercepted with `page.route` and served from fixtures, so CI and deploy runs are deterministic.
- e2e: drop a CIF file onto the page and see it render; load three structures in a row (preset → RCSB ID → dropped file) and assert the canvas shows each one (a regression test for the reload bug; assert via the Mol* data label or the structure count, not pixels); click a residue in the sequence strip and see the Mol* selection change; parsing happens in a worker (`workers.spec.ts` pattern); `molstar-local.spec.ts`, a11y (light and dark) and mobile suites pass.
- Assurance (my call): `structure` moves to `reference-tested` with a new `reviewed` date, as buffers did; the scope text says parsing, sequence extraction and interface residues are fixture-tested, and the 3D rendering is UI-tested only (Mol* draws it).

## Left to the builder

Directory for the new parser, `Viewer` vs `createPluginUI`, sequence-strip virtualisation approach, exact visual design within the app's existing style, worker transport details, and the alt-loc rule if first-altloc breaks a fixture.
