import {
  buildFractionBands,
  type BaselineResult,
  type ChromatogramImport,
  type FractionEvent,
  type SignalPoint,
  type VolumeRange,
} from '@/core/chromatography';

export interface ChartTraceSetting {
  id: string;
  visible: boolean;
  color: string;
  axis: 'uv' | 'overlay';
}

export interface ChartTrace {
  id: string;
  label: string;
  unit: string;
  x: number[];
  y: number[];
  color: string;
  axis: 'uv' | 'overlay';
  visible: boolean;
}

export interface ChartLine {
  x: number[];
  y: number[];
  color: string;
  dash: 'solid' | 'dash';
}

export interface AcceptedPeakChartInput {
  id: string;
  source: 'candidate' | 'manual';
  startVolumeMl: number;
  endVolumeMl: number;
}

export interface FractionAnnotation {
  id: string;
  label: string;
  startVolumeMl: number;
  endVolumeMl: number;
  selected: boolean;
}

export interface FractionLabel {
  id: string;
  text: string;
  volumeMl: number;
}

export interface PeakOverlay {
  id: string;
  x: number[];
  correctedY: number[];
  baselineY: number[];
  selected: boolean;
}

export interface ChromatogramChartModel {
  extent: VolumeRange;
  viewport: VolumeRange;
  traces: ChartTrace[];
  fractionAnnotations: {
    bands: FractionAnnotation[];
    labels: FractionLabel[];
  };
  injectionDisplayVolumeMl?: number;
  baseline: ChartLine | undefined;
  peakOverlays: PeakOverlay[];
}

export interface BuildChromatogramChartModelInput {
  imported: ChromatogramImport;
  rawUv: SignalPoint[];
  correctedUv: SignalPoint[];
  baseline: BaselineResult;
  traceSettings: ChartTraceSetting[];
  viewport: VolumeRange;
  showFractions: boolean;
  selectedFractionLabels: string[];
  acceptedPeaks: AcceptedPeakChartInput[];
  selectedPeakId: string | null;
  graphWidthPx: number;
}

interface FractionAnnotationInput {
  events: FractionEvent[];
  endInstrumentVolumeMl: number;
  displayOffsetMl: number;
  viewport: VolumeRange;
  widthPx: number;
  selectedLabels: string[];
  visible: boolean;
}

interface PeakOverlayInput {
  correctedUv: SignalPoint[];
  baseline: BaselineResult;
  acceptedPeaks: AcceptedPeakChartInput[];
  displayOffsetMl: number;
  selectedPeakId: string | null;
}

interface NativeTrace {
  id: string;
  label: string;
  unit: string;
  points: Array<{ volumeMl: number; value: number }>;
}

const DEFAULT_COLORS = ['#2563eb', '#d97706', '#16a34a', '#7c3aed', '#db2777'];
const MIN_FRACTION_LABEL_WIDTH_PX = 64;
const MAX_RENDERED_FRACTION_BANDS = 500;

export function getDisplayExtent(points: SignalPoint[], displayOffsetMl: number): VolumeRange {
  const volumes = points
    .map(point => point.volumeMl - displayOffsetMl)
    .filter(Number.isFinite);
  const startVolumeMl = Math.min(...volumes);
  const endVolumeMl = Math.max(...volumes);
  return Number.isFinite(startVolumeMl) && endVolumeMl > startVolumeMl
    ? { startVolumeMl, endVolumeMl }
    : { startVolumeMl: 0, endVolumeMl: 1 };
}

export function getChromatogramTraces(imported: ChromatogramImport, rawUv: SignalPoint[]): NativeTrace[] {
  if (imported.traces?.length) return imported.traces;
  return [{
    id: 'uv280',
    label: 'UV',
    unit: 'mAU',
    points: rawUv.map(point => ({ volumeMl: point.volumeMl, value: point.signalAu * 1000 })),
  }];
}

export function buildFractionAnnotations(input: FractionAnnotationInput): ChromatogramChartModel['fractionAnnotations'] {
  if (!input.visible) return { bands: [], labels: [] };

  const visibleBands = buildFractionBands(input.events, input.endInstrumentVolumeMl)
    .map((band, index) => ({
      id: `${band.label}-${index}-${band.startVolumeMl}`,
      label: band.label,
      startVolumeMl: band.startVolumeMl - input.displayOffsetMl,
      endVolumeMl: band.endVolumeMl - input.displayOffsetMl,
      selected: input.selectedLabels.includes(band.label),
    }))
    .filter(band => band.endVolumeMl >= input.viewport.startVolumeMl && band.startVolumeMl <= input.viewport.endVolumeMl);
  if (!visibleBands.length) return { bands: [], labels: [] };

  const bandStride = Math.max(1, Math.ceil(visibleBands.length / (MAX_RENDERED_FRACTION_BANDS - 2)));
  const renderedBands = visibleBands.filter((band, index) =>
    index % bandStride === 0 || index === visibleBands.length - 1 || band.selected);
  const labelStride = Math.max(1, Math.ceil(renderedBands.length * MIN_FRACTION_LABEL_WIDTH_PX / Math.max(1, input.widthPx)));
  const labelledIndexes = new Set<number>([0, renderedBands.length - 1]);
  renderedBands.forEach((band, index) => {
    if (index % labelStride === 0 || band.selected) labelledIndexes.add(index);
  });
  const labels = [...labelledIndexes]
    .sort((left, right) => left - right)
    .map(index => {
      const band = renderedBands[index]!;
      return {
        id: band.id,
        text: band.label,
        volumeMl: Math.max(band.startVolumeMl, input.viewport.startVolumeMl),
      };
    });
  return { bands: renderedBands, labels };
}

function valueAt(points: SignalPoint[], volumeMl: number): number | undefined {
  const ordered = [...points].sort((left, right) => left.volumeMl - right.volumeMl);
  const exact = ordered.find(point => point.volumeMl === volumeMl);
  if (exact) return exact.signalAu;
  for (let index = 1; index < ordered.length; index += 1) {
    const left = ordered[index - 1]!;
    const right = ordered[index]!;
    if (volumeMl > left.volumeMl && volumeMl < right.volumeMl) {
      const proportion = (volumeMl - left.volumeMl) / (right.volumeMl - left.volumeMl);
      return left.signalAu + (right.signalAu - left.signalAu) * proportion;
    }
  }
  return undefined;
}

function pointsWithinRange(points: SignalPoint[], startVolumeMl: number, endVolumeMl: number): SignalPoint[] {
  const ordered = [...points].sort((left, right) => left.volumeMl - right.volumeMl);
  const boundaries = [startVolumeMl, endVolumeMl]
    .flatMap(volumeMl => {
      const signalAu = valueAt(ordered, volumeMl);
      return signalAu === undefined ? [] : [{ volumeMl, signalAu }];
    });
  return [...boundaries, ...ordered.filter(point => point.volumeMl > startVolumeMl && point.volumeMl < endVolumeMl)]
    .sort((left, right) => left.volumeMl - right.volumeMl);
}

export function buildPeakOverlays(input: PeakOverlayInput): PeakOverlay[] {
  const baselinePoints = input.baseline.points.map(point => ({
    volumeMl: point.volumeMl,
    signalAu: point.baselineAu,
  }));
  return input.acceptedPeaks.flatMap(peak => {
    if (!(peak.endVolumeMl > peak.startVolumeMl)) return [];
    const corrected = pointsWithinRange(input.correctedUv, peak.startVolumeMl, peak.endVolumeMl);
    const baseline = pointsWithinRange(baselinePoints, peak.startVolumeMl, peak.endVolumeMl);
    if (corrected.length < 2 || baseline.length !== corrected.length) return [];
    return [{
      id: peak.id,
      x: corrected.map(point => point.volumeMl - input.displayOffsetMl),
      correctedY: corrected.map(point => point.signalAu * 1000),
      baselineY: baseline.map(point => point.signalAu * 1000),
      selected: peak.id === input.selectedPeakId,
    }];
  });
}

export function buildChromatogramChartModel(input: BuildChromatogramChartModelInput): ChromatogramChartModel {
  const displayOffsetMl = input.imported.injectionVolumeMl ?? 0;
  const extent = getDisplayExtent(input.rawUv, displayOffsetMl);
  const traces = getChromatogramTraces(input.imported, input.rawUv).map((trace, index) => {
    const setting = input.traceSettings.find(candidate => candidate.id === trace.id) ?? {
      id: trace.id,
      visible: true,
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
      axis: trace.id === 'uv280' || trace.label.toLowerCase().includes('uv') ? 'uv' as const : 'overlay' as const,
    };
    return {
      id: trace.id,
      label: trace.label,
      unit: trace.unit,
      x: trace.points.map(point => point.volumeMl - displayOffsetMl),
      y: trace.points.map(point => point.value),
      color: setting.color,
      axis: setting.axis,
      visible: setting.visible,
    };
  });
  const baseline = input.baseline.mode === 'none' ? undefined : {
    x: input.baseline.points.map(point => point.volumeMl - displayOffsetMl),
    y: input.baseline.points.map(point => point.baselineAu * 1000),
    color: '#334155',
    dash: 'dash' as const,
  };

  return {
    extent,
    viewport: input.viewport,
    traces,
    fractionAnnotations: buildFractionAnnotations({
      events: input.imported.fractionEvents,
      endInstrumentVolumeMl: extent.endVolumeMl + displayOffsetMl,
      displayOffsetMl,
      viewport: input.viewport,
      widthPx: input.graphWidthPx,
      selectedLabels: input.selectedFractionLabels,
      visible: input.showFractions,
    }),
    injectionDisplayVolumeMl: input.imported.injectionVolumeMl === undefined ? undefined : 0,
    baseline,
    peakOverlays: buildPeakOverlays({
      correctedUv: input.correctedUv,
      baseline: input.baseline,
      acceptedPeaks: input.acceptedPeaks,
      displayOffsetMl,
      selectedPeakId: input.selectedPeakId,
    }),
  };
}
