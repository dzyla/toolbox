import { useMemo } from 'preact/hooks';
import { useUrlState, encodeState } from '@/lib/url-state';
import { toHash } from '@/app/router';
import { downloadText } from '@/lib/export';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { cleanNucleic, detectType, gcContent, reverseComplement } from '@/core/nucleic/sequence';
import { AA_KD, extinctionCoefficients, netCharge, sanitize, summarize } from '@/core/protein';
import { chargeProfile } from '@/core/protein/profiles';
import { normaliseSelection, transformAnnotationsForEdit, type Selection, type SequenceAnnotation, type SequenceKind } from '@/core/sequence-annotator';
import { AnnotationEditor } from './AnnotationEditor';
import { SequenceCanvas } from './SequenceCanvas';
import { SCIENCE } from './science';

type ColourMode = 'plain' | 'type' | 'charge' | 'hydropathy' | 'gc';
interface State { raw: string; annotations: SequenceAnnotation[]; selection: Selection | null; pH: number; residuesPerRow: number; colourMode: ColourMode; }
const DEFAULTS: State = { raw: `>example_dna\nATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG`, annotations: [], selection: null, pH: 7, residuesPerRow: 30, colourMode: 'type' };
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

function parseInput(raw: string): { header: string; seq: string; kind: SequenceKind; removed: number } {
  const lines = raw.replace(/\r/g, '').split('\n');
  const headerLine = lines.find(line => line.trim().startsWith('>'));
  const header = headerLine?.trim().replace(/^>\s*/, '') || 'Untitled sequence';
  const content = lines.filter(line => !line.trim().startsWith('>')).join('');
  const kind = detectType(content) as SequenceKind;
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
  const parsed = useMemo(() => parseInput(s.raw), [s.raw]);
  const selection = normaliseSelection(s.selection?.start ?? 0, s.selection?.end ?? 0, parsed.seq.length);
  const selectedSeq = selection ? parsed.seq.slice(selection.start - 1, selection.end) : '';
  const chargeValues = useMemo(() => parsed.kind === 'protein' ? chargeProfile(parsed.seq, s.pH, 1) : [], [parsed, s.pH]);
  const proteinRange = useMemo(() => {
    if (parsed.kind !== 'protein' || !selectedSeq) return null;
    const summary = summarize(selectedSeq);
    return { ...summary, charge: netCharge(summary.counts, s.pH, 'bjellqvist', selectedSeq), ext: extinctionCoefficients(summary.counts, summary.mw, 'native') };
  }, [parsed.kind, selectedSeq, s.pH]);
  const nucleicRange = useMemo(() => parsed.kind !== 'protein' && selectedSeq ? { gc: gcContent(selectedSeq) * 100, reverseComplement: reverseComplement(selectedSeq, parsed.kind) } : null, [parsed.kind, selectedSeq]);

  function updateRaw(raw: string) {
    const prior = parseInput(s.raw);
    const next = parseInput(raw);
    const edit = editBetween(prior.seq, next.seq);
    const annotations = prior.kind === next.kind ? transformAnnotationsForEdit(s.annotations, edit.start, edit.deleted, edit.inserted, next.seq.length) : [];
    set({ raw, annotations, selection: null });
  }
  function addAnnotation(input: Omit<SequenceAnnotation, 'id' | 'start' | 'end' | 'evidence'>) {
    if (!selection) return;
    set({ annotations: [...s.annotations, { ...input, id: `annotation-${Date.now()}-${s.annotations.length}`, start: selection.start, end: selection.end, evidence: 'user' }] });
  }
  function exportJson() { downloadText(JSON.stringify({ schemaVersion: 1, header: parsed.header, sequence: parsed.seq, kind: parsed.kind, annotations: s.annotations }, null, 2), 'sequence-annotations.json', 'application/json;charset=utf-8'); }

  const proteinHref = toHash({ name: 'tool', toolId: 'protein', state: encodeState({ fasta: `>${parsed.header}\n${parsed.seq}`, selection }) });
  const plasmidHref = toHash({ name: 'tool', toolId: 'plasmid', state: encodeState({ sequence: parsed.seq, selection }) });
  const copyText = () => `${parsed.header}\n${parsed.kind} · ${parsed.seq.length} residues\n${selection ? `Selection: ${selection.start}–${selection.end} (${selectedSeq})` : 'No selection'}\nAnnotations: ${s.annotations.length}\n\n${scienceText(SCIENCE)}`;

  return <ToolLayout
    icon="🔤" title="Sequence Annotator" blurb="Select, colour, annotate, and analyse linear protein, DNA, and RNA sequences locally."
    inputs={<div class="space-y-4">
      <label for="sequence-input" class="block"><span class="mb-1 block text-sm font-medium">Sequence input</span><textarea id="sequence-input" aria-label="Sequence input" rows={8} class={`${FIELD} mono text-xs`} value={s.raw} onInput={event => updateRaw((event.target as HTMLTextAreaElement).value)} /></label>
      <p class="text-xs text-slate-500">{parsed.header} · {parsed.seq.length.toLocaleString()} {parsed.kind === 'protein' ? 'aa' : 'nt'} · {parsed.kind}{parsed.removed ? ` · ${parsed.removed} non-sequence character${parsed.removed === 1 ? '' : 's'} ignored` : ''}</p>
      <label class="block text-xs font-medium">Colour mode<select class={`${FIELD} mt-1`} value={s.colourMode} onChange={event => set({ colourMode: (event.target as HTMLSelectElement).value as ColourMode })}><option value="plain">Plain</option><option value="type">{parsed.kind === 'protein' ? 'Chemical class' : 'Base class'}</option>{parsed.kind === 'protein' ? <><option value="charge">Charge at pH</option><option value="hydropathy">Hydropathy</option></> : <option value="gc">GC vs AT(U)</option>}</select></label>
      <label class="block text-xs font-medium">Residues per row<select class={`${FIELD} mt-1`} value={s.residuesPerRow} onChange={event => set({ residuesPerRow: Number((event.target as HTMLSelectElement).value) })}><option value={30}>30</option><option value={60}>60</option><option value={100}>100</option></select></label>
      {parsed.kind === 'protein' && <label class="block text-xs font-medium">Charge pH<input aria-label="Charge pH" class="mt-1 w-full" type="range" min="0" max="14" step="0.1" value={s.pH} onInput={event => set({ pH: Number((event.target as HTMLInputElement).value) })} /><span class="mono text-accent-600">{s.pH.toFixed(1)}</span></label>}
      <div class="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" onClick={exportJson} class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Export annotations JSON</button><button type="button" onClick={() => downloadText(`>${parsed.header}\n${parsed.seq}\n`, 'sequence.fasta', 'text/x-fasta;charset=utf-8')} class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Export FASTA</button></div>
      <div class="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">{parsed.kind === 'protein' ? <a class="font-semibold text-accent-700 hover:underline dark:text-accent-300" href={proteinHref}>Open sequence in Protein Workbench →</a> : <a class="font-semibold text-accent-700 hover:underline dark:text-accent-300" href={plasmidHref}>Open sequence in Plasmid Viewer →</a>}</div>
    </div>}
    results={<div class="space-y-4">
      {selection ? <div class="rounded-xl border border-accent-200 bg-accent-50 p-3 text-sm dark:border-accent-800 dark:bg-accent-950/40"><strong>Selection: {selection.start}–{selection.end}</strong> <span class="mono text-xs">{selectedSeq}</span></div> : <p class="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">Click a residue/base or drag across the canvas to select a range. Shift-click extends from the selection start.</p>}
      <SequenceCanvas sequence={parsed.seq} annotations={s.annotations} selection={selection} residuesPerRow={s.residuesPerRow} colourFor={(residue, position) => parsed.kind === 'protein' ? proteinColour(residue, s.colourMode, chargeValues[position - 1] ?? 0) : nucleicColour(residue, s.colourMode)} onSelectionChange={next => set({ selection: next })} />
      {proteinRange && <section class="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><h2 class="text-sm font-bold">Selected protein range</h2><dl class="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3"><div><dt>Length</dt><dd class="mono font-bold">{selectedSeq.length} aa</dd></div><div><dt>Average mass</dt><dd class="mono font-bold">{proteinRange.mw.toFixed(2)} Da</dd></div><div><dt>Monoisotopic mass</dt><dd class="mono font-bold">{proteinRange.mono.toFixed(4)} Da</dd></div><div><dt>Theoretical pI</dt><dd class="mono font-bold">{proteinRange.pI.toFixed(2)}</dd></div><div><dt>Net charge at pH {s.pH.toFixed(1)}</dt><dd class="mono font-bold">{proteinRange.charge.toFixed(2)} e</dd></div><div><dt>ε280 (reduced)</dt><dd class="mono font-bold">{proteinRange.ext.reduced.toFixed(0)} M⁻¹cm⁻¹</dd></div></dl></section>}
      {nucleicRange && <section class="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><h2 class="text-sm font-bold">Selected nucleic-acid range</h2><dl class="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt>Length</dt><dd class="mono font-bold">{selectedSeq.length} nt</dd></div><div><dt>GC content</dt><dd class="mono font-bold">{nucleicRange.gc.toFixed(1)}%</dd></div><div class="col-span-2"><dt>Reverse complement</dt><dd class="mono break-all font-bold">{nucleicRange.reverseComplement}</dd></div></dl></section>}
      <AnnotationEditor selection={selection} annotations={s.annotations} onCreate={addAnnotation} onSelect={annotation => set({ selection: { start: annotation.start, end: annotation.end } })} onRemove={id => set({ annotations: s.annotations.filter(annotation => annotation.id !== id) })} />
    </div>}
    actions={<ActionBar onCopy={copyText} shareUrl={shareUrl} />} science={<SciencePanel science={SCIENCE} />}
  />;
}
