import type { BufferReport } from '@/core/buffers/mixture';

const ph = (v: number) => String(Number(v.toFixed(2)));

export function PhCheck({ report, workingTemp_C, ionicStrength, onAdjustAtWorking }: {
  report?: BufferReport; workingTemp_C: number; ionicStrength: number; onAdjustAtWorking?: () => void;
}) {
  if (!report) return null;
  const sameTemp = report.setTemp_C === workingTemp_C;
  const changed = !sameTemp || Math.abs(report.drift) >= 0.005;
  const warn = Math.abs(report.drift) > 0.1;
  return (
    <div
      data-testid="ph-check"
      role="status"
      class={`space-y-1 rounded-lg border px-3 py-2 text-xs ${warn || report.outOfRange
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'}`}
    >
      <p>
        <strong class="mono">pH {ph(report.pHSet)} at {report.setTemp_C} °C</strong>
        {changed && <strong class="mono"> → pH {ph(report.pHWorking)} at {workingTemp_C} °C</strong>}
        <span class="mono"> · I = {Number(ionicStrength.toPrecision(2))} M</span>
      </p>
      {warn && (
        <p>
          The mixture will read {report.drift > 0 ? 'higher' : 'lower'} by {Math.abs(report.drift).toFixed(2)} pH at the working temperature.
          {onAdjustAtWorking && (
            <button type="button" onClick={onAdjustAtWorking} class="ml-2 rounded-md border border-amber-400 px-2 py-0.5 font-semibold hover:bg-amber-100 dark:border-amber-600 dark:hover:bg-amber-900/40">
              Adjust at {workingTemp_C} °C instead
            </button>
          )}
        </p>
      )}
      {report.outOfRange && <p>pH {ph(report.pHSet)} is outside this buffer's useful range (more than 1.5 pH units from every pKa): it barely buffers.</p>}
    </div>
  );
}
