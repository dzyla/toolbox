/*
 * Pairwise alignment with affine gap penalties (Gotoh 1982, J Mol Biol 162:705), three-state DP:
 *   M[i][j] = s(i,j) + max(M, X, Y)[i-1][j-1]
 *   X[i][j] = max(M[i-1][j] − open, X[i-1][j] − extend, Y[i-1][j] − open)   (gap in sequence 2)
 *   Y[i][j] = max(M[i][j-1] − open, Y[i][j-1] − extend, X[i][j-1] − open)   (gap in sequence 1)
 * A gap of length k costs open + (k − 1)·extend (EMBOSS needle/water convention; BLAST would call this
 * open + k·extend with open = ours − extend). All three transitions into a gap state are allowed, so the
 * reported score is the true optimum of the affine model.
 * Modes: global (Needleman & Wunsch 1970), local (Smith & Waterman 1981), semi-global (end gaps free
 * in both sequences; the DP is the global one with zero borders and the optimum taken over the last
 * row and column).
 * Traceback pointers are stored packed (one byte per cell); scores use two rolling rows.
 * Invariant (tested): re-scoring the returned alignment with `rescore` reproduces `score` exactly.
 */
import { compileMatrix, InputError, scoreOf, type ScoringMatrix } from './matrices';

export type AlignMode = 'global' | 'local' | 'semiglobal';

export interface AlignOptions {
  mode: AlignMode;
  matrix: ScoringMatrix;
  /** Penalty (≥ 0) for the first column of a gap. */
  gapOpen: number;
  /** Penalty (≥ 0) for each further column of the same gap. */
  gapExtend: number;
}

export type ColumnClass = 'identity' | 'similar' | 'mismatch' | 'gap';

export interface AlignmentStats {
  /** Alignment columns, gap columns included (denominator of the percentages: EMBOSS convention). */
  columns: number;
  identities: number;
  /** Identities plus pairs with a positive substitution score. */
  similarities: number;
  gapColumns: number;
  identityPct: number;
  similarityPct: number;
  gapPct: number;
}

export interface AlignmentResult {
  mode: AlignMode;
  score: number;
  aligned1: string;
  aligned2: string;
  /** One character per column: '|' identity, ':' positive score, '.' non-positive score, ' ' gap. */
  midline: string;
  classes: ColumnClass[];
  /** 1-based first and last residue of each sequence present in the aligned strings (0 when none). */
  start1: number; end1: number; start2: number; end2: number;
  /** 1-based residue range that is actually scored: same as start/end except in semi-global mode, where free end gaps are shown but not scored. */
  scored1: [number, number]; scored2: [number, number];
  stats: AlignmentStats;
}

/** Largest DP table (cells) the engine accepts; 1 byte per cell for the traceback. */
export const MAX_CELLS = 25_000_000;

const NEG = -Infinity;
const M = 0, X = 1, Y = 2, STOP = 3;

function checkOptions(o: AlignOptions) {
  if (!['global', 'local', 'semiglobal'].includes(o.mode)) throw new InputError(`Unknown alignment mode "${o.mode}"`);
  if (!Number.isFinite(o.gapOpen) || o.gapOpen < 0) throw new InputError('Gap open penalty must be a number ≥ 0');
  if (!Number.isFinite(o.gapExtend) || o.gapExtend < 0) throw new InputError('Gap extend penalty must be a number ≥ 0');
}

export function align(s1: string, s2: string, opts: AlignOptions): AlignmentResult {
  checkOptions(opts);
  const n = s1.length, m = s2.length;
  if (n === 0 || m === 0) throw new InputError('Both sequences must contain at least one residue');
  if ((n + 1) * (m + 1) > MAX_CELLS) throw new InputError(`Sequences too long for pairwise alignment here (${n} × ${m} residues; limit ${MAX_CELLS.toLocaleString()} cells)`);
  const { mode, gapOpen: open, gapExtend: ext } = opts;
  const table = compileMatrix(opts.matrix);
  const c1 = new Uint8Array(n), c2 = new Uint8Array(m);
  for (let i = 0; i < n; i++) c1[i] = s1.charCodeAt(i) & 127;
  for (let j = 0; j < m; j++) c2[j] = s2.charCodeAt(j) & 127;

  const W = m + 1;
  const tb = new Uint8Array((n + 1) * W); // bits 0-1: M source, 2-3: X source, 4-5: Y source
  let Mp = new Float64Array(W), Xp = new Float64Array(W), Yp = new Float64Array(W);
  let Mc = new Float64Array(W), Xc = new Float64Array(W), Yc = new Float64Array(W);
  const freeBorders = mode !== 'global';

  // Row 0
  Mp[0] = 0; Xp[0] = NEG; Yp[0] = NEG;
  for (let j = 1; j <= m; j++) {
    Xp[j] = NEG;
    if (freeBorders) { Mp[j] = 0; Yp[j] = NEG; }
    else { Mp[j] = NEG; Yp[j] = -(open + (j - 1) * ext); tb[j] = (j === 1 ? M : Y) << 4; }
  }

  let best = NEG, bi = n, bj = m, bstate = M;
  if (mode === 'semiglobal') for (let j = 0; j <= m; j++) if (Mp[j]! > best) { best = Mp[j]!; bi = 0; bj = j; bstate = M; }

  for (let i = 1; i <= n; i++) {
    const row = i * W;
    Yc[0] = NEG;
    if (freeBorders) { Mc[0] = 0; Xc[0] = NEG; }
    else { Mc[0] = NEG; Xc[0] = -(open + (i - 1) * ext); tb[row] = (i === 1 ? M : X) << 2; }
    const a = c1[i - 1]! * 128;
    for (let j = 1; j <= m; j++) {
      // X: gap in sequence 2 (consume s1[i-1]), from the row above
      let xv = Mp[j]! - open, xs = M;
      const xx = Xp[j]! - ext; if (xx > xv) { xv = xx; xs = X; }
      const xy = Yp[j]! - open; if (xy > xv) { xv = xy; xs = Y; }
      Xc[j] = xv;
      // Y: gap in sequence 1 (consume s2[j-1]), from the cell to the left
      let yv = Mc[j - 1]! - open, ys = M;
      const yy = Yc[j - 1]! - ext; if (yy > yv) { yv = yy; ys = Y; }
      const yx = Xc[j - 1]! - open; if (yx > yv) { yv = yx; ys = X; }
      Yc[j] = yv;
      // M: substitution, from the diagonal
      const s = table[a + c2[j - 1]!]!;
      let mv = Mp[j - 1]! + s, ms = M;
      const mx = Xp[j - 1]! + s; if (mx > mv) { mv = mx; ms = X; }
      const my = Yp[j - 1]! + s; if (my > mv) { mv = my; ms = Y; }
      if (mode === 'local') {
        if (mv <= 0) { mv = 0; ms = STOP; }
        else if (mv > best) { best = mv; bi = i; bj = j; bstate = M; }
      }
      Mc[j] = mv;
      tb[row + j] = ms | (xs << 2) | (ys << 4);
    }
    if (mode === 'semiglobal') {
      const consider = (j: number) => {
        if (Mc[j]! > best) { best = Mc[j]!; bi = i; bj = j; bstate = M; }
        if (Xc[j]! > best) { best = Xc[j]!; bi = i; bj = j; bstate = X; }
        if (Yc[j]! > best) { best = Yc[j]!; bi = i; bj = j; bstate = Y; }
      };
      if (i === n) for (let j = 0; j <= m; j++) consider(j); else consider(m);
    }
    [Mp, Mc] = [Mc, Mp]; [Xp, Xc] = [Xc, Xp]; [Yp, Yc] = [Yc, Yp];
  }
  if (mode === 'global') {
    best = Mp[m]!; bstate = M;
    if (Xp[m]! > best) { best = Xp[m]!; bstate = X; }
    if (Yp[m]! > best) { best = Yp[m]!; bstate = Y; }
    bi = n; bj = m;
  }
  if (mode === 'local' && best === NEG) { best = 0; bi = 0; bj = 0; } // no positive-scoring pair at all

  // Traceback
  const out1: string[] = [], out2: string[] = [];
  let i = bi, j = bj, state = bstate;
  const endI = bi, endJ = bj;
  for (;;) {
    if (mode === 'global') {
      if (i === 0 && j === 0) break;
      if (i === 0) state = Y; else if (j === 0) state = X;
    } else if (i === 0 || j === 0) break;
    const cell = tb[i * W + j]!;
    if (state === M) {
      const src = cell & 3;
      if (src === STOP) break;
      out1.push(s1[i - 1]!); out2.push(s2[j - 1]!); i--; j--; state = src;
    } else if (state === X) {
      out1.push(s1[i - 1]!); out2.push('-'); state = (cell >> 2) & 3; i--;
    } else {
      out1.push('-'); out2.push(s2[j - 1]!); state = (cell >> 4) & 3; j--;
    }
  }
  const scored1: [number, number] = [i + 1, endI], scored2: [number, number] = [j + 1, endJ];
  let aligned1 = out1.reverse().join(''), aligned2 = out2.reverse().join('');
  let start1 = i + 1, start2 = j + 1, end1 = endI, end2 = endJ;
  if (mode === 'semiglobal') {
    // Show the free end gaps: the leading overhang of whichever sequence starts earlier, and the trailing one.
    const lead1 = s1.slice(0, i), lead2 = s2.slice(0, j);
    const tail1 = s1.slice(endI), tail2 = s2.slice(endJ);
    aligned1 = lead1 + '-'.repeat(lead2.length) + aligned1 + tail1 + '-'.repeat(tail2.length);
    aligned2 = '-'.repeat(lead1.length) + lead2 + aligned2 + '-'.repeat(tail1.length) + tail2;
    start1 = 1; start2 = 1; end1 = n; end2 = m;
  }
  if (aligned1.length === 0) { start1 = start2 = end1 = end2 = 0; scored1[0] = scored2[0] = 0; scored1[1] = scored2[1] = 0; }
  const { midline, classes, stats } = describeAlignment(aligned1, aligned2, opts.matrix);
  return { mode, score: best, aligned1, aligned2, midline, classes, start1, end1, start2, end2, scored1, scored2, stats };
}

/**
 * Midline, per-column class and statistics over alignment columns.
 * Convention: identity % = identical columns / all columns including gap columns (EMBOSS needle/water).
 * Similar = identity or positive substitution score in the chosen matrix.
 */
export function describeAlignment(aligned1: string, aligned2: string, matrix: ScoringMatrix) {
  if (aligned1.length !== aligned2.length) throw new InputError('Aligned strings differ in length');
  const columns = aligned1.length;
  const classes: ColumnClass[] = new Array(columns);
  let mid = '', identities = 0, similarities = 0, gapColumns = 0;
  for (let k = 0; k < columns; k++) {
    const a = aligned1[k]!, b = aligned2[k]!;
    if (a === '-' || b === '-') { gapColumns++; classes[k] = 'gap'; mid += ' '; }
    else if (a === b) { identities++; similarities++; classes[k] = 'identity'; mid += '|'; }
    else if (scoreOf(matrix, a, b) > 0) { similarities++; classes[k] = 'similar'; mid += ':'; }
    else { classes[k] = 'mismatch'; mid += '.'; }
  }
  const pct = (x: number) => columns ? 100 * x / columns : 0;
  const stats: AlignmentStats = { columns, identities, similarities, gapColumns, identityPct: pct(identities), similarityPct: pct(similarities), gapPct: pct(gapColumns) };
  return { midline: mid, classes, stats };
}

/**
 * Affine re-scoring of an alignment under the same scheme (first gap column costs open, the rest extend).
 * In semi-global mode the leading and trailing gap runs are free and skipped.
 */
export function rescore(aligned1: string, aligned2: string, opts: AlignOptions): number {
  if (aligned1.length !== aligned2.length) throw new InputError('Aligned strings differ in length');
  let from = 0, to = aligned1.length;
  if (opts.mode === 'semiglobal') {
    const f1 = aligned1.search(/[^-]/), f2 = aligned2.search(/[^-]/);
    if (f1 === -1 || f2 === -1) return 0;
    from = Math.max(f1, f2);
    let l1 = aligned1.length - 1, l2 = aligned2.length - 1;
    while (l1 >= 0 && aligned1[l1] === '-') l1--;
    while (l2 >= 0 && aligned2[l2] === '-') l2--;
    to = Math.min(l1, l2) + 1;
  }
  let s = 0, inX = false, inY = false;
  for (let k = from; k < to; k++) {
    const a = aligned1[k]!, b = aligned2[k]!;
    if (b === '-') { s -= inX ? opts.gapExtend : opts.gapOpen; inX = true; inY = false; }
    else if (a === '-') { s -= inY ? opts.gapExtend : opts.gapOpen; inY = true; inX = false; }
    else { s += scoreOf(opts.matrix, a, b); inX = inY = false; }
  }
  return s;
}
