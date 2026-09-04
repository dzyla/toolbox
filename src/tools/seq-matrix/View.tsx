import { useState, useMemo } from 'preact/hooks';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import {
  parseFastaSequences,
  computeSequenceMatrices,
  formatAsClustal,
  formatAsFasta,
  formatMatrixCsv,
  MSA_PRESETS,
  type MatrixMetric,
  type IdentityDenominator,
  type SequenceMatrixResult,
  type PairwiseComparison,
} from '@/core/msa';
import { type MatrixName } from '@/core/align/matrices';
import { SCIENCE } from './science';

interface State {
  fastaInput: string;
  presetId: string;
  metric: MatrixMetric;
  idDenominator: IdentityDenominator;
  matrixName: MatrixName;
  gapOpen: number;
  gapExtend: number;
  activeView: 'matrix' | 'msa' | 'tree';
  selectedPairKey: string; // "i_j"
}

const DEFAULT_PRESET = MSA_PRESETS[0]!;

const DEFAULTS: State = {
  fastaInput: DEFAULT_PRESET.fasta,
  presetId: DEFAULT_PRESET.id,
  metric: 'identity',
  idDenominator: 'alignment',
  matrixName: 'BLOSUM62',
  gapOpen: 10,
  gapExtend: 1,
  activeView: 'matrix',
  selectedPairKey: '0_1',
};

// Residue coloring for proteins (Jalview / Clustal palette)
function getResidueColor(res: string): { bg: string; text: string } {
  const r = res.toUpperCase();
  switch (r) {
    case 'A': case 'I': case 'L': case 'M': case 'F': case 'W': case 'V':
      return { bg: 'bg-amber-100 dark:bg-amber-950/80', text: 'text-amber-800 dark:text-amber-200' };
    case 'K': case 'R': case 'H':
      return { bg: 'bg-sky-100 dark:bg-sky-950/80', text: 'text-sky-800 dark:text-sky-200' };
    case 'D': case 'E':
      return { bg: 'bg-rose-100 dark:bg-rose-950/80', text: 'text-rose-800 dark:text-rose-200' };
    case 'N': case 'Q': case 'S': case 'T':
      return { bg: 'bg-emerald-100 dark:bg-emerald-950/80', text: 'text-emerald-800 dark:text-emerald-200' };
    case 'C':
      return { bg: 'bg-yellow-100 dark:bg-yellow-950/80', text: 'text-yellow-800 dark:text-yellow-200' };
    case 'G': case 'P':
      return { bg: 'bg-purple-100 dark:bg-purple-950/80', text: 'text-purple-800 dark:text-purple-200' };
    case 'Y':
      return { bg: 'bg-teal-100 dark:bg-teal-950/80', text: 'text-teal-800 dark:text-teal-200' };
    case '-':
      return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-400 dark:text-slate-500' };
    // DNA bases
    case 'T': case 'U':
      return { bg: 'bg-rose-100 dark:bg-rose-950/80', text: 'text-rose-800 dark:text-rose-200' };
    default:
      return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300' };
  }
}

// Heatmap tile background interpolation (emerald-cyan-indigo gradient)
function getHeatmapBg(val: number, metric: MatrixMetric): string {
  if (metric === 'distance') {
    // Distance: 0 is closest (green), 100 is furthest (slate/red)
    const d = Math.min(100, Math.max(0, val));
    if (d <= 20) return 'bg-emerald-600 text-white';
    if (d <= 40) return 'bg-emerald-500 text-white';
    if (d <= 60) return 'bg-amber-500 text-white';
    if (d <= 80) return 'bg-rose-500 text-white';
    return 'bg-rose-700 text-white';
  }

  if (metric === 'score') {
    return 'bg-sky-600 text-white';
  }

  // Identity or Similarity (%): 0 to 100
  const pct = Math.min(100, Math.max(0, val));
  if (pct >= 95) return 'bg-emerald-600 text-white font-bold';
  if (pct >= 80) return 'bg-emerald-500 text-white font-semibold';
  if (pct >= 65) return 'bg-teal-500 text-white';
  if (pct >= 50) return 'bg-sky-500 text-white';
  if (pct >= 35) return 'bg-sky-600/80 text-white';
  if (pct >= 20) return 'bg-indigo-600/70 text-white';
  return 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
}

export default function SeqMatrixView() {
  const [stateSig, shareUrl] = useUrlState<State>('seq-matrix', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number } | null>(null);

  // Parse input sequences
  const parsedSequences = useMemo(() => {
    return parseFastaSequences(s.fastaInput);
  }, [s.fastaInput]);

  // Compute matrices and MSA
  const matrixResult: SequenceMatrixResult | null = useMemo(() => {
    if (parsedSequences.length < 2) return null;
    return computeSequenceMatrices(parsedSequences, {
      matrixName: s.matrixName,
      gapOpen: s.gapOpen,
      gapExtend: s.gapExtend,
      metric: s.metric,
      identityDenominator: s.idDenominator,
    });
  }, [parsedSequences, s.matrixName, s.gapOpen, s.gapExtend, s.metric, s.idDenominator]);

  const activeComparison: PairwiseComparison | null = useMemo(() => {
    if (!matrixResult) return null;
    return matrixResult.comparisons[s.selectedPairKey] || null;
  }, [matrixResult, s.selectedPairKey]);

  function handlePresetChange(presetId: string) {
    const preset = MSA_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    set({
      presetId,
      fastaInput: preset.fasta,
      selectedPairKey: '0_1',
    });
  }

  function downloadText(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const copySummaryText = useMemo(() => {
    if (!matrixResult) return 'No sequence alignment computed.';
    const metricLabel = s.metric === 'similarity' ? '% Similarity' : s.metric === 'distance' ? 'Distance' : '% Identity';
    return [
      `Multiple Sequence Identity & Similarity Matrix (${matrixResult.sequences.length} sequences)`,
      `Average Identity: ${matrixResult.averageIdentityPct}%`,
      `Average Similarity: ${matrixResult.averageSimilarityPct}%`,
      `Aligned Columns: ${matrixResult.msa.columns}`,
      '',
      formatMatrixCsv(matrixResult.sequences, matrixResult.matrix, metricLabel),
      '',
      scienceText(SCIENCE),
    ].join('\n');
  }, [matrixResult, s.metric]);

  return (
    <ToolLayout
      icon="🧬"
      title="Sequence Identity Matrix & MSA"
      blurb="Multi-sequence identity and similarity matrix with interactive heatmap, Clustal MSA viewer, and consensus conservation."
      inputs={
        <div class="space-y-4">
          {/* Preset Picker */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Load Curated Preset
              </label>
              <span class="text-[11px] text-accent-600 dark:text-accent-400 font-medium">
                {parsedSequences.length} sequences
              </span>
            </div>
            <select
              data-testid="preset-select"
              value={s.presetId}
              onChange={(e) => handlePresetChange((e.target as HTMLSelectElement).value)}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {MSA_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* FASTA Input */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                FASTA Sequence Input
              </label>
              <button
                type="button"
                onClick={() => set({ fastaInput: '' })}
                class="text-[11px] text-slate-400 hover:text-rose-500 transition underline"
              >
                Clear
              </button>
            </div>
            <textarea
              rows={9}
              value={s.fastaInput}
              onInput={(e) => set({ fastaInput: (e.target as HTMLTextAreaElement).value, presetId: 'custom' })}
              placeholder=">Seq_1 Description&#10;MKTIIALSYIFCLVFA...&#10;>Seq_2 Description&#10;MKTIIALSYIFCLVFA..."
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 leading-relaxed"
            />
            <p class="text-[11px] text-slate-400">
              Paste 2 or more sequences in FASTA format (<code class="text-slate-500 font-mono">&gt;Header\nSequence</code>).
            </p>
          </div>

          {/* Matrix & Alignment Parameters */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
            <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Matrix Metric
            </label>
            <div class="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => set({ metric: 'identity' })}
                class={`py-1.5 px-2 text-xs font-semibold rounded-lg transition border ${s.metric === 'identity' ? 'bg-accent-600 text-white border-accent-600 shadow-2xs' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}
              >
                % Identity (PID)
              </button>
              <button
                type="button"
                onClick={() => set({ metric: 'similarity' })}
                class={`py-1.5 px-2 text-xs font-semibold rounded-lg transition border ${s.metric === 'similarity' ? 'bg-accent-600 text-white border-accent-600 shadow-2xs' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}
              >
                % Similarity (Positives)
              </button>
              <button
                type="button"
                onClick={() => set({ metric: 'distance' })}
                class={`py-1.5 px-2 text-xs font-semibold rounded-lg transition border ${s.metric === 'distance' ? 'bg-accent-600 text-white border-accent-600 shadow-2xs' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}
              >
                Distance (1 - Id)
              </button>
              <button
                type="button"
                onClick={() => set({ metric: 'score' })}
                class={`py-1.5 px-2 text-xs font-semibold rounded-lg transition border ${s.metric === 'score' ? 'bg-accent-600 text-white border-accent-600 shadow-2xs' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}
              >
                Alignment Score
              </button>
            </div>

            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  PID Denominator
                </label>
                <select
                  value={s.idDenominator}
                  onChange={(e) => set({ idDenominator: (e.target as HTMLSelectElement).value as IdentityDenominator })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="alignment">Alignment Length (Standard EMBOSS / Clustal)</option>
                  <option value="shorter">Shorter Sequence Length (Truncation unpenalized)</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Scoring Matrix
                </label>
                <select
                  value={s.matrixName}
                  onChange={(e) => set({ matrixName: (e.target as HTMLSelectElement).value as MatrixName })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="BLOSUM62">BLOSUM62 (Standard Protein Homology)</option>
                  <option value="BLOSUM45">BLOSUM45 (Divergent Sequences)</option>
                  <option value="BLOSUM80">BLOSUM80 (Closely Related Sequences)</option>
                  <option value="PAM250">PAM250 (Evolutionary Distance)</option>
                  <option value="DNA-simple">DNA Identity (+2 / -1)</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[11px] font-medium text-slate-500 mb-1">
                    Gap Open
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={s.gapOpen}
                    onInput={(e) => set({ gapOpen: parseInt((e.target as HTMLInputElement).value) || 10 })}
                    class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label class="block text-[11px] font-medium text-slate-500 mb-1">
                    Gap Extend
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={s.gapExtend}
                    onInput={(e) => set({ gapExtend: parseInt((e.target as HTMLInputElement).value) || 1 })}
                    class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      }
      wide={true}
      science={<SciencePanel science={SCIENCE} />}
      actions={
        <ActionBar
          onCopy={() => copySummaryText}
          shareUrl={shareUrl}
        />
      }
      results={
        <div class="space-y-6">
        {/* Error state if < 2 sequences */}
        {parsedSequences.length < 2 && (
          <div class="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
            <h3 class="font-bold text-sm mb-1">⚠️ Minimum 2 Sequences Required</h3>
            <p class="text-xs">
              Please provide at least two sequences in the FASTA input or pick a preset from the sidebar to calculate the identity and similarity matrix.
            </p>
          </div>
        )}

        {matrixResult && (
          <>
            {/* Top Summary Stats Bar */}
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
                <span class="text-xs text-slate-500 font-medium">Sequences</span>
                <p class="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                  {matrixResult.sequences.length}
                </p>
                <span class="text-[11px] text-slate-400 capitalize">
                  {matrixResult.molType}
                </span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
                <span class="text-xs text-slate-500 font-medium">Mean Pairwise Identity</span>
                <p class="text-xl font-extrabold text-accent-600 dark:text-accent-400 mt-1">
                  {matrixResult.averageIdentityPct}%
                </p>
                <span class="text-[11px] text-slate-400">
                  Sim: {matrixResult.averageSimilarityPct}%
                </span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
                <span class="text-xs text-slate-500 font-medium">Closest Homology Pair</span>
                <p class="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                  {matrixResult.maxIdentityPair?.pct}%
                </p>
                <span class="text-[11px] text-slate-400 truncate block">
                  {matrixResult.maxIdentityPair?.name1} ↔ {matrixResult.maxIdentityPair?.name2}
                </span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
                <span class="text-xs text-slate-500 font-medium">Most Divergent Pair</span>
                <p class="text-base font-bold text-amber-600 dark:text-amber-400 mt-1 truncate">
                  {matrixResult.minIdentityPair?.pct}%
                </p>
                <span class="text-[11px] text-slate-400 truncate block">
                  {matrixResult.minIdentityPair?.name1} ↔ {matrixResult.minIdentityPair?.name2}
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() => set({ activeView: 'matrix' })}
                  class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${s.activeView === 'matrix' ? 'bg-accent-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                >
                  📊 Heatmap Matrix
                </button>
                <button
                  type="button"
                  onClick={() => set({ activeView: 'msa' })}
                  class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${s.activeView === 'msa' ? 'bg-accent-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                >
                  🧬 Multiple Alignment (MSA)
                </button>
                <button
                  type="button"
                  onClick={() => set({ activeView: 'tree' })}
                  class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${s.activeView === 'tree' ? 'bg-accent-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                >
                  🌳 Distance Hierarchy
                </button>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadText(formatMatrixCsv(matrixResult.sequences, matrixResult.matrix, s.metric), 'sequence_matrix.csv', 'text/csv')}
                  class="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Export Matrix as CSV"
                >
                  💾 CSV
                </button>
                <button
                  type="button"
                  onClick={() => downloadText(formatAsClustal(matrixResult.msa), 'alignment.aln', 'text/plain')}
                  class="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Export Clustal Alignment"
                >
                  💾 Clustal (.aln)
                </button>
                <button
                  type="button"
                  onClick={() => downloadText(formatAsFasta(matrixResult.msa), 'alignment.fasta', 'text/plain')}
                  class="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Export Aligned FASTA"
                >
                  💾 FASTA
                </button>
              </div>
            </div>

            {/* TAB 1: Heatmap Matrix */}
            {s.activeView === 'matrix' && (
              <div class="space-y-4">
                <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs overflow-hidden">
                  <div class="flex items-center justify-between mb-4">
                    <div>
                      <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {s.metric === 'similarity'
                          ? 'Sequence Similarity Matrix (Positives %)'
                          : s.metric === 'distance'
                          ? 'Pairwise Distance Matrix (1 - PID)'
                          : s.metric === 'score'
                          ? 'Pairwise Alignment Score Matrix'
                          : 'Percent Identity Matrix (PIM)'}
                      </h3>
                      <p class="text-xs text-slate-500 mt-0.5">
                        Click any cell to inspect the pairwise alignment and alignment stats below.
                      </p>
                    </div>

                    {/* Color Legend */}
                    <div class="hidden sm:flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                      <span>Low</span>
                      <span class="w-3.5 h-3.5 rounded bg-slate-200 dark:bg-slate-800"></span>
                      <span class="w-3.5 h-3.5 rounded bg-indigo-600/70"></span>
                      <span class="w-3.5 h-3.5 rounded bg-sky-500"></span>
                      <span class="w-3.5 h-3.5 rounded bg-teal-500"></span>
                      <span class="w-3.5 h-3.5 rounded bg-emerald-600"></span>
                      <span>100%</span>
                    </div>
                  </div>

                  {/* Scrollable Matrix Table */}
                  <div class="overflow-x-auto pb-2">
                    <table class="border-collapse select-none text-xs">
                      <thead>
                        <tr>
                          <th class="p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left font-bold text-slate-500 min-w-[120px]">
                            Sequence
                          </th>
                          {matrixResult.sequences.map((seq) => (
                            <th
                              key={seq.id}
                              class="p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-bold text-slate-700 dark:text-slate-300 min-w-[80px] text-center"
                              title={`${seq.name} (${seq.sequence.length} bp/aa)`}
                            >
                              <div class="truncate max-w-[90px] mx-auto">
                                {seq.name}
                              </div>
                              <span class="text-[10px] text-slate-400 font-normal">
                                {seq.sequence.length}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixResult.sequences.map((rowSeq, i) => (
                          <tr key={rowSeq.id}>
                            <td class="p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[130px]">
                              {rowSeq.name}
                            </td>
                            {matrixResult.sequences.map((colSeq, j) => {
                              const val = matrixResult.matrix[i]![j]!;
                              const isSelf = i === j;
                              const isSelected = (s.selectedPairKey === `${i}_${j}` || s.selectedPairKey === `${j}_${i}`);
                              const isHovered = (hoveredCell?.i === i && hoveredCell?.j === j) || (hoveredCell?.i === j && hoveredCell?.j === i);
                              const bgClass = isSelf
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold'
                                : getHeatmapBg(val, s.metric);

                              return (
                                <td
                                  key={colSeq.id}
                                  onClick={() => set({ selectedPairKey: `${i}_${j}` })}
                                  onMouseEnter={() => setHoveredCell({ i, j })}
                                  onMouseLeave={() => setHoveredCell(null)}
                                  class={`p-2 border text-center transition-all cursor-pointer ${bgClass} ${
                                    isSelected
                                      ? 'ring-2 ring-accent-500 ring-offset-1 z-10 font-extrabold scale-105 shadow-md'
                                      : isHovered
                                      ? 'brightness-110 ring-1 ring-slate-400'
                                      : 'border-slate-200 dark:border-slate-800'
                                  }`}
                                  title={`${rowSeq.name} vs ${colSeq.name}: ${val}${s.metric === 'score' ? '' : '%'}`}
                                >
                                  {s.metric === 'score' ? val : `${val.toFixed(1)}%`}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pairwise Inspection Card */}
                {activeComparison && (
                  <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs space-y-4">
                    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <h4 class="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <span>Pairwise Alignment:</span>
                          <span class="text-accent-600 dark:text-accent-400">{activeComparison.name1}</span>
                          <span class="text-slate-400">↔</span>
                          <span class="text-accent-600 dark:text-accent-400">{activeComparison.name2}</span>
                        </h4>
                        <p class="text-xs text-slate-500 mt-0.5">
                          {activeComparison.len1} vs {activeComparison.len2} residues · Alignment length {activeComparison.alignmentLength} cols
                        </p>
                      </div>

                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const pairwiseTxt = [
                              `# Pairwise Alignment: ${activeComparison.name1} vs ${activeComparison.name2}`,
                              `# Identity: ${activeComparison.identityPct}% (${activeComparison.identityCount}/${activeComparison.alignmentLength})`,
                              `# Similarity: ${activeComparison.similarityPct}% (${activeComparison.similarityCount}/${activeComparison.alignmentLength})`,
                              `# Score: ${activeComparison.score}`,
                              `> ${activeComparison.name1}`,
                              activeComparison.aligned1,
                              `> ${activeComparison.name2}`,
                              activeComparison.aligned2,
                            ].join('\n');
                            navigator.clipboard.writeText(pairwiseTxt);
                          }}
                          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-600 hover:bg-accent-700 text-white transition shadow-2xs"
                        >
                          📋 Copy Pairwise Alignment
                        </button>
                      </div>
                    </div>

                    {/* Stats pills */}
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                        <span class="text-slate-500 block text-[11px]">Identity</span>
                        <strong class="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                          {activeComparison.identityPct}%
                        </strong>
                        <span class="text-[10px] text-slate-400 block">
                          {activeComparison.identityCount} / {activeComparison.alignmentLength}
                        </span>
                      </div>

                      <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                        <span class="text-slate-500 block text-[11px]">Similarity</span>
                        <strong class="text-sky-600 dark:text-sky-400 font-bold text-sm">
                          {activeComparison.similarityPct}%
                        </strong>
                        <span class="text-[10px] text-slate-400 block">
                          {activeComparison.similarityCount} / {activeComparison.alignmentLength}
                        </span>
                      </div>

                      <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                        <span class="text-slate-500 block text-[11px]">Gaps</span>
                        <strong class="text-amber-600 dark:text-amber-400 font-bold text-sm">
                          {activeComparison.gapPct}%
                        </strong>
                        <span class="text-[10px] text-slate-400 block">
                          {activeComparison.gapCount} gaps
                        </span>
                      </div>

                      <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                        <span class="text-slate-500 block text-[11px]">Score</span>
                        <strong class="text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                          {activeComparison.score}
                        </strong>
                        <span class="text-[10px] text-slate-400 block">
                          {s.matrixName}
                        </span>
                      </div>
                    </div>

                    {/* Pairwise Alignment Viewer */}
                    <div class="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-200 space-y-1">
                      <div class="flex items-center gap-3 text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                        <span class="w-24 truncate">{activeComparison.name1}</span>
                        <span class="flex-1 tracking-widest whitespace-pre overflow-x-auto text-emerald-400">
                          {activeComparison.aligned1}
                        </span>
                      </div>
                      <div class="flex items-center gap-3 text-slate-500 text-[11px]">
                        <span class="w-24 text-right pr-2">Match:</span>
                        <span class="flex-1 tracking-widest whitespace-pre overflow-x-auto font-bold text-sky-400">
                          {activeComparison.midline}
                        </span>
                      </div>
                      <div class="flex items-center gap-3 text-slate-400 text-[11px] pt-1 border-t border-slate-800">
                        <span class="w-24 truncate">{activeComparison.name2}</span>
                        <span class="flex-1 tracking-widest whitespace-pre overflow-x-auto text-emerald-400">
                          {activeComparison.aligned2}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Multiple Sequence Alignment (MSA) */}
            {s.activeView === 'msa' && (
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Progressive Multiple Sequence Alignment (MSA)
                    </h3>
                    <p class="text-xs text-slate-500 mt-0.5">
                      {matrixResult.msa.columns} columns · Clustal-colored amino acids · Conservation score histogram
                    </p>
                  </div>

                  <div class="flex items-center gap-3 text-[11px]">
                    <span class="flex items-center gap-1 font-mono">
                      <strong class="text-emerald-600 dark:text-emerald-400">*</strong> Identical
                    </span>
                    <span class="flex items-center gap-1 font-mono">
                      <strong class="text-sky-600 dark:text-sky-400">:</strong> Strong
                    </span>
                    <span class="flex items-center gap-1 font-mono">
                      <strong class="text-slate-400">.</strong> Weak
                    </span>
                  </div>
                </div>

                {/* MSA Sequence Grid */}
                <div class="overflow-x-auto pb-4">
                  <div class="inline-block min-w-full font-mono text-xs select-none">
                    {/* Position Ruler */}
                    <div class="flex items-center text-[10px] text-slate-400 pb-1">
                      <div class="w-32 flex-shrink-0"></div>
                      <div class="flex">
                        {Array.from({ length: Math.ceil(matrixResult.msa.columns / 10) }).map((_, idx) => (
                          <div key={idx} class="w-[180px] flex-shrink-0 text-left border-l border-slate-300 dark:border-slate-700 pl-1">
                            {idx * 10 + 1}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Aligned Sequences */}
                    {matrixResult.msa.alignedSequences.map((seq) => (
                      <div key={seq.id} class="flex items-center py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded">
                        <div class="w-32 flex-shrink-0 font-semibold text-slate-700 dark:text-slate-300 truncate pr-2" title={seq.name}>
                          {seq.name}
                        </div>
                        <div class="flex font-mono">
                          {Array.from(seq.aligned).map((res, cIdx) => {
                            const color = getResidueColor(res);
                            return (
                              <span
                                key={cIdx}
                                class={`w-[18px] h-[20px] flex items-center justify-center font-bold text-[11px] ${color.bg} ${color.text} border-r border-white/20 dark:border-black/20`}
                                title={`Col ${cIdx + 1}: ${res}`}
                              >
                                {res}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Conservation Histogram Bars */}
                    <div class="flex items-end pt-2 mt-2 border-t border-slate-200 dark:border-slate-800">
                      <div class="w-32 flex-shrink-0 text-[10px] text-slate-400 font-sans">
                        Conservation
                      </div>
                      <div class="flex items-end h-8">
                        {matrixResult.msa.consensusScores.map((score, cIdx) => {
                          const heightPct = Math.round(score * 100);
                          const barColor = heightPct === 100
                            ? 'bg-emerald-500'
                            : heightPct >= 70
                            ? 'bg-sky-500'
                            : heightPct >= 40
                            ? 'bg-amber-500'
                            : 'bg-slate-300 dark:bg-slate-700';

                          return (
                            <div
                              key={cIdx}
                              class="w-[18px] h-full flex items-end justify-center border-r border-transparent"
                              title={`Col ${cIdx + 1}: ${(score * 100).toFixed(0)}% conservation`}
                            >
                              <div
                                style={{ height: `${Math.max(4, heightPct)}%` }}
                                class={`w-[12px] rounded-t-xs ${barColor}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Consensus Symbol Row */}
                    <div class="flex items-center text-accent-600 dark:text-accent-400 font-bold pt-1">
                      <div class="w-32 flex-shrink-0 text-[11px] text-slate-500 font-sans">
                        Clustal Symbols
                      </div>
                      <div class="flex">
                        {Array.from(matrixResult.msa.conservationSymbols).map((sym, cIdx) => (
                          <span
                            key={cIdx}
                            class="w-[18px] text-center font-bold text-xs"
                          >
                            {sym}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Consensus Sequence */}
                    <div class="flex items-center pt-1">
                      <div class="w-32 flex-shrink-0 text-[11px] text-slate-600 dark:text-slate-300 font-semibold font-sans">
                        Consensus
                      </div>
                      <div class="flex text-slate-800 dark:text-slate-100">
                        {Array.from(matrixResult.msa.consensus).map((ch, cIdx) => (
                          <span
                            key={cIdx}
                            class="w-[18px] text-center font-bold text-xs bg-slate-100 dark:bg-slate-800"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Distance Hierarchy */}
            {s.activeView === 'tree' && (
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-2xs space-y-4">
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Pairwise Distance Hierarchy
                  </h3>
                  <p class="text-xs text-slate-500 mt-0.5">
                    Pairwise evolutionary distances sorted from closest homolog to most divergent.
                  </p>
                </div>

                <div class="divide-y divide-slate-100 dark:divide-slate-800">
                  {Object.values(matrixResult.comparisons)
                    .filter((c, idx, arr) => arr.findIndex(x => (x.seq1Idx === c.seq2Idx && x.seq2Idx === c.seq1Idx)) >= idx)
                    .sort((a, b) => b.identityPct - a.identityPct)
                    .map((comp) => (
                      <div
                        key={`${comp.seq1Idx}_${comp.seq2Idx}`}
                        onClick={() => {
                          set({ selectedPairKey: `${comp.seq1Idx}_${comp.seq2Idx}`, activeView: 'matrix' });
                        }}
                        class="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-lg cursor-pointer transition"
                      >
                        <div class="flex items-center gap-3">
                          <span class="w-2.5 h-2.5 rounded-full bg-accent-500"></span>
                          <div>
                            <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {comp.name1} ↔ {comp.name2}
                            </span>
                            <span class="text-[11px] text-slate-400 block">
                              {comp.len1} vs {comp.len2} bp/aa · Score: {comp.score}
                            </span>
                          </div>
                        </div>

                        <div class="flex items-center gap-4 text-xs font-semibold">
                          <span class="text-emerald-600 dark:text-emerald-400">
                            {comp.identityPct}% Id
                          </span>
                          <span class="text-sky-600 dark:text-sky-400">
                            {comp.similarityPct}% Sim
                          </span>
                          <span class="text-slate-400 text-[11px]">
                            Dist: {(100 - comp.identityPct).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
        </div>
      }
    />
  );
}
