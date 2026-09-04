import { useEffect, useState } from 'preact/hooks';
import { searchTools, toolsByCategory, TOOLS, type Category } from '@/tools/registry';
import { listRecent, type Project } from '@/lib/projects';
import { ToolCard } from '../components/ToolCard';
import { ProjectCard } from '../components/ProjectCard';

const CATEGORY_ICONS: Record<Category, string> = {
  calculators: '⚖️',
  sequences: '🧬',
  gels: '🩻',
  counting: '🔴',
  plates: '🟦',
  timing: '⏱️',
  figures: '🎨',
};

const CATEGORY_TABS: Array<{ id: Category; label: string; icon: string }> = [
  { id: 'calculators', label: 'Calculators', icon: '⚖️' },
  { id: 'sequences', label: 'Sequences', icon: '🧬' },
  { id: 'gels', label: 'Gels', icon: '🩻' },
  { id: 'counting', label: 'Counting', icon: '🔴' },
  { id: 'plates', label: 'Plates', icon: '🟦' },
  { id: 'timing', label: 'Timing', icon: '⏱️' },
  { id: 'figures', label: 'Figures', icon: '🎨' },
];

export function Home() {
  const [q, setQ] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [compact, setCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem('biobench_density') === 'compact';
    } catch {
      return false;
    }
  });
  const [recent, setRecent] = useState<Project[]>([]);

  useEffect(() => {
    listRecent(12).then(setRecent).catch(() => setRecent([]));
  }, []);

  const toggleDensity = () => {
    setCompact(prev => {
      const next = !prev;
      try {
        localStorage.setItem('biobench_density', next ? 'compact' : 'detailed');
      } catch {}
      return next;
    });
  };

  const filteredTools = searchTools(q);
  const groups = toolsByCategory(filteredTools);

  return (
    <section class="mx-auto max-w-6xl p-3 sm:p-4">
      {/* Hero & Search Header */}
      <div class="pt-1 pb-3 sm:pt-2 sm:pb-3.5">
        <div class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Lab tools that show their work.
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Free, offline, no account. Every result comes with its formula and references.
            </p>
          </div>
          <div class="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={toggleDensity}
              title={compact ? 'Switch to detailed cards with descriptions' : 'Switch to compact view'}
              class="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <span>{compact ? '☰ Compact' : '⊞ Cards'}</span>
            </button>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {TOOLS.length} tools
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div class="relative mt-2.5">
          <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-400" aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            role="searchbox"
            value={q}
            onInput={e => setQ((e.target as HTMLInputElement).value)}
            placeholder="Search tools: molarity, kDa, TAE, rpm…"
            aria-label="Search tools"
            class="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm shadow-xs focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-900"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear search"
              class="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Menu: flex-wrap so ALL fit without horizontal scrolling */}
        {!q && (
          <div class="mt-2.5 flex flex-wrap items-center gap-1 sm:gap-1.5 text-xs w-full">
            <button
              type="button"
              onClick={() => setSelectedCat('all')}
              class={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                selectedCat === 'all'
                  ? 'bg-accent-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              All ({TOOLS.length})
            </button>
            {CATEGORY_TABS.map(cat => {
              const count = TOOLS.filter(t => t.category === cat.id).length;
              const active = selectedCat === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCat(cat.id)}
                  class={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-accent-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{cat.icon} {cat.label} ({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Projects */}
      {!q && recent.length > 0 && (
        <div class="mb-3 sm:mb-4 w-full">
          <h2 class="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Recent projects</h2>
          <div class="flex flex-wrap gap-2 sm:gap-3 w-full pb-1">
            {recent.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        </div>
      )}

      {/* Search Empty State */}
      {groups.length === 0 && (
        <div class="py-10 text-center">
          <p class="text-slate-500">No tools match “{q}”.</p>
          <button
            type="button"
            onClick={() => setQ('')}
            class="mt-2 text-xs font-medium text-accent-600 hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Search Results Grid */}
      {q ? (
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {groups.flatMap(g => g.tools).map(t => (
            <ToolCard key={t.id} tool={t} compact={compact} />
          ))}
        </div>
      ) : selectedCat !== 'all' ? (
        /* Single Filtered Category */
        (() => {
          const catGroup = groups.find(g => g.category === selectedCat);
          if (!catGroup) return null;
          return (
            <div class="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/30">
              <div class="mb-3 flex items-baseline justify-between px-0.5">
                <div>
                  <h2 class="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <span>{CATEGORY_ICONS[catGroup.category]}</span>
                    <span>{catGroup.label}</span>
                  </h2>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{catGroup.blurb}</p>
                </div>
                <span class="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {catGroup.tools.length} {catGroup.tools.length === 1 ? 'tool' : 'tools'}
                </span>
              </div>
              <div class={`grid ${compact ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'} gap-2`}>
                {catGroup.tools.map(t => (
                  <ToolCard key={t.id} tool={t} compact={compact} />
                ))}
              </div>
            </div>
          );
        })()
      ) : (
        /* All Categories: Clean, Balanced 2-Column Responsive Grid */
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-start">
          {groups.map(g => (
            <div
              key={g.category}
              class="rounded-xl border border-slate-200/90 bg-slate-50/60 p-2.5 sm:p-3 dark:border-slate-800 dark:bg-slate-900/30"
            >
              <div class="mb-2 flex items-baseline justify-between px-0.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm" aria-hidden="true">{CATEGORY_ICONS[g.category]}</span>
                  <h2 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">{g.label}</h2>
                </div>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                  {g.tools.length}
                </span>
              </div>
              <div class={`grid ${compact ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'} gap-1.5 sm:gap-2`}>
                {g.tools.map(t => (
                  <ToolCard key={t.id} tool={t} compact={compact} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
