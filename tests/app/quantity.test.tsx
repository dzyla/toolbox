import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { useState } from 'preact/hooks';
import { Quantity, type QValue } from '@/app/components/Quantity';

function QuantityTestWrapper({ initial = { value: 1.0, unit: 'mM' } }: { initial?: QValue }) {
  const [q, setQ] = useState<QValue>(initial);
  return (
    <div>
      <Quantity
        id="test-q"
        label="Concentration"
        value={q}
        units={['mM', 'µM', '%', 'mg/mL']}
        onChange={setQ}
      />
      <span data-testid="val-out">{q.value}</span>
      <span data-testid="unit-out">{q.unit}</span>
    </div>
  );
}

describe('Quantity component float handling', () => {
  it('allows typing decimals without deleting the dot ("0" -> "0." -> "0.03")', () => {
    render(<QuantityTestWrapper initial={{ value: 0.5, unit: 'mM' }} />);
    const input = screen.getByLabelText('Concentration') as HTMLInputElement;

    fireEvent.input(input, { target: { value: '0' } });
    expect(input.value).toBe('0');

    fireEvent.input(input, { target: { value: '0.' } });
    expect(input.value).toBe('0.');
    expect(screen.getByTestId('val-out').textContent).toBe('0');

    fireEvent.input(input, { target: { value: '0.0' } });
    expect(input.value).toBe('0.0');
    expect(screen.getByTestId('val-out').textContent).toBe('0');

    fireEvent.input(input, { target: { value: '0.03' } });
    expect(input.value).toBe('0.03');
    expect(screen.getByTestId('val-out').textContent).toBe('0.03');
  });

  it('handles comma as decimal separator ("0,05" -> 0.05)', () => {
    render(<QuantityTestWrapper initial={{ value: 1.0, unit: 'mM' }} />);
    const input = screen.getByLabelText('Concentration') as HTMLInputElement;

    fireEvent.input(input, { target: { value: '0,05' } });
    expect(screen.getByTestId('val-out').textContent).toBe('0.05');
  });

  it('updates unit and value when user types full quantity string like "25 µM"', () => {
    render(<QuantityTestWrapper initial={{ value: 1.0, unit: 'mM' }} />);
    const input = screen.getByLabelText('Concentration') as HTMLInputElement;

    fireEvent.input(input, { target: { value: '25 µM' } });
    expect(screen.getByTestId('val-out').textContent).toBe('25');
    expect(screen.getByTestId('unit-out').textContent).toBe('µM');
  });
});
