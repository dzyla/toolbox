import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import UnitConverter from '@/tools/unit-converter/View';
import { route } from '@/app/router';

describe('Unit Converter view', () => {
  it('converts the default and switches dimension', async () => {
    route.value = { name: 'tool', toolId: 'unit-converter' };
    render(<UnitConverter />);
    // default: 10 mM concentration
    expect((await screen.findByTestId('result')).textContent).toContain('10 mM');
    expect(screen.getByText('0.01 M')).toBeTruthy();

    // switch to radioactivity → 1 µCi = 3.7e4 Bq = 37 kBq
    const rad = screen.getByRole('button', { name: 'Radioactivity' });
    fireEvent.click(rad);
    expect((await screen.findAllByText('37 kBq')).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findByTestId('result')).textContent).toContain('1 µCi');
  });

  it('shows a prompt when the value is empty', async () => {
    route.value = { name: 'tool', toolId: 'unit-converter' };
    render(<UnitConverter />);
    const input = screen.getByLabelText('Value');
    fireEvent.input(input, { target: { value: '' } });
    expect(await screen.findByText(/Enter a number/)).toBeTruthy();
  });
});
