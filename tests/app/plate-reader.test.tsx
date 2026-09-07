import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import PlateReaderView from '@/tools/plate-reader/View';
import { route } from '@/app/router';

describe('Plate Reader & Normalization Tool View', () => {
  it('renders with default Tecan 96-well dose-response and interactive heatmap', async () => {
    route.value = { name: 'tool', toolId: 'plate-reader' };
    render(<PlateReaderView />);

    expect((await screen.findAllByText(/Plate Reader CSV Processor & Normalization/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Load Plate Data/)).toBeTruthy();
    expect(screen.getByText(/Normalization Engine/)).toBeTruthy();
    expect(screen.getByText(/🗺️ Plate Heatmap/)).toBeTruthy();
    expect(screen.getByText(/📊 Replicate Statistics/)).toBeTruthy();
    expect(screen.getByText(/📈 Curve Fitting Export/)).toBeTruthy();

    // Verify well D4 (the outlier) is rendered
    expect(screen.getByTitle(/Well D4/)).toBeTruthy();
  });

  it('switches navigation tabs and displays replicate statistics table', async () => {
    route.value = { name: 'tool', toolId: 'plate-reader' };
    render(<PlateReaderView />);

    const tableTab = screen.getByRole('button', { name: /📊 Replicate Statistics/ });
    fireEvent.click(tableTab);

    // Group names from dose-response preset should be visible in table
    expect(screen.getByText('Media Blank')).toBeTruthy();
    expect(screen.getByText('Positive Control (Lysis 100%)')).toBeTruthy();
    expect(screen.getByText('100 µM')).toBeTruthy();
  });

  it('switches to Curve Fitting tab with copy and redirect affordances', async () => {
    route.value = { name: 'tool', toolId: 'plate-reader' };
    render(<PlateReaderView />);

    const cfTab = screen.getByRole('button', { name: /📈 Curve Fitting Export/ });
    fireEvent.click(cfTab);

    expect(screen.getByText(/Direct Pipeline to Non-Linear Curve Fitting/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open in Curve Fitting/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy Table/ })).toBeTruthy();
  });

  it('loads 384-well BioTek HTS preset and displays 384-well dimensions and Z-prime', async () => {
    route.value = { name: 'tool', toolId: 'plate-reader' };
    render(<PlateReaderView />);

    const biotekBtn = screen.getByRole('button', { name: /BioTek 384/ });
    fireEvent.click(biotekBtn);

    expect(await screen.findByText(/384-Well/)).toBeTruthy();
    // Z-factor should be visible in dashboard card and science panel
    expect((await screen.findAllByText(/Z'-Factor/)).length).toBeGreaterThanOrEqual(1);
  });

  it('allows clicking a well to inspect it and toggles exclusion', async () => {
    route.value = { name: 'tool', toolId: 'plate-reader' };
    render(<PlateReaderView />);

    const wellD4 = screen.getByTitle(/Well D4/);
    fireEvent.click(wellD4);

    // Inspector card should be visible
    expect(screen.getByText(/Raw Signal:/)).toBeTruthy();
    const excludeBtn = screen.getByRole('button', { name: /Exclude Well/ });
    fireEvent.click(excludeBtn);

    expect(await screen.findByText(/Include Well in Statistics/)).toBeTruthy();
  });

  it('switches normalization modes', async () => {
    route.value = { name: 'tool', toolId: 'plate-reader' };
    render(<PlateReaderView />);

    const rawBtn = screen.getByRole('button', { name: /Raw Optical Density/ });
    fireEvent.click(rawBtn);

    const pocBtn = screen.getByRole('button', { name: /% of Control/ });
    fireEvent.click(pocBtn);
  });

  it('handles unannotated raw data preset without forcing arbitrary layout', async () => {
    route.value = { name: 'tool', toolId: 'plate-reader' };
    render(<PlateReaderView />);

    const rawPresetBtn = screen.getByRole('button', { name: /Raw 96 Only/ });
    fireEvent.click(rawPresetBtn);

    // Should indicate unannotated raw plate
    expect(await screen.findByText(/No Layout \(Raw Only\)/)).toBeTruthy();

    // Verify well A1 is rendered with raw signal
    expect(screen.getByTitle(/^Well A1:/)).toBeTruthy();
  });

  it('navigates to Layout tab and allows viewing layout definitions', async () => {
    route.value = { name: 'tool', toolId: 'plate-reader' };
    render(<PlateReaderView />);

    const layoutTab = screen.getByRole('button', { name: /📐 Layout & Annotations/ });
    fireEvent.click(layoutTab);

    // Should show layout ingestion options
    expect(screen.getByText(/Upload or Paste Annotation Matrix/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload Layout CSV/ })).toBeTruthy();
    expect(screen.getByText(/Interactive Visual Plate Painter/)).toBeTruthy();
  });

  it('switches to ELISA tab and displays standard curve regression and sample quantification', async () => {
    route.value = { name: 'tool', toolId: 'plate-reader' };
    render(<PlateReaderView />);

    const elisaPresetBtn = screen.getByRole('button', { name: /ELISA 96/ });
    fireEvent.click(elisaPresetBtn);

    // Should show standard curve calibration elements
    expect(await screen.findByText(/ELISA Standard Calibration Curve/)).toBeTruthy();
    expect(screen.getByText(/Standard Curve Calibrators/)).toBeTruthy();
    expect(screen.getByText(/Unknown Samples Quantified/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy ELISA CSV/ })).toBeTruthy();
  });
});
