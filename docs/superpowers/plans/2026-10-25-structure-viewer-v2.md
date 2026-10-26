# Structure Viewer v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the structure tool as an mmCIF-first viewer with a single long-lived Mol* plugin, off-main-thread parsing, trustworthy sequence extraction linked to 3D, and structure facts (header, ligands, interfaces).

**Architecture:** A new pure core (`src/core/structure/`) turns mmCIF or PDB text into one `StructureModel` (entities → chains → residues, columnar atoms per model). Parsing and interface detection run in a Web Worker through `useWorkerCompute`. The Mol* plugin is created once and driven through an imperative handle; the View is split into a model hook and focused components.

**Tech Stack:** Preact + TypeScript, Tailwind v4, Mol* 5.12 (`molstar` npm, React 18 under the hood), Vitest + @testing-library/preact, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-structure-viewer-v2-design.md`

## Global Constraints

- No request to molstar.org and no iframe; `tests/e2e/molstar-local.spec.ts` keeps passing (update its selector only).
- Opening `#/t/structure` with no ID shows a bundled 1UBQ mmCIF with no network call.
- RCSB fetch URL: `https://files.rcsb.org/download/<ID>.cif`; IDs `^[0-9][A-Za-z0-9]{3}$` or `^pdb_[0-9a-z]{8}$` (case-insensitive; 4-char IDs uppercased, extended IDs lowercased).
- File picker accepts `.cif,.mmcif,.pdb,.ent,.gz`; local files never go into the URL.
- Interface cutoff default 4.5 Å between heavy atoms, user-adjustable.
- FASTA default: full deposited sequence; modelled-only option with gaps `-` (default) or dropped. One sequence per line (no wrapping).
- FASTA headers: entity `>{ID}_{entity} | Chains {label ids} [auth {auth ids}] | {description}`; chain `>{ID}_{entity} | Chain {label} [auth {auth}] | {description}`; range adds ` | residues {from}-{to}` (label numbering).
- PDB export warns when chains > 62 or any chain ID is longer than 1 character, or atoms > 99,999.
- Nothing prediction-specific: no pLDDT theme, no prediction detection, no AlphaFold DB.
- Mobile: no horizontal overflow at 390 px. a11y (axe, light + dark), mobile and smoke e2e suites pass.
- Keep `src/core/protein/structure.ts` exports and behaviour; `tests/core/protein-structure.test.ts` stays green.
- Checks before every commit that touches code: `npm run typecheck && npm run lint && npm run test`.
- Work on branch `feat/structure-viewer-v2`.

## Review Focus

1. **Rapid successive loads** (clicking three presets quickly): only the last structure ends up in Mol* and in the panels; no stale render. Test in Task 6.
2. **Insertion codes** (antibody numbering 27, 27A, 27B): residues stay distinct, ordered, and map to the right 3D residue. Test in Task 2 and Task 4.
3. **Junk dropped on the page** (a FASTA, a PNG, an empty file): a clear error, the current structure stays loaded. Test in Task 5 and Task 7.
4. **Minimal CIFs** with only `_atom_site` (ChimeraX/PyMOL/prediction exports): parse, sequences come from modelled residues, header card shows only what exists. Test in Task 2.
5. **Large complex** (1JGQ, 25 chains, multi-character label chain IDs, ~50k atoms): page stays responsive while parsing; PDB export warning fires for >1-char chain IDs. Test in Task 4 (warning) and Task 10 (e2e worker + responsiveness).

---

## File Structure

```
src/core/structure/
  model.ts         types only (StructureModel and friends)
  cif.ts           CIF tokenizer → blocks/categories (no chemistry)
  mmcif.ts         parseMmcif(text) → StructureModel
  pdb.ts           parsePdbToModel(text) → StructureModel
  residues.ts      one-letter mapping, modified-residue parent fallback table, polymer typing
  detect.ts        detectFormat, parseStructure (dispatch)
  fasta.ts         toFasta
  interfaces.ts    computeInterfaces (spatial grid)
  metrics.ts       computeMetrics (Rg, centre, bounds, counts)
  export.ts        writeMmcif / writePdb for a chain subset
  index.ts         re-exports
src/tools/structure/
  View.tsx                 thin composition
  StructureModel.tsx       useStructureModel hook (state, loading, worker results)
  load.ts                  readStructureFile, fetchRcsbEntry, normaliseRcsbId, loadDemo
  job.ts + parse.worker.ts parse job;  interface.worker.ts interfaces job
  MolstarViewer.tsx        rewritten, exposes MolstarHandle
  demo/1ubq.cif            bundled default (copy of the RCSB file)
  components/LoadPanel.tsx, DropOverlay.tsx, HeaderCard.tsx, DisplayToolbar.tsx,
             SequencePanel.tsx, EntityTable.tsx, LigandList.tsx, InterfaceTable.tsx,
             MetricsRow.tsx, ExportMenu.tsx
  science.ts               rewritten text
tests/fixtures/structure/  1UBQ.cif, 1UBQ.pdb, 3KZ5.cif, 3KZ5.pdb, 4HHB.cif.gz,
                           1L2Y.cif.gz, semet.cif(.gz), edge-cases.cif, minimal.cif, insertion.cif, README.md
tests/core/structure-*.test.ts, tests/app/structure.test.tsx (rewritten), tests/e2e/structure.spec.ts
```

Reference facts for fixtures (read from the RCSB files on 2026-10-25):

- **1UBQ**: 1 polymer entity, chain A (label A = auth A), 76 aa `MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG`, all modelled; title `STRUCTURE OF UBIQUITIN REFINED AT 1.8 ANGSTROMS RESOLUTION`, method `X-RAY DIFFRACTION`, resolution 1.8, deposited 1987-01-02, organism `Homo sapiens`.
- **3KZ5**: entity 1 `Protein sopB`, 52 aa `GSHMSSRHQFAPGATVLYKGDKMVLNLDRSRVPTECIEKIEAILKELEKPAP`, 3 copies. Label A = auth E, label B = auth B, label C = auth A. Unmodelled (label seq): A 49–52; B 1, 49–52; C 1–4, 52. Entity 2 acetate (ACT), 1 copy. Method X-ray, 1.58 Å, deposited 2009-12-07.
- **4HHB**: entity 1 `Hemoglobin subunit alpha` ×2 (chains A, C), entity 2 `Hemoglobin subunit beta` ×2 (B, D), 4 HEM `PROTOPORPHYRIN IX CONTAINING FE`, 2 PO4, 221 waters.
- **1L2Y**: NMR, 38 models, 20 aa Trp-cage.

---

### Task 1: Branch, fixtures, model types, CIF tokenizer

**Files:**
- Create: `src/core/structure/model.ts`, `src/core/structure/cif.ts`, `tests/fixtures/structure/*`, `tests/core/structure-cif.test.ts`

**Interfaces:**
- Produces (`model.ts`):

```ts
export type StructureFormat = 'mmcif' | 'pdb';
export type PolymerType = 'protein' | 'dna' | 'rna' | 'other';
export interface ResidueRef { authAsymId: string; authSeqId: number; insCode: string }   // '' when none
export interface SeqResidue {
  seqId: number;            // 1-based position in the entity sequence (label_seq_id; PDB: SEQRES index)
  compId: string;           // e.g. 'MSE'
  oneLetter: string;        // parent letter for modified residues, 'X' if unknown
  parentCompId?: string;    // set when compId is a modified residue
  modelled: boolean;
  auth?: { seqId: number; insCode: string };  // present when modelled (or known from scheme)
}
export interface PolymerChain { labelAsymId: string; authAsymId: string; entityId: string; residues: SeqResidue[] }
export interface Entity {
  id: string; kind: 'polymer' | 'non-polymer' | 'branched' | 'water';
  polymerType?: PolymerType; description: string;
  sequence: string;          // full canonical one-letter sequence (polymers), '' otherwise
  labelAsymIds: string[];
}
export interface Ligand { compId: string; name: string; entityId: string; labelAsymId: string; authAsymId: string; authSeqId: number; atomCount: number }
export interface AtomTable {          // one per model, columnar; index i is one atom
  modelNumber: number; count: number;
  xyz: Float32Array;                 // 3 * count
  bFactor: Float32Array; occupancy: Float32Array;
  isHetatm: Uint8Array; isHydrogen: Uint8Array;
  atomName: string[]; element: string[]; compId: string[];
  labelAsymId: string[]; labelSeqId: Int32Array;   // 0 for non-polymer
  authAsymId: string[]; authSeqId: Int32Array; insCode: string[];
  entityId: string[];
}
export interface StructureHeader { id?: string; title?: string; method?: string; resolution?: number; organisms: string[]; depositionDate?: string }
export interface StructureModel {
  name: string; format: StructureFormat; header: StructureHeader;
  entities: Entity[]; chains: PolymerChain[]; ligands: Ligand[];
  models: AtomTable[];               // models[0] is the first model in the file
  warnings: string[];                // user-facing notes, e.g. "Unknown residue XYZ shown as X"
}
```

- Produces (`cif.ts`): `parseCifBlocks(text: string): CifBlock[]`, where `interface CifBlock { name: string; categories: Map<string, CifCategory> }` and `interface CifCategory { name: string; fields: string[]; rowCount: number; get(field: string, row: number): string | undefined }`. `?` and `.` come back as `undefined`. Category name includes the leading underscore (`_atom_site`), field names are without it (`Cartn_x`).

- [ ] **Step 1: Branch**

Run: `git checkout -b feat/structure-viewer-v2`

- [ ] **Step 2: Add fixtures**

Download into `tests/fixtures/structure/` from `https://files.rcsb.org/download/`: `1UBQ.cif`, `1UBQ.pdb`, `3KZ5.cif`, `3KZ5.pdb`; gzip `4HHB.cif` and `1L2Y.cif` (`gzip -9`) and keep only the `.gz`. For `semet.cif`, pick a real X-ray entry containing MSE whose `.cif.gz` is under 300 KB (RCSB search attribute `rcsb_polymer_entity.rcsb_nonstd_monomers` = `MSE`), store it gzipped as `semet.cif.gz`. Hand-write three small synthetic files: `edge-cases.cif` (multi-line `;` text field, single- and double-quoted values with spaces and embedded quotes like `'O5'' '`, `?`/`.` values, two data blocks), `minimal.cif` (only an `_atom_site` loop, 2 chains, ~10 residues, no entity categories, one MSE residue, chain B with residues 1–3 then 7–9), `insertion.cif` (one chain with auth seq 26, 27, 27A, 27B, 28 including `pdbx_PDB_ins_code`). Write `README.md` listing each file, its source/date and why it exists. Copy `1UBQ.cif` to `src/tools/structure/demo/1ubq.cif`.

- [ ] **Step 3: Write failing tokenizer tests** in `tests/core/structure-cif.test.ts`

```ts
it('reads key-value pairs and loops from 1UBQ', () => {
  const [b] = parseCifBlocks(read('1UBQ.cif'));
  expect(b.name).toBe('1UBQ');
  expect(b.categories.get('_struct')!.get('title', 0)).toBe('STRUCTURE OF UBIQUITIN REFINED AT 1.8 ANGSTROMS RESOLUTION');
  const atoms = b.categories.get('_atom_site')!;
  expect(atoms.rowCount).toBe(/* count of ATOM+HETATM lines in the file, computed in the test */);
  expect(atoms.get('label_comp_id', 0)).toBe('MET');
});
it('handles ; text fields, quotes with embedded quotes, ? and .', () => { /* edge-cases.cif: exact values */ });
it('returns one block per data_ section', () => { /* edge-cases.cif has two */ });
```

`read(name)` is a test helper (`tests/core/structure-helpers.ts`) reading from `tests/fixtures/structure`, gunzipping `.gz` with `zlib.gunzipSync`.

- [ ] **Step 4: Run** `npx vitest run tests/core/structure-cif.test.ts` → FAIL (module missing).

- [ ] **Step 5: Implement `parseCifBlocks`** as a single-pass tokenizer over the string (no regex per line for the atom loop; index scanning), storing loop values in one flat `string[]` per category with `fields.length` stride. A quote only closes when followed by whitespace or end of input (CIF 1.1 rule).

- [ ] **Step 6: Run** the test → PASS. Then typecheck, lint, test.

- [ ] **Step 7: Commit** `feat(structure): CIF tokenizer, structure model types and fixtures`

---

### Task 2: mmCIF → StructureModel

**Files:**
- Create: `src/core/structure/residues.ts`, `src/core/structure/mmcif.ts`, `tests/core/structure-mmcif.test.ts`

**Interfaces:**
- Consumes: `parseCifBlocks`, model types (Task 1).
- Produces: `parseMmcif(text: string, name?: string): StructureModel` (first data block); `residues.ts`: `oneLetterFor(compId: string, parent?: string): string`, `MODIFIED_PARENT: Record<string, string>` (at least MSE→MET, SEP→SER, TPO→THR, PTR→TYR, HYP→PRO, MLY→LYS, CSO→CYS, CSD→CYS, KCX→LYS, PCA→GLU, M3L→LYS, CME→CYS, plus nucleic PSU→U, 5MC→C, 1MA→A, 2MG→G, H2U→U, OMG→G, OMC→C), `polymerTypeFromCif(type: string): PolymerType`. Reuse `AA_3TO1` and `NUCLEIC_TO1` from `src/core/protein/structure.ts`.

Parsing rules:
- Entities from `_entity` (kind from `type`), description from `pdbx_description`; polymer type and canonical sequence from `_entity_poly` (`pdbx_seq_one_letter_code_can`, whitespace removed); per-position comp IDs from `_entity_poly_seq` (when two rows share a `num` — microheterogeneity, `hetero = y` — keep the first and add a warning).
- Chains: each polymer `label_asym_id` of that entity (`_struct_asym`); residues = the entity sequence with `modelled` from `_pdbx_poly_seq_scheme` (`pdb_mon_id` not `?`) or, when the scheme is missing, from atom presence; `auth` from the scheme (`pdb_seq_num`, `pdb_ins_code`) or the atoms.
- Modified residues: parent from `_pdbx_struct_mod_residue.parent_comp_id`, else `_chem_comp.mon_nstd_parent_comp_id`, else `MODIFIED_PARENT`, else `X` with a warning naming the comp ID.
- No entity categories (minimal files): group polymer residues by `label_asym_id` (falling back to `auth_asym_id`), a residue is polymer if it is a standard amino acid / nucleotide or a known modified one; build one entity per distinct sequence; descriptions empty; residue numbering from `label_seq_id` if present, else consecutive order.
- Atoms: all models kept as separate `AtomTable`s (by `pdbx_PDB_model_num`); alt-locs: keep the first occurrence of each (model, label_asym, seq, ins, atom name). Hydrogen = element `H` or `D`.
- Ligands: one per non-polymer, non-water (`HOH`, `DOD`, `WAT`) residue instance in model 1; name from `_chem_comp.name`.
- Header: `_entry.id`, `_struct.title`, `_exptl.method` (join multiple with ` / `), resolution from `_refine.ls_d_res_high`, else `_em_3d_reconstruction.resolution`, else `_reflns.d_resolution_high`; organisms from `_entity_src_gen.pdbx_gene_src_scientific_name`, `_entity_src_nat.pdbx_organism_scientific`, `_pdbx_entity_src_syn.organism_scientific` (unique, in order); date `_pdbx_database_status.recvd_initial_deposition_date`.

- [ ] **Step 1: Write failing tests** (exact values from the File Structure reference facts):

```ts
it('1UBQ: one entity, 76 aa, all modelled, header', ...)          // sequence string, header fields, organisms ['Homo sapiens']
it('3KZ5: label vs auth chains and unmodelled ends', () => {
  const m = parseMmcif(read('3KZ5.cif'));
  expect(m.chains.map(c => [c.labelAsymId, c.authAsymId])).toEqual([['A','E'],['B','B'],['C','A']]);
  const gaps = (id: string) => m.chains.find(c => c.labelAsymId === id)!.residues.filter(r => !r.modelled).map(r => r.seqId);
  expect(gaps('A')).toEqual([49,50,51,52]);
  expect(gaps('B')).toEqual([1,49,50,51,52]);
  expect(gaps('C')).toEqual([1,2,3,4,52]);
  expect(m.entities[0]).toMatchObject({ description: 'Protein sopB', labelAsymIds: ['A','B','C'] });
  expect(m.ligands.map(l => l.compId)).toEqual(['ACT']);
});
it('4HHB: two polymer entities with two copies each, 4 HEM, 2 PO4, waters excluded', ...)
it('1L2Y: 38 models with equal atom counts; sequence independent of model', ...)
it('semet: full sequence equals _entity_poly.pdbx_seq_one_letter_code_can and MSE positions carry parentCompId MET', ...)  // read the expected string from the file's own category in the test
it('minimal.cif: sequences from atoms, MSE→M via fallback table, chain B gap between 3 and 7 is not invented', ...)  // residues 1,2,3,7,8,9 in order; no header fields
it('insertion.cif: 27, 27A, 27B stay distinct and ordered', ...)
it('unknown modified residue becomes X with a warning', ...)      // inline tiny CIF string in the test
```

- [ ] **Step 2: Run** `npx vitest run tests/core/structure-mmcif.test.ts` → FAIL.
- [ ] **Step 3: Implement** `residues.ts` then `parseMmcif`.
- [ ] **Step 4: Run** → PASS; typecheck, lint, test.
- [ ] **Step 5: Commit** `feat(structure): parse mmCIF into entities, chains, sequences and atoms`

---

### Task 3: PDB → StructureModel, format detection

**Files:**
- Create: `src/core/structure/pdb.ts`, `src/core/structure/detect.ts`, `src/core/structure/index.ts`, `tests/core/structure-pdb.test.ts`

**Interfaces:**
- Consumes: model types, `residues.ts`.
- Produces: `parsePdbToModel(text: string, name?: string): StructureModel`; `detectFormat(text: string, filename?: string): StructureFormat | null` (content decides: a `data_` line plus `_atom_site.` → mmcif; any `ATOM  `/`HETATM` record → pdb; else null; extension only breaks ties); `parseStructure(text: string, filename?: string): StructureModel` (throws `Error('Not a PDB or mmCIF structure file')` when detection fails or the result has no atoms).

PDB rules: entities from `COMPND` (`MOL_ID`, `MOLECULE`, `CHAIN`); chains without COMPND each get their own entity per distinct sequence. Full sequence from `SEQRES`; align modelled residues to SEQRES in order (residue names must match; on mismatch fall back to atom-derived sequence and add a warning). `MODRES` gives parents. `label_asym_id` = auth chain ID for polymers. Header from `HEADER` (ID, date `DD-MMM-YY` → ISO), `TITLE`, `EXPDTA`, `REMARK   2 RESOLUTION.`, `SOURCE ORGANISM_SCIENTIFIC`. Models from `MODEL`/`ENDMDL`.

- [ ] **Step 1: Write failing tests**: 1UBQ.pdb and 3KZ5.pdb give the same entity sequences, chain sets (auth IDs), unmodelled positions and ligand comp IDs as the CIF of the same entry (parity); header fields for 1UBQ.pdb (date `1987-01-02`); `detectFormat` on each fixture, on a FASTA string (`null`), and a `.pdb`-named file whose content is CIF (`'mmcif'`); `parseStructure` throws the exact message for a FASTA string and for an empty CIF block.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; typecheck, lint, test.
- [ ] **Step 5: Commit** `feat(structure): PDB reader into the shared model and format detection`

---

### Task 4: Derived results: FASTA, interfaces, metrics, export writers

**Files:**
- Create: `src/core/structure/fasta.ts`, `interfaces.ts`, `metrics.ts`, `export.ts`; tests `tests/core/structure-derived.test.ts`

**Interfaces:**
- Consumes: `StructureModel`, `parseMmcif`, `parsePdbToModel`.
- Produces:

```ts
export type FastaScope = { kind: 'all' } | { kind: 'entity'; entityId: string } | { kind: 'chain'; labelAsymId: string } | { kind: 'range'; labelAsymId: string; from: number; to: number };
export interface FastaOptions { mode: 'full' | 'modelled'; gap: '-' | '' }
export function toFasta(m: StructureModel, scope: FastaScope, opts?: FastaOptions): string;   // default { mode: 'full', gap: '-' }
export interface InterfaceSide { labelAsymId: string; authAsymId: string; residues: ResidueRef[] }
export interface InterfacePair { a: InterfaceSide; b: InterfaceSide }
export function computeInterfaces(m: StructureModel, modelIndex: number, cutoff?: number): InterfacePair[];   // default 4.5
export interface StructureMetrics { atomCount: number; heavyAtomCount: number; residueCount: number; radiusOfGyration: number; center: [number, number, number]; bounds: { min: [number, number, number]; max: [number, number, number] } }
export function computeMetrics(m: StructureModel, modelIndex: number): StructureMetrics;
export function writeMmcif(m: StructureModel, modelIndex: number, labelAsymIds: string[]): string;
export interface PdbExport { text: string; warnings: string[] }
export function writePdb(m: StructureModel, modelIndex: number, labelAsymIds: string[]): PdbExport;
```

Rules: `'all'` exports polymer entities only, one record per entity. Interfaces are polymer–polymer only, heavy atoms, pairs ordered by chain order in the file (`a` before `b`), residues unique and in chain order, pairs with no contacts omitted. Use a uniform grid with cell size = cutoff; compare squared distances. Rg, centre and bounds over non-water heavy atoms, unweighted; `atomCount` counts every atom of the model, `residueCount` counts modelled polymer residues. `writeMmcif` emits `data_{name}`, `_entry.id`, and one `_atom_site` loop with the standard columns, round-trippable through `parseMmcif`. `writePdb` emits fixed-column ATOM/HETATM, TER and END; warnings: `More than 62 chains: PDB format cannot hold them all`, `Chain IDs longer than one character (e.g. AA) are truncated in PDB format`, `More than 99,999 atoms: serial numbers overflow in PDB format`.

- [ ] **Step 1: Write failing tests:**
  - FASTA for 3KZ5 entity: `>3KZ5_1 | Chains A, B, C [auth E, B, A] | Protein sopB\nGSHMSSRHQFAPGATVLYKGDKMVLNLDRSRVPTECIEKIEAILKELEKPAP\n`. Chain C modelled with `-`: `----SSRHQ…KELEKPA-` (exact string built from the sequence); with `''`: length 47. Range `{C, 5, 10}`: header ends ` | residues 5-10`, sequence `SSRHQF`. `'all'` on 4HHB gives exactly two records. For an entity, `'modelled'` uses the first chain and the header says so: `… | modelled residues of chain A`.
  - Interfaces on a synthetic two-chain model built in the test (atoms placed so exactly residues A2, A3 and B7 are within 4.5 Å and A4 is at 4.6 Å): `[{ a: { labelAsymId: 'A', residues: [A2, A3] }, b: { labelAsymId: 'B', residues: [B7] } }]`. Hydrogens within cutoff do not create contacts. 4HHB model 0: contains pair A–B, never a chain paired with itself, waters and HEM never appear. insertion.cif: an interface residue with `insCode: 'A'` is reported with its code.
  - Metrics: a synthetic model with heavy atoms at (±1,0,0), (0,±1,0), (0,0,±1) has Rg 1.0, centre (0,0,0), bounds ±1; adding a water and a hydrogen does not change Rg. 1UBQ: `atomCount` equals the `_atom_site` rows of model 1, `residueCount` 76.
  - `parseMmcif(writeMmcif(m, 0, ['B']))` for 3KZ5 has one chain B with the same modelled residues; `writePdb` on a model with a chain `AA` returns the truncation warning; 63 synthetic chains returns the 62-chain warning.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the four files and export them from `index.ts`. **Step 4: Run** → PASS; typecheck, lint, test.
- [ ] **Step 5: Commit** `feat(structure): FASTA export, interface residues, metrics and chain export`

---

### Task 5: Loading layer, workers, PWA caching

**Files:**
- Create: `src/tools/structure/load.ts`, `job.ts`, `parse.worker.ts`, `interface.worker.ts`, `tests/core/structure-load.test.ts` (or `tests/app/` if it needs DOM)
- Modify: `vite.config.ts` (chunking + runtime caching)

**Interfaces:**
- Consumes: `parseStructure`, `computeInterfaces`, `computeMetrics`.
- Produces:

```ts
// load.ts
export interface StructureSource { text: string; name: string; origin: 'demo' | 'rcsb' | 'file'; rcsbId?: string }
export function normaliseRcsbId(input: string): string | null;
export async function fetchRcsbEntry(input: string, fetchImpl?: typeof fetch): Promise<StructureSource>;
export async function readStructureFile(file: File): Promise<StructureSource>;   // gunzips when the first two bytes are 1f 8b (DecompressionStream)
export async function loadDemo(): Promise<StructureSource>;                       // import('./demo/1ubq.cif?raw'), name '1UBQ', rcsbId '1UBQ'
// job.ts
export interface ParseJob { text: string; name: string }
export interface ParseResult { model: StructureModel; format: StructureFormat }
export const runParseJob: (job: ParseJob) => ParseResult;
export const makeParseWorker: () => Worker;
export interface InterfaceJob { model: StructureModel; modelIndex: number; cutoff: number }
export interface InterfaceResult { pairs: InterfacePair[]; metrics: StructureMetrics }
export const runInterfaceJob: (job: InterfaceJob) => InterfaceResult;
export const makeInterfaceWorker: () => Worker;
```

Workers follow `src/tools/dsf/dsf.worker.ts` exactly (`{ ok, result }` / `{ ok, error }`). Error messages: invalid ID → `Enter a 4-character PDB ID (e.g. 1UBQ) or an extended ID (pdb_00001ubq)`; HTTP 404 → `RCSB has no entry {ID}`; other HTTP → `RCSB returned HTTP {status} for {ID}`; network failure → `Could not reach RCSB. Check your connection; recently opened entries work offline.` File errors go through `readTextFile`/`importErrorMessage` conventions (`FileImportError`).

`vite.config.ts`: put every `node_modules/molstar` module in a chunk named `molstar` (`build.rollupOptions.output.manualChunks`); replace the `app-*.js` ignore and runtime-cache pattern with `molstar-*.js` (and its CSS, if emitted as `molstar-*.css`); add runtime caching `urlPattern: /^https:\/\/files\.rcsb\.org\/download\//`, `handler: 'CacheFirst'`, `cacheName: 'rcsb-structures'`, `expiration: { maxEntries: 30 }`, `cacheableResponse: { statuses: [200] }`. Record the Mol* chunk sizes from `npm run build` before this change (on the branch start commit) and after, for the Task 6 report.

- [ ] **Step 1: Write failing tests:** `normaliseRcsbId` (`1ubq`→`1UBQ`, `PDB_00001UBQ`→`pdb_00001ubq`, `' 4hhb '`→`4HHB`, `12345`→null, `abcd`→null); `fetchRcsbEntry` with a stub fetch: URL is `https://files.rcsb.org/download/1UBQ.cif`, the 404 and network messages above; `readStructureFile` on `new File([gzippedBytes], '1L2Y.cif.gz')` returns text starting with `data_1L2Y`, a PNG-magic file and an empty file reject with a user-facing message; `runParseJob` on 3KZ5 returns `format: 'mmcif'` and 3 chains.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm run build` succeeds and `dist/assets/molstar-*.js` exists; typecheck, lint, test.
- [ ] **Step 5: Commit** `feat(structure): RCSB mmCIF fetch, gzip-aware file loading, parse workers, PWA caching`

---

### Task 6: Mol* viewer rewrite

**Files:**
- Modify (rewrite): `src/tools/structure/MolstarViewer.tsx`
- Create: `tests/e2e/structure.spec.ts` (Mol* parts), `tests/app/molstar-viewer.test.tsx`

**Interfaces:**
- Consumes: nothing from core except `ResidueRef`, `StructureFormat`.
- Produces:

```ts
export type Representation = 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill';
export type Coloring = 'chain-id' | 'entity-id' | 'secondary-structure' | 'residue-name' | 'uncertainty';  // Mol* theme names; 'uncertainty' is labelled "B-factor" in the UI
export interface MolstarHandle {
  load(data: string, format: StructureFormat, label: string, modelIndex: number): Promise<void>;
  setRepresentation(r: Representation): Promise<void>;
  setColoring(c: Coloring): Promise<void>;
  highlight(residues: ResidueRef[]): void;          // [] clears
  select(residues: ResidueRef[]): void;             // [] clears
  focus(residues: ResidueRef[]): void;              // camera to these; [] resets the view
  snapshot(): Promise<Blob>;                        // PNG
}
export interface MolstarViewerProps {
  label: string;
  height: number;
  showControls: boolean;
  onReady(handle: MolstarHandle): void;
  onResidueClick?(r: ResidueRef | null): void;
  onResidueHover?(r: ResidueRef | null): void;
}
```

Behaviour: `createPluginUI` (`molstar/lib/mol-plugin-ui`) with `renderReact18` and `DefaultPluginUISpec()`, created in a mount-only effect and disposed on unmount. If that does not cut the loaded code compared with `apps/viewer/app`, keep whichever is smaller; record both numbers. `load` = `plugin.clear()` → `builders.data.rawData` → `parseTrajectory(data, format)` → `createModel(trajectory, { modelIndex })` → `createStructure` → representation preset; loads go through a promise queue with a generation counter, so an earlier load that finishes late is discarded and never shown. After a load resolves, set `data-loaded-label` on the host element to the label read back from the Mol* state tree (not from props). `showControls` and `height` change layout (`plugin.layout.setProps`, canvas resize via `plugin.canvas3d?.handleResize()`), never recreate. Residue queries use auth identifiers (`auth_asym_id`, `auth_seq_id`, `pdbx_PDB_ins_code`) so PDB and CIF behave the same. Clicks/hover come from `plugin.behaviors.interaction.click/hover`, mapped to `ResidueRef` (null for empty space or non-residue loci). Above 100,000 atoms, turn off ambient occlusion and outlines. Keep the Mol* logo `aria-label` fix. In jsdom (existing `isTestEnv` check) render the host only, and call `onReady` with a handle whose methods resolve immediately and do nothing.

- [ ] **Step 1: Reproduce the current bug** (systematic debugging): with `npm run build && npm run preview`, load 1UBQ, then fetch 4HHB, then upload 3KZ5 on the current code; record what fails (console errors, which step) and the confirmed cause in the commit message. If the cause differs from the spec's hypothesis, note that.
- [ ] **Step 2: Write failing e2e** in `tests/e2e/structure.spec.ts`. Route `https://files.rcsb.org/download/**` to fixtures (gunzip `.gz` fixtures in the test with `zlib`; never hit the network):

```ts
test('loads three structures in a row and Mol* shows each', ...)        // demo 1UBQ → type 4HHB + Enter → setInputFiles 3KZ5.cif; expect host data-loaded-label to be 1UBQ, 4HHB, 3KZ5 in turn
test('rapid preset clicks end on the last one', ...)                    // click 4HHB, 1CRN, 1AKI presets without waiting; final label 1AKI and the header card says 1AKI
test('toggling Mol* panels and canvas size does not reload the structure', ...)  // a counter attribute data-load-count stays the same
```

(The labels and the header card come from Task 7; write the selectors now and run these after Task 7 if the UI is not in place yet. The jsdom test below must pass in this task.)

- [ ] **Step 3: Write failing jsdom test** `tests/app/molstar-viewer.test.tsx`: renders, calls `onReady` once with all seven methods, re-rendering with a new `height` or `showControls` does not call `onReady` again.
- [ ] **Step 4: Implement.** **Step 5: Run** jsdom test → PASS; typecheck, lint, test, build.
- [ ] **Step 6: Commit** `fix(structure): single long-lived Mol* plugin with queued loads` with the reproduction finding and the before/after chunk sizes in the body.

---

### Task 7: Model hook, load panel, drag and drop, header, display toolbar

**Files:**
- Create: `src/tools/structure/StructureModel.tsx`, `components/LoadPanel.tsx`, `components/DropOverlay.tsx`, `components/HeaderCard.tsx`, `components/DisplayToolbar.tsx`
- Modify (rewrite): `src/tools/structure/View.tsx`; rewrite `tests/app/structure.test.tsx`

**Interfaces:**
- Consumes: `load.ts`, `job.ts`, `MolstarHandle`, core types.
- Produces: `useStructureModel()` returning at least

```ts
{
  source: StructureSource | null; model: StructureModel | null; parsing: boolean; error: string;
  modelIndex: number; setModelIndex(i: number): void;
  interfaces: InterfacePair[] | null; metrics: StructureMetrics | null; cutoff: number; setCutoff(c: number): void;
  loadRcsb(id: string): Promise<void>; loadFile(file: File): Promise<void>;
  selection: SequenceSelection | null; setSelection(s: SequenceSelection | null): void;   // export interface SequenceSelection { labelAsymId: string; from: number; to: number } (label seq ids, inclusive)
  hovered: ResidueRef | null; setHovered(r: ResidueRef | null): void;
  viewer: MolstarHandle | null; setViewer(h: MolstarHandle): void;
  representation: Representation; setRepresentation(r): void; coloring: Coloring; setColoring(c): void;
}
```

Rules: URL state key `structure-viewer` keeps `{ pdbId: string }` with default `'1UBQ'`; on mount, `'1UBQ'` or `''` loads the demo, any other valid ID fetches it. Loading a file sets `pdbId: ''`. A failed load sets `error` and keeps the previous `source`/`model`. When `model` changes, call `viewer.load(source.text, format, name, modelIndex)`; when `modelIndex` changes, reload into Mol* and recompute interfaces/metrics. The whole tool root (both columns) is the drop target: `dragenter/dragover` (with `preventDefault`) show `DropOverlay` ("Drop a .cif, .pdb or .gz file"), `drop` takes the first file; leaving the window hides the overlay. One preset list (the existing seven, with names). `HeaderCard` shows title, method, resolution (`1.8 Å`), organisms, deposition date, entity/chain counts, and omits missing fields. `DisplayToolbar`: representation and colour selects, "Mol* panels" toggle, "Large canvas" toggle, model picker (only when `models.length > 1`, labelled `Model 1 of 38`), snapshot button (PNG named `{name}.png` via `src/lib/export`). Remove the duplicate header link and preset bar.

- [ ] **Step 1: Write failing tests** (`vi.mock('@/tools/structure/MolstarViewer')` with a fake that calls `onReady` with `vi.fn` methods; stub `fetch` to serve fixtures):
  - default render shows the header card title for 1UBQ and calls `handle.load` with format `'mmcif'` and label `'1UBQ'`;
  - typing `3kz5` + Enter fetches `…/3KZ5.cif` and the header shows `Structure of cdomain`;
  - firing `drop` with a `DataTransfer`-like object holding `3KZ5.cif` on the tool root loads it; `dragenter` shows the overlay text;
  - dropping a PNG shows an error alert and the 1UBQ header stays;
  - 1L2Y (via file) shows `Model 1 of 38`; picking model 2 calls `handle.load` with `modelIndex` 1;
  - changing colour to "Entity" calls `setColoring('entity-id')`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; typecheck, lint, test.
- [ ] **Step 5: Commit** `feat(structure): new load panel, drag and drop anywhere, header card and display toolbar`

---

### Task 8: Sequence panel with linked selection and FASTA export

**Files:**
- Create: `components/SequencePanel.tsx`, `components/EntityTable.tsx`; tests in `tests/app/structure-sequence.test.tsx`

**Interfaces:**
- Consumes: `useStructureModel` fields `model, selection, setSelection, hovered, viewer`; `toFasta`.

Behaviour: a chain picker (entities grouped: `Entity 1 · Protein sopB · chains A, B, C (3 copies)`; options per chain `A [auth E]`) shows one chain at a time, residues in rows of 50 with tick numbers every 10. Numbering toggle "auth / label" (default auth; unmodelled residues without auth numbers show label numbers greyed). Unmodelled residues lower-case, greyed, with `title="Not modelled"`; modified residues show the parent letter with a dot marker and `title="MSE (modified, parent MET)"`. Each residue is a button with an accessible name like `Residue E 27A GLY`. Click selects one residue; shift-click or pointer drag extends a range in the same chain; selection calls `viewer.select(refs)` and `viewer.focus(refs)` for the modelled residues in the range (unmodelled ones are skipped). `onResidueClick` from Mol* selects that residue in the strip, switching chain if needed and scrolling it into view; `onResidueHover` highlights it. Hovering the strip calls `viewer.highlight`. Export menu: Copy / Download `.fasta` for selection, chain, entity, all; a "Full / Modelled only" switch and, for modelled, "gaps as - / drop gaps". Copy confirmation text uses `role="status"`. `EntityTable` lists entities (kind, description, chains with auth IDs, length, modelled count) and replaces the old chain table, keeping a search box when there are more than 8 chains.

- [ ] **Step 1: Write failing tests** (3KZ5 loaded via the mocked viewer):
  - entity group label `Entity 1 · Protein sopB · chains A, B, C (3 copies)`;
  - chain C (auth A): residues 1–4 and 52 have `title="Not modelled"`;
  - clicking `Residue A 5 SER` then shift-clicking `Residue A 10 PHE` calls `select` with six `ResidueRef`s for `authAsymId: 'A'`; Copy selection writes `toFasta(m, { kind: 'range', labelAsymId: 'C', from: 5, to: 10 })` to the stubbed clipboard;
  - calling the fake viewer's `onResidueClick({ authAsymId: 'E', authSeqId: 20, insCode: '' })` switches to chain A and marks that residue selected (`aria-pressed="true"`);
  - minimal.cif: the MSE residue shows `M` with the modified title;
  - "Modelled only" + "drop gaps" downloads 47 residues for chain C.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; typecheck, lint, test.
- [ ] **Step 5: Commit** `feat(structure): sequence panel linked to Mol* with FASTA export`

---

### Task 9: Ligands, interfaces, metrics, export menu

**Files:**
- Create: `components/LigandList.tsx`, `components/InterfaceTable.tsx`, `components/MetricsRow.tsx`, `components/ExportMenu.tsx`; tests `tests/app/structure-facts.test.tsx`

**Interfaces:**
- Consumes: `model, interfaces, metrics, cutoff, setCutoff, viewer, source, modelIndex`; `writeMmcif`, `writePdb`.

Behaviour: `LigandList` groups by comp ID (name, count, chains), waters excluded with a line `221 waters hidden`; clicking a group focuses all its instances, clicking an instance focuses one. `InterfaceTable`: a cutoff number input (Å, 2–10, step 0.5, labelled "Contact cutoff (Å)"), one row per pair `A [auth E] ↔ B [auth B]: 12 + 11 residues`, click highlights both sides and focuses; Copy writes `A: E5, E8, …\nB: B12, …` using auth IDs and insertion codes. Shows a busy state while the worker runs. `MetricsRow` (below the sequence section): atoms, heavy atoms, residues, Rg, bounding box, for the selected model. `ExportMenu`: original file (exact text as loaded, `.cif` or `.pdb`, `.gz` sources saved decompressed), chain/entity as mmCIF or PDB (chain picker; PDB shows the `writePdb` warnings before download), FASTA all, PNG snapshot.

- [ ] **Step 1: Write failing tests:** 4HHB shows HEM group `PROTOPORPHYRIN IX CONTAINING FE` ×4 and `221 waters hidden`; interface rows exist for A↔B and none pair a chain with itself; changing the cutoff to 3.0 re-runs the job (row counts do not increase); exporting chain B of 3KZ5 as mmCIF downloads text that `parseMmcif` reads back as one chain; PDB export of a model with chain `AA` shows the truncation warning.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; typecheck, lint, test.
- [ ] **Step 5: Commit** `feat(structure): ligands, interface residues, metrics and export menu`

---

### Task 10: Science text, assurance, e2e suites, docs

**Files:**
- Modify: `src/tools/structure/science.ts`, `src/tools/assurance.ts`, `src/tools/registry.ts` (blurb), `tests/e2e/molstar-local.spec.ts` (selector), `tests/e2e/structure.spec.ts`, `tests/e2e/workers.spec.ts`

Copy:
- Registry blurb: `Mol* 3D viewer for mmCIF and PDB: RCSB fetch, drag-and-drop files, sequences linked to 3D, FASTA export, ligands and interface residues`; add keywords `mmcif`, `cif`, `fasta`, `interface`.
- `science.ts`: formulas Rg = sqrt((1/N) Σ ||r_i − r_c||²) over heavy atoms and the interface definition (residue pairs with any heavy atoms within the cutoff, default 4.5 Å); assumptions on full vs modelled sequence, modified-residue parents, first alt-loc, first model by default; references: Sehnal et al. 2021 (keep), Berman et al. 2000 (keep), wwPDB PDBx/mmCIF dictionary `https://mmcif.wwpdb.org/`. Drop the Kabsch/RMSD, H-bond and "DSSP ribbons" lines (the tool does not compute those). `verified: '2026-10-25'`.
- Assurance: `structure: { status: 'reference-tested', reviewed: '2026-10-25', scope: 'mmCIF and PDB parsing, full and modelled sequence extraction with modified-residue parents, FASTA export, interface residues and coordinate metrics; 3D rendering by Mol*.', verification: 'Reference fixtures from RCSB (1UBQ, 3KZ5 label/auth chains and unmodelled ends, 4HHB entities and ligands, 1L2Y models, a selenomethionine entry) with CIF/PDB parity and synthetic contact geometry; Mol* rendering is UI-tested only.' }`

- [ ] **Step 1: Add e2e** to `tests/e2e/structure.spec.ts` (fixtures routed as in Task 6): drop 3KZ5.cif via a synthetic `drop` event with a `DataTransfer` built in `page.evaluate` → header `Structure of cdomain` and `data-loaded-label="3KZ5"`; clicking `Residue E 20 …` in the strip changes the Mol* selection (assert via a `data-selection-count` attribute the viewer sets from Mol*'s selection manager); loading 4HHB.cif.gz parses in a worker (`page.on('worker')` URL matches `/parse\.worker/`). The 1JGQ responsiveness check is manual (Step 4), since e2e never uses the network and the file is too large to check in.
- [ ] **Step 2: Update** `molstar-local.spec.ts` selector to the new region label; run `npm run build && npm run e2e` → all suites pass (structure, molstar-local, workers, a11y light + dark, mobile at 390 px, smoke).
- [ ] **Step 3: Apply** the science, assurance and registry text; typecheck, lint, test.
- [ ] **Step 4: Manual check** with the Playwright browser: 1JGQ via fetch (live network allowed here, not in tests) stays smooth to rotate; record time-to-first-render before (main) and after, and the Mol* chunk sizes from Task 5/6, for the final report.
- [ ] **Step 5: Commit** `docs(structure): methods, assurance and e2e for structure viewer v2`
- [ ] **Step 6: Update memory** (`project_overview.md` / a new `structure-viewer.md` memory) with non-obvious findings: the reload-bug cause, the Mol* chunk name used by the PWA cache, fixture facts.
