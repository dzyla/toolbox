import type { Config, Data, Layout } from 'plotly.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { constrainViewport, type VolumeRange } from '@/core/chromatography';
import type { ChromatogramChartModel } from './chromatogram-chart-model';
import { loadPlotly, type PlotlyApi } from './plotly-runtime';

export interface PlotlyChromatogramPlotProps {
  model: ChromatogramChartModel;
  onViewportCommit: (range: VolumeRange) => void;
  onFractionSelect: (label: string) => void;
  onPeakSelect: (id: string) => void;
  interactionMode?: ChartInteractionMode;
  onRangeSelect?: (range: VolumeRange, mode: Exclude<ChartInteractionMode, 'inspect'>) => void;
  baselineAnchorTarget: 'start' | 'end' | null;
  onBaselineAnchorPick: (target: 'start' | 'end', point: { volumeMl: number; signalAu: number }) => void;
}

export type ChartInteractionMode = 'inspect' | 'peak-select' | 'fraction-select';

interface PlotlyEventTarget extends HTMLElement {
  on: (name: string, listener: (event: Record<string, unknown>) => void) => void;
}

const chartConfig: Partial<Config> = {
  responsive: true,
  scrollZoom: true,
  displaylogo: false,
};

function traceData(model: ChromatogramChartModel): Data[] {
  const traces: Data[] = model.traces
    .map(trace => ({
      type: 'scattergl',
      mode: 'lines',
      x: trace.x,
      y: trace.y,
      name: `${trace.label} (${trace.unit})`,
      yaxis: trace.axis === 'overlay' ? 'y2' : 'y',
      line: { color: trace.color, width: 2 },
      visible: trace.visible,
      meta: { chromatogramTraceId: trace.id, role: trace.axis === 'uv' ? 'uv' : 'overlay' },
      hovertemplate: `%{x:.3f} mL<br>%{y:.3g} ${trace.unit}<extra>${trace.label}</extra>`,
    } as Data));
  if (model.baseline) {
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: model.baseline.x,
      y: model.baseline.y,
      name: 'Baseline',
      yaxis: 'y',
      line: { color: model.baseline.color, dash: model.baseline.dash, width: 1.5 },
      hoverinfo: 'skip',
    } as Data);
  }
  model.peakOverlays.forEach(peak => {
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: peak.x,
      y: peak.baselineY,
      yaxis: 'y',
      line: { width: 0 },
      hoverinfo: 'skip',
      showlegend: false,
    } as Data);
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: peak.x,
      y: peak.correctedY,
      yaxis: 'y',
      name: `Peak ${peak.id}`,
      fill: 'tonexty',
      fillcolor: peak.selected ? 'rgba(14, 165, 233, 0.32)' : 'rgba(14, 165, 233, 0.16)',
      line: { color: '#0284c7', width: peak.selected ? 2.5 : 1.5 },
      meta: { acceptedPeakId: peak.id, role: 'peak' },
      hovertemplate: `%{x:.3f} mL<br>%{y:.3g} mAU<extra>Peak ${peak.id}</extra>`,
    } as Data);
  });
  return traces;
}

function chartLayout(model: ChromatogramChartModel, interactionMode: ChartInteractionMode = 'inspect'): Partial<Layout> {
  const fractionShapes = model.fractionAnnotations.bands.map((band, index) => ({
    type: 'rect' as const,
    xref: 'x' as const,
    yref: 'paper' as const,
    x0: band.startVolumeMl,
    x1: band.endVolumeMl,
    y0: 0,
    y1: 0.1,
    fillcolor: band.selected
      ? 'rgba(124, 58, 237, 0.42)'
      : index % 2 === 0 ? 'rgba(167, 139, 250, 0.20)' : 'rgba(196, 181, 253, 0.20)',
    line: { width: 0 },
    layer: 'below' as const,
  }));
  const injectionShapes = model.injectionDisplayVolumeMl === undefined ? [] : [{
    type: 'line' as const,
    xref: 'x' as const,
    yref: 'paper' as const,
    x0: model.injectionDisplayVolumeMl,
    x1: model.injectionDisplayVolumeMl,
    y0: 0,
    y1: 1,
    line: { color: '#7c3aed', width: 2, dash: 'dash' as const },
  }];
  return {
    autosize: true,
    margin: { l: 64, r: 64, t: 24, b: 78 },
    hovermode: 'x unified',
    dragmode: interactionMode === 'inspect' ? 'zoom' : 'select',
    showlegend: false,
    xaxis: {
      title: { text: 'Elution volume relative to injection (mL)' },
      range: [model.viewport.startVolumeMl, model.viewport.endVolumeMl],
      rangeslider: { visible: true, thickness: 0.08 },
      zeroline: false,
    },
    yaxis: {
      title: { text: 'UV (mAU)' },
      domain: [0.14, 1],
      zeroline: true,
      zerolinecolor: '#cbd5e1',
      autorange: model.yRange === undefined,
      range: model.yRange,
    },
    yaxis2: {
      title: { text: 'Overlay' },
      overlaying: 'y',
      side: 'right',
      showgrid: false,
    },
    shapes: [...fractionShapes, ...injectionShapes],
    annotations: [
      ...model.fractionAnnotations.labels.map(label => ({
        xref: 'x' as const,
        yref: 'paper' as const,
        x: label.volumeMl,
        y: 0.05,
        text: label.text,
        showarrow: false,
        font: { size: 10, color: '#5b21b6' },
        xanchor: 'left' as const,
      })),
      ...(model.injectionDisplayVolumeMl === undefined ? [] : [{
        xref: 'x' as const,
        yref: 'paper' as const,
        x: model.injectionDisplayVolumeMl,
        y: 0.98,
        text: 'Injection · 0.00 mL',
        showarrow: false,
        xanchor: 'left' as const,
        font: { size: 11, color: '#6d28d9' },
        bgcolor: 'rgba(255,255,255,0.85)',
      }]),
    ],
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
  };
}

function rangeFromRelayout(event: Record<string, unknown>, extent: VolumeRange): VolumeRange | undefined {
  const pairedRange = event['xaxis.range'];
  const start = Array.isArray(pairedRange) ? Number(pairedRange[0]) : Number(event['xaxis.range[0]']);
  const end = Array.isArray(pairedRange) ? Number(pairedRange[1]) : Number(event['xaxis.range[1]']);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  return constrainViewport({ startVolumeMl: start, endVolumeMl: end }, extent);
}

function selectionRange(event: Record<string, unknown>, extent: VolumeRange): VolumeRange | undefined {
  const range = event.range as { x?: unknown } | undefined;
  const values = Array.isArray(range?.x) ? range.x : [];
  const start = Number(values[0]);
  const end = Number(values[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  return constrainViewport({ startVolumeMl: start, endVolumeMl: end }, extent);
}

function traceSchema(model: ChromatogramChartModel): string {
  return [
    ...model.traces.map(trace => `signal:${trace.id}:${trace.axis}`),
    ...(model.baseline ? ['baseline'] : []),
    ...model.peakOverlays.flatMap(peak => [`peak-base:${peak.id}`, `peak-fill:${peak.id}`]),
  ].join('|');
}

export function PlotlyChromatogramPlot(props: PlotlyChromatogramPlotProps) {
  const graphRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<PlotlyApi>();
  const callbacksRef = useRef(props);
  const modelRef = useRef(props.model);
  const schemaRef = useRef('');
  const [retryToken, setRetryToken] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  callbacksRef.current = props;
  modelRef.current = props.model;

  useEffect(() => {
    let disposed = false;
    const graph = graphRef.current;
    if (!graph) return;
    setStatus('loading');
    void loadPlotly().then(api => api.newPlot(
      graph,
      traceData(modelRef.current),
      chartLayout(modelRef.current, callbacksRef.current.interactionMode),
      chartConfig,
    ).then(() => {
      if (disposed) {
        api.purge(graph);
        return;
      }
      apiRef.current = api;
      schemaRef.current = traceSchema(modelRef.current);
      const eventGraph = graph as unknown as PlotlyEventTarget;
      eventGraph.on('plotly_relayout', event => {
        const range = rangeFromRelayout(event, modelRef.current.extent);
        if (range) callbacksRef.current.onViewportCommit(range);
      });
      eventGraph.on('plotly_click', event => {
        const firstPoint = Array.isArray(event.points) ? event.points[0] as Record<string, unknown> | undefined : undefined;
        if (!firstPoint) return;
        const metadata = firstPoint.data as { meta?: Record<string, unknown> } | undefined;
        const peakId = metadata?.meta?.acceptedPeakId;
        if (typeof peakId === 'string') callbacksRef.current.onPeakSelect(peakId);
        const target = callbacksRef.current.baselineAnchorTarget;
        if (target && metadata?.meta?.role === 'uv') {
          const volumeMl = Number(firstPoint.x);
          const signalAu = Number(firstPoint.y) / 1000;
          if (Number.isFinite(volumeMl) && Number.isFinite(signalAu)) {
            callbacksRef.current.onBaselineAnchorPick(target, { volumeMl, signalAu });
          }
        }
      });
      eventGraph.on('plotly_selected', event => {
        const mode = callbacksRef.current.interactionMode;
        if (mode !== 'peak-select' && mode !== 'fraction-select') return;
        const range = selectionRange(event, modelRef.current.extent);
        if (range) callbacksRef.current.onRangeSelect?.(range, mode);
      });
      setStatus('ready');
    })).catch(() => {
      if (!disposed) setStatus('error');
    });
    return () => {
      disposed = true;
      apiRef.current?.purge(graph);
      apiRef.current = undefined;
    };
  }, [retryToken]);

  useEffect(() => {
    const graph = graphRef.current;
    const api = apiRef.current;
    if (!graph || !api || status !== 'ready') return;
    const data = traceData(props.model);
    const schema = traceSchema(props.model);
    if (schema !== schemaRef.current) {
      schemaRef.current = schema;
      void api.react(graph, data, chartLayout(props.model, props.interactionMode), chartConfig);
      return;
    }
    const indexes = data.map((_, index) => index);
    void api.restyle(graph, {
      x: data.map(trace => (trace as { x?: unknown }).x),
      y: data.map(trace => (trace as { y?: unknown }).y),
      visible: data.map(trace => (trace as { visible?: unknown }).visible ?? true),
    }, indexes);
    void api.relayout(graph, {
      'xaxis.range': [props.model.viewport.startVolumeMl, props.model.viewport.endVolumeMl],
      'yaxis.range': props.model.yRange,
      'yaxis.autorange': props.model.yRange === undefined,
      shapes: chartLayout(props.model, props.interactionMode).shapes,
      annotations: chartLayout(props.model, props.interactionMode).annotations,
      dragmode: (props.interactionMode ?? 'inspect') === 'inspect' ? 'zoom' : 'select',
    });
  }, [props.model, props.interactionMode, status]);

  const activeTraces = props.model.traces.filter(trace => trace.visible).map(trace => trace.label).join(', ') || 'none';
  const injectionSummary = props.model.injectionDisplayVolumeMl === undefined ? 'Instrument volume origin' : 'Display origin is injection volume 0.00 mL';

  return <div class="relative min-h-[28rem]">
    <div ref={graphRef} aria-label="Chromatogram analysis plot" class="min-h-[28rem] w-full" />
    <p class="sr-only" aria-live="polite">
      Active traces: {activeTraces}. {injectionSummary}. Displayed range {props.model.viewport.startVolumeMl.toFixed(3)} to {props.model.viewport.endVolumeMl.toFixed(3)} mL. {props.model.peakOverlays.length} accepted peaks.
    </p>
    {status === 'loading' && <p class="absolute inset-0 grid place-items-center text-sm text-slate-500">Loading interactive chromatogram…</p>}
    {status === 'ready' && <span data-testid="plotly-chromatogram-ready" class="sr-only">Interactive chromatogram ready</span>}
    {status === 'error' && <div class="absolute inset-0 grid place-items-center gap-2 bg-white/90 p-4 text-center text-sm dark:bg-slate-950/90">
      <p>Interactive chromatogram could not load.</p>
      <button type="button" class="rounded border px-3 py-1.5" onClick={() => setRetryToken(value => value + 1)}>Retry interactive chart</button>
    </div>}
  </div>;
}
