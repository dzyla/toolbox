import { useMemo, useRef, useState } from 'preact/hooks';
import {
  allGateStats, autoRange, evaluateGates, forward, inverse, maskCount, syntheticExample, syntheticObserved,
  DEFAULT_COFACTOR, type FcsData, type Gate, type ScaleKind, type ScaleSpec,
} from '@/core/flow';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { ImportAlert } from '@/app/components/ImportAlert';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { downloadBlob, downloadText, toCsv } from '@/lib/export';
import { importErrorMessage, readBinaryFile } from '@/lib/file-import';
import { useWorkerCompute } from '@/lib/use-worker-compute';
import { makeFlowWorker, runFlowJob, type FlowJob } from './job';
import { FlowPlot, type Shape, type Tool } from './FlowPlot';
import { SCIENCE } from './science';

const MAX_FCS_BYTES = 200 * 1024 * 1024;
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';
const LABEL = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';
const BTN = 'rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800';
const CARD = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';

const isLinearByDefault = (name: string) => /^(FSC|SSC|TIME)/i.test(name);
const paramText = (d: FcsData, i: number) => { const p = d.parameters[i]!; return p.label ? `${p.name} (${p.label})` : p.name; };
const fmt = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 1e5 || (v !== 0 && Math.abs(v) < 0.01) ? v.toExponential(2) : String(+v.toPrecision(4))) : '—');
const pct = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const fixedBound = (v: number) => String(+v.toPrecision(6));

function depthOf(g: Gate, gates: Gate[]): number {
  let d = 0;
  for (let cur: Gate | undefined = g; cur && cur.parent !== null && d < 50; d++) cur = gates.find(x => x.id === cur!.parent);
  return d;
}

export default function FlowView() {
  const [source, setSource] = useState<{ name: string; bytes: ArrayBuffer } | null>(null);
  const [example, setExample] = useState(false);
  const [importError, setImportError] = useState('');
  const [compensate, setCompensate] = useState(true);
  const [cofactor, setCofactor] = useState(DEFAULT_COFACTOR);
  const [xParamSel, setXParamSel] = useState<number | null>(null);
  const [yParamSel, setYParamSel] = useState<number | null>(null);
  const [xKindSel, setXKindSel] = useState<ScaleKind | null>(null);
  const [yKindSel, setYKindSel] = useState<ScaleKind | null>(null);
  const [view, setView] = useState<'hist' | 'density' | 'dots'>('density');
  const [toolSel, setToolSel] = useState<Tool>('rect');
  const [gates, setGates] = useState<Gate[]>([]);
  const [shownId, setShownId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [statParamSel, setStatParamSel] = useState<number | null>(null);
  const nextGate = useRef(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const job = useMemo<FlowJob | null>(() => (source && !example ? { bytes: source.bytes, compensate } : null), [source, example, compensate]);
  const parsed = useWorkerCompute<FlowJob, FcsData>(makeFlowWorker, runFlowJob, job);
  const exampleData = useMemo(() => (example ? (compensate ? syntheticExample() : syntheticObserved()) : null), [example, compensate]);
  const data: FcsData | null = exampleData ?? parsed.result;
  const fileName = example ? 'synthetic-example.fcs' : source?.name ?? '';

  function reset() {
    setGates([]); setShownId(null); setEditId(null);
    setXParamSel(null); setYParamSel(null); setXKindSel(null); setYKindSel(null); setStatParamSel(null);
    nextGate.current = 1; setImportError('');
  }
  async function loadFile(file: File) {
    try {
      const bytes = await readBinaryFile(file, MAX_FCS_BYTES);
      reset(); setExample(false); setSource({ name: file.name, bytes });
    } catch (e) {
      setImportError(importErrorMessage(e, file.name));
    }
  }
  function loadExample() { reset(); setSource(null); setExample(true); }

  const nParams = data?.parameters.length ?? 0;
  const findParam = (re: RegExp) => data ? data.parameters.findIndex(p => re.test(p.name)) : -1;
  const xParam = data ? Math.min(xParamSel ?? Math.max(0, findParam(/^FSC/i)), nParams - 1) : 0;
  const defaultY = findParam(/^SSC/i) >= 0 ? findParam(/^SSC/i) : nParams > 1 ? (xParam === 0 ? 1 : 0) : 0;
  const yParam = data ? Math.min(yParamSel ?? defaultY, nParams - 1) : 0;
  const kindFor = (sel: ScaleKind | null, param: number): ScaleKind => sel ?? (data && isLinearByDefault(data.parameters[param]!.name) ? 'linear' : 'asinh');
  const scaleOf = (kind: ScaleKind): ScaleSpec => ({ kind, cofactor: cofactor > 0 ? cofactor : DEFAULT_COFACTOR, floor: 1 });
  const xScale = useMemo(() => scaleOf(kindFor(xKindSel, xParam)), [xKindSel, xParam, cofactor, data]);
  const yScale = useMemo(() => scaleOf(kindFor(yKindSel, yParam)), [yKindSel, yParam, cofactor, data]);
  const mode = view === 'hist' ? 'hist' : 'scatter';
  const tool: Tool = mode === 'hist' ? (toolSel === 'none' ? 'none' : 'range') : toolSel === 'range' ? 'rect' : toolSel;

  const masks = useMemo(() => {
    if (!data) return null;
    try { return evaluateGates(data.columns, gates, data.eventCount); } catch { return null; }
  }, [data, gates]);
  const shownMask = shownId && masks ? masks[shownId] ?? null : null;
  const xRange = useMemo(() => (data ? autoRange(data.columns[xParam]!, xScale) : { min: 0, max: 1 }), [data, xParam, xScale]);
  const yRange = useMemo(() => (data ? autoRange(data.columns[yParam]!, yScale) : { min: 0, max: 1 }), [data, yParam, yScale]);

  const statParam = Math.min(statParamSel ?? xParam, Math.max(0, nParams - 1));
  const rows = useMemo(
    () => (data && masks ? allGateStats(data.columns, gates, data.eventCount, statParam, masks) : []),
    [data, gates, masks, statParam],
  );

  function addGate(shape: Shape) {
    if (!data) return;
    const n = nextGate.current++;
    const base = { id: `g${n}`, name: `Gate ${n}`, parent: shownId };
    let g: Gate;
    if (shape.type === 'range') g = { ...base, type: 'range', param: xParam, scale: xScale, min: shape.min, max: shape.max };
    else if (shape.type === 'rect') g = { ...base, type: 'rect', xParam, yParam, xScale, yScale, xMin: shape.xMin, xMax: shape.xMax, yMin: shape.yMin, yMax: shape.yMax };
    else g = { ...base, type: 'polygon', xParam, yParam, xScale, yScale, points: shape.points };
    setGates(prev => [...prev, g]);
    setEditId(g.id);
  }
  function addDefaultGate() {
    const mid = (r: { min: number; max: number }) => [r.min + (r.max - r.min) * 0.25, r.min + (r.max - r.min) * 0.75] as const;
    if (mode === 'hist') { const [a, b] = mid(xRange); addGate({ type: 'range', min: a, max: b }); }
    else { const [a, b] = mid(xRange), [c, d] = mid(yRange); addGate({ type: 'rect', xMin: a, xMax: b, yMin: c, yMax: d }); }
  }
  function removeGate(id: string) {
    const gone = new Set([id]);
    for (let changed = true; changed;) { changed = false; for (const g of gates) if (g.parent && gone.has(g.parent) && !gone.has(g.id)) { gone.add(g.id); changed = true; } }
    setGates(gates.filter(g => !gone.has(g.id)));
    if (shownId && gone.has(shownId)) setShownId(null);
    if (editId && gone.has(editId)) setEditId(null);
  }
  function patchGate(id: string, patch: Partial<Gate>) {
    setGates(gates.map(g => (g.id === id ? ({ ...g, ...patch } as Gate) : g)));
  }

  const edit = gates.find(g => g.id === editId) ?? null;
  const boundField = (label: string, value: number, scale: ScaleSpec, onSet: (display: number) => void) => (
    <label class="block text-xs text-slate-600 dark:text-slate-300">
      {label}
      <input
        type="number" step="any" aria-label={label} class={FIELD}
        key={`${edit?.id}-${label}-${value}`}
        defaultValue={fixedBound(inverse(value, scale))}
        onChange={e => { const v = Number((e.currentTarget as HTMLInputElement).value); if (Number.isFinite(v)) onSet(forward(v, scale)); }}
      />
    </label>
  );

  const gateCounts = data && masks ? gates.map(g => `${g.name} ${maskCount(masks[g.id]!).toLocaleString()} events`).join('; ') : '';
  const ariaLabel = data
    ? mode === 'hist'
      ? `Histogram of ${paramText(data, xParam)} on a ${xScale.kind} scale, ${shownId ? 'gated population' : 'all events'}. ${gates.length ? `Gates: ${gateCounts}.` : 'No gates drawn.'}`
      : `${view === 'dots' ? 'Dot' : 'Density'} plot of ${paramText(data, yParam)} against ${paramText(data, xParam)}, ${shownId ? 'gated population' : 'all events'}. ${gates.length ? `Gates: ${gateCounts}.` : 'No gates drawn.'}`
    : 'Plot';

  const statsHeader = ['Population', 'Parent', 'Events', '% of parent', '% of total', `Mean ${data ? data.parameters[statParam]?.name : ''}`, 'Median', 'Geometric mean', 'CV %', 'Robust CV %'];
  const statsTable = () => rows.map(r => [r.name, r.parent ? gates.find(g => g.id === r.parent)?.name ?? '' : r.id ? 'All events' : '', r.stats.count, r.stats.pctParent, r.stats.pctTotal, r.stats.mean, r.stats.median, r.stats.geoMean, r.stats.cv, r.stats.robustCv]);
  const copyText = () => data ? [`${fileName}: ${data.eventCount.toLocaleString()} events, statistics for ${paramText(data, statParam)}`, statsHeader.join('\t'), ...statsTable().map(r => r.join('\t')), '', scienceText(SCIENCE)].join('\n') : '';
  const exportCsv = () => downloadText(toCsv([statsHeader, ...statsTable().map(r => r.map(v => (typeof v === 'number' && !Number.isFinite(v) ? '' : v)))]), 'flow-statistics.csv', 'text/csv;charset=utf-8');
  const exportPng = () => canvasRef.current?.toBlob(b => { if (b) downloadBlob(b, 'flow-plot.png'); }, 'image/png');

  const busy = parsed.busy;
  const error = importError || (!example ? parsed.error : '');
  const paramSelect = (label: string, value: number, onChange: (i: number) => void) => (
    <label class="block">
      <span class={LABEL}>{label}</span>
      <select aria-label={label} class={FIELD} value={value} onChange={e => onChange(Number((e.currentTarget as HTMLSelectElement).value))}>
        {data!.parameters.map(p => <option value={p.index}>{paramText(data!, p.index)}</option>)}
      </select>
    </label>
  );
  const kindSelect = (label: string, value: ScaleKind, onChange: (k: ScaleKind) => void) => (
    <label class="block">
      <span class={LABEL}>{label}</span>
      <select aria-label={label} class={FIELD} value={value} onChange={e => onChange((e.currentTarget as HTMLSelectElement).value as ScaleKind)}>
        <option value="linear">Linear</option>
        <option value="log">Log</option>
        <option value="asinh">Arcsinh</option>
      </select>
    </label>
  );

  const inputs = (
    <div class="space-y-4">
      <div class={CARD}>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">1. Open a file</h3>
        <label class="block">
          <span class={LABEL}>FCS file (2.0, 3.0 or 3.1, up to 200 MB)</span>
          <input
            type="file" accept=".fcs,.FCS" aria-label="Choose an FCS file"
            class="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs dark:text-slate-300 dark:file:bg-slate-800"
            onChange={e => { const input = e.currentTarget as HTMLInputElement; const f = input.files?.[0]; input.value = ''; if (f) void loadFile(f); }}
          />
        </label>
        <button type="button" class={BTN} onClick={loadExample}>Load example (synthetic data)</button>
        <p class="text-xs text-slate-600 dark:text-slate-300">Files are read on this device and never uploaded.</p>
        <ImportAlert message={error} />
        {busy && <p role="status" class="text-xs text-slate-600 dark:text-slate-300">Reading file…</p>}
      </div>

      {data && (
        <div class={CARD}>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">2. Pick axes</h3>
          {paramSelect('X parameter', xParam, i => { setXParamSel(i); setXKindSel(null); setStatParamSel(null); })}
          {view !== 'hist' && paramSelect('Y parameter', yParam, i => { setYParamSel(i); setYKindSel(null); })}
          <div role="group" aria-label="Plot type" class="flex flex-wrap gap-2">
            {([['density', '2-D density'], ['dots', 'Dots'], ['hist', 'Histogram']] as const).map(([v, l]) => (
              <button type="button" aria-pressed={view === v} onClick={() => setView(v)}
                class={`rounded-lg border px-3 py-1.5 text-xs font-medium ${view === v ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{l}</button>
            ))}
          </div>
          <details class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <summary class="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">Advanced options</summary>
            <div class="mt-3 space-y-3">
              <label class="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" aria-label="Apply compensation" checked={compensate && !!data.compensation} disabled={!data.compensation} onChange={e => setCompensate((e.currentTarget as HTMLInputElement).checked)} class="mt-0.5" />
                <span>
                  Apply compensation
                  <span class="block text-slate-600 dark:text-slate-300">
                    {data.compensation ? `Matrix from ${data.compensation.source} (${data.compensation.names.length} parameters). Event × inverse(spillover).` : 'This file has no compensation matrix.'}
                  </span>
                </span>
              </label>
              {kindSelect('X scale', xScale.kind, setXKindSel)}
              {view !== 'hist' && kindSelect('Y scale', yScale.kind, setYKindSel)}
              <label class="block">
                <span class={LABEL}>Arcsinh cofactor</span>
                <input type="number" min="0.001" step="any" aria-label="Arcsinh cofactor" class={FIELD} value={cofactor}
                  onChange={e => { const v = Number((e.currentTarget as HTMLInputElement).value); if (v > 0) setCofactor(v); }} />
                <span class="mt-1 block text-xs text-slate-600 dark:text-slate-300">150 suits fluorescence; about 5 suits mass cytometry. Arcsinh replaces logicle here.</span>
              </label>
            </div>
          </details>
          <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <dt>File</dt><dd class="break-all font-medium">{fileName}</dd>
            <dt>Events</dt><dd class="font-medium">{data.eventCount.toLocaleString()}</dd>
            <dt>Parameters</dt><dd class="font-medium">{nParams}</dd>
            <dt>Format</dt><dd class="font-medium">{data.version}</dd>
            {data.meta.cytometer && (<><dt>Cytometer</dt><dd class="font-medium">{data.meta.cytometer}</dd></>)}
            {data.meta.date && (<><dt>Date</dt><dd class="font-medium">{data.meta.date}{data.meta.beginTime ? ` ${data.meta.beginTime}` : ''}</dd></>)}
          </dl>
          {data.warnings.map(w => <p class="text-xs text-amber-800 dark:text-amber-300">{w}</p>)}
        </div>
      )}
    </div>
  );

  const results = !data ? (
    <div class={CARD}>
      <p class="text-sm text-slate-600 dark:text-slate-300">Open an FCS file or load the synthetic example to plot events, draw gates and read population statistics.</p>
    </div>
  ) : (
    <div class="space-y-4">
      <div class={CARD}>
        <div class="flex flex-wrap items-end gap-3">
          <label class="block">
            <span class={LABEL}>Population shown</span>
            <select aria-label="Population shown" class={FIELD} value={shownId ?? ''} onChange={e => setShownId((e.currentTarget as HTMLSelectElement).value || null)}>
              <option value="">All events</option>
              {gates.map(g => <option value={g.id}>{'· '.repeat(depthOf(g, gates))}{g.name}</option>)}
            </select>
          </label>
          <div role="group" aria-label="Drawing tool" class="flex flex-wrap gap-2">
            {(mode === 'hist' ? [['range', 'Range'], ['none', 'No drawing']] : [['rect', 'Rectangle'], ['polygon', 'Polygon'], ['none', 'No drawing']] as const).map(([v, l]) => (
              <button type="button" aria-pressed={tool === v} onClick={() => setToolSel(v as Tool)}
                class={`rounded-lg border px-3 py-1.5 text-xs font-medium ${tool === v ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{l}</button>
            ))}
          </div>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-300">
          {tool === 'none' ? 'Drawing is off, so touch scrolling works over the plot.'
            : tool === 'polygon' ? 'Tap or click to add corners; tap the first corner or press Finish polygon to close it.'
            : mode === 'hist' ? 'Drag across the plot to gate a range.' : 'Drag across the plot to draw a rectangle.'}
          {' '}New gates are children of {shownId ? gates.find(g => g.id === shownId)?.name : 'All events'}.
        </p>
        <FlowPlot
          mode={mode} view={view === 'dots' ? 'dots' : 'density'}
          xs={data.columns[xParam]!} ys={data.columns[yParam]!} mask={shownMask}
          xScale={xScale} yScale={yScale} xRange={xRange} yRange={yRange}
          xLabel={paramText(data, xParam)} yLabel={paramText(data, yParam)}
          xParam={xParam} yParam={yParam} gates={gates} tool={tool} onCreate={addGate}
          ariaLabel={ariaLabel} canvasRef={canvasRef}
        />
        <div class="flex flex-wrap gap-2">
          <button type="button" class={BTN} onClick={exportPng}>Download plot (PNG)</button>
        </div>
      </div>

      <div class={CARD}>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Gates</h3>
        {gates.length === 0 && <p class="text-xs text-slate-600 dark:text-slate-300">No gates yet. Draw one on the plot, or add one and type its bounds.</p>}
        <div class="flex flex-wrap items-end gap-3">
          <button type="button" class={BTN} onClick={addDefaultGate}>{mode === 'hist' ? 'Add range gate' : 'Add rectangle gate'} (centre half of the axes)</button>
          {gates.length > 0 && (
            <label class="block">
              <span class={LABEL}>Edit gate</span>
              <select aria-label="Edit gate" class={FIELD} value={editId ?? ''} onChange={e => setEditId((e.currentTarget as HTMLSelectElement).value || null)}>
                <option value="">Choose a gate</option>
                {gates.map(g => <option value={g.id}>{g.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {edit && (
          <div class="space-y-3">
            <label class="block">
              <span class={LABEL}>Gate name</span>
              <input type="text" aria-label="Gate name" class={FIELD} value={edit.name} onInput={e => patchGate(edit.id, { name: (e.currentTarget as HTMLInputElement).value })} />
            </label>
            <p class="text-xs text-slate-600 dark:text-slate-300">
              {edit.type === 'range' && `Range on ${paramText(data, edit.param)}.`}
              {edit.type === 'rect' && `Rectangle on ${paramText(data, edit.xParam)} and ${paramText(data, edit.yParam)}.`}
              {edit.type === 'polygon' && `Polygon with ${edit.points.length} corners on ${paramText(data, edit.xParam)} and ${paramText(data, edit.yParam)}. Redraw it to change its shape.`}
              {' '}Bounds are in data units.
            </p>
            {edit.type === 'range' && (
              <div class="grid grid-cols-2 gap-3">
                {boundField('Minimum', edit.min, edit.scale, v => patchGate(edit.id, { min: v }))}
                {boundField('Maximum', edit.max, edit.scale, v => patchGate(edit.id, { max: v }))}
              </div>
            )}
            {edit.type === 'rect' && (
              <div class="grid grid-cols-2 gap-3">
                {boundField('X minimum', edit.xMin, edit.xScale, v => patchGate(edit.id, { xMin: v }))}
                {boundField('X maximum', edit.xMax, edit.xScale, v => patchGate(edit.id, { xMax: v }))}
                {boundField('Y minimum', edit.yMin, edit.yScale, v => patchGate(edit.id, { yMin: v }))}
                {boundField('Y maximum', edit.yMax, edit.yScale, v => patchGate(edit.id, { yMax: v }))}
              </div>
            )}
            <button type="button" class="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-800 dark:text-rose-300" onClick={() => removeGate(edit.id)}>Delete gate and its children</button>
          </div>
        )}
      </div>

      <div class={CARD}>
        <div class="flex flex-wrap items-end justify-between gap-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Population statistics</h3>
          <div class="flex flex-wrap items-end gap-2">
            {paramSelect('Statistics parameter', statParam, setStatParamSel)}
            <button type="button" class={BTN} onClick={exportCsv}>Export CSV</button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[40rem] text-left text-xs">
            <caption class="sr-only">Event counts and statistics of {paramText(data, statParam)} for each population</caption>
            <thead class="text-slate-600 dark:text-slate-300">
              <tr>{['Population', 'Events', '% parent', '% total', 'Mean', 'Median', 'Geo mean', 'CV %', 'rCV %'].map(h => <th scope="col" class="px-2 py-1 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody class="font-mono">
              {rows.map(r => {
                const g = gates.find(x => x.id === r.id);
                return (
                  <tr class="border-t border-slate-200 dark:border-slate-800">
                    <th scope="row" class="px-2 py-1 text-left font-sans font-medium" style={{ paddingLeft: `${8 + (g ? (depthOf(g, gates) + 1) * 12 : 0)}px` }}>{r.name}</th>
                    <td class="px-2 py-1">{r.stats.count.toLocaleString()}</td>
                    <td class="px-2 py-1">{pct(r.stats.pctParent)}</td>
                    <td class="px-2 py-1">{pct(r.stats.pctTotal)}</td>
                    <td class="px-2 py-1">{fmt(r.stats.mean)}</td>
                    <td class="px-2 py-1">{fmt(r.stats.median)}</td>
                    <td class="px-2 py-1">{fmt(r.stats.geoMean)}</td>
                    <td class="px-2 py-1">{pct(r.stats.cv)}</td>
                    <td class="px-2 py-1">{pct(r.stats.robustCv)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-300">Mean, median and CV use {data.compensationApplied ? 'compensated ' : ''}scale values in data units, not the display scale.</p>
      </div>
    </div>
  );

  return (
    <ToolLayout
      icon="🧬"
      title="Flow Cytometry (FCS)"
      blurb="Open an FCS file, pick axes, draw gates, and read population statistics. Everything stays on this device."
      wide
      mobileDefaultTab="inputs"
      mobileResultSummary={data ? <span>{data.eventCount.toLocaleString()} events · {gates.length} gate{gates.length === 1 ? '' : 's'}</span> : null}
      inputs={inputs}
      results={results}
      actions={<ActionBar onCopy={copyText} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
