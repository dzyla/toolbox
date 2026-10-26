import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PolymerChain, ResidueRef, SeqResidue } from '@/core/structure';
import { BLOCK_LENGTH, ROW_LENGTH, chainLabel, refKey, residueName, residueNumber, residueRef, residueTitle, type Numbering } from '../sequence';
import type { SequenceSelection } from '../StructureModel';

export interface SequenceStripProps {
  chain: PolymerChain;
  numbering: Numbering;
  /** The selection when it lies in this chain, else null. */
  selection: SequenceSelection | null;
  /** Residue under the pointer in Mol*. */
  hovered: ResidueRef | null;
  /** Select label seqIds `from`–`to`; `commit` also selects and focuses them in Mol*. Returns the new selection. */
  onSelect(from: number, to: number, commit: boolean): SequenceSelection;
  onHover(ref: ResidueRef | null): void;
}

const CELL_REM = 0.875; // w-3.5
const BASE = 'relative inline-block h-5 w-3.5 shrink-0 rounded-sm text-center font-mono text-xs leading-5 '
  + 'focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-accent-500 '
  + 'data-hl:z-10 data-hl:ring-2 data-hl:ring-amber-500';
const MODELLED = `${BASE} text-slate-900 hover:bg-accent-100 dark:text-slate-100 dark:hover:bg-accent-900 `
  + 'aria-pressed:bg-accent-600 aria-pressed:text-white';
const UNMODELLED = `${BASE} text-slate-500 underline decoration-dotted hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 `
  + 'aria-pressed:bg-accent-200 aria-pressed:text-accent-900 dark:aria-pressed:bg-accent-800 dark:aria-pressed:text-accent-100';
const TICK = 'text-[10px] leading-4 tabular-nums';

const indexOf = (e: Event): number => {
  const el = (e.target as Element | null)?.closest?.('[data-i]');
  return el ? Number((el as HTMLElement).dataset.i) : -1;
};

/** Scroll `el` into view inside `box` only (scrollIntoView would also move the page). */
function scrollWithin(box: HTMLElement, el: HTMLElement) {
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < b.top) box.scrollTop -= b.top - r.top + 4;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
  if (r.left < b.left) box.scrollLeft -= b.left - r.left + 4;
  else if (r.right > b.right) box.scrollLeft += r.right - b.right + 4;
}

/**
 * One chain in rows of 50 with a number over every 10th residue. Residues are buttons (one roving tab
 * stop; arrows move, shift+arrows extend); pointer, click and key handling is delegated to the box.
 */
export function SequenceStrip({ chain, numbering, selection, hovered, onSelect, onHover }: SequenceStripProps) {
  const box = useRef<HTMLDivElement>(null);
  const res = chain.residues;
  const byAuth = useMemo(() => {
    const map = new Map<string, number>();
    res.forEach((r, i) => { const ref = residueRef(chain, r); if (ref) map.set(refKey(ref), i); });
    return map;
  }, [chain]);
  const indexOfSeq = (seqId: number) => res.findIndex(r => r.seqId === seqId);

  // Focus and anchor belong to one chain object, so a new chain starts over without an effect.
  const [focus, setFocus] = useState<{ chain: PolymerChain; i: number } | null>(null);
  const focusIdx = focus?.chain === chain ? focus.i : 0;
  const setFocusIdx = (i: number) => setFocus({ chain, i });
  const anchorRef = useRef<{ chain: PolymerChain; seqId: number } | null>(null);
  const getAnchor = () => (anchorRef.current?.chain === chain ? anchorRef.current.seqId : null);
  const setAnchor = (seqId: number) => { anchorRef.current = { chain, seqId }; };
  const own = useRef<SequenceSelection | null>(null);  // the last selection made here
  const drag = useRef<{ start: number; last: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const hoverIdx = useRef(-1);
  const marked = useRef<Element | null>(null);
  const moveFocus = useRef(false);

  const button = (i: number) => box.current?.querySelector<HTMLElement>(`[data-i="${i}"]`) ?? null;
  /** The strip's hover mark lives on the DOM node, so hovering never re-renders 1,500 buttons. */
  const mark = (el: Element | null) => {
    if (marked.current && marked.current !== el) marked.current.removeAttribute('data-hl');
    el?.setAttribute('data-hl', '');
    marked.current = el;
  };

  // A new chain: clear the hover mark and scroll back to the start (declared first so an incoming
  // selection below wins).
  useEffect(() => {
    hoverIdx.current = -1;
    mark(null);
    if (box.current) { box.current.scrollTop = 0; box.current.scrollLeft = 0; }
  }, [chain]);
  // A selection from elsewhere (Mol*): anchor on it and scroll it into view.
  useEffect(() => {
    if (!selection || selection === own.current) return;
    setAnchor(selection.from);
    const i = indexOfSeq(selection.from);
    if (i < 0) return;
    setFocusIdx(i);
    const el = button(i);
    if (el && box.current) scrollWithin(box.current, el);
  }, [selection, chain]);
  // Mol* hover: mark the residue and bring it into view.
  useEffect(() => {
    const i = hovered ? byAuth.get(refKey(hovered)) ?? -1 : -1;
    const el = i >= 0 ? button(i) : null;
    mark(el);
    if (el && box.current) scrollWithin(box.current, el);
  }, [hovered, byAuth]);
  // Keyboard moves focus after the roving tab stop re-rendered.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    button(focusIdx)?.focus();
  }, [focusIdx]);

  const select = (a: number, b: number, commit: boolean) => {
    own.current = onSelect(res[a]!.seqId, res[b]!.seqId, commit);
  };
  const extendOrSelect = (i: number, extend: boolean) => {
    const a = extend ? getAnchor() : null;
    const from = a !== null ? indexOfSeq(a) : -1;
    if (from >= 0) select(from, i, true);
    else { setAnchor(res[i]!.seqId); select(i, i, true); }
  };

  const onClick = (e: MouseEvent) => {
    const i = indexOf(e);
    if (i < 0) return;
    if (suppressClick.current) { suppressClick.current = false; return; }
    extendOrSelect(i, e.shiftKey);
    setFocusIdx(i);
  };
  const onPointerDown = (e: PointerEvent) => {
    const i = indexOf(e);
    // Touch drags scroll the box; drag-selection is for mouse and pen.
    if (i < 0 || e.button !== 0 || e.shiftKey || e.pointerType === 'touch') return;
    drag.current = { start: i, last: i, moved: false };
    const up = () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const d = drag.current;
      drag.current = null;
      if (!d?.moved) return;
      setAnchor(res[d.start]!.seqId);
      select(d.start, d.last, true);
      // The click that ends a drag must not collapse the range to one residue.
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const onPointerOver = (e: PointerEvent) => {
    const i = indexOf(e);
    if (i < 0 || i === hoverIdx.current) return;
    hoverIdx.current = i;
    mark(button(i));
    onHover(residueRef(chain, res[i]!));
    let d = drag.current;
    // A button released outside the window never sent pointerup: that drag is over.
    if (d && e.pointerType !== 'touch' && (e.buttons & 1) === 0) { drag.current = null; d = null; }
    if (d && (d.moved || i !== d.start)) {
      d.moved = true;
      d.last = i;
      select(d.start, i, false);
    }
  };
  const onPointerLeave = () => {
    hoverIdx.current = -1;
    mark(null);
    onHover(null);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const i = indexOf(e);
    if (i < 0) return;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -ROW_LENGTH, ArrowDown: ROW_LENGTH, Home: -res.length, End: res.length };
    const d = step[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(res.length - 1, i + d));
    if (e.shiftKey) {
      if (getAnchor() === null) setAnchor(res[i]!.seqId);
      extendOrSelect(next, true);
    }
    moveFocus.current = true;
    setFocusIdx(next);
  };

  const selFrom = selection ? selection.from : Infinity;
  const selTo = selection ? selection.to : -Infinity;
  const number = (r: SeqResidue) => {
    const n = residueNumber(r, numbering);
    return <span class={n.fallback ? 'italic text-slate-500 dark:text-slate-400' : ''}>{n.text}</span>;
  };

  const cell = (r: SeqResidue, i: number) => (
    <button
      key={i}
      type="button"
      data-i={i}
      tabIndex={i === focusIdx ? 0 : -1}
      aria-label={residueName(chain, r)}
      aria-pressed={r.seqId >= selFrom && r.seqId <= selTo}
      title={residueTitle(r)}
      class={r.modelled ? MODELLED : UNMODELLED}
    >
      {r.modelled ? r.oneLetter : r.oneLetter.toLowerCase()}
      {r.parentCompId && <span aria-hidden="true" class="absolute right-0 top-0.5 h-1 w-1 rounded-full bg-amber-500" />}
    </button>
  );

  const rows: number[] = [];
  for (let s = 0; s < res.length; s += ROW_LENGTH) rows.push(s);

  return (
    <div
      ref={box}
      role="group"
      aria-label={`Sequence of chain ${chainLabel(chain)}`}
      class="max-h-72 select-none overflow-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
    >
      {rows.map(start => {
        const row = res.slice(start, start + ROW_LENGTH);
        const blocks: number[] = [];
        for (let b = 0; b < row.length; b += BLOCK_LENGTH) blocks.push(b);
        return (
          <div key={start} class="flex w-max items-end gap-2 pb-1">
            <span aria-hidden="true" class={`${TICK} w-10 shrink-0 pb-0.5 text-right text-slate-600 dark:text-slate-300`}>{number(row[0]!)}</span>
            <div>
              <div aria-hidden="true" class="flex gap-1.5">
                {blocks.map(b => {
                  const block = row.slice(b, b + BLOCK_LENGTH);
                  return (
                    <span key={b} class={`${TICK} text-right text-slate-600 dark:text-slate-300`} style={{ width: `${block.length * CELL_REM}rem` }}>
                      {block.length === BLOCK_LENGTH ? number(block[BLOCK_LENGTH - 1]!) : ''}
                    </span>
                  );
                })}
              </div>
              <div class="flex gap-1.5">
                {blocks.map(b => (
                  <span key={b} class="flex">
                    {row.slice(b, b + BLOCK_LENGTH).map((r, k) => cell(r, start + b + k))}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
