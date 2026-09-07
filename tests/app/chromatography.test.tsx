import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { TOOLS } from '@/tools/registry';
import SecView from '@/tools/sec/View';

describe('Chromatography Workbench', () => {
  it('surfaces the chromatography workbench in the tool registry', () => {
    expect(TOOLS.find(tool => tool.id === 'sec')?.name).toBe('Chromatography Workbench');
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
