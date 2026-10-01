import { ImportAlert } from '@/app/components/ImportAlert';
import type { DsfModel } from '../DsfModel';
import { PALETTE } from '../DsfModel';

export function InputsPanel({ m }: { m: DsfModel }) {
  const {
    allConditionsList,
    analysis,
    availableChannels,
    effectiveSelectedIds,
    fileInputRef,
    filteredConditionsForDrawer,
    handleChannelFilter,
    handleDeselectAll,
    handleFileUpload,
    handleInvertSelection,
    handleLoadPreset,
    handleRestoreAllPeaks,
    handleSelectAll,
    handleSoloTrace,
    handleToggleTrace,
    importError,
    parsedData,
    rawText,
    s,
    set,
    setRawText,
  } = m;
  return (
    <div class="space-y-4">
      {/* Preset Selector */}
      <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Benchmark Demo Datasets
        </span>
        <div class="grid grid-cols-1 gap-1.5">
          <button
            type="button"
            onClick={() => handleLoadPreset('lysozyme')}
            class={`w-full text-left p-2.5 rounded-lg text-xs font-medium transition ${s.presetKey === 'lysozyme' ? 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-300 dark:border-accent-700 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            <div class="font-semibold">Lysozyme + NAG Screen (SYPRO Orange)</div>
            <div class="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">Literature benchmark: Niesen et al. (2007) Nat Protoc</div>
          </button>
          <button
            type="button"
            onClick={() => handleLoadPreset('nanodsf')}
            class={`w-full text-left p-2.5 rounded-lg text-xs font-medium transition ${s.presetKey === 'nanodsf' ? 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-300 dark:border-accent-700 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            <div class="font-semibold">mAb Fab Screening (nanoDSF Ratio F350/F330)</div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Label-free intrinsic tryptophan ratio screening</div>
          </button>
          <button
            type="button"
            onClick={() => handleLoadPreset('prometheus')}
            class={`w-full text-left p-2.5 rounded-lg text-xs font-medium transition ${s.presetKey === 'prometheus' ? 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-300 dark:border-accent-700 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            <div class="font-semibold flex items-center justify-between">
              <span>Prometheus 24-Capillary High-Density Screen</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-bold">
                Prometheus NT.48
              </span>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Multi-channel: Ratio (350/330nm), 330nm, 350nm channels</div>
          </button>
        </div>
      </div>

      {/* Trace Selection & Management Panel */}
      <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 text-xs">
        <div class="flex items-center justify-between">
          <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Select Traces to Render & Fit
          </span>
          <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {effectiveSelectedIds.length} / {allConditionsList.length} active
          </span>
        </div>

        {/* Channel Filters (if multiple channels present, e.g. Prometheus) */}
        {availableChannels.length > 1 && (
          <div class="space-y-1">
            <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Channel Filter:</span>
            <div class="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => handleChannelFilter('all')}
                class={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${s.channelFilter === 'all' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
              >
                All Channels
              </button>
              {availableChannels.includes('ratio') && (
                <button
                  type="button"
                  onClick={() => handleChannelFilter('ratio')}
                  class={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${s.channelFilter === 'ratio' ? 'bg-accent-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                >
                  Ratio (350/330)
                </button>
              )}
              {availableChannels.includes('f330') && (
                <button
                  type="button"
                  onClick={() => handleChannelFilter('f330')}
                  class={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${s.channelFilter === 'f330' ? 'bg-accent-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                >
                  330 nm
                </button>
              )}
              {availableChannels.includes('f350') && (
                <button
                  type="button"
                  onClick={() => handleChannelFilter('f350')}
                  class={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${s.channelFilter === 'f350' ? 'bg-accent-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                >
                  350 nm
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quick Batch Actions */}
        <div class="flex flex-wrap gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={handleSelectAll}
            class="px-2 py-1 text-[11px] font-semibold rounded border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={handleDeselectAll}
            class="px-2 py-1 text-[11px] font-semibold rounded border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
          >
            Deselect All
          </button>
          <button
            type="button"
            onClick={handleInvertSelection}
            class="px-2 py-1 text-[11px] font-semibold rounded border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
          >
            Invert
          </button>
        </div>

        {/* Search / Filter Input */}
        <input
          type="text"
          placeholder="Search traces (e.g. Capillary 1, NAG, Hit)..."
          value={s.searchQuery}
          onInput={(e) => set({ searchQuery: (e.target as HTMLInputElement).value })}
          class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 placeholder-slate-400"
        />

        {/* Scrollable Trace Checklist */}
        <div class="max-h-56 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredConditionsForDrawer.map((cond) => {
            const isChecked = effectiveSelectedIds.includes(cond.id);
            const isFocused = s.selectedConditionId === cond.id;
            const color = PALETTE[cond.idx % PALETTE.length]!;

            return (
              <div
                key={cond.id}
                class={`flex items-center justify-between gap-2 p-1.5 rounded-lg transition ${isFocused ? 'bg-accent-50 dark:bg-accent-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
              >
                <label class="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleTrace(cond.id)}
                    class="rounded text-accent-600 dark:text-accent-400 accent-accent-600"
                  />
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span class="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                    {cond.name}
                  </span>
                </label>

                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="Solo this trace (isolate only this condition)"
                    onClick={() => handleSoloTrace(cond.id)}
                    class="px-1.5 py-0.5 text-[10px] rounded font-semibold border border-slate-200 dark:border-slate-700 hover:bg-amber-100 hover:text-amber-900 dark:hover:bg-amber-950 dark:hover:text-amber-300 text-slate-500 dark:text-slate-400 transition"
                  >
                    Solo
                  </button>
                  <button
                    type="button"
                    title="Inspect condition detail"
                    onClick={() => set({ selectedConditionId: cond.id })}
                    class={`px-1.5 py-0.5 text-[10px] rounded font-mono transition ${isFocused ? 'bg-accent-600 text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    {isFocused ? 'FOCUS' : 'Inspect'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Analysis & Fitting Parameters */}
      <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 text-xs">
        <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Tm Analysis & Processing Parameters
        </span>

        {/* Reference Condition Dropdown */}
        <div>
          <label for="ref-cond-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Reference / Control Condition (for ΔTm)
          </label>
          <select
            id="ref-cond-select"
            value={s.referenceConditionId || (analysis && !('error' in analysis) ? analysis.referenceConditionId : '')}
            onChange={(e) => set({ referenceConditionId: (e.target as HTMLSelectElement).value })}
            class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            {analysis && !('error' in analysis) ? (
              analysis.conditions.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} (Tm: {c.tm.toFixed(1)} °C)
                </option>
              ))
            ) : (
              <option value="">Auto-detect control</option>
            )}
          </select>
        </div>

        {/* Primary Tm Method */}
        <div>
          <label for="tm-method-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Melting Temperature (Tm) Method
          </label>
          <select
            id="tm-method-select"
            value={s.tmMethod}
            onChange={(e) => set({ tmMethod: (e.target as HTMLSelectElement).value as 'derivative' | 'boltzmann' })}
            class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="derivative">1st Derivative Peak Inflection (dF/dT max)</option>
            <option value="boltzmann">Two-State Boltzmann Sigmoid Midpoint (Tm)</option>
          </select>
        </div>

        {/* Transition Direction */}
        <div>
          <label for="dir-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Transition Direction & Sign Detection
          </label>
          <select
            id="dir-select"
            value={s.transitionDirection}
            onChange={(e) => set({ transitionDirection: (e.target as HTMLSelectElement).value as 'both' | 'auto' | 'positive' | 'negative' })}
            class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="both">Both Signs (+ Melting Peaks & − Troughs)</option>
            <option value="auto">Auto-Detect Dominant Direction</option>
            <option value="positive">Positive Only (+ Upward Melt / SYPRO Orange)</option>
            <option value="negative">Negative Only (− Downward Transition / Blue Shift)</option>
          </select>
        </div>

        {/* Peak Detection Sensitivity */}
        <div>
          <label for="prominence-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Peak Detection Sensitivity
          </label>
          <select
            id="prominence-select"
            value={s.peakProminenceRatio.toString()}
            onChange={(e) => set({ peakProminenceRatio: parseFloat((e.target as HTMLSelectElement).value) })}
            class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="0.30">Very Strict (0.30 prominence · dominant primary transitions only)</option>
            <option value="0.20">Strict Filtering (0.20 prominence · suppresses minor wiggles)</option>
            <option value="0.15">Standard Sensitivity (0.15 prominence · recommended default)</option>
            <option value="0.08">High Sensitivity (0.08 prominence · finds small shoulders)</option>
          </select>
        </div>

        {/* Max Transition Peaks to Detect */}
        <div>
          <label for="max-peaks-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Max Peaks to Detect per Trace
          </label>
          <select
            id="max-peaks-select"
            value={s.maxPeaks.toString()}
            onChange={(e) => set({ maxPeaks: parseInt((e.target as HTMLSelectElement).value, 10) })}
            class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="1">1 Peak (Single primary transition only · cleanest)</option>
            <option value="2">Up to 2 Peaks (e.g. Fab + Fc antibody domains)</option>
            <option value="3">Up to 3 Peaks (Multi-domain proteins)</option>
            <option value="4">Up to 4 Peaks (Recommended default)</option>
            <option value="8">Up to 8 Peaks (High complexity)</option>
          </select>
        </div>

        {/* Removed False Peaks Status & Reset */}
        {s.removedPeakKeys.length > 0 && (
          <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-[11px]">
            <span class="text-amber-800 dark:text-amber-300 font-medium">
              {s.removedPeakKeys.length} false peak{s.removedPeakKeys.length > 1 ? 's' : ''} removed
            </span>
            <button
              type="button"
              onClick={handleRestoreAllPeaks}
              class="font-bold text-accent-700 dark:text-accent-300 hover:underline"
            >
              Restore All
            </button>
          </div>
        )}

        {/* Savitzky-Golay Smoothing Window */}
        <div>
          <label for="window-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Savitzky-Golay Smoothing Window
          </label>
          <select
            id="window-select"
            value={s.windowSize}
            onChange={(e) => set({ windowSize: parseInt((e.target as HTMLSelectElement).value, 10) })}
            class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="5">5 points (Minimal smoothing, sharpest peaks)</option>
            <option value="7">7 points (Recommended default for 0.5 - 1.0 °C steps)</option>
            <option value="9">9 points (Moderate noise suppression)</option>
            <option value="11">11 points (High noise suppression)</option>
            <option value="15">15 points (Very noisy instrumental data)</option>
          </select>
        </div>

        {/* Temperature Cropping Window */}
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Temperature Crop Window (°C)
            </span>
            {(s.tempMinCrop != null || s.tempMaxCrop != null) && (
              <button
                type="button"
                onClick={() => set({ tempMinCrop: null, tempMaxCrop: null })}
                class="text-[10px] text-rose-700 dark:text-rose-400 font-semibold hover:underline"
              >
                Reset Crop
              </button>
            )}
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <input
                type="number"
                step="1"
                placeholder="Min T (e.g. 30)"
                value={s.tempMinCrop ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  set({ tempMinCrop: v ? parseFloat(v) : null });
                }}
                class="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <input
                type="number"
                step="1"
                placeholder="Max T (e.g. 85)"
                value={s.tempMaxCrop ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  set({ tempMaxCrop: v ? parseFloat(v) : null });
                }}
                class="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>
        </div>

        {/* Normalization & Overlay Toggles */}
        <div class="space-y-1.5 pt-1">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={s.normalizeFluorescence}
              onChange={(e) => {
                const checked = (e.target as HTMLInputElement).checked;
                set({ normalizeFluorescence: checked, normMode: checked ? 'normalized' : 'raw' });
              }}
              class="rounded text-accent-600 dark:text-accent-400 accent-accent-600"
            />
            <span>Normalize Fluorescence (0 - 100%)</span>
          </label>

          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={s.showBoltzmannOverlay}
              onChange={(e) => set({ showBoltzmannOverlay: (e.target as HTMLInputElement).checked })}
              class="rounded text-accent-600 dark:text-accent-400 accent-accent-600"
            />
            <span>Show Boltzmann Sigmoid Fit Curves</span>
          </label>

          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={s.showResiduals}
              onChange={(e) => set({ showResiduals: (e.target as HTMLInputElement).checked })}
              class="rounded text-accent-600 dark:text-accent-400 accent-accent-600"
            />
            <span>Show Fit Residuals Plot (Obs - Fit)</span>
          </label>
        </div>
      </div>

      {/* Raw CSV / Tabular Data Input */}
      <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between">
          <label for="dsf-data-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Raw Thermal Cycler Data
          </label>
          <span class="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {parsedData && !('error' in parsedData)
              ? `${parsedData.temperatures.length} pts · ${parsedData.conditions.length} wells (${parsedData.format ?? 'standard'})`
              : 'Empty'}
          </span>
        </div>
        <textarea
          id="dsf-data-input"
          rows={8}
          value={rawText}
          onInput={(e) => {
            setRawText((e.target as HTMLTextAreaElement).value);
            set({
              presetKey: 'custom',
              selectedConditionId: '',
              referenceConditionId: '',
              selectedTraceIds: null,
              tempMinCrop: null,
              tempMaxCrop: null,
              removedPeakKeys: [],
            });
          }}
          placeholder={`Temperature,Control,Ligand_1,Ligand_2\n25.0,120,115,125\n26.0,122,117,128...`}
          class="w-full p-2.5 font-mono text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-950 leading-relaxed resize-y"
        />
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
        <p class="text-[11px] text-slate-500 dark:text-slate-400">
          💡 Supports Bio-Rad CFX, QuantStudio, Roche LightCycler, and NanoTemper Prometheus nanoDSF exported CSV/TSV matrices.
        </p>
      </div>
    </div>
  );
}
