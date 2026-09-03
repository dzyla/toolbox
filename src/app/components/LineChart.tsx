import { useMemo, useRef, useState } from 'preact/hooks';
import { downloadSvg, svgToPngBlob, downloadBlob } from '@/lib/export';

export interface Series { name: string; x: number[]; y: number[]; color?: string; dashed?: boolean }
export interface LineChartProps {
  series: Series[]; width?: number; height?: number; xLabel?: string; yLabel?: string; title?: string;
  xLog?: boolean; yLog?: boolean; xDomain?: [number, number]; yDomain?: [number, number];
  hLines?: { y: number; label?: string }[]; vLines?: { x: number; label?: string }[];
  exportName?: string; formatX?: (v: number) => string; formatY?: (v: number) => string;
}
const COLORS = ['#4f46e5', '#0891b2', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#475569'];

function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const span = hi - lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => span / s <= n * 1.5) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * span; v += step) out.push(Number(v.toFixed(10)));
  return out;
}
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) { const v = 10 ** e; if (v >= lo && v <= hi) out.push(v); }
  return out.length ? out : [lo, hi];
}
const fmt = (v: number) => Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : String(Number(v.toPrecision(4)));

/** Responsive inline-SVG line chart. Exports as real vector SVG or PNG. */
export function LineChart(p: LineChartProps) {
  const W = p.width ?? 640, H = p.height ?? 320, m = { l: 56, r: 16, t: p.title ? 28 : 12, b: 44 };
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  const { xs, ys, x0, x1, y0, y1 } = useMemo(() => {
    const allX = p.series.flatMap(s => s.x), allY = p.series.flatMap(s => s.y).filter(Number.isFinite);
    const fx = p.xLog ? allX.filter(v => v > 0) : allX, fy = p.yLog ? allY.filter(v => v > 0) : allY;
    const [x0, x1] = p.xDomain ?? [Math.min(...fx), Math.max(...fx)];
    let [y0, y1] = p.yDomain ?? [Math.min(...fy), Math.max(...fy)];
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const xs = (v: number) => m.l + (W - m.l - m.r) * (p.xLog ? (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : (v - x0) / (x1 - x0));
    const ys = (v: number) => H - m.b - (H - m.t - m.b) * (p.yLog ? (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)) : (v - y0) / (y1 - y0));
    return { xs, ys, x0, x1, y0, y1 };
  }, [p.series, p.xLog, p.yLog, p.xDomain, p.yDomain, W, H]);

  const xt = p.xLog ? logTicks(x0, x1) : niceTicks(x0, x1, 6), yt = p.yLog ? logTicks(y0, y1) : niceTicks(y0, y1, 5);
  const fX = p.formatX ?? fmt, fY = p.formatY ?? fmt;
  const path = (s: Series) => s.x.map((x, i) => { const y = s.y[i]!; if (!Number.isFinite(y) || (p.xLog && x <= 0) || (p.yLog && y <= 0)) return null; return `${i === 0 ? 'M' : 'L'}${xs(x).toFixed(1)},${ys(y).toFixed(1)}`; }).filter(Boolean).join(' ').replace(/^L/, 'M');

  const onMove = (e: MouseEvent) => {
    const svg = ref.current; if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    let best: { d: number; text: string; x: number; y: number } | null = null;
    for (const s of p.series) for (let i = 0; i < s.x.length; i++) {
      const d = Math.abs(xs(s.x[i]!) - px);
      if (best === null || d < best.d) best = { d, text: `${s.name}: x = ${fX(s.x[i]!)}, y = ${fY(s.y[i]!)}`, x: xs(s.x[i]!), y: ys(s.y[i]!) };
    }
    setHover(best && best.d < 30 ? { x: best.x, y: best.y, text: best.text } : null);
  };
  const name = p.exportName ?? 'chart';
  return (
    <figure class="m-0">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} class="h-auto w-full select-none text-slate-700 dark:text-slate-200" role="img" aria-label={p.title ?? 'chart'}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} style="font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px">
        {p.title && <text x={W / 2} y={16} text-anchor="middle" fill="currentColor" font-size="13" font-weight="600">{p.title}</text>}
        {yt.map(v => <g key={`y${v}`}><line x1={m.l} x2={W - m.r} y1={ys(v)} y2={ys(v)} stroke="currentColor" stroke-opacity="0.12" /><text x={m.l - 6} y={ys(v) + 3} text-anchor="end" fill="currentColor">{fY(v)}</text></g>)}
        {xt.map(v => <g key={`x${v}`}><line y1={m.t} y2={H - m.b} x1={xs(v)} x2={xs(v)} stroke="currentColor" stroke-opacity="0.12" /><text y={H - m.b + 14} x={xs(v)} text-anchor="middle" fill="currentColor">{fX(v)}</text></g>)}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="none" stroke="currentColor" stroke-opacity="0.4" />
        {p.hLines?.map(h => <g key={`h${h.y}`}><line x1={m.l} x2={W - m.r} y1={ys(h.y)} y2={ys(h.y)} stroke="currentColor" stroke-dasharray="4 3" stroke-opacity="0.6" />{h.label && <text x={W - m.r - 4} y={ys(h.y) - 3} text-anchor="end" fill="currentColor">{h.label}</text>}</g>)}
        {p.vLines?.map(v => <g key={`v${v.x}`}><line y1={m.t} y2={H - m.b} x1={xs(v.x)} x2={xs(v.x)} stroke="currentColor" stroke-dasharray="4 3" stroke-opacity="0.6" />{v.label && <text x={xs(v.x) + 4} y={m.t + 12} fill="currentColor">{v.label}</text>}</g>)}
        {p.series.map((s, i) => <path key={s.name} d={path(s)} fill="none" stroke={s.color ?? COLORS[i % COLORS.length]} stroke-width="2" stroke-dasharray={s.dashed ? '6 4' : undefined} />)}
        {p.xLabel && <text x={(m.l + W - m.r) / 2} y={H - 8} text-anchor="middle" fill="currentColor" font-size="12">{p.xLabel}</text>}
        {p.yLabel && <text transform={`translate(14 ${(m.t + H - m.b) / 2}) rotate(-90)`} text-anchor="middle" fill="currentColor" font-size="12">{p.yLabel}</text>}
        {p.series.length > 1 && p.series.map((s, i) => <g key={`l${s.name}`} transform={`translate(${m.l + 8 + i * 120} ${m.t + 12})`}><line x1="0" x2="16" y1="0" y2="0" stroke={s.color ?? COLORS[i % COLORS.length]} stroke-width="2" /><text x="20" y="4" fill="currentColor">{s.name}</text></g>)}
        {hover && <g><circle cx={hover.x} cy={hover.y} r="4" fill="currentColor" /><text x={Math.min(hover.x + 8, W - 200)} y={Math.max(hover.y - 8, m.t + 12)} fill="currentColor" font-weight="600">{hover.text}</text></g>}
      </svg>
      <figcaption class="mt-1 flex gap-2 text-xs">
        <button type="button" class="underline" onClick={() => ref.current && downloadSvg(ref.current, `${name}.svg`)}>Download SVG</button>
        <button type="button" class="underline" onClick={async () => { if (ref.current) downloadBlob(await svgToPngBlob(ref.current, 3), `${name}.png`); }}>Download PNG</button>
      </figcaption>
    </figure>
  );
}
