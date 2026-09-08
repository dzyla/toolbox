import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';

const { downloadText } = vi.hoisted(() => ({ downloadText: vi.fn() }));
vi.mock('@/lib/export', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/export')>()),
  downloadText,
}));

import { TOOLS } from '@/tools/registry';
import SecView from '@/tools/sec/View';

describe('Chromatography Workbench', () => {
  beforeEach(() => downloadText.mockReset());
  it('surfaces the chromatography workbench in the tool registry', () => {
    expect(TOOLS.find(tool => tool.id === 'sec')?.name).toBe('Chromatography Workbench');
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

  it('maps an imported trace and requires accepting a candidate before derived peak details appear', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /Run & fractions/i }));
    fireEvent.input(screen.getByLabelText(/Chromatogram CSV or TSV/i), {
      target: { value: 'x,signal,fraction\n1,0,F1\n2,4,F2\n3,0,F3\n' },
    });
    fireEvent.change(screen.getByLabelText(/Volume column/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/UV 280 column/i), { target: { value: '1' } });

    expect(screen.getByText(/Raw trace/i)).toBeTruthy();
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

  it('keeps scatter correction opt-in and blocks DOL until manufacturer coefficients are supplied', () => {
    render(<SecView />);
    fireEvent.click(screen.getByRole('button', { name: /UV-Vis spectra/i }));
    fireEvent.input(screen.getByLabelText(/Spectrum CSV or TSV/i), {
      target: { value: 'Wavelength,Absorbance\n280,1.00\n300,0.40\n320,0.30\n340,0.24\n' },
    });

    expect(screen.getByText(/Observed A280/i)).toBeTruthy();
    expect(screen.queryByText(/Scatter-corrected A280/i)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Apply 300–340 nm scatter correction/i));
    expect(screen.getByText(/Scatter-corrected A280/i)).toBeTruthy();
    expect(screen.getByText(/DOL blocked/i)).toBeTruthy();
    expect(screen.getByText(/dye epsilon/i)).toBeTruthy();
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
