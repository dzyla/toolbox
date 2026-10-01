import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import {
  anovaMinimumDetectableEffect, anovaPower, cohensDz, cohensF, pairedMinimumDetectableEffect, pairedPower,
  requiredAnovaSampleSize, requiredPairedSampleSize, type PairedAlternative,
} from '@/core/study-design/designs';
import { downloadText } from '@/lib/export';
import { ANOVA_SCIENCE, PAIRED_SCIENCE } from './science';

export type OtherDesign = 'paired' | 'anova';
type Objective = 'sample-size' | 'power' | 'effect';
type EffectInput = 'raw' | 'standardized';

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const BUTTON = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700';
const MUTED = 'text-xs text-slate-600 dark:text-slate-300';

const TEXT = {
  paired: {
    title: 'Paired design — Planning estimate',
    unit: 'pairs',
    objectives: {
      'sample-size': 'How many pairs do I need?',
      power: 'What power will my planned number of pairs provide?',
      effect: 'What minimum effect can my planned number of pairs detect?',
    } satisfies Record<Objective, string>,
    effectNames: { raw: 'Mean difference / SD of differences', standardized: "Cohen's d_z" },
  },
  anova: {
    title: 'One-way ANOVA — Planning estimate',
    unit: 'samples per group',
    objectives: {
      'sample-size': 'How many samples per group?',
      power: 'What power will my planned group sizes provide?',
      effect: 'What minimum effect can my planned group sizes detect?',
    } satisfies Record<Objective, string>,
    effectNames: { raw: 'Group means / common SD', standardized: "Cohen's f" },
  },
};

const LABELS = {
  alpha: 'Alpha', target: 'Target power', dropout: 'Dropout (%)',
  pairs: 'Analysable pairs', perGroup: 'Analysable samples per group', groups: 'Number of groups',
  meanDiff: 'Anticipated mean difference', sdDiff: 'SD of the paired differences', dz: "Cohen's d_z",
  means: 'Anticipated group means (comma separated)', sd: 'Common standard deviation within groups', f: "Cohen's f",
};
type Field = keyof typeof LABELS;
const DEFAULTS: Record<Field, string> = {
  alpha: '0.05', target: '0.8', dropout: '0', pairs: '34', perGroup: '45', groups: '4',
  meanDiff: '0.5', sdDiff: '1', dz: '0.5', means: '0, 0.5, 1', sd: '1', f: '0.25',
};

const pct = (p: number) => `${(p * 100).toFixed(2)}%`;

export function OtherDesignPlanner({ design, designSelector }: { design: OtherDesign; designSelector: ComponentChildren }) {
  const [objective, setObjective] = useState<Objective>('sample-size');
  const [effectInput, setEffectInput] = useState<EffectInput>(design === 'paired' ? 'raw' : 'standardized');
  const [alternative, setAlternative] = useState<PairedAlternative>('two-sided');
  const [fields, setFields] = useState(DEFAULTS);
  const [message, setMessage] = useState('');
  const text = TEXT[design];
  const science = design === 'paired' ? PAIRED_SCIENCE : ANOVA_SCIENCE;

  const calculation = useMemo(() => {
    const errors: Partial<Record<Field, string>> = {};
    const number = (field: Field, valid: (value: number) => boolean, requirement: string) => {
      const value = fields[field].trim() === '' ? NaN : Number(fields[field]);
      if (!Number.isFinite(value) || !valid(value)) errors[field] = `${LABELS[field]} ${requirement}.`;
      return value;
    };
    const integer = (field: Field, min: number, max: number) =>
      number(field, n => Number.isInteger(n) && n >= min && n <= max, `must be an integer from ${min} to ${max.toLocaleString('en-US')}`);
    const alpha = number('alpha', n => n > 0 && n < 1, 'must be between 0 and 1');
    const targetPower = objective !== 'power' ? number('target', n => n > alpha && n < 1, 'must be greater than alpha and less than 1') : undefined;
    const dropout = objective === 'sample-size' ? number('dropout', n => n >= 0 && n < 100, 'must be at least 0 and less than 100') : undefined;
    const needsEffect = objective !== 'effect';
    const direct = effectInput === 'standardized';
    let groupMeans: number[] = [];
    if (design === 'anova' && needsEffect && !direct) {
      groupMeans = fields.means.split(/[\s,;]+/).filter(Boolean).map(Number);
      if (groupMeans.length < 2 || groupMeans.some(v => !Number.isFinite(v))) errors.means = `${LABELS.means} needs at least two numbers.`;
    }
    const meanDiff = design === 'paired' && needsEffect && !direct ? number('meanDiff', n => n !== 0, 'must be a finite, nonzero number') : undefined;
    const sdDiff = design === 'paired' && needsEffect && !direct ? number('sdDiff', n => n > 0, 'must be greater than zero') : undefined;
    const sd = design === 'anova' && needsEffect && !direct ? number('sd', n => n > 0, 'must be greater than zero') : undefined;
    const directEffect = needsEffect && direct
      ? number(design === 'paired' ? 'dz' : 'f', n => n > 0, 'must be greater than zero') : undefined;
    const pairs = design === 'paired' && objective !== 'sample-size' ? integer('pairs', 2, 1_000_000) : undefined;
    const perGroup = design === 'anova' && objective !== 'sample-size' ? integer('perGroup', 2, 1_000_000) : undefined;
    const meansMode = design === 'anova' && needsEffect && !direct;
    const groups = design === 'anova' && !meansMode ? integer('groups', 2, 1000) : groupMeans.length;
    if (Object.keys(errors).length) return { errors };

    try {
      const settings = [`Design: ${design === 'paired' ? 'Paired t-test' : 'Balanced one-way ANOVA'}`,
        `Objective: ${text.objectives[objective]}`, `Alpha: ${alpha}`,
        ...(targetPower !== undefined ? [`Target power: ${targetPower}`] : []),
        ...(design === 'paired' ? [`Sidedness: ${alternative}`] : [`Groups: ${groups}`])];
      let headline: string, enrollment: string | undefined, effectSize: number, power: number;
      let details: [string, string][];
      if (design === 'paired') {
        const effect = objective === 'effect' ? pairedMinimumDetectableEffect({ n: pairs!, alpha, alternative, targetPower: targetPower! })
          : direct ? directEffect! : cohensDz(meanDiff!, sdDiff!);
        effectSize = effect;
        const plan = objective === 'sample-size'
          ? requiredPairedSampleSize({ effectSize, alpha, alternative, targetPower: targetPower!, dropoutFraction: dropout! / 100 }) : undefined;
        const n = plan?.n ?? pairs!;
        power = plan?.achievedPower ?? pairedPower({ n, effectSize, alpha, alternative }).power;
        headline = objective === 'sample-size' ? `${n} analysable pairs`
          : objective === 'power' ? `${pct(power)} achieved power` : `Minimum detectable Cohen's d_z: ${effectSize.toFixed(4)}`;
        enrollment = plan ? `Enroll ${plan.enrollN} pairs` : undefined;
        details = [['Analysable pairs', String(n)], ['Degrees of freedom', String(n - 1)],
          ["Cohen's d_z magnitude", effectSize.toPrecision(5)], ['Calculated power', pct(power)]];
        settings.push(...(meanDiff !== undefined ? [`Anticipated mean difference: ${meanDiff}`, `SD of differences: ${sdDiff}`] : []),
          `Cohen's d_z: ${effectSize}`, `Analysable pairs: ${n}`, `Achieved power: ${power}`);
      } else {
        const effect = objective === 'effect' ? anovaMinimumDetectableEffect({ groups, nPerGroup: perGroup!, alpha, targetPower: targetPower! })
          : direct ? directEffect! : cohensF(groupMeans, sd!);
        effectSize = effect;
        const plan = objective === 'sample-size'
          ? requiredAnovaSampleSize({ groups, effectSize, alpha, targetPower: targetPower!, dropoutFraction: dropout! / 100 }) : undefined;
        const n = plan?.nPerGroup ?? perGroup!;
        power = plan?.achievedPower ?? anovaPower({ groups, nPerGroup: n, effectSize, alpha }).power;
        headline = objective === 'sample-size' ? `${n} analysable samples per group (${groups * n} in total)`
          : objective === 'power' ? `${pct(power)} achieved power` : `Minimum detectable Cohen's f: ${effectSize.toFixed(4)}`;
        enrollment = plan ? `Enroll ${plan.enrollPerGroup} per group (${plan.enrollTotal} in total)` : undefined;
        details = [['Groups', String(groups)], ['Analysable samples per group', String(n)], ['Total analysable samples', String(groups * n)],
          ['Degrees of freedom', `${groups - 1}, ${groups * (n - 1)}`], ["Cohen's f", effectSize.toPrecision(5)], ['Calculated power', pct(power)]];
        settings.push(...(meansMode ? [`Group means: ${groupMeans.join(', ')}`, `Common SD: ${sd}`] : []),
          `Cohen's f: ${effectSize}`, `Analysable samples per group: ${n}`, `Total: ${groups * n}`, `Achieved power: ${power}`);
      }
      if (dropout !== undefined) settings.push(`Dropout (%): ${dropout}`);
      const summary = [text.title, ...settings, headline, ...(enrollment ? [enrollment] : []), '', scienceText(science)].join('\n');
      return { errors, result: { headline, enrollment, details, power, summary } };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unable to calculate this design';
      return { errors, error: `Calculation blocked: adjust the effect size, alpha, target power, or sample size. ${reason}.` };
    }
  }, [fields, objective, effectInput, alternative, design]);
  const result = calculation.result;

  function field(name: Field, extra?: { hint?: string }) {
    const error = calculation.errors[name];
    return <div class="space-y-1">
      <label for={`study-${name}`} class="block text-sm font-medium">{LABELS[name]}</label>
      <input id={`study-${name}`} class={FIELD} type="text" inputMode="decimal" value={fields[name]}
        aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `study-${name}-error` : undefined}
        onInput={event => { setFields({ ...fields, [name]: event.currentTarget.value }); setMessage(''); }} />
      {extra?.hint && <p class={MUTED}>{extra.hint}</p>}
      {error && <p id={`study-${name}-error`} class="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    </div>;
  }

  async function copySummary() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.summary); setMessage('Design summary copied'); }
    catch { setMessage('Copy failed. Use Export design summary to save the text.'); }
  }

  const needsEffect = objective !== 'effect';
  const direct = effectInput === 'standardized';
  return <ToolLayout icon="📐" title="Experimental Design & Power Planner"
    blurb={design === 'paired'
      ? 'Plan a paired comparison (one-sample t test on the within-pair differences). All calculations stay in your browser.'
      : 'Plan a balanced one-way ANOVA with Cohen\'s f or group means. All calculations stay in your browser.'}
    mobileDefaultTab="stacked"
    inputs={<div class="space-y-4">
      {designSelector}
      <div class="space-y-1">
        <label for="study-objective" class="block text-sm font-medium">Objective</label>
        <select id="study-objective" class={FIELD} value={objective}
          onChange={event => { setObjective(event.currentTarget.value as Objective); setMessage(''); }}>
          {Object.entries(text.objectives).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {design === 'anova' && !(needsEffect && !direct) && field('groups')}
      {objective !== 'sample-size' && (design === 'paired' ? field('pairs') : field('perGroup'))}
      {needsEffect && <>
        <div class="space-y-1">
          <label for="study-effect-input" class="block text-sm font-medium">Effect size input</label>
          <select id="study-effect-input" class={FIELD} value={effectInput}
            onChange={event => { setEffectInput(event.currentTarget.value as EffectInput); setMessage(''); }}>
            <option value="raw">{text.effectNames.raw}</option>
            <option value="standardized">{text.effectNames.standardized}</option>
          </select>
        </div>
        {design === 'paired'
          ? direct ? field('dz') : <>{field('meanDiff')}{field('sdDiff', { hint: 'Use the SD of the differences within pairs, not of the raw measurements. Magnitude defines the effect size.' })}</>
          : direct ? field('f', { hint: 'Cohen benchmarks: 0.10 small, 0.25 medium, 0.40 large. The default is illustrative.' })
            : <>{field('means', { hint: 'One mean per group, in the same units as the SD. The number of means sets the number of groups.' })}{field('sd')}</>}
        <p class={MUTED}>Choose a meaningful anticipated effect before data collection.</p>
      </>}
      <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <summary class="cursor-pointer text-sm font-semibold">Advanced design settings</summary>
        <div class="mt-3 space-y-4">
          {field('alpha')}
          {objective !== 'power' && field('target')}
          {design === 'paired' && <div class="space-y-1">
            <label for="study-sidedness" class="block text-sm font-medium">Sidedness</label>
            <select id="study-sidedness" class={FIELD} value={alternative}
              onChange={event => { setAlternative(event.currentTarget.value as PairedAlternative); setMessage(''); }}>
              <option value="two-sided">Two-sided</option><option value="one-sided">One-sided</option>
            </select>
          </div>}
          {objective === 'sample-size' && field('dropout')}
        </div>
      </details>
    </div>}
    results={<div class="space-y-4" aria-live="polite">
      <span class="inline-block rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Planning estimate</span>
      <p class="text-sm text-slate-600 dark:text-slate-300">This supports study planning; it does not establish experimental validity.</p>
      {design === 'paired' && alternative === 'one-sided' && <p class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">For a one-sided test, prespecify the direction before collecting data.</p>}
      {design === 'anova' && <p class="text-sm text-slate-600 dark:text-slate-300">Power is for the overall F-test; pairwise follow-up comparisons need more samples.</p>}
      {result ? <>
        <h2 class="text-2xl font-semibold tracking-tight">{result.headline}</h2>
        {result.enrollment && <p class="text-lg font-medium">{result.enrollment}</p>}
        <dl class="grid grid-cols-2 gap-4 border-y border-slate-200 py-4 text-sm dark:border-slate-700">
          {result.details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd class="font-mono font-semibold">{value}</dd></div>)}
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
        onClick={() => { if (result) downloadText(result.summary, `${design === 'paired' ? 'paired' : 'anova'}-design-summary.txt`); }}>Export design summary</button>
      <span role="status" class="w-full text-sm text-slate-600 dark:text-slate-300">{message}</span>
    </div>}
    science={<SciencePanel science={science} />}
  />;
}
