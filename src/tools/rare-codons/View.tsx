import { useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import {
  type HostOrganism,
  type ReadingFrame,
  HOST_NAMES,
  cleanDna,
  analyzeCodonUsage,
  getSequenceInFrame,
  autoDetectBestOrf,
  compareAllHosts,
} from '@/core/rare-codons';

interface State {
  codingDna: string;
  host: HostOrganism;
  frame: ReadingFrame;
}

const DEMO_HUMAN_PROTEIN = 'ATGCGAAGAAGGCGACGGATACTACCCCCTGGAGGAGAAATTCTAATACGGAGGAGGCGGACACCGCCGCCAGGTGGTCGACGACGGCGACGAATTTTTCTTTTTT';

const PUC19_BLA_GENE = 'TTACCAATGCTTAATCAGTGAGGCACCTATCTCAGCGATCTGTCTATTTCGTTCATCCATAGTTGCCTGACTCCCCGTCGTGTAGATAACTACGATACGGGAGGGCTTACCATCTGGCCCCAGTGCTGCAATGATACCGCGAGACCCACGCTCACCGGCTCCAGATTTATCAGCAATAAACCAGCCAGCCGGAAGGGCCGAGCGCAGAAGTGGTCCTGCAACTTTATCCGCCTCCATCCAGTCTATTAATTGTTGCCGGGAAGCTAGAGTAAGTAGTTCGCCAGTTAATAGTTTGCGCAACGTTGTTGCCATTGCTACAGGCATCGTGGTGTCACGCTCGTCGTTTGGTATGGCTTCATTCAGCTCCGGTTCCCAACGATCAAGGCGAGTTACATGATCCCCCATGTTGTGCAAAAAAGCGGTTAGCTCCTTCGGTCCTCCGATCGTTGTCAGAAGTAAGTTGGCCGCAGTGTTATCACTCATGGTTATGGCAGCACTGCATAATTCTCTTACTGTCATGCCATCCGTAAGATGCTTTTCTGTGACTGGTGAGTACTCAACCAAGTCATTCTGAGAATAGTGTATGCGGCGACCGAGTTGCTCTTGCCCGGCGTCAATACGGGATAATACCGCGCCACATAGCAGAACTTTAAAAGTGCTCATCATTGGAAAACGTTCTTCGGGGCGAAAACTCTCAAGGATCTTACCGCTGTTGAGATCCAGTTCGATGTAACCCACTCGTGCACCCAACTGATCTTCAGCATCTTTTACTTTCACCAGCGTTTCTGGGTGAGCAAAAACAGGAAGGCAAAATGCCGCAAAAAAGGGAATAAGGGCGACACGGAAATGTTGAATACTCAT';

const GFP_CODING_SEQ = 'ATGAGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTTAATGGGCACAAATTTTCTGTCAGTGGAGAGGGTGAAGGTGATGCAACATACGGAAAACTTACCCTTAAATTTATTTGCACTACTGGAAAACTACCTGTTCCATGGCCAACACTTGTCACTACTTTCTCTTATGGTGTTCAATGCTTTTCAAGATACCCAGATCATATGAAACAGCATGACTTTTTCAAGAGTGCCATGCCCGAAGGTTATGTACAGGAAAGAACTATATTTTTCAAAGATGACGGGAACTACAAGACACGTGCTGAAGTCAAGTTTGAAGGTGATACCCTTGTTAATAGAATCGAGTTAAAAGGTATTGATTTTAAAGAAGATGGAAACATTCTTGGACACAAATTGGAATACAACTATAACTCACACAATGTATACATCATGGCAGACAAACAAAAGAATGGAATCAAAGTTAACTTCAAAATTAGACACAACATTGAAGATGGAAGCGTTCAACTAGCAGACCATTATCAACAAAATACTCCAATTGGCGATGGCCCTGTCCTTTTACCAGACAACCATTACCTGTCCACACAATCTGCCCTTTCGAAAGATCCCAACGAAAAGAGAGACCACATGGTCCTTCTTGAGTTTGTAACAGCTGCTGGGATTACACATGGCATGGATGAACTATACAAATAA';

const DEFAULTS: State = {
  codingDna: DEMO_HUMAN_PROTEIN,
  host: 'ecoli',
  frame: 1,
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono';

export default function RareCodonsView() {
  const [stateSig, shareUrl] = useUrlState<State>('rare-codons', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [copiedOpt, setCopiedOpt] = useState(false);
  const [hoveredCodonIdx, setHoveredCodonIdx] = useState<number | null>(null);
  const [orfFeedback, setOrfFeedback] = useState<string | null>(null);

  const activeSequence = useMemo(() => {
    return getSequenceInFrame(s.codingDna, s.frame);
  }, [s.codingDna, s.frame]);

  const analysis = useMemo(() => {
    return analyzeCodonUsage(activeSequence, s.host);
  }, [activeSequence, s.host]);

  const multiHostComparison = useMemo(() => {
    return compareAllHosts(activeSequence);
  }, [activeSequence]);

  function handleAutoDetectOrf() {
    const detected = autoDetectBestOrf(s.codingDna);
    if (detected) {
      set({ frame: detected.frame });
      setOrfFeedback(`✓ Auto-detected ${detected.label}! Switched reading frame to ${detected.frame > 0 ? `+${detected.frame}` : detected.frame}.`);
    } else {
      setOrfFeedback('⚠️ No complete ORF (≥30 codons with start and stop) found in any frame.');
    }
    setTimeout(() => setOrfFeedback(null), 5000);
  }

  function handleCopyOptimized() {
    if (!analysis) return;
    navigator.clipboard?.writeText?.(analysis.optimizedDna);
    setCopiedOpt(true);
    setTimeout(() => setCopiedOpt(false), 2000);
  }

  const copySummary = () => {
    if (!analysis) return '';
    const lines = [
      `Rare Codon Analysis (${HOST_NAMES[s.host]} - Frame ${s.frame > 0 ? `+${s.frame}` : s.frame}):`,
      `Codons: ${analysis.totalCodons} | CAI: ${analysis.cai.toFixed(3)} | Optimal: ${analysis.optimalCodonPct}% | Rare: ${analysis.rareCodonPct}%`,
      `GC: ${analysis.overallGc}% | GC3: ${analysis.gc3}%`,
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
      blurb="Detect rare tRNA bottlenecks, ribosomal pause hotspots, and Codon Adaptation Index (CAI) across E. coli, Yeast, Insect (Sf9), and Human hosts with expression host recommendations."
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

          {/* Preset Sequences */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Load Example DNA Sequence
            </label>
            <div class="space-y-1.5">
              <button
                type="button"
                onClick={() => { set({ codingDna: DEMO_HUMAN_PROTEIN, frame: 1 }); }}
                class="w-full text-left p-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                🔬 Human Heterologous Protein (Severe E. coli tRNAs)
              </button>
              <button
                type="button"
                onClick={() => { set({ codingDna: PUC19_BLA_GENE, frame: 1 }); }}
                class="w-full text-left p-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                💊 pUC19 Ampicillin (*bla* gene on strand -1)
              </button>
              <button
                type="button"
                onClick={() => { set({ codingDna: GFP_CODING_SEQ, frame: 1 }); }}
                class="w-full text-left p-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                🧪 GFP (Aequorea victoria Wild-Type)
              </button>
            </div>
          </div>

          {/* DNA Input with Reading Frame Toggle & Auto-detect ORF */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Coding DNA Sequence
              </label>
              <span class="text-[11px] text-slate-500 font-mono">
                {cleanDna(s.codingDna).length} bp input ({analysis.totalCodons} codons in frame {s.frame > 0 ? `+${s.frame}` : s.frame})
              </span>
            </div>

            <textarea
              rows={6}
              value={s.codingDna}
              onInput={(e) => set({ codingDna: (e.target as HTMLTextAreaElement).value })}
              placeholder="Paste coding sequence or plasmid fragment..."
              class={FIELD}
            />

            {/* Reading Frame Selector */}
            <div class="space-y-1.5 pt-1">
              <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-slate-700 dark:text-slate-300">
                  Reading Frame:
                </span>
                <span class="text-[11px] text-slate-500 font-mono">
                  {s.frame > 0 ? `Forward Strand (+${s.frame})` : `Reverse Strand (${s.frame})`}
                </span>
              </div>
              <div class="grid grid-cols-6 gap-1">
                {([1, 2, 3, -1, -2, -3] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => set({ frame: f })}
                    class={`py-1.5 text-xs font-mono font-bold rounded-lg transition ${
                      s.frame === f
                        ? 'bg-accent-600 text-white shadow-sm'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {f > 0 ? `+${f}` : f}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-detect ORF Action */}
            <div class="pt-1">
              <button
                type="button"
                onClick={handleAutoDetectOrf}
                class="w-full py-2 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition flex items-center justify-center gap-1.5"
              >
                <span>⚡</span>
                <span>Auto-Detect Coding ORF (Find Frame &amp; Strand)</span>
              </button>
            </div>

            {orfFeedback && (
              <div class="p-2.5 rounded-lg text-xs bg-indigo-50 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
                {orfFeedback}
              </div>
            )}
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

            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Total Codons</span>
                <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                  {analysis.totalCodons}
                </span>
                <span class="text-[10px] text-slate-400 block mt-0.5">Frame {s.frame > 0 ? `+${s.frame}` : s.frame}</span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Optimal Codons</span>
                <span class="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {analysis.optimalCodonPct}%
                </span>
                <span class="text-[10px] text-slate-400 block mt-0.5">{analysis.optimalCodonCount} codons</span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Rare Codons</span>
                <span className={`text-base font-bold font-mono ${analysis.rareCodonCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {analysis.rareCodonPct}%
                </span>
                <span class="text-[10px] text-slate-400 block mt-0.5">{analysis.rareCodonCount} codons</span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Overall GC (GC3)</span>
                <span class="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                  {analysis.overallGc.toFixed(1)}% <span class="text-xs text-slate-400 font-normal">({analysis.gc3.toFixed(0)}%)</span>
                </span>
                <span class="text-[10px] text-slate-400 block mt-0.5">Wobble position</span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-400 block">Pause Hotspots</span>
                <span className={`text-base font-bold font-mono ${analysis.pauseClusters.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {analysis.pauseClusters.length} clusters
                </span>
                <span class="text-[10px] text-slate-400 block mt-0.5">{analysis.pauseClusters.length > 0 ? 'Stalling risk' : 'No clusters'}</span>
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

          {/* Multi-Host Cross-Platform Comparison Table */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div>
                <h3 class="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Cross-Platform Expression Comparison (All 4 Hosts)
                </h3>
                <p class="text-[11px] text-slate-500">
                  Evaluates this exact sequence across E. coli, Yeast, Human, and Insect hosts
                </p>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                    <th class="pb-2 font-semibold">Host Organism</th>
                    <th class="pb-2 font-semibold text-center">CAI</th>
                    <th class="pb-2 font-semibold text-center">% Optimal</th>
                    <th class="pb-2 font-semibold text-center">% Rare</th>
                    <th class="pb-2 font-semibold">Recommended Strain / Line</th>
                    <th class="pb-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  {multiHostComparison.map((m) => {
                    const isCurrent = m.host === s.host;
                    return (
                      <tr key={m.host} class={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${isCurrent ? 'bg-accent-50/50 dark:bg-accent-950/20 font-semibold' : ''}`}>
                        <td class="py-2.5">
                          <span class="text-slate-900 dark:text-slate-100">{m.hostName}</span>
                          {isCurrent && (
                            <span class="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-accent-100 text-accent-800 dark:bg-accent-900 dark:text-accent-200">
                              Active
                            </span>
                          )}
                        </td>
                        <td class="py-2.5 text-center font-mono font-bold">
                          <span className={`px-2 py-0.5 rounded text-[11px] ${m.cai >= 0.8 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : m.cai >= 0.65 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                            {m.cai.toFixed(3)}
                          </span>
                        </td>
                        <td class="py-2.5 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {m.optimalPct}%
                        </td>
                        <td class="py-2.5 text-center font-mono font-semibold">
                          <span className={m.rareCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}>
                            {m.rarePct}% ({m.rareCount})
                          </span>
                        </td>
                        <td class="py-2.5 text-slate-700 dark:text-slate-300">
                          {m.recommendedStrain}
                        </td>
                        <td class="py-2.5 text-right">
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => set({ host: m.host })}
                              class="px-2 py-1 text-[11px] font-semibold rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                            >
                              Select
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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

            {/* Codon Inspector Card (Fixed height to prevent GUI jumping on hover) */}
            <div class="min-h-[44px] p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/60 text-xs flex items-center">
              {hoveredCodonIdx !== null && analysis.evaluatedCodons[hoveredCodonIdx] ? (
                (() => {
                  const hc = analysis.evaluatedCodons[hoveredCodonIdx]!;
                  return (
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700 dark:text-slate-300">
                      <span>Residue: <strong class="font-mono">{hc.position} ({hc.aa})</strong></span>
                      <span>Codon: <strong class="font-mono">{hc.codon}</strong></span>
                      <span>Frequency: <strong class="font-mono">{hc.frequencyPerThousand}/1000</strong></span>
                      <span>Relative w: <strong class="font-mono">{hc.relativeAdaptiveness.toFixed(2)}</strong></span>
                      {hc.status === 'rare' ? (
                        <span>Optimal Alternative: <strong class="text-emerald-600 dark:text-emerald-400 font-bold font-mono">{hc.suggestedCodon}</strong></span>
                      ) : (
                        <span class="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Normal / Frequent Codon</span>
                      )}
                    </div>
                  );
                })()
              ) : (
                <span class="text-slate-400 dark:text-slate-500 italic text-[11px]">
                  Hover over any codon in the map above to inspect its tRNA frequency, relative adaptiveness (w), and optimal synonymous replacement.
                </span>
              )}
            </div>
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
