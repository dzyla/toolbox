import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { toSI, formatSI, UnitError } from '@/core/units';
import { massForSolution, solveDilution, InputError, type DilutionInput } from '@/core/reactions/molarity';
import { plan, SerialDilutionError, type SerialDilutionRow } from '@/core/reactions/serial-dilution';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SCIENCE } from './science';

const CONC = ['M', 'mM', 'µM', 'nM'];
const VOL = ['L', 'mL', 'µL'];
type Key = 'c1' | 'v1' | 'c2' | 'v2';

interface State {
  tab: 'mass' | 'dilution' | 'serial'; conc: QValue; vol: QValue; mw: number;
  c1: QValue; v1: QValue; c2: QValue; v2: QValue; blank: Key;
  serialConc: QValue; serialFactor: number; serialSteps: number; serialVolume: QValue;
}
const DEFAULTS: State = {
  tab: 'mass', conc: { value: 10, unit: 'mM' }, vol: { value: 500, unit: 'mL' }, mw: 58.44,
  c1: { value: 1, unit: 'M' }, v1: { value: NaN, unit: 'mL' }, c2: { value: 100, unit: 'mM' }, v2: { value: 10, unit: 'mL' }, blank: 'v1',
  serialConc: { value: 100, unit: 'mM' }, serialFactor: 2, serialSteps: 4, serialVolume: { value: 100, unit: 'µL' },
};

function compute(s: State): { result: string; rows?: SerialDilutionRow[]; error?: string } {
  try {
    if (s.tab === 'mass') {
      const g = massForSolution(toSI(s.conc), toSI(s.vol), s.mw);
      return { result: `Weigh ${formatSI(g, 'mass').text} and make up to ${s.vol.value} ${s.vol.unit} for ${s.conc.value} ${s.conc.unit} (MW ${s.mw} g/mol).` };
    }
    if (s.tab === 'serial') {
      const rows = plan({ startConc: s.serialConc.value, factor: s.serialFactor, steps: s.serialSteps, wellVolume: s.serialVolume.value });
      return { result: `Prepare well 1 at ${s.serialConc.value} ${s.serialConc.unit} in ${rows[0]!.preparationVolume} ${s.serialVolume.unit}; transfer ${rows[0]!.transferVolume} ${s.serialVolume.unit} through ${rows.length} wells.`, rows };
    }
    const inp: DilutionInput = {};
    for (const k of ['c1', 'v1', 'c2', 'v2'] as const) if (k !== s.blank && Number.isFinite(s[k].value)) inp[k] = toSI(s[k]);
    const r = solveDilution(inp);
    const c = (k: 'c1' | 'c2') => formatSI(r[k], 'concentration').text;
    const v = (k: 'v1' | 'v2') => formatSI(r[k], 'volume').text;
    return { result: `Take ${v('v1')} of ${c('c1')} stock and add ${formatSI(r.diluent, 'volume').text} diluent for ${v('v2')} at ${c('c2')}.` };
  } catch (e) {
    if (e instanceof InputError || e instanceof UnitError || e instanceof SerialDilutionError) return { result: '', error: e.message };
    throw e;
  }
}

export default function View() {
  const [state, shareUrl] = useUrlState<State>('molarity', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const { result, rows, error } = useMemo(() => compute(s), [s]);

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
        <div class="flex flex-wrap gap-2">{tabBtn('mass', 'Mass for a solution')}{tabBtn('dilution', 'Dilution (C1V1 = C2V2)')}{tabBtn('serial', 'Serial dilution')}</div>
        {s.tab === 'mass' ? <>
          <Quantity id="mol-conc" label="Target concentration" value={s.conc} units={CONC} onChange={v => set({ conc: v })} />
          <Quantity id="mol-vol" label="Final volume" value={s.vol} units={VOL} onChange={v => set({ vol: v })} />
          <label for="mol-mw" class="block"><span class="mb-1 block text-sm font-medium">Molecular weight (g/mol)</span>
            <input id="mol-mw" type="number" step="any" value={s.mw} onInput={e => set({ mw: Number((e.target as HTMLInputElement).value) })}
              class="mono w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
        </> : s.tab === 'dilution' ? <>
          {dil('c1', 'Stock concentration (C1)', CONC)}
          {dil('v1', 'Stock volume (V1)', VOL)}
          {dil('c2', 'Final concentration (C2)', CONC)}
          {dil('v2', 'Final volume (V2)', VOL)}
        </> : <>
          <Quantity id="serial-conc" label="Starting concentration" value={s.serialConc} units={CONC} onChange={serialConc => set({ serialConc })} />
          <label for="serial-factor" class="block"><span class="mb-1 block text-sm font-medium">Dilution factor</span><input id="serial-factor" type="number" min="1" step="any" value={s.serialFactor}
            onInput={e => set({ serialFactor: Number((e.target as HTMLInputElement).value) })} class="mono w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
          <label for="serial-steps" class="block"><span class="mb-1 block text-sm font-medium">Number of wells</span><input id="serial-steps" type="number" min="1" step="1" value={s.serialSteps}
            onInput={e => set({ serialSteps: Number((e.target as HTMLInputElement).value) })} class="mono w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
          <Quantity id="serial-volume" label="Final volume per well" value={s.serialVolume} units={VOL} onChange={serialVolume => set({ serialVolume })} />
        </>}
      </>}
      results={error ? <p role="alert" class="text-red-600">{error}</p> : s.tab === 'serial' ? <div data-testid="serial-results" class="overflow-x-auto">
        <p class="mb-3 text-sm">Transfer <strong>{rows![0]!.transferVolume} {s.serialVolume.unit}</strong> into <strong>{rows![1]?.diluentVolume ?? s.serialVolume.value} {s.serialVolume.unit}</strong> diluent per receiving well. Prepare well 1 to <strong>{rows![0]!.preparationVolume} {s.serialVolume.unit}</strong>.</p>
        <table class="w-full text-left text-sm"><thead><tr><th class="pb-2">Well</th><th class="pb-2 text-right">Concentration</th><th class="pb-2 text-right">Diluent</th></tr></thead>
          <tbody>{rows!.map(row => <tr key={row.well} class="border-t border-slate-200 dark:border-slate-700"><td class="py-2">Well {row.well}</td><td class="py-2 text-right font-mono">{Number(row.concentration.toPrecision(5))} {s.serialConc.unit}</td><td class="py-2 text-right font-mono">{row.diluentVolume} {s.serialVolume.unit}</td></tr>)}</tbody></table>
        <p class="mt-3 text-xs text-slate-500">After mixing, transfer onward from each well; remove the same transfer volume from the final well so every well retains {s.serialVolume.value} {s.serialVolume.unit}.</p>
      </div> : <p class="text-lg" data-testid="result">{result}</p>}
      actions={<ActionBar onCopy={() => `${result}\n\n${scienceText(SCIENCE)}`} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
