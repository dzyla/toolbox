import type { ToolProps } from '@/tools/registry';
import { formatSize } from '@/core/gel/calibration';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { SCIENCE } from './science';
import { useGelWorkspace } from './workspace';
import { GelControls } from './GelControls';
import { GelImageTab } from './GelImageTab';
import { GelCalibrationTab } from './GelCalibrationTab';
import { GelQuantTab } from './GelQuantTab';

export default function GelView({ projectId }: ToolProps = {}) {
  const g = useGelWorkspace({ projectId });
  const {
    activeLadder,
    allLanesAnalysis,
    calibration,
    gelTitle,
    handleAddLane,
    handleAutoFindBands,
    handleAutoLanes,
    handleClearAllLanes,
    handleDeleteSelectedLane,
    handleEqualLanes,
    handleExportAnnotatedGel,
    handleExportTidyCsv,
    handleExportSvg,
    handleGridFromPlaced,
    handlePrintGel,
    handleSaveProject,
    imageName,
    laneLabels,
    lanes,
    numLanesInput,
    plane,
    printCanvasRef,
    project,
    s,
    selectedLane,
    selectedLaneIdx,
    set,
    setBandMap,
    setLadderSizeMap,
    setLaneLabels,
    setNumLanesInput,
    setSelectedLaneId,
    setStripLanePrefix,
    shareUrl,
    stripLanePrefix,
    updateSelectedLane,
  } = g;
  return (
    <>
      <ToolLayout
        icon="🧬"
        title="Gel & Blot Analysis"
        blurb="Densitometry, relative quantification, interactive line grabbing, orientation transforms, and molecular-weight calibration."
        wide={true}
        inputs={<GelControls g={g} />}
        results={
          <div class="space-y-4">
            {/* Quick Lanes Toolbar & Navigation */}
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">Lanes:</span>
                  {lanes.map((l, i) => {
                    const isSel = l.id === selectedLane?.id;
                    const isLadder = l.id === s.ladderLaneId;
                    const isLoadingRef = l.id === s.loadingRefLaneId;
                    const customName = laneLabels[l.id];
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelectedLaneId(l.id)}
                        class={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                          isSel
                            ? 'bg-accent-600 text-white shadow-xs'
                            : isLadder
                              ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200'
                              : isLoadingRef
                                ? 'bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-200'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {customName ? `L${i + 1}: ${customName}` : `L${i + 1}`}
                        {isLadder ? ' 🏷️' : ''}
                        {isLoadingRef ? ' ⚖️' : ''}
                      </button>
                    );
                  })}
                </div>

                <div class="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleAddLane}
                    class="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                    title="Add another lane"
                  >
                    + Add Lane
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoLanes}
                    class="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                  >
                    Auto-Find Lanes
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoFindBands}
                    disabled={!selectedLane}
                    class="px-2.5 py-1 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950 dark:hover:bg-amber-900 dark:text-amber-300 rounded-lg transition disabled:opacity-50"
                    title="Re-detect bands in the selected lane using the current prominence"
                  >
                    ✨ Auto-Find Bands
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBandMap({}); setLadderSizeMap({}); }}
                    class="px-2.5 py-1 text-xs font-medium bg-amber-100/60 hover:bg-amber-200/60 text-amber-800 dark:bg-amber-900/40 dark:hover:bg-amber-800/50 dark:text-amber-200 rounded-lg transition"
                    title="Reset manually edited bands and re-detect across all lanes using current prominence"
                  >
                    ✨ Re-detect All Bands
                  </button>
                  <button
                    type="button"
                    onClick={handleGridFromPlaced}
                    disabled={lanes.length < 2}
                    class="px-2.5 py-1 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 rounded-lg transition disabled:opacity-50"
                    title="Detect lane pitch and interpolate grid based on 2 or more placed lanes"
                  >
                    ✨ Grid from Placed ({lanes.length})
                  </button>

                  <span class="text-slate-300 dark:text-slate-700 select-none">|</span>

                  <div class="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={numLanesInput}
                      onInput={e => setNumLanesInput(Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1))}
                      class="w-10 px-1 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 mono text-center"
                      title="Number of equal lanes"
                    />
                    <button
                      type="button"
                      onClick={handleEqualLanes}
                      class="px-2 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                    >
                      Equal
                    </button>
                  </div>
                  {(selectedLane || lanes.length > 0) && (
                    <>
                      <span class="text-slate-300 dark:text-slate-700 select-none">|</span>
                      {selectedLane && (
                        <button
                          type="button"
                          onClick={handleDeleteSelectedLane}
                          class="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 rounded-lg dark:hover:bg-red-950/40 transition"
                          title="Delete current lane"
                        >
                          ✕ L{selectedLaneIdx + 1}
                        </button>
                      )}
                      {lanes.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAllLanes}
                          class="px-2 py-1 text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-50 rounded-lg dark:hover:bg-rose-950/40 transition font-medium"
                          title="Clear all lanes from image"
                        >
                          Clear All
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Selected Lane Custom Label & Sliders */}
              {selectedLane && (
                <div class="grid gap-2 sm:grid-cols-3 text-xs bg-slate-50 p-2 rounded-lg dark:bg-slate-800/50 items-center">
                  <div class="flex items-center gap-2">
                    <span class="text-slate-500 dark:text-slate-400 shrink-0 font-medium">L{selectedLaneIdx + 1} Label:</span>
                    <input
                      type="text"
                      placeholder="e.g. Wild-Type 0h"
                      value={laneLabels[selectedLane.id] || ''}
                      onInput={e => {
                        const val = (e.target as HTMLInputElement).value;
                        setLaneLabels(prev => ({ ...prev, [selectedLane.id]: val }));
                      }}
                      class="w-full px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-900 text-xs"
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-slate-500 dark:text-slate-400 shrink-0 font-medium">Center X:</span>
                    <input
                      aria-label="Center X"
                      type="range"
                      min="10"
                      max={plane ? plane.width - 10 : 400}
                      value={selectedLane.x}
                      onInput={e => updateSelectedLane({ x: parseInt((e.target as HTMLInputElement).value) })}
                      class="w-full accent-accent-600"
                    />
                    <span class="mono font-semibold w-10 text-right">{Math.round(selectedLane.x)}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-slate-500 dark:text-slate-400 shrink-0 font-medium">Width:</span>
                    <input
                      aria-label="Width"
                      type="range"
                      min="10"
                      max="150"
                      value={selectedLane.width}
                      onInput={e => updateSelectedLane({ width: parseInt((e.target as HTMLInputElement).value) })}
                      class="w-full accent-accent-600"
                    />
                    <span class="mono font-semibold w-10 text-right">{selectedLane.width}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Workflow Tabs: Gel Image & Profile, MW Calibration Curve, Band Quantification */}
            <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() => set({ viewTab: 'gel' })}
                  class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    s.viewTab === 'gel'
                      ? 'bg-accent-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  🖼️ Gel Image & Lane Profile
                </button>
                <button
                  type="button"
                  onClick={() => set({ viewTab: 'calib' })}
                  class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    s.viewTab === 'calib'
                      ? 'bg-accent-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  📈 MW Calibration Curve
                </button>
                <button
                  type="button"
                  onClick={() => set({ viewTab: 'quant' })}
                  class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    s.viewTab === 'quant'
                      ? 'bg-accent-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  📊 Band Quantification & Amounts
                </button>
              </div>

              {/* Quick Export Annotated Gel Button */}
              <button
                type="button"
                onClick={handleExportAnnotatedGel}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition flex items-center gap-1.5"
              >
                📥 Export Annotated Gel (PNG)
              </button>
              <button
                type="button"
                onClick={handleExportSvg}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition flex items-center gap-1.5"
                title="Vector export: annotations stay crisp text at any zoom"
              >
                📐 Export SVG
              </button>
              <button
                type="button"
                onClick={handlePrintGel}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition flex items-center gap-1.5"
                title="Print or save as PDF via the print stylesheet"
              >
                🖨️ Print / PDF
              </button>
            </div>

            {/* TAB 1: Gel Image & Interactive Lane Profile */}
            <GelImageTab g={g} />

            {/* TAB 2: Calibration Curves (MW and Mass Densitometry) */}
            {s.viewTab === 'calib' && <GelCalibrationTab g={g} />}

            {/* TAB 3: Comprehensive Quantification & Line Loading Across All Lanes */}
            {s.viewTab === 'quant' && <GelQuantTab g={g} />}
          </div>
        }
        actions={
          <div class="space-y-2">
            <ActionBar
              onCopy={() => {
                const unit = activeLadder.kind === 'protein' ? 'kDa' : 'bp';
                const summary = [
                  `Gel & Blot Analysis Summary`,
                  `Image: ${imageName}`,
                  `Lanes: ${lanes.length}`,
                  `Ladder: ${activeLadder.name} (${unit})`,
                  `Calibration: ${calibration ? `${s.calibMethod} (R²=${calibration.r2?.toFixed(4) ?? 'N/A'})` : 'Uncalibrated'}`,
                  '',
                  ...allLanesAnalysis.flatMap(item => {
                    const customName = laneLabels[item.lane.id];
                    const title = customName ? `Lane ${item.laneIdx + 1} (${customName})` : `Lane ${item.laneIdx + 1}`;
                    const bands = item.metrics.map(m => {
                      const massStr = m.sizeEst ? ` | Mass: ${formatSize(m.sizeEst, activeLadder.kind)}` : '';
                      return `    Band #${m.number}: Pos=${Math.round(m.peakY ?? 0)}px${massStr} | Net=${m.net.toFixed(1)} (${m.share.toFixed(1)}%)`;
                    });
                    return [
                      `  ${title} [Total Net: ${item.totalNet.toFixed(1)}]:`,
                      ...(bands.length > 0 ? bands : ['    (No detected bands)']),
                    ];
                  }),
                ].join('\n');
                return `${summary}\n\n${scienceText(SCIENCE)}`;
              }}
              shareUrl={shareUrl}
              onSaveProject={handleSaveProject}
              projectStatus={project.status}
            />
            <div class="flex flex-col gap-1.5">
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
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition text-center"
              >
                Bands CSV (tidy)
              </button>
            </div>
          </div>
        }
        science={<SciencePanel science={SCIENCE} />}
      />
      {/* Print/PDF export root: visible only in print, shows the annotated image at 100 % with title + method.
          The inline display:none is a belt-and-suspenders guard: even a stale or partial stylesheet that
          lacks the `.print-only { display: none }` rule can never render this mirrored canvas on screen.
          The @media print rule (display:block !important) still wins over the inline style when printing. */}
      <div class="print-only" style={{ display: 'none' }}>
        {plane && (
          <div style="margin: 0 auto; text-align: center; font-family: Helvetica, Arial, sans-serif;">
            <div style="font-size: 18px; font-weight: bold; margin: 12px 0 4px;">{gelTitle || 'Gel export'}</div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 8px;">
              {plane.width} × {plane.height} px · {new Date().toISOString().slice(0, 10)} · Bio-Bench
            </div>
            <canvas ref={printCanvasRef} style="max-width: 100%; height: auto; border: 1px solid #e2e8f0;" />
            <div style="font-size: 10px; color: #475569; margin-top: 8px;">
              Quantification: raw-pixel densitometry with {s.bgMethod} baseline; {activeLadder.kind === 'protein' ? 'protein' : 'DNA'}{' '}
              ladder calibration ({s.calibMethod}); compare bands within one gel only.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
