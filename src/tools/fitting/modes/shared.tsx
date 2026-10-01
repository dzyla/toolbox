import { useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { niceTicks } from '@/app/components/LineChart';
import { downloadSvg, svgToPngBlob, downloadBlob } from '@/lib/export';
import type { ModelParameter } from '@/core/fitting';
import { ImportAlert } from '@/app/components/ImportAlert';

export type Analysis = 'curve' | 'inhibition' | 'itc' | 'spr';

const MODES: Array<{ id: Analysis; label: string; hint: string }> = [
  { id: 'curve', label: 'Curve fit', hint: 'One x/y data set: dose-response, kinetics, growth, linear…' },
  { id: 'inhibition', label: 'Enzyme inhibition', hint: 'Global fit of rate vs [S] at several [I], with model comparison; tight-binding (Morrison)' },
  { id: 'itc', label: 'ITC', hint: 'Isothermal titration calorimetry, one set of sites' },
  { id: 'spr', label: 'SPR / BLI kinetics', hint: 'Global 1:1 fit of sensorgrams at several concentrations' },
];

export function ModeTabs({ value, onChange }: { value: Analysis; onChange: (a: Analysis) => void }) {
  return (
    <div class="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <span class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Analysis</span>
      <div class="grid grid-cols-2 gap-1.5" role="group" aria-label="Analysis type">
        {MODES.map(mode => (
          <button
            key={mode.id}
            type="button"
            aria-pressed={value === mode.id}
            title={mode.hint}
            onClick={() => onChange(mode.id)}
            class={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${value === mode.id ? 'bg-accent-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">{MODES.find(x => x.id === value)!.hint}</p>
    </div>
  );
}

export function Card({ title, children, right }: { title: string; children: ComponentChildren; right?: ComponentChildren }) {
  return (
    <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function NumField({ label, value, onChange, unit, step = 'any', min, hint }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: string; min?: number; hint?: string }) {
  return (
    <label class="block">
      <span class="mb-0.5 block text-[11px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <span class="flex items-center gap-1.5">
        <input
          type="number" step={step} min={min} value={Number.isFinite(value) ? value : ''}
          onInput={e => { const v = parseFloat((e.target as HTMLInputElement).value); onChange(Number.isFinite(v) ? v : NaN); }}
          class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
        />
        {unit && <span class="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{unit}</span>}
      </span>
      {hint && <span class="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label class="flex cursor-pointer select-none items-start gap-2">
      <input type="checkbox" checked={checked} onChange={e => onChange((e.target as HTMLInputElement).checked)} class="mt-0.5 rounded accent-accent-600" />
      <span><span class="font-medium">{label}</span>{hint && <span class="block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>}</span>
    </label>
  );
}

/** Paste box with an example loader and CSV/TSV upload. */
export function DataBox({
  title, label, value, onChange, onExample, exampleLabel = 'Load example (synthetic)', placeholder, format, summary, error, onFile,
}: {
  title: string; label: string; value: string; onChange: (v: string) => void; onExample: () => void; exampleLabel?: string;
  placeholder: string; format: string; summary?: string; error?: string; onFile: (f: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Card title={title} right={summary ? <span class="mono text-[11px] text-slate-500 dark:text-slate-400">{summary}</span> : undefined}>
      <textarea
        aria-label={label} rows={9} value={value} placeholder={placeholder}
        onInput={e => onChange((e.target as HTMLTextAreaElement).value)}
        class="w-full resize-y rounded-lg border border-slate-300 p-2.5 font-mono text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-950"
      />
      <p class="text-[11px] text-slate-500 dark:text-slate-400">{format}</p>
      <div class="flex gap-2">
        <button type="button" onClick={onExample} class="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">{exampleLabel}</button>
        <button type="button" onClick={() => fileRef.current?.click()} class="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">Upload CSV / TSV</button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" aria-label={`${label} file`} class="hidden" onChange={e => { const i = e.target as HTMLInputElement; const f = i.files?.[0]; i.value = ''; if (f) onFile(f); }} />
      </div>
      <ImportAlert message={error ?? ''} />
    </Card>
  );
}

export const fmtSig = (v: number | undefined, digits = 3): string => {
  if (v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  return a >= 1e5 || a < 1e-2 ? v.toExponential(digits - 1) : String(Number(v.toPrecision(digits)));
};

export function ParamTable({ parameters }: { parameters: ModelParameter[] }) {
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <th class="pb-2 font-semibold">Parameter</th>
            <th class="pb-2 text-right font-semibold">Value</th>
            <th class="pb-2 text-right font-semibold">Std. error</th>
            <th class="pb-2 text-right font-semibold">95% CI</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          {parameters.map(p => (
            <tr key={p.symbol + p.name}>
              <td class="py-1.5 pr-2">
                <span class="font-semibold">{p.symbol}</span> <span class="text-slate-500 dark:text-slate-400">{p.name}</span>
                <span class="block text-[11px] text-slate-500 dark:text-slate-400">{p.description}</span>
              </td>
              <td class="py-1.5 text-right font-mono font-semibold">{fmtSig(p.value, 4)}{p.unit ? <span class="font-sans font-normal text-slate-500 dark:text-slate-400"> {p.unit}</span> : null}</td>
              <td class="py-1.5 text-right font-mono">{fmtSig(p.standardError)}</td>
              <td class="py-1.5 text-right font-mono">{p.ci95Low !== undefined ? `${fmtSig(p.ci95Low)} – ${fmtSig(p.ci95High)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeyCards({ items }: { items: Array<{ label: string; value: string; sub?: string }> }) {
  return (
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(it => (
        <div key={it.label} class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">{it.label}</span>
          <p class="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-slate-100">{it.value}</p>
          {it.sub && <span class="text-[11px] text-slate-500 dark:text-slate-400">{it.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul class="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      {notes.map(n => <li key={n}>• {n}</li>)}
    </ul>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><strong>Fit failed:</strong> {message}</div>;
}

export interface PlotGroup {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
  /** Fitted curve, drawn as a line (optional). */
  curve?: Array<{ x: number; y: number }>;
}
export const PLOT_COLORS = ['#4f46e5', '#0891b2', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#475569'];

/** Scatter points + fitted lines in an inline SVG with vector/PNG export. Fixed light background so exports look the same in both themes. */
export function FitPlot({ groups, xLabel, yLabel, title, xLog, ariaLabel, name, hLines, vLines, height = 320 }: {
  groups: PlotGroup[]; xLabel: string; yLabel: string; title?: string; xLog?: boolean; ariaLabel: string; name: string;
  hLines?: number[]; vLines?: Array<{ x: number; label: string }>; height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const W = 680, H = height, m = { l: 62, r: 16, t: title ? 30 : 14, b: 46 };
  const allX = groups.flatMap(g => [...g.points, ...(g.curve ?? [])].map(p => p.x)).filter(v => Number.isFinite(v) && (!xLog || v > 0));
  const allY = groups.flatMap(g => [...g.points, ...(g.curve ?? [])].map(p => p.y)).filter(Number.isFinite);
  if (allX.length === 0 || allY.length === 0) return null;
  const x0 = Math.min(...allX), x1 = Math.max(...allX);
  let y0 = Math.min(...allY), y1 = Math.max(...allY);
  const padY = (y1 - y0) * 0.06 || 1; y0 -= padY; y1 += padY;
  const xs = (v: number) => m.l + (W - m.l - m.r) * (xLog ? (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0) || 1) : (v - x0) / (x1 - x0 || 1));
  const ys = (v: number) => H - m.b - (H - m.t - m.b) * ((v - y0) / (y1 - y0));
  const fmt = (v: number) => fmtSig(v, 3);
  const xt = xLog ? Array.from({ length: Math.ceil(Math.log10(x1)) - Math.floor(Math.log10(x0)) + 1 }, (_, i) => 10 ** (Math.floor(Math.log10(x0)) + i)).filter(v => v >= x0 * 0.999 && v <= x1 * 1.001) : niceTicks(x0, x1, 6);
  const yt = niceTicks(y0, y1, 5);
  return (
    <figure class="m-0 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} class="h-auto w-full select-none" style="font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; color: #334155">
        <rect width={W} height={H} fill="#ffffff" />
        {title && <text x={W / 2} y={17} text-anchor="middle" fill="currentColor" font-size="13" font-weight="600">{title}</text>}
        {yt.map(v => <g key={`y${v}`}><line x1={m.l} x2={W - m.r} y1={ys(v)} y2={ys(v)} stroke="currentColor" stroke-opacity="0.12" /><text x={m.l - 6} y={ys(v) + 3} text-anchor="end" fill="currentColor">{fmt(v)}</text></g>)}
        {xt.map(v => <g key={`x${v}`}><line y1={m.t} y2={H - m.b} x1={xs(v)} x2={xs(v)} stroke="currentColor" stroke-opacity="0.12" /><text y={H - m.b + 14} x={xs(v)} text-anchor="middle" fill="currentColor">{fmt(v)}</text></g>)}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="none" stroke="currentColor" stroke-opacity="0.4" />
        {hLines?.map(v => <line key={`h${v}`} x1={m.l} x2={W - m.r} y1={ys(v)} y2={ys(v)} stroke="currentColor" stroke-dasharray="4 3" stroke-opacity="0.5" />)}
        {vLines?.map(v => <g key={`v${v.x}`}><line y1={m.t} y2={H - m.b} x1={xs(v.x)} x2={xs(v.x)} stroke="#b45309" stroke-dasharray="4 3" /><text x={xs(v.x) + 4} y={m.t + 12} fill="#b45309">{v.label}</text></g>)}
        {groups.map(g => (
          <g key={g.label}>
            {g.curve && g.curve.length > 1 && <path d={g.curve.filter(p => !xLog || p.x > 0).map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(p.x).toFixed(1)},${ys(p.y).toFixed(1)}`).join(' ')} fill="none" stroke={g.color} stroke-width="2" />}
            {g.points.filter(p => Number.isFinite(p.y) && (!xLog || p.x > 0)).map((p, i) => <circle key={i} cx={xs(p.x)} cy={ys(p.y)} r="2.8" fill={g.color} fill-opacity="0.75" />)}
          </g>
        ))}
        {groups.length > 1 && groups.map((g, i) => <g key={`l${g.label}`} transform={`translate(${m.l + 8 + (i % 4) * 150} ${m.t + 12 + Math.floor(i / 4) * 14})`}><circle cx="4" cy="0" r="3.5" fill={g.color} /><text x="12" y="3" fill="currentColor">{g.label}</text></g>)}
        <text x={(m.l + W - m.r) / 2} y={H - 8} text-anchor="middle" fill="currentColor" font-size="12">{xLabel}</text>
        <text transform={`translate(14 ${(m.t + H - m.b) / 2}) rotate(-90)`} text-anchor="middle" fill="currentColor" font-size="12">{yLabel}</text>
      </svg>
      <figcaption class="mt-1 flex gap-3 text-xs">
        <button type="button" class="underline" onClick={() => ref.current && downloadSvg(ref.current, `${name}.svg`)}>Download SVG</button>
        <button type="button" class="underline" onClick={async () => { if (ref.current) downloadBlob(await svgToPngBlob(ref.current, 3), `${name}.png`); }}>Download PNG</button>
      </figcaption>
    </figure>
  );
}

export const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
export const logspace = (a: number, b: number, n: number) => linspace(Math.log10(a), Math.log10(b), n).map(v => 10 ** v);
