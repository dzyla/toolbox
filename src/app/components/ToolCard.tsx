import { navigate } from '../router';
import type { ToolMeta } from '@/tools/registry';

export function ToolCard({ tool }: { tool: ToolMeta }) {
  const pill = tool.status === 'porting' ? 'Soon' : tool.status === 'planned' ? 'Planned' : null;
  return (
    <button type="button" onClick={() => navigate({ name: 'tool', toolId: tool.id })}
      class="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-accent-500 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl dark:bg-slate-800" aria-hidden="true">{tool.icon}</span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2 font-semibold">{tool.name}
          {pill && <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">{pill}</span>}
        </span>
        <span class="block truncate text-sm text-slate-500 dark:text-slate-400">{tool.blurb}</span>
      </span>
    </button>
  );
}
