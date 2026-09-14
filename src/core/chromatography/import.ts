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
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
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

type AktaChannel = Exclude<ChromatogramChannel, 'volumeMl' | 'timeMin'>;

interface AktaPair {
  channel: AktaChannel;
  axisColumn: number;
  valueColumn: number;
  header: string;
  bareUv?: boolean;
  values: Array<{ axis: number; value: number }>;
}

function aktaChannel(name: string): { channel: AktaChannel; bareUv?: boolean } | undefined {
  const normalized = normalizeHeader(name);
  if (normalized === 'uv') return { channel: 'uv280', bareUv: true };
  if (normalized.includes('uv') && normalized.includes('280')) return { channel: 'uv280' };
  if (normalized.includes('% cond') || normalized.includes('percent cond') || normalized.includes('buffer b') || normalized === '%b') return { channel: 'percentB' };
  if (normalized.includes('cond')) return { channel: 'conductivityMsCm' };
  if (normalized.includes('pressure')) return { channel: 'pressureBar' };
  if (normalized === 'ph') return { channel: 'ph' };
  return undefined;
}

/** Parses the paired axis/value ASCII layout emitted by older and newer ÅKTA/UNICORN exports. */
function parseAktaPairedChannels(lines: string[]): ChromatogramImport | undefined {
  for (let headerRow = 0; headerRow < Math.min(lines.length - 2, 3); headerRow += 1) {
    const names = parseDelimitedLine(lines[headerRow]!, '\t');
    const units = parseDelimitedLine(lines[headerRow + 1]!, '\t');
    const pairCount = Math.floor(Math.min(names.length, units.length) / 2);
    if (pairCount === 0 || !Array.from({ length: pairCount }, (_, index) => normalizeHeader(units[index * 2]!) === 'ml').some(Boolean)) continue;

    const pairs: AktaPair[] = [];
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const descriptor = aktaChannel(names[pairIndex * 2]!);
      if (!descriptor) continue;
      const unit = units[pairIndex * 2 + 1]?.trim();
      pairs.push({
        channel: descriptor.channel,
        bareUv: descriptor.bareUv,
        axisColumn: pairIndex * 2,
        valueColumn: pairIndex * 2 + 1,
        header: `${names[pairIndex * 2]!.trim()} (${unit || 'value'})`,
        values: [],
      });
    }
    const uvPair = pairs.find(pair => pair.channel === 'uv280');
    if (!uvPair) continue;

    const notices: string[] = [];
    for (let rowIndex = headerRow + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = parseDelimitedLine(lines[rowIndex]!, '\t');
      pairs.forEach(pair => {
        const axis = parseNumber(row[pair.axisColumn]);
        const value = parseNumber(row[pair.valueColumn]);
        if (axis === undefined || value === undefined) {
          if (row.some(cell => cell.trim())) notices.push(`Row ${rowIndex + 1}: invalid ${pair.header} pair omitted.`);
          return;
        }
        pair.values.push({ axis, value });
      });
    }
    if (uvPair.values.length === 0) continue;

    if (uvPair.bareUv) notices.push('ÅKTA export contains a bare UV channel; verify that the detector wavelength is 280 nm before using it as A280.');
    const valuesFor = (channel: AktaChannel): Map<number, number> => new Map(pairs.find(pair => pair.channel === channel)?.values.map(item => [item.axis, item.value]));
    const conductivity = valuesFor('conductivityMsCm');
    const percentB = valuesFor('percentB');
    const pressure = valuesFor('pressureBar');
    const ph = valuesFor('ph');
    const points = uvPair.values.map(({ axis, value }) => {
      const point: ChromatogramPoint = { volumeMl: axis, uv280: value };
      const conductivityValue = conductivity.get(axis); if (conductivityValue !== undefined) point.conductivityMsCm = conductivityValue;
      const percentBValue = percentB.get(axis); if (percentBValue !== undefined) point.percentB = percentBValue;
      const pressureValue = pressure.get(axis); if (pressureValue !== undefined) point.pressureBar = pressureValue;
      const phValue = ph.get(axis); if (phValue !== undefined) point.ph = phValue;
      return point;
    });
    const sourceHeaders = pairs.map(pair => pair.header);
    const columnMapping: ChromatogramColumnMapping = { volumeMl: uvPair.axisColumn, uv280: uvPair.valueColumn };
    const mappedHeaders: ChromatogramImport['mappedHeaders'] = { volumeMl: uvPair.header, uv280: uvPair.header };
    pairs.forEach(pair => {
      if (pair.channel === 'uv280') return;
      columnMapping[pair.channel] = pair.valueColumn;
      mappedHeaders[pair.channel] = pair.header;
    });
    return { sourceHeaders, columnMapping, mappedHeaders, points, fractions: [], notices };
  }
  return undefined;
}

/** Converts a raw UV 280 mAU point value to absorbance units without changing the imported data. */
export function uv280MilliAbsorbanceToAu(point: ChromatogramPoint): number | undefined {
  return point.uv280 === undefined ? undefined : point.uv280 / 1000;
}

/** Parses delimited chromatogram text; native result archives and Excel files are unsupported. */
export function parseChromatogram(text: string, options: ChromatogramMapping = {}): ChromatogramImport {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) throw new Error('Chromatogram input must contain a header row.');

  const aktaImport = parseAktaPairedChannels(lines);
  if (aktaImport) {
    aktaImport.fractions.push(...(options.fractionBounds ?? []));
    return aktaImport;
  }

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
