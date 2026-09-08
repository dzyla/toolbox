/* Unit Converter: value + unit in, converted table for every unit of the same dimension out.
 * Dimensions and conversion factors live in core/units; this view only renders and shares state. */
import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { toSI, convert, formatSI, type Dim, type Quantity as Qty } from '@/core/units';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SCIENCE } from './science';

interface DimDef {
  id: Dim;
  label: string;
  /** units offered in the target table (a representative set, not every prefix). */
  units: string[];
  defaultIn: QValue;
}

const DIMS: DimDef[] = [
  { id: 'concentration', label: 'Concentration', units: ['M', 'mM', 'µM', 'nM', 'pM'], defaultIn: { value: 10, unit: 'mM' } },
  { id: 'volume', label: 'Volume', units: ['µL', 'mL', 'L', 'tsp', 'tbsp', 'fl oz', 'cup', 'pt', 'qt', 'gal'], defaultIn: { value: 100, unit: 'µL' } },
  { id: 'mass', label: 'Weight', units: ['µg', 'mg', 'g', 'oz', 'lb', 'ton'], defaultIn: { value: 1, unit: 'g' } },
  { id: 'amount', label: 'Amount', units: ['mol', 'mmol', 'µmol', 'nmol', 'pmol'], defaultIn: { value: 1, unit: 'µmol' } },
  { id: 'massconc', label: 'Mass / volume', units: ['mg/mL', 'µg/mL', 'ng/mL', 'pg/mL', 'mg/L', 'µg/µL', 'ng/µL', '%'], defaultIn: { value: 1, unit: 'µg/mL' } },
  { id: 'length', label: 'Size', units: ['Å', 'nm', 'µm', 'mm', 'cm', 'in', 'ft', 'yd', 'mi'], defaultIn: { value: 1, unit: 'µm' } },
  { id: 'area', label: 'Area', units: ['mm²', 'cm²', 'in²', 'ft²', 'acre'], defaultIn: { value: 1, unit: 'cm²' } },
  { id: 'energy', label: 'Energy', units: ['J', 'cal', 'kcal', 'eV', 'BTU', 'kWh'], defaultIn: { value: 1, unit: 'kcal' } },
  { id: 'temperature', label: 'Temperature', units: ['°C', '°F', 'K'], defaultIn: { value: 20, unit: '°C' } },
  { id: 'activity', label: 'Radioactivity', units: ['Bq', 'kBq', 'MBq', 'GBq', 'Ci', 'mCi', 'µCi'], defaultIn: { value: 1, unit: 'µCi' } },
  { id: 'radiation', label: 'Dose (radiation)', units: ['Gy', 'mGy', 'µGy', 'Sv', 'mSv', 'µSv', 'rem', 'mrem'], defaultIn: { value: 1, unit: 'mSv' } },
  { id: 'pressure', label: 'Pressure', units: ['Pa', 'kPa', 'MPa', 'bar', 'mbar', 'mmHg', 'Torr', 'atm', 'psi'], defaultIn: { value: 1, unit: 'atm' } },
];

interface State {
  dim: Dim;
  inQ: QValue;
}

const DEFAULTS: State = { dim: 'concentration', inQ: { value: 10, unit: 'mM' } };

export default function View() {
  const [state, shareUrl] = useUrlState<State>('unit-converter', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch } };

  const dimDef = DIMS.find(d => d.id === s.dim) ?? DIMS[0]!;
  const inUnits = [dimDef.defaultIn.unit, ...dimDef.units.filter(u => u !== dimDef.defaultIn.unit)];

  const rows = useMemo(() => {
    if (!Number.isFinite(s.inQ.value)) return null;
    const q: Qty = s.inQ;
    const fmt = (v: number) => {
      const p = v.toPrecision(6);
      return p.includes('e') ? p : p.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    };
    return dimDef.units
      .map(u => {
        try {
          const v = convert(q.value, q.unit, u);
          return { unit: u, value: v, text: `${fmt(v)} ${u}` };
        } catch {
          return { unit: u, value: NaN, text: '—' };
        }
      })
      .sort((a, b) => (a.unit === q.unit ? -1 : b.unit === q.unit ? 1 : 0));
  }, [s.inQ, dimDef]);

  const main = useMemo(() => {
    if (!rows) return '';
    const r = rows.find(x => x.unit === s.inQ.unit);
    const next = rows[rows.findIndex(x => x.unit === s.inQ.unit) + 1] ?? rows[1];
    return r && next ? `${s.inQ.value} ${s.inQ.unit} = ${next.text}` : '';
  }, [rows, s.inQ]);

  const error = !rows ? 'Enter a number to convert.' : undefined;

  return (
    <ToolLayout icon="🔄" title="Unit Converter"
      blurb="Lab scales plus practical US volume, mass, size, area, energy and temperature conversions — everything on device."
      mobileResultSummary={error ? <span class="text-rose-600 dark:text-rose-400 font-semibold">{error}</span> : <span class="font-medium">{main}</span>}
      inputs={<>
        <div class="flex flex-wrap gap-1.5">
          {DIMS.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => set({ dim: d.id, inQ: d.defaultIn })}
              aria-pressed={s.dim === d.id}
              class={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${s.dim === d.id ? 'bg-accent-600 text-white shadow-xs' : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <Quantity id="uc-in" label="Value" value={s.inQ} units={inUnits} onChange={v => set({ inQ: v })} hint='Type "10 mM", "760 mmHg", or "72 F" to parse value and unit together.' />
      </>}
      results={
        error ? <p role="alert" data-testid="result" class="text-red-600 dark:text-red-400 font-medium">{error}</p> : (
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p class="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100" data-testid="result">{main}</p>
            <table class="w-full text-sm">
              <thead><tr class="text-left text-xs uppercase tracking-wide text-slate-400"><th class="pb-2">Unit</th><th class="pb-2 text-right">Value</th></tr></thead>
              <tbody>
                {rows!.map(r => (
                  <tr key={r.unit} class={`border-t border-slate-100 dark:border-slate-800 ${r.unit === s.inQ.unit ? 'bg-accent-50/60 dark:bg-accent-950/30' : ''}`}>
                    <td class="py-1.5 font-mono font-medium">{r.unit}</td>
                    <td class="py-1.5 text-right font-mono">{r.unit === s.inQ.unit ? <span class="text-slate-400">input</span> : r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p class="mt-3 text-xs text-slate-500">
              Neat value: <span class="font-mono">{formatSI(toSI(s.inQ), dimDef.id).text}</span>
            </p>
          </div>
        )
      }
      actions={<ActionBar onCopy={() => `${main}\n\n${scienceText(SCIENCE)}`} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
