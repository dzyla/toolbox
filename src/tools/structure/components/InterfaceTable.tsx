import { useEffect, useRef, useState } from 'preact/hooks';
import type { InterfacePair, InterfaceSide, ResidueRef } from '@/core/structure';
import type { MolstarHandle } from '../MolstarViewer';
import { buttonClass, captionClass } from './ui';

export interface InterfaceTableProps {
  interfaces: InterfacePair[] | null;
  computing: boolean;
  error: string;
  cutoff: number;
  setCutoff: (c: number) => void;
  viewer: MolstarHandle | null;
}

export const MIN_CUTOFF = 2;
export const MAX_CUTOFF = 10;

const sideLabel = (s: InterfaceSide) => `${s.labelAsymId} [auth ${s.authAsymId}]`;
const residueId = (r: ResidueRef) => `${r.authAsymId}${r.authSeqId}${r.insCode}`;
/** One line per side: `A: E5, E8` (label chain, then the residues' auth IDs with insertion codes). */
export const interfaceText = (pairs: InterfacePair[]) =>
  pairs.flatMap(p => [p.a, p.b].map(s => `${s.labelAsymId}: ${s.residues.map(residueId).join(', ')}`)).join('\n');

/** Chain-pair contacts: click a row to highlight both sides in 3D, copy the residue lists. */
export function InterfaceTable({ interfaces, computing, error, cutoff, setCutoff, viewer }: InterfaceTableProps) {
  const [draft, setDraft] = useState(String(cutoff));
  const [active, setActive] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setDraft(String(cutoff)), [cutoff]);
  useEffect(() => setActive(null), [interfaces]);

  const onCutoff = (raw: string) => {
    setDraft(raw);
    const v = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(v) && v >= MIN_CUTOFF && v <= MAX_CUTOFF && v !== cutoff) setCutoff(v);
  };
  const pick = (i: number, p: InterfacePair) => {
    setActive(i);
    const all = [...p.a.residues, ...p.b.residues];
    viewer?.highlight(all);
    viewer?.focus(all);
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
    <section aria-labelledby="interfaces-heading" class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
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
            <li key={`${p.a.labelAsymId}-${p.b.labelAsymId}`}>
              <button type="button" aria-pressed={active === i} onClick={() => pick(i, p)}
                class={`w-full rounded-md px-2 py-1 text-left font-mono hover:bg-slate-100 dark:hover:bg-slate-800 ${active === i ? 'bg-accent-50 dark:bg-slate-800' : ''}`}>
                {`${sideLabel(p.a)} ↔ ${sideLabel(p.b)}: ${p.a.residues.length} + ${p.b.residues.length} residues`}
              </button>
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
