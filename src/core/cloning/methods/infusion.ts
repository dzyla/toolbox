/* In-Fusion cloning primer design, following the Takara Bio In-Fusion Snap Assembly
   manual and the behaviour of the Takara In-Fusion Primer Design Tool.

   Extensions (reproduced exactly against captured Takara designs, tests/fixtures/vendor/infusion):
   - The vector is opened by one or two restriction cuts, by inverse PCR, or supplied linear.
   - Each insert primer carries a 5′ extension homologous to the end of the linearised
     vector. After a restriction cut the vector end is taken as the blunt molecule:
     bases opposite a 5′ overhang are INCLUDED, bases of a 3′ overhang are EXCLUDED.
   - One insert: 15 nt extensions lying wholly in the vector. Two or more inserts: 20 nt at
     the vector junctions and 10 + 10 nt split across each insert–insert junction.
   - "Include restriction site" adds the part of the recognition site missing from the
     vector end between the extension and the gene-specific part.
   - Inverse-PCR vectors are amplified with plain primers; all homology is on the inserts.

   Gene-specific part: 18–25 nt, Tm 58–65 °C, pair ΔTm ≤ 4 °C, ≤ 2 G/C in the last five
   3′ bases (Takara guidelines). Takara's own Tm formula is not public, so we use
   SantaLucia (1998) / Owczarzy (2004) at 100 mM Na⁺ and 50 nM primer, which tracks
   Takara's reported values within about 1.5 °C; lengths can differ by a few bases. */

import { reverseComplement } from '@/core/nucleic/sequence';
import { cutSites, findEnzyme } from '../digest';
import { nebTm, roundTenth } from '../neb-tm';
import { gcPercent } from '../oligo';
import type { Finding } from '../types';

export interface InfusionInsert {
  name: string;
  sequence: string;
}

export type InfusionLinearization =
  | { method: 'digest'; enzymes: [string] | [string, string]; includeSites?: { first?: boolean; second?: boolean } }
  /** Inverse PCR: insert at the boundary before base `caret` (0-based). */
  | { method: 'pcr'; caret: number }
  /** Inverse PCR replacing the bases [start, end) of the vector. */
  | { method: 'pcr'; region: { start: number; end: number } }
  /** The vector is already linear (its ends are the insertion point). */
  | { method: 'linear' };

export interface InfusionSettings {
  /** Extension length for a single insert (default 15). */
  singleInsertOverlap?: number;
  /** Extension length at vector junctions for two or more inserts (default 20). */
  multiInsertOverlap?: number;
}

export interface InfusionPrimer {
  name: string;
  role: 'insert' | 'vector';
  direction: 'forward' | 'reverse';
  /** Homology extension (5′). */
  extension: string;
  /** Restriction-site bases between the extension and the gene-specific part. */
  site: string;
  anneal: string;
  sequence: string;
  annealTm: number;
  gc: number;
  /** Which fragment the primer amplifies. */
  target: string;
}

export interface InfusionDesign {
  primers: InfusionPrimer[];
  /** Circular product sequence, starting at the linearised vector start. */
  product: string;
  /** The linearised vector, blunt, as it enters the reaction. */
  vector: string;
  findings: Finding[];
}

const ANNEAL_MIN = 18;
const ANNEAL_MAX = 25;
const TM_MIN = 58;
const TM_MAX = 65.5; // Takara documents 65 °C; our Tm scale runs ~0.4 °C below theirs
const TM_TARGET = 64.5;
const MAX_PAIR_DELTA = 4;
const TM_CONDITIONS = { method: 4 as const, monovalentMm: 100, primerNm: 50 };

const tm = (sequence: string) => nebTm(sequence, TM_CONDITIONS);

function circularSlice(sequence: string, start: number, length: number): string {
  const n = sequence.length;
  if (length <= 0) return '';
  const from = ((start % n) + n) % n;
  return sequence.repeat(Math.ceil((from + length) / n)).slice(from, from + length);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

function gcClampOk(primer: string): boolean {
  return [...primer.slice(-5)].filter(base => base === 'G' || base === 'C').length <= 2;
}

function blocker(code: string, message: string): Finding {
  return { code, severity: 'blocker', message };
}

/** Choose gene-specific lengths for a primer pair from the two template ends. */
export function selectGeneSpecific(template: string): { forward: string; reverse: string; findings: Finding[] } {
  const findings: Finding[] = [];
  const reverseTemplate = reverseComplement(template);
  const maxLength = Math.min(ANNEAL_MAX, Math.floor(template.length / 2));
  const candidates = (source: string) => {
    const list: Array<{ length: number; tm: number; ok: boolean }> = [];
    for (let length = Math.min(ANNEAL_MIN, maxLength); length <= maxLength; length++) {
      const value = tm(source.slice(0, length));
      list.push({ length, tm: value, ok: value >= TM_MIN && value <= TM_MAX && gcClampOk(source.slice(0, length)) });
    }
    return list;
  };
  const forward = candidates(template);
  const reverse = candidates(reverseTemplate);
  const rank = (list: typeof forward) => [...list].sort((a, b) => Number(b.ok) - Number(a.ok) || Math.abs(a.tm - TM_TARGET) - Math.abs(b.tm - TM_TARGET) || a.length - b.length);
  let best: { f: (typeof forward)[number]; r: (typeof forward)[number] } | undefined;
  for (const f of rank(forward)) {
    for (const r of rank(reverse)) {
      if (Math.abs(f.tm - r.tm) > MAX_PAIR_DELTA) continue;
      const score = Number(!f.ok) + Number(!r.ok);
      const bestScore = best ? Number(!best.f.ok) + Number(!best.r.ok) : Infinity;
      const distance = Math.abs(f.tm - TM_TARGET) + Math.abs(r.tm - TM_TARGET);
      const bestDistance = best ? Math.abs(best.f.tm - TM_TARGET) + Math.abs(best.r.tm - TM_TARGET) : Infinity;
      if (score < bestScore || (score === bestScore && distance < bestDistance)) best = { f, r };
    }
  }
  if (!best) best = { f: rank(forward)[0]!, r: rank(reverse)[0]! };
  if (!best.f.ok || !best.r.ok) {
    findings.push({ code: 'PRIMER_CONSTRAINTS_RELAXED', severity: 'warning', message: 'No primer pair meets every guideline (18–25 nt, Tm 58–65 °C, 3′ G/C clamp of at most 2 of the last 5 bases); the closest pair was used.' });
  }
  return { forward: template.slice(0, best.f.length), reverse: reverseTemplate.slice(0, best.r.length), findings };
}

interface Opened {
  /** Linearised vector, blunt. */
  vector: string;
  /** Site bases to add on the left of the insert / right of the insert (top-strand sense). */
  leftSite: string;
  rightSite: string;
  findings: Finding[];
}

function overhangShift(cutTop: number, cutBottom: number, n: number): number {
  let d = mod(cutBottom - cutTop, n);
  if (d > n / 2) d -= n;
  return d;
}

function openVector(vectorSequence: string, circular: boolean, how: InfusionLinearization): Opened {
  const findings: Finding[] = [];
  const n = vectorSequence.length;
  const fail = (finding: Finding): Opened => ({ vector: '', leftSite: '', rightSite: '', findings: [finding] });

  if (how.method === 'linear') {
    if (circular) return fail(blocker('VECTOR_NOT_LINEAR', 'The vector is circular; choose restriction digest or inverse PCR to open it.'));
    return { vector: vectorSequence, leftSite: '', rightSite: '', findings };
  }
  if (!circular) return fail(blocker('VECTOR_NOT_CIRCULAR', 'Only circular vectors can be opened by restriction digest or inverse PCR.'));

  if (how.method === 'pcr') {
    const [start, end] = 'caret' in how ? [how.caret, how.caret] : [how.region.start, how.region.end];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > n || end < start) {
      return fail(blocker('INVALID_PCR_REGION', `The inverse-PCR insertion point must lie within the ${n} bp vector.`));
    }
    const length = n - (end - start);
    if (length < 100) findings.push({ code: 'SHORT_BACKBONE', severity: 'warning', message: 'The vector backbone is under 100 bp; check the deleted region.' });
    return { vector: circularSlice(vectorSequence, end, length), leftSite: '', rightSite: '', findings };
  }

  const molecule = { sequence: vectorSequence, topology: 'circular' as const };
  const names = how.enzymes;
  const enzymes = names.map(name => ({ name, enzyme: findEnzyme(name) }));
  const unknown = enzymes.find(entry => !entry.enzyme);
  if (unknown) return fail(blocker('UNKNOWN_ENZYME', `${unknown.name} is not in the enzyme list.`));
  const sites = enzymes.map(entry => cutSites(molecule, [entry.enzyme!]));
  const bad = sites.findIndex(list => list.length !== 1);
  if (bad !== -1) {
    const count = sites[bad]!.length;
    return fail(blocker('NOT_SINGLE_CUTTER', `${names[bad]} cuts the vector ${count === 0 ? 'nowhere' : `${count} times`}; choose an enzyme that cuts it once.`));
  }
  const first = sites[0]![0]!;
  const second = (sites[1] ?? sites[0])![0]!;
  const same = names.length === 1 || names[0] === names[1];
  const dFirst = overhangShift(first.cutTop, first.cutBottom, n);
  const start = second.cutTop;
  const length = same ? n + dFirst : mod(first.cutTop + dFirst - second.cutTop, n) || n;
  if (length < 100) findings.push({ code: 'SHORT_BACKBONE', severity: 'warning', message: 'The vector backbone is under 100 bp; the cuts may be in the wrong order.' });
  const vector = circularSlice(vectorSequence, start, length);

  const include = how.includeSites;
  let leftSite = '';
  let rightSite = '';
  const insideSite = (site: typeof first, name: string) => {
    const enzyme = findEnzyme(name)!;
    const from = site.sitePosition;
    return site.cutTop >= from && site.cutTop <= from + enzyme.site.length && site.cutBottom >= from && site.cutBottom <= from + enzyme.site.length;
  };
  if (include?.first) {
    if (!insideSite(first, names[0])) findings.push({ code: 'SITE_OUTSIDE', severity: 'warning', message: `${names[0]} cuts outside its recognition site, so the site cannot be included.` });
    else {
      const siteEnd = first.sitePosition + findEnzyme(names[0])!.site.length;
      const armEnd = first.cutTop + dFirst;
      leftSite = circularSlice(vectorSequence, armEnd, siteEnd - armEnd);
    }
  }
  if (include?.second) {
    const name = names[1] ?? names[0];
    if (!insideSite(second, name)) findings.push({ code: 'SITE_OUTSIDE', severity: 'warning', message: `${name} cuts outside its recognition site, so the site cannot be included.` });
    else rightSite = circularSlice(vectorSequence, second.sitePosition, second.cutTop - second.sitePosition);
  }
  return { vector, leftSite, rightSite, findings };
}

function primer(name: string, role: InfusionPrimer['role'], direction: InfusionPrimer['direction'], extension: string, site: string, anneal: string, target: string): InfusionPrimer {
  return {
    name, role, direction, extension, site, anneal, target,
    sequence: extension + site + anneal,
    annealTm: roundTenth(tm(anneal)),
    gc: Math.round(gcPercent(extension + site + anneal)),
  };
}

export function designInfusion(
  vectorSequence: string,
  vectorTopology: 'circular' | 'linear',
  linearization: InfusionLinearization,
  inserts: InfusionInsert[],
  settings: InfusionSettings = {},
): InfusionDesign {
  const findings: Finding[] = [];
  const empty = (extra: Finding[]): InfusionDesign => ({ primers: [], product: '', vector: '', findings: [...findings, ...extra] });
  const clean = (text: string) => text.replace(/\s/g, '').toUpperCase();
  const vectorSeq = clean(vectorSequence);
  if (!/^[ACGT]+$/.test(vectorSeq)) return empty([blocker('INVALID_VECTOR', 'The vector sequence is empty or contains characters other than A, C, G and T.')]);
  if (!inserts.length) return empty([blocker('NO_INSERT', 'Add at least one insert.')]);
  const cleaned = inserts.map((insert, index) => ({ name: insert.name.trim() || `Insert ${index + 1}`, sequence: clean(insert.sequence) }));
  for (const insert of cleaned) {
    if (!/^[ACGT]+$/.test(insert.sequence)) return empty([blocker('INVALID_INSERT', `${insert.name}: the sequence is empty or contains characters other than A, C, G and T.`)]);
    if (insert.sequence.length < 2 * ANNEAL_MIN) return empty([blocker('INSERT_TOO_SHORT', `${insert.name} is shorter than ${2 * ANNEAL_MIN} bp, too short for two ${ANNEAL_MIN}-nt gene-specific primers.`)]);
  }

  const opened = openVector(vectorSeq, vectorTopology === 'circular', linearization);
  findings.push(...opened.findings);
  if (opened.findings.some(finding => finding.severity === 'blocker')) return empty([]);

  const multi = cleaned.length > 1;
  const vectorOverlap = multi ? settings.multiInsertOverlap ?? 20 : settings.singleInsertOverlap ?? 15;
  const insertOverlap = 10;
  if (opened.vector.length < vectorOverlap + 2) return empty([blocker('VECTOR_TOO_SHORT', 'The linearised vector is too short to carry the homology arms.')]);
  const leftArm = opened.vector.slice(-vectorOverlap);
  const rightArm = opened.vector.slice(0, vectorOverlap);

  const primers: InfusionPrimer[] = [];
  cleaned.forEach((insert, index) => {
    const specific = selectGeneSpecific(insert.sequence);
    findings.push(...specific.findings.map(finding => ({ ...finding, message: `${insert.name}: ${finding.message}` })));
    const first = index === 0;
    const last = index === cleaned.length - 1;
    const forwardExtension = first ? leftArm : cleaned[index - 1]!.sequence.slice(-insertOverlap);
    const reverseExtension = last ? reverseComplement(rightArm) : reverseComplement(cleaned[index + 1]!.sequence.slice(0, insertOverlap));
    primers.push(primer(`${insert.name}_fwd`, 'insert', 'forward', forwardExtension, first ? opened.leftSite : '', specific.forward, insert.name));
    primers.push(primer(`${insert.name}_rev`, 'insert', 'reverse', reverseExtension, last ? reverseComplement(opened.rightSite) : '', specific.reverse, insert.name));
  });

  if ('method' in linearization && linearization.method === 'pcr') {
    const specific = selectGeneSpecific(opened.vector);
    findings.push(...specific.findings.map(finding => ({ ...finding, message: `Vector: ${finding.message}` })));
    primers.push(primer('vector_fwd', 'vector', 'forward', '', '', specific.forward, 'vector'));
    primers.push(primer('vector_rev', 'vector', 'reverse', '', '', specific.reverse, 'vector'));
  }

  const product = opened.vector + opened.leftSite + cleaned.map(insert => insert.sequence).join('') + opened.rightSite;
  return { primers, product, vector: opened.vector, findings };
}
