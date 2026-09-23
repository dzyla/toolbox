import {
  buildFractionBands,
  type ChromatogramImport,
  type VolumeRange,
} from '@/core/chromatography';

export interface ChromatogramRun {
  id: string;
  name: string;
  imported: ChromatogramImport;
  visible: boolean;
}

export interface FractionPool {
  id: string;
  name: string;
  runId: string;
  labels: string[];
  startVolumeMl: number;
  endVolumeMl: number;
}

export type AxisRangeValidation =
  | { ok: true; range: [number, number] }
  | { ok: false; error: string };

function traceEndVolumeMl(imported: ChromatogramImport): number | undefined {
  const volumes = imported.points.flatMap(point => point.volumeMl === undefined ? [] : [point.volumeMl])
    .filter(Number.isFinite);
  const eventEnd = Math.max(...imported.fractionEvents.map(event => event.volumeMl).filter(Number.isFinite));
  const traceEnd = Math.max(...volumes);
  const end = Math.max(eventEnd, traceEnd);
  return Number.isFinite(end) ? end : undefined;
}

function fractionBands(imported: ChromatogramImport) {
  const end = traceEndVolumeMl(imported);
  return end === undefined ? [] : buildFractionBands(imported.fractionEvents, end);
}

export function validateAxisRange(min: string, max: string): AxisRangeValidation {
  const lower = Number(min);
  const upper = Number(max);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return { ok: false, error: 'Y limits must be finite numbers.' };
  }
  if (upper <= lower) return { ok: false, error: 'Y maximum must be greater than Y minimum.' };
  return { ok: true, range: [lower, upper] };
}

export function validateViewportRange(min: string, max: string): AxisRangeValidation {
  const lower = Number(min);
  const upper = Number(max);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return { ok: false, error: 'X limits must be finite numbers.' };
  }
  if (upper <= lower) return { ok: false, error: 'X maximum must be greater than X minimum.' };
  return { ok: true, range: [lower, upper] };
}

export function fractionLabelsIntersectingRange(imported: ChromatogramImport, range: VolumeRange): string[] {
  const offset = imported.injectionVolumeMl ?? 0;
  return fractionBands(imported)
    .filter(band => band.endVolumeMl - offset >= range.startVolumeMl && band.startVolumeMl - offset <= range.endVolumeMl)
    .map(band => band.label);
}

export function createFractionPool(input: {
  id: string;
  name: string;
  runId: string;
  imported: ChromatogramImport;
  labels: string[];
}): FractionPool | undefined {
  const labels = [...new Set(input.labels)];
  const selected = fractionBands(input.imported).filter(band => labels.includes(band.label));
  if (!selected.length) return undefined;
  return {
    id: input.id,
    name: input.name.trim() || 'Fraction pool',
    runId: input.runId,
    labels: selected.map(band => band.label),
    startVolumeMl: selected[0]!.startVolumeMl,
    endVolumeMl: selected.at(-1)!.endVolumeMl,
  };
}
