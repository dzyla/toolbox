# Roadmap and ideas (2026-09-30)

Backlog from the repo review. Tick items as they land.

## Repo improvements

- [x] Mol* runs locally (lazy `molstar` chunk, cached on first use) instead of the molstar.org iframe.
- [x] Web Workers where measurement showed a cost: sequence matrix / MSA (40x400 aa: 1.8 s), DSF plate analysis (96x700: ~270 ms), cryo-EM template series (256 projections, pooled workers). `useWorkerCompute` in `src/lib`.
- [x] Measured and deliberately left on the main thread: curve fitting (<15 ms at n<=300), chromatogram parse/peaks (200k points: ~170 ms parse), plate-reader group stats.
- [ ] Parallelise MSA pairwise alignments across a worker pool (single worker today; Gotoh is already typed-array tight at ~14 ns/cell).
- [x] Size caps with a visible message for very large MSA / cryo-EM template inputs.
- [x] Split oversized views into `<Tool>Model.tsx` (state, memos, handlers) plus `tabs/*Panel.tsx`: plate-reader, dsf, fitting, protein, tags, culture. Remaining: `plate/View.tsx` (early return before the main JSX), `sec/View.tsx` (many panels in one file), `cryoem/View.tsx` + `MrcViewer.tsx`; the largest panels (`dsf/tabs/ResultsPanel.tsx`, `tags/tabs/ResultsPanel.tsx`) could be split again.
- [x] Coverage: `npm run test:coverage` (v8, `src/core`) with floors just under the 2026-09-30 baseline (lines 91, statements 89, functions 94, branches 76); runs in CI. Added parameter-recovery tests for every fit model, colony detection on a synthetic plate, PCR/primer output. `test:legacy` is still not in CI. Note: `src/core/cloning/pcr.ts` (`amplify`) has no importers.
- [x] Mobile smoke test (`tests/e2e/mobile.spec.ts`): every ready tool at 390 px, touch enabled, no page errors, no content past the viewport outside a scroll container (html/body clip overflow, so `scrollWidth` alone can't detect it).
- [ ] Confirm every calculator-style tool uses `url-state.ts` so results are linkable.
- [ ] Data provenance: record source and version in `restriction-enzymes.json` and codon-usage tables; script refresh from REBASE / Kazusa / CoCoPUTs.
- [x] Export / import all projects as one JSON backup (Home page; restore keeps newer local work).
- [ ] Move `legacy/` to a tag or branch once the science-audit fixes are confirmed ported.
- [ ] Generate a per-tool status table for the README from the assurance registry.

## New scientific tools (agreed scope, 2026-09-30)

Guiding rule: each tool stays small and easy to use (one clear flow, example data, advanced options collapsed), and every result carries its formula, assumptions and references.

Dropped: mass-spec deconvolution, SDS-PAGE/Western planning, MESF calibration, gRNA design, Golden Gate fidelity, codon optimisation, aggregation scoring, helical wheel, lab inventory/expiry (needs a database), grid-prep helper. Better secondary-structure prediction would need a protein language model; out of scope.

Status (2026-09-30):
1. **Fitting**: done. Levenberg–Marquardt solver (`core/fitting/nls.ts`); Hill, Gompertz/logistic/Baranyi growth in the curve fit; analysis modes for global enzyme inhibition with AICc comparison + Morrison, ITC one-site, global SPR/BLI 1:1. Not done: ITC two-site/competition, SPR heterogeneous ligand / mass transport, Hill-type global fits.
2. **Cell culture**: hands 6+ observations to the growth-curve fit (Gompertz) from the doubling-time tab. OD import from the plate reader is not done (the plate reader has no kinetic read format).
3. **Protein Workbench**: net charge vs pH curve: done.
4. **Cryo-EM**: FSC import (RELION STAR, delimited/cryoSPARC-style): done; formats are untested on real cryoSPARC exports.
5. **Study design / stats**: paired and one-way ANOVA power (exact noncentral t/F), Bland-Altman tool: done.
6. **Sequence**: NJ tree + Newick in the identity-matrix tool, silent restriction-site finder: done.
7. **Flow cytometry**: FCS parser, histogram/scatter, gates, statistics: done; arcsinh instead of logicle.

## Suggested order

1. Web Workers for MSA and fitting.
2. Enzyme kinetics, then ITC / SPR fitting (reuse `core/fitting`, clear reference outputs for tests).
3. Project backup export and data provenance.
