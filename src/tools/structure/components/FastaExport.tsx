import { useEffect, useRef, useState } from 'preact/hooks';
import { toFasta, type FastaOptions, type FastaScope, type PolymerChain, type StructureModel } from '@/core/structure';
import { downloadText } from '@/lib/export';
import { chainLabel } from '../sequence';
import type { SequenceSelection } from '../StructureModel';
import { buttonClass, captionClass, segmentClass, segmentGroupClass, selectClass } from './ui';

type ScopeKind = 'selection' | 'chain' | 'entity' | 'all';

export interface FastaExportProps {
  model: StructureModel;
  /** The chain shown in the strip; "chain" and "entity" export refer to it. */
  chain: PolymerChain;
  selection: SequenceSelection | null;
}


const safe = (s: string) => s.replace(/[^\w.-]+/g, '_');

/** Copy or download FASTA for the selection, the shown chain, its entity or every polymer entity. */
export function FastaExport({ model, chain, selection }: FastaExportProps) {
  const [kind, setKind] = useState<ScopeKind>('chain');
  const [opts, setOpts] = useState<FastaOptions>({ mode: 'full', gap: '-' });
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (m: string) => {
    setStatus(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 4000);
  };

  const entry = model.header.id ?? model.name;
  const scope = (): { scope: FastaScope; file: string; what: string } | null => {
    switch (kind) {
      case 'selection':
        return selection && {
          scope: { kind: 'range', labelAsymId: selection.labelAsymId, from: selection.from, to: selection.to },
          file: `${entry}_${selection.labelAsymId}_${selection.from}-${selection.to}`,
          what: 'the selection',
        };
      case 'chain':
        return { scope: { kind: 'chain', labelAsymId: chain.labelAsymId }, file: `${entry}_chain_${chain.labelAsymId}`, what: `chain ${chainLabel(chain)}` };
      case 'entity':
        return { scope: { kind: 'entity', entityId: chain.entityId }, file: `${entry}_entity_${chain.entityId}`, what: `entity ${chain.entityId}` };
      case 'all':
        return { scope: { kind: 'all' }, file: entry, what: 'all polymer entities' };
    }
  };
  const current = scope();

  const copy = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(toFasta(model, current.scope, opts));
      flash(`Copied FASTA for ${current.what}.`);
    } catch {
      flash('Could not copy; use Download .fasta instead.');
    }
  };
  const download = () => {
    if (!current) return;
    downloadText(toFasta(model, current.scope, opts), `${safe(current.file)}.fasta`);
    flash(`Downloaded ${safe(current.file)}.fasta.`);
  };

  return (
    <div role="group" aria-label="FASTA export" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
      <label class="flex items-center gap-1.5">
        <span class={captionClass}>FASTA</span>
        <select aria-label="FASTA scope" value={kind} class={selectClass}
          onChange={e => setKind((e.target as HTMLSelectElement).value as ScopeKind)}>
          <option value="selection">{selection ? 'Selection' : 'Selection (none yet)'}</option>
          <option value="chain">{`Chain ${chainLabel(chain)}`}</option>
          <option value="entity">{`Entity ${chain.entityId}`}</option>
          <option value="all">All entities</option>
        </select>
      </label>
      <div role="group" aria-label="Residues to export" class={segmentGroupClass}>
        <button type="button" aria-pressed={opts.mode === 'full'} class={segmentClass(opts.mode === 'full')} onClick={() => setOpts({ ...opts, mode: 'full' })}>Full</button>
        <button type="button" aria-pressed={opts.mode === 'modelled'} class={segmentClass(opts.mode === 'modelled')} onClick={() => setOpts({ ...opts, mode: 'modelled' })}>Modelled only</button>
      </div>
      {opts.mode === 'modelled' && (
        <div role="group" aria-label="Unmodelled positions" class={segmentGroupClass}>
          <button type="button" aria-pressed={opts.gap === '-'} class={segmentClass(opts.gap === '-')} onClick={() => setOpts({ ...opts, gap: '-' })}>gaps as -</button>
          <button type="button" aria-pressed={opts.gap === ''} class={segmentClass(opts.gap === '')} onClick={() => setOpts({ ...opts, gap: '' })}>drop gaps</button>
        </div>
      )}
      <div class="flex gap-1.5">
        <button type="button" class={buttonClass} disabled={!current} onClick={() => void copy()}>Copy FASTA</button>
        <button type="button" class={buttonClass} disabled={!current} onClick={download}>Download .fasta</button>
      </div>
      <div role="status" class="min-h-4 w-full text-xs text-slate-600 dark:text-slate-400">
        {!current ? 'Select residues in the strip to export them.' : status}
      </div>
    </div>
  );
}
