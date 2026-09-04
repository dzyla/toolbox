import { route, navigate } from '../router';
import { theme, setTheme, resolvedDark } from '../theme';
import { findTool } from '@/tools/registry';

export function Nav() {
  const r = route.value;
  const tool = r.name === 'tool' ? findTool(r.toolId) : undefined;
  const cycle = () => setTheme(theme.value === 'system' ? (resolvedDark.value ? 'light' : 'dark') : theme.value === 'dark' ? 'light' : 'dark');
  return (
    <header class="sticky top-0 z-30 w-full border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div class="mx-auto flex max-w-6xl w-full items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 box-border overflow-hidden">
        <a href="#/" onClick={e => { e.preventDefault(); navigate({ name: 'home' }); }} class="shrink-0 flex items-center gap-2 font-bold text-sm sm:text-base">
          <span aria-hidden="true">🧬</span> Bio-Bench
        </a>
        {tool && <span class="truncate text-xs sm:text-sm text-slate-500 dark:text-slate-400 min-w-0 flex-1">/ {tool.icon} {tool.name}</span>}
        <div class="flex-1 min-w-0" />
        <button type="button" onClick={cycle} aria-label="Toggle dark mode"
          class="shrink-0 rounded-full border border-slate-200 px-2.5 sm:px-3 py-1 text-xs sm:text-sm dark:border-slate-700">
          {resolvedDark.value ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
    </header>
  );
}
