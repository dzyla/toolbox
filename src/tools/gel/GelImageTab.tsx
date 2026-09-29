import { formatSize } from '@/core/gel/calibration';
import type { GelWorkspace } from './workspace';

/** Gel tab: annotated gel canvas and the densitometry profile of the selected lane. */
export function GelImageTab({ g }: { g: GelWorkspace }) {
  const {
    activeLadder,
    canvasCursor,
    canvasRef,
    canvasZoom,
    effectiveLadderLaneId,
    gelLayout,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleProfileSvgClick,
    laneAnalysis,
    laneStripDataUrl,
    ladderSizeMap,
    plane,
    removePeakFromLane,
    s,
    selectedLane,
    selectedLaneIdx,
    set,
    setBandMap,
    setCanvasZoom,
    setGelLayout,
    setLadderSizeMap,
    setShowLaneHeaders,
    setShowMwLabels,
    showLaneHeaders,
    showMwLabels,
  } = g;
  return (
    <div
      class={
        s.viewTab === 'gel' ? (gelLayout === 'stacked' ? 'space-y-4' : 'grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]') : 'hidden'
      }
    >
      {/* Gel Canvas Card */}
      <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">Gel Image & Annotations</h3>
            <span class="text-xs text-slate-500 dark:text-slate-400 mono">{plane ? `${plane.width} × ${plane.height} px` : ''}</span>
          </div>
          <div class="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            {/* Layout switcher */}
            <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setGelLayout('split')}
                class={`px-2 py-0.5 rounded font-medium transition ${
                  gelLayout === 'split' ? 'bg-accent-600 text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
                title="Side-by-side view with lane profile"
              >
                🪟 Side-by-Side
              </button>
              <button
                type="button"
                onClick={() => setGelLayout('stacked')}
                class={`px-2 py-0.5 rounded font-medium transition ${
                  gelLayout === 'stacked' ? 'bg-accent-600 text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
                title="Full width large image view"
              >
                📄 Large Image (Stacked)
              </button>
            </div>

            {/* Zoom selector */}
            <div class="flex items-center gap-1 text-[11px]">
              <span class="text-slate-500 dark:text-slate-400">Zoom:</span>
              {[100, 125, 150].map(z => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setCanvasZoom(z)}
                  class={`px-1.5 py-0.5 rounded border text-[10px] ${
                    canvasZoom === z
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {z}%
                </button>
              ))}
            </div>

            <label class="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showLaneHeaders}
                onChange={e => setShowLaneHeaders((e.target as HTMLInputElement).checked)}
                class="rounded"
              />
              Headers
            </label>
            <label class="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showMwLabels}
                onChange={e => setShowMwLabels((e.target as HTMLInputElement).checked)}
                class="rounded"
              />
              MW Tags
            </label>
          </div>
        </div>

        {/* Compact gesture hints */}
        <div class="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-1 py-0.5">
          <span>
            <strong>Shift+Click</strong> = place lane · <strong>Shift+Click</strong> in lane = add band · <strong>Ctrl+Click</strong> band =
            remove
          </span>
          {selectedLane && (
            <span class="text-accent-600 dark:text-accent-400 font-semibold text-[11px]">Active: L{selectedLaneIdx + 1}</span>
          )}
        </div>

        <div class="overflow-auto max-h-[850px] border border-slate-200 rounded-xl dark:border-slate-800 flex justify-center bg-slate-950/5 p-2">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
              cursor: canvasCursor,
              width: canvasZoom !== 100 ? `${canvasZoom}%` : undefined,
              maxWidth: canvasZoom > 100 ? `${canvasZoom}%` : '100%',
            }}
            class="h-auto block select-none rounded shadow-2xs"
            title="Click or drag lanes. Shift+Click to add band, Ctrl+click to remove."
          />
        </div>
      </div>

      {/* Densitometry Profile Card for Active Lane */}
      <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5 dark:border-slate-800">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">Densitometry Profile — Lane {selectedLaneIdx + 1}</h3>
              {selectedLane && selectedLane.id === s.ladderLaneId && (
                <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  🏷️ Standard Ladder Lane
                </span>
              )}
              {selectedLane && selectedLane.id === s.loadingRefLaneId && (
                <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                  ⚖️ Loading Ref
                </span>
              )}
              {selectedLane && selectedLane.id === s.massLaneId && (
                <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                  📊 Mass Std
                </span>
              )}
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Migration distance $Y$ (top → bottom) vs band optical density & physical lane strip
            </p>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              Click a band to set ref/move · <kbd class="font-mono">Shift</kbd>+Click to add · <kbd class="font-mono">Ctrl</kbd>/
              <kbd class="font-mono">Cmd</kbd>+Click to remove — bands auto-fit to the real peak
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3 text-xs">
            {selectedLane && (
              <div class="flex flex-wrap items-center gap-1.5">
                {selectedLane.id === s.ladderLaneId ? (
                  <button
                    type="button"
                    onClick={() => set({ ladderLaneId: '' })}
                    class="px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                    title="Unset standard ladder designation"
                  >
                    ✕ Unset Ladder
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => set({ ladderLaneId: selectedLane.id })}
                    class="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition shadow-2xs"
                    title="Set this lane as the Molecular Weight Standard Ladder"
                  >
                    ⭐ Set as Standard Ladder
                  </button>
                )}
                {selectedLane.id === s.loadingRefLaneId ? (
                  <button
                    type="button"
                    onClick={() => set({ loadingRefLaneId: '' })}
                    class="px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                    title="Unset loading reference designation"
                  >
                    ✕ Unset Loading Ref
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => set({ loadingRefLaneId: selectedLane.id })}
                    class="px-2 py-1 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition shadow-2xs"
                    title="Set this lane as the Loading Reference"
                  >
                    ⚖️ Set as Loading Ref
                  </button>
                )}
              </div>
            )}
            <div class="flex items-center gap-2 border-l border-slate-200 dark:border-slate-700 pl-2">
              <span class="flex items-center gap-1.5 font-medium text-accent-600 dark:text-accent-400">
                <span class="w-3 h-0.5 bg-accent-600 rounded"></span> Signal
              </span>
              <span class="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                <span class="w-3 h-0.5 bg-amber-500 rounded border-t border-dashed"></span> Baseline
              </span>
            </div>
          </div>
        </div>

        {laneAnalysis && laneAnalysis.profile.length > 0 ? (
          <div class="space-y-3">
            <svg
              viewBox="0 0 500 280"
              onClick={handleProfileSvgClick}
              class="w-full h-auto rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 select-none cursor-crosshair"
            >
              {/* Grid Lines */}
              <line x1="40" y1="20" x2="40" y2="180" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.3" />
              <line x1="40" y1="180" x2="480" y2="180" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.3" />

              {/* Signal Curve */}
              <path
                d={laneAnalysis.profile.reduce((acc, val, i) => {
                  const x = 40 + (i / laneAnalysis.profile.length) * 440;
                  const y = 180 - Math.min(1, Math.max(0, val)) * 155;
                  return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                }, '')}
                fill="none"
                stroke="#2563eb"
                stroke-width="1.8"
              />

              {/* Baseline Curve */}
              <path
                d={laneAnalysis.baseline.reduce((acc, val, i) => {
                  const x = 40 + (i / laneAnalysis.baseline.length) * 440;
                  const y = 180 - Math.min(1, Math.max(0, val)) * 155;
                  return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                }, '')}
                fill="none"
                stroke="#f59e0b"
                stroke-dasharray="3 3"
                stroke-width="1.5"
              />

              {/* Physical Lane Strip Section */}
              <text x="40" y="197" font-size="8.5" font-weight="bold" fill="#64748b" letter-spacing="0.4">
                PHYSICAL LANE STRIP (GEL BANDS UNDER PROFILE)
              </text>

              {laneStripDataUrl && <image x="40" y="203" width="440" height="38" href={laneStripDataUrl} preserveAspectRatio="none" />}
              <rect x="40" y="203" width="440" height="38" fill="none" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.5" rx="2" />

              {/* Peak Markers, Vertical Alignment Guides, and Tags */}
              {laneAnalysis.metrics.map(m => {
                if (m.peakY === undefined) return null;
                const frac = m.peakY / (laneAnalysis.lane.y1 - laneAnalysis.lane.y0 || 1);
                const px = 40 + frac * 440;
                const val =
                  laneAnalysis.profile[Math.min(laneAnalysis.profile.length - 1, Math.round(frac * laneAnalysis.profile.length))] ?? 0;
                const py = 180 - Math.min(1, Math.max(0, val)) * 155;
                const isRef = m.bandId === s.refBandId;

                return (
                  <g
                    key={m.bandId}
                    class="cursor-pointer"
                    onClick={e => {
                      e.stopPropagation();
                      if (e.ctrlKey || e.metaKey) {
                        if (selectedLane) removePeakFromLane(selectedLane.id, m.bandId);
                      } else {
                        set({ refBandId: m.bandId });
                      }
                    }}
                  >
                    {/* Vertical alignment line from curve down to top edge of lane strip (stops at y=201, DOES NOT cross the raw image) */}
                    <line
                      x1={px}
                      y1={py}
                      x2={px}
                      y2="201"
                      stroke={isRef ? '#10b981' : '#ef4444'}
                      stroke-width="1.2"
                      stroke-dasharray="2 2"
                      stroke-opacity="0.85"
                    />

                    {/* Top alignment tick line pointing to lane strip (does not cross image) */}
                    <line x1={px} y1="197" x2={px} y2="202" stroke={isRef ? '#10b981' : '#ef4444'} stroke-width="2" />

                    {/* Bottom alignment tick line pointing from lane strip down to the remove badge (does not cross image) */}
                    <line x1={px} y1="242" x2={px} y2="257" stroke={isRef ? '#10b981' : '#ef4444'} stroke-width="2" />

                    {/* Dot on curve */}
                    <circle cx={px} cy={py} r={isRef ? 5 : 4} fill={isRef ? '#10b981' : '#ef4444'} stroke="#ffffff" stroke-width="1.5" />

                    {/* Number above curve */}
                    <text x={px} y={py - 6} font-size="9" text-anchor="middle" fill="#64748b" font-weight="bold">
                      #{m.number}
                    </text>

                    {/* Remove-band (✕) badge in a dedicated row beneath the physical lane strip,
                                centred on this band's peak. Kept off the strip itself so the gel bands
                                stay clean and easy to read; click to remove the band (Ctrl/Cmd+Click on
                                the marker above still works). */}
                    <g
                      class="cursor-pointer"
                      onClick={e => {
                        e.stopPropagation();
                        if (selectedLane) removePeakFromLane(selectedLane.id, m.bandId);
                      }}
                      title={`Remove Band #${m.number} from Lane ${selectedLaneIdx + 1}`}
                    >
                      <circle
                        cx={px}
                        cy="265"
                        r="8.5"
                        fill="rgba(15, 23, 42, 0.72)"
                        stroke={isRef ? '#10b981' : '#f87171'}
                        stroke-width="1.2"
                      />
                      <text
                        x={px}
                        y="268.6"
                        font-size="10"
                        font-weight="bold"
                        text-anchor="middle"
                        fill={isRef ? '#a7f3d0' : '#fecaca'}
                        class="pointer-events-none"
                      >
                        ✕
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>

            {/* Detected Peaks Table with Remove Option */}
            <div class="space-y-2 pt-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Detected Peaks in Lane {selectedLaneIdx + 1} ({laneAnalysis.metrics.length})
                </span>
                {laneAnalysis.metrics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedLane) return;
                      setBandMap(prev => ({ ...prev, [selectedLane.id]: [] }));
                      if (s.refBandId) set({ refBandId: '' });
                    }}
                    class="text-[11px] text-rose-700 dark:text-rose-400 hover:underline font-medium"
                    title="Remove all peaks in this lane"
                  >
                    Clear All Peaks in Lane
                  </button>
                )}
              </div>

              {laneAnalysis.metrics.length > 0 ? (
                <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table class="w-full text-xs text-left">
                    <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th class="px-3 py-2 font-semibold">Peak #</th>
                        <th class="px-3 py-2 font-semibold">Position (Y)</th>
                        <th class="px-3 py-2 font-semibold">Est. Mass / Size</th>
                        <th class="px-3 py-2 font-semibold text-right">Peak OD</th>
                        <th class="px-3 py-2 font-semibold text-right">Net Signal</th>
                        <th class="px-3 py-2 font-semibold text-right">Lane Share</th>
                        <th class="px-3 py-2 font-semibold text-center">Ref</th>
                        <th class="px-3 py-2 font-semibold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {(() => {
                        const isLadderLane = selectedLane?.id === effectiveLadderLaneId;
                        return laneAnalysis.metrics.map(m => {
                          const isRef = m.bandId === s.refBandId;
                          const peakIdx = Math.min(laneAnalysis.profile.length - 1, Math.round(m.peakY ?? 0));
                          const peakVal = laneAnalysis.profile[peakIdx] ?? 0;
                          return (
                            <tr
                              key={m.bandId}
                              class={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                                isRef ? 'bg-emerald-50/60 dark:bg-emerald-950/25' : ''
                              }`}
                            >
                              <td class="px-3 py-2 font-bold">
                                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px]">
                                  {m.number}
                                </span>
                              </td>
                              <td class="px-3 py-2 mono text-slate-600 dark:text-slate-400">
                                {m.peakY !== undefined ? `${m.peakY.toFixed(1)} px` : '-'}
                              </td>
                              <td class="px-3 py-2">
                                {isLadderLane ? (
                                  <div class="flex items-center gap-1.5">
                                    <label class="sr-only" for={`ladder-size-${m.bandId}`}>Assigned ladder size</label>
                                    <select
                                      id={`ladder-size-${m.bandId}`}
                                      class="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] px-1 py-0.5"
                                      value={ladderSizeMap[m.bandId] === null ? 'exclude' : String(m.ladderAssigned ?? '')}
                                      onChange={e => {
                                        const v = (e.target as HTMLSelectElement).value;
                                        setLadderSizeMap(prev => { const n = { ...prev }; if (v === '') delete n[m.bandId]; else n[m.bandId] = v === 'exclude' ? null : Number(v); return n; });
                                      }}
                                    >
                                      <option value="">Auto</option>
                                      {[...activeLadder.sizes].sort((a, b) => b - a).map(sz => <option value={String(sz)}>{formatSize(sz, activeLadder.kind)}</option>)}
                                      <option value="exclude">Exclude</option>
                                    </select>
                                    <span class="text-[10px] text-slate-500 dark:text-slate-400">Assigned</span>
                                    {m.sizeEst !== null && <span class="mono text-[11px]">fit {formatSize(m.sizeEst, activeLadder.kind)}</span>}
                                    {m.sizeResidualPct !== null && (
                                      <span class={`mono text-[10px] ${Math.abs(m.sizeResidualPct) > 5 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                        Δ {m.sizeResidualPct.toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                ) : m.sizeEst ? (
                                  <span class="font-bold text-accent-600 dark:text-accent-400">
                                    {formatSize(m.sizeEst, activeLadder.kind)}
                                  </span>
                                ) : (
                                  <span class="text-slate-500 dark:text-slate-400 font-normal">Uncalibrated</span>
                                )}
                              </td>
                              <td class="px-3 py-2 mono text-right text-slate-600 dark:text-slate-400">{peakVal.toFixed(3)}</td>
                              <td class="px-3 py-2 mono text-right font-semibold text-slate-900 dark:text-slate-100">{m.net.toFixed(1)}</td>
                              <td class="px-3 py-2 mono text-right font-medium text-slate-700 dark:text-slate-300">
                                {m.share.toFixed(1)}%
                              </td>
                              <td class="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => set({ refBandId: isRef ? '' : m.bandId })}
                                  class={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                    isRef
                                      ? 'bg-emerald-700 text-white shadow-2xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                                  title={isRef ? 'Active Reference Band' : 'Set as Reference Band'}
                                >
                                  {isRef ? '✓ Ref' : 'Set'}
                                </button>
                              </td>
                              <td class="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedLane) removePeakFromLane(selectedLane.id, m.bandId);
                                  }}
                                  class="px-2 py-1 rounded text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition inline-flex items-center gap-1"
                                  title="Remove peak from lane"
                                >
                                  ✕ Remove
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p class="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                  No bands detected in this lane. Click on the gel image or lane strip to add bands.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p class="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">No densitometry profile data available for this lane.</p>
        )}
      </div>
    </div>
  );
}
