import { useState } from 'preact/hooks';
import type { Annotation, PlasmidDocument } from '@/core/plasmid/model';
import type { DocumentOrf, DocumentRestrictionSite } from '@/core/plasmid/analysis';
import { annotationSegments, assignAnnotationLanes } from './map-layout';
import type { Selection } from './selection';

export interface LinearMapProps {
  document: PlasmidDocument;
  selection?: Selection;
  onSelect: (selection: Selection) => void;
  orfs?: DocumentOrf[];
  restrictionSites?: DocumentRestrictionSite[];
}

const COBALT = '#2563eb';
const TEAL = '#0f766e';
const AMBER = '#d97706';
const SLATE = '#64748b';
const LEFT = 56;
const WIDTH = 808;
const INTERACTIVE_CLASS = 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d97706] focus-visible:[&>path]:stroke-[#d97706] focus-visible:[&>path]:stroke-[3] focus-visible:[&>line]:stroke-[#d97706] focus-visible:[&>line]:stroke-[3]';

function displayPosition(position: number) {
  return (position + 1).toLocaleString();
}

function xFor(position: number, length: number) {
  return LEFT + (position / Math.max(1, length)) * WIDTH;
}

function chevron(x: number, y: number, width: number, height: number, strand: 1 | -1 | 0) {
  if (strand === 0) return `M ${x} ${y} h ${width} v ${height} h ${-width} Z`;
  const head = Math.min(12, Math.max(4, width * 0.35));
  if (width <= head + 2) return `M ${x} ${y} h ${width} v ${height} h ${-width} Z`;
  return strand === -1
    ? `M ${x + width} ${y} L ${x + head} ${y} L ${x} ${y + height / 2} L ${x + head} ${y + height} L ${x + width} ${y + height} Z`
    : `M ${x} ${y} L ${x + width - head} ${y} L ${x + width} ${y + height / 2} L ${x + width - head} ${y + height} L ${x} ${y + height} Z`;
}

function strandLabel(strand: Annotation['location']['strand']) {
  if (strand === -1) return 'reverse';
  if (strand === 0) return 'unstranded';
  return 'forward';
}

function color(annotation: Annotation) {
  return annotation.color || (annotation.type.toLowerCase().includes('cds') ? COBALT : TEAL);
}

function selectionLabel(document: PlasmidDocument, selection?: Selection) {
  if (!selection) return { name: 'No selection', range: 'Choose an annotation, ORF, or restriction site.' };
  const annotation = document.annotations.find(item => item.id === selection.annotationId);
  const wrapped = document.topology === 'circular' && selection.start > selection.end ? ' (wraps origin)' : '';
  return { name: annotation?.name || 'Map selection', range: `${displayPosition(selection.start)}–${selection.end.toLocaleString()} bp${wrapped}` };
}

function activate(event: KeyboardEvent, callback: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    callback();
  }
}

/** Canonical-document linear renderer that preserves compound annotation segments. */
export function LinearMap({ document, selection, onSelect, orfs = [], restrictionSites = [] }: LinearMapProps) {
  const [showOrfs, setShowOrfs] = useState(true);
  const [showRestrictions, setShowRestrictions] = useState(true);
  const length = document.sequence.length;
  const lanes = assignAnnotationLanes(document.annotations, length, document.topology);
  const status = selectionLabel(document, selection);
  const selectAnnotation = (annotation: Annotation) => {
    const segments = annotationSegments(annotation);
    onSelect({ start: segments[0]!.start, end: segments[segments.length - 1]!.end, source: 'map', annotationId: annotation.id });
  };
  const laneCount = Math.max(1, ...Array.from(lanes.values()).map(lane => lane + 1));
  const featureTop = 62;
  const height = Math.max(230, featureTop + laneCount * 28 + 88);

  return (
    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]" aria-label="Linear plasmid map workspace">
      <div class="min-w-0 rounded-xl border border-slate-200 bg-[#f8fafc] p-3 dark:border-slate-700 dark:bg-slate-950">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span class="font-semibold text-[#172554] dark:text-slate-100">Linear annotation map</span>
          <div class="flex gap-3">
            <label class="flex items-center gap-1.5"><input type="checkbox" checked={showRestrictions} onChange={() => setShowRestrictions(value => !value)} /> Restriction sites</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" checked={showOrfs} onChange={() => setShowOrfs(value => !value)} /> Predicted ORFs</label>
          </div>
        </div>
        <div class="overflow-x-auto">
          <svg viewBox={`0 0 920 ${height}`} class="min-w-[680px] w-full select-none" role="img" aria-label={`Linear map of ${document.name}`}>
            <line x1={LEFT} x2={LEFT + WIDTH} y1="46" y2="46" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" />
            <text x={LEFT} y="31" font-size="11" font-family="monospace" fill={SLATE}>1</text>
            <text x={LEFT + WIDTH} y="31" text-anchor="end" font-size="11" font-family="monospace" fill={SLATE}>{length.toLocaleString()} bp</text>

            {document.annotations.flatMap(annotation => annotationSegments(annotation).map((segment, index) => {
              const lane = lanes.get(annotation.id) ?? 0;
              const y = featureTop + lane * 28;
              const start = xFor(segment.start, length);
              const end = xFor(segment.end, length);
              const width = Math.max(3, end - start);
              // Canonical intervals are zero-based and half-open: [0, 861) is shown as 1–861.
              const range = `${displayPosition(segment.start)}–${segment.end.toLocaleString()}`;
              const label = `${annotation.name}, ${range} bp, ${strandLabel(annotation.location.strand)} strand`;
              const selected = selection?.annotationId === annotation.id;
              return <g key={`${annotation.id}-${index}`} role="button" tabIndex={0} aria-label={label} onClick={() => selectAnnotation(annotation)} onKeyDown={event => activate(event, () => selectAnnotation(annotation))} class={INTERACTIVE_CLASS}><path d={chevron(start, y, width, 18, annotation.location.strand)} fill={color(annotation)} stroke={selected ? AMBER : '#fff'} stroke-width={selected ? 3 : 1}><title>{label}</title></path>{width > 60 && <text x={start + width / 2} y={y + 12} text-anchor="middle" font-size="10" font-weight="700" fill="#fff">{annotation.name}</text>}</g>;
            }))}

            {showOrfs && orfs.flatMap(orf => orf.location.segments.map((segment, index) => {
              const range = `${displayPosition(segment.start)}–${segment.end.toLocaleString()}`;
              const label = `Predicted ORF ${orf.frame > 0 ? `+${orf.frame}` : orf.frame}, ${range} bp, ${strandLabel(orf.strand)} strand`;
              const selectOrf = () => onSelect({ start: orf.location.segments[0]!.start, end: orf.location.segments[orf.location.segments.length - 1]!.end, source: 'analysis', annotationId: orf.id });
              return <g key={`${orf.id}-${index}`} role="button" tabIndex={0} aria-label={label} onClick={selectOrf} onKeyDown={event => activate(event, selectOrf)} class={INTERACTIVE_CLASS}><path d={chevron(xFor(segment.start, length), featureTop + laneCount * 28 + (orf.strand === 1 ? 10 : 28), Math.max(3, xFor(segment.end, length) - xFor(segment.start, length)), 10, orf.strand)} fill={TEAL} opacity="0.72"><title>{label}</title></path></g>;
            }))}
            {showRestrictions && restrictionSites.map(site => { const x = xFor(site.cutPosition, length); return <g key={site.id} role="button" tabIndex={0} aria-label={`${site.enzyme}, cut at ${displayPosition(site.cutPosition)} bp`} onClick={() => onSelect({ start: site.start, end: site.end, source: 'analysis' })} onKeyDown={event => activate(event, () => onSelect({ start: site.start, end: site.end, source: 'analysis' }))} class={INTERACTIVE_CLASS}><line x1={x} x2={x} y1="38" y2={height - 18} stroke={SLATE} stroke-width="1" stroke-dasharray="3 3" /><title>{site.enzyme} cut at {displayPosition(site.cutPosition)} bp</title></g>; })}
          </svg>
        </div>
      </div>
      <aside data-testid="plasmid-selection" aria-live="polite" class="min-h-24 rounded-xl border border-[#cbd5e1] bg-white p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:w-60">
        <p class="mb-2 text-xs font-semibold text-[#64748b]">Selection</p>
        <p class="font-semibold text-[#172554] dark:text-slate-100">{status.name}</p>
        <p class="mt-1 font-mono text-xs text-[#64748b]">{status.range}</p>
      </aside>
    </section>
  );
}
