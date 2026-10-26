import { useEffect, useRef, useState } from 'preact/hooks';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import { DisplayToolbar } from './components/DisplayToolbar';
import { DropOverlay } from './components/DropOverlay';
import { EntityTable } from './components/EntityTable';
import { HeaderCard } from './components/HeaderCard';
import { LoadPanel } from './components/LoadPanel';
import { SequencePanel } from './components/SequencePanel';
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

export default function StructureView() {
  const m = useStructureModel();
  const { dragging, handlers } = useFileDrop(file => void m.loadFile(file));
  const currentId = m.source && m.source.origin !== 'file' ? m.source.rcsbId ?? '' : '';
  const busy = m.fetching ?? (m.parsing ? 'Parsing the structure…' : null);
  const label = m.source?.name ?? 'Structure';

  return (
    <div data-testid="structure-tool" class="relative" {...handlers}>
      <DropOverlay visible={dragging} />
      <ToolLayout
        icon="🧊"
        title="3D Structure Viewer"
        blurb="Fetch an RCSB entry or drop an mmCIF or PDB file. Parsing and the Mol* 3D view run on this device."
        wide={true}
        mobileResultSummary={m.source && m.model
          ? <span><strong class="font-mono">{m.source.name}</strong> · {m.model.chains.length} polymer chains</span>
          : <span>{busy ?? 'No structure loaded'}</span>}
        inputs={
          <div class="space-y-4">
            <LoadPanel presets={PRESETS} currentId={currentId} busy={busy} error={m.error} onRcsb={id => void m.loadRcsb(id)} onFile={file => void m.loadFile(file)} />
            {m.source && m.model && <HeaderCard source={m.source} model={m.model} />}
          </div>
        }
        results={
          <div class="space-y-3">
            <DisplayToolbar
              representation={m.representation} onRepresentation={m.setRepresentation}
              coloring={m.coloring} onColoring={m.setColoring}
              panels={m.panels} onPanels={m.setPanels}
              large={m.largeCanvas} onLarge={m.setLargeCanvas}
              modelCount={m.model?.models.length ?? 0} modelIndex={m.modelIndex} onModelIndex={m.setModelIndex}
              canSnapshot={!!m.viewer && !!m.source} onSnapshot={() => void m.snapshot()}
            />
            <div class="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <MolstarViewer
                label={label}
                height={m.largeCanvas ? 800 : 560}
                showControls={m.panels}
                onReady={m.setViewer}
                onResidueClick={m.selectFromViewer}
                onResidueHover={m.setHovered}
              />
            </div>
            {m.model && (
              <SequencePanel model={m.model} selection={m.selection} setSelection={m.setSelection} hovered={m.hovered} viewer={m.viewer} />
            )}
            {m.model && <EntityTable model={m.model} />}
            {/* Task 9: LigandList, InterfaceTable (m.interfaces, m.cutoff) and metrics (m.metrics), then export. */}
          </div>
        }
        actions={<ActionBar onCopy={() => summaryText(m)} shareUrl={m.shareUrl} />}
        science={<SciencePanel science={SCIENCE} />}
      />
    </div>
  );
}
