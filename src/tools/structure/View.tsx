import { useEffect, useRef, useState } from 'preact/hooks';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import type { StructureModel } from '@/core/structure';
import { ColorLegend } from './components/ColorLegend';
import { DisplayToolbar } from './components/DisplayToolbar';
import { DropOverlay } from './components/DropOverlay';
import { EntityTable } from './components/EntityTable';
import { ExportMenu } from './components/ExportMenu';
import { FastaExport } from './components/FastaExport';
import { HeaderCard } from './components/HeaderCard';
import { InterfaceTable } from './components/InterfaceTable';
import { LigandList } from './components/LigandList';
import { LoadPanel } from './components/LoadPanel';
import { MetricsRow } from './components/MetricsRow';
import { SequencePanel } from './components/SequencePanel';
import { SidePanel, type SideTab } from './components/SidePanel';
import { MolstarViewer } from './MolstarViewer';
import { SCIENCE } from './science';
import { PRESETS, useStructureModel, type StructureViewModel } from './StructureModel';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** The whole tool is a drop target: an overlay while files are dragged over it, first file loads. */
function useFileDrop(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child crossed; count them so moving inside the tool keeps the
  // overlay, and leaving the tool (or the window) brings the count back to zero.
  const depth = useRef(0);
  const reset = () => { depth.current = 0; setDragging(false); };
  useEffect(() => {
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => { window.removeEventListener('dragend', reset); window.removeEventListener('drop', reset); };
  }, []);
  return {
    dragging,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDrop: (e: DragEvent) => {
        reset();
        if (!hasFiles(e)) return;  // e.g. text dropped into the PDB ID field keeps its default
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file) onFile(file);
      },
    },
  };
}

function summaryText(m: StructureViewModel): string {
  if (!m.source || !m.model) return 'No structure loaded';
  const h = m.model.header;
  return [
    `Structure: ${m.source.name}${h.title ? ` (${h.title})` : ''}`,
    h.method ? `Method: ${h.method}${h.resolution !== undefined ? `, ${h.resolution} Å` : ''}` : '',
    `Polymer chains (${m.model.chains.length}): ${m.model.chains.map(c => c.authAsymId).join(', ')}`,
    m.model.models.length > 1 ? `Model ${m.modelIndex + 1} of ${m.model.models.length}` : '',
    '',
    scienceText(SCIENCE),
  ].filter((line, i, all) => line !== '' || i === all.length - 2).join('\n');
}

/** Browser full screen for one element; `supported` is false where the API is missing. */
function useFullscreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  const supported = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';
  useEffect(() => {
    const sync = () => setOn(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void ref.current?.requestFullscreen().catch(() => undefined);
  };
  return { ref, on, supported, toggle };
}

/** The tab a structure opens on: its interfaces when it has several chains, else ligands, else facts. */
const firstTab = (m: StructureModel) => (m.chains.length > 1 ? 'interfaces' : m.ligands.length > 0 ? 'ligands' : 'info');

/** Name, title, method and resolution on one line above the viewer. */
function EntrySummary({ m }: { m: StructureViewModel }) {
  if (!m.source || !m.model) return null;
  const h = m.model.header;
  const method = [h.method, h.resolution !== undefined && Number.isFinite(h.resolution) ? `${Number(h.resolution.toFixed(2))} Å` : '']
    .filter(Boolean).join(', ');
  return (
    <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
      <span class="font-mono font-bold text-slate-900 dark:text-slate-100">{m.source.name}</span>
      {h.title && <span class="min-w-0 max-w-full truncate text-slate-700 dark:text-slate-300" title={h.title}>{h.title}</span>}
      {method && <span class="text-xs text-slate-500 dark:text-slate-400">{method}</span>}
      {m.plddt && (
        <span title={`Taken for a predicted model: ${m.plddt.reason}`}
          class="rounded-full border border-sky-300 bg-sky-50 px-2 py-px text-[11px] font-semibold text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
          Predicted model · pLDDT available
        </span>
      )}
    </div>
  );
}

export default function StructureView() {
  const m = useStructureModel();
  const { dragging, handlers } = useFileDrop(file => void m.loadFile(file));
  const full = useFullscreen();
  const currentId = m.source && m.source.origin !== 'file' ? m.source.rcsbId ?? '' : '';
  const busy = m.fetching ?? (m.parsing ? 'Parsing the structure…' : null);
  const label = m.source?.name ?? 'Structure';

  // The open tab belongs to one structure; a new one opens on its own first tab.
  const [tabPick, setTabPick] = useState<{ model: StructureModel; id: string } | null>(null);
  const tab = m.model ? (tabPick?.model === m.model ? tabPick.id : firstTab(m.model)) : 'info';
  const setTab = (id: string) => { if (m.model) setTabPick({ model: m.model, id }); };

  const chain = m.model?.chains.find(c => c.labelAsymId === m.chainId) ?? m.model?.chains[0];
  const tabs: SideTab[] = m.model && m.source && m.format ? [
    {
      id: 'interfaces',
      label: `Interfaces${m.interfaces ? ` (${m.interfaces.length})` : ''}`,
      content: <InterfaceTable interfaces={m.interfaces} computing={m.computing} error={m.interfaceError}
        cutoff={m.cutoff} setCutoff={m.setCutoff} onPair={m.showInterface} onResidue={m.showResidue} />,
    },
    {
      id: 'ligands',
      label: `Ligands (${new Set(m.model.ligands.map(l => l.compId)).size})`,
      content: <LigandList model={m.model} modelIndex={m.modelIndex} onShow={m.showResidues} />,
    },
    { id: 'chains', label: 'Chains', content: <EntityTable model={m.model} onChain={m.showChain} /> },
    {
      id: 'info',
      label: 'Info',
      content: (
        <div class="space-y-3">
          <HeaderCard source={m.source} model={m.model} />
          {m.plddt && <p class="text-xs text-slate-600 dark:text-slate-400">{`Predicted model (${m.plddt.reason}): the B-factor column is read as pLDDT${m.plddt.scale === 100 ? ' on a 0–1 scale' : ''}. Pick “pLDDT” under Colour.`}</p>}
          {m.metrics && <MetricsRow metrics={m.metrics} />}
        </div>
      ),
    },
    {
      id: 'export',
      label: 'Export',
      content: (
        <div class="space-y-3">
          <ExportMenu model={m.model} source={m.source} format={m.format} modelIndex={m.modelIndex}
            canSnapshot={!!m.viewer} onSnapshot={() => void m.snapshot()} />
          {chain && <FastaExport model={m.model} chain={chain} selection={m.selection} />}
        </div>
      ),
    },
  ] : [];

  return (
    <div data-testid="structure-tool" class="relative" {...handlers}>
      <DropOverlay visible={dragging} />
      <ToolLayout
        icon="🧊"
        title="3D Structure Viewer"
        blurb="Fetch an RCSB entry or drop an mmCIF or PDB file. Parsing and the Mol* 3D view run on this device."
        wide={true}
        fullWidthResults={true}
        inputs={null}
        results={
          <div class="space-y-2">
            <LoadPanel presets={PRESETS} currentId={currentId} busy={busy} error={m.error} onRcsb={id => void m.loadRcsb(id)} onFile={file => void m.loadFile(file)} />
            <EntrySummary m={m} />
            <div ref={full.ref}
              class={`grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] ${full.on
                ? 'h-screen bg-white p-3 dark:bg-slate-900 lg:grid-rows-1'
                : 'lg:h-[max(32rem,calc(100dvh-15rem))]'}`}>
              <div class="flex min-h-0 min-w-0 flex-col gap-2">
                <DisplayToolbar
                  representation={m.representation} onRepresentation={m.setRepresentation}
                  coloring={m.coloring} onColoring={m.setColoring} plddt={!!m.plddt}
                  hydrogens={m.hydrogens} onHydrogens={m.setHydrogens} hasHydrogens={m.hasHydrogens}
                  panels={m.panels} onPanels={m.setPanels}
                  fullscreen={full.supported ? full.on : null} onFullscreen={full.toggle}
                  modelCount={m.model?.models.length ?? 0} modelIndex={m.modelIndex} onModelIndex={m.setModelIndex}
                  canSnapshot={!!m.viewer && !!m.source} onSnapshot={() => void m.snapshot()}
                />
                <div class={`relative min-h-72 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 lg:min-h-0 lg:flex-1 ${full.on ? 'flex-1' : 'h-[60vh] lg:h-auto'}`}>
                  <MolstarViewer
                    label={label}
                    showControls={m.panels}
                    onReady={m.setViewer}
                    onResidueClick={m.selectFromViewer}
                    onResidueHover={m.setHovered}
                  />
                  <ColorLegend coloring={m.coloring} bStats={m.bStats} plddt={m.plddt} />
                </div>
                {m.model && (
                  <SequencePanel model={m.model} chainId={m.chainId} setChainId={m.setChainId}
                    selection={m.selection} setSelection={m.setSelection} hovered={m.hovered} marked={m.marked}
                    onShow={m.showResidues} onHover={refs => m.viewer?.highlight(refs)} onClear={m.clearSelection} />
                )}
              </div>
              {tabs.length > 0 && <SidePanel tabs={tabs} active={tab} onActive={setTab} />}
            </div>
          </div>
        }
        actions={<ActionBar onCopy={() => summaryText(m)} shareUrl={m.shareUrl} />}
        science={<SciencePanel science={SCIENCE} />}
      />
    </div>
  );
}
