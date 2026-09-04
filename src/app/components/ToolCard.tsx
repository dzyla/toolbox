import { navigate } from '../router';
import type { ToolMeta } from '@/tools/registry';

export interface ToolCardProps {
  tool: ToolMeta;
  compact?: boolean;
}

export function ToolCard({ tool, compact = false }: ToolCardProps) {
  const pill = tool.status === 'porting' ? 'Soon' : tool.status === 'planned' ? 'Planned' : null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => navigate({ name: 'tool', toolId: tool.id })}
        title={`${tool.name} — ${tool.blurb}`}
        class="group flex w-full items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-left transition hover:border-accent-500 hover:bg-slate-50/70 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-500 dark:hover:bg-slate-800/60"
      >
        <span
          class="grid h-6 w-6 shrink-0 place-items-center rounded bg-slate-100 text-sm transition-transform group-hover:scale-110 dark:bg-slate-800"
          aria-hidden="true"
        >
          {tool.icon}
        </span>
        <span class="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800 group-hover:text-accent-600 dark:text-slate-200 dark:group-hover:text-accent-400">
          {tool.name}
        </span>
        {pill && (
          <span class="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {pill}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate({ name: 'tool', toolId: tool.id })}
      title={`${tool.name} — ${tool.blurb}`}
      class="group flex w-full items-center gap-2.5 rounded-lg border border-slate-200/90 bg-white p-2 text-left transition hover:border-accent-500 hover:bg-slate-50/50 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-500 dark:hover:bg-slate-800/60"
    >
      <span
        class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-base transition-transform group-hover:scale-105 dark:bg-slate-800"
        aria-hidden="true"
      >
        {tool.icon}
      </span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-800 group-hover:text-accent-600 dark:text-slate-100 dark:group-hover:text-accent-400">
          <span class="truncate">{tool.name}</span>
          {pill && (
            <span class="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {pill}
            </span>
          )}
        </span>
        <span class="block truncate text-[11px] text-slate-500 dark:text-slate-400">
          {tool.blurb}
        </span>
      </span>
    </button>
  );
}
