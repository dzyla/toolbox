import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { findTool, type ToolProps } from '@/tools/registry';
import { NotFound } from './NotFound';
import { REPO } from '../components/Footer';

export function ToolPage({ toolId, projectId }: { toolId: string; projectId?: string }) {
  const tool = findTool(toolId);
  const [Comp, setComp] = useState<ComponentType<ToolProps> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComp(null); setError(null);
    if (!tool?.load) return;
    let alive = true;
    tool.load().then(m => { if (alive) setComp(() => m.default); }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [toolId]);

  if (!tool) return <NotFound what={`Tool "${toolId}"`} />;

  if (tool.status === 'legacy') {
    const href = `${import.meta.env.BASE_URL}${tool.legacyHref}`;
    return (
      <section class="mx-auto max-w-xl p-6">
        <h1 class="text-2xl font-bold">{tool.icon} {tool.name}</h1>
        <p class="mt-2 text-slate-600 dark:text-slate-300">{tool.blurb}</p>
        <p class="mt-4 text-sm text-slate-500">This tool has not been ported to the new app yet. The original version is still available, and its calculations have been audited and corrected.</p>
        <a href={href} class="mt-4 inline-block rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-700">Open {tool.name}</a>
      </section>
    );
  }
  if (tool.status === 'planned') {
    return (
      <section class="mx-auto max-w-xl p-6">
        <h1 class="text-2xl font-bold">{tool.icon} {tool.name}</h1>
        <p class="mt-2 text-slate-600 dark:text-slate-300">{tool.blurb}</p>
        <p class="mt-4 text-sm text-slate-500">Planned. Tell us what you need from it:</p>
        <a href={`${REPO}/issues/new?template=tool-request.yml&title=${encodeURIComponent(tool.name)}`} class="mt-2 inline-block underline">Open a tool request</a>
      </section>
    );
  }
  if (error) return <div role="alert" class="m-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">Failed to load tool: {error}</div>;
  if (!Comp) return <div class="p-6 text-slate-500">Loading {tool.name}…</div>;
  return <Comp projectId={projectId} />;
}
