# Structure fixtures

Real files come from RCSB (https://files.rcsb.org/download/, downloaded 2026-10-25) and are
treated as data only. Synthetic files are hand-written for parser edge cases.

| File | Source | Why |
| --- | --- | --- |
| `1UBQ.cif`, `1UBQ.pdb` | RCSB 1UBQ (ubiquitin, 1.8 A) | Small single chain, waters; same entry in both formats to cross-check the readers. Also the bundled demo (`src/tools/structure/demo/1ubq.cif`). |
| `3KZ5.cif`, `3KZ5.pdb` | RCSB 3KZ5 | Protein with ligands/hetero groups; same entry in both formats. |
| `4HHB.cif.gz` | RCSB 4HHB (haemoglobin) | Multi-entity, multi-chain tetramer with HEM ligands. Gzipped (read via `read()` helper). |
| `1L2Y.cif.gz` | RCSB 1L2Y (Trp-cage, NMR) | 38 NMR models: exercises multi-model tables. Gzipped. |
| `1CRN.cif.gz`, `1AKI.cif.gz` | RCSB 1CRN (crambin), 1AKI (lysozyme); 1AKI downloaded 2026-10-26 | Preset entries served by the e2e RCSB route (`tests/e2e/structure.spec.ts`). Gzipped. |
| `semet.cif.gz` | RCSB 3HUE (S. pombe Nbs1 FHA-BRCT1-BRCT2, X-ray 2.8 A, selenomethionine) | Real MSE (modified residue, parent MET) case. Chosen from an RCSB search (chem comp MSE, X-RAY DIFFRACTION, < 2500 atoms) as the smallest gzip (~77 KB) with 8 MSE residues. Gzipped. |
| `edge-cases.cif` | synthetic | Two data blocks; multi-line `;` text field; single/double quoted values with spaces and embedded quotes (`'five'-O-methyl'`, `"O5' "`, `'N''-ACETYL'`); `?` and `.` values; comment inside a loop. |
| `minimal.cif` | synthetic | Only an `_atom_site` loop (no entity categories), chains A and B, one MSE residue. Chain A has `label_seq_id` 1-5; chain B has `label_seq_id` as `.` (exercises the path without label_seq_id) and auth numbering 1-3 then 7-9 (a gap). |
| `insertion.cif` | synthetic | One chain with auth numbering 26, 27, 27A, 27B, 28 via `pdbx_PDB_ins_code` (label_seq_id 1-5). |

`tests/core/structure-helpers.ts` exports `read(name)`, which reads from this directory and
gunzips `.gz` files.
