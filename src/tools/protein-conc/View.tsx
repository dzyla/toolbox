import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { concentrationFromA280, standardCurve, type CurveModel, type StandardPoint } from '@/core/spectro/protein';
import { extinctionCoefficients, sanitize, summarize } from '@/core/protein';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { LineChart } from '@/app/components/LineChart';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SCIENCE } from './science';

const FIELD = 'mono w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';
interface State {
  tab: 'a280' | 'curve';
  absorbance: number;
  epsilon: number;
  molecularWeight: QValue;
  path: QValue;
  dilution: number;
  sequence: string;
  useSequence: boolean;
  standards: string;
  model: CurveModel;
  unknowns: string;
}
const DEFAULTS: State = {
  tab: 'a280', absorbance: 43824 / 66430, epsilon: 43824, molecularWeight: { value: 66430, unit: 'Da' }, path: { value: 1, unit: 'cm' }, dilution: 1,
  sequence: '', useSequence: false, standards: '0,0.1\n0.5,1.1\n1,2.1', model: 'linear', unknowns: '1.1',
};

function parseNumbers(text: string): number[] {
  return text.split(/[\s,;]+/).map(Number).filter(value => Number.isFinite(value));
}

function parseStandards(text: string): StandardPoint[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    const cells = line.split(/[\s,;\t]+/).filter(Boolean).map(Number);
    if (cells.length !== 2 || cells.some(value => !Number.isFinite(value))) throw new RangeError(`Standard line ${index + 1} must contain concentration and absorbance.`);
    return { concentration: cells[0]!, absorbance: cells[1]! };
  });
}

export default function View() {
  const [state, shareUrl] = useUrlState<State>('protein-conc', DEFAULTS);
  const current = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const sequenceValues = useMemo(() => {
    const clean = sanitize(current.sequence);
    if (!clean.seq) return null;
    const summary = summarize(clean.seq);
    return { seq: clean.seq, mw: summary.mw, epsilon: extinctionCoefficients(summary.counts, summary.mw, 'native').cystines, ambiguous: clean.ambiguous };
  }, [current.sequence]);
  const a280 = useMemo(() => {
    try {
      if (current.useSequence && !sequenceValues) throw new RangeError('Enter a protein sequence before using sequence-derived values.');
      const mw = current.useSequence ? sequenceValues!.mw : current.molecularWeight.value * (current.molecularWeight.unit === 'kDa' ? 1000 : 1);
      const epsilon = current.useSequence ? sequenceValues!.epsilon : current.epsilon;
      const path = current.path.value * (current.path.unit === 'mm' ? 0.1 : 1);
      const value = concentrationFromA280(current.absorbance, epsilon, path, current.dilution, mw);
      return { value, mw, epsilon, error: '' };
    } catch (error) { return { value: null, mw: NaN, epsilon: NaN, error: error instanceof Error ? error.message : 'Could not calculate concentration.' }; }
  }, [current.absorbance, current.dilution, current.epsilon, current.molecularWeight, current.path, current.useSequence, sequenceValues]);
  const curve = useMemo(() => {
    try {
      const points = parseStandards(current.standards);
      const fit = standardCurve(points, current.model);
      const unknowns = parseNumbers(current.unknowns).map(absorbance => ({ absorbance, concentration: fit.concentrationAt(absorbance) }));
      return { points, fit, unknowns, error: '' };
    } catch (error) { return { points: [] as StandardPoint[], fit: null, unknowns: [], error: error instanceof Error ? error.message : 'Could not fit the standard curve.' }; }
  }, [current.model, current.standards, current.unknowns]);
  const a280Text = a280.value ? `A280 ${current.absorbance.toFixed(4)} gives ${a280.value.gPerL.toFixed(4)} g/L (${(a280.value.molar * 1e6).toFixed(3)} µM) using ε ${a280.epsilon.toFixed(0)} M⁻¹cm⁻¹, MW ${a280.mw.toFixed(2)} Da, path ${current.path.value} ${current.path.unit}, dilution ${current.dilution}×.` : a280.error;
  const curveText = curve.fit ? `${current.model} standard curve: ${curve.unknowns.map(item => `A ${item.absorbance} = ${item.concentration.toFixed(4)} concentration units`).join('; ')}; R² ${curve.fit.r2.toFixed(4)}.` : curve.error;
  const copyText = () => `${current.tab === 'a280' ? a280Text : curveText}\n\n${scienceText(SCIENCE)}`;
  const tabButton = (tab: State['tab'], label: string) => <button type="button" class={`min-h-11 rounded-full px-4 text-sm ${current.tab === tab ? 'bg-accent-600 font-semibold text-white' : 'border border-slate-300 dark:border-slate-700'}`} aria-pressed={current.tab === tab} onClick={() => set({ tab })}>{label}</button>;
  return <ToolLayout icon="📏" title="Protein Concentration" blurb="Convert A280 with Beer–Lambert or fit a local standard curve without sending data anywhere."
    inputs={<>
      <div class="flex flex-wrap gap-2">{tabButton('a280', 'A280')}{tabButton('curve', 'Standard curve')}</div>
      {current.tab === 'a280' ? <>
        <label for="conc-absorbance" class="block"><span class="mb-1 block text-sm font-medium">A280 absorbance</span><input id="conc-absorbance" class={FIELD} type="number" min="0" step="any" value={current.absorbance} onInput={event => set({ absorbance: Number((event.target as HTMLInputElement).value) })} /></label>
        <label for="conc-epsilon" class="block"><span class="mb-1 block text-sm font-medium">Extinction coefficient ε₂₈₀ (M⁻¹cm⁻¹)</span><input id="conc-epsilon" class={FIELD} type="number" min="0" step="any" value={current.epsilon} disabled={current.useSequence} onInput={event => set({ epsilon: Number((event.target as HTMLInputElement).value) })} /></label>
        <Quantity id="conc-mw" label="Molecular weight" value={current.molecularWeight} units={['Da', 'kDa']} onChange={molecularWeight => set({ molecularWeight })} />
        <div class="grid gap-3 sm:grid-cols-2"><Quantity id="conc-path" label="Path length" value={current.path} units={['cm', 'mm']} onChange={path => set({ path })} /><label for="conc-dilution" class="block"><span class="mb-1 block text-sm font-medium">Dilution factor</span><input id="conc-dilution" class={FIELD} type="number" min="0" step="any" value={current.dilution} onInput={event => set({ dilution: Number((event.target as HTMLInputElement).value) })} /></label></div>
        <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary class="cursor-pointer font-medium">Derive MW and ε from sequence</summary><div class="mt-3 space-y-3"><label for="conc-sequence" class="block"><span class="mb-1 block text-sm font-medium">Protein sequence</span><textarea id="conc-sequence" rows={4} class={`${FIELD} text-xs`} value={current.sequence} onInput={event => set({ sequence: (event.target as HTMLTextAreaElement).value })} /></label><label class="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={current.useSequence} onChange={event => set({ useSequence: (event.target as HTMLInputElement).checked })} />Use sequence-derived native, all-cystines ε and average MW</label>{sequenceValues && <p class="text-xs text-slate-500">Derived: MW {sequenceValues.mw.toFixed(2)} Da; ε {sequenceValues.epsilon.toFixed(0)} M⁻¹cm⁻¹.{sequenceValues.ambiguous.length ? ` Ambiguous: ${sequenceValues.ambiguous.join(', ')}.` : ''}</p>}</div></details>
      </> : <>
        <label for="curve-standards" class="block"><span class="mb-1 block text-sm font-medium">Standards</span><textarea id="curve-standards" rows={7} class={FIELD} value={current.standards} onInput={event => set({ standards: (event.target as HTMLTextAreaElement).value })} /><span class="mt-1 block text-xs text-slate-500">One concentration, absorbance pair per line; comma, tab, or space separated.</span></label>
        <label for="curve-model" class="block"><span class="mb-1 block text-sm font-medium">Fit model</span><select id="curve-model" class={FIELD} value={current.model} onChange={event => set({ model: (event.target as HTMLSelectElement).value as CurveModel })}><option value="linear">Linear</option><option value="quadratic">Quadratic</option></select></label>
        <label for="curve-unknowns" class="block"><span class="mb-1 block text-sm font-medium">Unknown absorbance values</span><textarea id="curve-unknowns" rows={3} class={FIELD} value={current.unknowns} onInput={event => set({ unknowns: (event.target as HTMLTextAreaElement).value })} /></label>
      </>}
    </>}
    results={current.tab === 'a280' ? a280.error ? <p role="alert" class="text-red-600">{a280.error}</p> : <div data-testid="a280-result" class="space-y-3"><p class="text-sm text-slate-500">Blank-corrected sample concentration</p><p class="mono text-3xl font-bold">{a280.value!.gPerL.toFixed(2)} g/L</p><p class="mono text-xl">{a280.value!.gPerL.toFixed(2)} mg/mL · {(a280.value!.molar * 1e6).toFixed(2)} µM</p><dl class="grid grid-cols-2 gap-2 text-sm"><div><dt class="text-slate-500">ε₂₈₀</dt><dd class="mono">{a280.epsilon.toFixed(0)} M⁻¹cm⁻¹</dd></div><div><dt class="text-slate-500">MW</dt><dd class="mono">{a280.mw.toFixed(2)} Da</dd></div></dl></div>
      : curve.error ? <p role="alert" class="text-red-600">{curve.error}</p> : <div data-testid="curve-result" class="space-y-4"><div><p class="text-sm text-slate-500">{curve.fit!.model === 'linear' ? 'Linear least-squares fit' : 'Quadratic least-squares fit'}</p><p class="mono text-lg font-semibold">R² {curve.fit!.r2.toFixed(4)}</p><p class="mono text-sm">A = {curve.fit!.coefficients.map((coefficient, index) => `${coefficient.toPrecision(5)}${index ? `c${index === 2 ? '²' : ''}` : ''}`).join(' + ')}</p></div>{curve.unknowns.length ? <ul class="space-y-1 text-sm">{curve.unknowns.map((item, index) => <li key={`${item.absorbance}-${index}`}>A = <span class="mono">{item.absorbance}</span> → concentration <strong class="mono">{item.concentration.toFixed(3)}</strong></li>)}</ul> : <p class="text-sm text-slate-500">Enter unknown absorbance values to interpolate them.</p>}<LineChart title="Standard curve" xLabel="Concentration" yLabel="Absorbance" series={[{ name: 'Standards', x: curve.points.map(point => point.concentration), y: curve.points.map(point => point.absorbance) }, { name: `${curve.fit!.model} fit`, x: curve.points.map(point => point.concentration).sort((a, b) => a - b), y: curve.points.map(point => point.concentration).sort((a, b) => a - b).map(curve.fit!.predict) }]} exportName="protein-standard-curve" /><div class="overflow-x-auto"><table class="w-full min-w-[24rem] text-sm"><thead><tr><th class="pb-2 text-left">Concentration</th><th class="pb-2 text-right">Absorbance</th><th class="pb-2 text-right">Residual</th></tr></thead><tbody>{curve.points.map((point, index) => <tr key={`${point.concentration}-${index}`} class="border-t border-slate-200 dark:border-slate-700"><td class="mono py-2">{point.concentration}</td><td class="mono py-2 text-right">{point.absorbance}</td><td class="mono py-2 text-right">{curve.fit!.residuals[index]!.toPrecision(4)}</td></tr>)}</tbody></table></div></div>}
    actions={<ActionBar onCopy={copyText} shareUrl={shareUrl} />}
    science={<SciencePanel science={SCIENCE} />}
  />;
}
