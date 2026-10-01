import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import { useCultureModel } from './CultureModel';
import { PassagingTab } from './tabs/PassagingTab';
import { DoublingTab } from './tabs/DoublingTab';
import { HarvestTab } from './tabs/HarvestTab';
import { InputsPanel } from './tabs/InputsPanel';

export default function CultureView() {
  const m = useCultureModel();
  const {
    copyText,
    doublingResult,
    harvestResult,
    multiPointResult,
    s,
    seedingResult,
    shareUrl,
  } = m;

  return (
    <ToolLayout
      icon="🧫"
      title="Cell Culture & Passaging"
      blurb="Calculate seeding densities, vessel scaling, doubling time, and harvest availability forecasting."
      mobileResultSummary={
        s.activeTab === 'passaging' ? (
          'error' in seedingResult ? (
            <span class="text-rose-700 dark:text-rose-400 font-semibold">{seedingResult.error}</span>
          ) : (
            <span>Seed <strong class="text-accent-700 dark:text-accent-300 font-mono">{(seedingResult.volumePerVesselMl * 1000).toFixed(1)} µL</strong> ({seedingResult.cellsPerVessel.toLocaleString()} cells)</span>
          )
        ) : s.activeTab === 'doubling' ? (
          s.doublingMode === 'multipoint' ? (
            'error' in multiPointResult ? (
              <span class="text-rose-700 dark:text-rose-400 font-semibold">{multiPointResult.error}</span>
            ) : (
              <span>Td: <strong class="text-accent-700 dark:text-accent-300 font-mono">{multiPointResult.fit.doublingTimeHours.toFixed(1)} h</strong> (R²={multiPointResult.fit.rSquared.toFixed(3)})</span>
            )
          ) : (
            'error' in doublingResult ? (
              <span class="text-rose-700 dark:text-rose-400 font-semibold">{doublingResult.error}</span>
            ) : (
              <span>Doubling time: <strong class="text-accent-700 dark:text-accent-300 font-mono">{doublingResult.doublingTimeHours.toFixed(1)} h</strong></span>
            )
          )
        ) : (
          'error' in harvestResult ? (
            <span class="text-rose-700 dark:text-rose-400 font-semibold">{harvestResult.error}</span>
          ) : (
            <span>Available: <strong class="text-accent-700 dark:text-accent-300 font-mono">{harvestResult.targetDateFormatted}</strong> ({harvestResult.hoursRequired.toFixed(1)} h)</span>
          )
        )
      }
      inputs={
        <InputsPanel m={m} />
      }
      results={
        <div class="space-y-4">
          {/* RESULTS FOR TAB 1: PASSAGING */}
          {s.activeTab === 'passaging' && <PassagingTab m={m} />}

          {/* RESULTS FOR TAB 2: DOUBLING TIME */}
          {s.activeTab === 'doubling' && <DoublingTab m={m} />}

          {/* RESULTS FOR TAB 3: HARVEST PREDICTOR */}
          {s.activeTab === 'harvest' && <HarvestTab m={m} />}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
