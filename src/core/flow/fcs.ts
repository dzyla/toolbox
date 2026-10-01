/*
 * FCS 2.0 / 3.0 / 3.1 reader (ISAC Flow Cytometry Standard 3.1; Spidlen et al. 2010, Cytometry A 77:97).
 * Pure: bytes in, typed arrays out. Supports list mode (L) only, data types I, F, D and A, the first
 * data set of a file, and $SPILLOVER / $SPILL / $COMP compensation.
 */

export class FcsError extends Error {}

export interface FcsParameter {
  /** Zero-based column index (the spec's $Pn has n = index + 1). */
  index: number;
  /** $PnN short name. */
  name: string;
  /** $PnS stain/marker label, or '' when absent. */
  label: string;
  /** $PnR range. */
  range: number;
  /** $PnB bit width, or 0 for variable-width ASCII ('*'). */
  bits: number;
  /** True when $PnE declares log amplification (f1 > 0). */
  log: boolean;
  /** $PnE f1 (decades) and f2 (offset; 0 is treated as 1 per the spec). */
  decades: number;
  offset: number;
  /** $PnG gain, 1 when absent. */
  gain: number;
}

export interface CompensationMatrix {
  source: '$SPILLOVER' | '$SPILL' | '$COMP';
  /** Parameter names (matching $PnN) the rows and columns refer to. */
  names: string[];
  /** Row-major n x n spillover matrix S, with observed = true x S. */
  matrix: number[][];
}

export interface FcsMeta {
  cytometer: string;
  date: string;
  beginTime: string;
  endTime: string;
  fileName: string;
}

export interface FcsData {
  version: string;
  parameters: FcsParameter[];
  /** One Float32Array of scale values per parameter, all of length eventCount. */
  columns: Float32Array[];
  eventCount: number;
  keywords: Record<string, string>;
  meta: FcsMeta;
  compensation: CompensationMatrix | null;
  /** True when `columns` hold compensated values for the matrix's parameters. */
  compensationApplied: boolean;
  warnings: string[];
}

export interface ParseFcsOptions {
  /** Apply the file's compensation matrix when it has one. Default true. */
  compensate?: boolean;
  /** Apply $PnE log amplification and $PnG gain to produce scale values. Default true. */
  scaleValues?: boolean;
}

const decodeLatin1 = (bytes: Uint8Array): string => {
  let out = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return out;
};

/** Parse a TEXT segment: first character is the delimiter; a doubled delimiter is a literal one. */
export function parseTextSegment(text: string): Record<string, string> {
  if (text.length < 2) throw new FcsError('The FCS TEXT segment is empty.');
  const delim = text[0]!;
  const tokens: string[] = [];
  let cur = '';
  for (let i = 1; i < text.length; i++) {
    const c = text[i]!;
    if (c === delim) {
      if (text[i + 1] === delim) { cur += delim; i++; } else { tokens.push(cur); cur = ''; }
    } else cur += c;
  }
  if (cur !== '') tokens.push(cur);
  const kw: Record<string, string> = {};
  for (let i = 0; i + 1 < tokens.length; i += 2) kw[tokens[i]!.trim().toUpperCase()] = tokens[i + 1]!;
  return kw;
}

/** Invert a square matrix by Gauss-Jordan elimination with partial pivoting. */
export function invertMatrix(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r;
    if (Math.abs(a[piv]![col]!) < 1e-12) throw new FcsError('The compensation matrix is singular and cannot be inverted.');
    const tmp = a[col]!; a[col] = a[piv]!; a[piv] = tmp;
    const pivRow = a[col]!;
    const d = pivRow[col]!;
    for (let j = 0; j < 2 * n; j++) pivRow[j] = pivRow[j]! / d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const row = a[r]!;
      const f = row[col]!;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) row[j] = row[j]! - f * pivRow[j]!;
    }
  }
  return a.map(row => row.slice(n));
}

/** Parse $SPILLOVER / $SPILL ("n,name1..namen,v11..vnn") or $COMP ("n,v11..vnn", first n parameters). */
export function parseCompensation(kw: Record<string, string>, parameters: FcsParameter[]): CompensationMatrix | null {
  for (const key of ['$SPILLOVER', '$SPILL', '$COMP'] as const) {
    const raw = kw[key];
    if (!raw) continue;
    const t = raw.split(',').map(s => s.trim());
    const n = Number(t[0]);
    if (!Number.isInteger(n) || n < 1) throw new FcsError(`${key} does not start with a valid parameter count.`);
    let names: string[]; let values: string[];
    if (key === '$COMP') {
      if (n > parameters.length) throw new FcsError('$COMP lists more parameters than the file has.');
      names = parameters.slice(0, n).map(p => p.name);
      values = t.slice(1);
    } else {
      names = t.slice(1, 1 + n);
      values = t.slice(1 + n);
    }
    if (names.length !== n || values.length !== n * n) throw new FcsError(`${key} should hold ${n} names and ${n * n} values.`);
    const nums = values.map(Number);
    if (nums.some(v => !Number.isFinite(v))) throw new FcsError(`${key} contains a non-numeric value.`);
    const matrix = Array.from({ length: n }, (_, i) => nums.slice(i * n, (i + 1) * n));
    return { source: key, names, matrix };
  }
  return null;
}

/**
 * Compensate: true = observed x inverse(S). Returns new columns for the parameters in the matrix
 * (copies); other columns are shared. Names unknown to the file are an error.
 */
export function applyCompensation(columns: Float32Array[], parameters: FcsParameter[], comp: CompensationMatrix): Float32Array[] {
  const idx = comp.names.map(nm => {
    const i = parameters.findIndex(p => p.name === nm || (p.label !== '' && p.label === nm));
    if (i < 0) throw new FcsError(`The compensation matrix refers to "${nm}", which is not a parameter in this file.`);
    return i;
  });
  const inv = invertMatrix(comp.matrix);
  const n = idx.length;
  const events = columns[0]?.length ?? 0;
  const out = columns.slice();
  const outCols = idx.map(() => new Float32Array(events));
  const obs = new Float64Array(n);
  for (let e = 0; e < events; e++) {
    for (let i = 0; i < n; i++) obs[i] = columns[idx[i]!]![e]!;
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += obs[i]! * inv[i]![j]!;
      outCols[j]![e] = s;
    }
  }
  idx.forEach((ci, j) => { out[ci] = outCols[j]!; });
  return out;
}

function num(kw: Record<string, string>, key: string): number | undefined {
  const v = kw[key];
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : undefined;
}

function readHeaderField(bytes: Uint8Array, start: number): number {
  const s = decodeLatin1(bytes.subarray(start, start + 8)).trim();
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) throw new FcsError('The FCS header has an unreadable offset field.');
  return n;
}

export function parseFcs(input: ArrayBuffer | Uint8Array, options: ParseFcsOptions = {}): FcsData {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const warnings: string[] = [];
  if (bytes.length < 58) throw new FcsError('This file is too small to be an FCS file.');
  const version = decodeLatin1(bytes.subarray(0, 6));
  if (!/^FCS[23]\.\d$/.test(version)) throw new FcsError('Not an FCS file: the header does not start with "FCS2.0", "FCS3.0" or "FCS3.1".');
  if (!['FCS2.0', 'FCS3.0', 'FCS3.1'].includes(version)) warnings.push(`${version} is newer than the supported FCS 3.1; newer keywords are ignored.`);

  const textStart = readHeaderField(bytes, 10);
  const textEnd = readHeaderField(bytes, 18);
  let dataStart = readHeaderField(bytes, 26);
  let dataEnd = readHeaderField(bytes, 34);
  if (textEnd < textStart || textEnd === 0) throw new FcsError('The FCS header has an invalid TEXT segment range.');
  if (textEnd >= bytes.length) throw new FcsError('The file is truncated: the TEXT segment extends past the end of the file.');

  const kw = parseTextSegment(decodeLatin1(bytes.subarray(textStart, textEnd + 1)));
  // Files over 99,999,999 bytes put 0 in the header and carry the offsets in $BEGINDATA / $ENDDATA.
  if (dataStart === 0 && dataEnd === 0) {
    dataStart = num(kw, '$BEGINDATA') ?? 0;
    dataEnd = num(kw, '$ENDDATA') ?? 0;
  }
  if (dataStart === 0) throw new FcsError('The FCS file does not say where its DATA segment is (no header offsets and no $BEGINDATA/$ENDDATA).');

  const mode = (kw['$MODE'] ?? 'L').trim().toUpperCase();
  if (mode !== 'L') throw new FcsError(`Unsupported $MODE "${mode}": only list-mode (L) FCS files can be read; correlated histogram modes are not supported.`);
  const dtype = (kw['$DATATYPE'] ?? '').trim().toUpperCase();
  if (!['I', 'F', 'D', 'A'].includes(dtype)) throw new FcsError(`Unsupported or missing $DATATYPE "${kw['$DATATYPE'] ?? ''}": expected I, F, D or A.`);
  const par = num(kw, '$PAR');
  if (par === undefined || !Number.isInteger(par) || par < 1) throw new FcsError('The FCS file has no valid $PAR (parameter count).');

  const scaleValues = options.scaleValues ?? true;
  const parameters: FcsParameter[] = [];
  for (let i = 0; i < par; i++) {
    const n = i + 1;
    const bRaw = (kw[`$P${n}B`] ?? '').trim();
    const bits = bRaw === '*' ? 0 : Number(bRaw);
    if (bRaw === '' || !Number.isFinite(bits)) throw new FcsError(`Parameter ${n} has no valid $P${n}B bit width.`);
    const e = (kw[`$P${n}E`] ?? '0,0').split(',').map(s => Number(s.trim()));
    const decades = Number.isFinite(e[0]!) ? e[0]! : 0;
    const f2 = Number.isFinite(e[1]!) ? e[1]! : 0;
    const gain = num(kw, `$P${n}G`);
    parameters.push({
      index: i,
      name: (kw[`$P${n}N`] ?? `P${n}`).trim() || `P${n}`,
      label: (kw[`$P${n}S`] ?? '').trim(),
      range: num(kw, `$P${n}R`) ?? 0,
      bits,
      log: decades > 0,
      decades,
      offset: decades > 0 && f2 === 0 ? 1 : f2,
      gain: gain !== undefined && gain > 0 ? gain : 1,
    });
  }

  let little = true;
  if (dtype !== 'A') {
    const order = (kw['$BYTEORD'] ?? '').replace(/\s/g, '');
    if (/^1(,2(,3,4(,5,6,7,8)?)?)?$/.test(order)) little = true;
    else if (/^((8,7,6,5,)?4,3,)?2,1$/.test(order)) little = false;
    else throw new FcsError(`Unsupported $BYTEORD "${kw['$BYTEORD'] ?? ''}": only 1,2,3,4 (little endian) and 4,3,2,1 (big endian) are supported.`);
  }
  const widthBytes = parameters.map(p => {
    const n = p.index + 1;
    if (dtype === 'F') { if (p.bits !== 32) throw new FcsError(`$DATATYPE F requires $P${n}B = 32, found ${p.bits}.`); return 4; }
    if (dtype === 'D') { if (p.bits !== 64) throw new FcsError(`$DATATYPE D requires $P${n}B = 64, found ${p.bits}.`); return 8; }
    if (dtype === 'I') {
      if (![8, 16, 32, 64].includes(p.bits)) throw new FcsError(`Unsupported $P${n}B = ${p.bits}: integer data must use 8, 16, 32 or 64 bits.`);
      return p.bits / 8;
    }
    return p.bits; // ASCII: characters per field (0 = variable width)
  });
  const eventSize = widthBytes.reduce((a, b) => a + b, 0);
  let total = num(kw, '$TOT');
  const declared = Math.max(0, dataEnd - dataStart + 1);
  const columns: Float32Array[] = [];

  if (dtype === 'A') {
    const stop = dataEnd >= dataStart ? Math.min(bytes.length, dataEnd + 1) : bytes.length;
    const text = decodeLatin1(bytes.subarray(dataStart, stop));
    let values: number[];
    if (widthBytes.every(w => w > 0)) {
      const have = Math.floor(text.length / eventSize);
      if (total === undefined) total = have;
      if (have < total) throw new FcsError(`The file is truncated: ${total} events expected but the DATA segment holds only ${have}.`);
      values = new Array<number>(total * par);
      let pos = 0;
      for (let k = 0; k < total * par; k++) {
        const w = widthBytes[k % par]!;
        values[k] = Number(text.slice(pos, pos + w).trim());
        pos += w;
      }
    } else {
      const toks = text.split(/[\s,;\0]+/).filter(Boolean);
      const have = Math.floor(toks.length / par);
      if (total === undefined) total = have;
      if (have < total) throw new FcsError(`The file is truncated: ${total} events expected but the DATA segment holds only ${have}.`);
      values = toks.slice(0, total * par).map(Number);
    }
    if (values.some(v => !Number.isFinite(v))) throw new FcsError('The ASCII DATA segment contains a value that is not a number.');
    for (let p = 0; p < par; p++) {
      const col = new Float32Array(total);
      for (let e = 0; e < total; e++) col[e] = values[e * par + p]!;
      columns.push(col);
    }
  } else {
    if (total === undefined) total = Math.floor(declared / eventSize);
    const need = total * eventSize;
    if (bytes.length < dataStart + need) {
      throw new FcsError(`The file is truncated: ${total} events (${need} bytes) were expected from offset ${dataStart} but only ${Math.max(0, bytes.length - dataStart)} bytes are available.`);
    }
    if (declared > 0 && declared < need) warnings.push('The declared DATA segment is shorter than $TOT events; reading by $TOT.');
    const view = new DataView(bytes.buffer, bytes.byteOffset + dataStart, need);
    let acc = 0;
    for (let p = 0; p < par; p++) {
      const col = new Float32Array(total);
      const o = acc, bits = parameters[p]!.bits, range = parameters[p]!.range;
      acc += widthBytes[p]!;
      let mask = -1;
      if (dtype === 'I' && range > 0 && range < 2 ** bits) mask = 2 ** Math.ceil(Math.log2(range)) - 1;
      for (let e = 0; e < total; e++) {
        const at = e * eventSize + o;
        let v: number;
        if (dtype === 'F') v = view.getFloat32(at, little);
        else if (dtype === 'D') v = view.getFloat64(at, little);
        else if (bits === 8) v = view.getUint8(at);
        else if (bits === 16) v = view.getUint16(at, little);
        else if (bits === 32) v = view.getUint32(at, little);
        else v = Number(view.getBigUint64(at, little));
        if (mask >= 0) v = bits === 64 ? Number(BigInt(v) & BigInt(mask)) : (v & mask) >>> 0;
        col[e] = v;
      }
      columns.push(col);
    }
  }

  // Scale values: log amplification then linear gain (log only for integer / ASCII data).
  if (scaleValues) {
    for (const p of parameters) {
      const col = columns[p.index]!;
      if (p.log) {
        if (dtype === 'F' || dtype === 'D') { warnings.push(`${p.name}: $P${p.index + 1}E declares log amplification on floating-point data; values are used as stored.`); continue; }
        if (p.range <= 0) { warnings.push(`${p.name}: log amplification needs $P${p.index + 1}R; values are used as stored.`); continue; }
        const k = p.decades / p.range;
        for (let e = 0; e < col.length; e++) col[e] = 10 ** (k * col[e]!) * p.offset;
      } else if (p.gain !== 1 && !/^time$/i.test(p.name)) {
        for (let e = 0; e < col.length; e++) col[e] = col[e]! / p.gain;
      }
    }
  }

  const compensation = parseCompensation(kw, parameters);
  let outColumns = columns;
  let applied = false;
  if (compensation && (options.compensate ?? true)) {
    outColumns = applyCompensation(columns, parameters, compensation);
    applied = true;
  }

  return {
    version,
    parameters,
    columns: outColumns,
    eventCount: total,
    keywords: kw,
    meta: {
      cytometer: (kw['$CYT'] ?? '').trim(),
      date: (kw['$DATE'] ?? '').trim(),
      beginTime: (kw['$BTIM'] ?? '').trim(),
      endTime: (kw['$ETIM'] ?? '').trim(),
      fileName: (kw['$FIL'] ?? '').trim(),
    },
    compensation,
    compensationApplied: applied,
    warnings,
  };
}
