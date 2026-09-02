# Science audit — 2026-09-02

Every calculation in the suite was checked by reading the code and running the
extracted functions in node against reference values (ExPASy ProtParam for hen
lysozyme and insulin B chain, NCBI matrices, an independent Gotoh implementation,
closed-form Morrison/Adair solutions, supplier MW data).

Legend: **WRONG** = produces incorrect numbers today; **SUSPICIOUS** = correct
in a narrow case but misleading or undocumented; OK = verified correct.

## 1. Confirmed bugs (fix first)

| # | Tool | Location | Problem | Fix |
|---|------|----------|---------|-----|
| 1 | Bio-Bench RPM↔RCF | `bio_bench.html:1940,1949`, label `:563`, `labConstants.js:311` | Constant 1.118e-5 is for radius in **cm**, input is labelled **mm** → RCF is **10× too high** (r=100 mm, 10 000 rpm → shows 111 800 g, true 11 180 g). | Use 1.118e-6 for mm (or relabel input as cm). |
| 2 | Protein Workbench instability index | `definitions.js:23-48` | DIWV table: **0 of 400 entries** match Guruprasad, Reddy & Pandit 1990. Lysozyme II shows −7.30, correct 16.09. Negative II is impossible for real proteins. Commit "fix DIWV scientific bug" did not fix it. | Replace with the Guruprasad table (Biopython `Bio.SeqUtils.ProtParamData.DIWV` is a verbatim copy). |
| 3 | Protein Workbench "Bjellqvist (Expasy)" pKa set | `definitions.js:7-8`, `protein_params.html:312-316` | Values are EMBOSS with ad-hoc tweaks, not Bjellqvist. Lysozyme pI 9.15 vs ExPASy 9.32; insulin B 7.41 vs 6.90. Real Bjellqvist: N-term 7.5 (residue-specific: A 7.59, M 7.0, S 6.93, P 8.36, T 6.82, V 7.44, E 7.7), C-term 3.55 (D 4.55, E 4.75), K 10.0, R 12.0, H 5.98, D 4.05, E 4.45, C 9.0, Y 10.0. | Implement true Bjellqvist (needs sequence, not just counts). Keep EMBOSS as a separate, correctly labelled set. |
| 4 | Protein Workbench ε toggle | `protein_params.html:882-883,953` | "Unfolded (Edelhoch)" / "Folded (Guess +5%)" is inverted and invented. Pace 1995 values (5500/1490/125) are **native**; denatured (6 M GdnHCl) are W 5685, Y 1285, cystine 125. | Two real sets: Native (Pace 1995) and Denatured 6 M GdnHCl. |
| 5 | Bio-Bench TAE preset | `bio_bench.html:1534` | Acetic acid liquid stock uses `mw: 60.05` as stock concentration → treated as 60.05 M (glacial is 17.4 M). Gives 0.333 mL/L; correct 1.14 mL/L. | `mw: 17.4` or make it a solid entry. |
| 6 | Alignment global traceback | `bio_align_engine.js:157-176, 253-281` | Border backtrack cells never set; ~35 % of random global alignments throw or emit "undefined". Exception is inside `setTimeout` so the user sees nothing. | Handle borders: if i===0 force gap state 2, if j===0 force state 1; loop `while(true)` and break at (0,0). |
| 7 | Alignment local traceback | `bio_align_engine.js:253` | `M[i][j] > 0` exit test evaluated while in a gap state → ~23 % of gapped local alignments are truncated; shown alignment does not re-score to the reported score. | Test `M[i][j] === 0` only when state === 0. |
| 8 | BLOSUM62 typo | `bio_align_engine.js:35` | Y→Z = −3, should be −2 (asymmetric). | Fix entry. |
| 9 | PAM250 typo | `bio_align_engine.js:89` | Z→P = −1, should be 0. | Fix entry. |
| 10 | BLOSUM80 option | `bio_bench.html:794` | Listed in dropdown, not in engine → silent failure. | Add matrix or remove option. |
| 11 | Binding calc result tiles | `binding_calculator.html:918-923` | Tiles use binomial (independent-site) formulas; ignore cooperativity α. Contradict the species table on the same page when α≠1. | Use `probs[0]`, `probs[n]`, `concs[0]` from the solver. |
| 12 | Binding calc target solver | `binding_calculator.html:1011-1021` | Same binomial inversion; "50 % with ≥1 P2" at α=0.1 actually gives 67 %. | Bisect on L_tot with the stepwise solver. |
| 13 | Gel densitometry region | `gel_annotator.html:783-786` vs `:581` | Display→source mapping omits crop offset → integrates the wrong part of the gel after any crop. | Add `gel.crop.x/y` to sx/sy. |
| 14 | labConstants MW | `labConstants.js:253` E-64 342.41 → **357.41**; `:178` dTTP·2Na 524.10 → **526.13**; `:26` Cholamine chloride 139.63 → 138.64; `:254` Agarose and `:259` Glycogen are polymers, not MWs; `:144` "EDTA 0.5 M soln" is not a solid; `:207` "L-Glutamate" is glutamic acid. | Correct / remove / rename. |
| 15 | Ammonium sulfate cut | `bio_bench.html:2042-2043`, labels `:651-652` | 0 °C constant is 515 not 516; labelled "4 °C". No guard for S2 ≤ S1 (negative grams). | Use 515, label "0–4 °C", guard. |

## 2. Suspicious / misleading

| Tool | Location | Issue | Fix |
|------|----------|-------|-----|
| Protein Workbench mass matcher | `protein_params.html:1010-1046`, `:1039` | Peptide masses are **average**; matcher uses 0.5 Da window against neutral M. MS reports monoisotopic [M+H]+; real peptides >800 Da will not match. Lys-C regex wrongly excludes K-P. | Add monoisotopic table, ppm tolerance, M vs [M+H]+ choice; drop K-P exception. |
| Protein Workbench FoldIndex | `protein_params.html:1180` | Window 15 (server default 51); fractional charge instead of integer counts → not comparable to FoldIndex server. | Window 51 or expose; document. |
| Protein Workbench hydrophobic moment | `:1180` | Uses Kyte-Doolittle, not Eisenberg consensus; absolute µH not literature-comparable. | Label the scale. |
| Protein Workbench pKa consistency | `:590-611` | Net-charge plot and FoldIndex always use the hard-coded hybrid set regardless of the pI selector. | Route through the selected set. |
| Protein Workbench ambiguous residues | `definitions.js:354`, `protein_params.html:717-724` | B/Z/X/J/U/O handled inconsistently and silently (MW placeholder 110, GRAVY counts 0, stats table omits them so % ≠ 100). | Warn per card; mark results approximate. |
| Bio-Bench synonym resolution | `bio_bench.html:1233,1315-1325` | Typing MgCl2 / CaCl2 / Na2HPO4 / TCEP / Sodium Acetate silently autofills the anhydrous/neutral form. Most labs stock hydrates. | Show a picker when a synonym maps to >1 entry. |
| Bio-Bench hydrate double count | `:1433` | Selecting "MgCl2 hexahydrate" and typing 6 in "+H2O" gives 311.4. | Disable +H2O when the entry name contains "hydrate". |
| Bio-Bench liquid stocks | `:1404-1420` | "x" stock with "mM" target silently treats mM as a fold factor; no density (glycerol 1.26 g/mL) so %v/v↔mM is impossible; % rows skipped unless MW>0. | Add "x" target unit, density field, relax MW guard for %. |
| Bio-Bench protein A280 | `:1657-1680` | No path-length or dilution-factor input. | Add both. |
| Bio-Bench Tm | `:1740-1741` | Basic Tm shown for any-length dsDNA; 50 mM Na+ assumption unstated. | Label "primer Tm, 50 mM Na+"; hide for N > ~50. |
| Bio-Bench dilution | `:1851-1853` | Output has no units; M2 > M1 gives negative diluent. | Add units and guard. |
| Bio-Bench serial dilution | `:2078`, `:693` | "Final volume per well" is volume after transfer-out; Well-1 prep volume not linked (should be V + V/(f−1)). | Fix labels and link. |
| Bio-Bench cryo-EM bin handler | `cBin` | `Math.round(rawBox/b)` can yield odd box sizes. | Snap with `findNextGoodBox`. |
| Bio-Bench modifications | `labConstants.modifications` | Never used; mixes mono/avg masses. | Wire in or delete. |
| Binding calc Hill plot | `binding_calculator.html:815-830` | Uses total not free ligand; meaningless in threshold signal mode; slope is a 3-point local difference. | Use free L and θ from solver; disable in threshold mode; LSQ slope over 0.1<θ<0.9. |
| Binding calc serial dilution | `:1062-1064,~1090` | `factor` set to 3 or 10 but never used; always 2-fold. | Use it or delete. |
| Binding calc mass mode | `:486-500` | MW = 0 silently converts everything to 0 nM. | Validate. |
| Alignment gap transitions | `bio_align_engine.js:186-199` | No X↔Y transitions; wrong optimum only when 2·gapOpen > worst mismatch. | Add transitions or document. |
| Alignment identity % | `bio_bench.html:844-845` | Denominator = alignment columns incl. gaps (EMBOSS convention), unlabelled. | Label. |
| Gel ladder | `gel_annotator.html:800-823, 808` | Two-point log-linear interpolation; single hard-coded Precision Plus ladder; no DNA ladders; first click must be the top band but the prompt does not say so. | Ladder library (protein + DNA), multi-band piecewise interpolation, clear prompts. |
| Gel densitometry signal | `:789-796` | Integrates display-adjusted (levels/contrast/equalised) pixels; no background subtraction; assumes dark-on-light; Invert is CSS-only so fluorescence gels give inverted numbers; no saturation warning; fractional coords. | Integrate raw canvas, background ROI, respect polarity, saturation warning, round coords. |

## 3. Verified correct

Amino-acid average masses (all 20 + water); ε280 (Pace 1995) and cystine count; Abs 0.1 %; A280→mg/mL and µM; EMBOSS pKa set; pI bisection; net-charge Henderson–Hasselbalch; instability formula (table aside); aliphatic index; Kyte-Doolittle + GRAVY; atomic formula incl. Sec/Pyl; N-end-rule half-life tables (60 entries); Chou-Fasman propensities; ESI charge ladder; digest cleavage sites; TM/signal-peptide heuristics; buffer solid mass incl. hydrates; % w/v; liquid C1V1=C2V2; Henderson–Hasselbalch ratio; NA ng/µL→nM (650/330/340 approximations); Wallace and Marmur Tm formulas; cryo-EM Nyquist / box / crop / required-box with smooth-number rounding; dilution; molarity solver with SI prefixes; k-factor; master mix with excess and dead volume; 25 °C ammonium-sulfate constants; serial dilution transfer volume; ~95 % of labConstants MWs (Tris, HEPES, MES, NaCl, KCl, MgCl2·6H2O, CaCl2·2H2O, EDTA·2Na·2H2O, DTT, TCEP-HCl, imidazole, glycerol, sucrose, glucose, urea, GuHCl, SDS, (NH4)2SO4, PMSF, IPTG, phosphates, Good's buffers, detergents, antibiotics, cofactors); binding unit conversions; Morrison 1:1 with depletion (bisection matches closed form to 3e-8); n-mer single step; Adair stepwise with α; species table; ΔG = RT ln Kd; Cheng–Prusoff; mixing helper; BLOSUM45; BLOSUM62/PAM250 apart from the two typos; Gotoh affine DP scores (global 108/108, local 2000/2000 vs independent implementation); gel display/export scaling and rotation.

## 4. Not present (features the copycat or a lab user would expect)

A260 conversions (50/40/33 µg/mL), copy number, exact oligo mass, nearest-neighbour Tm with salt correction, DNA reverse-complement / translation / GC / ORF / restriction sites (Sequence Viewer is protein-only), Bradford/BCA standard curves, cryo-EM dose/defocus/magnification, binding kinetics (kon/koff/t½), ternary/competition models, MW-from-migration on gels, lane profiling, ladder library, colony counting, hemocytometer, plate layouts, timers, protocols, cell-culture seeding/passaging.

## 5. Non-science engineering findings

- No tests, no build, no license file, no package.json.
- Every page loads Tailwind from the play CDN (not for production), Google Fonts, D3, Chart.js; Bio-Bench lazily loads React **development** builds plus in-browser Babel from unpkg. Nothing works offline.
- Index shell fetches each tool HTML and re-executes its scripts; Compromise NLP is not on the dedupe blacklist so it is re-fetched each time.
- Only network call: PubChem MW lookup (`bio_bench.html:1359`). Only storage: theme in localStorage. No projects, no persistence of user work.
- Dark-mode Tailwind config duplicated in every file.
- Text Forensics (AI-text scoring, hidden Unicode) has no lab relevance; Color Generator is figure-relevant via PyMOL export and colour-blind simulation.
