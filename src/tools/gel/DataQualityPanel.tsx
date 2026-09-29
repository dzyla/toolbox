import type { QualityIssue } from './quality';
/** Warnings that bear on whether the numbers below can be trusted. */
export function DataQualityPanel({ issues }: { issues: QualityIssue[] }) {
  if (issues.length === 0) return <p class="text-xs text-emerald-700 dark:text-emerald-400">Data quality: no issues detected.</p>;
  return (
    <section aria-label="Data quality" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
      <h4 class="mb-1 font-bold text-amber-900 dark:text-amber-200">Data quality</h4>
      <ul class="space-y-0.5">
        {issues.map(i => (
          <li class={i.level === 'warn' ? 'text-amber-900 dark:text-amber-200' : 'text-slate-600 dark:text-slate-400'}>
            {i.level === 'warn' ? '⚠ ' : '· '}{i.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
