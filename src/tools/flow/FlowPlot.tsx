import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Ref } from 'preact';
import {
  axisTicks, density2d, forward, histogram, inverse, subsampleIndices,
  type Gate, type Range, type ScaleSpec,
} from '@/core/flow';

export type Tool = 'none' | 'rect' | 'polygon' | 'range';
export type Shape =
  | { type: 'range'; min: number; max: number }
  | { type: 'rect'; xMin: number; xMax: number; yMin: number; yMax: number }
  | { type: 'polygon'; points: [number, number][] };

interface Props {
  mode: 'hist' | 'scatter';
  view: 'density' | 'dots';
  xs: Float32Array;
  ys: Float32Array;
  mask: Uint8Array | null;
  xScale: ScaleSpec;
  yScale: ScaleSpec;
  xRange: Range;
  yRange: Range;
  xLabel: string;
  yLabel: string;
  xParam: number;
  yParam: number;
  gates: Gate[];
  tool: Tool;
  onCreate: (shape: Shape) => void;
  ariaLabel: string;
  canvasRef: Ref<HTMLCanvasElement>;
}

const M = { l: 54, r: 12, t: 12, b: 44 };
const RAMP: [number, number, number][] = [[68, 1, 84], [49, 104, 142], [33, 145, 140], [53, 183, 121], [144, 215, 67], [253, 231, 37]];
function ramp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  const a = RAMP[i]!, b = RAMP[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function FlowPlot(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [poly, setPoly] = useState<[number, number][]>([]);
  const height = p.mode === 'hist' ? Math.round(width * 0.55) : Math.round(width * 0.85);
  const pw = Math.max(10, width - M.l - M.r), ph = Math.max(10, height - M.t - M.b);
  const { xRange, yRange } = p;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.floor(el.clientWidth || 520)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drawing in progress belongs to one plot; drop it when the plot or tool changes.
  useEffect(() => { setDrag(null); setPoly([]); }, [p.mode, p.xParam, p.yParam, p.tool, p.xScale, p.yScale]);

  const hist = useMemo(
    () => (p.mode === 'hist' ? histogram(p.xs, p.mask, p.xScale, 256, xRange) : null),
    [p.mode, p.xs, p.mask, p.xScale, xRange],
  );
  const dens = useMemo(
    () => (p.mode === 'scatter' && p.view === 'density' ? density2d(p.xs, p.ys, p.mask, p.xScale, p.yScale, xRange, yRange, 160, 160) : null),
    [p.mode, p.view, p.xs, p.ys, p.mask, p.xScale, p.yScale, xRange, yRange],
  );
  const dots = useMemo(() => {
    if (p.mode !== 'scatter' || p.view !== 'dots') return null;
    const idx = subsampleIndices(p.xs.length, 100_000);
    return p.mask ? idx.filter(i => p.mask![i] === 1) : idx;
  }, [p.mode, p.view, p.xs, p.mask]);

  const sx = (v: number) => M.l + ((v - xRange.min) / (xRange.max - xRange.min)) * pw;
  const sy = (v: number) => M.t + ph - ((v - yRange.min) / (yRange.max - yRange.min)) * ph;
  const ux = (px: number) => xRange.min + ((px - M.l) / pw) * (xRange.max - xRange.min);
  const uy = (py: number) => yRange.min + ((M.t + ph - py) / ph) * (yRange.max - yRange.min);

  useEffect(() => {
    const canvas = (p.canvasRef as { current: HTMLCanvasElement | null }).current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.font = '11px system-ui, sans-serif';

    // data layer
    if (hist) {
      const bw = pw / hist.counts.length;
      ctx.fillStyle = 'rgba(79,70,229,0.75)';
      hist.counts.forEach((c, i) => {
        const h = hist.maxCount > 0 ? (c / hist.maxCount) * ph : 0;
        ctx.fillRect(M.l + i * bw, M.t + ph - h, Math.max(1, bw), h);
      });
    } else if (dens) {
      const off = document.createElement('canvas');
      off.width = dens.nx; off.height = dens.ny;
      const octx = off.getContext('2d');
      if (octx) {
        const img = octx.createImageData(dens.nx, dens.ny);
        for (let y = 0; y < dens.ny; y++) for (let x = 0; x < dens.nx; x++) {
          const c = dens.counts[y * dens.nx + x]!;
          if (c === 0) continue;
          const [r, g, b] = ramp(Math.sqrt(c / dens.maxCount));
          const o = ((dens.ny - 1 - y) * dens.nx + x) * 4;
          img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, M.l, M.t, pw, ph);
      }
    } else if (dots) {
      ctx.fillStyle = 'rgba(37,99,235,0.35)';
      for (let k = 0; k < dots.length; k++) {
        const i = dots[k]!;
        const x = sx(forward(p.xs[i]!, p.xScale)), y = sy(forward(p.ys[i]!, p.yScale));
        if (x >= M.l && x <= M.l + pw && y >= M.t && y <= M.t + ph) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }

    // axes
    ctx.strokeStyle = '#475569'; ctx.fillStyle = '#334155'; ctx.lineWidth = 1;
    ctx.strokeRect(M.l, M.t, pw, ph);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const t of axisTicks(p.xScale, xRange.min, xRange.max)) {
      const x = sx(t.value);
      if (x < M.l - 1 || x > M.l + pw + 1) continue;
      ctx.beginPath(); ctx.moveTo(x, M.t + ph); ctx.lineTo(x, M.t + ph + 4); ctx.stroke();
      ctx.fillText(t.label, x, M.t + ph + 6);
    }
    ctx.fillText(p.xLabel, M.l + pw / 2, M.t + ph + 24);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const yTicks = hist ? axisTicks({ kind: 'linear', cofactor: 1, floor: 1 }, 0, hist.maxCount, 4) : axisTicks(p.yScale, yRange.min, yRange.max);
    for (const t of yTicks) {
      const y = hist ? M.t + ph - (t.value / Math.max(1, hist.maxCount)) * ph : sy(t.value);
      if (y < M.t - 1 || y > M.t + ph + 1) continue;
      ctx.beginPath(); ctx.moveTo(M.l - 4, y); ctx.lineTo(M.l, y); ctx.stroke();
      ctx.fillText(t.label, M.l - 7, y);
    }
    ctx.save();
    ctx.translate(12, M.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(hist ? 'Events' : p.yLabel, 0, 0);
    ctx.restore();

    // gates on these axes (mapped through data space so a gate drawn on another scale still lines up)
    ctx.lineWidth = 2; ctx.strokeStyle = '#e11d48'; ctx.fillStyle = '#be123c';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const gx = (v: number, s: ScaleSpec) => sx(forward(inverse(v, s), p.xScale));
    const gy = (v: number, s: ScaleSpec) => sy(forward(inverse(v, s), p.yScale));
    for (const g of p.gates) {
      if (p.mode === 'hist' && g.type === 'range' && g.param === p.xParam) {
        const a = gx(g.min, g.scale), b = gx(g.max, g.scale);
        ctx.fillStyle = 'rgba(225,29,72,0.10)'; ctx.fillRect(a, M.t, b - a, ph);
        ctx.beginPath(); ctx.moveTo(a, M.t); ctx.lineTo(a, M.t + ph); ctx.moveTo(b, M.t); ctx.lineTo(b, M.t + ph); ctx.stroke();
        ctx.fillStyle = '#be123c'; ctx.fillText(g.name, a + 3, M.t + 3);
      } else if (p.mode === 'scatter' && g.type === 'rect' && g.xParam === p.xParam && g.yParam === p.yParam) {
        const x0 = gx(g.xMin, g.xScale), x1 = gx(g.xMax, g.xScale), y0 = gy(g.yMin, g.yScale), y1 = gy(g.yMax, g.yScale);
        ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        ctx.fillStyle = '#be123c'; ctx.fillText(g.name, Math.min(x0, x1) + 3, Math.min(y0, y1) + 3);
      } else if (p.mode === 'scatter' && g.type === 'polygon' && g.xParam === p.xParam && g.yParam === p.yParam) {
        ctx.beginPath();
        g.points.forEach(([x, y], i) => { const px = gx(x, g.xScale), py = gy(y, g.yScale); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.closePath(); ctx.stroke();
        const [fx, fy] = g.points[0]!;
        ctx.fillStyle = '#be123c'; ctx.fillText(g.name, gx(fx, g.xScale) + 4, gy(fy, g.yScale) + 4);
      }
    }
    // gate being drawn
    ctx.strokeStyle = '#0f172a'; ctx.setLineDash([5, 3]); ctx.lineWidth = 1.5;
    if (drag) {
      if (p.mode === 'hist') ctx.strokeRect(Math.min(drag.x0, drag.x1), M.t, Math.abs(drag.x1 - drag.x0), ph);
      else ctx.strokeRect(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
    }
    if (poly.length) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => { const px = sx(x), py = sy(y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = '#0f172a';
      poly.forEach(([x, y]) => ctx.fillRect(sx(x) - 3, sy(y) - 3, 6, 6));
    }
    ctx.setLineDash([]);
  });

  const pos = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = Math.min(M.l + pw, Math.max(M.l, e.clientX - r.left));
    const y = Math.min(M.t + ph, Math.max(M.t, e.clientY - r.top));
    return { x, y };
  };
  const dragging = p.tool === 'rect' || p.tool === 'range';
  const onDown = (e: PointerEvent) => {
    if (p.tool === 'none') return;
    const { x, y } = pos(e);
    if (dragging) {
      (e.currentTarget as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
      setDrag({ x0: x, y0: y, x1: x, y1: y });
    } else if (p.tool === 'polygon') {
      if (poly.length >= 3 && Math.hypot(sx(poly[0]![0]) - x, sy(poly[0]![1]) - y) < 10) finishPolygon();
      else setPoly([...poly, [ux(x), uy(y)]]);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const { x, y } = pos(e);
    setDrag({ ...drag, x1: x, y1: y });
  };
  const onUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (Math.abs(d.x1 - d.x0) < 4 || (p.tool === 'rect' && Math.abs(d.y1 - d.y0) < 4)) return;
    const [xa, xb] = [ux(d.x0), ux(d.x1)].sort((a, b) => a - b) as [number, number];
    if (p.tool === 'range') p.onCreate({ type: 'range', min: xa, max: xb });
    else {
      const [ya, yb] = [uy(d.y0), uy(d.y1)].sort((a, b) => a - b) as [number, number];
      p.onCreate({ type: 'rect', xMin: xa, xMax: xb, yMin: ya, yMax: yb });
    }
  };
  function finishPolygon() {
    if (poly.length >= 3) p.onCreate({ type: 'polygon', points: poly });
    setPoly([]);
  }

  return (
    <div ref={wrap} class="w-full">
      <canvas
        ref={p.canvasRef}
        role="img"
        aria-label={p.ariaLabel}
        style={{ width: `${width}px`, height: `${height}px`, touchAction: p.tool === 'none' ? 'auto' : 'none', cursor: p.tool === 'none' ? 'default' : 'crosshair' }}
        class="block max-w-full rounded-lg border border-slate-300 bg-white dark:border-slate-600"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      />
      {poly.length > 0 && (
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span class="text-slate-600 dark:text-slate-300">{poly.length} point{poly.length === 1 ? '' : 's'}</span>
          <button type="button" disabled={poly.length < 3} onClick={finishPolygon} class="rounded-lg bg-accent-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">Finish polygon</button>
          <button type="button" onClick={() => setPoly([])} class="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">Cancel</button>
        </div>
      )}
    </div>
  );
}
