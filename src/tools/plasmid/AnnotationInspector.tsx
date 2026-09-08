import { useEffect, useRef, useState } from 'preact/hooks';
import type { Annotation } from '@/core/plasmid/model';
import type { DocumentOrf } from '@/core/plasmid/analysis';
import { locationSequence, type Location, type Strand } from '@/core/plasmid/coordinates';
import { translateDNA } from '@/core/plasmid';
import { addAnnotation, deleteAnnotation, replaceAnnotation } from '@/core/plasmid/document';
import { applyDocumentEdit, clearSelection, selectRange, type WorkspaceState } from './workspace';

export interface AnnotationInspectorProps {
  workspace: WorkspaceState;
  onWorkspaceChange: (workspace: WorkspaceState) => void;
  orfs?: DocumentOrf[];
  onCopy?: (text: string) => void | Promise<void>;
}

const FIELD = 'w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600';
const BUTTON = 'rounded border border-slate-300 px-3 py-1.5 text-sm focus-visible:outline-2 dark:border-slate-600';
let nextManualId = 0;

function AnnotationForm({ annotation, onSave, onCancel }: { annotation: Annotation; onSave: (annotation: Annotation) => void; onCancel?: () => void }) {
  const [name, setName] = useState(annotation.name);
  const [type, setType] = useState(annotation.type);
  const [color, setColor] = useState(annotation.color ?? '');
  const [strand, setStrand] = useState<Strand>(annotation.location.strand);
  const [segments, setSegments] = useState(annotation.location.segments.map(segment => `${segment.start + 1}..${segment.end}`).join(', '));
  const [qualifiers, setQualifiers] = useState(JSON.stringify(annotation.qualifiers, null, 2));
  const [error, setError] = useState('');
  const save = (event: Event) => {
    event.preventDefault();
    try {
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Color must be a six-digit hex color, such as #2563eb.');
      const parsedSegments = segments.split(',').map(value => {
        const match = /^\s*(\d+)\s*(?:\.\.|–|-)\s*(\d+)\s*$/.exec(value);
        if (!match) throw new Error('Use inclusive coordinates such as 1..12, 25..30.');
        return { start: Number(match[1]) - 1, end: Number(match[2]) };
      });
      const parsedQualifiers: unknown = JSON.parse(qualifiers);
      if (!parsedQualifiers || Array.isArray(parsedQualifiers) || typeof parsedQualifiers !== 'object'
        || Object.entries(parsedQualifiers).some(([key, values]) => !key.trim() || !Array.isArray(values) || values.some(value => typeof value !== 'string'))) {
        throw new Error('Qualifiers must be a JSON object with arrays of strings.');
      }
      onSave({ ...annotation, name: name.trim(), type: type.trim(), color: color || undefined, location: { strand, segments: parsedSegments }, qualifiers: parsedQualifiers as Annotation['qualifiers'] });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save annotation.'); }
  };
  return <form onSubmit={save} class="space-y-3">
    <label class="block text-xs">Annotation name<input class={FIELD} value={name} onInput={event => setName(event.currentTarget.value)} /></label>
    <label class="block text-xs">Annotation type<input class={FIELD} value={type} onInput={event => setType(event.currentTarget.value)} /></label>
    <label class="block text-xs">Annotation color<input class={FIELD} placeholder="#2563eb" value={color} onInput={event => setColor(event.currentTarget.value)} /></label>
    <label class="block text-xs">Annotation strand<select class={FIELD} value={strand} onChange={event => setStrand(Number(event.currentTarget.value) as Strand)}><option value="1">Forward (+)</option><option value="-1">Reverse (−)</option><option value="0">Unstranded</option></select></label>
    <label class="block text-xs">Annotation segments (1-based inclusive)<input class={FIELD} value={segments} onInput={event => setSegments(event.currentTarget.value)} /></label>
    <p class="text-xs text-slate-500">List joined segments in stored order, separated by commas. Split origin crossings, for example 90..100, 1..12.</p>
    <label class="block text-xs">Annotation qualifiers (JSON)<textarea class={`${FIELD} min-h-24 font-mono`} value={qualifiers} onInput={event => setQualifiers(event.currentTarget.value)} /></label>
    {error && <p role="alert" class="text-sm text-red-700">{error}</p>}
    <div class="flex flex-wrap gap-2"><button type="submit" class={`${BUTTON} bg-blue-700 text-white`}>Save annotation</button>{onCancel && <button type="button" class={BUTTON} onClick={onCancel}>Cancel annotation</button>}</div>
  </form>;
}

export function AnnotationInspector({ workspace, onWorkspaceChange, orfs = [], onCopy }: AnnotationInspectorProps) {
  const { document: plasmid, selection } = workspace;
  const annotation = plasmid.annotations.find(item => item.id === selection?.annotationId);
  const orf = orfs.find(item => item.id === selection?.annotationId);
  const [draft, setDraft] = useState<Annotation | undefined>();
  const [copyNotice, setCopyNotice] = useState('');
  const [copyFallback, setCopyFallback] = useState<string | undefined>();
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(undefined); setCopyFallback(undefined); setCopyNotice(''); }, [plasmid, selection]);
  useEffect(() => {
    if (copyFallback !== undefined) { fallbackRef.current?.focus(); fallbackRef.current?.select(); }
  }, [copyFallback]);
  const rangeLocation: Location | undefined = selection && selection.start !== selection.end ? {
    strand: 1,
    segments: selection.start > selection.end
      ? [{ start: selection.start, end: plasmid.sequence.length }, { start: 0, end: selection.end }].filter(segment => segment.start < segment.end)
      : [{ start: selection.start, end: selection.end }],
  } : undefined;
  const location = annotation?.location ?? orf?.location ?? rangeLocation;
  const copy = async (protein: boolean) => {
    if (!location) return;
    try {
      const dna = locationSequence(plasmid.sequence, location);
      const text = protein ? translateDNA(dna) : dna;
      try {
        if (onCopy) await onCopy(text);
        else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else throw new Error('Clipboard unavailable');
        setCopyFallback(undefined);
        setCopyNotice(protein ? 'Protein copied.' : 'DNA copied.');
      } catch {
        setCopyFallback(text);
        setCopyNotice('Select and copy the sequence below with Ctrl+C or ⌘C.');
      }
    } catch (cause) { setCopyNotice(cause instanceof Error ? cause.message : 'Could not copy sequence.'); }
  };
  const create = () => {
    if (!rangeLocation) return;
    let id: string;
    do { id = `manual-annotation-${++nextManualId}`; } while (plasmid.annotations.some(item => item.id === id));
    setDraft({ id, name: '', type: 'misc_feature', location: rangeLocation, qualifiers: {}, source: 'manual', confidence: 'annotated' });
  };
  const save = (edited: Annotation) => {
    const nextDocument = draft ? addAnnotation(plasmid, edited) : replaceAnnotation(plasmid, edited);
    const segments = edited.location.segments;
    const next = applyDocumentEdit(workspace, nextDocument);
    onWorkspaceChange(selectRange(next, { start: segments[0]!.start, end: segments[segments.length - 1]!.end, source: selection?.source ?? 'table', annotationId: edited.id }));
    setDraft(undefined);
  };
  const editable = draft ?? annotation;
  return <aside aria-label="Annotation inspector" class="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    <h2 class="font-semibold text-slate-900 dark:text-slate-100">Annotation inspector</h2>
    {location ? <p class="font-mono text-xs text-slate-500">{location.segments.map(segment => `${segment.start + 1}–${segment.end}`).join(', ')} bp · {location.strand === -1 ? 'reverse' : location.strand === 1 ? 'forward' : 'unstranded'}</p> : <p class="text-sm text-slate-500">Select a range or annotation to inspect it.</p>}
    <div class="flex flex-wrap gap-2"><button class={BUTTON} disabled={!location} onClick={() => void copy(false)}>Copy DNA</button><button class={BUTTON} disabled={!location} onClick={() => void copy(true)}>Copy protein</button></div>
    {copyNotice && <p role="status" class="text-xs text-slate-500">{copyNotice}</p>}
    {copyFallback !== undefined && <label class="block text-xs">Sequence to copy<textarea class={`${FIELD} font-mono`} ref={fallbackRef} readOnly value={copyFallback} /></label>}
    <button class={BUTTON} disabled={!rangeLocation} onClick={create}>Create annotation from selection</button>
    {editable && <AnnotationForm key={JSON.stringify(editable)} annotation={editable} onSave={save} onCancel={draft ? () => setDraft(undefined) : undefined} />}
    {annotation && !draft && <><p class="text-xs text-slate-500">Source: {annotation.source}{annotation.confidence ? ` · ${annotation.confidence}` : ''}</p><button class={`${BUTTON} text-red-700`} onClick={() => onWorkspaceChange(clearSelection(applyDocumentEdit(workspace, deleteAnnotation(plasmid, annotation.id))))}>Delete annotation</button></>}
  </aside>;
}
