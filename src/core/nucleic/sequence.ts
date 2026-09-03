/* Nucleic-acid sequence operations. Pure functions, 1-based coordinates in results.
   Codon tables: NCBI genetic codes (src/data/codon-tables.json).
   Restriction enzymes: REBASE (src/data/restriction-enzymes.json). */
import codonJson from '@/data/codon-tables.json';
import enzymeJson from '@/data/restriction-enzymes.json';

export class NucleicError extends Error {}
export type NucleicType = 'DNA' | 'RNA';
export type SeqKind = 'DNA' | 'RNA' | 'protein';

/** IUPAC nucleotide codes → the unambiguous DNA bases they stand for (IUPAC-IUB 1985, Nucleic Acids Res 13:3021). */
export const IUPAC: Record<string, string> = {
  A: 'A', C: 'C', G: 'G', T: 'T', U: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC',
  B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT',
};
const COMPLEMENT: Record<string, string> = {
  A: 'T', T: 'A', U: 'A', C: 'G', G: 'C', N: 'N', R: 'Y', Y: 'R', K: 'M', M: 'K', S: 'S', W: 'W', B: 'V', V: 'B', D: 'H', H: 'D', '-': '-',
};
export const ACCEPTED_NT = 'ACGTUNRYSWKMBDHV';

/** Uppercase, keep IUPAC letters (and '-' gaps), report what was dropped. */
export function cleanNucleic(raw: string) {
  const removed = { whitespace: 0, digits: 0, other: 0 };
  let seq = '';
  for (const ch of raw.toUpperCase()) {
    if (ACCEPTED_NT.includes(ch) || ch === '-') { seq += ch; continue; }
    if (/\s/.test(ch)) removed.whitespace++;
    else if (/[0-9]/.test(ch)) removed.digits++;
    else removed.other++;
  }
  const hasU = seq.includes('U'), hasT = seq.includes('T');
  const ambiguous = [...new Set([...seq].filter(c => !'ACGTU-'.includes(c)))];
  return { seq, removed, ambiguous, type: (hasU && !hasT ? 'RNA' : 'DNA') as NucleicType };
}

/** Heuristic: ≥ 90 % of letters in ACGTUN → nucleic acid (RNA if U and no T), else protein. */
export function detectType(raw: string): SeqKind {
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters) return 'DNA';
  let nt = 0, u = 0, t = 0;
  for (const c of letters) { if ('ACGTUN'.includes(c)) nt++; if (c === 'U') u++; if (c === 'T') t++; }
  if (nt / letters.length < 0.9) return 'protein';
  return u > 0 && t === 0 ? 'RNA' : 'DNA';
}

export function complement(seq: string, type: NucleicType = 'DNA'): string {
  let out = '';
  for (const c of seq.toUpperCase()) {
    const comp = COMPLEMENT[c];
    if (comp === undefined) throw new NucleicError(`Unknown base "${c}"`);
    out += type === 'RNA' && comp === 'T' ? 'U' : comp;
  }
  return out;
}

export function reverseComplement(seq: string, type: NucleicType = 'DNA'): string {
  return [...complement(seq, type)].reverse().join('');
}

/** GC fraction: (G + C + S) / (A + C + G + T + U + S + W). Other ambiguity codes and gaps are excluded from both counts. */
export function gcContent(seq: string): number {
  let gc = 0, n = 0;
  for (const c of seq.toUpperCase()) {
    if ('GCS'.includes(c)) { gc++; n++; } else if ('ATUW'.includes(c)) n++;
  }
  return n ? gc / n : 0;
}

/** Sliding-window GC % at 1-based window centres. */
export function gcProfile(seq: string, window: number): { x: number[]; y: number[] } {
  const w = Math.max(1, Math.min(Math.floor(window), seq.length));
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i + w <= seq.length; i++) { x.push(i + Math.ceil(w / 2)); y.push(gcContent(seq.slice(i, i + w)) * 100); }
  return { x, y };
}

/* ---------- translation ---------- */
export interface CodonTable { id: number; name: string; codons: Record<string, string>; stops: string[]; starts: string[] }
const tables = (codonJson as { tables: Record<string, Omit<CodonTable, 'id'>> }).tables;
export const CODON_TABLES: CodonTable[] = Object.entries(tables).map(([id, t]) => ({ id: Number(id), ...t }));
export function codonTable(id: number): CodonTable {
  const t = CODON_TABLES.find(x => x.id === id);
  if (!t) throw new NucleicError(`No codon table ${id}`);
  return t;
}

function expand(codon: string): string[] {
  let out = [''];
  for (const c of codon) {
    const opts = IUPAC[c];
    if (!opts) return [];
    out = out.flatMap(p => [...opts].map(o => p + o));
  }
  return out;
}
/** One codon → amino acid; '*' for stop, 'X' when ambiguity codes do not resolve to a single residue. */
export function translateCodon(codon: string, table: CodonTable): string {
  const c = codon.toUpperCase().replace(/U/g, 'T');
  const direct = table.codons[c];
  if (direct) return direct;
  if (table.stops.includes(c)) return '*';
  const variants = expand(c);
  if (!variants.length) return 'X';
  const aas = new Set(variants.map(v => table.codons[v] ?? (table.stops.includes(v) ? '*' : 'X')));
  return aas.size === 1 ? [...aas][0]! : 'X';
}

export type Frame = 1 | 2 | 3 | -1 | -2 | -3;
export const FRAMES: Frame[] = [1, 2, 3, -1, -2, -3];
/** Translate one reading frame (−1..−3 read the reverse complement). Trailing partial codon is dropped. */
export function translate(seq: string, tableId = 1, frame: Frame = 1): string {
  const table = codonTable(tableId);
  const s = (frame < 0 ? reverseComplement(seq.toUpperCase().replace(/U/g, 'T')) : seq.toUpperCase().replace(/U/g, 'T')).replace(/-/g, '');
  const off = Math.abs(frame) - 1;
  let out = '';
  for (let i = off; i + 3 <= s.length; i += 3) out += translateCodon(s.slice(i, i + 3), table);
  return out;
}
export function sixFrames(seq: string, tableId = 1): { frame: Frame; protein: string }[] {
  return FRAMES.map(frame => ({ frame, protein: translate(seq, tableId, frame) }));
}

/* ---------- ORFs ---------- */
export interface Orf {
  frame: Frame; strand: '+' | '-';
  /** 1-based, inclusive, on the forward strand; start < end always. */
  start: number; end: number;
  lengthNt: number; lengthAa: number; protein: string;
  /** No stop codon before the sequence ended. */
  partial: boolean;
}
export interface OrfOptions { minAa?: number; tableId?: number; /** Also accept the table's alternative initiators (GTG, TTG …) as starts. */ altStarts?: boolean }
/** Longest ORF per stop codon in all six frames: first start codon after the previous stop to the next stop (inclusive). */
export function findOrfs(seq: string, opts: OrfOptions = {}): Orf[] {
  const { minAa = 30, tableId = 1, altStarts = false } = opts;
  const table = codonTable(tableId);
  const starts = altStarts ? table.starts : ['ATG'];
  const fwd = seq.toUpperCase().replace(/U/g, 'T').replace(/-/g, '');
  const N = fwd.length;
  const out: Orf[] = [];
  for (const frame of FRAMES) {
    const s = frame < 0 ? reverseComplement(fwd) : fwd;
    const off = Math.abs(frame) - 1;
    let orfStart = -1;
    for (let i = off; i + 3 <= s.length; i += 3) {
      const codon = s.slice(i, i + 3);
      const isStop = table.stops.includes(codon);
      if (orfStart < 0 && starts.includes(codon)) orfStart = i;
      const last = i + 3 > s.length - 3;
      if (orfStart >= 0 && (isStop || last)) {
        const endIdx = isStop ? i + 2 : i + 2; // inclusive 0-based index of the last nt (stop included)
        const nt = s.slice(orfStart, endIdx + 1);
        const protein = translate(nt, tableId, 1).replace(/\*$/, '');
        // The initiator is translated as M regardless of the codon (NCBI convention).
        const prot = protein.length ? 'M' + protein.slice(1) : protein;
        if (prot.length >= minAa) {
          const a = orfStart, b = endIdx;
          const start = frame < 0 ? N - b : a + 1, end = frame < 0 ? N - a : b + 1;
          out.push({ frame, strand: frame < 0 ? '-' : '+', start, end, lengthNt: b - a + 1, lengthAa: prot.length, protein: prot, partial: !isStop });
        }
        orfStart = -1;
      }
    }
  }
  return out.sort((p, q) => q.lengthAa - p.lengthAa || p.start - q.start);
}

/* ---------- restriction sites ---------- */
export interface Enzyme { name: string; site: string; /** [top, bottom] nt from site start to the cut, top-strand coordinates. */ cut: [number, number] }
export const ENZYMES: Enzyme[] = (enzymeJson as unknown as { enzymes: Enzyme[] }).enzymes;
export function enzymeByName(name: string): Enzyme | undefined { return ENZYMES.find(e => e.name === name); }
export type Overhang = "5'" | "3'" | 'blunt';
export function overhangOf(e: Enzyme): { type: Overhang; length: number } {
  const d = e.cut[1] - e.cut[0];
  return { type: d > 0 ? "5'" : d < 0 ? "3'" : 'blunt', length: Math.abs(d) };
}
export function isPalindromic(site: string): boolean { return reverseComplement(site) === site.toUpperCase(); }

export interface Site {
  enzyme: string; site: string; strand: '+' | '-';
  /** 1-based first nucleotide of the recognition site on the top strand. */
  position: number;
  /** Number of nucleotides 5' of the cut on the top / bottom strand (top-strand coordinates); cut between cutTop and cutTop+1 (1-based). */
  cutTop: number; cutBottom: number;
  overhang: Overhang; overhangLength: number;
}
function siteRegex(site: string): RegExp {
  return new RegExp([...site.toUpperCase()].map(c => { const s = IUPAC[c]; if (!s) throw new NucleicError(`Bad site "${site}"`); return s.length === 1 ? s : `[${s}]`; }).join(''));
}
function scan(s: string, re: RegExp): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) { const m = re.exec(s.slice(i)); if (!m) break; out.push(i + m.index); i += m.index; }
  return out;
}
/** All recognition sites for the given enzymes on both strands. Circular sequences wrap around the origin. */
export function restrictionSites(seq: string, enzymes: Enzyme[] = ENZYMES, opts: { circular?: boolean } = {}): Site[] {
  const s = seq.toUpperCase().replace(/U/g, 'T').replace(/-/g, '');
  const N = s.length;
  const out: Site[] = [];
  for (const e of enzymes) {
    const L = e.site.length;
    if (L > N) continue;
    const search = opts.circular ? s + s.slice(0, L - 1) : s;
    const strands: ('+' | '-')[] = isPalindromic(e.site) ? ['+'] : ['+', '-'];
    for (const strand of strands) {
      const pattern = strand === '+' ? e.site : reverseComplement(e.site);
      for (const p of scan(search, siteRegex(pattern))) {
        const [t, b] = e.cut;
        const cutTop = strand === '+' ? p + t : p + L - b, cutBottom = strand === '+' ? p + b : p + L - t;
        const ov = overhangOf(e);
        const wrap = (x: number) => opts.circular ? ((x % N) + N) % N : x;
        out.push({ enzyme: e.name, site: e.site, strand, position: p + 1, cutTop: wrap(cutTop), cutBottom: wrap(cutBottom), overhang: ov.type, overhangLength: ov.length });
      }
    }
  }
  return out.sort((a, b) => a.position - b.position || a.enzyme.localeCompare(b.enzyme));
}

/** Fragment lengths from top-strand cut positions (nt before the cut). Cuts at 0 or N do not cut a linear molecule. */
export function fragmentLengths(length: number, cuts: number[], circular = false): number[] {
  const c = [...new Set(cuts.filter(x => x > 0 && x < length))].sort((a, b) => a - b);
  if (circular) {
    if (c.length === 0) return [length];
    return c.map((x, i) => (i + 1 < c.length ? c[i + 1]! - x : length - x + c[0]!));
  }
  const bounds = [0, ...c, length];
  return bounds.slice(1).map((x, i) => x - bounds[i]!).filter(x => x > 0);
}

export interface DigestRow { enzyme: string; site: string; overhang: Overhang; cuts: number; positions: number[]; fragments: number[] }
/** Per-enzyme summary of a digest (single-enzyme fragments). */
export function digestSummary(seq: string, enzymes: Enzyme[] = ENZYMES, opts: { circular?: boolean } = {}): DigestRow[] {
  const N = seq.replace(/-/g, '').length;
  const sites = restrictionSites(seq, enzymes, opts);
  return enzymes.map(e => {
    const mine = sites.filter(x => x.enzyme === e.name);
    return { enzyme: e.name, site: e.site, overhang: overhangOf(e).type, cuts: mine.length, positions: mine.map(x => x.position), fragments: fragmentLengths(N, mine.map(x => x.cutTop), opts.circular) };
  });
}

/* ---------- FASTA ---------- */
export function formatFasta(entries: { header: string; seq: string }[], width = 60): string {
  return entries.map(e => `>${e.header}\n${(e.seq.match(new RegExp(`.{1,${width}}`, 'g')) ?? []).join('\n')}`).join('\n') + '\n';
}
