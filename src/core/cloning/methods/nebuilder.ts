/* NEBuilder HiFi / Gibson assembly design, following the NEBuilder Assembly Tool (v2.11.2).

   Rules (verified against 220 reference designs, tests/fixtures/vendor/nebuilder):
   - Each PCR fragment gets a primer pair. Anneal length starts at the minimum primer
     length and grows until Tm ≥ 55 °C; it then keeps growing (Tm < 70 °C) until the
     3′ base is G/C, falling back if no clamp is reached. The cooler primer of the pair
     is then lengthened until the pair is within the maximum Tm difference, and a G/C
     clamp is sought again without overtaking the warmer primer.
   - At each junction the homology is placed by mode: `split` between both primers,
     `upstream`/`downstream` entirely on one side. PCR–PCR junctions split (half the
     minimum overlap on each side, the larger share on the higher-GC fragment side);
     junctions to a restriction-digested fragment, or to a fragment marked as the vector
     backbone, put all homology on the other fragment's primer. Overlaps grow until
     their Wallace Tm (4·GC + 2·AT) reaches 48 °C. A junction whose ends already overlap
     with Wallace Tm ≥ 48 °C gets no tails.
   - A restriction-digested fragment contributes its double-stranded part plus any
     3′ overhangs; 5′ overhangs are removed by the exonuclease and not used as homology. */

import { reverseComplement } from '@/core/nucleic/sequence';
import { findEnzyme, cutSites } from '../digest';
import { nebTm, roundTenth, wallaceTm } from '../neb-tm';
import { annealingTemperature, findPolymerase, primerDefaults, type NebPolymerase } from './neb-polymerases';
import type { Finding } from '../types';

export interface NebuilderFragment {
  name: string;
  /** Source sequence 5′→3′ (top strand). */
  sequence: string;
  topology: 'linear' | 'circular';
  /** `pcr`: amplified whole; `digest`: cut out with `leftEnzyme` (5′ end) and `rightEnzyme` (3′ end). */
  kind: 'pcr' | 'digest';
  isVectorBackbone?: boolean;
  leftEnzyme?: string;
  rightEnzyme?: string;
}

export interface JunctionOptions {
  /** Bases inserted between the two fragments (top-strand sense, ≤ 100 nt). */
  spacer?: string;
  /** Force where the homology is placed; defaults follow the fragment types. */
  mode?: OverlapMode;
}

export interface NebuilderSettings {
  polymeraseId: string;
  /** Minimum overlap length, nt (NEBuilder default 20; 25 for > 3 fragments). */
  minOverlap: number;
  minPrimerLength: number;
  maxTmDifference: number;
  circularize: boolean;
  /** Primer concentration override, nM (defaults by polymerase: 500 Q5/Phusion, otherwise 200). */
  primerNm?: number;
  /** Options per junction, in assembly order (junction i joins fragment i to fragment i+1). */
  junctions?: Array<JunctionOptions | undefined>;
}

export const NEBUILDER_DEFAULTS: NebuilderSettings = {
  polymeraseId: 'q5-0',
  minOverlap: 20,
  minPrimerLength: 18,
  maxTmDifference: 5,
  circularize: true,
};

export const MIN_OVERLAP_WALLACE_TM = 48;
const PRIMER_MIN_TM = 55;
const PRIMER_MAX_TM = 70;
const MAX_OVERLAP_SEARCH = 60;

export interface NebuilderPrimer {
  name: string;
  fragment: string;
  direction: 'fwd' | 'rev';
  overlap: string;
  spacer: string;
  anneal: string;
  /** Anneal Tm and pair Ta, rounded as NEBuilder displays them. */
  tm: number;
  ta: number;
  /** Whole-primer and anneal GC %, rounded as displayed. */
  gc: number;
  annealGc: number;
}

export type OverlapMode = 'split' | 'upstream' | 'downstream' | 'none';

export interface NebuilderJunction {
  upstream: string;
  downstream: string;
  type: string;
  mode: OverlapMode;
  /** Tail added to the downstream fragment's forward primer (top-strand sense). */
  upstreamTail: string;
  /** Tail added to the upstream fragment's reverse primer (primer sense). */
  downstreamTail: string;
  /** Homology length at this junction, nt. */
  overlapLength: number;
  intrinsicOverlap: number;
  spacer: string;
}

export interface NebuilderDesign {
  primers: NebuilderPrimer[];
  junctions: NebuilderJunction[];
  /** Templates actually used (after digestion), in assembly order. */
  templates: Array<{ name: string; sequence: string; kind: 'pcr' | 'digest' }>;
  product: string;
  findings: Finding[];
}

function gcFraction(sequence: string): number {
  if (!sequence.length) return Number.NaN;
  let gc = 0;
  for (const base of sequence) if (base === 'G' || base === 'C') gc += 1;
  return gc / sequence.length;
}

function displayGc(sequence: string): number {
  return Math.round(Math.round(1000 * gcFraction(sequence)) / 10);
}

/** Longest k ≤ max with `a` ending in the first k bases of `b`. */
function terminalOverlap(a: string, b: string, max: number): number {
  for (let k = Math.min(max, a.length, b.length); k > 0; k--) {
    if (a.slice(-k) === b.slice(0, k)) return k;
  }
  return 0;
}

const clamped = (sequence: string) => /[GC]$/.test(sequence);

/** NEBuilder primer-pair anneal selection for one template. */
export function selectAnnealLengths(template: string, minLength: number, maxTmDifference: number, tm: (sequence: string) => number): { forward: string; reverse: string; forwardTm: number; reverseTm: number } {
  const n = template.length;
  const reverseTemplate = reverseComplement(template);
  if (minLength > n || 2 * minLength > n) throw new Error(`Fragment of ${n} bp is too short for two ${minLength}-nt primers.`);

  const grow = (source: string) => {
    let length = minLength;
    let value = tm(source.slice(0, length));
    let fallback = length;
    while (value < PRIMER_MIN_TM && length < n) { length += 1; value = tm(source.slice(0, length)); fallback = length; }
    while (value < PRIMER_MAX_TM && !clamped(source.slice(0, length)) && length < n) { length += 1; value = tm(source.slice(0, length)); }
    if (!clamped(source.slice(0, length))) { length = fallback; value = tm(source.slice(0, length)); }
    return { length, value };
  };
  let fwd = grow(template);
  let rev = grow(reverseTemplate);

  // Balance the pair: lengthen the cooler primer, then seek a clamp without overtaking the warmer one.
  const balance = (cool: { length: number; value: number }, hotValue: number, source: string) => {
    while (hotValue - cool.value > maxTmDifference && cool.length < n) { cool.length += 1; cool.value = tm(source.slice(0, cool.length)); }
    let kept = cool.length;
    while (cool.value < hotValue && !clamped(source.slice(0, cool.length)) && cool.length < n) {
      cool.length += 1;
      cool.value = tm(source.slice(0, cool.length));
      if (!(cool.value < hotValue)) { cool.length = kept; cool.value = tm(source.slice(0, kept)); break; }
      kept = cool.length;
    }
    return cool;
  };
  if (fwd.value > rev.value) rev = balance(rev, fwd.value, reverseTemplate);
  if (rev.value > fwd.value) fwd = balance(fwd, rev.value, template);
  if (fwd.length + rev.length > n) throw new Error('The forward and reverse primers would overlap on this fragment.');
  return { forward: template.slice(0, fwd.length), reverse: reverseTemplate.slice(0, rev.length), forwardTm: fwd.value, reverseTm: rev.value };
}

/** Template of a fragment as NEBuilder uses it (digested fragments keep 3′ but not 5′ overhangs). */
export function fragmentTemplate(fragment: NebuilderFragment): { sequence: string; findings: Finding[] } {
  const sequence = fragment.sequence.toUpperCase();
  if (fragment.kind === 'pcr') return { sequence, findings: [] };
  const left = fragment.leftEnzyme ? findEnzyme(fragment.leftEnzyme) : undefined;
  const right = fragment.rightEnzyme ? findEnzyme(fragment.rightEnzyme) : undefined;
  if (!left || !right) {
    return { sequence: '', findings: [{ code: 'UNKNOWN_ENZYME', severity: 'blocker', message: `Choose two enzymes to cut out ${fragment.name}.` }] };
  }
  const molecule = { sequence, topology: fragment.topology };
  const leftSites = cutSites(molecule, [left]);
  const rightSites = cutSites(molecule, [right]);
  if (leftSites.length !== 1 || rightSites.length !== 1) {
    const problem = leftSites.length !== 1 ? left.name : right.name;
    const count = leftSites.length !== 1 ? leftSites.length : rightSites.length;
    return { sequence: '', findings: [{ code: 'NOT_SINGLE_CUTTER', severity: 'blocker', message: `${problem} cuts ${fragment.name} ${count === 0 ? 'nowhere' : `${count} times`}; choose an enzyme that cuts once.` }] };
  }
  const n = sequence.length;
  // Kept part: from the left cut's bottom-strand position (drops a 5′ overhang, keeps a 3′ one)
  // to the right cut's top-strand position.
  const start = leftSites[0]!.cutBottom;
  const end = rightSites[0]!.cutTop;
  if (fragment.topology === 'linear') {
    if (end <= start) return { sequence: '', findings: [{ code: 'EMPTY_DIGEST_FRAGMENT', severity: 'blocker', message: `${left.name} must cut ${fragment.name} upstream of ${right.name}.` }] };
    return { sequence: sequence.slice(start, end), findings: [] };
  }
  let length: number;
  if (leftSites[0]!.cutTop === rightSites[0]!.cutTop && left.name === right.name) {
    // One cut opens the circle: whole plasmid, less a 5′ overhang or plus a 3′ overhang.
    let offset = end - start;
    if (offset > n / 2) offset -= n;
    if (offset < -n / 2) offset += n;
    length = n + offset;
  } else {
    length = ((end - start) % n + n) % n;
  }
  return { sequence: sequence.repeat(3).slice(start, start + length), findings: [] };
}

function defaultMode(upstream: NebuilderFragment, downstream: NebuilderFragment): OverlapMode {
  const upstreamTailable = upstream.kind === 'pcr';
  const downstreamTailable = downstream.kind === 'pcr';
  let mode: OverlapMode = upstreamTailable && downstreamTailable ? 'split'
    : !upstreamTailable && downstreamTailable ? 'upstream'
      : upstreamTailable ? 'downstream' : 'none';
  if (mode === 'split' && upstream.isVectorBackbone) mode = 'upstream';
  if (mode === 'split' && downstream.isVectorBackbone) mode = 'downstream';
  return mode;
}

function buildOverlap(upstream: string, downstream: string, mode: OverlapMode, minLength: number, hasSpacer: boolean): { upstreamTail: string; downstreamPart: string; intrinsic: number } {
  const intrinsic = terminalOverlap(upstream, downstream, Math.min(upstream.length, downstream.length, MAX_OVERLAP_SEARCH));
  // Ends that already overlap need no tails, unless a spacer must be inserted between them.
  if (!hasSpacer && wallaceTm(downstream.slice(0, intrinsic)) >= MIN_OVERLAP_WALLACE_TM) return { upstreamTail: '', downstreamPart: '', intrinsic };
  if (mode === 'none') return { upstreamTail: '', downstreamPart: '', intrinsic };
  if (mode === 'split') {
    const boundary = Math.ceil(minLength / 2) * (gcFraction(upstream) > gcFraction(downstream) ? 1 : -1);
    if (boundary < 0) {
      const tail = upstream.slice(boundary);
      let length = Math.max(minLength + boundary, 0);
      while (wallaceTm(tail + downstream.slice(0, length)) < MIN_OVERLAP_WALLACE_TM && length < downstream.length) length += 1;
      return { upstreamTail: tail, downstreamPart: downstream.slice(0, length), intrinsic };
    }
    const part = downstream.slice(0, boundary);
    let length = Math.max(minLength - boundary, 0);
    while (wallaceTm(upstream.slice(upstream.length - length) + part) < MIN_OVERLAP_WALLACE_TM && length < upstream.length) length += 1;
    return { upstreamTail: upstream.slice(upstream.length - length), downstreamPart: part, intrinsic };
  }
  if (mode === 'downstream') {
    let length = minLength;
    while (wallaceTm(downstream.slice(0, length)) < MIN_OVERLAP_WALLACE_TM && length < downstream.length) length += 1;
    return { upstreamTail: '', downstreamPart: downstream.slice(0, length), intrinsic };
  }
  let length = minLength;
  while (wallaceTm(upstream.slice(-length)) < MIN_OVERLAP_WALLACE_TM && length < upstream.length) length += 1;
  return { upstreamTail: upstream.slice(-length), downstreamPart: '', intrinsic };
}

export function designNebuilder(fragments: NebuilderFragment[], settings: NebuilderSettings): NebuilderDesign {
  const findings: Finding[] = [];
  const empty = (extra: Finding[]): NebuilderDesign => ({ primers: [], junctions: [], templates: [], product: '', findings: [...findings, ...extra] });
  const polymerase: NebPolymerase | undefined = findPolymerase(settings.polymeraseId);
  if (!polymerase) return empty([{ code: 'UNKNOWN_POLYMERASE', severity: 'blocker', message: 'Choose a PCR polymerase.' }]);
  if (fragments.length < 2 && !(fragments.length === 1 && settings.circularize)) {
    return empty([{ code: 'INSUFFICIENT_FRAGMENTS', severity: 'blocker', message: 'Add at least two fragments (or one fragment to circularize).' }]);
  }
  const defaults = primerDefaults(polymerase);
  const conditions = { method: defaults.method, monovalentMm: polymerase.monovalentMm, primerNm: settings.primerNm ?? defaults.primerNm };
  const tm = (sequence: string) => nebTm(sequence, conditions);

  const templates = fragments.map(fragment => {
    const result = fragmentTemplate(fragment);
    findings.push(...result.findings);
    return result.sequence;
  });
  if (findings.some(finding => finding.severity === 'blocker')) return empty([]);

  const anneals = new Map<number, ReturnType<typeof selectAnnealLengths>>();
  fragments.forEach((fragment, index) => {
    if (fragment.kind !== 'pcr') return;
    try { anneals.set(index, selectAnnealLengths(templates[index]!, settings.minPrimerLength, settings.maxTmDifference, tm)); }
    catch (error) { findings.push({ code: 'PRIMER_DESIGN_FAILED', severity: 'blocker', message: `${fragment.name}: ${(error as Error).message}`, fragmentId: fragment.name }); }
  });
  if (findings.some(finding => finding.severity === 'blocker')) return empty([]);

  const forwardTails = fragments.map(() => '');
  const reverseTails = fragments.map(() => '');
  const forwardSpacers = fragments.map(() => '');
  const reverseSpacers = fragments.map(() => '');
  const junctions: NebuilderJunction[] = [];
  const count = settings.circularize ? fragments.length : fragments.length - 1;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % fragments.length;
    const up = fragments[index]!;
    const down = fragments[next]!;
    const options = settings.junctions?.[index];
    const mode = options?.mode ?? defaultMode(up, down);
    const spacer = (options?.spacer ?? '').replace(/\s/g, '').toUpperCase();
    const label = `Junction ${up.name} → ${down.name}`;
    if (spacer && !/^[ACGT]+$/.test(spacer)) findings.push({ code: 'INVALID_SPACER', severity: 'blocker', message: `${label}: the spacer may contain only A, C, G and T.`, junctionIndex: index });
    if (spacer.length > 100) findings.push({ code: 'SPACER_TOO_LONG', severity: 'blocker', message: `${label}: the spacer is longer than 100 nt.`, junctionIndex: index });
    if (spacer && mode === 'split') {
      findings.push({ code: 'SPACER_NEEDS_PLACEMENT', severity: 'blocker', message: `${label}: with a spacer, put the homology on one side (upstream or downstream); a split overlap with a spacer is not supported yet.`, junctionIndex: index });
    }
    if (spacer && ((mode === 'upstream' && down.kind !== 'pcr') || (mode === 'downstream' && up.kind !== 'pcr') || mode === 'none')) {
      findings.push({ code: 'SPACER_NEEDS_PRIMER', severity: 'blocker', message: `${label}: a spacer must be added through a PCR primer, but that side cannot carry a tail.`, junctionIndex: index });
    }
    const overlap = buildOverlap(templates[index]!, templates[next]!, mode, settings.minOverlap, spacer.length > 0);
    if (down.kind === 'pcr') { forwardTails[next] = overlap.upstreamTail; if (mode === 'upstream') forwardSpacers[next] = spacer; }
    if (up.kind === 'pcr') { reverseTails[index] = reverseComplement(overlap.downstreamPart); if (mode === 'downstream') reverseSpacers[index] = reverseComplement(spacer); }
    const added = overlap.upstreamTail.length + overlap.downstreamPart.length;
    junctions.push({
      upstream: up.name,
      downstream: down.name,
      type: `${up.kind === 'pcr' ? 'pcr' : 'redig'}${down.kind === 'pcr' ? 'pcr' : 'redig'}`,
      mode,
      upstreamTail: overlap.upstreamTail,
      downstreamTail: reverseComplement(overlap.downstreamPart),
      overlapLength: added || overlap.intrinsic,
      intrinsicOverlap: added ? 0 : overlap.intrinsic,
      spacer,
    });
  }
  if (findings.some(finding => finding.severity === 'blocker')) return empty([]);

  const primers: NebuilderPrimer[] = [];
  fragments.forEach((fragment, index) => {
    const pair = anneals.get(index);
    if (!pair) return;
    const ta = annealingTemperature(polymerase.taRule, Math.min(pair.forwardTm, pair.reverseTm), Math.min(pair.forward.length, pair.reverse.length));
    const make = (direction: 'fwd' | 'rev', overlap: string, spacer: string, anneal: string, value: number): NebuilderPrimer => ({
      name: `${fragment.name}_${direction}`,
      fragment: fragment.name,
      direction,
      overlap,
      spacer,
      anneal,
      tm: roundTenth(value),
      ta,
      gc: displayGc(overlap + spacer + anneal),
      annealGc: displayGc(anneal),
    });
    primers.push(make('fwd', forwardTails[index]!, forwardSpacers[index]!, pair.forward, pair.forwardTm));
    primers.push(make('rev', reverseTails[index]!, reverseSpacers[index]!, pair.reverse, pair.reverseTm));
  });

  // Product: templates in order, minus homology that was already present at the junctions.
  let product = templates[0]!;
  for (let index = 1; index < fragments.length; index++) {
    const junction = junctions[index - 1]!;
    product += junction.spacer + templates[index]!.slice(junction.intrinsicOverlap);
  }
  if (settings.circularize) {
    const closing = junctions[junctions.length - 1]!;
    if (closing.intrinsicOverlap) product = product.slice(0, product.length - closing.intrinsicOverlap);
    product += closing.spacer;
  }

  return {
    primers,
    junctions,
    templates: fragments.map((fragment, index) => ({ name: fragment.name, sequence: templates[index]!, kind: fragment.kind })),
    product,
    findings,
  };
}
