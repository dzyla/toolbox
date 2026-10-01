import { exportNormalizedMatrixCsv } from '@/core/plates/reader';
import type { PlateReaderModel } from '../PlateReaderModel';

export function CsvTab({ m }: { m: PlateReaderModel }) {
  const {
    flashToast,
    normalizedWells,
    parsedPlate,
  } = m;
  return (
    <div class="space-y-4">
      {/* Normalized Plate Matrix */}
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-slate-700 dark:text-slate-300">
            Normalized 2D Plate Matrix CSV ({parsedPlate.format}-Well)
          </span>
          <button
            type="button"
            onClick={async () => {
              const csv = exportNormalizedMatrixCsv({ ...parsedPlate, wells: normalizedWells }, 'normalized');
              await navigator.clipboard.writeText(csv);
              flashToast('Normalized matrix CSV copied');
            }}
            class="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 font-semibold text-xs dark:border-slate-700 dark:hover:bg-slate-800"
          >
            📋 Copy Matrix CSV
          </button>
        </div>

        <textarea
          readOnly
          rows={8}
          value={exportNormalizedMatrixCsv({ ...parsedPlate, wells: normalizedWells }, 'normalized')}
          class="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
        />
      </div>

      {/* Raw Plate Matrix */}
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-slate-700 dark:text-slate-300">
            Raw 2D Plate Matrix CSV ({parsedPlate.format}-Well)
          </span>
          <button
            type="button"
            onClick={async () => {
              const csv = exportNormalizedMatrixCsv({ ...parsedPlate, wells: normalizedWells }, 'raw');
              await navigator.clipboard.writeText(csv);
              flashToast('Raw matrix CSV copied');
            }}
            class="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 font-semibold text-xs dark:border-slate-700 dark:hover:bg-slate-800"
          >
            📋 Copy Raw Matrix
          </button>
        </div>

        <textarea
          readOnly
          rows={8}
          value={exportNormalizedMatrixCsv({ ...parsedPlate, wells: normalizedWells }, 'raw')}
          class="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
        />
      </div>
    </div>
  );
}
