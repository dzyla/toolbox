import type { ProteinFeature } from '@/core/protein/features';

export function DetectedFeatures({ features, onSelect }: { features: ProteinFeature[]; onSelect: (feature: ProteinFeature) => void }) {
  return <section class="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-label="Detected protein features">
    <div class="flex items-baseline justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
      <div><h2 class="text-sm font-bold">Detected protein features</h2><p class="mt-0.5 text-xs text-slate-500">Protein Workbench scans; topology calls are candidates, not predictions.</p></div>
      <span class="font-mono text-xs text-slate-500">{features.length} hit{features.length === 1 ? '' : 's'}</span>
    </div>
    {features.length ? <div class="divide-y divide-slate-100 dark:divide-slate-800">
      {features.map((feature, index) => <button key={`${feature.kind}-${feature.name}-${feature.start}-${index}`} type="button" aria-label={`Detected feature: ${feature.name}, residues ${feature.start}–${feature.end}`} onClick={() => onSelect(feature)} class="grid w-full grid-cols-[0.5rem_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500 dark:hover:bg-slate-800/50">
        <span class="mt-1 h-8 rounded-full" style={{ backgroundColor: feature.color }} />
        <span class="min-w-0"><span class="block text-sm font-semibold text-slate-900 dark:text-slate-100">{feature.name}</span><span class="mt-0.5 block text-xs text-slate-500">{feature.category}{feature.note ? ` · ${feature.note}` : ''}</span></span>
        <span class="rounded bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{feature.start}–{feature.end}</span>
      </button>)}
    </div> : <p class="px-4 py-5 text-sm text-slate-500">No matching tags, motifs, or topology candidates in this sequence.</p>}
  </section>;
}
