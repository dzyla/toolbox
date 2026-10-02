import type { Preset } from '../state';
import { fieldClass } from './ui';

export interface PresetBarProps {
  presets: Preset[];                 // the built-in PRESETS
  customPresets: Preset[];
  saveName: string; showSaveDialog: boolean;
  onSaveName: (v: string) => void; onShowSave: (open: boolean) => void;
  onSave: () => void; onDelete: (id: string) => void; onLoad: (id: string) => void;
  onContribute: () => void;
}

export function PresetBar(props: PresetBarProps) {
  const { presets: PRESETS, customPresets, saveName, showSaveDialog } = props;
  return (
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recipe Preset</span>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => props.onShowSave(true)}
                  class="text-xs text-accent-600 dark:text-accent-400 hover:underline font-medium"
                >
                  + Save Custom
                </button>
                <button
                  type="button"
                  onClick={() => props.onContribute()}
                  class="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:underline font-medium"
                >
                  🚀 Contribute
                </button>
              </div>
            </div>

            <select
              id="buffer-preset"
              aria-label="Recipe preset"
              defaultValue=""
              onChange={event => props.onLoad((event.target as HTMLSelectElement).value)}
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
                <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">My Saved Buffers:</span>
                <div class="flex flex-wrap gap-1.5">
                  {customPresets.map(cp => (
                    <div key={cp.id} class="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <button type="button" onClick={() => props.onLoad(cp.id)} class="hover:underline font-medium">
                        ⭐ {cp.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onDelete(cp.id)}
                        class="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
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
                    onInput={e => props.onSaveName((e.target as HTMLInputElement).value)}
                    class={`${fieldClass} text-xs py-1.5 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={props.onSave}
                    class="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-700 transition"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onShowSave(false)}
                    class="rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
  );
}
