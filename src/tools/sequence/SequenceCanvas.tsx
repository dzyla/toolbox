import { useRef } from 'preact/hooks';
import { normaliseSelection, type Selection, type SequenceAnnotation } from '@/core/sequence-annotator';

interface Props {
  sequence: string;
  annotations: SequenceAnnotation[];
  selection: Selection | null;
  residuesPerRow: number;
  colourFor: (residue: string, position: number) => string;
  onSelectionChange: (selection: Selection | null) => void;
  onAnnotationSelect?: (annotation: SequenceAnnotation) => void;
}

function isSelected(position: number, selection: Selection | null) {
  return !!selection && position >= selection.start && position <= selection.end;
}

export function SequenceCanvas({
  sequence,
  annotations,
  selection,
  residuesPerRow,
  colourFor,
  onSelectionChange,
  onAnnotationSelect,
}: Props) {
  const anchor = useRef<number | null>(null);
  const dragged = useRef(false);
  const width = Math.max(10, Math.min(120, residuesPerRow));
  const rows = Array.from({ length: Math.ceil(sequence.length / width) }, (_, index) => ({
    start: index * width + 1,
    text: sequence.slice(index * width, (index + 1) * width),
  }));

  function select(start: number, end: number) {
    onSelectionChange(normaliseSelection(start, end, sequence.length));
  }

  function begin(position: number, extend: boolean) {
    const start = extend && selection ? selection.start : position;
    anchor.current = start;
    dragged.current = false;
    select(start, position);
  }

  function extend(position: number) {
    if (anchor.current !== null) {
      dragged.current ||= position !== anchor.current;
      select(anchor.current, position);
    }
  }

  return (
    <section aria-label="Interactive sequence canvas" class="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      {annotations.length > 0 && (
        <div class="mb-3 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 dark:border-slate-800" aria-label="Annotation tracks">
          {annotations.map(annotation => (
            <button
              key={annotation.id}
              type="button"
              aria-label={`Annotation: ${annotation.name}, residues ${annotation.start}–${annotation.end}`}
              onClick={() => {
                select(annotation.start, annotation.end);
                onAnnotationSelect?.(annotation);
              }}
              class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold shadow-2xs hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-accent-500"
              style={{ borderColor: annotation.color, backgroundColor: `${annotation.color}22`, color: annotation.color }}
            >
              <span class="h-2 w-2 rounded-full" style={{ backgroundColor: annotation.color }} />
              {annotation.name}
              <span class="font-mono font-normal opacity-75">{annotation.start}–{annotation.end}</span>
            </button>
          ))}
        </div>
      )}

      <div class="min-w-max space-y-1.5 font-mono text-sm leading-none" onMouseLeave={() => { anchor.current = null; }}>
        {rows.map(row => (
          <div key={row.start} class="flex items-center gap-3">
            <span class="w-12 shrink-0 select-none text-right text-[11px] text-slate-400">{row.start}</span>
            <div class="flex rounded-md ring-1 ring-slate-200 dark:ring-slate-800" onMouseUp={() => { anchor.current = null; }}>
              {[...row.text].map((residue, index) => {
                const position = row.start + index;
                const selected = isSelected(position, selection);
                const coveringAnnotation = annotations.find(annotation => position >= annotation.start && position <= annotation.end);
                return (
                  <button
                    key={position}
                    type="button"
                    aria-label={`Residue ${position}: ${residue}`}
                    onMouseDown={event => begin(position, event.shiftKey)}
                    onMouseEnter={() => extend(position)}
                    onMouseUp={() => { anchor.current = null; }}
                    onClick={() => {
                      if (dragged.current) { dragged.current = false; return; }
                      select(position, position);
                    }}
                    class={`relative h-8 w-5 border-r border-slate-200 text-xs font-bold last:border-r-0 dark:border-slate-800 ${colourFor(residue, position)} ${selected ? 'z-10 outline outline-2 outline-offset-[-2px] outline-accent-600' : ''}`}
                    style={coveringAnnotation ? { boxShadow: `inset 0 3px 0 ${coveringAnnotation.color}` } : undefined}
                  >
                    {residue}
                    {index > 0 && index % 10 === 0 && <span class="absolute -left-px -top-1 h-1 w-px bg-slate-400" />}
                  </button>
                );
              })}
            </div>
            <span class="w-12 shrink-0 select-none text-[11px] text-slate-400">{row.start + row.text.length - 1}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
