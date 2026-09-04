import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { SCIENCE } from './science';
import {
  type ExchangeMode,
  type SoluteTarget,
  SPIN_FILTER_PRESETS,
  COMMON_SOLUTES,
  evaluateMwco,
  simulateUltrafiltration,
  simulateDialysis,
} from '@/core/diafiltration';

interface State {
  mode: ExchangeMode;
  filterId: string;
  initialVolMl: number;
  concentrateVolMl: number;
  numCycles: number;
  spinTimeMin: number;
  sampleVolMl: number;
  bathVolMl: number;
  bathChanges: number;
  proteinMwKDa: number;
  mwcoKDa: number;
  soluteId: string;
  initialConc: number;
  bufferConc: number;
  targetSafeConc: number;
  unit: string;
}

const DEFAULTS: State = {
  mode: 'ultrafiltration',
  filterId: 'amicon_15',
  initialVolMl: 15.0,
  concentrateVolMl: 1.0,
  numCycles: 3,
  spinTimeMin: 15,
  sampleVolMl: 3.0,
  bathVolMl: 1000.0,
  bathChanges: 3,
  proteinMwKDa: 45.0,
  mwcoKDa: 10.0,
  soluteId: 'imidazole',
  initialConc: 300.0,
  bufferConc: 0.0,
  targetSafeConc: 5.0,
  unit: 'mM',
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold';

export default function DiafiltrationView() {
  const [stateSig, shareUrl] = useUrlState<State>('diafiltration', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  function handleSelectFilter(id: string) {
    const f = SPIN_FILTER_PRESETS.find(p => p.id === id);
    if (f) {
      set({
        filterId: id,
        initialVolMl: f.maxVolumeMl,
        concentrateVolMl: Math.max(f.deadStopVolumeMl, Math.round((f.maxVolumeMl / 15) * 10) / 10),
      });
    } else {
      set({ filterId: id });
    }
  }

  function handleSelectSolute(id: string) {
    const sol = COMMON_SOLUTES.find(item => item.id === id);
    if (sol) {
      set({
        soluteId: id,
        initialConc: sol.initialConc,
        bufferConc: sol.bufferConc,
        targetSafeConc: sol.targetSafeConc,
        unit: sol.unit,
      });
    } else {
      set({ soluteId: id });
    }
  }

  // Solute object
  const soluteObj: SoluteTarget = useMemo(() => ({
    id: s.soluteId,
    name: s.soluteId,
    initialConc: s.initialConc,
    bufferConc: s.bufferConc,
    targetSafeConc: s.targetSafeConc,
    unit: s.unit,
  }), [s.soluteId, s.initialConc, s.bufferConc, s.targetSafeConc, s.unit]);

  // Calculations
  const mwcoEval = useMemo(() => {
    return evaluateMwco(s.proteinMwKDa, s.mwcoKDa);
  }, [s.proteinMwKDa, s.mwcoKDa]);

  const ufSim = useMemo(() => {
    return simulateUltrafiltration(s.initialVolMl, s.concentrateVolMl, s.numCycles, soluteObj);
  }, [s.initialVolMl, s.concentrateVolMl, s.numCycles, soluteObj]);

  const dialSim = useMemo(() => {
    return simulateDialysis(s.sampleVolMl, s.bathVolMl, s.bathChanges, soluteObj);
  }, [s.sampleVolMl, s.bathVolMl, s.bathChanges, soluteObj]);

  const copySummary = () => {
    const lines = [
      `Buffer Exchange Simulator (${s.mode === 'ultrafiltration' ? 'Centrifugal Ultrafiltration' : 'Equilibrium Dialysis'}):`,
      `Target Protein: ${s.proteinMwKDa} kDa | Membrane MWCO: ${s.mwcoKDa} kDa (${mwcoEval.recommendation})`,
      `Solute: ${soluteObj.name} (Start: ${s.initialConc} ${s.unit} -> Target: <${s.targetSafeConc} ${s.unit})`,
    ];
    if (s.mode === 'ultrafiltration') {
      lines.push(`Filter: ${s.filterId} (Initial: ${s.initialVolMl} mL, Concentrate: ${s.concentrateVolMl} mL)`);
      lines.push(`Final Concentration after ${s.numCycles} cycles: ${ufSim.finalConc < 0.01 ? ufSim.finalConc.toExponential(2) : ufSim.finalConc.toFixed(2)} ${s.unit} (${ufSim.totalDfv.toFixed(1)} DFV)`);
      lines.push(`Cycles needed to reach safe threshold: ${ufSim.cyclesToSafeTarget}`);
    } else {
      lines.push(`Dialysis: ${s.sampleVolMl} mL sample vs ${s.bathVolMl} mL bath`);
      lines.push(`Final Concentration after ${s.bathChanges} bath changes: ${dialSim.finalConc < 0.01 ? dialSim.finalConc.toExponential(2) : dialSim.finalConc.toFixed(2)} ${s.unit}`);
      lines.push(`Changes needed to reach safe threshold: ${dialSim.changesToSafeTarget}`);
    }
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="🔄"
      title="Ultrafiltration & Dialysis Simulator"
      blurb="Model centrifugal spin concentrator diafiltration volumes (DFV), dialysis equilibrium clearance, and membrane MWCO protein retention rules."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Method Selection */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Buffer Exchange Technique
            </label>
            <div class="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              <button
                type="button"
                onClick={() => set({ mode: 'ultrafiltration' })}
                class={`flex-1 py-1.5 font-semibold rounded-md transition ${s.mode === 'ultrafiltration' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Spin Filter (Diafiltration)
              </button>
              <button
                type="button"
                onClick={() => set({ mode: 'dialysis' })}
                class={`flex-1 py-1.5 font-semibold rounded-md transition ${s.mode === 'dialysis' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Dialysis Cassette / Tubing
              </button>
            </div>
          </div>

          {/* Technique Parameters */}
          {s.mode === 'ultrafiltration' ? (
            <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Concentrator Hardware
              </label>
              <select
                value={s.filterId}
                onChange={(e) => handleSelectFilter((e.target as HTMLSelectElement).value)}
                class={FIELD}
              >
                {SPIN_FILTER_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Max {p.maxVolumeMl} mL)
                  </option>
                ))}
              </select>

              <div class="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Fill Volume per Spin (mL)</label>
                  <DecimalInput
                    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                    value={s.initialVolMl}
                    onChange={initialVolMl => set({ initialVolMl })}
                    min={0.1}
                    step={1}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Retentate Vol per Spin (mL)</label>
                  <DecimalInput
                    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                    value={s.concentrateVolMl}
                    onChange={concentrateVolMl => set({ concentrateVolMl })}
                    min={0.01}
                    step={0.1}
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Number of Cycles (Spins)</label>
                  <DecimalInput
                    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                    value={s.numCycles}
                    onChange={numCycles => set({ numCycles: Math.max(1, Math.round(numCycles)) })}
                    min={1}
                    max={20}
                    step={1}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Spin Time per Cycle (min)</label>
                  <DecimalInput
                    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                    value={s.spinTimeMin}
                    onChange={spinTimeMin => set({ spinTimeMin: Math.max(1, Math.round(spinTimeMin)) })}
                    min={1}
                    max={180}
                    step={5}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Dialysis Volumes &amp; Baths
              </label>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Sample Retentate Vol (mL)</label>
                  <DecimalInput
                    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                    value={s.sampleVolMl}
                    onChange={sampleVolMl => set({ sampleVolMl })}
                    min={0.1}
                    step={0.5}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Bath Buffer Volume (mL)</label>
                  <DecimalInput
                    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                    value={s.bathVolMl}
                    onChange={bathVolMl => set({ bathVolMl })}
                    min={10}
                    step={100}
                  />
                </div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                  Total Dialysis Baths (Buffers)
                </label>
                <span class="block text-[11px] text-slate-400 mb-1">
                  1 = Initial bath only (single equilibrium / 0 changes); 2 = Initial + 1 change; 3 = Initial + 2 changes
                </span>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono font-semibold"
                  value={s.bathChanges}
                  onChange={bathChanges => set({ bathChanges: Math.max(1, Math.round(bathChanges)) })}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>
            </div>
          )}

          {/* Solute to Clear / Exchange */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Solute to Exchange
              </label>
            </div>
            <select
              value={s.soluteId}
              onChange={(e) => handleSelectSolute((e.target as HTMLSelectElement).value)}
              class={FIELD}
            >
              {COMMON_SOLUTES.map(sol => (
                <option key={sol.id} value={sol.id}>
                  {sol.name} ({sol.initialConc} → {sol.bufferConc} {sol.unit})
                </option>
              ))}
              <option value="custom">Custom Solute</option>
            </select>

            <div class="grid grid-cols-3 gap-2 pt-1">
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Initial ({s.unit})</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.initialConc}
                  onChange={initialConc => set({ initialConc })}
                  min={0}
                  step={10}
                />
              </div>
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">In Buffer ({s.unit})</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.bufferConc}
                  onChange={bufferConc => set({ bufferConc })}
                  min={0}
                  step={5}
                />
              </div>
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Safe Target ({s.unit})</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.targetSafeConc}
                  onChange={targetSafeConc => set({ targetSafeConc })}
                  min={0}
                  step={1}
                />
              </div>
            </div>
          </div>

          {/* Membrane MWCO Safety */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Protein Retention &amp; MWCO
            </label>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-slate-500 mb-1">Protein MW (kDa)</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.proteinMwKDa}
                  onChange={proteinMwKDa => set({ proteinMwKDa })}
                  min={1}
                  step={5}
                />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Membrane MWCO (kDa)</label>
                <select
                  value={s.mwcoKDa}
                  onChange={(e) => set({ mwcoKDa: parseFloat((e.target as HTMLSelectElement).value) || 10 })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
                >
                  {[3, 5, 10, 30, 50, 100].map(k => (
                    <option key={k} value={k}>
                      {k} kDa MWCO
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Primary Result Banner */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Final Residual {soluteObj.name} Concentration
                </span>
                <div class="text-3xl font-black text-accent-600 dark:text-accent-400 font-mono mt-0.5">
                  {(() => {
                    const finalC = s.mode === 'ultrafiltration' ? ufSim.finalConc : dialSim.finalConc;
                    return finalC < 0.01 ? finalC.toExponential(2) : finalC.toFixed(2);
                  })()}{' '}
                  <span class="text-lg font-bold text-slate-500">{s.unit}</span>
                </div>
              </div>
              <div class="text-right">
                <span class="text-xs text-slate-400 block">Status vs Safe Threshold (&lt;{s.targetSafeConc} {s.unit})</span>
                {(() => {
                  const finalC = s.mode === 'ultrafiltration' ? ufSim.finalConc : dialSim.finalConc;
                  const isSafe = finalC <= s.targetSafeConc;
                  return (
                    <span class={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${isSafe ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                      {isSafe ? '✓ Below Safe Threshold' : '⚠️ Above Target Threshold'}
                    </span>
                  );
                })()}
              </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">{s.mode === 'ultrafiltration' ? 'Total Spin Duration' : 'Total Bath Volume'}</span>
                <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                  {s.mode === 'ultrafiltration' ? `${s.numCycles * s.spinTimeMin} min` : `${((s.bathVolMl * s.bathChanges) / 1000).toFixed(1)} L`}
                </span>
                <span class="text-[10px] text-slate-400 block">
                  {s.mode === 'ultrafiltration' ? `${s.numCycles} × ${s.spinTimeMin} min spins` : `${s.bathChanges} baths × ${(s.bathVolMl / 1000).toFixed(1)} L`}
                </span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Total Solute Cleared</span>
                <span class="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {(() => {
                    const finalC = s.mode === 'ultrafiltration' ? ufSim.finalConc : dialSim.finalConc;
                    const clearedPct = s.initialConc > s.bufferConc ? Math.min(100, Math.max(0, ((s.initialConc - finalC) / (s.initialConc - s.bufferConc)) * 100)) : 100;
                    return `${clearedPct.toFixed(2)}%`;
                  })()}
                </span>
                <span class="text-[10px] text-slate-400 block">
                  {s.mode === 'ultrafiltration' ? `${ufSim.totalDfv.toFixed(1)} DFV` : `${((s.bathVolMl / s.sampleVolMl) * s.bathChanges).toFixed(0)}× dilution`}
                </span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Target Clearance ({`<${s.targetSafeConc} ${s.unit}`})</span>
                <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                  {s.mode === 'ultrafiltration' ? `${ufSim.cyclesToSafeTarget} spins` : `${dialSim.changesToSafeTarget} bath${dialSim.changesToSafeTarget > 1 ? 's' : ''}`}
                </span>
                <span class="text-[10px] text-slate-400 block">
                  {s.mode === 'ultrafiltration' ? `Est. ${ufSim.cyclesToSafeTarget * s.spinTimeMin} min spin time` : `(${dialSim.changesToSafeTarget - 1} buffer change${dialSim.changesToSafeTarget - 1 === 1 ? '' : 's'})`}
                </span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Expected Protein Retention</span>
                <span class={`text-base font-bold font-mono ${mwcoEval.status === 'safe' ? 'text-emerald-600 dark:text-emerald-400' : mwcoEval.status === 'borderline' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  ~{mwcoEval.retentionPercent}%
                </span>
                <span class="text-[10px] text-slate-400 block">{mwcoEval.ratio.toFixed(1)}× MW/MWCO</span>
              </div>
            </div>
          </div>

          {/* Membrane Retention Rule Card */}
          <div class={`p-4 rounded-2xl border text-xs space-y-1.5 ${mwcoEval.status === 'safe' ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/20' : mwcoEval.status === 'borderline' ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20' : 'border-rose-200 bg-rose-50/30 dark:border-rose-900 dark:bg-rose-950/20'}`}>
            <div class="flex items-center justify-between">
              <strong class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Membrane MWCO Retention Evaluation ({mwcoEval.ratio.toFixed(1)}× MW/MWCO)</span>
              </strong>
              <span class={`px-2 py-0.5 rounded text-[10px] font-bold ${mwcoEval.status === 'safe' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : mwcoEval.status === 'borderline' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                {mwcoEval.status.toUpperCase()}
              </span>
            </div>
            <p class="text-slate-600 dark:text-slate-400 leading-relaxed">
              {mwcoEval.recommendation}
            </p>
          </div>

          {/* Trajectory Table */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
              Exchange Step-by-Step Trajectory
            </h3>

            {s.mode === 'ultrafiltration' ? (
              <table class="w-full text-xs text-left">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                    <th class="pb-2">Spin Cycle</th>
                    <th class="pb-2 text-right">After Spin ({s.unit})</th>
                    <th class="pb-2 text-right">After Refill ({s.unit})</th>
                    <th class="pb-2 text-right">Total DFV</th>
                    <th class="pb-2 text-right">Cumulative Removal</th>
                  </tr>
                </thead>
                <tbody>
                  {ufSim.cycles.map(c => (
                    <tr key={c.cycleNum} class="border-b border-slate-100 dark:border-slate-800">
                      <td class="py-2 font-semibold">Cycle {c.cycleNum} ({c.cycleNum * s.spinTimeMin} min total)</td>
                      <td class="py-2 text-right font-mono">{c.concAfterConcentration.toFixed(1)}</td>
                      <td class="py-2 text-right font-mono font-bold text-accent-600 dark:text-accent-400">{c.concAfterRefill < 0.01 ? c.concAfterRefill.toExponential(2) : c.concAfterRefill.toFixed(2)}</td>
                      <td class="py-2 text-right font-mono">{c.cumulativeDfv.toFixed(1)}</td>
                      <td class="py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{c.removalPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table class="w-full text-xs text-left">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                    <th class="pb-2">Dialysis Step</th>
                    <th class="pb-2 text-right">Equilibrium Conc ({s.unit})</th>
                    <th class="pb-2 text-right">Step Dilution</th>
                    <th class="pb-2 text-right">Cumulative Removal</th>
                  </tr>
                </thead>
                <tbody>
                  {dialSim.steps.map(st => (
                    <tr key={st.stepNum} class="border-b border-slate-100 dark:border-slate-800">
                      <td class="py-2 font-semibold">
                        {st.stepNum === 1 ? 'Bath 1 (Initial Setup / 0 changes)' : `Bath ${st.stepNum} (${st.stepNum - 1}${st.stepNum === 2 ? 'st' : st.stepNum === 3 ? 'nd' : 'th'} Buffer Change)`}
                      </td>
                      <td class="py-2 text-right font-mono font-bold text-accent-600 dark:text-accent-400">{st.equilibriumConc < 0.01 ? st.equilibriumConc.toExponential(2) : st.equilibriumConc.toFixed(2)}</td>
                      <td class="py-2 text-right font-mono">{st.dilutionFactor.toFixed(0)}×</td>
                      <td class="py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{st.removalPct.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      }
      actions={<ActionBar onCopy={copySummary} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
