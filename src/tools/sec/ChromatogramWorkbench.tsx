import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  buildFractionBands,
  constrainViewport,
  type BaselineResult,
  type ChromatogramImport,
  type SignalPoint,
  type VolumeRange,
} from '@/core/chromatography';
import { validateAxisRange } from './chromatogram-workspace';
import {
  buildChromatogramChartModel,
  getChromatogramTraces,
  getDisplayExtent,
  type AcceptedPeakChartInput,
  type ChartTraceSetting,
} from './chromatogram-chart-model';
import { PlotlyChromatogramPlot, type ChartInteractionMode } from './PlotlyChromatogramPlot';

const COLORS = ['#2563eb', '#d97706', '#16a34a', '#7c3aed', '#db2777'];
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';

export interface WorkbenchRun {
  id: string;
  name: string;
  visible: boolean;
}

export interface ChromatogramWorkbenchProps {
  imported: ChromatogramImport;
  rawUv: SignalPoint[];
  correctedUv: SignalPoint[];
  baseline: BaselineResult;
  traceSettings: ChartTraceSetting[];
  viewport: VolumeRange;
  yRange?: [number, number];
  showFractions: boolean;
  selectedFractionLabels: string[];
  acceptedPeaks: AcceptedPeakChartInput[];
  runs: WorkbenchRun[];
  activeRunId: string;
  pools?: Array<{ id: string; name: string; labels: string[] }>;
  interactionMode?: ChartInteractionMode;
  onTraceSettingChange: (id: string, patch: Partial<ChartTraceSetting>) => void;
  onViewportChange: (range: VolumeRange) => void;
  onUseVisibleRange?: (range: VolumeRange) => void;
  onShowFractionsChange: (shown: boolean) => void;
  onSelectedFractionLabelsChange: (labels: string[]) => void;
  onYAxisApply: (range: [number, number]) => void;
  onAutoscaleY: () => void;
  onInteractionModeChange: (mode: ChartInteractionMode) => void;
  onRangeSelect: (range: VolumeRange, mode: Exclude<ChartInteractionMode, 'inspect'>) => void;
  onActiveRunChange: (runId: string) => void;
  onRunVisibilityChange: (runId: string, visible: boolean) => void;
  onCreatePool: (name: string) => void;
}

export function ChromatogramWorkbench(props: ChromatogramWorkbenchProps) {
  const [selectedPeakId, setSelectedPeakId] = useState<string | null>(null);
  const [minimum, setMinimum] = useState(props.yRange?.[0]?.toString() ?? '');
  const [maximum, setMaximum] = useState(props.yRange?.[1]?.toString() ?? '');
  const [axisError, setAxisError] = useState<string | null>(null);
  const [poolName, setPoolName] = useState('');
  const displayOffset = props.imported.injectionVolumeMl ?? 0;
  const extent = useMemo(() => getDisplayExtent(props.rawUv, displayOffset), [props.rawUv, displayOffset]);
  const traces = useMemo(() => getChromatogramTraces(props.imported, props.rawUv), [props.imported, props.rawUv]);
  const settings = useMemo(() => traces.map((trace, index) => props.traceSettings.find(item => item.id === trace.id) ?? {
    id: trace.id,
    visible: true,
    color: COLORS[index % COLORS.length]!,
    axis: trace.id === 'uv280' || trace.label.toLowerCase().includes('uv') ? 'uv' as const : 'overlay' as const,
  }), [traces, props.traceSettings]);
  const model = useMemo(() => ({
    ...buildChromatogramChartModel({
      imported: props.imported,
      rawUv: props.rawUv,
      correctedUv: props.correctedUv,
      baseline: props.baseline,
      traceSettings: settings,
      viewport: props.viewport,
      showFractions: props.showFractions,
      selectedFractionLabels: props.selectedFractionLabels,
      acceptedPeaks: props.acceptedPeaks,
      selectedPeakId,
      graphWidthPx: 1000,
    }),
    yRange: props.yRange,
  }), [props.imported, props.rawUv, props.correctedUv, props.baseline, settings, props.viewport, props.showFractions, props.selectedFractionLabels, props.acceptedPeaks, props.yRange, selectedPeakId]);

  useEffect(() => {
    setMinimum(props.yRange?.[0]?.toString() ?? '');
    setMaximum(props.yRange?.[1]?.toString() ?? '');
  }, [props.yRange]);

  const toggleFraction = (label: string) => props.onSelectedFractionLabelsChange(
    props.selectedFractionLabels.includes(label)
      ? props.selectedFractionLabels.filter(item => item !== label)
      : [...props.selectedFractionLabels, label],
  );
  const applyAxis = () => {
    const result = validateAxisRange(minimum, maximum);
    if (!result.ok) {
      setAxisError(result.error);
      return;
    }
    setAxisError(null);
    props.onYAxisApply(result.range);
  };
  const focusFractions = () => {
    const bands = buildFractionBands(props.imported.fractionEvents, extent.endVolumeMl + displayOffset)
      .filter(band => props.selectedFractionLabels.includes(band.label));
    if (!bands.length) return;
    props.onViewportChange(constrainViewport({
      startVolumeMl: Math.min(...bands.map(band => band.startVolumeMl - displayOffset)),
      endVolumeMl: Math.max(...bands.map(band => band.endVolumeMl - displayOffset)),
    }, extent));
  };
  const createPool = () => {
    const name = poolName.trim();
    if (!name || !props.selectedFractionLabels.length) return;
    props.onCreatePool(name);
    setPoolName('');
  };
  const mode = props.interactionMode ?? 'inspect';

  return <section aria-label="Chromatogram workbench" class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-4">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
      <div><h2 class="text-sm font-semibold">Chromatogram</h2><p class="text-xs text-slate-500">Use a brush to define peaks and pooled fractions directly on the run.</p></div>
      <div class="flex flex-wrap gap-2">
        <button type="button" aria-pressed={mode === 'inspect'} onClick={() => props.onInteractionModeChange('inspect')} class="rounded border px-2.5 py-1.5 text-xs">Inspect mode</button>
        <button type="button" aria-pressed={mode === 'peak-select'} onClick={() => props.onInteractionModeChange('peak-select')} class="rounded border px-2.5 py-1.5 text-xs">Peak select mode</button>
        <button type="button" aria-pressed={mode === 'fraction-select'} onClick={() => props.onInteractionModeChange('fraction-select')} class="rounded border px-2.5 py-1.5 text-xs">Fraction select mode</button>
        <button type="button" onClick={() => props.onViewportChange(extent)} class="rounded border px-2.5 py-1.5 text-xs">Fit run</button>
        <button type="button" onClick={() => props.onViewportChange(extent)} class="rounded border px-2.5 py-1.5 text-xs">Reset zoom</button>
        <button type="button" onClick={() => props.onUseVisibleRange?.(props.viewport)} class="rounded border px-2.5 py-1.5 text-xs">Use visible range</button>
        <button type="button" onClick={props.onAutoscaleY} class="rounded border px-2.5 py-1.5 text-xs">Autoscale Y</button>
      </div>
    </header>
    {props.imported.injectionVolumeMl !== undefined && <p class="mt-3 text-xs font-medium text-violet-700 dark:text-violet-300">Injection at 0.00 mL (instrument volume {props.imported.injectionVolumeMl.toFixed(3)} mL)</p>}
    {props.baseline.mode === 'manual-linear' && <p class="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">Manual baseline</p>}
    {props.baseline.mode !== 'none' && <p class="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">Baseline-corrected UV</p>}
    <div class="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <PlotlyChromatogramPlot model={model} interactionMode={mode} onViewportCommit={props.onViewportChange} onFractionSelect={toggleFraction} onPeakSelect={setSelectedPeakId} onRangeSelect={props.onRangeSelect} baselineAnchorTarget={null} onBaselineAnchorPick={() => undefined} />
      <aside aria-label="Chromatogram inspector" class="space-y-4 border-t pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0 dark:border-slate-700">
        <section><h3 class="text-sm font-semibold">Display range</h3><div class="mt-2 grid grid-cols-2 gap-2"><label class="text-xs">Y minimum<input aria-label="Y axis minimum" value={minimum} onInput={event => setMinimum((event.target as HTMLInputElement).value)} class={`${FIELD} mt-1`} /></label><label class="text-xs">Y maximum<input aria-label="Y axis maximum" value={maximum} onInput={event => setMaximum((event.target as HTMLInputElement).value)} class={`${FIELD} mt-1`} /></label></div><div class="mt-2 flex gap-2"><button type="button" onClick={applyAxis} class="rounded border px-2.5 py-1.5 text-xs font-medium">Apply Y limits</button><button type="button" onClick={props.onAutoscaleY} class="rounded border px-2.5 py-1.5 text-xs">Autoscale Y</button></div>{axisError && <p role="alert" class="mt-2 text-xs text-rose-700">{axisError}</p>}</section>
        <section><h3 class="text-sm font-semibold">Runs</h3><div class="mt-2 space-y-1">{props.runs.map(run => <div key={run.id} class="flex items-center gap-2"><button type="button" aria-pressed={run.id === props.activeRunId} onClick={() => props.onActiveRunChange(run.id)} class="min-w-0 flex-1 rounded border px-2 py-1 text-left text-xs">{run.name}{run.id === props.activeRunId ? ' · active' : ' · compare'}</button><input aria-label={`Show ${run.name}`} type="checkbox" checked={run.visible} onChange={event => props.onRunVisibilityChange(run.id, (event.target as HTMLInputElement).checked)} /></div>)}</div></section>
        <section><h3 class="text-sm font-semibold">Trace display</h3><div class="mt-2 space-y-2">{traces.map((trace, index) => { const setting = settings[index]!; return <div class="flex items-center gap-2" key={trace.id}><button type="button" aria-pressed={setting.visible} onClick={() => props.onTraceSettingChange(trace.id, { visible: !setting.visible })} class={setting.visible ? 'min-w-0 flex-1 rounded px-2 py-1 text-left text-xs font-semibold text-white' : 'min-w-0 flex-1 rounded border px-2 py-1 text-left text-xs'} style={setting.visible ? { backgroundColor: setting.color } : undefined}>{trace.label} ({trace.unit})</button><input aria-label={`Color for ${trace.label}`} type="color" value={setting.color} onInput={event => props.onTraceSettingChange(trace.id, { color: (event.target as HTMLInputElement).value })} class="h-7 w-8 rounded border" /></div>; })}</div></section>
        <section><label class="flex items-center gap-2 text-xs font-medium"><input aria-label="Show fractions" type="checkbox" checked={props.showFractions} onChange={event => props.onShowFractionsChange((event.target as HTMLInputElement).checked)} /> Show fractions</label>{model.fractionAnnotations.labels.length > 0 && <div aria-label="Visible fraction labels" class="mt-2 flex max-h-28 flex-wrap content-start gap-1 overflow-y-auto">{model.fractionAnnotations.labels.map(fraction => <button type="button" key={fraction.id} aria-pressed={props.selectedFractionLabels.includes(fraction.text)} onClick={() => toggleFraction(fraction.text)} class={props.selectedFractionLabels.includes(fraction.text) ? 'rounded bg-violet-600 px-2 py-1 text-xs text-white' : 'rounded border px-2 py-1 text-xs'}>{fraction.text}</button>)}</div>}<button type="button" disabled={!props.selectedFractionLabels.length} onClick={focusFractions} class="mt-2 rounded border px-2.5 py-1.5 text-xs disabled:opacity-50">Focus selected fractions</button></section>
        <section><h3 class="text-sm font-semibold">Fraction pool</h3><label class="sr-only" for="fraction-pool-name">Fraction pool name</label><input id="fraction-pool-name" aria-label="Fraction pool name" value={poolName} onInput={event => setPoolName((event.target as HTMLInputElement).value)} class={`${FIELD} mt-2`} placeholder="e.g. Main peak" /><button type="button" disabled={!poolName.trim() || !props.selectedFractionLabels.length} onClick={createPool} class="mt-2 rounded border px-2.5 py-1.5 text-xs disabled:opacity-50">Create fraction pool</button>{props.pools?.map(pool => <p key={pool.id} class="mt-2 text-xs text-slate-600 dark:text-slate-300">{pool.name} · {pool.labels.join(', ')}</p>)}</section>
        <p class="text-xs text-slate-500">{props.acceptedPeaks.length} accepted peak{props.acceptedPeaks.length === 1 ? '' : 's'}. UV integrations retain every original sample.</p>
      </aside>
    </div>
  </section>;
}
