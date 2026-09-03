import { useState, useMemo, useRef } from 'preact/hooks';
import {
  type FitModelType,
  parseFittingData,
  fitModel,
  SAMPLE_DATASETS,
} from '@/core/fitting';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  modelType: FitModelType;
  xLogScale: boolean;
  showErrorBars: boolean;
  presetKey: string;
}

const DEFAULTS: State = {
  modelType: '4pl',
  xLogScale: true,
  showErrorBars: true,
  presetKey: 'dose_response',
};

export default function CurveFittingView() {
  const [stateSig, shareUrl] = useUrlState<State>('fitting', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [rawText, setRawText] = useState<string>(() => SAMPLE_DATASETS.dose_response!.text);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; yFit: number; residual: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function handleSelectPreset(key: string) {
    const preset = SAMPLE_DATASETS[key];
    if (preset) {
      set({
        presetKey: key,
        modelType: preset.model,
        xLogScale: preset.model === '4pl' || preset.model === '5pl' || preset.model === 'two_site_binding',
      });
      setRawText(preset.text);
    }
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setRawText(text);
        set({ presetKey: '' });
      }
    };
    reader.readAsText(file);
  }

  const parsedData = useMemo(() => {
    return parseFittingData(rawText);
  }, [rawText]);

  const fitResult = useMemo(() => {
    if (parsedData.length < 2) return null;
    try {
      return fitModel(s.modelType, parsedData);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [s.modelType, parsedData]);

  // SVG Plot sizing and bounds
  const plotWidth = 650;
  const plotHeight = 350;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 45;

  const innerWidth = plotWidth - padLeft - padRight;
  const innerHeight = plotHeight - padTop - padBottom;

  const bounds = useMemo(() => {
    if (parsedData.length === 0) return { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    const xVals = parsedData.map(d => d.x);
    const yVals = parsedData.flatMap(d => d.yValues || [d.y]);
    let minX = Math.min(...xVals);
    let maxX = Math.max(...xVals);
    let minY = Math.min(...yVals);
    let maxY = Math.max(...yVals);

    if (minX === maxX) { minX -= 1; maxX += 1; }
    if (minY === maxY) { minY -= 1; maxY += 1; }

    // Padding
    const yMargin = (maxY - minY) * 0.08;
    minY -= yMargin;
    maxY += yMargin;

    if (s.xLogScale) {
      minX = Math.max(1e-4, Math.min(...xVals.filter(x => x > 0)));
      maxX = Math.max(minX * 10, maxX);
    } else {
      const xMargin = (maxX - minX) * 0.05;
      minX -= xMargin;
      maxX += xMargin;
    }

    return { minX, maxX, minY, maxY };
  }, [parsedData, s.xLogScale]);

  function scaleX(val: number): number {
    if (s.xLogScale) {
      const minLog = Math.log10(Math.max(1e-4, bounds.minX));
      const maxLog = Math.log10(Math.max(1e-4, bounds.maxX));
      const curLog = Math.log10(Math.max(1e-4, val));
      const frac = (curLog - minLog) / Math.max(1e-4, maxLog - minLog);
      return padLeft + frac * innerWidth;
    }
    const frac = (val - bounds.minX) / (bounds.maxX - bounds.minX);
    return padLeft + frac * innerWidth;
  }

  function scaleY(val: number): number {
    const frac = (val - bounds.minY) / (bounds.maxY - bounds.minY);
    return plotHeight - padBottom - frac * innerHeight;
  }

  // Generate smooth fitted curve path
  const curvePath = useMemo(() => {
    if (!fitResult || 'error' in fitResult) return '';
    const numPoints = 120;
    const pts: string[] = [];

    for (let i = 0; i <= numPoints; i++) {
      let x: number;
      if (s.xLogScale) {
        const minLog = Math.log10(Math.max(1e-4, bounds.minX));
        const maxLog = Math.log10(Math.max(1e-4, bounds.maxX));
        const logX = minLog + (i / numPoints) * (maxLog - minLog);
        x = Math.pow(10, logX);
      } else {
        x = bounds.minX + (i / numPoints) * (bounds.maxX - bounds.minX);
      }
      const y = fitResult.predict(x);
      const px = scaleX(x);
      const py = scaleY(y);
      if (!isNaN(px) && !isNaN(py) && py >= padTop - 100 && py <= plotHeight - padBottom + 100) {
        pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
      }
    }
    return pts.join(' ');
  }, [fitResult, bounds, s.xLogScale]);

  function handleExportCsv() {
    if (!fitResult || 'error' in fitResult) return;
    const rows = [
      ['# Model', fitResult.modelName],
      ['# Equation', `"${fitResult.equationStr}"`],
      ['# R^2', fitResult.r2.toFixed(6)],
      ['# Adj R^2', fitResult.adjR2.toFixed(6)],
      ['# RMSE', fitResult.rmse.toFixed(6)],
      ['# SSE', fitResult.sse.toFixed(6)],
      ['# DF', fitResult.df],
      [],
      ['Parameter', 'Symbol', 'Value', 'Std_Error', 'CI_95_Low', 'CI_95_High'],
      ...fitResult.parameters.map(p => [
        p.name,
        p.symbol,
        p.value,
        p.standardError ?? '',
        p.ci95Low ?? '',
        p.ci95High ?? '',
      ]),
      [],
      ['X', 'Observed_Y', 'Fitted_Y', 'SE_Fit', 'Residual', 'SD', 'SEM'],
      ...parsedData.map((d, i) => {
        const fp = fitResult.fittedPoints[i];
        return [
          d.x,
          d.y,
          fp ? fp.yFit.toFixed(4) : '',
          fp && fp.seFit !== undefined ? fp.seFit.toFixed(4) : '',
          fp ? fp.residual.toFixed(4) : '',
          d.sd !== undefined ? d.sd.toFixed(4) : '',
          d.sem !== undefined ? d.sem.toFixed(4) : '',
        ];
      }),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fit_results_${s.modelType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSvg() {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curve_fit_${s.modelType}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const copyText = !fitResult || 'error' in fitResult ? (fitResult?.error || 'No fit available.') : [
    `Model: ${fitResult.modelName}`,
    `Equation: ${fitResult.equationStr}`,
    `R²: ${fitResult.r2.toFixed(4)} (Adj R²: ${fitResult.adjR2.toFixed(4)})`,
    `RMSE: ${fitResult.rmse.toFixed(4)} | SSE: ${fitResult.sse.toFixed(4)} (DF: ${fitResult.df})`,
    'Parameters:',
    ...fitResult.parameters.map(p => `  - ${p.name} (${p.symbol}): ${p.value.toPrecision(5)}${p.standardError !== undefined ? ` ± ${p.standardError.toPrecision(3)}` : ''}${p.ci95Low !== undefined && p.ci95High !== undefined ? ` [95% CI: ${p.ci95Low.toPrecision(3)} to ${p.ci95High.toPrecision(3)}]` : ''}`),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="📈"
      title="Curve Fitting & Regression"
      blurb="Fit non-linear 4PL (EC50/IC50), Michaelis-Menten, exponential decay, and linear regression models with error bars and residuals."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Model Selector */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <label for="model-select" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Regression Model
            </label>
            <select
              id="model-select"
              value={s.modelType}
              onChange={(e) => {
                const m = (e.target as HTMLSelectElement).value as FitModelType;
                set({ modelType: m, xLogScale: m === '4pl' || m === '5pl' || m === 'two_site_binding' });
              }}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 font-medium"
            >
              <option value="4pl">4-Parameter Logistic (4PL / EC50 / IC50)</option>
              <option value="5pl">5-Parameter Logistic (5PL / Asymmetric EC50)</option>
              <option value="linear">Linear Regression (y = m·x + b)</option>
              <option value="linear_origin">Linear through Origin (y = m·x)</option>
              <option value="michaelis_menten">Michaelis-Menten Kinetics (Vmax, Km)</option>
              <option value="two_site_binding">Two-Site Specific Binding (Bmax1, Kd1, Bmax2, Kd2)</option>
              <option value="exp_decay">Exponential Decay (Half-Life t1/2)</option>
              <option value="exp_growth">Exponential Growth (y = y₀ · e^(k·x))</option>
              <option value="gaussian">Gaussian Peak Fit (Amplitude, Center, Width)</option>
            </select>
          </div>

          {/* Sample Presets */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Load Example Dataset
            </label>
            <div class="space-y-1">
              {Object.entries(SAMPLE_DATASETS).map(([k, ds]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleSelectPreset(k)}
                  class={`w-full text-left p-2 rounded-lg text-xs font-medium transition ${s.presetKey === k ? 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-300 dark:border-accent-700' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  {ds.name}
                </button>
              ))}
            </div>
          </div>

          {/* Data Input Area */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <label for="data-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Tabular Data (X, Y₁, Y₂...)
              </label>
              <span class="text-[11px] text-slate-400 mono">
                {parsedData.length} points
              </span>
            </div>
            <textarea
              id="data-input"
              aria-label="Tabular Data"
              rows={8}
              value={rawText}
              onInput={(e) => {
                setRawText((e.target as HTMLTextAreaElement).value);
                set({ presetKey: '' });
              }}
              placeholder={`# X\tY1\tY2...\n0.1\t10\t12\n1.0\t25\t27`}
              class="w-full p-2.5 mono text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-950 leading-relaxed resize-y"
            />
            <p class="text-[11px] text-slate-500">
              💡 Separate columns with tabs, commas, or spaces. Multiple Y columns are treated as replicate measurements.
            </p>
          </div>

          {/* Plot Controls */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 text-xs">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Plot Settings
            </span>
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={s.xLogScale}
                onChange={(e) => set({ xLogScale: (e.target as HTMLInputElement).checked })}
                class="rounded text-accent-600 accent-accent-600"
              />
              <span>Logarithmic X Axis (log₁₀)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={s.showErrorBars}
                onChange={(e) => set({ showErrorBars: (e.target as HTMLInputElement).checked })}
                class="rounded text-accent-600 accent-accent-600"
              />
              <span>Show Error Bars (SD / Replicates)</span>
            </label>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Upload CSV / TSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              class="hidden"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => setRawText('')}
              class="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
            >
              Clear
            </button>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {!fitResult ? (
            <p class="text-xs text-slate-500 py-8 text-center">Please enter at least 2 data points to calculate fit.</p>
          ) : 'error' in fitResult ? (
            <div role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <strong>Fit failed:</strong> {fitResult.error}
            </div>
          ) : (
            <>
              {/* Fit Summary Banner */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
                      {fitResult.modelName}
                    </h2>
                    <p class="font-serif italic text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                      {fitResult.equationStr}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportSvg}
                      class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition"
                    >
                      Export SVG
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Goodness of Fit Badges */}
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span class="text-slate-500 block">Goodness of Fit (R²)</span>
                    <span data-testid="r2-stat" class="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {fitResult.r2.toFixed(4)}
                    </span>
                  </div>
                  <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span class="text-slate-500 block">Adjusted R²</span>
                    <span class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                      {fitResult.adjR2.toFixed(4)}
                    </span>
                  </div>
                  <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span class="text-slate-500 block">RMSE</span>
                    <span class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                      {fitResult.rmse.toFixed(4)}
                    </span>
                  </div>
                  <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span class="text-slate-500 block">Sum of Squares (SSE)</span>
                    <span class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                      {fitResult.sse.toFixed(3)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Best-Fit Parameters Table */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <h3 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Fitted Parameters
                </h3>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs text-left">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                        <th class="pb-2 font-semibold">Parameter</th>
                        <th class="pb-2 font-semibold">Symbol</th>
                        <th class="pb-2 font-semibold text-right">Best-Fit Value</th>
                        <th class="pb-2 font-semibold text-right">Std. Error</th>
                        <th class="pb-2 font-semibold text-right">95% CI</th>
                        <th class="pb-2 font-semibold">Interpretation</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                      {fitResult.parameters.map((p) => (
                        <tr key={p.symbol} class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td class="py-2 font-semibold text-slate-900 dark:text-slate-100">{p.name}</td>
                          <td class="py-2 font-mono text-slate-500">{p.symbol}</td>
                          <td data-testid={`param-${p.symbol}`} class="py-2 font-mono font-bold text-right text-accent-600 dark:text-accent-400">
                            {p.value >= 1000 || (p.value > 0 && p.value < 0.001)
                              ? p.value.toExponential(4)
                              : p.value.toFixed(4)}
                          </td>
                          <td class="py-2 font-mono text-right text-slate-500">
                            {p.standardError !== undefined ? `± ${p.standardError.toFixed(4)}` : '—'}
                          </td>
                          <td class="py-2 font-mono text-right text-slate-400">
                            {p.ci95Low !== undefined && p.ci95High !== undefined
                              ? `[${p.ci95Low.toFixed(3)}, ${p.ci95High.toFixed(3)}]`
                              : '—'}
                          </td>
                          <td class="py-2 text-slate-500 text-[11px]">{p.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Main Regression Plot (SVG) */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Regression Curve & Observed Data
                  </h3>
                  {hoveredPoint && (
                    <span class="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                      x: {hoveredPoint.x} · y: {hoveredPoint.y.toFixed(3)} · fit: {hoveredPoint.yFit.toFixed(3)} · res: {hoveredPoint.residual.toFixed(3)}
                    </span>
                  )}
                </div>

                <div class="overflow-x-auto flex justify-center">
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${plotWidth} ${plotHeight}`}
                    class="w-full max-w-2xl h-auto select-none"
                    role="img"
                    aria-label={`Plot of ${fitResult.modelName}`}
                  >
                    {/* Background */}
                    <rect x={padLeft} y={padTop} width={innerWidth} height={innerHeight} fill="#f8fafc" rx="4" />

                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(f => {
                      const y = padTop + f * innerHeight;
                      const val = bounds.maxY - f * (bounds.maxY - bounds.minY);
                      return (
                        <g key={f}>
                          <line x1={padLeft} y1={y} x2={plotWidth - padRight} y2={y} stroke="#e2e8f0" stroke-width="1" />
                          <text x={padLeft - 8} y={y} font-size="10" font-family="monospace" fill="#94a3b8" text-anchor="end" dominant-baseline="central">
                            {val.toFixed(val < 1 ? 2 : 1)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Fitted Curve Line */}
                    {curvePath && (
                      <path
                        d={curvePath}
                        fill="none"
                        stroke="#0284c7"
                        stroke-width="2.5"
                        stroke-linecap="round"
                      />
                    )}

                    {/* Data Points with Error Bars */}
                    {parsedData.map((d, i) => {
                      const cx = scaleX(d.x);
                      const cy = scaleY(d.y);
                      const fp = fitResult.fittedPoints[i];

                      return (
                        <g
                          key={i}
                          class="cursor-pointer"
                          onMouseEnter={() => fp && setHoveredPoint({ x: d.x, y: d.y, yFit: fp.yFit, residual: fp.residual })}
                          onMouseLeave={() => setHoveredPoint(null)}
                        >
                          {/* Error bar (SD) */}
                          {s.showErrorBars && d.sd !== undefined && (
                            <g stroke="#94a3b8" stroke-width="1.5">
                              <line x1={cx} y1={scaleY(d.y - d.sd)} x2={cx} y2={scaleY(d.y + d.sd)} />
                              <line x1={cx - 3} y1={scaleY(d.y - d.sd)} x2={cx + 3} y2={scaleY(d.y - d.sd)} />
                              <line x1={cx - 3} y1={scaleY(d.y + d.sd)} x2={cx + 3} y2={scaleY(d.y + d.sd)} />
                            </g>
                          )}

                          {/* Point marker */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={d.yValues && d.yValues.length > 1 ? 5 : 4}
                            fill="#0f172a"
                            stroke="#ffffff"
                            stroke-width="1.5"
                          />
                        </g>
                      );
                    })}

                    {/* Axes Ticks and Labels */}
                    <line x1={padLeft} y1={plotHeight - padBottom} x2={plotWidth - padRight} y2={plotHeight - padBottom} stroke="#64748b" stroke-width="1.5" />
                    <line x1={padLeft} y1={padTop} x2={padLeft} y2={plotHeight - padBottom} stroke="#64748b" stroke-width="1.5" />

                    {/* X Axis Label */}
                    <text x={padLeft + innerWidth / 2} y={plotHeight - 10} font-size="11" font-family="sans-serif" font-weight="600" fill="#475569" text-anchor="middle">
                      {s.xLogScale ? 'Concentration / Independent Variable X (log₁₀ scale)' : 'Independent Variable X'}
                    </text>

                    {/* Y Axis Label */}
                    <text
                      transform={`rotate(-90 ${15} ${padTop + innerHeight / 2})`}
                      x={15}
                      y={padTop + innerHeight / 2}
                      font-size="11"
                      font-family="sans-serif"
                      font-weight="600"
                      fill="#475569"
                      text-anchor="middle"
                    >
                      Response / Dependent Variable Y
                    </text>
                  </svg>
                </div>
              </div>

              {/* Residuals Plot */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <h3 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Residual Plot (y - ŷ)
                </h3>
                <div class="overflow-x-auto flex justify-center">
                  <svg viewBox={`0 0 ${plotWidth} 140`} class="w-full max-w-2xl h-auto select-none">
                    {/* Zero line */}
                    <line x1={padLeft} y1={70} x2={plotWidth - padRight} y2={70} stroke="#94a3b8" stroke-dasharray="3 3" stroke-width="1.5" />
                    <text x={padLeft - 8} y={70} font-size="10" font-family="monospace" fill="#94a3b8" text-anchor="end" dominant-baseline="central">0.0</text>

                    {fitResult.fittedPoints.map((fp, i) => {
                      const cx = scaleX(fp.x);
                      const maxRes = Math.max(0.1, ...fitResult.fittedPoints.map(p => Math.abs(p.residual))) * 1.2;
                      const cy = 70 - (fp.residual / maxRes) * 50;

                      return (
                        <g key={i}>
                          <line x1={cx} y1={70} x2={cx} y2={cy} stroke="#38bdf8" stroke-width="1.5" />
                          <circle cx={cx} cy={cy} r="3.5" fill="#0284c7" />
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Fitted Points Table with Standard Errors */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Fitted Values &amp; Prediction Errors (SE)
                  </h3>
                  <span class="text-[11px] text-slate-400">
                    {fitResult.fittedPoints.length} observations
                  </span>
                </div>
                <div class="overflow-x-auto max-h-64 overflow-y-auto">
                  <table class="w-full text-xs text-left">
                    <thead class="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <tr>
                        <th class="py-1.5 font-semibold">#</th>
                        <th class="py-1.5 font-semibold text-right">X</th>
                        <th class="py-1.5 font-semibold text-right">Observed Y</th>
                        <th class="py-1.5 font-semibold text-right">Fitted Ŷ</th>
                        <th class="py-1.5 font-semibold text-right">SE(Fit)</th>
                        <th class="py-1.5 font-semibold text-right">Residual (Y - Ŷ)</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {fitResult.fittedPoints.map((fp, i) => (
                        <tr key={i} class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td class="py-1 text-slate-400 font-sans">{i + 1}</td>
                          <td class="py-1 text-right text-slate-700 dark:text-slate-300">{fp.x}</td>
                          <td class="py-1 text-right text-slate-900 dark:text-slate-100 font-semibold">{fp.y.toFixed(4)}</td>
                          <td class="py-1 text-right text-accent-600 dark:text-accent-400">{fp.yFit.toFixed(4)}</td>
                          <td class="py-1 text-right text-slate-500">
                            {fp.seFit !== undefined ? `± ${fp.seFit.toFixed(4)}` : '—'}
                          </td>
                          <td class={`py-1 text-right ${fp.residual >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {fp.residual >= 0 ? `+${fp.residual.toFixed(4)}` : fp.residual.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
