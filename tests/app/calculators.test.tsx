import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { route } from '@/app/router';
import BuffersView from '@/tools/buffers/View';
import CentrifugeView from '@/tools/centrifuge/View';
import MasterMixView from '@/tools/master-mix/View';
import AmmoniumSulfateView from '@/tools/ammonium-sulfate/View';

describe('calculator tools', () => {
  it('builds a buffer recipe and requires explicit hydrate selection', async () => {
    route.value = { name: 'tool', toolId: 'buffers' };
    render(<BuffersView />);
    expect(screen.getByTestId('buffer-results').textContent).toMatch(/605\.7 mg/);

    fireEvent.input(screen.getByLabelText('Chemical search'), { target: { value: 'MgCl2' } });
    expect((screen.getByLabelText('Molecular weight') as HTMLInputElement).value).toBe('121.14');
    expect(screen.getByRole('button', { name: /Magnesium Chloride.*hexahydrate/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Magnesium Chloride.*anhydrous/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Magnesium Chloride.*hexahydrate/ }));
    expect((screen.getByLabelText('Molecular weight') as HTMLInputElement).value).toBe('203.3');
    expect((screen.getByLabelText('Additional waters') as HTMLInputElement).disabled).toBe(true);
  });

  it('loads the audited TAE preset', async () => {
    route.value = { name: 'tool', toolId: 'buffers' };
    render(<BuffersView />);
    fireEvent.change(screen.getByLabelText('Recipe preset'), { target: { value: 'TAE_1x' } });
    await waitFor(() => expect(screen.getByTestId('buffer-results').textContent).toMatch(/1\.14 mL/));
  });

  it('converts RPM to RCF and displays k-factor and pelleting time', () => {
    route.value = { name: 'tool', toolId: 'centrifuge' };
    render(<CentrifugeView />);
    expect(screen.getByTestId('centrifuge-result').textContent).toMatch(/11,?180/);
    expect(screen.getByTestId('k-result').textContent).toMatch(/95/);
    expect(screen.getByText(/0\.95\d* h/)).toBeTruthy();
  });

  it('renders a scalable master mix with CSV export', () => {
    route.value = { name: 'tool', toolId: 'master-mix' };
    render(<MasterMixView />);
    expect(screen.getByTestId('mastermix-results').textContent).toMatch(/198(?:\.0)? µL/);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy();
    expect(screen.getByText(/Science: Master mix/)).toBeTruthy();
  });

  it('switches ammonium sulfate temperature tables and validates the cut', async () => {
    route.value = { name: 'tool', toolId: 'ammonium-sulfate' };
    render(<AmmoniumSulfateView />);
    expect(screen.getByTestId('ammonium-result').textContent).toMatch(/313\.5 g/);
    fireEvent.change(screen.getByLabelText('Temperature'), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByTestId('ammonium-result').textContent).toMatch(/297\.7 g/));
    fireEvent.input(screen.getByLabelText('Target saturation'), { target: { value: '0' } });
    expect(screen.getByRole('alert').textContent).toMatch(/exceed/);
  });
});
