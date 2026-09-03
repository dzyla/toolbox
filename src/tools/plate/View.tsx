import { useState, useMemo } from 'preact/hooks';
import {
  type PlateFormat,
  type WellData,
  type SampleGroup,
  PLATE_DIMENSIONS,
  DEFAULT_SAMPLE_GROUPS,
  generateEmptyPlate,
  plateToMatrixCsv,
  plateToListCsv,
} from '@/core/plates/layout';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  format: PlateFormat;
  activeGroupId: string;
}

const DEFAULTS: State = {
  format: 96,
  activeGroupId: 'sample-1',
};

export default function PlateView() {
  const [stateSig, shareUrl] = useUrlState<State>('plate', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [wells, setWells] = useState<Record<string, WellData>>(() => {
    const w = generateEmptyPlate(96);
    // Fill in a nice initial template
    // Row A: Blanks
    for (let c = 1; c <= 12; c++) {
      w[`A${c}`] = { id: `A${c}`, row: 'A', col: c, sampleGroupId: 'blank', sampleName: 'Blank' };
    }
    // Row B: Standards
    for (let c = 1; c <= 8; c++) {
      w[`B${c}`] = { id: `B${c}`, row: 'B', col: c, sampleGroupId: 'std', sampleName: `Std ${c}`, value: 100 / Math.pow(2, c - 1), unit: 'ng/mL' };
    }
    // Rows C & D: Sample 1 (duplicates)
    for (let c = 1; c <= 6; c++) {
      w[`C${c}`] = { id: `C${c}`, row: 'C', col: c, sampleGroupId: 'sample-1', sampleName: `Drug A (${c})`, replicateIndex: 1 };
      w[`D${c}`] = { id: `D${c}`, row: 'D', col: c, sampleGroupId: 'sample-1', sampleName: `Drug A (${c})`, replicateIndex: 2 };
    }
    return w;
  });

  const [groups] = useState<SampleGroup[]>(DEFAULT_SAMPLE_GROUPS);
  const [hoveredWell, setHoveredWell] = useState<WellData | null>(null);

  const dim = useMemo(() => PLATE_DIMENSIONS[s.format], [s.format]);

  function handleFormatChange(fmt: PlateFormat) {
    set({ format: fmt });
    setWells(generateEmptyPlate(fmt));
  }

  function handleWellClick(wellId: string) {
    setWells(prev => {
      const current = prev[wellId];
      if (!current) return prev;
      // If clicking with same group already applied, clear it; otherwise apply active group
      const newGroupId = current.sampleGroupId === s.activeGroupId ? '' : s.activeGroupId;
      const g = groups.find(item => item.id === newGroupId);
      return {
        ...prev,
        [wellId]: {
          ...current,
          sampleGroupId: newGroupId,
          sampleName: g ? g.name : '',
        },
      };
    });
  }

  function handlePaintRow(rowChar: string) {
    setWells(prev => {
      const updated = { ...prev };
      const g = groups.find(item => item.id === s.activeGroupId);
      for (let c = 1; c <= dim.cols; c++) {
        const id = `${rowChar}${c}`;
        if (updated[id]) {
          updated[id] = { ...updated[id], sampleGroupId: s.activeGroupId, sampleName: g ? g.name : '' };
        }
      }
      return updated;
    });
  }

  function handlePaintCol(colNum: number) {
    setWells(prev => {
      const updated = { ...prev };
      const g = groups.find(item => item.id === s.activeGroupId);
      for (let r = 0; r < dim.rows; r++) {
        const rowChar = dim.rowLabels[r]!;
        const id = `${rowChar}${colNum}`;
        if (updated[id]) {
          updated[id] = { ...updated[id], sampleGroupId: s.activeGroupId, sampleName: g ? g.name : '' };
        }
      }
      return updated;
    });
  }

  function handleClearPlate() {
    setWells(generateEmptyPlate(s.format));
  }

  function handleExportMatrix() {
    const csv = plateToMatrixCsv(s.format, wells);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plate_${s.format}well_matrix.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportList() {
    const csv = plateToListCsv(wells, groups);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plate_${s.format}well_samples.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Count assigned wells
  const assignedCount = Object.values(wells).filter(w => !!w.sampleGroupId).length;
  const totalWells = dim.rows * dim.cols;

  const copyText = [
    `Microplate Layout: ${s.format}-well format`,
    `Assigned Wells: ${assignedCount} / ${totalWells} (${((assignedCount / totalWells) * 100).toFixed(1)}% full)`,
    ...groups.map(g => {
      const count = Object.values(wells).filter(w => w.sampleGroupId === g.id).length;
      return count > 0 ? `  - ${g.name}: ${count} wells` : null;
    }).filter(Boolean),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="🟦"
      title="Plate Layout Designer"
      blurb="Design multi-well plate maps (6 to 384 wells), paint replicates, and export to CSV/plate reader."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Format Selector */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Plate Format
            </span>
            <div class="grid grid-cols-3 gap-1.5 text-xs">
              {([6, 12, 24, 48, 96, 384] as PlateFormat[]).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => handleFormatChange(fmt)}
                  class={`py-1.5 rounded-lg font-semibold transition ${s.format === fmt ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  {fmt} Wells
                </button>
              ))}
            </div>
          </div>

          {/* Sample Groups Palette */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Sample Palette (Click to Select)
            </span>
            <div class="space-y-1.5">
              {groups.map(g => {
                const count = Object.values(wells).filter(w => w.sampleGroupId === g.id).length;
                const isSelected = s.activeGroupId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => set({ activeGroupId: g.id })}
                    class={`w-full p-2 rounded-lg text-xs font-semibold flex items-center justify-between border transition ${isSelected ? 'border-accent-500 bg-accent-50/30 dark:border-accent-600 dark:bg-accent-950/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <div class="flex items-center gap-2">
                      <span class="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      <span class="text-slate-800 dark:text-slate-200">{g.name}</span>
                    </div>
                    <span class="mono text-[11px] text-slate-400">{count} wells</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              onClick={handleExportMatrix}
              class="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition"
            >
              Export Matrix CSV
            </button>
            <button
              type="button"
              onClick={handleExportList}
              class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Export List CSV
            </button>
          </div>

          <button
            type="button"
            onClick={handleClearPlate}
            class="w-full py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
          >
            Clear All Wells
          </button>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Header Summary */}
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{s.format}-Well Plate Grid</span>
                <span class="text-xs font-normal text-slate-500 mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  {assignedCount} / {totalWells} occupied
                </span>
              </h2>
              <p class="text-xs text-slate-500 mt-0.5">
                Click any well to paint. Click column numbers (1–{dim.cols}) or row letters (A–{dim.rowLabels[dim.rows - 1]}) to fill entire rows or columns.
              </p>
            </div>

            {hoveredWell && (
              <div class="text-xs mono bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <strong>{hoveredWell.id}</strong>: {hoveredWell.sampleName || 'Empty'}
                {hoveredWell.value !== undefined ? ` (${hoveredWell.value} ${hoveredWell.unit || ''})` : ''}
              </div>
            )}
          </div>

          {/* Interactive Well Grid */}
          <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div class="inline-block min-w-full">
              {/* Column Header Taps */}
              <div class="flex items-center mb-1">
                <span class="w-8 shrink-0 text-center font-bold text-xs text-slate-400 select-none"></span>
                {Array.from({ length: dim.cols }, (_, i) => i + 1).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handlePaintCol(c)}
                    title={`Fill column ${c}`}
                    class="w-7 sm:w-8 h-6 mx-0.5 rounded text-[11px] font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition select-none shrink-0"
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Rows */}
              {Array.from({ length: dim.rows }, (_, r) => {
                const rowChar = dim.rowLabels[r]!;
                return (
                  <div key={rowChar} class="flex items-center mb-1">
                    {/* Row Header Tap */}
                    <button
                      type="button"
                      onClick={() => handlePaintRow(rowChar)}
                      title={`Fill row ${rowChar}`}
                      class="w-8 h-7 sm:h-8 mr-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition select-none shrink-0"
                    >
                      {rowChar}
                    </button>

                    {/* Wells in this row */}
                    {Array.from({ length: dim.cols }, (_, c) => {
                      const wellId = `${rowChar}${c + 1}`;
                      const well = wells[wellId];
                      const group = groups.find(g => g.id === well?.sampleGroupId);
                      const isOccupied = !!group;

                      return (
                        <button
                          key={wellId}
                          type="button"
                          onClick={() => handleWellClick(wellId)}
                          onMouseEnter={() => setHoveredWell(well || null)}
                          onMouseLeave={() => setHoveredWell(null)}
                          title={`${wellId}: ${well?.sampleName || 'Empty'}`}
                          style={{
                            backgroundColor: isOccupied ? group.color : 'transparent',
                          }}
                          class={`w-7 sm:w-8 h-7 sm:h-8 mx-0.5 rounded-full border transition flex items-center justify-center shrink-0 ${isOccupied ? 'border-black/20 text-white shadow-2xs font-bold text-[9px]' : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 bg-slate-50 dark:bg-slate-950'}`}
                        >
                          {isOccupied ? wellId : ''}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
