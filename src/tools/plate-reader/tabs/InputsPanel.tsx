import { ImportAlert } from '@/app/components/ImportAlert';
import { type NormalizationMode, type OutlierMethod } from '@/core/plates/reader';
import type { PlateReaderModel, State } from '../PlateReaderModel';

export function InputsPanel({ m }: { m: PlateReaderModel }) {
  const {
    blankMean,
    customBlankWells,
    customMaxWells,
    customMinWells,
    derivedGroups,
    fileInputRef,
    flashToast,
    handleFileUpload,
    hasLayout,
    importError,
    loadPreset,
    maxRef,
    maxVal,
    minRef,
    minVal,
    negMean,
    parsedPlate,
    posMean,
    rawText,
    s,
    set,
    setExcludedWellIds,
    setHasLayout,
    setLabelOverrides,
    setLayoutAnnotations,
    setRawText,
  } = m;
  return (
    <div class="space-y-4">
      {/* Preset Loaders & File Input */}
      <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Load Plate Data
          </span>
          <span class="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {`${parsedPlate.format}-Well · ${parsedPlate.vendorHint.toUpperCase()}`}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-1.5 mb-2.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => loadPreset('tecan_96')}
            class={`p-2 rounded-lg text-left transition border ${s.presetKey === 'tecan_96' ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
          >
            <div class="flex items-center gap-1.5">
              <span>🧪</span>
              <span class="font-semibold">Tecan 96</span>
            </div>
            <div class="text-[10px] text-slate-600 dark:text-slate-400">Dose-Response Assay</div>
          </button>

          <button
            type="button"
            onClick={() => loadPreset('elisa_96')}
            class={`p-2 rounded-lg text-left transition border ${s.presetKey === 'elisa_96' ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
          >
            <div class="flex items-center gap-1.5">
              <span>🧬</span>
              <span class="font-semibold">ELISA 96</span>
            </div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400">Standards &amp; Unknowns</div>
          </button>

          <button
            type="button"
            onClick={() => loadPreset('biotek_384')}
            class={`p-2 rounded-lg text-left transition border ${s.presetKey === 'biotek_384' ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
          >
            <div class="flex items-center gap-1.5">
              <span>🔬</span>
              <span class="font-semibold">BioTek 384</span>
            </div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400">HTS Kinase Screen</div>
          </button>

          <button
            type="button"
            onClick={() => loadPreset('raw_96')}
            class={`p-2 rounded-lg text-left transition border ${s.presetKey === 'raw_96' ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
          >
            <div class="flex items-center gap-1.5">
              <span>📋</span>
              <span class="font-semibold">Raw 96 Only</span>
            </div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400">No Layout Attached</div>
          </button>
        </div>

        {/* Paste / Edit Textarea */}
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Raw Signal CSV / Matrix</span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="font-semibold text-accent-600 hover:text-accent-700 dark:text-accent-400 cursor-pointer"
              >
                📂 Upload File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleFileUpload}
                class="hidden"
              />
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  setRawText('');
                  setExcludedWellIds(new Set());
                  setHasLayout(false);
                  flashToast('Cleared data');
                }}
                class="text-rose-700 hover:text-rose-700 dark:text-rose-400 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
          <ImportAlert message={importError} />

          <textarea
            rows={4}
            value={rawText}
            onInput={(e) => {
              setRawText((e.target as HTMLTextAreaElement).value);
              set({ presetKey: 'custom', displayMode: 'raw' });
            }}
            placeholder="Paste Tecan, BMG, BioTek, SoftMax, or CSV matrix text..."
            class="w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px] leading-snug dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Layout Status & Quick Toggle */}
      <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Plate Layout &amp; Annotations
          </span>
          <span class={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${hasLayout ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
            {hasLayout ? 'Layout Defined' : 'No Layout (Raw Only)'}
          </span>
        </div>

        <p class="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
          {hasLayout
            ? `${derivedGroups.length} groups assigned. Adjust labels, dilutions, or standard curves in the Layout tab.`
            : 'Showing pure raw measurements. Click below to upload annotations, define serial dilutions, or paint wells.'}
        </p>

        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => set({ activeTab: 'layout' })}
            class="flex-1 py-1.5 px-2.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-white font-semibold text-xs transition shadow-xs text-center"
          >
            ✏️ {hasLayout ? 'Edit Layout & Labels' : 'Define Plate Layout'}
          </button>
          {hasLayout && (
            <button
              type="button"
              onClick={() => {
                setHasLayout(false);
                setLayoutAnnotations({});
                setLabelOverrides({});
                set({ displayMode: 'raw' });
                flashToast('Plate converted to unannotated raw mode');
              }}
              class="py-1.5 px-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Clear Layout
            </button>
          )}
        </div>
      </div>

      {/* Normalization Mode & Scientific Min/Max References */}
      <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <span class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Normalization Engine
        </span>

        <div class="grid grid-cols-1 gap-1 text-xs">
          {[
            { id: 'percent-control', label: '% of Control (POC)', formula: '100 × (val - min) / (max - min)', icon: '📈' },
            { id: 'percent-inhibition', label: '% Inhibition (NPI)', formula: '100 × [1 - (val - min) / (max - min)]', icon: '⚡' },
            { id: 'blank-subtracted', label: 'Blank Subtracted', formula: 'val - blank_mean', icon: '🧪' },
            { id: 'fold-change', label: 'Fold Change', formula: '(val - blank) / (control - blank)', icon: '🔄' },
            { id: 'raw', label: 'Raw Optical Density / RLU', formula: 'No normalization (Direct raw signal)', icon: '📊' },
          ].map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => set({ normalizationMode: m.id as NormalizationMode })}
              class={`flex items-start gap-2 p-2 rounded-lg text-left transition border ${s.normalizationMode === m.id ? 'border-accent-500 bg-accent-50/80 text-accent-900 dark:border-accent-600 dark:bg-accent-950/40 dark:text-accent-200' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'}`}
            >
              <span class="text-sm mt-0.5">{m.icon}</span>
              <div class="min-w-0 flex-1">
                <div class="font-semibold">{m.label}</div>
                <div class="text-[10px] text-slate-600 dark:text-slate-400 font-mono truncate">{m.formula}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Expanded Min/Max Reference Controls */}
        {s.normalizationMode !== 'raw' && (
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
            <span class="block font-bold text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Reference Controls Selection
            </span>

            {/* Blank Subtraction Method */}
            <div>
              <label class="block text-slate-600 dark:text-slate-400 mb-1">Blank Reference (0-Signal)</label>
              <select aria-label="Blank Reference (0-Signal)"
                value={s.blankMethod}
                onChange={(e) => set({ blankMethod: (e.target as HTMLSelectElement).value as State['blankMethod'] })}
                class="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="global">Global Blank Wells Mean ({blankMean.toFixed(3)})</option>
                <option value="row">Row-Specific Blanks</option>
                <option value="column">Column-Specific Blanks</option>
                <option value="wells">Custom Selected Wells ({customBlankWells.size} wells)</option>
                <option value="none">No Blank Subtraction</option>
              </select>
            </div>

            {/* Min Baseline Reference */}
            <div>
              <label class="block text-slate-600 dark:text-slate-400 mb-1">0% / Baseline Reference (Min)</label>
              <div class="flex gap-2">
                <select
                  aria-label="0% / Baseline Reference (Min)"
                  value={s.minMethod}
                  onChange={(e) => set({ minMethod: (e.target as HTMLSelectElement).value as State['minMethod'] })}
                  class="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="blank">Blank Wells Mean ({blankMean.toFixed(3)})</option>
                  <option value="neg-ctrl">Negative Control Mean ({negMean.toFixed(3)})</option>
                  <option value="lowest">Lowest Plate Value ({minVal.toFixed(3)})</option>
                  <option value="wells">Custom Selected Wells ({customMinWells.size} wells)</option>
                  <option value="custom">Fixed Numeric Value</option>
                </select>
                {s.minMethod === 'custom' && (
                  <input
                    type="number"
                    step="any"
                    value={s.customMinValue}
                    onChange={(e) => set({ customMinValue: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                    class="w-20 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs text-right dark:border-slate-700 dark:bg-slate-800"
                    placeholder="Min val"
                  />
                )}
              </div>
            </div>

            {/* Max Top Reference */}
            <div>
              <label class="block text-slate-600 dark:text-slate-400 mb-1">100% / Top Reference (Max)</label>
              <div class="flex gap-2">
                <select
                  aria-label="100% / Top Reference (Max)"
                  value={s.maxMethod}
                  onChange={(e) => set({ maxMethod: (e.target as HTMLSelectElement).value as State['maxMethod'] })}
                  class="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="pos-ctrl">Positive Control Mean ({posMean.toFixed(3)})</option>
                  <option value="highest">Highest Plate Value ({maxVal.toFixed(3)})</option>
                  <option value="wells">Custom Selected Wells ({customMaxWells.size} wells)</option>
                  <option value="custom">Fixed Numeric Value</option>
                </select>
                {s.maxMethod === 'custom' && (
                  <input
                    type="number"
                    step="any"
                    value={s.customMaxValue}
                    onChange={(e) => set({ customMaxValue: parseFloat((e.target as HTMLInputElement).value) || 100 })}
                    class="w-20 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs text-right dark:border-slate-700 dark:bg-slate-800"
                    placeholder="Max val"
                  />
                )}
              </div>
            </div>

            {/* Live reference values */}
            <div class="pt-2 grid grid-cols-3 gap-1.5 text-center font-mono text-[11px]">
              <div class="rounded-md bg-slate-50 p-1 dark:bg-slate-800">
                <span class="block text-[9px] uppercase text-slate-500 dark:text-slate-400">Blank</span>
                <span class="font-bold">{blankMean.toFixed(2)}</span>
              </div>
              <div class="rounded-md bg-slate-50 p-1 dark:bg-slate-800">
                <span class="block text-[9px] uppercase text-slate-500 dark:text-slate-400">Min Ref</span>
                <span class="font-bold">{minRef.toFixed(2)}</span>
              </div>
              <div class="rounded-md bg-emerald-50 p-1 dark:bg-emerald-950/40">
                <span class="block text-[9px] uppercase text-emerald-700 dark:text-emerald-400">Max Ref</span>
                <span class="font-bold text-emerald-700 dark:text-emerald-300">{maxRef.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quality Control & Outlier Testing */}
      <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <span class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          QC &amp; Outlier Detection (Malo 2006)
        </span>

        <div class="space-y-2 text-xs">
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1">Outlier Method</label>
            <div class="grid grid-cols-4 gap-1 font-medium text-[11px]">
              {(['grubbs', 'sd-cutoff', 'both', 'none'] as OutlierMethod[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ outlierMethod: m })}
                  class={`py-1 px-1.5 rounded-lg border text-center transition ${s.outlierMethod === m ? 'border-accent-500 bg-accent-600 text-white shadow-xs' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  {m === 'grubbs' ? "Grubbs'" : m === 'sd-cutoff' ? '> 2.5×SD' : m === 'both' ? 'Both' : 'Off'}
                </button>
              ))}
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 pt-1">
            <div>
              <label class="block text-slate-600 dark:text-slate-400">Replicate %CV Warning</label>
              <span class="text-[10px] text-slate-500 dark:text-slate-400">Standard assay threshold 15%</span>
            </div>
            <div class="flex items-center gap-1">
              <input
                type="number"
                aria-label="Replicate %CV Warning"
                min="1"
                max="100"
                step="any"
                value={s.cvThreshold}
                onChange={(e) => set({ cvThreshold: parseFloat((e.target as HTMLInputElement).value) || 15 })}
                class="w-16 rounded-md border border-slate-300 px-2 py-1 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
              />
              <span class="text-xs text-slate-500 dark:text-slate-400">%</span>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={s.autoExcludeOutliers}
                onChange={(e) => set({ autoExcludeOutliers: (e.target as HTMLInputElement).checked })}
                class="rounded border-slate-300 text-accent-600 dark:text-accent-400 focus:ring-accent-500"
              />
              <span class="text-xs text-slate-700 dark:text-slate-300 font-medium">
                Auto-exclude flagged outliers from group mean &amp; SD
              </span>
            </label>
          </div>
        </div>
      </div>

    </div>
  );
}
