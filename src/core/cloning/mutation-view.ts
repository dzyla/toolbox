/* Numbered protein and per-mutation alignments for the amino-acid designer. */

import { align, getMatrix } from '@/core/align';
import { translateCodon } from './methods/basechanger';

export interface ProteinLine { start: number; end: number; blocks: string[] }

/** Residues in blocks of ten, `perLine` per line; `start`/`end` are 1-based residue numbers. */
export function proteinLines(protein: string, perLine = 50): ProteinLine[] {
  const lines: ProteinLine[] = [];
  for (let start = 0; start < protein.length; start += perLine) {
    const chunk = protein.slice(start, start + perLine);
    const blocks: string[] = [];
    for (let i = 0; i < chunk.length; i += 10) blocks.push(chunk.slice(i, i + 10));
    lines.push({ start: start + 1, end: start + chunk.length, blocks });
  }
  return lines;
}

/** Translate from `start` (0-based) in frame, keeping the stop as `*`. */
export function translateFrom(sequence: string, start: number, maxResidues = Infinity): string {
  let protein = '';
  for (let i = start; i + 3 <= sequence.length && protein.length < maxResidues; i += 3) {
    const residue = translateCodon(sequence.slice(i, i + 3));
    protein += residue;
    if (residue === '*') break;
  }
  return protein;
}

export interface MutationAlignment {
  position: number;
  from: string;
  to: string;
  /** 1-based residue number of the first residue in the window. */
  windowStart: number;
  wild: string;
  mutant: string;
  midline: string;
  matchCount: number;
  mismatchCount: number;
  gapCount: number;
  wildCodon: string;
  mutantCodon: string;
  dna: { wild: string; mutant: string; midline: string; changed: number[]; /** `^` under every changed base, spaces elsewhere: a cue that does not rely on colour. */ carets: string };
}

const BLOSUM = getMatrix('BLOSUM62');

/**
 * Pairwise alignment of the wild-type and mutant protein around `position` (1-based), `flank` residues each side.
 * Windows are cut from the same residue numbers of both proteins; a stop in the mutant shortens its window and
 * shows as gaps. `dna` holds two equal-length DNA windows around the codon; `codonAt` is the index where the codon starts.
 */
export function mutationAlignment(wildProtein: string, mutantProtein: string, position: number, flank = 10, dna?: { wild: string; mutant: string; codonAt: number }): MutationAlignment {
  const first = Math.max(1, position - flank);
  const last = Math.min(wildProtein.length, position + flank);
  const wildWindow = wildProtein.slice(first - 1, last);
  const mutantWindow = mutantProtein.slice(first - 1, last);
  let wild = wildWindow;
  let mutant = mutantWindow;
  let midline = '';
  if (wildWindow && mutantWindow) {
    const result = align(wildWindow, mutantWindow, { mode: 'global', matrix: BLOSUM, gapOpen: 10, gapExtend: 1 });
    wild = result.aligned1;
    mutant = result.aligned2;
  } else {
    wild = wildWindow;
    mutant = mutantWindow.padEnd(wildWindow.length, '-');
  }
  let matchCount = 0, mismatchCount = 0, gapCount = 0;
  for (let i = 0; i < wild.length; i++) {
    if (wild[i] === '-' || mutant[i] === '-') { gapCount += 1; midline += ' '; }
    else if (wild[i] === mutant[i]) { matchCount += 1; midline += '|'; }
    else { mismatchCount += 1; midline += '.'; }
  }
  const windows = dna ?? { wild: '', mutant: '', codonAt: 0 };
  const offset = windows.codonAt;
  const dnaMid: string[] = [];
  const changed: number[] = [];
  for (let i = 0; i < windows.wild.length; i++) {
    const same = windows.wild[i] === windows.mutant[i];
    dnaMid.push(same ? '|' : '.');
    if (!same) changed.push(i);
  }
  return {
    position,
    from: wildProtein[position - 1] ?? '',
    to: mutantProtein[position - 1] ?? (mutantProtein.length === position - 1 && !mutantProtein.includes('*') ? '*' : '-'),
    windowStart: first,
    wild, mutant, midline, matchCount, mismatchCount, gapCount,
    wildCodon: windows.wild.slice(offset, offset + 3),
    mutantCodon: windows.mutant.slice(offset, offset + 3),
    dna: { wild: windows.wild, mutant: windows.mutant, midline: dnaMid.join(''), changed, carets: [...windows.wild].map((_, i) => (changed.includes(i) ? '^' : ' ')).join('') },
  };
}

/**
 * Residue number -> label for the numbered protein. Designs that failed (no design) are skipped, and
 * two designs that hit the same residue share one mark with both labels.
 */
export function mutationMarks(results: Array<{ design: unknown; mutations: Array<{ position: number; raw: string }> }>): Map<number, string> {
  const labels = new Map<number, string[]>();
  for (const result of results) {
    if (!result.design) continue;
    for (const { position, raw } of result.mutations) {
      const list = labels.get(position) ?? [];
      if (!list.includes(raw)) list.push(raw);
      labels.set(position, list);
    }
  }
  return new Map([...labels].map(([position, list]) => [position, list.join(' / ')]));
}
