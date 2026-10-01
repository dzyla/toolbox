
import type { PlateReaderModel } from '../PlateReaderModel';

export function CurveFittingTab({ m }: { m: PlateReaderModel }) {
  const {
    curveFittingTable,
    doseResponseSeries,
    flashToast,
    handleOpenInCurveFitting,
    s,
    set,
  } = m;
  return (
    <div class="space-y-3">
      <div class="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 dark:border-indigo-900/50 dark:bg-indigo-950/20 text-xs">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="font-bold text-indigo-900 dark:text-indigo-300 text-sm flex items-center gap-1.5">
              <span>📈</span>
              <span>Direct Pipeline to Non-Linear Curve Fitting</span>
            </h3>
            <p class="text-indigo-700 dark:text-indigo-400 mt-1">
              Formatted multi-replicate dose-response data parsed directly from your plate. Click "Open in Curve Fitting" to copy and immediately model with 4PL sigmoidal curves, EC50/IC50 estimation, and Hill slope fitting.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenInCurveFitting}
            class="shrink-0 px-4 py-2 rounded-xl bg-indigo-600 font-bold text-white shadow-sm hover:bg-indigo-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>🚀 Open in Curve Fitting</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Dose Response Summary Series if Available */}
      {doseResponseSeries.length > 0 && (
        <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
          <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Detected Dose-Response Series ({doseResponseSeries.length})
          </h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {doseResponseSeries.map(ser => (
              <div key={ser.seriesName} class="p-3 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-900 dark:text-slate-100">{ser.seriesName}</span>
                  <span class="font-mono text-slate-500 dark:text-slate-400">{ser.points.length} concentrations</span>
                </div>
                {ser.estimatedEc50 !== null && (
                  <div class="text-accent-600 dark:text-accent-400 font-mono font-semibold">
                    Est. Midpoint (EC50/IC50): ~{ser.estimatedEc50.toExponential(2)} {ser.unit || ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table Preview and Format Options */}
      <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-slate-700 dark:text-slate-300">Format:</span>
            <button
              type="button"
              onClick={() => set({ curveFittingFormat: 'multi-replicate' })}
              class={`px-2 py-1 rounded-md font-semibold ${s.curveFittingFormat === 'multi-replicate' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`}
            >
              Multi-Replicates (X, Y1, Y2...)
            </button>
            <button
              type="button"
              onClick={() => set({ curveFittingFormat: 'mean-sd' })}
              class={`px-2 py-1 rounded-md font-semibold ${s.curveFittingFormat === 'mean-sd' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`}
            >
              Mean ± SD (X, Y, SD)
            </button>
          </div>

          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(curveFittingTable);
              flashToast('Dose-response table copied to clipboard');
            }}
            class="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 font-semibold text-xs dark:border-slate-700 dark:hover:bg-slate-800"
          >
            📋 Copy Table
          </button>
        </div>

        <textarea
          readOnly
          rows={8}
          value={curveFittingTable}
          class="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
        />
      </div>
    </div>
  );
}
