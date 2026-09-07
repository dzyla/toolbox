import { useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { downloadText } from '@/lib/export';
import { SCIENCE } from './science';
import {
  analyzePrimer,
  analyzePrimerPair,
  exportOrderingSheet,
  calcTa,
  type PrimerAnalysis,
  type PrimerPairAnalysis,
  type ReactionConditions,
} from '@/core/nucleic/primers';
import type { SaltCorrection } from '@/core/nucleic/tm';
import type { ToolProps } from '@/tools/registry';

interface State {
  mode: 'pair' | 'single';
  fwdName: string;
  fwdSeq: string;
  revName: string;
  revSeq: string;
  polymerase: 'q5' | 'taq';
  primerNM: number;
  naMM: number;
  kMM: number;
  trisMM: number;
  mgMM: number;
  dntpMM: number;
  saltCorrection: SaltCorrection;
  exportScale: string;
  exportPurification: string;
}

const DEFAULTS: State = {
  mode: 'pair',
  fwdName: 'GFP_Fwd',
  fwdSeq: 'ATGGTGAGCAAGGGCGAGGAG',
  revName: 'GFP_Rev',
  revSeq: 'TTACTTGTACAGCTCGTCCATGC',
  polymerase: 'q5',
  primerNM: 250,
  naMM: 50,
  kMM: 0,
  trisMM: 0,
  mgMM: 1.5,
  dntpMM: 0.8,
  saltCorrection: 'owczarzy2008',
  exportScale: '25nm',
  exportPurification: 'STD',
};

const PRESETS = [
  {
    label: 'GFP Cloning (Balanced Pair)',
    desc: 'Optimal 62 °C pair, <0.5 °C Tm diff, no secondary structures',
    mode: 'pair' as const,
    fwdName: 'GFP_Fwd',
    fwdSeq: 'ATGGTGAGCAAGGGCGAGGAG',
    revName: 'GFP_Rev',
    revSeq: 'TTACTTGTACAGCTCGTCCATGC',
  },
  {
    label: '3′ Self-Dimer Warning',
    desc: 'Palindromic 3′ end with high extension risk',
    mode: 'pair' as const,
    fwdName: 'Dimer_Fwd',
    fwdSeq: 'ATGCGATCGATCGATCGCGCG',
    revName: 'Normal_Rev',
    revSeq: 'TGACCGGCAGCAAAATGTTG',
  },
  {
    label: 'Hairpin Structure Warning',
    desc: 'Stem-loop structure (ΔG ≤ -3 kcal/mol)',
    mode: 'single' as const,
    fwdName: 'Hairpin_Oligo',
    fwdSeq: 'AAAAGCGCGTTTTCGCGCAAAA',
    revName: 'Normal_Rev',
    revSeq: 'TGACCGGCAGCAAAATGTTG',
  },
  {
    label: 'Tm Mismatch Warning (|ΔTm| > 3 °C)',
    desc: 'Forward 58 °C, Reverse 78 °C: unequal annealing',
    mode: 'pair' as const,
    fwdName: 'Low_Tm_Fwd',
    fwdSeq: 'TGACCGGCAGCAAAATGTTG',
    revName: 'High_Tm_Rev',
    revSeq: 'GCGCGCCCGGGCCCGCCGCG',
  },
  {
    label: 'Poor GC Clamp (0 G/C at 3′)',
    desc: 'A/T rich 3′ terminal 5 bases',
    mode: 'single' as const,
    fwdName: 'Weak_Clamp_Fwd',
    fwdSeq: 'TGACCGGCAGCAAAATATTA',
    revName: 'Normal_Rev',
    revSeq: 'TGACCGGCAGCAAAATGTTG',
  },
  {
    label: 'Excessive GC Clamp (>3 G/C at 3′)',
    desc: '5 G/C bases at 3′ end with high mispriming risk',
    mode: 'single' as const,
    fwdName: 'Tight_Clamp_Fwd',
    fwdSeq: 'TGACCGGCAGCAAAACGCGC',
    revName: 'Normal_Rev',
    revSeq: 'TGACCGGCAGCAAAATGTTG',
  },
];

const BASE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: 'bg-emerald-100 dark:bg-emerald-950/70', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700' },
  C: { bg: 'bg-sky-100 dark:bg-sky-950/70', text: 'text-sky-800 dark:text-sky-300', border: 'border-sky-300 dark:border-sky-700' },
  G: { bg: 'bg-amber-100 dark:bg-amber-950/70', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700' },
  T: { bg: 'bg-rose-100 dark:bg-rose-950/70', text: 'text-rose-800 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-700' },
  U: { bg: 'bg-rose-100 dark:bg-rose-950/70', text: 'text-rose-800 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-700' },
};

export default function PrimersView(props?: ToolProps & { embedded?: boolean }) {
  const [stateSig, shareUrl] = useUrlState<State>('primers', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAdvancedConditions, setShowAdvancedConditions] = useState(false);

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const conditions = useMemo<ReactionConditions>(() => ({
    primerNM: s.primerNM,
    naMM: s.naMM,
    kMM: s.kMM,
    trisMM: s.trisMM,
    mgMM: s.mgMM,
    dntpMM: s.dntpMM,
    saltCorrection: s.saltCorrection,
  }), [s.primerNM, s.naMM, s.kMM, s.trisMM, s.mgMM, s.dntpMM, s.saltCorrection]);

  // Calculations
  const singleAnalysis = useMemo<PrimerAnalysis | null>(() => {
    try {
      return analyzePrimer(s.fwdSeq, s.fwdName, conditions);
    } catch {
      return null;
    }
  }, [s.fwdSeq, s.fwdName, conditions]);

  const pairAnalysis = useMemo<PrimerPairAnalysis | null>(() => {
    if (s.mode !== 'pair') return null;
    try {
      return analyzePrimerPair(s.fwdSeq, s.revSeq, s.fwdName, s.revName, conditions);
    } catch {
      return null;
    }
  }, [s.mode, s.fwdSeq, s.revSeq, s.fwdName, s.revName, conditions]);

  const copySummary = () => {
    if (s.mode === 'pair' && pairAnalysis) {
      const p = pairAnalysis;
      return [
        `PCR Primer Pair QC Summary:`,
        `Forward: ${p.fwd.name} (${p.fwd.length} nt, Tm ${p.fwd.tm.toFixed(1)} °C, GC ${p.fwd.gcPercent.toFixed(1)}%, 3' ΔG ${p.fwd.terminalStability.deltaG.toFixed(1)} kcal/mol)`,
        `Reverse: ${p.rev.name} (${p.rev.length} nt, Tm ${p.rev.tm.toFixed(1)} °C, GC ${p.rev.gcPercent.toFixed(1)}%, 3' ΔG ${p.rev.terminalStability.deltaG.toFixed(1)} kcal/mol)`,
        `Tm Difference: ${p.tmDiff.toFixed(1)} °C (${p.isTmDiffOptimal ? 'Optimal ≤ 3 °C' : 'HIGH DIFFERENCE'})`,
        `Starting Ta (Q5/Phusion high-fidelity): ${p.taQ5.toFixed(1)} °C; confirm with the vendor calculator or a gradient PCR.`,
        `Recommended Ta (Taq/Standard): ${p.taTaq.toFixed(1)} °C`,
        `Cross-Dimer worst ΔG: ${p.crossDimer.worstDeltaG.toFixed(1)} kcal/mol (${p.crossDimer.is3PrimeEndRisky ? "3' END EXTENSION RISK" : 'Safe'})`,
        `Overall Status: ${p.overallStatus.toUpperCase()} (${p.qualityScore}/100)`,
      ].join('\n');
    } else if (singleAnalysis) {
      const p = singleAnalysis;
      const ta = calcTa(p.tm);
      return [
        `Primer QC Summary:`,
        `Name: ${p.name}`,
        `Sequence (5'->3'): ${p.cleanSeq}`,
        `Length: ${p.length} nt | GC: ${p.gcPercent.toFixed(1)}%`,
        `Tm (Nearest-Neighbor): ${p.tm.toFixed(1)} °C (Wallace: ${p.tmWallace.toFixed(1)} °C, Basic: ${p.tmBasic.toFixed(1)} °C)`,
        `3' Terminal Stability (ΔG 37°C): ${p.terminalStability.deltaG.toFixed(1)} kcal/mol (${p.terminalStability.isRisky ? 'RISKY' : 'Optimal'})`,
        `3' GC Clamp: ${p.gcClamp.count}/5 G/C (${p.gcClamp.status.toUpperCase()})`,
        `Hairpin: ${p.hairpin.hasHairpin ? `${p.hairpin.worstDeltaG.toFixed(1)} kcal/mol (${p.hairpin.isRisky ? 'RISKY' : 'Tolerable'})` : 'None'}`,
        `Self-Dimer worst ΔG: ${p.selfDimer.worstDeltaG.toFixed(1)} kcal/mol (${p.selfDimer.is3PrimeEndRisky ? "3' END RISK" : 'Safe'})`,
        `Starting Ta: Q5/Phusion = ${ta.taQ5.toFixed(1)} °C, Taq = ${ta.taTaq.toFixed(1)} °C; optimize with the enzyme vendor's calculator or a gradient PCR.`,
        `Quality Score: ${p.qualityScore}/100 (${p.status.toUpperCase()})`,
      ].join('\n');
    }
    return 'No primer analysis available';
  };

  const handleExport = (format: 'tsv' | 'csv') => {
    const list = s.mode === 'pair' && pairAnalysis ? [pairAnalysis.fwd, pairAnalysis.rev] : singleAnalysis ? [singleAnalysis] : [];
    const content = exportOrderingSheet(list, format, { scale: s.exportScale, purification: s.exportPurification });
    downloadText(content, `primer_order_${s.mode === 'pair' ? 'pair' : s.fwdName}.${format}`, format === 'tsv' ? 'text/tab-separated-values' : 'text/csv');
  };

  const handleCopyExport = (format: 'tsv' | 'csv') => {
    const list = s.mode === 'pair' && pairAnalysis ? [pairAnalysis.fwd, pairAnalysis.rev] : singleAnalysis ? [singleAnalysis] : [];
    const content = exportOrderingSheet(list, format, { scale: s.exportScale, purification: s.exportPurification });
    navigator.clipboard.writeText(content);
    flashCopied(`export-${format}`);
  };

  // Temperature scale SVG values
  const tempChartData = useMemo(() => {
    if (s.mode === 'pair' && pairAnalysis) {
      return {
        fwdTm: pairAnalysis.fwd.tm,
        revTm: pairAnalysis.rev.tm,
        taQ5: pairAnalysis.taQ5,
        taTaq: pairAnalysis.taTaq,
        minTm: Math.min(pairAnalysis.fwd.tm, pairAnalysis.rev.tm),
      };
    } else if (singleAnalysis) {
      const ta = calcTa(singleAnalysis.tm);
      return {
        fwdTm: singleAnalysis.tm,
        revTm: null,
        taQ5: ta.taQ5,
        taTaq: ta.taTaq,
        minTm: singleAnalysis.tm,
      };
    }
    return null;
  }, [s.mode, pairAnalysis, singleAnalysis]);

  return (
    <ToolLayout
      icon="🧬"
      title="Primer QC & PCR Suite"
      blurb="Nearest-neighbor Tm (SantaLucia 1998 & Owczarzy 2008), 3′ terminal stability, GC clamp, hairpin folding, self/cross-dimer detection, and Ta optimization."
      wide
      embedded={props?.embedded}
      inputs={
        <div class="space-y-4">
          {/* Presets */}
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Quick Presets
            </label>
            <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    set({
                      mode: p.mode,
                      fwdName: p.fwdName,
                      fwdSeq: p.fwdSeq,
                      revName: p.revName,
                      revSeq: p.revSeq,
                    });
                  }}
                  class="rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-left hover:border-accent-400 hover:bg-accent-50/50 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-accent-600 transition"
                >
                  <div class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{p.label}</div>
                  <div class="text-[10px] text-slate-500 truncate">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mode Switcher */}
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Analysis Mode
            </label>
            <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => set({ mode: 'pair' })}
                class={`flex-1 py-1.5 rounded-lg transition ${s.mode === 'pair' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
              >
                Primer Pair (PCR Suite)
              </button>
              <button
                type="button"
                onClick={() => set({ mode: 'single' })}
                class={`flex-1 py-1.5 rounded-lg transition ${s.mode === 'single' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
              >
                Single Primer QC
              </button>
            </div>
          </div>

          {/* Forward Primer */}
          <div class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
                {s.mode === 'pair' ? 'Forward Primer (5′ ➔ 3′)' : 'Primer Sequence (5′ ➔ 3′)'}
              </span>
              <input
                type="text"
                value={s.fwdName}
                onInput={e => set({ fwdName: (e.target as HTMLInputElement).value })}
                placeholder="Name"
                class="w-28 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <textarea
              rows={2}
              value={s.fwdSeq}
              onInput={e => set({ fwdSeq: (e.target as HTMLTextAreaElement).value })}
              placeholder="e.g. ATGGTGAGCAAGGGCGAGGAG"
              class="w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs uppercase dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          {/* Reverse Primer (in Pair Mode) */}
          {s.mode === 'pair' && (
            <div class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Reverse Primer (5′ ➔ 3′)
                </span>
                <input
                  type="text"
                  value={s.revName}
                  onInput={e => set({ revName: (e.target as HTMLInputElement).value })}
                  placeholder="Name"
                  class="w-28 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <textarea
                rows={2}
                value={s.revSeq}
                onInput={e => set({ revSeq: (e.target as HTMLTextAreaElement).value })}
                placeholder="e.g. TTACTTGTACAGCTCGTCCATGC"
                class="w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs uppercase dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          )}

          {/* Polymerase Choice */}
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              PCR DNA Polymerase
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set({ polymerase: 'q5' })}
                class={`p-2.5 rounded-xl border text-left transition ${s.polymerase === 'q5' ? 'border-accent-500 bg-accent-50/50 dark:border-accent-600 dark:bg-accent-950/30 ring-1 ring-accent-500' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}
              >
                <div class="text-xs font-bold text-slate-800 dark:text-slate-200">Phusion® / Q5®</div>
                <div class="text-[11px] text-slate-500">Starting Ta = min(Tm) + 3.0 °C</div>
              </button>
              <button
                type="button"
                onClick={() => set({ polymerase: 'taq' })}
                class={`p-2.5 rounded-xl border text-left transition ${s.polymerase === 'taq' ? 'border-accent-500 bg-accent-50/50 dark:border-accent-600 dark:bg-accent-950/30 ring-1 ring-accent-500' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}
              >
                <div class="text-xs font-bold text-slate-800 dark:text-slate-200">Taq / Standard</div>
                <div class="text-[11px] text-slate-500">Ta = min(Tm) − 5.0 °C</div>
              </button>
            </div>
          </div>

          {/* Collapsible Reaction Conditions */}
          <div class="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedConditions(!showAdvancedConditions)}
              class="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition"
            >
              <span class="flex items-center gap-1.5">
                <span>⚗️ Reaction & Buffer Conditions</span>
                <span class="font-normal text-slate-500">({s.primerNM} nM primer, {s.mgMM} mM Mg²⁺, {s.naMM} mM Na⁺)</span>
              </span>
              <span>{showAdvancedConditions ? '▲ Hide' : '▼ Adjust'}</span>
            </button>

            {showAdvancedConditions && (
              <div class="p-3 space-y-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="text-slate-500 block mb-1">Primer Conc [nM]</label>
                    <DecimalInput
                      value={s.primerNM}
                      onChange={v => set({ primerNM: v })}
                      min={10}
                      max={5000}
                      step={50}
                      class="w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label class="text-slate-500 block mb-1">Mg²⁺ Conc [mM]</label>
                    <DecimalInput
                      value={s.mgMM}
                      onChange={v => set({ mgMM: v })}
                      min={0}
                      max={20}
                      step={0.5}
                      class="w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label class="text-slate-500 block mb-1">Na⁺ [mM]</label>
                    <DecimalInput
                      value={s.naMM}
                      onChange={v => set({ naMM: v })}
                      min={0}
                      max={500}
                      step={10}
                      class="w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label class="text-slate-500 block mb-1">Total dNTPs [mM]</label>
                    <DecimalInput
                      value={s.dntpMM}
                      onChange={v => set({ dntpMM: v })}
                      min={0}
                      max={10}
                      step={0.2}
                      class="w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label class="text-slate-500 block mb-1">K⁺ [mM]</label>
                    <DecimalInput
                      value={s.kMM}
                      onChange={v => set({ kMM: v })}
                      min={0}
                      max={500}
                      step={10}
                      class="w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label class="text-slate-500 block mb-1">Tris⁺ Buffer [mM]</label>
                    <DecimalInput
                      value={s.trisMM}
                      onChange={v => set({ trisMM: v })}
                      min={0}
                      max={200}
                      step={5}
                      class="w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label class="text-slate-500 block mb-1">Salt Correction Algorithm</label>
                  <select
                    value={s.saltCorrection}
                    onChange={e => set({ saltCorrection: (e.target as HTMLSelectElement).value as SaltCorrection })}
                    class="w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 text-xs"
                  >
                    <option value="owczarzy2008">Owczarzy 2008 (Divalent Mg²⁺ & competitive dNTPs - Recommended)</option>
                    <option value="owczarzy2004">Owczarzy 2004 (Monovalent cations)</option>
                    <option value="santalucia1998">SantaLucia 1998 (Monovalent salt formula)</option>
                    <option value="none">None (1 M NaCl standard state)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      }
      results={
        <div class="space-y-6">
          {/* Primary Top Result Banner: PCR Annealing Temperature */}
          {tempChartData && (
            <div class="rounded-2xl border border-accent-300 bg-gradient-to-r from-accent-50/70 via-indigo-50/50 to-sky-50/60 p-4 sm:p-5 dark:border-accent-800 dark:from-accent-950/40 dark:via-indigo-950/20 dark:to-sky-950/30 shadow-xs space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-accent-200/60 pb-3 dark:border-accent-800/60">
                <div>
                  <span class="text-xs uppercase font-bold tracking-wider text-accent-700 dark:text-accent-300">
                    Recommended PCR Annealing Temperature
                  </span>
                  <div class="flex items-baseline gap-3 mt-1">
                    <span class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 font-mono">
                      {s.polymerase === 'q5' ? `${tempChartData.taQ5.toFixed(1)} °C` : `${tempChartData.taTaq.toFixed(1)} °C`}
                    </span>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-100 text-accent-800 dark:bg-accent-900/60 dark:text-accent-200">
                      {s.polymerase === 'q5' ? 'Phusion® / Q5®' : 'Taq / Standard'}
                    </span>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  {pairAnalysis && (
                    <div class="text-right">
                      <div class="text-[11px] text-slate-500">Pair Tm Difference (|ΔTm|)</div>
                      <div class="flex items-center gap-1.5 justify-end mt-0.5">
                        <span class="font-mono text-sm font-bold text-slate-800 dark:text-slate-200">
                          {pairAnalysis.tmDiff.toFixed(1)} °C
                        </span>
                        <span class={`text-[10px] font-bold px-1.5 py-0.5 rounded ${pairAnalysis.isTmDiffOptimal ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                          {pairAnalysis.isTmDiffOptimal ? 'OPTIMAL (≤3°C)' : 'HIGH MISMATCH'}
                        </span>
                      </div>
                    </div>
                  )}

                  {pairAnalysis && (
                    <span class={`px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                      pairAnalysis.overallStatus === 'optimal'
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : pairAnalysis.overallStatus === 'warning'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-rose-600 text-white shadow-xs'
                    }`}>
                      {pairAnalysis.overallStatus} QC
                    </span>
                  )}
                </div>
              </div>

              {/* D3/SVG Temperature Comparison Scale */}
              <div class="space-y-1.5">
                <div class="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>PCR Thermal Profile Scale (°C)</span>
                  <span>Taq: {tempChartData.taTaq.toFixed(1)}°C | Q5: {tempChartData.taQ5.toFixed(1)}°C</span>
                </div>

                <div class="overflow-x-auto p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <svg viewBox="0 0 600 90" class="w-full h-auto min-w-[480px] select-none font-mono text-xs">
                    {/* Scale background track 40 to 75 C */}
                    {(() => {
                      const minT = 40;
                      const maxT = 75;
                      const scale = (t: number) => 30 + ((t - minT) / (maxT - minT)) * 540;

                      // Major ticks
                      const ticks = [40, 45, 50, 55, 60, 65, 70, 75];

                      return (
                        <g>
                          {/* Baseline line */}
                          <line x1="30" y1="42" x2="570" y2="42" stroke="currentColor" stroke-opacity="0.25" stroke-width="2" />

                          {/* Ticks */}
                          {ticks.map(t => (
                            <g key={t} transform={`translate(${scale(t)}, 42)`}>
                              <line y1="-4" y2="4" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" />
                              <text y="15" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">{t}°</text>
                            </g>
                          ))}

                          {/* Ta Taq indicator */}
                          <g transform={`translate(${scale(tempChartData.taTaq)}, 42)`}>
                            <line y1="-3" y2="-24" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="2,2" />
                            <circle r="3.5" fill="#0284c7" />
                            <text y="-27" text-anchor="middle" font-size="9" font-weight="bold" fill="#0284c7">Ta(Taq) {tempChartData.taTaq.toFixed(1)}°</text>
                          </g>

                          {/* Ta Q5 indicator */}
                          <g transform={`translate(${scale(tempChartData.taQ5)}, 42)`}>
                            <line y1="-3" y2="-12" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="2,2" />
                            <circle r="3.5" fill="#6366f1" />
                            <text y="-14" text-anchor="middle" font-size="9" font-weight="bold" fill="#6366f1">Ta(Q5) {tempChartData.taQ5.toFixed(1)}°</text>
                          </g>

                          {/* Fwd Tm indicator */}
                          <g transform={`translate(${scale(tempChartData.fwdTm)}, 42)`}>
                            <line y1="-3" y2="-14" stroke="#10b981" stroke-width="1.5" />
                            <rect x="-3" y="-3" width="6" height="6" fill="#10b981" transform="rotate(45)" />
                            <text y="-17" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#10b981">Fwd {tempChartData.fwdTm.toFixed(1)}°</text>
                          </g>

                          {/* Rev Tm indicator */}
                          {tempChartData.revTm !== null && (
                            <g transform={`translate(${scale(tempChartData.revTm)}, 42)`}>
                              <line y1="3" y2="23" stroke="#f59e0b" stroke-width="1.5" />
                              <rect x="-3" y="-3" width="6" height="6" fill="#f59e0b" transform="rotate(45)" />
                              <text y="34" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#f59e0b">Rev {tempChartData.revTm.toFixed(1)}°</text>
                            </g>
                          )}
                        </g>
                      );
                    })()}
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Pair Warnings Alert */}
          {pairAnalysis && pairAnalysis.pairWarnings.length > 0 && (
            <div class="rounded-xl border border-amber-300 bg-amber-50/70 p-3.5 dark:border-amber-800 dark:bg-amber-950/30 text-xs space-y-1">
              <div class="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <span>⚠️</span>
                <span>PCR Pair Optimization Advisory:</span>
              </div>
              <ul class="list-disc list-inside space-y-0.5 text-amber-800 dark:text-amber-300">
                {pairAnalysis.pairWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Cross-Dimer Diagnostics (in Pair Mode) */}
          {pairAnalysis && (
            <div class="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
                <div>
                  <h3 class="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>🔗 Cross-Dimer (Forward ↔ Reverse Heterodimer)</span>
                  </h3>
                  <div class="text-[11px] text-slate-500">
                    Sliding antiparallel complementary match analysis
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <span class={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    pairAnalysis.crossDimer.is3PrimeEndRisky
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      : pairAnalysis.crossDimer.isWorstRisky
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}>
                    {pairAnalysis.crossDimer.is3PrimeEndRisky ? "HIGH 3' EXTENSION RISK" : pairAnalysis.crossDimer.isWorstRisky ? 'INTERNAL DIMER RISK' : 'LOW RISK (SAFE)'}
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-mono">
                <div class="rounded-lg border border-slate-200 p-2 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div class="text-[10px] text-slate-500 font-sans">Worst Cross ΔG</div>
                  <div class="text-base font-bold text-slate-800 dark:text-slate-200">
                    {pairAnalysis.crossDimer.worstDeltaG.toFixed(1)} kcal/mol
                  </div>
                </div>
                <div class="rounded-lg border border-slate-200 p-2 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div class="text-[10px] text-slate-500 font-sans">3′ End Dimer ΔG</div>
                  <div class={`text-base font-bold ${pairAnalysis.crossDimer.is3PrimeEndRisky ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                    {pairAnalysis.crossDimer.endDeltaG.toFixed(1)} kcal/mol
                  </div>
                </div>
                <div class="rounded-lg border border-slate-200 p-2 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div class="text-[10px] text-slate-500 font-sans">Max Match Length</div>
                  <div class="text-base font-bold text-slate-800 dark:text-slate-200">
                    {pairAnalysis.crossDimer.worstAlignment ? `${pairAnalysis.crossDimer.worstAlignment.matchLength} bp` : '0 bp'}
                  </div>
                </div>
                <div class="rounded-lg border border-slate-200 p-2 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div class="text-[10px] text-slate-500 font-sans">Dimer Tm</div>
                  <div class="text-base font-bold text-slate-800 dark:text-slate-200">
                    {pairAnalysis.crossDimer.worstAlignment ? `${pairAnalysis.crossDimer.worstAlignment.tm.toFixed(1)} °C` : '—'}
                  </div>
                </div>
              </div>

              {/* Visual Monospace Alignment of Cross-Dimer */}
              {pairAnalysis.crossDimer.worstAlignment ? (
                <div class="rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-slate-200 overflow-x-auto shadow-inner select-all">
                  <div class="text-[10px] text-slate-400 font-sans mb-1">
                    Strongest Heterodimer Duplex (5′ ➔ 3′ vs 3′ ➔ 5′):
                  </div>
                  <div class="whitespace-pre leading-snug">
                    {pairAnalysis.crossDimer.worstAlignment.lines[0]}
                    {'\n'}
                    <span class="text-amber-400 font-bold">{pairAnalysis.crossDimer.worstAlignment.lines[1]}</span>
                    {'\n'}
                    {pairAnalysis.crossDimer.worstAlignment.lines[2]}
                  </div>
                </div>
              ) : (
                <div class="text-xs text-slate-500 italic">No significant cross-dimer hybridization detected.</div>
              )}
            </div>
          )}

          {/* Unified Comparison Table */}
          <div class="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div class="p-3 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 font-bold text-xs text-slate-800 dark:text-slate-200">
              Primer Specification & Secondary Structure Summary
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs font-mono">
                <thead class="bg-slate-100/70 dark:bg-slate-800 text-[11px] font-sans font-bold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th class="p-2.5">Primer</th>
                    <th class="p-2.5">Length</th>
                    <th class="p-2.5">GC%</th>
                    <th class="p-2.5">Tm (NN)</th>
                    <th class="p-2.5">3′ ΔG (37°)</th>
                    <th class="p-2.5">GC Clamp</th>
                    <th class="p-2.5">Hairpin ΔG</th>
                    <th class="p-2.5">Self-Dimer</th>
                    <th class="p-2.5">QC Score</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  {[
                    ...(pairAnalysis ? [pairAnalysis.fwd, pairAnalysis.rev] : singleAnalysis ? [singleAnalysis] : []),
                  ].map((p, i) => (
                    <tr key={i} class="hover:bg-slate-50/60 dark:hover:bg-slate-850/50">
                      <td class="p-2.5 font-bold font-sans text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {p.name}
                      </td>
                      <td class="p-2.5">{p.length} nt</td>
                      <td class="p-2.5">{p.gcPercent.toFixed(1)}%</td>
                      <td class="p-2.5 font-bold text-accent-600 dark:text-accent-400">
                        {p.tm.toFixed(1)} °C
                      </td>
                      <td class="p-2.5">
                        <span class={`font-bold ${p.terminalStability.isRisky ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                          {p.terminalStability.deltaG.toFixed(1)}
                        </span>
                        <span class="text-[10px] text-slate-400 ml-1">kcal</span>
                      </td>
                      <td class="p-2.5">
                        <span class={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          p.gcClamp.status === 'optimal'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : p.gcClamp.status === 'risky'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {p.gcClamp.count}/5 ({p.gcClamp.status})
                        </span>
                      </td>
                      <td class="p-2.5">
                        {p.hairpin.hasHairpin ? (
                          <span class={`font-bold ${p.hairpin.isRisky ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                            {p.hairpin.worstDeltaG.toFixed(1)} kcal
                          </span>
                        ) : (
                          <span class="text-slate-400">None</span>
                        )}
                      </td>
                      <td class="p-2.5">
                        {p.selfDimer.hasDimer ? (
                          <span class={`font-bold ${p.selfDimer.is3PrimeEndRisky ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                            {p.selfDimer.worstDeltaG.toFixed(1)} kcal
                          </span>
                        ) : (
                          <span class="text-slate-400">Safe</span>
                        )}
                      </td>
                      <td class="p-2.5">
                        <span class={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          p.status === 'optimal'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : p.status === 'warning'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {p.qualityScore}/100
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Individual Primer Visual Sequence Cards & Detailed Diagnostics */}
          {[
            ...(pairAnalysis ? [pairAnalysis.fwd, pairAnalysis.rev] : singleAnalysis ? [singleAnalysis] : []),
          ].map((primer, idx) => {
            const clean = primer.cleanSeq;
            const termLen = Math.min(5, clean.length);
            const bodyLen = clean.length - termLen;
            const bodySeq = clean.slice(0, bodyLen);
            const clampSeq = clean.slice(bodyLen);

            return (
              <div
                key={idx}
                class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-4"
              >
                {/* Header */}
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-slate-900 dark:text-slate-100">{primer.name}</span>
                    <span class="text-xs text-slate-500 font-mono">({primer.length} nt, {primer.gcPercent.toFixed(1)}% GC)</span>
                  </div>

                  <div class="flex items-center gap-3">
                    <div class="text-xs font-mono">
                      <span>Tm: <strong class="text-accent-600 dark:text-accent-400">{primer.tm.toFixed(1)} °C</strong></span>
                      <span class="text-slate-400 ml-1.5">(Wallace: {primer.tmWallace.toFixed(1)}°, Basic: {primer.tmBasic.toFixed(1)}°)</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(primer.cleanSeq);
                        flashCopied(`seq-${primer.name}`);
                      }}
                      class="px-2 py-1 text-xs font-semibold rounded bg-slate-100 dark:bg-slate-800 hover:bg-accent-100 dark:hover:bg-accent-950 text-accent-700 dark:text-accent-300 transition"
                    >
                      {copiedKey === `seq-${primer.name}` ? '✓ Copied' : 'Copy Seq'}
                    </button>
                  </div>
                </div>

                {/* Nucleotide Color Map with 3' GC Clamp Bracket */}
                <div class="space-y-1">
                  <div class="text-[11px] font-semibold text-slate-500 flex justify-between">
                    <span>5′ Sequence Representation</span>
                    <span class="text-accent-600 font-bold">3′ Terminal GC Clamp Region</span>
                  </div>

                  <div class="flex flex-wrap items-center gap-1 p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-x-auto">
                    {bodySeq.split('').map((base, bIdx) => {
                      const c = BASE_COLORS[base] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' };
                      return (
                        <span
                          key={bIdx}
                          class={`w-6 h-7 flex items-center justify-center font-mono text-xs font-bold rounded ${c.bg} ${c.text} border ${c.border} shadow-2xs`}
                          title={`Base ${bIdx + 1}: ${base}`}
                        >
                          {base}
                        </span>
                      );
                    })}

                    {/* Clamp highlighted box */}
                    <div class="flex items-center gap-1 p-1 rounded-lg border-2 border-accent-400 bg-accent-50/40 dark:border-accent-600 dark:bg-accent-950/40 shadow-xs">
                      {clampSeq.split('').map((base, bIdx) => {
                        const c = BASE_COLORS[base] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' };
                        return (
                          <span
                            key={bIdx}
                            class={`w-6 h-7 flex items-center justify-center font-mono text-xs font-black rounded ${c.bg} ${c.text} border ${c.border} shadow-xs ring-1 ring-accent-400/40`}
                            title={`3' Clamp Base ${bodyLen + bIdx + 1}: ${base}`}
                          >
                            {base}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 3' Stability & Secondary Structure Diagnostics Row */}
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                  {/* GC Clamp & 3' DeltaG */}
                  <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-950/30 space-y-1.5">
                    <div class="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span>3′ Terminal Stability</span>
                      <span class={`px-1.5 py-0.5 rounded text-[10px] font-bold ${primer.terminalStability.isRisky ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                        {primer.terminalStability.isRisky ? 'RISKY' : 'OPTIMAL'}
                      </span>
                    </div>
                    <div class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                      ΔG = {primer.terminalStability.deltaG.toFixed(2)} kcal/mol
                    </div>
                    <div class="text-[11px] text-slate-500">
                      Clamp: {primer.gcClamp.count}/5 G/C ({primer.gcClamp.bases})
                    </div>
                    <div class="text-[10px] text-slate-400">
                      {primer.terminalStability.deltaG <= -9.0 ? 'Excessively stable (ΔG ≤ -9.0); promotes non-specific priming' : 'Terminal stability within recommended PCR threshold'}
                    </div>
                  </div>

                  {/* Hairpin Structure */}
                  <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-950/30 space-y-1.5">
                    <div class="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span>Hairpin Detection</span>
                      <span class={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        primer.hairpin.isRisky
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : primer.hairpin.hasHairpin
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}>
                        {primer.hairpin.isRisky ? 'RISKY (ΔG ≤ -3)' : primer.hairpin.hasHairpin ? 'WEAK' : 'NONE'}
                      </span>
                    </div>
                    <div class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                      {primer.hairpin.hasHairpin ? `ΔG = ${primer.hairpin.worstDeltaG.toFixed(1)} kcal/mol` : 'No Hairpins'}
                    </div>
                    {primer.hairpin.primaryHairpin && (
                      <div class="text-[11px] text-slate-500 font-mono">
                        Stem: {primer.hairpin.primaryHairpin.stemLength} bp | Loop: {primer.hairpin.primaryHairpin.loopLength} nt
                      </div>
                    )}
                    <div class="text-[10px] text-slate-400">
                      {primer.hairpin.isRisky ? 'Hairpin structure may reduce PCR amplification efficiency' : 'Secondary hairpin folding within safe boundaries'}
                    </div>
                  </div>

                  {/* Self-Dimer Structure */}
                  <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-950/30 space-y-1.5">
                    <div class="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span>Self-Dimer (Homodimer)</span>
                      <span class={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        primer.selfDimer.is3PrimeEndRisky
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : primer.selfDimer.isWorstRisky
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}>
                        {primer.selfDimer.is3PrimeEndRisky ? "3' EXTENSION RISK" : primer.selfDimer.isWorstRisky ? 'INTERNAL' : 'SAFE'}
                      </span>
                    </div>
                    <div class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                      {primer.selfDimer.hasDimer ? `ΔG = ${primer.selfDimer.worstDeltaG.toFixed(1)} kcal/mol` : 'Safe'}
                    </div>
                    <div class="text-[11px] text-slate-500 font-mono">
                      3′ End ΔG: {primer.selfDimer.endDeltaG.toFixed(1)} kcal/mol
                    </div>
                    <div class="text-[10px] text-slate-400">
                      {primer.selfDimer.is3PrimeEndRisky ? 'High risk of primer-dimer amplification by DNA polymerase' : 'Self-dimer interactions are negligible'}
                    </div>
                  </div>
                </div>

                {/* Secondary Structure Monospace Schematics */}
                {(primer.hairpin.primaryHairpin || primer.selfDimer.worstAlignment) && (
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-2 pt-1">
                    {primer.hairpin.primaryHairpin && (
                      <div class="rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-slate-200 overflow-x-auto shadow-inner select-all">
                        <div class="text-[10px] text-slate-400 font-sans mb-1">
                          Predicted Hairpin Fold (SantaLucia & Hicks 2004):
                        </div>
                        <div class="whitespace-pre leading-snug">
                          {primer.hairpin.primaryHairpin.alignment}
                        </div>
                      </div>
                    )}

                    {primer.selfDimer.worstAlignment && (
                      <div class="rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-slate-200 overflow-x-auto shadow-inner select-all">
                        <div class="text-[10px] text-slate-400 font-sans mb-1">
                          Strongest Homodimer Alignment (5′ ➔ 3′ vs 3′ ➔ 5′):
                        </div>
                        <div class="whitespace-pre leading-snug">
                          {primer.selfDimer.worstAlignment.lines[0]}
                          {'\n'}
                          <span class="text-amber-400 font-bold">{primer.selfDimer.worstAlignment.lines[1]}</span>
                          {'\n'}
                          {primer.selfDimer.worstAlignment.lines[2]}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Export / Ordering Sheet Section */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div>
                <h3 class="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <span>📋 Oligonucleotide Order Sheet (IDT / Sigma / Thermo Format)</span>
                </h3>
                <div class="text-[11px] text-slate-500">
                  Ready-to-order tabular manifest with length, Tm, GC%, scale, and purification
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyExport('tsv')}
                  class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 transition"
                >
                  {copiedKey === 'export-tsv' ? '✓ Copied TSV' : 'Copy TSV'}
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('tsv')}
                  class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent-600 hover:bg-accent-700 text-white transition shadow-2xs"
                >
                  Download TSV
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 transition"
                >
                  Download CSV
                </button>
              </div>
            </div>

            <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-xs">
              <table class="w-full text-left">
                <thead class="bg-slate-50 dark:bg-slate-800 text-[10px] font-sans font-bold text-slate-500">
                  <tr>
                    <th class="p-2">Well</th>
                    <th class="p-2">Name</th>
                    <th class="p-2">Sequence</th>
                    <th class="p-2">Length</th>
                    <th class="p-2">Tm</th>
                    <th class="p-2">GC%</th>
                    <th class="p-2">Scale</th>
                    <th class="p-2">Purif</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                  {[
                    ...(pairAnalysis ? [pairAnalysis.fwd, pairAnalysis.rev] : singleAnalysis ? [singleAnalysis] : []),
                  ].map((o, idx) => (
                    <tr key={idx} class="hover:bg-slate-50/50 dark:hover:bg-slate-850">
                      <td class="p-2 font-bold">{`A${String(idx + 1).padStart(2, '0')}`}</td>
                      <td class="p-2 font-sans font-bold text-slate-800 dark:text-slate-200">{o.name}</td>
                      <td class="p-2 break-all max-w-xs">{o.cleanSeq}</td>
                      <td class="p-2">{o.length} nt</td>
                      <td class="p-2">{o.tm.toFixed(1)}°</td>
                      <td class="p-2">{o.gcPercent.toFixed(1)}%</td>
                      <td class="p-2">{s.exportScale}</td>
                      <td class="p-2">{s.exportPurification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }
      actions={<ActionBar onCopy={copySummary} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
