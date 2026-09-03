/* Wrapped blocks and text exports (pairwise report, CLUSTAL, FASTA) for an alignment result. */
import type { AlignmentResult, AlignOptions } from './gotoh';

export interface Block {
  offset: number;
  a1: string; mid: string; a2: string;
  /** 1-based residue numbers at the start and end of this block row (EMBOSS style; a row without residues repeats the previous end). */
  from1: number; to1: number; from2: number; to2: number;
}

const residues = (s: string) => s.length - (s.match(/-/g)?.length ?? 0);

export function wrapBlocks(r: AlignmentResult, width = 60): Block[] {
  const blocks: Block[] = [];
  let done1 = r.start1 - 1, done2 = r.start2 - 1;
  for (let k = 0; k < r.aligned1.length; k += width) {
    const a1 = r.aligned1.slice(k, k + width), a2 = r.aligned2.slice(k, k + width), mid = r.midline.slice(k, k + width);
    const n1 = residues(a1), n2 = residues(a2);
    blocks.push({ offset: k, a1, mid, a2, from1: n1 ? done1 + 1 : done1, to1: done1 + n1, from2: n2 ? done2 + 1 : done2, to2: done2 + n2 });
    done1 += n1; done2 += n2;
  }
  return blocks;
}

const clean = (name: string, fallback: string) => (name || fallback).replace(/\s+/g, '_');

/** Human-readable pairwise report in the spirit of EMBOSS needle/water output. */
export function toPairwiseText(r: AlignmentResult, names: [string, string], opts: AlignOptions, width = 60): string {
  const [n1, n2] = [clean(names[0], 'seq1'), clean(names[1], 'seq2')];
  const w = Math.max(n1.length, n2.length, 4);
  const num = (x: number) => String(x).padStart(5);
  const s = r.stats;
  const lines = [
    '# Pairwise alignment (Bio-Bench)',
    `# Mode: ${r.mode}   Matrix: ${opts.matrix.name}   Gap open: ${opts.gapOpen}   Gap extend: ${opts.gapExtend}`,
    `# Length: ${s.columns}   Identity: ${s.identities}/${s.columns} (${s.identityPct.toFixed(1)}%)   Similarity: ${s.similarities}/${s.columns} (${s.similarityPct.toFixed(1)}%)   Gaps: ${s.gapColumns}/${s.columns} (${s.gapPct.toFixed(1)}%)`,
    `# Score: ${r.score}`,
    '# Identity and similarity are over all alignment columns, gap columns included (EMBOSS convention).',
    '',
  ];
  for (const b of wrapBlocks(r, width)) {
    lines.push(`${n1.padEnd(w)} ${num(b.from1)} ${b.a1} ${b.to1}`);
    lines.push(`${' '.repeat(w)} ${' '.repeat(5)} ${b.mid}`);
    lines.push(`${n2.padEnd(w)} ${num(b.from2)} ${b.a2} ${b.to2}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** CLUSTAL format: '*' identity, ':' positive score (conserved substitution), ' ' otherwise. */
export function toClustal(r: AlignmentResult, names: [string, string], width = 60): string {
  const [n1, n2] = [clean(names[0], 'seq1'), clean(names[1], 'seq2')];
  const w = Math.max(n1.length, n2.length) + 4;
  const lines = ['CLUSTAL multiple sequence alignment (pairwise, Bio-Bench)', '', ''];
  for (const b of wrapBlocks(r, width)) {
    const cons = b.mid.replace(/\|/g, '*').replace(/\./g, ' ');
    lines.push(`${n1.padEnd(w)}${b.a1}`, `${n2.padEnd(w)}${b.a2}`, `${' '.repeat(w)}${cons}`, '');
  }
  return lines.join('\n');
}

/** Aligned FASTA (gaps as '-'), 60 residues per line. */
export function toFasta(r: AlignmentResult, names: [string, string], width = 60): string {
  const wrap = (s: string) => s.match(new RegExp(`.{1,${width}}`, 'g'))?.join('\n') ?? '';
  return `>${clean(names[0], 'seq1')}\n${wrap(r.aligned1)}\n>${clean(names[1], 'seq2')}\n${wrap(r.aligned2)}\n`;
}
