import { useState, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';

export interface DecimalInputProps extends Omit<JSX.HTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onInput'> {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  name?: string;
}

/**
 * Text-based decimal number input that cleanly preserves intermediate typing states
 * (e.g. typing "2.", "0.", or "-") without resetting to 0 or wiping the decimal point.
 */
export function DecimalInput({
  value,
  onChange,
  class: className,
  min,
  max,
  step = 'any',
  ...rest
}: DecimalInputProps) {
  const [text, setText] = useState<string>(() => (Number.isFinite(value) ? String(value) : ''));

  // Sync external state updates (e.g. from preset buttons or reset actions)
  useEffect(() => {
    const currentNum = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(value) && (isNaN(currentNum) || Math.abs(currentNum - value) > 1e-9)) {
      setText(String(value));
    }
  }, [value]);

  const handleInput = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const raw = (e.currentTarget as HTMLInputElement).value;
    setText(raw);
    const cleaned = raw.replace(',', '.').trim();

    // Preserve typing in progress for decimal point, negative sign, or exponential notation
    if (
      cleaned === '' ||
      cleaned === '-' ||
      cleaned === '.' ||
      cleaned.endsWith('.') ||
      cleaned.endsWith('e') ||
      cleaned.endsWith('e-') ||
      cleaned.endsWith('e+')
    ) {
      const parsed = parseFloat(cleaned);
      if (Number.isFinite(parsed)) {
        if (min !== undefined && parsed < min) return;
        if (max !== undefined && parsed > max) return;
        onChange(parsed);
      }
      return;
    }

    const num = Number(cleaned);
    if (Number.isFinite(num)) {
      if (min !== undefined && num < min) return;
      if (max !== undefined && num > max) return;
      onChange(num);
    }
  };

  const handleBlur = () => {
    const cleaned = text.replace(',', '.').trim();
    const num = Number(cleaned);
    if (Number.isFinite(num) && (min === undefined || num >= min) && (max === undefined || num <= max)) {
      setText(String(num));
      onChange(num);
    } else if (Number.isFinite(value)) {
      setText(String(value));
    }
  };

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const stepVal = typeof step === 'number' ? step : (parseFloat(String(step)) || 0.1);
      const cur = parseFloat(text.replace(',', '.')) || 0;
      const next = e.key === 'ArrowUp' ? cur + stepVal : cur - stepVal;
      const clamped = min !== undefined ? Math.max(min, next) : next;
      const rounded = Math.round(clamped * 100000) / 100000;
      setText(String(rounded));
      onChange(rounded);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      class={className}
      value={text}
      onInput={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      {...rest}
    />
  );
}
