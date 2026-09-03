import { describe, it, expect } from 'vitest';
import {
  MATRIX_NAMES, getMatrix, matricesFor, simpleMatrix, scoreOf, align, rescore, describeAlignment, InputError,
  parseSequenceInput, detectType, invalidLetters, wrapBlocks, toClustal, toFasta, toPairwiseText,
  type AlignOptions, type AlignMode, type ScoringMatrix,
} from '@/core/align';

/* ---------- helpers ---------- */
function mulberry(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rand = (n: number, alphabet: string, rng: () => number) => { let s = ''; for (let i = 0; i < n; i++) s += alphabet[Math.floor(rng() * alphabet.length)]; return s; };
const AA = 'ACDEFGHIKLMNPQRSTVWY';
const NT = 'ACGT';
const MODES: AlignMode[] = ['global', 'local', 'semiglobal'];

/**
 * Independent, deliberately naive Gotoh reference: full 2-D tables, no traceback, score only.
 * Same affine model as the engine: a gap of length k costs open + (k-1)·extend; all transitions allowed.
 */
function referenceScore(s1: string, s2: string, o: AlignOptions): number {
  const n = s1.length, m = s2.length, NEG = -Infinity;
  const mk = () => Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(NEG));
  const M = mk(), X = mk(), Y = mk();
  const free = o.mode !== 'global';
  M[0]![0] = 0;
  for (let i = 1; i <= n; i++) { if (free) M[i]![0] = 0; else X[i]![0] = -(o.gapOpen + (i - 1) * o.gapExtend); }
  for (let j = 1; j <= m; j++) { if (free) M[0]![j] = 0; else Y[0]![j] = -(o.gapOpen + (j - 1) * o.gapExtend); }
  let best = o.mode === 'local' ? 0 : NEG;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const s = scoreOf(o.matrix, s1[i - 1]!, s2[j - 1]!);
    let mv = Math.max(M[i - 1]![j - 1]!, X[i - 1]![j - 1]!, Y[i - 1]![j - 1]!) + s;
    if (o.mode === 'local') mv = Math.max(0, mv);
    M[i]![j] = mv;
    X[i]![j] = Math.max(M[i - 1]![j]! - o.gapOpen, X[i - 1]![j]! - o.gapExtend, Y[i - 1]![j]! - o.gapOpen);
    Y[i]![j] = Math.max(M[i]![j - 1]! - o.gapOpen, Y[i]![j - 1]! - o.gapExtend, X[i]![j - 1]! - o.gapOpen);
    if (o.mode === 'local') best = Math.max(best, mv);
  }
  if (o.mode === 'global') return Math.max(M[n]![m]!, X[n]![m]!, Y[n]![m]!);
  if (o.mode === 'semiglobal') {
    best = 0; // empty overlap is allowed
    for (let i = 0; i <= n; i++) best = Math.max(best, M[i]![m]!, X[i]![m]!, Y[i]![m]!);
    for (let j = 0; j <= m; j++) best = Math.max(best, M[n]![j]!, X[n]![j]!, Y[n]![j]!);
  }
  return best;
}

/* ---------- matrices ---------- */
describe('substitution matrices (NCBI)', () => {
  it('every matrix is square, complete and symmetric', () => {
    for (const name of MATRIX_NAMES) {
      const m = getMatrix(name);
      expect(m.scores.length).toBe(m.order.length);
      for (let i = 0; i < m.order.length; i++) {
        expect(m.scores[i]!.length).toBe(m.order.length);
        for (let j = 0; j < m.order.length; j++) expect(m.scores[i]![j], `${name} ${m.order[i]}${m.order[j]}`).toBe(m.scores[j]![i]);
      }
      for (const row of m.scores) for (const v of row) expect(Number.isInteger(v)).toBe(true);
    }
  });
  it('BLOSUM62 spot values and row checksums (NCBI ftp BLOSUM62, 1/2-bit; Y-Z typo of the legacy engine fixed)', () => {
    const b = getMatrix('BLOSUM62');
    expect(scoreOf(b, 'W', 'W')).toBe(11); expect(scoreOf(b, 'A', 'R')).toBe(-1); expect(scoreOf(b, 'Y', 'Z')).toBe(-2);
    expect(scoreOf(b, 'C', 'C')).toBe(9); expect(scoreOf(b, '*', '*')).toBe(1); expect(scoreOf(b, 'A', '*')).toBe(-4);
    expect(b.scaling).toMatch(/1\/2 Bit/);
    // Row sums computed from the NCBI file (order ARNDCQEGHILKMFPSTWYVBZX*) — derived, not published.
    const sums = [-23, -27, -20, -26, -43, -14, -17, -42, -22, -38, -37, -21, -22, -36, -41, -15, -20, -45, -26, -32, -25, -16, -27, -91];
    expect(b.scores.map(r => r.reduce((a, v) => a + v, 0))).toEqual(sums);
  });
  it('BLOSUM45 (NCBI ftp, 1/3-bit): W-W 15, S-T 2, Q-Q 6', () => {
    const m = getMatrix('BLOSUM45');
    expect(scoreOf(m, 'W', 'W')).toBe(15); expect(scoreOf(m, 'S', 'T')).toBe(2); expect(scoreOf(m, 'Q', 'Q')).toBe(6);
    expect(m.scaling).toMatch(/1\/3 Bit/);
  });
  it('BLOSUM80 (NCBI ftp, 1/3-bit version): W-W 16, A-A 7, R-R 9, C-C 13', () => {
    const m = getMatrix('BLOSUM80');
    expect(scoreOf(m, 'W', 'W')).toBe(16); expect(scoreOf(m, 'A', 'A')).toBe(7); expect(scoreOf(m, 'R', 'R')).toBe(9); expect(scoreOf(m, 'C', 'C')).toBe(13);
    expect(m.scaling).toMatch(/1\/3 Bit/);
  });
  it('PAM30 (NCBI ftp, scale ln2/2): W-W 13, A-A 6, A-R -7', () => {
    const m = getMatrix('PAM30');
    expect(scoreOf(m, 'W', 'W')).toBe(13); expect(scoreOf(m, 'A', 'A')).toBe(6); expect(scoreOf(m, 'A', 'R')).toBe(-7);
    expect(m.scaling).toMatch(/ln\(2\)\/2/);
  });
  it('PAM70 (NCBI ftp, scale ln2/2): W-W 13, A-A 5, A-R -4', () => {
    const m = getMatrix('PAM70');
    expect(scoreOf(m, 'W', 'W')).toBe(13); expect(scoreOf(m, 'A', 'A')).toBe(5); expect(scoreOf(m, 'A', 'R')).toBe(-4);
  });
  it('PAM250 (NCBI ftp, scale ln2/3): W-W 17, Z-P 0 (legacy typo fixed), C-C 12', () => {
    const m = getMatrix('PAM250');
    expect(scoreOf(m, 'W', 'W')).toBe(17); expect(scoreOf(m, 'Z', 'P')).toBe(0); expect(scoreOf(m, 'C', 'C')).toBe(12);
    expect(m.scaling).toMatch(/ln\(2\)\/3/);
  });
  it('EDNAFULL = NUC.4.4: match 5, mismatch -4, A-N -2, A-R 1; U scored as T', () => {
    const m = getMatrix('EDNAFULL');
    expect(m.type).toBe('dna');
    expect(scoreOf(m, 'A', 'A')).toBe(5); expect(scoreOf(m, 'A', 'T')).toBe(-4); expect(scoreOf(m, 'A', 'N')).toBe(-2); expect(scoreOf(m, 'A', 'R')).toBe(1);
    expect(scoreOf(m, 'U', 'T')).toBe(5); expect(scoreOf(m, 'U', 'A')).toBe(-4);
  });
  it('unknown letters fall back to X (protein) or N (DNA); simple matrices score equality', () => {
    expect(scoreOf(getMatrix('BLOSUM62'), 'J', 'A')).toBe(scoreOf(getMatrix('BLOSUM62'), 'X', 'A'));
    expect(scoreOf(getMatrix('EDNAFULL'), 'Q', 'A')).toBe(-2);
    const s = simpleMatrix(1, -1);
    expect(scoreOf(s, 'A', 'A')).toBe(1); expect(scoreOf(s, 'A', 'G')).toBe(-1);
    expect(matricesFor('protein').map(m => m.name)).toEqual(['BLOSUM45', 'BLOSUM62', 'BLOSUM80', 'PAM30', 'PAM70', 'PAM250']);
    expect(matricesFor('dna').map(m => m.name)).toEqual(['EDNAFULL']);
    expect(() => getMatrix('BLOSUM99')).toThrow(InputError);
  });
});

/* ---------- engine ---------- */
describe('Gotoh alignment', () => {
  const B62 = getMatrix('BLOSUM62'), DNA = getMatrix('EDNAFULL');
  const opts = (mode: AlignMode, matrix: ScoringMatrix = B62, gapOpen = 11, gapExtend = 1): AlignOptions => ({ mode, matrix, gapOpen, gapExtend });

  it('textbook example: GATTACA vs GCATGCU, match +1 / mismatch −1 / gap −1, global score 0', () => {
    const o = opts('global', simpleMatrix(1, -1), 1, 1);
    const r = align('GATTACA', 'GCATGCU', o);
    expect(r.score).toBe(0);
    expect(rescore(r.aligned1, r.aligned2, o)).toBe(0);
    expect(r.aligned1.replace(/-/g, '')).toBe('GATTACA');
    expect(r.aligned2.replace(/-/g, '')).toBe('GCATGCU');
    expect(r.stats.columns).toBe(r.aligned1.length);
    expect(referenceScore('GATTACA', 'GCATGCU', o)).toBe(0);
  });

  it('global: identical sequences score the diagonal sum; a single insertion costs open + (k−1)·extend', () => {
    const r = align('HEAGAWGHEE', 'HEAGAWGHEE', opts('global'));
    expect(r.score).toBe([...'HEAGAWGHEE'].reduce((s, c) => s + scoreOf(B62, c, c), 0));
    expect(r.midline).toBe('||||||||||');
    expect(r.stats.identityPct).toBe(100);
    const g = align('ACGTTTACGT', 'ACGTACGT', opts('global', DNA, 10, 0.5));
    expect(g.score).toBe(8 * 5 - (10 + 0.5));
    expect(g.aligned1).toBe('ACGTTTACGT');
    expect(g.aligned2.replace(/-/g, '')).toBe('ACGTACGT');
    expect(g.stats.gapColumns).toBe(2);
  });

  it('local: returns the best-scoring segment with coordinates, and the legacy DNA example re-scores', () => {
    const o = opts('local', DNA, 10, 1);
    const r = align('CTAAAATGGCAGCACGCCATAC', 'GTAGATGGCACGCCCTA', o);
    expect(rescore(r.aligned1, r.aligned2, o)).toBe(r.score);
    expect('CTAAAATGGCAGCACGCCATAC'.slice(r.start1 - 1, r.end1)).toBe(r.aligned1.replace(/-/g, ''));
    expect('GTAGATGGCACGCCCTA'.slice(r.start2 - 1, r.end2)).toBe(r.aligned2.replace(/-/g, ''));
    const w = align('AAAAWWWWAAAA', 'CCWWWWCC', opts('local'));
    expect(w.aligned1).toBe('WWWW'); expect(w.start1).toBe(5); expect(w.end1).toBe(8); expect(w.start2).toBe(3);
    expect(w.score).toBe(44);
    const none = align('AAAA', 'WWWW', opts('local'));
    expect(none.score).toBe(0); expect(none.aligned1).toBe(''); expect(none.stats.columns).toBe(0);
  });

  it('semi-global: end gaps are free, shown but not scored', () => {
    const o = opts('semiglobal', DNA, 10, 0.5);
    const r = align('GGGGTACGCCCC', 'TACG', o);
    expect(r.score).toBe(20);
    expect(r.aligned1).toBe('GGGGTACGCCCC');
    expect(r.aligned2).toBe('----TACG----');
    expect(r.scored1).toEqual([5, 8]); expect(r.scored2).toEqual([1, 4]);
    expect(r.start1).toBe(1); expect(r.end1).toBe(12);
    expect(rescore(r.aligned1, r.aligned2, o)).toBe(20);
    expect(align('GGGGTACGCCCC', 'TACG', opts('global', DNA, 10, 0.5)).score).toBeLessThan(20);
    // overlap: suffix of 1 with prefix of 2
    const ov = align('AAAACGTAC', 'CGTACTTTT', o);
    expect(ov.score).toBe(25);
    expect(ov.aligned1).toBe('AAAACGTAC----'); expect(ov.aligned2).toBe('----CGTACTTTT');
  });

  it('re-score invariant on 300 random pairs in all three modes (traceback reproduces the score)', () => {
    const rng = mulberry(42);
    for (let t = 0; t < 300; t++) {
      const s1 = rand(5 + Math.floor(rng() * 40), AA, rng), s2 = rand(5 + Math.floor(rng() * 40), AA, rng);
      for (const mode of MODES) {
        const o = opts(mode, B62, 11, 1);
        const r = align(s1, s2, o);
        expect(r.aligned1.length).toBe(r.aligned2.length);
        expect(rescore(r.aligned1, r.aligned2, o), `${mode} ${s1} ${s2}`).toBe(r.score);
        const u1 = r.aligned1.replace(/-/g, ''), u2 = r.aligned2.replace(/-/g, '');
        if (mode === 'local') { expect(s1.slice(r.start1 - 1, r.end1)).toBe(u1); expect(s2.slice(r.start2 - 1, r.end2)).toBe(u2); }
        else { expect(u1).toBe(s1); expect(u2).toBe(s2); }
        expect(r.stats.columns).toBe(r.aligned1.length);
        expect(r.midline.length).toBe(r.aligned1.length);
      }
    }
  });

  it('matches an independent reference Gotoh on 100 random pairs, incl. cheap gaps where gap↔gap transitions matter', () => {
    const rng = mulberry(7);
    const mats = [B62, getMatrix('PAM30'), getMatrix('BLOSUM80'), DNA];
    for (let t = 0; t < 100; t++) {
      const matrix = mats[t % mats.length]!;
      const alphabet = matrix.type === 'dna' ? NT : AA;
      const s1 = rand(3 + Math.floor(rng() * 25), alphabet, rng), s2 = rand(3 + Math.floor(rng() * 25), alphabet, rng);
      const gapOpen = [1, 2, 5, 10, 11][t % 5]!, gapExtend = [0.5, 1, 1, 2, 1][(t >> 1) % 5]!;
      for (const mode of MODES) {
        const o = { mode, matrix, gapOpen, gapExtend };
        const r = align(s1, s2, o);
        expect(r.score, `${mode} ${matrix.name} ${gapOpen}/${gapExtend} ${s1} ${s2}`).toBe(referenceScore(s1, s2, o));
        expect(rescore(r.aligned1, r.aligned2, o)).toBe(r.score);
      }
    }
  });

  it('statistics and midline follow the EMBOSS convention (denominator = all columns)', () => {
    const d = describeAlignment('AC-G', 'ATCG', DNA);
    expect(d.midline).toBe('|. |');
    expect(d.classes).toEqual(['identity', 'mismatch', 'gap', 'identity']);
    expect(d.stats).toEqual({ columns: 4, identities: 2, similarities: 2, gapColumns: 1, identityPct: 50, similarityPct: 50, gapPct: 25 });
    const p = describeAlignment('IL', 'LV', B62); // I/L = 2 (similar), L/V = 1 (similar)
    expect(p.midline).toBe('::'); expect(p.stats.similarities).toBe(2); expect(p.stats.identities).toBe(0);
  });

  it('rejects bad input with InputError', () => {
    expect(() => align('', 'ACGT', opts('global', DNA))).toThrow(InputError);
    expect(() => align('ACGT', 'ACGT', { ...opts('global', DNA), gapOpen: -1 })).toThrow(InputError);
    expect(() => align('ACGT', 'ACGT', { ...opts('global', DNA), gapExtend: NaN })).toThrow(InputError);
    expect(() => align('ACGT', 'ACGT', { ...opts('global', DNA), mode: 'bogus' as AlignMode })).toThrow(InputError);
  });
});

/* ---------- input parsing ---------- */
describe('sequence input', () => {
  it('parses FASTA and raw text, reports removed characters, uses the first record', () => {
    const p = parseSequenceInput('>sp|P01308|INS_HUMAN Insulin\nMALW MRLL\n10 PLLA*\n>second\nAAAA');
    expect(p.name).toBe('sp|P01308|INS_HUMAN'); expect(p.seq).toBe('MALWMRLLPLLA*'); expect(p.records).toBe(2); expect(p.removed).toBe('');
    const r = parseSequenceInput('acg t-t.g#');
    expect(r.name).toBe(''); expect(r.seq).toBe('ACGTTG'); expect(r.removed).toBe('-.#');
  });
  it('detects DNA vs protein (≥ 90 % ACGTUN) and validates letters', () => {
    expect(detectType('ATGCATGCNN')).toBe('dna'); expect(detectType('AUGGCC')).toBe('dna');
    expect(detectType('MKVLAAGIVALLLAAG')).toBe('protein'); expect(detectType('ACDEFGHIK')).toBe('protein'); expect(detectType('')).toBe('protein');
    expect(invalidLetters('ATGJ', 'dna')).toBe('J'); expect(invalidLetters('ATGRYN', 'dna')).toBe('');
    expect(invalidLetters('MKV1', 'protein')).toBe('1'); expect(invalidLetters('MKVBZXUO*', 'protein')).toBe('');
  });
});

/* ---------- formats ---------- */
describe('alignment formats', () => {
  const DNA = getMatrix('EDNAFULL');
  const o: AlignOptions = { mode: 'global', matrix: DNA, gapOpen: 10, gapExtend: 0.5 };
  const r = align('ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT', 'ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTAC', o);
  it('wraps into numbered blocks', () => {
    const b = wrapBlocks(r, 60);
    expect(b.length).toBe(2);
    expect(b[0]!.from1).toBe(1); expect(b[0]!.to1).toBe(60); expect(b[1]!.from1).toBe(61); expect(b[1]!.to1).toBe(68);
    expect(b[1]!.to2).toBe(66);
  });
  it('CLUSTAL, FASTA and pairwise text carry both sequences', () => {
    const c = toClustal(r, ['a', 'b']);
    expect(c.startsWith('CLUSTAL')).toBe(true);
    expect(c).toMatch(/\na {4,}ACGT/); expect(c).toMatch(/\*{10}/);
    const f = toFasta(r, ['a', 'b c']);
    expect(f).toMatch(/^>a\n/); expect(f).toMatch(/\n>b_c\n/);
    expect(f.split('\n').filter(l => !l.startsWith('>')).join('')).toBe(r.aligned1 + r.aligned2);
    const t = toPairwiseText(r, ['a', 'b'], o);
    expect(t).toMatch(/Identity: 66\/68/); expect(t).toMatch(/Gap open: 10/); expect(t).toMatch(/EMBOSS convention/);
  });
  it('supports arbitrary float gap penalties without precision issues', () => {
    const r = align('ACGTACGT', 'ACGTTCGT', { mode: 'global', matrix: DNA, gapOpen: 10.75, gapExtend: 0.25 });
    expect(rescore(r.aligned1, r.aligned2, { mode: 'global', matrix: DNA, gapOpen: 10.75, gapExtend: 0.25 })).toBe(r.score);
    const rGap = align('ACGTACGT', 'ACGT', { mode: 'global', matrix: DNA, gapOpen: 2.5, gapExtend: 0.5 });
    // 4 matches = 4 * 5 = 20. 1 gap of length 4 = 2.5 + 3 * 0.5 = 4.0. Total = 16.0
    expect(rGap.score).toBe(16);
  });
});
