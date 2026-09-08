import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PRESET_PLASMIDS, calculateGC } from '@/core/plasmid';
import { legacyPlasmidToDocument } from '@/core/plasmid/legacy';
import { findDocumentOrfs, findDocumentRestrictionSites } from '@/core/plasmid/analysis';
import { validateDocument, type PlasmidDocument } from '@/core/plasmid/model';
import { getProject, saveProject } from '@/lib/projects';
import { downloadSvg } from '@/lib/export';
import { newId } from '@/lib/id';
import type { ToolProps } from '@/tools/registry';
import { SciencePanel } from '@/app/components/SciencePanel';
import { initialWorkspace, selectRange, undoWorkspace, redoWorkspace, type Selection } from './workspace';
import { ImportToolbar } from './ImportToolbar';
import { CircularMap } from './CircularMap';
import { LinearMap } from './LinearMap';
import { SequenceView } from './SequenceView';
import { AnnotationTable } from './AnnotationTable';
import { AnnotationInspector } from './AnnotationInspector';
import { AnalysisPanel } from './AnalysisPanel';
import { SCIENCE } from './science';

const TABS = ['Circular map', 'Linear map', 'Sequence', 'Annotations', 'Analysis'] as const;
type Tab = typeof TABS[number];

/** Accept the previous raw-document schema as well as the versioned workspace envelope. */
function restoreDocument(state: unknown): PlasmidDocument {
  try {
    if (!state || typeof state !== 'object') throw new Error();
    const envelope = state as { schemaVersion?: unknown; document?: unknown };
    if (envelope.schemaVersion !== undefined && envelope.schemaVersion !== 2) throw new Error();
    const document = (envelope.schemaVersion === 2 ? envelope.document : state) as PlasmidDocument;
    if (!document || !['circular', 'linear'].includes(document.topology)
      || !Array.isArray(document.annotations) || !Array.isArray(document.provenance?.warnings)
      || !['fasta', 'genbank', 'snapgene'].includes(document.provenance.format)
      || document.provenance.warnings.some(warning => typeof warning.code !== 'string' || typeof warning.message !== 'string')
      || !validateDocument(document).valid) throw new Error();
    return document;
  } catch { throw new Error('This saved project does not contain a supported, valid plasmid document.'); }
}

export default function PlasmidView({ projectId }: ToolProps) {
  const [workspace, setWorkspace] = useState(() => initialWorkspace(legacyPlasmidToDocument(PRESET_PLASMIDS[0]!)));
  const [tab, setTab] = useState<Tab>('Circular map');
  const [localProjectId, setLocalProjectId] = useState<string | undefined>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [minOrfAa, setMinOrfAa] = useState(50);
  const [maxOrfAa, setMaxOrfAa] = useState(0);
  const [restrictionFilter, setRestrictionFilter] = useState('unique');
  const [showOrfs, setShowOrfs] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const openGeneration = useRef(0);
  const document = workspace.document;

  useEffect(() => {
    setLocalProjectId(undefined);
    if (!projectId) return;
    let active = true;
    const generation = ++openGeneration.current;
    void getProject(projectId).then(project => {
      if (!active || generation !== openGeneration.current) return;
      if (!project || project.toolId !== 'plasmid') throw new Error('The requested plasmid project was not found.');
      setWorkspace(initialWorkspace(restoreDocument(project.state)));
      setLocalProjectId(project.id);
      setError('');
      setNotice(`Restored local project: ${project.name}.`);
    }).catch(cause => {
      if (active && generation === openGeneration.current) setError(cause instanceof Error ? cause.message : 'Could not restore this project.');
    });
    return () => { active = false; };
  }, [projectId]);

  // Selection never changes these dependencies or the displayed prediction set.
  const orfs = useMemo(() => findDocumentOrfs(document, { minLengthAa: minOrfAa, maxLengthAa: maxOrfAa }), [document, minOrfAa, maxOrfAa]);
  const sites = useMemo(() => findDocumentRestrictionSites(document), [document]);
  const filteredSites = useMemo(() => sites.filter(site => restrictionFilter === 'all'
    || (restrictionFilter === 'unique' && site.cutCount === 1)
    || (restrictionFilter === 'dual' && site.cutCount === 2)), [sites, restrictionFilter]);
  const onSelect = (selection: Selection) => setWorkspace(current => selectRange(current, selection));

  const openDocument = (next: PlasmidDocument) => {
    ++openGeneration.current;
    setWorkspace(initialWorkspace(next));
    setLocalProjectId(undefined);
    setError('');
    setNotice(`Loaded ${next.name} with ${next.annotations.length} preserved annotations.`);
  };
  const saveLocal = async () => {
    const generation = openGeneration.current;
    const id = localProjectId ?? newId();
    await saveProject({ id, toolId: 'plasmid', name: document.name, version: 2, state: { schemaVersion: 2, document } });
    if (generation !== openGeneration.current) return;
    setLocalProjectId(id);
    setNotice(`Saved ${document.name} locally. It is available from Recent projects.`);
  };
  const exportSvg = () => {
    const svg = mapRef.current?.querySelector('svg');
    if (!svg) throw new Error('Open a circular or linear map to export SVG.');
    downloadSvg(svg, `${document.name}_plasmid_map.svg`);
  };

  return <section class="mx-auto max-w-[92rem] space-y-4 p-3 sm:p-4">
    <header><h1 class="text-xl font-bold sm:text-2xl">⭕ Plasmid Viewer &amp; Map</h1><p class="text-sm text-slate-500">Inspect, annotate, and export a local sequence document.</p></header>
    <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:p-4">
      <ImportToolbar document={document} onOpen={openDocument} onSave={saveLocal} onUndo={() => setWorkspace(undoWorkspace)} onRedo={() => setWorkspace(redoWorkspace)}
        canUndo={workspace.history.past.length > 0} canRedo={workspace.history.future.length > 0}
        onExportSvg={exportSvg} canExportSvg={tab === 'Circular map' || tab === 'Linear map'} notice={notice} error={error} onError={setError} />
      <section aria-label="Analysis settings" class="flex flex-wrap items-end gap-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-950">
        <label>Minimum ORF size (aa)<input class="block w-28 rounded border border-slate-300 bg-transparent px-2 py-1" type="number" min="1" value={minOrfAa} onInput={event => setMinOrfAa(Math.max(1, Math.floor(Number(event.currentTarget.value) || 1)))} /></label>
        <label>Maximum ORF size (aa)<input class="block w-28 rounded border border-slate-300 bg-transparent px-2 py-1" type="number" min="0" value={maxOrfAa} onInput={event => setMaxOrfAa(Math.max(0, Math.floor(Number(event.currentTarget.value) || 0)))} /></label>
        <span class="text-xs text-slate-500">Maximum 0 means unlimited</span>
        <label>Restriction sites<select class="block rounded border border-slate-300 bg-transparent px-2 py-1" value={restrictionFilter} onChange={event => setRestrictionFilter(event.currentTarget.value)}><option value="unique">Unique cutters</option><option value="dual">Dual cutters</option><option value="all">All sites</option><option value="none">Hidden</option></select></label>
        <label class="flex items-center gap-2"><input type="checkbox" checked={showOrfs} onChange={event => setShowOrfs(event.currentTarget.checked)} />Show predicted ORFs on maps</label>
        <p data-testid="plasmid-orf-summary" class="font-mono text-sm">{orfs.length} ORFs · {calculateGC(document.sequence).toFixed(1)}% GC</p>
      </section>
      <div role="tablist" aria-label="Plasmid views" class="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {TABS.map(name => <button key={name} id={`plasmid-tab-${TABS.indexOf(name)}`} role="tab" aria-selected={tab === name} aria-controls="plasmid-panel" class={`rounded-lg px-3 py-2 text-sm focus-visible:outline-2 ${tab === name ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`} onClick={() => setTab(name)}>{name}</button>)}
      </div>
      <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div id="plasmid-panel" role="tabpanel" aria-labelledby={`plasmid-tab-${TABS.indexOf(tab)}`} class="min-w-0" ref={mapRef}>
          {tab === 'Circular map' && <CircularMap document={document} selection={workspace.selection} onSelect={onSelect} orfs={showOrfs ? orfs : []} restrictionSites={filteredSites} />}
          {tab === 'Linear map' && <LinearMap document={document} selection={workspace.selection} onSelect={onSelect} orfs={showOrfs ? orfs : []} restrictionSites={filteredSites} />}
          {tab === 'Sequence' && <SequenceView document={document} selection={workspace.selection} onSelect={onSelect} />}
          {tab === 'Annotations' && <AnnotationTable document={document} selection={workspace.selection} onSelect={onSelect} />}
          {tab === 'Analysis' && <AnalysisPanel workspace={workspace} onWorkspaceChange={setWorkspace} orfs={orfs} restrictionSites={filteredSites} />}
        </div>
        <div class="max-h-[40rem] overflow-y-auto"><AnnotationInspector workspace={workspace} onWorkspaceChange={setWorkspace} orfs={orfs} /></div>
      </div>
    </div>
    <SciencePanel science={SCIENCE} />
  </section>;
}
