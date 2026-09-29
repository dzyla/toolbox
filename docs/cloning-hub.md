# Cloning hub

The Cloning hub designs molecular-cloning experiments in the browser. You load a vector and
inserts once, choose a method, and get primers, a bench protocol computed from your stocks, and
the finished construct as a map and a GenBank file. Nothing is uploaded.

| Method | What it designs | Follows |
|---|---|---|
| NEBuilder / Gibson | Overlap assembly of PCR products and restriction-digested vectors: primers with homology tails, junction placement, spacers, reaction amounts | NEBuilder Assembly Tool (v2.11.2) and NEBuilder HiFi protocol |
| In-Fusion | 15 bp homology extensions (20 bp for two or more inserts), vector opened by digest, inverse PCR or supplied linear | Takara In-Fusion Snap Assembly manual and Primer Design Tool |
| Restriction + ligation | Digest, end compatibility (sticky, blunt, BamHI/BglII-type), orientation, regenerated sites, T4 ligase reaction | NEB T4 DNA Ligase protocol (M0202), NEBioCalculator |
| Amino-acid change / bases | Q5 site-directed mutagenesis: `Y127F`, `Y127F, H443T` (separate designs), `T39A+Y40F` (one multi-mutant), or insert / replace / delete bases | NEBaseChanger (5′-tail design) and Q5 SDM + KLD protocol |
| Golden Gate | Amounts and cycling only (overhang design is not built yet) | Engler et al. 2008 |

Projects can be saved and reopened from Recent projects. NEBuilder project files can be imported,
and designs can be exported as IDT bulk-order files, fragment FASTA and GenBank.

## What has been checked, and against what

Agreement with a vendor tool is measured on reference outputs stored in `tests/fixtures/`. It shows
that the software reproduces that tool's rules; it does not show that a construct will work at the
bench. Sequence-verify every clone.

| Check | Reference | Result |
|---|---|---|
| NEBuilder primers, anneal Tm, Ta, GC and assembled product | 220 designs from the NEBuilder Assembly Tool (PCR-only and digested vectors, 2–4 fragments, 20 polymerases) | All match exactly |
| NEB Tm calculation (methods 4 and 5) | 174 oligos × 30 buffer and primer-concentration conditions | All match to 1e-9 °C |
| In-Fusion homology extensions, included restriction sites, product length | 9 designs from the Takara tool (two cuts, single cuts, 5′/3′/blunt ends, two inserts, inverse PCR, region replacement) | All match exactly |
| In-Fusion gene-specific primer length | the same 9 designs (4 distinct primers) | 3 of 4 exact, 1 differs by one base |
| NEBaseChanger 5′-tail primers, Tm, Ta | 8 designs (substitutions, insertions of 6–45 nt, deletion) | All match |
| Reaction amounts | NEBioCalculator ligation masses and the NEBuilder Protocol Calculator example | Match |
| Restriction digest | Biopython `Bio.Restriction` on pUC19 and pET-28a, 40 enzymes, circular and linear | All cut positions match |

## Where results differ from the vendor tools

- **In-Fusion gene-specific part.** Takara's tool runs a Primer3-based search with a Tm formula that is
  not public, and it relaxes its own limits for GC-rich templates. We apply Takara's documented rules
  with SantaLucia/Owczarzy Tm, so lengths can differ by a base or two. The homology extensions do not.
- **NEBaseChanger default design.** For changes of five bases or fewer, NEBaseChanger puts the change
  inside the primer and uses a mismatch-aware Tm. That variant is not implemented; the 5′-tail design
  (NEBaseChanger's "confine mutations to primer 5′ tails" option) is. Both give working primers.
- **NEBuilder options not built yet:** custom primers, synthetic fragments, restriction-site
  regeneration options, and spacers on a split PCR–PCR junction (blocked with a message, not guessed).
- **NEBuilder project files** are signed by NEBuilder, so a project we export may be refused by it.
  Use the fragment FASTA and IDT exports to continue in NEBuilder.
- Methylation sensitivity and star activity of enzymes are not modelled, and NEBcloner-style buffer
  advice is not included.

## Reference data: provenance and licence

- Reference outputs were captured from the public vendor tools by entering our own sequences (pUC19,
  a GFP fragment, random test sequences) and saving the results. Only inputs and outputs are stored,
  as facts about what the tools returned, with the tool version and capture date in each file. No
  vendor source code or vendor data tables are part of this repository, and the software is written
  from the published rules. Vendor names are used only to say what a design follows.
- `src/data/restriction-enzymes.json` is derived from REBASE (Roberts et al., Nucleic Acids Res 2023)
  through Biopython 1.84 by `scripts/data/build-restriction-enzymes.py`. Please cite REBASE, and check
  its current terms at https://rebase.neb.com before redistributing the table in another form.
- Digest positions are tested against Biopython, an independent implementation.

## Where the code is

```
src/core/cloning/
  molecule.ts     double-stranded molecules with 5′/3′/blunt ends, features, fill-in / chew-back
  digest.ts       restriction sites and fragments (any enzyme in the table, Type IIS included)
  assemble.ts     ligation and overlap assembly, junction checks
  pcr.ts          amplification with tailed primers
  neb-tm.ts       the NEB Tm calculation
  methods/        nebuilder.ts  infusion.ts  ligation.ts  basechanger.ts  neb-polymerases.ts
  amounts.ts, protocols.ts, protocol.ts   reaction amounts and bench protocols
  products.ts     product molecules with the features of their inputs
  interchange.ts  NEBuilder project import, IDT / FASTA export
src/tools/cloning/  the hub interface (hub/ holds one panel per method)
tests/fixtures/     reference outputs (vendor/, cloning/)
```

## Contributing

- **A wrong or differing result:** open a "Wrong value" issue with the tool, its version, your input
  and its output. That is the most useful contribution.
- **Adding a reference case:** run the vendor tool yourself on a sequence you are free to share, save
  its output under `tests/fixtures/vendor/<tool>/`, note the tool version and date in the file, and add
  the case to the matching test (`tests/core/*-vendor.test.ts`). Every case should pass or be recorded
  as a known difference above.
- **Adding a method:** write a pure function in `src/core/cloning/methods/` that returns findings
  instead of throwing, add a panel under `src/tools/cloning/hub/`, and follow `CONTRIBUTING.md` for the
  science panel, assurance entry and accessibility checks.
