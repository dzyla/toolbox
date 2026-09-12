import type { QuickRnaStructure } from '@/core/sequence-annotator';

export function RnaStructure({ structure }: { structure: QuickRnaStructure }) {
  const width = 320;
  const height = 86;
  const scale = (position: number) => structure.dotBracket.length < 2 ? width / 2 : 16 + (position - 1) * (width - 32) / (structure.dotBracket.length - 1);
  return <section aria-label="Quick RNA secondary structure" class="mt-3 border-t border-indigo-200/70 pt-3 dark:border-indigo-900/70">
    <div class="flex flex-wrap items-baseline justify-between gap-2"><h3 class="text-xs font-bold text-slate-800 dark:text-slate-100">Quick RNA secondary structure</h3><span class="font-mono text-xs text-indigo-700 dark:text-indigo-300">{structure.pairCount} base pairs</span></div>
    <p class="mt-1 text-xs text-slate-500">Local base-pair sketch; not a free-energy prediction.</p>
    <pre class="mt-2 overflow-x-auto rounded bg-white/80 px-2 py-1.5 font-mono text-xs text-slate-800 dark:bg-slate-950/60 dark:text-slate-100">{structure.dotBracket}</pre>
    <svg aria-label="RNA base-pair arc map" class="mt-2 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img">
      <path d={`M 16 ${height - 14} H ${width - 16}`} stroke="currentColor" stroke-width="1" class="text-slate-400" fill="none" />
      {structure.pairs.map(([left, right]) => {
        const start = scale(left), end = scale(right), arcHeight = Math.min(60, 12 + (end - start) * 0.35);
        return <path key={`${left}-${right}`} d={`M ${start} ${height - 14} Q ${(start + end) / 2} ${height - 14 - arcHeight} ${end} ${height - 14}`} fill="none" stroke="#4f46e5" stroke-width="1.8" />;
      })}
    </svg>
  </section>;
}
