/* Site-directed mutagenesis and amino-acid changes with back-to-back primers (Q5 SDM + KLD),
   following the NEBaseChanger design for primers whose mutation sits in the 5′ tail.

   Rules (reproduced exactly on the captured NEBaseChanger v2.8.4 cases,
   tests/fixtures/vendor/basechanger):
   - Two non-overlapping primers point away from each other: the forward primer anneals
     from the first base after the edit, the reverse primer ends at the last base before it.
   - Inserted or substituted bases (the "edit") are carried on 5′ tails: up to 6 nt entirely on
     the forward primer; longer edits are split, the forward primer taking the larger half.
   - Anneal lengths come from the NEB primer loops (grow to Tm ≥ 55 °C, G/C clamp, balance
     the pair to ΔTm ≤ 5 °C, Tm ceiling 72 °C) with the Q5 Tm calculator; Ta = lower Tm + 1 °C.
   - New codons follow E. coli usage (most frequent) or minimal change from the old codon.

   NOT covered: NEBaseChanger's default design for edits of 5 nt or fewer places the change
   inside the primer and uses a mismatch-aware Tm; that variant is not implemented. */

import { reverseComplement } from '@/core/nucleic/sequence';
import { ECOLI_CODON_USAGE, HOST_CODON_USAGE, type HostOrganism } from '@/core/rare-codons';
import { nebTm, roundTenth } from '../neb-tm';
import { annealingTemperature } from './neb-polymerases';
import { selectPrimerPair } from './nebuilder';
import type { Finding } from '../types';
import type { CloningProtocol } from '../protocol';

const SDM_TM = { method: 4 as const, monovalentMm: 150, primerNm: 500 };
const tm = (sequence: string) => nebTm(sequence, SDM_TM);
const SDM_LIMITS = { minTm: 55, maxTm: 72 };
const MAX_TAIL_ON_FORWARD = 6;
const MIN_PRIMER_LENGTH = 15;
const MIN_PLASMID_LENGTH = 60;
const MAX_MERGE_SPAN_PER_EDIT = 8;

export interface SdmEdit {
  /** 0-based, half-open interval replaced. start === end is a pure insertion. */
  start: number;
  end: number;
  /** New bases (empty for a deletion). */
  replacement: string;
  label: string;
}

export interface SdmPrimer {
  name: string;
  direction: 'forward' | 'reverse';
  /** 5′ tail carrying the edit (lower case in vendor output). */
  tail: string;
  anneal: string;
  sequence: string;
  annealTm: number;
  gc: number;
}

export interface SdmDesign {
  label: string;
  description: string;
  forward: SdmPrimer;
  reverse: SdmPrimer;
  /** Annealing temperature for the pair, °C. */
  ta: number;
  /** Plasmid after the edit (same coordinates as the input, with the edit spliced in). */
  product: string;
  edit: SdmEdit;
  findings: Finding[];
}

export interface SdmOptions {
  minPrimerLength?: number;
  /** Placeholder for the shared-model minimum Tm (NEB: 55–72). */
  minTm?: number;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

function circularSlice(sequence: string, start: number, length: number): string {
  const n = sequence.length;
  if (length <= 0) return '';
  const from = mod(start, n);
  return sequence.repeat(Math.ceil((from + length) / n) + 1).slice(from, from + length);
}

function gc(sequence: string): number {
  return Math.round([...sequence].filter(base => base === 'G' || base === 'C').length / sequence.length * 100);
}

export function isSdmDesign(result: SdmDesign | { findings: Finding[] }): result is SdmDesign {
  return 'forward' in result;
}

/** Edit-to-primer design on a circular plasmid. */
export function designSdm(plasmid: string, edit: SdmEdit, options: SdmOptions = {}): SdmDesign | { findings: Finding[] } {
  const sequence = plasmid.replace(/\s/g, '').toUpperCase();
  const n = sequence.length;
  const fail = (code: string, message: string) => ({ findings: [{ code, severity: 'blocker' as const, message }] });
  if (n < MIN_PLASMID_LENGTH) return fail('SEQUENCE_TOO_SHORT', `The sequence is ${n} bp; at least ${MIN_PLASMID_LENGTH} bp are needed.`);
  if (!/^[ACGT]+$/.test(sequence)) return fail('INVALID_SEQUENCE', 'The plasmid sequence may contain only A, C, G and T.');
  if (edit.start < 0 || edit.end < edit.start || edit.end > n) return fail('INVALID_EDIT', `The edit ${edit.start + 1}–${edit.end} lies outside the ${n} bp sequence.`);
  const replacement = edit.replacement.toUpperCase();
  if (replacement && !/^[ACGT]+$/.test(replacement)) return fail('INVALID_REPLACEMENT', 'The new sequence may contain only A, C, G and T.');
  const removed = edit.end - edit.start;
  if (!removed && !replacement) return fail('EMPTY_EDIT', 'Nothing to change: the edit neither removes nor adds bases.');
  if (n - removed < 2 * MIN_PRIMER_LENGTH) return fail('SEQUENCE_TOO_SHORT_AFTER_EDIT', 'Too little sequence remains around the edit for two primers.');

  const minLength = Math.max(options.minPrimerLength ?? MIN_PRIMER_LENGTH, MIN_PRIMER_LENGTH);
  const span = Math.min(n - removed, 120);
  const forwardSource = circularSlice(sequence, edit.end, span);
  const reverseSource = reverseComplement(circularSlice(sequence, edit.start - span, span));
  let pair;
  try { pair = selectPrimerPair(forwardSource, reverseSource, minLength, 5, tm, SDM_LIMITS); }
  catch (error) { return fail('PRIMER_DESIGN_FAILED', (error as Error).message); }

  // Tails: up to 6 nt on the forward primer, otherwise split with the larger half forward.
  let forwardTail = replacement;
  let reverseTail = '';
  if (replacement.length > MAX_TAIL_ON_FORWARD) {
    const k = Math.floor(replacement.length / 2);
    forwardTail = replacement.slice(k);
    reverseTail = reverseComplement(replacement.slice(0, k));
  }
  const build = (name: string, direction: SdmPrimer['direction'], tail: string, anneal: string, value: number): SdmPrimer => ({
    name, direction, tail, anneal, sequence: tail + anneal, annealTm: roundTenth(value), gc: gc(tail + anneal),
  });
  const forward = build(`${edit.label}_F`, 'forward', forwardTail, pair.forward, pair.forwardTm);
  const reverse = build(`${edit.label}_R`, 'reverse', reverseTail, pair.reverse, pair.reverseTm);
  const ta = annealingTemperature('q5', Math.min(pair.forwardTm, pair.reverseTm), Math.min(pair.forward.length, pair.reverse.length));

  const product = sequence.slice(0, edit.start) + replacement + sequence.slice(edit.end);
  const original = sequence.slice(edit.start, edit.end).toLowerCase();
  const description = !removed
    ? `Insert ${replacement} between bases ${edit.start}-${edit.start + 1}`
    : !replacement
      ? `Delete ${original} between bases ${edit.start}-${edit.end + 1}`
      : `Replace ${original} between bases ${edit.start}-${edit.end + 1} with ${replacement}`;
  return { label: edit.label, description, forward, reverse, ta, product, edit: { ...edit, replacement }, findings: [] };
}

/* ---------- amino-acid changes ---------- */

export interface ParsedMutation {
  raw: string;
  from: string;
  position: number;
  to: string;
  /** Exact new codon requested with `:XYZ`. */
  codon?: string;
}

export type CodonStrategy = 'usage' | 'minimal';

const THREE_TO_ONE: Record<string, string> = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C', Gln: 'Q', Glu: 'E', Gly: 'G', His: 'H', Ile: 'I',
  Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P', Ser: 'S', Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V', Ter: '*', Stop: '*',
};

/** Groups separated by commas/spaces are separate designs; `+` joins mutations into one multi-mutant. */
export function parseMutations(text: string): { groups: ParsedMutation[][]; errors: string[] } {
  const groups: ParsedMutation[][] = [];
  const errors: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const group: ParsedMutation[] = [];
    for (const part of token.split('+').filter(Boolean)) {
      const cleaned = part.replace(/^p\./, '');
      const three = cleaned.match(/^([A-Za-z]{3,4})(\d+)([A-Za-z]{3,4})(?::([ACGTacgt]{3}))?$/);
      const one = cleaned.match(/^([A-Za-z*])(\d+)([A-Za-z*])(?::([ACGTacgt]{3}))?$/);
      const title = (word: string) => word[0]!.toUpperCase() + word.slice(1).toLowerCase();
      if (one) group.push({ raw: part, from: one[1]!.toUpperCase(), position: Number(one[2]), to: one[3]!.toUpperCase(), codon: one[4]?.toUpperCase() });
      else if (three && THREE_TO_ONE[title(three[1]!)] && THREE_TO_ONE[title(three[3]!)]) {
        group.push({ raw: part, from: THREE_TO_ONE[title(three[1]!)]!, position: Number(three[2]), to: THREE_TO_ONE[title(three[3]!)]!, codon: three[4]?.toUpperCase() });
      } else errors.push(`Could not read "${part}" (use e.g. Y127F or p.Tyr127Phe).`);
    }
    if (group.length) groups.push(group);
  }
  return { groups, errors };
}

const BASES = ['T', 'C', 'A', 'G'];
const GENETIC_CODE: Record<string, string> = (() => {
  const amino = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  const table: Record<string, string> = {};
  let index = 0;
  for (const a of BASES) for (const b of BASES) for (const c of BASES) table[a + b + c] = amino[index++]!;
  return table;
})();

export function translateCodon(codon: string): string {
  return GENETIC_CODE[codon.toUpperCase()] ?? 'X';
}

/** Choose the new codon for an amino acid (NEBaseChanger: usage or minimal change). */
export function chooseCodon(oldCodon: string, aminoAcid: string, strategy: CodonStrategy, host: HostOrganism = 'ecoli'): string | null {
  const options = Object.keys(GENETIC_CODE).filter(codon => GENETIC_CODE[codon] === aminoAcid);
  if (!options.length) return null;
  if (strategy === 'minimal') {
    const distance = (codon: string) => [...codon].filter((base, index) => base !== oldCodon[index]).length;
    return [...options].sort((a, b) => distance(a) - distance(b))[0]!;
  }
  const usage = HOST_CODON_USAGE[host] ?? ECOLI_CODON_USAGE;
  return [...options].sort((a, b) => (usage[b]?.frequencyPerThousand ?? 0) - (usage[a]?.frequencyPerThousand ?? 0))[0]!;
}

export interface OrfSite {
  /** 0-based index of the first base of the start codon, in the orientation of the sequence given.
   *  For a gene on the other strand, pass the reverse-complemented plasmid. */
  start: number;
}

export interface AminoAcidOptions extends SdmOptions {
  strategy?: CodonStrategy;
  host?: HostOrganism;
}

export interface AminoAcidResult {
  label: string;
  mutations: ParsedMutation[];
  design: SdmDesign | null;
  /** Consecutive rounds when the mutations are too far apart to share primers. */
  rounds?: SdmDesign[];
  findings: Finding[];
}

function protein(sequence: string, orf: OrfSite): string {
  let residues = '';
  for (let i = orf.start; i + 3 <= sequence.length; i += 3) {
    const aa = translateCodon(sequence.slice(i, i + 3));
    residues += aa;
    if (aa === '*') break;
  }
  return residues;
}

function editFor(sequence: string, orf: OrfSite, mutation: ParsedMutation, options: AminoAcidOptions): { edit?: SdmEdit; findings: Finding[] } {
  const findings: Finding[] = [];
  const residues = protein(sequence, orf);
  if (mutation.position < 1 || mutation.position > residues.length) {
    return { findings: [{ code: 'POSITION_OUT_OF_RANGE', severity: 'blocker', message: `${mutation.raw}: the ORF has ${residues.length} residues, so position ${mutation.position} does not exist.` }] };
  }
  const start = orf.start + (mutation.position - 1) * 3;
  const oldCodon = sequence.slice(start, start + 3);
  const found = translateCodon(oldCodon);
  if (found !== mutation.from) findings.push({ code: 'RESIDUE_MISMATCH', severity: 'warning', message: `${mutation.raw}: ${found} found at ${mutation.position} instead of ${mutation.from}.` });
  let codon: string | null;
  if (mutation.codon) {
    if (translateCodon(mutation.codon) !== mutation.to) return { findings: [...findings, { code: 'CODON_MISMATCH', severity: 'blocker', message: `${mutation.raw}: ${mutation.codon} encodes ${translateCodon(mutation.codon)}, not ${mutation.to}.` }] };
    codon = mutation.codon;
  } else codon = chooseCodon(oldCodon, mutation.to, options.strategy ?? 'usage', options.host);
  if (!codon) return { findings: [...findings, { code: 'UNKNOWN_RESIDUE', severity: 'blocker', message: `${mutation.raw}: "${mutation.to}" is not an amino acid (use a one-letter code, or * for stop).` }] };
  if (codon === oldCodon) return { findings: [...findings, { code: 'NO_CHANGE', severity: 'blocker', message: `${mutation.raw}: residue ${mutation.position} is already ${mutation.to}, encoded by ${oldCodon}; the chosen codon is the same, so there is nothing to change.` }] };
  if (found === mutation.to) findings.push({ code: 'SILENT_CHANGE', severity: 'warning', message: `${mutation.raw}: residue ${mutation.position} is already ${mutation.to}; this is a silent change of ${oldCodon} to ${codon}.` });
  return { edit: { start, end: start + 3, replacement: codon, label: mutation.raw }, findings };
}

/**
 * Design primers for amino-acid changes in an ORF. Separate mutations (comma or space) give
 * separate designs; mutations joined with `+` are combined in one design when they lie close
 * enough to share a primer pair, otherwise planned as consecutive rounds.
 */
export function designAminoAcidChanges(plasmid: string, orf: OrfSite, text: string, options: AminoAcidOptions = {}): { results: AminoAcidResult[]; errors: string[] } {
  const oriented = plasmid.replace(/\s/g, '').toUpperCase();
  const site: OrfSite = { start: mod(orf.start, oriented.length) };
  const { groups, errors } = parseMutations(text);
  const results = groups.map((group): AminoAcidResult => {
    const label = group.map(mutation => mutation.raw).join('+');
    const findings: Finding[] = [];
    const edits: SdmEdit[] = [];
    for (const mutation of group) {
      const built = editFor(oriented, site, mutation, options);
      findings.push(...built.findings);
      if (built.edit) edits.push(built.edit);
    }
    if (findings.some(finding => finding.severity === 'blocker') || edits.length !== group.length) return { label, mutations: group, design: null, findings };
    if (edits.length === 1) {
      const design = designSdm(oriented, { ...edits[0]!, label }, options);
      if (!('forward' in design)) return { label, mutations: group, design: null, findings: [...findings, ...design.findings] };
      return { label, mutations: group, design, findings: [...findings, ...design.findings] };
    }
    const ordered = [...edits].sort((a, b) => a.start - b.start);
    const span = ordered[ordered.length - 1]!.end - ordered[0]!.start;
    if (span <= MAX_MERGE_SPAN_PER_EDIT * edits.length) {
      const first = ordered[0]!.start;
      let replacement = '';
      let cursor = first;
      for (const edit of ordered) {
        replacement += oriented.slice(cursor, edit.start) + edit.replacement;
        cursor = edit.end;
      }
      const merged = designSdm(oriented, { start: first, end: cursor, replacement, label }, options);
      if (!('forward' in merged)) return { label, mutations: group, design: null, findings: [...findings, ...merged.findings] };
      return { label, mutations: group, design: merged, findings: [...findings, ...merged.findings] };
    }
    // Too far apart for one primer pair: one round per mutation, each on the previous product.
    const rounds: SdmDesign[] = [];
    let template = oriented;
    for (const edit of ordered) {
      // Earlier rounds do not change the length (codon substitutions), so coordinates stay valid.
      const round = designSdm(template, { ...edit, label: edit.label }, options);
      if (!('forward' in round)) return { label, mutations: group, design: null, findings: [...findings, ...round.findings] };
      rounds.push(round);
      template = round.product;
    }
    findings.push({ code: 'CONSECUTIVE_ROUNDS', severity: 'info', message: `${label}: the mutations are ${span} nt apart, too far for one primer pair. Make them in ${rounds.length} consecutive rounds, using each round's plasmid as the next template.` });
    return { label, mutations: group, design: rounds[rounds.length - 1]!, rounds, findings };
  });
  return { results, errors };
}

/** Q5 site-directed mutagenesis with KLD (NEB E0554 protocol). */
export function sdmProtocol(design: SdmDesign, plasmidBp: number): CloningProtocol {
  const extensionSeconds = Math.max(20, Math.ceil(25 * plasmidBp / 1000 / 5) * 5);
  return {
    title: `Q5 site-directed mutagenesis: ${design.label}`,
    source: 'NEB Q5 Site-Directed Mutagenesis Kit (E0554) protocol',
    reactions: [
      {
        title: 'Exponential amplification (PCR)',
        totalVolumeUl: 25,
        components: [
          { name: 'Q5 Hot Start High-Fidelity 2X Master Mix', stock: '2X', volumeUl: 12.5 },
          { name: `Forward primer ${design.forward.name}`, stock: '10 µM', volumeUl: 1.25 },
          { name: `Reverse primer ${design.reverse.name}`, stock: '10 µM', volumeUl: 1.25 },
          { name: 'Template DNA', amount: '1–25 ng', volumeUl: 1 },
          { name: 'Nuclease-free water', volumeUl: null },
        ],
        notes: [],
      },
      {
        title: 'Kinase, Ligase & DpnI (KLD) treatment',
        totalVolumeUl: 10,
        components: [
          { name: 'PCR product', volumeUl: 1 },
          { name: '2X KLD Reaction Buffer', stock: '2X', volumeUl: 5 },
          { name: '10X KLD Enzyme Mix', stock: '10X', volumeUl: 1 },
          { name: 'Nuclease-free water', volumeUl: null },
        ],
        notes: [],
      },
    ],
    steps: [
      { text: 'Initial denaturation: 98 °C for 30 seconds.', temperatureC: 98 },
      { text: `25 cycles: 98 °C for 10 s, ${design.ta} °C for 10–30 s, 72 °C for ${extensionSeconds} s (20–30 s per kb of plasmid).` },
      { text: 'Final extension: 72 °C for 2 minutes, then hold at 4 °C.', temperatureC: 72, minutes: 2 },
      { text: 'KLD: mix as above and incubate at room temperature for 5 minutes.', temperatureC: 25, minutes: 5 },
      { text: 'Transform 5 µL of the KLD mix into 50 µL of chemically competent cells and plate on selective medium.' },
      { text: 'Sequence-verify the mutation in several colonies.' },
    ],
  };
}
