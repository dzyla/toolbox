import { useRef, useState } from 'preact/hooks';
import type { Preset } from '../StructureModel';

export const ACCEPT = '.cif,.mmcif,.pdb,.ent,.gz';

const sectionLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';

export interface LoadPanelProps {
  presets: Preset[];
  /** ID of the loaded RCSB entry ('' for a local file), for the field and the active preset. */
  currentId: string;
  busy: string | null;
  error: string;
  onRcsb(id: string): void;
  onFile(file: File): void;
}

/** RCSB ID box, file picker and the preset list. */
export function LoadPanel({ presets, currentId, busy, error, onRcsb, onFile }: LoadPanelProps) {
  // The field follows each newly loaded entry, but typing in between is never overwritten late
  // (derived during render, not in an effect that could run after the user's input).
  const [id, setId] = useState(currentId);
  const shown = useRef(currentId);
  if (shown.current !== currentId) {
    shown.current = currentId;
    if (id !== currentId) setId(currentId);
  }

  return (
    <div class="space-y-4">
      <form
        class="space-y-1.5"
        onSubmit={e => {
          e.preventDefault();
          // Read the field itself: it is the source of truth even before a pending re-render.
          const value = ((e.currentTarget as HTMLFormElement).elements.namedItem('pdbId') as HTMLInputElement).value.trim();
          if (value) onRcsb(value);
        }}
      >
        <label for="structure-pdb-id" class={sectionLabel}>PDB ID</label>
        <div class="flex gap-2">
          <input
            id="structure-pdb-id"
            name="pdbId"
            type="text"
            value={id}
            maxLength={12}
            autoComplete="off"
            spellcheck={false}
            placeholder="1UBQ or pdb_00001ubq"
            aria-describedby="structure-pdb-id-hint"
            onInput={e => setId((e.target as HTMLInputElement).value)}
            class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="submit"
            class="shrink-0 rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-700"
          >Load</button>
        </div>
        <p id="structure-pdb-id-hint" class="text-[11px] text-slate-500 dark:text-slate-400">Fetches the mmCIF file from RCSB PDB.</p>
      </form>

      <div>
        <span class={sectionLabel}>Local file</span>
        <label class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-3 text-center transition hover:border-accent-500 focus-within:border-accent-500 dark:border-slate-700 dark:hover:border-accent-400">
          <span class="text-xs font-medium text-slate-700 dark:text-slate-200">Structure file: choose or drop anywhere</span>
          <span class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">.cif, .mmcif, .pdb, .ent, optionally .gz · read on this device</span>
          <input
            type="file"
            accept={ACCEPT}
            class="sr-only"
            onChange={e => {
              const input = e.target as HTMLInputElement;
              const file = input.files?.[0];
              if (file) onFile(file);
              input.value = '';
            }}
          />
        </label>
      </div>

      <div>
        <span id="structure-presets" class={sectionLabel}>Examples</span>
        <div role="group" aria-labelledby="structure-presets" class="grid grid-cols-2 gap-1.5">
          {presets.map(p => {
            const active = p.id === currentId;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                aria-label={`${p.id} ${p.name}`}
                onClick={() => onRcsb(p.id)}
                class={`min-w-0 rounded-lg border px-2 py-1.5 text-left text-xs transition ${active
                  ? 'border-accent-400 bg-accent-50 dark:border-accent-700 dark:bg-accent-950/40'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
              >
                <span class="block font-mono font-semibold text-slate-900 dark:text-slate-100">{p.id}</span>
                <span class="block truncate text-[11px] text-slate-600 dark:text-slate-400">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {busy && <p role="status" class="text-xs text-slate-600 dark:text-slate-400">{busy}</p>}
      {error && (
        <div role="alert" class="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}
