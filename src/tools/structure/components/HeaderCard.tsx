import type { StructureModel } from '@/core/structure';
import type { StructureSource } from '../load';

const ORIGIN: Record<StructureSource['origin'], string> = {
  demo: 'Bundled copy of the RCSB entry (works offline)',
  rcsb: 'Fetched from RCSB PDB',
  file: 'Local file',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Entry facts from the file header; fields the file does not carry are left out. */
export function HeaderCard({ source, model }: { source: StructureSource; model: StructureModel }) {
  const h = model.header;
  const entities = model.entities.filter(e => e.kind !== 'water');
  const polymers = entities.filter(e => e.kind === 'polymer').length;
  const rows: [string, string][] = [];
  if (h.method) rows.push(['Method', h.method]);
  if (h.resolution !== undefined && Number.isFinite(h.resolution)) rows.push(['Resolution', `${Number(h.resolution.toFixed(2))} Å`]);
  if (h.organisms.length) rows.push([h.organisms.length === 1 ? 'Organism' : 'Organisms', h.organisms.join(', ')]);
  if (h.depositionDate) rows.push(['Deposited', h.depositionDate]);
  rows.push(['Contents', `${plural(entities.length, 'entity', 'entities')} (${polymers} polymer) · ${plural(model.chains.length, 'polymer chain')}`]);

  return (
    <div data-testid="structure-header" class="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div class="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 class="font-mono text-base font-bold text-slate-900 dark:text-slate-100">{source.name}</h2>
        {h.id && h.id !== source.name && <span class="font-mono text-xs text-slate-500 dark:text-slate-400">Entry {h.id}</span>}
      </div>
      {h.title && <p class="text-sm leading-snug text-slate-800 dark:text-slate-200">{h.title}</p>}
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} class="contents">
            <dt class="text-slate-500 dark:text-slate-400">{k}</dt>
            <dd class="break-words text-slate-800 dark:text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">{ORIGIN[source.origin]} · {source.text.length.toLocaleString()} characters, {model.format === 'mmcif' ? 'mmCIF' : 'PDB'}</p>
      {model.warnings.length > 0 && (
        <ul class="list-disc space-y-0.5 pl-4 text-[11px] text-amber-800 dark:text-amber-300">
          {model.warnings.map(w => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
