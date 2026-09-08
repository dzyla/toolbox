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

export interface QpcrAnalysisSettings {
  technicalReplicateRangeThreshold?: number;
  minStandardPoints?: number;
}

export interface QpcrTechnicalReplicateSummary {
  sample: string;
  target: string;
  condition?: string;
  count: number;
  mean: number;
  standardDeviation: number;
  range: number;
  candidateFlags: string[];
}

export interface QpcrStandardPoint {
  logQuantity: number;
  cq: number;
}

export interface QpcrStandardCurve {
  count: number;
  slope: number;
  intercept: number;
  rSquared: number;
  efficiency: number;
  usableRange: { minLogQuantity: number; maxLogQuantity: number };
}

export interface QpcrRelativeExpressionInput {
  targetCq: number;
  refCqs: number[];
  calibratorTargetCq: number;
  calibratorRefCqs: number[];
  method: 'delta-delta' | 'efficiency-corrected';
  comparableEfficiencyConfirmed?: boolean;
  /** Excess efficiency E from a standard curve; amplification base is 1 + E. */
  targetEfficiency?: number;
  /** Excess efficiencies E from standard curves; amplification bases are 1 + E. */
  referenceEfficiencies?: number[];
}

export interface QpcrRelativeExpression {
  status: 'derived' | 'blocked';
  foldChange?: number;
  message?: string;
}

export interface QpcrQcReport {
  status: 'ready' | 'blocked';
  technicalReplicates: QpcrTechnicalReplicateSummary[];
  standardCurves: Record<string, QpcrStandardCurve | null>;
  blockers: string[];
  warnings: string[];
  exclusions: Array<{ id: string; decision: 'include' | 'exclude' }>;
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

function isFiniteCq(cq: number | null): cq is number {
  return cq !== null && Number.isFinite(cq);
}

function geometricMean(values: number[]): number | null {
  if (values.length === 0 || values.some(value => !Number.isFinite(value) || value <= 0)) return null;
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

/** Summarizes included, finite-Cq technical replicates without changing source observations. */
export function summarizeTechnicalReplicates(
  observations: QpcrObservation[],
  settings: QpcrAnalysisSettings,
): QpcrTechnicalReplicateSummary[] {
  const rangeThreshold = settings.technicalReplicateRangeThreshold ?? 0.5;
  const groups = new Map<string, { sample: string; target: string; condition?: string; cqs: number[] }>();

  observations.forEach(observation => {
    if (observation.excluded === true || !isFiniteCq(observation.cq)) return;
    const key = [observation.sample, observation.target, observation.condition ?? ''].join('\u0000');
    const group = groups.get(key) ?? {
      sample: observation.sample,
      target: observation.target,
      condition: observation.condition,
      cqs: [],
    };
    group.cqs.push(observation.cq);
    groups.set(key, group);
  });

  return [...groups.values()].map(group => {
    const count = group.cqs.length;
    const mean = group.cqs.reduce((sum, cq) => sum + cq, 0) / count;
    const variance = count > 1
      ? group.cqs.reduce((sum, cq) => sum + (cq - mean) ** 2, 0) / (count - 1)
      : 0;
    const range = Math.max(...group.cqs) - Math.min(...group.cqs);
    const candidateFlags: string[] = [];
    if (count > 1 && range > rangeThreshold) {
      candidateFlags.push(`Technical replicate range ${range} exceeds ${rangeThreshold}; review before excluding any observation.`);
    }
    return {
      sample: group.sample,
      target: group.target,
      ...(group.condition === undefined ? {} : { condition: group.condition }),
      count,
      mean,
      standardDeviation: Math.sqrt(variance),
      range,
      candidateFlags,
    };
  });
}

/** Fits Cq against log10(quantity) using ordinary least squares. */
export function fitQpcrStandardCurve(points: QpcrStandardPoint[]): QpcrStandardCurve | null {
  const valid = points.filter(point => Number.isFinite(point.logQuantity) && Number.isFinite(point.cq));
  if (valid.length < 2) return null;

  const meanX = valid.reduce((sum, point) => sum + point.logQuantity, 0) / valid.length;
  const meanY = valid.reduce((sum, point) => sum + point.cq, 0) / valid.length;
  const sumXX = valid.reduce((sum, point) => sum + (point.logQuantity - meanX) ** 2, 0);
  if (sumXX === 0) return null;
  const sumXY = valid.reduce((sum, point) => sum + (point.logQuantity - meanX) * (point.cq - meanY), 0);
  const slope = sumXY / sumXX;
  if (!Number.isFinite(slope) || slope >= 0) return null;
  const intercept = meanY - slope * meanX;
  const totalSumSquares = valid.reduce((sum, point) => sum + (point.cq - meanY) ** 2, 0);
  const residualSumSquares = valid.reduce((sum, point) => sum + (point.cq - (slope * point.logQuantity + intercept)) ** 2, 0);
  const rSquared = totalSumSquares === 0 ? 1 : 1 - residualSumSquares / totalSumSquares;
  const efficiency = 10 ** (-1 / slope) - 1;
  if (!Number.isFinite(efficiency)) return null;

  return {
    count: valid.length,
    slope,
    intercept,
    rSquared,
    efficiency,
    usableRange: {
      minLogQuantity: Math.min(...valid.map(point => point.logQuantity)),
      maxLogQuantity: Math.max(...valid.map(point => point.logQuantity)),
    },
  };
}

/** Computes relative expression, blocking malformed inputs rather than dividing by them. */
export function computeRelativeExpression(input: QpcrRelativeExpressionInput): QpcrRelativeExpression {
  if (input.method === 'delta-delta' && !input.comparableEfficiencyConfirmed) {
    throw new Error('Comparable target and reference efficiencies must be explicitly confirmed for 2^-ΔΔCq.');
  }
  const cqs = [input.targetCq, input.calibratorTargetCq, ...input.refCqs, ...input.calibratorRefCqs];
  if (
    cqs.some(cq => !Number.isFinite(cq)) ||
    input.refCqs.length === 0 ||
    input.refCqs.length !== input.calibratorRefCqs.length
  ) {
    return { status: 'blocked', message: 'Relative expression requires finite target and matching reference Cq values.' };
  }

  const targetBase = input.method === 'delta-delta' ? 2 : input.targetEfficiency === undefined
    ? undefined
    : 1 + input.targetEfficiency;
  const referenceBases = input.method === 'delta-delta'
    ? input.refCqs.map(() => 2)
    : input.referenceEfficiencies?.map(efficiency => 1 + efficiency);
  if (
    targetBase === undefined || !Number.isFinite(targetBase) || targetBase <= 0 ||
    referenceBases === undefined || referenceBases.length !== input.refCqs.length ||
    referenceBases.some(base => !Number.isFinite(base) || base <= 0)
  ) {
    return { status: 'blocked', message: 'Efficiency-corrected expression requires excess efficiencies greater than -1 for target and references.' };
  }

  const targetFactor = targetBase ** (input.calibratorTargetCq - input.targetCq);
  const referenceFactors = input.refCqs.map((cq, index) =>
    referenceBases[index]! ** (input.calibratorRefCqs[index]! - cq));
  const referenceMean = geometricMean(referenceFactors);
  if (!Number.isFinite(targetFactor) || referenceMean === null || !Number.isFinite(referenceMean)) {
    return { status: 'blocked', message: 'Relative expression inputs produced an invalid expression factor.' };
  }
  const foldChange = targetFactor / referenceMean;
  return Number.isFinite(foldChange)
    ? { status: 'derived', foldChange }
    : { status: 'blocked', message: 'Relative expression calculation is not finite.' };
}

function normalizedRole(role: string | undefined): string {
  return (role ?? '').trim().toLowerCase().replace(/[ _-]+/g, '');
}

/** Builds visible QC blockers and warnings from raw observations and explicit settings. */
export function buildQpcrQc(observations: QpcrObservation[], settings: QpcrAnalysisSettings): QpcrQcReport {
  const technicalReplicates = summarizeTechnicalReplicates(observations, settings);
  const blockers: string[] = [];
  const warnings = technicalReplicates.flatMap(summary => summary.candidateFlags);
  const exclusions = observations
    .filter(observation => observation.excluded !== undefined)
    .map(observation => ({ id: observation.id, decision: observation.excluded ? 'exclude' as const : 'include' as const }));
  if (exclusions.some(exclusion => exclusion.decision === 'exclude')) {
    warnings.push(`${exclusions.filter(exclusion => exclusion.decision === 'exclude').length} observation(s) explicitly excluded from derived calculations.`);
  }

  observations.forEach(observation => {
    if (observation.excluded === true || !isFiniteCq(observation.cq)) return;
    const role = normalizedRole(observation.role);
    if (role === 'ntc' || role === 'notemplate') {
      blockers.push(`No-template control ${observation.id} has Cq ${observation.cq}.`);
    } else if (role === 'nort') {
      warnings.push(`No-RT control ${observation.id} has Cq ${observation.cq}; review genomic DNA contamination risk.`);
    }
  });

  const minimumStandardPoints = settings.minStandardPoints ?? 2;
  const standardByTarget = new Map<string, { points: QpcrStandardPoint[]; invalidCount: number }>();
  observations.forEach(observation => {
    if (normalizedRole(observation.role) !== 'standard') return;
    const target = standardByTarget.get(observation.target) ?? { points: [], invalidCount: 0 };
    standardByTarget.set(observation.target, target);
    if (observation.excluded === true) return;
    if (!isFiniteCq(observation.cq) || observation.standardQuantity === undefined ||
      !Number.isFinite(observation.standardQuantity) || observation.standardQuantity <= 0) {
      target.invalidCount += 1;
      return;
    }
    target.points.push({ logQuantity: Math.log10(observation.standardQuantity), cq: observation.cq });
  });
  const standardCurves: Record<string, QpcrStandardCurve | null> = {};
  standardByTarget.forEach((standard, target) => {
    const curve = standard.points.length >= minimumStandardPoints ? fitQpcrStandardCurve(standard.points) : null;
    standardCurves[target] = curve;
    if (standard.points.length === 0 && standard.invalidCount > 0) {
      blockers.push(`Standard curve for ${target} has 0 valid standard points because ${standard.invalidCount} observation(s) have invalid Cq or quantity fields.`);
    } else if (standard.points.length < minimumStandardPoints) {
      blockers.push(`Standard curve for ${target} has insufficient valid standards.`);
    } else if (curve === null) {
      blockers.push(`Standard curve for ${target} has an invalid Cq-versus-log(quantity) slope or duplicate quantities.`);
    }
  });

  return { status: blockers.length > 0 ? 'blocked' : 'ready', technicalReplicates, standardCurves, blockers, warnings, exclusions };
}
