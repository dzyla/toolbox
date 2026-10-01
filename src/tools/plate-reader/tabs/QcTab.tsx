
import type { PlateReaderModel } from '../PlateReaderModel';

export function QcTab({ m }: { m: PlateReaderModel }) {
  const {
    assayQc,
    excludedWellIds,
    flashToast,
    groupStats,
    setExcludedWellIds,
  } = m;
  return (
    <div class="space-y-4">
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>🎯</span>
          <span>High-Throughput Screening Validation (Zhang et al. 1999)</span>
        </h3>

        <p class="text-xs text-slate-600 dark:text-slate-400">
          The Z'-factor measures assay quality and statistical separation between positive and negative controls. An assay with Z' ≥ 0.5 has an excellent screening window where a single replicate can reliably detect hits without false positives.
        </p>

        {/* Visual Z-prime gauge */}
        <div class="space-y-1.5 pt-2">
          <div class="flex items-center justify-between text-xs font-semibold">
            <span>Z' Screening Window Metric</span>
            <span class="font-mono text-sm">{assayQc.zPrime !== null ? assayQc.zPrime.toFixed(3) : 'N/A'}</span>
          </div>

          <div class="h-4 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            <div class="w-1/3 bg-rose-500/80" title="Unacceptable (< 0)" />
            <div class="w-1/6 bg-amber-500/80" title="Marginal (0 to 0.5)" />
            <div class="w-1/2 bg-emerald-500/80" title="Excellent (>= 0.5)" />
          </div>

          <div class="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            <span>&lt; 0.0 (Failed)</span>
            <span>0.0 (Marginal)</span>
            <span>0.5 (HTS Ready)</span>
            <span>1.0 (Ideal)</span>
          </div>
        </div>
      </div>

      {/* Grubbs Outlier Details Table */}
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
        <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Detected Outliers &amp; Well Anomaly Flags
        </h4>
        {groupStats.some(g => g.outlierWellIds.length > 0) ? (
          <div class="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {groupStats.filter(g => g.outlierWellIds.length > 0).map(g => (
              <div key={g.groupId} class="py-2 flex items-center justify-between">
                <div>
                  <span class="font-bold text-slate-800 dark:text-slate-200">{g.groupName}: </span>
                  <span class="font-mono text-rose-700 dark:text-rose-400 font-semibold">
                    {g.outlierWellIds.join(', ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(excludedWellIds);
                    g.outlierWellIds.forEach(id => next.add(id));
                    setExcludedWellIds(next);
                    flashToast(`Excluded outliers from ${g.groupName}`);
                  }}
                  class="px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 text-[11px] dark:bg-rose-950/50 dark:text-rose-300"
                >
                  Exclude Group Outliers
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p class="text-xs text-emerald-700 dark:text-emerald-400 font-medium py-2">
            ✓ No statistically significant outliers detected across any sample group.
          </p>
        )}
      </div>
    </div>
  );
}
