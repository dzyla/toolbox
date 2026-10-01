import { SAMPLE_DATASETS, type FitModelType } from '@/core/fitting';
import { ImportAlert } from '@/app/components/ImportAlert';
import type { FittingModel } from '../FittingModel';

export function InputsPanel({ m }: { m: FittingModel }) {
  const {
    fileInputRef,
    handleFileUpload,
    handleSelectPreset,
    importError,
    parsedData,
    rawText,
    s,
    set,
    setRawText,
  } = m;
  return (
    <div class="space-y-4">
      {/* Model Selector */}
      <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <label for="model-select" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Regression Model
        </label>
        <select
          id="model-select"
          value={s.modelType}
          onChange={(e) => {
            const m = (e.target as HTMLSelectElement).value as FitModelType;
            set({
              modelType: m,
              xLogScale: m === '4pl' || m === '5pl' || m === 'two_site_binding',
              activeDiagnosticPlot: 'none',
            });
          }}
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 font-medium"
        >
          <option value="4pl">4-Parameter Logistic (4PL / EC50 / IC50)</option>
          <option value="5pl">5-Parameter Logistic (5PL / Asymmetric EC50)</option>
          <option value="linear">Linear Regression (y = m·x + b)</option>
          <option value="linear_origin">Linear through Origin (y = m·x)</option>
          <option value="michaelis_menten">Michaelis-Menten Kinetics (Vmax, Km)</option>
          <option value="substrate_inhibition">Substrate Inhibition (Haldane: Vmax, Km, Ki)</option>
          <option value="spr_association">BLI / SPR Association Phase (kobs, Req)</option>
          <option value="spr_dissociation">BLI / SPR Dissociation Phase (koff)</option>
          <option value="spr_sensorgram">BLI / SPR Sensorgram (Full Cycle kon, koff, KD)</option>
          <option value="two_site_binding">Two-Site Specific Binding (Bmax1, Kd1, Bmax2, Kd2)</option>
          <option value="exp_decay">Exponential Decay (Half-Life t1/2)</option>
          <option value="exp_growth">Exponential Growth (y = y₀ · e^(k·x))</option>
          <option value="gaussian">Gaussian Peak Fit (Amplitude, Center, Width)</option>
        </select>
      </div>

      {/* Sample Presets */}
      <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Load Example Dataset
        </label>
        <div class="space-y-1">
          {Object.entries(SAMPLE_DATASETS).map(([k, ds]) => (
            <button
              key={k}
              type="button"
              onClick={() => handleSelectPreset(k)}
              class={`w-full text-left p-2 rounded-lg text-xs font-medium transition ${s.presetKey === k ? 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-300 dark:border-accent-700' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              {ds.name}
            </button>
          ))}
        </div>
      </div>

      {/* Data Input Area */}
      <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between">
          <label for="data-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Tabular Data (X, Y₁, Y₂...)
          </label>
          <span class="text-[11px] text-slate-500 dark:text-slate-400 mono">
            {parsedData.length} points
          </span>
        </div>
        <textarea
          id="data-input"
          aria-label="Tabular Data"
          rows={8}
          value={rawText}
          onInput={(e) => {
            setRawText((e.target as HTMLTextAreaElement).value);
            set({ presetKey: '' });
          }}
          placeholder={`# X\tY1\tY2...\n0.1\t10\t12\n1.0\t25\t27`}
          class="w-full p-2.5 mono text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-950 leading-relaxed resize-y"
        />
        <p class="text-[11px] text-slate-500 dark:text-slate-400">
          💡 Separate columns with tabs, commas, or spaces. Multiple Y columns are treated as replicate measurements.
        </p>
      </div>

      {/* Plot Controls */}
      <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 text-xs">
        <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
          Plot Settings
        </span>
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={s.xLogScale}
            onChange={(e) => set({ xLogScale: (e.target as HTMLInputElement).checked })}
            class="rounded text-accent-600 dark:text-accent-400 accent-accent-600"
          />
          <span>Logarithmic X Axis (log₁₀)</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={s.showErrorBars}
            onChange={(e) => set({ showErrorBars: (e.target as HTMLInputElement).checked })}
            class="rounded text-accent-600 dark:text-accent-400 accent-accent-600"
          />
          <span>Show Error Bars (SD / Replicates)</span>
        </label>
      </div>

      {/* Contextual Parameters for Enzyme Kinetics */}
      {(s.modelType === 'michaelis_menten' || s.modelType === 'substrate_inhibition') && (
        <div class="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 dark:border-indigo-900/50 dark:bg-indigo-950/20 text-xs">
          <span class="block text-xs font-semibold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
            Enzyme Setup: Total [E]₀
          </span>
          <div class="flex items-center gap-2">
            <input
              type="number"
              step="any"
              min="0"
              value={s.enzymeConc}
              onInput={(e) => set({ enzymeConc: parseFloat((e.target as HTMLInputElement).value) || 0 })}
              class="w-full rounded-lg border border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
              placeholder="0.05"
            />
            <span class="text-xs font-semibold text-indigo-700 dark:text-indigo-300">µM</span>
          </div>
          <p class="text-[11px] text-indigo-700 dark:text-indigo-400">
            Calculates turnover number <em>k</em><sub>cat</sub> = <em>V</em><sub>max</sub> / [E]₀ and catalytic efficiency <em>k</em><sub>cat</sub> / <em>K</em><sub>m</sub>.
          </p>
        </div>
      )}

      {/* Contextual Parameters for BLI / SPR Association */}
      {s.modelType === 'spr_association' && (
        <div class="space-y-2 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3.5 dark:border-cyan-900/50 dark:bg-cyan-950/20 text-xs">
          <span class="block text-xs font-semibold text-cyan-900 dark:text-cyan-200 uppercase tracking-wider">
            Biosensor Analyte Conditions
          </span>
          <div class="space-y-2">
            <div>
              <label class="block text-[11px] text-cyan-800 dark:text-cyan-300 mb-0.5">Analyte Conc [L] (nM)</label>
              <input aria-label="Analyte Conc [L] (nM)"
                type="number"
                step="any"
                min="0"
                value={s.analyteConc}
                onInput={(e) => set({ analyteConc: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                class="w-full rounded-lg border border-cyan-300 dark:border-cyan-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label class="block text-[11px] text-cyan-800 dark:text-cyan-300 mb-0.5">Known Off-Rate <em>k</em><sub>off</sub> (s⁻¹)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={s.dissociationRate}
                onInput={(e) => set({ dissociationRate: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                class="w-full rounded-lg border border-cyan-300 dark:border-cyan-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>
          <p class="text-[11px] text-cyan-700 dark:text-cyan-400">
            Calculates <em>k</em><sub>on</sub> = (<em>k</em><sub>obs</sub> - <em>k</em><sub>off</sub>) / [L] and <em>K</em><sub>D</sub> = <em>k</em><sub>off</sub> / <em>k</em><sub>on</sub>.
          </p>
        </div>
      )}

      <div class="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          Upload CSV / TSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          class="hidden"
          onChange={(e) => {
            const input = e.target as HTMLInputElement;
            const file = input.files?.[0];
            input.value = '';
            if (file) void handleFileUpload(file);
          }}
        />
        <button
          type="button"
          onClick={() => setRawText('')}
          class="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
        >
          Clear
        </button>
      </div>
      <ImportAlert message={importError} />
    </div>
  );
}
