export interface SignalPoint {
  volumeMl: number;
  signalAu: number;
}

export type BaselineMode = 'none' | 'endpoint' | 'rolling-minimum';

export interface BaselinePoint extends SignalPoint {
  baselineAu: number;
  correctedSignalAu: number;
}

export interface BaselineResult {
  mode: BaselineMode;
  points: BaselinePoint[];
}

export interface PeakDetectionOptions {
  minimumProminenceAu: number;
  minimumWidthMl: number;
}

export interface PeakCandidate {
  startVolumeMl: number;
  endVolumeMl: number;
  apexVolumeMl: number;
  heightAu: number;
  prominenceAu: number;
  widthMl: number;
  areaAuMl: number;
  touchesStartBoundary: boolean;
  touchesEndBoundary: boolean;
}

export interface PeakIntegration {
  startVolumeMl: number;
  endVolumeMl: number;
  areaAuMl: number;
}

export interface FractionAmountInput {
  a280?: number;
  epsilonMolar?: number;
  molecularWeightGPerMol?: number;
  pathCm?: number;
  fractionVolumeMl?: number;
}

export type FractionAmountBlocker = keyof Required<FractionAmountInput>;

export interface FractionAmountEstimate {
  status: 'derived' | 'blocked';
  blockers: FractionAmountBlocker[];
  molarConcentrationM?: number;
  concentrationMgPerMl?: number;
  amountMg?: number;
}

function assertTrace(points: SignalPoint[]): void {
  if (points.some(point => !Number.isFinite(point.volumeMl) || !Number.isFinite(point.signalAu))) {
    throw new Error('Chromatogram points must have finite volumeMl and signalAu values.');
  }
}

function orderedPoints(points: SignalPoint[]): SignalPoint[] {
  assertTrace(points);
  return [...points].sort((left, right) => left.volumeMl - right.volumeMl);
}

function interpolateSignal(left: SignalPoint, right: SignalPoint, volumeMl: number): number {
  if (left.volumeMl === right.volumeMl) return left.signalAu;
  const proportion = (volumeMl - left.volumeMl) / (right.volumeMl - left.volumeMl);
  return left.signalAu + proportion * (right.signalAu - left.signalAu);
}

function pointAt(points: SignalPoint[], volumeMl: number): SignalPoint {
  const exact = points.find(point => point.volumeMl === volumeMl);
  if (exact) return { ...exact };
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index]!;
    const left = points[index - 1]!;
    if (volumeMl > left.volumeMl && volumeMl < right.volumeMl) {
      return { volumeMl, signalAu: interpolateSignal(left, right, volumeMl) };
    }
  }
  throw new Error('Integration bounds must lie within the imported trace range.');
}

export function applyBaseline(points: SignalPoint[], mode: BaselineMode): BaselineResult {
  const ordered = orderedPoints(points);
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last) return { mode, points: [] };

  const span = last.volumeMl - first.volumeMl;
  return {
    mode,
    points: ordered.map((point, index) => {
      const rollingWindow = ordered.slice(Math.max(0, index - 2), Math.min(ordered.length, index + 3));
      const baselineAu = mode === 'endpoint' && span !== 0
        ? first.signalAu + ((point.volumeMl - first.volumeMl) / span) * (last.signalAu - first.signalAu)
        : mode === 'endpoint' ? first.signalAu
          : mode === 'rolling-minimum' ? Math.min(...rollingWindow.map(candidate => candidate.signalAu))
            : 0;
      return { ...point, baselineAu, correctedSignalAu: point.signalAu - baselineAu };
    }),
  };
}

export function integratePeak(points: SignalPoint[], startVolumeMl: number, endVolumeMl: number): PeakIntegration {
  if (!Number.isFinite(startVolumeMl) || !Number.isFinite(endVolumeMl) || endVolumeMl < startVolumeMl) {
    throw new Error('Peak integration requires finite start and end volumes in ascending order.');
  }
  const ordered = orderedPoints(points);
  if (ordered.length === 0) return { startVolumeMl, endVolumeMl, areaAuMl: 0 };
  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  if (startVolumeMl < first.volumeMl || endVolumeMl > last.volumeMl) {
    throw new Error('Integration bounds must lie within the imported trace range.');
  }
  const selected = [pointAt(ordered, startVolumeMl), ...ordered.filter(point => point.volumeMl > startVolumeMl && point.volumeMl < endVolumeMl), pointAt(ordered, endVolumeMl)];
  const areaAuMl = selected.slice(1).reduce((area, point, index) => {
    const previous = selected[index]!;
    return area + ((previous.signalAu + point.signalAu) / 2) * (point.volumeMl - previous.volumeMl);
  }, 0);
  return { startVolumeMl, endVolumeMl, areaAuMl };
}

export function detectPeakCandidates(points: SignalPoint[], options: PeakDetectionOptions): PeakCandidate[] {
  if (!Number.isFinite(options.minimumProminenceAu) || options.minimumProminenceAu < 0
    || !Number.isFinite(options.minimumWidthMl) || options.minimumWidthMl < 0) {
    throw new Error('Peak detection thresholds must be finite, non-negative values.');
  }
  const ordered = orderedPoints(points);
  if (ordered.length < 2) return [];
  const lastIndex = ordered.length - 1;
  const isApex = (index: number): boolean => {
    const signal = ordered[index]!.signalAu;
    if (index === 0) return signal > ordered[1]!.signalAu;
    if (index === lastIndex) return signal > ordered[lastIndex - 1]!.signalAu;
    return signal > ordered[index - 1]!.signalAu && signal >= ordered[index + 1]!.signalAu;
  };
  const isValley = (index: number): boolean => index > 0 && index < lastIndex
    && ordered[index]!.signalAu <= ordered[index - 1]!.signalAu
    && ordered[index]!.signalAu < ordered[index + 1]!.signalAu;
  const nearestLeftValley = (apexIndex: number): number => {
    for (let index = apexIndex - 1; index > 0; index -= 1) if (isValley(index)) return index;
    return 0;
  };
  const nearestRightValley = (apexIndex: number): number => {
    for (let index = apexIndex + 1; index < lastIndex; index += 1) if (isValley(index)) return index;
    return lastIndex;
  };

  return ordered.flatMap((apex, apexIndex) => {
    if (!isApex(apexIndex)) return [];
    const startIndex = nearestLeftValley(apexIndex);
    const endIndex = nearestRightValley(apexIndex);
    const start = ordered[startIndex]!;
    const end = ordered[endIndex]!;
    const referenceSignalAu = startIndex === apexIndex
      ? end.signalAu
      : endIndex === apexIndex ? start.signalAu : Math.max(start.signalAu, end.signalAu);
    const prominenceAu = apex.signalAu - referenceSignalAu;
    const widthMl = end.volumeMl - start.volumeMl;
    if (prominenceAu < options.minimumProminenceAu || widthMl < options.minimumWidthMl) return [];
    return [{
      startVolumeMl: start.volumeMl,
      endVolumeMl: end.volumeMl,
      apexVolumeMl: apex.volumeMl,
      heightAu: apex.signalAu,
      prominenceAu,
      widthMl,
      areaAuMl: integratePeak(ordered, start.volumeMl, end.volumeMl).areaAuMl,
      touchesStartBoundary: startIndex === 0,
      touchesEndBoundary: endIndex === lastIndex,
    }];
  });
}

export function estimateFractionAmount(input: FractionAmountInput): FractionAmountEstimate {
  const blockers = (Object.entries(input) as Array<[FractionAmountBlocker, number | undefined]>)
    .filter(([, value]) => value === undefined || !Number.isFinite(value) || value <= 0)
    .map(([field]) => field);
  const requiredFields: FractionAmountBlocker[] = ['a280', 'epsilonMolar', 'molecularWeightGPerMol', 'pathCm', 'fractionVolumeMl'];
  for (const field of requiredFields) if (!Object.hasOwn(input, field) && !blockers.includes(field)) blockers.push(field);
  if (blockers.length > 0) return { status: 'blocked', blockers, amountMg: undefined };

  const molarConcentrationM = input.a280! / (input.epsilonMolar! * input.pathCm!);
  const concentrationMgPerMl = molarConcentrationM * input.molecularWeightGPerMol!;
  return {
    status: 'derived',
    blockers: [],
    molarConcentrationM,
    concentrationMgPerMl,
    amountMg: concentrationMgPerMl * input.fractionVolumeMl!,
  };
}
