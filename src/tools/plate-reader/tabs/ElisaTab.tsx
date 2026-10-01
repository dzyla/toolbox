import { exportQuantifiedSamplesCsv } from '@/core/plates/reader';
import type { PlateReaderModel } from '../PlateReaderModel';

export function ElisaTab({ m }: { m: PlateReaderModel }) {
  const {
    flashToast,
    loadPreset,
    s,
    set,
    standardCurve,
  } = m;
  return (
    <div class="space-y-4">
      {standardCurve && standardCurve.hasStandards ? (
        <>
          {/* Standard Curve Fit Overview Banner */}
          <div class="rounded-xl border border-purple-200 bg-purple-50/50 p-4 shadow-xs dark:border-purple-900/50 dark:bg-purple-950/20 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xl">🧬</span>
                <h3 class="font-bold text-sm text-purple-950 dark:text-purple-200">
                  ELISA Standard Calibration Curve ({standardCurve.fitType.toUpperCase()})
                </h3>
              </div>
              <p class="text-xs text-purple-800 dark:text-purple-300 mt-1 font-mono">
                Equation: <strong>{standardCurve.equation}</strong>
              </p>
            </div>

            <div class="flex items-center gap-3">
              <div class="rounded-lg bg-white px-3 py-1.5 text-center shadow-xs border border-purple-200 dark:bg-slate-900 dark:border-purple-800">
                <span class="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">R² Fit Quality</span>
                <span class={`font-mono text-base font-extrabold ${standardCurve.rSquared >= 0.99 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {standardCurve.rSquared.toFixed(4)}
                </span>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const csv = exportQuantifiedSamplesCsv(standardCurve);
                  await navigator.clipboard.writeText(csv);
                  flashToast('Quantified ELISA samples CSV copied');
                }}
                class="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5"
              >
                <span>📋</span>
                <span>Copy ELISA CSV</span>
              </button>
            </div>
          </div>

          {/* Standards Curve Calibration Table */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Standard Curve Calibrators ({standardCurve.points.length} Levels)
            </h4>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
                  <tr>
                    <th class="p-2">Standard Level</th>
                    <th class="p-2 text-right">Nominal Conc</th>
                    <th class="p-2 text-center">N (Replicates)</th>
                    <th class="p-2 text-right">Mean Raw OD</th>
                    <th class="p-2 text-right">Blank-Subtracted OD</th>
                    <th class="p-2 text-right">%CV</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {standardCurve.points.map((pt, idx) => (
                    <tr key={idx} class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td class="p-2 font-sans font-bold text-slate-800 dark:text-slate-200">
                        Standard {idx + 1}
                      </td>
                      <td class="p-2 text-right font-bold text-purple-700 dark:text-purple-300">
                        {pt.concentration} {standardCurve.unit}
                      </td>
                      <td class="p-2 text-center text-slate-500 dark:text-slate-400">
                        {pt.rawValues.length}
                      </td>
                      <td class="p-2 text-right">
                        {pt.meanSignal.toFixed(3)} ± {pt.sdSignal.toFixed(3)}
                      </td>
                      <td class="p-2 text-right font-bold">
                        {pt.meanSignal.toFixed(3)}
                      </td>
                      <td class="p-2 text-right">
                        <span class={`px-1.5 py-0.5 rounded-md font-bold ${pt.cvSignal <= s.cvThreshold ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                          {pt.cvSignal.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quantified Unknown Samples Table */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Unknown Samples Quantified ({standardCurve.quantifiedSamples.length} Groups)
              </h4>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                Final Conc = Calculated Nominal × Dilution Factor
              </span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
                  <tr>
                    <th class="p-2">Sample ID</th>
                    <th class="p-2 text-center">N</th>
                    <th class="p-2 text-right">Raw OD</th>
                    <th class="p-2 text-right">Calculated Conc</th>
                    <th class="p-2 text-center">Dilution Factor</th>
                    <th class="p-2 text-right font-extrabold text-emerald-700 dark:text-emerald-300 text-sm">Final Adjusted Conc</th>
                    <th class="p-2 text-right">%CV</th>
                    <th class="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {standardCurve.quantifiedSamples.map(smp => (
                    <tr key={smp.groupId} class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td class="p-2 font-sans font-bold text-slate-800 dark:text-slate-200">
                        {smp.sampleName}
                      </td>
                      <td class="p-2 text-center text-slate-500 dark:text-slate-400">
                        {smp.n}
                      </td>
                      <td class="p-2 text-right">
                        {smp.meanSignal.toFixed(3)} ± {smp.sdSignal.toFixed(3)}
                      </td>
                      <td class="p-2 text-right">
                        {smp.calculatedConc !== null ? smp.calculatedConc.toFixed(2) : 'N/A'} {smp.unit}
                      </td>
                      <td class="p-2 text-center font-bold">
                        {smp.dilutionFactor}×
                      </td>
                      <td class="p-2 text-right font-extrabold text-emerald-700 dark:text-emerald-300 text-sm">
                        {smp.finalConc !== null ? smp.finalConc.toFixed(2) : 'N/A'} {smp.unit}
                      </td>
                      <td class="p-2 text-right">
                        <span class={`px-1.5 py-0.5 rounded-md font-bold ${(smp.concCv ?? smp.cvSignal) <= s.cvThreshold ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                          {(smp.concCv ?? smp.cvSignal).toFixed(1)}%
                        </span>
                      </td>
                      <td class="p-2 text-center font-sans">
                        <span class={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${smp.status === 'in-range' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                          {smp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40 space-y-3">
          <div class="text-3xl">🧬</div>
          <h3 class="font-bold text-slate-700 dark:text-slate-200">
            No ELISA Standards Detected
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            To compute an ELISA standard calibration curve, wells must be assigned role <strong>Standard</strong> with known nominal concentrations (e.g., 0 to 1000 pg/mL).
          </p>
          <div class="flex justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => loadPreset('elisa_96')}
              class="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold transition"
            >
              Load ELISA 96 Demo Preset
            </button>
            <button
              type="button"
              onClick={() => set({ activeTab: 'layout' })}
              class="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white text-slate-700 text-xs font-medium dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Go to Layout Painter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
