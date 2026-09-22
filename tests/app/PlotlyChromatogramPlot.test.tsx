import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import type { ChromatogramChartModel } from '@/tools/sec/chromatogram-chart-model';

const { handlers, plotlyApi } = vi.hoisted(() => {
  const eventHandlers = new Map<string, (event: Record<string, unknown>) => void>();
  return {
    handlers: eventHandlers,
    plotlyApi: {
      newPlot: vi.fn(async (...args: unknown[]) => {
        const root = args[0] as HTMLElement;
        Object.assign(root, { on: (eventName: string, callback: (event: Record<string, unknown>) => void) => eventHandlers.set(eventName, callback) });
        return root;
      }),
      react: vi.fn(async (root: HTMLElement) => root),
      restyle: vi.fn(async (root: HTMLElement) => root),
      relayout: vi.fn(async (root: HTMLElement) => root),
      purge: vi.fn(),
    },
  };
});

vi.mock('@/tools/sec/plotly-runtime', () => ({
  loadPlotly: vi.fn(async () => plotlyApi),
}));

import { PlotlyChromatogramPlot } from '@/tools/sec/PlotlyChromatogramPlot';

const model: ChromatogramChartModel = {
  extent: { startVolumeMl: 0, endVolumeMl: 4 },
  viewport: { startVolumeMl: 0, endVolumeMl: 4 },
  traces: [{
    id: 'uv280', label: 'UV', unit: 'mAU', x: [0, 1, 2, 3, 4], y: [0, 2, 0, 3, 0],
    color: '#2563eb', axis: 'uv', visible: true,
  }],
  fractionAnnotations: { bands: [], labels: [] },
  injectionDisplayVolumeMl: 0,
  baseline: undefined,
  peakOverlays: [],
};

const callbacks = {
  onViewportCommit: vi.fn(),
  onFractionSelect: vi.fn(),
  onPeakSelect: vi.fn(),
  onRangeSelect: vi.fn(),
  onBaselineAnchorPick: vi.fn(),
};

describe('PlotlyChromatogramPlot', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it('creates one WebGL graph and exposes a ready chart to assistive technology', async () => {
    render(<PlotlyChromatogramPlot
      model={model}
      onViewportCommit={vi.fn()}
      onFractionSelect={vi.fn()}
      onPeakSelect={vi.fn()}
      baselineAnchorTarget={null}
      onBaselineAnchorPick={vi.fn()}
    />);

    await waitFor(() => expect(screen.getByTestId('plotly-chromatogram-ready')).toBeTruthy());
    expect(screen.getByLabelText(/Chromatogram analysis plot/i)).toBeTruthy();
    expect(plotlyApi.newPlot).toHaveBeenCalledTimes(1);
    expect(plotlyApi.newPlot.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'scattergl', name: 'UV (mAU)' }),
    ]));
  });

  it('commits only a valid settled Plotly x range', async () => {
    const onViewportCommit = vi.fn();
    render(<PlotlyChromatogramPlot
      model={model}
      onViewportCommit={onViewportCommit}
      onFractionSelect={vi.fn()}
      onPeakSelect={vi.fn()}
      baselineAnchorTarget={null}
      onBaselineAnchorPick={vi.fn()}
    />);

    await waitFor(() => expect(handlers.get('plotly_relayout')).toBeTypeOf('function'));
    handlers.get('plotly_relayout')?.({ 'xaxis.range[0]': 1, 'xaxis.range[1]': 3 });
    handlers.get('plotly_relayout')?.({ 'xaxis.range[0]': 3, 'xaxis.range[1]': 1 });

    expect(onViewportCommit).toHaveBeenCalledTimes(1);
    expect(onViewportCommit).toHaveBeenCalledWith({ startVolumeMl: 1, endVolumeMl: 3 });
  });

  it('does not feed a controlled viewport relayout back into parent state', async () => {
    const onViewportCommit = vi.fn();
    render(<PlotlyChromatogramPlot
      model={model}
      onViewportCommit={onViewportCommit}
      onFractionSelect={vi.fn()}
      onPeakSelect={vi.fn()}
      baselineAnchorTarget={null}
      onBaselineAnchorPick={vi.fn()}
    />);
    await waitFor(() => expect(handlers.get('plotly_relayout')).toBeTypeOf('function'));
    handlers.get('plotly_relayout')?.({ 'xaxis.range[0]': 0, 'xaxis.range[1]': 4 });
    expect(onViewportCommit).not.toHaveBeenCalled();
  });

  it('purges the graph when the component unmounts', async () => {
    const rendered = render(<PlotlyChromatogramPlot
      model={model}
      onViewportCommit={vi.fn()}
      onFractionSelect={vi.fn()}
      onPeakSelect={vi.fn()}
      baselineAnchorTarget={null}
      onBaselineAnchorPick={vi.fn()}
    />);

    await waitFor(() => expect(plotlyApi.newPlot).toHaveBeenCalledTimes(1));
    const graph = plotlyApi.newPlot.mock.calls[0]?.[0];
    rendered.unmount();

    expect(plotlyApi.purge).toHaveBeenCalledWith(graph);
  });

  it('relayouts controlled Y limits without rebuilding the graph', async () => {
    const rendered = render(<PlotlyChromatogramPlot
      model={{ ...model, yRange: [10, 250] }}
      {...callbacks}
      interactionMode="inspect"
      baselineAnchorTarget={null}
    />);

    await waitFor(() => expect(plotlyApi.newPlot).toHaveBeenCalledTimes(1));
    rendered.rerender(<PlotlyChromatogramPlot
      model={{ ...model, yRange: [25, 300] }}
      {...callbacks}
      interactionMode="inspect"
      baselineAnchorTarget={null}
    />);

    await waitFor(() => expect(plotlyApi.relayout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ 'yaxis.range': [25, 300] }),
    ));
    expect(plotlyApi.react).not.toHaveBeenCalled();
  });

  it('maps a Plotly selection to the active peak-select mode', async () => {
    const onRangeSelect = vi.fn();
    render(<PlotlyChromatogramPlot
      model={model}
      {...callbacks}
      onRangeSelect={onRangeSelect}
      interactionMode="peak-select"
      baselineAnchorTarget={null}
    />);

    await waitFor(() => expect(handlers.get('plotly_selected')).toBeTypeOf('function'));
    handlers.get('plotly_selected')?.({ range: { x: [1.25, 2.75] } });

    expect(onRangeSelect).toHaveBeenCalledWith({ startVolumeMl: 1.25, endVolumeMl: 2.75 }, 'peak-select');
  });

  it('renders accepted peak areas in distinct colors', async () => {
    render(<PlotlyChromatogramPlot
      model={{
        ...model,
        peakOverlays: [
          { id: 'candidate-1', x: [0, 1], baselineY: [0, 0], correctedY: [0, 2], color: '#0284c7', selected: false },
          { id: 'candidate-2', x: [2, 3], baselineY: [0, 0], correctedY: [0, 3], color: '#d97706', selected: false },
        ],
      }}
      {...callbacks}
      baselineAnchorTarget={null}
    />);

    await waitFor(() => expect(plotlyApi.newPlot).toHaveBeenCalledTimes(1));
    const peakFills = (plotlyApi.newPlot.mock.calls[0]?.[1] as Array<{ fillcolor?: string }>)
      .filter(trace => trace.fillcolor)
      .map(trace => trace.fillcolor);
    expect(peakFills).toHaveLength(2);
    expect(peakFills[0]).not.toBe(peakFills[1]);
  });

  it('commits a dragged left peak boundary', async () => {
    const onPeakBoundCommit = vi.fn();
    render(<PlotlyChromatogramPlot
      model={{
        ...model,
        injectionDisplayVolumeMl: undefined,
        peakOverlays: [
          { id: 'candidate-1', x: [1, 2], baselineY: [0, 0], correctedY: [0, 2], color: '#0284c7', selected: false },
        ],
      }}
      {...callbacks}
      onPeakBoundCommit={onPeakBoundCommit}
      baselineAnchorTarget={null}
    />);

    await waitFor(() => expect(handlers.get('plotly_relayout')).toBeTypeOf('function'));
    handlers.get('plotly_relayout')?.({ 'shapes[0].x0': 1.25, 'shapes[0].x1': 1.25 });

    expect(onPeakBoundCommit).toHaveBeenCalledTimes(1);
    expect(onPeakBoundCommit).toHaveBeenCalledWith('candidate-1', 'start', 1.25);
  });
});
