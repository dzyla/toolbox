import { parseQuantity } from '@/core/units';

export interface QValue { value: number; unit: string }

/** Number + unit input. Typing "10 mM" into the number field parses value and unit. */
export function Quantity({ id, label, value, units, onChange, hint, error, placeholder }:
  { id: string; label: string; value: QValue; units: string[]; onChange: (v: QValue) => void; hint?: string; error?: string; placeholder?: string }) {
  const onInput = (e: Event) => {
    const t = (e.target as HTMLInputElement).value;
    const parsed = parseQuantity(t);
    if (parsed && units.includes(parsed.unit)) { onChange({ value: parsed.value, unit: parsed.unit }); return; }
    const n = t.trim() === '' ? NaN : Number(t);
    onChange({ value: Number.isFinite(n) ? n : NaN, unit: value.unit });
  };
  return (
    <div>
      <label for={id} class="mb-1 block text-sm font-medium">{label}</label>
      <div class="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-accent-500 dark:border-slate-700 dark:bg-slate-900">
        <input id={id} type="text" inputMode="decimal" value={Number.isFinite(value.value) ? String(value.value) : ''} onInput={onInput} placeholder={placeholder}
          aria-invalid={!!error} class="mono min-w-0 flex-1 bg-transparent px-3 py-2 outline-none" />
        <select aria-label={`${label} unit`} value={value.unit} onChange={e => onChange({ ...value, unit: (e.target as HTMLSelectElement).value })}
          class="border-l border-slate-200 bg-slate-50 px-2 text-sm dark:border-slate-700 dark:bg-slate-800">
          {units.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      {error ? <p class="mt-1 text-xs text-red-600">{error}</p> : hint ? <p class="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
