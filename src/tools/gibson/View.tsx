import { useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { SCIENCE } from './science';
import {
  type AssemblyMethod,
  type FragmentInput,
  designAssembly,
  calcGc,
} from '@/core/gibson';

interface State {
  method: AssemblyMethod;
  overlapLen: number;
  targetPrimerTm: number;
  vectorName: string;
  vectorSeq: string;
}

const DEMO_VECTOR = 'GGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAAAACCCTGGCGTTACCCAACTTAATCGCCTTGCAGCACATCCCCCTTTCGCCAGCTGGCGTAATAGCGAAGAGGCCCGCACCGATCGCCCTTCCCAACAGTTGCGCAGCCTGAATGGCGAATGGCGCTTTGCCTGGTTTCCGGCACCAGAAGCGGTGCCGGAAAGCTGGCTGGAGTGCGATCTTCCTGAGGCCGATACTGTCGTCGTCCCCTCAAACTGGCAGATGCACGGT';
const DEMO_INSERT_GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

const DEFAULTS: State = {
  method: 'gibson',
  overlapLen: 25,
  targetPrimerTm: 60,
  vectorName: 'pUC19_Linearized',
  vectorSeq: DEMO_VECTOR,
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono';

export default function GibsonView() {
  const [stateSig, shareUrl] = useUrlState<State>('gibson', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [inserts, setInserts] = useState<FragmentInput[]>([
    { id: 'ins1', name: 'GFP_Insert', sequence: DEMO_INSERT_GFP },
  ]);
  const [copiedPrimerId, setCopiedPrimerId] = useState<string | null>(null);

  // Insert management
  function handleAddInsert() {
    const newId = `ins_${Date.now()}`;
    setInserts(prev => [
      ...prev,
      { id: newId, name: `Insert_${prev.length + 1}`, sequence: '' },
    ]);
  }

  function handleUpdateInsert(id: string, patch: Partial<FragmentInput>) {
    setInserts(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function handleDeleteInsert(id: string) {
    if (inserts.length <= 1) return;
    setInserts(prev => prev.filter(item => item.id !== id));
  }

  function handleCopyPrimer(name: string, seq: string) {
    navigator.clipboard?.writeText?.(seq);
    setCopiedPrimerId(name);
    setTimeout(() => setCopiedPrimerId(null), 2000);
  }

  function handleCopyAllPrimers() {
    if (!assembly || assembly.primers.length === 0) return;
    const header = 'Primer Name\tSequence (5\'->3\')\tLength\tAnneal Tm (°C)\tRecommended Ta (°C)\tTarget Fragment';
    const rows = assembly.primers.map(p =>
      `${p.name}\t${p.fullSequence}\t${p.totalLength}\t${p.annealTm}\t${p.recommendedTa}\t${p.targetFragmentName}`
    );
    navigator.clipboard?.writeText?.([header, ...rows].join('\n'));
    setCopiedPrimerId('all');
    setTimeout(() => setCopiedPrimerId(null), 2000);
  }

  // Compute assembly design
  const assembly = useMemo(() => {
    return designAssembly(
      { id: 'vec', name: s.vectorName, sequence: s.vectorSeq },
      inserts,
      s.method,
      s.overlapLen,
      s.targetPrimerTm
    );
  }, [s.vectorName, s.vectorSeq, inserts, s.method, s.overlapLen, s.targetPrimerTm]);

  const copySummary = () => {
    if (!assembly) return '';
    const lines = [
      `Gibson / In-Fusion Assembly Plan (${s.method.toUpperCase()}):`,
      `Assembled Length: ${assembly.assembledLength} bp (${calcGc(assembly.assembledSequence).toFixed(1)}% GC)`,
      `Overlap Homology: ${s.overlapLen} bp | Primer Target Tm: ${s.targetPrimerTm}°C`,
      '',
      'Primers for Ordering:',
      ...assembly.primers.map(p => `  ${p.name}: ${p.fullSequence} (Len: ${p.totalLength}, Anneal Tm: ${p.annealTm}°C, Ta: ${p.recommendedTa}°C)`),
      '',
      'Junctions:',
      ...assembly.junctions.map(j => `  ${j.upstreamName} -> ${j.downstreamName}: ${j.overlapLength} bp, Tm ${j.overlapTm}°C (${j.message})`),
    ];
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="🧬"
      title="Gibson & In-Fusion Assembly Designer"
      blurb="Design seamless isothermal homology arms, PCR primers with 5' overhangs, junction Tm diagnostics, and full recombinant construct sequences."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Method & Parameters */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Assembly System
            </label>
            <div class="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              <button
                type="button"
                onClick={() => set({ method: 'gibson', overlapLen: 25 })}
                class={`flex-1 py-1.5 font-semibold rounded-md transition ${s.method === 'gibson' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Gibson / NEBuilder (20–30 bp)
              </button>
              <button
                type="button"
                onClick={() => set({ method: 'infusion', overlapLen: 18 })}
                class={`flex-1 py-1.5 font-semibold rounded-md transition ${s.method === 'infusion' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                In-Fusion (15–20 bp)
              </button>
            </div>

            <div class="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label class="block text-xs text-slate-500 mb-1">Overlap Length (bp)</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.overlapLen}
                  onChange={overlapLen => set({ overlapLen: Math.round(overlapLen) })}
                  min={15}
                  max={45}
                  step={1}
                />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Target Primer Tm (°C)</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.targetPrimerTm}
                  onChange={targetPrimerTm => set({ targetPrimerTm: Math.round(targetPrimerTm) })}
                  min={50}
                  max={70}
                  step={1}
                />
              </div>
            </div>
          </div>

          {/* Vector Input */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Linearized Destination Vector
              </label>
              <span class="text-[11px] text-slate-500 font-mono">
                {s.vectorSeq.replace(/\s/g, '').length} bp
              </span>
            </div>
            <input
              type="text"
              value={s.vectorName}
              onInput={(e) => set({ vectorName: (e.target as HTMLInputElement).value })}
              placeholder="Vector Name (e.g. pET28a)"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
            />
            <textarea
              rows={4}
              value={s.vectorSeq}
              onInput={(e) => set({ vectorSeq: (e.target as HTMLTextAreaElement).value })}
              placeholder="Paste linearized vector sequence (5' to 3')..."
              class={FIELD}
            />
            <p class="text-[11px] text-slate-500">
              Note: 3' end connects to Insert 1, and 5' end connects to final Insert.
            </p>
          </div>

          {/* Insert Fragments */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Insert Fragments ({inserts.length})
              </label>
              <button
                type="button"
                onClick={handleAddInsert}
                class="text-xs text-accent-600 dark:text-accent-400 font-semibold hover:underline"
              >
                + Add Another Insert
              </button>
            </div>

            <div class="space-y-3">
              {inserts.map((ins, idx) => (
                <div key={ins.id} class="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-accent-100 text-accent-800 dark:bg-accent-950 dark:text-accent-300">
                      Insert {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={ins.name}
                      onInput={(e) => handleUpdateInsert(ins.id, { name: (e.target as HTMLInputElement).value })}
                      class="flex-1 bg-transparent text-xs font-semibold border-b border-slate-300 dark:border-slate-600 focus:border-accent-500 outline-none px-1"
                    />
                    <span class="text-[11px] text-slate-400 font-mono">
                      {ins.sequence.replace(/\s/g, '').length} bp
                    </span>
                    {inserts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteInsert(ins.id)}
                        class="text-slate-400 hover:text-rose-600 text-xs px-1"
                        title="Remove fragment"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={ins.sequence}
                    onInput={(e) => handleUpdateInsert(ins.id, { sequence: (e.target as HTMLTextAreaElement).value })}
                    placeholder="Paste insert DNA sequence (5' to 3')..."
                    class={FIELD}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Construct Metrics Banner */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Recombinant Construct
                </span>
                <h2 class="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
                  {assembly?.assembledLength.toLocaleString()} <span class="text-sm font-bold text-slate-500">bp</span>
                </h2>
              </div>
              <div class="flex items-center gap-4 text-right text-xs">
                <div>
                  <span class="text-slate-400 block">GC Content</span>
                  <span class="font-bold font-mono text-slate-800 dark:text-slate-200">
                    {assembly ? calcGc(assembly.assembledSequence).toFixed(1) : 0}%
                  </span>
                </div>
                <div>
                  <span class="text-slate-400 block">Junctions</span>
                  <span class="font-bold font-mono text-slate-800 dark:text-slate-200">
                    {assembly?.junctions.length || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Assembly Chain */}
            <div class="flex flex-wrap items-center gap-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
              <span class="px-2.5 py-1 rounded-md font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {s.vectorName || 'Vector'}
              </span>
              {inserts.map(ins => (
                <div key={ins.id} class="flex items-center gap-1.5">
                  <span class="text-accent-600 font-bold">⇄</span>
                  <span class="px-2.5 py-1 rounded-md font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {ins.name || 'Insert'}
                  </span>
                </div>
              ))}
              <span class="text-accent-600 font-bold">⇄ (circularized)</span>
            </div>
          </div>

          {/* Primers for Ordering */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  PCR Primers for Insert Amplification
                </h3>
                <p class="text-xs text-slate-500">
                  5' lowercase represents homology overlap; 3' UPPERCASE represents gene-specific annealing region.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyAllPrimers}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent-600 hover:bg-accent-700 text-white transition shadow-sm"
              >
                {copiedPrimerId === 'all' ? '✓ Copied TSV!' : '📋 Copy All Primers (TSV)'}
              </button>
            </div>

            <div class="space-y-2 overflow-x-auto">
              {assembly?.primers.map(p => (
                <div
                  key={p.name}
                  class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs space-y-2"
                >
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <strong class="font-bold text-slate-800 dark:text-slate-200">{p.name}</strong>
                      <span class={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.direction === 'forward' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'}`}>
                        {p.direction.toUpperCase()}
                      </span>
                      <span class="text-slate-400 font-mono">({p.totalLength} nt, {p.gcPercent.toFixed(0)}% GC)</span>
                    </div>
                    <div class="flex items-center gap-3 font-mono">
                      <span>Anneal Tm: <strong>{p.annealTm}°C</strong></span>
                      <span>Q5 Ta: <strong class="text-emerald-600 dark:text-emerald-400">{p.recommendedTa}°C</strong></span>
                      <button
                        type="button"
                        onClick={() => handleCopyPrimer(p.name, p.fullSequence)}
                        class="text-accent-600 hover:underline text-xs font-semibold ml-2"
                      >
                        {copiedPrimerId === p.name ? '✓ Copied!' : 'Copy Seq'}
                      </button>
                    </div>
                  </div>

                  {/* Sequence with colored parts */}
                  <div class="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs break-all leading-relaxed select-all">
                    <span class="text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/50 px-1 py-0.5 rounded mr-1">
                      {p.overhangSeq.toLowerCase()}
                    </span>
                    <span class="text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/50 px-1 py-0.5 rounded">
                      {p.annealSeq.toUpperCase()}
                    </span>
                  </div>

                  {p.warnings.length > 0 && (
                    <div class="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                      <span>⚠️</span>
                      <span>{p.warnings.join(' ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Junction Diagnostics */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
              Homology Overlap Junctions ({assembly?.junctions.length})
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              {assembly?.junctions.map((j, idx) => (
                <div
                  key={idx}
                  class={`p-3 rounded-xl border text-xs space-y-1.5 ${j.status === 'optimal' ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40' : 'border-amber-300 bg-amber-50/20 dark:border-amber-800'}`}
                >
                  <div class="flex items-center justify-between">
                    <strong class="font-semibold text-slate-800 dark:text-slate-200">
                      {j.upstreamName} ➔ {j.downstreamName}
                    </strong>
                    <span class={`px-1.5 py-0.5 rounded text-[10px] font-bold ${j.status === 'optimal' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                      {j.status.toUpperCase()}
                    </span>
                  </div>
                  <div class="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    Overlap: <strong>{j.overlapLength} bp</strong> | Tm: <strong>{j.overlapTm}°C</strong> | GC: <strong>{j.overlapGc.toFixed(1)}%</strong>
                  </div>
                  <div class="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all select-all">
                    5'-{j.overlapSeq}-3'
                  </div>
                  <p class="text-[11px] text-slate-500">{j.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      actions={<ActionBar onCopy={copySummary} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
