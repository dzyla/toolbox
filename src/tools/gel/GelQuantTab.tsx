import { formatSize, formatMass } from '@/core/gel/calibration';
import { type LaneAnalysisItem } from './analysis';
import { isSaturated } from '@/core/gel/quant';
import { BandQuantChart } from './BandQuantChart';
import { GelGroupsView } from './GelGroupsView';
import { DataQualityPanel } from './DataQualityPanel';
import type { GelWorkspace } from './workspace';

/** Quantification tab: band table, lane loading and normalization across all lanes. */
export function GelQuantTab({ g }: { g: GelWorkspace }) {
  const {
    activeLadder,
    allLanesAnalysis,
    effectiveLadderLaneId,
    getLaneStripDataUrl,
    handleCopyMethods,
    handleExportCalibrationCsv,
    handleExportGroupCsv,
    handleExportMethods,
    handleExportTidyCsv,
    laneAnalysis,
    laneLabels,
    lanes,
    loadingStats,
    massCalibration,
    plane,
    qualityIssues,
    quantLayoutMode,
    removePeakFromLane,
    s,
    selectedLane,
    selectedLaneIdx,
    set,
    setQuantLayoutMode,
    setSelectedLaneId,
    setStripLanePrefix,
    stripLanePrefix,
  } = g;
  return (
    <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
      <DataQualityPanel issues={qualityIssues} />
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div>
          <h3 class="font-bold text-base text-slate-900 dark:text-slate-100">
            {s.quantSubView === 'groups'
              ? 'Conditions & Replicates'
              : s.quantSubView === 'loading'
              ? 'Whole-Lane Loading Comparison & Ponceau S / TPN Normalization'
              : 'Band Quantification & Relative Amounts'}
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {s.quantSubView === 'groups'
              ? 'Normalized target signal per lane, grouped by condition, with replicate statistics'
              : s.quantSubView === 'loading'
              ? 'Total integrated optical density across all lines to verify equal sample loading, CV%, and compute TPN correction factors'
              : 'Background-subtracted optical densities, relative percentage shares, and calibrated molecular weights'}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          {/* Sub-view toggle: Bands vs Loading */}
          <div class="flex flex-wrap max-w-full rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950 text-xs">
            <button
              type="button"
              onClick={() => set({ quantSubView: 'bands' })}
              class={`px-3 py-1.5 font-semibold rounded-md transition ${
                s.quantSubView === 'bands' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              🎯 Band Quantification
            </button>
            <button
              type="button"
              onClick={() => set({ quantSubView: 'loading' })}
              class={`px-3 py-1.5 font-semibold rounded-md transition ${
                s.quantSubView === 'loading' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              🧪 Line Loading (Ponceau S)
            </button>
            <button
              type="button"
              onClick={() => set({ quantSubView: 'groups' })}
              class={`px-3 py-1.5 font-semibold rounded-md transition ${
                s.quantSubView === 'groups' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              📊 Conditions & Replicates
            </button>
          </div>

          {s.quantSubView === 'bands' && (
            <>
              {/* Lane Cards vs Unified Table toggle */}
              <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setQuantLayoutMode('cards')}
                  class={`px-2.5 py-1 rounded-md font-medium transition ${
                    quantLayoutMode === 'cards'
                      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                  title="Show extracted gel strip alongside each lane table"
                >
                  🖼️ Strips &amp; Tables
                </button>
                <button
                  type="button"
                  onClick={() => setQuantLayoutMode('table')}
                  class={`px-2.5 py-1 rounded-md font-medium transition ${
                    quantLayoutMode === 'table'
                      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                  title="Show unified flat table"
                >
                  📄 Unified Table
                </button>
              </div>

              {/* All vs Selected lane filter */}
              <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => set({ tableMode: 'all' })}
                  class={`px-2.5 py-1 rounded-md font-medium transition ${
                    s.tableMode === 'all' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  All ({lanes.length})
                </button>
                <button
                  type="button"
                  onClick={() => set({ tableMode: 'selected' })}
                  class={`px-2.5 py-1 rounded-md font-medium transition ${
                    s.tableMode === 'selected' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Lane {selectedLaneIdx + 1}
                </button>
              </div>
            </>
          )}

          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={stripLanePrefix}
                onChange={e => setStripLanePrefix((e.target as HTMLInputElement).checked)}
                class="rounded border-slate-300 dark:border-slate-700 text-accent-600 dark:text-accent-400 focus:ring-accent-500"
              />
              <span>Omit L1/L2 prefix</span>
            </label>

            <button
              type="button"
              onClick={handleExportTidyCsv}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Bands CSV (tidy)
            </button>
            <button
              type="button"
              onClick={handleExportGroupCsv}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Condition summary CSV
            </button>
            <button
              type="button"
              onClick={handleExportCalibrationCsv}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Calibration CSV
            </button>
            <button
              type="button"
              onClick={handleExportMethods}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Methods text
            </button>
            <button
              type="button"
              onClick={handleCopyMethods}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Copy methods
            </button>
          </div>
        </div>
      </div>

      {s.quantSubView === 'groups' && <GelGroupsView g={g} />}

      {s.quantSubView === 'groups' ? null : s.quantSubView === 'loading' ? (
        /* LINE LOADING COMPARISON (PONCEAU S / TPN MODE) */
        <div class="space-y-4">
          {/* KPI Summary Dashboard */}
          <div class="grid gap-3 sm:grid-cols-4">
            <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3 space-y-1">
              <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Reference Line (Lane)
              </span>
              <select
                aria-label="Reference Line (Lane)"
                value={s.loadingRefLaneId || allLanesAnalysis[0]?.lane.id || ''}
                onChange={e => set({ loadingRefLaneId: (e.target as HTMLSelectElement).value })}
                class="w-full text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-800 font-semibold"
              >
                {allLanesAnalysis.map((item, idx) => (
                  <option key={item.lane.id} value={item.lane.id}>
                    Lane {idx + 1}
                    {laneLabels[item.lane.id] ? ` (${laneLabels[item.lane.id]})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3 space-y-1">
              <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Mean Whole-Lane Signal
              </span>
              <div class="text-base font-bold text-slate-900 dark:text-slate-100 mono">
                {loadingStats.mean.toFixed(1)} <span class="text-xs text-slate-500 dark:text-slate-400 font-normal">OD · px</span>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3 space-y-1">
              <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Loading Variation (CV%)
              </span>
              <div class="flex items-center gap-2">
                <span class="text-base font-bold mono text-slate-900 dark:text-slate-100">{loadingStats.cvPct === null ? '–' : `${loadingStats.cvPct.toFixed(1)}%`}</span>
                <span
                  class={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    (loadingStats.cvPct ?? 0) <= 10
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                      : (loadingStats.cvPct ?? 0) <= 20
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                  }`}
                >
                  {loadingStats.cvPct === null ? 'Needs ≥ 2 lanes' : (loadingStats.cvPct ?? 0) <= 10 ? 'Equal (≤10%)' : (loadingStats.cvPct ?? 0) <= 20 ? 'Moderate (10-20%)' : 'High Variation (>20%)'}
                </span>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3 space-y-1">
              <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Loading Quality
              </span>
              <div class="text-xs font-medium text-slate-700 dark:text-slate-300 pt-0.5">
                {loadingStats.cvPct === null
                  ? 'Loading variation needs at least 2 lanes with signal.'
                  : (loadingStats.cvPct ?? 0) <= 10
                  ? '✅ Equal loading verified. Proceed to target quantification.'
                  : (loadingStats.cvPct ?? 0) <= 20
                    ? '⚠️ Minor loading deviation. Apply TPN factor to correct bands.'
                    : '❌ Significant variation detected. Normalize target bands using TPN factor.'}
              </div>
            </div>
          </div>

          {/* Loading Chart — wired to the shared reference lane so the chart, its own
                      "Ref Loading Lane" dropdown, and the table below all stay in sync. */}
          <BandQuantChart
            analysis={allLanesAnalysis}
            ladderKind={activeLadder.kind}
            laneLabels={laneLabels}
            selectedLaneId={selectedLane?.id}
            onSelectLane={setSelectedLaneId}
            ladderLaneId={effectiveLadderLaneId}
            ladderSizes={activeLadder.sizes}
            initialMode="loading"
            loadingRefLaneId={s.loadingRefLaneId}
            onSetLoadingRefLane={laneId => set({ loadingRefLaneId: laneId })}
            plane={plane ?? undefined}
            display={
              plane
                ? {
                    minClip: s.minClip,
                    maxClip: s.maxClip,
                    gamma: s.gamma,
                    contrast: s.contrast,
                    brightness: s.brightness,
                    invert: s.invertDisplay,
                  }
                : undefined
            }
          />

          {/* Whole-Lane Loading Table with Extracted Gel Strips */}
          <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th class="px-3 py-2 font-semibold">Lane</th>
                  <th class="px-3 py-2 font-semibold min-w-[140px]">Physical Lane Strip</th>
                  <th class="px-3 py-2 font-semibold text-right">Total Integrated Signal</th>
                  <th class="px-3 py-2 font-semibold text-right">Bands Net Signal</th>
                  <th class="px-3 py-2 font-semibold text-right">Relative Ratio</th>
                  <th class="px-3 py-2 font-semibold text-right">Loading Deviation</th>
                  <th class="px-3 py-2 font-semibold text-right text-indigo-600 dark:text-indigo-400">TPN Factor</th>
                  <th class="px-3 py-2 font-semibold text-center">Status</th>
                  <th class="px-3 py-2 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                {allLanesAnalysis.map(item => {
                  const isRef = item.lane.id === (s.loadingRefLaneId || allLanesAnalysis[0]?.lane.id);
                  const customName = laneLabels[item.lane.id];
                  const dev = item.loadingDeviationPct;
                  const stripUrl = getLaneStripDataUrl(item.lane, 220, 24);

                  return (
                    <tr
                      key={item.lane.id}
                      class={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                        isRef ? 'bg-indigo-50/50 dark:bg-indigo-950/25' : ''
                      }`}
                    >
                      <td class="px-3 py-2.5 font-bold">
                        <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                          {customName ? `L${item.laneIdx + 1}: ${customName}` : `L${item.laneIdx + 1}`}
                        </span>
                      </td>
                      <td class="px-3 py-2">
                        {stripUrl && (
                          <img
                            src={stripUrl}
                            alt={`Lane ${item.laneIdx + 1} strip`}
                            class="h-6 w-44 rounded border border-slate-300 dark:border-slate-700 object-cover"
                          />
                        )}
                      </td>
                      <td class="px-3 py-2.5 mono text-right font-bold text-slate-900 dark:text-slate-100">
                        {item.totalLaneSignal.toFixed(1)}
                      </td>
                      <td class="px-3 py-2.5 mono text-right text-slate-500 dark:text-slate-400">{item.totalBandsSignal.toFixed(1)}</td>
                      <td class="px-3 py-2.5 mono text-right font-semibold">
                        {isRef ? (
                          <span class="text-indigo-600 dark:text-indigo-400 font-bold">1.000 (Ref)</span>
                        ) : (
                          `${item.loadingRatio.toFixed(3)}×`
                        )}
                      </td>
                      <td class="px-3 py-2.5 mono text-right font-medium">
                        {isRef ? (
                          <span class="text-slate-500 dark:text-slate-400">0.0%</span>
                        ) : (
                          <span
                            class={
                              Math.abs(dev) <= 10
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : Math.abs(dev) <= 20
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-rose-700 dark:text-rose-400'
                            }
                          >
                            {dev > 0 ? `+${dev.toFixed(1)}%` : `${dev.toFixed(1)}%`}
                          </span>
                        )}
                      </td>
                      <td class="px-3 py-2.5 mono text-right font-bold text-indigo-600 dark:text-indigo-400">
                        {item.normFactor.toFixed(3)}×
                      </td>
                      <td class="px-3 py-2.5 text-center">
                        {isRef ? (
                          <span class="rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-[10px] font-bold">
                            Reference Line
                          </span>
                        ) : Math.abs(dev) <= 15 ? (
                          <span class="rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                            Equal (±15%)
                          </span>
                        ) : dev > 15 ? (
                          <span class="rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                            Overloaded
                          </span>
                        ) : (
                          <span class="rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold">
                            Underloaded
                          </span>
                        )}
                      </td>
                      <td class="px-3 py-2.5 text-center">
                        {isRef ? (
                          <span class="text-indigo-600 dark:text-indigo-400 font-bold text-xs">✓ Active Ref</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => set({ loadingRefLaneId: item.lane.id })}
                            class="px-2 py-1 rounded text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                          >
                            Set as Ref
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Ponceau S & Total Protein Normalization (TPN) Guidance */}
          <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30 text-xs text-indigo-900 dark:text-indigo-200 space-y-1.5">
            <div class="font-bold flex items-center gap-1.5">
              <span>💡 Scientific Recommendation: Total Protein Normalization (Ponceau S / Coomassie)</span>
            </div>
            <p class="leading-relaxed">
              Leading journal guidelines (e.g. <em>Journal of Biological Chemistry</em>, <em>Nature</em>) mandate{' '}
              <strong>Total Protein Normalization (TPN)</strong> using reversible stains like Ponceau S or whole-lane Coomassie rather than
              single housekeeping genes (actin, tubulin, GAPDH). Housekeeping markers frequently saturate or vary under experimental
              treatments. Multiply your target protein band signal by the calculated <strong>TPN Factor</strong> to obtain rigorous,
              publication-grade normalized data.
            </p>
          </div>
        </div>
      ) : (
        /* BAND QUANTIFICATION & AMOUNTS (WITH EXTRACTED LANE STRIPS) */
        <div class="space-y-4">
          {/* Band Quantification Chart */}
          <BandQuantChart
            analysis={allLanesAnalysis}
            ladderKind={activeLadder.kind}
            laneLabels={laneLabels}
            selectedLaneId={selectedLane?.id}
            onSelectLane={setSelectedLaneId}
            ladderLaneId={effectiveLadderLaneId}
            ladderSizes={activeLadder.sizes}
            plane={plane ?? undefined}
            display={
              plane
                ? {
                    minClip: s.minClip,
                    maxClip: s.maxClip,
                    gamma: s.gamma,
                    contrast: s.contrast,
                    brightness: s.brightness,
                    invert: s.invertDisplay,
                  }
                : undefined
            }
          />

          {!allLanesAnalysis.some(a => a.metrics.some(m => m.bandId === s.refBandId)) && (
            <p class="text-xs text-slate-500 dark:text-slate-400">Ratio column: pick a reference band (the "Set" button in the Gel tab band table).</p>
          )}

          {quantLayoutMode === 'cards' ? (
            /* LANE CARDS WITH EXTRACTED GEL STRIPS CLOSE TO DATA TABLE */
            <div class="space-y-4">
              {(s.tableMode === 'all' ? allLanesAnalysis : ([laneAnalysis].filter(Boolean) as LaneAnalysisItem[])).map(item => {
                const isSelected = item.lane.id === selectedLane?.id;
                const isLadder = item.lane.id === s.ladderLaneId;
                const isLoadingRef = item.lane.id === (s.loadingRefLaneId || allLanesAnalysis[0]?.lane.id);
                const customName = laneLabels[item.lane.id];
                const stripUrl = getLaneStripDataUrl(item.lane, 560, 36);

                return (
                  <div
                    key={item.lane.id}
                    class={`rounded-xl border bg-white dark:bg-slate-900 overflow-hidden shadow-2xs space-y-3 p-4 transition ${
                      isSelected
                        ? 'border-accent-400 dark:border-accent-600 ring-1 ring-accent-400/30'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-sm text-slate-900 dark:text-slate-100">
                          Lane {item.laneIdx + 1}
                          {customName ? `: ${customName}` : ''}
                        </span>
                        {isLadder && (
                          <span class="text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded">
                            Standard Ladder
                          </span>
                        )}
                        {isLoadingRef && (
                          <span class="text-[10px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                            Loading Ref (1.00×)
                          </span>
                        )}
                      </div>

                      <div class="flex items-center gap-3 text-xs">
                        <span class="text-slate-500 dark:text-slate-400">
                          Total Net OD: <strong class="text-slate-900 dark:text-slate-100 mono">{item.totalNet.toFixed(1)}</strong>
                        </span>
                        <span class="text-slate-500 dark:text-slate-400">
                          Bands: <strong class="text-slate-900 dark:text-slate-100">{item.metrics.length}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedLaneId(item.lane.id)}
                          class={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                            isSelected
                              ? 'bg-accent-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {isSelected ? 'Active Lane' : 'Select'}
                        </button>
                      </div>
                    </div>

                    {/* Extracted Lane Strip with Direct Alignment Band Flags */}
                    <div class="space-y-1">
                      <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>Extracted Physical Lane Strip &amp; Band Position:</span>
                        <span>Top / Well (y₀) → Bottom / Front (y₁)</span>
                      </div>
                      <div class="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950/20">
                        <svg viewBox="0 0 560 56" class="w-full h-auto block select-none">
                          {stripUrl && <image x="0" y="16" width="560" height="36" href={stripUrl} preserveAspectRatio="none" />}
                          <rect x="0" y="16" width="560" height="36" fill="none" stroke="#94a3b8" stroke-width="0.8" stroke-opacity="0.5" />
                          {item.metrics.map(m => {
                            if (m.peakY === undefined) return null;
                            const frac = m.peakY / (item.lane.y1 - item.lane.y0 || 1);
                            const px = frac * 560;
                            const isBandRef = m.bandId === s.refBandId;
                            const szLabel = m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '';

                            return (
                              <g
                                key={m.bandId}
                                class="cursor-pointer"
                                onClick={() => set({ refBandId: isBandRef ? '' : m.bandId })}
                                title={`Band #${m.number}${szLabel ? ` (${szLabel})` : ''} - Click to set as reference band`}
                              >
                                <line
                                  x1={px}
                                  y1="0"
                                  x2={px}
                                  y2="52"
                                  stroke={isBandRef ? '#10b981' : '#ef4444'}
                                  stroke-width="1.5"
                                  stroke-dasharray="2 1"
                                />
                                <rect
                                  x={px - 14}
                                  y="1"
                                  width="28"
                                  height="13"
                                  rx="2"
                                  fill={isBandRef ? '#10b981' : '#1e293b'}
                                  opacity="0.9"
                                />
                                <text x={px} y="10.5" font-size="8" font-weight="bold" fill="#ffffff" text-anchor="middle">
                                  #{m.number}
                                </text>
                                {szLabel && (
                                  <text x={px} y="54" font-size="7" font-weight="bold" fill="#0284c7" text-anchor="middle">
                                    {szLabel}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    {/* Band Data Table for this lane */}
                    {item.metrics.length > 0 ? (
                      <div class="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                        <table class="w-full text-xs text-left">
                          <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
                            <tr>
                              <th class="px-2.5 py-1.5 font-semibold">Band #</th>
                              <th class="px-2.5 py-1.5 font-semibold">Migration Y</th>
                              <th class="px-2.5 py-1.5 font-semibold">Est. Size</th>
                              <th class="px-2.5 py-1.5 font-semibold text-right text-emerald-700 dark:text-emerald-400">Calibrated Mass</th>
                              <th class="px-2.5 py-1.5 font-semibold text-right">Raw Area</th>
                              <th class="px-2.5 py-1.5 font-semibold text-right">Baseline</th>
                              <th class="px-2.5 py-1.5 font-semibold text-right text-slate-900 dark:text-slate-100">
                                Net Intensity (Amount)
                              </th>
                              <th class="px-2.5 py-1.5 font-semibold text-right">% of Lane</th>
                              <th class="px-2.5 py-1.5 font-semibold text-right">Ratio to Ref</th>
                              <th class="px-2.5 py-1.5 font-semibold text-center">Status</th>
                              <th class="px-2.5 py-1.5 font-semibold text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                            {item.metrics.map(m => {
                              const isBandRef = m.bandId === s.refBandId;
                              const saturated = isSaturated(m.saturation);
                              return (
                                <tr
                                  key={m.bandId}
                                  class={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                                    isBandRef ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                                  }`}
                                >
                                  <td class="px-2.5 py-2 font-bold">
                                    <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">#{m.number}</span>
                                  </td>
                                  <td class="px-2.5 py-2 mono text-slate-600 dark:text-slate-400">
                                    {m.peakY !== undefined ? `${m.peakY.toFixed(1)} px` : '-'}
                                  </td>
                                  <td class="px-2.5 py-2 font-bold text-accent-600 dark:text-accent-400">
                                    {m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '-'}
                                  </td>
                                  <td class="px-2.5 py-2 mono text-right font-bold text-emerald-700 dark:text-emerald-400">
                                    {m.massEst ? formatMass(m.massEst, massCalibration?.unit) : '-'}
                                    {m.massFlags?.extrapolated && <span class="ml-1 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400" title="Outside the standard curve's signal range">extrap.</span>}
                                    {m.massFlags?.belowLoq && <span class="ml-1 text-[9px] font-bold uppercase text-rose-700 dark:text-rose-400" title="Below the limit of quantitation">&lt;LOQ</span>}
                                  </td>
                                  <td class="px-2.5 py-2 mono text-right text-slate-500 dark:text-slate-400">{m.raw.toFixed(1)}</td>
                                  <td class="px-2.5 py-2 mono text-right text-slate-500 dark:text-slate-400">{m.background.toFixed(1)}</td>
                                  <td class="px-2.5 py-2 mono text-right font-bold text-slate-900 dark:text-slate-100">
                                    {m.net.toFixed(1)}
                                    {m.baselineWarning && <span class="ml-1 text-[9px] text-amber-700 dark:text-amber-400" title="Band FWHM is more than half the rolling-ball radius, so the baseline removes about 10 % or more of its signal; increase the radius">⚠ radius</span>}
                                  </td>
                                  <td class="px-2.5 py-2 mono text-right font-medium">{m.share.toFixed(1)}%</td>
                                  <td class="px-2.5 py-2 mono text-right">
                                    {isBandRef ? (
                                      <span class="text-emerald-700 dark:text-emerald-400 font-bold">1.00 (Ref)</span>
                                    ) : (
                                      m.ratio === null ? '–' : m.ratio.toFixed(2)
                                    )}
                                  </td>
                                  <td class="px-2.5 py-2 text-center">
                                    {m.saturation === null ? (
                                      <span title="Float image rescaled on import; saturation cannot be judged" class="text-slate-400 dark:text-slate-500 text-[10px]">Not assessable</span>
                                    ) : saturated ? (
                                      <span class="rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-1.5 py-0.5 text-[10px] font-bold">
                                        Saturated
                                      </span>
                                    ) : (
                                      <span class="text-slate-500 dark:text-slate-400 text-[10px]">Linear</span>
                                    )}
                                  </td>
                                  <td class="px-2.5 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removePeakFromLane(item.lane.id, m.bandId)}
                                      class="px-2 py-0.5 rounded text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition"
                                      title="Remove peak from lane"
                                    >
                                      ✕ Remove
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p class="text-xs text-slate-500 dark:text-slate-400 italic py-1">
                        No bands detected in this lane. Click on gel image or lane profile to add.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* UNIFIED COMPACT FLAT DATA TABLE */
            <div class="overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {s.tableMode === 'all' && <th class="pb-2 font-semibold">Lane</th>}
                    <th class="pb-2 font-semibold">Band #</th>
                    <th class="pb-2 font-semibold">Migration Y</th>
                    <th class="pb-2 font-semibold">Est. Size</th>
                    <th class="pb-2 font-semibold text-right text-emerald-700 dark:text-emerald-400">Calibrated Mass</th>
                    <th class="pb-2 font-semibold text-right">Raw Area</th>
                    <th class="pb-2 font-semibold text-right">Baseline</th>
                    <th class="pb-2 font-semibold text-right text-slate-900 dark:text-slate-100">Net Intensity (Amount)</th>
                    <th class="pb-2 font-semibold text-right">% of Lane</th>
                    <th class="pb-2 font-semibold text-right">Ratio to Ref</th>
                    <th class="pb-2 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  {(s.tableMode === 'all' ? allLanesAnalysis : ([laneAnalysis].filter(Boolean) as LaneAnalysisItem[])).flatMap(item =>
                    item.metrics.map(m => {
                      const isRef = m.bandId === s.refBandId;
                      const saturated = isSaturated(m.saturation);
                      const customName = laneLabels[item.lane.id];
                      return (
                        <tr
                          key={`${item.lane.id}-${m.bandId}`}
                          class={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                            isRef ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                          }`}
                        >
                          {s.tableMode === 'all' && (
                            <td class="py-2.5 font-bold">
                              <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                                {customName ? `L${item.laneIdx + 1}: ${customName}` : `L${item.laneIdx + 1}`}
                              </span>
                            </td>
                          )}
                          <td class="py-2.5 font-medium">Band {m.number}</td>
                          <td class="py-2.5 mono">{m.peakY ? `${m.peakY.toFixed(1)} px` : '-'}</td>
                          <td class="py-2.5 font-bold text-accent-600 dark:text-accent-400">
                            {m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '-'}
                          </td>
                          <td class="py-2.5 mono text-right font-bold text-emerald-700 dark:text-emerald-400">
                            {m.massEst ? formatMass(m.massEst, massCalibration?.unit) : '-'}
                            {m.massFlags?.extrapolated && <span class="ml-1 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400" title="Outside the standard curve's signal range">extrap.</span>}
                            {m.massFlags?.belowLoq && <span class="ml-1 text-[9px] font-bold uppercase text-rose-700 dark:text-rose-400" title="Below the limit of quantitation">&lt;LOQ</span>}
                          </td>
                          <td class="py-2.5 mono text-right text-slate-500 dark:text-slate-400">{m.raw.toFixed(1)}</td>
                          <td class="py-2.5 mono text-right text-slate-500 dark:text-slate-400">{m.background.toFixed(1)}</td>
                          <td class="py-2.5 mono text-right font-bold text-slate-900 dark:text-slate-100 text-sm">{m.net.toFixed(1)}{m.baselineWarning && <span class="ml-1 text-[9px] text-amber-700 dark:text-amber-400" title="Band FWHM is more than half the rolling-ball radius, so the baseline removes about 10 % or more of its signal; increase the radius">⚠ radius</span>}</td>
                          <td class="py-2.5 mono text-right font-medium">{m.share.toFixed(1)}%</td>
                          <td class="py-2.5 mono text-right">
                            {isRef ? <span class="text-emerald-700 dark:text-emerald-400 font-bold">1.00 (Ref)</span> : m.ratio === null ? '–' : m.ratio.toFixed(2)}
                          </td>
                          <td class="py-2.5 text-center">
                            {m.saturation === null ? (
                              <span title="Float image rescaled on import; saturation cannot be judged" class="text-slate-400 dark:text-slate-500 text-[10px]">Not assessable</span>
                            ) : saturated ? (
                              <span class="rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-2 py-0.5 text-[10px] font-bold">
                                Saturated
                              </span>
                            ) : (
                              <span class="text-slate-500 dark:text-slate-400 text-[10px]">Linear</span>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
