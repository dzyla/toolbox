import { useRef, useState } from 'preact/hooks';

let instances = 0;

export interface DiagramPrimer { id: string; label: string; strand: 'fwd' | 'rev'; start: number; length: number; tailLength: number; tailColor: string }

export interface DiagramProps {
  title: string;
  length: number;
  /** A circular source is drawn unrolled, with its origin marked at both ends. */
  circular?: boolean;
  /** Colour of the source this line belongs to. */
  color: string;
  region?: { start: number; length: number };
  removed?: { start: number; length: number };
  primers?: DiagramPrimer[];
  marker?: { position: number; label: string };
  activeId?: string;
  onActive?: (id: string | undefined) => void;
  /** Click on the line: a 0-based position. */
  onPick?: (position: number) => void;
  /** Drag on the line: a 0-based half-open range. */
  onRegion?: (start: number, end: number) => void;
}

const WIDTH = 1000;
const LEFT = 24;
const RIGHT = WIDTH - 24;
const AXIS = 70;
const HEIGHT = 146;
/** Movement (screen pixels) from the press that turns a click into a drag. */
const DRAG_PX = 6;

/** Splits a stretch that may wrap the origin into one or two [start, end) spans. */
export function spansOf(start: number, length: number, total: number): Array<[number, number]> {
  if (length <= 0 || total <= 0) return [];
  if (length >= total) return [[0, total]];
  const from = ((start % total) + total) % total;
  return from + length <= total ? [[from, from + length]] : [[from, total], [0, from + length - total]];
}

const fmt = (n: number) => n.toLocaleString('en-US');

export function ConstructDiagram({ title, length, circular, color, region, removed, primers = [], marker, activeId, onActive, onPick, onRegion }: DiagramProps) {
  const surface = useRef<SVGRectElement>(null);
  const uid = useRef(`d${++instances}`).current;
  const [focused, setFocused] = useState<string | undefined>();
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const down = useRef<{ clientX: number; touch: boolean } | null>(null);
  const x = (position: number) => LEFT + (position / length) * (RIGHT - LEFT);
  const interactive = !!(onPick || onRegion);

  const positionAt = (clientX: number, clientY: number): number => {
    const svg = surface.current?.ownerSVGElement ?? null;
    let unit: number | undefined;
    const matrix = svg?.getScreenCTM?.();
    if (svg && matrix && typeof svg.createSVGPoint === 'function') {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      if (typeof point.matrixTransform === 'function' && typeof matrix.inverse === 'function') unit = point.matrixTransform(matrix.inverse()).x;
    }
    if (unit === undefined) {
      const box = (svg ?? surface.current)?.getBoundingClientRect();
      if (!box || !box.width) return 0;
      unit = ((clientX - box.left) / box.width) * WIDTH;
    }
    return Math.max(0, Math.min(length, Math.round(((unit - LEFT) / (RIGHT - LEFT)) * length)));
  };

  const summary = [
    title,
    `${fmt(length)} bp${circular ? ', circular, shown unrolled' : ''}`,
    region ? `region ${fmt(region.start + 1)}–${fmt(((region.start + region.length - 1) % length) + 1)}` : '',
    ...primers.map(primer => `${primer.label} ${primer.strand === 'fwd' ? 'forward' : 'reverse'} ${fmt(primer.start + 1)}–${fmt(primer.start + primer.length)}`),
  ].filter(Boolean).join('; ');

  const arrow = (primer: DiagramPrimer, from: number, to: number, head: boolean) => {
    const forward = primer.strand === 'fwd';
    const y = forward ? AXIS - 30 : AXIS + 14;
    const a = x(from);
    const b = Math.max(x(to), a + 3);
    const tip = Math.min(9, (b - a) / 2);
    const points = forward
      ? `${a},${y} ${b - (head ? tip : 0)},${y} ${b},${y + 8} ${b - (head ? tip : 0)},${y + 16} ${a},${y + 16}`
      : `${b},${y} ${a + (head ? tip : 0)},${y} ${a},${y + 8} ${a + (head ? tip : 0)},${y + 16} ${b},${y + 16}`;
    return <polygon points={points} fill="#111827" stroke="#ffffff" stroke-width="1" />;
  };

  return <div class="w-full min-w-0">
    {/* Labels are drawn in viewBox units, so the map keeps a minimum width (about 10 px text) and scrolls sideways inside its own box on a phone. */}
    <div class="max-w-3xl overflow-x-auto"><svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label={summary} class="h-auto w-full min-w-[36rem] select-none">
      <defs>
        <pattern id={`${uid}-removed`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#fee2e2" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#b91c1c" stroke-width="2" />
        </pattern>
        <pattern id={`${uid}-tail`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#111827" stroke-width="2" />
        </pattern>
      </defs>
      <rect x={LEFT} y={AXIS - 4} width={RIGHT - LEFT} height="8" rx="2" fill="#d1d5db" />
      {removed && spansOf(removed.start, removed.length, length).map(([a, b]) => <rect key={`r${a}`} data-part="removed" x={x(a)} y={AXIS - 8} width={Math.max(x(b) - x(a), 2)} height="16" fill={`url(#${uid}-removed)`} stroke="#b91c1c" />)}
      {region && spansOf(region.start, region.length, length).map(([a, b]) => <rect key={`g${a}`} data-part="region" x={x(a)} y={AXIS - 7} width={Math.max(x(b) - x(a), 2)} height="14" rx="2" fill={color} stroke="#111827" stroke-opacity="0.5" />)}
      {primers.map(primer => {
        const spans = spansOf(primer.start, primer.length, length);
        const forward = primer.strand === 'fwd';
        const active = activeId === primer.id;
        const first = spans[0];
        const room = first ? (forward ? x(first[0]) : WIDTH - x(spans[spans.length - 1]![1])) - 2 : 0;
        const tailWidth = Math.max(0, Math.min(room, Math.max(primer.tailLength ? 8 : 0, Math.min(90, (primer.tailLength / length) * (RIGHT - LEFT)))));
        const y = forward ? AXIS - 30 : AXIS + 14;
        const description = `${primer.label}, ${forward ? 'forward' : 'reverse'}, ${fmt(primer.start + 1)}–${fmt(primer.start + primer.length)}, ${primer.tailLength ? `${primer.tailLength} nt tail` : 'no tail'}`;
        return <g key={primer.id} role="button" tabIndex={0} aria-pressed={active} aria-label={description} class="cursor-pointer focus:outline-none"
          onFocus={() => setFocused(primer.id)} onBlur={() => setFocused(current => (current === primer.id ? undefined : current))}
          onClick={() => onActive?.(active ? undefined : primer.id)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActive?.(active ? undefined : primer.id); } }}>
          {focused === primer.id && first && <rect data-part="focus" x={x(first[0]) - 6} y={y - 6} width={Math.max(x(first[1]) - x(first[0]), 3) + 12 + (forward ? 0 : tailWidth)} height="28" rx="5" fill="none" stroke="#d97706" stroke-width="2.5" />}
          {active && first && <rect x={x(first[0]) - 4} y={y - 4} width={Math.max(x(first[1]) - x(first[0]), 3) + 8 + (forward ? 0 : tailWidth)} height="24" rx="4" fill="none" stroke="#2563eb" stroke-width="2.5" />}
          {spans.map(([a, b], i) => <g key={a}>{arrow(primer, a, b, forward ? i === spans.length - 1 : i === 0)}</g>)}
          {primer.tailLength > 0 && first && (forward
            ? <rect data-part="tail" x={x(first[0]) - tailWidth} y={y} width={tailWidth} height="16" fill={primer.tailColor} stroke="#111827" />
            : <rect data-part="tail" x={x(spans[spans.length - 1]![1])} y={y} width={tailWidth} height="16" fill={primer.tailColor} stroke="#111827" />)}
          {primer.tailLength > 0 && first && <rect x={forward ? x(first[0]) - tailWidth : x(spans[spans.length - 1]![1])} y={y} width={tailWidth} height="16" fill={`url(#${uid}-tail)`} fill-opacity="0.35" />}
          {first && (x(first[0]) > RIGHT - 170
            ? <text x={x(spans[spans.length - 1]![1])} y={forward ? y - 6 : y + 34} text-anchor="end" font-size="18" font-weight="600" fill="currentColor">{primer.label}</text>
            : <text x={x(first[0])} y={forward ? y - 6 : y + 34} font-size="18" font-weight="600" fill="currentColor">{primer.label}</text>)}
        </g>;
      })}
      {marker && <g>
        <line x1={x(marker.position)} x2={x(marker.position)} y1={AXIS - 44} y2={AXIS + 30} stroke="#dc2626" stroke-width="2.5" stroke-dasharray="5 3" />
        <text x={Math.min(x(marker.position) + 6, RIGHT - 230)} y={AXIS - 52} font-size="18" font-weight="600" fill="#b91c1c">{marker.label}</text>
      </g>}
      {drag && <rect x={x(Math.min(drag.from, drag.to))} y={AXIS - 40} width={Math.abs(x(drag.to) - x(drag.from))} height="80" fill="#2563eb" fill-opacity="0.15" stroke="#2563eb" />}
      <text x={LEFT} y={AXIS + 70} font-size="16" fill="currentColor">1</text>
      <text x={RIGHT} y={AXIS + 70} font-size="16" text-anchor="end" fill="currentColor">{fmt(length)}{circular ? ' (origin)' : ''}</text>
      {interactive && <rect ref={surface} data-testid="diagram-surface" x={LEFT} y={AXIS - 12} width={RIGHT - LEFT} height="24" fill="transparent" class="cursor-crosshair"
        onPointerDown={event => {
          const touch = event.pointerType === 'touch';
          down.current = { clientX: event.clientX, touch };
          if (touch) return; // a finger pans the page or the map box; a tap still picks on release
          (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
          const at = positionAt(event.clientX, event.clientY);
          setDrag({ from: at, to: at });
        }}
        onPointerMove={event => setDrag(current => current ? { ...current, to: positionAt(event.clientX, event.clientY) } : current)}
        onPointerUp={event => {
          const start = down.current;
          down.current = null;
          const end = positionAt(event.clientX, event.clientY);
          const from = drag?.from ?? end;
          setDrag(null);
          if (!start) return;
          const moved = Math.abs(event.clientX - start.clientX); // screen pixels, so finger jitter is a click whatever the sequence length
          if (start.touch) { if (moved < DRAG_PX) onPick?.(end); return; }
          if (moved < DRAG_PX) onPick?.(end);
          else onRegion?.(Math.min(from, end), Math.max(from, end));
        }}
        onPointerCancel={() => { down.current = null; setDrag(null); }} />}
    </svg></div>
    {interactive && <p class="mt-1 text-xs text-slate-600 dark:text-slate-400">{onRegion ? 'Click the line to choose a position, or drag to choose a region. ' : 'Click the line to choose a position. '}You can also type the numbers.</p>}
  </div>;
}
