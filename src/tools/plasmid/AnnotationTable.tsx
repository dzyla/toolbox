import { useState } from 'preact/hooks';
import type { PlasmidDocument } from '@/core/plasmid/model';
import type { Selection } from './selection';

export interface AnnotationTableProps {
  document: PlasmidDocument;
  selection?: Selection;
  onSelect: (selection: Selection) => void;
}

/** Filtering and sorting are presentation state; the canonical annotation order is untouched. */
export function AnnotationTable({ document, selection, onSelect }: AnnotationTableProps) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('position');
  const query = filter.trim().toLowerCase();
  const rows = document.annotations.filter(annotation =>
    [annotation.name, annotation.type, annotation.source, annotation.confidence ?? ''].join(' ').toLowerCase().includes(query),
  ).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
    : sort === 'type' ? a.type.localeCompare(b.type)
      : a.location.segments[0]!.start - b.location.segments[0]!.start);

  return <section aria-label="Annotation table" class="space-y-3">
    <h2 class="font-semibold text-slate-900 dark:text-slate-100">Feature annotations</h2>
    <div class="flex flex-wrap gap-3 text-sm">
      <label>Filter annotations <input class="rounded border border-slate-300 bg-transparent px-2 py-1" value={filter} onInput={event => setFilter(event.currentTarget.value)} /></label>
      <label>Sort annotations <select class="rounded border border-slate-300 bg-transparent px-2 py-1" value={sort} onChange={event => setSort(event.currentTarget.value)}>
        <option value="position">Position</option><option value="name">Name</option><option value="type">Type</option>
      </select></label>
    </div>
    <div class="overflow-x-auto"><table aria-label="Annotations" class="w-full text-left text-sm">
      <thead><tr class="border-b border-slate-200 text-slate-500"><th class="p-2">Annotation</th><th class="p-2">Type</th><th class="p-2">Coordinates (bp)</th><th class="p-2">Strand</th><th class="p-2">Source</th></tr></thead>
      <tbody>{rows.map(annotation => {
        const segments = annotation.location.segments;
        const range = segments.map(segment => `${segment.start + 1}–${segment.end}`).join(', ');
        const selected = selection?.annotationId === annotation.id;
        return <tr key={annotation.id} class={selected ? 'border-b border-slate-200 bg-blue-50 dark:bg-blue-950' : 'border-b border-slate-200'}>
          <td class="p-2"><button class="text-left text-blue-700 underline decoration-blue-200 underline-offset-4 focus-visible:outline-2 dark:text-blue-300" aria-label={`${annotation.name}, ${range} bp`} aria-pressed={selected} onClick={() => onSelect({ start: segments[0]!.start, end: segments[segments.length - 1]!.end, source: 'table', annotationId: annotation.id })}>{annotation.name}</button></td>
          <td class="p-2">{annotation.type}</td><td class="p-2 font-mono text-xs">{range}</td>
          <td class="p-2">{annotation.location.strand === -1 ? 'Reverse' : annotation.location.strand === 1 ? 'Forward' : 'Unstranded'}</td>
          <td class="p-2">{annotation.confidence === 'predicted' ? `Predicted ${annotation.type}` : annotation.source}</td>
        </tr>;
      })}</tbody>
    </table></div>
    {!rows.length && <p class="text-sm text-slate-500">No matching annotations.</p>}
  </section>;
}
