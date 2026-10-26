import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { toFasta, writeMmcif, writePdb, type StructureFormat, type StructureModel } from '@/core/structure';
import { downloadText } from '@/lib/export';
import type { StructureSource } from '../load';
import { chainLabel } from '../sequence';
import { buttonClass, captionClass, selectClass } from './ui';

export interface ExportMenuProps {
  model: StructureModel;
  source: StructureSource;
  format: StructureFormat;
  modelIndex: number;
  canSnapshot: boolean;
  onSnapshot: () => void;
}

const safe = (s: string) => s.replace(/[^\w.-]+/g, '_');

interface Part { value: string; label: string; ids: string[]; file: string }

/** Downloads: the original file, a chosen chain or entity as mmCIF or PDB, all FASTA, a PNG of the 3D view. */
export function ExportMenu({ model, source, format, modelIndex, canSnapshot, onSnapshot }: ExportMenuProps) {
  const entry = model.header.id ?? source.name;
  const parts = useMemo<Part[]>(() => {
    const list: Part[] = model.chains.map(c => ({
      value: `chain:${c.labelAsymId}`, label: `Chain ${chainLabel(c)}`, ids: [c.labelAsymId], file: `chain_${c.labelAsymId}`,
    }));
    for (const e of model.entities) {
      if (e.kind === 'water' || e.labelAsymIds.length === 0) continue;
      list.push({ value: `entity:${e.id}`, label: `Entity ${e.id}: ${e.description || e.kind}`, ids: e.labelAsymIds, file: `entity_${e.id}` });
    }
    list.push({
      value: 'all', label: 'Whole structure (no water)', file: 'model',
      ids: model.entities.filter(e => e.kind !== 'water').flatMap(e => e.labelAsymIds),
    });
    return list;
  }, [model]);

  const [partValue, setPartValue] = useState('');
  const [fmt, setFmt] = useState<StructureFormat>('mmcif');
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const part = parts.find(p => p.value === partValue) ?? parts[0]!;
  const flash = (m: string) => {
    setStatus(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 6000);
  };

  // PDB limits are known as soon as the part and format are chosen, so warn before downloading.
  const pdb = useMemo(() => (fmt === 'pdb' ? writePdb(model, modelIndex, part.ids) : null), [fmt, model, modelIndex, part]);

  const original = () => {
    const file = `${safe(source.name)}.${format === 'pdb' ? 'pdb' : 'cif'}`;
    downloadText(source.text, file);
    flash(`Downloaded ${file}.`);
  };
  const download = () => {
    const base = `${safe(entry)}_${part.file}`;
    if (fmt === 'pdb' && pdb) {
      downloadText(pdb.text, `${base}.pdb`);
      flash(`Downloaded ${base}.pdb.`);
    } else {
      downloadText(writeMmcif(model, modelIndex, part.ids), `${base}.cif`);
      flash(`Downloaded ${base}.cif.`);
    }
  };
  const fastaAll = () => {
    downloadText(toFasta(model, { kind: 'all' }, { mode: 'full', gap: '-' }), `${safe(entry)}.fasta`);
    flash(`Downloaded ${safe(entry)}.fasta.`);
  };

  return (
    <section aria-labelledby="export-heading" class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <h2 id="export-heading" class="text-sm font-semibold text-slate-900 dark:text-slate-100">Export</h2>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" class={buttonClass} onClick={original}>{`Original file (.${format === 'pdb' ? 'pdb' : 'cif'})`}</button>
        <button type="button" class={buttonClass} onClick={fastaAll}>FASTA (all entities)</button>
        <button type="button" class={buttonClass} disabled={!canSnapshot} onClick={onSnapshot}>PNG snapshot</button>
      </div>
      <div role="group" aria-label="Export a chain or entity" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
        <label class="flex items-center gap-1.5">
          <span class={captionClass}>Part</span>
          <select aria-label="Export part" value={part.value} class={selectClass}
            onChange={e => setPartValue((e.target as HTMLSelectElement).value)}>
            {parts.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label class="flex items-center gap-1.5">
          <span class={captionClass}>As</span>
          <select aria-label="Export format" value={fmt} class={selectClass}
            onChange={e => setFmt((e.target as HTMLSelectElement).value as StructureFormat)}>
            <option value="mmcif">mmCIF</option>
            <option value="pdb">PDB</option>
          </select>
        </label>
        <button type="button" class={buttonClass} onClick={download}>Download</button>
      </div>
      {pdb && pdb.warnings.length > 0 && (
        <ul aria-label="PDB format warnings" class="list-disc space-y-0.5 pl-5 text-xs text-amber-800 dark:text-amber-300">
          {pdb.warnings.map(w => <li key={w}>{w}</li>)}
        </ul>
      )}
      <div role="status" class="min-h-4 text-xs text-slate-600 dark:text-slate-400">{status}</div>
    </section>
  );
}
