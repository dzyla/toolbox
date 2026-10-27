import type { Coloring, Representation } from '../MolstarViewer';
import { segmentClass, segmentGroupClass } from './ui';

export type ViewerSize = 'small' | 'medium' | 'large';
const SIZES: { value: ViewerSize; short: string; label: string; title: string }[] = [
  { value: 'small', short: 'S', label: 'Small', title: 'Small viewer' },
  { value: 'medium', short: 'M', label: 'Medium', title: 'Medium viewer: fits the screen, up to about 640 px tall' },
  { value: 'large', short: 'L', label: 'Large', title: 'Large viewer: fills the window' },
];

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
  { value: 'plddt', label: 'pLDDT' },
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
  /** Offer pLDDT colouring (the structure looks like a predicted model). */
  plddt: boolean;
  hydrogens: boolean;
  onHydrogens(v: boolean): void;
  /** The shown model has hydrogen atoms (the toggle is disabled otherwise). */
  hasHydrogens: boolean;
  panels: boolean;
  onPanels(v: boolean): void;
  size: ViewerSize;
  onSize(s: ViewerSize): void;
  /** null: the browser cannot show the workspace full screen. */
  fullscreen: boolean | null;
  onFullscreen(): void;
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
        <span class={captionClass}>Style</span>
        <select aria-label="Representation style" class={selectClass} value={p.representation}
          onChange={e => p.onRepresentation((e.target as HTMLSelectElement).value as Representation)}>
          {REPRESENTATIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label class="flex items-center gap-1.5">
        <span class={captionClass}>Colour</span>
        <select aria-label="Colour" class={selectClass} value={p.coloring ?? ''}
          onChange={e => p.onColoring(((e.target as HTMLSelectElement).value || null) as Coloring | null)}>
          {COLORINGS.filter(o => o.value !== 'plddt' || p.plddt || p.coloring === 'plddt')
            .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
      <button type="button" aria-pressed={p.hydrogens && p.hasHydrogens} disabled={!p.hasHydrogens}
        title={p.hasHydrogens ? 'Show or hide hydrogen atoms' : 'This model has no hydrogen atoms'}
        onClick={() => p.onHydrogens(!p.hydrogens)} class={`${toggleClass(p.hydrogens && p.hasHydrogens)} disabled:opacity-50`}>Hydrogens</button>
      <div class="ml-auto flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="Viewer size" class={segmentGroupClass}>
          {SIZES.map(o => (
            <button key={o.value} type="button" aria-pressed={p.size === o.value} aria-label={o.label} title={o.title}
              class={segmentClass(p.size === o.value)} onClick={() => p.onSize(o.value)}>{o.short}</button>
          ))}
        </div>
        <button type="button" aria-pressed={p.panels} onClick={() => p.onPanels(!p.panels)} class={toggleClass(p.panels)}>Mol* panels</button>
        {p.fullscreen !== null && (
          <button type="button" aria-pressed={p.fullscreen} onClick={p.onFullscreen} class={toggleClass(p.fullscreen)}>Full screen</button>
        )}
        <button type="button" disabled={!p.canSnapshot} onClick={p.onSnapshot} class={`${toggleClass(false)} disabled:opacity-50`} title="Download the 3D view as a PNG image">Snapshot</button>
      </div>
    </div>
  );
}
