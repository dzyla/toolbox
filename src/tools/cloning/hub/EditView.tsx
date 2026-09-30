import { useMemo } from 'preact/hooks';
import type { SdmDesign } from '@/core/cloning/methods/basechanger';
import { sdmEditView } from '@/core/cloning/edit-view';
import { ConstructDiagram } from './ConstructDiagram';

const MONO = 'font-mono text-xs leading-6 whitespace-pre-wrap break-all';
const plural = (n: number) => `${n.toLocaleString()} base${n === 1 ? '' : 's'}`;

/** The plasmid around an edit before and after it, and a line graphic with the edit site and both primers. */
export function EditView({ plasmid, design, plasmidName }: { plasmid: string; design: SdmDesign; plasmidName: string }) {
  const view = useMemo(() => sdmEditView(plasmid, design), [plasmid, design]);
  const summary = [view.removedCount ? `${plural(view.removedCount)} removed` : '', view.addedCount ? `${plural(view.addedCount)} added` : ''].filter(Boolean).join(', ');
  return <section aria-label={`Edit preview: ${design.label}`} class="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <p class="text-xs"><strong>{summary}</strong> · plasmid {view.delta === 0 ? 'keeps its length' : `${view.delta > 0 ? 'grows' : 'shrinks'} by ${plural(Math.abs(view.delta))}`} ({plasmid.length.toLocaleString()} → {(plasmid.length + view.delta).toLocaleString()} bp)</p>
    <ConstructDiagram
      title={`Edit site and primers on ${plasmidName}`}
      length={plasmid.length}
      circular
      color="#0072B2"
      removed={view.removedCount ? { start: design.edit.start, length: view.removedCount } : undefined}
      primers={view.primers.map(primer => ({ id: primer.name, label: primer.name, strand: primer.strand, start: primer.start, length: primer.length, tailLength: primer.tailLength, tailColor: '#E69F00' }))}
      marker={{ position: design.edit.start, label: `${view.kind === 'insert' ? 'Insert after' : view.kind === 'delete' ? 'Delete from' : 'Replace from'} base ${view.kind === 'insert' ? design.edit.start : design.edit.start + 1}` }}
    />
    <div class="space-y-1">
      <div><span class="mr-2 inline-block w-14 text-xs font-semibold">Before</span><span class={MONO}>{view.before.left}{view.before.removed && <del class="rounded-sm bg-rose-100 px-px text-rose-900 decoration-2 dark:bg-rose-950 dark:text-rose-100">{view.before.removed}</del>}{view.before.right}</span></div>
      <div><span class="mr-2 inline-block w-14 text-xs font-semibold">After</span><span class={MONO}>{view.after.left}{view.after.added && <ins class="rounded-sm bg-emerald-100 px-px font-bold text-emerald-900 underline dark:bg-emerald-950 dark:text-emerald-100">{view.after.added}</ins>}{view.after.right}</span></div>
      <p class="text-xs text-slate-600 dark:text-slate-400">Showing bases {view.beforeStart.toLocaleString()}–{(view.beforeStart + view.before.left.length + view.before.removed.length + view.before.right.length - 1).toLocaleString()} of the original. Struck-out red bases are removed; underlined green bases are new.</p>
    </div>
  </section>;
}
