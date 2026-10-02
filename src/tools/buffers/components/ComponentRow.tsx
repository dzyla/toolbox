import chemicalsJson from '@/data/chemicals.json';
import type { RecipeUnit } from '@/core/buffers/recipe';
import type { EditorComponent } from '../state';
import { Segmented, fieldClass, labelClass } from './ui';

interface Chemical { name: string; mw: number; type: string; synonyms?: string[]; hydrateOf?: string; waters?: number }
const CHEMICALS = chemicalsJson.chemicals as Chemical[];
const explicitForm = (name: string) => /hydrate|anhydrous|[·.]\s*\d*\s*h[₂2]o/i.test(name);

export interface ComponentRowProps {
  component: EditorComponent; index: number; total: number;
  onChange: (patch: Partial<EditorComponent>) => void;
  onKind: (kind: EditorComponent['kind']) => void;
  onRemove: () => void;
  onLookup: () => void;
}

export function ComponentRow({ component, index, total, onChange, onKind, onRemove, onLookup }: ComponentRowProps) {
  const suffix = index === 0 ? '' : ` ${index + 1}`;
  const q = component.query.trim().toLowerCase();
  const matches = q && q !== component.name.toLowerCase() ? CHEMICALS.filter(chemical =>
    chemical.name.toLowerCase().includes(q) || chemical.synonyms?.some(synonym => synonym.toLowerCase().includes(q)),
  ).slice(0, 8) : [];

  return (
    <div class="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs transition dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800/80">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <span class="inline-flex h-5 w-5 shrink-0 select-none items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700 dark:bg-accent-950 dark:text-accent-300">{index + 1}</span>
          <strong class="max-w-[200px] truncate text-sm font-bold text-slate-900 dark:text-slate-100">{component.name || 'New component'}</strong>
          <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {component.kind === 'solid' ? (component.mw ? `${component.mw} g/mol` : 'MW needed') : `${component.stockConc ?? 1} ${component.stockUnit || 'M'}`}
          </span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Segmented<'solid' | 'stock'>
            label={`Component form${suffix}`}
            value={component.kind as 'solid' | 'stock'}
            options={[{ value: 'solid', label: 'Solid' }, { value: 'stock', label: 'Stock' }]}
            onChange={onKind}
          />
          <button
            type="button"
            onClick={onRemove}
            disabled={total === 1}
            class="flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-20 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            title="Remove component"
            aria-label={`Remove component${suffix}`}
          >✕</button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
        <div class="relative sm:col-span-7">
          <label class="block">
            <span class={labelClass}>Search Chemical / Formula</span>
            <div class="relative">
              <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs text-slate-500 dark:text-slate-400">🔍</span>
              <input
                aria-label={`Chemical search${suffix}`}
                value={component.query}
                onInput={event => onChange({ query: (event.target as HTMLInputElement).value })}
                class={`${fieldClass} py-1.5 pl-7 text-xs`}
                placeholder="e.g. Tris, NaCl, MgCl2, SDS"
              />
            </div>
          </label>
          {matches.length > 0 && (
            <div class="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800" aria-label="Chemical matches">
              {matches.map(chemical => (
                <button
                  key={chemical.name}
                  type="button"
                  class="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-700/80"
                  onClick={() => onChange({ query: chemical.name, name: chemical.name, mw: chemical.mw, waters: 0 })}
                >
                  <strong class="font-medium text-slate-900 dark:text-slate-100">{chemical.name}</strong>
                  <span class="ml-1.5 text-slate-500 dark:text-slate-400">— {chemical.mw} g/mol{chemical.hydrateOf ? ` (${chemical.waters} waters)` : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div class="sm:col-span-5">
          <label class="block">
            <span class={labelClass}>Target Concentration</span>
            <span class="flex">
              <input
                aria-label={`Target concentration${suffix}`}
                type="number" min="0" step="any"
                value={component.target.value}
                onInput={event => onChange({ target: { ...component.target, value: Number((event.target as HTMLInputElement).value) } })}
                class={`${fieldClass} mono flex-1 rounded-r-none py-1.5 text-xs`}
              />
              <select
                aria-label={`Target unit${suffix}`}
                value={component.target.unit}
                onChange={event => onChange({ target: { ...component.target, unit: (event.target as HTMLSelectElement).value as RecipeUnit } })}
                class="rounded-r-lg border border-l-0 border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option>M</option><option>mM</option><option>%</option><option value="x">×</option>
              </select>
            </span>
          </label>
        </div>
      </div>

      {component.kind === 'solid' ? (
        <div class="grid grid-cols-1 gap-2.5 pt-0.5 sm:grid-cols-2">
          <div>
            <div class="mb-1 flex items-center justify-between">
              <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">MW (g/mol)</span>
              <button type="button" onClick={onLookup} class="text-[10px] font-medium text-accent-600 hover:underline dark:text-accent-400">PubChem MW ↗</button>
            </div>
            <input
              aria-label={`Molecular weight${suffix}`}
              type="number" step="any" value={component.mw ?? ''}
              onInput={event => onChange({ mw: Number((event.target as HTMLInputElement).value) })}
              class={`${fieldClass} mono py-1.5 text-xs`}
            />
          </div>
          <div>
            <span class={labelClass}>Hydrate Waters (·nH₂O)</span>
            <input
              aria-label={`Additional waters${suffix}`}
              type="number" min="0" step="1" value={component.waters ?? 0}
              disabled={explicitForm(component.name)}
              onInput={event => onChange({ waters: Number((event.target as HTMLInputElement).value) })}
              class={`${fieldClass} mono py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50`}
            />
          </div>
        </div>
      ) : (
        <div class="grid grid-cols-1 gap-2.5 pt-0.5 sm:grid-cols-3">
          <div>
            <span class={labelClass}>Stock Conc</span>
            <input aria-label="Stock Conc" type="number" step="any" value={component.stockConc ?? 1}
              onInput={event => onChange({ stockConc: Number((event.target as HTMLInputElement).value) })}
              class={`${fieldClass} mono py-1.5 text-xs`} />
          </div>
          <div>
            <span class={labelClass}>Stock Unit</span>
            <select aria-label="Stock Unit" value={component.stockUnit ?? 'M'}
              onChange={event => onChange({ stockUnit: (event.target as HTMLSelectElement).value as RecipeUnit })}
              class={`${fieldClass} py-1.5 text-xs`}>
              <option>M</option><option>mM</option><option>%</option><option value="x">×</option>
            </select>
          </div>
          <div>
            <span class={labelClass}>Density (g/mL, opt)</span>
            <input aria-label="Density (g/mL, opt)" type="number" step="any" value={component.density ?? ''}
              onInput={event => { const v = (event.target as HTMLInputElement).value; onChange({ density: v ? Number(v) : undefined }); }}
              class={`${fieldClass} mono py-1.5 text-xs`} />
          </div>
        </div>
      )}
    </div>
  );
}
