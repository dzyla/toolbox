import { exportSummaryCsv } from '@/core/plates/reader';
import type { PlateReaderModel } from '../PlateReaderModel';

export function TableTab({ m }: { m: PlateReaderModel }) {
  const {
    flashToast,
    groupStats,
    s,
  } = m;
  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Replicate Summary ({groupStats.length} groups)
        </span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(exportSummaryCsv(groupStats));
            flashToast('Summary table CSV copied');
          }}
          class="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold dark:border-slate-700 dark:hover:bg-slate-800"
        >
          📋 Copy Summary CSV
        </button>
      </div>

      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
            <tr>
              <th class="p-2.5">Sample / Group</th>
              <th class="p-2.5">Type</th>
              <th class="p-2.5 text-center">N (Valid)</th>
              <th class="p-2.5 text-right">Mean ± SD</th>
              <th class="p-2.5 text-right">SEM</th>
              <th class="p-2.5 text-right">%CV</th>
              <th class="p-2.5 text-right">Median [Min - Max]</th>
              <th class="p-2.5 text-center">QC Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
            {groupStats.map(g => (
              <tr key={g.groupId} class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td class="p-2.5 font-medium flex items-center gap-2">
                  <span class="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  <span class="font-sans font-bold text-slate-800 dark:text-slate-200">{g.groupName}</span>
                </td>
                <td class="p-2.5">
                  <span class="font-sans text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {g.sampleType}
                  </span>
                </td>
                <td class="p-2.5 text-center">
                  {g.nValid} / {g.nTotal}
                </td>
                <td class="p-2.5 text-right font-bold">
                  {g.mean.toFixed(3)} ± {g.sd.toFixed(3)}
                </td>
                <td class="p-2.5 text-right text-slate-500 dark:text-slate-400">
                  {g.sem.toFixed(3)}
                </td>
                <td class="p-2.5 text-right">
                  <span class={`px-1.5 py-0.5 rounded-md font-bold ${g.cv <= s.cvThreshold ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                    {g.cv.toFixed(1)}%
                  </span>
                </td>
                <td class="p-2.5 text-right text-slate-500 dark:text-slate-400 text-[11px]">
                  {g.median.toFixed(2)} [{g.min.toFixed(2)} - {g.max.toFixed(2)}]
                </td>
                <td class="p-2.5 text-center font-sans">
                  <span class={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${g.qcFlags.status === 'pass' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : g.qcFlags.status === 'warning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                    {g.qcFlags.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
