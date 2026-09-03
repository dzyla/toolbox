import { useMemo } from 'preact/hooks';
import { MasterMixError, masterMix } from '@/core/reactions/mastermix';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import { downloadText, toCsv } from '@/lib/export';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface EditorComponent { id: string; name: string; perReaction: number }
interface State { reactionVolume: number; reactions: number; excessPercent: number; deadVolume: number; components: EditorComponent[] }
const DEFAULTS: State = {
  reactionVolume: 20, reactions: 10, excessPercent: 10, deadVolume: 20,
  components: [
    { id: 'mm-1', name: '10x buffer', perReaction: 2 },
    { id: 'mm-2', name: 'Enzyme', perReaction: 0.5 },
    { id: 'mm-3', name: 'Template', perReaction: 1 },
  ],
};
let nextId = 4;
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';
const shown = (value: number) => Number(value.toFixed(3));

export default function View() {
  const [state, shareUrl] = useUrlState<State>('master-mix', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const updateComponent = (index: number, patch: Partial<EditorComponent>) => set({
    components: s.components.map((component, i) => i === index ? { ...component, ...patch } : component),
  });
  const calculation = useMemo(() => {
    try {
      return { value: masterMix({ ...s, components: s.components.map(({ name, perReaction }) => ({ name, perReaction })) }) };
    } catch (error) {
      if (error instanceof MasterMixError) return { error: error.message };
      throw error;
    }
  }, [s]);
  const result = calculation.value;
  const copyText = calculation.error ? calculation.error : [
    `Master mix for ${result!.effectiveReactions.toFixed(1)} reaction equivalents (${shown(result!.totalVolume)} µL total)`,
    ...result!.rows.map(row => `${row.name}: ${shown(row.total)} µL`), '', scienceText(SCIENCE),
  ].join('\n');
  const exportCsv = () => {
    if (!result) return;
    downloadText([
      ...scienceText(SCIENCE).split('\n').map(line => `# ${line}`),
      toCsv([
        ['Component', 'Per reaction (µL)', 'Total (µL)'],
        ...result.rows.map(row => [row.name, shown(row.perReaction), shown(row.total)]),
      ]),
    ].join('\n'), 'master-mix.csv', 'text/csv;charset=utf-8');
  };
  const numberField = (label: string, key: keyof Pick<State, 'reactionVolume' | 'reactions' | 'excessPercent' | 'deadVolume'>, min: number, step = 'any') =>
    <label><span class="mb-1 block text-sm font-medium">{label}</span><input aria-label={label} type="number" min={min} step={step} value={s[key]}
      onInput={event => set({ [key]: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>;

  return <ToolLayout icon="🧫" title="Master Mix" blurb="Scale reaction components with pipetting excess and dead volume."
    inputs={<>
      <div class="grid gap-3 sm:grid-cols-2">{numberField('Reaction volume (µL)', 'reactionVolume', 0)}{numberField('Number of reactions', 'reactions', 1, '1')}
        {numberField('Excess (%)', 'excessPercent', 0)}{numberField('Dead volume (µL)', 'deadVolume', 0)}</div>
      <fieldset class="space-y-2"><legend class="mb-2 text-sm font-semibold">Components per reaction</legend>
        {s.components.map((component, index) => <div key={component.id} class="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2">
          <label><span class="mb-1 block text-xs">Name</span><input aria-label={`Component ${index + 1} name`} value={component.name}
            onInput={event => updateComponent(index, { name: (event.target as HTMLInputElement).value })} class={fieldClass} /></label>
          <label><span class="mb-1 block text-xs">Volume (µL)</span><input aria-label={`Component ${index + 1} volume`} type="number" min="0" step="any" value={component.perReaction}
            onInput={event => updateComponent(index, { perReaction: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>
          <button type="button" aria-label={`Remove component ${index + 1}`} disabled={s.components.length === 1}
            onClick={() => set({ components: s.components.filter((_, i) => i !== index) })} class="min-h-11 rounded-lg border border-slate-300 px-3 disabled:opacity-50 dark:border-slate-700">×</button>
        </div>)}
      </fieldset>
      <button type="button" onClick={() => set({ components: [...s.components, { id: `mm-${nextId++}`, name: 'Reagent', perReaction: 1 }] })}
        class="w-full rounded-lg border border-dashed border-slate-400 px-3 py-2 text-sm">+ Add reagent</button>
    </>}
    results={calculation.error ? <p role="alert" class="text-red-600">{calculation.error}</p> : <div data-testid="mastermix-results">
      <div class="mb-3 flex items-baseline justify-between"><h2 class="font-semibold">Total master mix</h2><span class="text-sm text-slate-500">{result!.effectiveReactions.toFixed(1)} reaction equivalents</span></div>
      <div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr><th class="pb-2">Component</th><th class="pb-2 text-right">Per reaction</th><th class="pb-2 text-right">Total</th></tr></thead>
        <tbody>{result!.rows.map(row => <tr key={row.name} class="border-t border-slate-200 dark:border-slate-700"><td class="py-2">{row.name}</td><td class="py-2 text-right font-mono">{shown(row.perReaction)} µL</td><td class="py-2 text-right font-mono">{shown(row.total)} µL</td></tr>)}</tbody>
        <tfoot><tr class="border-t-2 border-slate-300 font-semibold dark:border-slate-600"><td class="pt-2">Total</td><td /><td class="pt-2 text-right font-mono">{shown(result!.totalVolume)} µL</td></tr></tfoot></table></div>
    </div>}
    actions={<div class="space-y-2"><ActionBar onCopy={() => copyText} shareUrl={shareUrl} /><button type="button" onClick={exportCsv} disabled={!result}
      class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">Export CSV</button></div>}
    science={<SciencePanel science={SCIENCE} />} />;
}
