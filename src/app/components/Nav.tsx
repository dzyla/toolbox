import { route, navigate } from '../router';
import { theme, setTheme, resolvedDark } from '../theme';
import { findTool } from '@/tools/registry';

export function Nav() {
  const r = route.value;
  const tool = r.name === 'tool' ? findTool(r.toolId) : undefined;
  const cycle = () => setTheme(theme.value === 'system' ? (resolvedDark.value ? 'light' : 'dark') : theme.value === 'dark' ? 'light' : 'dark');
  return (
    <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <a href="#/" onClick={e => { e.preventDefault(); navigate({ name: 'home' }); }} class="flex items-center gap-2 font-bold">
          <span aria-hidden="true">🧬</span> Bio-Bench
        </a>
        {tool && <span class="truncate text-sm text-slate-500 dark:text-slate-400">/ {tool.icon} {tool.name}</span>}
        <div class="flex-1" />
        <button type="button" onClick={cycle} aria-label="Toggle dark mode"
          class="rounded-full border border-slate-200 px-3 py-1 text-sm dark:border-slate-700">
          {resolvedDark.value ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
    </header>
  );
}
