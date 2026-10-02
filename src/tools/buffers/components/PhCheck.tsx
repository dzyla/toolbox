import type { BufferReport } from '@/core/buffers/mixture';
import { PKA_REFERENCE_TEMP_C } from '@/core/buffers/pka';

const ph = (v: number) => String(Number(v.toFixed(2)));

export function PhCheck({ report, workingTemp_C, ionicStrength, onAdjustAtWorking }: {
  report?: BufferReport; workingTemp_C: number; ionicStrength: number; onAdjustAtWorking?: () => void;
}) {
  if (!report) return null;
  const sameTemp = report.setTemp_C === workingTemp_C;
  const changed = !sameTemp || Math.abs(report.drift) >= 0.005;
  const warn = Math.abs(report.drift) > 0.1;
  // No published dpKa/dT for the governing step: the tabulated pKa is a 25 °C value used unchanged, so
  // the drift carries no temperature term. The gate is about the temperatures in play being away from
  // 25 °C — not about the set and working temperatures differing, which they do not in the default flow.
  const offReference = [...new Set([report.setTemp_C, workingTemp_C].filter(t => t !== PKA_REFERENCE_TEMP_C))];
  const noTempData = !report.temperatureCorrected && offReference.length > 0;
  return (
    <div
      data-testid="ph-check"
      role="status"
      class={`space-y-1 rounded-lg border px-3 py-2 text-xs ${warn || report.outOfRange || noTempData
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
      {noTempData && (
        <p>
          This buffer has no published temperature coefficient (dpKa/dT), so its {PKA_REFERENCE_TEMP_C} °C pKa is used
          unchanged at {offReference.map(t => `${t} °C`).join(' and ')}: the pH shown is
          <strong> not corrected for temperature</strong> — only for ionic strength. Most amine buffers move by
          0.01–0.03 pH per °C, so measure the pH at {workingTemp_C} °C rather than trusting this number.
        </p>
      )}
      {report.outOfRange && <p>pH {ph(report.pHSet)} is outside this buffer's useful range (more than 1.5 pH units from every pKa): it barely buffers.</p>}
    </div>
  );
}
