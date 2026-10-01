import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import { useFittingModel } from './FittingModel';
import { InputsPanel } from './tabs/InputsPanel';
import { ResultsPanel } from './tabs/ResultsPanel';

export default function CurveFittingView() {
  const m = useFittingModel();
  const {
    copyText,
    fitResult,
    shareUrl,
  } = m;

  return (
    <ToolLayout
      icon="📈"
      title="Curve Fitting & Regression"
      blurb="Fit non-linear 4PL (EC50/IC50), Michaelis-Menten, exponential decay, and linear regression models with error bars and residuals."
      wide={true}
      mobileResultSummary={
        fitResult && !('error' in fitResult) ? (
          <span><strong>{fitResult.modelName}</strong>: <strong class="font-mono text-accent-700 dark:text-accent-300">R² {fitResult.r2 !== undefined ? fitResult.r2.toFixed(4) : '—'}</strong> (RMSE {fitResult.rmse !== undefined ? fitResult.rmse.toFixed(3) : '—'})</span>
        ) : fitResult && 'error' in fitResult ? (
          <span class="text-rose-700 dark:text-rose-400 font-semibold">{fitResult.error}</span>
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
