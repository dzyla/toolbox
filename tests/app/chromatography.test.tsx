import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';

const { downloadText, plotlyApi } = vi.hoisted(() => ({
  downloadText: vi.fn(),
  plotlyApi: {
    newPlot: vi.fn(async (root: HTMLElement) => {
      Object.assign(root, { on: vi.fn() });
      return root;
    }),
    react: vi.fn(async (root: HTMLElement) => root),
    restyle: vi.fn(async (root: HTMLElement) => root),
    relayout: vi.fn(async (root: HTMLElement) => root),
    purge: vi.fn(),
  },
}));
vi.mock('@/lib/export', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  downloadText,
}));
vi.mock('@/tools/sec/plotly-runtime', () => ({
  loadPlotly: vi.fn(async () => plotlyApi),
}));

import { TOOLS } from '@/tools/registry';
import SecView from '@/tools/sec/View';

describe('Chromatography Workbench', () => {
  beforeEach(() => downloadText.mockReset());
  it('surfaces the chromatography workbench in the tool registry', () => {
    expect(TOOLS.find(tool => tool.id === 'sec')?.name).toBe('Chromatography Workbench');
  });

  it('renders one page-level heading for the workbench route', () => {
    render(<SecView />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: /Chromatography Workbench/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: /SEC Calibration & Stokes Radius/i })).toBeTruthy();
  });

  it('defaults baseline correction to none, supports reviewable manual peak integration, and blocks fraction amount until required inputs exist', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), {
      target: { value: 'volume,uv280,fraction\n1,0,F1\n2,4,F2\n3,0,F3\n' },
    });
    const baseline = screen.getByLabelText(/Baseline correction/i) as HTMLSelectElement;
    expect(baseline.value).toBe('none');
    fireEvent.change(baseline, { target: { value: 'rolling-minimum' } });
    expect(screen.getByText(/Baseline: rolling-minimum/i)).toBeTruthy();
    expect(screen.getByText(/Baseline-corrected UV/i)).toBeTruthy();

    fireEvent.input(screen.getByLabelText(/Manual peak start/i), { target: { value: '1' } });
    fireEvent.input(screen.getByLabelText(/Manual peak end/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Accept manual peak bounds/i }));
    expect(screen.getByText(/Manual accepted peak details/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Select fraction F2/i }));
    expect(screen.getByText(/Amount estimate blocked/i)).toBeTruthy();
    fireEvent.input(screen.getByLabelText(/Fraction A280/i), { target: { value: '0.5' } });
    fireEvent.input(screen.getByLabelText(/Protein epsilon/i), { target: { value: '50000' } });
    fireEvent.input(screen.getByLabelText(/Protein molecular weight/i), { target: { value: '50000' } });
    fireEvent.input(screen.getByLabelText(/Path length/i), { target: { value: '1' } });
    fireEvent.input(screen.getByLabelText(/Fraction volume/i), { target: { value: '1' } });
    expect(screen.getByText(/Amount estimate: /i)).toBeTruthy();
  });

  it('shows invalid gradient settings as an alert without rendering a gradient plot', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Method planner/i }));
    fireEvent.input(screen.getByLabelText(/Flow \(mL\/min\)/i), { target: { value: '0' } });
    expect(screen.getByRole('alert').textContent).toMatch(/flow.*greater than zero/i);
    expect(screen.queryByLabelText(/Gradient plan/i)).toBeNull();
  });

  it('exports review records with provenance, mappings, baseline, and required audit sections', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), {
      target: { value: 'volume,uv280,fraction\n1,0,F1\n2,4,F2\n3,0,F3\n' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Export derived JSON/i }));
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"sourceText"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"baseline"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"methodSettings"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
  });

  it('exports injection-relative display and multi-peak review state only in derived records', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), { target: { value: [
      'Chrom.1\t\tChrom.1\t\tChrom.1\t',
      'Fraction\t\tInjection\t\tUV\t',
      'ml\tFraction\tml\tInjection\tml\tmAU',
      '3\t"A1"\t1\t\t1\t0',
      '4\t"A2"\t\t\t2\t4',
      '5\t"A3"\t\t\t3\t0',
      '6\t"A4"\t\t\t4\t5',
      '7\t"A5"\t\t\t5\t0',
    ].join('\n') } });
    fireEvent.click(screen.getByRole('button', { name: /Accept candidate 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Accept candidate 2/i }));
    fireEvent.input(screen.getByLabelText(/Color for UV/i), { target: { value: '#dc2626' } });
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    fireEvent.click(screen.getByRole('button', { name: /Focus selected fractions/i }));
    fireEvent.click(screen.getByRole('button', { name: /Export derived JSON/i }));

    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"acceptedPeaks"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"displayVolumeOffsetMl"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"traceSettings"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
  });

  it('maps an imported trace and requires accepting a candidate before derived peak details appear', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), {
      target: { value: 'x,signal,fraction\n1,0,F1\n2,4,F2\n3,0,F3\n' },
    });
    fireEvent.change(screen.getByLabelText(/Volume column/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/UV 280 column/i), { target: { value: '1' } });

    expect(screen.getByText(/^Chromatogram$/i)).toBeTruthy();
    expect(screen.getByText(/Candidate peaks/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export raw CSV/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export raw JSON/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export derived CSV/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export derived JSON/i })).toBeTruthy();
    expect(screen.queryByText(/Accepted peak details/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Accept candidate 1/i }));
    expect(screen.getByText(/Accepted peak details/i)).toBeTruthy();
    expect(screen.getByText(/Fractions \(3\)/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Select fraction F2/i }));
    expect(screen.getByText(/Fraction details: F2/i)).toBeTruthy();
  });

  it('retains multiple accepted peaks with editable bounds and exposes a manual linear baseline', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), {
      target: { value: 'volume,uv280\n1,0\n2,4\n3,0\n4,5\n5,0\n' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Accept candidate 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Accept candidate 2/i }));
    expect(screen.getAllByRole('heading', { name: /Accepted peak/i })).toHaveLength(2);
    fireEvent.input(screen.getByLabelText(/Peak 1 start/i), { target: { value: '1.5' } });
    expect(screen.getByText(/Peak 1.*AU·mL/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Remove peak 2/i }));
    expect(screen.getAllByRole('heading', { name: /Accepted peak/i })).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(/Baseline correction/i), { target: { value: 'manual-linear' } });
    fireEvent.input(screen.getByLabelText(/Baseline start volume/i), { target: { value: '1' } });
    fireEvent.input(screen.getByLabelText(/Baseline start signal/i), { target: { value: '0' } });
    fireEvent.input(screen.getByLabelText(/Baseline end volume/i), { target: { value: '5' } });
    fireEvent.input(screen.getByLabelText(/Baseline end signal/i), { target: { value: '0' } });
    expect(screen.getByText(/Manual baseline/i)).toBeTruthy();
  });

  it('calculates average mg/mL from an accepted peak area and labels its chart color', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), {
      target: { value: 'volume,uv280\n1,0\n2,1000\n3,0\n' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Accept candidate 1/i }));

    fireEvent.input(screen.getByLabelText('Peak extinction coefficient'), { target: { value: '50' } });
    fireEvent.input(screen.getByLabelText('Peak molecular weight'), { target: { value: '100' } });
    fireEvent.input(screen.getByLabelText('Peak path (cm)'), { target: { value: '1' } });

    expect(screen.getByText(/Average concentration: 1\.0000 mg\/mL/i)).toBeTruthy();
    expect(screen.getByLabelText('Peak 1 chart color')).toBeTruthy();
  });

  it('loads a chromatogram file and retains its filename in derived exports', async () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    const file = new File(['volume,uv280\n1,0\n2,4\n3,0\n'], 'run.asc', { type: 'text/plain' });

    fireEvent.change(screen.getByLabelText(/Import chromatogram file/i), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Imported: run\.asc/i)).toBeTruthy());
    expect(screen.getByText(/Candidate peaks/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Export derived JSON/i }));
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"filename": "run.asc"'), 'chromatography-derived.json', 'application/json;charset=utf-8');
  });

  it('shows imported ÅKTA channels together and lets each trace be hidden independently', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), { target: { value: [
      'Chrom.1\t\tChrom.1\t\tChrom.1\t',
      'Cond\t\t% Cond\t\tUV\t',
      'ml\tmS/cm\tml\t%\tml\tmAU',
      '0\t30\t0\t20\t0\t1',
      '1\t31\t1\t40\t1\t3',
    ].join('\n') } });
    expect(screen.getByRole('button', { name: /Cond \(mS\/cm\)/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /% Cond \(%\)/i }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Cond \(mS\/cm\)/i }));
    expect(screen.getByRole('button', { name: /Cond \(mS\/cm\)/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows injection-relative ÅKTA annotations and lets active trace colors and viewport be controlled', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), { target: { value: [
      'Chrom.1\t\tChrom.1\t\tChrom.1\t\tChrom.1\t',
      'Fraction\t\tInjection\t\tCond\t\tUV\t',
      'ml\tFraction\tml\tInjection\tml\tmS/cm\tml\tmAU',
      '4\t"A1"\t2\t\t2\t30\t2\t0',
      '5\t"A2"\t\t\t3\t31\t3\t4',
      '6\t"A3"\t\t\t4\t32\t4\t0',
    ].join('\n') } });

    expect(screen.getByLabelText(/Chromatogram analysis plot/i)).toBeTruthy();
    expect(screen.getByText(/Injection at 0\.00 mL/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'A1', exact: true })).toBeTruthy();
    const color = screen.getByLabelText(/Color for UV/i) as HTMLInputElement;
    fireEvent.input(color, { target: { value: '#dc2626' } });
    expect(color.value).toBe('#dc2626');
    fireEvent.click(screen.getByRole('button', { name: /Focus selected fractions/i }));
    fireEvent.click(screen.getByRole('button', { name: /Reset zoom/i }));
  });

  it('uses a compact chart toolbar and inspector instead of an SVG trace viewer', async () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), {
      target: { value: 'volume,uv280,fraction\n1,0,F1\n2,4,F2\n3,0,F3\n' },
    });

    expect(screen.getByRole('button', { name: /Fit run/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Trace display/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Use visible range/i })).toBeTruthy();
    expect(screen.queryByText(/^Trace viewer$/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Use visible range/i }));
    expect((screen.getByLabelText(/Manual peak start/i) as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText(/Manual peak end/i) as HTMLInputElement).value).toBe('3');
    await waitFor(() => expect(screen.getByTestId('plotly-chromatogram-ready')).toBeTruthy());
  });

  it('bounds the legacy fraction-detail chooser for dense generic imports', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), {
      target: {
        value: [
          'volume,uv280,fraction',
          ...Array.from({ length: 30 }, (_, index) => `${index},${index % 5},F${index + 1}`),
        ].join('\n'),
      },
    });

    expect(screen.getAllByRole('button', { name: /Select fraction/i })).toHaveLength(12);
  });

  it('keeps UV-Vis correction out of the chromatography workbench', () => {
    render(<SecView />);
    expect(screen.queryByRole('button', { name: /UV-Vis spectra/i })).toBeNull();
  });

  it('routes sequence pI into planner advice and exposes review-required status', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Method planner/i }));
    fireEvent.input(screen.getByLabelText(/Protein sequence/i), { target: { value: 'AAAAAAAAAAAA' } });
    fireEvent.input(screen.getByLabelText(/Target pH/i), { target: { value: '6' } });

    expect(screen.getByText(/Review required/i)).toBeTruthy();
    expect(screen.getByLabelText(/Buffer A description/i)).toBeTruthy();
    expect(screen.getByLabelText(/Buffer B description/i)).toBeTruthy();
  });
});
