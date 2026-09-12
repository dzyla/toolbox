import { useEffect, useRef, useState } from 'preact/hooks';
import { normaliseSelection, type Selection, type SequenceKind } from '@/core/sequence-annotator';
import type { QuickRnaStructure } from '@/core/sequence-annotator';
import type { ProteinFeature } from '@/core/protein/features';
import { RnaStructure } from './RnaStructure';

interface ProteinMetrics {
  mw: number;
  mono: number;
  pI: number;
  charge: number;
  pH: number;
  extinction: number;
}

interface NucleicMetrics {
  gc: number;
  reverseComplement: string;
  tm?: { value: number; warnings: string[] };
}

interface Props {
  selection: Selection | null;
  length: number;
  kind: SequenceKind;
  preview: string;
  proteinMetrics?: ProteinMetrics | null;
  nucleicMetrics?: NucleicMetrics | null;
  features?: ProteinFeature[];
  activeFeature?: ProteinFeature | null;
  onFeatureSelect?: (feature: ProteinFeature) => void;
  rnaStructure?: QuickRnaStructure | null;
  rnaStructureMessage?: string | null;
  onSelectionChange: (selection: Selection | null) => void;
}

function compactPreview(sequence: string, limit = 34) {
  if (sequence.length <= limit) return sequence;
  const edge = Math.floor((limit - 1) / 2);
  return `${sequence.slice(0, edge)}…${sequence.slice(-edge)}`;
}

export function RangeInspector({ selection, length, kind, preview, proteinMetrics, nucleicMetrics, features = [], activeFeature, onFeatureSelect, rnaStructure, rnaStructureMessage, onSelectionChange }: Props) {
  const [draftStart, setDraftStart] = useState(selection ? String(selection.start) : '');
  const [draftEnd, setDraftEnd] = useState(selection ? String(selection.end) : '');
  const locallyAppliedSelection = useRef<string | null>(null);

  useEffect(() => {
    const key = selection ? `${selection.start}:${selection.end}` : '';
    if (locallyAppliedSelection.current === key) return;
    setDraftStart(selection ? String(selection.start) : '');
    setDraftEnd(selection ? String(selection.end) : '');
  }, [selection?.start, selection?.end]);

  if (!selection) return <section class="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-3 py-3 dark:border-indigo-900 dark:bg-indigo-950/20" aria-label="Selection inspector"><p class="text-sm text-slate-600 dark:text-slate-300">Select residues in the sequence, then refine the range here.</p><FeatureCandidates features={features} activeFeature={activeFeature} onFeatureSelect={onFeatureSelect} /></section>;
  const updateCoordinate = (nextStart: string, nextEnd: string) => {
    setDraftStart(nextStart);
    setDraftEnd(nextEnd);
    const start = Number(nextStart), end = Number(nextEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || start > length || end < 1 || end > length) return;
    const next = normaliseSelection(start, end, length);
    locallyAppliedSelection.current = next ? `${next.start}:${next.end}` : '';
    onSelectionChange(next);
  };
  const unit = kind === 'protein' ? 'aa' : 'nt';

  return <section class="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2.5 dark:border-indigo-900 dark:bg-indigo-950/30" aria-label="Selection inspector">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <strong class="text-sm text-slate-900 dark:text-slate-100">Selection: {selection.start}–{selection.end}</strong>
      <label class="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">Start
        <input aria-label="Selection start" class="w-20 rounded border border-indigo-200 bg-white px-1.5 py-1 font-mono text-xs dark:border-indigo-800 dark:bg-slate-950" type="number" min={1} max={length} value={draftStart} onInput={event => updateCoordinate(event.currentTarget.value, draftEnd)} />
      </label>
      <label class="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">End
        <input aria-label="Selection end" class="w-20 rounded border border-indigo-200 bg-white px-1.5 py-1 font-mono text-xs dark:border-indigo-800 dark:bg-slate-950" type="number" min={1} max={length} value={draftEnd} onInput={event => updateCoordinate(draftStart, event.currentTarget.value)} />
      </label>
      <span class="rounded-full bg-white px-2 py-1 font-mono text-xs font-semibold text-indigo-800 shadow-xs dark:bg-slate-900 dark:text-indigo-200">{preview.length} {unit} selected</span>
      <span class="min-w-0 flex-1 truncate font-mono text-xs text-slate-600 dark:text-slate-300" title={preview}>{compactPreview(preview)}</span>
      </div>
      <div class="mt-3 grid gap-2 border-t border-indigo-200/70 pt-3 text-xs dark:border-indigo-900/70 sm:grid-cols-3">
        {proteinMetrics && <>
          <Metric label="Length" value={`${preview.length} aa`} /><Metric label="Average mass" value={`${proteinMetrics.mw.toFixed(2)} Da`} />
          <Metric label="Monoisotopic mass" value={`${proteinMetrics.mono.toFixed(4)} Da`} /><Metric label="Theoretical pI" value={proteinMetrics.pI.toFixed(2)} />
          <Metric label={`Net charge at pH ${proteinMetrics.pH.toFixed(1)}`} value={`${proteinMetrics.charge.toFixed(2)} e`} /><Metric label="ε280 (reduced)" value={`${proteinMetrics.extinction.toFixed(0)} M⁻¹cm⁻¹`} />
        </>}
        {nucleicMetrics && <>
          <Metric label="Length" value={`${preview.length} nt`} /><Metric label="GC content" value={`${nucleicMetrics.gc.toFixed(1)}%`} />
          {nucleicMetrics.tm && <Metric label="Quick oligo Tm" value={`${nucleicMetrics.tm.value.toFixed(1)} °C`} />}
          <div class="sm:col-span-3"><dt class="text-slate-500">Reverse complement</dt><dd class="mt-0.5 break-all font-mono font-semibold text-slate-800 dark:text-slate-100">{nucleicMetrics.reverseComplement}</dd></div>
          {nucleicMetrics.tm?.warnings.map(warning => <p key={warning} class="sm:col-span-3 text-amber-700 dark:text-amber-300">{warning}</p>)}
        </>}
      </div>
      <FeatureCandidates features={features} activeFeature={activeFeature} onFeatureSelect={onFeatureSelect} />
      {rnaStructure && <RnaStructure structure={rnaStructure} />}
      {rnaStructureMessage && <p class="mt-3 border-t border-indigo-200/70 pt-3 text-xs text-amber-700 dark:border-indigo-900/70 dark:text-amber-300">{rnaStructureMessage}</p>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt class="text-slate-500">{label}</dt><dd class="mt-0.5 font-mono font-semibold text-slate-800 dark:text-slate-100">{value}</dd></div>;
}

function FeatureCandidates({ features, activeFeature, onFeatureSelect }: Pick<Props, 'features' | 'activeFeature' | 'onFeatureSelect'>) {
  if (!features?.length) return null;
  return <div class="mt-3 border-t border-indigo-200/70 pt-3 dark:border-indigo-900/70">
    <div class="flex items-baseline justify-between gap-2"><h3 class="text-xs font-bold text-slate-800 dark:text-slate-100">Feature candidates</h3><span class="font-mono text-xs text-slate-500">{features.length} hit{features.length === 1 ? '' : 's'}</span></div>
    <div class="mt-2 flex flex-wrap gap-1.5">{features.map((feature, index) => <button key={`${feature.kind}-${feature.name}-${feature.start}-${index}`} type="button" aria-label={`Feature candidate: ${feature.name}, residues ${feature.start}–${feature.end}`} onClick={() => onFeatureSelect?.(feature)} class="rounded-full border px-2 py-1 text-xs font-semibold hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-accent-500" style={{ borderColor: feature.color, color: feature.color, backgroundColor: `${feature.color}14` }}>{feature.name} <span class="font-mono opacity-70">{feature.start}–{feature.end}</span></button>)}</div>
    {activeFeature && <div class="mt-2 rounded-lg border border-indigo-200 bg-white/70 px-2.5 py-2 text-xs dark:border-indigo-900 dark:bg-slate-950/40"><div class="flex items-baseline justify-between gap-2"><strong>{activeFeature.name}</strong><span class="font-mono text-slate-500">{activeFeature.start}–{activeFeature.end}</span></div><p class="mt-1 text-slate-600 dark:text-slate-300">{activeFeature.category}{activeFeature.note ? ` · ${activeFeature.note}` : ''}</p></div>}
  </div>;
}
