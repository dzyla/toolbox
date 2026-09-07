import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import DsfView from '@/tools/dsf/View';
import { route } from '@/app/router';

describe('DSF / nanoDSF Tool View UI', () => {
  it('renders Thermal Shift Assay tool layout with Lysozyme benchmark demo', () => {
    route.value = { name: 'tool', toolId: 'dsf' };
    render(<DsfView />);

    expect(screen.getByText(/Thermal Shift Assay \(DSF \/ nanoDSF\)/)).toBeTruthy();
    expect(screen.getByTestId('reference-tm')).toBeTruthy();
    expect(screen.getByTestId('top-hit-shift')).toBeTruthy();

    // Verify benchmark Lysozyme results appear in table/cards
    expect(screen.getAllByText(/Lysozyme Control \(Buffer\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+ NAG3 Trimer/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Condition Ranking Table/)).toBeTruthy();
  });

  it('allows switching to nanoDSF preset and toggling Tm method', () => {
    route.value = { name: 'tool', toolId: 'dsf' };
    render(<DsfView />);

    const nanoBtn = screen.getByRole('button', { name: /mAb Fab Screening \(nanoDSF Ratio/i });
    fireEvent.click(nanoBtn);

    expect(screen.getAllByText(/mAb Apo \(Vehicle DMSO\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+ Fragment A \(100 µM\)/).length).toBeGreaterThan(0);

    // Toggle Tm calculation method
    const select = screen.getByLabelText(/Melting Temperature \(Tm\) Method/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'boltzmann' } });
    expect(select.value).toBe('boltzmann');
  });

  it('renders dual inline SVG charts for melt curve and first derivative', () => {
    route.value = { name: 'tool', toolId: 'dsf' };
    const { container } = render(<DsfView />);

    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Thermal Denaturation Melt Curves F\(T\)/)).toBeTruthy();
    expect(screen.getByText(/Numerical First Derivative dF\/dT/)).toBeTruthy();
  });

  it('loads Prometheus 24-capillary preset, filters channels, and toggles trace selection', () => {
    route.value = { name: 'tool', toolId: 'dsf' };
    render(<DsfView />);

    // Click Prometheus preset button
    const promBtn = screen.getByRole('button', { name: /Prometheus 24-Capillary High-Density Screen/i });
    fireEvent.click(promBtn);

    // Verify Prometheus capillaries appear
    expect(screen.getAllByText(/Capillary 1: Apo Control/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Capillary 3: \+ Lead Hit A/i).length).toBeGreaterThan(0);

    // Verify channel filter buttons are present
    expect(screen.getByRole('button', { name: /^All Channels$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Ratio \(350\/330\)$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^330 nm$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^350 nm$/i })).toBeTruthy();

    // Click 'Select All'
    const selectAllBtn = screen.getByRole('button', { name: /^Select All$/i });
    fireEvent.click(selectAllBtn);
    expect(screen.getByText(/24 \/ 24 active/i)).toBeTruthy();

    // Click 'Deselect All'
    const deselectBtn = screen.getByRole('button', { name: /^Deselect All$/i });
    fireEvent.click(deselectBtn);
    expect(screen.getByText(/No Traces Selected/i)).toBeTruthy();

    // Click 'Select All Traces' in empty state
    const restoreAllBtn = screen.getByRole('button', { name: /Select All Traces \(24\)/i });
    fireEvent.click(restoreAllBtn);
    expect(screen.getByText(/24 of 24 traces active/i)).toBeTruthy();

    // Click 'Solo' on the first trace
    const soloBtns = screen.getAllByRole('button', { name: /^Solo$/i });
    expect(soloBtns.length).toBeGreaterThan(0);
    fireEvent.click(soloBtns[0]!);
    expect(screen.getByText(/1 \/ 24 active/i)).toBeTruthy();

    // Click Autoscale View
    const autoscaleBtn = screen.getByRole('button', { name: /Autoscale View/i });
    fireEvent.click(autoscaleBtn);
    expect(autoscaleBtn).toBeTruthy();
  });

  it('supports temperature crop window and shows/hides residuals plot', () => {
    route.value = { name: 'tool', toolId: 'dsf' };
    const { container } = render(<DsfView />);

    // Toggle residuals checkbox
    const residCheckbox = screen.getByLabelText(/Show Fit Residuals Plot/i) as HTMLInputElement;
    fireEvent.click(residCheckbox);
    expect(residCheckbox.checked).toBe(true);

    // Expect 3 SVGs now (Melt, Deriv, Residuals)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(3);

    // Enter temperature crop
    const minInput = screen.getByPlaceholderText(/Min T/i) as HTMLInputElement;
    fireEvent.change(minInput, { target: { value: '45' } });
    expect(minInput.value).toBe('45');

    // Click Reset Crop
    const resetCropBtn = screen.getByRole('button', { name: /Reset Crop/i });
    fireEvent.click(resetCropBtn);
    expect(minInput.value).toBe('');
  });

  it('detects and renders multiple peaks with positive (+) and negative (-) signs in UI and SVG, and allows removing false peaks', () => {
    route.value = { name: 'tool', toolId: 'dsf' };
    const { container } = render(<DsfView />);

    // Generate custom dataset with 2 transitions: upward melt at 55C (+), downward trough at 75C (-)
    const temps: number[] = [];
    const fls: number[] = [];
    for (let t = 40; t <= 90; t += 1.0) {
      temps.push(t);
      const sig1 = 500 / (1 + Math.exp(-(t - 55) / 1.5));
      const sig2 = -400 / (1 + Math.exp(-(t - 75) / 1.5));
      fls.push(100 + sig1 + sig2);
    }
    const csvLines = ['Temperature,ComplexTarget'];
    for (let i = 0; i < temps.length; i++) {
      csvLines.push(`${temps[i]},${fls[i]?.toFixed(1)}`);
    }

    const textarea = screen.getByPlaceholderText(/Temperature,Control,Ligand_1/i) as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: csvLines.join('\n') } });

    // Transition direction dropdown: select 'both' to search both signs
    const dirSelect = screen.getByLabelText(/Transition Direction & Sign Detection/i) as HTMLSelectElement;
    fireEvent.change(dirSelect, { target: { value: 'both' } });
    expect(dirSelect.value).toBe('both');

    // Sensitivity dropdown should be accessible
    const sensSelect = screen.getByLabelText(/Peak Detection Sensitivity/i) as HTMLSelectElement;
    fireEvent.change(sensSelect, { target: { value: '0.08' } });
    expect(sensSelect.value).toBe('0.08');

    // The ranking table should show Transition Peaks (+/−)
    expect(screen.getByText(/Transition Peaks \(\+\/−\)/i)).toBeTruthy();

    // Inspect section should show both + and - peaks
    expect(screen.getByText(/Detected Transition Peaks & Troughs/i)).toBeTruthy();
    expect(screen.getAllByText(/\+Tm1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/-Tm2/i).length).toBeGreaterThan(0);

    // SVG should have peak markers for both
    const posMarker = container.querySelector('[data-testid="peak-marker-+Tm1"]');
    const negMarker = container.querySelector('[data-testid="peak-marker--Tm2"]');
    expect(posMarker).toBeTruthy();
    expect(negMarker).toBeTruthy();

    // Test removing false peak: click remove button on -Tm2
    const removeNegBtns = screen.getAllByLabelText(/Remove false peak -Tm2/i);
    expect(removeNegBtns.length).toBeGreaterThan(0);
    fireEvent.click(removeNegBtns[0]!);

    // Verify -Tm2 was removed and Restore button appears
    const restoreBtn = screen.getByRole('button', { name: /Restore Removed Peaks/i });
    expect(restoreBtn).toBeTruthy();

    // Click Restore button
    fireEvent.click(restoreBtn);
    expect(screen.getAllByText(/-Tm2/i).length).toBeGreaterThan(0);
  });
});
