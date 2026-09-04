import { useState, useMemo, useRef } from 'preact/hooks';
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
  revComp,
  extractOrfCodons,
  designFlexibleMutagenesis,
  FlexibleMutationDesignResult,
  parseMutationList,
  generateMutatedSequence,
  designBatchMutations,
  BatchMutationResult,
} from '@/core/mutagenesis';
import { findORFs, reverseComplement, type ORF } from '@/core/plasmid';

interface State {
  mode: 'free' | 'codon' | 'list';
  constructName: string;
  plasmidDna: string;
  selectedOrfId: string;
  targetPosition: number; // 1-indexed for user display
  replaceLength: number; // 0 for insertion, >0 for substitution/deletion
  replacementSeq: string; // sequence to insert or replace with
  selectedCodonIdx: number;
  targetAa: string;
  targetPrimerTm: number;
  mutationListInput: string;
  activeListMutationIdx: number;
}

const DEMO_GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

const DEFAULTS: State = {
  mode: 'free',
  constructName: 'GFP',
  plasmidDna: DEMO_GFP,
  selectedOrfId: 'full',
  targetPosition: 193, // bp 193 corresponds to codon 65 (TCC -> S65)
  replaceLength: 3,
  replacementSeq: 'ACC', // Thr (S65T mutation)
  selectedCodonIdx: 64, // S65 (0-indexed 64)
  targetAa: 'T', // Thr
  targetPrimerTm: 62,
  mutationListInput: 'S65T, Y66H',
  activeListMutationIdx: 0,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect ORFs in template plasmid
  const detectedOrfs = useMemo<ORF[]>(() => {
    const cleanP = cleanDna(s.plasmidDna);
    if (cleanP.length < 60) return [];
    try {
      return findORFs(cleanP, 20, true);
    } catch {
      return [];
    }
  }, [s.plasmidDna]);

  const activeOrf = useMemo(() => {
    if (s.selectedOrfId === 'full') return null;
    return detectedOrfs.find(o => o.id === s.selectedOrfId) || null;
  }, [detectedOrfs, s.selectedOrfId]);

  // Extract codons from current sequence or selected ORF
  const codons = useMemo(() => {
    const cleanP = cleanDna(s.plasmidDna);
    if (!cleanP) return [];
    if (activeOrf) {
      if (activeOrf.strand === 1) {
        const orfSeq = cleanP.slice(activeOrf.start - 1, activeOrf.end);
        return extractOrfCodons(orfSeq, activeOrf.start - 1);
      } else {
        const orfDna = cleanP.slice(activeOrf.start - 1, activeOrf.end);
        const orfSeq = reverseComplement(orfDna);
        return extractOrfCodons(orfSeq, activeOrf.start - 1);
      }
    }
    return extractOrfCodons(cleanP);
  }, [s.plasmidDna, activeOrf]);

  const activeCodon = codons[s.selectedCodonIdx] || codons[0];

  // Parse mutation list
  const parsedMutations = useMemo(() => {
    return parseMutationList(s.mutationListInput);
  }, [s.mutationListInput]);

  const activeListMutation = parsedMutations[s.activeListMutationIdx] || parsedMutations[0] || null;

  // Desired mutant codon in codon mode
  const codonModeReplacement = useMemo(() => {
    return PREFERRED_CODONS_ECOLI[s.targetAa] || 'GCG';
  }, [s.targetAa]);

  // Batch mutation results for all mutations in list
  const batchResult = useMemo<BatchMutationResult | null>(() => {
    const cleanP = cleanDna(s.plasmidDna);
    if (!cleanP || !s.mutationListInput) return null;
    try {
      return designBatchMutations(cleanP, s.mutationListInput, {
        constructName: s.constructName || 'Target',
        orfStartBp: activeOrf ? activeOrf.start - 1 : 0,
        orfStrand: activeOrf ? activeOrf.strand : 1,
        orfEndBp: activeOrf ? activeOrf.end - 1 : undefined,
        targetPrimerTm: s.targetPrimerTm,
      });
    } catch {
      return null;
    }
  }, [s.plasmidDna, s.mutationListInput, s.constructName, activeOrf, s.targetPrimerTm]);

  // Design mutagenesis based on mode
  const result: FlexibleMutationDesignResult | null = useMemo(() => {
    const cleanP = cleanDna(s.plasmidDna);
    if (!cleanP) return null;

    const construct = s.constructName || 'Target';

    try {
      if (s.mode === 'codon') {
        if (!activeCodon) return null;
        const mutLabel = `${activeCodon.wtAa}${activeCodon.aaPos}${s.targetAa}`;
        return designFlexibleMutagenesis(
          cleanP,
          activeCodon.startBp,
          3,
          codonModeReplacement,
          s.targetPrimerTm,
          construct,
          mutLabel
        );
      } else if (s.mode === 'list') {
        if (!activeListMutation || !activeListMutation.valid) return null;
        const targetCodon = codons.find(c => c.aaPos === activeListMutation.position);
        if (!targetCodon) return null;
        const replCodon = PREFERRED_CODONS_ECOLI[activeListMutation.mutAa] || 'GCG';
        const mutLabel = `${activeListMutation.wtAa}${activeListMutation.position}${activeListMutation.mutAa}`;
        return designFlexibleMutagenesis(
          cleanP,
          targetCodon.startBp,
          3,
          replCodon,
          s.targetPrimerTm,
          construct,
          mutLabel
        );
      } else {
        const start0 = Math.max(0, Math.min(cleanP.length - 1, (s.targetPosition || 1) - 1));
        return designFlexibleMutagenesis(
          cleanP,
          start0,
          Math.max(0, s.replaceLength || 0),
          s.replacementSeq || '',
          s.targetPrimerTm,
          construct
        );
      }
    } catch {
      return null;
    }
  }, [s.mode, s.plasmidDna, s.constructName, s.targetPosition, s.replaceLength, s.replacementSeq, activeCodon, codonModeReplacement, activeListMutation, codons, s.targetPrimerTm, s.targetAa]);

  // Sequence & Translation preview comparing WT and mutant construct
  const preview = useMemo(() => {
    const cleanP = cleanDna(s.plasmidDna);
    if (!cleanP) return null;

    let start0 = Math.max(0, Math.min(cleanP.length - 1, (s.targetPosition || 1) - 1));
    let rLen = Math.max(0, s.replaceLength || 0);
    let rSeq = s.replacementSeq || '';

    if (s.mode === 'codon' && activeCodon) {
      start0 = activeCodon.startBp;
      rLen = 3;
      rSeq = codonModeReplacement;
    } else if (s.mode === 'list' && activeListMutation && activeListMutation.valid) {
      const c = codons.find(item => item.aaPos === activeListMutation.position);
      if (c) {
        start0 = c.startBp;
        rLen = 3;
        rSeq = PREFERRED_CODONS_ECOLI[activeListMutation.mutAa] || 'GCG';
      }
    }

    return generateMutatedSequence(cleanP, start0, rLen, rSeq);
  }, [s.plasmidDna, s.targetPosition, s.replaceLength, s.replacementSeq, s.mode, activeCodon, codonModeReplacement, activeListMutation, codons]);

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
          <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 gap-0.5">
            <button
              type="button"
              onClick={() => set({ mode: 'free' })}
              class={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-lg transition ${
                s.mode === 'free'
                  ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Sequence Freedom
            </button>
            <button
              type="button"
              onClick={() => set({ mode: 'codon' })}
              class={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-lg transition ${
                s.mode === 'codon'
                  ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Codon Picker
            </button>
            <button
              type="button"
              onClick={() => set({ mode: 'list' })}
              class={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-lg transition ${
                s.mode === 'list'
                  ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Mutation List
            </button>
          </div>

          {/* Construct Name & Sequence Upload */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between gap-2">
              <div class="flex-1">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Construct / Gene Name
                </label>
                <input
                  type="text"
                  value={s.constructName}
                  onInput={(e) => set({ constructName: (e.target as HTMLInputElement).value })}
                  placeholder="e.g. GFP, pUC19_bla..."
                  class={FIELD}
                />
              </div>
              <div class="pt-5">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".fasta,.fa,.dna,.gb,.gbk,.txt,.seq"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      const text = evt.target?.result as string;
                      if (!text) return;
                      const fastaHeader = text.match(/^>([^\r\n]+)/);
                      if (fastaHeader && fastaHeader[1]) {
                        const name = fastaHeader[1].trim().split(/[\s,]+/)[0] || 'Construct';
                        set({ constructName: name });
                      } else {
                        const baseName = file.name.replace(/\.[^/.]+$/, '');
                        set({ constructName: baseName });
                      }
                      const cleaned = cleanDna(text);
                      set({ plasmidDna: cleaned, selectedOrfId: 'full' });
                    };
                    reader.readAsText(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  class="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5"
                  title="Upload FASTA, GenBank, SnapGene, or text plasmid file"
                >
                  <span>📁</span>
                  <span>Upload</span>
                </button>
              </div>
            </div>

            {/* Plasmid DNA Input */}
            <div class="space-y-1">
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

            {/* ORF Selector */}
            {detectedOrfs.length > 0 && (
              <div class="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Target ORF / Coding Region
                  </label>
                  <span class="text-[10px] text-accent-600 dark:text-accent-400 font-mono">
                    {detectedOrfs.length} ORFs detected
                  </span>
                </div>
                <select
                  value={s.selectedOrfId}
                  onChange={(e) => set({ selectedOrfId: (e.target as HTMLSelectElement).value })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                >
                  <option value="full">Full Sequence (Direct coordinates)</option>
                  {detectedOrfs.map((orf, i) => (
                    <option key={orf.id} value={orf.id}>
                      ORF #{i + 1}: {orf.strand === 1 ? '+' : '-'} strand, bp {orf.start}–{orf.end} ({orf.lengthAa} aa / {orf.lengthBp} bp)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Controls based on active mode */}
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

              {/* Quick Tag Insert Presets */}
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
          ) : s.mode === 'list' ? (
            /* Mutation List Mode */
            <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Mutation List (e.g. A22Y, Y443H)
                </label>
                <span class="text-[11px] text-accent-600 dark:text-accent-400 font-semibold font-mono">
                  {parsedMutations.filter(m => m.valid).length} valid
                </span>
              </div>

              <input
                type="text"
                value={s.mutationListInput}
                onInput={(e) => set({ mutationListInput: (e.target as HTMLInputElement).value })}
                placeholder="Enter mutations: A22Y, Y443H, S65T..."
                class={FIELD}
              />
              <span class="text-[10px] text-slate-400 block">
                Standard residue mutation notation: [WT][ResidueNumber][MUT] separated by comma or space.
              </span>

              {/* Mutation chips selector */}
              {parsedMutations.length > 0 && (
                <div class="space-y-1.5 pt-1">
                  <span class="text-[11px] text-slate-500 font-medium block">Select Active Mutation:</span>
                  <div class="flex flex-wrap gap-1.5">
                    {parsedMutations.map((m, idx) => {
                      const isSelected = (s.activeListMutationIdx ?? 0) === idx;
                      const targetC = codons.find(c => c.aaPos === m.position);
                      const isMatch = targetC && targetC.wtAa === m.wtAa;

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            set({ activeListMutationIdx: idx });
                            if (targetC) {
                              set({
                                targetPosition: targetC.startBp + 1,
                                replaceLength: 3,
                                replacementSeq: PREFERRED_CODONS_ECOLI[m.mutAa] || 'GCG',
                              });
                            }
                          }}
                          class={`px-2.5 py-1 text-xs rounded-lg font-mono font-semibold transition border flex items-center gap-1 ${
                            isSelected
                              ? 'bg-accent-600 text-white border-accent-600 shadow-2xs'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>{m.raw}</span>
                          {!m.valid ? (
                            <span class="text-[10px] text-rose-500">✗</span>
                          ) : !targetC ? (
                            <span class="text-[10px] text-amber-500" title="Residue outside ORF bounds">⚠</span>
                          ) : !isMatch ? (
                            <span class="text-[10px] text-amber-500" title={`WT is ${targetC.wtAa}, not ${m.wtAa}`}>⚠</span>
                          ) : (
                            <span class="text-[10px] text-emerald-400">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
          {/* Batch Mutation Results Table */}
          {s.mode === 'list' && batchResult && batchResult.items.length > 0 && (
            <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>📋 Batch Mutagenesis Primers ({batchResult.items.filter(i => i.valid).length} Variants)</span>
                  </h3>
                  <p class="text-xs text-slate-500">
                    Non-overlapping back-to-back primers generated for all requested point mutations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyText('batch-idt', batchResult.idtBulkCsv)}
                  class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition shadow-sm flex items-center gap-1.5"
                >
                  <span>{copiedPrimerId === 'batch-idt' ? '✓ Copied IDT CSV!' : '📋 Copy All IDT CSV'}</span>
                </button>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th class="p-2 rounded-l-lg">Mutation</th>
                      <th class="p-2">Forward Primer (5'→3')</th>
                      <th class="p-2">Reverse Primer (5'→3')</th>
                      <th class="p-2">Ta</th>
                      <th class="p-2 rounded-r-lg text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    {batchResult.items.map((item, idx) => {
                      const isSelected = s.activeListMutationIdx === idx;
                      if (!item.valid) {
                        return (
                          <tr key={idx} class="text-rose-500">
                            <td class="p-2 font-mono font-bold">{item.raw}</td>
                            <td colSpan={4} class="p-2 italic">{item.error}</td>
                          </tr>
                        );
                      }
                      return (
                        <tr
                          key={idx}
                          class={`hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition ${isSelected ? 'bg-accent-50/60 dark:bg-accent-950/40' : ''}`}
                          onClick={() => set({ activeListMutationIdx: idx })}
                        >
                          <td class="p-2 font-mono font-bold text-accent-600 dark:text-accent-400 whitespace-nowrap">
                            {item.raw}
                          </td>
                          <td class="p-2 font-mono text-[11px]">
                            <div class="font-semibold text-slate-800 dark:text-slate-200">{item.fwdPrimerName}</div>
                            <div class="text-slate-500 truncate max-w-xs">{item.fwdPrimerSeq}</div>
                            <div class="text-[10px] text-slate-400">{item.fwdLen} nt · {item.fwdTm}°C · {item.fwdGc}% GC</div>
                          </td>
                          <td class="p-2 font-mono text-[11px]">
                            <div class="font-semibold text-slate-800 dark:text-slate-200">{item.revPrimerName}</div>
                            <div class="text-slate-500 truncate max-w-xs">{item.revPrimerSeq}</div>
                            <div class="text-[10px] text-slate-400">{item.revLen} nt · {item.revTm}°C · {item.revGc}% GC</div>
                          </td>
                          <td class="p-2 font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {item.recommendedTa}°C
                          </td>
                          <td class="p-2 text-right whitespace-nowrap space-x-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(`fwd-${idx}`, item.fwdPrimerSeq || '');
                              }}
                              class="px-2 py-0.5 text-[11px] rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                              title="Copy Forward Primer Sequence"
                            >
                              {copiedPrimerId === `fwd-${idx}` ? '✓' : 'Fwd'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(`rev-${idx}`, item.revPrimerSeq || '');
                              }}
                              class="px-2 py-0.5 text-[11px] rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                              title="Copy Reverse Primer Sequence"
                            >
                              {copiedPrimerId === `rev-${idx}` ? '✓' : 'Rev'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
                      {result.forwardPrimer.name.replace(/^[A-Za-z0-9_-]+_Fwd_|^Fwd_/, '')}
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

              {/* Sequence & Translation Mutation Preview */}
              {preview && (
                <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
                  <div class="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>🧬 Sequence &amp; Translation Mutation Preview</span>
                        <span class="text-xs px-2 py-0.5 rounded-full font-mono font-normal bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300">
                          Window: bp {preview.mutationWindow.startBp}–{preview.mutationWindow.endBp}
                        </span>
                      </h3>
                      <p class="text-xs text-slate-500">
                        Direct base-pair and amino acid translation comparison between wild-type template and engineered construct.
                      </p>
                    </div>
                  </div>

                  {/* Side-by-side DNA comparison */}
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                      <div class="flex items-center justify-between text-[11px] text-slate-400 font-sans font-semibold">
                        <span>ORIGINAL TEMPLATE DNA (5' → 3')</span>
                        <span>WT</span>
                      </div>
                      <div class="text-slate-700 dark:text-slate-300 font-bold break-all leading-relaxed select-text">
                        {preview.mutationWindow.wtSegment.slice(0, Math.max(0, (s.targetPosition || 1) - preview.mutationWindow.startBp))}
                        <span class="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 px-1 py-0.5 rounded line-through mx-0.5">
                          {result?.replacedSequence || (s.replaceLength > 0 ? cleanDna(s.plasmidDna).slice((s.targetPosition || 1) - 1, (s.targetPosition || 1) - 1 + s.replaceLength) : '·')}
                        </span>
                        {preview.mutationWindow.wtSegment.slice(Math.max(0, (s.targetPosition || 1) - preview.mutationWindow.startBp) + (result?.replacedSequence?.length || s.replaceLength || 0))}
                      </div>
                    </div>

                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-emerald-200 dark:border-emerald-900/60 space-y-1">
                      <div class="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-sans font-semibold">
                        <span>MUTATED CONSTRUCT DNA (5' → 3')</span>
                        <span>MUTANT</span>
                      </div>
                      <div class="text-slate-700 dark:text-slate-300 font-bold break-all leading-relaxed select-text">
                        {preview.mutationWindow.wtSegment.slice(0, Math.max(0, (s.targetPosition || 1) - preview.mutationWindow.startBp))}
                        <span class="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-1 py-0.5 rounded font-black mx-0.5">
                          {result?.replacementSequence || (s.replacementSeq ? cleanDna(s.replacementSeq) : '(deleted)')}
                        </span>
                        {preview.mutationWindow.wtSegment.slice(Math.max(0, (s.targetPosition || 1) - preview.mutationWindow.startBp) + (result?.replacedSequence?.length || s.replaceLength || 0))}
                      </div>
                    </div>
                  </div>

                  {/* Protein Translation Comparison */}
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-semibold text-slate-700 dark:text-slate-300">Translated Protein Comparison</span>
                      <span class="text-[11px] font-mono text-slate-400">
                        WT: {preview.originalProtein.length} aa · Mut: {preview.mutatedProtein.length} aa
                      </span>
                    </div>
                    <div class="space-y-1.5 font-mono text-xs select-text overflow-x-auto">
                      <div class="flex items-center gap-2">
                        <span class="w-12 shrink-0 text-slate-400 text-[10px] uppercase font-sans">WT AA:</span>
                        <span class="text-slate-700 dark:text-slate-300 tracking-wider">
                          {preview.originalProtein.slice(0, 80)}{preview.originalProtein.length > 80 ? '…' : ''}
                        </span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="w-12 shrink-0 text-emerald-600 dark:text-emerald-400 text-[10px] uppercase font-sans font-bold">MUT AA:</span>
                        <span class="text-emerald-700 dark:text-emerald-300 tracking-wider font-semibold">
                          {preview.mutatedProtein.slice(0, 80)}{preview.mutatedProtein.length > 80 ? '…' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive ORF Codon Strip (Mouse Click Codon Selection) */}
              {codons.length > 0 && (
                <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
                  <div class="flex items-center justify-between">
                    <div>
                      <h4 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Interactive ORF Codons Track ({codons.length} aa)
                      </h4>
                      <p class="text-[11px] text-slate-500">
                        Click any amino acid / codon below with your mouse to target it for point mutation.
                      </p>
                    </div>
                    {activeCodon && (
                      <span class="text-xs font-mono font-semibold text-accent-600 dark:text-accent-400">
                        Active: {activeCodon.wtAa}{activeCodon.aaPos} (bp {activeCodon.startBp + 1}–{activeCodon.endBp})
                      </span>
                    )}
                  </div>

                  <div class="flex flex-wrap gap-1 max-h-48 overflow-y-auto p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs select-none">
                    {codons.map(c => {
                      const isSelected = activeCodon?.index === c.index;
                      return (
                        <button
                          key={c.index}
                          type="button"
                          onClick={() => {
                            set({
                              selectedCodonIdx: c.index,
                              targetPosition: c.startBp + 1,
                              replaceLength: 3,
                              replacementSeq: PREFERRED_CODONS_ECOLI[s.targetAa] || 'GCG',
                              mode: 'codon',
                            });
                          }}
                          title={`Residue ${c.aaPos}: ${c.wtAa} (${c.wtCodon}) at bp ${c.startBp + 1}. Click to select.`}
                          class={`px-1.5 py-0.5 rounded text-[11px] font-mono transition flex flex-col items-center ${
                            isSelected
                              ? 'bg-accent-600 text-white font-bold shadow-2xs ring-2 ring-accent-400'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <span class="text-[9px] opacity-70 leading-tight">{c.aaPos}</span>
                          <span class="font-bold leading-tight">{c.wtAa}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
