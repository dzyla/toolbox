# Roadmap and ideas (2026-09-30)

Backlog from the repo review. Tick items as they land.

## Repo improvements

- [x] Mol* runs locally (lazy `molstar` chunk, cached on first use) instead of the molstar.org iframe.
- [x] Web Workers where measurement showed a cost: sequence matrix / MSA (40x400 aa: 1.8 s), DSF plate analysis (96x700: ~270 ms), cryo-EM template series (256 projections, pooled workers). `useWorkerCompute` in `src/lib`.
- [x] Measured and deliberately left on the main thread: curve fitting (<15 ms at n<=300), chromatogram parse/peaks (200k points: ~170 ms parse), plate-reader group stats.
- [ ] Parallelise MSA pairwise alignments across a worker pool (single worker today; Gotoh is already typed-array tight at ~14 ns/cell).
- [ ] Size caps with a visible message for very large MSA / MRC inputs.
- [ ] Split oversized views: `plate-reader/View.tsx` (2366 lines), `dsf/View.tsx` (2040), `sec/View.tsx` (1813), `plate/View.tsx` (1700), `cryoem/View.tsx` + `MrcViewer.tsx`. Logic already lives in `src/core`; extract hooks and panels.
- [ ] Coverage: add `vitest --coverage` with a threshold on `src/core`; decide whether `test:legacy` runs in CI or is deleted.
- [ ] Mobile-viewport smoke test for every tool (PWA phone use is a stated goal).
- [ ] Confirm every calculator-style tool uses `url-state.ts` so results are linkable.
- [ ] Data provenance: record source and version in `restriction-enzymes.json` and codon-usage tables; script refresh from REBASE / Kazusa / CoCoPUTs.
- [ ] Export / import all projects as one JSON backup (projects only live in browser storage).
- [ ] Move `legacy/` to a tag or branch once the science-audit fixes are confirmed ported.
- [ ] Generate a per-tool status table for the README from the assurance registry.

## New scientific tools

- **Enzyme kinetics** (partly present: `core/fitting` already has Michaelis-Menten, substrate inhibition and Lineweaver-Burk/Eadie-Hofstee diagnostics). Missing: competitive / uncompetitive / mixed inhibition models, Hill, global fitting across inhibitor concentrations.
- **ITC and SPR/BLI analysis**: ITC one- and two-site isotherms; global and heterogeneous-ligand sensorgram fitting (single-curve SPR association/dissociation fits already exist in `core/fitting`).
- **Mass spec**: mono / average mass, charge-state deconvolution, peptide mass matcher and fragment ions with ppm tolerance, crosslink and PTM tables.
- **SDS-PAGE / Western planning**: loading calculator, gel % vs MW resolution, transfer and antibody dilution planner.
- **Growth curves**: logistic / Gompertz fits, lag, doubling time, OD to cells (fits plate-reader tool).
- **Flow and imaging basics**: counting statistics, fluorescence calibration / MESF helper.
- **Sequence extras**: CRISPR gRNA design with off-target scoring (NGG and Cas12a PAMs); Golden Gate / MoClo with Type IIS overhang fidelity; silent restriction-site mutation finder; host codon optimisation with GC-window and rare-codon limits; NJ tree from the existing distance matrix with Newick export.
- **Protein extras**: net charge vs pH across pKa sets, disorder and secondary-structure propensity, native vs denatured extinction coefficient, aggregation-prone regions, hydropathy and helical wheel plots.
- **Structural / cryo-EM**: FSC and resolution conversions, dose and pixel-size calculators, defocus / CTF plots, grid-prep helper.
- **Stats and QC**: sample size for ANOVA and paired designs, outlier tests (Grubbs, ROUT), Bland-Altman and method comparison, Z'-factor.
- **Lab management**: freezer / plate inventory with barcodes, reagent expiry tracker, pipetting worklists exported for Opentrons or Tecan.

## Suggested order

1. Web Workers for MSA and fitting.
2. Enzyme kinetics, then ITC / SPR fitting (reuse `core/fitting`, clear reference outputs for tests).
3. Project backup export and data provenance.
