import type { Coloring, Representation } from '../MolstarViewer';

export const REPRESENTATIONS: { value: Representation; label: string }[] = [
  { value: 'auto', label: 'Auto (by size)' },
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'surface', label: 'Surface' },
  { value: 'ball-and-stick', label: 'Ball and stick' },
  { value: 'spacefill', label: 'Spacefill' },
];

/** '' is "Default": Mol*'s preset colouring for the representation (the state is null). */
export const COLORINGS: { value: Coloring | ''; label: string }[] = [
  { value: '', label: 'Default' },
  { value: 'chain-id', label: 'Chain' },
  { value: 'entity-id', label: 'Entity' },
  { value: 'secondary-structure', label: 'Secondary structure' },
  { value: 'residue-name', label: 'Residue type' },
  { value: 'uncertainty', label: 'B-factor' },
];

const selectClass = 'rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
const captionClass = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';
const toggleClass = (on: boolean) => `rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${on
  ? 'border-accent-400 bg-accent-50 text-accent-800 dark:border-accent-700 dark:bg-accent-950/40 dark:text-accent-200'
  : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`;

export interface DisplayToolbarProps {
  representation: Representation;
  /** null: Mol*'s default colouring. */
  coloring: Coloring | null;
  onRepresentation(r: Representation): void;
  onColoring(c: Coloring | null): void;
  panels: boolean;
  onPanels(v: boolean): void;
  large: boolean;
  onLarge(v: boolean): void;
  modelCount: number;
  modelIndex: number;
  onModelIndex(i: number): void;
  canSnapshot: boolean;
  onSnapshot(): void;
}

/** Our own display controls above the Mol* canvas. */
export function DisplayToolbar(p: DisplayToolbarProps) {
  return (
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2" role="toolbar" aria-label="3D display">
      <label class="flex items-center gap-1.5">
        <span class={captionClass}>Representation</span>
        <select aria-label="Representation" class={selectClass} value={p.representation}
          onChange={e => p.onRepresentation((e.target as HTMLSelectElement).value as Representation)}>
          {REPRESENTATIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label class="flex items-center gap-1.5">
        <span class={captionClass}>Colour</span>
        <select aria-label="Colour" class={selectClass} value={p.coloring ?? ''}
          onChange={e => p.onColoring(((e.target as HTMLSelectElement).value || null) as Coloring | null)}>
          {COLORINGS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {p.modelCount > 1 && (
        <label class="flex items-center gap-1.5">
          <span class="sr-only">Model</span>
          <select aria-label="Model" class={selectClass} value={String(p.modelIndex)}
            onChange={e => p.onModelIndex(Number((e.target as HTMLSelectElement).value))}>
            {Array.from({ length: p.modelCount }, (_, i) => (
              <option key={i} value={String(i)}>{`Model ${i + 1} of ${p.modelCount}`}</option>
            ))}
          </select>
        </label>
      )}
      <div class="ml-auto flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={p.panels} onClick={() => p.onPanels(!p.panels)} class={toggleClass(p.panels)}>Mol* panels</button>
        <button type="button" aria-pressed={p.large} onClick={() => p.onLarge(!p.large)} class={toggleClass(p.large)}>Large canvas</button>
        <button type="button" disabled={!p.canSnapshot} onClick={p.onSnapshot} class={`${toggleClass(false)} disabled:opacity-50`}>Snapshot (PNG)</button>
      </div>
    </div>
  );
}
