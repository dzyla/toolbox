import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { findTool, type ToolProps } from '@/tools/registry';
import { navigate } from '@/app/router';
import { ToolErrorBoundary } from '@/app/components/ToolErrorBoundary';
import { NotFound } from './NotFound';
import { REPO } from '../components/Footer';

export function ToolPage({ toolId, projectId }: { toolId: string; projectId?: string }) {
  const tool = findTool(toolId);
  const [Comp, setComp] = useState<ComponentType<ToolProps> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setComp(null); setError(null);
    if (!tool?.load) return;
    let alive = true;
    tool.load()
      .then(m => { if (alive) setComp(() => m.default); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [toolId, attempt]);

  if (!tool) return <NotFound what={`Tool "${toolId}"`} />;

  if (tool.status === 'porting') {
    return (
      <section class="mx-auto max-w-xl p-6">
        <h1 class="text-2xl font-bold">{tool.icon} {tool.name}</h1>
        <p class="mt-2 text-slate-600 dark:text-slate-300">{tool.blurb}</p>
        <p class="mt-4 text-sm text-slate-500 dark:text-slate-400">Being rebuilt for this app. Check back soon.</p>
      </section>
    );
  }
  if (tool.status === 'planned') {
    return (
      <section class="mx-auto max-w-xl p-6">
        <h1 class="text-2xl font-bold">{tool.icon} {tool.name}</h1>
        <p class="mt-2 text-slate-600 dark:text-slate-300">{tool.blurb}</p>
        <p class="mt-4 text-sm text-slate-500 dark:text-slate-400">Planned. Tell us what you need from it:</p>
        <a href={`${REPO}/issues/new?template=tool-request.yml&title=${encodeURIComponent(tool.name)}`} class="mt-2 inline-block underline">Open a tool request</a>
      </section>
    );
  }
  if (error) {
    // Most failures are a stale page asking for code chunks that a newer deploy replaced, or a dropped connection.
    return (
      <div role="alert" class="m-6 space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
        <p class="font-semibold">{tool.name} could not be loaded.</p>
        <p class="text-sm">Check your connection, or reload if Bio-Bench was just updated.</p>
        <p class="text-xs opacity-80">Details: {error}</p>
        <div class="flex gap-2">
          <button type="button" class="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold dark:border-red-700" onClick={() => setAttempt(a => a + 1)}>Try again</button>
          <button type="button" class="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => location.reload()}>Reload app</button>
        </div>
      </div>
    );
  }
  if (!Comp) return <div class="p-6 text-slate-500 dark:text-slate-400">Loading {tool.name}…</div>;
  return (
    <ToolErrorBoundary resetKey={toolId} onReturnToTools={() => navigate({ name: 'home' })}>
      <Comp projectId={projectId} />
    </ToolErrorBoundary>
  );
}
