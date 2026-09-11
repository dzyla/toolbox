import { useEffect, useState } from 'preact/hooks';
import type { Selection, SequenceKind } from '@/core/sequence-annotator';

interface Props {
  selection: Selection | null;
  length: number;
  kind: SequenceKind;
  preview: string;
  onSelectionChange: (selection: Selection | null) => void;
}

function compactPreview(sequence: string, limit = 34) {
  if (sequence.length <= limit) return sequence;
  const edge = Math.floor((limit - 1) / 2);
  return `${sequence.slice(0, edge)}…${sequence.slice(-edge)}`;
}

export function RangeInspector({ selection, length, kind, preview, onSelectionChange }: Props) {
  const [draftStart, setDraftStart] = useState(selection ? String(selection.start) : '');
  const [draftEnd, setDraftEnd] = useState(selection ? String(selection.end) : '');

  useEffect(() => {
    setDraftStart(selection ? String(selection.start) : '');
    setDraftEnd(selection ? String(selection.end) : '');
  }, [selection?.start, selection?.end]);

  if (!selection) {
    return <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">Select residues in the sequence, then refine the range here.</div>;
  }
  const commit = () => {
    const start = Number(draftStart), end = Number(draftEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > length || start > end) return;
    onSelectionChange({ start, end });
  };
  const unit = kind === 'protein' ? 'aa' : 'nt';

  return <section class="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2.5 dark:border-indigo-900 dark:bg-indigo-950/30" aria-label="Selection inspector">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <strong class="text-sm text-slate-900 dark:text-slate-100">Selection: {selection.start}–{selection.end}</strong>
      <label class="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">Start
        <input aria-label="Selection start" class="w-20 rounded border border-indigo-200 bg-white px-1.5 py-1 font-mono text-xs dark:border-indigo-800 dark:bg-slate-950" type="number" min={1} max={length} value={draftStart} onInput={event => setDraftStart(event.currentTarget.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { commit(); event.currentTarget.blur(); } }} />
      </label>
      <label class="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">End
        <input aria-label="Selection end" class="w-20 rounded border border-indigo-200 bg-white px-1.5 py-1 font-mono text-xs dark:border-indigo-800 dark:bg-slate-950" type="number" min={1} max={length} value={draftEnd} onInput={event => setDraftEnd(event.currentTarget.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { commit(); event.currentTarget.blur(); } }} />
      </label>
      <span class="rounded-full bg-white px-2 py-1 font-mono text-xs font-semibold text-indigo-800 shadow-xs dark:bg-slate-900 dark:text-indigo-200">{preview.length} {unit} selected</span>
      <span class="min-w-0 flex-1 truncate font-mono text-xs text-slate-600 dark:text-slate-300" title={preview}>{compactPreview(preview)}</span>
    </div>
  </section>;
}
