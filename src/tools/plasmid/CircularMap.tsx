import { useState } from 'preact/hooks';
import type { Annotation, PlasmidDocument } from '@/core/plasmid/model';
import type { DocumentOrf, DocumentRestrictionSite } from '@/core/plasmid/analysis';
import { annotationSegments, assignAnnotationLanes } from './map-layout';
import type { Selection } from './selection';

export interface CircularMapProps {
  document: PlasmidDocument;
  selection?: Selection;
  onSelect: (selection: Selection) => void;
  orfs?: DocumentOrf[];
  restrictionSites?: DocumentRestrictionSite[];
}

const INK = '#172554';
const COBALT = '#2563eb';
const TEAL = '#0f766e';
const AMBER = '#d97706';
const SLATE = '#64748b';
const TAU = Math.PI * 2;
const INTERACTIVE_CLASS = 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d97706] focus-visible:[&>path]:stroke-[#d97706] focus-visible:[&>path]:stroke-[3] focus-visible:[&>line]:stroke-[#d97706] focus-visible:[&>line]:stroke-[3]';

function point(center: number, radius: number, angle: number) {
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

function angleFor(position: number, length: number) {
  return ((position / Math.max(1, length)) * TAU) - Math.PI / 2;
}

function displayPosition(position: number) {
  return (position + 1).toLocaleString();
}

function displayRange(start: number, end: number, topology: PlasmidDocument['topology']) {
  // Canonical intervals are zero-based and half-open: [0, 861) is shown as 1–861.
  const range = `${displayPosition(start)}–${end.toLocaleString()}`;
  return topology === 'circular' && start > end ? `${range} (wraps origin)` : range;
}

function activate(event: KeyboardEvent, callback: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    callback();
  }
}

function strandLabel(strand: Annotation['location']['strand']) {
  if (strand === -1) return 'reverse';
  if (strand === 0) return 'unstranded';
  return 'forward';
}

function arcPath(center: number, start: number, end: number, length: number, inner: number, outer: number, strand: 1 | -1 | 0) {
  const startAngle = angleFor(start, length);
  const endAngle = angleFor(end, length);
  const spanRadians = Math.max(TAU / Math.max(1, length), ((end - start) / Math.max(1, length)) * TAU);
  const middle = (inner + outer) / 2;
  const arrow = strand === 0 ? 0 : Math.min(spanRadians / 4, 0.10);
  // Arc flags must describe the visible body after the arrowhead is removed.
  const large = spanRadians - arrow > Math.PI ? 1 : 0;
  const forwardEnd = endAngle - arrow;
  const reverseStart = startAngle + arrow;

  if (strand === 0) {
    const a = point(center, inner, startAngle);
    const b = point(center, inner, endAngle);
    const c = point(center, outer, endAngle);
    const d = point(center, outer, startAngle);
    return `M ${a.x} ${a.y} A ${inner} ${inner} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${outer} ${outer} 0 ${large} 0 ${d.x} ${d.y} Z`;
  }

  if (strand === -1) {
    const tip = point(center, middle, startAngle);
    const a = point(center, inner, reverseStart);
    const b = point(center, inner, endAngle);
    const c = point(center, outer, endAngle);
    const d = point(center, outer, reverseStart);
    return `M ${tip.x} ${tip.y} L ${a.x} ${a.y} A ${inner} ${inner} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${outer} ${outer} 0 ${large} 0 ${d.x} ${d.y} Z`;
  }

  const a = point(center, inner, startAngle);
  const b = point(center, inner, forwardEnd);
  const tip = point(center, middle, endAngle);
  const c = point(center, outer, forwardEnd);
  const d = point(center, outer, startAngle);
  return `M ${a.x} ${a.y} A ${inner} ${inner} 0 ${large} 1 ${b.x} ${b.y} L ${tip.x} ${tip.y} L ${c.x} ${c.y} A ${outer} ${outer} 0 ${large} 0 ${d.x} ${d.y} Z`;
}

function annotationColor(annotation: Annotation) {
  return annotation.color || (annotation.type.toLowerCase().includes('cds') ? COBALT : TEAL);
}

function selectionLabel(document: PlasmidDocument, selection?: Selection) {
  if (!selection) return { name: 'No selection', range: 'Choose an annotation, ORF, or restriction site.' };
  const annotation = document.annotations.find(item => item.id === selection.annotationId);
  return {
    name: annotation?.name || 'Map selection',
    range: `${displayRange(selection.start, selection.end, document.topology)} bp`,
  };
}

/** Canonical-document circular plasmid renderer with a stable selection rail. */
export function CircularMap({ document, selection, onSelect, orfs = [], restrictionSites = [] }: CircularMapProps) {
  const [showOrfs, setShowOrfs] = useState(true);
  const [showRestrictions, setShowRestrictions] = useState(true);
  const length = document.sequence.length;
  const lanes = assignAnnotationLanes(document.annotations, length, document.topology);
  const laneCount = Math.max(1, ...Array.from(lanes.values()).map(lane => lane + 1));
  const annotationOuter = 185 + (laneCount - 1) * 18;
  // Reserve separate radial bands for derived layers even when a layer is hidden.
  const orfInner = annotationOuter + 20;
  const orfOuter = orfInner + 7;
  const restrictionInner = orfOuter + 18;
  const restrictionOuter = restrictionInner + 25;
  const mapRadius = restrictionOuter + 30;
  const center = mapRadius + 20;
  const mapSize = center * 2;
  const status = selectionLabel(document, selection);
  const selectAnnotation = (annotation: Annotation) => {
    const segments = annotationSegments(annotation);
    onSelect({
      start: segments[0]!.start,
      end: segments[segments.length - 1]!.end,
      source: 'map',
      annotationId: annotation.id,
    });
  };

  return (
    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]" aria-label="Circular plasmid map workspace">
      <div class="min-w-0 rounded-xl border border-slate-200 bg-[#f8fafc] p-3 dark:border-slate-700 dark:bg-slate-950">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span class="font-semibold text-[#172554] dark:text-slate-100">Circular annotation map</span>
          <div class="flex gap-3">
            <label class="flex items-center gap-1.5"><input type="checkbox" checked={showRestrictions} onChange={() => setShowRestrictions(value => !value)} /> Restriction sites</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" checked={showOrfs} onChange={() => setShowOrfs(value => !value)} /> Predicted ORFs</label>
          </div>
        </div>
        <svg viewBox={`0 0 ${mapSize} ${mapSize}`} class="mx-auto block w-full max-w-[620px] select-none" role="img" aria-label={`Circular map of ${document.name}`}>
          <circle cx={center} cy={center} r="166" fill="#fff" stroke="#cbd5e1" stroke-width="2" />
          <circle cx={center} cy={center} r="150" fill="none" stroke="#e2e8f0" stroke-width="12" />

          {document.annotations.flatMap(annotation => annotationSegments(annotation).map((segment, index) => {
            const lane = lanes.get(annotation.id) ?? 0;
            const inner = 172 + lane * 18;
            const selected = selection?.annotationId === annotation.id;
            const range = displayRange(segment.start, segment.end, document.topology);
            const label = `${annotation.name}, ${range} bp, ${strandLabel(annotation.location.strand)} strand`;
            return (
              <g key={`${annotation.id}-${index}`} role="button" tabIndex={0} aria-label={label} onClick={() => selectAnnotation(annotation)} onKeyDown={event => activate(event, () => selectAnnotation(annotation))} class={INTERACTIVE_CLASS}>
                <path d={arcPath(center, segment.start, segment.end, length, inner, inner + 13, annotation.location.strand)} fill={annotationColor(annotation)} stroke={selected ? AMBER : '#fff'} stroke-width={selected ? 3 : 1}>
                  <title>{label}</title>
                </path>
              </g>
            );
          }))}

          {showOrfs && orfs.flatMap(orf => orf.location.segments.map((segment, index) => {
            const range = displayRange(segment.start, segment.end, document.topology);
            const label = `Predicted ORF ${orf.frame > 0 ? `+${orf.frame}` : orf.frame}, ${range} bp, ${strandLabel(orf.strand)} strand`;
            const selectOrf = () => onSelect({ start: orf.location.segments[0]!.start, end: orf.location.segments[orf.location.segments.length - 1]!.end, source: 'analysis', annotationId: orf.id });
            return <g key={`${orf.id}-${index}`} role="button" tabIndex={0} aria-label={label} onClick={selectOrf} onKeyDown={event => activate(event, selectOrf)} class={INTERACTIVE_CLASS}><path d={arcPath(center, segment.start, segment.end, length, orfInner, orfOuter, orf.strand)} fill={TEAL} opacity="0.72"><title>{label}</title></path></g>;
          }))}

          {showRestrictions && restrictionSites.map(site => {
            const angle = angleFor(site.cutPosition, length);
            const inner = point(center, restrictionInner, angle);
            const outer = point(center, restrictionOuter, angle);
            return <g key={site.id} role="button" tabIndex={0} aria-label={`${site.enzyme}, cut at ${displayPosition(site.cutPosition)} bp`} onClick={() => onSelect({ start: site.start, end: site.end, source: 'analysis' })} onKeyDown={event => activate(event, () => onSelect({ start: site.start, end: site.end, source: 'analysis' }))} class={INTERACTIVE_CLASS}><line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={SLATE} stroke-width="2" /><title>{site.enzyme} cut at {displayPosition(site.cutPosition)} bp</title></g>;
          })}

          <text x={center} y={center - 18} text-anchor="middle" font-size="18" font-weight="700" fill={INK}>{document.name}</text>
          <text x={center} y={center + 5} text-anchor="middle" font-size="12" font-family="monospace" fill={SLATE}>{length.toLocaleString()} bp</text>
          <text x={center} y={center + 27} text-anchor="middle" font-size="11" fill={SLATE}>{document.topology}</text>
        </svg>
      </div>

      <aside data-testid="plasmid-selection" aria-live="polite" class="min-h-24 rounded-xl border border-[#cbd5e1] bg-white p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:w-60">
        <p class="mb-2 text-xs font-semibold text-[#64748b]">Selection</p>
        <p class="font-semibold text-[#172554] dark:text-slate-100">{status.name}</p>
        <p class="mt-1 font-mono text-xs text-[#64748b]">{status.range}</p>
      </aside>
    </section>
  );
}
