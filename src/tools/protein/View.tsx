import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import { useProteinModel, ProteinCard } from './ProteinModel';
import { InputsPanel } from './tabs/InputsPanel';

export default function View() {
  const m = useProteinModel();
  const {
    copyText,
    current,
    result,
    shareUrl,
  } = m;

  return (
    <ToolLayout
      icon="🧬"
      title="Protein Workbench"
      blurb="Auditable protein parameters, profiles, sequence features, digestion, and mass matching."
      wide={true}
      inputs={
        <InputsPanel m={m} />
      }
      results={
        <div class="space-y-4">
          {result.errors.map(error => (
            <p role="alert" class="rounded-lg border border-red-300 p-3 text-red-700 dark:border-red-800 dark:text-red-300" key={error}>
              {error}
            </p>
          ))}
          {result.analyses.map(analysis => (
            <ProteinCard
              key={`${analysis.header}-${analysis.seq}`}
              analysis={analysis}
              state={current}
            />
          ))}
        </div>
      }
      actions={<ActionBar onCopy={copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
