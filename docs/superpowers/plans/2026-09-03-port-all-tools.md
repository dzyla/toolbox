# Port all tools to Bio-Bench — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Each slice below is one subagent task in its own git worktree, branched from `port-all-tools`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every existing tool (everything with `status: 'porting'` in `src/tools/registry.ts`) runs natively in the new app with its science in `src/core`, reference-tested, with a Science panel, and no reference to `legacy/`. Planned tools stay untouched.

**Architecture:** Vertical slices. Each slice owns distinct directories under `src/core`, `src/data`, `src/tools`, and `tests/core`; the only shared file every slice edits is `src/tools/registry.ts` (its own entries only). Science is DOM-free and tested; views use the shared components from Phase 1.

**Tech Stack:** as Phase 1 (Preact, signals, Tailwind 4, Vitest, happy-dom). Charts: `src/app/components/LineChart.tsx`. Exports: `src/lib/export.ts`. Units: `src/core/units`. Protein basics: `src/core/protein`.

**Spec:** `docs/superpowers/specs/2026-09-02-bio-bench-rebuild-design.md` sections 3 to 9 (section 6 for the gel tool). Audit: `docs/science-audit-2026-09-02.md`. Legacy sources to port from: `legacy/*.html`, `legacy/*.js` (already science-fixed; port the fixed logic, not the bugs listed in the audit).

## Global Constraints (every slice)

- Read first: `CONTRIBUTING.md`, `src/tools/molarity/` (the template tool), `src/app/components/*`, `src/core/units/index.ts`, `src/core/protein/index.ts`, `src/lib/*`, `src/tools/registry.ts`.
- `src/core/**`: no DOM, no framework imports (ESLint enforces). Every exported function has a Vitest test in `tests/core/`. Every constant table has a `_source` field (JSON) or source comment (TS) naming publication or supplier document.
- Reference tests pin published values (ExPASy, NCBI, supplier PDFs, textbook examples). Where a value was computed rather than published, say so in a comment and show the derivation.
- Every tool ships a `science.ts` (`Science` object: formulas, assumptions, references with URLs, `verified: '2026-09-03'`) rendered through `SciencePanel`, and `ActionBar` with copy-with-method. Calculators use `useUrlState`; image tools use projects (`src/lib/projects.ts`) with autosave and thumbnails.
- UI: `ToolLayout` skeleton, `Quantity` for numbers with units, Tailwind classes matching the molarity tool, dark mode via `dark:` classes, keyboard operable, no information by colour alone. Errors render inline (`role="alert"`), never a blank result.
- Registry: change only your own entries: `status: 'ready'`, add `load: () => import('./<id>/View')`, keep ids. Do not touch other entries.
- Commit small and often on your branch with messages `feat(<area>): …`; run `npm run typecheck && npm run lint && npm run test:unit && npm run build` before each commit. Do not push. Do not edit `legacy/`.
- Done means: all checks green, the tool opens from Home, every feature listed in your slice works, and your final report lists the reference values your tests pin and anything you could not source.

---

## Task 1: Calculators — Buffers, Centrifuge, Master Mix, Ammonium Sulfate, Serial Dilution

**Owns:** `src/core/buffers/`, `src/core/centrifuge/`, `src/core/reactions/{mastermix,ammonium-sulfate,serial-dilution}.ts`, `src/data/chemicals.json`, `src/data/buffer-presets.json`, `src/tools/{buffers,centrifuge,master-mix,ammonium-sulfate}/`, and a new "Serial dilution" tab in `src/tools/molarity/`.
**Port from:** `legacy/bio_bench.html` (tabs buffer, utils, reactions, purify) and `legacy/labConstants.js` (chemical table, already audited).

- [ ] Chemicals data: convert `LAB_CONSTANTS.chemicals` to `src/data/chemicals.json` `{ _source, chemicals: [{ name, mw, type, synonyms?, hydrateOf?, waters?, notes? }] }`. Group hydrate variants: entries whose name contains "hydrate"/"anhydrous" get `hydrateOf` (base name) and `waters` (integer). Keep the audit's removals. Test: no duplicate names; all `mw > 0`; spot checks Tris 121.14, HEPES 238.30, MgCl2·6H2O 203.30, EDTA·2Na·2H2O 372.24, E-64 357.41, dTTP·2Na 526.13.
- [ ] `core/buffers/recipe.ts`: `solveRecipe(components, finalVolume_L) → rows`. Component kinds: solid `{ kind:'solid', mw, waters?, target: {value, unit} }` → grams; liquid stock `{ kind:'stock', stockConc, stockUnit ('M'|'mM'|'%'|'x'), target }` → volume via C1V1=C2V2 with unit-consistency checks (an 'x' stock needs an 'x' target; % needs %); `density` optional for liquids given in % v/v → mass. Errors are typed. Tests: 10 mM Tris in 500 mL from Tris base = 0.6057 g; 50 mM from 1 M stock into 100 mL = 5 mL; 1× from 10× into 1 L = 100 mL; % w/v 10 % in 500 mL = 50 g; hydrate double-count prevented (MgCl2·6H2O selected + waters ignored).
- [ ] `core/buffers/henderson.ts`: `ratioBaseAcid(pH, pKa)`, `pKaAtTemperature(pKa25, dpKadT, T)`; data for common buffers' pKa and dpKa/dT (Tris 8.06, −0.028/°C; HEPES 7.48, −0.014; MES 6.10, −0.011; MOPS 7.14, −0.015; PIPES 6.76, −0.0085; phosphate pKa2 7.20, −0.0028; source: Good et al. 1966 Biochemistry 5:467 and supplier tables). Tests pin these.
- [ ] Presets: port `PRESETS` from bio_bench (TE, TAE with 17.4 M acetic acid, TBE, PBS, TBS, LB…) into `src/data/buffer-presets.json` with sources; test TAE resolves to 1.14 mL/L glacial acetic acid.
- [ ] Buffers view: component table (chemical picker with synonym search and a hydrate chooser that never auto-picks silently; MW autofill; +waters disabled for hydrate-named entries), final volume, results table (g or mL per row), preset dropdown, optional PubChem MW lookup button (network; guarded, optional), pH helper (buffer, pKa at temperature, ratio). Copy/CSV export.
- [ ] `core/centrifuge/index.ts`: `rcf(rpm, r_mm) = 1.118e-6·r·rpm²`, `rpm(rcf, r_mm)`, `kFactor(rpm, rmax_mm, rmin_mm) = 2.53e11·ln(rmax/rmin)/rpm²`, `runTime(k, s_svedberg) = k/s` hours. Tests: 100 mm & 10 000 rpm → 11 180 g; round trip; k-factor example from Beckman (rotor with rmax 91.9 mm, rmin 35.9 mm at 50 000 rpm gives k ≈ 95). View: RPM↔RCF with radius in mm or cm (unit select), k-factor and pelleting time.
- [ ] `core/reactions/mastermix.ts`: components with per-reaction volume, n reactions, excess %, dead volume; returns per-component totals and water to volume. Tests from the legacy tab logic (`bio_bench.html` ~1997-2016). View: editable component table, CSV export.
- [ ] `core/reactions/ammonium-sulfate.ts`: `gramsToAdd(s1, s2, volume_L, temp: 25|0)` with 533/0.30 and 515/0.27 (EMBL table; Green & Hughes 1955); guards s2 ≤ s1 and ≥ 100. Tests: 0→50 % in 1 L at 25 °C = 313.5 g; 0 °C = 297.7 g. View with the temperature chooser labelled 25 °C / 0–4 °C.
- [ ] `core/reactions/serial-dilution.ts`: `plan({ startConc, factor, steps, wellVolume, }) → rows` with transfer = V/(f−1), diluent = V, and well-1 preparation volume = V + V/(f−1); tests f=2, V=100 µL. Add a "Serial dilution" tab to the Molarity tool.
- [ ] Registry: buffers, centrifuge, master-mix, ammonium-sulfate → ready.

## Task 2: Protein Workbench and Protein Concentration

**Owns:** `src/core/protein/{profiles,features,mass}.ts` (new files; you may add exports to `src/core/protein/index.ts` but do not change existing signatures), `src/core/spectro/`, `src/tools/{protein,protein-conc}/`, `src/data/protein/modifications.json`.
**Port from:** `legacy/protein_params.html` (all features), `legacy/bio_bench.html` "Protein Concentration & Mods" tab.

- [ ] `profiles.ts`: sliding-window hydropathy (Kyte-Doolittle, window default 9), per-residue charge (use `perResidueCharge`), FoldIndex (Prilusky 2005: 2.785·⟨H⟩ − |⟨q⟩| − 1.151, window **51** default, H normalised (KD+4.5)/9, charge from integer K/R/D/E counts as the server does), hydrophobic moment (Eisenberg 1984, δ = 100°, window 11; label the scale used), Chou-Fasman helix/sheet propensity windows (6/5). Tests: window averaging on a synthetic sequence; FoldIndex of poly-K is negative and of poly-L positive; moment of an ideal amphipathic helix (LKKLLKLLKKLLKL) exceeds that of poly-L.
- [ ] `features.ts`: tags/motifs scan from `src/data/protein/{tags,large-tags,motifs}.json` (fuzzy match for large tags: identity ≥ 90 % over the tag length using a simple sliding comparison), transmembrane candidates (KD window 19, threshold 1.6, merged segments), signal-peptide heuristic (as legacy, labelled candidate), user-supplied domain CSV (`name,start,end`). Tests: His6 found at the right position; TM segment found in a synthetic 23-residue hydrophobic stretch flanked by charged residues; overlapping motif merging.
- [ ] `mass.ts`: ESI charge ladder `(M + z·1.007276)/z` for z = 1..zmax; peptide mass matcher taking observed masses, tolerance in Da or ppm, mode M or [M+H]+, using monoisotopic masses from `digest`. Tests: [M+H]+ of GAGAGA = 403.1936; a 10 ppm window matches only the intended peptide.
- [ ] `modifications.json`: monoisotopic and average mass deltas with Unimod ids: phospho 79.9663/79.9799, acetyl 42.0106/42.0367, methyl 14.0157/14.0266, dimethyl, trimethyl, oxidation 15.9949/15.9994, carbamidomethyl 57.0215/57.0513, N-glycan core (HexNAc2Hex3) 892.3172, high-mannose (Man9) approx 1864.6, biotin 226.0776. Source Unimod. Test two values.
- [ ] `core/spectro/protein.ts`: `concentrationFromA280(A, eps, path_cm, dilution)` → M and g/L (needs MW); `bradfordFit(points)` / `standardCurve(points, model: 'linear'|'quadratic')` with R² and interpolation of unknowns (least squares implemented in core, no library). Tests: BSA 1 mg/mL, ε 43 824, MW 66 430 → A280 0.660; linear fit of exact points recovers slope/intercept; quadratic fit of a parabola.
- [ ] Protein Workbench view: FASTA textarea + file upload (multi-entry), per-entry result card (MW avg and mono, pI with scheme selector Bjellqvist/EMBOSS applied everywhere, net charge at chosen pH with slider, ε native/denatured with units and Abs 0.1 %, instability with verdict, aliphatic, GRAVY, formula, half-life with organism selector labelled "mammalian reticulocytes in vitro" etc.), residue composition table (all letters present, percentages summing to 100), ambiguous-residue warning, plots via `LineChart` (hydropathy, charge, FoldIndex, moment, helix/sheet; window controls), feature map (SVG track with tags/motifs/TM/domains; toggles), digest table (protease select, missed cleavages, avg and mono masses, pI) with mass matcher, ESI ladder, CSV export of summary and digest, copy-with-method. Sequence cleaning report (what was removed).
- [ ] Protein Concentration view: A280 → concentration with ε (typed or from a sequence via core/protein), path length, dilution factor; standard-curve tab (paste concentration/absorbance pairs, fit, read unknowns).
- [ ] Registry: protein, protein-conc → ready.

## Task 3: Nucleic Acids, Sequence Viewer & Tools, Cryo-EM

**Owns:** `src/core/nucleic/`, `src/core/cryoem/`, `src/data/{codon-tables,restriction-enzymes,nn-santalucia}.json`, `src/tools/{nucleic,sequence,cryoem}/`.
**Port from:** `legacy/bio_bench.html` (Nucleic Acids, Sequence Viewer React component, Cryo-EM tab), `legacy/text_counter.html` (revcomp/GC/Tm bits).

- [ ] `nucleic/sequence.ts`: `cleanNucleic`, `detectType` (DNA/RNA/protein heuristic), `reverseComplement` (IUPAC-aware: N,R/Y,K/M,S,W,B/V,D/H), `gcContent`, `translate(seq, table, frame)` for frames ±1..3 with NCBI translation tables 1, 2, 4, 11 from `codon-tables.json` (source NCBI), `findOrfs(seq, minLength, table)` both strands, `restrictionSites(seq, enzymes)` with ~40 common enzymes (EcoRI GAATTC, BamHI GGATCC, HindIII AAGCTT, NdeI CATATG, XhoI CTCGAG, NcoI CCATGG, NotI GCGGCCGC, XbaI TCTAGA, SalI GTCGAC, KpnI GGTACC, SacI GAGCTC, PstI CTGCAG, SmaI CCCGGG, EcoRV GATATC, BglII AGATCT, SpeI ACTAGT, NheI GCTAGC, BsaI GGTCTC(1/5), BbsI GAAGAC(2/6), … source REBASE, include cut offsets and overhang type), degenerate sites supported. Tests: revcomp of ATGCN → NGCAT; translation of ATGGCCTGA → MA*; ORF finding on a synthetic sequence; EcoRI found at the right 1-based position on both strands.
- [ ] `nucleic/quant.ts`: `massConcToMolar(ng_per_uL, length, type)` using per-nucleotide averages (dsDNA 617.96 g/mol/bp average incl. counter-ions? state the convention: use 650 g/mol/bp for dsDNA, 330 ssDNA, 340 ssRNA as NEB/Thermo, and document); `a260ToConc(A260, type, dilution, path)` with 50/33/40 µg/mL; `copyNumber(ng, length_bp)` = ng×1e-9/(length×650)×6.022e23; `oligoMass(seq, type)` exact anhydrous mass from nucleotide residue masses (dA 313.21, dC 289.18, dG 329.21, dT 304.20; rA 329.21, rC 305.18, rG 345.21, rU 306.17; minus 61.96 for the 5'-OH/3'-OH ends — state the convention; source IDT). Tests pin these numbers.
- [ ] `nucleic/tm.ts`: Wallace (`2(A+T)+4(G+C)` for < 14 nt), Marmur-style basic (`64.9 + 41(G+C−16.4)/N`), nearest-neighbour (SantaLucia 1998 PNAS 95:1460 ΔH/ΔS table in `nn-santalucia.json`, initiation, terminal AT penalty, symmetry correction) with Owczarzy 2004 Na⁺ correction and optional Mg²⁺ (Owczarzy 2008), primer and Na⁺ concentration inputs. Tests: table entries AA/TT ΔH −7.9 kcal/mol ΔS −22.2 cal/mol/K, GC/CG −9.8/−24.4, CG/GC −10.6/−27.2; Tm of a self-complementary 12-mer computed by hand in the test comment; if `python3 -c "import Bio"` works (try `pip install biopython` in a venv), pin Biopython `Tm_NN` values for three primers and cite them.
- [ ] `cryoem/index.ts`: port the legacy functions (Nyquist = 2·px, box Å = px·box, crop box, required box for a target pixel size rounded up to the next even 2·3·5·7-smooth number, binning that keeps boxes even) plus dose: `dosePerFrame(rate_e_per_px_per_s, exposure_s, px_Å) = rate·t/px²`, total dose and frames; magnification↔pixel size (`px = physical_px / mag`). Tests from the legacy numbers and simple hand values.
- [ ] Nucleic Acids view: conversions (ng/µL ↔ nM with type and length), A260 to concentration, copy number, oligo mass, Tm (three methods with their assumptions shown; NN with salt inputs; hide NN/Wallace when N is outside their range and say why).
- [ ] Sequence Viewer & Tools view: port the React sequence viewer (editing, tooltips, colour schemes, feature highlighting) to Preact; add DNA/RNA mode: revcomp, translation in six frames, ORF table, GC plot (`LineChart`, window slider), restriction map (SVG track + table), FASTA import/export, protein stats via `core/protein` when protein.
- [ ] Cryo-EM view: port the parameters tab with the new dose and magnification calculators.
- [ ] Registry: nucleic, sequence, cryoem → ready.

## Task 4: Alignment

**Owns:** `src/core/align/`, `src/data/matrices.json`, `src/tools/align/`.
**Port from:** `legacy/bio_align_engine.js` (traceback already fixed; port the fixed version) and the alignment UI in `legacy/bio_bench.html` (tab-align).

- [ ] `matrices.json`: BLOSUM45, BLOSUM62, PAM250 from legacy (verified), **BLOSUM80 and PAM30/PAM70 transcribed from NCBI** (https://ftp.ncbi.nih.gov/blast/matrices/), EDNAFULL. Test: every matrix symmetric; spot values (BLOSUM80 W-W 11? verify from the file: BLOSUM80 W-W = 16 in the 1/3-bit NCBI version, A-A 7, R-R 9; record which scaling you used); row checksums for BLOSUM62 against NCBI.
- [ ] `align/gotoh.ts`: global, local and **semi-global** (free end gaps) affine alignment; returns score, aligned strings, start indices, identity/similarity/gaps over alignment columns (labelled convention), and a midline. Tests: the Phase 0 invariant (re-score of traceback equals score) on 300 random pairs for all three modes; comparison with an independent straightforward Gotoh reference in the test on 100 pairs; classic textbook example (GATTACA/GCATGCU with match 1, mismatch −1, gap −1 global score 0 using a simple linear-gap matrix path).
- [ ] View: two sequence inputs (FASTA or raw; auto DNA/protein), matrix and gap parameters, mode selector, result rendered as wrapped aligned blocks with a midline and colour by score class (plus shape/letter cues), statistics, copy as CLUSTAL/FASTA, export.
- [ ] Registry: align → ready.

## Task 5: Binding Calculator

**Owns:** `src/core/binding/`, `src/tools/binding/`.
**Port from:** `legacy/binding_engine.js` (fixed solvers) and `legacy/binding_calculator.html`.

- [ ] `binding/equilibrium.ts`: Morrison closed form for 1:1 plus the bisection n-mer solver, stepwise Adair with α, `targetLigand` (exact), species table, ΔG in kJ/mol and kcal/mol, Cheng–Prusoff Ki (labelled competitive only, units check), `hillSeries` computed on **free** ligand with a least-squares Hill slope over 0.1 < θ < 0.9, kinetics: `kd = koff/kon`, `tHalfObs = ln2/(kon·L + koff)`, association/dissociation time courses. Tests: Morrison vs bisection to 1e-6; α=1 reduces to binomial; α=0.1 P0 = 0.307, P2 = 0.456 (P=10, L=50, Kd=100 nM, n=2); target solver round trip; Hill slope of a non-cooperative curve is 1.00 ± 0.01; ΔG(100 nM, 25 °C) = −39.96 kJ/mol = −9.55 kcal/mol; Ki example.
- [ ] View: port all panels (inputs with mass/molar mode and MW validation, model choice, results tiles from exact species, species table, saturation curve with freeze-reference that stores raw nM values and re-renders in current units, species landscape, Hill plot on free ligand disabled in threshold mode with an explanation, target occupancy solver, Ki calculator, mixing helper, serial dilution planner using the chosen factor, kinetics panel). Charts via `LineChart` with log-x option.
- [ ] Registry: binding → ready.

## Task 6: Gel / Blot (overhaul, spec section 6)

**Owns:** `src/core/gel/`, `src/data/ladders.json`, `src/lib/image.ts`, `src/tools/gel/`. Add dependency `utif` (TIFF decode) via `npm install utif` and `@types/utif` if available.
**Port from:** `legacy/gel_annotator.html` only for ideas; this is a rewrite per the spec.

- [ ] `lib/image.ts`: decode PNG/JPG (canvas) and TIFF 8/16-bit (utif) into `{ width, height, data: Float32Array (luminance, 0..1), bitDepth, original: Blob }`; camera/file/drag-drop inputs handled in the view.
- [ ] `core/gel/lanes.ts`: vertical intensity projection with smoothing, valley finding for lane boundaries, equal-spacing generator, lane rectangles with tilt. `core/gel/profile.ts`: lane profile (mean across lane width per row), peak detection with prominence and width, band bounds. `core/gel/background.ts`: rolling-ball (approximate via min filter + smoothing over a radius), valley-to-valley baseline, ROI subtraction. `core/gel/quant.ts`: integrated intensity raw/background/net, % of lane, ratio to reference band or lane, saturation fraction, polarity detection. `core/gel/calibration.ts`: fits of log10(size) vs migration: linear, piecewise linear, cubic spline (natural), with R² and residuals, `sizeAt(y)`. Tests on **synthetic gels** rendered in the test (Gaussian bands on a gradient background with noise, known positions and areas): lanes found within 2 px, peaks within 1 px, net intensities within 5 % of truth, calibration recovers sizes within 3 %, saturation flagged when clipped.
- [ ] `ladders.json`: protein (Bio-Rad Precision Plus 250/150/100/75/50/37/25/20/15/10; Thermo PageRuler Plus 250/130/100/70/55/35/25/15/10; PageRuler unstained 200/150/120/100/85/70/60/50/40/30/25/20/15/10; SeeBlue Plus2 250/148/98/64/50/36/22/16/6/4; Spectra Multicolor Broad 260/140/100/70/50/40/35/25/15/10; NEB Color Prestained P7719 245/180/135/100/75/63/48/35/25/20/17/11) and DNA (NEB 1 kb N3232 10002/8001/6001/5001/4001/3001/2000/1500/1000/517+500; NEB 100 bp N3231 1517/1200/1000/900/800/700/600/500/400/300/200/100; Thermo GeneRuler 1 kb SM0311 10000/8000/6000/5000/4000/3500/3000/2500/2000/1500/1000/750/500/250; GeneRuler 100 bp SM0241 1000/900/800/700/600/500/400/300/200/100; NEB 1 kb Plus N3200 10000/8000/6000/5000/4000/3000/2000/1500/1200/1000/900/800/700/600/500/400/300/200/100; λ HindIII 23130/9416/6557/4361/2322/2027/564/125) with supplier URLs as `_source`; user-defined ladders saved in localStorage `bb.ladders`. Test: every ladder strictly descending, values match the entries above.
- [ ] View (`src/tools/gel/View.tsx` plus components): canvas editor with pan/zoom; import (file, drag-drop, camera, TIFF); non-destructive adjustments (levels, gamma, invert, rotate by dragging a line along the well row, crop, flip) — quantification always on raw; lanes (auto/N/manual, draggable), ladder assignment (lane pick, ladder pick, auto-detected bands assigned top-down, drag to fix, calibration model selector with R²), hover shows estimated size, band detection per lane with adjustable sensitivity, band table (raw/background/net/% lane/normalised to chosen reference) with saturation warnings, annotations (text, arrows, lines, boxes, brackets, lane labels, MW ticks generated from ladder, panel letters; select/move/delete/duplicate; style presets), export PNG at DPI, SVG (image embedded + vector annotations), CSV (with method header), project autosave to IndexedDB with thumbnail, export/import project file. Undo/redo (state history).
- [ ] Science panel per spec: relative quantification, linear range, saturation, compare within a gel.
- [ ] Registry: gel → ready (hasProjects stays true). Commit after each stage; if you must stop early, the tool must still be usable at its current stage and the report must say what is missing.

## Task 7: Figure Colours

**Owns:** `src/core/colors/`, `src/tools/colors/`. Add `d3-scale-chromatic` and `d3-color` (+ types).
**Port from:** `legacy/color_generator.html`.

- [ ] `core/colors`: palette sampling from d3 interpolators (sequential, diverging, cyclical, categorical), colour-blind simulation (protanopia/deuteranopia/tritanopia/achromatopsia matrices from Machado 2009 or the Viénot 1999 matrices, cite), tints/tones/shades, contrast ratio (WCAG), PyMOL `set_color` export and matplotlib list export. Tests: simulation matrices applied to pure red give expected approximate values; contrast ratio of black/white = 21; PyMOL string format.
- [ ] View: scheme groups, count, swatches with hex copy, simulation toggles side by side, variations panel, exports.
- [ ] Registry: colors → ready.

## Task 8: Integration

- [ ] Merge each slice branch into `port-all-tools`, resolve `registry.ts` and `package.json` conflicts, run the full suite and e2e, fix cross-slice issues, update `tests/e2e/smoke.spec.ts` to open every ready tool and check for page errors, then merge to main.
