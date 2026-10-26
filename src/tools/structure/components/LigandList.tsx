import { useMemo } from 'preact/hooks';
import type { Ligand, ResidueRef, StructureModel } from '@/core/structure';
import type { MolstarHandle } from '../MolstarViewer';
import { captionClass } from './ui';

const WATER = new Set(['HOH', 'DOD', 'WAT']);

interface Group { compId: string; name: string; items: Ligand[] }

const refOf = (l: Ligand): ResidueRef => ({ authAsymId: l.authAsymId, authSeqId: l.authSeqId, insCode: '' });
const rowButton = 'rounded-md border border-slate-300 px-1.5 py-0.5 font-mono text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';

/** Water residues in the selected model (they are not in `model.ligands`). */
function countWaters(model: StructureModel, modelIndex: number): number {
  const t = model.models[modelIndex];
  if (!t) return 0;
  const seen = new Set<string>();
  for (let i = 0; i < t.count; i++) {
    if (WATER.has(t.compId[i]!)) seen.add(`${t.labelAsymId[i]}|${t.authAsymId[i]}|${t.authSeqId[i]}|${t.insCode[i]}`);
  }
  return seen.size;
}

/** Ligands grouped by component ID (water hidden); a group button focuses every instance, an instance button one. */
export function LigandList({ model, modelIndex, viewer }: { model: StructureModel; modelIndex: number; viewer: MolstarHandle | null }) {
  const groups = useMemo<Group[]>(() => {
    const by = new Map<string, Group>();
    for (const l of model.ligands) {
      const g = by.get(l.compId);
      if (g) g.items.push(l); else by.set(l.compId, { compId: l.compId, name: l.name, items: [l] });
    }
    return [...by.values()];
  }, [model]);
  const waters = useMemo(() => countWaters(model, modelIndex), [model, modelIndex]);

  return (
    <section aria-labelledby="ligands-heading" class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <h2 id="ligands-heading" class="text-sm font-semibold text-slate-900 dark:text-slate-100">Ligands</h2>
      {groups.length === 0 && <p class="text-xs text-slate-500 dark:text-slate-400">No ligands in this structure.</p>}
      <ul class="space-y-2">
        {groups.map(g => (
          <li key={g.compId} class="flex flex-wrap items-start gap-x-3 gap-y-1 text-xs text-slate-800 dark:text-slate-200">
            <button type="button" class={rowButton} aria-label={`Focus all ${g.compId}`} title="Focus every copy in 3D"
              onClick={() => viewer?.focus(g.items.map(refOf))}>{g.compId}</button>
            <div class="min-w-40 flex-1 space-y-1">
              <div><span class="break-words">{g.name || g.compId}</span> <span class="text-slate-500 dark:text-slate-400">×{g.items.length}</span></div>
              <div class="flex flex-wrap items-center gap-1">
                <span class={captionClass}>Chains</span>
                {g.items.map(l => (
                  <button key={`${l.labelAsymId}-${l.authSeqId}`} type="button" class={rowButton}
                    aria-label={`Focus ${l.compId} ${l.authAsymId}${l.authSeqId}`}
                    onClick={() => viewer?.focus([refOf(l)])}>{`${l.labelAsymId} [auth ${l.authAsymId}] ${l.authSeqId}`}</button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {waters > 0 && <p class="text-xs text-slate-500 dark:text-slate-400">{`${waters} ${waters === 1 ? 'water' : 'waters'} hidden`}</p>}
    </section>
  );
}
