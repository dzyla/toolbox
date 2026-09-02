import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { toSI, formatSI, UnitError } from '@/core/units';
import { massForSolution, solveDilution, InputError, type DilutionInput } from '@/core/reactions/molarity';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SCIENCE } from './science';

const CONC = ['M', 'mM', 'µM', 'nM'];
const VOL = ['L', 'mL', 'µL'];
type Key = 'c1' | 'v1' | 'c2' | 'v2';

interface State { tab: 'mass' | 'dilution'; conc: QValue; vol: QValue; mw: number; c1: QValue; v1: QValue; c2: QValue; v2: QValue; blank: Key }
const DEFAULTS: State = {
  tab: 'mass', conc: { value: 10, unit: 'mM' }, vol: { value: 500, unit: 'mL' }, mw: 58.44,
  c1: { value: 1, unit: 'M' }, v1: { value: NaN, unit: 'mL' }, c2: { value: 100, unit: 'mM' }, v2: { value: 10, unit: 'mL' }, blank: 'v1',
};

function compute(s: State): { result: string; error?: string } {
  try {
    if (s.tab === 'mass') {
      const g = massForSolution(toSI(s.conc), toSI(s.vol), s.mw);
      return { result: `Weigh ${formatSI(g, 'mass').text} and make up to ${s.vol.value} ${s.vol.unit} for ${s.conc.value} ${s.conc.unit} (MW ${s.mw} g/mol).` };
    }
    const inp: DilutionInput = {};
    for (const k of ['c1', 'v1', 'c2', 'v2'] as const) if (k !== s.blank && Number.isFinite(s[k].value)) inp[k] = toSI(s[k]);
    const r = solveDilution(inp);
    const c = (k: 'c1' | 'c2') => formatSI(r[k], 'concentration').text;
    const v = (k: 'v1' | 'v2') => formatSI(r[k], 'volume').text;
    return { result: `Take ${v('v1')} of ${c('c1')} stock and add ${formatSI(r.diluent, 'volume').text} diluent for ${v('v2')} at ${c('c2')}.` };
  } catch (e) {
    if (e instanceof InputError || e instanceof UnitError) return { result: '', error: e.message };
    throw e;
  }
}

export default function View() {
  const [state, shareUrl] = useUrlState<State>('molarity', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const { result, error } = useMemo(() => compute(s), [s]);

  const tabBtn = (t: State['tab'], label: string) => (
    <button type="button" onClick={() => set({ tab: t })} aria-pressed={s.tab === t}
      class={`rounded-full px-3 py-1 text-sm ${s.tab === t ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>{label}</button>
  );
  const dil = (k: Key, label: string, units: string[]) => (
    <div class="flex items-end gap-2">
      <div class="flex-1"><Quantity id={`mol-${k}`} label={label} value={s[k]} units={units} onChange={v => set({ [k]: v })} placeholder={s.blank === k ? 'solved' : ''} /></div>
      <label class="mb-2 flex items-center gap-1 text-xs"><input type="radio" name="blank" checked={s.blank === k} onChange={() => set({ blank: k, [k]: { ...s[k], value: NaN } })} /> solve</label>
    </div>
  );

  return (
    <ToolLayout icon="⚖️" title="Molarity & Dilution" blurb="Mass to weigh for a solution, and C1V1 = C2V2 with any unknown."
      inputs={<>
        <div class="flex gap-2">{tabBtn('mass', 'Mass for a solution')}{tabBtn('dilution', 'Dilution (C1V1 = C2V2)')}</div>
        {s.tab === 'mass' ? <>
          <Quantity id="mol-conc" label="Target concentration" value={s.conc} units={CONC} onChange={v => set({ conc: v })} />
          <Quantity id="mol-vol" label="Final volume" value={s.vol} units={VOL} onChange={v => set({ vol: v })} />
          <label for="mol-mw" class="block"><span class="mb-1 block text-sm font-medium">Molecular weight (g/mol)</span>
            <input id="mol-mw" type="number" step="any" value={s.mw} onInput={e => set({ mw: Number((e.target as HTMLInputElement).value) })}
              class="mono w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
        </> : <>
          {dil('c1', 'Stock concentration (C1)', CONC)}
          {dil('v1', 'Stock volume (V1)', VOL)}
          {dil('c2', 'Final concentration (C2)', CONC)}
          {dil('v2', 'Final volume (V2)', VOL)}
        </>}
      </>}
      results={error ? <p role="alert" class="text-red-600">{error}</p> : <p class="text-lg" data-testid="result">{result}</p>}
      actions={<ActionBar onCopy={() => `${result}\n\n${scienceText(SCIENCE)}`} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
