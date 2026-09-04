import { useState, useMemo } from 'preact/hooks';
import {
  type PlateFormat,
  type WellData,
  type SampleGroup,
  PLATE_DIMENSIONS,
  generateEmptyPlate,
  applyDilutionSeries,
  generatePipettingScheme,
  formatWellConcentration,
  plateToMatrixCsv,
  plateToListCsv,
  plateToMarkdown,
} from '@/core/plates/layout';
import { DecimalInput } from '@/app/components/DecimalInput';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  format: PlateFormat;
  activeGroupId: string;
  viewTab: 'map' | 'pipetting';
  displayMode: 'shading' | 'labels';
  // Dilution Series
  dilutionDirection: 'row' | 'col';
  dilutionStartRow: string;
  dilutionStartCol: number;
  dilutionLength: number;
  dilutionStartConc: number;
  dilutionFactor: number;
  dilutionUnit: string;
  dilutionReplicates: number;
  dilutionIncludeBlank: boolean;
  // Pipetting parameters
  workingVolumeUl: number;
  transferVolumeUl: number;
  pipetteType: 'single' | '8-channel' | '12-channel';
}

const DEFAULTS: State = {
  format: 96,
  activeGroupId: 'sample-1',
  viewTab: 'map',
  displayMode: 'labels',
  dilutionDirection: 'row',
  dilutionStartRow: 'B',
  dilutionStartCol: 1,
  dilutionLength: 8,
  dilutionStartConc: 100,
  dilutionFactor: 2,
  dilutionUnit: 'µM',
  dilutionReplicates: 2,
  dilutionIncludeBlank: true,
  workingVolumeUl: 100,
  transferVolumeUl: 50,
  pipetteType: '8-channel',
};

export default function PlateView() {
  const [stateSig, shareUrl] = useUrlState<State>('plate', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [wells, setWells] = useState<Record<string, WellData>>(() => {
    const w = generateEmptyPlate(96);
    // Row A: Blanks
    for (let c = 1; c <= 12; c++) {
      w[`A${c}`] = { id: `A${c}`, row: 'A', col: c, sampleGroupId: 'blank', sampleName: 'Blank' };
    }
    // Rows B & C: Dilution series (duplicates)
    const dim = PLATE_DIMENSIONS[96];
    return applyDilutionSeries(w, {
      groupId: 'std',
      startConc: 100,
      dilutionFactor: 2,
      unit: 'ng/mL',
      direction: 'row',
      startRow: 'B',
      startCol: 1,
      length: 8,
      replicates: 2,
      includeBlank: true,
    }, dim, 'Std');
  });

  const [groups, setGroups] = useState<SampleGroup[]>(() => [
    { id: 'blank', name: 'Blank / Media', color: '#94a3b8', type: 'blank' },
    { id: 'neg-ctrl', name: 'Negative Control', color: '#64748b', type: 'neg-ctrl' },
    { id: 'pos-ctrl', name: 'Positive Control', color: '#10b981', type: 'pos-ctrl' },
    { id: 'std', name: 'Standard Curve', color: '#8b5cf6', type: 'standard' },
    { id: 'sample-1', name: 'Sample 1', color: '#3b82f6', type: 'sample' },
  ]);
  const [hoveredWell, setHoveredWell] = useState<WellData | null>(null);
  const [dragStart, setDragStart] = useState<{ rowIdx: number; col: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ rowIdx: number; col: number } | null>(null);
  const [density, setDensity] = useState<'normal' | 'compact'>('normal');

  function handleRenameGroup(id: string, newName: string) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name: newName } : g));
    setWells(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const key of Object.keys(updated)) {
        if (updated[key]?.sampleGroupId === id) {
          updated[key] = { ...updated[key]!, sampleName: newName };
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }

  function handleAddSample() {
    const existingNums = groups
      .map(g => {
        const m = g.name.match(/Sample\s+(\d+)/i);
        return m ? parseInt(m[1]!, 10) : 0;
      })
      .filter(n => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : groups.length + 1;
    const newId = `sample-${Date.now()}`;
    const paletteColors = [
      '#ec4899', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444',
      '#10b981', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
    ];
    const color = paletteColors[groups.length % paletteColors.length]!;
    const newGroup: SampleGroup = {
      id: newId,
      name: `Sample ${nextNum}`,
      color,
      type: 'sample',
    };
    setGroups(prev => [...prev, newGroup]);
    set({ activeGroupId: newId });
  }

  function handleDeleteGroup(id: string) {
    if (groups.length <= 1) return;
    setGroups(prev => prev.filter(g => g.id !== id));
    setWells(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        if (updated[key]?.sampleGroupId === id) {
          updated[key] = {
            ...updated[key]!,
            sampleGroupId: '',
            sampleName: '',
            value: undefined,
            unit: undefined,
          };
        }
      }
      return updated;
    });
    if (s.activeGroupId === id) {
      const remaining = groups.filter(g => g.id !== id);
      set({ activeGroupId: remaining[0]?.id || '' });
    }
  }

  const dim = useMemo(() => PLATE_DIMENSIONS[s.format], [s.format]);

  // Compute min and max values per sample group to scale color shading
  const groupValueRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const w of Object.values(wells)) {
      if (w.sampleGroupId && w.value !== undefined && w.value > 0) {
        if (!ranges[w.sampleGroupId]) {
          ranges[w.sampleGroupId] = { min: w.value, max: w.value };
        } else {
          ranges[w.sampleGroupId]!.min = Math.min(ranges[w.sampleGroupId]!.min, w.value);
          ranges[w.sampleGroupId]!.max = Math.max(ranges[w.sampleGroupId]!.max, w.value);
        }
      }
    }
    return ranges;
  }, [wells]);

  const pipettingPlan = useMemo(() => {
    return generatePipettingScheme(
      wells,
      {
        workingVolumeUl: s.workingVolumeUl,
        transferVolumeUl: s.transferVolumeUl,
        pipetteType: s.pipetteType,
      },
      groups,
    );
  }, [wells, s.workingVolumeUl, s.transferVolumeUl, s.pipetteType, groups]);

  function getWellTextColor(hexColor: string, opacity: number): string {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 128;
    const g = parseInt(hex.substring(2, 4), 16) || 128;
    const b = parseInt(hex.substring(4, 6), 16) || 128;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (opacity < 0.45 || lum > 0.65) {
      return 'text-slate-950 dark:text-slate-100 font-bold';
    }
    return 'text-white font-bold drop-shadow-xs';
  }

  function handleFormatChange(fmt: PlateFormat) {
    set({ format: fmt });
    setWells(generateEmptyPlate(fmt));
  }

  function handleWellClick(wellId: string) {
    setWells(prev => {
      const current = prev[wellId];
      if (!current) return prev;
      const newGroupId = current.sampleGroupId === s.activeGroupId ? '' : s.activeGroupId;
      const g = groups.find(item => item.id === newGroupId);
      return {
        ...prev,
        [wellId]: {
          ...current,
          sampleGroupId: newGroupId,
          sampleName: g ? g.name : '',
          value: undefined,
          unit: undefined,
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

  // Box drag selection
  function handleMouseDown(rIdx: number, cNum: number) {
    setDragStart({ rowIdx: rIdx, col: cNum });
    setDragCurrent({ rowIdx: rIdx, col: cNum });
  }

  function handleMouseEnter(rIdx: number, cNum: number) {
    if (dragStart) {
      setDragCurrent({ rowIdx: rIdx, col: cNum });
    }
  }

  function handleMouseUp() {
    if (dragStart && dragCurrent) {
      const rMin = Math.min(dragStart.rowIdx, dragCurrent.rowIdx);
      const rMax = Math.max(dragStart.rowIdx, dragCurrent.rowIdx);
      const cMin = Math.min(dragStart.col, dragCurrent.col);
      const cMax = Math.max(dragStart.col, dragCurrent.col);

      setWells(prev => {
        const updated = { ...prev };
        const g = groups.find(item => item.id === s.activeGroupId);
        for (let r = rMin; r <= rMax; r++) {
          const rowChar = dim.rowLabels[r]!;
          for (let c = cMin; c <= cMax; c++) {
            const id = `${rowChar}${c}`;
            if (updated[id]) {
              updated[id] = {
                ...updated[id],
                sampleGroupId: s.activeGroupId,
                sampleName: g ? g.name : '',
              };
            }
          }
        }
        return updated;
      });
    }
    setDragStart(null);
    setDragCurrent(null);
  }

  function handleGenerateDilution() {
    setWells(prev => {
      return applyDilutionSeries(prev, {
        groupId: s.activeGroupId,
        startConc: s.dilutionStartConc,
        dilutionFactor: s.dilutionFactor,
        unit: s.dilutionUnit,
        direction: s.dilutionDirection,
        startRow: s.dilutionStartRow,
        startCol: s.dilutionStartCol,
        length: s.dilutionLength,
        replicates: s.dilutionReplicates,
        includeBlank: s.dilutionIncludeBlank,
      }, dim, 'Dilution');
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

  function handleExportMarkdown() {
    const md = plateToMarkdown(s.format, wells, groups);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plate_${s.format}well_layout.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrintPdf() {
    window.print();
  }

  const assignedCount = Object.values(wells).filter(w => !!w.sampleGroupId).length;
  const totalWells = dim.rows * dim.cols;

  const copyText = [
    `Microplate Layout: ${s.format}-well format`,
    `Assigned Wells: ${assignedCount} / ${totalWells} (${((assignedCount / totalWells) * 100).toFixed(1)}% occupied)`,
    `Total Diluent Buffer Required: ${(pipettingPlan.totalDiluentNeededUl / 1000).toFixed(2)} mL`,
    `Total Concentrated Stock Required: ${(pipettingPlan.totalStockNeededUl / 1000).toFixed(2)} mL`,
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
      blurb="Multi-well plate maps (6 to 384 wells), box drag selection, serial dilution color shades, and pipetting scheme generator."
      wide={true}
      mobileResultSummary={
        <span>{s.format}-well map · <strong class="text-accent-700 dark:text-accent-300 font-mono">{Object.values(wells).filter(w => !!w.sampleGroupId).length} / {s.format}</strong> wells filled</span>
      }
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
            <div class="flex items-center justify-between">
              <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Sample Palette (Active Paint)
              </span>
              <span class="text-[11px] text-slate-400">Click to select</span>
            </div>
            <div class="space-y-1.5">
              {groups.map(g => {
                const count = Object.values(wells).filter(w => w.sampleGroupId === g.id).length;
                const isSelected = s.activeGroupId === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => set({ activeGroupId: g.id })}
                    class={`w-full p-1.5 rounded-lg text-xs font-semibold flex items-center justify-between border cursor-pointer transition ${isSelected ? 'border-accent-500 bg-accent-50/40 dark:border-accent-600 dark:bg-accent-950/40 ring-1 ring-accent-500/20' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <div class="flex items-center gap-2 flex-1 min-w-0 mr-1">
                      <span class="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: g.color }} />
                      <input
                        type="text"
                        value={g.name}
                        onInput={(e) => handleRenameGroup(g.id, (e.target as HTMLInputElement).value)}
                        onClick={(e) => e.stopPropagation()}
                        title="Click to rename sample group"
                        class="bg-transparent border-b border-transparent hover:border-slate-300 focus:border-accent-500 focus:bg-white dark:focus:bg-slate-800 px-1 py-0.5 rounded text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none w-full min-w-0"
                      />
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <span class="mono text-[10px] text-slate-400">{count}w</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(g.id);
                        }}
                        disabled={groups.length <= 1}
                        title="Delete sample group"
                        class="text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:hover:text-slate-400 transition text-[12px] px-1"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddSample}
              class="w-full py-1.5 px-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-accent-500 hover:text-accent-600 text-xs font-semibold flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 transition"
            >
              <span>+ Add Sample</span>
            </button>
          </div>

          {/* Serial Dilution Generator Accordion */}
          <details class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 text-xs space-y-2.5">
            <summary class="cursor-pointer font-semibold text-slate-800 dark:text-slate-200 select-none">
              ⚡ Serial Dilution Generator
            </summary>

            <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {/* Direction: Row vs Column */}
              <div>
                <label class="block text-[10px] text-slate-400 mb-1 font-semibold uppercase">Dilution Direction</label>
                <div class="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => set({ dilutionDirection: 'row' })}
                    class={`py-1 rounded text-xs font-semibold transition ${s.dilutionDirection === 'row' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    Across Rows (Horiz)
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ dilutionDirection: 'col' })}
                    class={`py-1 rounded text-xs font-semibold transition ${s.dilutionDirection === 'col' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    Down Columns (Vert)
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400">Start Row</label>
                  <select
                    value={s.dilutionStartRow}
                    onChange={(e) => set({ dilutionStartRow: (e.target as HTMLSelectElement).value })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  >
                    {dim.rowLabels.map(r => <option key={r} value={r}>Row {r}</option>)}
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400">Start Column</label>
                  <input
                    type="number"
                    min="1"
                    max={dim.cols}
                    value={s.dilutionStartCol}
                    onInput={(e) => set({ dilutionStartCol: parseInt((e.target as HTMLInputElement).value) || 1 })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400">Number of Steps (Wells)</label>
                  <input
                    type="number"
                    min="2"
                    max={s.dilutionDirection === 'row' ? dim.cols : dim.rows}
                    value={s.dilutionLength}
                    onInput={(e) => set({ dilutionLength: parseInt((e.target as HTMLInputElement).value) || 8 })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400">
                    {s.dilutionDirection === 'row' ? 'Replicate Rows' : 'Replicate Columns'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={s.dilutionDirection === 'row' ? dim.rows : dim.cols}
                    value={s.dilutionReplicates}
                    onInput={(e) => set({ dilutionReplicates: parseInt((e.target as HTMLInputElement).value) || 1 })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400">Start Concentration</label>
                  <DecimalInput
                    value={s.dilutionStartConc}
                    onChange={dilutionStartConc => set({ dilutionStartConc })}
                    min={0.000001}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold font-mono"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400">Unit</label>
                  <input
                    type="text"
                    value={s.dilutionUnit}
                    onInput={(e) => set({ dilutionUnit: (e.target as HTMLInputElement).value })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label class="block text-[10px] text-slate-400">Dilution Factor (e.g. 2 for 1:2, 10 for 1:10)</label>
                <DecimalInput
                  value={s.dilutionFactor}
                  onChange={dilutionFactor => set({ dilutionFactor })}
                  min={1.01}
                  class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold font-mono"
                />
              </div>

              <label class="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400 select-none">
                <input
                  type="checkbox"
                  checked={s.dilutionIncludeBlank}
                  onChange={(e) => set({ dilutionIncludeBlank: (e.target as HTMLInputElement).checked })}
                  class="rounded text-accent-600 accent-accent-600"
                />
                <span>Include final Blank well (conc = 0)</span>
              </label>

              <button
                type="button"
                onClick={handleGenerateDilution}
                class="w-full py-2 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg transition shadow-xs"
              >
                Apply Serial Dilution ({s.dilutionLength} steps, 1:{s.dilutionFactor})
              </button>
            </div>
          </details>

          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleExportMatrix}
              class="py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition"
            >
              Matrix CSV
            </button>
            <button
              type="button"
              onClick={handleExportList}
              class="py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              List CSV
            </button>
            <button
              type="button"
              onClick={handleExportMarkdown}
              class="py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              class="py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1"
            >
              Print / Save PDF
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
        <div class="space-y-4" onMouseUp={handleMouseUp}>
          {/* Header Tabs */}
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <div class="flex flex-wrap items-center gap-2">
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() => set({ viewTab: 'map' })}
                  class={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${s.viewTab === 'map' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
                >
                  {s.format}-Well Plate Grid
                </button>
                <button
                  type="button"
                  onClick={() => set({ viewTab: 'pipetting' })}
                  class={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${s.viewTab === 'pipetting' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
                >
                  Pipetting Scheme &amp; Volumes
                </button>
              </div>

              {s.viewTab === 'map' && (
                <div class="flex items-center gap-2">
                  <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => set({ displayMode: 'shading' })}
                      class={`px-2.5 py-1 rounded-md text-xs font-medium transition ${s.displayMode !== 'labels' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                    >
                      Color Shading
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ displayMode: 'labels' })}
                      class={`px-2.5 py-1 rounded-md text-xs font-medium transition ${s.displayMode === 'labels' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                    >
                      Labels &amp; Values
                    </button>
                  </div>

                  <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setDensity('normal')}
                      class={`px-2 py-1 rounded-md text-xs font-medium transition ${density === 'normal' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => setDensity('compact')}
                      class={`px-2 py-1 rounded-md text-xs font-medium transition ${density === 'compact' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                    >
                      📱 Compact
                    </button>
                  </div>
                </div>
              )}
            </div>

            {hoveredWell && s.viewTab === 'map' && (
              <div class="text-xs mono bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                <strong>{hoveredWell.id}</strong>: {hoveredWell.sampleName || 'Empty'}
                {hoveredWell.value !== undefined ? ` (${hoveredWell.value >= 0.01 ? hoveredWell.value.toFixed(2) : hoveredWell.value.toExponential(2)} ${hoveredWell.unit || ''})` : ''}
              </div>
            )}
          </div>

          {s.viewTab === 'map' ? (
            /* Interactive Well Grid */
            <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 select-none">
              <style>{`
                @media print {
                  body { background: white !important; color: black !important; }
                  nav, aside, header, footer, .no-print { display: none !important; }
                  .print\\:block { display: block !important; }
                }
              `}</style>
              <div class="inline-block min-w-full">
                {/* Column Headers */}
                <div class="flex items-center mb-1">
                  <span class="w-8 shrink-0 text-center font-bold text-xs text-slate-400"></span>
                  {Array.from({ length: dim.cols }, (_, i) => i + 1).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handlePaintCol(c)}
                      title={`Fill column ${c}`}
                      class={`${density !== 'compact' && dim.format <= 96 ? 'w-14 sm:w-16' : 'w-7 sm:w-8'} h-6 mx-0.5 rounded text-[11px] font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition shrink-0`}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                {/* Rows */}
                {Array.from({ length: dim.rows }, (_, rIdx) => {
                  const rowChar = dim.rowLabels[rIdx]!;
                  const isCompact = density === 'compact' || dim.format > 96;
                  return (
                    <div key={rowChar} class="flex items-center mb-1">
                      {/* Row Header */}
                      <button
                        type="button"
                        onClick={() => handlePaintRow(rowChar)}
                        title={`Fill row ${rowChar}`}
                        class={`w-8 ${!isCompact ? 'h-14 sm:h-16' : 'h-7 sm:h-8'} mr-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition shrink-0`}
                      >
                        {rowChar}
                      </button>

                      {/* Wells */}
                      {Array.from({ length: dim.cols }, (_, cIdx) => {
                        const colNum = cIdx + 1;
                        const wellId = `${rowChar}${colNum}`;
                        const well = wells[wellId];
                        const group = groups.find(g => g.id === well?.sampleGroupId);
                        const isOccupied = !!group;

                        // Check if inside active drag box
                        let isDragSelected = false;
                        if (dragStart && dragCurrent) {
                          const rMin = Math.min(dragStart.rowIdx, dragCurrent.rowIdx);
                          const rMax = Math.max(dragStart.rowIdx, dragCurrent.rowIdx);
                          const cMin = Math.min(dragStart.col, dragCurrent.col);
                          const cMax = Math.max(dragStart.col, dragCurrent.col);
                          isDragSelected = rIdx >= rMin && rIdx <= rMax && colNum >= cMin && colNum <= cMax;
                        }

                        // Calculate color shading / opacity if part of a concentration gradient
                        let opacity = 1.0;
                        if (isOccupied && well?.value !== undefined && well.value > 0) {
                          const range = groupValueRanges[group.id];
                          if (range && range.max > range.min) {
                            const minLog = Math.log10(Math.max(1e-6, range.min));
                            const maxLog = Math.log10(Math.max(1e-6, range.max));
                            const curLog = Math.log10(Math.max(1e-6, well.value));
                            const frac = maxLog > minLog ? (curLog - minLog) / (maxLog - minLog) : 1;
                            opacity = 0.25 + 0.75 * Math.max(0, Math.min(1, frac));
                          }
                        }

                        const isLabelsMode = s.displayMode === 'labels' && !isCompact;

                        return (
                          <button
                            key={wellId}
                            type="button"
                            onMouseDown={() => handleMouseDown(rIdx, colNum)}
                            onMouseEnter={() => { handleMouseEnter(rIdx, colNum); setHoveredWell(well || null); }}
                            onMouseLeave={() => setHoveredWell(null)}
                            onClick={() => handleWellClick(wellId)}
                            title={`${wellId}: ${well?.sampleName || 'Empty'} ${well?.value !== undefined ? `(${well.value} ${well.unit || ''})` : ''}`}
                            style={{
                              backgroundColor: isOccupied ? group.color : 'transparent',
                              opacity: isOccupied ? opacity : 1,
                            }}
                            class={`${!isCompact ? 'w-14 sm:w-16 h-14 sm:h-16 rounded-full flex flex-col justify-between py-1 px-0.5' : 'w-7 sm:w-8 h-7 sm:h-8 rounded-full flex items-center justify-center'} mx-0.5 border transition shrink-0 ${isDragSelected ? 'ring-2 ring-accent-500 scale-105' : ''} ${isOccupied ? `border-black/25 ${getWellTextColor(group.color, opacity)} shadow-xs` : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 bg-slate-50 dark:bg-slate-950 text-slate-400'}`}
                          >
                            {isLabelsMode ? (
                              <>
                                <div class="w-full text-center text-[8px] font-mono leading-none opacity-85">
                                  {wellId}
                                </div>
                                <div class="w-full text-center text-[9px] sm:text-[10px] leading-tight font-bold truncate px-0.5">
                                  {well?.sampleName || (isOccupied ? group.name : '—')}
                                </div>
                                <div class="w-full text-center text-[8px] font-mono leading-none opacity-90 truncate">
                                  {well?.value !== undefined ? `${formatWellConcentration(well.value)} ${well.unit || ''}` : ''}
                                </div>
                              </>
                            ) : (
                              isOccupied ? (dim.format <= 96 ? <span class={`${isCompact ? 'text-[8px]' : 'text-[10px]'} font-mono font-bold leading-none`}>{wellId}</span> : '') : ''
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Pipetting Scheme & Reagent Planner */
            <div class="space-y-4">
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3.5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Assigned Wells</span>
                  <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {pipettingPlan.totalAssignedWells}
                  </span>
                  <span class="text-[11px] text-slate-400 block">out of {totalWells} wells</span>
                </div>

                <div class="p-3.5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Total Diluent Buffer</span>
                  <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {(pipettingPlan.totalDiluentNeededUl / 1000).toFixed(2)} mL
                  </span>
                  <span class="text-[11px] text-slate-400 block">{pipettingPlan.workingVolumeUl} µL / well</span>
                </div>

                <div class="p-3.5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Stock Reagents</span>
                  <span class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                    {(pipettingPlan.totalStockNeededUl / 1000).toFixed(2)} mL
                  </span>
                  <span class="text-[11px] text-slate-400 block">concentrated stocks</span>
                </div>

                <div class="p-3.5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Pipette Type</span>
                  <select
                    value={s.pipetteType}
                    onChange={(e) => set({ pipetteType: (e.target as HTMLSelectElement).value as State['pipetteType'] })}
                    class="mt-1 w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-semibold"
                  >
                    <option value="single">Single Channel</option>
                    <option value="8-channel">8-Channel Multichannel</option>
                    <option value="12-channel">12-Channel Multichannel</option>
                  </select>
                </div>
              </div>

              {/* Reagent Requirement Breakdown Table */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Reagent &amp; Sample Requirements Breakdown
                  </h3>
                  <span class="text-xs text-slate-500">
                    Calculated for {pipettingPlan.workingVolumeUl} µL/well (+ {pipettingPlan.transferVolumeUl} µL transfer excess)
                  </span>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                        <th class="pb-2">Sample / Reagent</th>
                        <th class="pb-2">Role</th>
                        <th class="pb-2 text-center">Assigned Wells</th>
                        <th class="pb-2 text-right">Stock Solution Needed</th>
                        <th class="pb-2 text-right">Diluent / Buffer Needed</th>
                        <th class="pb-2 text-center">Loading Mode</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {pipettingPlan.reagentSummaries.map((item, i) => (
                        <tr key={i} class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td class="py-2.5 font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span>{item.sampleName}</span>
                          </td>
                          <td class="py-2.5 capitalize text-slate-500">{item.type}</td>
                          <td class="py-2.5 text-center font-mono">{item.wellCount} wells ({item.wells.slice(0, 4).join(', ')}{item.wells.length > 4 ? '…' : ''})</td>
                          <td class="py-2.5 text-right font-mono font-bold text-accent-600 dark:text-accent-400">
                            {item.stockVolumeNeededUl > 0 ? `${item.stockVolumeNeededUl >= 1000 ? `${(item.stockVolumeNeededUl / 1000).toFixed(2)} mL` : `${Math.round(item.stockVolumeNeededUl)} µL`}` : '—'}
                          </td>
                          <td class="py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {item.diluentVolumeNeededUl > 0 ? `${item.diluentVolumeNeededUl >= 1000 ? `${(item.diluentVolumeNeededUl / 1000).toFixed(2)} mL` : `${Math.round(item.diluentVolumeNeededUl)} µL`}` : '—'}
                          </td>
                          <td class="py-2.5 text-center">
                            <span class={`px-2 py-0.5 rounded text-[10px] font-bold ${item.isDilution ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                              {item.isDilution ? 'Serial Transfer' : 'Direct Add'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Step-by-Step Pipetting Guide */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Step-by-Step Pipetting Guide &amp; Checklist
                </h3>
                <div class="space-y-2">
                  {pipettingPlan.steps.map((step) => (
                    <div
                      key={step.stepNumber}
                      class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-start gap-3"
                    >
                      <span class="w-6 h-6 rounded-full bg-accent-600 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {step.stepNumber}
                      </span>
                      <div class="space-y-0.5 text-xs flex-1">
                        <div class="flex items-center justify-between">
                          <strong class="text-slate-900 dark:text-slate-100">{step.reagent}</strong>
                          <span class="mono text-slate-400">Pipette: {step.pipetteType}</span>
                        </div>
                        <p class="text-slate-600 dark:text-slate-400 leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
