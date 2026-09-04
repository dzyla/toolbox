import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import MeasureView from '@/tools/measure/View';
import { route } from '@/app/router';

describe('MeasureView Zoom & Coordinate Rescaling', () => {
  it('renders Image Measurer with zoom toolbar controls', () => {
    route.value = { name: 'tool', toolId: 'measure' };
    render(<MeasureView />);

    expect(screen.getByText(/Image Measurer & Scale Calibration/)).toBeTruthy();
    expect(screen.getByLabelText('Zoom Out')).toBeTruthy();
    expect(screen.getByLabelText('Zoom In')).toBeTruthy();
    expect(screen.getByLabelText('Zoom Level')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '100%' })).toBeTruthy();
  });

  it('updates zoom level when clicking zoom in, out, and presets', () => {
    route.value = { name: 'tool', toolId: 'measure' };
    render(<MeasureView />);

    const zoomSelect = screen.getByLabelText('Zoom Level') as HTMLSelectElement;
    expect(zoomSelect.value).toBe('fit');

    // Select 200% zoom
    fireEvent.change(zoomSelect, { target: { value: '2' } });
    expect(zoomSelect.value).toBe('2');

    // Zoom in (+25%)
    const zoomInBtn = screen.getByLabelText('Zoom In');
    fireEvent.click(zoomInBtn);
    expect(zoomSelect.value).toBe('2.25');

    // Click 100% button
    const btn100 = screen.getByRole('button', { name: '100%' });
    fireEvent.click(btn100);
    expect(zoomSelect.value).toBe('1');

    // Click Fit button
    const fitBtn = screen.getByRole('button', { name: 'Fit' });
    fireEvent.click(fitBtn);
    expect(zoomSelect.value).toBe('fit');
  });
});
