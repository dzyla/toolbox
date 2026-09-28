import { type ParsedPlate, type PlateFormat, ROW_LABELS_384, ROW_LABELS_96, type SampleType, type WellValue } from './types';

/* ========================================================================= */
/* 2. Plate Parsing Engine (Matrix & 3-Column List)                          */
/* ========================================================================= */

/** Parse well coordinate e.g. 'A1', 'A01', 'H12', 'P24' */
export function parseWellId(str: string): { row: string; col: number; id: string } | null {
  const match = str.trim().match(/^([A-P])0?([1-9]|1[0-9]|2[0-4])$/i);
  if (!match) return null;
  const row = match[1]!.toUpperCase();
  const col = parseInt(match[2]!, 10);
  return { row, col, id: `${row}${col}` };
}

/** Detect delimiter in tabular text */
export function detectDelimiter(lines: string[]): string {
  let tabs = 0;
  let commas = 0;
  let semis = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '\t') tabs++;
      else if (ch === ',') commas++;
      else if (ch === ';') semis++;
    }
  }

  if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
  if (semis > commas && semis > 0) return ';';
  return ',';
}

/** Split a delimited line respecting optional quotes */
export function splitLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"(.*)"$/, '$1'));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"(.*)"$/, '$1'));
  return result;
}

/** Detect vendor hint from raw text headers */
export function detectVendor(text: string): 'tecan' | 'bmg' | 'biotek' | 'moldev' | 'generic' {
  const lower = text.toLowerCase();
  if (lower.includes('tecan') || lower.includes('magellan') || lower.includes('i-control') || lower.includes('<>')) {
    return 'tecan';
  }
  if (
    lower.includes('bmg') ||
    lower.includes('clariostar') ||
    lower.includes('pherastar') ||
    lower.includes('fluostar') ||
    lower.includes('test protocol') ||
    lower.includes('microplate name')
  ) {
    return 'bmg';
  }
  if (
    lower.includes('biotek') ||
    lower.includes('gen5') ||
    lower.includes('synergy') ||
    lower.includes('software version') ||
    lower.includes('experiment file')
  ) {
    return 'biotek';
  }
  if (lower.includes('molecular devices') || lower.includes('softmax') || lower.includes('##blocks')) {
    return 'moldev';
  }
  return 'generic';
}

/** Parse numeric token with support for commas, overflow, underflow, and NaNs */
export function parseTokenValue(token: string): { val: number | null; note?: string } {
  const clean = token.trim();
  if (!clean) return { val: null };

  const lower = clean.toLowerCase();
  if (['nan', 'n/a', 'na', 'null', '#value!', '#num!', '???', '-'].includes(lower)) {
    return { val: null };
  }

  // Overflow / saturation
  if (/^(ovrflw|over|ovfl|high|>.*)$/i.test(lower)) {
    return { val: null, note: 'Overflow / Saturation' };
  }
  // Underflow / below detection
  if (/^(low|<.*)$/i.test(lower)) {
    return { val: 0, note: 'Below LOD' };
  }

  // If token has European decimal comma like '0,123'
  const normalizedNumStr = clean.includes(',') && !clean.includes('.')
    ? clean.replace(',', '.')
    : clean;

  const num = parseFloat(normalizedNumStr);
  if (isNaN(num)) return { val: null };
  return { val: num };
}

/** Check if lines represent a 3-column / 2-column list export */
export function isListExport(lines: string[], delimiter: string): boolean {
  let wellMatches = 0;
  let totalChecked = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const tokens = splitLine(trimmed, delimiter);
    if (tokens.length >= 2 && tokens.length <= 5) {
      totalChecked++;
      const first = tokens[0] ?? '';
      if (parseWellId(first) !== null) {
        wellMatches++;
      }
    }
    if (totalChecked >= 15) break;
  }

  return wellMatches >= 3 && wellMatches / Math.max(1, totalChecked) > 0.4;
}

/** Create empty plate dictionary */
export function createEmptyPlate(format: PlateFormat): Record<string, WellValue> {
  const rows = format === 96 ? ROW_LABELS_96 : ROW_LABELS_384;
  const colsCount = format === 96 ? 12 : 24;
  const wells: Record<string, WellValue> = {};

  for (const r of rows) {
    for (let c = 1; c <= colsCount; c++) {
      const id = `${r}${c}`;
      wells[id] = {
        id,
        row: r,
        col: c,
        raw: null,
        normalized: null,
        sampleGroupId: '',
        sampleName: '',
        sampleType: 'sample',
      };
    }
  }
  return wells;
}

/** Parse 3-column or 2-column list exports (Well, Sample, Value) */
export function parseListExport(text: string, forcedDelimiter?: string): ParsedPlate {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const delimiter = forcedDelimiter ?? detectDelimiter(lines);
  const metadata: Record<string, string> = {};

  let hasRowsAboveH = false;
  let maxCol = 12;

  interface RawRow {
    wellId: string;
    row: string;
    col: number;
    sampleName: string;
    val: number | null;
    note?: string;
  }
  const rawRows: RawRow[] = [];

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) {
      const metaMatch = line.replace(/^[#\/]+\s*/, '').split(/[:=]/);
      if (metaMatch.length >= 2) {
        metadata[metaMatch[0]!.trim()] = metaMatch.slice(1).join(':').trim();
      }
      continue;
    }

    const parts = splitLine(line, delimiter);
    if (parts.length < 2) continue;

    const wellCoord = parseWellId(parts[0]!);
    if (!wellCoord) {
      // Possible header row: e.g. "Well, Sample, Absorbance"
      continue;
    }

    if (wellCoord.row > 'H') hasRowsAboveH = true;
    if (wellCoord.col > maxCol) maxCol = wellCoord.col;

    let sampleName = '';
    let valToken = parts[1]!;

    if (parts.length >= 3) {
      sampleName = parts[1]!;
      valToken = parts[2]!;
      if (!isNaN(parseFloat(parts[1]!)) && isNaN(parseFloat(parts[2]!))) {
        valToken = parts[1]!;
        sampleName = parts[2]!;
      }
    }

    const { val, note } = parseTokenValue(valToken);
    rawRows.push({
      wellId: wellCoord.id,
      row: wellCoord.row,
      col: wellCoord.col,
      sampleName,
      val,
      note,
    });
  }

  const format: PlateFormat = hasRowsAboveH || maxCol > 12 ? 384 : 96;
  const wells = createEmptyPlate(format);

  for (const r of rawRows) {
    if (wells[r.wellId]) {
      let sampleType: SampleType = 'sample';
      const nameLower = r.sampleName.toLowerCase();
      if (nameLower.includes('blank') || nameLower.includes('media') || nameLower.includes('buffer')) {
        sampleType = 'blank';
      } else if (nameLower.includes('pos') || nameLower.includes('positive') || nameLower.includes('max')) {
        sampleType = 'pos-ctrl';
      } else if (nameLower.includes('neg') || nameLower.includes('negative') || nameLower.includes('vehicle') || nameLower.includes('dmso')) {
        sampleType = 'neg-ctrl';
      } else if (nameLower.includes('std') || nameLower.includes('standard')) {
        sampleType = 'standard';
      }

      wells[r.wellId] = {
        id: r.wellId,
        row: r.row,
        col: r.col,
        raw: r.val,
        normalized: null,
        sampleGroupId: r.sampleName ? r.sampleName : '',
        sampleName: r.sampleName,
        sampleType,
        statusNote: r.note,
      };
    }
  }

  const rows = format === 96 ? [...ROW_LABELS_96] : [...ROW_LABELS_384];
  const cols = Array.from({ length: format === 96 ? 12 : 24 }, (_, i) => i + 1);

  return {
    format,
    wells,
    rows,
    cols,
    metadata,
    detectedFormat: 'list',
    vendorHint: detectVendor(text),
    delimiter,
    rawText: text,
  };
}

/**
 * Robust Matrix Parser for Tecan, BMG, BioTek, Molecular Devices, and generic CSV/TSV
 */
export function parseMatrixExport(text: string, forcedDelimiter?: string): ParsedPlate {
  const rawLines = text.split(/\r?\n/);
  const delimiter = forcedDelimiter ?? detectDelimiter(rawLines);
  const metadata: Record<string, string> = {};

  const lines: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('##')) {
      const parts = trimmed.replace(/^[#\/]+\s*/, '').split(/[:=]/);
      if (parts.length >= 2) {
        metadata[parts[0]!.trim()] = parts.slice(1).join(':').trim();
      }
      continue;
    }
    const tokens = splitLine(trimmed, delimiter);
    if (tokens.length === 2 && !/^[A-P]$/i.test(tokens[0]!)) {
      metadata[tokens[0]!] = tokens[1]!;
    }
    lines.push(trimmed);
  }

  let startIdx = -1;
  let isRowLabeled = false;
  let format: PlateFormat = 96;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const tokens = splitLine(line, delimiter);
    const first = tokens[0]?.trim() ?? '';
    if (/^(?:row\s*)?A:?$/i.test(first)) {
      startIdx = i;
      isRowLabeled = true;
      if (tokens.length >= 24) {
        format = 384;
      }
      break;
    }
  }

  if (startIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const tokens = splitLine(line, delimiter);
      const numericCount = tokens.filter(t => !isNaN(parseFloat(t.replace(',', '.')))).length;
      if (numericCount >= 12) {
        startIdx = i;
        isRowLabeled = false;
        if (tokens.length >= 24 || numericCount >= 20) {
          format = 384;
        }
        break;
      }
    }
  }

  if (startIdx === -1) {
    startIdx = 0;
  }

  const availableRows = lines.length - startIdx;
  if (availableRows >= 16) {
    const row16Line = lines[startIdx + 15];
    if (row16Line) {
      const t16 = splitLine(row16Line, delimiter);
      if (/^(?:row\s*)?P:?$/i.test(t16[0]?.trim() ?? '') || t16.length >= 24) {
        format = 384;
      }
    }
  }

  const wells = createEmptyPlate(format);
  const rows = format === 96 ? [...ROW_LABELS_96] : [...ROW_LABELS_384];
  const maxCols = format === 96 ? 12 : 24;

  let rPointer = 0;
  for (let i = startIdx; i < lines.length && rPointer < rows.length; i++) {
    const line = lines[i]!;
    const tokens = splitLine(line, delimiter);
    if (tokens.length === 0) continue;

    const first = tokens[0]?.trim() ?? '';
    if (first === '<>' || /^[0-9]+$/.test(first) || /^(data|results|plate|raw)/i.test(first)) {
      continue;
    }

    const expectedRowChar = rows[rPointer]!;
    let valTokens: string[] = [];

    if (isRowLabeled) {
      const rowMatch = first.match(/^(?:row\s*)?([A-P]):?$/i);
      if (!rowMatch) continue;
      const rowChar = rowMatch[1]!.toUpperCase();
      if (rowChar !== expectedRowChar) {
        const targetRIdx = rows.findIndex(r => r === rowChar);
        if (targetRIdx !== -1) {
          rPointer = targetRIdx;
        }
      }
      valTokens = tokens.slice(1);
    } else {
      valTokens = tokens;
    }

    for (let c = 1; c <= maxCols && c <= valTokens.length; c++) {
      const rawToken = valTokens[c - 1] ?? '';
      const wellId = `${rows[rPointer]}${c}`;
      const { val, note } = parseTokenValue(rawToken);
      if (wells[wellId]) {
        wells[wellId]!.raw = val;
        wells[wellId]!.statusNote = note;
      }
    }

    rPointer++;
  }

  const cols = Array.from({ length: maxCols }, (_, i) => i + 1);

  return {
    format,
    wells,
    rows,
    cols,
    metadata,
    detectedFormat: 'matrix',
    vendorHint: detectVendor(text),
    delimiter,
    rawText: text,
  };
}

/** Unified Plate Parser with automatic detection of format (matrix vs list) */
export function parsePlateData(
  text: string,
  options: { format?: PlateFormat; delimiter?: string } = {},
): ParsedPlate {
  const trimmed = text.trim();
  if (!trimmed) {
    const fmt = options.format ?? 96;
    return {
      format: fmt,
      wells: createEmptyPlate(fmt),
      rows: fmt === 96 ? [...ROW_LABELS_96] : [...ROW_LABELS_384],
      cols: Array.from({ length: fmt === 96 ? 12 : 24 }, (_, i) => i + 1),
      metadata: {},
      detectedFormat: 'matrix',
      vendorHint: 'generic',
      delimiter: options.delimiter ?? ',',
      rawText: text,
    };
  }

  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const delim = options.delimiter ?? detectDelimiter(lines);

  if (isListExport(lines, delim)) {
    return parseListExport(trimmed, delim);
  }
  return parseMatrixExport(trimmed, delim);
}
