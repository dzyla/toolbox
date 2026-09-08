import type { JSX } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import type { PlasmidDocument } from '@/core/plasmid/model';
import { complement, translate } from '@/core/nucleic/sequence';
import type { Selection } from './selection';

export interface SequenceDisplayPreferences {
  translationMode: 'none' | 'frame1' | 'frame2' | 'frame3';
  basesPerRow?: number;
}

export interface SequenceViewProps {
  document: PlasmidDocument;
  selection?: Selection;
  onSelect: (selection: Selection) => void;
  preferences?: Partial<SequenceDisplayPreferences>;
  onPreferencesChange?: (preferences: SequenceDisplayPreferences) => void;
}

export function SequenceView({ document, selection, onSelect, preferences, onPreferencesChange }: SequenceViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ anchor: number; pointerId: number; target: HTMLElement }>();
  const [coordinate, setCoordinate] = useState('1');
  const [coordinateError, setCoordinateError] = useState('');
  const [localMode, setLocalMode] = useState<SequenceDisplayPreferences['translationMode']>('frame1');
  const translationMode = preferences?.translationMode ?? localMode;
  const requestedRowSize = preferences?.basesPerRow ?? 60;
  const basesPerRow = Number.isFinite(requestedRowSize) ? Math.max(3, Math.trunc(requestedRowSize)) : 60;

  // These tracks depend on the document and display settings, never selection.
  const bases = useMemo(() => {
    const reverse = complement(document.sequence);
    return Array.from(document.sequence, (base, index) => ({
      base,
      complement: reverse[index]!,
      annotations: document.annotations.filter(annotation => annotation.location.segments.some(segment => index >= segment.start && index < segment.end)),
    }));
  }, [document]);
  const aminoAcids = useMemo(() => {
    if (translationMode === 'none') return new Map<number, string>();
    const frame = translationMode === 'frame2' ? 2 : translationMode === 'frame3' ? 3 : 1;
    return new Map(Array.from(translate(document.sequence, 1, frame), (aa, index) => [frame - 1 + index * 3, aa]));
  }, [document.sequence, translationMode]);

  function selectBase(index: number, anchor = index) {
    onSelect({ start: Math.min(anchor, index), end: Math.max(anchor, index) + 1, source: 'sequence' });
  }

  function startDrag(event: JSX.TargetedPointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { anchor: index, pointerId: event.pointerId, target: event.currentTarget };
    selectBase(index);
  }

  function extendDrag(event: PointerEvent, index: number) {
    if (drag.current?.pointerId !== event.pointerId) return;
    selectBase(index, drag.current.anchor);
  }

  function moveDrag(event: JSX.TargetedPointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    // Capture retargets pointermove to the original base. Hit-test the actual
    // viewport coordinate instead; pointerenter alone cannot track this drag.
    const element = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sequence-index]');
    if (element && event.currentTarget.contains(element)) extendDrag(event, Number(element.dataset.sequenceIndex));
  }

  function endDrag(event: PointerEvent) {
    if (drag.current?.pointerId !== event.pointerId) return;
    const { target, pointerId } = drag.current;
    drag.current = undefined;
    target.releasePointerCapture(pointerId);
  }

  function gotoCoordinate(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(coordinate);
    if (!Number.isInteger(value) || value < 1 || value > bases.length) {
      setCoordinateError(`Enter a coordinate from 1 to ${bases.length}.`);
      return;
    }
    setCoordinateError('');
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLButtonElement>(`[aria-label="Base ${value}"]`);
    if (!viewport || !target) return;
    viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    target.focus({ preventScroll: true });
  }

  function renderBase(index: number, reverse: boolean) {
    const entry = bases[index]!;
    const annotations = entry.annotations.filter(annotation => annotation.location.strand === 0 || annotation.location.strand === (reverse ? -1 : 1));
    const selected = !!selection && (selection.start <= selection.end
      ? index >= selection.start && index < selection.end
      : index >= selection.start || index < selection.end);
    const letter = reverse ? entry.complement : entry.base;
    return <button
      key={index}
      type="button"
      aria-label={reverse ? `Complement base ${index + 1}` : `Base ${index + 1}`}
      aria-pressed={selected}
      data-sequence-index={index}
      title={`bp ${index + 1}: ${letter}${annotations.length ? ` · ${annotations.map(annotation => annotation.name).join(', ')}` : ''}`}
      class={`inline-block w-[1ch] shrink-0 rounded-sm text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 ${selected ? 'bg-accent-600 text-white' : annotations.length ? 'bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-amber-100' : 'text-slate-700 dark:text-slate-300'}`}
      style={{ touchAction: 'none', boxShadow: annotations.length ? `inset 0 -2px ${annotations[0]!.color ?? '#d97706'}` : undefined }}
      onPointerDown={event => startDrag(event, index)}
      onPointerEnter={event => extendDrag(event, index)}
      onClick={event => { if (event.detail === 0) selectBase(index); }}
    >{letter}</button>;
  }

  return <section class="space-y-3" aria-label="Nucleotide sequence">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h3 class="font-semibold">Nucleotide Sequence</h3>
      <form noValidate onSubmit={gotoCoordinate} class="flex items-end gap-2">
        <label class="text-sm">Go to coordinate
          <input aria-label="Go to coordinate" type="number" min="1" max={bases.length} value={coordinate} onInput={event => setCoordinate(event.currentTarget.value)} class="ml-2 w-24 rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600" />
        </label>
        <button type="submit" class="rounded border border-slate-300 px-3 py-1 dark:border-slate-600">Go</button>
      </form>
      <label class="text-sm">Translation display
        <select aria-label="Translation display" value={translationMode} class="ml-2 rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600" onChange={event => {
          const mode = event.currentTarget.value as SequenceDisplayPreferences['translationMode'];
          setLocalMode(mode);
          onPreferencesChange?.({ translationMode: mode, basesPerRow });
        }}>
          <option value="frame1">Frame +1</option>
          <option value="frame2">Frame +2</option>
          <option value="frame3">Frame +3</option>
          <option value="none">Hidden</option>
        </select>
      </label>
    </div>
    {coordinateError && <p role="alert" class="text-sm text-red-600">{coordinateError}</p>}
    <div ref={viewportRef} data-testid="plasmid-sequence-viewport" class="relative max-h-[32rem] overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm leading-6 dark:border-slate-700 dark:bg-slate-900" style={{ overflowAnchor: 'none' }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={event => {
      if (drag.current?.pointerId === event.pointerId) drag.current = undefined;
    }}>
      {Array.from({ length: Math.ceil(bases.length / basesPerRow) }, (_, row) => {
        const start = row * basesPerRow;
        const indexes = Array.from({ length: Math.min(basesPerRow, bases.length - start) }, (_, offset) => start + offset);
        return <div key={start} class="mb-4 w-max min-w-full" data-sequence-row={start}>
          <div class="text-xs text-slate-500">{start + 1}–{start + indexes.length}</div>
          <div class="flex items-center"><span class="w-8 shrink-0 text-xs text-slate-500">5′</span>{indexes.map(index => renderBase(index, false))}<span class="ml-2 text-xs text-slate-500">3′</span></div>
          <div class="flex items-center"><span class="w-8 shrink-0 text-xs text-slate-500">3′</span>{indexes.map(index => renderBase(index, true))}<span class="ml-2 text-xs text-slate-500">5′</span></div>
          {translationMode !== 'none' && <div class="flex h-6 items-center text-teal-700 dark:text-teal-300"><span class="w-8 shrink-0 text-xs text-slate-500">aa</span>{indexes.map(index => <span key={index} class="inline-block w-[1ch] shrink-0 text-center" aria-label={aminoAcids.has(index) ? `Amino acid ${aminoAcids.get(index)}, bases ${index + 1}–${index + 3}` : undefined}>{aminoAcids.get(index) ?? '\u00a0'}</span>)}</div>}
        </div>;
      })}
    </div>
  </section>;
}
