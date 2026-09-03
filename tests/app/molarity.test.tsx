import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import View from '@/tools/molarity/View';
import { route } from '@/app/router';

describe('Molarity tool', () => {
  it('computes mass with defaults and updates on input', async () => {
    route.value = { name: 'tool', toolId: 'molarity' };
    render(<View />);
    expect((await screen.findByTestId('result')).textContent).toMatch(/292\.2 mg/);
    fireEvent.input(screen.getByLabelText('Target concentration'), { target: { value: '1 M' } });
    await waitFor(() => expect(screen.getByTestId('result').textContent).toMatch(/29\.22 g/));
  });
  it('solves a dilution and reports impossible ones', async () => {
    route.value = { name: 'tool', toolId: 'molarity' };
    render(<View />);
    fireEvent.click(screen.getByRole('button', { name: /Dilution/ }));
    await waitFor(() => expect(screen.getByTestId('result').textContent).toMatch(/Take 1 mL of 1 M stock and add 9 mL/));
    fireEvent.input(screen.getByLabelText('Final concentration (C2)'), { target: { value: '2 M' } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/cannot concentrate/));
  });
  it('plans an equal-volume serial dilution', async () => {
    route.value = { name: 'tool', toolId: 'molarity' };
    render(<View />);
    fireEvent.click(screen.getByRole('button', { name: 'Serial dilution' }));
    expect(await screen.findByRole('cell', { name: 'Well 1' })).toBeTruthy();
    expect(screen.getByTestId('serial-results').textContent).toMatch(/200 µL/);
    expect(screen.getByTestId('serial-results').textContent).toMatch(/12\.5 mM/);
  });
});
