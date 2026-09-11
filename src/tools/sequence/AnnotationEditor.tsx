import { useState } from 'preact/hooks';
import type { Selection, SequenceAnnotation } from '@/core/sequence-annotator';

interface Props {
  selection: Selection | null;
  annotations: SequenceAnnotation[];
  onCreate: (annotation: Omit<SequenceAnnotation, 'id' | 'start' | 'end' | 'evidence'>) => void;
  onSelect: (annotation: SequenceAnnotation) => void;
  onRemove: (id: string) => void;
}

export function AnnotationEditor({ selection, annotations, onCreate, onSelect, onRemove }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState('region');
  const [color, setColor] = useState('#2563eb');
  const [note, setNote] = useState('');

  function add() {
    if (!selection || !name.trim()) return;
    onCreate({ name: name.trim(), type, color, note: note.trim() });
    setName('');
    setNote('');
  }

  return (
    <section class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-bold">Annotations</h2>
        <span class="text-xs text-slate-500">{annotations.length} saved</span>
      </div>
      <p class="mt-1 text-xs text-slate-500">{selection ? `Selected residues ${selection.start}–${selection.end}` : 'Select a residue or drag a range to annotate it.'}</p>

      <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_3rem]">
        <label class="text-xs font-medium">Annotation name
          <input aria-label="Annotation name" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={name} onInput={event => setName((event.target as HTMLInputElement).value)} />
        </label>
        <label class="text-xs font-medium">Type
          <select class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={type} onChange={event => setType((event.target as HTMLSelectElement).value)}>
            <option value="region">Region</option><option value="modification">Modification</option><option value="domain">Domain</option><option value="note">Note</option>
          </select>
        </label>
        <label class="text-xs font-medium">Color
          <input aria-label="Annotation color" class="mt-1 h-9 w-full rounded border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" type="color" value={color} onInput={event => setColor((event.target as HTMLInputElement).value)} />
        </label>
      </div>
      <label class="mt-2 block text-xs font-medium">Note
        <input aria-label="Annotation note" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={note} onInput={event => setNote((event.target as HTMLInputElement).value)} />
      </label>
      <button type="button" disabled={!selection || !name.trim()} onClick={add} class="mt-3 rounded-lg bg-accent-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Add annotation</button>

      {annotations.length > 0 && <ul class="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs dark:divide-slate-800 dark:border-slate-800">
        {annotations.map(annotation => <li key={annotation.id} class="flex items-center justify-between gap-2 p-2">
          <button type="button" onClick={() => onSelect(annotation)} class="min-w-0 text-left hover:underline"><span class="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: annotation.color }} /><strong>{annotation.name}</strong> <span class="text-slate-500">{annotation.type} · {annotation.start}–{annotation.end}</span></button>
          <button type="button" aria-label={`Remove ${annotation.name}`} onClick={() => onRemove(annotation.id)} class="text-slate-400 hover:text-rose-600">Remove</button>
        </li>)}
      </ul>}
    </section>
  );
}
