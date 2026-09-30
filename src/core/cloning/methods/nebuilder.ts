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
     3′ overhangs; 5′ overhangs are removed by the exonuclease and not used as homology.
   - An explicit junction share (fwdTailShare) splits the overlap between the two primers by fraction instead of NEBuilder's GC-biased half; it is a Bio-Bench extension and is not part of the reference tests. */

import { reverseComplement } from '@/core/nucleic/sequence';
import { findEnzyme, cutSites } from '../digest';
import { nebTm, roundTenth, wallaceTm } from '../neb-tm';
import { annealingTemperature, findPolymerase, primerDefaults, type NebPolymerase } from './neb-polymerases';
import type { Finding } from '../types';

/** Where a circular PCR source is opened: before a base (`caret`, 0-based) or by removing bases [start, end) (start > end wraps the origin). */
export type OpenSite = { caret: number } | { start: number; end: number };

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
  /** Only for a circular `pcr` source: where to open the circle. Unset amplifies the circle as given. */
  open?: OpenSite;
}

export interface JunctionOptions {
  /** Bases inserted between the two fragments (top-strand sense, ≤ 100 nt). */
  spacer?: string;
  /** Force where the homology is placed; defaults follow the fragment types. */
  mode?: OverlapMode;
  /**
   * Fraction (0–1) of the overlap carried as the tail of the downstream fragment's forward primer; the rest is
   * carried on the upstream fragment's reverse primer. Overrides `mode`. Unset follows NEBuilder's own placement.
   */
  fwdTailShare?: number;
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
  templates: Array<{ name: string; sequence: string; kind: 'pcr' | 'digest'; /** 0-based start of the template in its source sequence */ start: number }>;
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

/** A share counts as chosen unless it is missing or NaN; ±Infinity clamp to 1 and 0. */
const shareChosen = (share: number | undefined): share is number => typeof share === 'number' && !Number.isNaN(share);

const clamped = (sequence: string) => /[GC]$/.test(sequence);

export interface PrimerPairLimits {
  minTm: number;
  maxTm: number;
}

/**
 * NEB primer-pair selection from two anchors, each read 5′→3′ in primer sense:
 * `forwardSource` starts at the forward primer's 3′-complementary end of the template,
 * `reverseSource` at the reverse primer's.
 */
export function selectPrimerPair(
  forwardSource: string,
  reverseSource: string,
  minLength: number,
  maxTmDifference: number,
  tm: (sequence: string) => number,
  limits: PrimerPairLimits = { minTm: PRIMER_MIN_TM, maxTm: PRIMER_MAX_TM },
): { forward: string; reverse: string; forwardTm: number; reverseTm: number } {
  if (minLength > forwardSource.length || minLength > reverseSource.length) throw new Error(`The template is too short for ${minLength}-nt primers.`);

  const grow = (source: string) => {
    const n = source.length;
    let length = minLength;
    let value = tm(source.slice(0, length));
    let fallback = length;
    while (value < limits.minTm && length < n) { length += 1; value = tm(source.slice(0, length)); fallback = length; }
    while (value < limits.maxTm && !clamped(source.slice(0, length)) && length < n) { length += 1; value = tm(source.slice(0, length)); }
    if (!clamped(source.slice(0, length))) { length = fallback; value = tm(source.slice(0, length)); }
    return { length, value };
  };
  let fwd = grow(forwardSource);
  let rev = grow(reverseSource);

  // Balance the pair: lengthen the cooler primer, then seek a clamp without overtaking the warmer one.
  const balance = (cool: { length: number; value: number }, hotValue: number, source: string) => {
    const n = source.length;
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
  if (fwd.value > rev.value) rev = balance(rev, fwd.value, reverseSource);
  if (rev.value > fwd.value) fwd = balance(fwd, rev.value, forwardSource);
  return { forward: forwardSource.slice(0, fwd.length), reverse: reverseSource.slice(0, rev.length), forwardTm: fwd.value, reverseTm: rev.value };
}

/** NEBuilder primer-pair anneal selection for one template (both primers bind its two ends). */
export function selectAnnealLengths(template: string, minLength: number, maxTmDifference: number, tm: (sequence: string) => number): { forward: string; reverse: string; forwardTm: number; reverseTm: number } {
  const n = template.length;
  if (minLength > n || 2 * minLength > n) throw new Error(`Fragment of ${n} bp is too short for two ${minLength}-nt primers.`);
  const pair = selectPrimerPair(template, reverseComplement(template), minLength, maxTmDifference, tm);
  if (pair.forward.length + pair.reverse.length > n) throw new Error('The forward and reverse primers would overlap on this fragment.');
  return pair;
}

function openedTemplate(fragment: NebuilderFragment, sequence: string, open: OpenSite): { sequence: string; start: number; findings: Finding[] } {
  const n = sequence.length;
  const invalid = (message: string) => ({
    sequence: '', start: 0,
    findings: [{ code: 'INVALID_OPEN_SITE', severity: 'blocker' as const, message: `${fragment.name}: ${message}`, fragmentId: fragment.name }],
  });
  if (n === 0) return invalid('the sequence is empty, so there is nowhere to open it.');
  if ('caret' in open) {
    if (!Number.isInteger(open.caret) || open.caret < 0 || open.caret > n) return invalid(`choose an opening position from 0 to ${n}.`);
    const start = open.caret % n;
    return { sequence: sequence.slice(start) + sequence.slice(0, start), start, findings: [] };
  }
  const { start, end } = open;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= n || end < 0 || end > n) {
    return invalid(`the replaced region must lie within the ${n} bp sequence.`);
  }
  const first = end % n;
  const removed = (((first - start) % n) + n) % n;
  if (start === 0 && end === n) return invalid('the replaced region covers the whole sequence; open at a position instead.');
  if (removed === 0) return invalid('the replaced region is empty; open at a position instead.');
  return { sequence: (sequence.slice(first) + sequence.slice(0, first)).slice(0, n - removed), start: first, findings: [] };
}

/** Template of a fragment as NEBuilder uses it (digested fragments keep 3′ but not 5′ overhangs). */
export function fragmentTemplate(fragment: NebuilderFragment): { sequence: string; /** 0-based start in the source sequence */ start: number; findings: Finding[] } {
  const sequence = fragment.sequence.toUpperCase();
  if (fragment.kind === 'pcr') {
    if (!fragment.open || fragment.topology !== 'circular') return { sequence, start: 0, findings: [] };
    return openedTemplate(fragment, sequence, fragment.open);
  }
  const left = fragment.leftEnzyme ? findEnzyme(fragment.leftEnzyme) : undefined;
  const right = fragment.rightEnzyme ? findEnzyme(fragment.rightEnzyme) : undefined;
  if (!left || !right) {
    return { sequence: '', start: 0, findings: [{ code: 'UNKNOWN_ENZYME', severity: 'blocker', message: `Choose two enzymes to cut out ${fragment.name}.` }] };
  }
  const molecule = { sequence, topology: fragment.topology };
  const leftSites = cutSites(molecule, [left]);
  const rightSites = cutSites(molecule, [right]);
  if (leftSites.length !== 1 || rightSites.length !== 1) {
    const problem = leftSites.length !== 1 ? left.name : right.name;
    const count = leftSites.length !== 1 ? leftSites.length : rightSites.length;
    return { sequence: '', start: 0, findings: [{ code: 'NOT_SINGLE_CUTTER', severity: 'blocker', message: `${problem} cuts ${fragment.name} ${count === 0 ? 'nowhere' : `${count} times`}; choose an enzyme that cuts once.` }] };
  }
  const n = sequence.length;
  // Kept part: from the left cut's bottom-strand position (drops a 5′ overhang, keeps a 3′ one)
  // to the right cut's top-strand position.
  const start = leftSites[0]!.cutBottom;
  const end = rightSites[0]!.cutTop;
  if (fragment.topology === 'linear') {
    if (end <= start) return { sequence: '', start: 0, findings: [{ code: 'EMPTY_DIGEST_FRAGMENT', severity: 'blocker', message: `${left.name} must cut ${fragment.name} upstream of ${right.name}.` }] };
    return { sequence: sequence.slice(start, end), start, findings: [] };
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
  return { sequence: sequence.repeat(3).slice(start, start + length), start: ((start % n) + n) % n, findings: [] };
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

/** Overlap with an explicit split: `share` of its bases come from the upstream sequence (forward-primer tail), the rest from the downstream sequence. */
function sharedOverlap(upstream: string, downstream: string, minLength: number, share: number, intrinsic: number): { upstreamTail: string; downstreamPart: string; intrinsic: number } {
  const at = (total: number) => {
    const fromUpstream = Math.min(Math.round(total * share), upstream.length);
    const fromDownstream = Math.min(total - fromUpstream, downstream.length);
    return { tail: fromUpstream ? upstream.slice(upstream.length - fromUpstream) : '', part: downstream.slice(0, fromDownstream) };
  };
  let chosen = at(minLength);
  for (let total = minLength; total <= minLength + MAX_OVERLAP_SEARCH; total++) {
    chosen = at(total);
    if (wallaceTm(chosen.tail + chosen.part) >= MIN_OVERLAP_WALLACE_TM) break;
  }
  return { upstreamTail: chosen.tail, downstreamPart: chosen.part, intrinsic };
}

function buildOverlap(upstream: string, downstream: string, mode: OverlapMode, minLength: number, hasSpacer: boolean, share?: number): { upstreamTail: string; downstreamPart: string; intrinsic: number } {
  const intrinsic = terminalOverlap(upstream, downstream, Math.min(upstream.length, downstream.length, MAX_OVERLAP_SEARCH));
  // Ends that already overlap need no tails, unless a spacer must be inserted between them.
  if (!hasSpacer && wallaceTm(downstream.slice(0, intrinsic)) >= MIN_OVERLAP_WALLACE_TM) return { upstreamTail: '', downstreamPart: '', intrinsic };
  if (mode === 'none') return { upstreamTail: '', downstreamPart: '', intrinsic };
  if (mode === 'split' && share !== undefined) return sharedOverlap(upstream, downstream, minLength, share, intrinsic);
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

  const starts: number[] = [];
  const templates = fragments.map(fragment => {
    const result = fragmentTemplate(fragment);
    findings.push(...result.findings);
    starts.push(result.start);
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
    let mode = options?.mode ?? defaultMode(up, down);
    let share: number | undefined;
    let sharedByUser = false;
    if (shareChosen(options?.fwdTailShare)) {
      let wanted = Math.min(1, Math.max(0, options!.fwdTailShare!));
      const forwardCarrier = down.kind === 'pcr'; // the downstream forward primer holds the upstream tail
      const reverseCarrier = up.kind === 'pcr';   // the upstream reverse primer holds the downstream part
      const adjusted = !forwardCarrier && wanted > 0 ? 0 : !reverseCarrier && wanted < 1 ? 1 : wanted;
      if (adjusted !== wanted) {
        wanted = adjusted;
        findings.push({ code: 'SHARE_ADJUSTED', severity: 'info', message: `Junction ${up.name} → ${down.name}: ${forwardCarrier || reverseCarrier ? 'one side is a restriction-digested fragment and cannot carry a tail, so the whole overlap goes on the PCR side' : 'neither side can carry a tail'}.`, junctionIndex: index });
      }
      mode = !forwardCarrier && !reverseCarrier ? 'none' : wanted === 0 ? 'downstream' : wanted === 1 ? 'upstream' : 'split';
      share = mode === 'split' ? wanted : undefined;
      sharedByUser = mode !== 'none';
    }
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
    const overlap = buildOverlap(templates[index]!, templates[next]!, mode, settings.minOverlap, spacer.length > 0, share);
    if (down.kind === 'pcr') { forwardTails[next] = overlap.upstreamTail; if (mode === 'upstream') forwardSpacers[next] = spacer; }
    if (up.kind === 'pcr') { reverseTails[index] = reverseComplement(overlap.downstreamPart); if (mode === 'downstream') reverseSpacers[index] = reverseComplement(spacer); }
    const added = overlap.upstreamTail.length + overlap.downstreamPart.length;
    if (sharedByUser && added > 0 && added < settings.minOverlap) {
      findings.push({ code: 'OVERLAP_SHORTER_THAN_REQUESTED', severity: 'warning', message: `${label}: the overlap is only ${added} nt, less than the ${settings.minOverlap} nt asked for, because a fragment is too short to carry its share. Move part of it to the other primer.`, junctionIndex: index });
    }
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

  if (settings.junctions?.some(options => shareChosen(options?.fwdTailShare))) {
    for (const item of primers) {
      const length = item.overlap.length + item.spacer.length + item.anneal.length;
      if (length > 60) findings.push({ code: 'LONG_PRIMER', severity: 'warning', message: `${item.name} is ${length} nt long; primers over 60 nt are costly and error-prone. Move part of the overlap to the neighbouring primer.` });
    }
  }

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
    templates: fragments.map((fragment, index) => ({ name: fragment.name, sequence: templates[index]!, kind: fragment.kind, start: starts[index]! })),
    product,
    findings,
  };
}
