import { useMemo, useState, useEffect } from 'preact/hooks';
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
  showDetails?: boolean;
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
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [checkedComponents, setCheckedComponents] = useState<Record<string, boolean>>({});

  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const update = (index: number, patch: Partial<EditorComponent>) => {
    set({ components: s.components.map((component, i) => i === index ? { ...component, ...patch } : component) });
  };

  // Load custom presets from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('toolbox_custom_buffers');
      if (saved) {
        setCustomPresets(JSON.parse(saved) as Preset[]);
      }
    } catch {
      // ignore
    }
  }, []);

  const saveCustomBuffer = () => {
    if (!saveName.trim()) return;
    const newPreset: Preset = {
      id: `custom_${Date.now()}`,
      name: saveName.trim(),
      finalVolume_L: toSI(s.volume),
      source: 'User Custom Buffer (Local Storage)',
      components: s.components.map(toCore),
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    try {
      localStorage.setItem('toolbox_custom_buffers', JSON.stringify(updated));
    } catch {
      // ignore
    }
    setShowSaveDialog(false);
    setSaveName('');
  };

  const deleteCustomBuffer = (id: string) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    try {
      localStorage.setItem('toolbox_custom_buffers', JSON.stringify(updated));
    } catch {
      // ignore
    }
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
    const allPresets = [...PRESETS, ...customPresets];
    const preset = allPresets.find(item => item.id === id);
    if (!preset) return;
    set({
      volume: { value: preset.finalVolume_L >= 1 ? preset.finalVolume_L : preset.finalVolume_L * 1000, unit: preset.finalVolume_L >= 1 ? 'L' : 'mL' },
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

  const recipeJsonString = useMemo(() => {
    const recipeObject = {
      id: saveName.trim() ? saveName.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'custom_recipe',
      name: saveName.trim() || 'My Custom Buffer',
      finalVolume_L: toSI(s.volume),
      source: 'Community Contribution',
      components: s.components.map(toCore),
    };
    return JSON.stringify(recipeObject, null, 2);
  }, [s, saveName]);

  const componentEditor = (component: EditorComponent, index: number) => {
    const q = component.query.trim().toLowerCase();
    const matches = q && q !== component.name.toLowerCase() ? CHEMICALS.filter(chemical =>
      chemical.name.toLowerCase().includes(q) || chemical.synonyms?.some(synonym => synonym.toLowerCase().includes(q)),
    ).slice(0, 8) : [];
    const labelSuffix = index === 0 ? '' : ` ${index + 1}`;

    return (
      <div key={component.id} class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
        {/* Component Header with Name & Form Badges */}
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-bold text-accent-600 dark:text-accent-400 select-none">#{index + 1}</span>
            <strong class="text-sm font-bold text-slate-900 dark:text-slate-100">
              {component.name || 'Unnamed compound'}
            </strong>
            <span class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {component.kind === 'solid' ? `Solid · ${component.mw ? `${component.mw} g/mol` : 'MW needed'}` : `Stock · ${component.stockConc} ${component.stockUnit}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => set({ components: s.components.filter((_, i) => i !== index) })}
            disabled={s.components.length === 1}
            class="text-xs text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 transition p-1"
            title="Remove component"
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <div>
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate-500">Chemical search</span>
            <input
              aria-label={`Chemical search${labelSuffix}`}
              value={component.query}
              onInput={event => update(index, { query: (event.target as HTMLInputElement).value })}
              class={fieldClass}
              placeholder="Search chemical name or formula (e.g. NaCl, Tris, HEPES, MgCl2)"
            />
          </label>
          {matches.length > 0 && (
            <div class="mt-1.5 max-h-36 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800" aria-label="Chemical matches">
              {matches.map(chemical => (
                <button
                  key={chemical.name}
                  type="button"
                  class="block w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-white dark:hover:bg-slate-700 transition"
                  onClick={() => update(index, { query: chemical.name, name: chemical.name, mw: chemical.mw, waters: 0 })}
                >
                  <strong class="font-medium text-slate-900 dark:text-slate-100">{chemical.name}</strong>
                  <span class="text-slate-500 ml-1.5">— {chemical.mw} g/mol{chemical.hydrateOf ? ` (${chemical.waters} waters)` : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Target & Form Row */}
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate-500">Form</span>
            <select
              value={component.kind}
              class={fieldClass}
              onChange={event => update(index, { kind: (event.target as HTMLSelectElement).value as 'solid' | 'stock' })}
            >
              <option value="solid">Solid Powder / Crystals</option>
              <option value="stock">Liquid Stock Solution</option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate-500">Target In Recipe</span>
            <span class="flex">
              <input
                aria-label={`Target concentration${labelSuffix}`}
                type="number"
                min="0"
                step="any"
                value={component.target.value}
                onInput={event => update(index, { target: { ...component.target, value: Number((event.target as HTMLInputElement).value) } })}
                class={`${fieldClass} rounded-r-none mono`}
              />
              <select
                aria-label={`Target unit${labelSuffix}`}
                value={component.target.unit}
                onChange={event => update(index, { target: { ...component.target, unit: (event.target as HTMLSelectElement).value as RecipeUnit } })}
                class="rounded-r-lg border border-l-0 border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option>M</option>
                <option>mM</option>
                <option>%</option>
                <option value="x">×</option>
              </select>
            </span>
          </label>
        </div>

        {/* Extra details (MW, waters, stock concentrations) */}
        {component.kind === 'solid' ? (
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-xs font-medium text-slate-500">Molecular weight (g/mol)</span>
              <input
                aria-label={`Molecular weight${labelSuffix}`}
                type="number"
                step="any"
                value={component.mw ?? ''}
                onInput={event => update(index, { mw: Number((event.target as HTMLInputElement).value) })}
                class={`${fieldClass} mono`}
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-medium text-slate-500">Additional waters (hydrate)</span>
              <input
                aria-label={`Additional waters${labelSuffix}`}
                type="number"
                min="0"
                step="1"
                value={component.waters ?? 0}
                disabled={explicitForm(component.name)}
                onInput={event => update(index, { waters: Number((event.target as HTMLInputElement).value) })}
                class={`${fieldClass} mono disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </label>
          </div>
        ) : (
          <div class="grid gap-3 sm:grid-cols-3">
            <label class="block">
              <span class="mb-1 block text-xs font-medium text-slate-500">Stock concentration</span>
              <input
                type="number"
                step="any"
                value={component.stockConc ?? 1}
                onInput={event => update(index, { stockConc: Number((event.target as HTMLInputElement).value) })}
                class={`${fieldClass} mono`}
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-medium text-slate-500">Stock unit</span>
              <select
                value={component.stockUnit ?? 'M'}
                onChange={event => update(index, { stockUnit: (event.target as HTMLSelectElement).value as RecipeUnit })}
                class={fieldClass}
              >
                <option>M</option>
                <option>mM</option>
                <option>%</option>
                <option value="x">×</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-medium text-slate-500">Density (g/mL, optional)</span>
              <input
                type="number"
                step="any"
                value={component.density ?? ''}
                onInput={event => {
                  const value = (event.target as HTMLInputElement).value;
                  update(index, { density: value ? Number(value) : undefined });
                }}
                class={`${fieldClass} mono`}
              />
            </label>
          </div>
        )}

        <div class="pt-1 flex justify-end">
          <button
            type="button"
            onClick={() => void lookup(index)}
            class="text-[11px] text-slate-500 hover:text-accent-600 dark:hover:text-accent-400 transition underline"
          >
            PubChem MW lookup
          </button>
        </div>
      </div>
    );
  };

  return (
    <ToolLayout
      icon="🧪"
      title="Buffer & Media Recipes"
      blurb="Build recipes from exact chemical forms, solids and liquid stocks with automated unit-safe solving."
      wide={true}
      mobileResultSummary={
        calculation.error ? (
          <span class="text-rose-600 dark:text-rose-400 font-semibold">{calculation.error}</span>
        ) : (
          <span><strong>{calculation.rows.length} components</strong> for <strong class="text-accent-700 dark:text-accent-300 font-mono">{s.volume.value} {s.volume.unit}</strong> (pH {s.pH})</span>
        )
      }
      inputs={
        <div class="space-y-4">
          {/* Preset Selector & Action Buttons */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recipe Preset</span>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSaveDialog(true)}
                  class="text-xs text-accent-600 dark:text-accent-400 hover:underline font-medium"
                >
                  + Save Custom
                </button>
                <button
                  type="button"
                  onClick={() => setShowContributeModal(true)}
                  class="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:underline font-medium"
                >
                  🚀 Contribute
                </button>
              </div>
            </div>

            <select
              id="buffer-preset"
              aria-label="Recipe preset"
              defaultValue=""
              onChange={event => loadPreset((event.target as HTMLSelectElement).value)}
              class={fieldClass}
            >
              <option value="">Choose a recipe preset…</option>
              <optgroup label="Standard Salines & Cell Culture Buffers">
                {PRESETS.filter(p => ['PBS_1x', 'PBST_1x', 'TBS_1x', 'TBST_1x', 'HBS_1x', 'TE_1x', 'SSC_20x'].includes(p.id)).map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </optgroup>
              <optgroup label="Electrophoresis & Blotting Buffers">
                {PRESETS.filter(p => ['TAE_1x', 'TBE_1x', 'TG_SDS_1x', 'Towbin_1x', 'Laemmli_2x'].includes(p.id)).map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </optgroup>
              <optgroup label="Lysis & Protein Purification">
                {PRESETS.filter(p => ['RIPA_1x', 'IMAC_Binding', 'IMAC_Elution', 'STE_1x'].includes(p.id)).map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </optgroup>
              <optgroup label="Bacterial Growth Media">
                {PRESETS.filter(p => ['LB_Miller', 'YT_2x', 'TB', 'SOB', 'SOC'].includes(p.id)).map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </optgroup>
              {customPresets.length > 0 && (
                <optgroup label="My Custom Saved Buffers">
                  {customPresets.map(preset => (
                    <option key={preset.id} value={preset.id}>⭐ {preset.name}</option>
                  ))}
                </optgroup>
              )}
            </select>

            {customPresets.length > 0 && (
              <div class="space-y-1.5 pt-1">
                <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">My Saved Buffers:</span>
                <div class="flex flex-wrap gap-1.5">
                  {customPresets.map(cp => (
                    <div key={cp.id} class="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <button type="button" onClick={() => loadPreset(cp.id)} class="hover:underline font-medium">
                        ⭐ {cp.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCustomBuffer(cp.id)}
                        class="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete custom preset"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showSaveDialog && (
              <div class="rounded-lg border border-accent-200 bg-accent-50/50 p-3 dark:border-accent-800 dark:bg-accent-950/30 space-y-2">
                <span class="text-xs font-semibold text-accent-900 dark:text-accent-200 block">
                  Save Current Recipe to My Buffers
                </span>
                <div class="flex gap-2">
                  <input
                    type="text"
                    placeholder="Buffer name (e.g. My Elution Buffer)"
                    value={saveName}
                    onInput={e => setSaveName((e.target as HTMLInputElement).value)}
                    class={`${fieldClass} text-xs py-1.5 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={saveCustomBuffer}
                    class="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-700 transition"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveDialog(false)}
                    class="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <Quantity id="buffer-volume" label="Final Volume" value={s.volume} units={['L', 'mL']} onChange={volume => set({ volume })} />

          {/* Component list */}
          <div class="space-y-3">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              <span>Recipe Components ({s.components.length})</span>
            </div>
            {s.components.map(componentEditor)}
          </div>

          <button
            type="button"
            onClick={() => set({ components: [...s.components, { ...DEFAULT_COMPONENT, id: newId(), query: '', name: 'New component' }] })}
            class="w-full rounded-xl border-2 border-dashed border-slate-300 p-3 text-xs font-semibold text-slate-600 hover:border-accent-500 hover:text-accent-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-accent-400 transition"
          >
            + Add Component
          </button>

          {lookupStatus && <p role="status" class="text-xs text-slate-500 px-1">{lookupStatus}</p>}

          {/* pH Helper Card */}
          <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500">
              Henderson-Hasselbalch pH Helper
            </summary>
            <div class="mt-3 space-y-3">
              <div class="grid gap-3 sm:grid-cols-3">
                <label>
                  <span class="mb-1 block text-xs font-medium text-slate-500">Buffer Species</span>
                  <select value={s.bufferId} onChange={event => set({ bufferId: (event.target as HTMLSelectElement).value })} class={fieldClass}>
                    {BUFFER_PKA.map(buffer => <option key={buffer.id} value={buffer.id}>{buffer.name}</option>)}
                  </select>
                </label>
                <label>
                  <span class="mb-1 block text-xs font-medium text-slate-500">Target pH</span>
                  <input type="number" step="0.1" value={s.pH} onInput={event => set({ pH: Number((event.target as HTMLInputElement).value) })} class={fieldClass} />
                </label>
                <label>
                  <span class="mb-1 block text-xs font-medium text-slate-500">Temperature (°C)</span>
                  <input type="number" step="1" value={s.temperature} onInput={event => set({ temperature: Number((event.target as HTMLInputElement).value) })} class={fieldClass} />
                </label>
              </div>
              <div class="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                pKa at {s.temperature} °C: <strong class="mono">{correctedPka.toFixed(3)}</strong> · Base : Acid ratio: <strong class="mono">{Number(ratio.toPrecision(4))}:1</strong>
              </div>
            </div>
          </details>

          {/* Contribute Modal */}
          {showContributeModal && (
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div class="max-w-lg w-full rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 space-y-4">
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="font-bold text-lg text-slate-900 dark:text-slate-100">Contribute Buffer Recipe</h3>
                    <p class="text-xs text-slate-500 mt-1">
                      Share your recipe with scientists worldwide by submitting it to the open-source database!
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowContributeModal(false)} class="text-slate-400 hover:text-slate-600 text-lg">✕</button>
                </div>

                <div class="text-xs text-slate-600 dark:text-slate-300 space-y-2">
                  <p>
                    <strong>How to submit your buffer:</strong>
                  </p>
                  <ol class="list-decimal list-inside space-y-1 pl-1 text-slate-500">
                    <li>Click <strong>Submit via GitHub Issue</strong> below to open a pre-filled submission on the Toolbox repo.</li>
                    <li>Or click <strong>Copy Recipe JSON</strong> and paste it into a GitHub discussion or PR.</li>
                    <li>Once reviewed, it will be added to the official preset library for all users!</li>
                  </ol>
                </div>

                <div class="overflow-x-auto rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                  <pre class="mono text-[11px] text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">{recipeJsonString}</pre>
                </div>

                <div class="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(recipeJsonString);
                      alert('Recipe JSON copied to clipboard!');
                    }}
                    class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Copy JSON
                  </button>
                  <a
                    href={`https://github.com/dzyla/toolbox/issues/new?title=${encodeURIComponent(`[Buffer Preset]: ${saveName || s.components[0]?.name || 'New Buffer'}`)}&body=${encodeURIComponent(`### New Buffer Recipe Submission\n\n\`\`\`json\n${recipeJsonString}\n\`\`\`\n\n**Source / Reference:** (e.g. Cold Spring Harbor, Sambrook, paper citation)`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-lg bg-accent-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-700 transition inline-block text-center"
                  >
                    Submit via GitHub Issue ↗
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      }
      results={
        calculation.error ? (
          <p role="alert" class="text-red-600 p-4">{calculation.error}</p>
        ) : (
          <div data-testid="buffer-results" class="space-y-5">
            {/* Main Preparation Protocol Card */}
            <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Preparation Protocol — {s.volume.value} {s.volume.unit}
                  </h2>
                  <p class="text-xs text-slate-500">
                    Weigh and dissolve each component in order into purified water
                  </p>
                </div>
                <span class="rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 dark:bg-accent-950 dark:text-accent-300">
                  {calculation.rows.length} Components
                </span>
              </div>

              {/* Component Cards List */}
              <div class="divide-y divide-slate-100 dark:divide-slate-800">
                {calculation.rows.map((row, idx) => {
                  const comp = s.components[idx];
                  const isChecked = !!checkedComponents[row.name];
                  return (
                    <div
                      key={row.name}
                      onClick={() => setCheckedComponents(prev => ({ ...prev, [row.name]: !prev[row.name] }))}
                      class={`py-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-2 transition cursor-pointer border ${isChecked ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 opacity-60' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30 border-transparent'}`}
                    >
                      <div class="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setCheckedComponents(prev => ({ ...prev, [row.name]: !prev[row.name] }))}
                          onClick={e => e.stopPropagation()}
                          class="w-4 h-4 rounded accent-emerald-600 cursor-pointer shrink-0"
                        />
                        <div class="space-y-0.5">
                          <h4 class={`text-base font-bold transition ${isChecked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                            {row.name}
                          </h4>
                          <div class="flex items-center gap-2 text-xs text-slate-500">
                            {comp && (
                              <span>
                                Target: <strong class="text-slate-700 dark:text-slate-300">{comp.target.value} {comp.target.unit}</strong>
                              </span>
                            )}
                            {comp?.kind === 'solid' && comp.mw && (
                              <span>· MW {comp.mw.toFixed(2)} g/mol</span>
                            )}
                            {comp?.kind === 'stock' && (
                              <span>· Stock: {comp.stockConc} {comp.stockUnit}</span>
                            )}
                            {row.mass_g !== undefined && (
                              <span class="text-slate-400">({Number(row.mass_g.toPrecision(4))} g by density)</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div class="text-right ml-auto">
                        <span class={`inline-block rounded-xl border px-3.5 py-1.5 font-mono text-base font-bold shadow-xs transition ${isChecked ? 'border-emerald-200 bg-emerald-100/60 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : 'border-accent-200 bg-accent-50 text-accent-700 dark:border-accent-800 dark:bg-accent-950/70 dark:text-accent-300'}`}>
                          {displayAmount(row.amount, row.unit)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bench Instructions */}
              <div class="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300 space-y-1.5">
                <strong class="font-semibold text-slate-900 dark:text-slate-100 block">Preparation Steps:</strong>
                <ol class="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400">
                  <li>Add ~80% of final volume of purified water ({Math.round(toSI(s.volume) * 800)} mL) to a beaker.</li>
                  <li>Weigh out or pipette each component listed above and dissolve with magnetic stirring.</li>
                  <li>Adjust pH to desired value (e.g. {s.pH.toFixed(1)}) with concentrated HCl or NaOH.</li>
                  <li>Transfer to a graduated cylinder, bring to final volume ({s.volume.value} {s.volume.unit}) with water, and sterile filter (0.22 µm) or autoclave as appropriate.</li>
                </ol>
              </div>
            </div>
          </div>
        )
      }
      actions={
        <div class="space-y-2">
          <ActionBar onCopy={() => copyText} shareUrl={shareUrl} />
          <button
            type="button"
            onClick={exportCsv}
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition"
          >
            Export Recipe CSV
          </button>
        </div>
      }
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
