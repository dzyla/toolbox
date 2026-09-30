import { useState } from 'preact/hooks';
import type { ProductMark } from '@/core/cloning/products';
import type { SourceSegment } from '@/core/cloning/segments';
import { readableOn, sourceColor } from '@/core/cloning/source-colors';
import { nextInstanceId } from './ConstructDiagram';
import type { Selection } from '@/tools/plasmid/selection';

const WIDTH = 1000;
const HEIGHT = 40;

interface Props {
  length: number;
  segments: SourceSegment[];
  marks: ProductMark[];
  selection?: Selection;
  onSelect: (selection: Selection) => void;
}

const range = (segment: { start: number; end: number }) => `${(segment.start + 1).toLocaleString()}–${segment.end.toLocaleString()}`;

/** A proportional bar of the product, one coloured block per source, with a numbered legend underneath. */
export function SourceStrip({ length, segments, marks, selection, onSelect }: Props) {
  const [hatch] = useState(() => `${nextInstanceId('hatch')}-overlap`);
  if (!length || !segments.length) return null;
  const x = (position: number) => (position / length) * WIDTH;
  const sources = segments.filter(segment => segment.sourceIndex >= 0);
  const summary = `Where the ${length.toLocaleString()} bp construct comes from: ${segments.map(segment => `${segment.sourceIndex >= 0 ? `${segment.sourceIndex + 1} · ` : ''}${segment.name} ${range(segment)}`).join('; ')}`;
  const pressed = (segment: SourceSegment) => selection?.start === segment.start && selection?.end === segment.end && !selection.annotationId;
  return <div class="space-y-2">
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary} class="h-10 w-full">
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#ffffff" fill-opacity="0.35" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#111827" stroke-width="2" />
        </pattern>
      </defs>
      {segments.map(segment => {
        const color = sourceColor(segment.sourceIndex);
        const width = x(segment.end) - x(segment.start);
        return <g key={`${segment.sourceIndex}-${segment.start}`} data-kind={segment.sourceIndex >= 0 ? 'source' : 'spacer'}>
          <rect x={x(segment.start)} y={4} width={Math.max(width, 1)} height={32} fill={color} stroke="#111827" stroke-opacity="0.4" />
          {segment.sourceIndex >= 0 && width > 34 && <text x={x(segment.start) + width / 2} y={24} text-anchor="middle" font-size="14" font-weight="600" fill={readableOn(color)}>{segment.sourceIndex + 1}</text>}
        </g>;
      })}
      {marks.filter(mark => mark.kind === 'junction').map(mark => <rect key={`${mark.label}-${mark.start}`} data-kind="overlap" x={x(mark.start)} y={2} width={Math.max(x(mark.end) - x(mark.start), 2)} height={36} fill={`url(#${hatch})`} stroke="#111827" stroke-width="1.5"><title>{`${mark.label} · ${mark.detail}`}</title></rect>)}
    </svg>
    <ul aria-label="Sources in the construct" class="flex flex-wrap gap-2">
      {sources.map(segment => {
        const color = sourceColor(segment.sourceIndex);
        return <li key={`${segment.sourceIndex}-${segment.start}`}>
          <button type="button" aria-pressed={pressed(segment)} onClick={() => onSelect({ start: segment.start, end: segment.end, source: 'analysis' })}
            class={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 ${pressed(segment) ? 'border-accent-600 ring-1 ring-accent-600 dark:border-accent-400 dark:ring-accent-400' : 'border-slate-300 dark:border-slate-600'}`}>
            <span aria-hidden="true" class="inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold" style={{ background: color, color: readableOn(color) }}>{segment.sourceIndex + 1}</span>
            <span>{segment.sourceIndex + 1} · {segment.name}</span>
            <span class="font-normal text-slate-600 dark:text-slate-400">{range(segment)} · {(segment.end - segment.start).toLocaleString()} bp</span>
          </button>
        </li>;
      })}
    </ul>
    <p class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"><svg aria-hidden="true" width="16" height="12"><rect width="16" height="12" fill={`url(#${hatch})`} stroke="#111827" /></svg> shared homology at a junction</p>
  </div>;
}
