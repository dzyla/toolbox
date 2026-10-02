import type { ComponentChildren } from 'preact';

export const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
export const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} class="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          class={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${value === o.value ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Number input with a visible caption. An empty field becomes NaN so the core can report it. */
export function NumberField({ label, ariaLabel, value, onValue, step = 'any', min, placeholder, children }: {
  label: string; ariaLabel?: string; value: number | undefined; onValue: (n: number) => void;
  step?: string; min?: string; placeholder?: string; children?: ComponentChildren;
}) {
  return (
    <div>
      <span class={labelClass}>{label}</span>
      <input
        aria-label={ariaLabel ?? label}
        type="number"
        step={step}
        min={min}
        placeholder={placeholder}
        value={value === undefined || Number.isNaN(value) ? '' : value}
        onInput={event => { const v = (event.target as HTMLInputElement).value; onValue(v === '' ? NaN : Number(v)); }}
        class={`${fieldClass} mono py-1.5 text-xs`}
      />
      {children}
    </div>
  );
}
