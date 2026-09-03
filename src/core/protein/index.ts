/* Protein sequence parameters. Pure functions; all masses in Da, ε in M⁻¹cm⁻¹.
   Reference values: ExPASy ProtParam (Gasteiger et al. 2005), see tests/core/protein.test.ts. */
import aa from '@/data/protein/aa.json';
import diwvJson from '@/data/protein/diwv.json';
import halfLifeJson from '@/data/protein/half-life.json';
import pkaJson from '@/data/protein/pka-sets.json';
import proteasesJson from '@/data/protein/proteases.json';

export type Counts = Record<string, number>;
export const AA_MW = aa.mw as Record<string, number>;
export const AA_MONO = aa.mono as Record<string, number>;
export const AA_KD = aa.kd as Record<string, number>;
export const AA_ATOMS = aa.atoms as Record<string, Record<string, number>>;
export const WATER = aa.water, WATER_MONO = aa.waterMono, PROTON = aa.proton;
export const DIWV = diwvJson.values as Record<string, Record<string, number>>;
export const HALF_LIFE = halfLifeJson.values as Record<'mammal' | 'yeast' | 'ecoli', Record<string, string>>;
export const STANDARD_AA = 'ACDEFGHIKLMNPQRSTVWY';
export const ACCEPTED_AA = 'ACDEFGHIKLMNPQRSTVWYUBZOJX';

export interface PKaSet { nTerm: Record<string, number>; cTerm: Record<string, number>; side: Record<string, number> }
export const PKA_SETS = pkaJson.values as Record<'bjellqvist' | 'emboss', PKaSet>;
export type PKaScheme = keyof typeof PKA_SETS;

export interface Protease { name: string; cut: string; noCut: string; pattern: string; desc: string }
export const PROTEASES = proteasesJson.values as Protease[];

/** Uppercase and keep accepted letters; report what was dropped. */
export function sanitize(raw: string) {
  const upper = raw.toUpperCase();
  const removed = { whitespace: 0, digits: 0, dashes: 0, stars: 0, punctuation: 0, other: 0 };
  let seq = '';
  for (const ch of upper) {
    if (ACCEPTED_AA.includes(ch)) { seq += ch; continue; }
    if (/\s/.test(ch)) removed.whitespace++;
    else if (/[0-9]/.test(ch)) removed.digits++;
    else if (/[-–—_]/.test(ch)) removed.dashes++;
    else if (ch === '*') removed.stars++;
    else if (/[.,:;/|()[\]{}'"+=<>?~`!@#$%^&]/.test(ch)) removed.punctuation++;
    else removed.other++;
  }
  const ambiguous = [...new Set([...seq].filter(c => !STANDARD_AA.includes(c)))];
  return { seq, removed, ambiguous };
}

export interface FastaEntry { header: string; seq: string }
/** FASTA with tolerant handling: no header → one entry; ';' comments skipped. */
export function parseFasta(text: string): FastaEntry[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: FastaEntry[] = [];
  let header: string | null = null, seq: string[] = [], sawHeader = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith(';')) continue;
    if (l.startsWith('>')) {
      if (header !== null) out.push({ header, seq: seq.join('') });
      header = l.slice(1).trim() || `Sequence ${out.length + 1}`;
      seq = []; sawHeader = true;
    } else seq.push(l);
  }
  if (header !== null) out.push({ header, seq: seq.join('') });
  if (!sawHeader) {
    const joined = lines.join('').replace(/\s/g, '');
    if (/[A-Za-z]/.test(joined)) out.push({ header: 'Sequence 1', seq: joined });
  }
  return out;
}

export function countAA(seq: string): Counts {
  const c: Counts = {};
  for (const ch of seq) c[ch] = (c[ch] ?? 0) + 1;
  return c;
}

/** Average molecular mass (Da): Σ residue masses + H2O. */
export function molecularWeight(counts: Counts): number {
  let m = WATER;
  for (const a in counts) m += counts[a]! * (AA_MW[a] ?? 0);
  return m;
}
/** Monoisotopic mass (Da). Ambiguous residues (B/Z/X/J) contribute 0. */
export function monoisotopicMass(counts: Counts): number {
  let m = WATER_MONO;
  for (const a in counts) m += counts[a]! * (AA_MONO[a] ?? 0);
  return m;
}

export type ExtState = 'native' | 'denatured';
/** ε280 (Pace 1995). 'native' 5500/1490/125; 'denatured' (6 M GdnHCl) 5685/1285/125. All Cys pairs assumed oxidised for `cystines`. */
export function extinctionCoefficients(counts: Counts, mw: number, state: ExtState = 'native') {
  const E = state === 'denatured' ? aa.extDenatured : aa.ext;
  const reduced = (counts.Y ?? 0) * E.Y + (counts.W ?? 0) * E.W;
  const cystines = reduced + Math.floor((counts.C ?? 0) / 2) * E.CYS_DISULFIDE_PAIR;
  return { reduced, cystines, absRed: mw ? reduced / mw : 0, absCys: mw ? cystines / mw : 0 };
}

/** Net charge at pH. Bjellqvist uses the first residue for the N-terminal pKa and a C-terminal D/E pKa. */
export function netCharge(counts: Counts, pH: number, scheme: PKaScheme = 'bjellqvist', seq = ''): number {
  const pK = PKA_SETS[scheme];
  const first = seq[0] ?? '', last = seq[seq.length - 1] ?? '';
  const pKn = pK.nTerm[first] ?? pK.nTerm.default!;
  const pKc = pK.cTerm[last] ?? pK.cTerm.default!;
  const pos = (n: number, pKa: number) => n / (1 + 10 ** (pH - pKa));
  const neg = (n: number, pKa: number) => n / (1 + 10 ** (pKa - pH));
  let nD = counts.D ?? 0, nE = counts.E ?? 0;
  let q = pos(1, pKn) - neg(1, pKc);
  if (last === 'D' && pK.cTerm.D !== undefined && nD > 0) { nD -= 1; q -= neg(1, pK.cTerm.D); }
  if (last === 'E' && pK.cTerm.E !== undefined && nE > 0) { nE -= 1; q -= neg(1, pK.cTerm.E); }
  q += pos(counts.K ?? 0, pK.side.K!) + pos(counts.R ?? 0, pK.side.R!) + pos(counts.H ?? 0, pK.side.H!);
  q -= neg(nD, pK.side.D!) + neg(nE, pK.side.E!) + neg(counts.C ?? 0, pK.side.C!) + neg(counts.Y ?? 0, pK.side.Y!);
  return q;
}

export function isoelectricPoint(counts: Counts, scheme: PKaScheme = 'bjellqvist', seq = ''): number {
  let lo = 0, hi = 14;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (netCharge(counts, mid, scheme, seq) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Per-residue fractional charge array (same pKa set as netCharge) for charge plots. */
export function perResidueCharge(seq: string, pH: number, scheme: PKaScheme = 'bjellqvist'): number[] {
  const pK = PKA_SETS[scheme];
  const s = pK.side;
  const arr = [...seq].map(r => {
    switch (r) {
      case 'K': return 1 / (1 + 10 ** (pH - s.K!));
      case 'R': return 1 / (1 + 10 ** (pH - s.R!));
      case 'H': return 1 / (1 + 10 ** (pH - s.H!));
      case 'D': return -1 / (1 + 10 ** (s.D! - pH));
      case 'E': return -1 / (1 + 10 ** (s.E! - pH));
      case 'C': return -1 / (1 + 10 ** (s.C! - pH));
      case 'Y': return -1 / (1 + 10 ** (s.Y! - pH));
      default: return 0;
    }
  });
  if (seq.length) {
    const last = seq[seq.length - 1]!;
    arr[0]! += 1 / (1 + 10 ** (pH - (pK.nTerm[seq[0]!] ?? pK.nTerm.default!)));
    const cSide = pK.cTerm[last];
    if (cSide !== undefined && (last === 'D' || last === 'E')) arr[seq.length - 1] = -1 / (1 + 10 ** (cSide - pH));
    arr[seq.length - 1]! += -1 / (1 + 10 ** (pK.cTerm.default! - pH));
  }
  return arr;
}

/** Guruprasad 1990: II = (10/L) Σ DIWV[i][i+1]; > 40 predicts instability. Pairs with non-standard residues are skipped. */
export function instabilityIndex(seq: string): number {
  if (seq.length < 2) return 0;
  let s = 0;
  for (let i = 0; i < seq.length - 1; i++) s += DIWV[seq[i]!]?.[seq[i + 1]!] ?? 0;
  return (10 / seq.length) * s;
}

/** Ikai 1980: X(A) + 2.9 X(V) + 3.9 (X(I) + X(L)) in mole percent. */
export function aliphaticIndex(counts: Counts, length: number): number {
  if (!length) return 0;
  const pct = (a: string) => 100 * (counts[a] ?? 0) / length;
  return pct('A') + 2.9 * pct('V') + 3.9 * (pct('I') + pct('L'));
}

/** Kyte-Doolittle grand average of hydropathy. */
export function gravy(seq: string): number {
  if (!seq.length) return 0;
  let s = 0;
  for (const a of seq) s += AA_KD[a] ?? 0;
  return s / seq.length;
}

export function atomicFormula(counts: Counts): { formula: string; atoms: Record<string, number> } {
  const t: Record<string, number> = { C: 0, H: 2, N: 0, O: 1, S: 0, Se: 0 };
  for (const a in counts) { const at = AA_ATOMS[a]; if (!at) continue; for (const el in at) t[el] = (t[el] ?? 0) + counts[a]! * at[el]!; }
  const formula = ['C', 'H', 'N', 'O', 'S', 'Se'].filter(el => t[el]! > 0).map(el => `${el}${t[el]}`).join('');
  return { formula, atoms: t };
}

export type Organism = keyof typeof HALF_LIFE;
export function halfLife(seq: string, organism: Organism): string {
  return HALF_LIFE[organism][seq[0] ?? ''] ?? 'Unknown';
}

export interface Peptide { start: number; end: number; seq: string; mw: number; mono: number; pI: number; missed: number }
/** In-silico digest. start/end are 1-based inclusive. */
export function digest(seq: string, protease: Protease, missedCleavages = 0): Peptide[] {
  const re = new RegExp(protease.pattern, 'g');
  const sites = new Set<number>([0, seq.length]);
  for (const m of seq.matchAll(re)) {
    const cutAt = m[0].length === 0 ? m.index! : m.index! + m[0].length; // lookahead-only pattern cuts before the match
    if (cutAt > 0 && cutAt < seq.length) sites.add(cutAt);
  }
  const bounds = [...sites].sort((a, b) => a - b);
  const out: Peptide[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    for (let mc = 0; mc <= missedCleavages && i + 1 + mc < bounds.length; mc++) {
      const start = bounds[i]!, end = bounds[i + 1 + mc]!;
      const p = seq.slice(start, end);
      const c = countAA(p);
      out.push({ start: start + 1, end, seq: p, mw: molecularWeight(c), mono: monoisotopicMass(c), pI: isoelectricPoint(c, 'bjellqvist', p), missed: mc });
    }
  }
  return out;
}

export interface ProteinSummary {
  seq: string; length: number; counts: Counts; mw: number; mono: number; pI: number;
  ext: ReturnType<typeof extinctionCoefficients>; instability: number; aliphatic: number; gravy: number; formula: string; ambiguous: string[];
}
export function summarize(rawSeq: string, scheme: PKaScheme = 'bjellqvist'): ProteinSummary {
  const { seq, ambiguous } = sanitize(rawSeq);
  const counts = countAA(seq);
  const mw = molecularWeight(counts);
  return { seq, length: seq.length, counts, mw, mono: monoisotopicMass(counts), pI: isoelectricPoint(counts, scheme, seq),
    ext: extinctionCoefficients(counts, mw), instability: instabilityIndex(seq), aliphatic: aliphaticIndex(counts, seq.length),
    gravy: gravy(seq), formula: atomicFormula(counts).formula, ambiguous };
}
