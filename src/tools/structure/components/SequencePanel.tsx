import { useEffect, useMemo, useState } from 'preact/hooks';
import type { PolymerChain, ResidueRef, StructureModel } from '@/core/structure';
import type { MolstarHandle } from '../MolstarViewer';
import { chainGroups, chainLabel, isUnknown, refsInRange, residueNumber, type Numbering } from '../sequence';
import type { SequenceSelection } from '../StructureModel';
import { FastaExport } from './FastaExport';
import { buttonClass, captionClass, segmentClass, segmentGroupClass, selectClass } from './ui';
import { SequenceStrip } from './SequenceStrip';

export interface SequencePanelProps {
  model: StructureModel;
  selection: SequenceSelection | null;
  setSelection(s: SequenceSelection | null): void;
  /** Residue under the pointer in Mol*. */
  hovered: ResidueRef | null;
  viewer: MolstarHandle | null;
}

/** "A 275–280" in the chosen numbering. */
function rangeText(chain: PolymerChain, from: number, to: number, numbering: Numbering): string {
  const at = (seqId: number) => {
    const r = chain.residues.find(x => x.seqId === seqId);
    return r ? residueNumber(r, numbering).text : String(seqId);
  };
  const id = numbering === 'auth' ? chain.authAsymId : chain.labelAsymId;
  return from === to ? `${id} ${at(from)}` : `${id} ${at(from)}–${at(to)}`;
}

/**
 * The deposited sequence of one polymer chain at a time, linked to Mol*: clicking, shift-clicking or
 * dragging residues selects and focuses them in 3D; Mol* clicks and hovers come back as `selection`
 * and `hovered`.
 */
export function SequencePanel({ model, selection, setSelection, hovered, viewer }: SequencePanelProps) {
  const groups = useMemo(() => chainGroups(model), [model]);
  // The picked chain belongs to one model; a new structure starts on its first chain.
  const [pick, setPick] = useState<{ model: StructureModel; id: string } | null>(null);
  const [numbering, setNumbering] = useState<Numbering>('auth');
  const chainId = pick?.model === model ? pick.id : model.chains[0]?.labelAsymId;
  const chain = model.chains.find(c => c.labelAsymId === chainId) ?? model.chains[0];
  const setChainId = (id: string) => setPick({ model, id });

  // A selection made elsewhere (a Mol* click) brings its chain into view.
  useEffect(() => {
    if (selection && selection.labelAsymId !== chain?.labelAsymId && model.chains.some(c => c.labelAsymId === selection.labelAsymId)) {
      setChainId(selection.labelAsymId);
    }
  }, [selection]);

  if (!chain) return null;

  const select = (from: number, to: number, commit: boolean): SequenceSelection => {
    const s = { labelAsymId: chain.labelAsymId, from: Math.min(from, to), to: Math.max(from, to) };
    setSelection(s);
    if (commit && viewer) {
      const refs = refsInRange(chain, s.from, s.to);
      viewer.select(refs);
      if (refs.length) viewer.focus(refs);
    }
    return s;
  };
  const clear = () => { setSelection(null); viewer?.select([]); };
  const hover = (ref: ResidueRef | null) => viewer?.highlight(ref ? [ref] : []);

  const sel = selection && selection.labelAsymId === chain.labelAsymId ? selection : null;
  const selectedRefs = sel ? refsInRange(chain, sel.from, sel.to).length : 0;
  const selectedCount = sel ? chain.residues.filter(r => r.seqId >= sel.from && r.seqId <= sel.to).length : 0;
  const unknown = chain.residues.filter(isUnknown);
  const modelled = chain.residues.filter(r => r.modelled).length;

  return (
    <section aria-labelledby="sequence-heading" class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="sequence-heading" class="text-sm font-semibold text-slate-900 dark:text-slate-100">Sequence</h2>
        <label class="flex min-w-0 items-center gap-1.5">
          <span class={captionClass}>Chain</span>
          <select aria-label="Chain" class={selectClass} value={chain.labelAsymId}
            onChange={e => setChainId((e.target as HTMLSelectElement).value)}>
            {groups.map(g => (
              <optgroup key={g.entityId} label={g.label}>
                {g.chains.map(c => <option key={c.labelAsymId} value={c.labelAsymId}>{chainLabel(c)}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <div class="flex items-center gap-1.5">
          <span class={captionClass} id="numbering-caption">Numbering</span>
          <div role="group" aria-labelledby="numbering-caption" class={segmentGroupClass}>
            {(['auth', 'label'] as const).map(n => (
              <button key={n} type="button" aria-pressed={numbering === n} class={segmentClass(numbering === n)} onClick={() => setNumbering(n)}>{n}</button>
            ))}
          </div>
        </div>
        <span class="text-xs text-slate-600 dark:text-slate-400">{chain.residues.length} residues, {modelled} modelled</span>
      </div>

      <SequenceStrip
        chain={chain}
        numbering={numbering}
        selection={sel}
        hovered={hovered}
        onSelect={select}
        onHover={hover}
      />

      <p class="text-[11px] text-slate-600 dark:text-slate-400">
        Lower-case grey letters are not modelled; a dot marks a modified residue (its parent letter is shown).
        Click a residue, then shift-click or drag to select a range.
      </p>
      {unknown.length > 0 && (
        <p class="text-[11px] text-amber-800 dark:text-amber-300">
          Shown as X: {unknown.map(r => `${r.compId} ${residueNumber(r, numbering).text}`).join(', ')}
        </p>
      )}
      {sel && (
        <div class="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
          <span>
            Selected <strong>{rangeText(chain, sel.from, sel.to, numbering)}</strong>
            {' '}({selectedCount} {selectedCount === 1 ? 'residue' : 'residues'}
            {selectedRefs < selectedCount ? `, ${selectedCount - selectedRefs} not modelled` : ''}
            {numbering === 'auth' ? `; label ${chain.labelAsymId} ${sel.from === sel.to ? sel.from : `${sel.from}–${sel.to}`}` : ''})
          </span>
          <button type="button" class={buttonClass} onClick={clear}>Clear selection</button>
        </div>
      )}

      <FastaExport model={model} chain={chain} selection={sel} />
    </section>
  );
}
