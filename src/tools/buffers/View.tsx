import { useMemo, useState } from 'preact/hooks';
import chemicalsJson from '@/data/chemicals.json';
import presetsJson from '@/data/buffer-presets.json';
import { BUFFER_PKA, pKaAtTemperature, ratioBaseAcid } from '@/core/buffers/henderson';
import { BufferRecipeError, solveRecipe, type RecipeComponent, type RecipeTarget, type RecipeUnit } from '@/core/buffers/recipe';
import { formatSI, toSI, UnitError } from '@/core/units';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import { downloadText, toCsv } from '@/lib/export';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface Chemical { name: string; mw: number; type: string; synonyms?: string[]; hydrateOf?: string; waters?: number }
interface EditorComponent {
  id: string; query: string; name: string; kind: 'solid' | 'stock'; mw?: number; waters?: number;
  stockConc?: number; stockUnit?: RecipeUnit; density?: number; target: RecipeTarget;
}
interface Preset { id: string; name: string; finalVolume_L: number; source: string; components: RecipeComponent[] }
interface State { volume: QValue; components: EditorComponent[]; pH: number; temperature: number; bufferId: string }

const CHEMICALS = chemicalsJson.chemicals as Chemical[];
const PRESETS = presetsJson.presets as unknown as Preset[];
let nextId = 1;
const newId = () => `buffer-row-${nextId++}`;
const DEFAULT_COMPONENT: EditorComponent = {
  id: 'buffer-row-0', query: 'Tris-base', name: 'Tris-base', kind: 'solid', mw: 121.14,
  waters: 0, target: { value: 10, unit: 'mM' },
};
const DEFAULTS: State = { volume: { value: 500, unit: 'mL' }, components: [DEFAULT_COMPONENT], pH: 8, temperature: 25, bufferId: 'tris' };
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const explicitForm = (name: string) => /hydrate|anhydrous|[·.]\s*\d*\s*h[₂2]o/i.test(name);

function toCore(component: EditorComponent): RecipeComponent {
  if (component.kind === 'solid') return { name: component.name, kind: 'solid', mw: component.mw, waters: component.waters, target: component.target };
  return {
    name: component.name, kind: 'stock', stockConc: component.stockConc ?? NaN,
    stockUnit: component.stockUnit ?? 'M', target: component.target, density: component.density,
  };
}

function displayAmount(amount: number, unit: 'g' | 'mL'): string {
  return unit === 'g' ? formatSI(amount, 'mass').text : formatSI(amount / 1000, 'volume').text;
}

export default function View() {
  const [state, shareUrl] = useUrlState<State>('buffers', DEFAULTS);
  const [lookupStatus, setLookupStatus] = useState('');
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const update = (index: number, patch: Partial<EditorComponent>) => {
    set({ components: s.components.map((component, i) => i === index ? { ...component, ...patch } : component) });
  };

  const calculation = useMemo(() => {
    try {
      return { rows: solveRecipe(s.components.map(toCore), toSI(s.volume)) };
    } catch (error) {
      if (error instanceof BufferRecipeError || error instanceof UnitError) return { rows: [], error: error.message };
      throw error;
    }
  }, [s]);

  const pka = BUFFER_PKA.find(buffer => buffer.id === s.bufferId) ?? BUFFER_PKA[0]!;
  const correctedPka = pKaAtTemperature(pka.pKa25, pka.dpKadT, s.temperature);
  const ratio = ratioBaseAcid(s.pH, correctedPka);
  const copyText = calculation.error ? calculation.error : [
    `Buffer recipe — ${s.volume.value} ${s.volume.unit}`,
    ...calculation.rows.map(row => `${row.name}: ${displayAmount(row.amount, row.unit)}${row.mass_g === undefined ? '' : ` (${Number(row.mass_g.toPrecision(4))} g by density)`}`),
    `Bring to ${s.volume.value} ${s.volume.unit} with water.`, '', scienceText(SCIENCE),
  ].join('\n');
  const exportCsv = () => downloadText([
    ...scienceText(SCIENCE).split('\n').map(line => `# ${line}`),
    toCsv([
      ['Component', 'Amount', 'Unit', 'Mass from density (g)'],
      ...calculation.rows.map(row => [row.name, Number(row.amount.toPrecision(8)), row.unit, row.mass_g ?? '']),
    ]),
  ].join('\n'), 'buffer-recipe.csv', 'text/csv;charset=utf-8');

  const loadPreset = (id: string) => {
    const preset = PRESETS.find(item => item.id === id);
    if (!preset) return;
    set({
      volume: { value: preset.finalVolume_L, unit: 'L' },
      components: preset.components.map(component => ({
        ...component, id: newId(), query: component.name,
        waters: component.kind === 'solid' ? component.waters ?? 0 : undefined,
      })),
    });
  };

  const lookup = async (index: number) => {
    const component = s.components[index];
    if (!component?.query.trim()) return;
    setLookupStatus('Looking up molecular weight…');
    try {
      const response = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(component.query)}/property/MolecularWeight/JSON`);
      if (!response.ok) throw new Error(`PubChem returned ${response.status}`);
      const payload = await response.json() as { PropertyTable?: { Properties?: { MolecularWeight?: number | string }[] } };
      const mw = Number(payload.PropertyTable?.Properties?.[0]?.MolecularWeight);
      if (!(mw > 0)) throw new Error('No molecular weight found');
      update(index, { name: component.query.trim(), mw });
      setLookupStatus(`PubChem molecular weight: ${mw} g/mol`);
    } catch (error) {
      setLookupStatus(error instanceof Error ? `Lookup failed: ${error.message}` : 'Lookup failed');
    }
  };

  const componentEditor = (component: EditorComponent, index: number) => {
    const q = component.query.trim().toLowerCase();
    const matches = q && q !== component.name.toLowerCase() ? CHEMICALS.filter(chemical =>
      chemical.name.toLowerCase().includes(q) || chemical.synonyms?.some(synonym => synonym.toLowerCase().includes(q)),
    ).slice(0, 8) : [];
    const labelSuffix = index === 0 ? '' : ` ${index + 1}`;
    return <fieldset key={component.id} class="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <legend class="px-1 text-sm font-semibold">Component {index + 1}</legend>
      <label class="block"><span class="mb-1 block text-sm font-medium">Chemical search</span>
        <input aria-label={`Chemical search${labelSuffix}`} value={component.query} onInput={event => update(index, { query: (event.target as HTMLInputElement).value })}
          class={fieldClass} placeholder="Name or synonym (for example MgCl2)" />
      </label>
      {matches.length > 0 && <div class="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-1 dark:border-slate-700" aria-label="Chemical matches">
        {matches.map(chemical => <button key={chemical.name} type="button" class="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={() => update(index, { query: chemical.name, name: chemical.name, mw: chemical.mw, waters: 0 })}>
          {chemical.name} — {chemical.mw} g/mol{chemical.hydrateOf ? ` (${chemical.waters} waters)` : ''}
        </button>)}
      </div>}
      <div class="grid gap-3 sm:grid-cols-2">
        <label><span class="mb-1 block text-sm font-medium">Form</span><select value={component.kind} class={fieldClass}
          onChange={event => update(index, { kind: (event.target as HTMLSelectElement).value as 'solid' | 'stock' })}>
          <option value="solid">Solid</option><option value="stock">Liquid stock</option>
        </select></label>
        <label><span class="mb-1 block text-sm font-medium">Target</span><span class="flex">
          <input aria-label={`Target concentration${labelSuffix}`} type="number" min="0" step="any" value={component.target.value}
            onInput={event => update(index, { target: { ...component.target, value: Number((event.target as HTMLInputElement).value) } })}
            class={`${fieldClass} rounded-r-none`} />
          <select aria-label={`Target unit${labelSuffix}`} value={component.target.unit}
            onChange={event => update(index, { target: { ...component.target, unit: (event.target as HTMLSelectElement).value as RecipeUnit } })}
            class="rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-2 dark:border-slate-700 dark:bg-slate-800">
            <option>M</option><option>mM</option><option>%</option><option value="x">×</option>
          </select></span></label>
      </div>
      {component.kind === 'solid' ? <div class="grid gap-3 sm:grid-cols-2">
        <label><span class="mb-1 block text-sm font-medium">Molecular weight</span><input aria-label={`Molecular weight${labelSuffix}`} type="number" step="any"
          value={component.mw ?? ''} onInput={event => update(index, { mw: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>
        <label><span class="mb-1 block text-sm font-medium">Additional waters</span><input aria-label={`Additional waters${labelSuffix}`} type="number" min="0" step="1"
          value={component.waters ?? 0} disabled={explicitForm(component.name)} onInput={event => update(index, { waters: Number((event.target as HTMLInputElement).value) })}
          class={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-50`} /></label>
      </div> : <div class="grid gap-3 sm:grid-cols-3">
        <label><span class="mb-1 block text-sm font-medium">Stock concentration</span><input type="number" step="any" value={component.stockConc ?? 1}
          onInput={event => update(index, { stockConc: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>
        <label><span class="mb-1 block text-sm font-medium">Stock unit</span><select value={component.stockUnit ?? 'M'}
          onChange={event => update(index, { stockUnit: (event.target as HTMLSelectElement).value as RecipeUnit })} class={fieldClass}>
          <option>M</option><option>mM</option><option>%</option><option value="x">×</option>
        </select></label>
        <label><span class="mb-1 block text-sm font-medium">Density (g/mL, optional)</span><input type="number" step="any" value={component.density ?? ''}
          onInput={event => { const value = (event.target as HTMLInputElement).value; update(index, { density: value ? Number(value) : undefined }); }} class={fieldClass} /></label>
      </div>}
      <div class="flex flex-wrap gap-2">
        <button type="button" onClick={() => void lookup(index)} class="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700">Look up MW in PubChem</button>
        <button type="button" onClick={() => set({ components: s.components.filter((_, i) => i !== index) })} disabled={s.components.length === 1}
          class="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-slate-700">Remove</button>
      </div>
    </fieldset>;
  };

  return <ToolLayout icon="🧪" title="Buffer & Media Recipes" blurb="Build recipes from exact chemical forms, solids and liquid stocks."
    inputs={<>
      <label class="block"><span class="mb-1 block text-sm font-medium">Recipe preset</span><select id="buffer-preset" aria-label="Recipe preset" defaultValue=""
        onChange={event => loadPreset((event.target as HTMLSelectElement).value)} class={fieldClass}>
        <option value="">Choose a preset…</option>{PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </select></label>
      <Quantity id="buffer-volume" label="Final volume" value={s.volume} units={['L', 'mL']} onChange={volume => set({ volume })} />
      <div class="space-y-3">{s.components.map(componentEditor)}</div>
      <button type="button" onClick={() => set({ components: [...s.components, { ...DEFAULT_COMPONENT, id: newId(), query: '', name: 'New component' }] })}
        class="w-full rounded-lg border border-dashed border-slate-400 px-3 py-2 text-sm">+ Add component</button>
      {lookupStatus && <p role="status" class="text-xs text-slate-500">{lookupStatus}</p>}
      <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary class="cursor-pointer text-sm font-semibold">pH helper</summary>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <label><span class="mb-1 block text-sm">Buffer</span><select value={s.bufferId} onChange={event => set({ bufferId: (event.target as HTMLSelectElement).value })} class={fieldClass}>
            {BUFFER_PKA.map(buffer => <option key={buffer.id} value={buffer.id}>{buffer.name}</option>)}</select></label>
          <label><span class="mb-1 block text-sm">Target pH</span><input type="number" step="0.1" value={s.pH} onInput={event => set({ pH: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>
          <label><span class="mb-1 block text-sm">Temperature (°C)</span><input type="number" step="1" value={s.temperature} onInput={event => set({ temperature: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>
        </div>
        <p class="mt-3 text-sm">pKa at {s.temperature} °C: <strong>{correctedPka.toFixed(3)}</strong>; base:acid ratio <strong>{Number(ratio.toPrecision(4))}:1</strong>.</p>
      </details>
    </>}
    results={calculation.error ? <p role="alert" class="text-red-600">{calculation.error}</p> : <div data-testid="buffer-results">
      <h2 class="font-semibold">Recipe</h2><div class="mt-3 overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr><th class="pb-2">Component</th><th class="pb-2 text-right">Add</th></tr></thead>
        <tbody>{calculation.rows.map(row => <tr key={row.name} class="border-t border-slate-200 dark:border-slate-700"><td class="py-2">{row.name}</td><td class="py-2 text-right font-mono">{displayAmount(row.amount, row.unit)}{row.mass_g === undefined ? '' : ` (${Number(row.mass_g.toPrecision(4))} g)`}</td></tr>)}</tbody></table></div>
      <p class="mt-3 text-sm text-slate-500">Dissolve, adjust pH as needed, then bring to {s.volume.value} {s.volume.unit} with water.</p>
    </div>}
    actions={<div class="space-y-2"><ActionBar onCopy={() => copyText} shareUrl={shareUrl} /><button type="button" onClick={exportCsv}
      class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900">Export CSV</button></div>}
    science={<SciencePanel science={SCIENCE} />} />;
}
