/**
 * Silent restriction-site finder. For a coding sequence, lists single-nucleotide substitutions that keep the
 * encoded amino acid (synonymous) and that destroy an existing recognition site or create a new one, for a
 * chosen set of enzymes. Both strands, IUPAC-degenerate sites and sites spanning codon boundaries are handled.
 * Pure functions, no DOM.
 */
import { ENZYMES, IUPAC, codonTable, reverseComplement, translateCodon, isPalindromic, type Enzyme } from '@/core/nucleic/sequence';
import { HOST_CODON_USAGE, HOST_RARE_CODONS, type HostOrganism } from '@/core/rare-codons';

/** Common cloning enzymes offered by default (all are in src/data/restriction-enzymes.json). */
export const DEFAULT_ENZYME_NAMES = [
  'EcoRI', 'BamHI', 'HindIII', 'XhoI', 'NdeI', 'NcoI', 'XbaI', 'SalI', 'NotI', 'SacI', 'KpnI', 'PstI', 'SpeI',
  'NheI', 'BglII', 'EcoRV', 'ClaI', 'MluI', 'AgeI', 'SphI', 'BsaI', 'BsmBI', 'BbsI', 'SapI',
];

export interface CdsCheck {
  /** Cleaned uppercase DNA (U -> T), empty on fatal error. */
  seq: string;
  errors: string[];
  warnings: string[];
}

/** Cleans pasted/FASTA text and validates it as a coding sequence in the chosen frame (1..3). */
export function validateCds(raw: string, frame: 1 | 2 | 3 = 1): CdsCheck {
  const errors: string[] = [], warnings: string[] = [];
  const body = raw.replace(/^>.*$/gm, '').replace(/\s+/g, '').toUpperCase().replace(/U/g, 'T');
  const bad = [...new Set(body.replace(/[ACGT]/g, ''))];
  if (!body) errors.push('Enter a coding sequence.');
  else if (bad.length) errors.push(`Only A, C, G and T are accepted; found ${bad.slice(0, 6).join(', ')}.`);
  if (errors.length) return { seq: '', errors, warnings };
  const start = frame - 1;
  const coding = body.length - start;
  if (coding < 3) errors.push('The sequence is shorter than one codon in this frame.');
  if (errors.length) return { seq: '', errors, warnings };
  if (coding % 3) warnings.push(`Coding region (${coding} nt from frame ${frame}) is not a multiple of 3; the last ${coding % 3} nt are not mutated.`);
  const table = codonTable(1);
  const codons = Math.floor(coding / 3);
  if (body.slice(start, start + 3) !== 'ATG') warnings.push(`Frame ${frame} does not start with ATG.`);
  let internal = 0;
  for (let c = 0; c < codons - 1; c++) if (translateCodon(body.slice(start + 3 * c, start + 3 * c + 3), table) === '*') internal++;
  if (internal) warnings.push(`${internal} internal stop codon${internal > 1 ? 's' : ''} in frame ${frame}; stop codons are never mutated.`);
  const last = body.slice(start + 3 * (codons - 1), start + 3 * codons);
  if (translateCodon(last, table) !== '*') warnings.push('No terminal stop codon in this frame.');
  return { seq: body, errors, warnings };
}

export interface SiteRef {
  enzyme: string;
  strand: '+' | '-';
  /** 1-based first nucleotide of the matched recognition sequence (top-strand coordinates). */
  position: number;
  length: number;
  /** The top-strand bases of the match. */
  matched: string;
}

export interface SilentChange {
  /** 1-based nucleotide position in the input sequence. */
  position: number;
  /** 1-based codon number in the chosen frame. */
  codonNumber: number;
  codon: string;
  newCodon: string;
  aa: string;
  /** e.g. 'A>G' on the top strand. */
  substitution: string;
  lost: SiteRef[];
  gained: SiteRef[];
  oldCodonRare?: boolean;
  newCodonRare?: boolean;
  /** Relative synonymous usage fraction (0..1) of the new codon in the chosen organism, when known. */
  newCodonFraction?: number;
}

export interface DestroyRow { site: SiteRef; change: SilentChange; otherLost: SiteRef[]; otherGained: SiteRef[] }
export interface CreateRow { site: SiteRef; change: SilentChange; otherLost: SiteRef[]; otherGained: SiteRef[] }

export interface SilentSiteResult {
  sequence: string;
  frame: 1 | 2 | 3;
  enzymes: { name: string; site: string; palindromic: boolean; typeIIS: boolean }[];
  existing: SiteRef[];
  /** Existing sites with no single-nucleotide silent change that removes them. */
  undestroyable: SiteRef[];
  destroy: DestroyRow[];
  create: CreateRow[];
  changes: SilentChange[];
}

const BIT: Record<string, number> = { A: 1, C: 2, G: 4, T: 8 };
const maskOf = (site: string) => [...site.toUpperCase()].map(c => {
  const s = IUPAC[c];
  if (!s) throw new Error(`Bad recognition sequence ${site}`);
  return [...s].reduce((m, b) => m | BIT[b]!, 0);
});

interface Matcher { name: string; length: number; strands: { strand: '+' | '-'; mask: number[] }[] }

function buildMatcher(e: Enzyme): Matcher {
  const strands: Matcher['strands'] = [{ strand: '+', mask: maskOf(e.site) }];
  if (!isPalindromic(e.site)) strands.push({ strand: '-', mask: maskOf(reverseComplement(e.site)) });
  return { name: e.name, length: e.site.length, strands };
}

function sitesCovering(seq: string, ms: Matcher[], lo: number, hi: number, cover?: number): Map<string, SiteRef> {
  // matches whose start is in [lo, hi] (0-based), restricted to those covering `cover` when given
  const out = new Map<string, SiteRef>();
  for (const m of ms) {
    const L = m.length;
    const from = Math.max(0, cover === undefined ? lo : cover - L + 1);
    const to = Math.min(seq.length - L, cover === undefined ? hi : cover);
    for (const { strand, mask } of m.strands) {
      for (let s = from; s <= to; s++) {
        let k = 0;
        while (k < L && (BIT[seq[s + k]!]! & mask[k]!)) k++;
        if (k === L) out.set(`${m.name}|${strand}|${s}`, { enzyme: m.name, strand, position: s + 1, length: L, matched: seq.slice(s, s + L) });
      }
    }
  }
  return out;
}

export interface SilentOptions {
  frame?: 1 | 2 | 3;
  /** Enzyme names (as in the data file). Unknown names are ignored. */
  enzymes: string[];
  /** Optional organism for codon-rarity annotation. */
  host?: HostOrganism;
  tableId?: number;
}

export function enzymesByNames(names: string[]): Enzyme[] {
  const want = new Set(names.map(n => n.toLowerCase()));
  return ENZYMES.filter(e => want.has(e.name.toLowerCase()));
}

export function analyzeSilentSites(rawSeq: string, opts: SilentOptions): SilentSiteResult {
  const frame = opts.frame ?? 1;
  const seq = rawSeq.toUpperCase();
  if (/[^ACGT]/.test(seq)) throw new Error('Sequence must contain only A, C, G, T');
  const table = codonTable(opts.tableId ?? 1);
  const enzymes = enzymesByNames(opts.enzymes);
  const matchers = enzymes.map(buildMatcher);
  const N = seq.length;
  const start = frame - 1;
  const codons = Math.floor((N - start) / 3);

  const existingMap = sitesCovering(seq, matchers, 0, N);
  const existing = [...existingMap.values()].sort((a, b) => a.position - b.position || a.enzyme.localeCompare(b.enzyme));

  const rareSet = opts.host ? HOST_RARE_CODONS[opts.host] : undefined;
  const usage = opts.host ? HOST_CODON_USAGE[opts.host] : undefined;

  const beforeCache = new Map<number, Map<string, SiteRef>>();
  const changes: SilentChange[] = [];
  for (let c = 0; c < codons; c++) {
    const cs = start + 3 * c;
    const codon = seq.slice(cs, cs + 3);
    const aa = translateCodon(codon, table);
    if (aa === '*' || aa === 'X') continue;
    for (let k = 0; k < 3; k++) {
      const p = cs + k;
      for (const b of 'ACGT') {
        if (b === codon[k]) continue;
        const newCodon = codon.slice(0, k) + b + codon.slice(k + 1);
        if (translateCodon(newCodon, table) !== aa) continue;
        let before = beforeCache.get(p);
        if (!before) { before = sitesCovering(seq, matchers, 0, 0, p); beforeCache.set(p, before); }
        const mutated = seq.slice(0, p) + b + seq.slice(p + 1);
        const after = sitesCovering(mutated, matchers, 0, 0, p);
        const lost = [...before].filter(([key]) => !after.has(key)).map(([, v]) => v);
        const gained = [...after].filter(([key]) => !before!.has(key)).map(([, v]) => v);
        const ch: SilentChange = {
          position: p + 1, codonNumber: c + 1, codon, newCodon, aa, substitution: `${codon[k]}>${b}`, lost, gained,
        };
        if (rareSet && usage) {
          ch.oldCodonRare = rareSet.has(codon);
          ch.newCodonRare = rareSet.has(newCodon);
          const f = usage[newCodon]?.fraction;
          if (f !== undefined) ch.newCodonFraction = f;
        }
        changes.push(ch);
      }
    }
  }

  const refKey = (r: SiteRef) => `${r.enzyme}|${r.strand}|${r.position}`;
  const destroy: DestroyRow[] = [];
  const create: CreateRow[] = [];
  for (const ch of changes) {
    for (const s of ch.lost) destroy.push({ site: s, change: ch, otherLost: ch.lost.filter(x => x !== s), otherGained: ch.gained });
    for (const s of ch.gained) create.push({ site: s, change: ch, otherLost: ch.lost, otherGained: ch.gained.filter(x => x !== s) });
  }
  const order = (a: { site: SiteRef; change: SilentChange }, b: { site: SiteRef; change: SilentChange }) =>
    a.site.enzyme.localeCompare(b.site.enzyme) || a.site.position - b.site.position || a.change.position - b.change.position || a.change.newCodon.localeCompare(b.change.newCodon);
  destroy.sort(order); create.sort(order);
  const destroyed = new Set(destroy.map(d => refKey(d.site)));
  return {
    sequence: seq, frame,
    enzymes: enzymes.map(e => ({
      name: e.name, site: e.site, palindromic: isPalindromic(e.site),
      typeIIS: e.cut[0] > e.site.length || e.cut[1] > e.site.length || e.cut[0] < 0 || e.cut[1] < 0,
    })),
    existing, undestroyable: existing.filter(s => !destroyed.has(refKey(s))), destroy, create, changes,
  };
}

export function silentSitesCsv(result: SilentSiteResult, mode: 'destroy' | 'create'): (string | number)[][] {
  const fmt = (xs: SiteRef[]) => xs.map(x => `${x.enzyme}(${x.strand}${x.position})`).join('; ');
  const head = ['Enzyme', 'Site position', 'Strand', 'Matched sequence', 'Nucleotide position', 'Codon number', 'Codon change', 'Amino acid', 'Substitution', 'Also destroys', 'Also creates', 'New codon rare', 'New codon fraction'];
  const rows = (mode === 'destroy' ? result.destroy : result.create).map(r => [
    r.site.enzyme, r.site.position, r.site.strand, r.site.matched, r.change.position, r.change.codonNumber,
    `${r.change.codon}>${r.change.newCodon}`, r.change.aa, r.change.substitution,
    fmt(r.otherLost), fmt(r.otherGained),
    r.change.newCodonRare === undefined ? '' : r.change.newCodonRare ? 'yes' : 'no', r.change.newCodonFraction ?? '',
  ]);
  return [head, ...rows];
}
