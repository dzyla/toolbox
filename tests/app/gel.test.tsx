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
});
