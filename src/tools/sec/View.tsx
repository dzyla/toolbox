import { useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { SCIENCE } from './science';
import {
  type SecStandard,
  PRESET_COLUMNS,
  DEFAULT_STANDARDS_S200,
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

export default function SecView() {
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

  // Dynamic x-axis range adapted to active column fractionation range and loaded standards
  const { xMinLog, xMaxLog, xTicks } = useMemo(() => {
    const allMw = [
      activeColumn.rangeMinDa,
      activeColumn.rangeMaxDa,
      ...standards.filter(st => st.enabled && st.mwDa > 0).map(st => st.mwDa),
      ...(s.queryMode === 've_to_mw' && predictionMw ? [predictionMw.apparentMwDa] : []),
      ...(s.queryMode === 'mw_to_ve' && s.targetMwKDa > 0 ? [s.targetMwKDa * 1000] : []),
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
  }, [activeColumn, standards, s.queryMode, predictionMw, s.targetMwKDa]);

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
    <ToolLayout
      icon="🧪"
      title="SEC Calibration & Stokes Radius"
      blurb="Size exclusion chromatography calibration curve, apparent molecular weight estimation, Stokes radius (Rh), and oligomeric state analysis."
      wide={true}
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

                  {/* Regression Line */}
                  {(() => {
                    const sx1 = 60;
                    const y1Kav = model.slope * xMinLog + model.intercept;
                    const sy1 = 20 + 250 * (1 - Math.max(0, Math.min(1, y1Kav)));
                    const sx2 = 630;
                    const y2Kav = model.slope * xMaxLog + model.intercept;
                    const sy2 = 20 + 250 * (1 - Math.max(0, Math.min(1, y2Kav)));

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

                  {/* Unknown Sample Point */}
                  {s.queryMode === 've_to_mw' && predictionMw && (
                    <g>
                      {(() => {
                        const logMw = Math.log10(predictionMw.apparentMwDa);
                        const cx = 60 + ((logMw - xMinLog) / (xMaxLog - xMinLog)) * 570;
                        const cy = 20 + 250 * (1 - Math.max(0, Math.min(1, predictionMw.kav)));
                        return (
                          <g>
                            <line x1={cx} y1="20" x2={cx} y2="270" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.6" />
                            <line x1="60" y1={cy} x2="630" y2={cy} stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.6" />
                            <circle cx={cx} cy={cy} r="8" fill="#f43f5e" stroke="#ffffff" stroke-width="2.5" />
                            <text x={cx} y={cy - 12} text-anchor="middle" font-size="11" font-weight="bold" fill="#e11d48">
                              Unknown ({predictionMw.apparentMwkDa.toFixed(1)} kDa)
                            </text>
                          </g>
                        );
                      })()}
                    </g>
                  )}
                </svg>
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
  );
}
