export interface SpectrumPoint {
  wavelengthNm: number;
  absorbance: number;
}

export type SpectrumColumnName = 'wavelengthNm' | 'absorbance';
export type SpectrumColumnMapping = Partial<Record<SpectrumColumnName, number>>;

export interface SpectrumImport {
  sourceHeaders: string[];
  columnMapping: SpectrumColumnMapping;
  mappedHeaders: Partial<Record<SpectrumColumnName, string>>;
  points: SpectrumPoint[];
  notices: string[];
}

export interface LogScatterFit {
  startWavelengthNm: number;
  endWavelengthNm: number;
  pointCount: number;
  slope?: number;
  intercept?: number;
  rSquared?: number;
  warnings: string[];
}

export interface ScatterCorrection {
  observedA280: number;
  predictedScatterA280?: number;
  correctedA280?: number;
  warnings: string[];
}

export interface DyeLabelingInput {
  a280?: number;
  dyeAbsorbance?: number;
  dyeEpsilon?: number;
  correctionFactor280?: number;
  proteinEpsilon?: number;
  pathCm?: number;
  /** Opt-in fit used to subtract estimated scatter before dye correction. */
  scatterFit?: LogScatterFit;
  /** Allows a caller that already rendered a correction result to reuse it. */
  scatterCorrection?: ScatterCorrection;
}

export type DyeLabelingBlocker = 'a280' | 'dyeAbsorbance' | 'dyeEpsilon'
  | 'correctionFactor280' | 'proteinEpsilon' | 'pathCm' | 'scatterCorrection' | 'proteinA280';

export interface DyeLabelingResult {
  status: 'derived' | 'blocked';
  blockers: DyeLabelingBlocker[];
  warnings: string[];
  a280AfterScatter?: number;
  proteinA280?: number;
  dyeMolarConcentrationM?: number;
  proteinMolarConcentrationM?: number;
  dol?: number;
}

const SPECTRUM_ALIASES: Record<SpectrumColumnName, readonly string[]> = {
  wavelengthNm: ['wavelength (nm)', 'wavelength', 'lambda', 'λ'],
  absorbance: ['absorbance', 'abs', 'a', 'absorbance (au)', 'absorbance (au)'],
};

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

function parseFiniteNumber(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapSpectrumColumns(headers: string[], manualMapping: SpectrumColumnMapping, notices: string[]): SpectrumColumnMapping {
  const mapping: SpectrumColumnMapping = {};
  headers.forEach((header, index) => {
    const field = (Object.keys(SPECTRUM_ALIASES) as SpectrumColumnName[])
      .find(candidate => SPECTRUM_ALIASES[candidate].includes(normalizeHeader(header)));
    if (!field) return;
    if (mapping[field] !== undefined) {
      notices.push(`Duplicate ${field} header "${header}" ignored; using "${headers[mapping[field]!]}".`);
      return;
    }
    mapping[field] = index;
  });
  for (const [field, index] of Object.entries(manualMapping) as Array<[SpectrumColumnName, number | undefined]>) {
    if (index === undefined) continue;
    if (!Number.isInteger(index) || index < 0 || index >= headers.length) {
      notices.push(`Manual ${field} column index ${index} is outside the input headers and was ignored.`);
      continue;
    }
    mapping[field] = index;
  }
  return mapping;
}

/** Parses a two-column or multi-column delimited UV-Vis export. */
export function parseSpectrum(text: string, mapping: SpectrumColumnMapping = {}): SpectrumImport {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) throw new Error('Spectrum input must contain a header row.');

  const delimiter = selectDelimiter(lines[0]!);
  const sourceHeaders = parseDelimitedLine(lines[0]!, delimiter);
  const notices: string[] = [];
  const columnMapping = mapSpectrumColumns(sourceHeaders, mapping, notices);
  const mappedHeaders = Object.fromEntries(Object.entries(columnMapping)
    .map(([field, index]) => [field, sourceHeaders[index!]])) as SpectrumImport['mappedHeaders'];
  const points: SpectrumPoint[] = [];
  const seenWavelengths = new Set<number>();

  if (columnMapping.wavelengthNm === undefined || columnMapping.absorbance === undefined) {
    notices.push('Both wavelength and absorbance columns must be mapped; no spectrum points were imported.');
    return { sourceHeaders, columnMapping, mappedHeaders, points, notices };
  }

  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const row = parseDelimitedLine(line, delimiter);
    const wavelengthNm = parseFiniteNumber(row[columnMapping.wavelengthNm!]);
    const absorbance = parseFiniteNumber(row[columnMapping.absorbance!]);
    if (wavelengthNm === undefined || absorbance === undefined) {
      notices.push(`Row ${rowNumber}: invalid wavelength or absorbance value skipped.`);
      return;
    }
    if (seenWavelengths.has(wavelengthNm)) {
      notices.push(`Row ${rowNumber}: duplicate wavelength ${wavelengthNm} skipped.`);
      return;
    }
    seenWavelengths.add(wavelengthNm);
    points.push({ wavelengthNm, absorbance });
  });
  return { sourceHeaders, columnMapping, mappedHeaders, points, notices };
}

/** Fits positive absorbance measurements in log10 wavelength/log10 absorbance space. */
export function fitLogScatter(points: SpectrumPoint[], startWavelengthNm = 300, endWavelengthNm = 340): LogScatterFit {
  if (!Number.isFinite(startWavelengthNm) || !Number.isFinite(endWavelengthNm) || startWavelengthNm > endWavelengthNm) {
    throw new Error('Scatter fit bounds must be finite and ascending.');
  }
  const warnings: string[] = [];
  const inRange = points.filter(point => Number.isFinite(point.wavelengthNm)
    && point.wavelengthNm >= startWavelengthNm && point.wavelengthNm <= endWavelengthNm);
  const valid = inRange.filter(point => point.wavelengthNm > 0 && Number.isFinite(point.absorbance) && point.absorbance > 0);
  const excludedCount = inRange.length - valid.length;
  if (excludedCount > 0) warnings.push(`Excluded ${excludedCount} nonpositive or nonfinite point(s) from the scatter fit.`);
  if (valid.length < 2) {
    warnings.push('Two or more positive finite points are required for a scatter fit.');
    return { startWavelengthNm, endWavelengthNm, pointCount: valid.length, warnings };
  }

  const xValues = valid.map(point => Math.log10(point.wavelengthNm));
  const yValues = valid.map(point => Math.log10(point.absorbance));
  const meanX = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const meanY = yValues.reduce((sum, value) => sum + value, 0) / yValues.length;
  const xVariance = xValues.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (xVariance === 0) {
    warnings.push('Scatter fit is undefined because all selected wavelengths are identical.');
    return { startWavelengthNm, endWavelengthNm, pointCount: valid.length, warnings };
  }
  const covariance = xValues.reduce((sum, value, index) => sum + (value - meanX) * (yValues[index]! - meanY), 0);
  const slope = covariance / xVariance;
  const intercept = meanY - slope * meanX;
  const residualSum = yValues.reduce((sum, value, index) => sum + (value - (slope * xValues[index]! + intercept)) ** 2, 0);
  const totalSum = yValues.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  const rSquared = totalSum === 0 ? undefined : 1 - residualSum / totalSum;
  if (rSquared === undefined) warnings.push('Scatter fit R² is undefined for constant absorbance values.');
  else if (rSquared < 0.9) warnings.push('Scatter fit has poor R² (< 0.90); select a non-absorbing wavelength range.');

  return { startWavelengthNm, endWavelengthNm, pointCount: valid.length, slope, intercept, rSquared, warnings };
}

/** Extrapolates a log-scatter fit to 280 nm without changing the observed value. */
export function correctA280ForScatter(observedA280: number, fit: LogScatterFit): ScatterCorrection {
  const warnings = [...fit.warnings];
  if (!Number.isFinite(observedA280) || observedA280 <= 0) {
    warnings.push('Observed A280 must be a positive finite value for scatter correction.');
    return { observedA280, warnings };
  }
  if (fit.slope === undefined || fit.intercept === undefined) {
    warnings.push('Scatter correction is unavailable because the fit is undefined.');
    return { observedA280, warnings };
  }
  const predictedScatterA280 = 10 ** (fit.slope * Math.log10(280) + fit.intercept);
  const correctedA280 = observedA280 - predictedScatterA280;
  if (correctedA280 <= 0) warnings.push('Scatter-corrected protein A280 is nonpositive.');
  return { observedA280, predictedScatterA280, correctedA280, warnings };
}

function validPositive(value: number | undefined): boolean {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/** Calculates dye-to-protein labeling ratio using manufacturer-supplied coefficients. */
export function calculateDyeLabeling(input: DyeLabelingInput): DyeLabelingResult {
  const blockers: DyeLabelingBlocker[] = [];
  const warnings: string[] = [];
  const positiveFields: Array<Exclude<DyeLabelingBlocker, 'correctionFactor280' | 'scatterCorrection' | 'proteinA280'>> = [
    'a280', 'dyeAbsorbance', 'dyeEpsilon', 'proteinEpsilon', 'pathCm',
  ];
  positiveFields.forEach(field => {
    if (!validPositive(input[field])) blockers.push(field);
  });
  if (input.correctionFactor280 === undefined || !Number.isFinite(input.correctionFactor280) || input.correctionFactor280 < 0) {
    blockers.push('correctionFactor280');
  }

  let a280AfterScatter = input.a280;
  if (input.scatterCorrection) {
    warnings.push(...input.scatterCorrection.warnings);
    a280AfterScatter = input.scatterCorrection.correctedA280;
    if (a280AfterScatter === undefined) blockers.push('scatterCorrection');
  } else if (input.scatterFit) {
    const correction = correctA280ForScatter(input.a280 ?? Number.NaN, input.scatterFit);
    warnings.push(...correction.warnings);
    a280AfterScatter = correction.correctedA280;
    if (a280AfterScatter === undefined) blockers.push('scatterCorrection');
  }

  const proteinA280 = a280AfterScatter === undefined || input.correctionFactor280 === undefined || input.dyeAbsorbance === undefined
    ? undefined
    : a280AfterScatter - input.correctionFactor280 * input.dyeAbsorbance;
  if (proteinA280 === undefined || !Number.isFinite(proteinA280) || proteinA280 <= 0) {
    blockers.push('proteinA280');
    warnings.push('Protein A280 is nonpositive after scatter and dye correction.');
  }
  if (blockers.length > 0) return { status: 'blocked', blockers, warnings, a280AfterScatter, proteinA280 };

  const dyeMolarConcentrationM = input.dyeAbsorbance! / (input.dyeEpsilon! * input.pathCm!);
  const proteinMolarConcentrationM = proteinA280! / (input.proteinEpsilon! * input.pathCm!);
  return {
    status: 'derived',
    blockers: [],
    warnings,
    a280AfterScatter,
    proteinA280,
    dyeMolarConcentrationM,
    proteinMolarConcentrationM,
    dol: dyeMolarConcentrationM / proteinMolarConcentrationM,
  };
}
