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
  designSiteDirectedMutagenesis,
} from '@/core/mutagenesis';

interface State {
  plasmidDna: string;
  selectedCodonIdx: number;
  targetAa: string;
  targetPrimerTm: number;
}

const DEMO_GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

const DEFAULTS: State = {
  plasmidDna: DEMO_GFP,
  selectedCodonIdx: 64, // S65 (0-indexed 64)
  targetAa: 'T', // Thr
  targetPrimerTm: 62,
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono';

export default function MutagenesisView() {
  const [stateSig, shareUrl] = useUrlState<State>('mutagenesis', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [copiedPrimerId, setCopiedPrimerId] = useState<string | null>(null);

  // Extract codons from current sequence
  const codons = useMemo(() => {
    return extractOrfCodons(s.plasmidDna);
  }, [s.plasmidDna]);

  const activeCodon = codons[s.selectedCodonIdx] || codons[0];

  // Desired mutant codon
  const targetCodon = useMemo(() => {
    return PREFERRED_CODONS_ECOLI[s.targetAa] || 'GCG';
  }, [s.targetAa]);

  // Design mutagenesis
  const result = useMemo(() => {
    if (!activeCodon || !s.plasmidDna) return null;
    return designSiteDirectedMutagenesis(
      s.plasmidDna,
      activeCodon.startBp,
      targetCodon,
      3,
      s.targetPrimerTm
    );
  }, [s.plasmidDna, activeCodon, targetCodon, s.targetPrimerTm]);

  function handleCopyText(key: string, text: string) {
    navigator.clipboard?.writeText?.(text);
    setCopiedPrimerId(key);
    setTimeout(() => setCopiedPrimerId(null), 2000);
  }

  const copySummary = () => {
    if (!result) return '';
    const lines = [
      `Site-Directed Mutagenesis Design: ${result.wtAa}${result.aaPosition}${result.mutAa}`,
      `Mutation: ${result.wtCodon} -> ${result.mutCodon} at nt ${result.ntPosition}`,
      `Recommended Q5 PCR Ta: ${result.recommendedTa}°C`,
      '',
      'Primers for Ordering:',
      `  Forward: ${result.forwardPrimer.sequence} (${result.forwardPrimer.length} nt, Tm: ${result.forwardPrimer.tm}°C, GC: ${result.forwardPrimer.gc}%)`,
      `  Reverse: ${result.reversePrimer.sequence} (${result.reversePrimer.length} nt, Tm: ${result.reversePrimer.tm}°C, GC: ${result.reversePrimer.gc}%)`,
      '',
      'PCR Conditions:',
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
      blurb="Non-overlapping back-to-back primer design for Q5 exponential whole-plasmid amplification and KLD circularization (NEBaseChanger style)."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Plasmid DNA Input */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Plasmid / Coding Sequence
              </label>
              <span class="text-[11px] text-slate-500 font-mono">
                {cleanDna(s.plasmidDna).length} bp ({codons.length} codons)
              </span>
            </div>
            <textarea
              rows={4}
              value={s.plasmidDna}
              onInput={(e) => set({ plasmidDna: (e.target as HTMLTextAreaElement).value })}
              placeholder="Paste plasmid or ORF sequence (5' to 3')..."
              class={FIELD}
            />
          </div>

          {/* Select Target Residue & Codon */}
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

            <div class="pt-2">
              <label class="block text-xs text-slate-500 mb-1">Target Primer Anneal Tm (°C)</label>
              <DecimalInput
                class={FIELD}
                value={s.targetPrimerTm}
                onChange={targetPrimerTm => set({ targetPrimerTm: Math.round(targetPrimerTm) })}
                min={52}
                max={72}
                step={1}
              />
            </div>
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
                      Designed Point Mutation
                    </span>
                    <div class="text-3xl font-black text-accent-600 dark:text-accent-400 font-mono mt-0.5">
                      {result.wtAa}{result.aaPosition}{result.mutAa}
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
                    <span class="text-slate-400 block">Wild-Type Codon</span>
                    <span class="text-base font-bold font-mono text-slate-700 dark:text-slate-300">{result.wtCodon}</span>
                    <span class="text-[10px] text-slate-400 block">({result.wtAa})</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Mutant Codon</span>
                    <span class="text-base font-bold font-mono text-accent-600 dark:text-accent-400">{result.mutCodon}</span>
                    <span class="text-[10px] text-slate-400 block">({result.mutAa})</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Plasmid Nucleotide</span>
                    <span class="text-base font-bold font-mono text-slate-700 dark:text-slate-300">bp {result.ntPosition}</span>
                    <span class="text-[10px] text-slate-400 block">to {result.ntPosition + 2}</span>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-400 block">Primer Alignment</span>
                    <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">Back-to-Back</span>
                    <span class="text-[10px] text-slate-400 block">Non-overlapping</span>
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
                      <span>Tm: <strong>{result.forwardPrimer.tm}°C</strong></span>
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
                    <span class="px-1 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-900 mr-0.5" title="Mutant codon at 5' terminus">
                      {result.forwardPrimer.sequence.slice(0, result.forwardPrimer.mutationOffsetFrom5Prime)}
                    </span>
                    <span class="text-slate-800 dark:text-slate-200">
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
                      <span>Tm: <strong>{result.reversePrimer.tm}°C</strong></span>
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
