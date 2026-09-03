/* Sequence feature heuristics. Coordinates are 1-based inclusive.
   Curated definitions and their provenance live in src/data/protein/*.json. */
import tagsJson from '@/data/protein/tags.json';
import largeTagsJson from '@/data/protein/large-tags.json';
import motifsJson from '@/data/protein/motifs.json';
import { AA_KD } from './index';

export type ProteinFeatureKind = 'tag' | 'large-tag' | 'motif' | 'transmembrane' | 'signal-peptide' | 'domain';
export interface ProteinFeature {
  start: number;
  end: number;
  name: string;
  category: string;
  kind: ProteinFeatureKind;
  color: string;
  match?: string;
  note?: string;
  identity?: number;
}

interface TagDefinition { seqs: string[]; color: string; category: string; note?: string }
interface LargeTagDefinition { seq: string; color: string; category: string; note?: string }
interface MotifDefinition { name: string; category: string; color: string; note?: string; pattern: string }
const TAGS = tagsJson.values as Record<string, TagDefinition>;
const LARGE_TAGS = largeTagsJson.values as Record<string, LargeTagDefinition>;
const MOTIFS = motifsJson.values as MotifDefinition[];

/** Merge adjacent/overlapping occurrences of the same named feature. */
export function mergeFeatures(features: ProteinFeature[]): ProteinFeature[] {
  const sorted = features.map(feature => ({ ...feature })).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: ProteinFeature[] = [];
  for (const feature of sorted) {
    const prior = merged[merged.length - 1];
    if (prior && prior.name === feature.name && prior.category === feature.category && prior.kind === feature.kind && feature.start <= prior.end + 1) {
      prior.end = Math.max(prior.end, feature.end);
      if (feature.identity !== undefined) prior.identity = Math.max(prior.identity ?? 0, feature.identity);
    } else merged.push(feature);
  }
  return merged;
}

function exactFeatures(seq: string): ProteinFeature[] {
  const features: ProteinFeature[] = [];
  for (const [name, definition] of Object.entries(TAGS)) {
    for (const pattern of definition.seqs) {
      let index = seq.indexOf(pattern);
      while (index >= 0) {
        features.push({ start: index + 1, end: index + pattern.length, name, match: pattern,
          note: definition.note, category: definition.category, color: definition.color, kind: 'tag' });
        index = seq.indexOf(pattern, index + 1);
      }
    }
  }
  return features;
}

function motifFeatures(seq: string): ProteinFeature[] {
  const features: ProteinFeature[] = [];
  for (const motif of MOTIFS) {
    const regex = new RegExp(motif.pattern, 'g');
    for (const match of seq.matchAll(regex)) {
      if (!match[0]) continue;
      features.push({ start: match.index + 1, end: match.index + match[0].length, name: motif.name,
        match: match[0], note: motif.note, category: motif.category, color: motif.color, kind: 'motif' });
    }
  }
  return features;
}

function fuzzyLargeFeatures(seq: string, requestedIdentity: number): ProteinFeature[] {
  const threshold = requestedIdentity > 1 ? requestedIdentity / 100 : requestedIdentity;
  if (!(threshold > 0 && threshold <= 1)) throw new RangeError('Large-tag identity must be greater than 0 and at most 100%.');
  const features: ProteinFeature[] = [];
  for (const [name, definition] of Object.entries(LARGE_TAGS)) {
    const length = definition.seq.length;
    for (let start = 0; start <= seq.length - length; start++) {
      let identical = 0;
      for (let offset = 0; offset < length; offset++) if (seq[start + offset] === definition.seq[offset]) identical++;
      const identity = identical / length;
      if (identity >= threshold) {
        features.push({ start: start + 1, end: start + length, name, identity, match: seq.slice(start, start + length),
          note: `${definition.note ?? ''}${definition.note ? ' ' : ''}Identity ${(identity * 100).toFixed(1)}%.`,
          category: definition.category || 'Large Domain', color: definition.color || '#a855f7', kind: 'large-tag' });
        start += length - 1;
      }
    }
  }
  return features;
}

/** Scan exact small tags, regular-expression motifs, and ≥90% identity large tags. */
export function scanFeatures(rawSeq: string, largeTagIdentity = 0.9): ProteinFeature[] {
  const seq = rawSeq.toUpperCase();
  return mergeFeatures([...exactFeatures(seq), ...motifFeatures(seq), ...fuzzyLargeFeatures(seq, largeTagIdentity)]);
}

function kdAverage(seq: string, start: number, window: number): number {
  let total = 0;
  for (let offset = 0; offset < window; offset++) total += AA_KD[seq[start + offset]!] ?? 0;
  return total / window;
}

/** Kyte–Doolittle transmembrane-helix candidates, merging sustained windows. */
export function transmembraneCandidates(rawSeq: string, window = 19, threshold = 1.6): ProteinFeature[] {
  if (!Number.isInteger(window) || window < 1) throw new RangeError('Transmembrane window must be a positive integer.');
  if (!Number.isFinite(threshold)) throw new RangeError('Transmembrane threshold must be finite.');
  const seq = rawSeq.toUpperCase();
  const features: ProteinFeature[] = [];
  for (let start = 0; start <= seq.length - window; start++) {
    if (kdAverage(seq, start, window) < threshold) continue;
    let endExclusive = start + window;
    while (endExclusive < seq.length && kdAverage(seq, endExclusive - window + 1, window) >= threshold - 0.2) endExclusive++;
    features.push({ start: start + 1, end: endExclusive, name: 'Transmembrane candidate', category: 'Topology',
      kind: 'transmembrane', color: '#059669', note: `Kyte–Doolittle ${window}-residue mean ≥ ${threshold}. Candidate only.` });
    start = endExclusive - 1;
  }
  return mergeFeatures(features);
}

/** Legacy N-terminal hydrophobic-stretch signal-peptide heuristic. */
export function signalPeptideCandidates(rawSeq: string): ProteinFeature[] {
  const seq = rawSeq.toUpperCase();
  const limit = Math.min(30, seq.length);
  const features: ProteinFeature[] = [];
  let start = 0;
  while (start <= limit - 7) {
    if (kdAverage(seq, start, 7) < 1.6) { start++; continue; }
    let endExclusive = start + 7;
    while (endExclusive < limit && kdAverage(seq, endExclusive - 6, 7) >= 1.2) endExclusive++;
    features.push({ start: start + 1, end: endExclusive, name: 'Signal peptide (candidate)', category: 'Topology',
      kind: 'signal-peptide', color: '#db2777', note: 'Heuristic hydrophobic stretch within the first 30 residues; validate with SignalP.' });
    start = endExclusive;
  }
  return features;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '', quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

/** Parse `name,start,end` CSV into 1-based inclusive user-domain features. */
export function parseDomainCsv(csv: string): ProteinFeature[] {
  const lines = csv.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines[0]?.toLowerCase().replace(/\s/g, '') === 'name,start,end') lines.shift();
  return lines.map((line, index) => {
    const [name = '', rawStart = '', rawEnd = ''] = splitCsvLine(line);
    const start = Number(rawStart), end = Number(rawEnd);
    if (!name || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      throw new RangeError(`Domain CSV line ${index + 1} must be name,start,end with 1-based coordinates.`);
    }
    return { start, end, name, category: 'User domains', kind: 'domain' as const, color: '#6366f1' };
  });
}
