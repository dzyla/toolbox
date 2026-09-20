import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import {
  buildFractionBands,
  constrainViewport,
  type BaselineResult,
  type SignalPoint,
  type VolumeRange,
} from '@/core/chromatography';
import type { ChromatogramImport } from '@/core/chromatography';
import {
  buildChromatogramChartModel,
  getChromatogramTraces,
  type ChartTraceSetting,
} from './chromatogram-chart-model';
import { PlotlyChromatogramPlot } from './PlotlyChromatogramPlot';

export interface TraceDisplaySetting extends Omit<ChartTraceSetting, 'axis'> {
  axis?: ChartTraceSetting['axis'];
}

export interface AcceptedPeakDisplay {
  id: string;
  startVolumeMl: number;
  endVolumeMl: number;
  selected: boolean;
  source?: 'candidate' | 'manual';
}

const DEFAULT_COLORS = ['#2563eb', '#d97706', '#16a34a', '#7c3aed', '#db2777'];

export { getChromatogramTraces as chromatogramTraces };

export function ChromatogramPlot({
  imported, rawUv, correctedUv, baseline, traceSettings, viewport, showFractions,
  selectedFractionLabels, acceptedPeaks, onTraceSettingChange, onViewportChange,
  onShowFractionsChange, onSelectedFractionLabelsChange, onUseVisibleRange,
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
  onUseVisibleRange?: (viewport: VolumeRange) => void;
}): JSX.Element {
  const [selectedPeakId, setSelectedPeakId] = useState<string | null>(null);
  const displayOffsetMl = imported.injectionVolumeMl ?? 0;
  const traces = getChromatogramTraces(imported, rawUv);
  const chartTraceSettings = traces.map((trace, index): ChartTraceSetting => {
    const setting = traceSettings.find(candidate => candidate.id === trace.id);
    return {
      id: trace.id,
      visible: setting?.visible ?? true,
      color: setting?.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
      axis: setting?.axis ?? (trace.id === 'uv280' || trace.label.toLowerCase().includes('uv') ? 'uv' : 'overlay'),
    };
  });
  const fullExtent = useMemo(() => {
    const volumes = rawUv.map(point => point.volumeMl - displayOffsetMl);
    const startVolumeMl = Math.min(...volumes);
    const endVolumeMl = Math.max(...volumes);
    return Number.isFinite(startVolumeMl) && endVolumeMl > startVolumeMl
      ? { startVolumeMl, endVolumeMl }
      : { startVolumeMl: 0, endVolumeMl: 1 };
  }, [rawUv, displayOffsetMl]);
  const chartModel = useMemo(() => buildChromatogramChartModel({
    imported,
    rawUv,
    correctedUv,
    baseline,
    traceSettings: chartTraceSettings,
    viewport,
    showFractions,
    selectedFractionLabels,
    acceptedPeaks: acceptedPeaks.map(peak => ({
      id: peak.id,
      source: peak.source ?? 'manual',
      startVolumeMl: peak.startVolumeMl,
      endVolumeMl: peak.endVolumeMl,
    })),
    selectedPeakId,
    graphWidthPx: 1000,
  }), [
    imported, rawUv, correctedUv, baseline, chartTraceSettings, viewport, showFractions,
    selectedFractionLabels, acceptedPeaks, selectedPeakId,
  ]);
  const fractionButtons = chartModel.fractionAnnotations.labels;
  const toggleFraction = (label: string) => onSelectedFractionLabelsChange(
    selectedFractionLabels.includes(label)
      ? selectedFractionLabels.filter(item => item !== label)
      : [...selectedFractionLabels, label],
  );
  const focusFractions = () => {
    const bands = buildFractionBands(imported.fractionEvents, fullExtent.endVolumeMl + displayOffsetMl)
      .filter(band => selectedFractionLabels.includes(band.label));
    if (!bands.length) return;
    onViewportChange(constrainViewport({
      startVolumeMl: Math.min(...bands.map(band => band.startVolumeMl - displayOffsetMl)),
      endVolumeMl: Math.max(...bands.map(band => band.endVolumeMl - displayOffsetMl)),
    }, fullExtent));
  };

  return <section class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-4">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
      <div>
        <p class="text-sm font-semibold">Chromatogram</p>
        <p class="text-xs text-slate-500">Zoom with the chart, then integrate a selected range.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="rounded border px-2.5 py-1.5 text-xs font-medium" onClick={() => onViewportChange(fullExtent)}>Fit run</button>
        <button type="button" class="rounded border px-2.5 py-1.5 text-xs font-medium" onClick={() => onViewportChange(fullExtent)}>Reset zoom</button>
        <button type="button" class="rounded border px-2.5 py-1.5 text-xs font-medium" onClick={() => onUseVisibleRange?.(viewport)}>Use visible range</button>
        <button type="button" class="rounded border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50" disabled={!selectedFractionLabels.length} onClick={focusFractions}>Focus selected fractions</button>
      </div>
    </div>
    {imported.injectionVolumeMl !== undefined && <p class="mt-3 text-xs font-medium text-violet-700 dark:text-violet-300">Injection at 0.00 mL (instrument volume {imported.injectionVolumeMl.toFixed(3)} mL)</p>}
    {baseline.mode === 'manual-linear' && <p class="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">Manual baseline</p>}
    {baseline.mode !== 'none' && <p class="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">Baseline-corrected UV</p>}
    <div class="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_15rem]">
      <PlotlyChromatogramPlot
        model={chartModel}
        onViewportCommit={onViewportChange}
        onFractionSelect={toggleFraction}
        onPeakSelect={setSelectedPeakId}
        baselineAnchorTarget={null}
        onBaselineAnchorPick={() => undefined}
      />
      <aside aria-label="Chromatogram inspector" class="space-y-4 border-t pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0 dark:border-slate-700">
        <section>
          <h2 class="text-sm font-semibold">Trace display</h2>
          <div class="mt-2 space-y-2">
            {traces.map((trace, index) => {
              const setting = chartTraceSettings[index]!;
              return <div class="flex items-center gap-2" key={trace.id}>
                <button type="button" aria-pressed={setting.visible} onClick={() => onTraceSettingChange(trace.id, { visible: !setting.visible })} class={setting.visible ? 'min-w-0 flex-1 rounded px-2 py-1 text-left text-xs font-semibold text-white' : 'min-w-0 flex-1 rounded border px-2 py-1 text-left text-xs'} style={setting.visible ? { backgroundColor: setting.color } : undefined}>{trace.label} ({trace.unit})</button>
                <input aria-label={`Color for ${trace.label}`} type="color" value={setting.color} onInput={event => onTraceSettingChange(trace.id, { color: (event.target as HTMLInputElement).value })} class="h-7 w-8 rounded border" />
              </div>;
            })}
          </div>
        </section>
        <section>
          <label class="flex items-center gap-2 text-xs font-medium"><input aria-label="Show fractions" type="checkbox" checked={showFractions} onChange={event => onShowFractionsChange((event.target as HTMLInputElement).checked)} /> Show fractions</label>
          {fractionButtons.length > 0 && <div class="mt-2 flex max-h-36 flex-wrap content-start gap-1 overflow-y-auto" aria-label="Visible fraction labels">
            {fractionButtons.map(fraction => <button type="button" key={fraction.id} aria-pressed={selectedFractionLabels.includes(fraction.text)} onClick={() => toggleFraction(fraction.text)} class={selectedFractionLabels.includes(fraction.text) ? 'rounded bg-violet-600 px-2 py-1 text-xs text-white' : 'rounded border px-2 py-1 text-xs'}>{fraction.text}</button>)}
          </div>}
        </section>
        <p class="text-xs text-slate-500">UV integration uses the selected baseline. Overlay traces keep their native units.</p>
      </aside>
    </div>
  </section>;
}
