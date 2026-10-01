import { PlateChassis, readableTextOn } from '@/tools/plate/PlateChassis';
import type { PlateReaderModel, State } from '../PlateReaderModel';

export function HeatmapTab({ m }: { m: PlateReaderModel }) {
  const {
    customBlankWells,
    customMaxWells,
    customMinWells,
    density,
    flashToast,
    getWellColor,
    handleToggleExclude,
    hoveredWell,
    is384,
    maxVal,
    minVal,
    normalizedWells,
    onSwitchToGenerator,
    parsedPlate,
    s,
    selectedGroup,
    selectedGroupStats,
    selectedWell,
    selectedWellId,
    set,
    setCustomBlankWells,
    setCustomMaxWells,
    setCustomMinWells,
    setDensity,
    setHoveredWellId,
    setSelectedWellId,
  } = m;
  return (
    <div class="space-y-3">
      {/* Heatmap Controls Bar */}
      <div class="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs border border-slate-200 dark:border-slate-700">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5">
            <span class="text-slate-500 dark:text-slate-400 font-medium">Display:</span>
            <div class="inline-flex rounded-lg bg-slate-200 p-0.5 dark:bg-slate-700">
              <button
                type="button"
                onClick={() => set({ displayMode: 'raw' })}
                class={`px-2 py-0.5 rounded-md font-semibold ${s.displayMode === 'raw' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}
              >
                Raw Signal
              </button>
              <button
                type="button"
                onClick={() => set({ displayMode: 'normalized' })}
                class={`px-2 py-0.5 rounded-md font-semibold ${s.displayMode === 'normalized' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}
              >
                Normalized
              </button>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <span class="text-slate-500 dark:text-slate-400 font-medium">Palette:</span>
            <select aria-label="Palette"
              value={s.colorPalette}
              onChange={(e) => set({ colorPalette: (e.target as HTMLSelectElement).value as State['colorPalette'] })}
              class="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="viridis">Viridis (Perceptually Uniform)</option>
              <option value="plasma">Plasma (Vibrant High-Contrast)</option>
              <option value="turbo">Turbo (Full Rainbow)</option>
              <option value="blues">Blues (Absorbance Density)</option>
            </select>
          </div>

          <div class="flex items-center gap-1.5">
            <span class="text-slate-500 dark:text-slate-400 font-medium">Density:</span>
            <div class="inline-flex rounded-lg bg-slate-200 p-0.5 dark:bg-slate-700">
              <button
                type="button"
                onClick={() => setDensity('normal')}
                class={`px-2 py-0.5 rounded-md font-semibold ${density === 'normal' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setDensity('compact')}
                class={`px-2 py-0.5 rounded-md font-semibold ${density === 'compact' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}
              >
                Compact
              </button>
            </div>
          </div>

          {onSwitchToGenerator && (
            <button
              type="button"
              onClick={onSwitchToGenerator}
              class="px-2.5 py-1 rounded-lg border border-accent-300 dark:border-accent-700 bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 font-bold hover:bg-accent-100 transition flex items-center gap-1"
              title="Open Layout Generator to edit plate arrangement"
            >
              <span>✏️</span> Generator
            </button>
          )}
        </div>

        {/* Heatmap Legend */}
        <div class="flex items-center gap-2">
          <span class="font-mono text-[11px] text-slate-500 dark:text-slate-400">{minVal.toFixed(2)}</span>
          <div
            class="h-3 w-28 rounded-sm shadow-inner"
            style={{
              background:
                s.colorPalette === 'plasma'
                  ? 'linear-gradient(to right, #0d0887, #6a00a8, #b12a90, #e16462, #fca636, #f0f921)'
                  : s.colorPalette === 'turbo'
                  ? 'linear-gradient(to right, #30123b, #4145ab, #467dfa, #1ae4b6, #a2fc3c, #faba39, #e4460a, #7a0403)'
                  : s.colorPalette === 'blues'
                  ? 'linear-gradient(to right, #f7fbff, #6baed6, #08519c)'
                  : 'linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)',
            }}
          />
          <span class="font-mono text-[11px] text-slate-500 dark:text-slate-400">{maxVal.toFixed(2)}</span>
        </div>
      </div>

      {/* Live Hover Readout Bar */}
      <div class="h-8 min-h-[32px] flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-mono transition-colors">
        {hoveredWell ? (
          <div class="flex items-center gap-2 truncate">
            <span class="font-bold text-accent-600 dark:text-accent-400">{hoveredWell.id}</span>
            <span class="text-slate-500 dark:text-slate-400">|</span>
            <span class="text-slate-800 dark:text-slate-200 truncate">{hoveredWell.sampleName || 'Unassigned'}</span>
            {hoveredWell.raw !== null && hoveredWell.raw !== undefined && (
              <span class="text-slate-500 dark:text-slate-400 font-semibold">
                Raw: {hoveredWell.raw.toFixed(2)}
              </span>
            )}
            {hoveredWell.normalized !== null && hoveredWell.normalized !== undefined && (
              <span class="text-emerald-700 dark:text-emerald-400 font-semibold">
                ({hoveredWell.normalized.toFixed(1)}%)
              </span>
            )}
            {hoveredWell.concentration !== undefined && (
              <span class="text-slate-500 dark:text-slate-400">
                [{hoveredWell.concentration} {hoveredWell.concentrationUnit || ''}]
              </span>
            )}
            {hoveredWell.isOutlier && (
              <span class="text-rose-700 dark:text-rose-400 font-bold">
                ⚠️ OUTLIER
              </span>
            )}
          </div>
        ) : (
          <span class="text-slate-500 dark:text-slate-400 text-xs italic">
            Hover over any well for live signal readout • Click well to inspect &amp; exclude
          </span>
        )}
      </div>

      {/* Selected Well Inspector Card */}
      {selectedWell && (
        <div class="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/30 p-3.5 shadow-xs text-xs space-y-2.5 transition">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-xl font-mono text-base font-black border border-black/10 shadow-xs"
                style={{
                  backgroundColor: selectedGroup ? selectedGroup.color : '#e2e8f0',
                  color: selectedGroup ? readableTextOn(selectedGroup.color) : '#64748b',
                }}
              >
                {selectedWell.id}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-sm text-slate-800 dark:text-slate-100">
                    {selectedWell.sampleName || 'Unassigned Well'}
                  </span>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    (Row {selectedWell.row}, Col {selectedWell.col})
                  </span>
                  {selectedGroup && (
                    <span
                      class="px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase text-slate-800 dark:text-slate-100"
                      style={{ backgroundColor: `${selectedGroup.color}25`, borderColor: selectedGroup.color }}
                    >
                      {selectedGroup.type}
                    </span>
                  )}
                  {selectedWell.isOutlier && (
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      ⚠️ Outlier
                    </span>
                  )}
                  {selectedWell.isExcluded && (
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                      ✕ Excluded
                    </span>
                  )}
                </div>
                <div class="text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex flex-wrap gap-3">
                  <span>Raw Signal: <strong>{selectedWell.raw ?? 'N/A'}</strong></span>
                  <span>Normalized: <strong>{selectedWell.normalized !== null ? `${selectedWell.normalized.toFixed(2)}%` : 'N/A'}</strong></span>
                  {selectedWell.concentration !== undefined && (
                    <span>Conc: <strong>{selectedWell.concentration} {selectedWell.concentrationUnit || ''}</strong></span>
                  )}
                  {selectedWell.dilutionFactor && selectedWell.dilutionFactor > 1 && (
                    <span>Dilution: <strong>{selectedWell.dilutionFactor}×</strong></span>
                  )}
                  {selectedGroupStats && (
                    <span>Group %CV: <strong>{selectedGroupStats.cv.toFixed(1)}%</strong></span>
                  )}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleExclude(selectedWell.id)}
                class={`px-3 py-1.5 rounded-lg font-semibold transition shadow-2xs ${selectedWell.isExcluded ? 'bg-emerald-700 text-white hover:bg-emerald-700' : 'bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300'}`}
              >
                {selectedWell.isExcluded ? 'Include Well in Statistics' : 'Exclude Well'}
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = new Set(customBlankWells);
                  if (next.has(selectedWell.id)) next.delete(selectedWell.id);
                  else next.add(selectedWell.id);
                  setCustomBlankWells(next);
                  set({ blankMethod: 'wells' });
                  flashToast(`Well ${selectedWell.id} set as custom blank`);
                }}
                class={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${customBlankWells.has(selectedWell.id) ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
              >
                {customBlankWells.has(selectedWell.id) ? '✓ Blank Ref' : '+ Set Blank'}
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = new Set(customMinWells);
                  if (next.has(selectedWell.id)) next.delete(selectedWell.id);
                  else next.add(selectedWell.id);
                  setCustomMinWells(next);
                  set({ minMethod: 'wells' });
                  flashToast(`Well ${selectedWell.id} set as custom min (0%) reference`);
                }}
                class={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${customMinWells.has(selectedWell.id) ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
              >
                {customMinWells.has(selectedWell.id) ? '✓ Min (0%)' : '+ Set Min'}
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = new Set(customMaxWells);
                  if (next.has(selectedWell.id)) next.delete(selectedWell.id);
                  else next.add(selectedWell.id);
                  setCustomMaxWells(next);
                  set({ maxMethod: 'wells' });
                  flashToast(`Well ${selectedWell.id} set as custom max (100%) reference`);
                }}
                class={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${customMaxWells.has(selectedWell.id) ? 'bg-emerald-700 text-white dark:bg-emerald-400 dark:text-slate-900' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
              >
                {customMaxWells.has(selectedWell.id) ? '✓ Max (100%)' : '+ Set Max'}
              </button>

              <button
                type="button"
                onClick={() => setSelectedWellId(null)}
                class="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                title="Dismiss Inspector"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Plate Heatmap via Unified PlateChassis */}
      <PlateChassis
        format={parsedPlate.format}
        rows={parsedPlate.rows.length}
        cols={parsedPlate.cols.length}
        rowLabels={parsedPlate.rows}
        density={density}
        selectedWellId={selectedWellId}
        onWellClick={(wellId) => setSelectedWellId(wellId)}
        onWellMouseEnter={(rIdx, colNum) => {
          const rowChar = parsedPlate.rows[rIdx];
          if (rowChar) {
            setHoveredWellId(`${rowChar}${colNum}`);
          }
        }}
        onWellMouseLeave={() => setHoveredWellId(null)}
        title={`ANSI / SLAS 1-2004 Microplate · ${parsedPlate.format} Wells`}
        subtitle={`${parsedPlate.rows.length} × ${parsedPlate.cols.length} Grid · ${Object.values(parsedPlate.wells).filter(w => w.raw !== null).length} Wells Recorded`}
        getWellData={(wellId) => {
          const well = normalizedWells[wellId];
          const val = s.displayMode === 'normalized' ? well?.normalized : well?.raw;
          const bgColor = getWellColor(val);
          const textColor = readableTextOn(bgColor);
          const isOutlier = !!well?.isOutlier;
          const isExcluded = !!well?.isExcluded;

          return {
            id: wellId,
            row: wellId.charAt(0),
            col: parseInt(wellId.slice(1), 10),
            bgColor: isExcluded ? '#cbd5e1' : bgColor,
            textColor: isExcluded ? '#334155' : textColor,
            isSelected: selectedWellId === wellId,
            isOutlier,
            isExcluded,
            topLabel: wellId,
            midLabel: val !== null && val !== undefined ? (is384 ? val.toFixed(0) : val.toFixed(2)) : '—',
            botLabel: well?.sampleName ? well.sampleName.slice(0, 7) : '',
            title: `Well ${wellId}: ${well?.sampleName || 'Unassigned'} | Raw: ${well?.raw ?? 'N/A'} | Norm: ${well?.normalized ?? 'N/A'}${isOutlier ? ' (OUTLIER)' : ''}`,
          };
        }}
      />
    </div>
  );
}
