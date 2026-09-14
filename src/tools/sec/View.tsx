import { useCallback, useEffect, useState, useMemo } from 'preact/hooks';
import type { BaselineMode, ChromatogramColumnName, ChromatogramImport, PeakCandidate, SpectrumImport } from '@/core/chromatography';
import {
  applyBaseline,
  calculateDyeLabeling,
  correctA280ForScatter,
  detectPeakCandidates,
  estimateFractionAmount,
  fitLogScatter,
  integratePeak,
  parseChromatogram,
  parseSpectrum,
  simulateGradient,
  suggestIonExchange,
} from '@/core/chromatography';
import { summarize } from '@/core/protein';
import { downloadText, toCsv } from '@/lib/export';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { LineChart } from '@/app/components/LineChart';
import { SCIENCE } from './science';
import {
  type SecStandard,
  PRESET_COLUMNS,
  getStandardsForColumn,
  fitSecCalibration,
  predictFromVe,
  predictVeFromMw,
  estimatePeakSigmaMl,
} from '@/core/sec';

interface State {
  columnId: string;
  vt: number;
  v0: number;
  queryMode: 've_to_mw' | 'mw_to_ve';
  unknownVe: number;
  targetMwKDa: number;
  monomerMwKDa: number;
}

const DEFAULTS: State = {
  columnId: 's200_10_300',
  vt: 24.0,
  v0: 7.5,
  queryMode: 've_to_mw',
  unknownVe: 12.8,
  targetMwKDa: 65,
  monomerMwKDa: 32.5,
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-sm';

function CalibrationPanel({ embedded = false }: { embedded?: boolean }) {
  const [stateSig, shareUrl] = useUrlState<State>('sec', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [standards, setStandards] = useState<SecStandard[]>(() => getStandardsForColumn(DEFAULTS.columnId));
  const [activeTab, setActiveTab] = useState<'curve' | 'chromatogram'>('curve');

  // Handle column selection with automatic standard preset loading
  function handleSelectColumn(colId: string) {
    const col = PRESET_COLUMNS.find(c => c.id === colId);
    if (col) {
      set({ columnId: colId, vt: col.bedVolume, v0: col.voidVolume });
      setStandards(getStandardsForColumn(colId));
      const midVe = col.voidVolume + 0.35 * (col.bedVolume - col.voidVolume);
      set({ unknownVe: Math.round(midVe * 10) / 10 });
    } else {
      set({ columnId: colId });
    }
  }

  // Standards management
  function handleToggleStandard(id: string) {
    setStandards(prev => prev.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item));
  }

  function handleUpdateStandard(id: string, patch: Partial<SecStandard>) {
    setStandards(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function handleDeleteStandard(id: string) {
    setStandards(prev => prev.filter(item => item.id !== id));
  }

  function handleAddStandard() {
    const newId = `std_${Date.now()}`;
    setStandards(prev => [
      ...prev,
      { id: newId, name: 'New Standard', mwDa: 50000, elutionVolumeMl: Math.round((s.v0 + (s.vt - s.v0) * 0.5) * 10) / 10, enabled: true },
    ]);
  }

  function handleResetStandards() {
    setStandards(getStandardsForColumn(s.columnId));
  }

  // Calibration model
  const model = useMemo(() => {
    return fitSecCalibration(standards, s.v0, s.vt);
  }, [standards, s.v0, s.vt]);

  // Predictions
  const predictionMw = useMemo(() => {
    if (!model || s.unknownVe <= 0) return null;
    return predictFromVe(s.unknownVe, model, s.monomerMwKDa > 0 ? s.monomerMwKDa * 1000 : undefined);
  }, [model, s.unknownVe, s.monomerMwKDa]);

  const predictionVe = useMemo(() => {
    if (!model || s.targetMwKDa <= 0) return null;
    return predictVeFromMw(s.targetMwKDa * 1000, model);
  }, [model, s.targetMwKDa]);

  const activeColumn = PRESET_COLUMNS.find(c => c.id === s.columnId) || PRESET_COLUMNS[0]!;

  // Dynamic x-axis range strictly anchored to column fractionation range and active standards
  // Note: Test sample is deliberately excluded so entering or modifying the tested protein NEVER alters calibration or plot scaling
  const { xMinLog, xMaxLog, xTicks } = useMemo(() => {
    const activeStds = standards.filter(st => st.enabled && st.mwDa > 0).map(st => st.mwDa);
    const allMw = [
      activeColumn.rangeMinDa,
      activeColumn.rangeMaxDa,
      ...(activeStds.length > 0 ? activeStds : [10000, 600000]),
    ];
    const minVal = Math.min(...allMw);
    const maxVal = Math.max(...allMw);
    const minLog = Math.max(2.5, Math.floor(Math.log10(minVal * 0.7) * 2) / 2);
    const maxLog = Math.min(7.5, Math.ceil(Math.log10(maxVal * 1.3) * 2) / 2);

    const ticks: number[] = [];
    for (let t = minLog; t <= maxLog + 1e-6; t += 0.5) {
      ticks.push(Math.round(t * 10) / 10);
    }
    return { xMinLog: minLog, xMaxLog: Math.max(minLog + 1.5, maxLog), xTicks: ticks };
  }, [activeColumn, standards]);

  const copySummary = () => {
    const lines = [
      `SEC Calibration & Analysis: ${activeColumn.name}`,
      `Column Volumes: Bed Vt = ${s.vt} mL, Void V0 = ${s.v0} mL`,
    ];
    if (model) {
      lines.push(`Calibration Equation: Kav = ${model.slope.toFixed(4)} * log10(MW) + ${model.intercept.toFixed(4)} (R² = ${model.rSquared.toFixed(4)}, n = ${model.n})`);
    }
    if (s.queryMode === 've_to_mw' && predictionMw) {
      lines.push(`Input Ve: ${s.unknownVe} mL (Kav = ${predictionMw.kav.toFixed(3)})`);
      lines.push(`Apparent MW: ${predictionMw.apparentMwkDa.toFixed(1)} kDa (${Math.round(predictionMw.apparentMwDa).toLocaleString()} Da)`);
      lines.push(`Stokes Radius (Rh): ${predictionMw.stokesRadiusAngstrom.toFixed(1)} Å (${predictionMw.stokesRadiusNm.toFixed(2)} nm)`);
      if (predictionMw.oligomericState) {
        lines.push(`Oligomeric State: ${predictionMw.oligomericState} (ratio: ${predictionMw.oligomericRatio?.toFixed(2)}x)`);
      }
    } else if (s.queryMode === 'mw_to_ve' && predictionVe) {
      lines.push(`Input Target MW: ${s.targetMwKDa} kDa`);
      lines.push(`Predicted Elution Volume (Ve): ${predictionVe.elutionVolumeMl.toFixed(2)} mL (Kav = ${predictionVe.kav.toFixed(3)})`);
    }
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <>
      {embedded && (
        <h2 class="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">
          🧪 SEC Calibration &amp; Stokes Radius
        </h2>
      )}
      <ToolLayout
      icon="🧪"
      title="SEC Calibration & Stokes Radius"
      blurb="Size exclusion chromatography calibration curve, apparent molecular weight estimation, Stokes radius (Rh), and oligomeric state analysis."
      wide={true}
      embedded={embedded}
      mobileResultSummary={
        s.queryMode === 've_to_mw' && predictionMw ? (
          <span>Apparent MW: <strong class="text-accent-700 dark:text-accent-300 font-mono">{predictionMw.apparentMwkDa.toFixed(1)} kDa</strong> (Rh {predictionMw.stokesRadiusAngstrom.toFixed(1)} Å)</span>
        ) : s.queryMode === 'mw_to_ve' && predictionVe ? (
          <span>Predicted Ve: <strong class="text-accent-700 dark:text-accent-300 font-mono">{predictionVe.elutionVolumeMl.toFixed(2)} mL</strong> (Kav {predictionVe.kav.toFixed(3)})</span>
        ) : null
      }
      inputs={
        <div class="space-y-4">
          {/* Column Presets */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Pre-packed Column
              </label>
              <span class="text-[11px] text-slate-500 font-mono">
                {activeColumn.manufacturer}
              </span>
            </div>
            <select
              value={s.columnId}
              onChange={(e) => handleSelectColumn((e.target as HTMLSelectElement).value)}
              class={FIELD}
            >
              {PRESET_COLUMNS.map(col => (
                <option key={col.id} value={col.id}>
                  {col.name} ({col.bedVolume} mL)
                </option>
              ))}
            </select>

            <div class="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label class="block text-xs text-slate-500 mb-1">Total Volume (Vt, mL)</label>
                <DecimalInput
                  class={FIELD}
                  value={s.vt}
                  onChange={vt => set({ vt })}
                  min={0.1}
                  step={0.5}
                />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Void Volume (V0, mL)</label>
                <DecimalInput
                  class={FIELD}
                  value={s.v0}
                  onChange={v0 => set({ v0 })}
                  min={0.01}
                  step={0.1}
                />
              </div>
            </div>
            <div class="text-[11px] text-slate-500 pt-1">
              Fractionation range: {Math.round(activeColumn.rangeMinDa / 1000)}–{Math.round(activeColumn.rangeMaxDa / 1000)} kDa.
            </div>
          </div>

          {/* Mode Selector */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Analysis Direction
            </label>
            <div class="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => set({ queryMode: 've_to_mw' })}
                class={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${s.queryMode === 've_to_mw' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`}
              >
                Ve → Apparent MW
              </button>
              <button
                type="button"
                onClick={() => set({ queryMode: 'mw_to_ve' })}
                class={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${s.queryMode === 'mw_to_ve' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`}
              >
                Target MW → Predict Ve
              </button>
            </div>

            {s.queryMode === 've_to_mw' ? (
              <div class="space-y-3 pt-1">
                <div>
                  <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Observed Elution Volume (Ve, mL)
                  </label>
                  <DecimalInput
                    class={FIELD}
                    value={s.unknownVe}
                    onChange={unknownVe => set({ unknownVe })}
                    min={0.1}
                    step={0.1}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">
                    Monomer Sequence MW (Optional, for Oligomeric State, kDa)
                  </label>
                  <DecimalInput
                    class={FIELD}
                    value={s.monomerMwKDa}
                    onChange={monomerMwKDa => set({ monomerMwKDa })}
                    min={0}
                    step={1}
                    placeholder="e.g. 32.5 kDa"
                  />
                </div>
              </div>
            ) : (
              <div class="space-y-3 pt-1">
                <div>
                  <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Target Protein MW (kDa)
                  </label>
                  <DecimalInput
                    class={FIELD}
                    value={s.targetMwKDa}
                    onChange={targetMwKDa => set({ targetMwKDa })}
                    min={0.1}
                    step={5}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Calibration Standards Manager */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Molecular Weight Standards ({standards.filter(x => x.enabled).length} Active)
              </label>
              <button
                type="button"
                onClick={handleResetStandards}
                class="text-[11px] text-accent-600 dark:text-accent-400 hover:underline font-semibold"
              >
                Reset Defaults
              </button>
            </div>

            {/* Table Header */}
            <div class="flex items-center gap-2 px-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              <span class="w-4"></span>
              <span class="flex-1">Standard Protein</span>
              <span class="w-20 text-right">MW (kDa)</span>
              <span class="w-20 text-right">Ve (mL)</span>
              <span class="w-5"></span>
            </div>

            <div class="space-y-1.5 max-h-[290px] overflow-y-auto pr-1">
              {standards.map(std => (
                <div
                  key={std.id}
                  class={`p-2 rounded-xl border text-xs flex items-center gap-2 transition ${std.enabled ? 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 shadow-2xs' : 'border-slate-200/50 dark:border-slate-800 opacity-40'}`}
                >
                  <input
                    type="checkbox"
                    checked={std.enabled}
                    onChange={() => handleToggleStandard(std.id)}
                    class="rounded text-accent-600 focus:ring-accent-500 cursor-pointer w-4 h-4 shrink-0"
                    title={std.enabled ? 'Include in regression' : 'Excluded from regression'}
                  />
                  <input
                    type="text"
                    value={std.name}
                    onInput={(e) => handleUpdateStandard(std.id, { name: (e.target as HTMLInputElement).value })}
                    class="flex-1 min-w-0 bg-transparent font-semibold text-slate-800 dark:text-slate-200 border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-accent-500 outline-none px-1 text-xs truncate"
                  />
                  <div class="w-20 shrink-0">
                    <DecimalInput
                      value={std.mwDa / 1000}
                      onChange={val => handleUpdateStandard(std.id, { mwDa: val * 1000 })}
                      min={0.1}
                      step={1}
                      class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-xs font-semibold"
                    />
                  </div>
                  <div class="w-20 shrink-0">
                    <DecimalInput
                      value={std.elutionVolumeMl}
                      onChange={elutionVolumeMl => handleUpdateStandard(std.id, { elutionVolumeMl })}
                      min={0.01}
                      step={0.1}
                      class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-xs font-semibold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteStandard(std.id)}
                    class="w-5 text-slate-400 hover:text-rose-600 text-xs shrink-0 text-center"
                    title="Delete standard"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddStandard}
              class="w-full py-1.5 text-xs font-semibold rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              + Add Calibration Standard
            </button>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Primary Calculated Cards */}
          {s.queryMode === 've_to_mw' && predictionMw && (
            <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
              <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Apparent Molecular Weight
                  </span>
                  <div class="text-3xl font-black text-accent-600 dark:text-accent-400 font-mono mt-0.5">
                    {predictionMw.apparentMwkDa.toFixed(1)} <span class="text-lg font-bold text-slate-500">kDa</span>
                  </div>
                </div>
                <div class="text-right">
                  <span class="text-xs text-slate-400 block">Partition Coefficient (Kav)</span>
                  <span class="text-lg font-bold font-mono text-slate-700 dark:text-slate-300">
                    {predictionMw.kav.toFixed(3)}
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span class="text-[11px] text-slate-500 block">Stokes Radius (Rh)</span>
                  <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                    {predictionMw.stokesRadiusAngstrom.toFixed(1)} Å
                  </span>
                  <span class="text-[10px] text-slate-400 block">{predictionMw.stokesRadiusNm.toFixed(2)} nm</span>
                </div>

                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span class="text-[11px] text-slate-500 block">Exact Mass</span>
                  <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                    {Math.round(predictionMw.apparentMwDa).toLocaleString()}
                  </span>
                  <span class="text-[10px] text-slate-400 block">Da</span>
                </div>

                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 col-span-2">
                  <span class="text-[11px] text-slate-500 block">Oligomeric State Estimate</span>
                  {predictionMw.oligomericState ? (
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {predictionMw.oligomericState}
                      </span>
                      <span class="text-xs text-slate-400 font-mono">
                        ({predictionMw.oligomericRatio?.toFixed(2)}× monomer)
                      </span>
                    </div>
                  ) : (
                    <span class="text-xs text-slate-400 italic">Enter monomer MW on left</span>
                  )}
                </div>
              </div>

              {predictionMw.isExtrapolated && (
                <div class="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>
                    Elution volume is outside the calibrated standard range ({Math.round(Math.min(...(model?.points.map(p => p.mwDa) || [0])) / 1000)}–{Math.round(Math.max(...(model?.points.map(p => p.mwDa) || [0])) / 1000)} kDa). Result is extrapolated.
                  </span>
                </div>
              )}
            </div>
          )}

          {s.queryMode === 'mw_to_ve' && predictionVe && (
            <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
              <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Predicted Elution Volume (Ve)
                  </span>
                  <div class="text-3xl font-black text-accent-600 dark:text-accent-400 font-mono mt-0.5">
                    {predictionVe.elutionVolumeMl.toFixed(2)} <span class="text-lg font-bold text-slate-500">mL</span>
                  </div>
                </div>
                <div class="text-right">
                  <span class="text-xs text-slate-400 block">Expected Kav</span>
                  <span class="text-lg font-bold font-mono text-slate-700 dark:text-slate-300">
                    {predictionVe.kav.toFixed(3)}
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 text-xs">
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span class="text-slate-500 block">Fraction of Bed Volume (Vt)</span>
                  <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                    {((predictionVe.elutionVolumeMl / s.vt) * 100).toFixed(1)}%
                  </span>
                </div>
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span class="text-slate-500 block">Distance from Void Volume (V0)</span>
                  <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                    +{(predictionVe.elutionVolumeMl - s.v0).toFixed(2)} mL
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Visualization Panel: Calibration Curve vs Chromatogram */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
              <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('curve')}
                  class={`px-3 py-1 font-semibold rounded-md transition ${activeTab === 'curve' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  📈 Calibration Curve (Kav vs log MW)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('chromatogram')}
                  class={`px-3 py-1 font-semibold rounded-md transition ${activeTab === 'chromatogram' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  📊 Simulated SEC Chromatogram
                </button>
              </div>

              {model && (
                <div class="text-xs font-mono text-slate-500">
                  R² = <strong class="text-emerald-600 dark:text-emerald-400 font-bold">{model.rSquared.toFixed(4)}</strong> | Kav = {model.slope.toFixed(3)}·log(MW) + {model.intercept.toFixed(3)}
                </div>
              )}
            </div>

            {/* SVG Plot */}
            {activeTab === 'curve' && model && (
              <div class="overflow-x-auto">
                <svg viewBox="0 0 660 330" class="w-full h-auto min-w-[500px] select-none text-xs font-sans">
                  {/* Axes & Grid */}
                  <rect x="60" y="20" width="570" height="250" fill="none" stroke="#e2e8f0" stroke-width="1" class="dark:stroke-slate-800" />

                  {/* Y Axis Gridlines (Kav 0.0 to 1.0) */}
                  {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map(kVal => {
                    const y = 20 + 250 * (1 - kVal);
                    return (
                      <g key={kVal}>
                        <line x1="60" x2="630" y1={y} y2={y} stroke="#f1f5f9" stroke-dasharray="3,3" class="dark:stroke-slate-800" />
                        <text x="52" y={y + 4} text-anchor="end" font-size="10" fill="#94a3b8" class="font-mono">
                          {kVal.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}
                  <text x="18" y="145" text-anchor="middle" font-size="11" fill="#64748b" transform="rotate(-90, 18, 145)" font-weight="600">
                    Partition Coefficient (Kav)
                  </text>

                  {/* X Axis: dynamic log10(MW) ticks */}
                  {xTicks.map(logVal => {
                    const x = 60 + ((logVal - xMinLog) / (xMaxLog - xMinLog)) * 570;
                    const mwLabel = Math.round(10 ** logVal / 1000);
                    return (
                      <g key={logVal}>
                        <line x1={x} x2={x} y1="20" y2="270" stroke="#f1f5f9" stroke-dasharray="3,3" class="dark:stroke-slate-800" />
                        <text x={x} y="288" text-anchor="middle" font-size="10" fill="#94a3b8" class="font-mono">
                          {mwLabel >= 1000 ? `${(mwLabel / 1000).toFixed(1)}M` : `${mwLabel}k`}
                        </text>
                      </g>
                    );
                  })}
                  <text x="345" y="312" text-anchor="middle" font-size="11" fill="#64748b" font-weight="600">
                    Molecular Weight (Da, log scale)
                  </text>

                  {/* Regression Line: clipped cleanly within plot bounds */}
                  {(() => {
                    // Line equation: Kav = model.slope * logMw + model.intercept
                    // When slope < 0: logMw increases as Kav decreases
                    const xAtKav1 = (1 - model.intercept) / model.slope;
                    const xAtKav0 = (0 - model.intercept) / model.slope;
                    const minXFit = Math.min(xAtKav1, xAtKav0);
                    const maxXFit = Math.max(xAtKav1, xAtKav0);

                    const xStart = Math.max(xMinLog, minXFit);
                    const xEnd = Math.min(xMaxLog, maxXFit);
                    if (xStart >= xEnd) return null;

                    const kavStart = model.slope * xStart + model.intercept;
                    const kavEnd = model.slope * xEnd + model.intercept;

                    const sx1 = 60 + ((xStart - xMinLog) / (xMaxLog - xMinLog)) * 570;
                    const sy1 = 20 + 250 * (1 - Math.max(0, Math.min(1, kavStart)));
                    const sx2 = 60 + ((xEnd - xMinLog) / (xMaxLog - xMinLog)) * 570;
                    const sy2 = 20 + 250 * (1 - Math.max(0, Math.min(1, kavEnd)));

                    return <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} stroke="#2563eb" stroke-width="2" stroke-dasharray="4,4" />;
                  })()}

                  {/* Standard Points with Staggered Labels */}
                  {model.points.map((pt, idx) => {
                    const cx = 60 + ((pt.logMw - xMinLog) / (xMaxLog - xMinLog)) * 570;
                    const cy = 20 + 250 * (1 - Math.max(0, Math.min(1, pt.kav)));
                    const isAbove = idx % 2 === 0;
                    return (
                      <g key={idx} class="cursor-pointer group">
                        <circle cx={cx} cy={cy} r="5.5" fill="#3b82f6" stroke="#ffffff" stroke-width="2" />
                        <text
                          x={cx}
                          y={isAbove ? cy - 9 : cy + 16}
                          text-anchor="middle"
                          font-size="9"
                          fill="#334155"
                          class="font-semibold select-none dark:fill-slate-300"
                        >
                          {pt.name.split(' ')[0]} ({Math.round(pt.mwDa / 1000)}k)
                        </text>
                      </g>
                    );
                  })}

                  {/* Tested Sample Point (Rendered for both Ve -> MW and MW -> Ve modes) */}
                  {(() => {
                    let sampleLogMw: number | null = null;
                    let sampleKav: number | null = null;
                    let sampleLabel = '';

                    if (s.queryMode === 've_to_mw' && predictionMw) {
                      sampleLogMw = Math.log10(predictionMw.apparentMwDa);
                      sampleKav = predictionMw.kav;
                      sampleLabel = `Unknown (${predictionMw.apparentMwkDa.toFixed(1)} kDa)`;
                    } else if (s.queryMode === 'mw_to_ve' && predictionVe && s.targetMwKDa > 0) {
                      sampleLogMw = Math.log10(s.targetMwKDa * 1000);
                      sampleKav = predictionVe.kav;
                      sampleLabel = `Target (${s.targetMwKDa} kDa, Ve ${predictionVe.elutionVolumeMl.toFixed(2)} mL)`;
                    }

                    if (sampleLogMw === null || sampleKav === null) return null;

                    const cx = 60 + ((sampleLogMw - xMinLog) / (xMaxLog - xMinLog)) * 570;
                    const cy = 20 + 250 * (1 - Math.max(0, Math.min(1, sampleKav)));

                    return (
                      <g>
                        <line x1={cx} y1="20" x2={cx} y2="270" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.6" />
                        <line x1="60" y1={cy} x2="630" y2={cy} stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.6" />
                        <circle cx={cx} cy={cy} r="8" fill="#f43f5e" stroke="#ffffff" stroke-width="2.5" />
                        <text x={cx} y={cy - 12} text-anchor="middle" font-size="11" font-weight="bold" fill="#e11d48">
                          ★ {sampleLabel}
                        </text>
                      </g>
                    );
                  })()}
                </svg>
                <div class="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                  <span class="flex items-center gap-1.5">
                    <span class="inline-block w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                    <span><strong>Calibration fit:</strong> Derived from {model.n} active standards (R² = {model.rSquared.toFixed(4)})</span>
                  </span>
                </div>
              </div>
            )}

            {/* Chromatogram View */}
            {activeTab === 'chromatogram' && (
              <div class="overflow-x-auto">
                <svg viewBox="0 0 650 260" class="w-full h-auto min-w-[500px] select-none text-xs font-sans">
                  <rect x="50" y="20" width="570" height="200" fill="none" stroke="#e2e8f0" stroke-width="1" />

                  {/* Baseline and V0 / Vt markers */}
                  <line x1="50" y1="220" x2="620" y2="220" stroke="#94a3b8" stroke-width="1.5" />

                  {/* V0 line */}
                  {(() => {
                    const xV0 = 50 + (s.v0 / s.vt) * 570;
                    return (
                      <g>
                        <line x1={xV0} y1="20" x2={xV0} y2="220" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,3" />
                        <text x={xV0} y="15" text-anchor="middle" font-size="10" font-weight="bold" fill="#d97706">
                          V0 ({s.v0} mL)
                        </text>
                      </g>
                    );
                  })()}

                  {/* Vt line */}
                  <line x1="620" y1="20" x2="620" y2="220" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3,3" />
                  <text x="620" y="15" text-anchor="middle" font-size="10" font-weight="bold" fill="#64748b">
                    Vt ({s.vt} mL)
                  </text>

                  {/* Volume axis ticks */}
                  {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                    const vol = frac * s.vt;
                    const x = 50 + frac * 570;
                    return (
                      <g key={frac}>
                        <line x1={x} x2={x} y1="220" y2="225" stroke="#94a3b8" />
                        <text x={x} y="238" text-anchor="middle" font-size="10" fill="#64748b" class="font-mono">
                          {vol.toFixed(1)} mL
                        </text>
                      </g>
                    );
                  })}
                  <text x="335" y="254" text-anchor="middle" font-size="11" fill="#64748b" font-weight="600">
                    Elution Volume (mL)
                  </text>

                  {/* Standard peaks (analytical Gaussian profiles, N ~ 15,000 plates) */}
                  {standards.filter(x => x.enabled).map((std, i) => {
                    const peakX = 50 + (std.elutionVolumeMl / s.vt) * 570;
                    const peakH = 110 + (i % 4) * 15; // Tall sharp peak
                    const sigmaMl = estimatePeakSigmaMl(std.elutionVolumeMl, 15000);
                    const sigmaPx = Math.max(3.0, sigmaMl * (570 / s.vt));
                    const rangePx = 3.5 * sigmaPx;
                    const steps = 24;

                    let d = `M ${(peakX - rangePx).toFixed(1)} 220`;
                    for (let step = -steps; step <= steps; step++) {
                      const x = peakX + (step / steps) * rangePx;
                      const u = (x - peakX) / sigmaPx;
                      const y = 220 - peakH * Math.exp(-0.5 * u * u);
                      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
                    }
                    d += ` L ${(peakX + rangePx).toFixed(1)} 220 Z`;

                    const labelY = 220 - peakH - 5;

                    return (
                      <g key={std.id} opacity="0.8">
                        <path
                          d={d}
                          fill="rgba(59, 130, 246, 0.18)"
                          stroke="#3b82f6"
                          stroke-width="1.75"
                        />
                        <text
                          x={peakX}
                          y={labelY}
                          text-anchor="middle"
                          font-size="9"
                          fill="#2563eb"
                          font-weight="600"
                          class="select-none"
                        >
                          {std.name.split(' ')[0]} ({Math.round(std.mwDa / 1000)}k)
                        </text>
                      </g>
                    );
                  })}

                  {/* Unknown / Target Protein Peak (displayed in BOTH modes: Ve -> MW and MW -> Ve) */}
                  {(() => {
                    const targetVe = s.queryMode === 've_to_mw'
                      ? (s.unknownVe > 0 ? s.unknownVe : 0)
                      : (predictionVe?.elutionVolumeMl && predictionVe.elutionVolumeMl > 0 ? predictionVe.elutionVolumeMl : 0);

                    if (targetVe <= 0) return null;

                    const peakX = 50 + (targetVe / s.vt) * 570;
                    const peakH = 150; // Prominent tall peak
                    const sigmaMl = estimatePeakSigmaMl(targetVe, 15000);
                    const sigmaPx = Math.max(3.5, sigmaMl * (570 / s.vt));
                    const rangePx = 3.5 * sigmaPx;
                    const steps = 28;

                    let d = `M ${(peakX - rangePx).toFixed(1)} 220`;
                    for (let step = -steps; step <= steps; step++) {
                      const x = peakX + (step / steps) * rangePx;
                      const u = (x - peakX) / sigmaPx;
                      const y = 220 - peakH * Math.exp(-0.5 * u * u);
                      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
                    }
                    d += ` L ${(peakX + rangePx).toFixed(1)} 220 Z`;

                    const labelText = s.queryMode === 've_to_mw'
                      ? `★ Unknown (${targetVe.toFixed(2)} mL, ~${predictionMw ? predictionMw.apparentMwkDa.toFixed(1) : '?'} kDa)`
                      : `★ Target (${targetVe.toFixed(2)} mL, ${s.targetMwKDa} kDa)`;

                    return (
                      <g>
                        <path
                          d={d}
                          fill="rgba(244, 63, 94, 0.28)"
                          stroke="#f43f5e"
                          stroke-width="2.5"
                        />
                        <line
                          x1={peakX}
                          y1={220 - peakH}
                          x2={peakX}
                          y2={220}
                          stroke="#f43f5e"
                          stroke-width="1.5"
                          stroke-dasharray="2,2"
                        />
                        <circle cx={peakX} cy={220 - peakH} r="3" fill="#e11d48" />
                        <text
                          x={peakX}
                          y={220 - peakH - 8}
                          text-anchor="middle"
                          font-size="11"
                          font-weight="bold"
                          fill="#e11d48"
                          class="select-none"
                        >
                          {labelText}
                        </text>
                      </g>
                    );
                  })()}
                </svg>

                {/* Theoretical Plate Efficiency & Peak Width Justification */}
                <div class="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                  <div class="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>🔬</span>
                    <span>Chromatographic Band Broadening &amp; Plate Theory (N ≈ 15,000 plates)</span>
                  </div>
                  <p>
                    Simulated peaks use Gaussian band-broadening governed by theoretical plate count: <span class="font-mono font-semibold text-slate-700 dark:text-slate-300">σ_V = V_e / √N</span>. Analytical monodisperse matrices (e.g. Superdex 200 Increase 10/300 GL with 8.6 µm beads) operate at N ≈ 15,000–25,000 plates/column, yielding tall, slender peaks with half-height width W₁/₂ = 2.355 σ ≈ 0.20–0.35 mL.
                  </p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400">
                    <em>Why are peaks sometimes broader in the lab?</em> Broad, tailing, or asymmetric peaks in wet-lab chromatography typically stem from: (1) conformational polydispersity or oligomer exchange kinetics, (2) non-spherical protein geometry (elevated frictional ratio f/f₀), (3) column dead volume / tubing dispersion, or (4) large injection loading volume (&gt;2–5% of bed volume).
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      }
      actions={<ActionBar onCopy={copySummary} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
      />
    </>
  );
}

type WorkbenchTab = 'calibration' | 'run' | 'planner';
type WorkbenchAudit = { opticalInputs: Record<string, string | number | boolean | undefined>; methodSettings: Record<string, string | number | boolean | undefined>; findings: string[] };

const WORKBENCH_TABS: Array<{ id: WorkbenchTab; label: string }> = [
  { id: 'calibration', label: 'SEC calibration' },
  { id: 'run', label: 'Run & fractions' },
  { id: 'planner', label: 'Method planner' },
];

function numberOrUndefined(value: string): number | undefined {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined;
}

function TracePlot({ raw, channels, derived: _derived }: { raw: Array<{ volumeMl: number; signalAu: number }>; channels?: ChromatogramImport['traces']; derived?: Array<{ volumeMl: number; signalAu: number }> }) {
  const fallback = [{ id: 'uv280', label: 'UV 280', unit: 'mAU', points: raw.map(point => ({ volumeMl: point.volumeMl, value: point.signalAu * 1000 })) }];
  const traces = channels?.length ? channels : fallback;
  const [selected, setSelected] = useState(traces[0]?.id ?? 'uv280');
  const active = traces.find(trace => trace.id === selected) ?? traces[0];
  if (!active || active.points.length < 2) return <p class="text-sm text-slate-500">Import a mapped volume and detector trace to plot it.</p>;
  return <section class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><div class="mb-3 flex flex-wrap items-center gap-2"><strong class="text-sm">Trace viewer</strong><span class="text-xs text-slate-500">Hover the trace for the exact volume and value.</span>{traces.map(trace => <button type="button" aria-pressed={active.id === trace.id} onClick={() => setSelected(trace.id)} class={active.id === trace.id ? 'rounded-full bg-accent-600 px-3 py-1 text-xs font-semibold text-white' : 'rounded-full border px-3 py-1 text-xs'}>{trace.label} ({trace.unit})</button>)}</div><LineChart title="Chromatogram raw and derived overlays" series={[{ name: active.label, x: active.points.map(point => point.volumeMl), y: active.points.map(point => point.value), color: '#2563eb' }]} xLabel="Elution volume (mL)" yLabel={`${active.label} (${active.unit})`} exportName="chromatogram-trace" /></section>;
}

function _LegacyRunFractionsPanel() {
  const [source, setSource] = useState('');
  const [mapping, setMapping] = useState<Partial<Record<ChromatogramColumnName, string>>>({});
  const [accepted, setAccepted] = useState<number | null>(null);
  const [selectedFraction, setSelectedFraction] = useState<string | null>(null);
  const result = useMemo<{ data?: ChromatogramImport; error?: string }>(() => {
    if (!source.trim()) return {};
    try {
      const columns = Object.fromEntries(Object.entries(mapping).flatMap(([key, value]) => {
        const parsed = value === undefined || value === '' ? undefined : Number(value);
        return parsed === undefined ? [] : [[key, parsed]];
      }));
      return { data: parseChromatogram(source, columns) };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Could not parse chromatogram.' }; }
  }, [source, mapping]);
  const data = result.data;
  const raw = (data?.points ?? []).flatMap(point => point.volumeMl !== undefined && point.uv280 !== undefined ? [{ volumeMl: point.volumeMl, signalAu: point.uv280 / 1000 }] : []);
  const baseline = useMemo(() => applyBaseline(raw, 'endpoint'), [raw]);
  const derived = baseline.points.map(point => ({ volumeMl: point.volumeMl, signalAu: point.correctedSignalAu }));
  const candidates = useMemo(() => detectPeakCandidates(derived, { minimumProminenceAu: 0.0001, minimumWidthMl: 0 }), [derived]);
  const acceptedCandidate: PeakCandidate | undefined = accepted === null ? undefined : candidates[accepted];
  const integration = acceptedCandidate ? integratePeak(derived, acceptedCandidate.startVolumeMl, acceptedCandidate.endVolumeMl) : undefined;
  const setColumn = (field: ChromatogramColumnName, value: string) => { setMapping(current => ({ ...current, [field]: value })); setAccepted(null); };
  const headers = data?.sourceHeaders ?? (source.split(/\r?\n/)[0]?.split(/[\t,;]/) ?? []);
  const selector = (field: ChromatogramColumnName, label: string) => <label class="block text-sm">{label}<select aria-label={label} value={mapping[field] ?? ''} onChange={event => setColumn(field, (event.target as HTMLSelectElement).value)} class={`${FIELD} mt-1`}><option value="">Auto / not mapped</option>{headers.map((header, index) => <option value={String(index)}>{index}: {header}</option>)}</select></label>;
  const exportRaw = () => downloadText(toCsv([['volume_ml', 'uv280_mAU'], ...(data?.points ?? []).map(point => [point.volumeMl ?? '', point.uv280 ?? ''])]), 'chromatography-raw.csv', 'text/csv;charset=utf-8');
  const exportRawJson = () => downloadText(JSON.stringify({ sourceHeaders: data?.sourceHeaders ?? [], points: data?.points ?? [], fractions: data?.fractions ?? [] }, null, 2), 'chromatography-raw.json', 'application/json;charset=utf-8');
  const exportDerivedCsv = () => downloadText(toCsv([['record', 'start_volume_ml', 'apex_or_end_volume_ml', 'area_au_ml'], ...candidates.map((candidate, index) => [`candidate_${index + 1}`, candidate.startVolumeMl, candidate.apexVolumeMl, candidate.areaAuMl]), ...(integration ? [['accepted_peak', integration.startVolumeMl, integration.endVolumeMl, integration.areaAuMl] as (string | number)[]] : [])]), 'chromatography-derived.csv', 'text/csv;charset=utf-8');
  const exportDerived = () => downloadText(JSON.stringify({ baseline: 'endpoint', acceptedCandidate, integration, fractions: data?.fractions ?? [] }, null, 2), 'chromatography-derived.json', 'application/json;charset=utf-8');
  const fraction = data?.fractions.find(item => item.label === selectedFraction);
  return <section class="space-y-5"><div class="grid gap-4 lg:grid-cols-2"><label class="text-sm font-medium">Chromatogram CSV or TSV<textarea aria-label="Chromatogram CSV or TSV" value={source} onInput={event => { setSource((event.target as HTMLTextAreaElement).value); setAccepted(null); setSelectedFraction(null); }} placeholder="Volume,UV 280,Fraction" rows={8} class={`${FIELD} mt-1 font-mono text-xs`} /></label><div class="grid content-start gap-3">{selector('volumeMl', 'Volume column')}{selector('uv280', 'UV 280 column')}{selector('fraction', 'Fraction column')}<p class="text-xs text-slate-500">Map columns explicitly when instrument headings are nonstandard. Raw instrument UV values remain mAU; derived analysis converts them to AU.</p></div></div>{result.error && <p role="alert" class="text-sm text-rose-700">{result.error}</p>}{data && <><TracePlot raw={raw} derived={derived} /><div class="grid gap-4 lg:grid-cols-2"><section><h2 class="font-semibold">Candidate peaks</h2><p class="text-xs text-slate-500">Candidates are not derived records until explicitly accepted.</p>{candidates.length === 0 ? <p class="mt-2 text-sm text-slate-500">No candidate peaks meet the current trace thresholds.</p> : candidates.map((candidate, index) => <div class="mt-2 rounded border p-2 text-sm"><span>Candidate {index + 1}: apex {candidate.apexVolumeMl.toFixed(2)} mL</span><button type="button" onClick={() => setAccepted(index)} class="ml-3 rounded border px-2 py-1 text-xs">Accept candidate {index + 1}</button></div>)}</section><section><h2 class="font-semibold">Fractions ({data.fractions.length})</h2>{data.fractions.length ? <ul class="mt-2 space-y-1 text-sm">{data.fractions.map(item => <li><button type="button" aria-pressed={selectedFraction === item.label} onClick={() => setSelectedFraction(item.label)} class="rounded border px-2 py-1">Select fraction {item.label}</button></li>)}</ul> : <p class="mt-2 text-sm text-slate-500">No fractions were supplied.</p>}</section></div>{fraction && <section class="rounded border p-3 text-sm"><strong>Fraction details: {fraction.label}</strong><p>{fraction.startVolumeMl === undefined ? 'Instrument label retained; no collection bounds were supplied.' : `${fraction.startVolumeMl}–${fraction.endVolumeMl} mL`}</p></section>}{acceptedCandidate && integration && <section class="rounded border border-blue-200 bg-blue-50 p-3 text-sm dark:bg-blue-950/20"><h2 class="font-semibold">Accepted peak details</h2><p>Apex {acceptedCandidate.apexVolumeMl.toFixed(2)} mL; integration {integration.areaAuMl.toExponential(3)} AU·mL.</p></section>}<div class="flex flex-wrap gap-2"><button type="button" onClick={exportRaw} class="rounded border px-3 py-1.5 text-sm">Export raw CSV</button><button type="button" onClick={exportRawJson} class="rounded border px-3 py-1.5 text-sm">Export raw JSON</button><button type="button" onClick={exportDerivedCsv} class="rounded border px-3 py-1.5 text-sm">Export derived CSV</button><button type="button" onClick={exportDerived} class="rounded border px-3 py-1.5 text-sm">Export derived JSON</button></div>{data.notices.map(notice => <p role="alert" class="text-xs text-amber-700">Warning: {notice}</p>)}</>}</section>;
}

function RunFractionsPanel({ audit }: { audit: WorkbenchAudit }) {
  const [source, setSource] = useState('');
  const [sourceFilename, setSourceFilename] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ChromatogramColumnName, string>>>({});
  const [baselineMode, setBaselineMode] = useState<BaselineMode>('none');
  const [accepted, setAccepted] = useState<number | null>(null);
  const [selectedFraction, setSelectedFraction] = useState<string | null>(null);
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [manualAccepted, setManualAccepted] = useState(false);
  const [amountInputs, setAmountInputs] = useState({ a280: '', epsilonMolar: '', molecularWeightGPerMol: '', pathCm: '', fractionVolumeMl: '' });

  const result = useMemo<{ data?: ChromatogramImport; error?: string }>(() => {
    if (!source.trim()) return {};
    try {
      const columns = Object.fromEntries(Object.entries(mapping).flatMap(([key, value]) => value === undefined || value === '' ? [] : [[key, Number(value)]]));
      return { data: parseChromatogram(source, columns) };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Could not parse chromatogram.' }; }
  }, [source, mapping]);
  const data = result.data;
  const raw = (data?.points ?? []).flatMap(point => point.volumeMl !== undefined && point.uv280 !== undefined ? [{ volumeMl: point.volumeMl, signalAu: point.uv280 / 1000 }] : []);
  const baseline = useMemo(() => applyBaseline(raw, baselineMode), [raw, baselineMode]);
  const derived = baseline.points.map(point => ({ volumeMl: point.volumeMl, signalAu: point.correctedSignalAu }));
  const candidates = useMemo(() => detectPeakCandidates(derived, { minimumProminenceAu: 0.0001, minimumWidthMl: 0 }), [derived]);
  const acceptedCandidate: PeakCandidate | undefined = accepted === null ? undefined : candidates[accepted];
  const candidateIntegration = acceptedCandidate ? integratePeak(derived, acceptedCandidate.startVolumeMl, acceptedCandidate.endVolumeMl) : undefined;
  const manualResult = useMemo<{ integration?: ReturnType<typeof integratePeak>; error?: string }>(() => {
    if (!manualAccepted) return {};
    const start = numberOrUndefined(manualStart); const end = numberOrUndefined(manualEnd);
    if (start === undefined || end === undefined) return { error: 'Manual peak start and end volumes are required.' };
    try { return { integration: integratePeak(derived, start, end) }; } catch (error) { return { error: error instanceof Error ? error.message : 'Manual peak bounds are invalid.' }; }
  }, [derived, manualAccepted, manualStart, manualEnd]);
  const fraction = data?.fractions.find(item => item.label === selectedFraction);
  const amount = useMemo(() => estimateFractionAmount({
    a280: numberOrUndefined(amountInputs.a280), epsilonMolar: numberOrUndefined(amountInputs.epsilonMolar), molecularWeightGPerMol: numberOrUndefined(amountInputs.molecularWeightGPerMol), pathCm: numberOrUndefined(amountInputs.pathCm), fractionVolumeMl: numberOrUndefined(amountInputs.fractionVolumeMl),
  }), [amountInputs]);
  const resetReview = () => { setAccepted(null); setSelectedFraction(null); setManualAccepted(false); };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(asc|csv|tsv|txt)$/i.test(file.name)) {
      setImportError('Choose an ÅKTA .asc, CSV, TSV, or text export.');
      return;
    }
    try {
      setSource(await file.text());
      setSourceFilename(file.name);
      setImportError(null);
      resetReview();
    } catch {
      setImportError(`Could not read ${file.name}.`);
    }
  };
  const setColumn = (field: ChromatogramColumnName, value: string) => { setMapping(current => ({ ...current, [field]: value })); setAccepted(null); };
  const headers = data?.sourceHeaders ?? (source.split(/\r?\n/)[0]?.split(/[\t,;]/) ?? []);
  const selector = (field: ChromatogramColumnName, label: string) => <label class="block text-sm">{label}<select aria-label={label} value={mapping[field] ?? ''} onChange={event => setColumn(field, (event.target as HTMLSelectElement).value)} class={`${FIELD} mt-1`}><option value="">Auto / not mapped</option>{headers.map((header, index) => <option value={String(index)}>{index}: {header}</option>)}</select></label>;
  const auditRecord = (kind: 'raw' | 'derived') => ({
    app: 'Chromatography Workbench', recordType: kind, exportedAt: new Date().toISOString(),
    source: { filename: sourceFilename || 'pasted-chromatogram.csv', sourceText: source, sourceHeaders: data?.sourceHeaders ?? [], mappedHeaders: data?.mappedHeaders ?? {}, parserNotices: data?.notices ?? [], mapping },
    baseline: baselineMode, candidates, acceptedCandidate, candidateIntegration, manualBounds: { startVolumeMl: numberOrUndefined(manualStart), endVolumeMl: numberOrUndefined(manualEnd), accepted: manualAccepted, integration: manualResult.integration },
    fractionSelection: fraction, opticalInputs: { ...audit.opticalInputs, fractionAmountInputs: amountInputs }, amountEstimate: amount, methodSettings: audit.methodSettings, findings: audit.findings, rawPoints: kind === 'raw' ? data?.points ?? [] : undefined, derivedPoints: kind === 'derived' ? derived : undefined,
  });
  const exportJson = (kind: 'raw' | 'derived') => downloadText(JSON.stringify(auditRecord(kind), null, 2), `chromatography-${kind}.json`, 'application/json;charset=utf-8');
  const exportCsv = (kind: 'raw' | 'derived') => downloadText(kind === 'raw' ? toCsv([['volume_ml', 'uv280_mAU'], ...(data?.points ?? []).map(point => [point.volumeMl ?? '', point.uv280 ?? ''])]) : toCsv([['record', 'start_volume_ml', 'end_or_apex_volume_ml', 'area_au_ml'], ...candidates.map((candidate, index) => [`candidate_${index + 1}`, candidate.startVolumeMl, candidate.apexVolumeMl, candidate.areaAuMl]), ...(manualResult.integration ? [['manual_accepted', manualResult.integration.startVolumeMl, manualResult.integration.endVolumeMl, manualResult.integration.areaAuMl] as (string | number)[]] : [])]), `chromatography-${kind}.csv`, 'text/csv;charset=utf-8');
  const setAmount = (field: keyof typeof amountInputs, value: string) => setAmountInputs(current => ({ ...current, [field]: value }));

  return <section class="space-y-5">
    <div class="grid gap-4 lg:grid-cols-2"><label class="text-sm font-medium">Chromatogram CSV or TSV<textarea aria-label="Chromatogram CSV or TSV" value={source} onInput={event => { setSource((event.target as HTMLTextAreaElement).value); setSourceFilename(''); setImportError(null); resetReview(); }} placeholder="Volume,UV 280,Fraction" rows={8} class={`${FIELD} mt-1 font-mono text-xs`} /></label><div class="grid content-start gap-3"><label class="block rounded-lg border border-dashed border-slate-300 p-3 text-sm dark:border-slate-700" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void importFile(event.dataTransfer?.files[0]); }}><span class="font-medium">Drop an ÅKTA, CSV, or TSV export here</span><input aria-label="Import chromatogram file" type="file" accept=".asc,.csv,.tsv,.txt,text/plain,text/csv" class="mt-2 block w-full text-xs" onChange={event => void importFile((event.target as HTMLInputElement).files?.[0])} />{sourceFilename && <span class="mt-2 block text-xs text-slate-500">Imported: {sourceFilename}</span>}</label>{selector('volumeMl', 'Volume column')}{selector('uv280', 'UV 280 column')}{selector('fraction', 'Fraction column')}<label class="block text-sm">Baseline correction<select aria-label="Baseline correction" value={baselineMode} onChange={event => setBaselineMode((event.target as HTMLSelectElement).value as BaselineMode)} class={`${FIELD} mt-1`}><option value="none">none</option><option value="endpoint">endpoint</option><option value="rolling-minimum">rolling-minimum</option></select></label><p class="text-xs text-slate-500">Raw instrument UV values remain mAU; derived analysis is AU. Baseline: {baselineMode}.</p></div></div>
    {importError && <p role="alert" class="text-sm text-rose-700">{importError}</p>}
    {result.error && <p role="alert" class="text-sm text-rose-700">{result.error}</p>}
    {data && <><TracePlot raw={raw} channels={data.traces} /><div class="grid gap-4 lg:grid-cols-2"><section><h2 class="font-semibold">Candidate peaks</h2><p class="text-xs text-slate-500">Candidates are not derived records until explicitly accepted.</p>{candidates.length === 0 ? <p class="mt-2 text-sm text-slate-500">No candidate peaks meet the current trace thresholds.</p> : candidates.map((candidate, index) => <div class="mt-2 rounded border p-2 text-sm"><span>Candidate {index + 1}: apex {candidate.apexVolumeMl.toFixed(2)} mL</span><button type="button" onClick={() => setAccepted(index)} class="ml-3 rounded border px-2 py-1 text-xs">Accept candidate {index + 1}</button></div>)}</section><section><h2 class="font-semibold">Fractions ({data.fractions.length})</h2>{data.fractions.length ? <ul class="mt-2 space-y-1 text-sm">{data.fractions.map(item => <li><button type="button" aria-pressed={selectedFraction === item.label} onClick={() => setSelectedFraction(item.label)} class="rounded border px-2 py-1">Select fraction {item.label}</button></li>)}</ul> : <p class="mt-2 text-sm text-slate-500">No fractions were supplied.</p>}</section></div>
    <section class="rounded border p-3"><h2 class="font-semibold">Manual peak integration</h2><div class="mt-2 grid gap-2 sm:grid-cols-3"><label class="text-sm">Manual peak start<input aria-label="Manual peak start" value={manualStart} onInput={event => { setManualStart((event.target as HTMLInputElement).value); setManualAccepted(false); }} class={`${FIELD} mt-1`} /></label><label class="text-sm">Manual peak end<input aria-label="Manual peak end" value={manualEnd} onInput={event => { setManualEnd((event.target as HTMLInputElement).value); setManualAccepted(false); }} class={`${FIELD} mt-1`} /></label><button type="button" onClick={() => setManualAccepted(true)} class="self-end rounded border px-3 py-2 text-sm">Accept manual peak bounds</button></div>{manualResult.error && <p role="alert" class="mt-2 text-sm text-rose-700">{manualResult.error}</p>}{manualResult.integration && <p class="mt-2 text-sm"><strong>Manual accepted peak details</strong>: {manualResult.integration.startVolumeMl.toFixed(2)}–{manualResult.integration.endVolumeMl.toFixed(2)} mL; {manualResult.integration.areaAuMl.toExponential(3)} AU·mL.</p>}</section>
    {fraction && <section class="rounded border p-3 text-sm"><strong>Fraction details: {fraction.label}</strong><p>{fraction.startVolumeMl === undefined ? 'Instrument label retained; no collection bounds were supplied.' : `${fraction.startVolumeMl}–${fraction.endVolumeMl} mL`}</p><h3 class="mt-3 font-semibold">Fraction amount estimate</h3><div class="mt-2 grid gap-2 sm:grid-cols-5">{([['a280', 'Fraction A280'], ['epsilonMolar', 'Protein epsilon'], ['molecularWeightGPerMol', 'Protein molecular weight'], ['pathCm', 'Path length'], ['fractionVolumeMl', 'Fraction volume']] as const).map(([field, label]) => <label class="text-xs">{label}<input aria-label={label} value={amountInputs[field]} onInput={event => setAmount(field, (event.target as HTMLInputElement).value)} class={`${FIELD} mt-1`} /></label>)}</div><p class={amount.status === 'derived' ? 'mt-2 text-emerald-700' : 'mt-2 text-amber-700'}>{amount.status === 'derived' ? `Amount estimate: ${amount.amountMg?.toFixed(4)} mg` : `Amount estimate blocked: ${amount.blockers.join(', ')}`}</p></section>}
    {acceptedCandidate && candidateIntegration && <section class="rounded border border-blue-200 bg-blue-50 p-3 text-sm dark:bg-blue-950/20"><h2 class="font-semibold">Accepted peak details</h2><p>Apex {acceptedCandidate.apexVolumeMl.toFixed(2)} mL; integration {candidateIntegration.areaAuMl.toExponential(3)} AU·mL.</p></section>}
    <div class="flex flex-wrap gap-2"><button type="button" onClick={() => exportCsv('raw')} class="rounded border px-3 py-1.5 text-sm">Export raw CSV</button><button type="button" onClick={() => exportJson('raw')} class="rounded border px-3 py-1.5 text-sm">Export raw JSON</button><button type="button" onClick={() => exportCsv('derived')} class="rounded border px-3 py-1.5 text-sm">Export derived CSV</button><button type="button" onClick={() => exportJson('derived')} class="rounded border px-3 py-1.5 text-sm">Export derived JSON</button></div>{data.notices.map(notice => <p role="alert" class="text-xs text-amber-700">Warning: {notice}</p>)}</>}</section>;
}

function MethodPlannerPanel({ onAudit }: { onAudit: (audit: Partial<WorkbenchAudit>) => void }) {
  const [sequence, setSequence] = useState('');
  const [targetPh, setTargetPh] = useState('6');
  const [bufferA, setBufferA] = useState('Editable low-salt ion-exchange starting buffer.');
  const [bufferB, setBufferB] = useState('Editable higher-salt ion-exchange elution buffer.');
  const [columnVolume, setColumnVolume] = useState('1');
  const [flow, setFlow] = useState('1');
  const [startB, setStartB] = useState('0');
  const [endB, setEndB] = useState('100');
  const [gradientCv, setGradientCv] = useState('10');
  const protein = useMemo(() => sequence.trim() ? summarize(sequence) : undefined, [sequence]);
  const advice = useMemo(() => protein && protein.length > 0 && numberOrUndefined(targetPh) !== undefined ? suggestIonExchange({ proteinPi: protein.pI, targetPh: Number(targetPh) }) : undefined, [protein, targetPh]);
  const gradientResult = useMemo<{ data?: ReturnType<typeof simulateGradient>; error?: string }>(() => {
    const values = [columnVolume, flow, startB, endB, gradientCv].map(numberOrUndefined);
    if (!values.every((value): value is number => value !== undefined)) return { error: 'All gradient settings must be finite numbers.' };
    try { return { data: simulateGradient({ columnVolumeMl: values[0]!, flowMlPerMin: values[1]!, startPercentB: values[2]!, endPercentB: values[3]!, gradientCv: values[4]! }) }; }
    catch (error) { return { error: error instanceof Error ? error.message : 'Gradient settings are invalid.' }; }
  }, [columnVolume, flow, startB, endB, gradientCv]);
  const gradient = gradientResult.data;
  useEffect(() => onAudit({
    methodSettings: { sequence, targetPh, bufferA, bufferB, columnVolume, flow, startB, endB, gradientCv, gradientError: gradientResult.error },
    findings: advice?.findings.map(finding => `${finding.severity}: ${finding.message}`) ?? [],
  }), [advice, bufferA, bufferB, columnVolume, endB, flow, gradientCv, gradientResult.error, onAudit, sequence, startB, targetPh]);
  const field = (label: string, value: string, setter: (value: string) => void) => <label class="block text-sm">{label}<input aria-label={label} value={value} onInput={event => setter((event.target as HTMLInputElement).value)} class={`${FIELD} mt-1`} /></label>;
  return <section class="space-y-5"><div class="grid gap-4 lg:grid-cols-2"><label class="text-sm">Protein sequence<textarea aria-label="Protein sequence" value={sequence} onInput={event => setSequence((event.target as HTMLTextAreaElement).value)} class={`${FIELD} mt-1 font-mono`} rows={5} /></label><div class="space-y-3">{field('Target pH', targetPh, setTargetPh)}{protein && <p class="text-sm">Sequence pI: <strong>{protein.pI.toFixed(2)}</strong>; ε280: <strong>{protein.ext.cystines.toLocaleString()} M⁻¹cm⁻¹</strong>.</p>}{advice ? <div class={advice.status === 'review-required' ? 'rounded border border-amber-300 bg-amber-50 p-3 text-sm' : 'rounded border border-emerald-300 bg-emerald-50 p-3 text-sm'}><strong>{advice.status === 'review-required' ? 'Review required' : `Suggested ${advice.mode}`}</strong><p>{advice.findings[0]?.message}</p></div> : <p class="text-sm text-slate-500">Add a protein sequence to receive pI-informed advice.</p>}</div></div><div class="grid gap-3 md:grid-cols-2"><label class="rounded border p-3 text-sm">Buffer A description<textarea aria-label="Buffer A description" value={bufferA} onInput={event => setBufferA((event.target as HTMLTextAreaElement).value)} class={`${FIELD} mt-1`} rows={3} /></label><label class="rounded border p-3 text-sm">Buffer B description<textarea aria-label="Buffer B description" value={bufferB} onInput={event => setBufferB((event.target as HTMLTextAreaElement).value)} class={`${FIELD} mt-1`} rows={3} /></label></div><section><h2 class="font-semibold">Gradient planner</h2><div class="mt-2 grid gap-3 sm:grid-cols-5">{field('Column volume (mL)', columnVolume, setColumnVolume)}{field('Flow (mL/min)', flow, setFlow)}{field('Start %B', startB, setStartB)}{field('End %B', endB, setEndB)}{field('Gradient (CV)', gradientCv, setGradientCv)}</div>{gradientResult.error && <p role="alert" class="mt-2 text-sm text-rose-700">{gradientResult.error}</p>}{gradient && <><svg aria-label="Gradient plan" viewBox="0 0 560 180" class="mt-4 w-full rounded border"><line x1="45" y1="145" x2="530" y2="145" stroke="#94a3b8" /><polyline fill="none" stroke="#2563eb" stroke-width="3" points={gradient.points.map(point => `${45 + point.columnVolumes / Math.max(gradient.totalColumnVolumes, 1) * 485},${145 - point.percentB / 100 * 110}`).join(' ')} /><text x="45" y="166" font-size="10">0 CV</text><text x="485" y="166" font-size="10">{gradient.totalColumnVolumes.toFixed(1)} CV</text></svg><p class="mt-2 text-sm">Gradient end: {gradient.atGradientEnd.volumeMl.toFixed(1)} mL / {gradient.atGradientEnd.timeMin.toFixed(1)} min; total {gradient.totalTimeMin.toFixed(1)} min.</p></>}</section></section>;
}

function _SpectraPanel({ onAudit }: { onAudit: (audit: Partial<WorkbenchAudit>) => void }) {
  const [source, setSource] = useState('');
  const [scatterEnabled, setScatterEnabled] = useState(false);
  const [dyeAbsorbance, setDyeAbsorbance] = useState('');
  const [dyeEpsilon, setDyeEpsilon] = useState('');
  const [correctionFactor, setCorrectionFactor] = useState('');
  const [proteinEpsilon, setProteinEpsilon] = useState('');
  const imported = useMemo<{ data?: SpectrumImport; error?: string }>(() => { if (!source.trim()) return {}; try { return { data: parseSpectrum(source) }; } catch (error) { return { error: error instanceof Error ? error.message : 'Could not parse spectrum.' }; } }, [source]);
  const observed = imported.data?.points.find(point => point.wavelengthNm === 280)?.absorbance;
  const scatterFit = useMemo(() => imported.data ? fitLogScatter(imported.data.points) : undefined, [imported.data]);
  const scatter = scatterEnabled && observed !== undefined && scatterFit ? correctA280ForScatter(observed, scatterFit) : undefined;
  const dol = calculateDyeLabeling({ a280: observed, dyeAbsorbance: numberOrUndefined(dyeAbsorbance), dyeEpsilon: numberOrUndefined(dyeEpsilon), correctionFactor280: numberOrUndefined(correctionFactor), proteinEpsilon: numberOrUndefined(proteinEpsilon), pathCm: 1, scatterCorrection: scatterEnabled ? scatter : undefined });
  useEffect(() => onAudit({ opticalInputs: { spectrumSourceText: source, observedA280: observed, scatterEnabled, dyeAbsorbance, dyeEpsilon, correctionFactor280: correctionFactor, proteinEpsilon, dolStatus: dol.status } }), [correctionFactor, dyeAbsorbance, dyeEpsilon, dol.status, observed, onAudit, proteinEpsilon, scatterEnabled, source]);
  const yMax = Math.max(0.01, ...(imported.data?.points.map(point => point.absorbance) ?? [0]));
  const plot = (imported.data?.points ?? []).map((point, index, all) => `${index ? 'L' : 'M'} ${45 + (point.wavelengthNm - all[0]!.wavelengthNm) / Math.max(1, all.at(-1)!.wavelengthNm - all[0]!.wavelengthNm) * 500} ${155 - point.absorbance / yMax * 120}`).join(' ');
  const field = (label: string, value: string, setter: (value: string) => void) => <label class="block text-sm">{label}<input aria-label={label} value={value} onInput={event => setter((event.target as HTMLInputElement).value)} class={`${FIELD} mt-1`} /></label>;
  return <section class="space-y-5"><label class="block text-sm">Spectrum CSV or TSV<textarea aria-label="Spectrum CSV or TSV" value={source} onInput={event => setSource((event.target as HTMLTextAreaElement).value)} placeholder="Wavelength,Absorbance" rows={6} class={`${FIELD} mt-1 font-mono text-xs`} /></label>{imported.error && <p role="alert" class="text-sm text-rose-700">{imported.error}</p>}{imported.data && <><svg aria-label="UV-Vis spectrum" viewBox="0 0 560 180" class="w-full rounded border"><line x1="45" y1="155" x2="545" y2="155" stroke="#94a3b8" /><path d={plot} fill="none" stroke="#7c3aed" stroke-width="3" /></svg><div class="grid gap-3 sm:grid-cols-2"><div class="rounded border p-3 text-sm"><strong>Observed A280</strong><p>{observed === undefined ? 'No 280 nm observation' : observed.toFixed(4)}</p></div><label class="rounded border p-3 text-sm"><input aria-label="Apply 300–340 nm scatter correction" type="checkbox" checked={scatterEnabled} onChange={event => setScatterEnabled((event.target as HTMLInputElement).checked)} /> Apply 300–340 nm scatter correction{scatterEnabled && <p class="mt-2"><strong>Scatter-corrected A280</strong>: {scatter?.correctedA280?.toFixed(4) ?? 'unavailable'}</p>}</label></div><div class="overflow-x-auto"><table class="w-full text-left text-xs"><thead><tr><th>Wavelength</th><th>Absorbance</th></tr></thead><tbody>{imported.data.points.map(point => <tr><td>{point.wavelengthNm} nm</td><td>{point.absorbance.toFixed(4)}</td></tr>)}</tbody></table></div>{scatter?.warnings.map(warning => <p role="alert" class="text-xs text-amber-700">Warning: {warning}</p>)}</>}<section class="rounded border p-4"><h2 class="font-semibold">Dye-to-protein labeling (DOL)</h2><p class="mt-1 text-xs text-slate-500">Supply dye ε and CF280 from the dye manufacturer; this calculator does not infer either coefficient.</p><div class="mt-3 grid gap-3 sm:grid-cols-2">{field('Dye absorbance', dyeAbsorbance, setDyeAbsorbance)}{field('Dye epsilon', dyeEpsilon, setDyeEpsilon)}{field('CF280', correctionFactor, setCorrectionFactor)}{field('Protein epsilon', proteinEpsilon, setProteinEpsilon)}</div><p class={dol.status === 'derived' ? 'mt-3 text-sm text-emerald-700' : 'mt-3 text-sm text-amber-700'}>{dol.status === 'derived' ? `DOL: ${dol.dol?.toFixed(3)}` : `DOL blocked: ${dol.blockers.join(', ') || 'enter a spectrum and manufacturer coefficients'}`}</p>{dol.warnings.map(warning => <p role="alert" class="mt-1 text-xs text-amber-700">Warning: {warning}</p>)}</section></section>;
}

export default function SecView() {
  const [tab, setTab] = useState<WorkbenchTab>('calibration');
  const [audit, setAudit] = useState<WorkbenchAudit>({ opticalInputs: {}, methodSettings: {}, findings: [] });
  const updateAudit = useCallback((patch: Partial<WorkbenchAudit>) => setAudit(current => ({ ...current, ...patch })), []);
  return <div class="mx-auto max-w-[92rem]"><header class="px-3 pt-3 sm:px-4"><h1 class="text-xl font-bold">🧪 Chromatography Workbench</h1><p class="text-sm text-slate-600 dark:text-slate-300">SEC calibration, chromatogram review, and method planning.</p><nav aria-label="Chromatography workbench tabs" class="mt-3 flex flex-wrap gap-2 border-b pb-3">{WORKBENCH_TABS.map(item => <button type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)} class={tab === item.id ? 'rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white' : 'rounded-lg border px-3 py-1.5 text-sm'}>{item.label}</button>)}</nav></header><div class="p-3 sm:p-4">{tab === 'calibration' && <CalibrationPanel embedded />}{tab === 'run' && <RunFractionsPanel audit={audit} />}{tab === 'planner' && <MethodPlannerPanel onAudit={updateAudit} />}</div></div>;
}
