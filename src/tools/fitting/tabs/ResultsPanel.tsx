
import type { FittingModel } from '../FittingModel';

export function ResultsPanel({ m }: { m: FittingModel }) {
  const {
    bliDiagnostics,
    bounds,
    curvePath,
    diagnosticPlotData,
    enzymeDiagnostics,
    fitResult,
    handleExportCsv,
    handleExportSvg,
    hoveredPoint,
    innerHeight,
    innerWidth,
    padBottom,
    padLeft,
    padRight,
    padTop,
    parsedData,
    plotHeight,
    plotWidth,
    s,
    scaleX,
    scaleY,
    set,
    setHoveredPoint,
    svgRef,
  } = m;
  return (
    <div class="space-y-4">
      {!fitResult ? (
        <p class="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">Please enter at least 2 data points to calculate fit.</p>
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
                {fitResult.notes && fitResult.notes.length > 0 && (
                  <ul class="mt-2 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                    {fitResult.notes.map(n => <li key={n}>• {n}</li>)}
                  </ul>
                )}
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
                <span class="text-slate-500 dark:text-slate-400 block">Goodness of Fit (R²)</span>
                <span data-testid="r2-stat" class="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {fitResult.r2.toFixed(4)}
                </span>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span class="text-slate-500 dark:text-slate-400 block">Adjusted R²</span>
                <span class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                  {fitResult.adjR2.toFixed(4)}
                </span>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span class="text-slate-500 dark:text-slate-400 block">RMSE</span>
                <span class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                  {fitResult.rmse.toFixed(4)}
                </span>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span class="text-slate-500 dark:text-slate-400 block">Sum of Squares (SSE)</span>
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
                  <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
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
                      <td class="py-2 font-mono text-slate-500 dark:text-slate-400">{p.symbol}</td>
                      <td data-testid={`param-${p.symbol}`} class="py-2 font-mono font-bold text-right text-accent-600 dark:text-accent-400">
                        {p.value >= 1000 || (p.value > 0 && p.value < 0.001)
                          ? p.value.toExponential(4)
                          : p.value.toFixed(4)}
                      </td>
                      <td class="py-2 font-mono text-right text-slate-500 dark:text-slate-400">
                        {p.standardError !== undefined ? `± ${p.standardError.toFixed(4)}` : '—'}
                      </td>
                      <td class="py-2 font-mono text-right text-slate-500 dark:text-slate-400">
                        {p.ci95Low !== undefined && p.ci95High !== undefined
                          ? `[${p.ci95Low.toFixed(3)}, ${p.ci95High.toFixed(3)}]`
                          : '—'}
                      </td>
                      <td class="py-2 text-slate-500 dark:text-slate-400 text-[11px]">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Enzyme Kinetics Derived Constants Card */}
          {enzymeDiagnostics && (
            <div class="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20 space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 dark:border-indigo-900/40 pb-2.5">
                <div>
                  <h3 class="font-bold text-xs text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
                    Enzyme Catalytic Constants &amp; Substrate Diagnostics
                  </h3>
                  <p class="text-[11px] text-indigo-700 dark:text-indigo-400">
                    Derived from non-linear fit parameters (Km = {enzymeDiagnostics.km.toFixed(2)} µM, Vmax = {enzymeDiagnostics.vmax.toFixed(2)} µM/min)
                  </p>
                </div>
                {/* Diagnostic plot switcher */}
                <div class="flex items-center gap-1.5 text-xs bg-white dark:bg-slate-900 p-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-1.5">Plot:</span>
                  <button
                    type="button"
                    onClick={() => set({ activeDiagnosticPlot: 'none' })}
                    class={`px-2 py-0.5 rounded font-medium text-xs transition ${s.activeDiagnosticPlot === 'none' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    Direct MM
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ activeDiagnosticPlot: 'lineweaver_burk' })}
                    class={`px-2 py-0.5 rounded font-medium text-xs transition ${s.activeDiagnosticPlot === 'lineweaver_burk' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    Lineweaver-Burk
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ activeDiagnosticPlot: 'eadie_hofstee' })}
                    class={`px-2 py-0.5 rounded font-medium text-xs transition ${s.activeDiagnosticPlot === 'eadie_hofstee' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    Eadie-Hofstee
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ activeDiagnosticPlot: 'hanes_woolf' })}
                    class={`px-2 py-0.5 rounded font-medium text-xs transition ${s.activeDiagnosticPlot === 'hanes_woolf' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    Hanes-Woolf
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30">
                  <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Turnover (kcat)</span>
                  <span class="font-mono text-base font-bold text-indigo-700 dark:text-indigo-300">
                    {enzymeDiagnostics.kcatSec !== null ? `${enzymeDiagnostics.kcatSec.toFixed(2)} s⁻¹` : '—'}
                  </span>
                  <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    {enzymeDiagnostics.kcatMin !== null ? `(${enzymeDiagnostics.kcatMin.toFixed(1)} min⁻¹)` : '[E]₀ required'}
                  </span>
                </div>

                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30">
                  <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Catalytic Efficiency (kcat / Km)</span>
                  <span class="font-mono text-base font-bold text-indigo-700 dark:text-indigo-300">
                    {enzymeDiagnostics.kcatKm !== null ? `${enzymeDiagnostics.kcatKm.toExponential(2)} M⁻¹s⁻¹` : '—'}
                  </span>
                  <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Apparent second-order rate</span>
                </div>

                {enzymeDiagnostics.sOpt !== null && (
                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30">
                    <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Optimum Substrate [S]opt</span>
                    <span class="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {enzymeDiagnostics.sOpt.toFixed(2)} µM
                    </span>
                    <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">√(Km · Ki)</span>
                  </div>
                )}

                {enzymeDiagnostics.vOpt !== null && (
                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30">
                    <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Max Attainable Velocity v_opt</span>
                    <span class="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {enzymeDiagnostics.vOpt.toFixed(2)} µM/min
                    </span>
                    <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Actual peak before inhibition</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BLI / SPR Biosensor Analysis Card */}
          {bliDiagnostics && (
            <div class="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20 space-y-3">
              <div class="border-b border-cyan-100 dark:border-cyan-900/40 pb-2">
                <h3 class="font-bold text-xs text-cyan-950 dark:text-cyan-200 uppercase tracking-wider">
                  BLI / SPR 1:1 Langmuir Kinetics Summary
                </h3>
                <p class="text-[11px] text-cyan-700 dark:text-cyan-400">
                  Equilibrium and rate constant extraction for real-time biosensor binding
                </p>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                {'kobs' in bliDiagnostics && bliDiagnostics.kobs != null && (
                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-cyan-100 dark:border-cyan-900/30">
                    <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Observed Rate (kobs)</span>
                    <span class="font-mono text-base font-bold text-cyan-700 dark:text-cyan-300">
                      {bliDiagnostics.kobs.toFixed(4)} s⁻¹
                    </span>
                  </div>
                )}

                {'kon' in bliDiagnostics && bliDiagnostics.kon != null && (
                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-cyan-100 dark:border-cyan-900/30">
                    <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Association Rate (kon / ka)</span>
                    <span class="font-mono text-base font-bold text-cyan-700 dark:text-cyan-300">
                      {bliDiagnostics.kon.toExponential(3)} M⁻¹s⁻¹
                    </span>
                  </div>
                )}

                {'koff' in bliDiagnostics && bliDiagnostics.koff != null && (
                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-cyan-100 dark:border-cyan-900/30">
                    <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Dissociation Rate (koff / kd)</span>
                    <span class="font-mono text-base font-bold text-cyan-700 dark:text-cyan-300">
                      {bliDiagnostics.koff.toExponential(3)} s⁻¹
                    </span>
                  </div>
                )}

                {'kd' in bliDiagnostics && bliDiagnostics.kd != null && (
                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-cyan-100 dark:border-cyan-900/30">
                    <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Affinity Constant (KD)</span>
                    <span class="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {bliDiagnostics.kd < 1 ? `${(bliDiagnostics.kd * 1000).toFixed(1)} pM` : `${bliDiagnostics.kd.toFixed(2)} nM`}
                    </span>
                    <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">koff / kon</span>
                  </div>
                )}

                {'tHalf' in bliDiagnostics && bliDiagnostics.tHalf != null && (
                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-cyan-100 dark:border-cyan-900/30">
                    <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Complex Half-Life (t1/2)</span>
                    <span class="font-mono text-base font-bold text-slate-800 dark:text-slate-200">
                      {bliDiagnostics.tHalf >= 60 ? `${(bliDiagnostics.tHalf / 60).toFixed(1)} min` : `${bliDiagnostics.tHalf.toFixed(1)} s`}
                    </span>
                    <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">ln(2) / koff</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Diagnostic Plot SVG if active */}
          {s.activeDiagnosticPlot !== 'none' && diagnosticPlotData ? (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {diagnosticPlotData.title}
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    Slope: {diagnosticPlotData.slope.toPrecision(4)} · Y-Intercept: {diagnosticPlotData.intercept.toPrecision(4)}
                    {diagnosticPlotData.xInt !== null ? ` · X-Intercept: ${diagnosticPlotData.xInt.toPrecision(4)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => set({ activeDiagnosticPlot: 'none' })}
                  class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 transition"
                >
                  Back to Non-Linear Curve
                </button>
              </div>

              <div class="overflow-x-auto flex justify-center">
                <svg
                  viewBox={`0 0 ${plotWidth} ${plotHeight}`}
                  class="w-full max-w-2xl h-auto select-none"
                  role="img"
                  aria-label={diagnosticPlotData.title}
                >
                  {/* Background */}
                  <rect x={padLeft} y={padTop} width={innerWidth} height={innerHeight} fill="#f8fafc" rx="4" />

                  {(() => {
                    const scaleDiagX = (x: number) => padLeft + ((x - diagnosticPlotData.minX) / (diagnosticPlotData.maxX - diagnosticPlotData.minX)) * innerWidth;
                    const scaleDiagY = (y: number) => plotHeight - padBottom - ((y - diagnosticPlotData.minY) / (diagnosticPlotData.maxY - diagnosticPlotData.minY)) * innerHeight;

                    const xZero = scaleDiagX(0);
                    const yZero = scaleDiagY(0);

                    const x1 = diagnosticPlotData.minX;
                    const y1 = diagnosticPlotData.slope * x1 + diagnosticPlotData.intercept;
                    const x2 = diagnosticPlotData.maxX;
                    const y2 = diagnosticPlotData.slope * x2 + diagnosticPlotData.intercept;

                    return (
                      <g>
                        {/* Zero line */}
                        {diagnosticPlotData.minX < 0 && (
                          <line x1={xZero} y1={padTop} x2={xZero} y2={plotHeight - padBottom} stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3 3" />
                        )}
                        <line x1={padLeft} y1={yZero} x2={plotWidth - padRight} y2={yZero} stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3 3" />

                        {/* Theoretical linear trendline */}
                        <line
                          x1={scaleDiagX(x1)}
                          y1={scaleDiagY(y1)}
                          x2={scaleDiagX(x2)}
                          y2={scaleDiagY(y2)}
                          stroke="#6366f1"
                          stroke-width="2.5"
                        />

                        {/* Transformed data points */}
                        {diagnosticPlotData.pts.map((pt, idx) => (
                          <circle
                            key={idx}
                            cx={scaleDiagX(pt.x)}
                            cy={scaleDiagY(pt.y)}
                            r={5}
                            fill="#4338ca"
                            stroke="#ffffff"
                            stroke-width="1.5"
                          />
                        ))}

                        {/* Axes */}
                        <line x1={padLeft} y1={plotHeight - padBottom} x2={plotWidth - padRight} y2={plotHeight - padBottom} stroke="#64748b" stroke-width="1.5" />
                        <line x1={padLeft} y1={padTop} x2={padLeft} y2={plotHeight - padBottom} stroke="#64748b" stroke-width="1.5" />

                        {/* Axis Labels */}
                        <text x={padLeft + innerWidth / 2} y={plotHeight - 10} font-size="11" font-family="sans-serif" font-weight="600" fill="#475569" text-anchor="middle">
                          {diagnosticPlotData.xLabel}
                        </text>
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
                          {diagnosticPlotData.yLabel}
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>
          ) : (
            /* Main Regression Plot (SVG) */
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Regression Curve &amp; Observed Data
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
          )}


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
              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                {fitResult.fittedPoints.length} observations
              </span>
            </div>
            <div class="overflow-x-auto max-h-64 overflow-y-auto">
              <table class="w-full text-xs text-left">
                <thead class="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
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
                      <td class="py-1 text-slate-500 dark:text-slate-400 font-sans">{i + 1}</td>
                      <td class="py-1 text-right text-slate-700 dark:text-slate-300">{fp.x}</td>
                      <td class="py-1 text-right text-slate-900 dark:text-slate-100 font-semibold">{fp.y.toFixed(4)}</td>
                      <td class="py-1 text-right text-accent-600 dark:text-accent-400">{fp.yFit.toFixed(4)}</td>
                      <td class="py-1 text-right text-slate-500 dark:text-slate-400">
                        {fp.seFit !== undefined ? `± ${fp.seFit.toFixed(4)}` : '—'}
                      </td>
                      <td class={`py-1 text-right ${fp.residual >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
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
  );
}
