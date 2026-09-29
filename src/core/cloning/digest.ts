/* In-silico restriction digest producing fragments with their sticky/blunt ends.
   Enzyme data: REBASE via src/data/restriction-enzymes.json (see scripts/data). */

import { ENZYMES, restrictionSites, type Enzyme } from '@/core/nucleic/sequence';
import { annotationsInWindow, type Molecule, type MoleculeEnd } from './molecule';

export interface CutSite {
  enzyme: string;
  /** 0-based first nucleotide of the recognition site on the top strand. */
  sitePosition: number;
  strand: 1 | -1;
  /** Number of top-strand nucleotides left of the cut on the top / bottom strand. */
  cutTop: number;
  cutBottom: number;
}

export interface DigestFragment {
  molecule: Molecule;
  /** Top-strand extent in source coordinates (0-based, end exclusive, may wrap for circular sources). */
  start: number;
  end: number;
  leftEnzyme: string | null;
  rightEnzyme: string | null;
}

export interface EnzymeInfo extends Enzyme {
  suppliers?: string;
  optTempC?: number;
  inactTempC?: number;
}

export const ENZYME_TABLE = ENZYMES as EnzymeInfo[];
const BY_NAME = new Map(ENZYME_TABLE.map(enzyme => [enzyme.name.toLowerCase(), enzyme]));

export function findEnzyme(name: string): EnzymeInfo | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

/** Cut sites that actually cut this molecule (linear molecules lose sites whose cut falls off an end). */
export function cutSites(molecule: Pick<Molecule, 'sequence' | 'topology'>, enzymes: Enzyme[]): CutSite[] {
  const length = molecule.sequence.length;
  const circular = molecule.topology === 'circular';
  const sites: CutSite[] = [];
  for (const site of restrictionSites(molecule.sequence, enzymes, { circular })) {
    if (!circular && (site.cutTop <= 0 || site.cutTop >= length || site.cutBottom <= 0 || site.cutBottom >= length)) continue;
    sites.push({
      enzyme: site.enzyme,
      sitePosition: site.position - 1,
      strand: site.strand === '+' ? 1 : -1,
      cutTop: site.cutTop,
      cutBottom: site.cutBottom,
    });
  }
  // One entry per distinct cut (palindromes found once; identical cuts from different enzymes kept).
  const seen = new Set<string>();
  return sites
    .filter(site => {
      const key = `${site.enzyme}:${site.cutTop}:${site.cutBottom}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.cutTop - b.cutTop || a.enzyme.localeCompare(b.enzyme));
}

/** Number of times each enzyme cuts; handy for "single cutter" lists. */
export function cutCounts(molecule: Pick<Molecule, 'sequence' | 'topology'>, enzymes: Enzyme[] = ENZYME_TABLE): Map<string, number> {
  const counts = new Map<string, number>(enzymes.map(enzyme => [enzyme.name, 0]));
  for (const site of cutSites(molecule, enzymes)) counts.set(site.enzyme, (counts.get(site.enzyme) ?? 0) + 1);
  return counts;
}

interface CutGeometry {
  enzyme: string;
  /** Left fragment extends to here (exclusive), right fragment starts here. */
  leftExtentEnd: number;
  rightExtentStart: number;
  leftFragmentEnd: MoleculeEnd;
  rightFragmentStart: MoleculeEnd;
}

function geometry(site: CutSite): CutGeometry {
  const { cutTop: t, cutBottom: b, enzyme } = site;
  if (b === t) {
    const end: MoleculeEnd = { kind: 'blunt', length: 0, phosphorylated: true, origin: enzyme };
    return { enzyme, leftExtentEnd: t, rightExtentStart: t, leftFragmentEnd: end, rightFragmentStart: end };
  }
  const kind = b > t ? "5'" : "3'";
  const length = Math.abs(b - t);
  const end: MoleculeEnd = { kind, length, phosphorylated: true, origin: enzyme };
  return { enzyme, leftExtentEnd: Math.max(t, b), rightExtentStart: Math.min(t, b), leftFragmentEnd: end, rightFragmentStart: end };
}

function unwrap(site: CutSite, length: number): CutSite {
  // A cut near the origin of a circular sequence can have cutTop and cutBottom on opposite sides of 0.
  if (Math.abs(site.cutBottom - site.cutTop) <= length / 2) return site;
  return site.cutTop > site.cutBottom ? { ...site, cutBottom: site.cutBottom + length } : { ...site, cutTop: site.cutTop + length };
}

function fragment(source: Molecule, start: number, end: number, left: CutGeometry | null, right: CutGeometry | null): DigestFragment {
  const length = source.sequence.length;
  const circular = source.topology === 'circular';
  // A circular fragment may exceed the source length by its overhangs (e.g. a single cut: length + overhang).
  const span = end - start;
  const from = circular ? ((start % length) + length) % length : start;
  const sequence = circular
    ? source.sequence.repeat(Math.ceil((from + span) / length)).slice(from, from + span)
    : source.sequence.slice(from, from + span);
  return {
    molecule: {
      name: source.name,
      sequence,
      topology: 'linear',
      left: left ? left.rightFragmentStart : source.left,
      right: right ? right.leftFragmentEnd : source.right,
      annotations: annotationsInWindow(source.annotations, length, circular, from, span),
    },
    start: from,
    end: circular ? (from + span) % length || length : from + span,
    leftEnzyme: left?.enzyme ?? null,
    rightEnzyme: right?.enzyme ?? null,
  };
}

/**
 * Digest a molecule with one or more enzymes. Fragments are returned in source order
 * (for circular sources, starting after the first cut). Sites whose single-stranded
 * regions would overlap another cut are still reported as cuts; callers flag them.
 */
export function digest(source: Molecule, enzymeNames: string[]): { fragments: DigestFragment[]; sites: CutSite[]; unknown: string[] } {
  const enzymes: Enzyme[] = [];
  const unknown: string[] = [];
  for (const name of enzymeNames) {
    const enzyme = findEnzyme(name);
    if (enzyme) enzymes.push(enzyme);
    else unknown.push(name);
  }
  const length = source.sequence.length;
  const sites = cutSites(source, enzymes).map(site => source.topology === 'circular' ? unwrap(site, length) : site);
  const cuts = sites.map(geometry).sort((a, b) => a.rightExtentStart - b.rightExtentStart);
  if (!cuts.length) return { fragments: [], sites, unknown };

  const fragments: DigestFragment[] = [];
  if (source.topology === 'linear') {
    fragments.push(fragment(source, 0, cuts[0]!.leftExtentEnd, null, cuts[0]!));
    for (let index = 1; index < cuts.length; index++) {
      fragments.push(fragment(source, cuts[index - 1]!.rightExtentStart, cuts[index]!.leftExtentEnd, cuts[index - 1]!, cuts[index]!));
    }
    const last = cuts[cuts.length - 1]!;
    fragments.push(fragment(source, last.rightExtentStart, length, last, null));
  } else {
    for (let index = 0; index < cuts.length; index++) {
      const left = cuts[index]!;
      const right = cuts[(index + 1) % cuts.length]!;
      const end = index + 1 < cuts.length ? right.leftExtentEnd : right.leftExtentEnd + length;
      fragments.push(fragment(source, left.rightExtentStart, end, left, right));
    }
  }
  return { fragments, sites, unknown };
}
