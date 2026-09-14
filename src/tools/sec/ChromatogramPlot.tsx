import type { JSX } from 'preact';
import { useMemo, useRef } from 'preact/hooks';
import type { BaselineResult, SignalPoint, VolumeRange } from '@/core/chromatography';
import { buildFractionBands, constrainViewport } from '@/core/chromatography';
import type { ChromatogramImport } from '@/core/chromatography';

export interface TraceDisplaySetting {
  id: string;
  visible: boolean;
  color: string;
}

export interface AcceptedPeakDisplay {
  id: string;
  startVolumeMl: number;
  endVolumeMl: number;
  selected: boolean;
}

interface PlotTrace {
  id: string;
  label: string;
  unit: string;
  points: Array<{ volumeMl: number; value: number }>;
}

export function chromatogramTraces(imported: ChromatogramImport, rawUv: SignalPoint[]): PlotTrace[] {
  if (imported.traces?.length) return imported.traces;
  return [{ id: 'uv280', label: 'UV', unit: 'mAU', points: rawUv.map(point => ({ volumeMl: point.volumeMl, value: point.signalAu * 1000 })) }];
}

const DEFAULT_COLORS = ['#2563eb', '#d97706', '#16a34a', '#7c3aed', '#db2777'];

function extentFor(points: SignalPoint[], offset: number): VolumeRange {
  const volumes = points.map(point => point.volumeMl - offset);
  const startVolumeMl = Math.min(...volumes);
  const endVolumeMl = Math.max(...volumes);
  return Number.isFinite(startVolumeMl) && endVolumeMl > startVolumeMl
    ? { startVolumeMl, endVolumeMl }
    : { startVolumeMl: 0, endVolumeMl: 1 };
}

function linePath(points: Array<{ volumeMl: number; value: number }>, offset: number, range: VolumeRange, x: (value: number) => number, y: (value: number) => number): string {
  const visible = points.filter(point => point.volumeMl - offset >= range.startVolumeMl && point.volumeMl - offset <= range.endVolumeMl);
  if (!visible.length) return '';
  const values = visible.map(point => point.value);
  const low = Math.min(...values);
  const span = Math.max(Math.max(...values) - low, Number.EPSILON);
  return visible.map((point, index) => `${index ? 'L' : 'M'} ${x(point.volumeMl - offset).toFixed(2)} ${y((point.value - low) / span).toFixed(2)}`).join(' ');
}

export function ChromatogramPlot({
  imported, rawUv, correctedUv, baseline, traceSettings, viewport, showFractions,
  selectedFractionLabels, acceptedPeaks, onTraceSettingChange, onViewportChange,
  onShowFractionsChange, onSelectedFractionLabelsChange,
}: {
  imported: ChromatogramImport;
  rawUv: SignalPoint[];
  correctedUv: SignalPoint[];
  baseline: BaselineResult;
  traceSettings: TraceDisplaySetting[];
  viewport: VolumeRange;
  showFractions: boolean;
  selectedFractionLabels: string[];
  acceptedPeaks: AcceptedPeakDisplay[];
  onTraceSettingChange: (id: string, patch: Partial<TraceDisplaySetting>) => void;
  onViewportChange: (viewport: VolumeRange) => void;
  onShowFractionsChange: (shown: boolean) => void;
  onSelectedFractionLabelsChange: (labels: string[]) => void;
}): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStart = useRef<{ clientX: number; viewport: VolumeRange }>();
  const offset = imported.injectionVolumeMl ?? 0;
  const traces = chromatogramTraces(imported, rawUv);
  const fullExtent = extentFor(rawUv, offset);
  const bands = useMemo(() => buildFractionBands(imported.fractionEvents, fullExtent.endVolumeMl + offset)
    .map(band => ({ ...band, startVolumeMl: band.startVolumeMl - offset, endVolumeMl: band.endVolumeMl - offset })), [imported.fractionEvents, fullExtent.endVolumeMl, offset]);
  const width = 1000, height = 430, left = 58, right = 20, top = 44, bottom = 62;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (volumeMl: number) => left + (volumeMl - viewport.startVolumeMl) / (viewport.endVolumeMl - viewport.startVolumeMl) * plotWidth;
  const y = (normalized: number) => top + (1 - normalized) * plotHeight;
  const toggleFraction = (label: string) => onSelectedFractionLabelsChange(
    selectedFractionLabels.includes(label) ? selectedFractionLabels.filter(item => item !== label) : [...selectedFractionLabels, label],
  );
  const zoomAt = (clientX: number, direction: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const pivot = viewport.startVolumeMl + ratio * (viewport.endVolumeMl - viewport.startVolumeMl);
    const scale = direction > 0 ? 0.75 : 1.35;
    onViewportChange(constrainViewport({
      startVolumeMl: pivot - (pivot - viewport.startVolumeMl) * scale,
      endVolumeMl: pivot + (viewport.endVolumeMl - pivot) * scale,
    }, fullExtent));
  };
  const focusFractions = () => {
    const selected = bands.filter(band => selectedFractionLabels.includes(band.label));
    if (!selected.length) return;
    onViewportChange(constrainViewport({
      startVolumeMl: Math.min(...selected.map(band => band.startVolumeMl)),
      endVolumeMl: Math.max(...selected.map(band => band.endVolumeMl)),
    }, fullExtent));
  };

  return <section class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <strong class="text-sm">Trace viewer</strong>
      <span class="text-xs text-slate-500">Each active trace is independently scaled; UV integration remains in AU.</span>
      <button type="button" class="rounded border px-2 py-1 text-xs" onClick={() => onViewportChange(fullExtent)}>Fit run</button>
      <button type="button" class="rounded border px-2 py-1 text-xs" onClick={() => onViewportChange(fullExtent)}>Reset zoom</button>
      <button type="button" class="rounded border px-2 py-1 text-xs disabled:opacity-50" disabled={!selectedFractionLabels.length} onClick={focusFractions}>Focus selected fractions</button>
    </div>
    <div class="mb-3 flex flex-wrap gap-3" aria-label="Trace controls">
      {traces.map((trace, index) => {
        const setting = traceSettings.find(item => item.id === trace.id) ?? { id: trace.id, visible: true, color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]! };
        return <div class="flex items-center gap-1" key={trace.id}>
          <button type="button" aria-pressed={setting.visible} onClick={() => onTraceSettingChange(trace.id, { visible: !setting.visible })} class={setting.visible ? 'rounded-full px-2 py-1 text-xs font-semibold text-white' : 'rounded-full border px-2 py-1 text-xs'} style={setting.visible ? { backgroundColor: setting.color } : undefined}>{trace.label} ({trace.unit})</button>
          <label class="text-xs text-slate-500">Color for {trace.label}<input aria-label={`Color for ${trace.label}`} type="color" value={setting.color} onInput={event => onTraceSettingChange(trace.id, { color: (event.target as HTMLInputElement).value })} class="ml-1 h-7 w-8 align-middle" /></label>
        </div>;
      })}
      <label class="flex items-center gap-1 text-xs"><input aria-label="Show fraction bands" type="checkbox" checked={showFractions} onChange={event => onShowFractionsChange((event.target as HTMLInputElement).checked)} /> Show fraction bands</label>
      {baseline.mode === 'manual-linear' && <span class="text-xs font-medium text-slate-600 dark:text-slate-300">Manual baseline</span>}
      {baseline.mode !== 'none' && <span class="text-xs font-medium text-teal-700 dark:text-teal-300">Baseline-corrected UV</span>}
    </div>
    {imported.injectionVolumeMl !== undefined && <p class="mb-2 text-xs font-medium text-violet-700 dark:text-violet-300">Injection at 0.00 mL (instrument volume {imported.injectionVolumeMl.toFixed(3)} mL)</p>}
    {bands.length > 0 && <div class="mb-2 flex max-h-20 flex-wrap gap-1 overflow-y-auto" aria-label="Fraction selections">{bands.map(band => <button type="button" key={`${band.label}-${band.startVolumeMl}`} aria-pressed={selectedFractionLabels.includes(band.label)} onClick={() => toggleFraction(band.label)} class={selectedFractionLabels.includes(band.label) ? 'rounded bg-violet-600 px-2 py-1 text-xs text-white' : 'rounded border px-2 py-1 text-xs'}>{band.label}</button>)}</div>}
    <svg ref={svgRef} aria-label="Chromatogram analysis plot" viewBox={`0 0 ${width} ${height}`} class="w-full touch-none select-none rounded border bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-200" onWheel={event => { event.preventDefault(); zoomAt(event.clientX, event.deltaY); }} onPointerDown={event => { dragStart.current = { clientX: event.clientX, viewport }; (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId); }} onPointerMove={event => { const start = dragStart.current; const rect = svgRef.current?.getBoundingClientRect(); if (!start || !rect) return; const shift = (event.clientX - start.clientX) / rect.width * (start.viewport.endVolumeMl - start.viewport.startVolumeMl); onViewportChange(constrainViewport({ startVolumeMl: start.viewport.startVolumeMl - shift, endVolumeMl: start.viewport.endVolumeMl - shift }, fullExtent)); }} onPointerUp={() => { dragStart.current = undefined; }}>
      <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="none" stroke="currentColor" stroke-opacity="0.4" />
      {showFractions && bands.filter(band => band.endVolumeMl >= viewport.startVolumeMl && band.startVolumeMl <= viewport.endVolumeMl).map((band, index) => <g key={`${band.label}-${band.startVolumeMl}`}><rect x={x(Math.max(band.startVolumeMl, viewport.startVolumeMl))} y={top} width={Math.max(1, x(Math.min(band.endVolumeMl, viewport.endVolumeMl)) - x(Math.max(band.startVolumeMl, viewport.startVolumeMl)))} height={plotHeight} fill={index % 2 ? '#a78bfa' : '#c4b5fd'} opacity="0.16" /><text x={x(Math.max(band.startVolumeMl, viewport.startVolumeMl)) + 3} y={top + 13} font-size="11" fill="currentColor">{band.label}</text></g>)}
      {imported.injectionVolumeMl !== undefined && 0 >= viewport.startVolumeMl && 0 <= viewport.endVolumeMl && <g><line x1={x(0)} x2={x(0)} y1={top} y2={top + plotHeight} stroke="#7c3aed" stroke-width="2" stroke-dasharray="6 4" /><text x={x(0) + 4} y={top + plotHeight - 6} font-size="11" fill="#7c3aed">Injection</text></g>}
      {acceptedPeaks.map(peak => <rect key={peak.id} x={x(Math.max(viewport.startVolumeMl, peak.startVolumeMl - offset))} y={top} width={Math.max(1, x(Math.min(viewport.endVolumeMl, peak.endVolumeMl - offset)) - x(Math.max(viewport.startVolumeMl, peak.startVolumeMl - offset)))} height={plotHeight} fill="#0ea5e9" opacity={peak.selected ? '0.25' : '0.14'} />)}
      {traces.map((trace, index) => {
        const setting = traceSettings.find(item => item.id === trace.id) ?? { id: trace.id, visible: true, color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]! };
        return setting.visible && <path key={trace.id} d={linePath(trace.points, offset, viewport, x, y)} fill="none" stroke={setting.color} stroke-width="2.5" />;
      })}
      {baseline.mode !== 'none' && <path d={linePath(correctedUv.map(point => ({ volumeMl: point.volumeMl, value: point.signalAu })), offset, viewport, x, y)} fill="none" stroke="#0f766e" stroke-width="2" stroke-dasharray="6 4" />}
      {baseline.mode !== 'none' && <path d={linePath(baseline.points.map(point => ({ volumeMl: point.volumeMl, value: point.baselineAu })), offset, viewport, x, y)} fill="none" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 3" />}
      <text x={left} y={height - 24} font-size="12" fill="currentColor">Elution volume relative to injection (mL)</text>
      <text x={left} y={top - 16} font-size="12" fill="currentColor">Relative signal per trace</text>
    </svg>
  </section>;
}
