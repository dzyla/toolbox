import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import { useFittingModel } from './FittingModel';
import { InputsPanel } from './tabs/InputsPanel';
import { ResultsPanel } from './tabs/ResultsPanel';
import { InhibitionMode } from './modes/InhibitionMode';
import { ItcMode } from './modes/ItcMode';
import { SprMode } from './modes/SprMode';

export default function CurveFittingView() {
  const m = useFittingModel();
  const {
    copyText,
    fitResult,
    shareUrl,
  } = m;

  if (m.s.analysis === 'inhibition') return <InhibitionMode m={m} />;
  if (m.s.analysis === 'itc') return <ItcMode m={m} />;
  if (m.s.analysis === 'spr') return <SprMode m={m} />;

  return (
    <ToolLayout
      icon="📈"
      title="Curve Fitting & Regression"
      blurb="Fit 4PL/5PL, Hill, Michaelis-Menten, growth curves and more with error bars and residuals, or switch to global enzyme-inhibition, ITC and SPR/BLI kinetics analyses."
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
