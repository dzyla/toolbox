import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../router';
import { findTool } from '@/tools/registry';
import { relativeTime } from '@/lib/format';
import type { Project } from '@/lib/projects';

export function ProjectCard({ project }: { project: Project }) {
  const tool = findTool(project.toolId);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!project.thumbnail) return;
    const u = URL.createObjectURL(project.thumbnail);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [project.thumbnail]);
  return (
    <button type="button" onClick={() => navigate({ name: 'tool', toolId: project.toolId, projectId: project.id })}
      class="w-44 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-left hover:border-accent-500 dark:border-slate-700 dark:bg-slate-900">
      <div class="grid h-28 place-items-center bg-slate-100 dark:bg-slate-800">
        {url ? <img src={url} alt="" class="h-full w-full object-cover" /> : <span class="text-3xl" aria-hidden="true">{tool?.icon ?? '📄'}</span>}
      </div>
      <div class="p-2">
        <div class="truncate text-sm font-semibold">{project.name}</div>
        <div class="truncate text-xs text-slate-500 dark:text-slate-400">{tool?.name ?? project.toolId} · {relativeTime(project.updatedAt)}</div>
      </div>
    </button>
  );
}
