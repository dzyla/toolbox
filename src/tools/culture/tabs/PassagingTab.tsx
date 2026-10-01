
import type { CultureModel } from '../CultureModel';

export function PassagingTab({ m }: { m: CultureModel }) {
  const {
    s,
    seedingResult,
    selectedVessel,
  } = m;
  return (
    'error' in seedingResult ? (
      <p role="alert" class="text-sm text-red-600 dark:text-red-400">{seedingResult.error}</p>
    ) : (
      <>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Suspension per Vessel</span>
            <span data-testid="suspension-vol" class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
              {seedingResult.volumePerVesselMl >= 1
                ? `${seedingResult.volumePerVesselMl.toFixed(2)} mL`
                : `${(seedingResult.volumePerVesselMl * 1000).toFixed(0)} µL`}
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 block">cell suspension</span>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Media Top-Up</span>
            <span class="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {Math.max(0, selectedVessel.typicalVolumeMl - seedingResult.volumePerVesselMl).toFixed(2)} mL
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 block">fresh media per vessel</span>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Cells per Vessel</span>
            <span class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
              {seedingResult.cellsPerVessel.toLocaleString()}
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 block">total seeded</span>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2 text-xs shadow-xs">
          <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">Passaging Protocol Recipe</h4>
          <div class="space-y-1.5 text-slate-600 dark:text-slate-400">
            <p>1. Prepare <strong>{s.vesselCount} × {selectedVessel.name}</strong> ({selectedVessel.areaCm2} cm² growth area each).</p>
            <p>2. Pipette <strong>{seedingResult.volumePerVesselMl >= 1 ? `${seedingResult.volumePerVesselMl.toFixed(2)} mL` : `${(seedingResult.volumePerVesselMl * 1000).toFixed(0)} µL`}</strong> of cell suspension into each vessel.</p>
            <p>3. Add <strong>{Math.max(0, selectedVessel.typicalVolumeMl - seedingResult.volumePerVesselMl).toFixed(2)} mL</strong> fresh media to bring total working volume to <strong>{selectedVessel.typicalVolumeMl} mL</strong>.</p>
            <p>4. Total stock suspension required across all vessels: <strong>{seedingResult.totalVolumeNeededMl.toFixed(2)} mL</strong>.</p>
          </div>
        </div>
      </>
    )
  );
}
