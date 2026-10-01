
import type { CultureModel } from '../CultureModel';

export function DoublingTab({ m }: { m: CultureModel }) {
  const {
    doublingResult,
    multiPointResult,
    s,
    selectedCellLine,
  } = m;
  return (
    s.doublingMode === 'interval' ? (
      'error' in doublingResult ? (
        <p role="alert" class="text-sm text-red-600 dark:text-red-400">{doublingResult.error}</p>
      ) : (
        <>
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Doubling Time (Td)</span>
              <span data-testid="doubling-time" class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                {doublingResult.doublingTimeHours.toFixed(1)} h
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block">{(doublingResult.doublingTimeHours / 24).toFixed(2)} days</span>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Growth Rate (µ)</span>
              <span class="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {doublingResult.growthRatePerHour.toFixed(3)}
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block">per hour</span>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Population Doublings</span>
              <span class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                {doublingResult.populationDoublings.toFixed(2)}
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block">generations</span>
            </div>
          </div>

          {selectedCellLine && (
            <div class="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20 text-xs space-y-1.5">
              <div class="flex items-center justify-between font-semibold text-indigo-900 dark:text-indigo-200">
                <span>{selectedCellLine.name} Literature Benchmark Comparison</span>
                <span>Literature Td: {selectedCellLine.doublingTimeHours} h</span>
              </div>
              <p class="text-slate-600 dark:text-slate-400">
                Observed doubling time is <strong class="text-slate-900 dark:text-slate-100">{doublingResult.doublingTimeHours.toFixed(1)} h</strong> (
                {((doublingResult.doublingTimeHours / selectedCellLine.doublingTimeHours) * 100).toFixed(0)}% of typical {selectedCellLine.name} rate).
                {Math.abs(doublingResult.doublingTimeHours - selectedCellLine.doublingTimeHours) <= 3
                  ? ' Consistent with standard healthy exponential growth.'
                  : doublingResult.doublingTimeHours > selectedCellLine.doublingTimeHours
                  ? ' Proliferation is slower than standard. Check confluence, serum batch, or viability.'
                  : ' Proliferation is faster than standard.'}
              </p>
            </div>
          )}
        </>
      )
    ) : (
      'error' in multiPointResult ? (
        <p role="alert" class="text-sm text-red-600 dark:text-red-400">{multiPointResult.error}</p>
      ) : (
        <>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs text-center">
              <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Fitted Td</span>
              <span data-testid="multipoint-td" class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                {multiPointResult.fit.doublingTimeHours.toFixed(1)} h
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block">{(multiPointResult.fit.doublingTimeHours / 24).toFixed(2)} days</span>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs text-center">
              <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Goodness of Fit</span>
              <span class="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {multiPointResult.fit.rSquared.toFixed(4)}
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block">R² coefficient</span>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs text-center">
              <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Growth Rate (µ)</span>
              <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                {multiPointResult.fit.growthRatePerHour.toFixed(4)}
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block">h⁻¹</span>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs text-center">
              <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Fitted N₀</span>
              <span class="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {Math.round(multiPointResult.fit.initialCountEstimate).toLocaleString()}
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block">estimated initial</span>
            </div>
          </div>

          {/* Target prediction card */}
          <div class="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
                Target Availability Forecast
              </span>
              <span class="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">
                Target: {s.obsTargetCount.toLocaleString()} cells
              </span>
            </div>
            <div class="grid grid-cols-2 gap-3 pt-1">
              <div class="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800">
                <span class="text-[11px] text-slate-500 dark:text-slate-400 block">Total time from t=0:</span>
                <span class="font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
                  {multiPointResult.targetPred.totalHoursFromZero.toFixed(1)} h
                </span>
                <span class="text-[10px] text-slate-500 dark:text-slate-400 block">({(multiPointResult.targetPred.totalHoursFromZero / 24).toFixed(1)} days)</span>
              </div>
              <div class="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800">
                <span class="text-[11px] text-slate-500 dark:text-slate-400 block">Remaining from last count:</span>
                <span class="font-mono text-xl font-bold text-emerald-700 dark:text-emerald-400">
                  {multiPointResult.targetPred.hoursFromLastObs.toFixed(1)} h
                </span>
                <span class="text-[10px] text-slate-500 dark:text-slate-400 block">({(multiPointResult.targetPred.hoursFromLastObs / 24).toFixed(1)} days)</span>
              </div>
            </div>
          </div>

          {/* Regression fit table */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
              Observation Residuals &amp; Exponential Fit
            </span>
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-left">
                    <th class="py-1 px-2">Point</th>
                    <th class="py-1 px-2">Elapsed Time</th>
                    <th class="py-1 px-2">Observed Cells</th>
                    <th class="py-1 px-2">Fitted Cells</th>
                    <th class="py-1 px-2">Deviation</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {multiPointResult.fit.predictions.map((p, idx) => (
                    <tr key={idx} class="text-slate-700 dark:text-slate-300">
                      <td class="py-1.5 px-2 text-slate-500 dark:text-slate-400">#{idx + 1}</td>
                      <td class="py-1.5 px-2">{p.timeHours} h</td>
                      <td class="py-1.5 px-2 font-bold">{p.observedCount.toLocaleString()}</td>
                      <td class="py-1.5 px-2 text-slate-500 dark:text-slate-400">{Math.round(p.fittedCount).toLocaleString()}</td>
                      <td class="py-1.5 px-2">
                        <span class={Math.abs(p.residual / p.observedCount) < 0.1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
                          {p.residual >= 0 ? '+' : ''}{Math.round(p.residual).toLocaleString()} ({((p.residual / p.observedCount) * 100).toFixed(1)}%)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )
    )
  );
}
