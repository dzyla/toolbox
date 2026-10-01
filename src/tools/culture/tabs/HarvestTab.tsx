
import type { CultureModel } from '../CultureModel';

export function HarvestTab({ m }: { m: CultureModel }) {
  const {
    harvestResult,
    s,
  } = m;
  return (
    'error' in harvestResult ? (
      <p role="alert" class="text-sm text-red-600 dark:text-red-400">{harvestResult.error}</p>
    ) : (
      <>
        <div class="rounded-2xl border-2 border-accent-500/40 bg-accent-50/40 dark:bg-accent-950/20 p-5 space-y-3 shadow-xs">
          <span class="text-xs font-bold uppercase tracking-wider text-accent-800 dark:text-accent-300 block">
            Estimated Cells Ready Time
          </span>
          <div class="flex flex-wrap items-baseline gap-3">
            <span data-testid="target-ready-datetime" class="font-mono text-3xl font-extrabold text-slate-900 dark:text-white">
              {harvestResult.targetDateFormatted}
            </span>
            <span class="text-sm font-semibold text-accent-700 dark:text-accent-300">
              in {harvestResult.daysAndHoursText}
            </span>
          </div>
          <div class="text-xs text-slate-600 dark:text-slate-400 pt-1">
            Based on <strong>{harvestResult.doublingsRequired.toFixed(2)} doublings</strong> from {s.harvestStartCount.toLocaleString()} to {s.harvestTargetCount.toLocaleString()} cells (Td = {s.harvestDoublingHours} h).
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
            <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Required Doublings</span>
            <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
              {harvestResult.doublingsRequired.toFixed(2)}
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 block">generations</span>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
            <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Total Incubation</span>
            <span class="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {harvestResult.hoursRequired.toFixed(1)} h
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 block">{(harvestResult.hoursRequired / 24).toFixed(2)} days</span>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
            <span class="text-xs text-slate-500 dark:text-slate-400 block font-semibold uppercase tracking-wider">Fold Expansion</span>
            <span class="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {(s.harvestTargetCount / s.harvestStartCount).toFixed(1)}×
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 block">biomass increase</span>
          </div>
        </div>

        {/* Biological Tolerance Window */}
        <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Biological Variation Tolerance Window (±10% Td)
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400">Earliest to Latest Window</span>
          </div>
          <div class="grid grid-cols-2 gap-3 text-xs pt-1">
            <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40">
              <span class="text-[11px] text-emerald-700 dark:text-emerald-400 block font-semibold">Earliest Availability (−10% Td):</span>
              <span class="font-mono text-sm font-bold text-emerald-950 dark:text-emerald-200">
                {harvestResult.windowEarlyFormatted}
              </span>
              <span class="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block mt-0.5">
                after {harvestResult.windowEarlyHours.toFixed(1)} h
              </span>
            </div>

            <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
              <span class="text-[11px] text-amber-700 dark:text-amber-400 block font-semibold">Latest Availability (+10% Td):</span>
              <span class="font-mono text-sm font-bold text-amber-950 dark:text-amber-200">
                {harvestResult.windowLateFormatted}
              </span>
              <span class="text-[10px] text-amber-600/80 dark:text-amber-400/80 block mt-0.5">
                after {harvestResult.windowLateHours.toFixed(1)} h
              </span>
            </div>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            Accounts for lag-phase variations, passaging stress, and standard biological cell cycle fluctuation.
          </p>
        </div>
      </>
    )
  );
}
