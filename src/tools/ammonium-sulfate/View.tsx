import { useMemo, useState } from 'preact/hooks';
import {
  AmmoniumSulfateError,
  gramsToAdd,
  predictSaltingOut,
  predictFromSequence,
  type SaltingOutResult,
} from '@/core/reactions/ammonium-sulfate';
import { formatSI, toSI, UnitError } from '@/core/units';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import { downloadText, toCsv } from '@/lib/export';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  volume: QValue;
  current: number;
  target: number;
  temperature: 25 | 0;
  tab: 'addition' | 'cohn';
  inputMode: 'sequence' | 'parameters';
  sequence: string;
  mwKDa: number;
  pI: number;
  gravy: number;
  bufferPh: number;
  proteinConcMgMl: number;
}

const DEFAULTS: State = {
  volume: { value: 1, unit: 'L' },
  current: 0,
  target: 50,
  temperature: 25,
  tab: 'addition',
  inputMode: 'sequence',
  sequence: 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL',
  mwKDa: 66.4,
  pI: 4.7,
  gravy: -0.43,
  bufferPh: 7.0,
  proteinConcMgMl: 2.0,
};

const PROTEIN_PRESETS = [
  {
    name: 'Hen Egg Lysozyme (14.3 kDa)',
    mwKDa: 14.3,
    pI: 11.0,
    gravy: -0.47,
    seq: 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL',
  },
  {
    name: 'Bovine Serum Albumin (BSA, 66.4 kDa)',
    mwKDa: 66.4,
    pI: 4.7,
    gravy: -0.43,
    seq: 'DTHKSEIAHRFKDLGEEHFKGLVLIAFSQYLQQCPFDEHVKLVNELTEFAKTCVADESHAGCEKSLHTLFGDELCKVASLRETYGDMADCCEKQEPERNECFLSHKDDSPDLPKLKPDPNTLCDEFKADEKKFWGKYLYEIARRHPYFYAPELLYYANKYNGVFQECCQAEDKGACLLPKIETMREKVLASSARQRLRCASIQKFGERALKAWSVARLSQKFPKAEFVEVTKLVTDLTKVHKECCHGDLLECADDRADLAKYICDNQDTISSKLKECCDKPLLEKSHCIAEVEKDAIPENLPPLTADFAEDKDVCKNYQEAKDAFLGSFLYEYSRRHPEYAVSVLLRLAKEYEATLEECCAKDDPHACYSTVFDKLKHLVDEPQNLIKQNCDQFEKLGEYGFQNALIVRYTRKVPQVSTPTLVEVSRSLGKVGTRCCTKPESERMPCTEDYLSLILNRLCVLHEKTPVSEKVTKCCTESLVNRRPCFSALTPDETYVPKAFDEKLFTFHADICTLPDTEKQIKKQTALVELLKHKPKATEEQLKTVMENFVAFVDKCCAADDKEACFAVEGPKLVVSTQTALA',
  },
  {
    name: 'Human IgG1 (150 kDa antibody)',
    mwKDa: 150.0,
    pI: 7.2,
    gravy: -0.15,
    seq: 'EVQLVESGGGLVQPGGSLRLSCAASGFTFSDHYMDWVRQAPGKGLEWVGRTRNKANSYTTEYAASVKGRFTISRDDSKNSLYLQMNSLKTEDTAVYYCAR',
  },
  {
    name: 'GFP (Green Fluorescent Protein, 26.9 kDa)',
    mwKDa: 26.9,
    pI: 5.8,
    gravy: -0.39,
    seq: 'MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK',
  },
];

const CUT_PRESETS = [
  { label: '0 → 30%', current: 0, target: 30 },
  { label: '30 → 50%', current: 30, target: 50 },
  { label: '50 → 70%', current: 50, target: 70 },
  { label: '0 → 60%', current: 0, target: 60 },
  { label: '0 → 70%', current: 0, target: 70 },
];

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

export default function View() {
  const [state, shareUrl] = useUrlState<State>('ammonium-sulfate', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };

  const calculation = useMemo(() => {
    try {
      return { grams: gramsToAdd(s.current, s.target, toSI(s.volume), s.temperature) };
    } catch (error) {
      if (error instanceof AmmoniumSulfateError || error instanceof UnitError) return { error: error.message };
      throw error;
    }
  }, [s.current, s.target, s.volume, s.temperature]);

  const cohnResult = useMemo((): { value?: SaltingOutResult; error?: string } => {
    try {
      if (s.inputMode === 'sequence' && s.sequence.trim()) {
        return {
          value: predictFromSequence(s.sequence, {
            pH: s.bufferPh,
            initialConcMgMl: s.proteinConcMgMl,
            temp: s.temperature,
          }),
        };
      } else {
        return {
          value: predictSaltingOut({
            mwDa: s.mwKDa * 1000,
            pI: s.pI,
            gravy: s.gravy,
            pH: s.bufferPh,
            initialConcMgMl: s.proteinConcMgMl,
            temp: s.temperature,
          }),
        };
      }
    } catch (error) {
      if (error instanceof AmmoniumSulfateError) return { error: error.message };
      return { error: 'Invalid parameters for Cohn prediction' };
    }
  }, [s.inputMode, s.sequence, s.mwKDa, s.pI, s.gravy, s.bufferPh, s.proteinConcMgMl, s.temperature]);

  const result = calculation.grams === undefined ? '' : formatSI(calculation.grams, 'mass', { units: ['g', 'mg'] }).text;

  const copyText = calculation.error ? calculation.error : [
    `Add ${result} solid ammonium sulfate to ${s.volume.value} ${s.volume.unit} to increase saturation from ${s.current}% to ${s.target}% at ${s.temperature === 25 ? '25 °C' : '0–4 °C'}.`,
    cohnResult.value ? `Cohn Salting-Out Prediction: Onset at ${cohnResult.value.onsetSaturation}%, 50% at ${cohnResult.value.midpointSaturation}%, >95% recovery at ${cohnResult.value.completeSaturation}%. Recommended cut: ${cohnResult.value.recommendedPreCut}% → ${cohnResult.value.recommendedTargetCut}%.` : '',
    '', scienceText(SCIENCE),
  ].filter(Boolean).join('\n');

  const exportCurveCsv = () => {
    if (!cohnResult.value) return;
    const rows = [
      ['Saturation (%)', 'Solubility (mg/mL)', 'Precipitated (%)'],
      ...cohnResult.value.curve.map(pt => [pt.saturation, pt.solubilityMgMl, pt.percentPrecipitated]),
    ];
    downloadText(
      [
        `# Cohn Salting-Out Prediction Curve`,
        `# MW: ${(cohnResult.value.mwDa / 1000).toFixed(1)} kDa, pI: ${cohnResult.value.pI}, GRAVY: ${cohnResult.value.gravy}, pH: ${cohnResult.value.pH}`,
        `# Ks: ${cohnResult.value.ks}, Beta: ${cohnResult.value.beta}`,
        toCsv(rows),
      ].join('\n'),
      'cohn-salting-out-curve.csv',
      'text/csv;charset=utf-8'
    );
  };

  const applyRecommendedCut = () => {
    if (!cohnResult.value) return;
    set({
      current: cohnResult.value.recommendedPreCut,
      target: cohnResult.value.recommendedTargetCut,
      tab: 'addition',
    });
  };

  // SVG dimensions for Cohn curve
  const svgW = 460;
  const svgH = 180;
  const padL = 45;
  const padR = 25;
  const padT = 20;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const points = cohnResult.value?.curve || [];
  const svgPath = points.length > 0 ? points.map((pt, i) => {
    const x = padL + (pt.saturation / 100) * plotW;
    const y = padT + (1 - pt.percentPrecipitated / 100) * plotH;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ') : '';

  return (
    <ToolLayout
      icon="🧂"
      title="Ammonium Sulfate & Cohn Salting-Out"
      blurb="Calculate solid salt addition and predict protein precipitation cuts using Cohn's salting-out equation."
      mobileResultSummary={
        s.tab === 'addition' ? (
          calculation.error ? (
            <span class="text-rose-600 dark:text-rose-400 font-semibold">{calculation.error}</span>
          ) : (
            <span>Add <strong class="text-accent-700 dark:text-accent-300 font-mono text-sm">{result}</strong> solid salt ({s.current}% → {s.target}%)</span>
          )
        ) : (
          cohnResult.value ? (
            <span>Onset: <strong>{cohnResult.value.onsetSaturation}%</strong> · Target: <strong>{cohnResult.value.completeSaturation}%</strong></span>
          ) : <span>Cohn Predictor</span>
        )
      }
      inputs={
        <div class="space-y-4">
          {/* Main Mode Toggle */}
          <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => set({ tab: 'addition' })}
              class={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${s.tab === 'addition' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              🧂 Solid Salt Calculator
            </button>
            <button
              type="button"
              onClick={() => set({ tab: 'cohn' })}
              class={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${s.tab === 'cohn' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              📈 Cohn Salting-Out Predictor
            </button>
          </div>

          {s.tab === 'addition' ? (
            <div class="space-y-3">
              <Quantity id="ammonium-volume" label="Starting volume" value={s.volume} units={['L', 'mL']} onChange={volume => set({ volume })} />
              <div class="grid gap-3 sm:grid-cols-2">
                <label>
                  <span class="mb-1 block text-sm font-medium">Current saturation (%)</span>
                  <input
                    aria-label="Current saturation"
                    type="number"
                    min="0"
                    max="99.9"
                    step="any"
                    value={s.current}
                    onInput={event => set({ current: Number((event.target as HTMLInputElement).value) })}
                    class={fieldClass}
                  />
                </label>
                <label>
                  <span class="mb-1 block text-sm font-medium">Target saturation (%)</span>
                  <input
                    aria-label="Target saturation"
                    type="number"
                    min="0"
                    max="99.9"
                    step="any"
                    value={s.target}
                    onInput={event => set({ target: Number((event.target as HTMLInputElement).value) })}
                    class={fieldClass}
                  />
                </label>
              </div>

              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] text-slate-400 font-medium mr-0.5">Common cuts:</span>
                {CUT_PRESETS.map(cut => (
                  <button
                    key={cut.label}
                    type="button"
                    onClick={() => set({ current: cut.current, target: cut.target })}
                    class={`rounded-md px-2 py-0.5 text-xs font-mono transition border ${s.current === cut.current && s.target === cut.target ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  >
                    {cut.label}
                  </button>
                ))}
              </div>

              <label>
                <span class="mb-1 block text-sm font-medium">Temperature</span>
                <select
                  aria-label="Temperature"
                  value={s.temperature}
                  onChange={event => set({ temperature: Number((event.target as HTMLSelectElement).value) as 25 | 0 })}
                  class={fieldClass}
                >
                  <option value="25">25 °C (room temperature)</option>
                  <option value="0">0–4 °C (cold room)</option>
                </select>
              </label>
            </div>
          ) : (
            <div class="space-y-4">
              {/* Protein Presets */}
              <div>
                <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Load Standard Protein Preset
                </label>
                <select
                  class={fieldClass}
                  onChange={e => {
                    const selected = PROTEIN_PRESETS.find(p => p.name === (e.target as HTMLSelectElement).value);
                    if (selected) {
                      set({
                        sequence: selected.seq,
                        mwKDa: selected.mwKDa,
                        pI: selected.pI,
                        gravy: selected.gravy,
                      });
                    }
                  }}
                >
                  <option value="">-- Choose protein (Lysozyme, BSA, IgG, GFP) --</option>
                  {PROTEIN_PRESETS.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Input Mode Selector */}
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() => set({ inputMode: 'sequence' })}
                  class={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${s.inputMode === 'sequence' ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-300 dark:border-slate-700'}`}
                >
                  Amino Acid Sequence (FASTA)
                </button>
                <button
                  type="button"
                  onClick={() => set({ inputMode: 'parameters' })}
                  class={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${s.inputMode === 'parameters' ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-300 dark:border-slate-700'}`}
                >
                  Manual Parameters (MW, pI, GRAVY)
                </button>
              </div>

              {s.inputMode === 'sequence' ? (
                <div>
                  <label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Protein Sequence:
                  </label>
                  <textarea
                    rows={4}
                    value={s.sequence}
                    onInput={e => set({ sequence: (e.target as HTMLTextAreaElement).value })}
                    placeholder="Enter protein amino acid sequence or FASTA..."
                    class="w-full font-mono text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              ) : (
                <div class="grid grid-cols-3 gap-2">
                  <label>
                    <span class="block text-xs font-medium">MW (kDa)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      value={s.mwKDa}
                      onInput={e => set({ mwKDa: parseFloat((e.target as HTMLInputElement).value) || 50 })}
                      class={fieldClass}
                    />
                  </label>
                  <label>
                    <span class="block text-xs font-medium">Isoelectric pt (pI)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="2"
                      max="14"
                      value={s.pI}
                      onInput={e => set({ pI: parseFloat((e.target as HTMLInputElement).value) || 7.0 })}
                      class={fieldClass}
                    />
                  </label>
                  <label>
                    <span class="block text-xs font-medium">GRAVY Index</span>
                    <input
                      type="number"
                      step="0.05"
                      min="-2.0"
                      max="2.0"
                      value={s.gravy}
                      onInput={e => set({ gravy: parseFloat((e.target as HTMLInputElement).value) || -0.4 })}
                      class={fieldClass}
                    />
                  </label>
                </div>
              )}

              {/* Buffer Conditions */}
              <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label>
                  <span class="block text-xs font-medium">Buffer pH</span>
                  <input
                    type="number"
                    step="0.1"
                    min="3"
                    max="11"
                    value={s.bufferPh}
                    onInput={e => set({ bufferPh: parseFloat((e.target as HTMLInputElement).value) || 7.0 })}
                    class={fieldClass}
                  />
                </label>
                <label>
                  <span class="block text-xs font-medium">[Protein] (mg/mL)</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    value={s.proteinConcMgMl}
                    onInput={e => set({ proteinConcMgMl: parseFloat((e.target as HTMLInputElement).value) || 2.0 })}
                    class={fieldClass}
                  />
                </label>
                <label>
                  <span class="block text-xs font-medium">Temperature</span>
                  <select
                    value={s.temperature}
                    onChange={e => set({ temperature: Number((e.target as HTMLSelectElement).value) as 25 | 0 })}
                    class={fieldClass}
                  >
                    <option value="25">25 °C</option>
                    <option value="0">0–4 °C</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>
      }
      results={
        s.tab === 'addition' ? (
          calculation.error ? (
            <p role="alert" class="text-red-600">{calculation.error}</p>
          ) : (
            <div class="text-center space-y-3">
              <p class="text-sm uppercase tracking-wide text-slate-500">Add solid salt</p>
              <p data-testid="ammonium-result" class="my-2 font-mono text-3xl font-bold text-accent-700 dark:text-accent-300">
                {result}
              </p>
              <p class="text-sm text-slate-500">
                Add slowly with continuous stirring at {s.temperature === 25 ? '25 °C' : '0–4 °C'}.
              </p>
              <div class="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 flex justify-center gap-4">
                <span>Cut: <strong>{s.current}% → {s.target}%</strong></span>
                <span>Volume: <strong>{s.volume.value} {s.volume.unit}</strong></span>
                <span>Formula constant: <strong>{s.temperature === 25 ? '533 g/L' : '515 g/L'}</strong></span>
              </div>
            </div>
          )
        ) : (
          cohnResult.error ? (
            <p role="alert" class="text-red-600">{cohnResult.error}</p>
          ) : (
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Cohn Salting-Out Prediction
                  </h3>
                  <p class="text-xs text-slate-500">
                    MW: {(cohnResult.value!.mwDa / 1000).toFixed(1)} kDa · pI: {cohnResult.value!.pI} · GRAVY: {cohnResult.value!.gravy}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportCurveCsv}
                  class="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Export Curve CSV
                </button>
              </div>

              {/* Summary Cards */}
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <span class="text-[10px] uppercase font-semibold text-amber-800 dark:text-amber-300 block">Precipitation Onset</span>
                  <span class="font-mono text-xl font-bold text-amber-900 dark:text-amber-200">{cohnResult.value!.onsetSaturation}%</span>
                  <span class="text-[10px] text-amber-700 dark:text-amber-400 block">first clouding</span>
                </div>
                <div class="rounded-xl border border-blue-200 bg-blue-50/60 p-2.5 dark:border-blue-900/40 dark:bg-blue-950/20">
                  <span class="text-[10px] uppercase font-semibold text-blue-800 dark:text-blue-300 block">50% Midpoint</span>
                  <span class="font-mono text-xl font-bold text-blue-900 dark:text-blue-200">{cohnResult.value!.midpointSaturation}%</span>
                  <span class="text-[10px] text-blue-700 dark:text-blue-400 block">half precipitated</span>
                </div>
                <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <span class="text-[10px] uppercase font-semibold text-emerald-800 dark:text-emerald-300 block">Target Pellet (&gt;95%)</span>
                  <span class="font-mono text-xl font-bold text-emerald-900 dark:text-emerald-200">{cohnResult.value!.completeSaturation}%</span>
                  <span class="text-[10px] text-emerald-700 dark:text-emerald-400 block">complete recovery</span>
                </div>
              </div>

              {/* Recommended 2-step cut recommendation card */}
              <div class="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 dark:border-indigo-900/50 dark:bg-indigo-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div class="space-y-1">
                  <span class="text-xs font-bold text-indigo-900 dark:text-indigo-200 block uppercase tracking-wider">
                    Recommended 2-Step Fractionation Cut:
                  </span>
                  <div class="text-xs text-indigo-800 dark:text-indigo-300 font-medium space-x-3">
                    <span>1. Wash pre-cut: <strong>0 → {cohnResult.value!.recommendedPreCut}%</strong> (discard pellet)</span>
                    <span>2. Target pellet: <strong>{cohnResult.value!.recommendedPreCut}% → {cohnResult.value!.recommendedTargetCut}%</strong> (collect pellet)</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyRecommendedCut}
                  class="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
                >
                  Use Cut in Calculator →
                </button>
              </div>

              {/* Interactive SVG Cohn Precipitation Curve */}
              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div class="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Cohn Salting-Out Curve: % Protein Precipitated vs (NH₄)₂SO₄ Saturation</span>
                  <span class="font-mono">Kₛ = {cohnResult.value!.ks}, β = {cohnResult.value!.beta}</span>
                </div>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} class="w-full h-auto overflow-visible select-none">
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map(pct => {
                    const y = padT + (1 - pct / 100) * plotH;
                    return (
                      <g key={pct}>
                        <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="currentColor" stroke-dasharray="2,2" class="text-slate-200 dark:text-slate-800" />
                        <text x={padL - 6} y={y + 3} text-anchor="end" class="text-[9px] fill-slate-400 font-mono">{pct}%</text>
                      </g>
                    );
                  })}
                  {[0, 20, 40, 60, 80, 100].map(sat => {
                    const x = padL + (sat / 100) * plotW;
                    return (
                      <g key={sat}>
                        <line x1={x} y1={padT} x2={x} y2={svgH - padB} stroke="currentColor" stroke-dasharray="2,2" class="text-slate-200 dark:text-slate-800" />
                        <text x={x} y={svgH - padB + 14} text-anchor="middle" class="text-[9px] fill-slate-400 font-mono">{sat}%</text>
                      </g>
                    );
                  })}

                  {/* Shaded recommended cut zone */}
                  {cohnResult.value && (
                    <rect
                      x={padL + (cohnResult.value.recommendedPreCut / 100) * plotW}
                      y={padT}
                      width={((cohnResult.value.recommendedTargetCut - cohnResult.value.recommendedPreCut) / 100) * plotW}
                      height={plotH}
                      class="fill-indigo-500/15 dark:fill-indigo-400/20"
                    />
                  )}

                  {/* Onset marker */}
                  {cohnResult.value && (
                    <line
                      x1={padL + (cohnResult.value.onsetSaturation / 100) * plotW}
                      y1={padT}
                      x2={padL + (cohnResult.value.onsetSaturation / 100) * plotW}
                      y2={svgH - padB}
                      stroke="#f59e0b"
                      stroke-width="1.5"
                      stroke-dasharray="3,3"
                    />
                  )}

                  {/* Complete marker */}
                  {cohnResult.value && (
                    <line
                      x1={padL + (cohnResult.value.completeSaturation / 100) * plotW}
                      y1={padT}
                      x2={padL + (cohnResult.value.completeSaturation / 100) * plotW}
                      y2={svgH - padB}
                      stroke="#10b981"
                      stroke-width="1.5"
                      stroke-dasharray="3,3"
                    />
                  )}

                  {/* Main sigmoidal precipitation curve */}
                  <path d={svgPath} fill="none" stroke="#6366f1" stroke-width="2.5" />

                  {/* Axes */}
                  <line x1={padL} y1={padT} x2={padL} y2={svgH - padB} stroke="currentColor" class="text-slate-400" />
                  <line x1={padL} y1={svgH - padB} x2={svgW - padR} y2={svgH - padB} stroke="currentColor" class="text-slate-400" />
                </svg>
                <div class="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                  <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Onset ({cohnResult.value!.onsetSaturation}%)</span>
                  <span class="flex items-center gap-1"><span class="w-2.5 h-1.5 rounded-xs bg-indigo-500/30 inline-block" /> Recommended Cut Window</span>
                  <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> &gt;95% Recovery ({cohnResult.value!.completeSaturation}%)</span>
                </div>
              </div>
            </div>
          )
        )
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}

