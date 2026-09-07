import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import PlateView from '@/tools/plate/View';
import { route } from '@/app/router';

describe('Plate Layout Designer Overhaul', () => {
  it('renders ANSI/SLAS microplate bezel with A1 notch and grid dimensions', () => {
    route.value = { name: 'tool', toolId: 'plate' };
    render(<PlateView />);

    expect(screen.getByText(/ANSI \/ SLAS 1-2004 Microplate/)).toBeTruthy();
    expect(screen.getByText(/A1 NOTCH/)).toBeTruthy();
    expect(screen.getByText(/8 × 12 Grid/)).toBeTruthy();
    expect(screen.getByText(/Well B1/)).toBeTruthy();
  });

  it('switches between display modes: Labels, Concentrations, Sample Groups, and Color Shading', () => {
    route.value = { name: 'tool', toolId: 'plate' };
    render(<PlateView />);

    const concBtn = screen.getByRole('button', { name: 'Concentrations' });
    fireEvent.click(concBtn);
    expect(screen.getAllByText('100').length).toBeGreaterThan(0);

    const samplesBtn = screen.getByRole('button', { name: 'Sample Groups' });
    fireEvent.click(samplesBtn);
    expect(screen.getAllByText('Std 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('standard').length).toBeGreaterThan(0);

    const shadingBtn = screen.getByRole('button', { name: 'Color Shading' });
    fireEvent.click(shadingBtn);
    expect(screen.getByText(/Color Shading/)).toBeTruthy();

    const labelsBtn = screen.getByRole('button', { name: 'Labels & Values' });
    fireEvent.click(labelsBtn);
    expect(screen.getAllByText(/Std 1/).length).toBeGreaterThan(0);
  });

  it('loads standard assay presets: ELISA, IC50, qPCR, and HTS Screen', () => {
    route.value = { name: 'tool', toolId: 'plate' };
    render(<PlateView />);

    // Load 12-point Dose-Response (IC50) preset
    const ic50Btn = screen.getByRole('button', { name: /12-Point Dose-Response/ });
    fireEvent.click(ic50Btn);
    expect(screen.getAllByText(/Compound A/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reference Inhibitor/).length).toBeGreaterThan(0);

    // Load qPCR preset
    const qpcrBtn = screen.getByRole('button', { name: /qPCR Gene Expression/ });
    fireEvent.click(qpcrBtn);
    expect(screen.getAllByText(/GAPDH/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Target Gene 1/).length).toBeGreaterThan(0);

    // Load HTS preset
    const htsBtn = screen.getByRole('button', { name: /HTS Screening Plate/ });
    fireEvent.click(htsBtn);
    expect(screen.getAllByText(/Screening Library/).length).toBeGreaterThan(0);
  });

  it('inspects selected well and allows inline editing of concentration and sample group', () => {
    route.value = { name: 'tool', toolId: 'plate' };
    render(<PlateView />);

    // Select mode: inspect
    const inspectToolBtn = screen.getByRole('button', { name: /Inspect/ });
    fireEvent.click(inspectToolBtn);

    // Click well A1
    const wellA1 = screen.getByTitle(/A1: Blank/);
    fireEvent.click(wellA1);

    expect(screen.getByText(/Well A1/)).toBeTruthy();
    expect(screen.getByText(/Row A, Col 1/)).toBeTruthy();

    // Edit concentration
    const concInput = screen.getByPlaceholderText('e.g. 10') as HTMLInputElement;
    fireEvent.input(concInput, { target: { value: '42.5' } });
    expect(concInput.value).toBe('42.5');
  });

  it('generates pipetting scheme and stock reagent breakdown', () => {
    route.value = { name: 'tool', toolId: 'plate' };
    render(<PlateView />);

    const pipettingTab = screen.getByRole('button', { name: /Pipetting Scheme & Volumes/ });
    fireEvent.click(pipettingTab);

    expect(screen.getByText(/Total Diluent Buffer/)).toBeTruthy();
    expect(screen.getByText(/Reagent & Sample Requirements Breakdown/)).toBeTruthy();
    expect(screen.getByText(/Step-by-Step Multichannel Loading Protocol/)).toBeTruthy();
  });

  it('unifies Layout Generator and Plate Reader Processor in one seamless tool', async () => {
    route.value = { name: 'tool', toolId: 'plate' };
    render(<PlateView />);

    // In default Generator mode, verify mode switcher and action button
    expect(screen.getByRole('button', { name: /Process Plate Reader Data with this Layout/ })).toBeTruthy();
    const readerToggleBtn = screen.getByRole('button', { name: /Plate Reader Processor/ });
    expect(readerToggleBtn).toBeTruthy();

    // Click to switch into Plate Reader mode
    fireEvent.click(readerToggleBtn);

    // Should now render Plate Reader Processor embedded with layout from generator
    expect(await screen.findByText(/Plate Reader CSV Processor & Normalization/)).toBeTruthy();
    expect(screen.getByText(/Return to Generator/)).toBeTruthy();
    expect(screen.getByText(/wells defined in Generator/)).toBeTruthy();

    // Switch back to Layout Generator
    const returnBtn = screen.getByText(/Return to Generator/);
    fireEvent.click(returnBtn);

    // Verify we are back in Layout Generator
    expect(screen.getByText(/ANSI \/ SLAS 1-2004 Microplate/)).toBeTruthy();
    expect(screen.getByText(/Plate Format/)).toBeTruthy();
  });
});
