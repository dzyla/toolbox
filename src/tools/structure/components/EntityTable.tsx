import { useMemo, useState } from 'preact/hooks';
import type { Entity, StructureModel } from '@/core/structure';
import { entityName } from '../sequence';

const KIND: Record<Entity['kind'], string> = { polymer: 'Polymer', 'non-polymer': 'Ligand', branched: 'Branched', water: 'Water' };
const POLYMER: Record<string, string> = { protein: 'Protein', dna: 'DNA', rna: 'RNA', other: 'Polymer' };

/** Show the filter box above this many polymer chains. */
const FILTER_ABOVE = 8;

interface ChainCell { label: string; auth: string; modelled?: number; polymer?: boolean }
interface Row { entity: Entity; kind: string; description: string; length?: number; chains: ChainCell[] }

const th = 'px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';
const td = 'px-2 py-1.5 align-top';

const chainButton = 'whitespace-nowrap rounded px-0.5 text-accent-700 underline decoration-dotted underline-offset-2 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-slate-800';

/**
 * Every entity except water: kind, description, chains (label [auth]), length and modelled residues
 * per chain. A polymer chain is a button that shows it in the strip and in 3D.
 */
export function EntityTable({ model, onChain }: { model: StructureModel; onChain?(labelAsymId: string): void }) {
  const [query, setQuery] = useState('');
  const rows = useMemo<Row[]>(() => {
    const ligandAuth = new Map(model.ligands.map(l => [l.labelAsymId, l.authAsymId]));
    return model.entities.filter(e => e.kind !== 'water').map(e => {
      if (e.kind === 'polymer') {
        const chains = model.chains.filter(c => c.entityId === e.id);
        return {
          entity: e,
          kind: POLYMER[e.polymerType ?? 'other'] ?? 'Polymer',
          description: entityName(e),
          length: e.sequence.length || chains[0]?.residues.length,
          chains: chains.map(c => ({ label: c.labelAsymId, auth: c.authAsymId, modelled: c.residues.filter(r => r.modelled).length, polymer: true })),
        };
      }
      return {
        entity: e,
        kind: KIND[e.kind],
        description: e.description || KIND[e.kind],
        chains: e.labelAsymIds.map(id => ({ label: id, auth: ligandAuth.get(id) ?? '?' })),
      };
    });
  }, [model]);

  const q = query.trim().toLowerCase();
  const shown = rows.flatMap(row => {
    if (!q || row.description.toLowerCase().includes(q) || row.entity.id === q) return [row];
    const chains = row.chains.filter(c => c.label.toLowerCase().includes(q) || c.auth.toLowerCase().includes(q));
    return chains.length ? [{ ...row, chains }] : [];
  });

  return (
    <section aria-labelledby="entities-heading" class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 id="entities-heading" class="text-sm font-semibold text-slate-900 dark:text-slate-100">Entities and chains</h2>
        {model.chains.length > FILTER_ABOVE && (
          <input type="search" aria-label="Filter chains" placeholder="Filter by chain or name" value={query}
            onInput={e => setQuery((e.target as HTMLInputElement).value)}
            class="w-48 max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
        )}
      </div>
      <div class="overflow-x-auto">
        <table aria-label="Entities" class="w-full text-xs text-slate-800 dark:text-slate-200">
          <thead class="border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th scope="col" class={th}>Entity</th>
              <th scope="col" class={th}>Kind</th>
              <th scope="col" class={th}>Description</th>
              <th scope="col" class={th}>Chains [auth]</th>
              <th scope="col" class={`${th} text-right`}>Length</th>
              <th scope="col" class={th}>Modelled</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map(row => (
              <tr key={row.entity.id}>
                <td class={`${td} font-mono`}>{row.entity.id}</td>
                <td class={td}>{row.kind}</td>
                <td class={`${td} min-w-40 break-words`}>{row.description}</td>
                <td class={`${td} font-mono`}>
                  {row.chains.map((c, k) => (
                    <span key={c.label}>{k > 0 && ', '}{c.polymer && onChain
                      ? <button type="button" class={chainButton} aria-label={`Show chain ${c.label} [auth ${c.auth}]`} onClick={() => onChain(c.label)}>{`${c.label} [auth ${c.auth}]`}</button>
                      : <span class="whitespace-nowrap">{`${c.label} [auth ${c.auth}]`}</span>}</span>
                  ))}
                </td>
                <td class={`${td} text-right tabular-nums`}>{row.length ?? '—'}</td>
                <td class={`${td} tabular-nums`}>
                  {row.length === undefined ? '—' : row.chains.map((c, k) => <span key={c.label}>{k > 0 && ', '}<span class="whitespace-nowrap">{`${c.label} ${c.modelled}`}</span></span>)}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={6} class={`${td} text-slate-500 dark:text-slate-400`}>No chain matches “{query}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
