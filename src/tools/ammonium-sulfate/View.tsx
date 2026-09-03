import { useMemo } from 'preact/hooks';
import { AmmoniumSulfateError, gramsToAdd } from '@/core/reactions/ammonium-sulfate';
import { formatSI, toSI, UnitError } from '@/core/units';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State { volume: QValue; current: number; target: number; temperature: 25 | 0 }
const DEFAULTS: State = { volume: { value: 1, unit: 'L' }, current: 0, target: 50, temperature: 25 };
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

export default function View() {
  const [state, shareUrl] = useUrlState<State>('ammonium-sulfate', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const calculation = useMemo(() => {
    try { return { grams: gramsToAdd(s.current, s.target, toSI(s.volume), s.temperature) }; }
    catch (error) {
      if (error instanceof AmmoniumSulfateError || error instanceof UnitError) return { error: error.message };
      throw error;
    }
  }, [s]);
  const result = calculation.grams === undefined ? '' : formatSI(calculation.grams, 'mass', { units: ['g', 'mg'] }).text;
  const copyText = calculation.error ? calculation.error : [
    `Add ${result} solid ammonium sulfate to ${s.volume.value} ${s.volume.unit} to increase saturation from ${s.current}% to ${s.target}% at ${s.temperature === 25 ? '25 °C' : '0–4 °C'}.`,
    '', scienceText(SCIENCE),
  ].join('\n');

  return <ToolLayout icon="🧂" title="Ammonium Sulfate" blurb="Calculate solid ammonium sulfate for a saturation cut."
    inputs={<>
      <Quantity id="ammonium-volume" label="Starting volume" value={s.volume} units={['L', 'mL']} onChange={volume => set({ volume })} />
      <div class="grid gap-3 sm:grid-cols-2"><label><span class="mb-1 block text-sm font-medium">Current saturation (%)</span><input aria-label="Current saturation" type="number" min="0" max="99.9" step="any" value={s.current}
        onInput={event => set({ current: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>
        <label><span class="mb-1 block text-sm font-medium">Target saturation (%)</span><input aria-label="Target saturation" type="number" min="0" max="99.9" step="any" value={s.target}
          onInput={event => set({ target: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label></div>
      <label><span class="mb-1 block text-sm font-medium">Temperature</span><select aria-label="Temperature" value={s.temperature}
        onChange={event => set({ temperature: Number((event.target as HTMLSelectElement).value) as 25 | 0 })} class={fieldClass}>
        <option value="25">25 °C (room temperature)</option><option value="0">0–4 °C (cold room)</option>
      </select></label>
    </>}
    results={calculation.error ? <p role="alert" class="text-red-600">{calculation.error}</p> : <div class="text-center">
      <p class="text-sm uppercase tracking-wide text-slate-500">Add solid salt</p><p data-testid="ammonium-result" class="my-2 font-mono text-3xl font-bold">{result}</p>
      <p class="text-sm text-slate-500">Add slowly while stirring at {s.temperature === 25 ? '25 °C' : '0–4 °C'}.</p>
    </div>}
    actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
    science={<SciencePanel science={SCIENCE} />} />;
}
