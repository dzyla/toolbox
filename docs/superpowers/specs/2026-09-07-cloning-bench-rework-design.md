# Cloning Bench Rework Design

**Status:** Approved to implement by direct user instruction

## Goal

Replace the calculator-led cloning bench with a browser-local construct-design workspace that supports complete plasmids, arbitrary ordered fragments, primer design, exact simulated products, and transparent validation. The first-class workflows are Q5 site-directed mutagenesis modelled on NEBaseChanger, NEBuilder HiFi/Gibson Assembly, and In-Fusion Assembly. Restriction/ligation and Golden Gate remain available as sequence-aware advanced workflows; they are not allowed to present mass calculations as a constructed sequence.

The goal is behavioural compatibility with the publicly documented workflows and constraints, not a claim that Bio-Bench reproduces vendor-private scoring algorithms or guarantees wet-lab success.

## User workflow

The bench opens at a concise **New design** screen with three primary method cards:

1. **Q5 mutagenesis** — substitution, insertion, deletion, and multi-site mutagenesis of a complete circular plasmid or an explicitly declared partial sequence.
2. **NEBuilder HiFi / Gibson** — assemble a linearized vector and one or more oriented inserts by PCR-derived homology arms.
3. **In-Fusion** — assemble a linearized vector and one or more oriented inserts using the method-specific terminal homology policy.

Each method then follows the same visible progression:

`Source sequences → Design settings → Fragment/mutation review → Primers & junctions → Product & export`

The source step accepts pasted sequence, FASTA, GenBank/DDBJ, and SnapGene `.dna` files through the existing plasmid importer. A source is displayed as a named record with length, topology, annotations, and a removable/reorderable fragment card. Circular plasmids cannot silently become assembly vectors: the user must select an explicit retained backbone interval, inverse-PCR boundaries, or a supported restriction digest. Fragment direction is a visible forward/reverse control, and the construct strip always shows the actual order and orientation used for calculations.

All outputs are reviewable and local. A sequence-validated product can be copied, downloaded as GenBank/FASTA/JSON, or opened in the plasmid viewer with transferred source annotations marked as derived. A draft or blocked design can export a diagnostic/primer table but cannot be represented as a completed construct.

## Shared construct domain

`src/core/cloning` owns a method-neutral `ConstructPlan`.

```ts
type ConstructStatus = 'draft' | 'blocked' | 'sequence-validated' | 'bench-verified';
type FragmentRole = 'vector' | 'insert' | 'amplicon';

interface DesignFragment {
  id: string;
  name: string;
  sourceSequence: string;
  orientedSequence: string;
  role: FragmentRole;
  orientation: 'forward' | 'reverse';
  sourceDocument?: PlasmidDocument;
}

interface JunctionEvidence {
  leftFragmentId: string;
  rightFragmentId: string;
  method: 'q5-sdm' | 'nebuilder' | 'gibson' | 'infusion' | 'restriction-ligation' | 'golden-gate';
  overlap: string;
  expectedOverlapLength: number;
  observedLeftTerminal: string;
  observedRightTerminal: string;
  validated: boolean;
  tmC?: number;
  notes: string[];
}

interface Finding {
  code: string;
  severity: 'blocker' | 'warning' | 'info';
  message: string;
  fragmentId?: string;
  junctionIndex?: number;
}

interface ConstructPlan {
  method: JunctionEvidence['method'];
  status: ConstructStatus;
  topology: 'circular' | 'linear';
  fragments: DesignFragment[];
  junctions: JunctionEvidence[];
  product?: PlasmidDocument;
  findings: Finding[];
  provenance: Record<string, string | number | boolean>;
}
```

The engine sanitizes DNA once, rejects duplicate fragment IDs and empty/ambiguous selected boundaries, reverse-complements only at the orientation boundary, and records every sequence transformation. A product is constructed from the actual designed PCR amplicons — including homology added by primer tails — and each overlap is merged exactly once. It is never created by concatenating raw input fragments. Every simulated circular product must validate its closing junction.

## Q5 mutagenesis / NEBaseChanger workflow

The Q5 workflow accepts a complete circular plasmid by default. A `partial sequence` switch is explicit; it requires at least 35 nt upstream and 25 nt downstream of each edited interval before primers can be generated.

Supported edit inputs are:

- amino-acid mutation syntax such as `M2A`, `F32H`, `M2G:GGG`, and `*` for stop codons, with an explicit ORF start;
- nucleotide substitution, insertion, and deletion using 1-based inclusive coordinates or a sequence search with a disambiguation choice; and
- batch records that preserve the source line and per-edit finding.

For amino-acid changes, the existing ORF translation validates the supplied wild-type residue. The user can choose E. coli K-12 maximum-usage codons or maximum-parsimony codons; an explicit triplet overrides both. Designs use non-overlapping, back-to-back primers. Defaults follow NEBaseChanger's published controls: minimum primer length 15 nt, minimum annealing Tm 55°C, and an optional setting that confines changes to 5′ tails. The report identifies the annealing region, mutation-bearing sequence, calculated Tm, Q5-labelled annealing temperature, and any violated spacing/sequence constraint.

Substitution, insertion, and deletion are applied to a copy of the source plasmid before primer calculation. The resulting product is checked against the requested edit list and marked sequence-validated only when every mutation is represented exactly. Multi-site **NEBuilder** mode partitions the circular plasmid into PCR amplicons around the edits and sends those amplicons through the same validated HiFi overlap engine; it does not label independent Q5 reactions as one multi-mutant product.

## NEBuilder HiFi / Gibson assembly workflow

This workflow requires a linear vector and one or more ordered fragments. A full circular plasmid becomes a vector only after explicit linearization. The default NEBuilder homology arm is 20 nt, adjustable from 15–30 nt. The design engine selects/validates arms using the neighbouring oriented fragments, displays the exact terminal sequence on both sides of every join, and flags an overlap with a calculated method-labelled Tm below 48°C, repeat ambiguity, insufficient fragment template, or incompatible closure.

Primers contain a 5′ homology arm and a 3′ template-annealing region. The primer panel separates those portions visually and reports sequence, lengths, annealing Tm, homology Tm, GC, and warnings. Default Q5-like annealing calculations remain clearly labelled as calculations, not vendor-issued protocol output. Published NEBuilder primer benchmarks are retained as regression fixtures.

Gibson uses the same validated construct path but exposes its independently selected overlap and polymerase settings. Neither mode creates a product until the primer-derived amplicons produce every required exact overlap.

## In-Fusion Assembly workflow

In-Fusion is not a renamed Gibson mode. It uses its own policy:

- default terminal homology is 15 nt; 20 nt is recommended for multi-fragment work;
- 12–21 nt is the allowed design range, with a warning outside the recommended policy;
- every homology region is terminal and is derived from the appropriate 5′ end of the linearized vector or adjacent oriented fragment;
- when a linearized vector has a 5′ overhang, complementary bases are included in the homology arm; bases in a 3′ overhang are excluded; and
- gene-specific 3′ primer sequence defaults to 18–25 nt.

The design surface distinguishes vector preparation (inverse PCR, blunt-ended digest, 5′ overhang digest, or 3′ overhang digest) because that changes the correct arm. Optional between-arm sequence permits preservation of a restriction site, tag, Kozak sequence, or reading frame; it is explicitly included in the simulated product. A junction is blocked if its engineered terminal homology is not exact.

## Advanced cloning methods

Restriction/ligation and Golden Gate share the same sources, construct strip, findings, review, export, and plasmid hand-off. Restriction/ligation scans selected source sequence, creates real digest products with end geometry, and validates selected compatible ends. Golden Gate uses actual Type IIS recognition/cut geometry, scans for internal sites, requires explicit ordered overhangs, and validates length, complementarity, uniqueness, and direction. Reaction quantities remain an optional secondary panel labelled **unverified stoichiometry** until linked to a sequence-validated plan.

## Interface and accessibility

The workspace uses a persistent design summary at the top: method, status, topology, fragment count, product length, and unresolved findings. A single primary action advances the current step; all blockers identify the affected fragment or junction and provide a corrective action. The primer table supports copy, CSV, and IDT-compatible export. Inputs have semantic labels, status is never colour-only, and keyboard users can reorder/select fragments and navigate all primary actions.

The result panel uses three unambiguous states:

- **Draft** — inputs are incomplete.
- **Blocked** — a named sequence-derived condition prevents a valid product.
- **Sequence-validated** — every designed join and requested mutation was checked in silico; this is not a wet-lab success claim.

## Verification

Tests cover imported circular/linear plasmids, orientation, linearization boundaries, exact product sequence, closing junctions, reverse inserts, overlap mismatch, Q5 substitution/insertion/deletion/partial constraints, wild-type amino-acid mismatch, explicit codons, In-Fusion 5′/3′ overhang policies, multi-fragment In-Fusion, restriction-end compatibility, Golden Gate internal sites/overhang failures, legacy shared links, export, and plasmid-viewer hand-off. UI tests exercise the three primary paths and ensure blocked designs cannot present an assembled product.

## Primary references

- [NEBaseChanger](https://nebasechanger.neb.com/) and [NEB Q5 mutagenesis primer guidance](https://www.neb.com/en-us/faqs/how-do-i-design-primers-to-use-with-the-q5-site-directed-mutagenesis-kit)
- [NEBaseChanger tutorial](https://www.neb.com/en/tools-and-resources/video-library/nebasechanger-primer-design-tool-tutorial)
- [NEBuilder HiFi manual](https://intl.neb.com/en/-/media/nebus/files/manuals/manuale2621_e5520.pdf) and [HiFi usage guidance](https://www.neb.com/en-gb/tools-and-resources/usage-guidelines/guidelines-for-using-nebuilder-hifi-dna-assembly)
- [In-Fusion HD manual](https://takara.co.kr/file/manual/pdf/pt5162-1.pdf) and [Takara In-Fusion primer design guidance](https://takara.co.kr/web01/product/productList.asp?lcode=D220415)
