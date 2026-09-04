import { useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { SCIENCE } from './science';
import {
  type AssemblyMethod,
  type PcrPolymerase,
  type FragmentInput,
  type AssemblyJunction,
  designAssembly,
  calcGc,
} from '@/core/gibson';

interface State {
  method: AssemblyMethod;
  overlapLen: number;
  targetPrimerTm: number;
  vectorName: string;
  vectorSeq: string;
  polymerase: PcrPolymerase;
  circularize: boolean;
  minPrimerLen: number;
  maxPrimerTmDiff: number;
  primerConcNm: number;
  viewMode: 'table' | 'cards';
}

const DEMO_VECTOR = 'GGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAAAACCCTGGCGTTACCCAACTTAATCGCCTTGCAGCACATCCCCCTTTCGCCAGCTGGCGTAATAGCGAAGAGGCCCGCACCGATCGCCCTTCCCAACAGTTGCGCAGCCTGAATGGCGAATGGCGCTTTGCCTGGTTTCCGGCACCAGAAGCGGTGCCGGAAAGCTGGCTGGAGTGCGATCTTCCTGAGGCCGATACTGTCGTCGTCCCCTCAAACTGGCAGATGCACGGT';
const DEMO_INSERT_GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

const DEFAULTS: State = {
  method: 'nebuilder',
  overlapLen: 20,
  targetPrimerTm: 62,
  vectorName: 'NewFragment1',
  vectorSeq: DEMO_VECTOR,
  polymerase: 'q5',
  circularize: true,
  minPrimerLen: 18,
  maxPrimerTmDiff: 5,
  primerConcNm: 500,
  viewMode: 'table',
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono';

function OverhangGraphic({ junction, method }: { junction: AssemblyJunction; method: AssemblyMethod }) {
  const bases = junction.overlapSeq.split('');
  const compMap: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', U: 'A', N: 'N' };
  const compBases = bases.map(b => compMap[b.toUpperCase()] || 'N');

  return (
    <div class="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        <div>
          <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
            Junction: {junction.upstreamName} <span class="text-accent-600 font-normal">➔</span> {junction.downstreamName}
          </span>
          <span class="text-[11px] text-slate-500 ml-2 font-mono">
            ({junction.overlapLength} bp homology, Overlap Tm: {junction.overlapTm}°C)
          </span>
        </div>
        <span class={`px-2 py-0.5 rounded text-[10px] font-bold ${
          junction.status === 'optimal'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        }`}>
          {junction.status.toUpperCase()}
        </span>
      </div>

      <p class="text-[11px] text-slate-500 italic">
        {method === 'nebuilder'
          ? "NEBuilder HiFi 3'→5' exonuclease generates 5' single-stranded overlaps that pair specifically, followed by high-fidelity Q5 polymerase fill-in & Taq ligation."
          : method === 'gibson'
          ? "T5 Exonuclease 5'→3' chew-back generates 3' single-stranded overhangs that specifically anneal at 50°C, followed by Phusion gap fill-in & Taq ligation."
          : "Vaccinia DNA polymerase 3'→5' exonuclease reveals 5' single-stranded homology overhangs that spontaneously hybridize."}
      </p>

      {/* Double-stranded DNA Chewback & Annealing Schematic */}
      <div class="overflow-x-auto p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs shadow-inner">
        <div class="min-w-[560px] space-y-1 select-all">
          {/* Top Strand: Upstream dsDNA -> Overhang */}
          <div class="flex items-center">
            <span class="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 w-28 shrink-0 truncate" title={junction.upstreamName}>
              5' {junction.upstreamName}
            </span>
            <div class="h-3 w-16 bg-indigo-500/80 rounded-l mr-1 flex items-center justify-center text-[9px] text-white font-sans font-bold">
              dsDNA
            </div>
            {/* Exposed single-stranded overhang */}
            <div class="flex items-center bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 rounded px-1.5 py-0.5 shadow-sm">
              {bases.map((b, i) => (
                <span key={i} class="w-3 text-center font-bold text-amber-950 dark:text-amber-200">
                  {b}
                </span>
              ))}
            </div>
            <span class="text-[10px] text-amber-600 dark:text-amber-400 font-bold ml-1.5">3'</span>
            <span class="text-[10px] text-slate-400 italic ml-2">(homology arm)</span>
          </div>

          {/* Annealed Watson-Crick Base Pairing Lines */}
          <div class="flex items-center pl-[180px]">
            <div class="flex items-center px-1.5">
              {bases.map((_, i) => (
                <span key={i} class="w-3 text-center text-slate-400 dark:text-slate-500 select-none font-bold">
                  |
                </span>
              ))}
            </div>
            <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 ml-2 font-sans">
              Annealed Homology Arm ({junction.overlapLength} bp, Tm {junction.overlapTm}°C)
            </span>
          </div>

          {/* Bottom Strand: Overhang <- Downstream dsDNA */}
          <div class="flex items-center pl-[98px]">
            <span class="text-[10px] text-slate-400 italic mr-2">(homology arm)</span>
            <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mr-1.5">3'</span>
            {/* Complementary overhang */}
            <div class="flex items-center bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 rounded px-1.5 py-0.5 shadow-sm">
              {compBases.map((b, i) => (
                <span key={i} class="w-3 text-center font-bold text-emerald-950 dark:text-emerald-200">
                  {b}
                </span>
              ))}
            </div>
            <div class="h-3 w-16 bg-emerald-500/80 rounded-r ml-1 flex items-center justify-center text-[9px] text-white font-sans font-bold">
              dsDNA
            </div>
            <span class="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 w-28 shrink-0 truncate ml-1.5" title={junction.downstreamName}>
              {junction.downstreamName} 5'
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { ToolProps } from '@/tools/registry';

export default function GibsonView(props?: ToolProps & { embedded?: boolean }) {
  const embedded = props?.embedded;
  const [stateSig, shareUrl] = useUrlState<State>('gibson', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [inserts, setInserts] = useState<FragmentInput[]>([
    { id: 'ins1', name: 'NewFragment', sequence: DEMO_INSERT_GFP },
  ]);
  const [copiedPrimerId, setCopiedPrimerId] = useState<string | null>(null);

  // Insert management
  function handleAddInsert() {
    const newId = `ins_${Date.now()}`;
    setInserts(prev => [
      ...prev,
      { id: newId, name: `Fragment_${prev.length + 1}`, sequence: '' },
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
    const header = "Primer Name\tSequence (5'->3')\tLength\t%GC\tTa (°C)\tAnneal Tm (°C)\tOverlap Tm (°C)\tTarget Fragment";
    const rows = assembly.primers.map(p =>
      `${p.name}\t${p.fullSequence}\t${p.totalLength}\t${p.gcPercent}\t${p.recommendedTa}\t${p.annealTm}\t${p.overhangTm}\t${p.targetFragmentName}`
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
      {
        method: s.method,
        overlapLen: s.overlapLen,
        targetPrimerTm: s.targetPrimerTm,
        circularize: s.circularize,
        polymerase: s.polymerase,
        primerConcentrationNm: s.primerConcNm,
        minPrimerLen: s.minPrimerLen,
        maxPrimerTmDiff: s.maxPrimerTmDiff,
      }
    );
  }, [
    s.vectorName,
    s.vectorSeq,
    inserts,
    s.method,
    s.overlapLen,
    s.targetPrimerTm,
    s.circularize,
    s.polymerase,
    s.primerConcNm,
    s.minPrimerLen,
    s.maxPrimerTmDiff,
  ]);

  // IDT bulk ordering CSV
  const idtBulkOrderCsv = useMemo(() => {
    if (!assembly || assembly.primers.length === 0) return '';
    const rows = assembly.primers.map(p => `${p.name},${p.fullSequence},25nm,STD`);
    return ['Name,Sequence,Scale,Purification', ...rows].join('\n');
  }, [assembly]);

  const copySummary = () => {
    if (!assembly) return '';
    const lines = [
      `Assembly Plan (${s.method.toUpperCase()} with ${s.polymerase.toUpperCase()}):`,
      `Assembled Length: ${assembly.assembledLength} bp (${calcGc(assembly.assembledSequence).toFixed(1)}% GC)`,
      `Overlap Homology: ${s.overlapLen} bp | Primer Target Tm: ${s.targetPrimerTm}°C | Circular: ${s.circularize ? 'Yes' : 'No'}`,
      '',
      'Primers for Ordering (IDT Bulk Format):',
      idtBulkOrderCsv,
      '',
      'Junctions:',
      ...assembly.junctions.map(j => `  ${j.upstreamName} -> ${j.downstreamName}: ${j.overlapLength} bp, Tm ${j.overlapTm}°C (${j.message})`),
    ];
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="🧬"
      title="Gibson & NEBuilder HiFi Assembly Designer"
      blurb="Official NEBuilder HiFi (#E5520) & Gibson homology arm designer, Q5 High-Fidelity PCR primers, balanced junction Tm diagnostics, and seamless construct sequences."
      wide={true}
      embedded={embedded}
      inputs={
        <div class="space-y-4">
          {/* Method & Kit Selection */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Product / Assembly Kit
            </label>
            <div class="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
              <button
                type="button"
                onClick={() => set({ method: 'nebuilder', overlapLen: 20, polymerase: 'q5', primerConcNm: 500, minPrimerLen: 18 })}
                class={`py-1.5 px-2 font-semibold rounded-md transition text-center ${s.method === 'nebuilder' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                NEBuilder HiFi (#E5520)
              </button>
              <button
                type="button"
                onClick={() => set({ method: 'gibson', overlapLen: 25, polymerase: 'phusion', primerConcNm: 200 })}
                class={`py-1.5 px-2 font-semibold rounded-md transition text-center ${s.method === 'gibson' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Gibson Assembly
              </button>
              <button
                type="button"
                onClick={() => set({ method: 'infusion', overlapLen: 18, polymerase: 'taq', primerConcNm: 200 })}
                class={`py-1.5 px-2 font-semibold rounded-md transition text-center ${s.method === 'infusion' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                In-Fusion HD
              </button>
            </div>

            {/* Polymerase & Circularize */}
            <div class="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label class="block text-xs text-slate-500 mb-1">PCR Polymerase / Kit</label>
                <select
                  value={s.polymerase}
                  onChange={(e) => set({ polymerase: (e.target as HTMLSelectElement).value as PcrPolymerase })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-medium"
                >
                  <option value="q5">Q5 High-Fidelity DNA Polymerase</option>
                  <option value="phusion">Phusion High-Fidelity Polymerase</option>
                  <option value="taq">Standard Taq / OneTaq</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Circularize Construct?</label>
                <div class="flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 text-xs bg-slate-50 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => set({ circularize: true })}
                    class={`flex-1 py-1 font-semibold rounded-md transition ${s.circularize ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    Yes (Plasmid)
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ circularize: false })}
                    class={`flex-1 py-1 font-semibold rounded-md transition ${!s.circularize ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    No (Linear)
                  </button>
                </div>
              </div>
            </div>

            {/* Overlap & Tm Parameters */}
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Min Overlap (nt)</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.overlapLen}
                  onChange={overlapLen => set({ overlapLen: Math.round(overlapLen) })}
                  min={15}
                  max={45}
                  step={1}
                />
              </div>
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Min Primer Len (nt)</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.minPrimerLen}
                  onChange={minPrimerLen => set({ minPrimerLen: Math.round(minPrimerLen) })}
                  min={15}
                  max={30}
                  step={1}
                />
              </div>
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Primer Conc (nM)</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.primerConcNm}
                  onChange={primerConcNm => set({ primerConcNm: Math.round(primerConcNm) })}
                  min={50}
                  max={1000}
                  step={50}
                />
              </div>
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Max ΔTm (°C)</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.maxPrimerTmDiff}
                  onChange={maxPrimerTmDiff => set({ maxPrimerTmDiff })}
                  min={1}
                  max={10}
                  step={0.5}
                />
              </div>
            </div>
          </div>

          {/* Vector / Fragment 1 Input */}
          <div class="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Fragment 1 / Vector
              </label>
              <span class="text-[11px] text-slate-500 font-mono">
                {s.vectorSeq.replace(/\s/g, '').length} bp
              </span>
            </div>
            <input
              type="text"
              value={s.vectorName}
              onInput={(e) => set({ vectorName: (e.target as HTMLInputElement).value })}
              placeholder="Fragment Name (e.g. NewFragment1)"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
            />
            <textarea
              rows={4}
              value={s.vectorSeq}
              onInput={(e) => set({ vectorSeq: (e.target as HTMLTextAreaElement).value })}
              placeholder="Paste DNA sequence (5' to 3')..."
              class={FIELD}
            />
            <p class="text-[11px] text-slate-500">
              In circular assembly, Fragment 1 3' end connects to Fragment 2, and Fragment 1 5' connects to the final fragment.
            </p>
          </div>

          {/* Insert Fragments */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Fragments / Inserts ({inserts.length})
              </label>
              <button
                type="button"
                onClick={handleAddInsert}
                class="text-xs text-accent-600 dark:text-accent-400 font-semibold hover:underline"
              >
                + Add Another Fragment
              </button>
            </div>

            <div class="space-y-3">
              {inserts.map((ins, idx) => (
                <div key={ins.id} class="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-accent-100 text-accent-800 dark:bg-accent-950 dark:text-accent-300">
                      Fragment {idx + 2}
                    </span>
                    <input
                      type="text"
                      value={ins.name}
                      onInput={(e) => handleUpdateInsert(ins.id, { name: (e.target as HTMLInputElement).value })}
                      placeholder="Fragment Name (e.g. NewFragment)"
                      class="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
                    />
                    {inserts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteInsert(ins.id)}
                        class="text-rose-500 hover:text-rose-700 text-xs px-2 py-1 font-bold"
                        title="Delete fragment"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    value={ins.sequence}
                    onInput={(e) => handleUpdateInsert(ins.id, { sequence: (e.target as HTMLTextAreaElement).value })}
                    placeholder="Paste sequence (5' to 3')..."
                    class={FIELD}
                  />
                  <div class="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>Length: {ins.sequence.replace(/\s/g, '').length} bp</span>
                    <span>GC: {calcGc(ins.sequence).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      results={
        <div class="space-y-5">
          {/* Construct Summary Header */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <span class="text-xs font-bold uppercase tracking-wider text-accent-600">
                  {s.method === 'nebuilder' ? 'NEBuilder HiFi DNA Assembly' : s.method.toUpperCase()} Construct
                </span>
                <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {assembly?.assembledLength.toLocaleString()} bp Assembled Construct
                </h2>
              </div>
              <div class="flex items-center gap-3 font-mono text-xs">
                <span class="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-semibold">
                  GC: {calcGc(assembly?.assembledSequence || '').toFixed(1)}%
                </span>
                <span class="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                  {assembly?.junctions.length} Seamless Junctions
                </span>
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
              {s.circularize && <span class="text-accent-600 font-bold">⇄ (circularized)</span>}
            </div>
          </div>

          {/* Designed Primers Table & Cards */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  PCR Primers for Assembly ({assembly?.primers.length || 0})
                </h3>
                <p class="text-xs text-slate-500">
                  5' lowercase represents homology overlap; 3' uppercase represents template annealing region.
                </p>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                  <button
                    type="button"
                    onClick={() => set({ viewMode: 'table' })}
                    class={`px-2.5 py-1 font-semibold rounded-md transition ${s.viewMode === 'table' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    Table
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ viewMode: 'cards' })}
                    class={`px-2.5 py-1 font-semibold rounded-md transition ${s.viewMode === 'cards' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    Cards
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleCopyAllPrimers}
                  class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent-600 hover:bg-accent-700 text-white transition shadow-sm"
                >
                  {copiedPrimerId === 'all' ? '✓ Copied TSV!' : '📋 Copy All (TSV)'}
                </button>
              </div>
            </div>

            {s.viewMode === 'table' ? (
              <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table class="w-full text-left text-xs border-collapse font-mono">
                  <thead class="bg-slate-50 dark:bg-slate-950/80 text-[11px] font-sans font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th class="p-2.5">Primer Name</th>
                      <th class="p-2.5">Sequence (5' ➔ 3')</th>
                      <th class="p-2.5 text-center">Length</th>
                      <th class="p-2.5 text-center">%GC</th>
                      <th class="p-2.5 text-center">Ta (°C)</th>
                      <th class="p-2.5 text-center">Tm (Anneal)</th>
                      <th class="p-2.5 text-center">Tm (Overlap)</th>
                      <th class="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                    {assembly?.primers.map(p => (
                      <tr key={p.name} class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                        <td class="p-2.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {p.name}
                        </td>
                        <td class="p-2.5 break-all max-w-xs md:max-w-md">
                          <span class="text-indigo-600 dark:text-indigo-400 font-semibold">{p.overhangSeq.toLowerCase()}</span>
                          <span class="text-emerald-700 dark:text-emerald-300 font-bold">{p.annealSeq.toLowerCase()}</span>
                        </td>
                        <td class="p-2.5 text-center">{p.totalLength}</td>
                        <td class="p-2.5 text-center">{p.gcPercent}</td>
                        <td class="p-2.5 text-center font-bold text-emerald-600 dark:text-emerald-400">{p.recommendedTa}</td>
                        <td class="p-2.5 text-center">{p.annealTm.toFixed(1)}</td>
                        <td class="p-2.5 text-center text-slate-500">{p.overhangTm.toFixed(1)}</td>
                        <td class="p-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleCopyPrimer(p.name, p.fullSequence)}
                            class="px-2 py-1 text-[11px] font-sans font-semibold rounded bg-slate-100 dark:bg-slate-800 hover:bg-accent-100 dark:hover:bg-accent-950 text-accent-700 dark:text-accent-300 transition"
                          >
                            {copiedPrimerId === p.name ? '✓ Copied' : 'Copy'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div class="space-y-2">
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
                        <span class="text-slate-400 font-mono">({p.totalLength} nt, {p.gcPercent}% GC)</span>
                      </div>
                      <div class="flex items-center gap-3 font-mono">
                        <span>Anneal Tm: <strong>{p.annealTm.toFixed(1)}°C</strong></span>
                        <span>Ta: <strong class="text-emerald-600 dark:text-emerald-400">{p.recommendedTa}°C</strong></span>
                        <button
                          type="button"
                          onClick={() => handleCopyPrimer(p.name, p.fullSequence)}
                          class="text-accent-600 hover:underline text-xs font-semibold ml-2"
                        >
                          {copiedPrimerId === p.name ? '✓ Copied!' : 'Copy Seq'}
                        </button>
                      </div>
                    </div>

                    <div class="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs break-all leading-relaxed select-all">
                      <span class="text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/50 px-1 py-0.5 rounded mr-1">
                        {p.overhangSeq.toLowerCase()}
                      </span>
                      <span class="text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/50 px-1 py-0.5 rounded">
                        {p.annealSeq.toLowerCase()}
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
            )}
          </div>

          {/* Overlap Graphics & Diagnostics */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
            <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
              Homology Overlap Junctions & Hybridization Schematics
            </h3>
            <div class="space-y-4">
              {assembly?.junctions.map((j, i) => (
                <OverhangGraphic key={i} junction={j} method={s.method} />
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
