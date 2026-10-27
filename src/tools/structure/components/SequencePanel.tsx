import { useEffect, useMemo, useState } from 'preact/hooks';
import type { PolymerChain, ResidueRef, StructureModel } from '@/core/structure';
import { chainGroups, chainLabel, refsInRange, residueNumber, type Numbering } from '../sequence';
import type { SequenceSelection } from '../StructureModel';
import { buttonClass, captionClass, segmentClass, segmentGroupClass, selectClass } from './ui';
import { SequenceStrip } from './SequenceStrip';

export interface SequencePanelProps {
  model: StructureModel;
  /** The chain shown (label asym ID); the FASTA export uses the same one. */
  chainId: string;
  setChainId(id: string): void;
  selection: SequenceSelection | null;
  setSelection(s: SequenceSelection | null): void;
  /** Residue under the pointer in Mol*. */
  hovered: ResidueRef | null;
  /** Residues picked as a set (an interface), marked in the strip. */
  marked: ResidueRef[];
  /** Select, draw as sticks and zoom to these residues in Mol*. */
  onShow(refs: ResidueRef[]): void;
  onHover(refs: ResidueRef[]): void;
  onClear(): void;
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

const HELP_BASE = 'Click a residue to show it in 3D; shift-click or drag for a range. '
  + 'Lower-case grey letters are not modelled; a dot marks a modified residue (its parent letter is shown).';

/**
 * The strip docked under the viewer: one polymer chain at a time on a single line, linked to Mol*.
 * Clicking, shift-clicking or dragging selects residues and shows them as sticks in 3D; Mol* clicks
 * and hovers come back as `selection` and `hovered`.
 */
export function SequencePanel({ model, chainId, setChainId, selection, setSelection, hovered, marked, onShow, onHover, onClear }: SequencePanelProps) {
  const groups = useMemo(() => chainGroups(model), [model]);
  const [numbering, setNumbering] = useState<Numbering>('auth');
  const chain = model.chains.find(c => c.labelAsymId === chainId) ?? model.chains[0];

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
    // Only modelled residues reach Mol*; a range of unmodelled ones clears its selection.
    if (commit) onShow(refsInRange(chain, s.from, s.to));
    return s;
  };
  const hover = (ref: ResidueRef | null) => onHover(ref ? [ref] : []);

  const sel = selection && selection.labelAsymId === chain.labelAsymId ? selection : null;
  const selectedRefs = sel ? refsInRange(chain, sel.from, sel.to).length : 0;
  const selectedCount = sel ? chain.residues.filter(r => r.seqId >= sel.from && r.seqId <= sel.to).length : 0;
  const modelled = chain.residues.filter(r => r.modelled).length;
  const help = `${chain.residues.length} residues, ${modelled} modelled. ${HELP_BASE}`;

  return (
    <section aria-labelledby="sequence-heading" aria-describedby="sequence-help" class="space-y-1.5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
          <span class="sr-only" id="numbering-caption">Numbering</span>
          <div role="group" aria-labelledby="numbering-caption" class={segmentGroupClass}>
            {(['auth', 'label'] as const).map(n => (
              <button key={n} type="button" aria-pressed={numbering === n} class={segmentClass(numbering === n)} onClick={() => setNumbering(n)}>{n}</button>
            ))}
          </div>
        </div>
        <span class="hidden text-xs text-slate-600 xl:inline dark:text-slate-400">{chain.residues.length} residues, {modelled} modelled</span>
        <span aria-hidden="true" title={help} class="cursor-help text-xs text-slate-500 dark:text-slate-400">ⓘ</span>
        <p id="sequence-help" class="sr-only">{help}</p>
        {(sel || marked.length > 0) && (
          <div class="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            {sel && (
              <span>
                Selected <strong>{rangeText(chain, sel.from, sel.to, numbering)}</strong>
                {' '}({selectedCount} {selectedCount === 1 ? 'residue' : 'residues'}
                {selectedRefs < selectedCount ? `, ${selectedCount - selectedRefs} not modelled` : ''}
                {numbering === 'auth' ? `; label ${chain.labelAsymId} ${sel.from === sel.to ? sel.from : `${sel.from}–${sel.to}`}` : ''})
              </span>
            )}
            {!sel && <span>Interface marked</span>}
            <button type="button" class={buttonClass} onClick={onClear}>Clear selection</button>
          </div>
        )}
      </div>

      <SequenceStrip
        chain={chain}
        numbering={numbering}
        selection={sel}
        hovered={hovered}
        marked={marked}
        onSelect={select}
        onHover={hover}
      />
    </section>
  );
}
