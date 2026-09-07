import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import CultureView from '@/tools/culture/View';

describe('Cell Culture & Passaging View', () => {
  it('renders with cell line preset selector and passaging inputs', () => {
    render(<CultureView />);

    expect(screen.getByRole('heading', { name: /Cell Culture & Passaging/i })).toBeTruthy();
    expect(screen.getByLabelText('Cell Line Preset')).toBeTruthy();
    expect(screen.getByText(/HEK293T/i)).toBeTruthy();
    expect(screen.getByTestId('suspension-vol')).toBeTruthy();
  });

  it('updates target seeding density when selecting different cell line presets', () => {
    render(<CultureView />);

    const presetSelect = screen.getByLabelText('Cell Line Preset');
    // Change to HeLa (recommended 10,000 cells/cm²)
    fireEvent.change(presetSelect, { target: { value: 'hela' } });
    expect(screen.getByText(/Human epithelial adenocarcinoma/i)).toBeTruthy();

    // Change to Drosophila S2 (recommended 30,000 cells/cm²)
    fireEvent.change(presetSelect, { target: { value: 'drosophila-s2' } });
    expect(screen.getByText(/Schneider 2 embryonic macrophage-like/i)).toBeTruthy();
  });

  it('provides mobile exponent quick pills to scale values', () => {
    render(<CultureView />);

    // Find exponent pills (e.g. ×10⁶)
    const exp6Btns = screen.getAllByRole('button', { name: /×10⁶/i });
    expect(exp6Btns.length).toBeGreaterThan(0);

    // Clicking an exponent button scales the value
    fireEvent.click(exp6Btns[0]!);
    expect(screen.getByTestId('suspension-vol')).toBeTruthy();
  });

  it('switches to doubling time tab and shows benchmark comparison', () => {
    render(<CultureView />);

    const doublingTabBtn = screen.getByRole('button', { name: /Doubling Time & Growth/i });
    fireEvent.click(doublingTabBtn);

    expect(screen.getByTestId('doubling-time')).toBeTruthy();
    expect(screen.getByText(/Literature Benchmark Comparison/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Prefill with .* 48-hour growth model/i })).toBeTruthy();
  });

  it('supports multi-point observations and computes log-linear regression fit', () => {
    render(<CultureView />);

    const doublingTabBtn = screen.getByRole('button', { name: /Doubling Time & Growth/i });
    fireEvent.click(doublingTabBtn);

    const multiBtn = screen.getByRole('button', { name: /Multi-Point Observations/i });
    fireEvent.click(multiBtn);

    expect(screen.getByText(/Growth Observations Table/i)).toBeTruthy();
    expect(screen.getByTestId('multipoint-td')).toBeTruthy();
    expect(screen.getByText(/Target Availability Forecast/i)).toBeTruthy();
    expect(screen.getByText(/Observation Residuals & Exponential Fit/i)).toBeTruthy();
  });

  it('switches to harvest predictor tab and displays target ready date and window', () => {
    render(<CultureView />);

    const harvestTabBtn = screen.getByRole('button', { name: /Harvest Predictor/i });
    fireEvent.click(harvestTabBtn);

    expect(screen.getByText(/Harvest Time & Date Forecaster/i)).toBeTruthy();
    expect(screen.getByTestId('target-ready-datetime')).toBeTruthy();
    expect(screen.getByText(/Biological Variation Tolerance Window/i)).toBeTruthy();
    expect(screen.getByText(/Earliest Availability/i)).toBeTruthy();
    expect(screen.getByText(/Latest Availability/i)).toBeTruthy();
  });
});
