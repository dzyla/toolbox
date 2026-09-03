import { useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import {
  type HostOrganism,
  HOST_NAMES,
  cleanDna,
  analyzeCodonUsage,
} from '@/core/rare-codons';

interface State {
  codingDna: string;
  host: HostOrganism;
}

const DEMO_HUMAN_PROTEIN = 'ATGCGAAGAAGGCGACGGATACTACCCCCTGGAGGAGAAATTCTAATACGGAGGAGGCGGACACCGCCGCCAGGTGGTCGACGACGGCGACGAATTTTTCTTTTTT';

const DEFAULTS: State = {
  codingDna: DEMO_HUMAN_PROTEIN,
  host: 'ecoli',
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono';

export default function RareCodonsView() {
  const [stateSig, shareUrl] = useUrlState<State>('rare-codons', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [copiedOpt, setCopiedOpt] = useState(false);
  const [hoveredCodonIdx, setHoveredCodonIdx] = useState<number | null>(null);

  const analysis = useMemo(() => {
    return analyzeCodonUsage(s.codingDna, s.host);
  }, [s.codingDna, s.host]);

  function handleCopyOptimized() {
    if (!analysis) return;
    navigator.clipboard?.writeText?.(analysis.optimizedDna);
    setCopiedOpt(true);
    setTimeout(() => setCopiedOpt(false), 2000);
  }

  const copySummary = () => {
    if (!analysis) return '';
    const lines = [
      `Rare Codon Analysis (${HOST_NAMES[s.host]}):`,
      `Codons: ${analysis.totalCodons} | CAI: ${analysis.cai.toFixed(3)} | GC: ${analysis.overallGc}% | GC3: ${analysis.gc3}%`,
      `Rare Codons: ${analysis.rareCodonCount} (${analysis.rareCodonPct}%)`,
      `Strain Recommendation: ${analysis.strainRecommendation.recommendedStrain}`,
      `Details: ${analysis.strainRecommendation.reason}`,
      '',
      'Pause Clusters:',
      ...analysis.pauseClusters.map(c => `  Residues ${c.startAa}-${c.endAa}: ${c.description}`),
    ];
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="⚠️"
      title="Rare Codon & Expression Optimizer"
      blurb="Detect rare tRNA bottlenecks, ribosomal pause hotspots, and Codon Adaptation Index (CAI) for recombinant E. coli expression with automated host strain recommendations."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Host Picker */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Host Expression System
            </label>
            <select
              value={s.host}
              onChange={(e) => set({ host: (e.target as HTMLSelectElement).value as HostOrganism })}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
            >
              {Object.entries(HOST_NAMES).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* DNA Input */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Coding DNA Sequence (5' to 3')
              </label>
              <span class="text-[11px] text-slate-500 font-mono">
                {cleanDna(s.codingDna).length} bp ({analysis.totalCodons} aa)
              </span>
            </div>
            <textarea
              rows={6}
              value={s.codingDna}
              onInput={(e) => set({ codingDna: (e.target as HTMLTextAreaElement).value })}
              placeholder="Paste coding sequence (ORF starting with ATG)..."
              class={FIELD}
            />
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Primary Metric Banner */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Codon Adaptation Index (CAI)
                </span>
                <div class="flex items-baseline gap-2 mt-0.5">
                  <span class="text-3xl font-black font-mono text-slate-900 dark:text-slate-100">
                    {analysis.cai.toFixed(3)}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${analysis.cai >= 0.8 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : analysis.cai >= 0.65 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                    {analysis.cai >= 0.8 ? 'Optimal Expression' : analysis.cai >= 0.65 ? 'Moderate' : 'Severe Codon Bias'}
                  </span>
                </div>
              </div>
              <div class="text-right">
                <span class="text-xs text-slate-400 block">Critical Rare Codons</span>
                <span class="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                  {analysis.rareCodonCount} <span class="text-xs text-slate-400 font-normal">({analysis.rareCodonPct}%)</span>
                </span>
              </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Total Codons</span>
                <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                  {analysis.totalCodons}
                </span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Overall GC</span>
                <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                  {analysis.overallGc.toFixed(1)}%
                </span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">GC3 (Wobble)</span>
                <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                  {analysis.gc3.toFixed(1)}%
                </span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Pause Hotspots</span>
                <span className={`text-base font-bold font-mono ${analysis.pauseClusters.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {analysis.pauseClusters.length} clusters
                </span>
              </div>
            </div>
          </div>

          {/* Host Strain Recommendation Banner */}
          <div className={`p-4 rounded-2xl border text-xs space-y-1.5 ${analysis.strainRecommendation.isRareStrainNeeded ? 'border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/30' : 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/30'}`}>
            <div class="flex items-center justify-between">
              <strong class="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>🧫</span>
                <span>Recommended Host Strain: <span class="text-accent-600 dark:text-accent-400">{analysis.strainRecommendation.recommendedStrain}</span></span>
              </strong>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${analysis.strainRecommendation.isRareStrainNeeded ? 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200' : 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'}`}>
                {analysis.strainRecommendation.isRareStrainNeeded ? 'RARE-tRNA STRAIN REQUIRED' : 'STANDARD HOST OK'}
              </span>
            </div>
            <p class="text-slate-700 dark:text-slate-300 leading-relaxed">
              {analysis.strainRecommendation.reason}
            </p>
          </div>

          {/* Pause Clusters Warning */}
          {analysis.pauseClusters.length > 0 && (
            <div class="rounded-2xl border border-rose-200 bg-rose-50/30 p-4 dark:border-rose-900 dark:bg-rose-950/20 text-xs space-y-2">
              <h4 class="font-bold text-rose-900 dark:text-rose-300 flex items-center gap-1.5">
                <span>🛑</span>
                <span>Ribosomal Pause Clusters ({analysis.pauseClusters.length})</span>
              </h4>
              <ul class="space-y-1 text-slate-700 dark:text-slate-300">
                {analysis.pauseClusters.map((c, i) => (
                  <li key={i} class="flex items-start gap-1.5">
                    <span class="text-rose-500 font-bold">•</span>
                    <span>{c.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Interactive Visual Codon Map */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                Codon Usage Map &amp; Rare Bottlenecks
              </h3>
              <div class="flex items-center gap-3 text-[11px]">
                <span class="flex items-center gap-1">
                  <span class="w-3 h-3 rounded bg-rose-500 inline-block" />
                  <span>Rare (&lt;0.8% or w &lt; 0.15)</span>
                </span>
                <span class="flex items-center gap-1">
                  <span class="w-3 h-3 rounded bg-amber-400 inline-block" />
                  <span>Moderate</span>
                </span>
                <span class="flex items-center gap-1">
                  <span class="w-3 h-3 rounded bg-emerald-500 inline-block" />
                  <span>Optimal</span>
                </span>
              </div>
            </div>

            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap gap-1 max-h-[220px] overflow-y-auto font-mono text-[11px]">
              {analysis.evaluatedCodons.map((c) => (
                <span
                  key={c.index}
                  onMouseEnter={() => setHoveredCodonIdx(c.index)}
                  onMouseLeave={() => setHoveredCodonIdx(null)}
                  class={`px-1 py-0.5 rounded cursor-pointer transition ${c.status === 'rare' ? 'bg-rose-500 text-white font-bold shadow-sm' : c.status === 'moderate' ? 'bg-amber-300 text-amber-950 font-semibold' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200'}`}
                  title={`Residue ${c.position}: ${c.aa} (${c.codon}) - ${c.frequencyPerThousand}/1000, w = ${c.relativeAdaptiveness.toFixed(2)}`}
                >
                  {c.codon}
                </span>
              ))}
            </div>

            {/* Hovered Codon Tooltip */}
            {hoveredCodonIdx !== null && analysis.evaluatedCodons[hoveredCodonIdx] && (
              <div class="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs flex flex-wrap items-center gap-4 text-slate-700 dark:text-slate-300">
                {(() => {
                  const hc = analysis.evaluatedCodons[hoveredCodonIdx]!;
                  return (
                    <>
                      <span>Pos: <strong>{hc.position}</strong> ({hc.aa})</span>
                      <span>Codon: <strong>{hc.codon}</strong></span>
                      <span>Frequency: <strong>{hc.frequencyPerThousand} / 1000</strong></span>
                      <span>Relative w: <strong>{hc.relativeAdaptiveness.toFixed(2)}</strong></span>
                      {hc.status === 'rare' && (
                        <span>Suggested Optimal: <strong class="text-emerald-600 dark:text-emerald-400 font-bold">{hc.suggestedCodon}</strong></span>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Synonymously Optimized DNA */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Synonymously Optimized Sequence (CAI: {analysis.cai.toFixed(2)} ➔ {analysis.optimizedCai.toFixed(2)})
                </h3>
                <p class="text-xs text-slate-500">
                  Replaces all rare bottleneck codons with high-frequency synonymous codons while preserving 100% of the amino acid sequence.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyOptimized}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent-600 hover:bg-accent-700 text-white transition shadow-sm"
              >
                {copiedOpt ? '✓ Copied DNA!' : '📋 Copy Optimized DNA'}
              </button>
            </div>

            <textarea
              readOnly
              rows={3}
              value={analysis.optimizedDna}
              class="w-full p-2.5 font-mono text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 resize-y select-all"
            />
          </div>
        </div>
      }
      actions={<ActionBar onCopy={copySummary} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
