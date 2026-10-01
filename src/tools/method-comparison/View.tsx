import { useMemo, useRef, useState } from 'preact/hooks';
import { ImportAlert } from '@/app/components/ImportAlert';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import {
  blandAltman, parsePairedColumns, proportionalBiasNote, type BlandAltmanResult, type DifferenceMode, type Interval,
} from '@/core/method-comparison';
import { useDraftText } from '@/lib/drafts';
import { downloadBlob, downloadText, svgToPngBlob, toCsv } from '@/lib/export';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { SCIENCE } from './science';

const EXAMPLE = `Lab,Meter
4.2,4.5
5.1,5.0
5.8,6.2
6.4,6.3
7.0,7.5
7.7,7.6
8.3,8.9
9.0,9.2
9.6,9.5
10.2,10.9
10.9,11.0
11.5,12.1
12.1,12.0
12.8,13.4
13.4,13.9
14.0,14.3
14.7,15.5
15.3,15.4
16.0,16.8
16.6,17.1
17.2,17.0
17.9,18.9
18.5,19.2
19.3,19.9`;

const MODES: Record<DifferenceMode, string> = {
  raw: 'Raw difference (A − B)',
  percent: 'Percent difference (of the pair mean)',
  log: 'Log-transformed (ratio A / B)',
};
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const BUTTON = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700';
const MUTED = 'text-sm text-slate-600 dark:text-slate-300';

const num = (value: number, digits = 4) => String(Number(value.toPrecision(digits)));
const ci = (i: Interval, digits = 3) => `95% CI ${num(i.lower, digits)} to ${num(i.upper, digits)}`;

function niceTicks(min: number, max: number, target = 6): number[] {
  const span = max - min || 1;
  const rough = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map(m => m * magnitude).find(s => s >= rough) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

const W = 640, H = 400, ML = 60, MR = 20, MT = 16, MB = 48;

function BlandAltmanPlot({ result, labelA, labelB, svgRef }: {
  result: BlandAltmanResult; labelA: string; labelB: string; svgRef: { current: SVGSVGElement | null };
}) {
  const xs = result.means;
  const yValues = [...result.differences, result.lowerLimit.lower, result.upperLimit.upper];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const xPad = (x1 - x0 || 1) * 0.05;
  const [y0, y1] = [Math.min(...yValues), Math.max(...yValues)];
  const yPad = (y1 - y0 || 1) * 0.06;
  const xLo = x0 - xPad, xHi = x1 + xPad, yLo = y0 - yPad, yHi = y1 + yPad;
  const px = (x: number) => ML + (x - xLo) / (xHi - xLo) * (W - ML - MR);
  const py = (y: number) => H - MB - (y - yLo) / (yHi - yLo) * (H - MT - MB);
  const band = (i: Interval, fill: string) =>
    <rect x={ML} width={W - ML - MR} y={py(i.upper)} height={Math.max(0, py(i.lower) - py(i.upper))} fill={fill} opacity="0.22" />;
  const yLabel = result.mode === 'percent' ? `${labelA} − ${labelB} (% of mean)`
    : result.mode === 'log' ? `ln(${labelA}) − ln(${labelB})` : `${labelA} − ${labelB}`;
  const line = (value: number, label: string, dash?: string) => <g>
    <line x1={ML} x2={W - MR} y1={py(value)} y2={py(value)} stroke="#1e293b" stroke-width="1.5" stroke-dasharray={dash} />
    <text x={W - MR - 4} y={py(value) - 4} text-anchor="end" font-size="11" fill="#334155">{label} {num(value, 3)}</text>
  </g>;
  return <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" class="h-auto w-full rounded-lg border border-slate-200 dark:border-slate-700"
    aria-label={`Bland–Altman plot of ${result.n} pairs: difference against mean with bias ${num(result.bias.estimate, 3)} and limits of agreement ${num(result.lowerLimit.estimate, 3)} to ${num(result.upperLimit.estimate, 3)}`}>
    <rect width={W} height={H} fill="#ffffff" />
    {band(result.bias, '#2563eb')}{band(result.upperLimit, '#d97706')}{band(result.lowerLimit, '#d97706')}
    {niceTicks(yLo, yHi).map(v => <g key={`y${v}`}>
      <line x1={ML - 4} x2={ML} y1={py(v)} y2={py(v)} stroke="#475569" />
      <text x={ML - 8} y={py(v) + 4} text-anchor="end" font-size="11" fill="#334155">{num(v, 3)}</text>
    </g>)}
    {niceTicks(xLo, xHi).map(v => <g key={`x${v}`}>
      <line x1={px(v)} x2={px(v)} y1={H - MB} y2={H - MB + 4} stroke="#475569" />
      <text x={px(v)} y={H - MB + 18} text-anchor="middle" font-size="11" fill="#334155">{num(v, 3)}</text>
    </g>)}
    <line x1={ML} x2={ML} y1={MT} y2={H - MB} stroke="#475569" />
    <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} stroke="#475569" />
    {result.means.map((m, i) => <circle key={i} cx={px(m)} cy={py(result.differences[i]!)} r="3.5" fill="#0f766e" fill-opacity="0.75" stroke="#ffffff" stroke-width="0.8" />)}
    {line(result.bias.estimate, 'Bias')}
    {line(result.upperLimit.estimate, 'Upper limit', '6 4')}
    {line(result.lowerLimit.estimate, 'Lower limit', '6 4')}
    <text x={(ML + W - MR) / 2} y={H - 8} text-anchor="middle" font-size="12" fill="#334155">Mean of {labelA} and {labelB}</text>
    <text transform={`translate(14 ${(MT + H - MB) / 2}) rotate(-90)`} text-anchor="middle" font-size="12" fill="#334155">{yLabel}</text>
  </svg>;
}

function Headline({ title, interval, unit, ratio }: { title: string; interval: Interval; unit: string; ratio?: Interval }) {
  const shown = ratio ?? interval;
  return <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <dt class="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</dt>
    <dd class="mt-1 font-mono text-2xl font-semibold">{num(shown.estimate, 4)}{ratio ? ' ×' : unit}</dd>
    <dd class="text-xs text-slate-600 dark:text-slate-300">{ci(shown)}</dd>
    {ratio && <dd class="text-xs text-slate-600 dark:text-slate-300">ln scale {num(interval.estimate, 4)}</dd>}
  </div>;
}

export default function MethodComparison() {
  const [text, setText] = useDraftText('method-comparison:data', () => '');
  const [mode, setMode] = useState<DifferenceMode>('raw');
  const [importError, setImportError] = useState('');
  const [message, setMessage] = useState('');
  const svgRef = useRef<SVGSVGElement | null>(null);

  const analysis = useMemo(() => {
    if (!text.trim()) return { idle: true as const };
    try {
      const parsed = parsePairedColumns(text);
      const result = blandAltman(parsed.a, parsed.b, mode);
      return { parsed, result, note: proportionalBiasNote(result) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to analyse this data.' };
    }
  }, [text, mode]);
  const parsed = 'parsed' in analysis ? analysis.parsed : undefined;
  const result = 'result' in analysis ? analysis.result : undefined;
  const note = 'note' in analysis ? analysis.note : undefined;
  const unit = mode === 'percent' ? ' %' : '';
  const labelA = parsed?.labelA ?? 'Method A', labelB = parsed?.labelB ?? 'Method B';

  function exportCsv() {
    if (!result || !parsed) return;
    const row = (name: string, i: Interval) => [name, i.estimate, i.lower, i.upper];
    const rows: (string | number)[][] = [
      ['Bland-Altman', MODES[mode]], ['Pairs', result.n], ['SD of differences', result.sd],
      ['Quantity', 'Estimate', '95% CI lower', '95% CI upper'],
      row('Bias', result.bias), row('Lower limit of agreement', result.lowerLimit), row('Upper limit of agreement', result.upperLimit),
      ...(result.ratios ? [row('Bias (ratio A/B)', result.ratios.bias), row('Lower limit (ratio A/B)', result.ratios.lowerLimit), row('Upper limit (ratio A/B)', result.ratios.upperLimit)] : []),
      ...(result.slope ? [['Slope of difference on mean', result.slope.estimate, 'p-value', result.slope.p]] : []),
      [],
      [parsed.labelA, parsed.labelB, 'Mean', 'Difference'],
      ...parsed.a.map((v, i) => [v, parsed.b[i]!, result.means[i]!, result.differences[i]!]),
    ];
    downloadText(toCsv(rows), 'bland-altman.csv', 'text/csv;charset=utf-8');
  }

  async function exportPng() {
    if (!svgRef.current) return;
    try { downloadBlob(await svgToPngBlob(svgRef.current, 3), 'bland-altman.png'); setMessage('Plot saved as PNG'); }
    catch { setMessage('PNG export failed in this browser. Try the CSV export instead.'); }
  }

  const status = 'idle' in analysis ? undefined : 'error' in analysis ? analysis.error : undefined;
  return <ToolLayout icon="📉" title="Method Comparison (Bland–Altman)"
    blurb="Compare two measurement methods on the same samples: bias, 95% limits of agreement, and a difference plot. Everything stays in your browser."
    mobileDefaultTab="stacked"
    inputs={<div class="space-y-4">
      <div class="space-y-1">
        <div class="flex items-center justify-between gap-2">
          <label for="method-data" class="block text-sm font-medium">Paired measurements (two columns: method A, method B)</label>
          <button type="button" class="text-sm text-accent-700 underline dark:text-accent-300"
            onClick={() => { setText(EXAMPLE, { persist: false }); setImportError(''); setMessage(''); }}>Load example</button>
        </div>
        <textarea id="method-data" class={`${FIELD} font-mono text-xs`} rows={10} value={text} spellcheck={false}
          placeholder={'Paste CSV, TSV or space-separated values, one pair per row.\nAn optional header row names the methods.'}
          onInput={event => { setText(event.currentTarget.value); setImportError(''); setMessage(''); }} />
        <label class="mt-1 block text-xs text-slate-600 dark:text-slate-300">Or import a CSV/TSV/TXT file
          <input type="file" aria-label="Paired measurements file" accept=".csv,.tsv,.txt" class="mt-1 block text-xs"
            onChange={event => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              input.value = '';
              if (!file) return;
              readTextFile(file).then(content => { setText(content); setImportError(''); setMessage(''); })
                .catch(error => setImportError(importErrorMessage(error, file.name)));
            }} />
        </label>
        <ImportAlert message={importError} />
        {parsed?.notes.map(note => <p key={note} class="text-xs text-slate-600 dark:text-slate-300">{note}</p>)}
      </div>
      <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <summary class="cursor-pointer text-sm font-semibold">Options</summary>
        <div class="mt-3 space-y-1">
          <label for="method-mode" class="block text-sm font-medium">Difference type</label>
          <select id="method-mode" class={FIELD} value={mode}
            onChange={event => setMode(event.currentTarget.value as DifferenceMode)}>
            {Object.entries(MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <p class={MUTED}>Use percent or log when the spread of differences grows with the size of the measurement.</p>
        </div>
      </details>
    </div>}
    results={<div class="space-y-4" aria-live="polite">
      {'idle' in analysis && <p class={MUTED}>Paste two columns of paired measurements, or load the example, to see the agreement between methods.</p>}
      {status && <div role="alert" class="rounded-lg border border-rose-300 p-3 text-sm text-rose-800 dark:border-rose-800 dark:text-rose-200">
        <p class="font-semibold">Cannot analyse yet</p>{status}
      </div>}
      {result && parsed && note && <>
        <p class={MUTED}>{result.n} pairs, difference = {labelA} − {labelB}{mode === 'percent' ? ', as a percentage of the pair mean' : mode === 'log' ? ', on the log scale' : ''}. SD of differences {num(result.sd)}{unit}.</p>
        <dl class="grid gap-3 sm:grid-cols-3">
          <Headline title="Bias (mean difference)" interval={result.bias} unit={unit} ratio={result.ratios?.bias} />
          <Headline title="Lower limit of agreement" interval={result.lowerLimit} unit={unit} ratio={result.ratios?.lowerLimit} />
          <Headline title="Upper limit of agreement" interval={result.upperLimit} unit={unit} ratio={result.ratios?.upperLimit} />
        </dl>
        <BlandAltmanPlot result={result} labelA={labelA} labelB={labelB} svgRef={svgRef} />
        <p class="text-xs text-slate-600 dark:text-slate-300">Shaded bands are the 95% confidence intervals of the bias (blue) and of each limit of agreement (amber).</p>
        <p role="note" class={`rounded-lg p-3 text-sm ${note.flagged ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{note.text}</p>
        {result.warnings.map(warning => <p key={warning} class="text-sm text-amber-800 dark:text-amber-300">{warning}</p>)}
        <p class={MUTED}>Limits of agreement describe how far apart the methods can be; judge them against a difference you consider acceptable, decided beforehand.</p>
      </>}
    </div>}
    actions={<div class="flex flex-wrap items-center gap-2">
      <button type="button" class={BUTTON} disabled={!result} onClick={exportCsv}>Export CSV</button>
      <button type="button" class={BUTTON} disabled={!result} onClick={() => void exportPng()}>Export plot PNG</button>
      <button type="button" class={BUTTON} disabled={!result}
        onClick={() => downloadText(scienceText(SCIENCE), 'bland-altman-methods.txt')}>Export methods</button>
      <span role="status" class="w-full text-sm text-slate-600 dark:text-slate-300">{message}</span>
    </div>}
    science={<SciencePanel science={SCIENCE} />}
  />;
}
