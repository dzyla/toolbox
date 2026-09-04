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
 * Parses numeric strings including standard numbers, scientific notation (e.g. 1.3e6),
 * and common user notations like "1.3 10 6", "1.3 10^6", "1.3 x 10^6", "1.3 * 10^6", "1.3×10^6".
 */
export function parseScientificNumber(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim().replace(',', '.');
  if (!s) return null;

  // Direct numeric conversion (handles "123", "0.5", "1.3e6", "1.3E-4")
  const direct = Number(s);
  if (Number.isFinite(direct)) {
    return direct;
  }

  // Handle patterns like:
  // "1.3 10 6", "1.3 10^6", "1.3 * 10^6", "1.3 x 10^6", "1.3 × 10^6", "1.3x10^6", "1.3*10^6", "1.3*10^-6", "1.3 10 -6"
  const matchWithBase = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(?:[xX*×]\s*)?10(?:\^|\s+)?([+-]?\d+)$/);
  if (matchWithBase) {
    const base = parseFloat(matchWithBase[1]!);
    const exp = parseInt(matchWithBase[2]!, 10);
    if (Number.isFinite(base) && Number.isFinite(exp)) {
      return base * Math.pow(10, exp);
    }
  }

  // Handle "10^6" or "10 6" or "10^-5" (implicit base 1)
  const matchPure10 = s.match(/^([+-]?)10(?:\^|\s+)?([+-]?\d+)$/);
  if (matchPure10) {
    const sign = matchPure10[1] === '-' ? -1 : 1;
    const exp = parseInt(matchPure10[2]!, 10);
    if (Number.isFinite(exp)) {
      return sign * Math.pow(10, exp);
    }
  }

  return null;
}

/**
 * Text-based decimal number input that cleanly preserves intermediate typing states
 * (e.g. typing "2.", "0.", or "-") and supports scientific notation and exponent formats (e.g. "1.3 10 6").
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
    const currentNum = parseScientificNumber(text);
    if (Number.isFinite(value) && (currentNum === null || Math.abs(currentNum - value) > 1e-9)) {
      setText(String(value));
    }
  }, [value]);

  const handleInput = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const raw = (e.currentTarget as HTMLInputElement).value;
    setText(raw);
    const cleaned = raw.replace(',', '.').trim();

    // Preserve typing in progress for decimal point, negative sign, or intermediate exponent notation
    if (
      cleaned === '' ||
      cleaned === '-' ||
      cleaned === '.' ||
      cleaned.endsWith('.') ||
      cleaned.endsWith('e') ||
      cleaned.endsWith('e-') ||
      cleaned.endsWith('e+') ||
      cleaned.endsWith('10') ||
      cleaned.endsWith('10^') ||
      cleaned.endsWith('x') ||
      cleaned.endsWith('*') ||
      cleaned.endsWith('×') ||
      cleaned.endsWith(' ') ||
      cleaned.endsWith('^')
    ) {
      const parsed = parseScientificNumber(cleaned) ?? parseFloat(cleaned);
      if (Number.isFinite(parsed)) {
        if (min !== undefined && parsed < min) return;
        if (max !== undefined && parsed > max) return;
        onChange(parsed);
      }
      return;
    }

    const num = parseScientificNumber(cleaned);
    if (num !== null && Number.isFinite(num)) {
      if (min !== undefined && num < min) return;
      if (max !== undefined && num > max) return;
      onChange(num);
    }
  };

  const handleBlur = () => {
    const cleaned = text.replace(',', '.').trim();
    if (!cleaned) {
      setText(Number.isFinite(value) ? String(value) : '');
      return;
    }
    const num = parseScientificNumber(cleaned);
    if (num !== null && Number.isFinite(num) && (min === undefined || num >= min) && (max === undefined || num <= max)) {
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
