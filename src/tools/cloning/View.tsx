import { useMemo, useState } from 'preact/hooks';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import type { ToolProps } from '@/tools/registry';
import { parseRoute } from '@/app/router';
import { useToolProject } from '@/lib/use-tool-project';
import { SCIENCE } from './science';
import { SourcesPanel } from './hub/SourcesPanel';
import { NebuilderPanel } from './hub/NebuilderPanel';
import { InfusionPanel } from './hub/InfusionPanel';
import { LigationPanel } from './hub/LigationPanel';
import { BaseChangerPanel } from './hub/BaseChangerPanel';
import { GoldenGatePanel } from './hub/GoldenGatePanel';
import { DEFAULT_STATE, METHODS, hubProjectSnapshot, restoreHubProject, type HubMethod, type HubState } from './hub/state';

/** Old links (#gibson, #mutagenesis) open the hub on the matching method. */
function initialMethod(): HubMethod {
  const route = typeof location !== 'undefined' ? parseRoute(location.hash) : undefined;
  const id = route?.name === 'tool' ? route.toolId : '';
  return id === 'mutagenesis' ? 'sdm' : id === 'gibson' ? 'nebuilder' : DEFAULT_STATE.method;
}

export default function CloningHubView({ projectId }: ToolProps) {
  const [state, setState] = useState<HubState>(() => ({ ...DEFAULT_STATE, method: initialMethod() }));
  const project = useToolProject('cloning', projectId, saved => setState(restoreHubProject(saved)));
  const patch = <K extends keyof HubState>(key: K, value: Partial<HubState[K]>) =>
    setState(current => ({ ...current, [key]: { ...(current[key] as object), ...(value as object) } }));

  const summary = useMemo(() => {
    const method = METHODS.find(item => item.id === state.method)!;
    const lines = [`Cloning hub: ${method.label}`, ...state.sources.map(source => `${source.role}: ${source.document.name} (${source.document.sequence.length} bp, ${source.document.topology})`)];
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  }, [state.method, state.sources]);

  return <section class="mx-auto max-w-[92rem] space-y-4 p-3 sm:p-4">
    <header>
      <h1 class="text-xl font-bold sm:text-2xl">🧬 Cloning hub</h1>
      <p class="text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
        Load your vector and inserts once, choose a method, and get primers, a bench protocol and the finished construct. Designs follow NEBuilder, In-Fusion, NEB ligation and NEBaseChanger and are checked against reference outputs from those tools.
      </p>
    </header>

    <SourcesPanel sources={state.sources} onChange={sources => setState(current => ({ ...current, sources }))} />

    <nav aria-label="Cloning method" class="flex flex-wrap gap-2">
      {METHODS.map(method => <button key={method.id} type="button" aria-pressed={state.method === method.id} title={method.blurb}
        class={`rounded-xl border px-3 py-2 text-sm font-semibold ${state.method === method.id ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800'}`}
        onClick={() => setState(current => ({ ...current, method: method.id }))}>{method.label}</button>)}
    </nav>
    <p class="text-xs text-slate-600 dark:text-slate-400">{METHODS.find(method => method.id === state.method)!.blurb}</p>

    {state.method === 'nebuilder' && <NebuilderPanel sources={state.sources} settings={state.nebuilder} onSettings={value => patch('nebuilder', value)} onReplaceSources={sources => setState(current => ({ ...current, sources }))} />}
    {state.method === 'infusion' && <InfusionPanel sources={state.sources} settings={state.infusion} onSettings={value => patch('infusion', value)} />}
    {state.method === 'ligation' && <LigationPanel sources={state.sources} settings={state.ligation} onSettings={value => patch('ligation', value)} />}
    {state.method === 'sdm' && <BaseChangerPanel sources={state.sources} settings={state.sdm} onSettings={value => patch('sdm', value)} />}
    {state.method === 'goldengate' && <GoldenGatePanel settings={state.goldengate} onSettings={value => patch('goldengate', value)} />}

    <ActionBar onCopy={() => summary} onSaveProject={() => project.save(hubProjectSnapshot(state))} projectStatus={project.status} />
    <SciencePanel science={SCIENCE} />
  </section>;
}
