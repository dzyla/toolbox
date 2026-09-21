import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChromatogramImport } from '@/core/chromatography';
import { ChromatogramWorkbench } from '@/tools/sec/ChromatogramWorkbench';

vi.mock('@/tools/sec/PlotlyChromatogramPlot', () => ({
  PlotlyChromatogramPlot: () => <div aria-label="Chromatogram analysis plot" />,
}));

const imported = {
  sourceHeaders: [], columnMapping: {}, mappedHeaders: {},
  points: [{ volumeMl: 0, uv280: 0 }, { volumeMl: 4, uv280: 1000 }],
  fractions: [], fractionEvents: [{ label: 'F1', volumeMl: 0 }, { label: 'F2', volumeMl: 2 }], notices: [],
} satisfies ChromatogramImport;

const props = {
  imported,
  rawUv: [{ volumeMl: 0, signalAu: 0 }, { volumeMl: 4, signalAu: 1 }],
  correctedUv: [{ volumeMl: 0, signalAu: 0 }, { volumeMl: 4, signalAu: 1 }],
  baseline: { mode: 'none' as const, points: [] },
  traceSettings: [{ id: 'uv280', visible: true, color: '#2563eb', axis: 'uv' as const }],
  viewport: { startVolumeMl: 0, endVolumeMl: 4 },
  yRange: undefined,
  showFractions: true,
  selectedFractionLabels: ['F1'],
  acceptedPeaks: [],
  runs: [{ id: 'run-1', name: 'Active run', visible: true }],
  activeRunId: 'run-1',
  onTraceSettingChange: vi.fn(), onViewportChange: vi.fn(), onShowFractionsChange: vi.fn(),
  onSelectedFractionLabelsChange: vi.fn(), onYAxisApply: vi.fn(), onAutoscaleY: vi.fn(),
  onInteractionModeChange: vi.fn(), onRangeSelect: vi.fn(), onActiveRunChange: vi.fn(),
  onRunVisibilityChange: vi.fn(), onCreatePool: vi.fn(),
};

describe('ChromatogramWorkbench', () => {
  beforeEach(() => vi.clearAllMocks());
  it('applies valid typed Y limits through the inspector', () => {
    render(<ChromatogramWorkbench {...props} />);
    fireEvent.input(screen.getByLabelText('Y axis minimum'), { target: { value: '25' } });
    fireEvent.input(screen.getByLabelText('Y axis maximum'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Y limits' }));
    expect(props.onYAxisApply).toHaveBeenCalledWith([25, 400]);
  });

  it('keeps invalid Y limits out of the chart and announces the reason', () => {
    render(<ChromatogramWorkbench {...props} />);
    fireEvent.input(screen.getByLabelText('Y axis minimum'), { target: { value: '400' } });
    fireEvent.input(screen.getByLabelText('Y axis maximum'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Y limits' }));
    expect(screen.getByRole('alert').textContent).toContain('Y maximum must be greater than Y minimum.');
    expect(props.onYAxisApply).not.toHaveBeenCalled();
  });

  it('exposes peak and fraction selection modes plus fraction-pool creation', () => {
    render(<ChromatogramWorkbench {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Peak select mode' }));
    expect(props.onInteractionModeChange).toHaveBeenCalledWith('peak-select');
    fireEvent.click(screen.getByRole('button', { name: 'Fraction select mode' }));
    expect(props.onInteractionModeChange).toHaveBeenCalledWith('fraction-select');
    fireEvent.input(screen.getByLabelText('Fraction pool name'), { target: { value: 'Main peak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create fraction pool' }));
    expect(props.onCreatePool).toHaveBeenCalledWith('Main peak');
  });
});
