export const QPCR_HEADER_ALIASES = {
  sample: ['sample', 'sample name'],
  target: ['target', 'target name', 'gene'],
  cq: ['cq', 'ct', 'cp', 'c(t)'],
  well: ['well', 'well position'],
  quantity: ['quantity', 'starting quantity', 'standard quantity'],
} as const;

export interface QpcrObservation {
  id: string;
  sample: string;
  target: string;
  cq: number | null;
  replicate?: string;
  condition?: string;
  well?: string;
  role?: string;
  standardQuantity?: number;
  excluded?: boolean;
}

export type QpcrColumnName = 'sample' | 'target' | 'cq' | 'well' | 'quantity' | 'replicate' | 'condition' | 'role' | 'excluded';
export type QpcrColumnMapping = Partial<Record<QpcrColumnName, number>> & Pick<Record<QpcrColumnName, number>, 'sample' | 'target' | 'cq'>;

export interface QpcrImport {
  sourceHeaders: string[];
  mappedHeaders: Partial<Record<QpcrColumnName, string>>;
  rows: string[][];
  observations: QpcrObservation[];
  notices: string[];
}

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

function optionalCell(row: string[], index: number | undefined): string | undefined {
  const value = index === undefined ? undefined : row[index]?.trim();
  return value || undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseExclusion(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (['true', 'yes', '1', 'exclude', 'excluded'].includes(normalized)) return true;
  if (['false', 'no', '0', 'include', 'included'].includes(normalized)) return false;
  return undefined;
}

function observationFromRow(row: string[], mapping: QpcrColumnMapping, rowIndex: number): QpcrObservation {
  const cqValue = optionalCell(row, mapping.cq);
  const cq = parseNumber(cqValue) ?? null;
  const quantityValue = optionalCell(row, mapping.quantity);
  const excludedValue = optionalCell(row, mapping.excluded);

  return {
    id: `qpcr-${rowIndex + 1}`,
    sample: optionalCell(row, mapping.sample) ?? '',
    target: optionalCell(row, mapping.target) ?? '',
    cq,
    replicate: optionalCell(row, mapping.replicate),
    condition: optionalCell(row, mapping.condition),
    well: optionalCell(row, mapping.well),
    role: optionalCell(row, mapping.role),
    standardQuantity: parseNumber(quantityValue),
    excluded: parseExclusion(excludedValue),
  };
}

/** Maps a caller-selected set of raw column indexes into normalized observations. */
export function mapQpcrColumns(rows: string[][], mapping: QpcrColumnMapping): QpcrObservation[] {
  return rows.map((row, index) => observationFromRow(row, mapping, index));
}

/** Parses a CSV, TSV, or semicolon-delimited qPCR export using recognized headers. */
export function parseQpcrTable(text: string): QpcrImport {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) throw new Error('qPCR table must contain a header row.');

  const delimiter = selectDelimiter(lines[0]!);
  const sourceHeaders = parseDelimitedLine(lines[0]!, delimiter);
  const rows = lines.slice(1).map(line => parseDelimitedLine(line, delimiter));
  const notices: string[] = [];
  const mapping = {} as Partial<Record<QpcrColumnName, number>>;
  const mappedHeaders = {} as Partial<Record<QpcrColumnName, string>>;
  const aliases: Record<'sample' | 'target' | 'cq' | 'well' | 'quantity', readonly string[]> = QPCR_HEADER_ALIASES;

  sourceHeaders.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const field = (Object.keys(aliases) as Array<keyof typeof aliases>)
      .find(key => aliases[key].includes(normalized));
    if (!field) return;
    if (mapping[field] !== undefined) {
      notices.push(`Duplicate ${field} header "${header}" ignored; using "${mappedHeaders[field]}".`);
      return;
    }
    mapping[field] = index;
    mappedHeaders[field] = header;
  });

  if (mapping.sample === undefined || mapping.target === undefined || mapping.cq === undefined) {
    throw new Error('qPCR table requires mappable sample, target, and Cq columns.');
  }

  const completeMapping: QpcrColumnMapping = {
    sample: mapping.sample,
    target: mapping.target,
    cq: mapping.cq,
    well: mapping.well,
    quantity: mapping.quantity,
  };
  const observations = mapQpcrColumns(rows, completeMapping);

  observations.forEach((observation, index) => {
    const rawCq = optionalCell(rows[index]!, completeMapping.cq);
    if (!rawCq) notices.push(`Row ${index + 1}: blank Cq kept as null.`);
    else if (/^undetermined$/i.test(rawCq)) notices.push(`Row ${index + 1}: undetermined Cq kept as null.`);
    else if (observation.cq === null) notices.push(`Row ${index + 1}: nonnumeric Cq kept as null.`);
  });

  return { sourceHeaders, mappedHeaders, rows, observations, notices };
}
