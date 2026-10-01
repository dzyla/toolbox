import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import { useTagsModel } from './TagsModel';
import { InputsPanel } from './tabs/InputsPanel';
import { ResultsPanel } from './tabs/ResultsPanel';

export default function View() {
  const m = useTagsModel();
  const {
    copyResultText,
    shareUrl,
    simulation,
    toastMessage,
  } = m;

  return (
    <>
      <ToolLayout
      icon="✂️"
      title="Tag Library & Protease Cleavage Simulator"
      blurb="Design recombinant fusions, simulate protease cleavage, compute MW, pI, ε₂₈₀, and Abs 0.1%, evaluate subtractive affinity resin depletion (Waugh 2011), and inspect virtual SDS-PAGE band mobility (Weber & Osborn 1969)."
      mobileResultSummary={
        simulation.cleavageSite ? (
          <div class="flex items-center justify-between gap-2 text-xs">
            <div>
              <span class="text-[10px] text-slate-500 dark:text-slate-400 block">Target Protein</span>
              <strong class="font-mono text-accent-700 dark:text-accent-300">
                {simulation.targetFragment?.mwKda.toFixed(1)} kDa
              </strong>
            </div>
            <div class="text-center">
              <span class="text-[10px] text-slate-500 dark:text-slate-400 block">Cut Tag</span>
              <span class="font-mono text-slate-700 dark:text-slate-300">
                {simulation.tagFragment?.mwKda.toFixed(1)} kDa
              </span>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-500 dark:text-slate-400 block">Intact Fusion</span>
              <span class="font-mono text-slate-700 dark:text-slate-300">
                {simulation.intact.mwKda.toFixed(1)} kDa
              </span>
            </div>
          </div>
        ) : (
          <span class="text-amber-700 dark:text-amber-400 text-xs font-semibold">
            No cleavage site detected for {simulation.protease.shortName}
          </span>
        )
      }
      actions={<ActionBar onCopy={copyResultText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
      inputs={
        <InputsPanel m={m} />
      }
      results={
        <ResultsPanel m={m} />
      }
    />
    {toastMessage && (
      <div class="fixed bottom-4 right-4 z-50 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-lg flex items-center gap-2">
        <span>✓</span>
        <span>{toastMessage}</span>
      </div>
    )}
    </>
  );
}
