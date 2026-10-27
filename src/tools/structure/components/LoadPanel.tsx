import { useRef, useState } from 'preact/hooks';
import type { Preset } from '../StructureModel';
import { captionClass, selectClass } from './ui';

export const ACCEPT = '.cif,.mmcif,.pdb,.ent,.gz';

export interface LoadPanelProps {
  presets: Preset[];
  /** ID of the loaded RCSB entry ('' for a local file), for the field and the example picker. */
  currentId: string;
  busy: string | null;
  error: string;
  onRcsb(id: string): void;
  onFile(file: File): void;
}

/** One line above the viewer: RCSB ID box, file picker and the example entries. */
export function LoadPanel({ presets, currentId, busy, error, onRcsb, onFile }: LoadPanelProps) {
  // The field follows each newly loaded entry, but typing in between is never overwritten late
  // (derived during render, not in an effect that could run after the user's input).
  const [id, setId] = useState(currentId);
  const shown = useRef(currentId);
  if (shown.current !== currentId) {
    shown.current = currentId;
    if (id !== currentId) setId(currentId);
  }
  const example = presets.some(p => p.id === currentId) ? currentId : '';

  return (
    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <form
          class="flex items-center gap-1.5"
          onSubmit={e => {
            e.preventDefault();
            // Read the field itself: it is the source of truth even before a pending re-render.
            const value = ((e.currentTarget as HTMLFormElement).elements.namedItem('pdbId') as HTMLInputElement).value.trim();
            if (value) onRcsb(value);
          }}
        >
          <label for="structure-pdb-id" class={captionClass}>PDB ID</label>
          <input
            id="structure-pdb-id"
            name="pdbId"
            type="text"
            value={id}
            maxLength={12}
            autoComplete="off"
            spellcheck={false}
            placeholder="1UBQ"
            title="An RCSB PDB ID (1UBQ) or extended ID (pdb_00001ubq); fetches its mmCIF file"
            onInput={e => setId((e.target as HTMLInputElement).value)}
            class="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button type="submit" class="shrink-0 rounded-lg bg-accent-600 px-3 py-1 text-sm font-semibold text-white transition hover:bg-accent-700">Load</button>
        </form>

        <label
          title=".cif, .mmcif, .pdb, .ent, optionally .gz; read on this device. You can also drop a file anywhere on the tool."
          class="cursor-pointer rounded-lg border border-dashed border-slate-400 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-accent-500 focus-within:border-accent-500 focus-within:outline-2 focus-within:outline-accent-500 dark:border-slate-600 dark:text-slate-200 dark:hover:border-accent-400"
        >
          Open file…
          <input
            type="file"
            accept={ACCEPT}
            aria-label="Structure file: choose or drop anywhere"
            class="sr-only"
            onChange={e => {
              const input = e.target as HTMLInputElement;
              const file = input.files?.[0];
              if (file) onFile(file);
              input.value = '';
            }}
          />
        </label>

        <label class="flex items-center gap-1.5">
          <span class={captionClass}>Examples</span>
          <select aria-label="Examples" class={selectClass} value={example}
            onChange={e => { const v = (e.target as HTMLSelectElement).value; if (v) onRcsb(v); }}>
            <option value="" disabled>Pick an entry…</option>
            {presets.map(p => <option key={p.id} value={p.id}>{`${p.id} ${p.name}`}</option>)}
          </select>
        </label>

        {busy && <p role="status" class="text-xs text-slate-600 dark:text-slate-400">{busy}</p>}
      </div>
      {error && (
        <div role="alert" class="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}
