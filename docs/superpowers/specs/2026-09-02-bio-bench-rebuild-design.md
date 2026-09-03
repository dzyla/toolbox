# Bio-Bench rebuild — design spec

Date: 2026-09-02
Status: approved for implementation
Companion: `docs/science-audit-2026-09-02.md` (findings this design must fix)

## 1. Goal

Turn the current set of vibe-coded HTML tools into a free, open-source,
server-free lab toolkit that scientists can trust and that is easier to use and
more capable than the commercial copycat. Three non-negotiables, in order:

1. **Science is correct and shown.** Every number has a formula, an assumption
   list and a reference visible in the UI, and a test in CI pinned to a
   published reference value.
2. **Works everywhere without a server.** Static site on GitHub Pages,
   installable as a PWA, fully offline, data stays on the user's device.
3. **Easy.** One home screen, one visual language, recent work resumes with a tap,
   every result exportable and shareable as a link.

## 2. Decisions taken (override if you disagree)

| Decision | Choice | Why |
|---|---|---|
| Name | **Bio-Bench** | Already in the code and footer; short; not trademarked by the copycat. |
| License | **AGPL-3.0** | Anyone can use, host and fork it; a hosted closed copy must publish its source. Science data files (JSON) additionally CC-BY-4.0 so they can be reused freely. |
| Text Forensics | **Retired** to `legacy/` (still deployed at `/legacy/`), not ported | No lab relevance. |
| Color Generator | **Kept** as a "Figures" tool | PyMOL export and colour-blind check are useful for papers. |
| Framework | **Vite + TypeScript + Preact** | Tiny bundle for phones; React-compatible API so AI-assisted coding and hiring stay easy; bio_bench already uses React idioms. |
| Styling | **Tailwind v4 via Vite plugin** + a small design-token layer | The existing markup is Tailwind, so porting is mechanical; the play-CDN goes away. |
| Charts | **Inline SVG with d3-scale/d3-shape** | Tree-shakable, exports as real vector SVG for papers; no Chart.js. |
| Storage | **IndexedDB** via `idb` for projects and images; `localStorage` only for preferences | Blobs (gel images) need IndexedDB. |
| Routing | **Hash routes** (`#/tool/gel/p/<projectId>`) | Works on GitHub Pages without 404 tricks and inside `file://`. |
| Sync | **None built in.** Export/import project JSON (+ images) and share-by-URL for calculators. Optional later: sync to the user's own GitHub Gist with their token. | Server-free requirement. |
| Tests | **Vitest** for `core/`, **Playwright** smoke tests per tool | Reference-value tests are the science guarantee. |

## 3. Architecture

```
bio-bench/
  src/
    core/         pure TypeScript, no DOM, fully tested   ← the science
      units/      SI prefixes, unit parsing/formatting, molar<->mass
      protein/    masses, ε, pI (Bjellqvist, EMBOSS, IPC2), charge, II, AI, GRAVY,
                  formula, digest (avg + monoisotopic), profiles, half-life
      nucleic/    revcomp, translate, GC, ORFs, restriction, Tm (Wallace, Marmur,
                  SantaLucia NN + salt), oligo mass, A260, copy number
      buffers/    recipe solver (solid/liquid/hydrate/density), HH ratio, pKa(T)
      binding/    Morrison, n-site Adair, target solver, ΔG, Cheng–Prusoff, Hill
      align/      Gotoh global/local (fixed traceback), matrices, identity stats
      centrifuge/ rpm<->rcf, k-factor
      reactions/  master mix, serial dilution, ammonium sulfate
      cryoem/     Nyquist, box sizes, dose
      cells/      hemocytometer, seeding, doubling time
      gel/        image pixel ops, lane finding, profiles, peak finding,
                  background (rolling ball / lane min), ladder calibration fits,
                  band quantification
    data/         versioned JSON, CC-BY: chemicals, ladders, pKa sets, matrices,
                  codon tables, enzymes, modifications, media recipes
    tools/        one folder per tool: meta.ts (registry entry), View.tsx,
                  state.ts, Science.mdx (formula/assumptions/refs panel)
    app/          shell: Home, Nav, Theme, Router, ProjectStore, Search
    lib/          idb store, url-state (lz-string), export (png/svg/csv/json),
                  image decode (png/jpg native, TIFF via utif), share
    styles/       tokens.css, tailwind entry
  legacy/         the current HTML files, untouched, deployed under /legacy/
  tests/          vitest specs + reference fixtures (ProtParam outputs, NCBI
                  matrices, supplier MW tables), playwright smoke tests
  docs/           audit, specs, science references per tool, CONTRIBUTING
  .github/        ci.yml (test + build on PR), deploy.yml (Pages),
                  ISSUE_TEMPLATE/wrong-value.yml, tool-request.yml
  CITATION.cff, LICENSE (AGPL-3.0), LICENSE-DATA (CC-BY-4.0), README
```

Rules that keep it honest:

- `core/` may not import from `tools/`, `app/`, or the DOM. ESLint enforces it.
- Every exported `core/` function has a test; every constant table has a
  provenance comment (source, year, DOI/URL) and a test for at least one row.
- Every tool ships a **Science panel**: formula(s), assumptions, valid range,
  references, and "last verified against X on date". Exports include the same
  text so a number never travels without its method.
- A tool registers itself in `tools/registry.ts` with `{ id, name, category,
  icon, blurb, keywords, component, hasProjects }`. Home, nav, search and the
  PWA shortcuts are all generated from the registry.

## 4. App shell and UX

**Home** mirrors what works in the copycat and drops the paywall banner:

- Search box ("molarity", "kDa", "TAE"…) filtering the registry by keywords.
- **Recent projects** row: thumbnail, name, tool badge, last edited. Tap resumes.
- Category cards: Calculators · Sequences & Proteins · Gels & Images · Counting
  · Plates & Culture · Timing & Protocols · Figures.
- Footer: version, "Install app", "Report a wrong value" (opens the issue
  template prefilled with tool + inputs), "Cite Bio-Bench".

**Every tool page** has the same skeleton: title + one-line blurb, inputs on
the left / results on the right (stacked on phones), a sticky action bar
(Copy · Export · Share link · Save project · Science), and the Science panel
as a slide-over. Inputs use a shared `<Quantity>` component that accepts
"10 mM", "2.5 ug/uL", "1e-7 M" and shows the parsed value, so unit mistakes are
visible before they happen.

**Projects**: any tool with `hasProjects` autosaves its state to IndexedDB
(debounced), stores a thumbnail, and appears on Home. Calculators without
projects encode their full state into the URL hash (lz-string), so a link
reproduces the exact screen. "Export project" writes a single `.biobench.json`
(images base64) that "Import" reads back on any device.

**PWA**: `vite-plugin-pwa` precaches the whole app; an update toast appears when
a new version is deployed; app shortcuts point at the five most used tools.
Camera capture on phones feeds the image tools directly.

**Accessibility and theme**: light/dark from system with override, keyboard
operable, colour-blind-safe palette in all plots, no information by colour
alone.

### Interaction principles

Bio-Bench is a public scientific instrument, not a dashboard. Each tool should
open with the smallest useful set of inputs, a visible default example, and an
immediate, legible result. Advanced controls belong in a clearly named
disclosure; they must never be required to complete the common calculation.
Inputs and results use plain language alongside conventional symbols and units.

The layout is mobile-first: a single vertical flow on narrow screens, with
inputs before results; at wider breakpoints the same sections form a calm
two-column workspace. Touch targets are at least 44 px, tables scroll in their
own region instead of forcing page overflow, and charts remain useful without
hover by exposing their key values in adjacent text or tables. Keyboard access,
high-contrast states, and no-colour-only meanings are required on every view.

Every result has a compact “How this works” entry point through the shared
Science panel. It states the equation, variable definitions, assumptions,
validated range where applicable, interpretation guidance, and primary
references. The primary workflow remains uncluttered: equations and background
are available on demand, rather than competing with the calculation itself.

Visual design should use the existing application tokens, type scale,
`ToolLayout`, `Quantity`, `ActionBar`, and `SciencePanel`. Prefer whitespace,
clear grouping, short labels, and restrained borders over decoration. Icons are
optional functional cues only; no emoji are used as a substitute for a control
label or scientific meaning.

## 5. Tool inventory for v1.0

Ported (science fixed as per audit):

| Tool | From | Changes beyond the port |
|---|---|---|
| Molarity & Dilution | Bio-Bench utils | One tool: mass↔moles↔conc, C1V1=C2V2, serial dilution planner with well volumes done right. |
| Buffer & Media Recipes | Bio-Bench buffer | Hydrate picker instead of silent synonym match; density for liquids; "x" stocks; pKa(T) for Tris etc.; presets (TAE, TBE, PBS, TBS, LB, SOC…) audited; PubChem lookup kept, optional. |
| Centrifuge | Bio-Bench utils | Fixed constant, rotor library (common Beckman/Eppendorf/Thermo rotors) with rmax/rmin. |
| Master Mix | Bio-Bench reactions | As is, plus save as project and export to CSV. |
| Ammonium Sulfate | Bio-Bench purify | Correct 0 °C/25 °C constants, guards. |
| Protein Workbench | protein_params | True Bjellqvist + EMBOSS + IPC2 pKa sets applied consistently; native/denatured ε; correct DIWV; monoisotopic digest with ppm matching; ambiguous-residue warnings; Abs 0.1% shown; units on everything. |
| Protein Concentration | Bio-Bench macro | Path length, dilution factor, Bradford/BCA standard-curve fit (linear/quadratic) with residuals. |
| Nucleic Acids | Bio-Bench macro + text_counter | A260 conversions, copy number, exact oligo mass, NN Tm with salt/Mg correction, labelled assumptions. |
| Sequence Viewer & Tools | Bio-Bench seq-viewer | Adds DNA/RNA mode: revcomp, translate (all frames, selectable codon table), ORFs, GC plot, restriction map, FASTA I/O. |
| Alignment | bio_align_engine | Fixed traceback, matrix typos, BLOSUM80 added, semi-global option, labelled identity convention. |
| Binding Calculator | binding_calculator | Tiles and target solver use the exact solver; Hill plot on free ligand; kinetics panel (kon/koff/Kd/t½); kcal/mol shown. |
| Cryo-EM | Bio-Bench cryo | Plus dose (e⁻/Å² from rate, exposure, pixel), magnification↔pixel size. |
| Gel / Blot | gel_annotator | Full overhaul, section 6. |
| Figure Colours | color_generator | As is. |

New (the copycat's set, done better, plus what it lacks):

| Tool | Scope for v1.0 |
|---|---|
| Plate Layout | 6–384 wells; paint groups, replicates, dilution series; labels; export PNG/SVG/CSV; import a CSV to colour by value (heatmap). |
| Hemocytometer | Tap-count per square with live/dead toggle; cells/mL, viability, seeding volume for target density; photo overlay optional. |
| Colony / Object Counter | Tap-to-count with categories, undo, zoom; optional auto-count by thresholding + connected components on the device. |
| Image Measurer | Calibrate scale by known distance or from image DPI; lines, polylines, areas, angles; export CSV and annotated image. |
| Timers | Multiple named countdowns, stopwatch, notifications via the Notification API, survives reload. |
| Cell Culture | Passaging (split ratio ↔ seeding density), doubling time, confluence estimate. |
| Protocols | Markdown protocols with checkboxes and inline `[timer 10 min]` steps; stored as projects; export/import `.md`; community protocol folder in the repo. |
| Unit Converter | Concentration, mass, volume, activity, radiation, pressure — with SI parsing. |

## 6. Gel / Blot tool (overhaul)

Principle: keep the raw data, make quantification honest, make annotation fast,
and make the export publication-ready.

**Import.** PNG/JPG natively; **TIFF 8/16-bit** via `utif` (imagers export
TIFF). Camera on phones. The decoded image is stored once as a `Float32Array`
luminance plane plus the original blob; everything visual is a non-destructive
view on top (rotation, crop, levels, gamma, invert, false colour). Quantification
always reads the raw plane, never the display.

**Geometry.** Pan/zoom canvas. Straighten by dragging a line along the well row
or dye front (rotation computed from it). Crop. Flip. Undo/redo for every action.

**Lanes.** Auto-detect from the vertical intensity projection (smoothed, valley
finding) with a live overlay; or "N lanes" with equal spacing; or manual. Each
lane is a draggable, tiltable rectangle with independent width. Lane labels are
first-class (text, rotation, alignment) and stay attached to lanes.

**Ladder and MW calibration.** Pick a lane and a ladder from the library
(protein: Precision Plus, PageRuler Plus, PageRuler unstained, SeeBlue Plus2,
Spectra Multicolor, Blue Prestained Broad Range, Novex Sharp; DNA: NEB 1 kb, NEB
100 bp, GeneRuler 1 kb, GeneRuler 100 bp, Quick-Load 1 kb Plus, λ HindIII, 1 kb
Plus Invitrogen; user-defined saved locally). Bands in the ladder lane are
auto-detected as peaks in the lane profile and assigned top-down; the user can
drag, add or delete assignments. Calibration models: log-linear, piecewise
log-linear, cubic spline (ImageJ-style), with R² and residuals shown. Once
calibrated, hovering anywhere shows the estimated size and every detected band
gets a size estimate with the calibration model named.

**Bands and quantification.** Per-lane profile plot beside the gel with peak
detection (prominence and width thresholds adjustable). Band region = lane width
× peak bounds, editable. Background options: rolling ball (radius adjustable),
per-lane valley-to-valley baseline, or a user-drawn background ROI. Outputs per
band: raw integrated intensity, background, net, % of lane, and ratio to a
chosen reference (loading control band or lane) → normalised value. Saturation
warning when >1 % of pixels in a band are at the top or bottom of the dynamic
range. Polarity auto-detected (dark bands on light or light on dark) and
overridable. Table exports to CSV with the method stated in a header comment.

**Annotation.** Text, arrows, lines, boxes, brackets over lane groups
(e.g. "− + − +"), MW tick marks on either side generated from the ladder
assignment, asterisks for significance, lane headers, panel letters. Styles
(font, size, colour) are presets: "Figure black on white", "Dark", "Colour".
Snap and align, group, duplicate, multi-select, keyboard nudge.

**Export.** PNG at chosen DPI with physical size, **SVG** with the image
embedded and every annotation as vector text, CSV of the band table, PDF via
print stylesheet. Multi-gel figure composition (several gels as panels with
shared scale) is planned for v1.1, not v1.0.

**Science panel** states plainly: densitometry is relative, linear only within
the imager's range, film and phone photos are non-linear, and compare within a
gel not across gels.

## 7. Data flow

`Input (Quantity components) → tool state (signals) → core functions → results`
`tool state ⇄ url hash (calculators) | IndexedDB project (image tools, protocols)`

Projects: `{ id, toolId, name, createdAt, updatedAt, thumbnail: Blob,
state: unknown (tool-owned, versioned), assets: Record<string, Blob> }`.
Each tool owns a `migrate(state, fromVersion)` so old projects keep opening.

## 8. Error handling

- `core/` functions throw typed errors (`InvalidInput`, `OutOfRange`) with a
  human message; tools render them inline next to the offending input, never as
  a blank result.
- Every numeric result carries `{ value, unit, warnings[] }` so tools can show
  "outside validated range" or "ambiguous residues ignored" without a separate
  lookup.
- Image decoding failures and unsupported formats show what formats work.
- A global error boundary keeps the shell usable and offers "copy debug report"
  (tool, version, state without images) for an issue.

## 9. Testing and CI

- **Reference tests** in `tests/core/`: ProtParam outputs for lysozyme, insulin B
  chain, BSA, GFP; NCBI matrix symmetry and row checksums; independent Gotoh
  reference on 200 random pairs; Morrison closed form; supplier MW table rows;
  IDT/Thermo Tm for standard primers; ladder band lists against supplier PDFs.
- **Property tests** for units parsing (round-trips), alignment (re-scoring the
  traceback equals reported score, always).
- **Gel tests** on synthetic gels (rendered Gaussians on gradients with noise)
  where the true band positions and areas are known.
- **Playwright smoke** per tool: loads, default inputs give expected result,
  export button produces a file.
- CI on every PR: lint (incl. the no-DOM-in-core rule), typecheck, vitest,
  build, playwright. Deploy workflow builds and publishes to Pages on `main`,
  copying `legacy/` under `/legacy/`.

## 10. Community and GitHub as the backend

- Issue templates: **Wrong value** (tool, inputs, your result, reference and
  its value), **Tool request**, **Ladder/chemical/protocol addition** (a JSON
  or Markdown file by PR, validated by a schema test in CI).
- `CONTRIBUTING.md` with the science rule: a change to `core/` needs a reference
  and a test.
- `CITATION.cff` + Zenodo release DOI so papers can cite it; a "Cite" button in
  the app.
- GitHub Discussions for Q&A; Releases with changelog generated from PR labels.
- Dependabot for dependencies. No analytics, no telemetry, no accounts.

## 11. Delivery phases (each gets its own implementation plan)

0. **Hotfix the live site**: the numeric bugs that are cheap to fix in place
   (RCF constant, DIWV table, matrix typos, TAE preset, MW entries, AS
   constant, BLOSUM80 option) with a node test file that will move into `core/`.
1. **Scaffold**: repo layout, toolchain, shell (Home, nav, theme, registry,
   router, project store, url-state, PWA), CI and deploy with legacy under
   `/legacy/`, license, README, CITATION, issue templates.
2. **Core library**: port and fix every calculation with reference tests.
3. **Port calculators and sequence tools** onto the shell (section 5, first table).
4. **Gel / Blot overhaul** (section 6).
5. **New tools** (section 5, second table), in this order: Plate Layout,
   Hemocytometer, Timers, Image Measurer, Colony Counter, Cell Culture,
   Protocols, Unit Converter.
6. **Release 1.0**: docs, Zenodo, announcement, legacy retirement notice.

## 12. Out of scope for 1.0

Accounts or cloud sync, AI features, mobile app-store builds (the PWA covers
phones), multi-gel figure composer (1.1), Western blot normalisation to total
protein stain images (1.1), automatic colony counting beyond simple
thresholding (1.1).

## 13. Colony counter: better than an "AI" button

The copycat sends the photo to a server and meters it. Bio-Bench does it on the
device, unlimited, offline, and shows its work:

1. **Plate finding**: detect the dish rim (Hough circle or user-adjusted circle)
   and count only inside it; optional inner margin to drop rim reflections.
2. **Illumination flattening**: subtract a large-radius background (rolling ball
   or Gaussian) so gradients and shadows do not fool the threshold.
3. **Segmentation**: adaptive threshold (light colonies on dark or the reverse,
   auto-detected), then a distance transform + watershed to split touching
   colonies. Filters on area, circularity and colour (e.g. blue/white).
4. **Review loop**: every count is a dot the user can add, remove or drag;
   clusters flagged for review; keyboard for fast correction. The correction is
   the product, not an afterthought.
5. **Numbers that matter**: CFU/mL from dilution factor and plated volume;
   multi-plate dilution series with weighted mean and the 30–300 rule flagged;
   per-category counts (blue/white, big/small); export CSV and annotated image.
6. Later (1.1): an optional small on-device model (ONNX Runtime Web, a few MB,
   loaded on demand) for hard plates: lawns, overlapping, coloured media. Still
   server-free; still free.

The same pipeline powers a **Plaque counter** and, with the grid overlay, the
hemocytometer's optional auto-count.

## 14. Roadmap: tools scientists actually need (proposed, prioritised)

Tier 1 — big wins nobody gives away well for free:

| Tool | What it does | Why it beats the market |
|---|---|---|
| **Curve Fit** | Non-linear least squares in the browser: 4PL/5PL dose–response (IC50/EC50), Michaelis–Menten (Km, Vmax, kcat, with substrate inhibition), Boltzmann melt (DSF/nanoDSF Tm), exponential decay/association, linear with CI; residual plots, 95 % CI, R², paste-from-Excel, export SVG | Most labs pay for Prism just for this. |
| **Plate Reader Workflow** | Import reader CSV/XLSX → map onto a Plate Layout → blank/normalise by group → replicate stats → send to Curve Fit or Standard Curve in one click | The copycat's plate labelling stops at labels. |
| **Standard Curve** | Bradford/BCA/ELISA/qPCR/Nanodrop-style calibration with linear/quadratic/4PL fit, interpolation of unknowns with dilution factor, LOD/LOQ | Every wet lab does this daily in a spreadsheet. |
| **Plasmid Map** | Parse GenBank/FASTA/SnapGene-exported files, circular/linear SVG map with features, ORFs, restriction sites, primers; sequence search; export SVG | SnapGene is paid; Benchling needs an account. |
| **Cloning Planner** | Restriction digest with fragment table and a **virtual gel** (renders into the Gel tool against a chosen ladder), compatible-end check, Gibson/In-Fusion overlap and Golden Gate primer design, site-directed mutagenesis primers | Ties the sequence tools to the gel tool. |
| **Primer Tools** | Tm (NN with salt/Mg/dNTP), hairpin/self-dimer/cross-dimer ΔG, GC clamp, degenerate primers, PCR annealing suggestion, oligo ordering sheet | The Tm calculators online are ad-supported and inconsistent. |
| **qPCR** | ΔΔCt with multiple reference genes (geometric mean), primer efficiency from a dilution series, Pfaffl method, replicate QC | |

Tier 2 — structural biology and biochemistry (where the copycat has nothing):

| Tool | What it does |
|---|---|
| **SEC Calibration** | Kav vs log MW from standards, column volume, estimate MW of peaks, oligomeric state vs sequence MW. |
| **Chromatography Gradients** | Imidazole/salt gradient planner (mixing volumes, CV, time at flow rate), buffer A/B recipes. |
| **Tag Library** | Add His6/GST/MBP/SUMO/GFP/Strep/FLAG/TEV site etc. to a sequence: MW, ε, pI before and after cleavage; expected band on SDS-PAGE. |
| **Gel % Picker** | Recommend acrylamide %, gradient, and agarose % for a target size range; run-time estimates. |
| **Labelling (DOL)** | Degree of labelling from A280/Amax with dye correction factors (library of common dyes). |
| **Cryo-EM Toolkit** | Particles-per-micrograph from concentration and hole size; dose fractionation planner; pixel size/mag calibration; Rosenthal–Henderson B-factor plot from resolution vs particle number; FSC curve viewer (paste/upload .xml/.dat, report 0.143/0.5); box/mask size helper; Thon ring resolution estimate. |
| **MS Peptide Coverage** | Paste observed peptides, map onto sequence, coverage %, modification sites. |
| **Nanodrop Interpreter** | 260/280 and 260/230 with guidance on likely contaminants. |

Tier 3 — everyday lab life:

| Tool | What it does |
|---|---|
| **Scale Bar & Microscopy** | Pixel size from objective/camera/binning, Abbe/Nyquist limits, burn a correct scale bar into an image (the most-used ImageJ feature). |
| **Freezer Box Map** | 9×9 / 10×10 box grids, search, colour tags, export/print; local, sharable by file. |
| **Antibiotic & Supplement Table** | Stock and working concentrations for common antibiotics, inducers, supplements; volume to add for any media volume. |
| **Radioactivity Decay** | Isotope table, activity today, date to reach a target. |
| **Osmolarity & Ionic Strength** | From a recipe. |
| **Quick Stats** | t-test, one-way ANOVA with post-hoc, paired/unpaired, plot with points not bars. |
| **Domain Diagram** | Draw protein domain schematics to SVG from manual input (or an InterPro accession when online). |
| **Lab Timer Protocols** | Protocols with embedded timers already in 1.0; add sharing as a URL for short ones. |

Ordering recommendation after 1.0: Curve Fit → Standard Curve → Plate Reader
Workflow → Primer Tools → Cloning Planner with virtual gel → Plasmid Map →
Cryo-EM Toolkit → qPCR → SEC → the rest.
