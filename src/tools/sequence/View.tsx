import { useMemo } from 'preact/hooks';
import { useUrlState, encodeState } from '@/lib/url-state';
import { toHash } from '@/app/router';
import { downloadText } from '@/lib/export';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { cleanNucleic, gcContent, reverseComplement } from '@/core/nucleic/sequence';
import { tmBasic } from '@/core/nucleic/tm';
import { AA_KD, extinctionCoefficients, netCharge, sanitize, summarize } from '@/core/protein';
import { chargeProfile } from '@/core/protein/profiles';
import { foldQuickRna, normaliseSelection, QUICK_RNA_MAX_LENGTH, sequenceTypeHint, transformAnnotationsForEdit, type Selection, type SequenceAnnotation, type SequenceKind } from '@/core/sequence-annotator';
import type { ProteinFeature } from '@/core/protein/features';
import { AnnotationEditor } from './AnnotationEditor';
import { detectSequenceFeatures } from './features';
import { RangeInspector } from './RangeInspector';
import { SequenceCanvas } from './SequenceCanvas';
import { SCIENCE } from './science';

type ColourMode = 'plain' | 'type' | 'charge' | 'hydropathy' | 'gc';
interface State { raw: string; kind: SequenceKind; annotations: SequenceAnnotation[]; annotationLayer: boolean; selection: Selection | null; pH: number; residuesPerRow: number; colourMode: ColourMode; featureLayer: boolean; rnaStructureLayer: boolean; activeFeature: ProteinFeature | null; }
const DEFAULTS: State = { raw: `>example_dna\nATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG`, kind: 'DNA', annotations: [], annotationLayer: false, selection: null, pH: 7, residuesPerRow: 60, colourMode: 'type', featureLayer: false, rnaStructureLayer: false, activeFeature: null };
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

function parseInput(raw: string, kind: SequenceKind): { header: string; seq: string; kind: SequenceKind; removed: number } {
  const lines = raw.replace(/\r/g, '').split('\n');
  const headerLine = lines.find(line => line.trim().startsWith('>'));
  const header = headerLine?.trim().replace(/^>\s*/, '') || 'Untitled sequence';
  const content = lines.filter(line => !line.trim().startsWith('>')).join('');
  if (kind === 'protein') {
    const result = sanitize(content);
    return { header, seq: result.seq, kind, removed: Object.values(result.removed).reduce((sum, value) => sum + value, 0) };
  }
  const result = cleanNucleic(content);
  return { header, seq: result.seq, kind, removed: result.removed.whitespace + result.removed.digits + result.removed.other };
}

function editBetween(before: string, after: string) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return { start: prefix + 1, deleted: before.length - prefix - suffix, inserted: after.length - prefix - suffix };
}

function proteinColour(residue: string, mode: ColourMode, charge: number) {
  if (mode === 'plain') return 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200';
  if (mode === 'charge') return charge > 0.15 ? 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100' : charge < -0.15 ? 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  if (mode === 'hydropathy') {
    const value = AA_KD[residue] ?? 0;
    return value >= 1.5 ? 'bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-50' : value <= -1.5 ? 'bg-cyan-100 text-cyan-950 dark:bg-cyan-950 dark:text-cyan-50' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  }
  if ('KRH'.includes(residue)) return 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100';
  if ('DE'.includes(residue)) return 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100';
  if ('ILVAMFWY'.includes(residue)) return 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-50';
  if ('STNQ'.includes(residue)) return 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50';
  if ('GP'.includes(residue)) return 'bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-50';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

function nucleicColour(base: string, mode: ColourMode) {
  if (mode === 'plain') return 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200';
  if (mode === 'gc') return 'GC'.includes(base) ? 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50' : 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-50';
  if ('AG'.includes(base)) return 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100';
  if ('CTU'.includes(base)) return 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

export default function SequenceView() {
  const [state, shareUrl] = useUrlState<State>('bb.sequence', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const selectedKind = s.kind ?? 'DNA';
  const parsed = useMemo(() => parseInput(s.raw, selectedKind), [s.raw, selectedKind]);
  const typeHint = useMemo(() => sequenceTypeHint(s.raw), [s.raw]);
  const selection = normaliseSelection(s.selection?.start ?? 0, s.selection?.end ?? 0, parsed.seq.length);
  const selectedSeq = selection ? parsed.seq.slice(selection.start - 1, selection.end) : '';
  const chargeValues = useMemo(() => parsed.kind === 'protein' ? chargeProfile(parsed.seq, s.pH, 1) : [], [parsed, s.pH]);
  const detectedFeatures = useMemo(() => s.featureLayer && parsed.kind === 'protein' ? detectSequenceFeatures(parsed.seq, parsed.kind) : [], [parsed.kind, parsed.seq, s.featureLayer]);
  const proteinRange = useMemo(() => {
    if (parsed.kind !== 'protein' || !selectedSeq) return null;
    const summary = summarize(selectedSeq);
    return { ...summary, charge: netCharge(summary.counts, s.pH, 'bjellqvist', selectedSeq), ext: extinctionCoefficients(summary.counts, summary.mw, 'native') };
  }, [parsed.kind, selectedSeq, s.pH]);
  const nucleicRange = useMemo(() => {
    if (parsed.kind === 'protein' || !selectedSeq) return null;
    try {
      const tm = tmBasic(selectedSeq);
      return { gc: gcContent(selectedSeq) * 100, reverseComplement: reverseComplement(selectedSeq, parsed.kind), tm: { value: tm.tm, warnings: tm.warnings } };
    } catch {
      return { gc: gcContent(selectedSeq) * 100, reverseComplement: reverseComplement(selectedSeq, parsed.kind) };
    }
  }, [parsed.kind, selectedSeq]);
  const rnaStructureResult = useMemo(() => {
    if (parsed.kind !== 'RNA' || !s.rnaStructureLayer || !selectedSeq) return { structure: null, message: null };
    if (selectedSeq.length > QUICK_RNA_MAX_LENGTH) return { structure: null, message: `Select up to ${QUICK_RNA_MAX_LENGTH} nt to draw a quick RNA structure.` };
    return { structure: foldQuickRna(selectedSeq), message: null };
  }, [parsed.kind, s.rnaStructureLayer, selectedSeq]);

  function updateRaw(raw: string) {
    const prior = parseInput(s.raw, selectedKind);
    const next = parseInput(raw, selectedKind);
    const edit = editBetween(prior.seq, next.seq);
    const annotations = prior.kind === next.kind ? transformAnnotationsForEdit(s.annotations, edit.start, edit.deleted, edit.inserted, next.seq.length) : [];
    set({ raw, annotations, selection: null, activeFeature: null });
  }
  function addAnnotation(input: Omit<SequenceAnnotation, 'id' | 'start' | 'end' | 'evidence'>) {
    if (!selection) return;
    set({ annotations: [...s.annotations, { ...input, id: `annotation-${Date.now()}-${s.annotations.length}`, start: selection.start, end: selection.end, evidence: 'user' }], annotationLayer: true });
  }
  function selectKind(kind: SequenceKind) {
    if (kind === selectedKind) return;
    set({ kind, annotations: [], annotationLayer: false, selection: null, colourMode: 'type', featureLayer: false, rnaStructureLayer: false, activeFeature: null });
  }
  function exportJson() { downloadText(JSON.stringify({ schemaVersion: 1, header: parsed.header, sequence: parsed.seq, kind: parsed.kind, annotations: s.annotations }, null, 2), 'sequence-annotations.json', 'application/json;charset=utf-8'); }

  const proteinHref = toHash({ name: 'tool', toolId: 'protein', state: encodeState({ fasta: `>${parsed.header}\n${parsed.seq}`, selection }) });
  const plasmidHref = toHash({ name: 'tool', toolId: 'plasmid', state: encodeState({ sequence: parsed.seq, selection }) });
  const copyText = () => `${parsed.header}\n${parsed.kind} · ${parsed.seq.length} residues\n${selection ? `Selection: ${selection.start}–${selection.end} (${selectedSeq})` : 'No selection'}\nAnnotations: ${s.annotations.length}\n\n${scienceText(SCIENCE)}`;

  return <ToolLayout
    icon="🔤" title="Sequence Annotator" blurb="Select, colour, annotate, and analyse linear protein, DNA, and RNA sequences locally."
    inputs={<div class="space-y-4">
      <label for="sequence-input" class="block"><span class="mb-1 block text-sm font-medium">Sequence input</span><textarea id="sequence-input" aria-label="Sequence input" rows={8} class={`${FIELD} mono text-xs`} value={s.raw} onInput={event => updateRaw((event.target as HTMLTextAreaElement).value)} /></label>
      <fieldset aria-label="Sequence type"><legend class="mb-1 text-xs font-medium">Sequence type</legend><div role="radiogroup" aria-label="Sequence type" class="grid grid-cols-3 rounded-lg border border-slate-300 p-1 dark:border-slate-700">{(['DNA', 'RNA', 'protein'] as SequenceKind[]).map(kind => <button key={kind} type="button" role="radio" aria-checked={selectedKind === kind} onClick={() => selectKind(kind)} class={`rounded-md px-2 py-1.5 text-xs font-semibold ${selectedKind === kind ? 'bg-accent-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{kind === 'protein' ? 'Protein' : kind}</button>)}</div></fieldset>
      <p class={`rounded-lg px-2.5 py-2 text-xs ${typeHint.confidence === 'uncertain' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200' : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'}`}>{typeHint.label} <span class="text-slate-500">— selected as {selectedKind === 'protein' ? 'Protein' : selectedKind}</span></p>
      <p class="text-xs text-slate-500">{parsed.header} · {parsed.seq.length.toLocaleString()} {parsed.kind === 'protein' ? 'aa' : 'nt'} · {parsed.kind}{parsed.removed ? ` · ${parsed.removed} non-sequence character${parsed.removed === 1 ? '' : 's'} ignored` : ''}</p>
      <label class="block text-xs font-medium">Colour mode<select class={`${FIELD} mt-1`} value={s.colourMode} onChange={event => set({ colourMode: (event.target as HTMLSelectElement).value as ColourMode })}><option value="plain">Plain</option><option value="type">{parsed.kind === 'protein' ? 'Chemical class' : 'Base class'}</option>{parsed.kind === 'protein' ? <><option value="charge">Charge at pH</option><option value="hydropathy">Hydropathy</option></> : <option value="gc">GC vs AT(U)</option>}</select></label>
      <label class="block text-xs font-medium">Residues per row<select class={`${FIELD} mt-1`} value={s.residuesPerRow} onChange={event => set({ residuesPerRow: Number((event.target as HTMLSelectElement).value) })}><option value={30}>30</option><option value={45}>45</option><option value={60}>60</option></select></label>
      {parsed.kind === 'protein' && <label class="block text-xs font-medium">Charge pH<input aria-label="Charge pH" class="mt-1 w-full" type="range" min="0" max="14" step="0.1" value={s.pH} onInput={event => set({ pH: Number((event.target as HTMLInputElement).value) })} /><span class="mono text-accent-600">{s.pH.toFixed(1)}</span></label>}
      <details class="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-800"><summary class="cursor-pointer font-semibold">Analysis layers</summary><div class="mt-2 space-y-2"><label class="flex items-center gap-2"><input type="checkbox" checked={s.annotationLayer} onClick={() => set({ annotationLayer: !s.annotationLayer })} />Show annotation marks</label>{parsed.kind === 'protein' && <label class="flex items-center gap-2"><input type="checkbox" aria-label="Protein feature candidates" checked={s.featureLayer} onClick={() => set({ featureLayer: !s.featureLayer })} />Protein feature candidates</label>}{parsed.kind === 'RNA' && <label class="flex items-center gap-2"><input type="checkbox" aria-label="RNA secondary structure" checked={s.rnaStructureLayer} onClick={() => set({ rnaStructureLayer: !s.rnaStructureLayer })} />RNA secondary structure</label>}</div></details>
      <div class="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" onClick={exportJson} class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Export annotations JSON</button><button type="button" onClick={() => downloadText(`>${parsed.header}\n${parsed.seq}\n`, 'sequence.fasta', 'text/x-fasta;charset=utf-8')} class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Export FASTA</button></div>
      <div class="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">{parsed.kind === 'protein' ? <a class="font-semibold text-accent-700 hover:underline dark:text-accent-300" href={proteinHref}>Open sequence in Protein Workbench →</a> : <a class="font-semibold text-accent-700 hover:underline dark:text-accent-300" href={plasmidHref}>Open sequence in Plasmid Viewer →</a>}</div>
    </div>}
    results={<div class="space-y-4">
      <RangeInspector selection={selection} length={parsed.seq.length} kind={parsed.kind} preview={selectedSeq} proteinMetrics={proteinRange ? { mw: proteinRange.mw, mono: proteinRange.mono, pI: proteinRange.pI, charge: proteinRange.charge, pH: s.pH, extinction: proteinRange.ext.reduced } : null} nucleicMetrics={nucleicRange} features={detectedFeatures} activeFeature={s.activeFeature} onFeatureSelect={feature => set({ selection: { start: feature.start, end: feature.end }, activeFeature: feature })} rnaStructure={rnaStructureResult.structure} rnaStructureMessage={rnaStructureResult.message} onSelectionChange={next => set({ selection: next, activeFeature: null })} />
      <section aria-label="Sequence workbench" class="rounded-2xl border border-slate-200 bg-slate-50/40 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-950/20">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2"><div><h2 class="text-sm font-bold">Sequence workspace</h2><p class="mt-0.5 text-xs text-slate-500">Fixed-pitch residues; annotations are top marks, detected protein features are lower marks.</p></div><span class="font-mono text-xs text-slate-500">{s.residuesPerRow} per row</span></div>
        <SequenceCanvas sequence={parsed.seq} annotations={s.annotationLayer ? s.annotations : []} features={detectedFeatures} selection={selection} residuesPerRow={s.residuesPerRow} colourFor={(residue, position) => parsed.kind === 'protein' ? proteinColour(residue, s.colourMode, chargeValues[position - 1] ?? 0) : nucleicColour(residue, s.colourMode)} onSelectionChange={next => set({ selection: next, activeFeature: null })} onFeatureSelect={feature => set({ selection: { start: feature.start, end: feature.end }, activeFeature: feature })} />
      </section>
      <AnnotationEditor selection={selection} annotations={s.annotations} onCreate={addAnnotation} onSelect={annotation => set({ selection: { start: annotation.start, end: annotation.end } })} onRemove={id => set({ annotations: s.annotations.filter(annotation => annotation.id !== id) })} />
    </div>}
    actions={<ActionBar onCopy={copyText} shareUrl={shareUrl} />} science={<SciencePanel science={SCIENCE} />}
    wide
  />;
}
