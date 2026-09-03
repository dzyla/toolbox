import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { useState } from 'preact/hooks';
import { DecimalInput } from '@/app/components/DecimalInput';

function TestWrapper({ initial = 2.0, min, max, step }: { initial?: number; min?: number; max?: number; step?: number | string }) {
  const [val, setVal] = useState(initial);
  return (
    <div>
      <label for="dec-test">Value</label>
      <DecimalInput
        id="dec-test"
        value={val}
        onChange={setVal}
        min={min}
        max={max}
        step={step}
      />
      <span data-testid="val-out">{val}</span>
    </div>
  );
}

describe('DecimalInput component', () => {
  it('preserves decimal point during typing ("2" -> "2." -> "2.3")', () => {
    render(<TestWrapper initial={2.0} />);
    const input = screen.getByLabelText('Value') as HTMLInputElement;

    fireEvent.input(input, { target: { value: '2' } });
    expect(input.value).toBe('2');

    fireEvent.input(input, { target: { value: '2.' } });
    expect(input.value).toBe('2.');
    expect(screen.getByTestId('val-out').textContent).toBe('2');

    fireEvent.input(input, { target: { value: '2.3' } });
    expect(input.value).toBe('2.3');
    expect(screen.getByTestId('val-out').textContent).toBe('2.3');
  });

  it('supports comma decimal separator ("2,3" -> 2.3)', () => {
    render(<TestWrapper initial={1.0} />);
    const input = screen.getByLabelText('Value') as HTMLInputElement;

    fireEvent.input(input, { target: { value: '2,3' } });
    expect(screen.getByTestId('val-out').textContent).toBe('2.3');
  });

  it('supports arrow keys increment/decrement', () => {
    render(<TestWrapper initial={2.3} step={0.1} />);
    const input = screen.getByLabelText('Value') as HTMLInputElement;

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('2.4');
    expect(screen.getByTestId('val-out').textContent).toBe('2.4');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('2.3');
  });

  it('restores previous valid value on blur if invalid text is typed', () => {
    render(<TestWrapper initial={2.3} />);
    const input = screen.getByLabelText('Value') as HTMLInputElement;

    fireEvent.input(input, { target: { value: 'invalid' } });
    fireEvent.blur(input);
    expect(input.value).toBe('2.3');
  });
});
