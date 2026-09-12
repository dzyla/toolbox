export const QUICK_RNA_MAX_LENGTH = 400;
const MIN_LOOP = 3;

export interface QuickRnaStructure {
  dotBracket: string;
  pairs: Array<[number, number]>;
  pairCount: number;
}

function canPair(left: string, right: string) {
  return left === 'A' && right === 'U' || left === 'U' && right === 'A' || left === 'C' && right === 'G' || left === 'G' && right === 'C' || left === 'G' && right === 'U' || left === 'U' && right === 'G';
}

/** A fast maximum-pair, non-pseudoknotted RNA sketch; it is not an energy model. */
export function foldQuickRna(sequence: string): QuickRnaStructure {
  const seq = sequence.toUpperCase().replace(/T/g, 'U');
  const n = seq.length;
  if (n > QUICK_RNA_MAX_LENGTH) throw new RangeError(`Quick RNA structure supports selections up to ${QUICK_RNA_MAX_LENGTH} nt.`);
  const score = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const scoreAt = (row: number, column: number) => row >= 0 && column >= 0 && row < n && column < n ? score[row]![column]! : 0;
  for (let span = 1; span < n; span++) {
    for (let i = 0; i + span < n; i++) {
      const j = i + span;
      let best = Math.max(scoreAt(i + 1, j), scoreAt(i, j - 1));
      if (j - i > MIN_LOOP && canPair(seq[i]!, seq[j]!)) best = Math.max(best, scoreAt(i + 1, j - 1) + 1);
      for (let split = i + 1; split < j; split++) best = Math.max(best, scoreAt(i, split) + scoreAt(split + 1, j));
      score[i]![j] = best;
    }
  }
  const pairs: Array<[number, number]> = [];
  function trace(i: number, j: number): void {
    if (i >= j) return;
    const best = scoreAt(i, j);
    if (j - i > MIN_LOOP && canPair(seq[i]!, seq[j]!) && best === scoreAt(i + 1, j - 1) + 1) {
      pairs.push([i + 1, j + 1]);
      trace(i + 1, j - 1);
      return;
    }
    if (best === scoreAt(i + 1, j)) { trace(i + 1, j); return; }
    if (best === scoreAt(i, j - 1)) { trace(i, j - 1); return; }
    for (let split = i + 1; split < j; split++) {
      if (best === scoreAt(i, split) + scoreAt(split + 1, j)) { trace(i, split); trace(split + 1, j); return; }
    }
  }
  trace(0, n - 1);
  const notation = Array<string>(n).fill('.');
  for (const [left, right] of pairs) { notation[left - 1] = '('; notation[right - 1] = ')'; }
  return { dotBracket: notation.join(''), pairs, pairCount: pairs.length };
}
