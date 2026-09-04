import { useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { SCIENCE } from './science';
import {
  AA_NAMES,
  PREFERRED_CODONS_ECOLI,
  cleanDna,
  extractOrfCodons,
  designFlexibleMutagenesis,
  FlexibleMutationDesignResult,
} from '@/core/mutagenesis';

interface State {
  mode: 'free' | 'codon';
  plasmidDna: string;
  targetPosition: number; // 1-indexed for user display
  replaceLength: number; // 0 for insertion, >0 for substitution/deletion
  replacementSeq: string; // sequence to insert or replace with
  selectedCodonIdx: number;
  targetAa: string;
  targetPrimerTm: number;
}

const DEMO_GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

const DEFAULTS: State = {
  mode: 'free',
  plasmidDna: DEMO_GFP,
  targetPosition: 193, // bp 193 corresponds to codon 65 (TCC -> S65)
  replaceLength: 3,
  replacementSeq: 'ACC', // Thr (S65T mutation)
  selectedCodonIdx: 64, // S65 (0-indexed 64)
  targetAa: 'T', // Thr
  targetPrimerTm: 62,
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono';

const QUICK_TAGS = [
  { label: '6xHis Tag', seq: 'CATCACCATCACCATCAC', desc: 'His-tag (18 bp)' },
  { label: 'FLAG Tag', seq: 'GACTACAAAGACGATGACGACAAG', desc: 'FLAG epitope (24 bp)' },
  { label: 'HA Tag', seq: 'TACCCATACGATGTTCCAGATTACGCT', desc: 'HA epitope (27 bp)' },
  { label: 'Stop Codon', seq: 'TAA', desc: 'Ochre stop codon (3 bp)' },
  { label: 'Ala (GCG)', seq: 'GCG', desc: 'Alanine scanning (3 bp)' },
];

import type { ToolProps } from '@/tools/registry';

export default function MutagenesisView(props?: ToolProps & { embedded?: boolean }) {
  const embedded = props?.embedded;
  const [stateSig, shareUrl] = useUrlState<State>('mutagenesis', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [copiedPrimerId, setCopiedPrimerId] = useState<string | null>(null);

  // Extract codons from current sequence
  const codons = useMemo(() => {
    return extractOrfCodons(s.plasmidDna);
  }, [s.plasmidDna]);

  const activeCodon = codons[s.selectedCodonIdx] || codons[0];

  // Desired mutant codon in codon mode
  const codonModeReplacement = useMemo(() => {
    return PREFERRED_CODONS_ECOLI[s.targetAa] || 'GCG';
  }, [s.targetAa]);

  // Design mutagenesis based on mode
  const result: FlexibleMutationDesignResult | null = useMemo(() => {
    const cleanP = cleanDna(s.plasmidDna);
    if (!cleanP) return null;

    try {
      if (s.mode === 'codon') {
        if (!activeCodon) return null;
        return designFlexibleMutagenesis(
          cleanP,
          activeCodon.startBp,
          3,
          codonModeReplacement,
          s.targetPrimerTm
        );
      } else {
        const start0 = Math.max(0, Math.min(cleanP.length - 1, (s.targetPosition || 1) - 1));
        return designFlexibleMutagenesis(
          cleanP,
          start0,
          Math.max(0, s.replaceLength || 0),
          s.replacementSeq || '',
          s.targetPrimerTm
        );
      }
    } catch {
      return null;
    }
  }, [s.mode, s.plasmidDna, s.targetPosition, s.replaceLength, s.replacementSeq, activeCodon, codonModeReplacement, s.targetPrimerTm]);

  function handleCopyText(key: string, text: string) {
    navigator.clipboard?.writeText?.(text);
    setCopiedPrimerId(key);
    setTimeout(() => setCopiedPrimerId(null), 2000);
  }

  // IDT bulk ordering CSV
  const idtBulkOrderCsv = useMemo(() => {
    if (!result) return '';
    return [
      'Name,Sequence,Scale,Purification',
      `${result.forwardPrimer.name},${result.forwardPrimer.sequence},25nm,STD`,
      `${result.reversePrimer.name},${result.reversePrimer.sequence},25nm,STD`,
    ].join('\n');
  }, [result]);

  const copySummary = () => {
    if (!result) return '';
    const lines = [
      `Mutagenesis Primer Design: ${result.forwardPrimer.name}`,
      `Type: ${result.mutationType.toUpperCase()} at nucleotide position ${result.targetBpStart + 1}`,
      `Original: "${result.replacedSequence || '(none)'}" -> Replacement: "${result.replacementSequence || '(deletion)'}"`,
      `Recommended Q5 PCR Ta: ${result.recommendedTa}°C`,
      '',
      'Primers for Ordering (IDT Format):',
      idtBulkOrderCsv,
      '',
      'PCR Conditions (Q5 Hot Start):',
      `  ${result.pcrProgram.initialDenat}`,
      `  ${result.pcrProgram.cycling}`,
      `  ${result.pcrProgram.finalExt}`,
      `  ${result.pcrProgram.kldTreatment}`,
    ];
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="🎯"
      title="Site-Directed Mutagenesis Designer"
      blurb="Design non-overlapping back-to-back primers for Q5 whole-plasmid PCR and KLD circularization with full sequence freedom (substitutions, insertions, deletions)."
      wide={true}
      embedded={embedded}
      inputs={
        <div class="space-y-4">
          {/* Mode Switcher */}
          <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => set({ mode: 'free' })}
              class={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition ${
                s.mode === 'free'
                  ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Sequence Freedom (Any Pos / Length)
            </button>
            <button
              type="button"
              onClick={() => set({ mode: 'codon' })}
              class={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition ${
                s.mode === 'codon'
                  ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Point Mutation (Codon Picker)
            </button>
          </div>

          {/* Plasmid DNA Input */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Plasmid / Template Sequence (5' to 3')
              </label>
              <span class="text-[11px] text-slate-500 font-mono">
                {cleanDna(s.plasmidDna).length} bp
              </span>
            </div>
            <textarea
              rows={4}
              value={s.plasmidDna}
              onInput={(e) => set({ plasmidDna: (e.target as HTMLTextAreaElement).value })}
              placeholder="Paste template plasmid or insert sequence (5' to 3')..."
              class={FIELD}
            />
          </div>

          {/* Free Sequence Freedom Controls */}
          {s.mode === 'free' ? (
            <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Target Coordinates &amp; Desired Sequence
                </label>
                <span class="text-[11px] text-accent-600 dark:text-accent-400 font-semibold">
                  {s.replaceLength === 0
                    ? 'Insertion Mode'
                    : !s.replacementSeq
                    ? 'Deletion Mode'
                    : 'Substitution Mode'}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-slate-500 mb-1 font-medium">
                    Start Position (bp, 1-indexed)
                  </label>
                  <DecimalInput
                    class={FIELD}
                    value={s.targetPosition}
                    onChange={(pos) => set({ targetPosition: Math.max(1, Math.round(pos)) })}
                    min={1}
                    max={cleanDna(s.plasmidDna).length || 1}
                    step={1}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1 font-medium">
                    Length to Replace (bp)
                  </label>
                  <DecimalInput
                    class={FIELD}
                    value={s.replaceLength}
                    onChange={(len) => set({ replaceLength: Math.max(0, Math.round(len)) })}
                    min={0}
                    max={1000}
                    step={1}
                  />
                  <span class="text-[10px] text-slate-400 block mt-0.5">
                    0 = Insert without deleting
                  </span>
                </div>
              </div>

              {/* Show original sequence being replaced */}
              {s.replaceLength > 0 && (
                <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs">
                  <span class="text-amber-700 dark:text-amber-300 font-semibold block">Target sequence to replace/delete:</span>
                  <span class="font-mono text-amber-900 dark:text-amber-200 break-all font-bold">
                    {cleanDna(s.plasmidDna).slice(
                      Math.max(0, (s.targetPosition || 1) - 1),
                      Math.max(0, (s.targetPosition || 1) - 1) + (s.replaceLength || 0)
                    ) || '(out of bounds)'}
                  </span>
                </div>
              )}

              {/* Replacement sequence input */}
              <div class="space-y-1">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Replacement / Insert DNA Sequence
                </label>
                <input
                  type="text"
                  value={s.replacementSeq}
                  onInput={(e) => set({ replacementSeq: (e.target as HTMLInputElement).value.toUpperCase() })}
                  placeholder="Enter mutant sequence, tag, or leave blank for deletion..."
                  class={FIELD}
                />
                <span class="text-[10px] text-slate-500">
                  {s.replacementSeq.length > 0 ? `${cleanDna(s.replacementSeq).length} bp sequence` : 'Empty = Clean Deletion'}
                </span>
              </div>

              {/* Quick Tag Insert Buttons */}
              <div>
                <label class="block text-[11px] text-slate-400 mb-1 font-medium">Quick Insert Presets:</label>
                <div class="flex flex-wrap gap-1.5">
                  {QUICK_TAGS.map(tag => (
                    <button
                      key={tag.label}
                      type="button"
                      onClick={() => set({ replacementSeq: tag.seq, replaceLength: 0 })}
                      class="px-2 py-1 text-[11px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      title={tag.desc}
                    >
                      + {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Codon Mode Controls */
            <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Target Codon to Mutate
                </label>
                {activeCodon && (
                  <span class="text-xs font-mono font-bold text-accent-600 dark:text-accent-400">
                    {activeCodon.wtAa}{activeCodon.aaPos} ({activeCodon.wtCodon})
                  </span>
                )}
              </div>

              <select
                value={s.selectedCodonIdx}
                onChange={(e) => set({ selectedCodonIdx: parseInt((e.target as HTMLSelectElement).value) || 0 })}
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
              >
                {codons.map(c => (
                  <option key={c.index} value={c.index}>
                    Pos {c.aaPos}: {c.wtAa} ({c.wtCodon}) - nt {c.startBp + 1}
                  </option>
                ))}
              </select>

              <div class="pt-2 space-y-2">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Desired Mutation (Replacement Amino Acid)
                </label>
                <select
                  value={s.targetAa}
                  onChange={(e) => set({ targetAa: (e.target as HTMLSelectElement).value })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
                >
                  {Object.entries(AA_NAMES).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name} ({PREFERRED_CODONS_ECOLI[code]})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Primer Anneal Tm Setting */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-1">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Target Annealing Tm (°C)
            </label>
            <DecimalInput
              class={FIELD}
              value={s.targetPrimerTm}
              onChange={tm => set({ targetPrimerTm: Math.round(tm) })}
              min={52}
              max={72}
              step={1}
            />
            <span class="text-[10px] text-slate-500">
              Optimal annealing region Tm for Q5 High-Fidelity DNA Polymerase (default 62°C)
            </span>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {result && (
            <>
              {/* Mutation Summary Banner */}
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Engineered Mutation ({result.mutationType})
                    </span>
                    <div class="text-2xl font-black text-accent-600 dark:text-accent-400 font-mono mt-0.5">
                      {result.forwardPrimer.name.replace('Fwd_', '')}
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="text-xs text-slate-400 block">Recommended Q5 PCR Ta</span>
                    <span class="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {result.recommendedTa}°C
                    </span>
                  </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Target Position</span>
                    <span class="text-base font-bold font-mono text-slate-700 dark:text-slate-300">
                      bp {result.targetBpStart + 1}
                    </span>
                    <span class="text-[10px] text-slate-400 block">
                      {result.replacedSequence.length > 0 ? `Length: ${result.replacedSequence.length} bp` : 'Insertion point'}
                    </span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Replaced / Deleted</span>
                    <span class="text-base font-bold font-mono text-rose-600 dark:text-rose-400 truncate block">
                      {result.replacedSequence || '(none)'}
                    </span>
                    <span class="text-[10px] text-slate-400 block">Original segment</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Replacement Sequence</span>
                    <span class="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 truncate block">
                      {result.replacementSequence || '(deletion)'}
                    </span>
                    <span class="text-[10px] text-slate-400 block">
                      {result.replacementSequence.length > 0 ? `+${result.replacementSequence.length} bp` : '0 bp inserted'}
                    </span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Primer Alignment</span>
                    <span class="text-xs font-bold text-sky-600 dark:text-sky-400">Back-to-Back</span>
                    <span class="text-[10px] text-slate-400 block">Non-overlapping (Q5)</span>
                  </div>
                </div>
              </div>

              {/* Primers for Ordering */}
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Non-Overlapping Primers for Whole-Plasmid PCR
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleCopyText('both', `${result.forwardPrimer.name}\t${result.forwardPrimer.sequence}\n${result.reversePrimer.name}\t${result.reversePrimer.sequence}`)}
                    class="px-3 py-1 text-xs font-semibold rounded-lg bg-accent-600 hover:bg-accent-700 text-white transition shadow-sm"
                  >
                    {copiedPrimerId === 'both' ? '✓ Copied Both!' : '📋 Copy Both Primers'}
                  </button>
                </div>

                {/* Forward Primer */}
                <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-xs space-y-2">
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <strong class="font-bold text-slate-900 dark:text-slate-100">Forward Primer (5' Mutation)</strong>
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                        FWD
                      </span>
                      <span class="text-slate-400 font-mono">({result.forwardPrimer.length} nt, {result.forwardPrimer.gc}% GC)</span>
                    </div>
                    <div class="flex items-center gap-3 font-mono">
                      <span>Anneal Tm: <strong>{result.forwardPrimer.tm}°C</strong></span>
                      <button
                        type="button"
                        onClick={() => handleCopyText('fwd', result.forwardPrimer.sequence)}
                        class="text-accent-600 hover:underline font-semibold"
                      >
                        {copiedPrimerId === 'fwd' ? '✓ Copied!' : 'Copy Seq'}
                      </button>
                    </div>
                  </div>

                  <div class="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs break-all leading-relaxed select-all">
                    {result.forwardPrimer.mutationOffsetFrom5Prime > 0 && (
                      <span class="px-1 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-900 mr-0.5" title="Mutant / Insertion sequence at 5' terminus">
                        {result.forwardPrimer.sequence.slice(0, result.forwardPrimer.mutationOffsetFrom5Prime)}
                      </span>
                    )}
                    <span class="text-slate-800 dark:text-slate-200" title="Downstream plasmid annealing sequence">
                      {result.forwardPrimer.sequence.slice(result.forwardPrimer.mutationOffsetFrom5Prime)}
                    </span>
                  </div>
                </div>

                {/* Reverse Primer */}
                <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-xs space-y-2">
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <strong class="font-bold text-slate-900 dark:text-slate-100">Reverse Primer (Adjacent 5')</strong>
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                        REV
                      </span>
                      <span class="text-slate-400 font-mono">({result.reversePrimer.length} nt, {result.reversePrimer.gc}% GC)</span>
                    </div>
                    <div class="flex items-center gap-3 font-mono">
                      <span>Anneal Tm: <strong>{result.reversePrimer.tm}°C</strong></span>
                      <button
                        type="button"
                        onClick={() => handleCopyText('rev', result.reversePrimer.sequence)}
                        class="text-accent-600 hover:underline font-semibold"
                      >
                        {copiedPrimerId === 'rev' ? '✓ Copied!' : 'Copy Seq'}
                      </button>
                    </div>
                  </div>

                  <div class="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs break-all leading-relaxed select-all text-slate-800 dark:text-slate-200">
                    {result.reversePrimer.sequence}
                  </div>
                </div>
              </div>

              {/* IDT Compatible Bulk Ordering Window */}
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                      IDT Bulk Order Format (CSV / TSV)
                    </h3>
                    <p class="text-xs text-slate-500">
                      Copy and paste directly into Integrated DNA Technologies (IDT) Bulk Oligo Entry.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText('idt', idtBulkOrderCsv)}
                    class="px-3 py-1 text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition"
                  >
                    {copiedPrimerId === 'idt' ? '✓ Copied IDT Format!' : '📋 Copy IDT CSV'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  readOnly
                  value={idtBulkOrderCsv}
                  class="w-full font-mono text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 select-all text-slate-700 dark:text-slate-300"
                />
              </div>

              {/* PCR & KLD Protocol Card */}
              <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Recommended Q5 PCR &amp; KLD Protocol
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                    <strong class="text-slate-700 dark:text-slate-300 block">PCR Thermocycling (Q5 Hot Start)</strong>
                    <p class="text-slate-600 dark:text-slate-400">1. {result.pcrProgram.initialDenat}</p>
                    <p class="text-slate-600 dark:text-slate-400">2. {result.pcrProgram.cycling}</p>
                    <p class="text-slate-600 dark:text-slate-400">3. {result.pcrProgram.finalExt}</p>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                    <strong class="text-slate-700 dark:text-slate-300 block">KLD Circularization &amp; DpnI Clean</strong>
                    <p class="text-slate-600 dark:text-slate-400">• Mix 1 µL PCR product + 5 µL 2X KLD Buffer + 1 µL 10X KLD Enzyme Mix + 3 µL H2O.</p>
                    <p class="text-slate-600 dark:text-slate-400">• Incubate at room temperature for 5 minutes.</p>
                    <p class="text-slate-600 dark:text-slate-400">• Transform 5 µL directly into competent E. coli cells.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      }
      actions={<ActionBar onCopy={copySummary} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
