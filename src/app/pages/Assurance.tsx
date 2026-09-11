import { useState } from 'preact/hooks';
import { TOOLS, CATEGORIES } from '@/tools/registry';
import { ASSURANCE, assuranceSummary, type AssuranceStatus } from '@/tools/assurance';

const STATUSES: Record<AssuranceStatus, { label: string; icon: string; description: string }> = {
  'reference-tested': { label: 'Reference-tested', icon: '✓', description: 'Declared calculations or data have reference-value fixtures. Coverage is limited to the scope described below.' },
  'method-documented': { label: 'Method-documented', icon: '▤', description: 'The method is documented and representative behavior is tested; independent reference-value coverage is not claimed.' },
  'review-required': { label: 'Review required', icon: '⚠', description: 'Exploratory workflows or interpretation require review beyond the software checks described below.' },
};

export function Assurance() {
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const summary = assuranceSummary();
  const filtered = TOOLS.filter(tool => (status === 'all' || ASSURANCE[tool.id]!.status === status)
    && (category === 'all' || tool.category === category));

  return (
    <section class="mx-auto w-full max-w-6xl space-y-5 p-3 sm:p-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Methods & Assurance</h1>
        <p class="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          Explore the method scope and software evidence for every tool. These statuses describe software checks;
          they do not establish experimental, assay, or clinical validity. Review assumptions and references inside each tool before using its results.
        </p>
      </div>

      <dl class="grid gap-3 sm:grid-cols-3">
        {Object.entries(STATUSES).map(([key, item]) => (
          <div key={key} class="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <dt class="font-semibold"><span aria-hidden="true">{item.icon} </span>{item.label} <span class="font-normal">({summary[key as AssuranceStatus]})</span></dt>
            <dd class="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</dd>
          </div>
        ))}
      </dl>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="assurance-status" class="mb-1 block text-sm font-medium">Assurance status</label>
          <select id="assurance-status" value={status} onChange={e => setStatus(e.currentTarget.value)}
            class="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="all">All statuses</option>
            {Object.entries(STATUSES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </div>
        <div>
          <label for="assurance-category" class="mb-1 block text-sm font-medium">Category</label>
          <select id="assurance-category" value={category} onChange={e => setCategory(e.currentTarget.value)}
            class="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="all">All categories</option>
            {Object.entries(CATEGORIES).sort((a, b) => a[1].order - b[1].order).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </div>
      </div>

      <p role="status" class="text-sm text-slate-600 dark:text-slate-300">Showing {filtered.length} of {TOOLS.length} tools</p>
      {filtered.length === 0 && <p>No tools match these filters. Choose another category or assurance status.</p>}
      <ul class="grid gap-3 md:grid-cols-2">
        {filtered.map(tool => {
          const assurance = ASSURANCE[tool.id]!;
          const badge = STATUSES[assurance.status];
          return (
            <li key={tool.id} class="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h2 class="text-lg font-semibold"><span aria-hidden="true">{tool.icon} </span>{tool.name}</h2>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{CATEGORIES[tool.category].label}</p>
              <p class="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium dark:bg-slate-800"><span aria-hidden="true">{badge.icon}</span>{badge.label}</p>
              <dl class="mt-3 space-y-2 text-sm">
                <div><dt class="font-medium">Method scope</dt><dd class="text-slate-600 dark:text-slate-300">{assurance.scope}</dd></div>
                <div><dt class="font-medium">Verification evidence</dt><dd class="text-slate-600 dark:text-slate-300">{assurance.verification}</dd></div>
                <div><dt class="inline font-medium">Reviewed: </dt><dd class="inline"><time dateTime={assurance.reviewed}>{assurance.reviewed}</time></dd></div>
              </dl>
              <a href={`#/tool/${tool.id}?methods=1`} class="mt-3 inline-block rounded py-1 text-sm font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2">Open {tool.name} tool</a>
              <p class="text-xs text-slate-500 dark:text-slate-400">Methods available inside the tool</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
