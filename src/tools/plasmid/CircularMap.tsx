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

function point(center: number, radius: number, angle: number) {
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

function angleFor(position: number, length: number) {
  return ((position / Math.max(1, length)) * Math.PI * 2) - Math.PI / 2;
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

function arcPath(start: number, end: number, length: number, inner: number, outer: number, strand: 1 | -1 | 0) {
  const startAngle = angleFor(start, length);
  const endAngle = angleFor(end, length);
  const span = Math.max(1, end - start);
  const large = span / Math.max(1, length) > 0.5 ? 1 : 0;
  const middle = (inner + outer) / 2;
  const arrow = Math.min((span / Math.max(1, length)) * Math.PI * 0.5, 0.10);
  const forwardEnd = endAngle - arrow;
  const reverseStart = startAngle + arrow;

  if (strand === -1) {
    const tip = point(350, middle, startAngle);
    const a = point(350, inner, reverseStart);
    const b = point(350, inner, endAngle);
    const c = point(350, outer, endAngle);
    const d = point(350, outer, reverseStart);
    return `M ${tip.x} ${tip.y} L ${a.x} ${a.y} A ${inner} ${inner} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${outer} ${outer} 0 ${large} 0 ${d.x} ${d.y} Z`;
  }

  const a = point(350, inner, startAngle);
  const b = point(350, inner, forwardEnd);
  const tip = point(350, middle, endAngle);
  const c = point(350, outer, forwardEnd);
  const d = point(350, outer, startAngle);
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
        <svg viewBox="0 0 700 700" class="mx-auto block w-full max-w-[620px] select-none" role="img" aria-label={`Circular map of ${document.name}`}>
          <circle cx="350" cy="350" r="166" fill="#fff" stroke="#cbd5e1" stroke-width="2" />
          <circle cx="350" cy="350" r="150" fill="none" stroke="#e2e8f0" stroke-width="12" />

          {document.annotations.flatMap(annotation => annotationSegments(annotation).map((segment, index) => {
            const lane = lanes.get(annotation.id) ?? 0;
            const inner = 172 + lane * 18;
            const selected = selection?.annotationId === annotation.id;
            const range = displayRange(segment.start, segment.end, document.topology);
            const label = `${annotation.name}, ${range} bp, ${annotation.location.strand === -1 ? 'reverse' : 'forward'} strand`;
            return (
              <g key={`${annotation.id}-${index}`} role="button" tabIndex={0} aria-label={label} onClick={() => selectAnnotation(annotation)} onKeyDown={event => activate(event, () => selectAnnotation(annotation))} class="cursor-pointer outline-none">
                <path d={arcPath(segment.start, segment.end, length, inner, inner + 13, annotation.location.strand)} fill={annotationColor(annotation)} stroke={selected ? AMBER : '#fff'} stroke-width={selected ? 3 : 1}>
                  <title>{label}</title>
                </path>
              </g>
            );
          }))}

          {showOrfs && orfs.flatMap(orf => annotationSegments({ location: orf.location } as Annotation).map((segment, index) => (
            <path key={`${orf.id}-${index}`} d={arcPath(segment.start, segment.end, length, orf.strand === 1 ? 232 : 126, orf.strand === 1 ? 239 : 133, orf.strand)} fill={TEAL} opacity="0.72">
              <title>Predicted ORF {orf.frame > 0 ? `+${orf.frame}` : orf.frame}, {displayRange(segment.start, segment.end, document.topology)} bp</title>
            </path>
          )))}

          {showRestrictions && restrictionSites.map(site => {
            const angle = angleFor(site.cutPosition, length);
            const inner = point(350, 242, angle);
            const outer = point(350, 270, angle);
            return <g key={site.id} role="button" tabIndex={0} aria-label={`${site.enzyme}, cut at ${displayPosition(site.cutPosition)} bp`} onClick={() => onSelect({ start: site.start, end: site.end, source: 'analysis' })} onKeyDown={event => activate(event, () => onSelect({ start: site.start, end: site.end, source: 'analysis' }))} class="cursor-pointer outline-none"><line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={SLATE} stroke-width="2" /><title>{site.enzyme} cut at {displayPosition(site.cutPosition)} bp</title></g>;
          })}

          <text x="350" y="332" text-anchor="middle" font-size="18" font-weight="700" fill={INK}>{document.name}</text>
          <text x="350" y="355" text-anchor="middle" font-size="12" font-family="monospace" fill={SLATE}>{length.toLocaleString()} bp</text>
          <text x="350" y="377" text-anchor="middle" font-size="11" fill={SLATE}>{document.topology}</text>
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
