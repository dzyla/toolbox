import { useMemo, useState } from 'preact/hooks';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { cohensD, minimumDetectableEffect, requiredSampleSize, twoSamplePower, type Alternative } from '@/core/study-design';
import { downloadText } from '@/lib/export';
import { SCIENCE } from './science';

type Objective = 'sample-size' | 'power' | 'effect';
type EffectInput = 'difference' | 'standardized';
const OBJECTIVES: Record<Objective, string> = {
  'sample-size': 'How many samples per group?',
  power: 'What power will my planned sample sizes provide?',
  effect: 'What minimum effect can my planned sample sizes detect?',
};
const LABELS = {
  difference: 'Anticipated difference', sd: 'Common standard deviation', d: "Cohen's d",
  alpha: 'Alpha', target: 'Target power', ratio: 'Allocation ratio (group 2 / group 1)',
  dropout: 'Dropout (%)', n1: 'Analysable samples in group 1', n2: 'Analysable samples in group 2',
};
type Field = keyof typeof LABELS;
const DEFAULTS: Record<Field, string> = {
  difference: '0.5', sd: '1', d: '0.5', alpha: '0.05', target: '0.8',
  ratio: '1', dropout: '0', n1: '64', n2: '64',
};
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const BUTTON = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700';

function solverFailureFields(objective: Objective, effectInput: EffectInput, allocationRatio: number | undefined, message: string, alsoFailsWithEqualAllocation: boolean): Field[] {
  const effectFields: Field[] = effectInput === 'standardized' ? ['d'] : ['difference', 'sd'];
  if (message.includes('target power could not be reached')) {
    // A non-equal allocation can constrain either group at the bounded-search limit.
    if (objective === 'sample-size' && allocationRatio !== 1) {
      return alsoFailsWithEqualAllocation ? [...effectFields, 'ratio'] : ['ratio'];
    }
    return effectFields;
  }
  if (message.includes('dropout-adjusted enrollment')) return ['dropout'];
  if (objective === 'effect') return ['n1', 'n2', 'alpha', 'target'];
  if (objective === 'power') return ['n1', 'n2', 'alpha', ...effectFields];
  return [...effectFields, 'alpha', 'target', 'ratio', 'dropout'];
}

export default function StudyDesign() {
  const [objective, setObjective] = useState<Objective>('sample-size');
  const [effectInput, setEffectInput] = useState<EffectInput>('difference');
  const [alternative, setAlternative] = useState<Alternative>('two-sided');
  // Keep raw text so clearing or partially editing a number cannot reuse a stale value.
  const [fields, setFields] = useState(DEFAULTS);
  const [message, setMessage] = useState('');
  const clearMessage = () => setMessage('');

  const calculation = useMemo(() => {
    const errors: Partial<Record<Field, string>> = {};
    const number = (field: Field, valid: (value: number) => boolean, requirement: string) => {
      const value = fields[field].trim() === '' ? NaN : Number(fields[field]);
      if (!Number.isFinite(value) || !valid(value)) errors[field] = `${LABELS[field]} ${requirement}.`;
      return value;
    };
    const alpha = number('alpha', n => n > 0 && n < 1, 'must be between 0 and 1');
    const targetPower = objective !== 'power'
      ? number('target', n => n > alpha && n < 1, 'must be greater than alpha and less than 1') : undefined;
    const difference = objective !== 'effect' && effectInput === 'difference'
      ? number('difference', n => n !== 0, 'must be a finite, nonzero number') : undefined;
    const sd = objective !== 'effect' && effectInput === 'difference'
      ? number('sd', n => n > 0, 'must be greater than zero') : undefined;
    const directD = objective !== 'effect' && effectInput === 'standardized'
      ? number('d', n => n > 0, 'must be greater than zero') : undefined;
    const ratio = objective === 'sample-size'
      ? number('ratio', n => n > 0, 'must be greater than zero') : undefined;
    const dropout = objective === 'sample-size'
      ? number('dropout', n => n >= 0 && n < 100, 'must be at least 0 and less than 100') : undefined;
    const groupSize = (field: 'n1' | 'n2') => number(field,
      n => Number.isInteger(n) && n >= 2 && n <= 1_000_000, 'must be an integer from 2 to 1,000,000');
    const n1 = objective !== 'sample-size' ? groupSize('n1') : undefined;
    const n2 = objective !== 'sample-size' ? groupSize('n2') : undefined;
    if (Object.keys(errors).length) return { errors };

    let effectSize = NaN;
    try {
      effectSize = objective === 'effect'
        ? minimumDetectableEffect({ n1: n1!, n2: n2!, alpha, alternative, targetPower: targetPower! })
        : effectInput === 'difference' ? cohensD(difference!, sd!) : directD!;
      const design = objective === 'sample-size'
        ? requiredSampleSize({ effectSize, alpha, alternative, targetPower: targetPower!, allocationRatio: ratio!, dropoutFraction: dropout! / 100 })
        : undefined;
      const analysisN1 = design?.n1 ?? n1!;
      const analysisN2 = design?.n2 ?? n2!;
      const realizedAllocationRatio = analysisN2 / analysisN1;
      const realizedAllocationText = Number(realizedAllocationRatio.toPrecision(6)).toString();
      const power = design?.achievedPower ?? twoSamplePower({ n1: analysisN1, n2: analysisN2, effectSize, alpha, alternative }).power;
      const headline = objective === 'sample-size'
        ? analysisN1 === analysisN2 ? `${analysisN1} analysable samples per group`
          : `${analysisN1} analysable samples in group 1; ${analysisN2} in group 2`
        : objective === 'power' ? `${(power * 100).toFixed(2)}% achieved power`
          : `Minimum detectable Cohen's d: ${effectSize.toFixed(4)}`;
      const enrollment = design ? `Enroll ${design.enrollN1} in group 1 and ${design.enrollN2} in group 2` : undefined;
      const settings = [
        `Objective: ${OBJECTIVES[objective]}`,
        ...(objective !== 'effect' ? [`Effect size input: ${effectInput === 'difference' ? 'Difference / common SD' : "Cohen's d"}`] : []),
        ...(difference !== undefined ? [`Anticipated difference: ${difference}`, `Common standard deviation: ${sd}`] : []),
        `Cohen's d: ${effectSize}`, `Alpha: ${alpha}`,
        ...(targetPower !== undefined ? [`Target power: ${targetPower}`] : []),
        `Sidedness: ${alternative}`,
        ...(ratio !== undefined ? [`Requested allocation ratio (group 2 / group 1): ${ratio}`] : []),
        `Realized allocation ratio (group 2 / group 1): ${analysisN2} / ${analysisN1} = ${realizedAllocationText}`,
        ...(dropout !== undefined ? [`Dropout (%): ${dropout}`] : ['Dropout: not applied; group sizes are analysable samples']),
        `Analysable samples in group 1: ${analysisN1}`, `Analysable samples in group 2: ${analysisN2}`,
        `Degrees of freedom: ${analysisN1 + analysisN2 - 2}`, `Achieved power: ${power}`,
      ];
      const summary = ['Two independent groups — Planning estimate', 'Planner version: 1 (2026-09-11)',
        ...settings, headline, ...(enrollment ? [enrollment] : []), '', scienceText(SCIENCE)].join('\n');
      return { errors, result: { headline, enrollment, effectSize, power, n1: analysisN1, n2: analysisN2, requestedAllocationRatio: ratio, realizedAllocationText, summary } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unable to calculate this design';
      let alsoFailsWithEqualAllocation = false;
      if (objective === 'sample-size' && Number.isFinite(effectSize) && ratio !== 1 && message.includes('target power could not be reached')) {
        try {
          requiredSampleSize({ effectSize, alpha, alternative, targetPower: targetPower!, allocationRatio: 1, dropoutFraction: dropout! / 100 });
        } catch (equalAllocationError) {
          alsoFailsWithEqualAllocation = equalAllocationError instanceof Error
            && equalAllocationError.message.includes('target power could not be reached');
        }
      }
      const fieldsToCorrect = solverFailureFields(objective, effectInput, ratio, message, alsoFailsWithEqualAllocation);
      const correction = `Calculation blocked: adjust ${fieldsToCorrect.map(field => LABELS[field]).join(' or ')}. ${message}.`;
      for (const field of fieldsToCorrect) errors[field] = correction;
      return { errors, error: correction };
    }
  }, [fields, objective, effectInput, alternative]);
  const result = calculation.result;

  function field(name: Field) {
    const error = calculation.errors[name];
    return <div class="space-y-1">
      <label for={`study-${name}`} class="block text-sm font-medium">{LABELS[name]}</label>
      <input id={`study-${name}`} class={FIELD} type="text" inputMode="decimal" value={fields[name]}
        aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `study-${name}-error` : undefined}
        onInput={event => { setFields({ ...fields, [name]: event.currentTarget.value }); clearMessage(); }} />
      {error && <p id={`study-${name}-error`} class="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    </div>;
  }

  async function copySummary() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.summary);
      setMessage('Design summary copied');
    } catch { setMessage('Copy failed. Use Export design summary to save the text.'); }
  }

  return <ToolLayout icon="📐" title="Experimental Design & Power Planner"
    blurb="Plan a comparison of two independent group means using a pooled-variance t test. All calculations stay in your browser."
    mobileDefaultTab="stacked"
    inputs={<div class="space-y-4">
      <div class="space-y-1">
        <label for="study-objective" class="block text-sm font-medium">Objective</label>
        <select id="study-objective" class={FIELD} value={objective}
          onChange={event => { setObjective(event.currentTarget.value as Objective); clearMessage(); }}>
          {Object.entries(OBJECTIVES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {objective !== 'sample-size' && <>
        {field('n1')}{field('n2')}
        <p class="text-xs text-slate-600 dark:text-slate-300">Enter independent samples available for analysis after dropout, not technical replicates.</p>
      </>}
      {objective !== 'effect' && <>
        <div class="space-y-1">
          <label for="study-effect-input" class="block text-sm font-medium">Effect size input</label>
          <select id="study-effect-input" class={FIELD} value={effectInput}
            onChange={event => { setEffectInput(event.currentTarget.value as EffectInput); clearMessage(); }}>
            <option value="difference">Difference / common SD</option>
            <option value="standardized">Cohen's d</option>
          </select>
        </div>
        {effectInput === 'difference' ? <>{field('difference')}{field('sd')}
          <p class="text-xs text-slate-600 dark:text-slate-300">Use the same outcome units for the difference and common SD. The magnitude defines the effect size.</p>
        </> : field('d')}
        <p class="text-xs text-slate-600 dark:text-slate-300">Choose a meaningful anticipated effect before data collection. The default d = 0.5 is illustrative.</p>
      </>}
      <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <summary class="cursor-pointer text-sm font-semibold">Advanced design settings</summary>
        <div class="mt-3 space-y-4">
          {field('alpha')}
          {objective !== 'power' && field('target')}
          <p class="text-xs text-slate-600 dark:text-slate-300">Alpha and power are probabilities: 0.05 means 5%; 0.8 means 80%.</p>
          <div class="space-y-1">
            <label for="study-sidedness" class="block text-sm font-medium">Sidedness</label>
            <select id="study-sidedness" class={FIELD} value={alternative}
              onChange={event => { setAlternative(event.currentTarget.value as Alternative); clearMessage(); }}>
              <option value="two-sided">Two-sided</option><option value="one-sided">One-sided</option>
            </select>
          </div>
          {objective === 'sample-size' && <>{field('ratio')}{field('dropout')}</>}
        </div>
      </details>
    </div>}
    results={<div class="space-y-4" aria-live="polite">
      <span class="inline-block rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Planning estimate</span>
      <p class="text-sm text-slate-600 dark:text-slate-300">This supports study planning; it does not establish experimental validity.</p>
      {alternative === 'one-sided' && <p class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">For a one-sided test, prespecify the direction before collecting data; use the anticipated effect magnitude in that direction.</p>}
      {result ? <>
        <h2 class="text-2xl font-semibold tracking-tight">{result.headline}</h2>
        {result.enrollment && <p class="text-lg font-medium">{result.enrollment}</p>}
        <dl class="grid grid-cols-2 gap-4 border-y border-slate-200 py-4 text-sm dark:border-slate-700">
          <div><dt>Group 1 analysable samples</dt><dd class="font-mono font-semibold">{result.n1}</dd></div>
          <div><dt>Group 2 analysable samples</dt><dd class="font-mono font-semibold">{result.n2}</dd></div>
          {result.requestedAllocationRatio !== undefined && <div><dt>Requested allocation ratio</dt><dd class="font-mono font-semibold">{result.requestedAllocationRatio}</dd></div>}
          <div><dt>Realized allocation ratio</dt><dd class="font-mono font-semibold">{result.n2} / {result.n1} = {result.realizedAllocationText}</dd></div>
          <div><dt>Cohen's d magnitude</dt><dd class="font-mono font-semibold">{result.effectSize.toPrecision(5)}</dd></div>
          <div><dt>Calculated power</dt><dd class="font-mono font-semibold">{(result.power * 100).toFixed(2)}%</dd></div>
        </dl>
        <p class="text-sm text-slate-600 dark:text-slate-300">Under the stated effect, variance, independence, and testing assumptions, this is the probability of rejecting the null hypothesis. Enrollment inflation accounts for the planned dropout fraction; it does not change analytical power.</p>
      </> : <div role="alert" class="rounded-lg border border-rose-300 p-3 text-sm text-rose-800 dark:border-rose-800 dark:text-rose-200">
        <p class="font-semibold">Result blocked</p>
        {calculation.error ?? Object.values(calculation.errors).join(' ')}
      </div>}
    </div>}
    actions={<div class="flex flex-wrap items-center gap-2">
      <button type="button" class={BUTTON} disabled={!result} onClick={() => void copySummary()}>Copy design summary</button>
      <button type="button" class={BUTTON} disabled={!result}
        onClick={() => { if (result) downloadText(result.summary, 'study-design-summary.txt'); }}>Export design summary</button>
      <span role="status" class="w-full text-sm text-slate-600 dark:text-slate-300">{message}</span>
    </div>}
    science={<SciencePanel science={SCIENCE} />}
  />;
}
