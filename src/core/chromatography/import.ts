export const CHANNEL_ALIASES = {
  volumeMl: ['volume (ml)', 'volume', 'elution volume'],
  timeMin: ['time (min)', 'time'],
  uv280: ['uv 280 (mau)', 'uv280', 'a280'],
  uv260: ['uv 260 (mau)', 'uv260', 'a260'],
  conductivityMsCm: ['cond (ms/cm)', 'conductivity'],
  pressureBar: ['pressure (bar)', 'pressure'],
  percentB: ['%b', 'buffer b'],
  ph: ['ph'],
} as const;

export type ChromatogramChannel = keyof typeof CHANNEL_ALIASES;
export type ChromatogramColumnName = ChromatogramChannel | 'fraction';

export interface ChromatogramPoint {
  volumeMl?: number;
  timeMin?: number;
  /** Raw instrument signal in mAU. Use uv280MilliAbsorbanceToAu for AU. */
  uv280?: number;
  /** Raw instrument signal in mAU. */
  uv260?: number;
  conductivityMsCm?: number;
  pressureBar?: number;
  percentB?: number;
  ph?: number;
}

export interface Fraction {
  label: string;
  startVolumeMl?: number;
  endVolumeMl?: number;
  startTimeMin?: number;
  endTimeMin?: number;
}

export type ChromatogramColumnMapping = Partial<Record<ChromatogramColumnName, number>>;

export interface ChromatogramMapping extends ChromatogramColumnMapping {
  /** Explicit flow rate used only to derive volume for time-only imports. */
  flowMlPerMin?: number;
  /** User-specified collection or pooling intervals, retained unchanged. */
  fractionBounds?: Fraction[];
}

export interface ChromatogramImport {
  sourceHeaders: string[];
  columnMapping: ChromatogramColumnMapping;
  mappedHeaders: Partial<Record<ChromatogramColumnName, string>>;
  points: ChromatogramPoint[];
  fractions: Fraction[];
  notices: string[];
}

const FRACTION_ALIASES = ['fraction', 'fractions', 'fraction name'] as const;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

function selectDelimiter(header: string): string {
  const candidates = ['\t', ',', ';'];
  return candidates.reduce((selected, candidate) =>
    (header.split(candidate).length > header.split(selected).length ? candidate : selected), ',');
}

function parseNumber(value: string | undefined): number | undefined {
  const parsed = Number(value?.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mappedColumns(sourceHeaders: string[], manualMapping: ChromatogramColumnMapping, notices: string[]): ChromatogramColumnMapping {
  const mapping: ChromatogramColumnMapping = {};
  const aliases: Record<ChromatogramColumnName, readonly string[]> = {
    ...CHANNEL_ALIASES,
    fraction: FRACTION_ALIASES,
  };

  sourceHeaders.forEach((header, index) => {
    const field = (Object.keys(aliases) as ChromatogramColumnName[])
      .find(candidate => aliases[candidate].includes(normalizeHeader(header)));
    if (!field) return;
    if (mapping[field] !== undefined) {
      notices.push(`Duplicate ${field} header "${header}" ignored; using "${sourceHeaders[mapping[field]!]}".`);
      return;
    }
    mapping[field] = index;
  });

  for (const [field, index] of Object.entries(manualMapping) as Array<[ChromatogramColumnName, number | undefined]>) {
    if (index === undefined) continue;
    if (!Number.isInteger(index) || index < 0 || index >= sourceHeaders.length) {
      notices.push(`Manual ${field} column index ${index} is outside the input headers and was ignored.`);
      continue;
    }
    mapping[field] = index;
  }
  return mapping;
}

function pointFromRow(row: string[], mapping: ChromatogramColumnMapping, rowNumber: number, notices: string[]): ChromatogramPoint | undefined {
  const volume = parseNumber(row[mapping.volumeMl ?? -1]);
  const time = parseNumber(row[mapping.timeMin ?? -1]);
  if (mapping.volumeMl !== undefined && volume === undefined) {
    notices.push(`Row ${rowNumber}: invalid volume value skipped.`);
    return undefined;
  }
  if (mapping.timeMin !== undefined && time === undefined) {
    notices.push(`Row ${rowNumber}: invalid time value skipped.`);
    return undefined;
  }

  const point: ChromatogramPoint = {};
  if (volume !== undefined) point.volumeMl = volume;
  if (time !== undefined) point.timeMin = time;
  for (const channel of Object.keys(CHANNEL_ALIASES) as ChromatogramChannel[]) {
    if (channel === 'volumeMl' || channel === 'timeMin') continue;
    const index = mapping[channel];
    if (index === undefined) continue;
    const raw = row[index]?.trim();
    if (!raw) continue;
    const value = parseNumber(raw);
    if (value === undefined) {
      const channelLabel = channel === 'uv280' ? 'UV 280' : channel === 'uv260' ? 'UV 260' : channel;
      notices.push(`Row ${rowNumber}: nonnumeric ${channelLabel} value omitted.`);
    } else {
      point[channel] = value;
    }
  }
  return point;
}

/** Converts a raw UV 280 mAU point value to absorbance units without changing the imported data. */
export function uv280MilliAbsorbanceToAu(point: ChromatogramPoint): number | undefined {
  return point.uv280 === undefined ? undefined : point.uv280 / 1000;
}

/** Parses delimited chromatogram text; native result archives and Excel files are unsupported. */
export function parseChromatogram(text: string, options: ChromatogramMapping = {}): ChromatogramImport {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) throw new Error('Chromatogram input must contain a header row.');

  const delimiter = selectDelimiter(lines[0]!);
  const sourceHeaders = parseDelimitedLine(lines[0]!, delimiter);
  const notices: string[] = [];
  const manualMapping: ChromatogramColumnMapping = { ...options };
  delete (manualMapping as Partial<ChromatogramMapping>).flowMlPerMin;
  delete (manualMapping as Partial<ChromatogramMapping>).fractionBounds;
  const columnMapping = mappedColumns(sourceHeaders, manualMapping, notices);
  const mappedHeaders = Object.fromEntries(Object.entries(columnMapping)
    .map(([field, index]) => [field, sourceHeaders[index!]])) as ChromatogramImport['mappedHeaders'];
  const rows = lines.slice(1).map(line => parseDelimitedLine(line, delimiter));
  const points: ChromatogramPoint[] = [];
  const fractions: Fraction[] = [];
  const seenAxisValues = new Set<number>();

  if (columnMapping.volumeMl === undefined && columnMapping.timeMin === undefined) {
    notices.push('No volume or time column was mapped; no chromatogram points were imported.');
  } else {
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const point = pointFromRow(row, columnMapping, rowNumber, notices);
      if (!point) return;
      if (point.volumeMl === undefined && point.timeMin !== undefined && options.flowMlPerMin !== undefined) {
        if (Number.isFinite(options.flowMlPerMin) && options.flowMlPerMin > 0) point.volumeMl = point.timeMin * options.flowMlPerMin;
        else notices.push('flowMlPerMin must be a positive finite number; volume was not derived.');
      }
      const axis = point.volumeMl ?? point.timeMin;
      if (axis === undefined) return;
      const axisName = point.volumeMl === undefined ? 'time' : 'volume';
      if (seenAxisValues.has(axis)) {
        notices.push(`Row ${rowNumber}: duplicate ${axisName} value ${axis} skipped.`);
        return;
      }
      seenAxisValues.add(axis);
      points.push(point);
      const label = columnMapping.fraction === undefined ? undefined : row[columnMapping.fraction]?.trim();
      if (label && !fractions.some(fraction => fraction.label === label)) fractions.push({ label });
    });
  }

  fractions.push(...(options.fractionBounds ?? []));
  return { sourceHeaders, columnMapping, mappedHeaders, points, fractions, notices };
}
