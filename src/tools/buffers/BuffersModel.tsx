import { useEffect, useMemo, useState } from 'preact/hooks';
import presetsJson from '@/data/buffer-presets.json';
import { findSystem, matchForm } from '@/core/buffers/pka';
import { BufferRecipeError } from '@/core/buffers/recipe';
import { solveMixture, type MixtureResult } from '@/core/buffers/mixture';
import { toSI, UnitError } from '@/core/units';
import { scienceText } from '@/app/components/SciencePanel';
import { downloadText, toCsv } from '@/lib/export';
import { useUrlState } from '@/lib/url-state';
import { isPositiveNumber, isRecord, loadLibrary, saveLibrary, type LibrarySpec } from '@/lib/local-library';
import { recipeCsvRows, recipeText } from './recipe-text';
import { SCIENCE } from './science';
import {
  DEFAULTS, DEFAULT_COMPONENT, defaultBuffer, fromMixture, isMixtureComponent, mixDefaults, newId, toMixture,
  type BufferEditor, type EditorComponent, type Preset, type State,
} from './state';

const CUSTOM_BUFFERS: LibrarySpec<Preset> = {
  key: 'bb.library.buffers',
  version: 1,
  legacyKeys: ['toolbox_custom_buffers'],
  validate: (v): v is Preset => isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string'
    && isPositiveNumber(v.finalVolume_L) && Array.isArray(v.components) && v.components.every(isMixtureComponent),
};
export const PRESETS = presetsJson.presets as unknown as Preset[];

export function useBuffersModel() {
  const [state, shareUrl] = useUrlState<State>('buffers', DEFAULTS);
  const [lookupStatus, setLookupStatus] = useState('');
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const update = (index: number, patch: Partial<EditorComponent>) => {
    set({ components: s.components.map((component, i) => i === index ? { ...component, ...patch } : component) });
  };

  useEffect(() => { setCustomPresets(loadLibrary(CUSTOM_BUFFERS)); }, []);

  const calculation = useMemo((): { result?: MixtureResult; error?: string } => {
    try {
      return {
        result: solveMixture(s.components.map(c => toMixture(c, s.workingTemp_C)), {
          finalVolume_L: toSI(s.volume), workingTemp_C: s.workingTemp_C, ionicCorrection: s.ionicCorrection,
        }),
      };
    } catch (error) {
      if (error instanceof BufferRecipeError || error instanceof UnitError) return { error: error.message };
      throw error;
    }
  }, [s]);

  const volumeLabel = `${s.volume.value} ${s.volume.unit}`;
  const copyText = calculation.result ? recipeText(calculation.result, volumeLabel, s.workingTemp_C, scienceText(SCIENCE)) : calculation.error ?? '';
  const exportCsv = () => {
    if (!calculation.result) return;
    downloadText([
      ...scienceText(SCIENCE).split('\n').map(line => `# ${line}`),
      toCsv(recipeCsvRows(calculation.result)),
    ].join('\n'), 'buffer-recipe.csv', 'text/csv;charset=utf-8');
  };

  const saveCustomBuffer = () => {
    if (!saveName.trim()) return;
    const preset: Preset = {
      id: `custom_${Date.now()}`, name: saveName.trim(), finalVolume_L: toSI(s.volume),
      source: 'User Custom Buffer (Local Storage)', components: s.components.map(c => toMixture(c, s.workingTemp_C)),
    };
    const updated = [...customPresets, preset];
    setCustomPresets(updated); saveLibrary(CUSTOM_BUFFERS, updated);
    setShowSaveDialog(false); setSaveName('');
  };
  const deleteCustomBuffer = (id: string) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated); saveLibrary(CUSTOM_BUFFERS, updated);
  };
  const loadPreset = (id: string) => {
    const preset = [...PRESETS, ...customPresets].find(item => item.id === id);
    if (!preset) return;
    set({
      volume: { value: preset.finalVolume_L >= 1 ? preset.finalVolume_L : preset.finalVolume_L * 1000, unit: preset.finalVolume_L >= 1 ? 'L' : 'mL' },
      components: preset.components.map(fromMixture),
    });
    setChecked({});
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

  const recipeJson = useMemo(() => JSON.stringify({
    id: saveName.trim() ? saveName.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'custom_recipe',
    name: saveName.trim() || 'My Custom Buffer',
    finalVolume_L: toSI(s.volume), source: 'Community Contribution',
    components: s.components.map(c => toMixture(c, s.workingTemp_C)),
  }, null, 2), [s, saveName]);

  const addComponent = () => set({ components: [...s.components, { ...DEFAULT_COMPONENT, id: newId(), query: '', name: 'New component' }] });
  const removeComponent = (index: number) => set({ components: s.components.filter((_, i) => i !== index) });
  const bufferOf = (index: number) => s.components[index]?.buffer ?? defaultBuffer();
  const setBuffer = (index: number, patch: Partial<BufferEditor>) => update(index, { buffer: { ...bufferOf(index), ...patch } });
  const setSystem = (index: number, systemId: string) => {
    const system = findSystem(systemId);
    if (!system) return;
    update(index, { name: system.name, query: system.name, buffer: { ...defaultBuffer(systemId), mode: bufferOf(index).mode } });
  };
  const setMethod = (index: number, method: BufferEditor['method']) => {
    const system = findSystem(bufferOf(index).systemId);
    setBuffer(index, method === 'mix-forms' && system ? { method, ...mixDefaults(system) } : { method });
  };
  const makeBuffer = (index: number) => {
    const hit = matchForm(s.components[index]?.name ?? '');
    if (!hit) return;
    update(index, {
      kind: 'buffer', name: hit.system.name, query: hit.system.name,
      buffer: { ...defaultBuffer(hit.system.id), formId: hit.form.id },
    });
  };
  const setKind = (index: number, kind: EditorComponent['kind']) => {
    const c = s.components[index];
    if (!c) return;
    if (kind !== 'buffer') return update(index, { kind });
    const hit = matchForm(c.name);
    const system = hit?.system ?? findSystem('tris')!;
    update(index, {
      kind: 'buffer', name: system.name, query: system.name,
      target: { value: c.target.value, unit: c.target.unit === 'M' ? 'M' : 'mM' },
      buffer: { ...defaultBuffer(system.id), ...(hit ? { formId: hit.form.id } : {}) },
    });
  };
  const toggleChecked = (key: string) => setChecked(prev => ({ ...prev, [key]: !prev[key] }));

  return {
    s, set, update, shareUrl, calculation, copyText, exportCsv, lookup, lookupStatus,
    customPresets, loadPreset, saveCustomBuffer, deleteCustomBuffer,
    showSaveDialog, setShowSaveDialog, saveName, setSaveName, showContributeModal, setShowContributeModal, recipeJson,
    addComponent, removeComponent, setKind, setBuffer, setSystem, setMethod, makeBuffer, checked, toggleChecked,
  };
}
export type BuffersModel = ReturnType<typeof useBuffersModel>;
