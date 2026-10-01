/* Fourier shell correlation (FSC) curve import and reporting. Curves are imported, never computed from maps.
   - Spatial frequency f is in 1/Å; resolution = 1/f (Å). A shell index k of a box of B px at pixel size p (Å/px)
     has f = k / (B·p). Nyquist resolution = 2p.
   - Resolution at a threshold is the first downward crossing, linearly interpolated in spatial frequency between the
     two bracketing shells. Thresholds: 0.143 gold-standard (Rosenthal & Henderson 2003 J Mol Biol 333:721;
     Scheres & Chen 2012 Nat Methods 9:853), 0.5 (van Heel & Schatz 2005 J Struct Biol 151:250).
   - RELION postprocess.star: `data_fsc` loop with _rlnSpectralIndex, _rlnResolution (1/Å), _rlnAngstromResolution,
     _rlnFourierShellCorrelation{Corrected,UnmaskedMaps,MaskedMaps} and
     _rlnCorrectedFourierShellCorrelationPhaseRandomizedMaskedMaps (RELION documentation).
   - Generic delimited text (cryoSPARC exports, pasted tables): the column layout is detected heuristically from
     header names and values; no real cryoSPARC export was available when this was written, so the result is always
     overridable through an explicit column mapping. */

export class FscParseError extends Error {}

export const FSC_GOLD_STANDARD = 0.143;
export const FSC_HALF = 0.5;

export function freqToResolution(freq: number): number {
  return freq > 0 && Number.isFinite(freq) ? 1 / freq : Infinity;
}
export function resolutionToFreq(resolution: number): number {
  return resolution > 0 && Number.isFinite(resolution) ? 1 / resolution : 0;
}

// ---------- tokenising ----------

/** Split on whitespace, honouring '...' and "..." (a closing quote must be followed by whitespace or the line end). */
export function tokenizeStarLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    while (i < n && /\s/.test(line[i]!)) i++;
    if (i >= n) break;
    const c = line[i]!;
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && !(line[j] === c && (j + 1 >= n || /\s/.test(line[j + 1]!)))) j++;
      out.push(line.slice(i + 1, Math.min(j, n)));
      i = j + 1;
    } else {
      if (c === '#') break; // inline comment
      let j = i;
      while (j < n && !/\s/.test(line[j]!)) j++;
      out.push(line.slice(i, j));
      i = j;
    }
  }
  return out;
}

function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"' && cur.trim() === '') { quoted = true; cur = ''; }
    else if (c === delim) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parseNumberToken(tok: string): number {
  const t = tok.trim();
  if (t === '') return NaN;
  if (/^[+-]?inf(inity)?$/i.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/.test(t)) return NaN;
  return Number(t.replace(/[dD]/, 'e'));
}

// ---------- STAR ----------

export interface StarBlock {
  name: string;
  /** Loop labels in file order, e.g. `_rlnSpectralIndex` (trailing `#N` comments removed). */
  labels: string[];
  rows: string[][];
  /** Non-loop `_key value` items. */
  pairs: Record<string, string>;
}

/** Parse the data blocks and loops of a STAR file. Rows may span lines; comments and blank lines are ignored. */
export function parseStar(text: string): StarBlock[] {
  const blocks: StarBlock[] = [];
  let block: StarBlock | undefined;
  let mode: 'none' | 'labels' | 'rows' = 'none';
  let pending: string[] = [];
  let inTextField = false;
  const flushPending = () => {
    if (block && pending.length) {
      throw new FscParseError(
        `Block data_${block.name}: the loop declares ${block.labels.length} columns but its ${block.rows.length * block.labels.length + pending.length} values are not a whole number of rows.`,
      );
    }
  };
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  for (const [lineNo, raw] of lines.entries()) {
    if (inTextField) { if (raw.startsWith(';')) inTextField = false; continue; }
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (raw.startsWith(';')) { // multi-line text field: counts as a single value
      inTextField = true;
      if (mode === 'rows' && block) pending.push('');
      continue;
    }
    const lower = line.toLowerCase();
    if (lower.startsWith('data_')) {
      flushPending();
      block = { name: line.slice(5).split(/\s/)[0]!, labels: [], rows: [], pairs: {} };
      blocks.push(block);
      mode = 'none'; pending = [];
      continue;
    }
    if (lower === 'loop_' || lower.startsWith('loop_ ')) {
      if (!block) throw new FscParseError(`Line ${lineNo + 1}: loop_ appears before any data_ block.`);
      flushPending();
      // a second loop in the same block: start a new pseudo-block so labels are not mixed
      if (block.labels.length) { block = { name: block.name, labels: [], rows: [], pairs: {} }; blocks.push(block); }
      mode = 'labels'; pending = [];
      continue;
    }
    if (lower === 'save_' || lower.startsWith('save_')) { flushPending(); mode = 'none'; pending = []; continue; }
    const toks = tokenizeStarLine(line);
    if (toks.length === 0) continue;
    if (line.startsWith('_')) {
      if (!block) throw new FscParseError(`Line ${lineNo + 1}: item "${toks[0]}" appears before any data_ block.`);
      if (mode === 'labels') { block.labels.push(toks[0]!); continue; }
      flushPending();
      mode = 'none'; pending = [];
      block.pairs[toks[0]!] = toks[1] ?? '';
      continue;
    }
    if (!block || block.labels.length === 0 || mode === 'none') {
      throw new FscParseError(`Line ${lineNo + 1}: unexpected data "${line.slice(0, 40)}" outside a loop_ with column labels.`);
    }
    mode = 'rows';
    pending.push(...toks);
    while (pending.length >= block.labels.length) block.rows.push(pending.splice(0, block.labels.length));
  }
  flushPending();
  if (!blocks.some(b => b.labels.length > 0)) {
    throw new FscParseError('No data_ block with a loop_ table was found; this does not look like a STAR file.');
  }
  return blocks;
}

export function looksLikeStar(text: string): boolean {
  return /^\s*data_/m.test(text);
}

// ---------- tables ----------

export interface FscTable {
  headers: string[];
  /** Column-major numbers; NaN where a value was not numeric. */
  columns: number[][];
  source: 'star' | 'delimited';
  /** Human-readable notes (block used, lines skipped, ...). */
  notes: string[];
  /** Values found alongside the curve in a RELION postprocess.star. */
  meta?: { relionFinalResolution?: number; pixelSize?: number };
}

function starToTable(blocks: StarBlock[]): FscTable {
  const loops = blocks.filter(b => b.labels.length > 0);
  const hasFsc = (b: StarBlock) => b.labels.some(l => /fouriershellcorrelation/i.test(l));
  const chosen = loops.find(b => b.name.toLowerCase() === 'fsc' && b.rows.length > 0)
    ?? loops.find(b => hasFsc(b) && b.rows.length > 0);
  if (!chosen) {
    const names = loops.map(b => `data_${b.name}`).join(', ');
    throw new FscParseError(`No FSC table found in this STAR file (looked for a data_fsc block or FourierShellCorrelation columns; found ${names || 'no loops'}).`);
  }
  const clean = chosen.labels.map(l => l.replace(/\s+#\d+\s*$/, '').replace(/^_/, ''));
  const columns = clean.map((_, c) => chosen.rows.map(r => parseNumberToken(r[c] ?? '')));
  const general = blocks.find(b => b.name.toLowerCase() === 'general');
  const finalRes = Number(general?.pairs['_rlnFinalResolution']);
  return {
    headers: clean, columns, source: 'star', notes: [`Read block data_${chosen.name} (${chosen.rows.length} rows).`],
    ...(Number.isFinite(finalRes) && finalRes > 0 ? { meta: { relionFinalResolution: finalRes } } : {}),
  };
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 20);
  if (sample.some(l => l.includes('\t'))) return '\t';
  if (sample.some(l => l.includes(','))) return ',';
  if (sample.some(l => l.includes(';'))) return ';';
  return ' ';
}

/** Parse CSV / TSV / semicolon / whitespace-separated text with an optional header row (possibly `#`-prefixed). */
export function parseDelimitedTable(text: string): FscTable {
  const raw = text.replace(/^﻿/, '').split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l !== '');
  if (raw.length === 0) throw new FscParseError('The text is empty.');
  const stripped = raw.map(l => {
    const m = /^[#%/]+\s*(.*)$/.exec(l);
    return { commented: !!m, body: m ? m[1]! : l };
  });
  const delim = detectDelimiter(stripped.map(s => s.body));
  const split = (s: string) => (delim === ' ' ? tokenizeStarLine(s) : splitDelimited(s, delim));
  const isNumericRow = (t: string[]) => t.length > 0 && t.every(x => !Number.isNaN(parseNumberToken(x)));

  const firstData = stripped.findIndex(s => !s.commented && isNumericRow(split(s.body)));
  if (firstData < 0) throw new FscParseError('No numeric data rows were found. Expected columns of numbers (a header row is optional).');
  const ncols = split(stripped[firstData]!.body).length;
  if (ncols < 2) throw new FscParseError('Only one numeric column was found; an FSC curve needs a frequency/resolution column and at least one FSC column.');

  let headers: string[] | undefined;
  for (let i = firstData - 1; i >= 0; i--) {
    const t = split(stripped[i]!.body);
    if (t.length === ncols && !isNumericRow(t)) { headers = t; break; }
  }
  const notes: string[] = [];
  if (!headers) notes.push('No header row recognised; columns are named Column 1, 2, ...');
  const columns: number[][] = Array.from({ length: ncols }, () => []);
  let skipped = 0;
  for (let i = firstData; i < stripped.length; i++) {
    const s = stripped[i]!;
    if (s.commented) continue;
    const t = split(s.body);
    if (t.length !== ncols || !isNumericRow(t)) { skipped++; continue; }
    t.forEach((x, c) => columns[c]!.push(parseNumberToken(x)));
  }
  if (skipped) notes.push(`Skipped ${skipped} line${skipped === 1 ? '' : 's'} that were not ${ncols} numbers.`);
  return {
    headers: headers ?? columns.map((_, i) => `Column ${i + 1}`),
    columns, source: 'delimited', notes,
  };
}

/** Parse STAR (auto-detected) or delimited text into a column table. Throws FscParseError with a readable message. */
export function parseFscTable(text: string): FscTable {
  if (!text || !text.trim()) throw new FscParseError('Nothing to read: paste text or load a file.');
  if (looksLikeStar(text)) {
    const table = starToTable(parseStar(text));
    // RELION writes its command line as a comment, e.g. "# --i ... --angpix 1.244 ...".
    const ang = /--angpix\s+([0-9.]+)/.exec(text.slice(0, 2000));
    const pixelSize = ang ? Number(ang[1]) : NaN;
    if (Number.isFinite(pixelSize) && pixelSize > 0) table.meta = { ...table.meta, pixelSize };
    return table;
  }
  return parseDelimitedTable(text);
}

// ---------- column detection ----------

export type FreqKind = 'invAngstrom' | 'angstrom' | 'index';

export interface FscMapping {
  freqCol: number;
  freqKind: FreqKind;
  fscCols: number[];
  /** False when headers were not recognised and the mapping is a guess from the data: the UI should ask. */
  confident: boolean;
  notes: string[];
}

type Role = 'invAngstrom' | 'angstrom' | 'resolution?' | 'index' | 'fsc' | 'unknown';

export function classifyHeader(header: string): Role {
  const h = header.toLowerCase().replace(/_/g, ' ').replace(/å|ångström|angstroms?/g, 'a').replace(/⁻¹/g, '^-1').trim();
  if (h === 'rlnspectralindex') return 'index';
  if (h === 'rlnresolution') return 'invAngstrom';
  if (h === 'rlnangstromresolution') return 'angstrom';
  if (/fouriershellcorrelation|fsc|correlation|\bcorr\b/.test(h)) return 'fsc';
  if (/1\s*\/\s*a\b|\ba?\^-1|inverse|spatial|freq|wavenumber|\bs\s*\(/.test(h)) return 'invAngstrom';
  if (/shell|index|\bk\b|\bring\b/.test(h)) return 'index';
  if (/\(a\)|\[a\]|\ba\b/.test(h) && /res|d\b|\(a\)|\[a\]/.test(h)) return 'angstrom';
  if (/resolution|\bres\b/.test(h)) return 'resolution?';
  return 'unknown';
}

const finite = (c: number[]) => c.filter(Number.isFinite);
const isMonotonic = (c: number[]) => {
  const v = finite(c);
  if (v.length < 3) return false;
  let up = true, down = true;
  for (let i = 1; i < v.length; i++) { if (v[i]! < v[i - 1]!) up = false; if (v[i]! > v[i - 1]!) down = false; }
  return up || down;
};
const looksLikeFsc = (c: number[]) => { const v = finite(c); return v.length > 2 && v.every(x => x >= -1.2 && x <= 1.2); };
function kindFromData(c: number[]): FreqKind {
  const v = finite(c);
  if (v.length && v.every(x => Number.isInteger(x) && x >= 0)) return 'index';
  return Math.max(...v) <= 1.5 ? 'invAngstrom' : 'angstrom';
}

/** Heuristic column detection. Always show the result to the user and let them override it. */
export function detectFscColumns(table: FscTable): FscMapping {
  const roles = table.headers.map(classifyHeader);
  const notes: string[] = [];
  const pref = ['invAngstrom', 'angstrom', 'index', 'resolution?'] as const;
  let freqCol = -1;
  let freqKind: FreqKind = 'invAngstrom';
  for (const role of pref) {
    const c = roles.indexOf(role);
    if (c >= 0) {
      freqCol = c;
      freqKind = role === 'resolution?' ? kindFromData(table.columns[c]!) : role;
      break;
    }
  }
  let confident = freqCol >= 0;
  if (freqCol < 0) {
    freqCol = table.columns.findIndex(c => isMonotonic(c));
    if (freqCol < 0) freqCol = 0;
    freqKind = kindFromData(table.columns[freqCol]!);
    notes.push('Column headers were not recognised; the frequency column and units were guessed from the values.');
  }
  // RELION 4 writes a per-shell "particle mask fraction" next to the curves; it is not an FSC curve.
  const notACurve = (i: number) => /particlemaskfraction/i.test(table.headers[i]!);
  let fscCols = roles.map((r, i) => (r === 'fsc' && i !== freqCol && !notACurve(i) ? i : -1)).filter(i => i >= 0);
  if (fscCols.length === 0) {
    fscCols = table.columns.map((c, i) => (i !== freqCol && looksLikeFsc(c) ? i : -1)).filter(i => i >= 0);
    if (fscCols.length === 0) fscCols = table.columns.map((_, i) => i).filter(i => i !== freqCol);
    confident = false;
    notes.push('No column is named like an FSC; columns with values in [-1, 1] were selected.');
  }
  return { freqCol, freqKind, fscCols, confident, notes };
}

// ---------- curves ----------

export interface FscCurve {
  name: string;
  /** Spatial frequency (1/Å), ascending. */
  freq: number[];
  fsc: number[];
}

const RELION_NAMES: Record<string, string> = {
  rlnFourierShellCorrelationCorrected: 'Corrected',
  rlnFourierShellCorrelationUnmaskedMaps: 'Unmasked maps',
  rlnFourierShellCorrelationMaskedMaps: 'Masked maps',
  rlnCorrectedFourierShellCorrelationPhaseRandomizedMaskedMaps: 'Phase-randomised masked (corrected)',
};
export function curveLabel(header: string): string {
  return RELION_NAMES[header] ?? header;
}

export interface BuildOptions {
  /** Å/px, needed (with box) only for a shell-index frequency column. */
  pixelSize?: number;
  /** Box size in px of the maps the FSC was computed on. */
  box?: number;
}

export function frequencyOf(value: number, kind: FreqKind, opts: BuildOptions): number {
  if (kind === 'invAngstrom') return value;
  if (kind === 'angstrom') return value === Infinity || value === 0 ? 0 : value > 0 ? 1 / value : NaN;
  const { pixelSize: p, box: b } = opts;
  if (!(p && p > 0 && b && b > 0)) {
    throw new FscParseError('The frequency column is a shell index, so pixel size and box size are required to convert it to 1/Å (open Advanced options).');
  }
  return value / (b * p);
}

/** Build curves from a table and column mapping. Rows with a non-finite frequency or FSC are dropped. */
export function buildFscCurves(table: FscTable, mapping: FscMapping, opts: BuildOptions = {}): FscCurve[] {
  const fcol = table.columns[mapping.freqCol];
  if (!fcol) throw new FscParseError('The chosen frequency column does not exist.');
  if (mapping.fscCols.length === 0) throw new FscParseError('Choose at least one FSC column.');
  const freqs = fcol.map(v => frequencyOf(v, mapping.freqKind, opts));
  const curves: FscCurve[] = [];
  for (const c of mapping.fscCols) {
    const col = table.columns[c];
    if (!col) continue;
    const pts = freqs.map((f, i) => ({ f, v: col[i]! })).filter(p => Number.isFinite(p.f) && p.f >= 0 && Number.isFinite(p.v));
    if (pts.length < 3) throw new FscParseError(`Column "${table.headers[c]}" has only ${pts.length} usable numeric rows (need at least 3). Check the column mapping.`);
    pts.sort((a, b) => a.f - b.f);
    curves.push({ name: curveLabel(table.headers[c]!), freq: pts.map(p => p.f), fsc: pts.map(p => p.v) });
  }
  return curves;
}

// ---------- analysis ----------

export type CrossingStatus = 'crossed' | 'never-crosses' | 'below-start';
export type NyquistStatus = 'ok' | 'near' | 'beyond' | 'not-reached' | 'none';

export interface FscCrossing {
  threshold: number;
  status: CrossingStatus;
  /** 1/Å at the first downward crossing (when crossed). */
  frequency?: number;
  /** Å at the first downward crossing (when crossed). */
  resolution?: number;
  /** Å of the last shell still at or above the threshold (RELION reports this, without interpolation). */
  lastShellResolution?: number;
  /** True if the curve rises above the threshold again after the first crossing. */
  reCrosses: boolean;
  reCrossFrequency?: number;
  nyquist: NyquistStatus;
}

export interface FscAnalysis {
  name: string;
  crossings: FscCrossing[];
  nyquistResolution: number;
  /** True when the pixel size was not given and Nyquist was taken from the highest frequency in the curve. */
  nyquistInferred: boolean;
  warnings: string[];
}

/** Within this fraction of the Nyquist resolution a crossing is reported as "near Nyquist". */
export const NYQUIST_NEAR_FRACTION = 0.05;

/** First downward crossing of `threshold` (fsc[i-1] >= t > fsc[i]), linearly interpolated in frequency. Arrays ascending in freq. */
export function resolutionAtThreshold(freq: number[], fsc: number[], threshold: number): Omit<FscCrossing, 'nyquist'> {
  const n = Math.min(freq.length, fsc.length);
  if (n < 2) return { threshold, status: 'never-crosses', reCrosses: false };
  if (fsc[0]! < threshold) return { threshold, status: 'below-start', reCrosses: false };
  for (let i = 1; i < n; i++) {
    if (fsc[i - 1]! >= threshold && fsc[i]! < threshold) {
      const f0 = freq[i - 1]!, f1 = freq[i]!, y0 = fsc[i - 1]!, y1 = fsc[i]!;
      const f = f0 + ((y0 - threshold) / (y0 - y1)) * (f1 - f0);
      let reCross: number | undefined;
      for (let j = i; j < n; j++) if (fsc[j]! > threshold) { reCross = freq[j]!; break; }
      return {
        threshold, status: 'crossed', frequency: f, resolution: freqToResolution(f), lastShellResolution: freqToResolution(f0),
        reCrosses: reCross !== undefined, ...(reCross !== undefined ? { reCrossFrequency: reCross } : {}),
      };
    }
  }
  return { threshold, status: 'never-crosses', reCrosses: false };
}

function nyquistStatus(c: Omit<FscCrossing, 'nyquist'>, nyq: number): NyquistStatus {
  if (c.status === 'never-crosses') return 'not-reached';
  if (c.status !== 'crossed' || c.resolution === undefined) return 'none';
  if (c.resolution < nyq * (1 - 1e-3)) return 'beyond';
  if (c.resolution <= nyq * (1 + NYQUIST_NEAR_FRACTION)) return 'near';
  return 'ok';
}

const fmtRes = (r: number) => `${r.toFixed(2)} Å`;

export function analyzeFscCurve(
  curve: FscCurve,
  opts: { thresholds?: number[]; pixelSize?: number } = {},
): FscAnalysis {
  const thresholds = opts.thresholds ?? [FSC_GOLD_STANDARD, FSC_HALF];
  const maxFreq = Math.max(...curve.freq);
  const nyquistInferred = !(opts.pixelSize && opts.pixelSize > 0);
  const nyquistResolution = nyquistInferred ? freqToResolution(maxFreq) : 2 * opts.pixelSize!;
  const warnings: string[] = [];
  if (curve.fsc.some(v => v > 1.05 || v < -1.05)) {
    warnings.push('Some FSC values lie outside [-1, 1]; this column may not be an FSC.');
  }
  if (!nyquistInferred && maxFreq > (1 / nyquistResolution) * 1.02) {
    warnings.push(`The curve extends to ${fmtRes(freqToResolution(maxFreq))}, beyond the Nyquist resolution ${fmtRes(nyquistResolution)} for the pixel size entered; check the pixel size.`);
  }
  const crossings = thresholds.map(t => {
    const c = resolutionAtThreshold(curve.freq, curve.fsc, t);
    const nyquist = nyquistStatus(c, nyquistResolution);
    const label = `FSC ${t}`;
    if (c.status === 'below-start') warnings.push(`${label}: the curve starts below ${t}, so no downward crossing exists.`);
    if (c.status === 'never-crosses') warnings.push(`${label}: the curve never falls below ${t} up to ${fmtRes(freqToResolution(maxFreq))}; the resolution is at or beyond the ${nyquistInferred ? 'last shell' : 'Nyquist limit'}.`);
    if (c.reCrosses && c.resolution !== undefined) {
      warnings.push(`${label}: the curve rises above ${t} again at ${fmtRes(freqToResolution(c.reCrossFrequency!))} after the first crossing at ${fmtRes(c.resolution)}; the first crossing is reported, inspect the curve.`);
    }
    if (nyquist === 'near') warnings.push(`${label}: crossing at ${fmtRes(c.resolution!)} is at or near the Nyquist resolution ${fmtRes(nyquistResolution)}${nyquistInferred ? ' (inferred from the last shell)' : ''}; resolution is limited by sampling.`);
    if (nyquist === 'beyond') warnings.push(`${label}: crossing at ${fmtRes(c.resolution!)} is better than Nyquist ${fmtRes(nyquistResolution)}; check the pixel size.`);
    return { ...c, nyquist };
  });
  return { name: curve.name, crossings, nyquistResolution, nyquistInferred, warnings };
}

/** Short table text for the Nyquist column. */
export function nyquistSummary(a: FscAnalysis): string {
  const worst = (['beyond', 'near', 'not-reached'] as const).find(s => a.crossings.some(c => c.nyquist === s));
  if (worst === 'beyond') return 'Better than Nyquist: check pixel size';
  if (worst === 'near') return 'At/near Nyquist';
  if (worst === 'not-reached') return 'No crossing before Nyquist';
  return 'OK';
}

// ---------- synthetic example ----------

/** Model curve FSC(f) = 1 / (1 + (f/f0)^n). */
export function modelFsc(f: number, f0: number, n: number): number {
  return 1 / (1 + Math.pow(f / f0, n));
}
/** Analytic frequency where the model curve equals `t`. */
export function modelCrossing(f0: number, n: number, t: number): number {
  return f0 * Math.pow(1 / t - 1, 1 / n);
}

/** A synthetic RELION-style postprocess.star FSC block (invented numbers, not measured data). */
export function syntheticFscStar(pixelSize = 0.83, box = 256): string {
  const lines = [
    '# SYNTHETIC EXAMPLE generated by Bio-Bench from FSC = 1/(1+(f/f0)^n). Not measured data.',
    '', 'data_fsc', '', 'loop_',
    '_rlnSpectralIndex #1', '_rlnResolution #2', '_rlnAngstromResolution #3',
    '_rlnFourierShellCorrelationCorrected #4', '_rlnFourierShellCorrelationUnmaskedMaps #5',
    '_rlnFourierShellCorrelationMaskedMaps #6',
  ];
  const shell = 1 / (box * pixelSize);
  const f0 = (res: number, n: number) => 1 / res / Math.pow(1 / FSC_GOLD_STANDARD - 1, 1 / n);
  const corrected = f0(3.1, 8), unmasked = f0(3.6, 7), masked = f0(2.95, 8);
  for (let k = 0; k <= box / 2; k++) {
    const f = k * shell;
    const ang = k === 0 ? 999 : 1 / f;
    lines.push([
      String(k).padStart(5), f.toFixed(6).padStart(10), ang.toFixed(6).padStart(12),
      modelFsc(f, corrected, 8).toFixed(6), modelFsc(f, unmasked, 7).toFixed(6), modelFsc(f, masked, 8).toFixed(6),
    ].join(' '));
  }
  return lines.join('\n') + '\n';
}
