/*
 * Substitution matrices. Data: src/data/matrices.json, transcribed by script from the NCBI BLAST
 * matrix directory (https://ftp.ncbi.nih.gov/blast/matrices/, fetched 2026-09-02). Each matrix records
 * its own scaling (1/2-bit, 1/3-bit, ln2/2, ln2/3); scores are only comparable within one matrix.
 */
import data from '@/data/matrices.json';

export class InputError extends Error {}

export type MatrixType = 'protein' | 'dna';

export interface ScoringMatrix {
  name: string;
  type: MatrixType;
  /** Residue order of rows and columns; empty for a simple match/mismatch matrix. */
  order: string;
  scores: number[][];
  scaling?: string;
  source?: string;
  notes?: string;
  /** Present for a simple match/mismatch matrix (any equal pair scores `match`, any other pair `mismatch`). */
  simple?: { match: number; mismatch: number };
}

interface RawMatrix { type: string; order: string; scores: number[][]; scaling?: string; source?: string; notes?: string }
const RAW = data.matrices as Record<string, RawMatrix>;

/** Names in menu order: BLOSUM by increasing stringency, then PAM by increasing distance, then DNA. */
export const MATRIX_NAMES = ['BLOSUM45', 'BLOSUM62', 'BLOSUM80', 'PAM30', 'PAM70', 'PAM250', 'EDNAFULL'] as const;
export type MatrixName = typeof MATRIX_NAMES[number];

export const MATRIX_SOURCE: string = data._source;

export function getMatrix(name: string): ScoringMatrix {
  const raw = RAW[name];
  if (!raw) throw new InputError(`Unknown substitution matrix "${name}"`);
  return { name, type: raw.type as MatrixType, order: raw.order, scores: raw.scores, scaling: raw.scaling, source: raw.source, notes: raw.notes };
}

export function matricesFor(type: MatrixType): ScoringMatrix[] {
  return MATRIX_NAMES.map(getMatrix).filter(m => m.type === type);
}

/** Match/mismatch matrix (textbook scoring, e.g. +1/−1). `type` only decides the fallback residue for unknown letters. */
export function simpleMatrix(match: number, mismatch: number, type: MatrixType = 'dna'): ScoringMatrix {
  if (!Number.isFinite(match) || !Number.isFinite(mismatch)) throw new InputError('Match and mismatch scores must be numbers');
  return { name: `simple(${match}/${mismatch})`, type, order: '', scores: [], simple: { match, mismatch } };
}

/**
 * Score for aligning residues `a` and `b`. Letters absent from the matrix fall back to the
 * "any residue" row (X for protein, N for DNA); if that is absent too, the matrix minimum.
 * RNA U is scored as T in DNA matrices.
 */
export function scoreOf(m: ScoringMatrix, a: string, b: string): number {
  if (m.simple) return a === b ? m.simple.match : m.simple.mismatch;
  return compileMatrix(m)[(a.charCodeAt(0) & 127) * 128 + (b.charCodeAt(0) & 127)]!;
}

const cache = new WeakMap<ScoringMatrix, Float64Array>();

/**
 * 128×128 lookup by ASCII code (upper-case letters), so the DP inner loop is one array read.
 * Simple matrices are expanded over the printable ASCII range.
 */
export function compileMatrix(m: ScoringMatrix): Float64Array {
  const hit = cache.get(m);
  if (hit) return hit;
  const table = new Float64Array(128 * 128);
  if (m.simple) {
    table.fill(m.simple.mismatch);
    for (let c = 0; c < 128; c++) table[c * 128 + c] = m.simple.match;
  } else {
    const order = m.order;
    const min = Math.min(...m.scores.flat());
    const fallbackChar = m.type === 'protein' ? 'X' : 'N';
    const fb = order.indexOf(fallbackChar);
    const idx = new Int16Array(128).fill(-1);
    for (let k = 0; k < order.length; k++) idx[order.charCodeAt(k) & 127] = k;
    if (m.type === 'dna' && idx[85] === -1 && idx[84] !== -1) idx[85] = idx[84]!; // U → T
    for (let a = 0; a < 128; a++) {
      const ia = idx[a]! >= 0 ? idx[a]! : fb;
      for (let b = 0; b < 128; b++) {
        const ib = idx[b]! >= 0 ? idx[b]! : fb;
        table[a * 128 + b] = ia >= 0 && ib >= 0 ? m.scores[ia]![ib]! : min;
      }
    }
  }
  cache.set(m, table);
  return table;
}
