import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import GelView from '@/tools/gel/View';

describe('Gel Mass Densitometry UI', () => {
  beforeEach(() => {
    window.alert = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows calibrating mass densitometry and viewing mass curve', async () => {
    render(<GelView />);

    // Switch to calibration view
    const calTab = screen.getByRole('button', { name: /MW Calibration /i });
    fireEvent.click(calTab);

    // Click Mass / Densitometry (ng) subtab
    const massSubTab = screen.getByRole('button', { name: /Mass \/ Densitometry \(ng\)/i });
    fireEvent.click(massSubTab);

    expect(screen.getByText(/Mass Densitometry Calibration Curve/i)).toBeTruthy();

    // Select Lane 1 as standard lane
    const standardSelects = screen.getAllByRole('combobox');
    // Find the standard lane select
    const laneSelect = standardSelects.find(s => (s as HTMLSelectElement).value === '' || (s as HTMLSelectElement).options.length > 3);
    if (laneSelect) {
      fireEvent.change(laneSelect, { target: { value: 'l1' } });
    }

    // Check that mass curve or standards table renders
    const massLabel = screen.queryByText(/Known Mass/i);
    expect(massLabel).toBeTruthy();
  });
});
