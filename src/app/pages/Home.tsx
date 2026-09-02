import { useEffect, useState } from 'preact/hooks';
import { searchTools, toolsByCategory } from '@/tools/registry';
import { listRecent, type Project } from '@/lib/projects';
import { ToolCard } from '../components/ToolCard';
import { ProjectCard } from '../components/ProjectCard';

export function Home() {
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<Project[]>([]);
  useEffect(() => { listRecent(12).then(setRecent).catch(() => setRecent([])); }, []);

  const groups = toolsByCategory(searchTools(q));

  return (
    <section class="mx-auto max-w-6xl p-4">
      <div class="py-4">
        <h1 class="text-3xl font-extrabold tracking-tight">Lab tools that show their work.</h1>
        <p class="mt-1 text-slate-600 dark:text-slate-300">Free, offline, no account. Every result comes with its formula and references.</p>
        <input type="search" role="searchbox" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)}
          placeholder="Search tools: molarity, kDa, TAE, rpm…" aria-label="Search tools"
          class="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base shadow-sm focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900" />
      </div>

      {!q && recent.length > 0 && (
        <div class="mb-6">
          <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Recent projects</h2>
          <div class="flex gap-3 overflow-x-auto pb-2">{recent.map(p => <ProjectCard key={p.id} project={p} />)}</div>
        </div>
      )}

      {groups.length === 0 && <p class="py-8 text-center text-slate-500">No tools match “{q}”.</p>}
      <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(g => (
          <div key={g.category} class="rounded-2xl border border-slate-200 bg-slate-100/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <h2 class="mb-1 px-1 font-bold">{g.label}</h2>
            <p class="mb-3 px-1 text-xs text-slate-500">{g.blurb}</p>
            <div class="space-y-2">{g.tools.map(t => <ToolCard key={t.id} tool={t} />)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
