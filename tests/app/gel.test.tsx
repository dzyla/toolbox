import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import GelView from '@/tools/gel/View';
import { route } from '@/app/router';

describe('Gel and Blot analysis tool view', () => {
  it('renders gel tool with default demo gel and quantification table', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    expect(await screen.findByText(/Gel & Blot Analysis/)).toBeTruthy();
    expect(screen.getByText(/Image Source/)).toBeTruthy();
    expect(screen.getByText(/Molecular Weight Calibration/)).toBeTruthy();
    expect(screen.getByText(/Densitometry Profile/)).toBeTruthy();
    expect(screen.getByText(/Band Quantification/)).toBeTruthy();
  });

  it('allows clicking Auto-Find Lanes and Reload Demo Gel', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    const autoFindBtn = screen.getByRole('button', { name: 'Auto-Find Lanes' });
    fireEvent.click(autoFindBtn);

    const demoBtn = screen.getByRole('button', { name: 'Load Demo Gel' });
    fireEvent.click(demoBtn);

    expect(screen.getByText(/demo_gel\.png/)).toBeTruthy();
  });

  it('switches views to MW calibration curve and all-lanes quantification table', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Switch to MW Calibration Curve
    const calTab = screen.getByRole('button', { name: /MW Calibration Curve/ });
    fireEvent.click(calTab);
    expect(screen.getByText(/Molecular Weight Calibration Curve/)).toBeTruthy();
    expect(screen.getByText(/Migration Distance Y along Lane/)).toBeTruthy();

    // Switch to All-Lanes Band Quantification
    const quantTab = screen.getByRole('button', { name: /Band Quantification & Amounts/ });
    fireEvent.click(quantTab);
    expect(screen.getByText(/Net Intensity \(Amount\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export All Lanes CSV/ })).toBeTruthy();
  });

  it('selects lane when canvas is clicked', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    const canvas = screen.getByTitle(/Click directly on any lane to select it/);
    expect(canvas).toBeTruthy();

    // Mock getBoundingClientRect
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 400,
      bottom: 500,
      width: 400,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Click near center
    fireEvent.click(canvas, { clientX: 200, clientY: 250 });
    expect(await screen.findByText(/Densitometry Profile/)).toBeTruthy();
  });
});
