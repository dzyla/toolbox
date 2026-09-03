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
  fitSecCalibration,
  predictFromVe,
  predictVeFromMw,
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

  const [standards, setStandards] = useState<SecStandard[]>(() => JSON.parse(JSON.stringify(DEFAULT_STANDARDS_S200)));
  const [activeTab, setActiveTab] = useState<'curve' | 'chromatogram'>('curve');

  // Handle column selection
  function handleSelectColumn(colId: string) {
    const col = PRESET_COLUMNS.find(c => c.id === colId);
    if (col) {
      set({ columnId: colId, vt: col.bedVolume, v0: col.voidVolume });
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
      { id: newId, name: 'New Standard', mwDa: 50000, elutionVolumeMl: 14.0, enabled: true },
    ]);
  }

  function handleResetStandards() {
    setStandards(JSON.parse(JSON.stringify(DEFAULT_STANDARDS_S200)));
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
                class="text-[11px] text-accent-600 dark:text-accent-400 hover:underline"
              >
                Reset Defaults
              </button>
            </div>

            <div class="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {standards.map(std => (
                <div
                  key={std.id}
                  class={`p-2.5 rounded-lg border text-xs flex items-center gap-2 transition ${std.enabled ? 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40' : 'border-slate-200/50 dark:border-slate-800 opacity-40'}`}
                >
                  <input
                    type="checkbox"
                    checked={std.enabled}
                    onChange={() => handleToggleStandard(std.id)}
                    class="rounded text-accent-600 focus:ring-accent-500 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={std.name}
                    onInput={(e) => handleUpdateStandard(std.id, { name: (e.target as HTMLInputElement).value })}
                    class="flex-1 bg-transparent font-medium border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-accent-500 outline-none px-1"
                  />
                  <div class="w-16">
                    <DecimalInput
                      value={std.mwDa / 1000}
                      onChange={val => handleUpdateStandard(std.id, { mwDa: val * 1000 })}
                      min={0.1}
                      step={1}
                      class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-[11px]"
                    />
                    <span class="text-[9px] text-slate-400 text-right block">kDa</span>
                  </div>
                  <div class="w-16">
                    <DecimalInput
                      value={std.elutionVolumeMl}
                      onChange={elutionVolumeMl => handleUpdateStandard(std.id, { elutionVolumeMl })}
                      min={0.1}
                      step={0.1}
                      class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-[11px]"
                    />
                    <span class="text-[9px] text-slate-400 text-right block">mL</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteStandard(std.id)}
                    class="text-slate-400 hover:text-rose-600 text-xs px-1"
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
                <svg viewBox="0 0 650 320" class="w-full h-auto min-w-[500px] select-none text-xs font-sans">
                  {/* Axes & Grid */}
                  <rect x="60" y="20" width="560" height="250" fill="none" stroke="#e2e8f0" stroke-width="1" />

                  {/* Y Axis Gridlines (Kav 0.0 to 1.0) */}
                  {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map(kVal => {
                    const y = 20 + 250 * (1 - kVal);
                    return (
                      <g key={kVal}>
                        <line x1="60" x2="620" y1={y} y2={y} stroke="#f1f5f9" stroke-dasharray="3,3" />
                        <text x="52" y={y + 4} text-anchor="end" font-size="10" fill="#94a3b8" class="font-mono">
                          {kVal.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}
                  <text x="18" y="145" text-anchor="middle" font-size="11" fill="#64748b" transform="rotate(-90, 18, 145)" font-weight="600">
                    Partition Coefficient (Kav)
                  </text>

                  {/* X Axis: log10(MW) from 3.5 (3.1 kDa) to 6.5 (3.1 MDa) */}
                  {[3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5].map(logVal => {
                    const x = 60 + ((logVal - 3.5) / 3.0) * 560;
                    const mwLabel = Math.round(10 ** logVal / 1000);
                    return (
                      <g key={logVal}>
                        <line x1={x} x2={x} y1="20" y2="270" stroke="#f1f5f9" stroke-dasharray="3,3" />
                        <text x={x} y="288" text-anchor="middle" font-size="10" fill="#94a3b8" class="font-mono">
                          {mwLabel >= 1000 ? `${(mwLabel / 1000).toFixed(1)}M` : `${mwLabel}k`}
                        </text>
                      </g>
                    );
                  })}
                  <text x="340" y="308" text-anchor="middle" font-size="11" fill="#64748b" font-weight="600">
                    Molecular Weight (Da, log scale)
                  </text>

                  {/* Regression Line */}
                  {(() => {
                    const x1 = 3.5;
                    const y1Kav = model.slope * x1 + model.intercept;
                    const x2 = 6.5;
                    const y2Kav = model.slope * x2 + model.intercept;

                    const sx1 = 60;
                    const sy1 = 20 + 250 * (1 - Math.max(0, Math.min(1, y1Kav)));
                    const sx2 = 620;
                    const sy2 = 20 + 250 * (1 - Math.max(0, Math.min(1, y2Kav)));

                    return <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} stroke="#2563eb" stroke-width="2" stroke-dasharray="4,4" />;
                  })()}

                  {/* Standard Points */}
                  {model.points.map((pt, idx) => {
                    const cx = 60 + ((pt.logMw - 3.5) / 3.0) * 560;
                    const cy = 20 + 250 * (1 - Math.max(0, Math.min(1, pt.kav)));
                    return (
                      <g key={idx} class="cursor-pointer group">
                        <circle cx={cx} cy={cy} r="5" fill="#3b82f6" stroke="#ffffff" stroke-width="2" />
                        <text
                          x={cx}
                          y={cy - 8}
                          text-anchor="middle"
                          font-size="9"
                          fill="#475569"
                          font-weight="600"
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
                        const cx = 60 + ((logMw - 3.5) / 3.0) * 560;
                        const cy = 20 + 250 * (1 - Math.max(0, Math.min(1, predictionMw.kav)));
                        return (
                          <g>
                            <line x1={cx} y1="20" x2={cx} y2="270" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.6" />
                            <line x1="60" y1={cy} x2="620" y2={cy} stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.6" />
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

                  {/* Standard peaks (grey/blue) */}
                  {standards.filter(x => x.enabled).map((std, i) => {
                    const peakX = 50 + (std.elutionVolumeMl / s.vt) * 570;
                    const peakW = 16;
                    const peakH = 65 + (i % 3) * 15;
                    return (
                      <g key={std.id} opacity="0.65">
                        <path
                          d={`M ${peakX - peakW * 2} 220 Q ${peakX} ${220 - peakH * 2} ${peakX + peakW * 2} 220`}
                          fill="rgba(59, 130, 246, 0.15)"
                          stroke="#3b82f6"
                          stroke-width="1.5"
                        />
                        <text x={peakX} y={220 - peakH - 4} text-anchor="middle" font-size="9" fill="#2563eb" font-weight="600">
                          {std.name.split(' ')[0]}
                        </text>
                      </g>
                    );
                  })}

                  {/* Unknown peak (Rose) */}
                  {s.queryMode === 've_to_mw' && s.unknownVe > 0 && (
                    (() => {
                      const peakX = 50 + (s.unknownVe / s.vt) * 570;
                      const peakW = 20;
                      const peakH = 110;
                      return (
                        <g>
                          <path
                            d={`M ${peakX - peakW * 2} 220 Q ${peakX} ${220 - peakH * 2} ${peakX + peakW * 2} 220`}
                            fill="rgba(244, 63, 94, 0.25)"
                            stroke="#f43f5e"
                            stroke-width="2.5"
                          />
                          <text x={peakX} y={220 - peakH - 8} text-anchor="middle" font-size="11" font-weight="bold" fill="#e11d48">
                            ★ Unknown Peak ({s.unknownVe} mL)
                          </text>
                        </g>
                      );
                    })()
                  )}
                </svg>
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
