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

1. **Fitting** (generalise the single x/y series to multi-series data, then add): Hill; enzyme inhibition (competitive / uncompetitive / non-competitive / mixed, global fit with model comparison); Morrison tight-binding; ITC one-site isotherm; global SPR/BLI across concentrations; logistic / Gompertz growth.
2. **Cell culture**: logistic / Gompertz growth curve fit (lag, mu_max, plateau), OD growth-curve import.
3. **Protein Workbench**: net charge vs pH curve.
4. **Cryo-EM**: import FSC curves from RELION STAR and cryoSPARC exports (0.143 / 0.5 crossings, resolution axis).
5. **Study design / stats**: paired and one-way ANOVA power, Bland-Altman method comparison. (Z' and Grubbs already exist in the plate-reader.)
6. **Sequence**: neighbour-joining tree with Newick export (from the identity matrix); silent restriction-site finder.
7. **Flow cytometry**: FCS 3.x parser with histogram, scatter, simple gates and population statistics.

## Suggested order

1. Web Workers for MSA and fitting.
2. Enzyme kinetics, then ITC / SPR fitting (reuse `core/fitting`, clear reference outputs for tests).
3. Project backup export and data provenance.
