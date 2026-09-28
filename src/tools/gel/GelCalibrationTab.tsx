import { formatSize, MASS_STANDARD_PRESETS, type MassCalibrationModel } from '@/core/gel/calibration';
import { LADDERS } from './workspace';
import type { GelWorkspace } from './workspace';

/** Calibration tab: molecular-weight and mass-densitometry standard curves. */
export function GelCalibrationTab({ g }: { g: GelWorkspace }) {
  const {
    activeLadder,
    calibration,
    customLadders,
    customMassMap,
    laneAnalysis,
    laneLabels,
    lanes,
    massCalibration,
    s,
    selectedLane,
    set,
    setCustomMassMap,
  } = g;
  return (
    <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div>
          <h3 class="font-bold text-base text-slate-900 dark:text-slate-100">
            {s.calibSubTab === 'mw' ? 'Molecular Weight Calibration Curve' : 'Mass Densitometry Calibration Curve'}
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {s.calibSubTab === 'mw'
              ? 'Semi-log regression: Migration distance Y (pixels) vs Log₁₀(Molecular Weight / Size)'
              : 'Densitometric Mass Quantification: Net Optical Density (OD · px) vs Known Mass (ng / µg)'}
          </p>
        </div>

        <div class="flex items-center gap-3">
          {/* Sub-tab switcher */}
          <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950 text-xs">
            <button
              type="button"
              onClick={() => set({ calibSubTab: 'mw' })}
              class={`px-3 py-1.5 font-semibold rounded-md transition ${s.calibSubTab === 'mw' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Molecular Weight (MW)
            </button>
            <button
              type="button"
              onClick={() => set({ calibSubTab: 'mass' })}
              class={`px-3 py-1.5 font-semibold rounded-md transition ${s.calibSubTab === 'mass' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Mass / Densitometry (ng)
            </button>
          </div>

          {s.calibSubTab === 'mw' && calibration && (
            <div class="hidden sm:flex items-center gap-3 text-xs">
              <span class="font-medium text-slate-500 dark:text-slate-400">
                Model: <strong class="text-slate-800 dark:text-slate-200">{s.calibMethod}</strong>
              </span>
              {calibration.r2 !== undefined && (
                <span class="font-medium text-slate-500 dark:text-slate-400">
                  R²: <strong class="text-emerald-700 dark:text-emerald-400">{calibration.r2.toFixed(4)}</strong>
                </span>
              )}
            </div>
          )}

          {s.calibSubTab === 'mass' && massCalibration && (
            <div class="hidden sm:flex items-center gap-3 text-xs">
              <span class="font-medium text-slate-500 dark:text-slate-400">
                Model: <strong class="text-slate-800 dark:text-slate-200">{s.massCalibMethod}</strong>
              </span>
              <span class="font-medium text-slate-500 dark:text-slate-400">
                R²: <strong class="text-emerald-700 dark:text-emerald-400">{massCalibration.r2.toFixed(4)}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {s.calibSubTab === 'mw' ? (
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <div class="flex flex-wrap items-center gap-3">
              <div>
                <span class="text-slate-500 dark:text-slate-400 font-medium mr-1.5">Ladder Lane:</span>
                <select
                  aria-label="Ladder Lane"
                  value={s.ladderLaneId}
                  onChange={e => set({ ladderLaneId: (e.target as HTMLSelectElement).value })}
                  class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold"
                >
                  <option value="">Select standard ladder lane…</option>
                  {lanes.map((l, i) => (
                    <option key={l.id} value={l.id}>
                      Lane {i + 1}
                      {laneLabels[l.id] ? ` (${laneLabels[l.id]})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span class="text-slate-500 dark:text-slate-400 font-medium mr-1.5">Ladder Preset:</span>
                <select
                  aria-label="Ladder Preset"
                  value={s.ladderId}
                  onChange={e => set({ ladderId: (e.target as HTMLSelectElement).value })}
                  class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold"
                >
                  <optgroup label="Built-in Standard Ladders">
                    {LADDERS.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name} [{l.kind.toUpperCase()}]
                      </option>
                    ))}
                  </optgroup>
                  {customLadders.length > 0 && (
                    <optgroup label="Custom Uploaded Ladders">
                      {customLadders.map(l => (
                        <option key={l.id} value={l.id}>
                          ⭐ {l.name} [{l.kind.toUpperCase()}]
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <span class="text-slate-500 dark:text-slate-400 font-medium mr-1.5">Regression Model:</span>
                <select
                  aria-label="Regression Model"
                  value={s.calibMethod}
                  onChange={e => set({ calibMethod: (e.target as HTMLSelectElement).value as 'linear' | 'piecewise' | 'spline' })}
                  class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold"
                >
                  <option value="piecewise">Piecewise Log-Linear</option>
                  <option value="linear">Global Log-Linear (y = mx + b)</option>
                  <option value="spline">Monotonic Cubic Spline</option>
                </select>
              </div>
            </div>

            {calibration && (
              <div class="flex items-center gap-3 font-mono">
                <span class="text-slate-600 dark:text-slate-400 font-semibold">{calibration.points.length} standards paired</span>
                {calibration.r2 !== undefined && (
                  <span class="text-emerald-700 dark:text-emerald-400 font-bold">R² = {calibration.r2.toFixed(4)}</span>
                )}
              </div>
            )}
          </div>

          {calibration && calibration.points.length >= 2 ? (
            <div class="space-y-4">
              <svg
                viewBox="0 0 600 320"
                class="w-full h-auto rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                {/* Axes */}
                <line x1="60" y1="20" x2="60" y2="270" stroke="#94a3b8" stroke-width="1.5" />
                <line x1="60" y1="270" x2="570" y2="270" stroke="#94a3b8" stroke-width="1.5" />

                {/* Axis Labels */}
                <text x="315" y="305" font-size="11" text-anchor="middle" fill="#64748b" font-weight="600">
                  Migration Distance Y along Lane (px)
                </text>
                <text transform="rotate(-90 20 145)" x="20" y="145" font-size="11" text-anchor="middle" fill="#64748b" font-weight="600">
                  Log₁₀(Size / MW)
                </text>

                {/* Compute min/max for scale */}
                {(() => {
                  const pts = calibration.points;
                  const minY = Math.min(...pts.map(p => p.y));
                  const maxY = Math.max(...pts.map(p => p.y));
                  const rangeY = Math.max(20, maxY - minY);

                  const minLog = Math.min(...pts.map(p => Math.log10(p.size)));
                  const maxLog = Math.max(...pts.map(p => Math.log10(p.size)));
                  const rangeLog = Math.max(0.5, maxLog - minLog);

                  // Curve points
                  const curveSteps = 50;
                  const curvePts: [number, number][] = [];
                  for (let step = 0; step <= curveSteps; step++) {
                    const yVal = minY + (step / curveSteps) * rangeY;
                    const sz = calibration.sizeAt(yVal);
                    if (sz > 0) {
                      const xSvg = 60 + ((yVal - minY) / rangeY) * 500;
                      const ySvg = 270 - ((Math.log10(sz) - minLog) / rangeLog) * 240;
                      curvePts.push([xSvg, ySvg]);
                    }
                  }

                  return (
                    <>
                      {/* Regression Fitted Curve */}
                      {curvePts.length > 1 && (
                        <path
                          d={curvePts.reduce((acc, [cx, cy], i) => (i === 0 ? `M ${cx} ${cy}` : `${acc} L ${cx} ${cy}`), '')}
                          fill="none"
                          stroke="#2563eb"
                          stroke-width="2.5"
                        />
                      )}

                      {/* Standard Ladder Markers */}
                      {pts.map((pt, i) => {
                        const sx = 60 + ((pt.y - minY) / rangeY) * 500;
                        const sy = 270 - ((Math.log10(pt.size) - minLog) / rangeLog) * 240;
                        return (
                          <g key={i}>
                            <circle cx={sx} cy={sy} r="5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" />
                            <text x={sx} y={sy - 9} font-size="9" text-anchor="middle" fill="#d97706" font-weight="bold">
                              {formatSize(pt.size, activeLadder.kind)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Unknown sample bands projected onto curve */}
                      {selectedLane &&
                        laneAnalysis &&
                        laneAnalysis.metrics.map(m => {
                          if (m.peakY === undefined || m.sizeEst === null) return null;
                          const sx = 60 + ((m.peakY - minY) / rangeY) * 500;
                          const sy = 270 - ((Math.log10(m.sizeEst) - minLog) / rangeLog) * 240;
                          return (
                            <g key={m.bandId}>
                              <polygon
                                points={`${sx},${sy - 5} ${sx + 5},${sy} ${sx},${sy + 5} ${sx - 5},${sy}`}
                                fill="#10b981"
                                stroke="#ffffff"
                                stroke-width="1.2"
                              />
                            </g>
                          );
                        })}
                    </>
                  );
                })()}
              </svg>

              <div class="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                <div class="flex items-center gap-4">
                  <span class="flex items-center gap-1.5">
                    <span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Standard Ladder Points
                  </span>
                  <span class="flex items-center gap-1.5">
                    <span class="w-4 h-0.5 bg-accent-600 inline-block"></span> Fitted Standard Curve
                  </span>
                  <span class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rotate-45 bg-emerald-500 inline-block"></span> Sample Bands (Interpolated)
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div class="py-12 text-center text-slate-500 dark:text-slate-400 text-xs">
              Please select a standard ladder lane with at least 2 detected bands in the left sidebar to plot the molecular weight
              calibration curve.
            </div>
          )}
        </div>
      ) : (
        /* Mass / Densitometry Sub-Tab */
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <div class="flex flex-wrap items-center gap-3">
              <div>
                <span class="text-slate-500 dark:text-slate-400 font-medium mr-1.5">Standard Lane / Well:</span>
                <select
                  aria-label="Standard Lane / Well"
                  value={s.massLaneId}
                  onChange={e => set({ massLaneId: (e.target as HTMLSelectElement).value })}
                  class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold"
                >
                  <option value="">Select Lane...</option>
                  {lanes.map((l, i) => (
                    <option key={l.id} value={l.id}>
                      Lane {i + 1} {laneLabels[l.id] ? `(${laneLabels[l.id]})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span class="text-slate-500 dark:text-slate-400 font-medium mr-1.5">Preset:</span>
                <select
                  aria-label="Preset"
                  value={s.massPresetId}
                  onChange={e => set({ massPresetId: (e.target as HTMLSelectElement).value })}
                  class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                >
                  {MASS_STANDARD_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span class="text-slate-500 dark:text-slate-400 font-medium mr-1.5">Model:</span>
                <select
                  aria-label="Model"
                  value={s.massCalibMethod}
                  onChange={e => set({ massCalibMethod: (e.target as HTMLSelectElement).value as MassCalibrationModel })}
                  class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="linear">Linear (y = mx + b)</option>
                  <option value="linear_zero">Linear Origin (y = mx)</option>
                  <option value="quadratic">Quadratic (Polynomial)</option>
                  <option value="power">Power Law</option>
                </select>
              </div>
            </div>

            {massCalibration && (
              <div class="flex items-center gap-3 font-mono">
                <span class="text-slate-600 dark:text-slate-400 font-semibold">{massCalibration.formula}</span>
                <span class="text-emerald-700 dark:text-emerald-400 font-bold">R² = {massCalibration.r2.toFixed(4)}</span>
              </div>
            )}
          </div>

          {massCalibration && massCalibration.points.length >= 2 ? (
            <div class="space-y-4">
              {/* SVG Plot for Mass Calibration */}
              <svg
                viewBox="0 0 600 320"
                class="w-full h-auto rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                {/* Axes */}
                <line x1="60" y1="20" x2="60" y2="270" stroke="#94a3b8" stroke-width="1.5" />
                <line x1="60" y1="270" x2="570" y2="270" stroke="#94a3b8" stroke-width="1.5" />

                <text x="315" y="305" font-size="11" text-anchor="middle" fill="#64748b" font-weight="600">
                  Net Optical Density / Integrated Intensity (OD · px)
                </text>
                <text transform="rotate(-90 20 145)" x="20" y="145" font-size="11" text-anchor="middle" fill="#64748b" font-weight="600">
                  Known Mass ({massCalibration.unit})
                </text>

                {(() => {
                  const pts = massCalibration.points;
                  const minX = 0;
                  const maxX = Math.max(10, Math.max(...pts.map(p => p.netIntensity)) * 1.15);
                  const rangeX = Math.max(1, maxX - minX);

                  const minY = 0;
                  const maxY = Math.max(10, Math.max(...pts.map(p => p.knownMass)) * 1.15);
                  const rangeY = Math.max(1, maxY - minY);

                  // Curve
                  const curveSteps = 60;
                  const curvePts: [number, number][] = [];
                  for (let sIdx = 0; sIdx <= curveSteps; sIdx++) {
                    const netVal = minX + (sIdx / curveSteps) * rangeX;
                    const massVal = massCalibration.massAt(netVal);
                    const xSvg = 60 + ((netVal - minX) / rangeX) * 500;
                    const ySvg = 270 - ((massVal - minY) / rangeY) * 240;
                    curvePts.push([xSvg, Math.max(20, Math.min(270, ySvg))]);
                  }

                  return (
                    <>
                      {/* Fitted Curve */}
                      {curvePts.length > 1 && (
                        <path
                          d={curvePts.reduce((acc, [cx, cy], i) => (i === 0 ? `M ${cx} ${cy}` : `${acc} L ${cx} ${cy}`), '')}
                          fill="none"
                          stroke="#10b981"
                          stroke-width="2.5"
                        />
                      )}

                      {/* Calibration Standard Points */}
                      {pts.map((pt, i) => {
                        const sx = 60 + ((pt.netIntensity - minX) / rangeX) * 500;
                        const sy = 270 - ((pt.knownMass - minY) / rangeY) * 240;
                        return (
                          <g key={i}>
                            <circle cx={sx} cy={sy} r="5.5" fill="#10b981" stroke="#ffffff" stroke-width="1.5" />
                            <text x={sx} y={sy - 9} font-size="9" text-anchor="middle" fill="#059669" font-weight="bold">
                              {pt.knownMass} {pt.unit || 'ng'}
                            </text>
                          </g>
                        );
                      })}

                      {/* Sample Bands from selected lane */}
                      {selectedLane &&
                        laneAnalysis &&
                        laneAnalysis.lane.id !== s.massLaneId &&
                        laneAnalysis.metrics.map(m => {
                          if (m.massEst === null || m.net <= 0) return null;
                          const sx = 60 + ((m.net - minX) / rangeX) * 500;
                          const sy = 270 - ((m.massEst - minY) / rangeY) * 240;
                          if (sx > 570 || sy < 20 || sy > 270) return null;
                          return (
                            <g key={m.bandId}>
                              <polygon
                                points={`${sx},${sy - 5} ${sx + 5},${sy} ${sx},${sy + 5} ${sx - 5},${sy}`}
                                fill="#3b82f6"
                                stroke="#ffffff"
                                stroke-width="1.2"
                              />
                            </g>
                          );
                        })}
                    </>
                  );
                })()}
              </svg>

              {/* Standards Table with inputs for user customization */}
              <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-white dark:bg-slate-900">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Standard Bands in Lane {lanes.findIndex(l => l.id === s.massLaneId) + 1}
                  </h4>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400">
                    Edit known mass for each band to customize standard curve
                  </span>
                </div>

                <div class="overflow-x-auto">
                  <table class="w-full text-xs text-left">
                    <thead class="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th class="p-2">Band #</th>
                        <th class="p-2">Net OD (Signal)</th>
                        <th class="p-2">Known Mass ({massCalibration.unit})</th>
                        <th class="p-2">Fitted Mass</th>
                        <th class="p-2">Residual Error</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {massCalibration.points.map((p, idx) => {
                        const res = massCalibration.residuals[idx];
                        return (
                          <tr key={p.bandId}>
                            <td class="p-2 font-bold font-sans">Band {idx + 1}</td>
                            <td class="p-2 font-bold">{p.netIntensity.toFixed(1)}</td>
                            <td class="p-2">
                              <input
                                type="number"
                                value={customMassMap[p.bandId] ?? p.knownMass}
                                onInput={e => {
                                  const val = parseFloat((e.target as HTMLInputElement).value);
                                  if (!isNaN(val) && val > 0) {
                                    setCustomMassMap(prev => ({ ...prev, [p.bandId]: val }));
                                  }
                                }}
                                class="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-bold font-mono"
                                step="any"
                              />
                            </td>
                            <td class="p-2 text-emerald-700 dark:text-emerald-400 font-bold">
                              {res?.fittedMass.toFixed(1)} {massCalibration.unit}
                            </td>
                            <td class="p-2 text-slate-500 dark:text-slate-400">{res ? `${(res.fraction * 100).toFixed(1)}%` : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div class="py-12 text-center text-slate-500 dark:text-slate-400 text-xs">
              Please select a lane with at least 2 detected bands in the dropdown above to calibrate mass densitometry.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
