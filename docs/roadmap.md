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

## Buffer tool v2 (2026-10-01)

Delivered:
- [x] Buffer rows inside the recipe table (design to a pH by acid/base titration or by mixing two forms, or a premade pH'd stock as a plain dilution).
- [x] Predicted pH at the working temperature, with a one-click fix.
- [x] Davies ionic-strength correction (on by default, toggle in the header).
- [x] 13 buffer systems with per-step pKa and dpKa/dT.
- [x] `Set pH...` on a matching salt or stock row turns it into a buffer row.

Fixed in the final branch review (2026-10-01):
- [x] **The Davies correction now saturates at 0.5 M instead of being extrapolated.** `daviesF(I)` peaks near I = 0.4 M and crosses zero at I ≈ 1.94 M, so above that the activity term reversed sign and grew without bound. `pKaIonicShift` clamps I to `DAVIES_LIMIT_M = 0.5` (exported from `speciation.ts`; `mixture.ts` imports it rather than keeping its own copy). 50 mM sodium phosphate pH 7.4 + 2 M NaCl used to come out 58.1 % dibasic — a buffer that really reads pH 6.74 — and is now 80.1 % dibasic, above the 77.8 % no-salt split, as the ionic correction requires. The >0.5 M warning (and the premade-stock variant) now say the correction is *held* at its 0.5 M value and that the component amounts, not only the predicted pH, are approximate.
- [x] **Unverified temperature coefficients are visible in the UI.** `BufferReport.temperatureCorrected` carries `temperatureData` from the step nearest the set pH, and `PhCheck` says that the buffer has no published dpKa/dT and that the pH at the working temperature is not corrected, whenever that step lacks data and the working temperature differs from the temperature the pH was set at. CAPS at 10.4 used to report a drift of +0.002 at 4 °C with no flag, reading as a positive claim that it does not move; the real buffer is near pH 11. No coefficient was invented.
- [x] **Provenance is shown, not just stored.** The selected system's `source` is rendered under the buffer-system select, so a bench scientist can see which of the 12 still-unverified constants they are relying on.
- [x] **Ionic strength counts the starting form's spectator ions.** `bufferIonicStrength` takes the weighed form's `protonsRemoved` for design/titrate rows and computes `I = 0.5·C·(Σ f z² + |z0 − p_form| + |m − p_form|)`; premade stocks and two-form mixtures keep the minimum-counter-ion model (a stock's route is unknown; a mixture carries exactly the minimum). 50 mM Tris pH 8.5 from Tris-HCl is now I = 0.050 M instead of 0.0145 M, and no longer reports the same number as the Tris-base route; 100 mM citrate pH 5 from trisodium citrate is 0.411 M instead of 0.308 M.
- [x] **The ionic-strength line no longer lies by omission.** It is suppressed when nothing was counted (LB Miller printed "Ionic strength about 0 M"), and any excluded component is named in the copy text and in the recipe sheet (PBS 1× prints 0.14 M and now says it excludes both phosphates; the truth is ≈ 0.164 M).

Not done:
- [ ] Buffer-capacity plot.
- [ ] Multi-buffer pH optimisation.
- [ ] Converting presets once they carry a pH.
- [ ] A verified primary source for every dpKa/dT flagged `temperatureData: false`. Several table values could not be verified online and still need a primary source: dpKa/dT for Tris, MOPS, PIPES, Tricine, imidazole and phosphate step 2; pKa for CAPS, imidazole, acetate, citrate, phosphate and PIPES step 1. CAPS, CHES, acetate and citrate are the ones a user is most likely to notice, because the UI now tells them the pH is not temperature-corrected (CAPS ≈ −0.03/°C in supplier tables, still unconfirmed against a primary source).
- [ ] An ionic-strength model for the salts outside the `SALTS` table (phosphate and other polyvalent salts entered as plain solids, % w/v salts). They are now named as excluded rather than silently dropped, but PBS 1× still reports 0.14 M where the truth is ≈ 0.164 M.
- [ ] A Pitzer or extended Debye–Hückel treatment so high-salt buffers (≥0.5 M) get a real correction rather than the held 0.5 M value.
- [ ] The Sambrook and Russell phosphate-table citation was dropped from the science panel because it could not be confirmed; re-add it once checked against the book.

## Suggested order

1. Web Workers for MSA and fitting.
2. Enzyme kinetics, then ITC / SPR fitting (reuse `core/fitting`, clear reference outputs for tests).
3. Project backup export and data provenance.
