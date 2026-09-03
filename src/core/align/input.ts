/* Sequence input for alignment: FASTA or raw text, cleaning report, DNA/protein detection, validation. */
import { InputError, type MatrixType } from './matrices';

export interface ParsedInput {
  /** FASTA header without '>' (first word), or '' for raw input. */
  name: string;
  /** Upper-case residues only. */
  seq: string;
  /** Characters removed during cleaning (whitespace and digits are not reported). */
  removed: string;
  /** Number of FASTA records found; only the first is used. */
  records: number;
}

/** IUPAC nucleotide letters (U accepted and scored as T). */
export const DNA_LETTERS = 'ACGTUNRYKMSWBDHV';
/** Amino acids incl. ambiguity (B, Z, X), selenocysteine, pyrrolysine and stop. */
export const PROTEIN_LETTERS = 'ARNDCQEGHILKMFPSTWYVBZXUO*';

export function parseSequenceInput(text: string): ParsedInput {
  const lines = text.split(/\r?\n/);
  let name = '', records = 0;
  const body: string[] = [];
  for (const line of lines) {
    if (line.startsWith('>')) {
      records++;
      if (records === 1) name = line.slice(1).trim().split(/\s+/)[0] ?? '';
      else break;
      continue;
    }
    if (line.startsWith(';')) continue; // old-style FASTA comment
    body.push(line);
  }
  const raw = body.join('');
  let seq = '', removed = '';
  for (const ch of raw) {
    if (/[A-Za-z*]/.test(ch)) seq += ch.toUpperCase();
    else if (!/[\s\d]/.test(ch)) removed += ch;
  }
  return { name, seq, removed, records };
}

/**
 * DNA if at least 90 % of the letters are A, C, G, T, U or N (the EMBOSS/BioPython rule of thumb);
 * otherwise protein. Empty input reports protein.
 */
export function detectType(seq: string): MatrixType {
  if (!seq) return 'protein';
  let nuc = 0;
  for (const ch of seq) if ('ACGTUN'.includes(ch)) nuc++;
  return nuc / seq.length >= 0.9 ? 'dna' : 'protein';
}

/** Returns the offending letters, or '' when the sequence is valid for `type`. */
export function invalidLetters(seq: string, type: MatrixType): string {
  const ok = type === 'dna' ? DNA_LETTERS : PROTEIN_LETTERS;
  const bad = new Set<string>();
  for (const ch of seq) if (!ok.includes(ch)) bad.add(ch);
  return [...bad].join('');
}

export function assertValid(seq: string, type: MatrixType, label = 'Sequence'): void {
  const bad = invalidLetters(seq, type);
  if (bad) throw new InputError(`${label} contains letters that are not ${type === 'dna' ? 'IUPAC nucleotides' : 'amino acids'}: ${bad}`);
}
