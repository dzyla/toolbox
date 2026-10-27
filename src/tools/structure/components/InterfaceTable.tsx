import { useEffect, useRef, useState } from 'preact/hooks';
import type { InterfacePair, InterfaceSide, ResidueRef } from '@/core/structure';
import { buttonClass, captionClass } from './ui';

export interface InterfaceTableProps {
  interfaces: InterfacePair[] | null;
  computing: boolean;
  error: string;
  cutoff: number;
  setCutoff: (c: number) => void;
  /** Both sides of a pair: sticks in 3D, marked in the strip. */
  onPair(pair: InterfacePair): void;
  /** One residue of a pair. */
  onResidue(r: ResidueRef): void;
}

export const MIN_CUTOFF = 2;
export const MAX_CUTOFF = 10;

const sideLabel = (s: InterfaceSide) => `${s.labelAsymId} [auth ${s.authAsymId}]`;
const residueId = (r: ResidueRef) => `${r.authAsymId}${r.authSeqId}${r.insCode}`;
/** One line per side: `A: E5, E8` (label chain, then the residues' auth IDs with insertion codes). */
export const interfaceText = (pairs: InterfacePair[]) =>
  pairs.flatMap(p => [p.a, p.b].map(s => `${s.labelAsymId}: ${s.residues.map(residueId).join(', ')}`)).join('\n');

const chip = 'rounded border border-slate-300 px-1 py-px font-mono text-[11px] text-slate-700 hover:bg-accent-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';

/** One side of the open pair: its residues as buttons. */
function SideResidues({ side, onResidue }: { side: InterfaceSide; onResidue(r: ResidueRef): void }) {
  return (
    <div class="space-y-1">
      <div class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{`${sideLabel(side)}: ${side.residues.length} residues`}</div>
      <ul aria-label={`Interface residues of chain ${sideLabel(side)}`} class="flex flex-wrap gap-1">
        {side.residues.map(r => (
          <li key={residueId(r)}>
            <button type="button" class={chip} aria-label={`Show residue ${r.authAsymId} ${r.authSeqId}${r.insCode}`}
              onClick={() => onResidue(r)}>{`${r.authSeqId}${r.insCode}`}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Chain-pair contacts: click a pair to show both sides as sticks (and open its residue lists),
 * click a residue to show that one; copy the residue lists.
 */
export function InterfaceTable({ interfaces, computing, error, cutoff, setCutoff, onPair, onResidue }: InterfaceTableProps) {
  const [draft, setDraft] = useState(String(cutoff));
  // The open pair belongs to one list of interfaces: a new list (structure, model, cutoff) closes it.
  const [open, setOpen] = useState<{ list: InterfacePair[] | null; i: number } | null>(null);
  const active = open && open.list === interfaces ? open.i : null;
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setDraft(String(cutoff)), [cutoff]);

  const onCutoff = (raw: string) => {
    setDraft(raw);
    const v = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(v) && v >= MIN_CUTOFF && v <= MAX_CUTOFF && v !== cutoff) setCutoff(v);
  };
  const pick = (i: number, p: InterfacePair) => {
    setOpen({ list: interfaces, i });
    onPair(p);
  };
  const flash = (m: string) => {
    setStatus(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 4000);
  };
  const copy = async () => {
    if (!interfaces?.length) return;
    try {
      await navigator.clipboard.writeText(interfaceText(interfaces));
      flash('Copied interface residues.');
    } catch {
      flash('Could not copy the interface residues.');
    }
  };

  return (
    <section aria-labelledby="interfaces-heading" class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 id="interfaces-heading" class="text-sm font-semibold text-slate-900 dark:text-slate-100">Interface residues</h2>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1.5">
            <span class={captionClass}>Contact cutoff (Å)</span>
            <input type="number" min={MIN_CUTOFF} max={MAX_CUTOFF} step={0.5} value={draft}
              onInput={e => onCutoff((e.target as HTMLInputElement).value)}
              onChange={e => onCutoff((e.target as HTMLInputElement).value)}
              class="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
          </label>
          <button type="button" class={buttonClass} disabled={!interfaces?.length} onClick={() => void copy()}>Copy residues</button>
        </div>
      </div>
      {error && <div role="alert" class="text-xs text-red-700 dark:text-red-400">{`Could not compute interfaces: ${error}`}</div>}
      <p class="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
        {computing ? 'Computing interfaces…' : `Residues with a heavy atom within ${cutoff} Å of another chain.`}
      </p>
      <div class="overflow-x-auto" aria-busy={computing}>
        <ul aria-label="Interfaces" class="min-w-0 space-y-1 text-xs text-slate-800 dark:text-slate-200">
          {(interfaces ?? []).map((p, i) => (
            <li key={`${p.a.labelAsymId}-${p.b.labelAsymId}`} class={active === i ? 'rounded-md bg-accent-50/60 pb-2 dark:bg-slate-800/60' : ''}>
              <button type="button" aria-pressed={active === i} aria-expanded={active === i} onClick={() => pick(i, p)}
                class={`w-full rounded-md px-2 py-1 text-left font-mono hover:bg-slate-100 dark:hover:bg-slate-800 ${active === i ? 'bg-accent-50 dark:bg-slate-800' : ''}`}>
                {`${sideLabel(p.a)} ↔ ${sideLabel(p.b)}: ${p.a.residues.length} + ${p.b.residues.length} residues`}
              </button>
              {active === i && (
                <div class="space-y-2 px-2 pt-1">
                  <SideResidues side={p.a} onResidue={onResidue} />
                  <SideResidues side={p.b} onResidue={onResidue} />
                </div>
              )}
            </li>
          ))}
        </ul>
        {interfaces && interfaces.length === 0 && !computing && (
          <p class="px-2 py-1 text-xs text-slate-500 dark:text-slate-400">No chain pair is in contact at this cutoff.</p>
        )}
      </div>
      <div role="status" class="min-h-4 text-xs text-slate-600 dark:text-slate-400">{status}</div>
    </section>
  );
}
