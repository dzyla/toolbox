import { useState } from 'preact/hooks';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { legacyPlasmidToDocument } from '@/core/plasmid/legacy';
import { importPlasmidFile, importPlasmidText } from '@/core/plasmid/import';
import { validateDocument, type PlasmidDocument } from '@/core/plasmid/model';
import { importErrorMessage } from '@/lib/file-import';
import { ImportAlert } from '@/app/components/ImportAlert';
import type { HubSource, SourceRole } from './state';

const BUTTON = 'rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800';
const MAX_SEQUENCE_FILE_BYTES = 20 * 1024 * 1024;

function newSourceId(): string {
  return `src-${Math.random().toString(36).slice(2, 10)}`;
}

function checked(document: PlasmidDocument): PlasmidDocument {
  const validation = validateDocument(document);
  if (!validation.valid) throw new Error(validation.reason);
  return document;
}

export function SourcesPanel({ sources, onChange }: { sources: HubSource[]; onChange: (sources: HubSource[]) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  /** FASTA carries no topology: vectors are taken as circular, inserts as linear (PCR products). GenBank and SnapGene keep their own. */
  const withTopology = (document: PlasmidDocument, role: SourceRole): PlasmidDocument =>
    document.provenance.format === 'fasta' ? { ...document, topology: role === 'vector' ? 'circular' : 'linear' } : document;
  const add = (document: PlasmidDocument) => {
    const role: SourceRole = sources.some(source => source.role === 'vector') ? 'insert' : 'vector';
    onChange([...sources, { id: newSourceId(), role, document: withTopology(checked(document), role) }]);
  };
  const update = (id: string, patch: Partial<HubSource>) => onChange(sources.map(source => source.id === id ? { ...source, ...patch } : source));
  const move = (index: number, delta: number) => {
    const next = [...sources];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    onChange(next);
  };

  return <section aria-labelledby="sources-heading" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="sources-heading" class="text-sm font-semibold">1 · Sequences</h2>
      <p class="text-xs text-slate-600 dark:text-slate-400">Add the vector and every insert once; each method reuses them.</p>
    </div>

    {sources.length === 0 && <p class="text-sm text-slate-600 dark:text-slate-400">No sequences yet. Open a SnapGene, GenBank or FASTA file, paste a sequence, or start from a preset vector.</p>}
    <ol class="space-y-2">
      {sources.map((source, index) => <li key={source.id} class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-700">
        <input aria-label={`Name of sequence ${index + 1}`} class="min-w-0 flex-1 rounded border border-slate-300 bg-transparent px-2 py-1 text-sm font-medium dark:border-slate-600" value={source.document.name}
          onChange={event => update(source.id, { document: { ...source.document, name: event.currentTarget.value || source.document.name } })} />
        <span class="text-xs text-slate-600 dark:text-slate-400">{source.document.sequence.length.toLocaleString()} bp · {source.document.annotations.length} features</span>
        <select aria-label={`Topology of ${source.document.name}`} class="rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600" value={source.document.topology}
          onChange={event => update(source.id, { document: { ...source.document, topology: event.currentTarget.value as PlasmidDocument['topology'] } })}>
          <option value="circular">Circular</option>
          <option value="linear">Linear</option>
        </select>
        <select aria-label={`Role of ${source.document.name}`} class="rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600" value={source.role}
          onChange={event => update(source.id, { role: event.currentTarget.value as SourceRole })}>
          <option value="vector">Vector</option>
          <option value="insert">Insert</option>
        </select>
        <button type="button" class={BUTTON} aria-label={`Move ${source.document.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
        <button type="button" class={BUTTON} aria-label={`Move ${source.document.name} down`} disabled={index === sources.length - 1} onClick={() => move(index, 1)}>↓</button>
        <button type="button" class={BUTTON} aria-label={`Remove ${source.document.name}`} onClick={() => onChange(sources.filter(item => item.id !== source.id))}>Remove</button>
      </li>)}
    </ol>

    <div class="grid gap-3 md:grid-cols-[1fr_auto]">
      <label class="block text-xs font-medium">Paste FASTA, GenBank or raw DNA
        <textarea class="mt-1 w-full rounded border border-slate-300 bg-transparent p-2 font-mono text-xs dark:border-slate-600" rows={3} value={text} onInput={event => setText(event.currentTarget.value)} />
      </label>
      <div class="flex flex-col gap-2 md:justify-end">
        <button type="button" class={`${BUTTON} bg-accent-700 text-white hover:bg-accent-800`} disabled={!text.trim()} onClick={() => {
          setError('');
          try { add(importPlasmidText(text).document); setText(''); }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'This sequence could not be read.'); }
        }}>Add pasted sequence</button>
        <label class="text-xs font-medium">Open files
          <input class="mt-1 block max-w-full text-xs" type="file" multiple accept=".dna,.gb,.gbk,.genbank,.fasta,.fa,.fna,.seq,.txt" onChange={event => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = '';
            setError('');
            void (async () => {
              const added: HubSource[] = [];
              for (const file of files) {
                try {
                  if (file.size > MAX_SEQUENCE_FILE_BYTES) throw new Error('This file is larger than 20 MB.');
                  const { document } = await importPlasmidFile(file);
                  added.push({ id: newSourceId(), role: 'insert', document: checked({ ...document, provenance: { ...document.provenance, filename: file.name } }) });
                } catch (cause) { setError(importErrorMessage(cause, file.name)); }
              }
              if (!added.length) return;
              if (!sources.some(source => source.role === 'vector')) added[0]!.role = 'vector';
              onChange([...sources, ...added.map(item => ({ ...item, document: withTopology(item.document, item.role) }))]);
            })();
          }} />
        </label>
        <label class="text-xs font-medium">Preset vector
          <select class="mt-1 block w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600" value="" onChange={event => {
            const preset = PRESET_PLASMIDS.find(item => item.id === event.currentTarget.value);
            if (preset) add({ ...legacyPlasmidToDocument(preset), id: newSourceId() });
          }}>
            <option value="">Add a preset…</option>
            {PRESET_PLASMIDS.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
        </label>
      </div>
    </div>
    {error && <ImportAlert message={error} />}
  </section>;
}
