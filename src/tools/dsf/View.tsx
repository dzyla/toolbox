import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import { useDsfModel } from './DsfModel';
import { InputsPanel } from './tabs/InputsPanel';
import { ResultsPanel } from './tabs/ResultsPanel';

export default function DsfView() {
  const m = useDsfModel();
  const {
    analysis,
    copyText,
    shareUrl,
  } = m;

  return (
    <ToolLayout
      icon="🔥"
      title="Thermal Shift Assay (DSF / nanoDSF)"
      blurb="Analyze protein thermal denaturation, determine melting temperatures (Tm) via Savitzky-Golay 1st derivative or two-state Boltzmann sigmoid fits, selectively render and process traces, and screen ligand stabilization (ΔTm)."
      wide={true}
      mobileResultSummary={
        analysis && !('error' in analysis) ? (
          <span>
            Ref Tm: <strong class="font-mono text-accent-700 dark:text-accent-300">{analysis.referenceTm.toFixed(1)}°C</strong> |{' '}
            Top Hit: <strong class="text-emerald-700 dark:text-emerald-400">
              {analysis.summary.topHit ? `+${analysis.summary.topHit.deltaTm.toFixed(1)}°C` : '—'}
            </strong>
          </span>
        ) : analysis && 'error' in analysis ? (
          <span class="text-rose-700 dark:text-rose-400 font-semibold">{analysis.error}</span>
        ) : null
      }
      inputs={
        <InputsPanel m={m} />
      }
      results={
        <ResultsPanel m={m} />
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
