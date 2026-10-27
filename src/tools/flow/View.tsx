import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  allGateStats, commonParameters, evaluateSampleGates, exampleSamples, exportGates, forward, importGates, inverse,
  makeSplitGates, maskCount, paramIndex, sampleGateStats, sampleName, samplesLacking, setSplitThreshold, sharedRange,
  splitBaseName, uniqueNames, DEFAULT_COFACTOR, EXAMPLE_SAMPLES, GateImportError,
  type FcsData, type FcsParameter, type Gate, type PopulationStats, type SampleGateResult, type ScaleKind, type ScaleSpec,
} from '@/core/flow';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { ImportAlert } from '@/app/components/ImportAlert';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { downloadBlob, downloadText, toCsv } from '@/lib/export';
import { importErrorMessage, readBinaryFile, readTextFile } from '@/lib/file-import';
import { FlowPlot, type GateField, type HistNorm, type Layer, type Shape, type Tool } from './FlowPlot';
import { SampleChart, METRIC_LABEL, type ChartMetric } from './SampleChart';
import { useParsedFiles, type FileSource } from './useParsedFiles';
import { SCIENCE } from './science';

const MAX_FCS_BYTES = 200 * 1024 * 1024;
const EXAMPLE_EVENTS = 20_000;
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';
const LABEL = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';
const BTN = 'rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';
const CARD = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
const H3 = 'text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300';
const NOTE = 'text-xs text-slate-600 dark:text-slate-300';
const FILE_INPUT = 'block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs dark:text-slate-300 dark:file:bg-slate-800';
/** Categorical sample colours, assigned in this order as samples are added (a sample keeps its colour). */
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const STATS = [['median', 'Median'], ['mean', 'Mean'], ['geoMean', 'Geometric mean'], ['cv', 'CV %'], ['robustCv', 'Robust CV %']] as const;
type StatKey = typeof STATS[number][0];

const isLinearByDefault = (name: string) => /^(FSC|SSC|TIME)/i.test(name);
const fmt = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 1e5 || (v !== 0 && Math.abs(v) < 0.01) ? v.toExponential(2) : String(+v.toPrecision(4))) : '—');
const pct = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const count = (v: number) => (Number.isFinite(v) ? v.toLocaleString() : '—');
const fixedBound = (v: number) => String(+v.toPrecision(6));
const csvNum = (v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? '' : v) as string | number;
const toggleClass = (on: boolean) => `rounded-lg border px-3 py-1.5 text-xs font-medium ${on ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-700'}`;

function depthOf(g: Gate, gates: Gate[]): number {
  let d = 0;
  for (let cur: Gate | undefined = g; cur && cur.parent !== null && d < 50; d++) cur = gates.find(x => x.id === cur!.parent);
  return d;
}

/** A loaded sample: a file (parsed in a worker) or one of the synthetic example samples. */
interface Entry { id: string; name: string; colorIndex: number; visible: boolean; file?: FileSource; exampleIndex?: number }
interface Sample { id: string; name: string; color: string; visible: boolean; data: FcsData }

function MiniPlot(props: Omit<Parameters<typeof FlowPlot>[0], 'canvasRef'>) {
  const ref = useRef<HTMLCanvasElement>(null);
  return <FlowPlot {...props} canvasRef={ref} compact />;
}

export default function FlowView() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [importError, setImportError] = useState('');
  const [compensate, setCompensate] = useState(true);
  const [cofactor, setCofactor] = useState(DEFAULT_COFACTOR);
  const [xSel, setXSel] = useState<string | null>(null);
  const [ySel, setYSel] = useState<string | null>(null);
  const [xKindSel, setXKindSel] = useState<ScaleKind | null>(null);
  const [yKindSel, setYKindSel] = useState<ScaleKind | null>(null);
  const [view, setView] = useState<'hist' | 'density' | 'dots'>('density');
  const [layout, setLayout] = useState<'overlay' | 'single'>('overlay');
  const [histNorm, setHistNorm] = useState<HistNorm>('mode');
  const [grid, setGrid] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toolSel, setToolSel] = useState<Tool>('rect');
  const [gates, setGates] = useState<Gate[]>([]);
  const [shownId, setShownId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [statSel, setStatSel] = useState<string | null>(null);
  const [breakdownSel, setBreakdownSel] = useState<string | null>(null);
  const [statKind, setStatKind] = useState<StatKey>('median');
  const [metric, setMetric] = useState<ChartMetric>('pctParent');
  const [gateError, setGateError] = useState('');
  const [gateWarnings, setGateWarnings] = useState<string[]>([]);
  const nextGate = useRef(1);
  const nextEntry = useRef(1);
  const nextColor = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const files = useMemo(() => entries.flatMap(e => (e.file ? [e.file] : [])), [entries]);
  const parsed = useParsedFiles(files, compensate);
  const hasExample = entries.some(e => e.exampleIndex !== undefined);
  const exampleData = useMemo(() => (hasExample ? exampleSamples(EXAMPLE_EVENTS, 7, compensate) : null), [hasExample, compensate]);

  // A file that fails to parse is dropped from the list and its error shown.
  useEffect(() => {
    const bad = entries.filter(e => e.file && parsed[e.id]?.error);
    if (bad.length === 0) return;
    setImportError(bad.map(e => `${e.name}: ${parsed[e.id]!.error}`).join(' '));
    setEntries(prev => prev.filter(e => !bad.some(b => b.id === e.id)));
  }, [parsed]);

  const samples = useMemo<Sample[]>(() => entries.flatMap(e => {
    const data = e.exampleIndex !== undefined ? exampleData?.[e.exampleIndex] : parsed[e.id]?.data;
    return data ? [{ id: e.id, name: e.name, color: COLORS[e.colorIndex % COLORS.length]!, visible: e.visible, data }] : [];
  }), [entries, exampleData, parsed]);
  const visible = useMemo(() => samples.filter(s => s.visible), [samples]);

  // Gate masks per parsed file, recomputed only when the file's data or the gate tree changes.
  const maskCache = useRef(new WeakMap<FcsData, { gates: Gate[]; result: SampleGateResult | null }>());
  const gateResult = (d: FcsData): SampleGateResult | null => {
    const hit = maskCache.current.get(d);
    if (hit && hit.gates === gates) return hit.result;
    let result: SampleGateResult | null;
    try { result = evaluateSampleGates(d, gates); } catch { result = null; }
    maskCache.current.set(d, { gates, result });
    return result;
  };
  const maskOf = (s: Sample, id: string | null) => (id === null ? null : gateResult(s.data)?.masks[id] ?? undefined);

  function resetView() {
    setGates([]); setShownId(null); setEditId(null); setBreakdownSel(null);
    setXSel(null); setYSel(null); setXKindSel(null); setYKindSel(null); setStatSel(null);
    setGateError(''); setGateWarnings([]);
    nextGate.current = 1; setImportError('');
  }
  async function addFiles(list: File[]) {
    const added: Entry[] = [];
    const errors: string[] = [];
    for (const file of list) {
      try {
        const bytes = await readBinaryFile(file, MAX_FCS_BYTES);
        const id = `f${nextEntry.current++}`;
        added.push({ id, name: file.name, colorIndex: nextColor.current++, visible: true, file: { id, bytes } });
      } catch (e) {
        errors.push(importErrorMessage(e, file.name));
      }
    }
    setImportError(errors.join(' '));
    if (added.length === 0) return;
    setEntries(prev => {
      // Real files replace the synthetic example rather than mixing with it.
      const kept = prev.filter(e => e.exampleIndex === undefined);
      const names = uniqueNames([...kept, ...added].map(e => e.name));
      return [...kept, ...added].map((e, i) => ({ ...e, name: names[i]! }));
    });
    if (hasExample) { resetView(); setActiveId(null); }
  }
  function loadExample() {
    resetView();
    nextColor.current = EXAMPLE_SAMPLES.length;
    setEntries(EXAMPLE_SAMPLES.map((s, i) => ({ id: `x${i}`, name: s.name, colorIndex: i, visible: true, exampleIndex: i })));
    setActiveId(null);
  }
  const setVisible = (id: string, on: boolean) => setEntries(prev => prev.map(e => (e.id === id ? { ...e, visible: on } : e)));
  const removeEntry = (id: string) => setEntries(prev => prev.filter(e => e.id !== id));

  // --- axes: parameters matched by $PnN across the visible samples
  const common = useMemo(() => commonParameters(visible.map(s => s.data)), [visible]);
  const paramInfo = (name: string): FcsParameter | undefined => {
    for (const s of visible.length ? visible : samples) { const p = s.data.parameters.find(q => q.name === name); if (p) return p; }
    return undefined;
  };
  const paramText = (name: string) => { const p = paramInfo(name); return p?.label ? `${name} (${p.label})` : name; };
  const known = (n: string | null) => n !== null && visible.some(s => paramIndex(s.data, n) >= 0);
  const xName = known(xSel) ? xSel! : common.find(n => /^FSC/i.test(n)) ?? common[0] ?? '';
  const yName = known(ySel) ? ySel! : common.find(n => /^SSC/i.test(n)) ?? common.find(n => n !== xName) ?? xName;
  const kindFor = (sel: ScaleKind | null, name: string): ScaleKind => sel ?? (isLinearByDefault(name) ? 'linear' : 'asinh');
  const scaleOf = (kind: ScaleKind): ScaleSpec => ({ kind, cofactor: cofactor > 0 ? cofactor : DEFAULT_COFACTOR, floor: 1 });
  const xScale = useMemo(() => scaleOf(kindFor(xKindSel, xName)), [xKindSel, xName, cofactor]);
  const yScale = useMemo(() => scaleOf(kindFor(yKindSel, yName)), [yKindSel, yName, cofactor]);
  const mode: 'hist' | 'scatter' = view === 'hist' ? 'hist' : 'scatter';
  const tool: Tool = mode === 'hist'
    ? (toolSel === 'none' || toolSel === 'split' ? toolSel : 'range')
    : toolSel === 'range' ? 'rect' : toolSel;

  // --- which samples are drawn
  const overlay = layout === 'overlay' && visible.length > 1;
  const active = visible.find(s => s.id === activeId) ?? visible[0] ?? null;
  const activeIdx = active ? visible.indexOf(active) : -1;
  const col = (s: Sample, name: string) => s.data.columns[paramIndex(s.data, name)];
  const hasAxes = (s: Sample) => paramIndex(s.data, xName) >= 0 && (mode === 'hist' || paramIndex(s.data, yName) >= 0);
  const plotted = overlay ? visible : active ? [active] : [];
  const xRange = useMemo(() => sharedRange(visible.flatMap(s => col(s, xName) ?? []), xScale), [visible, xName, xScale]);
  const yRange = useMemo(() => sharedRange(visible.flatMap(s => col(s, yName) ?? []), yScale), [visible, yName, yScale]);
  const layerFor = (s: Sample): Layer | null => {
    if (!hasAxes(s)) return null;
    const mask = maskOf(s, shownId);
    if (mask === undefined) return null;
    const xs = col(s, xName)!;
    return { key: s.id, label: s.name, color: s.color, xs, ys: mode === 'hist' ? xs : col(s, yName)!, mask };
  };
  const layers = useMemo(
    () => plotted.flatMap(s => layerFor(s) ?? []),
    [visible, overlay, active?.id, xName, yName, mode, shownId, gates],
  );
  const lackX = samplesLacking(visible.map(s => s.data), xName).map(i => visible[i]!.name);
  const lackY = mode === 'scatter' ? samplesLacking(visible.map(s => s.data), yName).map(i => visible[i]!.name) : [];
  const shownName = shownId ? gates.find(g => g.id === shownId)?.name ?? '' : '';
  const unevaluated = shownId ? visible.filter(s => hasAxes(s) && maskOf(s, shownId) === undefined).map(s => s.name) : [];

  // --- gates
  function newIds(k: number): string[] {
    const used = new Set(gates.map(g => g.id));
    const out: string[] = [];
    while (out.length < k) { const id = `g${nextGate.current++}`; if (!used.has(id)) out.push(id); }
    return out;
  }
  function addGate(shape: Shape) {
    if (!xName) return;
    if (shape.type === 'split') {
      const [a, b] = newIds(2) as [string, string];
      const pair = makeSplitGates([a, b], splitBaseName(paramInfo(xName) ?? { name: xName }), shownId, xName, xScale, shape.at);
      setGates(prev => [...prev, ...pair]);
      setEditId(a);
      return;
    }
    const [id] = newIds(1) as [string];
    const base = { id, name: `Gate ${id.slice(1)}`, parent: shownId };
    let g: Gate;
    if (shape.type === 'range') g = { ...base, type: 'range', param: xName, scale: xScale, min: shape.min, max: shape.max };
    else if (shape.type === 'rect') g = { ...base, type: 'rect', xParam: xName, yParam: yName, xScale, yScale, xMin: shape.xMin, xMax: shape.xMax, yMin: shape.yMin, yMax: shape.yMax };
    else g = { ...base, type: 'polygon', xParam: xName, yParam: yName, xScale, yScale, points: shape.points };
    setGates(prev => [...prev, g]);
    setEditId(g.id);
  }
  const quarter = (r: { min: number; max: number }) => [r.min + (r.max - r.min) * 0.25, r.min + (r.max - r.min) * 0.75] as const;
  function addDefaultGate() {
    if (mode === 'hist') { const [a, b] = quarter(xRange); addGate({ type: 'range', min: a, max: b }); }
    else { const [a, b] = quarter(xRange), [c, d] = quarter(yRange); addGate({ type: 'rect', xMin: a, xMax: b, yMin: c, yMax: d }); }
  }
  function removeGate(id: string) {
    const target = gates.find(g => g.id === id);
    const gone = new Set(gates.filter(g => g.id === id || (target?.type === 'split' && g.type === 'split' && g.pair === target.pair)).map(g => g.id));
    for (let changed = true; changed;) { changed = false; for (const g of gates) if (g.parent && gone.has(g.parent) && !gone.has(g.id)) { gone.add(g.id); changed = true; } }
    setGates(gates.filter(g => !gone.has(g.id)));
    if (shownId && gone.has(shownId)) setShownId(null);
    if (editId && gone.has(editId)) setEditId(null);
    if (breakdownSel && gone.has(breakdownSel)) setBreakdownSel(null);
  }
  function patchGate(id: string, patch: Partial<Gate>) {
    setGates(gates.map(g => (g.id === id ? ({ ...g, ...patch } as Gate) : g)));
  }
  function moveGate(id: string, field: GateField, value: number) {
    const g = gates.find(x => x.id === id);
    if (!g) return;
    if (g.type === 'split') { setGates(setSplitThreshold(gates, g.pair, value)); return; }
    if (g.type !== 'range') return;
    const next = { min: g.min, max: g.max, [field]: value };
    patchGate(id, { min: Math.min(next.min, next.max), max: Math.max(next.min, next.max) });
    setEditId(id);
  }
  function addDefaultSplit() {
    addGate({ type: 'split', at: (xRange.min + xRange.max) / 2 });
  }

  function downloadGates() {
    downloadText(JSON.stringify(exportGates(gates), null, 2), 'flow-gates.json', 'application/json');
  }
  async function loadGates(file: File) {
    setGateError(''); setGateWarnings([]);
    try {
      const text = await readTextFile(file);
      const res = importGates(text, samples.map(s => ({ name: s.name, parameters: s.data.parameters.map(p => p.name) })));
      setGates(res.gates);
      setShownId(null); setEditId(null); setBreakdownSel(null);
      const nums = res.gates.map(g => /^g(\d+)$/.exec(g.id)?.[1]).filter(Boolean).map(Number);
      nextGate.current = Math.max(1, ...nums.map(n => n + 1));
      setGateWarnings([`Loaded ${res.gates.length} gate${res.gates.length === 1 ? '' : 's'} from ${file.name}.`, ...res.warnings]);
    } catch (e) {
      setGateError(e instanceof GateImportError ? `${file.name}: ${e.message}` : importErrorMessage(e, file.name));
    }
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

  // --- statistics
  const statsSample = active;
  const statOptions = statsSample ? statsSample.data.parameters.map(p => p.name) : [];
  const statName = statSel && statOptions.includes(statSel) ? statSel : statOptions.includes(xName) ? xName : statOptions[0] ?? '';
  const statsMasks = statsSample ? gateResult(statsSample.data) : null;
  const rows = statsSample && statsMasks && statName
    ? allGateStats(statsSample.data.columns, gates, statsSample.data.eventCount, paramIndex(statsSample.data, statName), statsMasks.masks)
    : [];
  const skippedHere = statsMasks ? gates.filter(g => !statsMasks.masks[g.id]) : [];

  const breakdownId = (() => {
    const pick = breakdownSel ?? editId ?? gates[gates.length - 1]?.id ?? '';
    return pick !== '' && gates.some(g => g.id === pick) ? pick : null;
  })();
  const breakdownGate = gates.find(g => g.id === breakdownId) ?? null;
  const breakdownName = breakdownGate?.name ?? 'All events';
  const parentName = breakdownGate ? (breakdownGate.parent ? gates.find(g => g.id === breakdownGate.parent)?.name ?? '' : 'All events') : '';
  const perSample = visible.map(s => {
    const res = gateResult(s.data);
    const stats: PopulationStats | null = res ? sampleGateStats(s.data, gates, breakdownId, statName, res.masks) : null;
    return { s, stats, missing: breakdownId && res ? res.missing[breakdownId] ?? [] : [] };
  });
  const statLabel = STATS.find(([k]) => k === statKind)![1];
  const chartRows = perSample.map(({ s, stats }) => ({
    name: s.name, color: s.color, count: stats?.count ?? NaN, pctParent: stats?.pctParent ?? NaN, pctTotal: stats?.pctTotal ?? NaN,
  }));

  const statsHeader = ['Population', 'Parent', 'Events', '% of parent', '% of total', `Mean ${statName}`, 'Median', 'Geometric mean', 'CV %', 'Robust CV %'];
  const statsTable = () => rows.map(r => [r.name, r.parent ? gates.find(g => g.id === r.parent)?.name ?? '' : r.id ? 'All events' : '', r.stats.count, r.stats.pctParent, r.stats.pctTotal, r.stats.mean, r.stats.median, r.stats.geoMean, r.stats.cv, r.stats.robustCv]);
  const sampleHeader = ['Sample', 'Population', 'Parent', 'Events', '% of parent', '% of total', `${statLabel} ${statName}`];
  const sampleTable = () => perSample.map(({ s, stats }) => [s.name, breakdownName, parentName, stats?.count ?? NaN, stats?.pctParent ?? NaN, stats?.pctTotal ?? NaN, stats ? stats[statKind] : NaN]);
  const copyText = () => statsSample ? [
    `${statsSample.name}: ${statsSample.data.eventCount.toLocaleString()} events, statistics for ${paramText(statName)}`,
    statsHeader.join('\t'), ...statsTable().map(r => r.join('\t')), '',
    `${breakdownName} per sample`, sampleHeader.join('\t'), ...sampleTable().map(r => r.join('\t')), '',
    scienceText(SCIENCE),
  ].join('\n') : '';
  const exportCsv = () => downloadText(toCsv([statsHeader, ...statsTable().map(r => r.map(csvNum))]), 'flow-statistics.csv', 'text/csv;charset=utf-8');
  const exportSampleCsv = () => downloadText(toCsv([sampleHeader, ...sampleTable().map(r => r.map(csvNum))]), 'flow-per-sample.csv', 'text/csv;charset=utf-8');
  const exportPng = () => canvasRef.current?.toBlob(b => { if (b) downloadBlob(b, 'flow-plot.png'); }, 'image/png');

  // --- plot description
  const plotKind = mode === 'hist' ? `Histogram of ${paramText(xName)} on a ${xScale.kind} scale`
    : `${overlay || view === 'dots' ? 'Dot' : 'Density'} plot of ${paramText(yName)} against ${paramText(xName)}`;
  const who = overlay
    ? `, overlay of ${layers.length} samples coloured by sample (${layers.map(l => l.label).join(', ')})${mode === 'hist' ? `, each normalised to ${histNorm === 'mode' ? 'its mode' : '% of its events'}` : ''}`
    : active ? `, sample ${active.name}` : '';
  const gateCounts = !overlay && active
    ? gates.map(g => { const m = maskOf(active, g.id); return `${g.name} ${m ? maskCount(m).toLocaleString() + ' events' : 'not evaluated'}`; }).join('; ')
    : gates.map(g => g.name).join('; ');
  const ariaLabel = `${plotKind}${who}, ${shownId ? `${shownName} population` : 'all events'}. ${gates.length ? `Gates: ${gateCounts}.` : 'No gates drawn.'}`;

  const busy = entries.some(e => e.file && parsed[e.id]?.busy);
  const paramSelect = (label: string, value: string, options: string[], onChange: (n: string) => void) => (
    <label class="block">
      <span class={LABEL}>{label}</span>
      <select aria-label={label} class={FIELD} value={value} onChange={e => onChange((e.currentTarget as HTMLSelectElement).value)}>
        {(options.includes(value) || !value ? options : [...options, value]).map(n => <option value={n}>{paramText(n)}</option>)}
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
  const sampleSelect = (label: string) => (
    <label class="block">
      <span class={LABEL}>{label}</span>
      <select aria-label={label} class={FIELD} value={active?.id ?? ''} onChange={e => setActiveId((e.currentTarget as HTMLSelectElement).value)}>
        {visible.map(s => <option value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
  const withComp = samples.filter(s => s.data.compensation).length;

  const inputs = (
    <div class="space-y-4">
      <div class={CARD}>
        <h3 class={H3}>1. Open files</h3>
        <label class="block">
          <span class={LABEL}>FCS files (2.0, 3.0 or 3.1, up to 200 MB each). Pick several at once or add more later.</span>
          <input
            type="file" multiple accept=".fcs,.FCS" aria-label="Choose FCS files" class={FILE_INPUT}
            onChange={e => { const input = e.currentTarget as HTMLInputElement; const list = Array.from(input.files ?? []); input.value = ''; if (list.length) void addFiles(list); }}
          />
        </label>
        <button type="button" class={BTN} onClick={loadExample}>Load example (synthetic data, 4 samples)</button>
        <p class={NOTE}>Files are read on this device and never uploaded.</p>
        <ImportAlert message={importError} />
        {busy && <p role="status" class={NOTE}>Reading files…</p>}
        {samples.length > 0 && (
          <div>
            <h4 class="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Samples</h4>
            <ul aria-label="Samples" class="space-y-1">
              {samples.map(s => (
                <li class="flex items-center gap-2 text-xs">
                  <span aria-hidden="true" class="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                  <label class="flex min-w-0 flex-1 items-center gap-2 text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={s.visible} aria-label={`Show ${s.name}`} onChange={e => setVisible(s.id, (e.currentTarget as HTMLInputElement).checked)} />
                    <span class="truncate" title={s.name}>{s.name}</span>
                  </label>
                  <span class="shrink-0 font-mono text-slate-600 dark:text-slate-300">{s.data.eventCount.toLocaleString()}</span>
                  <button type="button" aria-label={`Remove ${s.name}`} class="shrink-0 rounded px-1.5 py-0.5 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40" onClick={() => removeEntry(s.id)}>Remove</button>
                </li>
              ))}
            </ul>
            <p class={`mt-1 ${NOTE}`}>Unticked samples are left out of the plots, the per-sample table and the chart.</p>
          </div>
        )}
      </div>

      {visible.length > 0 && (
        <div class={CARD}>
          <h3 class={H3}>2. Pick axes</h3>
          {paramSelect('X parameter', xName, common, n => { setXSel(n); setXKindSel(null); setStatSel(null); })}
          {view !== 'hist' && paramSelect('Y parameter', yName, common, n => { setYSel(n); setYKindSel(null); })}
          {visible.length > 1 && <p class={NOTE}>Parameters are matched across samples by their $PnN name; only those in every shown sample are offered.</p>}
          <div role="group" aria-label="Plot type" class="flex flex-wrap gap-2">
            {([['density', '2-D density'], ['dots', 'Dots'], ['hist', 'Histogram']] as const).map(([v, l]) => (
              <button type="button" aria-pressed={view === v} onClick={() => setView(v)} class={toggleClass(view === v)}>{l}</button>
            ))}
          </div>
          {overlay && view === 'density' && <p class={NOTE}>Overlays draw 2-D data as dots coloured by sample (density colours cannot show several samples at once).</p>}
          <details class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <summary class="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">Advanced options</summary>
            <div class="mt-3 space-y-3">
              <label class="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" aria-label="Apply compensation" checked={compensate && withComp > 0} disabled={withComp === 0} onChange={e => setCompensate((e.currentTarget as HTMLInputElement).checked)} class="mt-0.5" />
                <span>
                  Apply compensation
                  <span class="block text-slate-600 dark:text-slate-300">
                    {withComp === 0 ? 'No loaded file has a compensation matrix.'
                      : `${withComp} of ${samples.length} sample${samples.length === 1 ? '' : 's'} carr${withComp === 1 ? 'ies' : 'y'} a matrix; each file uses its own. Event × inverse(spillover).`}
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
          {active && (
            <>
              <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                <dt>Sample</dt><dd class="break-all font-medium">{active.name}</dd>
                <dt>Events</dt><dd class="font-medium">{active.data.eventCount.toLocaleString()}</dd>
                <dt>Parameters</dt><dd class="font-medium">{active.data.parameters.length}</dd>
                <dt>Format</dt><dd class="font-medium">{active.data.version}</dd>
                {active.data.meta.cytometer && (<><dt>Cytometer</dt><dd class="font-medium">{active.data.meta.cytometer}</dd></>)}
                {active.data.meta.date && (<><dt>Date</dt><dd class="font-medium">{active.data.meta.date}{active.data.meta.beginTime ? ` ${active.data.meta.beginTime}` : ''}</dd></>)}
                {!hasExample && sampleName(active.data) !== active.name && (<><dt>$SMNO / $FIL</dt><dd class="break-all font-medium">{sampleName(active.data)}</dd></>)}
              </dl>
              {active.data.warnings.map(w => <p class="text-xs text-amber-800 dark:text-amber-300">{w}</p>)}
            </>
          )}
        </div>
      )}
    </div>
  );

  const toolOptions: [Tool, string][] = mode === 'hist'
    ? [['range', 'Range'], ['split', 'Split'], ['none', 'No drawing']]
    : [['rect', 'Rectangle'], ['polygon', 'Polygon'], ['split', 'Split left/right'], ['none', 'No drawing']];
  const plotProps = {
    mode, view: (view === 'dots' ? 'dots' : 'density') as 'dots' | 'density', histNorm,
    xScale, yScale, xRange, yRange, xLabel: paramText(xName), yLabel: paramText(yName), xParam: xName, yParam: yName, gates,
  };

  const results = samples.length === 0 ? (
    <div class={CARD}>
      <p class="text-sm text-slate-600 dark:text-slate-300">Open one or more FCS files, or load the synthetic example, to plot events, draw gates and compare populations across samples.</p>
    </div>
  ) : visible.length === 0 ? (
    <div class={CARD}><p class="text-sm text-slate-600 dark:text-slate-300">Every sample is hidden. Tick a sample in the list to plot it.</p></div>
  ) : (
    <div class="space-y-4">
      <div class={CARD}>
        <div class="flex flex-wrap items-end gap-3">
          {visible.length > 1 && (
            <div role="group" aria-label="Samples view" class="flex flex-wrap gap-2">
              <button type="button" aria-pressed={layout === 'overlay'} onClick={() => setLayout('overlay')} class={toggleClass(layout === 'overlay')}>All samples</button>
              <button type="button" aria-pressed={layout === 'single'} onClick={() => setLayout('single')} class={toggleClass(layout === 'single')}>Per sample</button>
            </div>
          )}
          {!overlay && visible.length > 1 && (
            <div class="flex flex-wrap items-end gap-2">
              <button type="button" class={BTN} disabled={activeIdx <= 0} onClick={() => setActiveId(visible[activeIdx - 1]!.id)}>Previous sample</button>
              {sampleSelect('Sample shown')}
              <button type="button" class={BTN} disabled={activeIdx >= visible.length - 1} onClick={() => setActiveId(visible[activeIdx + 1]!.id)}>Next sample</button>
            </div>
          )}
          {overlay && mode === 'hist' && (
            <div role="group" aria-label="Overlay histogram scale" class="flex flex-wrap gap-2">
              <button type="button" aria-pressed={histNorm === 'mode'} onClick={() => setHistNorm('mode')} class={toggleClass(histNorm === 'mode')}>% of mode</button>
              <button type="button" aria-pressed={histNorm === 'percent'} onClick={() => setHistNorm('percent')} class={toggleClass(histNorm === 'percent')}>% of events</button>
            </div>
          )}
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <label class="block">
            <span class={LABEL}>Population shown</span>
            <select aria-label="Population shown" class={FIELD} value={shownId ?? ''} onChange={e => setShownId((e.currentTarget as HTMLSelectElement).value || null)}>
              <option value="">All events</option>
              {gates.map(g => <option value={g.id}>{'· '.repeat(depthOf(g, gates))}{g.name}</option>)}
            </select>
          </label>
          <div role="group" aria-label="Drawing tool" class="flex flex-wrap gap-2">
            {toolOptions.map(([v, l]) => (
              <button type="button" aria-pressed={tool === v} onClick={() => setToolSel(v)} class={toggleClass(tool === v)}>{l}</button>
            ))}
          </div>
        </div>
        <p class={NOTE}>
          {tool === 'none' ? 'Drawing is off, so touch scrolling works over the plot.'
            : tool === 'polygon' ? 'Tap or click to add corners; tap the first corner or press Finish polygon to close it.'
            : tool === 'split' ? `Click where the threshold goes: events left of it become ${splitBaseName(paramInfo(xName) ?? { name: xName })}−, the rest ${splitBaseName(paramInfo(xName) ?? { name: xName })}+.`
            : mode === 'hist' ? 'Drag across the plot to gate a range.' : 'Drag across the plot to draw a rectangle.'}
          {' '}Drag a split line or a range edge to move it. New gates are children of {shownId ? shownName : 'All events'} and apply to every sample.
        </p>
        <FlowPlot
          {...plotProps} overlay={overlay} layers={layers} tool={tool} onCreate={addGate} onMoveGate={moveGate}
          ariaLabel={ariaLabel} canvasRef={canvasRef}
        />
        {overlay && (
          <ul aria-label="Sample colours" class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-200">
            {layers.map(l => <li class="flex items-center gap-1.5"><span aria-hidden="true" class="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{l.label}</li>)}
          </ul>
        )}
        {(lackX.length > 0 || lackY.length > 0) && (
          <p class="text-xs text-amber-800 dark:text-amber-300">
            {lackX.length > 0 && `${xName} is not in ${lackX.join(', ')}. `}
            {lackY.length > 0 && `${yName} is not in ${lackY.join(', ')}. `}
            {lackX.length + lackY.length > 0 && 'Those samples are left out of this plot.'}
          </p>
        )}
        {unevaluated.length > 0 && <p class="text-xs text-amber-800 dark:text-amber-300">{shownName} cannot be evaluated on {unevaluated.join(', ')} (a gate parameter is missing), so they are left out.</p>}
        {overlay && mode === 'scatter' && <p class={NOTE}>At most {(20_000).toLocaleString()} evenly spaced events are drawn per sample.</p>}
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class={BTN} onClick={exportPng}>Download plot (PNG)</button>
          {!overlay && visible.length > 1 && (
            <label class="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={grid} onChange={e => setGrid((e.currentTarget as HTMLInputElement).checked)} />
              Show every sample side by side
            </label>
          )}
        </div>
        {!overlay && grid && visible.length > 1 && (
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visible.map(s => {
              const l = layerFor(s);
              return (
                <figure class="min-w-0">
                  <figcaption class="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                    <span aria-hidden="true" class="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}
                  </figcaption>
                  {l ? (
                    <MiniPlot {...plotProps} layers={[l]} tool="none" ariaLabel={`${plotKind}, sample ${s.name}, ${shownId ? `${shownName} population` : 'all events'}.`} />
                  ) : <p class={NOTE}>Not plotted: a parameter or gate is missing from this sample.</p>}
                </figure>
              );
            })}
          </div>
        )}
      </div>

      <div class={CARD}>
        <h3 class={H3}>Gates</h3>
        {gates.length === 0 && <p class={NOTE}>No gates yet. Draw one on the plot, or add one and type its bounds. Gates apply to every sample.</p>}
        <div class="flex flex-wrap items-end gap-3">
          <button type="button" class={BTN} onClick={addDefaultGate}>{mode === 'hist' ? 'Add range gate' : 'Add rectangle gate'} (centre half of the axes)</button>
          <button type="button" class={BTN} onClick={addDefaultSplit}>Add split gate on {xName}</button>
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
            <p class={NOTE}>
              {edit.type === 'range' && `Range on ${paramText(String(edit.param))}.`}
              {edit.type === 'rect' && `Rectangle on ${paramText(String(edit.xParam))} and ${paramText(String(edit.yParam))}.`}
              {edit.type === 'polygon' && `Polygon with ${edit.points.length} corners on ${paramText(String(edit.xParam))} and ${paramText(String(edit.yParam))}. Redraw it to change its shape.`}
              {edit.type === 'split' && (() => {
                const halves = gates.filter(g => g.type === 'split' && g.pair === edit.pair);
                const left = halves.find(g => g.type === 'split' && g.side === 'left')?.name ?? 'left', right = halves.find(g => g.type === 'split' && g.side === 'right')?.name ?? 'right';
                return `Split on ${paramText(String(edit.param))}: ${left} holds events below the threshold, ${right} those at or above it. Changing the threshold or dragging the line moves both.`;
              })()}
              {' '}Bounds are in data units.
            </p>
            {edit.type === 'range' && (
              <div class="grid grid-cols-2 gap-3">
                {boundField('Minimum', edit.min, edit.scale, v => patchGate(edit.id, { min: v }))}
                {boundField('Maximum', edit.max, edit.scale, v => patchGate(edit.id, { max: v }))}
              </div>
            )}
            {edit.type === 'split' && boundField('Threshold', edit.threshold, edit.scale, v => setGates(setSplitThreshold(gates, edit.pair, v)))}
            {edit.type === 'rect' && (
              <div class="grid grid-cols-2 gap-3">
                {boundField('X minimum', edit.xMin, edit.xScale, v => patchGate(edit.id, { xMin: v }))}
                {boundField('X maximum', edit.xMax, edit.xScale, v => patchGate(edit.id, { xMax: v }))}
                {boundField('Y minimum', edit.yMin, edit.yScale, v => patchGate(edit.id, { yMin: v }))}
                {boundField('Y maximum', edit.yMax, edit.yScale, v => patchGate(edit.id, { yMax: v }))}
              </div>
            )}
            <button type="button" class="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-800 dark:text-rose-300" onClick={() => removeGate(edit.id)}>
              {edit.type === 'split' ? 'Delete both halves and their children' : 'Delete gate and its children'}
            </button>
          </div>
        )}
        <div class="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <button type="button" class={BTN} disabled={gates.length === 0} onClick={downloadGates}>Download gates (JSON)</button>
          <label class="block">
            <span class={LABEL}>Re-apply gates from a JSON file (replaces the current gates)</span>
            <input
              type="file" accept=".json,application/json" aria-label="Load gates from JSON" class={FILE_INPUT}
              onChange={e => { const input = e.currentTarget as HTMLInputElement; const f = input.files?.[0]; input.value = ''; if (f) void loadGates(f); }}
            />
          </label>
          <ImportAlert message={gateError} />
          {gateWarnings.length > 0 && (
            <div role="status" class="text-xs text-slate-700 dark:text-slate-300">
              <ul class="list-disc space-y-0.5 pl-4">{gateWarnings.map(w => <li>{w}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      <div class={CARD}>
        <div class="flex flex-wrap items-end justify-between gap-3">
          <h3 class={H3}>Population statistics{statsSample ? ` · ${statsSample.name}` : ''}</h3>
          <div class="flex flex-wrap items-end gap-2">
            {visible.length > 1 && sampleSelect('Statistics sample')}
            {paramSelect('Statistics parameter', statName, statOptions, setStatSel)}
            <button type="button" class={BTN} onClick={exportCsv}>Export CSV</button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[40rem] text-left text-xs">
            <caption class="sr-only">Event counts and statistics of {paramText(statName)} for each population in {statsSample?.name}</caption>
            <thead class="text-slate-600 dark:text-slate-300">
              <tr>{['Population', 'Events', '% parent', '% total', 'Mean', 'Median', 'Geo mean', 'CV %', 'rCV %'].map(h => <th scope="col" class="px-2 py-1 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody class="font-mono">
              {rows.map(r => {
                const g = gates.find(x => x.id === r.id);
                return (
                  <tr class="border-t border-slate-200 dark:border-slate-800">
                    <th scope="row" class="px-2 py-1 text-left font-sans font-medium" style={{ paddingLeft: `${8 + (g ? (depthOf(g, gates) + 1) * 12 : 0)}px` }}>{r.name}</th>
                    <td class="px-2 py-1">{count(r.stats.count)}</td>
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
        {skippedHere.length > 0 && <p class="text-xs text-amber-800 dark:text-amber-300">Not evaluated on this sample (a parameter is missing): {skippedHere.map(g => g.name).join(', ')}.</p>}
        <p class={NOTE}>Mean, median and CV use {statsSample?.data.compensationApplied ? 'compensated ' : ''}scale values in data units, not the display scale.</p>
      </div>

      <div class={CARD}>
        <div class="flex flex-wrap items-end justify-between gap-3">
          <h3 class={H3}>Per sample · {breakdownName}</h3>
          <div class="flex flex-wrap items-end gap-2">
            <label class="block">
              <span class={LABEL}>Population compared</span>
              <select aria-label="Population compared" class={FIELD} value={breakdownId ?? ''} onChange={e => setBreakdownSel((e.currentTarget as HTMLSelectElement).value)}>
                <option value="">All events</option>
                {gates.map(g => <option value={g.id}>{'· '.repeat(depthOf(g, gates))}{g.name}</option>)}
              </select>
            </label>
            <label class="block">
              <span class={LABEL}>Statistic</span>
              <select aria-label="Per-sample statistic" class={FIELD} value={statKind} onChange={e => setStatKind((e.currentTarget as HTMLSelectElement).value as StatKey)}>
                {STATS.map(([k, l]) => <option value={k}>{l} of {statName}</option>)}
              </select>
            </label>
            <button type="button" class={BTN} onClick={exportSampleCsv}>Export per-sample CSV</button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[32rem] text-left text-xs">
            <caption class="sr-only">{breakdownName} in each sample: events, percentages and {statLabel.toLowerCase()} of {statName}</caption>
            <thead class="text-slate-600 dark:text-slate-300">
              <tr>{['Sample', 'Events', '% parent', '% total', `${statLabel} ${statName}`].map(h => <th scope="col" class="px-2 py-1 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody class="font-mono">
              {perSample.map(({ s, stats, missing }) => (
                <tr class="border-t border-slate-200 dark:border-slate-800">
                  <th scope="row" class="px-2 py-1 text-left font-sans font-medium">
                    <span class="flex items-center gap-1.5"><span aria-hidden="true" class="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />{s.name}</span>
                  </th>
                  {stats ? (
                    <>
                      <td class="px-2 py-1">{count(stats.count)}</td>
                      <td class="px-2 py-1">{pct(stats.pctParent)}</td>
                      <td class="px-2 py-1">{pct(stats.pctTotal)}</td>
                      <td class="px-2 py-1">{statKind === 'cv' || statKind === 'robustCv' ? pct(stats[statKind]) : fmt(stats[statKind])}</td>
                    </>
                  ) : <td colSpan={4} class="px-2 py-1 font-sans text-slate-600 dark:text-slate-300">Not evaluated{missing.length ? `: no ${missing.join(', ')}` : ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div role="group" aria-label="Bar chart value" class="flex flex-wrap gap-2">
          {(['pctParent', 'pctTotal', 'count'] as const).map(m => (
            <button type="button" aria-pressed={metric === m} onClick={() => setMetric(m)} class={toggleClass(metric === m)}>{METRIC_LABEL[m]}</button>
          ))}
        </div>
        <SampleChart rows={chartRows} metric={metric} population={breakdownName} />
        <p class={NOTE}>Hover a bar for its count and both percentages. {breakdownGate ? `Parent: ${parentName}.` : ''}</p>
      </div>
    </div>
  );

  return (
    <ToolLayout
      icon="🧬"
      title="Flow Cytometry (FCS)"
      blurb="Open one or many FCS files, overlay or step through samples, draw gates once for all of them, and compare populations across samples. Everything stays on this device."
      wide
      mobileDefaultTab="inputs"
      mobileResultSummary={samples.length ? <span>{samples.length} sample{samples.length === 1 ? '' : 's'} · {gates.length} gate{gates.length === 1 ? '' : 's'}</span> : null}
      inputs={inputs}
      results={results}
      actions={<ActionBar onCopy={copyText} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
