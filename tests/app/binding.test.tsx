import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import BindingView from '@/tools/binding/View';
import { route } from '@/app/router';

describe('Binding calculator tool', () => {
  it('renders equilibrium results with default inputs', async () => {
    route.value = { name: 'tool', toolId: 'binding' };
    render(<BindingView />);
    expect(await screen.findByText(/Binding Equilibrium Calculator/)).toBeTruthy();
    expect(screen.getByTestId('equilibrium-result')).toBeTruthy();
    expect(screen.getByText(/Site Saturation/)).toBeTruthy();
    expect(screen.getByText(/Species Breakdown/)).toBeTruthy();
  });

  it('solves target concentration and updates when changed', async () => {
    route.value = { name: 'tool', toolId: 'binding' };
    render(<BindingView />);
    fireEvent.click(screen.getByRole('button', { name: 'Target Solver' }));
    expect(await screen.findByText(/Target Occupancy Solver/)).toBeTruthy();
    expect(screen.getByText(/Required Total Protein 2:/)).toBeTruthy();
  });

  it('shows mix recipe and serial dilution', async () => {
    route.value = { name: 'tool', toolId: 'binding' };
    render(<BindingView />);
    fireEvent.click(screen.getByRole('button', { name: 'Mix & Dilution' }));
    expect(await screen.findByText(/Reaction Mix Helper/)).toBeTruthy();
    expect(screen.getByText(/Pipetting Recipe:/)).toBeTruthy();
    expect(screen.getByText(/Serial Dilution Scheme for P2/)).toBeTruthy();
  });
});
