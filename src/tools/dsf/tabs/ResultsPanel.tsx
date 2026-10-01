
import type { DsfModel } from '../DsfModel';
import { PALETTE } from '../DsfModel';

export function ResultsPanel({ m }: { m: DsfModel }) {
  const {
    activeCondition,
    allConditionsList,
    analysis,
    bounds,
    derivHeight,
    derivSvgRef,
    dsfCompute,
    getDisplayedFl,
    handleExportCsv,
    handleExportDerivPng,
    handleExportDerivSvg,
    handleExportMeltPng,
    handleExportMeltSvg,
    handleRemovePeak,
    handleResetView,
    handleRestorePeaksForCondition,
    handleSelectAll,
    handleSvgMouseMove,
    hoverData,
    innerDerivHeight,
    innerMeltHeight,
    innerResidHeight,
    innerWidth,
    meltHeight,
    meltSvgRef,
    padBottom,
    padLeft,
    padRight,
    padTop,
    plotWidth,
    referenceCondition,
    residHeight,
    residSvgRef,
    s,
    scaleDerivY,
    scaleMeltY,
    scaleX,
    set,
    setHoverData,
  } = m;
  return (
    <div class="space-y-4">
      {dsfCompute.busy && (
        <p role="status" class="text-xs font-medium text-slate-600 dark:text-slate-300">Analysing melt curves…</p>
      )}
      {!analysis ? (
        <p class="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">Please paste or upload thermal shift assay data to begin analysis.</p>
      ) : 'error' in analysis ? (
        <div role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <strong>Analysis error:</strong> {analysis.error}
        </div>
      ) : analysis.conditions.length === 0 ? (
        <div class="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <div class="text-3xl">📉</div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">No Traces Selected</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            All traces are currently deselected. Check individual traces in the left panel, click "Solo" on any trace, or click below to restore all traces.
          </p>
          <button
            type="button"
            onClick={handleSelectAll}
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-accent-600 text-white hover:bg-accent-700 transition"
          >
            Select All Traces ({allConditionsList.length})
          </button>
        </div>
      ) : (
        <>
          {/* Executive Screening Summary Cards */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Thermal Shift Assay Results</span>
                  <span class="text-xs px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 dark:bg-accent-950 dark:text-accent-300 font-mono font-medium">
                    {analysis.conditions.length} of {allConditionsList.length} traces active
                  </span>
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Reference: <strong class="text-slate-700 dark:text-slate-300">{referenceCondition?.name}</strong> (Tm = {analysis.referenceTm.toFixed(2)} °C) · Method: {s.tmMethod === 'derivative' ? 'Savitzky-Golay 1st Derivative' : 'Two-State Boltzmann Sigmoid'}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetView}
                  class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Reset plot scaling and temperature bounds"
                >
                  Autoscale View
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

            {/* Stat Badges */}
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Reference Tm</span>
                <span data-testid="reference-tm" class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                  {analysis.referenceTm.toFixed(2)} °C
                </span>
                <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 truncate">{referenceCondition?.name}</span>
              </div>

              <div class="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                <span class="text-emerald-800 dark:text-emerald-300 block text-[11px]">Top Stabilizer Hit</span>
                <span data-testid="top-hit-shift" class="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {analysis.summary.topHit ? `+${analysis.summary.topHit.deltaTm.toFixed(2)} °C` : '—'}
                </span>
                <span class="text-[10px] text-emerald-700 dark:text-emerald-400 block mt-0.5 truncate">
                  {analysis.summary.topHit?.name || 'No stabilizer'}
                </span>
              </div>

              <div class="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                <span class="text-blue-800 dark:text-blue-300 block text-[11px]">Stabilizers (ΔTm ≥ +2°C)</span>
                <span class="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">
                  {analysis.summary.stabilizersCount}
                </span>
                <span class="text-[10px] text-blue-700 dark:text-blue-400 block mt-0.5">
                  of {analysis.conditions.length - 1} screened
                </span>
              </div>

              <div class="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
                <span class="text-rose-800 dark:text-rose-300 block text-[11px]">Destabilizers (ΔTm ≤ -2°C)</span>
                <span class="font-mono text-lg font-bold text-rose-700 dark:text-rose-400">
                  {analysis.summary.destabilizersCount}
                </span>
                <span class="text-[10px] text-rose-700 dark:text-rose-400 block mt-0.5">
                  Max: {analysis.summary.maxDestabilization < 0 ? `${analysis.summary.maxDestabilization.toFixed(1)} °C` : '0.0 °C'}
                </span>
              </div>
            </div>
          </div>

          {/* Chart 1: Fluorescence Thermal Melt Curves F(T) */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Thermal Denaturation Melt Curves F(T)
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {s.normalizeFluorescence ? 'Normalized emission intensity (0 - 100%)' : 'Emission intensity / ratiometric signal'} vs temperature (°C)
                </p>
              </div>
              <div class="flex items-center gap-2">
                {hoverData && (
                  <span class="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                    {hoverData.temperature.toFixed(1)} °C: {hoverData.fl != null ? (hoverData.fl < 10 ? hoverData.fl.toFixed(3) : hoverData.fl.toFixed(1)) : '—'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleExportMeltSvg}
                  class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  SVG
                </button>
                <button
                  type="button"
                  onClick={handleExportMeltPng}
                  class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  PNG
                </button>
              </div>
            </div>

            <div class="overflow-x-auto flex justify-center">
              <svg
                ref={meltSvgRef}
                viewBox={`0 0 ${plotWidth} ${meltHeight}`}
                class="w-full max-w-3xl h-auto select-none"
                role="img"
                aria-label="Thermal denaturation fluorescence curves"
                onMouseMove={(e) => handleSvgMouseMove(e, meltSvgRef.current)}
                onMouseLeave={() => setHoverData(null)}
              >
                {/* Background */}
                <rect x={padLeft} y={padTop} width={innerWidth} height={innerMeltHeight} fill="#f8fafc" rx="4" />

                {/* Grid lines (Y axis) from scientific nice ticks */}
                {bounds.yFlTicks.ticks.map((val) => {
                  const y = scaleMeltY(val);
                  if (y < padTop - 2 || y > meltHeight - padBottom + 2) return null;
                  return (
                    <g key={val}>
                      <line x1={padLeft} y1={y} x2={plotWidth - padRight} y2={y} stroke="#e2e8f0" stroke-width="1" />
                      <text
                        x={padLeft - 8}
                        y={y}
                        font-size="10"
                        font-family="monospace"
                        fill="#94a3b8"
                        text-anchor="end"
                        dominant-baseline="central"
                      >
                        {val < 10 ? val.toFixed(bounds.yFlTicks.decimals) : val.toFixed(0)}
                      </text>
                    </g>
                  );
                })}

                {/* Grid lines (X axis) from scientific nice ticks */}
                {bounds.xTicks.ticks.map((t) => {
                  const x = scaleX(t);
                  if (x < padLeft - 2 || x > plotWidth - padRight + 2) return null;
                  return (
                    <g key={t}>
                      <line x1={x} y1={padTop} x2={x} y2={meltHeight - padBottom} stroke="#e2e8f0" stroke-width="1" />
                      <text
                        x={x}
                        y={meltHeight - padBottom + 14}
                        font-size="10"
                        font-family="monospace"
                        fill="#94a3b8"
                        text-anchor="middle"
                      >
                        {t.toFixed(0)}°C
                      </text>
                    </g>
                  );
                })}

                {/* Vertical reference line at Reference Condition Tm */}
                {referenceCondition && referenceCondition.tm >= bounds.minT && referenceCondition.tm <= bounds.maxT && (
                  <g>
                    <line
                      x1={scaleX(referenceCondition.tm)}
                      y1={padTop}
                      x2={scaleX(referenceCondition.tm)}
                      y2={meltHeight - padBottom}
                      stroke="#94a3b8"
                      stroke-width="1.5"
                      stroke-dasharray="4 3"
                    />
                    <text
                      x={scaleX(referenceCondition.tm)}
                      y={padTop - 6}
                      font-size="9"
                      font-family="monospace"
                      font-weight="bold"
                      fill="#64748b"
                      text-anchor="middle"
                    >
                      Ref: {referenceCondition.tm.toFixed(1)}°C
                    </text>
                  </g>
                )}

                {/* Curves for all active conditions */}
                {analysis.conditions.map((cond, idx) => {
                  const color = PALETTE[idx % PALETTE.length]!;
                  const isInspected = activeCondition?.id === cond.id;
                  const strokeOpacity = isInspected ? 1.0 : 0.65;
                  const strokeWidth = isInspected ? 3.0 : 1.8;

                  // Generate path
                  const pts: string[] = [];
                  for (let i = 0; i < cond.smoothedPoints.length; i++) {
                    const pt = cond.smoothedPoints[i]!;
                    const yVal = getDisplayedFl(pt.fluorescence, cond.smoothedPoints);
                    const px = scaleX(pt.temperature);
                    const py = scaleMeltY(yVal);
                    pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
                  }

                  return (
                    <g key={cond.id}>
                      <path
                        d={pts.join(' ')}
                        fill="none"
                        stroke={color}
                        stroke-width={strokeWidth}
                        stroke-opacity={strokeOpacity}
                        stroke-linecap="round"
                      />

                      {/* Boltzmann Sigmoid Overlay if selected and enabled */}
                      {s.showBoltzmannOverlay && cond.boltzmannFit && isInspected && (
                        <path
                          d={(() => {
                            const bPts: string[] = [];
                            for (let i = 0; i < cond.rawPoints.length; i++) {
                              const t = cond.rawPoints[i]!.temperature;
                              const bY = cond.boltzmannFit!.predict(t);
                              const yNorm = getDisplayedFl(bY, cond.rawPoints);
                              bPts.push(`${i === 0 ? 'M' : 'L'} ${scaleX(t).toFixed(1)} ${scaleMeltY(yNorm).toFixed(1)}`);
                            }
                            return bPts.join(' ');
                          })()}
                          fill="none"
                          stroke="#0f172a"
                          stroke-width="1.8"
                          stroke-dasharray="3 3"
                        />
                      )}
                    </g>
                  );
                })}

                {/* Hover cursor line */}
                {hoverData && (
                  <line
                    x1={hoverData.xPx}
                    y1={padTop}
                    x2={hoverData.xPx}
                    y2={meltHeight - padBottom}
                    stroke="#0284c7"
                    stroke-width="1.5"
                    stroke-dasharray="3 2"
                  />
                )}

                {/* Axes borders */}
                <line x1={padLeft} y1={meltHeight - padBottom} x2={plotWidth - padRight} y2={meltHeight - padBottom} stroke="#64748b" stroke-width="1.5" />
                <line x1={padLeft} y1={padTop} x2={padLeft} y2={meltHeight - padBottom} stroke="#64748b" stroke-width="1.5" />

                {/* Axis Labels */}
                <text x={padLeft + innerWidth / 2} y={meltHeight - 10} font-size="11" font-family="sans-serif" font-weight="600" fill="#475569" text-anchor="middle">
                  Temperature (°C)
                </text>
                <text
                  transform={`rotate(-90 ${15} ${padTop + innerMeltHeight / 2})`}
                  x={15}
                  y={padTop + innerMeltHeight / 2}
                  font-size="11"
                  font-family="sans-serif"
                  font-weight="600"
                  fill="#475569"
                  text-anchor="middle"
                >
                  {s.normalizeFluorescence ? 'Normalized Fluorescence (%)' : 'Fluorescence / Ratio (AU)'}
                </text>
              </svg>
            </div>
          </div>

          {/* Chart 2: First Derivative dF/dT (Peak Tm Inflection) */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Numerical First Derivative dF/dT
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Savitzky-Golay smoothed dF/dT (or dRatio/dT); extrema identify transition midpoints (Tm)
                </p>
              </div>
              <div class="flex items-center gap-2">
                {hoverData && (
                  <span class="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                    {hoverData.temperature.toFixed(1)} °C: dF/dT = {hoverData.dFdT?.toFixed(3)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleExportDerivSvg}
                  class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  SVG
                </button>
                <button
                  type="button"
                  onClick={handleExportDerivPng}
                  class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  PNG
                </button>
              </div>
            </div>

            <div class="overflow-x-auto flex justify-center">
              <svg
                ref={derivSvgRef}
                viewBox={`0 0 ${plotWidth} ${derivHeight}`}
                class="w-full max-w-3xl h-auto select-none"
                role="img"
                aria-label="Numerical first derivative curves dF/dT"
                onMouseMove={(e) => handleSvgMouseMove(e, derivSvgRef.current)}
                onMouseLeave={() => setHoverData(null)}
              >
                {/* Background */}
                <rect x={padLeft} y={padTop} width={innerWidth} height={innerDerivHeight} fill="#f8fafc" rx="4" />

                {/* Zero-reference line if spans across 0 */}
                {bounds.minD < 0 && bounds.maxD > 0 && (
                  <line
                    x1={padLeft}
                    y1={scaleDerivY(0)}
                    x2={plotWidth - padRight}
                    y2={scaleDerivY(0)}
                    stroke="#cbd5e1"
                    stroke-width="1.5"
                    stroke-dasharray="4 4"
                  />
                )}

                {/* Grid lines (Y axis) */}
                {bounds.yDTicks.ticks.map((val) => {
                  const y = scaleDerivY(val);
                  if (y < padTop - 2 || y > derivHeight - padBottom + 2) return null;
                  return (
                    <g key={val}>
                      <line x1={padLeft} y1={y} x2={plotWidth - padRight} y2={y} stroke="#e2e8f0" stroke-width="1" />
                      <text
                        x={padLeft - 8}
                        y={y}
                        font-size="10"
                        font-family="monospace"
                        fill="#94a3b8"
                        text-anchor="end"
                        dominant-baseline="central"
                      >
                        {val < 10 && val > -10 ? val.toFixed(bounds.yDTicks.decimals) : val.toFixed(0)}
                      </text>
                    </g>
                  );
                })}

                {/* Grid lines (X axis) */}
                {bounds.xTicks.ticks.map((t) => {
                  const x = scaleX(t);
                  if (x < padLeft - 2 || x > plotWidth - padRight + 2) return null;
                  return (
                    <g key={t}>
                      <line x1={x} y1={padTop} x2={x} y2={derivHeight - padBottom} stroke="#e2e8f0" stroke-width="1" />
                      <text
                        x={x}
                        y={derivHeight - padBottom + 14}
                        font-size="10"
                        font-family="monospace"
                        fill="#94a3b8"
                        text-anchor="middle"
                      >
                        {t.toFixed(0)}°C
                      </text>
                    </g>
                  );
                })}

                {/* Derivative Curves */}
                {analysis.conditions.map((cond, idx) => {
                  const color = PALETTE[idx % PALETTE.length]!;
                  const isInspected = activeCondition?.id === cond.id;
                  const strokeOpacity = isInspected ? 1.0 : 0.65;
                  const strokeWidth = isInspected ? 2.8 : 1.6;

                  const pts: string[] = [];
                  for (let i = 0; i < cond.derivativePoints.length; i++) {
                    const pt = cond.derivativePoints[i]!;
                    const px = scaleX(pt.temperature);
                    const py = scaleDerivY(pt.dFdT);
                    pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
                  }

                  return (
                    <g key={cond.id}>
                      <path
                        d={pts.join(' ')}
                        fill="none"
                        stroke={color}
                        stroke-width={strokeWidth}
                        stroke-opacity={strokeOpacity}
                        stroke-linecap="round"
                      />

                      {/* Detected Peak & Trough Markers for Inspected Condition */}
                      {isInspected && cond.peaks.map((p, pIdx) => {
                        const cx = scaleX(p.temperature);
                        const cy = scaleDerivY(p.height);
                        if (cx < padLeft || cx > plotWidth - padRight) return null;
                        const isPos = p.sign === '+';
                        const textY = isPos ? Math.max(padTop + 10, cy - 9) : Math.min(derivHeight - padBottom - 6, cy + 16);

                        return (
                          <g key={pIdx} data-testid={`peak-marker-${p.label}`}>
                            {isPos ? (
                              <polygon
                                points={`${cx},${cy - 7} ${cx - 5.5},${cy + 3.5} ${cx + 5.5},${cy + 3.5}`}
                                fill={color}
                                stroke="#ffffff"
                                stroke-width={p.isPrimary ? '2' : '1.5'}
                              />
                            ) : (
                              <polygon
                                points={`${cx},${cy + 7} ${cx - 5.5},${cy - 3.5} ${cx + 5.5},${cy - 3.5}`}
                                fill={color}
                                stroke="#ffffff"
                                stroke-width={p.isPrimary ? '2' : '1.5'}
                              />
                            )}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={p.isPrimary ? 2.5 : 2}
                              fill="#ffffff"
                            />
                            <text
                              x={cx}
                              y={textY}
                              font-size={p.isPrimary ? '10' : '9'}
                              font-family="monospace"
                              font-weight={p.isPrimary ? 'bold' : 'normal'}
                              fill={color}
                              text-anchor="middle"
                            >
                              {p.label}: {p.temperature.toFixed(1)}°C
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* Hover cursor line */}
                {hoverData && (
                  <line
                    x1={hoverData.xPx}
                    y1={padTop}
                    x2={hoverData.xPx}
                    y2={derivHeight - padBottom}
                    stroke="#0284c7"
                    stroke-width="1.5"
                    stroke-dasharray="3 2"
                  />
                )}

                {/* Axes borders */}
                <line x1={padLeft} y1={derivHeight - padBottom} x2={plotWidth - padRight} y2={derivHeight - padBottom} stroke="#64748b" stroke-width="1.5" />
                <line x1={padLeft} y1={padTop} x2={padLeft} y2={derivHeight - padBottom} stroke="#64748b" stroke-width="1.5" />

                {/* Axis Labels */}
                <text x={padLeft + innerWidth / 2} y={derivHeight - 10} font-size="11" font-family="sans-serif" font-weight="600" fill="#475569" text-anchor="middle">
                  Temperature (°C)
                </text>
                <text
                  transform={`rotate(-90 ${15} ${padTop + innerDerivHeight / 2})`}
                  x={15}
                  y={padTop + innerDerivHeight / 2}
                  font-size="11"
                  font-family="sans-serif"
                  font-weight="600"
                  fill="#475569"
                  text-anchor="middle"
                >
                  dF / dT
                </text>
              </svg>
            </div>
          </div>

          {/* Chart 3: Fit Residuals Plot (Observed - Fitted) */}
          {s.showResiduals && activeCondition?.boltzmannFit && (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Boltzmann Sigmoid Fit Residuals ({activeCondition.name})
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Residual = Observed - Fitted (R² = {activeCondition.boltzmannFit.r2.toFixed(4)}, RMSE = {activeCondition.boltzmannFit.rmse.toFixed(2)})
                  </p>
                </div>
              </div>

              <div class="overflow-x-auto flex justify-center">
                <svg
                  ref={residSvgRef}
                  viewBox={`0 0 ${plotWidth} ${residHeight}`}
                  class="w-full max-w-3xl h-auto select-none"
                >
                  <rect x={padLeft} y={padTop} width={innerWidth} height={innerResidHeight} fill="#f8fafc" rx="4" />

                  {(() => {
                    const resids = activeCondition.boltzmannFit!.fittedPoints.map(p => p.residual);
                    const maxAbsResid = Math.max(1e-3, ...resids.map(Math.abs)) * 1.15;
                    const scaleResidY = (r: number) =>
                      padTop + innerResidHeight / 2 - (r / maxAbsResid) * (innerResidHeight / 2);

                    return (
                      <>
                        {/* Zero line */}
                        <line
                          x1={padLeft}
                          y1={padTop + innerResidHeight / 2}
                          x2={plotWidth - padRight}
                          y2={padTop + innerResidHeight / 2}
                          stroke="#64748b"
                          stroke-width="1.5"
                        />

                        {/* Residual points */}
                        {activeCondition.boltzmannFit!.fittedPoints.map((p, idx) => (
                          <circle
                            key={idx}
                            cx={scaleX(p.temperature)}
                            cy={scaleResidY(p.residual)}
                            r="2.5"
                            fill="#4f46e5"
                            opacity="0.8"
                          />
                        ))}

                        {/* Axis labels */}
                        <text
                          x={padLeft - 8}
                          y={padTop + 4}
                          font-size="9"
                          font-family="monospace"
                          fill="#94a3b8"
                          text-anchor="end"
                        >
                          +{maxAbsResid.toFixed(2)}
                        </text>
                        <text
                          x={padLeft - 8}
                          y={residHeight - padBottom}
                          font-size="9"
                          font-family="monospace"
                          fill="#94a3b8"
                          text-anchor="end"
                        >
                          -{maxAbsResid.toFixed(2)}
                        </text>
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}

          {/* Interactive Legend Bar */}
          <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Active Condition Series:
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                Click to inspect · {analysis.conditions.length} rendered
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {analysis.conditions.map((cond, idx) => {
                const color = PALETTE[idx % PALETTE.length]!;
                const isInspected = activeCondition?.id === cond.id;
                return (
                  <button
                    key={cond.id}
                    type="button"
                    onClick={() => set({ selectedConditionId: cond.id })}
                    class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${isInspected ? 'ring-2 ring-accent-500 bg-accent-50 dark:bg-accent-950/40 font-bold border-accent-300 dark:border-accent-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'}`}
                  >
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span class="truncate max-w-[140px]">{cond.name}</span>
                    <span class="text-slate-600 dark:text-slate-400 font-mono text-[11px]">({cond.tm.toFixed(1)}°C)</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Condition Ranking & Hit Summary Table */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Condition Ranking Table (Sorted by Stabilization ΔTm)
              </h3>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                ΔTm = Tm(sample) - Tm(ref)
              </span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold">
                    <th class="py-2 px-1">Rank</th>
                    <th class="py-2 px-2">Condition</th>
                    <th class="py-2 px-2 text-right">Tm (°C)</th>
                    <th class="py-2 px-2 text-right">ΔTm (°C)</th>
                    <th class="py-2 px-2 text-left">Transition Peaks (+/−)</th>
                    <th class="py-2 px-2 text-right">Peak dF/dT</th>
                    <th class="py-2 px-2 text-right">Boltzmann R²</th>
                    <th class="py-2 px-2 text-right">Apparent ΔH (kJ/mol)</th>
                    <th class="py-2 px-2 text-center">Effect</th>
                    <th class="py-2 px-1 text-center">Ref</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  {analysis.rankedConditions.map((cond, idx) => {
                    const isRef = cond.id === analysis.referenceConditionId;
                    const isInspected = activeCondition?.id === cond.id;
                    const isTop = idx === 0 && cond.deltaTm > 0;

                    return (
                      <tr
                        key={cond.id}
                        onClick={() => set({ selectedConditionId: cond.id })}
                        class={`cursor-pointer transition ${isInspected ? 'bg-accent-50/70 dark:bg-accent-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                      >
                        <td class="py-2 px-1 font-mono font-semibold text-slate-600 dark:text-slate-400">
                          {isTop ? '🏆 1' : `#${idx + 1}`}
                        </td>
                        <td class="py-2 px-2 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span class="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PALETTE[idx % PALETTE.length] }} />
                          <span class="truncate max-w-xs">{cond.name}</span>
                          {isRef && (
                            <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                              REF
                            </span>
                          )}
                        </td>
                        <td class="py-2 px-2 font-mono font-bold text-right text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          <span
                            class={`inline-block text-[10px] font-extrabold mr-1 px-1 rounded ${
                              cond.tmSign === '-'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            }`}
                            title={cond.tmSign === '+' ? 'Positive Melting Peak (+)' : 'Negative Trough / Blue Shift (−)'}
                          >
                            {cond.tmSign}
                          </span>
                          {cond.tm.toFixed(2)}
                        </td>
                        <td class="py-2 px-2 font-mono font-bold text-right">
                          {isRef ? (
                            <span class="text-slate-500 dark:text-slate-400">0.00</span>
                          ) : cond.deltaTm >= 2.0 ? (
                            <span class="text-emerald-700 dark:text-emerald-400 font-bold">
                              +{cond.deltaTm.toFixed(2)}
                            </span>
                          ) : cond.deltaTm <= -2.0 ? (
                            <span class="text-rose-700 dark:text-rose-400 font-bold">
                              {cond.deltaTm.toFixed(2)}
                            </span>
                          ) : (
                            <span class="text-slate-600 dark:text-slate-400">
                              {cond.deltaTm > 0 ? `+${cond.deltaTm.toFixed(2)}` : cond.deltaTm.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td class="py-2 px-2">
                          <div class="flex flex-wrap gap-1 items-center max-w-xs">
                            {cond.peaks.map((p, pIdx) => (
                              <span
                                key={pIdx}
                                class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                  p.sign === '+'
                                    ? 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                                    : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                } ${p.isPrimary ? 'ring-1 ring-accent-500 font-bold' : 'font-medium'}`}
                                title={`${p.label} (${p.direction}): ${p.temperature.toFixed(2)}°C, height: ${p.height.toFixed(2)} · Click × to remove false peak`}
                              >
                                <span class="font-extrabold">{p.sign}</span>
                                <span>{p.label.replace(/^[+-]/, '')}:</span>
                                <span>{p.temperature.toFixed(1)}°C</span>
                                <button
                                  type="button"
                                  title="Remove this false peak"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemovePeak(cond.id, p);
                                  }}
                                  class="ml-0.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 font-bold leading-none cursor-pointer"
                                  aria-label={`Remove false peak ${p.label} from ${cond.name}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {cond.peaks.length === 0 && (
                              <span class="text-slate-500 dark:text-slate-400 italic text-[11px]">No peaks</span>
                            )}
                          </div>
                        </td>
                        <td class="py-2 px-2 font-mono text-right text-slate-600 dark:text-slate-400">
                          {cond.primaryPeak ? cond.primaryPeak.height.toFixed(2) : '—'}
                        </td>
                        <td class="py-2 px-2 font-mono text-right text-slate-600 dark:text-slate-400">
                          {cond.boltzmannFit ? cond.boltzmannFit.r2.toFixed(3) : '—'}
                        </td>
                        <td class="py-2 px-2 font-mono text-right text-slate-600 dark:text-slate-400">
                          {cond.boltzmannFit ? cond.boltzmannFit.deltaHunf_kJ.toFixed(0) : '—'}
                        </td>
                        <td class="py-2 px-2 text-center">
                          {isRef ? (
                            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              Reference
                            </span>
                          ) : cond.effect === 'strong_stabilizer' ? (
                            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Strong Stabilizer (≥ +4°C)
                            </span>
                          ) : cond.effect === 'moderate_stabilizer' ? (
                            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              Moderate (+2 to +4°C)
                            </span>
                          ) : cond.effect === 'destabilizer' ? (
                            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Destabilizer (≤ -2°C)
                            </span>
                          ) : (
                            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Neutral
                            </span>
                          )}
                        </td>
                        <td class="py-2 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="radio"
                            name="ref-condition-radio"
                            checked={isRef}
                            onChange={() => set({ referenceConditionId: cond.id })}
                            class="text-accent-600 dark:text-accent-400 accent-accent-600 cursor-pointer"
                            title="Set as reference condition"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Single Condition Inspector Card */}
          {activeCondition && (
            <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
              <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                <div>
                  <h4 class="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Condition Detail: {activeCondition.name}
                  </h4>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeCondition.channel ? `Channel: ${activeCondition.channel.toUpperCase()} · ` : ''}
                    Transition statistics and thermodynamics
                  </p>
                </div>
                {activeCondition.id !== analysis.referenceConditionId && (
                  <button
                    type="button"
                    onClick={() => set({ referenceConditionId: activeCondition.id })}
                    class="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Set as Reference
                  </button>
                )}
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div class="text-slate-500 dark:text-slate-400 flex items-center justify-between text-[11px] mb-0.5">
                    <span>1st Deriv Tm</span>
                    <span class={`text-[10px] px-1 py-0.2 rounded font-bold ${activeCondition.tmSign === '-' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'}`}>
                      {activeCondition.tmSign === '+' ? '+ Melt Peak' : '− Trough'}
                    </span>
                  </div>
                  <span class="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                    {activeCondition.tmDerivative !== null ? `${activeCondition.tmSign}${activeCondition.tmDerivative.toFixed(2)} °C` : '—'}
                  </span>
                  <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Parabolic peak vertex</span>
                </div>

                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Boltzmann Midpoint</span>
                  <span class="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                    {activeCondition.tmBoltzmann !== null ? `${activeCondition.tmBoltzmann.toFixed(2)} °C` : '—'}
                  </span>
                  <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    {activeCondition.boltzmannFit ? `R² = ${activeCondition.boltzmannFit.r2.toFixed(3)}` : 'No fit'}
                  </span>
                </div>

                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Slope Factor (a)</span>
                  <span class="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                    {activeCondition.boltzmannFit ? `${activeCondition.boltzmannFit.a.toFixed(2)} °C` : '—'}
                  </span>
                  <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Transition width</span>
                </div>

                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span class="text-slate-500 dark:text-slate-400 block text-[11px]">Apparent ΔH_unf</span>
                  <span class="font-mono text-base font-bold text-indigo-600 dark:text-indigo-400">
                    {activeCondition.boltzmannFit ? `${activeCondition.boltzmannFit.deltaHunf_kJ.toFixed(0)} kJ/mol` : '—'}
                  </span>
                  <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">van 't Hoff enthalpy</span>
                </div>
              </div>

              {activeCondition.peaks.length > 0 ? (
                <div class="pt-2 space-y-1.5">
                  <div class="flex items-center justify-between">
                    <span class="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Detected Transition Peaks & Troughs ({activeCondition.peaks.length}):
                    </span>
                    <div class="flex items-center gap-2">
                      {s.removedPeakKeys.some(k => k.startsWith(`${activeCondition.id}:`)) && (
                        <button
                          type="button"
                          onClick={() => handleRestorePeaksForCondition(activeCondition.id)}
                          class="text-[11px] text-accent-600 dark:text-accent-400 hover:underline font-semibold"
                        >
                          ↺ Restore Removed Peaks
                        </button>
                      )}
                      <span class="text-[10px] text-slate-500 dark:text-slate-400">
                        (+) Upward melt · (−) Downward trough
                      </span>
                    </div>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {activeCondition.peaks.map((p, pIdx) => (
                      <div
                        key={pIdx}
                        class={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                          p.sign === '+'
                            ? 'bg-sky-50/60 border-sky-200 text-sky-900 dark:bg-sky-950/20 dark:border-sky-800 dark:text-sky-200'
                            : 'bg-amber-50/60 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-200'
                        } ${p.isPrimary ? 'ring-2 ring-accent-500 shadow-sm' : ''}`}
                      >
                        <div class="flex items-center justify-between font-mono font-bold">
                          <span class="flex items-center gap-1">
                            <span class={`px-1.5 py-0.2 rounded text-[10px] font-extrabold ${p.sign === '+' ? 'bg-sky-200 text-sky-800 dark:bg-sky-900 dark:text-sky-200' : 'bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}`}>
                              {p.sign}
                            </span>
                            <span>{p.label}</span>
                          </span>
                          <div class="flex items-center gap-1.5">
                            <span class="text-sm">{p.temperature.toFixed(1)} °C</span>
                            <button
                              type="button"
                              title="Remove this false peak"
                              onClick={() => handleRemovePeak(activeCondition.id, p)}
                              class="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900/50 text-slate-500 dark:text-slate-400 hover:text-rose-600 transition"
                              aria-label={`Remove false peak ${p.label}`}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <div class="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between mt-1 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                          <span>Height: {p.height.toFixed(2)}</span>
                          <span>Prominence: {p.prominence.toFixed(2)}</span>
                          {p.isPrimary && <span class="font-bold text-accent-600 dark:text-accent-400 uppercase text-[9px]">Primary</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div class="pt-2 p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
                  <span>No transition peaks detected (or false peaks were removed).</span>
                  {s.removedPeakKeys.some(k => k.startsWith(`${activeCondition.id}:`)) && (
                    <button
                      type="button"
                      onClick={() => handleRestorePeaksForCondition(activeCondition.id)}
                      class="text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline"
                    >
                      ↺ Restore Removed Peaks
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
