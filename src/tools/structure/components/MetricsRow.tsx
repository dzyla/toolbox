import type { StructureMetrics } from '@/core/structure';

const f = (n: number) => n.toLocaleString('en-US');

/**
 * Coordinate-derived numbers for the selected model. Atom counts cover the whole model (water
 * included; "Atoms" also counts hydrogens); Rg and the bounding box use non-water heavy atoms.
 */
export function MetricsRow({ metrics }: { metrics: StructureMetrics }) {
  const size = metrics.bounds.max.map((v, i) => (v - metrics.bounds.min[i]!).toFixed(1)).join(' × ');
  const items: [string, string][] = [
    ['Atoms (incl. H)', f(metrics.atomCount)],
    ['Heavy atoms', f(metrics.heavyAtomCount)],
    ['Residues', f(metrics.residueCount)],
    ['Radius of gyration', `${metrics.radiusOfGyration.toFixed(1)} Å`],
    ['Bounding box', `${size} Å`],
  ];
  return (
    <section aria-label="Structure metrics" class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{k}</dt>
            <dd class="font-mono tabular-nums text-slate-800 dark:text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
