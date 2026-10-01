import { useRef } from 'preact/hooks';
import type { GelWorkspace } from './workspace';

const ITEM = 'block w-full rounded-md px-3 py-1.5 text-left text-xs font-medium text-slate-800 hover:bg-slate-100 focus-visible:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800';
const HEAD = 'px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';

/** The one place for every export: annotated image, tables and methods. */
export function ExportMenu({ g }: { g: GelWorkspace }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const run = (fn: () => unknown) => () => { if (ref.current) ref.current.open = false; void fn(); };
  return (
    <details ref={ref} class="relative">
      <summary class="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
        Export ▾
      </summary>
      <div class="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <p class={HEAD}>Annotated gel</p>
        <button type="button" class={ITEM} onClick={run(g.handleExportAnnotatedGel)}>PNG image</button>
        <button type="button" class={ITEM} onClick={run(g.handleExportSvg)} title="Vector export: annotations stay crisp text at any zoom">SVG (vector)</button>
        <button type="button" class={ITEM} onClick={run(g.handlePrintGel)} title="Print or save as PDF via the print stylesheet">Print / PDF</button>
        <p class={HEAD}>Tables (CSV)</p>
        <button type="button" class={ITEM} onClick={run(g.handleExportTidyCsv)}>Bands (tidy)</button>
        <button type="button" class={ITEM} onClick={run(g.handleExportGroupCsv)}>Condition summary</button>
        <button type="button" class={ITEM} onClick={run(g.handleExportCalibrationCsv)}>Calibration</button>
        <label class="flex cursor-pointer select-none items-center gap-1.5 px-3 py-1.5 text-[11px] text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={g.stripLanePrefix} onChange={e => g.setStripLanePrefix((e.target as HTMLInputElement).checked)} class="rounded accent-accent-600" />
          Omit L1/L2 prefix in tables
        </label>
        <p class={HEAD}>Methods paragraph</p>
        <button type="button" class={ITEM} onClick={run(g.handleExportMethods)}>Download as text</button>
        <button type="button" class={ITEM} onClick={run(g.handleCopyMethods)}>Copy to clipboard</button>
      </div>
    </details>
  );
}
