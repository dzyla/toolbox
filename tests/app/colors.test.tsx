import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import View from '@/tools/colors/View';
import { route } from '@/app/router';

describe('Figure Colours tool', () => {
  it('renders the default viridis palette beside a deuteranopia simulation', async () => {
    route.value = { name: 'tool', toolId: 'colors' };
    render(<View />);
    const normal = await screen.findByRole('region', { name: 'Normal vision' });
    expect(normal.querySelectorAll('button[aria-label^="Copy #"]')).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Copy #440154' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy #fde725' })).toBeTruthy();
    const deut = screen.getByRole('region', { name: 'Deuteranopia' });
    expect(deut.querySelectorAll('button[aria-label*="simulated from"]').length).toBeGreaterThan(0);
    expect(screen.getByTestId('pymol').textContent).toMatch(/set_color color_1, \[0\.267, 0\.004, 0\.329\]/);
  });
  it('updates count, toggles simulations and opens variations on click', async () => {
    route.value = { name: 'tool', toolId: 'colors' };
    render(<View />);
    fireEvent.input(screen.getByLabelText(/Number of colours/), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Normal vision' }).querySelectorAll('button[aria-label^="Copy #"]')).toHaveLength(3));
    fireEvent.click(screen.getByLabelText('Protanopia'));
    expect(await screen.findByRole('region', { name: 'Protanopia' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy #440154' }));
    const vars = await screen.findByRole('region', { name: 'Variations' });
    expect(vars.textContent).toMatch(/Tints/);
    expect(vars.textContent).toMatch(/vs white/);
    expect(vars.querySelectorAll('button[aria-label^="Copy #"]')).toHaveLength(15);
  });
  it('categorical schemes fix the count and unknown custom colours show an inline error', async () => {
    route.value = { name: 'tool', toolId: 'colors' };
    render(<View />);
    fireEvent.change(screen.getByLabelText('Scheme'), { target: { value: 'set1' } });
    await waitFor(() => expect((screen.getByLabelText(/Number of colours/) as HTMLInputElement).disabled).toBe(true));
    expect(screen.getByRole('region', { name: 'Normal vision' }).querySelectorAll('button[aria-label^="Copy #"]')).toHaveLength(9);
    fireEvent.input(screen.getByLabelText('Variations of any colour'), { target: { value: 'not-a-colour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Not a colour/);
  });
});
